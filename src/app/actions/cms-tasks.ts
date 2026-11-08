"use server";
import { after } from "next/server";
import { requireViewer, inPreview } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { startCmsTask, cmsTaskStatus, cancelCmsTask, runCmsTask, type CmsTaskInput } from "@/server/cms-tasks";

export async function startCmsTaskAction(input:CmsTaskInput) {
  return wrap(async()=>{
    if(["sync","contacts"].includes(input.kind) && await inPreview()) throw new Error("Exit View as before refreshing stored CMS data.");
    const id=await startCmsTask(await requireViewer(),input);
    after(()=>runCmsTask(id));
    return {id};
  },{revalidate:false});
}
export async function cmsTaskStatusAction(id:string) {
  return wrap(async()=>{
    const status=await cmsTaskStatus(await requireViewer(),id);
    if(status.status==="queued") after(()=>runCmsTask(id));
    return status;
  },{revalidate:false});
}
export async function cancelCmsTaskAction(id:string) {
  return wrap(async()=>cancelCmsTask(await requireViewer(),id),{revalidate:false});
}
