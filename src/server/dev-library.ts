// The department's document library (Phase 26): folders inside folders, documents and any files (designs, PDFs,
// spreadsheets, exports) in them, search through titles, text and file names, pins, recent documents, duplicating,
// moving, importing a Word, Markdown, text or HTML file as a document, and exporting a document as Word (.docx),
// Markdown or HTML. Rights are the department's: everyone who sees it reads; writers change; the author or a head
// deletes.

import JSZip from "jszip";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { all, get, nowIso, run, uid } from "./db";
import { workAccess } from "./dept-config";
import { audit, WorkflowError } from "./workflow";
import type { AppUser } from "./users";
import { DOC_KINDS, DOC_STATUS_LABELS } from "@/lib/dev-docs";

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
  const folders = await all<{ id: string; parent_id: string | null; name: string }>("SELECT id, parent_id, name FROM dept_folders WHERE dept = ? ORDER BY name", a.dept);
  const counts = await all<{ folder_id: string | null; docs: number }>("SELECT folder_id, COUNT(*) AS docs FROM dept_docs WHERE dept = ? GROUP BY folder_id", a.dept);
  const fcounts = await all<{ folder_id: string | null; files: number }>("SELECT folder_id, COUNT(*) AS files FROM dept_folder_files WHERE dept = ? GROUP BY folder_id", a.dept);
  const current = folderId ? (folders.find((f) => f.id === folderId) ?? null) : null;
  const path: { id: string; name: string }[] = [];
  for (let f = current; f; f = folders.find((x) => x.id === f!.parent_id) ?? null) path.unshift({ id: f.id, name: f.name });
  const docs = await all<{ id: string; kind: string; title: string; status: string; version: number; updated_at: string; author: string | null; pinned: number }>(
    `SELECT x.id, x.kind, x.title, x.status, x.version, x.updated_at, u.name AS author, CASE WHEN p.doc_id IS NULL THEN 0 ELSE 1 END AS pinned
     FROM dept_docs x LEFT JOIN users u ON u.id = x.created_by LEFT JOIN dept_doc_pins p ON p.doc_id = x.id AND p.user_id = ?
     WHERE x.dept = ? AND ${current ? "x.folder_id = ?" : "x.folder_id IS NULL"} ORDER BY x.title`,
    user.id,
    a.dept,
    ...(current ? [current.id] : []),
  );
  const files = await all<{ id: string; name: string; mime: string; size: number; created_at: string; by: string | null }>(
    `SELECT f.id, f.name, f.mime, f.size, f.created_at, u.name AS by FROM dept_folder_files f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.dept = ? AND ${current ? "f.folder_id = ?" : "f.folder_id IS NULL"} ORDER BY f.name`,
    a.dept,
    ...(current ? [current.id] : []),
  );
  const pins = await all<{ id: string; title: string; folder_id: string | null }>("SELECT x.id, x.title, x.folder_id FROM dept_doc_pins p JOIN dept_docs x ON x.id = p.doc_id WHERE p.user_id = ? AND x.dept = ? ORDER BY x.title", user.id, a.dept);
  const recent = await all<{ id: string; title: string; updated_at: string }>("SELECT id, title, updated_at FROM dept_docs WHERE dept = ? ORDER BY updated_at DESC LIMIT 6", a.dept);
  return {
    folder: current ? { id: current.id, name: current.name, parentId: current.parent_id } : null,
    path,
    tree: folders.map((f) => ({ id: f.id, parentId: f.parent_id, name: f.name, docs: Number(counts.find((c) => c.folder_id === f.id)?.docs ?? 0), files: Number(fcounts.find((c) => c.folder_id === f.id)?.files ?? 0) })) as Folder[],
    subfolders: folders.filter((f) => f.parent_id === (current?.id ?? null)).map((f) => ({ id: f.id, name: f.name })),
    docs: docs.map((x) => ({ id: x.id, kind: x.kind, kindLabel: DOC_KINDS.find((k) => k.key === x.kind)?.label ?? "Document", title: x.title, status: DOC_STATUS_LABELS[x.status] ?? x.status, version: Number(x.version), updatedAt: x.updated_at, author: x.author, pinned: !!Number(x.pinned) })),
    files: files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: Number(f.size), createdAt: f.created_at, by: f.by })),
    pins: pins.map((p) => ({ id: p.id, title: p.title })),
    recent: recent.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at })),
    canWrite: !a.readOnly,
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

export async function readFile(user: AppUser, id: string) {
  const f = await get<{ dept: string; name: string; mime: string; data: string }>("SELECT dept, name, mime, data FROM dept_folder_files WHERE id = ?", id);
  if (!f) return null;
  await workAccess(user, f.dept);
  return { name: f.name, mime: f.mime, data: Buffer.from(f.data, "base64") };
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
  if (!(await get("SELECT 1 AS x FROM dept_docs WHERE id = ? AND dept = ?", docId, a.dept))) throw new WorkflowError("NOT_FOUND", "Document not found.");
  if (await get("SELECT 1 AS x FROM dept_doc_pins WHERE doc_id = ? AND user_id = ?", docId, user.id)) {
    await run("DELETE FROM dept_doc_pins WHERE doc_id = ? AND user_id = ?", docId, user.id);
    return false;
  }
  await run("INSERT INTO dept_doc_pins (doc_id, user_id, created_at) VALUES (?, ?, ?)", docId, user.id, nowIso());
  return true;
}

export async function duplicateDoc(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d, "write");
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
  const docs = await all<{ id: string; title: string; body: string; folder_id: string | null }>("SELECT id, title, body, folder_id FROM dept_docs WHERE dept = ? AND (title ILIKE ? OR body ILIKE ?) ORDER BY updated_at DESC LIMIT 30", a.dept, like, like);
  const low = term.toLowerCase();
  return {
    docs: docs.map((x) => {
      const i = x.body.toLowerCase().indexOf(low);
      return { id: x.id, title: x.title, folderId: x.folder_id, snippet: i >= 0 ? `…${x.body.slice(Math.max(0, i - 60), i + 90).replace(/\s+/g, " ")}…` : null };
    }),
    files: await all<{ id: string; name: string; folder_id: string | null }>("SELECT id, name, folder_id FROM dept_folder_files WHERE dept = ? AND name ILIKE ? ORDER BY name LIMIT 30", a.dept, like),
    folders: await all<{ id: string; name: string }>("SELECT id, name FROM dept_folders WHERE dept = ? AND name ILIKE ? ORDER BY name LIMIT 20", a.dept, like),
  };
}

// ---------------------------------------------------------------------------
// Import and export
// ---------------------------------------------------------------------------

// A Word file's text, with its headings and lists, as the app's plain text with "#" headings and "- " lists.
export async function docxToText(data: Buffer | Uint8Array) {
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new WorkflowError("VALIDATION", "That Word file has no text.");
  const out: string[] = [];
  for (const p of xml.split(/<\/w:p>/)) {
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const text = [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map((m) => (m[1] === undefined ? "\t" : m[1])).join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    const level = style === "Title" ? 1 : Number(style.match(/^[Hh]eading\s*([1-6])$/)?.[1] ?? 0);
    if (!text.trim()) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (level) out.push(`${"#".repeat(Math.min(3, level))} ${text.trim()}`);
    else if (/<w:numPr>/.test(p)) out.push(`- ${text.trim()}`);
    else out.push(text);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const htmlToText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n${"#".repeat(Number(n))} ${t.replace(/<[^>]+>/g, "").trim()}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${t.replace(/<[^>]+>/g, "").trim()}`)
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function importDocument(user: AppUser, d: string, input: { folderId: string | null; name: string; base64: string }) {
  const a = await workAccess(user, d, "write");
  const f = await folderOf(a.dept, input.folderId);
  const data = Buffer.from(input.base64, "base64");
  if (data.length > MAX_FILE) throw new WorkflowError("VALIDATION", "Files up to 15 MB.");
  const ext = input.name.toLowerCase().split(".").pop() ?? "";
  let body: string;
  if (ext === "docx") body = await docxToText(data);
  else if (ext === "md" || ext === "txt" || ext === "markdown") body = data.toString("utf8");
  else if (ext === "html" || ext === "htm") body = htmlToText(data.toString("utf8"));
  else throw new WorkflowError("VALIDATION", "Import a Word (.docx), Markdown (.md), text (.txt) or web page (.html) file. Other files can be added as files.");
  const title = clean(input.name.replace(/\.[^.]+$/, ""), 160) || "Imported document";
  const id = uid("doc_");
  const now = nowIso();
  await run("INSERT INTO dept_docs (id, dept, folder_id, kind, title, body, status, version, created_by, created_at, updated_at) VALUES (?, ?, ?, 'note', ?, ?, 'draft', 1, ?, ?, ?)", id, a.dept, f?.id ?? null, title, body.slice(0, 200_000), user.id, now, now);
  await audit({ actor: user }, { action: `${a.dept}.doc`, summary: `${user.name} imported "${input.name}" as a document` });
  return id;
}

// Inline **bold**, *italic* and `code` in a line, as Word runs.
function runs(text: string, base: { font?: string } = {}) {
  const out: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: "Consolas", shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F3F4" } }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

// The document's text (headings, lists, numbered lists, code blocks, tables, bold, italic, code) as a Word file.
export async function markdownToDocx(title: string, body: string, meta: { workspace: string; subtitle: string }) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: meta.workspace, color: "0B7A3B", bold: true, size: 22 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, bold: true, size: 44 })] }),
    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: meta.subtitle, color: "6B7280", size: 20 })] }),
  ];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^```/.test(l)) {
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]!); i++) code.push(lines[i]!);
      children.push(new Paragraph({ shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F3F4" }, children: code.flatMap((c, n) => [new TextRun({ text: c, font: "Consolas", size: 19, break: n ? 1 : 0 })]) }));
      continue;
    }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      for (; i < lines.length && /^\|.*\|\s*$/.test(lines[i]!); i++) if (!/^\|[\s:|-]+\|\s*$/.test(lines[i]!)) rows.push(lines[i]!.trim().slice(1, -1).split("|").map((c) => c.trim()));
      i--;
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((r, ri) => new TableRow({ tableHeader: ri === 0, children: r.map((c) => new TableCell({ shading: ri === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "E6F4EA" } : undefined, children: [new Paragraph({ children: runs(c, ri === 0 ? {} : {}) })] })) })) }));
      children.push(new Paragraph({ text: "" }));
      continue;
    }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      children.push(new Paragraph({ heading: h[1]!.length === 1 ? HeadingLevel.HEADING_1 : h[1]!.length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: h[2]!, bold: true, color: "0B7A3B" })] }));
      continue;
    }
    const b = l.match(/^\s*[-*•]\s+(.*)$/);
    if (b) {
      children.push(new Paragraph({ bullet: { level: /^\s{2,}/.test(l) ? 1 : 0 }, children: runs(b[1]!) }));
      continue;
    }
    const n = l.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (n) {
      children.push(new Paragraph({ indent: { left: 360, hanging: 360 }, children: [new TextRun({ text: `${n[1]}. ` }), ...runs(n[2]!)] }));
      continue;
    }
    children.push(l.trim() ? new Paragraph({ spacing: { after: 100 }, children: runs(l) }) : new Paragraph({ text: "" }));
  }
  const doc = new Document({ creator: meta.workspace, title, styles: { default: { document: { run: { font: "Calibri", size: 22 } } } }, sections: [{ properties: {}, children: [...children, new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 400 }, children: [new TextRun({ text: `${meta.workspace} · ${new Date().toISOString().slice(0, 10)}`, color: "9AA0A6", size: 16 })] })] }] });
  return Packer.toBuffer(doc);
}

export async function exportDoc(user: AppUser, d: string, id: string, format: "docx" | "md" | "html") {
  const a = await workAccess(user, d);
  const r = await get<{ title: string; body: string; kind: string; version: number; status: string }>("SELECT title, body, kind, version, status FROM dept_docs WHERE id = ? AND dept = ?", id, a.dept);
  if (!r) throw new WorkflowError("NOT_FOUND", "Document not found.");
  const workspace = (await (await import("./settings")).getSettings()).workspace.name || "Myseed";
  const subtitle = `${DOC_KINDS.find((k) => k.key === r.kind)?.label ?? "Document"} · version ${r.version} · ${DOC_STATUS_LABELS[r.status] ?? r.status}`;
  const base = r.title.replace(/[^\w\- ]+/g, "").trim() || "document";
  if (format === "md") return { name: `${base}.md`, mime: "text/markdown; charset=utf-8", data: Buffer.from(`# ${r.title}\n\n_${subtitle}_\n\n${r.body}\n`, "utf8") };
  if (format === "html") {
    const { marked } = await import("marked");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${r.title.replace(/</g, "&lt;")}</title><style>body{font-family:Calibri,Arial,sans-serif;max-width:46rem;margin:2rem auto;line-height:1.5;color:#1f2937}h1,h2,h3{color:#0B7A3B}code,pre{background:#f1f3f4}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body><p style="color:#0B7A3B;font-weight:bold">${workspace}</p><h1>${r.title.replace(/</g, "&lt;")}</h1><p style="color:#6b7280">${subtitle}</p>${await marked.parse(r.body.replace(/</g, "&lt;"))}</body></html>`;
    return { name: `${base}.html`, mime: "text/html; charset=utf-8", data: Buffer.from(html, "utf8") };
  }
  return { name: `${base}.docx`, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: await markdownToDocx(r.title, r.body, { workspace, subtitle }) };
}
