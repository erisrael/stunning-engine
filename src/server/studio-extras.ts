// Studio on the same footing as the work departments: its configuration (the review checklist), the review
// checklist on each piece of work, and the data for its Board, Calendar and Team views.

import { all, get, nowIso, parseJson, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { deptAccess, deptPeople } from "./departments";
import { can, type AppUser } from "./users";
import { periodRange, type Period } from "@/lib/dashboards";
import type { ChecklistLine, TaskCheck } from "@/lib/dept-config";
import { RESOURCE_TYPES, type ResourceType } from "@/lib/studio";

// subjectReviewers: people (not only heads and leads) who review work in a subject (Phase 12, "Subject review").
export type StudioConfig = { reviewChecklist: ChecklistLine[]; requireChecklist: boolean; subjectReviewers: Record<string, string[]> };
const DEFAULT: StudioConfig = { reviewChecklist: [], requireChecklist: false, subjectReviewers: {} };

const cleanReviewers = (v: unknown): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(v && typeof v === "object" ? (v as Record<string, unknown>) : {})
      .filter(([k, ids]) => /^[A-Za-z0-9_-]{1,60}$/.test(k) && Array.isArray(ids))
      .map(([k, ids]) => [k, [...new Set((ids as unknown[]).filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(x)))].slice(0, 20)] as const)
      .filter(([, ids]) => ids.length),
  );

export async function getStudioConfig(): Promise<StudioConfig> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.studio'");
  const v = parseJson<Partial<StudioConfig>>(row?.value, {});
  return { reviewChecklist: Array.isArray(v.reviewChecklist) ? v.reviewChecklist : [], requireChecklist: !!v.requireChecklist, subjectReviewers: cleanReviewers(v.subjectReviewers ?? DEFAULT.subjectReviewers) };
}

// Studio heads and Admin set the review checklist.
export async function canConfigureStudio(user: AppUser) {
  const a = await deptAccess(user, "studio");
  return can(user, "users.manage") || (a.position === "head" && !a.readOnly);
}

export async function saveStudioConfig(user: AppUser, input: StudioConfig) {
  if (!(await canConfigureStudio(user))) throw new WorkflowError("FORBIDDEN", "Only Studio heads and Admin configure Studio.");
  const lines = (input.reviewChecklist ?? [])
    .map((l) => ({ text: String(l.text ?? "").replace(/\s+/g, " ").trim().slice(0, 160), verify: !!l.verify }))
    .filter((l) => l.text)
    .slice(0, 30);
  const cfg: StudioConfig = { reviewChecklist: lines, requireChecklist: !!input.requireChecklist, subjectReviewers: cleanReviewers(input.subjectReviewers ?? (await getStudioConfig()).subjectReviewers) };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.studio', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(cfg),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "studio.config", summary: `${user.name} changed the Studio review checklist (${lines.length} lines${cfg.requireChecklist ? ", required" : ""})` });
}

// Ticks and verifications on a piece of work's review checklist: the author or assignee ticks; heads and leads verify.
export async function setResourceChecklist(user: AppUser, id: string, input: TaskCheck[]) {
  const a = await deptAccess(user, "studio");
  if (!a.view || a.readOnly) throw new WorkflowError("FORBIDDEN", "Studio is read only for you.");
  const r = await get<{ author_id: string | null; assignee_id: string | null; checklist: string; title: string }>("SELECT author_id, assignee_id, checklist, title FROM studio_resources WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Not found.");
  if (!a.manage && r.author_id !== user.id && r.assignee_id !== user.id) throw new WorkflowError("FORBIDDEN", "Not your work.");
  const old = parseJson<TaskCheck[]>(r.checklist, []);
  const next = old.map((c) => {
    const x = input.find((i) => i.id === c.id);
    if (!x) return c;
    const done = !!x.done;
    let verifiedBy = done ? c.verifiedBy : null;
    if (done && c.verify && !!x.verifiedBy !== !!c.verifiedBy) {
      if (!a.manage) throw new WorkflowError("FORBIDDEN", "Only Studio heads and leads verify checklist lines.");
      verifiedBy = x.verifiedBy ? user.id : null;
    }
    return { ...c, done, doneBy: done ? (c.done ? c.doneBy : user.id) : null, verifiedBy };
  });
  await run("UPDATE studio_resources SET checklist = ?, updated_at = ? WHERE id = ?", JSON.stringify(next), nowIso(), id);
}

export type StudioWork = { id: string; type: ResourceType; title: string; status: string; author_id: string | null; author_name: string | null; assignee_id: string | null; assignee_name: string | null; due_date: string | null; grade: string | null; subject: string | null; updated_at: string; published_at: string | null; checklist: { total: number; done: number } };

// Every piece of work the viewer can see, all types together (Board and Calendar).
export async function studioWork(user: AppUser, f: { q?: string | null; type?: string | null; person?: string | null; grade?: string | null } = {}): Promise<StudioWork[]> {
  const a = await deptAccess(user, "studio");
  if (!a.view) throw new WorkflowError("FORBIDDEN", "You do not have access to Studio.");
  const where = ["r.status <> 'archived'"];
  const params: string[] = [];
  if (!a.manage && !a.readOnly) (where.push("(r.author_id = ? OR r.assignee_id = ? OR r.status = 'published')"), params.push(user.id, user.id));
  if (f.type && (RESOURCE_TYPES as readonly string[]).includes(f.type)) (where.push("r.type = ?"), params.push(f.type));
  if (f.person) (where.push("(r.author_id = ? OR r.assignee_id = ?)"), params.push(f.person === "me" ? user.id : f.person, f.person === "me" ? user.id : f.person));
  if (f.grade) (where.push("r.grade_id = ?"), params.push(f.grade));
  if (f.q?.trim()) (where.push("lower(r.title) LIKE ?"), params.push(`%${f.q.trim().toLowerCase()}%`));
  const rows = await all<Omit<StudioWork, "checklist"> & { checklist: string }>(
    `SELECT r.id, r.type, r.title, r.status, r.author_id, ua.name AS author_name, r.assignee_id, us.name AS assignee_name, r.due_date, g.name AS grade, s.name AS subject, r.updated_at, r.published_at, r.checklist
     FROM studio_resources r LEFT JOIN users ua ON ua.id = r.author_id LEFT JOIN users us ON us.id = r.assignee_id LEFT JOIN grades g ON g.id = r.grade_id LEFT JOIN subjects s ON s.id = r.subject_id
     WHERE ${where.join(" AND ")} ORDER BY r.updated_at DESC LIMIT 2000`,
    ...params,
  );
  return rows.map((r) => {
    const c = parseJson<TaskCheck[]>(r.checklist, []);
    return { ...r, checklist: { total: c.length, done: c.filter((x) => x.done).length } };
  });
}

// Per person: drafts, work in review, approved work waiting to be published, overdue work and what was published.
export async function studioTeam(user: AppUser, period: Period) {
  const a = await deptAccess(user, "studio");
  if (!a.manage && !a.readOnly) throw new WorkflowError("FORBIDDEN", "The team view is for Studio heads, leads and owners.");
  const range = periodRange(period);
  const today = nowIso().slice(0, 10);
  const [people, rows] = await Promise.all([deptPeople("studio"), studioWork(user)]);
  const of = (id: string) => rows.filter((r) => (r.assignee_id ?? r.author_id) === id);
  return {
    period: range,
    people: people.map((p) => {
      const mine = of(p.id);
      return {
        id: p.id,
        name: p.name,
        position: p.position,
        drafts: mine.filter((r) => r.status === "draft").length,
        review: mine.filter((r) => r.status === "review").length,
        approved: mine.filter((r) => r.status === "approved").length,
        overdue: mine.filter((r) => r.status !== "published" && r.due_date && r.due_date < today).length,
        published: mine.filter((r) => r.status === "published" && r.published_at && r.published_at.slice(0, 10) >= range.from && r.published_at.slice(0, 10) <= range.to).length,
        open: mine.filter((r) => r.status !== "published").sort((x, y) => (x.due_date ?? "9999").localeCompare(y.due_date ?? "9999")),
      };
    }),
  };
}
export type StudioTeamData = Awaited<ReturnType<typeof studioTeam>>;

// ---------------------------------------------------------------------------
// Studio's flow on Home (Phase 12): Assigned, Draft, Subject review, Approved, Published; a new version starts
// the loop again.
// ---------------------------------------------------------------------------

export type StudioFlowCard = { id: string; type: ResourceType; title: string; status: string; version: number; place: string; dueDate: string | null; assignee: string | null; author: string | null; note: string | null; checklist: { total: number; done: number }; subjectId: string | null };

export async function isSubjectReviewer(userId: string, subjectId: string | null) {
  if (!subjectId) return false;
  return ((await getStudioConfig()).subjectReviewers[subjectId] ?? []).includes(userId);
}

export async function studioHome(user: AppUser) {
  const a = await deptAccess(user, "studio");
  if (!a.view) return null;
  const cfg = await getStudioConfig();
  const mySubjects = Object.entries(cfg.subjectReviewers).filter(([, ids]) => ids.includes(user.id)).map(([k]) => k);
  const rows = await all<{
    id: string; type: ResourceType; title: string; status: string; version: number; due_date: string | null; author_id: string | null; author: string | null;
    assignee_id: string | null; assignee: string | null; review_note: string | null; checklist: string; subject_id: string | null; grade: string | null; subject: string | null; unit: number | null;
  }>(
    `SELECT r.id, r.type, r.title, r.status, r.version, r.due_date, r.author_id, ua.name AS author, r.assignee_id, us.name AS assignee, r.review_note, r.checklist, r.subject_id,
       g.name AS grade, s.name AS subject, u.number AS unit
     FROM studio_resources r LEFT JOIN users ua ON ua.id = r.author_id LEFT JOIN users us ON us.id = r.assignee_id LEFT JOIN grades g ON g.id = r.grade_id
     LEFT JOIN subjects s ON s.id = r.subject_id LEFT JOIN units u ON u.id = r.unit_id
     WHERE r.status IN ('draft', 'review', 'approved') ORDER BY r.due_date IS NULL, r.due_date, r.updated_at DESC LIMIT 2000`,
  );
  const card = (r: (typeof rows)[number]): StudioFlowCard => {
    const c = parseJson<TaskCheck[]>(r.checklist, []);
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      status: r.status,
      version: Number(r.version),
      place: [r.grade, r.subject, r.unit != null ? `Unit ${r.unit}` : null].filter(Boolean).join(" · "),
      dueDate: r.due_date,
      assignee: r.assignee,
      author: r.author,
      note: r.status === "draft" ? r.review_note : null,
      checklist: { total: c.length, done: c.filter((x) => x.done).length },
      subjectId: r.subject_id,
    };
  };
  const mine = rows.filter((r) => r.assignee_id === user.id || (!r.assignee_id && r.author_id === user.id)).map(card);
  const lead = a.manage && !a.readOnly;
  const canReview = (r: (typeof rows)[number]) => r.author_id !== user.id && (lead || (!!r.subject_id && mySubjects.includes(r.subject_id)));
  return {
    lead,
    reviewer: mySubjects.length > 0,
    mine,
    toReview: rows.filter((r) => r.status === "review" && canReview(r)).map(card),
    toPublish: lead ? rows.filter((r) => r.status === "approved").map(card) : [],
    unassigned: lead ? rows.filter((r) => r.status === "draft" && !r.assignee_id).map(card) : [],
  };
}
export type StudioHome = NonNullable<Awaited<ReturnType<typeof studioHome>>>;
