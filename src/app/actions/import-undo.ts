"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { decideUndo, requestUndo } from "@/server/import-undo";
import { saveIoPermissions, saveUndoConfig, type IoPermissions, type UndoConfig } from "@/server/io-rules";

export async function requestUndoAction(jobId: string, reason?: string) {
  return wrap(async () => requestUndo(await requireViewer(), jobId, reason));
}
export async function decideUndoAction(requestId: string, approve: boolean, note?: string) {
  return wrap(async () => decideUndo(await requireViewer(), requestId, approve, note));
}
export async function saveUndoConfigAction(c: Partial<UndoConfig>) {
  return wrap(async () => saveUndoConfig(await requireViewer(), c));
}
export async function saveIoPermissionsAction(p: Partial<IoPermissions>) {
  return wrap(async () => saveIoPermissions(await requireViewer(), p));
}
