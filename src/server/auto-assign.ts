// Auto-assign (Curriculum, Auto-assign): who a part goes to when it reaches a team and nobody is planned for it. Each
// team sets its own: rules by grade and subject first (Grade 9 Mathematics goes to this person), then the people to
// share the rest between, by whoever has least open work or strictly in turn. Off by default.

import { all, get, nowIso, parseJson, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import type { AppUser } from "./users";
import { STAGES, type Stage } from "@/lib/domain";

export type AssignRule = { gradeId: string | null; subjectId: string | null; userId: string };
export type StageAutoAssign = { mode: "off" | "rules" | "least_loaded" | "round_robin"; people: string[]; rules: AssignRule[] };
export type AutoAssignConfig = Record<Stage, StageAutoAssign>;

const OFF: StageAutoAssign = { mode: "off", people: [], rules: [] };

export async function autoAssignConfig(): Promise<AutoAssignConfig> {
  const v = parseJson<Partial<AutoAssignConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.autoassign'"))?.value, {});
  return Object.fromEntries(STAGES.map((s) => [s, { ...OFF, ...(v[s] ?? {}) }])) as AutoAssignConfig;
}

async function setSetting(key: string, value: unknown, by: string | null) {
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    key,
    JSON.stringify(value),
    nowIso(),
    by,
  );
}

export async function saveAutoAssign(user: AppUser, stage: Stage, input: StageAutoAssign) {
  const { canAssign } = await import("./editorial");
  if (!canAssign(user, stage)) throw new WorkflowError("FORBIDDEN", "Only that team's lead or a planner sets its auto-assign.");
  const team = new Set((await teamOf(stage)).map((p) => p.id));
  const mode = ["off", "rules", "least_loaded", "round_robin"].includes(input.mode) ? input.mode : "off";
  const rules = (input.rules ?? []).filter((r) => r.userId && (r.gradeId || r.subjectId)).slice(0, 200);
  for (const r of rules) if (!team.has(r.userId)) throw new WorkflowError("VALIDATION", "A rule names someone who is not in this team.");
  const cfg = await autoAssignConfig();
  cfg[stage] = { mode, people: (input.people ?? []).filter((p) => team.has(p)), rules };
  await setSetting("cfg.autoassign", cfg, user.id);
  await audit({ actor: user }, { stage, action: "settings.autoassign", summary: `${user.name} changed auto-assign for ${stage} (${mode})`, newValue: cfg[stage] });
}

export const teamOf = (stage: Stage) => all<{ id: string; name: string }>("SELECT u.id, u.name FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE r.role = ? AND u.active = 1 ORDER BY u.name", stage);

async function openWork(stage: Stage) {
  const rows = await all<{ user_id: string; n: number }>(
    `SELECT sa.user_id, COUNT(*) AS n FROM stage_assignments sa JOIN items i ON i.id = sa.item_id
     WHERE sa.stage = ? AND sa.user_id IS NOT NULL AND i.lifecycle IN ('draft','in_production')
       AND NOT EXISTS (SELECT 1 FROM stage_attempts a WHERE a.item_id = i.id AND a.stage = sa.stage AND a.status = 'completed')
     GROUP BY sa.user_id`,
    stage,
  );
  return new Map(rows.map((r) => [r.user_id, Number(r.n)]));
}

// The person for this part, or null. The workflow calls this when a part reaches a team with no owner.
export async function autoOwnerFor(itemId: string, stage: Stage): Promise<string | null> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.autoassign'");
  if (!row) return null;
  const cfg = parseJson<Partial<AutoAssignConfig>>(row.value, {})[stage];
  if (!cfg || cfg.mode === "off") return null;
  const place = await get<{ grade_id: string; subject_id: string }>("SELECT grade_id, subject_id FROM item_memberships WHERE item_id = ? AND is_primary = 1", itemId);
  const team = await teamOf(stage);
  const inTeam = new Set(team.map((p) => p.id));
  const score = (r: AssignRule) => (r.gradeId && r.subjectId ? 3 : r.subjectId ? 2 : 1);
  const rule = (cfg.rules ?? [])
    .filter((r) => inTeam.has(r.userId) && (!r.gradeId || r.gradeId === place?.grade_id) && (!r.subjectId || r.subjectId === place?.subject_id))
    .sort((a, b) => score(b) - score(a))[0];
  if (rule) return rule.userId;
  if (cfg.mode === "rules") return null;
  const pool = (cfg.people ?? []).filter((p) => inTeam.has(p));
  const people = pool.length ? team.filter((p) => pool.includes(p.id)) : team;
  if (!people.length) return null;
  if (cfg.mode === "round_robin") {
    const cursor = parseJson<Partial<Record<Stage, string>>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.autoassign.cursor'"))?.value, {});
    const at = people.findIndex((p) => p.id === cursor[stage]);
    const next = people[(at + 1) % people.length]!;
    await setSetting("cfg.autoassign.cursor", { ...cursor, [stage]: next.id }, null);
    return next.id;
  }
  const load = await openWork(stage);
  return [...people].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.name.localeCompare(b.name))[0]!.id;
}

// Applies the team's rules to parts already waiting with nobody on them, through the normal assignment.
export async function runAutoAssign(user: AppUser, stage: Stage) {
  const { assignCandidates, bulkAssign, canAssign } = await import("./editorial");
  if (!canAssign(user, stage)) throw new WorkflowError("FORBIDDEN", "Only that team's lead or a planner runs its auto-assign.");
  const { rows } = await assignCandidates(user, { stage, gradeIds: [], subjectIds: [] });
  const waiting = rows.filter((r) => !r.owner_id && !r.stage_done);
  const out: { itemId: string; userId: string | null }[] = [];
  for (const r of waiting) {
    const who = await autoOwnerFor(r.id, stage);
    if (!who) continue;
    await run("UPDATE stage_assignments SET user_id = ? WHERE item_id = ? AND stage = ?", who, r.id, stage);
    out.push({ itemId: r.id, userId: who });
  }
  if (out.length) await bulkAssign(user, { stage, rows: out, reason: "Auto-assign" });
  return { assigned: out.length, waiting: waiting.length };
}
