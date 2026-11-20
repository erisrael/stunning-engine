// Seed Town desktop: settings kept on this PC (userData/settings.json), with presets by graphics card class.
const fs = require("node:fs");
const path = require("node:path");

const PRESETS = {
  low: { label: "Low (integrated graphics)", quality: "low", renderScale: 0.75, shadows: 0, view: 90, fps: 30 },
  medium: { label: "Medium (mainstream PCs)", quality: "medium", renderScale: 1, shadows: 1, view: 140, fps: 60 },
  high: { label: "High (gaming PCs)", quality: "high", renderScale: 1.25, shadows: 1, view: 200, fps: 0 },
  ultra: { label: "Ultra (high-end gaming PCs)", quality: "ultra", renderScale: 1.5, shadows: 2, view: 300, fps: 0 },
  custom: { label: "Custom", quality: "ultra", renderScale: 1.25, shadows: 2, view: 240, fps: 0 },
};

const DEFAULTS = {
  server: "https://ops.myseed.com.et",
  preset: "high",
  graphics: { ...PRESETS.high },
  display: { mode: "windowed", width: 1600, height: 900 },
  showFps: true,
  updates: true,
  crashReports: true,
  // Unlock the frame rate beyond the screen's refresh (for benchmarking); off by default (vsync).
  uncapped: false,
  // The guest arcade kiosk: start straight in it (a venue PC), and the staff PIN that lets someone leave it
  // (kept as a SHA-256 hash; empty: Ctrl+Shift+Q leaves without one).
  arcade: { autostart: false, pin: "" },
};

function file(app) {
  return path.join(app.getPath("userData"), "settings.json");
}
function load(app) {
  try {
    const saved = JSON.parse(fs.readFileSync(file(app), "utf8"));
    return { ...DEFAULTS, ...saved, graphics: { ...DEFAULTS.graphics, ...(saved.graphics || {}) }, display: { ...DEFAULTS.display, ...(saved.display || {}) }, arcade: { ...DEFAULTS.arcade, ...(saved.arcade || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}
function save(app, s) {
  fs.mkdirSync(path.dirname(file(app)), { recursive: true });
  fs.writeFileSync(file(app), JSON.stringify(s, null, 2));
}
module.exports = { PRESETS, DEFAULTS, load, save };
