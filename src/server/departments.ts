// Departments and who sees what.
//
// Built-in departments (Production, Dev, Studio, Marketing) take their people from roles (Admin, People); positions
// are set per department in Admin, Departments. Departments created there from a template (Support, Sales, ...)
// have no role: their people are those given a position (head, lead or member). Heads and leads see and assign the
// whole department's work; members see only their own. Owners and the Company overview (owners.view, company.view)
// see every department read only. Admin (users.manage) can do everything everywhere.

import { all, get, nowIso, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { DEPARTMENT_LABELS, DEPARTMENT_ROLES, DEPARTMENTS, POSITIONS, type Capability, type Department, type Position, type Role } from "@/lib/domain";
import { RESERVED_DEPT_KEYS } from "@/lib/work";

export const DEPARTMENT_ACCESS: Record<Department, Capability> = {
  production: "nav.overview",
  dev: "dev.access",
  studio: "studio.access",
  marketing: "marketing.access",
};

const isBuiltIn = (d: string): d is Department => (DEPARTMENTS as readonly string[]).includes(d);

export type DeptAccess = {
  dept: string;
  view: boolean; // can open the section
  manage: boolean; // head, lead or Admin: sees all, assigns, approves
  readOnly: boolean; // owners and the Company overview looking in
  member: boolean; // holds one of the department's roles, or a position in a created department
  position: Position | null;
};

// ---------------------------------------------------------------------------
// Created departments
// ---------------------------------------------------------------------------

export type CustomDept = { key: string; title: string; template: string; archived: boolean };

export async function customDepartments(opts: { includeArchived?: boolean } = {}): Promise<CustomDept[]> {
  const rows = await all<{ key: string; title: string; template: string; archived: number }>(
    `SELECT key, title, template, archived FROM departments ${opts.includeArchived ? "" : "WHERE archived = 0"} ORDER BY sort, title`,
  );
  return rows.map((r) => ({ ...r, archived: !!r.archived }));
}

export async function customDepartment(key: string) {
  const r = await get<{ key: string; title: string; template: string; archived: number }>("SELECT key, title, template, archived FROM departments WHERE key = ?", key);
  return r ? { ...r, archived: !!r.archived } : null;
}

export function validDeptKey(key: string) {
  return /^[a-z][a-z0-9-]{1,23}$/.test(key) && !RESERVED_DEPT_KEYS.includes(key);
}

export async function departmentLabel(d: string) {
  return isBuiltIn(d) ? DEPARTMENT_LABELS[d] : ((await customDepartment(d))?.title ?? d);
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export async function positionsOf(userId: string): Promise<Record<string, Position>> {
  const rows = await all<{ department: string; position: Position }>("SELECT department, position FROM department_positions WHERE user_id = ?", userId);
  return Object.fromEntries(rows.map((r) => [r.department, r.position]));
}

export async function deptAccess(user: AppUser, dept: string): Promise<DeptAccess> {
  const positions = await positionsOf(user.id);
  const admin = can(user, "users.manage");
  const owner = can(user, "owners.view") || can(user, "company.view");
  if (!isBuiltIn(dept)) {
    const d = await customDepartment(dept);
    const position = d && !d.archived ? (positions[dept] ?? null) : null;
    const manage = admin || position === "head" || position === "lead";
    const exists = !!d && (!d.archived || admin);
    return { dept, view: exists && (!!position || owner || admin), manage: exists && manage, readOnly: exists && !manage && !position && owner, member: !!position, position };
  }
  const position = positions[dept] ?? null;
  const member = DEPARTMENT_ROLES[dept].some((r) => user.roles.includes(r));
  const allowed = can(user, DEPARTMENT_ACCESS[dept]);
  const manage = admin || (allowed && (position === "head" || position === "lead"));
  return {
    dept,
    view: allowed || owner || admin,
    manage,
    readOnly: !manage && !allowed && owner,
    member,
    position: position ?? (member ? "member" : null),
  };
}

export async function requireDept(user: AppUser, dept: string, need: "view" | "write" | "manage" = "view") {
  const a = await deptAccess(user, dept);
  const label = await departmentLabel(dept);
  if (!a.view) throw new WorkflowError("FORBIDDEN", `You do not have access to ${label}.`);
  if (need === "write" && a.readOnly) throw new WorkflowError("FORBIDDEN", `${label} is read only for you.`);
  if (need === "manage" && !a.manage) throw new WorkflowError("FORBIDDEN", `Only ${label} heads and leads can do this.`);
  return a;
}

export type DeptPerson = { id: string; name: string; email: string; roles: Role[]; position: Position };

// Everyone in a department: holders of its roles (built-in departments), plus anyone given a position there.
export async function deptPeople(dept: string): Promise<DeptPerson[]> {
  const roles = isBuiltIn(dept) ? DEPARTMENT_ROLES[dept] : [];
  const rows = await all<{ id: string; name: string; email: string }>(
    `SELECT DISTINCT u.id, u.name, u.email FROM users u
     WHERE u.active = 1 AND (${roles.length ? `EXISTS (SELECT 1 FROM role_assignments r WHERE r.user_id = u.id AND r.role IN (${roles.map(() => "?").join(",")})) OR ` : ""}
       EXISTS (SELECT 1 FROM department_positions p WHERE p.user_id = u.id AND p.department = ?))
     ORDER BY u.name`,
    ...roles,
    dept,
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const roleRows = await all<{ user_id: string; role: Role }>(`SELECT user_id, role FROM role_assignments WHERE user_id IN (${ids.map(() => "?").join(",")})`, ...ids);
  const pos = await all<{ user_id: string; position: Position }>("SELECT user_id, position FROM department_positions WHERE department = ?", dept);
  return rows.map((r) => ({ ...r, roles: roleRows.filter((x) => x.user_id === r.id).map((x) => x.role), position: pos.find((p) => p.user_id === r.id)?.position ?? "member" }));
}

// Sets a person's position. In built-in departments "member" is the default from the role, so it removes the row;
// in created departments the row is the membership, so "member" keeps it and "remove" deletes it.
export async function setPosition(user: AppUser, dept: string, userId: string, position: Position | "remove") {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin can set department positions.");
  const builtIn = isBuiltIn(dept);
  if (!builtIn && !(await customDepartment(dept))) throw new WorkflowError("VALIDATION", "Unknown department.");
  if (position !== "remove" && !POSITIONS.includes(position)) throw new WorkflowError("VALIDATION", "Unknown position.");
  const target = await get<{ name: string }>("SELECT name FROM users WHERE id = ?", userId);
  if (!target) throw new WorkflowError("NOT_FOUND", "Person not found.");
  if (position === "remove" || (builtIn && position === "member")) await run("DELETE FROM department_positions WHERE department = ? AND user_id = ?", dept, userId);
  else
    await run(
      "INSERT INTO department_positions (department, user_id, position) VALUES (?, ?, ?) ON CONFLICT (department, user_id) DO UPDATE SET position = excluded.position",
      dept,
      userId,
      position,
    );
  const label = await departmentLabel(dept);
  await audit({ actor: user }, { action: "department.position", summary: position === "remove" ? `${user.name} removed ${target.name} from ${label}` : `${user.name} made ${target.name} ${position} of ${label}` });
}

// Heads and leads of a department (for notices and reports).
export async function deptManagers(dept: string) {
  return (await all<{ user_id: string }>("SELECT p.user_id FROM department_positions p JOIN users u ON u.id = p.user_id WHERE p.department = ? AND p.position IN ('head','lead') AND u.active = 1", dept)).map(
    (r) => r.user_id,
  );
}

// Sections this person can open, for the sidebar and the home page.
export async function myDepartments(user: AppUser) {
  const out: { dept: string; title: string; manage: boolean; readOnly: boolean; position: Position | null }[] = [];
  for (const d of DEPARTMENTS) {
    if (d === "production") continue;
    const a = await deptAccess(user, d);
    if (a.view) out.push({ dept: d, title: DEPARTMENT_LABELS[d], manage: a.manage, readOnly: a.readOnly, position: a.position });
  }
  for (const c of await customDepartments()) {
    const a = await deptAccess(user, c.key);
    if (a.view) out.push({ dept: c.key, title: c.title, manage: a.manage, readOnly: a.readOnly, position: a.position });
  }
  return out;
}

// Created departments this person can open (sidebar).
export async function myCustomDepartments(user: AppUser) {
  return (await myDepartments(user)).filter((d) => !isBuiltIn(d.dept)).map((d) => ({ key: d.dept, title: d.title }));
}

export async function createDepartmentRow(user: AppUser, input: { key: string; title: string; template: string }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin creates departments.");
  const key = input.key.trim().toLowerCase();
  if (!validDeptKey(key)) throw new WorkflowError("VALIDATION", "The short name is 2 to 24 lowercase letters, digits or dashes, starting with a letter (for example support).");
  if (await customDepartment(key)) throw new WorkflowError("VALIDATION", `A department called ${key} already exists.`);
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!title) throw new WorkflowError("VALIDATION", "Name the department.");
  const sort = Number((await get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM departments"))?.n ?? 1);
  await run("INSERT INTO departments (key, title, template, sort, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", key, title, input.template, sort, user.id, nowIso());
  return { key, title };
}

export async function setDepartmentArchived(user: AppUser, key: string, archived: boolean) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin archives departments.");
  const d = await customDepartment(key);
  if (!d) throw new WorkflowError("NOT_FOUND", "Department not found.");
  await run("UPDATE departments SET archived = ? WHERE key = ?", archived ? 1 : 0, key);
  await audit({ actor: user }, { action: "department.archive", summary: `${user.name} ${archived ? "archived" : "restored"} the ${d.title} department` });
}

// ---------------------------------------------------------------------------
// Owners in chat
// ---------------------------------------------------------------------------

// Owners can be contacted directly only by people allowed to (Admin, Managers and owners by default).
export function canContactOwners(user: AppUser) {
  return can(user, "chat.contact_owners") || can(user, "owners.view");
}

export async function ownerIds(): Promise<Set<string>> {
  return new Set((await all<{ user_id: string }>("SELECT user_id FROM role_assignments WHERE role = 'owner'")).map((r) => r.user_id));
}
