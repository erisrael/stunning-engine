import { get, run, parseJson, nowIso } from "./db";
import { can, type AppUser } from "./users";
import { WorkflowError } from "./workflow";

export type QuestionRoutingConfig = {
  // Mapping of sender role to allowed recipient roles. An empty list denies recipients; "*" allows all roles.
  allowedRolesBySenderRole: Record<string, string[]>;
  leadOnlyBySenderRole?: Record<string, string[]>;
};

// Default configurable routing matrix:
// Customer Support / Staff can communicate with:
// - System Admin (admin, owner)
// - Publication Team Leads (publication)
// - Uploading Team Leads (uploading)
// - Finance Department (finance_manager, accountant)
// - Dev Team Lead (developer)
export const DEFAULT_QUESTION_ROUTING: QuestionRoutingConfig = {
  leadOnlyBySenderRole: { support: ["publication", "uploading", "developer"] },
  allowedRolesBySenderRole: {
    admin: ["*"], owner: ["*"], manager: ["*"],
    support: ["admin", "publication", "uploading", "finance_manager", "accountant", "developer"],
    staff: ["admin", "owner", "publication", "uploading", "finance_manager", "accountant", "developer", "manager"],
    customer_support: ["admin", "owner", "publication", "uploading", "finance_manager", "accountant", "developer", "manager"],
    editing: ["admin", "owner", "publication", "recording", "manager", "developer"],
    recording: ["admin", "owner", "editing", "manager"],
    uploading: ["admin", "owner", "publication", "developer", "manager"],
    publication: ["admin", "owner", "uploading", "developer", "manager", "finance_manager"],
    accountant: ["admin", "owner", "finance_manager", "developer", "manager"],
    finance_manager: ["admin", "owner", "accountant", "manager", "developer"],
    content: ["admin", "owner", "publication", "manager", "developer"],
    marketing: ["admin", "owner", "manager", "developer"],
  },
};

export async function getQuestionRoutingConfig(): Promise<QuestionRoutingConfig> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.question_routing'");
  if (!row?.value) return DEFAULT_QUESTION_ROUTING;
  const parsed = parseJson<QuestionRoutingConfig>(row.value, DEFAULT_QUESTION_ROUTING);
  return {
    leadOnlyBySenderRole: { ...DEFAULT_QUESTION_ROUTING.leadOnlyBySenderRole, ...parsed.leadOnlyBySenderRole },
    allowedRolesBySenderRole: {
      ...DEFAULT_QUESTION_ROUTING.allowedRolesBySenderRole,
      ...(parsed.allowedRolesBySenderRole || {}),
    },
  };
}

export async function saveQuestionRoutingConfig(user: AppUser, config: QuestionRoutingConfig) {
  if (!can(user, "settings.manage") && !can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can configure Question routing rules.");
  }

  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.question_routing', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(config),
    nowIso(),
    user.id
  );
}

export function getAllowedRecipientRoles(senderRoles: string[], config: QuestionRoutingConfig): string[] | "*" {
  const allowed = new Set<string>();
  let hasWildcard = false;

  for (const r of senderRoles) {
    const list = config.allowedRolesBySenderRole[r];
    if (!list) {
      // Fallback for unspecified roles: allow standard leadership + admin
      ["admin", "owner", "manager", "developer"].forEach((x) => allowed.add(x));
      continue;
    }
    if (list.includes("*")) {
      hasWildcard = true;
      break;
    }
    list.forEach((targetRole) => allowed.add(targetRole));
  }

  if (hasWildcard) return "*";

  return Array.from(allowed);
}


export async function eligibleQuestionRecipients(sender: AppUser) {
 const { userDirectory } = await import("./users");
 const { all } = await import("./db");
 const config=await getQuestionRoutingConfig();
 const allowed=getAllowedRecipientRoles(sender.roles,config);
 const leadOnly=new Set(sender.roles.flatMap(r=>config.leadOnlyBySenderRole?.[r]??[]));
 const leads=await all<{user_id:string;stage:string}>("SELECT user_id,stage FROM team_leads");
 const positions=await all<{user_id:string;department:string}>("SELECT user_id,department FROM department_positions WHERE position IN ('lead','head')");
 return (await userDirectory()).filter(u=>u.id!==sender.id && (allowed==="*" || u.roles.some(role=>allowed.includes(role) && (!leadOnly.has(role) || leads.some(l=>l.user_id===u.id&&l.stage===role) || positions.some(p=>p.user_id===u.id&&p.department===(role==="developer"?"dev":role))))));
}
