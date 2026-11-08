# Synaptix Permanent Supervisor Daemon
# Mantém o Backend (FastAPI :8000) e o Frontend (Vite :6080) rodando continuamente em segundo plano

$ErrorActionPreference = "Continue"

$RootDir = (Get-Item $PSScriptRoot).Parent.FullName
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$LogsDir = Join-Path $RootDir "logs"
$PythonExe = Join-Path $BackendDir "venv\Scripts\python.exe"
$StopSignalFile = Join-Path $LogsDir "stop.signal"
$PidFile = Join-Path $LogsDir "supervisor.pid"

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

# 1. Garantir instância única do Supervisor
if (Test-Path $PidFile) {
    $existingPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($existingPid -and ($existingPid -ne $PID)) {
        $existingProc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
        if ($existingProc -and ($existingProc.ProcessName -like "*powershell*")) {
            exit 0
        }
    }
}
$PID | Set-Content -Path $PidFile -Force

# Remove qualquer sinal de parada remanescente
if (Test-Path $StopSignalFile) {
    Remove-Item $StopSignalFile -Force -ErrorAction SilentlyContinue
}

function Write-SupervisorLog {
    param([string]$Message)
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $logEntry = "[$timestamp] $Message"
    Add-Content -Path (Join-Path $LogsDir "supervisor.log") -Value $logEntry
}

function Test-BackendHealth {
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8000/healthz" -TimeoutSec 3 -ErrorAction Stop
        return ($resp.status -eq "ok")
    } catch {
        return $false
    }
}

function Test-FrontendHealth {
    try {
        $conn = Get-NetTCPConnection -LocalPort 6080 -State Listen -ErrorAction SilentlyContinue
        return ($null -ne $conn)
    } catch {
        return $false
    }
}

function Kill-PortProcess {
    param([int]$Port)
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        foreach ($conn in $conns) {
            $pId = $conn.OwningProcess
            if ($pId -and $pId -ne 0) {
                Stop-Process -Id $pId -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}

Write-SupervisorLog "Supervisor iniciado (PID: $PID). Monitorando Synaptix..."

$backendFailures = 0
$frontendFailures = 0

while ($true) {
    # Verificar se foi solicitado o encerramento do supervisor
    if (Test-Path $StopSignalFile) {
        Write-SupervisorLog "Sinal de parada detectado. Encerrando supervisor."
        Remove-Item $StopSignalFile -Force -ErrorAction SilentlyContinue
        if (Test-Path $PidFile) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
        exit 0
    }

    # ==========================
    # 1. VERIFICAÇÃO DO BACKEND
    # ==========================
    $backendOk = Test-BackendHealth
    if (-not $backendOk) {
        $backendFailures++
        if ($backendFailures -ge 2) {
            Write-SupervisorLog "Backend indisponível (falha $backendFailures). Reiniciando..."
            Kill-PortProcess -Port 8000
            Start-Sleep -Seconds 2

            $backendOut = Join-Path $LogsDir "backend.log"
            $backendErr = Join-Path $LogsDir "backend_err.log"

            Start-Process -FilePath $PythonExe `
                          -ArgumentList "-m uvicorn main:app --host 127.0.0.1 --port 8000" `
                          -WorkingDirectory $BackendDir `
                          -RedirectStandardOutput $backendOut `
                          -RedirectStandardError $backendErr `
                          -WindowStyle Hidden

            $backendFailures = 0
            Write-SupervisorLog "Backend disparado com sucesso."
        }
    } else {
        $backendFailures = 0
    }

    # ==========================
    # 2. VERIFICAÇÃO DO FRONTEND
    # ==========================
    $frontendOk = Test-FrontendHealth
    if (-not $frontendOk) {
        $frontendFailures++
        if ($frontendFailures -ge 2) {
            Write-SupervisorLog "Frontend indisponível (porta 6080 inativa). Reiniciando..."
            Kill-PortProcess -Port 6080
            Start-Sleep -Seconds 2

            $frontendOut = Join-Path $LogsDir "frontend.log"
            $frontendErr = Join-Path $LogsDir "frontend_err.log"

            Start-Process -FilePath "cmd.exe" `
                          -ArgumentList "/c npm run dev" `
                          -WorkingDirectory $FrontendDir `
                          -RedirectStandardOutput $frontendOut `
                          -RedirectStandardError $frontendErr `
                          -WindowStyle Hidden

            $frontendFailures = 0
            Write-SupervisorLog "Frontend disparado com sucesso."
        }
    } else {
        $frontendFailures = 0
    }

    Start-Sleep -Seconds 10
}
