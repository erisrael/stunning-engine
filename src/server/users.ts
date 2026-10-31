import type { Audience } from "@/lib/help";
import { all, get, parseJson } from "./db";
import { getPermissionMatrix } from "./settings";
import { leadKey, type Capability, type Role, type Stage } from "@/lib/domain";

export type Scope = { gradeId: string | null; subjectId: string | null };

export type UserPrefs = {
  density?: "comfortable" | "compact";
  dashboardCards?: Record<string, string[]>;
  dashboardPanels?: Record<string, string[]>;
  mutedNotificationTypes?: string[];
  // Notification types also sent to the person by email.
  emailNotificationTypes?: string[];
  sheetPresets?: Record<string, { columns: string[]; groupBy?: string; includesBase?: boolean }>;
  contentColumns?: string[];
  defaultLanding?: string;
  theme?: "light" | "dark" | "system";
  exportSettings?: { format?: string; scope?: string; grouping?: string; includeDates?: boolean; columns?: string[]; orientation?: string };
  // Get-started tour: which role audiences have seen it, and which first steps are ticked.
  tour?: { seen?: Audience[]; steps?: string[] };
  // Sidebar entries this person hid (by link).
  sidebarHidden?: string[];
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  handle: string;
  title: string | null;
  roles: Role[];
  scopes: Scope[];
  prefs: UserPrefs;
  mustChangePassword: boolean;
  active: boolean;
  phone: string | null;
  bio: string | null;
  perms: Capability[];
  // Stages this person leads (Admin, Teams). Leads assign work in their stage, get handoff alerts and see team reports.
  leads: Stage[];
  // Team members flagged in Admin see only items assigned to them.
  ownWorkOnly: boolean;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  handle: string;
  title: string | null;
  prefs: string;
  must_change_password: number;
  active: number;
  phone: string | null;
  bio: string | null;
  own_work_only: number;
};

export async function loadUser(id: string): Promise<AppUser | null> {
  const [row, rel] = await Promise.all([get<UserRow>("SELECT * FROM users WHERE id = ?", id), related([id]), getPermissionMatrix()]);
  if (!row) return null;
  return await hydrate(row, rel);
}

type Related = {
  roles: { user_id: string; role: Role }[];
  scopes: { user_id: string; grade_id: string | null; subject_id: string | null }[];
  leads: { user_id: string; stage: Stage }[];
};

// Roles, scopes and led teams for the given users in one round of parallel queries (each query is a
// network round trip to a hosted database, so they are batched rather than run per user).
async function related(ids: string[]): Promise<Related> {
  if (!ids.length) return { roles: [], scopes: [], leads: [] };
  const list = ids.map(() => "?").join(", ");
  const [roles, scopes, leads] = await Promise.all([
    all<Related["roles"][number]>(`SELECT user_id, role FROM role_assignments WHERE user_id IN (${list}) ORDER BY role`, ...ids),
    all<Related["scopes"][number]>(`SELECT user_id, grade_id, subject_id FROM access_scopes WHERE user_id IN (${list})`, ...ids),
    all<Related["leads"][number]>(`SELECT user_id, stage FROM team_leads WHERE user_id IN (${list}) ORDER BY stage`, ...ids),
  ]);
  return { roles, scopes, leads };
}

async function hydrate(row: UserRow, rel?: Related): Promise<AppUser> {
  const data = rel ?? (await related([row.id]));
  const roles = data.roles.filter((r) => r.user_id === row.id).map((r) => r.role);
  const scopes = data.scopes.filter((s) => s.user_id === row.id).map((s) => ({ gradeId: s.grade_id, subjectId: s.subject_id }));
  const leads = data.leads.filter((l) => l.user_id === row.id).map((l) => l.stage);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    handle: row.handle,
    title: row.title,
    roles,
    scopes,
    prefs: parseJson<UserPrefs>(row.prefs, {}),
    mustChangePassword: !!row.must_change_password,
    active: !!row.active,
    phone: row.phone,
    bio: row.bio,
    perms: await permsFor(roles, leads),
    leads,
    ownWorkOnly: !!row.own_work_only,
  };
}

// Capabilities come from the permission matrix in settings (Admin, Roles and permissions): roles plus led teams.
export async function permsFor(roles: Role[], leads: Stage[] = []): Promise<Capability[]> {
  const matrix = await getPermissionMatrix();
  const out = new Set<Capability>();
  for (const r of roles) for (const c of matrix[r]) out.add(c);
  for (const st of leads) for (const c of matrix[leadKey(st)]) out.add(c);
  return [...out];
}

export function can(user: AppUser, cap: Capability) {
  return user.perms.includes(cap);
}

export async function listUsers(opts: { includeInactive?: boolean } = {}) {
  const rows = await all<UserRow>(
      `SELECT * FROM users ${opts.includeInactive ? "" : "WHERE active = 1"} ORDER BY name`,
    );
  const rel = await related(rows.map((r) => r.id));
  return Promise.all(rows.map((r) => hydrate(r, rel)));
}

export type UserLite = { id: string; name: string; handle: string; roles: Role[] };

export async function userDirectory(): Promise<UserLite[]> {
  const [users, roles] = await Promise.all([
    all<{ id: string; name: string; handle: string }>("SELECT id, name, handle FROM users WHERE active = 1 ORDER BY name"),
    all<{ user_id: string; role: Role }>("SELECT user_id, role FROM role_assignments"),
  ]);
  return users.map((u) => ({ ...u, roles: roles.filter((r) => r.user_id === u.id).map((r) => r.role) }));
}

export function hasRole(user: AppUser, role: Role) {
  return user.roles.includes(role);
}

// Manager-level override of stage ownership rules.
export function isManager(user: AppUser) {
  return user.perms.includes("work.override");
}

export function hasFullScope(user: AppUser) {
  return !user.ownWorkOnly && (user.scopes.length === 0 || user.scopes.some((s) => !s.gradeId && !s.subjectId));
}

export function isLeadOf(user: AppUser, stage: Stage) {
  return user.leads.includes(stage);
}

// SQL predicate restricting items to the user's grade/subject scope. Alias must expose `id`.
export function scopeSql(user: AppUser, alias = "i"): { sql: string; params: string[] } {
  if (hasFullScope(user)) return { sql: "1=1", params: [] };
  const parts: string[] = [];
  const params: string[] = [];
  // Own-work members: only items where they own (or collaborate on) a stage.
  const own = user.ownWorkOnly
    ? {
        sql: `(EXISTS (SELECT 1 FROM stage_assignments oa WHERE oa.item_id = ${alias}.id AND oa.user_id = ?) OR EXISTS (SELECT 1 FROM stage_attempts ot WHERE ot.item_id = ${alias}.id AND ot.owner_id = ?) OR EXISTS (SELECT 1 FROM item_collaborators oc WHERE oc.item_id = ${alias}.id AND oc.user_id = ?))`,
        params: [user.id, user.id, user.id],
      }
    : null;
  const grade = user.scopes.length === 0 || user.scopes.some((s) => !s.gradeId && !s.subjectId);
  if (own && grade) return own;
  for (const s of user.scopes) {
    const conds: string[] = [];
    if (s.gradeId) {
      conds.push("sm.grade_id = ?");
      params.push(s.gradeId);
    }
    if (s.subjectId) {
      conds.push("sm.subject_id = ?");
      params.push(s.subjectId);
    }
    parts.push(`(${conds.join(" AND ")})`);
  }
  const scoped = `EXISTS (SELECT 1 FROM item_memberships sm WHERE sm.item_id = ${alias}.id AND (${parts.join(" OR ")}))`;
  return own ? { sql: `(${own.sql} AND ${scoped})`, params: [...own.params, ...params] } : { sql: scoped, params };
}

export function scopeAllowsGradeSubject(user: AppUser, gradeId: string | null, subjectId: string | null) {
  if (hasFullScope(user)) return true;
  return user.scopes.some(
    (s) => (!s.gradeId || !gradeId || s.gradeId === gradeId) && (!s.subjectId || !subjectId || s.subjectId === subjectId),
  );
}

export async function canViewItem(user: AppUser, itemId: string) {
  if (hasFullScope(user)) return true;
  const sc = scopeSql(user, "x");
  const row = await get(`SELECT 1 AS ok FROM items x WHERE x.id = ? AND ${sc.sql}`, itemId, ...sc.params);
  return !!row;
}

export function canWorkStage(user: AppUser, stage: Stage, ownerId: string | null) {
  if (isManager(user)) return true;
  if (!hasRole(user, stage)) return false;
  return !ownerId || ownerId === user.id;
}

export function availableRoles(user: AppUser): Role[] {
  return user.roles;
}
