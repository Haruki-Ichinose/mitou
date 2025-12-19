# プロジェクトセットアップと実行手順

## 環境変数（.env）の作成

プロジェクトルートに `.env` を作成し、以下を貼り付けてください（開発用）。

```env
# PostgreSQL Database Settings (Docker / compose を使う場合)
POSTGRES_DB=injury_db
POSTGRES_USER=admin
POSTGRES_PASSWORD=password

# Django Application Settings
DJANGO_SECRET_KEY=django-insecure-a-very-secret-key-for-dev
DJANGO_DEBUG=True

# Comma separated
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

- `DJANGO_ALLOWED_HOSTS` / `CORS_ALLOWED_ORIGINS` はカンマ区切りで複数指定可能です。
- Codespaces / Preview URL が変わる環境では、該当 URL をそれぞれに追加してください。
- `.env` は Git にコミットしません（`.env.example` を用意するのがおすすめ）。

## raw データの置き場所

- raw CSV は Git 管理しません。以下に配置してください:  
  `data/raw/StatsAllGroup.csv`
- 文字コードは `cp932` / `shift_jis` の可能性がありますが、import コマンド側で自動判定します。

## 初回セットアップ（Backend）

```bash
cd backend

# 依存が requirements.txt にある想定（なければ poetry/pipenv の手順に置き換えてください）
pip install -r requirements.txt

# DB 初期化
python manage.py migrate
```

## データ取り込み〜特徴量〜異常検知（推奨フロー）

以下の順番で実行すると、フロントで可視化できる状態になります。

1. raw 取り込み

   ```bash
   python manage.py import_statsallgroup_raw --csv /workspace/data/raw/StatsAllGroup.csv
   ```

   実行後、`DataUpload` に upload が作成されます。最新の `upload_id` は Django shell で確認できます。

   ```bash
   python manage.py shell
   ```

   ```python
   from workload.models import DataUpload
   DataUpload.objects.order_by("-id").values("id","source_filename","parse_status")[:5]
   ```

2. raw の date 列のバックフィル（必要な場合）

   raw テーブルの `date` が `NULL` の場合に実行します。

   ```bash
   python manage.py backfill_raw_dates --upload_id <UPLOAD_ID>
   ```

3. 日次集計（gps_daily）

   ```bash
   python manage.py build_gps_daily --upload_id <UPLOAD_ID> --delete_existing
   ```

4. 派生特徴量（ACWR/EWMA）

   ```bash
   python manage.py build_workload_features --delete_existing
   ```

5. Static anomaly（03A 相当）

   ```bash
   python manage.py run_static_anomaly_db
   ```

6. Dynamic anomaly（03B 相当）

   ```bash
   python manage.py run_dynamic_anomaly_db --static_run_id <STATIC_RUN_ID> --epochs 20 --threshold_q 0.992
   ```

`STATIC_RUN_ID` は以下で確認できます：

```bash
python manage.py shell
```

```python
from workload.models import FeatureRun
FeatureRun.objects.filter(run_type="static").order_by("-id").values("id","created_at","params")[:3]
```

## API サーバ起動（Backend）

```bash
cd backend
python manage.py runserver 0.0.0.0:8000
```

## フロントエンド依存関係のインストール（初回のみ）

```bash
cd frontend
npm install
```

## フロントエンド起動（Frontend）

推奨：CRA proxy を使う（CORS 回避で楽）

- `frontend/package.json` に proxy を追加：

  ```json
  {
    "proxy": "http://localhost:8000"
  }
  ```

- そのうえでフロント側の axios は `baseURL: "/api"` を使ってください。

- 起動：

  ```bash
  cd frontend
  npm start
  ```

## フロントで使う主な API（確認用）

- `GET /api/workload/athletes/`
- `GET /api/workload/runs/`
- `GET /api/workload/athletes/<athlete_id>/timeseries/?dynamic_run_id=<id>&static_run_id=<id>`

## モバイルアプリ（React Native / Expo Dev Client）

選手本人向けのスマホアプリは `mobile/` にあります。既存 API を利用し、選手 ID/名前で絞り込んだ ACWR 推移のみを表示します。Expo Go は使わず、開発ビルド（Dev Client）で動かします。

```bash
cd mobile
npm install
echo "EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api" > .env  # シミュレーターから API を叩く例
npx expo prebuild --clean
cd ios && pod install --repo-update && cd ..
npx expo run:ios
npx expo start --dev-client --clear   # JS バンドラ（別ターミナル）
```

- 実機で叩く場合は `.env` を `http://<Mac の LAN IP>:8000/api` に変更してください。
- 詳細は `mobile/README.md` を参照してください。

## Git ブランチ戦略

新規機能 / バグ修正は必ずブランチを切って作業してください。

```bash
git switch -c feature/data-analysis
```

## コミットメッセージ規約（Conventional Commits）

本プロジェクトでは Conventional Commits を採用します。メッセージは英語で記述してください。

- フォーマット

  ```
  <type>(<scope>): <subject>

  <body>

  <footer>
  ```

- Type（必須）
  - `feat`: 新機能
  - `fix`: バグ修正
  - `docs`: ドキュメントのみ
  - `style`: フォーマット/typo（挙動変更なし）
  - `refactor`: 内部改善（機能追加なし）
  - `test`: テスト
  - `chore`: ツール/依存/ビルド関連

- Scope（任意）
  - 例：`backend`, `api`, `frontend`, `mobile`, `notebook`, `docker`, `deps`

- Subject（必須）
  - 50 文字以内
  - 命令形で開始（add/fix/update…）
  - 文頭は小文字、末尾のピリオド不要

- 例

  ```bash
  git commit -m "feat(api): add athlete timeseries endpoint"
  git commit -m "fix(frontend): handle paginated api responses"
  git commit -m "docs(readme): document data import pipeline"
  git commit -m "chore(deps): update chart.js packages"
  ```