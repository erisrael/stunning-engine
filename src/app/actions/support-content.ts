"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as C from "@/server/support-content";

// Customer support, Content (Update 1.2, Phase 5): what the bot and the Mini App say.
const read = { revalidate: false } as const;
export const supportContentAction = async (bot: string) => wrap(async () => C.listSupportContent(await requireViewer(), bot), read);
export const saveSupportContentAction = async (input: Parameters<typeof C.saveContentDraft>[1]) => wrap(async () => C.saveContentDraft(await requireViewer(), input));
export const publishSupportContentAction = async (id: string, note?: string | null) => wrap(async () => C.publishContent(await requireViewer(), id, note));
export const enableSupportContentAction = async (id: string, enabled: boolean) => wrap(async () => C.setContentEnabled(await requireViewer(), id, enabled));
export const reorderSupportContentAction = async (bot: string, kind: string, keys: string[]) => wrap(async () => C.reorderContent(await requireViewer(), bot, kind, keys));
export const deleteSupportContentAction = async (id: string, allLanguages = false) => wrap(async () => C.deleteContent(await requireViewer(), id, allLanguages));
export const supportContentHistoryAction = async (id: string) => wrap(async () => C.contentHistory(await requireViewer(), id), read);
export const restoreSupportContentAction = async (versionId: string) => wrap(async () => C.restoreContentVersion(await requireViewer(), versionId));
