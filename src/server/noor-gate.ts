import { get, nowIso, parseJson, run } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

// Noor's protection. Noor's server is fragile (it went down under a run of heavy page reads), so every request this
// app sends to Noor's address passes one gate:
//  - one request at a time, a gap between requests (longer after a heavy page), and a ceiling per minute;
//  - a short queue: requests that would wait too long are refused at once, not piled up;
//  - after a few errors or timeouts in a row, every Noor call pauses for a while (and Admin can stop them all);
//  - reading Noor live is for Admin and the people Admin grants it to; everyone else works from the copy collected
//    in this app (the saved tables, the day cache, the content read before), and pages say so;
//  - automatic reads (scheduled syncs, nightly figures, the mirror, scheduled reports) are off unless Admin turns
//    them on, and they go through the same gate.
// The gate sits on fetch itself for Noor's address, so every part of the app is covered, including parts added later.

export type NoorGateConfig = {
  maxPerMinute: number;
  gapSeconds: number;
  heavyGapSeconds: number;
  heavyBytes: number;
  queueLimit: number;
  waitSeconds: number;
  errorsToPause: number;
  pauseMinutes: number;
  automatic: boolean;
  grants: string[];
};
export const NOOR_GATE_DEFAULTS: NoorGateConfig = { maxPerMinute: 12, gapSeconds: 3, heavyGapSeconds: 20, heavyBytes: 1_500_000, queueLimit: 8, waitSeconds: 90, errorsToPause: 2, pauseMinutes: 15, automatic: false, grants: [] };
const KEY = "noor.gate";
const PAUSE_KEY = "noor.gate.pausedUntil";

const n = (v: unknown, d: number, lo: number, hi: number) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? d : Math.min(hi, Math.max(lo, Number(v))));
function clean(c: Partial<NoorGateConfig>): NoorGateConfig {
  const d = NOOR_GATE_DEFAULTS;
  return {
    maxPerMinute: Math.round(n(c.maxPerMinute, d.maxPerMinute, 1, 60)),
    gapSeconds: n(c.gapSeconds, d.gapSeconds, 0.5, 120),
    heavyGapSeconds: n(c.heavyGapSeconds, d.heavyGapSeconds, 1, 600),
    heavyBytes: Math.round(n(c.heavyBytes, d.heavyBytes, 100_000, 50_000_000)),
    queueLimit: Math.round(n(c.queueLimit, d.queueLimit, 1, 50)),
    waitSeconds: Math.round(n(c.waitSeconds, d.waitSeconds, 10, 600)),
    errorsToPause: Math.round(n(c.errorsToPause, d.errorsToPause, 1, 10)),
    pauseMinutes: Math.round(n(c.pauseMinutes, d.pauseMinutes, 1, 24 * 60)),
    automatic: c.automatic === true,
    grants: [...new Set((Array.isArray(c.grants) ? c.grants : []).map(String).filter((x) => /^[\w-]{1,80}$/.test(x)))].slice(0, 500),
  };
}

let cfgCache: { at: number; value: NoorGateConfig; origin: string | null } | null = null;
async function load() {
  if (cfgCache && Date.now() - cfgCache.at < 15_000) return cfgCache;
  const value = clean(parseJson<Partial<NoorGateConfig>>(await getMetaSafe(KEY), {}));
  let origin: string | null = null;
  try {
    const cfg = parseJson<{ baseUrl?: string }>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'"))?.value, {});
    origin = cfg.baseUrl ? new URL(cfg.baseUrl).origin : null;
  } catch {}
  cfgCache = { at: Date.now(), value, origin };
  return cfgCache;
}
async function getMetaSafe(key: string) {
  try {
    return await (await import("./settings")).getMeta(key);
  } catch {
    return null;
  }
}
export async function noorGateConfig() {
  return (await load()).value;
}
export function forgetNoorGateConfig() {
  cfgCache = null;
}

// --- The gate ------------------------------------------------------------------------------

type Log = { at: string; method: string; path: string; status: number; ms: number; bytes: number | null; note?: string };
const state = {
  chain: Promise.resolve() as Promise<unknown>,
  waiting: 0,
  lastEnd: 0,
  nextGapMs: 0,
  starts: [] as number[],
  errors: 0,
  pausedUntil: 0,
  pauseReason: "",
  pauseLoaded: false,
  log: [] as Log[],
};
const remember = (l: Log) => {
  state.log.unshift(l);
  if (state.log.length > 40) state.log.length = 40;
};

export class NoorBusyError extends Error {}

async function pausedUntil() {
  if (!state.pauseLoaded) {
    state.pauseLoaded = true;
    const p = parseJson<{ until?: number; reason?: string }>(await getMetaSafe(PAUSE_KEY), {});
    if (p.until && p.until > Date.now()) (state.pausedUntil = p.until), (state.pauseReason = p.reason ?? "");
  }
  return state.pausedUntil;
}
async function pause(ms: number, reason: string) {
  state.pausedUntil = Date.now() + ms;
  state.pauseReason = reason;
  state.pauseLoaded = true;
  try {
    await (await import("./settings")).setMeta(PAUSE_KEY, JSON.stringify({ until: state.pausedUntil, reason }));
  } catch {}
}
const at = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Runs one request to Noor through the gate.
export async function throughNoorGate<T extends Response>(label: { method: string; path: string }, send: () => Promise<T>): Promise<T> {
  const cfg = (await load()).value;
  const p = await pausedUntil();
  if (p > Date.now()) throw new NoorBusyError(`Noor calls are paused until ${at(p)} (Addis time)${state.pauseReason ? `: ${state.pauseReason}` : ""}. The saved copy is used meanwhile.`);
  if (state.waiting >= cfg.queueLimit) throw new NoorBusyError("Noor is busy here: too many requests are waiting for it. Try again in a minute.");
  state.waiting++;
  const enqueued = Date.now();
  const turn = state.chain.then(async () => {
    // Its turn: the gap after the last request, and the ceiling per minute.
    for (;;) {
      if (Date.now() - enqueued > cfg.waitSeconds * 1000) throw new NoorBusyError("Noor is busy here: this request waited too long and was dropped. Try again shortly.");
      if (state.pausedUntil > Date.now()) throw new NoorBusyError(`Noor calls are paused until ${at(state.pausedUntil)} (Addis time). The saved copy is used meanwhile.`);
      const now = Date.now();
      state.starts = state.starts.filter((t) => now - t < 60_000);
      const gapWait = state.lastEnd + state.nextGapMs - now;
      const minuteWait = state.starts.length >= cfg.maxPerMinute ? 60_000 - (now - state.starts[0]!) + 50 : 0;
      const w = Math.max(gapWait, minuteWait);
      if (w <= 0) break;
      await sleep(Math.min(w, 5_000));
    }
    state.starts.push(Date.now());
    const t0 = Date.now();
    try {
      const res = await send();
      const bytes = Number(res.headers.get("content-length") ?? "") || null;
      const bad = res.status >= 500 || res.status === 429;
      state.errors = bad ? state.errors + 1 : 0;
      state.nextGapMs = (bytes !== null && bytes >= cfg.heavyBytes) || /\/edit\b|\/livewire\/update/.test(label.path) ? cfg.heavyGapSeconds * 1000 : cfg.gapSeconds * 1000;
      remember({ at: nowIso(), ...label, status: res.status, ms: Date.now() - t0, bytes });
      if (bad && state.errors >= cfg.errorsToPause) await pause(cfg.pauseMinutes * 60_000, `Noor answered HTTP ${res.status} ${state.errors} times in a row`);
      return res;
    } catch (e) {
      state.errors++;
      state.nextGapMs = cfg.heavyGapSeconds * 1000;
      const msg = e instanceof Error ? e.message : String(e);
      remember({ at: nowIso(), ...label, status: 0, ms: Date.now() - t0, bytes: null, note: msg.slice(0, 120) });
      if (state.errors >= cfg.errorsToPause) await pause(cfg.pauseMinutes * 60_000, `Noor did not answer ${state.errors} times in a row`);
      throw e;
    } finally {
      state.lastEnd = Date.now();
    }
  });
  state.chain = turn.catch(() => {});
  try {
    return await turn;
  } finally {
    state.waiting--;
  }
}

// The gate on fetch: any request to Noor's address goes through it. Installed once per server.
const G = globalThis as unknown as { __noorGateFetch?: typeof fetch; __noorGateOriginal?: typeof fetch };
export function installNoorGate() {
  if (G.__noorGateFetch && globalThis.fetch === G.__noorGateFetch) return;
  const original = globalThis.fetch.bind(globalThis);
  G.__noorGateOriginal = original;
  const gated = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL | null = null;
    try {
      url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    } catch {}
    const origin = url ? (await load()).origin : null;
    if (!url || !origin || url.origin !== origin) return original(input, init);
    return throughNoorGate({ method: init?.method ?? (input instanceof Request ? input.method : "GET"), path: url.pathname }, () => original(input, init));
  }) as typeof fetch;
  G.__noorGateFetch = gated;
  globalThis.fetch = gated;
}
installNoorGate();

// --- Who may read Noor live --------------------------------------------------------------

const isAdmin = (u: AppUser) => can(u, "users.manage") || can(u, "settings.manage");
export async function noorLiveAllowed(user: AppUser) {
  if (isAdmin(user)) return true;
  return (await noorGateConfig()).grants.includes(user.id);
}
export async function requireNoorLive(user: AppUser, what = "Reading Noor live") {
  if (!(await noorLiveAllowed(user))) throw new WorkflowError("FORBIDDEN", `${what} is for Admin and the people Admin grants live Noor access to. The saved copy is shown instead.`);
}
// Automatic reads (scheduled syncs, nightly figures, the mirror, scheduled reports): only when Admin turned them on.
export async function noorAutomaticAllowed() {
  return (await noorGateConfig()).automatic;
}

// --- Admin -------------------------------------------------------------------------------

export async function noorGateStatus(user: AppUser) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sees Noor's protection.");
  const cfg = await noorGateConfig();
  const p = await pausedUntil();
  const now = Date.now();
  const people = cfg.grants.length ? await Promise.all(cfg.grants.map(async (id) => ({ id, name: (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", id))?.name ?? "Removed person" }))) : [];
  return {
    config: cfg,
    defaults: NOOR_GATE_DEFAULTS,
    granted: people,
    pausedUntil: p > now ? new Date(p).toISOString() : null,
    pauseReason: p > now ? state.pauseReason : null,
    waiting: state.waiting,
    lastMinute: state.starts.filter((t) => now - t < 60_000).length,
    errorsInARow: state.errors,
    recent: state.log.slice(0, 25),
  };
}

export async function saveNoorGate(user: AppUser, input: Partial<NoorGateConfig>) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin changes Noor's protection.");
  const before = await noorGateConfig();
  const next = clean({ ...before, ...input });
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    `meta.${KEY}`,
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  forgetNoorGateConfig();
  const changes = (Object.keys(next) as (keyof NoorGateConfig)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
  await audit({ actor: user }, { action: "noor.gate", summary: `${user.name} changed Noor's protection: ${changes.join(", ") || "nothing"}` });
  return next;
}

// Stop every Noor call for a while (or resume now with 0).
export async function pauseNoor(user: AppUser, minutes: number) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin pauses Noor calls.");
  const m = Math.max(0, Math.min(7 * 24 * 60, Math.round(Number(minutes) || 0)));
  if (m === 0) {
    state.pausedUntil = 0;
    state.errors = 0;
    state.pauseReason = "";
    await (await import("./settings")).setMeta(PAUSE_KEY, "{}");
    await audit({ actor: user }, { action: "noor.gate", summary: `${user.name} resumed Noor calls` });
    return null;
  }
  await pause(m * 60_000, `stopped by ${user.name}`);
  await audit({ actor: user }, { action: "noor.gate", summary: `${user.name} stopped Noor calls for ${m} minutes` });
  return new Date(state.pausedUntil).toISOString();
}

// For tests: a clean gate.
export function resetNoorGateForTests() {
  Object.assign(state, { chain: Promise.resolve(), waiting: 0, lastEnd: 0, nextGapMs: 0, starts: [], errors: 0, pausedUntil: 0, pauseReason: "", pauseLoaded: true, log: [] });
  cfgCache = null;
}
