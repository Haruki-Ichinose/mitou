### 環境変数ファイルを作成

プロジェクトルートに `.env` ファイルを作成し、以下をコピーしてください。

```env
# PostgreSQL Database Settings
POSTGRES_DB=injury_db
POSTGRES_USER=admin
POSTGRES_PASSWORD=password

# Django Application Settings
SECRET_KEY=django-insecure-a-very-secret-key-for-dev
DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

`DJANGO_ALLOWED_HOSTS` と `CORS_ALLOWED_ORIGINS` はカンマ区切りで指定できます。Preview 環境や Codespaces の URL が変わる場合は、それぞれの値を追加してください。

### フロントエンド依存関係のインストール

`honcho start` で React 開発サーバーを起動する前に、以下を 1 度実行して `node_modules` を作成してください。

```bash
cd frontend
npm install
```

### モバイルアプリ (React Native / Expo Dev Client)

選手本人向けのスマホアプリを `mobile/` に追加しました。既存APIを利用し、選手ID/名前で絞り込んだACWR推移のみを表示します。Expo Go は使わず、開発ビルドで動かします。

```bash
cd mobile
npm install
echo "EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api" > .env  # シミュレーターからMacのAPIを叩く場合
npx expo prebuild --clean
cd ios && pod install --repo-update && cd ..
npx expo run:ios
npx expo start --dev-client --clear   # JSバンドラ（別ターミナル）
```

実機で叩く場合は `.env` を `http://<MacのLAN IP>:8000/api` に変更してください。詳細は `mobile/README.md` を参照してください。

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
