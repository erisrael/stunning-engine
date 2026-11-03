// Strategic planning, monitoring and evaluation (Phase 25). See src/lib/strategy.ts for the method.
// Who: owners, Admin and HR managers (the KPI library right) plan and verify; whoever is named as responsible for an
// indicator enters its results; owners and those who see the company's scorecards read everything.

import { all, get, nowIso, parseJson, run, uid, type Param } from "./db";
import { can, listUsers, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { addAgg, measureDef, measureFor, valueOf } from "./measures";
import {
  achievement,
  CHILD_LEVEL,
  DAC_CRITERIA,
  FREQUENCIES,
  LEVELS,
  monthsOf,
  periodsOf,
  PERSPECTIVES,
  ragOf,
  riskLevel,
  riskScore,
  smartGaps,
  type DacCriterion,
  type Frequency,
  type Level,
  type Perspective,
  type Rag,
} from "@/lib/strategy";

const t = (v: unknown, n = 2000) => (v === null || v === undefined ? "" : String(v)).trim().slice(0, n);
const num = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function managesStrategy(u: AppUser) {
  return can(u, "perf.library") || can(u, "users.manage") || u.roles.includes("owner");
}
async function seesStrategy(u: AppUser) {
  if (managesStrategy(u) || can(u, "perf.view_company") || can(u, "owners.view")) return true;
  return !!(await get("SELECT 1 AS x FROM sp_indicators WHERE responsible_id = ? UNION SELECT 1 AS x FROM sp_nodes WHERE owner_id = ?", u.id, u.id));
}
const needManage = (u: AppUser) => {
  if (!managesStrategy(u)) throw new WorkflowError("FORBIDDEN", "Only owners, Admin and HR managers plan the strategy.");
};

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

type PlanRow = { id: string; name: string; start_date: string; end_date: string; vision: string | null; mission: string | null; values_json: string; pillars: string; status: string; rag_green: number; rag_amber: number; updated_at: string };
const planOf = (r: PlanRow) => ({
  id: r.id,
  name: r.name,
  start: r.start_date,
  end: r.end_date,
  vision: r.vision ?? "",
  mission: r.mission ?? "",
  values: parseJson<string[]>(r.values_json, []),
  pillars: parseJson<string[]>(r.pillars, []),
  status: r.status as "draft" | "active" | "closed",
  rag: { green: Number(r.rag_green), amber: Number(r.rag_amber) },
  updatedAt: r.updated_at,
});
export type Plan = ReturnType<typeof planOf>;

export async function listPlans(user: AppUser) {
  if (!(await seesStrategy(user))) throw new WorkflowError("FORBIDDEN", "The strategy is for owners, managers and the people reporting on it.");
  return (await all<PlanRow>("SELECT * FROM sp_plans ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, start_date DESC")).map(planOf);
}

export async function savePlan(user: AppUser, input: { id?: string | null; name: string; start: string; end: string; vision?: string; mission?: string; values?: string[]; pillars?: string[]; status?: string; rag?: { green: number; amber: number } }) {
  needManage(user);
  const name = t(input.name, 120);
  if (!name) throw new WorkflowError("VALIDATION", "Name the plan, for example \"Strategic plan 2026–2030\".");
  const start = day(input.start);
  const end = day(input.end);
  if (!start || !end || end <= start) throw new WorkflowError("VALIDATION", "Give the plan's start and end dates (the end after the start).");
  const green = Math.max(1, Math.min(150, Math.round(Number(input.rag?.green ?? 90))));
  const amber = Math.max(0, Math.min(green - 1, Math.round(Number(input.rag?.amber ?? 70))));
  const status = ["draft", "active", "closed"].includes(input.status ?? "") ? input.status! : "draft";
  const vals: Param[] = [name, start, end, t(input.vision, 1000) || null, t(input.mission, 1000) || null, JSON.stringify((input.values ?? []).map((v) => t(v, 120)).filter(Boolean).slice(0, 12)), JSON.stringify((input.pillars ?? []).map((v) => t(v, 120)).filter(Boolean).slice(0, 12)), status, green, amber, nowIso()];
  if (input.id) {
    if (!(await get("SELECT 1 AS x FROM sp_plans WHERE id = ?", input.id))) throw new WorkflowError("NOT_FOUND", "Plan not found.");
    await run("UPDATE sp_plans SET name = ?, start_date = ?, end_date = ?, vision = ?, mission = ?, values_json = ?, pillars = ?, status = ?, rag_green = ?, rag_amber = ?, updated_at = ? WHERE id = ?", ...vals, input.id);
    await audit({ actor: user }, { action: "strategy.plan", summary: `${user.name} changed the plan "${name}"` });
    return input.id;
  }
  const id = uid("spl_");
  await run("INSERT INTO sp_plans (name, start_date, end_date, vision, mission, values_json, pillars, status, rag_green, rag_amber, updated_at, id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...vals, id, user.id, nowIso());
  await audit({ actor: user }, { action: "strategy.plan", summary: `${user.name} started the plan "${name}"` });
  return id;
}

export async function deletePlan(user: AppUser, id: string) {
  needManage(user);
  const p = await get<{ name: string }>("SELECT name FROM sp_plans WHERE id = ?", id);
  if (!p) return;
  await run("DELETE FROM sp_plans WHERE id = ?", id);
  await audit({ actor: user }, { action: "strategy.plan", summary: `${user.name} deleted the plan "${p.name}"` });
}

// ---------------------------------------------------------------------------
// The results chain
// ---------------------------------------------------------------------------

export async function saveNode(user: AppUser, input: { id?: string | null; planId: string; parentId?: string | null; level: Level; title: string; description?: string; pillar?: string | null; perspective?: Perspective | null; ownerId?: string | null; assumptions?: string; status?: string; start?: string | null; end?: string | null; budget?: number | null }) {
  needManage(user);
  if (!(await get("SELECT 1 AS x FROM sp_plans WHERE id = ?", input.planId))) throw new WorkflowError("NOT_FOUND", "Plan not found.");
  if (!(input.level in LEVELS)) throw new WorkflowError("VALIDATION", "Choose the level: goal, outcome, output or activity.");
  const title = t(input.title, 300);
  if (!title) throw new WorkflowError("VALIDATION", "Write the result, for example \"More students learn with Myseed lessons\".");
  if (input.parentId) {
    const parent = await get<{ level: Level; plan_id: string }>("SELECT level, plan_id FROM sp_nodes WHERE id = ?", input.parentId);
    if (!parent || parent.plan_id !== input.planId) throw new WorkflowError("VALIDATION", "The result it belongs to is not in this plan.");
    if (CHILD_LEVEL[parent.level] !== input.level) throw new WorkflowError("VALIDATION", `Under a ${LEVELS[parent.level].toLowerCase()} comes a ${LEVELS[CHILD_LEVEL[parent.level] ?? "activity"].toLowerCase()}.`);
  } else if (input.level !== "goal") throw new WorkflowError("VALIDATION", "Only a goal stands on its own; put the rest under the result it serves.");
  const vals: Param[] = [
    input.parentId ?? null,
    input.level,
    title,
    t(input.description, 2000) || null,
    t(input.pillar, 120) || null,
    input.perspective && input.perspective in PERSPECTIVES ? input.perspective : null,
    input.ownerId || null,
    t(input.assumptions, 1000) || null,
    ["planned", "in_progress", "done", "delayed", "dropped"].includes(input.status ?? "") ? input.status! : "planned",
    day(input.start),
    day(input.end),
    num(input.budget),
    nowIso(),
  ];
  if (input.id) {
    await run("UPDATE sp_nodes SET parent_id = ?, level = ?, title = ?, description = ?, pillar = ?, perspective = ?, owner_id = ?, assumptions = ?, status = ?, start_date = ?, end_date = ?, budget = ?, updated_at = ? WHERE id = ? AND plan_id = ?", ...vals, input.id, input.planId);
    return input.id;
  }
  // Codes as in a logframe: G1, G1.O2, G1.O2.P1, G1.O2.P1.A3.
  const prefix = { goal: "G", outcome: "O", output: "P", activity: "A" }[input.level];
  const n = Number((await get<{ c: number }>(`SELECT COUNT(*) AS c FROM sp_nodes WHERE plan_id = ? AND ${input.parentId ? "parent_id = ?" : "parent_id IS NULL"}`, input.planId, ...(input.parentId ? [input.parentId] : [])))?.c ?? 0) + 1;
  const parentCode = input.parentId ? (await get<{ code: string }>("SELECT code FROM sp_nodes WHERE id = ?", input.parentId))!.code : "";
  const code = `${parentCode ? `${parentCode}.` : ""}${prefix}${n}`;
  const id = uid("spn_");
  await run("INSERT INTO sp_nodes (parent_id, level, title, description, pillar, perspective, owner_id, assumptions, status, start_date, end_date, budget, updated_at, id, plan_id, code, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...vals, id, input.planId, code, n, nowIso());
  return id;
}

export async function deleteNode(user: AppUser, id: string) {
  needManage(user);
  // Everything under it goes too.
  const ids = [id];
  for (let i = 0; i < ids.length; i++) for (const c of await all<{ id: string }>("SELECT id FROM sp_nodes WHERE parent_id = ?", ids[i]!)) ids.push(c.id);
  for (const x of ids.reverse()) await run("DELETE FROM sp_nodes WHERE id = ?", x);
}

// ---------------------------------------------------------------------------
// Indicators, targets and results
// ---------------------------------------------------------------------------

export async function saveIndicator(user: AppUser, input: { id?: string | null; nodeId: string; name: string; definition?: string; unit?: string; direction?: "up" | "down"; baseline?: number | null; baselineDate?: string | null; frequency?: Frequency; dataSource?: string; method?: string; verification?: string; responsibleId?: string | null; formula?: string; disaggregation?: string; measure?: string | null; kpiKey?: string | null; targets?: Record<string, number> }) {
  needManage(user);
  const node = await get<{ plan_id: string; code: string }>("SELECT plan_id, code FROM sp_nodes WHERE id = ?", input.nodeId);
  if (!node) throw new WorkflowError("NOT_FOUND", "Result not found.");
  const name = t(input.name, 200);
  if (!name) throw new WorkflowError("VALIDATION", "Name the indicator, for example \"Students using Myseed lessons each month\".");
  if (input.measure && !measureDef(input.measure)) throw new WorkflowError("VALIDATION", "Unknown measure from the app.");
  const freq: Frequency = input.frequency && input.frequency in FREQUENCIES ? input.frequency : "quarterly";
  const targets = Object.fromEntries(
    Object.entries(input.targets ?? {})
      .filter(([k, v]) => /^\d{4}(-(\d{2}|Q[1-4]|H[12]))?$/.test(k) && num(v) !== null)
      .slice(0, 120)
      .map(([k, v]) => [k, Number(v)]),
  );
  const vals: Param[] = [
    name,
    t(input.definition, 1500) || null,
    t(input.unit, 30) || "number",
    input.direction === "down" ? "down" : "up",
    num(input.baseline),
    day(input.baselineDate),
    freq,
    t(input.dataSource, 300) || null,
    t(input.method, 300) || null,
    t(input.verification, 300) || null,
    input.responsibleId || null,
    t(input.formula, 300) || null,
    t(input.disaggregation, 300) || null,
    input.measure || null,
    t(input.kpiKey, 40) || null,
    JSON.stringify(targets),
    nowIso(),
  ];
  if (input.id) {
    await run("UPDATE sp_indicators SET name = ?, definition = ?, unit = ?, direction = ?, baseline = ?, baseline_date = ?, frequency = ?, data_source = ?, method = ?, verification = ?, responsible_id = ?, formula = ?, disaggregation = ?, measure = ?, kpi_key = ?, targets = ?, updated_at = ? WHERE id = ?", ...vals, input.id);
    return input.id;
  }
  const n = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM sp_indicators WHERE node_id = ?", input.nodeId))?.c ?? 0) + 1;
  const id = uid("spi_");
  await run("INSERT INTO sp_indicators (name, definition, unit, direction, baseline, baseline_date, frequency, data_source, method, verification, responsible_id, formula, disaggregation, measure, kpi_key, targets, updated_at, id, node_id, code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...vals, id, input.nodeId, `${node.code}.I${n}`, nowIso());
  if (input.responsibleId && input.responsibleId !== user.id)
    await notify([input.responsibleId], { type: "mention", title: `You report "${name}"`, body: "Enter its results each period in Strategy and M&E.", link: "/strategy?tab=monitor" }, nowIso(), user.id);
  return id;
}

export async function deleteIndicator(user: AppUser, id: string) {
  needManage(user);
  await run("DELETE FROM sp_indicators WHERE id = ?", id);
}

export async function enterActual(user: AppUser, input: { indicatorId: string; period: string; value: number; note?: string | null }) {
  const i = await get<{ name: string; responsible_id: string | null; frequency: Frequency }>("SELECT name, responsible_id, frequency FROM sp_indicators WHERE id = ?", input.indicatorId);
  if (!i) throw new WorkflowError("NOT_FOUND", "Indicator not found.");
  if (!managesStrategy(user) && i.responsible_id !== user.id) throw new WorkflowError("FORBIDDEN", "Only the person reporting this indicator, or a planner, enters its results.");
  if (!/^\d{4}(-(\d{2}|Q[1-4]|H[12]))?$/.test(input.period)) throw new WorkflowError("VALIDATION", "Choose the period.");
  const v = num(input.value);
  if (v === null) throw new WorkflowError("VALIDATION", "Enter the value.");
  await run(
    `INSERT INTO sp_actuals (id, indicator_id, period, value, note, source, entered_by, entered_at) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)
     ON CONFLICT (indicator_id, period) DO UPDATE SET value = excluded.value, note = excluded.note, source = 'manual', entered_by = excluded.entered_by, entered_at = excluded.entered_at, verified_by = NULL, verified_at = NULL`,
    uid("spa_"),
    input.indicatorId,
    input.period,
    v,
    t(input.note, 1000) || null,
    user.id,
    nowIso(),
  );
  await audit({ actor: user }, { action: "strategy.result", summary: `${user.name} entered ${v} for "${i.name}" (${input.period})` });
}

// Data quality: a result is verified by a planner other than the person who entered it.
export async function verifyActual(user: AppUser, indicatorId: string, period: string) {
  needManage(user);
  const a = await get<{ entered_by: string | null; source: string }>("SELECT entered_by, source FROM sp_actuals WHERE indicator_id = ? AND period = ?", indicatorId, period);
  if (!a) throw new WorkflowError("NOT_FOUND", "No result for that period yet.");
  if (a.entered_by === user.id && a.source === "manual") throw new WorkflowError("VALIDATION", "Someone other than the person who entered it verifies a result.");
  await run("UPDATE sp_actuals SET verified_by = ?, verified_at = ? WHERE indicator_id = ? AND period = ?", user.id, nowIso(), indicatorId, period);
}

// Results read from the app (production, tasks, attendance, support...) for every ended or running period.
export async function refreshAuto(planId?: string, now = nowIso()) {
  const inds = await all<{ id: string; measure: string; frequency: Frequency; start_date: string; end_date: string }>(
    `SELECT i.id, i.measure, i.frequency, p.start_date, p.end_date FROM sp_indicators i JOIN sp_nodes n ON n.id = i.node_id JOIN sp_plans p ON p.id = n.plan_id
     WHERE i.measure IS NOT NULL AND p.status <> 'closed' ${planId ? "AND p.id = ?" : ""}`,
    ...(planId ? [planId] : []),
  );
  if (!inds.length) return { updated: 0 };
  const users = (await listUsers()).map((u) => u.id);
  const thisMonth = now.slice(0, 7);
  let updated = 0;
  const cache = new Map<string, ReturnType<typeof addAgg>>();
  for (const i of inds) {
    for (const p of periodsOf(i.frequency, i.start_date, i.end_date.slice(0, 10) < now.slice(0, 10) ? i.end_date : now.slice(0, 10))) {
      const months = monthsOf(p).filter((m) => m <= thisMonth);
      if (!months.length) continue;
      const aggs: ReturnType<typeof addAgg>[] = [];
      for (const m of months) {
        const k = `${i.measure}|${m}`;
        if (!cache.has(k)) cache.set(k, addAgg([...(await measureFor(i.measure, m, users)).values()]));
        aggs.push(cache.get(k));
      }
      // Counts with nothing recorded are 0; shares and averages without data stay empty.
      const v = valueOf(i.measure, addAgg(aggs)).value ?? (measureDef(i.measure)?.unit === "count" ? 0 : null);
      if (v === null) continue;
      const cur = await get<{ source: string }>("SELECT source FROM sp_actuals WHERE indicator_id = ? AND period = ?", i.id, p);
      if (cur && cur.source === "manual") continue;
      await run(
        `INSERT INTO sp_actuals (id, indicator_id, period, value, note, source, entered_by, entered_at, verified_at) VALUES (?, ?, ?, ?, 'Read from the app', 'auto', NULL, ?, ?)
         ON CONFLICT (indicator_id, period) DO UPDATE SET value = excluded.value, entered_at = excluded.entered_at, verified_at = excluded.verified_at`,
        uid("spa_"),
        i.id,
        p,
        Math.round(v * 100) / 100,
        now,
        now,
      );
      updated++;
    }
  }
  return { updated };
}

// ---------------------------------------------------------------------------
// Risks and evaluations
// ---------------------------------------------------------------------------

export async function saveRisk(user: AppUser, input: { id?: string | null; planId: string; nodeId?: string | null; title: string; category?: string; likelihood: number; impact: number; mitigation?: string; ownerId?: string | null; status?: string; reviewDate?: string | null }) {
  needManage(user);
  const title = t(input.title, 300);
  if (!title) throw new WorkflowError("VALIDATION", "Describe the risk.");
  const L = Math.max(1, Math.min(5, Math.round(Number(input.likelihood) || 1)));
  const I = Math.max(1, Math.min(5, Math.round(Number(input.impact) || 1)));
  const vals: Param[] = [input.nodeId || null, title, t(input.category, 60) || "Operational", L, I, t(input.mitigation, 1500) || null, input.ownerId || null, ["open", "watch", "closed"].includes(input.status ?? "") ? input.status! : "open", day(input.reviewDate), nowIso()];
  if (input.id) {
    await run("UPDATE sp_risks SET node_id = ?, title = ?, category = ?, likelihood = ?, impact = ?, mitigation = ?, owner_id = ?, status = ?, review_date = ?, updated_at = ? WHERE id = ? AND plan_id = ?", ...vals, input.id, input.planId);
    return input.id;
  }
  const id = uid("spr_");
  await run("INSERT INTO sp_risks (node_id, title, category, likelihood, impact, mitigation, owner_id, status, review_date, updated_at, id, plan_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...vals, id, input.planId, nowIso());
  return id;
}
export async function deleteRisk(user: AppUser, id: string) {
  needManage(user);
  await run("DELETE FROM sp_risks WHERE id = ?", id);
}

export type Recommendation = { text: string; ownerId: string | null; due: string | null; response: string; status: "open" | "in_progress" | "done" | "not_accepted" };
export async function saveEvaluation(user: AppUser, input: { id?: string | null; planId: string; title: string; kind?: string; period?: string; scores?: Partial<Record<DacCriterion, { rating: number; evidence: string }>>; summary?: string; findings?: string; lessons?: string; recommendations?: Recommendation[]; status?: string }) {
  needManage(user);
  const title = t(input.title, 200);
  if (!title) throw new WorkflowError("VALIDATION", "Name the evaluation, for example \"Mid-term review 2028\".");
  const scores = Object.fromEntries(
    (Object.keys(DAC_CRITERIA) as DacCriterion[]).flatMap((k) => {
      const s = input.scores?.[k];
      return s && Number(s.rating) >= 1 ? [[k, { rating: Math.max(1, Math.min(4, Math.round(Number(s.rating)))), evidence: t(s.evidence, 1500) }]] : [];
    }),
  );
  const recs = (input.recommendations ?? []).slice(0, 30).map((r) => ({ text: t(r.text, 600), ownerId: r.ownerId || null, due: day(r.due), response: t(r.response, 600), status: (["open", "in_progress", "done", "not_accepted"].includes(r.status) ? r.status : "open") as Recommendation["status"] })).filter((r) => r.text);
  const vals: Param[] = [title, ["midterm", "final", "annual", "thematic", "baseline"].includes(input.kind ?? "") ? input.kind! : "annual", t(input.period, 40) || null, JSON.stringify(scores), t(input.summary, 4000) || null, t(input.findings, 6000) || null, t(input.lessons, 3000) || null, JSON.stringify(recs), input.status === "final" ? "final" : "draft", nowIso()];
  if (input.id) {
    await run("UPDATE sp_evaluations SET title = ?, kind = ?, period = ?, scores = ?, summary = ?, findings = ?, lessons = ?, recommendations = ?, status = ?, updated_at = ? WHERE id = ? AND plan_id = ?", ...vals, input.id, input.planId);
    return input.id;
  }
  const id = uid("spe_");
  await run("INSERT INTO sp_evaluations (title, kind, period, scores, summary, findings, lessons, recommendations, status, updated_at, id, plan_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...vals, id, input.planId, user.id, nowIso());
  return id;
}
export async function deleteEvaluation(user: AppUser, id: string) {
  needManage(user);
  await run("DELETE FROM sp_evaluations WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// The whole plan, monitored
// ---------------------------------------------------------------------------

export async function currentPeriodOf(freq: Frequency, now = nowIso()) {
  return periodsOf(freq, now.slice(0, 10), now.slice(0, 10))[0]!;
}

export async function planView(user: AppUser, planId: string, opts: { now?: string } = {}) {
  if (!(await seesStrategy(user))) throw new WorkflowError("FORBIDDEN", "The strategy is for owners, managers and the people reporting on it.");
  const pr = await get<PlanRow>("SELECT * FROM sp_plans WHERE id = ?", planId);
  if (!pr) throw new WorkflowError("NOT_FOUND", "Plan not found.");
  const plan = planOf(pr);
  const now = opts.now ?? nowIso();
  const names = new Map((await all<{ id: string; name: string }>("SELECT id, name FROM users")).map((u) => [u.id, u.name]));
  const nodes = await all<{ id: string; parent_id: string | null; level: Level; code: string; title: string; description: string | null; pillar: string | null; perspective: Perspective | null; owner_id: string | null; assumptions: string | null; status: string; start_date: string | null; end_date: string | null; budget: number | null }>(
    "SELECT * FROM sp_nodes WHERE plan_id = ? ORDER BY code",
    planId,
  );
  const inds = await all<{ id: string; node_id: string; code: string; name: string; definition: string | null; unit: string; direction: "up" | "down"; baseline: number | null; baseline_date: string | null; frequency: Frequency; data_source: string | null; method: string | null; verification: string | null; responsible_id: string | null; formula: string | null; disaggregation: string | null; measure: string | null; kpi_key: string | null; targets: string }>(
    `SELECT i.* FROM sp_indicators i JOIN sp_nodes n ON n.id = i.node_id WHERE n.plan_id = ? ORDER BY i.code`,
    planId,
  );
  const acts = inds.length ? await all<{ indicator_id: string; period: string; value: number; note: string | null; source: string; entered_by: string | null; verified_by: string | null; verified_at: string | null }>(`SELECT * FROM sp_actuals WHERE indicator_id IN (${inds.map(() => "?").join(",")})`, ...inds.map((i) => i.id)) : [];
  const indicators = inds.map((i) => {
    const targets = parseJson<Record<string, number>>(i.targets, {});
    const periods = periodsOf(i.frequency, plan.start, plan.end);
    const cur = periodsOf(i.frequency, now.slice(0, 10), now.slice(0, 10))[0]!;
    const rows = periods.map((p) => {
      const a = acts.find((x) => x.indicator_id === i.id && x.period === p);
      const target = targets[p] ?? null;
      const ach = achievement(a ? Number(a.value) : null, target, i.baseline === null ? null : Number(i.baseline), i.direction);
      return { period: p, target, actual: a ? Number(a.value) : null, note: a?.note ?? null, source: a?.source ?? null, verified: !!a?.verified_at, enteredBy: a?.entered_by ? (names.get(a.entered_by) ?? null) : null, achievement: ach, rag: ragOf(ach, plan.rag), due: p <= cur };
    });
    // The latest period with a result (else the latest that has passed).
    const latest = [...rows].reverse().find((r) => r.actual !== null) ?? null;
    const sheet = { name: i.name, definition: i.definition, unit: i.unit, direction: i.direction, baseline: i.baseline === null ? null : Number(i.baseline), baselineDate: i.baseline_date, frequency: i.frequency, dataSource: i.data_source, method: i.method, verification: i.verification, responsibleId: i.responsible_id, formula: i.formula, disaggregation: i.disaggregation, measure: i.measure, targets };
    return {
      id: i.id,
      nodeId: i.node_id,
      code: i.code,
      ...sheet,
      kpiKey: i.kpi_key,
      responsible: i.responsible_id ? (names.get(i.responsible_id) ?? null) : null,
      rows,
      latest,
      rag: (latest?.rag ?? "none") as Rag,
      missing: rows.filter((r) => r.due && r.actual === null && r.period < cur).map((r) => r.period),
      gaps: smartGaps(sheet),
      mine: i.responsible_id === user.id,
    };
  });
  const risks = (await all<{ id: string; node_id: string | null; title: string; category: string; likelihood: number; impact: number; mitigation: string | null; owner_id: string | null; status: string; review_date: string | null }>("SELECT * FROM sp_risks WHERE plan_id = ? ORDER BY likelihood * impact DESC", planId)).map((r) => {
    const score = riskScore(Number(r.likelihood), Number(r.impact));
    return { id: r.id, nodeId: r.node_id, title: r.title, category: r.category, likelihood: Number(r.likelihood), impact: Number(r.impact), score, level: riskLevel(score), mitigation: r.mitigation, ownerId: r.owner_id, owner: r.owner_id ? (names.get(r.owner_id) ?? null) : null, status: r.status, reviewDate: r.review_date, overdueReview: !!r.review_date && r.review_date < now.slice(0, 10) && r.status !== "closed" };
  });
  const evaluations = (await all<{ id: string; title: string; kind: string; period: string | null; scores: string; summary: string | null; findings: string | null; lessons: string | null; recommendations: string; status: string; updated_at: string }>("SELECT * FROM sp_evaluations WHERE plan_id = ? ORDER BY created_at DESC", planId)).map((e) => ({
    id: e.id,
    title: e.title,
    kind: e.kind,
    period: e.period,
    scores: parseJson<Partial<Record<DacCriterion, { rating: number; evidence: string }>>>(e.scores, {}),
    summary: e.summary ?? "",
    findings: e.findings ?? "",
    lessons: e.lessons ?? "",
    recommendations: parseJson<Recommendation[]>(e.recommendations, []).map((r) => ({ ...r, owner: r.ownerId ? (names.get(r.ownerId) ?? null) : null })),
    status: e.status,
    updatedAt: e.updated_at,
  }));
  const tree = nodes.map((n) => {
    const mine = indicators.filter((i) => i.nodeId === n.id);
    const counts = { green: 0, amber: 0, red: 0, none: 0 } as Record<Rag, number>;
    for (const i of mine) counts[i.rag]++;
    const rag: Rag = counts.red ? "red" : counts.amber ? "amber" : counts.green ? "green" : "none";
    return { id: n.id, parentId: n.parent_id, level: n.level, code: n.code, title: n.title, description: n.description ?? "", pillar: n.pillar, perspective: n.perspective, ownerId: n.owner_id, owner: n.owner_id ? (names.get(n.owner_id) ?? null) : null, assumptions: n.assumptions ?? "", status: n.status, start: n.start_date, end: n.end_date, budget: n.budget === null ? null : Number(n.budget), indicators: mine.map((i) => i.id), rag, overdue: n.end_date && n.end_date < now.slice(0, 10) && n.status !== "done" && n.status !== "dropped" };
  });
  // The summary: Red, Amber, Green for the whole plan, by pillar, by perspective and by level.
  const sum = (list: typeof indicators) => ({ green: list.filter((i) => i.rag === "green").length, amber: list.filter((i) => i.rag === "amber").length, red: list.filter((i) => i.rag === "red").length, none: list.filter((i) => i.rag === "none").length, total: list.length });
  const nodeOf = new Map(tree.map((n) => [n.id, n]));
  const pillarOf = (nodeId: string): string | null => {
    let n = nodeOf.get(nodeId);
    while (n) {
      if (n.pillar) return n.pillar;
      n = n.parentId ? nodeOf.get(n.parentId) : undefined;
    }
    return null;
  };
  const perspectiveOf = (nodeId: string): Perspective | null => {
    let n = nodeOf.get(nodeId);
    while (n) {
      if (n.perspective) return n.perspective;
      n = n.parentId ? nodeOf.get(n.parentId) : undefined;
    }
    return null;
  };
  const summary = {
    all: sum(indicators),
    byPillar: [...plan.pillars, null].map((p) => ({ pillar: p ?? "Not in a pillar", ...sum(indicators.filter((i) => pillarOf(i.nodeId) === p)) })).filter((x) => x.total),
    byPerspective: (Object.keys(PERSPECTIVES) as Perspective[]).map((p) => ({ perspective: p, label: PERSPECTIVES[p], ...sum(indicators.filter((i) => perspectiveOf(i.nodeId) === p)) })),
    byLevel: (Object.keys(LEVELS) as Level[]).map((l) => ({ level: l, label: LEVELS[l], ...sum(indicators.filter((i) => nodeOf.get(i.nodeId)?.level === l)) })),
    missing: indicators.reduce((n, i) => n + i.missing.length, 0),
    unverified: indicators.reduce((n, i) => n + i.rows.filter((r) => r.actual !== null && !r.verified).length, 0),
    smart: indicators.filter((i) => i.gaps.length === 0).length,
    risks: { open: risks.filter((r) => r.status !== "closed").length, high: risks.filter((r) => r.status !== "closed" && (r.level === "high" || r.level === "critical")).length },
    activities: { total: tree.filter((n) => n.level === "activity").length, done: tree.filter((n) => n.level === "activity" && n.status === "done").length, late: tree.filter((n) => n.level === "activity" && n.overdue).length },
    recommendations: evaluations.flatMap((e) => e.recommendations).filter((r) => r.status === "open" || r.status === "in_progress").length,
  };
  return { plan, nodes: tree, indicators, risks, evaluations, summary, canManage: managesStrategy(user) };
}
export type PlanView = Awaited<ReturnType<typeof planView>>;

// Daily: results from the app, and a reminder to whoever reports an indicator whose period ended without one.
export async function strategyJob(now = nowIso()) {
  await refreshAuto(undefined, now);
  const plans = await all<{ id: string; name: string }>("SELECT id, name FROM sp_plans WHERE status = 'active'");
  let reminded = 0;
  for (const p of plans) {
    const inds = await all<{ id: string; name: string; responsible_id: string | null; frequency: Frequency; measure: string | null; start_date: string; end_date: string }>(
      "SELECT i.id, i.name, i.responsible_id, i.frequency, i.measure, pl.start_date, pl.end_date FROM sp_indicators i JOIN sp_nodes n ON n.id = i.node_id JOIN sp_plans pl ON pl.id = n.plan_id WHERE pl.id = ? AND i.responsible_id IS NOT NULL AND i.measure IS NULL",
      p.id,
    );
    for (const i of inds) {
      const cur = periodsOf(i.frequency, now.slice(0, 10), now.slice(0, 10))[0]!;
      const prev = periodsOf(i.frequency, i.start_date, now.slice(0, 10)).filter((x) => x < cur).pop();
      if (!prev) continue;
      if (await get("SELECT 1 AS x FROM sp_actuals WHERE indicator_id = ? AND period = ?", i.id, prev)) continue;
      const key = `sp:${i.id}:${prev}`;
      if (await get("SELECT 1 AS x FROM notifications WHERE dedupe_key = ?", key)) continue;
      await notify([i.responsible_id!], { type: "mention", title: `Enter the result of "${i.name}" for ${prev}`, body: `${p.name}: the period has ended.`, link: "/strategy?tab=monitor", dedupeKey: key }, now);
      reminded++;
    }
  }
  return { reminded };
}

// A complete example plan for an education company, to start from (Admin edits or deletes it).
export async function examplePlan(user: AppUser) {
  needManage(user);
  const y = Number(nowIso().slice(0, 4));
  const planId = await savePlan(user, {
    name: `Strategic plan ${y}–${y + 4}`,
    start: `${y}-01-01`,
    end: `${y + 4}-12-31`,
    vision: "Every Ethiopian student learns with lessons that are clear, local and within reach.",
    mission: "We make high-quality video lessons for the Ethiopian curriculum and bring them to students, teachers and schools.",
    values: ["Quality", "Learners first", "Integrity", "Teamwork", "Innovation"],
    pillars: ["Content and quality", "Reach and growth", "People and operations", "Sustainability"],
    status: "active",
  });
  const goal = await saveNode(user, { planId, level: "goal", title: "Better learning results for students using Myseed", pillar: "Reach and growth", perspective: "customer" });
  const o1 = await saveNode(user, { planId, parentId: goal, level: "outcome", title: "The curriculum is covered with high-quality lessons", pillar: "Content and quality", perspective: "process", assumptions: "Teachers and studios stay available." });
  const o2 = await saveNode(user, { planId, parentId: goal, level: "outcome", title: "A skilled, motivated team delivers on time", pillar: "People and operations", perspective: "learning" });
  const p1 = await saveNode(user, { planId, parentId: o1, level: "output", title: "Lessons recorded, edited and published", perspective: "process" });
  const p2 = await saveNode(user, { planId, parentId: o2, level: "output", title: "Work finished on time across departments", perspective: "learning" });
  await saveNode(user, { planId, parentId: p1, level: "activity", title: "Plan and record each grade's lessons", status: "in_progress" });
  await saveNode(user, { planId, parentId: p2, level: "activity", title: "Run monthly scorecards and reviews", status: "in_progress" });
  const quarters = periodsOf("quarterly", `${y}-01-01`, `${y}-12-31`);
  await saveIndicator(user, { nodeId: p1, name: "Production stages finished", definition: "Production stages (recording, editing, uploading, publication) finished in the period, from the app.", unit: "number", baseline: 0, baselineDate: `${y}-01-01`, frequency: "quarterly", dataSource: "Myseed work app", method: "Counted by the app", verification: "Production report in the app", responsibleId: user.id, measure: "prod_finished", targets: Object.fromEntries(quarters.map((q, i) => [q, 60 + i * 20])) });
  await saveIndicator(user, { nodeId: p1, name: "Stages finished on time", definition: "Share of production stages finished by their stage date, out of those with a date.", unit: "percent", baseline: 60, baselineDate: `${y}-01-01`, frequency: "quarterly", dataSource: "Myseed work app", method: "Calculated by the app", verification: "Production report", responsibleId: user.id, measure: "prod_on_time", targets: Object.fromEntries(quarters.map((q) => [q, 85])) });
  await saveIndicator(user, { nodeId: o1, name: "Lessons rated good or better by reviewers", definition: "Share of published lessons rated 4 or 5 out of 5 by the quality review panel in the period.", unit: "percent", baseline: 70, baselineDate: `${y}-01-01`, frequency: "semiannual", dataSource: "Quality review panel", method: "Sample review of published lessons", verification: "Review panel minutes", responsibleId: user.id, targets: Object.fromEntries(periodsOf("semiannual", `${y}-01-01`, `${y}-12-31`).map((h) => [h, 85])) });
  await saveIndicator(user, { nodeId: p2, name: "Department tasks on time", definition: "Share of department tasks finished by their due date, out of those with one.", unit: "percent", baseline: 65, baselineDate: `${y}-01-01`, frequency: "quarterly", dataSource: "Myseed work app", method: "Calculated by the app", verification: "Department reports", responsibleId: user.id, measure: "tasks_on_time", targets: Object.fromEntries(quarters.map((q) => [q, 85])) });
  await saveIndicator(user, { nodeId: o2, name: "On-time attendance", definition: "Working days started on time, out of the working days (leave and holidays left out).", unit: "percent", baseline: 80, baselineDate: `${y}-01-01`, frequency: "quarterly", dataSource: "Attendance", method: "Calculated by the app", verification: "Attendance records", responsibleId: user.id, measure: "punctuality", targets: Object.fromEntries(quarters.map((q) => [q, 95])) });
  await saveRisk(user, { planId, title: "Power and internet cuts delay recording and uploads", category: "Operational", likelihood: 4, impact: 3, mitigation: "Backup power at the studio; uploads scheduled at night; offline editing.", ownerId: user.id, status: "open" });
  await saveRisk(user, { planId, title: "Key teachers or editors leave", category: "People", likelihood: 3, impact: 4, mitigation: "Cross-training, documented workflows and fair pay reviews.", ownerId: user.id, status: "watch" });
  await refreshAuto(planId);
  return planId;
}

// Kept for the documents.
export { DAC_CRITERIA, LEVELS, PERSPECTIVES, FREQUENCIES };
