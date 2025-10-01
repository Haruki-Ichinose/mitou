# リアルタイム怪我リスク予測エンジン

## 📖 概要 (Overview)

本プロジェクトは、プロスポーツ選手（特にサッカー選手）の怪我を予防することを目的としたWebアプリケーションです。  
GPSデータから算出される **ACWR（急性:慢性負荷比率）** を基盤に、機械学習モデルを用いて選手の怪我リスクを **リアルタイムで予測・可視化** します。

---

## 🚀 技術スタック (Technology Stack)

- **インフラ (Infrastructure):** Docker, Docker Compose  
- **バックエンド (Backend):** Django, Django REST Framework  
- **フロントエンド (Frontend):** React  
- **データベース (Database):** PostgreSQL  
- **機械学習 / データ分析 (ML / Data Analysis):** Pandas, NumPy, scikit-learn, XGBoost, SHAP  

---

## 🛠️ 環境構築・実行方法 (Setup & Run)

### 1. リポジトリをクローン

```bash
git clone https://github.com/Haruki-Ichinose/mitou.git
cd mitou
```

### 2. 環境変数ファイルを作成

プロジェクトルートに `.env` ファイルを作成し、以下をコピーしてください。

```env
# PostgreSQL Database Settings
POSTGRES_DB=injury_db
POSTGRES_USER=admin
POSTGRES_PASSWORD=password

# Django Application Settings
SECRET_KEY=django-insecure-a-very-secret-key-for-dev
DEBUG=True
```

### 3. Dockerコンテナをビルドして起動

```bash
docker-compose up -d --build
```

### 4. アプリケーションにアクセス

- フロントエンド (React): [http://localhost:3000](http://localhost:3000)  
- バックエンド (Django API): [http://localhost:8000](http://localhost:8000)  

### 5. コンテナの停止

```bash
docker-compose down
```

---

## ✍️ 開発フロー (Development Workflow)

### VSCodeでの開発 (推奨)

本プロジェクトは VSCode の **Dev Containers（開発コンテナ）** に対応しています。

1. VSCodeでプロジェクトフォルダを開く  
2. 右下に表示される **「Reopen in Container」** をクリック  
   またはコマンドパレットから  
   **「Dev Containers: Open Folder in Container...」** を選択  
3. 以下の作業環境から目的に合ったものを選択  
   - Backend Development (Django)  
   - Frontend Development (React)  
   - Data Analysis (Notebook)  

VSCodeが自動でコンテナへ接続し、必要な拡張機能をインストールします。  

---

### Gitブランチ戦略

新しい機能開発やバグ修正を行う際は、必ず新しいブランチを作成してください。

```bash
# 例: データ分析用のブランチを作成
git switch -c feature/data-analysis
```

---

### コミットメッセージ規約

本プロジェクトでは、**Conventional Commits** の規約に従います。  
メッセージは英語で記述してください。  

#### フォーマット

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type (必須)

- **feat:** 新機能の追加  
- **fix:** バグ修正  
- **docs:** ドキュメントのみの変更  
- **style:** フォーマットやtypo修正など（動作に影響なし）  
- **refactor:** 機能追加や修正を伴わない内部的改善  
- **test:** テストの追加・修正  
- **chore:** ビルド・ツール・ライブラリなどの変更  

#### Scope (任意)

- backend, api, frontend, notebook, docker, deps など  

#### Subject (必須)

- 50文字以内で簡潔に記述  
- 命令形（例: add, fix, update...）で始める  
- 文頭は小文字、末尾にピリオド不要  

#### Body / Footer (任意)

- 詳細や理由を記述（必要に応じて）  
- 関連Issue番号や破壊的変更（BREAKING CHANGE）を明記  

---

### コミットメッセージ例

```bash
# 新機能の追加
git commit -m "feat(api): add endpoint for player injury prediction"

# バグ修正
git commit -m "fix(frontend): correct player name display issue"

# ドキュメント更新
git commit -m "docs(readme): update setup instructions for notebook service"

# 依存関係更新
git commit -m "chore(deps): update scikit-learn to version 1.5.1"
```
