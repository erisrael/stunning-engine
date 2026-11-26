"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as d from "@/server/tools-data";
import * as t from "@/server/tools";
import type { Letterhead } from "@/lib/tools";

// Tools hub actions. Each checks the person may use the app (Admin, Tools hub) and touches only their own rows.
// Saving a note or ticking a box does not refresh the whole page (revalidate: false): the screen already shows it.
const quiet = { revalidate: false } as const;

export async function saveNoteAction(input: Parameters<typeof d.saveNote>[1]) {
  return wrap(async () => d.saveNote(await requireViewer(), input), quiet);
}
export async function deleteNoteAction(id: string) {
  return wrap(async () => d.deleteNote(await requireViewer(), id), quiet);
}
export async function saveTaskAction(input: Parameters<typeof d.saveTask>[1]) {
  return wrap(async () => d.saveTask(await requireViewer(), input), quiet);
}
export async function setTaskDoneAction(id: string, done: boolean) {
  return wrap(async () => d.setTaskDone(await requireViewer(), id, done), quiet);
}
export async function deleteTaskAction(id: string) {
  return wrap(async () => d.deleteTask(await requireViewer(), id), quiet);
}
export async function searchRecordsAction(q: string) {
  return wrap(async () => d.searchRecords(await requireViewer(), q), quiet);
}
export async function saveReminderAction(input: Parameters<typeof d.saveReminder>[1]) {
  return wrap(async () => d.saveReminder(await requireViewer(), input), quiet);
}
export async function deleteReminderAction(id: string) {
  return wrap(async () => d.deleteReminder(await requireViewer(), id), quiet);
}
export async function regenerateFeedAction() {
  return wrap(async () => d.regenerateCalendarFeed(await requireViewer()), quiet);
}
export async function revokeFeedAction() {
  return wrap(async () => d.revokeCalendarFeed(await requireViewer()), quiet);
}
export async function crossCheckAction(rows: d.CrossRow[]) {
  return wrap(async () => d.crossCheck(await requireViewer(), rows), quiet);
}
export async function listFilesAction(kind: d.FileKind) {
  return wrap(async () => d.listFiles(await requireViewer(), kind), quiet);
}
export async function getFileAction(kind: d.FileKind, id: string) {
  return wrap(async () => d.getFile(await requireViewer(), kind, id), quiet);
}
export async function saveFileAction(kind: d.FileKind, input: { id?: string; title: string; data: unknown }) {
  return wrap(async () => d.saveFile(await requireViewer(), kind, input), quiet);
}
export async function deleteFileAction(kind: d.FileKind, id: string) {
  return wrap(async () => d.deleteFile(await requireViewer(), kind, id), quiet);
}
export async function nextLetterRefAction(prefix: string) {
  return wrap(async () => d.nextLetterRef(await requireViewer(), prefix), quiet);
}
export async function saveToolsAccessAction(input: Parameters<typeof t.saveToolsAccess>[1]) {
  return wrap(async () => t.saveToolsAccess(await requireViewer(), input));
}
export async function saveLetterheadAction(input: Letterhead) {
  return wrap(async () => t.saveLetterhead(await requireViewer(), input));
}

export async function connectNotionTokenAction(input: { token: string; page: string }) {
  return wrap(async () => (await import("@/server/tools-notion")).connectNotionToken(await requireViewer(), input), quiet);
}
export async function disconnectNotionAction() {
  return wrap(async () => {
    const v = await requireViewer();
    if (v.previewBy) throw new Error("View as is read only.");
    return (await import("@/server/tools-notion")).disconnectNotion(v);
  }, quiet);
}
export async function setNotionParentAction(page: string) {
  return wrap(async () => (await import("@/server/tools-notion")).setNotionParent(await requireViewer(), page), quiet);
}
export async function sendToNotionAction(input: { title: string; markdown: string }) {
  return wrap(async () => (await import("@/server/tools-notion")).sendToNotion(await requireViewer(), input), quiet);
}

export async function disconnectAppAction(clientId: string) {
  return wrap(async () => {
    const v = await requireViewer();
    if (v.previewBy) throw new (await import("@/server/workflow")).WorkflowError("FORBIDDEN", "View as is read only.");
    return (await import("@/server/oauth")).disconnectClient(v, clientId);
  }, quiet);
}
export async function createGptClientAction(input: { name: string; redirectUris: string[] }) {
  return wrap(async () => (await import("@/server/oauth")).createGptClient(await requireViewer(), input));
}
export async function revokeGptClientAction(clientId: string) {
  return wrap(async () => (await import("@/server/oauth")).revokeGptClient(await requireViewer(), clientId));
}
