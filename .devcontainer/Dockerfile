# ベースは SciPy Notebook（pandas/numpy/sklearn/Jupyter 完備）
FROM jupyter/scipy-notebook:latest

# root権限に切り替え
USER root

# OS依存パッケージ（Postgresクライアント、Node.js用）
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    libpq-dev \
    gcc \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Node.js 18 を追加
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Pythonパッケージ（Django / DRF / Postgres / ML系）
RUN pip install --no-cache-dir \
    Django==5.2.0 \
    djangorestframework==3.15.1 \
    psycopg2-binary==2.9.9 \
    python-dotenv \
    django-cors-headers \
    pandas \
    numpy \
    scikit-learn \
    xgboost==2.0.3 \
    shap==0.45.0 \
    jupyterlab

# wait-for-it を追加
COPY backend/wait-for-it.sh /usr/local/bin/wait-for-it
RUN chmod +x /usr/local/bin/wait-for-it

# 作業ディレクトリ（/workspace に統一）
WORKDIR /workspace

# jovyan ユーザに戻す
USER jovyan
