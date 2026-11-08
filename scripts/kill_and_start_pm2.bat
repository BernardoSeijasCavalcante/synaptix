@echo off
cd /d "%~dp0\.."
echo ==========================================================
echo   SYNAPTIX - INICIALIZACAO COMPLETA COM PM2
echo ==========================================================

echo [1/4] Finalizando possiveis instancias anteriores...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :6080 ^| findstr LISTENING') do taskkill /f /pid %%a 2>nul

echo [2/4] Verificando PM2...
set PM2_EXEC=pm2
where pm2 >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] PM2 global nao encontrado. Usando npx pm2...
    set PM2_EXEC=npx pm2
)

echo [3/4] Iniciando processos via ecosystem.config.cjs...
call %PM2_EXEC% start ecosystem.config.cjs

echo [4/4] Salvando estado no PM2...
call %PM2_EXEC% save

echo.
echo ==========================================================
echo   SYNAPTIX RODANDO COM SUCESSO NO PM2!
echo.
echo   Link de Acesso Publico via Tunel:
echo   -> https://synaptix.amtheinner.com
echo.
echo   Acesso Local:
echo   -> Frontend: http://localhost:6080
echo   -> Backend:  http://127.0.0.1:8000
echo ==========================================================
echo.
call %PM2_EXEC% status
pause
