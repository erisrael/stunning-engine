// The organisation behind official letters: units (board, committees, departments, branches), positions with their
// reporting lines, the people in them (several positions at once, acting appointments, with dates), the authority
// matrix (who may prepare, review, approve, sign, stamp, issue, dispatch, cancel), and delegations.
//
// Nothing is hard-coded: the default hierarchy is only a starting point Admin loads, renames and reorganises. Every
// change is dated and audited, and a letter keeps the names, positions and capacities that were true when it was
// signed (stored with each signature), so later reorganisations never rewrite history.

import { all, get, nowIso, parseJson, run, tx, uid } from "../db";
import { WorkflowError } from "../workflow";
import type { AppUser } from "../users";
import { audit, corrCan, needCorr } from "./core";

export const LEVELS = ["board", "executive", "senior", "middle", "operational", "governance"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = { board: "Board", executive: "Executive leadership", senior: "Senior management", middle: "Middle management", operational: "Operational staff", governance: "Governance and oversight" };
export const UNIT_KINDS = ["board", "committee", "executive", "division", "department", "unit", "branch", "team", "temporary"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export const ACTIONS = ["prepare", "review", "approve_department", "approve_executive", "approve_financial", "approve_legal", "approve_board", "issue", "sign", "stamp", "dispatch", "cancel", "revoke"] as const;
export type AuthorityAction = (typeof ACTIONS)[number];
export const ACTION_LABELS: Record<AuthorityAction, string> = {
  prepare: "Prepare",
  review: "Review",
  approve_department: "Department approval",
  approve_executive: "Executive approval",
  approve_financial: "Financial authorisation",
  approve_legal: "Legal approval",
  approve_board: "Board approval",
  issue: "Final issuance",
  sign: "Official signature",
  stamp: "Company stamp",
  dispatch: "External dispatch",
  cancel: "Cancel a letter",
  revoke: "Revoke a letter",
};
const CLASS_RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

// The default positions (spec 23.1), by level; Admin adds, renames or removes any.
export const DEFAULT_POSITIONS: Record<Level, string[]> = {
  board: ["Chairman of the Board", "Vice Chairman", "Board Member", "Board Secretary"],
  executive: ["Chief Executive Officer (CEO)", "Deputy Chief Executive Officer (DCEO)", "Chief Operating Officer (COO)", "Chief Technology Officer (CTO)", "Chief Financial Officer (CFO)", "Chief Human Resources Officer (CHRO)", "Chief Legal Officer (CLO)", "Chief Marketing Officer (CMO)", "Chief Strategy Officer (CSO)", "Chief Information Officer (CIO)", "Chief Security Officer (CSecO)", "Chief Education & Development Officer (CEDO)"],
  senior: ["General Manager", "Deputy General Manager", "Executive Director", "Operations Director", "Finance Director", "Technical Director", "Human Resources Director", "Commercial Director", "Regional Director", "Branch Director", "Department Director"],
  middle: ["Department Manager", "Deputy Department Manager", "Division Manager", "Unit Manager", "Project Manager", "Team Leader", "Section Head", "Office Manager"],
  operational: ["Senior Officer", "Officer", "Specialist", "Senior Analyst", "Analyst", "Coordinator", "Assistant", "Administrative Officer", "Technical Staff", "General Employee"],
  governance: ["Internal Auditor", "Compliance Officer", "Legal Advisor", "Risk Manager", "Company Secretary", "Ethics and Governance Officer"],
};

export type Unit = { id: string; parentId: string | null; kind: UnitKind; name: string; code: string | null; effectiveFrom: string | null; effectiveTo: string | null };
export type Position = { id: string; unitId: string | null; title: string; level: Level; reportsTo: string | null; dottedTo: string[]; active: boolean; effectiveFrom: string | null; effectiveTo: string | null };
export type Assignment = { id: string; positionId: string; userId: string; userName: string; kind: "substantive" | "acting"; startAt: string; endAt: string | null; authorizationRef: string | null; approvedBy: string | null };
export type Authority = { id: string; subjectKind: "position" | "level" | "user"; subjectId: string; action: AuthorityAction; categoryId: string | null; department: string | null; maxClassification: string; maxValue: number | null; note: string | null };
export type Delegation = {
  id: string; fromUser: string; fromName: string; fromPosition: string | null; fromPositionTitle: string | null; toUser: string; toName: string; actions: AuthorityAction[]; categories: string[]; maxValue: number | null;
  includesSigning: boolean; canSubdelegate: boolean; conditions: string | null; startAt: string; endAt: string; revokedAt: string | null; authorizationRef: string | null; parentId: string | null;
};

const s = (v: unknown, n: number) => {
  const x = String(v ?? "").trim().slice(0, n);
  return x || null;
};
const iso = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new WorkflowError("VALIDATION", "That date is not valid.");
  return d.toISOString();
};
const activeAt = (start: string | null, end: string | null, at: string) => (!start || start <= at) && (!end || end > at);

function needOrg(user: AppUser) {
  needCorr(user, "admin", "Only correspondence administrators change the organisation and authorities.");
}

// ---------------------------------------------------------------------------
// Reading the organisation
// ---------------------------------------------------------------------------

export async function orgChart(at = nowIso()) {
  const [units, positions, assignments] = await Promise.all([
    all<{ id: string; parent_id: string | null; kind: string; name: string; code: string | null; effective_from: string | null; effective_to: string | null }>("SELECT * FROM org_units ORDER BY sort, name"),
    all<{ id: string; unit_id: string | null; title: string; level: string; reports_to: string | null; dotted_to: string; active: number; effective_from: string | null; effective_to: string | null }>("SELECT * FROM org_positions ORDER BY sort, title"),
    all<{ id: string; position_id: string; user_id: string; name: string; kind: string; start_at: string; end_at: string | null; authorization_ref: string | null; approved_by: string | null }>(
      "SELECT a.*, u.name FROM org_assignments a JOIN users u ON u.id = a.user_id ORDER BY a.start_at",
    ),
  ]);
  return {
    units: units.map((u): Unit & { current: boolean } => ({ id: u.id, parentId: u.parent_id, kind: u.kind as UnitKind, name: u.name, code: u.code, effectiveFrom: u.effective_from, effectiveTo: u.effective_to, current: activeAt(u.effective_from, u.effective_to, at) })),
    positions: positions.map((p): Position & { current: boolean } => ({ id: p.id, unitId: p.unit_id, title: p.title, level: p.level as Level, reportsTo: p.reports_to, dottedTo: parseJson<string[]>(p.dotted_to, []), active: !!p.active, effectiveFrom: p.effective_from, effectiveTo: p.effective_to, current: !!p.active && activeAt(p.effective_from, p.effective_to, at) })),
    assignments: assignments.map((a): Assignment & { current: boolean } => ({ id: a.id, positionId: a.position_id, userId: a.user_id, userName: a.name, kind: a.kind === "acting" ? "acting" : "substantive", startAt: a.start_at, endAt: a.end_at, authorizationRef: a.authorization_ref, approvedBy: a.approved_by, current: activeAt(a.start_at, a.end_at, at) })),
  };
}

// The positions a person holds at a time (several at once; acting ones marked).
export async function positionsOf(userId: string, at = nowIso()) {
  return all<{ position_id: string; title: string; level: string; unit_id: string | null; unit_name: string | null; kind: string; reports_to: string | null }>(
    `SELECT a.position_id, p.title, p.level, p.unit_id, u.name AS unit_name, a.kind, p.reports_to FROM org_assignments a JOIN org_positions p ON p.id = a.position_id LEFT JOIN org_units u ON u.id = p.unit_id
     WHERE a.user_id = ? AND a.start_at <= ? AND (a.end_at IS NULL OR a.end_at > ?) AND p.active = 1 AND (p.effective_to IS NULL OR p.effective_to > ?)`,
    userId,
    at,
    at,
    at,
  );
}

// Who holds a position at a time (an acting holder counts; substantive holders first).
export async function holdersOf(positionId: string, at = nowIso()) {
  return all<{ user_id: string; name: string; kind: string }>(
    "SELECT a.user_id, u.name, a.kind FROM org_assignments a JOIN users u ON u.id = a.user_id WHERE a.position_id = ? AND a.start_at <= ? AND (a.end_at IS NULL OR a.end_at > ?) AND u.active = 1 ORDER BY CASE a.kind WHEN 'substantive' THEN 0 ELSE 1 END, a.start_at",
    positionId,
    at,
    at,
  );
}

// The person's supervisor: the holder of the position their (first) position reports to.
export async function supervisorOf(userId: string, at = nowIso()) {
  for (const p of await positionsOf(userId, at)) if (p.reports_to) {
    const h = (await holdersOf(p.reports_to, at))[0];
    if (h) return { userId: h.user_id, name: h.name, positionId: p.reports_to };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Changing the organisation
// ---------------------------------------------------------------------------

export async function saveUnit(user: AppUser, input: Partial<Unit> & { name: string }) {
  needOrg(user);
  const name = s(input.name, 120);
  if (!name) throw new WorkflowError("VALIDATION", "Name the unit.");
  const kind = (UNIT_KINDS as readonly string[]).includes(String(input.kind)) ? input.kind! : "department";
  if (input.id && input.parentId) await noCycle("org_units", "parent_id", input.id, input.parentId);
  const now = nowIso();
  let id = input.id ?? null;
  const vals = [input.parentId || null, kind, name, s(input.code, 20), iso(input.effectiveFrom), iso(input.effectiveTo)] as const;
  if (id) {
    const r = await run("UPDATE org_units SET parent_id = ?, kind = ?, name = ?, code = ?, effective_from = ?, effective_to = ? WHERE id = ?", ...vals, id);
    if (!r.changes) throw new WorkflowError("NOT_FOUND", "Unit not found.");
  } else {
    id = uid("ou_");
    await run("INSERT INTO org_units (parent_id, kind, name, code, effective_from, effective_to, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ...vals, id, now);
  }
  await audit(user, null, "org.unit", { id, name, kind, parentId: input.parentId ?? null });
  return id;
}

async function noCycle(table: "org_units" | "org_positions", col: string, id: string, newParent: string) {
  let cur: string | null = newParent;
  for (let i = 0; cur && i < 500; i++) {
    if (cur === id) throw new WorkflowError("VALIDATION", "That would make it report to itself (a loop).");
    cur = (await get<{ p: string | null }>(`SELECT ${col} AS p FROM ${table} WHERE id = ?`, cur))?.p ?? null;
  }
}

export async function savePosition(user: AppUser, input: Partial<Position> & { title: string }) {
  needOrg(user);
  const title = s(input.title, 160);
  if (!title) throw new WorkflowError("VALIDATION", "Name the position.");
  const level = (LEVELS as readonly string[]).includes(String(input.level)) ? input.level! : "operational";
  if (input.reportsTo && input.id) await noCycle("org_positions", "reports_to", input.id, input.reportsTo);
  const dotted = [...new Set((input.dottedTo ?? []).filter((x) => x && x !== input.id))].slice(0, 10);
  const now = nowIso();
  let id = input.id ?? null;
  const vals = [input.unitId || null, title, level, input.reportsTo || null, JSON.stringify(dotted), input.active === false ? 0 : 1, iso(input.effectiveFrom), iso(input.effectiveTo)] as const;
  if (id) {
    const r = await run("UPDATE org_positions SET unit_id = ?, title = ?, level = ?, reports_to = ?, dotted_to = ?, active = ?, effective_from = ?, effective_to = ? WHERE id = ?", ...vals, id);
    if (!r.changes) throw new WorkflowError("NOT_FOUND", "Position not found.");
  } else {
    id = uid("op_");
    await run("INSERT INTO org_positions (unit_id, title, level, reports_to, dotted_to, active, effective_from, effective_to, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...vals, id, now);
  }
  await audit(user, null, "org.position", { id, title, level, reportsTo: input.reportsTo ?? null });
  return id;
}

// Puts a person in a position from a date (normally, or acting with the authorising document and approver).
export async function assign(user: AppUser, input: { positionId: string; userId: string; kind?: "substantive" | "acting"; startAt?: string | null; endAt?: string | null; authorizationRef?: string | null; approvedBy?: string | null }) {
  needOrg(user);
  if (!(await get("SELECT 1 AS x FROM org_positions WHERE id = ?", input.positionId))) throw new WorkflowError("NOT_FOUND", "Position not found.");
  const person = await get<{ name: string }>("SELECT name FROM users WHERE id = ? AND active = 1", input.userId);
  if (!person) throw new WorkflowError("NOT_FOUND", "Person not found.");
  const kind = input.kind === "acting" ? "acting" : "substantive";
  const start = iso(input.startAt) ?? nowIso();
  const end = iso(input.endAt);
  if (end && end <= start) throw new WorkflowError("VALIDATION", "The end must be after the start.");
  if (kind === "acting" && !end) throw new WorkflowError("VALIDATION", "An acting appointment needs an end date.");
  if (kind === "acting" && !s(input.authorizationRef, 120)) throw new WorkflowError("VALIDATION", "Give the document that authorises the acting appointment.");
  const id = uid("oa_");
  await run(
    "INSERT INTO org_assignments (id, position_id, user_id, kind, start_at, end_at, authorization_ref, approved_by, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, input.positionId, input.userId, kind, start, end, s(input.authorizationRef, 120), s(input.approvedBy, 120), user.id, nowIso(),
  );
  await audit(user, null, "org.assigned", { id, positionId: input.positionId, userId: input.userId, person: person.name, kind, start, end });
  return id;
}

// Ends an assignment from a date (never deletes it: history keeps who held what when).
export async function endAssignment(user: AppUser, id: string, endAt?: string | null) {
  needOrg(user);
  const end = iso(endAt) ?? nowIso();
  const r = await run("UPDATE org_assignments SET end_at = ? WHERE id = ? AND (end_at IS NULL OR end_at > ?)", end, id, end);
  if (!r.changes) throw new WorkflowError("INVALID_STATE", "That assignment has already ended.");
  await audit(user, null, "org.assignment_ended", { id, end });
}

// The default hierarchy: a board, the executive team under the CEO, and the governance roles. Only once.
export async function loadDefaultHierarchy(user: AppUser) {
  needOrg(user);
  if (await get("SELECT 1 AS x FROM org_positions LIMIT 1")) throw new WorkflowError("INVALID_STATE", "The organisation already has positions. Add the ones you need instead.");
  return tx(async () => {
    const now = nowIso();
    const unit = async (name: string, kind: UnitKind, parent: string | null) => {
      const id = uid("ou_");
      await run("INSERT INTO org_units (id, parent_id, kind, name, created_at) VALUES (?, ?, ?, ?, ?)", id, parent, kind, name, now);
      return id;
    };
    const pos = async (title: string, level: Level, unitId: string, reportsTo: string | null, sort: number) => {
      const id = uid("op_");
      await run("INSERT INTO org_positions (id, unit_id, title, level, reports_to, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, unitId, title, level, reportsTo, sort, now);
      return id;
    };
    const board = await unit("Board of Directors", "board", null);
    const exec = await unit("Executive management", "executive", board);
    const gov = await unit("Governance and oversight", "committee", exec);
    const chair = await pos("Chairman of the Board", "board", board, null, 0);
    await pos("Vice Chairman", "board", board, chair, 1);
    await pos("Board Secretary", "governance", board, chair, 2);
    const ceo = await pos("Chief Executive Officer (CEO)", "executive", exec, chair, 0);
    const dceo = await pos("Deputy Chief Executive Officer (DCEO)", "executive", exec, ceo, 1);
    let n = 2;
    for (const t of DEFAULT_POSITIONS.executive.slice(2)) await pos(t, "executive", exec, t.includes("(COO)") ? dceo : ceo, n++);
    for (const t of DEFAULT_POSITIONS.governance) await pos(t, "governance", gov, t === "Internal Auditor" ? chair : ceo, n++);
    await audit(user, null, "org.defaults_loaded", { units: 3 });
    return { board, exec, ceo, dceo };
  });
}

// ---------------------------------------------------------------------------
// Authority matrix and delegations
// ---------------------------------------------------------------------------

export async function listAuthorities(): Promise<Authority[]> {
  return (await all<{ id: string; subject_kind: string; subject_id: string; action: string; category_id: string | null; department: string | null; max_classification: string; max_value: number | null; note: string | null }>("SELECT * FROM org_authorities WHERE revoked_at IS NULL ORDER BY action, subject_kind")).map((r) => ({
    id: r.id, subjectKind: r.subject_kind as Authority["subjectKind"], subjectId: r.subject_id, action: r.action as AuthorityAction, categoryId: r.category_id, department: r.department, maxClassification: r.max_classification, maxValue: r.max_value == null ? null : Number(r.max_value), note: r.note,
  }));
}

export async function grantAuthority(user: AppUser, input: Omit<Authority, "id">) {
  needOrg(user);
  if (!(ACTIONS as readonly string[]).includes(input.action)) throw new WorkflowError("VALIDATION", "Unknown action.");
  if (!["position", "level", "user"].includes(input.subjectKind) || !input.subjectId) throw new WorkflowError("VALIDATION", "Choose who gets the authority.");
  if (input.subjectKind === "level" && !(LEVELS as readonly string[]).includes(input.subjectId)) throw new WorkflowError("VALIDATION", "Unknown level.");
  const cls = input.maxClassification in CLASS_RANK ? input.maxClassification : "restricted";
  const id = uid("oz_");
  await run(
    "INSERT INTO org_authorities (id, subject_kind, subject_id, action, category_id, department, max_classification, max_value, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, input.subjectKind, input.subjectId, input.action, input.categoryId || null, s(input.department, 80), cls, input.maxValue == null || input.maxValue === ("" as never) ? null : Math.max(0, Number(input.maxValue)), s(input.note, 300), user.id, nowIso(),
  );
  await audit(user, null, "authority.granted", { id, ...input });
  return id;
}

export async function revokeAuthority(user: AppUser, id: string) {
  needOrg(user);
  await run("UPDATE org_authorities SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL", nowIso(), user.id, id);
  await audit(user, null, "authority.revoked", { id });
}

export async function listDelegations(opts: { includeEnded?: boolean } = {}): Promise<Delegation[]> {
  const rows = await all<{ id: string; from_user: string; from_name: string; from_position: string | null; from_title: string | null; to_user: string; to_name: string; actions: string; categories: string; max_value: number | null; includes_signing: number; can_subdelegate: number; conditions: string | null; start_at: string; end_at: string; revoked_at: string | null; authorization_ref: string | null; parent_id: string | null }>(
    `SELECT d.*, f.name AS from_name, t.name AS to_name, p.title AS from_title FROM org_delegations d JOIN users f ON f.id = d.from_user JOIN users t ON t.id = d.to_user LEFT JOIN org_positions p ON p.id = d.from_position
     ${opts.includeEnded ? "" : "WHERE d.revoked_at IS NULL AND d.end_at > ?"} ORDER BY d.start_at DESC`,
    ...(opts.includeEnded ? [] : [nowIso()]),
  );
  return rows.map((r) => ({
    id: r.id, fromUser: r.from_user, fromName: r.from_name, fromPosition: r.from_position, fromPositionTitle: r.from_title, toUser: r.to_user, toName: r.to_name, actions: parseJson<AuthorityAction[]>(r.actions, []), categories: parseJson<string[]>(r.categories, []),
    maxValue: r.max_value == null ? null : Number(r.max_value), includesSigning: !!r.includes_signing, canSubdelegate: !!r.can_subdelegate, conditions: r.conditions, startAt: r.start_at, endAt: r.end_at, revokedAt: r.revoked_at, authorizationRef: r.authorization_ref, parentId: r.parent_id,
  }));
}

// A delegation: what the delegator may do themselves, handed (in part) to someone for a period. Administrators set
// up any delegation; a person may delegate their own authority when the policy allows it (and a delegate only when
// their delegation allows passing it on).
export async function createDelegation(user: AppUser, input: { fromUser: string; fromPosition?: string | null; toUser: string; actions: AuthorityAction[]; categories?: string[]; maxValue?: number | null; includesSigning?: boolean; canSubdelegate?: boolean; conditions?: string; startAt?: string | null; endAt: string; authorizationRef?: string | null; parentId?: string | null }) {
  const admin = corrCan(user, "admin");
  if (!admin && input.fromUser !== user.id) throw new WorkflowError("FORBIDDEN", "You can only delegate your own authority.");
  if (input.fromUser === input.toUser) throw new WorkflowError("VALIDATION", "Delegate to someone else.");
  const actions = [...new Set((input.actions ?? []).filter((a) => (ACTIONS as readonly string[]).includes(a)))];
  if (!actions.length) throw new WorkflowError("VALIDATION", "Choose what is delegated.");
  if (actions.includes("sign") && !input.includesSigning) throw new WorkflowError("VALIDATION", "Signing is delegated only when the delegation says it includes signing.");
  const start = iso(input.startAt) ?? nowIso();
  const end = iso(input.endAt);
  if (!end || end <= start) throw new WorkflowError("VALIDATION", "A delegation needs an end date after its start.");
  if (!(await get("SELECT 1 AS x FROM users WHERE id = ? AND active = 1", input.toUser))) throw new WorkflowError("NOT_FOUND", "The delegate was not found.");
  // Passing on: only within the parent delegation's scope and period, and only if it allows passing on.
  if (input.parentId) {
    const p = (await listDelegations({ includeEnded: true })).find((d) => d.id === input.parentId);
    if (!p || p.toUser !== input.fromUser || p.revokedAt || p.endAt <= nowIso()) throw new WorkflowError("FORBIDDEN", "That delegation is not yours to pass on, or has ended.");
    if (!p.canSubdelegate) throw new WorkflowError("FORBIDDEN", "Your delegation does not allow passing it on.");
    if (actions.some((a) => !p.actions.includes(a)) || (input.includesSigning && !p.includesSigning) || end > p.endAt) throw new WorkflowError("FORBIDDEN", "You cannot pass on more than you were given.");
  } else {
    // The delegator must hold each delegated authority themselves.
    for (const a of actions) if (!(await resolveAuthority(input.fromUser, a, {}, { noDelegation: true })).length) throw new WorkflowError("FORBIDDEN", `The delegator does not hold "${ACTION_LABELS[a]}" themselves.`);
  }
  const id = uid("od_");
  await run(
    "INSERT INTO org_delegations (id, from_user, from_position, to_user, actions, categories, max_value, includes_signing, can_subdelegate, conditions, start_at, end_at, authorization_ref, parent_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, input.fromUser, input.fromPosition || null, input.toUser, JSON.stringify(actions), JSON.stringify([...new Set(input.categories ?? [])]), input.maxValue == null ? null : Math.max(0, Number(input.maxValue)),
    !!input.includesSigning, !!input.canSubdelegate, s(input.conditions, 500), start, end, s(input.authorizationRef, 120), input.parentId || null, user.id, nowIso(),
  );
  await audit(user, null, "delegation.created", { id, from: input.fromUser, to: input.toUser, actions, start, end, signing: !!input.includesSigning });
  return id;
}

export async function revokeDelegation(user: AppUser, id: string) {
  const d = await get<{ from_user: string }>("SELECT from_user FROM org_delegations WHERE id = ?", id);
  if (!d) throw new WorkflowError("NOT_FOUND", "Delegation not found.");
  if (d.from_user !== user.id && !corrCan(user, "admin")) throw new WorkflowError("FORBIDDEN", "Only the delegator or an administrator revokes a delegation.");
  // Revoking also ends whatever was passed on from it.
  await run("UPDATE org_delegations SET revoked_at = ?, revoked_by = ? WHERE (id = ? OR parent_id = ?) AND revoked_at IS NULL", nowIso(), user.id, id, id);
  await audit(user, null, "delegation.revoked", { id });
}

// ---------------------------------------------------------------------------
// May this person do this, and in what capacity?
// ---------------------------------------------------------------------------

export type Capacity = { kind: "own" | "acting" | "delegated"; positionId: string | null; positionTitle: string | null; delegationId?: string; delegatedBy?: string; label: string };
export type AuthorityContext = { categoryId?: string | null; department?: string | null; classification?: string | null; value?: number | null; at?: string };

function matches(a: { action: string; category_id: string | null; department: string | null; max_classification: string; max_value: number | null }, action: AuthorityAction, ctx: AuthorityContext) {
  if (a.action !== action) return false;
  if (a.category_id && ctx.categoryId && a.category_id !== ctx.categoryId) return false;
  if (a.category_id && !ctx.categoryId) return false;
  if (a.department && ctx.department && a.department.toLowerCase() !== ctx.department.toLowerCase()) return false;
  if (a.department && !ctx.department) return false;
  if ((CLASS_RANK[ctx.classification ?? "public"] ?? 0) > (CLASS_RANK[a.max_classification] ?? 3)) return false;
  if (a.max_value != null && ctx.value != null && Number(ctx.value) > Number(a.max_value)) return false;
  return true;
}

// Every capacity in which the person holds the authority at that time: through a position they hold (normally or
// acting), personally, or through a delegation that is in force, covers the action and category, and whose delegator
// still holds the authority. Empty when they may not.
export async function resolveAuthority(userId: string, action: AuthorityAction, ctx: AuthorityContext, opts: { noDelegation?: boolean; depth?: number } = {}): Promise<Capacity[]> {
  const at = ctx.at ?? nowIso();
  const [held, rules] = await Promise.all([positionsOf(userId, at), all<{ subject_kind: string; subject_id: string; action: string; category_id: string | null; department: string | null; max_classification: string; max_value: number | null }>("SELECT * FROM org_authorities WHERE revoked_at IS NULL AND action = ?", action)]);
  const out: Capacity[] = [];
  for (const p of held) {
    const ok = rules.some((r) => ((r.subject_kind === "position" && r.subject_id === p.position_id) || (r.subject_kind === "level" && r.subject_id === p.level)) && matches(r, action, { ...ctx, department: ctx.department ?? p.unit_name }));
    if (ok) out.push({ kind: p.kind === "acting" ? "acting" : "own", positionId: p.position_id, positionTitle: p.title, label: p.kind === "acting" ? `Acting ${p.title}` : p.title });
  }
  if (rules.some((r) => r.subject_kind === "user" && r.subject_id === userId && matches(r, action, ctx))) out.push({ kind: "own", positionId: null, positionTitle: held[0]?.title ?? null, label: held[0]?.title ?? "In their own name" });
  if (opts.noDelegation || (opts.depth ?? 0) > 3) return out;
  const dels = await all<{ id: string; from_user: string; from_position: string | null; actions: string; categories: string; max_value: number | null; includes_signing: number; parent_id: string | null; from_name: string; from_title: string | null }>(
    `SELECT d.*, f.name AS from_name, p.title AS from_title FROM org_delegations d JOIN users f ON f.id = d.from_user LEFT JOIN org_positions p ON p.id = d.from_position
     WHERE d.to_user = ? AND d.revoked_at IS NULL AND d.start_at <= ? AND d.end_at > ?`,
    userId,
    at,
    at,
  );
  for (const d of dels) {
    const acts = parseJson<string[]>(d.actions, []);
    const cats = parseJson<string[]>(d.categories, []);
    if (!acts.includes(action)) continue;
    if (action === "sign" && !d.includes_signing) continue;
    if (cats.length && (!ctx.categoryId || !cats.includes(ctx.categoryId))) continue;
    if (d.max_value != null && ctx.value != null && Number(ctx.value) > Number(d.max_value)) continue;
    // The delegator must still hold it (a delegation never outlives the authority it hands on).
    const theirs = await resolveAuthority(d.from_user, action, { ...ctx, at }, { depth: (opts.depth ?? 0) + 1, noDelegation: !d.parent_id });
    if (!theirs.length) continue;
    const title = d.from_title ?? theirs[0]!.positionTitle ?? d.from_name;
    out.push({ kind: "delegated", positionId: d.from_position, positionTitle: title, delegationId: d.id, delegatedBy: d.from_name, label: `For the ${title} (delegated by ${d.from_name})` });
  }
  return out;
}

// The organisation as it is now, for the history: who held which position, with the authorities.
export async function governanceSummary() {
  const [chart, authorities, delegations] = await Promise.all([orgChart(), listAuthorities(), listDelegations({ includeEnded: true })]);
  const now = nowIso();
  return {
    chart,
    authorities,
    activeDelegations: delegations.filter((d) => !d.revokedAt && d.startAt <= now && d.endAt > now),
    endedDelegations: delegations.filter((d) => d.revokedAt || d.endAt <= now),
    vacant: chart.positions.filter((p) => p.current && !chart.assignments.some((a) => a.current && a.positionId === p.id)),
    acting: chart.assignments.filter((a) => a.current && a.kind === "acting"),
  };
}
