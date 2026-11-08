# ==============================================================================
# Script de Inicializacao Permanente do Synaptix com PM2
# ==============================================================================

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SYNAPTIX - INICIALIZACAO PERMANENTE VIA PM2             " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verifica se o PM2 está instalado
$pm2Cmd = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2Cmd) {
    Write-Host "[INFO] PM2 nao encontrado globalmente. Instalando via npm..." -ForegroundColor Yellow
    npm install -g pm2
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[AVISO] Falha ao instalar pm2 globalmente. Usando npx pm2..." -ForegroundColor Yellow
        $pm2Exec = "npx pm2"
    } else {
        $pm2Exec = "pm2"
    }
} else {
    $pm2Exec = "pm2"
}

# 2. Inicia os servicos definidos no ecosystem.config.cjs
Write-Host "[1/3] Iniciando Backend e Frontend via PM2..." -ForegroundColor Green
Invoke-Expression "$pm2Exec start ecosystem.config.cjs"

# 3. Salva a lista de processos para reinicializacao automatica
Write-Host "[2/3] Salvando estado dos servicos no PM2..." -ForegroundColor Green
Invoke-Expression "$pm2Exec save"

# 4. Status atual
Write-Host "[3/3] Status dos servicos:" -ForegroundColor Cyan
Invoke-Expression "$pm2Exec status"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Synaptix rodando sob gestao do PM2!                     " -ForegroundColor Green
Write-Host "  - Frontend: http://localhost:6080                      " -ForegroundColor White
Write-Host "  - Backend:  http://127.0.0.1:8000                     " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "DICA PARA INICIALIZAR COM O WINDOWS (Permanent Service):" -ForegroundColor Yellow
Write-Host "Para que o PM2 inicie automaticamente mesmo ao reiniciar o computador:" -ForegroundColor Gray
Write-Host "  1. Abra o PowerShell como Administrador" -ForegroundColor Gray
Write-Host "  2. Execute: npm install -g pm2-windows-service" -ForegroundColor Gray
Write-Host "  3. Execute: pm2-service-install -n PM2" -ForegroundColor Gray
Write-Host "  4. Execute: pm2 save" -ForegroundColor Gray
