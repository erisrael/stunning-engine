"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as ss from "@/server/sessions";

// Studio sessions: the Recording lead or a manager books and moves them; the operator marks them recorded.

export async function bookSessionAction(input: ss.BookingInput) {
  return wrap(async () => ss.bookSession(await requireViewer(), input));
}
export async function moveSessionAction(batchId: string, input: { date: string; time: string; room?: string | null }) {
  return wrap(async () => ss.moveSession(await requireViewer(), batchId, input));
}
export async function setSessionStatusAction(batchId: string, status: "completed" | "cancelled", note?: string | null) {
  return wrap(async () => ss.setSessionStatus(await requireViewer(), batchId, status, note));
}

export async function saveSessionsConfigAction(input: Partial<ss.SessionsConfig>) {
  return wrap(async () => ss.saveSessionsConfig(await requireViewer(), input));
}

export async function editSessionAction(batchId: string, input: ss.BookingInput) {
  return wrap(async () => ss.editSession(await requireViewer(), batchId, input));
}
export async function deleteSessionsAction(batchIds: string[]) {
  return wrap(async () => ss.deleteSessions(await requireViewer(), batchIds));
}
export async function setSessionsStatusAction(batchIds: string[], status: "completed" | "cancelled" | "scheduled") {
  return wrap(async () => ss.setSessionsStatus(await requireViewer(), batchIds, status));
}
// Preview (commit false) shows what each row would do; commit books or changes them.
export async function importSessionsAction(rows: ss.SessionImportRow[], commit: boolean) {
  return wrap(async () => ss.importSessions(await requireViewer(), rows, commit), { revalidate: commit });
}
