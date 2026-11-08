@echo off
cd /d "%~dp0\.."
echo ==========================================================
echo   SYNAPTIX - INICIALIZACAO PERMANENTE VIA PM2
echo ==========================================================

echo [1/3] Verificando instalacao do PM2...
set PM2_EXEC=pm2
where pm2 >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] Usando npx pm2...
    set PM2_EXEC=npx pm2
)

echo [2/3] Iniciando aplicacoes com PM2...
call %PM2_EXEC% start ecosystem.config.cjs

echo [3/3] Salvando estado...
call %PM2_EXEC% save

echo.
echo ==========================================================
echo   Synaptix ativo e gerenciado pelo PM2!
echo   Link do Tunel: https://synaptix.amtheinner.com
echo ==========================================================
call %PM2_EXEC% status
pause
