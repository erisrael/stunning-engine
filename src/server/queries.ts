import { all, get, parseJson, placeholders, type Param } from "./db";
import { getSettings } from "./settings";
import { scopeSql, type AppUser } from "./users";
import type { Filters } from "@/lib/filters";
import { STAGES, type AttemptStatus, type Stage } from "@/lib/domain";
import { endOfLocalDayIso, localInputToIso } from "@/lib/format";

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

export type Grade = { id: string; code: string; name: string; sort: number; active: number };
export type Subject = { id: string; code: string; name: string; name_am: string | null; sort: number; active: number };
export type Unit = { id: string; grade_id: string; subject_id: string; number: number; title: string; title_am: string | null; term: string | null };

export async function taxonomy() {
  const grades = await all<Grade>("SELECT * FROM grades ORDER BY sort, code");
  const subjects = await all<Subject>("SELECT * FROM subjects ORDER BY sort, name");
  const gradeSubjects = await all<{ grade_id: string; subject_id: string }>("SELECT * FROM grade_subjects");
  const units = await all<Unit>("SELECT id, grade_id, subject_id, number, title, title_am, term FROM units ORDER BY grade_id, subject_id, number");
  return { grades, subjects, gradeSubjects, units };
}
export type Taxonomy = Awaited<ReturnType<typeof taxonomy>>;

// ---------------------------------------------------------------------------
// Item listing with shared filters
// ---------------------------------------------------------------------------

export type StageCell = {
  attemptId: string | null;
  status: AttemptStatus | null;
  substate: string | null;
  ownerId: string | null;
  attempts: number;
  enteredAt: string | null;
  completedAt: string | null;
};

export type ItemListRow = {
  id: string;
  code: string;
  title: string;
  title_am: string | null;
  lifecycle: string;
  stage: Stage | null;
  stage_status: AttemptStatus | null;
  substate: string | null;
  priority: string;
  language: string;
  content_type: string;
  deliverable_type: string;
  complexity: string;
  teacher: string | null;
  provenance: string;
  target_duration_min: number | null;
  actual_duration_min: number | null;
  current_due_at: string | null;
  original_due_at: string | null;
  planned_publish_at: string | null;
  scheduled_publish_at: string | null;
  published_at: string | null;
  live_url: string | null;
  next_action: string | null;
  next_action_owner_id: string | null;
  created_at: string;
  updated_at: string;
  released_at: string | null;
  version: number;
  tags: string;
  grade_id: string;
  grade_name: string;
  grade_code: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  unit_id: string | null;
  unit_number: number | null;
  unit_title: string | null;
  lesson_number: number | null;
  lesson_title: string | null;
  grade_sort: number;
  subject_sort: number;
  recorded_at: string | null;
  edited_at: string | null;
  uploaded_at: string | null;
  stage_entered_at: string | null;
  membership_count: number;
  comment_count: number;
  open_questions: number;
  open_blocker: string | null;
  last_actor_id: string | null;
  stages: Record<Stage, StageCell>;
  owners: Record<Stage, string | null>;
  stageDue: Record<Stage, string | null>;
  rework_count: number;
};

const SORTS: Record<string, string> = {
  updated: "i.updated_at",
  code: "i.code",
  title: "i.title",
  due: "COALESCE(i.current_due_at, '9999')",
  priority: "CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END",
  stage: "CASE i.lifecycle WHEN 'draft' THEN 0 WHEN 'published' THEN 9 ELSE CASE i.stage WHEN 'recording' THEN 1 WHEN 'editing' THEN 2 WHEN 'uploading' THEN 3 ELSE 4 END END",
  age: "COALESCE(ca.entered_at, i.created_at)",
  grade: "g.sort, sub.sort, COALESCE(un.number, 0), COALESCE(les.number, 0)",
  curriculum: "g.sort, sub.sort, COALESCE(un.number, 0), COALESCE(les.number, 0), i.code",
  subject: "sub.sort, sub.name, g.sort, COALESCE(un.number, 0), COALESCE(les.number, 0), i.code",
  published: "COALESCE(i.published_at, '')",
  created: "i.created_at",
};

function dateColumn(field: string) {
  switch (field) {
    case "original_due":
      return "i.original_due_at";
    case "created":
      return "i.created_at";
    case "released":
      return "i.released_at";
    case "published":
      return "i.published_at";
    case "planned":
      return "i.planned_publish_at";
    case "updated":
      return "i.updated_at";
    case "completed":
      return "(SELECT MAX(completed_at) FROM stage_attempts x WHERE x.item_id = i.id)";
    default:
      return "i.current_due_at";
  }
}

export async function buildWhere(user: AppUser, f: Filters, nowIso: string) {
  const tz = (await getSettings()).workspace.timezone;
  const where: string[] = [];
  const params: Param[] = [];
  const sc = scopeSql(user, "i");
  where.push(sc.sql);
  params.push(...sc.params);
  const inList = (col: string, values: string[]) => {
    where.push(`${col} IN (${placeholders(values.length)})`);
    params.push(...values);
  };
  if (f.g.length || f.s.length || f.u.length) {
    const conds: string[] = [];
    if (f.g.length) {
      conds.push(`m.grade_id IN (${placeholders(f.g.length)})`);
      params.push(...f.g);
    }
    if (f.s.length) {
      conds.push(`m.subject_id IN (${placeholders(f.s.length)})`);
      params.push(...f.s);
    }
    if (f.u.length) {
      conds.push(`m.unit_id IN (${placeholders(f.u.length)})`);
      params.push(...f.u);
    }
    where.push(`EXISTS (SELECT 1 FROM item_memberships m WHERE m.item_id = i.id AND ${conds.join(" AND ")})`);
  }
  if (f.life.length) inList("i.lifecycle", f.life);
  else where.push("i.lifecycle NOT IN ('archived','cancelled')");
  if (f.stage.length) {
    const conds: string[] = [];
    const stages = f.stage.filter((s) => (STAGES as readonly string[]).includes(s));
    if (stages.length) {
      conds.push(`(i.lifecycle = 'in_production' AND i.stage IN (${placeholders(stages.length)}))`);
      params.push(...stages);
    }
    if (f.stage.includes("draft")) conds.push("i.lifecycle = 'draft'");
    if (f.stage.includes("published")) conds.push("i.lifecycle = 'published'");
    if (conds.length) where.push(`(${conds.join(" OR ")})`);
  }
  if (f.status.length) {
    const subs = f.status.filter((s) => s.startsWith("sub:")).map((s) => s.slice(4));
    const sts = f.status.filter((s) => !s.startsWith("sub:"));
    const conds: string[] = [];
    if (sts.length) {
      conds.push(`(i.lifecycle = 'in_production' AND i.stage_status IN (${placeholders(sts.length)}))`);
      params.push(...sts);
    }
    if (subs.length) {
      conds.push(`i.substate IN (${placeholders(subs.length)})`);
      params.push(...subs);
    }
    where.push(`(${conds.join(" OR ")})`);
  }
  if (f.owner.length) {
    const ids = f.owner.map((o) => (o === "me" ? user.id : o)).filter((o) => o !== "unassigned");
    const conds: string[] = [];
    if (ids.length) {
      conds.push(`ca.owner_id IN (${placeholders(ids.length)})`);
      params.push(...ids);
      conds.push(`(i.lifecycle = 'draft' AND EXISTS (SELECT 1 FROM stage_assignments sa WHERE sa.item_id = i.id AND sa.user_id IN (${placeholders(ids.length)})))`);
      params.push(...ids);
    }
    if (f.owner.includes("unassigned")) conds.push("(i.lifecycle = 'in_production' AND ca.owner_id IS NULL)");
    where.push(`(${conds.join(" OR ")})`);
  }
  if (f.pri.length) inList("i.priority", f.pri);
  if (f.lang.length) inList("i.language", f.lang);
  if (f.ctype.length) inList("i.content_type", f.ctype);
  if (f.dtype.length) inList("i.deliverable_type", f.dtype);
  if (f.cx.length) inList("i.complexity", f.cx);
  if (f.prov.length) inList("i.provenance", f.prov);
  if (f.platform.length) {
    where.push(`EXISTS (SELECT 1 FROM publication_targets pt WHERE pt.item_id = i.id AND pt.platform IN (${placeholders(f.platform.length)}))`);
    params.push(...f.platform);
  }
  if (f.tag) {
    where.push("i.tags ILIKE ?");
    params.push(`%"${f.tag.replace(/"/g, "")}"%`);
  }
  if (f.teacher) {
    where.push("i.teacher ILIKE ?");
    params.push(`%${f.teacher}%`);
  }
  if (f.q) {
    where.push("(i.title ILIKE ? OR i.code ILIKE ? OR i.title_am ILIKE ? OR i.id = ? OR i.teacher ILIKE ?)");
    const like = `%${f.q.trim()}%`;
    params.push(like, like, like, f.q.trim(), like);
  }
  for (const flag of f.flags) {
    if (flag === "overdue") {
      where.push("(i.current_due_at IS NOT NULL AND i.current_due_at < ? AND i.lifecycle IN ('draft','in_production'))");
      params.push(nowIso);
    }
    if (flag === "blocked") where.push("(i.lifecycle = 'in_production' AND i.stage_status = 'blocked')");
    if (flag === "unassigned") where.push("(i.lifecycle = 'in_production' AND ca.owner_id IS NULL)");
    if (flag === "waiting") where.push("(i.lifecycle = 'in_production' AND i.stage_status = 'awaiting_handoff')");
    if (flag === "rework") where.push("EXISTS (SELECT 1 FROM stage_attempts rw WHERE rw.item_id = i.id AND rw.cause <> 'initial')");
    if (flag === "stale") {
      where.push("EXISTS (SELECT 1 FROM work_sessions st WHERE st.item_id = i.id AND st.ended_at IS NULL AND st.started_at < ?)");
      params.push(new Date(new Date(nowIso).getTime() - (await getSettings()).alerts.staleSessionHours * 3600e3).toISOString());
    }
    if (flag === "missing")
      where.push(`(i.lifecycle = 'in_production' AND (
        (i.stage = 'recording' AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.attempt_id = i.current_attempt_id AND a.kind = 'raw'))
        OR (i.stage = 'editing' AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.item_id = i.id AND a.kind = 'master' AND a.status = 'current'))
        OR (i.stage = 'uploading' AND EXISTS (SELECT 1 FROM publication_targets t WHERE t.item_id = i.id AND t.required = 1 AND t.upload_status <> 'uploaded'))
        OR (i.stage = 'publication' AND EXISTS (SELECT 1 FROM publication_targets t WHERE t.item_id = i.id AND t.required = 1 AND t.live_url IS NULL))
      ))`);
  }
  if (f.from || f.to) {
    const col = dateColumn(f.dateField);
    if (f.from) {
      where.push(`${col} >= ?`);
      params.push(localInputToIso(`${f.from}T00:00`, tz));
    }
    if (f.to) {
      where.push(`${col} <= ?`);
      params.push(endOfLocalDayIso(f.to, tz));
    }
  }
  return { where: where.join(" AND "), params };
}

const BASE_FROM = `
  FROM items i
  LEFT JOIN item_memberships pm ON pm.item_id = i.id AND pm.is_primary = 1
  LEFT JOIN grades g ON g.id = pm.grade_id
  LEFT JOIN subjects sub ON sub.id = pm.subject_id
  LEFT JOIN units un ON un.id = pm.unit_id
  LEFT JOIN lessons les ON les.id = i.lesson_id
  LEFT JOIN stage_attempts ca ON ca.id = i.current_attempt_id
`;

export async function countItems(user: AppUser, f: Filters, nowIso: string) {
  const { where, params } = await buildWhere(user, f, nowIso);
  return (await get<{ c: number }>(`SELECT COUNT(DISTINCT i.id) AS c ${BASE_FROM} WHERE ${where}`, ...params))?.c ?? 0;
}

export async function listItems(user: AppUser, f: Filters, nowIso: string, opts: { all?: boolean; ids?: string[] } = {}): Promise<{ rows: ItemListRow[]; total: number }> {
  const { where, params } = await buildWhere(user, f, nowIso);
  let w = where;
  const p = [...params];
  if (opts.ids) {
    if (!opts.ids.length) return { rows: [], total: 0 };
    w += ` AND i.id IN (${placeholders(opts.ids.length)})`;
    p.push(...opts.ids);
  }
  const total = (await get<{ c: number }>(`SELECT COUNT(DISTINCT i.id) AS c ${BASE_FROM} WHERE ${w}`, ...p))?.c ?? 0;
  const order = `${SORTS[f.sort] ?? SORTS.updated} ${f.dir === "asc" ? "ASC" : "DESC"}, i.code ASC`;
  const limit = opts.all ? "" : `LIMIT ${f.size} OFFSET ${(f.page - 1) * f.size}`;
  const rows = await all<Omit<ItemListRow, "stages" | "owners" | "stageDue">>(
      `SELECT i.id, i.code, i.title, i.title_am, i.lifecycle, i.stage, i.stage_status, i.substate, i.priority, i.language, i.content_type,
       i.deliverable_type, i.complexity, i.teacher, i.provenance, i.target_duration_min, i.actual_duration_min, i.current_due_at,
       i.original_due_at, i.planned_publish_at, i.scheduled_publish_at, i.published_at, i.live_url, i.next_action, i.next_action_owner_id,
       i.created_at, i.updated_at, i.released_at, i.version, i.tags, i.recorded_at, i.edited_at, i.uploaded_at,
       g.sort AS grade_sort, sub.sort AS subject_sort, les.title AS lesson_title,
       g.id AS grade_id, g.name AS grade_name, g.code AS grade_code, sub.id AS subject_id, sub.name AS subject_name, sub.code AS subject_code,
       un.id AS unit_id, un.number AS unit_number, un.title AS unit_title, les.number AS lesson_number,
       ca.entered_at AS stage_entered_at,
       (SELECT COUNT(*) FROM item_memberships mm WHERE mm.item_id = i.id) AS membership_count,
       (SELECT COUNT(*) FROM comments c WHERE c.item_id = i.id AND c.deleted_at IS NULL) AS comment_count,
       (SELECT COUNT(*) FROM manager_questions q WHERE q.item_id = i.id AND q.status = 'open') AS open_questions,
       (SELECT b.cause FROM blockers b WHERE b.item_id = i.id AND b.resolved_at IS NULL ORDER BY b.opened_at DESC LIMIT 1) AS open_blocker,
       (SELECT e.actor_id FROM audit_events e WHERE e.item_id = i.id ORDER BY e.occurred_at DESC LIMIT 1) AS last_actor_id,
       (SELECT COUNT(*) FROM stage_attempts rw WHERE rw.item_id = i.id AND rw.cause <> 'initial') AS rework_count
     ${BASE_FROM} WHERE ${w} ORDER BY ${order} ${limit}`,
      ...p,
    );
  return { rows: await hydrateStages(rows), total };
}

async function hydrateStages(rows: Omit<ItemListRow, "stages" | "owners" | "stageDue">[]): Promise<ItemListRow[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const attempts: { id: string; item_id: string; stage: Stage; status: AttemptStatus; substate: string | null; owner_id: string | null; entered_at: string; completed_at: string | null; attempt_no: number }[] = [];
  const assigns: { item_id: string; stage: Stage; user_id: string | null; stage_due_at: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const c = ids.slice(i, i + 500);
    attempts.push(
      ...await all<(typeof attempts)[number]>(
                `SELECT id, item_id, stage, status, substate, owner_id, entered_at, completed_at, attempt_no FROM stage_attempts
         WHERE item_id IN (${placeholders(c.length)}) ORDER BY entered_at`,
                ...c,
              ),
    );
    assigns.push(...await all<(typeof assigns)[number]>(`SELECT item_id, stage, user_id, stage_due_at FROM stage_assignments WHERE item_id IN (${placeholders(c.length)})`, ...c));
  }
  const byItem = new Map<string, typeof attempts>();
  for (const a of attempts) (byItem.get(a.item_id) ?? byItem.set(a.item_id, []).get(a.item_id)!).push(a);
  return rows.map((r) => {
    const list = byItem.get(r.id) ?? [];
    const stages = {} as Record<Stage, StageCell>;
    const owners = {} as Record<Stage, string | null>;
    const stageDue = {} as Record<Stage, string | null>;
    for (const st of STAGES) {
      const forStage = list.filter((a) => a.stage === st);
      // Latest non-superseded attempt wins; superseded attempts show as history only.
      const latest = [...forStage].reverse().find((a) => a.status !== "superseded") ?? forStage.at(-1);
      const asg = assigns.find((a) => a.item_id === r.id && a.stage === st);
      stages[st] = {
        attemptId: latest?.id ?? null,
        status: latest?.status ?? null,
        substate: latest?.substate ?? null,
        ownerId: latest?.owner_id ?? asg?.user_id ?? null,
        attempts: forStage.length,
        enteredAt: latest?.entered_at ?? null,
        completedAt: latest?.completed_at ?? null,
      };
      owners[st] = asg?.user_id ?? null;
      stageDue[st] = asg?.stage_due_at ?? null;
    }
    // A reopened upstream stage makes downstream completed attempts stale; show them as not started.
    if (r.lifecycle === "in_production" && r.stage) {
      const idx = STAGES.indexOf(r.stage);
      for (const st of STAGES.slice(idx + 1)) {
        if (stages[st].status === "completed") stages[st] = { ...stages[st], status: null, substate: null };
      }
    }
    return { ...r, stages, owners, stageDue };
  });
}

// ---------------------------------------------------------------------------
// Item detail
// ---------------------------------------------------------------------------

export async function itemDetail(itemId: string) {
  const item = await get<Record<string, unknown> & { id: string; tags: string }>("SELECT * FROM items WHERE id = ?", itemId);
  if (!item) return null;
  const memberships = await all<{ grade_id: string; subject_id: string; unit_id: string | null; is_primary: number; grade_name: string; subject_name: string; unit_title: string | null; unit_number: number | null }>(
      `SELECT m.*, g.name AS grade_name, s.name AS subject_name, u.title AS unit_title, u.number AS unit_number
     FROM item_memberships m JOIN grades g ON g.id = m.grade_id JOIN subjects s ON s.id = m.subject_id LEFT JOIN units u ON u.id = m.unit_id
     WHERE m.item_id = ? ORDER BY m.is_primary DESC, g.sort`,
      itemId,
    );
  const lesson = item.lesson_id
    ? await get<{ id: string; number: number; title: string; title_am: string | null; objectives: string | null }>("SELECT * FROM lessons WHERE id = ?", item.lesson_id as string)
    : null;
  const siblings = item.lesson_id
    ? await all<{ id: string; code: string; title: string; deliverable_type: string; lifecycle: string; stage: string | null }>(
              "SELECT id, code, title, deliverable_type, lifecycle, stage FROM items WHERE lesson_id = ? AND id <> ? ORDER BY code",
              item.lesson_id as string,
              itemId,
            )
    : [];
  const assignments = await all<{ stage: Stage; user_id: string | null; stage_due_at: string | null; assigned_at: string }>(
      "SELECT stage, user_id, stage_due_at, assigned_at FROM stage_assignments WHERE item_id = ?",
      itemId,
    );
  const attempts = await all<{
      id: string;
      stage: Stage;
      attempt_no: number;
      cause: string;
      cause_note: string | null;
      status: AttemptStatus;
      substate: string | null;
      owner_id: string | null;
      entered_at: string;
      first_started_at: string | null;
      handoff_submitted_at: string | null;
      completed_at: string | null;
      closed_at: string | null;
      raw_duration_min: number | null;
      notes: string | null;
    }>("SELECT * FROM stage_attempts WHERE item_id = ? ORDER BY entered_at", itemId);
  const sessions = await all<{ id: string; attempt_id: string; user_id: string; started_at: string; ended_at: string | null; end_reason: string | null; corrected_from: string | null; correction_reason: string | null }>(
      "SELECT * FROM work_sessions WHERE item_id = ? ORDER BY started_at",
      itemId,
    );
  const assets = await all<{ id: string; attempt_id: string | null; stage: Stage; kind: string; version_no: number; label: string | null; url: string | null; camera_code: string | null; source_ref: string | null; duration_min: number | null; status: string; notes: string | null; created_by: string | null; created_at: string }>(
      "SELECT * FROM assets WHERE item_id = ? ORDER BY kind, version_no DESC",
      itemId,
    );
  const checklist = await all<{ attempt_id: string; key: string; checked: number; checked_by: string | null; checked_at: string | null }>(
      `SELECT c.* FROM checklist_results c JOIN stage_attempts a ON a.id = c.attempt_id WHERE a.item_id = ?`,
      itemId,
    );
  const reviews = await all<{ id: string; attempt_id: string; kind: string; decision: string; reason_category: string | null; note: string | null; reviewer_id: string | null; asset_id: string | null; self_approval: number; valid: number; created_at: string }>(
      "SELECT * FROM handoff_reviews WHERE item_id = ? ORDER BY created_at",
      itemId,
    );
  const blockers = await all<{ id: string; attempt_id: string; cause: string; note: string | null; resolver_id: string | null; opened_by: string | null; opened_at: string; resolved_at: string | null; resolved_by: string | null; resolution: string | null }>(
      "SELECT * FROM blockers WHERE item_id = ? ORDER BY opened_at",
      itemId,
    );
  const deadlines = await all<{ id: number; old_due_at: string | null; new_due_at: string | null; reason: string; actor_id: string | null; created_at: string }>(
      "SELECT * FROM deadline_revisions WHERE item_id = ? ORDER BY created_at",
      itemId,
    );
  const pubTargets = await all<Record<string, unknown> & { platform: string }>("SELECT * FROM publication_targets WHERE item_id = ? ORDER BY required DESC, platform", itemId);
  const events = await all<{ id: string; attempt_id: string | null; stage: string | null; actor_id: string | null; actor_kind: string; action: string; summary: string; old_value: string | null; new_value: string | null; reason: string | null; request_id: string | null; job_id: string | null; occurred_at: string; source_occurred_at: string | null }>(
      "SELECT * FROM audit_events WHERE item_id = ? ORDER BY occurred_at DESC, seq DESC",
      itemId,
    );
  const questions = await all<{ id: string; asked_by: string; owner_id: string; question: string; due_at: string | null; status: string; answer: string | null; answered_at: string | null; created_at: string; stage: string | null }>(
      "SELECT * FROM manager_questions WHERE item_id = ? ORDER BY created_at DESC",
      itemId,
    );
  const sessionsPlanned = await all<{ id: string; scheduled_start: string; duration_min: number; presenter: string | null; location: string | null; status: string; outcome_note: string | null }>(
      "SELECT * FROM recording_sessions WHERE item_id = ? ORDER BY scheduled_start",
      itemId,
    );
  const revisions = await all<{ id: string; code: string; lifecycle: string; stage: string | null; created_at: string }>(
      "SELECT id, code, lifecycle, stage, created_at FROM items WHERE revision_of_id = ? ORDER BY created_at",
      itemId,
    );
  const revisionOf = item.revision_of_id ? await get<{ id: string; code: string }>("SELECT id, code FROM items WHERE id = ?", item.revision_of_id as string) : null;
  const collaborators = await all<{ user_id: string; stage: string | null }>("SELECT user_id, stage FROM item_collaborators WHERE item_id = ?", itemId);
  return {
    item,
    tags: parseJson<string[]>(item.tags, []),
    memberships,
    lesson,
    siblings,
    assignments,
    attempts,
    sessions,
    assets,
    checklist,
    reviews,
    blockers,
    deadlines,
    targets: pubTargets,
    events,
    questions,
    recordingSessions: sessionsPlanned,
    revisions,
    revisionOf,
    collaborators,
  };
}
export type ItemDetail = NonNullable<Awaited<ReturnType<typeof itemDetail>>>;
