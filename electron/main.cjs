const { app, BrowserWindow, Menu, ipcMain, shell, dialog, nativeImage } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const APP_PORT = Number(process.env.PORT || 3000);
const APP_URL = `http://localhost:${APP_PORT}`;
const DEFAULT_CONFIG = {
  neteaseApiBase: "http://localhost:4000",
  neteaseApiProjectPath: "C:\\Users\\zwy0824\\Documents\\Codex\\api-enhanced",
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

function notifyNeteaseApiIssue(reason) {
  appendDesktopLog("netease-api", reason, `projectPath=${readConfig().neteaseApiProjectPath || DEFAULT_CONFIG.neteaseApiProjectPath}`);
  if (neteaseApiIssueShown) return;
  neteaseApiIssueShown = true;
  const detail = `网易云服务没有成功启动。\n\n原因：${reason}\n\n日志位置：${desktopLogPath()}\n项目目录：${readConfig().neteaseApiProjectPath || DEFAULT_CONFIG.neteaseApiProjectPath}`;
  if (app.isReady()) {
    dialog.showMessageBox({
      type: "warning",
      title: "Claudio AI Radio Desktop",
      message: "网易云服务启动失败",
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

function startServer() {
  if (serverProcess && !serverProcess.killed) return;
  ensureDesktopDataDir();
  const root = projectRoot();
  serverProcess = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: serverEnv(),
    stdio: "ignore",
    windowsHide: true
  });
  serverProcess.on("exit", () => {
    serverProcess = null;
  });
}

async function loadPlayerWindow(window) {
  if (!window || window.isDestroyed()) return;
  const targetUrl = `${APP_URL}/?desktop=1&t=${Date.now()}`;
  try {
    const ses = window.webContents.session;
    await ses.clearCache();
    await ses.clearStorageData({
      storages: ["serviceworkers", "cachestorage", "indexdb", "localstorage"]
    });
  } catch {}
  await window.loadURL(targetUrl);
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
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
      tooltip: "上一首",
      icon: THUMBAR_ICONS.previous,
      flags: available ? ["dismissonclick"] : ["disabled"],
      click: () => invokeThumbarAction("previous")
    },
    {
      tooltip: playing ? "暂停" : "播放",
      icon: playing ? THUMBAR_ICONS.pause : THUMBAR_ICONS.play,
      flags: available ? ["dismissonclick"] : ["disabled"],
      click: () => invokeThumbarAction("toggle")
    },
    {
      tooltip: "下一首",
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
  const apiDir = readConfig().neteaseApiProjectPath || DEFAULT_CONFIG.neteaseApiProjectPath;
  if (!fs.existsSync(path.join(apiDir, "package.json"))) {
    notifyNeteaseApiIssue(`找不到 api-enhanced 项目: ${apiDir}`);
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
    if (!ready) notifyNeteaseApiIssue("等待 4000 端口超时，服务未就绪");
    else appendDesktopLog("netease-api", "ready on port 4000");
    return ready;
  }).catch((error) => {
    notifyNeteaseApiIssue(error?.message || "未知错误");
    return false;
  }).finally(() => {
    neteaseApiStartupPromise = null;
  });
  return neteaseApiStartupPromise;
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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-finish-load", () => {
    updateThumbarButtons(true).catch(() => {});
  });
  mainWindow.on("focus", () => {
    updateThumbarButtons(true).catch(() => {});
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    stopThumbarSync();
    lastThumbarSignature = "";
  });
  loadPlayerWindow(mainWindow).catch(() => {});
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
  startServer();
  await waitForServer();
  if (mainWindow) await loadPlayerWindow(mainWindow);
  return { ok: true, config: { ...config, neteaseCookie: config.neteaseCookie ? "saved" : "" } };
});

ipcMain.handle("legacy:import", async (_event, input = {}) => {
  const result = importLegacyData({ includeSecrets: Boolean(input.includeSecrets) });
  stopServer();
  startServer();
  await waitForServer();
  if (mainWindow) await loadPlayerWindow(mainWindow);
  return { ok: true, ...result };
});

ipcMain.handle("desktop:reset-data", async (_event, input = {}) => {
  const result = resetDesktopData({ clearConfig: Boolean(input.clearConfig) });
  stopServer();
  startServer();
  await waitForServer();
  if (mainWindow) await loadPlayerWindow(mainWindow);
  return { ok: true, ...result };
});

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
    startServer();
    await waitForServer();
    if (mainWindow) await loadPlayerWindow(mainWindow);
  }
  return data;
});

app.whenReady().then(async () => {
  installMenu();
  ensureDesktopDataDir();
  startServer();
  await startNeteaseApiIfNeeded().catch(() => false);
  const ready = await waitForServer();
  createMainWindow();
  if (!ready || !readConfig().neteaseCookie) createSettingsWindow();
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
