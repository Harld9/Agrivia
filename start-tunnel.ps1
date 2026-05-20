# ================================================================
#  start-tunnel.ps1 — Agrivia : deploiement Cloudflare Tunnel
#  Usage : npm run tunnel  (depuis front/)
#          ou directement : powershell -File start-tunnel.ps1
# ================================================================

$ErrorActionPreference = "SilentlyContinue"
$ScriptDir = $PSScriptRoot

function Info  { param($msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Ok    { param($msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Warn  { param($msg) Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Err   { param($msg) Write-Host "  ERR $msg" -ForegroundColor Red }

Clear-Host
Write-Host ""
Write-Host "  Agrivia - Cloudflare Tunnel Setup" -ForegroundColor Green
Write-Host "  ===================================" -ForegroundColor Green
Write-Host ""

# -- Rafraichir le PATH (winget n'actualise pas la session courante) --
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# -- Verifier cloudflared ----------------------------------------
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Err "cloudflared n'est pas installe."
    Warn "Installez-le avec : winget install Cloudflare.cloudflared"
    exit 1
}

# -- Verifier Docker ---------------------------------------------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Err "Docker n'est pas installe ou pas dans le PATH."
    exit 1
}

# -- Fonction : attendre l'URL d'un tunnel -----------------------
function Get-TunnelUrl {
    param([System.Management.Automation.Job]$Job, [int]$TimeoutSec = 40)
    $elapsed = 0
    while ($elapsed -lt $TimeoutSec) {
        Start-Sleep -Seconds 2
        $elapsed += 2
        $output = Receive-Job $Job -Keep | Out-String
        if ($output -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
            return $matches[0]
        }
    }
    return $null
}

# -- 1. Demarrer les services Docker (sans frontend) -------------
Write-Host ""
Write-Host "  [1/5] Demarrage des services Docker..." -ForegroundColor White
Push-Location $ScriptDir
docker compose up -d mosquitto backend gateway_sim gateway_sim_2 esp32_sim_1 esp32_sim_2 esp32_sim_3 esp32_sim_4
if ($LASTEXITCODE -ne 0) {
    Err "Erreur docker compose."
    Pop-Location
    exit 1
}
Ok "Services demarre"

# -- 2. Attendre que le backend reponde --------------------------
Write-Host ""
Write-Host "  [2/5] Attente du backend..." -ForegroundColor White
$ready = $false
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 2
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:3000/api/current" -TimeoutSec 2 -ErrorAction Stop
        $ready = $true
        break
    } catch {}
    Write-Host "  Tentative $i/15..." -ForegroundColor DarkGray
}
if ($ready) { Ok "Backend pret" } else { Warn "Backend pas encore pret, on continue quand meme..." }

# -- 3. Tunnel backend -------------------------------------------
Write-Host ""
Write-Host "  [3/5] Ouverture du tunnel backend..." -ForegroundColor White
$jobBackend = Start-Job -ScriptBlock { param($p) $env:Path = $p; cloudflared tunnel --url http://localhost:3000 2>&1 } -ArgumentList $env:Path
$backendUrl = Get-TunnelUrl -Job $jobBackend

if (-not $backendUrl) {
    Err "Impossible d'obtenir l'URL du tunnel backend."
    Stop-Job $jobBackend -ErrorAction SilentlyContinue
    Remove-Job $jobBackend -ErrorAction SilentlyContinue
    docker compose down
    Pop-Location
    exit 1
}
Ok "Tunnel backend : $backendUrl"

# -- 4. Ecriture du .env frontend --------------------------------
Write-Host ""
Write-Host "  [4/5] Creation de front/.env..." -ForegroundColor White
$wsUrl   = $backendUrl -replace '^https://', 'wss://'
$envPath = Join-Path $ScriptDir "front\.env"
$line1   = "VITE_BACKEND_WS_URL=$wsUrl"
$line2   = "VITE_BACKEND_API_URL=$backendUrl"
Set-Content -Path $envPath -Value $line1 -Encoding utf8
Add-Content -Path $envPath -Value $line2 -Encoding utf8
Ok ".env cree"
Info "WS  : $wsUrl"
Info "API : $backendUrl"

# -- 5. Build et demarrage du frontend ---------------------------
Write-Host ""
Write-Host "  [5/5] Build du frontend (30s env)..." -ForegroundColor White
docker compose up -d --build frontend
if ($LASTEXITCODE -ne 0) {
    Err "Erreur lors du build frontend."
} else {
    Ok "Frontend demarre"
}
Start-Sleep -Seconds 5

# -- 6. Tunnel frontend ------------------------------------------
Write-Host ""
Write-Host "  Ouverture du tunnel frontend..." -ForegroundColor White
$jobFrontend = Start-Job -ScriptBlock { param($p) $env:Path = $p; cloudflared tunnel --url http://localhost:80 2>&1 } -ArgumentList $env:Path
$frontendUrl = Get-TunnelUrl -Job $jobFrontend

if (-not $frontendUrl) {
    Warn "Tunnel frontend indisponible - acces local : http://localhost"
    $frontendUrl = "http://localhost"
}
Ok "Tunnel frontend : $frontendUrl"

Pop-Location

# -- Resume ------------------------------------------------------
Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Yellow
Write-Host "           AGRIVIA EN LIGNE !"               -ForegroundColor Yellow
Write-Host "  ==========================================" -ForegroundColor Yellow
Write-Host "   Interface : $frontendUrl"                 -ForegroundColor White
Write-Host "   Backend   : $backendUrl"                  -ForegroundColor White
Write-Host "  ==========================================" -ForegroundColor Yellow
Write-Host ""
Warn "Les URLs changent a chaque redemarrage."
Write-Host "  Ctrl+C pour arreter les tunnels et Docker." -ForegroundColor DarkGray
Write-Host ""

# -- Ouvrir le navigateur ----------------------------------------
if ($frontendUrl -ne "http://localhost") {
    Start-Process $frontendUrl
}

# -- Attendre Ctrl+C puis nettoyer -------------------------------
try {
    Wait-Job $jobBackend, $jobFrontend -ErrorAction SilentlyContinue | Out-Null
} finally {
    Write-Host ""
    Warn "Arret des tunnels Cloudflare..."
    Stop-Job $jobBackend, $jobFrontend -ErrorAction SilentlyContinue
    Remove-Job $jobBackend, $jobFrontend -ErrorAction SilentlyContinue
    Warn "Arret de Docker..."
    Push-Location $ScriptDir
    docker compose down
    Pop-Location
    Ok "Tout est arrete."
}
