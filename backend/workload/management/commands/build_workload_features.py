import pandas as pd
import numpy as np
from django.core.management.base import BaseCommand
from django.db import transaction
from workload.models import GpsDaily, WorkloadFeaturesDaily, Athlete

def calc_acwr_series(series, acute=7, chronic=28):
    # Rolling mean on zero-filled data
    acute_load = series.rolling(window=acute, min_periods=1).mean()
    chronic_load = series.rolling(window=chronic, min_periods=1).mean()
    # Avoid division by zero
    return np.where(chronic_load > 0, acute_load / chronic_load, 0)

def calc_monotony_series(series, window=7):
    r_mean = series.rolling(window=window).mean()
    r_std = series.rolling(window=window).std()
    return np.where(r_std > 0, r_mean / r_std, 0)

class Command(BaseCommand):
    help = "Build ACWR/Monotony features with Zero-filling and GK logic (Position from DB)"

    def handle(self, *args, **options):
        # 1. Fetch only NECESSARY numeric columns to avoid TypeError on date columns
        qs = GpsDaily.objects.all().values(
            "athlete_id", "date",
            "total_distance", "total_player_load",
            "hsr_distance", "ima_asymmetry",
            "total_dive_load", "total_jumps", "dive_asymmetry"
        )
        
        df = pd.DataFrame(list(qs))
        if df.empty:
            self.stdout.write("No data found in GpsDaily.")
            return

        df['date'] = pd.to_datetime(df['date'])
        
        # ★変更: DBからポジション情報を事前にロード (GK判定ロジックの廃止)
        # 辞書形式 {athlete_id: "GK" or "FP"}
        athlete_positions = {
            a.athlete_id: a.position 
            for a in Athlete.objects.all()
        }
        
        out_rows = []

        # 2. Process per athlete
        for athlete_id, group in df.groupby('athlete_id'):
            group = group.sort_values('date')
            
            # --- Zero Filling ---
            # Create full date range from start to end
            full_idx = pd.date_range(start=group['date'].min(), end=group['date'].max(), freq='D')
            
            # set_index -> reindex -> fillna(0) works safely for numeric cols
            group = group.set_index('date').reindex(full_idx, fill_value=0).reset_index().rename(columns={'index': 'date'})
            
            # ★変更: DBの値を使用して判定
            is_gk = athlete_positions.get(athlete_id, "FP") == "GK"

            # --- Calculations ---
            # Common Metrics
            acwr_dist = calc_acwr_series(group['total_distance'])
            monotony = calc_monotony_series(group['total_player_load']) 

            # Position Specific
            acwr_hsr = np.zeros(len(group))
            acwr_dive = np.zeros(len(group))
            acwr_jump = np.zeros(len(group))
            asym_val = np.zeros(len(group))

            if is_gk:
                acwr_dive = calc_acwr_series(group['total_dive_load'])
                acwr_jump = calc_acwr_series(group['total_jumps'])
                asym_val = group['dive_asymmetry'].fillna(0).values
            else:
                acwr_hsr = calc_acwr_series(group['hsr_distance'])
                asym_val = group['ima_asymmetry'].fillna(0).values

            # --- Prepare Objects ---
            for i, row in group.iterrows():
                out_rows.append(WorkloadFeaturesDaily(
                    athlete_id=athlete_id,
                    date=row['date'].date(),
                    acwr_total_distance=acwr_dist[i],
                    acwr_hsr=acwr_hsr[i],
                    acwr_dive=acwr_dive[i],
                    acwr_jump=acwr_jump[i],
                    monotony_load=monotony[i],
                    val_asymmetry=asym_val[i],
                ))

        # 3. Save to DB
        with transaction.atomic():
            WorkloadFeaturesDaily.objects.all().delete()
            WorkloadFeaturesDaily.objects.bulk_create(out_rows, batch_size=2000)

        self.stdout.write(self.style.SUCCESS(f"Built features for {len(out_rows)} days using correct positions from DB."))