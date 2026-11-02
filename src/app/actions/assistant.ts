"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as asst from "@/server/assistant";
import type { AssistantConfig } from "@/lib/assistant";

// The assistant (Phase 13). The "do" flows call the same actions as the pages (leave, department flow), so the
// same permission checks apply.

export async function assistantDataAction(flow: string) {
  return wrap(async () => asst.assistantData(await requireViewer(), flow), { revalidate: false });
}
export async function logAssistantAction(e: Parameters<typeof asst.logAssistant>[1]) {
  return wrap(async () => asst.logAssistant(await requireViewer(), e), { revalidate: false });
}
export async function saveAssistantConfigAction(input: AssistantConfig) {
  return wrap(async () => asst.saveAssistantConfig(await requireViewer(), input));
}

// The AI assistant (Phase 13b): questions go to Claude when Admin turned it on; actions are proposals the person
// confirms, run by the pages' own functions.
import * as ai from "@/server/assistant-ai";

export async function askAiAction(input: { history: { role: "user" | "assistant"; text: string }[]; text: string; page?: string | null }) {
  return wrap(async () => ai.askAi(await requireViewer(), input), { revalidate: false });
}
export async function confirmProposalAction(token: string) {
  return wrap(async () => ai.confirmProposal(await requireViewer(), token));
}
export async function saveAiConfigAction(input: Parameters<typeof ai.saveAiConfig>[1]) {
  return wrap(async () => ai.saveAiConfig(await requireViewer(), input));
}
export async function testAiAction() {
  return wrap(async () => ai.testAi(await requireViewer()), { revalidate: false });
}
