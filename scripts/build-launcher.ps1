$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Source = Join-Path $ProjectDir "scripts\ClaudioRadioLauncher.cs"
$Output = Join-Path $ProjectDir "ClaudioRadioLauncher.exe"

if (-not (Test-Path -LiteralPath $Source)) {
  throw "Missing launcher source: $Source"
}

Add-Type `
  -TypeDefinition (Get-Content -LiteralPath $Source -Raw) `
  -ReferencedAssemblies @("System.Windows.Forms.dll", "System.dll") `
  -OutputAssembly $Output `
  -OutputType WindowsApplication

Write-Host "Built $Output" -ForegroundColor Green
