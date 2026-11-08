import { get, parseJson } from "./db";
import { getPermissionMatrix } from "./settings";
import { ROLE_LABELS, type Role } from "@/lib/domain";
export async function roleCatalog() {
 const matrix=await getPermissionMatrix();
 const row=await get<{value:string}>("SELECT value FROM settings WHERE key='cfg.role_labels'");
 const labels=parseJson<Record<string,string>>(row?.value,{});
 return Object.keys(matrix).filter(k=>!k.startsWith("lead.")).map(key=>({key:key as Role,label:labels[key]||ROLE_LABELS[key as Role]||key}));
}
