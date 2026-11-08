@echo off
cd /d "%~dp0\.."

:: Verifica privilegios de Administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Solicitando elevacao de Administrador para instalar e configurar o Docker...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ==========================================================
echo   SYNAPTIX - INSTALACAO E EXECUCAO DOCKER (ADMIN)
echo ==========================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_docker_admin.ps1"
pause
