// In-app voice and video calls with our own ringing. The call's state lives in the calls table; both browsers
// poll it (every 2 seconds while open, faster during a call) and report that they are still there, so a hang-up,
// a closed tab or a lost connection ends the call for both. The callee's devices also get a push notification.
// Audio and video go directly between the two browsers (WebRTC); call_signals only carries the connection setup.

import { all, get, nowIso, run, uid } from "./db";
import { notify } from "./notifications";
import { sendPush } from "./push";
import { seal, unseal } from "./secrets";
import { audit, WorkflowError } from "./workflow";
import type { AppUser } from "./users";

export const RING_MS = 45_000;
// A side that has not polled for this long has gone (closed tab, lost network).
export const GONE_MS = 15_000;

export type CallMedia = "audio" | "video";
export type CallStatus = "ringing" | "accepted" | "declined" | "busy" | "missed" | "cancelled" | "ended" | "failed";
export const ACTIVE: CallStatus[] = ["ringing", "accepted"];

type CallRow = {
  id: string;
  group_id: string;
  caller_id: string;
  callee_id: string;
  media: CallMedia;
  status: CallStatus;
  end_reason: string | null;
  ended_by: string | null;
  caller_seen_at: string | null;
  callee_seen_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type CallView = {
  id: string;
  groupId: string;
  media: CallMedia;
  status: CallStatus;
  endReason: string | null;
  direction: "outgoing" | "incoming";
  peer: { id: string; name: string };
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
};

export type CallSignal = { seq: number; kind: string; payload: string };

async function names(ids: string[]) {
  const rows = await all<{ id: string; name: string }>(`SELECT id, name FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function view(r: CallRow, viewerId: string): Promise<CallView> {
  const peerId = r.caller_id === viewerId ? r.callee_id : r.caller_id;
  const n = await names([peerId]);
  return {
    id: r.id,
    groupId: r.group_id,
    media: r.media,
    status: r.status,
    endReason: r.end_reason,
    direction: r.caller_id === viewerId ? "outgoing" : "incoming",
    peer: { id: peerId, name: n.get(peerId) ?? "Someone" },
    createdAt: r.created_at,
    answeredAt: r.answered_at,
    endedAt: r.ended_at,
  };
}

async function callRow(id: string) {
  const r = await get<CallRow>("SELECT * FROM calls WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Call not found.");
  return r;
}

function party(r: CallRow, userId: string) {
  if (r.caller_id !== userId && r.callee_id !== userId) throw new WorkflowError("FORBIDDEN", "You are not in this call.");
  return r.caller_id === userId ? "caller" : "callee";
}

async function inCall(userId: string) {
  return await get<{ id: string }>(
    "SELECT id FROM calls WHERE (caller_id = ? OR callee_id = ?) AND status IN ('ringing', 'accepted') LIMIT 1",
    userId,
    userId,
  );
}

// Moves an active call to its final state exactly once (the conditional update decides who wins), then posts the
// call card in the chat, notifies a missed call and clears the connection messages.
// endAt: when the call really stopped, for a side that vanished (its last report), so the length is not inflated.
async function finish(id: string, status: CallStatus, reason: string | null, by: string | null, endAt?: string) {
  const now = endAt ?? nowIso();
  const done = await all<CallRow>(
    "UPDATE calls SET status = ?, end_reason = ?, ended_by = ?, ended_at = ? WHERE id = ? AND status IN ('ringing', 'accepted') RETURNING *",
    status,
    reason,
    by,
    now,
    id,
  );
  const r = done[0];
  if (!r) return false;
  await run("DELETE FROM call_signals WHERE call_id = ?", id);
  const durationSec = r.answered_at ? Math.max(0, Math.round((Date.parse(now) - Date.parse(r.answered_at)) / 1000)) : 0;
  await run(
    "INSERT INTO chat_messages (id, group_id, author_id, body, kind, meta, created_at) VALUES (?, ?, ?, '', 'call', ?, ?)",
    uid("msg_"),
    r.group_id,
    r.caller_id,
    JSON.stringify({ provider: "inapp", callId: r.id, media: r.media, status: r.answered_at ? "ended" : r.status, durationSec, reason }),
    now,
  );
  await run("UPDATE chat_groups SET last_message_at = ? WHERE id = ?", now, r.group_id);
  if (!r.answered_at && (r.status === "missed" || r.status === "cancelled" || r.status === "busy")) {
    const caller = (await names([r.caller_id])).get(r.caller_id) ?? "Someone";
    const what = `Missed ${r.media === "video" ? "video" : "voice"} call`;
    await notify([r.callee_id], { type: "mention", title: `${what} from ${caller}`, link: `/chat?g=${r.group_id}`, groupKey: `call:missed:${r.group_id}` }, now);
    // Replaces the ringing notification on the callee's devices (same tag).
    if (r.status !== "busy") await sendPush([r.callee_id], { title: `${what} from ${caller}`, link: `/chat?g=${r.group_id}`, tag: `call:${r.id}`, ttl: 600 });
  }
  return true;
}

// Ends calls nobody answered in time and calls where one side stopped reporting. Runs on every poll; cheap when
// nothing is active.
export async function sweepCalls() {
  const now = Date.now();
  const ringCut = new Date(now - RING_MS).toISOString();
  const goneCut = new Date(now - GONE_MS).toISOString();
  const stale = await all<{ id: string; status: CallStatus; created_at: string; caller_seen_at: string | null; callee_seen_at: string | null }>(
    `SELECT id, status, created_at, caller_seen_at, callee_seen_at FROM calls
     WHERE (status = 'ringing' AND (created_at < ? OR COALESCE(caller_seen_at, created_at) < ?))
        OR (status = 'accepted' AND (COALESCE(caller_seen_at, created_at) < ? OR COALESCE(callee_seen_at, created_at) < ?))`,
    ringCut,
    goneCut,
    goneCut,
    goneCut,
  );
  for (const c of stale) {
    if (c.status === "ringing") await finish(c.id, c.created_at < ringCut ? "missed" : "cancelled", c.created_at < ringCut ? "no_answer" : "caller_gone", null);
    else {
      const last = [c.caller_seen_at ?? c.created_at, c.callee_seen_at ?? c.created_at].sort()[0];
      await finish(c.id, "ended", "connection_lost", null, last);
    }
  }
}

export async function startCall(user: AppUser, groupId: string, media: CallMedia) {
  const group = await get<{ kind: string; archived: number }>("SELECT kind, archived FROM chat_groups WHERE id = ?", groupId);
  if (!group || group.archived) throw new WorkflowError("NOT_FOUND", "Chat not found.");
  if (group.kind !== "direct") throw new WorkflowError("VALIDATION", "In-app calls work in direct chats. For groups, start a Jitsi or Google Meet call.");
  const members = (await all<{ user_id: string }>("SELECT user_id FROM chat_members WHERE group_id = ?", groupId)).map((m) => m.user_id);
  if (!members.includes(user.id)) throw new WorkflowError("FORBIDDEN", "You are not in this chat.");
  const peerId = members.find((m) => m !== user.id);
  if (!peerId) throw new WorkflowError("VALIDATION", "Nobody else is in this chat.");
  await sweepCalls();
  if (await inCall(user.id)) throw new WorkflowError("INVALID_STATE", "You are already in a call. Hang up first.");
  const id = uid("call_");
  const now = nowIso();
  const busy = !!(await inCall(peerId));
  await run(
    "INSERT INTO calls (id, group_id, caller_id, callee_id, media, status, caller_seen_at, created_at) VALUES (?, ?, ?, ?, ?, 'ringing', ?, ?)",
    id,
    groupId,
    user.id,
    peerId,
    media === "video" ? "video" : "audio",
    now,
    now,
  );
  if (busy) await finish(id, "busy", "busy", null);
  else
    await sendPush([peerId], {
      title: `Incoming ${media === "video" ? "video" : "voice"} call`,
      body: user.name,
      link: `/chat?g=${groupId}`,
      tag: `call:${id}`,
      ttl: Math.round(RING_MS / 1000),
      urgent: true,
      call: id,
    });
  return view(await callRow(id), user.id);
}

export async function answerCall(user: AppUser, id: string) {
  const r = await callRow(id);
  if (party(r, user.id) !== "callee") throw new WorkflowError("FORBIDDEN", "Only the person being called can answer.");
  const now = nowIso();
  const ok = await all<{ id: string }>("UPDATE calls SET status = 'accepted', answered_at = ?, callee_seen_at = ? WHERE id = ? AND status = 'ringing' RETURNING id", now, now, id);
  if (!ok.length) throw new WorkflowError("INVALID_STATE", "This call has already ended.");
  return view(await callRow(id), user.id);
}

export async function declineCall(user: AppUser, id: string) {
  const r = await callRow(id);
  if (party(r, user.id) !== "callee") throw new WorkflowError("FORBIDDEN", "Only the person being called can decline.");
  if (r.status === "ringing") await finish(id, "declined", "declined", user.id);
}

// Either side hangs up. Before the call is answered, the caller hanging up cancels it.
export async function hangUp(user: AppUser, id: string, reason: string | null = null) {
  const r = await callRow(id);
  const side = party(r, user.id);
  if (r.status === "ringing") {
    if (side === "caller") await finish(id, "cancelled", reason ?? "cancelled", user.id);
    else await finish(id, "declined", "declined", user.id);
  } else if (r.status === "accepted") await finish(id, reason === "failed" ? "failed" : "ended", reason ?? "hang_up", user.id);
}

export async function sendSignal(user: AppUser, id: string, kind: string, payload: string) {
  const r = await callRow(id);
  party(r, user.id);
  if (!ACTIVE.includes(r.status)) throw new WorkflowError("INVALID_STATE", "This call has ended.");
  if (!["offer", "answer", "candidate", "media"].includes(kind)) throw new WorkflowError("VALIDATION", "Unknown signal.");
  if (payload.length > 20_000) throw new WorkflowError("VALIDATION", "Signal too large.");
  await run("INSERT INTO call_signals (call_id, from_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)", id, user.id, kind, payload, nowIso());
}

// One poll: marks this person as present in their active call, ends stale calls, and returns their incoming call
// (if ringing), the state of the call they are following, and connection messages from the other side.
export async function pollCalls(user: AppUser, input: { callId?: string | null; afterSeq?: number }) {
  const now = nowIso();
  await run("UPDATE calls SET caller_seen_at = ? WHERE caller_id = ? AND status IN ('ringing', 'accepted')", now, user.id);
  await run("UPDATE calls SET callee_seen_at = ? WHERE callee_id = ? AND status = 'accepted'", now, user.id);
  await sweepCalls();
  const ringing = await get<CallRow>("SELECT * FROM calls WHERE callee_id = ? AND status = 'ringing' ORDER BY created_at DESC LIMIT 1", user.id);
  let call: CallView | null = null;
  let signals: CallSignal[] = [];
  if (input.callId) {
    const r = await get<CallRow>("SELECT * FROM calls WHERE id = ?", input.callId);
    if (r && (r.caller_id === user.id || r.callee_id === user.id)) {
      call = await view(r, user.id);
      if (ACTIVE.includes(r.status))
        signals = (
          await all<{ seq: number; kind: string; payload: string }>(
            "SELECT seq, kind, payload FROM call_signals WHERE call_id = ? AND from_id <> ? AND seq > ? ORDER BY seq",
            r.id,
            user.id,
            input.afterSeq ?? 0,
          )
        ).map((s) => ({ seq: Number(s.seq), kind: s.kind, payload: s.payload }));
    }
  }
  return { incoming: ringing ? await view(ringing, user.id) : null, call, signals };
}

// ---------------------------------------------------------------------------
// Network relay (TURN). Direct connections are tried first (free public STUN). Networks that block them, common
// on mobile data, need a relay: Cloudflare's TURN service, free for the first 1,000 GB a month. Its key is set in
// Settings, Calls (stored encrypted) or in CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN.
// ---------------------------------------------------------------------------

type StoredTurn = { keyId: string; tokenEnc: string };
export type TurnSettings = { keyId: string; hasToken: boolean; source: "env" | "app" | "none" };

const STUN: RTCIceServerLike[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
type RTCIceServerLike = { urls: string | string[]; username?: string; credential?: string };

async function storedTurn() {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.turn'");
  return row ? (JSON.parse(row.value) as StoredTurn) : null;
}

export async function turnSettings(): Promise<TurnSettings> {
  if (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) return { keyId: process.env.CLOUDFLARE_TURN_KEY_ID, hasToken: true, source: "env" };
  const s = await storedTurn();
  return s ? { keyId: s.keyId, hasToken: !!s.tokenEnc, source: "app" } : { keyId: "", hasToken: false, source: "none" };
}

export async function saveTurn(user: AppUser, input: { keyId: string; token?: string | null; clear?: boolean }) {
  if (process.env.CLOUDFLARE_TURN_KEY_ID) throw new WorkflowError("INVALID_STATE", "The relay is set in the hosting environment variables. Change it there.");
  if (input.clear) {
    await run("DELETE FROM settings WHERE key = 'cfg.turn'");
    await audit({ actor: user }, { action: "calls.relay", summary: `${user.name} removed the call relay` });
    return;
  }
  const keyId = input.keyId.trim();
  if (!/^[a-f0-9]{16,64}$/i.test(keyId)) throw new WorkflowError("VALIDATION", "Enter the TURN key ID from Cloudflare (Realtime, TURN Server).");
  const old = await storedTurn();
  const tokenEnc = input.token?.trim() ? await seal(input.token.trim()) : old?.tokenEnc;
  if (!tokenEnc) throw new WorkflowError("VALIDATION", "Enter the API token shown when the TURN key was created.");
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.turn', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify({ keyId, tokenEnc }),
    nowIso(),
    user.id,
  );
  turnCache = null;
  await audit({ actor: user }, { action: "calls.relay", summary: `${user.name} set the call relay` });
}

let turnCache: { at: number; servers: RTCIceServerLike[] } | null = null;

// Short-lived relay credentials from Cloudflare, cached for an hour (they are valid for a day).
export async function iceServers(opts: { strict?: boolean } = {}): Promise<{ iceServers: RTCIceServerLike[]; relay: boolean }> {
  if (!opts.strict && turnCache && Date.now() - turnCache.at < 3_600_000) return { iceServers: [...STUN, ...turnCache.servers], relay: true };
  let keyId = process.env.CLOUDFLARE_TURN_KEY_ID ?? "";
  let token: string | null = process.env.CLOUDFLARE_TURN_API_TOKEN ?? "";
  if (!keyId || !token) {
    const s = await storedTurn();
    keyId = s?.keyId ?? "";
    token = s?.tokenEnc ? await unseal(s.tokenEnc) : null;
  }
  if (!keyId || !token) {
    if (opts.strict) throw new WorkflowError("INVALID_STATE", "No relay is set up yet.");
    return { iceServers: STUN, relay: false };
  }
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 86_400 }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Cloudflare answered ${res.status}${res.status === 401 || res.status === 403 ? " (check the key ID and API token)" : ""}`);
    const data = (await res.json()) as { iceServers: RTCIceServerLike | RTCIceServerLike[] };
    const servers = (Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers]).filter((s) => s.username && s.credential);
    if (!servers.length) throw new Error("Cloudflare returned no relay servers");
    turnCache = { at: Date.now(), servers };
    return { iceServers: [...STUN, ...servers], relay: true };
  } catch (err) {
    if (opts.strict) throw new WorkflowError("INVALID_STATE", `The relay could not be reached: ${err instanceof Error ? err.message : String(err)}`);
    console.error("TURN credentials failed", err);
    return { iceServers: STUN, relay: false };
  }
}
