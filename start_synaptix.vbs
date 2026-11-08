' Inicia o Supervisor do Synaptix em segundo plano oculto
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File ""c:\Projetos\synaptix\scripts\synaptix_supervisor.ps1""", 0, False
