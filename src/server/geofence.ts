// Leaving the office (Attendance, Capture, Leaving the site): while someone is checked in, their phone tells the server
// where it is now and then. Outside every site's area twice in a row, they are told at once; if they are still outside
// after the grace minutes, the app does what Admin chose: only tell them, start a break, check them out, or start a
// break and check out later. Coming back ends a break the app started. The server decides from the readings, never
// the phone; a weak reading is ignored. The phone can only report while the app is open (or recently open), so the
// last reading counts: a person whose last reading was outside is dealt with by the regular checks too.

import { all, get, nowIso, parseJson, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { can, type AppUser } from "./users";
import { myEmployeeId } from "./hr";
import { captureConfig, type Site } from "./attendance-capture";
import { punchKind, stateOf } from "./attendance";
import { distanceM, type EventKind } from "@/lib/attendance";

export type GeofenceMode = "off" | "notify" | "break" | "checkout" | "break_then_checkout";
export type GeofenceConfig = {
  mode: GeofenceMode;
  // Minutes outside before the app acts (after the first notice).
  graceMin: number;
  // break_then_checkout: minutes outside before the break becomes a check-out.
  checkoutAfterMin: number;
  // Metres beyond the site's area before someone counts as gone (GPS drifts).
  marginM: number;
  // Readings less accurate than this are ignored.
  maxAccuracyM: number;
  // How often the phone reports while checked in.
  intervalSec: number;
  returnEndsBreak: boolean;
  // Automatic check-outs and breaks are shown to HR for review.
  flagForHr: boolean;
  // Sites it applies to (none: every site with a location).
  siteIds: string[];
};

export const DEFAULT_GEOFENCE: GeofenceConfig = { mode: "off", graceMin: 10, checkoutAfterMin: 60, marginM: 75, maxAccuracyM: 150, intervalSec: 60, returnEndsBreak: true, flagForHr: false, siteIds: [] };

export const MODE_LABELS: Record<GeofenceMode, string> = {
  off: "Off",
  notify: "Only tell the person",
  break: "Start a break",
  checkout: "Check them out",
  break_then_checkout: "Start a break, then check them out",
};

export async function geofenceConfig(): Promise<GeofenceConfig> {
  const v = parseJson<Partial<GeofenceConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.attendance.geofence'"))?.value, {});
  return { ...DEFAULT_GEOFENCE, ...v, siteIds: Array.isArray(v.siteIds) ? v.siteIds : [] };
}

const n = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);

export async function saveGeofenceConfig(user: AppUser, input: Partial<GeofenceConfig>) {
  if (!can(user, "attendance.capture") && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets how leaving the site is handled.");
  const cur = await geofenceConfig();
  const mode = (Object.keys(MODE_LABELS) as GeofenceMode[]).includes(input.mode as GeofenceMode) ? (input.mode as GeofenceMode) : cur.mode;
  if (mode !== "off" && !(await located()).length) throw new WorkflowError("VALIDATION", "Give a site its latitude and longitude first (Capture, Sites).");
  const next: GeofenceConfig = {
    mode,
    graceMin: n(input.graceMin ?? cur.graceMin, 10, 1, 240),
    checkoutAfterMin: n(input.checkoutAfterMin ?? cur.checkoutAfterMin, 60, 5, 600),
    marginM: n(input.marginM ?? cur.marginM, 75, 0, 2000),
    maxAccuracyM: n(input.maxAccuracyM ?? cur.maxAccuracyM, 150, 20, 2000),
    intervalSec: n(input.intervalSec ?? cur.intervalSec, 60, 15, 900),
    returnEndsBreak: input.returnEndsBreak ?? cur.returnEndsBreak,
    flagForHr: input.flagForHr ?? cur.flagForHr,
    siteIds: Array.isArray(input.siteIds) ? input.siteIds.map(String) : cur.siteIds,
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.attendance.geofence', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "attendance.geofence", summary: `${user.name} set leaving the site to: ${MODE_LABELS[next.mode]}`, newValue: next });
  return next;
}

async function located(cfg?: GeofenceConfig): Promise<Site[]> {
  const sites = (await captureConfig()).sites.filter((s) => s.lat !== null && s.lng !== null);
  return cfg?.siteIds.length ? sites.filter((s) => cfg.siteIds.includes(s.id)) : sites;
}

type Row = { employee_id: string; site_id: string | null; outside_since: string | null; outside_count: number; warned_at: string | null; acted: string | null; acted_at: string | null; last_at: string | null; last_distance: number | null };

export type GeofenceStatus = {
  mode: GeofenceMode;
  intervalSec: number;
  watch: boolean;
  state: string | null;
  site: string | null;
  distance: number | null;
  inside: boolean | null;
  warnedAt: string | null;
  actsAt: string | null;
  acted: string | null;
  message: string | null;
};

const fmt = (m: number) => `${m} ${m === 1 ? "minute" : "minutes"}`;

async function act(employeeId: string, userId: string | null, kind: EventKind, site: string, cfg: GeofenceConfig, at: string, why: string) {
  try {
    await punchKind(employeeId, kind, { at, source: "geofence", note: why, flag: cfg.flagForHr ? `Automatic: ${why}` : null, createdBy: userId });
    return true;
  } catch {
    return false;
  }
}

// One reading from the person's phone.
export async function geofenceTick(user: AppUser, input: { lat: number; lng: number; accuracy: number | null }): Promise<GeofenceStatus> {
  const cfg = await geofenceConfig();
  const employeeId = await myEmployeeId(user);
  const base: GeofenceStatus = { mode: cfg.mode, intervalSec: cfg.intervalSec, watch: false, state: null, site: null, distance: null, inside: null, warnedAt: null, actsAt: null, acted: null, message: null };
  if (cfg.mode === "off" || !employeeId) return base;
  const sites = await located(cfg);
  if (!sites.length) return base;
  const st = await stateOf(employeeId);
  const now = nowIso();
  const row = await get<Row>("SELECT * FROM att_geofence WHERE employee_id = ?", employeeId);
  if (st.state === "out") {
    if (row) await run("DELETE FROM att_geofence WHERE employee_id = ?", employeeId);
    return { ...base, state: st.state };
  }
  const watching = { ...base, watch: true, state: st.state };
  const acc = Number(input.accuracy);
  if (!Number.isFinite(Number(input.lat)) || !Number.isFinite(Number(input.lng))) return { ...watching, message: "No location." };
  if (Number.isFinite(acc) && acc > cfg.maxAccuracyM) return { ...watching, message: "The location is not precise enough to use; it was ignored." };
  const near = sites
    .map((s) => ({ s, d: Math.round(distanceM({ lat: Number(input.lat), lng: Number(input.lng) }, { lat: s.lat!, lng: s.lng! })) }))
    .sort((a, b) => a.d - b.d)[0]!;
  const slack = Math.min(100, Number.isFinite(acc) ? acc : 0);
  const inside = near.d <= near.s.radiusM + slack;
  const outside = near.d > near.s.radiusM + cfg.marginM + slack;
  const out = { ...watching, site: near.s.name, distance: near.d, inside };

  if (inside || !outside) {
    // Back: a break the app started ends.
    if (row?.acted === "break" && st.state === "break" && cfg.returnEndsBreak && inside) {
      if (await act(employeeId, user.id, "break_end", near.s.name, cfg, now, `came back to ${near.s.name}`))
        await notify([user.id], { type: "assignment", title: "Welcome back", body: `Your break ended when you came back to ${near.s.name}.`, link: "/attendance" }, now);
    }
    if (row && inside) await run("DELETE FROM att_geofence WHERE employee_id = ?", employeeId);
    return { ...out, message: inside ? null : "Near the edge of the site." };
  }

  // Outside.
  const since = row?.outside_since ?? now;
  const count = (row?.outside_count ?? 0) + 1;
  await run(
    `INSERT INTO att_geofence (employee_id, site_id, outside_since, outside_count, last_at, last_distance) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (employee_id) DO UPDATE SET site_id = excluded.site_id, outside_since = COALESCE(att_geofence.outside_since, excluded.outside_since), outside_count = excluded.outside_count, last_at = excluded.last_at, last_distance = excluded.last_distance`,
    employeeId,
    near.s.id,
    since,
    count,
    now,
    near.d,
  );
  const r = (await get<Row>("SELECT * FROM att_geofence WHERE employee_id = ?", employeeId))!;
  // Twice in a row, so one jumpy reading does nothing.
  if (count >= 2 && !r.warned_at) {
    await run("UPDATE att_geofence SET warned_at = ? WHERE employee_id = ?", now, employeeId);
    r.warned_at = now;
    const what =
      cfg.mode === "notify"
        ? "Check out or start a break if you are leaving."
        : `If you are still away in ${fmt(cfg.graceMin)}, the app will ${cfg.mode === "checkout" ? "check you out" : "start a break"}. Come back, or ignore this if you are on work outside.`;
    await notify([user.id], { type: "assignment", title: `You left ${near.s.name}`, body: what, link: "/attendance", dedupeKey: `geofence:${employeeId}:${since}` }, now);
  }
  await decide(employeeId, user.id, r, st.state, near.s.name, cfg, now);
  const fresh = (await get<Row>("SELECT * FROM att_geofence WHERE employee_id = ?", employeeId)) ?? r;
  const actsAt = cfg.mode === "notify" || !fresh.warned_at ? null : fresh.acted === "break" && cfg.mode === "break_then_checkout" ? addMin(since, cfg.checkoutAfterMin) : fresh.acted ? null : addMin(since, cfg.graceMin);
  return { ...out, state: (await stateOf(employeeId)).state, warnedAt: fresh.warned_at, actsAt, acted: fresh.acted, message: null };
}

const addMin = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60e3).toISOString();

// What to do for someone outside, given how long.
async function decide(employeeId: string, userId: string | null, r: Row, state: string, site: string, cfg: GeofenceConfig, now: string) {
  if (!r.outside_since || !r.warned_at || cfg.mode === "notify") return;
  const away = (Date.parse(now) - Date.parse(r.outside_since)) / 60e3;
  const ids = userId ? [userId] : [];
  if (!r.acted && away >= cfg.graceMin) {
    if ((cfg.mode === "break" || cfg.mode === "break_then_checkout") && state === "in") {
      if (await act(employeeId, userId, "break_start", site, cfg, now, `left ${site}`)) {
        await run("UPDATE att_geofence SET acted = 'break', acted_at = ? WHERE employee_id = ?", now, employeeId);
        await notify(ids, { type: "assignment", title: "Break started", body: `You have been away from ${site} for ${fmt(Math.round(away))}. It ends when you come back.`, link: "/attendance" }, now);
      }
      return;
    }
    if (cfg.mode === "checkout") {
      if (await act(employeeId, userId, "out", site, cfg, now, `left ${site}`)) {
        await run("UPDATE att_geofence SET acted = 'out', acted_at = ? WHERE employee_id = ?", now, employeeId);
        await notify(ids, { type: "assignment", title: "Checked out", body: `You left ${site} ${fmt(Math.round(away))} ago, so you were checked out. If this is wrong, ask for a correction on Attendance.`, link: "/attendance" }, now);
      }
      return;
    }
  }
  if (r.acted === "break" && cfg.mode === "break_then_checkout" && away >= cfg.checkoutAfterMin && state !== "out") {
    if (await act(employeeId, userId, "out", site, cfg, now, `away from ${site} for ${fmt(Math.round(away))}`)) {
      await run("UPDATE att_geofence SET acted = 'out', acted_at = ? WHERE employee_id = ?", now, employeeId);
      await notify(ids, { type: "assignment", title: "Checked out", body: `You have been away from ${site} for ${fmt(Math.round(away))}, so you were checked out.`, link: "/attendance" }, now);
    }
  }
}

// The regular checks: someone whose phone last reported them outside, and then went quiet, is still dealt with.
export async function geofenceSweep(now = nowIso()) {
  const cfg = await geofenceConfig();
  if (cfg.mode === "off" || cfg.mode === "notify") return 0;
  const rows = await all<Row & { user_id: string | null; site: string | null }>(
    "SELECT g.*, e.user_id FROM att_geofence g JOIN employees e ON e.id = g.employee_id WHERE g.warned_at IS NOT NULL AND (g.acted IS NULL OR g.acted = 'break')",
  );
  const sites = await located();
  let done = 0;
  for (const r of rows) {
    const st = await stateOf(r.employee_id);
    if (st.state === "out") {
      await run("DELETE FROM att_geofence WHERE employee_id = ?", r.employee_id);
      continue;
    }
    const before = r.acted;
    await decide(r.employee_id, r.user_id, r, st.state, sites.find((s) => s.id === r.site_id)?.name ?? "the site", cfg, now);
    if ((await get<{ acted: string | null }>("SELECT acted FROM att_geofence WHERE employee_id = ?", r.employee_id))?.acted !== before) done++;
  }
  return done;
}

// What the phone needs to know: whether to watch at all (on, checked in, a site with a location).
export async function geofenceStatus(user: AppUser): Promise<GeofenceStatus> {
  const cfg = await geofenceConfig();
  const base: GeofenceStatus = { mode: cfg.mode, intervalSec: cfg.intervalSec, watch: false, state: null, site: null, distance: null, inside: null, warnedAt: null, actsAt: null, acted: null, message: null };
  if (cfg.mode === "off") return base;
  const employeeId = await myEmployeeId(user).catch(() => null);
  if (!employeeId || !(await located(cfg)).length) return base;
  const st = await stateOf(employeeId);
  return { ...base, watch: st.state !== "out", state: st.state };
}
