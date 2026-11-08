#!/bin/sh
set -e

echo "[Synaptix Zero-Trust] Executando verificacao e migracao de criptografia AES-256-GCM..."
python migrate_security.py

echo "[Synaptix Zero-Trust] Iniciando servidor gerenciado pelo PM2 Runtime no Container Docker..."
exec pm2-runtime /app/ecosystem.config.cjs
