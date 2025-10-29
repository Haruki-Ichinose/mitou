from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Iterable

import pandas as pd
from django.conf import settings
from django.db import transaction
from django.db.models import Min

from .models import DailyTrainingLoad

ACUTE_WINDOW_DAYS = 7
CHRONIC_WINDOW_DAYS = 28


class CSVIngestionError(Exception):
    """Raised when CSV ingestion fails due to invalid input or state."""


@dataclass
class IngestionSummary:
    file_path: str
    rows_read: int
    rows_valid: int
    players_processed: int
    days_processed: int
    created: int
    updated: int
    dry_run: bool
    excluded_athlete_ids: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            'file_path': self.file_path,
            'rows_read': self.rows_read,
            'rows_valid': self.rows_valid,
            'players_processed': self.players_processed,
            'days_processed': self.days_processed,
            'created': self.created,
            'updated': self.updated,
            'dry_run': self.dry_run,
            'excluded_athlete_ids': self.excluded_athlete_ids,
        }


REQUIRED_COLUMNS = ['date_', 'athlete_id', 'athlete_name', 'total_distance']


def _resolve_csv_path(filename: str) -> Path:
    csv_path = Path(filename)
    if csv_path.is_absolute():
        return csv_path

    data_root = getattr(settings, 'TRAINING_DATA_DIR', settings.BASE_DIR)
    return Path(data_root) / csv_path


def _load_and_prepare_dataframe(csv_path: Path) -> pd.DataFrame:
    try:
        df = pd.read_csv(csv_path, usecols=REQUIRED_COLUMNS, encoding='utf-8-sig')
    except ValueError as exc:
        raise CSVIngestionError(str(exc)) from exc

    df = df.rename(columns=lambda col: col.lstrip('\ufeff'))

    original_row_count = len(df)

    df['date_'] = pd.to_datetime(df['date_'], errors='coerce', dayfirst=True).dt.date
    df['athlete_id'] = (
        df['athlete_id']
        .astype(str)
        .str.strip()
    )
    df['athlete_name'] = (
        df['athlete_name']
        .astype(str)
        .str.strip()
    )
    df['total_distance'] = pd.to_numeric(df['total_distance'], errors='coerce')

    df = df.dropna(subset=['date_', 'athlete_id', 'athlete_name', 'total_distance'])
    df = df[(df['athlete_id'] != '') & (df['athlete_name'] != '')]

    name_variations = df.groupby('athlete_id')['athlete_name'].nunique()
    conflicting_ids = name_variations[name_variations > 1].index.tolist()
    if conflicting_ids:
        df = df[~df['athlete_id'].isin(conflicting_ids)]
    df.attrs['excluded_athlete_ids'] = conflicting_ids

    if df.empty:
        raise CSVIngestionError(
            'CSV does not contain any valid rows after cleaning.'
        )

    df['total_distance'] = df['total_distance'].astype(float)
    df.attrs['rows_read'] = original_row_count

    return df


def ingest_training_load_from_csv(filename: str, *, dry_run: bool = False) -> IngestionSummary:
    csv_path = _resolve_csv_path(filename)

    if not csv_path.exists():
        raise CSVIngestionError(f'CSV file not found: {csv_path}')

    df = _load_and_prepare_dataframe(csv_path)
    grouped = (
        df.groupby(['athlete_id', 'athlete_name', 'date_'])
        .agg(total_distance=('total_distance', 'sum'))
        .reset_index()
    )

    players_processed = grouped['athlete_id'].nunique()
    days_processed = len(grouped)

    existing_map = _fetch_existing_records(
        athlete_ids=grouped['athlete_id'].unique(),
        dates=grouped['date_'].unique(),
    )

    records = _build_load_records(grouped)

    created = sum(
        1 for record in records
        if (record.athlete_id, record.date) not in existing_map
    )
    updated = len(records) - created

    if not dry_run:
        _upsert_daily_training_loads(records)
        _recalculate_acwr()

    return IngestionSummary(
        file_path=str(csv_path),
        rows_read=df.attrs.get('rows_read', len(df)),
        rows_valid=len(df),
        players_processed=players_processed,
        days_processed=days_processed,
        created=created,
        updated=updated,
        dry_run=dry_run,
        excluded_athlete_ids=df.attrs.get('excluded_athlete_ids', []),
    )


def _fetch_existing_records(*, athlete_ids: Iterable[str], dates: Iterable) -> set[tuple[str, object]]:
    athlete_ids = list(athlete_ids)
    dates = list(dates)
    if len(athlete_ids) == 0 or len(dates) == 0:
        return set()

    queryset = DailyTrainingLoad.objects.filter(
        athlete_id__in=athlete_ids,
        date__in=dates,
    ).values_list('athlete_id', 'date')
    return {(athlete_id, date) for athlete_id, date in queryset}


def _build_load_records(grouped_df: pd.DataFrame) -> list[DailyTrainingLoad]:
    records: list[DailyTrainingLoad] = []
    for row in grouped_df.itertuples(index=False):
        records.append(
            DailyTrainingLoad(
                athlete_id=str(row.athlete_id),
                athlete_name=str(row.athlete_name),
                date=row.date_,
                total_distance=float(row.total_distance),
                acwr=None,
            )
        )
    return records


@transaction.atomic
def _upsert_daily_training_loads(records: list[DailyTrainingLoad]) -> None:
    if not records:
        return

    DailyTrainingLoad.objects.bulk_create(
        records,
        update_conflicts=True,
        update_fields=['athlete_name', 'total_distance', 'acwr'],
        unique_fields=['athlete_id', 'date'],
    )


def _recalculate_acwr() -> None:
    missing_entries = list(
        DailyTrainingLoad.objects.filter(acwr__isnull=True)
        .values('athlete_id')
        .annotate(first_missing_date=Min('date'))
    )
    if not missing_entries:
        return

    for entry in missing_entries:
        athlete_id = entry['athlete_id']
        first_missing_date = entry['first_missing_date']
        if first_missing_date is None:
            continue

        start_date = first_missing_date - timedelta(days=CHRONIC_WINDOW_DAYS - 1)

        queryset = DailyTrainingLoad.objects.filter(
            athlete_id=athlete_id,
            date__gte=start_date,
        ).order_by('date').only(
            'id', 'athlete_id', 'date', 'total_distance', 'acwr'
        )

        acute_window: deque[tuple] = deque()
        chronic_window: deque[tuple] = deque()
        acute_sum = 0.0
        chronic_sum = 0.0
        updates: list[DailyTrainingLoad] = []

        for load in queryset.iterator():
            acute_sum -= _prune_window(acute_window, load.date, ACUTE_WINDOW_DAYS)
            chronic_sum -= _prune_window(chronic_window, load.date, CHRONIC_WINDOW_DAYS)

            acute_window.append((load.date, load.total_distance))
            chronic_window.append((load.date, load.total_distance))
            acute_sum += load.total_distance
            chronic_sum += load.total_distance

            if load.date < first_missing_date:
                continue

            acute_avg = acute_sum / len(acute_window) if acute_window else None
            chronic_avg = chronic_sum / len(chronic_window) if chronic_window else None

            if chronic_avg in (None, 0):
                new_acwr = None
            else:
                new_acwr = acute_avg / chronic_avg if acute_avg is not None else None

            if load.acwr is None:
                load.acwr = new_acwr
                updates.append(load)

        if updates:
            DailyTrainingLoad.objects.bulk_update(updates, ['acwr'])


def _prune_window(window: deque[tuple], current_date, window_days: int) -> float:
    removed = 0.0
    while window and (current_date - window[0][0]).days >= window_days:
        _, distance = window.popleft()
        removed += distance
    return removed
