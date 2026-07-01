$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Version = "2.0.0"
$ReleaseName = "Claudio-AI-Radio-$Version-portable"
$ReleaseDir = Join-Path $ProjectDir "release\$ReleaseName"
$ReleaseZip = Join-Path $ProjectDir "release\$ReleaseName.zip"
$ApiProjectDir = "C:\Users\zwy0824\Documents\Codex\api-enhanced"
$ApiExe = Join-Path $ApiProjectDir "precompiled\app.exe"
$NodeCommand = Get-Command node -ErrorAction Stop
$NodeRuntime = $NodeCommand.Source

function Reset-PathSafely {
  param([Parameter(Mandatory = $true)][string]$TargetPath)

  if (Test-Path -LiteralPath $TargetPath) {
    Remove-Item -LiteralPath $TargetPath -Recurse -Force
  }
}

function Ensure-Directory {
  param([Parameter(Mandatory = $true)][string]$TargetPath)

  if (-not (Test-Path -LiteralPath $TargetPath)) {
    New-Item -ItemType Directory -Path $TargetPath | Out-Null
  }
}

Write-Host "Building launcher..." -ForegroundColor Green
& (Join-Path $ProjectDir "scripts\build-launcher.ps1")

if (-not (Test-Path -LiteralPath $ApiExe)) {
  Write-Host "Building bundled NetEase API..." -ForegroundColor Green
  $env:PKG_CACHE_PATH = Join-Path (Split-Path -Parent $ProjectDir) "pkg-cache"
  Push-Location $ApiProjectDir
  try {
    npm.cmd run pkgwin
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $ApiExe)) {
  throw "Bundled NetEase API executable not found: $ApiExe"
}

Ensure-Directory (Split-Path -Parent $ReleaseDir)
Reset-PathSafely -TargetPath $ReleaseDir
Ensure-Directory $ReleaseDir
Reset-PathSafely -TargetPath $ReleaseZip

$runtimeDir = Join-Path $ReleaseDir "runtime\node"
$apiDir = Join-Path $ReleaseDir "services\netease-api"
$scriptsDir = Join-Path $ReleaseDir "scripts"
Ensure-Directory $runtimeDir
Ensure-Directory $apiDir
Ensure-Directory $scriptsDir
Ensure-Directory (Join-Path $ReleaseDir "logs")

Copy-Item -LiteralPath (Join-Path $ProjectDir "ClaudioRadioLauncher.exe") -Destination $ReleaseDir
Copy-Item -LiteralPath (Join-Path $ProjectDir "start-radio.ps1") -Destination $ReleaseDir
Copy-Item -LiteralPath (Join-Path $ProjectDir "radio-secrets.example.ps1") -Destination $ReleaseDir
Copy-Item -LiteralPath (Join-Path $ProjectDir "README.md") -Destination $ReleaseDir
Copy-Item -LiteralPath (Join-Path $ProjectDir "server.js") -Destination $ReleaseDir
Copy-Item -LiteralPath (Join-Path $ProjectDir "package.json") -Destination $ReleaseDir
Copy-Item -LiteralPath (Join-Path $ProjectDir "data") -Destination $ReleaseDir -Recurse
Copy-Item -LiteralPath (Join-Path $ProjectDir "public") -Destination $ReleaseDir -Recurse
Copy-Item -LiteralPath (Join-Path $ProjectDir "scripts\import-netease-playlist.js") -Destination $scriptsDir -Force

Copy-Item -LiteralPath $NodeRuntime -Destination (Join-Path $runtimeDir "node.exe")
Copy-Item -LiteralPath $ApiExe -Destination (Join-Path $apiDir "app.exe")
Copy-Item -LiteralPath (Join-Path $ApiProjectDir "data") -Destination $apiDir -Recurse

Compress-Archive -Path (Join-Path $ReleaseDir "*") -DestinationPath $ReleaseZip -CompressionLevel Optimal

Write-Host "Portable folder: $ReleaseDir" -ForegroundColor Green
Write-Host "Portable zip: $ReleaseZip" -ForegroundColor Green
