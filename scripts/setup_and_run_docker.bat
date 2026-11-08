@echo off
cd /d "%~dp0\.."
echo ==========================================================
echo   SYNAPTIX - INSTALACAO E EXECUCAO DOCKER AUTOMATIZADA
echo ==========================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_and_run_docker.ps1"
pause
