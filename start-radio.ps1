$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SecretsPath = Join-Path $ProjectDir "radio-secrets.ps1"
$BundledNodePath = Join-Path $ProjectDir "runtime\node\node.exe"
$BundledApiPath = Join-Path $ProjectDir "services\netease-api\app.exe"
$ServerScriptPath = Join-Path $ProjectDir "server.js"
$LogsDir = Join-Path $ProjectDir "logs"

function Test-HttpReady {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutMs = 800
  )

  try {
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Timeout = $TimeoutMs
    $response = $request.GetResponse()
    $response.Close()
    return $true
  } catch {
    return $false
  }
}

function Resolve-NodeRuntime {
  if (Test-Path -LiteralPath $BundledNodePath) {
    return $BundledNodePath
  }

  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    return $nodeCommand.Source
  }

  throw "Node.js runtime not found. Expected bundled runtime at $BundledNodePath or node.exe in PATH."
}

function Start-BackgroundProcess {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [string]$ReadyUrl,
    [int]$ReadyRetries = 60
  )

  if ($ReadyUrl -and (Test-HttpReady -Url $ReadyUrl)) {
    Write-Host "$Name already running: $ReadyUrl"
    return
  }

  if (-not (Test-Path -LiteralPath $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
  }

  $stdoutPath = Join-Path $LogsDir "$Name.stdout.log"
  $stderrPath = Join-Path $LogsDir "$Name.stderr.log"

  Write-Host "Starting $Name..." -ForegroundColor Green
  $process = Start-Process `
    -FilePath $FilePath `
    -ArgumentList $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  if (-not $ReadyUrl) {
    return
  }

  for ($i = 0; $i -lt $ReadyRetries; $i++) {
    if (Test-HttpReady -Url $ReadyUrl) {
      Write-Host "$Name ready: $ReadyUrl"
      return
    }

    if ($process.HasExited) {
      $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Path $stderrPath -Raw } else { "" }
      throw "$Name exited before becoming ready. $stderr"
    }

    Start-Sleep -Milliseconds 1000
  }

  throw "$Name did not become ready: $ReadyUrl"
}

Set-Location $ProjectDir

if (-not (Test-Path -LiteralPath $SecretsPath)) {
  Write-Host ""
  Write-Host "Missing radio-secrets.ps1" -ForegroundColor Yellow
  Write-Host "1. Copy radio-secrets.example.ps1 to radio-secrets.ps1"
  Write-Host "2. Fill in NETEASE_COOKIE and optional AI keys"
  Write-Host "3. Run this script again"
  Write-Host ""
  exit 1
}

. $SecretsPath

if (-not $env:NETEASE_COOKIE) {
  Write-Host "NETEASE_COOKIE is empty in radio-secrets.ps1" -ForegroundColor Red
  exit 1
}

$nodeRuntime = Resolve-NodeRuntime
$env:PORT = "3000"

if (-not $env:NETEASE_API_BASE) {
  $env:NETEASE_API_BASE = "http://localhost:4000"
}

Write-Host "Starting Claudio AI Radio..." -ForegroundColor Green
Write-Host "Project: $ProjectDir"
Write-Host "Node runtime: $nodeRuntime"
Write-Host "NetEase cookie: loaded"
Write-Host "AI provider: $(if ($env:DEEPSEEK_API_KEY) { 'DeepSeek' } elseif ($env:ANTHROPIC_API_KEY) { 'Claude' } else { 'fallback' })"
Write-Host ""

if ((Test-Path -LiteralPath $BundledApiPath) -and ($env:NETEASE_API_BASE -eq "http://localhost:4000")) {
  $env:PORT = "4000"
  Start-BackgroundProcess `
    -Name "netease-api" `
    -FilePath $BundledApiPath `
    -Arguments @() `
    -WorkingDirectory (Split-Path -Parent $BundledApiPath) `
    -ReadyUrl "http://localhost:4000/login/status"
  $env:PORT = "3000"
}

Start-BackgroundProcess `
  -Name "claudio-radio" `
  -FilePath $nodeRuntime `
  -Arguments @($ServerScriptPath) `
  -WorkingDirectory $ProjectDir `
  -ReadyUrl "http://localhost:3000/api/health"

Write-Host ""
Write-Host "Open http://localhost:3000" -ForegroundColor Cyan
