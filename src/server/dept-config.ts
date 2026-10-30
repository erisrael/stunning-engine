// Department configuration storage. The first time a department is used its configuration is created from today's
// fixed values (so nothing changes until someone edits it) and existing tasks get their status category. Every save
// is a new version; earlier versions can be restored. Keys that tasks, projects or KPI entries still use cannot be
// removed, only switched off.

import { all, get, nowIso, parseJson, placeholders, run, tx } from "./db";
import { audit, WorkflowError } from "./workflow";
import { createDepartmentRow, customDepartment, customDepartments, deptAccess, type DeptAccess } from "./departments";
import { can, type AppUser } from "./users";
import { ADMIN_RIGHTS, NO_RIGHTS, READ_RIGHTS, defaultConfig, deptTemplateConfig, normalizeConfig, type DeptConfig, type Rights } from "@/lib/dept-config";
import { WORK_DEPTS, isBuiltInWorkDept, type WorkDept } from "@/lib/work";

// A work department's key: Dev, Marketing, or a department created in Admin.
export async function workDept(d: string): Promise<WorkDept> {
  if (isBuiltInWorkDept(d)) return d;
  if (typeof d === "string" && (await customDepartment(d))) return d;
  throw new WorkflowError("VALIDATION", "Unknown department.");
}

// Every work department: the built-in ones, then those created in Admin (not archived).
export async function allWorkDepts(): Promise<WorkDept[]> {
  return [...WORK_DEPTS, ...(await customDepartments()).map((d) => d.key)];
}

// Keeps every task's stored category in step with its status's category.
async function syncCategories(dept: WorkDept, cfg: DeptConfig) {
  const cases = cfg.statuses.map(() => "WHEN ? THEN ?").join(" ");
  await run(
    `UPDATE dept_tasks SET status_category = CASE status ${cases} ELSE 'open' END WHERE dept = ?`,
    ...cfg.statuses.flatMap((s) => [s.key, s.category]),
    dept,
  );
}

const cache = new Map<WorkDept, { version: number; config: DeptConfig }>();

export async function getDeptConfig(d: string): Promise<DeptConfig & { version: number }> {
  const dept = await workDept(d);
  const row = await get<{ config: string; version: number }>("SELECT config, version FROM dept_config WHERE dept = ?", dept);
  if (row) {
    const v = Number(row.version);
    const hit = cache.get(dept);
    if (hit && hit.version === v) return { ...hit.config, version: v };
    let config: DeptConfig;
    try {
      config = normalizeConfig(parseJson(row.config, {}), dept);
    } catch {
      config = defaultConfig(dept);
    }
    cache.set(dept, { version: v, config });
    return { ...config, version: v };
  }
  const custom = isBuiltInWorkDept(dept) ? null : await customDepartment(dept);
  const config = custom ? deptTemplateConfig(custom.template, custom.title, dept.replace(/[^a-z0-9]/g, "").toUpperCase().slice(0, 4) || "TASK") : defaultConfig(dept);
  const now = nowIso();
  await tx(async () => {
    await run("INSERT INTO dept_config (dept, config, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (dept) DO NOTHING", dept, JSON.stringify(config), now);
    await run("INSERT INTO dept_config_versions (dept, version, config, summary, created_at) VALUES (?, 1, ?, 'Created from the standard setup', ?) ON CONFLICT DO NOTHING", dept, JSON.stringify(config), now);
    await syncCategories(dept, config);
  });
  return getDeptConfig(dept);
}

// Makes sure both work departments have a configuration (and categorised tasks) before reports count them.
export async function ensureDeptConfigs() {
  const keys = await allWorkDepts();
  return Object.fromEntries(await Promise.all(keys.map(async (d) => [d, await getDeptConfig(d)] as const))) as Record<string, DeptConfig & { version: number }>;
}

// A new department from a template (Admin): its row, then its configuration as version 1.
export async function createDepartment(user: AppUser, input: { key: string; title: string; template: string }) {
  const d = await createDepartmentRow(user, input);
  const cfg = await getDeptConfig(d.key);
  await audit({ actor: user }, { action: "department.create", summary: `${user.name} created the ${d.title} department from the ${input.template} template` });
  return { key: d.key, title: cfg.title };
}

export type WorkAccess = DeptAccess & { rights: Rights; config: DeptConfig & { version: number } };

// What this person may do in the department: Admin everything, owners read, others by their position.
export async function workAccess(user: AppUser, d: string, need: "view" | "write" = "view"): Promise<WorkAccess> {
  const dept = await workDept(d);
  const a = await deptAccess(user, dept);
  if (!a.view) throw new WorkflowError("FORBIDDEN", "You do not have access to this department.");
  if (need === "write" && a.readOnly) throw new WorkflowError("FORBIDDEN", "This department is read only for you.");
  const config = await getDeptConfig(dept);
  const rights = can(user, "users.manage") ? ADMIN_RIGHTS : a.readOnly ? READ_RIGHTS : a.position ? config.rights[a.position] : NO_RIGHTS;
  return { ...a, rights, config };
}

export function need(w: WorkAccess, right: keyof Rights, message: string) {
  if (!w.rights[right]) throw new WorkflowError("FORBIDDEN", message);
}

// What changed between two versions, for the history list and the audit log.
function describe(a: DeptConfig, b: DeptConfig) {
  const parts: string[] = [];
  const diff = (what: string, x: { key: string; label: string }[], y: { key: string; label: string }[]) => {
    const added = y.filter((i) => !x.some((o) => o.key === i.key)).map((i) => i.label);
    const removed = x.filter((i) => !y.some((o) => o.key === i.key)).map((i) => i.label);
    const changed = y.filter((i) => {
      const o = x.find((z) => z.key === i.key);
      return o && JSON.stringify(o) !== JSON.stringify(i);
    }).length;
    if (added.length) parts.push(`added ${what} ${added.join(", ")}`);
    if (removed.length) parts.push(`removed ${what} ${removed.join(", ")}`);
    if (changed) parts.push(`changed ${changed} ${what}`);
  };
  diff("statuses", a.statuses, b.statuses);
  diff("types", a.types, b.types);
  diff("priorities", a.priorities, b.priorities);
  diff("project statuses", a.projectStatuses, b.projectStatuses);
  diff("fields", a.fields, b.fields);
  diff("KPIs", a.kpis, b.kpis);
  if (JSON.stringify(a.rights) !== JSON.stringify(b.rights)) parts.push("changed rights");
  if (JSON.stringify(a.names) !== JSON.stringify(b.names) || a.title !== b.title || a.codePrefix !== b.codePrefix) parts.push("changed names");
  if (JSON.stringify(a.features) !== JSON.stringify(b.features)) parts.push("changed features");
  if (JSON.stringify(a.notify) !== JSON.stringify(b.notify)) parts.push("changed notifications");
  if (JSON.stringify(a.labels) !== JSON.stringify(b.labels) || a.description !== b.description) parts.push("changed details");
  return parts.join("; ") || "No changes";
}

// Keys still used by tasks, projects or KPI entries may be switched off but not removed.
async function checkRemovals(dept: WorkDept, old: DeptConfig, next: DeptConfig) {
  const gone = <T extends { key: string; label: string }>(x: T[], y: T[]) => x.filter((i) => !y.some((o) => o.key === i.key));
  const used = async (sql: string, keys: string[]) =>
    keys.length ? (await all<{ k: string; c: number }>(sql.replace("%IN%", placeholders(keys.length)), dept, ...keys)).filter((r) => Number(r.c) > 0) : [];
  const checks: [string, { key: string; label: string }[], string][] = [
    ["status", gone(old.statuses, next.statuses), "SELECT status AS k, COUNT(*) AS c FROM dept_tasks WHERE dept = ? AND status IN (%IN%) GROUP BY status"],
    ["task type", gone(old.types, next.types), "SELECT type AS k, COUNT(*) AS c FROM dept_tasks WHERE dept = ? AND type IN (%IN%) GROUP BY type"],
    ["priority", gone(old.priorities, next.priorities), "SELECT priority AS k, COUNT(*) AS c FROM dept_tasks WHERE dept = ? AND priority IN (%IN%) GROUP BY priority"],
    ["project status", gone(old.projectStatuses, next.projectStatuses), "SELECT status AS k, COUNT(*) AS c FROM dept_projects WHERE dept = ? AND status IN (%IN%) GROUP BY status"],
    ["KPI", gone(old.kpis, next.kpis), "SELECT m.metric AS k, COUNT(*) AS c FROM dept_metrics m JOIN dept_projects p ON p.id = m.project_id WHERE p.dept = ? AND m.metric IN (%IN%) GROUP BY m.metric"],
  ];
  for (const [what, items, sql] of checks) {
    const hits = await used(sql, items.map((i) => i.key));
    if (hits.length) {
      const i = items.find((x) => x.key === hits[0]!.k)!;
      const n = Number(hits[0]!.c);
      throw new WorkflowError("VALIDATION", `The ${what} "${i.label}" is used ${n === 1 ? "once" : `${n} times`}. Switch it off instead, or move those first.`);
    }
  }
}

export async function saveDeptConfig(user: AppUser, d: string, raw: unknown, baseVersion: number, summary?: string) {
  const w = await workAccess(user, d, "write");
  need(w, "configure", "Only people with the right to configure this department can change it.");
  const dept = await workDept(d);
  let next: DeptConfig;
  try {
    next = normalizeConfig(raw, dept);
  } catch (err) {
    throw new WorkflowError("VALIDATION", err instanceof Error ? err.message : String(err));
  }
  const old = await getDeptConfig(dept);
  if (old.version !== baseVersion) throw new WorkflowError("CONFLICT", "Someone else saved this configuration meanwhile. Reload to see their changes, then make yours again.");
  await checkRemovals(dept, old, next);
  // The person saving must keep the right to configure, unless they are Admin.
  if (!can(user, "users.manage") && w.position && !next.rights[w.position].configure) throw new WorkflowError("VALIDATION", "You would lose the right to configure this department. Keep it switched on for your position.");
  const what = summary ?? describe(old, next);
  const version = old.version + 1;
  const now = nowIso();
  await tx(async () => {
    const ok = await all<{ dept: string }>("UPDATE dept_config SET config = ?, version = ?, updated_at = ?, updated_by = ? WHERE dept = ? AND version = ? RETURNING dept", JSON.stringify(next), version, now, user.id, dept, old.version);
    if (!ok.length) throw new WorkflowError("CONFLICT", "Someone else saved this configuration meanwhile. Reload and try again.");
    await run("INSERT INTO dept_config_versions (dept, version, config, summary, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)", dept, version, JSON.stringify(next), what, now, user.id);
    await syncCategories(dept, next);
  });
  cache.delete(dept);
  await audit({ actor: user }, { action: `${dept}.config`, summary: `${user.name} changed the ${next.title} configuration (version ${version}): ${what}` });
  return version;
}

export async function configVersions(user: AppUser, d: string) {
  const w = await workAccess(user, d);
  need(w, "configure", "Only people with the right to configure this department can see its history.");
  return (
    await all<{ version: number; summary: string | null; created_at: string; created_by_name: string | null }>(
      "SELECT v.version, v.summary, v.created_at, u.name AS created_by_name FROM dept_config_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.dept = ? ORDER BY v.version DESC LIMIT 100",
      await workDept(d),
    )
  ).map((r) => ({ ...r, version: Number(r.version) }));
}

// Restoring saves the earlier configuration as a new version (the history keeps everything).
export async function restoreDeptConfig(user: AppUser, d: string, version: number) {
  const dept = await workDept(d);
  const row = await get<{ config: string }>("SELECT config FROM dept_config_versions WHERE dept = ? AND version = ?", dept, version);
  if (!row) throw new WorkflowError("NOT_FOUND", "That version was not found.");
  const current = await getDeptConfig(dept);
  return saveDeptConfig(user, dept, parseJson(row.config, {}), current.version, `Restored version ${version}`);
}

// How many tasks, projects and KPI entries use each key, so the editor can say what can be removed.
export async function configUsage(user: AppUser, d: string) {
  const w = await workAccess(user, d);
  need(w, "configure", "Only people with the right to configure this department can see this.");
  const dept = await workDept(d);
  const count = async (sql: string) => Object.fromEntries((await all<{ k: string; c: number }>(sql, dept)).map((r) => [r.k, Number(r.c)]));
  return {
    statuses: await count("SELECT status AS k, COUNT(*) AS c FROM dept_tasks WHERE dept = ? GROUP BY status"),
    types: await count("SELECT type AS k, COUNT(*) AS c FROM dept_tasks WHERE dept = ? GROUP BY type"),
    priorities: await count("SELECT priority AS k, COUNT(*) AS c FROM dept_tasks WHERE dept = ? GROUP BY priority"),
    projectStatuses: await count("SELECT status AS k, COUNT(*) AS c FROM dept_projects WHERE dept = ? GROUP BY status"),
    kpis: await count("SELECT m.metric AS k, COUNT(*) AS c FROM dept_metrics m JOIN dept_projects p ON p.id = m.project_id WHERE p.dept = ? GROUP BY m.metric"),
  };
}
