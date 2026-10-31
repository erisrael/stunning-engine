// Group calls in the app for up to four people in a chat group. Each pair of browsers connects directly (a small
// mesh), so audio and video never pass through the server; group_call_signals only carries the connection setup,
// addressed to one person. Everyone polls the call while in it; someone who stops polling has left.

import { all, get, nowIso, run, uid } from "./db";
import { notify } from "./notifications";
import { WorkflowError } from "./workflow";
import type { AppUser } from "./users";

export const GROUP_CALL_MAX = 4;
const GONE_MS = 15_000;

type CallRow = { id: string; group_id: string; media: "audio" | "video"; started_by: string; status: string; created_at: string; ended_at: string | null };

async function member(userId: string, groupId: string) {
  return !!(await get("SELECT 1 AS x FROM chat_members WHERE group_id = ? AND user_id = ?", groupId, userId));
}

async function callOf(id: string) {
  const c = await get<CallRow>("SELECT * FROM group_calls WHERE id = ?", id);
  if (!c) throw new WorkflowError("NOT_FOUND", "This call has ended.");
  return c;
}

// Members who left without saying so (closed tab, lost network) are marked gone; an empty call ends.
async function sweep(id: string) {
  const cutoff = new Date(Date.now() - GONE_MS).toISOString();
  await run("UPDATE group_call_members SET left_at = seen_at WHERE call_id = ? AND left_at IS NULL AND seen_at < ?", id, cutoff);
  const left = await get<{ c: number }>("SELECT COUNT(*) AS c FROM group_call_members WHERE call_id = ? AND left_at IS NULL", id);
  if (!Number(left?.c ?? 0)) {
    const ended = await run("UPDATE group_calls SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'active'", nowIso(), id);
    if (ended.changes) await run("DELETE FROM group_call_signals WHERE call_id = ?", id);
  }
}

async function present(id: string) {
  return all<{ user_id: string; name: string; joined_at: string }>(
    "SELECT m.user_id, u.name, m.joined_at FROM group_call_members m JOIN users u ON u.id = m.user_id WHERE m.call_id = ? AND m.left_at IS NULL ORDER BY m.joined_at",
    id,
  );
}

// Starts the group's call, or returns the one already going.
export async function startGroupCall(user: AppUser, groupId: string, media: "audio" | "video") {
  const g = await get<{ id: string; kind: string; name: string | null }>("SELECT id, kind, name FROM chat_groups WHERE id = ?", groupId);
  if (!g) throw new WorkflowError("NOT_FOUND", "Chat not found.");
  if (g.kind === "direct") throw new WorkflowError("VALIDATION", "Direct chats use the voice and video buttons.");
  if (!(await member(user.id, groupId))) throw new WorkflowError("FORBIDDEN", "Only members of this group can start its call.");
  const active = await get<{ id: string }>("SELECT id FROM group_calls WHERE group_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", groupId);
  if (active) {
    await sweep(active.id);
    if ((await callOf(active.id)).status === "active") return { id: active.id, existing: true };
  }
  const id = uid("gcl_");
  const now = nowIso();
  await run("INSERT INTO group_calls (id, group_id, media, started_by, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)", id, groupId, media, user.id, now);
  // The person starting it is in the call from the start, so it is not ended as empty before their tab opens.
  await run("INSERT INTO group_call_members (call_id, user_id, joined_at, seen_at) VALUES (?, ?, ?, ?)", id, user.id, now, now);
  const others = (await all<{ user_id: string }>("SELECT user_id FROM chat_members WHERE group_id = ? AND user_id <> ?", groupId, user.id)).map((r) => r.user_id);
  await notify(
    others,
    { type: "discussion", title: `${user.name} started a ${media === "video" ? "video" : "voice"} call`, body: `${g.name ?? "Group"}: join from the chat, up to ${GROUP_CALL_MAX} people.`, link: `/call/${id}`, dedupeKey: `group-call:${id}` },
    now,
    user.id,
  );
  return { id, existing: false };
}

export async function joinGroupCall(user: AppUser, id: string) {
  const c = await callOf(id);
  if (c.status !== "active") throw new WorkflowError("INVALID_STATE", "This call has ended.");
  if (!(await member(user.id, c.group_id))) throw new WorkflowError("FORBIDDEN", "Only members of the group can join.");
  await sweep(id);
  const here = await present(id);
  if (!here.some((p) => p.user_id === user.id) && here.length >= GROUP_CALL_MAX) throw new WorkflowError("VALIDATION", `The call is full (${GROUP_CALL_MAX} people). Try again when someone leaves.`);
  const now = nowIso();
  await run(
    `INSERT INTO group_call_members (call_id, user_id, joined_at, seen_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (call_id, user_id) DO UPDATE SET joined_at = excluded.joined_at, seen_at = excluded.seen_at, left_at = NULL`,
    id,
    user.id,
    now,
    now,
  );
  // Setup messages from an earlier time in the call are stale now.
  await run("DELETE FROM group_call_signals WHERE call_id = ? AND (to_id = ? OR from_id = ?)", id, user.id, user.id);
  const g = await get<{ name: string | null }>("SELECT name FROM chat_groups WHERE id = ?", c.group_id);
  return { id, media: c.media, group: g?.name ?? "Group call", me: user.id };
}

export async function pollGroupCall(user: AppUser, id: string, afterSeq: number) {
  const c = await callOf(id);
  await run("UPDATE group_call_members SET seen_at = ? WHERE call_id = ? AND user_id = ? AND left_at IS NULL", nowIso(), id, user.id);
  await sweep(id);
  const status = (await callOf(id)).status;
  const signals = await all<{ seq: number; from_id: string; kind: string; payload: string }>(
    "SELECT seq, from_id, kind, payload FROM group_call_signals WHERE call_id = ? AND to_id = ? AND seq > ? ORDER BY seq LIMIT 200",
    id,
    user.id,
    afterSeq,
  );
  return {
    status,
    media: c.media,
    participants: (await present(id)).map((p) => ({ id: p.user_id, name: p.name })),
    signals: signals.map((s) => ({ seq: Number(s.seq), from: s.from_id, kind: s.kind, payload: s.payload })),
  };
}

export async function signalGroupCall(user: AppUser, id: string, to: string, kind: string, payload: string) {
  if (!["offer", "answer", "ice"].includes(kind)) throw new WorkflowError("VALIDATION", "Unknown signal.");
  if (payload.length > 20000) throw new WorkflowError("VALIDATION", "Signal too large.");
  const here = await present(id);
  if (!here.some((p) => p.user_id === user.id) || !here.some((p) => p.user_id === to)) throw new WorkflowError("INVALID_STATE", "That person is not in the call.");
  await run("INSERT INTO group_call_signals (call_id, from_id, to_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, user.id, to, kind, payload, nowIso());
}

export async function leaveGroupCall(user: AppUser, id: string) {
  await run("UPDATE group_call_members SET left_at = ? WHERE call_id = ? AND user_id = ? AND left_at IS NULL", nowIso(), id, user.id);
  await sweep(id);
}

// The group's call going on now, for the chat's Join banner.
export async function activeGroupCall(groupId: string) {
  const c = await get<{ id: string; media: string }>("SELECT id, media FROM group_calls WHERE group_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", groupId);
  if (!c) return null;
  await sweep(c.id);
  const here = await present(c.id);
  return here.length ? { id: c.id, media: c.media, people: here.map((p) => p.name) } : null;
}
