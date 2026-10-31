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
