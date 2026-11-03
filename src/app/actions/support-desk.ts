"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as sd from "@/server/support-desk";

// The support desk (agents and leads) and its setup (Admin). Rights are checked on the server.
export async function saveSupportConfigAction(input: Partial<sd.SupportConfig>) {
  return wrap(async () => sd.saveSupportConfig(await requireViewer(), input));
}
export async function saveAppAction(input: Parameters<typeof sd.saveApp>[1]) {
  return wrap(async () => sd.saveApp(await requireViewer(), input));
}
export async function newAppSecretAction(id: string) {
  return wrap(async () => sd.newAppSecret(await requireViewer(), id), { revalidate: false });
}
export async function saveQueueAction(input: Parameters<typeof sd.saveQueue>[1]) {
  return wrap(async () => sd.saveQueue(await requireViewer(), input));
}
export async function setAgentStatusAction(status: "online" | "away" | "offline") {
  return wrap(async () => sd.setAgentStatus(await requireViewer(), status));
}
export async function setAgentLimitAction(agentId: string, maxOpen: number) {
  return wrap(async () => sd.setAgentLimit(await requireViewer(), agentId, maxOpen));
}
export async function agentReplyAction(ticketId: string, input: { body: string; internal?: boolean; status?: sd.TicketStatus | null }) {
  return wrap(async () => sd.agentReply(await requireViewer(), ticketId, input));
}
export async function setTicketStatusAction(ticketId: string, status: sd.TicketStatus) {
  return wrap(async () => sd.setTicketStatus(await requireViewer(), ticketId, status));
}
export async function assignTicketAction(ticketId: string, assigneeId: string | null) {
  return wrap(async () => sd.assignTicket(await requireViewer(), ticketId, assigneeId));
}
export async function updateTicketAction(ticketId: string, input: Parameters<typeof sd.updateTicket>[2]) {
  return wrap(async () => sd.updateTicket(await requireViewer(), ticketId, input));
}
export async function agentCreateTicketAction(input: Parameters<typeof sd.agentCreateTicket>[1]) {
  return wrap(async () => sd.agentCreateTicket(await requireViewer(), input));
}
export async function saveCannedAction(input: { id?: string | null; title: string; body: string }) {
  return wrap(async () => sd.saveCanned(await requireViewer(), input));
}
export async function deleteCannedAction(id: string) {
  return wrap(async () => sd.deleteCanned(await requireViewer(), id));
}
export async function logPhoneCallAction(ticketId: string, input: { direction: "inbound" | "outbound"; minutes: number; notes: string }) {
  return wrap(async () => sd.logPhoneCall(await requireViewer(), ticketId, input));
}
// Calls: polled by the desk while it is open (no page refresh).
export async function ringingAction() {
  return wrap(async () => sd.ringingFor(await requireViewer()), { revalidate: false });
}
export async function answerCallAction(callId: string, answer: string) {
  return wrap(async () => sd.answerCall(await requireViewer(), callId, answer), { revalidate: false });
}
export async function agentPollCallAction(callId: string) {
  return wrap(async () => sd.agentPollCall(await requireViewer(), callId), { revalidate: false });
}
export async function agentIceAction(callId: string, candidate: unknown) {
  return wrap(async () => sd.agentIce(await requireViewer(), callId, candidate), { revalidate: false });
}
export async function agentEndCallAction(callId: string, notes?: string | null) {
  return wrap(async () => sd.agentEndCall(await requireViewer(), callId, notes));
}
export async function iceAction() {
  return wrap(async () => (await requireViewer(), sd.iceConfig()), { revalidate: false });
}

// Knowledge base and channels.
export async function saveArticleAction(input: Parameters<typeof import("@/server/support-channels").saveArticle>[1]) {
  return wrap(async () => (await import("@/server/support-channels")).saveArticle(await requireViewer(), input));
}
export async function connectTelegramAction(token: string) {
  return wrap(async () => (await import("@/server/support-channels")).connectTelegram(await requireViewer(), token, await (await import("@/server/password-reset")).appOrigin()));
}
