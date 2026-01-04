from django.core.management.base import BaseCommand
from api.services import athlete_ids_for_upload, rebuild_gps_daily

class Command(BaseCommand):
    help = "Build gps_daily with new sports science metrics"

    def add_arguments(self, parser):
        parser.add_argument("--upload_id", type=int, default=None)
        parser.add_argument("--delete_existing", action="store_true")
        parser.add_argument("--athlete_id", action="append", default=[])

    def handle(self, *args, **options):
        upload_id = options["upload_id"]
        delete_existing = options["delete_existing"]
        athlete_ids = options["athlete_id"] or []

        if upload_id:
            upload_athletes = athlete_ids_for_upload(upload_id)
            if not upload_athletes and not athlete_ids:
                self.stdout.write(
                    f"No raw rows found for upload_id={upload_id}."
                )
                return
            athlete_ids.extend(upload_athletes)

        athlete_ids = list(dict.fromkeys(athlete_ids))
        if not athlete_ids and upload_id is None:
            athlete_ids = None

        total = rebuild_gps_daily(
            athlete_ids=athlete_ids, delete_existing=delete_existing
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully created/updated {total} daily records."
            )
        )
