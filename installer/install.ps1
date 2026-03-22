# ReCord PowerShell Installer
# Usage: irm https://github.com/InfluenceDevs/ReCord/releases/latest/download/install.ps1 | iex

$ErrorActionPreference = "Stop"

$repo   = "InfluenceDevs/ReCord"
$apiUrl = "https://api.github.com/repos/$repo/releases/latest"
$tmpDir = Join-Path $env:TEMP "ReCordInstall"
$exePath = Join-Path $tmpDir "ReCordSetup.exe"

Write-Host ""
Write-Host "  ReCord Installer" -ForegroundColor Cyan
Write-Host "  =================" -ForegroundColor Cyan
Write-Host ""

# Fetch latest release info
Write-Host "Fetching latest release..." -ForegroundColor Gray
$release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "ReCord-Installer" }
$tag     = $release.tag_name
$asset   = $release.assets | Where-Object { $_.name -eq "ReCordSetup.exe" } | Select-Object -First 1

if (-not $asset) {
    Write-Host "ERROR: Could not find ReCordSetup.exe in release $tag" -ForegroundColor Red
    exit 1
}

Write-Host "Latest release: $tag" -ForegroundColor Green

# Download
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
Write-Host "Downloading ReCordSetup.exe..." -ForegroundColor Gray

$wc = New-Object System.Net.WebClient
$wc.DownloadFile($asset.browser_download_url, $exePath)

Write-Host "Download complete. Launching installer..." -ForegroundColor Green
Write-Host ""

Start-Process -FilePath $exePath -Wait

# Cleanup
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
