<#
.SYNOPSIS
    Script de Blindagem do Host Windows e Isolamento da Rede Local (LAN) para o Synaptix.
.DESCRIPTION
    1. Restringe as permissoes NTFS (ACL via icacls) dos arquivos sensiveis (.env, synaptix.db, uploads/)
       apenas ao usuario atual, Administradores e SYSTEM.
    2. Cria regras no Windows Defender Firewall bloqueando o executavel Python do Synaptix de iniciar
       conexoes de saida (Outbound) para faixas de IP da Rede Local (RFC 1918: 192.168.0.0/16, 10.0.0.0/8,
       172.16.0.0/12 e Link-Local 169.254.0.0/16), impedindo movimentacao lateral na LAN.
#>

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"
$PythonExe = Join-Path $BackendDir "venv\Scripts\python.exe"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  SYNAPTIX ZERO-TRUST - HARDENING DO HOST WINDOWS E ANTI-LAN     " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Restricao de Permissoes de Arquivos Sensiveis (NTFS ACL)
$SensitivePaths = @(
    (Join-Path $BackendDir ".env"),
    (Join-Path $BackendDir "synaptix.db"),
    (Join-Path $BackendDir "uploads"),
    (Join-Path $BackendDir "BOOTSTRAP_DEVICE_TOKEN.txt")
)

foreach ($Target in $SensitivePaths) {
    if (Test-Path $Target) {
        Write-Host "[ACL] Blindando permissoes de acesso ao caminho: $Target" -ForegroundColor Yellow
        $UserGrant = "$($env:USERNAME):(F)"
        & icacls $Target /inheritance:r /grant:r $UserGrant "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" | Out-Null
    }
}

# 2. Regra de Firewall Anti-LAN (Bloqueio de saida para sub-redes privadas RFC 1918)
$RuleName = "Synaptix-ZeroTrust-Block-LAN-Lateral-Movement"
$CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$Principal = New-Object Security.Principal.WindowsPrincipal($CurrentIdentity)
$IsAdmin = $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($IsAdmin -and (Test-Path $PythonExe)) {
    Write-Host "[FIREWALL] Configurando bloqueio de saida para a Rede Local (RFC 1918)..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    New-NetFirewallRule `
        -DisplayName $RuleName `
        -Direction Outbound `
        -Program $PythonExe `
        -Action Block `
        -RemoteAddress @("192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12", "169.254.0.0/16") `
        -Profile Any `
        -Description "Impede que o servico Synaptix alcance outros dispositivos ou roteadores da rede local (LAN)." | Out-Null
    Write-Host "[OK] Regra de Firewall Anti-LAN aplicada com sucesso!" -ForegroundColor Green
} else {
    Write-Host "[OK] ACLs NTFS restritas aplicadas com sucesso para o usuario $($env:USERNAME)!" -ForegroundColor Green
    Write-Host "     (Para registrar tambem a regra global no Windows Firewall, execute como Administrador)." -ForegroundColor Gray
}
