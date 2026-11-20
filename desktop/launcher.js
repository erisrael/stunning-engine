// The launcher: presets, graphics, display, diagnostics and account settings, saved on every change.
const D = window.seedDesktop;
let state = null;
let presets = {};
const $ = (id) => document.getElementById(id);
const RES = [[1280, 720], [1600, 900], [1920, 1080], [2560, 1440], [3840, 2160]];

function tab(name) {
  document.querySelectorAll("[data-tab]").forEach((el) => el.classList.toggle("on", el.dataset.tab === name));
  if (name === "diag") diagnostics();
}
document.querySelectorAll("nav button[data-tab]").forEach((b) => b.addEventListener("click", () => tab(b.dataset.tab)));

async function save(patch) {
  state = await D.setSettings(patch);
  render();
}

function render() {
  const g = state.graphics;
  $("presets").innerHTML = "";
  for (const [k, p] of Object.entries(presets)) {
    const c = document.createElement("div");
    c.className = "card" + (state.preset === k ? " on" : "");
    c.innerHTML = `<b>${p.label}</b><small>render ${p.renderScale}x · shadows ${["off", "on", "high"][p.shadows]} · ${p.view} m · ${p.fps ? p.fps + " fps" : "vsync"}</small>`;
    c.addEventListener("click", () => save({ preset: k, graphics: { ...p } }));
    $("presets").appendChild(c);
  }
  $("quality").value = g.quality;
  $("renderScale").value = g.renderScale;
  $("renderScaleV").textContent = `${Number(g.renderScale).toFixed(2)}x`;
  $("shadows").value = String(g.shadows);
  $("view").value = g.view;
  $("viewV").textContent = g.view;
  $("fps").value = String(g.fps);
  $("uncapped").checked = !!state.uncapped;
  $("showFps").checked = !!state.showFps;
  $("mode").value = state.display.mode;
  $("res").innerHTML = RES.map(([w, h]) => `<option value="${w}x${h}" ${state.display.width === w && state.display.height === h ? "selected" : ""}>${w} x ${h}</option>`).join("");
  $("server").value = state.server;
  $("updates").checked = !!state.updates;
  $("crashReports").checked = !!state.crashReports;
}

const custom = (patch) => save({ preset: "custom", graphics: patch });
$("quality").addEventListener("change", (e) => custom({ quality: e.target.value }));
$("renderScale").addEventListener("input", (e) => custom({ renderScale: Number(e.target.value) }));
$("shadows").addEventListener("change", (e) => custom({ shadows: Number(e.target.value) }));
$("view").addEventListener("input", (e) => custom({ view: Number(e.target.value) }));
$("fps").addEventListener("change", (e) => custom({ fps: Number(e.target.value) }));
$("uncapped").addEventListener("change", (e) => save({ uncapped: e.target.checked }));
$("showFps").addEventListener("change", (e) => save({ showFps: e.target.checked }));
$("mode").addEventListener("change", (e) => save({ display: { mode: e.target.value } }));
$("res").addEventListener("change", (e) => {
  const [w, h] = e.target.value.split("x").map(Number);
  save({ display: { width: w, height: h } });
});
$("server").addEventListener("change", (e) => /^https?:\/\//.test(e.target.value) && save({ server: e.target.value.replace(/\/+$/, "") }));
$("updates").addEventListener("change", (e) => save({ updates: e.target.checked }));
$("crashReports").addEventListener("change", (e) => save({ crashReports: e.target.checked }));
$("play").addEventListener("click", () => D.play());
$("quit").addEventListener("click", () => D.quit());
D.onUpdate((t) => ($("update").textContent = t));

async function diagnostics() {
  const d = await D.diagnostics();
  const rows = [
    ["Seed Town", `${d.version} (Electron ${d.electron}, Chromium ${d.chrome})`],
    ["Graphics card", d.gpu.map((g) => `${g.device} ${g.active ? "(in use)" : ""} · driver ${g.driver || "?"}`).join("<br>") || "?"],
    ["Renderer", d.renderer || "?"],
    ["WebGL", `${d.features.webgl} / WebGL 2 ${d.features.webgl2}`],
    ["GPU rasterisation", d.features.gpu_compositing || "?"],
    ["Processor", `${d.cpu.model} · ${d.cpu.cores} threads`],
    ["Memory", `${d.memory.total} GB (${d.memory.free} GB free)`],
    ["System", d.platform],
  ];
  $("diag").innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
}

D.getSettings().then((r) => {
  state = r.settings;
  presets = r.presets;
  render();
});
