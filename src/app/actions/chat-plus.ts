"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { all } from "@/server/db";
import * as cx from "@/server/chat-extras";
import { maxUploadBytes } from "@/server/storage";
import { contactCard } from "@/server/profiles";

// Every action checks membership, chat management or Admin on the server (chat-extras.ts).
const READ = { revalidate: false };

export async function saveChatConfigAction(input: Partial<cx.ChatConfig>) {
  return wrap(async () => cx.saveChatConfig(await requireViewer(), input, Math.round(maxUploadBytes() / 1048576)));
}
export async function deleteConversationAction(groupId: string) {
  return wrap(async () => cx.deleteConversation(await requireViewer(), groupId));
}
export async function messageReadersAction(messageId: string) {
  return wrap(async () => cx.messageReaders(await requireViewer(), messageId), READ);
}
export async function searchMessagesAction(input: { q: string; groupId?: string | null; from?: string | null; to?: string | null }) {
  return wrap(async () => cx.searchMessages(await requireViewer(), input), READ);
}
export async function messagesFromAction(groupId: string, at: { date?: string; seq?: number }) {
  return wrap(async () => cx.messagesFrom(await requireViewer(), groupId, at), READ);
}
export async function newerMessagesAction(groupId: string, afterSeq: number) {
  return wrap(async () => cx.newerMessages(await requireViewer(), groupId, afterSeq), READ);
}
export async function sharedMediaAction(groupId: string) {
  return wrap(async () => cx.sharedMedia(await requireViewer(), groupId), READ);
}
export async function forwardPlainAction(messageId: string, groupIds: string[]) {
  return wrap(async () => cx.forwardPlain(await requireViewer(), messageId, groupIds));
}
// Chats someone can forward to: their groups and channels they may post in, and people (direct chats).
export async function forwardTargetsAction() {
  return wrap(async () => {
    const viewer = await requireViewer();
    const groups = await all<{ id: string; name: string; kind: string; member_role: string }>(
      "SELECT g.id, g.name, g.kind, m.member_role FROM chat_groups g JOIN chat_members m ON m.group_id = g.id AND m.user_id = ? WHERE g.archived = 0 AND g.kind <> 'direct' ORDER BY g.last_message_at DESC NULLS LAST",
      viewer.id,
    );
    const people = await all<{ id: string; name: string; handle: string }>("SELECT id, name, handle FROM users WHERE active = 1 AND id <> ? ORDER BY name", viewer.id);
    return {
      groups: groups.filter((g) => g.kind !== "channel" || g.member_role === "admin").map((g) => ({ id: g.id, name: g.name, kind: g.kind as "group" | "channel" })),
      people,
    };
  }, READ);
}
export async function contactCardAction(userId: string) {
  return wrap(async () => contactCard(await requireViewer(), userId), READ);
}
export async function presenceAction(userIds: string[]) {
  return wrap(async () => {
    const v = await requireViewer();
    await cx.touchPresence(v.id);
    return cx.presenceOf(userIds.slice(0, 200));
  }, READ);
}
