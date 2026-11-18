"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as X from "@/server/sms-console";

// The SMS console (Update 1.2, System improvements 5).
const read = { revalidate: false } as const;
export const estimateSmsAction = async (input: X.ComposeInput) => wrap(async () => X.estimateSms(await requireViewer(), input), read);
export const sendSmsBatchAction = async (input: X.ComposeInput) => wrap(async () => X.sendSmsBatch(await requireViewer(), input));
export const smsHistoryAction = async (f: X.HistoryQuery) => wrap(async () => X.smsHistory(await requireViewer(), f), read);
export const exportSmsHistoryAction = async (f: X.HistoryQuery) => wrap(async () => X.exportSmsHistory(await requireViewer(), f), read);
export const smsUsageAction = async (f: { from?: string | null; until?: string | null }) => wrap(async () => X.smsUsage(await requireViewer(), f), read);
export const saveSmsPriceAction = async (connectorId: string, input: { perPart: number; currency: string; source?: string | null } | null) => wrap(async () => X.saveSmsPrice(await requireViewer(), connectorId, input));
export const refreshLivePriceAction = async (connectorId: string) => wrap(async () => X.refreshLivePrice(await requireViewer(), connectorId));
