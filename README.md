# Claudio AI Radio 2.0

Local-first NetEase Cloud Music radio with lyrics, playlist queue, DeepSeek chat, weather context, and a dark turntable-style UI.

This project is vanilla HTML/CSS/JS plus a Node.js server. It is not React or Vue.

## Requirements For Source Run

- Windows 10/11
- Node.js 18+
- A local NetEase Cloud Music API service, usually at `http://localhost:4000`
- Optional DeepSeek API key for chat

## Setup

Create your local secrets file:

```powershell
Copy-Item .\radio-secrets.example.ps1 .\radio-secrets.ps1
notepad .\radio-secrets.ps1
```

Fill in your own values:

```powershell
$env:NETEASE_COOKIE = ""
$env:DEEPSEEK_API_KEY = ""
$env:NETEASE_API_BASE = "http://localhost:4000"
```

Optional playlist IDs:

```powershell
$env:NETEASE_LIBRARY_PLAYLIST_ID = ""
$env:NETEASE_IMPORTED_PLAYLIST_IDS = ""
$env:NETEASE_FAVORITE_PLAYLIST_IDS = ""
$env:NETEASE_PERSONAL_RADAR_ID = ""
```

Use commas for multiple playlist IDs.

## Run From Source

```powershell
powershell -ExecutionPolicy Bypass -File .\start-radio.ps1
```

Open:

```text
http://localhost:3000
```

## Portable Windows Package

Build the launcher:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-launcher.ps1
```

Build the portable package:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-portable-release.ps1
```

This creates:

```text
release/Claudio-AI-Radio-0.2.0-portable/
release/Claudio-AI-Radio-0.2.0-portable.zip
```

The portable package includes:

- `ClaudioRadioLauncher.exe`
- bundled `node.exe` for the 3000 app
- bundled NetEase API `app.exe` for port 4000
- frontend assets and starter data

The only file that is still intentionally local is `radio-secrets.ps1`. Do not upload your personal cookie to GitHub.

After extracting the zip on another machine:

1. Copy `radio-secrets.example.ps1` to `radio-secrets.ps1`
2. Fill in `NETEASE_COOKIE`
3. Double-click `ClaudioRadioLauncher.exe`

## Lightweight Windows Launcher

`ClaudioRadioLauncher.exe` starts `start-radio.ps1`, waits for `http://localhost:3000/api/health`, then opens the browser automatically.

## Import Playlists

In the turntable/SongID page, click the `+` card and enter a NetEase playlist ID. Imported playlist IDs are stored in the browser localStorage for that user.

You can also import playlists into `data/playlists.json`:

```powershell
npm.cmd run import:netease -- PLAYLIST_ID --base http://localhost:4000 --with-url --merge
```

## Privacy

Do not commit:

```text
radio-secrets.ps1
.env
data/memory.json
data/playback-state.json
*.log
```

The repository includes an empty `data/playlists.json` template. Users should import or configure their own playlists.

## Project Structure

- `server.js`: local Node server, NetEase proxy, playback state, chat, lyrics, weather, queue APIs
- `public/`: frontend app
- `scripts/import-netease-playlist.js`: optional NetEase playlist import script
- `scripts/ClaudioRadioLauncher.cs`: lightweight Windows launcher source
- `scripts/build-launcher.ps1`: launcher build script
- `scripts/build-portable-release.ps1`: portable release build script
- `radio-secrets.example.ps1`: local secrets template
