// Confirming email addresses (Admin, Sign-in, Email verification). Admin chooses:
//   off      nobody is asked (as before);
//   signup   people who join by invitation or sign-up confirm their email before they can sign in;
//   all      everyone confirms, after a grace period from when the account was made (Admin is never locked out,
//            only reminded).
// A confirmation link is emailed; it works once, for a few days. Google, Microsoft and single sign-on count as
// confirmed, since the provider checked the address. Changing an account's email asks for it again.

import crypto from "node:crypto";
import { all, get, nowIso, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { sendSystemEmail, smtpSettings } from "./email";
import { getSettings } from "./settings";
import { signInPolicy } from "./signin-config";
import { can, type AppUser } from "./users";

const LINK_DAYS = 3;
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

type Row = { id: string; name: string; email: string; created_at: string; email_verified_at: string | null; email_verify_required: number };

async function row(userId: string) {
  return get<Row>("SELECT id, name, email, created_at, email_verified_at, email_verify_required FROM users WHERE id = ?", userId);
}

async function isAdmin(userId: string) {
  return !!(await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ? AND role = 'admin'", userId));
}

// Whether this person must confirm their email before signing in now.
export async function mustConfirmEmail(userId: string): Promise<boolean> {
  const p = (await signInPolicy()).emailVerify;
  if (p.mode === "off") return false;
  const u = await row(userId);
  if (!u || u.email_verified_at) return false;
  // Without an email account the link cannot be sent, so nobody is held back.
  if ((await smtpSettings()).source === "none") return false;
  if (await isAdmin(userId)) return false;
  if (p.mode === "signup") return !!Number(u.email_verify_required);
  return Date.now() - Date.parse(u.created_at) >= p.graceDays * 864e5;
}

// Emails a confirmation link (at most one every two minutes per person). Returns false when it could not be sent.
export async function sendConfirmation(userId: string, opts: { force?: boolean } = {}) {
  const u = await row(userId);
  if (!u || u.email_verified_at) return false;
  if (!opts.force && (await get("SELECT 1 AS x FROM email_verifications WHERE user_id = ? AND created_at > ?", userId, new Date(Date.now() - 120e3).toISOString()))) return true;
  if ((await smtpSettings()).source === "none") return false;
  const token = crypto.randomBytes(32).toString("base64url");
  await run("DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL", userId);
  await run(
    "INSERT INTO email_verifications (token_hash, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    hash(token),
    userId,
    u.email.toLowerCase(),
    new Date(Date.now() + LINK_DAYS * 864e5).toISOString(),
    nowIso(),
  );
  const { appOrigin } = await import("./password-reset");
  const link = `${await appOrigin()}/login/confirm-email?token=${token}`;
  const ws = (await getSettings()).workspace.name;
  try {
    await sendSystemEmail(
      u.email,
      `Confirm your email for ${ws}`,
      `Hello ${u.name},\n\nPlease confirm this is your email address by opening this link within ${LINK_DAYS} days:\n\n${link}\n\nIf you did not expect this, ignore this email.`,
      `<p>Hello ${esc(u.name)},</p><p>Please confirm this is your email address by opening this link within ${LINK_DAYS} days:</p><p><a href="${link}">Confirm my email</a></p><p>If you did not expect this, ignore this email.</p>`,
    );
    return true;
  } catch (e) {
    console.error("Confirmation email failed", e);
    return false;
  }
}

// The link from the email: marks the address confirmed (if it is still the account's address).
export async function confirmEmail(token: string) {
  const r = await get<{ user_id: string; email: string; expires_at: string; used_at: string | null }>("SELECT user_id, email, expires_at, used_at FROM email_verifications WHERE token_hash = ?", hash(token));
  if (!r || r.used_at || r.expires_at < nowIso()) return null;
  const u = await row(r.user_id);
  if (!u || u.email.toLowerCase() !== r.email) return null;
  const now = nowIso();
  await run("UPDATE email_verifications SET used_at = ? WHERE token_hash = ?", now, hash(token));
  await run("UPDATE users SET email_verified_at = ? WHERE id = ?", now, u.id);
  await audit({ actor: null }, { action: "user.email_confirmed", summary: `${u.name} confirmed their email ${u.email}` });
  return { name: u.name, email: u.email };
}

// Signed in through Google, Microsoft or single sign-on: the provider checked the address.
export async function markConfirmed(userId: string) {
  await run("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", nowIso(), userId);
}

// After Admin changes an account's email, it is asked for again.
export async function emailChanged(userId: string) {
  await run("UPDATE users SET email_verified_at = NULL WHERE id = ?", userId);
  await run("DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL", userId);
}

// Admin, Sign-in: who has not confirmed yet, with sending a link again or marking it confirmed by hand.
export async function unconfirmedPeople(admin: AppUser) {
  if (!can(admin, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees this.");
  const rows = await all<{ id: string; name: string; email: string; created_at: string; required: number; sent_at: string | null }>(
    `SELECT u.id, u.name, u.email, u.created_at, u.email_verify_required AS required,
       (SELECT MAX(v.created_at) FROM email_verifications v WHERE v.user_id = u.id) AS sent_at
     FROM users u WHERE u.active = 1 AND u.email_verified_at IS NULL ORDER BY u.name LIMIT 500`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, createdAt: r.created_at, fromSignup: !!Number(r.required), sentAt: r.sent_at }));
}

export async function adminConfirm(admin: AppUser, userId: string) {
  if (!can(admin, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin does this.");
  const u = await row(userId);
  if (!u) throw new WorkflowError("NOT_FOUND", "Account not found.");
  await run("UPDATE users SET email_verified_at = ? WHERE id = ?", nowIso(), userId);
  await audit({ actor: admin }, { action: "user.email_confirmed", summary: `${admin.name} marked ${u.name}'s email ${u.email} as confirmed` });
}

export async function adminSendConfirmation(admin: AppUser, userId: string) {
  if (!can(admin, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin does this.");
  if (!(await sendConfirmation(userId, { force: true }))) throw new WorkflowError("INVALID_STATE", "The email could not be sent. Set up the email account in Admin, Email first.");
}
