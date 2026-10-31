// Signing in, as Admin sets it up (Admin, Sign-in): wrong attempts and lockouts, password rules, two-step sign-in
// (authenticator app, email code, recovery codes), remembered devices, other providers (see oidc.ts), sign-up by
// invitation or by allowed domain with Admin approval, alerts on new devices, and the sign-in log.
//
// Every way in (password, reset link, invitation, Google, Microsoft, single sign-on) ends in afterFirstFactor,
// which asks for the second step when the person's roles need it and only then starts the session.

import crypto from "node:crypto";
import QRCode from "qrcode";
import { cookies, headers } from "next/headers";
import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { seal, unseal } from "./secrets";
import { audit, WorkflowError } from "./workflow";
import { hashPassword, verifyPassword } from "./passwords";
import { can, loadUser, type AppUser } from "./users";
import { notify, usersWithRole } from "./notifications";
import { sendSystemEmail, smtpSettings } from "./email";
import { getSettings } from "./settings";
import { parseAgent } from "./devices";
import { deviceId, requestIp, startSession } from "./auth";
import { signInPolicy } from "./signin-config";
import { appOrigin } from "./password-reset";
import { uniqueHandle } from "./importer";
import { currentStep, matchTotp, newTotpSecret, otpauthUrl } from "./totp";
import { domainAllowed, PROVIDER_LABELS, twoStepLevelFor, type ProviderId, type SignInEvent, type SignInPolicy, type TwoStepLevel } from "@/lib/signin-policy";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/domain";

const CHALLENGE_COOKIE = "myseed_2step";
const CHALLENGE_MINUTES = 10;
const CHALLENGE_TRIES = 5;
const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const secure = () => process.env.NODE_ENV === "production" && process.env.MYSEED_INSECURE_COOKIES !== "1";
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

export type FirstStep = { ok: true; next: string; twoStep: boolean } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// The sign-in log
// ---------------------------------------------------------------------------

export async function logSignIn(e: { userId?: string | null; email?: string | null; event: SignInEvent; method?: string | null; detail?: string | null }) {
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await run(
    "INSERT INTO signin_log (id, user_id, email, event, method, ip, device_id, user_agent, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    uid("sil_"),
    e.userId ?? null,
    e.email?.trim().toLowerCase().slice(0, 200) ?? null,
    e.event,
    e.method ?? null,
    await requestIp(),
    await deviceId(false),
    ua,
    e.detail?.slice(0, 300) ?? null,
    nowIso(),
  );
}

export type SignInLogRow = { id: string; userId: string | null; userName: string | null; email: string | null; event: SignInEvent; method: string | null; ip: string | null; device: string; detail: string | null; at: string };

export async function signInLog(viewer: AppUser, f: { userId?: string; event?: string; limit?: number } = {}): Promise<SignInLogRow[]> {
  const own = !f.userId || f.userId === viewer.id;
  if (!can(viewer, "users.manage") && !(own && f.userId)) throw new WorkflowError("FORBIDDEN", "Only Admin sees everyone's sign-ins.");
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.userId) (where.push("l.user_id = ?"), args.push(f.userId));
  if (f.event) (where.push("l.event = ?"), args.push(f.event));
  const rows = await all<{ id: string; user_id: string | null; name: string | null; email: string | null; event: SignInEvent; method: string | null; ip: string | null; user_agent: string | null; detail: string | null; at: string }>(
    `SELECT l.id, l.user_id, u.name, l.email, l.event, l.method, l.ip, l.user_agent, l.detail, l.at FROM signin_log l LEFT JOIN users u ON u.id = l.user_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY l.at DESC LIMIT ?`,
    ...args,
    Math.min(f.limit ?? 100, 500),
  );
  return rows.map((r) => {
    const d = parseAgent(r.user_agent);
    return { id: r.id, userId: r.user_id, userName: r.name, email: r.email, event: r.event, method: r.method, ip: r.ip, device: r.user_agent ? `${d.browser} on ${d.os}` : "Unknown device", detail: r.detail, at: r.at };
  });
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

// Asks Have I Been Pwned whether the password appeared in a known leak. Only the first five characters of the
// password's SHA-1 hash leave the server (k-anonymity), never the password. Any failure counts as "not found".
async function leakedCount(password: string) {
  const h = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return 0;
    for (const line of (await res.text()).split("\n")) {
      const [suffix, count] = line.trim().split(":");
      if (suffix === h.slice(5)) return Number(count) || 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

// The first problem with a new password under Admin's rules, or null.
export async function newPasswordProblem(password: string, userId?: string | null): Promise<string | null> {
  const p = (await signInPolicy()).password;
  if (password.length < p.minLength) return `Use at least ${p.minLength} characters.`;
  if (password.length > 200) return "Use at most 200 characters.";
  if (p.lettersAndNumbers && (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))) return "Use both letters and numbers.";
  if (userId && p.noReuse) {
    const current = await get<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", userId);
    const old = await all<{ hash: string }>("SELECT hash FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userId, p.noReuse);
    if ([current?.password_hash, ...old.map((o) => o.hash)].some((h) => verifyPassword(password, h))) return `Choose a password you have not used for your last ${p.noReuse + 1} passwords.`;
  }
  if (p.breachCheck && (await leakedCount(password)) > 0) return "This password appeared in a data leak on another site, so it is easy to guess. Choose another.";
  return null;
}

// Sets a password and keeps the old one in the history (for "no reuse").
export async function setPassword(userId: string, password: string, mustChange = false) {
  const current = await get<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", userId);
  if (current?.password_hash) await run("INSERT INTO password_history (user_id, hash, created_at) VALUES (?, ?, ?)", userId, current.password_hash, nowIso());
  await run("UPDATE users SET password_hash = ?, must_change_password = ?, password_changed_at = ? WHERE id = ?", hashPassword(password), mustChange ? 1 : 0, nowIso(), userId);
  const keep = await all<{ created_at: string }>("SELECT created_at FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1 OFFSET 23", userId);
  if (keep[0]) await run("DELETE FROM password_history WHERE user_id = ? AND created_at < ?", userId, keep[0].created_at);
}

// ---------------------------------------------------------------------------
// Wrong attempts
// ---------------------------------------------------------------------------

// Minutes left on the longest lock among the keys (an email and an address), or 0.
async function lockedMinutes(keys: string[]) {
  let ms = 0;
  for (const k of keys) {
    const r = await get<{ locked_until: string | null }>("SELECT locked_until FROM signin_locks WHERE key = ?", k);
    if (r?.locked_until) ms = Math.max(ms, Date.parse(r.locked_until) - Date.now());
  }
  return ms > 0 ? Math.ceil(ms / 60e3) : 0;
}

// Counts a failure; at the limit the key is locked, each lock in a row twice as long (at most a day).
async function countFailure(key: string, limit: number, minutes: number): Promise<boolean> {
  const now = nowIso();
  const r = await get<{ failures: number; lockouts: number; updated_at: string }>("SELECT failures, lockouts, updated_at FROM signin_locks WHERE key = ?", key);
  // A quiet day forgets earlier failures.
  const fresh = !r || Date.now() - Date.parse(r.updated_at) > 864e5;
  const failures = (fresh ? 0 : r.failures) + 1;
  const lockouts = fresh ? 0 : r.lockouts;
  const lock = failures >= limit;
  const until = lock ? new Date(Date.now() + Math.min(minutes * 2 ** lockouts, 24 * 60) * 60e3).toISOString() : null;
  await run(
    "INSERT INTO signin_locks (key, failures, lockouts, locked_until, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET failures = excluded.failures, lockouts = excluded.lockouts, locked_until = excluded.locked_until, updated_at = excluded.updated_at",
    key,
    lock ? 0 : failures,
    lock ? lockouts + 1 : lockouts,
    until,
    now,
  );
  return lock;
}

const tooMany = (min: number) => `Too many attempts. Try again in ${min <= 1 ? "a minute" : `${min} minutes`}, or reset your password.`;

async function alertLockout(userId: string, name: string, email: string, minutes: number) {
  const now = nowIso();
  await notify([userId], { type: "security", title: "Your account was locked for a while", body: `After several wrong passwords, sign-in waits ${minutes} minutes.`, link: "/profile#account" }, now);
  await notify(await usersWithRole("admin"), { type: "security", title: `${name}'s account was locked`, body: `${minutes} minutes after several wrong passwords.`, link: "/admin?tab=signin", groupKey: "signin-lockouts" }, now);
  void mail(email, "Your account was locked for a while", `Someone (maybe you) entered a wrong password several times for your account. Sign-in waits ${minutes} minutes. If it was not you, reset your password and tell your administrator.`);
}

async function mail(to: string, subject: string, text: string) {
  try {
    if ((await smtpSettings()).source === "none") return;
    const ws = (await getSettings()).workspace.name;
    await sendSystemEmail(to, `${ws}: ${subject}`, text, `<p>${esc(text).replace(/\n/g, "<br>")}</p>`);
  } catch (e) {
    console.error("Security email failed", e);
  }
}

// ---------------------------------------------------------------------------
// Signing in with a password
// ---------------------------------------------------------------------------

export async function passwordSignIn(email: string, password: string, next: string): Promise<FirstStep> {
  const p = await signInPolicy();
  const ip = await requestIp();
  const keys = [`email:${email.trim().toLowerCase()}`, ...(ip ? [`ip:${ip}`] : [])];
  // While locked, the password is not even checked, so guessing gets nowhere.
  const wait = await lockedMinutes(keys);
  if (wait) {
    await logSignIn({ email, event: "blocked", method: "password" });
    return { ok: false, error: tooMany(wait) };
  }
  const row = await get<{ id: string; name: string; email: string; password_hash: string | null; active: number; password_changed_at: string | null; created_at: string }>(
    "SELECT id, name, email, password_hash, active, password_changed_at, created_at FROM users WHERE lower(email) = lower(?)",
    email.trim(),
  );
  if (!row || !row.active || !verifyPassword(password, row.password_hash)) {
    const locked = await countFailure(keys[0], p.lockout.attempts, p.lockout.minutes);
    if (keys[1]) await countFailure(keys[1], p.lockout.perAddress, p.lockout.minutes);
    await logSignIn({ userId: row?.id, email, event: locked ? "locked" : "failed", method: "password" });
    if (locked && row?.active) await alertLockout(row.id, row.name, row.email, p.lockout.minutes);
    // The same answer whether or not the account exists.
    return { ok: false, error: locked ? tooMany(p.lockout.minutes) : "Email or password is incorrect." };
  }
  await run("DELETE FROM signin_locks WHERE key = ?", keys[0]);
  const user = (await loadUser(row.id))!;
  const only = providerOnlyFor(p, user.roles);
  if (only) {
    await logSignIn({ userId: row.id, email, event: "provider_refused", method: "password", detail: only });
    return { ok: false, error: `Your account signs in with ${only}. Use the ${only} button below.` };
  }
  // Passwords older than Admin's limit must be changed after signing in.
  const changed = row.password_changed_at ?? row.created_at;
  if (p.password.maxAgeDays && Date.now() - Date.parse(changed) > p.password.maxAgeDays * 864e5) await run("UPDATE users SET must_change_password = 1 WHERE id = ?", row.id);
  return afterFirstFactor(row.id, "password", next);
}

function providerName(p: SignInPolicy, id: ProviderId) {
  return id === "oidc" ? p.providers.oidc.name || PROVIDER_LABELS.oidc : PROVIDER_LABELS[id];
}

// The provider a person must use instead of a password, when Admin set one for their role.
function providerOnlyFor(p: SignInPolicy, roles: Role[]) {
  for (const id of ["google", "microsoft", "oidc"] as const) if (p.providers[id].enabled && p.providers[id].onlyFor.some((r) => roles.includes(r))) return providerName(p, id);
  return null;
}

// ---------------------------------------------------------------------------
// The second step
// ---------------------------------------------------------------------------

type TwoStepRow = { totp_enc: string | null; totp_pending_enc: string | null; totp_confirmed_at: string | null; last_step: number; recovery: string };

async function twoStepRow(userId: string) {
  return get<TwoStepRow>("SELECT totp_enc, totp_pending_enc, totp_confirmed_at, last_step, recovery FROM user_two_step WHERE user_id = ?", userId);
}

async function emailReady() {
  return (await smtpSettings()).source !== "none";
}

// What a person needs after their password: nothing, the code, or setting up an authenticator first.
async function secondStepNeed(userId: string, method: string): Promise<"none" | "verify" | "setup"> {
  const p = await signInPolicy();
  const user = (await loadUser(userId))!;
  const level = twoStepLevelFor(p, user.roles);
  if (level === "off") return "none";
  // Google, Microsoft and single sign-on have their own two-step sign-in, so they count as both steps.
  if (method !== "password" && method !== "reset" && method !== "invite" && p.twoStep.trustProviders) return "none";
  const ts = await twoStepRow(userId);
  const hasTotp = p.twoStep.totp && !!ts?.totp_confirmed_at;
  if (level === "optional" && !hasTotp) return "none";
  const device = await deviceId(false);
  if (device && p.twoStep.rememberDays && (await get("SELECT 1 AS x FROM two_step_trust WHERE user_id = ? AND device_id = ? AND until > ?", userId, device, nowIso())))
    return "none";
  if (hasTotp || (p.twoStep.email && (await emailReady()))) return "verify";
  return p.twoStep.totp ? "setup" : "none";
}

export async function afterFirstFactor(userId: string, method: string, next: string): Promise<FirstStep> {
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const need = await secondStepNeed(userId, method);
  if (need === "none") return finishSignIn(userId, method, target);
  const token = crypto.randomBytes(24).toString("base64url");
  await run("DELETE FROM signin_challenges WHERE user_id = ? OR expires_at < ?", userId, nowIso());
  await run(
    "INSERT INTO signin_challenges (id, user_id, mode, method, next, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    sha(token),
    userId,
    need,
    method,
    target,
    new Date(Date.now() + CHALLENGE_MINUTES * 60e3).toISOString(),
    nowIso(),
  );
  (await cookies()).set(CHALLENGE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: CHALLENGE_MINUTES * 60 });
  return { ok: true, next: "/login/verify", twoStep: true };
}

async function finishSignIn(userId: string, method: string, next: string): Promise<FirstStep> {
  const s = await startSession(userId);
  if (!s.ok) return s;
  const p = await signInPolicy();
  const u = (await loadUser(userId))!;
  // A device this person never signed in from before (and not their very first sign-in) gets an alert.
  if (p.sessions.newDeviceAlert && s.deviceId) {
    const seen = await get("SELECT 1 AS x FROM signin_log WHERE user_id = ? AND device_id = ? AND event = 'signin'", userId, s.deviceId);
    const before = await get("SELECT 1 AS x FROM signin_log WHERE user_id = ? AND event = 'signin'", userId);
    if (!seen && before) {
      const d = parseAgent((await headers()).get("user-agent"));
      const where = `${d.browser} on ${d.os}${(await requestIp()) ? `, address ${await requestIp()}` : ""}`;
      await notify([userId], { type: "security", title: "New sign-in to your account", body: `${where}. If it was not you, end that session and change your password.`, link: "/profile#account" }, nowIso());
      void mail(u.email, "New sign-in to your account", `Your account was just used to sign in from a new device: ${where}.\n\nIf it was you, there is nothing to do. If not, open Profile, Account to end that session, and change your password.`);
      await logSignIn({ userId, event: "new_device", method, detail: where });
    }
  }
  await logSignIn({ userId, email: u.email, event: "signin", method });
  return { ok: true, next, twoStep: false };
}

// "done": the app was just set up and the recovery codes are on screen; the session starts on Continue.
type ChallengeRow = { id: string; user_id: string; mode: "verify" | "setup" | "done"; method: string; totp_pending_enc: string | null; email_code_hash: string | null; email_sent_at: string | null; attempts: number; next: string; expires_at: string };

async function currentChallenge(): Promise<ChallengeRow | null> {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  const c = await get<ChallengeRow>("SELECT * FROM signin_challenges WHERE id = ?", sha(token));
  return c && c.expires_at > nowIso() ? c : null;
}

export type ChallengeInfo = {
  mode: "verify" | "setup" | "done";
  name: string;
  email: string;
  totp: boolean;
  emailCode: boolean;
  emailSent: boolean;
  recovery: boolean;
  rememberDays: number;
  setup: { secret: string; qr: string } | null;
};

export async function challengeInfo(): Promise<ChallengeInfo | null> {
  const c = await currentChallenge();
  if (!c) return null;
  const p = await signInPolicy();
  const u = (await loadUser(c.user_id))!;
  const ts = await twoStepRow(c.user_id);
  let setup: ChallengeInfo["setup"] = null;
  if (c.mode === "setup") {
    let secret = c.totp_pending_enc ? await unseal(c.totp_pending_enc) : null;
    if (!secret) {
      secret = newTotpSecret();
      await run("UPDATE signin_challenges SET totp_pending_enc = ? WHERE id = ?", await seal(secret), c.id);
    }
    setup = { secret, qr: await QRCode.toDataURL(otpauthUrl(secret, u.email, (await getSettings()).workspace.name || "Myseed"), { margin: 1, width: 220 }) };
  }
  return {
    mode: c.mode,
    name: u.name,
    email: u.email.replace(/^(.).*?(.)?@/, (_m, a: string, b?: string) => `${a}${"•".repeat(4)}${b ?? ""}@`),
    totp: p.twoStep.totp && !!ts?.totp_confirmed_at,
    emailCode: c.mode === "verify" && p.twoStep.email && (await emailReady()),
    emailSent: !!c.email_sent_at,
    recovery: parseJson<string[]>(ts?.recovery, []).length > 0,
    rememberDays: p.twoStep.rememberDays,
    setup,
  };
}

export async function sendChallengeEmail() {
  const c = await currentChallenge();
  if (!c || c.mode !== "verify") throw new WorkflowError("INVALID_STATE", "Sign in again to get a code.");
  const p = await signInPolicy();
  if (!p.twoStep.email || !(await emailReady())) throw new WorkflowError("INVALID_STATE", "Email codes are not available. Use your authenticator app or a recovery code.");
  if (c.email_sent_at && Date.now() - Date.parse(c.email_sent_at) < 60e3) throw new WorkflowError("VALIDATION", "A code was just sent. Wait a minute before asking again.");
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await run("UPDATE signin_challenges SET email_code_hash = ?, email_sent_at = ? WHERE id = ?", sha(`${c.id}:${code}`), nowIso(), c.id);
  const u = (await loadUser(c.user_id))!;
  const ws = (await getSettings()).workspace.name;
  await sendSystemEmail(
    u.email,
    `${code} is your ${ws} sign-in code`,
    `Your sign-in code is ${code}. It works for ${CHALLENGE_MINUTES} minutes.\n\nIf you did not try to sign in, change your password: someone knows it.`,
    `<p>Your sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It works for ${CHALLENGE_MINUTES} minutes.</p><p>If you did not try to sign in, change your password: someone knows it.</p>`,
  );
}

export async function verifyChallenge(input: { kind: "totp" | "email" | "recovery"; code: string; remember?: boolean }): Promise<{ next: string; recoveryCodes?: string[] }> {
  const c = await currentChallenge();
  if (!c) throw new WorkflowError("INVALID_STATE", "This sign-in has expired. Sign in again.");
  if (c.mode === "done") throw new WorkflowError("INVALID_STATE", "Two-step sign-in is already set up. Continue.");
  if (c.attempts >= CHALLENGE_TRIES) {
    await run("DELETE FROM signin_challenges WHERE id = ?", c.id);
    throw new WorkflowError("INVALID_STATE", "Too many wrong codes. Sign in again.");
  }
  const p = await signInPolicy();
  const code = input.code.replace(/[\s-]/g, "");
  const ts = await twoStepRow(c.user_id);
  let ok = false;
  let recoveryCodes: string[] | undefined;
  if (c.mode === "setup") {
    const secret = c.totp_pending_enc ? await unseal(c.totp_pending_enc) : null;
    const step = secret ? matchTotp(secret, code) : null;
    if (secret && step) {
      recoveryCodes = await saveTotp(c.user_id, secret, step);
      await logSignIn({ userId: c.user_id, event: "two_step_on", method: "totp" });
      ok = true;
    }
  } else if (input.kind === "totp" && ts?.totp_confirmed_at && ts.totp_enc) {
    const secret = await unseal(ts.totp_enc);
    const step = secret ? matchTotp(secret, code, Number(ts.last_step)) : null;
    if (step) {
      await run("UPDATE user_two_step SET last_step = ? WHERE user_id = ?", step, c.user_id);
      ok = true;
    }
  } else if (input.kind === "email" && c.email_code_hash && c.email_sent_at && Date.now() - Date.parse(c.email_sent_at) < CHALLENGE_MINUTES * 60e3) {
    ok = crypto.timingSafeEqual(Buffer.from(c.email_code_hash), Buffer.from(sha(`${c.id}:${code}`)));
  } else if (input.kind === "recovery" && ts) {
    ok = await useRecoveryCode(c.user_id, ts, code);
  }
  if (!ok) {
    await run("UPDATE signin_challenges SET attempts = attempts + 1 WHERE id = ?", c.id);
    await logSignIn({ userId: c.user_id, event: "two_step_failed", method: input.kind });
    const left = CHALLENGE_TRIES - c.attempts - 1;
    throw new WorkflowError("VALIDATION", left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Sign in again.");
  }
  if (input.remember && p.twoStep.rememberDays) {
    const device = await deviceId(true);
    if (device)
      await run(
        "INSERT INTO two_step_trust (user_id, device_id, until, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, device_id) DO UPDATE SET until = excluded.until",
        c.user_id,
        device,
        new Date(Date.now() + p.twoStep.rememberDays * 864e5).toISOString(),
        nowIso(),
      );
  }
  // Signing in refreshes the page, which would hide the recovery codes; so after a setup the session starts on Continue.
  if (recoveryCodes) {
    await run("UPDATE signin_challenges SET mode = 'done', totp_pending_enc = NULL, attempts = 0 WHERE id = ?", c.id);
    return { next: c.next, recoveryCodes };
  }
  await run("DELETE FROM signin_challenges WHERE id = ?", c.id);
  (await cookies()).delete(CHALLENGE_COOKIE);
  const r = await finishSignIn(c.user_id, `${c.method}+${input.kind}`, c.next);
  if (!r.ok) throw new WorkflowError("FORBIDDEN", r.error);
  return { next: c.next };
}

export async function finishSetupChallenge(): Promise<{ next: string }> {
  const c = await currentChallenge();
  if (!c || c.mode !== "done") throw new WorkflowError("INVALID_STATE", "This sign-in has expired. Sign in again.");
  await run("DELETE FROM signin_challenges WHERE id = ?", c.id);
  (await cookies()).delete(CHALLENGE_COOKIE);
  const r = await finishSignIn(c.user_id, `${c.method}+totp`, c.next);
  if (!r.ok) throw new WorkflowError("FORBIDDEN", r.error);
  return { next: c.next };
}

export async function cancelChallenge() {
  const c = await currentChallenge();
  if (c) await run("DELETE FROM signin_challenges WHERE id = ?", c.id);
  (await cookies()).delete(CHALLENGE_COOKIE);
}

function makeRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const s = crypto.randomBytes(5).toString("hex");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

async function saveTotp(userId: string, secret: string, step: number) {
  const codes = makeRecoveryCodes();
  const now = nowIso();
  await run(
    `INSERT INTO user_two_step (user_id, totp_enc, totp_pending_enc, totp_confirmed_at, last_step, recovery, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET totp_enc = excluded.totp_enc, totp_pending_enc = NULL, totp_confirmed_at = excluded.totp_confirmed_at, last_step = excluded.last_step, recovery = excluded.recovery, updated_at = excluded.updated_at`,
    userId,
    await seal(secret),
    now,
    step,
    JSON.stringify(codes.map((c) => sha(c.replace("-", "")))),
    now,
  );
  return codes;
}

async function useRecoveryCode(userId: string, ts: TwoStepRow, code: string) {
  const list = parseJson<string[]>(ts.recovery, []);
  const h = sha(code.toLowerCase());
  if (!list.includes(h)) return false;
  await run("UPDATE user_two_step SET recovery = ?, updated_at = ? WHERE user_id = ?", JSON.stringify(list.filter((x) => x !== h)), nowIso(), userId);
  await logSignIn({ userId, event: "recovery_used", detail: `${list.length - 1} left` });
  if (list.length - 1 <= 2) await notify([userId], { type: "security", title: "Few recovery codes left", body: `${list.length - 1} left. Make new ones on Profile, Account.`, link: "/profile#account" }, nowIso());
  return true;
}

// ---------------------------------------------------------------------------
// Two-step on the person's own Profile, Account
// ---------------------------------------------------------------------------

export type MyTwoStep = { level: TwoStepLevel; totpAllowed: boolean; emailAllowed: boolean; totpOn: boolean; since: string | null; recoveryLeft: number; trustedDevices: number; rememberDays: number };

export async function myTwoStep(user: AppUser): Promise<MyTwoStep> {
  const p = await signInPolicy();
  const ts = await twoStepRow(user.id);
  const trusted = await get<{ c: number }>("SELECT COUNT(*) AS c FROM two_step_trust WHERE user_id = ? AND until > ?", user.id, nowIso());
  return {
    level: twoStepLevelFor(p, user.roles),
    totpAllowed: p.twoStep.totp,
    emailAllowed: p.twoStep.email && (await emailReady()),
    totpOn: !!ts?.totp_confirmed_at,
    since: ts?.totp_confirmed_at ?? null,
    recoveryLeft: parseJson<string[]>(ts?.recovery, []).length,
    trustedDevices: Number(trusted?.c ?? 0),
    rememberDays: p.twoStep.rememberDays,
  };
}

export async function beginTotpSetup(user: AppUser) {
  if (!(await signInPolicy()).twoStep.totp) throw new WorkflowError("INVALID_STATE", "Admin has not switched on authenticator apps.");
  const secret = newTotpSecret();
  await run(
    "INSERT INTO user_two_step (user_id, totp_pending_enc, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET totp_pending_enc = excluded.totp_pending_enc, updated_at = excluded.updated_at",
    user.id,
    await seal(secret),
    nowIso(),
  );
  return { secret, qr: await QRCode.toDataURL(otpauthUrl(secret, user.email, (await getSettings()).workspace.name || "Myseed"), { margin: 1, width: 220 }) };
}

export async function confirmTotpSetup(user: AppUser, code: string) {
  const ts = await twoStepRow(user.id);
  const secret = ts?.totp_pending_enc ? await unseal(ts.totp_pending_enc) : null;
  if (!secret) throw new WorkflowError("INVALID_STATE", "Start the setup again.");
  const step = matchTotp(secret, code);
  if (!step) throw new WorkflowError("VALIDATION", "That code is not right. Check the time on your phone is automatic, and type the code showing now.");
  const codes = await saveTotp(user.id, secret, step);
  await logSignIn({ userId: user.id, event: "two_step_on", method: "totp" });
  await audit({ actor: user }, { action: "user.two_step", summary: `${user.name} turned on two-step sign-in` });
  return { recoveryCodes: codes };
}

async function checkOwnCode(user: AppUser, code: string) {
  const ts = await twoStepRow(user.id);
  if (!ts?.totp_confirmed_at || !ts.totp_enc) throw new WorkflowError("INVALID_STATE", "Two-step sign-in is not on.");
  const secret = await unseal(ts.totp_enc);
  const step = secret ? matchTotp(secret, code, Number(ts.last_step)) : null;
  if (step) return void (await run("UPDATE user_two_step SET last_step = ? WHERE user_id = ?", step, user.id));
  if (await useRecoveryCode(user.id, ts, code.replace(/[\s-]/g, ""))) return;
  throw new WorkflowError("VALIDATION", "That code is not right.");
}

export async function turnOffTwoStep(user: AppUser, code: string) {
  if ((await myTwoStep(user)).level === "required") throw new WorkflowError("FORBIDDEN", "Two-step sign-in is required for your role, so it cannot be turned off. You can set it up again with a new phone.");
  await checkOwnCode(user, code);
  await run("DELETE FROM user_two_step WHERE user_id = ?", user.id);
  await run("DELETE FROM two_step_trust WHERE user_id = ?", user.id);
  await logSignIn({ userId: user.id, event: "two_step_off" });
  await audit({ actor: user }, { action: "user.two_step", summary: `${user.name} turned off two-step sign-in` });
}

export async function newRecoveryCodes(user: AppUser, code: string) {
  await checkOwnCode(user, code);
  const codes = makeRecoveryCodes();
  await run("UPDATE user_two_step SET recovery = ?, updated_at = ? WHERE user_id = ?", JSON.stringify(codes.map((c) => sha(c.replace("-", "")))), nowIso(), user.id);
  await logSignIn({ userId: user.id, event: "recovery_new" });
  return { recoveryCodes: codes };
}

export async function forgetTrustedDevices(user: AppUser) {
  await run("DELETE FROM two_step_trust WHERE user_id = ?", user.id);
}

// Admin, for someone who lost their phone and their recovery codes: they set it up again at the next sign-in.
export async function adminResetTwoStep(admin: AppUser, userId: string) {
  if (!can(admin, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin resets two-step sign-in.");
  const u = await loadUser(userId);
  if (!u) throw new WorkflowError("NOT_FOUND", "Person not found.");
  await run("DELETE FROM user_two_step WHERE user_id = ?", userId);
  await run("DELETE FROM two_step_trust WHERE user_id = ?", userId);
  await run("DELETE FROM sessions WHERE user_id = ?", userId);
  await logSignIn({ userId, event: "two_step_reset", detail: `by ${admin.name}` });
  await audit({ actor: admin }, { action: "user.two_step", summary: `${admin.name} reset two-step sign-in for ${u.name}` });
  await notify([userId], { type: "security", title: "Your two-step sign-in was reset", body: `By ${admin.name}. Set it up again when you next sign in.`, link: "/profile#account" }, nowIso());
}

export type TwoStepRosterRow = { id: string; name: string; email: string; roles: Role[]; level: TwoStepLevel; on: boolean; providers: string[]; lastSignIn: string | null };

export async function twoStepRoster(admin: AppUser): Promise<TwoStepRosterRow[]> {
  if (!can(admin, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees this.");
  const p = await signInPolicy();
  const users = await all<{ id: string; name: string; email: string; last_login_at: string | null }>("SELECT id, name, email, last_login_at FROM users WHERE active = 1 ORDER BY name");
  const roles = await all<{ user_id: string; role: Role }>("SELECT user_id, role FROM role_assignments");
  const on = new Set((await all<{ user_id: string }>("SELECT user_id FROM user_two_step WHERE totp_confirmed_at IS NOT NULL")).map((r) => r.user_id));
  const ids = await all<{ user_id: string; provider: ProviderId }>("SELECT user_id, provider FROM user_identities");
  return users.map((u) => {
    const r = roles.filter((x) => x.user_id === u.id).map((x) => x.role);
    return { id: u.id, name: u.name, email: u.email, roles: r, level: twoStepLevelFor(p, r), on: on.has(u.id), providers: ids.filter((i) => i.user_id === u.id).map((i) => providerName(p, i.provider)), lastSignIn: u.last_login_at };
  });
}

// ---------------------------------------------------------------------------
// Linked sign-in accounts (Google, Microsoft, single sign-on)
// ---------------------------------------------------------------------------

export async function myIdentities(userId: string) {
  return all<{ provider: ProviderId; email: string | null; created_at: string; last_used_at: string | null }>(
    "SELECT provider, email, created_at, last_used_at FROM user_identities WHERE user_id = ? ORDER BY created_at",
    userId,
  );
}

export async function linkIdentity(user: AppUser, provider: ProviderId, subject: string, email: string | null) {
  const taken = await get<{ user_id: string }>("SELECT user_id FROM user_identities WHERE provider = ? AND subject = ?", provider, subject);
  if (taken && taken.user_id !== user.id) throw new WorkflowError("CONFLICT", "That account is already linked to another person here.");
  await run("DELETE FROM user_identities WHERE user_id = ? AND provider = ?", user.id, provider);
  await run("INSERT INTO user_identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)", provider, subject, user.id, email, nowIso());
  await logSignIn({ userId: user.id, event: "provider_linked", method: provider, detail: email });
}

export async function unlinkIdentity(user: AppUser, provider: ProviderId) {
  const p = await signInPolicy();
  if (p.providers[provider].enabled && p.providers[provider].onlyFor.some((r) => user.roles.includes(r)))
    throw new WorkflowError("FORBIDDEN", `Your role signs in with ${providerName(p, provider)}, so it stays linked.`);
  const pw = await get<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", user.id);
  const others = await get<{ c: number }>("SELECT COUNT(*) AS c FROM user_identities WHERE user_id = ? AND provider <> ?", user.id, provider);
  if (!pw?.password_hash && !Number(others?.c)) throw new WorkflowError("INVALID_STATE", "Set a password first, otherwise you could not sign in any more.");
  await run("DELETE FROM user_identities WHERE user_id = ? AND provider = ?", user.id, provider);
  await logSignIn({ userId: user.id, event: "provider_unlinked", method: provider });
}

// A provider confirmed who someone is: sign them in, ask Admin for an account, or explain why not.
export async function providerSignIn(provider: ProviderId, claims: { subject: string; email: string; name: string | null }, next: string): Promise<FirstStep | { ok: true; requested: true }> {
  const p = await signInPolicy();
  const cfg = p.providers[provider];
  const email = claims.email.toLowerCase();
  if (!cfg.enabled) return { ok: false, error: "This way of signing in is switched off." };
  if (!domainAllowed(cfg.domains, email)) {
    await logSignIn({ email, event: "provider_refused", method: provider, detail: "domain not allowed" });
    return { ok: false, error: `Use your company account (${cfg.domains.map((d) => `@${d}`).join(", ")}).` };
  }
  let userId = (await get<{ user_id: string }>("SELECT user_id FROM user_identities WHERE provider = ? AND subject = ?", provider, claims.subject))?.user_id;
  if (!userId) {
    // The provider has checked this address, so it matches the account with the same email, linked from now on.
    const u = await get<{ id: string }>("SELECT id FROM users WHERE lower(email) = ?", email);
    if (u) {
      await run("INSERT INTO user_identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (provider, subject) DO NOTHING", provider, claims.subject, u.id, email, nowIso());
      await logSignIn({ userId: u.id, email, event: "provider_linked", method: provider, detail: "matched by email" });
      userId = u.id;
    }
  }
  if (userId) {
    const u = await loadUser(userId);
    if (!u?.active) return { ok: false, error: "This account is switched off. Ask your administrator." };
    await run("UPDATE user_identities SET last_used_at = ?, email = ? WHERE provider = ? AND subject = ?", nowIso(), email, provider, claims.subject);
    return afterFirstFactor(userId, provider, next);
  }
  if (p.signup.mode === "domain" && domainAllowed(p.signup.domains, email)) {
    await createSignupRequest({ name: claims.name || email.split("@")[0], email, passwordHash: null, provider, subject: claims.subject });
    return { ok: true, requested: true };
  }
  await logSignIn({ email, event: "provider_refused", method: provider, detail: "no account" });
  return { ok: false, error: "There is no account for this email here. Ask your administrator for an invitation." };
}

// ---------------------------------------------------------------------------
// Sign-up: invitations, and requests from allowed domains approved by Admin
// ---------------------------------------------------------------------------

export type InviteRow = { id: string; email: string | null; role: Role; createdBy: string | null; expiresAt: string; usedAt: string | null; usedBy: string | null; createdAt: string };

export async function createInvite(admin: AppUser, input: { email?: string | null; role: Role; send?: boolean }) {
  if (!can(admin, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin invites people.");
  const p = await signInPolicy();
  if (p.signup.mode === "off") throw new WorkflowError("INVALID_STATE", "Switch sign-up to invitations first (Sign-up, above).");
  if (!ROLES.includes(input.role)) throw new WorkflowError("VALIDATION", "Choose a role.");
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new WorkflowError("VALIDATION", "Enter a valid email, or leave it empty for a link anyone can use once.");
  if (email && (await get("SELECT 1 AS x FROM users WHERE lower(email) = ?", email))) throw new WorkflowError("VALIDATION", "That person already has an account.");
  const token = crypto.randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + p.signup.inviteDays * 864e5).toISOString();
  await run("INSERT INTO signup_invites (token_hash, email, role, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)", sha(token), email, input.role, admin.id, expires, nowIso());
  const link = `${await appOrigin()}/signup?invite=${token}`;
  let sent = false;
  if (email && input.send && (await emailReady())) {
    const ws = (await getSettings()).workspace.name;
    try {
      await sendSystemEmail(
        email,
        `You are invited to ${ws}`,
        `${admin.name} invited you to ${ws} as ${ROLE_LABELS[input.role]}.\n\nCreate your account with this link (it works for ${p.signup.inviteDays} days, once):\n\n${link}`,
        `<p>${esc(admin.name)} invited you to ${esc(ws)} as ${esc(ROLE_LABELS[input.role])}.</p><p><a href="${link}">Create your account</a></p><p>The link works for ${p.signup.inviteDays} days, once.</p>`,
      );
      sent = true;
    } catch (e) {
      console.error("Invitation email failed", e);
    }
  }
  await audit({ actor: admin }, { action: "user.invited", summary: `${admin.name} made an invitation${email ? ` for ${email}` : ""} as ${ROLE_LABELS[input.role]}` });
  return { link, sent };
}

export async function listInvites(admin: AppUser): Promise<InviteRow[]> {
  if (!can(admin, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees invitations.");
  const rows = await all<{ token_hash: string; email: string | null; role: Role; creator: string | null; expires_at: string; used_at: string | null; used_name: string | null; created_at: string }>(
    "SELECT i.token_hash, i.email, i.role, c.name AS creator, i.expires_at, i.used_at, u.name AS used_name, i.created_at FROM signup_invites i LEFT JOIN users c ON c.id = i.created_by LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at DESC LIMIT 100",
  );
  return rows.map((r) => ({ id: r.token_hash, email: r.email, role: r.role, createdBy: r.creator, expiresAt: r.expires_at, usedAt: r.used_at, usedBy: r.used_name, createdAt: r.created_at }));
}

export async function revokeInvite(admin: AppUser, id: string) {
  if (!can(admin, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin removes invitations.");
  await run("DELETE FROM signup_invites WHERE token_hash = ? AND used_at IS NULL", id);
}

export async function checkInvite(token: string) {
  const r = await get<{ email: string | null; role: Role; expires_at: string; used_at: string | null }>("SELECT email, role, expires_at, used_at FROM signup_invites WHERE token_hash = ?", sha(token));
  if (!r || r.used_at || r.expires_at < nowIso() || (await signInPolicy()).signup.mode === "off") return null;
  return { email: r.email, role: r.role };
}

async function createAccount(input: { name: string; email: string; passwordHash: string | null; role: Role }) {
  const id = uid("usr_");
  await tx(async () => {
    await run(
      "INSERT INTO users (id, name, email, handle, password_hash, must_change_password, active, created_at, password_changed_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)",
      id,
      input.name,
      input.email,
      await uniqueHandle(input.email.split("@")[0]!),
      input.passwordHash,
      nowIso(),
      input.passwordHash ? nowIso() : null,
    );
    await run("INSERT INTO role_assignments (user_id, role) VALUES (?, ?)", id, input.role);
    // An HR record with the same email (made before the person had an account) is linked to it.
    await run("UPDATE employees SET user_id = ? WHERE user_id IS NULL AND lower(email) = ?", id, input.email);
  });
  return id;
}

function cleanName(name: string) {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 80) throw new WorkflowError("VALIDATION", "Enter your full name.");
  return n;
}

export async function signUpWithInvite(token: string, input: { name: string; email: string; password: string }): Promise<FirstStep> {
  const inv = await checkInvite(token);
  if (!inv) throw new WorkflowError("INVALID_STATE", "This invitation has expired or was already used. Ask for a new one.");
  const email = (inv.email ?? input.email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new WorkflowError("VALIDATION", "Enter a valid email.");
  if (await get("SELECT 1 AS x FROM users WHERE lower(email) = ?", email)) throw new WorkflowError("VALIDATION", "An account already uses this email. Sign in instead.");
  const problem = await newPasswordProblem(input.password);
  if (problem) throw new WorkflowError("VALIDATION", problem);
  const name = cleanName(input.name);
  // Claimed before the account is made, so a link opened twice at once makes one account.
  if (!(await run("UPDATE signup_invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL", nowIso(), sha(token))).changes)
    throw new WorkflowError("INVALID_STATE", "This invitation was already used.");
  const id = await createAccount({ name, email, passwordHash: hashPassword(input.password), role: inv.role });
  await run("UPDATE signup_invites SET used_by = ? WHERE token_hash = ?", id, sha(token));
  await logSignIn({ userId: id, email, event: "invite_used", method: "invite" });
  await audit({ actor: null }, { action: "user.signed_up", summary: `${name} created their account from an invitation (${ROLE_LABELS[inv.role]})` });
  await notify(await usersWithRole("admin"), { type: "security", title: `${name} joined`, body: `From an invitation, as ${ROLE_LABELS[inv.role]}.`, link: "/admin?tab=people" }, nowIso());
  return afterFirstFactor(id, "invite", "/dashboard");
}

async function createSignupRequest(input: { name: string; email: string; passwordHash: string | null; provider: ProviderId | null; subject: string | null }) {
  const pending = await get<{ id: string }>("SELECT id FROM signup_requests WHERE lower(email) = ? AND status = 'pending'", input.email);
  if (pending) return;
  await run(
    "INSERT INTO signup_requests (id, name, email, password_hash, provider, subject, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    uid("sur_"),
    input.name,
    input.email,
    input.passwordHash,
    input.provider,
    input.subject,
    nowIso(),
  );
  await logSignIn({ email: input.email, event: "signup_requested", method: input.provider ?? "password" });
  await notify(await usersWithRole("admin"), { type: "security", title: `${input.name} asked for an account`, body: input.email, link: "/admin?tab=signin", groupKey: "signup-requests" }, nowIso());
}

// Open sign-up for allowed domains: the account is made only when Admin approves.
export async function requestSignUp(input: { name: string; email: string; password: string }) {
  const p = await signInPolicy();
  if (p.signup.mode !== "domain") throw new WorkflowError("INVALID_STATE", "Sign-up is by invitation only. Ask your administrator.");
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new WorkflowError("VALIDATION", "Enter a valid email.");
  if (!domainAllowed(p.signup.domains, email)) throw new WorkflowError("VALIDATION", `Use your company email (${p.signup.domains.map((d) => `@${d}`).join(", ")}).`);
  const name = cleanName(input.name);
  const problem = await newPasswordProblem(input.password);
  if (problem) throw new WorkflowError("VALIDATION", problem);
  // Same answer whether or not an account exists, so the form does not reveal who works here.
  if (await get("SELECT 1 AS x FROM users WHERE lower(email) = ?", email)) return;
  await createSignupRequest({ name, email, passwordHash: hashPassword(input.password), provider: null, subject: null });
}

export type SignupRequestRow = { id: string; name: string; email: string; via: string; status: string; decidedBy: string | null; decidedAt: string | null; createdAt: string };

export async function listSignupRequests(admin: AppUser): Promise<SignupRequestRow[]> {
  if (!can(admin, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees sign-up requests.");
  const p = await signInPolicy();
  const rows = await all<{ id: string; name: string; email: string; provider: ProviderId | null; status: string; decider: string | null; decided_at: string | null; created_at: string }>(
    "SELECT r.id, r.name, r.email, r.provider, r.status, d.name AS decider, r.decided_at, r.created_at FROM signup_requests r LEFT JOIN users d ON d.id = r.decided_by ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 100",
  );
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, via: r.provider ? providerName(p, r.provider) : "Email and password", status: r.status, decidedBy: r.decider, decidedAt: r.decided_at, createdAt: r.created_at }));
}

export async function decideSignup(admin: AppUser, id: string, approve: boolean, role?: Role) {
  if (!can(admin, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin approves sign-ups.");
  const r = await get<{ name: string; email: string; password_hash: string | null; provider: ProviderId | null; subject: string | null; status: string }>("SELECT * FROM signup_requests WHERE id = ?", id);
  if (!r || r.status !== "pending") throw new WorkflowError("INVALID_STATE", "This request was already decided.");
  const p = await signInPolicy();
  const ws = (await getSettings()).workspace.name;
  if (!approve) {
    await run("UPDATE signup_requests SET status = 'declined', decided_by = ?, decided_at = ?, password_hash = NULL WHERE id = ?", admin.id, nowIso(), id);
    await logSignIn({ email: r.email, event: "signup_declined", detail: `by ${admin.name}` });
    void mail(r.email, "Your account request", `Your request for an account on ${ws} was not approved. If you think this is a mistake, contact your administrator.`);
    return;
  }
  if (await get("SELECT 1 AS x FROM users WHERE lower(email) = ?", r.email)) throw new WorkflowError("VALIDATION", "An account already uses this email.");
  const startRole = role && ROLES.includes(role) && role !== "owner" ? role : p.signup.startRole;
  const userId = await createAccount({ name: r.name, email: r.email, passwordHash: r.password_hash, role: startRole });
  if (r.provider && r.subject) await run("INSERT INTO user_identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING", r.provider, r.subject, userId, r.email, nowIso());
  await run("UPDATE signup_requests SET status = 'approved', decided_by = ?, decided_at = ?, password_hash = NULL WHERE id = ?", admin.id, nowIso(), id);
  await logSignIn({ userId, email: r.email, event: "signup_approved", detail: `by ${admin.name}` });
  await audit({ actor: admin }, { action: "user.invited", summary: `${admin.name} approved ${r.name}'s account (${ROLE_LABELS[startRole]})` });
  void mail(r.email, "Your account is ready", `Your account on ${ws} was approved. Sign in at ${await appOrigin()}/login${r.provider ? ` with ${providerName(p, r.provider)}` : " with the email and password you chose"}.`);
}
