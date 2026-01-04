from datetime import datetime

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import GpsSessionRaw


def parse_date_any(x):
    if not x:
        return None
    s = str(x).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


class Command(BaseCommand):
    help = 'Backfill GpsSessionRaw.date from raw_payload["date_"]'

    def add_arguments(self, parser):
        parser.add_argument("--upload_id", type=int, default=None)
        parser.add_argument("--dry_run", action="store_true")
        parser.add_argument("--batch_size", type=int, default=2000)

    def handle(self, *args, **options):
        upload_id = options["upload_id"]
        dry_run = options["dry_run"]
        batch_size = options["batch_size"]

        qs = GpsSessionRaw.objects.filter(date__isnull=True)
        if upload_id is not None:
            qs = qs.filter(upload_id=upload_id)

        total = qs.count()
        self.stdout.write(self.style.NOTICE(f"rows to backfill: {total}"))

        if total == 0:
            self.stdout.write(self.style.SUCCESS("nothing to do"))
            return

        updated = 0
        buf = []

        for r in qs.iterator(chunk_size=batch_size):
            date_ = parse_date_any(r.raw_payload.get("date_"))
            if date_ is None:
                continue
            r.date = date_
            buf.append(r)

            if len(buf) >= batch_size:
                if not dry_run:
                    with transaction.atomic():
                        GpsSessionRaw.objects.bulk_update(buf, ["date"], batch_size=batch_size)
                updated += len(buf)
                buf = []

        if buf:
            if not dry_run:
                with transaction.atomic():
                    GpsSessionRaw.objects.bulk_update(buf, ["date"], batch_size=batch_size)
            updated += len(buf)

        if dry_run:
            self.stdout.write(self.style.WARNING(f"dry_run=True -> would update {updated} rows"))
        else:
            self.stdout.write(self.style.SUCCESS(f"updated {updated} rows"))
