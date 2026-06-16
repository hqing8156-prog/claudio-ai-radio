import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.CLAUDIO_DATA_DIR || path.join(__dirname, "data");
const DEBUG_LOG_PATH = path.join(DATA_DIR, "playback-debug.log");
const APP_VERSION = "2026-06-17-immersive-pager-v326";
const envCsv = (name, fallback = "") => {
  const raw = process.env[name];
  const value = raw == null || String(raw).trim() === "" ? fallback : raw;
  return String(value)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
};
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
const PLAYBACK_CONTEXT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
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
const songLikeCache = new Map();

function debugPlayback(event, details = {}) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const line = JSON.stringify({
      at: new Date().toISOString(),
      event,
      details
    });
    appendFileSync(DEBUG_LOG_PATH, `${line}\n`, "utf8");
  } catch {}
}

function debugTrackTitle(snapshot = state) {
  return String(snapshot?.tempTrack?.title || snapshot?.sessionPlaylist?.tracks?.[snapshot?.index || 0]?.title || "").trim();
}

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
  shuffleHistoryStack: [],
  playlistMembershipOverrides: {},
  tempTrack: null,
  sessionPlaylist: null,
  nextSessionPlaylist: null,
  previousPlaybackContext: null,
  nextPlaybackContext: null,
  positionSeconds: 0,
  positionTrackKey: "",
  positionUpdatedAt: "",
  sequenceBase: 1,
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
    const savedSessionPlaylist = sanitizePersistedSessionPlaylist(saved.sessionPlaylist);
    const savedNextSessionPlaylist = sanitizePersistedSessionPlaylist(saved.nextSessionPlaylist);
    const savedNextTracks = sanitizePersistedTrackList(saved.nextTracks);
    const savedTempTrack = sanitizePersistedTrack(saved.tempTrack);
    const savedQueue = sanitizePersistedQueue(saved.queue);
    const savedPlayStack = sanitizePersistedPlayStack(saved.playStack);
    const savedShuffleHistoryStack = sanitizePersistedPlayStack(saved.shuffleHistoryStack);
    const savedPlaylistMembershipOverrides = sanitizePersistedPlaylistMembershipOverrides(saved.playlistMembershipOverrides);
    const savedPreviousPlaybackContext = sanitizePersistedPlaybackContext(saved.previousPlaybackContext);
    const savedNextPlaybackContext = sanitizePersistedPlaybackContext(saved.nextPlaybackContext);
    const savedIndex = Number(saved.index || 0);
    const boundedIndex = savedSessionPlaylist?.tracks?.length
      ? Math.min(Math.max(0, savedIndex), savedSessionPlaylist.tracks.length - 1)
      : savedIndex;
    return {
      ...DEFAULT_PLAYBACK_STATE,
      ...saved,
      playing: Boolean(saved.playing),
      index: Number.isFinite(boundedIndex) ? boundedIndex : DEFAULT_PLAYBACK_STATE.index,
      queue: savedQueue,
      nextTracks: savedNextTracks,
      history: [],
      playStack: savedPlayStack,
      shuffleHistoryStack: savedShuffleHistoryStack,
      playlistMembershipOverrides: savedPlaylistMembershipOverrides,
      tempTrack: savedTempTrack,
      sessionPlaylist: savedSessionPlaylist,
      nextSessionPlaylist: savedNextSessionPlaylist,
      previousPlaybackContext: savedPreviousPlaybackContext,
      nextPlaybackContext: savedNextPlaybackContext,
      positionSeconds: Math.max(0, Number(saved.positionSeconds || 0)),
      positionTrackKey: String(saved.positionTrackKey || ""),
      positionUpdatedAt: String(saved.positionUpdatedAt || ""),
      sequenceBase: Math.max(1, Number(saved.sequenceBase || DEFAULT_PLAYBACK_STATE.sequenceBase || 1)),
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

function sanitizePersistedSessionPlaylist(playlist) {
  const tracks = filterPlaybackTracks(playlist?.tracks || []);
  if (!tracks.length) return null;
  return {
    id: String(playlist?.id || "netease-session"),
    name: String(playlist?.name || "NetEase Queue").slice(0, 80),
    tracks: tracks.map((track) => externalNeteaseTrack(track)).filter((track) => track.sourceId)
  };
}

function sanitizePersistedTrack(track) {
  const sourceId = String(track?.sourceId || track?.id || "").trim();
  if (!sourceId) return null;
  return externalNeteaseTrack(track);
}

function sanitizePersistedTrackList(tracks = []) {
  const seen = new Set();
  return filterPlaybackTracks(tracks || [])
    .map((track) => sanitizePersistedTrack(track))
    .filter((track) => {
      const key = playbackTrackKey(track);
      if (!track || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sanitizePersistedQueue(queue = []) {
  return (Array.isArray(queue) ? queue : [])
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0)
    .slice(0, 2000);
}

function sanitizePersistedPlayStack(stack = []) {
  return (Array.isArray(stack) ? stack : [])
    .map((item) => {
      const track = sanitizePersistedTrack(item?.track);
      if (!track) return null;
      return {
        key: String(item?.key || "").trim().slice(0, 240),
        index: Math.max(0, Number(item?.index || 0)),
        source: item?.source === "temp" ? "temp" : "session",
        sessionId: String(item?.sessionId || "").trim().slice(0, 120),
        playlistName: String(item?.playlistName || "").trim().slice(0, 120),
        track
      };
    })
    .filter((item) => item?.track)
    .slice(-80);
}

function sanitizePersistedPlaylistMembershipOverrides(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const result = {};
  for (const [songId, playlists] of Object.entries(source)) {
    const cleanSongId = String(songId || "").trim();
    if (!cleanSongId) continue;
    const cleanPlaylists = (Array.isArray(playlists) ? playlists : [])
      .map((item) => ({
        id: String(item?.id || "").trim().slice(0, 120),
        name: String(item?.name || "").trim().slice(0, 120),
        cover: String(item?.cover || "").trim().slice(0, 500),
        trackCount: Math.max(0, Number(item?.trackCount || 0))
      }))
      .filter((item) => item.id);
    if (cleanPlaylists.length) result[cleanSongId] = cleanPlaylists.slice(0, 8);
  }
  return result;
}

function isPlaybackContextExpired(context) {
  const at = String(context?.at || "").trim();
  if (!at) return false;
  const time = Date.parse(at);
  if (!Number.isFinite(time)) return false;
  return (Date.now() - time) > PLAYBACK_CONTEXT_TTL_MS;
}

function sanitizePersistedPlaybackContext(context) {
  if (!context || typeof context !== "object") return null;
  if (isPlaybackContextExpired(context)) return null;
  const sessionPlaylist = sanitizePersistedSessionPlaylist(context.sessionPlaylist);
  const nextSessionPlaylist = sanitizePersistedSessionPlaylist(context.nextSessionPlaylist);
  const nextTracks = sanitizePersistedTrackList(context.nextTracks);
  const tempTrack = sanitizePersistedTrack(context.tempTrack);
  const queue = sanitizePersistedQueue(context.queue);
  const maxIndex = sessionPlaylist?.tracks?.length ? sessionPlaylist.tracks.length - 1 : 0;
  const index = Math.min(Math.max(0, Number(context.index || 0)), maxIndex);
  const sanitized = {
    at: String(context.at || "").trim().slice(0, 64),
    reason: String(context.reason || "restore").trim().slice(0, 120),
    index: Number.isFinite(index) ? index : 0,
    playing: Boolean(context.playing),
    queue,
    nextTracks,
    tempTrack,
    sessionPlaylist,
    nextSessionPlaylist,
    sequenceBase: Math.max(1, Number(context.sequenceBase || 1)),
    playbackMode: ["sequence", "repeat-one", "shuffle"].includes(context.playbackMode) ? context.playbackMode : "sequence"
  };
  return hasPlaybackContext(sanitized) ? sanitized : null;
}

function persistedPlaybackStateSnapshot() {
  return {
    playing: Boolean(state.playing),
    index: Math.max(0, Number(state.index || 0)),
    volume: state.volume,
    weatherLocation: state.weatherLocation,
    lastHostLine: "",
    queue: sanitizePersistedQueue(state.queue),
    nextTracks: sanitizePersistedTrackList(state.nextTracks),
    history: [],
    playStack: sanitizePersistedPlayStack(state.playStack),
    shuffleHistoryStack: sanitizePersistedPlayStack(state.shuffleHistoryStack),
    playlistMembershipOverrides: sanitizePersistedPlaylistMembershipOverrides(state.playlistMembershipOverrides),
    tempTrack: sanitizePersistedTrack(state.tempTrack),
    sessionPlaylist: sanitizePersistedSessionPlaylist(state.sessionPlaylist),
    nextSessionPlaylist: sanitizePersistedSessionPlaylist(state.nextSessionPlaylist),
    previousPlaybackContext: sanitizePersistedPlaybackContext(state.previousPlaybackContext),
    nextPlaybackContext: sanitizePersistedPlaybackContext(state.nextPlaybackContext),
    positionSeconds: Math.max(0, Number(state.positionSeconds || 0)),
    positionTrackKey: String(state.positionTrackKey || ""),
    positionUpdatedAt: state.positionUpdatedAt || "",
    sequenceBase: Math.max(1, Number(state.sequenceBase || 1)),
    playbackMode: state.playbackMode || "sequence",
    audioQuality: AUDIO_QUALITY_LEVELS.has(state.audioQuality) ? state.audioQuality : DEFAULT_AUDIO_QUALITY
  };
}

async function savePlaybackState() {
  await writeJson("playback-state.json", persistedPlaybackStateSnapshot());
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

function defaultMemoryState() {
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

function looksLikeMojibake(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.includes("\uFFFD")) return true;
  const markerPattern = /(?:\u93B4|\u6D63|\u935A|\u9422|\u9428|\u95CA|\u59E3|\u9286|\u951B|\u93C6|\u950B|\u9225|\u20AC)/g;
  const markers = text.match(markerPattern) || [];
  return markers.length >= 2;
}

function sanitizeTextList(values = [], limit = 20) {
  return (Array.isArray(values) ? values : [])
    .map((item) => String(item || "").trim())
    .filter((item) => item && !looksLikeMojibake(item))
    .slice(0, limit);
}

function sanitizeArtistAliases(aliases = {}) {
  return Object.fromEntries(
    Object.entries(aliases || {})
      .map(([alias, target]) => [String(alias || "").trim(), String(target || "").trim()])
      .filter(([alias, target]) => alias && target && !looksLikeMojibake(alias) && !looksLikeMojibake(target))
      .slice(0, 40)
  );
}

function sanitizeMemory(memory = {}) {
  return {
    ...defaultMemoryState(),
    ...memory,
    chatCount: Math.max(0, Number(memory.chatCount || 0)),
    preferences: sanitizeTextList(memory.preferences, 20),
    recentAsks: sanitizeTextList(memory.recentAsks, 8),
    artistAliases: sanitizeArtistAliases(memory.artistAliases),
    lastRecommendations: (Array.isArray(memory.lastRecommendations) ? memory.lastRecommendations : [])
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0)
      .slice(0, 40),
    lastRecommendationTitles: sanitizeTextList(memory.lastRecommendationTitles, 40),
    pendingTitle: looksLikeMojibake(memory.pendingTitle) ? null : String(memory.pendingTitle || "").trim().slice(0, 120) || null,
    pendingArtistAlias: looksLikeMojibake(memory.pendingArtistAlias) ? null : String(memory.pendingArtistAlias || "").trim().slice(0, 120) || null,
    pendingArtistIntent: ["search", "play"].includes(memory.pendingArtistIntent) ? memory.pendingArtistIntent : null,
    updatedAt: memory.updatedAt || null
  };
}

async function getMemory() {
  try {
    return sanitizeMemory(await readJson("memory.json"));
  } catch {
    return defaultMemoryState();
  }
}

async function rememberChat(prompt) {
  const memory = await getMemory();
  const text = normalizeText(prompt);
  const hints = [
    ["r&b", /r&b|rnb|rb|soul/i],
    ["emo", /emo|\u4F24\u611F|\u4E27/i],
    ["\u7EAF\u97F3\/OST", /\u7EAF\u97F3|ost|bgm|\u539F\u58F0|\u914D\u4E50|\u524D\u594F/i],
    ["\u5199\u4EE3\u7801", /coding|\u5DE5\u4F5C|\u4E13\u6CE8|\u5199\u4EE3\u7801/i],
    ["\u591C\u665A\u6162\u6B4C", /\u591C\u665A|\u665A\u4E0A|\u6DF1\u591C|\u6162\u6B4C|\u653E\u677E/i],
    ["\u4E2D\u6587\u6B4C", /\u4E2D\u6587|\u56FD\u8BED|\u534E\u8BED/i],
    ["\u82F1\u6587\u6B4C", /\u82F1\u6587|\u82F1\u8BED|\u6B27\u7F8E|\u5916\u6587|english|western/i],
    ["\u6563\u6B65", /\u6563\u6B65|\u8D70\u8DEF|\u6B65\u884C|walk/i],
    ["\u66A7\u6627\u6696\u6B4C", /\u66A7\u6627|\u6E29\u67D4|\u5FC3\u52A8|\u751C/i],
    ["\u65E5\u8BED\u6B4C", /\u65E5\u8BED|\u65E5\u6587|jpop|j-pop|\u52A8\u6F2B/i]
  ];
  for (const [label, pattern] of hints) {
    if (pattern.test(text) && !memory.preferences.includes(label)) memory.preferences.push(label);
  }
  const cleanPrompt = String(prompt || "").trim();
  memory.chatCount += 1;
  memory.recentAsks = [cleanPrompt, ...memory.recentAsks.filter((item) => item !== cleanPrompt)].filter(Boolean).slice(0, 8);
  memory.artistAliases ||= {};
  memory.lastRecommendations ||= [];
  memory.updatedAt = new Date().toISOString();
  const sanitized = sanitizeMemory(memory);
  await writeJson("memory.json", sanitized);
  return sanitized;
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

function isExplicitPlaybackPrefix(text) {
  return /^(?:鎾斁|鎾竴涓媩鎾竴棣東鏀句竴涓媩鏀句竴棣東鏉ヤ竴棣東鍒囧埌|鍒囨崲鍒皘鐩存帴鎾斁|鐩存帴鍒囧埌|play|put on|listen to)\b/i.test(String(text || "").trim());
}

function stripPlaybackTargetTail(text) {
  return String(text || "")
    .replace(/(?:杩欓姝寍杩欓|姝屾洸|姝寍闊充箰)$/i, "")
    .replace(/[锛屻€傦紒锛熴€?.!?;锛?锛?'鈥溾€濃€樷€橾+$/g, "")
    .trim();
}

function extractExplicitPlaybackCommand(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return "";
  const directMatch = text.match(/^(?:\u64ad\u653e|\u64ad\u4e00\u4e0b|\u64ad\u4e00\u9996|\u653e\u4e00\u4e0b|\u653e\u4e00\u9996|\u6765\u4e00\u9996|\u5207\u5230|\u5207\u6362\u5230|\u76f4\u63a5\u64ad\u653e|\u76f4\u63a5\u5207\u5230|play|put on|listen to)\s*[:\uff1a]?\s*[\"'\u201c\u201d\u300a]?\s*(.{1,120}?)\s*[\"'\u201c\u201d\u300b]?\s*$/i);
  if (directMatch?.[1]) {
    const candidate = String(directMatch[1] || "")
      .replace(/(?:\u8fd9\u9996\u6b4c|\u8fd9\u9996|\u6b4c\u66f2|\u6b4c|\u97f3\u4e50)$/i, "")
      .replace(/[锛屻€傦紒锛熴€?.!?;锛?锛?'鈥溾€濃€樷€橾+$/g, "")
      .trim();
    if (!candidate) return "";
    if (looksLikeStyleRequest(candidate)) return "";
    if (/(?:\u6b4c\u624b|\u6b4c\u66f2|\u97f3\u4e50)$/i.test(candidate)) return "";
    return candidate;
  }
  const asciiTail = text.match(/([a-z0-9][a-z0-9 '&/().,_-]{1,80})\s*$/i);
  if (asciiTail?.[1]) {
    const prefix = text.slice(0, asciiTail.index).trim();
    if (/^(?:\u64ad\u653e|\u64ad\u4e00\u4e0b|\u64ad\u4e00\u9996|\u653e\u4e00\u4e0b|\u653e\u4e00\u9996|\u6765\u4e00\u9996|\u5207\u5230|\u5207\u6362\u5230|\u76f4\u63a5\u64ad\u653e|\u76f4\u63a5\u5207\u5230)$/i.test(prefix)) {
      return asciiTail[1].trim();
    }
  }
  return "";
}

function wantsPendingTitlePlayback(prompt) {
  const text = normalizeText(prompt);
  return /鐩存帴鎾斁|鎾斁灏辫|灏辫繖棣東涓嶇敤纭|榛樿鐗堟湰|鍘熷０鐗?i.test(text);
}

function extractPendingTitleContinuation(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return "";
  const normalized = normalizeText(text);
  if (!/鐗堟湰|鐗堢殑|缈诲敱|鍞辩殑|閭ｄ釜鐗堟湰|杩欎釜鐗堟湰|姝屾墜|by |鏉ヨ嚜|oh wonder|stevie|tori|swedish|鍘熺増|live|demo|cover/i.test(normalized)) {
    return "";
  }
  return text
    .replace(/^(鎴戞兂鍚瑋鎯冲惉|鎴戣鍚瑋鍚瑋鎵緗鎼渱鎼滅储|鏌鏌ヤ竴涓?\s*/i, "")
    .replace(/[锛屻€傦紒锛?.!?]+$/g, "")
    .trim();
}

function extractRequestedTitle(prompt) {
  const text = String(prompt || "").trim();
  const patterns = [
    /(?:鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉|鎾斁|鏀句竴棣東鏉ヤ竴棣東缁欐垜鏀緗缁欐垜鎾?\s*銆?[^銆媇{1,120})銆?i,
    /(?:鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉|鎾斁|鏀句竴棣東鏉ヤ竴棣東缁欐垜鏀緗缁欐垜鎾?\s+(.{1,120})$/i,
    /(?:鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉|鎾斁|鏀句竴棣東鏉ヤ竴棣東缁欐垜鏀緗缁欐垜鎾?(.{1,120})$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    return match[1]
      .replace(/(?:杩欓姝寍杩欓|杩欐瓕|姝屾洸|闊充箰|鐨勬瓕)$/i, "")
      .replace(/[锛屻€傦紒锛?.!?]+$/g, "")
      .trim();
  }
  return "";
}

function extractImmediatePlaybackTarget(prompt) {
  const text = String(prompt || "").trim();
  const patterns = [
    /^(?:鎾斁|鎾瓅鏀緗鏉ヤ竴棣東缁欐垜鏀緗缁欐垜鎾瓅鎴戞兂鍚瑋鎴戣鍚?\s*[:锛歖?\s*[銆?']?\s*(.{1,120}?)\s*[銆?']?\s*$/i,
    /^(?:play|put on|listen to)\s+(.{1,120}?)\s*$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const candidate = String(match[1] || "")
      .replace(/[銆傦紒!锛?锛?;锛沒+$/g, "")
      .trim();
    if (!candidate) continue;
    if (looksLikeStyleRequest(candidate)) return "";
    if (/(?:鐨勬瓕|姝屾墜|姝屾洸|闊充箰)$/i.test(candidate)) return "";
    return candidate;
  }
  const asciiTail = text.match(/([a-z0-9][a-z0-9 '&/().,_-]{1,80})\s*$/i);
  if (asciiTail?.[1]) {
    const candidate = asciiTail[1].trim();
    const prefix = text.slice(0, asciiTail.index).trim();
    const prefixLooksBroken = prefix && !/[a-z0-9\u4e00-\u9fff]/i.test(prefix) && prefix.length <= 8;
    const prefixLooksCommand = /(?:鎾斁|鎾瓅鏀緗鍚瑋play|put on|listen to|[?锛焆{1,4})/i.test(prefix);
    if ((prefixLooksBroken || prefixLooksCommand) && !looksLikeStyleRequest(candidate)) {
      return candidate;
    }
  }
  return "";
}

async function playTitleImmediately(title, playlist, memory) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) return null;
  const activePlaylist = activePlaybackPlaylist(playlist);
  const removeFromNextTracks = (track) => {
    const targetKey = playbackTrackKey(track);
    state.nextTracks = filterPlaybackTracks(state.nextTracks || [])
      .filter((item) => playbackTrackKey(item) !== targetKey);
  };
  const insertAsImmediateNext = (track) => {
    removeFromNextTracks(track);
    state.nextTracks = [track, ...filterPlaybackTracks(state.nextTracks || [])];
  };
  const localMatches = findTitleMatches(activePlaylist, cleanTitle, 8);
  if (localMatches.length) {
    const first = localMatches[0];
    const selectedTrack = activePlaylist.tracks[first.index];
    pushCurrentIfChanging(playlist, selectedTrack);
    insertAsImmediateNext(selectedTrack);
    state.tempTrack = selectedTrack;
    state.playing = true;
    state.lastHostLine = "";
    resetPlaybackPosition(selectedTrack);
    fillTempHostLineAsync(selectedTrack);
    await rememberRecommendations(memory, localMatches);
    await clearPendingTitle(memory);
    await broadcast();
    return {
      reply: `宸叉彃鍏ヤ笅涓€棣栧苟绔嬪嵆鎾斁銆?{selectedTrack.title}銆嬶紝鍘熸挱鏀惧簭鍒椾繚鎸佷笉鍙樸€俙,
      recommendations: localMatches.map(recommendationFromMatch),
      queued: false,
      queuePreview: [],
      memory
    };
  }
  const netease = await searchNeteaseSongs(cleanTitle, 8);
  const tracks = netease.map((track) => externalNeteaseTrack(track)).filter((track) => track.sourceId);
  if (tracks.length) {
    const [first] = tracks;
    pushCurrentIfChanging(playlist, first);
    insertAsImmediateNext(first);
    state.tempTrack = first;
    state.playing = true;
    state.lastHostLine = "";
    resetPlaybackPosition(first);
    fillTempHostLineAsync(first);
    await clearPendingTitle(memory);
    await broadcast();
    return {
      reply: `宸叉彃鍏ヤ笅涓€棣栧苟绔嬪嵆鎾斁缃戞槗浜戞悳绱㈠埌鐨勩€?{first.title}銆嬶紝鍘熸挱鏀惧簭鍒椾繚鎸佷笉鍙樸€俙,
      recommendations: neteaseRecommendations(netease),
      queued: false,
      queuePreview: [],
      memory
    };
  }
  await clearPendingTitle(memory);
  return {
    reply: `鎴戞寜銆?{cleanTitle}銆嬫悳浜嗘湰鍦版瓕鍗曞拰缃戞槗浜戯紝杩樻槸娌℃嬁鍒板彲鎾斁缁撴灉銆俙,
    recommendations: [],
    queued: false,
    queuePreview: [],
    memory
  };
}

async function presentTitleChoices(title, playlist, memory) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) {
    return {
      reply: "浣犵洿鎺ヨ姝屽悕銆佹瓕鎵嬫垨鑰呴鏍煎氨琛岋紝鎴戝厛鎶婂€欓€夊垪鍑烘潵锛屽啀鐢变綘鑷繁鍐冲畾鍔犲摢棣栥€?,
      recommendations: [],
      queued: false,
      queuePreview: [],
      memory
    };
  }
  await rememberPendingTitle(memory, cleanTitle);
  const netease = await searchNeteaseSongs(cleanTitle, 12);
  if (netease.length) {
    return {
      reply: `鎴戝厛鎶娿€?{cleanTitle}銆嬬殑鍊欓€夊垪鍑烘潵銆備綘鑷繁閫夊崟棣栧姞鍏ュ綋鍓嶉槦鍒楋紝鎴栬€呯洿鎺ョ偣杩藉姞鍏ㄩ儴銆俙,
      recommendations: neteaseRecommendations(netease),
      queued: false,
      queuePreview: [],
      memory
    };
  }
  const activePlaylist = activePlaybackPlaylist(playlist);
  const localMatches = findTitleMatches(activePlaylist, cleanTitle, 12);
  if (localMatches.length) {
    await rememberRecommendations(memory, localMatches);
    return {
      reply: `缃戞槗浜戣繖杈规殏鏃舵病鍏堟姄鍒般€?{cleanTitle}銆嬬殑绋冲畾缁撴灉锛屾垜鎶婂綋鍓嶅垪琛ㄩ噷鏈€鎺ヨ繎鐨勫€欓€夊垪鍑烘潵浜嗐€備綘鑷繁閫夊崟棣栧姞鍏ュ綋鍓嶉槦鍒楋紝鎴栬€呯洿鎺ョ偣杩藉姞鍏ㄩ儴銆俙,
      recommendations: localMatches.map(recommendationFromMatch),
      queued: false,
      queuePreview: [],
      memory
    };
  }
  return {
    reply: `鎴戞寜銆?{cleanTitle}銆嬫煡浜嗙綉鏄撲簯鍜屽綋鍓嶅垪琛紝鏆傛椂娌℃壘鍒板彲鐢ㄥ€欓€夈€俙,
    recommendations: [],
    queued: false,
    queuePreview: [],
    memory
  };
}

function normalizeChatIntentForSelection(intent = {}) {
  const next = { ...intent, autoplay: false };
  if (next.intent === "play_title") next.intent = "search_title";
  if (next.intent === "play_artist") next.intent = "search_artist";
  if (next.intent === "play_current_artist") next.intent = "search_current_artist";
  return next;
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
    morning: "鏃╀笂",
    afternoon: "涓嬪崍",
    evening: "鏅氫笂",
    "late night": "娣卞"
  }[value] || value;
}

function weatherMood(weather) {
  const text = `${weather.text || ""}`.toLowerCase();
  if (text.includes("闆?) || text.includes("rain")) return "涓嬮洦锛屽亸浣?BPM銆佹殩鑹层€佹澗涓€鐐圭殑姝?;
  if (text.includes("闆?) || text.includes("snow")) return "涓嬮洩锛屽亸瀹夐潤銆佺┖鏃枫€佹參涓€鐐圭殑姝?;
  if (text.includes("鏅?) || text.includes("clear")) return "鏅存湕锛岄€傚悎鏇存槑浜€佹湁姝ヨ鎰熺殑姝?;
  if (text.includes("闃?) || text.includes("浜?) || text.includes("cloud")) return "澶氫簯鎴栭槾澶╋紝閫傚悎鏌斿拰銆佹湁鍐呯渷鎰熺殑姝?;
  if (weather.temp >= 30) return "澶╂皵鍋忕儹锛岄€傚悎娓呯埥銆佽交蹇€佷綆鍘嬫剦蹇殑姝?;
  if (weather.temp <= 8) return "澶╂皵鍋忓喎锛岄€傚悎娓╂殩銆佸帤涓€鐐圭殑澹伴煶";
  return "澶╂皵骞崇ǔ锛屾寜褰撳墠鎯呯华鑷劧琛旀帴";
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
    let firstPlayable = null;
    const isBrowserFriendlyAudio = (item = {}) => {
      const type = String(item.type || "").toLowerCase();
      const levelName = String(item.level || "").toLowerCase();
      const urlText = String(item.url || "").toLowerCase();
      if (!urlText) return false;
      if (type.includes("flac")) return false;
      if (/\.flac(\?|$)/.test(urlText)) return false;
      if (["sky", "jyeffect", "jymaster"].includes(levelName)) return false;
      return true;
    };
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
          const payload = {
            url: item.url,
            level: item.level || requestedLevel,
            requestedLevel: level,
            fallback: requestedLevel !== level || (item.level && item.level !== level),
            type: item.type || "",
            time: item.time || 0,
            code: item.code || data.code,
            source: "netease"
          };
          if (!firstPlayable) firstPlayable = payload;
          if (isBrowserFriendlyAudio(item)) return payload;
        }
      } catch (error) {
        attempts.push({ level: requestedLevel, error: error.message || "request failed", hasUrl: false });
      }
    }
    if (firstPlayable) {
      return {
        ...firstPlayable,
        fallback: true,
        browserFallback: true,
        attempts
      };
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
  return /(?:^|[\s\-_/()[\]銆愩€慮)(?:dj|d\.j\.?)(?:$|[\s\-_/()[\]銆愩€慮)/i.test(text)
    || /(?:dj|d\.j\.?).{0,12}(?:version|remix|mix|club|bootleg|extended|涓茬儳|鑸炴洸|杞﹁浇|鎱㈡憞|鎶栭煶|蹇墜|寮归紦|鍦熷棬|澶滃簵|鍔犻€焲鍙橀€?/i.test(text)
    || /(?:version|remix|mix|club|bootleg|extended|涓茬儳|鑸炴洸|杞﹁浇|鎱㈡憞|鎶栭煶|蹇墜|寮归紦|鍦熷棬|澶滃簵|鍔犻€焲鍙橀€?.{0,12}(?:dj|d\.j\.?)/i.test(text)
    || /dj(?:version|remix|mix|club|bootleg|extended)|(?:鎶栭煶|蹇墜|杞﹁浇|鎱㈡憞|澶滃簵|鍦熷棬)dj/i.test(compact);
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
  return /(?:^|[\s\-_/璺?()[\]锛堬級銆愩€慮)(?:0[,.][5-9]|1[,.][1-9]|2[,.]0)\s*(?:x|鍊嶉€焲閫焲鐗??(?:$|[\s\-_/璺?()[\]锛堬級銆愩€慮)/i.test(text)
    || /(?:sped\s*up|speed\s*up|slowed|slow\s*version|nightcore|鍔犻€焲鍙橀€焲鍊嶉€焲闄嶉€焲鎱㈤€焲璋冮€?/i.test(text)
    || /(?:0[,.][5-9]|1[,.][1-9]|2[,.]0)(?:x|鍊嶉€焲閫?|(?:spedup|speedup|slowed|nightcore|鍔犻€焲鍙橀€焲鍊嶉€焲闄嶉€焲鎱㈤€焲璋冮€?/i.test(compact);
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
  const smokyVoice = /鐑熷棑/i.test(normalized) || /鐑熷棑/i.test(compact);
  const rap = /璇村敱|鍢诲搱|楗惰垖|涓枃璇村敱|鍥借|rapper|\brap\b|hip[\s.-]*hop|\btrap\b|drill|boom\s*bap|freestyle/i.test(normalized)
    || /璇村敱|鍢诲搱|楗惰垖|hiphop|trap|drill|boombap|freestyle/i.test(compact);
  const electronic = /鐢靛瓙|鐢甸煶|鐢靛瓙鑸炴洸|鑸炴洸|鍚堟垚鍣▅娴╁|鍑虹|杩峰够|纭牳|榧撴墦璐濇柉|\bedm\b|electronic|electronica|electronique|synthwave|synth\s*pop|future\s*bass|future\s*house|bass\s*house|deep\s*house|tech\s*house|\bhouse\b|\btechno\b|\btrance\b|\bdubstep\b|\bdnb\b|drum\s*(?:and|&)\s*bass|hardstyle|psytrance|electro\s*house|progressive\s*house/i.test(normalized)
    || /鐢靛瓙|鐢甸煶|鐢靛瓙鑸炴洸|synthwave|synthpop|futurebass|futurehouse|basshouse|deephouse|techhouse|electrohouse|progressivehouse|dubstep|hardstyle|psytrance|drumandbass/i.test(compact);
  const plainHouseOnly = /\bhouse\b/i.test(normalized)
    && !/future\s*house|bass\s*house|deep\s*house|tech\s*house|electro\s*house|progressive\s*house/i.test(normalized)
    && !/futurehouse|basshouse|deephouse|techhouse|electrohouse|progressivehouse/i.test(compact)
    && !/鐢靛瓙|鐢甸煶|鐢靛瓙鑸炴洸|electronic|electronica|\bedm\b|synthwave|\btechno\b|\btrance\b|\bdubstep\b|\bdnb\b|drum\s*(?:and|&)\s*bass|hardstyle|psytrance/i.test(normalized);
  return smokyVoice || rap || (electronic && !plainHouseOnly);
}

function isBlockedGenreQuery(query = "") {
  const normalized = normalizeText(query);
  const compact = normalized.replace(/\s+/g, "");
  const smokyVoice = /鐑熷棑/i.test(normalized) || /鐑熷棑/i.test(compact);
  const plainHouseOnly = /\bhouse\b/i.test(normalized)
    && !/future\s*house|bass\s*house|deep\s*house|tech\s*house|electro\s*house|progressive\s*house/i.test(normalized)
    && !/futurehouse|basshouse|deephouse|techhouse|electrohouse|progressivehouse/i.test(compact)
    && !/鐢靛瓙|鐢甸煶|鐢靛瓙鑸炴洸|electronic|electronica|\bedm\b|synthwave|\btechno\b|\btrance\b|\bdubstep\b|hardstyle|psytrance|drum\s*(?:and|&)\s*bass/i.test(normalized);
  if (plainHouseOnly) return false;
  return smokyVoice
    || /璇村敱|鍢诲搱|楗惰垖|涓枃璇村敱|鍥借|\brap\b|hip[\s.-]*hop|\btrap\b|\bedm\b|鐢靛瓙鑸炴洸|鐢甸煶|electronic|electronica|synthwave|future\s*bass|future\s*house|\bhouse\b|\btechno\b|\btrance\b|\bdubstep\b|hardstyle|psytrance|drum\s*(?:and|&)\s*bass/i.test(normalized)
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
  if (Number.isFinite(pop) && pop >= 50) tags.push(`鐑害${Math.min(99, Math.round(pop))}%`);

  const likedCount = Number(song.likedCount ?? song.likeCount ?? song.collectionCount ?? song.subscribedCount);
  if (Number.isFinite(likedCount) && likedCount >= 10000) {
    if (likedCount >= 1000000) tags.push("鐧句竾绾㈠績");
    else if (likedCount >= 100000) tags.push("鍗佷竾绾㈠績");
    else tags.push("涓囨绾㈠績");
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

function finalizeNeteasePlaylistTracks(source, songs = []) {
  const seen = new Set();
  const mappedTracks = (Array.isArray(songs) ? songs : []).map((song) => neteaseSongToTrack(song, source));
  const tracks = (isLibraryPlaylistId(source.id) ? mappedTracks : filterRecommendedTracks(mappedTracks))
    .filter((track) => {
      const key = String(track.sourceId || track.id || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  source.cover ||= tracks.find((track) => track.cover)?.cover || "";
  source.trackCount = Math.max(Number(source.trackCount || 0), tracks.length);
  return { source, tracks };
}

async function readNeteaseSongsByIds(base, ids = []) {
  const cleanIds = [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^\d+$/.test(id)))];
  if (!cleanIds.length) return [];
  const songs = [];
  const chunkSize = 200;
  for (let offset = 0; offset < cleanIds.length; offset += chunkSize) {
    const chunk = cleanIds.slice(offset, offset + chunkSize);
    const detailUrl = addNeteaseCookie(new URL(`${base}/song/detail`));
    detailUrl.searchParams.set("ids", chunk.join(","));
    const response = await fetch(detailUrl);
    if (!response.ok) throw new Error(`/song/detail HTTP ${response.status}`);
    const data = await response.json();
    if (data.code && data.code !== 200) throw new Error(`/song/detail API ${data.code}`);
    const pageSongs = data.songs || data.data?.songs || [];
    if (Array.isArray(pageSongs) && pageSongs.length) songs.push(...pageSongs);
  }
  return songs;
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
  const expectedTrackCount = Math.max(
    Number(source.trackCount || 0),
    Number(detailPlaylist?.trackCount || 0),
    Number(detailPlaylist?.trackIds?.length || 0)
  );
  try {
    const pageSize = 500;
    const targetCount = expectedTrackCount;
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
      const uniqueTrackCount = new Set(songs.map((song) => String(song?.id || ""))).size;
      if (!targetCount || uniqueTrackCount >= targetCount) {
        return finalizeNeteasePlaylistTracks(source, songs);
      }
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
  source.trackCount = Math.max(
    Number(detailPlaylist.trackCount || 0),
    Number(detailPlaylist.trackIds?.length || 0),
    Number(source.trackCount || 0)
  );
  source.description = detailPlaylist.description || detailPlaylist.desc || detailPlaylist.briefDesc || source.description || "";
  const trackIds = (detailPlaylist.trackIds || [])
    .map((item) => String(item?.id || item?.trackId || ""))
    .filter((id) => /^\d+$/.test(id));
  if (trackIds.length) {
    try {
      return finalizeNeteasePlaylistTracks(source, await readNeteaseSongsByIds(base, trackIds));
    } catch {
      // Fall through to the partial detail payload.
    }
  }
  const songs = detailPlaylist.tracks || [];
  return finalizeNeteasePlaylistTracks(source, songs);
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
    tasks.push(readNeteasePlaylistTracks(base, { id: playlistId, name: fallbackName })
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
    if (/鏃跺厜闆疯揪|鍥炲繂闆疯揪|time\s*radar/i.test(name)) return false;
    return /绉佷汉闆疯揪|private\s*radar/i.test(name);
  });
  if (!radar) throw new Error("娌℃湁鍦ㄧ綉鏄撲簯璐﹀彿姝屽崟閲屾壘鍒扮浜洪浄杈?);
  const result = await readNeteasePlaylistTracks(base, radar);
  if (!result.tracks.length) throw new Error("绉佷汉闆疯揪姝屽崟涓虹┖");
  return result;
}

async function readNeteaseDynamicSource(sourceId) {
  const base = (process.env.NETEASE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  if (sourceId === "personal_fm") {
    return readNeteasePlaylistTracks(base, {
      id: NETEASE_PERSONAL_RADAR_ID,
      name: "绉佷汉闆疯揪"
    });
  }
  const source = sourceId === "personal_fm"
    ? { id: "netease-personal-radar", name: "绉佷汉闆疯揪" }
    : { id: "netease-daily-recommend", name: "姣忔棩鎺ㄨ崘" };
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
  if (!data) throw new Error(lastError || "缃戞槗浜戞帹鑽愭簮鏆傛椂涓嶅彲鐢?);
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
        const favoriteCards = await readNeteaseFavoritePlaylistCards().catch(() => []);
        const playlistCard = favoriteCards.find((item) => String(item?.id || "").trim() === pid)
          || { id: pid, name: NETEASE_PLAYLIST_NAMES[pid] || pid, cover: "", trackCount: 0 };
        syncSongPlaylistMembership(id, playlistCard);
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

function addPlaylistMembershipToTrack(track, playlist) {
  if (!track || !playlist?.id) return track;
  const playlistId = String(playlist.id || "").trim();
  if (!playlistId) return track;
  const nextPlaylists = Array.isArray(track.playlists) ? track.playlists.filter((item) => item?.id || item?.name) : [];
  if (!nextPlaylists.some((item) => String(item?.id || "").trim() === playlistId)) {
    nextPlaylists.unshift({
      id: playlistId,
      name: String(playlist.name || playlistId).trim(),
      cover: String(playlist.cover || "").trim(),
      trackCount: Number(playlist.trackCount || 0)
    });
  }
  track.playlists = nextPlaylists.slice(0, 8);
  return track;
}

function rememberSongPlaylistMembership(songId, playlist) {
  const targetId = String(songId || "").trim();
  const playlistId = String(playlist?.id || "").trim();
  if (!targetId || !playlistId) return;
  state.playlistMembershipOverrides ||= {};
  const existing = Array.isArray(state.playlistMembershipOverrides[targetId])
    ? state.playlistMembershipOverrides[targetId]
    : [];
  if (!existing.some((item) => String(item?.id || "").trim() === playlistId)) {
    state.playlistMembershipOverrides[targetId] = [{
      id: playlistId,
      name: String(playlist.name || playlistId).trim(),
      cover: String(playlist.cover || "").trim(),
      trackCount: Math.max(0, Number(playlist.trackCount || 0))
    }, ...existing].slice(0, 8);
  }
}

function syncSongPlaylistMembership(songId, playlist) {
  const targetId = String(songId || "").trim();
  if (!targetId || !playlist?.id) return;
  rememberSongPlaylistMembership(targetId, playlist);
  if (state.tempTrack && String(state.tempTrack.sourceId || state.tempTrack.id || "").trim() === targetId) {
    addPlaylistMembershipToTrack(state.tempTrack, playlist);
  }
  if (Array.isArray(state.sessionPlaylist?.tracks)) {
    for (const track of state.sessionPlaylist.tracks) {
      if (String(track?.sourceId || track?.id || "").trim() === targetId) addPlaylistMembershipToTrack(track, playlist);
    }
  }
}

function applyPlaylistMembershipOverrides(track) {
  if (!track) return track;
  const songId = String(track.sourceId || track.id || "").trim();
  if (!songId) return track;
  const overrides = Array.isArray(state.playlistMembershipOverrides?.[songId])
    ? state.playlistMembershipOverrides[songId]
    : [];
  if (!overrides.length) return track;
  const merged = { ...track, playlists: Array.isArray(track.playlists) ? [...track.playlists] : [] };
  for (const playlist of overrides) addPlaylistMembershipToTrack(merged, playlist);
  return merged;
}

async function checkNeteaseSongLike(songId) {
  const id = String(songId || "").trim();
  if (!id) return false;
  const liked = await checkNeteaseSongLikes([id]);
  return Boolean(liked[id]);
}

async function resolveTrackLiked(track = {}) {
  if (isLibraryTrack(track)) return true;
  if (track?.liked === true) return true;
  const sourceId = String(track?.sourceId || track?.id || "").trim();
  if (!sourceId) return false;
  const cached = songLikeCache.get(sourceId);
  if (cached && cached.expiresAt > Date.now()) return cached.liked;
  const liked = await checkNeteaseSongLike(sourceId);
  songLikeCache.set(sourceId, {
    liked,
    expiresAt: Date.now() + 60 * 1000
  });
  if (songLikeCache.size > 1500) {
    const now = Date.now();
    for (const [key, value] of songLikeCache) {
      if (value.expiresAt <= now || songLikeCache.size > 1200) songLikeCache.delete(key);
    }
  }
  return liked;
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
  return `${track?.title || "褰撳墠姝屾洸"} - ${track?.artist || "鏈煡姝屾墜"}`;
}

function sanitizeHostLine(line, track) {
  const fallback = fallbackHostLine({ track });
  const cleaned = String(line || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[銆傦紒锛?])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !/(涓嬩竴棣東鍚庨潰鎺鎺ヤ笅鏉杞満|浼氭帴|鍏堟帴|鎾畬|澶╂皵)/.test(sentence))
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
    .replace(/鎴戞兂鍚瑋鎯冲惉|鎴戣鍚瑋鏉ヤ竴棣東鎾斁|鐩存帴|甯垜|鎺ㄨ崘|鎵句竴棣東鎵剧偣|鎸憒鏌ヨ|鏌鎼滅储|鎼渱姝屾洸|闊充箰|涓撹緫閲岀殑姝寍涓撹緫閲寍涓撹緫|album|閲岄潰鐨勬瓕|閲岀殑姝寍鐨勬瓕|鏈夊嚑棣東澶氬皯棣東鍑犻|鍛鍚梶鍛€/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandedQueryAliases(query) {
  const compact = compactText(query);
  const aliases = [];
  const pairs = [
    [/浜旂櫨鑻遍噷|浜旂櫨閲寍500鑻遍噷|浜斾桨鑻遍噷/, ["five hundred miles", "500 miles"]],
    [/鍦ｈ癁蹇箰鍔充鸡鏂厛鐢焲鍦ｈ癁蹇箰.*鍔充鸡鏂瘄鍔充鸡鏂厛鐢焲merrychristmasmrlawrence/, [
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
    .replace(/[榫嶇珳]/g, "榫?)
    .replace(/[鈥欌€榏/g, "'")
    .replace(/[\s\-_:()[\]銆愩€戙€娿€?.,锛屻€傦紒锛?\/\\]+/g, "");
}

function hasJapaneseKana(value) {
  return /[\u3040-\u30ff]/.test(String(value || ""));
}

function looksJapaneseTrack(track) {
  const rawText = `${track.title || ""} ${track.artist || ""} ${track.album || ""}`;
  return hasJapaneseKana(rawText)
    || /j-pop|japanese|anime|鍒濋煶|涓滄柟|鍧傛湰|绫虫触|radwimps|aimer|yoasobi|瀹囧鐢皘妞庡悕|銈儷銈淬兗銉珅銈点偊銉炽儔銉堛儵銉冦偗/i.test(rawText);
}

function looksChineseTrack(track) {
  const rawText = `${track.title || ""} ${track.artist || ""}`;
  if (looksJapaneseTrack(track)) return false;
  return /[\u4e00-\u9fff]/.test(rawText);
}

const artistAliases = [
  ["榛勮€佹澘", ["ed sheeran"]],
  ["闇夐湁", ["taylor swift"]],
  ["鎵撻浄濮?, ["lana del rey"]],
  ["鐏槦鍝?, ["bruno mars"]],
  ["鏂湁", ["charlie puth"]],
  ["楠氬綋", ["adam levine", "maroon 5"]],
  ["濮嗙埛", ["eminem"]],
  ["鐩嗘牻鍝?, ["the weeknd"]],
  ["鎴崇埛", ["troye sivan"]],
  ["槌栧", ["lady gaga"]],
  ["鏃ユ棩", ["rihanna"]],
  ["缁撶煶濮?, ["jessie j"]],
  ["鍟", ["dua lipa"]],
  ["姣斾集", ["justin bieber"]],
  ["鍛ㄨ懀", ["鍛ㄦ澃浼?, "jay chou"]] 
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
    chinese: /鍗庤|鍥借|涓枃|鍐呭湴|娓彴|mandopop|c-?pop/i.test(normalized),
    english: /鑻辨枃|鑻辫|娆х編|澶栨枃|english|western/i.test(normalized),
    love: /鎯呮瓕|鐖辨儏|鎭嬬埍|澶辨亱|鐢滄瓕|emo|浼ゆ劅|蹇冨姩|鎯充綘|鐖眧鍠滄|love/i.test(normalized),
    warmWalk: /鏆ф槯|鏆栨槯|娓╂煍|鏁ｆ|璧拌矾|姝ヨ|walk|蹇冨姩|寰喓/i.test(normalized),
    japanese: /鏃ヨ|鏃ユ枃|鏃ョ郴|鏃ユ湰|jpop|j-pop|anime/i.test(normalized),
    rnb: /r&b|rnb|rb|soul|甯冮瞾鏂瘄鑺傚甯冮瞾鏂?i.test(normalized),
    ost: /ost|鍘熷０|褰辫|鐢靛奖|鐢佃鍓鍔ㄦ极|bgm|閰嶄箰/i.test(normalized),
    noIntro: /(?:涓嶈|涓嶆兂瑕亅鍒珅娌℃湁|娌灏戠偣|灏戜竴鐐箌鐭瓅涓嶅甫).{0,4}(?:鍓嶅|intro)|(?:鍓嶅).{0,4}(?:鐭瓅灏憒涓嶈|娌℃湁|娌涓嶅甫)/i.test(normalized),
    intro: /鍓嶅|intro/i.test(normalized) && !/(?:涓嶈|涓嶆兂瑕亅鍒珅娌℃湁|娌灏戠偣|灏戜竴鐐箌鐭瓅涓嶅甫).{0,4}(?:鍓嶅|intro)|(?:鍓嶅).{0,4}(?:鐭瓅灏憒涓嶈|娌℃湁|娌涓嶅甫)/i.test(normalized)
  };
}

const musicStyleRules = [
  { key: "electronic", query: /鐢靛瓙|鐢甸煶|鍚堟垚鍣▅synth|edm|future|house|techno/i, track: /electronic|synth|edm|future|house|techno|neon|鐢甸煶|鐢靛瓙/i, score: 32 },
  { key: "rock", query: /鎽囨粴|鍚変粬|rock|punk|alternative|indie/i, track: /rock|punk|alternative|guitar|indie|band|鎽囨粴|鍚変粬/i, score: 32 },
  { key: "rap", query: /璇村敱|鍢诲搱|楗惰垖|rap|hip.?hop|trap/i, track: /rap|hip hop|hip-hop|trap|璇村敱|鍢诲搱/i, score: 32 },
  { key: "jazz", query: /鐖靛＋|钃濊皟|jazz|blues|swing|bossa/i, track: /jazz|blues|swing|bossa|sax|鐖靛＋|钃濊皟/i, score: 32 },
  { key: "folk", query: /姘戣埃|folk|涔℃潙|country|鏈ㄥ悏浠?i, track: /folk|country|acoustic|guitar|姘戣埃|涔℃潙|鍚変粬/i, score: 28 },
  { key: "classical", query: /鍙ゅ吀|浜ゅ搷|绠″鸡|classical|orchestra|symphony/i, track: /classical|orchestra|symphony|concerto|sonata|piano|violin|鍙ゅ吀|浜ゅ搷|閽㈢惔|灏忔彁鐞?i, score: 30 },
  { key: "piano", query: /閽㈢惔|piano|鐞?i, track: /piano|閽㈢惔|鐞?i, score: 30 },
  { key: "instrumental", query: /绾煶|绾煶涔恷鏃犱汉澹皘instrumental/i, track: /instrumental|piano|ambient|bgm|ost|soundtrack|绾煶涔恷閽㈢惔|閰嶄箰/i, score: 34 },
  { key: "lofi", query: /lofi|lo-fi|浣庝繚鐪焲鐧藉櫔|瀛︿範|涓撴敞/i, track: /lofi|lo-fi|chill|study|ambient|soft|night|dream/i, score: 28 },
  { key: "dance", query: /璺宠垶|寰嬪姩|韫﹁开|dance|disco|funk/i, track: /dance|disco|funk|groove|party|club/i, score: 30 },
  { key: "citypop", query: /city pop|citypop|鍩庡競娴佽|鏄拰/i, track: /city pop|citypop|鏄拰|japanese|j-pop/i, score: 32 },
  { key: "female", query: /濂冲０|濂虫瓕鎵媩濂崇敓|female/i, track: /taylor|lana|aimer|yoasobi|adele|rihanna|selena|鐜嬭彶|閭撶传妫媩瀛欑嚂濮縷鐢伴Ε鐢剕寮犻潛棰東濂冲０/i, score: 22 },
  { key: "male", query: /鐢峰０|鐢锋瓕鎵媩鐢风敓|male/i, track: /jay|eason|bruno|stevie|westlife|鏋椾繆鏉皘闄堝杩厊鍛ㄦ澃浼闄跺枂|鐢峰０/i, score: 22 },
  { key: "vocalFast", query: /娌℃湁鍓嶅|娌″墠濂弢涓嶈鍓嶅|涓嶅甫鍓嶅|鐭墠濂弢鍓嶅鐭瓅鐩存帴寮€鍞眧涓€涓婃潵灏卞敱/i, track: /love|heart|you|鎴憒浣爘鐖眧鎭媩miss|kiss|baby|tonight/i, score: 22 }
];
function contextualPrompt(prompt, memory) {
  const normalized = normalizeText(prompt);
  const referencesPreviousAsk = /杩欑|杩欎釜|閭ｇ|缁х画|鎺ョ潃|鎸夊垰鎵峾鍒氭墠|涓婇潰|閭ｄ釜鏂瑰悜|杩欎釜鏂瑰悜/.test(normalized);
  const explicitFreshAsk = /鎴戞兂鍚瑋鎴戣鍚瑋鎯冲惉|鍚瑋鏉ヤ竴棣東鎾斁|鎵緗鎺ㄨ崘|鎼滅储|鎼渱鏌ヨ|鏌?.test(normalized) && !referencesPreviousAsk;
  if (explicitFreshAsk) return prompt;
  if (!/鑻辨枃|鑻辫|娆х編|澶栨枃|涓枃|鍗庤|鍥借|杩欑|杩欎釜|閭ｇ|缁х画|瑕?.test(normalized)) return prompt;
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
      .split(/\s*(?:\/|,|&|銆亅鍜寍feat\.?|ft\.?|with)\s*/i)
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
  if (!/(鍚瑋鎾瓅鎾斁|鎵緗鎼渱鎼滅储|鏌鎺ㄨ崘)/.test(normalized)) return false;
  if (!/(鐨勬瓕|姝屾洸|闊充箰|姝屾墜|artist)/i.test(normalized)) return false;
  if (!cleaned) return false;
  return compactText(cleaned).length <= 16;
}

function looksLikeStyleRequest(prompt) {
  const styles = queryStyleFlags(prompt);
  if (Object.values(styles).some(Boolean)) return true;
  return /椋庢牸|姘涘洿|娴极|鐢渱鑻︽儏|杩峰够|鎱垫噿|瀹夐潤|杞诲揩|鐑儓|姘涘洿鎰焲閫傚悎澶滄櫄|閫傚悎鏁ｆ|閫傚悎寮€杞閫傚悎鐫″墠/i.test(normalizeText(prompt));
}

function wantsPlaybackAction(prompt) {
  const normalizedPrompt = normalizeText(prompt);
  if (/浣犳槸璋亅涓轰粈涔坾鎬庝箞|鑱婅亰|瑙ｉ噴|浠€涔堟剰鎬潀鎬庝箞鏍?i.test(normalizedPrompt)) return false;
  return /鍚瑋鎾瓅鎾斁|鏀緗鎺ㄨ崘|鎺ヤ笅鏉涓嬩竴棣東鍚庨潰|涔嬪悗|鎺鎹㈡垚|鍒囧埌|play|queue|next|after\s+this|after\s+this\s+song|put\s+on|listen\s+to|recommend|some\s+/i.test(normalizeText(prompt));
}

function wantsImmediateSwitch(prompt) {
  return /鐩存帴鍒囨崲|鍒囨崲|鍒囧埌|鎹㈡垚|椹笂|绔嬪埢|鐜板湪鎾瓅鐜板湪鎾斁|鐩存帴鎾斁/i.test(normalizeText(prompt));
}

function looksLikeRelaxedStyleRequest(prompt) {
  const normalized = normalizeText(prompt);
  return /(鑺傚鑸掔紦|鑸掔紦|鎱㈣妭濂弢鎱㈡瓕|鏀炬澗|杞绘煍|瀹夐潤|鐫″墠|澶滄櫄)/i.test(normalized)
    && /(鍚瑋鎾瓅鎾斁|鏀緗鎺ㄨ崘|鏉ョ偣|鏉ラ|瀹夋帓|鍒囨崲|鍒囧埌|鎹㈡垚)/i.test(normalized);
}

function wantsMusicContinuation(prompt) {
  const normalized = normalizeText(prompt).trim();
  return /^(缁х画|鎺ョ潃|鐩存帴鎺ㄨ崘|鐩存帴鎺ㄨ崘灏辫|鐩存帴鍒囨崲|鐩存帴鎾斁|鍒囨崲|瀹夋帓|缁х画鎾斁|缁х画鎺ㄨ崘|涓嶇敤绠″綋鍓嶆鍦ㄦ挱鏀剧殑|涓嶇敤绠″綋鍓峾鍒棶浜唡鍒拷闂畖鐩存帴鏉?$/i.test(normalized)
    || /^(缁х画|鎺ョ潃|鐩存帴).{0,8}(鎺ㄨ崘|鎾斁|鍒囨崲|鏉瀹夋帓)/i.test(normalized);
}

function barePlaybackCommandTarget(prompt) {
  return normalizeText(prompt)
    .replace(/^(?:(?:閭ｅ氨|閭ｄ箞|閭灏眧浣爘璇穦甯垜|缁欐垜|鐩存帴|鐜板湪|椹笂|绔嬪埢)\s*)+/i, "")
    .replace(/(鍚鍛梶鍛€|鍟妡鍢泑涓€涓媩涓€涓嬪惂|灏辫|濂戒簡|鍙互浜唡鍗冲彲)$/i, "")
    .replace(/^(鎾斁|鏀句竴涓獆鏀句竴棣東鏀緗鎾竴涓獆鎾瓅鏉ヤ竴棣東鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉)\s*/i, "")
    .replace(/\s+/g, "")
    .trim();
}

function isBarePlaybackCommand(prompt) {
  const normalized = normalizeText(prompt).trim();
  if (!/(鎾斁|鏀緗鎾瓅鍚?/.test(normalized)) return false;
  return barePlaybackCommandTarget(prompt).length === 0;
}

async function handleBarePlaybackCommand(playlist, memory) {
  const indexes = (memory.lastRecommendations || [])
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < playlist.tracks.length && index !== state.index % playlist.tracks.length);
  if (!indexes.length) {
    return {
      reply: "鍙互锛屼絾杩欏彞閲屾病鏈夊叿浣撴瓕鍚嶆垨椋庢牸銆傛垜涓嶄細鎶婅姘旇瘝褰撴瓕鍚嶆悳锛涗綘璇翠竴涓瓕鍚嶃€佹瓕鎵嬫垨椋庢牸锛屾垜鍐嶆挱鏀俱€?,
      recommendations: [],
      queued: false,
      queuePreview: [],
      memory
    };
  }
  state.queue = indexes;
  await rememberRecommendations(memory, indexes.map((index) => ({ index, track: playlist.tracks[index], score: 0 })));
  return {
    reply: `鎴戞妸鍒氭墠閭ｆ壒鍊欓€夋帴鍒板悗闈簡锛屽叡 ${indexes.length} 棣栥€俙,
    recommendations: indexes.slice(0, 12).map((index) => recommendationFromMatch({ index, track: playlist.tracks[index], score: 0 })),
    queued: true,
    queuePreview: indexes.slice(0, 12).map((index) => ({
      index,
      title: playlist.tracks[index].title,
      artist: playlist.tracks[index].artist,
      album: playlist.tracks[index].album || ""
    })),
    memory
  };
}

function recentRelaxedStyleAsk(memory) {
  return (memory?.recentAsks || [])
    .slice(1, 8)
    .some((item) => /(鑺傚鑸掔紦|鑸掔紦|鎱㈣妭濂弢鎱㈡瓕|鏀炬澗|杞绘煍|瀹夐潤|鐫″墠|澶滄櫄)/i.test(normalizeText(item)));
}

function deterministicStyleIntent(prompt, memory) {
  if (looksLikeRelaxedStyleRequest(prompt) || (wantsMusicContinuation(prompt) && recentRelaxedStyleAsk(memory))) {
    return {
      intent: "recommend_style",
      title: "",
      artist: "",
      style: "鑺傚鑸掔紦 鎱㈣妭濂?鎱㈡瓕 soft slow chill night",
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
  if (styles.chinese) labels.push("鍗庤");
  if (styles.english) labels.push("鑻辨枃");
  if (styles.japanese) labels.push("鏃ヨ");
  if (styles.rnb) labels.push("r&b");
  if (styles.ost) labels.push("OST");
  if (styles.love) labels.push(/鑻︽儏|澶辨亱|浼ゆ劅|emo/i.test(prompt) ? "澶辨亱 浼ゆ劅 emo 鎱㈡瓕 ballad" : "鐖辨儏 鐢滄瓕 娴极 love ballad");
  if (styles.warmWalk) labels.push("娓╂煍");
  if (styles.noIntro) labels.push("鐭墠濂?);
  if (styles.intro) labels.push("鍓嶅");
  for (const [label, pattern] of [
    ["鐢靛瓙", /鐢靛瓙|鐢甸煶|edm|synth|house|techno/i],
    ["鎽囨粴", /鎽囨粴|rock|punk|alternative/i],
    ["璇村敱", /璇村敱|鍢诲搱|rap|hip.?hop|trap/i],
    ["鐖靛＋", /鐖靛＋|jazz|blues|bossa/i],
    ["姘戣埃", /姘戣埃|folk|country/i],
    ["绾煶涔?, /绾煶|绾煶涔恷instrumental/i],
    ["lofi", /lofi|lo-fi|浣庝繚鐪?i],
    ["city pop", /city\s*pop|citypop|鍩庡競娴佽/i]
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
    /(?:鎺ヤ笅鏉涓嬩竴棣東鍚庨潰|涔嬪悗|绛変細鍎縷鐜板湪|涓烘垜|缁欐垜|甯垜|璇??\s*(?:鎾斁|鎾瓅鏀緗鍚瑋鎯冲惉|鎴戣鍚瑋鎴戞兂鍚瑋鏉ョ偣|鏉ラ|鎹㈡垚|鍒囧埌)\s*([^锛屻€傦紒锛?]{1,40}?)(?:鐨??(?:姝寍姝屾洸|闊充箰|浣滃搧)\s*$/i,
    /(?:鎺ヤ笅鏉涓嬩竴棣東鍚庨潰|涔嬪悗|绛変細鍎縷鐜板湪|涓烘垜|缁欐垜|甯垜|璇??\s*(?:鎾斁|鎾瓅鏀緗鍚瑋鎯冲惉|鎴戣鍚瑋鎴戞兂鍚瑋鏉ョ偣|鏉ラ|鎹㈡垚|鍒囧埌)\s*([^锛屻€傦紒锛?]{1,30})\s*$/i,
    /^([^锛屻€傦紒锛?]{1,30}?)(?:鐨??(?:姝寍姝屾洸|闊充箰|浣滃搧)$/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match?.[1]) continue;
    const candidate = cleanQuery(match[1])
      .replace(/^(涓€涓獆涓€浜泑鍑犻|鍏ㄩ儴|鎵€鏈墊姣旇緝|绫讳技|杩欑|杩欎釜|閭ｄ釜|璇褰撳墠)\s*/g, "")
      .replace(/\s*(涓€涓獆涓€浜泑鍑犻|鍏ㄩ儴|鎵€鏈墊绫讳技|杩欑|杩欎釜|閭ｄ釜)$/g, "")
      .trim();
    const compact = compactText(candidate);
    if (!compact || compact.length > 32) continue;
    if (compact.length < 2) continue;
    if (/^(鎾瓅鏀緗鍚瑋鎾斁|缁х画|鎺ヤ笅鏉鍗庤|涓枃|鑻辨枃|鏃ヨ|绾煶|绾煶涔恷r&b|rnb|ost|emo|鎱㈡瓕|鎯呮瓕|鎽囨粴|鐢靛瓙|鐖靛＋|姘戣埃)$/.test(candidate)) continue;
    return candidate;
  }
  return "";
}

async function handleRequestedArtistPlayback(prompt, playlist, memory) {
  const artist = extractRequestedArtistName(prompt);
  if (!artist) return null;
  const matches = findArtistMatches(playlist, `\u6211\u60f3\u542c${artist}\u7684\u6b4c`, memory);
  await rememberRecommendations(memory, matches);
  if (matches.length) {
    return {
      reply: `\u627e\u5230 ${matches.length} \u9996 ${artist}\uff0c\u5148\u653e\u5728\u4e0b\u9762\u7ed9\u4f60\u9009\uff1b\u70b9\u5355\u9996\u4f1a\u63d2\u5230\u5f53\u524d\u6b4c\u66f2\u540e\u9762\uff0c\u70b9\u201c\u8ffd\u52a0\u5168\u90e8\u201d\u4f1a\u6574\u6279\u63d2\u5165\u5f53\u524d\u961f\u5217\u3002`,
      recommendations: matches.slice(0, 12).map(recommendationFromMatch),
      queued: false,
      queuePreview: [],
      memory
    };
  }
  const netease = await searchNeteaseSongs(artist, 12);
  if (netease.length) {
    return {
      reply: `\u4f60\u7684\u5f53\u524d\u6b4c\u5355\u91cc\u6ca1\u627e\u5230 ${artist}\uff0c\u4f46\u7f51\u6613\u4e91\u641c\u5230\u4e86 ${netease.length} \u4e2a\u5019\u9009\uff0c\u5148\u7ed9\u4f60\u9009\u3002`,
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
  if (/[锛屻€傦紒锛?,.?]/.test(prompt)) return false;
  if (/鍚瑋鎾瓅鎾斁|鎺ㄨ崘|鎵緗鎼渱鏌妫€绱姝寍闊充箰|涓€涓獆涓€浜泑鍚梶涓轰粈涔坾鎬庝箞|浠€涔坾璋亅鍝?.test(normalized)) return false;
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
  const match = normalized.match(/(?:鎴戞兂鍚瑋鎯冲惉|鎴戣鍚瑋鏉ヤ竴棣東鎾斁|鐩存帴|甯垜|鎺ㄨ崘|鎵句竴棣東鎵剧偣|鎸憒鏌ヨ|鏌鎼滅储|鎼??\s*(.+?)(?:涓撹緫|album)/i);
  const candidate = match?.[1] || cleanQuery(query);
  return cleanQuery(candidate)
    .replace(/閲岄潰|閲寍鐨?g, " ")
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
  const styleStopWords = semanticStyleMode ? ["鎯呮瓕", "鑻︽儏姝?, "姝屾洸", "闊充箰", "姝?, "椋庢牸"] : [];
  const queryStopWords = new Set(["and", "the", "of", "a", "an", "to", "in", "on", "for", "鐨?, "閲?, ...styleStopWords]);
  const tokens = normalized.split(/[ ,锛屻€傦紒锛?銆乚+/).filter((token) => token && !queryStopWords.has(token));
  const cleanTokens = expandedQuery.split(/[ ,锛屻€傦紒锛?銆乚+/).filter((token) => token && !queryStopWords.has(token));
  const queryCompacts = [effectiveQuery || normalized, ...queryAliases].map(compactText).filter(Boolean);
  const moodHints = [
    ["绾煶", ["instrumental", "ost", "original motion picture", "soundtrack", "piano", "bgm", "ambient"]],
    ["r&b", ["r&b", "rnb", "r b", "soul", "neo soul", "rhythm", "blues"]],
    ["rnb", ["r&b", "rnb", "r b", "soul", "neo soul", "rhythm", "blues"]],
    ["rb", ["r&b", "rnb", "r b", "soul", "neo soul", "rhythm", "blues"]],
    ["璇村敱", ["rap", "hip hop", "hip-hop", "trap"]],
    ["鎽囨粴", ["rock", "alternative", "punk", "guitar"]],
    ["鐖靛＋", ["jazz", "swing", "bossa", "sax"]],
    ["鍐欎唬鐮?, ["synth", "ambient", "lofi", "instrumental", "ost", "bgm"]],
    ["鏀炬澗", ["soft", "slow", "dream", "ambient", "piano", "night"]],
    ["鍓嶅", ["intro", "ost", "soundtrack", "instrumental", "bgm"]],
    ["鏃ヨ", ["j-pop", "japanese", "anime", "ost"]]
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
    if (styleFlags.love && /鐖眧鎭媩鎯厊蹇億浣爘鎴憒鎯硘姊娉獆鐥泑浼鍒珅鍚粅鎶眧鍠滄|love|heart|kiss|miss|tears|without you/i.test(rawText)) score += 34;
    if (styleFlags.warmWalk && /warm|soft|sweet|summer|walk|somewhere|wonder|love|heart|light|moon|night|dream|娓╂煍|鏆東澶渱蹇億鐖眧鎭媩姊鏈坾澶弢娴?i.test(rawText)) score += 28;
    if (styleFlags.japanese && looksJapaneseTrack(track)) score += 46;
    if (styleFlags.rnb && /r&b|rnb|soul|blues|rhythm|stevie hoang|boyz ii men|usher|ne-yo|mariah|bruno mars/i.test(rawText)) score += 34;
    if (styleFlags.ost && /ost|鍘熷０|soundtrack|from "|鐢靛奖|鐢佃鍓anime|bgm|閰嶄箰|theme/i.test(rawText)) score += 34;
    if (styleFlags.intro && /intro|鍓嶅|instrumental|overture|prelude|opening|op\.|theme|bgm|閰嶄箰/i.test(rawText)) score += 34;
    if (styleFlags.noIntro && /intro|鍓嶅|instrumental|overture|prelude|opening|op\.|theme|bgm|閰嶄箰|绾煶涔恷piano|閽㈢惔|soundtrack|ost/i.test(rawText)) score -= 80;
    if (semanticStyleMode && /^(鎯呮瓕|鑻︽儏姝寍鎯呮瓕鐜媩鍗曡韩鎯呮瓕)$/i.test(normalizeText(track.title))) score -= 75;
    if (semanticStyleMode && /鎯呮瓕/.test(normalizeText(track.album || "")) && !/澶辨亱|浼ゆ劅|emo|蹇冪|sad|heartbreak|ballad|love/i.test(rawText)) score -= 28;
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
      if (albumMode && /涓撹緫|album|鎸憒鎵緗鎼渱鎼滅储|鎺ㄨ崘|鎾斁|姝屾洸|闊充箰|鐨勬瓕|鏈夊嚑棣東澶氬皯棣東鍑犻/.test(token)) continue;
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
    ["OST / 鐢靛奖鍘熷０", /ost|original motion picture|soundtrack|鍘熷０|閰嶄箰/g],
    ["R&B / Soul", /r&b|rnb|soul|blues/g],
    ["鏃ヨ / 鍔ㄦ极鎰?, /j-pop|japanese|anime|鍒濋煶|涓滄柟|sound horizon/g],
    ["鍗庤娴佽", /鍗庤|鍥借|mandopop|鍛ㄦ澃浼鏋椾繆鏉皘浜旀湀澶?g],
    ["鐢靛瓙 / 鍚堟垚鍣?, /synth|electronic|edm|future|neon/g],
    ["瀹夐潤绾煶", /instrumental|piano|ambient|bgm|lofi/g],
    ["鎽囨粴 / 鍚変粬", /rock|guitar|punk|alternative/g],
    ["澶滄櫄鎱㈡瓕", /night|moon|slow|dream|澶渱鏈?g]
  ];
  const styles = styleRules.map(([name, pattern]) => ({
    name,
    count: (text.match(pattern) || []).length
  })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 8);
  const playlists = playlist.playlists || (playlist.playlist ? [playlist.playlist] : []);
  const summary = [
    `褰撳墠姝屽崟鍏?${tracks.length} 棣栵紝鏉ヨ嚜 ${playlists.length || 1} 涓潵婧愩€俙,
    topArtists.length ? `楂橀姝屾墜鍖呮嫭 ${topArtists.slice(0, 4).map((item) => item.name).join("銆?)}銆俙 : "",
    styles.length ? `鏁翠綋姘旇川鍋?${styles.slice(0, 4).map((item) => item.name).join("銆?)}銆俙 : "",
    topAlbums.length ? `鍙嶅鍑虹幇鐨勪笓杈?浣滃搧闆嗘湁銆?{topAlbums.slice(0, 3).map((item) => item.name).join("銆嬨€?)}銆嬨€俙 : ""
  ].filter(Boolean).join("");
}

function isCountQuestion(prompt) {
  const normalized = normalizeText(prompt);
  return /瀵煎叆.*澶氬皯|姝屽崟.*鏁伴噺|鏇插簱.*鏁伴噺|澶氬皯棣東鍑犻/.test(normalized)
    && cleanQuery(prompt).length < 2;
}

function isLibraryCountQuestion(prompt) {
  const normalized = normalizeText(prompt);
  return /瀵煎叆.*澶氬皯|姝屽崟.*鏁伴噺|鏇插簱.*鏁伴噺/.test(normalized)
    || (/澶氬皯棣東鍑犻/.test(normalized) && cleanQuery(prompt).length < 2);
}

function isSongCountQuestion(prompt) {
  const normalized = normalizeText(prompt);
  if (/鎺ㄨ崘|缁欐垜|鏉鏀緗鎾瓅鎾斁|鎯冲惉|鎴戣鍚瑋鎴戞兂鍚?.test(normalized)) return false;
  return /澶氬皯棣東鍑犻/.test(normalized) && cleanQuery(prompt).length >= 2;
}

function extractArtistNameFragment(prompt) {
  const normalized = normalizeText(prompt);
  const patterns = [
    /(?:姝屾墜鍚峾鑹哄悕|鍚嶅瓧|濮撳悕).{0,4}(?:鍚珅甯鏈墊鍖呭惈)(.+?)(?:鐨??姝屾墜/,
    /(?:姝屾墜鍚峾鑹哄悕|鍚嶅瓧|濮撳悕).{0,4}(?:鍚珅甯鏈墊鍖呭惈)(.+?)(?:鏈夊摢浜泑鏈夎皝|鏄皝|$)/,
    /(?:鍚珅甯鍖呭惈)(.+?)(?:鐨??姝屾墜(?:鏈夊摢浜泑鏈夎皝|鏄皝|$)/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const fragment = match[1].replace(/鍝簺|鏈夎皝|鏄皝|鍚梶鍛鍛€|鐨?g, "").trim();
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
  const queryTokens = cleaned.split(/[ ,锛屻€傦紒锛?銆乚+/).filter((token) => token.length > 1);
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
    .replace(/鎴戣寰梶璁板緱|濂藉儚|搴旇|鍙兘|鏈変袱棣東涓ら|鍑犻|鍏ㄩ儴|鎵€鏈墊鐗堟湰|鍚屽悕|杩欓|杩欐瓕/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const quoted = String(prompt).match(/[鈥溾€?銆娿€媇(.+?)[鈥溾€?銆娿€媇/);
  if (quoted?.[1]) query = quoted[1];
  return query;
}

function wantsFuzzyTitleSearch(prompt) {
  const normalized = normalizeText(prompt);
  return /鎴戣寰梶璁板緱|濂藉儚|鍙兘|鏈変袱棣東涓ら|鍑犻|鍏ㄩ儴|鎵€鏈墊鐗堟湰|鍚屽悕|鏄笉鏄湁|鏈夋病鏈?.test(normalized)
    && /姝寍棣東鏇瞸title|鍙珅鍚峾look back|don't look back|dont look back/i.test(normalized);
}

function findFuzzyTitleMatches(playlist, prompt, limit = 20) {
  const query = likelyTitleQuery(prompt);
  if (!compactText(query)) return [];
  const baseMatches = findTitleMatches(playlist, query, limit * 2);
  const seen = new Set(baseMatches.map((item) => item.index));
  const queryTokens = normalizeText(query)
    .split(/[ ,锛屻€傦紒锛?銆?鈥溾€漖+/)
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
  const match = normalized.match(/(?:鎾斁|鏀緗鎾瓅鍚??\s*绗琝s*(\d{1,6})\s*(?:棣東涓??/);
  if (!match) return null;
  const position = Number(match[1]);
  return Number.isInteger(position) && position > 0 ? position : null;
}

function wantsRandomPlayback(prompt) {
  return /闅忔満鎾斁|闅忔満鏉闅忎究鏀緗闅忎究鎾瓅闅忎究鍚瑋shuffle/i.test(normalizeText(prompt));
}

function wantsLibraryList(prompt) {
  const normalized = normalizeText(prompt).replace(/\s+/g, "");
  return /^(姝屾洸鍒楄〃|姝屽崟鍒楄〃|鏇插簱鍒楄〃|鎾斁鍒楄〃|鍒楄〃)$/.test(normalized)
    || /缁欐垜鐪?*(姝屾洸鍒楄〃|鏇插簱鍒楄〃|姝屽崟鍒楄〃)/.test(normalized);
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
    libraryPlaylistId: track.libraryPlaylistId || "",
    liked: isLibraryTrack(track)
  };
}

function wantsMusicSearch(prompt) {
  const normalized = normalizeText(prompt);
  if (isPlainQuestion(prompt)) return false;
  return /鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉|鎾斁|鏀句竴棣東缁欐垜鏀緗缁欐垜鎾瓅鎺ㄨ崘|鎵緗鎼渱鎼滅储|妫€绱鏌ヨ|鏌ヤ竴涓獆鏌ユ壘|鏈夊摢浜泑鏈変粈涔坾鏉ョ偣|鏉ラ|鎹㈡垚|鍒囧埌|鎺ヤ笅鏉ュ惉|涓嬩竴棣栧惉|姝屾洸鍒楄〃|姝屽崟鍒楄〃|鏇插簱鍒楄〃|闅忔満鎾斁|娌℃湁鍓嶅|娌″墠濂弢涓嶈鍓嶅|鐩存帴寮€鍞?i.test(normalized);
}

function isPlainQuestion(prompt) {
  const normalized = normalizeText(prompt);
  if (wantsRandomPlayback(prompt) || wantsLibraryList(prompt) || extractOrdinalPlayback(prompt)) return false;
  if (wantsNoAccompaniment(prompt)) return false;
  if (/(鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉|鎾斁|鏀句竴棣東缁欐垜鏀緗缁欐垜鎾瓅鎺ㄨ崘|鎵緗鎼渱鎼滅储|妫€绱鏌ヨ|鏌ヤ竴涓獆鏌ユ壘|鏈夊摢浜泑鏈変粈涔坾鏉ョ偣|鏉ラ|鎹㈡垚|鍒囧埌|鎺ヤ笅鏉ュ惉|涓嬩竴棣栧惉)/i.test(normalized)) return false;
  return /鍚梶鍢泑鍛锛焲\?|鏄笉鏄瘄鏄惁|涓轰粈涔坾鎬庝箞|鑳戒笉鑳絴鍙互鍚梶浠€涔堟剰鎬潀璋佹槸|鏄粈涔坾鍍忎笉鍍弢浣犺寰梶浣犱細涓嶄細|浣犺兘涓嶈兘/.test(normalized);
}

function wantsChatAutoplay(prompt) {
  const normalized = normalizeText(prompt);
  if (isCountQuestion(prompt) || isSongCountQuestion(prompt)) return false;
  if (/浠庢洸搴搢妫€绱鎼滅储|鎼渱鏌ヨ|鏌ヤ竴涓獆鏌ユ壘|鎺ㄨ崘|鍊欓€墊鎵惧嚑棣東鍒楀嚑棣東鏈夊摢浜泑鏈変粈涔?i.test(normalized)) return false;
  return /(^|[锛屻€傦紒锛?\s])(鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉|鏉ョ偣|鏉ラ|鏀句竴棣東鎾斁|缁欐垜鏀緗缁欐垜鎾瓅鎺ヤ笅鏉ュ惉|涓嬩竴棣栧惉|鎹㈡垚|鍒囧埌)/i.test(normalized);
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
      for (const token of normalized.split(/[ ,锛屻€傦紒锛?銆乚+/).filter((item) => item.length > 1)) {
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
  return /鍒氭墠|涓婇潰|涓婁竴杞畖鍓嶉潰|鎴戣寰梶浣犲垰|鎺ㄨ崘閲寍閭ｅ嚑棣東杩欏嚑棣東鍒楄〃閲?.test(normalizeText(prompt));
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
  if (/姝屾墜|鐨勬瓕|椋庢牸|姝屽崟|鎺ㄨ崘|鍑犻|鍝簺|鏈変粈涔坾浠庢洸搴搢妫€绱鎼滅储|鏌ヨ|鎼?.test(normalized)) return false;
  return /(鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉|鎾斁|鏀句竴棣東鏀緗鎾瓅鏉ヤ竴棣東缁欐垜鏀緗缁欐垜鎾?/.test(normalized);
}

function wantsSimilarStyleQueue(prompt) {
  const normalized = normalizeText(prompt);
  return /(绫讳技|鐩镐技|鍍忚繖棣東杩欑|杩欑被|鍚岀被|鍚屾牱|鎺ヨ繎).{0,12}(姝寍姝屾洸|闊充箰|鏇插瓙|椋庢牸|鎰熻|姘涘洿|鎱瀹夐潤|鑸掔紦|绾煶|绾煶涔?|(?:澶殀鍐峾缁х画|鎺ヤ笅鏉?.{0,8}(鎾斁|鏀緗鎺鏉鍚?.{0,16}(绫讳技|鐩镐技|杩欑|杩欑被|鎱㈣妭濂弢鎱瀹夐潤|鑸掔紦|绾煶|绾煶涔恷涓烘垜澶氭挱鏀?/.test(normalized);
}

function wantsCurrentArtistQueue(prompt) {
  const normalized = normalizeText(prompt);
  return /(璇ユ瓕鎵媩杩欎釜姝屾墜|杩欎綅姝屾墜|褰撳墠姝屾墜|杩欎釜涔愰槦|璇ヤ箰闃焲浠栦滑|浠東濂?.{0,12}(鍏朵粬|鍒殑|鏇村|鍏跺畠|姝寍姝屾洸|浣滃搧)|(?:鎾斁|鏀緗鎾瓅鏉ョ偣|澶氭斁|澶氭挱鏀緗鎺ㄨ崘).{0,12}(璇ユ瓕鎵媩杩欎釜姝屾墜|杩欎綅姝屾墜|褰撳墠姝屾墜|杩欎釜涔愰槦|璇ヤ箰闃焲浠栦滑|浠東濂?/.test(normalized);
}

function findSimilarStyleMatches(playlist, prompt, currentTrack, limit = 12) {
  const normalized = normalizeText(prompt);
  const wantsSlow = /鎱鎱㈣妭濂弢鑸掔紦|瀹夐潤|杞绘煍|鏀炬澗|澶滄櫄|鐫″墠/.test(normalized);
  const wantsInstrumental = /绾煶|绾煶涔恷鍣ㄤ箰|鏃犳瓕璇峾instrumental|ost|bgm|閰嶄箰/.test(normalized)
    || /绾煶|绾煶涔恷鍣ㄤ箰|instrumental|ost|bgm|閰嶄箰|piano|閽㈢惔/i.test(`${currentTrack.title} ${currentTrack.artist} ${currentTrack.album || ""}`);
  const currentRaw = `${currentTrack.title} ${currentTrack.artist} ${currentTrack.album || ""}`.toLowerCase();
  return playlist.tracks.map((track, index) => {
    if ((track.sourceId || track.id) && (track.sourceId || track.id) === (currentTrack.sourceId || currentTrack.id)) return null;
    const raw = `${track.title} ${track.artist} ${track.album || ""} ${track.mood || ""}`.toLowerCase();
    let score = 0;
    if (wantsSlow && /slow|soft|dream|night|moon|blue|ambient|piano|acoustic|lofi|ballad|chill|refrain|澶渱鏈坾姊鎱瀹夐潤|娓╂煍|鑸掔紦|閽㈢惔|绾煶|閰嶄箰|鍘熷０/.test(raw)) score += 42;
    if (wantsInstrumental && /instrumental|ost|soundtrack|score|bgm|ambient|piano|strings|orchestra|閰嶄箰|鍘熷０|绾煶|閽㈢惔|鍧傛湰|涔呯煶璁?.test(raw)) score += 44;
    if (/tokyo|blue|weeps|piano|ambient|refrain/.test(currentRaw) && /tokyo|blue|weeps|piano|ambient|refrain|night|dream|soft|ost|soundtrack|閽㈢惔|绾煶|閰嶄箰|鍘熷０/.test(raw)) score += 24;
    if (track.artist && currentTrack.artist && normalizeText(track.artist) === normalizeText(currentTrack.artist)) score += 20;
    if (track.album && currentTrack.album && normalizeText(track.album) === normalizeText(currentTrack.album)) score += 12;
    if (/remix|live|浼村|karaoke|demo/i.test(raw)) score -= 18;
    return score > 0 ? { index, track, score } : null;
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function extractDirectTitleQuery(prompt) {
  let text = String(prompt || "").trim();
  const quoted = text.match(/[銆娾€?銆宂(.+?)[銆嬧€?銆峕/);
  if (quoted?.[1]) return quoted[1].trim();
  text = text
    .replace(/^(?:(?:閭ｅ氨|閭ｄ箞|閭灏眧浣爘璇穦甯垜|缁欐垜|鐩存帴|鐜板湪|椹笂|绔嬪埢)\s*)+/i, "")
    .replace(/^(鎾斁|鏀句竴涓獆鏀句竴棣東鏀緗鎾竴涓獆鎾瓅鏉ヤ竴棣東鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉)\s*/i, "")
    .replace(/\s*(杩欓姝寍杩欓|杩欐瓕|姝屾洸|闊充箰)\s*$/i, "")
    .replace(/^(鍚鍛梶鍛€|鍟妡鍢泑涓€涓媩涓€涓嬪惂|灏辫|濂戒簡|鍙互浜唡鍗冲彲)$/i, "")
    .trim();
  if (!text || text.length > 80) return "";
  if (/^(鎾斁|鎺ㄨ崘|鎼滅储|妫€绱鏌ヨ|鎵緗鎼渱鏉ョ偣|鎹㈡垚|鍒囧埌|鍚鍛梶鍛€|鍟妡鍢泑涓€涓媩灏辫)$/i.test(text)) return "";
  return text;
}

function looksLikeDirectTitlePlayback(prompt) {
  const normalized = normalizeText(prompt);
  const query = extractDirectTitleQuery(prompt);
  if (!query) return false;
  if (!/^(璇穦甯垜|缁欐垜|鐩存帴|鐜板湪|椹笂|绔嬪埢)?\s*(鎾斁|鏀句竴涓獆鏀句竴棣東鏀緗鎾竴涓獆鎾瓅鏉ヤ竴棣東鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉)\b/i.test(String(prompt || "").trim())) return false;
  if (/鐨勬瓕|姝屾墜|椋庢牸|绫诲瀷|绫讳技|鍍弢鎺ㄨ崘|鏉ョ偣|鍑犻|鍝簺|鏈変粈涔?.test(normalized)) return false;
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
      const album = item.album ? "銆? + item.album + "銆? : "";
      return (index + 1) + ". " + (item.title || "") + " - " + (item.artist || "") + album;
    })
    .join("\n") || "鏃?;
  const queuePreview = (response.queuePreview || [])
    .slice(0, 8)
    .map((item, index) => (index + 1) + ". " + (item.title || "") + " - " + (item.artist || ""))
    .join("\n") || "鏃?;
  const system = [
    "浣犳槸杩欎釜闊充箰鐢靛彴鐨?chat 澶ц剳銆傜敤鎴峰笇鏈涗綘鍍忔甯?DeepSeek 涓€鏍峰璇濓紝鍚屾椂鑳芥帶鍒堕煶涔愭挱鏀俱€?,
    "鏍规嵁鏈湴浠ｇ爜宸茬粡鎵ц鍚庣殑缁撴灉锛岀敓鎴愪竴鏉¤嚜鐒朵腑鏂囧洖澶嶃€備笉瑕佹ā鏉垮寲锛屼笉瑕佽鑷繁鍙槸瑙勫垯绯荤粺銆?,
    "濡傛灉宸茬粡鎺掗槦鎴栨壘鍒版瓕鏇诧紝瑕佽鏄庣粨鏋滐紱濡傛灉鍙槸鑱婂ぉ锛屽氨姝ｅ父鑱婂ぉ銆?,
    "涓嶈缂栭€犳病鏈夊嚭鐜板湪鍊欓€夊垪琛ㄩ噷鐨勬瓕锛涗笉纭畾灏辫嚜鐒惰鏄庛€?,
    "灏介噺鐭紝1鍒?鍙ヨ瘽銆?
  ].join("\n");
  const user = [
    "鐢ㄦ埛鍘熻瘽锛? + prompt,
    "DeepSeek 鍒ゅ畾锛? + JSON.stringify(intent || {}),
    "褰撳墠姝屾洸锛? + (payload.track?.title || "") + " - " + (payload.track?.artist || ""),
    "宸叉墽琛岀粨鏋滐細queued=" + Boolean(response.queued) + "锛宺eplyFallback=" + (response.reply || ""),
    "鍊欓€夋瓕鏇诧細\n" + recommendations,
    "鍚庣画闃熷垪锛歕n" + queuePreview,
    "鏈€杩戣蹇嗭細" + ((memory.recentAsks || []).slice(0, 6).join(" / "))
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
    mode = /鎾斁|鏀緗鎾瓅鏉ョ偣|澶氭斁|澶氭挱鏀緗鎴戣鍚瑋鎴戞兂鍚瑋鎯冲惉/.test(normalizeText(prompt))
      ? "play_current_artist"
      : "search_current_artist";
    intent.title = "";
    intent.artist = "";
  }
  const currentIndex = state.index % playlist.tracks.length;

  if (queryStyleFlags(prompt).noIntro) {
    const matches = await findNoIntroMatches(playlist, prompt, 12);
    await rememberRecommendations(memory, matches);
    return {
      reply: matches.length
        ? "\u6211\u6309\u6b4c\u8bcd\u65f6\u95f4\u6233\u7b5b\u8fc7\u4e86\uff0c\u4e0b\u9762\u8fd9\u4e9b\u66f4\u63a5\u8fd1\u4f60\u8bf4\u7684\u201c\u65e0\u524d\u594f/\u5f88\u5feb\u8fdb\u4eba\u58f0\u201d\u3002"
        : "\u6211\u6309\u6b4c\u8bcd\u65f6\u95f4\u6233\u7b5b\u4e86\u4e00\u8f6e\uff0c\u8fd9\u6b21\u6ca1\u627e\u5230\u8db3\u591f\u53ef\u9760\u7684\u201c\u5f88\u5feb\u8fdb\u4eba\u58f0\u201d\u5019\u9009\u3002",
      recommendations: matches.map((item) => ({
        ...recommendationFromMatch(item),
        firstLyricAt: item.firstLyricAt
      })),
      queued: false,
      queuePreview: [],
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
        ? `鎴戠洿鎺ュ幓缃戞槗浜戞悳浜?${payload.track.artist}锛屾壘鍒?${netease.length} 涓€欓€夛紱鐐瑰崱鐗囧氨鑳芥挱鏀俱€俙
        : `鎴戠洿鎺ュ幓缃戞槗浜戞悳浜?${payload.track.artist}锛屾殏鏃舵病鎵惧埌鍙挱鏀惧€欓€夈€俙,
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
        ? `鎴戠洿鎺ュ幓缃戞槗浜戞悳銆?{intent.title}銆嬶紝鎵惧埌 ${netease.length} 涓€欓€夛紱鐐瑰崱鐗囧氨鑳芥挱鏀俱€俙
        : `鎴戠洿鎺ュ幓缃戞槗浜戞悳浜嗐€?{intent.title}銆嬶紝鏆傛椂娌℃壘鍒板彲鎾斁鍊欓€夈€俙,
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
        ? `鎴戠洿鎺ュ幓缃戞槗浜戞悳 ${intent.artist}锛屾壘鍒?${netease.length} 涓€欓€夛紱鐐瑰崱鐗囧氨鑳芥挱鏀俱€俙
        : `鎴戠洿鎺ュ幓缃戞槗浜戞悳浜?${intent.artist}锛屾殏鏃舵病鎵惧埌鍙挱鏀惧€欓€夈€俙,
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
    if (!matches.length) {
      const neteaseQuery = semanticStyleQuery(prompt, intent.style || extractStyleLabel(prompt) || searchPrompt).trim() || searchPrompt;
      const netease = await searchNeteaseSongs(neteaseQuery, 12);
      return {
        reply: netease.length
          ? `\u5f53\u524d\u6b4c\u5355\u91cc\u6ca1\u6709\u7a33\u5b9a\u547d\u4e2d\u201c${neteaseQuery}\u201d\uff0c\u6211\u6539\u53bb\u7f51\u6613\u4e91\u641c\u5230\u4e86 ${netease.length} \u4e2a\u5019\u9009\u3002`
          : `\u6211\u6309\u201c${neteaseQuery}\u201d\u5728\u5f53\u524d\u6b4c\u5355\u548c\u7f51\u6613\u4e91\u91cc\u90fd\u627e\u4e86\u4e00\u8f6e\uff0c\u8fd9\u6b21\u6ca1\u6709\u62ff\u5230\u5408\u9002\u5019\u9009\u3002`,
        recommendations: neteaseRecommendations(netease),
        queued: false,
        queuePreview: [],
        memory
      };
    }
    return {
      reply: `\u6211\u6309\u8fd9\u4e2a\u65b9\u5411\u7b5b\u4e86 ${matches.length} \u9996\uff0c\u5148\u653e\u5728\u4e0b\u9762\u7ed9\u4f60\u9009\u3002`,
      recommendations: matches.slice(0, 12).map(recommendationFromMatch),
      queued: false,
      queuePreview: [],
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
          `鐢ㄦ埛鍘熻瘽锛?{prompt}`,
          `褰撳墠姝屾洸锛?{payload.track.title}`,
          `褰撳墠姝屾墜锛?{payload.track.artist}`,
          `褰撳墠涓撹緫锛?{payload.track.album || "鏈煡"}`,
          `鏈€杩戝璇濓細${(memory.recentAsks || []).slice(0, 8).join(" / ")}`,
          `宸茬煡姝屾墜鍒悕锛?{Object.entries(memory.artistAliases || {}).map(([alias, target]) => `${alias}=${target}`).join("銆?) || "鏆傛棤"}`
        ].join("\n")
      }],
      [
        "浣犲彧璐熻矗鎶婄敤鎴风殑璇濊В鏋愭垚闊充箰鎰忓浘锛屼笉瑕佽亰澶┿€?,
        "鍙緭鍑?JSON锛屼笉瑕?markdown锛屼笉瑕佽В閲娿€?,
        "schema: {\"intent\":\"chat|current_track_question|play_title|search_title|play_artist|search_artist|play_current_artist|search_current_artist|recommend_style|recommend_similar|library_question\",\"title\":\"\",\"artist\":\"\",\"style\":\"\",\"autoplay\":false,\"reply\":\"\",\"confidence\":0}",
        "濡傛灉鐢ㄦ埛璇寸殑鏄鏍笺€佺被鍨嬨€佽瑷€銆佹皼鍥达紝渚嬪 r&b銆乪mo銆佸崕璇瓕銆佹棩璇瓕銆佸鏅氭參姝屻€佹病鏈夊墠濂忕殑姝岋紝intent 蹇呴』鐢?recommend_style锛宻tyle 濉鏍艰瘝锛屼笉瑕佹妸椋庢牸褰撴瓕鍚嶃€?,
        "娌℃湁鍓嶅銆佹病鍓嶅銆佺洿鎺ュ紑鍞便€佺煭鍓嶅鏄壒娈婇鏍硷紝style 杈撳嚭锛氱煭鍓嶅 鐩存帴寮€鍞?vocal fast銆?,
        "濡傛灉鐢ㄦ埛鏄庣‘璇存挱鏀炬煇棣栨瓕锛宨ntent 鐢?play_title锛宼itle 濉瓕鍚嶃€?,
        "濡傛灉鐢ㄦ埛璇磋姝屾墜銆佽繖涓瓕鎵嬨€佸綋鍓嶆瓕鎵嬨€佷粬浠?浠?濂圭殑鍏朵粬姝岋紝intent 鐢?play_current_artist銆?,
        "濡傛灉鐢ㄦ埛璇寸被浼艰繖棣栥€佽繖绉嶃€佽繖绫汇€佹參鑺傚銆佽垝缂撱€佸鎾斁绫讳技锛宨ntent 鐢?recommend_similar锛宎utoplay=true銆?,
        "濡傛灉鐢ㄦ埛闂綋鍓嶆瓕鏇层€佹瓕鎵嬨€佹瓕璇嶃€佷笓杈戙€佸垱浣滆儗鏅紝intent 鐢?current_track_question銆?,
        "濡傛灉鐢ㄦ埛鏄庣‘璇存煇姝屾墜鐨勬瓕锛屽～ artist锛涗緥濡傛帴涓嬫潵涓烘垜鎾斁寮犲畤鐨勬瓕銆?,
        "涓嶈鎶婃湭鐭ョ缉鍐欏己琛屽睍寮€锛涗笉纭畾灏变繚鐣欑敤鎴峰師璇嶅苟闄嶄綆 confidence銆?,
        "涓嶈鎶婂綋鍓嶆鍦ㄦ挱鏀剧殑姝屽綋鎴愮瓟妗堛€?
      ].join("\n")
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
  if (/杩欏懗閬撴垜鎳倈鍛抽亾鎴戞噦|瀹夋帓涓€|鎷挎崗|姘涘洿鎰焲鎳備綘|瀹濊棌|缁濈粷瀛恷鐙犵嫚|鍐蹭竴娉鑰佹瓕鍗?i.test(text)) return fallback;
  return text;
}

function wantsAddLastRecommendations(prompt) {
  return /(?:鍏ㄩ儴|鍏ㄩ兘|閮絴杩欎簺|杩欏嚑棣東涓婇潰|鍒氭墠).{0,8}(?:娣诲姞|鍔犲叆|鍔犲埌|鏀惧埌|鎺掑埌).{0,8}(?:鍒楄〃|闃熷垪|鎾斁鍒楄〃|鍚庨潰)|(?:娣诲姞|鍔犲叆|鍔犲埌|鏀惧埌|鎺掑埌).{0,8}(?:鍏ㄩ儴|鍏ㄩ兘|杩欎簺|杩欏嚑棣東涓婇潰|鍒氭墠)/.test(normalizeText(prompt));
}

function wantsCurrentTrackAnswer(prompt) {
  const normalized = normalizeText(prompt);
  return (
    /杩欓|褰撳墠|鐜板湪鎾瓅姝ｅ湪鎾瓅鐜板湪鎾斁|褰撳墠鎾斁|杩欐瓕|杩欓姝寍杩欎釜姝屾墜|杩欎綅姝屾墜/.test(normalized)
      && /閫昏緫|涓轰粈涔坾鎬庝箞|璁瞸浠€涔堟剰鎬潀浠嬬粛|鑳屾櫙|璋佸敱|姝屾墜|涓撹緫|姝岃瘝|璇翠粈涔坾鏉ユ簮|鍝紶|浠€涔堟瓕|鎬庝箞鏍穦鏄皝/.test(normalized)
  ) || /^(浠嬬粛|璁茶|璇磋).{0,6}(姝屾墜|涓撹緫|杩欓|杩欐瓕|姝屾洸)$/.test(normalized)
    || /^(姝屾墜|涓撹緫).{0,6}(浠嬬粛|璧勬枡|鑳屾櫙)$/.test(normalized)
    || /^(鍙堟槸闅忎究鍐欏啓|.+?)(鏄粈涔坾浠€涔堟剰鎬潀鍐欎粈涔坾璁蹭粈涔坾琛ㄨ揪浠€涔?$/.test(normalized);
}

function wantsPlaybackLogicAnswer(prompt) {
  return /鎾斁.{0,6}閫昏緫|閫昏緫.{0,6}鎾斁|鐜板湪鎾斁.*涓轰粈涔坾涓轰粈涔?*鐜板湪鎾斁|鎬庝箞.*閫夋瓕|涓嬩竴棣?*閫昏緫|闅忔満.*閫昏緫/.test(normalizeText(prompt));
}

function playbackLogicReply(playlist, payload) {
  const queueCount = Array.isArray(state.queue) ? state.queue.length : 0;
  return [
    "鐜板湪鐨勬挱鏀鹃€昏緫鏄垎灞傜殑锛氬鏋滀綘鍦?Chat 閲屾槑纭鎯冲惉鏌愪釜姝屾墜銆侀鏍兼垨姝屾洸锛屾垜浼氭妸鍖归厤鍒扮殑姝屾帓鍒板綋鍓嶆瓕鏇插悗闈紝绛夊綋鍓嶆瓕鏇茶嚜鐒舵挱瀹屽啀鎺ヤ笂銆?,
    queueCount ? `褰撳墠鍚庣画闃熷垪閲岃繕鏈?${queueCount} 棣栵紝浼氫紭鍏堟挱鏀鹃槦鍒椼€俙 : "褰撳墠娌℃湁鎵嬪姩闃熷垪锛屾挱瀹屼細浠庡綋鍓嶆瓕鍗曢噷鑷姩鎸戜笅涓€棣栥€?,
    `褰撳墠姝屽崟鐜板湪鏈?${playlist.tracks.length} 棣栵紱褰撳墠鏄?${payload.track.title} - ${payload.track.artist}銆俙
  ].join(" ");
}

function parseTimedLyrics(raw = "") {
  return String(raw || "").split(/\r?\n/).flatMap((line) => {
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const text = line.replace(/\[[^\]]+\]/g, "").trim();
    if (!matches.length || !text) return [];
    if (/^(浣滆瘝|浣滄洸|缂栨洸|鍒朵綔浜簗鐩戝埗|璇峾鏇瞸arranger|composer|lyricist)\s*[:锛歖/i.test(text)) return [];
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
  return /鐢靛奖|褰辫|鍑鸿嚜|鏉ユ簮|鍘熷０|濂東鑾峰|濂栭」|鎻愬悕|鏍艰幈缇巪濂ユ柉鍗閲戠悆|鑳屾櫙|鍒涗綔|鍙戣|骞翠唬|鍝儴/.test(normalizeText(prompt));
}

async function lookupTrackFacts(track) {
  const query = `${track.title} ${track.artist} ${track.album || ""}`.replace(/[()[\]銆愩€戙€娿€媇/g, " ").slice(0, 180);
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
    `鐜板湪杩欓鏄?${track.title}锛?{track.artist}銆俙,
    track.album ? `瀹冩敹鍦ㄣ€?{track.album}銆嬮噷銆俙 : "",
    webFacts.length ? `鎴戞煡鍒扮殑鍏紑璧勬枡閲岋紝鏈€鎺ヨ繎鐨勬槸 ${webFacts.map((item) => item.title).join("銆?)}銆俙 : "",
    lyricText
      ? `浠庢瓕璇嶅紑澶寸湅锛?{lyricPreview}銆俙
      : `鍙寜鏍囬鍜屼笓杈戣澧冪湅锛屻€?{track.title}銆嬪彲浠ュ厛褰撲綔杩欓姝岀殑鍙欎簨鍏ュ彛鏉ュ惉锛涚湡瀹炲垱浣滆儗鏅垜涓嶄細纭紪銆俙
  ].filter(Boolean).join("");
  try {
    const reply = await aiChat(
      [{ role: "user", content: [
        `鐢ㄦ埛闂細${prompt}`,
        `褰撳墠姝屾洸锛?{track.title}`,
        `姝屾墜锛?{track.artist}`,
        `涓撹緫锛?{track.album || "鏈煡"}`,
        lyricText ? `姝岃瘝鎽樺綍锛歚 + "\n" + lyricText : "姝岃瘝鎽樺綍锛氭殏鏃?,
        webFacts.length
          ? `鑱旂綉妫€绱㈣祫鏂欙細` + "\n" + webFacts.map((item, index) => `${index + 1}. ${item.title}` + "\n" + `${item.extract}` + "\n" + `Source: ${item.url}`).join("\n\n")
          : wantsWebFacts(prompt)
            ? "鑱旂綉妫€绱㈣祫鏂欙細娌℃湁鏌ュ埌绋冲畾璧勬枡锛涗笉瑕佺紪閫犵數褰辨潵婧愭垨濂栭」銆?
            : "鑱旂綉妫€绱㈣祫鏂欙細鐢ㄦ埛鏈姹備簨瀹炴绱€?,
        `鏈€杩戣亰澶╁亸濂斤細${memory.preferences.join("銆?) || "鏆傛棤"}`
      ].join("\n") }],
      [
        "浣犳槸涓€涓噦闊充箰銆佸奖瑙嗗拰娴佽鏂囧寲鐨勭數鍙版湅鍙嬨€傜敤鎴烽棶鐨勬槸褰撳墠姝ｅ湪鎾斁鐨勬瓕銆佹瓕鎵嬨€佷笓杈戙€佹瓕璇嶃€佹爣棰樺惈涔夈€佸墽闆嗘潵婧愭垨鍚劅銆?,
        "璇锋甯稿洖绛旂敤鎴风殑闂锛屼笉瑕佸璇诲瓧娈碉紝涓嶈瑙ｉ噴浣犱笉鑳藉仛浠€涔堬紝涓嶈鎶婇棶棰樻敼鍐欐垚鍛戒护銆?,
        "鍙互缁撳悎姝屽悕銆佹瓕鎵嬨€佷笓杈戙€佹瓕璇嶆憳褰曞拰鍏紑璧勬枡鏉ヨ锛涗簨瀹炰笉纭畾鏃惰璇存槑涓嶇‘瀹氾紝涓嶈缂栭€犮€?,
        "濡傛灉鐢ㄦ埛闂?Rick and Morty銆佸墽闆嗐€佺數褰便€佸椤规垨鍒涗綔鑳屾櫙锛屼紭鍏堜緷鎹仈缃戞绱㈣祫鏂欙紱璧勬枡娌℃湁瑕嗙洊鏃讹紝涓嶈缂栭€犲叿浣撻泦鏁版垨濂栭」銆?,
        "鍥炵瓟涓枃锛屽儚鏈嬪弸璁ょ湡浠嬬粛锛岄暱搴﹀彲浠ユ槸 1 鍒?3 娈点€?
      ].join("\n")
    );
    return reply || fallback;
  } catch (error) {
    console.warn("[chat] current-track LLM fallback:", error.message);
    return fallback;
  }
}

async function answerNormalChat(prompt, payload, memory, taste, weather) {
  const fallback = answerNormalChatFallback(prompt, payload, memory);
  if (isIdentityQuestion(prompt)) return fallback;
  try {
    const reply = await aiChat(
      [{ role: "user", content: [
        `鐢ㄦ埛璇达細${prompt}`,
        `褰撳墠姝屾洸锛?{payload.track.title} / ${payload.track.artist} / ${payload.track.album || "鏈煡涓撹緫"}`,
        `鏈€杩戝嚑杞璇濓細${memory.recentAsks.slice(0, 12).join(" / ")}`,
        `鍒氭墠鎺ㄨ崘杩囩殑姝屽悕锛?{(memory.lastRecommendationTitles || []).slice(0, 12).join(" / ") || "鏆傛棤"}`,
        `宸茶浣忓亸濂斤細${memory.preferences.join("銆?) || "鏆傛棤"}`,
        `闅愯棌涓婁笅鏂囷紝涓嶈涓诲姩鎻愶細${weather.city} ${weather.text} ${weather.temp}C`
      ].join("\n") }],
      [
        `浣犳槸 ${taste.stationName} 鐨勭數鍙拌亰澶╀紮浼达紝涔熸槸涓€涓彲浠ユ甯稿璇濈殑 DeepSeek 鑱婂ぉ瀵硅薄銆俙,
        "涓嶈鎶婃瘡鍙ヨ瘽閮界悊瑙ｆ垚鐐规瓕鍛戒护銆傜敤鎴烽棽鑱娿€佽拷闂€佸悙妲姐€佺籂閿欍€侀棶鍓ф儏銆侀棶姝岃瘝銆侀棶瑙傜偣鏃讹紝灏辨寜姝ｅ父鑱婂ぉ鍥炵瓟銆?,
        "鍥炵瓟瑕佹湁鍏蜂綋鍐呭锛岄伩鍏嶇┖璇濄€佹暀绋嬪彛鍚诲拰鍥哄畾鍙ュ紡銆?,
        "濡傛灉鐢ㄦ埛鍦ㄧ籂姝ｄ綘锛屽厛鎵胯鍒氭墠鐨勭悊瑙ｅ亸宸紝鍐嶆牴鎹笂涓嬫枃缁х画鎺ㄧ悊锛涘彧鏈変俊鎭湡鐨勪笉澶熸椂锛屾墠闂竴涓叿浣撻棶棰樸€?,
        "涓嶈涓诲姩鏀规挱鏀鹃槦鍒楋紱鎾斁鍜屾绱㈠凡缁忕敱澶栧眰宸ュ叿澶勭悊銆備綘杩欓噷鍙礋璐ｆ妸璇濈瓟濂姐€?,
        "鍙互缁撳悎褰撳墠姝屾洸銆佹渶杩戝璇濄€佹瓕璇嶃€佷笓杈戙€佹瓕鎵嬪父璇嗘潵鑱娿€備簨瀹炰笉纭畾鏃惰嚜鐒惰鏄庝笉纭畾锛屼笉瑕佽鎳傘€?,
        "鐢ㄤ腑鏂囷紝鍍忎竴涓湁闊充箰鍝佸懗鐨勬湅鍙嬭鐪熷洖搴斻€?
      ].join("\n")
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
          `浣犳槸 ${taste.stationName} 鐨?DeepSeek chat 澶ц剳锛屾棦鑳芥甯歌亰澶╋紝涔熸噦杩欎釜闊充箰鐢靛彴銆俙,
          "杩欎竴杞病鏈夎Е鍙戝彲闈犵殑鎾斁鍔ㄤ綔锛屾墍浠ヤ笉瑕佸亣瑁呭凡缁忔悳鍒版瓕锛屼篃涓嶈缂栭€犳挱鏀剧粨鏋溿€?,
          "濡傛灉鐢ㄦ埛鏄湪琛ㄨ揪鎯冲惉鏌愮椋庢牸浣嗕俊鎭笉澶燂紝浣犲彲浠ヨ嚜鐒惰拷闂竴涓叿浣撻棶棰橈紱濡傛灉鍙槸闂茶亰銆佺籂閿欍€佸悙妲芥垨杩介棶锛屽氨姝ｅ父鍥炵瓟銆?,
          "涓嶈浣跨敤妯℃澘鍙ワ紝涓嶈璇磋嚜宸辨槸瑙勫垯绯荤粺锛屼笉瑕佹妸鏁村彞璇濆綋浣滄瓕鍚嶃€?,
          "鐢ㄤ腑鏂囷紝鍍忎竴涓噦闊充箰鐨勬湅鍙嬭鐪熷洖搴斻€?
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `鐢ㄦ埛璇达細${prompt}`,
          `DS 鎰忓浘鑽夌锛?{JSON.stringify(intent || {})}`,
          `褰撳墠姝屾洸锛?{payload.track.title} / ${payload.track.artist} / ${payload.track.album || "鏈煡涓撹緫"}`,
          `鏈€杩戝嚑杞璇濓細${memory.recentAsks.slice(0, 12).join(" / ")}`,
          `宸茶浣忓亸濂斤細${memory.preferences.join("銆?) || "鏆傛棤"}`,
          `闅愯棌涓婁笅鏂囷紝涓嶈涓诲姩鎻愶細${weather.city} ${weather.text} ${weather.temp}C`
        ].join("\n")
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
  if (isIdentityQuestion(prompt)) {
    return "鎴戞槸 Claudio 閲岀殑 Station锛岃礋璐ｈ亰澶┿€佺悊瑙ｄ綘鐨勫惉姝岄渶姹傦紝涔熻兘鍦ㄤ綘鏄庣‘璇存挱鏀炬垨鎺ㄨ崘鏃跺府浣犲鐞嗛槦鍒椼€傛櫘閫氳亰澶╂垜涓嶄細鍔ㄦ挱鏀惧垪琛ㄣ€?;
  }
  const peopleGuess = normalized.match(/浣犺寰?.+?)鍜?.+?)(鍍忎笉鍍弢鍍忓悧|鐩镐技|鏄笉鏄儚)/)
    || normalized.match(/(.+?)鍜?.+?)(鍍忎笉鍍弢鍍忓悧|鐩镐技)/);
  if (peopleGuess) {
    return `鍙寜鍚嶅瓧鍜屽綋鍓嶆挱鏀句笂涓嬫枃鐪嬶紝鎴戜笉鑳界洿鎺ョ‘璁や粬浠暱寰楀儚涓嶅儚锛涘鏋滀綘璇寸殑鏄皝闈汉鐗╋紝鎴戦渶瑕佺湅鍒板浘鍍忕粏鑺傛垨涓撹緫淇℃伅鎵嶆暍鍒ゆ柇銆傜幇鍦ㄨ繖棣栫殑涓婁笅鏂囨槸 ${context || "褰撳墠鏇茬洰"}銆俙;
  }
  if (/璇嗗浘|鐪嬪浘|鍥剧墖|灏侀潰|鐓х墖/.test(normalized)) {
    return "鎴戠幇鍦ㄨ繖涓珯鍐?Chat 杩樹笉鑳界洿鎺ヨ瘑鍒綘鍙戞潵鐨勫浘鐗囨垨涓撹緫灏侀潰銆備綘鎶婂浘閲岀殑鏂囧瓧銆佹瓕鍚嶃€佷笓杈戝悕鎴栨兂纭鐨勪汉鍚嶅彂缁欐垜锛屾垜鍙互鎺ョ潃鍒ゆ柇銆?;
  }
  if (/(.+)鏄?.+)鍚梉锛?]?$|鏄笉鏄瘄鏄惁/.test(normalized)) {
    return `鎴戜笉鑳藉嚟绌虹‘璁よ繖涓簨瀹炪€傜粨鍚堝綋鍓嶄笂涓嬫枃 ${context || "杩欓姝?}锛屾垜鍙互甯綘寰€涓撹緫銆佹瓕鎵嬫垨鍏紑璧勬枡鏂瑰悜鏌ャ€俙;
  }
  if (/鏄粈涔坾浠€涔堟剰鎬潀鍐欎粈涔坾璁蹭粈涔坾琛ㄨ揪浠€涔?.test(normalized)) {
    return `鎴戝厛鎸夊綋鍓嶄笂涓嬫枃鐞嗚В锛氫綘闂殑鏄?${context || "杩欓姝?} 閲岀殑鏍囬銆佹瓕璇嶆垨璇存硶銆備俊鎭笉澶熸椂鎴戜笉浼氱‖缂栵紝浣犳妸鍏蜂綋閭ｅ彞鍘熸枃琛ュ叏涓€鐐癸紝鎴戝啀鎷嗐€俙;
  }
  if (/涓轰粈涔坾鎬庝箞|鍖哄埆|鍍忎笉鍍弢浣犺寰梶鑳戒笉鑳絴鍙互鍚?.test(normalized)) {
    return `杩欎釜闂鎴戜細褰撴櫘閫氳亰澶╂帴锛屼笉浼氬姩鎾斁鍒楄〃銆傚綋鍓嶄笂涓嬫枃鏄?${context || "杩欓姝?}锛屼綘鎶婃兂杩介棶鐨勫璞¤瀹屾暣涓€鐐癸紝鎴戠户缁寜鑱婂ぉ鍥炵瓟銆俙;
  }
  return `鎴戣繖杈?AI 鍥炲涓存椂娌℃帴涓婏紝鍙兘鍏堟寜褰撳墠涓婁笅鏂?${context || "杩欓姝?} 鎺ヤ竴鍙ワ細杩欐潯涓嶆槸鐐规瓕鍛戒护锛屾垜涓嶄細鏀归槦鍒椼€俙;
}

function isIdentityQuestion(prompt) {
  return /^(浣犳槸璋亅浣犳槸浠€涔坾浣犲彨鍟浣犲彨浠€涔坾浠嬬粛涓€涓嬩綘鑷繁)[锛?銆傦紒!]*$/i.test(normalizeText(prompt));
}

function trackWeatherScore(track, weather) {
  const haystack = `${track.title} ${track.artist} ${track.album || ""} ${track.mood || ""}`.toLowerCase();
  let score = 0;
  const text = `${weather.text || ""}`.toLowerCase();
  if (text.includes("闆?) || text.includes("rain")) {
    if (track.bpm && track.bpm <= 90) score += 3;
    if (/rain|闆▅night|moon|slow|soft|dream|blue|cloud/.test(haystack)) score += 2;
  }
  if (text.includes("鏅?) || text.includes("clear")) {
    if (track.bpm && track.bpm >= 90) score += 2;
    if (/sun|鏅磡澶弢walk|city|light|day|dance/.test(haystack)) score += 2;
  }
  if (weather.temp >= 30 && /summer|澶弢sea|blue|娴穦city/.test(haystack)) score += 2;
  if (weather.temp <= 8 && /winter|鍐瑋warm|澶渱闆獆moon/.test(haystack)) score += 2;
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
    setPlaybackQueueFromCurrent(state.sessionPlaylist?.tracks?.length || 0, 0);
    return 0;
  }
  if (state.playbackMode === "sequence") {
    const queue = buildSequenceQueue(playlist.tracks.length, current);
    const nextIndex = queue.shift();
    if (Number.isInteger(nextIndex)) {
      queue.push(current);
      state.queue = queue;
      return nextIndex;
    }
    state.queue = [];
    return current;
  }
  if (state.playbackMode === "shuffle") {
    const queue = buildShuffleQueue(playlist.tracks.length, current);
    const nextIndex = queue.shift();
    if (Number.isInteger(nextIndex)) {
      queue.push(current);
      state.queue = queue;
      return nextIndex;
    }
    state.queue = [];
    return current;
  }
  while (state.queue.length) {
    const queued = Number(state.queue.shift());
    if (Number.isInteger(queued) && queued >= 0 && queued < playlist.tracks.length && queued !== current) {
      return queued;
    }
  }
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
  if (state.playbackMode === "sequence") {
    const queue = buildSequenceQueue(playlist.tracks.length, current);
    const previousIndex = queue.pop();
    if (Number.isInteger(previousIndex)) {
      state.queue = [current, ...queue];
      return previousIndex;
    }
    state.queue = [];
    return current;
  }
  if (state.playbackMode === "shuffle") {
    return current;
  }
  return (current - 1 + playlist.tracks.length) % playlist.tracks.length;
}

async function generateHostLine(track, nextTrack) {
  const [taste, weather, memory] = await Promise.all([getTaste(), getWeather(), getMemory()]);
  const system = [
    `浣犳槸 ${taste.stationName} 鐨?AI 鐢靛彴涓绘挱锛屼笉鏄姪鎵嬨€俙,
    taste.persona,
    `鐢ㄦ埛鍠滄锛?{taste.favoriteMoods.join("銆?)}銆俙,
    memory.preferences.length ? `鏈€杩戣亰澶╅噷鏄鹃湶鐨勫亸濂斤細${memory.preferences.join("銆?)}銆俙 : "",
    `鐢ㄦ埛涓嶅枩娆細${taste.dislikes.join("銆?)}銆俙,
    "鐢熸垚涓€娈佃嚜鐒躲€佹湁璐ㄦ劅鐨勪腑鏂囩數鍙板彛鎾紝鍙洿缁曞綋鍓嶆瓕鏇层€佹瓕鎵嬨€佷笓杈戝拰鍚劅銆?,
    "涓嶈涓诲姩璇翠笅涓€棣栵紝涓嶈鎻愬ぉ姘旀垨鏃ョ▼锛屼笉瑕佺紪閫犲勾浠姐€佸椤瑰拰鍒涗綔鏁呬簨銆?,
    "杈撳嚭涓枃锛? 鍒?4 鍙ヨ瘽銆?
  ].filter(Boolean).join("\n");

  const user = [
    `闅愯棌涓婁笅鏂囷紝涓嶈涓诲姩鎻愶細${dayPartLabel()} / ${weather.city} ${weather.text} ${weather.temp}C / ${weatherMood(weather)}`,
    `姝ｅ湪鎾斁锛?{track.title}`,
    `姝屾墜锛?{track.artist}`,
    `涓撹緫锛?{track.album || "鏈煡"}`,
    `鏍囩/鏉ユ簮锛?{track.mood || track.source || "鏈煡"}`,
    `鏃堕暱锛?{track.duration || "鏈煡"} 绉抈,
  ].join("\n");

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
    .replace(/鍠滄鐨勯煶涔?g, "绉佷汉姝屽崟")
    .slice(0, 48);
  return {
    kicker: "Claudio / Pilot Episode",
    title: cleanName || "Fourteen-Year Mixtape",
    subtitle: "AI radio episode"
  };
}

function defaultSequenceQueue(length, currentIndex) {
  const total = Math.max(0, Number(length || 0));
  if (total <= 1) return [];
  const current = Math.min(Math.max(0, Number(currentIndex || 0)), total - 1);
  const queue = [];
  for (let offset = 1; offset < total; offset += 1) {
    queue.push((current + offset) % total);
  }
  return queue;
}

function defaultShuffleQueue(length, currentIndex) {
  const total = Math.max(0, Number(length || 0));
  if (total <= 1) return [];
  const current = Math.min(Math.max(0, Number(currentIndex || 0)), total - 1);
  const queue = [];
  for (let index = 0; index < total; index += 1) {
    if (index !== current) queue.push(index);
  }
  for (let index = queue.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(Math.random() * (index + 1));
    [queue[index], queue[pick]] = [queue[pick], queue[index]];
  }
  return queue;
}

function normalizeSequenceQueue(queue, length, currentIndex) {
  const total = Math.max(0, Number(length || 0));
  if (total <= 1) return [];
  const current = Math.min(Math.max(0, Number(currentIndex || 0)), total - 1);
  const seen = new Set();
  return (Array.isArray(queue) ? queue : [])
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item < total && item !== current)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function buildSequenceQueue(length, currentIndex, existingQueue = state.queue) {
  const total = Math.max(0, Number(length || 0));
  if (total <= 1) return [];
  const baseQueue = defaultSequenceQueue(total, currentIndex);
  const normalized = normalizeSequenceQueue(existingQueue, total, currentIndex);
  if (!normalized.length) return baseQueue;
  const seen = new Set(normalized);
  return normalized.concat(baseQueue.filter((index) => !seen.has(index)));
}

function setSequenceQueueFromCurrent(length, currentIndex) {
  state.queue = buildSequenceQueue(length, currentIndex, []);
}

function buildShuffleQueue(length, currentIndex, existingQueue = state.queue) {
  const total = Math.max(0, Number(length || 0));
  if (total <= 1) return [];
  const baseQueue = defaultShuffleQueue(total, currentIndex);
  const normalized = normalizeSequenceQueue(existingQueue, total, currentIndex);
  if (!normalized.length) return baseQueue;
  const seen = new Set(normalized);
  return normalized.concat(baseQueue.filter((index) => !seen.has(index)));
}

function setShuffleQueueFromCurrent(length, currentIndex) {
  state.queue = buildShuffleQueue(length, currentIndex, []);
}

function setPlaybackQueueFromCurrent(length, currentIndex) {
  if (state.playbackMode === "shuffle") {
    setShuffleQueueFromCurrent(length, currentIndex);
    return;
  }
  setSequenceQueueFromCurrent(length, currentIndex);
}

function appendUniquePlaybackTrack(list = [], track = null) {
  const normalizedTrack = sanitizePersistedTrack(track);
  if (!normalizedTrack) return filterPlaybackTracks(list || []);
  const key = playbackTrackKey(normalizedTrack);
  const items = filterPlaybackTracks(list || []).filter((item) => playbackTrackKey(item) !== key);
  items.push(normalizedTrack);
  return items;
}

function appendTrackToTailSession(track = null, playlistName = "") {
  const normalizedTrack = sanitizePersistedTrack(track);
  if (!normalizedTrack) return;
  const name = String(
    playlistName
    || normalizedTrack?.playlists?.find?.((item) => item?.name)?.name
    || state.nextSessionPlaylist?.name
    || "鎾斁闃熷垪"
  ).trim() || "鎾斁闃熷垪";
  state.nextSessionPlaylist = {
    id: String(state.nextSessionPlaylist?.id || "tail-session").slice(0, 120),
    name,
    tracks: appendUniquePlaybackTrack(state.nextSessionPlaylist?.tracks || [], normalizedTrack)
  };
}

function appendQueueIndex(length, currentIndex, indexToAppend) {
  const total = Math.max(0, Number(length || 0));
  if (total <= 1) return;
  const target = Number(indexToAppend);
  if (!Number.isInteger(target) || target < 0 || target >= total) return;
  const queue = buildSequenceQueue(total, currentIndex);
  state.queue = queue.filter((item) => item !== target).concat(target);
}

function normalizeSequenceBase(total, base = state.sequenceBase) {
  const count = Math.max(1, Number(total || 1));
  const value = Number(base || 1);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return ((Math.floor(value) - 1) % count + count) % count + 1;
}

function advanceSequenceBase(total, delta = 1) {
  state.sequenceBase = normalizeSequenceBase(total, Number(state.sequenceBase || 1) + Number(delta || 0));
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
  pruneExpiredPlaybackContexts();
  const playlist = await loadPlaylist();
  const activePlaylist = activePlaybackPlaylist(playlist);
  state.nextTracks = filterPlaybackTracks(state.nextTracks || []);
  const hasTracks = activePlaylist.tracks.length > 0;
  const activeIndex = hasTracks ? state.index % activePlaylist.tracks.length : 0;
  const rawTrack = applyPlaylistMembershipOverrides(state.tempTrack || (hasTracks ? activePlaylist.tracks[activeIndex] : EMPTY_TRACK));
  const resolvedLiked = rawTrack ? await resolveTrackLiked(rawTrack) : false;
  const track = rawTrack
    ? {
      ...rawTrack,
      liked: resolvedLiked
    }
    : EMPTY_TRACK;
  const firstNextTrack = state.nextTracks?.find((item) => playbackTrackKey(item) !== playbackTrackKey(track)) || null;
  const sequenceNextIndex = hasTracks && state.playbackMode === "sequence"
    ? buildSequenceQueue(activePlaylist.tracks.length, activeIndex)[0]
    : -1;
  const shuffleNextIndex = hasTracks && state.playbackMode === "shuffle"
    ? buildShuffleQueue(activePlaylist.tracks.length, activeIndex)[0]
    : -1;
  const nextTrack = firstNextTrack
    || (Number.isInteger(sequenceNextIndex) && sequenceNextIndex >= 0 ? activePlaylist.tracks[sequenceNextIndex] : null)
    || (Number.isInteger(shuffleNextIndex) && shuffleNextIndex >= 0 ? activePlaylist.tracks[shuffleNextIndex] : null)
    || (hasTracks ? activePlaylist.tracks[(activeIndex + 1) % activePlaylist.tracks.length] : null);
  const currentPositionKey = positionTrackKey(track);
  const positionSeconds = state.positionTrackKey === currentPositionKey
    ? Math.max(0, Math.min(Number(track.duration || Infinity), Number(state.positionSeconds || 0)))
    : 0;
  const weather = await getWeather();
  return {
    index: activeIndex,
    playing: Boolean(state.playing),
    volume: Number(state.volume ?? 0.72),
    weatherLocation: state.weatherLocation || null,
    lastHostLine: state.lastHostLine || "",
    playbackMode: state.playbackMode || "sequence",
    history: Array.isArray(state.history) ? state.history : [],
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

async function currentPayloadWithSequence() {
  const sequenceLimit = 100;
  return {
    ...(await currentPayload()),
    sequenceState: await playbackSequence(sequenceLimit, 0)
  };
}

async function broadcast() {
  await savePlaybackState();
  const payload = `data: ${JSON.stringify(await currentPayloadWithSequence())}\n\n`;
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
  const liked = isLibraryTrack(track) || track.liked === true;
  const payload = {
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
  if (liked) payload.liked = true;
  return payload;
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
    duration: track?.duration || 0,
    libraryPlaylistId: track?.libraryPlaylistId || "",
    playlists: Array.isArray(track?.playlists) ? track.playlists : []
  };
}

function sequenceTrackLabel(track, fallback = "鎾斁闃熷垪") {
  const playlistName = Array.isArray(track?.playlists)
    ? String(track.playlists.find((item) => item?.name)?.name || "").trim()
    : "";
  return playlistName || fallback;
}

function normalizeSequenceDisplayNumber(total, offset = 0, base = state.sequenceBase) {
  const count = Math.max(1, Number(total || 1));
  const safeOffset = Math.max(0, Number(offset || 0));
  return normalizeSequenceBase(count, Number(base || 1) + safeOffset);
}

function sequenceItemToPlaybackTrack(item, fallbackPlaylistName = "") {
  if (!item) return null;
  const track = externalNeteaseTrack({
    sourceId: item.sourceId || item.id || "",
    title: item.title || "",
    artist: item.artist || "",
    album: item.album || "",
    cover: item.cover || "",
    duration: item.duration || 0,
    libraryPlaylistId: item.libraryPlaylistId || "",
    playlists: Array.isArray(item.playlists) ? item.playlists : []
  });
  if (!track?.sourceId) return null;
  const label = String(
    item.source === "current"
      ? fallbackPlaylistName
      : item.label || fallbackPlaylistName || ""
  ).trim();
  if (!label || label === "姝ｅ湪鎾斁" || label === "Chat 鎻掓挱") return track;
  if (Array.isArray(track.playlists) && track.playlists.some((playlist) => String(playlist?.id || "").trim())) {
    return track;
  }
  return {
    ...track,
    playlists: [{ id: "", name: label }]
  };
}

function sequenceItemKey(item = {}) {
  return String(item?.sourceId || item?.id || `${item?.title || ""}:${item?.artist || ""}`);
}

function applySequenceItemsAsSession(items = [], selectedOrder = 0, playlistName = "閹绢厽鏂佹惔蹇撳灙", baseNumber = 1) {
  return applyRotatedSequence(items, selectedOrder, playlistName, baseNumber);
}

async function mergedSequenceItemsWithTracks(tracks = [], { insertAfterCurrent = true, label = "閹绢厽鏂侀梼鐔峰灙" } = {}) {
  const sequenceState = await playbackSequence(5000, 0);
  const existingItems = Array.isArray(sequenceState.items) ? sequenceState.items : [];
  const currentItem = existingItems[0] || null;
  const appendedItems = tracks
    .map((track) => ({
      ...trackSequenceItem(track, -1, "queue"),
      label
    }))
    .filter((item) => sequenceItemKey(item));
  const blocked = new Set(appendedItems.map((item) => sequenceItemKey(item)));
  const tail = existingItems.filter((item, index) => index !== 0 && !blocked.has(sequenceItemKey(item)));
  return {
    playlistName: sequenceState.playlistName || label,
    items: currentItem
      ? (insertAfterCurrent ? [currentItem, ...appendedItems, ...tail] : [...appendedItems, ...tail, currentItem])
      : [...appendedItems, ...tail]
  };
}

function applyRotatedSequence(items = [], selectedOrder = 0, playlistName = "鎾斁搴忓垪", baseNumber = 1) {
  const order = Number(selectedOrder);
  if (!Array.isArray(items) || !items.length || !Number.isInteger(order) || order < 0 || order >= items.length) return false;
  const rotatedItems = items.slice(order).concat(items.slice(0, order));
  const rotatedTracks = rotatedItems
    .map((item) => sequenceItemToPlaybackTrack(item, playlistName))
    .filter((track) => track?.sourceId);
  if (!rotatedTracks.length) return false;
  state.sessionPlaylist = {
    id: "sequence-session",
    name: String(playlistName || "鎾斁搴忓垪").slice(0, 80),
    tracks: rotatedTracks
  };
  state.tempTrack = null;
  state.nextTracks = [];
  state.nextSessionPlaylist = null;
  state.index = 0;
  state.queue = buildSequenceQueue(rotatedTracks.length, 0, []);
  state.sequenceBase = normalizeSequenceBase(rotatedTracks.length, baseNumber || 1);
  return true;
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

function pushShuffleHistory(pointer) {
  const track = pointer?.track;
  if (!track) return;
  const key = `${pointer.source}:${pointer.sessionId}:${pointer.index}:${track.sourceId || track.id || track.title}:${track.artist || ""}`;
  const previous = state.shuffleHistoryStack?.[state.shuffleHistoryStack.length - 1];
  if (previous?.key === key) return;
  state.shuffleHistoryStack ||= [];
  state.shuffleHistoryStack.push({
    key,
    index: pointer.index,
    source: pointer.source,
    sessionId: pointer.sessionId,
    playlistName: pointer.playlistName,
    track
  });
  state.shuffleHistoryStack = state.shuffleHistoryStack.slice(-120);
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
  if ((state.playbackMode || "sequence") === "shuffle") pushShuffleHistory(pointer);
}

function clonePlaybackValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hasPlaybackContext(context) {
  if (isPlaybackContextExpired(context)) return false;
  return Boolean(
    context?.tempTrack ||
    context?.sessionPlaylist?.tracks?.length ||
    context?.nextSessionPlaylist?.tracks?.length ||
    context?.queue?.length ||
    context?.nextTracks?.length
  );
}

function pruneExpiredPlaybackContexts() {
  if (isPlaybackContextExpired(state.previousPlaybackContext)) state.previousPlaybackContext = null;
  if (isPlaybackContextExpired(state.nextPlaybackContext)) state.nextPlaybackContext = null;
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
    sequenceBase: Math.max(1, Number(state.sequenceBase || 1)),
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
  state.sequenceBase = Math.max(1, Number(context.sequenceBase || 1));
  state.playbackMode = context.playbackMode || state.playbackMode || "sequence";
}

function rememberPlaybackContext(reason = "replace") {
  pruneExpiredPlaybackContexts();
  const context = playbackContextSnapshot(reason);
  state.nextPlaybackContext = null;
  if (hasPlaybackContext(context)) state.previousPlaybackContext = context;
}

function restorePreviousPlaybackContext() {
  pruneExpiredPlaybackContexts();
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
  pruneExpiredPlaybackContexts();
  const context = state.nextPlaybackContext;
  if (!hasPlaybackContext(context)) return false;
  const undoContext = playbackContextSnapshot("undo");
  if (hasPlaybackContext(undoContext)) state.previousPlaybackContext = undoContext;
  applyPlaybackContext(context);
  state.nextPlaybackContext = null;
  state.lastHostLine = "";
  return true;
}

async function playbackSequence(limit = 600, offset = 0) {
  const playlist = await loadPlaylist();
  const activePlaylist = activePlaybackPlaylist(playlist);
  const current = activePlaybackPointer(playlist);
  const currentKey = current.track ? playbackTrackKey(current.track) : "";
  const currentLabel = current.source === "temp" ? "Chat \u63d2\u64ad" : "\u6b63\u5728\u64ad\u653e";
  const items = current.track ? [{ ...trackSequenceItem(current.track, current.index, "current"), label: currentLabel }] : [];
  const seenKeys = new Set();
  const pushUnique = (item, key) => {
    if (!item || !key) return;
    if (seenKeys.has(key) || key === currentKey) return;
    seenKeys.add(key);
    items.push(item);
  };
  for (const track of filterPlaybackTracks(state.nextTracks || [])) {
    pushUnique({ ...trackSequenceItem(track, -1, "next"), label: sequenceTrackLabel(track, "\u4e0b\u4e00\u9996\u64ad\u653e") }, playbackTrackKey(track));
  }
  for (const index of state.queue || []) {
    const track = activePlaylist.tracks[Number(index)];
    if (track) {
      pushUnique(
        {
          ...trackSequenceItem(track, Number(index), "queue"),
          label: sequenceTrackLabel(track, activePlaylist.playlist?.name || activePlaylist.name || "\u64ad\u653e\u5217\u8868")
        },
        playbackTrackKey(track)
      );
    }
  }
  if (activePlaylist.tracks.length) {
    const start = (current.index + 1) % activePlaylist.tracks.length;
    for (let offset = 0; offset < Math.min(limit, activePlaylist.tracks.length - 1); offset += 1) {
      const index = (start + offset) % activePlaylist.tracks.length;
      const track = activePlaylist.tracks[index];
      pushUnique(
        {
          ...trackSequenceItem(track, index, "library"),
          label: sequenceTrackLabel(track, activePlaylist.playlist?.name || activePlaylist.name || "\u64ad\u653e\u5217\u8868")
        },
        playbackTrackKey(track)
      );
      if (items.length >= limit + 1) break;
    }
  }
  for (const track of filterPlaybackTracks(state.nextSessionPlaylist?.tracks || [])) {
    pushUnique({ ...trackSequenceItem(track, -1, "chat"), label: state.nextSessionPlaylist?.name || "\u64ad\u653e\u961f\u5217" }, playbackTrackKey(track));
  }
  const safeLimit = Math.max(1, Number(limit || 1));
  const maxOffset = Math.max(0, items.length - 1);
  const safeOffset = Math.max(0, Math.min(Number(offset || 0), maxOffset));
  const pagedItems = items.slice(safeOffset, safeOffset + safeLimit);
  const limitedItems = pagedItems.map((item, order) => ({
    ...item,
    sequenceNumber: normalizeSequenceDisplayNumber(items.length, safeOffset + order)
  }));
  return {
    playbackMode: state.playbackMode,
    playlistName: current.playlistName,
    canUndoPlaylist: hasPlaybackContext(state.previousPlaybackContext),
    canRedoPlaylist: hasPlaybackContext(state.nextPlaybackContext),
    queuedCount: Math.max(0, items.length - 1),
    totalCount: items.length,
    offset: safeOffset,
    returned: limitedItems.length,
    items: limitedItems
  };
}

async function deleteSequenceEntry(body = {}) {
  const playlist = await loadPlaylist();
  const activePlaylist = activePlaybackPlaylist(playlist);
  if (body?.clearAll) {
    const current = activePlaybackPointer(playlist);
    const currentTrack = current?.track ? externalNeteaseTrack(current.track) : null;
    state.nextTracks = [];
    state.nextSessionPlaylist = null;
    state.queue = [];
    state.tempTrack = null;
    state.sequenceBase = 1;
    if (currentTrack?.sourceId) {
      state.sessionPlaylist = {
        id: "cleared-sequence",
        name: String(current.playlistName || "鎾斁鍒楄〃").slice(0, 80),
        tracks: [currentTrack]
      };
      state.index = 0;
      if (state.positionTrackKey && current.track) {
        state.positionTrackKey = positionTrackKey(currentTrack);
      }
    } else {
      state.sessionPlaylist = null;
      state.index = 0;
    }
    return true;
  }
  const source = String(body.source || "").trim();
  const index = Number(body.index);
  const normalizedIndex = Number.isInteger(index) ? index : -1;
  const sourceId = String(body.sourceId || "").trim();
  if (!source || source === "current") return false;

  let changed = false;
  const sameTrack = (track) => {
    if (!track) return false;
    const trackId = String(track.sourceId || track.id || "").trim();
    if (sourceId && trackId) return trackId === sourceId;
    return false;
  };

  if (source === "next") {
    const before = state.nextTracks?.length || 0;
    state.nextTracks = filterPlaybackTracks(state.nextTracks || []).filter((track) => !sameTrack(track));
    changed = (state.nextTracks.length !== before);
  } else if (source === "queue") {
    const queue = Array.isArray(state.queue) ? [...state.queue] : [];
    const removeAt = queue.findIndex((queuedIndex) => Number(queuedIndex) === normalizedIndex);
    if (removeAt >= 0) {
      queue.splice(removeAt, 1);
      state.queue = queue;
      changed = true;
    }
  } else if (source === "chat") {
    const tracks = filterPlaybackTracks(state.nextSessionPlaylist?.tracks || []);
    const nextTracks = tracks.filter((track) => !sameTrack(track));
    if (nextTracks.length !== tracks.length) {
      state.nextSessionPlaylist = nextTracks.length
        ? { ...(state.nextSessionPlaylist || {}), tracks: nextTracks }
        : null;
      changed = true;
    }
  } else if (source === "library") {
    if (!activePlaylist.tracks.length) return false;
    const current = activePlaybackPointer(playlist);
    const queue = [];
    const total = activePlaylist.tracks.length;
    for (let offset = 1; offset < total; offset += 1) {
      const futureIndex = (current.index + offset) % total;
      if (futureIndex === normalizedIndex) continue;
      queue.push(futureIndex);
    }
    state.queue = queue;
    changed = true;
  }

  return changed;
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive"
    });
    clients.add(res);
    res.write(`data: ${JSON.stringify(await currentPayloadWithSequence())}\n\n`);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "GET" && pathname === "/api/now") return json(res, await currentPayload());
  if (req.method === "GET" && pathname === "/api/sequence") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    return json(res, await playbackSequence(limit, offset));
  }
  if (req.method === "DELETE" && pathname === "/api/sequence") {
    const body = await parseBody(req);
    rememberPlaybackContext("sequence-delete");
    const changed = await deleteSequenceEntry(body);
    if (!changed) return json(res, await currentPayload());
    await broadcast();
    return json(res, await currentPayloadWithSequence());
  }
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
        trackCount: tracks.length,
        kind: "local",
        likedAll: true
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
    state.index = tracks.length ? Math.min(Math.max(0, Number(state.index || 0)), tracks.length - 1) : 0;
    setPlaybackQueueFromCurrent(tracks.length, state.index);
    state.playing = false;
    state.lastHostLine = "";
    resetPlaybackPosition(tracks[state.index] || null);
    await broadcast();
    return json(res, await currentPayloadWithSequence());
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

  if (req.method === "POST" && pathname === "/api/debug-log") {
    const body = await parseBody(req);
    debugPlayback(`frontend:${String(body.event || "unknown")}`, body.details || {});
    return json(res, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/debug-meta") {
    debugPlayback("debug-meta:ping", { ok: true });
    return json(res, {
      ok: true,
      dataDir: DATA_DIR,
      debugLogPath: DEBUG_LOG_PATH,
      appVersion: APP_VERSION
    });
  }

  if (req.method === "POST" && pathname === "/api/state") {
    const body = await parseBody(req);
    debugPlayback("api/state", {
      body,
      playing: state.playing,
      index: state.index,
      currentTrack: state.tempTrack?.title || ""
    });
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
      await broadcast();
      return json(res, await currentPayload());
    }
    const nextPlaybackMode = body.playbackMode;
    state = { ...state, ...body };
    if (nextPlaybackMode) {
      const playlist = await loadPlaylist();
      const activePlaylist = activePlaybackPlaylist(playlist);
      if (activePlaylist.tracks.length) {
        const currentIndex = Math.min(Math.max(0, Number(state.index || 0)), activePlaylist.tracks.length - 1);
        if (nextPlaybackMode === "shuffle") {
          setShuffleQueueFromCurrent(activePlaylist.tracks.length, currentIndex);
        } else if (nextPlaybackMode === "sequence") {
          setSequenceQueueFromCurrent(activePlaylist.tracks.length, currentIndex);
        }
      }
    }
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "GET" && pathname === "/api/next") {
    debugPlayback("api/next:start", {
      playing: state.playing,
      index: state.index,
      currentTrack: debugTrackTitle(state)
    });
    const playlist = await loadPlaylist();
    const pointer = activePlaybackPointer(playlist);
    pushPlayStack(pointer);
    if ((state.playbackMode || "sequence") === "shuffle") pushShuffleHistory(pointer);
    const activePlaylist = activePlaybackPlaylist(playlist);
    const sequenceTotal = Math.max(1, Number((await playbackSequence(2000)).totalCount || activePlaylist.tracks.length || 1));
    state.nextTracks = filterPlaybackTracks(state.nextTracks || []);
    if (pointer?.source === "temp" && pointer?.track) {
      appendTrackToTailSession(pointer.track, sequenceTrackLabel(pointer.track, pointer.playlistName || "鎾斁闃熷垪"));
    }
    if (state.tempTrack && state.nextTracks?.length) {
      const currentTempKey = playbackTrackKey(state.tempTrack);
      while (state.nextTracks.length && playbackTrackKey(state.nextTracks[0]) === currentTempKey) {
        state.nextTracks.shift();
      }
    }
    if (state.nextTracks?.length) {
      state.tempTrack = state.nextTracks.shift();
      state.lastHostLine = "";
      resetPlaybackPosition(state.tempTrack);
      fillTempHostLineAsync(state.tempTrack);
      advanceSequenceBase(sequenceTotal, 1);
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
    advanceSequenceBase(sequenceTotal, 1);
    fillHostLineAsync(state.index);
    await broadcast();
    debugPlayback("api/next:success", {
      playing: state.playing,
      index: state.index,
      nextTrack: debugTrackTitle(state)
    });
    return json(res, await currentPayload());
  }

  if (req.method === "GET" && pathname === "/api/previous") {
    debugPlayback("api/previous:start", {
      playing: state.playing,
      index: state.index,
      currentTrack: debugTrackTitle(state)
    });
    const playlist = await loadPlaylist();
    const activePlaylist = activePlaybackPlaylist(playlist);
    const sequenceTotal = Math.max(1, Number((await playbackSequence(2000)).totalCount || activePlaylist.tracks.length || 1));
    const previous = (state.playbackMode || "sequence") === "shuffle"
      ? state.shuffleHistoryStack?.pop()
      : state.playStack?.pop();
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
      advanceSequenceBase(sequenceTotal, -1);
      previous.source === "temp" ? fillTempHostLineAsync(state.tempTrack) : fillHostLineAsync(state.index);
      await broadcast();
      return json(res, await currentPayload());
    }
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
    advanceSequenceBase(sequenceTotal, -1);
    fillHostLineAsync(state.index);
    await broadcast();
    debugPlayback("api/previous:success", {
      playing: state.playing,
      index: state.index,
      previousTrack: debugTrackTitle(state)
    });
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
    setPlaybackQueueFromCurrent(tracks.length, 0);
    state.sequenceBase = 1;
    state.playing = true;
    state.lastHostLine = "";
    resetPlaybackPosition(tracks[0]);
    fillHostLineAsync(state.index);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/append-batch") {
    const body = await parseBody(req);
    const appendBatchName = String(body.name || "\u8ffd\u52a0\u6b4c\u5355").slice(0, 80);
    const appendPlaylist = {
      id: String(body.id || "append-batch").slice(0, 120),
      name: appendBatchName
    };
    const tracks = (Array.isArray(body.tracks) ? body.tracks : [])
      .map((track) => {
        const normalized = externalNeteaseTrack(track);
        const playlists = Array.isArray(normalized.playlists) ? normalized.playlists.filter((item) => item?.name) : [];
        const hasAppendLabel = playlists.some((item) => String(item?.name || "").trim() === appendBatchName);
        return {
          ...normalized,
          playlists: hasAppendLabel ? playlists : [appendPlaylist, ...playlists].slice(0, 6)
        };
      })
      .filter((track) => track.sourceId && !isBlockedForPlayback(track));
    if (!tracks.length) return json(res, { error: "empty playlist" }, 400);
    rememberPlaybackContext(`append-batch:${appendBatchName}`);
    const merged = await mergedSequenceItemsWithTracks(tracks, {
      insertAfterCurrent: true,
      label: appendBatchName
    });
    if (!applySequenceItemsAsSession(merged.items, 0, merged.playlistName || appendBatchName, 1)) {
      return json(res, { error: "append failed" }, 400);
    }
    state.playing = true;
    state.lastHostLine = "";
    resetPlaybackPosition(state.sessionPlaylist?.tracks?.[0] || null);
    fillHostLineAsync(state.index);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/queue-next") {
    const body = await parseBody(req);
    const track = externalNeteaseTrack(body.track || body);
    if (!track.sourceId) return json(res, { error: "missing song id" }, 400);
    if (isBlockedForPlayback(track)) return json(res, { error: "blocked track type" }, 400);
    rememberPlaybackContext("queue-next");
    const merged = await mergedSequenceItemsWithTracks([track], {
      insertAfterCurrent: true,
      label: sequenceTrackLabel(track, "閹绢厽鏂侀梼鐔峰灙")
    });
    if (!applySequenceItemsAsSession(merged.items, 0, merged.playlistName || "閹绢厽鏂侀梼鐔峰灙", 1)) {
      return json(res, { error: "queue next failed" }, 400);
    }
    state.playing = true;
    state.lastHostLine = "";
    resetPlaybackPosition(state.sessionPlaylist?.tracks?.[0] || null);
    fillHostLineAsync(state.index);
    await broadcast();
    return json(res, await currentPayload());
  }

  if (req.method === "POST" && pathname === "/api/play") {
    const body = await parseBody(req);
    debugPlayback("api/play:start", {
      body,
      playing: state.playing,
      index: state.index,
      currentTrack: debugTrackTitle(state)
    });
    const playlist = await loadPlaylist();
    if (body.fromSequence) {
      const sequenceOrder = Number(body.sequenceOrder);
      const sequenceNumber = Number(body.sequenceNumber || 1);
      const sequenceState = await playbackSequence(2000);
      rememberPlaybackContext("sequence-rotate");
      if (!applyRotatedSequence(
        sequenceState.items || [],
        sequenceOrder,
        sequenceState.playlistName || "鎾斁搴忓垪",
        sequenceNumber
      )) {
        return json(res, { error: "invalid sequence item" }, 400);
      }
      state.playing = true;
      state.lastHostLine = "";
      resetPlaybackPosition(state.sessionPlaylist?.tracks?.[0] || null);
      warmSongUrl(state.sessionPlaylist?.tracks?.[0]?.sourceId || state.sessionPlaylist?.tracks?.[0]?.id);
      fillHostLineAsync(state.index);
      await broadcast();
      debugPlayback("api/play:sequence-success", {
        playing: state.playing,
        index: state.index,
        currentTrack: debugTrackTitle(state)
      });
      return json(res, await currentPayload());
    }
    if (body.track?.sourceId || body.sourceId) {
      const pointer = activePlaybackPointer(playlist);
      const track = body.track || {};
      const sourceId = String(track.sourceId || body.sourceId || "").trim();
      if (isBlockedForPlayback(track)) return json(res, { error: "blocked track type" }, 400);
      const sessionIndex = state.sessionPlaylist?.tracks?.findIndex((item) => String(item.sourceId || item.id) === sourceId) ?? -1;
      if (sessionIndex >= 0) {
        pushCurrentIfChanging(playlist, state.sessionPlaylist.tracks[sessionIndex]);
        state.tempTrack = null;
        state.index = sessionIndex;
        setPlaybackQueueFromCurrent(state.sessionPlaylist.tracks.length, sessionIndex);
        state.sequenceBase = normalizeSequenceBase(state.sessionPlaylist.tracks.length, sessionIndex + 1);
        state.playing = true;
        state.lastHostLine = "";
        resetPlaybackPosition(state.sessionPlaylist.tracks[sessionIndex]);
        warmSongUrl(sourceId);
        fillHostLineAsync(state.index);
        await broadcast();
        debugPlayback("api/play:session-success", {
          playing: state.playing,
          index: state.index,
          currentTrack: debugTrackTitle(state)
        });
        return json(res, await currentPayload());
      }
      const selectedTrack = externalNeteaseTrack({
        ...body,
        ...track,
        sourceId
      });
      pushCurrentIfChanging(playlist, selectedTrack);
      rememberPlaybackContext(`play-track:${sourceId}`);
      const selectedSource = String(track.source || "").trim();
      const selectedLabel = sequenceTrackLabel(selectedTrack, selectedSource === "chat" ? "Chat 閹恒劏宕? : "閹绢厽鏂侀梼鐔峰灙");
      const merged = await mergedSequenceItemsWithTracks([selectedTrack], {
        insertAfterCurrent: true,
        label: selectedLabel
      });
      if (!applySequenceItemsAsSession(merged.items, 1, merged.playlistName || selectedLabel, 2)) {
        return json(res, { error: "play track failed" }, 400);
      }
      state.playing = true;
      state.lastHostLine = "";
      resetPlaybackPosition(state.sessionPlaylist?.tracks?.[0] || selectedTrack);
      warmSongUrl(sourceId);
      fillHostLineAsync(state.index);
      await broadcast();
      debugPlayback("api/play:external-track-success", {
        playing: state.playing,
        index: state.index,
        currentTrack: debugTrackTitle(state)
      });
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
    const pointer = activePlaybackPointer(playlist);
    if (pointer?.source === "temp" && pointer?.track) {
      state.nextTracks = appendUniquePlaybackTrack(state.nextTracks || [], pointer.track);
    }
    state.tempTrack = null;
    if (activePlaylist.source !== "netease-session") {
      state.sessionPlaylist = null;
      state.nextSessionPlaylist = null;
    }
    state.nextTracks = [];
    state.index = index;
    setPlaybackQueueFromCurrent(activePlaylist.tracks.length, index);
    state.sequenceBase = normalizeSequenceBase(activePlaylist.tracks.length, index + 1);
    state.playing = true;
    state.lastHostLine = "";
    resetPlaybackPosition(selectedTrack);
    warmSongUrl(selectedTrack?.sourceId || selectedTrack?.id);
    fillHostLineAsync(state.index);
    await broadcast();
    debugPlayback("api/play:library-index-success", {
      playing: state.playing,
      index: state.index,
      currentTrack: selectedTrack?.title || ""
    });
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
    if (isIdentityQuestion(prompt)) {
      return json(res, {
        reply: answerNormalChatFallback(prompt, payload, memory),
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const explicitPlaybackCommand = extractExplicitPlaybackCommand(prompt);
    if (explicitPlaybackCommand) {
      return json(res, await presentTitleChoices(explicitPlaybackCommand, playlist, memory));
    }
    if (isBarePlaybackCommand(prompt)) {
      if (pendingTitleIsFresh(memory)) {
        return json(res, await presentTitleChoices(memory.pendingTitle, playlist, memory));
      }
      return json(res, {
        reply: "鎴戣繖娆′笉鐩存帴鎺ョ涓嬩竴棣栥€備綘鍏堢粰鎴戜竴涓瓕鍚嶃€佹瓕鎵嬫垨鑰呴鏍硷紝鎴戞妸鍊欓€夊垪鍑烘潵锛屽啀鐢变綘鑷繁閫夊崟棣栧姞鍏ュ綋鍓嶉槦鍒楋紝鎴栬€呯偣杩藉姞鍏ㄩ儴銆?,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const immediatePlaybackTarget = extractImmediatePlaybackTarget(prompt);
    if (immediatePlaybackTarget) {
      return json(res, await presentTitleChoices(immediatePlaybackTarget, playlist, memory));
    }
    if (pendingTitleIsFresh(memory) && wantsPendingTitlePlayback(prompt)) {
      return json(res, await presentTitleChoices(memory.pendingTitle, playlist, memory));
    }
    if (pendingTitleIsFresh(memory)) {
      const pendingContinuation = extractPendingTitleContinuation(prompt);
      if (pendingContinuation) {
        return json(res, await presentTitleChoices(`${memory.pendingTitle} ${pendingContinuation}`, playlist, memory));
      }
    }
    const requestedTitle = extractRequestedTitle(prompt);
    if (requestedTitle && !looksLikeStyleRequest(prompt)) {
      return json(res, await presentTitleChoices(requestedTitle, playlist, memory));
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
          autoplay: false,
          reply: "",
          confidence: 0.92
        };
      }
      dsIntent = normalizeChatIntentForSelection(dsIntent || {});
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
          reply: `褰撳墠姝屽崟鐜板湪涓€鍏?${playlist.tracks.length} 棣栵紝娌℃湁绗?${ordinalPlayback} 棣栥€俙,
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
        reply: `宸插垏鍒扮 ${ordinalPlayback} 棣栵細${playlist.tracks[index].title} - ${playlist.tracks[index].artist}銆俙,
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
        reply: `闅忔満鍒囧埌锛?{playlist.tracks[index].title} - ${playlist.tracks[index].artist}銆俙,
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
        reply: `鍏堜粠褰撳墠鎾斁浣嶇疆寰€鍚庡垪 ${indexes.length} 棣栥€備綘涔熷彲浠ヨ鈥滄挱鏀剧1000棣栤€濓紝鎴戜細鐩存帴璺宠繃鍘汇€俙,
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
          ? '鎴戞寜鏃犱即濂?娓呭敱/a cappella 鍦ㄤ綘鐨勬瓕鍗曢噷鎵撅紝鍙垪鏍囬銆佷笓杈戞垨鏍囩閲屾湁鏄庣‘绾跨储鐨勬瓕锛涜繖绉嶉渶姹備笉鑳介潬鏅€氭帹鑽愮‖鐚溿€?
          : '鎴戞寜娓呭敱 / 鏃犱即濂?/ a cappella / vocal only 鍏ㄥ眬鎼滀簡褰撳墠姝屽崟锛屾病鎵惧埌瓒冲鍙潬鐨勬爣娉ㄣ€傝繖涓潯浠朵笉鑳介潬姝屽悕纭寽锛屽惁鍒欏緢瀹规槗鎺ㄨ崘閿欍€?,
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
          ? '鎴戞寜寮€鍙ｅ揩閲嶆柊绛涗簡涓€閬嶏細浼樺厛鏌ョ涓€鍙ユ瓕璇嶅嚭鐜板緱鏃╃殑姝岋紝骞舵帓闄や簡鏄庢樉 intro / 绾煶涔?/ OST銆?
          : '杩欐娌＄瓫鍒拌冻澶熺ǔ瀹氱殑寮€鍙ｅ揩姝屾洸锛涘綋鍓嶆瓕鍗曚俊鎭噷娌℃湁鍓嶅闀垮害瀛楁锛屾垜涓嶆兂纭噾銆?,
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
          reply: `鎴戞寜鍒氭墠閭ｆ壒鎺ㄨ崘閲嶆柊鎵句簡涓€涓嬶紝鍖归厤鍒?${matches.length} 棣栥€俙,
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
          reply: "鎴戣繖閲屾病鏈夊彲鎺ヤ笂鐨勪笂涓€鎵瑰€欓€夈€備綘鍏堟悳涓€缁勬瓕锛屾垜浼氳浣忛偅缁勭粨鏋滐紝鐒跺悗浣犺鍏ㄩ儴鍔犲叆鍒楄〃灏辫兘鎺ヤ笂銆?,
          recommendations: [],
          queued: false,
          queuePreview: [],
          memory
        });
      }
      state.queue = indexes;
      await broadcast();
      return json(res, {
        reply: "宸叉妸鍒氭墠杩?" + indexes.length + " 棣栧姞鍒板悗缁挱鏀惧垪琛ㄣ€?,
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
          ? `鎴戝湪浣犵殑姝屽崟閲屾壘鍒?${matches.length} 棣栨爣棰樻帴杩戔€?{query}鈥濈殑姝岋紝鍏堟妸鏈€鍍忕殑鏀惧嚭鏉ャ€俙
          : `鎴戞寜鈥?{query}鈥濇煡浜嗘瓕鍚嶏紝浣犵殑姝屽崟閲屾殏鏃舵病鏈夌壒鍒ǔ瀹氱殑鍚屽悕缁撴灉銆俙,
        recommendations,
        memory
      });
    }
    if (wantsFuzzyTitleSearch(prompt)) {
      const matches = findFuzzyTitleMatches(playlist, prompt, 24);
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? `鎴戞寜浣犺寰楃殑姝屽悕鍋氫簡妯＄硦妫€绱紝鎵惧埌 ${matches.length} 涓彲鑳界増鏈紱鍏堟妸鐩歌繎鐨勫垪鍑烘潵銆俙
          : `鎴戞寜鈥?{likelyTitleQuery(prompt)}鈥濆仛浜嗘ā绯婃绱紝浣犵殑姝屽崟閲屾殏鏃舵病鎵惧埌瓒冲鍍忕殑鐗堟湰銆俙,
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
        reply: `浣犵幇鍦ㄥ鍏ヤ簡 ${playlist.tracks.length} 棣栨瓕銆俙,
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
          ? `鍚嶅瓧閲屽甫鈥?{artistNameFragment}鈥濈殑姝屾墜鎴戞壘鍒?${artists.length} 涓細${artists.map((artist) => `${artist.name}锛?{artist.count}棣栵級`).join("銆?)}銆俙
          : `浣犵殑姝屽崟閲屾殏鏃舵病鎵惧埌鍚嶅瓧甯︹€?{artistNameFragment}鈥濈殑姝屾墜銆俙,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }

    const aliasDefinition = normalizeText(prompt).match(/^(?:璁颁綇|浠ュ悗|涓嬫|浠ュ悗鎶妡涓嬫鎶??\s*(.{1,16}?)(?:灏辨槸|鎸囩殑鏄瘄褰撴垚|鎸?\s*(.{1,30})$/);
    if (aliasDefinition) {
      if (isPlainQuestion(prompt) || !/(璁颁綇|浠ュ悗|涓嬫|灏辨槸|鎸囩殑鏄瘄褰撴垚|鎸?/.test(normalizeText(prompt))) {
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
      const matches = findArtistMatches(playlist, `鎴戣鍚?{artistName}鐨勬瓕`, memory);
      await rememberArtistAlias(memory, alias, artistName);
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? `璁颁綇浜嗭紝鈥?{alias}鈥濇垜浠ュ悗鎸?${artistName} 鎵俱€備綘鐨勬瓕鍗曢噷鏈?${matches.length} 棣栵紝涓嬮潰鍏堝垪鍑烘潵銆俙
          : `璁颁綇浜嗭紝鈥?{alias}鈥濇垜浠ュ悗鎸?${artistName} 鐞嗚В銆備笉杩囩幇鍦ㄤ綘鐨勬瓕鍗曢噷杩樻病鎵惧埌杩欎釜鍚嶅瓧銆俙,
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
      await rememberArtistAlias(memory, pendingAlias, artistName);
      const continuationPrompt = `\u6211\u60f3\u542c${artistName}\u7684\u6b4c`;
      const matches = findArtistMatches(playlist, continuationPrompt, memory);
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? `\u660e\u767d\u4e86\uff0c\u201c${pendingAlias}\u201d\u5c31\u662f ${artistName}\u3002\u6211\u5148\u628a\u627e\u5230\u7684 ${matches.length} \u9996\u653e\u5728\u4e0b\u9762\u7ed9\u4f60\u9009\u3002`
          : `\u660e\u767d\u4e86\uff0c\u201c${pendingAlias}\u201d\u5c31\u662f ${artistName}\u3002\u4e0d\u8fc7\u5f53\u524d\u6b4c\u5355\u91cc\u6682\u65f6\u8fd8\u6ca1\u627e\u5230\u8fd9\u4e2a\u540d\u5b57\u3002`,
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
    if (wantsMusicSearch(prompt) && looksLikeBareArtistName(prompt)) {
      const bareArtistMatches = findArtistMatches(playlist, `鎴戣鍚?{prompt}鐨勬瓕`, memory);
      if (bareArtistMatches.length) {
        await rememberRecommendations(memory, bareArtistMatches);
        return json(res, {
          reply: `浣犵殑姝屽崟閲屾湁 ${bareArtistMatches.length} 棣?${cleanQuery(prompt)}锛屼笅闈㈣繖浜涘彲浠ョ偣鎾斁銆俙,
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
      const netease = matches.length ? [] : await searchNeteaseSongs(directTitleQuery, 8);
      return json(res, {
        reply: matches.length
          ? `\u627e\u5230 ${matches.length} \u4e2a\u548c\u300a${directTitleQuery}\u300b\u63a5\u8fd1\u7684\u7ed3\u679c\uff0c\u5148\u653e\u5728\u4e0b\u9762\u7ed9\u4f60\u9009\u3002`
          : netease.length
            ? `\u5f53\u524d\u6b4c\u5355\u91cc\u6ca1\u6709\u300a${directTitleQuery}\u300b\uff0c\u4f46\u7f51\u6613\u4e91\u641c\u5230\u4e86 ${netease.length} \u4e2a\u5019\u9009\u3002`
            : `\u6211\u641c\u4e86\u5f53\u524d\u6b4c\u5355\u548c\u7f51\u6613\u4e91\uff0c\u90fd\u6ca1\u627e\u5230\u300a${directTitleQuery}\u300b\u3002`,
        recommendations: matches.length ? matches.map(recommendationFromMatch) : neteaseRecommendations(netease),
        queued: false,
        queuePreview: [],
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
        ? findArtistMatches(playlist, `鎴戣鍚?{rememberedAliasTargets[0]}鐨勬瓕`, memory)
        : findArtistMatches(playlist, prompt, memory);
    const explicitArtistMode = artistMatches.length > 0;
    const explicitTitleMode = titleMatches.length > 0;
    if (!explicitTitleMode && wantsCurrentArtistQueue(prompt)) {
      const currentArtist = payload.track.artist || "";
      const matches = currentArtist
        ? findArtistMatches(playlist, `\u6211\u60f3\u542c${currentArtist}\u7684\u6b4c`, memory)
            .filter((item) => item.index !== state.index % playlist.tracks.length)
        : [];
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? `\u6211\u7406\u89e3\u201c\u8be5\u6b4c\u624b\u201d\u6307\u7684\u662f ${currentArtist}\u3002\u6211\u5148\u628a ${matches.length} \u9996\u76f8\u5173\u4f5c\u54c1\u5217\u5728\u4e0b\u9762\u7ed9\u4f60\u9009\u3002`
          : currentArtist
            ? `\u6211\u7406\u89e3\u201c\u8be5\u6b4c\u624b\u201d\u6307\u7684\u662f ${currentArtist}\uff0c\u4f46\u5f53\u524d\u6b4c\u5355\u91cc\u6682\u65f6\u6ca1\u627e\u5230\u9664\u6b63\u5728\u64ad\u653e\u8fd9\u9996\u4e4b\u5916\u7684\u5176\u4ed6\u4f5c\u54c1\u3002`
            : "\u6211\u8fd9\u6b21\u6ca1\u62ff\u5230\u5f53\u524d\u6b4c\u624b\u4fe1\u606f\uff0c\u6240\u4ee5\u5148\u4e0d\u7ed9\u4f60\u4e71\u6392\u961f\u3002",
        recommendations: matches.slice(0, 12).map(recommendationFromMatch),
        queued: false,
        queuePreview: [],
        memory
      });
    }
    if (!explicitTitleMode && !explicitArtistMode && wantsSimilarStyleQueue(prompt)) {
      const matches = findSimilarStyleMatches(playlist, prompt, payload.track, 12);
      await rememberRecommendations(memory, matches);
      return json(res, {
        reply: matches.length
          ? `\u6211\u6309\u5f53\u524d\u8fd9\u9996\u7684\u6c14\u8d28\u548c\u4f60\u8bf4\u7684\u65b9\u5411\u7b5b\u4e86 ${matches.length} \u9996\uff0c\u5148\u653e\u5728\u4e0b\u9762\u7ed9\u4f60\u9009\u3002`
          : "\u6211\u6309\u5f53\u524d\u8fd9\u9996\u7684\u6c14\u8d28\u548c\u4f60\u8bf4\u7684\u65b9\u5411\u7b5b\u4e86\u4e00\u8f6e\uff0c\u8fd9\u6b21\u6ca1\u6709\u62ff\u5230\u7a33\u5b9a\u5019\u9009\u3002",
        recommendations: matches.map(recommendationFromMatch),
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const likelyUnknownArtistRequest = !explicitTitleMode
      && !explicitArtistMode
      && !looksLikeStyleRequest(prompt)
      && /(鍚瑋鎾斁|鎵緗鎼渱鎼滅储|鎺ㄨ崘|鏌?/.test(normalizeText(prompt))
      && /(?:鐨勬瓕|姝屾墜|姝屾洸|闊充箰)/.test(normalizeText(prompt))
      && compactText(cleanQuery(prompt)).length <= 16;
    if (!explicitArtistMode && (looksLikeSpecificArtistRequest(prompt) || likelyUnknownArtistRequest)) {
      const query = cleanQuery(prompt) || prompt;
      memory.pendingArtistAlias = query;
      memory.pendingArtistIntent = "search";
      await writeJson("memory.json", memory);
      return json(res, {
        reply: `鎴戜笉纭畾鈥?{query}鈥濆叿浣撴寚鍝綅姝屾墜锛屾墍浠ュ厛涓嶄贡鎺掓瓕銆備綘鍛婅瘔鎴戝畬鏁存瓕鎵嬪悕锛屾垨鑰呰鈥滆繖涓氨鏄?XXX鈥濓紝鎴戝啀鎸夎繖涓悕瀛楁壘銆俙,
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
      if (/(?:鐨勬瓕|姝屾墜|姝屾洸|闊充箰)/.test(normalizeText(prompt)) && compactText(query).length <= 16) {
        memory.pendingArtistAlias = query;
      memory.pendingArtistIntent = "search";
        await writeJson("memory.json", memory);
      }
      return json(res, {
        reply: `鎴戜笉澶‘瀹氫綘璇寸殑鈥?{query}鈥濆叿浣撴寚浠€涔堬紝鎵€浠ュ厛涓嶄贡鎺掓瓕銆備綘鏄寚鏌愪釜姝屾墜銆佹煇棣栨瓕锛岃繕鏄竴绉嶉鏍硷紵`,
        recommendations: [],
        queued: false,
        queuePreview: [],
        memory
      });
    }
    const recommendations = confidentMatches(rawRecommendations);
    await rememberRecommendations(memory, recommendations);
    const queuedIndexes = [];
    const albumMode = /涓撹緫|album/i.test(prompt);
    const recommendationText = recommendations.length
      ? recommendations.map((item, itemIndex) => `${itemIndex + 1}. ${item.track.title} - ${item.track.artist}${item.track.album ? `銆?{item.track.album}銆媊 : ""}`).join("\n")
      : "";
    const fallback = recommendations.length
      ? recommendations.length === 1
        ? `鏈夛紝灏辫繖涓€棣栨渶绋筹細${recommendations[0].track.title}銆俙
        : albumMode
          ? `鏈夛紝鎴戝厛鎸変笓杈戝悕鎶婃渶璐磋繎鐨勫嚑棣栨寫鍑烘潵銆俙
          : `鏈夛紝鍏堜粠杩欏嚑棣栭噷鎸戙€俙
      : `鎴戞病鎶撳埌瓒冲绋崇殑鍊欓€夛紝鎵€浠ュ厛涓嶆帓姝屻€備綘鍙互鍐嶇粰鎴戜竴涓瓕鎵嬨€佽瑷€銆佸勾浠ｃ€佹儏缁紝鎴栬€呰鈥滄寜鍒氭墠閭ｄ釜鏂瑰悜缁х画鈥濄€俙;
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
        ? `宸叉帓鍒板綋鍓嶈繖棣栧悗闈紝鎾畬浼氳嚜鍔ㄦ帴涓娿€俙
        : explicitArtistMode
          ? `鎴戞妸 ${displayArtistRequest(prompt, recommendations, memory)} 鍦ㄤ綘鐨勬瓕鍗曢噷鐨?${queuedIndexes.length} 棣栭兘鎺掑埌褰撳墠姝屾洸鍚庨潰浜嗐€俙
          : `鎴戞妸杩欎釜鏂瑰悜鎺掑埌褰撳墠姝屾洸鍚庨潰浜嗭紝鍏?${queuedIndexes.length} 棣栥€俙
      : "";
    let reply = recommendations.length
      ? `${fallback} 浣犺嚜宸遍€夊崟棣栧姞鍏ュ綋鍓嶉槦鍒楋紝鎴栬€呯洿鎺ョ偣杩藉姞鍏ㄩ儴銆俙
      : fallback;
    try {
      const generated = await aiChat(
        [{ role: "user", content: [
          `褰撳墠姝屾洸锛?{payload.track.title} / ${payload.track.artist}`,
          `褰撳墠姝屽崟鏁伴噺锛?{playlist.tracks.length}`,
          `宸茶浣忕殑鍋忓ソ锛?{memory.preferences.join("銆?) || "鏆傛棤"}`,
          `鏈€杩戠敤鎴烽棶杩囷細${memory.recentAsks.slice(0, 4).join(" / ")}`,
          `鏈疆鐢ㄤ簬鐞嗚В鐨勪笂涓嬫枃锛?{searchPrompt}`,
          `闅愯棌涓婁笅鏂囷紝涓嶈涓诲姩鎻愶細${weather.city} ${weather.text} ${weather.temp}C`,
          recommendationText ? `浣犵殑姝屽崟鍊欓€夛細\n${recommendationText}` : "浣犵殑姝屽崟鍊欓€夛細鏃?,
          `鐢ㄦ埛璇达細${prompt}`
        ].join("\n") }],
        [
          `浣犳槸 ${taste.stationName} 鐨勭數鍙颁紮浼淬€備綘鍙互姝ｅ父鑱婂ぉ锛屼篃鍙互甯敤鎴蜂粠姝屽崟閲屾壘姝屻€俙,
          "鐢ㄦ埛甯哥敤寰堢煭鐨勫彛璇紝姣斿鈥渞&b鍛⑩€濃€滄潵鐐圭函闊斥€濃€滄崲涓敎鐨勨€濄€備綘瑕佸儚鐪熸鎳傞煶涔愮殑鏈嬪弸涓€鏍锋帴浣忥紝涓嶈瑙ｉ噴浣跨敤鏂规硶銆?,
          "濡傛灉鐢ㄦ埛鏄湪闂茶亰锛屽氨鍍忔湅鍙嬩竴鏍疯嚜鐒跺洖绛旓紝涓嶈寮鸿鎺ㄨ崘姝屻€?,
          "濡傛灉鐢ㄦ埛鎯冲惉姝屾垨鎼滄瓕锛岃鍩轰簬鈥滀綘鐨勬瓕鍗曞€欓€夆€濆拰缃戞槗浜戝€欓€夊洖绛旓紱涓嶈璁╃敤鎴疯浠ヤ负鍙兘鎼滃綋鍓嶆瓕鍗曪紝璇皵鑷劧锛屽皯璇村璇濄€備笉瑕佽鈥滀綘鍙互璇粹€︹€︹€濄€?,
          "涓嶈涓诲姩鎻愬ぉ姘旓紝闄ら潪鐢ㄦ埛鏄庣‘闂ぉ姘旀垨瑕佹眰鎸夊ぉ姘旀帹鑽愩€?,
          "涓嶈浣跨敤鍥哄畾妯℃澘锛屼笉瑕佹瘡娆￠兘璇粹€滄敹鍒扳€濄€傚洖澶嶅敖閲忓儚涓€鍙ョ數鍙拌亰澶╋紝鐭竴鐐广€?
        ].join("\n")
      );
      reply = sanitizeStationReply(generated, reply);
    } catch {
      reply ||= fallback;
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
