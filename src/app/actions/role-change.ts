"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as rc from "@/server/role-change";
import type { Role, Stage } from "@/lib/domain";

// Every step is checked again on the server: who may change the person's roles, what they hold now, and the
// typed confirmation for a forced change.
export async function requestFinishFirstAction(userId: string, removal: { roles: Role[]; leads: Stage[] }, note: string) {
  return wrap(async () => rc.requestFinishFirst(await requireViewer(), userId, removal, note));
}
export async function applyRoleChangeAction(userId: string, removal: { roles: Role[]; leads: Stage[] }, forward: Record<string, string | null>, confirmName: string) {
  return wrap(async () => rc.applyRoleChange(await requireViewer(), userId, removal, forward, confirmName));
}
export async function cancelRoleChangeAction(id: string) {
  return wrap(async () => rc.cancelRoleChange(await requireViewer(), id));
}
export async function reportFinishedAction(id: string) {
  return wrap(async () => rc.reportFinished(await requireViewer(), id));
}
export async function resumeWorkAction(id: string) {
  return wrap(async () => rc.resumeWork(await requireViewer(), id));
}
export async function declineResumeAction(id: string) {
  return wrap(async () => rc.declineResume(await requireViewer(), id));
}
