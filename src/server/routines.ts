// Routines (Phase 13d): a person records how they do something in the app (the clicks and what they type, page by
// page), saves it with a name, and later asks the assistant to do it ("run weekly report"), by button, typing,
// voice or through the AI. No AI key is needed. Each run needs approval as Admin sets it (Admin, Assistant,
// Routines): the person's own Confirm, their line manager first, or Admin first. The run happens in the person's
// own browser, as they would do it by hand, so every page's usual permission checks still apply; it stops and asks
// when something on the page is not where it was.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { customDepartments, deptPeople } from "./departments";

export type RoutineStep = {
  path: string;
  do: "click" | "fill" | "select" | "check" | "note";
  role?: string | null;
  name?: string | null;
  label?: string | null;
  value?: string | null;
  // Asked each time the routine runs (a typed value), instead of the recorded one.
  ask?: boolean;
  note?: string | null;
};
export type RoutinesConfig = { on: boolean; approval: "self" | "lead" | "admin"; confirmEachStep: boolean; maxSteps: number; sharing: boolean; offRoles: string[] };
export const DEFAULT_ROUTINES: RoutinesConfig = { on: true, approval: "self", confirmEachStep: false, maxSteps: 60, sharing: true, offRoles: [] };

export async function routinesConfig(): Promise<RoutinesConfig> {
  const v = parseJson<Partial<RoutinesConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.assistant.routines'"))?.value, {});
  return { ...DEFAULT_ROUTINES, ...v, offRoles: Array.isArray(v.offRoles) ? v.offRoles : [] };
}

export async function saveRoutinesConfig(user: AppUser, input: Partial<RoutinesConfig>) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up routines.");
  const cur = await routinesConfig();
  const next: RoutinesConfig = {
    on: input.on ?? cur.on,
    approval: input.approval && ["self", "lead", "admin"].includes(input.approval) ? input.approval : cur.approval,
    confirmEachStep: input.confirmEachStep ?? cur.confirmEachStep,
    maxSteps: Math.max(5, Math.min(200, Math.round(Number(input.maxSteps ?? cur.maxSteps)))),
    sharing: input.sharing ?? cur.sharing,
    offRoles: (input.offRoles ?? cur.offRoles).map(String).slice(0, 30),
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.assistant.routines', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.routines", summary: `${user.name} changed how routines are approved (${next.approval})` });
}

type Viewer = AppUser & { activeRole: string };
export async function routinesOpen(user: Viewer) {
  const c = await routinesConfig();
  return c.on && !c.offRoles.includes(user.activeRole);
}
async function need(user: Viewer) {
  if (!(await routinesOpen(user))) throw new WorkflowError("FORBIDDEN", "Routines are not on for you.");
}

const cleanSteps = (steps: unknown, max: number): RoutineStep[] => {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) throw new WorkflowError("VALIDATION", "Nothing was recorded.");
  if (list.length > max) throw new WorkflowError("VALIDATION", `A routine can have at most ${max} steps.`);
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
  return list.map((x: Record<string, unknown>) => {
    const d = ["click", "fill", "select", "check", "note"].includes(String(x?.do)) ? (x.do as RoutineStep["do"]) : "click";
    const path = s(x?.path, 300) ?? "/dashboard";
    if (!path.startsWith("/") || path.startsWith("//")) throw new WorkflowError("VALIDATION", "A step is outside the app.");
    return { path, do: d, role: s(x?.role, 30), name: s(x?.name, 160), label: s(x?.label, 160), value: s(x?.value, 2000), ask: !!x?.ask, note: s(x?.note, 300) };
  });
};

export type Routine = { id: string; name: string; description: string | null; steps: RoutineStep[]; shared: "none" | "team" | "everyone"; ownerId: string; ownerName: string; uses: number; updatedAt: string; mine: boolean };

// Everyone in the departments the person belongs to (by role or by a position).
async function teammates(userId: string) {
  const out = new Set<string>();
  const keys = ["dev", "marketing", "studio", ...(await customDepartments()).map((c) => c.key)];
  for (const k of keys) {
    const people = await deptPeople(k).catch(() => []);
    if (people.some((p) => p.id === userId)) for (const p of people) out.add(p.id);
  }
  return out;
}

export async function listRoutines(user: Viewer): Promise<Routine[]> {
  const rows = await all<{ id: string; name: string; description: string | null; steps: string; shared: string; owner_id: string; owner_name: string; uses: number; updated_at: string }>(
    "SELECT r.id, r.name, r.description, r.steps, r.shared, r.owner_id, u.name AS owner_name, r.uses, r.updated_at FROM assistant_routines r JOIN users u ON u.id = r.owner_id WHERE r.owner_id = ? OR r.shared <> 'none' ORDER BY r.name",
    user.id,
  );
  const mates = rows.some((r) => r.shared === "team" && r.owner_id !== user.id) ? await teammates(user.id) : new Set<string>();
  return rows
    .filter((r) => r.owner_id === user.id || r.shared === "everyone" || (r.shared === "team" && mates.has(r.owner_id)))
    .map((r) => ({ id: r.id, name: r.name, description: r.description, steps: parseJson<RoutineStep[]>(r.steps, []), shared: r.shared as Routine["shared"], ownerId: r.owner_id, ownerName: r.owner_name, uses: Number(r.uses), updatedAt: r.updated_at, mine: r.owner_id === user.id }));
}

export async function saveRoutine(user: Viewer, input: { id?: string | null; name: string; description?: string | null; steps: unknown; shared?: string }) {
  await need(user);
  const cfg = await routinesConfig();
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Give the routine a name.");
  const steps = cleanSteps(input.steps, cfg.maxSteps);
  const shared = cfg.sharing && ["team", "everyone"].includes(String(input.shared)) ? (input.shared as "team" | "everyone") : "none";
  const now = nowIso();
  if (input.id) {
    const cur = await get<{ owner_id: string }>("SELECT owner_id FROM assistant_routines WHERE id = ?", input.id);
    if (!cur || cur.owner_id !== user.id) throw new WorkflowError("FORBIDDEN", "Only its owner changes a routine.");
    await run("UPDATE assistant_routines SET name = ?, description = ?, steps = ?, shared = ?, updated_at = ? WHERE id = ?", name, input.description?.trim().slice(0, 300) || null, JSON.stringify(steps), shared, now, input.id);
    return input.id;
  }
  const id = uid("rtn_");
  await run(
    "INSERT INTO assistant_routines (id, owner_id, name, description, steps, shared, uses, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    id,
    user.id,
    name,
    input.description?.trim().slice(0, 300) || null,
    JSON.stringify(steps),
    shared,
    now,
    now,
  );
  return id;
}

export async function deleteRoutine(user: Viewer, id: string) {
  const cur = await get<{ owner_id: string }>("SELECT owner_id FROM assistant_routines WHERE id = ?", id);
  if (!cur || (cur.owner_id !== user.id && !can(user, "users.manage"))) throw new WorkflowError("FORBIDDEN", "Only its owner removes a routine.");
  await run("DELETE FROM assistant_runs WHERE routine_id = ?", id);
  await run("DELETE FROM assistant_routines WHERE id = ?", id);
}

// Who approves a run: the person's line manager (HR record), else Admin.
async function approverFor(user: AppUser, mode: RoutinesConfig["approval"]): Promise<string[]> {
  if (mode === "lead") {
    const m = await get<{ user_id: string | null }>("SELECT m.user_id FROM employees e JOIN employees m ON m.id = e.manager_id WHERE e.user_id = ?", user.id);
    if (m?.user_id && m.user_id !== user.id) return [m.user_id];
  }
  const admins = await all<{ user_id: string }>("SELECT r.user_id FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE r.role = 'admin' AND u.active = 1 AND u.id <> ?", user.id);
  return admins.map((a) => a.user_id);
}

export type Run = { id: string; routineId: string; routineName: string; userId: string; userName: string; status: "pending" | "approved" | "rejected" | "running" | "done" | "failed"; values: Record<string, string>; requestedAt: string; decidedBy: string | null; note: string | null; error: string | null };

// Ask to run a routine (with the values asked for). With "self" approval it is approved at once (the person
// confirmed in the assistant); otherwise the approver is told and the run waits.
export async function requestRun(user: Viewer, routineId: string, values: Record<string, string> = {}) {
  await need(user);
  const r = (await listRoutines(user)).find((x) => x.id === routineId);
  if (!r) throw new WorkflowError("NOT_FOUND", "Routine not found.");
  const cfg = await routinesConfig();
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(values ?? {}).slice(0, 60)) clean[String(k).slice(0, 10)] = String(v ?? "").slice(0, 2000);
  const id = uid("rrn_");
  const self = cfg.approval === "self";
  const approvers = self ? [] : await approverFor(user, cfg.approval);
  await run(
    "INSERT INTO assistant_runs (id, routine_id, user_id, status, run_values, approver_ids, requested_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    routineId,
    user.id,
    self ? "approved" : "pending",
    JSON.stringify(clean),
    JSON.stringify(approvers),
    nowIso(),
    self ? nowIso() : null,
  );
  if (!self) await notify(approvers, { type: "assistant", title: `${user.name} asks to run the routine "${r.name}"`, body: `${r.steps.length} steps. Approve or reject it in Routines.`, link: "/routines?tab=approve" }, nowIso());
  return { id, status: self ? "approved" : "pending" };
}

export async function decideRun(user: Viewer, runId: string, approve: boolean, note?: string | null) {
  const r = await get<{ id: string; user_id: string; status: string; approver_ids: string; routine_id: string }>("SELECT id, user_id, status, approver_ids, routine_id FROM assistant_runs WHERE id = ?", runId);
  if (!r) throw new WorkflowError("NOT_FOUND", "Run not found.");
  if (r.status !== "pending") throw new WorkflowError("INVALID_STATE", "This was already decided.");
  const allowed = parseJson<string[]>(r.approver_ids, []).includes(user.id) || can(user, "users.manage");
  if (!allowed || r.user_id === user.id) throw new WorkflowError("FORBIDDEN", "You do not approve this run.");
  if (!approve && !note?.trim()) throw new WorkflowError("VALIDATION", "Say why it is rejected.");
  await run("UPDATE assistant_runs SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?", approve ? "approved" : "rejected", user.id, nowIso(), note?.trim().slice(0, 300) || null, runId);
  const name = (await get<{ name: string }>("SELECT name FROM assistant_routines WHERE id = ?", r.routine_id))?.name ?? "routine";
  await notify([r.user_id], { type: "assistant", title: approve ? `You can run "${name}" now` : `"${name}" was not approved`, body: note ?? undefined, link: "/routines" }, nowIso());
}

// Starting an approved run gives the browser the steps and values; finishing records how it went.
export async function startRun(user: Viewer, runId: string) {
  const r = await get<{ id: string; user_id: string; status: string; routine_id: string; run_values: string }>("SELECT id, user_id, status, routine_id, run_values FROM assistant_runs WHERE id = ?", runId);
  if (!r || r.user_id !== user.id) throw new WorkflowError("NOT_FOUND", "Run not found.");
  if (r.status !== "approved") throw new WorkflowError("INVALID_STATE", r.status === "pending" ? "This run waits for approval." : "This run cannot start.");
  const routine = await get<{ name: string; steps: string }>("SELECT name, steps FROM assistant_routines WHERE id = ?", r.routine_id);
  if (!routine) throw new WorkflowError("NOT_FOUND", "The routine was removed.");
  await run("UPDATE assistant_runs SET status = 'running', started_at = ? WHERE id = ?", nowIso(), runId);
  await run("UPDATE assistant_routines SET uses = uses + 1 WHERE id = ?", r.routine_id);
  const cfg = await routinesConfig();
  return { id: runId, name: routine.name, steps: parseJson<RoutineStep[]>(routine.steps, []), values: parseJson<Record<string, string>>(r.run_values, {}), confirmEachStep: cfg.confirmEachStep };
}

export async function finishRun(user: Viewer, runId: string, ok: boolean, error?: string | null) {
  const r = await get<{ user_id: string; status: string }>("SELECT user_id, status FROM assistant_runs WHERE id = ?", runId);
  if (!r || r.user_id !== user.id || r.status !== "running") return;
  await run("UPDATE assistant_runs SET status = ?, finished_at = ?, error = ? WHERE id = ?", ok ? "done" : "failed", nowIso(), error?.slice(0, 300) || null, runId);
}

export async function listRuns(user: Viewer) {
  const rows = await all<{ id: string; routine_id: string; routine_name: string | null; user_id: string; user_name: string; status: string; run_values: string; requested_at: string; decided_by: string | null; note: string | null; error: string | null; approver_ids: string }>(
    `SELECT x.id, x.routine_id, r.name AS routine_name, x.user_id, u.name AS user_name, x.status, x.run_values, x.requested_at, d.name AS decided_by, x.note, x.error, x.approver_ids
     FROM assistant_runs x JOIN users u ON u.id = x.user_id LEFT JOIN assistant_routines r ON r.id = x.routine_id LEFT JOIN users d ON d.id = x.decided_by
     ORDER BY x.requested_at DESC LIMIT 400`,
  );
  const map = (x: (typeof rows)[number]): Run => ({ id: x.id, routineId: x.routine_id, routineName: x.routine_name ?? "(removed)", userId: x.user_id, userName: x.user_name, status: x.status as Run["status"], values: parseJson(x.run_values, {}), requestedAt: x.requested_at, decidedBy: x.decided_by, note: x.note, error: x.error });
  return {
    mine: rows.filter((x) => x.user_id === user.id).slice(0, 50).map(map),
    toApprove: rows.filter((x) => x.status === "pending" && x.user_id !== user.id && (parseJson<string[]>(x.approver_ids, []).includes(user.id) || can(user, "users.manage"))).map(map),
  };
}
