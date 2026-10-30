// Chat around the messages: system settings (sizes, storage quota, auto-delete), usage, deleting whole chats,
// who may create groups, presence, read receipts, search, jumping to a date, shared media, and forwarding.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { canManageChat, groupMessages, membership, type ChatMessage } from "./chat";
import { can, type AppUser } from "./users";

// ---------------------------------------------------------------------------
// Settings (Admin, Chat)
// ---------------------------------------------------------------------------

export type ChatConfig = {
  maxFileMb: number;
  // Total storage for chat files, and per person (0: no limit).
  quotaMb: number;
  perUserQuotaMb: number;
  voiceAutoDelete: boolean;
  voiceMinutes: number;
  voiceUnplayedDays: number;
  // Files and messages older than this are removed (0: kept for ever). Pinned messages are kept.
  fileRetentionDays: number;
  messageRetentionDays: number;
  allowGifs: boolean;
};

export const CHAT_DEFAULTS: ChatConfig = {
  maxFileMb: 25,
  quotaMb: 0,
  perUserQuotaMb: 0,
  voiceAutoDelete: true,
  voiceMinutes: 10,
  voiceUnplayedDays: 7,
  fileRetentionDays: 0,
  messageRetentionDays: 0,
  allowGifs: true,
};

export async function chatConfig(): Promise<ChatConfig> {
  return { ...CHAT_DEFAULTS, ...parseJson<Partial<ChatConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.chat'"))?.value, {}) };
}

export async function saveChatConfig(user: AppUser, input: Partial<ChatConfig>, hardMaxMb: number) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only the system admin changes chat settings.");
  const n = (v: unknown, min: number, max: number, d: number) => {
    const x = Math.round(Number(v));
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d;
  };
  const cur = await chatConfig();
  const next: ChatConfig = {
    maxFileMb: n(input.maxFileMb ?? cur.maxFileMb, 1, hardMaxMb, cur.maxFileMb),
    quotaMb: n(input.quotaMb ?? cur.quotaMb, 0, 10_000_000, cur.quotaMb),
    perUserQuotaMb: n(input.perUserQuotaMb ?? cur.perUserQuotaMb, 0, 10_000_000, cur.perUserQuotaMb),
    voiceAutoDelete: input.voiceAutoDelete ?? cur.voiceAutoDelete,
    voiceMinutes: n(input.voiceMinutes ?? cur.voiceMinutes, 1, 60 * 24 * 30, cur.voiceMinutes),
    voiceUnplayedDays: n(input.voiceUnplayedDays ?? cur.voiceUnplayedDays, 1, 365, cur.voiceUnplayedDays),
    fileRetentionDays: n(input.fileRetentionDays ?? cur.fileRetentionDays, 0, 3650, cur.fileRetentionDays),
    messageRetentionDays: n(input.messageRetentionDays ?? cur.messageRetentionDays, 0, 3650, cur.messageRetentionDays),
    allowGifs: input.allowGifs ?? cur.allowGifs,
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.chat', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "chat.settings", summary: `${user.name} changed the chat settings`, newValue: next });
  return next;
}

export async function storageUsed(userId?: string) {
  const r = await get<{ b: number }>(`SELECT COALESCE(SUM(size), 0) AS b FROM chat_files WHERE deleted_at IS NULL ${userId ? "AND uploader_id = ?" : ""}`, ...(userId ? [userId] : []));
  return Number(r?.b ?? 0);
}

// Refuses an upload that would pass the size limit or a quota.
export async function checkUpload(userId: string, size: number, hardMaxBytes: number) {
  const c = await chatConfig();
  const max = Math.min(hardMaxBytes, c.maxFileMb * 1048576);
  if (size > max) throw new WorkflowError("VALIDATION", `Files are limited to ${Math.round(max / 1048576)} MB.`);
  if (c.quotaMb && (await storageUsed()) + size > c.quotaMb * 1048576) throw new WorkflowError("VALIDATION", "Chat storage is full. Ask Admin to raise the limit or remove old files.");
  if (c.perUserQuotaMb && (await storageUsed(userId)) + size > c.perUserQuotaMb * 1048576)
    throw new WorkflowError("VALIDATION", `You have used your ${c.perUserQuotaMb} MB of chat storage. Delete some files you sent, or ask Admin.`);
}

export async function chatUsage(user: AppUser) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only the system admin sees chat storage.");
  const [byKind, byGroup, byUser, counts] = await Promise.all([
    all<{ kind: string; b: number; c: number }>("SELECT kind, COALESCE(SUM(size),0) AS b, COUNT(*) AS c FROM chat_files WHERE deleted_at IS NULL GROUP BY kind"),
    all<{ id: string; name: string; kind: string; b: number; messages: number }>(
      `SELECT g.id, g.name, g.kind, COALESCE((SELECT SUM(f.size) FROM chat_files f WHERE f.group_id = g.id AND f.deleted_at IS NULL), 0) AS b,
              (SELECT COUNT(*) FROM chat_messages m WHERE m.group_id = g.id AND m.deleted_at IS NULL) AS messages
       FROM chat_groups g ORDER BY b DESC, messages DESC LIMIT 200`,
    ),
    all<{ name: string; b: number }>("SELECT u.name, COALESCE(SUM(f.size),0) AS b FROM chat_files f JOIN users u ON u.id = f.uploader_id WHERE f.deleted_at IS NULL GROUP BY u.name ORDER BY b DESC LIMIT 10"),
    get<{ m: number; g: number }>("SELECT (SELECT COUNT(*) FROM chat_messages WHERE deleted_at IS NULL) AS m, (SELECT COUNT(*) FROM chat_groups) AS g"),
  ]);
  // Direct chats are listed by their two people, never by content.
  const dmNames = await all<{ group_id: string; name: string }>("SELECT m.group_id, u.name FROM chat_members m JOIN users u ON u.id = m.user_id JOIN chat_groups g ON g.id = m.group_id WHERE g.kind = 'direct'");
  return {
    total: byKind.reduce((s, k) => s + Number(k.b), 0),
    byKind: byKind.map((k) => ({ kind: k.kind, bytes: Number(k.b), files: Number(k.c) })),
    byUser: byUser.map((u) => ({ name: u.name, bytes: Number(u.b) })),
    chats: byGroup.map((g) => ({
      id: g.id,
      name: g.kind === "direct" ? dmNames.filter((d) => d.group_id === g.id).map((d) => d.name).join(" and ") || "Direct chat" : g.name,
      kind: g.kind,
      bytes: Number(g.b),
      messages: Number(g.messages),
    })),
    messages: Number(counts?.m ?? 0),
    groups: Number(counts?.g ?? 0),
  };
}

// Removes a stored file unless another forwarded copy still points at the same object.
export async function removeStoredFile(f: { id: string; storage: string; path: string }) {
  const { deleteStored } = await import("./storage");
  const shared = f.storage === "supabase" && !!(await get("SELECT 1 AS x FROM chat_files WHERE path = ? AND id <> ? AND deleted_at IS NULL", f.path, f.id));
  if (!shared) await deleteStored(f);
}

// Admin deletes a whole conversation with its files. Direct chats need the system admin; groups and channels
// also chat managers.
export async function deleteConversation(user: AppUser, groupId: string) {
  const g = await get<{ name: string; kind: string }>("SELECT name, kind FROM chat_groups WHERE id = ?", groupId);
  if (!g) return;
  if (g.kind === "direct" ? !can(user, "users.manage") : !can(user, "users.manage") && !canManageChat(user)) throw new WorkflowError("FORBIDDEN", "Only Admin deletes this chat.");
  const files = await all<{ id: string; storage: string; path: string }>("SELECT id, storage, path FROM chat_files WHERE group_id = ? AND deleted_at IS NULL", groupId);
  for (const f of files) await removeStoredFile(f).catch((e) => console.error("chat delete file", f.id, e));
  await run("DELETE FROM chat_groups WHERE id = ?", groupId);
  await audit({ actor: user }, { action: "chat.deleted", summary: `${user.name} deleted the ${g.kind === "direct" ? "direct chat" : g.kind} ${g.kind === "direct" ? "" : g.name} with its ${files.length} files`.replace("  ", " ") });
}

// Daily: messages and files past the retention period (pinned messages stay).
export async function applyChatRetention(now = nowIso()) {
  const c = await chatConfig();
  let n = 0;
  if (c.fileRetentionDays) {
    const cut = new Date(Date.parse(now) - c.fileRetentionDays * 864e5).toISOString();
    const old = await all<{ id: string; storage: string; path: string; message_id: string | null }>("SELECT id, storage, path, message_id FROM chat_files WHERE deleted_at IS NULL AND created_at < ? LIMIT 200", cut);
    for (const f of old) {
      await removeStoredFile(f).catch(() => undefined);
      await run("UPDATE chat_files SET deleted_at = ? WHERE id = ?", now, f.id);
      n++;
    }
  }
  if (c.messageRetentionDays) {
    const cut = new Date(Date.parse(now) - c.messageRetentionDays * 864e5).toISOString();
    await run("UPDATE chat_messages SET deleted_at = ?, body = '' WHERE deleted_at IS NULL AND pinned = 0 AND created_at < ?", now, cut);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Who creates groups: chat managers, team leads and department heads and leads
// ---------------------------------------------------------------------------

export async function canCreateGroups(user: AppUser) {
  if (canManageChat(user) || user.leads.length) return true;
  return !!(await get("SELECT 1 AS x FROM department_positions WHERE user_id = ? AND position IN ('head','lead')", user.id));
}

// ---------------------------------------------------------------------------
// Presence and read receipts
// ---------------------------------------------------------------------------

export const ONLINE_MS = 2 * 60e3;

export async function touchPresence(userId: string) {
  const r = await get<{ last_active_at: string | null }>("SELECT last_active_at FROM users WHERE id = ?", userId);
  if (!r?.last_active_at || Date.now() - Date.parse(r.last_active_at) > 30e3) await run("UPDATE users SET last_active_at = ? WHERE id = ?", nowIso(), userId);
}

export async function presenceOf(ids: string[]): Promise<Record<string, string | null>> {
  if (!ids.length) return {};
  const rows = await all<{ id: string; last_active_at: string | null }>(`SELECT id, last_active_at FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  return Object.fromEntries(rows.map((r) => [r.id, r.last_active_at]));
}

// Marks everything up to the newest message as read now, and keeps a receipt with the time.
export async function recordRead(groupId: string, userId: string) {
  const m = await get<{ last_read_seq: number }>("SELECT last_read_seq FROM chat_members WHERE group_id = ? AND user_id = ?", groupId, userId);
  if (!m) return;
  const top = Number((await get<{ s: number | null }>("SELECT MAX(seq) AS s FROM chat_messages WHERE group_id = ?", groupId))?.s ?? 0);
  const now = nowIso();
  if (top > Number(m.last_read_seq)) {
    await run("INSERT INTO chat_receipts (group_id, user_id, upto_seq, read_at) VALUES (?, ?, ?, ?)", groupId, userId, top, now);
    await run("UPDATE chat_members SET last_read_seq = ?, last_read_at = ? WHERE group_id = ? AND user_id = ?", top, now, groupId, userId);
  } else await run("UPDATE chat_members SET last_read_at = ? WHERE group_id = ? AND user_id = ?", now, groupId, userId);
}

// How far each other member has read (to show sent and seen ticks).
export async function readPositions(groupId: string, exceptUserId: string) {
  const rows = await all<{ user_id: string; last_read_seq: number }>("SELECT user_id, last_read_seq FROM chat_members WHERE group_id = ? AND user_id <> ?", groupId, exceptUserId);
  return rows.map((r) => ({ userId: r.user_id, seq: Number(r.last_read_seq) }));
}

// Who has seen a message, and when.
export async function messageReaders(user: AppUser, messageId: string) {
  const m = await get<{ group_id: string; seq: number; author_id: string }>("SELECT group_id, seq, author_id FROM chat_messages WHERE id = ?", messageId);
  if (!m) throw new WorkflowError("NOT_FOUND", "Message not found.");
  if (!(await membership(m.group_id, user.id)) && !canManageChat(user)) throw new WorkflowError("FORBIDDEN", "You are not in this chat.");
  const rows = await all<{ user_id: string; name: string; read_at: string | null }>(
    `SELECT mb.user_id, u.name, (SELECT MIN(r.read_at) FROM chat_receipts r WHERE r.group_id = mb.group_id AND r.user_id = mb.user_id AND r.upto_seq >= ?) AS read_at
     FROM chat_members mb JOIN users u ON u.id = mb.user_id WHERE mb.group_id = ? AND mb.user_id <> ? ORDER BY u.name`,
    m.seq,
    m.group_id,
    m.author_id,
  );
  return rows.map((r) => ({ userId: r.user_id, name: r.name, readAt: r.read_at }));
}

// ---------------------------------------------------------------------------
// Search and the timeline
// ---------------------------------------------------------------------------

export type SearchHit = { id: string; groupId: string; groupName: string; seq: number; authorName: string; body: string; createdAt: string };

// Searches readable text in the person's groups and channels. Direct chats are end-to-end encrypted, so the
// server cannot read them; the browser searches those.
export async function searchMessages(user: AppUser, input: { q: string; groupId?: string | null; from?: string | null; to?: string | null }): Promise<SearchHit[]> {
  const q = input.q.trim();
  if (q.length < 2) return [];
  const params: (string | number)[] = [user.id, `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`];
  let extra = "";
  if (input.groupId) {
    extra += " AND c.group_id = ?";
    params.push(input.groupId);
  }
  if (input.from) {
    extra += " AND c.created_at >= ?";
    params.push(`${input.from}T00:00:00.000Z`);
  }
  if (input.to) {
    extra += " AND c.created_at <= ?";
    params.push(`${input.to}T23:59:59.999Z`);
  }
  const rows = await all<{ id: string; group_id: string; group_name: string; seq: number; author_name: string; body: string; created_at: string }>(
    `SELECT c.id, c.group_id, g.name AS group_name, c.seq, u.name AS author_name, c.body, c.created_at
     FROM chat_messages c JOIN chat_groups g ON g.id = c.group_id JOIN users u ON u.id = c.author_id
     JOIN chat_members mb ON mb.group_id = c.group_id AND mb.user_id = ?
     WHERE c.encrypted = 0 AND c.deleted_at IS NULL AND c.body ILIKE ?${extra}
     ORDER BY c.created_at DESC LIMIT 100`,
    ...params,
  );
  return rows.map((r) => ({ id: r.id, groupId: r.group_id, groupName: r.group_name, seq: Number(r.seq), authorName: r.author_name, body: r.body.slice(0, 300), createdAt: r.created_at }));
}

// Messages starting from a date (or a message), for jumping back in time.
export async function messagesFrom(user: AppUser, groupId: string, at: { date?: string; seq?: number }) {
  if (!(await membership(groupId, user.id)) && !canManageChat(user)) throw new WorkflowError("FORBIDDEN", "You are not in this chat.");
  let seq = at.seq ?? null;
  if (!seq && at.date) {
    const r = await get<{ s: number | null }>("SELECT MIN(seq) AS s FROM chat_messages WHERE group_id = ? AND created_at >= ?", groupId, `${at.date}T00:00:00.000Z`);
    seq = r?.s ? Number(r.s) : null;
  }
  if (!seq) return { messages: [] as ChatMessage[], anchorSeq: null, hasNewer: false };
  const before = await groupMessages(groupId, { beforeSeq: seq, limit: 20, viewerId: user.id });
  const after = await groupMessages(groupId, { afterSeq: seq - 1, limit: 80, viewerId: user.id });
  const top = Number((await get<{ s: number | null }>("SELECT MAX(seq) AS s FROM chat_messages WHERE group_id = ?", groupId))?.s ?? 0);
  return { messages: [...before, ...after], anchorSeq: seq, hasNewer: after.length > 0 && after[after.length - 1]!.seq < top };
}

export async function newerMessages(user: AppUser, groupId: string, afterSeq: number) {
  if (!(await membership(groupId, user.id)) && !canManageChat(user)) throw new WorkflowError("FORBIDDEN", "You are not in this chat.");
  return groupMessages(groupId, { afterSeq, limit: 80, viewerId: user.id });
}

// Files, photos, videos and voice notes in a chat, plus messages with links (and, in encrypted chats, recent
// text for the browser to find links in).
export async function sharedMedia(user: AppUser, groupId: string) {
  if (!(await membership(groupId, user.id)) && !canManageChat(user)) throw new WorkflowError("FORBIDDEN", "You are not in this chat.");
  const ids = await all<{ seq: number }>(
    `SELECT c.seq FROM chat_messages c WHERE c.group_id = ? AND c.deleted_at IS NULL
       AND (c.kind IN ('file','voice') OR (c.encrypted = 0 AND c.body ~* 'https?://') OR (c.encrypted = 1 AND c.kind = 'text'))
     ORDER BY c.seq DESC LIMIT 400`,
    groupId,
  );
  if (!ids.length) return [];
  const min = Math.min(...ids.map((r) => Number(r.seq)));
  const keep = new Set(ids.map((r) => Number(r.seq)));
  const out: ChatMessage[] = [];
  let after = min - 1;
  for (let i = 0; i < 6; i++) {
    const batch = await groupMessages(groupId, { afterSeq: after, limit: 200, viewerId: user.id });
    if (!batch.length) break;
    out.push(...batch.filter((m) => keep.has(m.seq)));
    after = batch[batch.length - 1]!.seq;
  }
  return out.reverse();
}

// ---------------------------------------------------------------------------
// Forwarding
// ---------------------------------------------------------------------------

// Copies a readable message (text, or a file that is not end-to-end encrypted) to chats the person can post in.
// Encrypted direct chats are forwarded by the browser, which re-encrypts for each person.
export async function forwardPlain(user: AppUser, messageId: string, groupIds: string[]) {
  const src = await get<{ group_id: string; body: string; kind: string; meta: string | null; encrypted: number; deleted_at: string | null; author_name: string; group_name: string; forwarded_from: string | null }>(
    "SELECT c.group_id, c.body, c.kind, c.meta, c.encrypted, c.deleted_at, u.name AS author_name, g.name AS group_name, c.forwarded_from FROM chat_messages c JOIN users u ON u.id = c.author_id JOIN chat_groups g ON g.id = c.group_id WHERE c.id = ?",
    messageId,
  );
  if (!src || src.deleted_at) throw new WorkflowError("NOT_FOUND", "The message is gone.");
  if (!(await membership(src.group_id, user.id))) throw new WorkflowError("FORBIDDEN", "You are not in that chat.");
  if (src.encrypted) throw new WorkflowError("VALIDATION", "Encrypted messages are forwarded from your device.");
  if (!["text", "file"].includes(src.kind)) throw new WorkflowError("VALIDATION", "Only messages and files can be forwarded.");
  const from = src.forwarded_from ?? `${src.author_name} in ${src.group_name}`;
  const fileId = src.meta ? parseJson<{ fileId?: string }>(src.meta, {}).fileId : undefined;
  const file = fileId ? await get<{ kind: string; name: string | null; mime: string; size: number; storage: string; path: string; deleted_at: string | null }>("SELECT kind, name, mime, size, storage, path, deleted_at FROM chat_files WHERE id = ?", fileId) : null;
  if (fileId && (!file || file.deleted_at)) throw new WorkflowError("VALIDATION", "The file has been removed.");
  const done: string[] = [];
  for (const gid of [...new Set(groupIds)]) {
    const m = await membership(gid, user.id);
    const g = await get<{ kind: string; archived: number }>("SELECT kind, archived FROM chat_groups WHERE id = ?", gid);
    if (!m || !g || g.archived) continue;
    if (g.kind === "channel" && m.member_role !== "admin") continue;
    if (g.kind === "direct") continue;
    const now = nowIso();
    const id = uid("msg_");
    let meta: string | null = null;
    if (file && fileId) {
      const nf = uid("fil_");
      await run(
        "INSERT INTO chat_files (id, group_id, message_id, uploader_id, kind, name, mime, size, storage, path, encrypted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
        nf,
        gid,
        id,
        user.id,
        file.kind,
        file.name,
        file.mime,
        file.size,
        file.storage,
        file.storage === "supabase" ? file.path : `${gid}/${nf}`,
        now,
      );
      if (file.storage !== "supabase") await run("INSERT INTO chat_blobs (file_id, data) SELECT ?, data FROM chat_blobs WHERE file_id = ?", nf, fileId);
      meta = JSON.stringify({ fileId: nf });
    }
    await run(
      "INSERT INTO chat_messages (id, group_id, author_id, body, kind, meta, forwarded_from, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      gid,
      user.id,
      src.body,
      src.kind,
      meta,
      from,
      now,
    );
    await run("UPDATE chat_groups SET last_message_at = ? WHERE id = ?", now, gid);
    done.push(gid);
  }
  return done;
}
