// OAuth 2.1 for the AI connections of the Tools hub: Claude (remote MCP server, /api/mcp) and ChatGPT (Custom GPT
// actions, /api/v1/gpt/*). Each person signs in to Myseed and approves the app on /oauth/authorize; the app then
// holds a token that acts only as that person, only on their own Tools data (and the production records they can
// already see), and only while Admin keeps the connection on for them (Admin, Tools hub).
//
//  - Claude registers itself (RFC 7591 dynamic registration, public client, PKCE S256 required).
//  - ChatGPT uses a client Admin creates (client id and secret, Admin, Tools hub), PKCE optional as GPTs send none.
//  - Codes live 5 minutes and work once; access tokens 1 hour; refresh tokens 30 days and rotate on use.
//  - Only SHA-256 hashes of codes, secrets and tokens are stored. People see and revoke their connections in Tools.

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, loadUser, type AppUser } from "./users";
import { toolsFor } from "./tools";

export const SCOPE = "tools";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const rand = (n = 32) => crypto.randomBytes(n).toString("base64url");
const CODE_MS = 5 * 60e3;
const ACCESS_MS = 3600e3;
const REFRESH_MS = 30 * 864e5;

export type Client = { client_id: string; name: string; redirect_uris: string[]; kind: "dynamic" | "gpt"; secret_hash: string | null };

export function metadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SCOPE],
    service_documentation: `${origin}/tools#connections`,
  };
}

export function resourceMetadata(origin: string) {
  return { resource: `${origin}/api/mcp`, authorization_servers: [origin], scopes_supported: [SCOPE], bearer_methods_supported: ["header"], resource_name: "Myseed Tools hub" };
}

// Redirect addresses a client may use: https anywhere, or http only on this computer (Claude Desktop, tests).
function validRedirect(u: string) {
  try {
    const url = new URL(u);
    if (url.hash) return false;
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}
// ChatGPT's callback, when Admin did not list exact addresses.
const GPT_CALLBACK = /^https:\/\/(chat\.openai\.com|chatgpt\.com)\/aip\/[\w-]+\/oauth\/callback$/;

export async function clientById(id: string): Promise<Client | null> {
  const r = await get<{ client_id: string; name: string; redirect_uris: string; kind: string; secret_hash: string | null }>("SELECT client_id, name, redirect_uris, kind, secret_hash FROM oauth_clients WHERE client_id = ? AND revoked_at IS NULL", id);
  return r ? { ...r, kind: r.kind === "gpt" ? "gpt" : "dynamic", redirect_uris: parseJson<string[]>(r.redirect_uris, []) } : null;
}

export function redirectAllowed(c: Client, uri: string) {
  if (!validRedirect(uri)) return false;
  if (c.redirect_uris.includes(uri)) return true;
  return c.kind === "gpt" && !c.redirect_uris.length && GPT_CALLBACK.test(uri);
}

// RFC 7591: Claude (and other MCP clients) register themselves; they get a public client id.
export async function registerClient(body: { client_name?: unknown; redirect_uris?: unknown }) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String).slice(0, 10) : [];
  if (!uris.length || !uris.every(validRedirect)) throw new WorkflowError("VALIDATION", "redirect_uris must be https (or http on localhost).");
  const count = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM oauth_clients WHERE kind = 'dynamic' AND created_at > ?", new Date(Date.now() - 864e5).toISOString()))?.n ?? 0);
  if (count > 500) throw new WorkflowError("VALIDATION", "Too many registrations today. Try again tomorrow.");
  const id = `mcp_${rand(18)}`;
  const name = String(body.client_name ?? "MCP client").replace(/[\u0000-\u001F]/g, "").slice(0, 80) || "MCP client";
  await run("INSERT INTO oauth_clients (client_id, name, redirect_uris, kind, created_at) VALUES (?, ?, ?, 'dynamic', ?)", id, name, JSON.stringify(uris), nowIso());
  return { client_id: id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(Date.now() / 1000) };
}

// Admin: the client for a Custom GPT (the secret is shown once).
export async function createGptClient(user: AppUser, input: { name: string; redirectUris: string[] }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin creates ChatGPT connections.");
  const uris = (input.redirectUris ?? []).map((u) => u.trim()).filter(Boolean);
  if (!uris.every(validRedirect)) throw new WorkflowError("VALIDATION", "Each callback address must start with https://.");
  const id = `gpt_${rand(12)}`;
  const secret = `mss_${rand(32)}`;
  await run("INSERT INTO oauth_clients (client_id, secret_hash, name, redirect_uris, kind, created_by, created_at) VALUES (?, ?, ?, ?, 'gpt', ?, ?)", id, sha(secret), String(input.name || "ChatGPT").slice(0, 80), JSON.stringify(uris), user.id, nowIso());
  await audit({ actor: user }, { action: "tools.gpt_client", summary: `${user.name} created the ChatGPT connection ${input.name || id}` });
  return { clientId: id, clientSecret: secret };
}

export async function gptClients() {
  return all<{ client_id: string; name: string; created_at: string; revoked_at: string | null }>("SELECT client_id, name, created_at, revoked_at FROM oauth_clients WHERE kind = 'gpt' ORDER BY created_at DESC");
}

export async function revokeGptClient(user: AppUser, clientId: string) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin removes ChatGPT connections.");
  await tx(async () => {
    await run("UPDATE oauth_clients SET revoked_at = ? WHERE client_id = ? AND kind = 'gpt'", nowIso(), clientId);
    await run("UPDATE oauth_tokens SET revoked_at = ? WHERE client_id = ? AND revoked_at IS NULL", nowIso(), clientId);
  });
  await audit({ actor: user }, { action: "tools.gpt_client", summary: `${user.name} removed a ChatGPT connection` });
}

const featureOf = (c: Client) => (c.kind === "gpt" ? "gpt" : "mcp");

export async function mayConnect(user: AppUser, c: Client) {
  return (await toolsFor(user)).features.includes(featureOf(c));
}

// The consent screen approved: a one-time code for the client's redirect.
export async function issueCode(user: AppUser, input: { clientId: string; redirectUri: string; codeChallenge: string | null; method: string | null; scope: string | null; resource: string | null }) {
  const c = await clientById(input.clientId);
  if (!c || !redirectAllowed(c, input.redirectUri)) throw new WorkflowError("VALIDATION", "Unknown app or callback address.");
  if (!(await mayConnect(user, c))) throw new WorkflowError("FORBIDDEN", "Admin has not switched this connection on for you.");
  if (c.kind === "dynamic" && (!input.codeChallenge || input.method !== "S256")) throw new WorkflowError("VALIDATION", "PKCE (S256) is required.");
  if (input.codeChallenge && !/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge)) throw new WorkflowError("VALIDATION", "Bad code challenge.");
  const code = rand(32);
  await run(
    "INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    sha(code),
    c.client_id,
    user.id,
    input.redirectUri,
    input.codeChallenge,
    SCOPE,
    input.resource?.slice(0, 300) ?? null,
    new Date(Date.now() + CODE_MS).toISOString(),
  );
  await audit({ actor: user }, { action: "tools.oauth_approved", summary: `${user.name} connected ${c.name} to their Tools hub` });
  return code;
}

async function issueTokens(clientId: string, userId: string, parent: string | null) {
  const access = `msa_${rand(32)}`;
  const refresh = `msr_${rand(32)}`;
  const now = nowIso();
  const refreshId = uid("ort_");
  await run("INSERT INTO oauth_tokens (id, token_hash, kind, client_id, user_id, scope, parent_id, expires_at, created_at) VALUES (?, ?, 'refresh', ?, ?, ?, ?, ?, ?)", refreshId, sha(refresh), clientId, userId, SCOPE, parent, new Date(Date.now() + REFRESH_MS).toISOString(), now);
  await run("INSERT INTO oauth_tokens (id, token_hash, kind, client_id, user_id, scope, parent_id, expires_at, created_at) VALUES (?, ?, 'access', ?, ?, ?, ?, ?, ?)", uid("oat_"), sha(access), clientId, userId, SCOPE, refreshId, new Date(Date.now() + ACCESS_MS).toISOString(), now);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_MS / 1000, refresh_token: refresh, scope: SCOPE };
}

export class OAuthError extends Error {
  constructor(
    public error: string,
    public description: string,
    public status = 400,
  ) {
    super(description);
  }
}

function clientAuth(c: Client, secret: string | null) {
  if (c.kind === "gpt") {
    if (!secret || !c.secret_hash || !crypto.timingSafeEqual(Buffer.from(sha(secret)), Buffer.from(c.secret_hash))) throw new OAuthError("invalid_client", "Client authentication failed.", 401);
  }
}

export async function tokenEndpoint(form: URLSearchParams, basic: { id: string; secret: string } | null) {
  const grant = form.get("grant_type");
  const clientId = basic?.id ?? form.get("client_id") ?? "";
  const c = await clientById(clientId);
  if (!c) throw new OAuthError("invalid_client", "Unknown client.", 401);
  clientAuth(c, basic?.secret ?? form.get("client_secret"));
  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const row = await get<{ client_id: string; user_id: string; redirect_uri: string; code_challenge: string | null; expires_at: string; used_at: string | null }>("SELECT client_id, user_id, redirect_uri, code_challenge, expires_at, used_at FROM oauth_codes WHERE code_hash = ?", sha(code));
    if (!row || row.client_id !== c.client_id || row.expires_at < nowIso()) throw new OAuthError("invalid_grant", "The code is unknown or expired.");
    // A code used twice means it leaked: everything it gave is withdrawn.
    if (row.used_at) {
      await run("UPDATE oauth_tokens SET revoked_at = ? WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL", nowIso(), c.client_id, row.user_id);
      throw new OAuthError("invalid_grant", "The code was already used.");
    }
    if (form.get("redirect_uri") && form.get("redirect_uri") !== row.redirect_uri) throw new OAuthError("invalid_grant", "redirect_uri does not match.");
    if (row.code_challenge) {
      const verifier = form.get("code_verifier") ?? "";
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || crypto.createHash("sha256").update(verifier).digest("base64url") !== row.code_challenge) throw new OAuthError("invalid_grant", "PKCE check failed.");
    } else if (c.kind !== "gpt") throw new OAuthError("invalid_grant", "PKCE is required.");
    const claimed = await run("UPDATE oauth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL", nowIso(), sha(code));
    if (!claimed.changes) throw new OAuthError("invalid_grant", "The code was already used.");
    return issueTokens(c.client_id, row.user_id, null);
  }
  if (grant === "refresh_token") {
    const t = form.get("refresh_token") ?? "";
    const row = await get<{ id: string; client_id: string; user_id: string; expires_at: string; revoked_at: string | null }>("SELECT id, client_id, user_id, expires_at, revoked_at FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'", sha(t));
    if (!row || row.client_id !== c.client_id || row.expires_at < nowIso()) throw new OAuthError("invalid_grant", "The refresh token is unknown or expired.");
    if (row.revoked_at) {
      // A rotated refresh token used again: someone copied it. Withdraw the whole connection.
      await run("UPDATE oauth_tokens SET revoked_at = ? WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL", nowIso(), c.client_id, row.user_id);
      throw new OAuthError("invalid_grant", "The refresh token was already used.");
    }
    await run("UPDATE oauth_tokens SET revoked_at = ? WHERE id = ? OR (parent_id = ? AND kind = 'access')", nowIso(), row.id, row.id);
    return issueTokens(c.client_id, row.user_id, row.id);
  }
  throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export async function revokeToken(token: string) {
  const row = await get<{ id: string; kind: string; parent_id: string | null }>("SELECT id, kind, parent_id FROM oauth_tokens WHERE token_hash = ?", sha(token));
  if (!row) return;
  const family = row.kind === "refresh" ? row.id : row.parent_id;
  await run("UPDATE oauth_tokens SET revoked_at = ? WHERE (id = ? OR id = ? OR parent_id = ?) AND revoked_at IS NULL", nowIso(), row.id, family ?? row.id, family ?? row.id);
}

// The person behind a Bearer token, for /api/mcp and /api/v1/gpt; null when the token or the connection is not valid.
export async function bearerUser(req: Request, want: "mcp" | "gpt"): Promise<AppUser | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(msa_[A-Za-z0-9_-]{20,})$/i.exec(h.trim())?.[1];
  if (!token) return null;
  const row = await get<{ id: string; user_id: string; client_id: string; expires_at: string; revoked_at: string | null; last_used_at: string | null }>("SELECT id, user_id, client_id, expires_at, revoked_at, last_used_at FROM oauth_tokens WHERE token_hash = ? AND kind = 'access'", sha(token));
  if (!row || row.revoked_at || row.expires_at < nowIso()) return null;
  const c = await clientById(row.client_id);
  if (!c || featureOf(c) !== want) return null;
  const user = await loadUser(row.user_id);
  if (!user?.active || !(await mayConnect(user, c))) return null;
  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 60e3) await run("UPDATE oauth_tokens SET last_used_at = ? WHERE id = ?", nowIso(), row.id);
  return user;
}

// The person's connected AI apps (Tools, Connections), and revoking one.
export async function myConnections(user: AppUser) {
  return all<{ client_id: string; name: string; kind: string; since: string; last_used: string | null }>(
    `SELECT c.client_id, c.name, c.kind, MIN(t.created_at) AS since, MAX(t.last_used_at) AS last_used
     FROM oauth_tokens t JOIN oauth_clients c ON c.client_id = t.client_id
     WHERE t.user_id = ? AND t.revoked_at IS NULL AND t.expires_at > ? GROUP BY c.client_id, c.name, c.kind ORDER BY since DESC`,
    user.id,
    nowIso(),
  );
}

export async function disconnectClient(user: AppUser, clientId: string) {
  await run("UPDATE oauth_tokens SET revoked_at = ? WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL", nowIso(), user.id, clientId);
  await audit({ actor: user }, { action: "tools.oauth_revoked", summary: `${user.name} disconnected an AI app from their Tools hub` });
}
