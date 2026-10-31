// Sign in with Google, Microsoft 365 or any OpenID Connect provider (OAuth 2 authorization code with PKCE).
// The ID token comes straight from the provider's token endpoint over HTTPS with our client secret, so, as
// OpenID Connect allows, it is checked by its issuer, audience, expiry and nonce rather than its signature.

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { appOrigin, googleConfig } from "./password-reset";
import { providerSecret, signInPolicy } from "./signin-config";
import { PROVIDER_IDS, PROVIDER_LABELS, type ProviderId } from "@/lib/signin-policy";

const COOKIE = "myseed_oidc";
const b64url = (b: Buffer) => b.toString("base64url");
const secure = () => process.env.NODE_ENV === "production" && process.env.MYSEED_INSECURE_COOKIES !== "1";

type Client = { id: ProviderId; name: string; clientId: string; secret: string; discovery: string; tenant?: string };
type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string };

export function isProvider(v: string): v is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(v);
}

export async function redirectUri(id: ProviderId) {
  return `${await appOrigin()}/api/auth/oauth/${id}/callback`;
}

async function client(id: ProviderId): Promise<Client | null> {
  const cfg = (await signInPolicy()).providers[id];
  if (!cfg.enabled) return null;
  if (id === "google") {
    const g = await googleConfig();
    return g && { id, name: "Google", clientId: g.clientId, secret: g.secret, discovery: "https://accounts.google.com/.well-known/openid-configuration" };
  }
  const secret = await providerSecret(id);
  if (!cfg.clientId || !secret) return null;
  if (id === "microsoft")
    return { id, name: "Microsoft", clientId: cfg.clientId, secret, tenant: cfg.tenant, discovery: `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant ?? "")}/v2.0/.well-known/openid-configuration` };
  return { id, name: cfg.name || PROVIDER_LABELS.oidc, clientId: cfg.clientId, secret, discovery: `${cfg.issuer}/.well-known/openid-configuration` };
}

// Plain http is accepted only for a provider on this computer, in development or a local test run.
export function safeUrl(u: string) {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  const local = process.env.NODE_ENV !== "production" || process.env.MYSEED_INSECURE_COOKIES === "1";
  return local && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
}

const discoveries = new Map<string, { at: number; doc: Discovery }>();

async function discover(url: string): Promise<Discovery> {
  const hit = discoveries.get(url);
  if (hit && Date.now() - hit.at < 3600e3) return hit.doc;
  if (!safeUrl(url)) throw new Error("The provider's address must start with https://.");
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("The sign-in provider did not answer. Try again in a minute.");
  const doc = (await res.json()) as Partial<Discovery>;
  if (!doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint || !safeUrl(doc.authorization_endpoint) || !safeUrl(doc.token_endpoint))
    throw new Error("The sign-in provider's settings are incomplete.");
  discoveries.set(url, { at: Date.now(), doc: doc as Discovery });
  return doc as Discovery;
}

// Providers people can use on the sign-in page.
export async function readyProviders(): Promise<{ id: ProviderId; name: string }[]> {
  const out: { id: ProviderId; name: string }[] = [];
  for (const id of PROVIDER_IDS) {
    const c = await client(id);
    if (c) out.push({ id, name: c.name });
  }
  return out;
}

export async function startProviderAuth(id: ProviderId, mode: "signin" | "link", next: string) {
  const c = await client(id);
  if (!c) throw new Error("This way of signing in is switched off.");
  const d = await discover(c.discovery);
  const state = b64url(crypto.randomBytes(16));
  const nonce = b64url(crypto.randomBytes(16));
  const verifier = b64url(crypto.randomBytes(32));
  (await cookies()).set(COOKIE, b64url(Buffer.from(JSON.stringify({ p: id, s: state, n: nonce, v: verifier, m: mode, x: next }))), {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(),
    path: "/",
    maxAge: 600,
  });
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: await redirectUri(id),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: b64url(crypto.createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export type ProviderClaims = { mode: "signin" | "link"; next: string; subject: string; email: string; name: string | null };

export async function finishProviderAuth(id: ProviderId, url: URL): Promise<ProviderClaims> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  let st: { p: string; s: string; n: string; v: string; m: "signin" | "link"; x: string } | null = null;
  try {
    st = raw ? JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) : null;
  } catch {
    st = null;
  }
  if (url.searchParams.get("error")) throw new Error("Signing in was cancelled.");
  if (!st || st.p !== id || st.s !== url.searchParams.get("state") || !url.searchParams.get("code")) throw new Error("This sign-in took too long or was opened twice. Try again.");
  const c = await client(id);
  if (!c) throw new Error("This way of signing in is switched off.");
  const d = await discover(c.discovery);
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code")!, redirect_uri: await redirectUri(id), client_id: c.clientId, client_secret: c.secret, code_verifier: st.v }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${c.name} did not confirm the sign-in. Try again.`);
  const { id_token } = (await res.json()) as { id_token?: string };
  const parts = id_token?.split(".") ?? [];
  if (parts.length !== 3) throw new Error(`${c.name} did not send who you are.`);
  const t = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    nonce?: string;
    sub?: string;
    tid?: string;
    email?: string;
    email_verified?: boolean | string;
    preferred_username?: string;
    name?: string;
  };
  const issuer = d.issuer.replace("{tenantid}", t.tid ?? "");
  const aud = Array.isArray(t.aud) ? t.aud : [t.aud];
  if (t.iss !== issuer || !aud.includes(c.clientId) || !t.exp || t.exp * 1000 < Date.now() - 60e3 || t.nonce !== st.n || !t.sub) throw new Error(`${c.name}'s answer could not be checked. Try again.`);
  // Google and other providers say whether they checked the address. Microsoft is limited to one directory
  // (see signin-config.ts), whose addresses its administrators control.
  let email: string | undefined;
  if (id === "microsoft") email = t.email || (t.preferred_username?.includes("@") ? t.preferred_username : undefined);
  else if (t.email_verified === true || t.email_verified === "true") email = t.email;
  if (!email) throw new Error(`${c.name} did not confirm your email address.`);
  return { mode: st.m, next: st.x, subject: t.sub, email: email.toLowerCase(), name: t.name ?? null };
}
