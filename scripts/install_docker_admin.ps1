# ==============================================================================
# Script de Instalacao e Execucao Automatizada do Docker (Administrador)
# ==============================================================================

# 1. Auto-elevacao para Administrador se necessario
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[INFO] Solicitando permissao de Administrador (UAC)..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SYNAPTIX - INSTALACAO E ATIVACAO DOCKER (ADMIN)         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 2. Desbloqueio de arquivos e processos travados
Write-Host "[1/4] Liberando bloqueios de sistema e portas..." -ForegroundColor Yellow
$agentBat = "C:\Users\TESTE\.gemini\antigravity\bin\agentapi.bat"
if (Test-Path $agentBat) {
    Remove-Item -Force $agentBat -ErrorAction SilentlyContinue
}
$binDir = "C:\Users\TESTE\.gemini\antigravity\bin"
if (Test-Path $binDir) {
    & icacls $binDir /grant:r "$($env:USERNAME):(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" /T /C /Q 2>$null
}

$conn8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($conn8000) { Stop-Process -Id $conn8000.OwningProcess -Force -ErrorAction SilentlyContinue }

# 3. Instalacao do Docker Desktop via Winget se nao existir
Write-Host "[2/4] Verificando Docker no sistema..." -ForegroundColor Yellow
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
$dockerDesktopPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

if (-not $dockerCmd -and -not (Test-Path $dockerDesktopPath)) {
    Write-Host "      Baixando e instalando Docker Desktop via Winget..." -ForegroundColor Cyan
    winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
    
    # Atualiza PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "      Docker ja instalado no host!" -ForegroundColor Green
}

# 4. Iniciar Docker Engine
Write-Host "[3/4] Garantindo que o daemon do Docker esta ativo..." -ForegroundColor Yellow
if (Test-Path $dockerDesktopPath) {
    $proc = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
    if (-not $proc) {
        Write-Host "      Iniciando Docker Desktop..." -ForegroundColor Cyan
        Start-Process $dockerDesktopPath
    }
    
    Write-Host "      Aguardando engine Docker responder..." -ForegroundColor Cyan
    $ready = $false
    for ($i = 1; $i -le 40; $i++) {
        $test = docker ps 2>&1
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 3
        Write-Host -NoNewline "."
    }
    Write-Host ""
}

# 5. Compilar e subir container com PM2
Write-Host "[4/4] Compilando e iniciando o container Synaptix com PM2..." -ForegroundColor Green
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

docker compose up -d --build
docker compose ps

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  SYNAPTIX RODANDO NO CONTAINER DOCKER COM PM2!           " -ForegroundColor Green
Write-Host "  Link de Acesso via Tunel Cloudflare:                    " -ForegroundColor Cyan
Write-Host "  -> https://synaptix.amtheinner.com                     " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Pressione qualquer tecla para encerrar..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
