// Passkeys (WebAuthn): a fingerprint, face or security key as the second step at sign-in (Phase 15.1).
// People add them on Profile, Account (after signing in); at sign-in, a person with a passkey can use it instead of
// an authenticator code. The site's address is the relying party, so a passkey only works on this site.

import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type AuthenticatorTransportFuture, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { all, get, nowIso, parseJson, run } from "./db";
import { WorkflowError } from "./workflow";
import { getSettings } from "./settings";
import { appOrigin } from "./password-reset";
import type { AppUser } from "./users";

const MINUTES = 5;

async function rp() {
  const origin = await appOrigin();
  return { origin, id: new URL(origin).hostname, name: (await getSettings()).workspace.name || "Myseed" };
}

export type PasskeyRow = { id: string; name: string; created_at: string; last_used_at: string | null };

export async function myPasskeys(userId: string): Promise<PasskeyRow[]> {
  return all<PasskeyRow>("SELECT id, name, created_at, last_used_at FROM user_passkeys WHERE user_id = ? ORDER BY created_at", userId);
}

export async function hasPasskey(userId: string) {
  return !!(await get("SELECT 1 AS x FROM user_passkeys WHERE user_id = ? LIMIT 1", userId));
}

// Adding a passkey: the options for the browser, then the browser's answer checked and kept.
export async function registrationOptions(user: AppUser) {
  const r = await rp();
  const existing = await all<{ id: string; transports: string }>("SELECT id, transports FROM user_passkeys WHERE user_id = ?", user.id);
  const options = await generateRegistrationOptions({
    rpName: r.name,
    rpID: r.id,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: parseJson<AuthenticatorTransportFuture[]>(c.transports, []) })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await run(
    "INSERT INTO passkey_registrations (user_id, challenge, expires_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET challenge = excluded.challenge, expires_at = excluded.expires_at",
    user.id,
    options.challenge,
    new Date(Date.now() + MINUTES * 60e3).toISOString(),
  );
  return options;
}

export async function finishRegistration(user: AppUser, response: RegistrationResponseJSON, name: string) {
  const ch = await get<{ challenge: string; expires_at: string }>("SELECT challenge, expires_at FROM passkey_registrations WHERE user_id = ?", user.id);
  if (!ch || ch.expires_at < nowIso()) throw new WorkflowError("INVALID_STATE", "That took too long. Try again.");
  const r = await rp();
  let v;
  try {
    v = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: r.origin, expectedRPID: r.id, requireUserVerification: false });
  } catch (e) {
    throw new WorkflowError("VALIDATION", `The passkey could not be added: ${e instanceof Error ? e.message : "unknown error"}.`);
  }
  if (!v.verified || !v.registrationInfo) throw new WorkflowError("VALIDATION", "The passkey could not be checked.");
  const c = v.registrationInfo.credential;
  await run(
    "INSERT INTO user_passkeys (id, user_id, public_key, counter, transports, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    c.id,
    user.id,
    Buffer.from(c.publicKey).toString("base64url"),
    c.counter,
    JSON.stringify(c.transports ?? response.response.transports ?? []),
    String(name ?? "").trim().slice(0, 60) || "Passkey",
    nowIso(),
  );
  await run("DELETE FROM passkey_registrations WHERE user_id = ?", user.id);
  const { logSignIn } = await import("./signin");
  await logSignIn({ userId: user.id, event: "two_step_on", method: "passkey", detail: name });
  return c.id;
}

export async function removePasskey(user: AppUser, id: string) {
  await run("DELETE FROM user_passkeys WHERE id = ? AND user_id = ?", id, user.id);
  const { logSignIn } = await import("./signin");
  await logSignIn({ userId: user.id, event: "two_step_off", method: "passkey" });
}

// At sign-in (the second step): options for this person's passkeys, kept on the sign-in challenge.
export async function authenticationOptions(userId: string, challengeId: string) {
  const r = await rp();
  const creds = await all<{ id: string; transports: string }>("SELECT id, transports FROM user_passkeys WHERE user_id = ?", userId);
  if (!creds.length) throw new WorkflowError("INVALID_STATE", "You have no passkey yet.");
  const options = await generateAuthenticationOptions({ rpID: r.id, allowCredentials: creds.map((c) => ({ id: c.id, transports: parseJson<AuthenticatorTransportFuture[]>(c.transports, []) })), userVerification: "preferred" });
  await run("UPDATE signin_challenges SET passkey_challenge = ? WHERE id = ?", options.challenge, challengeId);
  return options;
}

export async function verifyAuthentication(userId: string, expectedChallenge: string | null, response: AuthenticationResponseJSON) {
  if (!expectedChallenge) return false;
  const cred = await get<{ id: string; public_key: string; counter: number; transports: string }>("SELECT id, public_key, counter, transports FROM user_passkeys WHERE id = ? AND user_id = ?", response.id, userId);
  if (!cred) return false;
  const r = await rp();
  try {
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: r.origin,
      expectedRPID: r.id,
      credential: { id: cred.id, publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64url")), counter: Number(cred.counter), transports: parseJson<AuthenticatorTransportFuture[]>(cred.transports, []) },
      requireUserVerification: false,
    });
    if (!v.verified) return false;
    await run("UPDATE user_passkeys SET counter = ?, last_used_at = ? WHERE id = ?", v.authenticationInfo.newCounter, nowIso(), cred.id);
    return true;
  } catch {
    return false;
  }
}
