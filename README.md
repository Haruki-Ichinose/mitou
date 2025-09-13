# リアルタイム怪我リスク予測エンジン

## 📖 概要 (Overview)
本プロジェクトは、プロスポーツ選手（特にサッカー選手）の怪我を予防することを目的としたWebアプリケーションです。

GPSデータから算出される **ACWR（急性:慢性負荷比率）** をベースに、**RPE（自覚的運動強度）** などの主観的データも組み合わせ、機械学習モデルで選手の怪我リスクを **リアルタイムで予測・可視化** します。

このリポジトリは、その **プロトタイプの開発環境** です。

## 🚀 技術スタック (Technology Stack)
- **インフラ (Infrastructure):** Docker, Docker Compose  
- **バックエンド (Backend):** Django, Django Rest Framework  
- **フロントエンド (Frontend):** React  
- **データベース (Database):** PostgreSQL  
- **機械学習 / データ分析 (ML / Data Analysis):** Pandas, NumPy, scikit-learn, XGBoost, SHAP  


## 🛠️ 環境構築・実行方法 (Setup & Run)

### 1. リポジトリをクローン
```bash
git clone https://github.com/Haruki-Ichinose/mitou.git
cd mitou
```
### 2. 環境変数ファイルを作成
プロジェクトルートに .env ファイルを作成し、以下をコピーしてください。

#### PostgreSQL Database Settings
    POSTGRES_DB=injury_db
    POSTGRES_USER=admin
    POSTGRES_PASSWORD=password

#### Django Application Settings
    SECRET_KEY=django-insecure-a-very-secret-key-for-dev
    DEBUG=True

### 3. Dockerコンテナをビルドして起動
#### フォアグラウンドで起動（ログ確認用）
```bash
docker-compose up --build
```

#### バックグラウンドで起動（推奨）
```bash
docker-compose up -d --build
```

### 4. アプリケーションにアクセス
それぞれ以下のURLにアクセスしてください。
フロントエンド (React): http://localhost:3000
バックエンド (Django API): http://localhost:8000

### 5. コンテナの停止
```bash
docker-compose down
```

## 📂 ディレクトリ構成 (Directory Structure)
    .
    ├── backend/            # Django (バックエンド) のソースコード
    ├── frontend/           # React (フロントエンド) のソースコード
    ├── .env                # 環境変数ファイル (Git管理外)
    ├── .gitignore          # Gitの無視リスト
    ├── docker-compose.yml  # Dockerコンテナの定義ファイル
    └── README.md           # このファイル

## 🛠 Docker + Git 作業フロー

このセクションでは、**Dockerコンテナを使った開発環境**での作業と、**Gitでのローカル・リモート同期**の手順をまとめています。

### 1. 作業開始前にリモートの変更を取り込む
他の開発者の変更がある場合、作業前に最新状態にします。

```bash
# リモートの最新情報を取得
git fetch origin

# ローカルブランチにマージ
git merge origin/<ブランチ名>

# もしくは pull で一括取得＆マージ
git pull origin <ブランチ名>
```
### 2. Dockerコンテナを起動して作業
```bash
# フォアグラウンドで起動（ログ確認用）
docker-compose up --build

# バックグラウンドで起動（推奨）
docker-compose up -d --build
```

### 3. ローカルで変更した場合
```bash
# 変更内容の確認
git status

# 変更ファイルをステージに追加
git add <ファイル名>  # 個別
git add .             # 全て

# コミット（ローカルに保存）
git commit -m "変更内容の説明"

# リモートに反映
git push origin <ブランチ名>
```
### 4. 作業終了時
```bash
# コンテナを停止
docker-compose down
```