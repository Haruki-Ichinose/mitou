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
- raw CSV は Git 管理しません。以下に配置してください: `data/raw/StatsAllGroup.csv`
- 文字コードは `cp932` / `shift_jis` の可能性がありますが、import コマンド側で自動判定します。

## データの取り込みと計算

1. 生データ (CSV) の取り込み  
   ```bash
   python manage.py import_statsallgroup_raw --csv /workspace/data/raw/StatsAllGroup.csv --user system
   ```

2. 日次データの集計 (HSR, ダイブ負荷などの計算)  
   ```bash
   python manage.py build_gps_daily --delete_existing
   ```

3. 分析指標の算出 (ACWR, Monotony, 0埋め処理)  
   ```bash
   python manage.py build_workload_features
   ```

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