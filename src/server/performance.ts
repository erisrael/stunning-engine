// Phase 17: performance management (docs/PHASE-17-PLAN.md).
// - The KPI library (HR, "perf.library"): KPIs from the measure catalogue (src/server/measures.ts) or typed in, with
//   their scoring; KRA templates per role and position with weights and default targets.
// - Scorecards per person and month: each KPI's actual (computed, or typed, or an approved correction) against its
//   target (the template's, or a person's own set by their lead or HR), scored and weighted into KRAs and an overall
//   score with a rating. Teams, departments and the company add up the numbers; HR sees the spread of ratings
//   (calibration). A month closes (by HR, or by itself on the set day): its scorecards freeze; corrections after
//   that need HR's approval.
// - OKRs: quarterly cycles, objectives from the company down to a person (each can support a higher one), key results
//   moved by check-ins or linked to a measure, scored 0 to 1; tasks can be linked to a key result.
// Decisions taken (the plan's suggestions): monthly scorecards and quarterly OKRs; percent of target capped at 120%;
// scorecards are evidence beside HR reviews (they do not set the rating); OKRs do not feed the rating; OKRs visible
// to everyone unless set otherwise. All are settings HR can change.

import { all, get, nowIso, parseJson, run, uid, type Param } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { getSettings } from "./settings";
import { can, listUsers, type AppUser } from "./users";
import { addAgg, measureDef, measureFor, MEASURES, valueOf, type Agg } from "./measures";
import { localParts } from "@/lib/attendance";
import {
  DEFAULT_PERF,
  READY_TEMPLATES,
  kpiScore,
  krScore,
  ratingOf,
  type Confidence,
  type KpiDef,
  type KpiMeta,
  type KpiLine,
  type KraLine,
  type OkrLevel,
  type PerfConfig,
  type Scorecard,
  type Template,
  type TemplateKra,
} from "@/lib/performance";

export * from "@/lib/performance";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isPeriod = (p: unknown): p is string => typeof p === "string" && /^\d{4}-\d{2}$/.test(p);
const prevPeriod = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 7);
};
async function today() {
  return localParts(nowIso(), (await getSettings()).workspace.timezone).date;
}
export async function currentPeriod() {
  return (await today()).slice(0, 7);
}

// ---------------------------------------------------------------------------
// Settings and rights
// ---------------------------------------------------------------------------

export async function perfConfig(): Promise<PerfConfig> {
  const s = parseJson<Partial<PerfConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.performance'"))?.value, {});
  return { ...DEFAULT_PERF, ...s };
}

export const managesLibrary = (u: AppUser) => can(u, "perf.library");
export const seesCompany = (u: AppUser) => can(u, "perf.view_company") || can(u, "perf.library");

export async function savePerfConfig(user: AppUser, input: Partial<PerfConfig>) {
  if (!managesLibrary(user)) throw new WorkflowError("FORBIDDEN", "Only HR managers and Admin set up performance.");
  const cur = await perfConfig();
  const n = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  const ratings = (input.ratings ?? cur.ratings).map((r) => ({ min: n(r.min, 0, 0, 200), label: clean(r.label, 30) })).filter((r) => r.label);
  if (!ratings.length) throw new WorkflowError("VALIDATION", "Keep at least one rating.");
  const next: PerfConfig = {
    enabled: input.enabled ?? cur.enabled,
    staffSeeOwn: input.staffSeeOwn ?? cur.staffSeeOwn,
    ratings: ratings.sort((a, b) => b.min - a.min),
    closeDay: n(input.closeDay ?? cur.closeDay, 5, 0, 28),
    checkinDay: n(input.checkinDay ?? cur.checkinDay, 1, 0, 6),
    redBelow: n(input.redBelow ?? cur.redBelow, 60, 0, 120),
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.performance', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "perf.settings", summary: `${user.name} changed the performance settings` });
  return next;
}

// The people a person looks after: their reports and production team (as in Attendance), and the members of the
// departments they head or lead.
export async function managedUserIds(user: AppUser): Promise<string[]> {
  const { teamIds } = await import("./attendance");
  const emps = await teamIds(user);
  const fromTeam = emps.length ? (await all<{ user_id: string }>(`SELECT user_id FROM employees WHERE user_id IS NOT NULL AND id IN (${emps.map(() => "?").join(",")})`, ...emps)).map((r) => r.user_id) : [];
  const led = await all<{ department: string }>("SELECT department FROM department_positions WHERE user_id = ? AND position IN ('head','lead')", user.id);
  const { deptPeople } = await import("./departments");
  const fromDepts: string[] = [];
  for (const l of led) fromDepts.push(...(await deptPeople(l.department)).map((p) => p.id));
  return [...new Set([...fromTeam, ...fromDepts])].filter((x) => x !== user.id);
}

async function canSeePerson(user: AppUser, userId: string, cfg?: PerfConfig) {
  if (seesCompany(user)) return true;
  if (userId === user.id) return (cfg ?? (await perfConfig())).staffSeeOwn || user.leads.length > 0;
  return (await managedUserIds(user)).includes(userId);
}
async function manages(user: AppUser, userId: string) {
  return managesLibrary(user) || (await managedUserIds(user)).includes(userId);
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

type KpiRow = { key: string; name: string; description: string | null; unit: string; direction: string; source: string; measure: string | null; scoring: string; bands: string; min_sample: number; quality: number; active: number; meta?: string | null };
const kpiOf = (r: KpiRow): KpiDef => ({
  key: r.key,
  name: r.name,
  description: r.description,
  unit: r.unit,
  direction: r.direction === "down" ? "down" : "up",
  source: r.source === "manual" ? "manual" : "measure",
  measure: r.measure,
  scoring: (["percent", "bands", "pass"].includes(r.scoring) ? r.scoring : "percent") as KpiDef["scoring"],
  bands: parseJson(r.bands, {}),
  minSample: Number(r.min_sample),
  quality: !!Number(r.quality),
  active: !!Number(r.active),
  meta: parseJson<KpiMeta>(r.meta, {}),
});

// The first time it is used, the library gets a KPI per measure and the ready templates.
async function ensureLibrary() {
  if (await get("SELECT 1 AS x FROM perf_kpis LIMIT 1")) return;
  const now = nowIso();
  for (const m of MEASURES)
    await run(
      "INSERT INTO perf_kpis (id, key, name, description, unit, direction, source, measure, min_sample, quality, created_at) VALUES (?, ?, ?, ?, ?, ?, 'measure', ?, ?, ?, ?) ON CONFLICT (key) DO NOTHING",
      uid("kpi_"),
      m.key,
      m.name,
      m.description,
      m.unit,
      m.direction,
      m.key,
      m.unit === "percent" ? 5 : 0,
      m.quality ? 1 : 0,
      now,
    );
  if (!(await get("SELECT 1 AS x FROM perf_templates LIMIT 1")))
    for (const t of READY_TEMPLATES) await run("INSERT INTO perf_templates (id, name, applies_to, kras, active, updated_at) VALUES (?, ?, ?, ?, 1, ?)", uid("tpl_"), t.name, JSON.stringify(t.appliesTo), JSON.stringify(t.kras), now);
}

export async function listKpis(): Promise<KpiDef[]> {
  await ensureLibrary();
  return (await all<KpiRow>("SELECT * FROM perf_kpis ORDER BY name")).map(kpiOf);
}

export async function saveKpi(user: AppUser, input: Partial<KpiDef> & { name: string }) {
  if (!managesLibrary(user)) throw new WorkflowError("FORBIDDEN", "Only HR managers and Admin change the KPI library.");
  await ensureLibrary();
  const name = clean(input.name, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the KPI.");
  const source = input.source === "manual" ? "manual" : "measure";
  if (source === "measure" && !measureDef(input.measure ?? "")) throw new WorkflowError("VALIDATION", "Choose the measure it comes from, or make it typed in.");
  const key = input.key ? clean(input.key, 40) : `${source === "manual" ? "man" : "kpi"}_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}`;
  const vals: Param[] = [
    name,
    clean(input.description, 300) || null,
    ["count", "percent", "hours", "days", "minutes", "money", "score"].includes(input.unit ?? "") ? input.unit! : "count",
    input.direction === "down" ? "down" : "up",
    source,
    source === "measure" ? input.measure! : null,
    ["percent", "bands", "pass"].includes(input.scoring ?? "") ? input.scoring! : "percent",
    JSON.stringify({ green: input.bands?.green ?? undefined, amber: input.bands?.amber ?? undefined }),
    Math.max(0, Math.min(100, Math.round(Number(input.minSample ?? 0)))),
    input.quality ? 1 : 0,
    input.active === false ? 0 : 1,
  ];
  const m = input.meta ?? {};
  const meta = JSON.stringify(Object.fromEntries((["perspective", "formula", "dataSource", "frequency", "owner", "rationale"] as const).map((k) => [k, clean(m[k] ?? "", 300) || null])));
  if (await get("SELECT 1 AS x FROM perf_kpis WHERE key = ?", key)) await run("UPDATE perf_kpis SET meta = ? WHERE key = ?", meta, key).catch(() => null);
  if (await get("SELECT 1 AS x FROM perf_kpis WHERE key = ?", key))
    await run("UPDATE perf_kpis SET name = ?, description = ?, unit = ?, direction = ?, source = ?, measure = ?, scoring = ?, bands = ?, min_sample = ?, quality = ?, active = ? WHERE key = ?", ...vals, key);
  else await run("INSERT INTO perf_kpis (name, description, unit, direction, source, measure, scoring, bands, min_sample, quality, active, id, key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...vals, uid("kpi_"), key, nowIso());
  await run("UPDATE perf_kpis SET meta = ? WHERE key = ?", meta, key);
  await audit({ actor: user }, { action: "perf.library", summary: `${user.name} saved the KPI ${name}` });
  return key;
}

export async function listTemplates(): Promise<Template[]> {
  await ensureLibrary();
  return (await all<{ id: string; name: string; applies_to: string; kras: string; active: number }>("SELECT * FROM perf_templates ORDER BY name")).map((t) => ({ id: t.id, name: t.name, appliesTo: parseJson<string[]>(t.applies_to, []), kras: parseJson<TemplateKra[]>(t.kras, []), active: !!Number(t.active) }));
}

// Weights add up to 100 (KRAs, and the KPIs in each); a KRA set with only quantity KPIs gets a warning.
export function checkTemplate(kras: TemplateKra[], kpis: KpiDef[]) {
  const warnings: string[] = [];
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0));
  if (!kras.length) throw new WorkflowError("VALIDATION", "Add at least one KRA.");
  if (sum(kras.map((k) => k.weight)) !== 100) throw new WorkflowError("VALIDATION", `The KRA weights add up to ${sum(kras.map((k) => k.weight))}, not 100.`);
  for (const k of kras) {
    if (!k.kpis.length) throw new WorkflowError("VALIDATION", `${k.name}: add at least one KPI.`);
    if (sum(k.kpis.map((x) => x.weight)) !== 100) throw new WorkflowError("VALIDATION", `${k.name}: the KPI weights add up to ${sum(k.kpis.map((x) => x.weight))}, not 100.`);
    for (const x of k.kpis) if (!kpis.some((d) => d.key === x.kpi)) throw new WorkflowError("VALIDATION", `${k.name}: unknown KPI ${x.kpi}.`);
  }
  if (!kras.some((k) => k.kpis.some((x) => kpis.find((d) => d.key === x.kpi)?.quality))) warnings.push("Only quantity KPIs: add a quality KPI (for example work sent back) so speed is not all that counts.");
  return warnings;
}

export async function saveTemplate(user: AppUser, input: { id?: string | null; name: string; appliesTo: string[]; kras: TemplateKra[]; active?: boolean }) {
  if (!managesLibrary(user)) throw new WorkflowError("FORBIDDEN", "Only HR managers and Admin change KRA templates.");
  const name = clean(input.name, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the template, for example \"Editor\".");
  const kras = (input.kras ?? []).map((k) => ({ name: clean(k.name, 60), weight: Number(k.weight) || 0, kpis: (k.kpis ?? []).map((x) => ({ kpi: String(x.kpi), weight: Number(x.weight) || 0, target: Number(x.target) || 0 })) }));
  const warnings = checkTemplate(kras, await listKpis());
  const appliesTo = [...new Set((input.appliesTo ?? []).map((a) => clean(a, 60)).filter(Boolean))];
  if (!appliesTo.length) throw new WorkflowError("VALIDATION", "Say who it is for (a role, a production lead or a department position).");
  const now = nowIso();
  let id = input.id ?? null;
  if (id) await run("UPDATE perf_templates SET name = ?, applies_to = ?, kras = ?, active = ?, version = version + 1, updated_at = ? WHERE id = ?", name, JSON.stringify(appliesTo), JSON.stringify(kras), input.active === false ? 0 : 1, now, id);
  else {
    id = uid("tpl_");
    await run("INSERT INTO perf_templates (id, name, applies_to, kras, active, updated_at) VALUES (?, ?, ?, ?, ?, ?)", id, name, JSON.stringify(appliesTo), JSON.stringify(kras), input.active === false ? 0 : 1, now);
  }
  await audit({ actor: user }, { action: "perf.library", summary: `${user.name} saved the KRA template ${name}` });
  return { id, warnings };
}

// What a person is, most specific first: department positions, customer support, production leads, roles.
async function personKeys(u: { id: string; roles: string[]; leads: string[] }) {
  const pos = await all<{ department: string; position: string }>("SELECT department, position FROM department_positions WHERE user_id = ?", u.id);
  const support = (await all<{ members: string }>("SELECT members FROM sup_queues WHERE active = 1")).some((q) => parseJson<string[]>(q.members, []).includes(u.id));
  return [...pos.map((p) => `dept:${p.department}:${p.position}`), ...(support ? ["support:agent"] : []), ...u.leads.map((l) => `lead:${l}`), ...u.roles.map((r) => `role:${r}`), "*"];
}

export async function templateFor(u: { id: string; roles: string[]; leads: string[] }, templates?: Template[]) {
  const ts = (templates ?? (await listTemplates())).filter((t) => t.active);
  for (const k of await personKeys(u)) {
    const t = ts.find((x) => x.appliesTo.includes(k));
    if (t) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Targets and typed-in values
// ---------------------------------------------------------------------------

export async function setTarget(user: AppUser, input: { userId: string; kpi: string; period: string; target: number; reason: string }) {
  if (!(await manages(user, input.userId))) throw new WorkflowError("FORBIDDEN", "Leads set targets for their own team; HR for anyone.");
  if (!isPeriod(input.period)) throw new WorkflowError("VALIDATION", "Choose the month.");
  const reason = clean(input.reason, 300);
  if (!reason) throw new WorkflowError("VALIDATION", "Say why this person's target differs.");
  if (await periodClosed(input.period)) throw new WorkflowError("INVALID_STATE", "That month is closed.");
  // A lead's change to a month already started needs HR's approval; HR's own changes, and future months, do not.
  const pending = !managesLibrary(user) && input.period <= (await currentPeriod());
  const now = nowIso();
  await run(
    `INSERT INTO perf_targets (id, user_id, kpi_key, period, target, reason, status, set_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, kpi_key, period) DO UPDATE SET target = excluded.target, reason = excluded.reason, status = excluded.status, set_by = excluded.set_by, decided_by = NULL, created_at = excluded.created_at`,
    uid("tgt_"),
    input.userId,
    input.kpi,
    input.period,
    Number(input.target),
    reason,
    pending ? "pending" : "approved",
    user.id,
    now,
  );
  const name = (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", input.userId))?.name;
  await audit({ actor: user }, { action: "perf.target", summary: `${user.name} set ${name}'s target for ${input.kpi} in ${input.period} to ${input.target}${pending ? " (waits for HR)" : ""}`, reason });
  if (pending) await notify(await libraryIds(), { type: "approval", title: `Target change for ${name} waits for you`, body: `${input.kpi}: ${input.target} in ${input.period}. ${reason}`, link: "/performance?tab=periods" }, now, user.id);
  else await notify([input.userId], { type: "hr", title: "A target of yours changed", body: `${input.kpi}: ${input.target} in ${input.period}. ${reason}`, link: "/performance" }, now, user.id);
  return pending ? "pending" : "approved";
}

async function libraryIds() {
  return (await listUsers()).filter((u) => u.perms.includes("perf.library")).map((u) => u.id);
}

// A typed-in KPI's value (by the person's lead or HR), or a correction after the month closed (HR approves).
export async function enterValue(user: AppUser, input: { userId: string; kpi: string; period: string; value: number; note?: string | null }) {
  if (!(await manages(user, input.userId))) throw new WorkflowError("FORBIDDEN", "Leads enter values for their own team; HR for anyone.");
  if (!isPeriod(input.period)) throw new WorkflowError("VALIDATION", "Choose the month.");
  if (!Number.isFinite(Number(input.value))) throw new WorkflowError("VALIDATION", "Enter a number.");
  const closed = await periodClosed(input.period);
  const note = clean(input.note, 300) || null;
  if (closed && !note) throw new WorkflowError("VALIDATION", "The month is closed: say why the number changes. HR approves it.");
  const status = closed && !managesLibrary(user) ? "pending" : "approved";
  await run(
    "INSERT INTO perf_values (id, subject, kpi_key, period, value, source, note, status, entered_by, decided_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    uid("pv_"),
    `user:${input.userId}`,
    input.kpi,
    input.period,
    Number(input.value),
    closed ? "correction" : "manual",
    note,
    status,
    user.id,
    status === "approved" && closed ? user.id : null,
    nowIso(),
  );
  if (status === "pending") await notify(await libraryIds(), { type: "approval", title: "A scorecard correction waits for you", body: `${input.kpi} in ${input.period}: ${input.value}. ${note}`, link: "/performance?tab=periods" }, nowIso(), user.id);
  else if (closed) await refreeze(input.userId, input.period);
  await audit({ actor: user }, { action: "perf.value", summary: `${user.name} entered ${input.kpi} = ${input.value} for ${input.period}${status === "pending" ? " (waits for HR)" : ""}`, reason: note });
  return status;
}

export async function pendingChanges(user: AppUser) {
  if (!managesLibrary(user)) throw new WorkflowError("FORBIDDEN", "Only HR managers and Admin approve changes.");
  const targets = await all<{ id: string; name: string; kpi_key: string; period: string; target: number; reason: string | null; by: string | null }>(
    "SELECT t.id, u.name, t.kpi_key, t.period, t.target, t.reason, s.name AS by FROM perf_targets t JOIN users u ON u.id = t.user_id LEFT JOIN users s ON s.id = t.set_by WHERE t.status = 'pending' ORDER BY t.created_at",
  );
  const values = await all<{ id: string; subject: string; name: string | null; kpi_key: string; period: string; value: number; note: string | null; by: string | null }>(
    "SELECT v.id, v.subject, u.name, v.kpi_key, v.period, v.value, v.note, s.name AS by FROM perf_values v LEFT JOIN users u ON 'user:' || u.id = v.subject LEFT JOIN users s ON s.id = v.entered_by WHERE v.status = 'pending' ORDER BY v.created_at",
  );
  return { targets, values };
}

export async function decideChange(user: AppUser, kind: "target" | "value", id: string, approve: boolean) {
  if (!managesLibrary(user)) throw new WorkflowError("FORBIDDEN", "Only HR managers and Admin approve changes.");
  if (kind === "target") {
    const t = await get<{ user_id: string; period: string }>("SELECT user_id, period FROM perf_targets WHERE id = ?", id);
    if (!t) return;
    if (approve) await run("UPDATE perf_targets SET status = 'approved', decided_by = ? WHERE id = ?", user.id, id);
    else await run("DELETE FROM perf_targets WHERE id = ?", id);
  } else {
    const v = await get<{ subject: string; period: string }>("SELECT subject, period FROM perf_values WHERE id = ?", id);
    if (!v) return;
    await run("UPDATE perf_values SET status = ?, decided_by = ? WHERE id = ?", approve ? "approved" : "rejected", user.id, id);
    if (approve && v.subject.startsWith("user:") && (await periodClosed(v.period))) await refreeze(v.subject.slice(5), v.period);
  }
  await audit({ actor: user }, { action: "perf.approve", summary: `${user.name} ${approve ? "approved" : "refused"} a ${kind === "target" ? "target change" : "scorecard correction"}` });
}

// ---------------------------------------------------------------------------
// Scorecards
// ---------------------------------------------------------------------------

async function periodClosed(period: string) {
  return (await get<{ status: string }>("SELECT status FROM perf_periods WHERE period = ?", period))?.status === "closed";
}

type Person = { id: string; name: string; roles: string[]; leads: string[] };

// Scorecards for several people in a month, computed in one pass per measure.
export async function computeScorecards(people: Person[], period: string): Promise<Scorecard[]> {
  if (!people.length) return [];
  const cfg = await perfConfig();
  const kpis = await listKpis();
  const templates = await listTemplates();
  const ids = people.map((p) => p.id);
  const tpl = new Map<string, Template | null>();
  for (const p of people) tpl.set(p.id, await templateFor(p, templates));
  const used = new Set([...tpl.values()].flatMap((t) => t?.kras.flatMap((k) => k.kpis.map((x) => x.kpi)) ?? []));
  const measured = new Map<string, Map<string, Agg>>();
  const before = new Map<string, Map<string, Agg>>();
  for (const k of used) {
    const def = kpis.find((d) => d.key === k);
    if (def?.source === "measure" && def.measure) {
      measured.set(k, await measureFor(def.measure, period, ids));
      before.set(k, await measureFor(def.measure, prevPeriod(period), ids));
    }
  }
  const ph = ids.map(() => "?").join(",");
  const typed = await all<{ subject: string; kpi_key: string; value: number; source: string; note: string | null }>(
    `SELECT subject, kpi_key, value, source, note FROM perf_values WHERE period = ? AND status = 'approved' AND subject IN (${ph}) ORDER BY created_at`,
    period,
    ...ids.map((i) => `user:${i}`),
  );
  const targets = await all<{ user_id: string; kpi_key: string; target: number }>(`SELECT user_id, kpi_key, target FROM perf_targets WHERE period = ? AND status = 'approved' AND user_id IN (${ph})`, period, ...ids);
  // In the month still running, monthly amounts are compared with the part of the month gone (day 10 of 30: a
  // third of the target), so nobody looks behind just because the month is not over.
  const cur = await currentPeriod();
  const dayNow = Number((await today()).slice(8, 10));
  const [py, pm] = period.split("-").map(Number);
  const share = period === cur ? Math.min(1, dayNow / new Date(Date.UTC(py!, pm!, 0)).getUTCDate()) : 1;
  return people.map((p) => {
    const t = tpl.get(p.id) ?? null;
    const warnings: string[] = [];
    const kras: KraLine[] = (t?.kras ?? []).map((k) => {
      const lines: KpiLine[] = k.kpis.map((x) => {
        const def = kpis.find((d) => d.key === x.kpi);
        const own = targets.find((g) => g.user_id === p.id && g.kpi_key === x.kpi);
        const manual = typed.filter((v) => v.subject === `user:${p.id}` && v.kpi_key === x.kpi).pop();
        let value: number | null = null;
        let sample = 0;
        let source: KpiLine["source"] = null;
        if (manual) ((value = Number(manual.value)), (sample = 1), (source = manual.source === "correction" ? "correction" : "manual"));
        else if (def?.source === "measure" && def.measure) {
          const v = valueOf(def.measure, measured.get(x.kpi)?.get(p.id));
          ((value = v.value), (sample = v.sample), (source = "measure"));
        }
        // A count with nothing recorded is a real zero; a rate or average with no sample has no value yet.
        // Attendance numbers are only real with attendance records (absence_days and overtime come from timesheets).
        if (value === null && def?.source === "measure" && def.measure && measureDef(def.measure)?.unit !== "percent" && !["prod_cycle_days", "support_first_response", "support_csat", "absence_days", "overtime_hours"].includes(def.measure)) value = 0;
        const monthly = def?.direction === "up" && ["count", "hours", "money"].includes(def.unit);
        const target = Math.round((own ? Number(own.target) : x.target) * (monthly ? share : 1) * 10) / 10;
        const enough = value !== null && (def?.minSample ?? 0) <= sample;
        const prev = def?.measure ? valueOf(def.measure, before.get(x.kpi)?.get(p.id)).value : null;
        return {
          kpi: x.kpi,
          name: def?.name ?? x.kpi,
          unit: def?.unit ?? "count",
          direction: def?.direction ?? "up",
          weight: x.weight,
          target,
          targetOverridden: !!own,
          value,
          sample,
          score: def && enough && value !== null ? Math.round(kpiScore(def, value, target)) : null,
          note: value !== null && !enough ? `Fewer than ${def?.minSample} to count` : monthly && share < 1 ? `Target so far this month (${own ? Number(own.target) : x.target} for the whole month)` : (manual?.note ?? null),
          source,
          previous: prev,
        };
      });
      const scored = lines.filter((l) => l.score !== null);
      const w = scored.reduce((a, l) => a + l.weight, 0);
      return { name: k.name, weight: k.weight, score: w ? Math.round(scored.reduce((a, l) => a + l.score! * l.weight, 0) / w) : null, kpis: lines };
    });
    const scoredK = kras.filter((k) => k.score !== null);
    const w = scoredK.reduce((a, k) => a + k.weight, 0);
    const score = w ? Math.round(scoredK.reduce((a, k) => a + k.score! * k.weight, 0) / w) : null;
    if (!t) warnings.push("No KRA template fits this person yet (HR, Performance, Library).");
    return { userId: p.id, name: p.name, period, template: t?.name ?? null, score, rating: ratingOf(score, cfg.ratings), kras, frozen: false, warnings };
  });
}

// A month's scorecard: the frozen copy once the month is closed, else computed now.
async function scorecardsFor(people: Person[], period: string): Promise<Scorecard[]> {
  if (await periodClosed(period)) {
    const ph = people.map(() => "?").join(",");
    const frozen = new Map((await all<{ subject: string; detail: string }>(`SELECT subject, detail FROM perf_scorecards WHERE period = ? AND frozen = 1 AND subject IN (${ph})`, period, ...people.map((p) => `user:${p.id}`))).map((r) => [r.subject.slice(5), parseJson<Scorecard>(r.detail, null as unknown as Scorecard)]));
    const missing = people.filter((p) => !frozen.has(p.id));
    const fresh = await computeScorecards(missing, period);
    return people.map((p) => (frozen.has(p.id) ? { ...frozen.get(p.id)!, frozen: true } : fresh.find((f) => f.userId === p.id)!));
  }
  return computeScorecards(people, period);
}

export async function myScorecard(user: AppUser, userId: string, period?: string | null) {
  const cfg = await perfConfig();
  if (!cfg.enabled) throw new WorkflowError("INVALID_STATE", "Performance is switched off.");
  if (!(await canSeePerson(user, userId, cfg))) throw new WorkflowError("FORBIDDEN", userId === user.id ? "Scorecards are shown to leads and HR for now." : "You see your own team's scorecards only.");
  const p = isPeriod(period) ? period : await currentPeriod();
  const u = (await listUsers({ includeInactive: true })).find((x) => x.id === userId);
  if (!u) throw new WorkflowError("NOT_FOUND", "Person not found.");
  const [card] = await scorecardsFor([u], p);
  // The last six months' scores, for the trend.
  const trend: { period: string; score: number | null }[] = [];
  let q = p;
  for (let i = 0; i < 6; i++) {
    q = prevPeriod(q);
    const s = await get<{ score: number | null }>("SELECT score FROM perf_scorecards WHERE subject = ? AND period = ?", `user:${userId}`, q);
    trend.unshift({ period: q, score: s?.score === null || s?.score === undefined ? null : Number(s.score) });
  }
  return { card: card!, trend, canEdit: await manages(user, userId) };
}

export async function teamScorecards(user: AppUser, period?: string | null) {
  const p = isPeriod(period) ? period : await currentPeriod();
  const ids = seesCompany(user) ? null : await managedUserIds(user);
  const people = (await listUsers()).filter((u) => (ids ? ids.includes(u.id) : true));
  if (ids && !ids.length) throw new WorkflowError("FORBIDDEN", "You do not lead a team.");
  const cards = await scorecardsFor(people, p);
  return cards.filter((c) => c.template !== null).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// Departments' average scores, the spread of ratings (calibration), and each KPI added up across the company.
export async function companyScorecard(user: AppUser, period?: string | null) {
  if (!seesCompany(user)) throw new WorkflowError("FORBIDDEN", "The company scorecard is for owners and HR.");
  const p = isPeriod(period) ? period : await currentPeriod();
  const cfg = await perfConfig();
  const cards = (await scorecardsFor(await listUsers(), p)).filter((c) => c.score !== null);
  const deptOf = new Map((await all<{ user_id: string; department: string | null }>("SELECT user_id, department FROM employees WHERE user_id IS NOT NULL")).map((e) => [e.user_id, e.department ?? "No department"]));
  const byDept = new Map<string, Scorecard[]>();
  for (const c of cards) {
    const d = deptOf.get(c.userId) ?? "No department";
    byDept.set(d, [...(byDept.get(d) ?? []), c]);
  }
  const departments = [...byDept].map(([d, cs]) => ({
    department: d,
    people: cs.length,
    score: Math.round(cs.reduce((a, c) => a + c.score!, 0) / cs.length),
    ratings: Object.fromEntries(cfg.ratings.map((r) => [r.label, cs.filter((c) => c.rating === r.label).length])),
  }));
  // Company KPIs: each measure added up over everyone (numerators and samples, not averages of averages).
  const ids = (await listUsers()).map((u) => u.id);
  const kpis: { key: string; name: string; unit: string; value: number | null; sample: number; previous: number | null }[] = [];
  for (const m of MEASURES) {
    const now = valueOf(m.key, addAgg([...(await measureFor(m.key, p, ids)).values()]));
    if (now.value === null || (!now.sample && m.unit !== "percent")) continue;
    kpis.push({ key: m.key, name: m.name, unit: m.unit, value: now.value, sample: now.sample, previous: valueOf(m.key, addAgg([...(await measureFor(m.key, prevPeriod(p), ids)).values()])).value });
  }
  return { period: p, departments: departments.sort((a, b) => b.score - a.score), ratings: cfg.ratings.map((r) => r.label), kpis, people: cards.length };
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export async function periods() {
  return all<{ period: string; status: string; closed_at: string | null; by: string | null }>("SELECT p.period, p.status, p.closed_at, u.name AS by FROM perf_periods p LEFT JOIN users u ON u.id = p.closed_by ORDER BY p.period DESC LIMIT 24");
}

async function freeze(cards: Scorecard[], period: string) {
  const now = nowIso();
  for (const c of cards)
    await run(
      "INSERT INTO perf_scorecards (subject, period, score, rating, detail, computed_at, frozen) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT (subject, period) DO UPDATE SET score = excluded.score, rating = excluded.rating, detail = excluded.detail, computed_at = excluded.computed_at, frozen = 1",
      `user:${c.userId}`,
      period,
      c.score,
      c.rating,
      JSON.stringify({ ...c, frozen: true }),
      now,
    );
}

async function refreeze(userId: string, period: string) {
  const u = (await listUsers({ includeInactive: true })).find((x) => x.id === userId);
  if (u) await freeze(await computeScorecards([u], period), period);
}

export async function closePeriod(user: AppUser | null, period: string) {
  if (user && !managesLibrary(user)) throw new WorkflowError("FORBIDDEN", "Only HR managers and Admin close a month.");
  if (!isPeriod(period) || period >= (await currentPeriod())) throw new WorkflowError("VALIDATION", "Only a month that is over can be closed.");
  if (await periodClosed(period)) return 0;
  const cards = (await computeScorecards(await listUsers(), period)).filter((c) => c.template);
  await freeze(cards, period);
  await run("INSERT INTO perf_periods (period, status, closed_at, closed_by) VALUES (?, 'closed', ?, ?) ON CONFLICT (period) DO UPDATE SET status = 'closed', closed_at = excluded.closed_at, closed_by = excluded.closed_by", period, nowIso(), user?.id ?? null);
  if (user) await audit({ actor: user }, { action: "perf.period", summary: `${user.name} closed ${period}: ${cards.length} scorecards frozen` });
  return cards.length;
}

export async function reopenPeriod(user: AppUser, period: string) {
  if (!managesLibrary(user)) throw new WorkflowError("FORBIDDEN", "Only HR managers and Admin reopen a month.");
  await run("UPDATE perf_periods SET status = 'open' WHERE period = ?", period);
  await run("UPDATE perf_scorecards SET frozen = 0 WHERE period = ?", period);
  await audit({ actor: user }, { action: "perf.period", summary: `${user.name} reopened ${period}` });
}

// For HR reviews: the scorecards of a person over a range of months, as evidence beside the rating.
export async function scorecardEvidence(userId: string, from: string, to: string) {
  return all<{ period: string; score: number | null; rating: string | null }>("SELECT period, score, rating FROM perf_scorecards WHERE subject = ? AND period >= ? AND period <= ? ORDER BY period", `user:${userId}`, from.slice(0, 7), to.slice(0, 7));
}

// ---------------------------------------------------------------------------
// OKRs
// ---------------------------------------------------------------------------

export type Objective = { id: string; cycle_id: string; level: OkrLevel; scope: string | null; owner_id: string | null; owner: string | null; title: string; parent_id: string | null; visibility: string; score: number | null; reflection: string | null; krs: KeyResult[] };
export type KeyResult = { id: string; objective_id: string; title: string; kind: string; start_value: number; target: number; current: number; unit: string | null; kpi_key: string | null; confidence: string | null; updated_at: string; score: number; tasks: { total: number; done: number } };

export async function cycles() {
  return all<{ id: string; name: string; start_date: string; end_date: string; status: string; max_objectives: number; max_krs: number }>("SELECT * FROM okr_cycles ORDER BY start_date DESC LIMIT 12");
}

export async function saveCycle(user: AppUser, input: { id?: string | null; name: string; start: string; end: string; maxObjectives?: number; maxKrs?: number; status?: string }) {
  if (!managesLibrary(user) && !can(user, "owners.view")) throw new WorkflowError("FORBIDDEN", "HR, owners and Admin set OKR cycles.");
  const name = clean(input.name, 60);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end) || input.end <= input.start) throw new WorkflowError("VALIDATION", "Give the name, the first and the last day.");
  const mo = Math.max(1, Math.min(20, Math.round(Number(input.maxObjectives ?? 5))));
  const mk = Math.max(1, Math.min(20, Math.round(Number(input.maxKrs ?? 5))));
  if (input.id) {
    await run("UPDATE okr_cycles SET name = ?, start_date = ?, end_date = ?, max_objectives = ?, max_krs = ?, status = ? WHERE id = ?", name, input.start, input.end, mo, mk, input.status === "closed" ? "closed" : "open", input.id);
    return input.id;
  }
  const id = uid("cyc_");
  await run("INSERT INTO okr_cycles (id, name, start_date, end_date, status, max_objectives, max_krs, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?)", id, name, input.start, input.end, mo, mk, nowIso());
  await audit({ actor: user }, { action: "okr.cycle", summary: `${user.name} opened the OKR cycle ${name}` });
  return id;
}

// Who may write at a level: the company (owners, HR, Admin); a department (its head or lead, HR); a team (a lead);
// a person (themselves, their lead, HR).
async function canWriteAt(user: AppUser, level: OkrLevel, scope: string | null) {
  if (managesLibrary(user) || can(user, "owners.view")) return true;
  if (level === "company") return false;
  if (level === "department") return !!scope && !!(await get("SELECT 1 AS x FROM department_positions WHERE user_id = ? AND department = ? AND position IN ('head','lead')", user.id, scope));
  if (level === "team") return user.leads.length > 0 || (await managedUserIds(user)).length > 0;
  return scope === user.id || (!!scope && (await managedUserIds(user)).includes(scope));
}

async function visibleTo(user: AppUser, o: { visibility: string; level: string; scope: string | null; owner_id: string | null }) {
  if (o.visibility === "everyone" || seesCompany(user) || o.owner_id === user.id) return true;
  if (o.visibility === "department") {
    const mine = await deptsOf(user.id);
    const theirs = o.level === "department" && o.scope ? [o.scope] : o.owner_id ? await deptsOf(o.owner_id) : [];
    return theirs.some((d) => mine.includes(d));
  }
  return !!o.owner_id && (await managedUserIds(user)).includes(o.owner_id);
}

// The departments a person belongs to: by position, and the built-in ones their roles put them in.
async function deptsOf(userId: string) {
  const { DEPARTMENT_ROLES } = await import("@/lib/domain");
  const roles = (await all<{ role: string }>("SELECT role FROM role_assignments WHERE user_id = ?", userId)).map((r) => r.role);
  const byRole = Object.entries(DEPARTMENT_ROLES as Record<string, readonly string[]>).filter(([, rs]) => rs.some((r) => roles.includes(r))).map(([d]) => d);
  return [...new Set([...(await all<{ department: string }>("SELECT department FROM department_positions WHERE user_id = ?", userId)).map((r) => r.department), ...byRole])];
}

export async function okrTree(user: AppUser, cycleId: string) {
  const objs = await all<Omit<Objective, "krs">>("SELECT o.*, u.name AS owner FROM okr_objectives o LEFT JOIN users u ON u.id = o.owner_id WHERE o.cycle_id = ? ORDER BY CASE o.level WHEN 'company' THEN 0 WHEN 'department' THEN 1 WHEN 'team' THEN 2 ELSE 3 END, o.created_at", cycleId);
  const out: Objective[] = [];
  for (const o of objs) {
    if (!(await visibleTo(user, o))) continue;
    const krs = await all<Omit<KeyResult, "score" | "tasks">>("SELECT * FROM okr_key_results WHERE objective_id = ? ORDER BY updated_at", o.id);
    const withScores: KeyResult[] = [];
    for (const k of krs) {
      const t = await get<{ total: number; done: number }>("SELECT COUNT(*) AS total, SUM(CASE WHEN status_category = 'done' THEN 1 ELSE 0 END) AS done FROM dept_tasks WHERE key_result_id = ?", k.id);
      const kk = { ...k, start_value: Number(k.start_value), target: Number(k.target), current: Number(k.current) };
      withScores.push({ ...kk, score: Math.round(krScore(kk) * 100) / 100, tasks: { total: Number(t?.total ?? 0), done: Number(t?.done ?? 0) } });
    }
    out.push({ ...o, score: withScores.length ? Math.round((withScores.reduce((a, k) => a + k.score, 0) / withScores.length) * 100) / 100 : null, krs: withScores });
  }
  return out;
}

export async function saveObjective(user: AppUser, input: { id?: string | null; cycleId: string; level: OkrLevel; scope?: string | null; ownerId?: string | null; title: string; parentId?: string | null; visibility?: string }) {
  const title = clean(input.title, 200);
  if (!title) throw new WorkflowError("VALIDATION", "Write the objective.");
  if (!["company", "department", "team", "person"].includes(input.level)) throw new WorkflowError("VALIDATION", "Choose the level.");
  const scope = input.level === "person" ? (input.scope ?? user.id) : (input.scope ?? null);
  if (input.level === "department" && !scope) throw new WorkflowError("VALIDATION", "Choose the department.");
  if (!(await canWriteAt(user, input.level, scope))) throw new WorkflowError("FORBIDDEN", "You cannot set objectives at that level.");
  const cyc = await get<{ max_objectives: number; status: string }>("SELECT max_objectives, status FROM okr_cycles WHERE id = ?", input.cycleId);
  if (!cyc || cyc.status !== "open") throw new WorkflowError("INVALID_STATE", "Choose an open cycle.");
  const owner = input.ownerId ?? (input.level === "person" ? scope : user.id);
  const visibility = ["everyone", "department", "private"].includes(input.visibility ?? "") ? input.visibility! : "everyone";
  if (input.id) {
    await run("UPDATE okr_objectives SET title = ?, parent_id = ?, visibility = ?, owner_id = ? WHERE id = ?", title, input.parentId || null, visibility, owner, input.id);
    return input.id;
  }
  const count = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM okr_objectives WHERE cycle_id = ? AND level = ? AND COALESCE(scope, '') = ?", input.cycleId, input.level, scope ?? ""))?.c ?? 0);
  if (count >= Number(cyc.max_objectives)) throw new WorkflowError("VALIDATION", `At most ${cyc.max_objectives} objectives here in a cycle: fewer, sharper objectives work better.`);
  const id = uid("obj_");
  await run("INSERT INTO okr_objectives (id, cycle_id, level, scope, owner_id, title, parent_id, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, input.cycleId, input.level, scope, owner, title, input.parentId || null, visibility, nowIso());
  await audit({ actor: user }, { action: "okr.objective", summary: `${user.name} set the objective "${title}"` });
  return id;
}

async function objectiveFor(user: AppUser, objectiveId: string) {
  const o = await get<{ id: string; cycle_id: string; level: OkrLevel; scope: string | null; owner_id: string | null; title: string; parent_id: string | null }>("SELECT * FROM okr_objectives WHERE id = ?", objectiveId);
  if (!o) throw new WorkflowError("NOT_FOUND", "Objective not found.");
  if (o.owner_id !== user.id && !(await canWriteAt(user, o.level, o.scope))) throw new WorkflowError("FORBIDDEN", "Only its owner or their lead changes it.");
  return o;
}

export async function saveKeyResult(user: AppUser, input: { id?: string | null; objectiveId: string; title: string; kind?: string; start?: number; target: number; unit?: string | null; kpiKey?: string | null }) {
  const o = await objectiveFor(user, input.objectiveId);
  const title = clean(input.title, 200);
  if (!title) throw new WorkflowError("VALIDATION", "Write the key result.");
  const kind = input.kind === "milestone" ? "milestone" : "number";
  const start = kind === "milestone" ? 0 : Number(input.start ?? 0);
  const target = kind === "milestone" ? 1 : Number(input.target);
  if (!Number.isFinite(target) || (kind === "number" && target === start)) throw new WorkflowError("VALIDATION", "The target must differ from the start.");
  const kpiKey = input.kpiKey && measureDef(input.kpiKey) ? input.kpiKey : null;
  const now = nowIso();
  if (input.id) {
    await run("UPDATE okr_key_results SET title = ?, kind = ?, start_value = ?, target = ?, unit = ?, kpi_key = ?, updated_at = ? WHERE id = ?", title, kind, start, target, clean(input.unit, 20) || null, kpiKey, now, input.id);
    return input.id;
  }
  const max = Number((await get<{ max_krs: number }>("SELECT max_krs FROM okr_cycles WHERE id = ?", o.cycle_id))?.max_krs ?? 5);
  if (Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM okr_key_results WHERE objective_id = ?", o.id))?.c ?? 0) >= max) throw new WorkflowError("VALIDATION", `At most ${max} key results per objective.`);
  const id = uid("kr_");
  await run("INSERT INTO okr_key_results (id, objective_id, title, kind, start_value, target, current, unit, kpi_key, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, o.id, title, kind, start, target, start, clean(input.unit, 20) || null, kpiKey, now);
  if (kpiKey) await refreshLinkedKr(id);
  return id;
}

// A key result linked to a measure moves by itself: the measure over the cycle so far, for the objective's owner
// (a person or team lead's team), the department's members, or everyone (company).
export async function refreshLinkedKr(krId: string) {
  const k = await get<{ id: string; kpi_key: string | null; objective_id: string }>("SELECT id, kpi_key, objective_id FROM okr_key_results WHERE id = ?", krId);
  if (!k?.kpi_key) return;
  const o = await get<{ level: string; scope: string | null; owner_id: string | null; cycle_id: string }>("SELECT level, scope, owner_id, cycle_id FROM okr_objectives WHERE id = ?", k.objective_id);
  const c = o ? await get<{ start_date: string; end_date: string }>("SELECT start_date, end_date FROM okr_cycles WHERE id = ?", o.cycle_id) : null;
  if (!o || !c) return;
  let ids: string[] = [];
  if (o.level === "company") ids = (await listUsers()).map((u) => u.id);
  else if (o.level === "department" && o.scope) ids = (await (await import("./departments")).deptPeople(o.scope)).map((p) => p.id);
  else if (o.level === "team" && o.owner_id) {
    const lead = (await listUsers()).find((u) => u.id === o.owner_id);
    ids = lead ? [lead.id, ...(await managedUserIds(lead))] : [];
  } else if (o.owner_id) ids = [o.owner_id];
  if (!ids.length) return;
  const aggs: (Agg | undefined)[] = [];
  const end = c.end_date.slice(0, 7) < (await currentPeriod()) ? c.end_date.slice(0, 7) : await currentPeriod();
  for (let p = c.start_date.slice(0, 7); p <= end; p = new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 1)).toISOString().slice(0, 7)) aggs.push(addAgg([...(await measureFor(k.kpi_key, p, ids)).values()]));
  const v = valueOf(k.kpi_key, addAgg(aggs)).value;
  if (v !== null) await run("UPDATE okr_key_results SET current = ?, updated_at = ? WHERE id = ?", v, nowIso(), krId);
}

export async function checkIn(user: AppUser, krId: string, input: { value: number; confidence: Confidence; note?: string | null }) {
  const k = await get<{ id: string; objective_id: string; title: string; kind: string }>("SELECT id, objective_id, title, kind FROM okr_key_results WHERE id = ?", krId);
  if (!k) throw new WorkflowError("NOT_FOUND", "Key result not found.");
  const o = await objectiveFor(user, k.objective_id);
  if (!["on_track", "at_risk", "off_track"].includes(input.confidence)) throw new WorkflowError("VALIDATION", "Say how confident you are.");
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new WorkflowError("VALIDATION", "Enter the value now.");
  const now = nowIso();
  await run("INSERT INTO okr_checkins (id, kr_id, value, confidence, note, by_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)", uid("chk_"), krId, value, input.confidence, clean(input.note, 500) || null, user.id, now);
  await run("UPDATE okr_key_results SET current = ?, confidence = ?, updated_at = ? WHERE id = ?", value, input.confidence, now, krId);
  // Off track: the owner of the objective it supports (or HR) is told.
  if (input.confidence === "off_track") {
    const parent = o.parent_id ? await get<{ owner_id: string | null }>("SELECT owner_id FROM okr_objectives WHERE id = ?", o.parent_id) : null;
    const to = parent?.owner_id ? [parent.owner_id] : await libraryIds();
    await notify(to, { type: "deadline", title: `Off track: ${k.title}`, body: `${o.title}${input.note ? `. ${clean(input.note, 200)}` : ""}`, link: "/performance?tab=okrs", dedupeKey: `okr-off-${krId}-${now.slice(0, 10)}` }, now, user.id);
  }
}

export async function closeObjective(user: AppUser, objectiveId: string, reflection: string) {
  const o = await objectiveFor(user, objectiveId);
  const krs = await all<{ kind: string; start_value: number; target: number; current: number }>("SELECT kind, start_value, target, current FROM okr_key_results WHERE objective_id = ?", o.id);
  const score = krs.length ? Math.round((krs.reduce((a, k) => a + krScore({ ...k, start_value: Number(k.start_value), target: Number(k.target), current: Number(k.current) }), 0) / krs.length) * 100) / 100 : null;
  await run("UPDATE okr_objectives SET score = ?, reflection = ? WHERE id = ?", score, clean(reflection, 1000) || null, o.id);
  return score;
}

export async function linkTask(user: AppUser, krId: string, taskCode: string) {
  const k = await get<{ objective_id: string }>("SELECT objective_id FROM okr_key_results WHERE id = ?", krId);
  if (!k) throw new WorkflowError("NOT_FOUND", "Key result not found.");
  await objectiveFor(user, k.objective_id);
  const t = await get<{ id: string; dept: string }>("SELECT id, dept FROM dept_tasks WHERE UPPER(code) = UPPER(?)", clean(taskCode, 40));
  if (!t) throw new WorkflowError("NOT_FOUND", `No task ${taskCode}.`);
  const { workAccess } = await import("./dept-config");
  await workAccess(user, t.dept);
  await run("UPDATE dept_tasks SET key_result_id = ? WHERE id = ?", krId, t.id);
}

// ---------------------------------------------------------------------------
// Scheduled: close last month on its day, check-in reminders, KPIs turning red, linked key results
// ---------------------------------------------------------------------------

export async function performanceJob(now = nowIso()) {
  const cfg = await perfConfig();
  if (!cfg.enabled) return { closed: 0, reminded: 0, red: 0 };
  const day = localParts(now, (await getSettings()).workspace.timezone).date;
  const period = day.slice(0, 7);
  let closed = 0;
  if (cfg.closeDay && Number(day.slice(8, 10)) >= cfg.closeDay && !(await periodClosed(prevPeriod(period)))) closed = await closePeriod(null, prevPeriod(period));
  // Key results linked to measures.
  for (const k of await all<{ id: string }>("SELECT k.id FROM okr_key_results k JOIN okr_objectives o ON o.id = k.objective_id JOIN okr_cycles c ON c.id = o.cycle_id WHERE k.kpi_key IS NOT NULL AND c.status = 'open'")) await refreshLinkedKr(k.id);
  // Check-in reminders on the weekday, for key results not updated for six days.
  let reminded = 0;
  if (new Date(`${day}T12:00:00Z`).getUTCDay() === cfg.checkinDay) {
    const stale = await all<{ owner_id: string; n: number }>(
      `SELECT o.owner_id, COUNT(*) AS n FROM okr_key_results k JOIN okr_objectives o ON o.id = k.objective_id JOIN okr_cycles c ON c.id = o.cycle_id
       WHERE c.status = 'open' AND o.owner_id IS NOT NULL AND k.kpi_key IS NULL AND k.updated_at < ? GROUP BY o.owner_id`,
      new Date(Date.parse(now) - 6 * 864e5).toISOString(),
    );
    for (const s of stale) {
      await notify([s.owner_id], { type: "deadline", title: `Check in on ${s.n} key ${Number(s.n) === 1 ? "result" : "results"}`, body: "Update the value and how confident you are.", link: "/performance?tab=okrs", dedupeKey: `okr-checkin-${s.owner_id}-${day}` }, now);
      reminded++;
    }
  }
  // KPIs turning red this month (from the second week, once a month per KPI).
  let red = 0;
  if (Number(day.slice(8, 10)) >= 8) {
    const cards = await computeScorecards(await listUsers(), period);
    for (const c of cards)
      for (const k of c.kras.flatMap((x) => x.kpis))
        if (k.score !== null && k.score < cfg.redBelow) {
          await notify([c.userId], { type: "deadline", title: `${k.name} is red this month`, body: `${k.value} against a target of ${k.target}.`, link: "/performance", dedupeKey: `kpi-red-${c.userId}-${k.kpi}-${period}` }, now);
          red++;
        }
  }
  return { closed, reminded, red };
}

// ---------------------------------------------------------------------------
// Slides for the presentation studio (Phase 12c)
// ---------------------------------------------------------------------------

export async function companyPerformanceSlides(user: AppUser) {
  if (!seesCompany(user) || !(await perfConfig()).enabled) return [];
  const s = await companyScorecard(user);
  const slides: import("@/lib/deck").Slide[] = [];
  if (s.departments.length)
    slides.push({
      key: "kpis",
      group: "Performance",
      title: `Scorecards ${s.period}`,
      body: { kind: "table", columns: ["Department", "People", "Average score", ...s.ratings], rows: s.departments.map((d) => [d.department, d.people, d.score, ...s.ratings.map((r) => d.ratings[r] ?? 0)]) },
      say: `${s.people} scorecards this month; ${s.departments[0]!.department} has the highest average (${s.departments[0]!.score}).`,
      why: s.departments.length > 1 ? `${s.departments.at(-1)!.department} has the lowest (${s.departments.at(-1)!.score}).` : undefined,
      note: "Averages per department, and how many people in each rating.",
    });
  const cyc = (await cycles()).find((c) => c.status === "open");
  if (cyc) {
    const tree = (await okrTree(user, cyc.id)).filter((o) => o.level === "company" || o.level === "department");
    if (tree.length)
      slides.push({
        key: "okrs",
        group: "Performance",
        title: `Objectives: ${cyc.name}`,
        body: { kind: "progress", items: tree.map((o) => ({ label: o.title, value: Math.round((o.score ?? 0) * 100), tag: o.level === "company" ? "Company" : (o.scope ?? "Department"), tone: (o.score ?? 0) >= 0.7 ? "good" : (o.score ?? 0) >= 0.4 ? "neutral" : "bad" })) },
        say: `${tree.length} company and department objectives, ${tree.filter((o) => (o.score ?? 0) >= 0.7).length} at 70% or more.`,
        why: tree.some((o) => o.krs.some((k) => k.confidence === "off_track")) ? `${tree.flatMap((o) => o.krs).filter((k) => k.confidence === "off_track").length} key results are off track.` : undefined,
        note: "Progress of each objective from its key results.",
      });
  }
  return slides;
}

