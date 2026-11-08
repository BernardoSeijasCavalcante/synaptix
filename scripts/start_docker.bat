@echo off
cd /d "%~dp0\.."
echo ==========================================================
echo   SYNAPTIX - INICIALIZACAO COM PM2 DENTRO DO DOCKER
echo ==========================================================

where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERRO] O comando 'docker' nao foi encontrado no PATH do Windows.
    echo Certifique-se de que o Docker Desktop esta aberto e em execucao.
    pause
    exit /b 1
)

echo [1/3] Liberando porta 8000 se houver processo anterior...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /f /pid %%a 2>nul

echo [2/3] Compilando e iniciando container com PM2 Runtime...
docker compose up -d --build

echo [3/3] Status dos containers:
docker compose ps

echo.
echo ==========================================================
echo   SYNAPTIX RODANDO PERMANENTE COM PM2 NO CONTAINER DOCKER!
echo.
echo   Link de Acesso Publico via Tunel:
echo   -> https://synaptix.amtheinner.com
echo.
echo   Acesso Local:
echo   -> http://127.0.0.1:8000
echo ==========================================================
pause
