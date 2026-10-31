// How attendance is captured (Phase 10b), set up by Admin ("Attendance capture setup"): sites with their office
// networks, printed QR posters, and the checks a phone must pass. Then the check-ins themselves: the one-tap page
// people reach from the poster or by typing the short address, the same buttons on the office network, a shared
// office computer (number and PIN), and a team lead recording someone. Doubtful check-ins are flagged for HR.

import crypto from "node:crypto";
import dns from "node:dns/promises";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { getSettings } from "./settings";
import { can, type AppUser } from "./users";
import { myEmployeeId } from "./hr";
import { verifyPassword } from "./passwords";
import { deviceId, requestIp } from "./auth";
import { attendanceConfig, dayResult, hrIds, punchKind, shiftOf, stateOf, teamIds, type CheckinState } from "./attendance";
import { alertAdmins } from "./ops";
import { distanceM, fmtMin, KIND_LABELS, localParts, NEXT_KINDS, overnight, toMin, type EventKind, type Source } from "@/lib/attendance";
import { ipInRange, isHostName, isIpOrRange } from "@/lib/ip-match";

export type SiteChecks = { network: boolean; location: boolean; device: boolean };
export type Site = { id: string; name: string; networks: string[]; lat: number | null; lng: number | null; radiusM: number; checks: SiteChecks; posterKey: string; posterAt: string };
export type CaptureConfig = {
  // The printed QR, the same buttons in the app on the office network, a shared office computer, a lead recording.
  methods: { qr: boolean; network: boolean; shared: boolean; leadScan: boolean };
  sites: Site[];
  // A phone becomes a person's own at its first check-in ("auto") or once HR approves it ("hr"). A phone used for
  // two people within shareMinutes is flagged.
  devices: { register: "auto" | "hr"; shareMinutes: number };
  // QR and network check-ins this long before the shift starts or after it ends are flagged.
  window: { beforeMin: number; afterMin: number };
};

export const DEFAULT_CAPTURE: CaptureConfig = {
  methods: { qr: false, network: false, shared: false, leadScan: true },
  sites: [],
  devices: { register: "auto", shareMinutes: 15 },
  window: { beforeMin: 60, afterMin: 240 },
};

export const canCapture = (u: AppUser) => can(u, "attendance.capture");
function needCapture(u: AppUser) {
  if (!canCapture(u)) throw new WorkflowError("FORBIDDEN", "Only Admin sets up how attendance is taken.");
}

export async function captureConfig(): Promise<CaptureConfig> {
  const s = parseJson<Partial<CaptureConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.attendance.capture'"))?.value, {});
  return {
    methods: { ...DEFAULT_CAPTURE.methods, ...(s.methods ?? {}) },
    sites: s.sites ?? [],
    devices: { ...DEFAULT_CAPTURE.devices, ...(s.devices ?? {}) },
    window: { ...DEFAULT_CAPTURE.window, ...(s.window ?? {}) },
  };
}

const newKey = () => crypto.randomBytes(9).toString("base64url");
const num = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.min(hi, Math.max(lo, Number(v))) : d);

export async function saveCaptureConfig(user: AppUser, input: CaptureConfig) {
  needCapture(user);
  const old = await captureConfig();
  const sites: Site[] = input.sites.map((s) => {
    const name = String(s.name ?? "").trim().slice(0, 60);
    if (!name) throw new WorkflowError("VALIDATION", "Name every site.");
    const networks = [...new Set((s.networks ?? []).map((n) => String(n).trim().toLowerCase()).filter(Boolean))];
    const bad = networks.find((n) => !isIpOrRange(n) && !isHostName(n));
    if (bad) throw new WorkflowError("VALIDATION", `${name}: "${bad}" is not an address, a range (like 196.188.10.0/24) or a name.`);
    const lat = s.lat === null || (s.lat as unknown) === "" ? null : Number(s.lat);
    const lng = s.lng === null || (s.lng as unknown) === "" ? null : Number(s.lng);
    const checks = { network: !!s.checks?.network, location: !!s.checks?.location, device: !!s.checks?.device };
    if (!checks.network && !checks.location && !checks.device) throw new WorkflowError("VALIDATION", `${name}: choose at least one check (office network, location or the person's own phone); the QR alone can be photographed.`);
    if (checks.network && !networks.length) throw new WorkflowError("VALIDATION", `${name}: add the office's internet address, or use "Use this network" while at the office.`);
    if (checks.location && (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng))) throw new WorkflowError("VALIDATION", `${name}: the location check needs the site's latitude and longitude.`);
    const prev = old.sites.find((o) => o.id === s.id);
    return {
      id: prev?.id ?? uid("site_"),
      name,
      networks,
      lat: lat !== null && Number.isFinite(lat) ? lat : null,
      lng: lng !== null && Number.isFinite(lng) ? lng : null,
      radiusM: num(s.radiusM, 150, 20, 5000),
      checks,
      posterKey: prev?.posterKey ?? newKey(),
      posterAt: prev?.posterAt ?? nowIso(),
    };
  });
  const methods = { qr: !!input.methods.qr, network: !!input.methods.network, shared: !!input.methods.shared, leadScan: !!input.methods.leadScan };
  if ((methods.qr || methods.network || methods.shared) && !sites.length) throw new WorkflowError("VALIDATION", "Add a site first: QR, network and shared-computer check-in need to know the office.");
  if ((methods.network || methods.shared) && !sites.some((s) => s.networks.length)) throw new WorkflowError("VALIDATION", "Network and shared-computer check-in need the office's internet address on a site.");
  const next: CaptureConfig = {
    methods,
    sites,
    devices: { register: input.devices.register === "hr" ? "hr" : "auto", shareMinutes: num(input.devices.shareMinutes, 15, 1, 240) },
    window: { beforeMin: num(input.window.beforeMin, 60, 0, 600), afterMin: num(input.window.afterMin, 240, 0, 900) },
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.attendance.capture', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "attendance.capture", summary: `${user.name} changed how attendance is taken` });
  return next;
}

// A new code for a poster: old printouts stop working at once (for example after a photo of it was shared).
export async function rotatePoster(user: AppUser, siteId: string) {
  needCapture(user);
  const c = await captureConfig();
  const s = c.sites.find((x) => x.id === siteId);
  if (!s) throw new WorkflowError("NOT_FOUND", "Site not found.");
  s.posterKey = newKey();
  s.posterAt = nowIso();
  await run("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'cfg.attendance.capture'", JSON.stringify(c), nowIso());
  await audit({ actor: user }, { action: "attendance.capture", summary: `${user.name} made a new QR code for ${s.name}; old posters stop working` });
}

export const posterCode = (s: Site) => `${s.id}.${s.posterKey}`;

// ---------------------------------------------------------------------------
// Where the person is
// ---------------------------------------------------------------------------

const resolved = new Map<string, { at: number; ips: string[] }>();
async function namesToIps(name: string) {
  const hit = resolved.get(name);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.ips;
  const ips = await dns
    .lookup(name, { all: true })
    .then((r) => r.map((x) => x.address))
    .catch(() => [] as string[]);
  resolved.set(name, { at: Date.now(), ips });
  return ips;
}

export async function onNetwork(site: Site, ip: string | null) {
  if (!ip) return false;
  for (const n of site.networks) {
    if (isHostName(n)) {
      if ((await namesToIps(n)).some((a) => ipInRange(ip, a))) return true;
    } else if (ipInRange(ip, n)) return true;
  }
  return false;
}

export async function siteForIp(c: CaptureConfig, ip: string | null) {
  for (const s of c.sites) if (await onNetwork(s, ip)) return s;
  return null;
}

// What the person may do now, and from where. The QR code names the site; without it (the typed short address,
// or the Attendance page) the site is the one whose network the person is on.
export type Here = {
  ok: boolean;
  reason: string | null;
  site: { id: string; name: string } | null;
  via: "qr" | "network";
  needLocation: boolean;
};

async function where(c: CaptureConfig, input: { code?: string | null; lat?: number | null; lng?: number | null; accuracy?: number | null }, employeeId: string): Promise<Here & { distance: number | null; ip: string | null; deviceOk: boolean }> {
  const ip = await requestIp();
  let site: Site | null = null;
  let via: "qr" | "network" = "network";
  if (input.code) {
    const [id, key] = input.code.split(".");
    site = c.sites.find((s) => s.id === id) ?? null;
    const same = (a: string, b: string) => crypto.timingSafeEqual(crypto.createHash("sha256").update(a).digest(), crypto.createHash("sha256").update(b).digest());
    if (!site || !key || !same(site.posterKey, key)) {
      return { ok: false, reason: "This QR code is old. Scan the poster at the entrance again, or ask Admin.", site: null, via: "qr", needLocation: false, distance: null, ip, deviceOk: false };
    }
    if (!c.methods.qr) return { ok: false, reason: "QR check-in is switched off.", site: null, via: "qr", needLocation: false, distance: null, ip, deviceOk: false };
    via = "qr";
  } else {
    site = await siteForIp(c, ip);
    if (!site && c.sites.length === 1 && c.sites[0]!.checks.location) site = c.sites[0]!;
    if (!c.methods.qr && !c.methods.network) return { ok: false, reason: "Check-in from your phone is switched off. Use the kiosk or ask your team lead.", site: null, via, needLocation: false, distance: null, ip, deviceOk: false };
  }
  if (!site) return { ok: false, reason: "Connect to the office Wi-Fi and try again.", site: null, via, needLocation: false, distance: null, ip, deviceOk: false };
  const net = site.checks.network && (await onNetwork(site, ip));
  const hasLoc = Number.isFinite(Number(input.lat)) && Number.isFinite(Number(input.lng)) && input.lat !== null && input.lng !== null && input.lat !== undefined;
  const distance = hasLoc && site.lat !== null && site.lng !== null ? Math.round(distanceM({ lat: Number(input.lat), lng: Number(input.lng) }, { lat: site.lat, lng: site.lng })) : null;
  const loc = site.checks.location && distance !== null && distance <= site.radiusM + Math.min(100, Number(input.accuracy) || 0);
  const dev = await deviceId(false);
  const deviceOk = site.checks.device && !!dev && !!(await get("SELECT 1 AS x FROM att_devices WHERE device_id = ? AND employee_id = ? AND status = 'active'", dev, employeeId));
  const ok = net || loc || deviceOk;
  const reason = ok
    ? null
    : site.checks.network
      ? `Connect to the ${site.name} Wi-Fi and try again.`
      : site.checks.location
        ? distance === null
          ? "Allow location so the app can check you are at the site."
          : `You are about ${distance} m from ${site.name}. Check in when you are there.`
        : "This phone is not registered to you. Ask HR.";
  return { ok, reason, site: { id: site.id, name: site.name }, via, needLocation: site.checks.location && !net && !deviceOk && distance === null, distance, ip, deviceOk };
}

// ---------------------------------------------------------------------------
// The one-tap check-in page
// ---------------------------------------------------------------------------

export type CheckinView = { name: string; employeeId: string; state: CheckinState; since: string | null; actions: EventKind[]; here: Here; today: string; lateMin: number };

export async function checkinView(user: AppUser, input: { code?: string | null; lat?: number | null; lng?: number | null; accuracy?: number | null }): Promise<CheckinView> {
  const employeeId = await myEmployeeId(user);
  if (!employeeId) throw new WorkflowError("NOT_FOUND", "You do not have an HR record yet. Ask HR to add you.");
  const c = await captureConfig();
  const h = await where(c, input, employeeId);
  const st = await stateOf(employeeId);
  const line = await dayResult(employeeId, st.day);
  return {
    name: user.name.split(" ")[0]!,
    employeeId,
    state: st.state,
    since: st.since,
    actions: NEXT_KINDS[st.state],
    here: { ok: h.ok, reason: h.reason, site: h.site, via: h.via, needLocation: h.needLocation },
    today: st.day,
    lateMin: line?.lateMin ?? 0,
  };
}

async function refusal(siteId: string | null, employeeId: string | null, ip: string | null, reason: string) {
  await run("INSERT INTO att_refusals (id, site_id, employee_id, ip, reason, at) VALUES (?, ?, ?, ?, ?, ?)", uid("arf_"), siteId, employeeId, ip, reason.slice(0, 200), nowIso());
  if (!siteId) return;
  // Several people refused at one site in the last hour and nobody got in: the office address probably changed.
  const since = new Date(Date.now() - 3600e3).toISOString();
  const people = await get<{ c: number }>("SELECT COUNT(DISTINCT employee_id) AS c FROM att_refusals WHERE site_id = ? AND at > ?", siteId, since);
  const ok = await get("SELECT 1 AS x FROM att_events WHERE site_id = ? AND at > ? AND source IN ('qr', 'network')", siteId, since);
  if (Number(people?.c) >= 3 && !ok) {
    const key = `meta.att-net-alert.${siteId}`;
    const last = await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
    if (last && Date.now() - Date.parse(JSON.parse(last.value)) < 3 * 3600e3) return;
    await run("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, JSON.stringify(nowIso()), nowIso());
    const site = (await captureConfig()).sites.find((s) => s.id === siteId);
    await alertAdmins(
      `Check-ins failing at ${site?.name ?? "a site"}`,
      `${people!.c} people could not check in in the last hour. The office's internet address may have changed; the last one seen was ${ip ?? "unknown"}. Update it in Attendance, Capture.`,
      "/attendance?tab=capture",
      `att-net:${siteId}`,
    );
  }
}

// Flags a check-in for HR: outside the time window, or a phone that is new or shared.
async function flagsFor(c: CaptureConfig, employeeId: string, at: string, kind: EventKind, dev: string | null): Promise<string[]> {
  const flags: string[] = [];
  const tz = (await getSettings()).workspace.timezone;
  const lp = localParts(at, tz);
  const shift = await shiftOf(employeeId, undefined, lp.date);
  if (kind === "in" || kind === "out") {
    const start = toMin(shift.start);
    const end = toMin(shift.end) + (overnight(shift) ? 24 * 60 : 0);
    const m = lp.minutes < start - c.window.beforeMin && overnight(shift) ? lp.minutes + 24 * 60 : lp.minutes;
    if (m < start - c.window.beforeMin || m > end + c.window.afterMin) flags.push("Outside the usual hours");
  }
  if (dev) {
    const mine = await get<{ status: string }>("SELECT status FROM att_devices WHERE device_id = ? AND employee_id = ?", dev, employeeId);
    if (!mine) {
      await run("INSERT INTO att_devices (device_id, employee_id, status, first_at, last_at) VALUES (?, ?, ?, ?, ?)", dev, employeeId, c.devices.register === "hr" ? "pending" : "active", nowIso(), nowIso());
      if (c.devices.register === "hr") flags.push("A new phone, waiting for HR");
    } else {
      await run("UPDATE att_devices SET last_at = ? WHERE device_id = ? AND employee_id = ?", nowIso(), dev, employeeId);
      if (mine.status === "pending") flags.push("A new phone, waiting for HR");
      if (mine.status === "blocked") flags.push("A phone HR blocked");
    }
    const other = await get<{ name: string }>(
      "SELECT e.full_name AS name FROM att_events a JOIN employees e ON e.id = a.employee_id WHERE a.device_id = ? AND a.employee_id <> ? AND a.at > ? AND a.voided = 0 ORDER BY a.at DESC LIMIT 1",
      dev,
      employeeId,
      new Date(Date.parse(at) - c.devices.shareMinutes * 60e3).toISOString(),
    );
    if (other) flags.push(`The same phone checked in ${other.name} a few minutes before`);
  }
  return flags;
}

export async function selfCheckin(user: AppUser, input: { kind: EventKind; code?: string | null; lat?: number | null; lng?: number | null; accuracy?: number | null }) {
  const employeeId = await myEmployeeId(user);
  if (!employeeId) throw new WorkflowError("NOT_FOUND", "You do not have an HR record yet. Ask HR to add you.");
  const c = await captureConfig();
  const h = await where(c, input, employeeId);
  if (!h.ok) {
    await refusal(h.site?.id ?? (await siteForIp(c, h.ip))?.id ?? (c.sites.length === 1 ? c.sites[0]!.id : null), employeeId, h.ip, h.reason ?? "refused");
    throw new WorkflowError("FORBIDDEN", h.reason ?? "Check-in is not possible here.");
  }
  const dev = await deviceId(true);
  const at = nowIso();
  const flags = await flagsFor(c, employeeId, at, input.kind, dev);
  const source: Source = h.via === "qr" ? "qr" : "network";
  const r = await punchKind(employeeId, input.kind, {
    at,
    source,
    siteId: h.site!.id,
    ip: h.ip,
    deviceId: dev,
    lat: h.distance !== null ? Number(input.lat) : null,
    lng: h.distance !== null ? Number(input.lng) : null,
    accuracy: h.distance !== null ? Number(input.accuracy) || null : null,
    distanceM: h.distance,
    flag: flags.join("; ") || null,
    createdBy: user.id,
  });
  if (flags.length) await notify(await hrIds(), { type: "hr", title: `Check-in to review: ${user.name}`, body: flags.join("; "), link: "/attendance?tab=review", groupKey: "att-flags" }, nowIso());
  const line = await dayResult(employeeId, r.day);
  return { kind: r.kind, at: r.at, repeat: r.duplicate, flagged: flags, lateMin: line?.lateMin ?? 0, site: h.site!.name };
}

// ---------------------------------------------------------------------------
// A shared office computer: number and PIN, only on the office network
// ---------------------------------------------------------------------------

export async function sharedSite() {
  const c = await captureConfig();
  if (!c.methods.shared) return { ok: false as const, reason: "Check-in for others is switched off. Ask Admin." };
  const site = await siteForIp(c, await requestIp());
  if (!site) return { ok: false as const, reason: "This works only on a computer on the office network." };
  return { ok: true as const, site: { id: site.id, name: site.name } };
}

const pinFailures = new Map<string, { n: number; until: number }>();

async function sharedPerson(code: string, pin: string) {
  const s = code.trim().toUpperCase();
  const norm = /^\d{1,6}$/.test(s) ? `EMP-${s.padStart(3, "0")}` : /^EMP-?\d{1,6}$/.test(s) ? `EMP-${s.replace(/\D/g, "").padStart(3, "0")}` : s;
  const f = pinFailures.get(norm);
  if (f && f.n >= 5 && f.until > Date.now()) throw new WorkflowError("FORBIDDEN", "Too many wrong PINs. Wait ten minutes or ask your team lead.");
  const row = await get<{ id: string; full_name: string; preferred_name: string | null; pin_hash: string | null }>(
    "SELECT e.id, e.full_name, e.preferred_name, b.pin_hash FROM employees e LEFT JOIN att_badges b ON b.employee_id = e.id WHERE e.code = ? AND e.status <> 'left'",
    norm,
  );
  if (!row || !row.pin_hash || !verifyPassword(pin, row.pin_hash)) {
    pinFailures.set(norm, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 10 * 60e3 });
    throw new WorkflowError("VALIDATION", row && !row.pin_hash ? "No PIN is set for this number. Set one in the app under Attendance, or ask HR." : "That number and PIN do not match.");
  }
  pinFailures.delete(norm);
  return row;
}

export async function sharedLookup(input: { code: string; pin: string }) {
  const s = await sharedSite();
  if (!s.ok) throw new WorkflowError("FORBIDDEN", s.reason);
  const p = await sharedPerson(input.code, input.pin);
  const st = await stateOf(p.id);
  return { name: p.preferred_name || p.full_name.split(" ")[0]!, state: st.state, actions: NEXT_KINDS[st.state] };
}

export async function sharedCheckin(input: { code: string; pin: string; kind: EventKind }) {
  const s = await sharedSite();
  if (!s.ok) throw new WorkflowError("FORBIDDEN", s.reason);
  const p = await sharedPerson(input.code, input.pin);
  const c = await captureConfig();
  const at = nowIso();
  const flags = await flagsFor(c, p.id, at, input.kind, null);
  const r = await punchKind(p.id, input.kind, { at, source: "shared", siteId: s.site.id, ip: await requestIp(), deviceId: await deviceId(false), flag: flags.join("; ") || null });
  const line = await dayResult(p.id, r.day);
  return { name: p.preferred_name || p.full_name.split(" ")[0]!, kind: r.kind, at: r.at, repeat: r.duplicate, lateMin: line?.lateMin ?? 0 };
}

// ---------------------------------------------------------------------------
// A team lead records someone (picked from the team, or their badge scanned)
// ---------------------------------------------------------------------------

export async function leadCheckin(user: AppUser, input: { employeeId?: string | null; badge?: string | null; kind: EventKind; note?: string | null }) {
  const c = await captureConfig();
  if (!c.methods.leadScan) throw new WorkflowError("FORBIDDEN", "Team leads recording check-ins is switched off.");
  let employeeId = input.employeeId ?? null;
  if (!employeeId && input.badge) employeeId = (await get<{ employee_id: string }>("SELECT employee_id FROM att_badges WHERE badge = ?", input.badge.trim()))?.employee_id ?? null;
  if (!employeeId) throw new WorkflowError("NOT_FOUND", "Badge not recognised.");
  const hr = can(user, "attendance.manage");
  if (!hr && !(await teamIds(user)).includes(employeeId)) throw new WorkflowError("FORBIDDEN", "You can record check-ins only for your own team.");
  const self = await myEmployeeId(user);
  if (self === employeeId) throw new WorkflowError("FORBIDDEN", "Check yourself in on the check-in page.");
  const r = await punchKind(employeeId, input.kind, { source: "lead_scan", flag: `Recorded by ${user.name}${input.note ? `: ${input.note.slice(0, 200)}` : ""}`, createdBy: user.id, ip: await requestIp(), deviceId: await deviceId(false) });
  const emp = await get<{ full_name: string; user_id: string | null }>("SELECT full_name, user_id FROM employees WHERE id = ?", employeeId);
  if (emp?.user_id)
    await notify([emp.user_id], { type: "hr", title: "Your team lead recorded your attendance", body: `${user.name}: ${KIND_LABELS[input.kind]} at ${fmtMin(localParts(r.at, (await getSettings()).workspace.timezone).minutes)}`, link: "/attendance" }, nowIso());
  return { name: emp?.full_name ?? "", kind: r.kind, at: r.at, repeat: r.duplicate };
}

// ---------------------------------------------------------------------------
// HR: flagged check-ins and phones
// ---------------------------------------------------------------------------

export type FlagRow = { id: string; employeeId: string; name: string; kind: EventKind; at: string; day: string; source: Source; flag: string; site: string | null; ip: string | null; device: string | null };

export async function flaggedEvents(user: AppUser): Promise<FlagRow[]> {
  if (!can(user, "attendance.manage")) throw new WorkflowError("FORBIDDEN", "Only HR reviews check-ins.");
  const c = await captureConfig();
  const rows = await all<{ id: string; employee_id: string; full_name: string; kind: EventKind; at: string; day: string; source: Source; flag: string; site_id: string | null; ip: string | null; device_id: string | null }>(
    "SELECT a.id, a.employee_id, e.full_name, a.kind, a.at, a.day, a.source, a.flag, a.site_id, a.ip, a.device_id FROM att_events a JOIN employees e ON e.id = a.employee_id WHERE a.flag_state = 'pending' AND a.voided = 0 ORDER BY a.at DESC LIMIT 300",
  );
  return rows.map((r) => ({ id: r.id, employeeId: r.employee_id, name: r.full_name, kind: r.kind, at: r.at, day: r.day, source: r.source, flag: r.flag, site: c.sites.find((s) => s.id === r.site_id)?.name ?? null, ip: r.ip, device: r.device_id ? r.device_id.slice(0, 6) : null }));
}

export async function decideFlags(user: AppUser, ids: string[], accept: boolean, note?: string | null) {
  if (!can(user, "attendance.manage")) throw new WorkflowError("FORBIDDEN", "Only HR reviews check-ins.");
  for (const id of ids.slice(0, 300)) {
    const e = await get<{ employee_id: string; device_id: string | null; at: string; kind: string }>("SELECT employee_id, device_id, at, kind FROM att_events WHERE id = ? AND flag_state = 'pending'", id);
    if (!e) continue;
    await run(`UPDATE att_events SET flag_state = ?, flag_by = ?, flag_at = ?${accept ? "" : ", voided = 1"} WHERE id = ?`, accept ? "accepted" : "rejected", user.id, nowIso(), id);
    // Accepting a new phone's check-in approves the phone.
    if (accept && e.device_id) await run("UPDATE att_devices SET status = 'active', decided_by = ? WHERE device_id = ? AND employee_id = ? AND status = 'pending'", user.id, e.device_id, e.employee_id);
    const uidRow = await get<{ user_id: string | null }>("SELECT user_id FROM employees WHERE id = ?", e.employee_id);
    if (uidRow?.user_id && !accept)
      await notify([uidRow.user_id], { type: "hr", title: "A check-in was not accepted", body: `${KIND_LABELS[e.kind as EventKind] ?? e.kind} at ${fmtMin(localParts(e.at, (await getSettings()).workspace.timezone).minutes)}${note ? `: ${note}` : ""}. Ask for a correction if it was right.`, link: "/attendance" }, nowIso());
  }
  await audit({ actor: user }, { action: "attendance.flags", summary: `${user.name} ${accept ? "accepted" : "rejected"} ${ids.length} flagged check-in${ids.length === 1 ? "" : "s"}` });
}

export type DeviceRow = { deviceId: string; employeeId: string; name: string; status: string; firstAt: string; lastAt: string };

export async function listDevices(user: AppUser): Promise<DeviceRow[]> {
  if (!can(user, "attendance.manage") && !canCapture(user)) throw new WorkflowError("FORBIDDEN", "Only HR and Admin see phones.");
  const rows = await all<{ device_id: string; employee_id: string; full_name: string; status: string; first_at: string; last_at: string }>(
    "SELECT d.device_id, d.employee_id, e.full_name, d.status, d.first_at, d.last_at FROM att_devices d JOIN employees e ON e.id = d.employee_id ORDER BY (d.status = 'pending') DESC, d.last_at DESC LIMIT 500",
  );
  return rows.map((r) => ({ deviceId: r.device_id, employeeId: r.employee_id, name: r.full_name, status: r.status, firstAt: r.first_at, lastAt: r.last_at }));
}

export async function setDevice(user: AppUser, deviceId: string, employeeId: string, status: "active" | "blocked" | "removed") {
  if (!can(user, "attendance.manage")) throw new WorkflowError("FORBIDDEN", "Only HR approves phones.");
  if (status === "removed") await run("DELETE FROM att_devices WHERE device_id = ? AND employee_id = ?", deviceId, employeeId);
  else await run("UPDATE att_devices SET status = ?, decided_by = ? WHERE device_id = ? AND employee_id = ?", status, user.id, deviceId, employeeId);
}

// Admin's view: each site's recent refusals and the address Admin is on now (for "Use this network").
export async function captureStatus(user: AppUser) {
  needCapture(user);
  const c = await captureConfig();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const refusals = await all<{ site_id: string | null; c: number; last_ip: string | null; last_at: string }>(
    "SELECT site_id, COUNT(*) AS c, MAX(ip) AS last_ip, MAX(at) AS last_at FROM att_refusals WHERE at > ? GROUP BY site_id",
    since,
  );
  const ip = await requestIp();
  return { myIp: ip, mySite: (await siteForIp(c, ip))?.id ?? null, refusals: refusals.map((r) => ({ siteId: r.site_id, count: Number(r.c), lastIp: r.last_ip, lastAt: r.last_at })) };
}
