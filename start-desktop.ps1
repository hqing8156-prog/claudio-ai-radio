$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "desktop") -WorkingDirectory $ProjectDir -WindowStyle Hidden
