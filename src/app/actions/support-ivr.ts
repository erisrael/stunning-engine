"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as I from "@/server/support-ivr";
import * as Q from "@/server/support-queues";
import * as R from "@/server/call-records";
import type { IvrLang } from "@/lib/support-ivr";

// The phone menu (IVR), call queues and Call Records (Update 1.2, Phase 9).
const read = { revalidate: false } as const;
export const ivrFlowAction = async (id: string) => wrap(async () => I.flowDetail(await requireViewer(), id), read);
export const saveIvrFlowAction = async (input: Parameters<typeof I.saveFlowDraft>[1]) => wrap(async () => I.saveFlowDraft(await requireViewer(), input));
export const publishIvrFlowAction = async (id: string, note?: string | null) => wrap(async () => I.publishFlow(await requireViewer(), id, note));
export const restoreIvrVersionAction = async (id: string, version: number) => wrap(async () => I.restoreFlowVersion(await requireViewer(), id, version));
export const setIvrFlowActiveAction = async (id: string, on: boolean) => wrap(async () => I.setFlowActive(await requireViewer(), id, on));
export const deleteIvrFlowAction = async (id: string) => wrap(async () => I.deleteFlow(await requireViewer(), id));
export const testIvrAction = async (graph: unknown, keys: string[], lang: IvrLang) => wrap(async () => I.testIvr(await requireViewer(), graph, keys, { lang }), read);

export const saveQueueSettingsAction = async (id: string, input: Parameters<typeof Q.saveQueueSettings>[2]) => wrap(async () => Q.saveQueueSettings(await requireViewer(), id, input));
export const setAgentSkillsAction = async (agentId: string, skills: string[]) => wrap(async () => Q.setAgentSkills(await requireViewer(), agentId, skills));
export const queueBoardAction = async () => wrap(async () => Q.queueBoard(await requireViewer()), read);

export const callRecordAction = async (id: string) => wrap(async () => R.callRecordDetail(await requireViewer(), id), read);
export const updateCallRecordAction = async (id: string, input: Parameters<typeof R.updateCallRecord>[2]) => wrap(async () => R.updateCallRecord(await requireViewer(), id, input));
export const setLegalHoldAction = async (id: string, on: boolean, reason?: string | null) => wrap(async () => R.setLegalHold(await requireViewer(), id, on, reason));
export const exportCallRecordsAction = async (f: R.CallRecordFilters) => wrap(async () => R.exportCallRecords(await requireViewer(), f), read);
export const exportDashboardAction = async (f: import("@/server/support-dashboard").DashFilters, format: "csv" | "xlsx") => wrap(async () => (await import("@/server/support-dashboard")).exportDashboard(await requireViewer(), f, format), read);
