# notebook/Dockerfile

# jupyter/scipy-notebook イメージをベースとして使用
FROM jupyter/scipy-notebook:latest

# 作業ディレクトリを /home/jovyan/work に設定
WORKDIR /home/jovyan/work

# requirements.txt をコンテナにコピー
COPY requirements.txt .

# 依存関係をインストール
RUN pip install --no-cache-dir -r requirements.txt