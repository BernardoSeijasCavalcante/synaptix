@echo off
:: ==============================================================================
:: SYNAPTIX - INICIALIZACAO PERMANENTE EM SEGUNDO PLANO (DOCKER + PM2)
:: ==============================================================================

:: 1. Garante que o servico Cloudflared do Windows esteja rodando
net start Cloudflared >nul 2>&1

:: 2. Inicia o daemon do Docker no WSL2 Ubuntu (caso nao esteja ativo)
wsl -d Ubuntu -u root service docker status >nul 2>&1
if %ERRORLEVEL% neq 0 (
    wsl -d Ubuntu -u root service docker start >nul 2>&1
)

:: 3. Garante que o container Docker synaptix-core esteja rodando com PM2 interno
wsl -d Ubuntu -u root -e bash -c "cd /mnt/c/Projetos/synaptix && docker compose up -d synaptix" >nul 2>&1

:: 4. Mantem uma sessao do WSL permanentemente ativa para impedir o desligamento automatico por ociosidade (Idle Timeout)
wsl -d Ubuntu -u root -e sleep infinity
