// The project's own documentation, kept in the department's library: the Markdown files listed in
// docs/library.json become documents in the folders named there (Dev team, Specs and docs), and follow the files
// when they change. Runs once when the server starts (src/instrumentation.ts) and with `npm run docs:sync`.
//
// The repository is the source, but people in the app always win:
// - a new file becomes a draft document (version 1) in its folder, the folders made as needed;
// - a changed file updates its document, if nobody has edited it in the app since. A document in review or
//   approved keeps that version in its history and the new text starts a new version, as an edit in the app does;
// - a document edited in the app is no longer overwritten (the app's text is kept, and reported);
// - a document someone deleted stays deleted; a document someone moved stays where they put it.
// The text is stored exactly as in the file (Markdown), so the formatted view, PDF and Word come from the original.

import crypto from "node:crypto";
import { get, nowIso, run, tx, uid } from "./db";
import { audit } from "./workflow";
import { DOC_KINDS, DOC_MAX_CHARS } from "@/lib/dev-docs";
import { markdownTitle } from "@/lib/spec-doc";

export type LibraryManifest = {
  dept?: string;
  // Top-level folders shared once with the whole department to read (view only), such as the team's handbook.
  shareWithTeam?: string[];
  documents: { file: string; folder?: string; kind?: string; title?: string }[];
};

export type SyncResult = { dept: string; added: string[]; updated: string[]; keptEdited: string[]; unchanged: number; problems: string[] };

const hash = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

async function folderPath(dept: string, folder: string | undefined) {
  let parent: string | null = null;
  for (const raw of (folder ?? "").split("/")) {
    const name = raw.replace(/[\\:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 80);
    if (!name) continue;
    const found: { id: string } | undefined = await get<{ id: string }>("SELECT id FROM dept_folders WHERE dept = ? AND name = ? AND parent_id IS NOT DISTINCT FROM ?", dept, name, parent);
    if (found) parent = found.id;
    else {
      const id = uid("fld_");
      await run("INSERT INTO dept_folders (id, dept, parent_id, name, created_by, created_at) VALUES (?, ?, ?, ?, NULL, ?)", id, dept, parent, name, nowIso());
      parent = id;
    }
  }
  return parent;
}

export async function syncRepoDocs(opts: { root?: string; manifest?: string } = {}): Promise<SyncResult> {
  // The files are read at run time from the server's folder. They are not part of the build, so the bundler is told
  // not to follow these reads (it would otherwise trace every file in the project into the server output).
  const fs = (await import(/* turbopackIgnore: true */ "node:fs/promises")) as typeof import("node:fs/promises");
  const path = (await import(/* turbopackIgnore: true */ "node:path")) as typeof import("node:path");
  const root = opts.root ?? process.cwd();
  const manifestFile = path.join(root, opts.manifest ?? path.join("docs", "library.json"));
  const result: SyncResult = { dept: "dev", added: [], updated: [], keptEdited: [], unchanged: 0, problems: [] };
  let manifest: LibraryManifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")) as LibraryManifest;
  } catch {
    // No manifest (a build without the docs, such as the desktop edition): nothing to do.
    return result;
  }
  const dept = String(manifest.dept || "dev").toLowerCase();
  result.dept = dept;
  for (const entry of manifest.documents ?? []) {
    const source = String(entry.file ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
    if (!/\.(md|markdown)$/i.test(source) || source.startsWith("/") || source.split("/").includes("..")) {
      result.problems.push(`${source || "(no file)"}: only Markdown files inside the repository`);
      continue;
    }
    const kind = DOC_KINDS.some((k) => k.key === entry.kind) ? entry.kind! : "note";
    let text: string;
    try {
      text = (await fs.readFile(path.join(root, source), "utf8")).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    } catch {
      result.problems.push(`${source}: not found`);
      continue;
    }
    if (text.length > DOC_MAX_CHARS) {
      result.problems.push(`${source}: longer than ${DOC_MAX_CHARS} characters`);
      continue;
    }
    const fileHash = hash(text);
    const title = (entry.title?.trim() || markdownTitle(text) || path.basename(source).replace(/\.[^.]+$/, "")).slice(0, 160);
    await tx(async () => {
      const now = nowIso();
      const row = await get<{ doc_id: string; file_hash: string; body_hash: string; title: string }>("SELECT doc_id, file_hash, body_hash, title FROM dept_doc_sources WHERE dept = ? AND source = ?", dept, source);
      if (!row) {
        const id = uid("doc_");
        // The file is claimed first, so two servers starting together cannot both add it.
        const claimed = await run("INSERT INTO dept_doc_sources (dept, source, doc_id, file_hash, body_hash, title, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING", dept, source, id, fileHash, fileHash, title, now);
        if (!claimed.changes) return;
        const folder = await folderPath(dept, entry.folder);
        await run("INSERT INTO dept_docs (id, dept, folder_id, kind, title, body, status, version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, NULL, ?, ?)", id, dept, folder, kind, title, text, now, now);
        result.added.push(source);
        return;
      }
      if (row.file_hash === fileHash) {
        result.unchanged++;
        return;
      }
      const doc = await get<{ title: string; body: string; status: string; version: number }>("SELECT title, body, status, version FROM dept_docs WHERE id = ?", row.doc_id);
      if (!doc) {
        // Deleted in the app: it stays deleted.
        await run("UPDATE dept_doc_sources SET file_hash = ?, synced_at = ? WHERE dept = ? AND source = ?", fileHash, now, dept, source);
        result.unchanged++;
        return;
      }
      if (hash(doc.body) !== row.body_hash) {
        // Edited in the app since it was copied: the app's text is kept.
        await run("UPDATE dept_doc_sources SET file_hash = ?, synced_at = ? WHERE dept = ? AND source = ?", fileHash, now, dept, source);
        result.keptEdited.push(source);
        return;
      }
      const newTitle = doc.title === row.title ? title : doc.title;
      if (doc.status === "review" || doc.status === "approved") {
        await run("INSERT INTO dept_doc_versions (doc_id, version, title, body, status, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, NULL, ?) ON CONFLICT DO NOTHING", row.doc_id, doc.version, doc.title, doc.body, doc.status, now);
        await run("UPDATE dept_docs SET title = ?, body = ?, version = version + 1, status = 'draft', approvals = '[]', approved_at = NULL, updated_at = ? WHERE id = ?", newTitle, text, now, row.doc_id);
      } else await run("UPDATE dept_docs SET title = ?, body = ?, updated_at = ? WHERE id = ?", newTitle, text, now, row.doc_id);
      await run("UPDATE dept_doc_sources SET file_hash = ?, body_hash = ?, title = ?, synced_at = ? WHERE dept = ? AND source = ?", fileHash, fileHash, title, now, dept, source);
      result.updated.push(source);
    });
  }
  // Folders the whole department reads: shared once, view only (a head or lead may change it afterwards).
  for (const name of manifest.shareWithTeam ?? []) {
    const folder = await get<{ id: string }>("SELECT id FROM dept_folders WHERE dept = ? AND name = ? AND parent_id IS NULL", dept, name);
    const flag = `docs_team_share:${dept}:${name}`;
    if (!folder || (await get("SELECT 1 AS x FROM settings WHERE key = ?", flag))) continue;
    await run("INSERT INTO dept_access_grants (id, dept, target_kind, target_id, user_id, level, granted_by, created_at) VALUES (?, ?, 'folder', ?, '*', 'view', NULL, ?) ON CONFLICT DO NOTHING", uid("grt_"), dept, folder.id, nowIso());
    await run("INSERT INTO settings (key, value, updated_at) VALUES (?, 'true', ?) ON CONFLICT (key) DO NOTHING", flag, nowIso());
  }
  if (result.added.length || result.updated.length)
    await audit(
      { actor: null, source: "system" },
      { action: `${dept}.doc`, summary: `Documents from the repository: ${result.added.length} added, ${result.updated.length} updated${result.keptEdited.length ? `, ${result.keptEdited.length} kept as edited in the app` : ""}` },
    );
  return result;
}
