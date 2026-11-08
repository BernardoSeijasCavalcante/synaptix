# Script para verificar o status em tempo real do Synaptix

$RootDir = (Get-Item $PSScriptRoot).Parent.FullName
$LogsDir = Join-Path $RootDir "logs"
$PidFile = Join-Path $LogsDir "supervisor.pid"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "       STATUS DO PROJETO SYNAPTIX        " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Supervisor
$supRunning = $false
if (Test-Path $PidFile) {
    $supPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($supPid) {
        $p = Get-Process -Id $supPid -ErrorAction SilentlyContinue
        if ($p) {
            $supRunning = $true
            Write-Host "[SUPERVISOR] Ativo (PID: $supPid)" -ForegroundColor Green
        }
    }
}
if (-not $supRunning) {
    Write-Host "[SUPERVISOR] Parado" -ForegroundColor Red
}

# 2. Backend
$backendConn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($backendConn) {
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/healthz" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "[BACKEND]    Ativo em http://127.0.0.1:8000 (PID: $($backendConn.OwningProcess), Healthz: $($res.status))" -ForegroundColor Green
    } catch {
        Write-Host "[BACKEND]    Porta 8000 aberta (PID: $($backendConn.OwningProcess)), mas healthz não respondeu" -ForegroundColor Yellow
    }
} else {
    Write-Host "[BACKEND]    Inativo (Porta 8000 fechada)" -ForegroundColor Red
}

# 3. Frontend
$frontendConn = Get-NetTCPConnection -LocalPort 6080 -State Listen -ErrorAction SilentlyContinue
if ($frontendConn) {
    Write-Host "[FRONTEND]   Ativo em http://localhost:6080 (PID: $($frontendConn.OwningProcess))" -ForegroundColor Green
} else {
    Write-Host "[FRONTEND]   Inativo (Porta 6080 fechada)" -ForegroundColor Red
}

Write-Host "-----------------------------------------" -ForegroundColor DarkGray
Write-Host "Logs recentes do Supervisor:" -ForegroundColor Gray
$logFile = Join-Path $LogsDir "supervisor.log"
if (Test-Path $logFile) {
    Get-Content $logFile -Tail 5 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
} else {
    Write-Host "  (Nenhum log gerado ainda)" -ForegroundColor DarkGray
}
Write-Host "=========================================" -ForegroundColor Cyan
