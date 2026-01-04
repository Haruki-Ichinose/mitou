from django.core.management.base import BaseCommand
from api.services import athlete_ids_for_upload, rebuild_workload_features

class Command(BaseCommand):
    help = "Build ACWR/Monotony features with Zero-filling and GK logic (Position from DB)"

    def add_arguments(self, parser):
        parser.add_argument("--upload_id", type=int, default=None)
        parser.add_argument("--athlete_id", action="append", default=[])

    def handle(self, *args, **options):
        upload_id = options["upload_id"]
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

        total = rebuild_workload_features(athlete_ids=athlete_ids)
        if total == 0:
            self.stdout.write("No data found in GpsDaily.")
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"Built features for {total} days using correct positions from DB."
            )
        )
