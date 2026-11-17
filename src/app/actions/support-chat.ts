"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as M from "@/server/support-chat";
import * as F from "@/server/support-forward";

// Support conversations at team-chat level (Update 1.2, Phase 6): message actions, archive, escalation, forwarding.
const read = { revalidate: false } as const;
export const editSupportMessageAction = async (id: string, body: string) => wrap(async () => M.editSupportMessage(await requireViewer(), id, body));
export const deleteSupportMessageAction = async (id: string) => wrap(async () => M.deleteSupportMessage(await requireViewer(), id));
export const saveSupportMessageAction = async (id: string) => wrap(async () => M.toggleSavedMessage(await requireViewer(), id));
export const savedSupportMessagesAction = async () => wrap(async () => M.savedMessages(await requireViewer()), read);
export const reportSupportMessageAction = async (id: string, reason: string) => wrap(async () => M.reportSupportMessage(await requireViewer(), id, reason));
export const supportMessageDetailsAction = async (id: string) => wrap(async () => M.messageDetails(await requireViewer(), id), read);
export const archiveTicketAction = async (id: string, archived: boolean) => wrap(async () => M.archiveTicket(await requireViewer(), id, archived));
export const escalateTicketAction = async (id: string, note: string | null, on = true) => wrap(async () => M.escalateTicket(await requireViewer(), id, note, on));
export const forwardTargetsForAction = async () => wrap(async () => F.forwardTargetsFor(await requireViewer()), read);
export const forwardMessageAction = async (input: { messageId: string; targetId: string; note?: string | null }) => wrap(async () => F.forwardMessage(await requireViewer(), input));
export const forwardTargetsAction = async () => wrap(async () => F.listForwardTargets(await requireViewer()), read);
export const saveForwardTargetAction = async (input: Parameters<typeof F.saveForwardTarget>[1]) => wrap(async () => F.saveForwardTarget(await requireViewer(), input));
export const deleteForwardTargetAction = async (id: string) => wrap(async () => F.deleteForwardTarget(await requireViewer(), id));
export const pendingForwardsAction = async () => wrap(async () => F.pendingForwards(await requireViewer()), read);
export const decideForwardAction = async (id: string, approve: boolean) => wrap(async () => F.decideForward(await requireViewer(), id, approve));
