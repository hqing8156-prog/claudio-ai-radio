$ErrorActionPreference = "SilentlyContinue"
$logPath = Join-Path $PSScriptRoot "desktop-lyrics.log"
function Write-DesktopLyricsLog($message) {
  try {
    Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message"
  } catch {}
}
Write-DesktopLyricsLog "starting"

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "ClaudioDesktopLyricsOverlayV3", [ref]$createdNew)
if (-not $createdNew) {
  Write-DesktopLyricsLog "already running"
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$apiRoot = "http://localhost:3000"
$api = "$apiRoot/api/desktop-lyrics"
$transparent = [System.Drawing.Color]::FromArgb(1, 2, 3)
$fontFamily = "Microsoft YaHei UI"

$form = New-Object System.Windows.Forms.Form
$form.Text = "Claudio Lyrics"
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.BackColor = $transparent
$form.TransparencyKey = $transparent
$form.Width = 980
$form.Height = 180
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Left = [Math]::Max(0, [int](($screen.Width - $form.Width) / 2))
$form.Top = [Math]::Max(0, $screen.Height - $form.Height - 72)
Write-DesktopLyricsLog "form created at $($form.Left),$($form.Top)"

function New-LyricLabel($fontSize, $weight, $color) {
  $label = New-Object System.Windows.Forms.Label
  $label.AutoSize = $false
  $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $label.BackColor = [System.Drawing.Color]::Transparent
  $label.ForeColor = $color
  $label.Font = New-Object System.Drawing.Font($fontFamily, $fontSize, $weight, [System.Drawing.GraphicsUnit]::Point)
  $label.UseCompatibleTextRendering = $true
  return $label
}

function New-ControlButton($text) {
  $button = New-Object System.Windows.Forms.Label
  $button.AutoSize = $false
  $button.Text = $text
  $button.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $button.BackColor = [System.Drawing.Color]::Transparent
  $button.ForeColor = [System.Drawing.Color]::FromArgb(220, 248, 241, 228)
  $button.Font = New-Object System.Drawing.Font($fontFamily, 17, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
  $button.Cursor = [System.Windows.Forms.Cursors]::Hand
  $button.UseCompatibleTextRendering = $true
  $button.Add_MouseEnter({ $this.ForeColor = [System.Drawing.Color]::FromArgb(255, 255, 255, 255) })
  $button.Add_MouseLeave({ $this.ForeColor = [System.Drawing.Color]::FromArgb(220, 248, 241, 228) })
  return $button
}

function Invoke-RadioGet($path) {
  try {
    Invoke-RestMethod -Uri "$apiRoot$path" -TimeoutSec 2 | Out-Null
  } catch {}
}

function Invoke-RadioPlayingToggle {
  try {
    $now = Invoke-RestMethod -Uri "$apiRoot/api/now" -TimeoutSec 2
    $playing = -not [bool]$now.playing
    $json = @{ playing = $playing } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri "$apiRoot/api/state" -Method Post -ContentType "application/json" -Body $json -TimeoutSec 2 | Out-Null
  } catch {}
}

$shadow1 = New-LyricLabel 30 ([System.Drawing.FontStyle]::Bold) ([System.Drawing.Color]::FromArgb(210, 0, 0, 0))
$shadow2 = New-LyricLabel 30 ([System.Drawing.FontStyle]::Bold) ([System.Drawing.Color]::FromArgb(150, 0, 0, 0))
$current = New-LyricLabel 30 ([System.Drawing.FontStyle]::Bold) ([System.Drawing.Color]::FromArgb(255, 248, 241, 228))
$translationShadow = New-LyricLabel 13 ([System.Drawing.FontStyle]::Regular) ([System.Drawing.Color]::FromArgb(180, 0, 0, 0))
$translation = New-LyricLabel 13 ([System.Drawing.FontStyle]::Regular) ([System.Drawing.Color]::FromArgb(210, 248, 241, 228))
$next = New-LyricLabel 11 ([System.Drawing.FontStyle]::Regular) ([System.Drawing.Color]::FromArgb(150, 248, 241, 228))
$prevButton = New-ControlButton "<"
$playButton = New-ControlButton "II"
$nextButton = New-ControlButton ">"

@($shadow1, $shadow2, $current, $translationShadow, $translation, $next, $prevButton, $playButton, $nextButton) | ForEach-Object {
  $form.Controls.Add($_)
}

$prevButton.Add_Click({ Invoke-RadioGet "/api/previous" })
$playButton.Add_Click({ Invoke-RadioPlayingToggle })
$nextButton.Add_Click({ Invoke-RadioGet "/api/next" })

function Layout-Lyrics {
  $pad = 18
  $mainTop = 12
  $mainHeight = 72
  $subTop = 84
  $subHeight = 28
  $nextTop = 114
  $nextHeight = 22
  $buttonTop = 140
  $buttonSize = 34
  $gap = 28
  $buttonTotal = $buttonSize * 3 + $gap * 2
  $buttonLeft = [int](($form.ClientSize.Width - $buttonTotal) / 2)

  $shadow1.SetBounds($pad + 3, $mainTop + 4, $form.ClientSize.Width - $pad * 2, $mainHeight)
  $shadow2.SetBounds($pad - 2, $mainTop + 1, $form.ClientSize.Width - $pad * 2, $mainHeight)
  $current.SetBounds($pad, $mainTop, $form.ClientSize.Width - $pad * 2, $mainHeight)
  $translationShadow.SetBounds($pad + 2, $subTop + 2, $form.ClientSize.Width - $pad * 2, $subHeight)
  $translation.SetBounds($pad, $subTop, $form.ClientSize.Width - $pad * 2, $subHeight)
  $next.SetBounds($pad, $nextTop, $form.ClientSize.Width - $pad * 2, $nextHeight)
  $prevButton.SetBounds($buttonLeft, $buttonTop, $buttonSize, $buttonSize)
  $playButton.SetBounds($buttonLeft + $buttonSize + $gap, $buttonTop, $buttonSize, $buttonSize)
  $nextButton.SetBounds($buttonLeft + ($buttonSize + $gap) * 2, $buttonTop, $buttonSize, $buttonSize)
}

Layout-Lyrics
$form.Add_Resize({ Layout-Lyrics })

$dragging = $false
$dragOffset = New-Object System.Drawing.Point 0, 0
$mouseDown = {
  param($sender, $event)
  if ($event.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
    $script:dragging = $true
    $script:dragOffset = $event.Location
  }
  if ($event.Button -eq [System.Windows.Forms.MouseButtons]::Right) {
    $form.Close()
  }
}
$mouseMove = {
  param($sender, $event)
  if ($script:dragging) {
    $cursor = [System.Windows.Forms.Cursor]::Position
    $form.Location = New-Object System.Drawing.Point (($cursor.X - $script:dragOffset.X), ($cursor.Y - $script:dragOffset.Y))
  }
}
$mouseUp = { $script:dragging = $false }
@($form, $shadow1, $shadow2, $current, $translationShadow, $translation, $next) | ForEach-Object {
  $_.Add_MouseDown($mouseDown)
  $_.Add_MouseMove($mouseMove)
  $_.Add_MouseUp($mouseUp)
}

$last = ""
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 350
$timer.Add_Tick({
  try {
    $data = Invoke-RestMethod -Uri $api -TimeoutSec 1
    $playing = $false
    try {
      $now = Invoke-RestMethod -Uri "$apiRoot/api/now" -TimeoutSec 1
      $playing = [bool]$now.playing
    } catch {}
    $key = "$($data.current)`n$($data.translation)`n$($data.next)`n$playing"
    if ($key -eq $script:last) { return }
    $script:last = $key
    $shadow1.Text = [string]$data.current
    $shadow2.Text = [string]$data.current
    $current.Text = [string]$data.current
    $translationShadow.Text = [string]$data.translation
    $translation.Text = [string]$data.translation
    $next.Text = [string]$data.next
    if ($playing) {
      $playButton.Text = "II"
    } else {
      $playButton.Text = "P"
    }
  } catch {}
})
$timer.Start()

$form.Add_FormClosed({
  $timer.Stop()
  $timer.Dispose()
  if ($mutex) {
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
  }
})

[System.Windows.Forms.Application]::EnableVisualStyles()
Write-DesktopLyricsLog "running form"
[System.Windows.Forms.Application]::Run($form)
Write-DesktopLyricsLog "closed"
