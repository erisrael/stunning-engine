"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as sup from "@/server/support";
import { chatUsage } from "@/server/chat-extras";

// Anyone sends feedback and reports; only Admin reads and answers them (checked in support.ts).
export async function sendFeedbackAction(input: { category: string; message: string; page?: string | null }) {
  return wrap(async () => sup.sendFeedback(await requireViewer(), input));
}
export async function answerFeedbackAction(id: string, input: { status: string; reply?: string | null }) {
  return wrap(async () => sup.answerFeedback(await requireViewer(), id, input));
}
export async function sendReportAction(input: sup.ReportInput) {
  return wrap(async () => sup.sendReport(await requireViewer(), input));
}
export async function handleReportAction(id: string, input: { status: string; resolution?: string | null; deleteMessage?: boolean; deactivateUser?: boolean }) {
  return wrap(async () => sup.handleReport(await requireViewer(), id, input));
}
export async function chatUsageAction() {
  return wrap(async () => chatUsage(await requireViewer()), { revalidate: false });
}
