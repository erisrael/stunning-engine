import { all, get, nowIso, run, uid } from "./db";
import { can, type AppUser } from "./users";

// Telegram-style group chat. Everyone sees the groups they belong to; managers and admins
// (the chat.manage permission) and group admins create groups and manage members.

export type ChatGroupSummary = {
  id: string;
  kind: "group" | "direct" | "channel";
  // Public channels can be found and joined by anyone; groups and private channels need an invitation.
  visibility: "private" | "public";
  // Channels: only their admins post. Everyone else reads and reacts.
  canPost: boolean;
  peer: { id: string; name: string; handle: string; hasKey: boolean } | null;
  name: string;
  description: string | null;
  color: string | null;
  archived: boolean;
  memberCount: number;
  myRole: "admin" | "member" | null;
  muted: boolean;
  unread: number;
  lastMessage: { body: string; author: string; at: string } | null;
};

export type ChatMessage = {
  seq: number;
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  body: string;
  replyTo: { id: string; authorName: string; body: string } | null;
  item: { id: string; code: string; title: string } | null;
  kind: MessageKind;
  meta: Record<string, unknown> | null;
  reactions: { emoji: string; userIds: string[] }[];
  poll: ChatPoll | null;
  file: ChatFile | null;
  encrypted: boolean;
  pinned: boolean;
  // "Name in Group" when the message was forwarded.
  forwardedFrom: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export const MESSAGE_KINDS = ["text", "request", "question", "system", "file", "voice", "poll", "call"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export type ChatPoll = {
  question: string;
  options: { id: string; text: string; votes: number; voters: string[] }[];
  multiple: boolean;
  anonymous: boolean;
  closed: boolean;
  mine: string[];
  total: number;
};

export type ChatFile = {
  id: string;
  kind: "file" | "voice" | "image";
  name: string | null;
  mime: string;
  size: number;
  encrypted: boolean;
  durationSec: number | null;
  firstPlayedAt: string | null;
  expiresAt: string | null;
  gone: boolean;
};

export type ChatMember = { userId: string; name: string; handle: string; title: string | null; role: "admin" | "member"; roles: string[] };

export function canManageChat(user: AppUser) {
  return can(user, "chat.manage");
}

export async function membership(groupId: string, userId: string) {
  return await get<{ member_role: "admin" | "member"; muted: number; last_read_at: string | null }>(
    "SELECT member_role, muted, last_read_at FROM chat_members WHERE group_id = ? AND user_id = ?",
    groupId,
    userId,
  );
}

// A person can manage a group when they hold chat.manage or are an admin of that group.
export async function canManageGroup(user: AppUser, groupId: string) {
  if (canManageChat(user)) return true;
  return (await membership(groupId, user.id))?.member_role === "admin";
}

const PREVIEW: Record<string, string> = { file: "File", voice: "Voice message", poll: "Poll", call: "Call" };

export async function listGroups(user: AppUser, opts: { includeArchived?: boolean } = {}): Promise<ChatGroupSummary[]> {
  // Chat managers also see groups they are not in, so they can manage membership.
  const all_ = canManageChat(user);
  const rows = await all<{
    id: string;
    kind: "group" | "direct" | "channel";
    visibility: string | null;
    name: string;
    description: string | null;
    color: string | null;
    archived: number;
    last_message_at: string | null;
    member_role: "admin" | "member" | null;
    muted: number | null;
    last_read_at: string | null;
    members: number;
  }>(
    `SELECT g.id, g.kind, g.visibility, g.name, g.description, g.color, g.archived, g.last_message_at, m.member_role, m.muted, m.last_read_at,
            (SELECT COUNT(*) FROM chat_members x WHERE x.group_id = g.id) AS members
     FROM chat_groups g LEFT JOIN chat_members m ON m.group_id = g.id AND m.user_id = ?
     WHERE (m.user_id IS NOT NULL ${all_ ? "OR g.kind <> 'direct'" : ""}) ${opts.includeArchived ? "" : "AND g.archived = 0"}
     ORDER BY COALESCE(g.last_message_at, g.created_at) DESC`,
    user.id,
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const last = await all<{ group_id: string; body: string; author: string; created_at: string; deleted_at: string | null; encrypted: number; kind: string }>(
    `SELECT DISTINCT ON (c.group_id) c.group_id, c.body, u.name AS author, c.created_at, c.deleted_at, c.encrypted, c.kind
     FROM chat_messages c JOIN users u ON u.id = c.author_id
     WHERE c.group_id IN (${ids.map(() => "?").join(",")})
     ORDER BY c.group_id, c.seq DESC`,
    ...ids,
  );
  const unread = await all<{ group_id: string; c: number }>(
    `SELECT c.group_id, COUNT(*) AS c FROM chat_messages c
     JOIN chat_members m ON m.group_id = c.group_id AND m.user_id = ?
     WHERE c.author_id <> ? AND c.deleted_at IS NULL AND (m.last_read_at IS NULL OR c.created_at > m.last_read_at)
     GROUP BY c.group_id`,
    user.id,
    user.id,
  );
  const directIds = rows.filter((r) => r.kind === "direct").map((r) => r.id);
  const peers = directIds.length
    ? await all<{ group_id: string; id: string; name: string; handle: string; key: string | null }>(
        `SELECT m.group_id, u.id, u.name, u.handle, u.e2e_public_key AS key FROM chat_members m JOIN users u ON u.id = m.user_id
         WHERE m.group_id IN (${directIds.map(() => "?").join(",")}) AND m.user_id <> ?`,
        ...directIds,
        user.id,
      )
    : [];
  return rows.map((r) => {
    const l = last.find((x) => x.group_id === r.id);
    const p = peers.find((x) => x.group_id === r.id);
    const preview = !l
      ? null
      : l.deleted_at
        ? "Message deleted"
        : (PREVIEW[l.kind] ?? (l.encrypted ? "Encrypted message" : l.body));
    const kind = r.kind === "direct" || r.kind === "channel" ? r.kind : ("group" as const);
    return {
      id: r.id,
      kind,
      visibility: r.visibility === "public" ? ("public" as const) : ("private" as const),
      canPost: kind !== "channel" || r.member_role === "admin",
      peer: p ? { id: p.id, name: p.name, handle: p.handle, hasKey: !!p.key } : null,
      name: r.kind === "direct" ? (p?.name ?? "Direct message") : r.name,
      description: r.description,
      color: r.color,
      archived: !!r.archived,
      memberCount: Number(r.members),
      myRole: r.member_role,
      muted: !!r.muted,
      unread: Number(unread.find((u) => u.group_id === r.id)?.c ?? 0),
      lastMessage: l && preview ? { body: preview, author: l.author, at: l.created_at } : null,
    };
  });
}

export async function unreadChatCount(userId: string) {
  const row = await get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM chat_messages c
     JOIN chat_members m ON m.group_id = c.group_id AND m.user_id = ? AND m.muted = 0
     JOIN chat_groups g ON g.id = c.group_id AND g.archived = 0
     WHERE c.author_id <> ? AND c.deleted_at IS NULL AND (m.last_read_at IS NULL OR c.created_at > m.last_read_at)`,
    userId,
    userId,
  );
  return Number(row?.c ?? 0);
}

type MessageRow = {
  seq: number;
  id: string;
  group_id: string;
  author_id: string;
  author_name: string;
  body: string;
  reply_to_id: string | null;
  item_id: string | null;
  kind: string;
  meta: string | null;
  encrypted: number;
  pinned: number;
  forwarded_from: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

async function hydrate(rows: MessageRow[], viewerId?: string): Promise<ChatMessage[]> {
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => "?").join(",");
  const reactions = ids.length ? await all<{ message_id: string; emoji: string; user_id: string }>(`SELECT message_id, emoji, user_id FROM chat_reactions WHERE message_id IN (${ph}) ORDER BY created_at`, ...ids) : [];
  const pollIds = rows.filter((r) => r.kind === "poll").map((r) => r.id);
  const votes = pollIds.length
    ? await all<{ message_id: string; user_id: string; option_id: string }>(`SELECT message_id, user_id, option_id FROM chat_poll_votes WHERE message_id IN (${pollIds.map(() => "?").join(",")})`, ...pollIds)
    : [];
  const fileIds = rows.map((r) => (r.meta ? (JSON.parse(r.meta) as { fileId?: string }).fileId : undefined)).filter(Boolean) as string[];
  const files = fileIds.length
    ? await all<{ id: string; kind: string; name: string | null; mime: string; size: number; encrypted: number; duration_sec: number | null; first_played_at: string | null; expires_at: string | null; deleted_at: string | null }>(
        `SELECT id, kind, name, mime, size, encrypted, duration_sec, first_played_at, expires_at, deleted_at FROM chat_files WHERE id IN (${fileIds.map(() => "?").join(",")})`,
        ...fileIds,
      )
    : [];
  // Question cards show whether the question was answered, and who should answer it.
  const questionIds = rows.map((r) => (r.kind === "question" && r.meta ? (JSON.parse(r.meta) as { questionId?: string }).questionId : undefined)).filter(Boolean) as string[];
  const questions = questionIds.length
    ? await all<{ id: string; status: string; owner_id: string; answer: string | null }>(`SELECT id, status, owner_id, answer FROM manager_questions WHERE id IN (${questionIds.map(() => "?").join(",")})`, ...questionIds)
    : [];
  const now = nowIso();
  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter(Boolean))] as string[];
  const itemIds = [...new Set(rows.map((r) => r.item_id).filter(Boolean))] as string[];
  const replies = replyIds.length
    ? await all<{ id: string; body: string; deleted_at: string | null; author_name: string; encrypted: number }>(
        `SELECT c.id, c.body, c.deleted_at, c.encrypted, u.name AS author_name FROM chat_messages c JOIN users u ON u.id = c.author_id WHERE c.id IN (${replyIds.map(() => "?").join(",")})`,
        ...replyIds,
      )
    : [];
  const items = itemIds.length
    ? await all<{ id: string; code: string; title: string }>(`SELECT id, code, title FROM items WHERE id IN (${itemIds.map(() => "?").join(",")})`, ...itemIds)
    : [];
  return rows.map((r) => {
    const rep = replies.find((x) => x.id === r.reply_to_id);
    return {
      seq: Number(r.seq),
      id: r.id,
      groupId: r.group_id,
      authorId: r.author_id,
      authorName: r.author_name,
      body: r.deleted_at ? "" : r.body,
      replyTo: rep ? { id: rep.id, authorName: rep.author_name, body: rep.deleted_at ? "Message deleted" : rep.encrypted ? rep.body : rep.body.slice(0, 140) } : null,
      item: items.find((i) => i.id === r.item_id) ?? null,
      kind: ((MESSAGE_KINDS as readonly string[]).includes(r.kind) ? r.kind : "text") as MessageKind,
      meta: (() => {
        const meta = r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null;
        const q = meta?.questionId ? questions.find((x) => x.id === meta.questionId) : undefined;
        return q ? { ...meta, questionStatus: q.status, questionOwnerId: q.owner_id, questionAnswer: q.answer } : meta;
      })(),
      reactions: groupReactions(reactions.filter((x) => x.message_id === r.id)),
      poll: r.kind === "poll" && r.meta ? toPoll(JSON.parse(r.meta), votes.filter((v) => v.message_id === r.id), viewerId) : null,
      file: (() => {
        const fid = r.meta ? (JSON.parse(r.meta) as { fileId?: string }).fileId : undefined;
        const f = fid ? files.find((x) => x.id === fid) : undefined;
        if (!f) return null;
        return {
          id: f.id,
          kind: (f.kind === "voice" || f.kind === "image" ? f.kind : "file") as ChatFile["kind"],
          name: f.name,
          mime: f.mime,
          size: Number(f.size),
          encrypted: !!f.encrypted,
          durationSec: f.duration_sec,
          firstPlayedAt: f.first_played_at,
          expiresAt: f.expires_at,
          gone: !!f.deleted_at || (!!f.expires_at && f.expires_at < now),
        };
      })(),
      encrypted: !!r.encrypted,
      pinned: !!r.pinned,
      forwardedFrom: r.forwarded_from ?? null,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
    };
  });
}

function groupReactions(rows: { emoji: string; user_id: string }[]) {
  const out: { emoji: string; userIds: string[] }[] = [];
  for (const r of rows) {
    const e = out.find((x) => x.emoji === r.emoji);
    if (e) e.userIds.push(r.user_id);
    else out.push({ emoji: r.emoji, userIds: [r.user_id] });
  }
  return out;
}

type PollMeta = { question?: string; options?: { id: string; text: string }[]; multiple?: boolean; anonymous?: boolean; closed?: boolean };

function toPoll(meta: PollMeta, votes: { user_id: string; option_id: string }[], viewerId?: string): ChatPoll {
  const anonymous = !!meta.anonymous;
  return {
    question: meta.question ?? "",
    options: (meta.options ?? []).map((o) => {
      const v = votes.filter((x) => x.option_id === o.id);
      return { id: o.id, text: o.text, votes: v.length, voters: anonymous ? [] : v.map((x) => x.user_id) };
    }),
    multiple: !!meta.multiple,
    anonymous,
    closed: !!meta.closed,
    mine: viewerId ? votes.filter((v) => v.user_id === viewerId).map((v) => v.option_id) : [],
    total: new Set(votes.map((v) => v.user_id)).size,
  };
}

// Reactions, votes and pins change a message without editing it; open chats pick that up through updated_at.
export async function touchMessage(id: string) {
  await run("UPDATE chat_messages SET updated_at = ? WHERE id = ?", nowIso(), id);
}

const MESSAGE_SELECT = `SELECT c.seq, c.id, c.group_id, c.author_id, u.name AS author_name, c.body, c.reply_to_id, c.item_id, c.kind, c.meta, c.encrypted, c.pinned, c.forwarded_from, c.edited_at, c.deleted_at, c.created_at
  FROM chat_messages c JOIN users u ON u.id = c.author_id`;

export async function groupMessages(groupId: string, opts: { afterSeq?: number; beforeSeq?: number; limit?: number; viewerId?: string } = {}) {
  const limit = Math.min(opts.limit ?? 80, 200);
  if (opts.afterSeq !== undefined) {
    return hydrate(await all<MessageRow>(`${MESSAGE_SELECT} WHERE c.group_id = ? AND c.seq > ? ORDER BY c.seq LIMIT ?`, groupId, opts.afterSeq, limit), opts.viewerId);
  }
  const rows = await all<MessageRow>(
    `${MESSAGE_SELECT} WHERE c.group_id = ? ${opts.beforeSeq ? "AND c.seq < ?" : ""} ORDER BY c.seq DESC LIMIT ?`,
    ...(opts.beforeSeq ? [groupId, opts.beforeSeq, limit] : [groupId, limit]),
  );
  return hydrate(rows.reverse(), opts.viewerId);
}

// Messages changed (edited, deleted, pinned) since a time, so open chats stay in sync.
export async function changedMessages(groupId: string, sinceIso: string, viewerId?: string) {
  return hydrate(
    await all<MessageRow>(
      `${MESSAGE_SELECT} WHERE c.group_id = ? AND ((c.edited_at IS NOT NULL AND c.edited_at > ?) OR (c.deleted_at IS NOT NULL AND c.deleted_at > ?) OR (c.updated_at IS NOT NULL AND c.updated_at > ?))`,
      groupId,
      sinceIso,
      sinceIso,
      sinceIso,
    ),
    viewerId,
  );
}

export async function pinnedMessages(groupId: string, viewerId?: string) {
  return hydrate(await all<MessageRow>(`${MESSAGE_SELECT} WHERE c.group_id = ? AND c.pinned = 1 AND c.deleted_at IS NULL ORDER BY c.seq DESC LIMIT 20`, groupId), viewerId);
}

export async function groupMembers(groupId: string): Promise<ChatMember[]> {
  const rows = await all<{ user_id: string; name: string; handle: string; title: string | null; member_role: "admin" | "member" }>(
    `SELECT m.user_id, u.name, u.handle, u.title, m.member_role FROM chat_members m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ? AND u.active = 1 ORDER BY m.member_role, u.name`,
    groupId,
  );
  const roles = await all<{ user_id: string; role: string }>("SELECT user_id, role FROM role_assignments");
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    handle: r.handle,
    title: r.title,
    role: r.member_role,
    roles: roles.filter((x) => x.user_id === r.user_id).map((x) => x.role),
  }));
}

// ---------------------------------------------------------------------------
// Direct chats and workflow cards
// ---------------------------------------------------------------------------

export function dmKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

// Finds or creates the one-to-one conversation between two people.
export async function directGroup(a: string, b: string) {
  const key = dmKey(a, b);
  const found = await get<{ id: string }>("SELECT id FROM chat_groups WHERE dm_key = ?", key);
  if (found) return found.id;
  const now = nowIso();
  await run(
    "INSERT INTO chat_groups (id, name, kind, dm_key, created_by, last_message_at, created_at) VALUES (?, 'Direct', 'direct', ?, ?, ?, ?) ON CONFLICT DO NOTHING",
    uid("dm_"),
    key,
    a,
    now,
    now,
  );
  const id = (await get<{ id: string }>("SELECT id FROM chat_groups WHERE dm_key = ?", key))!.id;
  for (const u of [a, b]) await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, 'member', ?) ON CONFLICT DO NOTHING", id, u, now);
  return id;
}

// The team group for a stage (created on first use) so redo requests reach the whole team.
export async function stageGroup(stage: string) {
  const found = await get<{ id: string }>("SELECT id FROM chat_groups WHERE stage = ? AND kind = 'group' AND archived = 0 ORDER BY created_at LIMIT 1", stage);
  if (found) return found.id;
  const id = uid("grp_");
  const now = nowIso();
  await run(
    "INSERT INTO chat_groups (id, name, description, kind, stage, created_at, last_message_at) VALUES (?, ?, ?, 'group', ?, ?, ?)",
    id,
    `${stage[0].toUpperCase()}${stage.slice(1)} team`,
    `Day-to-day coordination for ${stage}`,
    stage,
    now,
    now,
  );
  const people = await all<{ user_id: string }>(
    "SELECT user_id FROM role_assignments WHERE role = ? OR role = 'manager' UNION SELECT user_id FROM team_leads WHERE stage = ?",
    stage,
    stage,
  );
  for (const p of people) await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, 'member', ?) ON CONFLICT DO NOTHING", id, p.user_id, now);
  return id;
}

// Workflow cards (redo requests, questions) are written by the server, so they are never end-to-end encrypted.
export async function postCard(groupId: string, authorId: string, input: { kind: "request" | "question" | "system"; body: string; itemId?: string | null; meta?: Record<string, unknown> }) {
  const id = uid("msg_");
  const now = nowIso();
  await run(
    "INSERT INTO chat_messages (id, group_id, author_id, body, item_id, kind, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    groupId,
    authorId,
    input.body,
    input.itemId ?? null,
    input.kind,
    input.meta ? JSON.stringify(input.meta) : null,
    now,
  );
  await run("UPDATE chat_groups SET last_message_at = ? WHERE id = ?", now, groupId);
  return id;
}

// ---------------------------------------------------------------------------
// Channels, files and voice messages
// ---------------------------------------------------------------------------

export async function publicChannels(userId: string) {
  return await all<{ id: string; name: string; description: string | null; color: string | null; members: number }>(
    `SELECT g.id, g.name, g.description, g.color, (SELECT COUNT(*) FROM chat_members x WHERE x.group_id = g.id) AS members
     FROM chat_groups g WHERE g.kind = 'channel' AND g.visibility = 'public' AND g.archived = 0
       AND NOT EXISTS (SELECT 1 FROM chat_members m WHERE m.group_id = g.id AND m.user_id = ?)
     ORDER BY g.name`,
    userId,
  );
}

// Voice messages last 10 minutes after someone other than the sender first plays them (7 days if never played).
export const VOICE_TTL_MS = 10 * 60e3;
export const VOICE_UNPLAYED_TTL_MS = 7 * 864e5;

// Removes expired files from storage. Called by the scheduled checks and while chats are open.
export async function cleanupChatFiles(limit = 25) {
  const { removeStoredFile } = await import("./chat-extras");
  const deleteStored = removeStoredFile;
  const expired = await all<{ id: string; storage: string; path: string; message_id: string | null }>(
    "SELECT id, storage, path, message_id FROM chat_files WHERE deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at < ? LIMIT ?",
    nowIso(),
    limit,
  );
  for (const f of expired) {
    try {
      await deleteStored(f);
      await run("UPDATE chat_files SET deleted_at = ? WHERE id = ?", nowIso(), f.id);
      if (f.message_id) await touchMessage(f.message_id);
    } catch (err) {
      console.error("chat file cleanup failed", f.id, err);
    }
  }
  // Uploads that were never sent are removed after a day.
  const stale = await all<{ id: string; storage: string; path: string }>(
    "SELECT id, storage, path FROM chat_files WHERE message_id IS NULL AND deleted_at IS NULL AND created_at < ? LIMIT ?",
    new Date(Date.now() - 864e5).toISOString(),
    limit,
  );
  for (const f of stale) {
    try {
      await deleteStored(f);
      await run("DELETE FROM chat_files WHERE id = ?", f.id);
    } catch (err) {
      console.error("chat upload cleanup failed", f.id, err);
    }
  }
  return expired.length + stale.length;
}
