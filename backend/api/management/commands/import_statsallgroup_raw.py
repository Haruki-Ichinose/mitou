from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from api.services import WorkloadIngestionError, import_statsallgroup_csv



class Command(BaseCommand):
    help = "Import StatsAllGroup CSV and store rows as raw GPS sessions"

    def add_arguments(self, parser):
        parser.add_argument(
            "--csv",
            type=str,
            required=True,
            help="Path to StatsAllGroup CSV file",
        )
        parser.add_argument(
            "--user",
            type=str,
            default="",
            help="Uploaded by (optional)",
        )
        parser.add_argument(
            "--allow-duplicate",
            action="store_true",
            help="Allow importing the same file hash again",
        )

    def handle(self, *args, **options):
        csv_path = Path(options["csv"])

        if not csv_path.exists():
            raise CommandError(f"CSV not found: {csv_path}")
        try:
            summary = import_statsallgroup_csv(
                csv_path,
                uploaded_by=options["user"],
                allow_duplicate=options["allow_duplicate"],
            )
        except WorkloadIngestionError as exc:
            raise CommandError(str(exc)) from exc

        if summary.skipped:
            self.stdout.write(
                self.style.WARNING(
                    f"Duplicate CSV detected (upload id={summary.duplicate_of}). Skipping import."
                )
            )
            return

        self.stdout.write(self.style.NOTICE(f"Upload created: id={summary.upload_id}"))
        self.stdout.write(self.style.NOTICE(f"CSV encoding detected: {summary.encoding}"))
        self.stdout.write(
            self.style.SUCCESS(
                f"Imported {summary.rows_imported} rows into gps_sessions_raw"
            )
        )
