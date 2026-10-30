// Department dashboards: the numbers behind every widget, and the saved layouts. Numbers respect what the viewer may
// see (people without "see everyone's work" get their own), and the filters (project, person, type, period).

import { all, nowIso, parseJson, placeholders, run } from "./db";
import { WorkflowError } from "./workflow";
import { deptAccess, deptPeople } from "./departments";
import { workAccess } from "./dept-config";
import { can, type AppUser } from "./users";
import { DEFAULT_LAYOUTS, normalizeLayout, periodRange, type DashKind, type LayoutItem, type Period } from "@/lib/dashboards";
import { OPEN_CATEGORIES, fieldShown, type FieldValue, type StatusCategory } from "@/lib/dept-config";
import { RESOURCE_STATUS_LABELS, RESOURCE_TYPE_LABELS, RESOURCE_TYPES, type ResourceType } from "@/lib/studio";
import type { Position } from "@/lib/domain";

// "studio", or a work department (Dev, Marketing, or one created in Admin).
export type DashDept = string;
const kindOf = (d: DashDept): DashKind => (d === "studio" ? "studio" : "work");
const n = (v: unknown) => Number(v ?? 0);
const DAY = 864e5;

// Monday-starting week of a date, as YYYY-MM-DD.
function weekOf(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function lastWeeks(count: number) {
  const now = weekOf(nowIso());
  return Array.from({ length: count }, (_, i) => new Date(Date.parse(now) - (count - 1 - i) * 7 * DAY).toISOString().slice(0, 10));
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

type LayoutAccess = { position: Position | null; canSetDefaults: boolean };

async function layoutAccess(user: AppUser, dept: DashDept): Promise<LayoutAccess> {
  if (dept === "studio") {
    const a = await deptAccess(user, "studio");
    if (!a.view) throw new WorkflowError("FORBIDDEN", "You do not have access to Studio.");
    return { position: a.position, canSetDefaults: can(user, "users.manage") || (a.position === "head" && !a.readOnly) };
  }
  const w = await workAccess(user, dept);
  return { position: w.position, canSetDefaults: w.rights.configure && !w.readOnly };
}

// The person's own layout, else their position's default, else the built-in one. Viewers without a position (owners,
// managers looking in) get the leads' view of team health.
export async function dashboardLayout(user: AppUser, dept: DashDept) {
  const a = await layoutAccess(user, dept);
  const position = a.position ?? "lead";
  const kind = kindOf(dept);
  const rows = await all<{ scope: string; layout: string }>("SELECT scope, layout FROM dept_dashboards WHERE dept = ? AND scope IN (?, ?)", dept, `user:${user.id}`, `position:${position}`);
  const parse = (s: string | undefined) => {
    if (!s) return null;
    try {
      return normalizeLayout(parseJson(s, []), kind);
    } catch {
      return null;
    }
  };
  const own = parse(rows.find((r) => r.scope === `user:${user.id}`)?.layout);
  const def = parse(rows.find((r) => r.scope === `position:${position}`)?.layout) ?? DEFAULT_LAYOUTS[kind][position];
  return { layout: own ?? def, personal: !!own, position, canSetDefaults: a.canSetDefaults };
}

// target: "mine", or a position whose default the head sets.
export async function saveDashboardLayout(user: AppUser, dept: DashDept, target: "mine" | Position, raw: unknown) {
  const a = await layoutAccess(user, dept);
  if (target !== "mine" && !a.canSetDefaults) throw new WorkflowError("FORBIDDEN", "Only people who configure the department set its default dashboards.");
  let layout: LayoutItem[];
  try {
    layout = normalizeLayout(raw, kindOf(dept));
  } catch (err) {
    throw new WorkflowError("VALIDATION", err instanceof Error ? err.message : String(err));
  }
  const scope = target === "mine" ? `user:${user.id}` : `position:${target}`;
  await run(
    "INSERT INTO dept_dashboards (dept, scope, layout, updated_at, updated_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT (dept, scope) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    dept,
    scope,
    JSON.stringify(layout),
    nowIso(),
    user.id,
  );
}

export async function resetDashboardLayout(user: AppUser, dept: DashDept, target: "mine" | Position) {
  const a = await layoutAccess(user, dept);
  if (target !== "mine" && !a.canSetDefaults) throw new WorkflowError("FORBIDDEN", "Only people who configure the department set its default dashboards.");
  await run("DELETE FROM dept_dashboards WHERE dept = ? AND scope = ?", dept, target === "mine" ? `user:${user.id}` : `position:${target}`);
}

// ---------------------------------------------------------------------------
// Dev and Marketing
// ---------------------------------------------------------------------------

export type DashFilter = { project?: string | null; person?: string | null; type?: string | null; period: Period };

type TaskRow = {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  status_category: StatusCategory;
  priority: string;
  assignee_id: string | null;
  assignee_name: string | null;
  project_id: string | null;
  due_date: string | null;
  estimate_hours: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  fields: string;
};

export type DashTask = { id: string; code: string; title: string; status: string; due_date: string | null; assignee_name: string | null; updated_at: string };

export async function workDashboard(user: AppUser, d: string, f: DashFilter) {
  const w = await workAccess(user, d);
  const cfg = w.config;
  const range = periodRange(f.period);
  const today = nowIso().slice(0, 10);
  const where = ["t.dept = ?"];
  const params: string[] = [d];
  if (!w.rights.seeAll) {
    where.push("(t.assignee_id = ? OR t.reporter_id = ?)");
    params.push(user.id, user.id);
  }
  if (f.project === "none") where.push("t.project_id IS NULL");
  else if (f.project) (where.push("t.project_id = ?"), params.push(f.project));
  if (f.person === "none") where.push("t.assignee_id IS NULL");
  else if (f.person) (where.push("t.assignee_id = ?"), params.push(f.person === "me" ? user.id : f.person));
  if (f.type) (where.push("t.type = ?"), params.push(f.type));
  const tasks = await all<TaskRow>(
    `SELECT t.id, t.code, t.title, t.type, t.status, t.status_category, t.priority, t.assignee_id, u.name AS assignee_name, t.project_id, t.due_date, t.estimate_hours,
       t.created_at, t.updated_at, t.completed_at, t.fields
     FROM dept_tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE ${where.join(" AND ")} LIMIT 20000`,
    ...params,
  );
  const open = tasks.filter((t) => OPEN_CATEGORIES.includes(t.status_category));
  const inPeriod = (iso: string | null) => !!iso && iso.slice(0, 10) >= range.from && iso.slice(0, 10) <= range.to;
  const doneInPeriod = tasks.filter((t) => t.status_category === "done" && inPeriod(t.completed_at));
  const week = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const brief = (t: TaskRow): DashTask => ({ id: t.id, code: t.code, title: t.title, status: t.status, due_date: t.due_date, assignee_name: t.assignee_name, updated_at: t.updated_at });
  const byDue = (a: TaskRow, b: TaskRow) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");

  // Charts
  const weeks = lastWeeks(12);
  const throughput = weeks.map((wk) => ({
    week: wk,
    done: tasks.filter((t) => t.status_category === "done" && t.completed_at && weekOf(t.completed_at) === wk).length,
    created: tasks.filter((t) => weekOf(t.created_at) === wk).length,
  }));
  const cycle = weeks.map((wk) => {
    const list = tasks.filter((t) => t.status_category === "done" && t.completed_at && weekOf(t.completed_at) === wk);
    const days = list.length ? list.reduce((s, t) => s + (Date.parse(t.completed_at!) - Date.parse(t.created_at)) / DAY, 0) / list.length : null;
    return { week: wk, days: days == null ? null : Math.round(days * 10) / 10 };
  });
  const byStatus = cfg.statuses
    .filter((s) => s.category !== "cancelled")
    .map((s) => ({ key: s.key, label: s.label, color: s.color, count: s.category === "done" ? doneInPeriod.filter((t) => t.status === s.key).length : open.filter((t) => t.status === s.key).length }));
  const count = (items: { key: string; label: string; color: string }[], prop: "type" | "priority") => items.map((i) => ({ key: i.key, label: i.label, color: i.color, count: open.filter((t) => t[prop] === i.key).length })).filter((x) => x.count > 0);
  const peopleIds = [...new Set(tasks.map((t) => t.assignee_id).filter((x): x is string => !!x))];
  const people = peopleIds
    .map((id) => {
      const mine = open.filter((t) => t.assignee_id === id);
      return {
        id,
        name: tasks.find((t) => t.assignee_id === id)!.assignee_name ?? "Someone",
        open: mine.length,
        overdue: mine.filter((t) => t.due_date && t.due_date < today).length,
        hours: Math.round(mine.reduce((s, t) => s + n(t.estimate_hours), 0) * 10) / 10,
        done: doneInPeriod.filter((t) => t.assignee_id === id).length,
      };
    })
    .sort((a, b) => b.open - a.open)
    .slice(0, 15);

  // Projects, milestones, KPIs and budgets (projects the viewer can see).
  const projWhere = ["p.dept = ?", "p.archived = 0"];
  const projParams: string[] = [d];
  if (f.project && f.project !== "none") (projWhere.push("p.id = ?"), projParams.push(f.project));
  if (!w.rights.seeAll)
    (projWhere.push("(p.lead_id = ? OR EXISTS (SELECT 1 FROM dept_tasks t WHERE t.project_id = p.id AND (t.assignee_id = ? OR t.reporter_id = ?)))"), projParams.push(user.id, user.id, user.id));
  const live = cfg.projectStatuses.filter((s) => s.category !== "done" && s.category !== "cancelled").map((s) => s.key);
  const projects = (
    await all<{ id: string; key: string; name: string; status: string; due_date: string | null; budget: number | null; meta: string }>(
      `SELECT p.id, p.key, p.name, p.status, p.due_date, p.budget, p.meta FROM dept_projects p WHERE ${projWhere.join(" AND ")} ORDER BY p.due_date`,
      ...projParams,
    )
  ).filter((p) => live.includes(p.status));
  const pids = projects.map((p) => p.id);
  const allProjectTasks = pids.length
    ? await all<{ project_id: string; status_category: string; due_date: string | null }>(`SELECT project_id, status_category, due_date FROM dept_tasks WHERE project_id IN (${placeholders(pids.length)})`, ...pids)
    : [];
  const risk = projects
    .map((p) => {
      const list = allProjectTasks.filter((t) => t.project_id === p.id && t.status_category !== "cancelled");
      const done = list.filter((t) => t.status_category === "done").length;
      const late = list.filter((t) => OPEN_CATEGORIES.includes(t.status_category as StatusCategory) && t.due_date && t.due_date < today).length;
      const pastDue = !!p.due_date && p.due_date < today;
      return { id: p.id, key: p.key, name: p.name, due_date: p.due_date, progress: list.length ? Math.round((done / list.length) * 100) : 0, late, pastDue };
    })
    .filter((p) => p.late > 0 || (p.pastDue && p.progress < 100))
    .sort((a, b) => b.late - a.late);
  const milestones = pids.length
    ? await all<{ id: string; name: string; due_date: string; project_key: string }>(
        `SELECT m.id, m.name, m.due_date, p.key AS project_key FROM dept_milestones m JOIN dept_projects p ON p.id = m.project_id
         WHERE m.project_id IN (${placeholders(pids.length)}) AND m.status <> 'done' AND m.due_date IS NOT NULL AND m.due_date <= ? ORDER BY m.due_date LIMIT 12`,
        ...pids,
        new Date(Date.now() + 45 * DAY).toISOString().slice(0, 10),
      )
    : [];
  const kpiRows = pids.length
    ? await all<{ metric: string; total: number }>(
        `SELECT metric, SUM(value) AS total FROM dept_metrics WHERE project_id IN (${placeholders(pids.length)}) AND recorded_on >= ? AND recorded_on <= ? GROUP BY metric`,
        ...pids,
        range.from,
        range.to,
      )
    : [];
  const kpis = cfg.features.kpis
    ? cfg.kpis
        .filter((k) => k.active)
        .map((k) => ({
          key: k.key,
          label: k.label,
          unit: k.unit,
          higherIsBetter: k.higherIsBetter,
          actual: n(kpiRows.find((r) => r.metric === k.key)?.total),
          target: projects.reduce((s, p) => s + n(parseJson<{ kpiTargets?: Record<string, number> }>(p.meta, {}).kpiTargets?.[k.key]), 0),
        }))
    : [];
  // Spend recorded against each project: a KPI named or keyed "spend" or "cost", over the project's life.
  const spendKey = cfg.kpis.find((k) => /^(spend|cost|costs|expenses?)$/i.test(k.key) || /^(spend|cost|costs|expenses?)$/i.test(k.label))?.key;
  const spend = spendKey && pids.length
    ? await all<{ project_id: string; total: number }>(`SELECT project_id, SUM(value) AS total FROM dept_metrics WHERE metric = ? AND project_id IN (${placeholders(pids.length)}) GROUP BY project_id`, spendKey, ...pids)
    : [];
  const budget = cfg.features.budget
    ? projects.filter((p) => p.budget != null || spend.some((s) => s.project_id === p.id)).map((p) => ({ key: p.key, name: p.name, budget: n(p.budget), spend: n(spend.find((s) => s.project_id === p.id)?.total) }))
    : [];
  // Money fields (custom fields of the Money kind): total on work done in the period, and on open work.
  const money = cfg.fields
    .filter((x) => x.active && x.type === "money")
    .map((fd) => {
      const sum = (list: TaskRow[]) => list.reduce((s, t) => s + (fieldShown(fd, t.type) ? n(parseJson<Record<string, FieldValue>>(t.fields, {})[fd.key]) : 0), 0);
      return { key: fd.key, label: fd.label, done: sum(doneInPeriod), open: sum(open) };
    });

  // Next two weeks, by due date.
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + i * DAY).toISOString().slice(0, 10));
  const calendar = days.map((day) => ({ day, tasks: open.filter((t) => t.due_date === day).slice(0, 4).map(brief), count: open.filter((t) => t.due_date === day).length }));

  const activity = w.rights.seeAll
    ? await all<{ summary: string; occurred_at: string }>("SELECT summary, occurred_at FROM audit_events WHERE action LIKE ? ORDER BY occurred_at DESC LIMIT 15", `${d}.%`)
    : [];

  return {
    period: range,
    names: cfg.names,
    statuses: cfg.statuses.map((s) => ({ key: s.key, label: s.label, color: s.color })),
    canSeeAll: w.rights.seeAll,
    cards: {
      open: open.length,
      active: open.filter((t) => t.status_category === "active").length,
      review: open.filter((t) => t.status_category === "review").length,
      overdue: overdue.length,
      dueWeek: open.filter((t) => t.due_date && t.due_date >= today && t.due_date <= week).length,
      done: doneInPeriod.length,
      unassigned: open.filter((t) => !t.assignee_id).length,
      mine: open.filter((t) => t.assignee_id === user.id).length,
    },
    throughput,
    cycle,
    byStatus,
    byType: count(cfg.types, "type"),
    byPriority: count(cfg.priorities, "priority"),
    people,
    kpis,
    budget,
    money,
    lists: {
      mine: open.filter((t) => t.assignee_id === user.id).sort(byDue).slice(0, 10).map(brief),
      overdue: overdue.sort(byDue).slice(0, 10).map(brief),
      review: open.filter((t) => t.status_category === "review").sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, 10).map(brief),
      recent: [...tasks].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 10).map(brief),
    },
    milestones,
    risk,
    calendar,
    activity,
  };
}
export type WorkDashboardData = Awaited<ReturnType<typeof workDashboard>>;

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------

export type StudioFilter = { type?: string | null; person?: string | null; grade?: string | null; period: Period };

export async function studioDashboard(user: AppUser, f: StudioFilter) {
  const a = await deptAccess(user, "studio");
  if (!a.view) throw new WorkflowError("FORBIDDEN", "You do not have access to Studio.");
  const all_ = a.manage || a.readOnly;
  const range = periodRange(f.period);
  const where = ["r.status <> 'archived'"];
  const params: string[] = [];
  if (!all_) (where.push("(r.author_id = ? OR r.status = 'published')"), params.push(user.id));
  if (f.type && (RESOURCE_TYPES as readonly string[]).includes(f.type)) (where.push("r.type = ?"), params.push(f.type));
  if (f.person) (where.push("r.author_id = ?"), params.push(f.person === "me" ? user.id : f.person));
  if (f.grade) (where.push("r.grade_id = ?"), params.push(f.grade));
  const rows = await all<{ id: string; type: ResourceType; title: string; status: string; author_id: string | null; author_name: string | null; grade: string | null; updated_at: string; published_at: string | null }>(
    `SELECT r.id, r.type, r.title, r.status, r.author_id, u.name AS author_name, g.name AS grade, r.updated_at, r.published_at
     FROM studio_resources r LEFT JOIN users u ON u.id = r.author_id LEFT JOIN grades g ON g.id = r.grade_id WHERE ${where.join(" AND ")} LIMIT 20000`,
    ...params,
  );
  const inPeriod = (iso: string | null) => !!iso && iso.slice(0, 10) >= range.from && iso.slice(0, 10) <= range.to;
  const brief = (r: (typeof rows)[number]) => ({ id: r.id, type: r.type, title: r.title, status: r.status, author_name: r.author_name, updated_at: r.updated_at });
  const qWhere = all_ ? "1=1" : "(q.author_id = ? OR q.status = 'approved')";
  const questions = await all<{ difficulty: string; status: string; c: number }>(`SELECT q.difficulty, q.status, COUNT(*) AS c FROM studio_questions q WHERE ${qWhere} GROUP BY q.difficulty, q.status`, ...(all_ ? [] : [user.id]));
  const weeks = lastWeeks(12);
  const grades = [...new Set(rows.filter((r) => r.status === "published" && r.grade).map((r) => r.grade!))].sort();
  const activity = all_ ? await all<{ summary: string; occurred_at: string }>("SELECT summary, occurred_at FROM audit_events WHERE action LIKE 'studio.%' ORDER BY occurred_at DESC LIMIT 15") : [];
  return {
    period: range,
    canSeeAll: all_,
    cards: {
      drafts: rows.filter((r) => r.status === "draft").length,
      review: rows.filter((r) => r.status === "review").length,
      approved: rows.filter((r) => r.status === "approved").length,
      published: rows.filter((r) => r.status === "published" && inPeriod(r.published_at)).length,
      questions: questions.filter((q) => q.status === "approved").reduce((s, q) => s + n(q.c), 0),
      mine: rows.filter((r) => r.author_id === user.id && r.status !== "published").length,
    },
    published: weeks.map((wk) => ({ week: wk, ...Object.fromEntries(RESOURCE_TYPES.map((t) => [t, rows.filter((r) => r.type === t && r.published_at && weekOf(r.published_at) === wk).length])) })),
    byStatus: RESOURCE_TYPES.map((t) => ({ type: RESOURCE_TYPE_LABELS[t].many, ...Object.fromEntries(["draft", "review", "approved", "published"].map((s) => [s, rows.filter((r) => r.type === t && r.status === s).length])) })),
    statusLabels: RESOURCE_STATUS_LABELS,
    coverage: grades.map((g) => ({ grade: g, ...Object.fromEntries(RESOURCE_TYPES.map((t) => [t, rows.filter((r) => r.grade === g && r.type === t && r.status === "published").length])) })),
    difficulty: ["easy", "medium", "hard"].map((d) => ({ difficulty: d[0]!.toUpperCase() + d.slice(1), approved: n(questions.find((q) => q.difficulty === d && q.status === "approved")?.c), other: questions.filter((q) => q.difficulty === d && q.status !== "approved").reduce((s, q) => s + n(q.c), 0) })),
    lists: {
      review: rows.filter((r) => r.status === "review").sort((x, y) => x.updated_at.localeCompare(y.updated_at)).slice(0, 10).map(brief),
      mine: rows.filter((r) => r.author_id === user.id && r.status !== "published").sort((x, y) => y.updated_at.localeCompare(x.updated_at)).slice(0, 10).map(brief),
      recent: [...rows].sort((x, y) => y.updated_at.localeCompare(x.updated_at)).slice(0, 10).map(brief),
    },
    activity,
  };
}
export type StudioDashboardData = Awaited<ReturnType<typeof studioDashboard>>;

// People to filter by (only for viewers who see everyone's work).
export async function dashboardPeople(dept: DashDept) {
  return (await deptPeople(dept)).map((p) => ({ id: p.id, name: p.name }));
}

export async function gradeOptions() {
  return all<{ id: string; name: string }>("SELECT id, name FROM grades ORDER BY sort, name");
}
