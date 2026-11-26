// Send to Notion, per person (Tools hub). Each person connects their own Notion workspace; their token is sealed
// with the workspace key and only used for their own sends. Two ways to connect:
//  - "Connect with Notion" (OAuth): when Admin has set NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_CLIENT_SECRET (a
//    public Notion integration whose redirect URI is <site>/api/tools/notion/callback). The person picks the pages
//    Myseed may use inside Notion's own screen.
//  - Paste an internal integration secret and the link of a page shared with it (no setup by Admin).
// Markdown and CSV exports stay available for anyone who does not connect.

import crypto from "node:crypto";
import { get, nowIso, parseJson, run } from "./db";
import { seal, unseal } from "./secrets";
import { audit, WorkflowError } from "./workflow";
import { requireFeature } from "./tools";
import { pageId, toBlocks } from "./notion";
import type { AppUser } from "./users";
import { CHECKBOX_RE } from "@/lib/tools";

const API = () => process.env.NOTION_API_URL || "https://api.notion.com/v1";
const VERSION = "2022-06-28";
type Meta = { workspace?: string | null; parentPageId?: string | null; parentTitle?: string | null; via?: "oauth" | "token" };

export function notionOAuthConfigured() {
  return !!(process.env.NOTION_OAUTH_CLIENT_ID && process.env.NOTION_OAUTH_CLIENT_SECRET);
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API()}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) }).catch(() => {
    throw new WorkflowError("INVALID_STATE", "Notion could not be reached from the server.");
  });
  const j = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (res.status === 401) throw new WorkflowError("INVALID_STATE", "Notion refused the connection. Connect again.");
  if (!res.ok) throw new WorkflowError("INVALID_STATE", `Notion: ${j.message ?? res.status}${res.status === 404 ? " (share the page with the integration in Notion: ••• menu, Connections)" : ""}`);
  return j;
}

export async function myNotion(user: AppUser) {
  const r = await get<{ meta: string; created_at: string }>("SELECT meta, created_at FROM tool_connections WHERE user_id = ? AND provider = 'notion'", user.id);
  if (!r) return { connected: false as const, oauth: notionOAuthConfigured() };
  const m = parseJson<Meta>(r.meta, {});
  return { connected: true as const, oauth: notionOAuthConfigured(), workspace: m.workspace ?? null, parentPageId: m.parentPageId ?? null, parentTitle: m.parentTitle ?? null, via: m.via ?? "token", since: r.created_at };
}

async function store(user: AppUser, token: string, meta: Meta) {
  await run(
    "INSERT INTO tool_connections (user_id, provider, token_enc, meta, created_at) VALUES (?, 'notion', ?, ?, ?) ON CONFLICT (user_id, provider) DO UPDATE SET token_enc = excluded.token_enc, meta = excluded.meta, created_at = excluded.created_at",
    user.id,
    await seal(token),
    JSON.stringify(meta),
    nowIso(),
  );
}

async function tokenOf(user: AppUser) {
  const r = await get<{ token_enc: string; meta: string }>("SELECT token_enc, meta FROM tool_connections WHERE user_id = ? AND provider = 'notion'", user.id);
  const t = r ? await unseal(r.token_enc) : null;
  if (!r || !t) throw new WorkflowError("INVALID_STATE", "Connect your Notion first (Tools, Connections).");
  return { token: t, meta: parseJson<Meta>(r.meta, {}) };
}

async function pageTitle(token: string, id: string) {
  const p = await call<{ properties?: Record<string, { type: string; title?: { plain_text: string }[] }> }>(token, "GET", `/pages/${id}`);
  const t = Object.values(p.properties ?? {}).find((x) => x.type === "title");
  return t?.title?.map((x) => x.plain_text).join("") || "Untitled";
}

export async function connectNotionToken(user: AppUser, input: { token: string; page: string }) {
  await requireFeature(user, "notion");
  const token = String(input.token ?? "").trim();
  if (!/^(secret_|ntn_)[A-Za-z0-9]{20,}$/.test(token)) throw new WorkflowError("VALIDATION", "Paste the integration secret from notion.so/my-integrations (it starts with ntn_ or secret_).");
  const id = pageId(input.page);
  const me = await call<{ bot?: { workspace_name?: string } }>(token, "GET", "/users/me");
  const title = await pageTitle(token, id);
  await store(user, token, { workspace: me.bot?.workspace_name ?? null, parentPageId: id, parentTitle: title, via: "token" });
  await audit({ actor: user }, { action: "tools.notion", summary: `${user.name} connected their Notion` });
  return myNotion(user);
}

export async function disconnectNotion(user: AppUser) {
  await run("DELETE FROM tool_connections WHERE user_id = ? AND provider = 'notion'", user.id);
}

// OAuth: the state ties the callback to this person and expires in 10 minutes.
const stateKey = () => crypto.createHash("sha256").update(`${process.env.NOTION_OAUTH_CLIENT_SECRET ?? ""}:notion-state`).digest();
export function notionState(userId: string) {
  const body = `${userId}.${Date.now()}`;
  return `${Buffer.from(body).toString("base64url")}.${crypto.createHmac("sha256", stateKey()).update(body).digest("base64url")}`;
}
export function checkNotionState(state: string, userId: string) {
  const [b, sig] = state.split(".");
  if (!b || !sig) return false;
  const body = Buffer.from(b, "base64url").toString();
  const want = crypto.createHmac("sha256", stateKey()).update(body).digest("base64url");
  const [uid, at] = body.split(".");
  return want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig)) && uid === userId && Date.now() - Number(at) < 10 * 60e3;
}

export async function finishNotionOAuth(user: AppUser, code: string, redirectUri: string) {
  await requireFeature(user, "notion");
  const basic = Buffer.from(`${process.env.NOTION_OAUTH_CLIENT_ID}:${process.env.NOTION_OAUTH_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API()}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", "Notion-Version": VERSION }, body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }), signal: AbortSignal.timeout(20000) });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; workspace_name?: string; duplicated_template_id?: string; error?: string };
  if (!res.ok || !j.access_token) throw new WorkflowError("INVALID_STATE", `Notion did not connect (${j.error ?? res.status}).`);
  // The first page the person shared becomes where notes go; they can change it later.
  const found = await call<{ results: { id: string; object: string }[] }>(j.access_token, "POST", "/search", { filter: { property: "object", value: "page" }, page_size: 1 });
  const first = j.duplicated_template_id ?? found.results[0]?.id ?? null;
  await store(user, j.access_token, { workspace: j.workspace_name ?? null, parentPageId: first, parentTitle: first ? await pageTitle(j.access_token, first) : null, via: "oauth" });
  await audit({ actor: user }, { action: "tools.notion", summary: `${user.name} connected their Notion (${j.workspace_name ?? "workspace"})` });
}

export async function setNotionParent(user: AppUser, page: string) {
  const { token, meta } = await tokenOf(user);
  const id = pageId(page);
  await store(user, token, { ...meta, parentPageId: id, parentTitle: await pageTitle(token, id) });
  return myNotion(user);
}

// Markdown to Notion blocks, with tick boxes as Notion to-dos.
function blocksOf(md: string) {
  const out: Record<string, unknown>[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) out.push(...toBlocks(buf.join("\n")));
    buf = [];
  };
  for (const line of md.split(/\r?\n/)) {
    const m = CHECKBOX_RE.exec(line);
    if (m) {
      flush();
      out.push({ object: "block", type: "to_do", to_do: { checked: m[2] !== " ", rich_text: [{ type: "text", text: { content: (m[3] ?? "").trim().slice(0, 2000) } }] } });
    } else buf.push(line);
  }
  flush();
  return out;
}

export async function sendToNotion(user: AppUser, input: { title: string; markdown: string }) {
  await requireFeature(user, "notion");
  const { token, meta } = await tokenOf(user);
  if (!meta.parentPageId) throw new WorkflowError("INVALID_STATE", "Choose the Notion page your notes go under (Tools, Connections, Notion).");
  const title = String(input.title ?? "Untitled").slice(0, 200);
  const blocks = blocksOf(String(input.markdown ?? "").slice(0, 200_000)).slice(0, 1000);
  const page = await call<{ id: string; url: string }>(token, "POST", "/pages", { parent: { page_id: meta.parentPageId }, properties: { title: { title: [{ type: "text", text: { content: title } }] } }, children: blocks.slice(0, 100) });
  for (let i = 100; i < blocks.length; i += 100) await call(token, "PATCH", `/blocks/${page.id}/children`, { children: blocks.slice(i, i + 100) });
  return { url: page.url };
}
