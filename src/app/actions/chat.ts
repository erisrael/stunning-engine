"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { all, get, nowIso, run, tx, uid } from "@/server/db";
import { notify } from "@/server/notifications";
import { audit, WorkflowError } from "@/server/workflow";
import {
  canManageChat,
  canManageGroup,
  changedMessages,
  cleanupChatFiles,
  directGroup,
  dmKey,
  groupMembers,
  groupMessages,
  membership,
  pinnedMessages,
  publicChannels,
  touchMessage,
  VOICE_TTL_MS,
  VOICE_UNPLAYED_TTL_MS,
} from "@/server/chat";
import { can, canViewItem } from "@/server/users";
import { canContactOwners, ownerIds } from "@/server/departments";
import { maxUploadBytes, objectExists, signedUploadUrl, storageKind } from "@/server/storage";
import { removeSubscription, saveSubscription, sendPush, subscriptionCount, vapidKeys } from "@/server/push";
import { verifyPassword } from "@/server/passwords";
import { headers } from "next/headers";
import crypto from "node:crypto";

const NO_REVALIDATE = { revalidate: false };

async function requireMember(groupId: string) {
  const viewer = await requireViewer();
  const m = await membership(groupId, viewer.id);
  if (!m && !canManageChat(viewer)) throw new WorkflowError("FORBIDDEN", "You are not a member of this group.");
  return { viewer, member: m };
}

async function requireManage(groupId: string) {
  const viewer = await requireViewer();
  if (!(await canManageGroup(viewer, groupId))) throw new WorkflowError("FORBIDDEN", "Only managers, admins and group admins can manage this group.");
  return viewer;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

// Direct messages arrive already encrypted in the browser ({"v":1,"iv":..,"ct":..}); the server only stores them.
type SendKind = "text" | "file" | "voice" | "call";

// Attaches an uploaded file to the message being sent, after checking it belongs to this person and chat.
async function claimFile(fileId: string, groupId: string, userId: string) {
  const f = await get<{ uploader_id: string; group_id: string; message_id: string | null; storage: string; path: string; kind: string }>(
    "SELECT uploader_id, group_id, message_id, storage, path, kind FROM chat_files WHERE id = ? AND deleted_at IS NULL",
    fileId,
  );
  if (!f || f.uploader_id !== userId || f.group_id !== groupId || f.message_id) throw new WorkflowError("VALIDATION", "The upload was not found. Try again.");
  const stored = f.storage === "supabase" ? await objectExists(f.path) : !!(await get("SELECT 1 AS x FROM chat_blobs WHERE file_id = ?", fileId));
  if (!stored) throw new WorkflowError("VALIDATION", "The upload did not finish. Try again.");
  return f;
}

export async function sendMessageAction(input: {
  groupId: string;
  body: string;
  replyToId?: string | null;
  encrypted?: boolean;
  kind?: SendKind;
  meta?: { fileId?: string; provider?: string } | null;
}) {
  return wrap(async () => {
    const { viewer, member } = await requireMember(input.groupId);
    if (!member) throw new WorkflowError("FORBIDDEN", "Join the group to send messages.");
    const group = await get<{ name: string; archived: number; kind: string }>("SELECT name, archived, kind FROM chat_groups WHERE id = ?", input.groupId);
    if (!group || group.archived) throw new WorkflowError("INVALID_STATE", "This group is archived.");
    if (group.kind === "channel" && member.member_role !== "admin") throw new WorkflowError("FORBIDDEN", "Only channel admins post here. You can react to posts.");
    const kind: SendKind = input.kind && ["file", "voice", "call"].includes(input.kind) ? input.kind : "text";
    const body = input.body.trim();
    const withFile = kind === "file" || kind === "voice";
    if (!body && !withFile) throw new WorkflowError("VALIDATION", "Write a message first.");
    let meta: Record<string, unknown> | null = null;
    if (withFile) {
      if (!input.meta?.fileId) throw new WorkflowError("VALIDATION", "Attach a file first.");
      await claimFile(input.meta.fileId, input.groupId, viewer.id);
      meta = { fileId: input.meta.fileId };
    }
    if (kind === "call") meta = { provider: input.meta?.provider === "meet" ? "meet" : "jitsi" };
    const attach = async (messageId: string) => {
      if (!meta?.fileId) return;
      await run("UPDATE chat_files SET message_id = ? WHERE id = ?", messageId, meta.fileId as string);
    };
    if (group.kind === "direct") {
      if (!input.encrypted || !/^\{"v":1,"iv":"[^"]+","ct":"[^"]+"\}$/.test(body))
        throw new WorkflowError("VALIDATION", "Direct messages must be encrypted on your device. Reload the page and unlock secure chat.");
      if (body.length > 12000) throw new WorkflowError("VALIDATION", "Messages are limited to 4,000 characters.");
      const now = nowIso();
      const id = uid("msg_");
      await run(
        "INSERT INTO chat_messages (id, group_id, author_id, body, reply_to_id, encrypted, kind, meta, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
        id,
        input.groupId,
        viewer.id,
        body,
        input.replyToId ?? null,
        kind,
        meta ? JSON.stringify(meta) : null,
        now,
      );
      await attach(id);
      await run("UPDATE chat_groups SET last_message_at = ? WHERE id = ?", now, input.groupId);
      await run("UPDATE chat_members SET last_read_at = ? WHERE group_id = ? AND user_id = ?", now, input.groupId, viewer.id);
      const others = (await all<{ user_id: string }>("SELECT user_id FROM chat_members WHERE group_id = ? AND user_id <> ?", input.groupId, viewer.id)).map((m) => m.user_id);
      const label = kind === "voice" ? "Voice message" : kind === "file" ? "File" : kind === "call" ? "Call started" : "Encrypted message";
      await notify(others, { type: "mention", title: `New message from ${viewer.name}`, body: label, link: `/chat?g=${input.groupId}`, groupKey: `dm:${input.groupId}` }, now, viewer.id);
      return id;
    }
    if (body.length > 4000) throw new WorkflowError("VALIDATION", "Messages are limited to 4,000 characters.");
    // A production item code in the message links the item (for example MY-G09-MATH-U01-L02).
    let itemId: string | null = null;
    const code = body.match(/\b[A-Z]{1,6}-G\d{2}-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/)?.[0];
    if (code) {
      const item = await get<{ id: string }>("SELECT id FROM items WHERE code = ?", code);
      if (item && (await canViewItem(viewer, item.id))) itemId = item.id;
    }
    const now = nowIso();
    const id = uid("msg_");
    await run(
      "INSERT INTO chat_messages (id, group_id, author_id, body, reply_to_id, item_id, kind, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      input.groupId,
      viewer.id,
      body,
      input.replyToId ?? null,
      itemId,
      kind,
      meta ? JSON.stringify(meta) : null,
      now,
    );
    await attach(id);
    await run("UPDATE chat_groups SET last_message_at = ? WHERE id = ?", now, input.groupId);
    await run("UPDATE chat_members SET last_read_at = ? WHERE group_id = ? AND user_id = ?", now, input.groupId, viewer.id);

    // @mentions of members and replies notify (chat messages themselves only raise the unread badge).
    const handles = [...body.matchAll(/@([a-z0-9._-]+)/gi)].map((m) => m[1].toLowerCase().replace(/\.$/, ""));
    const everyone = handles.includes("all") || handles.includes("everyone");
    const members = await all<{ user_id: string; handle: string }>(
      "SELECT m.user_id, u.handle FROM chat_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ?",
      input.groupId,
    );
    const mentioned = members.filter((m) => everyone || handles.includes(m.handle)).map((m) => m.user_id);
    if (input.replyToId) {
      const parent = await get<{ author_id: string }>("SELECT author_id FROM chat_messages WHERE id = ?", input.replyToId);
      if (parent) mentioned.push(parent.author_id);
    }
    await notify(
      mentioned,
      {
        type: "mention",
        title: `${viewer.name} in ${group.name}`,
        body: body.slice(0, 160),
        link: `/chat?g=${input.groupId}#${id}`,
        itemId,
        groupKey: `chat:${input.groupId}`,
      },
      now,
      viewer.id,
    );
    // Everyone else in the chat who has not muted it gets a push (mentions already got one with the notice).
    const muted = new Set((await all<{ user_id: string }>("SELECT user_id FROM chat_members WHERE group_id = ? AND muted = 1", input.groupId)).map((m) => m.user_id));
    const preview = kind === "voice" ? "Voice message" : kind === "file" ? `File${body ? `: ${body}` : ""}` : kind === "call" ? "Started a call" : body;
    await sendPush(
      members.map((m) => m.user_id).filter((u) => u !== viewer.id && !muted.has(u) && !mentioned.includes(u)),
      { title: `${viewer.name} in ${group.name}`, body: preview.slice(0, 140), link: `/chat?g=${input.groupId}`, tag: `chat:${input.groupId}` },
    );
    return id;
  }, NO_REVALIDATE);
}

export async function editMessageAction(id: string, body: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const m = await get<{ author_id: string; deleted_at: string | null; encrypted: number }>("SELECT author_id, deleted_at, encrypted FROM chat_messages WHERE id = ?", id);
    if (m?.encrypted && !/^\{"v":1,"iv":"[^"]+","ct":"[^"]+"\}$/.test(body.trim())) throw new WorkflowError("VALIDATION", "Edits to direct messages must be encrypted on your device.");
    if (!m || m.deleted_at) throw new WorkflowError("NOT_FOUND", "Message not found.");
    if (m.author_id !== viewer.id) throw new WorkflowError("FORBIDDEN", "You can only edit your own messages.");
    if (!body.trim()) throw new WorkflowError("VALIDATION", "A message cannot be empty.");
    await run("UPDATE chat_messages SET body = ?, edited_at = ? WHERE id = ?", body.trim(), nowIso(), id);
  }, NO_REVALIDATE);
}

export async function deleteMessageAction(id: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const m = await get<{ author_id: string; group_id: string }>("SELECT author_id, group_id FROM chat_messages WHERE id = ?", id);
    if (!m) throw new WorkflowError("NOT_FOUND", "Message not found.");
    if (m.author_id !== viewer.id && !(await canManageGroup(viewer, m.group_id))) throw new WorkflowError("FORBIDDEN", "You can only delete your own messages.");
    await run("UPDATE chat_messages SET deleted_at = ?, pinned = 0 WHERE id = ?", nowIso(), id);
  }, NO_REVALIDATE);
}

export async function pinMessageAction(id: string, pinned: boolean) {
  return wrap(async () => {
    const m = await get<{ group_id: string; kind: string }>("SELECT c.group_id, g.kind FROM chat_messages c JOIN chat_groups g ON g.id = c.group_id WHERE c.id = ?", id);
    if (!m) throw new WorkflowError("NOT_FOUND", "Message not found.");
    // Either person can pin in a direct chat; in groups and channels, their admins.
    if (m.kind === "direct") await requireMember(m.group_id);
    else await requireManage(m.group_id);
    await run("UPDATE chat_messages SET pinned = ? WHERE id = ?", pinned, id);
    await touchMessage(id);
  }, NO_REVALIDATE);
}

// Polling endpoint for an open conversation: new messages after a sequence number, edits since a time.
export async function pollMessagesAction(input: { groupId: string; afterSeq: number; since: string }) {
  return wrap(async () => {
    const { viewer, member } = await requireMember(input.groupId);
    const now = nowIso();
    await cleanupChatFiles(10);
    const fresh = await groupMessages(input.groupId, { afterSeq: input.afterSeq, viewerId: viewer.id });
    const changed = await changedMessages(input.groupId, input.since, viewer.id);
    if (member) await run("UPDATE chat_members SET last_read_at = ? WHERE group_id = ? AND user_id = ?", now, input.groupId, viewer.id);
    return { fresh, changed, at: now };
  }, NO_REVALIDATE);
}

export async function olderMessagesAction(groupId: string, beforeSeq: number) {
  return wrap(async () => {
    const { viewer } = await requireMember(groupId);
    return await groupMessages(groupId, { beforeSeq, limit: 60, viewerId: viewer.id });
  }, NO_REVALIDATE);
}

export async function groupInfoAction(groupId: string) {
  return wrap(async () => {
    const { viewer } = await requireMember(groupId);
    const g = await get<{ invite_token: string | null; visibility: string }>("SELECT invite_token, visibility FROM chat_groups WHERE id = ?", groupId);
    const manage = await canManageGroup(viewer, groupId);
    return { members: await groupMembers(groupId), pinned: await pinnedMessages(groupId, viewer.id), inviteToken: manage ? (g?.invite_token ?? null) : null, visibility: g?.visibility ?? "private" };
  }, NO_REVALIDATE);
}

export async function markReadAction(groupId: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    await run("UPDATE chat_members SET last_read_at = ? WHERE group_id = ? AND user_id = ?", nowIso(), groupId, viewer.id);
  }, NO_REVALIDATE);
}

export async function muteGroupAction(groupId: string, muted: boolean) {
  return wrap(async () => {
    const viewer = await requireViewer();
    await run("UPDATE chat_members SET muted = ? WHERE group_id = ? AND user_id = ?", muted, groupId, viewer.id);
  });
}

// ---------------------------------------------------------------------------
// Groups and members (managers, admins and group admins)
// ---------------------------------------------------------------------------

export async function createGroupAction(input: { name: string; description?: string; color?: string; memberIds: string[] }) {
  return wrap(async () => {
    const viewer = await requireViewer();
    if (!canManageChat(viewer)) throw new WorkflowError("FORBIDDEN", "Only managers and admins can create groups.");
    const name = input.name.trim();
    if (!name) throw new WorkflowError("VALIDATION", "Name the group.");
    if (name.length > 60) throw new WorkflowError("VALIDATION", "Group names are limited to 60 characters.");
    const id = uid("grp_");
    const now = nowIso();
    await tx(async () => {
      await run(
        "INSERT INTO chat_groups (id, name, description, kind, color, created_by, last_message_at, created_at) VALUES (?, ?, ?, 'group', ?, ?, ?, ?)",
        id,
        name,
        input.description?.trim() || null,
        input.color || "#7b68ee",
        viewer.id,
        now,
        now,
      );
      for (const u of new Set([viewer.id, ...input.memberIds]))
        await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", id, u, u === viewer.id ? "admin" : "member", now);
      await run("INSERT INTO chat_messages (id, group_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("msg_"), id, viewer.id, `${viewer.name} created the group.`, now);
    });
    await audit({ actor: viewer }, { action: "chat.group_created", summary: `${viewer.name} created chat group ${name}` });
    return id;
  });
}

export async function updateGroupAction(groupId: string, patch: { name?: string; description?: string | null; color?: string; archived?: boolean }) {
  return wrap(async () => {
    const viewer = await requireManage(groupId);
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new WorkflowError("VALIDATION", "Name the group.");
      await run("UPDATE chat_groups SET name = ? WHERE id = ?", patch.name.trim(), groupId);
    }
    if (patch.description !== undefined) await run("UPDATE chat_groups SET description = ? WHERE id = ?", patch.description?.trim() || null, groupId);
    if (patch.color) await run("UPDATE chat_groups SET color = ? WHERE id = ?", patch.color, groupId);
    if (patch.archived !== undefined) await run("UPDATE chat_groups SET archived = ? WHERE id = ?", patch.archived, groupId);
    await audit({ actor: viewer }, { action: "chat.group_updated", summary: `${viewer.name} updated a chat group`, newValue: patch });
  });
}

export async function setMembersAction(groupId: string, input: { add?: string[]; remove?: string[] }) {
  return wrap(async () => {
    const viewer = await requireManage(groupId);
    if (input.add?.length && !canContactOwners(viewer)) {
      const owners = await ownerIds();
      if (input.add.some((u) => owners.has(u))) throw new WorkflowError("FORBIDDEN", "Only managers and admins add owners to groups.");
    }
    const now = nowIso();
    const names = async (ids: string[]) =>
      ids.length ? (await all<{ name: string }>(`SELECT name FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids)).map((u) => u.name).join(", ") : "";
    await tx(async () => {
      for (const u of input.add ?? []) await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, 'member', ?) ON CONFLICT DO NOTHING", groupId, u, now);
      for (const u of input.remove ?? []) await run("DELETE FROM chat_members WHERE group_id = ? AND user_id = ?", groupId, u);
      const added = await names(input.add ?? []);
      const removed = await names(input.remove ?? []);
      const note = [added && `added ${added}`, removed && `removed ${removed}`].filter(Boolean).join(" and ");
      if (note) await run("INSERT INTO chat_messages (id, group_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("msg_"), groupId, viewer.id, `${viewer.name} ${note}.`, now);
    });
    if (input.add?.length) {
      const g = await get<{ name: string }>("SELECT name FROM chat_groups WHERE id = ?", groupId);
      await notify(input.add, { type: "discussion", title: `You were added to ${g?.name ?? "a group"}`, link: `/chat?g=${groupId}`, dedupeKey: `chat-add:${groupId}:${now}` }, now, viewer.id);
    }
  });
}

export async function setMemberRoleAction(groupId: string, userId: string, role: "admin" | "member") {
  return wrap(async () => {
    await requireManage(groupId);
    await run("UPDATE chat_members SET member_role = ? WHERE group_id = ? AND user_id = ?", role, groupId, userId);
  });
}

export async function leaveGroupAction(groupId: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    await run("DELETE FROM chat_members WHERE group_id = ? AND user_id = ?", groupId, viewer.id);
    await run("INSERT INTO chat_messages (id, group_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("msg_"), groupId, viewer.id, `${viewer.name} left the group.`, nowIso());
  });
}

export async function joinGroupAction(groupId: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    if (!canManageChat(viewer)) throw new WorkflowError("FORBIDDEN", "Ask a manager to add you to this group.");
    await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, 'admin', ?) ON CONFLICT DO NOTHING", groupId, viewer.id, nowIso());
  });
}

// ---------------------------------------------------------------------------
// Direct chats and end-to-end keys
// ---------------------------------------------------------------------------

export async function openDirectAction(userId: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    if (userId === viewer.id) throw new WorkflowError("VALIDATION", "Choose someone else.");
    const other = await get<{ id: string }>("SELECT id FROM users WHERE id = ? AND active = 1", userId);
    if (!other) throw new WorkflowError("NOT_FOUND", "That person is not active.");
    // Owners are contacted directly only by people allowed to, unless the owner already started the conversation.
    if (!canContactOwners(viewer) && (await ownerIds()).has(userId) && !(await get("SELECT 1 AS x FROM chat_groups WHERE dm_key = ?", dmKey(viewer.id, userId))))
      throw new WorkflowError("FORBIDDEN", "Owners are contacted through your manager. An owner can start a chat with you.");
    return await directGroup(viewer.id, userId);
  });
}

// The public key is shared; the private key is stored only after the browser wraps it with the person's chat passphrase.
export async function saveChatKeysAction(input: { publicKey: string; privateEnc: string; kdf?: "login" | "passphrase"; rewrap?: boolean }) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const pub = JSON.parse(input.publicKey) as { kty?: string; crv?: string; d?: string };
    const enc = JSON.parse(input.privateEnc) as { salt?: string; iv?: string; ct?: string };
    if (pub.kty !== "EC" || pub.crv !== "P-256" || pub.d) throw new WorkflowError("VALIDATION", "Invalid public key.");
    if (!enc.iv || !enc.ct || (input.kdf !== "login" && !enc.salt)) throw new WorkflowError("VALIDATION", "Invalid key backup.");
    // Re-wrapping (after a password change) must keep the same key pair, or older messages would become unreadable.
    if (input.rewrap) {
      const cur = await get<{ k: string | null }>("SELECT e2e_public_key AS k FROM users WHERE id = ?", viewer.id);
      if (cur?.k && cur.k !== input.publicKey) throw new WorkflowError("VALIDATION", "Key mismatch while re-protecting secure chat.");
    }
    await run("UPDATE users SET e2e_public_key = ?, e2e_private_enc = ?, e2e_kdf = ? WHERE id = ?", input.publicKey, input.privateEnc, input.kdf ?? "passphrase", viewer.id);
    await audit({ actor: viewer }, { action: "chat.keys", summary: `${viewer.name} ${input.rewrap ? "re-protected" : "set up"} secure chat keys` });
  }, NO_REVALIDATE);
}

// Checks the account password before the browser protects new chat keys with it (a typo would lock them away).
export async function verifyPasswordAction(password: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const row = await get<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", viewer.id);
    if (!verifyPassword(password, row?.password_hash)) throw new WorkflowError("VALIDATION", "That password is not correct.");
    return { email: viewer.email.toLowerCase() };
  }, NO_REVALIDATE);
}

export async function myChatKeysAction() {
  return wrap(async () => {
    const viewer = await requireViewer();
    const row = await get<{ e2e_public_key: string | null; e2e_private_enc: string | null; e2e_kdf: string | null }>(
      "SELECT e2e_public_key, e2e_private_enc, e2e_kdf FROM users WHERE id = ?",
      viewer.id,
    );
    return { publicKey: row?.e2e_public_key ?? null, privateEnc: row?.e2e_private_enc ?? null, kdf: (row?.e2e_kdf ?? "passphrase") as "login" | "passphrase", email: viewer.email.toLowerCase() };
  }, NO_REVALIDATE);
}

export async function peerKeyAction(userId: string) {
  return wrap(async () => {
    await requireViewer();
    return (await get<{ k: string | null }>("SELECT e2e_public_key AS k FROM users WHERE id = ?", userId))?.k ?? null;
  }, NO_REVALIDATE);
}

// ---------------------------------------------------------------------------
// Reactions and polls
// ---------------------------------------------------------------------------

const EMOJI = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u200d\ufe0f]|\p{Emoji_Modifier}){1,8}$/u;

export async function reactAction(messageId: string, emoji: string) {
  return wrap(async () => {
    const m = await get<{ group_id: string; deleted_at: string | null }>("SELECT group_id, deleted_at FROM chat_messages WHERE id = ?", messageId);
    if (!m || m.deleted_at) throw new WorkflowError("NOT_FOUND", "Message not found.");
    const { viewer, member } = await requireMember(m.group_id);
    if (!member) throw new WorkflowError("FORBIDDEN", "Join the group to react.");
    if (!EMOJI.test(emoji)) throw new WorkflowError("VALIDATION", "Choose an emoji.");
    const had = await get("SELECT 1 AS x FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", messageId, viewer.id, emoji);
    if (had) await run("DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", messageId, viewer.id, emoji);
    else {
      const mine = await get<{ c: number }>("SELECT COUNT(*) AS c FROM chat_reactions WHERE message_id = ? AND user_id = ?", messageId, viewer.id);
      if (Number(mine?.c ?? 0) >= 3) throw new WorkflowError("VALIDATION", "Up to 3 reactions per message.");
      await run("INSERT INTO chat_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)", messageId, viewer.id, emoji, nowIso());
    }
    await touchMessage(messageId);
    return !had;
  }, NO_REVALIDATE);
}

export async function createPollAction(input: { groupId: string; question: string; options: string[]; multiple?: boolean; anonymous?: boolean }) {
  return wrap(async () => {
    const { viewer, member } = await requireMember(input.groupId);
    if (!member) throw new WorkflowError("FORBIDDEN", "Join the group first.");
    const g = await get<{ kind: string; archived: number }>("SELECT kind, archived FROM chat_groups WHERE id = ?", input.groupId);
    if (!g || g.archived) throw new WorkflowError("INVALID_STATE", "This chat is archived.");
    if (g.kind === "direct") throw new WorkflowError("VALIDATION", "Polls are for groups and channels.");
    if (g.kind === "channel" && member.member_role !== "admin") throw new WorkflowError("FORBIDDEN", "Only channel admins post here.");
    const question = input.question.trim();
    const options = [...new Set(input.options.map((o) => o.trim()).filter(Boolean))];
    if (!question) throw new WorkflowError("VALIDATION", "Ask a question.");
    if (options.length < 2 || options.length > 10) throw new WorkflowError("VALIDATION", "Give 2 to 10 different options.");
    const id = uid("msg_");
    const now = nowIso();
    const meta = { question, options: options.map((text, i) => ({ id: `o${i + 1}`, text })), multiple: !!input.multiple, anonymous: !!input.anonymous, closed: false };
    await run("INSERT INTO chat_messages (id, group_id, author_id, body, kind, meta, created_at) VALUES (?, ?, ?, ?, 'poll', ?, ?)", id, input.groupId, viewer.id, question, JSON.stringify(meta), now);
    await run("UPDATE chat_groups SET last_message_at = ? WHERE id = ?", now, input.groupId);
    return id;
  }, NO_REVALIDATE);
}

export async function votePollAction(messageId: string, optionIds: string[]) {
  return wrap(async () => {
    const m = await get<{ group_id: string; kind: string; meta: string }>("SELECT group_id, kind, meta FROM chat_messages WHERE id = ? AND deleted_at IS NULL", messageId);
    if (!m || m.kind !== "poll") throw new WorkflowError("NOT_FOUND", "Poll not found.");
    const { viewer, member } = await requireMember(m.group_id);
    if (!member) throw new WorkflowError("FORBIDDEN", "Join the group to vote.");
    const meta = JSON.parse(m.meta) as { options: { id: string }[]; multiple: boolean; closed: boolean };
    if (meta.closed) throw new WorkflowError("INVALID_STATE", "This poll is closed.");
    const valid = optionIds.filter((o) => meta.options.some((x) => x.id === o));
    if (!meta.multiple && valid.length > 1) throw new WorkflowError("VALIDATION", "Choose one option.");
    await tx(async () => {
      await run("DELETE FROM chat_poll_votes WHERE message_id = ? AND user_id = ?", messageId, viewer.id);
      for (const o of valid) await run("INSERT INTO chat_poll_votes (message_id, user_id, option_id, created_at) VALUES (?, ?, ?, ?)", messageId, viewer.id, o, nowIso());
    });
    await touchMessage(messageId);
  }, NO_REVALIDATE);
}

export async function closePollAction(messageId: string, closed: boolean) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const m = await get<{ group_id: string; author_id: string; meta: string }>("SELECT group_id, author_id, meta FROM chat_messages WHERE id = ? AND kind = 'poll'", messageId);
    if (!m) throw new WorkflowError("NOT_FOUND", "Poll not found.");
    if (m.author_id !== viewer.id && !(await canManageGroup(viewer, m.group_id))) throw new WorkflowError("FORBIDDEN", "Only the person who asked or a group admin can close the poll.");
    await run("UPDATE chat_messages SET meta = ? WHERE id = ?", JSON.stringify({ ...JSON.parse(m.meta), closed }), messageId);
    await touchMessage(messageId);
  }, NO_REVALIDATE);
}

// ---------------------------------------------------------------------------
// Files and voice messages
// ---------------------------------------------------------------------------

const BLOCKED_TYPES = /^(application\/(x-msdownload|x-sh|x-bat|x-msi)|text\/html)/;

// Step 1 of an upload: records the file and says where the browser sends the bytes.
export async function prepareUploadAction(input: { groupId: string; name: string; mime: string; size: number; kind: "file" | "voice" | "image"; encrypted: boolean; durationSec?: number | null }) {
  return wrap(async () => {
    const { viewer, member } = await requireMember(input.groupId);
    if (!member) throw new WorkflowError("FORBIDDEN", "Join the group first.");
    const g = await get<{ kind: string }>("SELECT kind FROM chat_groups WHERE id = ?", input.groupId);
    if (g?.kind === "channel" && member.member_role !== "admin") throw new WorkflowError("FORBIDDEN", "Only channel admins post here.");
    if (g?.kind === "direct" && !input.encrypted) throw new WorkflowError("VALIDATION", "Files in direct chats are encrypted on your device first.");
    const storage = storageKind();
    const max = maxUploadBytes(storage);
    if (!(input.size > 0)) throw new WorkflowError("VALIDATION", "The file is empty.");
    if (input.size > max) throw new WorkflowError("VALIDATION", `Files are limited to ${Math.round(max / 1048576)} MB.`);
    const mime = (input.mime || "application/octet-stream").slice(0, 120);
    if (BLOCKED_TYPES.test(mime) || /\.(exe|bat|cmd|msi|sh|ps1|scr|js|html?)$/i.test(input.name)) throw new WorkflowError("VALIDATION", "This kind of file cannot be shared in chat.");
    const id = uid("fil_");
    const now = nowIso();
    const path = `${input.groupId}/${id}`;
    await run(
      `INSERT INTO chat_files (id, group_id, uploader_id, kind, name, mime, size, storage, path, encrypted, duration_sec, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.groupId,
      viewer.id,
      input.kind,
      // In direct chats the name is part of the encrypted message, never stored in clear.
      input.encrypted ? null : input.name.slice(0, 200),
      mime,
      Math.round(input.size),
      storage,
      path,
      input.encrypted,
      input.durationSec ?? null,
      input.kind === "voice" ? new Date(Date.now() + VOICE_UNPLAYED_TTL_MS).toISOString() : null,
      now,
    );
    return { fileId: id, storage, uploadUrl: storage === "supabase" ? await signedUploadUrl(path) : `/api/chat/upload?id=${id}` };
  }, NO_REVALIDATE);
}

// The first play by someone other than the sender starts the voice message's 10 minutes.
export async function voicePlayedAction(fileId: string) {
  return wrap(async () => {
    const f = await get<{ group_id: string; uploader_id: string; kind: string; first_played_at: string | null; message_id: string | null }>(
      "SELECT group_id, uploader_id, kind, first_played_at, message_id FROM chat_files WHERE id = ?",
      fileId,
    );
    if (!f || f.kind !== "voice") throw new WorkflowError("NOT_FOUND", "Voice message not found.");
    const { viewer } = await requireMember(f.group_id);
    if (viewer.id === f.uploader_id || f.first_played_at) return null;
    const now = new Date();
    const expires = new Date(now.getTime() + VOICE_TTL_MS).toISOString();
    await run("UPDATE chat_files SET first_played_at = ?, expires_at = ? WHERE id = ? AND first_played_at IS NULL", now.toISOString(), expires, fileId);
    if (f.message_id) await touchMessage(f.message_id);
    return expires;
  }, NO_REVALIDATE);
}

export async function uploadLimitsAction() {
  return wrap(async () => {
    await requireViewer();
    return { storage: storageKind(), maxBytes: maxUploadBytes() };
  }, NO_REVALIDATE);
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export async function createChannelAction(input: { name: string; description?: string; color?: string; visibility: "public" | "private"; memberIds: string[] }) {
  return wrap(async () => {
    const viewer = await requireViewer();
    if (!can(viewer, "chat.channels")) throw new WorkflowError("FORBIDDEN", "You do not have permission to create channels.");
    const name = input.name.trim();
    if (!name) throw new WorkflowError("VALIDATION", "Name the channel.");
    if (name.length > 60) throw new WorkflowError("VALIDATION", "Channel names are limited to 60 characters.");
    const id = uid("chn_");
    const now = nowIso();
    await tx(async () => {
      await run(
        "INSERT INTO chat_groups (id, name, description, kind, color, visibility, invite_token, created_by, last_message_at, created_at) VALUES (?, ?, ?, 'channel', ?, ?, ?, ?, ?, ?)",
        id,
        name,
        input.description?.trim() || null,
        input.color || "#0ea5e9",
        input.visibility === "public" ? "public" : "private",
        crypto.randomBytes(12).toString("base64url"),
        viewer.id,
        now,
        now,
      );
      // The creator is the channel's first admin and manages it from Channel info.
      for (const u of new Set([viewer.id, ...input.memberIds]))
        await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", id, u, u === viewer.id ? "admin" : "member", now);
      await run("INSERT INTO chat_messages (id, group_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", uid("msg_"), id, viewer.id, `${viewer.name} created the group.`, now);
    });
    await audit({ actor: viewer }, { action: "chat.channel_created", summary: `${viewer.name} created channel ${name}` });
    if (input.memberIds.length)
      await notify(input.memberIds, { type: "discussion", title: `You were added to the channel ${name}`, link: `/chat?g=${id}`, dedupeKey: `chat-add:${id}` }, now, viewer.id);
    return id;
  });
}

export async function setChannelVisibilityAction(groupId: string, visibility: "public" | "private") {
  return wrap(async () => {
    const viewer = await requireManage(groupId);
    await run("UPDATE chat_groups SET visibility = ? WHERE id = ? AND kind = 'channel'", visibility === "public" ? "public" : "private", groupId);
    await audit({ actor: viewer }, { action: "chat.group_updated", summary: `${viewer.name} made a channel ${visibility}` });
  });
}

export async function inviteLinkAction(groupId: string, regenerate = false) {
  return wrap(async () => {
    await requireManage(groupId);
    const cur = await get<{ invite_token: string | null }>("SELECT invite_token FROM chat_groups WHERE id = ?", groupId);
    if (cur?.invite_token && !regenerate) return cur.invite_token;
    const token = crypto.randomBytes(12).toString("base64url");
    await run("UPDATE chat_groups SET invite_token = ? WHERE id = ?", token, groupId);
    return token;
  }, NO_REVALIDATE);
}

export async function publicChannelsAction() {
  return wrap(async () => publicChannels((await requireViewer()).id), NO_REVALIDATE);
}

// Joins a public channel, or any group or channel with its invite link.
export async function joinChatAction(input: { groupId?: string; token?: string }) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const g = input.token
      ? await get<{ id: string; kind: string; visibility: string; archived: number }>("SELECT id, kind, visibility, archived FROM chat_groups WHERE invite_token = ?", input.token)
      : await get<{ id: string; kind: string; visibility: string; archived: number }>("SELECT id, kind, visibility, archived FROM chat_groups WHERE id = ?", input.groupId ?? "");
    if (!g || g.archived || g.kind === "direct") throw new WorkflowError("NOT_FOUND", "This invitation is not valid any more.");
    if (!input.token && !(g.kind === "channel" && g.visibility === "public")) throw new WorkflowError("FORBIDDEN", "Ask an admin to add you.");
    await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, 'member', ?) ON CONFLICT DO NOTHING", g.id, viewer.id, nowIso());
    return g.id;
  });
}

// ---------------------------------------------------------------------------
// Push notifications, GIFs and calls
// ---------------------------------------------------------------------------

export async function pushSetupAction() {
  return wrap(async () => {
    const viewer = await requireViewer();
    return { publicKey: (await vapidKeys()).publicKey, devices: await subscriptionCount(viewer.id) };
  }, NO_REVALIDATE);
}

export async function subscribePushAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  return wrap(async () => {
    const viewer = await requireViewer();
    await saveSubscription(viewer.id, sub, (await headers()).get("user-agent"));
    await sendPush([viewer.id], { title: "Notifications are on", body: "You will get work alerts and chat messages here.", link: "/notifications", tag: "push-test" });
  }, NO_REVALIDATE);
}

export async function unsubscribePushAction(endpoint: string) {
  return wrap(async () => removeSubscription(endpoint, (await requireViewer()).id), NO_REVALIDATE);
}

export type Gif = { id: string; title: string; url: string; preview: string; width: number; height: number };

// GIF search through GIPHY (free key in GIPHY_API_KEY). Without a key the picker explains how to turn it on.
export async function searchGifsAction(q: string) {
  return wrap(async () => {
    await requireViewer();
    const key = process.env.GIPHY_API_KEY;
    if (!key) return { configured: false as const, gifs: [] as Gif[] };
    const endpoint = q.trim() ? "search" : "trending";
    const r = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?api_key=${encodeURIComponent(key)}&limit=24&rating=g${q.trim() ? `&q=${encodeURIComponent(q.trim().slice(0, 50))}` : ""}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new WorkflowError("INVALID_STATE", "GIF search is not available right now.");
    const data = (await r.json()) as { data: { id: string; title: string; images: { fixed_height: { url: string; width: string; height: string }; fixed_height_small?: { url: string } } }[] };
    return {
      configured: true as const,
      gifs: data.data.map((g) => ({
        id: g.id,
        title: g.title,
        url: g.images.fixed_height.url,
        preview: g.images.fixed_height_small?.url ?? g.images.fixed_height.url,
        width: Number(g.images.fixed_height.width),
        height: Number(g.images.fixed_height.height),
      })),
    };
  }, NO_REVALIDATE);
}
