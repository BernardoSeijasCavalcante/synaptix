# ==============================================================================
# Script de Inicializacao: Docker ou Fallback Automatico PM2
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SYNAPTIX - INICIALIZACAO INTELIGENTE (DOCKER / PM2)     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Liberar portas
Write-Host "[1/3] Liberando portas 8000 e 6080..." -ForegroundColor Yellow
$conn8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($conn8000) { Stop-Process -Id $conn8000.OwningProcess -Force -ErrorAction SilentlyContinue }

$conn6080 = Get-NetTCPConnection -LocalPort 6080 -State Listen -ErrorAction SilentlyContinue
if ($conn6080) { Stop-Process -Id $conn6080.OwningProcess -Force -ErrorAction SilentlyContinue }

# 2. Verificar se o Docker CLI esta presente
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue

if ($dockerCmd) {
    Write-Host "[2/3] Docker detectado! Subindo container com PM2..." -ForegroundColor Green
    Set-Location (Join-Path $PSScriptRoot "..")
    docker compose up -d --build
    $mode = "DOCKER CONTAINER (com PM2)"
} else {
    Write-Host "[2/3] Docker Engine nao encontrado no host Windows." -ForegroundColor Yellow
    Write-Host "      Iniciando Synaptix permanentemente via PM2 nativo..." -ForegroundColor Green
    
    Set-Location (Join-Path $PSScriptRoot "..")
    $pm2Cmd = Get-Command pm2 -ErrorAction SilentlyContinue
    $pm2Exec = if ($pm2Cmd) { "pm2" } else { "npx pm2" }
    
    Invoke-Expression "$pm2Exec start ecosystem.config.cjs"
    Invoke-Expression "$pm2Exec save"
    Invoke-Expression "$pm2Exec status"
    $mode = "PM2 NATIVO (Alta Performance)"
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  SYNAPTIX ATIVO E RODANDO VIA: $mode" -ForegroundColor Green
Write-Host "  Link Pronto do Tunel Cloudflare:" -ForegroundColor Cyan
Write-Host "  -> https://synaptix.amtheinner.com" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
