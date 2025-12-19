import numpy as np
import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction

from sklearn.preprocessing import RobustScaler
from sklearn.ensemble import IsolationForest

from workload.models import Athlete, GpsDaily, FeatureRun, StaticAnomalyDaily

# 03D notebook の GK 指標
GK_COLS = [
    "total_dive_load_centre", "total_dive_load_left", "total_dive_load_right",
    "dive_right_count", "dive_left_count", "dive_centre_count",
    "total_dives_centre", "total_dives_left", "total_dives_right",
    "total_time_to_feet_centre", "total_time_to_feet_left", "total_time_to_feet_right"
]

DEFAULTS = {
    "contamination": 0.05,
    "random_state": 42,
    "min_nonzero_days": 3,   # GK判定：GK_COLS合計が>0の日がこの日数以上
    "top_k_features": 5,     # top_features を作りたい場合（任意）
}

def to_float(x):
    if x is None:
        return None
    try:
        return float(x)
    except Exception:
        return None

def build_gk_daily_df(athlete_id: str):
    """
    GpsDaily から GK_COLS を取り出して DataFrame 化。
    GK指標は metrics(JSON) に入っている前提。
    """
    qs = GpsDaily.objects.filter(athlete_id=athlete_id).order_by("date")
    if not qs.exists():
        return None

    rows = []
    for d in qs.iterator(chunk_size=2000):
        r = {"athlete_id": athlete_id, "date_": d.date}
        # GK指標は metrics から
        m = d.metrics if isinstance(d.metrics, dict) else {}
        for k in GK_COLS:
            r[k] = to_float(m.get(k))
        rows.append(r)

    df = pd.DataFrame(rows).sort_values("date_").reset_index(drop=True)
    return df

def is_gk_by_metrics(df: pd.DataFrame, min_nonzero_days: int) -> bool:
    """
    notebook流：GK指標が出る選手をGK扱い。
    「GK_COLSの合計が0より大きい日」が min_nonzero_days 以上あるかで判定。
    """
    if df is None or len(df) == 0:
        return False
    X = df[GK_COLS].fillna(0.0)
    nonzero_days = (X.sum(axis=1) > 0).sum()
    return int(nonzero_days) >= int(min_nonzero_days)

def compute_top_features_with_z(row, mean_vec, std_vec, cols, top_k=5):
    std_vec = std_vec.replace(0, np.nan)
    z = (row[cols] - mean_vec) / std_vec
    z = z.dropna()
    z_abs = z.abs().sort_values(ascending=False).head(top_k)
    return [{"feature": f, "z": float(z[f])} for f in z_abs.index]

class Command(BaseCommand):
    help = "Run 03D GK static anomaly (IsolationForest on GK metrics) and store results"

    def add_arguments(self, parser):
        parser.add_argument("--contamination", type=float, default=DEFAULTS["contamination"])
        parser.add_argument("--random_state", type=int, default=DEFAULTS["random_state"])
        parser.add_argument("--min_nonzero_days", type=int, default=DEFAULTS["min_nonzero_days"])
        parser.add_argument("--top_k", type=int, default=DEFAULTS["top_k_features"])
        parser.add_argument("--dry_run", action="store_true")
        parser.add_argument("--delete_existing", action="store_true")

    def handle(self, *args, **opts):
        contamination = opts["contamination"]
        random_state = opts["random_state"]
        min_nonzero_days = opts["min_nonzero_days"]
        top_k = opts["top_k"]
        dry_run = opts["dry_run"]
        delete_existing = opts["delete_existing"]

        config = {
            "contamination": contamination,
            "random_state": random_state,
            "min_nonzero_days": min_nonzero_days,
            "top_k": top_k,
            "feature_set": "GK_COLS",
        }

        run = FeatureRun.objects.create(
            run_type="static",
            method="IsolationForest_GK",
            params=config,
            artifacts={"gk_cols": GK_COLS},
        )
        self.stdout.write(self.style.NOTICE(f"created FeatureRun GK static id={run.id}"))

        out_rows = []
        gk_athletes = 0

        for athlete_id in Athlete.objects.values_list("athlete_id", flat=True).iterator(chunk_size=2000):
            df = build_gk_daily_df(athlete_id)
            if df is None or len(df) < 10:
                continue

            # GK判定（metricsベース）
            if not is_gk_by_metrics(df, min_nonzero_days=min_nonzero_days):
                continue
            gk_athletes += 1

            X = df[GK_COLS].copy()
            # 欠損は0に寄せる（GK指標は欠損≒0のことが多い）
            X = X.fillna(0.0)

            # std=0列落とし（全ゼロ列など）
            std = X.std()
            keep_cols = std[std > 0].index.tolist()
            if len(keep_cols) == 0:
                continue
            X = X[keep_cols]

            # RobustScaler + IsolationForest（03Aと同じ流儀）
            scaler = RobustScaler()
            X_scaled = scaler.fit_transform(X.values)

            iso = IsolationForest(
                contamination=contamination,
                random_state=random_state,
            )
            iso.fit(X_scaled)

            score = iso.decision_function(X_scaled)
            thr = float(np.quantile(score, contamination))
            anom = (score <= thr)

            # top_features（任意）
            mean_vec = X.mean()
            std_vec = X.std()

            for i in range(len(df)):
                tf = None
                if bool(anom[i]):
                    tf = compute_top_features_with_z(
                        X.iloc[i], mean_vec, std_vec, keep_cols, top_k=top_k
                    )
                out_rows.append(
                    StaticAnomalyDaily(
                        run=run,
                        athlete_id=athlete_id,
                        date=df.loc[i, "date_"],
                        static_score=float(score[i]),
                        static_thr=float(thr),
                        static_anomaly=bool(anom[i]),
                        top_features=tf,
                    )
                )

        self.stdout.write(self.style.NOTICE(f"GK athletes detected: {gk_athletes}"))
        self.stdout.write(self.style.NOTICE(f"rows to write: {len(out_rows)}"))

        if dry_run:
            self.stdout.write(self.style.WARNING("dry_run=True -> not writing rows"))
            return

        with transaction.atomic():
            if delete_existing:
                StaticAnomalyDaily.objects.filter(run=run).delete()
            StaticAnomalyDaily.objects.bulk_create(out_rows, batch_size=2000)

        self.stdout.write(self.style.SUCCESS("GK static anomaly saved to DB"))
