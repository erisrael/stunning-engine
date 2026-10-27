"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { all, get, nowIso, run, tx, uid } from "@/server/db";
import { notify } from "@/server/notifications";
import { audit, WorkflowError } from "@/server/workflow";
import { canManageChat, canManageGroup, changedMessages, directGroup, groupMembers, groupMessages, membership, pinnedMessages } from "@/server/chat";
import { canViewItem } from "@/server/users";

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
export async function sendMessageAction(input: { groupId: string; body: string; replyToId?: string | null; encrypted?: boolean }) {
  return wrap(async () => {
    const { viewer, member } = await requireMember(input.groupId);
    if (!member) throw new WorkflowError("FORBIDDEN", "Join the group to send messages.");
    const group = await get<{ name: string; archived: number; kind: string }>("SELECT name, archived, kind FROM chat_groups WHERE id = ?", input.groupId);
    if (!group || group.archived) throw new WorkflowError("INVALID_STATE", "This group is archived.");
    const body = input.body.trim();
    if (!body) throw new WorkflowError("VALIDATION", "Write a message first.");
    if (group.kind === "direct") {
      if (!input.encrypted || !/^\{"v":1,"iv":"[^"]+","ct":"[^"]+"\}$/.test(body))
        throw new WorkflowError("VALIDATION", "Direct messages must be encrypted on your device. Reload the page and unlock secure chat.");
      if (body.length > 12000) throw new WorkflowError("VALIDATION", "Messages are limited to 4,000 characters.");
      const now = nowIso();
      const id = uid("msg_");
      await run(
        "INSERT INTO chat_messages (id, group_id, author_id, body, reply_to_id, encrypted, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
        id,
        input.groupId,
        viewer.id,
        body,
        input.replyToId ?? null,
        now,
      );
      await run("UPDATE chat_groups SET last_message_at = ? WHERE id = ?", now, input.groupId);
      await run("UPDATE chat_members SET last_read_at = ? WHERE group_id = ? AND user_id = ?", now, input.groupId, viewer.id);
      const others = (await all<{ user_id: string }>("SELECT user_id FROM chat_members WHERE group_id = ? AND user_id <> ?", input.groupId, viewer.id)).map((m) => m.user_id);
      await notify(others, { type: "mention", title: `New message from ${viewer.name}`, body: "Encrypted message", link: `/chat?g=${input.groupId}`, groupKey: `dm:${input.groupId}` }, now, viewer.id);
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
      "INSERT INTO chat_messages (id, group_id, author_id, body, reply_to_id, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id,
      input.groupId,
      viewer.id,
      body,
      input.replyToId ?? null,
      itemId,
      now,
    );
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
    const m = await get<{ group_id: string }>("SELECT group_id FROM chat_messages WHERE id = ?", id);
    if (!m) throw new WorkflowError("NOT_FOUND", "Message not found.");
    await requireManage(m.group_id);
    await run("UPDATE chat_messages SET pinned = ? WHERE id = ?", pinned, id);
  }, NO_REVALIDATE);
}

// Polling endpoint for an open conversation: new messages after a sequence number, edits since a time.
export async function pollMessagesAction(input: { groupId: string; afterSeq: number; since: string }) {
  return wrap(async () => {
    const { viewer, member } = await requireMember(input.groupId);
    const now = nowIso();
    const fresh = await groupMessages(input.groupId, { afterSeq: input.afterSeq });
    const changed = await changedMessages(input.groupId, input.since);
    if (member) await run("UPDATE chat_members SET last_read_at = ? WHERE group_id = ? AND user_id = ?", now, input.groupId, viewer.id);
    return { fresh, changed, at: now };
  }, NO_REVALIDATE);
}

export async function olderMessagesAction(groupId: string, beforeSeq: number) {
  return wrap(async () => {
    await requireMember(groupId);
    return await groupMessages(groupId, { beforeSeq, limit: 60 });
  }, NO_REVALIDATE);
}

export async function groupInfoAction(groupId: string) {
  return wrap(async () => {
    await requireMember(groupId);
    return { members: await groupMembers(groupId), pinned: await pinnedMessages(groupId) };
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
    return await directGroup(viewer.id, userId);
  });
}

// The public key is shared; the private key is stored only after the browser wraps it with the person's chat passphrase.
export async function saveChatKeysAction(input: { publicKey: string; privateEnc: string }) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const pub = JSON.parse(input.publicKey) as { kty?: string; crv?: string; d?: string };
    const enc = JSON.parse(input.privateEnc) as { salt?: string; iv?: string; ct?: string };
    if (pub.kty !== "EC" || pub.crv !== "P-256" || pub.d) throw new WorkflowError("VALIDATION", "Invalid public key.");
    if (!enc.salt || !enc.iv || !enc.ct) throw new WorkflowError("VALIDATION", "Invalid key backup.");
    await run("UPDATE users SET e2e_public_key = ?, e2e_private_enc = ? WHERE id = ?", input.publicKey, input.privateEnc, viewer.id);
    await audit({ actor: viewer }, { action: "chat.keys", summary: `${viewer.name} set up secure chat keys` });
  }, NO_REVALIDATE);
}

export async function myChatKeysAction() {
  return wrap(async () => {
    const viewer = await requireViewer();
    const row = await get<{ e2e_public_key: string | null; e2e_private_enc: string | null }>("SELECT e2e_public_key, e2e_private_enc FROM users WHERE id = ?", viewer.id);
    return { publicKey: row?.e2e_public_key ?? null, privateEnc: row?.e2e_private_enc ?? null };
  }, NO_REVALIDATE);
}

export async function peerKeyAction(userId: string) {
  return wrap(async () => {
    await requireViewer();
    return (await get<{ k: string | null }>("SELECT e2e_public_key AS k FROM users WHERE id = ?", userId))?.k ?? null;
  }, NO_REVALIDATE);
}
