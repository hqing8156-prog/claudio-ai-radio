const form = document.querySelector("#settingsForm");
const statusText = document.querySelector("#status");
const dataPath = document.querySelector("#dataPath");
const includeSecrets = document.querySelector("#includeSecrets");
const importLegacyBtn = document.querySelector("#importLegacyBtn");
const resetDataBtn = document.querySelector("#resetDataBtn");
const legacyProjectPath = document.querySelector("#legacyProjectPath");
const neteaseApiBase = document.querySelector("#neteaseApiBase");
const neteaseApiProjectPath = document.querySelector("#neteaseApiProjectPath");
const neteaseLibraryPlaylistId = document.querySelector("#neteaseLibraryPlaylistId");
const neteaseImportedPlaylistIds = document.querySelector("#neteaseImportedPlaylistIds");
const neteaseFavoritePlaylistIds = document.querySelector("#neteaseFavoritePlaylistIds");
const neteasePlaylistNames = document.querySelector("#neteasePlaylistNames");
const deepseekApiKey = document.querySelector("#deepseekApiKey");
const deepseekBaseUrl = document.querySelector("#deepseekBaseUrl");
const deepseekModel = document.querySelector("#deepseekModel");
const clearDeepSeek = document.querySelector("#clearDeepSeek");

function setStatus(text) {
  statusText.textContent = text;
}

async function loadConfig() {
  const config = await window.claudioDesktop.getConfig();
  legacyProjectPath.value = config.legacyProjectPath || "";
  neteaseApiBase.value = config.neteaseApiBase || "http://localhost:4000";
  neteaseApiProjectPath.value = config.neteaseApiProjectPath || "";
  neteaseLibraryPlaylistId.value = config.neteaseLibraryPlaylistId || "";
  neteaseImportedPlaylistIds.value = config.neteaseImportedPlaylistIds || "";
  neteaseFavoritePlaylistIds.value = config.neteaseFavoritePlaylistIds || "";
  neteasePlaylistNames.value = config.neteasePlaylistNames || "";
  deepseekBaseUrl.value = config.deepseekBaseUrl || "https://api.deepseek.com";
  deepseekModel.value = config.deepseekModel || "deepseek-chat";
  dataPath.textContent = `Desktop data: ${config.desktopDataDir}. Source: ${config.sourceDataDir}.`;
  setStatus(`NetEase: ${config.hasNeteaseCookie ? "logged in" : "not logged in"}, DeepSeek: ${config.hasDeepSeekKey ? "configured" : "not configured"}.`);
}

importLegacyBtn.addEventListener("click", async () => {
  setStatus("Importing old data.");
  try {
    await window.claudioDesktop.saveConfig({
      legacyProjectPath: legacyProjectPath.value,
      neteaseApiBase: neteaseApiBase.value,
      neteaseApiProjectPath: neteaseApiProjectPath.value,
      neteaseLibraryPlaylistId: neteaseLibraryPlaylistId.value,
      neteaseImportedPlaylistIds: neteaseImportedPlaylistIds.value,
      neteaseFavoritePlaylistIds: neteaseFavoritePlaylistIds.value,
      neteasePlaylistNames: neteasePlaylistNames.value,
      deepseekBaseUrl: deepseekBaseUrl.value,
      deepseekModel: deepseekModel.value
    });
    const result = await window.claudioDesktop.importLegacyData({
      includeSecrets: includeSecrets.checked
    });
    setStatus(`Imported ${result.copied.length} data files${result.importedSecrets ? " and secrets" : ""}.`);
    await loadConfig();
  } catch (error) {
    setStatus(error.message || "Import failed.");
  }
});

resetDataBtn.addEventListener("click", async () => {
  setStatus("Resetting desktop data.");
  try {
    await window.claudioDesktop.resetDesktopData({ clearConfig: false });
    setStatus("Desktop data reset. Settings were kept.");
    await loadConfig();
  } catch (error) {
    setStatus(error.message || "Reset failed.");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving and restarting service.");
  try {
    await window.claudioDesktop.saveConfig({
      legacyProjectPath: legacyProjectPath.value,
      neteaseApiBase: neteaseApiBase.value,
      neteaseApiProjectPath: neteaseApiProjectPath.value,
      neteaseLibraryPlaylistId: neteaseLibraryPlaylistId.value,
      neteaseImportedPlaylistIds: neteaseImportedPlaylistIds.value,
      neteaseFavoritePlaylistIds: neteaseFavoritePlaylistIds.value,
      neteasePlaylistNames: neteasePlaylistNames.value,
      deepseekApiKey: deepseekApiKey.value,
      deepseekBaseUrl: deepseekBaseUrl.value,
      deepseekModel: deepseekModel.value,
      clearDeepSeek: clearDeepSeek.checked ? "true" : "false"
    });
    deepseekApiKey.value = "";
    clearDeepSeek.checked = false;
    setStatus("Saved. Player service restarted.");
  } catch (error) {
    setStatus(error.message || "Save failed.");
  }
});

loadConfig().catch((error) => setStatus(error.message || "Failed to load settings."));
