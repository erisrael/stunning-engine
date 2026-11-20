// Seed Town for Windows. A launcher (graphics, display, diagnostics, updates) and the game window, which runs the
// same Seed Town as the website, signed in with the same Myseed account, but on the PC's dedicated graphics card
// (high-performance GPU, GPU rasterisation, no GPU blocklist), with higher graphics levels than a browser tab gets
// (render scale up to 2x, 4096 shadows, longer view distance, optional uncapped frame rate) and real fullscreen.
// Crashes are reported to Myseed's error log; updates download in the background and install on restart.
//
// Arcade kiosk (guests): the guest arcade (/arcade) on the whole screen in a locked window: it cannot navigate
// anywhere else, open windows or developer tools, reload, or be closed; Ctrl+Shift+Q asks for the staff PIN (set
// in the launcher) and goes back to the launcher. The Windows key and Alt+Tab belong to Windows: on a venue PC,
// run Seed Town under Windows' Assigned Access (kiosk) for a full lock.

const { app, BrowserWindow, ipcMain, screen, shell, session } = require("electron");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const settings = require("./settings");

let cfg = null;
let launcher = null;
let game = null;
let kiosk = false;
let leaving = false;
// Tests only: the kiosk's locks in an ordinary window (so a test does not take over the screen).
const WINDOWED_KIOSK = process.env.SEEDTOWN_KIOSK_WINDOWED === "1";
let pinWin = null;
const hash = (pin) => crypto.createHash("sha256").update(`seedtown:${pin}`).digest("hex");

// Tests only: their own settings folder, so a test never changes this PC's real settings.
if (process.env.SEEDTOWN_USER_DATA) app.setPath("userData", process.env.SEEDTOWN_USER_DATA);

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

function openGame(mode = "town") {
  const d = cfg.display;
  kiosk = mode === "arcade";
  const full = (kiosk && !WINDOWED_KIOSK) || d.mode === "fullscreen";
  const borderless = !kiosk && d.mode === "borderless";
  const area = screen.getPrimaryDisplay().workAreaSize;
  game = new BrowserWindow({
    width: borderless ? area.width : d.width,
    height: borderless ? area.height : d.height,
    fullscreen: full,
    kiosk: kiosk && !WINDOWED_KIOSK,
    frame: !borderless && !kiosk,
    title: kiosk ? "Myseed Arcade" : "Seed Town",
    backgroundColor: "#000000",
    icon: path.join(__dirname, "build/icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false, backgroundThrottling: false, devTools: !kiosk, partition: kiosk ? "persist:arcade" : "persist:seedtown" },
  });
  game.setMenuBarVisibility(false);
  const home = new URL(cfg.server);
  game.loadURL(kiosk ? `${cfg.server}/arcade?app=desktop` : `${cfg.server}/fun?world=1&desktop=1`);
  if (kiosk) {
    // Only the arcade: no other page of the site, no other site, no new windows, no closing.
    const keep = (e, url) => {
      try {
        const u = new URL(url);
        if (u.origin === home.origin && u.pathname.startsWith("/arcade")) return;
      } catch {}
      e.preventDefault();
    };
    game.webContents.on("will-navigate", keep);
    game.webContents.on("will-redirect", keep);
    game.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    game.on("close", (e) => {
      if (!leaving) e.preventDefault();
    });
  } else {
    // Links that leave Seed Town open in the person's browser.
    game.webContents.setWindowOpenHandler(({ url }) => (shell.openExternal(url), { action: "deny" }));
  }
  game.webContents.on("render-process-gone", (_e, d2) => {
    report("the game crashed", JSON.stringify(d2));
    // The arcade comes back by itself.
    if (kiosk && game) game.loadURL(`${cfg.server}/arcade?app=desktop`);
  });
  game.webContents.on("unresponsive", () => report("the game stopped responding", ""));
  game.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    const k = String(input.key).toLowerCase();
    if (kiosk) {
      if ((input.control || input.meta) && input.shift && k === "q") return e.preventDefault(), askPin();
      // Reload, close, developer tools, full screen, zoom, print, save, find: not in the arcade.
      if (k === "f5" || k === "f11" || k === "f12" || (input.alt && k === "f4") || ((input.control || input.meta) && ["r", "w", "q", "p", "s", "o", "n", "t", "i", "j", "u", "+", "-", "=", "0"].includes(k)) || ((input.control || input.meta) && input.shift)) e.preventDefault();
      return;
    }
    if (k === "f11") game.setFullScreen(!game.isFullScreen());
  });
  game.on("closed", () => {
    game = null;
    kiosk = false;
    leaving = false;
    if (!launcher) openLauncher();
  });
  if (launcher) launcher.close();
}

// Leaving the arcade kiosk: the staff PIN (when one is set), then back to the launcher.
function askPin() {
  if (!cfg.arcade.pin) return leaveKiosk();
  if (pinWin) return pinWin.focus();
  pinWin = new BrowserWindow({ parent: game, modal: true, width: 380, height: 230, frame: false, resizable: false, alwaysOnTop: true, backgroundColor: "#0b1020", webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false } });
  pinWin.setAlwaysOnTop(true, "screen-saver");
  pinWin.loadFile(path.join(__dirname, "pin.html"));
  pinWin.on("closed", () => (pinWin = null));
}
function leaveKiosk() {
  if (pinWin) pinWin.close();
  leaving = true;
  if (game) game.close();
}

app.on("child-process-gone", (_e, d) => d.reason !== "clean-exit" && report("a helper process ended", JSON.stringify(d)));

// The PIN's hash never goes to a page: only whether one is set.
ipcMain.handle("settings:get", () => ({ settings: { ...cfg, arcade: { ...cfg.arcade, pin: cfg.arcade.pin ? "set" : "" } }, presets: settings.PRESETS }));
ipcMain.handle("settings:set", (_e, next) => {
  const arcade = { ...cfg.arcade, ...(next.arcade || {}), pin: cfg.arcade.pin };
  cfg = { ...cfg, ...next, graphics: { ...cfg.graphics, ...(next.graphics || {}) }, display: { ...cfg.display, ...(next.display || {}) }, arcade };
  settings.save(app, cfg);
  return { ...cfg, arcade: { ...cfg.arcade, pin: cfg.arcade.pin ? "set" : "" } };
});
ipcMain.handle("game:play", () => openGame());
ipcMain.handle("game:arcade", () => openGame("arcade"));
ipcMain.handle("kiosk:leave", (_e, pin) => {
  if (cfg.arcade.pin && hash(String(pin || "")) !== cfg.arcade.pin) return false;
  leaveKiosk();
  return true;
});
ipcMain.handle("kiosk:cancel", () => pinWin && pinWin.close());
// The arcade page also asks (Ctrl+Shift+Q seen by the page), in case the window's own key hook did not see it.
ipcMain.handle("kiosk:ask", () => kiosk && askPin());
ipcMain.handle("kiosk:setPin", (_e, pin) => {
  const p = String(pin || "").trim();
  cfg = { ...cfg, arcade: { ...cfg.arcade, pin: p ? hash(p) : "" } };
  settings.save(app, cfg);
  return !!p;
});
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
  session.fromPartition("persist:arcade").setUserAgent(`${session.defaultSession.getUserAgent()} SeedTownDesktop/${app.getVersion()} Arcade`);
  // A venue PC starts straight in the arcade kiosk.
  if (cfg.arcade.autostart) openGame("arcade");
  else openLauncher();
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
