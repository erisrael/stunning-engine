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
export async function testAppAction(id: string) {
  return wrap(async () => sd.testApp(await requireViewer(), id), { revalidate: false });
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
export async function reactAction(messageId: string, emoji: string) {
  return wrap(async () => sd.agentReact(await requireViewer(), messageId, emoji));
}
export async function askPhoneAction(ticketId: string) {
  return wrap(async () => (await import("@/server/support-channels")).askTelegramPhone(await requireViewer(), ticketId));
}
export async function recordPhoneAction(customerId: string, phone: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    await sd.needAgent(viewer);
    const r = await (await import("@/server/customer-records")).recordPhone(customerId, phone, "agent");
    if (!r) throw new Error("Enter a phone number.");
    return r.lines;
  });
}
export async function agentReplyAction(ticketId: string, input: { body: string; internal?: boolean; status?: sd.TicketStatus | null; replyTo?: string | null }) {
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
// Knowledge base, Update 1.1: guides, videos, bulk actions (import is a route: src/app/api/support/kb/route.ts).
export async function saveKbArticleAction(input: import("@/server/kb-guides").ArticleInput) {
  return wrap(async () => (await import("@/server/kb-guides")).saveKbArticle(await requireViewer(), input));
}
export async function checkVideoAction(url: string) {
  return wrap(async () => (await import("@/server/kb-guides")).checkVideoFor(await requireViewer(), url), { revalidate: false });
}
export async function bulkKbAction(ids: string[], action: "publish" | "unpublish" | "delete" | "move", category?: string | null) {
  return wrap(async () => (await import("@/server/kb-guides")).bulkKb(await requireViewer(), ids, action, category));
}
export async function connectTelegramAction(token: string) {
  return wrap(async () => (await import("@/server/support-channels")).connectTelegram(await requireViewer(), token, await (await import("@/server/password-reset")).appOrigin()));
}

// A quick look at a ticket (the slide-over preview): the last messages, the customer and the calls.
export async function ticketPreviewAction(ticketId: string) {
  return wrap(async () => {
    const d = await sd.ticketDetail(await requireViewer(), ticketId);
    const t = d.ticket as Record<string, unknown>;
    return {
      id: String(t.id),
      number: Number(t.number),
      subject: String(t.subject),
      status: String(t.status) as sd.TicketStatus,
      priority: String(t.priority),
      channel: String(t.channel),
      queue: (t.queue as string | null) ?? null,
      assignee: (t.assignee as string | null) ?? null,
      createdAt: String(t.created_at),
      customer: d.customer ? { name: d.customer.name, email: d.customer.email, phone: d.customer.phone, app: d.customer.app } : null,
      messages: d.messages.filter((m) => !m.internal).slice(-6).map((m) => ({ id: m.id, author: m.author, kind: m.author_kind, body: m.body.slice(0, 600), at: m.created_at })),
      calls: d.calls.slice(0, 5).map((c) => ({ id: c.id, direction: c.direction, status: c.status, startedAt: c.started_at, durationS: c.duration_s, recorded: !!c.recording_id })),
    };
  });
}

// Connected systems (Update 1.1, phase 11).
export async function saveSystemAction(id: string, input: Parameters<typeof import("@/server/connected-systems").saveSystem>[2]) {
  return wrap(async () => (await import("@/server/connected-systems")).saveSystem(await requireViewer(), id, input));
}
export async function newWebhookSecretAction(id: string) {
  return wrap(async () => (await import("@/server/connected-systems")).newWebhookSecret(await requireViewer(), id));
}
export async function connectSystemBotAction(id: string, token: string) {
  return wrap(async () => (await import("@/server/support-channels")).connectSystemBot(await requireViewer(), id, token, await (await import("@/server/password-reset")).appOrigin()));
}
export async function disconnectSystemBotAction(id: string) {
  return wrap(async () => (await import("@/server/support-channels")).disconnectSystemBot(await requireViewer(), id));
}
export async function agentSmsAction(ticketId: string, text: string) {
  return wrap(async () => sd.agentSms(await requireViewer(), ticketId, text));
}

// Live chat (Update 1.1, phase 12).
export async function agentTypingAction(ticketId: string) {
  return wrap(async () => sd.agentTyping(await requireViewer(), ticketId));
}
export async function agentReadAction(ticketId: string) {
  return wrap(async () => sd.agentRead(await requireViewer(), ticketId));
}

// The call center (src/server/support-calls.ts): hold, transfer, a colleague into the call, calling out, call-backs.
export async function holdCallAction(callId: string, on: boolean) {
  return wrap(async () => (await import("@/server/support-calls")).holdCall(await requireViewer(), callId, on), { revalidate: false });
}
export async function transferTargetsAction() {
  return wrap(async () => (await import("@/server/support-calls")).transferTargets(await requireViewer()), { revalidate: false });
}
export async function transferCallAction(callId: string, toUserId: string, note?: string | null) {
  return wrap(async () => (await import("@/server/support-calls")).transferCall(await requireViewer(), callId, toUserId, note));
}
export async function inviteToCallAction(callId: string, toUserId: string, offer: string) {
  return wrap(async () => (await import("@/server/support-calls")).inviteToCall(await requireViewer(), callId, toUserId, offer), { revalidate: false });
}
export async function dialInfoAction(ticketId: string) {
  return wrap(async () => (await import("@/server/support-calls")).dialInfo(await requireViewer(), ticketId), { revalidate: false });
}
export async function dialCustomerAction(ticketId: string, offer: string) {
  return wrap(async () => (await import("@/server/support-calls")).dialCustomer(await requireViewer(), ticketId, offer), { revalidate: false });
}
export async function startPhoneCallAction(input: { ticketId?: string | null; phone?: string | null; callbackId?: string | null }) {
  return wrap(async () => (await import("@/server/support-calls")).startPhoneCall(await requireViewer(), input));
}
export async function cancelCallbackAction(callId: string) {
  return wrap(async () => (await import("@/server/support-calls")).cancelCallback(await requireViewer(), callId));
}
export async function saveCallEngineAction(appId: string, input: { engine: "browser" | "phone"; phone?: string | null }) {
  return wrap(async () => (await import("@/server/support-calls")).saveCallEngine(await requireViewer(), appId, input));
}
