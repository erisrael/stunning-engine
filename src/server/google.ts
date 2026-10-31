// A person's own Google account, connected for two things: creating Google Meet links (Calendar events with a
// Meet conference) and uploading videos to YouTube. It uses the workspace's Google OAuth client (Admin, Sign-in,
// or GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET). Refresh tokens are stored sealed; access tokens are short-lived.

import { get, nowIso, run } from "./db";
import { seal, unseal } from "./secrets";
import { appOrigin, googleConfig } from "./password-reset";
import { audit, WorkflowError } from "./workflow";
import type { AppUser } from "./users";

export const GOOGLE_SCOPES = {
  meet: "https://www.googleapis.com/auth/calendar.events",
  youtube: "https://www.googleapis.com/auth/youtube.upload",
  // Only files this app creates (the backup folder), never the rest of the Drive.
  drive: "https://www.googleapis.com/auth/drive.file",
} as const;
export type GooglePurpose = keyof typeof GOOGLE_SCOPES;

export const connectRedirect = async () => `${await appOrigin()}/api/google/callback`;

type TokenRow = { user_id: string; email: string | null; scopes: string; refresh_enc: string | null; access_token: string | null; expires_at: string | null };

export async function googleConnection(userId: string) {
  const r = await get<TokenRow>("SELECT * FROM google_tokens WHERE user_id = ?", userId);
  return r ? { email: r.email, scopes: r.scopes.split(" ").filter(Boolean) } : null;
}

export async function authUrl(purpose: GooglePurpose, state: string) {
  const g = await googleConfig();
  if (!g) throw new WorkflowError("VALIDATION", "Google is not set up for this workspace. Admin sets it up in Admin, Sign-in.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: g.clientId,
    redirect_uri: await connectRedirect(),
    response_type: "code",
    scope: `openid email ${GOOGLE_SCOPES[purpose]}`,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  }).toString();
  return url.toString();
}

// Stores the tokens from Google's answer to the connect step.
export async function finishConnect(user: AppUser, code: string) {
  const g = await googleConfig();
  if (!g) throw new WorkflowError("VALIDATION", "Google is not set up.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.secret, redirect_uri: await connectRedirect(), grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new WorkflowError("VALIDATION", "Google did not accept the connection. Try again.");
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope: string; id_token?: string };
  let email: string | null = null;
  if (t.id_token) {
    const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(t.id_token)}`, { signal: AbortSignal.timeout(15_000) });
    if (info.ok) email = ((await info.json()) as { email?: string }).email ?? null;
  }
  const old = await get<TokenRow>("SELECT * FROM google_tokens WHERE user_id = ?", user.id);
  const refreshEnc = t.refresh_token ? await seal(t.refresh_token) : (old?.refresh_enc ?? null);
  await run(
    `INSERT INTO google_tokens (user_id, email, scopes, refresh_enc, access_token, expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, scopes = excluded.scopes, refresh_enc = excluded.refresh_enc, access_token = excluded.access_token, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
    user.id,
    email,
    t.scope,
    refreshEnc,
    t.access_token,
    new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    nowIso(),
  );
  await audit({ actor: user }, { action: "google.connected", summary: `${user.name} connected their Google account${email ? ` (${email})` : ""}` });
}

export async function disconnect(user: AppUser) {
  const r = await get<TokenRow>("SELECT * FROM google_tokens WHERE user_id = ?", user.id);
  if (!r) return;
  const token = r.refresh_enc ? await unseal(r.refresh_enc) : r.access_token;
  if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  await run("DELETE FROM google_tokens WHERE user_id = ?", user.id);
  await audit({ actor: user }, { action: "google.disconnected", summary: `${user.name} disconnected their Google account` });
}

// A valid access token with the scope needed, refreshed when it has expired.
export async function accessToken(userId: string, purpose: GooglePurpose) {
  const r = await get<TokenRow>("SELECT * FROM google_tokens WHERE user_id = ?", userId);
  if (!r || !r.scopes.split(" ").includes(GOOGLE_SCOPES[purpose]))
    throw new WorkflowError(
      "NOT_CONNECTED",
      purpose === "meet" ? "Connect your Google account to create Meet links." : purpose === "drive" ? "Connect Google Drive for backups (Admin, System)." : "Connect your Google account to upload to YouTube.",
    );
  if (r.access_token && r.expires_at && r.expires_at > nowIso()) return r.access_token;
  const refresh = r.refresh_enc ? await unseal(r.refresh_enc) : null;
  const g = await googleConfig();
  if (!refresh || !g) throw new WorkflowError("NOT_CONNECTED", "Connect your Google account again.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.secret, refresh_token: refresh, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    await run("DELETE FROM google_tokens WHERE user_id = ?", userId);
    throw new WorkflowError("NOT_CONNECTED", "Google stopped the connection. Connect your Google account again.");
  }
  const t = (await res.json()) as { access_token: string; expires_in: number };
  await run("UPDATE google_tokens SET access_token = ?, expires_at = ? WHERE user_id = ?", t.access_token, new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(), userId);
  return t.access_token;
}

// A Google Meet link: a short Calendar event in the person's own calendar with a Meet conference.
export async function createMeet(user: AppUser, title: string) {
  const token = await accessToken(user.id, "meet");
  const start = new Date();
  const end = new Date(start.getTime() + 60 * 60e3);
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: title.slice(0, 200),
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new WorkflowError("VALIDATION", `Google could not create the meeting (${res.status}).`);
  const ev = (await res.json()) as { hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } };
  const link = ev.hangoutLink ?? ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
  if (!link) throw new WorkflowError("VALIDATION", "Google created the event without a Meet link. Check that Google Meet is on for the account.");
  return link;
}

// Starts a YouTube upload; the browser then sends the file straight to the returned address.
export async function startYoutubeUpload(user: AppUser, input: { title: string; description?: string; privacy?: "private" | "unlisted" | "public"; size: number; mime: string }) {
  const token = await accessToken(user.id, "youtube");
  if (!(input.size > 0)) throw new WorkflowError("VALIDATION", "Choose the video file.");
  const res = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(input.size),
      "x-upload-content-type": input.mime || "video/*",
      // Lets the person's browser send the file to this upload address.
      origin: await appOrigin(),
    },
    body: JSON.stringify({
      snippet: { title: input.title.slice(0, 100), description: (input.description ?? "").slice(0, 4900), categoryId: "27" },
      status: { privacyStatus: input.privacy ?? "unlisted", selfDeclaredMadeForKids: false },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const location = res.headers.get("location");
  if (!res.ok || !location) throw new WorkflowError("VALIDATION", `YouTube did not start the upload (${res.status}).`);
  return { uploadUrl: location };
}
