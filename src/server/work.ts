// Dev and Marketing work: projects (campaigns), milestones, tasks, comments and KPI entries.
// Heads and leads see and assign everything in their department; members see their own tasks and the projects
// they lead or have tasks in. Owners read everything.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { deptPeople, requireDept, type DeptAccess } from "./departments";
import type { AppUser } from "./users";
import { OPEN_TASK_STATUSES, PROJECT_STATUSES, TASK_PRIORITIES, TASK_STATUSES, WORK_CONFIG, WORK_DEPTS, type TaskStatus, type WorkDept } from "@/lib/work";

function dept(d: string): WorkDept {
  if (!(WORK_DEPTS as readonly string[]).includes(d)) throw new WorkflowError("VALIDATION", "Unknown department.");
  return d as WorkDept;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: string | null | undefined) => (v && DATE.test(v) ? v : null);

// ---------------------------------------------------------------------------
// Projects and milestones
// ---------------------------------------------------------------------------

export type Project = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  lead_id: string | null;
  lead_name: string | null;
  start_date: string | null;
  due_date: string | null;
  color: string | null;
  budget: number | null;
  meta: { kpiTargets?: Record<string, number>; channel?: string };
  archived: boolean;
  total: number;
  done: number;
  open: number;
  overdue: number;
  progress: number;
  milestones: { id: string; name: string; due_date: string | null; status: string; total: number; done: number }[];
  metrics: Record<string, number>;
};

export async function listProjects(user: AppUser, d: string, f: { q?: string | null; status?: string | null; archived?: boolean } = {}): Promise<Project[]> {
  const dp = dept(d);
  const a = await requireDept(user, dp);
  const where = ["p.dept = ?"];
  const params: (string | number)[] = [dp];
  if (!f.archived) where.push("p.archived = 0");
  if (f.status) {
    where.push("p.status = ?");
    params.push(f.status);
  }
  if (f.q?.trim()) {
    where.push("(lower(p.name) LIKE ? OR lower(p.key) LIKE ? OR lower(COALESCE(p.description, '')) LIKE ?)");
    const like = `%${f.q.trim().toLowerCase()}%`;
    params.push(like, like, like);
  }
  // Members see the projects they lead or have tasks in.
  if (!a.manage && !a.readOnly) {
    where.push("(p.lead_id = ? OR EXISTS (SELECT 1 FROM dept_tasks t WHERE t.project_id = p.id AND (t.assignee_id = ? OR t.reporter_id = ?)))");
    params.push(user.id, user.id, user.id);
  }
  const today = nowIso().slice(0, 10);
  const rows = await all<Record<string, unknown>>(
    `SELECT p.*, u.name AS lead_name,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status <> 'cancelled') AS total,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status IN ('backlog','todo','in_progress','review')) AS open,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status IN ('backlog','todo','in_progress','review') AND t.due_date < ?) AS overdue
     FROM dept_projects p LEFT JOIN users u ON u.id = p.lead_id WHERE ${where.join(" AND ")} ORDER BY p.archived, p.status = 'done', p.name`,
    today,
    ...params,
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const ms = await all<{ id: string; project_id: string; name: string; due_date: string | null; status: string; total: number; done: number }>(
    `SELECT m.id, m.project_id, m.name, m.due_date, m.status,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.milestone_id = m.id AND t.status <> 'cancelled') AS total,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.milestone_id = m.id AND t.status = 'done') AS done
     FROM dept_milestones m WHERE m.project_id IN (${placeholders(ids.length)}) ORDER BY m.sort, m.due_date`,
    ...ids,
  );
  const metrics = await all<{ project_id: string; metric: string; total: number }>(
    `SELECT project_id, metric, SUM(value) AS total FROM dept_metrics WHERE project_id IN (${placeholders(ids.length)}) GROUP BY project_id, metric`,
    ...ids,
  );
  return rows.map((r) => {
    const total = Number(r.total);
    const done = Number(r.done);
    return {
      id: r.id as string,
      key: r.key as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      status: r.status as string,
      lead_id: (r.lead_id as string) ?? null,
      lead_name: (r.lead_name as string) ?? null,
      start_date: (r.start_date as string) ?? null,
      due_date: (r.due_date as string) ?? null,
      color: (r.color as string) ?? null,
      budget: r.budget == null ? null : Number(r.budget),
      meta: parseJson(r.meta, {}),
      archived: !!r.archived,
      total,
      done,
      open: Number(r.open),
      overdue: Number(r.overdue),
      progress: total ? Math.round((done / total) * 100) : 0,
      milestones: ms.filter((m) => m.project_id === r.id).map((m) => ({ ...m, total: Number(m.total), done: Number(m.done) })),
      metrics: Object.fromEntries(metrics.filter((m) => m.project_id === r.id).map((m) => [m.metric, Number(m.total)])),
    };
  });
}

export type ProjectInput = {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  status: string;
  leadId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  color?: string | null;
  budget?: number | null;
  meta?: Project["meta"];
  archived?: boolean;
};

export async function saveProject(user: AppUser, d: string, input: ProjectInput) {
  const dp = dept(d);
  await requireDept(user, dp, "manage");
  const key = input.key.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(key)) throw new WorkflowError("VALIDATION", "The key is 2 to 8 letters or digits, starting with a letter, for example WEB.");
  if (!input.name.trim()) throw new WorkflowError("VALIDATION", `Name the ${WORK_CONFIG[dp].project.toLowerCase()}.`);
  if (!(PROJECT_STATUSES as readonly string[]).includes(input.status)) throw new WorkflowError("VALIDATION", "Choose a status.");
  const clash = await get<{ id: string }>("SELECT id FROM dept_projects WHERE dept = ? AND key = ?", dp, key);
  if (clash && clash.id !== input.id) throw new WorkflowError("VALIDATION", `The key ${key} is already used.`);
  const now = nowIso();
  if (input.id) {
    const old = await get<{ key: string }>("SELECT key FROM dept_projects WHERE id = ? AND dept = ?", input.id, dp);
    if (!old) throw new WorkflowError("NOT_FOUND", "Not found.");
    await tx(async () => {
      await run(
        "UPDATE dept_projects SET key = ?, name = ?, description = ?, status = ?, lead_id = ?, start_date = ?, due_date = ?, color = ?, budget = ?, meta = ?, archived = ?, updated_at = ? WHERE id = ?",
        key,
        input.name.trim(),
        input.description?.trim() || null,
        input.status,
        input.leadId || null,
        day(input.startDate),
        day(input.dueDate),
        input.color || null,
        input.budget ?? null,
        JSON.stringify(input.meta ?? {}),
        input.archived ? 1 : 0,
        now,
        input.id,
      );
      // A new key renumbers the task codes, keeping their numbers.
      if (old.key !== key) await run("UPDATE dept_tasks SET code = ? || substr(code, length(?) + 1) WHERE project_id = ?", key, old.key, input.id);
    });
    await audit({ actor: user }, { action: `${dp}.project`, summary: `${user.name} updated ${WORK_CONFIG[dp].project.toLowerCase()} ${key}` });
    return input.id;
  }
  const id = uid("prj_");
  await run(
    "INSERT INTO dept_projects (id, dept, key, name, description, status, lead_id, start_date, due_date, color, budget, meta, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    dp,
    key,
    input.name.trim(),
    input.description?.trim() || null,
    input.status,
    input.leadId || null,
    day(input.startDate),
    day(input.dueDate),
    input.color || null,
    input.budget ?? null,
    JSON.stringify(input.meta ?? {}),
    user.id,
    now,
    now,
  );
  await audit({ actor: user }, { action: `${dp}.project`, summary: `${user.name} created ${WORK_CONFIG[dp].project.toLowerCase()} ${key}` });
  return id;
}

export async function deleteProject(user: AppUser, d: string, id: string) {
  const dp = dept(d);
  await requireDept(user, dp, "manage");
  const p = await get<{ key: string }>("SELECT key FROM dept_projects WHERE id = ? AND dept = ?", id, dp);
  if (!p) return;
  // Tasks stay, without a project; their codes move to the department prefix.
  await tx(async () => {
    for (const t of await all<{ id: string }>("SELECT id FROM dept_tasks WHERE project_id = ?", id)) await run("UPDATE dept_tasks SET code = ? WHERE id = ?", await nextLooseCode(dp), t.id);
    await run("DELETE FROM dept_projects WHERE id = ?", id);
  });
  await audit({ actor: user }, { action: `${dp}.project`, summary: `${user.name} deleted ${WORK_CONFIG[dp].project.toLowerCase()} ${p.key}` });
}

export async function saveMilestone(user: AppUser, d: string, input: { id?: string; projectId: string; name: string; dueDate?: string | null; status?: string }) {
  const dp = dept(d);
  await requireDept(user, dp, "manage");
  if (!input.name.trim()) throw new WorkflowError("VALIDATION", "Name the milestone.");
  if (!(await get("SELECT 1 AS x FROM dept_projects WHERE id = ? AND dept = ?", input.projectId, dp))) throw new WorkflowError("NOT_FOUND", "Not found.");
  if (input.id)
    await run("UPDATE dept_milestones SET name = ?, due_date = ?, status = ? WHERE id = ? AND project_id = ?", input.name.trim(), day(input.dueDate), input.status === "done" ? "done" : "open", input.id, input.projectId);
  else {
    const sort = Number((await get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM dept_milestones WHERE project_id = ?", input.projectId))?.n ?? 1);
    await run("INSERT INTO dept_milestones (id, project_id, name, due_date, status, sort, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?)", uid("mst_"), input.projectId, input.name.trim(), day(input.dueDate), sort, nowIso());
  }
}

export async function deleteMilestone(user: AppUser, d: string, id: string) {
  await requireDept(user, dept(d), "manage");
  await run("DELETE FROM dept_milestones WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type Task = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: string;
  status: TaskStatus;
  priority: string;
  project_id: string | null;
  project_key: string | null;
  project_name: string | null;
  milestone_id: string | null;
  milestone_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  estimate_hours: number | null;
  spent_hours: number | null;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  labels: string[];
  sort: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  comments: number;
};

export type TaskFilter = {
  q?: string | null;
  status?: string[];
  assignee?: string | null; // a user id, "me" or "none"
  project?: string | null; // a project id or "none"
  type?: string | null;
  priority?: string | null;
  due?: "overdue" | "week" | "none" | null;
  sort?: "updated" | "due" | "priority" | "code" | "title" | "status";
  dir?: "asc" | "desc";
};

const PRIORITY_RANK = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END";

export async function listTasks(user: AppUser, d: string, f: TaskFilter = {}): Promise<{ tasks: Task[]; access: DeptAccess }> {
  const dp = dept(d);
  const a = await requireDept(user, dp);
  const where = ["t.dept = ?"];
  const params: (string | number)[] = [dp];
  if (!a.manage && !a.readOnly) {
    where.push("(t.assignee_id = ? OR t.reporter_id = ?)");
    params.push(user.id, user.id);
  }
  if (f.status?.length) {
    where.push(`t.status IN (${placeholders(f.status.length)})`);
    params.push(...f.status);
  }
  if (f.assignee === "me") {
    where.push("t.assignee_id = ?");
    params.push(user.id);
  } else if (f.assignee === "none") where.push("t.assignee_id IS NULL");
  else if (f.assignee) {
    where.push("t.assignee_id = ?");
    params.push(f.assignee);
  }
  if (f.project === "none") where.push("t.project_id IS NULL");
  else if (f.project) {
    where.push("t.project_id = ?");
    params.push(f.project);
  }
  if (f.type) {
    where.push("t.type = ?");
    params.push(f.type);
  }
  if (f.priority) {
    where.push("t.priority = ?");
    params.push(f.priority);
  }
  const today = nowIso().slice(0, 10);
  if (f.due === "overdue") {
    where.push(`t.due_date < ? AND t.status IN (${placeholders(OPEN_TASK_STATUSES.length)})`);
    params.push(today, ...OPEN_TASK_STATUSES);
  } else if (f.due === "week") {
    where.push("t.due_date >= ? AND t.due_date <= ?");
    params.push(today, new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  } else if (f.due === "none") where.push("t.due_date IS NULL");
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    where.push("(lower(t.title) LIKE ? OR lower(t.code) LIKE ? OR lower(COALESCE(t.description, '')) LIKE ? OR lower(t.labels) LIKE ?)");
    params.push(like, like, like, like);
  }
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  const order =
    f.sort === "due"
      ? `t.due_date IS NULL, t.due_date ${dir}`
      : f.sort === "priority"
        ? `${PRIORITY_RANK} ${dir === "ASC" ? "DESC" : "ASC"}, t.due_date`
        : f.sort === "code"
          ? `t.code ${dir}`
          : f.sort === "title"
            ? `lower(t.title) ${dir}`
            : f.sort === "status"
              ? `t.status ${dir}, t.sort`
              : `t.updated_at ${dir}`;
  const rows = await all<Task & { labels: string }>(
    `SELECT t.*, p.key AS project_key, p.name AS project_name, m.name AS milestone_name, ua.name AS assignee_name, ur.name AS reporter_name,
       (SELECT COUNT(*) FROM dept_task_comments c WHERE c.task_id = t.id) AS comments
     FROM dept_tasks t LEFT JOIN dept_projects p ON p.id = t.project_id LEFT JOIN dept_milestones m ON m.id = t.milestone_id
     LEFT JOIN users ua ON ua.id = t.assignee_id LEFT JOIN users ur ON ur.id = t.reporter_id
     WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 2000`,
    ...params,
  );
  return {
    access: a,
    tasks: rows.map((r) => ({
      ...r,
      labels: parseJson<string[]>(r.labels, []),
      progress: Number(r.progress),
      sort: Number(r.sort),
      comments: Number(r.comments),
      estimate_hours: r.estimate_hours == null ? null : Number(r.estimate_hours),
      spent_hours: r.spent_hours == null ? null : Number(r.spent_hours),
    })),
  };
}

async function nextLooseCode(dp: WorkDept) {
  const prefix = dp === "dev" ? "DEV" : "MKT";
  const n = await get<{ n: number | null }>(`SELECT MAX(CAST(substr(code, ${prefix.length + 2}) AS INTEGER)) AS n FROM dept_tasks WHERE dept = ? AND code LIKE ?`, dp, `${prefix}-%`);
  return `${prefix}-${Number(n?.n ?? 0) + 1}`;
}

async function nextCode(dp: WorkDept, projectId: string | null) {
  if (!projectId) return nextLooseCode(dp);
  const p = await get<{ key: string; next_number: number }>("SELECT key, next_number FROM dept_projects WHERE id = ?", projectId);
  if (!p) throw new WorkflowError("NOT_FOUND", "Project not found.");
  await run("UPDATE dept_projects SET next_number = next_number + 1 WHERE id = ?", projectId);
  return `${p.key}-${p.next_number}`;
}

export type TaskInput = {
  id?: string;
  title: string;
  description?: string | null;
  type?: string;
  status?: string;
  priority?: string;
  projectId?: string | null;
  milestoneId?: string | null;
  assigneeId?: string | null;
  estimateHours?: number | null;
  spentHours?: number | null;
  progress?: number;
  startDate?: string | null;
  dueDate?: string | null;
  labels?: string[];
};

async function canEditTask(user: AppUser, a: DeptAccess, taskId: string) {
  if (a.manage) return true;
  const t = await get<{ assignee_id: string | null; reporter_id: string | null }>("SELECT assignee_id, reporter_id FROM dept_tasks WHERE id = ?", taskId);
  return !!t && (t.assignee_id === user.id || t.reporter_id === user.id);
}

export async function saveTask(user: AppUser, d: string, input: TaskInput) {
  const dp = dept(d);
  const a = await requireDept(user, dp, "write");
  const title = input.title?.replace(/\s+/g, " ").trim();
  if (!title) throw new WorkflowError("VALIDATION", "Give the task a title.");
  const cfg = WORK_CONFIG[dp];
  const type = input.type && cfg.taskTypes.some((t) => t.key === input.type) ? input.type : cfg.taskTypes[0].key;
  const status = (TASK_STATUSES as readonly string[]).includes(input.status ?? "") ? (input.status as TaskStatus) : "todo";
  const priority = (TASK_PRIORITIES as readonly string[]).includes(input.priority ?? "") ? input.priority! : "normal";
  // Members work on their own tasks; only heads and leads give tasks to others.
  if (input.assigneeId && input.assigneeId !== user.id && !a.manage) throw new WorkflowError("FORBIDDEN", "Only heads and leads assign tasks to other people.");
  if (input.assigneeId && !(await deptPeople(dp)).some((p) => p.id === input.assigneeId)) throw new WorkflowError("VALIDATION", "The assignee is not in this department.");
  if (input.projectId && !(await get("SELECT 1 AS x FROM dept_projects WHERE id = ? AND dept = ?", input.projectId, dp))) throw new WorkflowError("VALIDATION", "Unknown project.");
  if (input.milestoneId && !(await get("SELECT 1 AS x FROM dept_milestones WHERE id = ? AND project_id = ?", input.milestoneId, input.projectId ?? ""))) throw new WorkflowError("VALIDATION", "The milestone is not in that project.");
  const now = nowIso();
  const progress = status === "done" ? 100 : Math.max(0, Math.min(100, Math.round(input.progress ?? 0)));
  const labels = JSON.stringify([...new Set((input.labels ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean))].slice(0, 12));
  if (input.id) {
    const old = await get<{ assignee_id: string | null; project_id: string | null; status: string; code: string }>("SELECT assignee_id, project_id, status, code FROM dept_tasks WHERE id = ? AND dept = ?", input.id, dp);
    if (!old) throw new WorkflowError("NOT_FOUND", "Task not found.");
    if (!(await canEditTask(user, a, input.id))) throw new WorkflowError("FORBIDDEN", "You can change only your own tasks.");
    if (!a.manage && (input.assigneeId ?? null) !== old.assignee_id && input.assigneeId !== user.id) throw new WorkflowError("FORBIDDEN", "Only heads and leads reassign tasks.");
    const code = (input.projectId ?? null) !== old.project_id ? await nextCode(dp, input.projectId ?? null) : old.code;
    await run(
      `UPDATE dept_tasks SET code = ?, title = ?, description = ?, type = ?, status = ?, priority = ?, project_id = ?, milestone_id = ?, assignee_id = ?, estimate_hours = ?, spent_hours = ?,
         progress = ?, start_date = ?, due_date = ?, labels = ?, updated_at = ?, completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, ?) ELSE NULL END WHERE id = ?`,
      code,
      title,
      input.description?.trim() || null,
      type,
      status,
      priority,
      input.projectId || null,
      input.milestoneId || null,
      input.assigneeId || null,
      input.estimateHours ?? null,
      input.spentHours ?? null,
      progress,
      day(input.startDate),
      day(input.dueDate),
      labels,
      now,
      status,
      now,
      input.id,
    );
    if (input.assigneeId && input.assigneeId !== old.assignee_id && input.assigneeId !== user.id)
      await notify([input.assigneeId], { type: "assignment", title: `${code} was assigned to you`, body: title, link: `/${dp}?task=${input.id}`, dedupeKey: `task-assign:${input.id}:${input.assigneeId}:${now}` }, now, user.id);
    await audit({ actor: user }, { action: `${dp}.task`, summary: `${user.name} updated ${code}${old.status !== status ? ` (${old.status} to ${status})` : ""}` });
    return input.id;
  }
  const id = uid("tsk_");
  const code = await nextCode(dp, input.projectId ?? null);
  const top = Number((await get<{ n: number }>("SELECT COALESCE(MIN(sort), 0) - 1 AS n FROM dept_tasks WHERE dept = ? AND status = ?", dp, status))?.n ?? 0);
  await run(
    `INSERT INTO dept_tasks (id, dept, project_id, milestone_id, code, title, description, type, status, priority, assignee_id, reporter_id, estimate_hours, spent_hours, progress,
       start_date, due_date, labels, sort, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    dp,
    input.projectId || null,
    input.milestoneId || null,
    code,
    title,
    input.description?.trim() || null,
    type,
    status,
    priority,
    input.assigneeId || null,
    user.id,
    input.estimateHours ?? null,
    input.spentHours ?? null,
    progress,
    day(input.startDate),
    day(input.dueDate),
    labels,
    top,
    now,
    now,
    status === "done" ? now : null,
  );
  if (input.assigneeId && input.assigneeId !== user.id)
    await notify([input.assigneeId], { type: "assignment", title: `${code} was assigned to you`, body: title, link: `/${dp}?task=${id}`, dedupeKey: `task-assign:${id}:${input.assigneeId}` }, now, user.id);
  await audit({ actor: user }, { action: `${dp}.task`, summary: `${user.name} created ${code} ${title}` });
  return id;
}

// Board moves: a new status and position. Members move only their own tasks.
export async function moveTask(user: AppUser, d: string, id: string, status: string, beforeId: string | null) {
  const dp = dept(d);
  const a = await requireDept(user, dp, "write");
  if (!(TASK_STATUSES as readonly string[]).includes(status)) throw new WorkflowError("VALIDATION", "Unknown status.");
  if (!(await canEditTask(user, a, id))) throw new WorkflowError("FORBIDDEN", "You can move only your own tasks.");
  let sort: number;
  if (beforeId) {
    const b = await get<{ sort: number }>("SELECT sort FROM dept_tasks WHERE id = ?", beforeId);
    const prev = await get<{ sort: number }>("SELECT MAX(sort) AS sort FROM dept_tasks WHERE dept = ? AND status = ? AND sort < ? AND id <> ?", dp, status, b?.sort ?? 0, id);
    sort = prev?.sort != null ? (Number(prev.sort) + Number(b!.sort)) / 2 : Number(b?.sort ?? 0) - 1;
  } else sort = Number((await get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM dept_tasks WHERE dept = ? AND status = ?", dp, status))?.n ?? 0);
  const now = nowIso();
  await run(
    "UPDATE dept_tasks SET status = ?, sort = ?, updated_at = ?, progress = CASE WHEN ? = 'done' THEN 100 ELSE progress END, completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, ?) ELSE NULL END WHERE id = ?",
    status,
    sort,
    now,
    status,
    status,
    now,
    id,
  );
}

export async function bulkTasks(user: AppUser, d: string, ids: string[], patch: { status?: string; assigneeId?: string | null; priority?: string; projectId?: string | null; dueDate?: string | null; delete?: boolean }) {
  const dp = dept(d);
  const a = await requireDept(user, dp, "write");
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids.slice(0, 500)) {
    try {
      const t = await get<Task & { labels: string }>("SELECT * FROM dept_tasks WHERE id = ? AND dept = ?", id, dp);
      if (!t) throw new WorkflowError("NOT_FOUND", "Task not found.");
      if (patch.delete) {
        if (!a.manage && t.reporter_id !== user.id) throw new WorkflowError("FORBIDDEN", "Only heads, leads or the person who created a task can delete it.");
        await run("DELETE FROM dept_tasks WHERE id = ?", id);
        await audit({ actor: user }, { action: `${dp}.task`, summary: `${user.name} deleted ${t.code} ${t.title}` });
      } else
        await saveTask(user, dp, {
          id,
          title: t.title,
          description: t.description,
          type: t.type,
          status: patch.status ?? t.status,
          priority: patch.priority ?? t.priority,
          projectId: patch.projectId !== undefined ? patch.projectId : t.project_id,
          milestoneId: patch.projectId !== undefined && patch.projectId !== t.project_id ? null : t.milestone_id,
          assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : t.assignee_id,
          estimateHours: t.estimate_hours,
          spentHours: t.spent_hours,
          progress: t.progress,
          startDate: t.start_date,
          dueDate: patch.dueDate !== undefined ? patch.dueDate : t.due_date,
          labels: parseJson<string[]>(t.labels, []),
        });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

// CSV import: one task per row. Columns: title, description, type, status, priority, assignee_email, project_key, due_date, estimate_hours, labels.
export async function importTasks(user: AppUser, d: string, rows: Record<string, string>[]) {
  const dp = dept(d);
  await requireDept(user, dp, "write");
  const people = await deptPeople(dp);
  const projects = await all<{ id: string; key: string }>("SELECT id, key FROM dept_projects WHERE dept = ?", dp);
  const out = { created: 0, errors: [] as string[] };
  for (const [i, r] of rows.slice(0, 1000).entries()) {
    try {
      const email = (r.assignee_email ?? "").trim().toLowerCase();
      const assignee = email ? people.find((p) => p.email.toLowerCase() === email) : undefined;
      if (email && !assignee) throw new Error(`${email} is not in this department`);
      const pk = (r.project_key ?? "").trim().toUpperCase();
      const project = pk ? projects.find((p) => p.key === pk) : undefined;
      if (pk && !project) throw new Error(`unknown project ${pk}`);
      await saveTask(user, dp, {
        title: r.title ?? "",
        description: r.description || null,
        type: r.type,
        status: r.status,
        priority: r.priority,
        projectId: project?.id ?? null,
        assigneeId: assignee?.id ?? null,
        dueDate: r.due_date || null,
        estimateHours: r.estimate_hours ? Number(r.estimate_hours) : null,
        labels: (r.labels ?? "").split(/[;,]/),
      });
      out.created++;
    } catch (err) {
      out.errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Comments and KPI entries
// ---------------------------------------------------------------------------

export async function taskComments(user: AppUser, d: string, taskId: string) {
  const dp = dept(d);
  const a = await requireDept(user, dp);
  if (!a.manage && !a.readOnly && !(await canEditTask(user, a, taskId))) throw new WorkflowError("FORBIDDEN", "Not your task.");
  return all<{ id: string; author_id: string; author_name: string; body: string; created_at: string }>(
    "SELECT c.id, c.author_id, u.name AS author_name, c.body, c.created_at FROM dept_task_comments c JOIN users u ON u.id = c.author_id WHERE c.task_id = ? ORDER BY c.created_at",
    taskId,
  );
}

export async function addTaskComment(user: AppUser, d: string, taskId: string, body: string) {
  const dp = dept(d);
  const a = await requireDept(user, dp, "write");
  if (!body.trim()) throw new WorkflowError("VALIDATION", "Write a comment.");
  if (!(await canEditTask(user, a, taskId))) throw new WorkflowError("FORBIDDEN", "Not your task.");
  const t = await get<{ code: string; assignee_id: string | null; reporter_id: string | null }>("SELECT code, assignee_id, reporter_id FROM dept_tasks WHERE id = ?", taskId);
  const now = nowIso();
  await run("INSERT INTO dept_task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("tcm_"), taskId, user.id, body.trim().slice(0, 4000), now);
  await run("UPDATE dept_tasks SET updated_at = ? WHERE id = ?", now, taskId);
  await notify([t?.assignee_id, t?.reporter_id], { type: "mention", title: `${user.name} commented on ${t?.code}`, body: body.slice(0, 140), link: `/${dp}?task=${taskId}`, groupKey: `task:${taskId}` }, now, user.id);
}

export async function listMetrics(user: AppUser, d: string, projectId: string) {
  await requireDept(user, dept(d));
  return all<{ id: string; metric: string; value: number; recorded_on: string; note: string | null; created_by_name: string | null }>(
    "SELECT m.id, m.metric, m.value, m.recorded_on, m.note, u.name AS created_by_name FROM dept_metrics m LEFT JOIN users u ON u.id = m.created_by WHERE m.project_id = ? ORDER BY m.recorded_on DESC, m.created_at DESC",
    projectId,
  );
}

export async function addMetric(user: AppUser, d: string, input: { projectId: string; metric: string; value: number; recordedOn: string; note?: string | null }) {
  const dp = dept(d);
  await requireDept(user, dp, "write");
  if (!WORK_CONFIG[dp].metrics.some((m) => m.key === input.metric)) throw new WorkflowError("VALIDATION", "Choose a KPI.");
  if (!Number.isFinite(input.value)) throw new WorkflowError("VALIDATION", "Enter a number.");
  if (!(await get("SELECT 1 AS x FROM dept_projects WHERE id = ? AND dept = ?", input.projectId, dp))) throw new WorkflowError("NOT_FOUND", "Not found.");
  await run(
    "INSERT INTO dept_metrics (id, project_id, metric, value, recorded_on, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    uid("kpi_"),
    input.projectId,
    input.metric,
    input.value,
    day(input.recordedOn) ?? nowIso().slice(0, 10),
    input.note?.trim() || null,
    user.id,
    nowIso(),
  );
}

export async function deleteMetric(user: AppUser, d: string, id: string) {
  await requireDept(user, dept(d), "manage");
  await run("DELETE FROM dept_metrics WHERE id = ?", id);
}
