import os
import pandas as pd
import numpy as np

# ----------------------------
# データ読み込み
# ----------------------------
def load_raw_data(path: str) -> pd.DataFrame:
    """生データを読み込む"""
    return pd.read_csv(path, encoding="cp932")

# ----------------------------
# データクリーニング処理
# ----------------------------
def clean_stats_data(df: pd.DataFrame) -> pd.DataFrame:
    """Catapultデータをクリーニング"""
    # 欠損処理
    df = df.dropna(how="all").dropna(how="any")

    # 選手名統一
    name_mapping = {
        "Ryu NAGAI": "Ryo NAGAI",
        "Asai YADA": "Asahi YADA",
        "Kakeru Sakamoto": "Kakeru SAKAMOTO",
        "Kozi SUGIYAMA": "Koji SUGIYAMA",
        "Sunjin KO": "Seungjin KO",
        "1 練習生": "Trainee 1",
        "2 練習生": "Trainee 2",
        "A Trainee": "Trainee A",
        "B Trainee": "Trainee B",
        "C Trainee": "Trainee C",
        "D Trainee": "Trainee D",
        "予備 YOBI": "Yobi 1",
        "予備2 Yobi2": "Yobi 2",
    }
    df["athlete_name"] = (
        df["athlete_name"]
        .replace(name_mapping)
        .str.strip()
        .str.replace("\u3000", " ", regex=True)
    )

    def format_name(name):
        if "Trainee" in name or "Yobi" in name:
            return name
        parts = name.split()
        if len(parts) >= 2:
            first, last = parts[0].capitalize(), parts[1].upper()
            return f"{first} {last}"
        return name

    df["athlete_name"] = df["athlete_name"].apply(format_name)

    # 型変換
    df["date_"] = pd.to_datetime(df["date_"], errors="coerce")
    for col in ["activity_name", "period_name", "day_code"]:
        if col in df.columns:
            df[col] = df[col].astype("category")

    # UNIX秒 → datetime
    if np.issubdtype(df["start_time"].dtype, np.number):
        df["start_dt"] = pd.to_datetime(df["start_time"], unit="s", errors="coerce")
        df["end_dt"] = pd.to_datetime(df["end_time"], unit="s", errors="coerce")

    # 不要列削除
    for col in ["start_time_h", "end_time_h", "date_name"]:
        if col in df.columns:
            df = df.drop(columns=[col])

    # 距離0削除
    df = df[df["total_distance"] > 0]

    # セッション時間追加
    df["session_duration_sec"] = (df["end_dt"] - df["start_dt"]).dt.total_seconds()

    # 列順整理
    meta_cols = [
        "date_", "start_dt", "end_dt", "session_duration_sec",
        "activity_id", "activity_name", "period_id", "period_name", "day_code",
        "athlete_id", "athlete_name", "is_injected"
    ]
    other_cols = [c for c in df.columns if c not in meta_cols]
    df = df[meta_cols + other_cols]

    return df

# ----------------------------
# データ保存・ロード
# ----------------------------
def save_interim(df: pd.DataFrame, path: str):
    """中間データをParquetで保存"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_parquet(path, index=False)

def load_clean_data() -> pd.DataFrame:
    """Parquetがあればそれをロード、なければ生データから生成"""
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    raw_path = os.path.join(base_dir, "data/raw/StatsAllGroup.csv")
    clean_path = os.path.join(base_dir, "data/interim/StatsAllGroup_cleaned.parquet")

    if os.path.exists(clean_path):
        print("⚡ クリーンデータをキャッシュからロード")
        return pd.read_parquet(clean_path)
    else:
        print("🧹 クリーンデータを生成中...")
        df_raw = load_raw_data(raw_path)
        df_clean = clean_stats_data(df_raw)
        save_interim(df_clean, clean_path)
        return df_clean
