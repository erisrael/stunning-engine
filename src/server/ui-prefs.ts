// Workspace-wide interface choices Admin makes: which sidebar entries each role does not see by default.
import { get, nowIso, parseJson, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/domain";

export type SidebarDefaults = Partial<Record<Role, string[]>>;

export async function sidebarDefaults(): Promise<SidebarDefaults> {
  return parseJson<SidebarDefaults>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'ui.sidebar'"))?.value, {});
}

export async function saveSidebarDefaults(user: AppUser, role: Role, hidden: string[]) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin changes the sidebar for a role.");
  if (!ROLES.includes(role)) throw new WorkflowError("VALIDATION", "Unknown role.");
  const all = { ...(await sidebarDefaults()), [role]: [...new Set(hidden.filter((h) => typeof h === "string" && h.startsWith("/") || h === "views"))].slice(0, 60) };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('ui.sidebar', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(all),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.sidebar", summary: `${user.name} changed the sidebar for ${ROLE_LABELS[role]}` });
}
