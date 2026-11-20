// Seed Town for Windows. A launcher (graphics, display, diagnostics, updates) and the game window, which runs the
// same Seed Town as the website, signed in with the same Myseed account, but on the PC's dedicated graphics card
// (high-performance GPU, GPU rasterisation, no GPU blocklist), with higher graphics levels than a browser tab gets
// (render scale up to 2x, 4096 shadows, longer view distance, optional uncapped frame rate) and real fullscreen.
// Crashes are reported to Myseed's error log; updates download in the background and install on restart.

const { app, BrowserWindow, ipcMain, screen, shell, session } = require("electron");
const path = require("node:path");
const os = require("node:os");
const settings = require("./settings");

let cfg = null;
let launcher = null;
let game = null;

// GPU: always the discrete card, never the blocklist; these must be set before the app is ready.
app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

function report(kind, detail) {
  if (!cfg || !cfg.crashReports) return;
  const body = JSON.stringify({ message: `Seed Town desktop ${app.getVersion()}: ${kind}`, stack: String(detail ?? "").slice(0, 4000), path: "/desktop" });
  fetch(`${cfg.server}/api/errors`, { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
}
process.on("uncaughtException", (e) => report("main process error", e && e.stack));

function openLauncher() {
  launcher = new BrowserWindow({ width: 980, height: 640, resizable: false, title: "Seed Town", backgroundColor: "#0b1020", icon: path.join(__dirname, "build/icon.png"), webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false } });
  launcher.setMenuBarVisibility(false);
  launcher.loadFile(path.join(__dirname, "launcher.html"));
  launcher.on("closed", () => (launcher = null));
}

function openGame() {
  const d = cfg.display;
  const full = d.mode === "fullscreen";
  const borderless = d.mode === "borderless";
  const area = screen.getPrimaryDisplay().workAreaSize;
  game = new BrowserWindow({
    width: borderless ? area.width : d.width,
    height: borderless ? area.height : d.height,
    fullscreen: full,
    frame: !borderless,
    title: "Seed Town",
    backgroundColor: "#000000",
    icon: path.join(__dirname, "build/icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false, backgroundThrottling: false, partition: "persist:seedtown" },
  });
  game.setMenuBarVisibility(false);
  game.loadURL(`${cfg.server}/fun?world=1&desktop=1`);
  // Links that leave Seed Town open in the person's browser.
  game.webContents.setWindowOpenHandler(({ url }) => (shell.openExternal(url), { action: "deny" }));
  game.webContents.on("render-process-gone", (_e, d2) => report("the game crashed", JSON.stringify(d2)));
  game.webContents.on("unresponsive", () => report("the game stopped responding", ""));
  game.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "F11") game.setFullScreen(!game.isFullScreen());
  });
  game.on("closed", () => {
    game = null;
    if (!launcher) openLauncher();
  });
  if (launcher) launcher.close();
}

app.on("child-process-gone", (_e, d) => d.reason !== "clean-exit" && report("a helper process ended", JSON.stringify(d)));

ipcMain.handle("settings:get", () => ({ settings: cfg, presets: settings.PRESETS }));
ipcMain.handle("settings:set", (_e, next) => {
  cfg = { ...cfg, ...next, graphics: { ...cfg.graphics, ...(next.graphics || {}) }, display: { ...cfg.display, ...(next.display || {}) } };
  settings.save(app, cfg);
  return cfg;
});
ipcMain.handle("game:play", () => openGame());
ipcMain.handle("game:quit", () => app.quit());
// Diagnostics: the graphics card and driver, the processor, memory, and what the GPU features are.
ipcMain.handle("diag:get", async () => {
  const gpu = await app.getGPUInfo("complete").catch(() => null);
  const devices = gpu && gpu.gpuDevice ? gpu.gpuDevice.map((g) => ({ vendor: g.vendorString || g.vendorId, device: g.deviceString || g.deviceId, active: g.active, driver: g.driverVersion })) : [];
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    gpu: devices,
    renderer: gpu && gpu.auxAttributes ? gpu.auxAttributes.glRenderer : null,
    features: app.getGPUFeatureStatus(),
    cpu: { model: os.cpus()[0] ? os.cpus()[0].model : "?", cores: os.cpus().length },
    memory: { total: Math.round(os.totalmem() / 1e9), free: Math.round(os.freemem() / 1e9) },
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
  };
});
// Live numbers for the in-game overlay: this app's CPU use and memory.
ipcMain.handle("perf:get", async () => {
  const metrics = app.getAppMetrics();
  const cpu = metrics.reduce((a, m) => a + (m.cpu ? m.cpu.percentCPUUsage : 0), 0);
  const mem = metrics.reduce((a, m) => a + (m.memory ? m.memory.workingSetSize : 0), 0);
  return { cpu: Math.round(cpu), memoryMb: Math.round(mem / 1024), gpu: metrics.filter((m) => m.type === "GPU").map((m) => Math.round(m.cpu ? m.cpu.percentCPUUsage : 0))[0] ?? null };
});

app.whenReady().then(() => {
  cfg = settings.load(app);
  if (cfg.uncapped) app.commandLine.appendSwitch("disable-frame-rate-limit");
  // Keep the session cookie (signed in once, like the browser), and send a desktop marker to the server.
  session.fromPartition("persist:seedtown").setUserAgent(`${session.defaultSession.getUserAgent()} SeedTownDesktop/${app.getVersion()}`);
  openLauncher();
  if (cfg.updates) {
    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on("update-available", (i) => launcher && launcher.webContents.send("update", `Downloading version ${i.version}...`));
      autoUpdater.on("update-downloaded", (i) => launcher && launcher.webContents.send("update", `Version ${i.version} is ready; it installs when you close Seed Town.`));
      autoUpdater.on("update-not-available", () => launcher && launcher.webContents.send("update", "You have the latest version."));
      autoUpdater.on("error", () => launcher && launcher.webContents.send("update", "Could not check for updates right now."));
      autoUpdater.checkForUpdates().catch(() => {});
    } catch {}
  }
});
app.on("window-all-closed", () => app.quit());
