// People operations: the Operations head manages the people of the departments Admin chooses (Production, Finance,
// Sales, Marketing, Customer Support by default) and the chief officers (CEO, CFO, CTO, CEDO). They give and take
// those departments' roles, make people leads (and heads, when Admin allows it), and set production team leads.
// Admin and Owner accounts are never touched, and the Admin and Owner roles are never given, from here.
//
// Who may do it: Admin always; otherwise the Operations head (Admin, Departments, Operations, position Head), or
// heads and leads when Admin widens it, or anyone whose role Admin ticked "People operations" for.

import { all, get, nowIso, parseJson, placeholders, run, tx } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { getPermissionMatrix } from "./settings";
import { CHIEF_ROLES, DEPARTMENT_ROLES, POSITIONS, STAGES, roleLabel, type Position, type Role, type Stage } from "@/lib/domain";

export const OPS_DEPARTMENTS = ["production", "finance", "sales", "marketing", "support", "dev", "studio", "hr", "operations"] as const;
export type OpsDept = (typeof OPS_DEPARTMENTS)[number];
export const OPS_DEPT_LABELS: Record<OpsDept, string> = {
  production: "Production",
  finance: "Finance",
  sales: "Sales & Outreach",
  marketing: "Marketing",
  support: "Customer Support",
  dev: "Dev team",
  studio: "Studio",
  hr: "HR",
  operations: "Operations (its own leads and members)",
};
// Departments with positions (head, lead, member) in Admin, Departments. Finance and HR go by role only;
// Production's leads are its stage team leads.
const POSITION_DEPTS: OpsDept[] = ["sales", "marketing", "support", "dev", "studio", "operations"];

export type PeopleOpsConfig = {
  enabled: boolean;
  departments: OpsDept[];
  chiefs: boolean;
  who: "head" | "head_and_leads";
  // The Operations head may also name heads of the departments it manages (never the Operations head itself).
  assignHeads: boolean;
};
const DEFAULTS: PeopleOpsConfig = { enabled: true, departments: ["production", "finance", "sales", "marketing", "support"], chiefs: true, who: "head", assignHeads: false };
const PROTECTED: Role[] = ["admin", "owner"];

export async function peopleOpsConfig(): Promise<PeopleOpsConfig> {
  const raw = parseJson<Partial<PeopleOpsConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.people_ops'"))?.value, {});
  return {
    enabled: raw.enabled ?? DEFAULTS.enabled,
    departments: Array.isArray(raw.departments) ? raw.departments.filter((d): d is OpsDept => (OPS_DEPARTMENTS as readonly string[]).includes(d)) : DEFAULTS.departments,
    chiefs: raw.chiefs ?? DEFAULTS.chiefs,
    who: raw.who === "head_and_leads" ? "head_and_leads" : "head",
    assignHeads: !!raw.assignHeads,
  };
}

export async function savePeopleOpsConfig(user: AppUser, input: PeopleOpsConfig) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets what Operations manages.");
  const clean: PeopleOpsConfig = {
    enabled: !!input.enabled,
    departments: [...new Set((input.departments ?? []).filter((d) => (OPS_DEPARTMENTS as readonly string[]).includes(d)))],
    chiefs: !!input.chiefs,
    who: input.who === "head_and_leads" ? "head_and_leads" : "head",
    assignHeads: !!input.assignHeads,
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.people_ops', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(clean),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "people_ops.config", summary: `${user.name} set what Operations manages: ${clean.enabled ? clean.departments.map((d) => OPS_DEPT_LABELS[d]).join(", ") + (clean.chiefs ? ", chief officers" : "") : "switched off"}`, newValue: clean });
}

// The roles that belong to each managed department (support also takes the support presets Admin kept).
async function deptRoles(d: OpsDept): Promise<Role[]> {
  if (d === "finance") return ["finance_manager", "accountant"];
  if (d === "hr") return ["hr_manager", "hr_officer"];
  if (d === "support") {
    const matrix = await getPermissionMatrix();
    return ["support", ...(["support_head", "support_supervisor", "call_center_supervisor"].filter((k) => Object.hasOwn(matrix, k)) as Role[])];
  }
  return [...DEPARTMENT_ROLES[d]];
}

export type PeopleOpsAccess = { allowed: boolean; admin: boolean; config: PeopleOpsConfig; roles: { key: Role; label: string; dept: OpsDept | "chief" }[]; positionDepts: OpsDept[] };

export async function peopleOpsAccess(user: AppUser): Promise<PeopleOpsAccess> {
  const config = await peopleOpsConfig();
  const admin = can(user, "users.manage");
  // People operations and role assignment are Admin's only (the Operations head no longer manages people).
  const allowed = admin;
  const depts = admin ? [...OPS_DEPARTMENTS] : config.departments;
  const roles: PeopleOpsAccess["roles"] = [];
  for (const d of depts) for (const r of await deptRoles(d)) if (!roles.some((x) => x.key === r)) roles.push({ key: r, label: roleLabel(r), dept: d });
  if (admin || config.chiefs) for (const r of CHIEF_ROLES) roles.push({ key: r, label: roleLabel(r), dept: "chief" });
  return { allowed, admin, config, roles: roles.filter((r) => !PROTECTED.includes(r.key)), positionDepts: depts.filter((d) => POSITION_DEPTS.includes(d)) };
}

async function requireOps(user: AppUser) {
  const a = await peopleOpsAccess(user);
  if (!a.allowed) throw new WorkflowError("FORBIDDEN", "Only the Operations head (or Admin) manages people here.");
  return a;
}

async function guardTarget(a: PeopleOpsAccess, userId: string) {
  const target = await get<{ id: string; name: string; active: number }>("SELECT id, name, active FROM users WHERE id = ? AND deleted_at IS NULL", userId);
  if (!target) throw new WorkflowError("NOT_FOUND", "Person not found.");
  if (!a.admin) {
    const held = await all<{ role: string }>("SELECT role FROM role_assignments WHERE user_id = ?", userId);
    if (held.some((r) => PROTECTED.includes(r.role as Role))) throw new WorkflowError("FORBIDDEN", "Admin and Owner accounts are managed by Admin only.");
  }
  return target;
}

export type OpsPerson = { id: string; name: string; email: string; title: string | null; roles: Role[]; positions: Record<string, Position>; leads: Stage[]; protected: boolean };

export async function peopleOpsDirectory(user: AppUser) {
  const a = await requireOps(user);
  const [users, roles, positions, leads] = await Promise.all([
    all<{ id: string; name: string; email: string; title: string | null }>("SELECT id, name, email, title FROM users WHERE active = 1 AND deleted_at IS NULL ORDER BY name"),
    all<{ user_id: string; role: Role }>("SELECT user_id, role FROM role_assignments"),
    all<{ user_id: string; department: string; position: Position }>("SELECT user_id, department, position FROM department_positions"),
    all<{ user_id: string; stage: Stage }>("SELECT user_id, stage FROM team_leads"),
  ]);
  const people: OpsPerson[] = users.map((u) => {
    const r = roles.filter((x) => x.user_id === u.id).map((x) => x.role);
    return {
      ...u,
      roles: r,
      positions: Object.fromEntries(positions.filter((p) => p.user_id === u.id).map((p) => [p.department, p.position])),
      leads: leads.filter((l) => l.user_id === u.id).map((l) => l.stage),
      protected: r.some((x) => PROTECTED.includes(x)),
    };
  });
  return { access: a, people: a.admin ? people : people.filter((p) => !p.protected), stages: [...STAGES] };
}

// Replaces the person's roles within what Operations manages; their other roles stay as they are.
export async function setManagedRoles(user: AppUser, userId: string, wanted: string[]) {
  const a = await requireOps(user);
  const target = await guardTarget(a, userId);
  const managed = new Set(a.roles.map((r) => r.key as string));
  if (wanted.some((r) => !managed.has(r))) throw new WorkflowError("FORBIDDEN", "That role is outside what Operations manages.");
  if (target.id === user.id && !a.admin) throw new WorkflowError("FORBIDDEN", "Ask Admin to change your own roles.");
  const current = (await all<{ role: Role }>("SELECT role FROM role_assignments WHERE user_id = ?", userId)).map((r) => r.role);
  const keep = current.filter((r) => !managed.has(r));
  const next = [...new Set([...keep, ...(wanted as Role[])])];
  if (!next.length && !(await get("SELECT 1 AS x FROM department_positions WHERE user_id = ?", userId))) throw new WorkflowError("VALIDATION", "Leave the person at least one role.");
  const added = next.filter((r) => !current.includes(r));
  const removed = current.filter((r) => !next.includes(r));
  if (!added.length && !removed.length) return;
  const rc = await import("./role-change");
  if (removed.length && (await rc.needsImpactPage(userId, { roles: removed, leads: [] })))
    throw new WorkflowError("IMPACT", "See the impact before taking a role.", { url: await rc.impactUrl(userId, { roles: removed, leads: [] }) });
  await tx(async () => {
    if (removed.length) await run(`DELETE FROM role_assignments WHERE user_id = ? AND role IN (${placeholders(removed.length)})`, userId, ...removed);
    for (const r of added) await run("INSERT INTO role_assignments (user_id, role) VALUES (?, ?) ON CONFLICT DO NOTHING", userId, r);
    // A stage lead without the stage's role is no longer a lead.
    for (const r of removed) if ((STAGES as readonly string[]).includes(r)) await run("DELETE FROM team_leads WHERE user_id = ? AND stage = ?", userId, r);
  });
  (await import("./auth")).forgetFastViewers();
  if (added.length) await rc.onRolesGiven(user, userId, { roles: added });
  await audit(
    { actor: user },
    { action: "people_ops.roles", summary: `${user.name} (People operations) ${[added.length && `gave ${target.name} ${added.map(roleLabel).join(", ")}`, removed.length && `took ${removed.map(roleLabel).join(", ")} from ${target.name}`].filter(Boolean).join(" and ")}`, oldValue: current, newValue: next },
  );
}

export async function setManagedPosition(user: AppUser, dept: string, userId: string, position: Position | "remove") {
  const a = await requireOps(user);
  if (!a.positionDepts.includes(dept as OpsDept)) throw new WorkflowError("FORBIDDEN", "That department is outside what Operations manages.");
  if (position !== "remove" && !POSITIONS.includes(position)) throw new WorkflowError("VALIDATION", "Unknown position.");
  const target = await guardTarget(a, userId);
  if (!a.admin) {
    if (position === "head" && (!a.config.assignHeads || dept === "operations")) throw new WorkflowError("FORBIDDEN", dept === "operations" ? "Only Admin names the Operations head." : "Admin names department heads (Admin, Operations authority can allow it).");
    const was = await get<{ position: Position }>("SELECT position FROM department_positions WHERE department = ? AND user_id = ?", dept, userId);
    if (was?.position === "head" && (!a.config.assignHeads || dept === "operations")) throw new WorkflowError("FORBIDDEN", "Only Admin changes a department head.");
    if (target.id === user.id) throw new WorkflowError("FORBIDDEN", "Ask Admin to change your own position.");
  }
  if (position === "remove" || position === "member") await run("DELETE FROM department_positions WHERE department = ? AND user_id = ?", dept, userId);
  else
    await run(
      "INSERT INTO department_positions (department, user_id, position) VALUES (?, ?, ?) ON CONFLICT (department, user_id) DO UPDATE SET position = excluded.position",
      dept,
      userId,
      position,
    );
  (await import("./auth")).forgetFastViewers();
  await audit({ actor: user }, { action: "people_ops.position", summary: `${user.name} (People operations) set ${target.name} as ${position === "remove" ? "no position" : position} in ${OPS_DEPT_LABELS[dept as OpsDept]}` });
}

export async function setManagedStageLead(user: AppUser, stage: Stage, userId: string, lead: boolean) {
  const a = await requireOps(user);
  if (!a.admin && !a.config.departments.includes("production")) throw new WorkflowError("FORBIDDEN", "Production is outside what Operations manages.");
  if (!STAGES.includes(stage)) throw new WorkflowError("VALIDATION", "Unknown team.");
  const target = await guardTarget(a, userId);
  if (lead && !(await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ? AND role = ?", userId, stage))) throw new WorkflowError("VALIDATION", "Give the person this team's role first.");
  const rc = await import("./role-change");
  if (!lead && (await rc.needsImpactPage(userId, { roles: [], leads: [stage] })))
    throw new WorkflowError("IMPACT", "See the impact before taking the lead position.", { url: await rc.impactUrl(userId, { roles: [], leads: [stage] }) });
  if (lead) {
    await run("INSERT INTO team_leads (stage, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", stage, userId);
    await run("UPDATE users SET own_work_only = 0 WHERE id = ?", userId);
    await rc.onRolesGiven(user, userId, { leads: [stage] });
  } else await run("DELETE FROM team_leads WHERE stage = ? AND user_id = ?", stage, userId);
  (await import("./auth")).forgetFastViewers();
  await audit({ actor: user }, { action: "people_ops.lead", summary: `${user.name} (People operations) ${lead ? "made" : "removed"} ${target.name} ${lead ? "a" : "as"} ${stage} team lead` });
}
