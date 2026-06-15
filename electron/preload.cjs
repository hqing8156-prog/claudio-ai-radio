const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("claudioDesktop", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  importLegacyData: (options) => ipcRenderer.invoke("legacy:import", options),
  resetDesktopData: (options) => ipcRenderer.invoke("desktop:reset-data", options),
  createNeteaseQr: () => ipcRenderer.invoke("netease:qr-create"),
  checkNeteaseQr: (key) => ipcRenderer.invoke("netease:qr-check", key)
});
