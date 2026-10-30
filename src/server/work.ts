// Dev and Marketing work: projects (campaigns), milestones, tasks, comments and KPI entries. Statuses, types,
// priorities, custom fields, names and who may do what come from the department's configuration (Configure tab).
// By default heads and leads see and assign everything; members see their own tasks and the projects they lead or
// have tasks in. Owners read everything.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { deptAccess, deptManagers, deptPeople } from "./departments";
import { need, workAccess, workDept as dept, type WorkAccess } from "./dept-config";
import type { AppUser } from "./users";
import {
  OPEN_CATEGORIES,
  categoryOf,
  fieldEmpty,
  fieldRequired,
  fieldShown,
  labelOf,
  statusOf,
  type DeptConfig,
  type DeptField,
  type FieldValue,
  type StatusCategory,
  type TaskCheck,
} from "@/lib/dept-config";
import { deptPath, type WorkDept } from "@/lib/work";

const OPEN_SQL = OPEN_CATEGORIES.map((c) => `'${c}'`).join(",");
const liveProjectStatuses = (c: DeptConfig) => c.projectStatuses.filter((s) => s.category !== "done" && s.category !== "cancelled").map((s) => s.key);

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
  const dp = await dept(d);
  const a = await workAccess(user, dp);
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
  // Without "see everyone's tasks", people see the projects they lead or have tasks in.
  if (!a.rights.seeAll) {
    where.push("(p.lead_id = ? OR EXISTS (SELECT 1 FROM dept_tasks t WHERE t.project_id = p.id AND (t.assignee_id = ? OR t.reporter_id = ?)))");
    params.push(user.id, user.id, user.id);
  }
  const today = nowIso().slice(0, 10);
  const rows = await all<Record<string, unknown>>(
    `SELECT p.*, u.name AS lead_name,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status_category <> 'cancelled') AS total,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status_category = 'done') AS done,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status_category IN (${OPEN_SQL})) AS open,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status_category IN (${OPEN_SQL}) AND t.due_date < ?) AS overdue
     FROM dept_projects p LEFT JOIN users u ON u.id = p.lead_id WHERE ${where.join(" AND ")} ORDER BY p.archived, p.name`,
    today,
    ...params,
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const ms = await all<{ id: string; project_id: string; name: string; due_date: string | null; status: string; total: number; done: number }>(
    `SELECT m.id, m.project_id, m.name, m.due_date, m.status,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.milestone_id = m.id AND t.status_category <> 'cancelled') AS total,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.milestone_id = m.id AND t.status_category = 'done') AS done
     FROM dept_milestones m WHERE m.project_id IN (${placeholders(ids.length)}) ORDER BY m.sort, m.due_date`,
    ...ids,
  );
  const metrics = await all<{ project_id: string; metric: string; total: number }>(
    `SELECT project_id, metric, SUM(value) AS total FROM dept_metrics WHERE project_id IN (${placeholders(ids.length)}) GROUP BY project_id, metric`,
    ...ids,
  );
  // Finished projects go after the live ones.
  const live = liveProjectStatuses(a.config);
  const ended = (r: Record<string, unknown>) => Number(!live.includes(r.status as string));
  return rows
    .sort((x, y) => Number(!!x.archived) - Number(!!y.archived) || ended(x) - ended(y))
    .map((r) => {
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
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  const names = a.config.names;
  need(a, "projects", `You cannot create or edit ${names.projects.toLowerCase()} here.`);
  const key = input.key.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(key)) throw new WorkflowError("VALIDATION", "The key is 2 to 8 letters or digits, starting with a letter, for example WEB.");
  if (!input.name.trim()) throw new WorkflowError("VALIDATION", `Name the ${names.project.toLowerCase()}.`);
  if (!a.config.projectStatuses.some((s) => s.key === input.status)) throw new WorkflowError("VALIDATION", "Choose a status.");
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
    await audit({ actor: user }, { action: `${dp}.project`, summary: `${user.name} updated ${names.project.toLowerCase()} ${key}` });
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
  await audit({ actor: user }, { action: `${dp}.project`, summary: `${user.name} created ${names.project.toLowerCase()} ${key}` });
  return id;
}

export async function deleteProject(user: AppUser, d: string, id: string) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  need(a, "projects", `You cannot delete ${a.config.names.projects.toLowerCase()} here.`);
  const p = await get<{ key: string }>("SELECT key FROM dept_projects WHERE id = ? AND dept = ?", id, dp);
  if (!p) return;
  // Tasks stay, without a project; their codes move to the department prefix.
  await tx(async () => {
    for (const t of await all<{ id: string }>("SELECT id FROM dept_tasks WHERE project_id = ?", id)) await run("UPDATE dept_tasks SET code = ? WHERE id = ?", await nextLooseCode(dp, a.config), t.id);
    await run("DELETE FROM dept_projects WHERE id = ?", id);
  });
  await audit({ actor: user }, { action: `${dp}.project`, summary: `${user.name} deleted ${a.config.names.project.toLowerCase()} ${p.key}` });
}

export async function saveMilestone(user: AppUser, d: string, input: { id?: string; projectId: string; name: string; dueDate?: string | null; status?: string }) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  const word = a.config.names.milestone.toLowerCase();
  need(a, "projects", `You cannot change ${word}s here.`);
  if (!input.name.trim()) throw new WorkflowError("VALIDATION", `Name the ${word}.`);
  if (!(await get("SELECT 1 AS x FROM dept_projects WHERE id = ? AND dept = ?", input.projectId, dp))) throw new WorkflowError("NOT_FOUND", "Not found.");
  if (input.id)
    await run("UPDATE dept_milestones SET name = ?, due_date = ?, status = ? WHERE id = ? AND project_id = ?", input.name.trim(), day(input.dueDate), input.status === "done" ? "done" : "open", input.id, input.projectId);
  else {
    const sort = Number((await get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM dept_milestones WHERE project_id = ?", input.projectId))?.n ?? 1);
    await run("INSERT INTO dept_milestones (id, project_id, name, due_date, status, sort, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?)", uid("mst_"), input.projectId, input.name.trim(), day(input.dueDate), sort, nowIso());
  }
}

export async function deleteMilestone(user: AppUser, d: string, id: string) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  need(a, "projects", `You cannot change ${a.config.names.milestone.toLowerCase()}s here.`);
  await run("DELETE FROM dept_milestones WHERE id = ? AND project_id IN (SELECT id FROM dept_projects WHERE dept = ?)", id, dp);
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
  status: string;
  status_category: StatusCategory;
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
  reviewer_id: string | null;
  reviewer_name: string | null;
  parent_id: string | null;
  parent_code: string | null;
  sprint_id: string | null;
  sprint_name: string | null;
  request_state: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  recur: string | null;
  estimate_hours: number | null;
  spent_hours: number | null;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  labels: string[];
  fields: Record<string, FieldValue>;
  checklist: TaskCheck[];
  blocked_by: string[];
  subtasks_total: number;
  subtasks_done: number;
  files: number;
  sort: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  comments: number;
};

export type TaskFilter = {
  q?: string | null;
  status?: string[];
  open?: boolean; // only unfinished work (any status in an open category)
  assignee?: string | null; // a user id, "me" or "none"
  project?: string | null; // a project id or "none"
  type?: string | null;
  priority?: string | null;
  due?: "overdue" | "week" | "none" | null;
  sprint?: string | null; // a sprint id, "current" or "none"
  request?: "pending" | null;
  sort?: "updated" | "due" | "priority" | "code" | "title" | "status";
  dir?: "asc" | "desc";
};

export const RECURRENCES = [
  { key: "daily", label: "Every day", days: 1 },
  { key: "weekly", label: "Every week", days: 7 },
  { key: "biweekly", label: "Every two weeks", days: 14 },
  { key: "monthly", label: "Every month", months: 1 },
  { key: "quarterly", label: "Every three months", months: 3 },
] as const;

// Orders by the configured order of priorities or statuses.
function rankSql(column: string, keys: string[]) {
  if (!keys.length) return "0";
  return `CASE ${column} ${keys.map((k, i) => `WHEN '${k.replace(/'/g, "''")}' THEN ${i}`).join(" ")} ELSE ${keys.length} END`;
}

type TaskRow = Omit<Task, "labels" | "fields" | "checklist" | "blocked_by"> & { labels: string; fields: string; checklist: string };

function hydrateTask(r: TaskRow, blocked: string[]): Task {
  return {
    ...r,
    labels: parseJson<string[]>(r.labels, []),
    fields: parseJson<Record<string, FieldValue>>(r.fields, {}),
    checklist: parseJson<TaskCheck[]>(r.checklist, []),
    blocked_by: blocked,
    progress: Number(r.progress),
    sort: Number(r.sort),
    comments: Number(r.comments),
    files: Number(r.files),
    subtasks_total: Number(r.subtasks_total),
    subtasks_done: Number(r.subtasks_done),
    estimate_hours: r.estimate_hours == null ? null : Number(r.estimate_hours),
    spent_hours: r.spent_hours == null ? null : Number(r.spent_hours),
  };
}

const TASK_SELECT = `SELECT t.*, p.key AS project_key, p.name AS project_name, m.name AS milestone_name, ua.name AS assignee_name, ur.name AS reporter_name,
       uv.name AS reviewer_name, uq.name AS requested_by_name, pt.code AS parent_code, sp.name AS sprint_name,
       (SELECT COUNT(*) FROM dept_task_comments c WHERE c.task_id = t.id) AS comments,
       (SELECT COUNT(*) FROM dept_task_files f WHERE f.task_id = t.id) AS files,
       (SELECT COUNT(*) FROM dept_tasks s WHERE s.parent_id = t.id AND s.status_category <> 'cancelled') AS subtasks_total,
       (SELECT COUNT(*) FROM dept_tasks s WHERE s.parent_id = t.id AND s.status_category = 'done') AS subtasks_done
     FROM dept_tasks t LEFT JOIN dept_projects p ON p.id = t.project_id LEFT JOIN dept_milestones m ON m.id = t.milestone_id
     LEFT JOIN users ua ON ua.id = t.assignee_id LEFT JOIN users ur ON ur.id = t.reporter_id LEFT JOIN users uv ON uv.id = t.reviewer_id
     LEFT JOIN users uq ON uq.id = t.requested_by LEFT JOIN dept_tasks pt ON pt.id = t.parent_id LEFT JOIN dept_sprints sp ON sp.id = t.sprint_id`;

async function withLinks(rows: TaskRow[]) {
  if (!rows.length) return [];
  const links = await all<{ task_id: string; blocked_by: string }>(`SELECT task_id, blocked_by FROM dept_task_links WHERE task_id IN (${placeholders(rows.length)})`, ...rows.map((r) => r.id));
  return rows.map((r) => hydrateTask(r, links.filter((l) => l.task_id === r.id).map((l) => l.blocked_by)));
}

export async function listTasks(user: AppUser, d: string, f: TaskFilter = {}): Promise<{ tasks: Task[]; access: WorkAccess }> {
  const dp = await dept(d);
  const a = await workAccess(user, dp);
  const where = ["t.dept = ?"];
  const params: (string | number)[] = [dp];
  if (!a.rights.seeAll) {
    where.push("(t.assignee_id = ? OR t.reporter_id = ? OR t.reviewer_id = ?)");
    params.push(user.id, user.id, user.id);
  }
  if (f.status?.length) {
    where.push(`t.status IN (${placeholders(f.status.length)})`);
    params.push(...f.status);
  }
  if (f.open) where.push(`t.status_category IN (${OPEN_SQL})`);
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
  if (f.sprint === "none") where.push("t.sprint_id IS NULL");
  else if (f.sprint === "current") where.push("t.sprint_id IN (SELECT id FROM dept_sprints WHERE dept = t.dept AND status = 'active')");
  else if (f.sprint) {
    where.push("t.sprint_id = ?");
    params.push(f.sprint);
  }
  if (f.request === "pending") where.push("t.request_state = 'pending'");
  const today = nowIso().slice(0, 10);
  if (f.due === "overdue") {
    where.push(`t.due_date < ? AND t.status_category IN (${OPEN_SQL})`);
    params.push(today);
  } else if (f.due === "week") {
    where.push("t.due_date >= ? AND t.due_date <= ?");
    params.push(today, new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  } else if (f.due === "none") where.push("t.due_date IS NULL");
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    where.push("(lower(t.title) LIKE ? OR lower(t.code) LIKE ? OR lower(COALESCE(t.description, '')) LIKE ? OR lower(t.labels) LIKE ? OR lower(t.fields) LIKE ?)");
    params.push(like, like, like, like, like);
  }
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  const priority = rankSql("t.priority", a.config.priorities.map((p) => p.key));
  const status = rankSql("t.status", a.config.statuses.map((s) => s.key));
  const order =
    f.sort === "due"
      ? `t.due_date IS NULL, t.due_date ${dir}`
      : f.sort === "priority"
        ? `${priority} ${dir === "ASC" ? "DESC" : "ASC"}, t.due_date`
        : f.sort === "code"
          ? `t.code ${dir}`
          : f.sort === "title"
            ? `lower(t.title) ${dir}`
            : f.sort === "status"
              ? `${status} ${dir}, t.sort`
              : `t.updated_at ${dir}`;
  const rows = await all<TaskRow>(`${TASK_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 2000`, ...params);
  return { access: a, tasks: await withLinks(rows) };
}

export async function getTask(user: AppUser, d: string, id: string) {
  const dp = await dept(d);
  const a = await workAccess(user, dp);
  const r = await get<TaskRow>(`${TASK_SELECT} WHERE t.id = ? AND t.dept = ?`, id, dp);
  if (!r) throw new WorkflowError("NOT_FOUND", "Task not found.");
  if (!a.rights.seeAll && ![r.assignee_id, r.reporter_id, r.reviewer_id].includes(user.id)) throw new WorkflowError("FORBIDDEN", "Not your task.");
  return (await withLinks([r]))[0]!;
}

async function nextLooseCode(dp: WorkDept, cfg: DeptConfig) {
  const prefix = cfg.codePrefix;
  const n = await get<{ n: number | null }>(`SELECT MAX(CAST(substr(code, ${prefix.length + 2}) AS INTEGER)) AS n FROM dept_tasks WHERE dept = ? AND code LIKE ?`, dp, `${prefix}-%`);
  return `${prefix}-${Number(n?.n ?? 0) + 1}`;
}

async function nextCode(dp: WorkDept, cfg: DeptConfig, projectId: string | null) {
  if (!projectId) return nextLooseCode(dp, cfg);
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
  reviewerId?: string | null;
  parentId?: string | null;
  sprintId?: string | null;
  recur?: string | null;
  estimateHours?: number | null;
  spentHours?: number | null;
  progress?: number;
  startDate?: string | null;
  dueDate?: string | null;
  labels?: string[];
  fields?: Record<string, FieldValue>;
  checklist?: TaskCheck[];
  blockedBy?: string[];
  // On creation only: start from a template, and create these subtasks.
  templateKey?: string | null;
  subtasks?: string[];
};

type OldTask = {
  id: string;
  type: string;
  assignee_id: string | null;
  reporter_id: string | null;
  reviewer_id: string | null;
  project_id: string | null;
  parent_id: string | null;
  status: string;
  status_category: string;
  code: string;
  title: string;
  fields: string;
  checklist: string;
  recur: string | null;
  requested_by: string | null;
};

const own = (user: AppUser, t: { assignee_id: string | null; reporter_id: string | null; reviewer_id?: string | null }) => t.assignee_id === user.id || t.reporter_id === user.id || t.reviewer_id === user.id;

// Cleans and checks custom field values for a task of this type in this status. Values of fields that are switched
// off or hidden for the type are kept as they were.
function cleanFields(a: WorkAccess, people: string[], type: string, category: StatusCategory, input: Record<string, FieldValue> | undefined, old: Record<string, FieldValue>) {
  const out: Record<string, FieldValue> = { ...old };
  const statusLabel = STATUS_WORD[category];
  for (const f of a.config.fields) {
    if (!fieldShown(f, type)) continue;
    const raw = input && f.key in input ? input[f.key] : old[f.key];
    const v = cleanValue(f, raw, people);
    if (f.leadsOnly && !a.rights.editAll && JSON.stringify(v ?? null) !== JSON.stringify(old[f.key] ?? null)) throw new WorkflowError("FORBIDDEN", `Only heads and leads change "${f.label}".`);
    if (fieldRequired(f, category) && fieldEmpty(v)) throw new WorkflowError("VALIDATION", `Fill in "${f.label}" for a task that is ${statusLabel}.`);
    if (fieldEmpty(v)) delete out[f.key];
    else out[f.key] = v;
  }
  return out;
}

const STATUS_WORD: Record<StatusCategory, string> = { open: "not started", active: "in progress", review: "in review", done: "done", cancelled: "cancelled" };

function cleanValue(f: DeptField, v: FieldValue | undefined, people: string[]): FieldValue {
  if (v == null || v === "") return null;
  const bad = () => new WorkflowError("VALIDATION", `"${f.label}" is not valid.`);
  switch (f.type) {
    case "text":
    case "longtext": {
      const s = String(v).trim();
      return s ? s.slice(0, f.type === "text" ? 200 : 4000) : null;
    }
    case "url": {
      const s = String(v).trim();
      if (!s) return null;
      if (!/^https?:\/\/\S+$/i.test(s)) throw new WorkflowError("VALIDATION", `"${f.label}" must be a link starting with https://`);
      return s.slice(0, 500);
    }
    case "number":
    case "money": {
      const n = Number(v);
      if (!Number.isFinite(n)) throw bad();
      return n;
    }
    case "rating": {
      const n = Math.round(Number(v));
      if (!(n >= 1 && n <= 5)) throw bad();
      return n;
    }
    case "date":
      if (!DATE.test(String(v))) throw bad();
      return String(v);
    case "checkbox":
      return v === true || v === "true" || v === 1 ? true : null;
    case "select":
      if (!f.options.includes(String(v))) throw bad();
      return String(v);
    case "multiselect": {
      const list = (Array.isArray(v) ? v : String(v).split(/[;,]/)).map((x) => String(x).trim()).filter(Boolean);
      if (list.some((x) => !f.options.includes(x))) throw bad();
      return list.length ? [...new Set(list)] : null;
    }
    case "person":
      if (!people.includes(String(v))) throw new WorkflowError("VALIDATION", `"${f.label}" must be someone in this department.`);
      return String(v);
  }
}

// Checklist changes: anyone who edits the task ticks lines; lines marked "verify" are verified by a lead or the
// reviewer. Unticking a line clears its verification.
function cleanChecklist(a: WorkAccess, user: AppUser, reviewerId: string | null, input: TaskCheck[] | undefined, old: TaskCheck[]): TaskCheck[] {
  if (!input) return old;
  const canVerify = a.rights.editAll || reviewerId === user.id;
  return input.slice(0, 40).map((x) => {
    const before = old.find((o) => o.id === x.id);
    const text = String(x.text ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!text) throw new WorkflowError("VALIDATION", "A checklist line is empty.");
    const verify = before ? before.verify || (!!x.verify && canVerify) : !!x.verify && canVerify;
    if (before?.verify && !x.verify && !canVerify) throw new WorkflowError("FORBIDDEN", "Only a lead or the reviewer removes a line that needs verifying.");
    const done = !!x.done;
    let verifiedBy = done ? (before?.verifiedBy ?? null) : null;
    if (done && x.verifiedBy && !before?.verifiedBy) {
      if (!canVerify) throw new WorkflowError("FORBIDDEN", "Only a lead or the reviewer verifies checklist lines.");
      verifiedBy = user.id;
    }
    if (done && !x.verifiedBy) verifiedBy = null;
    return { id: before?.id ?? (typeof x.id === "string" && /^chk_[a-z0-9]+$/.test(x.id) ? x.id : uid("chk_")), text, verify, done, doneBy: done ? (before?.done ? before.doneBy : user.id) : null, verifiedBy };
  });
}

const fromLines = (lines: { text: string; verify: boolean }[]): TaskCheck[] => lines.map((l) => ({ id: uid("chk_"), text: l.text, verify: l.verify, done: false, doneBy: null, verifiedBy: null }));

// What must hold before a task may change status. Throws a plain message naming what is missing.
async function gate(a: WorkAccess, user: AppUser, t: { id: string; code: string; type: string; status: string; reviewer_id: string | null; checklist: TaskCheck[]; fields: Record<string, FieldValue>; blocked_by?: string[] }, to: string) {
  const cfg = a.config;
  if (t.status === to) return;
  const from = statusOf(cfg, t.status);
  const target = statusOf(cfg, to);
  if (!target) throw new WorkflowError("VALIDATION", "Unknown status.");
  if (from?.restricted && !a.rights.restricted) throw new WorkflowError("FORBIDDEN", `Only people with the right can move tasks out of ${from.label}.`);
  if (cfg.features.review) {
    if (from?.category === "review" && target.category !== "review" && target.category !== "cancelled" && t.reviewer_id !== user.id && !a.rights.editAll)
      throw new WorkflowError("FORBIDDEN", `${t.code} is waiting for its reviewer. The reviewer (or a lead) approves it or sends it back.`);
    if (target.category === "review" && !t.reviewer_id) throw new WorkflowError("VALIDATION", `Choose a reviewer for ${t.code} before moving it to ${target.label}.`);
  }
  const missing = cfg.fields.find((f) => fieldShown(f, t.type) && fieldRequired(f, target.category) && fieldEmpty(t.fields[f.key]));
  if (missing) throw new WorkflowError("VALIDATION", `Fill in "${missing.label}" before moving ${t.code} to ${target.label}. Open the task to add it.`);
  if (target.category === "done") {
    if (cfg.features.checklists) {
      const open = t.checklist.filter((c) => !c.done);
      if (open.length) throw new WorkflowError("VALIDATION", `${t.code} has ${open.length} unticked checklist line${open.length === 1 ? "" : "s"}, for example "${open[0]!.text}".`);
      const unverified = t.checklist.find((c) => c.verify && !c.verifiedBy);
      if (unverified) throw new WorkflowError("VALIDATION", `"${unverified.text}" on ${t.code} needs verifying by a lead or the reviewer.`);
    }
    if (cfg.features.subtasks) {
      const n = Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM dept_tasks WHERE parent_id = ? AND status_category IN (${OPEN_SQL})`, t.id))?.n ?? 0);
      if (n) throw new WorkflowError("VALIDATION", `Finish the ${n} open subtask${n === 1 ? "" : "s"} of ${t.code} first.`);
    }
  }
  if (cfg.features.dependencies && target.category !== "open" && target.category !== "cancelled") {
    const blockers = await all<{ code: string; status_category: string }>(
      "SELECT b.code, b.status_category FROM dept_task_links l JOIN dept_tasks b ON b.id = l.blocked_by WHERE l.task_id = ? AND b.status_category NOT IN ('done','cancelled')",
      t.id,
    );
    if (blockers.length) throw new WorkflowError("VALIDATION", `${t.code} is blocked by ${blockers.map((b) => b.code).join(", ")}. Finish ${blockers.length === 1 ? "it" : "them"} first.`);
  }
}

// Replaces what blocks a task. Blockers are tasks of the same department; a loop (A waits for B waits for A) is refused.
async function setBlockers(dp: WorkDept, id: string, code: string, ids: string[]) {
  const want = [...new Set(ids.filter((x) => x && x !== id))].slice(0, 20);
  if (want.length) {
    const found = await all<{ id: string }>(`SELECT id FROM dept_tasks WHERE dept = ? AND id IN (${placeholders(want.length)})`, dp, ...want);
    if (found.length !== want.length) throw new WorkflowError("VALIDATION", "A blocking task was not found in this department.");
    // Walk what each new blocker waits for; reaching this task would make a loop.
    const seen = new Set<string>();
    let frontier = [...want];
    while (frontier.length) {
      if (frontier.includes(id)) throw new WorkflowError("VALIDATION", `That would make ${code} wait for itself through a chain of blocks.`);
      frontier.forEach((x) => seen.add(x));
      frontier = (await all<{ blocked_by: string }>(`SELECT blocked_by FROM dept_task_links WHERE task_id IN (${placeholders(frontier.length)})`, ...frontier)).map((r) => r.blocked_by).filter((x) => !seen.has(x));
    }
  }
  await run("DELETE FROM dept_task_links WHERE task_id = ?", id);
  for (const b of want) await run("INSERT INTO dept_task_links (task_id, blocked_by) VALUES (?, ?) ON CONFLICT DO NOTHING", id, b);
}

export async function saveTask(user: AppUser, d: string, input: TaskInput, opts: { automations?: boolean } = {}) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  const cfg = a.config;
  const old = input.id ? await get<OldTask>("SELECT id, type, assignee_id, reporter_id, reviewer_id, project_id, parent_id, status, status_category, code, title, fields, checklist, recur, requested_by FROM dept_tasks WHERE id = ? AND dept = ?", input.id, dp) : null;
  if (input.id && !old) throw new WorkflowError("NOT_FOUND", "Task not found.");
  const template = !old && input.templateKey ? cfg.templates.find((x) => x.key === input.templateKey) : undefined;
  const title = (input.title || template?.title || "").replace(/\s+/g, " ").trim();
  if (!title) throw new WorkflowError("VALIDATION", `Give the ${cfg.names.task.toLowerCase()} a title.`);
  // A key that is switched off stays valid on tasks that already have it.
  const pick = <T extends { key: string; active: boolean }>(items: T[], v: string | undefined, current: string | undefined) => (v && items.some((i) => i.key === v && (i.active || i.key === current)) ? v : null);
  const firstOpen = cfg.statuses.find((s) => s.active && s.category === "open") ?? cfg.statuses.find((s) => s.active)!;
  const type = pick(cfg.types, input.type ?? template?.type, old?.type) ?? old?.type ?? cfg.types.find((t) => t.active)!.key;
  const status = pick(cfg.statuses, input.status, old?.status) ?? (old ? old.status : firstOpen.key);
  const priority =
    pick(cfg.priorities, input.priority ?? template?.priority, undefined) ?? cfg.priorities.find((p) => p.key === "normal" && p.active)?.key ?? cfg.priorities.find((p) => p.active)!.key;
  const category = categoryOf(cfg, status);
  const people = (await deptPeople(dp)).map((p) => p.id);
  if (input.assigneeId && input.assigneeId !== user.id && !a.rights.assign && input.assigneeId !== old?.assignee_id) throw new WorkflowError("FORBIDDEN", "You can assign tasks only to yourself here.");
  if (input.assigneeId && !people.includes(input.assigneeId)) throw new WorkflowError("VALIDATION", "The assignee is not in this department.");
  const reviewerId = input.reviewerId !== undefined ? input.reviewerId || null : (old?.reviewer_id ?? null);
  if (reviewerId && !people.includes(reviewerId)) throw new WorkflowError("VALIDATION", "The reviewer is not in this department.");
  if (input.projectId && !(await get("SELECT 1 AS x FROM dept_projects WHERE id = ? AND dept = ?", input.projectId, dp))) throw new WorkflowError("VALIDATION", `Unknown ${cfg.names.project.toLowerCase()}.`);
  if (input.milestoneId && !(await get("SELECT 1 AS x FROM dept_milestones WHERE id = ? AND project_id = ?", input.milestoneId, input.projectId ?? "")))
    throw new WorkflowError("VALIDATION", `The ${cfg.names.milestone.toLowerCase()} is not in that ${cfg.names.project.toLowerCase()}.`);
  const parentId = input.parentId !== undefined ? input.parentId || null : (old?.parent_id ?? null);
  if (parentId) {
    const parent = await get<{ parent_id: string | null }>("SELECT parent_id FROM dept_tasks WHERE id = ? AND dept = ?", parentId, dp);
    if (!parent || parentId === input.id) throw new WorkflowError("VALIDATION", "The parent task was not found.");
    if (parent.parent_id) throw new WorkflowError("VALIDATION", "Subtasks cannot have their own subtasks.");
    if (input.id && (await get("SELECT 1 AS x FROM dept_tasks WHERE parent_id = ?", input.id))) throw new WorkflowError("VALIDATION", "A task with subtasks cannot become a subtask.");
  }
  const sprintId = input.sprintId !== undefined ? input.sprintId || null : undefined;
  if (sprintId && !(await get("SELECT 1 AS x FROM dept_sprints WHERE id = ? AND dept = ?", sprintId, dp))) throw new WorkflowError("VALIDATION", "Unknown sprint.");
  const recur = input.recur !== undefined ? (RECURRENCES.some((r) => r.key === input.recur) ? input.recur! : null) : (old?.recur ?? null);
  const now = nowIso();
  const progress = category === "done" ? 100 : Math.max(0, Math.min(100, Math.round(input.progress ?? 0)));
  const labels = JSON.stringify([...new Set((input.labels ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean))].slice(0, 12));
  const estimate = input.estimateHours ?? template?.estimate ?? null;

  if (input.id && old) {
    if (!a.rights.editAll && !own(user, old)) throw new WorkflowError("FORBIDDEN", "You can change only your own tasks.");
    if (!a.rights.assign && (input.assigneeId ?? null) !== old.assignee_id && input.assigneeId !== user.id) throw new WorkflowError("FORBIDDEN", "You cannot reassign tasks to other people here.");
    const fields = cleanFields(a, people, type, category, input.fields, parseJson(old.fields, {}));
    const checklist = cleanChecklist(a, user, reviewerId, input.checklist, parseJson(old.checklist, []));
    if (input.blockedBy && cfg.features.dependencies) await setBlockers(dp, old.id, old.code, input.blockedBy);
    await gate(a, user, { id: old.id, code: old.code, type, status: old.status, reviewer_id: reviewerId, checklist, fields }, status);
    const code = (input.projectId ?? null) !== old.project_id ? await nextCode(dp, cfg, input.projectId ?? null) : old.code;
    await run(
      `UPDATE dept_tasks SET code = ?, title = ?, description = ?, type = ?, status = ?, status_category = ?, priority = ?, project_id = ?, milestone_id = ?, assignee_id = ?, reviewer_id = ?,
         parent_id = ?, sprint_id = COALESCE(?, CASE WHEN ? THEN NULL ELSE sprint_id END), recur = ?, estimate_hours = ?, spent_hours = ?, progress = ?, start_date = ?, due_date = ?, labels = ?,
         fields = ?, checklist = ?, updated_at = ?, completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, ?) ELSE NULL END WHERE id = ?`,
      code,
      title,
      input.description?.trim() || null,
      type,
      status,
      category,
      priority,
      input.projectId || null,
      input.milestoneId || null,
      input.assigneeId || null,
      reviewerId,
      parentId,
      sprintId ?? null,
      sprintId === null,
      recur,
      estimate,
      input.spentHours ?? null,
      progress,
      day(input.startDate),
      day(input.dueDate),
      labels,
      JSON.stringify(fields),
      JSON.stringify(checklist),
      now,
      category,
      now,
      input.id,
    );
    if (cfg.notify.assigned && input.assigneeId && input.assigneeId !== old.assignee_id && input.assigneeId !== user.id)
      await notify([input.assigneeId], { type: "assignment", title: `${code} was assigned to you`, body: title, link: `${deptPath(dp)}?task=${input.id}`, dedupeKey: `task-assign:${input.id}:${input.assigneeId}:${now}` }, now, user.id);
    if (reviewerId && reviewerId !== old.reviewer_id && reviewerId !== user.id && category === "review")
      await notify([reviewerId], { type: "approval", title: `${code} is waiting for your review`, body: title, link: `${deptPath(dp)}?task=${input.id}`, dedupeKey: `task-reviewer:${input.id}:${reviewerId}:${now}` }, now, user.id);
    await audit({ actor: user }, { itemId: input.id, action: `${dp}.task`, summary: `${user.name} updated ${code}${old.status !== status ? ` (${labelOf(cfg.statuses, old.status)} to ${labelOf(cfg.statuses, status)})` : ""}` });
    if (old.status !== status) await afterStatusChange(user, a, dp, input.id, old.status, status, now, opts.automations !== false);
    return input.id;
  }

  const checklist = cfg.features.checklists ? (input.checklist ? cleanChecklist(a, user, reviewerId, input.checklist, []) : fromLines([...(cfg.types.find((x) => x.key === type)?.checklist ?? []), ...(template?.checklist ?? [])])) : [];
  const fields = cleanFields(a, people, type, category, input.fields, {});
  await gate(a, user, { id: "", code: "This task", type, status: firstOpen.key, reviewer_id: reviewerId, checklist, fields }, status);
  const id = uid("tsk_");
  const code = await nextCode(dp, cfg, input.projectId ?? null);
  const top = Number((await get<{ n: number }>("SELECT COALESCE(MIN(sort), 0) - 1 AS n FROM dept_tasks WHERE dept = ? AND status = ?", dp, status))?.n ?? 0);
  await run(
    `INSERT INTO dept_tasks (id, dept, project_id, milestone_id, code, title, description, type, status, status_category, priority, assignee_id, reporter_id, reviewer_id, parent_id, sprint_id,
       recur, estimate_hours, spent_hours, progress, start_date, due_date, labels, fields, checklist, sort, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    dp,
    input.projectId || null,
    input.milestoneId || null,
    code,
    title,
    (input.description ?? template?.description)?.trim() || null,
    type,
    status,
    category,
    priority,
    input.assigneeId || null,
    user.id,
    reviewerId,
    parentId,
    sprintId ?? null,
    recur,
    estimate,
    input.spentHours ?? null,
    progress,
    day(input.startDate),
    day(input.dueDate),
    labels,
    JSON.stringify(fields),
    JSON.stringify(checklist),
    top,
    now,
    now,
    category === "done" ? now : null,
  );
  if (input.blockedBy?.length && cfg.features.dependencies) await setBlockers(dp, id, code, input.blockedBy);
  const subtasks = cfg.features.subtasks && !parentId ? (input.subtasks ?? template?.subtasks ?? []).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30) : [];
  for (const s of subtasks) await saveTask(user, dp, { title: s, type, parentId: id, projectId: input.projectId ?? null, milestoneId: input.milestoneId ?? null, assigneeId: input.assigneeId ?? null, sprintId: sprintId ?? null }, { automations: false });
  if (cfg.notify.assigned && input.assigneeId && input.assigneeId !== user.id)
    await notify([input.assigneeId], { type: "assignment", title: `${code} was assigned to you`, body: title, link: `${deptPath(dp)}?task=${id}`, dedupeKey: `task-assign:${id}:${input.assigneeId}` }, now, user.id);
  await audit({ actor: user }, { itemId: id, action: `${dp}.task`, summary: `${user.name} created ${code} ${title}` });
  if (opts.automations !== false) await runAutomations(user, a, dp, id, "created", now);
  if (category !== "open") await afterStatusChange(user, a, dp, id, firstOpen.key, status, now, opts.automations !== false);
  return id;
}

// Everyone who follows a task: its creator, assignee, reviewer and watchers.
async function followers(taskId: string) {
  const t = await get<{ reporter_id: string | null; assignee_id: string | null; reviewer_id: string | null }>("SELECT reporter_id, assignee_id, reviewer_id FROM dept_tasks WHERE id = ?", taskId);
  const w = await all<{ user_id: string }>("SELECT user_id FROM dept_task_watchers WHERE task_id = ?", taskId);
  return { reporter: t?.reporter_id ?? null, assignee: t?.assignee_id ?? null, reviewer: t?.reviewer_id ?? null, watchers: w.map((x) => x.user_id) };
}

// After a status change: notices, the requester's update, the next copy of a recurring task, the parent's progress
// and its "all subtasks done" automations, and this task's automations.
async function afterStatusChange(user: AppUser, a: WorkAccess, dp: WorkDept, id: string, from: string, to: string, now: string, automations = true) {
  if (from === to) return;
  const t = await get<{ code: string; title: string; type: string; parent_id: string | null; recur: string | null; requested_by: string | null; reviewer_id: string | null; due_date: string | null; start_date: string | null }>(
    "SELECT code, title, type, parent_id, recur, requested_by, reviewer_id, due_date, start_date FROM dept_tasks WHERE id = ?",
    id,
  );
  if (!t) return;
  const label = labelOf(a.config.statuses, to);
  const category = categoryOf(a.config, to);
  const link = `${deptPath(dp)}?task=${id}`;
  const f = await followers(id);
  const tell = [...f.watchers, ...(a.config.notify.statusToReporter && f.reporter ? [f.reporter] : [])];
  if (tell.length) await notify(tell, { type: "handoff", title: `${t.code} is now ${label}`, body: t.title, link, groupKey: `task:${id}` }, now, user.id);
  if (category === "review") {
    if (t.reviewer_id) await notify([t.reviewer_id], { type: "approval", title: `${t.code} is waiting for your review`, body: t.title, link, dedupeKey: `task-review:${id}:${now}` }, now, user.id);
    if (a.config.notify.reviewToManagers) await notify(await deptManagers(dp), { type: "approval", title: `${t.code} is waiting for review`, body: t.title, link, dedupeKey: `task-review-m:${id}:${now}` }, now, user.id);
  }
  if (t.requested_by && (category === "done" || category === "cancelled"))
    await notify([t.requested_by], { type: "handoff", title: `Your request ${t.code} is ${label.toLowerCase()}`, body: t.title, link: `/requests`, dedupeKey: `request-end:${id}:${to}` }, now, user.id);
  // The next one of a recurring task, due one period after this one.
  if (category === "done" && t.recur && a.config.features.recurring) {
    const r = RECURRENCES.find((x) => x.key === t.recur);
    if (r) {
      const shift = (iso: string | null) => {
        if (!iso) return null;
        const dt = new Date(`${iso}T00:00:00Z`);
        if ("months" in r) dt.setUTCMonth(dt.getUTCMonth() + r.months);
        else dt.setUTCDate(dt.getUTCDate() + r.days);
        return dt.toISOString().slice(0, 10);
      };
      const src = await get<OldTask & { project_id: string | null; milestone_id: string | null; priority: string; description: string | null; estimate_hours: number | null; labels: string; sprint_id: string | null }>(
        "SELECT * FROM dept_tasks WHERE id = ?",
        id,
      );
      const firstOpen = a.config.statuses.find((s) => s.active && s.category === "open")!;
      const nextId = uid("tsk_");
      const code = await nextCode(dp, a.config, src!.project_id);
      const checklist = parseJson<TaskCheck[]>(src!.checklist, []).map((c) => ({ ...c, id: uid("chk_"), done: false, doneBy: null, verifiedBy: null }));
      await run(
        `INSERT INTO dept_tasks (id, dept, project_id, milestone_id, code, title, description, type, status, status_category, priority, assignee_id, reporter_id, reviewer_id, recur,
           estimate_hours, progress, start_date, due_date, labels, fields, checklist, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?, ?)`,
        nextId,
        dp,
        src!.project_id,
        src!.milestone_id,
        code,
        src!.title,
        src!.description,
        src!.type,
        firstOpen.key,
        firstOpen.category,
        src!.priority,
        src!.assignee_id,
        src!.reporter_id,
        src!.reviewer_id,
        t.recur,
        src!.estimate_hours,
        shift(t.start_date),
        shift(t.due_date) ?? shift(now.slice(0, 10)),
        src!.labels,
        src!.fields,
        JSON.stringify(checklist),
        now,
        now,
      );
      await run("UPDATE dept_tasks SET recur = NULL WHERE id = ?", id);
      await audit({ actor: user }, { itemId: nextId, action: `${dp}.task`, summary: `${code} created as the next ${r.label.toLowerCase()} after ${t.code}` });
    }
  }
  // The parent follows its subtasks: progress, and its automations once every subtask is done.
  if (t.parent_id) {
    const c = await get<{ total: number; done: number }>(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status_category = 'done' THEN 1 ELSE 0 END) AS done FROM dept_tasks WHERE parent_id = ? AND status_category <> 'cancelled'",
      t.parent_id,
    );
    const total = Number(c?.total ?? 0);
    const done = Number(c?.done ?? 0);
    if (total) await run("UPDATE dept_tasks SET progress = ?, updated_at = ? WHERE id = ? AND status_category NOT IN ('done','cancelled')", Math.round((done / total) * 100), now, t.parent_id);
    if (automations && total && done === total && category === "done") await runAutomations(user, a, dp, t.parent_id, "subtasks_done", now);
  }
  if (automations) await runAutomations(user, a, dp, id, "status", now);
}

// The department's when-then rules. They run once per event and do not set off further automations.
async function runAutomations(user: AppUser, a: WorkAccess, dp: WorkDept, id: string, when: "created" | "status" | "subtasks_done", now: string) {
  const t = await get<{ code: string; title: string; type: string; status: string; reporter_id: string | null; assignee_id: string | null }>(
    "SELECT code, title, type, status, reporter_id, assignee_id FROM dept_tasks WHERE id = ?",
    id,
  );
  if (!t) return;
  const rules = a.config.automations.filter((r) => r.active && r.when === when && (when !== "status" || r.status === t.status) && (!r.type || r.type === t.type));
  if (!rules.length) return;
  const people = (await deptPeople(dp)).map((p) => p.id);
  const link = `${deptPath(dp)}?task=${id}`;
  for (const rule of rules) {
    for (const act of rule.actions) {
      const cur = await get<{ assignee_id: string | null; reporter_id: string | null; status: string }>("SELECT assignee_id, reporter_id, status FROM dept_tasks WHERE id = ?", id);
      if (!cur) return;
      if (act.do === "assign" && act.value && people.includes(act.value)) {
        await run("UPDATE dept_tasks SET assignee_id = ?, updated_at = ? WHERE id = ?", act.value, now, id);
        if (act.value !== user.id) await notify([act.value], { type: "assignment", title: `${t.code} was assigned to you`, body: t.title, link, dedupeKey: `task-assign:${id}:${act.value}:${now}` }, now, user.id);
      } else if (act.do === "priority" && act.value) await run("UPDATE dept_tasks SET priority = ?, updated_at = ? WHERE id = ?", act.value, now, id);
      else if (act.do === "status" && act.value && act.value !== cur.status) {
        const s = statusOf(a.config, act.value);
        if (s)
          await run(
            "UPDATE dept_tasks SET status = ?, status_category = ?, updated_at = ?, progress = CASE WHEN ? = 'done' THEN 100 ELSE progress END, completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, ?) ELSE NULL END WHERE id = ?",
            s.key,
            s.category,
            now,
            s.category,
            s.category,
            now,
            id,
          );
      } else if (act.do === "progress" && act.value) await run("UPDATE dept_tasks SET progress = ?, updated_at = ? WHERE id = ?", Math.max(0, Math.min(100, Math.round(Number(act.value) || 0))), now, id);
      else if (act.do === "notify_reporter" && cur.reporter_id) await notify([cur.reporter_id], { type: "handoff", title: `${t.code}: ${rule.label}`, body: t.title, link, groupKey: `task:${id}` }, now, user.id);
      else if (act.do === "notify_assignee" && cur.assignee_id) await notify([cur.assignee_id], { type: "handoff", title: `${t.code}: ${rule.label}`, body: t.title, link, groupKey: `task:${id}` }, now, user.id);
      else if (act.do === "notify_managers") await notify(await deptManagers(dp), { type: "handoff", title: `${t.code}: ${rule.label}`, body: t.title, link, groupKey: `task:${id}` }, now, user.id);
    }
    await audit({ actor: user }, { itemId: id, action: `${dp}.automation`, summary: `Automation "${rule.label}" ran on ${t.code}` });
  }
}

// Board moves: a new status and position. Without the right to edit everyone's tasks, people move only their own.
export async function moveTask(user: AppUser, d: string, id: string, status: string, beforeId: string | null) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  const s = statusOf(a.config, status);
  if (!s || !s.active) throw new WorkflowError("VALIDATION", "Unknown status.");
  const t = await get<OldTask>("SELECT id, type, assignee_id, reporter_id, reviewer_id, project_id, parent_id, status, status_category, code, title, fields, checklist, recur, requested_by FROM dept_tasks WHERE id = ? AND dept = ?", id, dp);
  if (!t) throw new WorkflowError("NOT_FOUND", "Task not found.");
  if (!a.rights.editAll && !own(user, t)) throw new WorkflowError("FORBIDDEN", "You can move only your own tasks.");
  if (t.status !== status) {
    await gate(a, user, { id, code: t.code, type: t.type, status: t.status, reviewer_id: t.reviewer_id, checklist: parseJson(t.checklist, []), fields: parseJson(t.fields, {}) }, status);
    if (s.limit) {
      const n = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_tasks WHERE dept = ? AND status = ?", dp, status))?.n ?? 0);
      const word = (n === 1 ? a.config.names.task : a.config.names.tasks).toLowerCase();
      if (n >= s.limit) throw new WorkflowError("VALIDATION", `${s.label} already has ${n} ${word} (limit ${s.limit}). Finish or move one first.`);
    }
  }
  let sort: number;
  if (beforeId) {
    const b = await get<{ sort: number }>("SELECT sort FROM dept_tasks WHERE id = ?", beforeId);
    const prev = await get<{ sort: number }>("SELECT MAX(sort) AS sort FROM dept_tasks WHERE dept = ? AND status = ? AND sort < ? AND id <> ?", dp, status, b?.sort ?? 0, id);
    sort = prev?.sort != null ? (Number(prev.sort) + Number(b!.sort)) / 2 : Number(b?.sort ?? 0) - 1;
  } else sort = Number((await get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM dept_tasks WHERE dept = ? AND status = ?", dp, status))?.n ?? 0);
  const now = nowIso();
  await run(
    "UPDATE dept_tasks SET status = ?, status_category = ?, sort = ?, updated_at = ?, progress = CASE WHEN ? = 'done' THEN 100 ELSE progress END, completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, ?) ELSE NULL END WHERE id = ?",
    status,
    s.category,
    sort,
    now,
    s.category,
    s.category,
    now,
    id,
  );
  if (t.status !== status) {
    await audit({ actor: user }, { itemId: id, action: `${dp}.task`, summary: `${user.name} moved ${t.code} to ${s.label}` });
    await afterStatusChange(user, a, dp, id, t.status, status, now);
  }
}

// The reviewer (or a lead) approves a task in review, moving it to the first Done status, or sends it back to the
// first In progress status with a note.
export async function reviewTask(user: AppUser, d: string, id: string, decision: "approve" | "send_back", note?: string | null) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  const t = await get<{ code: string; reviewer_id: string | null; status_category: string; assignee_id: string | null }>("SELECT code, reviewer_id, status_category, assignee_id FROM dept_tasks WHERE id = ? AND dept = ?", id, dp);
  if (!t) throw new WorkflowError("NOT_FOUND", "Task not found.");
  if (t.status_category !== "review") throw new WorkflowError("INVALID_STATE", `${t.code} is not waiting for review.`);
  if (t.reviewer_id !== user.id && !a.rights.editAll) throw new WorkflowError("FORBIDDEN", "Only the reviewer or a lead decides.");
  if (decision === "send_back" && !note?.trim()) throw new WorkflowError("VALIDATION", "Say what needs changing.");
  const to =
    decision === "approve"
      ? a.config.statuses.find((s) => s.active && s.category === "done")
      : (a.config.statuses.find((s) => s.active && s.category === "active") ?? a.config.statuses.find((s) => s.active && s.category === "open"));
  if (!to) throw new WorkflowError("INVALID_STATE", "No status to move to.");
  if (note?.trim()) await addTaskComment(user, dp, id, `${decision === "approve" ? "Approved" : "Sent back"}: ${note.trim()}`);
  await moveTask(user, dp, id, to.key, null);
  if (decision === "send_back" && t.assignee_id && t.assignee_id !== user.id)
    await notify([t.assignee_id], { type: "handoff", title: `${t.code} was sent back`, body: note ?? undefined, link: `${deptPath(dp)}?task=${id}`, dedupeKey: `task-back:${id}:${nowIso()}` }, nowIso(), user.id);
}

export async function bulkTasks(user: AppUser, d: string, ids: string[], patch: { status?: string; assigneeId?: string | null; priority?: string; projectId?: string | null; dueDate?: string | null; sprintId?: string | null; delete?: boolean }) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids.slice(0, 500)) {
    try {
      const t = (await withLinks((await all<TaskRow>(`${TASK_SELECT} WHERE t.id = ? AND t.dept = ?`, id, dp))))[0];
      if (!t) throw new WorkflowError("NOT_FOUND", "Task not found.");
      if (patch.delete) {
        if (!a.rights.deleteAll && t.reporter_id !== user.id) throw new WorkflowError("FORBIDDEN", "You can delete only tasks you created.");
        await run("UPDATE dept_tasks SET parent_id = NULL WHERE parent_id = ?", id);
        await run("DELETE FROM dept_tasks WHERE id = ?", id);
        await audit({ actor: user }, { itemId: id, action: `${dp}.task`, summary: `${user.name} deleted ${t.code} ${t.title}` });
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
          sprintId: patch.sprintId !== undefined ? patch.sprintId : undefined,
          estimateHours: t.estimate_hours,
          spentHours: t.spent_hours,
          progress: t.progress,
          startDate: t.start_date,
          dueDate: patch.dueDate !== undefined ? patch.dueDate : t.due_date,
          labels: t.labels,
        });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

// CSV import: one task per row. Columns: title, description, type, status, priority, assignee_email (or assignee by
// name), project_key, due_date, start_date, estimate_hours, labels, parent (a task code), and one column per custom
// field (its key). Types, statuses and priorities may be given by key or by label.
export async function importTasks(user: AppUser, d: string, rows: Record<string, string>[]) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  const people = await deptPeople(dp);
  const projects = await all<{ id: string; key: string }>("SELECT id, key FROM dept_projects WHERE dept = ?", dp);
  const byKeyOrLabel = (items: { key: string; label: string }[], v: string | undefined) => {
    const s = (v ?? "").trim().toLowerCase();
    return s ? (items.find((i) => i.key === s || i.label.toLowerCase() === s)?.key ?? s) : undefined;
  };
  const out = { created: 0, errors: [] as string[] };
  for (const [i, r] of rows.slice(0, 1000).entries()) {
    try {
      // The assignee by email (assignee_email) or by name or email (assignee).
      const who = (r.assignee_email || r.assignee || "").trim().toLowerCase();
      const assignee = who ? people.find((p) => p.email.toLowerCase() === who || p.name.toLowerCase() === who) : undefined;
      if (who && !assignee) throw new Error(`${who} is not in this department`);
      const pk = (r.project_key ?? "").trim().toUpperCase();
      const project = pk ? projects.find((p) => p.key === pk) : undefined;
      if (pk && !project) throw new Error(`unknown ${a.config.names.project.toLowerCase()} ${pk}`);
      const parentCode = (r.parent ?? "").trim().toUpperCase();
      const parent = parentCode ? await get<{ id: string }>("SELECT id FROM dept_tasks WHERE dept = ? AND code = ?", dp, parentCode) : undefined;
      if (parentCode && !parent) throw new Error(`unknown parent ${parentCode}`);
      const fields: Record<string, FieldValue> = {};
      for (const f of a.config.fields) {
        const v = r[f.key];
        if (v == null || v === "") continue;
        fields[f.key] = f.type === "person" ? (people.find((p) => p.email.toLowerCase() === v.trim().toLowerCase() || p.name.toLowerCase() === v.trim().toLowerCase())?.id ?? v) : f.type === "checkbox" ? /^(1|yes|true|y)$/i.test(v.trim()) : v;
      }
      await saveTask(user, dp, {
        title: r.title ?? "",
        description: r.description || null,
        type: byKeyOrLabel(a.config.types, r.type),
        status: byKeyOrLabel(a.config.statuses, r.status),
        priority: byKeyOrLabel(a.config.priorities, r.priority),
        projectId: project?.id ?? null,
        parentId: parent?.id ?? null,
        assigneeId: assignee?.id ?? null,
        dueDate: r.due_date || null,
        startDate: r.start_date || null,
        estimateHours: r.estimate_hours ? Number(r.estimate_hours) : null,
        labels: (r.labels ?? "").split(/[;,]/),
        fields,
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

async function taskFor(a: WorkAccess, user: AppUser, taskId: string, write: boolean) {
  const t = await get<{ code: string; title: string; assignee_id: string | null; reporter_id: string | null; reviewer_id: string | null; requested_by: string | null }>(
    "SELECT code, title, assignee_id, reporter_id, reviewer_id, requested_by FROM dept_tasks WHERE id = ? AND dept = ?",
    taskId,
    a.dept,
  );
  if (!t) throw new WorkflowError("NOT_FOUND", "Task not found.");
  if (!(write ? a.rights.editAll : a.rights.seeAll) && !own(user, t)) throw new WorkflowError("FORBIDDEN", "Not your task.");
  return t;
}

export async function taskComments(user: AppUser, d: string, taskId: string) {
  const a = await workAccess(user, await dept(d));
  await taskFor(a, user, taskId, false);
  return all<{ id: string; author_id: string; author_name: string; body: string; created_at: string }>(
    "SELECT c.id, c.author_id, u.name AS author_name, c.body, c.created_at FROM dept_task_comments c JOIN users u ON u.id = c.author_id WHERE c.task_id = ? ORDER BY c.created_at",
    taskId,
  );
}

// Comments notify the creator, assignee, reviewer and watchers, and anyone @mentioned by handle in the department.
export async function addTaskComment(user: AppUser, d: string, taskId: string, body: string) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  if (!body.trim()) throw new WorkflowError("VALIDATION", "Write a comment.");
  const t = await taskFor(a, user, taskId, true);
  const now = nowIso();
  await run("INSERT INTO dept_task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("tcm_"), taskId, user.id, body.trim().slice(0, 4000), now);
  await run("UPDATE dept_tasks SET updated_at = ? WHERE id = ?", now, taskId);
  const link = `${deptPath(dp)}?task=${taskId}`;
  const handles = [...body.matchAll(/@([a-z0-9._-]+)/gi)].map((m) => m[1]!.toLowerCase().replace(/\.$/, ""));
  const ids = (await deptPeople(dp)).map((p) => p.id);
  const mentioned = handles.length && ids.length ? (await all<{ id: string }>(`SELECT id FROM users WHERE lower(handle) IN (${placeholders(handles.length)}) AND id IN (${placeholders(ids.length)})`, ...handles, ...ids)).map((r) => r.id) : [];
  if (mentioned.length) await notify(mentioned, { type: "mention", title: `${user.name} mentioned you on ${t.code}`, body: body.slice(0, 140), link, dedupeKey: `task-mention:${taskId}:${now}` }, now, user.id);
  if (a.config.notify.comments) {
    const f = await followers(taskId);
    const rest = [f.assignee, f.reporter, f.reviewer, ...f.watchers].filter((x): x is string => !!x && !mentioned.includes(x));
    await notify(rest, { type: "mention", title: `${user.name} commented on ${t.code}`, body: body.slice(0, 140), link, groupKey: `task:${taskId}` }, now, user.id);
  }
}

export async function listMetrics(user: AppUser, d: string, projectId: string) {
  const dp = await dept(d);
  await workAccess(user, dp);
  return all<{ id: string; metric: string; value: number; recorded_on: string; note: string | null; created_by_name: string | null }>(
    "SELECT m.id, m.metric, m.value, m.recorded_on, m.note, u.name AS created_by_name FROM dept_metrics m JOIN dept_projects p ON p.id = m.project_id LEFT JOIN users u ON u.id = m.created_by WHERE m.project_id = ? AND p.dept = ? ORDER BY m.recorded_on DESC, m.created_at DESC",
    projectId,
    dp,
  );
}

export async function addMetric(user: AppUser, d: string, input: { projectId: string; metric: string; value: number; recordedOn: string; note?: string | null }) {
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  need(a, "kpis", "You cannot record KPI results here.");
  if (!a.config.kpis.some((m) => m.key === input.metric && m.active)) throw new WorkflowError("VALIDATION", "Choose a KPI.");
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
  const dp = await dept(d);
  const a = await workAccess(user, dp, "write");
  need(a, "projects", "You cannot delete KPI results here.");
  await run("DELETE FROM dept_metrics WHERE id = ? AND project_id IN (SELECT id FROM dept_projects WHERE dept = ?)", id, dp);
}

// ---------------------------------------------------------------------------
// Saved views: a named URL (tab, filters, columns, grouping, swimlanes). Private, or shared with the department by
// people who assign or configure.
// ---------------------------------------------------------------------------

export type DeptView = { id: string; name: string; query: string; shared: boolean; mine: boolean };

// Who may share and remove shared views: in work departments by rights, in Studio its heads and leads.
async function viewAccess(user: AppUser, d: string) {
  if (d === "studio") {
    const a = await deptAccess(user, "studio");
    if (!a.view) throw new WorkflowError("FORBIDDEN", "You do not have access to Studio.");
    return { dp: "studio", share: a.manage && !a.readOnly, configure: a.manage && !a.readOnly };
  }
  const dp = await dept(d);
  const a = await workAccess(user, dp);
  return { dp, share: a.rights.assign || a.rights.configure, configure: a.rights.configure };
}

export async function deptViews(user: AppUser, d: string): Promise<DeptView[]> {
  const { dp } = await viewAccess(user, d);
  const rows = await all<{ id: string; name: string; query: string; shared: number; owner_id: string }>(
    "SELECT id, name, query, shared, owner_id FROM saved_views WHERE page = ? AND (owner_id = ? OR shared = 1) ORDER BY shared DESC, lower(name)",
    `dept:${dp}`,
    user.id,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, query: r.query, shared: !!r.shared, mine: r.owner_id === user.id }));
}

export async function saveDeptView(user: AppUser, d: string, input: { name: string; query: string; shared: boolean }) {
  const { dp, share } = await viewAccess(user, d);
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) throw new WorkflowError("VALIDATION", "Name the view.");
  if (input.shared && !share) throw new WorkflowError("FORBIDDEN", "Only heads and leads share views with the department.");
  const query = input.query.replace(/^\?/, "").slice(0, 2000);
  // Saving under an existing name of yours replaces that view.
  const same = await get<{ id: string }>("SELECT id FROM saved_views WHERE page = ? AND owner_id = ? AND lower(name) = lower(?)", `dept:${dp}`, user.id, name);
  if (same) {
    await run("UPDATE saved_views SET query = ?, shared = ? WHERE id = ?", query, input.shared ? 1 : 0, same.id);
    return same.id;
  }
  const id = uid("sv_");
  await run("INSERT INTO saved_views (id, owner_id, name, page, query, config, shared, created_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)", id, user.id, name, `dept:${dp}`, query, input.shared ? 1 : 0, nowIso());
  return id;
}

export async function deleteDeptView(user: AppUser, d: string, id: string) {
  const { dp, configure } = await viewAccess(user, d);
  const v = await get<{ owner_id: string }>("SELECT owner_id FROM saved_views WHERE id = ? AND page = ?", id, `dept:${dp}`);
  if (!v) return;
  if (v.owner_id !== user.id && !configure) throw new WorkflowError("FORBIDDEN", "You can delete only your own views.");
  await run("DELETE FROM saved_views WHERE id = ?", id);
}
