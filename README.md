# Claudio AI Radio

涓€涓湰鍦颁紭鍏堢殑 AI 鐢靛彴鎾斁鍣細缃戞槗浜戞瓕鍗曞鍏ャ€丄I DJ 鍙ｆ挱銆佹瓕璇嶃€佸ぉ姘斾笂涓嬫枃銆佽亰澶╂绱㈠拰鎾斁闃熷垪鎺у埗銆?
## 蹇€熷紑濮?
鍏堝噯澶囨湰鍦板瘑閽ユ枃浠讹細

```powershell
Copy-Item .\radio-secrets.example.ps1 .\radio-secrets.ps1
notepad .\radio-secrets.ps1
```

濉叆 `NETEASE_COOKIE` 鍜?`DEEPSEEK_API_KEY` 鍚庡惎鍔細

```powershell
powershell -ExecutionPolicy Bypass -File .\start-radio.ps1
```

鎵撳紑锛?
```text
http://localhost:3000
```

## 缃戞槗浜?API

鎺ㄨ崘鎶?NeteaseCloudMusicAPI Enhanced 璺戝湪 `4000` 绔彛锛?
```cmd
cd C:\Users\zwy0824\Documents\Codex\api-enhanced
set PORT=4000
npm.cmd start
```

鏈」鐩粯璁よ鍙栵細

```text
http://localhost:4000
```

## 瀵煎叆姝屽崟

杩藉姞瀵煎叆锛屼笉瑕嗙洊褰撳墠鏇插簱锛?
```powershell
npm.cmd run import:netease -- 姝屽崟ID --base http://localhost:4000 --with-url --merge
```

涓€娆″鍏ュ涓瓕鍗曪細

```powershell
npm.cmd run import:netease -- 姝屽崟ID1 姝屽崟ID2 姝屽崟ID3 --base http://localhost:4000 --with-url --merge
```

鍏堥瑙堜笉鍐欏叆锛?
```powershell
npm.cmd run import:netease -- 姝屽崟ID --base http://localhost:4000 --with-url --dry-run
```

鍘婚噸瑙勫垯锛氭瓕鏇叉爣棰?鐗堟湰鍜屾瓕鎵嬪畬鍏ㄤ竴鑷存墠鍚堝苟锛岄伩鍏嶅悓鍚嶄笉鍚屾瓕鎵嬭璇垹銆?
## 閰嶇疆

`radio-secrets.ps1` 鍙繚瀛樺湪鏈湴锛屼笉瑕佷笂浼?GitHub銆?
甯哥敤鍙橀噺锛?
```powershell
$env:NETEASE_COOKIE = ""
$env:DEEPSEEK_API_KEY = ""
$env:DEEPSEEK_MODEL = "deepseek-chat"
$env:NETEASE_API_BASE = "http://localhost:4000"
$env:NETEASE_AUDIO_LEVEL = "standard"
```

鍙€夊彉閲忥細

```powershell
$env:OPENWEATHER_API_KEY = ""
$env:CITY = "Shanghai"
$env:ANTHROPIC_API_KEY = ""
$env:CLAUDE_MODEL = "claude-sonnet-4-20250514"
```

## 椤圭洰缁撴瀯

- `server.js`: 鏈湴 Node 鏈嶅姟锛岃礋璐ｆ挱鏀剧姸鎬併€佺綉鏄撲簯浠ｇ悊銆丄I chat銆佹瓕璇嶃€佸ぉ姘斿拰闃熷垪銆?- `public/`: 鍓嶇 PWA 鎾斁鍣ㄣ€?- `scripts/import-netease-playlist.js`: 缃戞槗浜戞瓕鍗曞鍏ヨ剼鏈€?- `data/playlists.json`: 褰撳墠鏇插簱鏁版嵁銆?- `data/taste.json`: 鐢靛彴鍙ｅ懗閰嶇疆銆?- `radio-secrets.example.ps1`: 鏈湴瀵嗛挜妯℃澘銆?
## 涓婁紶 GitHub 鍓嶆鏌?
纭涓嶈鎻愪氦杩欎簺鏂囦欢锛?
```text
radio-secrets.ps1
*.log
node_modules/
.env
```

鍙互鐢ㄤ笅闈㈠懡浠ょ‘璁ゆ病鏈夋槑鏄惧瘑閽ワ細


濡傛灉娌℃湁杈撳嚭锛屽氨姣旇緝瀹夊叏銆?

