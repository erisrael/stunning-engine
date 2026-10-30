// Editorial workflow: checklist templates chosen per person, lead verification, bulk assignment and handover
// batches. Stage transitions always go through the workflow engine (assignStage, submitHandoff, acceptHandoff,
// returnHandoff), so its rules, audit trail and timings stay authoritative.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import {
  acceptHandoff,
  assignStage,
  audit,
  currentAttempt,
  requireAttempt,
  returnHandoff,
  submitHandoff,
  syncItem,
  WorkflowError,
  type Ctx,
  type WorkChecklistItem,
} from "./workflow";
import { managers, notify, teamLeads, usersWithRole } from "./notifications";
import { can, canViewItem, hasRole, isLeadOf, scopeSql, type AppUser } from "./users";
import { getSettings, saveSetting, type ChecklistItem } from "./settings";
import { NEXT_STAGE, STAGE_LABELS, STAGES, stageIndex, type Stage } from "@/lib/domain";

type Raw = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Rights
// ---------------------------------------------------------------------------

// Admin-level people act on every stage; team leads on their own.
function wide(user: AppUser) {
  return can(user, "items.plan") || can(user, "work.override") || can(user, "data.manage");
}

export function canAssign(user: AppUser, stage: Stage) {
  return can(user, "assign.bulk") && (can(user, "items.plan") || isLeadOf(user, stage));
}

export function canManageTemplates(user: AppUser, stage: Stage) {
  return can(user, "checklists.manage") && (wide(user) || isLeadOf(user, stage));
}

export function canVerify(user: AppUser, stage: Stage) {
  return can(user, "checklists.verify") && (wide(user) || isLeadOf(user, stage));
}

export function assignableStages(user: AppUser): Stage[] {
  return STAGES.filter((s) => canAssign(user, s));
}

export function templateStages(user: AppUser): Stage[] {
  return STAGES.filter((s) => canManageTemplates(user, s));
}

// ---------------------------------------------------------------------------
// Checklist templates
// ---------------------------------------------------------------------------

export type ChecklistTemplate = {
  id: string;
  stage: Stage;
  name: string;
  description: string | null;
  items: WorkChecklistItem[];
  active: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  used: number;
};

export type TemplateFilter = { stage?: Stage | null; q?: string | null; active?: "all" | "active" | "inactive"; sort?: "name" | "stage" | "updated" | "items" | "used"; dir?: "asc" | "desc" };

export async function listTemplates(f: TemplateFilter = {}): Promise<ChecklistTemplate[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (f.stage) {
    where.push("t.stage = ?");
    params.push(f.stage);
  }
  if (f.active === "active") where.push("t.active = 1");
  if (f.active === "inactive") where.push("t.active = 0");
  if (f.q?.trim()) {
    where.push("(lower(t.name) LIKE ? OR lower(COALESCE(t.description, '')) LIKE ? OR lower(t.items) LIKE ?)");
    const like = `%${f.q.trim().toLowerCase()}%`;
    params.push(like, like, like);
  }
  const rows = await all<Raw>(
    `SELECT t.*, u.name AS created_by_name, (SELECT COUNT(*) FROM work_checklists w WHERE w.template_id = t.id) AS used
     FROM checklist_templates t LEFT JOIN users u ON u.id = t.created_by ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    ...params,
  );
  const list = rows.map(toTemplate);
  const dir = f.dir === "desc" ? -1 : 1;
  const sort = f.sort ?? "stage";
  list.sort((a, b) => {
    const v =
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "updated"
          ? a.updated_at.localeCompare(b.updated_at)
          : sort === "items"
            ? a.items.length - b.items.length
            : sort === "used"
              ? a.used - b.used
              : stageIndex(a.stage) - stageIndex(b.stage) || a.name.localeCompare(b.name);
    return v * dir;
  });
  return list;
}

function toTemplate(r: Raw): ChecklistTemplate {
  return {
    id: r.id as string,
    stage: r.stage as Stage,
    name: r.name as string,
    description: (r.description as string) ?? null,
    items: parseJson<WorkChecklistItem[]>(r.items, []),
    active: !!r.active,
    created_by: (r.created_by as string) ?? null,
    created_by_name: (r.created_by_name as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    used: Number(r.used ?? 0),
  };
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "item"
  );
}

// Cleans template lines: labels required, keys stable and unique.
export function normalizeItems(items: Partial<WorkChecklistItem>[]): WorkChecklistItem[] {
  const out: WorkChecklistItem[] = [];
  const keys = new Set<string>();
  for (const it of items) {
    const label = String(it.label ?? "").replace(/\s+/g, " ").trim();
    if (!label || out.some((o) => o.label.toLowerCase() === label.toLowerCase())) continue;
    let key = slug(String(it.key || label));
    let n = 2;
    const base = key;
    while (keys.has(key)) key = `${base}_${n++}`;
    keys.add(key);
    out.push({ key, label, required: it.required !== false, verify: !!it.verify, hint: it.hint ? String(it.hint).trim() || null : null });
  }
  if (out.length > 60) throw new WorkflowError("VALIDATION", "A checklist can have at most 60 lines.");
  return out;
}

export type TemplateInput = { id?: string; stage: Stage; name: string; description?: string | null; items: Partial<WorkChecklistItem>[]; active?: boolean };

export async function saveTemplate(user: AppUser, input: TemplateInput) {
  if (!STAGES.includes(input.stage)) throw new WorkflowError("VALIDATION", "Choose a stage.");
  if (!canManageTemplates(user, input.stage)) throw new WorkflowError("FORBIDDEN", `You cannot manage ${STAGE_LABELS[input.stage]} checklists.`);
  const name = input.name?.replace(/\s+/g, " ").trim();
  if (!name) throw new WorkflowError("VALIDATION", "Give the checklist a name.");
  const items = normalizeItems(input.items ?? []);
  if (!items.length) throw new WorkflowError("VALIDATION", "Add at least one line.");
  const clash = await get<{ id: string }>("SELECT id FROM checklist_templates WHERE stage = ? AND lower(name) = lower(?)", input.stage, name);
  if (clash && clash.id !== input.id) throw new WorkflowError("VALIDATION", `A ${STAGE_LABELS[input.stage]} checklist named "${name}" already exists.`);
  const now = nowIso();
  const ctx: Ctx = { actor: user };
  if (input.id) {
    const old = await get<{ stage: Stage }>("SELECT stage FROM checklist_templates WHERE id = ?", input.id);
    if (!old) throw new WorkflowError("NOT_FOUND", "Checklist not found.");
    if (!canManageTemplates(user, old.stage)) throw new WorkflowError("FORBIDDEN", `You cannot manage ${STAGE_LABELS[old.stage]} checklists.`);
    await run(
      "UPDATE checklist_templates SET stage = ?, name = ?, description = ?, items = ?, active = ?, updated_at = ? WHERE id = ?",
      input.stage,
      name,
      input.description?.trim() || null,
      JSON.stringify(items),
      input.active !== false ? 1 : 0,
      now,
      input.id,
    );
    await audit(ctx, { action: "checklist_template.saved", summary: `${user.name} updated checklist "${name}" (${STAGE_LABELS[input.stage]})` });
    return input.id;
  }
  const id = uid("clt_");
  await run(
    "INSERT INTO checklist_templates (id, stage, name, description, items, active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    input.stage,
    name,
    input.description?.trim() || null,
    JSON.stringify(items),
    input.active !== false ? 1 : 0,
    user.id,
    now,
    now,
  );
  await audit(ctx, { action: "checklist_template.created", summary: `${user.name} created checklist "${name}" (${STAGE_LABELS[input.stage]})` });
  return id;
}

export async function deleteTemplates(user: AppUser, ids: string[]) {
  let n = 0;
  for (const id of ids) {
    const t = await get<{ stage: Stage; name: string }>("SELECT stage, name FROM checklist_templates WHERE id = ?", id);
    if (!t) continue;
    if (!canManageTemplates(user, t.stage)) throw new WorkflowError("FORBIDDEN", `You cannot manage ${STAGE_LABELS[t.stage]} checklists.`);
    // Work already assigned keeps its own copy of the lines, so deleting a template changes nothing in progress.
    await run("DELETE FROM checklist_templates WHERE id = ?", id);
    await audit({ actor: user }, { action: "checklist_template.deleted", summary: `${user.name} deleted checklist "${t.name}"` });
    n++;
  }
  return n;
}

export async function duplicateTemplate(user: AppUser, id: string) {
  const t = await get<Raw>("SELECT * FROM checklist_templates WHERE id = ?", id);
  if (!t) throw new WorkflowError("NOT_FOUND", "Checklist not found.");
  let name = `${t.name} (copy)`;
  let n = 2;
  while (await get("SELECT 1 AS x FROM checklist_templates WHERE stage = ? AND lower(name) = lower(?)", t.stage as string, name)) name = `${t.name} (copy ${n++})`;
  return saveTemplate(user, { stage: t.stage as Stage, name, description: t.description as string | null, items: parseJson(t.items, []), active: true });
}

export async function setTemplatesActive(user: AppUser, ids: string[], active: boolean) {
  for (const id of ids) {
    const t = await get<{ stage: Stage }>("SELECT stage FROM checklist_templates WHERE id = ?", id);
    if (!t || !canManageTemplates(user, t.stage)) continue;
    await run("UPDATE checklist_templates SET active = ?, updated_at = ? WHERE id = ?", active ? 1 : 0, nowIso(), id);
  }
}

// Import: an array of templates; one with the same stage and name is updated, otherwise created.
export async function importTemplates(user: AppUser, data: unknown) {
  const list = Array.isArray(data) ? data : Array.isArray((data as { templates?: unknown })?.templates) ? (data as { templates: unknown[] }).templates : null;
  if (!list) throw new WorkflowError("VALIDATION", "The file must contain a list of checklists.");
  const result = { created: 0, updated: 0, errors: [] as string[] };
  for (const [i, raw] of list.entries()) {
    const t = raw as Partial<TemplateInput> & { items?: unknown };
    try {
      const stage = String(t.stage ?? "").toLowerCase() as Stage;
      const items = Array.isArray(t.items) ? (t.items as unknown[]).map((x) => (typeof x === "string" ? { label: x } : (x as Partial<WorkChecklistItem>))) : [];
      const existing = await get<{ id: string }>("SELECT id FROM checklist_templates WHERE stage = ? AND lower(name) = lower(?)", stage, String(t.name ?? "").trim());
      await saveTemplate(user, { id: existing?.id, stage, name: String(t.name ?? ""), description: t.description ?? null, items, active: t.active !== false });
      if (existing) result.updated++;
      else result.created++;
    } catch (err) {
      result.errors.push(`Checklist ${i + 1}${t.name ? ` (${t.name})` : ""}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

// The workspace's standard checklist for a stage, as template lines (to start a new template from).
export async function standardLines(stage: Stage): Promise<WorkChecklistItem[]> {
  return (await getSettings()).checklists[stage].map((c) => ({ key: c.key, label: c.label, required: c.required, verify: !!c.verify }));
}

// The standard checklist of a stage applies to every item in it (stored in workspace settings). Team leads edit
// their own stage's; Admin and settings managers edit all. Existing keys are kept, so recorded results stay.
export async function saveStandardChecklist(user: AppUser, stage: Stage, items: Partial<WorkChecklistItem>[]) {
  if (!STAGES.includes(stage)) throw new WorkflowError("VALIDATION", "Choose a stage.");
  if (!canManageTemplates(user, stage) && !can(user, "settings.manage")) throw new WorkflowError("FORBIDDEN", `You cannot change the ${STAGE_LABELS[stage]} standard checklist.`);
  const s = await getSettings();
  const before = s.checklists[stage];
  const lines: ChecklistItem[] = normalizeItems(items).map((c) => ({ key: c.key, label: c.label, required: c.required, ...(c.verify ? { verify: true } : {}) }));
  await saveSetting("checklists", { ...s.checklists, [stage]: lines }, user.id);
  await audit({ actor: user }, { action: "settings.changed", summary: `${user.name} changed the ${STAGE_LABELS[stage]} standard checklist`, oldValue: before, newValue: lines });
}

// ---------------------------------------------------------------------------
// Checklists on work, and lead verification
// ---------------------------------------------------------------------------

export async function setWorkChecklist(ctx: Ctx, itemId: string, stage: Stage, input: { templateId: string | null; assignedTo?: string | null }) {
  const now = nowIso();
  if (!input.templateId) {
    const had = await get("SELECT 1 AS x FROM work_checklists WHERE item_id = ? AND stage = ?", itemId, stage);
    if (!had) return;
    await run("DELETE FROM work_checklists WHERE item_id = ? AND stage = ?", itemId, stage);
    await audit(ctx, { itemId, stage, action: "checklist.removed", summary: `${ctx.actor?.name ?? "System"} removed the ${STAGE_LABELS[stage]} checklist` });
    return;
  }
  const t = await get<{ name: string; items: string; stage: Stage }>("SELECT name, items, stage FROM checklist_templates WHERE id = ?", input.templateId);
  if (!t) throw new WorkflowError("NOT_FOUND", "Checklist not found.");
  if (t.stage !== stage) throw new WorkflowError("VALIDATION", `"${t.name}" is a ${STAGE_LABELS[t.stage]} checklist.`);
  // A copy of the lines is kept, so later template edits do not change work already assigned.
  await run(
    `INSERT INTO work_checklists (item_id, stage, template_id, name, items, assigned_to, assigned_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (item_id, stage) DO UPDATE SET template_id = excluded.template_id, name = excluded.name, items = excluded.items,
       assigned_to = excluded.assigned_to, assigned_by = excluded.assigned_by, updated_at = excluded.updated_at`,
    itemId,
    stage,
    input.templateId,
    t.name,
    t.items,
    input.assignedTo ?? null,
    ctx.actor?.id ?? null,
    now,
    now,
  );
  await audit(ctx, { itemId, stage, action: "checklist.assigned", summary: `${ctx.actor?.name ?? "System"} set the ${STAGE_LABELS[stage]} checklist to "${t.name}"` });
  await syncItem(itemId, now);
}

export async function verifyChecklistItem(user: AppUser, itemId: string, key: string, verified: boolean) {
  return await tx(async () => {
    const attempt = await requireAttempt(itemId);
    if (!canVerify(user, attempt.stage)) throw new WorkflowError("FORBIDDEN", `Only the ${STAGE_LABELS[attempt.stage]} team lead can verify this checklist.`);
    if (!(await canViewItem(user, itemId))) throw new WorkflowError("FORBIDDEN", "This item is outside your access.");
    const row = await get<{ checked: number; checked_by: string | null }>("SELECT checked, checked_by FROM checklist_results WHERE attempt_id = ? AND key = ?", attempt.id, key);
    if (verified && !row?.checked) throw new WorkflowError("INVALID_STATE", "Only checked lines can be verified.");
    const now = nowIso();
    await run("UPDATE checklist_results SET verified_by = ?, verified_at = ? WHERE attempt_id = ? AND key = ?", verified ? user.id : null, verified ? now : null, attempt.id, key);
    const line = key.startsWith("wc:")
      ? parseJson<WorkChecklistItem[]>((await get<{ items: string }>("SELECT items FROM work_checklists WHERE item_id = ? AND stage = ?", itemId, attempt.stage))?.items ?? "[]", []).find((c) => `wc:${c.key}` === key)?.label
      : (await getSettings()).checklists[attempt.stage].find((c) => c.key === key)?.label;
    await audit({ actor: user }, { itemId, attemptId: attempt.id, stage: attempt.stage, action: verified ? "checklist.verified" : "checklist.unverified", summary: `${user.name} ${verified ? "verified" : "removed verification of"} "${line ?? key}"` });
    if (verified && row?.checked_by && row.checked_by !== user.id) {
      const code = (await get<{ code: string }>("SELECT code FROM items WHERE id = ?", itemId))?.code;
      await notify([row.checked_by], { type: "approval", title: `${code}: "${line}" verified`, body: `${user.name} verified your checklist line.`, link: `/items/${itemId}`, itemId, groupKey: `verified:${itemId}` }, now, user.id);
    }
    await syncItem(itemId, now);
  });
}

// ---------------------------------------------------------------------------
// Bulk assignment
// ---------------------------------------------------------------------------

export type AssignCandidate = {
  id: string;
  code: string;
  title: string;
  lifecycle: string;
  stage: Stage | null;
  stage_status: string | null;
  grade_id: string;
  grade: string;
  grade_sort: number;
  subject_id: string;
  subject: string;
  subject_sort: number;
  unit_id: string | null;
  unit_number: number | null;
  unit_title: string | null;
  part_number: number | null;
  owner_id: string | null;
  due_at: string | null;
  checklist: string | null;
  stage_done: boolean;
};

export async function assignCandidates(user: AppUser, f: { stage: Stage; gradeIds: string[]; subjectIds: string[] }): Promise<{ rows: AssignCandidate[]; capped: boolean }> {
  const where = ["i.lifecycle IN ('draft','in_production')"];
  const params: string[] = [f.stage, f.stage, f.stage];
  if (f.gradeIds.length) {
    where.push(`m.grade_id IN (${placeholders(f.gradeIds.length)})`);
    params.push(...f.gradeIds);
  }
  if (f.subjectIds.length) {
    where.push(`m.subject_id IN (${placeholders(f.subjectIds.length)})`);
    params.push(...f.subjectIds);
  }
  const sc = scopeSql(user, "i");
  where.push(sc.sql);
  params.push(...sc.params);
  const limit = 3000;
  const rows = await all<Omit<AssignCandidate, "stage_done"> & { stage_done: number }>(
    `SELECT i.id, i.code, i.title, i.lifecycle, i.stage, i.stage_status, m.grade_id, g.name AS grade, g.sort AS grade_sort, m.subject_id, s.name AS subject,
        s.sort AS subject_sort, m.unit_id, u.number AS unit_number, u.title AS unit_title, l.number AS part_number,
        sa.user_id AS owner_id, sa.stage_due_at AS due_at,
        (SELECT w.name FROM work_checklists w WHERE w.item_id = i.id AND w.stage = ?) AS checklist,
        CASE WHEN EXISTS (SELECT 1 FROM stage_attempts a WHERE a.item_id = i.id AND a.stage = ? AND a.status = 'completed') THEN 1 ELSE 0 END AS stage_done
     FROM items i
     JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1
     JOIN grades g ON g.id = m.grade_id JOIN subjects s ON s.id = m.subject_id
     LEFT JOIN units u ON u.id = m.unit_id LEFT JOIN lessons l ON l.id = i.lesson_id
     LEFT JOIN stage_assignments sa ON sa.item_id = i.id AND sa.stage = ?
     WHERE ${where.join(" AND ")}
     ORDER BY g.sort, s.sort, u.number, l.number, i.code
     LIMIT ${limit + 1}`,
    ...params,
  );
  return { rows: rows.slice(0, limit).map((r) => ({ ...r, stage_done: !!r.stage_done })), capped: rows.length > limit };
}

// Open work per person in a stage: assigned, not yet done there, item still open.
export async function stageWorkload(stage: Stage): Promise<Record<string, number>> {
  const rows = await all<{ user_id: string; n: number }>(
    `SELECT sa.user_id, COUNT(*) AS n FROM stage_assignments sa JOIN items i ON i.id = sa.item_id
     WHERE sa.stage = ? AND sa.user_id IS NOT NULL AND i.lifecycle IN ('draft','in_production')
       AND NOT EXISTS (SELECT 1 FROM stage_attempts a WHERE a.item_id = i.id AND a.stage = sa.stage AND a.status = 'completed')
     GROUP BY sa.user_id`,
    stage,
  );
  return Object.fromEntries(rows.map((r) => [r.user_id, Number(r.n)]));
}

export type AssignmentInput = {
  stage: Stage;
  // templateId: a checklist to set, null to remove it, or left out to keep the current one.
  rows: { itemId: string; userId: string | null; templateId?: string | null }[];
  dueAt?: string | null;
  reason?: string | null;
};

export async function bulkAssign(user: AppUser, input: AssignmentInput) {
  if (!canAssign(user, input.stage)) throw new WorkflowError("FORBIDDEN", `You cannot assign ${STAGE_LABELS[input.stage]} work.`);
  if (!input.rows.length) throw new WorkflowError("VALIDATION", "Choose the items to assign.");
  const results: { id: string; code: string; ok: boolean; error?: string }[] = [];
  const ctx: Ctx = { actor: user, source: "bulk" };
  const perUser = new Map<string, number>();
  for (const r of input.rows.slice(0, 3000)) {
    const item = await get<{ code: string }>("SELECT code FROM items WHERE id = ?", r.itemId);
    if (!item) continue;
    try {
      await tx(async () => {
        // One notification per person follows below, instead of one per item.
        await assignStage({ ...ctx, silent: true }, r.itemId, { stage: input.stage, userId: r.userId, reason: input.reason ?? null });
        if (input.dueAt !== undefined) {
          await run("UPDATE stage_assignments SET stage_due_at = ? WHERE item_id = ? AND stage = ?", input.dueAt, r.itemId, input.stage);
          await audit(ctx, { itemId: r.itemId, stage: input.stage, action: "deadline.stage", summary: `${user.name} set the ${input.stage} target date`, newValue: input.dueAt });
        }
        if (r.templateId !== undefined) await setWorkChecklist(ctx, r.itemId, input.stage, { templateId: r.templateId ?? null, assignedTo: r.userId });
        await syncItem(r.itemId, nowIso());
      });
      if (r.userId) perUser.set(r.userId, (perUser.get(r.userId) ?? 0) + 1);
      results.push({ id: r.itemId, code: item.code, ok: true });
    } catch (err) {
      results.push({ id: r.itemId, code: item.code, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const now = nowIso();
  for (const [userId, n] of perUser)
    await notify(
      [userId],
      {
        type: "assignment",
        title: `${n} ${STAGE_LABELS[input.stage]} ${n === 1 ? "item was" : "items were"} assigned to you`,
        body: `${user.name} assigned the work${input.dueAt ? `, due ${input.dueAt.slice(0, 10)}` : ""}.${input.reason ? ` ${input.reason}` : ""}`,
        link: `/content?owner=me&stage=${input.stage}`,
        dedupeKey: `bulk-assign:${userId}:${now}`,
      },
      now,
      user.id,
    );
  return results;
}

// ---------------------------------------------------------------------------
// Handovers
// ---------------------------------------------------------------------------

export type HandoverStatus = "open" | "partial" | "closed" | "cancelled";

export type HandoverRow = {
  id: string;
  code: string;
  from_stage: Stage;
  to_stage: Stage;
  from_user: string | null;
  from_name: string | null;
  to_user: string | null;
  to_name: string | null;
  status: HandoverStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
  total: number;
  pending: number;
  accepted: number;
  missing: number;
};

export type HandoverFilter = {
  box?: "incoming" | "outgoing" | "all";
  stage?: Stage | null;
  status?: HandoverStatus | "active" | null;
  person?: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  sort?: "created" | "code" | "items" | "pending" | "status";
  dir?: "asc" | "desc";
};

export function seesAllHandovers(user: AppUser) {
  return wide(user) || can(user, "team.view");
}

function involved(user: AppUser, h: { from_stage: string; to_stage: string; from_user: string | null; to_user: string | null; created_by: string | null }) {
  return (
    seesAllHandovers(user) ||
    h.from_user === user.id ||
    h.to_user === user.id ||
    h.created_by === user.id ||
    isLeadOf(user, h.from_stage as Stage) ||
    isLeadOf(user, h.to_stage as Stage) ||
    (!h.to_user && hasRole(user, h.to_stage as Stage))
  );
}

export function canReceiveHandover(user: AppUser, h: { to_stage: string; to_user: string | null }) {
  return wide(user) || isLeadOf(user, h.to_stage as Stage) || h.to_user === user.id || (!h.to_user && hasRole(user, h.to_stage as Stage));
}

const HANDOVER_SELECT = `SELECT h.*, fu.name AS from_name, tu.name AS to_name,
    (SELECT COUNT(*) FROM handover_items x WHERE x.handover_id = h.id) AS total,
    (SELECT COUNT(*) FROM handover_items x WHERE x.handover_id = h.id AND x.status = 'pending') AS pending,
    (SELECT COUNT(*) FROM handover_items x WHERE x.handover_id = h.id AND x.status = 'accepted') AS accepted,
    (SELECT COUNT(*) FROM handover_items x WHERE x.handover_id = h.id AND x.status = 'missing') AS missing
  FROM handovers h LEFT JOIN users fu ON fu.id = h.from_user LEFT JOIN users tu ON tu.id = h.to_user`;

function toHandover(r: Raw): HandoverRow {
  return { ...(r as unknown as HandoverRow), total: Number(r.total), pending: Number(r.pending), accepted: Number(r.accepted), missing: Number(r.missing) };
}

export async function listHandovers(user: AppUser, f: HandoverFilter = {}): Promise<HandoverRow[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (f.stage) {
    where.push("(h.from_stage = ? OR h.to_stage = ?)");
    params.push(f.stage, f.stage);
  }
  if (f.status === "active") where.push("h.status IN ('open','partial')");
  else if (f.status) {
    where.push("h.status = ?");
    params.push(f.status);
  }
  if (f.person) {
    where.push("(h.from_user = ? OR h.to_user = ? OR h.created_by = ?)");
    params.push(f.person, f.person, f.person);
  }
  if (f.from) {
    where.push("h.created_at >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("h.created_at < ?");
    params.push(f.to);
  }
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    where.push(
      "(lower(h.code) LIKE ? OR lower(COALESCE(h.note, '')) LIKE ? OR EXISTS (SELECT 1 FROM handover_items x JOIN items i ON i.id = x.item_id WHERE x.handover_id = h.id AND (lower(i.code) LIKE ? OR lower(i.title) LIKE ?)))",
    );
    params.push(like, like, like, like);
  }
  const rows = (await all<Raw>(`${HANDOVER_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY h.created_at DESC LIMIT 1000`, ...params)).map(toHandover);
  const box = f.box ?? "all";
  const visible = rows.filter((h) => {
    if (box === "incoming") return canReceiveHandover(user, h);
    if (box === "outgoing") return h.from_user === user.id || h.created_by === user.id || isLeadOf(user, h.from_stage);
    return involved(user, h);
  });
  const dir = f.dir === "asc" ? 1 : -1;
  const order: Record<HandoverStatus, number> = { open: 0, partial: 1, closed: 2, cancelled: 3 };
  const sort = f.sort ?? "created";
  visible.sort((a, b) => {
    const v =
      sort === "code"
        ? a.code.localeCompare(b.code, undefined, { numeric: true })
        : sort === "items"
          ? a.total - b.total
          : sort === "pending"
            ? a.pending - b.pending
            : sort === "status"
              ? order[a.status] - order[b.status]
              : a.created_at.localeCompare(b.created_at);
    return v * dir;
  });
  return visible;
}

export type HandoverItemRow = {
  item_id: string;
  code: string;
  title: string;
  grade: string | null;
  subject: string | null;
  unit_number: number | null;
  part_number: number | null;
  status: "pending" | "accepted" | "missing";
  note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  live_stage: Stage | null;
  live_status: string | null;
  actionable: boolean;
  checklist: string | null;
};

export async function getHandover(user: AppUser, id: string) {
  const r = await get<Raw>(`${HANDOVER_SELECT} WHERE h.id = ?`, id);
  if (!r) return null;
  const h = toHandover(r);
  if (!involved(user, h)) throw new WorkflowError("FORBIDDEN", "You cannot open this handover.");
  const items = await all<HandoverItemRow & { live_stage: Stage | null }>(
    `SELECT x.item_id, i.code, i.title, g.name AS grade, s.name AS subject, u.number AS unit_number, l.number AS part_number,
        x.status, x.note, du.name AS decided_by_name, x.decided_at, i.stage AS live_stage, i.stage_status AS live_status,
        (SELECT w.name FROM work_checklists w WHERE w.item_id = i.id AND w.stage = ?) AS checklist
     FROM handover_items x JOIN items i ON i.id = x.item_id
     LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1
     LEFT JOIN grades g ON g.id = m.grade_id LEFT JOIN subjects s ON s.id = m.subject_id
     LEFT JOIN units u ON u.id = m.unit_id LEFT JOIN lessons l ON l.id = i.lesson_id
     LEFT JOIN users du ON du.id = x.decided_by
     WHERE x.handover_id = ?
     ORDER BY g.sort, s.sort, u.number, l.number, i.code`,
    h.from_stage,
    id,
  );
  return {
    handover: h,
    items: items.map((it) => ({ ...it, actionable: it.status === "pending" && it.live_stage === h.from_stage && it.live_status === "awaiting_handoff" })),
    canReceive: canReceiveHandover(user, h) && h.status !== "cancelled",
    canCancel: (h.created_by === user.id || h.from_user === user.id || wide(user)) && h.accepted + h.missing === 0 && h.status !== "cancelled",
  };
}

async function nextCode() {
  const row = await get<{ n: number | null }>("SELECT MAX(CAST(substr(code, 4) AS INTEGER)) AS n FROM handovers WHERE code LIKE 'HO-%'");
  return `HO-${String(Number(row?.n ?? 0) + 1).padStart(4, "0")}`;
}

async function refreshStatus(id: string) {
  const c = await get<{ total: number; pending: number }>(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending FROM handover_items WHERE handover_id = ?",
    id,
  );
  const total = Number(c?.total ?? 0);
  const pending = Number(c?.pending ?? 0);
  const status: HandoverStatus = pending === 0 ? "closed" : pending < total ? "partial" : "open";
  await run("UPDATE handovers SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, ?) ELSE NULL END WHERE id = ? AND status <> 'cancelled'", status, status, nowIso(), id);
  return status;
}

export type HandoverCreateResult = { handoverId: string | null; code: string | null; results: { id: string; code: string; ok: boolean; error?: string; missing?: string[] }[] };

// Submits each item's handoff (unless already submitted) and groups them into one handover for the next team.
export async function createHandover(user: AppUser, input: { itemIds: string[]; toUserId?: string | null; note?: string | null }): Promise<HandoverCreateResult> {
  const ids = [...new Set(input.itemIds)].slice(0, 1000);
  if (!ids.length) throw new WorkflowError("VALIDATION", "Choose the items to hand over.");
  const stages = new Map<string, Stage>();
  for (const id of ids) {
    const a = await currentAttempt(id);
    if (a) stages.set(id, a.stage);
  }
  const distinct = [...new Set(stages.values())];
  if (distinct.length > 1) throw new WorkflowError("VALIDATION", `The items are in different stages (${distinct.map((s) => STAGE_LABELS[s]).join(", ")}). Hand over one stage at a time.`);
  const from = distinct[0];
  if (!from) throw new WorkflowError("VALIDATION", "None of these items is in production.");
  const to = NEXT_STAGE[from];
  if (!to) throw new WorkflowError("VALIDATION", "Publication is the last stage; nothing to hand over.");
  // Handing over is the team lead's: the team members send their work to the lead, who hands it on.
  if (!wide(user) && !isLeadOf(user, from)) throw new WorkflowError("FORBIDDEN", `Only the ${STAGE_LABELS[from]} team lead or a manager hands work over to ${STAGE_LABELS[to]}.`);
  if (input.toUserId && !(await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ? AND role = ?", input.toUserId, to)))
    throw new WorkflowError("VALIDATION", `The receiver must hold the ${STAGE_LABELS[to]} role.`);

  const results: HandoverCreateResult["results"] = [];
  const ok: string[] = [];
  // Admins and planners act for the team (system authority in the engine); everyone else under their own rights.
  const ctx: Ctx = { actor: wide(user) ? null : user, source: "bulk", silent: true };
  for (const id of ids) {
    const code = (await get<{ code: string }>("SELECT code FROM items WHERE id = ?", id))?.code ?? id;
    if (!stages.has(id)) {
      results.push({ id, code, ok: false, error: "Not in production" });
      continue;
    }
    const open = await get<{ code: string }>(
      "SELECT h.code FROM handover_items x JOIN handovers h ON h.id = x.handover_id WHERE x.item_id = ? AND x.status = 'pending' AND h.status IN ('open','partial') AND h.from_stage = ?",
      id,
      from,
    );
    if (open) {
      results.push({ id, code, ok: false, error: `Already in handover ${open.code}` });
      continue;
    }
    try {
      const a = (await currentAttempt(id))!;
      if (a.status !== "awaiting_handoff") await submitHandoff(ctx, id, { note: input.note ?? null });
      ok.push(id);
      results.push({ id, code, ok: true });
    } catch (err) {
      results.push({
        id,
        code,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        missing: err instanceof WorkflowError && err.code === "REQUIREMENTS_MISSING" ? (err.details as { label: string }[]).map((m) => m.label) : undefined,
      });
    }
  }
  if (!ok.length) return { handoverId: null, code: null, results };

  const id = uid("ho_");
  const code = await nextCode();
  const now = nowIso();
  await tx(async () => {
    await run(
      "INSERT INTO handovers (id, code, from_stage, to_stage, from_user, to_user, status, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)",
      id,
      code,
      from,
      to,
      user.id,
      input.toUserId ?? null,
      input.note?.trim() || null,
      user.id,
      now,
    );
    for (const itemId of ok) await run("INSERT INTO handover_items (handover_id, item_id, status) VALUES (?, ?, 'pending')", id, itemId);
    await audit({ actor: user }, { action: "handover.created", stage: from, summary: `${user.name} handed over ${ok.length} items from ${STAGE_LABELS[from]} to ${STAGE_LABELS[to]} (${code})`, reason: input.note ?? null });
  });
  // One notice for the receiving side instead of one per item.
  const owners = input.toUserId
    ? [input.toUserId]
    : (await all<{ user_id: string }>(`SELECT DISTINCT user_id FROM stage_assignments WHERE stage = ? AND user_id IS NOT NULL AND item_id IN (${placeholders(ok.length)})`, to, ...ok)).map((r) => r.user_id);
  const leads = await teamLeads(to);
  const recipients = [...owners, ...leads, ...(owners.length || leads.length ? [] : await usersWithRole(to))];
  await notify(
    recipients,
    { type: "handoff", title: `Handover ${code}: ${ok.length} items from ${STAGE_LABELS[from]}`, body: `${user.name}${input.note ? `: ${input.note}` : " sent work to check and accept."}`, link: `/handovers/${id}`, dedupeKey: `handover:${id}` },
    now,
    user.id,
  );
  return { handoverId: id, code, results };
}

export async function decideHandover(user: AppUser, handoverId: string, input: { itemIds: string[]; decision: "accepted" | "missing"; note?: string | null }) {
  const h = await get<HandoverRow>("SELECT * FROM handovers WHERE id = ?", handoverId);
  if (!h) throw new WorkflowError("NOT_FOUND", "Handover not found.");
  if (h.status === "cancelled") throw new WorkflowError("INVALID_STATE", "This handover was cancelled.");
  if (!canReceiveHandover(user, h)) throw new WorkflowError("FORBIDDEN", `Only the ${STAGE_LABELS[h.to_stage]} receiver or lead can check this handover.`);
  if (input.decision === "missing" && !input.note?.trim()) throw new WorkflowError("VALIDATION", "Say what is missing, so the sender knows what to fix.");
  const ctx: Ctx = { actor: wide(user) ? null : user, source: "bulk", silent: true };
  const results: { id: string; code: string; ok: boolean; error?: string }[] = [];
  const now = nowIso();
  for (const itemId of input.itemIds) {
    const row = await get<{ status: string; code: string }>(
      "SELECT x.status, i.code FROM handover_items x JOIN items i ON i.id = x.item_id WHERE x.handover_id = ? AND x.item_id = ?",
      handoverId,
      itemId,
    );
    if (!row) continue;
    try {
      if (row.status !== "pending") throw new WorkflowError("INVALID_STATE", `Already ${row.status}.`);
      await tx(async () => {
        if (input.decision === "accepted") await acceptHandoff(ctx, itemId, { note: `Received by ${user.name} in handover ${h.code}${input.note ? `: ${input.note}` : ""}` });
        else await returnHandoff(ctx, itemId, { reasonCategory: "missing_asset", note: `Marked missing by ${user.name} in handover ${h.code}: ${input.note!.trim()}` });
        await run(
          "UPDATE handover_items SET status = ?, note = ?, decided_by = ?, decided_at = ? WHERE handover_id = ? AND item_id = ?",
          input.decision,
          input.note?.trim() || null,
          user.id,
          now,
          handoverId,
          itemId,
        );
      });
      results.push({ id: itemId, code: row.code, ok: true });
    } catch (err) {
      results.push({ id: itemId, code: row.code, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const done = results.filter((r) => r.ok);
  const status = await refreshStatus(handoverId);
  if (done.length) {
    await audit(
      { actor: user },
      { action: `handover.${input.decision}`, stage: h.to_stage, summary: `${user.name} ${input.decision === "accepted" ? "received" : "marked missing"} ${done.length} items in ${h.code}`, reason: input.note ?? null },
    );
    // The sender and their lead hear about missing work; the sender also hears when everything is received.
    const senders = [h.from_user, ...(input.decision === "missing" ? await teamLeads(h.from_stage) : [])];
    await notify(
      senders,
      {
        type: "handoff",
        title:
          input.decision === "missing"
            ? `${h.code}: ${done.length} ${done.length === 1 ? "item" : "items"} marked missing`
            : status === "closed"
              ? `${h.code}: everything received`
              : `${h.code}: ${done.length} ${done.length === 1 ? "item" : "items"} received`,
        body: input.decision === "missing" ? `${user.name}: ${input.note}. ${done.map((d) => d.code).join(", ")}` : `${user.name} accepted ${done.map((d) => d.code).slice(0, 8).join(", ")}${done.length > 8 ? " and more" : ""}.`,
        link: `/handovers/${handoverId}`,
        dedupeKey: `handover-${input.decision}:${handoverId}:${now}`,
      },
      now,
      user.id,
    );
  }
  return { results, status };
}

export async function cancelHandover(user: AppUser, id: string) {
  const data = await getHandover(user, id);
  if (!data) throw new WorkflowError("NOT_FOUND", "Handover not found.");
  if (!data.canCancel) throw new WorkflowError("FORBIDDEN", "Only the sender can cancel, and only before anything was received or marked missing.");
  await run("UPDATE handovers SET status = 'cancelled', closed_at = ? WHERE id = ?", nowIso(), id);
  await audit({ actor: user }, { action: "handover.cancelled", stage: data.handover.from_stage, summary: `${user.name} cancelled ${data.handover.code}. The items stay submitted and can be accepted one by one.` });
}

export async function updateHandoverNote(user: AppUser, id: string, note: string) {
  const h = await get<{ created_by: string | null; from_user: string | null }>("SELECT created_by, from_user FROM handovers WHERE id = ?", id);
  if (!h) throw new WorkflowError("NOT_FOUND", "Handover not found.");
  if (h.created_by !== user.id && h.from_user !== user.id && !wide(user)) throw new WorkflowError("FORBIDDEN", "Only the sender can edit the note.");
  await run("UPDATE handovers SET note = ? WHERE id = ?", note.trim() || null, id);
}

// Items a team lead can put in a new handover: work in the stage they lead (ready first), not already in an open handover.
export async function handoverCandidates(user: AppUser) {
  const sc = scopeSql(user, "i");
  const rows = await all<{ id: string; code: string; title: string; stage: Stage; stage_status: string; owner_id: string | null; grade: string; subject: string; unit_number: number | null; part_number: number | null }>(
    `SELECT i.id, i.code, i.title, a.stage, a.status AS stage_status, a.owner_id, g.name AS grade, s.name AS subject, u.number AS unit_number, l.number AS part_number
     FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id
     LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1 LEFT JOIN grades g ON g.id = m.grade_id LEFT JOIN subjects s ON s.id = m.subject_id
     LEFT JOIN units u ON u.id = m.unit_id LEFT JOIN lessons l ON l.id = i.lesson_id
     WHERE i.lifecycle = 'in_production' AND a.stage <> 'publication' AND a.status IN ('queued','in_progress','paused','finished','lead_review','ready','awaiting_handoff') AND ${sc.sql}
       AND NOT EXISTS (SELECT 1 FROM handover_items x JOIN handovers h ON h.id = x.handover_id WHERE x.item_id = i.id AND x.status = 'pending' AND h.status IN ('open','partial'))
     ORDER BY g.sort, s.sort, u.number, l.number, i.code LIMIT 3000`,
    ...sc.params,
  );
  return rows.filter((r) => wide(user) || isLeadOf(user, r.stage));
}

// ---------------------------------------------------------------------------
// Import notices
// ---------------------------------------------------------------------------

// After a team imports its progress, the next team, both leads and the managers hear about it once.
export async function notifyStageImport(user: AppUser, stages: Stage[], counts: { create: number; update: number }, jobId: string) {
  const now = nowIso();
  for (const stage of [...new Set(stages)]) {
    const next = NEXT_STAGE[stage];
    const recipients = [...(await teamLeads(stage)), ...(next ? [...(await teamLeads(next)), ...(await usersWithRole(next))] : []), ...(await managers())];
    await notify(
      recipients,
      {
        type: "handoff",
        title: `${STAGE_LABELS[stage]} progress imported by ${user.name}`,
        body: `${counts.create + counts.update} rows applied.${next ? ` Work may now be waiting for ${STAGE_LABELS[next]}.` : ""}`,
        link: next ? `/content?stage=${next}` : `/import-export?job=${jobId}`,
        dedupeKey: `stage-import:${jobId}:${stage}`,
      },
      now,
      user.id,
    );
  }
}

