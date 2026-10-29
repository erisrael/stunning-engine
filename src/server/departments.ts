// Departments and who sees what.
//
// A department's people are those holding its roles (Admin, People). Positions are set per department in Admin,
// Departments: heads and leads see and assign the whole department's work; members see only their own. Owners
// (owners.view) see every department read only. Admin (users.manage) can do everything everywhere.

import { all, get, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { DEPARTMENT_LABELS, DEPARTMENT_ROLES, DEPARTMENTS, POSITIONS, type Capability, type Department, type Position, type Role } from "@/lib/domain";

export const DEPARTMENT_ACCESS: Record<Department, Capability> = {
  production: "nav.overview",
  dev: "dev.access",
  studio: "studio.access",
  marketing: "marketing.access",
};

export type DeptAccess = {
  dept: Department;
  view: boolean; // can open the section
  manage: boolean; // head, lead or Admin: sees all, assigns, approves
  readOnly: boolean; // owners looking in
  member: boolean; // holds one of the department's roles
  position: Position | null;
};

export async function positionsOf(userId: string): Promise<Partial<Record<Department, Position>>> {
  const rows = await all<{ department: Department; position: Position }>("SELECT department, position FROM department_positions WHERE user_id = ?", userId);
  return Object.fromEntries(rows.map((r) => [r.department, r.position]));
}

export async function deptAccess(user: AppUser, dept: Department): Promise<DeptAccess> {
  const positions = await positionsOf(user.id);
  const position = positions[dept] ?? null;
  const member = DEPARTMENT_ROLES[dept].some((r) => user.roles.includes(r));
  const admin = can(user, "users.manage");
  const allowed = can(user, DEPARTMENT_ACCESS[dept]);
  const owner = can(user, "owners.view");
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

export async function requireDept(user: AppUser, dept: Department, need: "view" | "write" | "manage" = "view") {
  const a = await deptAccess(user, dept);
  if (!a.view) throw new WorkflowError("FORBIDDEN", `You do not have access to ${DEPARTMENT_LABELS[dept]}.`);
  if (need === "write" && a.readOnly) throw new WorkflowError("FORBIDDEN", `${DEPARTMENT_LABELS[dept]} is read only for you.`);
  if (need === "manage" && !a.manage) throw new WorkflowError("FORBIDDEN", `Only ${DEPARTMENT_LABELS[dept]} heads and leads can do this.`);
  return a;
}

export type DeptPerson = { id: string; name: string; email: string; roles: Role[]; position: Position };

// Everyone in a department: holders of its roles, plus anyone given a position there.
export async function deptPeople(dept: Department): Promise<DeptPerson[]> {
  const roles = DEPARTMENT_ROLES[dept];
  const rows = await all<{ id: string; name: string; email: string }>(
    `SELECT DISTINCT u.id, u.name, u.email FROM users u
     WHERE u.active = 1 AND (EXISTS (SELECT 1 FROM role_assignments r WHERE r.user_id = u.id AND r.role IN (${roles.map(() => "?").join(",")}))
       OR EXISTS (SELECT 1 FROM department_positions p WHERE p.user_id = u.id AND p.department = ?))
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

export async function setPosition(user: AppUser, dept: Department, userId: string, position: Position) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin can set department positions.");
  if (!DEPARTMENTS.includes(dept) || !POSITIONS.includes(position)) throw new WorkflowError("VALIDATION", "Unknown department or position.");
  const target = await get<{ name: string }>("SELECT name FROM users WHERE id = ?", userId);
  if (!target) throw new WorkflowError("NOT_FOUND", "Person not found.");
  if (position === "member") await run("DELETE FROM department_positions WHERE department = ? AND user_id = ?", dept, userId);
  else
    await run(
      "INSERT INTO department_positions (department, user_id, position) VALUES (?, ?, ?) ON CONFLICT (department, user_id) DO UPDATE SET position = excluded.position",
      dept,
      userId,
      position,
    );
  await audit({ actor: user }, { action: "department.position", summary: `${user.name} made ${target.name} ${position} of ${DEPARTMENT_LABELS[dept]}` });
}

// Heads and leads of a department (for notices and reports).
export async function deptManagers(dept: Department) {
  return (await all<{ user_id: string }>("SELECT p.user_id FROM department_positions p JOIN users u ON u.id = p.user_id WHERE p.department = ? AND p.position IN ('head','lead') AND u.active = 1", dept)).map(
    (r) => r.user_id,
  );
}

// Sections this person can open, for the sidebar and the home page.
export async function myDepartments(user: AppUser) {
  const out: { dept: Department; manage: boolean; readOnly: boolean; position: Position | null }[] = [];
  for (const d of DEPARTMENTS) {
    if (d === "production") continue;
    const a = await deptAccess(user, d);
    if (a.view) out.push({ dept: d, manage: a.manage, readOnly: a.readOnly, position: a.position });
  }
  return out;
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
