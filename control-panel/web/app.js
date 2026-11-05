"use strict";

/* Myseed control panel UI. Plain JavaScript, no build step, no external requests.
   Everything server-provided is rendered with textContent (never innerHTML), so names,
   logs and commit messages cannot inject markup. */

// ---------------------------------------------------------------------------
// Tiny DOM helpers
// ---------------------------------------------------------------------------

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  git: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-6 3-11 6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  right: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  leftright: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  check: '<path d="M5 12.5 10 17l9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12 20 3M16 7l3 3"/>',
  power: '<path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3c1-4 4.5-8 12-9-1 7.5-5 11-9 12z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>',
  netlify: '<path d="M12 2 22 12 12 22 2 12z"/><path d="M8 12h8M12 8v8"/>',
  vercel: '<path d="M12 4 22 20H2z"/>',
  render: '<circle cx="12" cy="12" r="9"/><path d="M8 16V9a3 3 0 0 1 3-3h3"/>',
};

function icon(name, cls) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.9");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name] || ""; // static, trusted markup only
  if (cls) s.setAttribute("class", cls);
  return s;
}

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "value") e.value = v;
      else if (k === "checked") e.checked = !!v;
      else e.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

const btn = (label, opts = {}) =>
  el("button", { class: `btn ${opts.kind || ""} ${opts.size || ""}`.trim(), type: "button", title: opts.title, onclick: opts.onclick, disabled: opts.disabled, "aria-label": opts.aria }, opts.icon ? icon(opts.icon) : null, label ? el("span", { class: "btn-label", text: label }) : null);

const badge = (text, tone = "", extra = "") => el("span", { class: `badge ${tone} ${extra}`.trim(), text });
const link = (href, text) => el("a", { href, target: "_blank", rel: "noreferrer noopener" }, text, " ", icon("ext", "inline-ext"));

function card(title, opts = {}, ...body) {
  return el(
    "section",
    { class: `card ${opts.class || ""}`.trim() },
    title !== null
      ? el("div", { class: "card-head" }, opts.icon ? el("div", { class: "icon" }, icon(opts.icon)) : null, el("div", { class: "grow" }, el("h3", { text: title }), opts.sub ? el("div", { class: "card-sub", text: opts.sub }) : null), opts.action || null)
      : null,
    ...body,
  );
}

function notice(tone, ...body) {
  return el("div", { class: `notice ${tone}` }, icon(tone === "warn" || tone === "bad" ? "alert" : tone === "ok" ? "check" : "info"), el("div", null, ...body));
}

function field(label, input, hint) {
  return el("label", { class: "field" }, el("span", null, label), input, hint ? el("span", { class: "hint", text: hint }) : null);
}

function switchEl(checked, onchange) {
  const input = el("input", { type: "checkbox", checked, onchange: (e) => onchange(e.target.checked) });
  return el("label", { class: "switch" }, input, el("span"));
}

async function withBusy(button, fn) {
  button.classList.add("busy");
  try {
    return await fn();
  } finally {
    button.classList.remove("busy");
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function ago(iso) {
  if (!iso) return "-";
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!t) return "-";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}
const when = (iso) => (iso ? new Date(typeof iso === "number" ? iso : Date.parse(iso)).toLocaleString() : "-");
function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function duration(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}
function between(a, b) {
  if (!a) return "";
  const s = Math.max(0, Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000));
  return duration(s);
}

const JOB_TONE = { starting: ["Starting", "info live"], running: ["Running", "info live"], succeeded: ["Done", "ok"], failed: ["Failed", "bad"], cancelled: ["Stopped", "warn"], interrupted: ["Interrupted", "bad"] };
const jobBadge = (state) => badge(...(JOB_TONE[state] || [state || "unknown", ""]));

function deployBadge(state) {
  const s = String(state || "").toLowerCase();
  if (["ready", "live", "published"].includes(s)) return badge(s === "live" ? "Live" : "Ready", "ok");
  if (["error", "build_failed", "update_failed", "pre_deploy_failed", "failed"].includes(s)) return badge("Failed", "bad");
  if (["canceled", "cancelled"].includes(s)) return badge("Cancelled", "warn");
  if (["deactivated", "retained", "rejected", "skipped"].includes(s)) return badge(s.replace(/_/g, " "), "plain");
  return badge(s ? s.replace(/_/g, " ") : "pending", "info live");
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function api(method, path, body) {
  const opts = { method, headers: { Accept: "application/json" }, credentials: "same-origin" };
  if (method !== "GET") {
    opts.headers["Content-Type"] = "application/json";
    opts.headers["X-Panel"] = "1";
    opts.body = JSON.stringify(body || {});
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new ApiError("The control panel is not answering. It may have been stopped.", 0, {});
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/login") && !path.startsWith("/api/setup") && !path.startsWith("/api/password")) {
    showAuth(false);
    throw new ApiError(data.error || "Sign in again.", 401, data);
  }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

// ---------------------------------------------------------------------------
// Toasts, modals, confirmations
// ---------------------------------------------------------------------------

function toast(message, tone = "ok", ms = 4200) {
  const t = el("div", { class: `toast ${tone}`, role: "status" }, icon(tone === "bad" ? "alert" : tone === "info" ? "info" : "check"), el("div", { text: message }));
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), ms);
}
const fail = (err) => toast(err.message || String(err), "bad", 7000);

function modal(build) {
  return new Promise((resolve) => {
    const wrap = el("div", { class: "modal-wrap", role: "dialog", "aria-modal": "true" });
    const close = (v) => {
      wrap.remove();
      document.removeEventListener("keydown", onKey);
      resolve(v);
    };
    const onKey = (e) => e.key === "Escape" && close(false);
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("mousedown", (e) => e.target === wrap && close(false));
    wrap.append(el("div", { class: "modal" }, build(close)));
    document.body.append(wrap);
    setTimeout(() => wrap.querySelector("input, .btn.primary, .btn.danger")?.focus(), 30);
  });
}

function confirmBox({ title, lines = [], word, ok = "Continue", danger = false, note }) {
  return modal((close) => {
    const input = word ? el("input", { type: "text", placeholder: `Type ${word} to confirm`, autocomplete: "off" }) : null;
    const go = el("button", { class: `btn ${danger ? "danger solid" : "primary"}`, type: "button", disabled: !!word, onclick: () => close(true) }, ok);
    if (input) {
      input.addEventListener("input", () => (go.disabled = input.value.trim().toUpperCase() !== word));
      input.addEventListener("keydown", (e) => e.key === "Enter" && !go.disabled && close(true));
    }
    return [
      el("h2", { text: title }),
      lines.length ? el("ul", null, lines.map((l) => el("li", { text: l }))) : null,
      note ? notice("warn", note) : null,
      input,
      el("div", { class: "actions" }, btn("Cancel", { kind: "ghost", onclick: () => close(false) }), go),
    ];
  });
}

function promptBox({ title, label, placeholder, value = "", ok = "Save", secret = false, hint }) {
  return modal((close) => {
    const input = el("input", { type: secret ? "password" : "text", placeholder, value, autocomplete: "off" });
    const submit = () => input.value.trim() && close(input.value.trim());
    input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
    return [el("h2", { text: title }), field(label, input, hint), el("div", { class: "actions" }, btn("Cancel", { kind: "ghost", onclick: () => close(null) }), btn(ok, { kind: "primary", onclick: submit }))];
  });
}

// Starts a job request; handles "busy" conflicts by offering to stop the holder, then opens the log.
async function runJob(request, { open = true } = {}) {
  try {
    const res = await request();
    if (res.job) {
      toast(`Started: ${res.job.title}`, "info");
      refreshJobs();
      if (open) openJob(res.job.id);
    }
    return res;
  } catch (err) {
    if (err.status === 409 && err.data?.holder) {
      const h = err.data.holder;
      const yes = await confirmBox({ title: "Something else is using it", lines: [err.message, `Stop “${h.title}” and continue?`], ok: `Stop it and continue`, danger: true });
      if (!yes) return null;
      await api("POST", `/api/jobs/${h.id}/cancel`);
      await new Promise((r) => setTimeout(r, 1500));
      return runJob(request, { open });
    }
    fail(err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Job log drawer
// ---------------------------------------------------------------------------

let drawerTimer = null;

function closeDrawer() {
  clearInterval(drawerTimer);
  document.querySelectorAll(".scrim, .drawer").forEach((n) => n.remove());
}

function openJob(id) {
  closeDrawer();
  const scrim = el("div", { class: "scrim", onclick: closeDrawer });
  const title = el("h2", { class: "grow truncate", text: "Loading…" });
  const state = el("span");
  const meta = el("div", { class: "small muted" });
  const steps = el("div", { class: "steps" });
  const log = el("pre", { class: "log", tabindex: "0" });
  const stopBtn = btn("Stop", { kind: "danger", size: "sm", icon: "stop" });
  const rerunBtn = btn("Run again", { size: "sm", icon: "refresh" });
  const openBtn = btn("Open site", { size: "sm", icon: "ext" });
  const follow = el("input", { type: "checkbox", checked: true });
  const drawer = el(
    "aside",
    { class: "drawer", role: "dialog", "aria-label": "Job log" },
    el("div", { class: "drawer-head" }, el("div", { class: "row" }, title, state, btn("", { kind: "ghost", size: "sm icon", icon: "x", aria: "Close", onclick: closeDrawer })), meta, steps),
    log,
    el("div", { class: "drawer-foot" }, el("label", { class: "row small muted" }, follow, "Follow output"), el("span", { class: "right" }), openBtn, rerunBtn, stopBtn),
  );
  document.body.append(scrim, drawer);
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") {
      closeDrawer();
      document.removeEventListener("keydown", esc);
    }
  });

  let offset = 0;
  let last = null;
  stopBtn.onclick = async () => {
    if (!(await confirmBox({ title: "Stop this job?", lines: [last?.title || "", "Work in progress is interrupted. Database restores run in one transaction, so a stopped restore changes nothing."], ok: "Stop job", danger: true }))) return;
    try {
      await api("POST", `/api/jobs/${id}/cancel`);
      toast("Job stopped", "info");
      tick();
    } catch (err) {
      fail(err);
    }
  };
  rerunBtn.onclick = () => runJob(() => api("POST", `/api/jobs/${id}/rerun`));

  const append = (text) => {
    for (const line of text.split("\n")) {
      if (!line && log.lastChild?.textContent === "\n") continue;
      let cls = null;
      if (line.startsWith("▶")) cls = "l-step";
      else if (line.startsWith("✓") || line.startsWith("✔")) cls = "l-ok";
      else if (line.startsWith("✗") || line.startsWith("■") || /\berror\b|failed|ERR!/i.test(line)) cls = "l-err";
      else if (line.startsWith("  $ ")) cls = "l-cmd";
      log.append(cls ? el("span", { class: cls, text: line }) : document.createTextNode(line), "\n");
    }
    if (follow.checked) log.scrollTop = log.scrollHeight;
  };

  async function tick() {
    try {
      const r = await api("GET", `/api/jobs/${id}/log?offset=${offset}`);
      if (r.text) append(r.text);
      offset = r.offset;
      const j = (last = r.job);
      if (!j) return;
      title.textContent = j.title;
      state.replaceChildren(jobBadge(j.state));
      const active = j.state === "running" || j.state === "starting";
      meta.textContent = `${j.started ? `Started ${when(j.started)}` : `Queued ${when(j.created)}`} · ${active ? `running for ${between(j.started || j.created)}` : `took ${between(j.started || j.created, j.finished)}`}${j.message ? ` · ${j.message}` : ""}`;
      steps.replaceChildren(
        ...(j.steps || []).map((s, i) => {
          const done = i < (j.step || 0) || j.state === "succeeded";
          const now = i === (j.step || 0) && active;
          const failed = i === (j.step || 0) && ["failed", "interrupted"].includes(j.state);
          return el("div", { class: `step ${done ? "done" : ""} ${now ? "now" : ""} ${failed ? "fail" : ""}` }, el("i"), s);
        }),
      );
      stopBtn.classList.toggle("hidden", !active);
      rerunBtn.classList.toggle("hidden", active);
      openBtn.classList.toggle("hidden", !(j.url && active));
      openBtn.onclick = () => window.open(j.url, "_blank", "noopener");
      if (!active && drawerTimer) {
        clearInterval(drawerTimer);
        drawerTimer = setInterval(tick, 5000);
      }
    } catch (err) {
      if (err.status === 404) closeDrawer();
    }
  }
  tick();
  drawerTimer = setInterval(tick, 1000);
}

// ---------------------------------------------------------------------------
// App shell, auth and routing
// ---------------------------------------------------------------------------

const app = document.getElementById("app");
const S = { running: [], session: null, timers: [] };

const NAV = [
  { group: null, items: [{ id: "overview", label: "Overview", icon: "home" }] },
  {
    group: "Set up",
    items: [
      { id: "plan", label: "Deploy plan", icon: "leftright" },
      { id: "domains", label: "Domains", icon: "cloud" },
      { id: "keys", label: "Keys and settings", icon: "key" },
    ],
  },
  {
    group: "Data",
    items: [
      { id: "database", label: "Supabase sync", icon: "db" },
      { id: "backups", label: "Backups", icon: "archive" },
    ],
  },
  {
    group: "Deploy",
    items: [
      { id: "vps", label: "Hostinger VPS", icon: "server" },
      { id: "hosting", label: "Netlify, Vercel, Render", icon: "cloud" },
      { id: "git", label: "Code (GitHub)", icon: "git" },
      { id: "local", label: "Local app", icon: "laptop" },
    ],
  },
  {
    group: "Panel",
    items: [
      { id: "jobs", label: "Jobs and logs", icon: "list", count: true },
      { id: "settings", label: "Settings", icon: "gear" },
    ],
  },
];
const PAGES = { overview: pageOverview, plan: pagePlan, domains: pageDomains, keys: pageKeys, database: pageDatabase, backups: pageBackups, vps: pageVps, hosting: pageHosting, git: pageGit, local: pageLocal, jobs: pageJobs, settings: pageSettings };
const TITLES = { overview: "Overview", plan: "Deploy plan", domains: "Domains", keys: "Keys and settings", database: "Supabase sync", backups: "Backups", vps: "Hostinger VPS", hosting: "Netlify, Vercel, Render", git: "Code (GitHub)", local: "Local app", jobs: "Jobs and logs", settings: "Settings" };

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("mcp-theme", t);
  } catch { }
}
try {
  applyTheme(localStorage.getItem("mcp-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
} catch {
  applyTheme("dark");
}

async function boot() {
  try {
    S.session = await api("GET", "/api/session");
  } catch (err) {
    app.className = "";
    app.replaceChildren(el("div", { class: "stopped" }, el("div", { class: "col" }, el("h1", { text: "The control panel is not running" }), el("p", { class: "muted", text: "Start it again with: python control-panel/control_panel.py" }))));
    return;
  }
  if (!S.session.authenticated) return showAuth(!S.session.has_password);
  showShell();
}

function showAuth(setup) {
  S.timers.forEach(clearInterval);
  S.timers = [];
  closeDrawer();
  app.className = "";
  const pw = el("input", { type: "password", placeholder: "Password", autocomplete: setup ? "new-password" : "current-password" });
  const pw2 = setup ? el("input", { type: "password", placeholder: "Repeat password", autocomplete: "new-password" }) : null;
  const err = el("div", { class: "error-text" });
  const go = btn(setup ? "Create password and continue" : "Sign in", { kind: "primary" });
  const submit = () =>
    withBusy(go, async () => {
      err.textContent = "";
      if (setup && pw.value !== pw2.value) return (err.textContent = "The passwords do not match.");
      try {
        await api("POST", setup ? "/api/setup" : "/api/login", { password: pw.value });
        showShell();
      } catch (e) {
        err.textContent = e.message;
        pw.select();
      }
    });
  go.onclick = submit;
  [pw, pw2].forEach((i) => i?.addEventListener("keydown", (e) => e.key === "Enter" && submit()));
  app.replaceChildren(
    el(
      "div",
      { class: "auth" },
      el(
        "div",
        { class: "auth-card" },
        el("div", { class: "brand" }, el("div", { class: "brand-mark" }), el("div", null, el("b", { text: "Content Manager Panel" }), el("span", { text: "Hostinger VPS · Supabase · Netlify · Vercel · Render" }))),
        el("div", null, el("h1", { text: setup ? "Create your panel password" : "Welcome back" }), el("p", { class: "muted small", text: setup ? "This protects the panel in your browser. Use 8 or more characters. It is stored as a salted hash on this computer." : "Sign in to manage data, deployments and jobs." })),
        field("Password", pw),
        pw2 ? field("Repeat password", pw2) : null,
        err,
        go,
        el("p", { class: "tiny faint", text: "The panel only listens on this computer (content-manager.localhost). Jobs keep running when you close this tab." }),
      ),
    ),
  );
  pw.focus();
}

function currentView() {
  const v = location.hash.replace(/^#\/?/, "").split("/")[0];
  return PAGES[v] ? v : "overview";
}
function go(view, sub) {
  location.hash = `#/${view}${sub ? `/${sub}` : ""}`;
}
const subView = () => location.hash.replace(/^#\/?/, "").split("/")[1];

let navEl, contentEl, titleEl, runningPill, projectChip;

function showShell() {
  app.className = "";
  navEl = el("nav", { class: "nav" });
  contentEl = el("div", { class: "content" });
  titleEl = el("div", { class: "title grow", text: "" });
  runningPill = el("button", { class: "btn ghost sm hidden", onclick: () => go("jobs") });
  // Which project this panel manages, always in view, so it is never mistaken for another project's panel.
  projectChip = el("span", { class: "badge plain truncate desktop-only project-chip", title: "" });
  api("GET", "/api/session")
    .then((s) => {
      const pr = s.project;
      if (!pr) return;
      const repo = pr.remote ? pr.remote.replace(/^https?:\/\/(www\.)?/, "").replace(/\.git$/, "") : pr.folder;
      projectChip.textContent = repo;
      projectChip.title = `${pr.name} · ${pr.path}${pr.remote ? " · " + pr.remote : ""}`;
    })
    .catch(() => {});
  const themeBtn = btn("", { kind: "ghost", size: "icon", icon: document.documentElement.dataset.theme === "light" ? "moon" : "sun", aria: "Switch theme", title: "Switch light or dark" });
  themeBtn.onclick = () => {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
    themeBtn.replaceChildren(icon(document.documentElement.dataset.theme === "light" ? "moon" : "sun"));
  };
  const shell = el(
    "div",
    { class: "shell" },
    el(
      "aside",
      { class: "sidebar" },
      el("div", { class: "brand" }, el("div", { class: "brand-mark" }), el("div", null, el("b", { text: "Content Manager" }), el("span", { text: "Control panel" }))),
      navEl,
      el("div", { class: "sidebar-foot" }, el("div", { class: "row" }, el("span", { class: "pulse-dot" }), el("span", { text: "Panel running in the background" })), el("div", { class: "faint", text: "Closing this tab keeps jobs running." })),
    ),
    el(
      "div",
      { class: "main" },
      el(
        "header",
        { class: "topbar" },
        btn("", { kind: "ghost", size: "icon mobile-only", icon: "menu", aria: "Menu", onclick: () => shell.classList.toggle("nav-open") }),
        titleEl,
        projectChip,
        runningPill,
        themeBtn,
        btn("Sign out", { kind: "ghost", size: "sm", icon: "logout", title: "Sign out", onclick: async () => (await api("POST", "/api/logout").catch(() => { }), showAuth(false)) }),
        btn("Stop and exit", { kind: "danger", size: "sm", icon: "power", title: "Stop everything and exit", onclick: stopAndExit }),
      ),
      contentEl,
    ),
  );
  app.replaceChildren(shell);
  window.onhashchange = () => {
    shell.classList.remove("nav-open");
    render();
  };
  render();
  refreshJobs();
  S.timers.push(setInterval(refreshJobs, 3000));
}

function renderNav() {
  const view = currentView();
  navEl.replaceChildren(
    ...NAV.flatMap((g) => [
      g.group ? el("div", { class: "nav-label", text: g.group }) : null,
      ...g.items.map((i) =>
        el("button", { class: view === i.id ? "active" : "", onclick: () => go(i.id), "aria-current": view === i.id ? "page" : null }, icon(i.icon), el("span", { text: i.label }), i.count && S.running.length ? el("span", { class: "count", text: String(S.running.length) }) : null),
      ),
    ]).filter(Boolean),
  );
}

let pageTimer = null;
let renderSeq = 0;
async function render() {
  const view = currentView();
  renderNav();
  titleEl.textContent = TITLES[view];
  clearInterval(pageTimer);
  pageTimer = null;
  const seq = ++renderSeq;
  const root = el("div");
  contentEl.replaceChildren(root);
  try {
    await PAGES[view](root, () => seq === renderSeq);
  } catch (err) {
    if (seq === renderSeq) root.replaceChildren(notice("bad", err.message || String(err)));
  }
}

// Re-run a page's loader every few seconds while it is visible, without scroll jumps.
function autoRefresh(fn, ms) {
  clearInterval(pageTimer);
  pageTimer = setInterval(() => document.visibilityState === "visible" && fn(), ms);
}

async function refreshJobs() {
  try {
    const { jobs } = await api("GET", "/api/jobs");
    const running = jobs.filter((j) => j.state === "running" || j.state === "starting");
    const changed = running.map((j) => j.id).join() !== S.running.map((j) => j.id).join();
    S.running = running;
    S.jobs = jobs;
    runningPill.classList.toggle("hidden", !running.length);
    runningPill.replaceChildren(el("span", { class: "pulse-dot" }), `${running.length} running`);
    if (changed) renderNav();
  } catch { }
}

async function stopAndExit() {
  const running = S.running.length;
  const yes = await confirmBox({
    title: "Stop everything and exit?",
    lines: [running ? `${running} running job(s) will be stopped, including the local dev server if it runs.` : "No jobs are running.", "The control panel server shuts down. Start it again with: python control-panel/control_panel.py"],
    ok: "Stop and exit",
    danger: true,
  });
  if (!yes) return;
  try {
    const r = await api("POST", "/api/shutdown", { stop_jobs: true });
    showStopped(`Stopped ${r.stopped_jobs} job(s) and the control panel.`);
  } catch (err) {
    fail(err);
  }
}

function showStopped(msg) {
  S.timers.forEach(clearInterval);
  clearInterval(pageTimer);
  closeDrawer();
  app.replaceChildren(
    el("div", { class: "stopped" }, el("div", { class: "col" }, el("div", { class: "boot-mark" }), el("h1", { text: "Control panel stopped" }), el("p", { class: "muted", text: msg }), el("p", { class: "muted small", text: "You can close this tab. Start it again with: python control-panel/control_panel.py" }))),
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function pageHead(title, sub, ...actions) {
  return el("div", { class: "page-head" }, el("div", { class: "grow" }, el("h1", { text: title }), sub ? el("p", { text: sub }) : null), actions.length ? el("div", { class: "row" }, ...actions) : null);
}

const COUNT_LABELS = { users: "People", grades: "Grades", subjects: "Subjects", units: "Units", parts: "Parts", items: "Items", recordings: "Recordings", messages: "Chat messages" };

function countsTable(counts) {
  const local = counts.local?.counts || {};
  const remote = counts.supabase?.counts || {};
  const vps = counts.vps?.counts || {};
  const hasVps = !!counts.vps;
  const keys = Object.keys(COUNT_LABELS);
  return el(
    "div",
    { class: "table-wrap" },
    el(
      "table",
      null,
      el("thead", null, el("tr", null, el("th", { text: "Table" }), el("th", { class: "num", text: "This computer" }), el("th", { class: "num", text: "Supabase" }), hasVps ? el("th", { class: "num", text: "Hostinger VPS" }) : null, el("th", { class: "num", text: "Local vs Supabase" }))),
      el(
        "tbody",
        null,
        keys.map((k) => {
          const a = local[k];
          const b = remote[k];
          const c = vps[k];
          const d = a !== undefined && b !== undefined ? a - b : null;
          return el(
            "tr",
            null,
            el("td", { text: COUNT_LABELS[k] }),
            el("td", { class: "num", text: a ?? "-" }),
            el("td", { class: "num", text: b ?? "-" }),
            hasVps ? el("td", { class: "num", text: c ?? "-" }) : null,
            el("td", { class: `num ${d > 0 ? "diff-up" : d < 0 ? "diff-down" : "muted"}`, text: d === null ? "-" : d === 0 ? "same" : d > 0 ? `+${d} here` : `${-d} more in Supabase` }),
          );
        }),
      ),
    ),
  );
}

function countsCard(counts, onRefresh) {
  const mk = (target, label) => {
    const b = btn(label, { size: "sm", icon: "refresh" });
    b.onclick = () =>
      withBusy(b, async () => {
        try {
          await api("POST", "/api/db/counts", { target });
          toast(`${label}: counted`, "ok", 2500);
          onRefresh();
        } catch (err) {
          fail(err);
        }
      });
    return b;
  };
  const stampText = ["local", "supabase", "vps"].map((t) => (counts[t] ? `${t === "local" ? "Local" : t === "supabase" ? "Supabase" : "VPS"} checked ${ago(counts[t].at)} (${counts[t].ms} ms)` : null)).filter(Boolean).join(" · ");
  return card("Compare row counts", { icon: "leftright", sub: stampText || "Count rows on each side to see what differs before you push or pull.", class: "flush-body", action: el("div", { class: "row" }, mk("local", "Count local"), mk("supabase", "Count Supabase"), mk("vps", "Count Hostinger VPS")) }, countsTable(counts));
}

function jobsList(jobs, empty = "No jobs yet.") {
  if (!jobs.length) return el("div", { class: "empty" }, icon("list"), el("div", { text: empty }));
  return el(
    "div",
    { class: "list" },
    jobs.map((j) =>
      el(
        "div",
        { class: "list-item", onclick: () => openJob(j.id), role: "button", tabindex: "0", onkeydown: (e) => e.key === "Enter" && openJob(j.id) },
        jobBadge(j.state),
        el("div", { class: "grow" }, el("div", { class: "truncate", text: j.title }), el("div", { class: "tiny muted", text: `${ago(j.created)} · ${j.state === "running" || j.state === "starting" ? `step ${(j.step || 0) + 1} of ${j.steps.length}` : between(j.started || j.created, j.finished) || ""}` })),
        icon("right", "faint"),
      ),
    ),
  );
}

function needSupabase(here = false) {
  return here ? notice("warn", "Save your Supabase connection strings above to enable push and pull.") : notice("warn", "Add your Supabase connection strings first. ", el("a", { href: "#/database", text: "Open Supabase sync" }));
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

async function pageOverview(root, alive) {
  const load = async () => {
    const o = await api("GET", "/api/overview");
    if (!alive()) return;
    const sb = o.supabase;
    const sbReady = !!sb.session;
    const host = (p, name, ic) => {
      const h = o.hosting[p];
      const target = h.config.site_name || h.config.project_name || h.config.service_name;
      return el(
        "section",
        { class: "card", role: "button", tabindex: "0", onclick: () => go("hosting", p) },
        el("div", { class: "card-head" }, el("div", { class: "icon" }, icon(ic)), el("div", { class: "grow" }, el("h3", { text: name }), el("div", { class: "card-sub truncate", text: target || (h.connected ? "Choose a site" : "Not connected") })), h.connected ? badge(target ? "Ready" : "Connected", target ? "ok" : "info") : badge("Off", "plain")),
        h.config.site_url ? el("div", { class: "small truncate" }, link(h.config.site_url, h.config.site_url.replace(/^https?:\/\//, ""))) : el("div", { class: "small muted", text: h.connected ? "Connected" : "Connect your account" }),
      );
    };
    const dev = o.dev;
    const devRunning = !!dev.job;
    const pushBtn = btn("Push to Supabase", { kind: "primary", icon: "up", disabled: !sbReady, onclick: doPush });
    const pullBtn = btn("Pull from Supabase", { icon: "down", disabled: !sbReady, onclick: doPull });
    const vpsReady = !!o.vps.last_deploy;
    const pushVpsBtn = btn("Push to VPS", { kind: "primary", icon: "up", disabled: !vpsReady, onclick: doPushVps });
    const pullVpsBtn = btn("Pull from VPS", { icon: "down", disabled: !vpsReady, onclick: doPullVps });
    const pullSbToVpsBtn = btn("Pull Supabase to VPS", { size: "sm", icon: "down", disabled: !sbReady || !vpsReady, onclick: doPullSbToVps });
    root.replaceChildren(
      el(
        "div",
        { class: "hero" },
        el(
          "div",
          { class: "row" },
          el("div", { class: "grow" }, el("h1", { text: "Myseed Content Manager" }), el("p", { class: "muted small", text: [o.panel.project, o.project && o.project.remote].filter(Boolean).join(" · ") })),
          badge(`Panel up ${duration(o.panel.uptime)}`, "ok"),
          badge(o.jobs.running.length ? `${o.jobs.running.length} job(s) running` : "No jobs running", o.jobs.running.length ? "info live" : "plain"),
          badge("Secrets encrypted", "violet"),
        ),
      ),
      el(
        "div",
        { class: "grid g4 section" },
        el(
          "section",
          { class: "card", role: "button", tabindex: "0", onclick: () => go("database") },
          el("div", { class: "card-head" }, el("div", { class: "icon" }, icon("db")), el("div", { class: "grow" }, el("h3", { text: "Supabase" }), el("div", { class: "card-sub truncate", text: sb.project.project_name || sb.session || "Not configured" })), sbReady ? badge("Ready", "ok") : badge("Set up", "warn")),
          el("div", { class: "small muted", text: sbReady ? `Session ${sb.session}` : "Add connection strings to sync data" }),
        ),
        el(
          "section",
          { class: "card", role: "button", tabindex: "0", onclick: () => go("vps") },
          el("div", { class: "card-head" }, el("div", { class: "icon" }, icon("server")), el("div", { class: "grow" }, el("h3", { text: "Hostinger VPS" }), el("div", { class: "card-sub truncate", text: o.vps.host ? `${o.vps.user || "root"}@${o.vps.host}` : o.vps.connected ? "Choose the VPS" : "Not connected" })), o.vps.last_deploy ? badge("Live", "ok") : o.vps.host ? badge("Set up", "info") : badge("Off", "plain")),
          o.vps.url ? el("div", { class: "small truncate" }, link(o.vps.url, o.vps.url.replace(/^https?:\/\//, ""))) : el("div", { class: "small muted", text: o.vps.last_deploy ? `Release ${o.vps.last_deploy.release}` : "Your own server, deployed over SSH" }),
        ),
        host("netlify", "Netlify", "netlify"),
        host("vercel", "Vercel", "vercel"),
        host("render", "Render", "render"),
      ),
      el(
        "div",
        { class: "section" },
        el("h2", null, icon("leftright"), "Move data"),
        sbReady ? null : needSupabase(),
        o.app_db ? el("div", { class: "section" }, appDbNotice(o.app_db)) : null,
        el(
          "div",
          { class: "flow section" },
          card("This computer", { icon: "laptop", sub: o.app_db ? "Embedded copy in data/pg (your app is not using it)" : "Embedded database in data/pg" }, el("div", { class: "stat", text: o.counts.local ? `${o.counts.local.counts.items} items` : "-" }), el("div", { class: "small muted", text: o.counts.local ? `${o.counts.local.counts.users} people · ${o.counts.local.counts.parts} parts · checked ${ago(o.counts.local.at)}` : "Not counted yet" })),
          el("div", { class: "flow-arrow col" }, pushBtn, icon("leftright"), pullBtn),
          card("Supabase", { icon: "db", sub: sb.project.project_name || "Hosted PostgreSQL" }, el("div", { class: "stat", text: o.counts.supabase ? `${o.counts.supabase.counts.items} items` : "-" }), el("div", { class: "small muted", text: o.counts.supabase ? `${o.counts.supabase.counts.users} people · ${o.counts.supabase.counts.parts} parts · checked ${ago(o.counts.supabase.at)}` : "Not counted yet" })),
          el("div", { class: "flow-arrow col" }, pushVpsBtn, icon("leftright"), pullVpsBtn),
          card("Hostinger VPS", { icon: "server", sub: o.vps.domain || o.vps.host || "VPS PostgreSQL" }, el("div", { class: "stat", text: o.counts.vps ? `${o.counts.vps.counts.items} items` : "-" }), el("div", { class: "small muted", text: o.counts.vps ? `${o.counts.vps.counts.users} people · ${o.counts.vps.counts.parts} parts · checked ${ago(o.counts.vps.at)}` : (vpsReady ? "VPS connected" : "Set up VPS") }), vpsReady && sbReady ? el("div", { class: "section row", style: "margin-top: 10px" }, pullSbToVpsBtn) : null),
        ),
        el("div", { class: "section" }, countsCard(o.counts, load)),
      ),
      el(
        "div",
        { class: "grid g2 section" },
        card(
          "Local dev server",
          {
            icon: "terminal",
            sub: devRunning ? `Running since ${ago(dev.job.started || dev.job.created)}${dev.job.url ? ` at ${dev.job.url}` : ""}` : dev.port_busy ? "Port 3000 is used by another program; Next.js will pick the next free port" : "Not running",
            action: devRunning ? badge("Running", "ok live") : badge("Stopped", "plain"),
          },
          el(
            "div",
            { class: "row" },
            devRunning
              ? [btn("Open app", { kind: "primary", icon: "ext", onclick: () => window.open(dev.job.url || dev.url, "_blank", "noopener") }), btn("Log", { icon: "terminal", onclick: () => openJob(dev.job.id) }), btn("Stop", { kind: "danger", icon: "stop", onclick: async () => (await api("POST", `/api/jobs/${dev.job.id}/cancel`).catch(fail), load()) })]
              : btn("Start dev server", { kind: "primary", icon: "play", onclick: async () => (await runJob(() => api("POST", "/api/local/dev"), { open: false }), setTimeout(load, 800)) }),
          ),
          el("p", { class: "small muted section", text: "Runs npm run dev at http://localhost:3020. It keeps running when you close this tab, until you stop it or use Stop and exit." }),
        ),
        card("Recent jobs", { icon: "list", class: "flush", action: btn("All jobs", { size: "sm", kind: "ghost", onclick: () => go("jobs") }) }, jobsList(o.jobs.recent)),
      ),
      el(
        "div",
        { class: "section" },
        card(
          "Latest backups",
          { icon: "archive", class: "flush", sub: o.auto_backup.enabled ? `Automatic Supabase backup every ${o.auto_backup.hours} h · last ${ago(o.auto_backup.last_run)}` : "Automatic backups are off (Settings)", action: btn("Backups", { size: "sm", kind: "ghost", onclick: () => go("backups") }) },
          o.backups.length ? backupsTable(o.backups, load, true) : el("div", { class: "empty", text: "No backups yet. Push and pull always make one first." }),
        ),
      ),
    );
    root.querySelectorAll("section.card[role=button]").forEach((c) => c.classList.add("clickable"));
  };
  await load();
  autoRefresh(load, 8000);
}

// When .env gives the local app a DATABASE_URL, "this computer" (data/pg) is a copy the app no longer uses.
function appDbNotice(a) {
  if (!a) return null;
  return notice(
    "warn",
    el("b", { text: `Your local app uses ${a.supabase ? "Supabase" : a.host} directly ` }),
    `(DATABASE_URL in ${a.file}), the same data as the live site. "This computer" here means the separate embedded copy in data/pg, which the app is not using. Pushing would replace the live data with that copy.`,
  );
}

async function doPush() {
  const s = await api("GET", "/api/supabase").catch(() => ({}));
  const a = s.app_db;
  const ok = await confirmBox({
    title: "Push this computer's data to Supabase?",
    lines: ["1. A safety backup of Supabase is saved in backups/supabase.", "2. The embedded local database (data/pg) is backed up.", "3. All Supabase data is replaced with the data/pg data in one transaction.", "People using the live site see that data afterwards."],
    note: a ? `Your local app already uses ${a.supabase ? "Supabase" : a.host} through DATABASE_URL in ${a.file}, so changes made in it are already live. data/pg is an older separate copy: pushing it replaces accounts and work created since.` : null,
    word: "PUSH",
    ok: "Push to Supabase",
    danger: true,
  });
  if (ok) await runJob(() => api("POST", "/api/data/push"));
}

async function doPull() {
  const ok = await confirmBox({
    title: "Pull Supabase data to this computer?",
    lines: ["1. A safety backup of the local database is saved in backups/local.", "2. Supabase is backed up.", "3. All local data is replaced with the Supabase data in one transaction."],
    word: "PULL",
    ok: "Pull from Supabase",
    danger: true,
  });
  if (ok) await runJob(() => api("POST", "/api/data/pull"));
}

async function doPushVps() {
  const ok = await confirmBox({
    title: "Push this computer's data to Hostinger VPS?",
    lines: [
      "Backs up the local database and the VPS database, then replaces everything on the VPS with the local data.",
      "Anyone using the live site will lose any changes made since your local copy.",
    ],
    word: "VPS",
    ok: "Push to Hostinger VPS",
    danger: true,
  });
  if (ok) await runJob(() => api("POST", "/api/vps/data/push"));
}

async function doPullVps() {
  const ok = await confirmBox({
    title: "Pull Hostinger VPS data to this computer?",
    lines: [
      "Downloads a backup of the VPS database, backs up the local database, then replaces the local data with it.",
    ],
    ok: "Pull from Hostinger VPS",
    danger: true,
  });
  if (ok) await runJob(() => api("POST", "/api/vps/data/pull"));
}

async function doPullSbToVps() {
  const ok = await confirmBox({
    title: "Pull from Supabase into Hostinger VPS?",
    lines: [
      "Pulls configurations and user accounts from Supabase into your Hostinger VPS database.",
      "Excludes workspace config (cfg.workspace) to preserve your Hostinger site settings.",
      "A safety backup of both Supabase and the VPS database will be saved first.",
    ],
    word: "PULL",
    ok: "Pull to Hostinger VPS",
    danger: true,
  });
  if (ok) await runJob(() => api("POST", "/api/vps/data/pull_supabase", { mode: "accounts_and_config" }));
}


// ---------------------------------------------------------------------------
// Deploy plan, Domains, Keys and settings
// ---------------------------------------------------------------------------

const APP_LABEL = { web: "Website", admin: "Admin console", api: "API" };
const HOST_LABEL = { vps: "Hostinger VPS", netlify: "Netlify", vercel: "Vercel", render: "Render", external: "Supabase" };
const HOST_PAGE = { vps: "vps", netlify: "hosting", vercel: "hosting", render: "hosting" };

const SITE_FIELDS = [
  ["SITE_DOMAIN", "Website domain", "myseedops.tech", "Main public domain for the website"],
  ["SITE_ALIAS", "Also answer on (redirects to the website)", "www.myseedops.tech", "VPS only; on other hosts add it as a domain alias"],
  ["ADMIN_DOMAIN", "Admin console domain", "myseedops.tech", "Same as website or a subdomain like admin.myseedops.tech"],
  ["API_DOMAIN", "API domain", "myseedops.tech", "Same as website or a subdomain like api.myseedops.tech"],
  ["ACME_EMAIL", "Email for HTTPS certificate notices (VPS)", "info@myseedops.tech", "Used by Caddy for TLS certificate alerts"],
  ["PUBLIC_SITE_URL", "Public address for search engines & links", "https://myseedops.tech", "Canonical public URL"],
];

const EMAIL_FIELDS = [
  ["SMTP_HOST", "SMTP server", "mail.myseed.com.et"],
  ["SMTP_PORT", "SMTP port", "465"],
  ["SMTP_USER", "SMTP user", "iwfm@myseed.com.et"],
  ["SMTP_FROM", "From address", "MySeed Content Manager <iwfm@myseed.com.et>"],
  ["EMAIL_FROM", "From address (Resend)", "MySeed Content Manager <iwfm@myseed.com.et>"],
  ["BILLING_FINANCE_EMAIL", "Copy of invoices and receipts to", "iwfm@myseed.com.et"],
];

const OTHER_FIELDS = [
  ["TELEGRAM_HANDLE", "Telegram handle", "MySeed_Academy"],
  ["WHATSAPP_NUMBER", "WhatsApp number (digits; empty hides it)", ""],
  ["S3_BUCKET", "S3 or R2 bucket", ""],
  ["S3_REGION", "S3 region", "auto"],
  ["S3_ENDPOINT", "S3 endpoint (R2, MinIO)", ""],
  ["S3_PUBLIC_URL", "Public URL of the bucket", ""],
];

const SECRET_FIELDS = [
  ["SMTP_PASSWORD", "SMTP password", "Email"],
  ["RESEND_API_KEY", "Resend API key (instead of SMTP)", "Email"],
  ["CHAPA_SECRET_KEY", "Chapa secret key", "Payments"],
  ["CHAPA_WEBHOOK_SECRET", "Chapa webhook secret", "Payments"],
  ["STRIPE_SECRET_KEY", "Stripe secret key", "Payments"],
  ["STRIPE_WEBHOOK_SECRET", "Stripe webhook secret", "Payments"],
  ["ANTHROPIC_API_KEY", "Anthropic API key (assistant)", "Other"],
  ["GOOGLE_TRANSLATE_API_KEY", "Google Translate API key", "Other"],
  ["S3_ACCESS_KEY_ID", "S3 access key ID", "Other"],
  ["S3_SECRET_ACCESS_KEY", "S3 secret access key", "Other"],
];

function sendToHostsNote(plan) {
  const hosts = [...new Set(["web", "admin", "api"].map((a) => (plan && plan[a]) || "vps"))];
  return notice("info", el("div", null, "After saving, send the settings to your host: ", hosts.map((h, i) => [i ? ", " : "", el("a", { href: `#/${HOST_PAGE[h] || 'vps'}`, text: HOST_LABEL[h] || h })]), ". Every deploy or Push Settings step sends them too."));
}

async function pagePlan(root, alive) {
  const load = async () => {
    const d = await api("GET", "/api/plan");
    if (!alive()) return;
    const p = d.plan || {};
    const choose = (preset) =>
      act(async () => {
        await api("POST", "/api/plan", { preset });
        toast("Plan saved");
        load();
      });
    const selects = {};
    const mkSel = (key, options) => {
      selects[key] = el("select", null, options.map(([v, l]) => el("option", { value: v, text: l, selected: p[key] === v })));
      return selects[key];
    };
    const saveCustom = btn("Save custom plan", { kind: "primary", size: "sm" });
    saveCustom.onclick = () =>
      withBusy(
        saveCustom,
        act(async () => {
          await api("POST", "/api/plan", Object.fromEntries(Object.entries(selects).map(([k, s]) => [k, s.value])));
          toast("Plan saved");
          load();
        }),
      );
    root.replaceChildren(
      pageHead("Deploy plan", "Pick where the website, admin console, API and database run. You can change it later; nothing is moved until you deploy."),
      el(
        "div",
        { class: "grid g2" },
        Object.entries(d.presets || {}).map(([key, pr]) =>
          el(
            "section",
            { class: `card plan-card ${p.preset === key ? "chosen" : ""}` },
            el("div", { class: "card-head" }, el("div", { class: "icon" }, icon(key === "vps" ? "server" : key === "render" ? "render" : key === "netlify" ? "netlify" : "vercel")), el("div", { class: "grow" }, el("h3", { text: pr.label })), p.preset === key ? badge("Current plan", "ok") : null),
            el("p", { class: "small muted", text: pr.summary }),
            el("div", { class: "row tiny" }, ["web", "admin", "api"].map((a) => badge(`${APP_LABEL[a]}: ${HOST_LABEL[pr[a]] || pr[a]}`, "plain")), badge(`Database: ${pr.db === "vps" ? "VPS" : "Supabase"}`, "plain")),
            p.preset === key ? null : el("div", { class: "row" }, btn("Use this plan", { size: "sm", kind: "primary", onclick: choose(key) })),
          ),
        ),
      ),
      card(
        "Custom plan",
        { icon: "gear", sub: "Mix hosts yourself. The database container exists on the VPS." },
        el(
          "div",
          { class: "grid g4" },
          field("Website", mkSel("web", [["vps", "Hostinger VPS"], ["netlify", "Netlify"], ["vercel", "Vercel"], ["render", "Render"]])),
          field("Admin console", mkSel("admin", [["vps", "Hostinger VPS"], ["netlify", "Netlify"], ["vercel", "Vercel"], ["render", "Render"]])),
          field("API", mkSel("api", [["vps", "Hostinger VPS"], ["render", "Render"]])),
          field("Database", mkSel("db", [["vps", "On the VPS"], ["external", "Supabase or other PostgreSQL"]])),
        ),
        el("div", { class: "row section" }, saveCustom),
      ),
    );
  };
  await load();
}

async function pageDomains(root, alive) {
  const load = async () => {
    const [d, pl] = await Promise.all([api("GET", "/api/vps"), api("GET", "/api/plan")]);
    if (!alive()) return;
    const p = pl.plan || {};
    const site = d.site || {};
    const inputs = {};
    const mkField = ([k, label, ph, hint]) => field(label, (inputs[k] = el("input", { type: "text", value: site[k] || "", placeholder: ph })), hint || undefined);
    const save = btn("Save domains", { kind: "primary", size: "sm" });
    const pushEnv = btn("Push settings to VPS", { size: "sm", icon: "up", onclick: () => runJob(() => api("POST", "/api/vps/push-env")) });
    save.onclick = () =>
      withBusy(
        save,
        act(async () => {
          await api("POST", "/api/vps/settings", { site: Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])), secrets: {} });
          toast("Domains saved");
          load();
        }),
      );
    const ip = d.vps?.host || "<VPS IP>";
    const rows = [
      ["web", site.SITE_DOMAIN || "myseedops.tech"],
      ["web", site.SITE_ALIAS || "www.myseedops.tech"],
      ["admin", site.ADMIN_DOMAIN || "myseedops.tech"],
      ["api", site.API_DOMAIN || "myseedops.tech"],
    ].filter((r) => r[1]);
    const dns = (app, name) => {
      const host = p[app] || "vps";
      if (host === "vps") return ["A", ip, "Points the domain name at your Hostinger VPS."];
      if (/\.(netlify\.app|vercel\.app|onrender\.com)$/.test(name)) return ["-", "nothing to add", "The host's own address works as it is."];
      return ["CNAME", `shown by ${HOST_LABEL[host] || host}`, `Add ${name} as a custom domain in ${HOST_LABEL[host] || host}.`];
    };
    root.replaceChildren(
      pageHead("Domains", "The public addresses of the website, admin console and API. Every host uses them for URLs and CORS allowed origins.", el("div", { class: "row" }, save, pushEnv)),
      card("Addresses", { icon: "cloud" }, el("div", { class: "grid g2" }, SITE_FIELDS.map(mkField)), el("div", { class: "row section" }, save, pushEnv)),
      card(
        "DNS records to add",
        { icon: "info", sub: "In the DNS zone of your domain at Hostinger." },
        el("div", { class: "table-wrap" }, el("table", null, el("thead", null, el("tr", null, el("th", { text: "Name" }), el("th", { text: "Runs on" }), el("th", { text: "Type" }), el("th", { text: "Value" }), el("th", { text: "Why" }))), el("tbody", null, rows.map(([app, name]) => {
          const [type, value, why] = dns(app, name);
          return el("tr", null, el("td", { class: "mono", text: name }), el("td", { text: HOST_LABEL[p[app] || "vps"] || "Hostinger VPS" }), el("td", { text: type }), el("td", { class: "mono", text: value }), el("td", { class: "small muted", text: why }));
        })))),
      ),
      sendToHostsNote(p),
    );
  };
  await load();
}

async function pageKeys(root, alive) {
  const load = async () => {
    const [d, pl] = await Promise.all([api("GET", "/api/vps"), api("GET", "/api/plan")]);
    if (!alive()) return;
    const site = d.site || {};
    const secrets = d.secrets || {};
    const inputs = {};
    const mkField = ([k, label, ph]) => field(label, (inputs[k] = el("input", { type: "text", value: site[k] || "", placeholder: ph })));
    const secretInputs = {};
    const mkSecret = ([k, label]) => field(label, (secretInputs[k] = el("input", { type: "password", placeholder: secrets[k] ? `Saved (${secrets[k]}); type to replace` : "Not set", autocomplete: "off" })));
    const save = btn("Save keys and settings", { kind: "primary", size: "sm" });
    const pushEnv = btn("Push settings to VPS", { size: "sm", icon: "up", onclick: () => runJob(() => api("POST", "/api/vps/push-env")) });
    save.onclick = () =>
      withBusy(
        save,
        act(async () => {
          const s = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
          const sec = Object.fromEntries(Object.entries(secretInputs).filter(([, i]) => i.value.trim()).map(([k, i]) => [k, i.value]));
          await api("POST", "/api/vps/settings", { site: s, secrets: sec });
          toast("Saved");
          load();
        }),
      );
    const group = (title, ic, sub, ...body) => card(title, { icon: ic, sub }, el("div", { class: "grid g2" }, ...body));
    root.replaceChildren(
      pageHead("Keys and settings", "Email, payments, media storage and AI. Saved in this panel with encryption, and copied to the VPS server's .env file.", el("div", { class: "row" }, save, pushEnv)),
      group("Email (SMTP / Resend)", "info", "SMTP mailbox or Resend API key.", EMAIL_FIELDS.map(mkField), SECRET_FIELDS.filter((x) => x[2] === "Email").map(mkSecret)),
      group("Payments (Chapa / Stripe)", "key", "Payment gateways for donations and billing.", SECRET_FIELDS.filter((x) => x[2] === "Payments").map(mkSecret)),
      group("Support, media storage and AI", "gear", "S3 / Cloudflare R2 bucket for uploads and Anthropic AI keys.", OTHER_FIELDS.map(mkField), SECRET_FIELDS.filter((x) => x[2] === "Other").map(mkSecret)),
      card(
        "Push settings to Hostinger VPS",
        { icon: "server", sub: "Writes all configured keys and variables directly into /opt/myseed-content-manager/.env on your Hostinger server." },
        el("div", { class: "row" }, pushEnv),
      ),
      sendToHostsNote(pl.plan),
    );
  };
  await load();
}

// ---------------------------------------------------------------------------
// Supabase sync
// ---------------------------------------------------------------------------

async function pageDatabase(root, alive) {
  const load = async () => {
    const d = await api("GET", "/api/supabase");
    if (!alive()) return;
    const ready = !!d.session;

    // Account (optional)
    const tokenInput = el("input", { type: "password", placeholder: "sbp_…", autocomplete: "off" });
    const connectBtn = btn(d.token ? "Replace token" : "Connect", { kind: d.token ? "" : "primary", icon: "key" });
    connectBtn.onclick = () =>
      withBusy(connectBtn, async () => {
        try {
          const r = await api("POST", "/api/supabase/token", { token: tokenInput.value });
          toast(`Connected. ${r.projects.length} project(s) found.`);
          load();
        } catch (err) {
          fail(err);
        }
      });
    const projectArea = el("div", { class: "col" });
    if (d.token) {
      const sel = el("select", null, el("option", { value: "", text: "Loading projects…" }));
      api("GET", "/api/supabase/projects")
        .then(({ projects }) => {
          sel.replaceChildren(el("option", { value: "", text: projects.length ? "Choose a project" : "No projects in this account" }), ...projects.map((p) => el("option", { value: p.ref, text: `${p.name} · ${p.region} · ${p.status}`, selected: p.ref === d.project.project_ref })));
        })
        .catch((err) => sel.replaceChildren(el("option", { text: err.message })));
      sel.onchange = async () => {
        if (!sel.value) return;
        try {
          await api("POST", "/api/supabase/select", { ref: sel.value });
          toast("Project selected");
          load();
        } catch (err) {
          fail(err);
        }
      };
      const st = d.project_status;
      const paused = st && /INACTIVE|PAUSED/i.test(st.status || "");
      const pw = el("input", { type: "password", placeholder: "Database password", autocomplete: "off" });
      const build = btn("Fill connection strings", { icon: "key" });
      build.onclick = () =>
        withBusy(build, async () => {
          try {
            await api("POST", "/api/supabase/build-urls", { password: pw.value });
            pw.value = "";
            toast("Connection strings saved");
            load();
          } catch (err) {
            fail(err);
          }
        });
      projectArea.append(
        field("Project", sel),
        st
          ? el(
            "div",
            { class: "row" },
            badge(st.status || "unknown", /ACTIVE_HEALTHY/.test(st.status) ? "ok" : paused ? "warn" : "info"),
            el("span", { class: "small muted", text: `${st.name} · ${st.region}` }),
            el("span", { class: "right" }),
            paused
              ? btn("Restore (unpause)", {
                kind: "primary",
                size: "sm",
                icon: "play",
                onclick: async (e) => withBusy(e.currentTarget, async () => (await api("POST", "/api/supabase/restore").then(() => toast("Restore requested. It takes a few minutes.", "info")).catch(fail), load())),
              })
              : btn("Pause project", {
                size: "sm",
                icon: "stop",
                onclick: async () => {
                  if (await confirmBox({ title: "Pause the Supabase project?", lines: ["The live site cannot reach the database until you restore it."], ok: "Pause", danger: true })) await api("POST", "/api/supabase/pause").then(() => toast("Pause requested", "info")).catch(fail), load();
                },
              }),
          )
          : null,
        d.project.project_ref ? field("Build the connection strings from this project", el("div", { class: "input-row" }, pw, build), "The password you chose when creating the project. It is only used to build the strings, which are stored encrypted.") : null,
      );
    }

    // Connection strings
    const session = el("input", { type: "password", placeholder: d.session ? `Saved: ${d.session}` : "postgresql://postgres.<ref>:<password>@…pooler.supabase.com:5432/postgres", autocomplete: "off" });
    const trans = el("input", { type: "password", placeholder: d.transaction ? `Saved: ${d.transaction}` : "postgresql://postgres.<ref>:<password>@…pooler.supabase.com:6543/postgres", autocomplete: "off" });
    const save = btn("Save strings", { kind: "primary", icon: "check" });
    save.onclick = () =>
      withBusy(save, async () => {
        try {
          const r = await api("POST", "/api/supabase/urls", { session: session.value, transaction: trans.value });
          r.warnings.forEach((w) => toast(w, "info", 6000));
          toast("Saved (encrypted)");
          load();
        } catch (err) {
          fail(err);
        }
      });
    const test = btn("Test connection", { icon: "refresh", disabled: !ready });
    const testOut = el("div");
    test.onclick = () =>
      withBusy(test, async () => {
        try {
          const r = await api("POST", "/api/db/counts", { target: "supabase" });
          testOut.replaceChildren(notice("ok", `Connected in ${r.ms} ms. ${r.counts.users} people, ${r.counts.items} items, ${r.counts.parts} parts.`));
        } catch (err) {
          testOut.replaceChildren(notice("bad", err.message));
        }
      });
    const forget = btn("Forget all Supabase settings", { kind: "ghost", size: "sm", icon: "trash" });
    forget.onclick = async () => {
      if (await confirmBox({ title: "Forget the Supabase settings?", lines: ["Removes the saved connection strings, token and project choice from this computer. Nothing changes in Supabase."], ok: "Forget", danger: true })) {
        await api("POST", "/api/supabase/forget").catch(fail);
        load();
      }
    };

    root.replaceChildren(
      pageHead("Supabase sync", "Keep the live database (Supabase) and this computer's database in step. Every push or pull saves a backup of the side being replaced first, so it can always be undone from Backups.", btn("Backups", { icon: "archive", onclick: () => go("backups") })),
      el(
        "div",
        { class: "grid g2" },
        card(
          "Supabase account",
          { icon: "key", sub: "Optional. Lets the panel list projects, unpause a paused project and fill in the connection strings.", action: d.token ? badge(`Token ${d.token}`, "ok") : badge("Optional", "plain") },
          el("div", { class: "col" }, field("Personal access token", el("div", { class: "input-row" }, tokenInput, connectBtn), null), el("p", { class: "small muted" }, "Create one at ", link(d.token_url, "Supabase → Account → Access tokens"), "."), projectArea),
        ),
        card(
          "Connection strings",
          { icon: "db", sub: "From Supabase → Connect → Connection string. Stored encrypted with your Windows account.", action: ready ? badge("Ready", "ok") : badge("Needed", "warn") },
          el(
            "div",
            { class: "col" },
            field("Session pooler (port 5432)", session, "Used by this panel for push, pull and backups, and by Render."),
            field("Transaction pooler (port 6543)", trans, "Used by Netlify and Vercel (serverless)."),
            el("div", { class: "row" }, save, test, el("span", { class: "right" }), forget),
            testOut,
          ),
        ),
      ),
      el(
        "div",
        { class: "section" },
        el("h2", null, icon("leftright"), "Move data"),
        ready ? null : needSupabase(true),
        d.app_db ? el("div", { class: "section" }, appDbNotice(d.app_db)) : null,
        el(
          "div",
          { class: "grid g2 section" },
          card(
            "Push: this computer → Supabase",
            { icon: "up", class: "big-action" },
            el("p", { class: "muted small", text: "Replaces everything in Supabase with your local data. Use it after preparing data locally, for example after a curriculum import." }),
            el("ul", { class: "small muted" }, el("li", { text: "Safety backup of Supabase first" }), el("li", { text: "Runs in one transaction: a failure changes nothing" }), el("li", { text: "Stop the local dev server first (the panel offers to)" })),
            el("div", { class: "row" }, btn("Push to Supabase", { kind: "primary", icon: "up", disabled: !ready, onclick: doPush })),
          ),
          card(
            "Pull: Supabase → this computer",
            { icon: "down", class: "big-action" },
            el("p", { class: "muted small", text: "Replaces your local data with what is live in Supabase. Use it to work locally with the real, current data." }),
            el("ul", { class: "small muted" }, el("li", { text: "Safety backup of the local database first" }), el("li", { text: "Runs in one transaction: a failure changes nothing" }), el("li", { text: "Passwords and sessions come along with the data" })),
            el("div", { class: "row" }, btn("Pull from Supabase", { icon: "down", disabled: !ready, onclick: doPull })),
          ),
        ),
      ),
      el("div", { class: "section" }, countsCard(d.counts, load)),
    );
  };
  await load();
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

function backupsTable(list, reload, compact = false) {
  const restore = async (b, target) => {
    const ok = await confirmBox({
      title: `Restore into ${target === "supabase" ? "Supabase" : "this computer"}?`,
      lines: [`File: ${b.file}`, `A safety backup of the ${target === "supabase" ? "Supabase" : "local"} database is made first.`, `All ${target === "supabase" ? "Supabase" : "local"} data is then replaced with this backup.`],
      word: "RESTORE",
      ok: "Restore",
      danger: true,
    });
    if (ok) await runJob(() => api("POST", "/api/data/restore", { file: b.file, target }));
  };
  const del = async (b) => {
    if (!(await confirmBox({ title: "Delete this backup?", lines: [b.file, "This cannot be undone."], ok: "Delete", danger: true }))) return;
    try {
      await api("POST", "/api/backups/delete", { file: b.file });
      toast("Backup deleted");
      reload();
    } catch (err) {
      fail(err);
    }
  };
  const tone = { local: "info", supabase: "ok", vps: "violet", other: "plain" };
  return el(
    "div",
    { class: "table-wrap" },
    el(
      "table",
      null,
      el("thead", null, el("tr", null, el("th", { text: "From" }), el("th", { text: "File" }), el("th", { text: "Saved" }), el("th", { class: "num", text: "Size" }), el("th", { class: "num", text: "" }))),
      el(
        "tbody",
        null,
        list.map((b) =>
          el(
            "tr",
            null,
            el("td", null, badge(b.source === "supabase" ? "Supabase" : b.source === "local" ? "Local" : b.source === "vps" ? "VPS" : "Other", tone[b.source])),
            el("td", null, el("div", { class: "mono truncate", text: b.name }), b.note ? el("div", { class: "tiny muted", text: b.note.replace(/^\d{8}-\d{6}-?/, "").replace(/-/g, " ") || b.note }) : null),
            el("td", { class: "nowrap", title: when(b.modified), text: ago(b.modified) }),
            el("td", { class: "num nowrap", text: bytes(b.size) }),
            el(
              "td",
              null,
              el(
                "div",
                { class: "actions" },
                b.restorable && !compact ? btn("To local", { size: "sm", icon: "down", title: "Restore into this computer", onclick: () => restore(b, "local") }) : null,
                b.restorable && !compact ? btn("To Supabase", { size: "sm", icon: "up", title: "Restore into Supabase", onclick: () => restore(b, "supabase") }) : null,
                el("a", { class: "btn sm icon ghost", href: `/api/backups/download?file=${encodeURIComponent(b.file)}`, title: "Download", "aria-label": "Download" }, icon("dl")),
                !compact ? btn("", { kind: "ghost", size: "sm icon", icon: "folder", title: "Show in folder", onclick: () => api("POST", "/api/backups/reveal", { file: b.file }).catch(fail) }) : null,
                !compact ? btn("", { kind: "ghost", size: "sm icon", icon: "trash", title: "Delete", onclick: () => del(b) }) : null,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

async function pageBackups(root, alive) {
  let filter = "all";
  const load = async () => {
    const { backups, folder } = await api("GET", "/api/backups");
    if (!alive()) return;
    const shown = backups.filter((b) => filter === "all" || b.source === filter);
    const total = backups.reduce((n, b) => n + b.size, 0);
    const tabs = el(
      "div",
      { class: "tabs" },
      [["all", "All"], ["supabase", "Supabase"], ["local", "Local"], ["vps", "VPS"], ["other", "Other"]].map(([k, l]) => el("button", { class: filter === k ? "active" : "", onclick: () => ((filter = k), load()) }, `${l} (${k === "all" ? backups.length : backups.filter((b) => b.source === k).length})`)),
    );
    root.replaceChildren(
      pageHead(
        "Backups",
        `Full JSON snapshots of every table. ${backups.length} file(s), ${bytes(total)} in ${folder}.`,
        btn("Back up local", { icon: "laptop", onclick: () => runJob(() => api("POST", "/api/data/backup", { target: "local" })) }),
        btn("Back up Supabase", { kind: "primary", icon: "db", onclick: () => runJob(() => api("POST", "/api/data/backup", { target: "supabase" })) }),
        btn("Back up Hostinger VPS", { icon: "server", onclick: () => runJob(() => api("POST", "/api/vps/backup")) }),
        btn("Open folder", { kind: "ghost", icon: "folder", onclick: () => api("POST", "/api/backups/reveal", {}).catch(fail) }),
      ),
      tabs,
      card(null, { class: "flush" }, shown.length ? backupsTable(shown, load) : el("div", { class: "empty" }, icon("archive"), el("div", { text: "No backups here yet." }))),
      el("p", { class: "small muted section", text: "Restoring always saves a safety backup of the side being replaced first. Backups contain password hashes and chat messages: keep the folder private." }),
    );
  };
  await load();
}

// ---------------------------------------------------------------------------
// Hosting
// ---------------------------------------------------------------------------

const HOSTS = {
  netlify: {
    name: "Netlify",
    icon: "netlify",
    target: "site",
    about: "The recommended host. Free plan: 300 credits a month; a production deploy uses about 15. Scheduled alerts run every 15 minutes.",
    tokenHelp: "User settings → Applications → Personal access tokens → New access token.",
  },
  vercel: {
    name: "Vercel",
    icon: "vercel",
    target: "project",
    about: "Free Hobby plan with first-class Next.js support (non-commercial use only). Deploys upload this folder and Vercel builds it. Scheduled checks run once a day (vercel.json).",
    tokenHelp: "Account settings → Tokens → Create. Choose the scope (personal account or team).",
  },
  render: {
    name: "Render",
    icon: "render",
    target: "service",
    about: "One free web server that sleeps after 15 idle minutes. Create the web service once in the Render dashboard from your GitHub repo (build: npm install && npm run build, start: npm start), then manage it here.",
    tokenHelp: "Account settings → API keys → Create API key.",
  },
};

async function pageHosting(root, alive) {
  let p = HOSTS[subView()] ? subView() : "netlify";
  const ov = await api("GET", "/api/overview");
  if (!alive()) return;
  const body = el("div");
  const tabs = el(
    "div",
    { class: "tabs" },
    Object.entries(HOSTS).map(([k, h]) => el("button", { class: p === k ? "active" : "", onclick: () => go("hosting", k) }, el("span", { class: `dot ${ov.hosting[k].connected ? "on" : ""}` }), icon(h.icon), h.name)),
  );
  root.replaceChildren(pageHead("Hosting", "Connect a free host, point it at your Supabase database and deploy. You can use more than one at a time; they all share the same data."), tabs, body);
  await hostPanel(p, body, alive);
}

async function hostPanel(p, body, alive) {
  const H = HOSTS[p];
  const load = async () => {
    const d = await api("GET", `/api/hosting/${p}`);
    if (!alive()) return;
    if (!d.connected) {
      const input = el("input", { type: "password", placeholder: "Paste your access token", autocomplete: "off" });
      const connect = btn(`Connect ${H.name}`, { kind: "primary", icon: "key" });
      connect.onclick = () =>
        withBusy(connect, async () => {
          try {
            const r = await api("POST", `/api/hosting/${p}/token`, { token: input.value });
            toast(`Connected as ${r.user?.name || r.user?.email || "your account"}`);
            load();
          } catch (err) {
            fail(err);
          }
        });
      input.addEventListener("keydown", (e) => e.key === "Enter" && connect.click());
      body.replaceChildren(
        el(
          "div",
          { class: "grid g2" },
          card(
            `Connect ${H.name}`,
            { icon: H.icon, sub: H.about },
            el("div", { class: "col" }, el("div", { class: "row small" }, el("span", { class: "step-num", text: "1" }), el("span", null, "Create a token: ", link(d.token_url, `${H.name} tokens page`))), el("p", { class: "small muted", text: H.tokenHelp }), el("div", { class: "row small" }, el("span", { class: "step-num", text: "2" }), el("span", { text: "Paste it here. It is stored encrypted on this computer and only sent to " + H.name + "." })), el("div", { class: "input-row" }, input, connect)),
          ),
          card("What the panel does for you", { icon: "info" }, el("ul", { class: "small muted" }, el("li", { text: `Pick or create the ${H.target} to deploy to` }), el("li", { text: "Copy DATABASE_URL, pool size, CRON_SECRET and other settings from your Supabase setup" }), el("li", { text: "Deploy and watch progress, with history and links" }), el("li", { text: "Add or remove environment variables" }))),
        ),
      );
      return;
    }

    const tgt = d.target;
    const accountCard = card(
      "Account",
      { icon: H.icon, action: badge("Connected", "ok") },
      el("dl", { class: "kv" }, el("dt", { text: "Signed in as" }), el("dd", { text: d.user ? `${d.user.name || ""}${d.user.email ? ` (${d.user.email})` : ""}` : "-" }), el("dt", { text: "Token" }), el("dd", { class: "mono", text: d.token_hint })),
      d.error ? el("div", { class: "section" }, notice("bad", d.error)) : null,
      el(
        "div",
        { class: "row section" },
        btn("Disconnect", {
          kind: "ghost",
          size: "sm",
          icon: "logout",
          onclick: async () => {
            if (await confirmBox({ title: `Disconnect ${H.name}?`, lines: ["Removes the token and the chosen site from this computer. Nothing changes on " + H.name + "."], ok: "Disconnect", danger: true })) {
              await api("POST", `/api/hosting/${p}/disconnect`).catch(fail);
              load();
            }
          },
        }),
      ),
    );

    // Target picker
    const picker = el("div", { class: "col" });
    const showPicker = async () => {
      picker.replaceChildren(el("div", { class: "progress indeterminate" }, el("div")));
      try {
        const r = await api("GET", `/api/hosting/${p}/targets`);
        const sel = el("select", null, el("option", { value: "", text: r.targets.length ? `Choose a ${H.target}` : `No ${H.target}s yet` }), r.targets.map((t) => el("option", { value: t.id, text: `${t.name}${t.url ? ` · ${t.url.replace(/^https?:\/\//, "")}` : ""}${t.repo ? ` · ${t.repo}` : ""}`, selected: t.id === tgt?.id })));
        const use = btn("Use", { kind: "primary", onclick: async () => sel.value && (await api("POST", `/api/hosting/${p}/select`, { id: sel.value }).then(() => toast(`${H.name} ${H.target} selected`)).catch(fail), load()) });
        const rows = [field(`Existing ${H.target}`, el("div", { class: "input-row" }, sel, use))];
        if (p === "vercel" && r.teams?.length) {
          const team = el("select", null, el("option", { value: "", text: "Personal account" }), r.teams.map((t) => el("option", { value: t.id, text: t.name, selected: t.id === d.config.team_id })));
          team.onchange = async () => (await api("POST", "/api/hosting/vercel/team", { team_id: team.value }).catch(fail), load());
          rows.unshift(field("Scope", team));
        }
        if (p !== "render") {
          const name = el("input", { type: "text", placeholder: "myseed-content", autocomplete: "off" });
          const create = btn(`Create`, { icon: "plus" });
          create.onclick = () => withBusy(create, async () => (await api("POST", `/api/hosting/${p}/create`, { name: name.value }).then(() => toast(`${H.name} ${H.target} created`)).catch(fail), load()));
          rows.push(field(`Or create a new ${H.target}`, el("div", { class: "input-row" }, name, create), p === "netlify" ? "Becomes <name>.netlify.app. To build from GitHub, link the repo once in Netlify (Site configuration → Build & deploy)." : "Becomes <name>.vercel.app."));
        } else rows.push(notice("info", "Render web services are created in the Render dashboard from your GitHub repository. ", link("https://dashboard.render.com/create?type=web", "Create a web service")));
        picker.replaceChildren(...rows);
      } catch (err) {
        picker.replaceChildren(notice("bad", err.message));
      }
    };

    const targetCard = card(
      tgt ? tgt.name : `Choose a ${H.target}`,
      { icon: "server", sub: tgt ? tgt.repo || "No Git repository linked" : `Pick the ${H.target} this panel deploys to.`, action: tgt ? btn("Change", { size: "sm", onclick: showPicker }) : null },
      tgt ? el("dl", { class: "kv" }, el("dt", { text: "Address" }), el("dd", null, tgt.url ? link(tgt.url, tgt.url.replace(/^https?:\/\//, "")) : "-"), tgt.branch ? [el("dt", { text: "Branch" }), el("dd", { text: tgt.branch })] : null, tgt.admin_url || tgt.dashboard ? [el("dt", { text: "Dashboard" }), el("dd", null, link(tgt.admin_url || tgt.dashboard, `Open in ${H.name}`))] : null) : null,
      picker,
    );
    if (!tgt) showPicker();

    const parts = [el("div", { class: "grid g2" }, accountCard, targetCard)];
    if (tgt) {
      const history = el("div", { class: "section" }, deploysCard(p, d, load));
      parts.push(el("div", { class: "grid g2 section" }, deployCard(p, d, load), envCard(p, d, load)));
      parts.push(history);
      // Only the deploy history refreshes on its own, so typing in the forms above is never interrupted.
      autoRefresh(async () => {
        try {
          const fresh = await api("GET", `/api/hosting/${p}`);
          if (alive() && fresh.target) history.replaceChildren(deploysCard(p, fresh, load));
        } catch { }
      }, 10000);
    }
    body.replaceChildren(...parts);
  };
  await load();
}

function deployCard(p, d, reload) {
  const H = HOSTS[p];
  const opts = [];
  let mode = p === "vercel" ? "local" : "git";
  if (p === "netlify") {
    opts.push(["git", "Build on Netlify from GitHub", d.target.repo ? `Builds the latest commit of ${d.target.branch || "main"}. Push code first (Code page).` : "Needs the site linked to your GitHub repo in Netlify."]);
    opts.push(["local", "Build here and upload", "Runs the Netlify CLI on this computer: builds, then uploads. Works without GitHub."]);
    if (!d.target.repo) mode = "local";
  } else if (p === "vercel") {
    opts.push(["local", "Upload this folder", "Runs the Vercel CLI: uploads the project (not data/ or backups/) and Vercel builds it."]);
  } else {
    opts.push(["git", "Deploy the latest commit", "Render builds the latest commit of the connected branch."]);
  }
  const radios = el(
    "div",
    { class: "col" },
    opts.map(([v, label, hint]) =>
      el(
        "label",
        { class: "row small" },
        el("input", { type: "radio", name: `mode-${p}`, value: v, checked: v === mode, onchange: () => (mode = v) }),
        el("div", { class: "grow" }, el("div", { text: label }), el("div", { class: "tiny muted", text: hint })),
      ),
    ),
  );
  const clear = el("input", { type: "checkbox" });
  const envMissing = !(d.env || []).some((e) => e.key === "DATABASE_URL");
  const go = btn(`Deploy to ${H.name}`, { kind: "primary", icon: "rocket" });
  go.onclick = async () => {
    const ok = await confirmBox({
      title: `Deploy to ${H.name} production?`,
      lines: [`${H.target[0].toUpperCase()}${H.target.slice(1)}: ${d.target.name}`, opts.find((o) => o[0] === mode)[1], p === "netlify" ? "Uses about 15 Netlify credits." : ""].filter(Boolean),
      note: envMissing ? "DATABASE_URL is not set on this " + H.target + " yet. Use Copy settings from Supabase first, or the site will not work." : null,
      ok: "Deploy",
    });
    if (!ok) return;
    await withBusy(go, async () => {
      const r = await runJob(() => api("POST", `/api/hosting/${p}/deploy`, { mode, clear_cache: clear.checked }));
      if (r?.started === "remote") {
        toast(r.message, "info", 6000);
        setTimeout(reload, 2500);
      }
    });
  };
  return card(
    "Deploy",
    { icon: "rocket", sub: H.about },
    el("div", { class: "col" }, radios, el("label", { class: "row small muted" }, clear, "Clear the build cache"), envMissing ? notice("warn", "DATABASE_URL is missing on this " + H.target + ".") : null, el("div", { class: "row" }, go)),
  );
}

function envCard(p, d, reload) {
  const H = HOSTS[p];
  const sync = btn("Copy settings from Supabase", { kind: "primary", icon: "db" });
  sync.onclick = async () => {
    const ok = await confirmBox({
      title: `Set environment variables on ${H.name}?`,
      lines: [
        `DATABASE_URL: your Supabase ${p === "render" ? "session" : "transaction"} pooler string`,
        `DATABASE_POOL_SIZE: ${p === "render" ? 5 : 3}`,
        "CRON_SECRET: a random secret (created once, reused everywhere)",
        "MYSEED_SHOW_DEMO_ACCOUNTS: 0",
        p === "render" ? "NODE_VERSION: 22" : null,
        "Takes effect on the next deploy.",
      ].filter(Boolean),
      ok: "Set variables",
    });
    if (!ok) return;
    await withBusy(sync, async () => {
      try {
        const r = await api("POST", `/api/hosting/${p}/env/sync`);
        toast(`Set ${r.keys.length} variables. Deploy to apply them.`);
        reload();
      } catch (err) {
        fail(err);
      }
    });
  };
  const key = el("input", { type: "text", placeholder: "NAME", autocomplete: "off" });
  const value = el("input", { type: "password", placeholder: "value", autocomplete: "off" });
  const add = btn("Add", { icon: "plus" });
  add.onclick = () =>
    withBusy(add, async () => {
      try {
        await api("POST", `/api/hosting/${p}/env/set`, { key: key.value, value: value.value });
        toast(`${key.value} saved`);
        reload();
      } catch (err) {
        fail(err);
      }
    });
  const env = d.env || [];
  return card(
    "Environment variables",
    { icon: "key", sub: "Values are never shown here. Changes apply on the next deploy.", class: "", action: sync },
    env.length
      ? el(
        "div",
        { class: "list" },
        env.map((e) =>
          el(
            "div",
            { class: "list-item" },
            el("span", { class: "mono grow truncate", text: e.key }),
            el("span", { class: "tiny muted", text: (e.contexts || []).join(", ") }),
            btn("", {
              kind: "ghost",
              size: "sm icon",
              icon: "trash",
              aria: `Delete ${e.key}`,
              onclick: async () => {
                if (await confirmBox({ title: `Delete ${e.key}?`, lines: [`Removes it from ${H.name}. Applies on the next deploy.`], ok: "Delete", danger: true })) await api("POST", `/api/hosting/${p}/env/delete`, { key: e.key }).then(() => toast(`${e.key} deleted`)).catch(fail), reload();
              },
            }),
          ),
        ),
      )
      : el("div", { class: "empty", text: "No variables yet." }),
    el("div", { class: "divider" }),
    el("div", { class: "input-row" }, key, value, add),
  );
}

function deploysCard(p, d, reload) {
  const list = d.deploys || [];
  const running = (s) => !["ready", "live", "error", "build_failed", "update_failed", "canceled", "cancelled", "deactivated", "failed", "retained", "rejected", "skipped"].includes(String(s || "").toLowerCase());
  return card(
    "Deploy history",
    { icon: "clock", class: "flush", action: btn("", { kind: "ghost", size: "sm icon", icon: "refresh", aria: "Refresh", onclick: reload }) },
    list.length
      ? el(
        "div",
        { class: "table-wrap" },
        el(
          "table",
          null,
          el("thead", null, el("tr", null, el("th", { text: "State" }), el("th", { text: "Deploy" }), el("th", { text: "Context" }), el("th", { text: "When" }), el("th", { class: "num", text: "" }))),
          el(
            "tbody",
            null,
            list.map((x) =>
              el(
                "tr",
                null,
                el("td", null, deployBadge(x.state)),
                el("td", null, el("div", { class: "truncate", text: x.title || x.id }), x.error ? el("div", { class: "tiny", text: x.error }) : null),
                el("td", { class: "small muted", text: x.context || x.branch || "" }),
                el("td", { class: "nowrap small", title: when(x.created), text: ago(x.created) }),
                el(
                  "td",
                  null,
                  el(
                    "div",
                    { class: "actions" },
                    x.url ? el("a", { class: "btn sm ghost", href: x.url, target: "_blank", rel: "noreferrer noopener" }, icon("ext"), "Open") : null,
                    x.log_url ? el("a", { class: "btn sm ghost", href: x.log_url, target: "_blank", rel: "noreferrer noopener" }, icon("terminal"), "Log") : null,
                    p !== "render" && running(x.state) ? btn("Cancel", { size: "sm", kind: "danger", onclick: async () => (await api("POST", `/api/hosting/${p}/cancel`, { id: x.id }).then(() => toast("Cancel requested", "info")).catch(fail), reload()) }) : null,
                  ),
                ),
              ),
            ),
          ),
        ),
      )
      : el("div", { class: "empty", text: "No deploys yet." }),
  );
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Hostinger VPS
// ---------------------------------------------------------------------------

const act = (fn) => async () => {
  try {
    await fn();
  } catch (err) {
    fail(err);
  }
};

async function copyText(text, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(what);
  } catch {
    toast("Copy failed. Select the text and press Ctrl+C.", "bad");
  }
}

function stepCard(n, title, done, sub, ...body) {
  return el(
    "section",
    { class: "card" },
    el("div", { class: "card-head" }, el("span", { class: "step-num", text: String(n) }), el("div", { class: "grow" }, el("h3", { text: title }), sub ? el("div", { class: "card-sub", text: sub }) : null), done === null ? null : done ? badge("Done", "ok") : badge("To do", "plain")),
    ...body,
  );
}

function httpRow(name, r) {
  if (!r) return el("div", { class: "list-item static" }, el("div", { class: "grow", text: name }), badge("Not checked", "plain"));
  return el(
    "div",
    { class: "list-item static" },
    el("div", { class: "grow" }, el("div", { text: name }), el("div", { class: "tiny muted truncate", text: r.url })),
    el("span", { class: "tiny muted", text: r.ms ? `${r.ms} ms` : "" }),
    r.ok ? badge(`Up ${r.status}`, "ok") : badge(r.status ? `HTTP ${r.status}` : "Down", "bad"),
  );
}

function statusCard(st, hasDomain, onRefresh) {
  const check = btn("Check now", { size: "sm", icon: "refresh" });
  check.onclick = () =>
    withBusy(
      check,
      act(async () => {
        await api("POST", "/api/vps/status");
        onRefresh();
      }),
    );
  const srv = st && st.server;
  const http = (st && st.http) || {};
  return card(
    "Live status",
    { icon: "shield", sub: st && st.checked ? `Checked ${ago(st.checked)}` : "Checks the site's address and the server.", action: check },
    hasDomain ? el("div", { class: "list" }, httpRow("Website", http.site), httpRow("Health check", http.health)) : el("p", { class: "small muted", text: "Add a domain in step 3 to check the public address." }),
    srv
      ? srv.error
        ? notice("bad", srv.error)
        : el(
            "div",
            { class: "section" },
            el("dl", { class: "kv" }, el("dt", { text: "Release" }), el("dd", { class: "mono", text: srv.release || "-" }), el("dt", { text: "Server up" }), el("dd", { text: srv.uptime || "-" }), el("dt", { text: "Disk used" }), el("dd", { text: srv.disk || "-" }), el("dt", { text: "Memory" }), el("dd", { text: srv.memory || "-" }), el("dt", { text: "Last backup" }), el("dd", { class: "mono", text: srv.last_backup || "none yet" })),
            srv.containers && srv.containers.length ? el("div", { class: "row section" }, srv.containers.map((c) => badge(`${c.service}: ${c.health || c.state}`, c.state === "running" && c.health !== "unhealthy" ? "ok" : "bad"))) : null,
          )
      : null,
  );
}

// "Delete connection": what to take away, chosen in one dialog.
function disconnectBox(d) {
  const v = d.vps;
  return modal((close) => {
    const opt = (label, hint, checked, disabled) => {
      const input = el("input", { type: "checkbox", checked: checked && !disabled, disabled });
      return [input, el("label", { class: "row small opt-row" }, input, el("span", null, el("b", { text: label }), el("br"), el("span", { class: "muted", text: hint })))];
    };
    const [server, serverRow] = opt("Take the panel's key off the server", v.host ? `Removes it from ${v.user || "root"}@${v.host}'s authorized_keys over SSH. Other keys stay.` : "No server is linked.", true, !v.host || !v.key_installed);
    const [account, accountRow] = opt("Delete the key from my Hostinger account", d.connected ? "Removes it from hPanel, SSH keys." : "Needs the API token, which is not connected.", true, !d.connected);
    const [local, localRow] = opt("Delete the SSH key on this computer", "A new key is made the next time you connect.", false, !d.public_key);
    const word = el("input", { type: "text", placeholder: "Type DELETE to confirm", autocomplete: "off" });
    const go = el("button", { class: "btn danger solid", type: "button", disabled: true }, "Delete connection");
    word.addEventListener("input", () => (go.disabled = word.value.trim().toUpperCase() !== "DELETE"));
    go.onclick = () => close({ remove_server_key: server.checked, remove_account_key: account.checked, delete_local_key: local.checked });
    return [
      el("h2", { text: "Delete the Hostinger connection?" }),
      el("ul", null, el("li", { text: "Forgets the Hostinger API token and unlinks the VPS from this panel." }), el("li", { text: "The site on the VPS keeps running: nothing is stopped or deleted on the server." }), el("li", { text: "Your domain, database and proxy choices stay, so connecting again is quick." })),
      el("div", { class: "col opt-list" }, serverRow, accountRow, localRow),
      word,
      el("div", { class: "actions" }, btn("Cancel", { kind: "ghost", onclick: () => close(null) }), go),
    ];
  });
}

// Domain: where it points now, and one button to point it at the VPS when the DNS is at Hostinger.
function domainCard(d, reload) {
  const v = d.vps;
  const body = el("div", { class: "col" }, el("div", { class: "progress indeterminate" }, el("div")));
  const check = btn("Check again", { size: "sm", icon: "refresh" });
  const show = async () => {
    body.replaceChildren(el("div", { class: "progress indeterminate" }, el("div")));
    try {
      const st = await api("GET", "/api/vps/domain");
      if (!st.domain) return body.replaceChildren(el("p", { class: "small muted", text: "Save the domain in step 3 first." }));
      const allOk = Object.values(st.ok).every(Boolean);
      const point = btn(`Point ${st.domain} at the VPS`, {
        kind: "primary",
        size: "sm",
        icon: "right",
        disabled: !st.hostinger_dns || !st.vps_ip,
        onclick: act(async () => {
          const ok = await confirmBox({
            title: `Point ${st.domain} at ${st.vps_ip}?`,
            lines: [`Sets the A record of ${st.domain}${st.www ? " (and www)" : ""} to the VPS in Hostinger DNS.`, "Mail (MX), TXT and every other record stay as they are. Hostinger keeps a snapshot of the zone, so it can be undone in hPanel, DNS.", "The old address stops getting visitors as soon as the change spreads (5 to 30 minutes)."],
            ok: "Point it at the VPS",
          });
          if (!ok) return;
          const r = await api("POST", "/api/vps/domain/point");
          toast(r.message, "ok", 10000);
          show();
        }),
      });
      body.replaceChildren(
        el(
          "div",
          { class: "list" },
          Object.entries(st.resolves).map(([name, ips]) =>
            el(
              "div",
              { class: "list-item static" },
              el("div", { class: "grow" }, el("div", { class: "mono", text: name }), el("div", { class: "tiny muted", text: ips.length ? `points to ${ips.join(", ")}` : "has no address yet" })),
              st.ok[name] ? badge("On the VPS", "ok") : badge(ips.length ? "Elsewhere" : "Not set", "warn"),
            ),
          ),
        ),
        allOk
          ? notice("ok", `${st.domain} reaches the VPS. Caddy gets the HTTPS certificate on the next deploy or restart.`)
          : st.hostinger_dns
            ? notice("info", `The DNS for ${st.domain} is at Hostinger, so the panel can change it for you.`)
            : notice("warn", el("div", null, `The DNS for ${st.domain} is not at Hostinger (or the API token is not connected). At your DNS provider add:`), el("ul", { class: "small" }, el("li", { class: "mono", text: `A  @  ${st.vps_ip || "<VPS IP>"}` }), st.www ? el("li", { class: "mono", text: `A  www  ${st.vps_ip || "<VPS IP>"}` }) : null)),
        st.aaaa.length ? notice("warn", `There is an IPv6 (AAAA) record for ${st.aaaa.map((r) => r.name).join(" and ")}. Delete it in hPanel, DNS unless it is the VPS's IPv6 address, or some visitors reach the old address.`) : null,
        st.records.length ? el("details", { class: "small" }, el("summary", { text: "Current web records at Hostinger" }), el("ul", { class: "mono tiny" }, st.records.map((r) => el("li", { text: `${r.type}  ${r.name}  ${r.values.join(", ")}  (TTL ${r.ttl})` })))) : null,
        el("div", { class: "row" }, allOk ? null : point, st.domain ? link(`https://${st.domain}`, `Open https://${st.domain}`) : null),
      );
    } catch (err) {
      body.replaceChildren(notice("bad", err.message || String(err)));
    }
  };
  check.onclick = () => withBusy(check, show);
  show();
  return card("Domain", { icon: "cloud", sub: v.domain ? `Where ${v.domain} points, and setting it up.` : "Connect your domain to the VPS.", action: check }, body);
}

function autodeployCard(d, reload) {
  const v = d.vps;
  const a = v.autodeploy || {};
  const srv = (d.status && d.status.server) || {};
  const branch = el("input", { type: "text", value: a.branch || "main" });
  const on = !!a.enabled;
  return card(
    "Auto deploy from GitHub",
    { icon: "git", sub: on ? `On: every push to ${a.branch} goes live by itself, about 2 minutes later plus the build.` : "Every push to GitHub deploys by itself. The VPS checks GitHub every 2 minutes; nothing is opened to the internet.", action: on ? badge("On", "ok") : badge("Off", "plain") },
    el("div", { class: "grid g2" }, field("Branch", branch, "Usually main."), field("Repository", el("input", { type: "text", value: a.repo || d.repo || "(the origin of this folder)", readonly: true }))),
    srv.autodeploy_last ? el("p", { class: "tiny muted mono", text: `Last: ${srv.autodeploy_last}` }) : null,
    !v.last_deploy ? notice("warn", "Deploy once from step 4 first.") : null,
    el(
      "div",
      { class: "row" },
      btn(on ? "Save branch" : "Turn on", { kind: "primary", size: "sm", icon: "play", disabled: !v.last_deploy, onclick: () => runJob(() => api("POST", "/api/vps/autodeploy", { enabled: true, branch: branch.value })).then(reload) }),
      on ? btn("Turn off", { size: "sm", icon: "stop", onclick: () => runJob(() => api("POST", "/api/vps/autodeploy", { enabled: false })).then(reload) }) : null,
      btn("Auto deploy log", { size: "sm", kind: "ghost", icon: "terminal", disabled: !v.key_installed, onclick: () => runJob(() => api("POST", "/api/vps/autodeploy/log")) }),
    ),
    el("p", { class: "tiny muted", text: "A private repository: the first Turn on prints a deploy key in the log. Add it on GitHub (repository, Settings, Deploy keys), then press Turn on again. A failed build keeps the previous release running and waits for the next push." }),
  );
}

function dataCard(d) {
  const v = d.vps;
  const ready = !!v.last_deploy;
  return card(
    "Data between this computer, Supabase, and the VPS",
    { icon: "leftright", sub: "Each copy backs up the side it replaces first, so it can be undone from Backups." },
    !ready ? notice("warn", "Deploy the app to the VPS first.") : null,
    el(
      "div",
      { class: "row" },
      btn("Copy this computer's data to the VPS", {
        kind: "primary",
        size: "sm",
        icon: "up",
        disabled: !ready,
        onclick: async () => (await confirmBox({ title: "Replace the VPS data with this computer's?", lines: ["Backs up the local database and the VPS database, then replaces everything on the VPS with the local data.", "People using the live site lose what they changed since your local copy."], word: "VPS", ok: "Copy to the VPS", danger: true })) && runJob(() => api("POST", "/api/vps/data/push")),
      }),
      btn("Copy the VPS data to this computer", {
        size: "sm",
        icon: "down",
        disabled: !ready,
        onclick: async () => (await confirmBox({ title: "Replace this computer's data with the VPS's?", lines: ["Downloads a backup of the VPS database, backs up the local database, then replaces the local data with it."], ok: "Copy to this computer", danger: true })) && runJob(() => api("POST", "/api/vps/data/pull")),
      }),
      btn("Pull Supabase into VPS", {
        size: "sm",
        icon: "down",
        disabled: !ready,
        onclick: async () => (await confirmBox({ title: "Pull from Supabase into Hostinger VPS?", lines: ["Pulls configurations and user accounts from Supabase into your Hostinger VPS database.", "Excludes workspace config (cfg.workspace) to preserve your Hostinger site settings.", "Both databases will be backed up before the transfer."], word: "PULL", ok: "Pull to Hostinger VPS", danger: true })) && runJob(() => api("POST", "/api/vps/data/pull_supabase", { mode: "accounts_and_config" })),
      }),
      btn("Back up VPS database", {
        size: "sm",
        icon: "archive",
        disabled: !ready,
        onclick: () => runJob(() => api("POST", "/api/vps/backup")),
      }),
    ),
    el("p", { class: "tiny muted", text: "The local database can only be open in one program: stop npm run dev in a terminal first (the panel stops its own dev server for you)." }),
  );
}

async function pageVps(root, alive) {
  let machines = null;
  let facts = null;

  const load = async () => {
    const d = await api("GET", "/api/vps");
    if (!alive()) return;
    const v = d.vps;

    // Step 1: the server.
    const token = el("input", { type: "password", placeholder: d.token ? `Saved (${d.token})` : "Paste the API token", autocomplete: "off" });
    const connect = btn(d.connected ? "Load my VPS list" : "Connect", { kind: "primary", size: "sm" });
    connect.onclick = () =>
      withBusy(
        connect,
        act(async () => {
          machines = (token.value.trim() ? await api("POST", "/api/vps/token", { token: token.value.trim() }) : await api("GET", "/api/vps/machines")).machines;
          if (!machines.length) toast("No VPS found in this Hostinger account.", "info");
          load();
        }),
      );
    const machineList = machines
      ? el(
          "div",
          { class: "list" },
          machines.map((mc) =>
            el(
              "div",
              { class: "list-item static" },
              el("div", { class: "grow" }, el("div", { class: "truncate", text: `${mc.hostname || "VPS " + mc.id} · ${mc.ipv4.join(", ") || "no IPv4"}` }), el("div", { class: "tiny muted", text: `${mc.plan || ""} · ${mc.os || "no OS"} · ${mc.cpus || "?"} CPU · ${Math.round((mc.memory_mb || 0) / 1024)} GB RAM · ${mc.state || ""}` })),
              v.vm_id === mc.id ? badge("Chosen", "ok") : btn("Use this", { size: "sm", onclick: act(async () => (await api("POST", "/api/vps/select", { id: mc.id }), toast("VPS chosen"), load())) }),
            ),
          ),
        )
      : null;
    const host = el("input", { type: "text", value: v.host || "", placeholder: "187.33.12.45" });
    const user = el("input", { type: "text", value: v.user || "root" });
    const sshPort = el("input", { type: "number", value: v.ssh_port || 22, min: "1", max: "65535" });
    const path = el("input", { type: "text", value: v.path || "/opt/myseed-content-manager" });
    const saveServer = btn("Save server", { size: "sm" });
    saveServer.onclick = () => withBusy(saveServer, act(async () => (await api("POST", "/api/vps/server", { host: host.value, user: user.value, ssh_port: Number(sshPort.value), path: path.value }), toast("Server saved"), load())));

    // Step 2: the key.
    const keyBox = d.public_key ? [el("textarea", { class: "mono tiny", rows: "3", readonly: true, value: d.public_key }), el("p", { class: "tiny muted" }, "The panel's key ends in ", el("b", { class: "mono", text: `…${d.key_tail}` }), ". The key on the server must end the same way; after New key, add the new one again.")] : null;
    const test = btn("Test connection", { kind: "primary", size: "sm", icon: "terminal", disabled: !v.host || !d.public_key });
    test.onclick = () => withBusy(test, act(async () => ((facts = (await api("POST", "/api/vps/test")).facts), toast("Connected to the server"), load())));
    const keyActions = d.public_key
      ? el(
          "div",
          { class: "row" },
          btn("Copy key", { size: "sm", onclick: () => copyText(d.public_key, "Public key copied") }),
          v.vm_id && d.connected ? btn("Add with Hostinger API", { size: "sm", kind: "primary", onclick: act(async () => { const r = await api("POST", "/api/vps/key/install"); toast(r.message, r.installed ? "ok" : "info", 9000); load(); }) }) : null,
          v.host
            ? btn("Add with the server password", {
                size: "sm",
                icon: "key",
                onclick: act(async () => {
                  const pw = await promptBox({ title: `Add the key to ${v.user || "root"}@${v.host}`, label: "Server password", secret: true, ok: "Add the key", hint: "The root password from hPanel (VPS, Settings, Root password). Used for this one sign-in only, never saved." });
                  if (!pw) return;
                  toast((await api("POST", "/api/vps/key/install-password", { password: pw })).message, "info");
                  facts = (await api("POST", "/api/vps/test")).facts;
                  toast("Connected to the server");
                  load();
                }),
              })
            : null,
          test,
          btn("New key", {
            size: "sm",
            kind: "ghost",
            onclick: act(async () => {
              if (!(await confirmBox({ title: "Replace the SSH key?", lines: ["The old key stops working for this panel. You will have to add the new one to the server."], ok: "Replace", danger: true }))) return;
              await api("POST", "/api/vps/key/generate", { replace: true });
              load();
            }),
          }),
        )
      : el("div", { class: "row" }, btn("Create the panel's SSH key", { kind: "primary", size: "sm", icon: "key", onclick: act(async () => (await api("POST", "/api/vps/key/generate", {}), load())) }));

    // Step 3: the site's settings.
    const domain = el("input", { type: "text", value: v.domain || "", placeholder: "content.myseed.com" });
    const dbSel = el("select", null, el("option", { value: "local", text: "Postgres on the VPS (new, private to this server)" }), el("option", { value: "supabase", text: "Supabase (the session pooler from the Database page)" }));
    dbSel.value = v.database || "local";
    const proxySel = el("select", null, el("option", { value: "caddy", text: "Caddy on ports 80 and 443 with automatic HTTPS" }), el("option", { value: "none", text: "Use the web server I already have (another site runs here)" }));
    proxySel.value = v.proxy || "caddy";
    const appPort = el("input", { type: "number", value: v.app_port || 3100, min: "1024", max: "65535" });
    const www = el("input", { type: "checkbox", checked: v.www !== false });
    const extra = el("textarea", { class: "mono tiny", rows: "4", placeholder: d.extra_env ? `Saved: ${d.extra_env_keys.join(", ")}. Type new lines to replace them.` : "Optional, one per line, for example:\nSMTP_HOST=smtp.example.com\nANTHROPIC_API_KEY=sk-...", autocomplete: "off" });
    const saveSettings = btn("Save settings", { size: "sm", kind: "primary" });
    saveSettings.onclick = () =>
      withBusy(
        saveSettings,
        act(async () => {
          await api("POST", "/api/vps/settings", { domain: domain.value, database: dbSel.value, proxy: proxySel.value, app_port: Number(appPort.value), www: www.checked, ...(extra.value.trim() ? { extra_env: extra.value } : {}) });
          toast("Settings saved. They reach the server with the next deploy, or press Send settings now.");
          load();
        }),
      );
    const settingsOk = !!(v.domain || v.proxy === "none") && (v.database !== "supabase" || d.supabase_ready);

    const setupBtn = btn(v.setup_done ? "Run setup again" : "Prepare the server", { kind: v.setup_done ? "" : "primary", icon: "server", disabled: !v.key_installed });
    setupBtn.onclick = async () => {
      const ok = await confirmBox({
        title: "Prepare the server?",
        lines: ["Installs Docker and the Compose plugin, adds 2 GB of swap for the build, opens SSH" + (proxySel.value === "caddy" ? ", HTTP and HTTPS" : "") + " in the firewall, and schedules a daily backup and the app's scheduled checks.", "If another site already uses ports 80 and 443 it stops and tells you; choose \"Use the web server I already have\" then.", "Safe to run again. Takes 2 to 5 minutes."],
        ok: "Prepare the server",
      });
      if (ok) runJob(() => api("POST", "/api/vps/setup")).then(load);
    };

    // Step 4: deploy.
    const ready = v.key_installed && v.setup_done && settingsOk;
    const wip = el("input", { type: "checkbox" });
    const deployBtn = btn("Build and deploy", { kind: "primary", icon: "rocket", disabled: !ready });
    deployBtn.onclick = async () => {
      const ok = await confirmBox({ title: "Deploy to the VPS?", lines: [`Packages ${wip.checked ? "this folder, with uncommitted changes," : "the last commit"} of ${d.project}`, "Uploads it, builds it on the server (several minutes the first time), then switches over after /api/health answers. If it does not, the previous release keeps running."], ok: "Deploy" });
      if (ok) runJob(() => api("POST", "/api/vps/deploy", { include_changes: wip.checked })).then(load);
    };
    const logsSel = el("select", { class: "fit" }, ["app", "postgres", "caddy"].map((s) => el("option", { value: s, text: s })));
    const restoreBtn = btn("Restore a backup", {
      size: "sm",
      icon: "up",
      disabled: !v.last_deploy,
      onclick: act(async () => {
        const list = (await api("GET", "/api/backups")).backups.filter((b) => b.restorable);
        if (!list.length) return toast("No backups on this computer yet. Make one on the Backups page.", "info");
        const choice = await modal((close) => {
          const sel = el("select", null, list.map((b) => el("option", { value: b.file, text: `${b.file} (${bytes(b.size)}, ${ago(b.modified)})` })));
          return [
            el("h2", { text: "Restore a backup onto the VPS" }),
            el("p", { class: "small muted", text: "Replaces all data in the VPS database. The server makes a safety backup first." }),
            field("Backup", sel),
            el("div", { class: "actions" }, btn("Cancel", { kind: "ghost", onclick: () => close(null) }), btn("Restore", { kind: "danger solid", onclick: () => close(sel.value) })),
          ];
        });
        if (choice) runJob(() => api("POST", "/api/vps/restore", { file: choice }));
      }),
    });

    const disconnect = btn("Delete connection", {
      size: "sm",
      kind: "danger",
      icon: "trash",
      disabled: !d.connected && !v.host && !d.public_key,
      onclick: act(async () => {
        const choice = await disconnectBox(d);
        if (!choice) return;
        const r = await api("POST", "/api/vps/disconnect", choice);
        machines = null;
        facts = null;
        toast(r.done.join(" "), "ok", 9000);
        for (const w of r.warnings) toast(w, "bad", 9000);
        load();
      }),
    });

    root.replaceChildren(
      pageHead("Hostinger VPS", `Deploys ${d.project}. Four steps the first time; after that only step 4.`, disconnect),
      el(
        "div",
        { class: "col" },
        stepCard(
          1,
          "Choose the VPS",
          !!v.host,
          "A Hostinger KVM plan with Ubuntu 24.04. KVM 2 (8 GB RAM) is comfortable; KVM 1 works with the swap that step 3 adds.",
          el(
            "div",
            { class: "grid g2" },
            el(
              "div",
              { class: "col" },
              el("h3", { class: "small", text: "Automatic (recommended)" }),
              el("p", { class: "small muted" }, "In hPanel open your profile, then ", el("b", { text: "Account information, API" }), ". Create a token and paste it here. ", link("https://hpanel.hostinger.com/profile/api", "Open hPanel API")),
              el("div", { class: "input-row" }, token, connect),
              d.connected ? el("div", { class: "row" }, badge(`Connected (${d.token})`, "ok"), btn("Forget token", { size: "sm", kind: "ghost", onclick: act(async () => (await api("POST", "/api/vps/token/forget"), (machines = null), load())) })) : null,
              machineList,
            ),
            el("div", { class: "col" }, el("h3", { class: "small", text: "By hand" }), el("p", { class: "small muted", text: "Copy the IP address from hPanel, VPS, Overview. Hostinger's default user is root." }), field("Server IP or host name", host), el("div", { class: "grid g2" }, field("User", user), field("SSH port", sshPort)), field("App folder on the server", path, "Its own folder, so another site on the same VPS is never touched."), el("div", { class: "row" }, saveServer)),
          ),
          v.host ? el("p", { class: "small muted" }, "Linked: ", el("b", { text: `${v.user || "root"}@${v.host}` }), v.hostname ? ` (${v.hostname}${v.plan ? ", " + v.plan : ""})` : "") : null,
        ),
        stepCard(
          2,
          "Install the panel's SSH key",
          !!v.key_installed,
          "The panel signs in with its own key, so no server password is stored. The private key stays on this computer, outside OneDrive, and is separate from any other project's panel.",
          keyBox,
          keyActions,
          d.public_key && !v.key_installed
            ? notice("info", el("div", null, "No API token? Add the key yourself:"), el("ol", { class: "small" }, el("li", null, "hPanel, VPS, ", el("b", { text: "Settings, SSH keys, Add SSH key" }), ": paste the key above."), el("li", null, "Or open the VPS ", el("b", { text: "Browser terminal" }), " in hPanel and paste this command: ", btn("Copy command", { size: "sm", onclick: () => copyText(d.install_command, "Command copied") }))), el("div", { class: "small" }, "Then press Test connection."))
            : null,
          facts ? el("dl", { class: "kv section" }, Object.entries(facts).map(([k, val]) => [el("dt", { text: k }), el("dd", { text: val })])) : null,
        ),
        stepCard(
          3,
          "Site settings and the server",
          !!v.setup_done && settingsOk,
          "Where the site answers, where its data lives, then prepare the server once.",
          el("div", { class: "grid g2" }, el("div", { class: "col" }, field("Domain", domain, "The Domain card below points it at the VPS. Caddy gets the HTTPS certificate."), el("label", { class: "row small" }, www, "Also www.<domain>")), field("Database", dbSel, d.supabase_ready ? "Supabase is connected on the Database page." : "Supabase needs the session pooler string on the Database page.")),
          el("div", { class: "grid g2 section" }, field("Web server", proxySel), field("App port on the server", appPort, "Only on 127.0.0.1. With your own web server, send the domain to this port.")),
          field("More settings for the app (encrypted here, sent over SSH)", extra, d.extra_env ? `Saved: ${d.extra_env_keys.join(", ")}` : "Email (SMTP_*), the AI key, Google sign-in and the like. Most can also be set inside the app."),
          el(
            "div",
            { class: "row" },
            saveSettings,
            d.extra_env ? btn("Clear the extra settings", { size: "sm", kind: "ghost", onclick: act(async () => (await api("POST", "/api/vps/settings", { extra_env: "__clear__" }), load())) }) : null,
          ),
          el("div", { class: "divider" }),
          !v.key_installed ? notice("warn", "Finish step 2 first.") : null,
          el("div", { class: "row" }, setupBtn, btn("Send settings now", { size: "sm", icon: "up", disabled: !v.key_installed || !settingsOk, onclick: () => runJob(() => api("POST", "/api/vps/push-env")) })),
        ),
        stepCard(
          4,
          "Build and deploy",
          !!v.last_deploy,
          v.last_deploy ? `Live: ${v.last_deploy.release}, ${ago(v.last_deploy.at)}.` : "Uploads the code, builds on the server and switches over after a health check. If the new release does not start, the previous one keeps running.",
          !ready ? notice("warn", "Finish steps 1 to 3 first.") : null,
          el("div", { class: "row" }, deployBtn, el("label", { class: "row small muted" }, wip, "Include uncommitted changes"), d.url ? link(d.url, "Open the site") : null),
          el("div", { class: "divider" }),
          el(
            "div",
            { class: "row" },
            btn("Roll back", { size: "sm", icon: "leftright", disabled: !v.last_deploy, onclick: async () => (await confirmBox({ title: "Go back to the previous release?", lines: ["Starts the release before the current one. The database is not rolled back."], ok: "Roll back", danger: true })) && runJob(() => api("POST", "/api/vps/rollback")) }),
            btn("Restart app", { size: "sm", icon: "refresh", disabled: !v.last_deploy, onclick: () => runJob(() => api("POST", "/api/vps/restart")) }),
            btn("Back up and download", { size: "sm", icon: "archive", disabled: !v.last_deploy, onclick: () => runJob(() => api("POST", "/api/vps/backup")) }),
            restoreBtn,
            el("span", { class: "right" }),
            logsSel,
            btn("Show log", { size: "sm", icon: "terminal", disabled: !v.key_installed, onclick: () => runJob(() => api("POST", "/api/vps/logs", { service: logsSel.value, lines: 300 })) }),
            v.vm_id && d.connected
              ? btn("Reboot VPS", {
                  size: "sm",
                  kind: "danger",
                  icon: "power",
                  onclick: act(async () => {
                    if (!(await confirmBox({ title: "Reboot the VPS?", lines: ["Every site on it is offline for about a minute while it restarts. The containers start again by themselves."], ok: "Reboot", danger: true }))) return;
                    await api("POST", "/api/vps/reboot");
                    toast("Hostinger is restarting the VPS", "info");
                  }),
                })
              : null,
          ),
        ),
        domainCard(d, load),
        autodeployCard(d, load),
        dataCard(d),
        statusCard(d.status, !!d.url, load),
      ),
    );
  };
  await load();
}

async function pageGit(root, alive) {
  const load = async (info) => {
    const g = info || (await api("GET", "/api/git"));
    if (!alive()) return;
    if (!g.available) return root.replaceChildren(pageHead("Code (GitHub)"), notice("warn", "Git was not found, or this folder is not a Git repository."));
    const fetchBtn = btn("Fetch", { icon: "refresh" });
    fetchBtn.onclick = () => withBusy(fetchBtn, async () => load(await api("POST", "/api/git/fetch").catch((e) => (fail(e), null))));
    const msg = el("textarea", { placeholder: "Describe the change, for example: Update curriculum for Grade 9", rows: "2" });
    const push = btn("Commit and push", { kind: "primary", icon: "up", disabled: !g.changes.length && !g.ahead });
    push.onclick = async () => {
      if (!msg.value.trim() && g.changes.length) return toast("Write a commit message first.", "bad");
      const ok = await confirmBox({
        title: "Commit and push to GitHub?",
        lines: [`${g.changes.length} changed file(s) on ${g.branch} → ${g.upstream || "origin"}`, "Netlify or Render rebuild automatically if they are linked to this branch."],
        ok: "Commit and push",
      });
      if (ok) {
        await runJob(() => (g.changes.length ? api("POST", "/api/git/commit-push", { message: msg.value }) : api("POST", "/api/git/commit-push", { message: "" })));
        setTimeout(() => load(), 4000);
      }
    };
    const statusTone = { M: "info", A: "ok", D: "bad", "??": "violet", R: "warn" };
    root.replaceChildren(
      pageHead("Code (GitHub)", "Send your code changes to GitHub. Hosts linked to the repository deploy from there.", fetchBtn, btn("Pull", { icon: "down", onclick: () => runJob(() => api("POST", "/api/git/pull")) })),
      el(
        "div",
        { class: "grid g3" },
        card("Branch", { icon: "git" }, el("div", { class: "stat", text: g.branch }), el("div", { class: "small muted truncate", text: g.remote || "No remote" })),
        card("Ahead / behind", { icon: "leftright" }, el("div", { class: "stat", text: `${g.ahead} / ${g.behind}` }), el("div", { class: "small muted", text: g.upstream ? `Compared with ${g.upstream} (last fetch)` : "No upstream branch" })),
        card("Changed files", { icon: "list" }, el("div", { class: "stat", text: String(g.changes.length) }), el("div", { class: "small muted", text: g.changes.length ? "Not committed yet" : "Working tree clean" })),
      ),
      el(
        "div",
        { class: "grid g2 section" },
        card(
          "Commit and push",
          { icon: "up" },
          el("div", { class: "col" }, field("Commit message", msg), g.behind ? notice("warn", `GitHub has ${g.behind} newer commit(s). Pull first to avoid a rejected push.`) : null, el("div", { class: "row" }, push)),
          g.changes.length
            ? el(
              "div",
              { class: "list section" },
              g.changes.slice(0, 60).map((c) => el("div", { class: "list-item" }, badge(c.status, statusTone[c.status] || "plain", "plain"), el("span", { class: "mono small truncate grow", text: c.file }))),
              g.changes.length > 60 ? el("div", { class: "tiny muted", text: `and ${g.changes.length - 60} more` }) : null,
            )
            : null,
        ),
        card(
          "Recent commits",
          { icon: "clock", class: "flush" },
          el(
            "div",
            { class: "list" },
            g.log.map((c) => el("div", { class: "list-item" }, el("span", { class: "mono tiny faint", text: c.hash }), el("div", { class: "grow" }, el("div", { class: "truncate", text: c.subject }), el("div", { class: "tiny muted", text: `${c.author} · ${ago(c.date)}` })))),
          ),
        ),
      ),
    );
  };
  await load();
}

// ---------------------------------------------------------------------------
// Local app
// ---------------------------------------------------------------------------

async function pageLocal(root, alive) {
  const TASKS = [
    ["dev", "Dev server", "npm run dev · http://localhost:3020 with hot reload. Uses the local database.", "play", true],
    ["start", "Production server", "npm run start · runs the last production build locally.", "server", true],
    ["build", "Production build", "npm run build · the same build the hosts run. Catches errors before deploying.", "rocket"],
    ["typecheck", "Type check", "npm run typecheck · finds TypeScript errors.", "check"],
    ["verify", "Verification suite", "npm run verify · runs the workflow checks against a throwaway database.", "shield"],
    ["status", "Database row counts", "npm run db:status · counts rows in the local database.", "db"],
    ["templates", "Import templates", "npm run templates · rewrites the Excel and CSV templates.", "archive"],
    ["install", "Install packages", "npm install · after pulling code that changed dependencies.", "dl"],
  ];
  const load = async () => {
    const { jobs } = await api("GET", "/api/jobs");
    if (!alive()) return;
    const runningFor = (title) => jobs.find((j) => j.title === title && (j.state === "running" || j.state === "starting"));
    const lastFor = (title) => jobs.find((j) => j.title === title);
    const titles = { dev: "Local dev server", start: "Local production server", build: "Production build", typecheck: "Type check", verify: "Workflow verification suite", status: "Local database row counts", templates: "Regenerate import templates", install: "Install packages" };
    root.replaceChildren(
      pageHead("Local app", "Run the app and the project's checks on this computer. Everything runs in the background and keeps running when you close this tab."),
      el(
        "div",
        { class: "grid g2" },
        TASKS.map(([key, name, desc, ic, service]) => {
          const run = runningFor(titles[key]);
          const last = lastFor(titles[key]);
          return card(
            name,
            { icon: ic, sub: desc, action: run ? badge(service ? "Running" : "Working", "info live") : last ? jobBadge(last.state) : null },
            el(
              "div",
              { class: "row" },
              run
                ? [
                  service ? btn("Open", { kind: "primary", size: "sm", icon: "ext", onclick: () => window.open(run.url || "http://localhost:3020", "_blank", "noopener") }) : null,
                  btn("Log", { size: "sm", icon: "terminal", onclick: () => openJob(run.id) }),
                  btn("Stop", { kind: "danger", size: "sm", icon: "stop", onclick: async () => (await api("POST", `/api/jobs/${run.id}/cancel`).catch(fail), load()) }),
                ]
                : [btn(service ? "Start" : "Run", { kind: "primary", size: "sm", icon: "play", onclick: async () => (await runJob(() => api("POST", `/api/local/${key}`), { open: !service }), load()) }), last ? btn("Last log", { size: "sm", kind: "ghost", onclick: () => openJob(last.id) }) : null],
              last && !run ? el("span", { class: "tiny muted right", text: ago(last.finished || last.created) }) : null,
            ),
          );
        }),
      ),
    );
  };
  await load();
  autoRefresh(load, 4000);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

async function pageJobs(root, alive) {
  let filter = "all";
  const load = async () => {
    const { jobs } = await api("GET", "/api/jobs");
    if (!alive()) return;
    const groups = { all: () => true, running: (j) => ["running", "starting"].includes(j.state), failed: (j) => ["failed", "interrupted"].includes(j.state), done: (j) => j.state === "succeeded" };
    const shown = jobs.filter(groups[filter]);
    root.replaceChildren(
      pageHead("Jobs and logs", "Every long task runs as a background job with a full log. Jobs survive closing the browser and restarting the panel; only Stop or Stop and exit ends them."),
      el(
        "div",
        { class: "tabs" },
        [["all", "All"], ["running", "Running"], ["failed", "Failed"], ["done", "Done"]].map(([k, l]) => el("button", { class: filter === k ? "active" : "", onclick: () => ((filter = k), load()) }, `${l} (${jobs.filter(groups[k]).length})`)),
      ),
      card(
        null,
        { class: "flush" },
        shown.length
          ? el(
            "div",
            { class: "table-wrap" },
            el(
              "table",
              null,
              el("thead", null, el("tr", null, el("th", { text: "State" }), el("th", { text: "Job" }), el("th", { text: "Started" }), el("th", { text: "Duration" }), el("th", { class: "num", text: "" }))),
              el(
                "tbody",
                null,
                shown.map((j) => {
                  const active = ["running", "starting"].includes(j.state);
                  return el(
                    "tr",
                    null,
                    el("td", null, jobBadge(j.state)),
                    el("td", null, el("div", { text: j.title }), el("div", { class: "tiny muted truncate", text: j.message || (active ? `Step ${(j.step || 0) + 1} of ${j.steps.length}: ${j.steps[j.step || 0] || ""}` : j.steps.join(" → ")) })),
                    el("td", { class: "nowrap small", title: when(j.created), text: ago(j.created) }),
                    el("td", { class: "nowrap small", text: between(j.started || j.created, j.finished) }),
                    el(
                      "td",
                      null,
                      el(
                        "div",
                        { class: "actions" },
                        btn("Log", { size: "sm", icon: "terminal", onclick: () => openJob(j.id) }),
                        active
                          ? btn("Stop", { size: "sm", kind: "danger", icon: "stop", onclick: async () => (await api("POST", `/api/jobs/${j.id}/cancel`).catch(fail), load()) })
                          : btn("", { size: "sm icon", kind: "ghost", icon: "trash", aria: "Delete", onclick: async () => (await api("POST", `/api/jobs/${j.id}/delete`).catch(fail), load()) }),
                      ),
                    ),
                  );
                }),
              ),
            ),
          )
          : el("div", { class: "empty" }, icon("list"), el("div", { text: "Nothing here." })),
      ),
    );
  };
  await load();
  autoRefresh(load, 3000);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function pageSettings(root, alive) {
  const s = await api("GET", "/api/settings");
  if (!alive()) return;
  const save = async (patch, msg = "Saved") => {
    try {
      Object.assign(s, await api("POST", "/api/settings", patch));
      toast(msg);
    } catch (err) {
      fail(err);
    }
  };
  const setting = (title, desc, control) => el("div", { class: "setting" }, el("div", { class: "grow" }, el("h3", { text: title }), el("p", { text: desc })), control);

  const cur = el("input", { type: "password", placeholder: "Current password", autocomplete: "current-password" });
  const nw = el("input", { type: "password", placeholder: "New password (8+ characters)", autocomplete: "new-password" });
  const change = btn("Change password", { icon: "key" });
  change.onclick = () =>
    withBusy(change, async () => {
      try {
        await api("POST", "/api/password", { current: cur.value, new: nw.value });
        cur.value = nw.value = "";
        toast("Password changed. Other sessions were signed out.");
      } catch (err) {
        fail(err);
      }
    });

  const hours = el("input", { type: "number", min: "1", max: "720", value: s.auto_backup.hours });
  const keep = el("input", { type: "number", min: "1", max: "365", value: s.auto_backup.keep });
  const saveAuto = btn("Save schedule", { size: "sm" });
  saveAuto.onclick = () => save({ auto_backup: { ...s.auto_backup, hours: Number(hours.value), keep: Number(keep.value) } });
  const jobsKeep = el("input", { type: "number", min: "10", max: "500", value: s.jobs_keep });
  const port = el("input", { type: "number", min: "1024", max: "65535", value: s.port });

  root.replaceChildren(
    pageHead("Settings", "How the panel behaves on this computer."),
    el(
      "div",
      { class: "grid g2" },
      card(
        "Security",
        { icon: "shield" },
        el("dl", { class: "kv" }, el("dt", { text: "Secrets" }), el("dd", { text: s.encryption }), el("dt", { text: "Listening on" }), el("dd", { text: `127.0.0.1:${s.port} (this computer only)` }), el("dt", { text: "Stored in" }), el("dd", { class: "mono", text: s.state_dir })),
        el("div", { class: "divider" }),
        el("div", { class: "col" }, cur, nw, el("div", { class: "row" }, change)),
      ),
      card(
        "Automatic Supabase backups",
        { icon: "clock", sub: "While the panel runs, it saves a Supabase snapshot on a schedule and keeps the newest ones." },
        setting("Back up automatically", "Needs the Supabase session pooler string.", switchEl(s.auto_backup.enabled, (v) => save({ auto_backup: { ...s.auto_backup, enabled: v } }, v ? "Automatic backups on" : "Automatic backups off"))),
        el("div", { class: "grid g2" }, field("Every (hours)", hours), field("Keep (newest)", keep)),
        el("div", { class: "row section" }, saveAuto),
      ),
      card(
        "Startup",
        { icon: "power" },
        setting("Start when I sign in to Windows", "Starts the panel in the background (no browser window) each time you sign in.", s.startup_available ? switchEl(s.startup, (v) => save({ startup: v }, v ? "The panel will start at sign-in" : "Removed from startup")) : badge("Windows only", "plain")),
        setting("Open the browser when starting", "When you run control_panel.py.", switchEl(s.open_browser, (v) => save({ open_browser: v }))),
        el("div", { class: "grid g2 section" }, field("Job history to keep", jobsKeep), field("Port", port, "Takes effect after a restart.")),
        el("div", { class: "row section" }, btn("Save", { size: "sm", onclick: () => save({ jobs_keep: Number(jobsKeep.value), port: Number(port.value) }) })),
      ),
      card(
        "Exit",
        { icon: "power", sub: "Closing the browser never stops anything. Use these to shut down." },
        setting(
          "Exit the panel, keep jobs running",
          "Stops this web panel only. Running jobs (for example the dev server or a deploy) carry on; start the panel again to see them.",
          btn("Exit panel", {
            size: "sm",
            onclick: async () => {
              if (!(await confirmBox({ title: "Exit the panel only?", lines: [`${S.running.length} running job(s) keep running.`], ok: "Exit panel" }))) return;
              await api("POST", "/api/shutdown", { stop_jobs: false }).then(() => showStopped("Jobs are still running in the background.")).catch(fail);
            },
          }),
        ),
        setting("Stop everything and exit", "Stops every running job and the panel.", btn("Stop and exit", { size: "sm", kind: "danger", icon: "power", onclick: stopAndExit })),
      ),
    ),
  );
}

boot();
