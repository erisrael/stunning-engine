import { all,get,run,tx,uid,nowIso,parseJson } from "./db";
import { type AppUser } from "./users";
import { workAccess } from "./dept-config";
import { deptAccess, requireDept, deptManagers } from "./departments";
import { flowRelease } from "./dept-flow";
import { WorkflowError } from "./workflow";
import { notify } from "./notifications";
export async function releaseProposals(user:AppUser,d:string) {
 const a=await workAccess(user,d), access=await deptAccess(user,d);
 const stages=a.config.flow.stages.filter(s=>s.kind==="release").map(s=>s.status);
 const tasks=await all<{id:string;code:string;title:string;status:string;assignee_id:string;reporter_id:string}>("SELECT id,code,title,status,assignee_id,reporter_id FROM dept_tasks WHERE dept=? AND status_category<>'cancelled'",d);
 const proposals=await all<{id:string;name:string;notes:string;status:string;review_note:string|null;author:string;task_ids:string}>("SELECT p.*,u.name AS author FROM dev_release_proposals p JOIN users u ON u.id=p.author_id WHERE p.dept=? ORDER BY p.created_at DESC",d);
 return {canApprove:access.manage&&!a.readOnly,tasks:tasks.filter(t=>stages.includes(t.status)&&(access.manage||t.assignee_id===user.id||t.reporter_id===user.id)),proposals:proposals.map(p=>({...p,taskIds:parseJson<string[]>(p.task_ids,[])}))};
}
export async function proposeRelease(user:AppUser,d:string,input:{name:string;notes:string;ids:string[]}) {
 await workAccess(user,d,"write");const view=await releaseProposals(user,d);
 const ids=[...new Set(input.ids)];
 if(!input.name.trim()||!input.notes.trim()||!ids.length||ids.some(id=>!view.tasks.some(t=>t.id===id))) throw new WorkflowError("VALIDATION","Name the release, add notes and select your ready tasks.");
 const id=uid("rp_");await run("INSERT INTO dev_release_proposals (id,dept,name,notes,task_ids,author_id,created_at) VALUES (?,?,?,?,?,?,?)",id,d,input.name.trim().slice(0,80),input.notes.trim().slice(0,20000),JSON.stringify(ids),user.id,nowIso());
 await notify(await deptManagers(d),{type:"approval",title:"Release ready for review",body:input.name,link:d==="dev"?"/dev/tools#releases":`/d/${d}/tools#releases`,dedupeKey:`release-proposal:${id}`},nowIso(),user.id);return id;
}
export async function decideRelease(user:AppUser,d:string,id:string,approve:boolean,note:string) {
 await requireDept(user,d,"manage");await workAccess(user,d,"write");
 if(!approve&&!note.trim()) throw new WorkflowError("VALIDATION","Explain why the release needs changes.");
 return tx(async()=>{
 const p=await get<{name:string;notes:string;task_ids:string;status:string}>("SELECT * FROM dev_release_proposals WHERE id=? AND dept=? FOR UPDATE",id,d);
 if(!p||p.status!=="submitted") throw new WorkflowError("INVALID_STATE","This proposal is no longer awaiting review.");
 let releaseId:string|null=null;
 if(approve){const ids=parseJson<string[]>(p.task_ids,[]);await all(`SELECT id FROM dept_tasks WHERE id IN (${ids.map(()=>"?").join(",")}) FOR UPDATE`,...ids);const result=await flowRelease(user,d,{name:p.name,notes:p.notes,ids});if(!result.id||result.results.some(r=>!r.ok)) throw new WorkflowError("INVALID_STATE","Some tasks are no longer ready. Update their workflow before approving.");releaseId=result.id;}
 await run("UPDATE dev_release_proposals SET status=?,review_note=?,reviewed_by=?,release_id=? WHERE id=?",approve?"released":"changes_requested",note.trim().slice(0,2000),user.id,releaseId,id);return releaseId;
 });
}
