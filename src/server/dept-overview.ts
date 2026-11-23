// A department's team overview and dashboard (Dev first, every work department alike), as the production teams
// have on their Home: what is done, what is open and where, who is on what, each project's progress and health,
// throughput week by week, the work by type, the current sprint, releases, what is due and what was finished.
// Everything can be filtered by project, person, type, priority, sprint and period. Counts cover the whole team;
// lists of tasks show only what the viewer may open (heads and leads all, members their own).

import { all, get, nowIso } from "./db";
import { workAccess } from "./dept-config";
import { deptPeople } from "./departments";
import type { AppUser } from "./users";

const DAY = 864e5;
export const OVERVIEW_PERIODS = [7, 30, 90, 365, 0] as const; // 0: all time

export type OverviewFilter = { project?: string | null; person?: string | null; type?: string | null; priority?: string | null; sprint?: string | null; period?: number | null };

type Row = {
  id: string; code: string; title: string; type: string; status: string; status_category: string; priority: string;
  assignee_id: string | null; assignee: string | null; project_id: string | null; points: number | null; estimate_hours: number | null;
  due_date: string | null; created_at: string; completed_at: string | null; sprint_id: string | null; project_key: string | null;
};

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
// Monday of the week a date falls in (weeks start on Monday, as the sprints do).
const weekOf = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return isoDay(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY);
};

export async function deptOverview(user: AppUser, d: string, f: OverviewFilter = {}) {
  const a = await workAccess(user, d);
  const cfg = a.config;
  const unitPoints = cfg.sprint.unit === "points";
  const weight = (t: Row) => (unitPoints ? Number(t.points) || 0 : Number(t.estimate_hours) || 0);
  const today = nowIso().slice(0, 10);
  // No period, or an unknown one, is the last 30 days; 0 is all time.
  const period = f.period != null && OVERVIEW_PERIODS.includes(Number(f.period) as never) ? Number(f.period) : 30;
  const since = period ? isoDay(Date.now() - (period - 1) * DAY) : "0000-00-00";

  // The sprint filter: a sprint's id, "current" (the active one), or "none" (not in a sprint).
  const current = await get<{ id: string; name: string; goal: string | null; start_date: string | null; end_date: string | null; status: string }>(
    "SELECT id, name, goal, start_date, end_date, status FROM dept_sprints WHERE dept = ? AND status = 'active' ORDER BY start_date DESC LIMIT 1",
    a.dept,
  );
  const where = ["t.dept = ?", "t.status_category <> 'cancelled'"];
  const params: (string | null)[] = [a.dept];
  if (f.project) (where.push(f.project === "none" ? "t.project_id IS NULL" : "t.project_id = ?"), f.project !== "none" && params.push(f.project));
  if (f.person) (where.push(f.person === "none" ? "t.assignee_id IS NULL" : "t.assignee_id = ?"), f.person !== "none" && params.push(f.person));
  if (f.type) (where.push("t.type = ?"), params.push(f.type));
  if (f.priority) (where.push("t.priority = ?"), params.push(f.priority));
  if (f.sprint) {
    const sid = f.sprint === "current" ? (current?.id ?? "-") : f.sprint;
    if (f.sprint === "none") where.push("t.sprint_id IS NULL");
    else (where.push("t.sprint_id = ?"), params.push(sid));
  }
  const found = await all<Row>(
    `SELECT t.id, t.code, t.title, t.type, t.status, t.status_category, t.priority, t.assignee_id, u.name AS assignee, t.project_id, t.points, t.estimate_hours,
            t.due_date, t.created_at, t.completed_at, t.sprint_id, p.key AS project_key
     FROM dept_tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN dept_projects p ON p.id = t.project_id
     WHERE ${where.join(" AND ")}`,
    ...params,
  );
  // Members see the numbers of their own work and of what was shared with them, never the whole team's tasks.
  const seeAll = a.rights.seeAll || a.manage;
  const allowed = seeAll ? null : new Set((await (await import("./work")).listTasks(user, a.dept, {})).tasks.map((t) => t.id));
  const rows = found.filter((t) => !allowed || allowed.has(t.id));
  const visible = (t: Row) => seeAll || !!allowed?.has(t.id);
  const done = rows.filter((t) => t.status_category === "done");
  const open = rows.filter((t) => t.status_category !== "done");
  const doneIn = done.filter((t) => (t.completed_at ?? "").slice(0, 10) >= since);
  const backlogKeys = new Set(cfg.statuses.filter((s) => s.key === "backlog").map((s) => s.key));
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const sum = (xs: Row[]) => Math.round(xs.reduce((n, t) => n + weight(t), 0) * 10) / 10;

  const closed = await all<{ done_units: number | null }>("SELECT done_units FROM dept_sprints WHERE dept = ? AND status = 'closed' AND done_units IS NOT NULL ORDER BY COALESCE(end_date, closed_at) DESC LIMIT 3", a.dept);
  const releasesIn = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_releases WHERE dept = ? AND created_at >= ?", a.dept, `${since}T00:00:00.000Z`))?.n ?? 0);

  const tiles = {
    doneInPeriod: doneIn.length,
    unitsInPeriod: sum(doneIn),
    doneTotal: done.length,
    active: open.filter((t) => t.status_category === "active").length,
    review: open.filter((t) => t.status_category === "review").length,
    todo: open.filter((t) => t.status_category === "open" && !backlogKeys.has(t.status)).length,
    backlog: open.filter((t) => backlogKeys.has(t.status)).length,
    overdue: overdue.length,
    openBugs: open.filter((t) => t.type === "bug").length,
    releases: releasesIn,
    velocity: closed.length ? Math.round(closed.reduce((n, s) => n + Number(s.done_units), 0) / closed.length) : null,
    progress: rows.length ? Math.round((sum(done) / Math.max(1, sum(rows))) * 100) : 0,
  };

  // The flow, stage by stage, in the department's own order.
  const flow = cfg.statuses
    .filter((s) => s.active && s.category !== "cancelled")
    .map((s) => {
      const xs = rows.filter((t) => t.status === s.key);
      return { key: s.key, label: s.label, color: s.color, category: s.category, count: xs.length, units: sum(xs) };
    })
    .filter((s) => s.count > 0 || s.category !== "done");

  // Who is on what.
  const people = await deptPeople(a.dept);
  const ids = new Set<string | null>([...people.map((p) => p.id), ...rows.map((t) => t.assignee_id)]);
  const team = [...ids]
    .map((id) => {
      const mine = rows.filter((t) => t.assignee_id === id);
      const name = id ? (people.find((p) => p.id === id)?.name ?? mine[0]?.assignee ?? "Someone") : "Nobody yet";
      const working = mine.filter((t) => t.status_category === "active");
      return {
        id,
        name,
        todo: mine.filter((t) => t.status_category === "open").length,
        active: working.length,
        review: mine.filter((t) => t.status_category === "review").length,
        doneInPeriod: mine.filter((t) => doneIn.includes(t)).length,
        unitsInPeriod: sum(mine.filter((t) => doneIn.includes(t))),
        overdue: mine.filter((t) => overdue.includes(t)).length,
        now: working.filter(visible).slice(0, 2).map((t) => ({ id: t.id, code: t.code, title: t.title })),
      };
    })
    .filter((p) => p.todo + p.active + p.review + p.doneInPeriod + p.overdue > 0 || (p.id && people.some((x) => x.id === p.id)))
    .sort((x, y) => (x.id === null ? 1 : y.id === null ? -1 : y.active + y.review + y.todo - (x.active + x.review + x.todo) || x.name.localeCompare(y.name)));

  // Projects: progress by points (or hours), health from the dates, the next milestone.
  const projects = await all<{ id: string; key: string; name: string; status: string; color: string | null; start_date: string | null; due_date: string | null; archived: number }>(
    "SELECT id, key, name, status, color, start_date, due_date, archived FROM dept_projects WHERE dept = ? ORDER BY COALESCE(start_date, created_at)",
    a.dept,
  );
  const live = new Set(cfg.projectStatuses.filter((s) => s.category !== "done" && s.category !== "cancelled").map((s) => s.key));
  const projectRows = [];
  for (const p of projects) {
    if (f.project && f.project !== p.id) continue;
    const xs = rows.filter((t) => t.project_id === p.id);
    if (!xs.length && (p.archived || f.person || f.type || f.priority || f.sprint)) continue;
    const total = xs.reduce((n, t) => n + (weight(t) || 1), 0);
    const doneW = xs.filter((t) => t.status_category === "done").reduce((n, t) => n + (weight(t) || 1), 0);
    const progress = total ? Math.round((doneW / total) * 100) : 0;
    let health: "done" | "on_track" | "at_risk" | "late" = "on_track";
    if (!live.has(p.status)) health = "done";
    else if (p.due_date && p.due_date < today && progress < 100) health = "late";
    else if (p.start_date && p.due_date && p.due_date > p.start_date) {
      const expected = Math.min(100, Math.max(0, ((Date.parse(today) - Date.parse(p.start_date)) / (Date.parse(p.due_date) - Date.parse(p.start_date))) * 100));
      if (expected - progress > 20) health = "at_risk";
    }
    const ms = await get<{ name: string; due_date: string | null }>("SELECT name, due_date FROM dept_milestones WHERE project_id = ? AND status <> 'done' ORDER BY due_date IS NULL, due_date LIMIT 1", p.id);
    projectRows.push({
      id: p.id,
      key: p.key,
      name: p.name,
      color: p.color,
      status: cfg.projectStatuses.find((s) => s.key === p.status)?.label ?? p.status,
      progress,
      done: xs.filter((t) => t.status_category === "done").length,
      total: xs.length,
      open: xs.filter((t) => t.status_category !== "done").length,
      bugs: xs.filter((t) => t.type === "bug" && t.status_category !== "done").length,
      overdue: xs.filter((t) => overdue.includes(t)).length,
      due: p.due_date,
      next: ms ? { name: ms.name, due: ms.due_date } : null,
      health,
    });
  }
  projectRows.sort((x, y) => (x.health === "done" ? 1 : 0) - (y.health === "done" ? 1 : 0) || (x.due ?? "9999").localeCompare(y.due ?? "9999"));

  // Throughput: the last twelve weeks, finished and started.
  const weeks: string[] = [];
  for (let i = 11; i >= 0; i--) weeks.push(weekOf(isoDay(Date.now() - i * 7 * DAY)));
  const throughput = weeks.map((w) => {
    const fin = done.filter((t) => t.completed_at && weekOf(t.completed_at) === w);
    return { week: w, finished: fin.length, units: sum(fin), created: rows.filter((t) => weekOf(t.created_at) === w).length };
  });

  const types = cfg.types
    .filter((t) => t.active)
    .map((t) => ({ key: t.key, label: t.label, open: open.filter((x) => x.type === t.key).length, done: done.filter((x) => x.type === t.key).length }))
    .filter((t) => t.open + t.done > 0);

  let sprint = null;
  if (current) {
    const xs = await all<Row>("SELECT points, estimate_hours, status_category FROM dept_tasks WHERE sprint_id = ? AND status_category <> 'cancelled'", current.id);
    const end = current.end_date ?? today;
    sprint = {
      id: current.id,
      name: current.name,
      goal: current.goal,
      start: current.start_date,
      end: current.end_date,
      committed: sum(xs),
      done: sum(xs.filter((t) => t.status_category === "done")),
      tasks: xs.length,
      finished: xs.filter((t) => t.status_category === "done").length,
      daysLeft: Math.max(0, Math.round((Date.parse(end) - Date.parse(today)) / DAY) + 1),
    };
  }
  const releases = await all<{ id: string; name: string; version: string | null; created_at: string; task_count: number }>(
    "SELECT id, name, version, created_at, task_count FROM dept_releases WHERE dept = ? ORDER BY created_at DESC LIMIT 5",
    a.dept,
  );

  const card = (t: Row) => ({ id: t.id, code: t.code, title: t.title, project: t.project_key, assignee: t.assignee, due: t.due_date, done: t.completed_at, priority: t.priority, type: cfg.types.find((x) => x.key === t.type)?.label ?? t.type, status: cfg.statuses.find((x) => x.key === t.status)?.label ?? t.status });
  const dueSoon = open
    .filter((t) => t.due_date && t.due_date <= isoDay(Date.now() + 14 * DAY) && visible(t))
    .sort((x, y) => x.due_date!.localeCompare(y.due_date!))
    .slice(0, 10)
    .map(card);
  const recent = done
    .filter(visible)
    .sort((x, y) => (y.completed_at ?? "").localeCompare(x.completed_at ?? ""))
    .slice(0, 10)
    .map(card);

  const sprints = await all<{ id: string; name: string; status: string }>("SELECT id, name, status FROM dept_sprints WHERE dept = ? ORDER BY COALESCE(start_date, created_at) DESC LIMIT 30", a.dept);
  return {
    unit: unitPoints ? "points" : "hours",
    period,
    since: period ? since : null,
    seeAll,
    filtered: !!(f.project || f.person || f.type || f.priority || f.sprint),
    tiles,
    flow,
    team,
    projects: projectRows,
    throughput,
    types,
    sprint,
    releases: releases.map((r) => ({ ...r, task_count: Number(r.task_count) })),
    dueSoon,
    recent,
    options: {
      projects: projects.filter((p) => !p.archived).map((p) => ({ id: p.id, label: `${p.key} ${p.name}` })),
      people: people.map((p) => ({ id: p.id, label: p.name })),
      types: cfg.types.filter((t) => t.active).map((t) => ({ id: t.key, label: t.label })),
      priorities: cfg.priorities.filter((p) => p.active).map((p) => ({ id: p.key, label: p.label })),
      sprints: sprints.map((s) => ({ id: s.id, label: `${s.name}${s.status === "active" ? " (active)" : s.status === "planned" ? " (planned)" : ""}` })),
    },
  };
}
export type DeptOverview = Awaited<ReturnType<typeof deptOverview>>;
