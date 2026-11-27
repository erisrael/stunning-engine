// Taking a role (or a team lead position) from someone, with its impact shown first on a page of its own:
// what work they still hold, what their team would lose, which pages and rights go. Admin (or the Operations
// head, within what it manages) then either asks them to finish first, or forces the change and forwards their
// open work to the new team lead. Forced moves are recorded, so when the role comes back the person is asked to
// continue where they stopped: everything nobody touched in the meantime goes back to them as it was.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import { audit, assignStage, WorkflowError } from "./workflow";
import { can, permsFor, type AppUser } from "./users";
import { notify } from "./notifications";
import { CAPABILITIES, DEPARTMENT_ROLES, STAGE_LABELS, STAGES, roleLabel, type Department, type Role, type Stage } from "@/lib/domain";

const OPEN_WORK = ["queued", "in_progress", "paused", "blocked", "finished"] as const;
const LEAD_QUEUE = ["lead_review", "ready", "awaiting_handoff"] as const;
const isStage = (r: string): r is Stage => (STAGES as readonly string[]).includes(r);
const deptOf = (r: Role): Department | null => (Object.entries(DEPARTMENT_ROLES).find(([, roles]) => roles.includes(r))?.[0] as Department) ?? null;

export type RoleRemoval = { roles: Role[]; leads: Stage[] };
type Moved =
  | { kind: "stage"; itemId: string; attemptId: string | null; stage: Stage; to: string; at: string; code: string; title: string }
  | { kind: "task"; taskId: string; to: string; at: string; updatedAt: string; code: string; title: string }
  | { kind: "lead"; stage: Stage; to: string; at: string };

export type RoleChangeRow = {
  id: string; user_id: string; roles: string; leads: string; status: "awaiting_finish" | "applied" | "restored" | "resumed" | "cancelled";
  forward_to: string | null; moved: string; note: string | null; requested_by: string | null; requested_at: string; applied_at: string | null; restored_at: string | null; resumed_at: string | null;
};

export type RoleImpact = {
  person: { id: string; name: string; handle: string };
  removal: RoleRemoval;
  labels: { roles: string[]; leads: string[] };
  stageWork: { itemId: string; code: string; title: string; stage: Stage; status: string; running: boolean; current: boolean }[];
  leadQueue: { stage: Stage; itemId: string; code: string; title: string; status: string; orphaned: boolean }[];
  tasks: { id: string; code: string; title: string; dept: string; status: string; due: string | null }[];
  permsLost: { key: string; label: string; group: string }[];
  stillHolds: string[];
  // Who can take the work: per team, its leads first, then its members.
  candidates: Record<string, { id: string; name: string; lead: boolean }[]>;
  pending: { id: string; requestedAt: string; note: string | null; by: string | null } | null;
  blocking: number;
};

async function access(actor: AppUser, userId: string, removal: RoleRemoval) {
  if (can(actor, "users.manage")) return;
  const ops = await import("./people-ops");
  const a = await ops.peopleOpsAccess(actor);
  if (!a.allowed) throw new WorkflowError("FORBIDDEN", "Only Admin or the Operations head changes roles.");
  const managed = new Set(a.roles.map((r) => r.key as string));
  if (removal.roles.some((r) => !managed.has(r))) throw new WorkflowError("FORBIDDEN", "That role is outside what Operations manages.");
  if (removal.leads.length && !a.config.departments.includes("production")) throw new WorkflowError("FORBIDDEN", "Production is outside what Operations manages.");
  const held = await all<{ role: string }>("SELECT role FROM role_assignments WHERE user_id = ?", userId);
  if (held.some((r) => r.role === "admin" || r.role === "owner")) throw new WorkflowError("FORBIDDEN", "Admin and Owner accounts are managed by Admin only.");
  if (userId === actor.id) throw new WorkflowError("FORBIDDEN", "Ask Admin to change your own roles.");
}

// Taking a stage role takes that team's lead position with it.
function normalise(r: RoleRemoval): RoleRemoval {
  const roles = [...new Set(r.roles)];
  return { roles, leads: [...new Set([...r.leads, ...roles.filter(isStage)])] };
}

export function removalFromParam(remove: string): RoleRemoval {
  const parts = remove.split(",").map((s) => s.trim()).filter(Boolean);
  return normalise({ roles: parts.filter((p) => !p.startsWith("lead.")) as Role[], leads: parts.filter((p) => p.startsWith("lead.")).map((p) => p.slice(5)).filter(isStage) });
}
export function removalParam(r: RoleRemoval) {
  return [...r.roles, ...r.leads.filter((l) => !r.roles.includes(l)).map((l) => `lead.${l}`)].join(",");
}
export async function impactUrl(userId: string, r: RoleRemoval) {
  const h = await get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", userId);
  return `/admin/role-change/${encodeURIComponent(h?.handle ?? userId)}?remove=${encodeURIComponent(removalParam(normalise(r)))}`;
}

export async function personByHandle(handle: string) {
  return get<{ id: string; name: string; handle: string }>("SELECT id, name, handle FROM users WHERE (handle = ? OR id = ?) AND deleted_at IS NULL", handle, handle);
}

export async function roleImpact(actor: AppUser, userId: string, input: RoleRemoval): Promise<RoleImpact> {
  const removal = normalise(input);
  await access(actor, userId, removal);
  const person = await get<{ id: string; name: string; handle: string }>("SELECT id, name, handle FROM users WHERE id = ?", userId);
  if (!person) throw new WorkflowError("NOT_FOUND", "Person not found.");
  const [roles, leads] = await Promise.all([
    all<{ role: Role }>("SELECT role FROM role_assignments WHERE user_id = ?", userId).then((r) => r.map((x) => x.role)),
    all<{ stage: Stage }>("SELECT stage FROM team_leads WHERE user_id = ?", userId).then((r) => r.map((x) => x.stage)),
  ]);
  removal.roles = removal.roles.filter((r) => roles.includes(r));
  removal.leads = removal.leads.filter((l) => leads.includes(l));
  const stageRoles = removal.roles.filter(isStage);
  const stageWork = stageRoles.length
    ? await all<{ itemId: string; code: string; title: string; stage: Stage; status: string; running: number; current: number }>(
        `SELECT i.id AS "itemId", i.code, i.title, sa.stage, COALESCE(a.status, 'assigned') AS status,
           CASE WHEN EXISTS (SELECT 1 FROM work_sessions w WHERE w.attempt_id = a.id AND w.user_id = sa.user_id AND w.ended_at IS NULL) THEN 1 ELSE 0 END AS running,
           CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS current
         FROM stage_assignments sa JOIN items i ON i.id = sa.item_id
         LEFT JOIN stage_attempts a ON a.id = i.current_attempt_id AND a.stage = sa.stage
         WHERE sa.user_id = ? AND sa.stage IN (${placeholders(stageRoles.length)}) AND i.lifecycle IN ('draft', 'in_production')
           AND (a.id IS NULL OR a.status IN (${placeholders(OPEN_WORK.length)}))
         ORDER BY i.code`,
        userId, ...stageRoles, ...OPEN_WORK,
      )
    : [];
  const leadQueue: RoleImpact["leadQueue"] = [];
  for (const st of removal.leads) {
    const others = await get<{ c: number }>("SELECT COUNT(*) AS c FROM team_leads WHERE stage = ? AND user_id <> ?", st, userId);
    const rows = await all<{ itemId: string; code: string; title: string; status: string }>(
      `SELECT i.id AS "itemId", i.code, i.title, a.status FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id
       WHERE a.stage = ? AND a.status IN (${placeholders(LEAD_QUEUE.length)}) AND i.lifecycle = 'in_production' ORDER BY i.code LIMIT 500`,
      st, ...LEAD_QUEUE,
    );
    for (const r of rows) leadQueue.push({ ...r, stage: st, orphaned: !Number(others?.c ?? 0) });
  }
  const depts = [...new Set(removal.roles.map(deptOf).filter((d): d is Department => !!d && d !== "production"))];
  const stillDepts = new Set(roles.filter((r) => !removal.roles.includes(r)).map(deptOf));
  const lostDepts = depts.filter((d) => !stillDepts.has(d));
  const tasks = lostDepts.length
    ? await all<RoleImpact["tasks"][number]>(
        `SELECT id, code, title, dept, status, due_date AS due FROM dept_tasks WHERE assignee_id = ? AND dept IN (${placeholders(lostDepts.length)}) AND status NOT IN ('done', 'cancelled', 'closed') AND completed_at IS NULL ORDER BY due_date NULLS LAST, code`,
        userId, ...lostDepts,
      )
    : [];
  const nextRoles = roles.filter((r) => !removal.roles.includes(r));
  const nextLeads = leads.filter((l) => !removal.leads.includes(l));
  const [before, after] = await Promise.all([permsFor(roles, leads), permsFor(nextRoles, nextLeads)]);
  const lost = new Set(before.filter((c) => !after.includes(c)));
  const permsLost = CAPABILITIES.filter((c) => lost.has(c.key as never)).map((c) => ({ key: c.key, label: c.label, group: c.group }));
  const teams = [...new Set([...stageRoles, ...removal.leads])];
  const candidates: RoleImpact["candidates"] = {};
  for (const st of teams) {
    const rows = await all<{ id: string; name: string; lead: number }>(
      `SELECT u.id, u.name, CASE WHEN EXISTS (SELECT 1 FROM team_leads t WHERE t.stage = r.role AND t.user_id = u.id) THEN 1 ELSE 0 END AS lead
       FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE r.role = ? AND u.id <> ? AND u.active = 1 AND u.deleted_at IS NULL ORDER BY lead DESC, u.name`,
      st, userId,
    );
    candidates[st] = rows.map((r) => ({ id: r.id, name: r.name, lead: !!Number(r.lead) }));
  }
  for (const d of lostDepts) {
    const rs = DEPARTMENT_ROLES[d];
    const rows = await all<{ id: string; name: string; lead: number }>(
      `SELECT DISTINCT u.id, u.name, CASE WHEN EXISTS (SELECT 1 FROM department_positions p WHERE p.department = ? AND p.user_id = u.id AND p.position IN ('head', 'lead')) THEN 1 ELSE 0 END AS lead
       FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE r.role IN (${placeholders(rs.length)}) AND u.id <> ? AND u.active = 1 AND u.deleted_at IS NULL ORDER BY lead DESC, u.name`,
      d, ...rs, userId,
    );
    candidates[`dept.${d}`] = rows.map((r) => ({ id: r.id, name: r.name, lead: !!Number(r.lead) }));
  }
  const p = await get<RoleChangeRow>("SELECT * FROM role_changes WHERE user_id = ? AND status = 'awaiting_finish' ORDER BY requested_at DESC LIMIT 1", userId);
  const by = p?.requested_by ? (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", p.requested_by))?.name ?? null : null;
  return {
    person,
    removal,
    labels: { roles: removal.roles.map(roleLabel), leads: removal.leads.map((l) => `${STAGE_LABELS[l]} team lead`) },
    stageWork: stageWork.map((w) => ({ ...w, running: !!Number(w.running), current: !!Number(w.current) })),
    leadQueue,
    tasks,
    permsLost,
    stillHolds: nextRoles.map(roleLabel),
    candidates,
    pending: p ? { id: p.id, requestedAt: p.requested_at, note: p.note, by } : null,
    blocking: stageWork.length + tasks.length + leadQueue.filter((q) => q.orphaned).length,
  };
}

// True when taking these roles affects anything (always, in practice: the person loses pages and rights), so the
// change goes through the impact page instead of happening at once.
export async function needsImpactPage(userId: string, r: RoleRemoval) {
  const n = normalise(r);
  if (!n.roles.length && !n.leads.length) return false;
  const held = await get<{ c: number }>(
    `SELECT (SELECT COUNT(*) FROM role_assignments WHERE user_id = ? AND role IN (${placeholders(Math.max(n.roles.length, 1))})) + (SELECT COUNT(*) FROM team_leads WHERE user_id = ? AND stage IN (${placeholders(Math.max(n.leads.length, 1))})) AS c`,
    userId, ...(n.roles.length ? n.roles : ["-"]), userId, ...(n.leads.length ? n.leads : ["-"]),
  );
  return Number(held?.c ?? 0) > 0;
}

// Step 1, the gentle way: the person is asked to finish their open work first; nothing changes yet.
export async function requestFinishFirst(actor: AppUser, userId: string, input: RoleRemoval, note: string | null) {
  const imp = await roleImpact(actor, userId, input);
  const now = nowIso();
  await run("UPDATE role_changes SET status = 'cancelled' WHERE user_id = ? AND status = 'awaiting_finish'", userId);
  const id = uid("rc_");
  await run(
    "INSERT INTO role_changes (id, user_id, roles, leads, status, note, requested_by, requested_at) VALUES (?, ?, ?, ?, 'awaiting_finish', ?, ?, ?)",
    id, userId, JSON.stringify(imp.removal.roles), JSON.stringify(imp.removal.leads), note?.trim() || null, actor.id, now,
  );
  const what = [...imp.labels.roles, ...imp.labels.leads.filter((l) => !imp.removal.roles.some((r) => l.startsWith(STAGE_LABELS[r as Stage] ?? "-")))].join(", ");
  await notify([userId], { type: "role", title: `Please finish your open work: your ${what} role is changing`, body: `${imp.blocking} open ${imp.blocking === 1 ? "piece" : "pieces"} of work. ${note?.trim() ?? ""}`.trim(), link: "/role-change", dedupeKey: `rc:${id}` }, now);
  await audit({ actor }, { action: "role_change.finish_first", summary: `${actor.name} asked ${imp.person.name} to finish their work before taking ${what}`, newValue: imp.removal });
  return { id };
}

export async function cancelRoleChange(actor: AppUser, id: string) {
  const row = await get<RoleChangeRow>("SELECT * FROM role_changes WHERE id = ?", id);
  if (!row || row.status !== "awaiting_finish") throw new WorkflowError("NOT_FOUND", "No pending role change.");
  await access(actor, row.user_id, { roles: parseJson(row.roles, []), leads: parseJson(row.leads, []) });
  await run("UPDATE role_changes SET status = 'cancelled' WHERE id = ?", id);
  await notify([row.user_id], { type: "role", title: "Your role change was called off", body: "Your roles stay as they are.", link: "/role-change", dedupeKey: `rc-cancel:${id}` }, nowIso());
  await audit({ actor }, { action: "role_change.cancelled", summary: `${actor.name} called off a role change` });
}

// Step 2: the change itself. Open work goes to the chosen people (per team, and per department for tasks); each
// move is recorded with when it happened so it can be given back untouched if the role is restored.
export async function applyRoleChange(actor: AppUser, userId: string, input: RoleRemoval, forward: Record<string, string | null>, confirmName: string) {
  const imp = await roleImpact(actor, userId, input);
  if (confirmName.trim().toLowerCase() !== imp.person.name.trim().toLowerCase()) throw new WorkflowError("VALIDATION", `Type ${imp.person.name} to confirm.`);
  if (!imp.removal.roles.length && !imp.removal.leads.length) throw new WorkflowError("VALIDATION", "They no longer hold these roles.");
  const left = await all<{ role: string }>("SELECT role FROM role_assignments WHERE user_id = ?", userId);
  if (left.every((r) => imp.removal.roles.includes(r.role as Role)) && !(await get("SELECT 1 AS x FROM department_positions WHERE user_id = ?", userId)))
    throw new WorkflowError("VALIDATION", "Leave the person at least one role (or deactivate the account instead).");
  if (userId === actor.id && imp.removal.roles.some((r) => r === "admin")) throw new WorkflowError("VALIDATION", "You cannot remove your own Admin role.");
  const pick = (key: string) => {
    const to = forward[key] ?? null;
    if (to && !imp.candidates[key]?.some((c) => c.id === to)) throw new WorkflowError("VALIDATION", "Choose someone from the list to take the work.");
    return to;
  };
  for (const w of imp.stageWork) if (!pick(w.stage)) throw new WorkflowError("VALIDATION", `Choose who takes the open ${STAGE_LABELS[w.stage]} work.`);
  for (const t of imp.tasks) if (!pick(`dept.${t.dept}`)) throw new WorkflowError("VALIDATION", "Choose who takes the open tasks.");
  for (const q of imp.leadQueue) if (q.orphaned && !pick(q.stage)) throw new WorkflowError("VALIDATION", `Choose the new ${STAGE_LABELS[q.stage]} team lead: the team's review queue would have no lead.`);
  const ctx = { actor, source: "ui" as const };
  const moved: Moved[] = [];
  await tx(async () => {
    for (const w of imp.stageWork) {
      const to = pick(w.stage)!;
      await assignStage(ctx, w.itemId, { stage: w.stage, userId: to, reason: `Role change: ${imp.person.name} no longer ${STAGE_LABELS[w.stage]}` });
      const a = await get<{ id: string }>("SELECT a.id FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id WHERE i.id = ? AND a.stage = ?", w.itemId, w.stage);
      moved.push({ kind: "stage", itemId: w.itemId, attemptId: a?.id ?? null, stage: w.stage, to, at: nowIso(), code: w.code, title: w.title });
    }
    for (const t of imp.tasks) {
      const to = pick(`dept.${t.dept}`)!;
      const now = nowIso();
      await run("UPDATE dept_tasks SET assignee_id = ?, updated_at = ? WHERE id = ?", to, now, t.id);
      moved.push({ kind: "task", taskId: t.id, to, at: now, updatedAt: now, code: t.code, title: t.title });
    }
    for (const st of [...new Set(imp.leadQueue.filter((q) => q.orphaned).map((q) => q.stage))]) {
      const to = pick(st)!;
      await run("INSERT INTO team_leads (stage, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", st, to);
      await run("UPDATE users SET own_work_only = 0 WHERE id = ?", to);
      moved.push({ kind: "lead", stage: st, to, at: nowIso() });
    }
    if (imp.removal.roles.length) {
      await run(`DELETE FROM role_assignments WHERE user_id = ? AND role IN (${placeholders(imp.removal.roles.length)})`, userId, ...imp.removal.roles);
      await run(`DELETE FROM user_capacity WHERE user_id = ? AND stage IN (${placeholders(imp.removal.roles.length)})`, userId, ...imp.removal.roles);
    }
    if (imp.removal.leads.length) await run(`DELETE FROM team_leads WHERE user_id = ? AND stage IN (${placeholders(imp.removal.leads.length)})`, userId, ...imp.removal.leads);
    const now = nowIso();
    const pending = imp.pending?.id;
    if (pending) await run("UPDATE role_changes SET status = 'applied', moved = ?, applied_at = ? WHERE id = ?", JSON.stringify(moved), now, pending);
    else
      await run(
        "INSERT INTO role_changes (id, user_id, roles, leads, status, moved, requested_by, requested_at, applied_at) VALUES (?, ?, ?, ?, 'applied', ?, ?, ?, ?)",
        uid("rc_"), userId, JSON.stringify(imp.removal.roles), JSON.stringify(imp.removal.leads), JSON.stringify(moved), actor.id, now, now,
      );
  });
  (await import("./auth")).forgetFastViewers();
  const now = nowIso();
  const what = [...imp.labels.roles, ...imp.labels.leads].join(", ");
  const items = moved.filter((m) => m.kind !== "lead").length;
  await notify([userId], { type: "role", title: `Your roles changed: ${what} taken`, body: items ? `${items} open ${items === 1 ? "piece" : "pieces"} of work went to your team. If the role comes back, you can continue where you stopped.` : undefined, link: "/role-change", dedupeKey: `rc-apply:${userId}:${now}` }, now, actor.id);
  const byTo = new Map<string, number>();
  for (const m of moved) byTo.set(m.to, (byTo.get(m.to) ?? 0) + 1);
  for (const [to, n] of byTo) await notify([to], { type: "assignment", title: `${imp.person.name}'s work came to you (${n})`, body: `Their ${what} role was taken; their open work was forwarded to you.`, link: "/my-work", dedupeKey: `rc-to:${to}:${now}` }, now, actor.id);
  await audit({ actor }, { action: "role_change.applied", summary: `${actor.name} took ${what} from ${imp.person.name}${items ? ` and forwarded ${items} open ${items === 1 ? "piece" : "pieces"} of work` : ""}`, oldValue: imp.removal, newValue: moved });
  return { moved: moved.length };
}

// Called after roles or lead positions are given (Admin, People operations): a forced change for the same roles
// becomes "restored" and the person is asked to continue where they stopped.
export async function onRolesGiven(actor: AppUser | null, userId: string, given: { roles?: string[]; leads?: string[] }) {
  const rows = await all<RoleChangeRow>("SELECT * FROM role_changes WHERE user_id = ? AND status = 'applied' ORDER BY applied_at DESC", userId);
  const now = nowIso();
  for (const r of rows) {
    const roles = parseJson<string[]>(r.roles, []);
    const leads = parseJson<string[]>(r.leads, []);
    const back = roles.some((x) => given.roles?.includes(x)) || leads.some((x) => given.leads?.includes(x));
    if (!back) continue;
    await run("UPDATE role_changes SET status = 'restored', restored_at = ? WHERE id = ?", now, r.id);
    const moved = parseJson<Moved[]>(r.moved, []).filter((m) => m.kind !== "lead");
    await notify([userId], { type: "role", title: "Your role is back: continue where you stopped", body: moved.length ? `${moved.length} ${moved.length === 1 ? "piece" : "pieces"} of your earlier work can come back to you.` : "Your earlier role and rights are back.", link: "/role-change", dedupeKey: `rc-restore:${r.id}` }, now, actor?.id);
    if (actor) await audit({ actor }, { action: "role_change.restored", summary: `${actor.name} gave ${(await get<{ name: string }>("SELECT name FROM users WHERE id = ?", userId))?.name ?? "someone"} their role back` });
  }
}

// What a restored person can take back: work still with the person it went to, with nothing done to it since.
export type ResumeEntry = { key: string; label: string; detail: string; link: string | null; clean: boolean; why: string | null };
async function resumeEntries(row: RoleChangeRow): Promise<ResumeEntry[]> {
  const out: ResumeEntry[] = [];
  const names = Object.fromEntries((await all<{ id: string; name: string }>("SELECT id, name FROM users")).map((u) => [u.id, u.name]));
  for (const m of parseJson<Moved[]>(row.moved, [])) {
    if (m.kind === "lead") continue;
    if (m.kind === "stage") {
      const cur = await get<{ attempt: string | null; stage: string | null; owner: string | null; lifecycle: string }>(
        "SELECT i.current_attempt_id AS attempt, a.stage, sa.user_id AS owner, i.lifecycle FROM items i LEFT JOIN stage_attempts a ON a.id = i.current_attempt_id LEFT JOIN stage_assignments sa ON sa.item_id = i.id AND sa.stage = ? WHERE i.id = ?",
        m.stage, m.itemId,
      );
      let why: string | null = null;
      if (!cur) why = "The item no longer exists.";
      else if (cur.owner !== m.to) why = `It is now with ${cur.owner ? names[cur.owner] ?? "someone else" : "nobody"}.`;
      else if (m.attemptId && cur.attempt !== m.attemptId) why = "It moved on to another stage or attempt.";
      else if (!["draft", "in_production"].includes(cur.lifecycle)) why = "It was closed or published.";
      else {
        const touched = await get<{ who: string | null }>(
          "SELECT actor_id AS who FROM audit_events WHERE item_id = ? AND occurred_at > ? AND (stage = ? OR stage IS NULL) AND action <> 'assignment.changed' ORDER BY occurred_at LIMIT 1",
          m.itemId, m.at, m.stage,
        );
        const worked = m.attemptId ? await get("SELECT 1 AS x FROM work_sessions WHERE attempt_id = ? AND started_at > ? LIMIT 1", m.attemptId, m.at) : null;
        if (touched || worked) why = `${touched?.who ? names[touched.who] ?? "Someone" : "Someone"} worked on it after it moved.`;
      }
      out.push({ key: `stage:${m.itemId}:${m.stage}`, label: `${m.code} ${m.title}`, detail: `${STAGE_LABELS[m.stage]}, with ${names[m.to] ?? "someone"}`, link: `/items/${m.itemId}`, clean: !why, why });
    } else {
      const t = await get<{ assignee_id: string | null; updated_at: string; status: string; dept: string }>("SELECT assignee_id, updated_at, status, dept FROM dept_tasks WHERE id = ?", m.taskId);
      let why: string | null = null;
      if (!t) why = "The task no longer exists.";
      else if (t.assignee_id !== m.to) why = `It is now with ${t.assignee_id ? names[t.assignee_id] ?? "someone else" : "nobody"}.`;
      else if (t.updated_at !== m.updatedAt) why = "It was changed after it moved.";
      out.push({ key: `task:${m.taskId}`, label: `${m.code} ${m.title}`, detail: `Task, with ${names[m.to] ?? "someone"}`, link: t ? `/${t.dept}` : null, clean: !why, why });
    }
  }
  return out;
}

export type MyRoleChanges = {
  pending: { id: string; what: string; note: string | null; by: string | null; at: string; work: RoleImpact["stageWork"]; tasks: RoleImpact["tasks"] }[];
  restored: { id: string; what: string; at: string; entries: ResumeEntry[] }[];
  history: { id: string; what: string; status: string; at: string }[];
};

function whatOf(r: RoleChangeRow) {
  const roles = parseJson<string[]>(r.roles, []);
  const leads = parseJson<Stage[]>(r.leads, []).filter((l) => !roles.includes(l));
  return [...roles.map(roleLabel), ...leads.map((l) => `${STAGE_LABELS[l]} team lead`)].join(", ");
}

export async function myRoleChanges(user: AppUser): Promise<MyRoleChanges> {
  const rows = await all<RoleChangeRow>("SELECT * FROM role_changes WHERE user_id = ? ORDER BY requested_at DESC LIMIT 50", user.id);
  const names = Object.fromEntries((await all<{ id: string; name: string }>("SELECT id, name FROM users")).map((u) => [u.id, u.name]));
  const out: MyRoleChanges = { pending: [], restored: [], history: [] };
  for (const r of rows) {
    if (r.status === "awaiting_finish") {
      const roles = parseJson<string[]>(r.roles, []).filter(isStage);
      const work = roles.length
        ? await all<RoleImpact["stageWork"][number]>(
            `SELECT i.id AS "itemId", i.code, i.title, sa.stage, COALESCE(a.status, 'assigned') AS status, false AS running, CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS current
             FROM stage_assignments sa JOIN items i ON i.id = sa.item_id LEFT JOIN stage_attempts a ON a.id = i.current_attempt_id AND a.stage = sa.stage
             WHERE sa.user_id = ? AND sa.stage IN (${placeholders(roles.length)}) AND i.lifecycle IN ('draft', 'in_production') AND (a.id IS NULL OR a.status IN (${placeholders(OPEN_WORK.length)})) ORDER BY i.code`,
            user.id, ...roles, ...OPEN_WORK,
          )
        : [];
      const depts = [...new Set(parseJson<Role[]>(r.roles, []).map(deptOf).filter((d): d is Department => !!d && d !== "production"))];
      const tasks = depts.length
        ? await all<RoleImpact["tasks"][number]>(`SELECT id, code, title, dept, status, due_date AS due FROM dept_tasks WHERE assignee_id = ? AND dept IN (${placeholders(depts.length)}) AND status NOT IN ('done', 'cancelled', 'closed') AND completed_at IS NULL ORDER BY code`, user.id, ...depts)
        : [];
      out.pending.push({ id: r.id, what: whatOf(r), note: r.note, by: r.requested_by ? names[r.requested_by] ?? null : null, at: r.requested_at, work, tasks });
    } else if (r.status === "restored") out.restored.push({ id: r.id, what: whatOf(r), at: r.restored_at ?? r.requested_at, entries: await resumeEntries(r) });
    out.history.push({ id: r.id, what: whatOf(r), status: r.status, at: r.resumed_at ?? r.restored_at ?? r.applied_at ?? r.requested_at });
  }
  return out;
}

// The person tells whoever asked that they have finished (the change then waits for Admin's confirmation).
export async function reportFinished(user: AppUser, id: string) {
  const row = await get<RoleChangeRow>("SELECT * FROM role_changes WHERE id = ? AND user_id = ? AND status = 'awaiting_finish'", id, user.id);
  if (!row) throw new WorkflowError("NOT_FOUND", "No pending role change.");
  const mine = (await myRoleChanges(user)).pending.find((p) => p.id === id);
  const left = (mine?.work.length ?? 0) + (mine?.tasks.length ?? 0);
  if (left) throw new WorkflowError("VALIDATION", `You still have ${left} open ${left === 1 ? "piece" : "pieces"} of work. Finish or hand them over first.`);
  const url = await impactUrl(user.id, { roles: parseJson(row.roles, []), leads: parseJson(row.leads, []) });
  await notify([row.requested_by], { type: "role", title: `${user.name} has finished their work`, body: `The role change (${whatOf(row)}) is ready to confirm.`, link: url, dedupeKey: `rc-done:${id}` }, nowIso(), user.id);
}

// Continue where you stopped: the untouched work comes back to the person, the rest stays where it is.
export async function resumeWork(user: AppUser, id: string) {
  const row = await get<RoleChangeRow>("SELECT * FROM role_changes WHERE id = ? AND user_id = ? AND status = 'restored'", id, user.id);
  if (!row) throw new WorkflowError("NOT_FOUND", "Nothing to continue.");
  const entries = await resumeEntries(row);
  const clean = new Set(entries.filter((e) => e.clean).map((e) => e.key));
  const roles = (await all<{ role: string }>("SELECT role FROM role_assignments WHERE user_id = ?", user.id)).map((r) => r.role);
  let back = 0;
  await tx(async () => {
    for (const m of parseJson<Moved[]>(row.moved, [])) {
      if (m.kind === "stage" && clean.has(`stage:${m.itemId}:${m.stage}`) && roles.includes(m.stage)) {
        await assignStage({ actor: null, source: "system" }, m.itemId, { stage: m.stage, userId: user.id, reason: `${user.name} continues where they stopped (role restored)` });
        back++;
      } else if (m.kind === "task" && clean.has(`task:${m.taskId}`)) {
        await run("UPDATE dept_tasks SET assignee_id = ?, updated_at = ? WHERE id = ?", user.id, nowIso(), m.taskId);
        back++;
      }
    }
    await run("UPDATE role_changes SET status = 'resumed', resumed_at = ? WHERE id = ?", nowIso(), id);
  });
  await audit({ actor: user }, { action: "role_change.resumed", summary: `${user.name} continued where they stopped: ${back} ${back === 1 ? "piece" : "pieces"} of work came back` });
  return { back, left: entries.length - back };
}

export async function declineResume(user: AppUser, id: string) {
  const n = await run("UPDATE role_changes SET status = 'resumed', resumed_at = ? WHERE id = ? AND user_id = ? AND status = 'restored'", nowIso(), id, user.id);
  if (!n.changes) throw new WorkflowError("NOT_FOUND", "Nothing to continue.");
}

export async function myRoleChangeCount(userId: string) {
  const r = await get<{ c: number }>("SELECT COUNT(*) AS c FROM role_changes WHERE user_id = ? AND status IN ('awaiting_finish', 'restored')", userId);
  return Number(r?.c ?? 0);
}


