FROM jupyter/scipy-notebook:latest

USER root

RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    libpq-dev \
    gcc \
    nodejs \
    npm \
    postgresql-client \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    Django==5.2.0 \
    djangorestframework==3.15.1 \
    djangorestframework-simplejwt==5.3.1 \
    psycopg2-binary==2.9.9 \
    python-dotenv \
    django-cors-headers \
    pandas \
    numpy \
    scikit-learn \
    xgboost==2.0.3 \
    shap==0.45.0 \
    jupyterlab \
    honcho

RUN pip install --no-cache-dir \
    torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

COPY backend/wait-for-it.sh /usr/local/bin/wait-for-it
RUN chmod +x /usr/local/bin/wait-for-it

WORKDIR /workspace

USER jovyan
