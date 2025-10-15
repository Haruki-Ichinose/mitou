from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd
from django.conf import settings
from django.db import transaction

from .models import DailyTrainingLoad


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
        }


REQUIRED_COLUMNS = ['date_', 'athlete_id', 'total_distance']


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
    df['total_distance'] = pd.to_numeric(df['total_distance'], errors='coerce')

    df = df.dropna(subset=['date_', 'athlete_id', 'total_distance'])
    df = df[df['athlete_id'] != '']

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
        df.groupby(['athlete_id', 'date_'])
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

    return IngestionSummary(
        file_path=str(csv_path),
        rows_read=df.attrs.get('rows_read', len(df)),
        rows_valid=len(df),
        players_processed=players_processed,
        days_processed=days_processed,
        created=created,
        updated=updated,
        dry_run=dry_run,
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
        update_fields=['total_distance', 'acwr'],
        unique_fields=['athlete_id', 'date'],
    )
