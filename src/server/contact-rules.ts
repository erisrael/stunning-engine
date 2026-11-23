// Who a team member may contact in questions and direct chats: their own team (teammates), their own team lead or
// department head, and HR. Nobody above that (managers, owners, Admin, other teams' leads); Admin hears from members
// through Feedback. Leads, heads, managers, HR and Admin are not limited by this rule. Someone above can still start
// a chat with a member, and the member can answer in it.

import { all, get } from "./db";
import { can, userDirectory, type AppUser, type UserLite } from "./users";
import { canManageChat } from "./chat";
import { STAGES } from "@/lib/domain";

const HR_ROLES = ["hr_manager", "hr_officer"];
// Roles that belong to a department of the same key (developer -> dev).
const ROLE_DEPT: Record<string, string> = { developer: "dev", content: "studio", hr_manager: "hr", hr_officer: "hr", finance_manager: "finance", accountant: "finance" };

// A plain team member: no lead, head, manager, HR or Admin rights.
export async function isPlainMember(user: AppUser) {
  if (user.leads.length) return false;
  if (can(user, "users.manage") || can(user, "settings.manage") || can(user, "work.override") || can(user, "hr.access") || can(user, "owners.view") || canManageChat(user)) return false;
  if (user.roles.some((r) => r === "admin" || r === "owner" || r === "manager" || r === "assistant_manager" || HR_ROLES.includes(r))) return false;
  return !(await get("SELECT 1 AS x FROM department_positions WHERE user_id = ? AND position IN ('head','lead')", user.id));
}

// The ids a plain member may contact (null: anyone, they are not a plain member).
export async function memberContactIds(user: AppUser): Promise<Set<string> | null> {
  if (!(await isPlainMember(user))) return null;
  const stages: string[] = user.roles.filter((r) => (STAGES as readonly string[]).includes(r));
  const myDepts = new Set([
    ...user.roles.map((r) => ROLE_DEPT[r] ?? r),
    ...(await all<{ department: string }>("SELECT department FROM department_positions WHERE user_id = ?", user.id)).map((d) => d.department),
  ]);
  const [leads, positions, people] = await Promise.all([
    all<{ user_id: string; stage: string }>("SELECT user_id, stage FROM team_leads"),
    all<{ user_id: string; department: string }>("SELECT user_id, department FROM department_positions"),
    userDirectory(),
  ]);
  const ids = new Set<string>();
  // Their own team lead and their departments' people (head, lead, members), even if the lead holds a higher role.
  for (const l of leads) if (stages.includes(l.stage)) ids.add(l.user_id);
  for (const p of positions) if (myDepts.has(p.department)) ids.add(p.user_id);
  const above = new Set(people.filter((u) => u.roles.some((r) => ["admin", "owner", "manager", "assistant_manager"].includes(r))).map((u) => u.id));
  for (const u of people) {
    if (u.roles.some((r) => HR_ROLES.includes(r))) ids.add(u.id); // HR
    else if (!above.has(u.id) && u.roles.some((r) => (user.roles as string[]).includes(r))) ids.add(u.id); // teammates
  }
  ids.delete(user.id);
  return ids;
}

// Everyone a member may reach: the above plus what Admin routes their role to (Question routing), so questions and
// direct chats follow the same rule. null: anyone.
async function reachable(user: AppUser): Promise<Set<string> | null> {
  if (!(await isPlainMember(user))) return null;
  const { eligibleQuestionRecipients } = await import("./question-routing");
  return new Set((await eligibleQuestionRecipients(user)).map((u) => u.id));
}

export async function contactFilter(user: AppUser): Promise<(u: Pick<UserLite, "id">) => boolean> {
  const ids = await reachable(user);
  return ids ? (u) => ids.has(u.id) : () => true;
}

export async function mayContact(user: AppUser, otherId: string) {
  const ids = await reachable(user);
  return !ids || ids.has(otherId);
}

export const MEMBER_CONTACT_RULE = "Team members contact their team, their team lead or head, and HR. Send anything for Admin through Feedback.";
