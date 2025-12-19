import csv
from datetime import date
from tempfile import NamedTemporaryFile
import uuid

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from .models import DailyMetric, ImportRun, StatsAllGroupDailyRaw


class StatsAllGroupImportTests(TestCase):
    def _write_csv(self, rows):
        temp_file = NamedTemporaryFile(mode='w', suffix='.csv', delete=False, newline='')
        writer = csv.DictWriter(temp_file, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        temp_file.flush()
        temp_file.close()
        return temp_file.name

    def test_import_creates_raw_and_metrics(self):
        athlete_id = uuid.uuid4()
        csv_path = self._write_csv(
            [
                {
                    'athlete_id': str(athlete_id),
                    'date_': '2024-01-01',
                    'total_distance': 10,
                    'total_player_load': 5,
                    'total_duration': 100,
                    'max_heart_rate': 150,
                    'mean_heart_rate': 100,
                },
                {
                    'athlete_id': str(athlete_id),
                    'date_': '2024-01-01',
                    'total_distance': 5,
                    'total_player_load': 2,
                    'total_duration': 50,
                    'max_heart_rate': 155,
                    'mean_heart_rate': 120,
                },
            ]
        )

        call_command(
            'import_statsallgroup',
            '--csv',
            csv_path,
            '--encoding',
            'utf-8',
            '--no-skip-if-imported',
        )

        raw = StatsAllGroupDailyRaw.objects.get()
        self.assertEqual(raw.athlete_id, athlete_id)
        self.assertEqual(raw.date, date(2024, 1, 1))
        self.assertEqual(raw.metrics['total_distance'], 15)
        self.assertEqual(raw.metrics['total_player_load'], 7)
        self.assertEqual(raw.metrics['total_duration'], 150)
        self.assertEqual(raw.metrics['max_heart_rate'], 155)
        self.assertEqual(raw.metrics['mean_heart_rate'], 110)

        self.assertEqual(DailyMetric.objects.count(), 5)
        metric_names = set(DailyMetric.objects.values_list('metric_name', flat=True))
        self.assertEqual(
            metric_names,
            {
                'total_distance',
                'total_player_load',
                'total_duration',
                'max_heart_rate',
                'mean_heart_rate',
            },
        )

    def test_import_is_idempotent(self):
        athlete_id = uuid.uuid4()
        csv_path = self._write_csv(
            [
                {
                    'athlete_id': str(athlete_id),
                    'date_': '2024-01-02',
                    'total_distance': 10,
                    'total_player_load': 3,
                    'total_duration': 80,
                    'max_heart_rate': 160,
                    'mean_heart_rate': 110,
                }
            ]
        )

        for _ in range(2):
            call_command(
                'import_statsallgroup',
                '--csv',
                csv_path,
                '--encoding',
                'utf-8',
                '--no-skip-if-imported',
            )

        self.assertEqual(StatsAllGroupDailyRaw.objects.count(), 1)
        self.assertEqual(DailyMetric.objects.count(), 5)

    def test_dry_run_does_not_write_rows(self):
        athlete_id = uuid.uuid4()
        csv_path = self._write_csv(
            [
                {
                    'athlete_id': str(athlete_id),
                    'date_': '2024-01-03',
                    'total_distance': 12,
                    'total_player_load': 4,
                    'total_duration': 90,
                    'max_heart_rate': 158,
                    'mean_heart_rate': 112,
                }
            ]
        )

        call_command(
            'import_statsallgroup',
            '--csv',
            csv_path,
            '--encoding',
            'utf-8',
            '--dry-run',
            '--no-skip-if-imported',
        )

        self.assertEqual(StatsAllGroupDailyRaw.objects.count(), 0)
        self.assertEqual(DailyMetric.objects.count(), 0)
        run = ImportRun.objects.get()
        self.assertEqual(run.status, 'SUCCESS')
        self.assertEqual(run.error_summary, {'dry_run': True})


class DailyMetricsApiTests(TestCase):
    def test_daily_metrics_grouped_response(self):
        athlete_id = uuid.uuid4()
        DailyMetric.objects.create(
            athlete_id=athlete_id,
            date=date(2024, 2, 1),
            metric_name='total_distance',
            value=10,
            meta={'source': 'StatsAllGroup'},
        )
        DailyMetric.objects.create(
            athlete_id=athlete_id,
            date=date(2024, 2, 1),
            metric_name='total_player_load',
            value=5,
            meta={'source': 'StatsAllGroup'},
        )
        DailyMetric.objects.create(
            athlete_id=athlete_id,
            date=date(2024, 2, 2),
            metric_name='total_distance',
            value=12,
            meta={'source': 'StatsAllGroup'},
        )

        client = APIClient()
        response = client.get('/api/daily-metrics/', {'athlete_id': str(athlete_id)})
        self.assertEqual(response.status_code, 200)

        payload = response.json()
        self.assertEqual(len(payload), 2)
        self.assertEqual(payload[0]['date'], '2024-02-01')
        self.assertIn('metrics', payload[0])
        self.assertEqual(payload[0]['metrics']['total_distance'], 10)
        self.assertEqual(payload[0]['metrics']['total_player_load'], 5)
