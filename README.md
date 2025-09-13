リアルタイム怪我リスク予測エンジン (Real-time Injury Risk Prediction Engine)
概要 (Overview)
本プロジェクトは、プロスポーツ選手の怪我、特にサッカー選手に焦点を当て、障害の発生を予防することを目的としたWebアプリケーションです。
GPSデータから算出されるACWR（急性:慢性負荷比率）をベースに、RPE（自覚的運動強度）などの主観的データも組み合わせ、機械学習モデルを用いて選手の怪我リスクをリアルタイムで予測・可視化します。

このリポジトリは、そのプロトタイプの開発環境です。

技術スタック (Technology Stack)
インフラ: Docker, Docker Compose

バックエンド: Django, Django Rest Framework

フロントエンド: React

データベース: PostgreSQL

機械学習 / データ分析: Pandas, NumPy, scikit-learn, XGBoost, SHAP

環境構築・実行方法 (Setup and How to Run)
このプロジェクトをローカル環境で実行するための手順は以下の通りです。

1. リポジトリをクローン
git clone [https://github.com/Haruki-Ichinose/mitou.git](https://github.com/Haruki-Ichinose/mitou.git)
cd mitou

2. 環境変数ファイルを作成
プロジェクトのルートディレクトリに .env ファイルを作成し、以下の内容をコピー＆ペーストしてください。

# PostgreSQL Database Settings
POSTGRADES_DB=athlete_risk_predictor
POSTGRES_USER=admin
POSTGRES_PASSWORD=password1234

# Django Application Settings
SECRET_KEY=your-super-secret-key-for-development
DEBUG=True

3. Dockerコンテナをビルドして起動
以下のコマンドをプロジェクトのルートディレクトリで実行します。
初回起動時や、Dockerfile, requirements.txt, package.json を変更した場合は --build オプションを付けてください。

# フォアグラウンドで起動 (ログが見たい場合)
docker-compose up --build

# バックグラウンドで起動 (推奨)
docker-compose up -d --build

4. アプリケーションにアクセス
コンテナの起動が完了したら、ブラウザで以下のURLにアクセスしてください。

フロントエンド (React): http://localhost:3000

バックエンド (Django API): http://localhost:8000

5. コンテナの停止
# バックグラウンドで起動した場合
docker-compose down

ディレクトリ構成 (Directory Structure)
.
├── backend/         # Django (バックエンド) のソースコード
├── frontend/        # React (フロントエンド) のソースコード
├── .env             # 環境変数ファイル (Git管理外)
├── .gitignore       # Gitの無視リスト
├── docker-compose.yml # Dockerコンテナの定義ファイル
└── README.md        # このファイル