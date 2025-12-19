import json
from collections import defaultdict

import numpy as np
import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction

from sklearn.preprocessing import RobustScaler
from sklearn.ensemble import IsolationForest

from workload.models import (
    Athlete, GpsDaily, WorkloadFeaturesDaily,
    FeatureRun, StaticAnomalyDaily
)

# 03A notebook の GK 除外列
GK_COLS = [
    "total_dive_load_centre", "total_dive_load_left", "total_dive_load_right",
    "dive_right_count", "dive_left_count", "dive_centre_count",
    "total_dives_centre", "total_dives_left", "total_dives_right",
    "total_time_to_feet_centre", "total_time_to_feet_left", "total_time_to_feet_right"
]

META_COLS = ["athlete_id", "date_", "md_offset", "md_phase", "is_match_day"]

STATIC_CONFIG_DEFAULT = {
    "contamination": 0.05,
    "top_k_features": 5,
    "random_state": 42,
}

def to_float(x):
    if x is None:
        return None
    try:
        return float(x)
    except Exception:
        return None

def compute_top_features_with_z(row, mean_vec, std_vec, cols, top_k=5):
    std_vec = std_vec.replace(0, np.nan)
    z = (row[cols] - mean_vec) / std_vec
    z = z.dropna()
    z_abs = z.abs().sort_values(ascending=False).head(top_k)
    return [{"feature": f, "z": float(z[f])} for f in z_abs.index]

def build_static_df_from_db(athlete_id: str):
    """
    GpsDaily + WorkloadFeaturesDaily を date で結合して、03Aの入力っぽい表を作る
    """
    dqs = GpsDaily.objects.filter(athlete_id=athlete_id).order_by("date")
    if not dqs.exists():
        return None

    # daily 基本
    rows = []
    for d in dqs.iterator(chunk_size=2000):
        r = {
            "athlete_id": athlete_id,
            "date_": d.date,
            "md_offset": d.md_offset,
            "md_phase": d.md_phase,
            "is_match_day": int(d.is_match_day),
            "total_distance": to_float(d.total_distance),
            "total_player_load": to_float(d.total_player_load),
        }
        # metrics から数値だけ拾う（list等は除外）
        if isinstance(d.metrics, dict):
            for k, v in d.metrics.items():
                fv = to_float(v)
                if fv is not None:
                    r[k] = fv
        rows.append(r)

    df = pd.DataFrame(rows)

    # workload features merge（あれば）
    wqs = WorkloadFeaturesDaily.objects.filter(athlete_id=athlete_id).values(
        "date",
        "ewma7_total_distance", "ewma28_total_distance", "acwr_ewma_total_distance",
        "ewma7_total_player_load", "ewma28_total_player_load", "acwr_ewma_total_player_load",
    )
    if wqs.exists():
        wdf = pd.DataFrame(list(wqs))
        wdf = wdf.rename(columns={"date": "date_"})
        df = df.merge(wdf, on="date_", how="left")

    return df.sort_values("date_").reset_index(drop=True)

def prepare_static_features(df_static: pd.DataFrame):
    feature_cols = [c for c in df_static.columns if c not in META_COLS and c not in GK_COLS]
    X = df_static[feature_cols].select_dtypes(include=[np.number])

    std = X.std()
    keep_cols = std[std > 0].index.tolist()
    X = X[keep_cols]
    return X, keep_cols

class Command(BaseCommand):
    help = "Run 03A static anomaly (IsolationForest) from DB and store results"

    def add_arguments(self, parser):
        parser.add_argument("--contamination", type=float, default=STATIC_CONFIG_DEFAULT["contamination"])
        parser.add_argument("--top_k", type=int, default=STATIC_CONFIG_DEFAULT["top_k_features"])
        parser.add_argument("--random_state", type=int, default=STATIC_CONFIG_DEFAULT["random_state"])
        parser.add_argument("--dry_run", action="store_true")
        parser.add_argument("--delete_existing", action="store_true")  # 同run内重複防止

    def handle(self, *args, **opts):
        config = {
            "contamination": opts["contamination"],
            "top_k_features": opts["top_k"],
            "random_state": opts["random_state"],
        }
        dry_run = opts["dry_run"]
        delete_existing = opts["delete_existing"]

        run = FeatureRun.objects.create(
            run_type="static",
            method="IsolationForest",
            params=config,
            artifacts={},
        )
        self.stdout.write(self.style.NOTICE(f"created FeatureRun static id={run.id}"))

        out_rows = []
        # artifacts を「代表の形」で保存（feature_colsは選手ごとに微妙に変わるので、基本は各rowに影響しないもののみ）
        run_artifacts = {"config": config}

        for athlete_id in Athlete.objects.values_list("athlete_id", flat=True).iterator(chunk_size=2000):
            df = build_static_df_from_db(athlete_id)
            if df is None or len(df) < 10:
                continue

            X_raw, feature_cols = prepare_static_features(df)
            if X_raw.shape[1] == 0:
                continue

            # 欠損埋め（notebookはmedian）
            impute_median = X_raw.median()
            X_filled = X_raw.fillna(impute_median)

            scaler = RobustScaler()
            X_scaled = scaler.fit_transform(X_filled.values)

            iso = IsolationForest(
                contamination=config["contamination"],
                random_state=config["random_state"],
            )
            iso.fit(X_scaled)

            static_score = iso.decision_function(X_scaled)
            static_thr = float(np.quantile(static_score, config["contamination"]))
            static_anom = (static_score <= static_thr)

            # z-score用
            mean_vec = X_filled.mean()
            std_vec = X_filled.std()

            for i in range(len(df)):
                tf = None
                if bool(static_anom[i]):
                    tf = compute_top_features_with_z(
                        X_filled.iloc[i], mean_vec, std_vec, feature_cols, top_k=config["top_k_features"]
                    )
                out_rows.append(
                    StaticAnomalyDaily(
                        run=run,
                        athlete_id=athlete_id,
                        date=df.loc[i, "date_"],
                        static_score=float(static_score[i]),
                        static_thr=float(static_thr),
                        static_anomaly=bool(static_anom[i]),
                        top_features=tf,
                    )
                )

            # 代表的artifact（選手ごとに異なる可能性あり：必要なら別テーブルに分ける）
            run_artifacts.setdefault("feature_cols_union", set()).update(feature_cols)

        # artifacts 仕上げ
        if "feature_cols_union" in run_artifacts:
            run_artifacts["feature_cols_union"] = sorted(list(run_artifacts["feature_cols_union"]))
        run.artifacts = run_artifacts
        run.save(update_fields=["artifacts"])

        self.stdout.write(self.style.NOTICE(f"rows to write: {len(out_rows)}"))
        if dry_run:
            self.stdout.write(self.style.WARNING("dry_run=True -> not writing rows"))
            return

        with transaction.atomic():
            if delete_existing:
                StaticAnomalyDaily.objects.filter(run=run).delete()
            StaticAnomalyDaily.objects.bulk_create(out_rows, batch_size=2000)

        self.stdout.write(self.style.SUCCESS("static anomaly saved to DB"))
