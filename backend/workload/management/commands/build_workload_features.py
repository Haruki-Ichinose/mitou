from datetime import datetime

from django.core.management.base import BaseCommand
from django.db import transaction

from workload.models import GpsDaily, WorkloadFeaturesDaily


def ewma_with_none(values, alpha):
    """
    Noneの日はEWMAを更新せず、出力もNoneにする。
    """
    out = []
    s = None
    for v in values:
        if v is None:
            out.append(None)
            continue
        if s is None:
            s = v
        else:
            s = alpha * v + (1 - alpha) * s
        out.append(s)
    return out


def compute_acwr_ewma(values, acute_days=7, chronic_days=28):
    alpha_a = 2 / (acute_days + 1)
    alpha_c = 2 / (chronic_days + 1)

    ewma_a = ewma_with_none(values, alpha_a)
    ewma_c = ewma_with_none(values, alpha_c)

    acwr = []
    for a, c in zip(ewma_a, ewma_c):
        if a is None or c is None or c == 0:
            acwr.append(None)
        else:
            acwr.append(a / c)
    return ewma_a, ewma_c, acwr


def split_blocks_by_gap(dates, break_days=30):
    if not dates:
        return []
    blocks = []
    start = 0
    for i in range(1, len(dates)):
        gap = (dates[i] - dates[i - 1]).days
        if gap > break_days:
            blocks.append((start, i))
            start = i
    blocks.append((start, len(dates)))
    return blocks


class Command(BaseCommand):
    help = "Build EWMA/ACWR features from gps_daily"

    def add_arguments(self, parser):
        parser.add_argument("--start", type=str, default=None, help="YYYY-MM-DD (optional)")
        parser.add_argument("--end", type=str, default=None, help="YYYY-MM-DD (optional)")
        parser.add_argument("--break_days", type=int, default=30)
        parser.add_argument("--dry_run", action="store_true")
        parser.add_argument("--delete_existing", action="store_true")

    def handle(self, *args, **options):
        start = options["start"]
        end = options["end"]
        break_days = options["break_days"]
        dry_run = options["dry_run"]
        delete_existing = options["delete_existing"]

        qs = GpsDaily.objects.all()
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)

        athlete_ids = qs.values_list("athlete_id", flat=True).distinct()
        self.stdout.write(self.style.NOTICE(f"athletes to process: {athlete_ids.count()}"))

        params = {"acute_days": 7, "chronic_days": 28, "break_days": break_days}
        out_rows = []

        for athlete_id in athlete_ids.iterator(chunk_size=2000):
            dqs = qs.filter(athlete_id=athlete_id).order_by("date")

            dates = list(dqs.values_list("date", flat=True))
            td_vals = list(dqs.values_list("total_distance", flat=True))
            pl_vals = list(dqs.values_list("total_player_load", flat=True))

            blocks = split_blocks_by_gap(dates, break_days=break_days)

            ewma7_td = [None] * len(dates)
            ewma28_td = [None] * len(dates)
            acwr_td = [None] * len(dates)

            ewma7_pl = [None] * len(dates)
            ewma28_pl = [None] * len(dates)
            acwr_pl = [None] * len(dates)

            for s, e in blocks:
                a7, c28, r = compute_acwr_ewma(td_vals[s:e])
                ewma7_td[s:e] = a7
                ewma28_td[s:e] = c28
                acwr_td[s:e] = r

                a7, c28, r = compute_acwr_ewma(pl_vals[s:e])
                ewma7_pl[s:e] = a7
                ewma28_pl[s:e] = c28
                acwr_pl[s:e] = r

            for i, date_ in enumerate(dates):
                out_rows.append(
                    WorkloadFeaturesDaily(
                        athlete_id=athlete_id,
                        date=date_,
                        ewma7_total_distance=ewma7_td[i],
                        ewma28_total_distance=ewma28_td[i],
                        acwr_ewma_total_distance=acwr_td[i],
                        ewma7_total_player_load=ewma7_pl[i],
                        ewma28_total_player_load=ewma28_pl[i],
                        acwr_ewma_total_player_load=acwr_pl[i],
                        params=params,
                    )
                )

        self.stdout.write(self.style.NOTICE(f"rows to write: {len(out_rows)}"))

        if dry_run:
            self.stdout.write(self.style.WARNING("dry_run=True -> not writing to DB"))
            return

        if not delete_existing:
            raise Exception("For safety: run with --delete_existing (to avoid unique constraint conflicts).")

        with transaction.atomic():
            del_qs = WorkloadFeaturesDaily.objects.all()
            if start:
                del_qs = del_qs.filter(date__gte=start)
            if end:
                del_qs = del_qs.filter(date__lte=end)
            del_qs.delete()

            WorkloadFeaturesDaily.objects.bulk_create(out_rows, batch_size=2000)

        self.stdout.write(self.style.SUCCESS("workload_features_daily built successfully"))
