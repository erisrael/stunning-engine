// The department flow (Configure, Flow) as people work it on Home, the same loop production teams use:
// - members: their own work as a board (To do, In progress, Done not sent, With the lead); start it, fill in the
//   card, mark it done, send one or all; returned work comes back with the lead's note;
// - leads: triage what comes in, approve or return what was sent, hand approved work over as a batch, accept what
//   arrives, assign, release (Dev), and see the whole flow at a glance;
// - checkers (a tech lead, testers): pass work on or return it, as a bug with steps to reproduce when set.
// Only finished work moves on: a task reaches the next stage only through these steps (leads can still move it by
// hand on the Board).

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { deptManagers, deptPeople } from "./departments";
import { getDeptConfig, workAccess, workDept as dept, type WorkAccess } from "./dept-config";
import { afterStatusChange } from "./work";
import { createRequest, decideRequest, listSprints } from "./work-extras";
import { cachedPrsByCode, type TaskPr } from "./github";
import { loadUser, type AppUser } from "./users";
import { categoryOf, fieldEmpty, fieldRequired, fieldShown, labelOf, statusOf, type FieldValue, type StatusCategory, type TaskCheck } from "@/lib/dept-config";
import { effectiveState, entryStatus, returnStage, stageFor, type DeptFlow, type FlowStage, type FlowState } from "@/lib/dept-flow";
import { deptPath } from "@/lib/work";

const DAY = 864e5;

type Row = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  status_category: StatusCategory;
  priority: string;
  assignee_id: string | null;
  assignee_name: string | null;
  reporter_id: string | null;
  reviewer_id: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  request_state: string | null;
  parent_id: string | null;
  project_name: string | null;
  sprint_id: string | null;
  sprint_name: string | null;
  due_date: string | null;
  estimate_hours: number | null;
  spent_hours: number | null;
  labels: string;
  fields: string;
  checklist: string;
  flow_state: string | null;
  flow_since: string | null;
  flow_from: string | null;
  flow_note: string | null;
  updated_at: string;
  created_at: string;
};

const SELECT = `SELECT t.id, t.code, t.title, t.description, t.type, t.status, t.status_category, t.priority, t.assignee_id, ua.name AS assignee_name, t.reporter_id,
    t.reviewer_id, t.requested_by, uq.name AS requested_by_name, t.request_state, t.parent_id, p.name AS project_name, t.sprint_id, sp.name AS sprint_name, t.due_date,
    t.estimate_hours, t.spent_hours, t.labels, t.fields, t.checklist, t.flow_state, t.flow_since, t.flow_from, t.flow_note, t.updated_at, t.created_at
  FROM dept_tasks t LEFT JOIN users ua ON ua.id = t.assignee_id LEFT JOIN users uq ON uq.id = t.requested_by
  LEFT JOIN dept_projects p ON p.id = t.project_id LEFT JOIN dept_sprints sp ON sp.id = t.sprint_id`;

export type FlowCard = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  stage: string;
  kind: FlowStage["kind"];
  state: FlowState | null;
  assigneeId: string | null;
  assigneeName: string | null;
  project: string | null;
  sprintId: string | null;
  sprint: string | null;
  dueDate: string | null;
  // Days in this stage, and whether that is past the stage's target.
  daysIn: number;
  late: boolean;
  note: string | null;
  from: string | null;
  checklist: { done: number; total: number; open: string[] };
  // What still stops "Done" (or passing on): required fields and checklist lines.
  missing: string[];
  fields: { label: string; value: string }[];
  running: boolean;
  request: { pending: boolean; by: string | null } | null;
  estimate: number | null;
  spent: number | null;
  prs: TaskPr[];
};

export type FlowStageInfo = {
  status: string;
  label: string;
  color: string;
  kind: FlowStage["kind"];
  next: string | null;
  nextLabel: string | null;
  nextDept: string | null;
  review: boolean;
  accept: boolean;
  days: number | null;
  wip: number | null;
  steps: string[];
  returnAsBug: boolean;
  mine: boolean; // this person works or checks it
};

export type FlowHome = {
  dept: string;
  title: string;
  task: string;
  tasks: string;
  stages: FlowStageInfo[];
  // The member's own board (work stages assigned to them).
  mine: FlowCard[];
  // Leads (and checkers, for their stages).
  desk: null | {
    lead: boolean;
    intake: FlowCard[];
    approve: FlowCard[];
    checks: FlowCard[];
    arriving: FlowCard[];
    ready: FlowCard[];
    release: FlowCard[];
    assign: FlowCard[];
    people: { id: string; name: string; todo: number; working: number; done: number; sent: number }[];
    glance: { status: string; label: string; color: string; kind: FlowStage["kind"]; counts: Partial<Record<FlowState, number>>; total: number; late: number; doneWeek: number }[];
    releases: { id: string; name: string; notes: string; taskCount: number; createdAt: string; by: string | null }[];
  };
  sprints: { id: string; name: string; status: string }[];
  priorities: { key: string; label: string; color: string }[];
  types: { key: string; label: string; color: string }[];
  people: { id: string; name: string }[];
};

const isLead = (a: WorkAccess) => a.rights.editAll && !a.readOnly;
const checks = (a: WorkAccess, user: AppUser, s: FlowStage) => !a.readOnly && (isLead(a) || (s.kind === "check" && s.checkers === "people" && s.people.includes(user.id)));

function flowOf(a: WorkAccess): DeptFlow {
  if (!a.config.flow.on) throw new WorkflowError("INVALID_STATE", `${a.config.title} does not use a flow. A head can switch it on in Configure, Flow.`);
  return a.config.flow;
}

function missingFor(a: WorkAccess, r: Pick<Row, "type" | "fields" | "checklist">, category: StatusCategory | null, checklist: boolean) {
  const out: string[] = [];
  const fields = parseJson<Record<string, FieldValue>>(r.fields, {});
  if (category) for (const f of a.config.fields) if (fieldShown(f, r.type) && fieldRequired(f, category) && fieldEmpty(fields[f.key])) out.push(f.label);
  if (checklist && a.config.features.checklists) {
    const list = parseJson<TaskCheck[]>(r.checklist, []);
    for (const c of list) {
      if (!c.done) out.push(c.text);
      else if (c.verify && !c.verifiedBy) out.push(`${c.text} (to verify)`);
    }
  }
  return out;
}

// The category of the place a stage hands work to (or Done, at the end).
function nextCategory(a: WorkAccess, s: FlowStage): StatusCategory {
  const t = s.next ? stageFor(a.config.flow, s.next) : null;
  return t ? categoryOf(a.config, entryStatus(t)) : "done";
}

function toCard(a: WorkAccess, r: Row, s: FlowStage, running: Set<string>, prs: Map<string, TaskPr[]>, now: number, people: Map<string, string>): FlowCard {
  const state = effectiveState(s, r.status, r.flow_state);
  const since = Date.parse(r.flow_since ?? r.updated_at);
  const daysIn = Math.max(0, Math.floor((now - since) / DAY));
  const list = parseJson<TaskCheck[]>(r.checklist, []);
  const values = parseJson<Record<string, FieldValue>>(r.fields, {});
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    description: r.description,
    type: r.type,
    priority: r.priority,
    status: r.status,
    stage: s.status,
    kind: s.kind,
    state,
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_name,
    project: r.project_name,
    sprintId: r.sprint_id,
    sprint: r.sprint_name,
    dueDate: r.due_date,
    daysIn,
    late: !!s.days && daysIn > s.days,
    note: r.flow_note,
    from: r.flow_from ? labelOf(a.config.statuses, r.flow_from) : null,
    checklist: { done: list.filter((c) => c.done).length, total: list.length, open: list.filter((c) => !c.done).map((c) => c.text) },
    missing: s.kind === "work" || s.kind === "check" ? missingFor(a, r, nextCategory(a, s), s.kind === "work" && s.needChecklist) : [],
    fields: a.config.fields
      .filter((f) => fieldShown(f, r.type) && (f.onCard || f.type === "longtext") && !fieldEmpty(values[f.key]))
      .slice(0, 4)
      .map((f) => ({ label: f.label, value: f.type === "person" ? (people.get(String(values[f.key])) ?? "") : Array.isArray(values[f.key]) ? (values[f.key] as string[]).join(", ") : String(values[f.key]) })),
    running: running.has(r.id),
    request: r.requested_by ? { pending: r.request_state === "pending", by: r.requested_by_name } : null,
    estimate: r.estimate_hours == null ? null : Number(r.estimate_hours),
    spent: r.spent_hours == null ? null : Number(r.spent_hours),
    prs: prs.get(r.code.toUpperCase()) ?? [],
  };
}

const rank = (a: WorkAccess) => (c: FlowCard) => {
  const i = a.config.priorities.findIndex((p) => p.key === c.priority);
  return i < 0 ? 99 : i;
};

export async function flowHome(user: AppUser, d: string): Promise<FlowHome | null> {
  const dp = await dept(d);
  const a = await workAccess(user, dp);
  const flow = a.config.flow;
  if (!flow.on) return null;
  const cfg = a.config;
  const statuses = flow.stages.flatMap((s) => [s.status, ...(s.queueStatus ? [s.queueStatus] : [])]);
  const lead = isLead(a) || (a.readOnly && a.rights.seeAll);
  const checkerOf = flow.stages.filter((s) => s.kind === "check" && s.checkers === "people" && s.people.includes(user.id)).map((s) => s.status);
  const where = lead ? "" : ` AND (t.assignee_id = ?${checkerOf.length ? ` OR t.status IN (${placeholders(checkerOf.length)})` : ""})`;
  const rows = await all<Row>(
    `${SELECT} WHERE t.dept = ? AND t.status IN (${placeholders(statuses.length)}) AND t.status_category <> 'cancelled'${where} ORDER BY t.updated_at DESC LIMIT 3000`,
    dp,
    ...statuses,
    ...(lead ? [] : [user.id, ...checkerOf]),
  );
  const running = new Set((await all<{ task_id: string }>("SELECT task_id FROM dept_time_entries WHERE user_id = ? AND ended_at IS NULL", user.id)).map((r) => r.task_id));
  const prs = dp === "dev" || flow.stages.some((s) => s.autoOnMerge) ? await cachedPrsByCode(dp) : new Map<string, TaskPr[]>();
  const now = Date.now();
  const people = (await deptPeople(dp)).map((p) => ({ id: p.id, name: p.name }));
  const names = new Map(people.map((p) => [p.id, p.name]));
  const cards = rows.map((r) => ({ r, s: stageFor(flow, r.status)! })).map(({ r, s }) => toCard(a, r, s, running, prs, now, names));
  const byStage = (k: FlowStage["kind"]) => new Set(flow.stages.filter((s) => s.kind === k).map((s) => s.status));
  const work = byStage("work");
  const sortP = rank(a);
  const mine = cards.filter((c) => work.has(c.stage) && c.assigneeId === user.id && c.state && ["todo", "working", "done", "sent"].includes(c.state)).sort((x, y) => sortP(x) - sortP(y));
  const label = (k: string | null) => (k ? labelOf(cfg.statuses, k) : null);
  const stages: FlowStageInfo[] = flow.stages.map((s) => ({
    status: s.status,
    label: label(s.status)!,
    color: statusOf(cfg, s.status)?.color ?? "#64748b",
    kind: s.kind,
    next: s.next,
    nextLabel: label(s.next),
    nextDept: s.nextDept,
    review: s.review,
    accept: s.accept,
    days: s.days,
    wip: s.wip,
    steps: s.steps,
    returnAsBug: s.returnAsBug,
    mine: s.kind === "work" ? cards.some((c) => c.stage === s.status && c.assigneeId === user.id) || (!lead && s === flow.stages.find((x) => x.kind === "work")) : checks(a, user, s),
  }));
  const deskOn = lead || checkerOf.length > 0;
  let desk: FlowHome["desk"] = null;
  if (deskOn) {
    const mineChecks = (c: FlowCard) => lead || checkerOf.includes(c.stage);
    const kindOf = (c: FlowCard) => flow.stages.find((s) => s.status === c.stage)!;
    const weekAgo = new Date(now - 7 * DAY).toISOString();
    const doneWeek = lead
      ? await all<{ flow_from: string; n: number }>("SELECT flow_from, COUNT(*) AS n FROM dept_tasks WHERE dept = ? AND flow_since >= ? AND flow_from IS NOT NULL GROUP BY flow_from", dp, weekAgo)
      : [];
    desk = {
      lead,
      intake: lead ? cards.filter((c) => c.kind === "intake").sort((x, y) => Number(!!y.request?.pending) - Number(!!x.request?.pending) || sortP(x) - sortP(y)) : [],
      approve: lead ? cards.filter((c) => c.kind === "work" && c.state === "sent") : [],
      checks: cards.filter((c) => c.kind === "check" && c.state === "todo" && mineChecks(c)),
      arriving: cards.filter((c) => c.state === "arriving" && (kindOf(c).kind === "check" ? mineChecks(c) : lead)),
      ready: lead ? cards.filter((c) => c.kind === "work" && c.state === "ready") : [],
      release: lead ? cards.filter((c) => c.kind === "release") : [],
      assign: lead ? cards.filter((c) => c.kind === "work" && c.state === "todo" && !c.assigneeId) : [],
      people: lead
        ? people.map((p) => {
            const of = cards.filter((c) => c.kind === "work" && c.assigneeId === p.id);
            return { ...p, todo: of.filter((c) => c.state === "todo").length, working: of.filter((c) => c.state === "working").length, done: of.filter((c) => c.state === "done").length, sent: of.filter((c) => c.state === "sent").length };
          })
        : [],
      glance: flow.stages.map((s) => {
        const of = cards.filter((c) => c.stage === s.status);
        const counts: Partial<Record<FlowState, number>> = {};
        for (const c of of) if (c.state) counts[c.state] = (counts[c.state] ?? 0) + 1;
        return {
          status: s.status,
          label: label(s.status)!,
          color: statusOf(cfg, s.status)?.color ?? "#64748b",
          kind: s.kind,
          counts,
          total: of.length,
          late: of.filter((c) => c.late).length,
          doneWeek: Number(doneWeek.filter((x) => x.flow_from === s.status || x.flow_from === s.queueStatus).reduce((n, x) => n + Number(x.n), 0)),
        };
      }),
      releases: flow.stages.some((s) => s.kind === "release")
        ? (
            await all<{ id: string; name: string; notes: string; task_count: number; created_at: string; by: string | null }>(
              "SELECT r.id, r.name, r.notes, r.task_count, r.created_at, u.name AS by FROM dept_releases r LEFT JOIN users u ON u.id = r.created_by WHERE r.dept = ? ORDER BY r.created_at DESC LIMIT 8",
              dp,
            )
          ).map((r) => ({ id: r.id, name: r.name, notes: r.notes, taskCount: Number(r.task_count), createdAt: r.created_at, by: r.by }))
        : [],
    };
  }
  const sprints = cfg.features.sprints ? (await listSprints(user, dp)).filter((s) => s.status !== "closed").map((s) => ({ id: s.id, name: s.name, status: s.status })) : [];
  return {
    dept: dp,
    title: cfg.title,
    task: cfg.names.task,
    tasks: cfg.names.tasks,
    stages,
    mine,
    desk,
    sprints,
    priorities: cfg.priorities.filter((p) => p.active).map((p) => ({ key: p.key, label: p.label, color: p.color })),
    types: cfg.types.map((t) => ({ key: t.key, label: t.label, color: t.color })),
    people,
  };
}

// ---------------------------------------------------------------------------
// Moving through the flow
// ---------------------------------------------------------------------------

async function load(dp: string, id: string) {
  const r = await get<Row>(`${SELECT} WHERE t.id = ? AND t.dept = ?`, id, dp);
  if (!r) throw new WorkflowError("NOT_FOUND", "Task not found.");
  return r;
}

function placeOf(a: WorkAccess, r: Row) {
  const s = stageFor(flowOf(a), r.status);
  if (!s) throw new WorkflowError("INVALID_STATE", `${r.code} is not in a stage of the flow (it is ${labelOf(a.config.statuses, r.status)}).`);
  return { s, state: effectiveState(s, r.status, r.flow_state) };
}

const link = (dp: string, id: string) => `${deptPath(dp)}?task=${id}`;
const homeLink = (dp: string) => deptPath(dp);

async function setRow(id: string, patch: { status?: string; category?: StatusCategory; state: FlowState | null; assignee?: string | null; note?: string | null; from?: string | null; since?: string }, now: string) {
  const sets = ["flow_state = ?", "updated_at = ?"];
  const params: (string | null)[] = [patch.state, now];
  if (patch.status) {
    sets.push(
      "status = ?",
      "status_category = ?",
      "progress = CASE WHEN ? = 'done' THEN 100 ELSE progress END",
      "completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, ?) ELSE NULL END",
      "sort = (SELECT COALESCE(MAX(x.sort), 0) + 1 FROM dept_tasks x WHERE x.dept = dept_tasks.dept AND x.status = ?)",
    );
    params.push(patch.status, patch.category!, patch.category!, patch.category!, now, patch.status);
  }
  if (patch.assignee !== undefined) (sets.push("assignee_id = ?"), params.push(patch.assignee));
  if (patch.note !== undefined) (sets.push("flow_note = ?"), params.push(patch.note));
  if (patch.from !== undefined) (sets.push("flow_from = ?"), params.push(patch.from));
  if (patch.since) (sets.push("flow_since = ?"), params.push(patch.since));
  await run(`UPDATE dept_tasks SET ${sets.join(", ")} WHERE id = ?`, ...params, id);
}

// What must hold before a task moves into a status: its required fields, no open subtasks before Done, nothing
// blocking it.
async function checkInto(a: WorkAccess, r: Row, to: string) {
  const cfg = a.config;
  const target = statusOf(cfg, to)!;
  const missing = missingFor(a, r, target.category, false);
  if (missing.length) throw new WorkflowError("VALIDATION", `Fill in ${missing.map((m) => `"${m}"`).join(", ")} on ${r.code} first.`);
  if (target.category === "done" && cfg.features.subtasks) {
    const n = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_tasks WHERE parent_id = ? AND status_category IN ('open','active','review')", r.id))?.n ?? 0);
    if (n) throw new WorkflowError("VALIDATION", `Finish the ${n} open subtask${n === 1 ? "" : "s"} of ${r.code} first.`);
  }
  if (cfg.features.dependencies && target.category !== "open") {
    const b = await all<{ code: string }>("SELECT b.code FROM dept_task_links l JOIN dept_tasks b ON b.id = l.blocked_by WHERE l.task_id = ? AND b.status_category NOT IN ('done','cancelled')", r.id);
    if (b.length) throw new WorkflowError("VALIDATION", `${r.code} is blocked by ${b.map((x) => x.code).join(", ")}. Finish ${b.length === 1 ? "it" : "them"} first.`);
  }
}

async function checkersOf(dp: string, s: FlowStage) {
  return s.kind === "check" && s.checkers === "people" ? s.people : await deptManagers(dp);
}

// Moves a task on from its stage: to the next stage (arriving, or straight into To do), to another department as a
// request, or to the end. Who has it next follows the receiving stage.
async function advance(user: AppUser, a: WorkAccess, r: Row, s: FlowStage, now: string, opts: { assignee?: string | null; why?: string } = {}) {
  const dp = a.dept;
  const cfg = a.config;
  const flow = cfg.flow;
  if (s.nextDept) {
    const other = await getDeptConfig(s.nextDept);
    const type = other.types.find((t) => t.active && (!other.intake.types.length || other.intake.types.includes(t.key)))?.key;
    if (!other.features.requests || !type) throw new WorkflowError("INVALID_STATE", `${other.title} does not take requests now, so ${r.code} cannot be handed to it.`);
    const req = await createRequest(user, s.nextDept, { title: r.title, description: `From ${r.code} in ${cfg.title}.${r.description ? `\n\n${r.description}` : ""}`, type, dueDate: r.due_date });
    await run("INSERT INTO dept_task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("tcm_"), r.id, user.id, `Handed to ${other.title} as ${req.code}.`, now);
  }
  const target = s.next ? flow.stages.find((x) => x.status === s.next) : null;
  let to: string;
  let state: FlowState | null;
  let assignee = r.assignee_id;
  if (target) {
    to = entryStatus(target);
    state = target.kind === "final" ? null : target.accept ? "arriving" : "todo";
    if (opts.assignee !== undefined) assignee = opts.assignee;
    else if (target.kind === "work" && target.receiver === "lead") assignee = null;
    else if (target.kind === "work" && target.receiver !== "keep") assignee = (await deptPeople(dp)).some((p) => p.id === target.receiver) ? target.receiver : r.assignee_id;
  } else {
    // The end: the stage's own status when it already counts as done, else the first Done status.
    to = categoryOf(cfg, s.status) === "done" ? s.status : (cfg.statuses.find((x) => x.active && x.category === "done")?.key ?? s.status);
    state = null;
  }
  await checkInto(a, r, to);
  const category = categoryOf(cfg, to);
  await setRow(r.id, { status: to, category, state, assignee, note: null, from: r.status, since: now }, now);
  const toLabel = labelOf(cfg.statuses, to);
  await audit({ actor: user }, { itemId: r.id, action: `${dp}.flow`, summary: `${user.name} moved ${r.code} on from ${labelOf(cfg.statuses, s.status)} to ${toLabel}${opts.why ? ` (${opts.why})` : ""}` });
  if (to !== r.status) await afterStatusChange(user, a, dp, r.id, r.status, to, now);
  // Tell whoever has it now.
  if (target && target.kind !== "final") {
    if (target.kind === "check" || target.kind === "release" || target.kind === "intake")
      await notify(await checkersOf(dp, target), { type: "handoff", title: `${r.code} arrived in ${toLabel}`, body: r.title, link: homeLink(dp), groupKey: `flow:${dp}:${target.status}` }, now, user.id);
    else if (target.accept || !assignee)
      await notify(await deptManagers(dp), { type: "handoff", title: `${r.code} arrived in ${toLabel}${assignee ? "" : ", to assign"}`, body: r.title, link: homeLink(dp), groupKey: `flow:${dp}:${target.status}` }, now, user.id);
    else if (assignee !== user.id)
      await notify([assignee], { type: "assignment", title: `${r.code} is yours in ${toLabel}`, body: r.title, link: homeLink(dp), dedupeKey: `flow-arrive:${r.id}:${now}` }, now, user.id);
  }
  return to;
}

type Result = { id: string; code: string; ok: boolean; error?: string };
async function each(ids: string[], fn: (id: string) => Promise<string>): Promise<Result[]> {
  const out: Result[] = [];
  for (const id of [...new Set(ids)].slice(0, 200)) {
    try {
      out.push({ id, code: await tx(() => fn(id)), ok: true });
    } catch (e) {
      const code = (await get<{ code: string }>("SELECT code FROM dept_tasks WHERE id = ?", id))?.code ?? id;
      out.push({ id, code, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

async function stopTimerOn(userId: string, taskId: string, now: string) {
  const rows = await all<{ id: string; started_at: string }>("SELECT id, started_at FROM dept_time_entries WHERE user_id = ? AND task_id = ? AND ended_at IS NULL", userId, taskId);
  for (const e of rows) await run("UPDATE dept_time_entries SET ended_at = ?, minutes = ? WHERE id = ?", now, Math.max(1, Math.round((Date.parse(now) - Date.parse(e.started_at)) / 60000)), e.id);
  if (rows.length) {
    const t = await get<{ m: number }>("SELECT SUM(minutes) AS m FROM dept_time_entries WHERE task_id = ? AND ended_at IS NOT NULL", taskId);
    await run("UPDATE dept_tasks SET spent_hours = ? WHERE id = ?", Math.round((Number(t?.m ?? 0) / 60) * 100) / 100, taskId);
  }
}

function ownWork(a: WorkAccess, user: AppUser, r: Row) {
  if (a.readOnly) throw new WorkflowError("FORBIDDEN", "This department is read only for you.");
  if (r.assignee_id !== user.id && !isLead(a)) throw new WorkflowError("FORBIDDEN", `${r.code} is not assigned to you.`);
}

// Member: start (the timer runs while it is in progress).
export async function flowStart(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d, "write");
  const r = await load(a.dept, id);
  const { s, state } = placeOf(a, r);
  if (s.kind !== "work") throw new WorkflowError("INVALID_STATE", `${r.code} is not work to do in ${labelOf(a.config.statuses, s.status)}.`);
  ownWork(a, user, r);
  if (state !== "todo") throw new WorkflowError("INVALID_STATE", `${r.code} is ${state ? state.replace("_", " ") : "finished"}, not waiting to start.`);
  if (!r.assignee_id) throw new WorkflowError("INVALID_STATE", `Assign ${r.code} to someone first.`);
  const who = r.assignee_id;
  if (s.wip) {
    const n = Number(
      (await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_tasks WHERE dept = ? AND assignee_id = ? AND status = ? AND flow_state = 'working' AND id <> ?", a.dept, who, s.status, id))?.n ?? 0,
    );
    if (n >= s.wip) throw new WorkflowError("VALIDATION", `${n} ${(n === 1 ? a.config.names.task : a.config.names.tasks).toLowerCase()} already in progress (limit ${s.wip}). Finish or pause one first.`);
  }
  const now = nowIso();
  await tx(async () => {
    await setRow(id, { status: s.status, category: categoryOf(a.config, s.status), state: "working" }, now);
    if (a.config.features.timeTracking && who === user.id) {
      const open = await all<{ id: string; task_id: string }>("SELECT id, task_id FROM dept_time_entries WHERE user_id = ? AND ended_at IS NULL", user.id);
      for (const e of open) await stopTimerOn(user.id, e.task_id, now);
      await run("INSERT INTO dept_time_entries (id, task_id, dept, user_id, started_at, minutes, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)", uid("tme_"), id, a.dept, user.id, now, now);
    }
  });
  await audit({ actor: user }, { itemId: id, action: `${a.dept}.flow`, summary: `${user.name} started ${r.code}` });
  if (r.status !== s.status) await afterStatusChange(user, a, a.dept, id, r.status, s.status, now);
}

// Member: pause (stops the timer; back to To do).
export async function flowPause(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d, "write");
  const r = await load(a.dept, id);
  const { s, state } = placeOf(a, r);
  ownWork(a, user, r);
  if (s.kind !== "work" || state !== "working") throw new WorkflowError("INVALID_STATE", `${r.code} is not in progress.`);
  const now = nowIso();
  const to = s.queueStatus ?? s.status;
  await stopTimerOn(user.id, id, now);
  await setRow(id, { status: to, category: categoryOf(a.config, to), state: "todo" }, now);
  if (to !== r.status) await afterStatusChange(user, a, a.dept, id, r.status, to, now);
}

// Member: done (everything the stage needs is filled in; the timer stops). Not sent yet.
export async function flowDone(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d, "write");
  const r = await load(a.dept, id);
  const { s, state } = placeOf(a, r);
  ownWork(a, user, r);
  if (s.kind !== "work" || (state !== "todo" && state !== "working")) throw new WorkflowError("INVALID_STATE", `${r.code} cannot be marked done now.`);
  const missing = missingFor(a, r, nextCategory(a, s), s.needChecklist);
  if (missing.length) throw new WorkflowError("REQUIREMENTS_MISSING", `${r.code} still needs: ${missing.slice(0, 6).join("; ")}${missing.length > 6 ? "; and more" : ""}.`);
  const now = nowIso();
  await stopTimerOn(user.id, id, now);
  await setRow(id, { status: s.status, category: categoryOf(a.config, s.status), state: "done" }, now);
  await audit({ actor: user }, { itemId: id, action: `${a.dept}.flow`, summary: `${user.name} marked ${r.code} done` });
  if (r.status !== s.status) await afterStatusChange(user, a, a.dept, id, r.status, s.status, now);
}

// Member: reopen something marked done but not sent.
export async function flowReopen(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d, "write");
  const r = await load(a.dept, id);
  const { s, state } = placeOf(a, r);
  ownWork(a, user, r);
  if (s.kind !== "work" || state !== "done") throw new WorkflowError("INVALID_STATE", `${r.code} is not done and waiting to be sent.`);
  await setRow(id, { state: "working" }, nowIso());
}

// Member: send what is done, one or all. To the lead when the stage is reviewed, otherwise straight on.
export async function flowSend(user: AppUser, d: string, ids: string[]) {
  const a = await workAccess(user, d, "write");
  return each(ids, async (id) => {
    const r = await load(a.dept, id);
    const { s, state } = placeOf(a, r);
    ownWork(a, user, r);
    if (s.kind !== "work" || state !== "done") throw new Error("Mark it done first.");
    const now = nowIso();
    if (s.review) {
      await setRow(id, { state: "sent", note: null }, now);
      const to = r.reviewer_id ? [r.reviewer_id] : await deptManagers(a.dept);
      await notify(to, { type: "approval", title: `${r.code} is waiting for your approval`, body: `${r.title}${r.assignee_name ? ` (by ${r.assignee_name})` : ""}`, link: homeLink(a.dept), groupKey: `flow-approve:${a.dept}` }, now, user.id);
      await audit({ actor: user }, { itemId: id, action: `${a.dept}.flow`, summary: `${user.name} sent ${r.code} to the lead` });
    } else await advance(user, a, r, s, now);
    return r.code;
  });
}

function needLead(a: WorkAccess) {
  if (!isLead(a)) throw new WorkflowError("FORBIDDEN", "Only heads and leads do this.");
}

// Lead: approve what was sent. With a next stage it waits to be handed over (as a batch); at the end it is finished.
export async function flowApprove(user: AppUser, d: string, ids: string[]) {
  const a = await workAccess(user, d, "write");
  needLead(a);
  return each(ids, async (id) => {
    const r = await load(a.dept, id);
    const { s, state } = placeOf(a, r);
    if (s.kind !== "work" || state !== "sent") throw new Error("It is not waiting for approval.");
    const now = nowIso();
    await audit({ actor: user }, { itemId: id, action: `${a.dept}.flow`, summary: `${user.name} approved ${r.code}` });
    // Handing over to the end makes no sense: approving work whose next stage is the last one finishes it.
    const target = s.next ? a.config.flow.stages.find((x) => x.status === s.next) : null;
    if (s.nextDept || (target && target.kind !== "final")) await setRow(id, { state: "ready" }, now);
    else await advance(user, a, r, s, now, { why: "approved" });
    if (r.assignee_id && r.assignee_id !== user.id) await notify([r.assignee_id], { type: "handoff", title: `${r.code} was approved`, body: r.title, link: homeLink(a.dept), groupKey: `flow-approved:${a.dept}` }, now, user.id);
    return r.code;
  });
}

// Lead: return what was sent (or approved, before hand-over) with a note; it goes back to the person's To do.
export async function flowReturn(user: AppUser, d: string, id: string, note: string) {
  const a = await workAccess(user, d, "write");
  needLead(a);
  if (!note?.trim()) throw new WorkflowError("VALIDATION", "Say what needs to change.");
  const r = await load(a.dept, id);
  const { s, state } = placeOf(a, r);
  if (s.kind !== "work" || (state !== "sent" && state !== "ready" && state !== "done")) throw new WorkflowError("INVALID_STATE", `${r.code} is not waiting for the lead.`);
  const now = nowIso();
  const to = s.queueStatus ?? s.status;
  await setRow(id, { status: to, category: categoryOf(a.config, to), state: "todo", note: note.trim().slice(0, 2000) }, now);
  await run("INSERT INTO dept_task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("tcm_"), id, user.id, `Returned: ${note.trim()}`, now);
  if (r.assignee_id) await notify([r.assignee_id], { type: "handoff", title: `${r.code} was returned to you`, body: note.trim(), link: homeLink(a.dept), dedupeKey: `flow-return:${id}:${now}` }, now, user.id);
  await audit({ actor: user }, { itemId: id, action: `${a.dept}.flow`, summary: `${user.name} returned ${r.code}: ${note.trim().slice(0, 200)}` });
  if (to !== r.status) await afterStatusChange(user, a, a.dept, id, r.status, to, now);
}

// Lead: hand approved work over to the next stage, as a batch.
export async function flowHandOver(user: AppUser, d: string, ids: string[]) {
  const a = await workAccess(user, d, "write");
  needLead(a);
  return each(ids, async (id) => {
    const r = await load(a.dept, id);
    const { s, state } = placeOf(a, r);
    if (state !== "ready") throw new Error("It is not approved and waiting.");
    await advance(user, a, r, s, nowIso());
    return r.code;
  });
}

// Receiver: accept what arrived (a check stage's people, or the lead for a work stage).
export async function flowAccept(user: AppUser, d: string, ids: string[]) {
  const a = await workAccess(user, d, "write");
  return each(ids, async (id) => {
    const r = await load(a.dept, id);
    const { s, state } = placeOf(a, r);
    if (state !== "arriving") throw new Error("It is not arriving.");
    if (s.kind === "check" ? !checks(a, user, s) : !isLead(a)) throw new Error("Only the people who receive this stage accept it.");
    await setRow(id, { state: "todo" }, nowIso());
    await audit({ actor: user }, { itemId: id, action: `${a.dept}.flow`, summary: `${user.name} accepted ${r.code} into ${labelOf(a.config.statuses, s.status)}` });
    return r.code;
  });
}

// Receiver: send what arrived back as missing or incomplete, to the stage it came from.
export async function flowSendBack(user: AppUser, d: string, id: string, note: string) {
  const a = await workAccess(user, d, "write");
  if (!note?.trim()) throw new WorkflowError("VALIDATION", "Say what is missing.");
  const r = await load(a.dept, id);
  const { s, state } = placeOf(a, r);
  if (state !== "arriving") throw new WorkflowError("INVALID_STATE", `${r.code} is not arriving.`);
  if (s.kind === "check" ? !checks(a, user, s) : !isLead(a)) throw new WorkflowError("FORBIDDEN", "Only the people who receive this stage send it back.");
  const back = (r.flow_from && stageFor(a.config.flow, r.flow_from)) || returnStage(a.config.flow, s);
  if (!back) throw new WorkflowError("INVALID_STATE", `There is no earlier stage to send ${r.code} back to.`);
  await sendBackTo(user, a, r, back, `Sent back as missing: ${note.trim()}`, nowIso());
}

async function sendBackTo(user: AppUser, a: WorkAccess, r: Row, back: FlowStage, note: string, at: string) {
  const to = entryStatus(back);
  await setRow(r.id, { status: to, category: categoryOf(a.config, to), state: "todo", note: note.slice(0, 2000), from: r.status, since: at }, at);
  await run("INSERT INTO dept_task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("tcm_"), r.id, user.id, note, at);
  const tell = back.kind === "work" ? (r.assignee_id ? [r.assignee_id] : await deptManagers(a.dept)) : await checkersOf(a.dept, back);
  await notify(tell, { type: "handoff", title: `${r.code} came back to ${labelOf(a.config.statuses, back.status)}`, body: note, link: homeLink(a.dept), dedupeKey: `flow-back:${r.id}:${at}` }, at, user.id);
  await audit({ actor: user }, { itemId: r.id, action: `${a.dept}.flow`, summary: `${user.name} sent ${r.code} back to ${labelOf(a.config.statuses, back.status)}: ${note.slice(0, 200)}` });
  if (to !== r.status) await afterStatusChange(user, a, a.dept, r.id, r.status, to, at);
}

// Checker: pass work on (code review approved, QA passed).
export async function flowPass(user: AppUser, d: string, ids: string[]) {
  const a = await workAccess(user, d, "write");
  return each(ids, async (id) => {
    const r = await load(a.dept, id);
    const { s, state } = placeOf(a, r);
    if (s.kind !== "check") throw new Error("It is not waiting for a check.");
    if (!checks(a, user, s)) throw new Error(`Only the people who check ${labelOf(a.config.statuses, s.status)} pass it.`);
    if (state !== "todo") throw new Error(state === "arriving" ? "Accept it first." : "It is not waiting for a check.");
    await advance(user, a, r, s, nowIso(), { why: "passed" });
    return r.code;
  });
}

// Checker: return work to the stage before (the developer, the writer), with comments; as a bug with steps to
// reproduce when the stage says so.
export async function flowCheckReturn(user: AppUser, d: string, id: string, note: string) {
  const a = await workAccess(user, d, "write");
  const r = await load(a.dept, id);
  const { s, state } = placeOf(a, r);
  if (s.kind !== "check") throw new WorkflowError("INVALID_STATE", `${r.code} is not waiting for a check.`);
  if (!checks(a, user, s)) throw new WorkflowError("FORBIDDEN", `Only the people who check ${labelOf(a.config.statuses, s.status)} return it.`);
  if (state !== "todo" && state !== "arriving") throw new WorkflowError("INVALID_STATE", `${r.code} is not waiting for a check.`);
  if (!note?.trim()) throw new WorkflowError("VALIDATION", s.returnAsBug ? "Write the steps to reproduce the bug." : "Say what needs to change.");
  const back = returnStage(a.config.flow, s);
  if (!back) throw new WorkflowError("INVALID_STATE", `There is no work stage before ${labelOf(a.config.statuses, s.status)} to return ${r.code} to.`);
  const at = nowIso();
  if (s.returnAsBug) {
    const labels = [...new Set([...parseJson<string[]>(r.labels, []), "bug"])].slice(0, 12);
    await run("UPDATE dept_tasks SET labels = ? WHERE id = ?", JSON.stringify(labels), id);
  }
  await sendBackTo(user, a, r, back, `${s.returnAsBug ? `Bug found in ${labelOf(a.config.statuses, s.status)}. Steps to reproduce:\n` : `Returned from ${labelOf(a.config.statuses, s.status)}: `}${note.trim()}`, at);
}

// Lead: triage something in the intake (priority, sprint, person) and plan it into the next stage. A request from
// another department is accepted at the same time.
export async function flowPlan(user: AppUser, d: string, id: string, input: { priority?: string | null; sprintId?: string | null; assigneeId?: string | null }) {
  const a = await workAccess(user, d, "write");
  needLead(a);
  const r = await load(a.dept, id);
  const { s } = placeOf(a, r);
  if (s.kind !== "intake") throw new WorkflowError("INVALID_STATE", `${r.code} is not in the intake.`);
  if (!s.next && !s.nextDept) throw new WorkflowError("INVALID_STATE", `Say in Configure, Flow where ${labelOf(a.config.statuses, s.status)} goes next.`);
  const people = (await deptPeople(a.dept)).map((p) => p.id);
  if (input.assigneeId && !people.includes(input.assigneeId)) throw new WorkflowError("VALIDATION", "That person is not in this department.");
  if (input.priority && !a.config.priorities.some((p) => p.key === input.priority && p.active)) throw new WorkflowError("VALIDATION", "Unknown priority.");
  if (input.sprintId && !(await get("SELECT 1 AS x FROM dept_sprints WHERE id = ? AND dept = ?", input.sprintId, a.dept))) throw new WorkflowError("VALIDATION", "Unknown sprint.");
  const at = nowIso();
  if (r.request_state === "pending") await decideRequest(user, a.dept, id, "accept", {});
  await run(
    "UPDATE dept_tasks SET priority = COALESCE(?, priority), sprint_id = CASE WHEN ? THEN ? ELSE sprint_id END, updated_at = ? WHERE id = ?",
    input.priority || null,
    input.sprintId !== undefined,
    input.sprintId || null,
    at,
    id,
  );
  const fresh = await load(a.dept, id);
  const target = s.next ? a.config.flow.stages.find((x) => x.status === s.next) : null;
  // A named person goes with it; otherwise the receiving stage decides (and work stages wait to be assigned).
  const assignee = input.assigneeId !== undefined && input.assigneeId !== null ? input.assigneeId : target?.kind === "work" && target.receiver === "keep" ? (fresh.assignee_id ?? null) : undefined;
  await advance(user, a, fresh, s, at, { assignee, why: "planned" });
  if (input.assigneeId && input.assigneeId !== user.id && a.config.notify.assigned)
    await notify([input.assigneeId], { type: "assignment", title: `${r.code} was assigned to you`, body: r.title, link: homeLink(a.dept), dedupeKey: `task-assign:${id}:${input.assigneeId}:${at}` }, at, user.id);
}

// Lead: decline a request waiting in the intake.
export async function flowDecline(user: AppUser, d: string, id: string, note: string) {
  const a = await workAccess(user, d, "write");
  needLead(a);
  await decideRequest(user, a.dept, id, "decline", { note });
}

// Lead: give work nobody has to someone (with their load in view).
export async function flowAssign(user: AppUser, d: string, ids: string[], userId: string) {
  const a = await workAccess(user, d, "write");
  needLead(a);
  if (!a.rights.assign) throw new WorkflowError("FORBIDDEN", "You cannot assign tasks here.");
  if (!(await deptPeople(a.dept)).some((p) => p.id === userId)) throw new WorkflowError("VALIDATION", "That person is not in this department.");
  const res = await each(ids, async (id) => {
    const r = await load(a.dept, id);
    const { s, state } = placeOf(a, r);
    if (s.kind !== "work" || state !== "todo") throw new Error("Only work waiting to start is assigned here.");
    await run("UPDATE dept_tasks SET assignee_id = ?, updated_at = ? WHERE id = ?", userId, nowIso(), id);
    await audit({ actor: user }, { itemId: id, action: `${a.dept}.flow`, summary: `${user.name} assigned ${r.code}` });
    return r.code;
  });
  const done = res.filter((x) => x.ok);
  if (done.length && userId !== user.id && a.config.notify.assigned)
    await notify([userId], { type: "assignment", title: done.length === 1 ? `${done[0]!.code} was assigned to you` : `${done.length} ${a.config.names.tasks.toLowerCase()} were assigned to you`, link: homeLink(a.dept), dedupeKey: `flow-assign:${userId}:${nowIso()}` }, nowIso(), user.id);
  return res;
}

// Lead: group what is ready into a release with notes; the tasks move on (to Released).
export async function flowRelease(user: AppUser, d: string, input: { ids: string[]; name: string; notes: string; version?: string | null }) {
  const a = await workAccess(user, d, "write");
  needLead(a);
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the release, for example v1.4.0.");
  if (!input.ids.length) throw new WorkflowError("VALIDATION", "Choose what goes into the release.");
  if (await get("SELECT 1 AS x FROM dept_releases WHERE dept = ? AND lower(name) = lower(?)", a.dept, name)) throw new WorkflowError("VALIDATION", `There is already a release called ${name}.`);
  const id = uid("rel_");
  const at = nowIso();
  await run("INSERT INTO dept_releases (id, dept, name, notes, task_count, created_by, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)", id, a.dept, name, input.notes.trim().slice(0, 20000), user.id, at);
  const res = await each(input.ids, async (tid) => {
    const r = await load(a.dept, tid);
    const { s } = placeOf(a, r);
    if (s.kind !== "release") throw new Error("It is not ready to release.");
    await run("UPDATE dept_tasks SET release_id = ? WHERE id = ?", id, tid);
    await advance(user, a, r, s, at, { why: `released in ${name}` });
    return r.code;
  });
  const n = res.filter((x) => x.ok).length;
  if (!n) {
    await run("DELETE FROM dept_releases WHERE id = ?", id);
    return { id: null, results: res };
  }
  // A version (1.4.0) from the name or given, for deployments and DORA (Phase 12b.5).
  const ver = (input.version ?? name).trim().match(/^v?(\d+\.\d+\.\d+)/)?.[1] ?? null;
  await run("UPDATE dept_releases SET task_count = ?, version = ? WHERE id = ?", n, ver, id);
  void import("./dev-tools").then((m) => m.emitDev(a.dept, "release", { id, name, version: ver, tasks: n }, `${a.config.title}: ${name} released (${n} ${n === 1 ? a.config.names.task.toLowerCase() : a.config.names.tasks.toLowerCase()})`)).catch(() => {});
  await notify(await deptPeople(a.dept).then((p) => p.map((x) => x.id)), { type: "handoff", title: `${a.config.title}: ${name} released`, body: `${n} ${(n === 1 ? a.config.names.task : a.config.names.tasks).toLowerCase()}`, link: homeLink(a.dept), dedupeKey: `release:${id}` }, at, user.id);
  await audit({ actor: user }, { action: `${a.dept}.release`, summary: `${user.name} released ${name} with ${n} ${a.config.names.tasks.toLowerCase()}` });
  return { id, results: res };
}

// Release notes drafted from the tasks, grouped by type; the lead edits them before releasing.
export async function draftReleaseNotes(user: AppUser, d: string, ids: string[]) {
  const a = await workAccess(user, d);
  if (!ids.length) return "";
  const rows = await all<{ code: string; title: string; type: string }>(`SELECT code, title, type FROM dept_tasks WHERE dept = ? AND id IN (${placeholders(ids.length)}) ORDER BY code`, a.dept, ...ids.slice(0, 200));
  const groups = new Map<string, string[]>();
  for (const r of rows) groups.set(r.type, [...(groups.get(r.type) ?? []), `- ${r.title} (${r.code})`]);
  return [...groups.entries()].map(([t, lines]) => `${labelOf(a.config.types, t)}\n${lines.join("\n")}`).join("\n\n");
}

export async function releases(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  const rows = await all<{ id: string; name: string; notes: string; task_count: number; created_at: string; by: string | null }>(
    "SELECT r.id, r.name, r.notes, r.task_count, r.created_at, u.name AS by FROM dept_releases r LEFT JOIN users u ON u.id = r.created_by WHERE r.dept = ? ORDER BY r.created_at DESC LIMIT 100",
    a.dept,
  );
  return rows.map((r) => ({ ...r, task_count: Number(r.task_count) }));
}

// ---------------------------------------------------------------------------
// Merged pull requests move work on by itself (stages with "moves on when merged"), from the scheduled checks.
// ---------------------------------------------------------------------------

export async function applyMergedPullRequests() {
  const depts = (await all<{ dept: string }>("SELECT dept FROM dept_config")).map((r) => r.dept);
  let moved = 0;
  for (const dp of depts) {
    const cfg = await getDeptConfig(dp).catch(() => null);
    if (!cfg?.flow.on) continue;
    const stages = cfg.flow.stages.filter((s) => s.autoOnMerge);
    if (!stages.length) continue;
    const prs = await cachedPrsByCode(dp);
    const merged = [...prs.entries()].filter(([, list]) => list.some((p) => p.state === "merged")).map(([c]) => c);
    if (!merged.length) continue;
    // Act as the department's first head or lead, so the history says who the move counts for.
    const leadId = (await deptManagers(dp))[0];
    const actor = leadId ? await loadUser(leadId) : null;
    if (!actor) continue;
    const a = await workAccess(actor, dp, "write").catch(() => null);
    if (!a) continue;
    const statuses = stages.flatMap((s) => [s.status, ...(s.queueStatus ? [s.queueStatus] : [])]);
    const rows = await all<Row>(
      `${SELECT} WHERE t.dept = ? AND t.status IN (${placeholders(statuses.length)}) AND upper(t.code) IN (${placeholders(merged.length)})`,
      dp,
      ...statuses,
      ...merged,
    );
    for (const r of rows) {
      const s = stageFor(cfg.flow, r.status)!;
      const state = effectiveState(s, r.status, r.flow_state);
      if (state === "arriving" || state === "sent" || state === "ready") continue;
      const pr = prs.get(r.code.toUpperCase())!.find((p) => p.state === "merged")!;
      try {
        await tx(() => advance(actor, a, r, s, nowIso(), { why: `pull request #${pr.number} was merged` }));
        moved++;
      } catch {
        // Something required is still missing; it stays for a person to finish.
      }
    }
  }
  return moved;
}
