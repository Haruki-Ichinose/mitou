from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.services import WorkloadIngestionError, run_gps_pipeline


class Command(BaseCommand):
    help = "Ingest GPS CSV and rebuild workload features"

    def add_arguments(self, parser):
        parser.add_argument("csv_path", type=str, help="Path to GPS CSV file")
        parser.add_argument(
            "--user",
            type=str,
            default="system",
            help="Uploaded by (optional)",
        )

    def handle(self, *args, **options):
        csv_path = Path(options["csv_path"])
        uploaded_by = options["user"] or "system"

        try:
            with transaction.atomic():
                summary, features = run_gps_pipeline(
                    csv_path,
                    uploaded_by=uploaded_by,
                    allow_duplicate=False,
                )

                if summary.skipped:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Duplicate CSV detected (upload id={summary.duplicate_of}). Skipping."
                        )
                    )
                    return

            self.stdout.write(self.style.NOTICE(f"Upload created: id={summary.upload_id}"))
            self.stdout.write(self.style.NOTICE(f"CSV encoding detected: {summary.encoding}"))
            self.stdout.write(
                self.style.SUCCESS(
                    f"Imported {summary.rows_imported} rows; rebuilt {features} feature rows."
                )
            )
        except WorkloadIngestionError as exc:
            raise CommandError(str(exc)) from exc
        except Exception as exc:
            raise CommandError(str(exc)) from exc
