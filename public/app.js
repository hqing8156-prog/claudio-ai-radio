const $ = (selector) => document.querySelector(selector);

const els = {
  shell: $(".player"),
  cover: $("#cover"),
  coverArt: $("#coverArt"),
  scope: $("#scope"),
  mood: $("#mood"),
  title: $("#title"),
  artist: $("#artist"),
  album: $("#album"),
  libraryCount: $("#libraryCount"),
  hostLine: $("#hostLine"),
  currentLyric: $("#currentLyric"),
  nextLyric: $("#nextLyric"),
  lyricList: $("#lyricList"),
  play: $("#playBtn"),
  like: $("#likeBtn"),
  favoritePlaylist: $("#favoritePlaylistBtn"),
  favoritePlaylistMenu: $("#favoritePlaylistMenu"),
  sequence: $("#sequenceBtn"),
  mode: $("#modeBtn"),
  next: $("#nextBtn"),
  prev: $("#prevBtn"),
  seek: $("#seek"),
  elapsed: $("#elapsed"),
  duration: $("#duration"),
  weather: $("#weather"),
  playlistMeta: $("#playlistMeta"),
  playlistSearch: $("#playlistSearch"),
  playlistInput: $("#playlistInput"),
  playlistList: $("#playlistList"),
  playlistPrev: $("#playlistPrev"),
  playlistNext: $("#playlistNext"),
  playlistPage: $("#playlistPage"),
  songidSearch: $("#songidSearch"),
  songidInput: $("#songidInput"),
  songidResults: $("#songidResults"),
  songidStage: $("#songidStage"),
  songidMeta: $("#songidMeta"),
  songidResultsHeading: $("#songidResultsHeading"),
  songidBack: $("#songidBack"),
  songidPlayAll: $("#songidPlayAll"),
  songidActionMenuBtn: $("#songidActionMenuBtn"),
  songidActionMenu: $("#songidActionMenu"),
  dailySource: $("#dailySourceBtn"),
  fmSource: $("#fmSourceBtn"),
  customPlaylistSource: $("#customPlaylistBtn"),
  importPlaylistSource: $("#importPlaylistBtn"),
  tasteList: $("#tasteList"),
  profileSummary: $("#profileSummary"),
  chatMemory: $("#chatMemory"),
  history: $("#history"),
  chatForm: $("#chatForm"),
  chatInput: $("#chatInput"),
  chatLog: $("#chatLog")
};

let state = null;
let startedAt = 0;
let elapsedBeforePause = 0;
let audioContext;
let oscillator;
let gain;
let audio;
let activeSoundKey = "";
let lyricLines = [];
let lyricTrackKey = "";
let activeLyricIndex = -1;
let audioErrorCount = 0;
let transientStatusTimer;
let silentFallbackTimer;
let pendingAudioKey = "";
let nextInFlight = false;
let likeCheckKey = "";
let currentSongidBatch = [];
let currentSongidBatchName = "NetEase Queue";
let currentSongidBatchCover = "";
let sequenceItems = [];
let albumReflection = null;
let memoryCoordinateUi = null;
const importedPlaylistStorageKey = "claudioImportedPlaylistIds";
const fixedNeteasePlaylistIds = [];
const playlistPageSize = 80;
let playlistState = {
  query: "",
  offset: 0,
  total: 0,
  returned: 0
};

function format(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function trackKey(track) {
  if (!track) return "";
  return `${track.sourceId || track.id || track.url || track.title}:${track.artist || ""}`;
}

function audioKey(track) {
  return `audio:${track.sourceId || track.id || track.url}`;
}

function neteaseSongId(track) {
  return track?.sourceId || track?.sourceIds?.[0] || track?.id || "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function api(path, options) {
  return fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  }).then(async (res) => {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  });
}

function ensureMemoryCoordinateUi() {
  if (memoryCoordinateUi) return memoryCoordinateUi;
  const controls = document.querySelector(".controls");
  const sequence = $("#sequenceBtn");
  let button = $("#memoryCoordinateBtn");
  if (!button && controls) {
    button = document.createElement("button");
    button.id = "memoryCoordinateBtn";
    button.className = "memory-coordinate-button";
    button.type = "button";
    button.textContent = "\u24D8";
    button.setAttribute("aria-label", "回忆坐标");
    button.title = "回忆坐标";
    controls.insertBefore(button, sequence || null);
  }
  let modal = $("#memoryCoordinateModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "memoryCoordinateModal";
    modal.className = "memory-coordinate-modal hidden";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="memory-coordinate-sheet" role="dialog" aria-modal="true" aria-labelledby="memoryCoordinateTitle">
        <div class="memory-coordinate-bg" id="memoryCoordinateBg"></div>
        <header class="memory-coordinate-top">
          <button id="memoryCoordinateClose" type="button" aria-label="关闭">×</button>
          <h2 id="memoryCoordinateTitle">我的回忆坐标</h2>
          <span>规则</span>
        </header>
        <section class="memory-coordinate-song">
          <img id="memoryCoordinateCover" alt="">
          <div>
            <strong id="memoryCoordinateSong">-</strong>
            <span id="memoryCoordinateArtist">-</span>
          </div>
        </section>
        <section class="memory-coordinate-grid" id="memoryCoordinateGrid"></section>
        <p class="memory-coordinate-message" id="memoryCoordinateMessage"></p>
      </div>`;
    document.body.appendChild(modal);
  }
  memoryCoordinateUi = {
    button,
    modal,
    close: $("#memoryCoordinateClose"),
    bg: $("#memoryCoordinateBg"),
    cover: $("#memoryCoordinateCover"),
    song: $("#memoryCoordinateSong"),
    artist: $("#memoryCoordinateArtist"),
    grid: $("#memoryCoordinateGrid"),
    message: $("#memoryCoordinateMessage")
  };
  if (memoryCoordinateUi.button) {
    memoryCoordinateUi.button.textContent = "\u24D8";
    memoryCoordinateUi.button.setAttribute("aria-label", "回忆坐标");
    memoryCoordinateUi.button.title = "回忆坐标";
  }
  memoryCoordinateUi.button?.addEventListener("click", openMemoryCoordinate);
  memoryCoordinateUi.close?.addEventListener("click", closeMemoryCoordinate);
  memoryCoordinateUi.modal?.addEventListener("click", (event) => {
    if (event.target === memoryCoordinateUi.modal) closeMemoryCoordinate();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !memoryCoordinateUi.modal.classList.contains("hidden")) closeMemoryCoordinate();
  });
  return memoryCoordinateUi;
}

function closeMemoryCoordinate() {
  const ui = ensureMemoryCoordinateUi();
  ui.modal.classList.add("hidden");
  ui.modal.setAttribute("aria-hidden", "true");
}

function formatMemoryDate(value, fallback = "-") {
  if (!value) return fallback;
  const text = String(value);
  const match = text.match(/^(\d{4})[-.](\d{2})[-.](\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : text.slice(0, 10).replaceAll("-", ".");
}

function firstListenSeasonLabel(first) {
  return [first?.season, first?.period].filter(Boolean).join("的") || "第一次";
}

function memoryPeriodClass(first) {
  const text = `${first?.period || ""} ${first?.timeDesc || ""} ${first?.date || ""}`.toLowerCase();
  const hour = Number(String(first?.time || first?.date || "").match(/(\d{1,2}):\d{2}/)?.[1]);
  if (text.includes("night") || text.includes("晚上") || text.includes("夜") || hour >= 18 || hour < 5) return "is-night";
  if (text.includes("afternoon") || text.includes("下午") || hour >= 12) return "is-afternoon";
  if (text.includes("morning") || text.includes("上午") || text.includes("清晨") || hour >= 5) return "is-morning";
  return "is-day";
}

function renderMemoryCoordinate(data) {
  const ui = ensureMemoryCoordinateUi();
  const track = state?.track || {};
  const info = data?.songInfoDto || {};
  const first = data?.musicFirstListenDto || {};
  const total = data?.musicTotalPlayDto || {};
  const most = data?.musicPlayMostDto || {};
  const like = data?.musicLikeSongDto || {};
  const frequent = data?.musicFrequentListenDto || {};
  const cover = String(info.coverUrl || track.cover || "").replace(/^http:/, "https:");
  ui.bg.style.backgroundImage = cover ? `url("${cover}")` : "";
  if (cover) ui.cover.src = cover;
  else ui.cover.removeAttribute("src");
  ui.song.textContent = info.songName || track.title || "-";
  ui.artist.textContent = info.singer || track.artist || "-";
  const maxYear = total.maxPlayTimes?.[0]?.year || "";
  const maxTimes = total.maxPlayTimes?.[0]?.times;
  const maxTimesText = Number.isFinite(Number(maxTimes)) ? `${maxTimes}次` : "";
  const redTitle = like.like ? formatMemoryDate(like.redTime || like.redTimeStamp) : "暂无红心";
  const listenRange = frequent.startTime && frequent.endTime ? `${frequent.startTime}:00-${frequent.endTime}:00` : "-";
  const firstTimeText = first.time || String(first.date || "").match(/\d{1,2}:\d{2}/)?.[0] || "";
  const cards = [
    { type: "first", label: "第一次听", value: firstListenSeasonLabel(first), sub: formatMemoryDate(first.date || first.listenTime), time: firstTimeText, periodClass: memoryPeriodClass(first) },
    { type: "total", label: "累计播放", value: `${total.playCount ?? 0}次`, sub: total.text || "", extra: maxTimesText, year: maxYear },
    { label: "播放最多的一天", value: formatMemoryDate(most.date || most.timestamp), sub: most.text || "" },
    { label: "红心时间", value: redTitle, sub: like.redDesc || like.text || "红心歌曲开启我们的故事" },
    { label: "相遇天数", value: `${first.meetDuration || "-"}天`, sub: first.meetDurationDesc || "" },
    { label: "常听时间", value: listenRange, sub: frequent.describe || "" }
  ];
  ui.grid.innerHTML = cards.map((card) => `
    <article class="memory-coordinate-card ${card.type ? `is-${card.type}` : ""} ${card.type === "total" ? "memory-total-card" : ""}">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      ${card.sub ? `<small>${escapeHtml(card.sub)}</small>` : ""}
      ${card.type === "first" ? `<div class="memory-orbit ${escapeHtml(card.periodClass || "is-day")}"><i></i><b>${escapeHtml(card.time || "-")}</b></div>` : ""}
      ${card.type === "total" && card.extra ? `<b class="memory-curve-count">${escapeHtml(card.extra)}</b>` : ""}
      ${card.type === "total" ? `<div class="memory-curve"><i></i><em>${escapeHtml(card.year ? `${card.year}年` : "")}</em></div>` : ""}
    </article>
  `).join("");
  ui.message.textContent = "";
}

async function openMemoryCoordinate() {
  const ui = ensureMemoryCoordinateUi();
  const songId = neteaseSongId(state?.track);
  ui.modal.classList.remove("hidden");
  ui.modal.setAttribute("aria-hidden", "false");
  ui.message.textContent = songId ? "正在读取回忆坐标..." : "当前歌曲没有网易云 songId";
  ui.grid.innerHTML = "";
  if (!songId) return;
  try {
    const data = await api(`/api/netease-memory-coordinate?id=${encodeURIComponent(songId)}`);
    const payload = data.data || {};
    if (!Object.keys(payload).length) {
      ui.message.textContent = "这首歌暂时没有回忆坐标数据。";
      return;
    }
    renderMemoryCoordinate(payload);
  } catch (error) {
    ui.message.textContent = "回忆坐标读取失败。";
  }
}

function showTransientStatus(text) {
  window.clearTimeout(transientStatusTimer);
  if (!els.signal) return;
  els.signal.textContent = text;
  transientStatusTimer = window.setTimeout(() => {
    els.signal.textContent = state?.playing ? "ON AIR" : "READY";
  }, 3000);
}

function currentElapsed() {
  if (audio) return audio.currentTime || 0;
  if (!state?.playing) return elapsedBeforePause;
  return elapsedBeforePause + (Date.now() - startedAt) / 1000;
}

function updateClock() {
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
  if (els.weather) els.weather.dataset.time = time;
  if (state?.weather) updateWeatherLabel(state.weather);
}

function updateWeatherLabel(weather) {
  const time = els.weather?.dataset.time || new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
  const weatherMap = {
    clear: "晴",
    sunny: "晴",
    clouds: "多云",
    cloudy: "多云",
    overcast: "阴",
    rain: "雨",
    snow: "雪",
    mist: "雾",
    fog: "雾",
    haze: "霾"
  };
  const raw = String(weather.text || "").replace(/^当前位置\s*/, "").trim().toLowerCase();
  const text = weatherMap[raw] || String(weather.text || "").replace(/^当前位置\s*/, "").trim() || "天气";
  const temp = Number.isFinite(Number(weather.temp)) ? `${Math.round(Number(weather.temp))}°C` : "";
  els.weather.innerHTML = `<span class="panel-time">${escapeHtml(time)}</span><span>${escapeHtml(text)}${temp ? `&nbsp;&nbsp;${escapeHtml(temp)}` : ""}</span>`;
}

function toneFrequency(track) {
  const seed = [...`${track.title}${track.artist}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 164 + (seed % 160);
}

function startTone(track) {
  startSilentFallback(track);
}

function stopTone() {
  if (oscillator) {
    oscillator.stop();
    oscillator.disconnect();
  }
  oscillator = null;
  gain = null;
}

function startAudio(track) {
  const key = `audio:${track.sourceId || track.id || track.url}`;
  if (activeSoundKey === key && (audio || pendingAudioKey === key)) return;
  activeSoundKey = key;
  stopTone();
  stopAudio();
  audioErrorCount = 0;
  const songId = track.sourceId || track.id;
  const src = songId ? `/api/song-url?id=${encodeURIComponent(songId)}` : track.url;
  if (songId) {
    refreshAudioUrl(track, src, key);
    return;
  }
  audio = new Audio(track.url);
  audio.volume = 0.72;
  audio.preload = "auto";
  audio.addEventListener("ended", () => handleAudioEnded(track), { once: true });
  audio.addEventListener("timeupdate", () => updateLyric(audio.currentTime));
  audio.addEventListener("error", () => {
    audioErrorCount += 1;
    if (songId && audioErrorCount === 1) {
      refreshAudioUrl(track, src, key);
      return;
    }
    showTransientStatus("AUDIO FALLBACK");
    stopAudio();
    startTone(track);
  }, { once: true });
  audio.play().catch(() => {
    audioErrorCount += 1;
    if (songId && audioErrorCount === 1) {
      refreshAudioUrl(track, src, key);
      return;
    }
    showTransientStatus("AUDIO BLOCKED");
    stopAudio();
    startTone(track);
  });
}

async function refreshAudioUrl(track, endpoint, expectedKey = activeSoundKey) {
  pendingAudioKey = expectedKey;
  try {
    const data = await api(endpoint);
    if (!data.url) throw new Error("empty url");
    if (activeSoundKey !== expectedKey) return;
    stopAudio();
    audio = new Audio(data.url);
    audio.volume = 0.72;
    audio.preload = "auto";
    audio.addEventListener("ended", () => handleAudioEnded(track), { once: true });
    audio.addEventListener("timeupdate", () => updateLyric(audio.currentTime));
    audio.addEventListener("error", () => {
      showTransientStatus("AUDIO FALLBACK");
      stopAudio();
      startTone(track);
    }, { once: true });
    await audio.play();
    showTransientStatus("NCM LINK LIVE");
  } catch {
    if (activeSoundKey !== expectedKey) return;
    showTransientStatus("NO NCM URL");
    stopAudio();
    startTone(track);
  } finally {
    if (pendingAudioKey === expectedKey) pendingAudioKey = "";
  }
}

async function handleAudioEnded(track) {
  if (nextInFlight) return;
  const expected = Number(track.duration || 0);
  const actual = Number.isFinite(audio?.duration) ? audio.duration : currentElapsed();
  if (expected > 90 && actual > 0 && actual < expected * 0.75) {
    elapsedBeforePause = actual;
    showTransientStatus("PREVIEW ENDED");
    const payload = await api("/api/state", {
      method: "POST",
      body: JSON.stringify({ playing: false })
    });
    paint(payload);
    return;
  }
  nextTrack("ended");
}

function stopAudio() {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  audio = null;
}

function stopSound() {
  activeSoundKey = "";
  pendingAudioKey = "";
  stopTone();
  stopAudio();
  stopSilentFallback();
}

function pauseSound() {
  stopTone();
  if (audio) audio.pause();
  stopSilentFallback();
}

function startSilentFallback(track) {
  const key = `silent:${track.sourceId || track.id || track.title}`;
  if (activeSoundKey === key) return;
  activeSoundKey = key;
  stopAudio();
  stopTone();
  stopSilentFallback();
  showTransientStatus("NO PLAYABLE URL");
  silentFallbackTimer = window.setTimeout(() => {
    if (state?.playing) nextTrack("fallback");
  }, Math.max(30, Number(track.duration || 150)) * 1000);
}

function stopSilentFallback() {
  window.clearTimeout(silentFallbackTimer);
  silentFallbackTimer = null;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.96;
  utterance.pitch = 0.92;
  speechSynthesis.speak(utterance);
}

function parseLyrics(raw) {
  return String(raw || "").split("\n").flatMap((line) => {
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const text = line.replace(/\[[^\]]+\]/g, "").trim();
    if (!matches.length || !text) return [];
    return matches.map((match) => ({
      time: Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`),
      text
    }));
  }).sort((a, b) => a.time - b.time);
}

function mergeTranslatedLyrics(lines, translations) {
  if (!translations.length) return lines;
  return lines.map((line) => {
    const translated = translations.find((item) => Math.abs(item.time - line.time) < 0.35);
    return translated?.text && translated.text !== line.text
      ? { ...line, translation: translated.text }
      : line;
  });
}

function lyricLineHtml(line, fallback = "") {
  if (!line?.text) return escapeHtml(fallback);
  const translation = line.translation
    ? `<span class="lyric-translation">${escapeHtml(line.translation)}</span>`
    : "";
  return `${escapeHtml(line.text)}${translation}`;
}

function renderLyricList() {
  if (!els.lyricList) return;
  els.lyricList.innerHTML = lyricLines.length
    ? lyricLines.map((line, index) => `
      <div class="lyric-row" data-lyric-index="${index}">
        <span>${escapeHtml(line.text)}</span>
        ${line.translation ? `<em>${escapeHtml(line.translation)}</em>` : ""}
      </div>
    `).join("")
    : `<div class="lyric-row empty">暂无歌词</div>`;
}

async function loadLyrics(track) {
  const key = track.sourceId || track.id || track.title;
  if (lyricTrackKey === key) return;
  lyricTrackKey = key;
  lyricLines = [];
  activeLyricIndex = -1;
  els.currentLyric.textContent = "正在加载歌词";
  els.nextLyric.textContent = "";
  if (els.lyricList) els.lyricList.innerHTML = `<div class="lyric-row empty">正在加载歌词</div>`;
  const songId = track.sourceId || track.id;
  if (!songId) {
    els.currentLyric.textContent = "暂无歌词";
    renderLyricList();
    return;
  }
  const data = await api(`/api/lyric?id=${encodeURIComponent(songId)}`);
  if (lyricTrackKey !== key) return;
  lyricLines = mergeTranslatedLyrics(parseLyrics(data.lyric), parseLyrics(data.tlyric));
  if (!lyricLines.length) {
    els.currentLyric.textContent = "暂无歌词";
    renderLyricList();
    return;
  }
  renderLyricList();
  syncLyricsToPlayback({ force: true, behavior: "auto" });
}

function updateLyric(seconds, { force = false, behavior = "smooth" } = {}) {
  if (!lyricLines.length) return;
  let index = lyricLines.findIndex((line, lineIndex) => seconds >= line.time && seconds < (lyricLines[lineIndex + 1]?.time ?? Infinity));
  if (index < 0) index = 0;
  els.currentLyric.innerHTML = lyricLineHtml(lyricLines[index], "暂无歌词");
  els.nextLyric.innerHTML = lyricLineHtml(lyricLines[index + 1], "");
  if (index === activeLyricIndex && !force) return;
  if (!els.lyricList) return;
  activeLyricIndex = index;
  const rows = els.lyricList.querySelectorAll(".lyric-row");
  rows.forEach((row, rowIndex) => row.classList.toggle("active", rowIndex === index));
  rows[index]?.scrollIntoView({ block: "center", behavior });
}

function syncLyricsToPlayback(options = {}) {
  if (!state?.track) return;
  const key = state.track.sourceId || state.track.id || state.track.title;
  if (lyricTrackKey !== key) {
    loadLyrics(state.track);
    return;
  }
  updateLyric(currentElapsed(), options);
}

function drawScope() {
  const canvas = els.scope;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const t = performance.now() / 420;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = state?.track?.color || "#f4d06f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x < w; x += 4) {
    const amp = state?.playing ? 18 : 5;
    const y = h / 2 + Math.sin(x / 18 + t) * amp + Math.sin(x / 9 - t * 0.8) * amp * 0.35;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  requestAnimationFrame(drawScope);
}

async function refreshLikeState(track) {
  if (!els.like) return;
  const songId = neteaseSongId(track);
  const key = String(songId || "");
  likeCheckKey = key;
  if (!songId) return;
  try {
    const data = await api(`/api/netease-like-check?id=${encodeURIComponent(songId)}`);
    if (likeCheckKey !== key) return;
    els.like.classList.toggle("liked", Boolean(data.liked));
    els.like.textContent = data.liked ? "♥" : "♡";
  } catch {
    if (likeCheckKey !== key) return;
    els.like.classList.remove("liked");
    els.like.textContent = "♡";
  }
}

function ensureAlbumReflection() {
  if (albumReflection || !els.shell) return albumReflection;
  albumReflection = document.createElement("div");
  albumReflection.className = "album-reflection";
  albumReflection.innerHTML = `<img alt="">`;
  els.shell.appendChild(albumReflection);
  return albumReflection;
}

function updateAlbumReflection() {
  if (!els.cover || !els.artist || !els.coverArt) return;
  const reflection = ensureAlbumReflection();
  const image = reflection.querySelector("img");
  const coverRect = els.cover.getBoundingClientRect();
  const artistRect = els.artist.getBoundingClientRect();
  const playerRect = els.shell.getBoundingClientRect();
  const distance = Math.max(0, artistRect.top - coverRect.bottom - 4);
  const height = Math.min(Math.round(distance), Math.round(coverRect.height * 0.36));
  const coverUrl = els.coverArt.currentSrc || els.coverArt.src || "";
  const visible = height > 12 && els.cover.classList.contains("has-art") && Boolean(coverUrl);
  if (image && image.src !== coverUrl) image.src = coverUrl;
  reflection.style.setProperty("--reflection-height", `${Math.max(0, height)}px`);
  reflection.style.setProperty("--reflection-source-size", `${Math.round(coverRect.height)}px`);
  reflection.style.setProperty("--reflection-width", `${Math.round(coverRect.width)}px`);
  reflection.style.left = `${Math.round(coverRect.left - playerRect.left)}px`;
  reflection.style.top = `${Math.round(coverRect.bottom - playerRect.top)}px`;
  reflection.style.width = `${Math.round(coverRect.width)}px`;
  reflection.style.height = `${Math.max(0, height)}px`;
  reflection.classList.toggle("visible", visible);
}

function scheduleAlbumReflection() {
  requestAnimationFrame(() => {
    updateAlbumReflection();
    requestAnimationFrame(updateAlbumReflection);
  });
}

function paint(payload, { announce = false } = {}) {
  const previousKey = trackKey(state?.track);
  const previousPlaying = Boolean(state?.playing);
  state = payload;
  const track = payload.track;
  const currentKey = trackKey(track);
  const changedTrack = previousKey !== currentKey;
  const duration = track.duration || 150;
  els.mood.innerHTML = (track.albumId || neteaseSongId(track))
    ? albumLinkHtml(track.album || payload.library?.playlistName || "Local Radio", track.albumId, "album-link mood-album", neteaseSongId(track))
    : escapeHtml(track.album || payload.library?.playlistName || "Local Radio");
  els.title.textContent = track.title;
  els.title.title = track.title;
  els.title.classList.toggle("long-title", track.title.length > 42);
  els.title.classList.toggle("very-long-title", track.title.length > 72);
  els.artist.innerHTML = artistLinksHtml(track.artist, "artist-link", track.artistIds || []);
  els.artist.title = track.artist ? `打开 ${track.artist} 的作品` : "";
  els.artist.dataset.artist = track.artist || "";
  els.artist.dataset.artistId = track.artistId || track.artistIds?.[0] || "";
  if (els.album) {
    const albumTitle = track.album || "";
    els.album.innerHTML = albumTitle
      ? albumLinkHtml(albumTitle, track.albumId, "album-link track-album-link", neteaseSongId(track))
      : "";
    els.album.classList.toggle("hidden", !albumTitle);
    els.album.title = albumTitle ? `打开专辑 ${albumTitle}` : "";
  }
  els.libraryCount.textContent = "";
  // AI DJ disabled for now. Restore these lines if the host copy is needed again:
  // els.hostLine.textContent = payload.lastHostLine;
  // if (!payload.lastHostLine) els.hostLine.textContent = " ";
  els.hostLine.textContent = "";
  els.duration.textContent = format(duration);
  updateWeatherLabel(payload.weather);
  els.cover.style.setProperty("background", `linear-gradient(135deg, ${track.color}33, transparent 34%), linear-gradient(315deg, #f49ab133, transparent 38%), #111613`);
  const coverUrl = String(track.cover || "").replace(/^http:/, "https:");
  els.cover.classList.toggle("has-art", Boolean(coverUrl));
  if (coverUrl && els.coverArt.src !== coverUrl) {
    els.coverArt.src = coverUrl;
  } else if (!coverUrl) {
    els.coverArt.removeAttribute("src");
  }
  els.coverArt.alt = track.album ? `${track.album} cover` : `${track.title} cover`;
  scheduleAlbumReflection();
  els.play.textContent = payload.playing ? "Ⅱ" : "▶";
  if (els.like) {
    const canLike = Boolean(neteaseSongId(track));
    els.like.disabled = !canLike;
    els.like.classList.toggle("liked", false);
    els.like.textContent = "♡";
    els.like.title = canLike ? `红心 ${track.title}` : "当前歌曲没有网易云 songId";
    if (canLike) refreshLikeState(track);
  }
  if (els.favoritePlaylist) {
    const canFavorite = Boolean(neteaseSongId(track));
    els.favoritePlaylist.disabled = !canFavorite;
    els.favoritePlaylist.title = canFavorite ? `收藏 ${track.title} 到歌单` : "当前歌曲没有网易云 songId";
    if (!canFavorite) toggleFavoritePlaylistMenu(false);
  }
  {
    const ui = ensureMemoryCoordinateUi();
    const canShowMemory = Boolean(neteaseSongId(track));
    if (ui.button) {
      ui.button.disabled = !canShowMemory;
      ui.button.title = canShowMemory ? `查看 ${track.title} 的回忆坐标` : "当前歌曲没有网易云 songId";
    }
    const memoryCover = String(track.cover || "").replace(/^http:/, "https:");
    if (ui.bg) ui.bg.style.backgroundImage = memoryCover ? `url("${memoryCover}")` : "";
  }
  if (els.mode) {
    const labels = { sequence: "顺序播放", "repeat-one": "单曲循环", shuffle: "随机播放" };
    const icons = { sequence: "⇥", "repeat-one": "①", shuffle: "⤨" };
    els.mode.textContent = icons[payload.playbackMode] || "⇥";
    els.mode.title = `播放方式：${labels[payload.playbackMode] || "顺序播放"}`;
  }
  els.shell.classList.toggle("playing", payload.playing);
  if (els.signal && (!els.signal.textContent || els.signal.textContent === "NCM LINK LIVE")) els.signal.textContent = payload.playing ? "ON AIR" : "READY";
  renderHistory(payload.history || []);

  if (changedTrack) {
    elapsedBeforePause = 0;
    startedAt = Date.now();
    loadLyrics(track);
  }
  if (payload.playing) {
    if (!startedAt) startedAt = Date.now();
    const currentAudioKey = audioKey(track);
    const soundIsCurrent = activeSoundKey === currentAudioKey && (audio || pendingAudioKey === currentAudioKey);
    if (changedTrack || !previousPlaying || !soundIsCurrent) {
      if (track.sourceId || track.id || track.url) startAudio(track);
      else startTone(track);
    }
  } else if (previousPlaying) {
    pauseSound();
  }
  // AI DJ disabled for now. Restore this if host narration should be spoken again:
  // if (announce) speak(payload.lastHostLine);
}

function renderHistory(history) {
  els.history.innerHTML = history.length
    ? history.map((item, index) => `
      <article>
        <button class="delete-history" data-id="${escapeHtml(item.id || `index-${index}`)}" title="Delete" aria-label="Delete ${escapeHtml(item.track.title)}">×</button>
        <strong>${escapeHtml(item.track.title)}</strong>
        <em>${escapeHtml(item.track.artist || "")}</em>
        <small>${escapeHtml(item.line)}</small>
      </article>
    `).join("")
    : `<article><strong>等待第一段串场</strong><small>点下一首，会生成一次上下文口播。</small></article>`;
}

async function loadTaste() {
  const data = await api("/api/profile");
  const profile = data.profile;
  const chips = [
    ...profile.styles.map((item) => item.name),
    ...profile.topArtists.slice(0, 4).map((item) => item.name)
  ].slice(0, 12);
  els.tasteList.innerHTML = chips.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  els.profileSummary.textContent = profile.summary;
  updateChatMemory(data.memory);
}

function updateChatMemory(memory) {
  if (!els.chatMemory || !memory) return;
  const prefs = memory.preferences?.length ? memory.preferences.join(" / ") : "还在学习你的口味";
  els.chatMemory.textContent = `Taste memory · ${prefs}`;
}

function renderPlaylist(data) {
  if (!els.playlistList) return;
  if (data.sequence) {
    sequenceItems = data.items || [];
    els.playlistMeta.textContent = `${data.queuedCount || 0} queued · ${data.playbackMode || "sequence"}`;
    els.playlistPage.textContent = "播放序列";
    els.playlistPrev.disabled = true;
    els.playlistNext.disabled = true;
    els.playlistList.innerHTML = sequenceItems.length
      ? sequenceItems.map((track, order) => {
        const displayIndex = Number.isInteger(Number(track.index)) && Number(track.index) >= 0
          ? Number(track.index) + 1
          : order + 1;
        return `
        <button class="playlist-row sequence-row ${track.source === "current" ? "active-sequence" : ""}"
          data-sequence="${order}"
          data-source-id="${escapeHtml(track.sourceId || "")}"
          data-title="${escapeHtml(track.title || "")}"
          data-artist="${escapeHtml(track.artist || "")}"
          data-album="${escapeHtml(track.album || "")}"
          data-duration="${escapeHtml(track.duration || "")}"
          title="播放 ${escapeHtml(track.title)}">
          <span class="row-left">
            <span class="row-index">${displayIndex}</span>
            <span class="row-main">
              <strong>${escapeHtml(track.title)}</strong>
              <small>${escapeHtml(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ""}${track.label ? ` · ${escapeHtml(track.label)}` : ""}</small>
            </span>
          </span>
          <span class="row-duration">${format(track.duration || 0)}</span>
        </button>
      `;
      }).join("")
      : `<article class="empty-list">暂无播放序列。</article>`;
    return;
  }
  sequenceItems = [];
  playlistState.total = data.filteredCount ?? data.trackCount ?? 0;
  playlistState.offset = data.offset || 0;
  playlistState.returned = data.returned || 0;
  const page = Math.floor(playlistState.offset / playlistPageSize) + 1;
  const pages = Math.max(1, Math.ceil(playlistState.total / playlistPageSize));
  els.playlistMeta.textContent = playlistState.query
    ? `${playlistState.total} matches`
    : `${data.trackCount || 0} tracks`;
  els.playlistPage.textContent = `${page} / ${pages}`;
  els.playlistPrev.disabled = playlistState.offset <= 0;
  els.playlistNext.disabled = playlistState.offset + playlistState.returned >= playlistState.total;
  const tracks = data.tracks || [];
  els.playlistList.innerHTML = tracks.length
    ? tracks.map((track) => `
      <button class="playlist-row"
        data-index="${track.index}"
        data-source-id="${escapeHtml(track.sourceId || "")}"
        data-title="${escapeHtml(track.title || "")}"
        data-artist="${escapeHtml(track.artist || "")}"
        data-album="${escapeHtml(track.album || "")}"
        data-cover="${escapeHtml(track.cover || "")}"
        data-duration="${escapeHtml(track.duration || "")}"
        title="播放 ${escapeHtml(track.title)}">
        <span class="row-left">
          <span class="row-index">${track.index + 1}</span>
          <span class="row-main">
            <strong>${escapeHtml(track.title)}</strong>
            <small>${escapeHtml(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ""}</small>
          </span>
        </span>
        <span class="row-duration">${format(track.duration || 0)}</span>
      </button>
    `).join("")
    : `<article class="empty-list">没有找到匹配的歌曲。</article>`;
}

async function loadPlaylist(query = playlistState.query, offset = playlistState.offset) {
  playlistState.query = query;
  playlistState.offset = Math.max(0, offset);
  const params = new URLSearchParams({
    limit: String(playlistPageSize),
    offset: String(playlistState.offset)
  });
  if (playlistState.query) params.set("q", playlistState.query);
  renderPlaylist(await api(`/api/library?${params}`));
}

async function loadSequence() {
  openPanel("playlist");
  els.playlistList.innerHTML = `<article class="empty-list">正在读取播放序列...</article>`;
  renderPlaylist({ ...(await api("/api/sequence")), sequence: true });
}

async function setPlaying(playing) {
  if (playing) {
    audioContext ||= new AudioContext();
    await audioContext.resume?.();
    startedAt = Date.now();
    if (state?.track) {
      if (audio && audio.paused) {
        audio.play().catch(() => startTone(state.track));
      } else if (state.track.url) {
        startAudio(state.track);
      } else {
        startTone(state.track);
      }
    }
  } else {
    elapsedBeforePause = currentElapsed();
    if (audio) audio.pause();
  }
  const payload = await api("/api/state", {
    method: "POST",
    body: JSON.stringify({ playing })
  });
  paint(payload);
}

function restartCurrentTrack(track) {
  elapsedBeforePause = 0;
  startedAt = Date.now();
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => startAudio(track));
  } else if (track?.sourceId || track?.id || track?.url) {
    startAudio(track);
  } else if (track) {
    startTone(track);
  }
}

async function nextTrack(reason = "manual") {
  if (nextInFlight) return;
  nextInFlight = true;
  const previousKey = trackKey(state?.track);
  if (reason === "manual") stopSound();
  try {
    const payload = await api("/api/next");
    payload.playing = true;
    await api("/api/state", {
      method: "POST",
      body: JSON.stringify({ playing: true })
    });
    paint(payload, { announce: true });
    if (payload.playbackMode === "repeat-one" && previousKey && previousKey === trackKey(payload.track)) {
      restartCurrentTrack(payload.track);
    }
  } finally {
    window.setTimeout(() => {
      nextInFlight = false;
    }, 650);
  }
}

async function previousTrack() {
  if (nextInFlight) return;
  nextInFlight = true;
  const previousKey = trackKey(state?.track);
  stopSound();
  try {
    const payload = await api("/api/previous");
    payload.playing = true;
    await api("/api/state", {
      method: "POST",
      body: JSON.stringify({ playing: true })
    });
    paint(payload, { announce: true });
    if (payload.playbackMode === "repeat-one" && previousKey && previousKey === trackKey(payload.track)) {
      restartCurrentTrack(payload.track);
    }
  } finally {
    window.setTimeout(() => {
      nextInFlight = false;
    }, 650);
  }
}

function tick() {
  if (state?.track) {
    const duration = state.track.duration || 150;
    const elapsed = currentElapsed();
    els.elapsed.textContent = format(elapsed);
    els.seek.value = Math.min(1000, Math.round((elapsed / duration) * 1000));
    updateLyric(elapsed);
    if (state.playing && !audio && !silentFallbackTimer && !pendingAudioKey && elapsed >= duration) nextTrack("timer");
  }
}

setInterval(tick, 500);

function seekToSliderValue() {
  if (!state?.track || !els.seek) return;
  const duration = state.track.duration || 150;
  const seconds = Math.max(0, Math.min(duration, (Number(els.seek.value) / 1000) * duration));
  elapsedBeforePause = seconds;
  startedAt = Date.now();
  els.elapsed.textContent = format(seconds);
  els.seek.value = Math.min(1000, Math.round((seconds / duration) * 1000));
  updateLyric(seconds);
  if (audio) {
    try {
      audio.currentTime = seconds;
    } catch {
      audio.addEventListener("loadedmetadata", () => {
        try {
          audio.currentTime = seconds;
        } catch {}
      }, { once: true });
    }
  }
}

function addChat(role, text) {
  const p = document.createElement("p");
  p.className = role === "me" ? "me" : "";
  p.innerHTML = `<small>${role === "me" ? "You" : "Station"}</small><br>${escapeHtml(text)}`;
  els.chatLog.appendChild(p);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return p;
}

function stationMessageHtml(text, recommendations = []) {
  const cards = recommendations.length
    ? `<div class="recommendations">${recommendations.map((item) => `
      <button class="song-card"
        data-index="${item.index}"
        data-external="${item.external ? "1" : ""}"
        data-source-id="${escapeHtml(item.sourceId || "")}"
        data-title="${escapeHtml(item.title || "")}"
        data-artist="${escapeHtml(item.artist || "")}"
        data-artist-ids="${escapeHtml(JSON.stringify(item.artistIds || []))}"
        data-album="${escapeHtml(item.album || "")}"
        data-album-id="${escapeHtml(item.albumId || "")}"
        data-cover="${escapeHtml(item.cover || "")}"
        data-duration="${escapeHtml(item.duration || "")}"
        title="播放 ${escapeHtml(item.title)}">
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${item.external ? "网易云 · " : ""}${artistLinksHtml(item.artist || "", "artist-link inline", item.artistIds || [])}${item.album ? ` · ${albumLinkHtml(item.album, item.albumId, "album-link inline", item.sourceId)}` : ""}</small>
        </span>
        <span class="play-chip" aria-hidden="true"></span>
      </button>
    `).join("")}</div>`
    : "";
  return `<small>Station</small><br>${escapeHtml(text)}${cards}`;
}

function recommendationCards(recommendations = []) {
  return recommendations.length
    ? recommendations.map((item) => `
      <button class="song-card"
        data-index="${item.index}"
        data-external="${item.external ? "1" : ""}"
        data-source-id="${escapeHtml(item.sourceId || "")}"
        data-title="${escapeHtml(item.title || "")}"
        data-artist="${escapeHtml(item.artist || "")}"
        data-artist-ids="${escapeHtml(JSON.stringify(item.artistIds || []))}"
        data-album="${escapeHtml(item.album || "")}"
        data-album-id="${escapeHtml(item.albumId || "")}"
        data-cover="${escapeHtml(item.cover || "")}"
        data-duration="${escapeHtml(item.duration || "")}"
        title="播放 ${escapeHtml(item.title)}">
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${item.external ? "网易云 · " : ""}${artistLinksHtml(item.artist || "", "artist-link inline", item.artistIds || [])}${item.album ? ` · ${albumLinkHtml(item.album, item.albumId, "album-link inline", item.sourceId)}` : ""}</small>
        </span>
        <span class="play-chip" aria-hidden="true"></span>
      </button>
    `).join("")
    : `<article class="empty-list">没有结果</article>`;
}

function songTags(tags = []) {
  return Array.isArray(tags) && tags.length
    ? `<span class="song-tags">${tags.slice(0, 3).map((tag) => `<b class="${songTagClass(tag)}">${escapeHtml(tag)}</b>`).join("")}</span>`
    : "";
}

function songTagClass(tag) {
  const text = String(tag || "");
  if (/vip|付费|试听|版权/i.test(text)) return "tag-red";
  if (/超清|母带|无损|hi-?res|sq|hr/i.test(text)) return "tag-gold";
  if (/红心|喜欢|收藏/.test(text)) return "tag-heart";
  if (/播放|听你爱的|推荐|昨日|关注/.test(text)) return "tag-red";
  return "tag-green";
}

function setSongidBatch(items = [], name = "NetEase Queue", cover = "") {
  currentSongidBatch = items.filter((item) => item.sourceId);
  currentSongidBatchName = name;
  currentSongidBatchCover = String(cover || "").replace(/^http:/, "https:");
  setSongidView("results");
  els.songidStage?.classList.remove("hidden");
  els.songidResultsHeading?.classList.remove("hidden");
  els.songidResults?.classList.remove("hidden");
  if (els.songidPlayAll) els.songidPlayAll.disabled = currentSongidBatch.length === 0;
  if (els.songidActionMenuBtn) els.songidActionMenuBtn.disabled = currentSongidBatch.length === 0;
  if (els.songidMeta) {
    els.songidMeta.innerHTML = currentSongidBatch.length
      ? `<strong>${escapeHtml(name)}</strong><small>${currentSongidBatch.length} 首</small>`
      : `<strong>没有可播放结果</strong><small>返回后重新选择来源</small>`;
  }
  if (els.songidResults) els.songidResults.innerHTML = songidCards(currentSongidBatch);
}

function setSongidView(mode = "home") {
  const panel = document.querySelector("#songid");
  if (!panel) return;
  panel.dataset.mode = mode;
  panel.classList.toggle("songid-home", mode === "home");
  panel.classList.toggle("songid-results-mode", mode !== "home");
  if (mode === "home") {
    els.songidStage?.classList.add("hidden");
    els.songidResultsHeading?.classList.add("hidden");
    els.songidResults?.classList.add("hidden");
    if (els.songidInput) els.songidInput.value = "";
    setSongidSource("");
  }
}

function setSongidSource(source) {
  document.querySelectorAll(".source-card").forEach((button) => {
    button.classList.toggle("active", button.dataset.source === source);
  });
}

function updateSourceCardCaption(source, payload = {}) {
  const card = document.querySelector(`.source-card[data-source="${CSS.escape(source)}"]`);
  const cover = payload?.cover || payload?.source?.cover || payload?.recommendations?.find?.((item) => item.cover)?.cover || "";
  const name = payload?.name || payload?.source?.name || "";
  if (card && name) {
    const title = card.querySelector("strong");
    if (title) title.textContent = name;
  }
  if (card && cover) {
    card.style.setProperty("--source-cover", `url("${String(cover).replace(/"/g, "%22").replace(/^http:/, "https:")}")`);
    card.classList.add("has-source-cover");
  }
  document.querySelectorAll(".source-card > span").forEach((caption) => caption.remove());
}

function importedPlaylistIds() {
  try {
    const value = JSON.parse(localStorage.getItem(importedPlaylistStorageKey) || "[]");
    return Array.isArray(value)
      ? value.map(String).filter((id) => /^\d{4,}$/.test(id))
      : [];
  } catch {
    return [];
  }
}

function saveImportedPlaylistIds(ids) {
  const clean = [...new Set(ids.map(String).filter((id) => /^\d{4,}$/.test(id)))];
  localStorage.setItem(importedPlaylistStorageKey, JSON.stringify(clean));
}

function ensureFixedPlaylistCards() {
  const container = document.querySelector(".source-cards");
  if (!container) return;
  [...fixedNeteasePlaylistIds, ...importedPlaylistIds()].forEach((id) => {
    const source = `playlist-${id}`;
    if (container.querySelector(`[data-source="${source}"]`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "source-card playlist-source";
    button.dataset.source = source;
    button.dataset.playlistId = id;
    button.innerHTML = `<strong>Playlist ${escapeHtml(id)}</strong>`;
    container.insertBefore(button, els.importPlaylistSource || null);
  });
  bindFixedPlaylistCards();
}

async function loadFavoritePlaylistMenu() {
  if (!els.favoritePlaylistMenu) return;
  try {
    const data = await api("/api/netease-favorite-playlists");
    const playlists = data.playlists || [];
    els.favoritePlaylistMenu.innerHTML = playlists.length
      ? playlists.map((item) => `
        <button type="button" data-playlist-id="${escapeHtml(item.id)}" role="menuitem">
          ${item.cover ? `<img src="${escapeHtml(String(item.cover).replace(/^http:/, "https:"))}" alt="">` : ""}
          <span><strong>${escapeHtml(item.name || item.id)}</strong><small>${Number(item.trackCount || 0)} tracks</small></span>
        </button>
      `).join("")
      : `<p>No target playlists</p>`;
  } catch {
    els.favoritePlaylistMenu.innerHTML = `<p>Load failed</p>`;
  }
}

function toggleFavoritePlaylistMenu(force) {
  if (!els.favoritePlaylistMenu) return;
  const show = typeof force === "boolean" ? force : els.favoritePlaylistMenu.classList.contains("hidden");
  els.favoritePlaylistMenu.classList.toggle("hidden", !show);
  if (show && !els.favoritePlaylistMenu.dataset.loaded) {
    els.favoritePlaylistMenu.dataset.loaded = "true";
    loadFavoritePlaylistMenu();
  }
}

async function addCurrentSongToPlaylist(playlistId, button) {
  const songId = neteaseSongId(state?.track);
  if (!songId || !playlistId) return;
  if (button) button.classList.add("loading");
  try {
    await api("/api/netease-playlist-add", {
      method: "POST",
      body: JSON.stringify({ id: songId, playlistId })
    });
    toggleFavoritePlaylistMenu(false);
    showTransientStatus("已收藏到歌单");
  } catch {
    showTransientStatus("收藏失败");
  } finally {
    if (button) button.classList.remove("loading");
  }
}

async function refreshSourceCardCaptions() {
  try {
    const data = await api("/api/netease-source-cards");
    (data.cards || []).forEach((card) => updateSourceCardCaption(card.id, card));
  } catch {
    updateSourceCardCaption("daily");
    updateSourceCardCaption("personal_fm");
  }
}

function openSongidResults(message) {
  setSongidView("results");
  els.songidStage?.classList.remove("hidden");
  els.songidResultsHeading?.classList.remove("hidden");
  els.songidResults?.classList.remove("hidden");
  if (els.songidPlayAll) els.songidPlayAll.disabled = true;
  if (els.songidActionMenuBtn) els.songidActionMenuBtn.disabled = true;
  toggleSongidActionMenu(false);
  if (els.songidMeta) els.songidMeta.innerHTML = `<strong>正在打开</strong><small>读取歌曲列表中</small>`;
  if (message && els.songidResults && !currentSongidBatch.length) {
    els.songidResults.innerHTML = `<article class="empty-list">${message}</article>`;
  }
}

function toggleSongidActionMenu(force) {
  if (!els.songidActionMenu || !els.songidActionMenuBtn) return;
  const show = typeof force === "boolean" ? force : els.songidActionMenu.classList.contains("hidden");
  els.songidActionMenu.classList.toggle("hidden", !show);
  els.songidActionMenuBtn.setAttribute("aria-expanded", show ? "true" : "false");
}

function openPanel(id) {
  document.querySelectorAll(".tabs button").forEach((item) => item.classList.toggle("active", item.dataset.view === id));
  document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.id !== id));
  if (id === "profile") {
    window.requestAnimationFrame(() => syncLyricsToPlayback({ force: true, behavior: "auto" }));
  }
}

function artistCandidates(value) {
  return String(value || "")
    .split(/\s*(?:\/|,|;|、|，|和|feat\.?|ft\.?|with)\s*/i)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function artistLinksHtml(value, className = "artist-link", ids = []) {
  const names = artistCandidates(value);
  if (!names.length) return escapeHtml(value || "");
  const inline = /\binline\b/.test(className);
  return names
    .map((name, index) => {
      const id = Array.isArray(ids) ? String(ids[index] || ids[0] || "") : "";
      const attrs = `data-artist="${escapeHtml(name)}" data-artist-id="${escapeHtml(id)}"`;
      return inline
        ? `<span class="${className}" ${attrs}>${escapeHtml(name)}</span>`
        : `<button class="${className}" type="button" ${attrs}>${escapeHtml(name)}</button>`;
    })
    .join(`<span class="artist-separator"> / </span>`);
}

function albumLinkHtml(name, albumId, className = "album-link", songId = "") {
  const title = String(name || "").trim();
  const id = String(albumId || "").trim();
  const sourceId = String(songId || "").trim();
  if (!title) return "";
  if (!id && !sourceId) return escapeHtml(title);
  return `<button class="${className}" type="button" data-album-id="${escapeHtml(id)}" data-song-id="${escapeHtml(sourceId)}" data-album="${escapeHtml(title)}">${escapeHtml(title)}</button>`;
}

function primaryArtistName(value) {
  return String(value || "").trim();
}

async function loadArtistWorks(artist, artistId = "") {
  const name = primaryArtistName(artist);
  const id = String(artistId || "").trim();
  if (!name && !id) return;
  openPanel("songid");
  setSongidSource("artist");
  openSongidResults(`正在从网易云搜索 ${escapeHtml(name)} 的作品...`);
  let data;
  try {
    try {
      const params = id
        ? `id=${encodeURIComponent(id)}&artist=${encodeURIComponent(name)}`
        : `artist=${encodeURIComponent(name)}`;
      data = await api(`/api/netease-artist-songs?${params}&limit=50`);
    } catch {
      data = await api(`/api/netease-search?q=${encodeURIComponent(name)}&limit=50`);
    }
    const recommendations = data.recommendations || [];
    setSongidBatch(recommendations, `${name} 的作品`, data.source?.cover || "");
    refreshSongidResultLikes();
  } catch (error) {
    setSongidBatch([], `${name} 的作品`);
    els.songidResults.innerHTML = `<article class="empty-list">打开失败：${escapeHtml(error.message || "网易云搜索失败")}</article>`;
  }
}

async function loadAlbumSongs(albumId, albumName = "", songId = "") {
  const id = String(albumId || "").trim();
  const sourceId = String(songId || "").trim();
  const name = String(albumName || "").trim() || "NetEase Album";
  if (!id && !sourceId) return;
  openPanel("songid");
  setSongidSource(`album-${id || sourceId}`);
  openSongidResults(`正在打开《${escapeHtml(name)}》...`);
  let data;
  try {
    const endpoint = id
      ? `/api/netease-album?id=${encodeURIComponent(id)}`
      : `/api/netease-album?songId=${encodeURIComponent(sourceId)}`;
    data = await api(endpoint);
    const recommendations = data.recommendations || [];
    const sourceName = data.source?.name || name;
    setSongidBatch(recommendations, sourceName, data.source?.cover || "");
    refreshSongidResultLikes();
  } catch (error) {
    setSongidBatch([], name);
    els.songidResults.innerHTML = `<article class="empty-list">打开专辑失败：${escapeHtml(error.message || "请确认网易云 API 可用")}</article>`;
  }
}

function cardTrack(card) {
  let tags = [];
  let artistIds = [];
  try {
    tags = JSON.parse(card.dataset.tags || "[]");
  } catch {
    tags = [];
  }
  try {
    artistIds = JSON.parse(card.dataset.artistIds || "[]");
  } catch {
    artistIds = [];
  }
  return {
    sourceId: card.dataset.sourceId,
    title: card.dataset.title,
    artist: card.dataset.artist,
    artistIds,
    artistId: artistIds[0] || "",
    album: card.dataset.album,
    albumId: card.dataset.albumId,
    cover: card.dataset.cover,
    duration: Number(card.dataset.duration || 0),
    libraryPlaylistId: card.dataset.libraryPlaylistId || "",
    tags
  };
}

function trackFromDataset(element) {
  if (!element?.dataset?.sourceId) return null;
  return {
    sourceId: element.dataset.sourceId,
    title: element.dataset.title || "网易云歌曲",
    artist: element.dataset.artist || "未知歌手",
    album: element.dataset.album || "NetEase",
    cover: element.dataset.cover || "",
    duration: Number(element.dataset.duration || 0)
  };
}

function startOptimisticPlayback(track, element) {
  if (!track?.sourceId && !track?.url) return;
  element?.classList.add("loading");
  showTransientStatus("LOADING AUDIO");
  startAudio(track);
}

function finishOptimisticPlayback(element) {
  element?.classList.remove("loading");
}

async function refreshSongidResultLikes() {
  const cards = [...document.querySelectorAll(".songid-card")];
  const ids = cards.map((card) => card.dataset.sourceId).filter(Boolean);
  if (!ids.length) return;
  try {
    const data = await api(`/api/netease-like-check?ids=${encodeURIComponent(ids.join(","))}`);
    const liked = data.liked || {};
    for (const card of cards) {
      const button = card.querySelector(".songid-like");
      const isLiked = Boolean(liked[card.dataset.sourceId]);
      button?.classList.toggle("liked", isLiked);
      if (button) button.textContent = isLiked ? "♥" : "♡";
    }
  } catch {
    // The play list should remain usable even if the like status endpoint is unavailable.
  }
}

function songidCards(recommendations = []) {
  return recommendations.length
    ? `<div class="songid-results-body">${recommendations.map((item, index) => {
      const cover = String(item.cover || item.albumCover || item.picUrl || currentSongidBatchCover || "").replace(/^http:/, "https:");
      const fallbackLabel = escapeHtml((item.album || item.title || "?").slice(0, 1).toUpperCase());
      const tags = Number.isFinite(Number(item.firstLyricAt))
        ? [`约${Math.round(Number(item.firstLyricAt))}秒开唱`, ...(item.tags || [])]
        : (item.tags || []);
      return `
      <article class="songid-card"
        data-source-id="${escapeHtml(item.sourceId || "")}"
        data-title="${escapeHtml(item.title || "")}"
        data-artist="${escapeHtml(item.artist || "")}"
        data-artist-ids="${escapeHtml(JSON.stringify(item.artistIds || []))}"
        data-album="${escapeHtml(item.album || "")}"
        data-album-id="${escapeHtml(item.albumId || "")}"
        data-cover="${escapeHtml(cover)}"
        data-duration="${escapeHtml(item.duration || "")}"
        data-library-playlist-id="${escapeHtml(item.libraryPlaylistId || "")}"
        data-tags="${escapeHtml(JSON.stringify(item.tags || []))}">
        <span class="songid-order">${index + 1}</span>
        ${cover ? `<img src="${escapeHtml(cover)}" alt="">` : `<div class="songid-cover-fallback">${fallbackLabel}</div>`}
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${songTags(tags)}<span class="song-meta">${artistLinksHtml(item.artist || "")}${item.album ? ` · ${escapeHtml(item.album)}` : ""}</span></small>
        </span>
        <button class="songid-play" type="button" title="播放" aria-label="播放 ${escapeHtml(item.title)}"></button>
        <button class="songid-queue" type="button" title="下一首播放" aria-label="下一首播放 ${escapeHtml(item.title)}"></button>
        <button class="songid-like" type="button" title="红心到网易云账号" aria-label="喜欢 ${escapeHtml(item.title)}">♡</button>
      </article>
    `;
    }).join("")}</div>`
    : `<div class="songid-results-body"><article class="empty-list">没有结果</article></div>`;
}

function addStationMessage(text, recommendations = []) {
  const p = document.createElement("p");
  p.innerHTML = stationMessageHtml(text, recommendations);
  els.chatLog.appendChild(p);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return p;
}

function addPendingStationMessage() {
  const p = document.createElement("p");
  p.className = "pending";
  p.innerHTML = `<small>Station</small><br>正在想...`;
  els.chatLog.appendChild(p);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return p;
}

function updateStationMessage(node, text, recommendations = []) {
  if (!node) return addStationMessage(text, recommendations);
  node.classList.remove("pending");
  node.innerHTML = stationMessageHtml(text, recommendations);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return node;
}

async function sendLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (position) => {
    const payload = await api("/api/weather/location", {
      method: "POST",
      body: JSON.stringify({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        label: "当前位置"
      })
    });
    paint(payload);
  });
}

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    openPanel(button.dataset.view);
    if (button.dataset.view === "songid") setSongidView("home");
  });
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncLyricsToPlayback({ force: true, behavior: "auto" });
});

window.addEventListener("focus", () => {
  syncLyricsToPlayback({ force: true, behavior: "auto" });
});

els.artist?.addEventListener("click", async (event) => {
  const link = event.target.closest(".artist-link");
  await loadArtistWorks(
    link?.dataset.artist || els.artist.dataset.artist || els.artist.textContent,
    link?.dataset.artistId || els.artist.dataset.artistId || ""
  );
});
els.mood?.addEventListener("click", async (event) => {
  const link = event.target.closest(".album-link");
  if (!link?.dataset.albumId && !link?.dataset.songId) return;
  await loadAlbumSongs(link.dataset.albumId, link.dataset.album || link.textContent, link.dataset.songId);
});
els.album?.addEventListener("click", async (event) => {
  const link = event.target.closest(".album-link");
  if (!link?.dataset.albumId && !link?.dataset.songId) return;
  await loadAlbumSongs(link.dataset.albumId, link.dataset.album || link.textContent, link.dataset.songId);
});
els.play.addEventListener("click", () => setPlaying(!state?.playing));
els.favoritePlaylist?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleFavoritePlaylistMenu();
});
els.favoritePlaylistMenu?.addEventListener("click", async (event) => {
  event.stopPropagation();
  const button = event.target.closest("button[data-playlist-id]");
  if (!button) return;
  await addCurrentSongToPlaylist(button.dataset.playlistId, button);
});
document.addEventListener("click", (event) => {
  if (!els.favoritePlaylistMenu || els.favoritePlaylistMenu.classList.contains("hidden")) return;
  if (event.target.closest("#favoritePlaylistMenu") || event.target.closest("#favoritePlaylistBtn")) return;
  toggleFavoritePlaylistMenu(false);
});
els.like?.addEventListener("click", async () => {
  const songId = neteaseSongId(state?.track);
  if (!songId) return;
  els.like.textContent = "...";
  els.like.disabled = true;
  const shouldLike = !els.like.classList.contains("liked");
  try {
    await api("/api/netease-like", {
      method: "POST",
      body: JSON.stringify({ id: songId, like: shouldLike })
    });
    els.like.textContent = shouldLike ? "♥" : "♡";
    els.like.classList.toggle("liked", shouldLike);
    showTransientStatus(shouldLike ? "已红心" : "已取消红心");
  } catch (error) {
    els.like.textContent = els.like.classList.contains("liked") ? "♥" : "♡";
    showTransientStatus("红心失败");
  } finally {
    els.like.disabled = false;
  }
});
els.mode?.addEventListener("click", async () => {
  const modes = ["sequence", "repeat-one", "shuffle"];
  const current = state?.playbackMode || "sequence";
  const nextMode = modes[(modes.indexOf(current) + 1) % modes.length];
  const payload = await api("/api/state", {
    method: "POST",
    body: JSON.stringify({ playbackMode: nextMode })
  });
  paint(payload);
});
els.sequence?.addEventListener("click", loadSequence);
els.next.addEventListener("click", nextTrack);
els.prev.addEventListener("click", previousTrack);
els.seek.addEventListener("input", () => {
  seekToSliderValue();
});
els.seek.addEventListener("change", seekToSliderValue);

els.history.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-history");
  if (!button?.dataset.id) return;
  const payload = await api(`/api/history/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
  paint(payload);
});

els.playlistSearch?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadPlaylist(els.playlistInput.value.trim(), 0);
});

els.playlistInput?.addEventListener("input", () => {
  window.clearTimeout(els.playlistInput._timer);
  els.playlistInput._timer = window.setTimeout(() => {
    loadPlaylist(els.playlistInput.value.trim(), 0);
  }, 220);
});

els.playlistPrev?.addEventListener("click", () => {
  loadPlaylist(playlistState.query, Math.max(0, playlistState.offset - playlistPageSize));
});

els.playlistNext?.addEventListener("click", () => {
  loadPlaylist(playlistState.query, playlistState.offset + playlistPageSize);
});

els.playlistList?.addEventListener("click", async (event) => {
  const row = event.target.closest(".playlist-row");
  if (row?.dataset.sequence) {
    const item = sequenceItems[Number(row.dataset.sequence)];
    if (!item || item.source === "current") return;
    startOptimisticPlayback(trackFromDataset(row) || item, row);
    if (item.index >= 0 && !["next", "chat"].includes(item.source)) {
      try {
        const payload = await api("/api/play", {
          method: "POST",
          body: JSON.stringify({ index: Number(item.index), track: item })
        });
        paint(payload, { announce: true });
      } finally {
        finishOptimisticPlayback(row);
      }
      return;
    }
    if (item.sourceId) {
      try {
        const payload = await api("/api/play", {
          method: "POST",
          body: JSON.stringify({ track: item })
        });
        paint(payload, { announce: true });
      } finally {
        finishOptimisticPlayback(row);
      }
    }
    return;
  }
  if (!row?.dataset.index) return;
  startOptimisticPlayback(trackFromDataset(row), row);
  try {
    const payload = await api("/api/play", {
      method: "POST",
      body: JSON.stringify({ index: Number(row.dataset.index) })
    });
    paint(payload, { announce: true });
  } finally {
    finishOptimisticPlayback(row);
  }
});

els.songidSearch?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = els.songidInput.value.trim();
  if (!query) return;
  setSongidSource("search");
  openSongidResults("正在从网易云搜索...");
  try {
    const data = await api(`/api/netease-search?q=${encodeURIComponent(query)}&limit=50`);
    setSongidBatch(data.recommendations || [], `搜索：${query}`, data.source?.cover || "");
    refreshSongidResultLikes();
  } catch (error) {
    setSongidBatch([], `搜索：${query}`);
    els.songidResults.innerHTML = `<article class="empty-list">搜索失败：${escapeHtml(error.message || "网易云搜索失败")}</article>`;
  }
});

async function loadNeteaseSource(source) {
  setSongidSource(source);
  const label = source === "personal_fm" ? "私人雷达" : "每日推荐";
  openSongidResults(`正在打开${label}...`);
  let data;
  try {
    data = await api(`/api/netease-dynamic?source=${encodeURIComponent(source)}`);
    updateSourceCardCaption(source, data);
    setSongidBatch(data.recommendations || [], data.source?.name || (source === "personal_fm" ? "私人雷达" : "每日推荐"), data.source?.cover || "");
    refreshSongidResultLikes();
  } catch (error) {
    setSongidBatch([], "NetEase Queue");
    els.songidResults.innerHTML = `<article class="empty-list">打开失败：${escapeHtml(error.message || "请确认网易云 API 已登录")}</article>`;
  }
}

els.dailySource?.addEventListener("click", () => loadNeteaseSource("daily"));
els.fmSource?.addEventListener("click", () => loadNeteaseSource("personal_fm"));

async function loadLocalSongidPlaylist() {
  setSongidSource("local");
  openSongidResults("正在打开我的喜欢...");
  let data;
  try {
    data = await api("/api/local-playlist");
    updateSourceCardCaption("local", data);
    setSongidBatch(data.recommendations || [], data.source?.name || "我的喜欢", data.source?.cover || "");
    refreshSongidResultLikes();
  } catch (error) {
    setSongidBatch([], "我的喜欢");
    els.songidResults.innerHTML = `<article class="empty-list">打开失败：${escapeHtml(error.message || "我的喜欢读取失败")}</article>`;
  }
}

$("#localPlaylistBtn")?.addEventListener("click", loadLocalSongidPlaylist);

els.importPlaylistSource?.addEventListener("click", async () => {
  const id = window.prompt("NetEase playlist ID");
  const clean = String(id || "").trim();
  if (!/^\d{4,}$/.test(clean)) return;
  saveImportedPlaylistIds([...importedPlaylistIds(), clean]);
  ensureFixedPlaylistCards();
  await loadFixedNeteasePlaylist(clean);
});

async function loadFixedNeteasePlaylist(id = "") {
  if (!/^\d{4,}$/.test(String(id || ""))) return;
  setSongidSource(`playlist-${id}`);
  const sourceButton = document.querySelector(`.source-card[data-source="${CSS.escape(`playlist-${id}`)}"] strong`);
  const loadingName = sourceButton?.textContent?.trim() || `Playlist ${id}`;
  openSongidResults(`正在打开 ${escapeHtml(loadingName)}...`);
  let data;
  try {
    data = await api(`/api/netease-playlist?id=${encodeURIComponent(id)}`);
    updateSourceCardCaption(`playlist-${id}`, data);
    setSongidBatch(data.recommendations || [], data.source?.name || `Playlist ${id}`, data.source?.cover || "");
    refreshSongidResultLikes();
  } catch (error) {
    setSongidBatch([], `Playlist ${id}`);
    els.songidResults.innerHTML = `<article class="empty-list">打开失败：${escapeHtml(error.message || "请确认网易云 API 已登录")}</article>`;
  }
}

function bindFixedPlaylistCards() {
  document.querySelectorAll('.source-card[data-source^="playlist-"]').forEach((button) => {
    if (button.dataset.boundPlaylist) return;
    button.dataset.boundPlaylist = "true";
    button.addEventListener("click", () => loadFixedNeteasePlaylist(button.dataset.playlistId || button.dataset.source.replace("playlist-", "")));
  });
}
async function playCurrentSongidBatch() {
  if (!currentSongidBatch.length) return;
  const payload = await api("/api/play-batch", {
    method: "POST",
    body: JSON.stringify({
      name: currentSongidBatchName,
      tracks: currentSongidBatch
    })
  });
  paint(payload, { announce: true });
  toggleSongidActionMenu(false);
}

async function appendCurrentSongidBatch() {
  if (!currentSongidBatch.length) return;
  const payload = await api("/api/append-batch", {
    method: "POST",
    body: JSON.stringify({
      name: currentSongidBatchName,
      tracks: currentSongidBatch
    })
  });
  paint(payload);
  showTransientStatus("已追加到后续播放");
  loadSequence();
  toggleSongidActionMenu(false);
}

els.songidPlayAll?.addEventListener("click", playCurrentSongidBatch);
els.songidActionMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!currentSongidBatch.length) return;
  toggleSongidActionMenu();
});
els.songidActionMenu?.addEventListener("click", async (event) => {
  event.stopPropagation();
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "append") await appendCurrentSongidBatch();
  else await playCurrentSongidBatch();
});
document.addEventListener("click", (event) => {
  if (els.songidActionMenu?.classList.contains("hidden")) return;
  if (event.target.closest(".songid-actions")) return;
  toggleSongidActionMenu(false);
});

els.songidBack?.addEventListener("click", () => {
  setSongidView("home");
});

els.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = els.chatInput.value.trim();
  if (!message) return;
  els.chatInput.value = "";
  addChat("me", message);
  const pending = addPendingStationMessage();
  try {
    const { reply, recommendations = [], memory } = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message })
    });
    updateChatMemory(memory);
    updateStationMessage(pending, reply, recommendations);
  } catch (error) {
    updateStationMessage(pending, `这条回复失败了：${error.message || "网络或服务异常"}`);
  }
});

els.chatLog.addEventListener("click", async (event) => {
  const artistLink = event.target.closest(".artist-link");
  if (artistLink?.dataset.artist) {
    await loadArtistWorks(artistLink.dataset.artist, artistLink.dataset.artistId);
    return;
  }
  const card = event.target.closest(".song-card");
  if (!card?.dataset.index) return;
  const body = card.dataset.external
    ? {
      track: {
        sourceId: card.dataset.sourceId,
        title: card.dataset.title,
        artist: card.dataset.artist,
        album: card.dataset.album,
        cover: card.dataset.cover,
        duration: Number(card.dataset.duration || 0)
      }
    }
    : { index: Number(card.dataset.index) };
  startOptimisticPlayback(body.track || trackFromDataset(card), card);
  try {
    const payload = await api("/api/play", {
      method: "POST",
      body: JSON.stringify(body)
    });
    paint(payload, { announce: true });
  } finally {
    finishOptimisticPlayback(card);
  }
});

els.songidResults?.addEventListener("click", async (event) => {
  const albumLink = event.target.closest(".album-link");
  if (albumLink?.dataset.albumId || albumLink?.dataset.songId) {
    await loadAlbumSongs(albumLink.dataset.albumId, albumLink.dataset.album || albumLink.textContent, albumLink.dataset.songId);
    return;
  }
  const artistLink = event.target.closest(".artist-link");
  if (artistLink?.dataset.artist) {
    await loadArtistWorks(artistLink.dataset.artist, artistLink.dataset.artistId);
    return;
  }
  const card = event.target.closest(".songid-card");
  if (!card) return;
  if (event.target.closest(".song-meta") && (card.dataset.albumId || card.dataset.sourceId) && !event.target.closest(".artist-link")) {
    await loadAlbumSongs(card.dataset.albumId, card.dataset.album, card.dataset.sourceId);
    return;
  }
  if (event.target.closest(".songid-like")) {
    const button = event.target.closest(".songid-like");
    const shouldLike = !button.classList.contains("liked");
    button.textContent = "...";
    try {
      await api("/api/netease-like", {
        method: "POST",
        body: JSON.stringify({ id: card.dataset.sourceId, like: shouldLike })
      });
      button.textContent = shouldLike ? "♥" : "♡";
      button.classList.toggle("liked", shouldLike);
    } catch {
      button.textContent = button.classList.contains("liked") ? "♥" : "♡";
      showTransientStatus("LIKE FAILED");
    }
    return;
  }
  if (event.target.closest(".songid-queue")) {
    const button = event.target.closest(".songid-queue");
    button.classList.add("loading");
    button.textContent = "...";
    try {
      const payload = await api("/api/queue-next", {
        method: "POST",
        body: JSON.stringify({
          track: cardTrack(card)
        })
      });
      button.classList.remove("loading");
      button.classList.add("queued");
      button.textContent = "✓";
      showTransientStatus("NEXT UP");
      paint(payload);
      window.setTimeout(() => {
        button.classList.remove("queued");
        button.textContent = "";
      }, 900);
    } catch {
      button.classList.remove("loading", "queued");
      button.textContent = "";
      showTransientStatus("QUEUE FAILED");
    }
    return;
  }
  const track = cardTrack(card);
  startOptimisticPlayback(track, card);
  try {
    const payload = await api("/api/play", {
      method: "POST",
      body: JSON.stringify({ track })
    });
    paint(payload, { announce: true });
  } finally {
    finishOptimisticPlayback(card);
  }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js?v=201");

window.addEventListener("resize", scheduleAlbumReflection);
els.coverArt?.addEventListener("load", scheduleAlbumReflection);
window.addEventListener("load", scheduleAlbumReflection);
window.setTimeout(scheduleAlbumReflection, 800);

const events = new EventSource("/api/stream");
events.addEventListener("message", (event) => paint(JSON.parse(event.data)));

updateClock();
setInterval(updateClock, 1000);
drawScope();
ensureFixedPlaylistCards();
loadTaste();
loadPlaylist();
refreshSourceCardCaptions();
sendLocation();
api("/api/now").then(paint);
