from __future__ import annotations

import csv
import hashlib
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import (
    Athlete,
    DataUpload,
    GpsDaily,
    GpsSessionRaw,
    WorkloadFeaturesDaily,
)


class WorkloadIngestionError(Exception):
    """Raised when workload CSV ingestion fails."""


@dataclass
class WorkloadIngestionSummary:
    upload_id: int
    file_path: str
    rows_imported: int
    athletes: list[str]
    encoding: str
    duplicate_of: int | None = None
    skipped: bool = False

    def as_dict(self) -> dict:
        return {
            "upload_id": self.upload_id,
            "file_path": self.file_path,
            "rows_imported": self.rows_imported,
            "athletes": self.athletes,
            "encoding": self.encoding,
            "duplicate_of": self.duplicate_of,
            "skipped": self.skipped,
        }


def _resolve_csv_path(filename: str | Path) -> Path:
    csv_path = Path(filename)
    if csv_path.is_absolute():
        return csv_path
    data_root = getattr(settings, "TRAINING_DATA_DIR", settings.BASE_DIR / "data")
    return Path(data_root) / csv_path


def parse_date(value):
    if not value:
        return None

    value = str(value).strip()
    if not value:
        return None

    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass

    return None


def parse_date_any(value):
    return parse_date(value)


def to_float(value):
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def get_csv_reader_with_encoding(csv_path: Path, sample_size: int = 1024 * 256):
    sample = csv_path.open("rb").read(sample_size)

    encodings = [
        "utf-8-sig",
        "utf-8",
        "cp932",
        "shift_jis",
        "euc_jp",
        "latin-1",
    ]

    last_error = None

    for enc in encodings:
        try:
            sample.decode(enc, errors="strict")

            file_obj = csv_path.open(newline="", encoding=enc, errors="strict")
            reader = csv.DictReader(file_obj)
            return reader, file_obj, enc
        except Exception as exc:
            last_error = exc
            continue

    raise WorkloadIngestionError(
        f"Failed to detect CSV encoding. last_error={last_error}"
    )


def import_statsallgroup_csv(
    filename: str | Path,
    *,
    uploaded_by: str = "",
    allow_duplicate: bool = False,
) -> WorkloadIngestionSummary:
    csv_path = _resolve_csv_path(filename)

    if not csv_path.exists():
        raise WorkloadIngestionError(f"CSV not found: {csv_path}")

    file_hash = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    if not allow_duplicate:
        existing = (
            DataUpload.objects.filter(file_hash=file_hash, parse_status="success")
            .order_by("-id")
            .first()
        )
        if existing:
            return WorkloadIngestionSummary(
                upload_id=existing.id,
                file_path=str(csv_path),
                rows_imported=0,
                athletes=[],
                encoding="skipped",
                duplicate_of=existing.id,
                skipped=True,
            )

    upload = DataUpload.objects.create(
        source_filename=csv_path.name,
        file_hash=file_hash,
        uploaded_by=uploaded_by or "",
        parse_status="pending",
    )

    file_obj = None
    try:
        reader, file_obj, encoding = get_csv_reader_with_encoding(csv_path)
        raw_objects = []
        athletes_cache = {}

        for i, row in enumerate(reader, start=1):
            athlete_id = (
                row.get("athlete_id") or row.get("AthleteID") or row.get("player_id")
            )
            if not athlete_id:
                continue
            athlete_id = str(athlete_id).strip()
            if not athlete_id:
                continue

            athlete = athletes_cache.get(athlete_id)
            if athlete is None:
                athlete, _ = Athlete.objects.get_or_create(athlete_id=athlete_id)
                athletes_cache[athlete_id] = athlete

            date_value = row.get("date") or row.get("Date") or row.get("session_date")
            date = parse_date(date_value)
            session_name = row.get("session_name") or row.get("SessionName") or ""

            raw_objects.append(
                GpsSessionRaw(
                    upload=upload,
                    row_number=i,
                    athlete=athlete,
                    date=date,
                    session_name=session_name,
                    raw_payload=row,
                )
            )

        with transaction.atomic():
            if raw_objects:
                GpsSessionRaw.objects.bulk_create(raw_objects, batch_size=1000)

        upload.parse_status = "success"
        upload.save(update_fields=["parse_status"])

        return WorkloadIngestionSummary(
            upload_id=upload.id,
            file_path=str(csv_path),
            rows_imported=len(raw_objects),
            athletes=sorted(athletes_cache.keys()),
            encoding=encoding,
        )
    except Exception as exc:
        upload.parse_status = "failed"
        upload.error_log = str(exc)
        upload.save(update_fields=["parse_status", "error_log"])
        raise WorkloadIngestionError(str(exc)) from exc
    finally:
        if file_obj:
            file_obj.close()


def athlete_ids_for_upload(upload_id: int) -> list[str]:
    return list(
        GpsSessionRaw.objects.filter(upload_id=upload_id)
        .values_list("athlete_id", flat=True)
        .distinct()
    )


def detect_positions(
    *,
    athlete_ids: Iterable[str] | None = None,
    threshold: float = 100,
) -> dict:
    athlete_ids_list = list(athlete_ids) if athlete_ids else []

    qs = GpsDaily.objects.all()
    if athlete_ids_list:
        qs = qs.filter(athlete_id__in=athlete_ids_list)

    gk_stats = qs.values("athlete_id").annotate(total_dive=Sum("total_dive_load"))
    detected_gk_ids = {
        row["athlete_id"]
        for row in gk_stats
        if (row["total_dive"] or 0) > threshold
    }

    athletes = Athlete.objects.all()
    if athlete_ids_list:
        athletes = athletes.filter(athlete_id__in=athlete_ids_list)

    updates = []
    for athlete in athletes:
        current_pos = athlete.position
        new_pos = "GK" if athlete.athlete_id in detected_gk_ids else "FP"
        if current_pos != new_pos:
            athlete.position = new_pos
            athlete.save(update_fields=["position"])
            updates.append(
                {
                    "athlete_id": athlete.athlete_id,
                    "athlete_name": athlete.athlete_name,
                    "from": current_pos,
                    "to": new_pos,
                }
            )

    return {
        "detected_gk_ids": detected_gk_ids,
        "updates": updates,
    }


def rebuild_gps_daily(
    *,
    athlete_ids: Iterable[str] | None = None,
    delete_existing: bool = False,
) -> int:
    qs = GpsSessionRaw.objects.all()
    athlete_ids_list = list(athlete_ids) if athlete_ids else []
    if athlete_ids_list:
        qs = qs.filter(athlete_id__in=athlete_ids_list)

    grouped = defaultdict(list)
    for row in qs.iterator(chunk_size=2000):
        date_ = row.date
        if not date_:
            date_ = parse_date_any(
                row.raw_payload.get("date_")
                or row.raw_payload.get("date")
                or row.raw_payload.get("Date")
                or row.raw_payload.get("session_date")
            )
        if date_:
            grouped[(row.athlete_id, date_)].append(row)

    daily_objects = []
    now = timezone.now()

    needed_cols = [
        "total_distance",
        "total_player_load",
        "total_jumps",
        "velocity_band5_total_distance",
        "velocity_band6_total_distance",
        "ima_band2_left_count",
        "ima_band2_right_count",
        "total_dive_load_left",
        "total_dive_load_right",
        "total_dive_load_centre",
        "dive_left_count",
        "dive_right_count",
        "dive_centre_count",
    ]

    for (athlete_id, date_), rows in grouped.items():
        sums = defaultdict(float)
        for entry in rows:
            payload = entry.raw_payload
            for key in needed_cols:
                sums[key] += to_float(payload.get(key))

        hsr = sums["velocity_band5_total_distance"] + sums["velocity_band6_total_distance"]
        ima_l = sums["ima_band2_left_count"]
        ima_r = sums["ima_band2_right_count"]
        ima_total = ima_l + ima_r
        ima_asym = abs((ima_l - ima_r) / ima_total * 100) if ima_total > 10 else None

        dive_load = (
            sums["total_dive_load_left"]
            + sums["total_dive_load_right"]
            + sums["total_dive_load_centre"]
        )
        dive_l = sums["dive_left_count"]
        dive_r = sums["dive_right_count"]
        dive_total = dive_l + dive_r + sums["dive_centre_count"]
        dive_asym = abs((dive_l - dive_r) / dive_total * 100) if dive_total > 5 else None

        daily_objects.append(
            GpsDaily(
                athlete_id=athlete_id,
                date=date_,
                total_distance=sums["total_distance"],
                total_player_load=sums["total_player_load"],
                hsr_distance=hsr,
                ima_total=ima_total,
                ima_asymmetry=ima_asym,
                total_dive_load=dive_load,
                total_jumps=sums["total_jumps"],
                dive_asymmetry=dive_asym,
                metrics=dict(sums),
                updated_at=now,
            )
        )

    with transaction.atomic():
        if delete_existing:
            if athlete_ids_list:
                GpsDaily.objects.filter(athlete_id__in=athlete_ids_list).delete()
            else:
                GpsDaily.objects.all().delete()

        if daily_objects:
            GpsDaily.objects.bulk_create(
                daily_objects,
                batch_size=2000,
                update_conflicts=True,
                update_fields=[
                    "total_distance",
                    "total_player_load",
                    "hsr_distance",
                    "ima_total",
                    "ima_asymmetry",
                    "total_dive_load",
                    "total_jumps",
                    "dive_asymmetry",
                    "metrics",
                    "updated_at",
                ],
                unique_fields=["athlete", "date"],
            )

    return len(daily_objects)


def calc_acwr_series(series, acute=7, chronic=28):
    acute_load = series.rolling(window=acute, min_periods=1).mean()
    chronic_load = series.rolling(window=chronic, min_periods=1).mean()
    return np.where(chronic_load > 0, acute_load / chronic_load, 0)


def calc_monotony_series(series, window=7):
    r_mean = series.rolling(window=window).mean()
    r_std = series.rolling(window=window).std()
    return np.where(r_std > 0, r_mean / r_std, 0)


def rebuild_workload_features(*, athlete_ids: Iterable[str] | None = None) -> int:
    athlete_ids_list = list(athlete_ids) if athlete_ids else []
    qs = GpsDaily.objects.all().values(
        "athlete_id",
        "date",
        "total_distance",
        "total_player_load",
        "hsr_distance",
        "ima_asymmetry",
        "total_dive_load",
        "total_jumps",
        "dive_asymmetry",
    )
    if athlete_ids_list:
        qs = qs.filter(athlete_id__in=athlete_ids_list)

    df = pd.DataFrame(list(qs))

    with transaction.atomic():
        if athlete_ids_list:
            WorkloadFeaturesDaily.objects.filter(
                athlete_id__in=athlete_ids_list
            ).delete()
        else:
            WorkloadFeaturesDaily.objects.all().delete()

    if df.empty:
        return 0

    df["date"] = pd.to_datetime(df["date"])

    athlete_position_qs = Athlete.objects.all()
    if athlete_ids_list:
        athlete_position_qs = athlete_position_qs.filter(
            athlete_id__in=athlete_ids_list
        )
    athlete_positions = {a.athlete_id: a.position for a in athlete_position_qs}

    out_rows = []

    for athlete_id, group in df.groupby("athlete_id"):
        group = group.sort_values("date")

        full_idx = pd.date_range(
            start=group["date"].min(), end=group["date"].max(), freq="D"
        )
        group = (
            group.set_index("date")
            .reindex(full_idx, fill_value=0)
            .reset_index()
            .rename(columns={"index": "date"})
        )

        is_gk = athlete_positions.get(athlete_id, "FP") == "GK"

        acwr_dist = calc_acwr_series(group["total_distance"])
        monotony = calc_monotony_series(group["total_player_load"])

        acwr_hsr = np.zeros(len(group))
        acwr_dive = np.zeros(len(group))
        acwr_jump = np.zeros(len(group))
        asym_val = np.zeros(len(group))

        if is_gk:
            acwr_dive = calc_acwr_series(group["total_dive_load"])
            acwr_jump = calc_acwr_series(group["total_jumps"])
            asym_val = group["dive_asymmetry"].fillna(0).values
        else:
            acwr_hsr = calc_acwr_series(group["hsr_distance"])
            asym_val = group["ima_asymmetry"].fillna(0).values

        for i, row in group.iterrows():
            out_rows.append(
                WorkloadFeaturesDaily(
                    athlete_id=athlete_id,
                    date=row["date"].date(),
                    acwr_total_distance=acwr_dist[i],
                    acwr_hsr=acwr_hsr[i],
                    acwr_dive=acwr_dive[i],
                    acwr_jump=acwr_jump[i],
                    monotony_load=monotony[i],
                    val_asymmetry=asym_val[i],
                )
            )

    with transaction.atomic():
        if out_rows:
            WorkloadFeaturesDaily.objects.bulk_create(out_rows, batch_size=2000)

    return len(out_rows)
