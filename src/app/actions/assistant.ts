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
