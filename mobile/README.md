# ACWR Mobile (React Native)

選手本人向けのモバイルアプリです。React Native (Expo) で実装し、workload系APIから取得したデータを選手IDまたは選手名で絞り込んでACWR推移を表示します。管理者用のWebアプリとは役割を分離し、選手は自分のデータのみを閲覧できます。

## セットアップ

```bash
cd mobile
npm install
```

環境変数として API ベースURLを指定します（Expo公開変数 `EXPO_PUBLIC_` を使用）。

```bash
# mobile/.env
# iOSシミュレーターからMacのAPIを叩く例（ポートは実際のバックエンドに合わせる）
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api

# 実機から叩く場合はMacのLAN IPを指定
# EXPO_PUBLIC_API_BASE_URL=http://<MacのLAN IP>:8000/api
```

## 実行（開発ビルド / Dev Client）

Expo Go は使わず、開発ビルドで動かします。

```bash
cd mobile
npx expo prebuild --clean           # ios/ を生成（未コミットでも進めるなら Y）
cd ios && pod install --repo-update && cd ..
npx expo run:ios                    # シミュレーターに開発ビルドをインストール

# JSバンドラを別ターミナルで起動（キャッシュクリア）
npx expo start --dev-client --clear
```

バックエンドに届かない場合は `.env` の URL/ポートと、バックエンド側のログを確認してください。

## 画面フロー

1. **ログイン画面**: 選手IDまたは選手名を入力し「ログイン」をタップ。
2. **ダッシュボード**: 直近30日のACWR推移グラフ、最新日付と最新ACWRを表示。左側の全選手一覧はなく、入力した選手のみのデータを扱います。

## データ仕様

- 取得エンドポイント: `GET /api/workload/athletes/`, `GET /api/workload/athletes/{athlete_id}/timeseries/`
- フィルタ条件: `athlete_id` が入力値と一致、または `athlete_name` が入力値と完全一致（大文字小文字を無視）。
- グラフ: 最新日付を基準に直近30日分を描画。適正範囲 (0.8–1.3) を帯で表示し、2.0 を超える値があれば縦軸を自動拡張します。
