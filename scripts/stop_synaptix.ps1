# Script para encerrar o Synaptix e seu Supervisor com segurança

$RootDir = (Get-Item $PSScriptRoot).Parent.FullName
$LogsDir = Join-Path $RootDir "logs"
$StopSignalFile = Join-Path $LogsDir "stop.signal"
$PidFile = Join-Path $LogsDir "supervisor.pid"

Write-Host "Enviando sinal de parada para o Supervisor..." -ForegroundColor Yellow
New-Item -ItemType File -Path $StopSignalFile -Force | Out-Null

if (Test-Path $PidFile) {
    $supPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($supPid) {
        Stop-Process -Id $supPid -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

# Encontra e encerra quaisquer instâncias do powershell executando synaptix_supervisor
Get-WmiObject Win32_Process -Filter "Name like '%powershell%'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*synaptix_supervisor.ps1*"
} | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Liberando porta 8000 (Backend)..." -ForegroundColor Yellow
$bConns = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
foreach ($c in $bConns) {
    if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Liberando porta 6080 (Frontend)..." -ForegroundColor Yellow
$fConns = Get-NetTCPConnection -LocalPort 6080 -ErrorAction SilentlyContinue
foreach ($c in $fConns) {
    if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Synaptix encerrado com sucesso." -ForegroundColor Green
