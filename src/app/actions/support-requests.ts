"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as R from "@/server/support-requests";
import type { RequestAction } from "@/lib/support-requests";

// Customer Support Requests (Update 1.2, Phase 7).
const read = { revalidate: false } as const;
export const supportRequestsAction = async (scope: "mine" | "inbox" | "approvals" | "all", status?: string | null) => wrap(async () => R.listSupportRequests(await requireViewer(), scope, status), read);
export const supportRequestAction = async (id: string) => wrap(async () => R.detail(await requireViewer(), id));
export const createSupportRequestAction = async (input: R.RequestInput) => wrap(async () => R.createSupportRequest(await requireViewer(), input));
export const supportRequestActAction = async (id: string, action: RequestAction, input: { text?: string | null } = {}) => wrap(async () => R.act(await requireViewer(), id, action, input));
export const assignSupportRequestAction = async (id: string, assigneeId: string | null) => wrap(async () => R.assignRequest(await requireViewer(), id, assigneeId));
export const commentSupportRequestAction = async (id: string, body: string) => wrap(async () => R.commentRequest(await requireViewer(), id, body));
export const deleteSupportRequestDraftAction = async (id: string) => wrap(async () => R.deleteDraft(await requireViewer(), id));
export const addSupportRequestFileAction = async (id: string, file: { name: string; mime: string; base64: string }) => wrap(async () => R.addRequestFile(await requireViewer(), id, file));
export const requestSetupAction = async () => wrap(async () => R.requestSetup(await requireViewer()), read);
export const saveRequestDestinationAction = async (input: Parameters<typeof R.saveDestination>[1]) => wrap(async () => R.saveDestination(await requireViewer(), input));
export const deleteRequestDestinationAction = async (id: string) => wrap(async () => R.deleteDestination(await requireViewer(), id));
export const saveRequestChainAction = async (input: Parameters<typeof R.saveChain>[1]) => wrap(async () => R.saveChain(await requireViewer(), input));
export const deleteRequestChainAction = async (id: string) => wrap(async () => R.deleteChain(await requireViewer(), id));
