import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { loadUser, type AppUser } from "./users";
import { WorkflowError } from "./workflow";
import * as cms from "./legacy-cms";
import { can } from "./users";

export type CmsTaskInput =
  | { kind: "live"; category: cms.LegacyCmsCategory; page?: number; pageSize?: number; search?: string; filters?: Record<string,string> }
  | { kind: "sync"; category: cms.LegacyCmsCategory | "all"; maxPages?: number }
  | { kind: "contacts" }
  | { kind: "auth" }
  // Update 1.0: rows in a date range, fetched date-first (see cms-range.ts), and the per-table measurement.
  | { kind: "range"; category: cms.LegacyCmsCategory; from: string; until: string; search?: string; filters?: Record<string,string>; refresh?: boolean; dateField?: string }
  | { kind: "probe" }
  // Every page of a table (search and Noor filters applied), fetched in parallel in one job.
  | { kind: "all"; category: cms.LegacyCmsCategory; search?: string; filters?: Record<string,string> };
type Task = { id:string; actor_id:string; kind:string; options_json:string; status:string; progress:string; result_json:string|null; updated_at:string };

async function authorize(user:AppUser, input:CmsTaskInput) {
  if (!input || !["live","sync","contacts","auth","range","probe","all"].includes(input.kind)) throw new WorkflowError("VALIDATION","Choose a CMS operation.");
  if (input.kind === "auth") {
    const allowed=(await Promise.all(user.roles.map(role=>cms.allowedCategoriesForUser(role,user.id)))).flat();
    if(!allowed.length) throw new WorkflowError("FORBIDDEN","No CMS tables are available to this account.");
    return;
  }
  if (input.kind === "probe") {
    if(!can(user,"data.manage") && !can(user,"users.manage")) throw new WorkflowError("FORBIDDEN","Only Admin or Data Managers can measure the Noor tables.");
    return;
  }
  const categories = input.kind === "contacts" ? ["students","parents","subscriptions"] as const
    : input.category === "all" ? cms.LEGACY_CMS_CATEGORIES.map(c=>c.key) : [input.category];
  if (categories.some(key=>!cms.LEGACY_CMS_CATEGORIES.some(c=>c.key===key))) throw new WorkflowError("VALIDATION","Unknown CMS table.");
  await cms.requireCmsCategories(user,[...categories]);
}

export async function startCmsTask(user:AppUser, input:CmsTaskInput) {
  await authorize(user,input);
  if (JSON.stringify(input).length > 12000) throw new WorkflowError("VALIDATION","CMS query is too large.");
  if (input.kind === "live") {
    input = { ...input, page:Math.max(1,Math.min(100000,Math.trunc(input.page || 1))), pageSize:[5,10,25,50,100,250].includes(input.pageSize || 10)?input.pageSize || 10:10, search:(input.search || "").slice(0,500) };
  }
  if (input.kind === "range") {
    const DAY=/^\d{4}-\d{2}-\d{2}$/;
    if(!DAY.test(input.from) || !DAY.test(input.until) || input.from>input.until) throw new WorkflowError("VALIDATION","Choose a valid date range.");
    input = { kind:"range", category:input.category, from:input.from, until:input.until, search:(input.search || "").slice(0,500), filters:input.filters || {}, refresh:!!input.refresh, dateField:/^[\w.]{1,80}$/.test(input.dateField || "")?input.dateField:undefined };
  }
  if (input.kind === "sync" && input.maxPages !== undefined && (!Number.isInteger(input.maxPages) || input.maxPages<1 || input.maxPages>100000)) throw new WorkflowError("VALIDATION","Choose a valid page limit.");
  await sweepCmsTasks();
  const options = JSON.stringify(input);
  return tx(async()=>{
    const existing = await get<{id:string}>("SELECT id FROM cms_tasks WHERE actor_id=? AND options_json=? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1",user.id,options);
    if (existing) return existing.id;
    const pending = await get<{n:number}>("SELECT COUNT(*) AS n FROM cms_tasks WHERE actor_id=? AND status IN ('queued','running')",user.id);
    if (Number(pending?.n || 0)>=4) throw new WorkflowError("VALIDATION","Four CMS requests are already running. Wait for one to finish or cancel it.");
    const id=uid("cms_");
    await run("INSERT INTO cms_tasks (id,actor_id,kind,options_json,status,progress,created_at,updated_at) VALUES (?,?,?,?,'queued','Waiting to start',?,?)",id,user.id,input.kind,options,nowIso(),nowIso());
    return id;
  });
}

async function ownedTask(user:AppUser,id:string) {
  const task=await get<Task>("SELECT * FROM cms_tasks WHERE id=? AND actor_id=?",id,user.id);
  if (!task) throw new WorkflowError("NOT_FOUND","CMS request not found.");
  await authorize(user,parseJson<CmsTaskInput>(task.options_json,{} as CmsTaskInput));
  return task;
}
export async function cmsTaskStatus(user:AppUser,id:string) {
  await sweepCmsTasks();
  const task=await ownedTask(user,id);
  return {id:task.id,status:task.status,progress:task.progress,result:task.status==="completed"?parseJson<unknown>(task.result_json,null):null};
}
export async function cancelCmsTask(user:AppUser,id:string) {
  await ownedTask(user,id);
  await run("UPDATE cms_tasks SET status='cancelled',progress='Cancelled',result_json=NULL,updated_at=? WHERE id=? AND status IN ('queued','running')",nowIso(),id);
}
// A completed range load, for exporting exactly what was previewed (owner only, re-authorized).
export async function completedRangeTask(user:AppUser,id:string) {
  const task=await ownedTask(user,id);
  if(task.kind!=="range" || task.status!=="completed") throw new WorkflowError("NOT_FOUND","Load the report again; this result has expired.");
  return { input: parseJson<Extract<CmsTaskInput,{kind:"range"}>>(task.options_json,{} as never), result: parseJson<import("./cms-range").CmsRangeResult>(task.result_json,null as never) };
}
async function sweepCmsTasks() {
  await run("UPDATE cms_tasks SET status='failed',progress='The server interrupted this request. Retry; existing cached records were preserved.',updated_at=? WHERE status='running' AND updated_at<?",nowIso(),new Date(Date.now()-10*60_000).toISOString());
  await run("DELETE FROM cms_tasks WHERE status NOT IN ('queued','running') AND updated_at<?",new Date(Date.now()-24*60*60_000).toISOString());
}

// Called after the HTTP response is sent. The database claim prevents duplicate workers.
// Progress stays readable while the upstream server is slow; only complete tables replace the cache.
export async function runCmsTask(id:string) {
  const task=await get<Task>("UPDATE cms_tasks SET status='running',progress='Connecting to Noor CMS…',updated_at=? WHERE id=? AND status='queued' RETURNING *",nowIso(),id);
  if (!task) return;
  // Parallel page loads report often; the database sees at most two progress writes a second.
  let lastWrite=0;
  const progress=async(message:string)=>{
    if(message!=="Complete" && Date.now()-lastWrite<500) return;
    lastWrite=Date.now();
    const current=await get<{status:string}>("SELECT status FROM cms_tasks WHERE id=?",id);
    if(current?.status!=="running") throw new Error("CMS request cancelled.");
    await run("UPDATE cms_tasks SET progress=?,updated_at=? WHERE id=? AND status='running'",message,nowIso(),id);
  };
  try {
    const user=await loadUser(task.actor_id);
    if(!user?.active) throw new Error("This account is no longer active.");
    const input=parseJson<CmsTaskInput>(task.options_json,{} as CmsTaskInput);
    await authorize(user,input);
    let result:unknown;
    if(input.kind==="auth") {
      result=await cms.checkLegacyCmsAuth(user);
    } else if(input.kind==="live") {
      await progress(`Loading ${input.category}, page ${input.page || 1}…`);
      const page=await cms.fetchLegacyCmsLivePage(user,input);
      if(!page.ok) throw new Error(page.message || "Noor CMS could not load this page. Retry this page.");
      result=page;
    } else if(input.kind==="range") {
      const { fetchCmsRange } = await import("./cms-range");
      result=await fetchCmsRange(user,input,progress);
    } else if(input.kind==="all") {
      const { fetchCmsAll } = await import("./cms-range");
      const r=await fetchCmsAll(user,{category:input.category,search:input.search,filters:input.filters},progress);
      result={ok:true,records:r.records,headers:r.headers,filters:r.filters,total:r.total,requests:r.requests};
    } else if(input.kind==="probe") {
      const { probeCmsTables } = await import("./cms-range");
      result=await probeCmsTables(user,progress);
    } else if(input.kind==="sync") {
      result=await cms.syncLegacyCms(user,{category:input.category,maxPages:input.maxPages,deep:true},progress);
      if(!(result as {ok:boolean}).ok) throw new Error((result as {message:string}).message);
    } else {
      for(const category of ["students","parents","subscriptions"] as const) {
        const synced=await cms.syncLegacyCms(user,{category,deep:true},progress);
        if(!synced.ok) throw new Error(synced.message);
      }
      result={ok:true,data:await cms.getStudentParentRelations()};
    }
    await progress("Complete");
    await run("UPDATE cms_tasks SET status='completed',progress='Complete',result_json=?,updated_at=? WHERE id=? AND status='running'",JSON.stringify(result),nowIso(),id);
  } catch(error) {
    const message=error instanceof Error?error.message:"CMS request failed. Retry this request.";
    await run("UPDATE cms_tasks SET status='failed',progress=?,result_json=NULL,updated_at=? WHERE id=? AND status='running'",message,nowIso(),id);
  }
}

export async function runQueuedCmsTasks() {
  await sweepCmsTasks();
  const queued=await all<{id:string}>("SELECT id FROM cms_tasks WHERE status='queued' ORDER BY created_at LIMIT 2");
  await Promise.all(queued.map(task=>runCmsTask(task.id)));
}
