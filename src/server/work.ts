// Dev and Marketing work: projects (campaigns), milestones, tasks, comments and KPI entries. Statuses, types,
// priorities, custom fields, names and who may do what come from the department's configuration (Configure tab).
// By default heads and leads see and assign everything; members see their own tasks and the projects they lead or
// have tasks in. Owners read everything.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { deptManagers, deptPeople } from "./departments";
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
} from "@/lib/dept-config";
import type { WorkDept } from "@/lib/work";

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
  const dp = dept(d);
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
  const dp = dept(d);
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
  const dp = dept(d);
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
  const dp = dept(d);
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
  const dp = dept(d);
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
  estimate_hours: number | null;
  spent_hours: number | null;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  labels: string[];
  fields: Record<string, FieldValue>;
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
  sort?: "updated" | "due" | "priority" | "code" | "title" | "status";
  dir?: "asc" | "desc";
};

// Orders by the configured order of priorities or statuses.
function rankSql(column: string, keys: string[]) {
  if (!keys.length) return "0";
  return `CASE ${column} ${keys.map((k, i) => `WHEN '${k.replace(/'/g, "''")}' THEN ${i}`).join(" ")} ELSE ${keys.length} END`;
}

export async function listTasks(user: AppUser, d: string, f: TaskFilter = {}): Promise<{ tasks: Task[]; access: WorkAccess }> {
  const dp = dept(d);
  const a = await workAccess(user, dp);
  const where = ["t.dept = ?"];
  const params: (string | number)[] = [dp];
  if (!a.rights.seeAll) {
    where.push("(t.assignee_id = ? OR t.reporter_id = ?)");
    params.push(user.id, user.id);
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
  const rows = await all<Task & { labels: string; fields: string }>(
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
      fields: parseJson<Record<string, FieldValue>>(r.fields, {}),
      progress: Number(r.progress),
      sort: Number(r.sort),
      comments: Number(r.comments),
      estimate_hours: r.estimate_hours == null ? null : Number(r.estimate_hours),
      spent_hours: r.spent_hours == null ? null : Number(r.spent_hours),
    })),
  };
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
  estimateHours?: number | null;
  spentHours?: number | null;
  progress?: number;
  startDate?: string | null;
  dueDate?: string | null;
  labels?: string[];
  fields?: Record<string, FieldValue>;
};

type OldTask = { assignee_id: string | null; reporter_id: string | null; project_id: string | null; status: string; code: string; title: string; fields: string };

const own = (user: AppUser, t: { assignee_id: string | null; reporter_id: string | null }) => t.assignee_id === user.id || t.reporter_id === user.id;

// Moving a task out of a restricted status needs the right to.
function checkStatusChange(a: WorkAccess, from: string, to: string) {
  if (from === to) return;
  const s = statusOf(a.config, from);
  if (s?.restricted && !a.rights.restricted) throw new WorkflowError("FORBIDDEN", `Only people with the right can move tasks out of ${s.label}.`);
}

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

export async function saveTask(user: AppUser, d: string, input: TaskInput) {
  const dp = dept(d);
  const a = await workAccess(user, dp, "write");
  const cfg = a.config;
  const title = input.title?.replace(/\s+/g, " ").trim();
  if (!title) throw new WorkflowError("VALIDATION", `Give the ${cfg.names.task.toLowerCase()} a title.`);
  const old = input.id
    ? await get<OldTask>("SELECT assignee_id, reporter_id, project_id, status, code, title, fields FROM dept_tasks WHERE id = ? AND dept = ?", input.id, dp)
    : null;
  if (input.id && !old) throw new WorkflowError("NOT_FOUND", "Task not found.");
  // A key that is switched off stays valid on tasks that already have it.
  const pick = <T extends { key: string; active: boolean }>(items: T[], v: string | undefined, current: string | undefined) =>
    v && items.some((i) => i.key === v && (i.active || i.key === current)) ? v : null;
  const firstOpen = cfg.statuses.find((s) => s.active && s.category === "open") ?? cfg.statuses.find((s) => s.active)!;
  const type = pick(cfg.types, input.type, undefined) ?? (old ? null : cfg.types.find((t) => t.active)!.key);
  const status = pick(cfg.statuses, input.status, old?.status) ?? (old ? old.status : firstOpen.key);
  const priority = pick(cfg.priorities, input.priority, undefined) ?? cfg.priorities.find((p) => p.key === "normal" && p.active)?.key ?? cfg.priorities.find((p) => p.active)!.key;
  const category = categoryOf(cfg, status);
  const people = (await deptPeople(dp)).map((p) => p.id);
  if (input.assigneeId && input.assigneeId !== user.id && !a.rights.assign && input.assigneeId !== old?.assignee_id)
    throw new WorkflowError("FORBIDDEN", "You can assign tasks only to yourself here.");
  if (input.assigneeId && !people.includes(input.assigneeId)) throw new WorkflowError("VALIDATION", "The assignee is not in this department.");
  if (input.projectId && !(await get("SELECT 1 AS x FROM dept_projects WHERE id = ? AND dept = ?", input.projectId, dp))) throw new WorkflowError("VALIDATION", `Unknown ${cfg.names.project.toLowerCase()}.`);
  if (input.milestoneId && !(await get("SELECT 1 AS x FROM dept_milestones WHERE id = ? AND project_id = ?", input.milestoneId, input.projectId ?? ""))) throw new WorkflowError("VALIDATION", `The ${cfg.names.milestone.toLowerCase()} is not in that ${cfg.names.project.toLowerCase()}.`);
  const now = nowIso();
  const progress = category === "done" ? 100 : Math.max(0, Math.min(100, Math.round(input.progress ?? 0)));
  const labels = JSON.stringify([...new Set((input.labels ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean))].slice(0, 12));
  if (input.id && old) {
    if (!a.rights.editAll && !own(user, old)) throw new WorkflowError("FORBIDDEN", "You can change only your own tasks.");
    if (!a.rights.assign && (input.assigneeId ?? null) !== old.assignee_id && input.assigneeId !== user.id) throw new WorkflowError("FORBIDDEN", "You cannot reassign tasks to other people here.");
    checkStatusChange(a, old.status, status);
    const realType = type ?? (await get<{ type: string }>("SELECT type FROM dept_tasks WHERE id = ?", input.id))!.type;
    const fields = cleanFields(a, people, realType, category, input.fields, parseJson(old.fields, {}));
    const code = (input.projectId ?? null) !== old.project_id ? await nextCode(dp, cfg, input.projectId ?? null) : old.code;
    await run(
      `UPDATE dept_tasks SET code = ?, title = ?, description = ?, type = ?, status = ?, status_category = ?, priority = ?, project_id = ?, milestone_id = ?, assignee_id = ?, estimate_hours = ?,
         spent_hours = ?, progress = ?, start_date = ?, due_date = ?, labels = ?, fields = ?, updated_at = ?, completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, ?) ELSE NULL END WHERE id = ?`,
      code,
      title,
      input.description?.trim() || null,
      realType,
      status,
      category,
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
      JSON.stringify(fields),
      now,
      category,
      now,
      input.id,
    );
    if (cfg.notify.assigned && input.assigneeId && input.assigneeId !== old.assignee_id && input.assigneeId !== user.id)
      await notify([input.assigneeId], { type: "assignment", title: `${code} was assigned to you`, body: title, link: `/${dp}?task=${input.id}`, dedupeKey: `task-assign:${input.id}:${input.assigneeId}:${now}` }, now, user.id);
    await afterStatusChange(user, a, dp, { id: input.id, code, title, reporter_id: old.reporter_id }, old.status, status, now);
    await audit({ actor: user }, { action: `${dp}.task`, summary: `${user.name} updated ${code}${old.status !== status ? ` (${labelOf(cfg.statuses, old.status)} to ${labelOf(cfg.statuses, status)})` : ""}` });
    return input.id;
  }
  const fields = cleanFields(a, people, type!, category, input.fields, {});
  const id = uid("tsk_");
  const code = await nextCode(dp, cfg, input.projectId ?? null);
  const top = Number((await get<{ n: number }>("SELECT COALESCE(MIN(sort), 0) - 1 AS n FROM dept_tasks WHERE dept = ? AND status = ?", dp, status))?.n ?? 0);
  await run(
    `INSERT INTO dept_tasks (id, dept, project_id, milestone_id, code, title, description, type, status, status_category, priority, assignee_id, reporter_id, estimate_hours, spent_hours,
       progress, start_date, due_date, labels, fields, sort, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    dp,
    input.projectId || null,
    input.milestoneId || null,
    code,
    title,
    input.description?.trim() || null,
    type,
    status,
    category,
    priority,
    input.assigneeId || null,
    user.id,
    input.estimateHours ?? null,
    input.spentHours ?? null,
    progress,
    day(input.startDate),
    day(input.dueDate),
    labels,
    JSON.stringify(fields),
    top,
    now,
    now,
    category === "done" ? now : null,
  );
  if (cfg.notify.assigned && input.assigneeId && input.assigneeId !== user.id)
    await notify([input.assigneeId], { type: "assignment", title: `${code} was assigned to you`, body: title, link: `/${dp}?task=${id}`, dedupeKey: `task-assign:${id}:${input.assigneeId}` }, now, user.id);
  if (category === "review" && cfg.notify.reviewToManagers) await afterStatusChange(user, a, dp, { id, code, title, reporter_id: user.id }, "", status, now);
  await audit({ actor: user }, { action: `${dp}.task`, summary: `${user.name} created ${code} ${title}` });
  return id;
}

// Notices the configuration asks for when a task changes status.
async function afterStatusChange(user: AppUser, a: WorkAccess, dp: WorkDept, t: { id: string; code: string; title: string; reporter_id: string | null }, from: string, to: string, now: string) {
  if (from === to) return;
  const label = labelOf(a.config.statuses, to);
  const link = `/${dp}?task=${t.id}`;
  if (a.config.notify.statusToReporter && t.reporter_id && t.reporter_id !== user.id)
    await notify([t.reporter_id], { type: "handoff", title: `${t.code} is now ${label}`, body: t.title, link, groupKey: `task:${t.id}` }, now, user.id);
  if (a.config.notify.reviewToManagers && categoryOf(a.config, to) === "review")
    await notify(await deptManagers(dp), { type: "approval", title: `${t.code} is waiting for review`, body: t.title, link, dedupeKey: `task-review:${t.id}:${now}` }, now, user.id);
}

// Board moves: a new status and position. Without the right to edit everyone's tasks, people move only their own.
export async function moveTask(user: AppUser, d: string, id: string, status: string, beforeId: string | null) {
  const dp = dept(d);
  const a = await workAccess(user, dp, "write");
  const s = statusOf(a.config, status);
  if (!s || !s.active) throw new WorkflowError("VALIDATION", "Unknown status.");
  const t = await get<OldTask & { type: string }>("SELECT assignee_id, reporter_id, project_id, status, code, title, fields, type FROM dept_tasks WHERE id = ? AND dept = ?", id, dp);
  if (!t) throw new WorkflowError("NOT_FOUND", "Task not found.");
  if (!a.rights.editAll && !own(user, t)) throw new WorkflowError("FORBIDDEN", "You can move only your own tasks.");
  checkStatusChange(a, t.status, status);
  if (t.status !== status) {
    // Required fields must be filled before the task reaches this status.
    const fields = parseJson<Record<string, FieldValue>>(t.fields, {});
    const missing = a.config.fields.find((f) => fieldShown(f, t.type) && fieldRequired(f, s.category) && fieldEmpty(fields[f.key]));
    if (missing) throw new WorkflowError("VALIDATION", `Fill in "${missing.label}" before moving ${t.code} to ${s.label}. Open the task to add it.`);
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
    await afterStatusChange(user, a, dp, { id, code: t.code, title: t.title, reporter_id: t.reporter_id }, t.status, status, now);
    await audit({ actor: user }, { action: `${dp}.task`, summary: `${user.name} moved ${t.code} to ${s.label}` });
  }
}

export async function bulkTasks(user: AppUser, d: string, ids: string[], patch: { status?: string; assigneeId?: string | null; priority?: string; projectId?: string | null; dueDate?: string | null; delete?: boolean }) {
  const dp = dept(d);
  const a = await workAccess(user, dp, "write");
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids.slice(0, 500)) {
    try {
      const t = await get<Omit<Task, "labels" | "fields"> & { labels: string; fields: string }>("SELECT * FROM dept_tasks WHERE id = ? AND dept = ?", id, dp);
      if (!t) throw new WorkflowError("NOT_FOUND", "Task not found.");
      if (patch.delete) {
        if (!a.rights.deleteAll && t.reporter_id !== user.id) throw new WorkflowError("FORBIDDEN", "You can delete only tasks you created.");
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

// CSV import: one task per row. Columns: title, description, type, status, priority, assignee_email, project_key,
// due_date, estimate_hours, labels, and one column per custom field (its key). Types, statuses and priorities may be
// given by key or by label.
export async function importTasks(user: AppUser, d: string, rows: Record<string, string>[]) {
  const dp = dept(d);
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
      const fields: Record<string, FieldValue> = {};
      for (const f of a.config.fields) {
        const v = r[f.key];
        if (v == null || v === "") continue;
        fields[f.key] = f.type === "person" ? (people.find((p) => p.email.toLowerCase() === v.trim().toLowerCase())?.id ?? v) : f.type === "checkbox" ? /^(1|yes|true|y)$/i.test(v.trim()) : v;
      }
      await saveTask(user, dp, {
        title: r.title ?? "",
        description: r.description || null,
        type: byKeyOrLabel(a.config.types, r.type),
        status: byKeyOrLabel(a.config.statuses, r.status),
        priority: byKeyOrLabel(a.config.priorities, r.priority),
        projectId: project?.id ?? null,
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
  const t = await get<{ code: string; assignee_id: string | null; reporter_id: string | null }>("SELECT code, assignee_id, reporter_id FROM dept_tasks WHERE id = ? AND dept = ?", taskId, a.dept);
  if (!t) throw new WorkflowError("NOT_FOUND", "Task not found.");
  if (!(write ? a.rights.editAll : a.rights.seeAll) && !own(user, t)) throw new WorkflowError("FORBIDDEN", "Not your task.");
  return t;
}

export async function taskComments(user: AppUser, d: string, taskId: string) {
  const a = await workAccess(user, dept(d));
  await taskFor(a, user, taskId, false);
  return all<{ id: string; author_id: string; author_name: string; body: string; created_at: string }>(
    "SELECT c.id, c.author_id, u.name AS author_name, c.body, c.created_at FROM dept_task_comments c JOIN users u ON u.id = c.author_id WHERE c.task_id = ? ORDER BY c.created_at",
    taskId,
  );
}

export async function addTaskComment(user: AppUser, d: string, taskId: string, body: string) {
  const dp = dept(d);
  const a = await workAccess(user, dp, "write");
  if (!body.trim()) throw new WorkflowError("VALIDATION", "Write a comment.");
  const t = await taskFor(a, user, taskId, true);
  const now = nowIso();
  await run("INSERT INTO dept_task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("tcm_"), taskId, user.id, body.trim().slice(0, 4000), now);
  await run("UPDATE dept_tasks SET updated_at = ? WHERE id = ?", now, taskId);
  if (a.config.notify.comments)
    await notify([t.assignee_id, t.reporter_id], { type: "mention", title: `${user.name} commented on ${t.code}`, body: body.slice(0, 140), link: `/${dp}?task=${taskId}`, groupKey: `task:${taskId}` }, now, user.id);
}

export async function listMetrics(user: AppUser, d: string, projectId: string) {
  const dp = dept(d);
  await workAccess(user, dp);
  return all<{ id: string; metric: string; value: number; recorded_on: string; note: string | null; created_by_name: string | null }>(
    "SELECT m.id, m.metric, m.value, m.recorded_on, m.note, u.name AS created_by_name FROM dept_metrics m JOIN dept_projects p ON p.id = m.project_id LEFT JOIN users u ON u.id = m.created_by WHERE m.project_id = ? AND p.dept = ? ORDER BY m.recorded_on DESC, m.created_at DESC",
    projectId,
    dp,
  );
}

export async function addMetric(user: AppUser, d: string, input: { projectId: string; metric: string; value: number; recordedOn: string; note?: string | null }) {
  const dp = dept(d);
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
  const dp = dept(d);
  const a = await workAccess(user, dp, "write");
  need(a, "projects", "You cannot delete KPI results here.");
  await run("DELETE FROM dept_metrics WHERE id = ? AND project_id IN (SELECT id FROM dept_projects WHERE dept = ?)", id, dp);
}

// ---------------------------------------------------------------------------
// Saved views: a named URL (tab, filters, columns, grouping, swimlanes). Private, or shared with the department by
// people who assign or configure.
// ---------------------------------------------------------------------------

export type DeptView = { id: string; name: string; query: string; shared: boolean; mine: boolean };

export async function deptViews(user: AppUser, d: string): Promise<DeptView[]> {
  const dp = dept(d);
  await workAccess(user, dp);
  const rows = await all<{ id: string; name: string; query: string; shared: number; owner_id: string }>(
    "SELECT id, name, query, shared, owner_id FROM saved_views WHERE page = ? AND (owner_id = ? OR shared = 1) ORDER BY shared DESC, lower(name)",
    `dept:${dp}`,
    user.id,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, query: r.query, shared: !!r.shared, mine: r.owner_id === user.id }));
}

export async function saveDeptView(user: AppUser, d: string, input: { name: string; query: string; shared: boolean }) {
  const dp = dept(d);
  const a = await workAccess(user, dp);
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) throw new WorkflowError("VALIDATION", "Name the view.");
  if (input.shared && !(a.rights.assign || a.rights.configure)) throw new WorkflowError("FORBIDDEN", "Only heads and leads share views with the department.");
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
  const dp = dept(d);
  const a = await workAccess(user, dp);
  const v = await get<{ owner_id: string }>("SELECT owner_id FROM saved_views WHERE id = ? AND page = ?", id, `dept:${dp}`);
  if (!v) return;
  if (v.owner_id !== user.id && !a.rights.configure) throw new WorkflowError("FORBIDDEN", "You can delete only your own views.");
  await run("DELETE FROM saved_views WHERE id = ?", id);
}
