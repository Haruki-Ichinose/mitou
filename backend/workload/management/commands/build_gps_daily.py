from collections import defaultdict
from django.core.management.base import BaseCommand
from django.db import transaction
from workload.models import GpsSessionRaw, GpsDaily
from datetime import datetime

def parse_date_any(x):
    if not x: return None
    s = str(x).strip()
    if not s: return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None

def to_float(x):
    if x is None: return 0.0
    try:
        return float(x)
    except:
        return 0.0

class Command(BaseCommand):
    help = "Build gps_daily with new sports science metrics"

    def add_arguments(self, parser):
        parser.add_argument("--upload_id", type=int, default=None)
        parser.add_argument("--delete_existing", action="store_true")

    def handle(self, *args, **options):
        upload_id = options["upload_id"]
        delete_existing = options["delete_existing"]

        qs = GpsSessionRaw.objects.all()
        if upload_id:
            qs = qs.filter(upload_id=upload_id)

        # 1. Group raw sessions by (Athlete, Date)
        grouped = defaultdict(list)
        for r in qs.iterator(chunk_size=2000):
            # Prefer parsed date, fallback to raw string parse
            date_ = r.date
            if not date_:
                date_ = parse_date_any(r.raw_payload.get("date_"))
            
            if date_:
                grouped[(r.athlete_id, date_)].append(r)

        self.stdout.write(f"Processing {len(grouped)} daily records...")

        daily_objects = []

        # 2. Aggregate metrics
        for (athlete_id, date_), rows in grouped.items():
            sums = defaultdict(float)
            
            # Columns needed for calculation
            needed_cols = [
                "total_distance", "total_player_load", "total_jumps",
                "velocity_band5_total_distance", "velocity_band6_total_distance",
                "ima_band2_left_count", "ima_band2_right_count",
                "total_dive_load_left", "total_dive_load_right", "total_dive_load_centre",
                "dive_left_count", "dive_right_count", "dive_centre_count"
            ]

            for rr in rows:
                p = rr.raw_payload
                for k in needed_cols:
                    sums[k] += to_float(p.get(k))

            # --- FP Metrics ---
            hsr = sums["velocity_band5_total_distance"] + sums["velocity_band6_total_distance"]
            ima_l = sums["ima_band2_left_count"]
            ima_r = sums["ima_band2_right_count"]
            ima_total = ima_l + ima_r
            ima_asym = abs((ima_l - ima_r) / ima_total * 100) if ima_total > 10 else None

            # --- GK Metrics ---
            dive_load = (sums["total_dive_load_left"] + 
                         sums["total_dive_load_right"] + 
                         sums["total_dive_load_centre"])
            
            dive_l = sums["dive_left_count"]
            dive_r = sums["dive_right_count"]
            dive_total = dive_l + dive_r + sums["dive_centre_count"]
            dive_asym = abs((dive_l - dive_r) / dive_total * 100) if dive_total > 5 else None

            daily_objects.append(
                GpsDaily(
                    athlete_id=athlete_id,
                    date=date_,
                    total_distance=sums["total_distance"],
                    total_player_load=sums["total_player_load"],
                    hsr_distance=hsr,
                    ima_total=ima_total,
                    ima_asymmetry=ima_asym,
                    total_dive_load=dive_load,
                    total_jumps=sums["total_jumps"],
                    dive_asymmetry=dive_asym,
                    metrics=dict(sums) # Save raw sums just in case
                )
            )

        # 3. Save to DB
        with transaction.atomic():
            if delete_existing:
                GpsDaily.objects.all().delete() # Simple full refresh
            
            GpsDaily.objects.bulk_create(daily_objects, batch_size=2000)

        self.stdout.write(self.style.SUCCESS(f"Successfully created {len(daily_objects)} daily records."))