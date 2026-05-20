const $ = (selector) => document.querySelector(selector);

const els = {
  shell: $(".player"),
  clock: $("#clock"),
  signal: $("#signal"),
  cover: $("#cover"),
  coverArt: $("#coverArt"),
  scope: $("#scope"),
  mood: $("#mood"),
  title: $("#title"),
  artist: $("#artist"),
  libraryCount: $("#libraryCount"),
  hostLine: $("#hostLine"),
  currentLyric: $("#currentLyric"),
  nextLyric: $("#nextLyric"),
  play: $("#playBtn"),
  next: $("#nextBtn"),
  prev: $("#prevBtn"),
  seek: $("#seek"),
  elapsed: $("#elapsed"),
  duration: $("#duration"),
  weather: $("#weather"),
  tasteList: $("#tasteList"),
  profileSummary: $("#profileSummary"),
  chatMemory: $("#chatMemory"),
  history: $("#history"),
  planText: $("#planText"),
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
let audioErrorCount = 0;
let transientStatusTimer;
let silentFallbackTimer;
let pendingAudioKey = "";
let nextInFlight = false;

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
  }).then((res) => res.json());
}

function showTransientStatus(text) {
  window.clearTimeout(transientStatusTimer);
  els.signal.textContent = text;
  transientStatusTimer = window.setTimeout(() => {
    if (state?.weather) {
      els.signal.textContent = "";
    }
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
  els.clock.textContent = time;
  if (state?.weather) updateWeatherLabel(state.weather);
}

function updateWeatherLabel(weather) {
  const time = els.clock.textContent || new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
  const text = String(weather.text || "").replace(/^当前位置\s*/, "").trim() || "天气";
  els.weather.innerHTML = `<span class="panel-time">${escapeHtml(time)}</span><span>${escapeHtml(text)} ${escapeHtml(weather.temp)}°</span>`;
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

async function loadLyrics(track) {
  const key = track.sourceId || track.id || track.title;
  if (lyricTrackKey === key) return;
  lyricTrackKey = key;
  lyricLines = [];
  els.currentLyric.textContent = "正在加载歌词";
  els.nextLyric.textContent = "";
  const songId = track.sourceId || track.id;
  if (!songId) {
    els.currentLyric.textContent = "暂无歌词";
    return;
  }
  const data = await api(`/api/lyric?id=${encodeURIComponent(songId)}`);
  lyricLines = parseLyrics(data.lyric);
  if (!lyricLines.length) {
    els.currentLyric.textContent = "暂无歌词";
    return;
  }
  updateLyric(0);
}

function updateLyric(seconds) {
  if (!lyricLines.length) return;
  let index = lyricLines.findIndex((line, lineIndex) => seconds >= line.time && seconds < (lyricLines[lineIndex + 1]?.time ?? Infinity));
  if (index < 0) index = 0;
  els.currentLyric.textContent = lyricLines[index]?.text || "暂无歌词";
  els.nextLyric.textContent = lyricLines[index + 1]?.text || "";
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

function paint(payload, { announce = false } = {}) {
  const previousKey = trackKey(state?.track);
  const previousPlaying = Boolean(state?.playing);
  state = payload;
  const track = payload.track;
  const currentKey = trackKey(track);
  const changedTrack = previousKey !== currentKey;
  const duration = track.duration || 150;
  els.mood.textContent = "";
  els.title.textContent = track.title;
  els.title.title = track.title;
  els.title.classList.toggle("long-title", track.title.length > 42);
  els.title.classList.toggle("very-long-title", track.title.length > 72);
  els.artist.textContent = track.artist;
  els.libraryCount.textContent = `${payload.library?.trackCount || 0} tracks imported`;
  els.hostLine.textContent = payload.lastHostLine;
  if (!payload.lastHostLine) els.hostLine.textContent = " ";
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
  els.play.textContent = payload.playing ? "Ⅱ" : "▶";
  els.shell.classList.toggle("playing", payload.playing);
  els.signal.textContent = "";
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
  if (announce) speak(payload.lastHostLine);
}

function renderHistory(history) {
  els.history.innerHTML = history.length
    ? history.map((item, index) => `
      <article>
        <button class="delete-history" data-id="${escapeHtml(item.id || `index-${index}`)}" title="Delete" aria-label="Delete ${escapeHtml(item.track.title)}">×</button>
        <strong>${escapeHtml(item.track.title)}</strong>
        <small>${escapeHtml(item.line)}</small>
      </article>
    `).join("")
    : `<article><strong>等待第一段串场</strong><small>点下一首，AI DJ 会生成一次上下文口播。</small></article>`;
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
  els.chatMemory.textContent = `${memory.chatCount || 0} chats · ${prefs}`;
}

async function loadPlan() {
  const plan = await api("/api/plan/today");
  els.planText.textContent = plan.markdown;
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

async function nextTrack(reason = "manual") {
  if (nextInFlight) return;
  nextInFlight = true;
  if (reason === "manual") stopSound();
  try {
    const payload = await api("/api/next");
    payload.playing = true;
    await api("/api/state", {
      method: "POST",
      body: JSON.stringify({ playing: true })
    });
    paint(payload, { announce: true });
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

function addChat(role, text) {
  const p = document.createElement("p");
  p.className = role === "me" ? "me" : "";
  p.innerHTML = `<small>${role === "me" ? "You" : "Station"}</small><br>${escapeHtml(text)}`;
  els.chatLog.appendChild(p);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function addStationMessage(text, recommendations = []) {
  const p = document.createElement("p");
  const cards = recommendations.length
    ? `<div class="recommendations">${recommendations.map((item) => `
      <button class="song-card" data-index="${item.index}">
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.artist)}${item.album ? ` · ${escapeHtml(item.album)}` : ""}</small>
        </span>
        <span class="play-chip" aria-hidden="true"></span>
      </button>
    `).join("")}</div>`
    : "";
  p.innerHTML = `<small>Station</small><br>${escapeHtml(text)}${cards}`;
  els.chatLog.appendChild(p);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
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
    document.querySelectorAll(".tabs button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.id !== button.dataset.view));
  });
});

els.play.addEventListener("click", () => setPlaying(!state?.playing));
els.next.addEventListener("click", nextTrack);
els.prev.addEventListener("click", nextTrack);
els.seek.addEventListener("input", () => {
  const duration = state?.track?.duration || 150;
  elapsedBeforePause = (Number(els.seek.value) / 1000) * duration;
  startedAt = Date.now();
  if (audio) audio.currentTime = elapsedBeforePause;
});

els.history.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-history");
  if (!button?.dataset.id) return;
  const payload = await api(`/api/history/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
  paint(payload);
});

els.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = els.chatInput.value.trim();
  if (!message) return;
  els.chatInput.value = "";
  addChat("me", message);
  const { reply, recommendations = [], memory } = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message })
  });
  updateChatMemory(memory);
  addStationMessage(reply, recommendations);
});

els.chatLog.addEventListener("click", async (event) => {
  const card = event.target.closest(".song-card");
  if (!card?.dataset.index) return;
  const payload = await api("/api/play", {
    method: "POST",
    body: JSON.stringify({ index: Number(card.dataset.index) })
  });
  paint(payload, { announce: true });
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");

const events = new EventSource("/api/stream");
events.addEventListener("message", (event) => paint(JSON.parse(event.data)));

updateClock();
setInterval(updateClock, 1000);
drawScope();
loadTaste();
loadPlan();
sendLocation();
api("/api/now").then(paint);
