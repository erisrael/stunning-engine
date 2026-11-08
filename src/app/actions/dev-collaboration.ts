"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { collaborationView, changeCollaboration } from "@/server/dev-collaboration";
export async function collaborationViewAction(dept: string) { return wrap(async () => collaborationView(await requireViewer(), dept), {revalidate:false}); }
export async function changeCollaborationAction(dept: string, input: Parameters<typeof changeCollaboration>[2]) { return wrap(async () => changeCollaboration(await requireViewer(),dept,input)); }
