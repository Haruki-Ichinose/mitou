from __future__ import annotations

from datetime import date

from django.core.management.base import BaseCommand, CommandError

from api.services import CSVIngestionError, import_statsallgroup


class Command(BaseCommand):
    help = 'Import StatsAllGroup.csv into raw and derived tables.'

    def add_arguments(self, parser):
        parser.add_argument('--csv', required=True, help='Path to StatsAllGroup.csv')
        parser.add_argument('--encoding', default='cp932')
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--since')
        parser.add_argument('--until')
        parser.add_argument('--window-days', type=int, default=35)
        parser.add_argument('--skip-if-imported', dest='skip_if_imported', action='store_true')
        parser.add_argument('--no-skip-if-imported', dest='skip_if_imported', action='store_false')
        parser.set_defaults(skip_if_imported=True)

    def handle(self, *args, **options):
        since = self._parse_date(options.get('since'), 'since')
        until = self._parse_date(options.get('until'), 'until')
        try:
            summary = import_statsallgroup(
                options['csv'],
                encoding=options['encoding'],
                dry_run=options['dry_run'],
                since=since,
                until=until,
                window_days=options['window_days'],
                skip_if_imported=options['skip_if_imported'],
            )
        except CSVIngestionError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS(f'Import summary: {summary}'))

    @staticmethod
    def _parse_date(value: str | None, label: str) -> date | None:
        if not value:
            return None
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise CommandError(f'Invalid {label} date: {value}') from exc
