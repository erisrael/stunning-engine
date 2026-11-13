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

export async function askAiAction(input: { history: { role: "user" | "assistant"; text: string }[]; text: string; page?: string | null; mode?: "ask" | "agent"; conversationId?: string | null }) {
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

export async function listAiModelsAction() {
  return wrap(async () => ai.listAiModels(await requireViewer()), { revalidate: false });
}

export async function saveAiModelAction(input: Parameters<typeof ai.saveAiModel>[1]) {
  return wrap(async () => ai.saveAiModel(await requireViewer(), input));
}

export async function deleteAiModelAction(id: string) {
  return wrap(async () => ai.deleteAiModel(await requireViewer(), id));
}

export async function setDefaultAiModelAction(id: string) {
  return wrap(async () => ai.setDefaultAiModel(await requireViewer(), id));
}

export async function testAiModelByIdAction(id: string) {
  return wrap(async () => ai.testAiModelById(await requireViewer(), id), { revalidate: false });
}

export async function saveAiPricesAction(prices: Record<string, { in: number; out: number }>) {
  return wrap(async () => ai.saveAiPrices(await requireViewer(), prices));
}
export async function aiConsoleAction(input: { prompt: string; modelId?: string | null }) {
  return wrap(async () => ai.aiConsole(await requireViewer(), input));
}

// Routines (Phase 13d) and the assistant's options per role.
import * as rt from "@/server/routines";
import { WorkflowError } from "@/server/workflow";

export async function listRoutinesAction() {
  return wrap(async () => rt.listRoutines(await requireViewer()), { revalidate: false });
}
export async function saveRoutineAction(input: Parameters<typeof rt.saveRoutine>[1]) {
  return wrap(async () => rt.saveRoutine(await requireViewer(), input));
}
export async function deleteRoutineAction(id: string) {
  return wrap(async () => rt.deleteRoutine(await requireViewer(), id));
}
export async function duplicateRoutineAction(id: string) {
  return wrap(async () => rt.duplicateRoutine(await requireViewer(), id));
}
export async function importRunRowsAction(routineId: string, form: FormData, dryRun: boolean) {
  return wrap(async () => {
    const f = form.get("file");
    if (!(f instanceof File) || !f.size) throw new WorkflowError("VALIDATION", "Choose the filled template.");
    return rt.importRunRows(await requireViewer(), routineId, f.name, await f.arrayBuffer(), dryRun);
  }, { revalidate: !dryRun });
}
export async function importRoutineAction(form: FormData) {
  return wrap(async () => {
    const f = form.get("file");
    if (!(f instanceof File) || !f.size) throw new WorkflowError("VALIDATION", "Choose a file.");
    return rt.importRoutine(await requireViewer(), { name: String(form.get("name") ?? "") || null, fileName: f.name, data: await f.arrayBuffer() });
  });
}
export async function decideBatchAction(batchId: string, approve: boolean, note?: string | null) {
  return wrap(async () => rt.decideBatch(await requireViewer(), batchId, approve, note));
}
export async function requestRunAction(routineId: string, values: Record<string, string>) {
  return wrap(async () => rt.requestRun(await requireViewer(), routineId, values), { revalidate: false });
}
export async function decideRunAction(runId: string, approve: boolean, note?: string | null) {
  return wrap(async () => rt.decideRun(await requireViewer(), runId, approve, note));
}
export async function startRunAction(runId: string) {
  return wrap(async () => rt.startRun(await requireViewer(), runId), { revalidate: false });
}
export async function finishRunAction(runId: string, ok: boolean, error?: string | null) {
  return wrap(async () => rt.finishRun(await requireViewer(), runId, ok, error), { revalidate: false });
}
export async function saveRoutinesConfigAction(input: Partial<rt.RoutinesConfig>) {
  return wrap(async () => rt.saveRoutinesConfig(await requireViewer(), input));
}
export async function saveRoleOptionsAction(input: Record<string, Partial<asst.RoleOptions>>) {
  return wrap(async () => asst.saveRoleOptions(await requireViewer(), input));
}

// The side panel's history and the agent's log.
export async function listConversationsAction() {
  return wrap(async () => ai.listConversations(await requireViewer()), { revalidate: false });
}
export async function loadConversationAction(id: string) {
  return wrap(async () => ai.loadConversation(await requireViewer(), id), { revalidate: false });
}
export async function deleteConversationAction(id: string) {
  return wrap(async () => ai.deleteConversation(await requireViewer(), id), { revalidate: false });
}
export async function agentActivityAction(everyone = false) {
  return wrap(async () => ai.agentActivity(await requireViewer(), { everyone }), { revalidate: false });
}

export async function equipmentReportAction() {
  return wrap(async()=>{
    const user=await requireViewer();
    const {resourceView,equipmentAdvice}=await import("@/server/resources");
    const view=await resourceView(user);
    return {total:view.equipment.length,items:view.equipment.map(e=>({tag:e.tag,name:e.name,status:e.status,advice:equipmentAdvice(e)})).filter(e=>e.advice.length)};
  },{revalidate:false});
}
