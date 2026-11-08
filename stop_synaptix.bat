@echo off
echo Parando o Synaptix e o Supervisor...
powershell.exe -ExecutionPolicy Bypass -File "%~dp0scripts\stop_synaptix.ps1"
pause
