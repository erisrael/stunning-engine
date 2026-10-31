// The production team flow, as each person sees it on Home:
// - team members: their own assigned work as a board (To do, In progress, Done not sent, With team lead), with
//   everything a stage needs filled in right on the card;
// - team leads: approve work sent to them, hand it over to the next team's lead, accept what arrives, and assign.

import { all, get } from "./db";
import { evaluateRequirements, workChecklistItems, type Requirement } from "./workflow";
import { getSettings } from "./settings";
import { hasRole, isLeadOf, isManager, scopeSql, type AppUser } from "./users";
import { NEXT_STAGE, STAGES, type AttemptStatus, type Stage } from "@/lib/domain";

export type FlowCheck = { key: string; label: string; required: boolean; verify: boolean; checked: boolean; verified: boolean };
export type FlowTarget = { platform: string; label: string; status: string; externalId: string | null; url: string | null; playback: boolean; metadata: boolean };
export type FlowItem = {
  id: string;
  code: string;
  title: string;
  place: string;
  stage: Stage;
  status: AttemptStatus;
  version: number;
  dueAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  notes: string | null;
  submittedAt: string | null;
  running: boolean;
  rawDurationMin: number | null;
  finalDurationMin: number | null;
  assets: { kind: string; url: string | null; cameraCode: string | null; version: number }[];
  checks: FlowCheck[];
  requirements: Requirement[];
  targets: FlowTarget[];
  // Assigned for Recording but not started yet: Start puts it into production.
  draft: boolean;
};

type Row = {
  id: string;
  code: string;
  title: string;
  version: number;
  current_due_at: string | null;
  actual_duration_min: number | null;
  attempt_id: string;
  stage: Stage;
  status: AttemptStatus;
  owner_id: string | null;
  owner_name: string | null;
  notes: string | null;
  handoff_submitted_at: string | null;
  raw_duration_min: number | null;
  grade: string | null;
  subject: string | null;
  unit_number: number | null;
  part_number: number | null;
  draft?: number;
};

const BASE = `SELECT i.id, i.code, i.title, i.version, i.current_due_at, i.actual_duration_min, a.id AS attempt_id, a.stage, a.status, a.owner_id, u.name AS owner_name,
    a.notes, a.handoff_submitted_at, a.raw_duration_min, g.name AS grade, s.name AS subject, un.number AS unit_number, l.number AS part_number
  FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id
  LEFT JOIN users u ON u.id = a.owner_id
  LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1
  LEFT JOIN grades g ON g.id = m.grade_id LEFT JOIN subjects s ON s.id = m.subject_id
  LEFT JOIN units un ON un.id = m.unit_id LEFT JOIN lessons l ON l.id = i.lesson_id
  WHERE i.lifecycle = 'in_production'`;

const ORDER = "ORDER BY i.current_due_at IS NULL, i.current_due_at, g.sort, s.sort, un.number, l.number, i.code";

// Fills in what each card needs: checklist lines with their results, links already added, upload destinations,
// what is still required, and whether this person's timer is running.
async function hydrate(rows: Row[], viewerId: string): Promise<FlowItem[]> {
  if (!rows.length) return [];
  const settings = await getSettings();
  const out: FlowItem[] = [];
  for (const r of rows) {
    const results = await all<{ key: string; checked: number; verified_at: string | null }>("SELECT key, checked, verified_at FROM checklist_results WHERE attempt_id = ?", r.attempt_id);
    const res = (k: string) => results.find((x) => x.key === k);
    const checks: FlowCheck[] = [
      ...settings.checklists[r.stage].map((c) => ({ key: c.key, label: c.label, required: c.required, verify: !!c.verify, checked: !!res(c.key)?.checked, verified: !!res(c.key)?.verified_at })),
      ...(await workChecklistItems(r.id, r.stage)).map((c) => ({ key: `wc:${c.key}`, label: c.label, required: c.required, verify: c.verify, checked: !!res(`wc:${c.key}`)?.checked, verified: !!res(`wc:${c.key}`)?.verified_at })),
    ];
    const assets = await all<{ kind: string; url: string | null; camera_code: string | null; version_no: number }>(
      "SELECT kind, url, camera_code, version_no FROM assets WHERE item_id = ? AND status = 'current' ORDER BY created_at",
      r.id,
    );
    const targets =
      r.stage === "uploading"
        ? (
            await all<{ platform: string; upload_status: string; external_id: string | null; upload_url: string | null; playback_checked: number; metadata_checked: number }>(
              "SELECT platform, upload_status, external_id, upload_url, playback_checked, metadata_checked FROM publication_targets WHERE item_id = ? AND required = 1",
              r.id,
            )
          ).map((t) => ({
            platform: t.platform,
            label: settings.destinations.find((d) => d.key === t.platform)?.label ?? t.platform,
            status: t.upload_status,
            externalId: t.external_id,
            url: t.upload_url,
            playback: !!t.playback_checked,
            metadata: !!t.metadata_checked,
          }))
        : [];
    const running = !!(await get("SELECT 1 AS x FROM work_sessions WHERE attempt_id = ? AND user_id = ? AND ended_at IS NULL", r.attempt_id, viewerId));
    const place = [r.grade, r.subject, r.unit_number != null ? `Unit ${r.unit_number}` : null, r.part_number != null ? `Part ${r.part_number}` : null].filter(Boolean).join(" · ");
    out.push({
      id: r.id,
      code: r.code,
      title: r.title,
      place,
      stage: r.stage,
      status: r.status,
      version: Number(r.version),
      dueAt: r.current_due_at,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      notes: r.notes,
      submittedAt: r.handoff_submitted_at,
      running,
      rawDurationMin: r.raw_duration_min == null ? null : Number(r.raw_duration_min),
      finalDurationMin: r.actual_duration_min == null ? null : Number(r.actual_duration_min),
      assets: assets.map((a) => ({ kind: a.kind, url: a.url, cameraCode: a.camera_code, version: Number(a.version_no) })),
      checks,
      requirements: await evaluateRequirements(r.id),
      targets,
      draft: !!Number(r.draft ?? 0),
    });
  }
  return out;
}

// Production stages this person works in (not publication, which completes on release).
export function workStages(user: AppUser): Stage[] {
  return STAGES.filter((s) => s !== "publication" && hasRole(user, s));
}

// A team member's own work: assigned to them (or shared with them) in their stages, until the lead approves it.
export async function myWork(user: AppUser) {
  const stages = workStages(user);
  if (!stages.length) return { items: [] as FlowItem[], stages };
  const sc = scopeSql(user, "i");
  const rows = await all<Row>(
    `${BASE} AND a.stage IN (${stages.map(() => "?").join(",")}) AND a.status IN ('queued','in_progress','paused','blocked','finished','lead_review')
       AND (a.owner_id = ? OR EXISTS (SELECT 1 FROM item_collaborators c WHERE c.item_id = i.id AND c.user_id = ? AND c.stage = a.stage)) AND ${sc.sql} ${ORDER} LIMIT 300`,
    ...stages,
    user.id,
    user.id,
    ...sc.params,
  );
  // Parts assigned to them for Recording that nobody has started yet (still drafts).
  const drafts = stages.includes("recording")
    ? await all<Row>(
        `SELECT i.id, i.code, i.title, i.version, COALESCE(sa.stage_due_at, i.current_due_at) AS current_due_at, i.actual_duration_min, '' AS attempt_id, 'recording' AS stage,
            'queued' AS status, sa.user_id AS owner_id, u.name AS owner_name, NULL AS notes, NULL AS handoff_submitted_at, NULL AS raw_duration_min,
            g.name AS grade, s.name AS subject, un.number AS unit_number, l.number AS part_number, 1 AS draft
         FROM items i JOIN stage_assignments sa ON sa.item_id = i.id AND sa.stage = 'recording'
         LEFT JOIN users u ON u.id = sa.user_id
         LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1
         LEFT JOIN grades g ON g.id = m.grade_id LEFT JOIN subjects s ON s.id = m.subject_id
         LEFT JOIN units un ON un.id = m.unit_id LEFT JOIN lessons l ON l.id = i.lesson_id
         WHERE i.lifecycle = 'draft' AND sa.user_id = ? AND ${sc.sql} ${ORDER} LIMIT 300`,
        user.id,
        ...sc.params,
      )
    : [];
  return { items: [...(await hydrate(rows, user.id)), ...(await hydrate(drafts, user.id))], stages };
}

// Stages this person leads (managers: every stage).
export function ledStages(user: AppUser): Stage[] {
  return STAGES.filter((s) => isManager(user) || isLeadOf(user, s));
}

// The whole workflow from recording to published, for team leads' Home: what is in each stage, waiting to be
// handed over, and finished this week.
export type Glance = { drafts: number; published: number; overdue: number; stages: { stage: Stage; inWork: number; waiting: number; doneWeek: number }[] };

export async function workflowGlance(user: AppUser): Promise<Glance> {
  const sc = scopeSql(user, "i");
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const [byStage, byLife, done, overdue] = await Promise.all([
    all<{ stage: Stage; status: string; c: number }>(
      `SELECT a.stage, a.status, COUNT(*) AS c FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id WHERE i.lifecycle = 'in_production' AND ${sc.sql} GROUP BY a.stage, a.status`,
      ...sc.params,
    ),
    all<{ lifecycle: string; c: number }>(`SELECT i.lifecycle, COUNT(*) AS c FROM items i WHERE i.revision_of_id IS NULL AND ${sc.sql} GROUP BY i.lifecycle`, ...sc.params),
    all<{ stage: Stage; c: number }>(
      `SELECT a.stage, COUNT(*) AS c FROM stage_attempts a JOIN items i ON i.id = a.item_id WHERE a.completed_at >= ? AND ${sc.sql} GROUP BY a.stage`,
      week,
      ...sc.params,
    ),
    all<{ c: number }>(`SELECT COUNT(*) AS c FROM items i WHERE i.lifecycle IN ('draft','in_production') AND i.current_due_at < ? AND ${sc.sql}`, new Date().toISOString(), ...sc.params),
  ]);
  const num = (v: unknown) => Number(v ?? 0);
  return {
    drafts: num(byLife.find((x) => x.lifecycle === "draft")?.c),
    published: num(byLife.find((x) => x.lifecycle === "published")?.c),
    overdue: num(overdue[0]?.c),
    stages: STAGES.map((stage) => ({
      stage,
      inWork: byStage.filter((x) => x.stage === stage && x.status !== "awaiting_handoff").reduce((a, x) => a + num(x.c), 0),
      waiting: num(byStage.find((x) => x.stage === stage && x.status === "awaiting_handoff")?.c),
      doneWeek: num(done.find((x) => x.stage === stage)?.c),
    })),
  };
}

export type DeskPerson = { id: string; name: string; todo: number; active: number; done: number; review: number };

// The team lead's desk for one stage.
export async function leadDesk(user: AppUser, stage: Stage) {
  if (!isManager(user) && !isLeadOf(user, stage)) return null;
  const prev = STAGES[STAGES.indexOf(stage) - 1] ?? null;
  const sc = scopeSql(user, "i");
  const q = (where: string, ...params: string[]) => all<Row>(`${BASE} AND ${where} AND ${sc.sql} ${ORDER} LIMIT 300`, ...params, ...sc.params);
  const [review, ready, unassigned, incomingRows, people, counts] = await Promise.all([
    q("a.stage = ? AND a.status = 'lead_review'", stage),
    q("a.stage = ? AND a.status = 'ready'", stage),
    q("a.stage = ? AND a.status = 'queued' AND a.owner_id IS NULL", stage),
    prev ? q("a.stage = ? AND a.status = 'awaiting_handoff'", prev) : Promise.resolve([] as Row[]),
    all<{ id: string; name: string }>("SELECT u.id, u.name FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE r.role = ? AND u.active = 1 ORDER BY u.name", stage),
    all<{ owner_id: string; status: string; c: number }>(
      "SELECT a.owner_id, a.status, COUNT(*) AS c FROM stage_attempts a JOIN items i ON i.current_attempt_id = a.id WHERE a.stage = ? AND i.lifecycle = 'in_production' AND a.owner_id IS NOT NULL GROUP BY a.owner_id, a.status",
      stage,
    ),
  ]);
  // Items already in an open handover batch are accepted through it.
  const batch = incomingRows.length
    ? await all<{ item_id: string; handover_id: string; code: string }>(
        `SELECT x.item_id, h.id AS handover_id, h.code FROM handover_items x JOIN handovers h ON h.id = x.handover_id
         WHERE x.status = 'pending' AND h.status IN ('open','partial') AND x.item_id IN (${incomingRows.map(() => "?").join(",")})`,
        ...incomingRows.map((r) => r.id),
      )
    : [];
  const n = (owner: string, statuses: string[]) => counts.filter((c) => c.owner_id === owner && statuses.includes(c.status)).reduce((s, c) => s + Number(c.c), 0);
  return {
    stage,
    prev,
    next: NEXT_STAGE[stage] ?? null,
    glance: await workflowGlance(user),
    review: await hydrate(review, user.id),
    ready: await hydrate(ready, user.id),
    unassigned: await hydrate(unassigned, user.id),
    incoming: (await hydrate(incomingRows, user.id)).map((it) => ({ ...it, batch: batch.find((b) => b.item_id === it.id) ?? null })),
    people: people.map((p) => ({ id: p.id, name: p.name, todo: n(p.id, ["queued", "paused", "blocked"]), active: n(p.id, ["in_progress"]), done: n(p.id, ["finished"]), review: n(p.id, ["lead_review"]) })),
  };
}
export type LeadDeskData = NonNullable<Awaited<ReturnType<typeof leadDesk>>>;


