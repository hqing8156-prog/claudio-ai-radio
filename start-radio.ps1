$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SecretsPath = Join-Path $ProjectDir "radio-secrets.ps1"

Set-Location $ProjectDir

if (-not (Test-Path -LiteralPath $SecretsPath)) {
  Write-Host ""
  Write-Host "Missing radio-secrets.ps1" -ForegroundColor Yellow
  Write-Host "1. Copy radio-secrets.example.ps1 to radio-secrets.ps1"
  Write-Host "2. Fill in NETEASE_COOKIE and DEEPSEEK_API_KEY"
  Write-Host "3. Run this script again"
  Write-Host ""
  exit 1
}

. $SecretsPath

if (-not $env:NETEASE_COOKIE) {
  Write-Host "NETEASE_COOKIE is empty in radio-secrets.ps1" -ForegroundColor Red
  exit 1
}

Write-Host "Starting Claudio AI Radio..." -ForegroundColor Green
Write-Host "Project: $ProjectDir"
Write-Host "NetEase cookie: loaded"
Write-Host "AI provider: $(if ($env:DEEPSEEK_API_KEY) { 'DeepSeek' } elseif ($env:ANTHROPIC_API_KEY) { 'Claude' } else { 'fallback' })"
Write-Host ""
Write-Host "Open http://localhost:3000 after the server starts."
Write-Host ""

npm.cmd run dev
