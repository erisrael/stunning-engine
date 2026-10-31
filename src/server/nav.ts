// What the sidebar shows for a person. Someone working in a department (Dev, Marketing, Studio, or one created in
// Admin) gets that department as their own sidebar, as Recording or Editing is for production staff. People who
// oversee several departments (Admin, managers, owners) keep the Departments group with each one folded.

import { can, type AppUser } from "./users";
import { customDepartments, deptAccess } from "./departments";
import { getDeptConfig } from "./dept-config";
import { DEPARTMENT_ROLES, STAGES, type Department } from "@/lib/domain";
import { deptPath } from "@/lib/work";

export type HomeDept = {
  key: string;
  title: string;
  base: string;
  kind: "work" | "studio";
  // Leads and heads see everything and the team; heads (and Admin) configure.
  seeAll: boolean;
  configure: boolean;
  repos: boolean;
  accounting: boolean;
  position: string | null;
};

export function oversees(user: AppUser) {
  return can(user, "users.manage") || can(user, "owners.view") || can(user, "company.view") || can(user, "nav.overview");
}

export async function homeDepartment(user: AppUser & { activeRole: string }): Promise<HomeDept | null> {
  if (oversees(user)) return null;
  // The built-in department of the active role (Developer: Dev; Marketing; Content: Studio).
  let key: string | null = null;
  for (const d of ["dev", "marketing", "studio"] as Department[]) if ((DEPARTMENT_ROLES[d] as string[]).includes(user.activeRole)) key = d;
  let custom: { title: string; template: string } | null = null;
  // Otherwise a department created in Admin where the person has a position (not for production staff, whose
  // sidebar is their stage).
  if (!key && !(STAGES as readonly string[]).includes(user.activeRole)) {
    for (const c of await customDepartments()) {
      const a = await deptAccess(user, c.key);
      if (a.member) {
        key = c.key;
        custom = c;
        break;
      }
    }
  }
  if (!key) return null;
  const a = await deptAccess(user, key);
  if (!a.view || a.readOnly) return null;
  if (key === "studio") return { key, title: "Studio", base: "/studio", kind: "studio", seeAll: a.manage, configure: a.position === "head", repos: false, accounting: false, position: a.position };
  const cfg = await getDeptConfig(key);
  const rights = a.position ? cfg.rights[a.position] : null;
  return {
    key,
    title: cfg.title,
    base: deptPath(key),
    kind: "work",
    seeAll: !!rights?.seeAll,
    configure: !!rights?.configure,
    repos: key === "dev" || custom?.template === "dev",
    accounting: custom?.template === "finance",
    position: a.position,
  };
}
