// Signed-in sessions and devices: everyone sees and ends their own; Admin sees everyone's, ends any session and
// blocks a device (its sessions end at once and it cannot sign in again until unblocked).

import { all, get, nowIso, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";

export type DeviceInfo = { browser: string; os: string; kind: "phone" | "tablet" | "computer" };

export function parseAgent(ua: string | null): DeviceInfo {
  const u = ua ?? "";
  const browser = /Edg\//.test(u)
    ? "Edge"
    : /OPR\//.test(u)
      ? "Opera"
      : /SamsungBrowser/.test(u)
        ? "Samsung Internet"
        : /Chrome\//.test(u)
          ? "Chrome"
          : /Firefox\//.test(u)
            ? "Firefox"
            : /Safari\//.test(u)
              ? "Safari"
              : u
                ? "Other browser"
                : "Unknown";
  const os = /Windows NT/.test(u) ? "Windows" : /Android/.test(u) ? "Android" : /iPhone|iPad|iPod/.test(u) ? "iOS" : /Mac OS X/.test(u) ? "macOS" : /CrOS/.test(u) ? "ChromeOS" : /Linux/.test(u) ? "Linux" : "Unknown";
  const kind = /iPad|Tablet/.test(u) ? "tablet" : /Mobi|iPhone|Android/.test(u) ? "phone" : "computer";
  return { browser, os, kind };
}

export type SessionRow = { id: string; userId: string; userName: string; ip: string | null; deviceId: string | null; device: DeviceInfo; createdAt: string; lastSeenAt: string | null; current: boolean; blocked: boolean };

export async function listSessions(user: AppUser & { sessionId: string }, opts: { everyone?: boolean } = {}): Promise<SessionRow[]> {
  if (opts.everyone && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees everyone's sessions.");
  const rows = await all<{ id: string; user_id: string; name: string; ip: string | null; device_id: string | null; user_agent: string | null; created_at: string; last_seen_at: string | null; blocked: string | null }>(
    `SELECT s.id, s.user_id, u.name, s.ip, s.device_id, s.user_agent, s.created_at, s.last_seen_at, b.device_id AS blocked
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN blocked_devices b ON b.device_id = s.device_id
     WHERE s.expires_at > ? ${opts.everyone ? "" : "AND s.user_id = ?"} ORDER BY COALESCE(s.last_seen_at, s.created_at) DESC LIMIT 500`,
    nowIso(),
    ...(opts.everyone ? [] : [user.id]),
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.name,
    ip: r.ip,
    deviceId: r.device_id,
    device: parseAgent(r.user_agent),
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    current: r.id === user.sessionId,
    blocked: !!r.blocked,
  }));
}

export async function endSession(user: AppUser & { sessionId: string }, id: string) {
  const s = await get<{ user_id: string; name: string }>("SELECT s.user_id, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?", id);
  if (!s) return;
  if (s.user_id !== user.id && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "You can end only your own sessions.");
  if (id === user.sessionId) throw new WorkflowError("VALIDATION", "Use Sign out to end this session.");
  await run("DELETE FROM sessions WHERE id = ?", id);
  if (s.user_id !== user.id) await audit({ actor: user }, { action: "user.session", summary: `${user.name} ended a session of ${s.name}` });
}

// Ends every session of a person except the one in use (theirs, or Admin's for someone else).
export async function endOtherSessions(user: AppUser & { sessionId: string }, userId = user.id) {
  if (userId !== user.id && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "You can end only your own sessions.");
  const n = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM sessions WHERE user_id = ? AND id <> ?", userId, user.sessionId))?.c ?? 0);
  await run("DELETE FROM sessions WHERE user_id = ? AND id <> ?", userId, user.sessionId);
  await audit({ actor: user }, { action: "user.session", summary: `${user.name} signed out ${n} other sessions${userId !== user.id ? " of another person" : ""}` });
  return n;
}

export type BlockedDevice = { deviceId: string; label: string | null; userName: string | null; reason: string | null; blockedBy: string | null; blockedAt: string };

export async function listBlocked(user: AppUser): Promise<BlockedDevice[]> {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin manages devices.");
  const rows = await all<{ device_id: string; label: string | null; user_name: string | null; reason: string | null; by_name: string | null; blocked_at: string }>(
    "SELECT b.device_id, b.label, u.name AS user_name, b.reason, a.name AS by_name, b.blocked_at FROM blocked_devices b LEFT JOIN users u ON u.id = b.user_id LEFT JOIN users a ON a.id = b.blocked_by ORDER BY b.blocked_at DESC",
  );
  return rows.map((r) => ({ deviceId: r.device_id, label: r.label, userName: r.user_name, reason: r.reason, blockedBy: r.by_name, blockedAt: r.blocked_at }));
}

export async function blockDevice(user: AppUser & { sessionId: string }, sessionId: string, reason?: string | null) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin blocks devices.");
  const s = await get<{ device_id: string | null; user_id: string; user_agent: string | null; name: string }>(
    "SELECT s.device_id, s.user_id, s.user_agent, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
    sessionId,
  );
  if (!s) throw new WorkflowError("NOT_FOUND", "This session has already ended.");
  if (!s.device_id) throw new WorkflowError("VALIDATION", "This session started before devices were tracked. End it instead; the device can be blocked after it signs in again.");
  if (sessionId === user.sessionId) throw new WorkflowError("VALIDATION", "You cannot block the device you are using.");
  const d = parseAgent(s.user_agent);
  await run(
    "INSERT INTO blocked_devices (device_id, label, user_id, reason, blocked_by, blocked_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (device_id) DO NOTHING",
    s.device_id,
    `${d.browser} on ${d.os}`,
    s.user_id,
    reason?.trim().slice(0, 200) || null,
    user.id,
    nowIso(),
  );
  await run("DELETE FROM sessions WHERE device_id = ?", s.device_id);
  await audit({ actor: user }, { action: "user.device", summary: `${user.name} blocked ${d.browser} on ${d.os} used by ${s.name}${reason ? `: ${reason}` : ""}` });
}

export async function unblockDevice(user: AppUser, deviceId: string) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin manages devices.");
  await run("DELETE FROM blocked_devices WHERE device_id = ?", deviceId);
  await audit({ actor: user }, { action: "user.device", summary: `${user.name} unblocked a device` });
}
