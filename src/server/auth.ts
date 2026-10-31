import crypto from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { get, nowIso, run } from "./db";
import { can, loadUser, type AppUser } from "./users";
import { signInPolicy } from "./signin-config";
import { clientIpFrom } from "./client-ip";
import { sessionLimitFor } from "@/lib/signin-policy";
import type { Capability, Role } from "@/lib/domain";

const COOKIE = "myseed_session";
// A long-lived random id for the browser, so Admin can see and block devices.
const DEVICE_COOKIE = "myseed_device";
// Admin's "View as": the person whose view is shown. Read only, and only honoured for people who manage users.
export const PREVIEW_COOKIE = "myseed_preview";

export type Viewer = AppUser & { activeRole: Role; sessionId: string; previewBy?: { id: string; name: string } };

const secure = () => process.env.NODE_ENV === "production" && process.env.MYSEED_INSECURE_COOKIES !== "1";

// The visitor's address as our own proxy saw it (see client-ip.ts): used for sign-in limits, the sign-in log and
// the office-network check for attendance, so it must not be something the visitor can write.
export async function requestIp() {
  return clientIpFrom(await headers());
}

export async function deviceId(create: boolean) {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
  if (!create) return null;
  const id = crypto.randomBytes(16).toString("hex");
  jar.set(DEVICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: 2 * 365 * 864e2 });
  return id;
}

export async function isDeviceBlocked(id: string | null) {
  return !!id && !!(await get("SELECT 1 AS x FROM blocked_devices WHERE device_id = ?", id));
}

// Signs a person in on this browser once every step is done (see signin.ts, which checks passwords and two-step).
export async function startSession(userId: string): Promise<{ ok: true; sessionId: string; deviceId: string | null } | { ok: false; error: string }> {
  const device = await deviceId(true);
  if (await isDeviceBlocked(device)) return { ok: false, error: "This device is blocked from signing in. Ask your administrator." };
  const user = (await loadUser(userId))!;
  const id = crypto.randomBytes(24).toString("hex");
  const now = new Date();
  // The session ends at the shortest maximum length of the person's roles (Admin, Sign-in, Sessions).
  const expires = new Date(now.getTime() + sessionLimitFor(await signInPolicy(), user.roles).maxHours * 3600e3);
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const defaultRole = pickDefaultRole(user.roles);
  await run(
        "INSERT INTO sessions (id, user_id, active_role, created_at, expires_at, user_agent, ip, device_id, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id,
        userId,
        defaultRole,
        now.toISOString(),
        expires.toISOString(),
        ua,
        await requestIp(),
        device,
        now.toISOString(),
      );
  await run("UPDATE users SET last_login_at = ? WHERE id = ?", now.toISOString(), userId);
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", expires });
  return { ok: true, sessionId: id, deviceId: device };
}

export async function signOut() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await run("DELETE FROM sessions WHERE id = ?", id);
  jar.delete(COOKIE);
  jar.delete(PREVIEW_COOKIE);
}

function pickDefaultRole(roles: Role[]): Role {
  if (roles.includes("manager")) return "manager";
  if (roles.includes("admin")) return "admin";
  return roles[0] ?? "recording";
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const session = await get<{ id: string; user_id: string; active_role: Role | null; created_at: string; expires_at: string; device_id: string | null; last_seen_at: string | null }>(
      "SELECT id, user_id, active_role, created_at, expires_at, device_id, last_seen_at FROM sessions WHERE id = ?",
      id,
    );
  if (!session || session.expires_at < nowIso()) return null;
  // A device blocked after signing in loses its sessions at the next page.
  if (await isDeviceBlocked(session.device_id)) {
    await run("DELETE FROM sessions WHERE id = ?", session.id);
    return null;
  }
  const user = await loadUser(session.user_id);
  if (!user || !user.active) return null;
  // Idle sign-out and maximum length follow the person's current roles, so a new role's limits apply at once.
  const lim = sessionLimitFor(await signInPolicy(), user.roles);
  const seen = Date.parse(session.last_seen_at ?? session.created_at);
  if ((lim.idleMinutes && Date.now() - seen > lim.idleMinutes * 60e3) || Date.now() - Date.parse(session.created_at) > lim.maxHours * 3600e3) {
    await run("DELETE FROM sessions WHERE id = ?", session.id);
    return null;
  }
  if (!session.last_seen_at || Date.now() - Date.parse(session.last_seen_at) > 5 * 60e3)
    await run("UPDATE sessions SET last_seen_at = ?, ip = COALESCE(?, ip) WHERE id = ?", nowIso(), await requestIp(), session.id);
  // The role switcher only changes presentation; it never grants a role the user lacks.
  const activeRole =
    session.active_role && user.roles.includes(session.active_role) ? session.active_role : pickDefaultRole(user.roles);
  const preview = jar.get(PREVIEW_COOKIE)?.value;
  if (preview && can(user, "users.manage")) {
    const [targetId, role] = preview.split(":");
    const target = targetId && targetId !== user.id ? await loadUser(targetId) : null;
    if (target?.active) {
      const asRole = role && target.roles.includes(role as Role) ? (role as Role) : pickDefaultRole(target.roles);
      return { ...target, activeRole: asRole, sessionId: session.id, previewBy: { id: user.id, name: user.name } };
    }
  }
  return { ...user, activeRole, sessionId: session.id };
});

// True while Admin is looking through someone else's eyes; nothing may be changed then.
export async function inPreview() {
  return !!(await cookies()).get(PREVIEW_COOKIE)?.value;
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireManager(cap: Capability = "items.plan"): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!can(viewer, cap)) redirect("/dashboard?denied=manager");
  return viewer;
}

export async function requireCapability(cap: Capability): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!can(viewer, cap)) redirect("/dashboard?denied=permission");
  return viewer;
}

export async function setActiveRole(role: Role) {
  const viewer = await requireViewer();
  if (viewer.previewBy) throw new Error("Exit View as to switch your own role.");
  if (!viewer.roles.includes(role)) throw new Error("You do not hold that role.");
  await run("UPDATE sessions SET active_role = ? WHERE id = ?", role, viewer.sessionId);
}

// The real person behind the session, ignoring View as (for Admin's own actions such as leaving the preview).
export async function realViewer(): Promise<AppUser | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const s = await get<{ user_id: string; expires_at: string }>("SELECT user_id, expires_at FROM sessions WHERE id = ?", id);
  return s && s.expires_at >= nowIso() ? loadUser(s.user_id) : null;
}
