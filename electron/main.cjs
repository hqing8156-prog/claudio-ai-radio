const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
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
  if (neteaseApiProcess && !neteaseApiProcess.killed) return false;
  const apiDir = readConfig().neteaseApiProjectPath || DEFAULT_CONFIG.neteaseApiProjectPath;
  if (!fs.existsSync(path.join(apiDir, "package.json"))) return false;
  neteaseApiProcess = spawn(process.execPath, [path.join(__dirname, "netease-api-runner.cjs"), apiDir], {
    cwd: projectRoot(),
    env: { ...process.env, PORT: "4000", ELECTRON_RUN_AS_NODE: "1" },
    stdio: "ignore",
    windowsHide: true
  });
  neteaseApiProcess.on("exit", () => {
    neteaseApiProcess = null;
  });
  return isNeteaseApiReady(12000);
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
  mainWindow.loadURL(`${APP_URL}/?desktop=1&t=${Date.now()}`);
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
        { label: "Reload Player", click: () => mainWindow?.loadURL(`${APP_URL}/?desktop=1&t=${Date.now()}`) },
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
  if (mainWindow) mainWindow.loadURL(`${APP_URL}/?desktop=1&t=${Date.now()}`);
  return { ok: true, config: { ...config, neteaseCookie: config.neteaseCookie ? "saved" : "" } };
});

ipcMain.handle("legacy:import", async (_event, input = {}) => {
  const result = importLegacyData({ includeSecrets: Boolean(input.includeSecrets) });
  stopServer();
  startServer();
  await waitForServer();
  if (mainWindow) mainWindow.loadURL(`${APP_URL}/?desktop=1&t=${Date.now()}`);
  return { ok: true, ...result };
});

ipcMain.handle("desktop:reset-data", async (_event, input = {}) => {
  const result = resetDesktopData({ clearConfig: Boolean(input.clearConfig) });
  stopServer();
  startServer();
  await waitForServer();
  if (mainWindow) mainWindow.loadURL(`${APP_URL}/?desktop=1&t=${Date.now()}`);
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
    if (mainWindow) mainWindow.loadURL(`${APP_URL}/?desktop=1&t=${Date.now()}`);
  }
  return data;
});

app.whenReady().then(async () => {
  installMenu();
  ensureDesktopDataDir();
  startServer();
  startNeteaseApiIfNeeded().catch(() => {});
  const ready = await waitForServer();
  createMainWindow();
  if (!ready || !readConfig().neteaseCookie) createSettingsWindow();
});

app.on("before-quit", () => {
  stopServer();
  if (neteaseApiProcess && !neteaseApiProcess.killed) neteaseApiProcess.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
