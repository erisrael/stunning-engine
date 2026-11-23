// The department's document library (Phase 26): folders inside folders, documents and any files (designs, PDFs,
// spreadsheets, exports) in them, search through titles, text and file names, pins, recent documents, duplicating,
// moving, importing a Word, Markdown, text or HTML file as a document, and exporting a document as Word (.docx),
// Markdown or HTML. Rights are the department's: everyone who sees it reads; writers change; the author or a head
// deletes.

import JSZip from "jszip";
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TabStopType, TextRun, WidthType } from "docx";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { workAccess } from "./dept-config";
import { audit, WorkflowError } from "./workflow";
import type { AppUser } from "./users";
import { DOC_KINDS, DOC_MAX_CHARS, DOC_STATUS_LABELS, docRef } from "@/lib/dev-docs";
import { markdownTitle, specDocumentHtml, splitFrontMatter } from "@/lib/spec-doc";
import { fullAccess, itemLevel, looksLikeScraper, managesAccess, memberScope, noteRead, recordEvent, type Level } from "./dept-access";

const MAX_FILE = 15 * 1024 * 1024;
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, n);

export type Folder = { id: string; parentId: string | null; name: string; docs: number; files: number };

async function folderOf(dept: string, id: string | null | undefined) {
  if (!id) return null;
  const f = await get<{ id: string; parent_id: string | null; name: string }>("SELECT id, parent_id, name FROM dept_folders WHERE id = ? AND dept = ?", id, dept);
  if (!f) throw new WorkflowError("NOT_FOUND", "Folder not found.");
  return f;
}

export async function library(user: AppUser, d: string, folderId: string | null) {
  const a = await workAccess(user, d);
  const scope = await memberScope(a, user);
  const allFolders = await all<{ id: string; parent_id: string | null; name: string }>("SELECT id, parent_id, name FROM dept_folders WHERE dept = ? ORDER BY name", a.dept);
  // Every document and file with its folder and owner, to work out what a member may see.
  const allDocs = await all<{ id: string; folder_id: string | null; created_by: string | null }>("SELECT id, folder_id, created_by FROM dept_docs WHERE dept = ?", a.dept);
  const allFiles = await all<{ id: string; folder_id: string | null; uploaded_by: string | null }>("SELECT id, folder_id, uploaded_by FROM dept_folder_files WHERE dept = ?", a.dept);
  const docLevel = (x: { id: string; folder_id: string | null; created_by: string | null }): Level | null => (scope.full ? "download" : scope.item("doc", x.id, x.folder_id, x.created_by));
  const fileLevel = (x: { id: string; folder_id: string | null; uploaded_by: string | null }): Level | null => (scope.full ? "download" : scope.item("file", x.id, x.folder_id, x.uploaded_by));
  const seenDocs = new Map(allDocs.map((x) => [x.id, docLevel(x)] as const).filter(([, l]) => l));
  const seenFiles = new Map(allFiles.map((x) => [x.id, fileLevel(x)] as const).filter(([, l]) => l));
  const showFolders = scope.full ? null : scope.visibleFolders([...allDocs.filter((x) => seenDocs.has(x.id)), ...allFiles.filter((x) => seenFiles.has(x.id))]);
  const folders = showFolders ? allFolders.filter((f) => showFolders.has(f.id)) : allFolders;
  if (folderId && !folders.some((f) => f.id === folderId)) throw new WorkflowError("FORBIDDEN", "This folder has not been shared with you. Ask your team lead or head.");
  const current = folderId ? (folders.find((f) => f.id === folderId) ?? null) : null;
  const path: { id: string; name: string }[] = [];
  for (let f = current; f; f = folders.find((x) => x.id === f!.parent_id) ?? null) path.unshift({ id: f.id, name: f.name });
  const docs = (
    await all<{ id: string; kind: string; title: string; status: string; version: number; updated_at: string; author: string | null; pinned: number; source: string | null }>(
      `SELECT x.id, x.kind, x.title, x.status, x.version, x.updated_at, u.name AS author, CASE WHEN p.doc_id IS NULL THEN 0 ELSE 1 END AS pinned, s.source
       FROM dept_docs x LEFT JOIN users u ON u.id = x.created_by LEFT JOIN dept_doc_pins p ON p.doc_id = x.id AND p.user_id = ? LEFT JOIN dept_doc_sources s ON s.doc_id = x.id
       WHERE x.dept = ? AND ${current ? "x.folder_id = ?" : "x.folder_id IS NULL"} ORDER BY x.title`,
      user.id,
      a.dept,
      ...(current ? [current.id] : []),
    )
  ).filter((x) => seenDocs.has(x.id));
  const files = (
    await all<{ id: string; name: string; mime: string; size: number; created_at: string; by: string | null }>(
      `SELECT f.id, f.name, f.mime, f.size, f.created_at, u.name AS by FROM dept_folder_files f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.dept = ? AND ${current ? "f.folder_id = ?" : "f.folder_id IS NULL"} ORDER BY f.name`,
      a.dept,
      ...(current ? [current.id] : []),
    )
  ).filter((f) => seenFiles.has(f.id));
  const pins = (await all<{ id: string; title: string; folder_id: string | null }>("SELECT x.id, x.title, x.folder_id FROM dept_doc_pins p JOIN dept_docs x ON x.id = p.doc_id WHERE p.user_id = ? AND x.dept = ? ORDER BY x.title", user.id, a.dept)).filter((p) => seenDocs.has(p.id));
  const recent = (await all<{ id: string; title: string; updated_at: string }>("SELECT id, title, updated_at FROM dept_docs WHERE dept = ? ORDER BY updated_at DESC LIMIT 60", a.dept)).filter((r) => seenDocs.has(r.id)).slice(0, 6);
  // Counts beside each folder: only what this person may see.
  const count = (fid: string, of: Map<string, Level | null>, rows: { id: string; folder_id: string | null }[]) => rows.filter((x) => x.folder_id === fid && of.has(x.id)).length;
  return {
    folder: current ? { id: current.id, name: current.name, parentId: current.parent_id } : null,
    path,
    tree: folders.map((f) => ({ id: f.id, parentId: f.parent_id, name: f.name, docs: count(f.id, seenDocs, allDocs), files: count(f.id, seenFiles, allFiles) })) as Folder[],
    subfolders: folders.filter((f) => f.parent_id === (current?.id ?? null)).map((f) => ({ id: f.id, name: f.name })),
    docs: docs.map((x) => ({ id: x.id, kind: x.kind, kindLabel: DOC_KINDS.find((k) => k.key === x.kind)?.label ?? "Document", title: x.title, status: DOC_STATUS_LABELS[x.status] ?? x.status, version: Number(x.version), updatedAt: x.updated_at, author: x.author ?? (x.source ? "Repository" : null), pinned: !!Number(x.pinned), source: x.source, level: seenDocs.get(x.id)! })),
    files: files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: Number(f.size), createdAt: f.created_at, by: f.by, level: seenFiles.get(f.id)! })),
    pins: pins.map((p) => ({ id: p.id, title: p.title })),
    recent: recent.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at })),
    canWrite: !a.readOnly,
    // Heads and leads see everything and share; members see what is theirs or shared with them.
    full: scope.full,
    canShare: managesAccess(a, user),
    folderLevel: current && !scope.full ? scope.folderOf(current.id) : null,
    notion: (await (await import("./notion")).notionStatus()).connected,
  };
}
export type Library = Awaited<ReturnType<typeof library>>;

export async function saveFolder(user: AppUser, d: string, input: { id?: string | null; name: string; parentId?: string | null }) {
  const a = await workAccess(user, d, "write");
  const name = clean(input.name, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the folder.");
  const parent = await folderOf(a.dept, input.parentId);
  if (input.id) {
    await folderOf(a.dept, input.id);
    // A folder cannot go inside itself or one of its own folders.
    for (let p = parent; p; p = await folderOf(a.dept, p.parent_id)) if (p.id === input.id) throw new WorkflowError("VALIDATION", "A folder cannot go inside itself.");
    await run("UPDATE dept_folders SET name = ?, parent_id = ? WHERE id = ?", name, parent?.id ?? null, input.id);
    return input.id;
  }
  if (await get("SELECT 1 AS x FROM dept_folders WHERE dept = ? AND name = ? AND parent_id IS NOT DISTINCT FROM ?", a.dept, name, parent?.id ?? null)) throw new WorkflowError("VALIDATION", `There is already a folder "${name}" here.`);
  const id = uid("fld_");
  await run("INSERT INTO dept_folders (id, dept, parent_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, a.dept, parent?.id ?? null, name, user.id, nowIso());
  return id;
}

// Deleting a folder keeps what is in it: its documents, files and folders move up to the folder above.
export async function deleteFolder(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d, "write");
  const f = await folderOf(a.dept, id);
  if (!f) return;
  await run("UPDATE dept_docs SET folder_id = ? WHERE folder_id = ?", f.parent_id, id);
  await run("UPDATE dept_folder_files SET folder_id = ? WHERE folder_id = ?", f.parent_id, id);
  await run("UPDATE dept_folders SET parent_id = ? WHERE parent_id = ?", f.parent_id, id);
  await run("DELETE FROM dept_folders WHERE id = ?", id);
  await audit({ actor: user }, { action: `${a.dept}.doc`, summary: `${user.name} removed the folder "${f.name}" (its contents moved up)` });
}

export async function moveItem(user: AppUser, d: string, input: { kind: "doc" | "file"; id: string; folderId: string | null }) {
  const a = await workAccess(user, d, "write");
  // Members move only their own documents and files, into folders they can reach.
  if (!fullAccess(a, user)) {
    const own = await get(`SELECT 1 AS x FROM ${input.kind === "doc" ? "dept_docs WHERE created_by" : "dept_folder_files WHERE uploaded_by"} = ? AND id = ?`, user.id, input.id);
    if (!own) throw new WorkflowError("FORBIDDEN", "Only heads and leads move what others made.");
    if (input.folderId && !(await memberScope(a, user)).folderOf?.(input.folderId)) throw new WorkflowError("FORBIDDEN", "That folder has not been shared with you.");
  }
  const f = await folderOf(a.dept, input.folderId);
  const r = await run(`UPDATE ${input.kind === "doc" ? "dept_docs" : "dept_folder_files"} SET folder_id = ? WHERE id = ? AND dept = ?`, f?.id ?? null, input.id, a.dept);
  if (!r.changes) throw new WorkflowError("NOT_FOUND", "Not found.");
}

export async function uploadFile(user: AppUser, d: string, input: { folderId: string | null; name: string; mime: string; base64: string }) {
  const a = await workAccess(user, d, "write");
  const f = await folderOf(a.dept, input.folderId);
  const name = clean(input.name, 160) || "file";
  const size = Math.floor((input.base64.length * 3) / 4);
  if (size > MAX_FILE) throw new WorkflowError("VALIDATION", "Files up to 15 MB.");
  const id = uid("dff_");
  await run("INSERT INTO dept_folder_files (id, dept, folder_id, name, mime, size, data, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, a.dept, f?.id ?? null, name, String(input.mime || "application/octet-stream").slice(0, 120), size, input.base64, user.id, nowIso());
  return id;
}

// A file, for someone it is shared with. View only: shown in the browser when it can be (images, PDF, text) and
// never as a download; requests from scraping tools are refused and reported.
export const VIEWABLE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)/;
export async function readFile(user: AppUser, id: string, meta: { download?: boolean; userAgent?: string | null; ip?: string | null } = {}) {
  const f = await get<{ dept: string; name: string; mime: string; data: string }>("SELECT dept, name, mime, data FROM dept_folder_files WHERE id = ?", id);
  if (!f) return null;
  const a = await workAccess(user, f.dept);
  const level = await itemLevel(user, a, "file", id, "view");
  // A scraping tool on something that may only be viewed is refused and reported.
  if (level === "view" && looksLikeScraper(meta.userAgent)) {
    await recordEvent(user, a.dept, { kind: "scraper_client", targetKind: "file", targetId: id, title: f.name, userAgent: meta.userAgent, ip: meta.ip });
    throw new WorkflowError("FORBIDDEN", "Open it in the app.");
  }
  if (level === "view" && (meta.download || !VIEWABLE.test(f.mime))) {
    await recordEvent(user, a.dept, { kind: "download_attempt", targetKind: "file", targetId: id, title: f.name, detail: "Download of a view-only file refused", userAgent: meta.userAgent, ip: meta.ip });
    throw new WorkflowError("FORBIDDEN", "You may only view this file in the app. Ask your team lead or head for download access.");
  }
  return { name: f.name, mime: f.mime, data: Buffer.from(f.data, "base64"), level };
}

export async function deleteFile(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d, "write");
  const f = await get<{ uploaded_by: string | null }>("SELECT uploaded_by FROM dept_folder_files WHERE id = ? AND dept = ?", id, a.dept);
  if (!f) return;
  if (f.uploaded_by !== user.id && !a.rights.deleteAll) throw new WorkflowError("FORBIDDEN", "Only whoever added it or a head deletes a file.");
  await run("DELETE FROM dept_folder_files WHERE id = ?", id);
}

export async function renameFile(user: AppUser, d: string, id: string, name: string) {
  const a = await workAccess(user, d, "write");
  const n = clean(name, 160);
  if (!n) throw new WorkflowError("VALIDATION", "Name the file.");
  await run("UPDATE dept_folder_files SET name = ? WHERE id = ? AND dept = ?", n, id, a.dept);
}

export async function togglePin(user: AppUser, d: string, docId: string) {
  const a = await workAccess(user, d);
  await itemLevel(user, a, "doc", docId, "view");
  if (await get("SELECT 1 AS x FROM dept_doc_pins WHERE doc_id = ? AND user_id = ?", docId, user.id)) {
    await run("DELETE FROM dept_doc_pins WHERE doc_id = ? AND user_id = ?", docId, user.id);
    return false;
  }
  await run("INSERT INTO dept_doc_pins (doc_id, user_id, created_at) VALUES (?, ?, ?)", docId, user.id, nowIso());
  return true;
}

export async function duplicateDoc(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d, "write");
  // A copy takes the text away, so it needs download access.
  await itemLevel(user, a, "doc", id, "download");
  const r = await get<{ kind: string; title: string; body: string; project_id: string | null; folder_id: string | null }>("SELECT kind, title, body, project_id, folder_id FROM dept_docs WHERE id = ? AND dept = ?", id, a.dept);
  if (!r) throw new WorkflowError("NOT_FOUND", "Document not found.");
  const nid = uid("doc_");
  const now = nowIso();
  await run("INSERT INTO dept_docs (id, dept, project_id, folder_id, kind, title, body, status, version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?)", nid, a.dept, r.project_id, r.folder_id, r.kind, `${r.title} (copy)`.slice(0, 160), r.body, user.id, now, now);
  return nid;
}

export async function searchLibrary(user: AppUser, d: string, q: string) {
  const a = await workAccess(user, d);
  const term = String(q ?? "").trim();
  if (term.length < 2) return { docs: [], files: [], folders: [] };
  const like = `%${term}%`;
  // Only what this person may see: a member's search never shows what was not shared with them.
  const scope = await memberScope(a, user);
  const docs = (await all<{ id: string; title: string; body: string; folder_id: string | null; created_by: string | null }>("SELECT id, title, body, folder_id, created_by FROM dept_docs WHERE dept = ? AND (title ILIKE ? OR body ILIKE ?) ORDER BY updated_at DESC LIMIT 200", a.dept, like, like))
    .filter((x) => scope.full || scope.item("doc", x.id, x.folder_id, x.created_by))
    .slice(0, 30);
  const files = (await all<{ id: string; name: string; folder_id: string | null; uploaded_by: string | null }>("SELECT id, name, folder_id, uploaded_by FROM dept_folder_files WHERE dept = ? AND name ILIKE ? ORDER BY name LIMIT 200", a.dept, like))
    .filter((x) => scope.full || scope.item("file", x.id, x.folder_id, x.uploaded_by))
    .slice(0, 30);
  const reach = scope.full ? null : scope.visibleFolders([...docs, ...files]);
  const folders = (await all<{ id: string; name: string }>("SELECT id, name FROM dept_folders WHERE dept = ? AND name ILIKE ? ORDER BY name LIMIT 100", a.dept, like)).filter((f) => !reach || reach.has(f.id)).slice(0, 20);
  const low = term.toLowerCase();
  return {
    docs: docs.map((x) => {
      const i = x.body.toLowerCase().indexOf(low);
      return { id: x.id, title: x.title, folderId: x.folder_id, snippet: i >= 0 ? `…${x.body.slice(Math.max(0, i - 60), i + 90).replace(/\s+/g, " ")}…` : null };
    }),
    files: files.map((f) => ({ id: f.id, name: f.name, folder_id: f.folder_id })),
    folders,
  };
}


// ---------------------------------------------------------------------------
// Import and export
// ---------------------------------------------------------------------------
// Documents are stored as Markdown. A Markdown or text file is stored exactly as it is; Word and web pages are
// turned into Markdown once, on import. The formatted view, PDF, HTML and Word come from that Markdown.

const xmlText = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const wordOn = (rpr: string, tag: string) => new RegExp(`<w:${tag}(?: w:val="(?!0"|false")[^"]*")?\\s*/>`).test(rpr);

// A Word paragraph's runs as Markdown: bold, italic and code-font text keep their marks, links keep their address.
function wordInline(xml: string, rels: Map<string, string>): string {
  const parts: { mark: string; text: string }[] = [];
  for (const m of xml.matchAll(/<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>|<w:r[ >][\s\S]*?<\/w:r>/g)) {
    if (m[1] !== undefined) {
      const text = wordInline(m[2]!, rels);
      const url = rels.get(m[1].match(/r:id="([^"]+)"/)?.[1] ?? "");
      parts.push({ mark: "", text: url && /^https?:\/\//.test(url) && text.trim() ? `[${text.trim()}](${url})` : text });
      continue;
    }
    const r = m[0];
    const rpr = r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
    const text = [...r.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map((x) => (x[0].startsWith("<w:tab") ? "\t" : x[0].startsWith("<w:br") ? "\n" : xmlText(x[1] ?? ""))).join("");
    if (!text) continue;
    const code = /w:(?:ascii|hAnsi)="(?:Consolas|Courier New|Courier|Menlo|Monaco)"/.test(rpr);
    const b = wordOn(rpr, "b");
    const i = wordOn(rpr, "i");
    const mark = code ? "`" : b && i ? "***" : b ? "**" : i ? "*" : "";
    const last = parts[parts.length - 1];
    if (last && last.mark === mark) last.text += text;
    else parts.push({ mark, text });
  }
  return parts
    .map(({ mark, text }) => {
      if (!mark || !text.trim()) return text;
      const lead = text.match(/^\s*/)![0];
      const trail = text.match(/\s*$/)![0];
      return `${lead}${mark}${text.trim()}${mark}${trail}`;
    })
    .join("");
}

// A Word file as Markdown: headings, paragraphs, bulleted and nested lists, tables, bold, italic, code and links.
export async function docxToText(data: Buffer | Uint8Array) {
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new WorkflowError("VALIDATION", "That Word file has no text.");
  const relsXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const rels = new Map(
    [...relsXml.matchAll(/<Relationship\b[^>]*>/g)]
      .map((m) => [m[0].match(/\bId="([^"]+)"/)?.[1] ?? "", xmlText(m[0].match(/\bTarget="([^"]+)"/)?.[1] ?? "")] as const)
      .filter(([id, target]) => id && target),
  );
  const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? xml;
  const blocks: { text: string; list: boolean }[] = [];
  const para = (p: string) => {
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const text = wordInline(p, rels).replace(/\s+$/, "");
    if (!text.trim()) return null;
    const level = style === "Title" ? 1 : Number(style.match(/^[Hh]eading\s*([1-6])$/)?.[1] ?? 0);
    if (level) return { text: `${"#".repeat(Math.min(6, level))} ${text.trim().replace(/^\*\*(.*)\*\*$/, "$1")}`, list: false };
    if (/<w:numPr>/.test(p) || /^List/i.test(style)) {
      const depth = Number(p.match(/<w:ilvl w:val="(\d)"/)?.[1] ?? 0);
      return { text: `${"  ".repeat(Math.min(4, depth))}- ${text.trim()}`, list: true };
    }
    return { text, list: false };
  };
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const el = m[0];
    if (el.startsWith("<w:tbl>")) {
      const rows = [...el.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) =>
        [...r[0].matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)].map((c) =>
          (c[0].match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [])
            .map((p) => wordInline(p, rels).trim())
            .filter(Boolean)
            .join(" ")
            .replace(/\|/g, "\\|")
            .replace(/\s*\n\s*/g, " "),
        ),
      );
      const cols = Math.max(0, ...rows.map((r) => r.length));
      if (!cols) continue;
      const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] || " ").join(" | ")} |`;
      // A header row is bold already in Markdown, so a bold header cell loses its marks.
      const head = rows[0]!.map((c) => c.replace(/^\*\*(.+)\*\*$/, "$1"));
      blocks.push({ text: [line(head), `|${" --- |".repeat(cols)}`, ...rows.slice(1).map(line)].join("\n"), list: false });
      continue;
    }
    const b = para(el);
    if (b) blocks.push(b);
  }
  let out = "";
  blocks.forEach((b, i) => (out += i === 0 ? b.text : `${b.list && blocks[i - 1]!.list ? "\n" : "\n\n"}${b.text}`));
  return out.trim();
}

const decodeHtml = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const stripTags = (s: string) => decodeHtml(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

// A web page as Markdown: headings, paragraphs, lists, tables, code, bold, italic and links.
export function htmlToMarkdown(html: string) {
  let s = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>|<!--[\s\S]*?-->/gi, "");
  const code: string[] = [];
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t: string) => `\n\n\u0000${code.push(decodeHtml(t.replace(/<[^>]+>/g, "")).replace(/\n+$/, "")) - 1}\u0000\n\n`);
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t: string) => (stripTags(t) ? `**${stripTags(t)}**` : ""));
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t: string) => (stripTags(t) ? `*${stripTags(t)}*` : ""));
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, t: string) => `\`${stripTags(t)}\``);
  s = s.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h: string, t: string) => (/^(https?:|mailto:)/i.test(h) && stripTags(t) ? `[${stripTags(t)}](${h})` : stripTags(t)));
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (t) => {
    const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => stripTags(c[1]!).replace(/\|/g, "\\|")));
    const cols = Math.max(0, ...rows.map((r) => r.length));
    if (!cols) return "";
    const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] || " ").join(" | ")} |`;
    return `\n\n${[line(rows[0]!), `|${" --- |".repeat(cols)}`, ...rows.slice(1).map(line)].join("\n")}\n\n`;
  });
  s = s
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t: string) => `\n\n${"#".repeat(Number(n))} ${stripTags(t)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t: string) => `\n- ${stripTags(t)}`)
    .replace(/<\/(ul|ol)>/gi, "\n\n")
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t: string) => `\n\n> ${stripTags(t)}\n\n`)
    .replace(/<hr\s*\/?>/gi, "\n\n---\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return decodeHtml(s)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\u0000(\d+)\u0000/g, (_, i) => `\`\`\`\n${code[Number(i)]}\n\`\`\``)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function importDocument(user: AppUser, d: string, input: { folderId: string | null; name: string; base64: string }) {
  const a = await workAccess(user, d, "write");
  const f = await folderOf(a.dept, input.folderId);
  const data = Buffer.from(input.base64, "base64");
  if (data.length > MAX_FILE) throw new WorkflowError("VALIDATION", "Files up to 15 MB.");
  const ext = input.name.toLowerCase().split(".").pop() ?? "";
  let body: string;
  if (ext === "docx") body = await docxToText(data);
  // Markdown and text are kept exactly as written (only a byte-order mark is dropped and line endings made \n).
  else if (ext === "md" || ext === "txt" || ext === "markdown") body = data.toString("utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  else if (ext === "html" || ext === "htm") body = htmlToMarkdown(data.toString("utf8"));
  else throw new WorkflowError("VALIDATION", "Import a Word (.docx), Markdown (.md), text (.txt) or web page (.html) file. Other files can be added as files.");
  if (body.length > DOC_MAX_CHARS) throw new WorkflowError("VALIDATION", `That document is ${body.length.toLocaleString("en")} characters; documents hold up to ${DOC_MAX_CHARS.toLocaleString("en")}. Split it, or add it as a file.`);
  const fileTitle = clean(input.name.replace(/\.[^.]+$/, ""), 160) || "Imported document";
  // A Markdown file names itself ("title:" at the top, or one "# Title" on its first line); otherwise the file name.
  const title = (ext === "md" || ext === "markdown" ? markdownTitle(body) : null) ?? fileTitle;
  const id = uid("doc_");
  const now = nowIso();
  await run("INSERT INTO dept_docs (id, dept, folder_id, kind, title, body, status, version, created_by, created_at, updated_at) VALUES (?, ?, ?, 'note', ?, ?, 'draft', 1, ?, ?, ?)", id, a.dept, f?.id ?? null, title, body, user.id, now, now);
  await audit({ actor: user }, { action: `${a.dept}.doc`, summary: `${user.name} imported "${input.name}" as a document` });
  return id;
}

type Run = TextRun | ExternalHyperlink;
// Inline **bold**, *italic*, `code` and [links](https://...) in a line, as Word runs.
function runs(text: string, base: { bold?: boolean; color?: string } = {}): Run[] {
  const out: Run[] = [];
  const re = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("[")) {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      if (/^https?:\/\//i.test(href!)) out.push(new ExternalHyperlink({ link: href!, children: [new TextRun({ text: label!, style: "Hyperlink", color: "1A5FD0", underline: {} })] }));
      else out.push(new TextRun({ text: label!, ...base }));
    } else if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), ...base, bold: true }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: "Consolas", size: 20, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F3F4" } }));
    else out.push(new TextRun({ text: t.slice(1, -1), ...base, italics: true }));
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const BRAND = "074924";
const RULE = "D9DDE3";
type DocxMeta = { workspace: string; subtitle: string; ref?: string; kindLabel?: string; version?: number; statusLabel?: string; author?: string | null; updatedAt?: string | null; project?: string | null; source?: string | null; logo?: { data: Buffer; type: "png" | "jpg" } | null };

// The document (headings, lists, task lists, numbered lists, quotes and callouts, code blocks, tables, rules, bold,
// italic, code and links) as a Word file in the company format: the name and logo at the top, the document's
// control table, and the name, title and page numbers in the footer.
export async function markdownToDocx(title: string, markdown: string, meta: DocxMeta) {
  const { meta: front, body: withoutFront } = splitFrontMatter(markdown);
  let body = withoutFront;
  const first = body.match(/^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/);
  if (first && first[1]!.replace(/[*_`]/g, "").trim().toLowerCase() === title.trim().toLowerCase()) body = body.slice(first[0].length);
  const cellBorders = { top: { style: BorderStyle.SINGLE, size: 4, color: RULE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE }, left: { style: BorderStyle.SINGLE, size: 4, color: RULE }, right: { style: BorderStyle.SINGLE, size: 4, color: RULE } };
  const control = [
    ["Document", meta.ref ?? ""],
    ["Kind", meta.kindLabel ?? ""],
    ["Version", meta.version ? `${meta.version} (${meta.statusLabel ?? ""})` : ""],
    ["Owner", meta.author ?? ""],
    ["Project", meta.project ?? ""],
    ["Last updated", (meta.updatedAt ?? "").slice(0, 10)],
    ["Source", meta.source ? `${meta.source} (kept in step with the repository)` : ""],
    ...Object.entries(front).filter(([k]) => !/^title$/i.test(k)).map(([k, v]) => [k[0]!.toUpperCase() + k.slice(1), v]),
  ].filter(([, v]) => v);
  const children: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: (meta.kindLabel ?? "Document").toUpperCase(), color: BRAND, bold: true, size: 18, characterSpacing: 30 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 200 }, children: [new TextRun({ text: title, bold: true, size: 48, color: "1F2328" })] }),
  ];
  if (control.length)
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: control.map(([k, v]) => new TableRow({ children: [new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, borders: cellBorders, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F5F6F8" }, children: [new Paragraph({ children: [new TextRun({ text: k!, bold: true, size: 18, color: "5F6B7A" })] })] }), new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: v!, size: 18 })] })] })] })),
      }),
      new Paragraph({ text: "", spacing: { after: 200 } }),
    );
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\s*(```|~~~)/.test(l)) {
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*(```|~~~)/.test(lines[i]!); i++) code.push(lines[i]!);
      children.push(new Paragraph({ spacing: { before: 80, after: 120 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: RULE, space: 8 } }, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F5F6F8" }, children: code.flatMap((c, n) => [new TextRun({ text: c || " ", font: "Consolas", size: 18, break: n ? 1 : 0 })]) }));
      continue;
    }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      for (; i < lines.length && /^\|.*\|\s*$/.test(lines[i]!); i++) if (!/^\|[\s:|-]+\|\s*$/.test(lines[i]!)) rows.push(lines[i]!.trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|")));
      i--;
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((r, ri) => new TableRow({ tableHeader: ri === 0, children: r.map((c) => new TableCell({ borders: cellBorders, shading: ri === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "E8F2EC" } : undefined, children: [new Paragraph({ children: runs(c, ri === 0 ? { bold: true } : {}) })] })) })) }));
      children.push(new Paragraph({ text: "" }));
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const n = h[1]!.length;
      const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][n - 1]!;
      children.push(new Paragraph({ heading, spacing: { before: n === 1 ? 320 : 240, after: 100 }, border: n === 1 ? { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 4 } } : undefined, children: [new TextRun({ text: h[2]!.replace(/[*`]/g, ""), bold: true, color: n <= 2 ? BRAND : "1F2328" })] }));
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      children.push(new Paragraph({ text: "", border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 1 } }, spacing: { after: 160 } }));
      continue;
    }
    const q = l.match(/^\s*>\s?(.*)$/);
    if (q) {
      const quote: string[] = [q[1]!];
      for (; i + 1 < lines.length && /^\s*>/.test(lines[i + 1]!); i++) quote.push(lines[i + 1]!.replace(/^\s*>\s?/, ""));
      const alert = quote[0]!.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (alert) quote[0] = alert[2]!;
      const text = quote.filter((x, n) => n > 0 || x.trim());
      children.push(new Paragraph({ indent: { left: 240 }, spacing: { before: 80, after: 120 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: alert ? ({ note: "2F80ED", tip: "1F9D55", important: "7B68EE", warning: "C27B00", caution: "E2445C" } as Record<string, string>)[alert[1]!.toLowerCase()]! : BRAND, space: 10 } }, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F5F6F8" }, children: [...(alert ? [new TextRun({ text: `${alert[1]!.toUpperCase()}  `, bold: true, size: 16, color: "5F6B7A" })] : []), ...text.flatMap((x, n) => (n ? [new TextRun({ text: "", break: 1 }), ...runs(x)] : runs(x)))] }));
      continue;
    }
    const task = l.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      children.push(new Paragraph({ indent: { left: 360 + Math.min(3, Math.floor(task[1]!.length / 2)) * 360, hanging: 300 }, children: [new TextRun({ text: task[2] === " " ? "[  ]  " : "[x]  ", font: "Consolas", color: BRAND }), ...runs(task[3]!)] }));
      continue;
    }
    const b = l.match(/^(\s*)[-*+•]\s+(.*)$/);
    if (b) {
      children.push(new Paragraph({ bullet: { level: Math.min(3, Math.floor(b[1]!.length / 2)) }, children: runs(b[2]!) }));
      continue;
    }
    const n = l.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (n) {
      children.push(new Paragraph({ indent: { left: 360 + Math.min(3, Math.floor(n[1]!.length / 2)) * 360, hanging: 360 }, children: [new TextRun({ text: `${n[2]}. `, bold: true, color: BRAND }), ...runs(n[3]!)] }));
      continue;
    }
    children.push(l.trim() ? new Paragraph({ spacing: { after: 100 }, children: runs(l.replace(/ {2}$/, "")) }) : new Paragraph({ text: "" }));
  }
  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 4 } },
        children: [...(meta.logo ? [new ImageRun({ type: meta.logo.type, data: meta.logo.data, transformation: { width: 22, height: 22 } }), new TextRun({ text: "  " })] : []), new TextRun({ text: meta.workspace, bold: true, color: BRAND, size: 18 }), new TextRun({ text: `\t${meta.ref ?? ""}${meta.version ? ` · v${meta.version}` : ""}`, color: "5F6B7A", size: 16 })],
        tabStops: [{ type: TabStopType.RIGHT, position: 9600 }],
      }),
    ],
  });
  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9600 }],
        children: [new TextRun({ text: `${meta.workspace} · ${title} · Internal document`, color: "7A8594", size: 16 }), new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], color: "7A8594", size: 16 })],
      }),
    ],
  });
  const doc = new Document({
    creator: meta.workspace,
    title,
    description: meta.subtitle,
    styles: { default: { document: { run: { font: "Calibri", size: 22, color: "1F2328" }, paragraph: { spacing: { line: 300 } } } } },
    sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1150, right: 1150 } } }, headers: { default: header }, footers: { default: footer }, children }],
  });
  return Packer.toBuffer(doc);
}

// The site's logo for documents that leave the app: as a data address for HTML, and as an image for Word (PNG or
// JPEG only; an SVG logo is left out of Word, which cannot show it without a picture beside it).
async function documentLogo() {
  const img = await (await import("./identity")).identityImage("logo").catch(() => null);
  if (img) return { uri: `data:${img.mime};base64,${Buffer.from(img.data).toString("base64")}`, word: /png/.test(img.mime) ? { data: Buffer.from(img.data), type: "png" as const } : /jpe?g/.test(img.mime) ? { data: Buffer.from(img.data), type: "jpg" as const } : null };
  const svg = await import("node:fs/promises").then((fs) => fs.readFile(`${process.cwd()}/public/brand/myseed-logo.svg`)).catch(() => null);
  return { uri: svg ? `data:image/svg+xml;base64,${svg.toString("base64")}` : null, word: null };
}

export async function exportDoc(user: AppUser, d: string, id: string, format: "docx" | "md" | "html", meta: { userAgent?: string | null; ip?: string | null } = {}) {
  const a = await workAccess(user, d);
  // Exports take the document away: download access. A scraping tool on a view-only document is reported as such.
  if ((await itemLevel(user, a, "doc", id, "view")) === "view" && looksLikeScraper(meta.userAgent)) {
    await recordEvent(user, a.dept, { kind: "scraper_client", targetKind: "doc", targetId: id, title: (await get<{ title: string }>("SELECT title FROM dept_docs WHERE id = ?", id))?.title ?? null, userAgent: meta.userAgent, ip: meta.ip });
    throw new WorkflowError("FORBIDDEN", "Open it in the app.");
  }
  await itemLevel(user, a, "doc", id, "download");
  const r = await get<{ title: string; body: string; kind: string; version: number; status: string; updated_at: string; approved_at: string | null; reviewers: string; approvals: string; project: string | null; author: string | null; source: string | null }>(
    `SELECT x.title, x.body, x.kind, x.version, x.status, x.updated_at, x.approved_at, x.reviewers, x.approvals, p.name AS project, u.name AS author, s.source
     FROM dept_docs x LEFT JOIN dept_projects p ON p.id = x.project_id LEFT JOIN users u ON u.id = x.created_by LEFT JOIN dept_doc_sources s ON s.doc_id = x.id
     WHERE x.id = ? AND x.dept = ?`,
    id,
    a.dept,
  );
  if (!r) throw new WorkflowError("NOT_FOUND", "Document not found.");
  const workspace = (await (await import("./settings")).getSettings()).workspace.name || "Myseed";
  const kindLabel = DOC_KINDS.find((k) => k.key === r.kind)?.label ?? "Document";
  const statusLabel = DOC_STATUS_LABELS[r.status] ?? r.status;
  const subtitle = `${kindLabel} · version ${r.version} · ${statusLabel}`;
  const base = r.title.replace(/[^\w\- ]+/g, "").trim() || "document";
  const author = r.author ?? (r.source ? "Repository" : null);
  const ref = docRef(a.dept, r.kind, id);
  // Markdown leaves as it is stored, with the title on top only when the text does not already start with it.
  if (format === "md") {
    const { meta, body } = splitFrontMatter(r.body);
    const first = body.match(/^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/)?.[1]?.replace(/[*_`]/g, "").trim().toLowerCase();
    const named = !!meta.title || first === r.title.trim().toLowerCase();
    const text = named ? r.body : `# ${r.title}\n\n${r.body}`;
    return { name: `${base}.md`, mime: "text/markdown; charset=utf-8", data: Buffer.from(text.endsWith("\n") ? text : `${text}\n`, "utf8") };
  }
  const logo = await documentLogo();
  if (format === "html") {
    const reviewers = parseJson<string[]>(r.reviewers, []);
    const approvals = parseJson<{ by: string }[]>(r.approvals, []);
    const names = new Map((await all<{ id: string; name: string }>(`SELECT id, name FROM users WHERE id IN (${reviewers.map(() => "?").join(",") || "''"})`, ...reviewers)).map((u) => [u.id, u.name]));
    const html = specDocumentHtml({ workspace, logoUrl: logo.uri, title: r.title, kindLabel, ref, version: Number(r.version), status: r.status, statusLabel, author, updatedAt: r.updated_at, approvedAt: r.approved_at, project: r.project, reviewers: reviewers.map((x) => ({ name: names.get(x) ?? "Someone", approved: approvals.some((p) => p.by === x) })), source: r.source, body: r.body });
    return { name: `${base}.html`, mime: "text/html; charset=utf-8", data: Buffer.from(html, "utf8") };
  }
  return { name: `${base}.docx`, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: await markdownToDocx(r.title, r.body, { workspace, subtitle, ref, kindLabel, version: Number(r.version), statusLabel, author, updatedAt: r.updated_at, project: r.project, source: r.source, logo: logo.word }) };
}
