# ==============================================================================
# Stage 1: Compilação Estática do Frontend React (Sem Vite Dev Server em Produção)
# ==============================================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ==============================================================================
# Stage 2: Runtime Blindado com PM2 + Python + FastAPI (Usuário Não-Root)
# ==============================================================================
FROM python:3.11-slim-bookworm AS synaptix-runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PM2_HOME=/app/.pm2 \
    SYNAPTIX_BIND_HOST=0.0.0.0 \
    SYNAPTIX_BIND_PORT=8000 \
    SYNAPTIX_ENABLE_DOCS=false

# Instala Node.js, PM2, procps e curl para gerenciamento permanente de processos dentro do container
RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs npm procps curl && \
    npm install -g pm2 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Cria grupo e usuário de sistema não-root sem shell de login (Least Privilege)
RUN groupadd -g 10001 synaptix && \
    useradd -u 10001 -g synaptix -s /usr/sbin/nologin -M synaptix

WORKDIR /app/backend

# Instala dependências Python de produção e segurança
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copia código do backend, build estático do frontend e configuração do PM2
COPY backend/ /app/backend/
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist
COPY ecosystem.docker.cjs /app/ecosystem.config.cjs

# Ajusta permissões e converte quebras de linha CRLF -> LF no entrypoint.sh
RUN sed -i 's/\r$//' /app/backend/entrypoint.sh && \
    chmod +x /app/backend/entrypoint.sh && \
    mkdir -p /home/synaptix/.pm2 /app/.pm2 /app/backend/uploads && \
    chown -R synaptix:synaptix /home/synaptix /app

USER 10001:10001

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)" || exit 1

ENTRYPOINT ["/app/backend/entrypoint.sh"]
