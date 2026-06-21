# Claudio AI Radio

一个本地优先的 AI 电台播放器：网易云歌单导入、AI DJ 口播、歌词、天气上下文、聊天检索和播放队列控制。

## 快速开始

先准备本地密钥文件：

```powershell
Copy-Item .\radio-secrets.example.ps1 .\radio-secrets.ps1
notepad .\radio-secrets.ps1
```

填入 `NETEASE_COOKIE` 和 `DEEPSEEK_API_KEY` 后启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-radio.ps1
```

打开：

```text
http://localhost:3000
```

## 网易云 API

推荐把 NeteaseCloudMusicAPI Enhanced 跑在 `4000` 端口：

```cmd
cd C:\path\to\api-enhanced
set PORT=4000
npm.cmd start
```

本项目默认读取：

```text
http://localhost:4000
```

## 导入歌单

追加导入，不覆盖当前曲库：

```powershell
npm.cmd run import:netease -- 歌单ID --base http://localhost:4000 --with-url --merge
```

一次导入多个歌单：

```powershell
npm.cmd run import:netease -- 歌单ID1 歌单ID2 歌单ID3 --base http://localhost:4000 --with-url --merge
```

先预览不写入：

```powershell
npm.cmd run import:netease -- 歌单ID --base http://localhost:4000 --with-url --dry-run
```

去重规则：歌曲标题/版本和歌手完全一致才合并，避免同名不同歌手被误删。

## 配置

`radio-secrets.ps1` 只保存在本地，不要上传 GitHub。

常用变量：

```powershell
$env:NETEASE_COOKIE = ""
$env:DEEPSEEK_API_KEY = ""
$env:DEEPSEEK_MODEL = "deepseek-chat"
$env:NETEASE_API_BASE = "http://localhost:4000"
$env:NETEASE_AUDIO_LEVEL = "standard"
```

可选变量：

```powershell
$env:OPENWEATHER_API_KEY = ""
$env:CITY = "Shanghai"
$env:ANTHROPIC_API_KEY = ""
$env:CLAUDE_MODEL = "claude-sonnet-4-20250514"
```

## 项目结构

- `server.js`: 本地 Node 服务，负责播放状态、网易云代理、AI chat、歌词、天气和队列。
- `public/`: 前端 PWA 播放器。
- `scripts/import-netease-playlist.js`: 网易云歌单导入脚本。
- `data/playlists.json`: 当前曲库数据。
- `data/taste.json`: 电台口味配置。
- `radio-secrets.example.ps1`: 本地密钥模板。

## 上传 GitHub 前检查

确认不要提交这些文件：

```text
radio-secrets.ps1
*.log
node_modules/
.env
```

可以用下面命令确认没有明显密钥：

```powershell
rg "MUSIC_U|MUSIC_A_T|MUSIC_R_T|__csrf|sk-[A-Za-z0-9]" .
```

如果没有输出，就比较安全。
