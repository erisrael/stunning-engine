// Announcements and policies (Phase 18): news for the whole company, some departments or some roles, shown at the
// top of every page until read; policies also need "I have read this", and their authors see who has not
// confirmed yet (and can remind them). Admin, HR managers and owners announce to anyone; a department's head
// announces to their own department.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { customDepartments, deptAccess, deptPeople } from "./departments";

export type Audience = { all: boolean; departments: string[]; roles: string[] };
export type Announcement = {
  id: string;
  title: string;
  body: string;
  kind: "news" | "policy";
  audience: Audience;
  pinned: boolean;
  author: string;
  authorId: string;
  createdAt: string;
  expiresAt: string | null;
  readAt: string | null;
  ackedAt: string | null;
};

const WIDE = (u: AppUser) => can(u, "users.manage") || can(u, "hr.manage") || can(u, "owners.view");

// Departments this person may announce to (heads of departments; everyone for Admin, HR and owners).
export async function announceTargets(user: AppUser) {
  const keys = ["dev", "marketing", "studio", ...(await customDepartments()).map((c) => c.key)];
  const out: string[] = [];
  for (const k of keys) {
    if (WIDE(user)) out.push(k);
    else if ((await deptAccess(user, k).catch(() => null))?.manage) out.push(k);
  }
  return { all: WIDE(user), departments: out };
}

async function audienceUserIds(a: Audience): Promise<string[]> {
  if (a.all) return (await all<{ id: string }>("SELECT id FROM users WHERE active = 1 AND deleted_at IS NULL")).map((r) => r.id);
  const ids = new Set<string>();
  for (const d of a.departments) for (const p of await deptPeople(d).catch(() => [])) ids.add(p.id);
  if (a.roles.length)
    for (const r of await all<{ user_id: string }>(`SELECT DISTINCT user_id FROM role_assignments WHERE role IN (${a.roles.map(() => "?").join(",")})`, ...a.roles)) ids.add(r.user_id);
  return [...ids];
}

async function isFor(user: AppUser, a: Audience) {
  if (a.all) return true;
  if (a.roles.some((r) => user.roles.includes(r as never))) return true;
  for (const d of a.departments) if ((await deptPeople(d).catch(() => [])).some((p) => p.id === user.id)) return true;
  return false;
}

export async function saveAnnouncement(user: AppUser, input: { id?: string | null; title: string; body: string; kind: "news" | "policy"; audience: Audience; pinned?: boolean; expiresAt?: string | null; notify?: boolean }) {
  const t = await announceTargets(user);
  if (!t.all && !t.departments.length) throw new WorkflowError("FORBIDDEN", "Only Admin, HR, owners and department heads announce.");
  const title = String(input.title ?? "").trim().slice(0, 160);
  const body = String(input.body ?? "").trim().slice(0, 8000);
  if (!title || !body) throw new WorkflowError("VALIDATION", "Give a title and the text.");
  const a: Audience = { all: !!input.audience?.all, departments: (input.audience?.departments ?? []).map(String).slice(0, 40), roles: (input.audience?.roles ?? []).map(String).slice(0, 40) };
  if (a.all && !t.all) throw new WorkflowError("FORBIDDEN", "You can announce to your own department only.");
  if (!a.all && !a.departments.length && !a.roles.length) throw new WorkflowError("VALIDATION", "Choose who it is for.");
  if (a.departments.some((d) => !t.departments.includes(d)) || (a.roles.length && !t.all)) throw new WorkflowError("FORBIDDEN", "You can announce to your own department only.");
  const kind = input.kind === "policy" ? "policy" : "news";
  const expires = input.expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt) ? `${input.expiresAt}T23:59:59.000Z` : null;
  const now = nowIso();
  let id = input.id ?? null;
  if (id) {
    const cur = await get<{ created_by: string }>("SELECT created_by FROM announcements WHERE id = ?", id);
    if (!cur || (cur.created_by !== user.id && !can(user, "users.manage"))) throw new WorkflowError("FORBIDDEN", "Only its author changes it.");
    await run("UPDATE announcements SET title = ?, body = ?, kind = ?, audience = ?, pinned = ?, expires_at = ?, updated_at = ? WHERE id = ?", title, body, kind, JSON.stringify(a), input.pinned ? 1 : 0, expires, now, id);
  } else {
    id = uid("ann_");
    await run(
      "INSERT INTO announcements (id, title, body, kind, audience, pinned, created_by, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      title,
      body,
      kind,
      JSON.stringify(a),
      input.pinned ? 1 : 0,
      user.id,
      now,
      now,
      expires,
    );
    if (input.notify !== false) await notify(await audienceUserIds(a), { type: "hr", title: kind === "policy" ? `New policy to read: ${title}` : title, body: body.slice(0, 200), link: "/announcements" }, now, user.id);
  }
  await audit({ actor: user }, { action: "announcement.saved", summary: `${user.name} ${input.id ? "changed" : "announced"} "${title}"` });
  return id;
}

export async function deleteAnnouncement(user: AppUser, id: string) {
  const cur = await get<{ created_by: string }>("SELECT created_by FROM announcements WHERE id = ?", id);
  if (!cur || (cur.created_by !== user.id && !can(user, "users.manage"))) throw new WorkflowError("FORBIDDEN", "Only its author removes it.");
  await run("DELETE FROM announcement_reads WHERE announcement_id = ?", id);
  await run("DELETE FROM announcements WHERE id = ?", id);
}

type Row = { id: string; title: string; body: string; kind: string; audience: string; pinned: number; created_by: string; author: string; created_at: string; expires_at: string | null; read_at: string | null; acked_at: string | null };

// What this person sees: everything for them, newest first (pinned first), with their read and confirmed times.
export async function myAnnouncements(user: AppUser, opts: { includeOld?: boolean } = {}): Promise<Announcement[]> {
  const rows = await all<Row>(
    `SELECT a.id, a.title, a.body, a.kind, a.audience, a.pinned, a.created_by, u.name AS author, a.created_at, a.expires_at, r.read_at, r.acked_at
     FROM announcements a JOIN users u ON u.id = a.created_by LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = ?
     ${opts.includeOld ? "" : "WHERE a.expires_at IS NULL OR a.expires_at > ?"} ORDER BY a.pinned DESC, a.created_at DESC LIMIT 200`,
    user.id,
    ...(opts.includeOld ? [] : [nowIso()]),
  );
  const out: Announcement[] = [];
  for (const r of rows) {
    const a = parseJson<Audience>(r.audience, { all: true, departments: [], roles: [] });
    if (r.created_by !== user.id && !(await isFor(user, a))) continue;
    out.push({ id: r.id, title: r.title, body: r.body, kind: r.kind as Announcement["kind"], audience: a, pinned: !!Number(r.pinned), author: r.author, authorId: r.created_by, createdAt: r.created_at, expiresAt: r.expires_at, readAt: r.read_at, ackedAt: r.acked_at });
  }
  return out;
}

// For the strip at the top of every page: unread news, and policies not yet confirmed.
export async function pendingAnnouncements(user: AppUser) {
  return (await myAnnouncements(user)).filter((a) => a.authorId !== user.id && (a.kind === "policy" ? !a.ackedAt : !a.readAt)).slice(0, 5);
}

export async function markAnnouncement(user: AppUser, id: string, ack: boolean) {
  const a = (await myAnnouncements(user, { includeOld: true })).find((x) => x.id === id);
  if (!a) throw new WorkflowError("NOT_FOUND", "Announcement not found.");
  const now = nowIso();
  await run(
    `INSERT INTO announcement_reads (announcement_id, user_id, read_at, acked_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (announcement_id, user_id) DO UPDATE SET read_at = COALESCE(announcement_reads.read_at, excluded.read_at), acked_at = COALESCE(announcement_reads.acked_at, excluded.acked_at)`,
    id,
    user.id,
    now,
    ack ? now : null,
  );
}

// For the author (and Admin): who has read and confirmed, and who has not yet.
export async function announcementStatus(user: AppUser, id: string) {
  const a = await get<{ created_by: string; audience: string; kind: string; title: string }>("SELECT created_by, audience, kind, title FROM announcements WHERE id = ?", id);
  if (!a || (a.created_by !== user.id && !can(user, "users.manage") && !can(user, "hr.manage"))) throw new WorkflowError("FORBIDDEN", "Only its author sees this.");
  const ids = (await audienceUserIds(parseJson<Audience>(a.audience, { all: true, departments: [], roles: [] }))).filter((x) => x !== a.created_by);
  const reads = new Map((await all<{ user_id: string; read_at: string | null; acked_at: string | null }>("SELECT user_id, read_at, acked_at FROM announcement_reads WHERE announcement_id = ?", id)).map((r) => [r.user_id, r]));
  const names = new Map((await all<{ id: string; name: string }>("SELECT id, name FROM users")).map((u) => [u.id, u.name]));
  const people = ids.map((uid2) => ({ id: uid2, name: names.get(uid2) ?? uid2, readAt: reads.get(uid2)?.read_at ?? null, ackedAt: reads.get(uid2)?.acked_at ?? null })).sort((x, y) => x.name.localeCompare(y.name));
  const done = (p: (typeof people)[number]) => (a.kind === "policy" ? !!p.ackedAt : !!p.readAt);
  return { kind: a.kind, total: people.length, done: people.filter(done).length, waiting: people.filter((p) => !done(p)), people };
}

export async function remindAnnouncement(user: AppUser, id: string) {
  const s = await announcementStatus(user, id);
  const t = (await get<{ title: string }>("SELECT title FROM announcements WHERE id = ?", id))!.title;
  await notify(s.waiting.map((p) => p.id), { type: "hr", title: s.kind === "policy" ? `Please read and confirm: ${t}` : `Reminder: ${t}`, link: "/announcements" }, nowIso());
  return s.waiting.length;
}

// ---------------------------------------------------------------------------
// Usage (Admin): page visits per day, by role and section; nothing about what is on the pages.
// ---------------------------------------------------------------------------

// The section of a path, without ids (/dev/list?task=x and /items/itm_123 count as /dev/list and /items).
export function sectionOf(path: string) {
  const parts = path.split("?")[0]!.split("/").filter(Boolean).slice(0, 2).filter((p) => !/[0-9]/.test(p) || /^p\d$/.test(p));
  return `/${parts.join("/")}`;
}

export async function recordVisit(userId: string, role: string, path: string) {
  const day = nowIso().slice(0, 10);
  await run(
    `INSERT INTO page_visits (day, user_id, role, section, n) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (day, user_id, section) DO UPDATE SET n = page_visits.n + 1`,
    day,
    userId,
    role,
    sectionOf(path).slice(0, 80),
  );
}

export async function usageReport(user: AppUser, days = 30) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees this.");
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const rows = await all<{ day: string; user_id: string; role: string; section: string; n: number }>("SELECT day, user_id, role, section, n FROM page_visits WHERE day >= ?", since);
  const sum = <K extends string>(key: (r: (typeof rows)[number]) => K) => {
    const m = new Map<K, { visits: number; people: Set<string> }>();
    for (const r of rows) {
      const k = key(r);
      const e = m.get(k) ?? { visits: 0, people: new Set<string>() };
      e.visits += Number(r.n);
      e.people.add(r.user_id);
      m.set(k, e);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, visits: v.visits, people: v.people.size })).sort((x, y) => y.visits - x.visits);
  };
  const quiet = await all<{ id: string; name: string; last_login_at: string | null }>(
    "SELECT id, name, last_login_at FROM users WHERE active = 1 AND deleted_at IS NULL AND (last_login_at IS NULL OR last_login_at < ?) ORDER BY last_login_at NULLS FIRST, name LIMIT 100",
    new Date(Date.now() - 14 * 864e5).toISOString(),
  );
  return { days, sections: sum((r) => r.section).slice(0, 40), roles: sum((r) => r.role), daily: sum((r) => r.day).sort((x, y) => x.key.localeCompare(y.key)), quiet };
}
export type UsageReport = Awaited<ReturnType<typeof usageReport>>;
