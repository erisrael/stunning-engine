// Around the department tasks: details (history, files, watchers, time), the timer, sprints, capacity and the Team
// workload, requests from other departments, and the department report.

import { all, get, nowIso, parseJson, placeholders, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { customDepartments, deptManagers, deptPeople } from "./departments";
import { getDeptConfig, need, workAccess, workDept as dept, type WorkAccess } from "./dept-config";
import { getTask, saveTask, type Task } from "./work";
import type { AppUser } from "./users";
import { OPEN_CATEGORIES, labelOf, type FieldValue } from "@/lib/dept-config";
import { periodRange, type Period } from "@/lib/dashboards";
import { WORK_DEPTS, deptPath } from "@/lib/work";

const DAY = 864e5;
const n = (v: unknown) => Number(v ?? 0);
const OPEN_SQL = OPEN_CATEGORIES.map((c) => `'${c}'`).join(",");
export const MAX_TASK_FILE = 8 * 1024 * 1024;

async function canSee(a: WorkAccess, user: AppUser, taskId: string, write = false) {
  const t = await get<{ code: string; assignee_id: string | null; reporter_id: string | null; reviewer_id: string | null }>("SELECT code, assignee_id, reporter_id, reviewer_id FROM dept_tasks WHERE id = ? AND dept = ?", taskId, a.dept);
  if (!t) throw new WorkflowError("NOT_FOUND", "Task not found.");
  const own = [t.assignee_id, t.reporter_id, t.reviewer_id].includes(user.id);
  if (!(write ? a.rights.editAll : a.rights.seeAll) && !own) throw new WorkflowError("FORBIDDEN", "Not your task.");
  return t;
}

// ---------------------------------------------------------------------------
// Task details
// ---------------------------------------------------------------------------

export async function taskDetails(user: AppUser, d: string, id: string) {
  const dp = await dept(d);
  const a = await workAccess(user, dp);
  await canSee(a, user, id);
  const [subtasks, blockers, blocking, files, watchers, history, time] = await Promise.all([
    all<{ id: string; code: string; title: string; status: string; status_category: string; assignee_name: string | null }>(
      "SELECT t.id, t.code, t.title, t.status, t.status_category, u.name AS assignee_name FROM dept_tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.parent_id = ? ORDER BY t.created_at",
      id,
    ),
    all<{ id: string; code: string; title: string; status_category: string }>("SELECT b.id, b.code, b.title, b.status_category FROM dept_task_links l JOIN dept_tasks b ON b.id = l.blocked_by WHERE l.task_id = ?", id),
    all<{ id: string; code: string; title: string; status_category: string }>("SELECT t.id, t.code, t.title, t.status_category FROM dept_task_links l JOIN dept_tasks t ON t.id = l.task_id WHERE l.blocked_by = ?", id),
    all<{ id: string; name: string; mime: string; size: number; uploaded_by_name: string | null; created_at: string }>(
      "SELECT f.id, f.name, f.mime, f.size, u.name AS uploaded_by_name, f.created_at FROM dept_task_files f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.task_id = ? ORDER BY f.created_at",
      id,
    ),
    all<{ user_id: string; name: string }>("SELECT w.user_id, u.name FROM dept_task_watchers w JOIN users u ON u.id = w.user_id WHERE w.task_id = ? ORDER BY u.name", id),
    all<{ summary: string; occurred_at: string }>("SELECT summary, occurred_at FROM audit_events WHERE item_id = ? AND action LIKE ? ORDER BY occurred_at DESC LIMIT 50", id, `${dp}.%`),
    all<{ id: string; user_id: string; user_name: string; started_at: string; ended_at: string | null; minutes: number; note: string | null }>(
      "SELECT e.id, e.user_id, u.name AS user_name, e.started_at, e.ended_at, e.minutes, e.note FROM dept_time_entries e JOIN users u ON u.id = e.user_id WHERE e.task_id = ? ORDER BY e.started_at DESC",
      id,
    ),
  ]);
  return {
    subtasks,
    blockers,
    blocking,
    files: files.map((f) => ({ ...f, size: n(f.size) })),
    watchers,
    watching: watchers.some((w) => w.user_id === user.id),
    history,
    time: time.map((t) => ({ ...t, minutes: n(t.minutes) })),
    running: time.find((t) => t.user_id === user.id && !t.ended_at)?.id ?? null,
  };
}
export type TaskDetails = Awaited<ReturnType<typeof taskDetails>>;

export async function setWatching(user: AppUser, d: string, id: string, on: boolean) {
  const a = await workAccess(user, await dept(d));
  await canSee(a, user, id);
  if (on) await run("INSERT INTO dept_task_watchers (task_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", id, user.id);
  else await run("DELETE FROM dept_task_watchers WHERE task_id = ? AND user_id = ?", id, user.id);
}

// Files are kept in the database (up to 8 MB each), like small chat files.
export async function addTaskFile(user: AppUser, d: string, id: string, file: { name: string; mime: string; base64: string }) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  if (!a.config.features.attachments) throw new WorkflowError("INVALID_STATE", "Attachments are switched off in this department.");
  const t = await canSee(a, user, id, true);
  const size = Math.floor((file.base64.length * 3) / 4);
  if (size > MAX_TASK_FILE) throw new WorkflowError("VALIDATION", "Files are limited to 8 MB.");
  const name = file.name.replace(/[\\/]/g, "_").slice(0, 160) || "file";
  const fid = uid("tfl_");
  await run("INSERT INTO dept_task_files (id, task_id, name, mime, size, data, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", fid, id, name, file.mime.slice(0, 100) || "application/octet-stream", size, file.base64, user.id, nowIso());
  await run("UPDATE dept_tasks SET updated_at = ? WHERE id = ?", nowIso(), id);
  await audit({ actor: user }, { itemId: id, action: `${dp}.task`, summary: `${user.name} attached ${name} to ${t.code}` });
  return fid;
}

export async function deleteTaskFile(user: AppUser, d: string, fileId: string) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  const f = await get<{ task_id: string; uploaded_by: string | null; name: string }>("SELECT f.task_id, f.uploaded_by, f.name FROM dept_task_files f JOIN dept_tasks t ON t.id = f.task_id WHERE f.id = ? AND t.dept = ?", fileId, dp);
  if (!f) return;
  if (f.uploaded_by !== user.id && !a.rights.editAll) throw new WorkflowError("FORBIDDEN", "You can remove only files you added.");
  await run("DELETE FROM dept_task_files WHERE id = ?", fileId);
  await audit({ actor: user }, { itemId: f.task_id, action: `${dp}.task`, summary: `${user.name} removed the file ${f.name}` });
}

// For the download route: the file, if this person may see its task.
export async function readTaskFile(user: AppUser, fileId: string) {
  const f = await get<{ task_id: string; dept: string; name: string; mime: string; data: string }>(
    "SELECT f.task_id, t.dept, f.name, f.mime, f.data FROM dept_task_files f JOIN dept_tasks t ON t.id = f.task_id WHERE f.id = ?",
    fileId,
  );
  if (!f) return null;
  const a = await workAccess(user, f.dept);
  const t = await get<{ assignee_id: string | null; reporter_id: string | null; reviewer_id: string | null; requested_by: string | null }>("SELECT assignee_id, reporter_id, reviewer_id, requested_by FROM dept_tasks WHERE id = ?", f.task_id);
  if (!a.rights.seeAll && ![t?.assignee_id, t?.reporter_id, t?.reviewer_id].includes(user.id)) return null;
  return { name: f.name, mime: f.mime, data: Buffer.from(f.data, "base64") };
}

// ---------------------------------------------------------------------------
// Time tracking
// ---------------------------------------------------------------------------

// Spent hours follow the time entries once a task has any.
async function syncSpent(taskId: string) {
  const r = await get<{ m: number; c: number }>("SELECT SUM(minutes) AS m, COUNT(*) AS c FROM dept_time_entries WHERE task_id = ? AND ended_at IS NOT NULL", taskId);
  if (n(r?.c)) await run("UPDATE dept_tasks SET spent_hours = ? WHERE id = ?", Math.round((n(r?.m) / 60) * 100) / 100, taskId);
}

async function stopRunning(userId: string) {
  const running = await all<{ id: string; task_id: string; started_at: string }>("SELECT id, task_id, started_at FROM dept_time_entries WHERE user_id = ? AND ended_at IS NULL", userId);
  const now = nowIso();
  for (const r of running) {
    const minutes = Math.max(1, Math.round((Date.parse(now) - Date.parse(r.started_at)) / 60000));
    await run("UPDATE dept_time_entries SET ended_at = ?, minutes = ? WHERE id = ?", now, minutes, r.id);
    await syncSpent(r.task_id);
  }
  return running.length;
}

// One timer per person: starting a timer stops any other.
export async function startTimer(user: AppUser, d: string, taskId: string) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  if (!a.config.features.timeTracking) throw new WorkflowError("INVALID_STATE", "Time tracking is switched off in this department.");
  await canSee(a, user, taskId, true);
  await stopRunning(user.id);
  const now = nowIso();
  await run("INSERT INTO dept_time_entries (id, task_id, dept, user_id, started_at, minutes, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)", uid("tme_"), taskId, dp, user.id, now, now);
}

export async function stopTimer(user: AppUser) {
  return stopRunning(user.id);
}

export async function runningTimer(user: AppUser) {
  return (
    (await get<{ id: string; task_id: string; started_at: string; code: string; title: string; dept: string }>(
      "SELECT e.id, e.task_id, e.started_at, t.code, t.title, t.dept FROM dept_time_entries e JOIN dept_tasks t ON t.id = e.task_id WHERE e.user_id = ? AND e.ended_at IS NULL ORDER BY e.started_at DESC LIMIT 1",
      user.id,
    )) ?? null
  );
}

export async function addTimeEntry(user: AppUser, d: string, taskId: string, input: { date: string; hours: number; note?: string | null }) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  await canSee(a, user, taskId, true);
  const minutes = Math.round(Number(input.hours) * 60);
  if (!(minutes > 0 && minutes <= 24 * 60)) throw new WorkflowError("VALIDATION", "Enter between a few minutes and 24 hours.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new WorkflowError("VALIDATION", "Choose the day.");
  const start = `${input.date}T09:00:00.000Z`;
  await run(
    "INSERT INTO dept_time_entries (id, task_id, dept, user_id, started_at, ended_at, minutes, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    uid("tme_"),
    taskId,
    dp,
    user.id,
    start,
    new Date(Date.parse(start) + minutes * 60000).toISOString(),
    minutes,
    input.note?.trim().slice(0, 200) || null,
    nowIso(),
  );
  await syncSpent(taskId);
}

export async function deleteTimeEntry(user: AppUser, d: string, entryId: string) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  const e = await get<{ user_id: string; task_id: string }>("SELECT user_id, task_id FROM dept_time_entries WHERE id = ? AND dept = ?", entryId, dp);
  if (!e) return;
  if (e.user_id !== user.id && !a.rights.editAll) throw new WorkflowError("FORBIDDEN", "You can remove only your own time.");
  await run("DELETE FROM dept_time_entries WHERE id = ?", entryId);
  await syncSpent(e.task_id);
}

// ---------------------------------------------------------------------------
// Sprints
// ---------------------------------------------------------------------------

export type Sprint = { id: string; name: string; goal: string | null; start_date: string | null; end_date: string | null; status: "planned" | "active" | "closed"; total: number; done: number };

export async function listSprints(user: AppUser, d: string): Promise<Sprint[]> {
  const dp = await dept(d);
  await workAccess(user, dp);
  return (
    await all<Sprint>(
      `SELECT s.*, (SELECT COUNT(*) FROM dept_tasks t WHERE t.sprint_id = s.id AND t.status_category <> 'cancelled') AS total,
         (SELECT COUNT(*) FROM dept_tasks t WHERE t.sprint_id = s.id AND t.status_category = 'done') AS done
       FROM dept_sprints s WHERE s.dept = ? ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, s.start_date DESC`,
      dp,
    )
  ).map((s) => ({ ...s, total: n(s.total), done: n(s.done) }));
}

export async function saveSprint(user: AppUser, d: string, input: { id?: string; name: string; goal?: string | null; startDate?: string | null; endDate?: string | null; status: "planned" | "active" | "closed" }) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  need(a, "projects", "Only people who manage projects plan sprints.");
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) throw new WorkflowError("VALIDATION", "Name the sprint.");
  const status = (["planned", "active", "closed"] as const).includes(input.status) ? input.status : "planned";
  const date = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  // One active sprint at a time: starting one closes the previous.
  if (status === "active") await run("UPDATE dept_sprints SET status = 'closed' WHERE dept = ? AND status = 'active' AND id <> ?", dp, input.id ?? "");
  if (input.id) await run("UPDATE dept_sprints SET name = ?, goal = ?, start_date = ?, end_date = ?, status = ? WHERE id = ? AND dept = ?", name, input.goal?.trim() || null, date(input.startDate), date(input.endDate), status, input.id, dp);
  else await run("INSERT INTO dept_sprints (id, dept, name, goal, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("spr_"), dp, name, input.goal?.trim() || null, date(input.startDate), date(input.endDate), status, nowIso());
  await audit({ actor: user }, { action: `${dp}.sprint`, summary: `${user.name} saved sprint ${name} (${status})` });
}

export async function deleteSprint(user: AppUser, d: string, id: string) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  need(a, "projects", "Only people who manage projects plan sprints.");
  await run("UPDATE dept_tasks SET sprint_id = NULL WHERE sprint_id = ?", id);
  await run("DELETE FROM dept_sprints WHERE id = ? AND dept = ?", id, dp);
}

// ---------------------------------------------------------------------------
// Team and workload
// ---------------------------------------------------------------------------

export const DEFAULT_CAPACITY = 40;

export async function setCapacity(user: AppUser, d: string, userId: string, hours: number) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  need(a, "assign", "Only heads and leads set capacity.");
  if (!(hours >= 0 && hours <= 80)) throw new WorkflowError("VALIDATION", "Weekly hours are between 0 and 80.");
  await run("INSERT INTO dept_capacity (dept, user_id, hours_per_week) VALUES (?, ?, ?) ON CONFLICT (dept, user_id) DO UPDATE SET hours_per_week = excluded.hours_per_week", dp, userId, hours);
}

// Per person: open work and its estimate against weekly capacity, what is due this week, overdue work, time logged
// this week, and what was finished in the period.
export async function teamWorkload(user: AppUser, d: string, period: Period) {
  const dp = await dept(d);
  const a = await workAccess(user, dp);
  if (!a.rights.seeAll) throw new WorkflowError("FORBIDDEN", "The team view is for people who see everyone's work.");
  const range = periodRange(period);
  const today = nowIso().slice(0, 10);
  const weekEnd = new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10);
  const monday = (() => {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  })();
  const [people, caps, tasks, time] = await Promise.all([
    deptPeople(dp),
    all<{ user_id: string; hours_per_week: number }>("SELECT user_id, hours_per_week FROM dept_capacity WHERE dept = ?", dp),
    all<{ id: string; code: string; title: string; status: string; status_category: string; assignee_id: string | null; due_date: string | null; estimate_hours: number | null; completed_at: string | null; priority: string }>(
      "SELECT id, code, title, status, status_category, assignee_id, due_date, estimate_hours, completed_at, priority FROM dept_tasks WHERE dept = ? AND status_category <> 'cancelled'",
      dp,
    ),
    all<{ user_id: string; minutes: number }>("SELECT user_id, SUM(minutes) AS minutes FROM dept_time_entries WHERE dept = ? AND started_at >= ? AND ended_at IS NOT NULL GROUP BY user_id", dp, `${monday}T00:00:00.000Z`),
  ]);
  const open = tasks.filter((t) => OPEN_CATEGORIES.includes(t.status_category as never));
  const row = (id: string | null, name: string, position: string | null) => {
    const mine = open.filter((t) => t.assignee_id === id);
    const capacity = id ? n(caps.find((c) => c.user_id === id)?.hours_per_week ?? DEFAULT_CAPACITY) : 0;
    return {
      id,
      name,
      position,
      capacity,
      open: mine.length,
      hours: Math.round(mine.reduce((s, t) => s + n(t.estimate_hours), 0) * 10) / 10,
      dueWeekHours: Math.round(mine.filter((t) => t.due_date && t.due_date <= weekEnd).reduce((s, t) => s + n(t.estimate_hours), 0) * 10) / 10,
      overdue: mine.filter((t) => t.due_date && t.due_date < today).length,
      logged: Math.round((n(time.find((x) => x.user_id === id)?.minutes) / 60) * 10) / 10,
      done: tasks.filter((t) => t.assignee_id === id && t.status_category === "done" && t.completed_at && t.completed_at.slice(0, 10) >= range.from && t.completed_at.slice(0, 10) <= range.to).length,
      tasks: mine
        .sort((x, y) => (x.due_date ?? "9999").localeCompare(y.due_date ?? "9999"))
        .map((t) => ({ id: t.id, code: t.code, title: t.title, status: t.status, due_date: t.due_date, estimate_hours: t.estimate_hours == null ? null : n(t.estimate_hours), priority: t.priority })),
    };
  };
  return {
    period: range,
    people: [...people.map((p) => row(p.id, p.name, p.position)), row(null, "Unassigned", null)].filter((r) => r.id || r.open),
  };
}
export type TeamWorkload = Awaited<ReturnType<typeof teamWorkload>>;

// ---------------------------------------------------------------------------
// Requests from other departments
// ---------------------------------------------------------------------------

// Departments that take requests, with the types people may ask for.
export async function requestTargets(user: AppUser) {
  const keys = [...WORK_DEPTS, ...(await customDepartments()).map((c) => c.key)];
  const out = [];
  for (const k of keys) {
    const cfg = await getDeptConfig(k);
    if (!cfg.features.requests) continue;
    const types = cfg.types.filter((t) => t.active && (!cfg.intake.types.length || cfg.intake.types.includes(t.key)));
    if (types.length) out.push({ dept: k, title: cfg.title, task: cfg.names.task, intro: cfg.intake.intro, types: types.map((t) => ({ key: t.key, label: t.label })) });
  }
  void user;
  return out;
}

// Anyone can ask a department that takes requests; the request waits for a head or lead to accept or decline it.
export async function createRequest(user: AppUser, d: string, input: { title: string; description?: string | null; type: string; dueDate?: string | null }) {
  const dp = await dept(d);
  const cfg = await getDeptConfig(dp);
  if (!cfg.features.requests) throw new WorkflowError("INVALID_STATE", `${cfg.title} does not take requests.`);
  const allowed = cfg.types.filter((t) => t.active && (!cfg.intake.types.length || cfg.intake.types.includes(t.key)));
  if (!allowed.some((t) => t.key === input.type)) throw new WorkflowError("VALIDATION", "Choose what you are asking for.");
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!title) throw new WorkflowError("VALIDATION", "Say what you need.");
  const firstOpen = cfg.statuses.find((s) => s.active && s.category === "open") ?? cfg.statuses.find((s) => s.active)!;
  const now = nowIso();
  const prefix = cfg.codePrefix;
  const num = await get<{ n: number | null }>(`SELECT MAX(CAST(substr(code, ${prefix.length + 2}) AS INTEGER)) AS n FROM dept_tasks WHERE dept = ? AND code LIKE ?`, dp, `${prefix}-%`);
  const code = `${prefix}-${n(num?.n) + 1}`;
  const id = uid("tsk_");
  const checklist = cfg.features.checklists ? (cfg.types.find((t) => t.key === input.type)?.checklist ?? []).map((l) => ({ id: uid("chk_"), text: l.text, verify: l.verify, done: false, doneBy: null, verifiedBy: null })) : [];
  await run(
    `INSERT INTO dept_tasks (id, dept, code, title, description, type, status, status_category, priority, reporter_id, requested_by, request_state, due_date, labels, fields, checklist, sort, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, '["request"]', '{}', ?, 0, ?, ?)`,
    id,
    dp,
    code,
    title,
    input.description?.trim().slice(0, 4000) || null,
    input.type,
    firstOpen.key,
    firstOpen.category,
    cfg.priorities.find((p) => p.key === "normal")?.key ?? cfg.priorities[0]!.key,
    user.id,
    user.id,
    input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null,
    JSON.stringify(checklist),
    now,
    now,
  );
  await notify(await deptManagers(dp), { type: "assignment", title: `New request ${code} from ${user.name}`, body: title, link: `${deptPath(dp)}?tab=list&request=pending`, dedupeKey: `request:${id}` }, now, user.id);
  await audit({ actor: user }, { itemId: id, action: `${dp}.request`, summary: `${user.name} asked ${cfg.title}: ${code} ${title}` });
  return { id, code };
}

export async function myRequests(user: AppUser) {
  const rows = await all<{ id: string; dept: string; code: string; title: string; status: string; status_category: string; request_state: string | null; assignee_name: string | null; created_at: string; updated_at: string; due_date: string | null }>(
    `SELECT t.id, t.dept, t.code, t.title, t.status, t.status_category, t.request_state, u.name AS assignee_name, t.created_at, t.updated_at, t.due_date
     FROM dept_tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.requested_by = ? ORDER BY t.created_at DESC LIMIT 200`,
    user.id,
  );
  const labels: Record<string, { title: string; statuses: { key: string; label: string }[] }> = {};
  for (const k of [...new Set(rows.map((r) => r.dept))]) {
    const c = await getDeptConfig(k).catch(() => null);
    if (c) labels[k] = { title: c.title, statuses: c.statuses };
  }
  return rows.map((r) => ({ ...r, deptTitle: labels[r.dept]?.title ?? r.dept, statusLabel: labelOf(labels[r.dept]?.statuses ?? [], r.status), href: deptPath(r.dept) }));
}

export async function decideRequest(user: AppUser, d: string, id: string, decision: "accept" | "decline", input: { assigneeId?: string | null; note?: string | null } = {}) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  need(a, "assign", "Only heads and leads accept or decline requests.");
  const t = await getTask(user, dp, id);
  if (t.request_state !== "pending") throw new WorkflowError("INVALID_STATE", `${t.code} is not waiting for a decision.`);
  const now = nowIso();
  if (decision === "accept") {
    await run("UPDATE dept_tasks SET request_state = 'accepted', updated_at = ? WHERE id = ?", now, id);
    if (input.assigneeId) await saveTask(user, dp, { ...taskToInput(t), assigneeId: input.assigneeId });
  } else {
    if (!input.note?.trim()) throw new WorkflowError("VALIDATION", "Say why the request is declined.");
    const cancelled = a.config.statuses.find((s) => s.category === "cancelled");
    // To the first Cancelled status; a department without one keeps the status and only marks the request declined.
    await run(
      "UPDATE dept_tasks SET request_state = 'declined', status = ?, status_category = ?, updated_at = ? WHERE id = ?",
      cancelled?.key ?? t.status,
      cancelled ? "cancelled" : t.status_category,
      now,
      id,
    );
  }
  if (input.note?.trim()) await run("INSERT INTO dept_task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("tcm_"), id, user.id, `${decision === "accept" ? "Accepted" : "Declined"}: ${input.note.trim()}`, now);
  if (t.requested_by)
    await notify([t.requested_by], { type: "handoff", title: `Your request ${t.code} was ${decision === "accept" ? "accepted" : "declined"}`, body: input.note?.trim() || t.title, link: "/requests", dedupeKey: `request-decision:${id}` }, now, user.id);
  await audit({ actor: user }, { itemId: id, action: `${dp}.request`, summary: `${user.name} ${decision === "accept" ? "accepted" : "declined"} request ${t.code}` });
}

export function taskToInput(t: Task) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    status: t.status,
    priority: t.priority,
    projectId: t.project_id,
    milestoneId: t.milestone_id,
    assigneeId: t.assignee_id,
    estimateHours: t.estimate_hours,
    spentHours: t.spent_hours,
    progress: t.progress,
    startDate: t.start_date,
    dueDate: t.due_date,
    labels: t.labels,
  };
}

// ---------------------------------------------------------------------------
// Department report (printable page and Excel)
// ---------------------------------------------------------------------------

export async function deptReport(user: AppUser, d: string, period: Period) {
  const dp = await dept(d);
  const a = await workAccess(user, dp);
  const cfg = a.config;
  const range = periodRange(period);
  const end = `${range.to}T23:59:59.999Z`;
  const own = a.rights.seeAll ? "" : " AND (t.assignee_id = ? OR t.reporter_id = ?)";
  const ownP = a.rights.seeAll ? [] : [user.id, user.id];
  const tasks = await all<{ id: string; code: string; title: string; type: string; status: string; status_category: string; priority: string; assignee_name: string | null; project_key: string | null; due_date: string | null; created_at: string; completed_at: string | null; estimate_hours: number | null; spent_hours: number | null; fields: string }>(
    `SELECT t.id, t.code, t.title, t.type, t.status, t.status_category, t.priority, u.name AS assignee_name, p.key AS project_key, t.due_date, t.created_at, t.completed_at, t.estimate_hours, t.spent_hours, t.fields
     FROM dept_tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN dept_projects p ON p.id = t.project_id WHERE t.dept = ?${own} ORDER BY t.code`,
    dp,
    ...ownP,
  );
  const inP = (iso: string | null) => !!iso && iso >= range.from && iso <= end;
  const today = nowIso().slice(0, 10);
  const open = tasks.filter((t) => OPEN_CATEGORIES.includes(t.status_category as never));
  const done = tasks.filter((t) => t.status_category === "done" && inP(t.completed_at));
  const created = tasks.filter((t) => inP(t.created_at));
  const time = await all<{ user_name: string; minutes: number }>(
    "SELECT u.name AS user_name, SUM(e.minutes) AS minutes FROM dept_time_entries e JOIN users u ON u.id = e.user_id WHERE e.dept = ? AND e.started_at >= ? AND e.started_at <= ? AND e.ended_at IS NOT NULL GROUP BY u.name ORDER BY u.name",
    dp,
    range.from,
    end,
  );
  const projects = await all<{ id: string; key: string; name: string; status: string; due_date: string | null; budget: number | null }>("SELECT id, key, name, status, due_date, budget FROM dept_projects WHERE dept = ? AND archived = 0 ORDER BY key", dp);
  const projTasks = await all<{ project_id: string; status_category: string }>("SELECT project_id, status_category FROM dept_tasks WHERE dept = ? AND project_id IS NOT NULL AND status_category <> 'cancelled'", dp);
  const kpis = cfg.features.kpis
    ? await all<{ metric: string; total: number }>(
        "SELECT m.metric, SUM(m.value) AS total FROM dept_metrics m JOIN dept_projects p ON p.id = m.project_id WHERE p.dept = ? AND m.recorded_on >= ? AND m.recorded_on <= ? GROUP BY m.metric",
        dp,
        range.from,
        range.to,
      )
    : [];
  const people = [...new Set(tasks.map((t) => t.assignee_name ?? "Unassigned"))].sort().map((name) => ({
    name,
    open: open.filter((t) => (t.assignee_name ?? "Unassigned") === name).length,
    done: done.filter((t) => (t.assignee_name ?? "Unassigned") === name).length,
    overdue: open.filter((t) => (t.assignee_name ?? "Unassigned") === name && t.due_date && t.due_date < today).length,
    hours: Math.round((n(time.find((x) => x.user_name === name)?.minutes) / 60) * 10) / 10,
  }));
  const moneyFields = cfg.fields.filter((f) => f.active && f.type === "money");
  return {
    title: cfg.title,
    names: cfg.names,
    period: range,
    totals: { open: open.length, done: done.length, created: created.length, overdue: open.filter((t) => t.due_date && t.due_date < today).length, hours: Math.round((time.reduce((s, x) => s + n(x.minutes), 0) / 60) * 10) / 10 },
    byStatus: cfg.statuses.map((s) => ({ label: s.label, count: tasks.filter((t) => t.status === s.key && (s.category === "done" ? inP(t.completed_at) : true)).length })).filter((x) => x.count),
    byType: cfg.types.map((ty) => ({ label: ty.label, open: open.filter((t) => t.type === ty.key).length, done: done.filter((t) => t.type === ty.key).length })).filter((x) => x.open || x.done),
    people,
    projects: projects.map((p) => {
      const list = projTasks.filter((t) => t.project_id === p.id);
      const d2 = list.filter((t) => t.status_category === "done").length;
      return { key: p.key, name: p.name, status: labelOf(cfg.projectStatuses, p.status), due: p.due_date, budget: p.budget == null ? null : n(p.budget), total: list.length, done: d2, progress: list.length ? Math.round((d2 / list.length) * 100) : 0 };
    }),
    kpis: cfg.kpis.filter((k) => kpis.some((x) => x.metric === k.key)).map((k) => ({ label: k.label, unit: k.unit, total: n(kpis.find((x) => x.metric === k.key)?.total) })),
    money: moneyFields.map((f) => ({ label: f.label, done: done.reduce((s, t) => s + n(parseJson<Record<string, FieldValue>>(t.fields, {})[f.key]), 0) })),
    doneList: done.map((t) => ({ code: t.code, title: t.title, type: labelOf(cfg.types, t.type), assignee: t.assignee_name, completed: t.completed_at?.slice(0, 10) ?? "" })),
    overdueList: open.filter((t) => t.due_date && t.due_date < today).map((t) => ({ code: t.code, title: t.title, assignee: t.assignee_name, due: t.due_date! })),
    tasks: tasks.map((t) => ({
      code: t.code,
      title: t.title,
      type: labelOf(cfg.types, t.type),
      status: labelOf(cfg.statuses, t.status),
      priority: labelOf(cfg.priorities, t.priority),
      assignee: t.assignee_name ?? "",
      project: t.project_key ?? "",
      due: t.due_date ?? "",
      created: t.created_at.slice(0, 10),
      completed: t.completed_at?.slice(0, 10) ?? "",
      estimate: t.estimate_hours == null ? "" : n(t.estimate_hours),
      spent: t.spent_hours == null ? "" : n(t.spent_hours),
    })),
  };
}
export type DeptReportData = Awaited<ReturnType<typeof deptReport>>;

// The facts line for a department's periodic report to the owners.
export async function deptReportFacts(user: AppUser, d: string, from: string, to: string) {
  const dp = await dept(d);
  const cfg = await getDeptConfig(dp);
  const end = `${to}T23:59:59.999Z`;
  const t = await get<{ done: number; created: number; overdue: number; open: number }>(
    `SELECT SUM(CASE WHEN status_category = 'done' AND completed_at >= ? AND completed_at <= ? THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN created_at >= ? AND created_at <= ? THEN 1 ELSE 0 END) AS created,
       SUM(CASE WHEN status_category IN (${OPEN_SQL}) AND due_date < ? THEN 1 ELSE 0 END) AS overdue,
       SUM(CASE WHEN status_category IN (${OPEN_SQL}) THEN 1 ELSE 0 END) AS open FROM dept_tasks WHERE dept = ?`,
    from,
    end,
    from,
    end,
    to,
    dp,
  );
  const hours = await get<{ m: number }>("SELECT SUM(minutes) AS m FROM dept_time_entries WHERE dept = ? AND started_at >= ? AND started_at <= ? AND ended_at IS NOT NULL", dp, from, end);
  const projects = await all<{ key: string; total: number; done: number }>(
    `SELECT p.key, (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status_category <> 'cancelled') AS total,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status_category = 'done') AS done FROM dept_projects p WHERE p.dept = ? AND p.archived = 0 ORDER BY p.key LIMIT 6`,
    dp,
  );
  const w = cfg.names.tasks.toLowerCase();
  const parts = [`${n(t?.done)} ${w} done, ${n(t?.created)} new, ${n(t?.open)} still open, ${n(t?.overdue)} overdue at the end of the period.`];
  if (n(hours?.m)) parts.push(`${Math.round(n(hours?.m) / 6) / 10} hours logged.`);
  if (projects.length) parts.push(`${cfg.names.projects}: ${projects.map((p) => `${p.key} ${n(p.total) ? Math.round((n(p.done) / n(p.total)) * 100) : 0}%`).join(", ")}.`);
  void user;
  return parts.join(" ");
}
