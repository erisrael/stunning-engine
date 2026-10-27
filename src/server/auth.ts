import crypto from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { get, nowIso, run } from "./db";
import { can, loadUser, type AppUser } from "./users";
import { verifyPassword } from "./passwords";
import type { Capability, Role } from "@/lib/domain";

const COOKIE = "myseed_session";
const SESSION_DAYS = 14;

export type Viewer = AppUser & { activeRole: Role; sessionId: string };

export async function signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await get<{ id: string; password_hash: string | null; active: number }>(
      "SELECT id, password_hash, active FROM users WHERE lower(email) = lower(?)",
      email.trim(),
    );
  if (!row || !row.active || !verifyPassword(password, row.password_hash)) {
    return { ok: false, error: "Email or password is incorrect." };
  }
  const user = (await loadUser(row.id))!;
  const id = crypto.randomBytes(24).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 864e5);
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  const defaultRole = pickDefaultRole(user.roles);
  await run(
        "INSERT INTO sessions (id, user_id, active_role, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        row.id,
        defaultRole,
        now.toISOString(),
        expires.toISOString(),
        ua,
      );
  await run("UPDATE users SET last_login_at = ? WHERE id = ?", now.toISOString(), row.id);
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.MYSEED_INSECURE_COOKIES !== "1",
    path: "/",
    expires,
  });
  return { ok: true };
}

export async function signOut() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await run("DELETE FROM sessions WHERE id = ?", id);
  jar.delete(COOKIE);
}

function pickDefaultRole(roles: Role[]): Role {
  if (roles.includes("manager")) return "manager";
  if (roles.includes("admin")) return "admin";
  return roles[0] ?? "recording";
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const session = await get<{ id: string; user_id: string; active_role: Role | null; expires_at: string }>(
      "SELECT id, user_id, active_role, expires_at FROM sessions WHERE id = ?",
      id,
    );
  if (!session || session.expires_at < nowIso()) return null;
  const user = await loadUser(session.user_id);
  if (!user || !user.active) return null;
  // The role switcher only changes presentation; it never grants a role the user lacks.
  const activeRole =
    session.active_role && user.roles.includes(session.active_role) ? session.active_role : pickDefaultRole(user.roles);
  return { ...user, activeRole, sessionId: session.id };
});

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
  if (!viewer.roles.includes(role)) throw new Error("You do not hold that role.");
  await run("UPDATE sessions SET active_role = ? WHERE id = ?", role, viewer.sessionId);
}
