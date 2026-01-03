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

ACWR_ALPHA_ACUTE = 2 / (7 + 1)    # EWMA近似で7日急性
ACWR_ALPHA_CHRONIC = 2 / (28 + 1)  # EWMA近似で28日慢性
ACWR_FLOOR = 1e-3
ACWR_BASELINE_FLOOR_RATIO = 0.3
MONOTONY_WINDOW = 7
EPS = 1e-6
MIN_DIST_FOR_DECEL_DENSITY = 100  # meters
MIN_DIST_FOR_MECH_EFF = 500       # meters


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
    threshold: float = 50,
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
        "ima_band2_decel_count",
        "ima_band2_left_count",
        "ima_band2_right_count",
        "ima_band3_decel_count",
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
        ima_asym = abs(ima_l - ima_r) / max(ima_total, EPS) if ima_total > 10 else None

        dive_load = (
            sums["total_dive_load_left"]
            + sums["total_dive_load_right"]
            + sums["total_dive_load_centre"]
        )
        dive_l = sums["dive_left_count"]
        dive_r = sums["dive_right_count"]
        dive_total = dive_l + dive_r + sums["dive_centre_count"]
        dive_asym = abs(dive_l - dive_r) / max(dive_total, EPS) if dive_total > 5 else None

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


def calc_acwr_ewma(series, alpha_fast=ACWR_ALPHA_ACUTE, alpha_slow=ACWR_ALPHA_CHRONIC):
    acute = series.ewm(alpha=alpha_fast, adjust=False).mean()
    chronic_raw = series.ewm(alpha=alpha_slow, adjust=False).mean()
    baseline = series.mean()
    floor = max(baseline * ACWR_BASELINE_FLOOR_RATIO, ACWR_FLOOR)
    chronic = np.maximum(chronic_raw, floor)
    ratio = acute / chronic
    return acute.values, chronic.values, ratio.values


def calc_monotony_series(series, window=MONOTONY_WINDOW):
    r_mean = series.rolling(window=window, min_periods=1).mean()
    r_std = series.rolling(window=window, min_periods=1).std().fillna(0)
    denom = np.maximum(r_std, EPS)
    return (r_mean / denom).fillna(0).values


def calc_asymmetry_series(left, right):
    left_arr = np.array(left, dtype=float)
    right_arr = np.array(right, dtype=float)
    return np.abs(left_arr - right_arr) / np.maximum(left_arr + right_arr, EPS)


def safe_number(value: float | int | None):
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if np.isfinite(v) else None


def classify_fp(acwr_dist, acwr_hsr, monotony):
    reasons = []
    level = "safety"

    if (acwr_dist and acwr_dist > 1.5) or (acwr_hsr and acwr_hsr > 1.5) or (monotony and monotony > 2.5):
        level = "caution"
        if acwr_dist and acwr_dist > 1.5:
            reasons.append("ACWR_Dist>1.5")
        if acwr_hsr and acwr_hsr > 1.5:
            reasons.append("ACWR_HSR>1.5")
        if monotony and monotony > 2.5:
            reasons.append("Monotony>2.5")
        return level, reasons

    if (
        (acwr_dist and 1.3 <= acwr_dist <= 1.5)
        or (acwr_hsr and 1.3 <= acwr_hsr <= 1.5)
        or (acwr_dist and acwr_dist < 0.8)
        or (monotony and monotony > 2.0)
    ):
        level = "risky"
        if acwr_dist and 1.3 <= acwr_dist <= 1.5:
            reasons.append("ACWR_Dist_1.3-1.5")
        if acwr_hsr and 1.3 <= acwr_hsr <= 1.5:
            reasons.append("ACWR_HSR_1.3-1.5")
        if acwr_dist and acwr_dist < 0.8:
            reasons.append("ACWR_Dist<0.8")
        if monotony and monotony > 2.0:
            reasons.append("Monotony>2.0")

    return level, reasons


def classify_gk(acwr_dive, asym, monotony):
    reasons = []
    level = "safety"

    if (acwr_dive and acwr_dive > 1.5) or (asym and asym > 0.4):
        level = "caution"
        if acwr_dive and acwr_dive > 1.5:
            reasons.append("ACWR_Dive>1.5")
        if asym and asym > 0.4:
            reasons.append("Asym>0.4")
        return level, reasons

    if (acwr_dive and 1.3 <= acwr_dive <= 1.5) or (asym and 0.2 <= asym <= 0.4) or (monotony and monotony > 2.0):
        level = "risky"
        if acwr_dive and 1.3 <= acwr_dive <= 1.5:
            reasons.append("ACWR_Dive_1.3-1.5")
        if asym and 0.2 <= asym <= 0.4:
            reasons.append("Asym_0.2-0.4")
        if monotony and monotony > 2.0:
            reasons.append("Monotony>2.0")

    return level, reasons


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
        "metrics",
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
        group["metrics"] = group["metrics"].apply(lambda m: m if isinstance(m, dict) else {})

        is_gk = athlete_positions.get(athlete_id, "FP") == "GK"

        total_distance = group["total_distance"].fillna(0).astype(float)
        total_player_load = group["total_player_load"].fillna(0).astype(float)
        hsr_distance = group["hsr_distance"].fillna(0).astype(float)
        total_dive_load = group["total_dive_load"].fillna(0).astype(float)
        total_jumps = group["total_jumps"].fillna(0).astype(float)

        metrics_series = group["metrics"].apply(lambda m: m or {})
        decel_count = metrics_series.apply(
            lambda m: to_float(m.get("ima_band2_decel_count")) + to_float(m.get("ima_band3_decel_count"))
        )
        ima_left = metrics_series.apply(lambda m: to_float(m.get("ima_band2_left_count")))
        ima_right = metrics_series.apply(lambda m: to_float(m.get("ima_band2_right_count")))
        dive_left = metrics_series.apply(lambda m: to_float(m.get("dive_left_count")))
        dive_right = metrics_series.apply(lambda m: to_float(m.get("dive_right_count")))
        dive_centre = metrics_series.apply(lambda m: to_float(m.get("dive_centre_count")))

        _, _, acwr_dist = calc_acwr_ewma(total_distance)
        monotony = calc_monotony_series(total_player_load)

        acwr_hsr = np.full(len(group), np.nan)
        acwr_dive = np.full(len(group), np.nan)
        acwr_jump = np.full(len(group), np.nan)
        asym_val = np.zeros(len(group))
        decel_density = np.zeros(len(group))
        load_per_meter = np.zeros(len(group))

        dist_safe = np.maximum(total_distance.values, EPS)
        dist_km = dist_safe / 1000.0
        decel_density = np.where(dist_safe < MIN_DIST_FOR_DECEL_DENSITY, 0.0, decel_count.values / np.maximum(dist_km, EPS))
        load_per_meter = np.where(
            dist_safe < MIN_DIST_FOR_MECH_EFF, np.nan, total_player_load.values / dist_safe
        )

        if is_gk:
            _, _, acwr_dive = calc_acwr_ewma(total_dive_load)
            acwr_jump = np.full(len(group), np.nan)
            total_dives = dive_left + dive_right + dive_centre
            asym_val = calc_asymmetry_series(dive_left, dive_right)
            # if no dives, treat asym=0
            asym_val = np.where(total_dives.values <= 0, 0.0, asym_val)
        else:
            _, _, acwr_hsr = calc_acwr_ewma(hsr_distance)
            asym_val = calc_asymmetry_series(ima_left, ima_right)
            acwr_dive = np.full(len(group), np.nan)

        for i, row in group.iterrows():
            acwr_dist_v = safe_number(acwr_dist[i])
            acwr_hsr_v = safe_number(acwr_hsr[i])
            acwr_dive_v = safe_number(acwr_dive[i])
            acwr_jump_v = safe_number(acwr_jump[i])
            monotony_v = safe_number(monotony[i])
            asym_v = safe_number(asym_val[i])
            lpm_v = safe_number(load_per_meter[i])
            decel_density_v = safe_number(decel_density[i])

            if is_gk:
                risk_level, risk_reasons = classify_gk(acwr_dive_v, asym_v, monotony_v)
            else:
                risk_level, risk_reasons = classify_fp(acwr_dist_v, acwr_hsr_v, monotony_v)

            out_rows.append(
                WorkloadFeaturesDaily(
                    athlete_id=athlete_id,
                    date=row["date"].date(),
                    acwr_total_distance=acwr_dist_v,
                    acwr_hsr=acwr_hsr_v,
                    acwr_dive=acwr_dive_v,
                    acwr_jump=acwr_jump_v,
                    monotony_load=monotony_v,
                    val_asymmetry=asym_v,
                    load_per_meter=lpm_v,
                    decel_density=decel_density_v,
                    risk_level=risk_level,
                    risk_reasons=risk_reasons,
                )
            )

    with transaction.atomic():
        if out_rows:
            WorkloadFeaturesDaily.objects.bulk_create(out_rows, batch_size=2000)

    return len(out_rows)
