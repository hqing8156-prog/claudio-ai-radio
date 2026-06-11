# Copy this file to radio-secrets.ps1, then fill in your own local values.
# Never commit radio-secrets.ps1 to GitHub.

$env:NETEASE_COOKIE = ""
$env:DEEPSEEK_API_KEY = ""
$env:DEEPSEEK_MODEL = "deepseek-chat"

# Optional settings
$env:NETEASE_API_BASE = "http://localhost:4000"
$env:NETEASE_AUDIO_LEVEL = "standard"

# Optional NetEase playlist IDs.
# Use commas for multiple playlists, for example: "123,456,789"
$env:NETEASE_LIBRARY_PLAYLIST_ID = ""
$env:NETEASE_IMPORTED_PLAYLIST_IDS = ""
$env:NETEASE_FAVORITE_PLAYLIST_IDS = ""
$env:NETEASE_PERSONAL_RADAR_ID = ""

# $env:OPENWEATHER_API_KEY = ""
# $env:CITY = "Shanghai"
# $env:ANTHROPIC_API_KEY = ""
# $env:CLAUDE_MODEL = "claude-sonnet-4-20250514"
