import { all, get, run, tx, uid, nowIso } from "./db";
export { equipmentAdvice } from "@/lib/equipment";
import { can, type AppUser } from "./users";
import { customDepartments, deptAccess, requireDept } from "./departments";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/domain";
import { rights, listPurchases, requestPurchase, listBudgets } from "./finance";
import { WorkflowError, audit } from "./workflow";

export const EQUIPMENT_STATUSES = ["available","assigned","issued","repair","repair_needed","under_repair","replacement_needed","retired","lost"] as const;
export type Equipment = { id:string; tag:string; name:string; department:string; category:string; ownership:string; owner_id:string|null; assigned_to:string|null; status:string; quantity:number; reorder_level:number; purchase_cost:number; repair_cost:number; repairs:number; maintenance_due:string|null; warranty_until:string|null; notes:string; assigned_name?:string; owner_name?:string; updated_at:string };
const finance = (u:AppUser) => rights(u).view;
const manager = (u:AppUser) => can(u,"users.manage") || can(u,"finance.approve") || can(u,"finance.access");
export async function resourceView(user:AppUser) {
 const candidates=[...DEPARTMENTS.map(key=>({key,title:DEPARTMENT_LABELS[key]})),...(await customDepartments()).map(d=>({key:d.key,title:d.title}))];
 const departments=[{key:"general",title:"General / company"}];
 for(const d of candidates) if(finance(user) || (await deptAccess(user,d.key)).view) departments.push(d);
 const rows=await all<Equipment>("SELECT e.*, a.name AS assigned_name, o.name AS owner_name FROM equipment e LEFT JOIN users a ON a.id=e.assigned_to LEFT JOIN users o ON o.id=e.owner_id ORDER BY e.name");
 const equipment=[];
 for(const e of rows) { e.status=e.status==="issued"?"assigned":e.status==="repair"?"under_repair":e.status; }
 for(const e of rows) if(finance(user) || e.assigned_to===user.id || departments.some(d=>d.key===e.department)) equipment.push(e);

 // Financial Requests Scoping:
 // Finance and Super Admin see all requests across departments.
 // Team leads only see requests for the departments they lead.
 // Regular members only see their own submitted requests.
 let requests: Awaited<ReturnType<typeof listPurchases>> = [];
 if (finance(user) || can(user, "users.manage") || can(user, "finance.approve")) {
   requests = await listPurchases(user, false);
 } else {
   const allPurchases = await all<{ id: string; number: string; requester: string | null; requester_id: string | null; department: string | null; project: string | null; title: string; lines: string; estimate: number; vendor: string | null; vendor_id: string | null; status: string; note: string | null; received_note: string | null; created_at: string }>(
     `SELECT pr.*, u.name AS requester, v.name AS vendor 
      FROM fin_purchases pr 
      LEFT JOIN users u ON u.id = pr.requester_id 
      LEFT JOIN fin_parties v ON v.id = pr.vendor_id
      ORDER BY CASE pr.status WHEN 'submitted' THEN 0 WHEN 'approved' THEN 1 WHEN 'ordered' THEN 2 WHEN 'received' THEN 3 ELSE 4 END, pr.created_at DESC LIMIT 500`
   );

   const leadDepts = new Set<string>();
   for (const d of candidates) {
     const access = await deptAccess(user, d.key).catch(() => ({ manage: false, position: null }));
     if (access.manage || access.position === "head" || access.position === "lead" || user.leads.includes(d.key as any)) {
       leadDepts.add(d.key);
     }
   }

   requests = allPurchases.filter((pr) => {
     if (pr.requester_id === user.id) return true;
     if (pr.department && leadDepts.has(pr.department)) return true;
     return false;
   });
 }
 const requestIds=requests.map(r=>r.id);
 const comments=requestIds.length ? await all<{id:string;purchase_id:string;author:string;body:string;created_at:string}>(`SELECT c.*,u.name AS author FROM resource_comments c JOIN users u ON u.id=c.author_id WHERE c.purchase_id IN (${requestIds.map(()=>"?").join(",")}) ORDER BY c.created_at`,...requestIds) : [];
 const events=equipment.length ? await all<{id:string;equipment_id:string;actor:string;kind:string;note:string;quantity_delta:number;cost:number;created_at:string}>(`SELECT e.*,e.action AS kind,e.at AS created_at,u.name AS actor FROM equipment_events e JOIN users u ON u.id=e.actor_id WHERE e.equipment_id IN (${equipment.map(()=>"?").join(",")}) ORDER BY e.at DESC`,...equipment.map(e=>e.id)) : [];
 return {departments,equipment,requests,comments,events,canManage:manager(user),finance:finance(user),budgets:finance(user)?await listBudgets(user,Number(new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Addis_Ababa"}).slice(0,4))):[],people:manager(user)?await all<{id:string;name:string}>("SELECT id,name FROM users WHERE active=1 ORDER BY name"):[]};
}
export async function resourceRequest(user:AppUser,input:{department:string;kind:string;title:string;description:string;amount:number;quantity:number}) {
 if(!finance(user) && input.department !== "general") await requireDept(user,input.department,"write");
 if(!["device","subscription","budget","repair","replacement","other"].includes(input.kind) || !Number.isFinite(input.amount) || input.amount<0 || !Number.isInteger(input.quantity) || input.quantity<1) throw new WorkflowError("VALIDATION","Choose a valid request type, cost and quantity.");
 return requestPurchase(user,{department:input.department,title:`${input.kind}: ${input.title}`,note:input.description,lines:[{description:input.title,qty:input.quantity,price:input.amount}]});
}
export async function resourceComment(user:AppUser,id:string,body:string) {
 const purchase=await get<{requester_id:string;department:string}>("SELECT requester_id,department FROM fin_purchases WHERE id=?",id);
 if(!purchase || (!finance(user) && !can(user,"users.manage") && purchase.requester_id!==user.id)) throw new WorkflowError("FORBIDDEN","Only the requester and Finance can join this conversation.");
 if(!body.trim()) throw new WorkflowError("VALIDATION","Write a message.");
 await run("INSERT INTO resource_comments (id,purchase_id,author_id,body,created_at) VALUES (?,?,?,?,?)",uid(),id,user.id,body.trim().slice(0,5000),nowIso());
}
export async function saveEquipment(user:AppUser,input:Partial<Equipment>) {
 if(!manager(user)) throw new WorkflowError("FORBIDDEN","Finance or Admin manages inventory.");
 if(!input.name?.trim() || !input.tag?.trim() || !input.department) throw new WorkflowError("VALIDATION","Provide a name, unique asset tag and department.");
 if(!EQUIPMENT_STATUSES.includes(input.status as typeof EQUIPMENT_STATUSES[number]) || !["company","personal","leased"].includes(input.ownership ?? "")) throw new WorkflowError("VALIDATION","Choose a valid status and ownership.");
 for(const key of ["quantity","reorder_level","purchase_cost"] as const) if(!Number.isFinite(input[key]) || Number(input[key])<0) throw new WorkflowError("VALIDATION","Quantities and costs cannot be negative.");
 if(!Number.isInteger(input.quantity) || !Number.isInteger(input.reorder_level)) throw new WorkflowError("VALIDATION","Stock quantities must be whole numbers.");
 if(input.ownership==="personal" && !input.owner_id) throw new WorkflowError("VALIDATION","Choose the personal owner.");
 if(input.status==="assigned" && !input.assigned_to) throw new WorkflowError("VALIDATION","Choose the person holding this equipment.");
 for(const date of [input.maintenance_due,input.warranty_until]) if(date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) throw new WorkflowError("VALIDATION","Enter a valid date.");
 const id=input.id || uid("eq_"); const now=nowIso();
 await tx(async()=>{
 const old=input.id?await get<Equipment>("SELECT * FROM equipment WHERE id=? FOR UPDATE",id):null;
 if(input.id&&!old) throw new WorkflowError("NOT_FOUND","Equipment not found.");
 if(old) await run("UPDATE equipment SET tag=?,name=?,department=?,category=?,ownership=?,owner_id=?,assigned_to=?,status=?,reorder_level=?,purchase_cost=?,maintenance_due=?,warranty_until=?,notes=?,updated_at=? WHERE id=?",input.tag!.trim(),input.name!.trim(),input.department!,input.category||"equipment",input.ownership!,input.owner_id||null,input.assigned_to||null,input.status!,input.reorder_level!,input.purchase_cost!,input.maintenance_due||null,input.warranty_until||null,input.notes||"",now,id);
 else await run("INSERT INTO equipment (id,tag,name,department,category,ownership,owner_id,assigned_to,status,quantity,reorder_level,purchase_cost,maintenance_due,warranty_until,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,input.tag!.trim(),input.name!.trim(),input.department!,input.category||"equipment",input.ownership!,input.owner_id||null,input.assigned_to||null,input.status!,input.quantity!,input.reorder_level!,input.purchase_cost!,input.maintenance_due||null,input.warranty_until||null,input.notes||"",now,now);
 const holder=input.assigned_to ? await get<{id:string}>("SELECT id FROM employees WHERE user_id=?",input.assigned_to) : null;
 await run("UPDATE equipment SET holder_id=?,status=?,issued_at=CASE WHEN CAST(? AS TEXT) IS NULL THEN NULL ELSE COALESCE(issued_at,?) END WHERE id=?",holder?.id||null,input.status==="assigned"?"issued":input.status==="under_repair"?"repair":input.status,holder?.id||null,now.slice(0,10),id);
 await run("INSERT INTO equipment_events (id,equipment_id,actor_id,action,note,at) VALUES (?,?,?,?,?,?)",uid(),id,user.id,old?"updated":"registered",`${input.status}; assigned to ${input.assigned_to || "stock"}`,now);
 });
 await audit({actor:user},{action:"equipment.save",summary:`${user.name} saved ${input.tag}`});
 return id;
}
export async function equipmentEvent(user:AppUser,id:string,input:{kind:string;note:string;delta?:number;cost?:number}) {
 if(!input.note.trim()) throw new WorkflowError("VALIDATION","Explain the equipment update.");
 if(!["stock","repair_needed","under_repair","repair_completed","replacement_needed","retired","lost"].includes(input.kind)) throw new WorkflowError("VALIDATION","Choose a valid event.");
 await tx(async()=>{
 const e=await get<Equipment>("SELECT * FROM equipment WHERE id=? FOR UPDATE",id);
 if(!e) throw new WorkflowError("NOT_FOUND","Equipment not found.");
 if(!manager(user) && (e.assigned_to!==user.id || !["repair_needed","replacement_needed"].includes(input.kind))) throw new WorkflowError("FORBIDDEN","Only Finance manages stock and repairs. Assigned people can report faults.");
 const delta=input.kind==="stock"?Number(input.delta):0; const cost=Number(input.cost??0);
 if(!Number.isInteger(delta)||e.quantity+delta<0||!Number.isFinite(cost)||cost<0) throw new WorkflowError("VALIDATION","Invalid stock change or repair cost.");
 const status=input.kind==="stock"?e.status:input.kind==="repair_completed"?(e.assigned_to?"issued":"available"):input.kind==="under_repair"?"repair":input.kind;
 await run("UPDATE equipment SET status=?,quantity=quantity+?,repair_cost=repair_cost+?,repairs=repairs+?,updated_at=? WHERE id=?",status,delta,input.kind==="repair_completed"?cost:0,input.kind==="repair_completed"?1:0,nowIso(),id);
 await run("INSERT INTO equipment_events (id,equipment_id,actor_id,action,note,quantity_delta,cost,at) VALUES (?,?,?,?,?,?,?,?)",uid(),id,user.id,input.kind,input.note.trim().slice(0,5000),delta,cost,nowIso());
 });
}
