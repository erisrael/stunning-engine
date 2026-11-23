// Who may see what in a department's documents and tasks, and what happens when someone tries to take what they
// may only view.
//
// - Heads, leads and Admin see everything ("full").
// - A member sees their own work (documents and files they made, tasks assigned to, reported or reviewed by them)
//   and what a head or lead shares with them: a folder with everything in it, a document, a file, or a project's
//   tasks. Each share is "view" (read in the app only) or "download" (also export, print, copy and download).
//   A share with user "*" is for the whole department.
// - On something they may only view, the app blocks copying, printing, saving and downloading, and reports every
//   attempt, automation and scraping tools, and reading in bulk to the heads and leads (Access page and the bell).
//
// Every check is on the server; the browser's blocking is a second line, not the protection.

import { all, get, nowIso, run, uid } from "./db";
import { workAccess, type WorkAccess } from "./dept-config";
import { deptManagers, deptPeople } from "./departments";
import { notify } from "./notifications";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";

export type Level = "view" | "download";
export type TargetKind = "folder" | "doc" | "file" | "project";
export const LEVEL_LABELS: Record<Level, string> = { view: "View only", download: "View and download" };

const rank = (l: Level | null | undefined) => (l === "download" ? 2 : l === "view" ? 1 : 0);
const best = (a: Level | null, b: Level | null): Level | null => (rank(a) >= rank(b) ? a : b);

// Heads, leads and Admin manage access and see everything.
export const fullAccess = (a: WorkAccess, user: AppUser) => a.manage || a.rights.seeAll || can(user, "users.manage") || user.roles.includes("admin");
export const managesAccess = (a: WorkAccess, user: AppUser) => !a.readOnly && (a.manage || a.rights.configure || can(user, "users.manage") || user.roles.includes("admin"));

type Grant = { target_kind: TargetKind; target_id: string; level: Level };

// A member's shares in one department, and the folder tree, read once per request.
export async function memberScope(a: WorkAccess, user: AppUser) {
  if (fullAccess(a, user)) return { full: true as const };
  const grants = await all<Grant>("SELECT target_kind, target_id, level FROM dept_access_grants WHERE dept = ? AND user_id IN (?, '*')", a.dept, user.id);
  const folders = await all<{ id: string; parent_id: string | null; created_by: string | null }>("SELECT id, parent_id, created_by FROM dept_folders WHERE dept = ?", a.dept);
  const mine = new Set(folders.filter((f) => f.created_by === user.id).map((f) => f.id));
  const parent = new Map(folders.map((f) => [f.id, f.parent_id]));
  const direct = (kind: TargetKind, id: string) => grants.filter((g) => g.target_kind === kind && g.target_id === id).reduce<Level | null>((l, g) => best(l, g.level), null);
  const folderLevel = new Map<string, Level | null>();
  // A folder's level: its own share or the best of its parents' (a share covers everything inside).
  const ofFolder = (id: string | null | undefined): Level | null => {
    if (!id) return null;
    if (folderLevel.has(id)) return folderLevel.get(id)!;
    folderLevel.set(id, null); // guards a loop in damaged data
    // Folders a member made are theirs, with everything put in them.
    const l = mine.has(id) ? "download" : best(direct("folder", id), ofFolder(parent.get(id) ?? null));
    folderLevel.set(id, l);
    return l;
  };
  return {
    full: false as const,
    grants,
    folderOf: ofFolder,
    item: (kind: "doc" | "file", id: string, folderId: string | null, ownerId: string | null): Level | null => (ownerId === user.id ? "download" : best(direct(kind, id), ofFolder(folderId))),
    project: (id: string | null): Level | null => (id ? direct("project", id) : null),
    projectIds: grants.filter((g) => g.target_kind === "project").map((g) => g.target_id),
    // Folders to show: shared ones, and the folders above anything shared so it can be reached.
    visibleFolders: (items: { folder_id: string | null }[]) => {
      const show = new Set<string>();
      const up = (id: string | null) => {
        for (let f = id; f && !show.has(f); f = parent.get(f) ?? null) show.add(f);
      };
      for (const f of folders) if (ofFolder(f.id)) up(f.id);
      for (const i of items) up(i.folder_id);
      return show;
    },
  };
}
export type Scope = Awaited<ReturnType<typeof memberScope>>;

// The level a person has on one document or file; throws when they have none (or less than they need).
export async function itemLevel(user: AppUser, a: WorkAccess, kind: "doc" | "file", id: string, need: Level = "view"): Promise<Level> {
  const table = kind === "doc" ? "dept_docs" : "dept_folder_files";
  const owner = kind === "doc" ? "created_by" : "uploaded_by";
  const r = await get<{ folder_id: string | null; owner: string | null; title: string }>(`SELECT folder_id, ${owner} AS owner, ${kind === "doc" ? "title" : "name"} AS title FROM ${table} WHERE id = ? AND dept = ?`, id, a.dept);
  if (!r) throw new WorkflowError("NOT_FOUND", kind === "doc" ? "Document not found." : "File not found.");
  const scope = await memberScope(a, user);
  const level: Level | null = scope.full ? "download" : scope.item(kind, id, r.folder_id, r.owner);
  if (!level) throw new WorkflowError("FORBIDDEN", "This has not been shared with you. Ask your team lead or head.");
  if (rank(level) < rank(need)) {
    await recordEvent(user, a.dept, { kind: need === "download" ? "download_attempt" : "open_attempt", targetKind: kind, targetId: id, title: r.title, detail: "Refused on the server" });
    throw new WorkflowError("FORBIDDEN", "You may only view this here. Ask your team lead or head for download access.");
  }
  return level;
}

// ---------------------------------------------------------------------------
// Shares (heads, leads and Admin)
// ---------------------------------------------------------------------------

async function targetTitle(dept: string, kind: TargetKind, id: string) {
  const q: Record<TargetKind, string> = {
    folder: "SELECT name AS t FROM dept_folders WHERE id = ? AND dept = ?",
    doc: "SELECT title AS t FROM dept_docs WHERE id = ? AND dept = ?",
    file: "SELECT name AS t FROM dept_folder_files WHERE id = ? AND dept = ?",
    project: "SELECT key || ' ' || name AS t FROM dept_projects WHERE id = ? AND dept = ?",
  };
  return (await get<{ t: string }>(q[kind], id, dept))?.t ?? null;
}

export async function listShares(user: AppUser, d: string, kind: TargetKind, id: string) {
  const a = await workAccess(user, d);
  if (!managesAccess(a, user)) throw new WorkflowError("FORBIDDEN", "Only heads and leads manage access.");
  const rows = await all<{ id: string; user_id: string; level: Level; name: string | null; created_at: string }>(
    "SELECT g.id, g.user_id, g.level, u.name, g.created_at FROM dept_access_grants g LEFT JOIN users u ON u.id = g.user_id WHERE g.dept = ? AND g.target_kind = ? AND g.target_id = ? ORDER BY g.user_id = '*' DESC, u.name",
    a.dept,
    kind,
    id,
  );
  const people = (await deptPeople(a.dept)).map((p) => ({ id: p.id, name: p.name, position: p.position }));
  return { title: await targetTitle(a.dept, kind, id), shares: rows.map((r) => ({ id: r.id, userId: r.user_id, name: r.user_id === "*" ? "Everyone in the department" : (r.name ?? "Someone"), level: r.level, at: r.created_at })), people };
}

export async function setShare(user: AppUser, d: string, input: { kind: TargetKind; id: string; userId: string; level: Level | "none" }) {
  const a = await workAccess(user, d, "write");
  if (!managesAccess(a, user)) throw new WorkflowError("FORBIDDEN", "Only heads and leads manage access.");
  if (!["folder", "doc", "file", "project"].includes(input.kind)) throw new WorkflowError("VALIDATION", "Unknown kind.");
  const title = await targetTitle(a.dept, input.kind, input.id);
  if (!title) throw new WorkflowError("NOT_FOUND", "Not found.");
  if (input.userId !== "*" && !(await get("SELECT 1 AS x FROM users WHERE id = ?", input.userId))) throw new WorkflowError("NOT_FOUND", "Person not found.");
  const who = input.userId === "*" ? "everyone in the department" : ((await get<{ name: string }>("SELECT name FROM users WHERE id = ?", input.userId))?.name ?? "someone");
  if (input.level === "none") {
    await run("DELETE FROM dept_access_grants WHERE dept = ? AND target_kind = ? AND target_id = ? AND user_id = ?", a.dept, input.kind, input.id, input.userId);
    await audit({ actor: user }, { action: `${a.dept}.access`, summary: `${user.name} stopped sharing "${title}" with ${who}` });
    return;
  }
  if (input.level !== "view" && input.level !== "download") throw new WorkflowError("VALIDATION", "Choose view only, or view and download.");
  await run(
    `INSERT INTO dept_access_grants (id, dept, target_kind, target_id, user_id, level, granted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (dept, target_kind, target_id, user_id) DO UPDATE SET level = EXCLUDED.level, granted_by = EXCLUDED.granted_by, created_at = EXCLUDED.created_at`,
    uid("grt_"), a.dept, input.kind, input.id, input.userId, input.level, user.id, nowIso(),
  );
  await audit({ actor: user }, { action: `${a.dept}.access`, summary: `${user.name} shared "${title}" with ${who} (${LEVEL_LABELS[input.level].toLowerCase()})` });
  if (input.userId !== "*")
    await notify([input.userId], { type: "assignment", title: `Shared with you: ${title}`, body: `${LEVEL_LABELS[input.level]}, by ${user.name}.`, link: input.kind === "project" ? `/${a.dept}/list?project=${input.id}` : input.kind === "doc" ? `/${a.dept}/docs?doc=${input.id}` : input.kind === "folder" ? `/${a.dept}/docs?folder=${input.id}` : `/${a.dept}/docs`, dedupeKey: `share:${input.kind}:${input.id}:${input.userId}:${input.level}` }, nowIso(), user.id);
}

// Everything shared, by person, for the Access page.
export async function accessOverview(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  if (!managesAccess(a, user)) throw new WorkflowError("FORBIDDEN", "Only heads and leads manage access.");
  const rows = await all<{ id: string; target_kind: TargetKind; target_id: string; user_id: string; level: Level; created_at: string; name: string | null; by: string | null }>(
    "SELECT g.id, g.target_kind, g.target_id, g.user_id, g.level, g.created_at, u.name, b.name AS by FROM dept_access_grants g LEFT JOIN users u ON u.id = g.user_id LEFT JOIN users b ON b.id = g.granted_by WHERE g.dept = ? ORDER BY g.created_at DESC",
    a.dept,
  );
  const shares = [];
  for (const r of rows) shares.push({ id: r.id, kind: r.target_kind, targetId: r.target_id, title: (await targetTitle(a.dept, r.target_kind, r.target_id)) ?? "(removed)", userId: r.user_id, name: r.user_id === "*" ? "Everyone in the department" : (r.name ?? "Someone"), level: r.level, by: r.by, at: r.created_at });
  const people = await deptPeople(a.dept);
  const managers = new Set(await deptManagers(a.dept));
  const projects = await all<{ id: string; key: string; name: string }>("SELECT id, key, name FROM dept_projects WHERE dept = ? AND archived = 0 ORDER BY key", a.dept);
  return {
    shares,
    people: people.map((p) => ({ id: p.id, name: p.name, position: p.position, full: managers.has(p.id) })),
    projects: projects.map((p) => ({ id: p.id, label: `${p.key} ${p.name}` })),
    events: await listEvents(a),
  };
}

// ---------------------------------------------------------------------------
// Alerts: attempts to take what may only be viewed, automation and scraping, reading in bulk
// ---------------------------------------------------------------------------

export const EVENT_LABELS: Record<string, string> = {
  copy: "Tried to copy text",
  cut: "Tried to cut text",
  select_all: "Tried to select everything",
  context_menu: "Opened the right-click menu",
  drag: "Tried to drag content out",
  save: "Tried to save the page",
  print: "Tried to print",
  print_screen: "Pressed Print Screen",
  view_source: "Tried to open the page source",
  devtools: "Opened the browser's developer tools",
  automation: "Opened it with an automation tool (WebDriver)",
  scraper_client: "Requested it with a scraping tool",
  download_attempt: "Tried to download or export",
  open_attempt: "Tried to open something not shared",
  bulk_reading: "Opened many documents in a short time",
};
// Reported from the browser; the rest come from the server only.
export const CLIENT_EVENTS = ["copy", "cut", "select_all", "context_menu", "drag", "save", "print", "print_screen", "view_source", "devtools", "automation"];
const SCRAPERS = /\b(curl|wget|python-requests|python-urllib|aiohttp|httpx|scrapy|go-http-client|okhttp|java\/|libwww|httpclient|node-fetch|axios|headlesschrome|phantomjs|puppeteer|playwright|selenium|wkhtmltopdf)\b/i;
export const looksLikeScraper = (ua: string | null | undefined) => !ua || SCRAPERS.test(ua);

export async function recordEvent(user: AppUser, dept: string, e: { kind: string; targetKind?: string | null; targetId?: string | null; title?: string | null; detail?: string | null; userAgent?: string | null; ip?: string | null }) {
  const now = nowIso();
  // The same attempt again within ten minutes is counted on the same alert, not a new one (and not a new message).
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const open = await get<{ id: string }>(
    "SELECT id FROM dept_access_events WHERE dept = ? AND user_id = ? AND kind = ? AND COALESCE(target_id, '') = ? AND reviewed_at IS NULL AND last_at >= ?",
    dept, user.id, e.kind, e.targetId ?? "", since,
  );
  if (open) {
    await run("UPDATE dept_access_events SET repeats = repeats + 1, last_at = ? WHERE id = ?", now, open.id);
    return open.id;
  }
  const id = uid("aev_");
  await run(
    "INSERT INTO dept_access_events (id, dept, user_id, kind, target_kind, target_id, title, detail, user_agent, ip, repeats, created_at, last_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
    id, dept, user.id, e.kind, e.targetKind ?? null, e.targetId ?? null, e.title?.slice(0, 200) ?? null, e.detail?.slice(0, 500) ?? null, e.userAgent?.slice(0, 300) ?? null, e.ip ?? null, now, now,
  );
  await notify(
    await deptManagers(dept),
    { type: "security", title: `Access alert: ${user.name}`, body: `${EVENT_LABELS[e.kind] ?? e.kind}${e.title ? `: ${e.title}` : ""}.`, link: `/${dept}/access`, groupKey: `access:${dept}` },
    now,
    user.id,
  );
  return id;
}

// From the browser: only the known kinds, only for something the person may see but only view.
export async function reportFromBrowser(user: AppUser, d: string, e: { kind: string; targetKind?: "doc" | "file" | null; targetId?: string | null; detail?: string | null }, meta: { userAgent?: string | null; ip?: string | null }) {
  const a = await workAccess(user, d);
  if (!CLIENT_EVENTS.includes(e.kind)) throw new WorkflowError("VALIDATION", "Unknown event.");
  if (fullAccess(a, user)) return null;
  let title: string | null = null;
  if (e.targetKind && e.targetId) {
    const t = await get<{ t: string }>(e.targetKind === "doc" ? "SELECT title AS t FROM dept_docs WHERE id = ? AND dept = ?" : "SELECT name AS t FROM dept_folder_files WHERE id = ? AND dept = ?", e.targetId, a.dept);
    if (!t) throw new WorkflowError("NOT_FOUND", "Not found.");
    title = t.t;
  }
  return recordEvent(user, a.dept, { kind: e.kind, targetKind: e.targetKind ?? null, targetId: e.targetId ?? null, title, detail: e.detail ?? null, ...meta });
}

// Reading in bulk: more than 25 documents opened in five minutes by one member (a scraping script or tool).
const reads = new Map<string, number[]>();
export async function noteRead(user: AppUser, a: WorkAccess, docId: string, title: string) {
  if (fullAccess(a, user)) return;
  const key = `${a.dept}:${user.id}`;
  const now = Date.now();
  const list = (reads.get(key) ?? []).filter((t) => now - t < 5 * 60e3);
  list.push(now);
  reads.set(key, list);
  if (list.length > 25) await recordEvent(user, a.dept, { kind: "bulk_reading", targetKind: "doc", targetId: null, title: null, detail: `${list.length} documents in five minutes, the last "${title}"` });
}

async function listEvents(a: WorkAccess) {
  const rows = await all<{ id: string; user_id: string | null; name: string | null; kind: string; target_kind: string | null; target_id: string | null; title: string | null; detail: string | null; user_agent: string | null; ip: string | null; repeats: number; created_at: string; last_at: string; reviewed_at: string | null; reviewer: string | null; outcome: string | null }>(
    `SELECT e.*, u.name, r.name AS reviewer FROM dept_access_events e LEFT JOIN users u ON u.id = e.user_id LEFT JOIN users r ON r.id = e.reviewed_by
     WHERE e.dept = ? ORDER BY e.reviewed_at IS NOT NULL, e.last_at DESC LIMIT 200`,
    a.dept,
  );
  return rows.map((r) => ({ id: r.id, userId: r.user_id, name: r.name ?? "Someone", kind: r.kind, label: EVENT_LABELS[r.kind] ?? r.kind, targetKind: r.target_kind, targetId: r.target_id, title: r.title, detail: r.detail, userAgent: r.user_agent, ip: r.ip, repeats: Number(r.repeats), at: r.created_at, last: r.last_at, reviewedAt: r.reviewed_at, reviewer: r.reviewer, outcome: r.outcome }));
}

export async function openAlertCount(user: AppUser, d: string) {
  const a = await workAccess(user, d).catch(() => null);
  if (!a || !managesAccess(a, user)) return 0;
  return Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_access_events WHERE dept = ? AND reviewed_at IS NULL", a.dept))?.n ?? 0);
}

// A head or lead closes an alert: noted, the person's share of that item removed, or every share they have removed.
export async function reviewEvent(user: AppUser, d: string, id: string, outcome: "noted" | "revoke_item" | "revoke_all") {
  const a = await workAccess(user, d, "write");
  if (!managesAccess(a, user)) throw new WorkflowError("FORBIDDEN", "Only heads and leads review access alerts.");
  const e = await get<{ user_id: string | null; target_kind: string | null; target_id: string | null; title: string | null; kind: string }>("SELECT user_id, target_kind, target_id, title, kind FROM dept_access_events WHERE id = ? AND dept = ?", id, a.dept);
  if (!e) throw new WorkflowError("NOT_FOUND", "Alert not found.");
  let removed = 0;
  if (outcome === "revoke_item" && e.user_id && e.target_kind && e.target_id)
    removed = (await run("DELETE FROM dept_access_grants WHERE dept = ? AND user_id = ? AND target_kind = ? AND target_id = ?", a.dept, e.user_id, e.target_kind, e.target_id)).changes;
  if (outcome === "revoke_all" && e.user_id) removed = (await run("DELETE FROM dept_access_grants WHERE dept = ? AND user_id = ?", a.dept, e.user_id)).changes;
  const label = outcome === "noted" ? "noted" : outcome === "revoke_item" ? "access to the item removed" : "all access removed";
  await run("UPDATE dept_access_events SET reviewed_by = ?, reviewed_at = ?, outcome = ? WHERE id = ?", user.id, nowIso(), label, id);
  await audit({ actor: user }, { action: `${a.dept}.access`, summary: `${user.name} reviewed an access alert (${EVENT_LABELS[e.kind] ?? e.kind}${e.title ? `, "${e.title}"` : ""}): ${label}${removed ? `, ${removed} share${removed === 1 ? "" : "s"} removed` : ""}` });
  return removed;
}
