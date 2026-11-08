@echo off
echo Iniciando Synaptix em segundo plano permanente...
wscript.exe "%~dp0start_synaptix.vbs"
timeout /t 3 /nobreak >nul
powershell.exe -ExecutionPolicy Bypass -File "%~dp0scripts\status_synaptix.ps1"
pause
