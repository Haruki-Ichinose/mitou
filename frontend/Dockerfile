# Node.jsの軽量な公式イメージをベースとして使用します
# Use the official lightweight Node.js image as a base
FROM node:18-alpine

# コンテナ内の作業ディレクトリを設定します
# Set the working directory inside the container
WORKDIR /app

# 最初にpackage.jsonとpackage-lock.jsonをコピーします
# これにより、ソースコードの変更時にもnpm installの再実行が不要になり、ビルドが高速化されます
# First, copy package.json and package-lock.json
# This speeds up the build process by avoiding re-running npm install when only source code changes
COPY package*.json ./

# プロジェクトの依存関係をインストールします
# Install project dependencies
RUN npm install

# プロジェクトの全てのファイルをコンテナにコピーします
# Copy all project files into the container
COPY . .

# Reactの開発サーバーが使用する3000番ポートを公開します
# Expose port 3000, which is used by the React development server
EXPOSE 3000

