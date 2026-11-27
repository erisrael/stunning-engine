// Production, Overview: which teams' columns each role's members see (Admin sets it on the Overview page). Roles listed here
// open the Overview even without the Overview permission and see only those teams; roles not listed (managers,
// Admin, owners) see every team, as before. By default each production team sees its own column.

import { get, nowIso, run } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { ROLES, STAGES, type Stage } from "@/lib/domain";

export type OverviewTeams = Record<string, Stage[]>;
export const DEFAULT_OVERVIEW_TEAMS: OverviewTeams = { recording: ["recording"], editing: ["editing"], uploading: ["uploading"], publication: ["publication"] };
const KEY = "overview_teams";

export async function overviewTeams(): Promise<OverviewTeams> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", KEY);
  if (!row) return DEFAULT_OVERVIEW_TEAMS;
  try {
    const v = JSON.parse(row.value) as OverviewTeams;
    return Object.fromEntries(Object.entries(v).map(([k, s]) => [k, (Array.isArray(s) ? s : []).filter((x): x is Stage => (STAGES as readonly string[]).includes(x))]));
  } catch {
    return DEFAULT_OVERVIEW_TEAMS;
  }
}

// The teams this person sees on the Overview: null for all of them, [] for none (no access).
// Team leads see the whole production (every team's column), as before this setting existed; what they may change is
// still only their own team's work (stage ownership is checked on the server for every change).
export async function overviewStagesFor(user: AppUser & { activeRole: string }): Promise<Stage[] | null> {
  if (user.leads.length > 0) return null;
  const cfg = await overviewTeams();
  const listed = cfg[user.activeRole];
  if (listed !== undefined) return listed.length ? listed : can(user, "nav.overview") ? null : [];
  return can(user, "nav.overview") ? null : [];
}

export const canConfigureOverview = (u: AppUser) => can(u, "users.manage") || can(u, "settings.manage");

export async function saveOverviewTeams(user: AppUser, input: OverviewTeams) {
  if (!canConfigureOverview(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sets who sees which teams on the Overview.");
  const clean: OverviewTeams = {};
  for (const [role, stages] of Object.entries(input ?? {})) {
    if (!(ROLES as readonly string[]).includes(role)) continue;
    clean[role] = [...new Set((stages ?? []).filter((s) => (STAGES as readonly string[]).includes(s)))] as Stage[];
  }
  await run("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by", KEY, JSON.stringify(clean), nowIso(), user.id);
  await audit({ actor: user }, { action: "settings.overview_teams", summary: `${user.name} set which teams each role sees on the Overview`, newValue: clean });
  return clean;
}
