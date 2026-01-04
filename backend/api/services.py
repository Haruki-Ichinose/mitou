from __future__ import annotations

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
        val = float(value)
    except (TypeError, ValueError):
        return 0.0
    if np.isnan(val):
        return 0.0
    return val


def detect_csv_encoding(csv_path: Path, sample_size: int = 1024 * 256) -> str:
    with csv_path.open("rb") as handle:
        sample = handle.read(sample_size)

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
            return enc
        except Exception as exc:
            last_error = exc
            continue

    raise WorkloadIngestionError(
        f"Failed to detect CSV encoding. last_error={last_error}"
    )


def _resolve_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for col in candidates:
        if col in df.columns:
            return col
    return None


def _coerce_numeric(df: pd.DataFrame, columns: Iterable[str]) -> None:
    for col in columns:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")


def _collect_sum_columns(df: pd.DataFrame) -> list[str]:
    base_cols = [
        "total_duration",
        "total_distance",
        "total_player_load",
        "total_dive_count",
        "dive_right_count",
        "dive_left_count",
        "dive_centre_count",
        "total_dive_load",
        "total_dive_load_left",
        "total_dive_load_right",
        "total_dive_load_centre",
        "total_jumps",
        "high_decel_count",
        "ima_band3_decel_count",
        "total_time_to_feet",
    ]
    velocity_cols = [f"velocity_band{i}_total_distance" for i in range(1, 7)]
    dynamic_cols = []
    for col in df.columns:
        if col.startswith("ima_band2_") or col.startswith("ima_band3_"):
            dynamic_cols.append(col)
        elif col.startswith("total_time_to_feet_"):
            dynamic_cols.append(col)

    cols = []
    seen = set()
    for col in base_cols + velocity_cols + dynamic_cols:
        if col in df.columns and col not in seen:
            cols.append(col)
            seen.add(col)
    return cols


def _collect_aggregation_columns(df: pd.DataFrame) -> tuple[list[str], list[str], list[str]]:
    sum_cols = _collect_sum_columns(df)
    
    # max_cols に max_vel が入っているか確認
    max_cols = [col for col in ["max_vel", "Max Velocity"] if col in df.columns]
    
    # mean_cols に mean_heart_rate が入っているか確認
    mean_cols = [col for col in ["mean_heart_rate", "Avg HR"] if col in df.columns]
    
    return sum_cols, max_cols, mean_cols


def load_statsallgroup_dataframe(csv_path: Path) -> tuple[pd.DataFrame, str, list[str], list[str], list[str]]:
    encoding = detect_csv_encoding(csv_path)
    df = pd.read_csv(csv_path, encoding=encoding, dtype=str)
    df.columns = [str(col).strip() for col in df.columns]

    athlete_id_col = _resolve_column(df, ["athlete_id", "AthleteID", "player_id"])
    if not athlete_id_col:
        raise WorkloadIngestionError("Missing athlete_id column.")
    df["athlete_id"] = df[athlete_id_col].astype(str).str.strip().replace({"nan": ""})

    athlete_name_col = _resolve_column(df, ["athlete_name", "AthleteName", "player_name"])
    if athlete_name_col:
        df["athlete_name"] = df[athlete_name_col].astype(str).str.strip().replace({"nan": ""})
    else:
        df["athlete_name"] = ""

    date_col = _resolve_column(df, ["date_", "date", "Date", "session_date"])
    if not date_col:
        raise WorkloadIngestionError("Missing date column.")
    df["date_"] = pd.to_datetime(df[date_col], errors="coerce").dt.normalize()

    df = df[df["athlete_id"] != ""]
    df = df[df["date_"].notna()]

    sum_cols, max_cols, mean_cols = _collect_aggregation_columns(df)
    numeric_cols = set(sum_cols + max_cols + mean_cols)
    _coerce_numeric(df, numeric_cols)

    return df, encoding, sum_cols, max_cols, mean_cols


def aggregate_daily(
    df: pd.DataFrame,
    sum_cols: list[str],
    max_cols: list[str],
    mean_cols: list[str],
) -> pd.DataFrame:
    agg_map = {col: "sum" for col in sum_cols}
    agg_map.update({col: "max" for col in max_cols})
    agg_map.update({col: "mean" for col in mean_cols})

    group_cols = ["athlete_id", "date_"]
    name_df = (
        df.groupby(group_cols, dropna=False)["athlete_name"]
        .agg(_first_non_empty)
        .reset_index()
    )
    if not agg_map:
        agg_df = df[group_cols].drop_duplicates().reset_index(drop=True)
    else:
        agg_df = df.groupby(group_cols, dropna=False).agg(agg_map).reset_index()
    return agg_df.merge(name_df, on=group_cols, how="left")


def zero_pad_daily(df_daily: pd.DataFrame, sum_cols: list[str]) -> pd.DataFrame:
    if df_daily.empty:
        return df_daily

    min_date = df_daily["date_"].min()
    max_date = df_daily["date_"].max()
    all_dates = pd.DataFrame({"date_": pd.date_range(min_date, max_date, freq="D")})
    athletes = (
        df_daily.groupby("athlete_id", as_index=False)["athlete_name"]
        .agg(_first_non_empty)
    )

    base = all_dates.assign(key=1).merge(athletes.assign(key=1), on="key").drop("key", axis=1)
    daily_payload = df_daily.drop(columns=["athlete_name"], errors="ignore")
    merged = base.merge(
        daily_payload,
        on=["date_", "athlete_id"],
        how="left",
    )

    for col in sum_cols:
        if col in merged.columns:
            merged[col] = merged[col].fillna(0)

    return merged


def determine_positions(
    df_daily: pd.DataFrame,
    *,
    dive_threshold: float = 50,
    daily_dive_threshold: float = 3,
) -> tuple[pd.DataFrame, dict[str, str]]:
    df_daily = df_daily.copy()
    dive_cols = ["dive_right_count", "dive_left_count", "dive_centre_count"]
    for col in dive_cols:
        if col not in df_daily.columns:
            df_daily[col] = 0

    total_dives = df_daily[dive_cols].sum(axis=1)
    athlete_ids = df_daily["athlete_id"].dropna().unique().tolist()
    existing_positions = {
        athlete.athlete_id: (athlete.position if athlete.position in ("GK", "FP") else "FP")
        for athlete in Athlete.objects.filter(athlete_id__in=athlete_ids)
    }

    positions: dict[str, str] = {}
    if not Athlete.objects.exists():
        totals = total_dives.groupby(df_daily["athlete_id"]).sum()
        positions = {
            athlete_id: ("GK" if total >= dive_threshold else "FP")
            for athlete_id, total in totals.items()
        }
    else:
        positions.update(existing_positions)
        daily_max = total_dives.groupby(df_daily["athlete_id"]).max()
        for athlete_id in athlete_ids:
            if athlete_id in positions:
                continue
            day_total = daily_max.get(athlete_id, 0)
            positions[athlete_id] = "GK" if day_total > daily_dive_threshold else "FP"

    df_daily["position"] = df_daily["athlete_id"].map(positions).fillna("FP")
    return df_daily, positions


def _safe_json_value(value):
    if value is None:
        return None
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if isinstance(value, float) and np.isnan(value):
        return None
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    return value


def _first_non_empty(values) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text and text.lower() != "nan":
            return text
    return ""


def _ingest_raw_rows(
    df_raw: pd.DataFrame,
    *,
    upload: DataUpload,
    athlete_map: dict[str, Athlete],
) -> int:
    if df_raw.empty:
        return 0

    session_name_col = _resolve_column(df_raw, ["session_name", "SessionName"])
    columns = list(df_raw.columns)
    total = 0
    batch = []

    for i, values in enumerate(df_raw.itertuples(index=False, name=None), start=1):
        row = dict(zip(columns, values))
        athlete_id = str(row.get("athlete_id", "")).strip()
        if not athlete_id:
            continue
        athlete = athlete_map.get(athlete_id)
        if athlete is None:
            continue

        date_value = row.get("date_")
        if isinstance(date_value, pd.Timestamp):
            date_value = date_value.date()

        session_name = ""
        if session_name_col:
            session_name = row.get(session_name_col) or ""
            if isinstance(session_name, float) and np.isnan(session_name):
                session_name = ""
            session_name = str(session_name)

        payload = {col: _safe_json_value(row.get(col)) for col in columns}
        batch.append(
            GpsSessionRaw(
                upload=upload,
                row_number=i,
                athlete=athlete,
                date=date_value,
                session_name=session_name,
                raw_payload=payload,
            )
        )

        if len(batch) >= 1000:
            GpsSessionRaw.objects.bulk_create(batch, batch_size=1000)
            total += len(batch)
            batch = []

    if batch:
        GpsSessionRaw.objects.bulk_create(batch, batch_size=1000)
        total += len(batch)

    return total


def _ingest_daily_rows(
    df_daily: pd.DataFrame,
    *,
    athlete_map: dict[str, Athlete],
    sum_cols: list[str],
    max_cols: list[str],
    mean_cols: list[str],
) -> int:
    if df_daily.empty:
        return 0

    metric_cols = [col for col in sum_cols + max_cols + mean_cols if col in df_daily.columns]
    columns = list(df_daily.columns)
    time_to_feet_cols = [col for col in columns if col.startswith("total_time_to_feet_")]
    total = 0
    batch = []

    for values in df_daily.itertuples(index=False, name=None):
        row = dict(zip(columns, values))
        athlete_id = str(row.get("athlete_id", "")).strip()
        athlete = athlete_map.get(athlete_id)
        if athlete is None:
            continue

        date_value = row.get("date_")
        if isinstance(date_value, pd.Timestamp):
            date_value = date_value.date()

        total_duration = to_float(row.get("total_duration"))
        total_distance = to_float(row.get("total_distance"))
        total_player_load = to_float(row.get("total_player_load"))
        max_vel = safe_number(row.get("max_vel"))
        if max_vel is None:
            max_vel = safe_number(row.get("Max Velocity")) or 0.0

        mean_heart_rate = safe_number(row.get("mean_heart_rate"))
        if mean_heart_rate is None:
            mean_heart_rate = safe_number(row.get("Avg HR"))

        band5 = to_float(row.get("velocity_band5_total_distance"))
        band6 = to_float(row.get("velocity_band6_total_distance"))
        hsr_distance = band5 + band6

        dive_left = to_float(row.get("dive_left_count"))
        dive_right = to_float(row.get("dive_right_count"))
        dive_centre = to_float(row.get("dive_centre_count"))
        total_dive_count = safe_number(row.get("total_dive_count"))
        if total_dive_count is None:
            total_dive_count = dive_left + dive_right + dive_centre
        total_dive_count = int(total_dive_count)

        high_decel_count = safe_number(row.get("high_decel_count"))
        if high_decel_count is None:
            high_decel_count = (
                to_float(row.get("ima_band2_decel_count"))
                + to_float(row.get("ima_band3_decel_count"))
            )
        high_decel_count = int(high_decel_count)

        total_time_to_feet = to_float(row.get("total_time_to_feet"))
        if total_time_to_feet == 0 and time_to_feet_cols:
            total_time_to_feet = sum(
                to_float(row.get(col)) for col in time_to_feet_cols
            )
        avg_time_to_feet = (
            total_time_to_feet / total_dive_count
            if total_dive_count > 0
            else None
        )

        total_jumps = to_float(row.get("total_jumps"))

        metrics = {col: _safe_json_value(row.get(col)) for col in metric_cols}

        batch.append(
            GpsDaily(
                athlete=athlete,
                date=date_value,
                total_duration=total_duration,
                total_distance=total_distance,
                total_player_load=total_player_load,
                max_vel=max_vel,
                mean_heart_rate=mean_heart_rate,
                hsr_distance=hsr_distance,
                high_decel_count=high_decel_count,
                total_dive_count=total_dive_count,
                avg_time_to_feet=avg_time_to_feet,
                total_jumps=total_jumps,
                metrics=metrics,
            )
        )

        if len(batch) >= 2000:
            GpsDaily.objects.bulk_create(
                batch,
                batch_size=2000,
                update_conflicts=True,
                update_fields=[
                    "total_duration",
                    "total_distance",
                    "total_player_load",
                    "max_vel",
                    "mean_heart_rate",
                    "hsr_distance",
                    "high_decel_count",
                    "total_dive_count",
                    "avg_time_to_feet",
                    "total_jumps",
                    "metrics",
                ],
                unique_fields=["athlete", "date"],
            )
            total += len(batch)
            batch = []

    if batch:
        GpsDaily.objects.bulk_create(
            batch,
            batch_size=2000,
            update_conflicts=True,
            update_fields=[
                "total_duration",
                "total_distance",
                "total_player_load",
                "max_vel",
                "mean_heart_rate",
                "hsr_distance",
                "high_decel_count",
                "total_dive_count",
                "avg_time_to_feet",
                "total_jumps",
                "metrics",
            ],
            unique_fields=["athlete", "date"],
        )
        total += len(batch)

    return total


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

    try:
        df_raw, encoding, sum_cols, max_cols, mean_cols = load_statsallgroup_dataframe(csv_path)
        rows_imported = len(df_raw)

        df_daily = aggregate_daily(df_raw, sum_cols, max_cols, mean_cols)
        df_daily = zero_pad_daily(df_daily, sum_cols)
        df_daily, positions = determine_positions(
            df_daily,
            dive_threshold=50,
            daily_dive_threshold=3,
        )

        athletes = (
            df_daily.groupby("athlete_id", as_index=False)["athlete_name"]
            .agg(_first_non_empty)
            .sort_values("athlete_id")
        )

        athlete_map = {}
        with transaction.atomic():
            for _, row in athletes.iterrows():
                athlete_id = str(row["athlete_id"]).strip()
                if not athlete_id:
                    continue
                athlete_name = str(row.get("athlete_name") or "").strip()
                defaults = {
                    "is_active": True,
                    "position": positions.get(athlete_id, "FP"),
                }
                if athlete_name:
                    defaults["athlete_name"] = athlete_name
                athlete, _ = Athlete.objects.update_or_create(
                    athlete_id=athlete_id,
                    defaults=defaults,
                )
                athlete_map[athlete_id] = athlete

            _ingest_raw_rows(df_raw, upload=upload, athlete_map=athlete_map)
            _ingest_daily_rows(
                df_daily,
                athlete_map=athlete_map,
                sum_cols=sum_cols,
                max_cols=max_cols,
                mean_cols=mean_cols,
            )

        upload.parse_status = "success"
        upload.save(update_fields=["parse_status"])

        return WorkloadIngestionSummary(
            upload_id=upload.id,
            file_path=str(csv_path),
            rows_imported=rows_imported,
            athletes=sorted(athlete_map.keys()),
            encoding=encoding,
        )
    except Exception as exc:
        upload.parse_status = "failed"
        upload.error_log = str(exc)
        upload.save(update_fields=["parse_status", "error_log"])
        raise WorkloadIngestionError(str(exc)) from exc


def run_gps_pipeline(
    filename: str | Path,
    *,
    uploaded_by: str = "",
    allow_duplicate: bool = False,
) -> tuple[WorkloadIngestionSummary, int]:
    summary = import_statsallgroup_csv(
        filename,
        uploaded_by=uploaded_by,
        allow_duplicate=allow_duplicate,
    )
    if summary.skipped:
        return summary, 0
    features = rebuild_workload_features(athlete_ids=summary.athletes)
    return summary, features


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

    gk_stats = qs.values("athlete_id").annotate(total_dive=Sum("total_dive_count"))
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

    needed_cols = [
        "total_duration",
        "total_distance",
        "total_player_load",
        "total_jumps",
        "max_vel",
        "mean_heart_rate",
        "velocity_band5_total_distance",
        "velocity_band6_total_distance",
        "high_decel_count",
        "ima_band2_decel_count",
        "ima_band3_decel_count",
        "total_time_to_feet",
        "dive_left_count",
        "dive_right_count",
        "dive_centre_count",
    ]

    for (athlete_id, date_), rows in grouped.items():
        sums = defaultdict(float)
        max_vel = 0.0
        hr_values: list[float] = []
        total_time_to_feet = 0.0
        for entry in rows:
            payload = entry.raw_payload
            max_vel = max(
                max_vel,
                to_float(payload.get("max_vel") or payload.get("Max Velocity")),
            )
            hr_value = safe_number(payload.get("mean_heart_rate") or payload.get("Avg HR"))
            if hr_value is not None:
                hr_values.append(hr_value)

            total_time_to_feet += to_float(payload.get("total_time_to_feet"))
            for key, value in payload.items():
                if str(key).startswith("total_time_to_feet_"):
                    total_time_to_feet += to_float(value)

            for key in needed_cols:
                sums[key] += to_float(payload.get(key))

        hsr = sums["velocity_band5_total_distance"] + sums["velocity_band6_total_distance"]
        mean_heart_rate = sum(hr_values) / len(hr_values) if hr_values else None
        high_decel_count = sums["high_decel_count"]
        if high_decel_count == 0:
            high_decel_count = sums["ima_band2_decel_count"] + sums["ima_band3_decel_count"]

        dive_l = sums["dive_left_count"]
        dive_r = sums["dive_right_count"]
        dive_total = dive_l + dive_r + sums["dive_centre_count"]
        avg_time_to_feet = total_time_to_feet / dive_total if dive_total > 0 else None

        daily_objects.append(
            GpsDaily(
                athlete_id=athlete_id,
                date=date_,
                total_duration=sums["total_duration"],
                total_distance=sums["total_distance"],
                total_player_load=sums["total_player_load"],
                max_vel=max_vel,
                mean_heart_rate=mean_heart_rate,
                hsr_distance=hsr,
                high_decel_count=int(high_decel_count),
                total_dive_count=int(dive_total),
                avg_time_to_feet=avg_time_to_feet,
                total_jumps=sums["total_jumps"],
                metrics=dict(sums),
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
                    "total_duration",
                    "total_distance",
                    "total_player_load",
                    "max_vel",
                    "mean_heart_rate",
                    "hsr_distance",
                    "high_decel_count",
                    "total_dive_count",
                    "avg_time_to_feet",
                    "total_jumps",
                    "metrics",
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


def classify_fp(
    acwr_dist: float | None,
    acwr_hsr: float | None,
    monotony: float | None,
    efficiency: float | None = None,  # [追加]
) -> tuple[str, list[str]]:
    reasons = []
    level = "safety"

    # 1. 怪我リスク (HSRの急増)
    if acwr_hsr and acwr_hsr > 1.5:
        level = "risky"
        reasons.append(f"HSR ACWR High ({acwr_hsr:.2f})")
    elif acwr_hsr and acwr_hsr > 1.3:
        if level == "safety": level = "caution"
        reasons.append(f"HSR ACWR Elevated ({acwr_hsr:.2f})")

    # 2. コンディション (心拍効率)
    # 値が低い＝同じ動きでも心拍が高い＝疲労/不調
    # ※閾値 (0.5) はチームのデータを見て調整してください
    if efficiency and efficiency < 0.5:
        if level != "risky": level = "caution"
        reasons.append(f"Low Efficiency ({efficiency:.2f})")

    # 3. オーバーワーク (単調性)
    if monotony and monotony > 2.5:
        if level == "safety": level = "caution"
        reasons.append(f"High Monotony ({monotony:.2f})")

    # 4. 距離ACWR (補助)
    if acwr_dist and acwr_dist > 1.5:
        if level == "safety": level = "caution"
        reasons.append(f"Distance ACWR High ({acwr_dist:.2f})")

    return level, reasons


def classify_gk(
    acwr_dive: float | None,
    asymmetry: float | None,
    monotony: float | None,
    time_to_feet: float | None = None,  # [追加]
) -> tuple[str, list[str]]:
    reasons = []
    level = "safety"

    # 1. コンディション (キレ・反応速度)
    # 2.0秒を超えると明らかに遅い＝疲労
    if time_to_feet and time_to_feet > 2.0:
        level = "risky"
        reasons.append(f"Slow Recovery Time ({time_to_feet:.2f}s)")
    elif time_to_feet and time_to_feet > 1.5:
        if level == "safety": level = "caution"
        reasons.append(f"Recovery Time Elevated ({time_to_feet:.2f}s)")

    # 2. 怪我リスク (ダイブ負荷急増)
    if acwr_dive and acwr_dive > 1.5:
        level = "risky"
        reasons.append(f"Dive ACWR High ({acwr_dive:.2f})")

    # 3. 左右差 (バランス)
    if asymmetry and asymmetry > 0.4:
        if level == "safety": level = "caution"
        reasons.append(f"High Asymmetry ({asymmetry:.2f})")
    
    # 4. 単調性
    if monotony and monotony > 2.5:
        if level == "safety": level = "caution"
        reasons.append(f"High Monotony ({monotony:.2f})")

    return level, reasons


def rebuild_workload_features(*, athlete_ids: Iterable[str] | None = None) -> int:
    athlete_ids_list = list(athlete_ids) if athlete_ids else []
    qs = GpsDaily.objects.all().values(
        "athlete_id",
        "date",
        "total_duration",
        "total_distance",
        "total_player_load",
        "max_vel",
        "mean_heart_rate",
        "hsr_distance",
        "high_decel_count",
        "total_dive_count",
        "avg_time_to_feet",
        "total_jumps",
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
        total_dive_count = group["total_dive_count"].fillna(0).astype(float)
        avg_time_to_feet = group["avg_time_to_feet"].astype(float)
        mean_heart_rate = group["mean_heart_rate"].astype(float)
        high_decel_count = group["high_decel_count"].fillna(0).astype(float)
        total_jumps = group["total_jumps"].fillna(0).astype(float)

        metrics_series = group["metrics"].apply(lambda m: m or {})
        decel_count = high_decel_count
        ima_left = metrics_series.apply(lambda m: to_float(m.get("ima_band2_left_count")))
        ima_right = metrics_series.apply(lambda m: to_float(m.get("ima_band2_right_count")))
        dive_left = metrics_series.apply(lambda m: to_float(m.get("dive_left_count")))
        dive_right = metrics_series.apply(lambda m: to_float(m.get("dive_right_count")))
        dive_centre = metrics_series.apply(lambda m: to_float(m.get("dive_centre_count")))

        _, _, acwr_load = calc_acwr_ewma(total_player_load)
        monotony = calc_monotony_series(total_player_load)

        acwr_hsr = np.full(len(group), np.nan)
        acwr_dive = np.full(len(group), np.nan)
        asym_val = np.zeros(len(group))
        decel_density = np.zeros(len(group))
        load_per_meter = np.zeros(len(group))
        efficiency = np.full(len(group), np.nan)

        dist_safe = np.maximum(total_distance.values, EPS)
        dist_km = dist_safe / 1000.0
        decel_density = np.where(dist_safe < MIN_DIST_FOR_DECEL_DENSITY, 0.0, decel_count.values / np.maximum(dist_km, EPS))
        load_per_meter = np.where(
            dist_safe < MIN_DIST_FOR_MECH_EFF, np.nan, total_player_load.values / dist_safe
        )
        efficiency = np.where(
            mean_heart_rate.values > 0, total_player_load.values / mean_heart_rate.values, np.nan
        )

        if is_gk:
            _, _, acwr_dive = calc_acwr_ewma(total_dive_count)
            total_dives = dive_left + dive_right + dive_centre
            asym_val = calc_asymmetry_series(dive_left, dive_right)
            # if no dives, treat asym=0
            asym_val = np.where(total_dives.values <= 0, 0.0, asym_val)
        else:
            _, _, acwr_hsr = calc_acwr_ewma(hsr_distance)
            asym_val = calc_asymmetry_series(ima_left, ima_right)
            acwr_dive = np.full(len(group), np.nan)

        for i, row in group.iterrows():
            acwr_load_v = safe_number(acwr_load[i])
            acwr_hsr_v = safe_number(acwr_hsr[i])
            acwr_dive_v = safe_number(acwr_dive[i])
            monotony_v = safe_number(monotony[i])
            asym_v = safe_number(asym_val[i])
            lpm_v = safe_number(load_per_meter[i])
            decel_density_v = safe_number(decel_density[i])
            efficiency_v = safe_number(efficiency[i])
            time_to_feet_v = safe_number(avg_time_to_feet.iat[i])

            if is_gk:
                risk_level, risk_reasons = classify_gk(
                    acwr_dive_v,
                    asym_v,
                    monotony_v,
                    time_to_feet=time_to_feet_v,
                )
            else:
                risk_level, risk_reasons = classify_fp(
                    acwr_load_v,
                    acwr_hsr_v,
                    monotony_v,
                    efficiency=efficiency_v,
                )

            out_rows.append(
                WorkloadFeaturesDaily(
                    athlete_id=athlete_id,
                    date=row["date"].date(),
                    acwr_load=acwr_load_v,
                    acwr_hsr=acwr_hsr_v,
                    acwr_dive=acwr_dive_v,
                    efficiency_index=efficiency_v,
                    monotony_load=monotony_v,
                    load_per_meter=lpm_v,
                    risk_level=risk_level,
                    risk_reasons=risk_reasons,
                    params={
                        "val_asymmetry": asym_v,
                        "decel_density": decel_density_v,
                        "time_to_feet": time_to_feet_v,
                    },
                )
            )

    with transaction.atomic():
        if out_rows:
            WorkloadFeaturesDaily.objects.bulk_create(out_rows, batch_size=2000)

    return len(out_rows)
