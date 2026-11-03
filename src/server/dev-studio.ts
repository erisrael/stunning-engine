// Phase 12b, the Dev studio, for any department that switches the parts on (Dev first):
// - sprints set up in Configure, Sprints (length, start day, naming, hours or story points, rituals, what happens
//   to unfinished work); planning against each person's capacity; burndown and burnup with scope added after the
//   start; daily stand-up notes; the sprint review and retrospective (actions become tasks); velocity;
// - the roadmap: projects by quarter with progress, health, the team, open bugs, the next milestone;
// - specs and documents per project (SRS, PRD, technical design, decision records, test plan, release notes,
//   runbook, postmortem) from templates written for Myseed, with versions, named reviewers and approval, and
//   requirements traced to tasks;
// - DORA measures from the releases.

import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { deptManagers, deptPeople } from "./departments";
import { need, workAccess, type WorkAccess } from "./dept-config";
import { saveTask } from "./work";
import type { AppUser } from "./users";
import { labelOf, type SprintConfig } from "@/lib/dept-config";
import { DOC_KINDS, DOC_TEMPLATES, requirementIds, type DocKind } from "@/lib/dev-docs";
import { deptPath } from "@/lib/work";

const DAY = 864e5;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY));
const today = () => nowIso().slice(0, 10);
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

function sprintsOn(a: WorkAccess) {
  if (!a.config.features.sprints) throw new WorkflowError("INVALID_STATE", `Sprints are switched off in ${a.config.title} (Configure, General, Features).`);
}

type TaskRow = { id: string; code: string; title: string; type: string; status: string; status_category: string; priority: string; assignee_id: string | null; assignee: string | null; points: number | null; estimate_hours: number | null; completed_at: string | null; sprint_added_at: string | null; created_at: string };
const TASKS = `SELECT t.id, t.code, t.title, t.type, t.status, t.status_category, t.priority, t.assignee_id, u.name AS assignee, t.points, t.estimate_hours, t.completed_at, t.sprint_added_at, t.created_at
  FROM dept_tasks t LEFT JOIN users u ON u.id = t.assignee_id`;

const unitsOf = (cfg: SprintConfig, t: { points: number | null; estimate_hours: number | null }) => (cfg.unit === "points" ? num(t.points) : num(t.estimate_hours));

// ---------------------------------------------------------------------------
// Sprints
// ---------------------------------------------------------------------------

type SprintRow = { id: string; name: string; goal: string | null; start_date: string | null; end_date: string | null; status: string; planned_units: number | null; done_units: number | null; closed_at: string | null; review_note: string | null };

export async function sprintPage(user: AppUser, d: string, sprintId?: string | null) {
  const a = await workAccess(user, d);
  sprintsOn(a);
  const cfg = a.config.sprint;
  const sprints = await all<SprintRow>("SELECT id, name, goal, start_date, end_date, status, planned_units, done_units, closed_at, review_note FROM dept_sprints WHERE dept = ? ORDER BY COALESCE(start_date, created_at) DESC LIMIT 60", a.dept);
  const current = sprints.find((s) => s.id === sprintId) ?? sprints.find((s) => s.status === "active") ?? sprints.find((s) => s.status === "planned") ?? sprints[0] ?? null;
  const people = (await deptPeople(a.dept)).map((p) => ({ id: p.id, name: p.name }));
  const card = (t: TaskRow) => ({
    id: t.id,
    code: t.code,
    title: t.title,
    type: labelOf(a.config.types, t.type),
    status: labelOf(a.config.statuses, t.status),
    done: t.status_category === "done",
    priority: t.priority,
    assigneeId: t.assignee_id,
    assignee: t.assignee,
    units: unitsOf(cfg, t),
    addedLate: false,
  });
  if (!current) return { cfg, sprints, current: null, tasks: [], backlog: [], capacity: [], burn: null, standups: [], retro: [], velocity: velocityOf([]), people, canPlan: a.rights.projects && !a.readOnly, unit: cfg.unit };
  const rows = await all<TaskRow>(`${TASKS} WHERE t.dept = ? AND t.sprint_id = ? AND t.status_category <> 'cancelled' ORDER BY t.sort`, a.dept, current.id);
  const start = current.start_date;
  const tasks = rows.map((t) => ({ ...card(t), addedLate: !!(start && t.sprint_added_at && t.sprint_added_at.slice(0, 10) > start) }));
  const backlog = (
    await all<TaskRow>(`${TASKS} WHERE t.dept = ? AND t.sprint_id IS NULL AND t.parent_id IS NULL AND t.status_category IN ('open','active','review') ORDER BY t.updated_at DESC LIMIT 300`, a.dept)
  ).map(card);
  const rank = (p: string) => {
    const i = a.config.priorities.findIndex((x) => x.key === p);
    return i < 0 ? 99 : i;
  };
  backlog.sort((x, y) => rank(x.priority) - rank(y.priority));
  // Capacity for this sprint: story points per sprint, or hours per week times the sprint's weeks.
  const caps = await all<{ user_id: string; hours_per_week: number; points_per_sprint: number | null }>("SELECT user_id, hours_per_week, points_per_sprint FROM dept_capacity WHERE dept = ?", a.dept);
  const weeks = start && current.end_date ? Math.max(1, Math.round((Date.parse(current.end_date) - Date.parse(start)) / DAY + 1) / 7) : cfg.lengthWeeks;
  const capacity = people.map((p) => {
    const c = caps.find((x) => x.user_id === p.id);
    const cap = cfg.unit === "points" ? num(c?.points_per_sprint) : Math.round(num(c?.hours_per_week) * weeks);
    return { ...p, capacity: cap, load: tasks.filter((t) => t.assigneeId === p.id).reduce((n, t) => n + t.units, 0) };
  });
  const standups = await all<{ user_id: string; name: string; day: string; yesterday: string | null; today: string | null; blockers: string | null }>(
    "SELECT s.user_id, u.name, s.day, s.yesterday, s.today, s.blockers FROM dept_standups s JOIN users u ON u.id = s.user_id WHERE s.sprint_id = ? ORDER BY s.day DESC, u.name LIMIT 200",
    current.id,
  );
  const retro = await all<{ id: string; kind: string; text: string; author: string | null; task_id: string | null; task_code: string | null }>(
    "SELECT r.id, r.kind, r.text, u.name AS author, r.task_id, t.code AS task_code FROM dept_retro r LEFT JOIN users u ON u.id = r.author_id LEFT JOIN dept_tasks t ON t.id = r.task_id WHERE r.sprint_id = ? ORDER BY r.created_at",
    current.id,
  );
  return {
    cfg,
    sprints,
    current,
    tasks,
    backlog,
    capacity,
    burn: burnOf(cfg, current, rows),
    standups,
    retro,
    velocity: velocityOf(sprints),
    people,
    canPlan: a.rights.projects && !a.readOnly,
    unit: cfg.unit,
  };
}
export type SprintPage = Awaited<ReturnType<typeof sprintPage>>;

// Burndown and burnup per day: work left, work done, and the total (scope), with an ideal line.
function burnOf(cfg: SprintConfig, s: SprintRow, rows: TaskRow[]) {
  if (!s.start_date || !s.end_date) return null;
  const days: string[] = [];
  for (let d = s.start_date; d <= s.end_date && days.length < 60; d = addDays(d, 1)) days.push(d);
  const end = (d: string) => `${d}T23:59:59.999Z`;
  const scope = days.map((d) => rows.filter((t) => !t.sprint_added_at || t.sprint_added_at <= end(d)).reduce((n, t) => n + unitsOf(cfg, t), 0));
  const done = days.map((d) => rows.filter((t) => t.completed_at && t.completed_at <= end(d) && (!t.sprint_added_at || t.sprint_added_at <= end(d))).reduce((n, t) => n + unitsOf(cfg, t), 0));
  const now = today();
  const upTo = days.filter((d) => d <= now).length;
  const first = scope[0] ?? 0;
  return {
    days,
    scope: scope.map((v, i) => (i < upTo ? v : null)),
    done: done.map((v, i) => (i < upTo ? v : null)),
    remaining: scope.map((v, i) => (i < upTo ? v - done[i]! : null)),
    ideal: days.map((_, i) => Math.round((first - (first * i) / Math.max(1, days.length - 1)) * 10) / 10),
    // Scope added after the first day.
    added: Math.max(0, (scope[Math.max(0, upTo - 1)] ?? first) - first),
  };
}

function velocityOf(sprints: SprintRow[]) {
  const closed = sprints.filter((s) => s.status === "closed" && s.done_units != null).slice(0, 3);
  return { last: closed.map((s) => ({ name: s.name, planned: num(s.planned_units), done: num(s.done_units) })), average: closed.length ? Math.round((closed.reduce((n, s) => n + num(s.done_units), 0) / closed.length) * 10) / 10 : null };
}

// The next sprint, named and dated from Configure, Sprints.
export async function createNextSprint(user: AppUser, d: string, input: { goal?: string | null } = {}) {
  const a = await workAccess(user, d, "write");
  sprintsOn(a);
  need(a, "projects", "Only people who manage projects plan sprints.");
  const cfg = a.config.sprint;
  const last = await get<{ end_date: string | null }>("SELECT end_date FROM dept_sprints WHERE dept = ? AND end_date IS NOT NULL ORDER BY end_date DESC LIMIT 1", a.dept);
  let start = last?.end_date && last.end_date >= today() ? addDays(last.end_date, 1) : today();
  for (let i = 0; i < 7 && new Date(`${start}T00:00:00Z`).getUTCDay() !== cfg.startDay; i++) start = addDays(start, 1);
  const end = addDays(start, cfg.lengthWeeks * 7 - 1);
  const count = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_sprints WHERE dept = ?", a.dept))?.n ?? 0);
  const name = cfg.naming === "date" ? `Sprint ${new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : `Sprint ${count + 1}`;
  const id = uid("spr_");
  await run("INSERT INTO dept_sprints (id, dept, name, goal, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'planned', ?)", id, a.dept, name, input.goal?.trim() || null, start, end, nowIso());
  await audit({ actor: user }, { action: `${a.dept}.sprint`, summary: `${user.name} planned ${name} (${start} to ${end})` });
  return id;
}

export async function startSprint(user: AppUser, d: string, id: string, goal?: string | null) {
  const a = await workAccess(user, d, "write");
  sprintsOn(a);
  need(a, "projects", "Only people who manage projects start sprints.");
  const s = await get<SprintRow>("SELECT * FROM dept_sprints WHERE id = ? AND dept = ?", id, a.dept);
  if (!s || s.status !== "planned") throw new WorkflowError("INVALID_STATE", "Only a planned sprint is started.");
  if (await get("SELECT 1 AS x FROM dept_sprints WHERE dept = ? AND status = 'active'", a.dept)) throw new WorkflowError("INVALID_STATE", "Close the current sprint first (its review moves unfinished work on).");
  const start = s.start_date && s.start_date >= today() ? s.start_date : today();
  await run("UPDATE dept_sprints SET status = 'active', goal = COALESCE(?, goal), start_date = ?, end_date = COALESCE(end_date, ?) WHERE id = ?", goal?.trim() || null, start, addDays(start, a.config.sprint.lengthWeeks * 7 - 1), id);
  await notify((await deptPeople(a.dept)).map((p) => p.id), { type: "handoff", title: `${s.name} started`, body: goal?.trim() || s.goal || undefined, link: `${deptPath(a.dept)}/sprint`, dedupeKey: `sprint-start:${id}` }, nowIso(), user.id);
  await audit({ actor: user }, { action: `${a.dept}.sprint`, summary: `${user.name} started ${s.name}` });
}

// Planning: a task in or out of a sprint.
export async function planTask(user: AppUser, d: string, taskId: string, sprintId: string | null) {
  const a = await workAccess(user, d, "write");
  sprintsOn(a);
  need(a, "projects", "Only people who manage projects plan sprints.");
  if (sprintId && !(await get("SELECT 1 AS x FROM dept_sprints WHERE id = ? AND dept = ? AND status <> 'closed'", sprintId, a.dept))) throw new WorkflowError("VALIDATION", "Choose an open sprint.");
  const ok = await run("UPDATE dept_tasks SET sprint_id = ?, sprint_added_at = ?, updated_at = ? WHERE id = ? AND dept = ?", sprintId, sprintId ? nowIso() : null, nowIso(), taskId, a.dept);
  if (!Number(ok.changes)) throw new WorkflowError("NOT_FOUND", "Task not found.");
}

export async function setSprintCapacity(user: AppUser, d: string, userId: string, value: number) {
  const a = await workAccess(user, d, "write");
  need(a, "assign", "Only heads and leads set capacity.");
  const v = Math.max(0, Math.min(500, Number(value) || 0));
  if (a.config.sprint.unit === "points")
    await run("INSERT INTO dept_capacity (dept, user_id, hours_per_week, points_per_sprint) VALUES (?, ?, 0, ?) ON CONFLICT (dept, user_id) DO UPDATE SET points_per_sprint = excluded.points_per_sprint", a.dept, userId, v);
  else await run("INSERT INTO dept_capacity (dept, user_id, hours_per_week) VALUES (?, ?, ?) ON CONFLICT (dept, user_id) DO UPDATE SET hours_per_week = excluded.hours_per_week", a.dept, userId, v);
}

// The sprint review: what was finished is kept with the sprint; unfinished work moves to the next sprint (made
// when there is none) or back to the backlog, as Configure, Sprints says.
export async function closeSprint(user: AppUser, d: string, id: string, note?: string | null) {
  const a = await workAccess(user, d, "write");
  sprintsOn(a);
  need(a, "projects", "Only people who manage projects close sprints.");
  const s = await get<SprintRow>("SELECT * FROM dept_sprints WHERE id = ? AND dept = ?", id, a.dept);
  if (!s || s.status === "closed") throw new WorkflowError("INVALID_STATE", "This sprint is already closed.");
  const rows = await all<TaskRow>(`${TASKS} WHERE t.dept = ? AND t.sprint_id = ? AND t.status_category <> 'cancelled'`, a.dept, id);
  const cfg = a.config.sprint;
  const done = rows.filter((t) => t.status_category === "done");
  const open = rows.filter((t) => t.status_category !== "done");
  let next: string | null = null;
  return tx(async () => {
    if (open.length && cfg.carryOver === "next") {
      next = (await get<{ id: string }>("SELECT id FROM dept_sprints WHERE dept = ? AND status = 'planned' AND id <> ? ORDER BY start_date LIMIT 1", a.dept, id))?.id ?? null;
      if (!next) {
        await run("UPDATE dept_sprints SET status = 'closed', closed_at = ? WHERE id = ?", nowIso(), id);
        next = await createNextSprint(user, a.dept);
      }
    }
    for (const t of open) await run("UPDATE dept_tasks SET sprint_id = ?, sprint_added_at = ? WHERE id = ?", next, next ? nowIso() : null, t.id);
    await run(
      "UPDATE dept_sprints SET status = 'closed', closed_at = ?, planned_units = ?, done_units = ?, review_note = ? WHERE id = ?",
      nowIso(),
      rows.reduce((n, t) => n + unitsOf(cfg, t), 0),
      done.reduce((n, t) => n + unitsOf(cfg, t), 0),
      note?.trim() || null,
      id,
    );
    await audit({ actor: user }, { action: `${a.dept}.sprint`, summary: `${user.name} closed ${s.name}: ${done.length} finished, ${open.length} ${next ? "moved to the next sprint" : "back to the backlog"}` });
    return { finished: done.length, moved: open.length, next };
  });
}

export async function saveStandup(user: AppUser, d: string, sprintId: string, input: { yesterday?: string | null; today?: string | null; blockers?: string | null }) {
  const a = await workAccess(user, d, "write");
  if (!(await get("SELECT 1 AS x FROM dept_sprints WHERE id = ? AND dept = ?", sprintId, a.dept))) throw new WorkflowError("NOT_FOUND", "Sprint not found.");
  const clean = (v: string | null | undefined) => v?.trim().slice(0, 1000) || null;
  const day = today();
  await run(
    `INSERT INTO dept_standups (id, sprint_id, user_id, day, yesterday, today, blockers, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (sprint_id, user_id, day) DO UPDATE SET yesterday = excluded.yesterday, today = excluded.today, blockers = excluded.blockers`,
    uid("stu_"),
    sprintId,
    user.id,
    day,
    clean(input.yesterday),
    clean(input.today),
    clean(input.blockers),
    nowIso(),
  );
  if (clean(input.blockers)) await notify(await deptManagers(a.dept), { type: "blocker", title: `${user.name} is blocked`, body: clean(input.blockers)!, link: `/dashboard`, dedupeKey: `standup-block:${sprintId}:${user.id}:${day}` }, nowIso(), user.id);
}

export async function addRetro(user: AppUser, d: string, sprintId: string, kind: "well" | "improve" | "action", text: string) {
  const a = await workAccess(user, d, "write");
  if (!(await get("SELECT 1 AS x FROM dept_sprints WHERE id = ? AND dept = ?", sprintId, a.dept))) throw new WorkflowError("NOT_FOUND", "Sprint not found.");
  const t = text.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!t) throw new WorkflowError("VALIDATION", "Write something first.");
  if (!["well", "improve", "action"].includes(kind)) throw new WorkflowError("VALIDATION", "Unknown column.");
  await run("INSERT INTO dept_retro (id, sprint_id, kind, text, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", uid("rtr_"), sprintId, kind, t, user.id, nowIso());
}

export async function deleteRetro(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d, "write");
  const r = await get<{ author_id: string | null }>("SELECT r.author_id FROM dept_retro r JOIN dept_sprints s ON s.id = r.sprint_id WHERE r.id = ? AND s.dept = ?", id, a.dept);
  if (!r) return;
  if (r.author_id !== user.id && !a.rights.editAll) throw new WorkflowError("FORBIDDEN", "You can remove only your own notes.");
  await run("DELETE FROM dept_retro WHERE id = ?", id);
}

// A retrospective action becomes a task for someone (in the next sprint when there is one).
export async function retroToTask(user: AppUser, d: string, id: string, assigneeId: string | null) {
  const a = await workAccess(user, d, "write");
  const r = await get<{ text: string; kind: string; task_id: string | null; sprint_id: string }>("SELECT r.text, r.kind, r.task_id, r.sprint_id FROM dept_retro r JOIN dept_sprints s ON s.id = r.sprint_id WHERE r.id = ? AND s.dept = ?", id, a.dept);
  if (!r) throw new WorkflowError("NOT_FOUND", "Not found.");
  if (r.task_id) throw new WorkflowError("INVALID_STATE", "This action is already a task.");
  const next = await get<{ id: string }>("SELECT id FROM dept_sprints WHERE dept = ? AND status IN ('planned','active') AND id <> ? ORDER BY status = 'active' DESC, start_date LIMIT 1", a.dept, r.sprint_id);
  const taskId = await saveTask(user, a.dept, { title: r.text, description: "An action from the sprint retrospective.", assigneeId, sprintId: next?.id ?? null, labels: ["retro"] });
  await run("UPDATE dept_retro SET task_id = ? WHERE id = ?", taskId, id);
  return taskId;
}

// ---------------------------------------------------------------------------
// Roadmap and project health
// ---------------------------------------------------------------------------

export async function roadmap(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  const cfg = a.config.sprint;
  const projects = await all<{ id: string; key: string; name: string; status: string; start_date: string | null; due_date: string | null; lead: string | null; color: string | null }>(
    "SELECT p.id, p.key, p.name, p.status, p.start_date, p.due_date, u.name AS lead, p.color FROM dept_projects p LEFT JOIN users u ON u.id = p.lead_id WHERE p.dept = ? AND p.archived = 0 ORDER BY COALESCE(p.start_date, p.due_date, p.created_at)",
    a.dept,
  );
  const live = new Set(a.config.projectStatuses.filter((s) => s.category !== "done" && s.category !== "cancelled").map((s) => s.key));
  const now = today();
  const out = [];
  for (const p of projects) {
    const tasks = await all<TaskRow & { project_id: string }>(`${TASKS} WHERE t.project_id = ? AND t.status_category <> 'cancelled'`, p.id);
    const weight = (t: TaskRow) => (cfg.unit === "points" ? num(t.points) : num(t.estimate_hours)) || 1;
    const total = tasks.reduce((n, t) => n + weight(t), 0);
    const doneW = tasks.filter((t) => t.status_category === "done").reduce((n, t) => n + weight(t), 0);
    const progress = total ? Math.round((doneW / total) * 100) : 0;
    const ms = await get<{ name: string; due_date: string | null }>("SELECT name, due_date FROM dept_milestones WHERE project_id = ? AND status <> 'done' ORDER BY due_date IS NULL, due_date LIMIT 1", p.id);
    let health: "on_track" | "at_risk" | "late" | "done" = "on_track";
    if (!live.has(p.status)) health = "done";
    else if (p.due_date && p.due_date < now && progress < 100) health = "late";
    else if (p.start_date && p.due_date && p.due_date > p.start_date) {
      const expected = Math.min(100, Math.max(0, ((Date.parse(now) - Date.parse(p.start_date)) / (Date.parse(p.due_date) - Date.parse(p.start_date))) * 100));
      if (expected - progress > 20) health = "at_risk";
    }
    out.push({
      ...p,
      status: labelOf(a.config.projectStatuses, p.status),
      progress,
      tasks: tasks.length,
      openBugs: tasks.filter((t) => t.type === "bug" && t.status_category !== "done").length,
      team: [...new Set(tasks.map((t) => t.assignee).filter((x): x is string => !!x))],
      nextMilestone: ms ? { name: ms.name, due: ms.due_date } : null,
      health,
    });
  }
  return { projects: out, unit: cfg.unit };
}
export type Roadmap = Awaited<ReturnType<typeof roadmap>>;

// DORA measures from the releases (a release counts as a deployment to production).
export async function doraMeasures(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  const since = new Date(Date.now() - 90 * DAY).toISOString();
  const rel = await all<{ id: string; created_at: string }>("SELECT id, created_at FROM dept_releases WHERE dept = ? AND created_at >= ? ORDER BY created_at", a.dept, since);
  const lead = await all<{ created_at: string; released: string }>(
    "SELECT t.created_at, r.created_at AS released FROM dept_tasks t JOIN dept_releases r ON r.id = t.release_id WHERE r.dept = ? AND r.created_at >= ?",
    a.dept,
    since,
  );
  const hours = lead.map((x) => (Date.parse(x.released) - Date.parse(x.created_at)) / 36e5).filter((h) => h >= 0).sort((x, y) => x - y);
  // Bugs filed within a week after a release, as a sign that the release caused a failure.
  let failed = 0;
  for (const r of rel) if (await get("SELECT 1 AS x FROM dept_tasks WHERE dept = ? AND type = 'bug' AND created_at > ? AND created_at <= ?", a.dept, r.created_at, new Date(Date.parse(r.created_at) + 7 * DAY).toISOString())) failed++;
  return {
    deploysPerWeek: Math.round((rel.length / (90 / 7)) * 10) / 10,
    releases: rel.length,
    leadTimeHours: hours.length ? Math.round(hours[Math.floor(hours.length / 2)]!) : null,
    changeFailureRate: rel.length ? Math.round((failed / rel.length) * 100) : null,
    // From incidents reported to the department (Configure, Tools), median hours to resolve.
    timeToRestoreHours: await import("./dev-tools").then((m) => m.timeToRestoreHours(a.dept)).catch(() => null),
  };
}

// ---------------------------------------------------------------------------
// Specs and documents
// ---------------------------------------------------------------------------

type DocRow = { id: string; dept: string; project_id: string | null; kind: DocKind; title: string; body: string; status: string; version: number; reviewers: string; approvals: string; created_by: string | null; created_at: string; updated_at: string; approved_at: string | null };

export async function listDocs(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  return (
    await all<DocRow & { project: string | null; author: string | null }>(
      "SELECT x.*, p.name AS project, u.name AS author FROM dept_docs x LEFT JOIN dept_projects p ON p.id = x.project_id LEFT JOIN users u ON u.id = x.created_by WHERE x.dept = ? ORDER BY x.updated_at DESC LIMIT 300",
      a.dept,
    )
  ).map((r) => ({ id: r.id, kind: r.kind, title: r.title, status: r.status, version: Number(r.version), project: r.project, projectId: r.project_id, author: r.author, updatedAt: r.updated_at }));
}

export async function getDoc(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d);
  const r = await get<DocRow>("SELECT * FROM dept_docs WHERE id = ? AND dept = ?", id, a.dept);
  if (!r) throw new WorkflowError("NOT_FOUND", "Document not found.");
  const links = await all<{ req: string; task_id: string; code: string; title: string; status: string; status_category: string }>(
    "SELECT l.req, l.task_id, t.code, t.title, t.status, t.status_category FROM dept_doc_links l JOIN dept_tasks t ON t.id = l.task_id WHERE l.doc_id = ? ORDER BY l.req",
    id,
  );
  const reqs = requirementIds(r.body);
  const reviewers = parseJson<string[]>(r.reviewers, []);
  const approvals = parseJson<{ by: string; at: string }[]>(r.approvals, []);
  const names = new Map((await deptPeople(a.dept)).map((p) => [p.id, p.name]));
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    status: r.status,
    version: Number(r.version),
    projectId: r.project_id,
    reviewers: reviewers.map((x) => ({ id: x, name: names.get(x) ?? "Someone", approved: approvals.some((p) => p.by === x) })),
    // Requirements traced to tasks: each requirement with its tasks and their state; uncovered ones stand out.
    trace: reqs.map((req) => {
      const ts = links.filter((l) => l.req === req);
      return { req, tasks: ts.map((l) => ({ id: l.task_id, code: l.code, title: l.title, status: labelOf(a.config.statuses, l.status), done: l.status_category === "done" })), covered: ts.length > 0, done: ts.length > 0 && ts.every((l) => l.status_category === "done") };
    }),
    versions: await all<{ version: number; title: string; status: string; saved_at: string; by: string | null }>(
      "SELECT v.version, v.title, v.status, v.saved_at, u.name AS by FROM dept_doc_versions v LEFT JOIN users u ON u.id = v.saved_by WHERE v.doc_id = ? ORDER BY v.version DESC LIMIT 50",
      id,
    ),
    canEdit: !a.readOnly,
    canApprove: reviewers.includes(user.id) && r.status === "review",
  };
}
export type DocView = Awaited<ReturnType<typeof getDoc>>;

export async function createDoc(user: AppUser, d: string, input: { kind: DocKind; title?: string | null; projectId?: string | null; template?: string | null }) {
  const a = await workAccess(user, d, "write");
  if (!DOC_KINDS.some((k) => k.key === input.kind)) throw new WorkflowError("VALIDATION", "Choose the kind of document.");
  if (input.projectId && !(await get("SELECT 1 AS x FROM dept_projects WHERE id = ? AND dept = ?", input.projectId, a.dept))) throw new WorkflowError("VALIDATION", "Unknown project.");
  const t = DOC_TEMPLATES.find((x) => x.key === input.template) ?? DOC_TEMPLATES.find((x) => x.kind === input.kind)!;
  const id = uid("doc_");
  const now = nowIso();
  const title = input.title?.trim().slice(0, 160) || t.title;
  await run("INSERT INTO dept_docs (id, dept, project_id, kind, title, body, status, version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?)", id, a.dept, input.projectId || null, input.kind, title, t.body, user.id, now, now);
  await audit({ actor: user }, { action: `${a.dept}.doc`, summary: `${user.name} started the document "${title}"` });
  return id;
}

// Saving an approved document starts a new version (the approved one is kept in the history).
export async function saveDoc(user: AppUser, d: string, id: string, input: { title: string; body: string; projectId?: string | null }) {
  const a = await workAccess(user, d, "write");
  const r = await get<DocRow>("SELECT * FROM dept_docs WHERE id = ? AND dept = ?", id, a.dept);
  if (!r) throw new WorkflowError("NOT_FOUND", "Document not found.");
  const title = input.title.trim().slice(0, 160);
  if (!title) throw new WorkflowError("VALIDATION", "Give the document a title.");
  const body = input.body.slice(0, 200_000);
  const now = nowIso();
  if (r.status === "approved" || r.status === "review") {
    await run("INSERT INTO dept_doc_versions (doc_id, version, title, body, status, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING", id, r.version, r.title, r.body, r.status, user.id, now);
    await run("UPDATE dept_docs SET title = ?, body = ?, project_id = COALESCE(?, project_id), version = version + 1, status = 'draft', approvals = '[]', approved_at = NULL, updated_at = ? WHERE id = ?", title, body, input.projectId ?? null, now, id);
  } else await run("UPDATE dept_docs SET title = ?, body = ?, project_id = COALESCE(?, project_id), updated_at = ? WHERE id = ?", title, body, input.projectId ?? null, now, id);
}

export async function submitDoc(user: AppUser, d: string, id: string, reviewerIds: string[]) {
  const a = await workAccess(user, d, "write");
  const r = await get<DocRow>("SELECT * FROM dept_docs WHERE id = ? AND dept = ?", id, a.dept);
  if (!r) throw new WorkflowError("NOT_FOUND", "Document not found.");
  if (r.status !== "draft") throw new WorkflowError("INVALID_STATE", "Only a draft is sent for review.");
  const people = (await deptPeople(a.dept)).map((p) => p.id);
  const reviewers = [...new Set(reviewerIds.filter((x) => people.includes(x) && x !== user.id))].slice(0, 10);
  if (!reviewers.length) throw new WorkflowError("VALIDATION", "Choose at least one reviewer (not yourself).");
  await run("UPDATE dept_docs SET status = 'review', reviewers = ?, approvals = '[]', updated_at = ? WHERE id = ?", JSON.stringify(reviewers), nowIso(), id);
  await notify(reviewers, { type: "approval", title: `Review: ${r.title}`, body: `${user.name} asks you to review version ${r.version}.`, link: `/dashboard`, dedupeKey: `doc-review:${id}:${r.version}` }, nowIso(), user.id);
}

export async function decideDoc(user: AppUser, d: string, id: string, approve: boolean, note?: string | null) {
  const a = await workAccess(user, d, "write");
  const r = await get<DocRow>("SELECT * FROM dept_docs WHERE id = ? AND dept = ?", id, a.dept);
  if (!r || r.status !== "review") throw new WorkflowError("INVALID_STATE", "This document is not waiting for review.");
  const reviewers = parseJson<string[]>(r.reviewers, []);
  if (!reviewers.includes(user.id)) throw new WorkflowError("FORBIDDEN", "Only the named reviewers decide.");
  const now = nowIso();
  if (!approve) {
    if (!note?.trim()) throw new WorkflowError("VALIDATION", "Say what needs to change.");
    await run("UPDATE dept_docs SET status = 'draft', approvals = '[]', updated_at = ? WHERE id = ?", now, id);
    if (r.created_by) await notify([r.created_by], { type: "approval", title: `Changes asked: ${r.title}`, body: note.trim(), link: "/dashboard", dedupeKey: `doc-changes:${id}:${now}` }, now, user.id);
    return "draft";
  }
  const approvals = [...parseJson<{ by: string; at: string }[]>(r.approvals, []).filter((x) => x.by !== user.id), { by: user.id, at: now }];
  const all_ = reviewers.every((x) => approvals.some((p) => p.by === x));
  await run("UPDATE dept_docs SET approvals = ?, status = ?, approved_at = ?, updated_at = ? WHERE id = ?", JSON.stringify(approvals), all_ ? "approved" : "review", all_ ? now : null, now, id);
  if (all_) await audit({ actor: user }, { action: `${a.dept}.doc`, summary: `"${r.title}" version ${r.version} was approved` });
  return all_ ? "approved" : "review";
}

export async function linkRequirement(user: AppUser, d: string, docId: string, req: string, taskId: string, on: boolean) {
  const a = await workAccess(user, d, "write");
  if (!(await get("SELECT 1 AS x FROM dept_docs WHERE id = ? AND dept = ?", docId, a.dept))) throw new WorkflowError("NOT_FOUND", "Document not found.");
  if (!/^[A-Z]{1,5}-\d{1,4}$/.test(req)) throw new WorkflowError("VALIDATION", "Requirement IDs look like FR-1 or NFR-3.");
  const t = await get<{ id: string }>("SELECT id FROM dept_tasks WHERE (id = ? OR upper(code) = upper(?)) AND dept = ?", taskId, taskId, a.dept);
  if (!t) throw new WorkflowError("NOT_FOUND", "No task with that code here.");
  if (on) await run("INSERT INTO dept_doc_links (doc_id, req, task_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", docId, req, t.id);
  else await run("DELETE FROM dept_doc_links WHERE doc_id = ? AND req = ? AND task_id = ?", docId, req, t.id);
}

export async function deleteDoc(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d, "write");
  const r = await get<{ created_by: string | null }>("SELECT created_by FROM dept_docs WHERE id = ? AND dept = ?", id, a.dept);
  if (!r) return;
  if (r.created_by !== user.id && !a.rights.deleteAll) throw new WorkflowError("FORBIDDEN", "Only the author or a head deletes a document.");
  await run("DELETE FROM dept_docs WHERE id = ?", id);
}

// The requirements a task comes from (shown on the task).
export async function requirementsOfTask(taskId: string) {
  return all<{ req: string; doc_id: string; title: string }>("SELECT l.req, l.doc_id, x.title FROM dept_doc_links l JOIN dept_docs x ON x.id = l.doc_id WHERE l.task_id = ?", taskId);
}

