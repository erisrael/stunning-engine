// Notion (Phase 27): Admin connects an internal Notion integration (its secret, and the page it was shared with).
// Then a department document goes to Notion as a page (headings, lists, code, quotes), a dataset goes to Notion as
// a database (columns as properties, up to 200 rows), and a Notion page comes back as a document in the library.
// NOTION_API_URL can point elsewhere (tests).

import { get, nowIso, parseJson, run, uid } from "./db";
import { seal, unseal } from "./secrets";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { workAccess } from "./dept-config";

const API = () => process.env.NOTION_API_URL || "https://api.notion.com/v1";
const VERSION = "2022-06-28";

type Cfg = { tokenEnc?: string | null; parentPageId?: string | null; workspace?: string | null; connectedAt?: string | null };
async function cfg(): Promise<Cfg> {
  return parseJson<Cfg>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.notion'"))?.value, {});
}
export async function notionStatus() {
  const c = await cfg();
  return { connected: !!c.tokenEnc, parentPageId: c.parentPageId ?? null, workspace: c.workspace ?? null, connectedAt: c.connectedAt ?? null };
}

// A Notion page link or id, as the id.
export function pageId(v: string) {
  const s = String(v ?? "").trim();
  const m = s.replace(/-/g, "").match(/([0-9a-f]{32})(?:\?|$|#)/i) ?? s.replace(/-/g, "").match(/([0-9a-f]{32})/i);
  if (!m) throw new WorkflowError("VALIDATION", "Paste the Notion page's link (or its 32-character id).");
  const h = m[1]!.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API()}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) }).catch(() => {
    throw new WorkflowError("INVALID_STATE", "Notion could not be reached from the server.");
  });
  const j = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new WorkflowError("INVALID_STATE", `Notion: ${j.message ?? res.status}${res.status === 404 ? " (share the page with the integration in Notion: ••• menu, Connections)" : ""}`);
  return j;
}
async function token() {
  const c = await cfg();
  if (!c.tokenEnc) throw new WorkflowError("INVALID_STATE", "Notion is not connected (Admin, Integrations, Notion).");
  return { token: (await unseal(c.tokenEnc)) ?? "", parent: c.parentPageId ?? null };
}

export async function connectNotion(user: AppUser, input: { token?: string | null; parentPage?: string | null; disconnect?: boolean }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin connects Notion.");
  if (input.disconnect) {
    await run("DELETE FROM settings WHERE key = 'cfg.notion'");
    return { connected: false };
  }
  const cur = await cfg();
  const t = input.token?.trim() || (cur.tokenEnc ? ((await unseal(cur.tokenEnc)) ?? "") : "");
  if (!t) throw new WorkflowError("VALIDATION", "Paste the integration's secret (Notion, Settings, Connections, Develop or manage integrations).");
  const me = await call<{ bot?: { workspace_name?: string }; name?: string }>(t, "GET", "/users/me");
  const parent = input.parentPage ? pageId(input.parentPage) : (cur.parentPageId ?? null);
  if (parent) await call(t, "GET", `/pages/${parent}`);
  const next: Cfg = { tokenEnc: await seal(t), parentPageId: parent, workspace: me.bot?.workspace_name ?? me.name ?? "Notion", connectedAt: nowIso() };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.notion', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "integrations.notion", summary: `${user.name} connected Notion (${next.workspace})` });
  return { connected: true, workspace: next.workspace };
}

type Rich = { type: "text"; text: { content: string }; annotations?: { bold?: boolean; code?: boolean; italic?: boolean } }[];
const rich = (s: string): Rich => {
  const out: Rich = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ type: "text", text: { content: s.slice(last, m.index).slice(0, 2000) } });
    out.push({ type: "text", text: { content: m[0].replace(/^\*\*|\*\*$|^`|`$/g, "").slice(0, 2000) }, annotations: m[0].startsWith("`") ? { code: true } : { bold: true } });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ type: "text", text: { content: s.slice(last).slice(0, 2000) } });
  return out.length ? out : [{ type: "text", text: { content: "" } }];
};

// The app's text ("#" headings, "- " and "1." lists, ``` code, "> " quotes) as Notion blocks.
export function toBlocks(body: string) {
  const blocks: Record<string, unknown>[] = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^```/.test(l)) {
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]!); i++) code.push(lines[i]!);
      blocks.push({ object: "block", type: "code", code: { language: "plain text", rich_text: [{ type: "text", text: { content: code.join("\n").slice(0, 2000) } }] } });
      continue;
    }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    const b = l.match(/^\s*[-*•]\s+(.*)$/);
    const n = l.match(/^\s*\d+[.)]\s+(.*)$/);
    const q = l.match(/^>\s?(.*)$/);
    if (h) blocks.push({ object: "block", type: `heading_${h[1]!.length}`, [`heading_${h[1]!.length}`]: { rich_text: rich(h[2]!) } });
    else if (b) blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich(b[1]!) } });
    else if (n) blocks.push({ object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: rich(n[1]!) } });
    else if (q) blocks.push({ object: "block", type: "quote", quote: { rich_text: rich(q[1]!) } });
    else if (l.trim()) blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: rich(l) } });
  }
  return blocks;
}

// Notion blocks back to the app's text.
export function fromBlocks(blocks: { type: string; [k: string]: unknown }[]) {
  const text = (b: { type: string; [k: string]: unknown }) => (((b[b.type] as { rich_text?: { plain_text?: string; text?: { content?: string } }[] })?.rich_text ?? []).map((r) => r.plain_text ?? r.text?.content ?? "").join(""));
  return blocks
    .map((b) => {
      const t = text(b);
      if (b.type.startsWith("heading_")) return `${"#".repeat(Number(b.type.slice(-1)))} ${t}`;
      if (b.type === "bulleted_list_item" || b.type === "to_do") return `- ${t}`;
      if (b.type === "numbered_list_item") return `1. ${t}`;
      if (b.type === "quote" || b.type === "callout") return `> ${t}`;
      if (b.type === "code") return `\`\`\`\n${t}\n\`\`\``;
      if (b.type === "divider") return "---";
      return t;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function appendBlocks(t: string, id: string, blocks: Record<string, unknown>[]) {
  for (let i = 0; i < blocks.length; i += 100) await call(t, "PATCH", `/blocks/${id}/children`, { children: blocks.slice(i, i + 100) });
}

export async function docToNotion(user: AppUser, dept: string, docId: string) {
  const a = await workAccess(user, dept);
  const d = await get<{ title: string; body: string }>("SELECT title, body FROM dept_docs WHERE id = ? AND dept = ?", docId, a.dept);
  if (!d) throw new WorkflowError("NOT_FOUND", "Document not found.");
  const { token: t, parent } = await token();
  if (!parent) throw new WorkflowError("INVALID_STATE", "Choose the Notion page documents go under (Admin, Integrations, Notion).");
  const blocks = toBlocks(d.body);
  const page = await call<{ id: string; url: string }>(t, "POST", "/pages", { parent: { page_id: parent }, properties: { title: { title: [{ type: "text", text: { content: d.title.slice(0, 200) } }] } }, children: blocks.slice(0, 100) });
  await appendBlocks(t, page.id, blocks.slice(100));
  await audit({ actor: user }, { action: "integrations.notion", summary: `${user.name} sent "${d.title}" to Notion` });
  return { url: page.url, blocks: blocks.length };
}

export async function datasetToNotion(user: AppUser, title: string, rows: Record<string, unknown>[]) {
  const { token: t, parent } = await token();
  if (!parent) throw new WorkflowError("INVALID_STATE", "Choose the Notion page databases go under (Admin, Integrations, Notion).");
  const cols = Object.keys(rows[0] ?? { Name: "" }).slice(0, 25);
  const numeric = new Set(cols.filter((k) => rows.length && rows.every((r) => r[k] === null || r[k] === "" || typeof r[k] === "number")));
  const props: Record<string, unknown> = {};
  cols.forEach((k, i) => (props[i === 0 ? k : k] = i === 0 ? { title: {} } : numeric.has(k) ? { number: {} } : { rich_text: {} }));
  const db = await call<{ id: string; url: string }>(t, "POST", "/databases", { parent: { type: "page_id", page_id: parent }, title: [{ type: "text", text: { content: title.slice(0, 200) } }], properties: props });
  let n = 0;
  for (const r of rows.slice(0, 200)) {
    const p: Record<string, unknown> = {};
    cols.forEach((k, i) => {
      const v = r[k];
      p[k] = i === 0 ? { title: [{ type: "text", text: { content: String(v ?? "").slice(0, 2000) } }] } : numeric.has(k) ? { number: v === null || v === "" ? null : Number(v) } : { rich_text: [{ type: "text", text: { content: String(v ?? "").slice(0, 2000) } }] };
    });
    await call(t, "POST", "/pages", { parent: { database_id: db.id }, properties: p });
    n++;
  }
  await audit({ actor: user }, { action: "integrations.notion", summary: `${user.name} sent "${title}" (${n} rows) to Notion` });
  return { url: db.url, rows: n };
}

export async function notionToDoc(user: AppUser, dept: string, input: { page: string; folderId?: string | null }) {
  const a = await workAccess(user, dept, "write");
  const id = pageId(input.page);
  const { token: t } = await token();
  const page = await call<{ properties?: Record<string, { type: string; title?: { plain_text: string }[] }> }>(t, "GET", `/pages/${id}`);
  const title = Object.values(page.properties ?? {}).find((p) => p.type === "title")?.title?.map((x) => x.plain_text).join("") || "From Notion";
  const blocks: { type: string; [k: string]: unknown }[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const r: { results: { type: string; [k: string]: unknown }[]; has_more?: boolean; next_cursor?: string | null } = await call(t, "GET", `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    blocks.push(...r.results);
    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
  }
  const folder = input.folderId ? ((await get<{ id: string }>("SELECT id FROM dept_folders WHERE id = ? AND dept = ?", input.folderId, a.dept))?.id ?? null) : null;
  const docId = uid("doc_");
  const now = nowIso();
  await run("INSERT INTO dept_docs (id, dept, folder_id, kind, title, body, status, version, created_by, created_at, updated_at) VALUES (?, ?, ?, 'note', ?, ?, 'draft', 1, ?, ?, ?)", docId, a.dept, folder, title.slice(0, 160), fromBlocks(blocks).slice(0, 200_000), user.id, now, now);
  await audit({ actor: user }, { action: `${a.dept}.doc`, summary: `${user.name} brought "${title}" in from Notion` });
  return docId;
}
