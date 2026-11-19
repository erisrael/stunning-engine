import { all, get, nowIso, parseJson, run } from "./db";
import { can, listUsers, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { CHAPA_ACTIONS, type ChapaAction } from "@/lib/chapa";

// Admin, Chapa access: give named people Chapa (which businesses, which actions), the same way Noor access
// is given. A grant replaces the role rules for that person unless "also by role" is ticked. Money actions
// still need the action switched on for the business in Chapa, Settings (limits and second approver apply).

export type ChapaGrant = {
  actions: ChapaAction[];
  businesses: "*" | string[];
  // Keep what the person's role allows as well.
  alsoRole: boolean;
  // Explicitly no Chapa, even if the role allows it.
  revoked?: boolean;
  updatedAt: string;
  updatedBy: string;
};

let cache: { at: number; value: Record<string, ChapaGrant> } | null = null;
export async function chapaGrants(): Promise<Record<string, ChapaGrant>> {
  if (cache && Date.now() - cache.at < 5000) return cache.value;
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.chapa_people'");
  const value = parseJson<Record<string, ChapaGrant>>(row?.value ?? "{}", {});
  cache = { at: Date.now(), value };
  return value;
}
async function write(user: AppUser, v: Record<string, ChapaGrant>) {
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.chapa_people', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(v),
    nowIso(),
    user.id,
  );
  cache = null;
}
const needAdmin = (u: AppUser) => {
  if (!can(u, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin gives Chapa access.");
};

export async function chapaAccessOverview(user: AppUser) {
  needAdmin(user);
  const { chapaSettings } = await import("./chapa-hub");
  const [grants, settings, businesses, users] = await Promise.all([chapaGrants(), chapaSettings(), all<{ id: string; name: string }>("SELECT id, name FROM chapa_accounts ORDER BY created_at"), listUsers()]);
  const roleRule = settings.access["*"] ?? {};
  return {
    actions: CHAPA_ACTIONS.map(([key, label, money]) => ({ key, label, money })),
    businesses,
    people: users.map((u) => {
      const g = grants[u.id] ?? null;
      const byRole = CHAPA_ACTIONS.filter(([a]) => roleRule[a]?.enabled && u.roles.some((r) => roleRule[a]!.roles.includes(r))).map(([a]) => a);
      return { id: u.id, name: u.name, email: u.email, roles: u.roles, grant: g, byRole, admin: can(u, "users.manage") };
    }),
  };
}

export async function grantChapaAccess(user: AppUser, input: { userIds: string[]; actions: ChapaAction[]; businesses: "*" | string[]; alsoRole?: boolean }) {
  needAdmin(user);
  const ids = [...new Set(input.userIds)].slice(0, 500);
  if (!ids.length) throw new WorkflowError("VALIDATION", "Choose at least one person.");
  const valid = new Set(CHAPA_ACTIONS.map(([a]) => a));
  const actions = [...new Set(input.actions)].filter((a) => valid.has(a));
  if (actions.length && !actions.includes("view")) actions.unshift("view");
  const known = new Set((await all<{ id: string }>("SELECT id FROM chapa_accounts")).map((r) => r.id));
  const businesses = input.businesses === "*" ? "*" : input.businesses.filter((b) => known.has(b));
  if (businesses !== "*" && !businesses.length) throw new WorkflowError("VALIDATION", "Choose at least one business.");
  const g = { ...(await chapaGrants()) };
  for (const id of ids) g[id] = { actions, businesses, alsoRole: !!input.alsoRole, updatedAt: nowIso(), updatedBy: user.id };
  await write(user, g);
  await audit({ actor: user }, { action: "configure.chapa_user", summary: `${user.name} gave Chapa access (${actions.join(", ") || "none"}) to ${ids.length} ${ids.length === 1 ? "person" : "people"}` });
  return ids.length;
}

export async function revokeChapaAccess(user: AppUser, userIds: string[]) {
  needAdmin(user);
  const g = { ...(await chapaGrants()) };
  for (const id of userIds) g[id] = { actions: [], businesses: "*", alsoRole: false, revoked: true, updatedAt: nowIso(), updatedBy: user.id };
  await write(user, g);
  await audit({ actor: user }, { action: "configure.chapa_user", summary: `${user.name} removed Chapa access for ${userIds.length} ${userIds.length === 1 ? "person" : "people"}` });
}

// Back to what the role allows.
export async function resetChapaAccess(user: AppUser, userIds: string[]) {
  needAdmin(user);
  const g = { ...(await chapaGrants()) };
  for (const id of userIds) delete g[id];
  await write(user, g);
  await audit({ actor: user }, { action: "configure.chapa_user", summary: `${user.name} reset Chapa access to the role for ${userIds.length} ${userIds.length === 1 ? "person" : "people"}` });
}

// For the sidebar: the person has Chapa through a grant.
export async function hasChapaGrant(user: AppUser) {
  const g = (await chapaGrants())[user.id];
  return !!g && !g.revoked && g.actions.includes("view");
}
