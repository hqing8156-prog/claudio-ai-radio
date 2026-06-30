const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("claudioDesktop", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  importLegacyData: (options) => ipcRenderer.invoke("legacy:import", options),
  resetDesktopData: (options) => ipcRenderer.invoke("desktop:reset-data", options),
  createNeteaseQr: () => ipcRenderer.invoke("netease:qr-create"),
  checkNeteaseQr: (key) => ipcRenderer.invoke("netease:qr-check", key),
  getServiceStatus: () => ipcRenderer.invoke("desktop:service-status"),
  reconnectServices: () => ipcRenderer.invoke("desktop:reconnect-services"),
  windowAction: (action) => ipcRenderer.invoke("desktop:window-action", action),
  getWindowState: () => ipcRenderer.invoke("desktop:window-state"),
  setStartupProgress: (progress, detail) => ipcRenderer.invoke("desktop:startup-progress", { progress, detail }),
  notifyShellReady: () => ipcRenderer.invoke("desktop:shell-ready"),
  logClient: (scope, message, extra) => ipcRenderer.invoke("desktop:client-log", { scope, message, extra })
});
