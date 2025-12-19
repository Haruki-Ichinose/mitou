from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from workload.models import GpsSessionRaw, GpsDaily

from datetime import datetime

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


# --- 集計ルール（ノートブック準拠の基本方針） ---
SUM_COLS = {
    "total_distance",
    "total_duration",
    "total_player_load",
    "total_jumps",
    "dive_left_count",
    "dive_right_count",
    "dive_centre_count",
    "total_dives_left",
    "total_dives_right",
    "total_dives_centre",
    "total_dive_load_left",
    "total_dive_load_right",
    "total_dive_load_centre",
    "total_time_to_feet_left",
    "total_time_to_feet_right",
    "total_time_to_feet_centre",
    "ima_band2_jump_count",
    "ima_band2_left_count",
    "ima_band2_right_count",
    "ima_band2_accel_count",
    "ima_band2_decel_count",
    "ima_band3_jump_count",
    "ima_band3_left_count",
    "ima_band3_right_count",
    "ima_band3_accel_count",
    "ima_band3_decel_count",
    "velocity_band1_total_distance",
    "velocity_band2_total_distance",
    "velocity_band3_total_distance",
    "velocity_band4_total_distance",
    "velocity_band5_total_distance",
    "velocity_band6_total_distance",
}

MAX_COLS = {"max_vel", "max_heart_rate"}
MIN_COLS = {"min_heart_rate"}
MEAN_COLS = {"mean_heart_rate"}

# daily固定列に入れたい“必須”
DAILY_FIXED = {"total_distance", "total_player_load"}

# match判定に使う列（あなたのデータだと activity_name がそれっぽい）
MATCH_NAME_KEYS = ["activity_name", "period_name", "date_name"]


def to_float(x):
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip()
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def is_match_row(payload: dict) -> bool:
    """
    ノートブック準拠：セッション名（活動名）に match/game/試合 が入っていれば match とみなす。
    """
    for k in MATCH_NAME_KEYS:
        v = payload.get(k)
        if not v:
            continue
        s = str(v).lower()
        if ("match" in s) or ("game" in s) or ("試合" in s):
            return True
    return False


def compute_md_offset(match_dates_sorted, date_):
    if not match_dates_sorted:
        return None
    best = None
    best_abs = None
    for md in match_dates_sorted:
        d = (date_ - md).days
        ad = abs(d)
        if best_abs is None or ad < best_abs:
            best = d
            best_abs = ad
    return best


def to_md_phase(md_offset):
    if md_offset is None:
        return ""
    if md_offset == 0:
        return "MD"
    if md_offset > 0:
        return f"MD+{md_offset}"
    return f"MD{md_offset}"  # -1 -> "MD-1"


class Command(BaseCommand):
    help = "Build gps_daily from gps_sessions_raw (athlete x date aggregation)"

    def add_arguments(self, parser):
        parser.add_argument("--upload_id", type=int, default=None)
        parser.add_argument("--dry_run", action="store_true")
        parser.add_argument("--delete_existing", action="store_true")

    def handle(self, *args, **options):
        upload_id = options["upload_id"]
        dry_run = options["dry_run"]
        delete_existing = options["delete_existing"]

                # Raw側の date 列は今回NULLのため、raw_payload["date_"] を優先して使う
        qs = GpsSessionRaw.objects.all()
        if upload_id is not None:
            qs = qs.filter(upload_id=upload_id)

        grouped = defaultdict(list)
        skipped_no_date = 0

        for r in qs.iterator(chunk_size=2000):
            # 1) raw_payload の date_ を最優先
            date_ = parse_date_any(r.raw_payload.get("date_"))

            # 2) 将来に備えて、もしモデルの date が埋まっているならそれも使う
            if date_ is None and r.date is not None:
                date_ = r.date

            if date_ is None:
                skipped_no_date += 1
                continue

            grouped[(r.athlete_id, date_)].append(r)

        self.stdout.write(self.style.NOTICE(f"skipped rows (no date): {skipped_no_date}"))
        self.stdout.write(self.style.NOTICE(f"grouped keys (athlete x date): {len(grouped)}"))

        # athleteごとの match day 集合
        match_dates_by_athlete = defaultdict(set)
        for (athlete_id, date_), rows in grouped.items():
            if any(is_match_row(rr.raw_payload) for rr in rows):
                match_dates_by_athlete[athlete_id].add(date_)

        match_dates_sorted = {aid: sorted(list(dates)) for aid, dates in match_dates_by_athlete.items()}

        daily_objects = []

        # 集計ワーク領域
        for (athlete_id, date_), rows in grouped.items():
            sum_vals = defaultdict(float)
            max_vals = {}
            min_vals = {}
            mean_sum = defaultdict(float)
            mean_n = defaultdict(int)

            # 日次で残したい“カテゴリ名”は一応代表値を metrics に入れる（任意）
            # 例：その日の activity_name の集合
            activity_names = set()
            period_names = set()

            for rr in rows:
                p = rr.raw_payload

                if p.get("activity_name"):
                    activity_names.add(str(p["activity_name"]))
                if p.get("period_name"):
                    period_names.add(str(p["period_name"]))

                # sum
                for k in SUM_COLS:
                    v = to_float(p.get(k))
                    if v is not None:
                        sum_vals[k] += v

                # max
                for k in MAX_COLS:
                    v = to_float(p.get(k))
                    if v is None:
                        continue
                    if (k not in max_vals) or (v > max_vals[k]):
                        max_vals[k] = v

                # min
                for k in MIN_COLS:
                    v = to_float(p.get(k))
                    if v is None:
                        continue
                    if (k not in min_vals) or (v < min_vals[k]):
                        min_vals[k] = v

                # mean
                for k in MEAN_COLS:
                    v = to_float(p.get(k))
                    if v is None:
                        continue
                    mean_sum[k] += v
                    mean_n[k] += 1

            # match / md
            is_match_day = date_ in match_dates_by_athlete.get(athlete_id, set())
            md_offset = compute_md_offset(match_dates_sorted.get(athlete_id, []), date_)
            md_phase = to_md_phase(md_offset)

            # daily固定2指標
            td = sum_vals.get("total_distance")
            pl = sum_vals.get("total_player_load")

            # metrics には集計結果をまとめて入れる（固定列以外）
            metrics = {}

            # sum系（固定以外）
            for k, v in sum_vals.items():
                if k in DAILY_FIXED:
                    continue
                metrics[k] = v

            # max/min/mean系
            for k, v in max_vals.items():
                metrics[k] = v
            for k, v in min_vals.items():
                metrics[k] = v
            for k in MEAN_COLS:
                if mean_n.get(k, 0) > 0:
                    metrics[k] = mean_sum[k] / mean_n[k]

            # 代表名（任意）
            if activity_names:
                metrics["activity_name_set"] = sorted(activity_names)
            if period_names:
                metrics["period_name_set"] = sorted(period_names)

            daily_objects.append(
                GpsDaily(
                    athlete_id=athlete_id,
                    date=date_,
                    is_match_day=is_match_day,
                    md_offset=md_offset,
                    md_phase=md_phase,
                    total_distance=td if td != 0 else (td if td is not None else None),
                    total_player_load=pl if pl != 0 else (pl if pl is not None else None),
                    metrics=metrics,
                )
            )

        self.stdout.write(self.style.NOTICE(f"daily rows to write: {len(daily_objects)}"))

        if dry_run:
            self.stdout.write(self.style.WARNING("dry_run=True -> not writing to DB"))
            return

        # 書き込み：既存削除→作成（upload指定ならその範囲だけ消す）
        with transaction.atomic():
            if delete_existing:
                if upload_id is not None:
                    athlete_ids = {aid for (aid, _) in grouped.keys()}
                    dates = {dt for (_, dt) in grouped.keys()}
                    GpsDaily.objects.filter(athlete_id__in=athlete_ids, date__in=dates).delete()
                else:
                    # 全消しは危険なので、upload_idなしでdelete_existingは基本使わない
                    raise Exception("Refuse delete_existing without --upload_id")

            GpsDaily.objects.bulk_create(daily_objects, batch_size=2000)

        self.stdout.write(self.style.SUCCESS("gps_daily built successfully"))
