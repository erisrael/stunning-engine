// Forgotten passwords: a one-time link by email, or proving the account with Google (the account's email must be
// the Google or Gmail address). Either way the person then chooses a new password on /login/reset.

import crypto from "node:crypto";
import { headers } from "next/headers";
import { get, nowIso, parseJson, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { seal, unseal } from "./secrets";
import { hashPassword, passwordProblems } from "./passwords";
import { sendSystemEmail } from "./email";
import { getSettings } from "./settings";
import { can, loadUser, type AppUser } from "./users";

const LINK_MINUTES = 30;
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http")}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
}

export async function createResetToken(userId: string, via: "email" | "google") {
  const token = crypto.randomBytes(32).toString("base64url");
  await run("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL", userId);
  await run(
    "INSERT INTO password_resets (token_hash, user_id, via, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    hash(token),
    userId,
    via,
    new Date(Date.now() + LINK_MINUTES * 60e3).toISOString(),
    nowIso(),
  );
  return token;
}

// Always answers the same way, so nobody can learn which emails have accounts.
export async function requestEmailReset(email: string) {
  const u = await get<{ id: string; name: string; email: string; active: number }>("SELECT id, name, email, active FROM users WHERE lower(email) = lower(?)", email.trim());
  if (!u || !u.active) return;
  // At most one link every two minutes per person.
  const recent = await get("SELECT 1 AS x FROM password_resets WHERE user_id = ? AND created_at > ?", u.id, new Date(Date.now() - 120e3).toISOString());
  if (recent) return;
  const token = await createResetToken(u.id, "email");
  const link = `${await appOrigin()}/login/reset?token=${token}`;
  const ws = (await getSettings()).workspace.name;
  try {
    await sendSystemEmail(
      u.email,
      `Reset your ${ws} password`,
      `Hello ${u.name},\n\nSomeone asked to reset the password for your ${ws} account. If it was you, open this link within ${LINK_MINUTES} minutes:\n\n${link}\n\nIf it was not you, ignore this email; your password stays the same.`,
      `<p>Hello ${u.name.replace(/[<>&]/g, "")},</p><p>Someone asked to reset the password for your ${ws.replace(/[<>&]/g, "")} account. If it was you, open this link within ${LINK_MINUTES} minutes:</p><p><a href="${link}">Choose a new password</a></p><p>If it was not you, ignore this email; your password stays the same.</p>`,
    );
  } catch (e) {
    console.error("Password reset email failed", e);
  }
  await audit({ actor: null }, { action: "user.password_reset", summary: `A password reset link was emailed to ${u.name}` });
}

export async function checkResetToken(token: string) {
  const r = await get<{ user_id: string; expires_at: string; used_at: string | null }>("SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?", hash(token));
  if (!r || r.used_at || r.expires_at < nowIso()) return null;
  const u = await loadUser(r.user_id);
  return u?.active ? { userId: u.id, name: u.name, email: u.email } : null;
}

export async function completeReset(token: string, password: string) {
  const r = await checkResetToken(token);
  if (!r) throw new WorkflowError("INVALID_STATE", "This link has expired or was already used. Ask for a new one.");
  const problem = passwordProblems(password);
  if (problem) throw new WorkflowError("VALIDATION", problem);
  await run("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", hashPassword(password), r.userId);
  await run("UPDATE password_resets SET used_at = ? WHERE token_hash = ?", nowIso(), hash(token));
  // A reset signs the person out everywhere else.
  await run("DELETE FROM sessions WHERE user_id = ?", r.userId);
  await audit({ actor: null }, { action: "user.password_reset", summary: `${r.name} chose a new password after a reset` });
  return r;
}

// ---------------------------------------------------------------------------
// Google sign-in (for proving the account during a reset)
// ---------------------------------------------------------------------------

type GoogleStored = { clientId: string; secretEnc: string | null };

export async function googleConfig(): Promise<{ clientId: string; secret: string } | null> {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return { clientId: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
  const s = parseJson<GoogleStored | null>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.google'"))?.value, null);
  if (!s?.clientId || !s.secretEnc) return null;
  const secret = await unseal(s.secretEnc);
  return secret ? { clientId: s.clientId, secret } : null;
}

export async function googleSettings() {
  const s = parseJson<GoogleStored | null>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.google'"))?.value, null);
  return { fromEnv: !!process.env.GOOGLE_CLIENT_ID, clientId: process.env.GOOGLE_CLIENT_ID ?? s?.clientId ?? "", hasSecret: !!process.env.GOOGLE_CLIENT_SECRET || !!s?.secretEnc, redirectUri: `${await appOrigin()}/api/auth/google/callback` };
}

export async function saveGoogleSettings(user: AppUser, input: { clientId: string; secret?: string | null }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up Google sign-in.");
  const clientId = input.clientId.trim();
  if (clientId && !/\.apps\.googleusercontent\.com$/.test(clientId)) throw new WorkflowError("VALIDATION", "The client ID ends with .apps.googleusercontent.com.");
  const old = parseJson<GoogleStored | null>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.google'"))?.value, null);
  const next: GoogleStored = { clientId, secretEnc: input.secret?.trim() ? await seal(input.secret.trim()) : clientId ? (old?.secretEnc ?? null) : null };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.google', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.google", summary: `${user.name} ${clientId ? "set up" : "turned off"} Google for password resets` });
}

// Exchanges Google's code for the verified email address.
export async function googleEmail(code: string): Promise<string | null> {
  const g = await googleConfig();
  if (!g) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.secret, redirect_uri: `${await appOrigin()}/api/auth/google/callback`, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) return null;
  // Google checks the token's signature and expiry for us here.
  const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`, { signal: AbortSignal.timeout(15_000) });
  if (!info.ok) return null;
  const t = (await info.json()) as { aud?: string; email?: string; email_verified?: string | boolean; iss?: string };
  if (t.aud !== g.clientId || !t.email || !(t.email_verified === true || t.email_verified === "true")) return null;
  if (t.iss && !/accounts\.google\.com$/.test(t.iss)) return null;
  return t.email.toLowerCase();
}
