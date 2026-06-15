import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.CLAUDIO_DATA_DIR || path.join(__dirname, "data");
const APP_VERSION = "2026-06-16-play-button-audio-v305";
const envCsv = (name, fallback = "") => String(process.env[name] ?? fallback)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const NETEASE_PERSONAL_RADAR_ID = String(process.env.NETEASE_PERSONAL_RADAR_ID || "3136952023");
const NETEASE_CUSTOM_PLAYLIST_ID = String(process.env.NETEASE_CUSTOM_PLAYLIST_ID || "").trim();
const NETEASE_LIBRARY_PLAYLIST_ID = String(process.env.NETEASE_LIBRARY_PLAYLIST_ID || "2529027467");
const DEFAULT_NETEASE_PLAYLIST_IDS = ["7067937840", "13580387815", "7289914342", "9764261322", "6956075751"];
const DEFAULT_NETEASE_FAVORITE_PLAYLIST_IDS = DEFAULT_NETEASE_PLAYLIST_IDS.slice(1);
const NETEASE_IMPORTED_PLAYLIST_IDS = envCsv(
  "NETEASE_IMPORTED_PLAYLIST_IDS",
  [NETEASE_CUSTOM_PLAYLIST_ID, ...DEFAULT_NETEASE_PLAYLIST_IDS].filter(Boolean).join(",")
);
const NETEASE_FAVORITE_PLAYLIST_IDS = envCsv(
  "NETEASE_FAVORITE_PLAYLIST_IDS",
  DEFAULT_NETEASE_FAVORITE_PLAYLIST_IDS.join(",")
).filter((id) => DEFAULT_NETEASE_FAVORITE_PLAYLIST_IDS.includes(id));
const AUDIO_QUALITY_LEVELS = new Set(["standard", "higher", "exhigh", "lossless", "hires", "jyeffect", "sky", "jymaster"]);
const AUDIO_QUALITY_FALLBACK_ORDER = ["jymaster", "sky", "jyeffect", "hires", "lossless", "exhigh", "higher", "standard"];
const DEFAULT_AUDIO_QUALITY = AUDIO_QUALITY_LEVELS.has(process.env.NETEASE_AUDIO_LEVEL || "")
  ? process.env.NETEASE_AUDIO_LEVEL
  : "lossless";
const lyricCache = new Map();
const NETEASE_PLAYLIST_NAMES = Object.fromEntries(
  String(process.env.NETEASE_PLAYLIST_NAMES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [id, ...nameParts] = item.split(":");
      return [String(id || "").trim(), nameParts.join(":").trim()];
    })
    .filter(([id, name]) => id && name)
);
const EMPTY_PLAYBACK_PLAYLIST = {
  name: "Empty Queue",
  playlist: {
    id: "empty",
    name: "Empty Queue",
    creator: "Local",
    cover: "",
    trackCount: 0
  },
  playlists: [],
  tracks: [],
  source: "empty"
};
const EMPTY_TRACK = {
  id: "",
  title: "Choose a playlist",
  artist: "",
  album: "",
  cover: "",
  duration: 0,
  sourceId: "",
  sourceIds: [],
  source: "empty",
  color: "#8fd8ff"
};
let neteaseLibraryCache = { expiresAt: 0, playlist: null };
const songUrlCache = new Map();

mkdirSync(DATA_DIR, { recursive: true });

const clients = new Set();
const DEFAULT_PLAYBACK_STATE = {
  playing: false,
  index: Math.floor(Math.random() * 100000),
  volume: 0.72,
  weatherLocation: null,
  // AI DJ disabled for now. Restore this line if the host copy is needed again:
  // lastHostLine: "娆㈣繋鍥炴潵銆傝繖涓€鏈熶粠浣犵殑姝屽崟閲屾娊涓€娈电浜洪鐜囷紝鍏堟妸鑰虫湹鏀捐繘澹伴煶閲屻€?,
  lastHostLine: "",
  queue: [],
  nextTracks: [],
  history: [],
  playStack: [],
  tempTrack: null,
  sessionPlaylist: null,
  nextSessionPlaylist: null,
  previousPlaybackContext: null,
  nextPlaybackContext: null,
  positionSeconds: 0,
  positionTrackKey: "",
  positionUpdatedAt: "",
  playbackMode: "sequence",
  audioQuality: DEFAULT_AUDIO_QUALITY
};
let state = { ...DEFAULT_PLAYBACK_STATE };
let latestDesktopLyrics = {
  title: "Claudio AI Radio",
  artist: "",
  current: "No lyrics",
  translation: "",
  next: "",
  playing: false,
  updatedAt: 0
};

let generationId = 0;
let weatherCache = null;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const weatherLabels = new Map([
  [0, "Clear"],
  [1, "Mainly clear"],
  [2, "Partly cloudy"],
  [3, "Overcast"],
  [45, "Fog"],
  [48, "Rime fog"],
  [51, "Light drizzle"],
  [53, "Drizzle"],
  [55, "Dense drizzle"],
  [61, "Rain"],
  [63, "Rain"],
  [65, "Heavy rain"],
  [71, "Snow"],
  [73, "Snow"],
  [75, "Heavy snow"],
  [80, "Rain showers"],
  [81, "Heavy showers"],
  [82, "Violent showers"],
  [95, "Thunderstorm"]
]);

function addNeteaseCookie(url) {
  if (process.env.NETEASE_COOKIE) {
    url.searchParams.set("cookie", process.env.NETEASE_COOKIE);
  }
  return url;
}

function json(res, value, status = 200) {
  if (res.headersSent) {
    if (!res.writableEnded) res.end();
    return;
  }
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function openDesktopLyricsOverlay() {
  const overlayPath = path.join(__dirname, "scripts", "DesktopLyricsOverlay.exe");
  if (!existsSync(overlayPath)) return { ok: false, error: "desktop lyrics overlay missing" };
  const commandPath = path.join(process.env.APPDATA || DATA_DIR, "Claudio AI Radio Desktop", "desktop-lyrics-command.txt");
  try {
    mkdirSync(path.dirname(commandPath), { recursive: true });
    writeFileSync(commandPath, `show:${Date.now()}`, "utf8");
  } catch {}
  try {
    const check = spawnSync("tasklist.exe", ["/FI", "IMAGENAME eq DesktopLyricsOverlay.exe", "/NH"], {
      encoding: "utf8",
      windowsHide: true
    });
    if (String(check.stdout || "").includes("DesktopLyricsOverlay.exe")) return { ok: true, alreadyOpen: true };
  } catch {}
  const child = spawn(overlayPath, [], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
  return { ok: true };
}

function closeDesktopLyricsOverlay() {
  try {
    spawnSync("taskkill.exe", ["/IM", "DesktopLyricsOverlay.exe", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
}

async function readText(file) {
  return readFile(path.join(DATA_DIR, file), "utf8");
}

async function writeJson(file, value) {
  mkdirSync(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readUserNeteasePlaylistIds() {
  try {
    const data = await readJson("netease-playlists.json");
    const ids = Array.isArray(data?.ids) ? data.ids : Array.isArray(data) ? data : [];
    return [...new Set(ids.map((id) => String(id || "").trim()).filter((id) => /^\d{4,}$/.test(id)))];
  } catch {
    return [];
  }
}

async function addUserNeteasePlaylistId(id) {
  const clean = String(id || "").trim();
  if (!/^\d{4,}$/.test(clean)) throw new Error("invalid playlist id");
  const ids = await readUserNeteasePlaylistIds();
  if (!ids.includes(clean)) ids.push(clean);
  await writeJson("netease-playlists.json", { ids });
  return ids;
}

async function removeUserNeteasePlaylistId(id) {
  const clean = String(id || "").trim();
  if (!/^\d{4,}$/.test(clean)) throw new Error("invalid playlist id");
  const ids = await readUserNeteasePlaylistIds();
  const next = ids.filter((item) => item !== clean);
  await writeJson("netease-playlists.json", { ids: next });
  return next;
}

async function readHomeTasks() {
  try {
    const data = await readJson("home-tasks.json");
    return Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeHomeTasks(tasks) {
  await writeJson("home-tasks.json", { tasks: tasks.slice(0, 30) });
}

async function addHomeTask(text) {
  const clean = String(text || "").trim();
  if (!clean) throw new Error("missing task text");
  const tasks = await readHomeTasks();
  const task = { id: crypto.randomUUID(), text: clean, createdAt: new Date().toISOString() };
  const next = [task, ...tasks].slice(0, 30);
  await writeHomeTasks(next);
  return next;
}

async function deleteHomeTask(id) {
  const clean = String(id || "").trim();
  if (!clean) throw new Error("missing task id");
  const tasks = await readHomeTasks();
  const next = tasks.filter((task) => String(task.id) !== clean);
  await writeHomeTasks(next);
  return next;
}

async function loadPlaybackState() {
  try {
    const saved = await readJson("playback-state.json");
    return {
      ...DEFAULT_PLAYBACK_STATE,
      ...saved,
      playing: false,
      queue: Array.isArray(saved.queue) ? saved.queue : [],
      nextTracks: Array.isArray(saved.nextTracks) ? saved.nextTracks : [],
      history: Array.isArray(saved.history) ? saved.history : [],
      playStack: Array.isArray(saved.playStack) ? saved.playStack : [],
      sessionPlaylist: saved.sessionPlaylist?.tracks?.length ? saved.sessionPlaylist : null,
      nextSessionPlaylist: saved.nextSessionPlaylist?.tracks?.length ? saved.nextSessionPlaylist : null,
      previousPlaybackContext: hasPlaybackContext(saved.previousPlaybackContext)
        ? saved.previousPlaybackContext
        : null,
      nextPlaybackContext: hasPlaybackContext(saved.nextPlaybackContext)
        ? saved.nextPlaybackContext
        : null,
      positionSeconds: Math.max(0, Number(saved.positionSeconds || 0)),
      positionTrackKey: String(saved.positionTrackKey || ""),
      positionUpdatedAt: String(saved.positionUpdatedAt || ""),
      lastHostLine: "",
      playbackMode: ["sequence", "repeat-one", "shuffle"].includes(saved.playbackMode) ? saved.playbackMode : "sequence",
      audioQuality: AUDIO_QUALITY_LEVELS.has(saved.audioQuality) ? saved.audioQuality : DEFAULT_AUDIO_QUALITY
    };
  } catch {
    return {
      ...DEFAULT_PLAYBACK_STATE,
      index: Math.floor(Math.random() * 100000)
    };
  }
}

async function savePlaybackState() {
  await writeJson("playback-state.json", {
    playing: state.playing,
    index: state.index,
    volume: state.volume,
    weatherLocation: state.weatherLocation,
    lastHostLine: state.lastHostLine,
    queue: state.queue || [],
    nextTracks: state.nextTracks || [],
    history: state.history || [],
    playStack: state.playStack || [],
      tempTrack: state.tempTrack || null,
      sessionPlaylist: state.sessionPlaylist || null,
      nextSessionPlaylist: state.nextSessionPlaylist || null,
      previousPlaybackContext: state.previousPlaybackContext || null,
      nextPlaybackContext: state.nextPlaybackContext || null,
      positionSeconds: Math.max(0, Number(state.positionSeconds || 0)),
      positionTrackKey: String(state.positionTrackKey || ""),
      positionUpdatedAt: state.positionUpdatedAt || "",
      playbackMode: state.playbackMode || "sequence",
      audioQuality: AUDIO_QUALITY_LEVELS.has(state.audioQuality) ? state.audioQuality : DEFAULT_AUDIO_QUALITY
  });
}

state = await loadPlaybackState();
await savePlaybackState();

async function loadPlaylist() {
  if (!NETEASE_LIBRARY_PLAYLIST_ID && !existsSync(path.join(DATA_DIR, "playlists.json"))) {
    return EMPTY_PLAYBACK_PLAYLIST;
  }
  if (NETEASE_LIBRARY_PLAYLIST_ID && process.env.NETEASE_COOKIE && Date.now() < neteaseLibraryCache.expiresAt && neteaseLibraryCache.playlist) {
    return neteaseLibraryCache.playlist;
  }
  if (NETEASE_LIBRARY_PLAYLIST_ID && process.env.NETEASE_COOKIE) {
    try {
      const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
      const item = await readNeteasePlaylistTracks(base, {
        id: NETEASE_LIBRARY_PLAYLIST_ID,
        name: NETEASE_PLAYLIST_NAMES[NETEASE_LIBRARY_PLAYLIST_ID] || "NetEase Library"
      });
      const playlist = {
        source: "netease",
        importedAt: new Date().toISOString(),
        playlist: {
          id: item.source.id,
          name: item.source.name || "NetEase Library",
          creator: "NetEase",
          cover: item.source.cover || "",
          trackCount: item.tracks.length
        },
        playlists: [{
          id: item.source.id,
          name: item.source.name || "NetEase Library",
          creator: "NetEase",
          cover: item.source.cover || "",
          trackCount: item.tracks.length
        }],
        tracks: item.tracks || []
      };
      neteaseLibraryCache = { expiresAt: Date.now() + 30_000, playlist };
      return playlist;
    } catch (error) {
      console.warn("[netease] library fallback:", error.message);
    }
  }
  try {
    const playlist = await readJson("playlists.json");
    return {
      ...playlist,
      tracks: playlist.tracks || []
    };
  } catch {
    return EMPTY_PLAYBACK_PLAYLIST;
  }
}

async function getTaste() {
  try {
    return await readJson("taste.json");
  } catch {
    return {};
  }
}

async function getMemory() {
  try {
    return await readJson("memory.json");
  } catch {
    return {
      chatCount: 0,
      preferences: [],
      recentAsks: [],
      artistAliases: {},
      lastRecommendations: [],
      pendingTitle: null,
      pendingTitleAt: null,
      pendingArtistAlias: null,
      pendingArtistIntent: null,
      updatedAt: null
    };
  }
}

async function rememberChat(prompt) {
  const memory = await getMemory();
  const text = normalizeText(prompt);
  const hints = [
    ["r&b", /r&b|rnb|rb|soul|布鲁斯/i],
    ["emo", /emo|伤感|丧/i],
    ["纯音/OST", /纯音|ost|bgm|原声|配乐|前奏/i],
    ["写代码", /coding|工作|专注|写代码/i],
    ["夜晚慢歌", /夜晚|晚上|深夜|慢|放松/i],
    ["中文歌", /中文|国语|华语/i],
    ["英文歌", /英文|英语|欧美|外文|english|western/i],
    ["散步", /散步|走路|步行|walk/i],
    ["暧昧暖歌", /暧昧|温柔|心动|甜/i],
    ["日语歌", /日语|日文|jpop|j-pop|动漫/i]
  ];
  for (const [label, pattern] of hints) {
    if (pattern.test(text) && !memory.preferences.includes(label)) {
      memory.preferences.push(label);
    }
  }
  memory.chatCount += 1;
  memory.recentAsks = [prompt, ...memory.recentAsks.filter((item) => item !== prompt)].slice(0, 8);
  memory.artistAliases ||= {};
  memory.lastRecommendations ||= [];
  memory.updatedAt = new Date().toISOString();
  await writeJson("memory.json", memory);
  return memory;
}

async function rememberRecommendations(memory, recommendations) {
  memory.lastRecommendations = (recommendations || [])
    .map((item) => Number(item.index))
    .filter((index) => Number.isInteger(index))
    .slice(0, 40);
  memory.lastRecommendationTitles = (recommendations || [])
    .map((item) => {
      const track = item.track || item;
      return [track.title, track.artist, track.album].filter(Boolean).join(" - ");
    })
    .filter(Boolean)
    .slice(0, 40);
  await writeJson("memory.json", memory);
  return memory;
}

async function rememberPendingTitle(memory, title) {
  const cleanTitle = String(title || "").trim().slice(0, 120);
  if (!cleanTitle) return memory;
  memory.pendingTitle = cleanTitle;
  memory.pendingTitleAt = new Date().toISOString();
  await writeJson("memory.json", memory);
  return memory;
}

async function clearPendingTitle(memory) {
  if (!memory) return memory;
  memory.pendingTitle = null;
  memory.pendingTitleAt = null;
  await writeJson("memory.json", memory);
  return memory;
}

function pendingTitleIsFresh(memory) {
  if (!memory?.pendingTitle || !memory.pendingTitleAt) return false;
  const age = Date.now() - Date.parse(memory.pendingTitleAt);
  return Number.isFinite(age) && age < 10 * 60 * 1000;
}

function wantsPendingTitlePlayback(prompt) {
  const text = normalizeText(prompt);
  return /直接播放|播放就行|就这首|不用确认|默认版本|原声版/i.test(text);
}

function extractRequestedTitle(prompt) {
  const text = String(prompt || "").trim();
  const patterns = [
    /(?:我要听|我想听|想听|播放|放一首|来一首|给我放|给我播)\s*《([^》]{1,120})》/i,
    /(?:我要听|我想听|想听|播放|放一首|来一首|给我放|给我播)\s+(.{1,120})$/i,
    /(?:我要听|我想听|想听|播放|放一首|来一首|给我放|给我播)(.{1,120})$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    return match[1]
      .replace(/(?:这首歌|这首|这歌|歌曲|音乐|的歌)$/i, "")
      .replace(/[，。！？,.!?]+$/g, "")
      .trim();
  }
  return "";
}

async function playTitleImmediately(title, playlist, memory) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) return null;
  const localMatches = findTitleMatches(playlist, cleanTitle, 8);
  if (localMatches.length) {
    const first = localMatches[0];
    const rest = localMatches.slice(1).map((item) => item.index).filter((index) => index !== first.index);
    state.tempTrack = null;
    state.index = first.index;
    state.playing = true;
    state.lastHostLine = "";
    state.queue = rest;
    fillHostLineAsync(state.index);
    await rememberRecommendations(memory, localMatches);
    await clearPendingTitle(memory);
    await broadcast();
    return {
      reply: rest.length
        ? `已直接播放《${playlist.tracks[first.index].title}》，另外 ${rest.length} 个匹配版本排在后面。`
        : `已直接播放《${playlist.tracks[first.index].title}》。`,
      recommendations: localMatches.map(recommendationFromMatch),
      queued: rest.length > 0,
      queuePreview: queuePreviewFromIndexes(playlist, rest),
      memory
    };
  }
  const netease = await searchNeteaseSongs(cleanTitle, 8);
  const tracks = netease.map((track) => externalNeteaseTrack(track)).filter((track) => track.sourceId);
  if (tracks.length) {
    const [first, ...rest] = tracks;
    state.sessionPlaylist = null;
    state.nextSessionPlaylist = null;
    state.tempTrack = first;
    state.nextTracks = rest;
    state.playing = true;
    state.lastHostLine = "";
    fillTempHostLineAsync(first);
    await clearPendingTitle(memory);
    await broadcast();
    return {
      reply: rest.length
        ? `已直接播放网易云搜索到的《${first.title}》，后面还排了 ${rest.length} 个相关版本。`
        : `已直接播放网易云搜索到的《${first.title}》。`,
      recommendations: neteaseRecommendations(netease),
      queued: rest.length > 0,
      queuePreview: rest.slice(0, 12).map((track, index) => ({
        index,
        title: track.title,
        artist: track.artist,
        album: track.album || ""
      })),
      memory
    };
  }
  await clearPendingTitle(memory);
  return {
    reply: `我按《${cleanTitle}》搜了本地歌单和网易云，还是没拿到可播放结果。`,
    recommendations: [],
    queued: false,
    queuePreview: [],
    memory
  };
}

function dayPart() {
  const hour = new Date().getHours();
  if (hour < 6) return "late night";
  if (hour < 11) return "morning";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "late night";
}

function dayPartLabel(value = dayPart()) {
  return {
    morning: "早上",
    afternoon: "下午",
    evening: "晚上",
    "late night": "深夜"
  }[value] || value;
}

function weatherMood(weather) {
  const text = `${weather.text || ""}`.toLowerCase();
  if (text.includes("雨") || text.includes("rain")) return "下雨，偏低 BPM、暖色、松一点的歌";
  if (text.includes("雪") || text.includes("snow")) return "下雪，偏安静、空旷、慢一点的歌";
  if (text.includes("晴") || text.includes("clear")) return "晴朗，适合更明亮、有步行感的歌";
  if (text.includes("阴") || text.includes("云") || text.includes("cloud")) return "多云或阴天，适合柔和、有内省感的歌";
  if (weather.temp >= 30) return "天气偏热，适合清爽、轻快、低压愉快的歌";
  if (weather.temp <= 8) return "天气偏冷，适合温暖、厚一点的声音";
  return "天气平稳，按当前情绪自然衔接";
}

async function getWeather() {
  const locationKey = state.weatherLocation
    ? `${state.weatherLocation.lat},${state.weatherLocation.lon}`
    : process.env.CITY || "Shanghai";
  if (weatherCache?.key === locationKey && Date.now() - weatherCache.at < 180000) {
    return weatherCache.value;
  }
  const key = process.env.OPENWEATHER_API_KEY;
  const city = process.env.CITY || "Shanghai";
  const location = state.weatherLocation;
  let value;

  if (key) {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    if (location?.lat && location?.lon) {
      url.searchParams.set("lat", location.lat);
      url.searchParams.set("lon", location.lon);
    } else {
      url.searchParams.set("q", city);
    }
    url.searchParams.set("appid", key);
    url.searchParams.set("units", "metric");
    url.searchParams.set("lang", "zh_cn");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenWeather failed: ${response.status}`);
    const data = await response.json();
    value = {
      city: data.name || location?.label || city,
      text: data.weather?.[0]?.description || "鏈煡",
      temp: Math.round(data.main?.temp || 0),
      source: "openweather"
    };
    weatherCache = { key: locationKey, at: Date.now(), value };
    return value;
  }

  if (location?.lat && location?.lon) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", location.lat);
    url.searchParams.set("longitude", location.lon);
    url.searchParams.set("current", "temperature_2m,weather_code,precipitation");
    url.searchParams.set("timezone", "auto");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo failed: ${response.status}`);
    const data = await response.json();
    const code = data.current?.weather_code;
    value = {
      city: location.label || "褰撳墠浣嶇疆",
      text: weatherLabels.get(code) || "褰撳湴澶╂皵",
      temp: Math.round(data.current?.temperature_2m || 0),
      precipitation: data.current?.precipitation || 0,
      source: "open-meteo"
    };
    weatherCache = { key: locationKey, at: Date.now(), value };
    return value;
  }

  value = {
    city,
    text: "cloudy",
    temp: 24,
    source: "mock"
  };
  weatherCache = { key: locationKey, at: Date.now(), value };
  return value;
}

async function getLyric(songId) {
  if (!songId) return { lyric: "", source: "none" };
  const cacheKey = String(songId);
  const cached = lyricCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  try {
    const url = addNeteaseCookie(new URL(`${base}/lyric`));
    url.searchParams.set("id", songId);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Lyric failed: ${response.status}`);
    const data = await response.json();
    const value = {
      lyric: data.lrc?.lyric || data.klyric?.lyric || "",
      tlyric: data.tlyric?.lyric || "",
      source: "netease"
    };
    lyricCache.set(cacheKey, { value, expiresAt: Date.now() + 1000 * 60 * 30 });
    return value;
  } catch {
    return { lyric: "", source: "none" };
  }
}

async function getSongUrl(songId) {
  if (!songId) return { url: "", source: "none" };
  const level = AUDIO_QUALITY_LEVELS.has(state.audioQuality) ? state.audioQuality : DEFAULT_AUDIO_QUALITY;
  const cacheKey = `${String(songId)}:${level}`;
  const cached = songUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  const promise = (async () => {
    const levels = [level, ...AUDIO_QUALITY_FALLBACK_ORDER.filter((item) => item !== level)];
    const attempts = [];
    for (const requestedLevel of levels) {
      const url = addNeteaseCookie(new URL(`${base}/song/url/v1`));
      url.searchParams.set("id", songId);
      url.searchParams.set("level", requestedLevel);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const item = data.data?.[0];
        attempts.push({ level: requestedLevel, code: item?.code || data.code || 0, hasUrl: Boolean(item?.url) });
        if (item?.url) {
          return {
            url: item.url,
            level: item.level || requestedLevel,
            requestedLevel: level,
            fallback: requestedLevel !== level || (item.level && item.level !== level),
            type: item.type || "",
            time: item.time || 0,
            code: item.code || data.code,
            source: "netease"
          };
        }
      } catch (error) {
        attempts.push({ level: requestedLevel, error: error.message || "request failed", hasUrl: false });
      }
    }
    return {
      url: "",
      level,
      requestedLevel: level,
      code: 0,
      error: "no playable url",
      attempts,
      source: "none"
    };
  })().catch((error) => {
    songUrlCache.delete(cacheKey);
    return { url: "", error: error.message, source: "none" };
  });
  const guardedPromise = promise.then((value) => {
    if (!value?.url) songUrlCache.delete(cacheKey);
    return value;
  });
  songUrlCache.set(cacheKey, { expiresAt: Date.now() + 8 * 60 * 1000, promise: guardedPromise });
  return guardedPromise;
}

function warmSongUrl(songId) {
  if (!songId) return;
  getSongUrl(songId).catch(() => {});
  if (songUrlCache.size > 300) {
    const now = Date.now();
    for (const [key, item] of songUrlCache) {
      if (item.expiresAt <= now || songUrlCache.size > 240) songUrlCache.delete(key);
    }
  }
}

async function getNeteaseMemoryCoordinate(songId) {
  const id = String(songId || "").trim();
  if (!/^\d{4,}$/.test(id)) throw new Error("invalid song id");
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  const url = addNeteaseCookie(new URL(`${base}/music/first/listen/info`));
  url.searchParams.set("id", id);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`/music/first/listen/info HTTP ${response.status}`);
  const data = await response.json();
  if (data.code && data.code !== 200) throw new Error(`/music/first/listen/info API ${data.code}`);
  return {
    code: data.code || 200,
    data: data.data || {},
    message: data.message || ""
  };
}

function neteaseSongSummary(song, score = 0) {
  const album = song.al || song.album || {};
  const artists = song.ar || song.artists || [];
  const artistIds = artists.map((item) => String(item.id || "")).filter(Boolean);
  return {
    title: song.name || "",
    artist: (song.ar || song.artists || []).map((item) => item.name).filter(Boolean).join(" / ") || "鏈煡姝屾墜",
    artistIds,
    artistId: artistIds[0] || "",
    album: album.name || "",
    albumId: String(album.id || ""),
    cover: album.picUrl || "",
    duration: Math.round((song.dt || song.duration || 0) / 1000) || 0,
    sourceId: String(song.id || ""),
    source: "netease",
    external: true,
    tags: neteaseSongTags(song),
    pop: Number(song.pop ?? song.popularity ?? song.hotScore ?? 0) || 0,
    score
  };
}

function isDjVersionTrack(track = {}) {
  const album = track.album?.name || track.al?.name || track.album || "";
  const aliases = Array.isArray(track.alias) ? track.alias.join(" ") : "";
  const title = track.title || track.name || "";
  const mood = track.mood || "";
  const text = [title, album, aliases, mood].filter(Boolean).join(" ");
  const normalized = normalizeText(text);
  const compact = normalized.replace(/\s+/g, "");
  return /(?:^|[\s\-_/()[\]【】])(?:dj|d\.j\.?)(?:$|[\s\-_/()[\]【】])/i.test(text)
    || /(?:dj|d\.j\.?).{0,12}(?:version|remix|mix|club|bootleg|extended|串烧|舞曲|车载|慢摇|抖音|快手|弹鼓|土嗨|夜店|加速|变速)/i.test(text)
    || /(?:version|remix|mix|club|bootleg|extended|串烧|舞曲|车载|慢摇|抖音|快手|弹鼓|土嗨|夜店|加速|变速).{0,12}(?:dj|d\.j\.?)/i.test(text)
    || /dj(?:version|remix|mix|club|bootleg|extended)|(?:抖音|快手|车载|慢摇|夜店|土嗨)dj/i.test(compact);
}

function filterPlayableTracks(tracks = []) {
  return Array.isArray(tracks)
    ? tracks.filter((track) => !isDjVersionTrack(track) && !isSpeedAlteredTrack(track) && !isBlockedGenreTrack(track))
    : [];
}

function filterRecommendedTracks(tracks = []) {
  return filterPlayableTracks(tracks);
}

function filterPlaybackTracks(tracks = []) {
  return Array.isArray(tracks)
    ? tracks.filter((track) => track?.sourceId && !isBlockedForPlayback(track))
    : [];
}

function isLibraryPlaylistId(id) {
  return String(id || "") === NETEASE_LIBRARY_PLAYLIST_ID;
}

function isLibraryTrack(track = {}) {
  return isLibraryPlaylistId(track.libraryPlaylistId)
    || (Array.isArray(track.playlists) && track.playlists.some((playlist) => isLibraryPlaylistId(playlist.id)));
}

function isBlockedForPlayback(track = {}) {
  if (isLibraryTrack(track)) return false;
  return isDjVersionTrack(track) || isSpeedAlteredTrack(track) || isBlockedGenreTrack(track);
}

function isSpeedAlteredTrack(track = {}) {
  const album = track.album?.name || track.al?.name || track.album || "";
  const aliases = Array.isArray(track.alias) ? track.alias.join(" ") : "";
  const title = track.title || track.name || "";
  const mood = track.mood || "";
  const text = [title, album, aliases, mood].filter(Boolean).join(" ");
  const compact = normalizeText(text).replace(/\s+/g, "");
  return /(?:^|[\s\-_/路.()[\]（）【】])(?:0[,.][5-9]|1[,.][1-9]|2[,.]0)\s*(?:x|倍速|速|版)?(?:$|[\s\-_/路.()[\]（）【】])/i.test(text)
    || /(?:sped\s*up|speed\s*up|slowed|slow\s*version|nightcore|加速|变速|倍速|降速|慢速|调速)/i.test(text)
    || /(?:0[,.][5-9]|1[,.][1-9]|2[,.]0)(?:x|倍速|速)|(?:spedup|speedup|slowed|nightcore|加速|变速|倍速|降速|慢速|调速)/i.test(compact);
}

function isBlockedGenreTrack(track = {}) {
  const album = track.album?.name || track.al?.name || track.album || "";
  const aliases = Array.isArray(track.alias) ? track.alias.join(" ") : "";
  const artists = track.artist
    || (track.ar || track.artists || []).map((item) => item.name).filter(Boolean).join(" ");
  const title = track.title || track.name || "";
  const mood = track.mood || "";
  const tags = Array.isArray(track.tags) ? track.tags.join(" ") : "";
  const reason = track.recommendReason || track.reason || track.rcmdReason || track.algReason || "";
  const text = [title, album, aliases, artists, mood, tags, reason].filter(Boolean).join(" ");
  const normalized = normalizeText(text);
  const compact = normalized.replace(/\s+/g, "");
  const rap = /璇村敱|鍢诲搱|楗惰垖|涓枃璇村敱|鍥借|rapper|\brap\b|hip[\s.-]*hop|\btrap\b|drill|boom\s*bap|freestyle/i.test(normalized)
    || /璇村敱|鍢诲搱|楗惰垖|hiphop|trap|drill|boombap|freestyle/i.test(compact);
  const electronic = /鐢靛瓙|鐢甸煶|鐢靛瓙鑸炴洸|鑸炴洸|鍚堟垚鍣▅娴╁|鍑虹|杩峰够|纭牳|榧撴墦璐濇柉|\bedm\b|electronic|electronica|electronique|synthwave|synth\s*pop|future\s*bass|future\s*house|bass\s*house|deep\s*house|tech\s*house|\bhouse\b|\btechno\b|\btrance\b|\bdubstep\b|\bdnb\b|drum\s*(?:and|&)\s*bass|hardstyle|psytrance|electro\s*house|progressive\s*house/i.test(normalized)
    || /鐢靛瓙|鐢甸煶|鐢靛瓙鑸炴洸|synthwave|synthpop|futurebass|futurehouse|basshouse|deephouse|techhouse|electrohouse|progressivehouse|dubstep|hardstyle|psytrance|drumandbass/i.test(compact);
  const plainHouseOnly = /\bhouse\b/i.test(normalized)
    && !/future\s*house|bass\s*house|deep\s*house|tech\s*house|electro\s*house|progressive\s*house/i.test(normalized)
    && !/futurehouse|basshouse|deephouse|techhouse|electrohouse|progressivehouse/i.test(compact)
    && !/閻㈤潧鐡檤閻㈢敻鐓秥閻㈤潧鐡欓懜鐐存锤|electronic|electronica|\bedm\b|synthwave|\btechno\b|\btrance\b|\bdubstep\b|\bdnb\b|drum\s*(?:and|&)\s*bass|hardstyle|psytrance/i.test(normalized);
  return rap || (electronic && !plainHouseOnly);
}

function isBlockedGenreQuery(query = "") {
  const normalized = normalizeText(query);
  const compact = normalized.replace(/\s+/g, "");
  const plainHouseOnly = /\bhouse\b/i.test(normalized)
    && !/future\s*house|bass\s*house|deep\s*house|tech\s*house|electro\s*house|progressive\s*house/i.test(normalized)
    && !/futurehouse|basshouse|deephouse|techhouse|electrohouse|progressivehouse/i.test(compact)
    && !/閻㈤潧鐡檤閻㈢敻鐓秥閻㈤潧鐡欓懜鐐存锤|electronic|electronica|\bedm\b|synthwave|\btechno\b|\btrance\b|\bdubstep\b|hardstyle|psytrance|drum\s*(?:and|&)\s*bass/i.test(normalized);
  if (plainHouseOnly) return false;
  return /璇村敱|鍢诲搱|楗惰垖|涓枃璇村敱|鍥借|\brap\b|hip[\s.-]*hop|\btrap\b|\bedm\b|鐢靛瓙鑸炴洸|鐢甸煶|electronic|electronica|synthwave|future\s*bass|future\s*house|\bhouse\b|\btechno\b|\btrance\b|\bdubstep\b|hardstyle|psytrance|drum\s*(?:and|&)\s*bass/i.test(normalized)
    || /璇村敱|鍢诲搱|楗惰垖|hiphop|trap|edm|鐢靛瓙鑸炴洸|鐢甸煶|synthwave|futurebass|futurehouse|dubstep|hardstyle|psytrance|drumandbass/i.test(compact);
}

async function searchNeteaseSongs(query, limit = 8) {
  const keywords = String(query || "").trim();
  if (!keywords) return [];
  if (isBlockedGenreQuery(keywords)) return [];
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  try {
    const url = addNeteaseCookie(new URL(`${base}/cloudsearch`));
    url.searchParams.set("keywords", keywords);
    url.searchParams.set("type", "1");
    url.searchParams.set("limit", String(limit));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NetEase search failed: ${response.status}`);
    const data = await response.json();
    const songs = data.result?.songs || [];
    return songs
      .filter((song) => !isDjVersionTrack(song) && !isSpeedAlteredTrack(song) && !isBlockedGenreTrack(song))
      .slice(0, limit)
      .map((song) => neteaseSongSummary(song, 0))
      .filter((song) => song.title && song.sourceId);
  } catch (error) {
    console.warn("[netease] search fallback:", error.message);
    return [];
  }
}

async function searchNeteaseArtistSongs(artist, limit = 50) {
  const name = String(artist || "").trim();
  if (!name) return [];
  const songs = await searchNeteaseSongs(name, Math.max(limit, 50));
  const target = compactText(name);
  return songs
    .map((song) => {
      const artistCompact = compactText(song.artist || "");
      const exact = artistCompact === target ? 300 : 0;
      const contains = artistCompact.includes(target) ? 180 : 0;
      const pop = Number(song.pop || 0);
      return { ...song, score: Math.max(song.score || 0, exact || contains) + pop };
    })
    .filter((song) => song.score > 0 || compactText(song.artist || "").includes(target))
    .sort((a, b) => (Number(b.pop || 0) - Number(a.pop || 0)) || (b.score - a.score) || a.title.localeCompare(b.title, "zh-Hans-CN"))
    .slice(0, limit);
}

async function readNeteaseArtistSongs(base, artistId, limit = 50) {
  const id = String(artistId || "").trim();
  const urls = [
    { path: "/artist/songs", params: { id, limit: String(limit), order: "hot" } },
    { path: "/artist/top/song", params: { id } }
  ];
  for (const item of urls) {
    try {
      const url = addNeteaseCookie(new URL(`${base}${item.path}`));
      for (const [key, value] of Object.entries(item.params)) url.searchParams.set(key, value);
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      if (data.code && data.code !== 200) continue;
      const songs = data.songs || data.hotSongs || [];
      if (Array.isArray(songs) && songs.length) {
        return songs
          .filter((song) => !isDjVersionTrack(song) && !isSpeedAlteredTrack(song) && !isBlockedGenreTrack(song))
          .slice(0, limit)
          .map((song) => neteaseSongSummary(song, 0))
          .filter((song) => song.title && song.sourceId);
      }
    } catch {
      // Try the next artist endpoint variant.
    }
  }
  return [];
}

function neteaseSongTags(song = {}) {
  const tags = [];
  const reason = song.recommendReason || song.reason || song.rcmdReason || song.algReason || "";
  if (reason) tags.push(String(reason).replace(/\s+/g, "").slice(0, 12));

  const pop = Number(song.pop ?? song.popularity ?? song.hotScore);
  if (Number.isFinite(pop) && pop >= 50) tags.push(`热度${Math.min(99, Math.round(pop))}%`);

  const likedCount = Number(song.likedCount ?? song.likeCount ?? song.collectionCount ?? song.subscribedCount);
  if (Number.isFinite(likedCount) && likedCount >= 10000) {
    if (likedCount >= 1000000) tags.push("百万红心");
    else if (likedCount >= 100000) tags.push("十万红心");
    else tags.push("万次红心");
  }

  const fee = song.fee ?? song.privilege?.fee;
  if (fee === 1) tags.push("VIP");
  if (fee === 4) tags.push("浠樿垂");
  if (fee === 8) tags.push("璇曞惉");
  if (song.hr || song.sq || song.privilege?.maxbr >= 999000) tags.push("瓒呮竻姣嶅甫");
  if (song.mv || song.mvid) tags.push("MV");
  if (song.privilege?.flag > 0 && !tags.includes("VIP")) tags.push("鐗堟潈");
  return [...new Set(tags.filter((tag) => tag && !/^绉佷汉闆疯揪$|^姣忔棩鎺ㄨ崘$|^绉佷汉FM$/.test(tag)))].slice(0, 3);
}

function neteaseRecommendations(songs) {
  return filterRecommendedTracks(songs).map((song, index) => ({
    index: -1,
    external: true,
    source: "netease",
    sourceId: song.sourceId,
    title: song.title,
    artist: song.artist,
    artistId: song.artistId || "",
    artistIds: song.artistIds || [],
    album: song.album || "",
    albumId: song.albumId || "",
    cover: song.cover || "",
    duration: song.duration || 0,
    tags: song.tags || [],
    score: song.score || (80 - index)
  }));
}

function trackIdentity(track) {
  return `${normalizeText(track.title)} :: ${normalizeText(track.artist)}`;
}

function hashColor(seed) {
  const colors = ["#8fd7ff", "#ffd36e", "#91f0b3", "#f49ab1", "#c8a2ff", "#ff9f68"];
  const sum = [...String(seed || "")].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

function neteaseSongToTrack(song, source) {
  const artists = song.ar || song.artists || [];
  const artistIds = artists.map((item) => String(item.id || "")).filter(Boolean);
  const album = song.al || song.album || {};
  const sourceId = String(song.id || "");
  return {
    id: sourceId,
    title: song.name || "NetEase Song",
    artist: artists.map((item) => item.name).filter(Boolean).join(" / ") || "Unknown Artist",
    artistIds,
    artistId: artistIds[0] || "",
    album: album.name || source.name,
    albumId: String(album.id || ""),
    mood: source.name,
    bpm: null,
    color: hashColor(sourceId || song.name),
    duration: Math.max(30, Math.round((song.dt || song.duration || 180000) / 1000)),
    url: "",
    cover: album.picUrl || "",
    source: "netease",
    libraryPlaylistId: isLibraryPlaylistId(source.id) ? source.id : "",
    sourceId,
    sourceIds: [sourceId],
    playlists: [{ id: source.id, name: source.name }],
    fee: song.fee,
    tags: neteaseSongTags(song),
    level: ""
  };
}

async function getNeteaseProfile(base) {
  const statusUrl = addNeteaseCookie(new URL(`${base}/login/status`));
  const response = await fetch(statusUrl);
  if (!response.ok) throw new Error(`login/status HTTP ${response.status}`);
  const status = await response.json();
  const profile = status.data?.profile || status.profile || {};
  const uid = profile.userId || status.account?.id || status.data?.account?.id || "";
  if (!uid) throw new Error("NetEase account is not logged in");
  return { uid, profile };
}

async function readNeteasePlaylistTracks(base, playlist) {
  const source = {
    id: String(playlist.id),
    name: playlist.name || "NetEase Playlist",
    cover: playlist.coverImgUrl || playlist.picUrl || "",
    trackCount: playlist.trackCount || 0,
    description: playlist.description || playlist.desc || playlist.briefDesc || ""
  };
  let detailPlaylist = null;
  try {
    const metaUrl = addNeteaseCookie(new URL(`${base}/playlist/detail`));
    metaUrl.searchParams.set("id", source.id);
    const metaResponse = await fetch(metaUrl);
    if (metaResponse.ok) {
      const meta = await metaResponse.json();
      if (!meta.code || meta.code === 200) {
        detailPlaylist = meta.playlist || meta.result || null;
        source.name = detailPlaylist?.name || source.name;
        source.cover = detailPlaylist?.coverImgUrl || detailPlaylist?.picUrl || source.cover;
        source.trackCount = detailPlaylist?.trackCount || source.trackCount;
        source.description = detailPlaylist?.description || detailPlaylist?.desc || detailPlaylist?.briefDesc || source.description || "";
      }
    }
  } catch {
    // Track loading can continue with fallback metadata.
  }
  try {
    const pageSize = 500;
    const targetCount = Number(source.trackCount || detailPlaylist?.trackCount || 0);
    const songs = [];
    for (let offset = 0; offset < Math.max(targetCount || pageSize, pageSize); offset += pageSize) {
      const allUrl = addNeteaseCookie(new URL(`${base}/playlist/track/all`));
      allUrl.searchParams.set("id", source.id);
      allUrl.searchParams.set("limit", String(pageSize));
      allUrl.searchParams.set("offset", String(offset));
      const response = await fetch(allUrl);
      if (!response.ok) throw new Error(`/playlist/track/all HTTP ${response.status}`);
      const data = await response.json();
      if (data.code && data.code !== 200) throw new Error(`/playlist/track/all API ${data.code}`);
      const pageSongs = data.songs || data.data?.songs || [];
      if (!Array.isArray(pageSongs) || !pageSongs.length) break;
      songs.push(...pageSongs);
      if (targetCount && songs.length >= targetCount) break;
      if (!targetCount && pageSongs.length < pageSize) break;
    }
    if (Array.isArray(songs) && songs.length) {
      const seen = new Set();
      const mappedTracks = songs.map((song) => neteaseSongToTrack(song, source));
      const tracks = (isLibraryPlaylistId(source.id) ? mappedTracks : filterRecommendedTracks(mappedTracks))
        .filter((track) => {
          const key = String(track.sourceId || track.id || "");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      source.cover ||= tracks.find((track) => track.cover)?.cover || "";
      source.trackCount = targetCount || source.trackCount || tracks.length;
      return { source, tracks };
    }
  } catch {
    // Some API forks do not expose /playlist/track/all.
  }

  if (!detailPlaylist) {
    const detailUrl = addNeteaseCookie(new URL(`${base}/playlist/detail`));
    detailUrl.searchParams.set("id", source.id);
    const detailResponse = await fetch(detailUrl);
    if (!detailResponse.ok) throw new Error(`/playlist/detail HTTP ${detailResponse.status}`);
    const detail = await detailResponse.json();
    if (detail.code && detail.code !== 200) throw new Error(`/playlist/detail API ${detail.code}`);
    detailPlaylist = detail.playlist || detail.result || {};
  }
  source.name = detailPlaylist.name || source.name;
  source.cover = detailPlaylist.coverImgUrl || detailPlaylist.picUrl || source.cover;
  source.trackCount = detailPlaylist.trackCount || source.trackCount;
  source.description = detailPlaylist.description || detailPlaylist.desc || detailPlaylist.briefDesc || source.description || "";
  const songs = detailPlaylist.tracks || [];
  const mappedTracks = songs.map((song) => neteaseSongToTrack(song, source));
  const tracks = (isLibraryPlaylistId(source.id) ? mappedTracks : filterRecommendedTracks(mappedTracks)).filter((track) => track.sourceId);
  source.cover ||= tracks.find((track) => track.cover)?.cover || "";
  source.trackCount ||= tracks.length;
  return { source, tracks };
}

async function readNeteaseAlbumTracks(base, albumId) {
  const id = String(albumId || "").trim();
  const albumUrl = addNeteaseCookie(new URL(`${base}/album`));
  albumUrl.searchParams.set("id", id);
  const response = await fetch(albumUrl);
  if (!response.ok) throw new Error(`/album HTTP ${response.status}`);
  const data = await response.json();
  if (data.code && data.code !== 200) throw new Error(`/album API ${data.code}`);
  const album = data.album || {};
  const source = {
    id,
    name: album.name || "NetEase Album",
    cover: album.picUrl || "",
    trackCount: album.size || data.songs?.length || 0
  };
  const songs = data.songs || album.songs || [];
  const tracks = filterPlayableTracks(songs.map((song) => neteaseSongToTrack(song, source))).filter((track) => track.sourceId);
  source.cover ||= tracks.find((track) => track.cover)?.cover || "";
  source.trackCount ||= tracks.length;
  return { source, tracks };
}

async function readNeteaseSourceCards(extraPlaylistIds = []) {
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  const cardFromItem = (id, name, item) => ({
      id,
      name,
      cover: item?.source?.cover || item?.tracks?.find((track) => track.cover)?.cover || "",
      trackCount: item?.source?.trackCount || item?.tracks?.length || 0
  });
  const tasks = [];
  if (NETEASE_LIBRARY_PLAYLIST_ID) {
    const fallbackName = NETEASE_PLAYLIST_NAMES[NETEASE_LIBRARY_PLAYLIST_ID] || "鎴戠殑鍠滄";
    tasks.push(readNeteasePlaylistCard(base, { id: NETEASE_LIBRARY_PLAYLIST_ID, name: fallbackName })
      .then((item) => cardFromItem("local", "鎴戠殑鍠滄", item))
      .catch(() => cardFromItem("local", "鎴戠殑鍠滄", null)));
  }
  tasks.push(readNeteaseDynamicSource("daily")
    .then((item) => cardFromItem("daily", "姣忔棩鎺ㄨ崘", item))
    .catch(() => cardFromItem("daily", "姣忔棩鎺ㄨ崘", null)));
  tasks.push(readNeteaseDynamicSource("personal_fm")
    .then((item) => cardFromItem("personal_fm", "绉佷汉闆疯揪", item))
    .catch(() => cardFromItem("personal_fm", "绉佷汉闆疯揪", null)));
  const userPlaylistIds = await readUserNeteasePlaylistIds();
  const playlistIds = [...new Set([...NETEASE_IMPORTED_PLAYLIST_IDS, ...userPlaylistIds, ...extraPlaylistIds]
    .map((id) => String(id || "").trim())
    .filter((id) => /^\d{4,}$/.test(id)))];
  for (const playlistId of playlistIds) {
    const fallbackName = NETEASE_PLAYLIST_NAMES[playlistId] || `Playlist ${playlistId}`;
    tasks.push(readNeteasePlaylistCard(base, { id: playlistId, name: fallbackName })
      .then((item) => {
        item.source.name = NETEASE_PLAYLIST_NAMES[playlistId] || item.source.name || fallbackName;
        return cardFromItem(`playlist-${playlistId}`, item.source.name, item);
      })
      .catch(() => cardFromItem(`playlist-${playlistId}`, fallbackName, null)));
  }
  const cards = await Promise.all(tasks);
  const seen = new Set();
  return { cards: cards.filter((card) => {
    if (!card?.id || seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  }) };
}

async function readNeteasePlaylistCard(base, source) {
  const detailUrl = addNeteaseCookie(new URL(`${base}/playlist/detail`));
  detailUrl.searchParams.set("id", source.id);
  const detailResponse = await fetch(detailUrl);
  if (!detailResponse.ok) throw new Error(`/playlist/detail HTTP ${detailResponse.status}`);
  const detail = await detailResponse.json();
  if (detail.code && detail.code !== 200) throw new Error(`/playlist/detail API ${detail.code}`);
  const playlist = detail.playlist || detail.result || {};
  const firstTrack = playlist.tracks?.[0] || null;
  return {
    source: {
      id: source.id,
      name: playlist.name || source.name,
      cover: playlist.coverImgUrl || playlist.picUrl || "",
      trackCount: playlist.trackCount || playlist.trackIds?.length || 0
    },
    tracks: firstTrack ? [neteaseSongToTrack(firstTrack, source)].filter((track) => track.sourceId) : []
  };
}

async function readNeteaseAlbumTracksForSong(base, songId) {
  const id = String(songId || "").trim();
  const detailUrl = addNeteaseCookie(new URL(`${base}/song/detail`));
  detailUrl.searchParams.set("ids", id);
  const response = await fetch(detailUrl);
  if (!response.ok) throw new Error(`/song/detail HTTP ${response.status}`);
  const data = await response.json();
  if (data.code && data.code !== 200) throw new Error(`/song/detail API ${data.code}`);
  const song = data.songs?.[0];
  const albumId = song?.al?.id || song?.album?.id;
  if (!albumId) throw new Error("missing album id");
  return readNeteaseAlbumTracks(base, albumId);
}

async function readNeteaseRadarPlaylist(base) {
  const { uid } = await getNeteaseProfile(base);
  const listUrl = addNeteaseCookie(new URL(`${base}/user/playlist`));
  listUrl.searchParams.set("uid", String(uid));
  listUrl.searchParams.set("limit", "1000");
  listUrl.searchParams.set("offset", "0");
  const response = await fetch(listUrl);
  if (!response.ok) throw new Error(`/user/playlist HTTP ${response.status}`);
  const data = await response.json();
  if (data.code && data.code !== 200) throw new Error(`/user/playlist API ${data.code}`);
  const playlists = data.playlist || data.data?.playlist || [];
  const radar = playlists.find((item) => {
    const name = String(item.name || "");
    if (/时光雷达|回忆雷达|time\s*radar/i.test(name)) return false;
    return /私人雷达|private\s*radar/i.test(name);
  });
  if (!radar) throw new Error("没有在网易云账号歌单里找到私人雷达");
  const result = await readNeteasePlaylistTracks(base, radar);
  if (!result.tracks.length) throw new Error("私人雷达歌单为空");
  return result;
}

async function readNeteaseDynamicSource(sourceId) {
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  if (sourceId === "personal_fm") {
    return readNeteasePlaylistTracks(base, {
      id: NETEASE_PERSONAL_RADAR_ID,
      name: "私人雷达"
    });
  }
  const source = sourceId === "personal_fm"
    ? { id: "netease-personal-radar", name: "私人雷达" }
    : { id: "netease-daily-recommend", name: "每日推荐" };
  const apiPaths = sourceId === "personal_fm"
    ? ["/personal/fm/mode?mode=FAMILIAR&limit=35", "/personal/fm/mode?mode=DEFAULT&limit=35", "/personal_fm", "/personalized/newsong"]
    : ["/recommend/songs", "/personalized/newsong"];
  let data = null;
  let usedPath = "";
  let lastError = "";
  for (const apiPath of apiPaths) {
    try {
      const url = addNeteaseCookie(new URL(`${base}${apiPath}`));
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${apiPath} HTTP ${response.status}`);
      const item = await response.json();
      if (item.code && item.code !== 200) throw new Error(`${apiPath} API ${item.code}`);
      const candidates = item.data?.dailySongs || item.data || item.recommend || item.result || [];
      if (!Array.isArray(candidates) || !candidates.length) throw new Error(`${apiPath} empty`);
      data = item;
      usedPath = apiPath;
      break;
    } catch (error) {
      lastError = error.message;
    }
  }
  if (!data) throw new Error(lastError || "网易云推荐源暂时不可用");
  const songs = usedPath.includes("recommend/songs")
    ? (data.data?.dailySongs || data.recommend || data.data?.recommend || [])
    : (data.data || data.result || data.recommend || []);
  return {
    source,
    tracks: filterPlayableTracks(songs.map((song) => neteaseSongToTrack(song, source))).filter((track) => track.sourceId)
  };
}

async function importNeteaseDynamicSources(sourceIds) {
  const playlist = await loadPlaylist();
  const currentTracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
  const byIdentity = new Map(currentTracks.map((track) => [trackIdentity(track), track]));
  const imports = [];
  for (const sourceId of sourceIds) imports.push(await readNeteaseDynamicSource(sourceId));

  let added = 0;
  let merged = 0;
  for (const item of imports) {
    for (const track of item.tracks) {
      const key = trackIdentity(track);
      const existing = byIdentity.get(key);
      if (!existing) {
        byIdentity.set(key, track);
        added += 1;
        continue;
      }
      merged += 1;
      existing.sourceIds ||= existing.sourceId ? [existing.sourceId] : [];
      if (track.sourceId && !existing.sourceIds.includes(track.sourceId)) existing.sourceIds.push(track.sourceId);
      existing.playlists ||= [];
      const source = track.playlists[0];
      if (!existing.playlists.some((entry) => entry.id === source.id)) existing.playlists.push(source);
      if (!existing.cover && track.cover) existing.cover = track.cover;
      if (!existing.sourceId && track.sourceId) existing.sourceId = track.sourceId;
    }
  }

  const existingPlaylists = playlist.playlists || (playlist.playlist ? [playlist.playlist] : []);
  const sourcePlaylists = imports.map((item) => ({
    id: item.source.id,
    name: item.source.name,
    creator: "NetEase",
    cover: "",
    trackCount: item.tracks.length
  }));
  const playlistMap = new Map([...existingPlaylists, ...sourcePlaylists].map((item) => [item.id, item]));
  const tracks = [...byIdentity.values()];
  const result = {
    ...playlist,
    source: "netease",
    importedAt: new Date().toISOString(),
    playlist: {
      ...(playlist.playlist || {}),
      id: playlist.playlist?.id || "merged-netease-radio",
      name: playlist.playlist?.name || "Merged NetEase Radio",
      trackCount: tracks.length
    },
    playlists: [...playlistMap.values()],
    tracks
  };
  await writeJson("playlists.json", result);
  return {
    added,
    merged,
    total: tracks.length,
    sources: sourcePlaylists
  };
}

async function likeNeteaseSong(songId, like = true) {
  const id = String(songId || "").trim();
  if (!id) throw new Error("missing song id");
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  const statusUrl = addNeteaseCookie(new URL(`${base}/login/status`));
  let uid = "";
  try {
    const statusResponse = await fetch(statusUrl);
    const status = await statusResponse.json();
    uid = status.data?.profile?.userId || status.profile?.userId || "";
  } catch {
    uid = "";
  }

  const attempts = [];
  if (uid) {
    const songLikeUrl = addNeteaseCookie(new URL(`${base}/song/like`));
    songLikeUrl.searchParams.set("id", id);
    songLikeUrl.searchParams.set("uid", String(uid));
    songLikeUrl.searchParams.set("like", like ? "true" : "false");
    attempts.push(songLikeUrl);
  }
  const likeUrl = addNeteaseCookie(new URL(`${base}/like`));
  likeUrl.searchParams.set("id", id);
  likeUrl.searchParams.set("like", like ? "true" : "false");
  attempts.push(likeUrl);

  let lastError = "";
  for (const url of attempts) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.code && data.code !== 200) throw new Error(`API ${data.code}`);
      return { ...data, uid };
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(lastError || "like failed");
}

async function addNeteaseSongToPlaylist(songId, playlistId) {
  const id = String(songId || "").trim();
  const pid = String(playlistId || "").trim();
  if (!id) throw new Error("missing song id");
  if (!NETEASE_FAVORITE_PLAYLIST_IDS.includes(pid)) throw new Error("invalid target playlist");
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  const attempts = [];
  const tracksUrl = addNeteaseCookie(new URL(`${base}/playlist/tracks`));
  tracksUrl.searchParams.set("op", "add");
  tracksUrl.searchParams.set("pid", pid);
  tracksUrl.searchParams.set("tracks", id);
  attempts.push(tracksUrl);

  const addUrl = addNeteaseCookie(new URL(`${base}/playlist/track/add`));
  addUrl.searchParams.set("pid", pid);
  addUrl.searchParams.set("ids", id);
  attempts.push(addUrl);

  let lastError = "";
  for (const url of attempts) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.code || data.code === 200 || data.status === 200) {
        neteaseLibraryCache.expiresAt = 0;
        return data;
      }
      lastError = `API ${data.code || data.status}: ${data.message || data.msg || "failed"}`;
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(lastError || "playlist add failed");
}

async function updateNeteasePlaylistDescription(playlistId, description) {
  const id = String(playlistId || "").trim();
  if (!/^\d{4,}$/.test(id)) throw new Error("invalid playlist id");
  const desc = String(description || "").trim();
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  const attempts = [
    { path: "/playlist/desc/update", params: { id, desc } },
    { path: "/playlist/update", params: { id, desc } }
  ];
  let lastError = "";
  for (const attempt of attempts) {
    try {
      const url = addNeteaseCookie(new URL(`${base}${attempt.path}`));
      for (const [key, value] of Object.entries(attempt.params)) url.searchParams.set(key, value);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.code || data.code === 200 || data.status === 200) return data;
      lastError = `API ${data.code || data.status}: ${data.message || data.msg || "failed"}`;
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(lastError || "playlist description update failed");
}

async function readNeteaseFavoritePlaylistCards() {
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  const playlists = [];
  for (const playlistId of NETEASE_FAVORITE_PLAYLIST_IDS) {
    const fallbackName = NETEASE_PLAYLIST_NAMES[playlistId] || `Playlist ${playlistId}`;
    try {
      const item = await readNeteasePlaylistCard(base, { id: playlistId, name: fallbackName });
      playlists.push({
        id: playlistId,
        name: NETEASE_PLAYLIST_NAMES[playlistId] || item.source.name || fallbackName,
        cover: item.source.cover || item.tracks.find((track) => track.cover)?.cover || "",
        trackCount: item.source.trackCount || item.tracks.length || 0
      });
    } catch {
      playlists.push({ id: playlistId, name: fallbackName, cover: "", trackCount: 0 });
    }
  }
  return playlists;
}

async function checkNeteaseSongLike(songId) {
  const id = String(songId || "").trim();
  if (!id) return false;
  const liked = await checkNeteaseSongLikes([id]);
  return Boolean(liked[id]);
}

async function checkNeteaseSongLikes(songIds) {
  const idsToCheck = [...new Set((songIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const result = Object.fromEntries(idsToCheck.map((id) => [id, false]));
  if (!idsToCheck.length) return result;
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  try {
    const url = addNeteaseCookie(new URL(`${base}/song/like/check`));
    url.searchParams.set("ids", JSON.stringify(idsToCheck.map(Number).filter(Number.isFinite)));
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (!data.code || data.code === 200) {
        const ids = data.ids || data.data || data.likelist || [];
        if (Array.isArray(ids)) {
          const likedIds = new Set(ids.map(String));
          for (const id of idsToCheck) result[id] = likedIds.has(id);
          return result;
        }
        for (const id of idsToCheck) {
          if (typeof data[id] !== "undefined") result[id] = Boolean(data[id]);
        }
        if (idsToCheck.length === 1 && typeof data.liked !== "undefined") result[idsToCheck[0]] = Boolean(data.liked);
        if (Object.values(result).some(Boolean)) return result;
      }
    }
  } catch {
    // Fall back to the user's full likelist below. Different NCM API forks expose different check routes.
  }

  const statusUrl = addNeteaseCookie(new URL(`${base}/login/status`));
  const statusResponse = await fetch(statusUrl);
  if (!statusResponse.ok) return result;
  const status = await statusResponse.json();
  const uid = status.data?.profile?.userId || status.profile?.userId || "";
  if (!uid) return result;
  const listUrl = addNeteaseCookie(new URL(`${base}/likelist`));
  listUrl.searchParams.set("uid", String(uid));
  const listResponse = await fetch(listUrl);
  if (!listResponse.ok) return result;
  const data = await listResponse.json();
  const ids = data.ids || data.data || data.likelist || [];
  if (!Array.isArray(ids)) return result;
  const likedIds = new Set(ids.map(String));
  for (const id of idsToCheck) result[id] = likedIds.has(id);
  return result;
}

async function claudeChat(messages, system) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return null;

  const model = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      system,
      messages: messages.map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.content
      })),
      max_tokens: 900,
      temperature: 0.85
    })
  });
  if (!response.ok) throw new Error(`Claude failed: ${response.status}`);
  const data = await response.json();
  return (data.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n").trim() || null;
}

async function openAiChat(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.DEEPSEEK_API_KEY
    ? (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com")
    : (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
  const model = process.env.DEEPSEEK_API_KEY
    ? (process.env.DEEPSEEK_MODEL || "deepseek-chat")
    : (process.env.OPENAI_MODEL || "gpt-4.1-mini");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.85,
      max_tokens: 1000
    })
  });
  if (!response.ok) throw new Error(`LLM failed: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function deepSeekIntentJson(messages, system) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      temperature: 0.05,
      max_tokens: 520,
      response_format: { type: "json_object" }
    })
  });
  if (!response.ok) throw new Error(`DS intent failed: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function aiChat(messages, system) {
  return (await claudeChat(messages, system)) || (await openAiChat(system ? [{ role: "system", content: system }, ...messages] : messages));
}

function fallbackHostLine({ track }) {
  return `${track?.title || "当前歌曲"} - ${track?.artist || "未知歌手"}`;
}

function sanitizeHostLine(line, track) {
  const fallback = fallbackHostLine({ track });
  const cleaned = String(line || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？?])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !/(下一首|后面接|接下来|转场|会接|先接|播完|天气)/.test(sentence))
    .join("");
  if (cleaned.length < 4) return fallback;
  return cleaned.slice(0, 220);
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function trackText(track) {
  return normalizeText([
    track.title,
    track.artist,
    track.album,
    track.mood,
    track.source,
    ...(track.playlists || []).map((item) => item.name)
  ].filter(Boolean).join(" "));
}

function cleanQuery(query) {
  return normalizeText(query)
    .replace(/我想听|想听|我要听|来一首|播放|直接|帮我|推荐|找一首|找点|挑|查询|查|搜索|搜|歌曲|音乐|专辑里的歌|专辑里|专辑|album|里面的歌|里的歌|的歌|有几首|多少首|几首|呢|吗|呀/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandedQueryAliases(query) {
  const compact = compactText(query);
  const aliases = [];
  const pairs = [
    [/五百英里|五百里|500英里|五佰英里/, ["five hundred miles", "500 miles"]],
    [/圣诞快乐劳伦斯先生|圣诞快乐.*劳伦斯|劳伦斯先生|merrychristmasmrlawrence/, [
      "merry christmas mr lawrence",
      "merry christmas mr. lawrence",
      "merry christmas mr.lawrence"
    ]]
  ];
  for (const [pattern, values] of pairs) {
    if (pattern.test(compact)) aliases.push(...values);
  }
  return [...new Set(aliases)];
}

function compactText(value) {
  return normalizeText(value)
    .replace(/[龍竜]/g, "龙")
    .replace(/[鈥欌€榒]/g, "'")
    .replace(/[\s\-_:()[\]【】《》'.,，。！？?\/\\]+/g, "");
}

function hasJapaneseKana(value) {
  return /[\u3040-\u30ff]/.test(String(value || ""));
}

function looksJapaneseTrack(track) {
  const rawText = `${track.title || ""} ${track.artist || ""} ${track.album || ""}`;
  return hasJapaneseKana(rawText)
    || /j-pop|japanese|anime|鍒濋煶|鏉辨柟|鍧傛湰|绫虫触|radwimps|aimer|yoasobi|瀹囧鐢皘妞庡悕|銈儶銈搞儕銉珅銈点偊銉炽儔銉堛儵銉冦偗/i.test(rawText);
}

function looksChineseTrack(track) {
  const rawText = `${track.title || ""} ${track.artist || ""}`;
  if (looksJapaneseTrack(track)) return false;
  return /[\u4e00-\u9fff]/.test(rawText);
}

const artistAliases = [
  ["黄老板", ["ed sheeran"]],
  ["霉霉", ["taylor swift"]],
  ["打雷姐", ["lana del rey"]],
  ["火星哥", ["bruno mars"]],
  ["断眉", ["charlie puth"]],
  ["骚当", ["adam levine", "maroon 5"]],
  ["姆爷", ["eminem"]],
  ["盆栽哥", ["the weeknd"]],
  ["戳爷", ["troye sivan"]],
  ["鳖姐", ["lady gaga"]],
  ["日日", ["rihanna"]],
  ["结石姐", ["jessie j"]],
  ["啪姐", ["dua lipa"]],
  ["比伯", ["justin bieber"]],
  ["周董", ["周杰伦", "jay chou"]] 
];

function aliasTargetsForQuery(query) {
  const normalized = normalizeText(query);
  const compactQuery = compactText(query);
  return artistAliases
    .filter(([alias]) => {
      const aliasCompact = compactText(alias);
      if (/^[a-z0-9]{1,2}$/.test(aliasCompact)) {
        return new RegExp(`(^|[^a-z0-9])${aliasCompact}([^a-z0-9]|$)`, "i").test(normalized);
      }
      return compactQuery.includes(aliasCompact);
    })
    .flatMap(([, targets]) => targets);
}

function userAliasTargetsForQuery(query, memory) {
  const aliases = memory?.artistAliases || {};
  const compactQuery = compactText(query);
  return Object.entries(aliases)
    .filter(([alias]) => compactQuery.includes(compactText(alias)))
    .flatMap(([, target]) => Array.isArray(target) ? target : [target])
    .filter(Boolean);
}

function queryStyleFlags(query) {
  const normalized = normalizeText(query);
  return {
    chinese: /华语|国语|中文|内地|港台|mandopop|c-?pop/i.test(normalized),
    english: /英文|英语|欧美|外文|english|western/i.test(normalized),
    love: /情歌|爱情|恋爱|失恋|甜歌|emo|伤感|心动|想你|爱|喜欢|love/i.test(normalized),
    warmWalk: /暧昧|暖昧|温柔|散步|走路|步行|walk|心动|微醺/i.test(normalized),
    japanese: /日语|日文|日系|日本|jpop|j-pop|anime/i.test(normalized),
    rnb: /r&b|rnb|rb|soul|布鲁斯|节奏布鲁斯/i.test(normalized),
    ost: /ost|原声|影视|电影|电视剧|动漫|bgm|配乐/i.test(normalized),
    noIntro: /(?:不要|不想要|别|没有|没|少点|少一点|短|不带).{0,4}(?:前奏|intro)|(?:前奏).{0,4}(?:短|少|不要|没有|没|不带)/i.test(normalized),
    intro: /前奏|intro/i.test(normalized) && !/(?:不要|不想要|别|没有|没|少点|少一点|短|不带).{0,4}(?:前奏|intro)|(?:前奏).{0,4}(?:短|少|不要|没有|没|不带)/i.test(normalized)
  };
}

const musicStyleRules = [
  { key: "electronic", query: /电子|电音|合成器|synth|edm|future|house|techno/i, track: /electronic|synth|edm|future|house|techno|neon|电音|电子/i, score: 32 },
  { key: "rock", query: /摇滚|吉他|rock|punk|alternative|indie/i, track: /rock|punk|alternative|guitar|indie|band|摇滚|吉他/i, score: 32 },
  { key: "rap", query: /说唱|嘻哈|饶舌|rap|hip.?hop|trap/i, track: /rap|hip hop|hip-hop|trap|说唱|嘻哈/i, score: 32 },
  { key: "jazz", query: /爵士|蓝调|jazz|blues|swing|bossa/i, track: /jazz|blues|swing|bossa|sax|爵士|蓝调/i, score: 32 },
  { key: "folk", query: /民谣|folk|乡村|country|木吉他/i, track: /folk|country|acoustic|guitar|民谣|乡村|吉他/i, score: 28 },
  { key: "classical", query: /古典|交响|管弦|classical|orchestra|symphony/i, track: /classical|orchestra|symphony|concerto|sonata|piano|violin|古典|交响|钢琴|小提琴/i, score: 30 },
  { key: "piano", query: /钢琴|piano|琴/i, track: /piano|钢琴|琴/i, score: 30 },
  { key: "instrumental", query: /纯音|纯音乐|无人声|instrumental/i, track: /instrumental|piano|ambient|bgm|ost|soundtrack|纯音乐|钢琴|配乐/i, score: 34 },
  { key: "lofi", query: /lofi|lo-fi|低保真|白噪|学习|专注/i, track: /lofi|lo-fi|chill|study|ambient|soft|night|dream/i, score: 28 },
  { key: "dance", query: /跳舞|律动|蹦迪|dance|disco|funk/i, track: /dance|disco|funk|groove|party|club/i, score: 30 },
  { key: "citypop", query: /city pop|citypop|城市流行|昭和/i, track: /city pop|citypop|昭和|japanese|j-pop/i, score: 32 },
  { key: "female", query: /女声|女歌手|女生|female/i, track: /taylor|lana|aimer|yoasobi|adele|rihanna|selena|王菲|邓紫棋|孙燕姿|田馥甄|张靓颖|女声/i, score: 22 },
  { key: "male", query: /男声|男歌手|男生|male/i, track: /jay|eason|bruno|stevie|westlife|林俊杰|陈奕迅|周杰伦|陶喆|男声/i, score: 22 },
  { key: "vocalFast", query: /没有前奏|没前奏|不要前奏|不带前奏|短前奏|前奏短|直接开唱|一上来就唱/i, track: /love|heart|you|我|你|爱|恋|miss|kiss|baby|tonight/i, score: 22 }
];
function contextualPrompt(prompt, memory) {
  const normalized = normalizeText(prompt);
  const referencesPreviousAsk = /这种|这个|那种|继续|接着|按刚才|刚才|上面|那个方向|这个方向/.test(normalized);
  const explicitFreshAsk = /我想听|我要听|想听|听|来一首|播放|找|推荐|搜索|搜|查询|查/.test(normalized) && !referencesPreviousAsk;
  if (explicitFreshAsk) return prompt;
  if (!/英文|英语|欧美|外文|中文|华语|国语|这种|这个|那种|继续|要/.test(normalized)) return prompt;
  const recent = (memory?.recentAsks || [])
    .filter((item) => item && item !== prompt)
    .slice(0, 2)
    .join(" ");
  return recent ? `${prompt} ${recent}` : prompt;
}

function findArtistMatches(playlist, query, memory) {
  const cleaned = cleanQuery(query);
  const queryCompact = compactText(cleaned);
  const aliasTargets = [...aliasTargetsForQuery(query), ...userAliasTargetsForQuery(query, memory)].map(compactText);
  const directTargets = queryCompact.length >= 3 ? [queryCompact] : [];
  const targets = [...new Set([...directTargets, ...aliasTargets].filter((item) => item.length >= 2))];
  if (!targets.length) return [];
  return playlist.tracks.map((track, index) => {
    const artistCompact = compactText(track.artist);
    const artistParts = String(track.artist || "")
      .split(/\s*(?:\/|,|&|、|和|feat\.?|ft\.?|with)\s*/i)
      .map(compactText)
      .filter(Boolean);
    const score = targets.reduce((best, target) => {
      if (artistCompact === target) return Math.max(best, 190);
      if (artistParts.includes(target)) return Math.max(best, 185);
      if (artistCompact.includes(target)) return Math.max(best, 160);
      return best;
    }, 0);
    return score ? { index, track, score } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}

function looksLikeSpecificArtistRequest(prompt) {
  const normalized = normalizeText(prompt);
  const cleaned = cleanQuery(prompt);
  const styles = queryStyleFlags(prompt);
  if (Object.values(styles).some(Boolean)) return false;
  if (aliasTargetsForQuery(prompt).length) return false;
  if (!/(鍚瑋鎾瓅鎾斁|鎵緗鎼滅储|鎼渱鏌鎺ㄨ崘)/.test(normalized)) return false;
  if (!/(鐨勬瓕|姝屾洸|闊充箰|姝屾墜|artist)/i.test(normalized)) return false;
  if (!cleaned) return false;
  return compactText(cleaned).length <= 16;
}

function looksLikeStyleRequest(prompt) {
  const styles = queryStyleFlags(prompt);
  if (Object.values(styles).some(Boolean)) return true;
  return /风格|氛围|浪漫|甜|苦情|迷幻|慵懒|安静|轻快|热烈|氛围感|适合夜晚|适合散步|适合开车|适合睡前/i.test(normalizeText(prompt));
}

function wantsPlaybackAction(prompt) {
  const normalizedPrompt = normalizeText(prompt);
  if (/你是谁|为什么|怎么|聊聊|解释|什么意思|怎么样/i.test(normalizedPrompt)) return false;
  return /听|播|播放|放|推荐|接下来|下一首|后面|之后|接|换成|切到|play|queue|next|after\s+this|after\s+this\s+song|put\s+on|listen\s+to|recommend|some\s+/i.test(normalizeText(prompt));
}

function wantsImmediateSwitch(prompt) {
  return /直接切换|切换|切到|换成|马上|立刻|现在播|现在播放|直接播放/i.test(normalizeText(prompt));
}

function looksLikeRelaxedStyleRequest(prompt) {
  const normalized = normalizeText(prompt);
  return /(节奏舒缓|舒缓|慢节奏|慢歌|放松|轻柔|安静|睡前|夜晚)/i.test(normalized)
    && /(听|播|播放|放|推荐|来点|来首|安排|切换|切到|换成)/i.test(normalized);
}

function wantsMusicContinuation(prompt) {
  const normalized = normalizeText(prompt).trim();
  return /^(继续|接着|直接推荐|直接推荐就行|直接切换|直接播放|切换|安排|继续播放|继续推荐|不用管当前正在播放的|不用管当前|别问了|别追问|直接来)$/i.test(normalized)
    || /^(继续|接着|直接).{0,8}(推荐|播放|切换|来|安排)/i.test(normalized);
}

function recentRelaxedStyleAsk(memory) {
  return (memory?.recentAsks || [])
    .slice(1, 8)
    .some((item) => /(节奏舒缓|舒缓|慢节奏|慢歌|放松|轻柔|安静|睡前|夜晚)/i.test(normalizeText(item)));
}

function deterministicStyleIntent(prompt, memory) {
  if (looksLikeRelaxedStyleRequest(prompt) || (wantsMusicContinuation(prompt) && recentRelaxedStyleAsk(memory))) {
    return {
      intent: "recommend_style",
      title: "",
      artist: "",
      style: "节奏舒缓 慢节奏 慢歌 soft slow chill night",
      autoplay: true,
      reply: "",
      confidence: 0.96
    };
  }
  return null;
}

function extractStyleLabel(prompt) {
  const styles = queryStyleFlags(prompt);
  const labels = [];
  if (styles.chinese) labels.push("华语");
  if (styles.english) labels.push("英文");
  if (styles.japanese) labels.push("日语");
  if (styles.rnb) labels.push("r&b");
  if (styles.ost) labels.push("OST");
  if (styles.love) labels.push(/苦情|失恋|伤感|emo/i.test(prompt) ? "失恋 伤感 emo 慢歌 ballad" : "爱情 甜歌 浪漫 love ballad");
  if (styles.warmWalk) labels.push("温柔");
  if (styles.noIntro) labels.push("短前奏");
  if (styles.intro) labels.push("前奏");
  for (const [label, pattern] of [
    ["电子", /电子|电音|edm|synth|house|techno/i],
    ["摇滚", /摇滚|rock|punk|alternative/i],
    ["说唱", /说唱|嘻哈|rap|hip.?hop|trap/i],
    ["爵士", /爵士|jazz|blues|bossa/i],
    ["民谣", /民谣|folk|country/i],
    ["纯音乐", /纯音|纯音乐|instrumental/i],
    ["lofi", /lofi|lo-fi|低保真/i],
    ["city pop", /city\s*pop|citypop|城市流行/i]
  ]) {
    if (pattern.test(prompt)) labels.push(label);
  }
  return [...new Set(labels)].join(" ");
}

function extractRequestedArtistName(prompt) {
  const raw = String(prompt || "").trim();
  const styles = queryStyleFlags(raw);
  if (Object.values(styles).some(Boolean)) return "";
  const patterns = [
    /(?:接下来|下一首|后面|之后|等会儿|现在|为我|给我|帮我|请)?\s*(?:播放|播|放|听|想听|我要听|我想听|来点|来首|换成|切到)\s*([^，。！？?]{1,40}?)(?:的)?(?:歌|歌曲|音乐|作品)\s*$/i,
    /(?:接下来|下一首|后面|之后|等会儿|现在|为我|给我|帮我|请)?\s*(?:播放|播|放|听|想听|我要听|我想听|来点|来首|换成|切到)\s*([^，。！？?]{1,30})\s*$/i,
    /^([^，。！？?]{1,30}?)(?:的)?(?:歌|歌曲|音乐|作品)$/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match?.[1]) continue;
    const candidate = cleanQuery(match[1])
      .replace(/^(一个|一些|几首|全部|所有|比较|类似|这种|这个|那个|该|当前)\s*/g, "")
      .replace(/\s*(一个|一些|几首|全部|所有|类似|这种|这个|那个)$/g, "")
      .trim();
    const compact = compactText(candidate);
    if (!compact || compact.length > 32) continue;
    if (compact.length < 2) continue;
    if (/^(播|放|听|播放|继续|接下来|华语|中文|英文|日语|纯音|纯音乐|r&b|rnb|ost|emo|慢歌|情歌|摇滚|电子|爵士|民谣)$/.test(candidate)) continue;
    return candidate;
  }
  return "";
}

async function handleRequestedArtistPlayback(prompt, playlist, memory) {
  const artist = extractRequestedArtistName(prompt);
  if (!artist) return null;
  const currentIndex = state.index % playlist.tracks.length;
  const matches = findArtistMatches(playlist, `我想听${artist}的歌`, memory);
  await rememberRecommendations(memory, matches);
  const shouldQueue = wantsChatAutoplay(prompt);
  const queuedIndexes = shouldQueue
    ? matches.map((item) => item.index).filter((index) => index !== currentIndex)
    : [];
  if (queuedIndexes.length) state.queue = queuedIndexes;
  if (matches.length) {
    return {
      reply: queuedIndexes.length
        ? `找到 ${matches.length} 首 ${artist}，已排到当前歌曲后面。`
        : `你的歌单里找到 ${matches.length} 首 ${artist}，可以从下面点播。`,
      recommendations: matches.slice(0, 12).map(recommendationFromMatch),
      queued: queuedIndexes.length > 0,
      queuePreview: queuePreviewFromIndexes(playlist, queuedIndexes),
      memory
    };
  }
  const netease = await searchNeteaseSongs(artist, 12);
  if (netease.length) {
    return {
      reply: `你的歌单里没找到 ${artist}，但网易云搜到 ${netease.length} 个候选；可以点卡片播放，或去 SongID 播放全部。`,
      recommendations: neteaseRecommendations(netease),
      queued: false,
      queuePreview: [],
      memory
    };
  }
  return null;
}

function displayArtistRequest(prompt, recommendations, memory) {
  const aliasTargets = [...aliasTargetsForQuery(prompt), ...userAliasTargetsForQuery(prompt, memory)];
  if (aliasTargets.length) return aliasTargets[0];
  const cleaned = cleanQuery(prompt);
  if (cleaned) return cleaned;
  return recommendations[0]?.track?.artist || "杩欎釜姝屾墜";
}

function looksLikeBareArtistName(prompt) {
  const normalized = normalizeText(prompt);
  const compact = compactText(normalized);
  if (!compact || compact.length > 24) return false;
  if (/[，。！？!,.?]/.test(prompt)) return false;
  if (/听|播|播放|推荐|找|搜|查|检索|歌|音乐|一个|一些|吗|为什么|怎么|什么|谁|哪/.test(normalized)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(normalized);
}

async function rememberArtistAlias(memory, alias, artistName) {
  const cleanAlias = cleanQuery(alias || "");
  const cleanArtist = cleanQuery(artistName || artistName);
  if (!cleanAlias || !cleanArtist) return memory;
  memory.artistAliases ||= {};
  memory.artistAliases[cleanAlias] = cleanArtist;
  memory.pendingArtistAlias = null;
  memory.pendingArtistIntent = null;
  await writeJson("memory.json", memory);
  return memory;
}

function cleanAlbumQuery(query) {
  const normalized = normalizeText(query);
  const match = normalized.match(/(?:我想听|想听|我要听|来一首|播放|直接|帮我|推荐|找一首|找点|挑|查询|查|搜索|搜)?\s*(.+?)(?:专辑|album)/i);
  const candidate = match?.[1] || cleanQuery(query);
  return cleanQuery(candidate)
    .replace(/里面|里|的/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTracks(playlist, query, limit = 5) {
  const normalized = normalizeText(query);
  const cleaned = cleanQuery(query);
  const albumMode = /涓撹緫|album/i.test(query);
  const effectiveQuery = albumMode ? (cleanAlbumQuery(query) || cleaned) : cleaned;
  const aliasTargets = aliasTargetsForQuery(query);
  const queryAliases = expandedQueryAliases(effectiveQuery);
  const styleFlags = queryStyleFlags(query);
  const semanticStyleMode = Object.values(styleFlags).some(Boolean) || looksLikeStyleRequest(query);
  const expandedQuery = [effectiveQuery, ...queryAliases, ...aliasTargets].filter(Boolean).join(" ");
  const styleStopWords = semanticStyleMode ? ["情歌", "苦情歌", "歌曲", "音乐", "歌", "风格"] : [];
  const queryStopWords = new Set(["and", "the", "of", "a", "an", "to", "in", "on", "for", "的", "里", ...styleStopWords]);
  const tokens = normalized.split(/[ ,，。！？?、]+/).filter((token) => token && !queryStopWords.has(token));
  const cleanTokens = expandedQuery.split(/[ ,，。！？?、]+/).filter((token) => token && !queryStopWords.has(token));
  const queryCompacts = [effectiveQuery || normalized, ...queryAliases].map(compactText).filter(Boolean);
  const moodHints = [
    ["纯音", ["instrumental", "ost", "original motion picture", "soundtrack", "piano", "bgm", "ambient"]],
    ["r&b", ["r&b", "rnb", "r b", "soul", "neo soul", "rhythm", "blues"]],
    ["rnb", ["r&b", "rnb", "r b", "soul", "neo soul", "rhythm", "blues"]],
    ["rb", ["r&b", "rnb", "r b", "soul", "neo soul", "rhythm", "blues"]],
    ["说唱", ["rap", "hip hop", "hip-hop", "trap"]],
    ["摇滚", ["rock", "alternative", "punk", "guitar"]],
    ["爵士", ["jazz", "swing", "bossa", "sax"]],
    ["写代码", ["synth", "ambient", "lofi", "instrumental", "ost", "bgm"]],
    ["放松", ["soft", "slow", "dream", "ambient", "piano", "night"]],
    ["前奏", ["intro", "ost", "soundtrack", "instrumental", "bgm"]],
    ["日语", ["j-pop", "japanese", "anime", "ost"]]
  ];

  return playlist.tracks.map((track, index) => {
    const text = trackText(track);
    const titleCompact = compactText(track.title);
    const albumCompact = compactText(track.album);
    const artistCompact = compactText(track.artist);
    const combinedCompact = compactText(`${track.title} ${track.artist} ${track.album}`);
    const rawText = `${track.title} ${track.artist} ${track.album || ""}`;
    let score = 0;
    if (styleFlags.chinese && looksChineseTrack(track)) score += 46;
    if (styleFlags.chinese && looksJapaneseTrack(track)) score -= 90;
    if (styleFlags.english && /[a-z]/i.test(`${track.title}${track.artist}`) && !/[\u4e00-\u9fff]/.test(track.title)) score += 38;
    if (styleFlags.love && /爱|恋|情|心|你|我|想|梦|泪|痛|伤|别|吻|抱|喜欢|love|heart|kiss|miss|tears|without you/i.test(rawText)) score += 34;
    if (styleFlags.warmWalk && /warm|soft|sweet|summer|walk|somewhere|wonder|love|heart|light|moon|night|dream|温柔|暖|夜|心|爱|恋|梦|月|夏|浪/i.test(rawText)) score += 28;
    if (styleFlags.japanese && looksJapaneseTrack(track)) score += 46;
    if (styleFlags.rnb && /r&b|rnb|soul|blues|rhythm|stevie hoang|boyz ii men|usher|ne-yo|mariah|bruno mars/i.test(rawText)) score += 34;
    if (styleFlags.ost && /ost|原声|soundtrack|from "|电影|电视剧|anime|bgm|配乐|theme/i.test(rawText)) score += 34;
    if (styleFlags.intro && /intro|前奏|instrumental|overture|prelude|opening|op\.|theme|bgm|配乐/i.test(rawText)) score += 34;
    if (styleFlags.noIntro && /intro|前奏|instrumental|overture|prelude|opening|op\.|theme|bgm|配乐|纯音乐|piano|钢琴|soundtrack|ost/i.test(rawText)) score -= 80;
    if (semanticStyleMode && /^(情歌|苦情歌|情歌王|单身情歌)$/i.test(normalizeText(track.title))) score -= 75;
    if (semanticStyleMode && /情歌/.test(normalizeText(track.album || "")) && !/失恋|伤感|emo|心碎|sad|heartbreak|ballad|love/i.test(rawText)) score -= 28;
    for (const rule of musicStyleRules) {
      if (rule.query.test(normalized) && rule.track.test(rawText)) score += rule.score;
    }
    for (const target of aliasTargets) {
      const targetCompact = compactText(target);
      if (artistCompact.includes(targetCompact)) score += 80;
      if (combinedCompact.includes(targetCompact)) score += 30;
    }
    for (const queryCompact of queryCompacts) {
      if (albumMode && albumCompact === queryCompact) score += 90;
      if (albumMode && albumCompact.includes(queryCompact)) score += 70;
      if (albumMode && queryCompact.includes(albumCompact) && albumCompact.length > 3) score += 36;
      if (!albumMode && titleCompact === queryCompact) score += 120;
      if (!albumMode && titleCompact.includes(queryCompact)) score += 54;
      if (!albumMode && combinedCompact.includes(queryCompact)) score += 16;
      if (albumMode && (titleCompact.includes(queryCompact) || artistCompact.includes(queryCompact))) score += 12;
    }
    if (effectiveQuery && text.includes(effectiveQuery)) score += albumMode ? 10 : 18;
    for (const token of tokens) {
      if (albumMode && /专辑|album|挑|找|搜|搜索|推荐|播放|歌曲|音乐|的歌|有几首|多少首|几首/.test(token)) continue;
      if (text.includes(token)) score += token.length > 1 ? 4 : 1;
    }
    for (const token of cleanTokens) {
      if (albumMode && normalizeText(track.album).includes(token)) score += token.length > 1 ? 14 : 1;
      else if (text.includes(token)) score += token.length > 1 ? 8 : 1;
    }
    for (const [hint, words] of moodHints) {
      if (normalized.includes(hint)) {
        if (words.some((word) => text.includes(word))) score += 4;
        if (hint === "绾煶" && !/[a-z\u4e00-\u9fa5]{8,}/i.test(track.artist || "")) score += 1;
      }
    }
    if (normalized.includes("鐩存帴") || normalized.includes("鎾斁")) score += 1;
    if (styleFlags.noIntro && !looksNoIntroBlocked(track)) score += 18;
    return { index, track, score, blockedByNoIntro: styleFlags.noIntro && looksNoIntroBlocked(track) };
  })
    .filter((item) => item.score > 0 && !item.blockedByNoIntro)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function profileFromPlaylist(playlist) {
  const tracks = playlist.tracks || [];
  const countBy = (getter) => {
    const counts = new Map();
    for (const track of tracks) {
      const value = getter(track);
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  };
  const topArtists = countBy((track) => track.artist);
  const topAlbums = countBy((track) => track.album);
  const text = tracks.map(trackText).join(" ");
  const styleRules = [
    ["OST / 电影原声", /ost|original motion picture|soundtrack|原声|配乐/g],
    ["R&B / Soul", /r&b|rnb|soul|blues/g],
    ["日语 / 动漫感", /j-pop|japanese|anime|初音|东方|sound horizon/g],
    ["华语流行", /华语|国语|mandopop|周杰伦|林俊杰|五月天/g],
    ["电子 / 合成器", /synth|electronic|edm|future|neon/g],
    ["安静纯音", /instrumental|piano|ambient|bgm|lofi/g],
    ["摇滚 / 吉他", /rock|guitar|punk|alternative/g],
    ["夜晚慢歌", /night|moon|slow|dream|夜|月/g]
  ];
  const styles = styleRules.map(([name, pattern]) => ({
    name,
    count: (text.match(pattern) || []).length
  })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 8);
  const playlists = playlist.playlists || (playlist.playlist ? [playlist.playlist] : []);
  const summary = [
    `当前歌单共 ${tracks.length} 首，来自 ${playlists.length || 1} 个来源。`,
    topArtists.length ? `高频歌手包括 ${topArtists.slice(0, 4).map((item) => item.name).join("、")}。` : "",
    styles.length ? `整体气质偏 ${styles.slice(0, 4).map((item) => item.name).join("、")}。` : "",
    topAlbums.length ? `反复出现的专辑/作品集有《${topAlbums.slice(0, 3).map((item) => item.name).join("》《")}》。` : ""
  ].filter(Boolean).join("");
}

function isCountQuestion(prompt) {
  const normalized = normalizeText(prompt);
  return /导入.*多少|歌单.*数量|曲库.*数量|多少首|几首/.test(normalized)
    && cleanQuery(prompt).length < 2;
}

function isLibraryCountQuestion(prompt) {
  const normalized = normalizeText(prompt);
  return /导入.*多少|歌单.*数量|曲库.*数量/.test(normalized)
    || (/多少首|几首/.test(normalized) && cleanQuery(prompt).length < 2);
}

function isSongCountQuestion(prompt) {
  const normalized = normalizeText(prompt);
  if (/推荐|给我|来|放|播|播放|想听|我要听|我想听/.test(normalized)) return false;
  return /多少首|几首/.test(normalized) && cleanQuery(prompt).length >= 2;
}

function extractArtistNameFragment(prompt) {
  const normalized = normalizeText(prompt);
  const patterns = [
    /(?:歌手名|艺名|名字|姓名).{0,4}(?:含|带|有|包含)(.+?)(?:的)?歌手/,
    /(?:歌手名|艺名|名字|姓名).{0,4}(?:含|带|有|包含)(.+?)(?:有哪些|有谁|是谁|$)/,
    /(?:含|带|包含)(.+?)(?:的)?歌手(?:有哪些|有谁|是谁|$)/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const fragment = match[1].replace(/哪些|有谁|是谁|吗|呢|呀|的/g, "").trim();
    if (compactText(fragment)) return fragment;
  }
  return "";
}

function findArtistsByNameFragment(playlist, fragment, limit = 20) {
  const target = compactText(fragment);
  if (!target) return [];
  const artists = new Map();
  for (const track of playlist.tracks || []) {
    const names = String(track.artist || "")
      .split(/\s*(?:\/|,|&|銆亅鍜寍feat\.?|ft\.?|with)\s*/i)
      .map((name) => name.trim())
      .filter(Boolean);
    for (const name of names) {
      if (!compactText(name).includes(target)) continue;
      const item = artists.get(name) || { name, count: 0, examples: [] };
      item.count += 1;
      if (item.examples.length < 2) item.examples.push(track.title);
      artists.set(name, item);
    }
  }
  return [...artists.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"))
    .slice(0, limit);
}

function findTitleMatches(playlist, query, limit = 20) {
  const cleaned = cleanQuery(query);
  const queryVariants = [cleaned, ...expandedQueryAliases(cleaned)]
    .map(compactText)
    .filter(Boolean);
  if (!queryVariants.length) return [];
  const queryTokens = cleaned.split(/[ ,，。！？?、]+/).filter((token) => token.length > 1);
  return playlist.tracks.map((track, index) => {
    const titleCompact = compactText(track.title);
    const artistCompact = compactText(track.artist);
    const albumCompact = compactText(track.album);
    let score = 0;
    for (const queryCompact of queryVariants) {
      if (titleCompact === queryCompact) score = Math.max(score, 140);
      if (titleCompact.includes(queryCompact)) score = Math.max(score, 105);
      if (queryCompact.includes(titleCompact) && titleCompact.length > 2) score = Math.max(score, 80);
    }
    if (score > 0) {
      if (/鍦ｈ癁蹇箰鍔充鸡鏂厛鐢焲鍔充鸡鏂厛鐢焲merrychristmasmrlawrence/.test(compactText(query))
        && /鍧傛湰|sakamoto|ryuichi/i.test(`${track.artist} ${track.album || ""}`)) {
        score += 35;
      }
      for (const token of queryTokens) {
        const tokenCompact = compactText(token);
        if (titleCompact.includes(tokenCompact)) score += 10;
        if (artistCompact.includes(tokenCompact)) score += 2;
        if (albumCompact.includes(tokenCompact)) score += 1;
      }
    }
    return { index, track, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function titleSimilarity(a, b) {
  const left = compactText(a);
  const right = compactText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  const rows = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= right.length; j++) rows[0][j] = j;
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
  }
  const distance = rows[left.length][right.length];
  return 1 - distance / Math.max(left.length, right.length);
}

function likelyTitleQuery(prompt) {
  let query = cleanQuery(prompt)
    .replace(/我记得|记得|好像|应该|可能|有两首|两首|几首|全部|所有|版本|同名|这首|这歌/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const quoted = String(prompt).match(/[“”"《》](.+?)[“”"《》]/);
  if (quoted?.[1]) query = quoted[1];
  return query;
}

function wantsFuzzyTitleSearch(prompt) {
  const normalized = normalizeText(prompt);
  return /我记得|记得|好像|可能|有两首|两首|几首|全部|所有|版本|同名|是不是有|有没有/.test(normalized)
    && /歌|首|曲|title|叫|名|look back|don't look back|dont look back/i.test(normalized);
}

function findFuzzyTitleMatches(playlist, prompt, limit = 20) {
  const query = likelyTitleQuery(prompt);
  if (!compactText(query)) return [];
  const baseMatches = findTitleMatches(playlist, query, limit * 2);
  const seen = new Set(baseMatches.map((item) => item.index));
  const queryTokens = normalizeText(query)
    .split(/[ ,，。！？?、"“”]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2 && !["the", "and", "feat", "with"].includes(item));
  const fuzzy = playlist.tracks.map((track, index) => {
    if (seen.has(index)) return null;
    const similarity = titleSimilarity(track.title, query);
    const rawText = `${track.title} ${track.artist} ${track.album || ""}`;
    let score = Math.round(similarity * 100);
    let tokenHits = 0;
    for (const token of queryTokens) {
      if (normalizeText(rawText).includes(token)) score += token.length * 4;
      if (normalizeText(track.title).includes(token)) tokenHits += 1;
    }
    if (queryTokens.length >= 2 && tokenHits < 2 && similarity < 0.78) return null;
    return { index, track, score };
  }).filter(Boolean);
  return [...baseMatches, ...fuzzy]
    .filter((item) => item.score >= 64)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function extractOrdinalPlayback(prompt) {
  const normalized = normalizeText(prompt);
  const match = normalized.match(/(?:播放|放|播|听)?\s*第\s*(\d{1,6})\s*(?:首|个)?/);
  if (!match) return null;
  const position = Number(match[1]);
  return Number.isInteger(position) && position > 0 ? position : null;
}

function wantsRandomPlayback(prompt) {
  return /随机播放|随机来|随便放|随便播|随便听|shuffle/i.test(normalizeText(prompt));
}

function wantsLibraryList(prompt) {
  const normalized = normalizeText(prompt).replace(/\s+/g, "");
  return /^(歌曲列表|歌单列表|曲库列表|播放列表|列表)$/.test(normalized)
    || /给我看.*(歌曲列表|曲库列表|歌单列表)/.test(normalized);
}

function wantsNoAccompaniment(prompt) {
  return /娌℃湁浼村|鏃犱即濂弢涓嶈浼村|涓嶅甫浼村|鏃犱即濂忕殑|娌′即濂弢娓呭敱|绾汉澹皘浜哄０鏃犱即濂弢a\s*cappella|acappella|vocal only/i.test(normalizeText(prompt));
}

function toRecommendation(playlist, index, score = 0) {
  const track = playlist.tracks[index];
  return {
    index,
    title: track.title,
    artist: track.artist,
    album: track.album || "",
    sourceId: track.sourceId || track.id || "",
    score
  };
}

function libraryTrackSummary(track, index) {
  return {
    index,
    title: track.title,
    artist: track.artist,
    artistIds: track.artistIds || [],
    artistId: track.artistId || track.artistIds?.[0] || "",
    album: track.album || "",
    albumId: track.albumId || "",
    cover: track.cover || "",
    duration: track.duration || 0,
    sourceId: track.sourceId || track.id || "",
    source: track.source || "netease",
    external: true,
    libraryPlaylistId: track.libraryPlaylistId || ""
  };
}

function wantsMusicSearch(prompt) {
  const normalized = normalizeText(prompt);
  if (isPlainQuestion(prompt)) return false;
  return /我要听|我想听|想听|播放|放一首|给我放|给我播|推荐|找|搜|搜索|检索|查询|查一个|查找|有哪些|有什么|来点|来首|换成|切到|接下来听|下一首听|歌曲列表|歌单列表|曲库列表|随机播放|没有前奏|没前奏|不要前奏|直接开唱/i.test(normalized);
}

function isPlainQuestion(prompt) {
  const normalized = normalizeText(prompt);
  if (wantsRandomPlayback(prompt) || wantsLibraryList(prompt) || extractOrdinalPlayback(prompt)) return false;
  if (wantsNoAccompaniment(prompt)) return false;
  if (/(我要听|我想听|想听|播放|放一首|给我放|给我播|推荐|找|搜|搜索|检索|查询|查一个|查找|有哪些|有什么|来点|来首|换成|切到|接下来听|下一首听)/i.test(normalized)) return false;
  return /吗|嘛|呢|？|\?|是不是|是否|为什么|怎么|能不能|可以吗|什么意思|谁是|是什么|像不像|你觉得|你会不会|你能不能/.test(normalized);
}

function wantsChatAutoplay(prompt) {
  const normalized = normalizeText(prompt);
  if (isCountQuestion(prompt) || isSongCountQuestion(prompt)) return false;
  if (/从曲库|检索|搜索|搜|查询|查一个|查找|推荐|候选|找几首|列几首|有哪些|有什么/i.test(normalized)) return false;
  return /(^|[，。！？?\s])(我要听|我想听|想听|来点|来首|放一首|播放|给我放|给我播|接下来听|下一首听|换成|切到)/i.test(normalized);
}

function confidentMatches(matches) {
  const topScore = matches[0]?.score || 0;
  if (topScore >= 24) return matches;
  return [];
}

function needsMusicClarification(prompt, matches) {
  const cleaned = cleanQuery(prompt);
  const compact = compactText(cleaned);
  const aliases = aliasTargetsForQuery(prompt);
  const styles = queryStyleFlags(prompt);
  const hasStyle = Object.values(styles).some(Boolean);
  if (!wantsMusicSearch(prompt)) return false;
  if (aliases.length || hasStyle) return false;
  if (!matches.length) return true;
  if (compact.length <= 2) return true;
  return (matches[0]?.score || 0) < 24;
}

function looksNoIntroBlocked(track) {
  const rawText = `${track.title} ${track.artist} ${track.album || ""} ${track.mood || ""}`;
  return /intro|鍓嶅|instrumental|overture|prelude|opening|op\.|theme|bgm|閰嶄箰|绾煶涔恷piano|閽㈢惔|soundtrack|ost|original motion picture|original soundtrack|score|浼村|浼村鐗坾浼村甯off\s*vocal|off[\s\u00a0]*vocal|karaoke|绾韩|鏃犱汉澹皘vocal\s*off/i.test(rawText);
}

function firstLyricTimestamp(lyric = "") {
  const match = String(lyric).match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`);
}

function likelyVocalSongScore(track, prompt = "") {
  const rawText = `${track.title} ${track.artist} ${track.album || ""} ${track.mood || ""}`;
  if (looksNoIntroBlocked(track)) return -120;
  let score = 24;
  if (track.duration && track.duration >= 90 && track.duration <= 330) score += 12;
  if (/[\u4e00-\u9fff]/.test(`${track.title}${track.artist}`)) score += 10;
  if (/[a-z]/i.test(`${track.title}${track.artist}`) && !/soundtrack|score|ost|theme/i.test(rawText)) score += 8;
  if (/feat\.?|ft\.?|with|鐢峰０|濂冲０|vocal|version|radio edit/i.test(rawText)) score += 5;
  if (/live|浼村|karaoke|remix|demo|绾韩|instrumental/i.test(rawText)) score -= 16;
  if (/鍗庤|涓枃|鍥借/.test(prompt) && looksChineseTrack(track)) score += 18;
  if (/鑻辨枃|娆х編|鑻辫/.test(prompt) && /[a-z]/i.test(`${track.title}${track.artist}`)) score += 14;
  return score;
}

function findNoAccompanimentMatches(playlist, limit = 12) {
  const strong = /a\s*cappella|acappella|娓呭敱|鏃犱即濂弢绾汉澹皘浜哄０鏃犱即濂弢vocal\s*only/i;
  return playlist.tracks
    .map((track, index) => {
      const rawText = `${track.title} ${track.artist} ${track.album || ""} ${track.mood || ""}`;
      let score = 0;
      if (strong.test(rawText)) score += 120;
      if (/浼村鐗坾浼村甯instrumental|karaoke|off\s*vocal|off[\s\u00a0]*vocal|acoustic|unplugged|绾煶涔恷piano|ost|soundtrack|score|bgm|orchestra/i.test(rawText)) score -= 140;
      return { index, track, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function findRecentRecommendationMatches(playlist, prompt, memory, limit = 8) {
  const indexes = (memory.lastRecommendations || [])
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < playlist.tracks.length);
  if (!indexes.length) return [];
  const normalized = normalizeText(prompt);
  const compact = compactText(prompt);
  return indexes
    .map((index) => {
      const track = playlist.tracks[index];
      const text = normalizeText(`${track.title} ${track.artist} ${track.album || ""}`);
      const compactTrack = compactText(`${track.title} ${track.artist} ${track.album || ""}`);
      let score = 10;
      for (const token of normalized.split(/[ ,，。！？?、]+/).filter((item) => item.length > 1)) {
        if (text.includes(token)) score += token.length * 8;
      }
      if (compactTrack.includes(compact) || compact.includes(compactText(track.title))) score += 80;
      return { index, track, score };
    })
    .filter((item) => item.score > 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function referencesRecentRecommendations(prompt) {
  if (wantsFuzzyTitleSearch(prompt)) return false;
  return /刚才|上面|上一轮|前面|我记得|你刚|推荐里|那几首|这几首|列表里/.test(normalizeText(prompt));
}

async function findNoIntroMatches(playlist, prompt, limit = 8) {
  const candidates = playlist.tracks
    .map((track, index) => ({ index, track, score: likelyVocalSongScore(track, prompt), firstLyricAt: null }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 70);

  const checked = [];
  for (const item of candidates.slice(0, 36)) {
    const songId = item.track.sourceId || item.track.id;
    if (!songId) {
      checked.push(item);
      continue;
    }
    try {
      const lyric = await getLyric(songId);
      const first = firstLyricTimestamp(lyric.lyric);
      item.firstLyricAt = first;
      if (first !== null) {
        if (first <= 12) item.score += 90 - first * 4;
        else if (first <= 20) item.score += 18;
        else item.score -= 80;
      }
    } catch {
      // Keep the heuristic score when lyric lookup fails.
    }
    checked.push(item);
  }

  const early = checked
    .filter((item) => item.firstLyricAt !== null && item.firstLyricAt <= 16)
    .sort((a, b) => b.score - a.score || a.firstLyricAt - b.firstLyricAt);
  return early.slice(0, limit);
}

function wantsSpecificSongPlayback(prompt) {
  const normalized = normalizeText(prompt);
  if (/歌手|的歌|风格|歌单|推荐|几首|哪些|有什么|从曲库|检索|搜索|查询|搜/.test(normalized)) return false;
  return /(我要听|我想听|想听|播放|放一首|放|播|来一首|给我放|给我播)/.test(normalized);
}

function wantsSimilarStyleQueue(prompt) {
  const normalized = normalizeText(prompt);
  return /(类似|相似|像这首|这种|这类|同类|同样|接近).{0,12}(歌|歌曲|音乐|曲子|风格|感觉|氛围|慢|安静|舒缓|纯音|纯音乐)|(?:多|再|继续|接下来).{0,8}(播放|放|接|来|听).{0,16}(类似|相似|这种|这类|慢节奏|慢|安静|舒缓|纯音|纯音乐|为我多播放)/.test(normalized);
}

function wantsCurrentArtistQueue(prompt) {
  const normalized = normalizeText(prompt);
  return /(该歌手|这个歌手|这位歌手|当前歌手|这个乐队|该乐队|他们|他|她).{0,12}(其他|别的|更多|其它|歌|歌曲|作品)|(?:播放|放|播|来点|多放|多播放|推荐).{0,12}(该歌手|这个歌手|这位歌手|当前歌手|这个乐队|该乐队|他们|他|她)/.test(normalized);
}

function findSimilarStyleMatches(playlist, prompt, currentTrack, limit = 12) {
  const normalized = normalizeText(prompt);
  const wantsSlow = /慢|慢节奏|舒缓|安静|轻柔|放松|夜晚|睡前/.test(normalized);
  const wantsInstrumental = /纯音|纯音乐|器乐|无歌词|instrumental|ost|bgm|配乐/.test(normalized)
    || /纯音|纯音乐|器乐|instrumental|ost|bgm|配乐|piano|钢琴/i.test(`${currentTrack.title} ${currentTrack.artist} ${currentTrack.album || ""}`);
  const currentRaw = `${currentTrack.title} ${currentTrack.artist} ${currentTrack.album || ""}`.toLowerCase();
  return playlist.tracks.map((track, index) => {
    if ((track.sourceId || track.id) && (track.sourceId || track.id) === (currentTrack.sourceId || currentTrack.id)) return null;
    const raw = `${track.title} ${track.artist} ${track.album || ""} ${track.mood || ""}`.toLowerCase();
    let score = 0;
    if (wantsSlow && /slow|soft|dream|night|moon|blue|ambient|piano|acoustic|lofi|ballad|chill|refrain|夜|月|梦|慢|安静|温柔|舒缓|钢琴|纯音|配乐|原声/.test(raw)) score += 42;
    if (wantsInstrumental && /instrumental|ost|soundtrack|score|bgm|ambient|piano|strings|orchestra|配乐|原声|纯音|钢琴|坂本|久石让/.test(raw)) score += 44;
    if (/tokyo|blue|weeps|piano|ambient|refrain/.test(currentRaw) && /tokyo|blue|weeps|piano|ambient|refrain|night|dream|soft|ost|soundtrack|钢琴|纯音|配乐|原声/.test(raw)) score += 24;
    if (track.artist && currentTrack.artist && normalizeText(track.artist) === normalizeText(currentTrack.artist)) score += 20;
    if (track.album && currentTrack.album && normalizeText(track.album) === normalizeText(currentTrack.album)) score += 12;
    if (/remix|live|伴奏|karaoke|demo/i.test(raw)) score -= 18;
    return score > 0 ? { index, track, score } : null;
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function extractDirectTitleQuery(prompt) {
  let text = String(prompt || "").trim();
  const quoted = text.match(/[《“"「](.+?)[》”"」]/);
  if (quoted?.[1]) return quoted[1].trim();
  text = text
    .replace(/^(请|帮我|给我|直接|现在|马上|立刻)\s*/i, "")
    .replace(/^(播放|放一个|放一首|放|播一个|播|来一首|我要听|我想听|想听)\s*/i, "")
    .replace(/\s*(这首歌|这首|这歌|歌曲|音乐)\s*$/i, "")
    .trim();
  if (!text || text.length > 80) return "";
  if (/^(播放|推荐|搜索|检索|查询|找|搜|来点|换成|切到)$/i.test(text)) return "";
  return text;
}

function looksLikeDirectTitlePlayback(prompt) {
  const normalized = normalizeText(prompt);
  const query = extractDirectTitleQuery(prompt);
  if (!query) return false;
  if (!/^(请|帮我|给我|直接|现在|马上|立刻)?\s*(播放|放一个|放一首|放|播一个|播|来一首|我要听|我想听|想听)\b/i.test(String(prompt || "").trim())) return false;
  if (/的歌|歌手|风格|类型|类似|像|推荐|来点|几首|哪些|有什么/.test(normalized)) return false;
  return true;
}

function recommendationFromMatch(item) {
  return {
    index: item.index,
    title: item.track.title,
    artist: item.track.artist,
    album: item.track.album || "",
    sourceId: item.track.sourceId || item.track.id || "",
    score: item.score || 0
  };
}

function queuePreviewFromIndexes(playlist, indexes) {
  return indexes.slice(0, 12).map((index) => ({
    index,
    title: playlist.tracks[index]?.title || "",
    artist: playlist.tracks[index]?.artist || "",
    album: playlist.tracks[index]?.album || ""
  })).filter((item) => item.title);
}

function withTimeout(promise, ms, fallback = null) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

function parseLooseJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function finalizeDeepSeekChatResponse(response, { prompt, intent, payload, memory }) {
  if (!response || !process.env.DEEPSEEK_API_KEY) return response;
  const explicitReply = String(intent?.reply || "").trim();
  if (intent?.intent === "chat" && explicitReply) return { ...response, reply: explicitReply };
  const recommendations = (response.recommendations || [])
    .slice(0, 12)
    .map((item, index) => {
      const album = item.album ? "《" + item.album + "》" : "";
      return (index + 1) + ". " + (item.title || "") + " - " + (item.artist || "") + album;
    })
    .join("`n") || "无";
  const queuePreview = (response.queuePreview || [])
    .slice(0, 8)
    .map((item, index) => (index + 1) + ". " + (item.title || "") + " - " + (item.artist || ""))
    .join("`n") || "无";
  const system = [
    "你是这个音乐电台的 chat 大脑。用户希望你像正常 DeepSeek 一样对话，同时能控制音乐播放。",
    "根据本地代码已经执行后的结果，生成一条自然中文回复。不要模板化，不要说自己只是规则系统。",
    "如果已经排队或找到歌曲，要说明结果；如果只是聊天，就正常聊天。",
    "不要编造没有出现在候选列表里的歌；不确定就自然说明。",
    "尽量短，1到3句话。"
  ].join("\n");
  const user = [
    "用户原话：" + prompt,
    "DeepSeek 判定：" + JSON.stringify(intent || {}),
    "当前歌曲：" + (payload.track?.title || "") + " - " + (payload.track?.artist || ""),
    "已执行结果：queued=" + Boolean(response.queued) + "，replyFallback=" + (response.reply || ""),
    "候选歌曲：`n" + recommendations,
    "后续队列：`n" + queuePreview,
    "最近记忆：" + ((memory.recentAsks || []).slice(0, 6).join(" / "))
  ].join("\n");
  try {
    const reply = await withTimeout(openAiChat([{ role: "system", content: system }, { role: "user", content: user }]), 4500, null);
    return { ...response, reply: sanitizeStationReply(reply, explicitReply || response.reply) };
  } catch {
    return { ...response, reply: explicitReply || response.reply };
  }
}

async function handleDsMusicIntent(intent, { prompt, playlist, payload, memory, taste, weather }) {
  if (!intent || intent.confidence < 0.55) return null;
  let mode = intent.intent;
  const currentArtistReference = wantsCurrentArtistQueue(prompt);
  if (currentArtistReference) {
    mode = /播放|放|播|来点|多放|多播放|我要听|我想听|想听/.test(normalizeText(prompt))
      ? "play_current_artist"
      : "search_current_artist";
    intent.title = "";
    intent.artist = "";
  }
  const currentIndex = state.index % playlist.tracks.length;

  if (queryStyleFlags(prompt).noIntro) {
    const matches = await findNoIntroMatches(playlist, prompt, 12);
    await rememberRecommendations(memory, matches);
    const shouldQueue = intent.autoplay || wantsPlaybackAction(prompt);
    let queuedIndexes = shouldQueue ? matches.map((item) => item.index).filter((index) => index !== currentIndex) : [];
    let switchedTrack = null;
    if (queuedIndexes.length && wantsImmediateSwitch(prompt)) {
      const [nextIndex, ...restIndexes] = queuedIndexes;
      state.index = nextIndex;
      state.playing = true;
      state.lastHostLine = "";
      queuedIndexes = restIndexes;
      state.queue = queuedIndexes;
      switchedTrack = playlist.tracks[nextIndex] || null;
      fillHostLineAsync(state.index);
      await broadcast();
    } else if (queuedIndexes.length) {
      state.queue = queuedIndexes;
    }
    return {
      reply: matches.length
        ? queuedIndexes.length
          ? `我只保留了歌词时间戳显示 16 秒内进入人声的歌，已排 ${queuedIndexes.length} 首到当前歌曲后面。`
          : `我只列歌词时间戳显示 16 秒内进入人声的歌，下面这些更接近“没有前奏”。`
        : "我按歌词时间戳查了一轮，没有找到足够可靠的“16 秒内进入人声”歌曲，所以这次不硬排。",
      recommendations: matches.map((item) => ({
        ...recommendationFromMatch(item),
        firstLyricAt: item.firstLyricAt
      })),
      queued: queuedIndexes.length > 0,
      queuePreview: queuePreviewFromIndexes(playlist, queuedIndexes),
      memory
    };
  }

  if (looksLikeStyleRequest(prompt) && ["play_title", "search_title", "play_artist", "search_artist", "chat"].includes(mode)) {
    mode = "recommend_style";
    intent.style = semanticStyleQuery(prompt, intent.style || extractStyleLabel(prompt));
    intent.title = "";
    intent.artist = "";
    intent.autoplay = intent.autoplay || wantsPlaybackAction(prompt);
    intent.confidence = Math.max(intent.confidence || 0, 0.86);
  }

  if (mode === "chat") {
    return {
      reply: intent.reply || await answerNormalChat(prompt, payload, memory, taste, weather),
      recommendations: [],
      queued: false,
      queuePreview: [],
      memory
    };
  }

  if (mode === "current_track_question") {
    return {
      reply: await answerCurrentTrackQuestion(prompt, payload, memory),
      recommendations: [],
      queued: false,
      queuePreview: [],
      memory
    };
  }

  if ((mode === "play_current_artist" || mode === "search_current_artist") && payload.track.artist) {
    const netease = await searchNeteaseSongs(payload.track.artist, 12);
    return {
      reply: netease.length
        ? `我直接去网易云搜了 ${payload.track.artist}，找到 ${netease.length} 个候选；点卡片就能播放。`
        : `我直接去网易云搜了 ${payload.track.artist}，暂时没找到可播放候选。`,
      recommendations: neteaseRecommendations(netease),
      queued: false,
      queuePreview: [],
      memory
    };
  }

  if ((mode === "play_title" || mode === "search_title") && intent.title) {
    await rememberPendingTitle(memory, intent.title);
    if (mode === "play_title" && (intent.autoplay || wantsImmediateSwitch(prompt) || wantsPlaybackAction(prompt))) {
      return playTitleImmediately(intent.title, playlist, memory);
    }
    const netease = await searchNeteaseSongs(intent.title, 12);
    return {
      reply: netease.length
        ? `我直接去网易云搜《${intent.title}》，找到 ${netease.length} 个候选；点卡片就能播放。`
        : `我直接去网易云搜了《${intent.title}》，暂时没找到可播放候选。`,
      recommendations: neteaseRecommendations(netease),
      queued: false,
      queuePreview: [],
      memory
    };
  }

  if ((mode === "play_artist" || mode === "search_artist") && intent.artist) {
    const netease = await searchNeteaseSongs(intent.artist, 12);
    return {
      reply: netease.length
        ? `我直接去网易云搜 ${intent.artist}，找到 ${netease.length} 个候选；点卡片就能播放。`
        : `我直接去网易云搜了 ${intent.artist}，暂时没找到可播放候选。`,
      recommendations: neteaseRecommendations(netease),
      queued: false,
      queuePreview: [],
      memory
    };
  }

  if (mode === "recommend_similar" || mode === "recommend_style") {
    const searchPrompt = mode === "recommend_similar"
      ? `${prompt} ${intent.style || ""}`
      : semanticStyleQuery(prompt, intent.style || prompt);
    const matches = mode === "recommend_similar"
      ? findSimilarStyleMatches(playlist, searchPrompt, payload.track, 12)
      : searchTracks(playlist, searchPrompt, 12);
    await rememberRecommendations(memory, matches);
    const shouldQueue = intent.autoplay || wantsPlaybackAction(prompt);
    let queuedIndexes = shouldQueue ? matches.map((item) => item.index).filter((index) => index !== currentIndex) : [];
    let switchedTrack = null;
    if (queuedIndexes.length && wantsImmediateSwitch(prompt)) {
      const [nextIndex, ...restIndexes] = queuedIndexes;
      state.index = nextIndex;
      state.playing = true;
      state.lastHostLine = "";
      queuedIndexes = restIndexes;
      state.queue = queuedIndexes;
      switchedTrack = playlist.tracks[nextIndex] || null;
      fillHostLineAsync(state.index);
      await broadcast();
    } else if (queuedIndexes.length) {
      state.queue = queuedIndexes;
    }
    if (!matches.length) {
      const neteaseQuery = semanticStyleQuery(prompt, intent.style || extractStyleLabel(prompt) || searchPrompt)
        .replace(/鎺ヤ笅鏉缁х画鎾斁|鎾斁|鎴戞兂鍚瑋鎯冲惉|鎴戣鍚瑋鏉ョ偣|鎺ㄨ崘|姝屾洸|闊充箰|涓烘垜|缁欐垜/g, " ")
        .replace(/\s+/g, " ")
        .trim() || searchPrompt;
      const netease = await searchNeteaseSongs(neteaseQuery, 12);
      const externalTracks = netease.map((track) => externalNeteaseTrack(track)).filter((track) => track.sourceId);
      if (shouldQueue && externalTracks.length) {
        state.nextTracks ||= [];
        for (const track of externalTracks) {
          if (!state.nextTracks.some((item) => String(item.sourceId || item.id) === String(track.sourceId || track.id))) {
            state.nextTracks.push(track);
          }
        }
      }
      return {
        reply: netease.length
          ? shouldQueue
            ? `当前歌单里没筛到特别稳定的 ${neteaseQuery}，我改去网易云搜到了 ${netease.length} 个候选，已放到当前歌曲后面。`
            : `当前歌单里没筛到特别稳定的 ${neteaseQuery}，我改去网易云搜到了 ${netease.length} 个候选。`
          : `我按 ${neteaseQuery} 搜了当前歌单和网易云，都没拿到稳定的候选。`,
        recommendations: neteaseRecommendations(netease),
        queued: shouldQueue && externalTracks.length > 0,
        queuePreview: externalTracks.slice(0, 12).map((track, index) => ({
          index,
          title: track.title,
          artist: track.artist,
          album: track.album || ""
        })),
        memory
      };
    }
    return {
      reply: matches.length
        ? switchedTrack
          ? `已直接切到：${switchedTrack.title} - ${switchedTrack.artist}。后面还接了 ${queuedIndexes.length} 首同方向的歌。`
        : queuedIndexes.length
          ? `我按你的意思筛了 ${matches.length} 首，已排到当前歌曲后面。`
          : `我按这个方向筛了 ${matches.length} 首，可以从下面挑。`
        : "我按你的意思筛了一遍当前歌单，但没找到足够稳定的候选，所以先不硬排。",
      recommendations: matches.slice(0, 12).map(recommendationFromMatch),
      queued: queuedIndexes.length > 0,
      queuePreview: queuePreviewFromIndexes(playlist, queuedIndexes),
      memory
    };
  }

  return null;
}

async function dsMusicIntent(prompt, memory, payload) {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  try {
    const reply = await withTimeout(deepSeekIntentJson(
      [{
        role: "user",
        content: [
          `用户原话：${prompt}`,
          `当前歌曲：${payload.track.title}`,
          `当前歌手：${payload.track.artist}`,
          `当前专辑：${payload.track.album || "未知"}`,
          `最近对话：${(memory.recentAsks || []).slice(0, 8).join(" / ")}`,
          `已知歌手别名：${Object.entries(memory.artistAliases || {}).map(([alias, target]) => `${alias}=${target}`).join("、") || "暂无"}`
        ].join("`n")
      }],
      [
        "你只负责把用户的话解析成音乐意图，不要聊天。",
        "只输出 JSON，不要 markdown，不要解释。",
        "schema: {\"intent\":\"chat|current_track_question|play_title|search_title|play_artist|search_artist|play_current_artist|search_current_artist|recommend_style|recommend_similar|library_question\",\"title\":\"\",\"artist\":\"\",\"style\":\"\",\"autoplay\":false,\"reply\":\"\",\"confidence\":0}",
        "如果用户说的是风格、类型、语言、氛围，例如 r&b、emo、华语歌、日语歌、夜晚慢歌、没有前奏的歌，intent 必须用 recommend_style，style 填风格词，不要把风格当歌名。",
        "没有前奏、没前奏、直接开唱、短前奏是特殊风格，style 输出：短前奏 直接开唱 vocal fast。",
        "如果用户明确说播放某首歌，intent 用 play_title，title 填歌名。",
        "如果用户说该歌手、这个歌手、当前歌手、他们/他/她的其他歌，intent 用 play_current_artist。",
        "如果用户说类似这首、这种、这类、慢节奏、舒缓、多播放类似，intent 用 recommend_similar，autoplay=true。",
        "如果用户问当前歌曲、歌手、歌词、专辑、创作背景，intent 用 current_track_question。",
        "如果用户明确说某歌手的歌，填 artist；例如接下来为我播放张宇的歌。",
        "不要把未知缩写强行展开；不确定就保留用户原词并降低 confidence。",
        "不要把当前正在播放的歌当成答案。"
      ].join("`n")
    ), 3000, null);
    const parsed = parseLooseJson(reply);
    if (!parsed || typeof parsed !== "object") return null;
    const styleIntent = looksLikeStyleRequest(prompt);
    const styleLabel = semanticStyleQuery(prompt, String(parsed.style || ""));
    const badTitle = String(parsed.title || "").trim();
    const badArtist = String(parsed.artist || "").trim();
    const badIntent = String(parsed.intent || "chat");
    if (styleIntent && (badIntent === "play_title" || badIntent === "search_title") && (!badTitle || /姝屾洸|闊充箰|r&b|rnb|rb|鎯呮瓕|鎱㈡瓕|椋庢牸/i.test(badTitle))) {
      parsed.intent = "recommend_style";
      parsed.style = semanticStyleQuery(prompt, parsed.style || styleLabel);
      parsed.title = "";
      parsed.artist = "";
      parsed.autoplay = wantsPlaybackAction(prompt);
      parsed.confidence = Math.max(Number(parsed.confidence || 0), 0.9);
    }
    if (styleIntent && badIntent === "chat" && wantsPlaybackAction(prompt)) {
      parsed.intent = "recommend_style";
      parsed.style = semanticStyleQuery(prompt, parsed.style || styleLabel);
      parsed.title = "";
      parsed.artist = "";
      parsed.autoplay = wantsPlaybackAction(prompt);
      parsed.confidence = Math.max(Number(parsed.confidence || 0), 0.88);
    }
    return {
      intent: String(parsed.intent || "chat"),
      title: String(parsed.title || "").trim(),
      artist: String(parsed.artist || "").trim(),
      style: parsed.intent === "recommend_style" ? semanticStyleQuery(prompt, parsed.style || styleLabel) : String(parsed.style || "").trim(),
      autoplay: Boolean(parsed.autoplay),
      reply: String(parsed.reply || "").trim(),
      confidence: Number(parsed.confidence || 0)
    };
  } catch (error) {
    console.warn("[chat] DS intent fallback:", error.message);
    return null;
  }
}

function sanitizeStationReply(reply, fallback) {
  const text = String(reply || "").trim();
  if (!text) return fallback;
  if (/这味道我懂|味道我懂|安排一|拿捏|氛围感|懂你|宝藏|绝绝子|狠狠|冲一波|老歌单/i.test(text)) return fallback;
  return text;
}

function wantsAddLastRecommendations(prompt) {
  return /(?:全部|全都|都|这些|这几首|上面|刚才).{0,8}(?:添加|加入|加到|放到|排到).{0,8}(?:列表|队列|播放列表|后面)|(?:添加|加入|加到|放到|排到).{0,8}(?:全部|全都|这些|这几首|上面|刚才)/.test(normalizeText(prompt));
}

function wantsCurrentTrackAnswer(prompt) {
  const normalized = normalizeText(prompt);
  return (
    /这首|当前|现在播|正在播|现在播放|当前播放|这歌|这首歌|这个歌手|这位歌手/.test(normalized)
      && /逻辑|为什么|怎么|讲|什么意思|介绍|背景|谁唱|歌手|专辑|歌词|说什么|来源|哪张|什么歌|怎么样|是谁/.test(normalized)
  ) || /^(介绍|讲讲|说说).{0,6}(歌手|专辑|这首|这歌|歌曲)$/.test(normalized)
    || /^(歌手|专辑).{0,6}(介绍|资料|背景)$/.test(normalized)
    || /^(又是随便写写|.+?)(是什么|什么意思|写什么|讲什么|表达什么)$/.test(normalized);
}

function wantsPlaybackLogicAnswer(prompt) {
  return /播放.{0,6}逻辑|逻辑.{0,6}播放|现在播放.*为什么|为什么.*现在播放|怎么.*选歌|下一首.*逻辑|随机.*逻辑/.test(normalizeText(prompt));
}

function playbackLogicReply(playlist, payload) {
  const queueCount = Array.isArray(state.queue) ? state.queue.length : 0;
  return [
    "现在的播放逻辑是分层的：如果你在 Chat 里明确说想听某个歌手、风格或歌曲，我会把匹配到的歌排到当前歌曲后面，等当前歌曲自然播完再接上。",
    queueCount ? `当前后续队列里还有 ${queueCount} 首，会优先播放队列。` : "当前没有手动队列，播完会从当前歌单里自动挑下一首。",
    `当前歌单现在有 ${playlist.tracks.length} 首；当前是 ${payload.track.title} - ${payload.track.artist}。`
  ].join(" ");
}

function parseTimedLyrics(raw = "") {
  return String(raw || "").split(/\r?\n/).flatMap((line) => {
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const text = line.replace(/\[[^\]]+\]/g, "").trim();
    if (!matches.length || !text) return [];
    if (/^(作词|作曲|编曲|制作人|监制|词|曲|arranger|composer|lyricist)\s*[:：]/i.test(text)) return [];
    return matches.map((match) => ({
      time: Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`),
      text
    }));
  }).sort((a, b) => a.time - b.time);
}

function mergeTimedTranslations(lines, translations) {
  if (!translations.length) return lines;
  return lines.map((line) => {
    const translated = translations.find((item) => Math.abs(item.time - line.time) < 0.35);
    return translated?.text && translated.text !== line.text
      ? { ...line, translation: translated.text }
      : line;
  });
}

function effectivePositionSeconds(payload) {
  const base = Math.max(0, Number(payload?.positionSeconds || 0));
  if (!payload?.playing || !payload.positionUpdatedAt) return base;
  const updatedAt = Date.parse(payload.positionUpdatedAt);
  if (!Number.isFinite(updatedAt)) return base;
  const elapsed = (Date.now() - updatedAt) / 1000;
  const duration = Number(payload.track?.duration || Infinity);
  return Math.max(0, Math.min(duration, base + Math.max(0, elapsed)));
}

async function computedDesktopLyrics() {
  const payload = await currentPayload();
  const track = payload.track || {};
  const songId = track.sourceId || track.id;
  if (!songId) return latestDesktopLyrics;
  const lyric = await getLyric(songId);
  const lines = mergeTimedTranslations(parseTimedLyrics(lyric.lyric), parseTimedLyrics(lyric.tlyric));
  if (!lines.length) {
    return {
      title: String(track.title || "Claudio AI Radio"),
      artist: String(track.artist || ""),
      current: "鏆傛棤姝岃瘝",
      translation: "",
      next: "",
      playing: Boolean(payload.playing)
    };
  }
  const seconds = effectivePositionSeconds(payload);
  let index = lines.findIndex((line, lineIndex) => seconds >= line.time && seconds < (lines[lineIndex + 1]?.time ?? Infinity));
  if (index < 0) index = 0;
  const current = lines[index] || {};
  return {
    title: String(track.title || "Claudio AI Radio"),
    artist: String(track.artist || ""),
    current: String(current.text || "鏆傛棤姝岃瘝"),
    translation: String(current.translation || ""),
    next: String(lines[index + 1]?.text || ""),
    playing: Boolean(payload.playing)
  };
}

async function translationForDesktopLine(pushed) {
  const payload = await currentPayload();
  const track = payload.track || {};
  const sameTrack = normalizeText(track.title || "") === normalizeText(pushed.title)
    && normalizeText(track.artist || "") === normalizeText(pushed.artist);
  if (!sameTrack) return "";
  const songId = track.sourceId || track.id;
  if (!songId || !pushed.current) return "";
  const lyric = await getLyric(songId);
  const lines = mergeTimedTranslations(parseTimedLyrics(lyric.lyric), parseTimedLyrics(lyric.tlyric));
  const normalizedCurrent = normalizeText(pushed.current);
  const matched = lines.find((line) => normalizeText(line.text) === normalizedCurrent);
  return matched?.translation || "";
}

async function currentDesktopLyrics() {
  if (latestDesktopLyrics.updatedAt && Date.now() - latestDesktopLyrics.updatedAt < 30000) {
    const pushed = {
      title: latestDesktopLyrics.title,
      artist: latestDesktopLyrics.artist,
      current: latestDesktopLyrics.current,
      translation: latestDesktopLyrics.translation,
      next: latestDesktopLyrics.next,
      playing: Boolean(state.playing)
    };
    if (pushed.translation) return pushed;
    return {
      ...pushed,
      translation: await translationForDesktopLine(pushed)
    };
  }
  return computedDesktopLyrics();
}

function wantsWebFacts(prompt) {
  return /电影|影视|出自|来源|原声|奖|获奖|奖项|提名|格莱美|奥斯卡|金球|背景|创作|发行|年代|哪部/.test(normalizeText(prompt));
}

async function lookupTrackFacts(track) {
  const query = `${track.title} ${track.artist} ${track.album || ""}`.replace(/[()[\]【】《》]/g, " ").slice(0, 180);
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", query);
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");
  const searchResponse = await fetch(searchUrl, { headers: { "user-agent": "ClaudioAIRadio/1.0" } });
  if (!searchResponse.ok) throw new Error(`Wikipedia search failed: ${searchResponse.status}`);
  const searchData = await searchResponse.json();
  const pages = (searchData.query?.search || []).slice(0, 3);
  const extracts = [];
  for (const page of pages) {
    const extractUrl = new URL("https://en.wikipedia.org/w/api.php");
    extractUrl.searchParams.set("action", "query");
    extractUrl.searchParams.set("prop", "extracts");
    extractUrl.searchParams.set("exintro", "1");
    extractUrl.searchParams.set("explaintext", "1");
    extractUrl.searchParams.set("pageids", String(page.pageid));
    extractUrl.searchParams.set("format", "json");
    extractUrl.searchParams.set("origin", "*");
    const extractResponse = await fetch(extractUrl, { headers: { "user-agent": "ClaudioAIRadio/1.0" } });
    if (!extractResponse.ok) continue;
    const extractData = await extractResponse.json();
    const item = extractData.query?.pages?.[page.pageid];
    if (item?.extract) {
      extracts.push({
        title: item.title,
        url: `https://en.wikipedia.org/?curid=${page.pageid}`,
        extract: item.extract.slice(0, 1200)
      });
    }
  }
  return extracts;
}

async function answerCurrentTrackQuestion(prompt, payload, memory) {
  const track = payload.track;
  const lyric = await getLyric(track.sourceId || track.id);
  const lyricText = plainLyricText(`${lyric.lyric || ""}\n${lyric.tlyric || ""}`);
  let webFacts = [];
  if (wantsWebFacts(prompt)) {
    try {
      webFacts = await lookupTrackFacts(track);
    } catch {
      webFacts = [];
    }
  }
  const lyricPreview = lyricText.split("\n").slice(0, 3).join(" / ");
  const fallback = [
    `现在这首是 ${track.title}，${track.artist}。`,
    track.album ? `它收在《${track.album}》里。` : "",
    webFacts.length ? `我查到的公开资料里，最接近的是 ${webFacts.map((item) => item.title).join("、")}。` : "",
    lyricText
      ? `从歌词开头看：${lyricPreview}。`
      : `只按标题和专辑语境看，《${track.title}》可以先当作这首歌的叙事入口来听；真实创作背景我不会硬编。`
  ].filter(Boolean).join("");
  try {
    const reply = await aiChat(
      [{ role: "user", content: [
        `用户问：${prompt}`,
        `当前歌曲：${track.title}`,
        `歌手：${track.artist}`,
        `专辑：${track.album || "未知"}`,
        lyricText ? `歌词摘录：` + "`n" + lyricText : "歌词摘录：暂无",
        webFacts.length
          ? `联网检索资料：` + "`n" + webFacts.map((item, index) => `${index + 1}. ${item.title}` + "`n" + `${item.extract}` + "`n" + `Source: ${item.url}`).join("`n`n")
          : wantsWebFacts(prompt)
            ? "联网检索资料：没有查到稳定资料；不要编造电影来源或奖项。"
            : "联网检索资料：用户未要求事实检索。",
        `最近聊天偏好：${memory.preferences.join("、") || "暂无"}`
      ].join("`n") }],
      [
        "你是一个懂音乐、影视和流行文化的电台朋友。用户问的是当前正在播放的歌、歌手、专辑、歌词、标题含义、剧集来源或听感。",
        "请正常回答用户的问题，不要复读字段，不要解释你不能做什么，不要把问题改写成命令。",
        "可以结合歌名、歌手、专辑、歌词摘录和公开资料来讲；事实不确定时要说明不确定，不要编造。",
        "如果用户问 Rick and Morty、剧集、电影、奖项或创作背景，优先依据联网检索资料；资料没有覆盖时，不要编造具体集数或奖项。",
        "回答中文，像朋友认真介绍，长度可以是 1 到 3 段。"
      ].join("`n")
    );
    return reply || fallback;
  } catch (error) {
    console.warn("[chat] current-track LLM fallback:", error.message);
    return fallback;
  }
}

async function answerNormalChat(prompt, payload, memory, taste, weather) {
  const fallback = answerNormalChatFallback(prompt, payload, memory);
  try {
    const reply = await aiChat(
      [{ role: "user", content: [
        `用户说：${prompt}`,
        `当前歌曲：${payload.track.title} / ${payload.track.artist} / ${payload.track.album || "未知专辑"}`,
        `最近几轮对话：${memory.recentAsks.slice(0, 12).join(" / ")}`,
        `刚才推荐过的歌名：${(memory.lastRecommendationTitles || []).slice(0, 12).join(" / ") || "暂无"}`,
        `已记住偏好：${memory.preferences.join("、") || "暂无"}`,
        `隐藏上下文，不要主动提：${weather.city} ${weather.text} ${weather.temp}C`
      ].join("`n") }],
      [
        `你是 ${taste.stationName} 的电台聊天伙伴，也是一个可以正常对话的 DeepSeek 聊天对象。`,
        "不要把每句话都理解成点歌命令。用户闲聊、追问、吐槽、纠错、问剧情、问歌词、问观点时，就按正常聊天回答。",
        "回答要有具体内容，避免空话、教程口吻和固定句式。",
        "如果用户在纠正你，先承认刚才的理解偏差，再根据上下文继续推理；只有信息真的不够时，才问一个具体问题。",
        "不要主动改播放队列；播放和检索已经由外层工具处理。你这里只负责把话答好。",
        "可以结合当前歌曲、最近对话、歌词、专辑、歌手常识来聊。事实不确定时自然说明不确定，不要装懂。",
        "用中文，像一个有音乐品味的朋友认真回应。"
      ].join("`n")
    );
    return reply || fallback;
  } catch (error) {
    console.warn("[chat] normal LLM fallback:", error.message);
    return fallback;
  }
}

async function answerDeepSeekChat(prompt, payload, memory, taste, weather, intent) {
  const fallback = answerNormalChatFallback(prompt, payload, memory);
  try {
    const reply = await openAiChat([
      {
        role: "system",
        content: [
          `你是 ${taste.stationName} 的 DeepSeek chat 大脑，既能正常聊天，也懂这个音乐电台。`,
          "这一轮没有触发可靠的播放动作，所以不要假装已经搜到歌，也不要编造播放结果。",
          "如果用户是在表达想听某种风格但信息不够，你可以自然追问一个具体问题；如果只是闲聊、纠错、吐槽或追问，就正常回答。",
          "不要使用模板句，不要说自己是规则系统，不要把整句话当作歌名。",
          "用中文，像一个懂音乐的朋友认真回应。"
        ].join("`n")
      },
      {
        role: "user",
        content: [
          `用户说：${prompt}`,
          `DS 意图草稿：${JSON.stringify(intent || {})}`,
          `当前歌曲：${payload.track.title} / ${payload.track.artist} / ${payload.track.album || "未知专辑"}`,
          `最近几轮对话：${memory.recentAsks.slice(0, 12).join(" / ")}`,
          `已记住偏好：${memory.preferences.join("、") || "暂无"}`,
          `隐藏上下文，不要主动提：${weather.city} ${weather.text} ${weather.temp}C`
        ].join("`n")
      }
    ]);
    return sanitizeStationReply(reply, fallback);
  } catch (error) {
    console.warn("[chat] DS full-chat fallback:", error.message);
    return fallback;
  }
}

function answerNormalChatFallback(prompt, payload, memory) {
  const normalized = normalizeText(prompt);
  const track = payload?.track || {};
  const context = [track.title, track.artist, track.album].filter(Boolean).join(" / ");
  const peopleGuess = normalized.match(/你觉得(.+?)和(.+?)(像不像|像吗|相似|是不是像)/)
    || normalized.match(/(.+?)和(.+?)(像不像|像吗|相似)/);
  if (peopleGuess) {
    return `只按名字和当前播放上下文看，我不能直接确认他们长得像不像；如果你说的是封面人物，我需要看到图像细节或专辑信息才敢判断。现在这首的上下文是 ${context || "当前曲目"}。`;
  }
  if (/识图|看图|图片|封面|照片/.test(normalized)) {
    return "我现在这个站内 Chat 还不能直接识别你发来的图片或专辑封面。你把图里的文字、歌名、专辑名或想确认的人名发给我，我可以接着判断。";
  }
  if (/(.+)是(.+)吗[？?]?$|是不是|是否/.test(normalized)) {
    return `我不能凭空确认这个事实。结合当前上下文 ${context || "这首歌"}，我可以帮你往专辑、歌手或公开资料方向查。`;
  }
  if (/是什么|什么意思|写什么|讲什么|表达什么/.test(normalized)) {
    return `我先按当前上下文理解：你问的是 ${context || "这首歌"} 里的标题、歌词或说法。信息不够时我不会硬编，你把具体那句原文补全一点，我再拆。`;
  }
  if (/为什么|怎么|区别|像不像|你觉得|能不能|可以吗/.test(normalized)) {
    return `这个问题我会当普通聊天接，不会动播放列表。当前上下文是 ${context || "这首歌"}，你把想追问的对象说完整一点，我继续按聊天回答。`;
  }
  return `我这边 AI 回复临时没接上，只能先按当前上下文 ${context || "这首歌"} 接一句：这条不是点歌命令，我不会改队列。`;
}

function trackWeatherScore(track, weather) {
  const haystack = `${track.title} ${track.artist} ${track.album || ""} ${track.mood || ""}`.toLowerCase();
  let score = 0;
  const text = `${weather.text || ""}`.toLowerCase();
  if (text.includes("雨") || text.includes("rain")) {
    if (track.bpm && track.bpm <= 90) score += 3;
    if (/rain|雨|night|moon|slow|soft|dream|blue|cloud/.test(haystack)) score += 2;
  }
  if (text.includes("晴") || text.includes("clear")) {
    if (track.bpm && track.bpm >= 90) score += 2;
    if (/sun|晴|夏|walk|city|light|day|dance/.test(haystack)) score += 2;
  }
  if (weather.temp >= 30 && /summer|夏|sea|blue|海|city/.test(haystack)) score += 2;
  if (weather.temp <= 8 && /winter|冬|warm|夜|雪|moon/.test(haystack)) score += 2;
  return score;
}

async function chooseNextIndex(playlist) {
  if (!playlist?.tracks?.length) return 0;
  const current = state.index % playlist.tracks.length;
  if (state.playbackMode === "repeat-one") return current;
  if (state.nextSessionPlaylist?.tracks?.length) {
    state.sessionPlaylist = state.nextSessionPlaylist;
    state.nextSessionPlaylist = null;
    state.tempTrack = null;
    return 0;
  }
  while (state.queue.length) {
    const queued = Number(state.queue.shift());
    if (Number.isInteger(queued) && queued >= 0 && queued < playlist.tracks.length && queued !== current) {
      return queued;
    }
  }
  if (state.playbackMode === "sequence") return (current + 1) % playlist.tracks.length;
  const weather = await getWeather();
  const recent = new Set((state.history || [])
    .map((item) => item.track?.sourceId || item.track?.id || item.track?.title)
    .filter(Boolean)
    .slice(0, Math.min(80, Math.floor(playlist.tracks.length / 3))));
  const candidates = playlist.tracks.map((track, index) => ({ track, index }))
    .filter((item) => item.index !== current)
    .filter((item) => !recent.has(item.track.sourceId || item.track.id || item.track.title));
  const pool = candidates.length ? candidates : playlist.tracks
    .map((track, index) => ({ track, index }))
    .filter((item) => item.index !== current);
  const weighted = pool.map((item) => ({
    ...item,
    weight: 1 + Math.max(0, trackWeatherScore(item.track, weather))
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let pick = Math.random() * total;
  for (const item of weighted) {
    pick -= item.weight;
    if (pick <= 0) return item.index;
  }
  return weighted[0]?.index ?? current;
}

async function choosePreviousIndex(playlist) {
  if (!playlist?.tracks?.length) return 0;
  const current = state.index % playlist.tracks.length;
  if (state.playbackMode === "repeat-one") return current;
  if (state.playbackMode === "shuffle") {
    const pool = playlist.tracks
      .map((track, index) => ({ track, index }))
      .filter((item) => item.index !== current);
    return pool[Math.floor(Math.random() * pool.length)]?.index ?? current;
  }
  return (current - 1 + playlist.tracks.length) % playlist.tracks.length;
}

async function generateHostLine(track, nextTrack) {
  const [taste, weather, memory] = await Promise.all([getTaste(), getWeather(), getMemory()]);
  const system = [
    `你是 ${taste.stationName} 的 AI 电台主播，不是助手。`,
    taste.persona,
    `用户喜欢：${taste.favoriteMoods.join("、")}。`,
    memory.preferences.length ? `最近聊天里显露的偏好：${memory.preferences.join("、")}。` : "",
    `用户不喜欢：${taste.dislikes.join("、")}。`,
    "生成一段自然、有质感的中文电台口播，只围绕当前歌曲、歌手、专辑和听感。",
    "不要主动说下一首，不要提天气或日程，不要编造年份、奖项和创作故事。",
    "输出中文，1 到 4 句话。"
  ].filter(Boolean).join("`n");

  const user = [
    `隐藏上下文，不要主动提：${dayPartLabel()} / ${weather.city} ${weather.text} ${weather.temp}C / ${weatherMood(weather)}`,
    `正在播放：${track.title}`,
    `歌手：${track.artist}`,
    `专辑：${track.album || "未知"}`,
    `标签/来源：${track.mood || track.source || "未知"}`,
    `时长：${track.duration || "未知"} 秒`,
  ].join("`n");

  try {
    const result = await aiChat([{ role: "user", content: user }], system);
    return sanitizeHostLine(result, track);
  } catch {
    return fallbackHostLine({ track, nextTrack, weather });
  }
}

async function fillHostLineAsync(trackIndex) {
  // AI DJ is disabled. Keep the hook as a no-op so playback code stays stable.
  state.lastHostLine = "";
  /*
  const currentGeneration = ++generationId;
  const playlist = await loadPlaylist();
  const activePlaylist = activePlaybackPlaylist(playlist);
  const track = activePlaylist.tracks[trackIndex % activePlaylist.tracks.length];
  const nextTrack = activePlaylist.tracks[(trackIndex + 1) % activePlaylist.tracks.length];
  try {
    const line = await generateHostLine(track, nextTrack);
    if (currentGeneration !== generationId || state.index % activePlaylist.tracks.length !== trackIndex % activePlaylist.tracks.length) return;
    state.lastHostLine = line;
    state.history = [{ id: crypto.randomUUID(), at: new Date().toISOString(), track, line }, ...state.history].slice(0, 20);
    await broadcast();
  } catch {
    // Keep the current line; playback should never wait on narration.
  }
  */
}

async function fillTempHostLineAsync(track) {
  // AI DJ is disabled. Keep the hook as a no-op so playback code stays stable.
  state.lastHostLine = "";
  /*
  const currentGeneration = ++generationId;
  try {
    const playlist = await loadPlaylist();
    const activePlaylist = activePlaybackPlaylist(playlist);
    const nextTrack = activePlaylist.tracks[(state.index + 1) % activePlaylist.tracks.length];
    const line = await generateHostLine(track, nextTrack);
    if (currentGeneration !== generationId || !state.tempTrack || (state.tempTrack.sourceId || state.tempTrack.id) !== (track.sourceId || track.id)) return;
    state.lastHostLine = line;
    state.history = [{ id: crypto.randomUUID(), at: new Date().toISOString(), track, line }, ...state.history].slice(0, 20);
    await broadcast();
  } catch {
    // Temporary playback should never wait on narration.
  }
  */
}

function buildEpisode(playlist) {
  const playlistName = playlist.playlist?.name || playlist.name || "Fourteen-Year Mixtape";
  const cleanName = String(playlistName)
    .replace(/^Merged NetEase Radio.*$/i, "Fourteen-Year Mixtape")
    .replace(/喜欢的音乐/g, "私人歌单")
    .slice(0, 48);
  return {
    kicker: "Claudio / Pilot Episode",
    title: cleanName || "Fourteen-Year Mixtape",
    subtitle: "AI radio episode"
  };
}

function activePlaybackPlaylist(playlist) {
  const sessionTracks = filterPlaybackTracks(state.sessionPlaylist?.tracks || []);
  if (sessionTracks.length) {
    return {
      ...playlist,
      name: state.sessionPlaylist.name || "NetEase Queue",
      playlist: {
        id: state.sessionPlaylist.id || "netease-session",
        name: state.sessionPlaylist.name || "NetEase Queue",
        trackCount: sessionTracks.length
      },
      tracks: sessionTracks,
      source: "netease-session"
    };
  }
  return playlist?.tracks?.length ? playlist : EMPTY_PLAYBACK_PLAYLIST;
}

async function currentPayload() {
  const playlist = await loadPlaylist();
  const activePlaylist = activePlaybackPlaylist(playlist);
  state.nextTracks = filterPlaybackTracks(state.nextTracks || []);
  const hasTracks = activePlaylist.tracks.length > 0;
  const activeIndex = hasTracks ? state.index % activePlaylist.tracks.length : 0;
  const track = state.tempTrack || (hasTracks ? activePlaylist.tracks[activeIndex] : EMPTY_TRACK);
  const nextTrack = state.nextTracks?.[0] || (hasTracks ? activePlaylist.tracks[(activeIndex + 1) % activePlaylist.tracks.length] : null);
  const currentPositionKey = positionTrackKey(track);
  const positionSeconds = state.positionTrackKey === currentPositionKey
    ? Math.max(0, Math.min(Number(track.duration || Infinity), Number(state.positionSeconds || 0)))
    : 0;
  const weather = await getWeather();
  return {
    ...state,
    index: activeIndex,
    track,
    nextTrack,
    positionSeconds,
    positionTrackKey: currentPositionKey,
    library: {
      trackCount: activePlaylist.tracks.length,
      playlistName: activePlaylist.playlist?.name || activePlaylist.name || "Local Radio",
      source: activePlaylist.source || "local"
    },
    canUndoPlaylist: hasPlaybackContext(state.previousPlaybackContext),
    canRedoPlaylist: hasPlaybackContext(state.nextPlaybackContext),
    episode: buildEpisode(activePlaylist),
    weather,
    dayPart: dayPart()
  };
}

async function broadcast() {
  await savePlaybackState();
  const payload = `data: ${JSON.stringify(await currentPayload())}\n\n`;
  for (const client of clients) client.write(payload);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function externalNeteaseTrack(track = {}) {
  const sourceId = String(track.sourceId || track.id || "").trim();
  return {
    id: sourceId,
    title: String(track.title || "NetEase Song").slice(0, 160),
    artist: String(track.artist || "Unknown Artist").slice(0, 160),
    artistIds: Array.isArray(track.artistIds) ? track.artistIds.map(String).filter(Boolean) : [],
    artistId: String(track.artistId || track.artistIds?.[0] || ""),
    album: String(track.album || "NetEase").slice(0, 160),
    albumId: String(track.albumId || ""),
    cover: String(track.cover || ""),
    duration: Number(track.duration || 0) || 0,
    sourceId,
    sourceIds: sourceId ? [sourceId] : [],
    source: "netease",
    libraryPlaylistId: String(track.libraryPlaylistId || ""),
    playlists: Array.isArray(track.playlists) ? track.playlists : [],
    tags: Array.isArray(track.tags) ? track.tags.slice(0, 3) : [],
    color: "#8fd8ff"
  };
}

function activePlaybackPointer(playlist) {
  const activePlaylist = activePlaybackPlaylist(playlist);
  const hasTracks = activePlaylist.tracks.length > 0;
  const index = hasTracks ? state.index % activePlaylist.tracks.length : 0;
  const track = state.tempTrack || (hasTracks ? activePlaylist.tracks[index] : null);
  return {
    index,
    track,
    source: state.tempTrack ? "temp" : (activePlaylist.source || "library"),
    sessionId: state.sessionPlaylist?.id || "",
    playlistName: activePlaylist.playlist?.name || activePlaylist.name || "Local Radio"
  };
}

function trackSequenceItem(track, index = -1, source = "queue") {
  return {
    index,
    source,
    title: track?.title || "",
    artist: track?.artist || "",
    album: track?.album || "",
    cover: track?.cover || "",
    sourceId: track?.sourceId || track?.id || "",
    duration: track?.duration || 0
  };
}

function pushPlayStack(pointer) {
  const track = pointer?.track;
  if (!track) return;
  const key = `${pointer.source}:${pointer.sessionId}:${pointer.index}:${track.sourceId || track.id || track.title}:${track.artist || ""}`;
  const previous = state.playStack?.[state.playStack.length - 1];
  if (previous?.key === key) return;
  state.playStack ||= [];
  state.playStack.push({
    key,
    index: pointer.index,
    source: pointer.source,
    sessionId: pointer.sessionId,
    playlistName: pointer.playlistName,
    track
  });
  state.playStack = state.playStack.slice(-80);
}

function playbackTrackKey(track) {
  return String(track?.sourceId || track?.id || `${track?.title || ""}:${track?.artist || ""}`);
}

function positionTrackKey(track) {
  return playbackTrackKey(track);
}

function resetPlaybackPosition(track = null) {
  state.positionSeconds = 0;
  state.positionTrackKey = track ? positionTrackKey(track) : "";
  state.positionUpdatedAt = new Date().toISOString();
}

function pushCurrentIfChanging(playlist, nextTrack) {
  const pointer = activePlaybackPointer(playlist);
  if (!pointer?.track || !nextTrack) return;
  if (playbackTrackKey(pointer.track) === playbackTrackKey(nextTrack)) return;
  pushPlayStack(pointer);
}

function clonePlaybackValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hasPlaybackContext(context) {
  return Boolean(
    context?.tempTrack ||
    context?.sessionPlaylist?.tracks?.length ||
    context?.nextSessionPlaylist?.tracks?.length ||
    context?.queue?.length ||
    context?.nextTracks?.length
  );
}

function playbackContextSnapshot(reason = "replace") {
  return {
    at: new Date().toISOString(),
    reason,
    index: Number(state.index || 0),
    playing: Boolean(state.playing),
    queue: clonePlaybackValue(state.queue || []),
    nextTracks: clonePlaybackValue(state.nextTracks || []),
    tempTrack: clonePlaybackValue(state.tempTrack || null),
    sessionPlaylist: clonePlaybackValue(state.sessionPlaylist || null),
    nextSessionPlaylist: clonePlaybackValue(state.nextSessionPlaylist || null),
    playbackMode: state.playbackMode || "sequence"
  };
}

function applyPlaybackContext(context) {
  state.index = Number(context.index || 0);
  state.playing = Boolean(context.playing);
  state.queue = clonePlaybackValue(context.queue || []);
  state.nextTracks = clonePlaybackValue(context.nextTracks || []);
  state.tempTrack = clonePlaybackValue(context.tempTrack || null);
  state.sessionPlaylist = clonePlaybackValue(context.sessionPlaylist || null);
  state.nextSessionPlaylist = clonePlaybackValue(context.nextSessionPlaylist || null);
  state.playbackMode = context.playbackMode || state.playbackMode || "sequence";
}

function rememberPlaybackContext(reason = "replace") {
  const context = playbackContextSnapshot(reason);
  state.nextPlaybackContext = null;
  if (hasPlaybackContext(context)) state.previousPlaybackContext = context;
}

function restorePreviousPlaybackContext() {
  const context = state.previousPlaybackContext;
  if (!hasPlaybackContext(context)) return false;
  const redoContext = playbackContextSnapshot("redo");
  if (hasPlaybackContext(redoContext)) state.nextPlaybackContext = redoContext;
  applyPlaybackContext(context);
  state.previousPlaybackContext = null;
  state.lastHostLine = "";
  return true;
}

function restoreNextPlaybackContext() {
  const context = state.nextPlaybackContext;
  if (!hasPlaybackContext(context)) return false;
  const undoContext = playbackContextSnapshot("undo");
  if (hasPlaybackContext(undoContext)) state.previousPlaybackContext = undoContext;
  applyPlaybackContext(context);
  state.nextPlaybackContext = null;
  state.lastHostLine = "";
  return true;
}

async function playbackSequence(limit = 600) {
  const playlist = await loadPlaylist();
  const activePlaylist = activePlaybackPlaylist(playlist);
  const current = activePlaybackPointer(playlist);
  const items = current.track ? [{ ...trackSequenceItem(current.track, current.index, "current"), label: "正在播放" }] : [];
  for (const track of filterPlaybackTracks(state.nextTracks || [])) {
    items.push({ ...trackSequenceItem(track, -1, "next"), label: "下一首播放" });
  }
  for (const index of state.queue || []) {
    const track = activePlaylist.tracks[Number(index)];
    if (track) items.push({ ...trackSequenceItem(track, Number(index), "queue"), label: "Chat 队列" });
  }
  for (const track of filterPlaybackTracks(state.nextSessionPlaylist?.tracks || [])) {
    items.push({ ...trackSequenceItem(track, -1, "chat"), label: state.nextSessionPlaylist?.name || "Chat 队列" });
  }
  if (activePlaylist.tracks.length && !state.nextTracks?.length && !state.queue?.length && !state.nextSessionPlaylist?.tracks?.length) {
    const start = (current.index + 1) % activePlaylist.tracks.length;
    for (let offset = 0; offset < Math.min(limit, activePlaylist.tracks.length - 1); offset += 1) {
      const index = (start + offset) % activePlaylist.tracks.length;
      items.push({ ...trackSequenceItem(activePlaylist.tracks[index], index, "library"), label: activePlaylist.playlist?.name || activePlaylist.name || "鎾斁鍒楄〃" });
    }
  }
  return {
    playbackMode: state.playbackMode,
    playlistName: current.playlistName,
    canUndoPlaylist: hasPlaybackContext(state.previousPlaybackContext),
    canRedoPlaylist: hasPlaybackContext(state.nextPlaybackContext),
    queuedCount: Math.max(0, items.length - 1),
    totalCount: items.length,
    items: items.slice(0, limit)
  };
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive"
    });
    clients.add(res);
    res.write(`data: ${JSON.stringify(await currentPayload())}\n\n`);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "GET" && pathname === "/api/now") return json(res, await currentPayload());
  if (req.method === "GET" && pathname === "/api/sequence") return json(res, await playbackSequence());
  if (req.method === "GET" && pathname === "/api/health") return json(res, {
    ok: true,
    version: APP_VERSION,
    port: PORT,
    hasClaudeKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY),
    hasDeepSeekKey: Boolean(process.env.DEEPSEEK_API_KEY),
    hasNeteaseCookie: Boolean(process.env.NETEASE_COOKIE),
    aiProvider: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
      ? "claude"
      : process.env.DEEPSEEK_API_KEY
        ? "deepseek"
        : process.env.OPENAI_API_KEY
          ? "openai-compatible"
          : "fallback",
    neteaseApiBase: process.env.NETEASE_API_BASE || "http://localhost:4000"
  });
  if (req.method === "GET" && pathname === "/api/taste") return json(res, await getTaste());
  if (req.method === "GET" && pathname === "/api/library") {
    const basePlaylist = await loadPlaylist();
    const playlist = activePlaybackPlaylist(basePlaylist);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const query = normalizeText(url.searchParams.get("q") || "");
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 80)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const indexed = playlist.tracks.map((track, index) => ({ track, index }));
    const filtered = query
      ? indexed.filter(({ track }) => trackText(track).includes(query) || compactText(trackText(track)).includes(compactText(query)))
      : indexed;
    return json(res, {
      trackCount: playlist.tracks.length,
      filteredCount: filtered.length,
      returned: filtered.slice(offset, offset + limit).length,
      offset,
      query,
      canUndoPlaylist: hasPlaybackContext(state.previousPlaybackContext),
      canRedoPlaylist: hasPlaybackContext(state.nextPlaybackContext),
      playlist: playlist.playlist || null,
      playlists: playlist.playlists || [],
      tracks: filtered.slice(offset, offset + limit).map(({ track, index }) => libraryTrackSummary(track, index)),
      source: playlist.source || "local"
    });
  }
  if (req.method === "GET" && pathname === "/api/local-playlist") {
    const playlist = await loadPlaylist();
    const tracks = playlist.tracks || [];
    return json(res, {
      source: {
        id: playlist.playlist?.id || NETEASE_LIBRARY_PLAYLIST_ID,
        name: "鎴戠殑鍠滄",
        cover: playlist.playlist?.cover || "",
        trackCount: tracks.length
      },
      returned: tracks.length,
      recommendations: tracks.map((track, index) => libraryTrackSummary(track, index))
    });
  }
  if (req.method === "POST" && pathname === "/api/use-local-playlist") {
    const playlist = await loadPlaylist();
    const tracks = playlist.tracks || [];
    rememberPlaybackContext("use-local-playlist");
    state.sessionPlaylist = null;
    state.nextSessionPlaylist = null;
    state.tempTrack = null;
    state.nextTracks = [];
    state.queue = [];
    state.index = tracks.length ? Math.min(Math.max(0, Number(state.index || 0)), tracks.length - 1) : 0;
    state.playing = false;
    state.lastHostLine = "";
    resetPlaybackPosition(tracks[state.index] || null);
    await broadcast();
    return json(res, await currentPayload());
  }
  if (req.method === "GET" && pathname === "/api/profile") {
    const playlist = await loadPlaylist();
    return json(res, {
      profile: profileFromPlaylist(playlist),
      memory: await getMemory()
    });
  }
  if (req.method === "GET" && pathname === "/api/desktop-lyrics") {
    return json(res, await currentDesktopLyrics());
  }
  if (req.method === "POST" && pathname === "/api/desktop-lyrics") {
    const body = await parseBody(req);
    latestDesktopLyrics = {
      title: String(body.title || "Claudio AI Radio").slice(0, 160),
      artist: String(body.artist || "").slice(0, 160),
      current: String(body.current || "No lyrics").slice(0, 500),
      translation: String(body.translation || "").slice(0, 500),
      next: String(body.next || "").slice(0, 500),
      playing: Boolean(state.playing),
      updatedAt: Date.now()
    };
    return json(res, { ok: true });
  }
  if (req.method === "POST" && pathname === "/api/desktop-lyrics/open") {
    return json(res, openDesktopLyricsOverlay());
  }
  if (req.method === "POST" && pathname === "/api/desktop-lyrics/close") {
    return json(res, closeDesktopLyricsOverlay());
  }
  if (req.method === "GET" && pathname === "/api/audio-quality") {
    return json(res, {
      level: AUDIO_QUALITY_LEVELS.has(state.audioQuality) ? state.audioQuality : DEFAULT_AUDIO_QUALITY,
      levels: [...AUDIO_QUALITY_LEVELS]
    });
  }
  if (req.method === "POST" && pathname === "/api/audio-quality") {
    const body = await parseBody(req);
    const level = String(body.level || "").trim();
    if (!AUDIO_QUALITY_LEVELS.has(level)) return json(res, { error: "invalid audio quality" }, 400);
    state.audioQuality = level;
    await savePlaybackState();
    return json(res, { ok: true, level });
  }
  if (req.method === "GET" && pathname === "/api/tasks") {
    return json(res, { tasks: await readHomeTasks() });
  }
  if (req.method === "POST" && pathname === "/api/tasks") {
    const body = await parseBody(req);
    return json(res, { tasks: await addHomeTask(body.text) });
  }
  if (req.method === "DELETE" && pathname === "/api/tasks") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, { tasks: await deleteHomeTask(url.searchParams.get("id") || body.id) });
  }
  if (req.method === "GET" && pathname === "/api/lyric") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, await getLyric(url.searchParams.get("id")));
  }
  if (req.method === "GET" && pathname === "/api/song-url") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, await getSongUrl(url.searchParams.get("id")));
  }
  if (req.method === "GET" && pathname === "/api/netease-memory-coordinate") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, await getNeteaseMemoryCoordinate(url.searchParams.get("id")));
  }
  if (req.method === "GET" && pathname === "/api/netease-search") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const query = String(url.searchParams.get("q") || "").trim();
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit") || 10)));
    const numericId = query.match(/^\d{4,}$/);
    const songs = numericId
      ? [{
        title: `缃戞槗浜戞瓕鏇?${query}`,
        artist: "鐐瑰嚮鍚庤鍙栨挱鏀惧湴鍧€",
        album: "SongID",
        cover: "",
        duration: 0,
        sourceId: query,
        source: "netease",
        external: true,
        score: 100
      }]
      : await searchNeteaseSongs(query, limit);
    return json(res, {
      query,
      returned: songs.length,
      recommendations: neteaseRecommendations(songs)
    });
  }
  if (req.method === "GET" && pathname === "/api/netease-artist-songs") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const artist = String(url.searchParams.get("artist") || "").trim();
    const id = String(url.searchParams.get("id") || "").trim();
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
    const songs = /^\d{2,}$/.test(id)
      ? await readNeteaseArtistSongs(base, id, limit)
      : await searchNeteaseArtistSongs(artist, limit);
    return json(res, {
      artist,
      id,
      returned: songs.length,
      recommendations: neteaseRecommendations(songs)
    });
  }

  if (req.method === "GET" && pathname === "/api/netease-dynamic") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const source = url.searchParams.get("source") === "personal_fm" ? "personal_fm" : "daily";
    const item = await readNeteaseDynamicSource(source);
    return json(res, {
      source: item.source,
      returned: item.tracks.length,
      recommendations: neteaseRecommendations(item.tracks.map((track) => ({
        title: track.title,
        artist: track.artist,
        artistId: track.artistId || "",
        artistIds: track.artistIds || [],
        album: track.album,
        albumId: track.albumId || "",
        cover: track.cover,
        duration: track.duration,
        sourceId: track.sourceId,
        source: "netease",
        external: true,
        score: 0
      })))
    });
  }
  if (req.method === "GET" && pathname === "/api/netease-source-cards") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ids = String(url.searchParams.get("ids") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return json(res, await readNeteaseSourceCards(ids));
  }
  if (req.method === "POST" && pathname === "/api/netease-source-cards") {
    try {
      await addUserNeteasePlaylistId(body.id || body.playlistId);
      return json(res, await readNeteaseSourceCards());
    } catch (error) {
      return json(res, { error: error.message || "invalid playlist id" }, 400);
    }
  }
  if (req.method === "DELETE" && pathname === "/api/netease-source-cards") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      await removeUserNeteasePlaylistId(url.searchParams.get("id") || body.id || body.playlistId);
      return json(res, await readNeteaseSourceCards());
    } catch (error) {
      return json(res, { error: error.message || "invalid playlist id" }, 400);
    }
  }
  if (req.method === "GET" && pathname === "/api/netease-playlist") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!/^\d{4,}$/.test(id)) return json(res, { error: "invalid playlist id" }, 400);
    const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
    const fallbackName = NETEASE_PLAYLIST_NAMES[id] || `Playlist ${id}`;
    const item = await readNeteasePlaylistTracks(base, { id, name: fallbackName });
    item.source.name = NETEASE_PLAYLIST_NAMES[id] || item.source.name || fallbackName;
    return json(res, {
      source: item.source,
      returned: item.tracks.length,
      recommendations: neteaseRecommendations(item.tracks.map((track) => ({
        title: track.title,
        artist: track.artist,
        artistId: track.artistId || "",
        artistIds: track.artistIds || [],
        album: track.album,
        albumId: track.albumId || "",
        cover: track.cover,
        duration: track.duration,
        sourceId: track.sourceId,
        source: "netease",
        external: true,
        score: 0
      })))
    });
  }
  if (req.method === "GET" && pathname === "/api/netease-album") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = String(url.searchParams.get("id") || "").trim();
    const songId = String(url.searchParams.get("songId") || "").trim();
    if (!/^\d{4,}$/.test(id) && !/^\d{4,}$/.test(songId)) return json(res, { error: "invalid album id" }, 400);
    const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
    const item = id ? await readNeteaseAlbumTracks(base, id) : await readNeteaseAlbumTracksForSong(base, songId);
    return json(res, {
      source: item.source,
      returned: item.tracks.length,
      recommendations: neteaseRecommendations(item.tracks.map((track) => ({
        title: track.title,
        artist: track.artist,
        artistId: track.artistId || "",
        artistIds: track.artistIds || [],
        album: track.album,
        albumId: track.albumId || item.source?.id || id,
        cover: track.cover,
        duration: track.duration,
        sourceId: track.sourceId,
        source: "netease",
        external: true,
        score: 0
      })))
    });
  }
  if (req.method === "POST" && pathname === "/api/netease-like") {
    const body = await parseBody(req);
    const result = await likeNeteaseSong(body.id || body.sourceId, body.like !== false);
    return json(res, { ok: true, result });
  }
  if (req.method === "GET" && pathname === "/api/netease-favorite-playlists") {
    return json(res, { playlists: await readNeteaseFavoritePlaylistCards() });
  }
  if (req.method === "POST" && pathname === "/api/netease-playlist-add") {
    const body = await parseBody(req);
    const result = await addNeteaseSongToPlaylist(body.id || body.sourceId, body.playlistId || body.pid);
    await broadcast();
    return json(res, { ok: true, result });
  }
  if (req.method === "POST" && pathname === "/api/netease-playlist-desc-update") {
    const body = await parseBody(req);
    const result = await updateNeteasePlaylistDescription(body.id || body.playlistId || body.pid, body.description || body.desc || "");
    await broadcast();
    return json(res, { ok: true, result });
  }
  if (req.method === "GET" && pathname === "/api/netease-like-check") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ids = url.searchParams.get("ids");
    if (ids) {
      const values = ids.split(",").map((item) => item.trim()).filter(Boolean);
      return json(res, { liked: await checkNeteaseSongLikes(values) });
    }
    const id = url.searchParams.get("id");
    const liked = await checkNeteaseSongLike(id);
    return json(res, { liked, id });
  }
  if (req.method === "POST" && pathname === "/api/netease-import-dynamic") {
    const body = await parseBody(req);
    const requested = Array.isArray(body.sources) ? body.sources : ["daily", "personal_fm"];
    const allowed = new Set(["daily", "personal_fm"]);
    const sources = requested.filter((item) => allowed.has(item));
    if (!sources.length) return json(res, { error: "no valid sources" }, 400);
    const result = await importNeteaseDynamicSources(sources);
    await broadcast();
    return json(res, result);
  }

  if (req.method === "POST" && pathname === "/api/weather/location") {
    const body = await parseBody(req);
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(res, { error: "invalid location" }, 400);
    state.weatherLocation = {
      lat: lat.toFixed(5),
      lon: lon.toFixed(5),
      label: String(body.label || "褰撳墠浣嶇疆").slice(0, 40)
    };
    weatherCache = null;
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/state") {
    const body = await parseBody(req);
    const originalKeys = Object.keys(body);
    if (Object.prototype.hasOwnProperty.call(body, "positionSeconds")) {
      const playlist = await loadPlaylist();
      const activePlaylist = activePlaybackPlaylist(playlist);
      const activeIndex = activePlaylist.tracks.length ? state.index % activePlaylist.tracks.length : 0;
      const activeTrack = state.tempTrack || activePlaylist.tracks[activeIndex] || null;
      const key = String(body.positionTrackKey || positionTrackKey(activeTrack));
      if (!activeTrack || key === positionTrackKey(activeTrack)) {
        state.positionSeconds = Math.max(0, Number(body.positionSeconds || 0));
        state.positionTrackKey = key;
        state.positionUpdatedAt = new Date().toISOString();
      }
      delete body.positionSeconds;
      delete body.positionTrackKey;
    }
    const onlyPositionUpdate = originalKeys.length > 0 && Object.keys(body).length === 0;
    if (onlyPositionUpdate) {
      await savePlaybackState();
      return json(res, await currentPayload());
    }
    state = { ...state, ...body };
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "GET" && pathname === "/api/next") {
    const playlist = await loadPlaylist();
    pushPlayStack(activePlaybackPointer(playlist));
    const activePlaylist = activePlaybackPlaylist(playlist);
    state.nextTracks = filterPlaybackTracks(state.nextTracks || []);
    if (state.nextTracks?.length) {
      state.tempTrack = state.nextTracks.shift();
      state.lastHostLine = "";
      resetPlaybackPosition(state.tempTrack);
      fillTempHostLineAsync(state.tempTrack);
      await broadcast();
      return json(res, await currentPayload());
    }
    state.tempTrack = null;
    if (!activePlaylist.tracks.length) {
      state.playing = false;
      state.index = 0;
      state.lastHostLine = "";
      await broadcast();
      return json(res, await currentPayload());
    }
    state.index = await chooseNextIndex(activePlaylist);
    const track = activePlaylist.tracks[state.index];
    state.lastHostLine = "";
    resetPlaybackPosition(track);
    fillHostLineAsync(state.index);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "GET" && pathname === "/api/previous") {
    const playlist = await loadPlaylist();
    const previous = state.playStack?.pop();
    if (previous?.track) {
      if (previous.source === "temp") {
        state.tempTrack = previous.track;
      } else {
        if (previous.sessionId && state.sessionPlaylist?.id !== previous.sessionId) {
          state.sessionPlaylist = {
            id: previous.sessionId,
            name: previous.playlistName || "NetEase Queue",
            tracks: state.sessionPlaylist?.tracks || [previous.track]
          };
        } else if (!previous.sessionId) {
          state.sessionPlaylist = null;
          state.nextSessionPlaylist = null;
        }
        state.tempTrack = null;
        state.index = Number.isInteger(previous.index) ? previous.index : state.index;
      }
      state.playing = true;
      state.lastHostLine = "";
      resetPlaybackPosition(previous.source === "temp" ? state.tempTrack : previous.track);
      previous.source === "temp" ? fillTempHostLineAsync(state.tempTrack) : fillHostLineAsync(state.index);
      await broadcast();
      return json(res, await currentPayload());
    }
    const activePlaylist = activePlaybackPlaylist(playlist);
    if (!activePlaylist.tracks.length) {
      state.tempTrack = null;
      state.playing = false;
      state.index = 0;
      state.lastHostLine = "";
      await broadcast();
      return json(res, await currentPayload());
    }
    state.tempTrack = null;
    state.index = await choosePreviousIndex(activePlaylist);
    state.lastHostLine = "";
    resetPlaybackPosition(activePlaylist.tracks[state.index]);
    fillHostLineAsync(state.index);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/playlist-undo") {
    if (!restorePreviousPlaybackContext()) return json(res, { error: "no playlist snapshot" }, 400);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/playlist-redo") {
    if (!restoreNextPlaybackContext()) return json(res, { error: "no playlist redo snapshot" }, 400);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/play-batch") {
    const body = await parseBody(req);
    const playlist = await loadPlaylist();
    const tracks = (Array.isArray(body.tracks) ? body.tracks : [])
      .map((track) => externalNeteaseTrack(track))
      .filter((track) => track.sourceId && !isBlockedForPlayback(track));
    if (!tracks.length) return json(res, { error: "empty playlist" }, 400);
    pushCurrentIfChanging(playlist, tracks[0]);
    rememberPlaybackContext(`play-batch:${String(body.name || "NetEase Queue").slice(0, 80)}`);
    state.sessionPlaylist = {
      id: String(body.id || "netease-session"),
      name: String(body.name || "NetEase Queue").slice(0, 80),
      tracks
    };
    state.tempTrack = null;
    state.nextTracks = [];
    state.index = 0;
    state.playing = true;
    state.lastHostLine = "";
    resetPlaybackPosition(tracks[0]);
    fillHostLineAsync(state.index);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/append-batch") {
    const body = await parseBody(req);
    const tracks = (Array.isArray(body.tracks) ? body.tracks : [])
      .map((track) => externalNeteaseTrack(track))
      .filter((track) => track.sourceId && !isBlockedForPlayback(track));
    if (!tracks.length) return json(res, { error: "empty playlist" }, 400);
    const name = String(body.name || "杩藉姞姝屽崟").slice(0, 80);
    const dedupe = (items) => {
      const seen = new Set();
      return items.filter((track) => {
        const key = String(track.sourceId || track.id || `${track.title}:${track.artist}`);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    if (state.sessionPlaylist?.tracks?.length) {
      state.sessionPlaylist = {
        ...state.sessionPlaylist,
        name: `${state.sessionPlaylist.name || "NetEase Queue"} + ${name}`.slice(0, 80),
        tracks: dedupe([...(state.sessionPlaylist.tracks || []), ...tracks])
      };
    } else if (state.nextSessionPlaylist?.tracks?.length) {
      state.nextSessionPlaylist = {
        ...state.nextSessionPlaylist,
        name: `${state.nextSessionPlaylist.name || "鍚庣画姝屽崟"} + ${name}`.slice(0, 80),
        tracks: dedupe([...(state.nextSessionPlaylist.tracks || []), ...tracks])
      };
    } else {
      state.nextSessionPlaylist = {
        id: `append-${Date.now()}`,
        name,
        tracks
      };
    }
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/queue-next") {
    const body = await parseBody(req);
    const track = externalNeteaseTrack(body.track || body);
    if (!track.sourceId) return json(res, { error: "missing song id" }, 400);
    if (isBlockedForPlayback(track)) return json(res, { error: "blocked track type" }, 400);
    state.nextTracks ||= [];
    const duplicateIndex = state.nextTracks.findIndex((item) => String(item.sourceId || item.id) === String(track.sourceId));
    if (duplicateIndex >= 0) state.nextTracks.splice(duplicateIndex, 1);
    state.nextTracks.push(track);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/play") {
    const body = await parseBody(req);
    const playlist = await loadPlaylist();
    if (body.track?.sourceId || body.sourceId) {
      const track = body.track || {};
      const sourceId = String(track.sourceId || body.sourceId || "").trim();
      if (isBlockedForPlayback(track)) return json(res, { error: "blocked track type" }, 400);
      const sessionIndex = state.sessionPlaylist?.tracks?.findIndex((item) => String(item.sourceId || item.id) === sourceId) ?? -1;
      if (sessionIndex >= 0) {
        pushCurrentIfChanging(playlist, state.sessionPlaylist.tracks[sessionIndex]);
        state.tempTrack = null;
        state.index = sessionIndex;
        state.playing = true;
        state.lastHostLine = "";
        resetPlaybackPosition(state.sessionPlaylist.tracks[sessionIndex]);
        warmSongUrl(sourceId);
        fillHostLineAsync(state.index);
        await broadcast();
        return json(res, await currentPayload());
      }
      state.tempTrack = externalNeteaseTrack({
        ...body,
        ...track,
        sourceId
      });
      pushCurrentIfChanging(playlist, state.tempTrack);
      state.nextTracks = filterPlaybackTracks(state.nextTracks || [])
        .filter((item) => String(item.sourceId || item.id) !== sourceId);
      state.playing = true;
      state.lastHostLine = "";
      resetPlaybackPosition(state.tempTrack);
      warmSongUrl(sourceId);
      fillTempHostLineAsync(state.tempTrack);
      await broadcast();
      return json(res, await currentPayload());
    }
    const index = Number(body.index);
    const activePlaylist = activePlaybackPlaylist(playlist);
    if (!Number.isInteger(index) || index < 0 || index >= activePlaylist.tracks.length) {
      return json(res, { error: "invalid track index" }, 400);
    }
    const selectedTrack = activePlaylist.tracks[index];
    if (isBlockedForPlayback(selectedTrack)) return json(res, { error: "blocked track type" }, 400);
    pushCurrentIfChanging(playlist, selectedTrack);
    state.tempTrack = null;
    if (activePlaylist.source !== "netease-session") {
      state.sessionPlaylist = null;
      state.nextSessionPlaylist = null;
    }
    state.nextTracks = [];
    state.index = index;
    state.playing = true;
    state.lastHostLine = "";
    resetPlaybackPosition(selectedTrack);
    warmSongUrl(selectedTrack?.sourceId || selectedTrack?.id);
    fillHostLineAsync(state.index);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/history/")) {
    const id = decodeURIComponent(pathname.split("/").pop());
    const indexMatch = id.match(/^index-(\d+)$/);
    if (indexMatch) {
      const index = Number(indexMatch[1]);
      state.history = state.history.filter((_, itemIndex) => itemIndex !== index);
    } else {
      state.history = state.history.filter((item) => item.id !== id);
    }
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    const body = await parseBody(req);
    const payload = await currentPayload();
    const playlist = await loadPlaylist();
    const taste = await getTaste();
    const weather = payload.weather;
    const prompt = String(body.message || "").slice(0, 1000);
    const memory = await rememberChat(prompt);
    const chatMayChangePlayback = wantsPlaybackAction(prompt) || wantsImmediateSwitch(prompt) || wantsMusicContinuation(prompt);
    if (chatMayChangePlayback) rememberPlaybackContext("chat");
    if (pendingTitleIsFresh(memory) && wantsPendingTitlePlayback(prompt)) {
      return json(res, await playTitleImmediately(memory.pendingTitle, playlist, memory));
    }
    const requestedTitle = extractRequestedTitle(prompt);
    if (requestedTitle && !looksLikeStyleRequest(prompt)) {
      await rememberPendingTitle(memory, requestedTitle);
      if (wantsPlaybackAction(prompt)) {
        return json(res, await playTitleImmediately(requestedTitle, playlist, memory));
      }
    }
    if (process.env.DEEPSEEK_API_KEY) {
      let dsIntent = deterministicStyleIntent(prompt, memory) || await dsMusicIntent(prompt, memory, payload);
      const stylePlaybackRequest = looksLikeStyleRequest(prompt) && wantsPlaybackAction(prompt);
      if (stylePlaybackRequest && (!dsIntent || dsIntent.confidence < 0.55)) {
        dsIntent = {
          intent: "recommend_style",
          title: "",
          artist: "",
          style: semanticStyleQuery(prompt),
          autoplay: wantsPlaybackAction(prompt),
          reply: "",
          confidence: 0.92
        };
      }
      const dsHandled = await handleDsMusicIntent(dsIntent, { prompt, playlist, payload, memory, taste, weather });
      if (dsHandled) return json(res, await finalizeDeepSeekChatResponse(dsHandled, { prompt, intent: dsIntent, payload, memory }));
      return json(res, {
        reply: await answerDeepSeekChat(prompt, payload, memory, taste, weather, dsIntent),
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const ordinalPlayback = extractOrdinalPlayback(prompt);
    if (ordinalPlayback) {
      const index = ordinalPlayback - 1;
      if (index < 0 || index >= playlist.tracks.length) {
        return json(res, {
          reply: `当前歌单现在一共 ${playlist.tracks.length} 首，没有第 ${ordinalPlayback} 首。`,
          recommendations: [],
          queued: false,
          queuePreview: [],
          memory
        });
      }
      state.index = index;
      state.playing = true;
      state.lastHostLine = "";
      fillHostLineAsync(state.index);
      await broadcast();
      return json(res, {
        reply: `已切到第 ${ordinalPlayback} 首：${playlist.tracks[index].title} - ${playlist.tracks[index].artist}。`,
        recommendations: [toRecommendation(playlist, index, 100)],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    if (wantsRandomPlayback(prompt)) {
      let index = Math.floor(Math.random() * playlist.tracks.length);
      if (playlist.tracks.length > 1 && index === state.index % playlist.tracks.length) {
        index = (index + 1) % playlist.tracks.length;
      }
      state.index = index;
      state.playing = true;
      state.lastHostLine = "";
      fillHostLineAsync(state.index);
      await broadcast();
      return json(res, {
        reply: `随机切到：${playlist.tracks[index].title} - ${playlist.tracks[index].artist}。`,
        recommendations: [toRecommendation(playlist, index, 100)],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    if (wantsLibraryList(prompt)) {
      const start = Math.max(0, state.index % playlist.tracks.length);
      const indexes = Array.from({ length: Math.min(20, playlist.tracks.length) }, (_, offset) => (start + offset) % playlist.tracks.length);
      return json(res, {
        reply: `先从当前播放位置往后列 ${indexes.length} 首。你也可以说“播放第1000首”，我会直接跳过去。`,
        recommendations: indexes.map((index) => toRecommendation(playlist, index, 0)),
        queued: false,
        queuePreview: [],
        memory
      });
    }
    if (wantsNoAccompaniment(prompt)) {
      const matches = findNoAccompanimentMatches(playlist, 12);
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? '我按无伴奏/清唱/a cappella 在你的歌单里找，只列标题、专辑或标签里有明确线索的歌；这种需求不能靠普通推荐硬猜。'
          : '我按清唱 / 无伴奏 / a cappella / vocal only 全局搜了当前歌单，没找到足够可靠的标注。这个条件不能靠歌名硬猜，否则很容易推荐错。',
        recommendations: matches.map((item) => ({
          index: item.index,
          title: item.track.title,
          artist: item.track.artist,
          album: item.track.album || "",
          sourceId: item.track.sourceId || item.track.id || "",
          score: item.score
        })),
        queued: false,
        queuePreview: [],
        memory
      });
    }
    if (queryStyleFlags(prompt).noIntro) {
      const matches = await findNoIntroMatches(playlist, prompt, 8);
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? '我按开口快重新筛了一遍：优先查第一句歌词出现得早的歌，并排除了明显 intro / 纯音乐 / OST。'
          : '这次没筛到足够稳定的开口快歌曲；当前歌单信息里没有前奏长度字段，我不想硬凑。',
        recommendations: matches.map((item) => ({
          index: item.index,
          title: item.track.title,
          artist: item.track.artist,
          album: item.track.album || "",
          sourceId: item.track.sourceId || item.track.id || "",
          score: item.score
        })),
        queued: false,
        queuePreview: [],
        memory
      });
    }
    if (referencesRecentRecommendations(prompt)) {
      const matches = findRecentRecommendationMatches(playlist, prompt, memory, 8);
      if (matches.length) {
        await rememberRecommendations(memory, matches);
        return json(res, {
          reply: `我按刚才那批推荐重新找了一下，匹配到 ${matches.length} 首。`,
          recommendations: matches.map((item) => ({
            index: item.index,
            title: item.track.title,
            artist: item.track.artist,
            album: item.track.album || "",
            sourceId: item.track.sourceId || item.track.id || "",
            score: item.score
          })),
          queued: false,
          queuePreview: [],
          memory
        });
      }
    }
    if (wantsAddLastRecommendations(prompt)) {
      const indexes = (memory.lastRecommendations || [])
        .map(Number)
        .filter((index) => Number.isInteger(index) && index >= 0 && index < playlist.tracks.length && index !== state.index % playlist.tracks.length);
      if (!indexes.length) {
        return json(res, {
          reply: "我这里没有可接上的上一批候选。你先搜一组歌，我会记住那组结果，然后你说全部加入列表就能接上。",
          recommendations: [],
          queued: false,
          queuePreview: [],
          memory
        });
      }
      state.queue = indexes;
      await broadcast();
      return json(res, {
        reply: "已把刚才这 " + indexes.length + " 首加到后续播放列表。",
        recommendations: indexes.slice(0, 12).map((index) => ({
          index,
          title: playlist.tracks[index].title,
          artist: playlist.tracks[index].artist,
          album: playlist.tracks[index].album || "",
          sourceId: playlist.tracks[index].sourceId || playlist.tracks[index].id || "",
          score: 0
        })),
        queued: true,
        queuePreview: indexes.slice(0, 12).map((index) => ({
          index,
          title: playlist.tracks[index].title,
          artist: playlist.tracks[index].artist,
          album: playlist.tracks[index].album || ""
        })),
        memory
      });
    }
    if (wantsPlaybackLogicAnswer(prompt)) {
      return json(res, {
        reply: playbackLogicReply(playlist, payload),
        recommendations: [],
        queued: false,
        queuePreview: state.queue.slice(0, 12).map((index) => ({
          index,
          title: playlist.tracks[index]?.title || "",
          artist: playlist.tracks[index]?.artist || "",
          album: playlist.tracks[index]?.album || ""
        })).filter((item) => item.title),
        memory
      });
    }
    if (wantsCurrentTrackAnswer(prompt)) {
      return json(res, {
        reply: await answerCurrentTrackQuestion(prompt, payload, memory),
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    if (isSongCountQuestion(prompt)) {
      const matches = findTitleMatches(playlist, prompt, 20);
      const query = cleanQuery(prompt);
      const recommendations = matches.slice(0, 8).map((item) => ({
        index: item.index,
        title: item.track.title,
        artist: item.track.artist,
        album: item.track.album || "",
        sourceId: item.track.sourceId || item.track.id || "",
        score: item.score
      }));
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? `我在你的歌单里找到 ${matches.length} 首标题接近“${query}”的歌，先把最像的放出来。`
          : `我按“${query}”查了歌名，你的歌单里暂时没有特别稳定的同名结果。`,
        recommendations,
        memory
      });
    }
    if (wantsFuzzyTitleSearch(prompt)) {
      const matches = findFuzzyTitleMatches(playlist, prompt, 24);
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? `我按你记得的歌名做了模糊检索，找到 ${matches.length} 个可能版本；先把相近的列出来。`
          : `我按“${likelyTitleQuery(prompt)}”做了模糊检索，你的歌单里暂时没找到足够像的版本。`,
        recommendations: matches.map((item) => ({
          index: item.index,
          title: item.track.title,
          artist: item.track.artist,
          album: item.track.album || "",
          sourceId: item.track.sourceId || item.track.id || "",
          score: item.score
        })),
        queued: false,
        queuePreview: [],
        memory
      });
    }
    if (isCountQuestion(prompt)) {
      return json(res, {
        reply: `你现在导入了 ${playlist.tracks.length} 首歌。`,
        recommendations: [],
        memory
      });
    }

    if (isPlainQuestion(prompt)) {
      return json(res, {
        reply: await answerNormalChat(prompt, payload, memory, taste, weather),
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }

    const artistNameFragment = extractArtistNameFragment(prompt);
    if (artistNameFragment) {
      const artists = findArtistsByNameFragment(playlist, artistNameFragment, 24);
      return json(res, {
        reply: artists.length
          ? `名字里带“${artistNameFragment}”的歌手我找到 ${artists.length} 个：${artists.map((artist) => `${artist.name}（${artist.count}首）`).join("、")}。`
          : `你的歌单里暂时没找到名字带“${artistNameFragment}”的歌手。`,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }

    const aliasDefinition = normalizeText(prompt).match(/^(?:记住|以后|下次|以后把|下次把)?\s*(.{1,16}?)(?:就是|指的是|当成|按)\s*(.{1,30})$/);
    if (aliasDefinition) {
      if (isPlainQuestion(prompt) || !/(记住|以后|下次|就是|指的是|当成|按)/.test(normalizeText(prompt))) {
        return json(res, {
          reply: await answerNormalChat(prompt, payload, memory, taste, weather),
          recommendations: [],
          queued: false,
          queuePreview: [],
          memory
        });
      }
      const alias = cleanQuery(aliasDefinition[1]);
      const artistName = cleanQuery(aliasDefinition[2]);
      const matches = findArtistMatches(playlist, `我要听${artistName}的歌`, memory);
      await rememberArtistAlias(memory, alias, artistName);
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? `记住了，“${alias}”我以后按 ${artistName} 找。你的歌单里有 ${matches.length} 首，下面先列出来。`
          : `记住了，“${alias}”我以后按 ${artistName} 理解。不过现在你的歌单里还没找到这个名字。`,
        recommendations: matches.slice(0, 12).map((item) => ({
          index: item.index,
          title: item.track.title,
          artist: item.track.artist,
          album: item.track.album || "",
          sourceId: item.track.sourceId || item.track.id || "",
          score: item.score
        })),
        queued: false,
        queuePreview: [],
        memory
      });
    }

    if (memory.pendingArtistAlias && looksLikeBareArtistName(prompt) && !isPlainQuestion(prompt)) {
      const artistName = cleanQuery(prompt);
      const pendingAlias = memory.pendingArtistAlias;
      const pendingIntent = memory.pendingArtistIntent;
      await rememberArtistAlias(memory, pendingAlias, artistName);
      const continuationPrompt = `我要听${artistName}的歌`;
      const matches = findArtistMatches(playlist, continuationPrompt, memory);
      const queuedIndexes = pendingIntent === "play"
        ? matches.map((item) => item.index).filter((index) => index !== state.index % playlist.tracks.length)
        : [];
      if (queuedIndexes.length) state.queue = queuedIndexes;
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? queuedIndexes.length
            ? `明白了，“${pendingAlias}”就是 ${artistName}。我把你的歌单里 ${matches.length} 首都排到后面了。`
            : `明白了，“${pendingAlias}”就是 ${artistName}。你的歌单里找到 ${matches.length} 首，下面这些可以点播放。`
          : `明白了，“${pendingAlias}”就是 ${artistName}。不过你的歌单里暂时没找到这个名字。`,
        recommendations: matches.slice(0, 12).map((item) => ({
          index: item.index,
          title: item.track.title,
          artist: item.track.artist,
          album: item.track.album || "",
          sourceId: item.track.sourceId || item.track.id || "",
          score: item.score
        })),
        queued: queuedIndexes.length > 0,
        queuePreview: queuedIndexes.slice(0, 12).map((index) => ({
          index,
          title: playlist.tracks[index].title,
          artist: playlist.tracks[index].artist,
          album: playlist.tracks[index].album || ""
        })),
        memory
      });
    }

    if (wantsMusicSearch(prompt) && looksLikeBareArtistName(prompt)) {
      const bareArtistMatches = findArtistMatches(playlist, `我要听${prompt}的歌`, memory);
      if (bareArtistMatches.length) {
        await rememberRecommendations(memory, bareArtistMatches);
        return json(res, {
          reply: `你的歌单里有 ${bareArtistMatches.length} 首 ${cleanQuery(prompt)}，下面这些可以点播放。`,
          recommendations: bareArtistMatches.slice(0, 12).map((item) => ({
            index: item.index,
            title: item.track.title,
            artist: item.track.artist,
            album: item.track.album || "",
            sourceId: item.track.sourceId || item.track.id || "",
            score: item.score
          })),
          queued: false,
          queuePreview: [],
          memory
        });
      }
    }

    if (!wantsMusicSearch(prompt)) {
      return json(res, {
        reply: await answerNormalChat(prompt, payload, memory, taste, weather),
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }

    const dsIntent = await dsMusicIntent(prompt, memory, payload);
    const dsHandled = await handleDsMusicIntent(dsIntent, { prompt, playlist, payload, memory, taste, weather });
    if (dsHandled) return json(res, await finalizeDeepSeekChatResponse(dsHandled, { prompt, intent: dsIntent, payload, memory }));

    const requestedArtistPlayback = await handleRequestedArtistPlayback(prompt, playlist, memory);
    if (requestedArtistPlayback) return json(res, requestedArtistPlayback);

    const directTitleQuery = looksLikeDirectTitlePlayback(prompt) ? extractDirectTitleQuery(prompt) : "";
    if (directTitleQuery) {
      const matches = findTitleMatches(playlist, directTitleQuery, 12);
      await rememberRecommendations(memory, matches);
      const queuedIndexes = matches
        .map((item) => item.index)
        .filter((index) => index !== state.index % playlist.tracks.length);
      if (queuedIndexes.length) state.queue = queuedIndexes;
      const netease = matches.length ? [] : await searchNeteaseSongs(directTitleQuery, 8);
      return json(res, {
        reply: matches.length
          ? queuedIndexes.length === 1
            ? `找到了《${matches[0].track.title}》，已排到当前歌曲后面。`
            : `找到 ${matches.length} 个和《${directTitleQuery}》匹配的版本，已按匹配度排到当前歌曲后面。`
          : netease.length
            ? `你的歌单里没有《${directTitleQuery}》，又去网易云搜到了 ${netease.length} 个候选；点卡片可以临时播放。`
            : `我搜了你的歌单和网易云，都没找到《${directTitleQuery}》。`,
        recommendations: matches.length ? matches.map(recommendationFromMatch) : neteaseRecommendations(netease),
        queued: queuedIndexes.length > 0,
        queuePreview: queuedIndexes.slice(0, 12).map((index) => ({
          index,
          title: playlist.tracks[index].title,
          artist: playlist.tracks[index].artist,
          album: playlist.tracks[index].album || ""
        })),
        memory
      });
    }

    const shouldTryTitleSearch = wantsSpecificSongPlayback(prompt)
      || expandedQueryAliases(cleanQuery(prompt)).length > 0
      || /妫€绱鎼滅储|鎼渱鏌鏌ヨ/.test(normalizeText(prompt));
    const titleMatches = shouldTryTitleSearch ? findTitleMatches(playlist, prompt, 12) : [];
    const rememberedAliasTargets = userAliasTargetsForQuery(prompt, memory);
    const artistMatches = titleMatches.length
      ? []
      : rememberedAliasTargets.length
        ? findArtistMatches(playlist, `我要听${rememberedAliasTargets[0]}的歌`, memory)
        : findArtistMatches(playlist, prompt, memory);
    const explicitArtistMode = artistMatches.length > 0;
    const explicitTitleMode = titleMatches.length > 0;
    if (!explicitTitleMode && wantsCurrentArtistQueue(prompt)) {
      const currentArtist = payload.track.artist || "";
      const matches = currentArtist
        ? findArtistMatches(playlist, `我要听${currentArtist}的歌`, memory)
            .filter((item) => item.index !== state.index % playlist.tracks.length)
        : [];
      await rememberRecommendations(memory, matches);
      const queuedIndexes = matches.map((item) => item.index);
      if (queuedIndexes.length) state.queue = queuedIndexes;
      return json(res, {
        reply: matches.length
          ? `我理解“该歌手”指的是 ${currentArtist}。你的歌单里找到 ${matches.length} 首其他作品，已排到当前歌曲后面。`
          : currentArtist
            ? `我理解“该歌手”指的是 ${currentArtist}，但你的歌单里暂时没找到除当前这首以外的其他作品。`
            : "我没拿到当前歌手信息，所以这次不能可靠地按“该歌手”排歌。",
        recommendations: matches.slice(0, 12).map(recommendationFromMatch),
        queued: queuedIndexes.length > 0,
        queuePreview: queuedIndexes.slice(0, 12).map((index) => ({
          index,
          title: playlist.tracks[index].title,
          artist: playlist.tracks[index].artist,
          album: playlist.tracks[index].album || ""
        })),
        memory
      });
    }
    if (!explicitTitleMode && !explicitArtistMode && wantsSimilarStyleQueue(prompt)) {
      const matches = findSimilarStyleMatches(playlist, prompt, payload.track, 12);
      await rememberRecommendations(memory, matches);
      const queuedIndexes = matches.map((item) => item.index).filter((index) => index !== state.index % playlist.tracks.length);
      if (queuedIndexes.length) state.queue = queuedIndexes;
      return json(res, {
        reply: matches.length
          ? `我按当前这首的气质和你说的“慢节奏/类似”排了 ${queuedIndexes.length} 首，播完当前这首会接上。`
          : "我按当前这首的气质和“慢节奏/类似”筛了一遍，但你的歌单里没有足够稳的候选，所以先不硬排。",
        recommendations: matches.map(recommendationFromMatch),
        queued: queuedIndexes.length > 0,
        queuePreview: queuedIndexes.slice(0, 12).map((index) => ({
          index,
          title: playlist.tracks[index].title,
          artist: playlist.tracks[index].artist,
          album: playlist.tracks[index].album || ""
        })),
        memory
      });
    }
    const likelyUnknownArtistRequest = !explicitTitleMode
      && !explicitArtistMode
      && !looksLikeStyleRequest(prompt)
      && /(听|播放|找|搜|搜索|推荐|查)/.test(normalizeText(prompt))
      && /(?:的歌|歌手|歌曲|音乐)/.test(normalizeText(prompt))
      && compactText(cleanQuery(prompt)).length <= 16;
    if (!explicitArtistMode && (looksLikeSpecificArtistRequest(prompt) || likelyUnknownArtistRequest)) {
      const query = cleanQuery(prompt) || prompt;
      memory.pendingArtistAlias = query;
      memory.pendingArtistIntent = wantsChatAutoplay(prompt) ? "play" : "search";
      await writeJson("memory.json", memory);
      return json(res, {
        reply: `我不确定“${query}”具体指哪位歌手，所以先不乱排歌。你告诉我完整歌手名，或者说“这个就是 XXX”，我再按这个名字找。`,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const searchPrompt = explicitArtistMode ? prompt : contextualPrompt(prompt, memory);
    const rawRecommendations = explicitTitleMode ? titleMatches : explicitArtistMode ? artistMatches : searchTracks(playlist, searchPrompt, 12);
    if (needsMusicClarification(searchPrompt, rawRecommendations)) {
      const query = cleanQuery(prompt) || prompt;
      if (/(?:的歌|歌手|歌曲|音乐)/.test(normalizeText(prompt)) && compactText(query).length <= 16) {
        memory.pendingArtistAlias = query;
        memory.pendingArtistIntent = wantsChatAutoplay(prompt) ? "play" : "search";
        await writeJson("memory.json", memory);
      }
      return json(res, {
        reply: `我不太确定你说的“${query}”具体指什么，所以先不乱排歌。你是指某个歌手、某首歌，还是一种风格？`,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const recommendations = confidentMatches(rawRecommendations);
    await rememberRecommendations(memory, recommendations);
    const queuedIndexes = wantsChatAutoplay(prompt)
      ? recommendations
        .map((item) => item.index)
        .filter((index) => index !== state.index % playlist.tracks.length)
        .slice(0, (explicitArtistMode || explicitTitleMode) ? recommendations.length : 12)
      : [];
    if (queuedIndexes.length) {
      state.queue = queuedIndexes;
    }
    const albumMode = /专辑|album/i.test(prompt);
    const recommendationText = recommendations.length
      ? recommendations.map((item, itemIndex) => `${itemIndex + 1}. ${item.track.title} - ${item.track.artist}${item.track.album ? `《${item.track.album}》` : ""}`).join("\n")
      : "";
    const fallback = recommendations.length
      ? recommendations.length === 1
        ? `有，就这一首最稳：${recommendations[0].track.title}。`
        : albumMode
          ? `有，我先按专辑名把最贴近的几首挑出来。`
          : `有，先从这几首里挑。`
      : `我没抓到足够稳的候选，所以先不排歌。你可以再给我一个歌手、语言、年代、情绪，或者说“按刚才那个方向继续”。`;
    if (!recommendations.length) {
      return json(res, {
        reply: fallback,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const queueNotice = queuedIndexes.length
      ? queuedIndexes.length === 1
        ? `已排到当前这首后面，播完会自动接上。`
        : explicitArtistMode
          ? `我把 ${displayArtistRequest(prompt, recommendations, memory)} 在你的歌单里的 ${queuedIndexes.length} 首都排到当前歌曲后面了。`
          : `我把这个方向排到当前歌曲后面了，共 ${queuedIndexes.length} 首。`
      : "";
    let reply = queueNotice || fallback;
    try {
      const generated = await aiChat(
        [{ role: "user", content: [
          `?????${payload.track.title} / ${payload.track.artist}`,
          `???????${playlist.tracks.length}`,
          `???????${memory.preferences.join("?") || "??"}`,
          `???????${memory.recentAsks.slice(0, 4).join(" / ")}`,
          `???????????${searchPrompt}`,
          `????????????${weather.city} ${weather.text} ${weather.temp}C`,
          recommendationText ? `???????\n${recommendationText}` : "????????",
          `????${prompt}`
        ].join("\n") }],
        [
          `?? ${taste.stationName} ???????????????????????????`,
          "?????????????r&b????????????????????????????????????????",
          "????????????????????????????",
          "?????????????????????????????????????????????????????????????????????",
          "??????????????????????????",
          "????????????????????????????????????"
        ].join("\n")
      );
      if (!queueNotice) reply = sanitizeStationReply(generated, fallback);
    } catch {
      if (!queueNotice) reply = fallback;
    }
    return json(res, {
      reply,
      queued: queuedIndexes.length > 0,
      queuePreview: queuedIndexes.slice(0, 12).map((index) => ({
        index,
        title: playlist.tracks[index].title,
        artist: playlist.tracks[index].artist,
        album: playlist.tracks[index].album || ""
      })),
      recommendations: recommendations.map((item) => ({
        index: item.index,
        title: item.track.title,
        artist: item.track.artist,
        album: item.track.album || "",
        sourceId: item.track.sourceId || item.track.id || "",
        score: item.score
      })),
      memory,
      provider: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
        ? "claude"
        : process.env.DEEPSEEK_API_KEY
          ? "deepseek"
          : process.env.OPENAI_API_KEY
            ? "openai-compatible"
            : "fallback"
    });
  }

  json(res, { error: "not found" }, 404);
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const cacheControl = [".html", ".css", ".js"].includes(ext)
    ? "no-store, no-cache, must-revalidate, max-age=0"
    : "public, max-age=300";
  res.writeHead(200, {
    "content-type": mime[ext] || "application/octet-stream",
    "cache-control": cacheControl
  });
  res.end(await readFile(filePath));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url.pathname);
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    if (res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }
    json(res, { error: error.message }, 500);
  }
}).listen(PORT, () => {
  console.log(`Claudio AI Radio running at http://localhost:${PORT}`);
});
