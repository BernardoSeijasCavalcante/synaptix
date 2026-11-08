# ==============================================================================
# Script de Inicializacao do Synaptix via PM2 dentro do Docker
# ==============================================================================

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SYNAPTIX - PM2 DENTRO DO CONTAINER DOCKER               " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
    Write-Host "[ERRO] Docker CLI nao foi encontrado no PATH do sistema." -ForegroundColor Red
    Write-Host "Por favor, abra o Docker Desktop para iniciar o daemon." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/3] Liberando porta 8000 de possiveis processos anteriores..." -ForegroundColor Yellow
$conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}

Write-Host "[2/3] Compilando e iniciando container com PM2 Runtime..." -ForegroundColor Green
docker compose up -d --build

Write-Host "[3/3] Status dos containers:" -ForegroundColor Cyan
docker compose ps

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Synaptix rodando no Docker com PM2 (unless-stopped)!    " -ForegroundColor Green
Write-Host "  Link Publico (Tunel Cloudflare):                        " -ForegroundColor Yellow
Write-Host "  -> https://synaptix.amtheinner.com                     " -ForegroundColor White
Write-Host "  Acesso Local: http://127.0.0.1:8000                     " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
