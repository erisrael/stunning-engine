import { get, parseJson } from "./db";
import { getPermissionMatrix } from "./settings";
import { roleLabel, registerRoleLabels, type Role } from "@/lib/domain";
export async function roleCatalog() {
 const matrix=await getPermissionMatrix();
 const row=await get<{value:string}>("SELECT value FROM settings WHERE key='cfg.role_labels'");
 const labels=parseJson<Record<string,string>>(row?.value,{});
 registerRoleLabels(labels);
 return Object.keys(matrix).filter(k=>!k.startsWith("lead.")).map(key=>({key:key as Role,label:labels[key]||roleLabel(key)}));
}

// Admin's role names (Roles and permissions, created roles), for the browser's roleLabel.
export async function customRoleLabels(): Promise<Record<string, string>> {
 const row=await get<{value:string}>("SELECT value FROM settings WHERE key='cfg.role_labels'");
 const labels=parseJson<Record<string,string>>(row?.value,{});
 registerRoleLabels(labels);
 return labels;
}

// A role Admin can give: built in, a preset, or one created in Roles and permissions (never a team-lead key).
export async function isKnownRole(role: unknown): Promise<boolean> {
 if (typeof role !== "string" || role.startsWith("lead.")) return false;
 return Object.hasOwn(await getPermissionMatrix(), role);
}
export async function knownRoles(list: unknown[]): Promise<Role[]> {
 const matrix = await getPermissionMatrix();
 return list.filter((r): r is Role => typeof r === "string" && !r.startsWith("lead.") && Object.hasOwn(matrix, r));
}
