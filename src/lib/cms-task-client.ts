"use client";
import { startCmsTaskAction, cmsTaskStatusAction, cancelCmsTaskAction } from "@/app/actions/cms-tasks";
import type { CmsTaskInput } from "@/server/cms-tasks";

// Only short start/status requests cross the browser connection. Scraping continues
// on the server after that connection ends, with explicit progress/error states.
export async function waitForCmsTask<T>(input:CmsTaskInput,onProgress?:(message:string)=>void,isCancelled?:()=>boolean,onStart?:(id:string)=>void):Promise<T> {
  const started=await startCmsTaskAction(input);
  if(!started.ok || !started.data) throw new Error(!started.ok?started.error:"Could not start CMS request.");
  const id=started.data.id;
  onStart?.(id);
  let unavailable=0, polls=0;
  while(true) {
    if(isCancelled?.()) { await cancelCmsTaskAction(id); throw new Error("CMS request cancelled."); }
    let response;
    try { response=await cmsTaskStatusAction(id); unavailable=0; }
    catch(error) {
      if(++unavailable>3) throw new Error("Connection interrupted. The CMS job continues in the background; retry to reconnect.");
      onProgress?.("Reconnecting to the running CMS request…");
      await new Promise(resolve=>setTimeout(resolve,2000));continue;
    }
    if(!response.ok || !response.data) throw new Error(!response.ok?response.error:"CMS request status unavailable.");
    const task=response.data;
    onProgress?.(task.progress);
    if(task.status==="completed") return task.result as T;
    if(task.status==="failed" || task.status==="cancelled") throw new Error(task.progress);
    await new Promise(resolve=>setTimeout(resolve,polls++<10?300:800));
  }
}
