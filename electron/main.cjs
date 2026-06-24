const { app, BrowserWindow, Menu, ipcMain, shell, dialog, nativeImage } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const APP_PORT = Number(process.env.PORT || 3000);
const APP_URL = `http://localhost:${APP_PORT}`;
const DESKTOP_BOOT_MIN_MS = 700;
const DESKTOP_BOOT_SETTLE_MS = 120;
const DEFAULT_CONFIG = {
  neteaseApiBase: "http://localhost:4000",
  neteaseApiProjectPath: "",
  neteaseCookie: "",
  neteaseLibraryPlaylistId: "",
  neteaseImportedPlaylistIds: "",
  neteaseFavoritePlaylistIds: "",
  neteasePlaylistNames: "",
  legacyProjectPath: "",
  deepseekApiKey: "",
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekModel: "deepseek-chat"
};

let mainWindow;
let loginWindow;
let settingsWindow;
let serverProcess;
let neteaseApiProcess;
let neteaseApiStartupPromise = null;
let neteaseApiIssueShown = false;
let thumbarSyncTimer = null;
let lastThumbarSignature = "";
let appQuitting = false;
let serverRestartTimer = null;
let playerLoadRetryTimer = null;
let playerLoadRetryCount = 0;
let suppressServerExitRestart = false;
let playerPageLoadedOnce = false;
let bootScreenFallbackTimer = null;

app.setPath("userData", path.join(app.getPath("appData"), "Claudio AI Radio Desktop"));
app.setAppUserModelId("com.claudio.ai-radio");

function projectRoot() {
  return app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
}

function appIconPath() {
  return path.join(projectRoot(), "build", "icon.ico");
}

function desktopDataDir() {
  return path.join(app.getPath("userData"), "data");
}

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function desktopLogPath() {
  return path.join(app.getPath("userData"), "logs", "desktop.log");
}

function createThumbarIcon(fileName) {
  return nativeImage.createFromPath(path.join(projectRoot(), "build", "thumbar", fileName)).resize({ width: 16, height: 16 });
}

const THUMBAR_ICONS = {
  previous: createThumbarIcon("previous.png"),
  play: createThumbarIcon("play.png"),
  pause: createThumbarIcon("pause.png"),
  next: createThumbarIcon("next.png")
};

function appendDesktopLog(scope, message, extra = "") {
  try {
    const target = desktopLogPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const suffix = extra ? `\n${extra}` : "";
    fs.appendFileSync(target, `[${new Date().toISOString()}] [${scope}] ${message}${suffix}\n`, "utf8");
  } catch {}
}

async function waitForBootFloor(startedAt, minimumMs = DESKTOP_BOOT_MIN_MS) {
  const elapsed = Date.now() - startedAt;
  const remaining = Math.max(0, Number(minimumMs || 0) - elapsed);
  if (!remaining) return;
  await new Promise((resolve) => setTimeout(resolve, remaining));
}

async function isAppServerHealthy(timeoutMs = 1200) {
  return waitForServer(timeoutMs);
}

function clearServerRestartTimer() {
  if (serverRestartTimer) clearTimeout(serverRestartTimer);
  serverRestartTimer = null;
}

function clearPlayerLoadRetryTimer() {
  if (playerLoadRetryTimer) clearTimeout(playerLoadRetryTimer);
  playerLoadRetryTimer = null;
}

function clearBootScreenFallbackTimer() {
  if (bootScreenFallbackTimer) clearTimeout(bootScreenFallbackTimer);
  bootScreenFallbackTimer = null;
}

function describeWindowUrl(window = mainWindow) {
  try {
    if (!window || window.isDestroyed()) return "destroyed";
    return String(window.webContents?.getURL?.() || "about:blank");
  } catch {
    return "unavailable";
  }
}

function scheduleBootScreenFallback(reason = "unknown", message = "\u64ad\u653e\u5668\u670d\u52a1\u6b63\u5728\u91cd\u8fde\uff0c\u8bf7\u7a0d\u540e...", delay = 1800) {
  if (appQuitting || !mainWindow || mainWindow.isDestroyed()) return;
  if (bootScreenFallbackTimer) return;
  appendDesktopLog("window", `schedule boot fallback: ${reason}`, `delay=${delay} url=${describeWindowUrl()} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
  bootScreenFallbackTimer = setTimeout(async () => {
    clearBootScreenFallbackTimer();
    const healthy = await isAppServerHealthy(1200);
    appendDesktopLog("window", `run boot fallback: ${reason}`, `healthy=${healthy ? 1 : 0} url=${describeWindowUrl()} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
    if (healthy && playerPageLoadedOnce) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      await loadBootScreen(mainWindow, message);
    }
  }, delay);
}

function scheduleServerRestart(reason = "unknown") {
  if (appQuitting) return;
  if (serverProcess && !serverProcess.killed) return;
  if (serverRestartTimer) return;
  appendDesktopLog("server", `schedule restart: ${reason}`);
  serverRestartTimer = setTimeout(async () => {
    clearServerRestartTimer();
    try {
      await startServer();
      const ready = await waitForServer(8000);
      appendDesktopLog("server", `restart finished: ready=${Boolean(ready)}`);
    } catch (error) {
      appendDesktopLog("server", "restart failed", String(error?.stack || error));
    }
  }, 800);
}

function schedulePlayerReload(reason = "load-failed") {
  if (appQuitting || !mainWindow || mainWindow.isDestroyed()) return;
  if (playerLoadRetryTimer) return;
  const delay = Math.min(2400, 600 + playerLoadRetryCount * 400);
  appendDesktopLog("window", `schedule reload: ${reason}`, `retry=${playerLoadRetryCount + 1} delay=${delay}`);
  playerLoadRetryTimer = setTimeout(async () => {
    clearPlayerLoadRetryTimer();
    playerLoadRetryCount += 1;
    try {
      await startServer();
      const ready = await waitForServer(8000);
      if (ready && mainWindow && !mainWindow.isDestroyed()) {
        await loadPlayerWindow(mainWindow, { hardReload: true });
      } else if (mainWindow && !mainWindow.isDestroyed()) {
        await loadBootScreen(mainWindow, "鎾斁鍣ㄦ湇鍔℃鍦ㄩ噸杩烇紝璇风◢鍚?..");
      }
    } catch (error) {
      appendDesktopLog("window", "reload after failure failed", String(error?.stack || error));
    }
  }, delay);
}

function notifyNeteaseApiIssue(reason) {
  const configuredPath = String(readConfig().neteaseApiProjectPath || "").trim();
  const resolvedPath = resolveNeteaseApiProjectPath();
  appendDesktopLog("netease-api", reason, `configuredPath=${configuredPath || "(empty)"}\nresolvedPath=${resolvedPath || "(missing)"}`);
  if (neteaseApiIssueShown) return;
  neteaseApiIssueShown = true;
  const detail = [
    "NetEase service failed to start.",
    "",
    `Reason: ${reason}`,
    "",
    `Log: ${desktopLogPath()}`,
    `Configured path: ${configuredPath || "(empty)"}`,
    `Resolved path: ${resolvedPath || "(missing)"}`
  ].join("\n");
  if (app.isReady()) {
    dialog.showMessageBox({
      type: "warning",
      title: "Claudio AI Radio Desktop",
      message: "NetEase service startup failed",
      detail
    }).catch(() => {});
  }
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8").replace(/^\uFEFF/, "");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function isValidNeteaseApiProjectPath(candidate) {
  if (!candidate) return false;
  try {
    return fs.existsSync(path.join(candidate, "package.json"));
  } catch {
    return false;
  }
}

function findBundledNeteaseApiProjectPath() {
  const candidates = [];
  try {
    candidates.push(path.dirname(require.resolve("@neteasecloudmusicapienhanced/api/package.json", {
      paths: [projectRoot(), __dirname]
    })));
  } catch {}
  candidates.push(path.join(projectRoot(), "node_modules", "@neteasecloudmusicapienhanced", "api"));
  return candidates.find((candidate) => isValidNeteaseApiProjectPath(candidate)) || "";
}

function resolveNeteaseApiProjectPath() {
  const configured = String(readConfig().neteaseApiProjectPath || "").trim();
  if (isValidNeteaseApiProjectPath(configured)) return configured;
  return findBundledNeteaseApiProjectPath();
}

function legacyProjectPath() {
  return readConfig().legacyProjectPath || projectRoot();
}

function sourceDataDir() {
  return path.join(legacyProjectPath(), "data");
}

function writeConfig(nextConfig) {
  const config = { ...readConfig(), ...nextConfig };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

function readLegacySecrets(baseDir = legacyProjectPath()) {
  const secretsPath = path.join(baseDir, "radio-secrets.ps1");
  const legacy = {};
  try {
    const text = fs.readFileSync(secretsPath, "utf8");
    const pairs = [
      ["neteaseCookie", "NETEASE_COOKIE"],
      ["deepseekApiKey", "DEEPSEEK_API_KEY"],
      ["deepseekBaseUrl", "DEEPSEEK_BASE_URL"],
      ["deepseekModel", "DEEPSEEK_MODEL"],
      ["neteaseApiBase", "NETEASE_API_BASE"],
      ["neteaseApiProjectPath", "NETEASE_API_PROJECT_PATH"],
      ["neteaseLibraryPlaylistId", "NETEASE_LIBRARY_PLAYLIST_ID"],
      ["neteaseImportedPlaylistIds", "NETEASE_IMPORTED_PLAYLIST_IDS"],
      ["neteaseFavoritePlaylistIds", "NETEASE_FAVORITE_PLAYLIST_IDS"],
      ["neteasePlaylistNames", "NETEASE_PLAYLIST_NAMES"]
    ];
    for (const [configKey, envKey] of pairs) {
      const escaped = envKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = text.match(new RegExp(`\\$env:${escaped}\\s*=\\s*(['"])([\\s\\S]*?)\\1`));
      if (match?.[2]) legacy[configKey] = match[2];
    }
  } catch {}
  return legacy;
}

function serverEnv() {
  const config = readConfig();
  return {
    ...process.env,
    PORT: String(APP_PORT),
    CLAUDIO_DATA_DIR: desktopDataDir(),
    NETEASE_API_BASE: config.neteaseApiBase || DEFAULT_CONFIG.neteaseApiBase,
    NETEASE_COOKIE: config.neteaseCookie || "",
    NETEASE_LIBRARY_PLAYLIST_ID: config.neteaseLibraryPlaylistId || "",
    NETEASE_IMPORTED_PLAYLIST_IDS: config.neteaseImportedPlaylistIds || "",
    NETEASE_FAVORITE_PLAYLIST_IDS: config.neteaseFavoritePlaylistIds || "",
    NETEASE_PLAYLIST_NAMES: config.neteasePlaylistNames || "",
    DEEPSEEK_API_KEY: config.deepseekApiKey || "",
    DEEPSEEK_BASE_URL: config.deepseekBaseUrl || DEFAULT_CONFIG.deepseekBaseUrl,
    DEEPSEEK_MODEL: config.deepseekModel || DEFAULT_CONFIG.deepseekModel,
    ELECTRON_RUN_AS_NODE: "1"
  };
}

function ensureDesktopDataDir() {
  fs.mkdirSync(desktopDataDir(), { recursive: true });
  const defaults = {
    "playlists.json": JSON.stringify({
      source: "empty",
      importedAt: new Date().toISOString(),
      playlist: { id: "empty", name: "Empty Queue", creator: "Local", cover: "", trackCount: 0 },
      playlists: [],
      tracks: []
    }, null, 2),
    "playback-state.json": "{}",
    "memory.json": JSON.stringify({ chatCount: 0, preferences: [], recentAsks: [], artistAliases: {}, lastRecommendations: [] }, null, 2),
    "taste.json": "{}",
    "mood-rules.md": "",
    "routines.md": ""
  };
  for (const [file, content] of Object.entries(defaults)) {
    const target = path.join(desktopDataDir(), file);
    if (!fs.existsSync(target)) fs.writeFileSync(target, `${content}\n`, "utf8");
  }
}

function resetDesktopData({ clearConfig = false } = {}) {
  try {
    fs.rmSync(desktopDataDir(), { recursive: true, force: true });
  } catch {}
  ensureDesktopDataDir();
  if (clearConfig) {
    try {
      fs.rmSync(configPath(), { force: true });
    } catch {}
  }
  return { dataDir: desktopDataDir(), clearConfig };
}

async function startServer() {
  if (serverProcess && !serverProcess.killed) return true;
  if (await isAppServerHealthy(700)) {
    appendDesktopLog("server", "reuse existing healthy server on 3000");
    return true;
  }
  ensureDesktopDataDir();
  clearServerRestartTimer();
  suppressServerExitRestart = false;
  const root = projectRoot();
  serverProcess = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: serverEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  appendDesktopLog("server", "spawned", `pid=${serverProcess.pid || "unknown"}`);
  serverProcess.stdout?.on("data", (chunk) => {
    const text = String(chunk || "").trim();
    if (text) appendDesktopLog("server:stdout", text.slice(-4000));
  });
  serverProcess.stderr?.on("data", (chunk) => {
    const text = String(chunk || "").trim();
    if (text) appendDesktopLog("server:stderr", text.slice(-4000));
  });
  serverProcess.on("exit", async (code, signal) => {
    appendDesktopLog("server", "process exited", `code=${String(code)} signal=${String(signal)}`);
    serverProcess = null;
    if (suppressServerExitRestart || appQuitting) {
      appendDesktopLog("server", "skip restart after exit", `suppressed=true code=${String(code)} signal=${String(signal)}`);
      suppressServerExitRestart = false;
      return;
    }
    const healthy = await isAppServerHealthy(1500);
    if (healthy) {
      appendDesktopLog("server", "skip restart after exit", `healthy-server-detected code=${String(code)} signal=${String(signal)}`);
      return;
    }
    scheduleServerRestart(`exit:${String(code)}:${String(signal)}`);
  });
}

async function loadBootScreen(window, message = "\u6b63\u5728\u542f\u52a8\u64ad\u653e\u5668...") {
  if (!window || window.isDestroyed()) return;
  appendDesktopLog("window", "loadBootScreen", `message=${String(message || "").slice(0, 120)} url=${describeWindowUrl(window)} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Claudio AI Radio Desktop</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at top, #131a22 0%, #0b0f14 48%, #050706 100%);
      color: #f5efe6;
      font-family: "Microsoft YaHei UI", "Segoe UI", sans-serif;
    }
    main {
      width: min(420px, calc(100vw - 48px));
      display: grid;
      gap: 14px;
      justify-items: center;
      text-align: center;
      padding: 28px 26px;
      border-radius: 18px;
      background: rgba(13, 18, 24, 0.88);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
      border: 1px solid rgba(245, 239, 230, 0.08);
      backdrop-filter: blur(8px);
    }
    h1 {
      margin: 0;
      font-size: 30px;
      font-weight: 760;
      line-height: 1.1;
    }
    p {
      margin: 0;
      color: rgba(245, 239, 230, 0.68);
      font-size: 14px;
      line-height: 1.5;
    }
    .progress {
      width: min(280px, 100%);
      display: grid;
      gap: 8px;
    }
    .percent {
      justify-self: end;
      color: rgba(245, 239, 230, 0.82);
      font-size: 13px;
      line-height: 1;
    }
    .bar {
      width: 100%;
      height: 6px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(245, 239, 230, 0.12);
    }
    .bar-fill {
      width: 8%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #d94d4d 0%, #f4b183 100%);
      transition: width .24s ease;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #d94d4d;
      box-shadow: 0 0 0 10px rgba(217, 77, 77, 0.12);
    }
  </style>
</head>
<body>
  <main>
    <div class="dot"></div>
    <h1>Claudio AI Radio Desktop</h1>
    <div class="progress" aria-hidden="true">
      <span id="bootPercent" class="percent">8%</span>
      <div class="bar"><div id="bootBarFill" class="bar-fill"></div></div>
    </div>
    <p id="bootMessage">${String(message || "\u6b63\u5728\u542f\u52a8\u64ad\u653e\u5668...").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</p>
  </main>
</body>
</html>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function updateBootScreenProgress(window, progress = 8, message = "\u6b63\u5728\u542f\u52a8\u64ad\u653e\u5668...") {
  if (!window || window.isDestroyed()) return;
  const currentUrl = describeWindowUrl(window);
  if (!currentUrl.startsWith("data:text/html")) return;
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  const safeMessage = JSON.stringify(String(message || ""));
  const script = `(() => {
    const percent = ${percent};
    const fill = document.getElementById("bootBarFill");
    const label = document.getElementById("bootPercent");
    const text = document.getElementById("bootMessage");
    if (fill) fill.style.width = percent + "%";
    if (label) label.textContent = percent + "%";
    if (text) text.textContent = ${safeMessage};
  })();`;
  try {
    await window.webContents.executeJavaScript(script, true);
  } catch {}
}

async function loadPlayerWindow(window, { hardReload = false } = {}) {
  if (!window || window.isDestroyed()) return;
  clearBootScreenFallbackTimer();
  const targetUrl = `${APP_URL}/?desktop=1&t=${Date.now()}`;
  appendDesktopLog("window", "loadPlayerWindow", `hardReload=${hardReload ? 1 : 0} target=${targetUrl} current=${describeWindowUrl(window)} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
  if (hardReload) {
    try {
      const ses = window.webContents.session;
      await ses.clearCache();
      await ses.clearStorageData({
        storages: ["serviceworkers", "cachestorage", "indexdb", "localstorage"]
      });
    } catch {}
  }
  await window.loadURL(targetUrl);
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
  clearServerRestartTimer();
  suppressServerExitRestart = true;
  serverProcess.kill();
  serverProcess = null;
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${APP_URL}/api/health`, { cache: "no-store" });
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function desktopFetch(pathname, { method = "GET", body } = {}) {
  const response = await fetch(`${APP_URL}${pathname}`, {
    method,
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new Error(`Desktop API HTTP ${response.status}: ${pathname}`);
  return response.json();
}

async function fetchThumbarPlaybackState() {
  try {
    return await desktopFetch("/api/now");
  } catch (error) {
    appendDesktopLog("thumbar", "fetch /api/now failed", String(error?.stack || error));
    return null;
  }
}

async function fetchDesktopNowQuiet() {
  try {
    return await desktopFetch("/api/now");
  } catch {
    return null;
  }
}

async function waitForDesktopLaunchState(timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const payload = await fetchDesktopNowQuiet();
    const title = String(payload?.track?.title || "").trim();
    const cover = String(payload?.track?.cover || payload?.cover || "").trim();
    const trackId = String(payload?.track?.id || payload?.track?.sourceId || "").trim();
    const queueLength = Number(payload?.sequenceState?.total || payload?.sequenceState?.items?.length || 0);
    const isEmptyQueueState = !trackId || !title || /^choose a playlist$/i.test(title) || queueLength <= 0;
    if (cover) return { ready: true, reason: "cover", payload };
    if (isEmptyQueueState) return { ready: true, reason: "empty-queue", payload };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ready: false, reason: "timeout", payload: null };
}

async function toggleDesktopPlayback() {
  const payload = await fetchThumbarPlaybackState();
  if (!payload) return null;
  return desktopFetch("/api/state", {
    method: "POST",
    body: { playing: !Boolean(payload.playing) }
  });
}

async function shutdownDesktopLyricsOverlay() {
  try {
    await desktopFetch("/api/desktop-lyrics/shutdown", { method: "POST" });
  } catch (error) {
    appendDesktopLog("desktop-lyrics", "shutdown failed", String(error?.stack || error));
  }
}

async function invokeThumbarAction(action) {
  try {
    if (action === "previous") await desktopFetch("/api/previous");
    if (action === "toggle") await toggleDesktopPlayback();
    if (action === "next") await desktopFetch("/api/next");
  } catch (error) {
    appendDesktopLog("thumbar", `action failed: ${action}`, String(error?.stack || error));
  } finally {
    updateThumbarButtons(true).catch(() => {});
  }
}

async function updateThumbarButtons(force = false) {
  if (process.platform !== "win32") return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const payload = await fetchThumbarPlaybackState();
  const playing = Boolean(payload?.playing);
  const available = Boolean(payload);
  const signature = `${available ? 1 : 0}:${playing ? 1 : 0}`;
  if (!force && signature === lastThumbarSignature) return;
  lastThumbarSignature = signature;
  mainWindow.setThumbarButtons([
    {
      tooltip: "Previous",
      icon: THUMBAR_ICONS.previous,
      flags: available ? ["dismissonclick"] : ["disabled"],
      click: () => invokeThumbarAction("previous")
    },
    {
      tooltip: playing ? "Pause" : "Play",
      icon: playing ? THUMBAR_ICONS.pause : THUMBAR_ICONS.play,
      flags: available ? ["dismissonclick"] : ["disabled"],
      click: () => invokeThumbarAction("toggle")
    },
    {
      tooltip: "Next",
      icon: THUMBAR_ICONS.next,
      flags: available ? ["dismissonclick"] : ["disabled"],
      click: () => invokeThumbarAction("next")
    }
  ]);
}

function startThumbarSync() {
  if (process.platform !== "win32") return;
  stopThumbarSync();
  thumbarSyncTimer = setInterval(() => {
    updateThumbarButtons().catch(() => {});
  }, 1500);
}

function stopThumbarSync() {
  if (thumbarSyncTimer) clearInterval(thumbarSyncTimer);
  thumbarSyncTimer = null;
}

async function isNeteaseApiReady(timeoutMs = 1200) {
  const base = (readConfig().neteaseApiBase || DEFAULT_CONFIG.neteaseApiBase).replace(/\/$/, "");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${base}/login/status?timestamp=${Date.now()}`, { cache: "no-store" });
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function startNeteaseApiIfNeeded() {
  if (await isNeteaseApiReady()) return true;
  if (neteaseApiStartupPromise) return neteaseApiStartupPromise;
  if (neteaseApiProcess && !neteaseApiProcess.killed) {
    neteaseApiStartupPromise = isNeteaseApiReady(12000).finally(() => {
      neteaseApiStartupPromise = null;
    });
    return neteaseApiStartupPromise;
  }
  const apiDir = resolveNeteaseApiProjectPath();
  if (!apiDir) {
    notifyNeteaseApiIssue(`鎵句笉鍒?api-enhanced 椤圭洰: ${apiDir}`);
    return false;
  }
  neteaseApiProcess = spawn(process.execPath, [path.join(__dirname, "netease-api-runner.cjs"), apiDir], {
    cwd: projectRoot(),
    env: { ...process.env, PORT: "4000", ELECTRON_RUN_AS_NODE: "1" },
    stdio: "ignore",
    windowsHide: true
  });
  neteaseApiProcess.on("exit", () => {
    appendDesktopLog("netease-api", "process exited");
    neteaseApiProcess = null;
    neteaseApiStartupPromise = null;
  });
  appendDesktopLog("netease-api", "spawned process", `projectPath=${apiDir}`);
  neteaseApiStartupPromise = isNeteaseApiReady(12000).then((ready) => {
    if (!ready) notifyNeteaseApiIssue("绛夊緟 4000 绔彛瓒呮椂锛屾湇鍔℃湭灏辩华");
    else appendDesktopLog("netease-api", "ready on port 4000");
    return ready;
  }).catch((error) => {
    notifyNeteaseApiIssue(error?.message || "鏈煡閿欒");
    return false;
  }).finally(() => {
    neteaseApiStartupPromise = null;
  });
  return neteaseApiStartupPromise;
}

function stopNeteaseApiProcess() {
  if (!neteaseApiProcess || neteaseApiProcess.killed) return;
  neteaseApiProcess.kill();
  neteaseApiProcess = null;
}

async function desktopServiceStatus() {
  const serverReady = await waitForServer(1200);
  const neteaseReady = await isNeteaseApiReady(1200);
  return {
    app: {
      port: 3000,
      connected: Boolean(serverReady),
      processAlive: Boolean(serverProcess && !serverProcess.killed)
    },
    netease: {
      port: 4000,
      connected: Boolean(neteaseReady),
      processAlive: Boolean(neteaseApiProcess && !neteaseApiProcess.killed)
    }
  };
}

async function reconnectDesktopServices() {
  appendDesktopLog("desktop", "reconnect services requested", `url=${describeWindowUrl()} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
  stopServer();
  stopNeteaseApiProcess();
  await startServer();
  const serverReady = await waitForServer();
  const neteaseReady = await startNeteaseApiIfNeeded();
  if (mainWindow && !mainWindow.isDestroyed()) {
    await loadPlayerWindow(mainWindow, { hardReload: true });
  }
  return {
    ok: Boolean(serverReady && neteaseReady),
    ...(await desktopServiceStatus())
  };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "Claudio AI Radio Desktop",
    backgroundColor: "#050706",
    autoHideMenuBar: true,
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  appendDesktopLog("window", "createMainWindow", `url=${describeWindowUrl(mainWindow)}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-start-loading", () => {
    appendDesktopLog("window", "did-start-loading", `url=${describeWindowUrl(mainWindow)} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
  });
  mainWindow.webContents.on("dom-ready", () => {
    appendDesktopLog("window", "dom-ready", `url=${describeWindowUrl(mainWindow)} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
  });
  mainWindow.webContents.on("did-stop-loading", () => {
    appendDesktopLog("window", "did-stop-loading", `url=${describeWindowUrl(mainWindow)} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
  });
  mainWindow.webContents.on("did-navigate", (_event, url) => {
    appendDesktopLog("window", "did-navigate", `url=${url} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
  });
  mainWindow.on("ready-to-show", () => {
    appendDesktopLog("window", "ready-to-show", `url=${describeWindowUrl(mainWindow)} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    const currentUrl = String(mainWindow?.webContents?.getURL?.() || "");
    if (currentUrl.startsWith(APP_URL)) playerPageLoadedOnce = true;
    playerLoadRetryCount = 0;
    clearPlayerLoadRetryTimer();
    clearBootScreenFallbackTimer();
    appendDesktopLog("window", "did-finish-load", `url=${currentUrl} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
    updateThumbarButtons(true).catch(() => {});
  });
  mainWindow.webContents.on("did-fail-load", async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    const isPlayerUrl = String(validatedURL || "").startsWith(APP_URL);
    const healthy = isPlayerUrl ? await isAppServerHealthy(1200) : false;
    appendDesktopLog("window", "did-fail-load", `code=${errorCode} desc=${errorDescription} url=${validatedURL} healthy=${healthy ? 1 : 0} loadedOnce=${playerPageLoadedOnce ? 1 : 0} current=${describeWindowUrl(mainWindow)}`);
    if (!isPlayerUrl) return;
    if (healthy && playerPageLoadedOnce) {
      appendDesktopLog("window", "ignore did-fail-load", `healthy=true loadedOnce=true code=${errorCode}`);
      return;
    }
    if (!playerPageLoadedOnce) {
      loadBootScreen(mainWindow, "\u64ad\u653e\u5668\u670d\u52a1\u6b63\u5728\u91cd\u8fde\uff0c\u8bf7\u7a0d\u540e...").catch(() => {});
    } else {
      scheduleBootScreenFallback(`did-fail-load:${errorCode}`);
    }
    scheduleServerRestart(`did-fail-load:${errorCode}`);
    schedulePlayerReload(`did-fail-load:${errorCode}`);
  });
  mainWindow.on("focus", () => {
    updateThumbarButtons(true).catch(() => {});
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    stopThumbarSync();
    lastThumbarSignature = "";
    clearPlayerLoadRetryTimer();
    clearBootScreenFallbackTimer();
  });
  loadBootScreen(mainWindow).catch(() => {});
  updateThumbarButtons(true).catch(() => {});
  startThumbarSync();
}

function createLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }
  loginWindow = new BrowserWindow({
    width: 440,
    height: 620,
    resizable: false,
    title: "NetEase Login",
    backgroundColor: "#101312",
    autoHideMenuBar: true,
    icon: appIconPath(),
    parent: mainWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  loginWindow.loadFile(path.join(__dirname, "login.html"));
  loginWindow.on("closed", () => {
    loginWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 580,
    height: 720,
    resizable: true,
    title: "Settings",
    backgroundColor: "#101312",
    autoHideMenuBar: true,
    icon: appIconPath(),
    parent: mainWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Claudio",
      submenu: [
        { label: "NetEase Login", click: createLoginWindow },
        { label: "Settings", click: createSettingsWindow },
        { type: "separator" },
        { label: "Reload Player", click: () => loadPlayerWindow(mainWindow).catch(() => {}) },
        { label: "Quit", role: "quit" }
      ]
    }
  ]));
}

function copyFileIfExists(fromDir, toDir, file) {
  const source = path.join(fromDir, file);
  const target = path.join(toDir, file);
  if (!fs.existsSync(source)) return false;
  fs.copyFileSync(source, target);
  return true;
}

function importLegacyData({ includeSecrets = false } = {}) {
  ensureDesktopDataDir();
  const copied = [];
  for (const file of ["playlists.json", "playback-state.json", "memory.json", "taste.json", "mood-rules.md", "routines.md"]) {
    if (copyFileIfExists(sourceDataDir(), desktopDataDir(), file)) copied.push(file);
  }
  let importedSecrets = false;
  if (includeSecrets) {
    const legacy = readLegacySecrets();
    if (!legacy.neteaseLibraryPlaylistId) legacy.neteaseLibraryPlaylistId = "2529027467";
    if (!legacy.deepseekModel) legacy.deepseekModel = "deepseek-chat";
    if (Object.keys(legacy).length) {
      writeConfig({ ...legacy, importedFromLegacy: new Date().toISOString() });
      importedSecrets = true;
    }
  }
  return { copied, importedSecrets, dataDir: desktopDataDir() };
}

async function neteaseFetch(apiPath) {
  await startNeteaseApiIfNeeded();
  const base = (readConfig().neteaseApiBase || DEFAULT_CONFIG.neteaseApiBase).replace(/\/$/, "");
  const glue = apiPath.includes("?") ? "&" : "?";
  const url = `${base}${apiPath}${glue}timestamp=${Date.now()}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`NetEase API HTTP ${response.status}`);
    return response.json();
  } catch {
    throw new Error(`Cannot connect to NetEase API at ${base}. Start api-enhanced or set its project path.`);
  }
}

ipcMain.handle("config:get", () => {
  const config = readConfig();
  return {
    ...config,
    desktopDataDir: desktopDataDir(),
    sourceDataDir: sourceDataDir(),
    hasNeteaseCookie: Boolean(config.neteaseCookie),
    hasDeepSeekKey: Boolean(config.deepseekApiKey),
    neteaseCookie: config.neteaseCookie ? "saved" : ""
  };
});

ipcMain.handle("config:save", async (_event, input) => {
  const current = readConfig();
  const config = writeConfig({
    neteaseApiBase: String(input.neteaseApiBase || DEFAULT_CONFIG.neteaseApiBase).trim(),
    neteaseApiProjectPath: String(input.neteaseApiProjectPath || DEFAULT_CONFIG.neteaseApiProjectPath).trim(),
    neteaseLibraryPlaylistId: String(input.neteaseLibraryPlaylistId || "").trim(),
    neteaseImportedPlaylistIds: String(input.neteaseImportedPlaylistIds || "").trim(),
    neteaseFavoritePlaylistIds: String(input.neteaseFavoritePlaylistIds || "").trim(),
    neteasePlaylistNames: String(input.neteasePlaylistNames || "").trim(),
    legacyProjectPath: String(input.legacyProjectPath || "").trim(),
    deepseekApiKey: String(input.deepseekApiKey || "").trim() || current.deepseekApiKey,
    deepseekBaseUrl: String(input.deepseekBaseUrl || DEFAULT_CONFIG.deepseekBaseUrl).trim(),
    deepseekModel: String(input.deepseekModel || DEFAULT_CONFIG.deepseekModel).trim(),
    ...(String(input.clearDeepSeek || "") === "true" ? { deepseekApiKey: "" } : {})
  });
  stopServer();
  await startServer();
  await waitForServer();
  if (mainWindow) await loadPlayerWindow(mainWindow);
  return { ok: true, config: { ...config, neteaseCookie: config.neteaseCookie ? "saved" : "" } };
});

ipcMain.handle("legacy:import", async (_event, input = {}) => {
  const result = importLegacyData({ includeSecrets: Boolean(input.includeSecrets) });
  stopServer();
  await startServer();
  await waitForServer();
  if (mainWindow) await loadPlayerWindow(mainWindow, { hardReload: true });
  return { ok: true, ...result };
});

ipcMain.handle("desktop:reset-data", async (_event, input = {}) => {
  const result = resetDesktopData({ clearConfig: Boolean(input.clearConfig) });
  stopServer();
  await startServer();
  await waitForServer();
  if (mainWindow) await loadPlayerWindow(mainWindow, { hardReload: true });
  return { ok: true, ...result };
});

ipcMain.handle("desktop:service-status", async () => desktopServiceStatus());

ipcMain.handle("desktop:client-log", async (_event, payload = {}) => {
  const scope = String(payload.scope || "renderer").trim() || "renderer";
  const message = String(payload.message || "client-log").trim() || "client-log";
  const extra = payload.extra == null ? "" : String(payload.extra);
  appendDesktopLog(`renderer:${scope}`, message, extra);
  return { ok: true };
});

ipcMain.handle("desktop:reconnect-services", async () => reconnectDesktopServices());

ipcMain.handle("netease:qr-create", async () => {
  const keyData = await neteaseFetch("/login/qr/key");
  const key = keyData.data?.unikey || keyData.unikey;
  if (!key) throw new Error("Missing NetEase QR key.");
  const qrData = await neteaseFetch(`/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true`);
  return { key, qrimg: qrData.data?.qrimg || qrData.qrimg || "" };
});

ipcMain.handle("netease:qr-check", async (_event, key) => {
  const data = await neteaseFetch(`/login/qr/check?key=${encodeURIComponent(key)}`);
  if (data.cookie) {
    writeConfig({ neteaseCookie: data.cookie });
    stopServer();
    await startServer();
    await waitForServer();
    if (mainWindow) await loadPlayerWindow(mainWindow, { hardReload: true });
  }
  return data;
});

app.whenReady().then(async () => {
  const bootStartedAt = Date.now();
  appendDesktopLog("boot", "app.whenReady", `bootStartedAt=${bootStartedAt}`);
  installMenu();
  ensureDesktopDataDir();
  createMainWindow();
  await updateBootScreenProgress(mainWindow, 12, "\u6b63\u5728\u542f\u52a8\u672c\u5730\u670d\u52a1...");
  await startServer();
  await updateBootScreenProgress(mainWindow, 28, "\u6b63\u5728\u8fde\u63a5\u64ad\u653e\u5668\u670d\u52a1...");
  const [ready, neteaseReady] = await Promise.all([
    waitForServer(),
    startNeteaseApiIfNeeded().catch(() => false)
  ]);
  await updateBootScreenProgress(mainWindow, 52, "\u6b63\u5728\u68c0\u67e5\u9996\u9875\u6570\u636e...");
  const launchState = ready ? await waitForDesktopLaunchState() : { ready: false, reason: "server-not-ready", payload: null };
  await waitForBootFloor(bootStartedAt);
  if (ready && mainWindow && !mainWindow.isDestroyed()) {
    await new Promise((resolve) => setTimeout(resolve, DESKTOP_BOOT_SETTLE_MS));
    appendDesktopLog("boot", launchState.ready ? "launch gate ready" : "launch gate timeout", `reason=${launchState.reason}`);
    await updateBootScreenProgress(mainWindow, 88, launchState.ready ? "\u6b63\u5728\u6253\u5f00\u64ad\u653e\u5668\u754c\u9762..." : "\u6b63\u5728\u8fdb\u5165\u64ad\u653e\u5668\u754c\u9762...");
    await loadPlayerWindow(mainWindow);
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    await loadBootScreen(mainWindow, "\u64ad\u653e\u5668\u542f\u52a8\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5");
  }
  appendDesktopLog("boot", "startup complete", `serverReady=${Boolean(ready)} neteaseReady=${Boolean(neteaseReady)} launchReady=${launchState.ready ? 1 : 0} launchReason=${launchState.reason} url=${describeWindowUrl(mainWindow)} loadedOnce=${playerPageLoadedOnce ? 1 : 0}`);
});

app.on("before-quit", (event) => {
  if (appQuitting) return;
  appQuitting = true;
  event.preventDefault();
  (async () => {
    stopThumbarSync();
    await shutdownDesktopLyricsOverlay();
    stopServer();
    if (neteaseApiProcess && !neteaseApiProcess.killed) neteaseApiProcess.kill();
    app.exit(0);
  })().catch(() => {
    stopServer();
    if (neteaseApiProcess && !neteaseApiProcess.killed) neteaseApiProcess.kill();
    app.exit(0);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});


