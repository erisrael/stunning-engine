// What the launcher and the game page may ask the app (nothing else of the PC is exposed).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("seedDesktop", {
  desktop: true,
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (s) => ipcRenderer.invoke("settings:set", s),
  play: () => ipcRenderer.invoke("game:play"),
  arcade: () => ipcRenderer.invoke("game:arcade"),
  leaveKiosk: (pin) => ipcRenderer.invoke("kiosk:leave", pin),
  cancelLeave: () => ipcRenderer.invoke("kiosk:cancel"),
  askLeave: () => ipcRenderer.invoke("kiosk:ask"),
  setKioskPin: (pin) => ipcRenderer.invoke("kiosk:setPin", pin),
  quit: () => ipcRenderer.invoke("game:quit"),
  diagnostics: () => ipcRenderer.invoke("diag:get"),
  perf: () => ipcRenderer.invoke("perf:get"),
  onUpdate: (f) => ipcRenderer.on("update", (_e, text) => f(text)),
});
