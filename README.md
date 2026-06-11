# Claudio AI Radio 2.0

Local-first NetEase Cloud Music radio with lyrics, playlist queue, DeepSeek chat, weather context, and a dark turntable-style UI.

This project is vanilla HTML/CSS/JS plus a Node.js server. It is not React or Vue.

## Requirements

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

## Lightweight Windows Launcher

Build the launcher exe:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-launcher.ps1
```

This creates:

```text
ClaudioRadioLauncher.exe
```

Put the exe in the project root and run it. It starts `start-radio.ps1` and opens the browser after the local server becomes ready.

The launcher does not bundle Node.js or NetEase API. Users still need Node.js and their own `radio-secrets.ps1`.

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
- `radio-secrets.example.ps1`: local secrets template
