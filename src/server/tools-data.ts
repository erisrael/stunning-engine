// The Tools hub's data: notes, tasks, reminders, saved files (documents, decks, letters, sheets), links to
// production items, the operational cross-check and the private calendar feed.
//
// Privacy: every row belongs to one person and every query here filters by user_id = the signed-in person, so no
// one (not even Admin, from these functions) reads someone else's notes. Production items are only searched and
// cross-checked within what the person may already see (their grade and subject scope, and production rights).

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, placeholders, run, uid } from "./db";
import { WorkflowError } from "./workflow";
import { can, scopeSql, type AppUser } from "./users";
import { seal, unseal } from "./secrets";
import { requireFeature, requireTool } from "./tools";
import { STAGES, type Capability } from "@/lib/domain";
import type { LinkRef, NoteView, ReminderView, TaskView } from "@/lib/tools";

const MAX_BODY = 200_000;
const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const isoOrNull = (v: unknown) => {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new WorkflowError("VALIDATION", "That date is not valid.");
  return d.toISOString();
};

type LinkRow = { link_kind: string | null; link_id: string | null; link_label: string | null };
const linkOf = (r: LinkRow): LinkRef => (r.link_kind === "item" && r.link_id ? { kind: "item", id: r.link_id, label: r.link_label ?? r.link_id } : null);

// Checks a link the browser sent: the item must exist and be visible to the person; its label comes from the database.
async function cleanLink(user: AppUser, link: unknown): Promise<LinkRow> {
  const l = link as { kind?: string; id?: string } | null;
  if (!l || !l.id) return { link_kind: null, link_id: null, link_label: null };
  if (l.kind !== "item") throw new WorkflowError("VALIDATION", "Unknown kind of link.");
  const hit = (await searchRecords(user, "", [String(l.id)]))[0];
  if (!hit) throw new WorkflowError("NOT_FOUND", "That record was not found or is outside what you can see.");
  return { link_kind: "item", link_id: hit.id, link_label: `${hit.code} · ${hit.title}${hit.teacher ? ` (${hit.teacher})` : ""}` };
}

// ---------------------------------------------------------------------------
// Operational records (production items): search for links, and the cross-check
// ---------------------------------------------------------------------------

const PRODUCTION_SIGHT: Capability[] = ["nav.list", "nav.sheet", "nav.overview", "nav.board", "items.detail", "team.overview", "company.view", "owners.view"];
export function seesProduction(user: AppUser) {
  return PRODUCTION_SIGHT.some((c) => can(user, c)) || user.roles.some((r) => (STAGES as readonly string[]).includes(r));
}

export type RecordHit = { id: string; code: string; title: string; teacher: string | null; stage: string | null; lifecycle: string; subject: string | null; grade: string | null };

export async function searchRecords(user: AppUser, q: string, ids: string[] = []): Promise<RecordHit[]> {
  if (!seesProduction(user)) return [];
  const sc = scopeSql(user, "i");
  const term = q.trim().slice(0, 80);
  const where = ids.length ? `i.id IN (${placeholders(ids.length)})` : "(i.code ILIKE ? OR i.title ILIKE ? OR COALESCE(i.teacher, '') ILIKE ?)";
  const params = ids.length ? ids : [`%${term}%`, `%${term}%`, `%${term}%`];
  if (!ids.length && term.length < 2) return [];
  return all<RecordHit>(
    `SELECT i.id, i.code, i.title, i.teacher, i.stage, i.lifecycle,
       (SELECT s.name FROM item_memberships m JOIN subjects s ON s.id = m.subject_id WHERE m.item_id = i.id LIMIT 1) AS subject,
       (SELECT g.name FROM item_memberships m JOIN grades g ON g.id = m.grade_id WHERE m.item_id = i.id LIMIT 1) AS grade
     FROM items i WHERE ${where} AND ${sc.sql} AND i.lifecycle <> 'deleted'
     ORDER BY CASE WHEN i.code ILIKE ? THEN 0 ELSE 1 END, i.code LIMIT 20`,
    ...params,
    ...sc.params,
    `${term}%`,
  );
}

export type CrossRow = { row: number; code: string; title: string; teacher: string };
export type CrossResult = {
  row: number;
  status: "match" | "mismatch" | "missing" | "invalid";
  issues: string[];
  input: { code: string; title: string; teacher: string };
  ops: { code: string; title: string; teacher: string | null; stage: string | null; lifecycle: string; subject: string | null; grade: string | null } | null;
};

const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s._\-–—:,;()'"]+/g, " ")
    .trim();

// Compares uploaded rows with production items by code (or by title when the row has no code).
// The AI connections call it with gate = false (their own switch was checked when the token was used).
export async function crossCheck(user: AppUser, rows: CrossRow[], gate = true) {
  if (gate) await requireTool(user, "sheets");
  if (!seesProduction(user)) throw new WorkflowError("FORBIDDEN", "Cross-checking needs sight of production data (ask Admin).");
  if (!Array.isArray(rows) || rows.length > 20000) throw new WorkflowError("VALIDATION", "Cross-check up to 20,000 rows at a time.");
  const clean = rows.map((r, i) => ({ row: Number(r.row) || i + 2, code: str(r.code, 80).trim(), title: str(r.title, 400).trim(), teacher: str(r.teacher, 200).trim() }));
  const sc = scopeSql(user, "i");
  const codes = [...new Set(clean.map((r) => r.code.toUpperCase()).filter(Boolean))];
  const byCode = new Map<string, RecordHit>();
  for (let i = 0; i < codes.length; i += 500) {
    const chunk = codes.slice(i, i + 500);
    const hits = await all<RecordHit>(
      `SELECT i.id, i.code, i.title, i.teacher, i.stage, i.lifecycle,
         (SELECT s.name FROM item_memberships m JOIN subjects s ON s.id = m.subject_id WHERE m.item_id = i.id LIMIT 1) AS subject,
         (SELECT g.name FROM item_memberships m JOIN grades g ON g.id = m.grade_id WHERE m.item_id = i.id LIMIT 1) AS grade
       FROM items i WHERE upper(i.code) IN (${placeholders(chunk.length)}) AND ${sc.sql}`,
      ...chunk,
      ...sc.params,
    );
    for (const h of hits) byCode.set(h.code.toUpperCase(), h);
  }
  // Rows without a code are matched by exact title (normalised).
  const titleOnly = clean.filter((r) => !r.code && r.title);
  const byTitle = new Map<string, RecordHit>();
  if (titleOnly.length) {
    const titles = [...new Set(titleOnly.map((r) => r.title))].slice(0, 5000);
    for (let i = 0; i < titles.length; i += 500) {
      const chunk = titles.slice(i, i + 500);
      const hits = await all<RecordHit>(
        `SELECT i.id, i.code, i.title, i.teacher, i.stage, i.lifecycle, NULL AS subject, NULL AS grade FROM items i WHERE lower(i.title) IN (${placeholders(chunk.length)}) AND ${sc.sql}`,
        ...chunk.map((t) => t.toLowerCase()),
        ...sc.params,
      );
      for (const h of hits) byTitle.set(norm(h.title), h);
    }
  }
  const seen = new Map<string, number>();
  const results: CrossResult[] = clean.map((r) => {
    const issues: string[] = [];
    const input = { code: r.code, title: r.title, teacher: r.teacher };
    if (!r.code && !r.title) return { row: r.row, status: "invalid", issues: ["The row has neither a code nor a title."], input, ops: null };
    if (r.code && !/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,79}$/.test(r.code)) issues.push(`"${r.code}" does not look like a code (letters, digits, dots, dashes).`);
    const key = r.code.toUpperCase();
    if (r.code) {
      const prev = seen.get(key);
      if (prev) issues.push(`The same code is also on row ${prev}.`);
      else seen.set(key, r.row);
    }
    const hit = r.code ? byCode.get(key) : byTitle.get(norm(r.title));
    if (!hit) {
      issues.unshift(r.code ? `Code ${r.code} is not in production data${user.scopes.length ? " (or is outside your grades and subjects)" : ""}.` : `No production item has the title "${r.title}".`);
      return { row: r.row, status: issues.length > 1 && !r.code ? "invalid" : "missing", issues, input, ops: null };
    }
    if (r.title && norm(r.title) !== norm(hit.title)) issues.push(`Title differs: the sheet says "${r.title}", production says "${hit.title}".`);
    if (r.teacher && norm(r.teacher) !== norm(hit.teacher)) issues.push(`Teacher differs: the sheet says "${r.teacher}", production says "${hit.teacher ?? "(none)"}".`);
    if (!r.code) issues.push(`Matched by title; the code is ${hit.code}.`);
    const ops = { code: hit.code, title: hit.title, teacher: hit.teacher, stage: hit.stage, lifecycle: hit.lifecycle, subject: hit.subject, grade: hit.grade };
    const bad = issues.filter((i) => !i.startsWith("Matched by title"));
    return { row: r.row, status: bad.length ? (bad.some((i) => i.startsWith('"') || i.startsWith("The same code")) ? "invalid" : "mismatch") : "match", issues, input, ops };
  });
  const count = (s: CrossResult["status"]) => results.filter((r) => r.status === s).length;
  return { results, summary: { total: results.length, match: count("match"), mismatch: count("mismatch"), missing: count("missing"), invalid: count("invalid") } };
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

type NoteRow = LinkRow & { id: string; title: string; body: string; tags: string; pinned: number; created_at: string; updated_at: string };
const noteView = (r: NoteRow): NoteView => ({ id: r.id, title: r.title, body: r.body, tags: parseJson<string[]>(r.tags, []), pinned: !!r.pinned, link: linkOf(r), createdAt: r.created_at, updatedAt: r.updated_at });

export async function listNotes(user: AppUser) {
  await requireTool(user, "notes");
  return (await all<NoteRow>("SELECT * FROM tool_notes WHERE user_id = ? AND deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC LIMIT 1000", user.id)).map(noteView);
}

export async function saveNote(user: AppUser, input: { id?: string; title: string; body: string; tags?: string[]; pinned?: boolean; link?: unknown }) {
  await requireTool(user, "notes");
  const body = str(input.body, MAX_BODY);
  const title = str(input.title, 200).trim();
  const tags = [...new Set((input.tags ?? []).map((t) => str(t, 40).trim()).filter(Boolean))].slice(0, 20);
  const link = await cleanLink(user, input.link);
  const now = nowIso();
  if (input.id) {
    const r = await run(
      "UPDATE tool_notes SET title = ?, body = ?, tags = ?, pinned = ?, link_kind = ?, link_id = ?, link_label = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
      title, body, JSON.stringify(tags), !!input.pinned, link.link_kind, link.link_id, link.link_label, now, input.id, user.id,
    );
    if (!r.changes) throw new WorkflowError("NOT_FOUND", "Note not found.");
    return input.id;
  }
  const id = uid("tn_");
  await run(
    "INSERT INTO tool_notes (id, user_id, title, body, tags, pinned, link_kind, link_id, link_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, user.id, title, body, JSON.stringify(tags), !!input.pinned, link.link_kind, link.link_id, link.link_label, now, now,
  );
  return id;
}

export async function deleteNote(user: AppUser, id: string) {
  await requireTool(user, "notes");
  await run("UPDATE tool_notes SET deleted_at = ? WHERE id = ? AND user_id = ?", nowIso(), id, user.id);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

type TaskRow = LinkRow & { id: string; note_id: string | null; title: string; description: string; due_at: string | null; done: number; done_at: string | null; created_at: string };
const taskView = (r: TaskRow): TaskView => ({ id: r.id, noteId: r.note_id, title: r.title, description: r.description, dueAt: r.due_at, done: !!r.done, doneAt: r.done_at, link: linkOf(r), createdAt: r.created_at });

export async function listTasks(user: AppUser) {
  await requireTool(user, "notes");
  return (await all<TaskRow>("SELECT * FROM tool_tasks WHERE user_id = ? ORDER BY done, COALESCE(due_at, '9999'), sort, created_at LIMIT 2000", user.id)).map(taskView);
}

async function ownNote(user: AppUser, noteId: unknown) {
  if (!noteId) return null;
  const n = await get<{ id: string }>("SELECT id FROM tool_notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL", String(noteId), user.id);
  if (!n) throw new WorkflowError("NOT_FOUND", "Note not found.");
  return n.id;
}

export async function saveTask(user: AppUser, input: { id?: string; noteId?: string | null; title: string; description?: string; dueAt?: string | null; done?: boolean; link?: unknown }) {
  await requireTool(user, "notes");
  const title = str(input.title, 300).trim();
  if (!title) throw new WorkflowError("VALIDATION", "Give the task a title.");
  const noteId = await ownNote(user, input.noteId);
  const due = isoOrNull(input.dueAt);
  const link = await cleanLink(user, input.link);
  const now = nowIso();
  const done = !!input.done;
  if (input.id) {
    const r = await run(
      "UPDATE tool_tasks SET note_id = ?, title = ?, description = ?, due_at = ?, done = ?, done_at = CASE WHEN ? = 1 THEN COALESCE(done_at, ?) ELSE NULL END, link_kind = ?, link_id = ?, link_label = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      noteId, title, str(input.description, 5000), due, done, done ? 1 : 0, now, link.link_kind, link.link_id, link.link_label, now, input.id, user.id,
    );
    if (!r.changes) throw new WorkflowError("NOT_FOUND", "Task not found.");
    return input.id;
  }
  const id = uid("tt_");
  await run(
    "INSERT INTO tool_tasks (id, user_id, note_id, title, description, due_at, done, done_at, link_kind, link_id, link_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, user.id, noteId, title, str(input.description, 5000), due, done, done ? now : null, link.link_kind, link.link_id, link.link_label, now, now,
  );
  return id;
}

export async function setTaskDone(user: AppUser, id: string, done: boolean) {
  await requireTool(user, "notes");
  await run("UPDATE tool_tasks SET done = ?, done_at = ?, updated_at = ? WHERE id = ? AND user_id = ?", done, done ? nowIso() : null, nowIso(), id, user.id);
}

export async function deleteTask(user: AppUser, id: string) {
  await requireTool(user, "notes");
  await run("DELETE FROM tool_tasks WHERE id = ? AND user_id = ?", id, user.id);
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

type ReminderRow = LinkRow & { id: string; title: string; notes: string; at: string; all_day: number; done: number; note_id: string | null; task_id: string | null };
const reminderView = (r: ReminderRow): ReminderView => ({ id: r.id, title: r.title, notes: r.notes, at: r.at, allDay: !!r.all_day, done: !!r.done, noteId: r.note_id, taskId: r.task_id, link: linkOf(r) });

export async function listReminders(user: AppUser, range?: { from?: string; to?: string }) {
  await requireTool(user, "calendar");
  const from = range?.from ? isoOrNull(range.from) : null;
  const to = range?.to ? isoOrNull(range.to) : null;
  return (
    await all<ReminderRow>(
      `SELECT * FROM tool_reminders WHERE user_id = ? ${from ? "AND at >= ?" : ""} ${to ? "AND at < ?" : ""} ORDER BY at LIMIT 3000`,
      user.id,
      ...(from ? [from] : []),
      ...(to ? [to] : []),
    )
  ).map(reminderView);
}

export async function saveReminder(user: AppUser, input: { id?: string; title: string; notes?: string; at: string; allDay?: boolean; done?: boolean; noteId?: string | null; taskId?: string | null; link?: unknown }) {
  await requireTool(user, "calendar");
  const title = str(input.title, 300).trim();
  if (!title) throw new WorkflowError("VALIDATION", "Give the reminder a title.");
  const at = isoOrNull(input.at);
  if (!at) throw new WorkflowError("VALIDATION", "Choose when.");
  const noteId = await ownNote(user, input.noteId);
  const taskId = input.taskId ? ((await get<{ id: string }>("SELECT id FROM tool_tasks WHERE id = ? AND user_id = ?", input.taskId, user.id))?.id ?? null) : null;
  const link = await cleanLink(user, input.link);
  const now = nowIso();
  if (input.id) {
    const r = await run(
      "UPDATE tool_reminders SET title = ?, notes = ?, at = ?, all_day = ?, done = ?, note_id = ?, task_id = ?, link_kind = ?, link_id = ?, link_label = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      title, str(input.notes, 5000), at, !!input.allDay, !!input.done, noteId, taskId, link.link_kind, link.link_id, link.link_label, now, input.id, user.id,
    );
    if (!r.changes) throw new WorkflowError("NOT_FOUND", "Reminder not found.");
    return input.id;
  }
  const id = uid("tr_");
  await run(
    "INSERT INTO tool_reminders (id, user_id, title, notes, at, all_day, done, note_id, task_id, link_kind, link_id, link_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, user.id, title, str(input.notes, 5000), at, !!input.allDay, !!input.done, noteId, taskId, link.link_kind, link.link_id, link.link_label, now, now,
  );
  return id;
}

export async function deleteReminder(user: AppUser, id: string) {
  await requireTool(user, "calendar");
  await run("DELETE FROM tool_reminders WHERE id = ? AND user_id = ?", id, user.id);
}

// ---------------------------------------------------------------------------
// Saved files: documents, decks, letters and sheets
// ---------------------------------------------------------------------------

// tpl_*: templates people import or save (a Word, PowerPoint or Excel file kept to start new ones from); hf: headers
// and footers saved from the designer or from an opened Word file.
export const FILE_KINDS = { doc: "docs", deck: "decks", letter: "letters", sheet: "sheets", tpl_doc: "docs", tpl_deck: "decks", tpl_sheet: "sheets", tpl_letter: "letters", hf: "docs" } as const;
export type FileKind = keyof typeof FILE_KINDS;
const MAX_FILE = 4_000_000;

export async function listFiles(user: AppUser, kind: FileKind) {
  await requireTool(user, FILE_KINDS[kind]);
  return all<{ id: string; title: string; updated_at: string; created_at: string }>(
    "SELECT id, title, updated_at, created_at FROM tool_files WHERE user_id = ? AND kind = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500",
    user.id,
    kind,
  );
}

export async function getFile(user: AppUser, kind: FileKind, id: string) {
  await requireTool(user, FILE_KINDS[kind]);
  const r = await get<{ id: string; title: string; data: string; updated_at: string }>("SELECT id, title, data, updated_at FROM tool_files WHERE id = ? AND user_id = ? AND kind = ? AND deleted_at IS NULL", id, user.id, kind);
  if (!r) throw new WorkflowError("NOT_FOUND", "Not found.");
  return { id: r.id, title: r.title, data: parseJson<unknown>(r.data, {}), updatedAt: r.updated_at };
}

export async function saveFile(user: AppUser, kind: FileKind, input: { id?: string; title: string; data: unknown }) {
  await requireTool(user, FILE_KINDS[kind]);
  const data = JSON.stringify(input.data ?? {});
  if (data.length > MAX_FILE) throw new WorkflowError("VALIDATION", "This is too large to save (pictures make files big; use smaller ones).");
  const title = str(input.title, 200).trim() || "Untitled";
  const now = nowIso();
  if (input.id) {
    const r = await run("UPDATE tool_files SET title = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ? AND kind = ? AND deleted_at IS NULL", title, data, now, input.id, user.id, kind);
    if (!r.changes) throw new WorkflowError("NOT_FOUND", "Not found.");
    return input.id;
  }
  const id = uid("tf_");
  await run("INSERT INTO tool_files (id, user_id, kind, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, user.id, kind, title, data, now, now);
  return id;
}

export async function deleteFile(user: AppUser, kind: FileKind, id: string) {
  await requireTool(user, FILE_KINDS[kind]);
  await run("UPDATE tool_files SET deleted_at = ? WHERE id = ? AND user_id = ? AND kind = ?", nowIso(), id, user.id, kind);
}

// A reference number for a letter: prefix/year/sequence, counted per person per year.
export async function nextLetterRef(user: AppUser, prefix: string) {
  await requireTool(user, "letters");
  const year = new Date().getFullYear();
  const n = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM tool_files WHERE user_id = ? AND kind = 'letter' AND created_at >= ?", user.id, `${year}-01-01`))?.n ?? 0) + 1;
  const initials = user.name.split(/\s+/).map((w) => w[0] ?? "").join("").toUpperCase().slice(0, 3);
  return `${prefix || "REF"}/${initials}/${year}/${String(n).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// The private calendar feed (.ics)
// ---------------------------------------------------------------------------

const FEED_DAYS = 365;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function calendarFeed(user: AppUser) {
  await requireFeature(user, "ics");
  const r = await get<{ token_enc: string; created_at: string; expires_at: string; last_used_at: string | null }>("SELECT token_enc, created_at, expires_at, last_used_at FROM tool_calendar_tokens WHERE user_id = ?", user.id);
  if (!r) return null;
  const token = await unseal(r.token_enc);
  return token ? { token, createdAt: r.created_at, expiresAt: r.expires_at, lastUsedAt: r.last_used_at, expired: r.expires_at < nowIso() } : null;
}

// A new link; the old one stops working at once.
export async function regenerateCalendarFeed(user: AppUser) {
  await requireFeature(user, "ics");
  const token = crypto.randomBytes(24).toString("base64url");
  const now = nowIso();
  const expires = new Date(Date.now() + FEED_DAYS * 864e5).toISOString();
  await run(
    "INSERT INTO tool_calendar_tokens (user_id, token_hash, token_enc, created_at, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash, token_enc = excluded.token_enc, created_at = excluded.created_at, expires_at = excluded.expires_at, last_used_at = NULL",
    user.id,
    sha(token),
    await seal(token),
    now,
    expires,
  );
  return token;
}

export async function revokeCalendarFeed(user: AppUser) {
  if ((user as AppUser & { previewBy?: unknown }).previewBy) throw new WorkflowError("FORBIDDEN", "View as cannot change someone's calendar link.");
  await run("DELETE FROM tool_calendar_tokens WHERE user_id = ?", user.id);
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsStamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDate = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
// Folds lines longer than 75 octets, as RFC 5545 asks.
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
};

// The feed for a token: reminders and dated tasks, from 60 days back. Returns null for an unknown, revoked or
// expired token, or when Admin has switched the feed off for the person.
export async function icsForToken(token: string, origin: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const row = await get<{ user_id: string; expires_at: string }>("SELECT user_id, expires_at FROM tool_calendar_tokens WHERE token_hash = ?", sha(token));
  if (!row || row.expires_at < nowIso()) return null;
  const { loadUser } = await import("./users");
  const user = await loadUser(row.user_id);
  if (!user?.active) return null;
  const { toolsFor } = await import("./tools");
  if (!(await toolsFor(user)).features.includes("ics")) return null;
  await run("UPDATE tool_calendar_tokens SET last_used_at = ? WHERE user_id = ?", nowIso(), user.id);
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const [reminders, tasks] = await Promise.all([
    all<ReminderRow & { updated_at: string }>("SELECT * FROM tool_reminders WHERE user_id = ? AND at >= ? ORDER BY at LIMIT 2000", user.id, since),
    all<TaskRow & { updated_at: string }>("SELECT * FROM tool_tasks WHERE user_id = ? AND due_at IS NOT NULL AND due_at >= ? ORDER BY due_at LIMIT 2000", user.id, since),
  ]);
  const host = new URL(origin).host;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Myseed//Tools hub//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(`Myseed reminders · ${user.name}`)}`, "X-PUBLISHED-TTL:PT1H", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  const event = (id: string, title: string, at: string, allDay: boolean, desc: string, updated: string, url: string) => {
    lines.push("BEGIN:VEVENT", `UID:${id}@${host}`, `DTSTAMP:${icsStamp(updated)}`);
    if (allDay) {
      const next = new Date(Date.parse(at) + 864e5).toISOString();
      lines.push(`DTSTART;VALUE=DATE:${icsDate(at)}`, `DTEND;VALUE=DATE:${icsDate(next)}`);
    } else lines.push(`DTSTART:${icsStamp(at)}`, `DTEND:${icsStamp(new Date(Date.parse(at) + 30 * 60e3).toISOString())}`);
    lines.push(`SUMMARY:${icsText(title)}`);
    if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
    lines.push(`URL:${url}`, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(title)}`, allDay ? "TRIGGER:-PT15H" : "TRIGGER:-PT15M", "END:VALARM", "END:VEVENT");
  };
  for (const r of reminders) event(r.id, `${r.done ? "✓ " : ""}${r.title}`, r.at, !!r.all_day, [r.notes, r.link_label && `Linked to ${r.link_label}`].filter(Boolean).join("\n"), r.updated_at, `${origin}/tools/calendar?d=${r.at.slice(0, 10)}`);
  for (const t of tasks) event(t.id, `${t.done ? "✓ " : "☐ "}${t.title}`, t.due_at!, true, [t.description, t.link_label && `Linked to ${t.link_label}`].filter(Boolean).join("\n"), t.updated_at, `${origin}/tools/notes?task=${t.id}`);
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// For the MCP server and the ChatGPT actions: one person's data in the same shapes.
export async function workspaceSnapshot(user: AppUser) {
  const [notes, tasks] = await Promise.all([listNotes(user), listTasks(user)]);
  return { notes, tasks };
}

