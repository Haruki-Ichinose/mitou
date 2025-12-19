from collections import defaultdict

import numpy as np
import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction

from sklearn.preprocessing import StandardScaler

from workload.models import (
    Athlete, GpsDaily, WorkloadFeaturesDaily,
    FeatureRun, StaticAnomalyDaily, DynamicAnomalyDaily
)

try:
    import torch
    import torch.nn as nn
except Exception as e:
    torch = None
    nn = None


META_COLS = ["athlete_id", "date_", "md_offset", "md_phase", "is_match_day"]
FLAG_COLS = ["season_block", "season_reset_zone", "static_anomaly"]


def build_dyn_df_from_db(athlete_id: str):
    dqs = GpsDaily.objects.filter(athlete_id=athlete_id).order_by("date")
    if not dqs.exists():
        return None

    rows = []
    for d in dqs.iterator(chunk_size=2000):
        r = {
            "athlete_id": athlete_id,
            "date_": d.date,
            "md_offset": d.md_offset,
            "md_phase": d.md_phase,
            "is_match_day": int(d.is_match_day),
            "total_distance": d.total_distance,
            "total_player_load": d.total_player_load,
        }
        if isinstance(d.metrics, dict):
            for k, v in d.metrics.items():
                # 数値だけ
                try:
                    fv = float(v)
                except Exception:
                    continue
                r[k] = fv
        rows.append(r)

    df = pd.DataFrame(rows)

    # ACWR merge
    wqs = WorkloadFeaturesDaily.objects.filter(athlete_id=athlete_id).values(
        "date",
        "ewma7_total_distance", "ewma28_total_distance", "acwr_ewma_total_distance",
        "ewma7_total_player_load", "ewma28_total_player_load", "acwr_ewma_total_player_load",
    )
    if wqs.exists():
        wdf = pd.DataFrame(list(wqs)).rename(columns={"date": "date_"})
        df = df.merge(wdf, on="date_", how="left")

    df = df.sort_values("date_").reset_index(drop=True)
    return df


def split_seasons_by_gap(dates, break_days=30):
    if len(dates) == 0:
        return []
    blocks = []
    start = 0
    for i in range(1, len(dates)):
        if (dates[i] - dates[i - 1]).days > break_days:
            blocks.append((start, i))
            start = i
    blocks.append((start, len(dates)))
    return blocks


class LSTMAE(nn.Module):
    def __init__(self, n_features, hidden=32):
        super().__init__()
        self.encoder = nn.LSTM(input_size=n_features, hidden_size=hidden, batch_first=True)
        self.decoder = nn.LSTM(input_size=hidden, hidden_size=hidden, batch_first=True)
        self.out = nn.Linear(hidden, n_features)

    def forward(self, x):
        # x: (B, T, F)
        enc_out, (h, c) = self.encoder(x)
        # repeat last hidden across T
        B, T, _ = x.shape
        z = h[-1].unsqueeze(1).repeat(1, T, 1)  # (B,T,H)
        dec_out, _ = self.decoder(z)
        y = self.out(dec_out)  # (B,T,F)
        return y


def make_sequences(X, seq_len):
    # X: (N,F)
    if len(X) < seq_len:
        return None
    seqs = []
    for i in range(seq_len - 1, len(X)):
        seqs.append(X[i - seq_len + 1 : i + 1])
    return np.stack(seqs, axis=0)  # (N-seq_len+1, seq_len, F)


def recon_error(model, x_tensor):
    with torch.no_grad():
        y = model(x_tensor)
        err = torch.mean((y - x_tensor) ** 2, dim=(1, 2))  # per sequence
        return err.detach().cpu().numpy()


class Command(BaseCommand):
    help = "Run 03B dynamic anomaly (LSTM-AE) from DB and store results"

    def add_arguments(self, parser):
        parser.add_argument("--static_run_id", type=int, default=None)
        parser.add_argument("--break_days", type=int, default=30)
        parser.add_argument("--reset_days", type=int, default=14)
        parser.add_argument("--seq_len", type=int, default=30)
        parser.add_argument("--epochs", type=int, default=10)
        parser.add_argument("--batch_size", type=int, default=64)
        parser.add_argument("--hidden", type=int, default=32)
        parser.add_argument("--lr", type=float, default=1e-3)
        parser.add_argument("--threshold_q", type=float, default=0.99)
        parser.add_argument("--min_train_days", type=int, default=60)
        parser.add_argument("--dry_run", action="store_true")
        parser.add_argument("--delete_existing", action="store_true")

    def handle(self, *args, **opts):
        if torch is None:
            raise Exception("torch is not available in this environment. Install torch or use a non-torch dynamic method.")

        # static run
        static_run_id = opts["static_run_id"]
        if static_run_id is None:
            sr = FeatureRun.objects.filter(run_type="static").order_by("-id").first()
            if sr is None:
                raise Exception("No static FeatureRun found. Run run_static_anomaly_db first.")
            static_run_id = sr.id

        break_days = opts["break_days"]
        reset_days = opts["reset_days"]
        seq_len = opts["seq_len"]
        epochs = opts["epochs"]
        batch_size = opts["batch_size"]
        hidden = opts["hidden"]
        lr = opts["lr"]
        threshold_q = opts["threshold_q"]
        min_train_days = opts["min_train_days"]
        dry_run = opts["dry_run"]
        delete_existing = opts["delete_existing"]

        config = {
            "static_run_id": static_run_id,
            "break_days": break_days,
            "reset_days": reset_days,
            "seq_len": seq_len,
            "epochs": epochs,
            "batch_size": batch_size,
            "hidden": hidden,
            "lr": lr,
            "threshold_q": threshold_q,
            "min_train_days": min_train_days,
        }

        run = FeatureRun.objects.create(
            run_type="dynamic",
            method="LSTMAE",
            params=config,
            artifacts={},
        )
        self.stdout.write(self.style.NOTICE(f"created FeatureRun dynamic id={run.id}, static_run_id={static_run_id}"))

        # static flags map
        static_map = defaultdict(dict)  # athlete_id -> {date: bool}
        sqs = StaticAnomalyDaily.objects.filter(run_id=static_run_id).values("athlete_id", "date", "static_anomaly")
        for r in sqs.iterator(chunk_size=5000):
            static_map[r["athlete_id"]][r["date"]] = bool(r["static_anomaly"])

        out_rows = []
        processed = 0

        for athlete_id in Athlete.objects.values_list("athlete_id", flat=True).iterator(chunk_size=2000):
            df = build_dyn_df_from_db(athlete_id)
            if df is None or len(df) < (seq_len + 10):
                continue

            # flags: season block
            dates = df["date_"].tolist()
            blocks = split_seasons_by_gap(dates, break_days=break_days)

            season_block = np.full(len(df), -1, dtype=int)
            season_reset_zone = np.zeros(len(df), dtype=bool)

            for bidx, (s, e) in enumerate(blocks):
                season_block[s:e] = bidx
                rz_end = min(e, s + reset_days)
                season_reset_zone[s:rz_end] = True

            df["season_block"] = season_block
            df["season_reset_zone"] = season_reset_zone

            # static anomaly flag (from 03A)
            df["static_anomaly"] = [static_map.get(athlete_id, {}).get(d, False) for d in df["date_"]]

            # feature cols: numeric only, exclude meta + flags
            feature_cols = [c for c in df.columns if c not in META_COLS and c not in FLAG_COLS]
            Xall = df[feature_cols].select_dtypes(include=[np.number]).copy()

            # std=0 drop
            std = Xall.std()
            keep_cols = std[std > 0].index.tolist()
            Xall = Xall[keep_cols]
            if Xall.shape[1] == 0:
                continue

            # blockごとにモデルを学習してerrorを出す（ノートブック寄り）
            dyn_error = np.full(len(df), np.nan, dtype=float)

            for (s, e) in blocks:
                sub = Xall.iloc[s:e].copy()

                # 学習除外（static anomaly & reset zone）
                train_mask = (~df.loc[s:e-1, "static_anomaly"].values) & (~df.loc[s:e-1, "season_reset_zone"].values)
                sub_train = sub.loc[train_mask]

                if len(sub_train) < min_train_days:
                    continue
                if len(sub) < seq_len:
                    continue

                # 欠損埋め：median（trainで計算）
                med = sub_train.median()
                sub = sub.fillna(med)
                sub_train = sub_train.fillna(med)

                # ★追加：winsorize（train分布でp1〜p99にクリップ）
                q_low = sub_train.quantile(0.01)
                q_high = sub_train.quantile(0.99)

                sub = sub.clip(lower=q_low, upper=q_high, axis=1)
                sub_train = sub_train.clip(lower=q_low, upper=q_high, axis=1)

                # scaler
                scaler = StandardScaler()
                scaler.fit(sub_train.values)
                X = scaler.transform(sub.values)

                # ★追加：数値安全性（ここでinf/nanが混ざってたら落とす）
                X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)


                seqs = make_sequences(X, seq_len)
                if seqs is None:
                    continue

                # train seqs also filtered by train_mask（seq終端がtrain日のものだけ）
                end_idx = np.arange(seq_len - 1, len(X))
                train_seq_mask = train_mask[end_idx]
                train_seqs = seqs[train_seq_mask]
                if len(train_seqs) < 50:
                    continue

                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                model = LSTMAE(n_features=X.shape[1], hidden=hidden).to(device)
                opt = torch.optim.Adam(model.parameters(), lr=lr)
                loss_fn = torch.nn.MSELoss()

                train_tensor = torch.tensor(train_seqs, dtype=torch.float32).to(device)

                model.train()
                for _ in range(epochs):
                    # shuffle
                    idx = torch.randperm(train_tensor.size(0))
                    for i0 in range(0, train_tensor.size(0), batch_size):
                        batch = train_tensor[idx[i0:i0+batch_size]]
                        opt.zero_grad()
                        y = model(batch)
                        loss = loss_fn(y, batch)
                        loss.backward()
                        opt.step()

                # recon error for all seqs in this block
                model.eval()
                all_tensor = torch.tensor(seqs, dtype=torch.float32).to(device)
                err = recon_error(model, all_tensor)  # len = e-s - seq_len + 1

                # align: err[i] corresponds to end index (s + seq_len-1 + i)
                for j, ei in enumerate(range(s + seq_len - 1, e)):
                    dyn_error[ei] = float(err[j])

            valid = np.isfinite(dyn_error)
            if valid.sum() == 0:
                continue

            # --- block別 threshold ---
            dyn_thr_arr = np.full(len(df), np.nan, dtype=float)

            for b in np.unique(season_block):
                if b < 0:
                    continue

                # reset zone を除外して閾値算出（←あなたの要望）
                idx = (season_block == b) & valid & (~season_reset_zone)
                if idx.sum() == 0:
                    continue

                cap = float(np.quantile(dyn_error[idx], 0.999))
                idx2 = idx & (dyn_error <= cap)
                if idx2.sum() == 0:
                    idx2 = idx

                thr_b = float(np.quantile(dyn_error[idx2], threshold_q))
                dyn_thr_arr[season_block == b] = thr_b

            # 閾値が入っている日のみ判定（閾値なしは判定しない）
            thr_valid = np.isfinite(dyn_thr_arr) & valid
            dyn_anom = (dyn_error >= dyn_thr_arr) & thr_valid

            # streak（dyn_anom が必ず定義された後に計算）
            streak = np.zeros(len(df), dtype=int)
            cur = 0
            for i in range(len(df)):
                if dyn_anom[i]:
                    cur += 1
                else:
                    cur = 0
                streak[i] = cur



            # save rows
            for i in range(len(df)):
                out_rows.append(
                    DynamicAnomalyDaily(
                        run=run,
                        athlete_id=athlete_id,
                        date=df.loc[i, "date_"],
                        dyn_error=None if not np.isfinite(dyn_error[i]) else float(dyn_error[i]),
                        dyn_thr=None if not np.isfinite(dyn_thr_arr[i]) else float(dyn_thr_arr[i]),
                        dyn_anomaly=bool(dyn_anom[i]),
                        dyn_streak=int(streak[i]),
                        season_block=int(df.loc[i, "season_block"]) if df.loc[i, "season_block"] >= 0 else None,
                        season_reset_zone=bool(df.loc[i, "season_reset_zone"]),
                        static_anomaly=bool(df.loc[i, "static_anomaly"]),
                    )
                )

            processed += 1

        self.stdout.write(self.style.NOTICE(f"processed athletes: {processed}"))
        self.stdout.write(self.style.NOTICE(f"rows to write: {len(out_rows)}"))

        if dry_run:
            self.stdout.write(self.style.WARNING("dry_run=True -> not writing rows"))
            return

        with transaction.atomic():
            if delete_existing:
                DynamicAnomalyDaily.objects.filter(run=run).delete()
            DynamicAnomalyDaily.objects.bulk_create(out_rows, batch_size=2000)

        self.stdout.write(self.style.SUCCESS("dynamic anomaly saved to DB"))
