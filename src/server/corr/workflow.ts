// Approval and signing workflows for official letters, driven by data, not code.
//
//  - A workflow is a list of stages run in order. A stage asks for an action (review, an approval, a signature, a
//    stamp) from its targets, and is: sequential (each target in turn), parallel (all), alternative (any one) or
//    quorum (n of them). A stage may apply only when a condition holds, and may be optional.
//  - Targets are a person, a position (whoever holds it then, acting holders included, or their delegate), a role,
//    the writer's supervisor, or anyone holding the authority for the action.
//  - Rules (condition trees with AND, OR, priorities and effective dates) choose the workflow and add stages, for
//    example "financial value above 100,000 needs the CFO". Each run stores the exact definition and rules it used.
//  - Controls: nobody approves their own letter (unless the workflow allows it); a person acts only through a position
//    they hold or a delegation in force at that moment; the content is locked while the letter is in the workflow
//    and every step records the content's fingerprint; a rejection sends the letter back to draft, and the next
//    submission starts a new run, so all signatures are given again on the new content; issuing needs a completed
//    run on exactly the content being issued.

import { all, get, nowIso, parseJson, run, tx, uid } from "../db";
import { WorkflowError } from "../workflow";
import { loadUser, type AppUser } from "../users";
import { audit, canonical, corrCan, lockDoc, sha256 } from "./core";
import { ACTION_LABELS, holdersOf, resolveAuthority, supervisorOf, type AuthorityAction } from "./org";
import { getCategory } from "./setup";

export const STAGE_TYPES = ["sequential", "parallel", "alternative", "quorum"] as const;
export type StageType = (typeof STAGE_TYPES)[number];
export type Target = { kind: "user" | "position" | "role" | "supervisor" | "authority"; id?: string; label?: string };
export type Cond = { all: Cond[] } | { any: Cond[] } | { not: Cond } | { field: CondField; op: CondOp; value: string | number | string[] };
export const COND_FIELDS = ["category", "department", "classification", "recipient_type", "financial_value", "risk", "direction", "priority", "entity"] as const;
export type CondField = (typeof COND_FIELDS)[number];
export const COND_OPS = ["eq", "neq", "in", "gt", "gte", "lt", "lte", "contains"] as const;
export type CondOp = (typeof COND_OPS)[number];
export type Stage = {
  key: string;
  name: string;
  type: StageType;
  action: AuthorityAction;
  // Shown above the signature block ("Prepared by", "Reviewed by", "Approved by", "Authorised by").
  label: string;
  targets: Target[];
  quorum?: number;
  optional?: boolean;
  condition?: Cond | null;
  deadlineHours?: number | null;
  signatureBlock?: boolean;
};
export type WorkflowDef = { stages: Stage[]; selfApproval: "forbid" | "allow"; preparedBlock: boolean };
export type RuleEffect = { requireWorkflow?: string; addStages?: Stage[]; place?: "start" | "before_sign" | "end" };

const sKey = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------------------
// Conditions and definitions
// ---------------------------------------------------------------------------

export type DocFacts = { category: string; department: string; classification: string; recipient_type: string; financial_value: number | null; risk: string; direction: string; priority: string; entity: string };

export function evaluate(c: Cond | null | undefined, f: DocFacts, depth = 0): boolean {
  if (!c || depth > 20) return true;
  if ("all" in c) return c.all.every((x) => evaluate(x, f, depth + 1));
  if ("any" in c) return c.any.some((x) => evaluate(x, f, depth + 1));
  if ("not" in c) return !evaluate(c.not, f, depth + 1);
  const v = f[c.field];
  const want = c.value;
  const str = (x: unknown) => String(x ?? "").toLowerCase();
  switch (c.op) {
    case "eq":
      return str(v) === str(want);
    case "neq":
      return str(v) !== str(want);
    case "in":
      return (Array.isArray(want) ? want : String(want).split(",")).map((x) => str(x).trim()).includes(str(v));
    case "contains":
      return str(v).includes(str(want));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (v == null || v === "") return false;
      const a = Number(v);
      const b = Number(want);
      return c.op === "gt" ? a > b : c.op === "gte" ? a >= b : c.op === "lt" ? a < b : a <= b;
    }
  }
  return false;
}

function cleanCond(c: unknown, depth = 0): Cond | null {
  if (!c || typeof c !== "object" || depth > 10) return null;
  const x = c as Record<string, unknown>;
  if (Array.isArray(x.all)) return { all: x.all.slice(0, 30).map((y) => cleanCond(y, depth + 1)).filter((y): y is Cond => !!y) };
  if (Array.isArray(x.any)) return { any: x.any.slice(0, 30).map((y) => cleanCond(y, depth + 1)).filter((y): y is Cond => !!y) };
  if (x.not) {
    const n = cleanCond(x.not, depth + 1);
    return n ? { not: n } : null;
  }
  if (!(COND_FIELDS as readonly string[]).includes(String(x.field)) || !(COND_OPS as readonly string[]).includes(String(x.op))) return null;
  const value = Array.isArray(x.value) ? x.value.slice(0, 50).map((v) => String(v).slice(0, 80)) : typeof x.value === "number" ? x.value : String(x.value ?? "").slice(0, 200);
  return { field: x.field as CondField, op: x.op as CondOp, value };
}

const ACTIONS_OK = ["review", "approve_department", "approve_executive", "approve_financial", "approve_legal", "approve_board", "sign", "stamp", "issue", "dispatch", "prepare"];
function cleanStage(s: unknown): Stage | null {
  const x = (s ?? {}) as Record<string, unknown>;
  if (!ACTIONS_OK.includes(String(x.action))) return null;
  const type = (STAGE_TYPES as readonly string[]).includes(String(x.type)) ? (x.type as StageType) : "sequential";
  const targets = (Array.isArray(x.targets) ? x.targets : [])
    .slice(0, 20)
    .map((t) => {
      const y = (t ?? {}) as Record<string, unknown>;
      const kind = ["user", "position", "role", "supervisor", "authority"].includes(String(y.kind)) ? (y.kind as Target["kind"]) : null;
      if (!kind || ((kind === "user" || kind === "position" || kind === "role") && !y.id)) return null;
      return { kind, id: y.id ? String(y.id).slice(0, 60) : undefined, label: y.label ? String(y.label).slice(0, 120) : undefined };
    })
    .filter((t): t is NonNullable<typeof t> => !!t) as Target[];
  if (!targets.length) return null;
  return {
    key: /^[a-z0-9]{4,20}$/i.test(String(x.key)) ? String(x.key) : sKey(),
    name: String(x.name ?? "Stage").slice(0, 80),
    type,
    action: x.action as AuthorityAction,
    label: String(x.label ?? (x.action === "sign" ? "Signed by" : x.action === "review" ? "Reviewed by" : "Approved by")).slice(0, 60),
    targets,
    quorum: type === "quorum" ? Math.min(targets.length > 1 ? 50 : 1, Math.max(1, Number(x.quorum) || 1)) : undefined,
    optional: !!x.optional,
    condition: cleanCond(x.condition),
    deadlineHours: x.deadlineHours ? Math.min(24 * 90, Math.max(1, Number(x.deadlineHours))) : null,
    signatureBlock: x.signatureBlock === undefined ? x.action === "sign" || String(x.action).startsWith("approve") : !!x.signatureBlock,
  };
}

export function cleanDefinition(d: unknown): WorkflowDef {
  const x = (d ?? {}) as Record<string, unknown>;
  return { stages: (Array.isArray(x.stages) ? x.stages : []).slice(0, 30).map(cleanStage).filter((s): s is Stage => !!s), selfApproval: x.selfApproval === "allow" ? "allow" : "forbid", preparedBlock: x.preparedBlock !== false };
}

// ---------------------------------------------------------------------------
// Workflows and rules (setup)
// ---------------------------------------------------------------------------

function needSetup(user: AppUser) {
  if ((user as AppUser & { previewBy?: unknown }).previewBy) throw new WorkflowError("FORBIDDEN", "View as is read only.");
  if (!corrCan(user, "admin") && !(user.perms as string[]).includes("corr.workflow")) throw new WorkflowError("FORBIDDEN", "Only workflow administrators change workflows and rules.");
}

export async function listWorkflows() {
  return (await all<{ id: string; name: string; description: string | null; version: number; definition: string; active: number; updated_at: string }>("SELECT * FROM corr_workflows ORDER BY name")).map((w) => ({ id: w.id, name: w.name, description: w.description, version: Number(w.version), definition: cleanDefinition(parseJson(w.definition, {})), active: !!w.active, updatedAt: w.updated_at }));
}

// Saving a workflow makes a new version; runs already started keep the version they were made from.
export async function saveWorkflow(user: AppUser, input: { id?: string; name: string; description?: string; definition: unknown; active?: boolean }) {
  needSetup(user);
  const def = cleanDefinition(input.definition);
  if (!def.stages.length) throw new WorkflowError("VALIDATION", "Add at least one stage, each with who acts.");
  const name = String(input.name ?? "").trim().slice(0, 100);
  if (!name) throw new WorkflowError("VALIDATION", "Name the workflow.");
  const now = nowIso();
  return tx(async () => {
    let id = input.id ?? null;
    let version = 1;
    if (id) {
      const cur = await get<{ version: number }>("SELECT version FROM corr_workflows WHERE id = ? FOR UPDATE", id);
      if (!cur) throw new WorkflowError("NOT_FOUND", "Workflow not found.");
      version = Number(cur.version) + 1;
      await run("UPDATE corr_workflows SET name = ?, description = ?, version = ?, definition = ?, active = ?, updated_at = ? WHERE id = ?", name, String(input.description ?? "").slice(0, 400) || null, version, JSON.stringify(def), input.active === false ? 0 : 1, now, id);
    } else {
      id = uid("cw_");
      await run("INSERT INTO corr_workflows (id, name, description, version, definition, active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)", id, name, String(input.description ?? "").slice(0, 400) || null, JSON.stringify(def), input.active === false ? 0 : 1, user.id, now, now);
    }
    await run("INSERT INTO corr_workflow_versions (workflow_id, version, definition, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)", id, version, JSON.stringify(def), user.name, now);
    await audit(user, null, "workflow.saved", { id, name, version, stages: def.stages.map((s) => `${s.name} (${s.type}, ${s.action})`) });
    return { id, version };
  });
}

export async function listRules() {
  return (await all<{ id: string; name: string; priority: number; condition: string; effect: string; active: number; effective_from: string | null; effective_to: string | null; version: number }>("SELECT * FROM corr_rules ORDER BY priority, name")).map((r) => ({
    id: r.id, name: r.name, priority: Number(r.priority), condition: cleanCond(parseJson(r.condition, {})), effect: parseJson<RuleEffect>(r.effect, {}), active: !!r.active, effectiveFrom: r.effective_from, effectiveTo: r.effective_to, version: Number(r.version),
  }));
}

export async function saveRule(user: AppUser, input: { id?: string; name: string; priority?: number; condition: unknown; effect: RuleEffect; active?: boolean; effectiveFrom?: string | null; effectiveTo?: string | null }) {
  needSetup(user);
  const cond = cleanCond(input.condition);
  if (!cond) throw new WorkflowError("VALIDATION", "Give the rule a condition.");
  const effect: RuleEffect = {
    requireWorkflow: input.effect?.requireWorkflow ? String(input.effect.requireWorkflow) : undefined,
    addStages: (input.effect?.addStages ?? []).map(cleanStage).filter((s): s is Stage => !!s),
    place: input.effect?.place === "start" || input.effect?.place === "end" ? input.effect.place : "before_sign",
  };
  if (!effect.requireWorkflow && !effect.addStages?.length) throw new WorkflowError("VALIDATION", "Say what the rule does: use a workflow, or add stages.");
  if (effect.requireWorkflow && !(await get("SELECT 1 AS x FROM corr_workflows WHERE id = ?", effect.requireWorkflow))) throw new WorkflowError("VALIDATION", "That workflow does not exist.");
  const name = String(input.name ?? "").trim().slice(0, 100) || "Rule";
  const now = nowIso();
  const vals = [name, Math.round(Number(input.priority ?? 100)), JSON.stringify(cond), JSON.stringify(effect), input.active === false ? 0 : 1, input.effectiveFrom || null, input.effectiveTo || null] as const;
  let id = input.id ?? null;
  if (id) {
    const r = await run("UPDATE corr_rules SET name = ?, priority = ?, condition = ?, effect = ?, active = ?, effective_from = ?, effective_to = ?, version = version + 1, updated_at = ? WHERE id = ?", ...vals, now, id);
    if (!r.changes) throw new WorkflowError("NOT_FOUND", "Rule not found.");
  } else {
    id = uid("cu_");
    await run("INSERT INTO corr_rules (name, priority, condition, effect, active, effective_from, effective_to, id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...vals, id, user.id, now, now);
  }
  await audit(user, null, "rule.saved", { id, name, condition: cond, effect });
  return id;
}

// ---------------------------------------------------------------------------
// Which workflow a letter goes through
// ---------------------------------------------------------------------------

type DocRow = { id: string; status: string; category_id: string | null; department: string | null; classification: string; recipient_type: string | null; financial_value: number | null; risk: string | null; direction: string; priority: string; entity_id: string | null; created_by: string | null; subject: string; data: string };

async function facts(d: DocRow): Promise<DocFacts> {
  const cat = d.category_id ? await getCategory(d.category_id) : null;
  const ent = d.entity_id ? await get<{ code: string }>("SELECT code FROM corr_entities WHERE id = ?", d.entity_id) : null;
  return { category: cat?.code ?? "", department: d.department ?? "", classification: d.classification, recipient_type: d.recipient_type ?? "", financial_value: d.financial_value == null ? null : Number(d.financial_value), risk: d.risk ?? "", direction: d.direction, priority: d.priority, entity: ent?.code ?? "" };
}

// The definition for a letter now: its category's workflow, or the one a rule requires (the rule with the lowest
// priority number wins), plus the stages rules add, minus stages whose condition does not hold.
export async function planFor(docId: string) {
  const d = await get<DocRow>("SELECT * FROM corr_documents WHERE id = ?", docId);
  if (!d) throw new WorkflowError("NOT_FOUND", "Letter not found.");
  const f = await facts(d);
  const cat = d.category_id ? await getCategory(d.category_id) : null;
  const now = nowIso();
  const rules = (await listRules()).filter((r) => r.active && (!r.effectiveFrom || r.effectiveFrom <= now) && (!r.effectiveTo || r.effectiveTo > now) && evaluate(r.condition, f));
  const wfId = rules.find((r) => r.effect.requireWorkflow)?.effect.requireWorkflow ?? (cat?.config as { workflowId?: string } | undefined)?.workflowId ?? null;
  const wf = wfId ? (await listWorkflows()).find((w) => w.id === wfId && w.active) ?? null : null;
  let stages = [...(wf?.definition.stages ?? [])];
  for (const r of rules)
    for (const st of r.effect.addStages ?? []) {
      if (stages.some((x) => x.key === st.key)) continue;
      const signAt = stages.findIndex((x) => x.action === "sign");
      if (r.effect.place === "start") stages.unshift(st);
      else if (r.effect.place === "end" || signAt < 0) stages.push(st);
      else stages.splice(signAt, 0, st);
    }
  stages = stages.filter((s) => evaluate(s.condition, f));
  const def: WorkflowDef = { stages, selfApproval: wf?.definition.selfApproval ?? "forbid", preparedBlock: wf?.definition.preparedBlock ?? true };
  return { def, workflow: wf ? { id: wf.id, version: wf.version, name: wf.name } : null, rules: rules.map((r) => ({ id: r.id, name: r.name, version: r.version, priority: r.priority })), facts: f, requiresApproval: !!cat?.config.requiresApproval };
}

// The fingerprint of what is being approved: subject, text, recipients, classification and category.
export async function contentHash(docId: string) {
  const d = await get<{ subject: string; data: string; classification: string; category_id: string | null; financial_value: number | null }>("SELECT subject, data, classification, category_id, financial_value FROM corr_documents WHERE id = ?", docId);
  const rec = await all("SELECT kind, org_id, contact_id, name, title, organisation, address, email FROM corr_recipients WHERE document_id = ? ORDER BY sort", docId);
  return sha256(canonical({ subject: d?.subject, data: parseJson(d?.data ?? "{}", {}), classification: d?.classification, category: d?.category_id, value: d?.financial_value, recipients: rec }));
}

// ---------------------------------------------------------------------------
// Running a workflow
// ---------------------------------------------------------------------------

type StepRow = { id: string; run_id: string; document_id: string; stage_index: number; stage_key: string; stage_name: string; stage_type: string; action: string; label: string | null; quorum: number | null; user_id: string | null; user_name: string | null; status: string; capacity: string | null; delegation_id: string | null; comment: string | null; content_hash: string | null; signature_image: string | null; stamp_image: string | null; stamp_id: string | null; due_at: string | null; acted_at: string | null; created_at: string };

// Target is kept on the step as JSON in `capacity` until someone acts (then it holds the capacity they acted in).
async function insertSteps(runId: string, docId: string, index: number, st: Stage, creatorId: string | null) {
  const now = nowIso();
  const due = st.deadlineHours ? new Date(Date.now() + st.deadlineHours * 3600e3).toISOString() : null;
  for (const [i, t] of st.targets.entries()) {
    // The writer's supervisor is found now (and kept), so a later reorganisation does not move the step.
    let target = t;
    if (t.kind === "supervisor" && creatorId) {
      const sup = await supervisorOf(creatorId);
      target = sup ? { kind: "user", id: sup.userId, label: `${sup.name} (supervisor)` } : t;
    }
    const status = st.type === "sequential" && i > 0 ? "waiting" : "pending";
    await run(
      "INSERT INTO corr_steps (id, run_id, document_id, stage_index, stage_key, stage_name, stage_type, action, label, quorum, user_id, status, capacity, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      uid("cs_"), runId, docId, index, st.key, st.name, st.type, st.action, st.label, st.quorum ?? null, target.kind === "user" ? target.id! : null, status, JSON.stringify({ target }), due, now,
    );
  }
}

// Who a step's target means right now (for notifications and the inbox).
async function targetUsers(t: Target, action: AuthorityAction, ctx: { categoryId: string | null; department: string | null; classification: string; value: number | null }): Promise<string[]> {
  if (t.kind === "user" && t.id) return [t.id];
  if (t.kind === "position" && t.id) {
    const holders = (await holdersOf(t.id)).map((h) => h.user_id);
    const dels = await all<{ to_user: string }>("SELECT to_user FROM org_delegations WHERE (from_position = ? OR from_user IN (SELECT user_id FROM org_assignments WHERE position_id = ? AND start_at <= ? AND (end_at IS NULL OR end_at > ?))) AND revoked_at IS NULL AND start_at <= ? AND end_at > ?", t.id, t.id, nowIso(), nowIso(), nowIso(), nowIso());
    return [...new Set([...holders, ...dels.map((d) => d.to_user)])];
  }
  if (t.kind === "role" && t.id) return (await all<{ user_id: string }>("SELECT r.user_id FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE r.role = ? AND u.active = 1", t.id)).map((r) => r.user_id);
  if (t.kind === "authority") {
    const users = await all<{ user_id: string }>("SELECT DISTINCT user_id FROM org_assignments WHERE start_at <= ? AND (end_at IS NULL OR end_at > ?)", nowIso(), nowIso());
    const out: string[] = [];
    for (const u of users) if ((await resolveAuthority(u.user_id, action, ctx)).length) out.push(u.user_id);
    return out;
  }
  return [];
}

async function notifyStep(docId: string, step: { action: string; capacity: string | null; stage_name: string }, ctx: Parameters<typeof targetUsers>[2]) {
  const t = parseJson<{ target?: Target }>(step.capacity, {}).target;
  if (!t) return;
  const ids = await targetUsers(t, step.action as AuthorityAction, ctx);
  if (!ids.length) return;
  const d = await get<{ subject: string; ref_number: string | null }>("SELECT subject, ref_number FROM corr_documents WHERE id = ?", docId);
  const { notify } = await import("../notifications");
  await notify(ids, { type: "approval", title: `${ACTION_LABELS[step.action as AuthorityAction] ?? "Action"} needed: ${d?.subject || "a letter"}`, body: `${step.stage_name} · Correspondence`, link: `/correspondence/${docId}` }, nowIso()).catch(() => {});
  const { corrSms } = await import("./notify");
  await corrSms(ids, `${ACTION_LABELS[step.action as AuthorityAction] ?? "Action"} needed on "${(d?.subject ?? "a letter").slice(0, 80)}" (${step.stage_name}). Open Myseed, Correspondence, My approvals.`, step.stage_name.startsWith("Overdue") ? "smsOverdue" : "smsApprovals").catch(() => 0);
}

// Sends the letter into its workflow: the content is locked, and the first stage is asked.
export async function submitDoc(user: AppUser, docId: string) {
  const out = await tx(async () => {
    const d = (await lockDoc(docId)) as unknown as DocRow;
    if (d.created_by !== user.id && !corrCan(user, "admin")) throw new WorkflowError("FORBIDDEN", "Only the writer submits this letter.");
    if (d.status !== "draft") throw new WorkflowError("INVALID_STATE", "Only drafts are submitted.");
    if (!d.subject.trim()) throw new WorkflowError("VALIDATION", "Write the subject first.");
    if (d.direction === "outgoing" && !(await get("SELECT 1 AS x FROM corr_recipients WHERE document_id = ? AND kind = 'to'", docId))) throw new WorkflowError("VALIDATION", "Add at least one recipient.");
    const plan = await planFor(docId);
    if (!plan.def.stages.length) throw new WorkflowError("INVALID_STATE", "No approval is needed for this letter: issue it directly.");
    // Every stage must be able to find someone, or the letter would wait for ever.
    const ctx = { categoryId: d.category_id, department: d.department, classification: d.classification, value: d.financial_value == null ? null : Number(d.financial_value) };
    for (const st of plan.def.stages) {
      if (st.optional) continue;
      const found = new Set<string>();
      for (const t of st.targets) for (const u of t.kind === "supervisor" ? (d.created_by ? [(await supervisorOf(d.created_by))?.userId].filter(Boolean) : []) : await targetUsers(t, st.action, ctx)) found.add(u as string);
      if (!found.size) throw new WorkflowError("INVALID_STATE", `Nobody can act at the "${st.name}" stage (the position may be vacant). Ask an administrator to fill it or set a delegate.`);
    }
    const hash = await contentHash(docId);
    const runId = uid("cn_");
    const now = nowIso();
    await run("UPDATE corr_runs SET status = 'superseded', finished_at = COALESCE(finished_at, ?) WHERE document_id = ? AND status = 'running'", now, docId);
    await run(
      "INSERT INTO corr_runs (id, document_id, workflow_id, workflow_version, definition, rules, status, content_hash, started_by, started_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)",
      runId, docId, plan.workflow?.id ?? null, plan.workflow?.version ?? null, JSON.stringify(plan.def), JSON.stringify(plan.rules), hash, user.id, now,
    );
    for (const [i, st] of plan.def.stages.entries()) await insertSteps(runId, docId, i, st, d.created_by);
    // Only the first stage is open; later ones wait.
    await run("UPDATE corr_steps SET status = 'waiting' WHERE run_id = ? AND stage_index > 0", runId);
    await run("UPDATE corr_documents SET status = 'pending_approval', updated_at = ? WHERE id = ?", now, docId);
    await audit(user, docId, "submitted", { run: runId, workflow: plan.workflow?.name ?? "rules only", version: plan.workflow?.version, rules: plan.rules.map((r) => `${r.name} v${r.version}`), hash });
    return { runId, ctx };
  });
  for (const s of await all<StepRow>("SELECT * FROM corr_steps WHERE run_id = ? AND status = 'pending'", out.runId)) await notifyStep(docId, s, out.ctx);
  return out.runId;
}

// Whether this person may act on this step now, and in what capacity.
export async function capacityFor(user: AppUser, step: StepRow, doc: DocRow) {
  const t = parseJson<{ target?: Target }>(step.capacity, {}).target;
  if (!t) return null;
  const ctx = { categoryId: doc.category_id, department: doc.department, classification: doc.classification, value: doc.financial_value == null ? null : Number(doc.financial_value) };
  const action = step.action as AuthorityAction;
  const authority = await resolveAuthority(user.id, action, ctx);
  const matrixHas = !!(await get("SELECT 1 AS x FROM org_authorities WHERE action = ? AND revoked_at IS NULL LIMIT 1", action));
  let capacity: { label: string; kind: string; positionTitle?: string | null; delegationId?: string; delegatedBy?: string } | null = null;
  if (t.kind === "user") {
    if (t.id === user.id) capacity = authority.find((a) => a.kind !== "delegated") ?? { label: user.title ?? "In their own name", kind: "own" };
    else {
      const via = authority.find((a) => a.kind === "delegated" && a.delegatedBy && t.label?.includes(a.delegatedBy));
      const del = await get<{ id: string; from_name: string }>("SELECT d.id, f.name AS from_name FROM org_delegations d JOIN users f ON f.id = d.from_user WHERE d.from_user = ? AND d.to_user = ? AND d.revoked_at IS NULL AND d.start_at <= ? AND d.end_at > ? AND d.actions LIKE ?", t.id, user.id, nowIso(), nowIso(), `%"${action}"%`);
      if (del && (action !== "sign" || (await get("SELECT 1 AS x FROM org_delegations WHERE id = ? AND includes_signing = 1", del.id)))) capacity = { label: via?.label ?? `On behalf of ${del.from_name} (delegated)`, kind: "delegated", delegationId: del.id, delegatedBy: del.from_name };
    }
  } else if (t.kind === "position") {
    capacity = authority.find((a) => a.positionId === t.id) ?? null;
    if (!capacity) {
      const held = (await holdersOf(t.id!)).find((h) => h.user_id === user.id);
      if (held) {
        const title = (await get<{ title: string }>("SELECT title FROM org_positions WHERE id = ?", t.id))?.title ?? "";
        capacity = { label: held.kind === "acting" ? `Acting ${title}` : title, kind: held.kind === "acting" ? "acting" : "own", positionTitle: title };
      }
    }
  } else if (t.kind === "role") {
    if (user.roles.includes(t.id as never)) capacity = authority[0] ?? { label: user.title ?? t.label ?? t.id!, kind: "own" };
  } else if (t.kind === "authority") capacity = authority[0] ?? null;
  if (!capacity) return null;
  // Where the company has set authorities for this action, the person must also hold it (in some capacity).
  if (matrixHas && !authority.length && t.kind !== "position") return null;
  return capacity;
}

async function docRow(id: string) {
  const d = await get<DocRow>("SELECT * FROM corr_documents WHERE id = ?", id);
  if (!d) throw new WorkflowError("NOT_FOUND", "Letter not found.");
  return d;
}

// Approve, sign, stamp or review a step; or reject (back to draft, with the comment kept).
export async function actOnStep(user: AppUser, stepId: string, input: { decision: "approve" | "reject" | "revise"; comment?: string; stampId?: string | null }) {
  if ((user as AppUser & { previewBy?: unknown }).previewBy) throw new WorkflowError("FORBIDDEN", "View as is read only.");
  const result = await tx(async () => {
    const step = await get<StepRow>("SELECT * FROM corr_steps WHERE id = ? FOR UPDATE", stepId);
    if (!step) throw new WorkflowError("NOT_FOUND", "Step not found.");
    const d = (await lockDoc(step.document_id)) as unknown as DocRow;
    const runRow = await get<{ id: string; status: string; content_hash: string; definition: string }>("SELECT id, status, content_hash, definition FROM corr_runs WHERE id = ?", step.run_id);
    if (!runRow || runRow.status !== "running") throw new WorkflowError("INVALID_STATE", "This workflow is no longer running.");
    if (step.status !== "pending") throw new WorkflowError("INVALID_STATE", step.status === "waiting" ? "An earlier stage must finish first." : "This step is already done.");
    const def = cleanDefinition(parseJson(runRow.definition, {}));
    if (def.selfApproval === "forbid" && d.created_by === user.id && step.action !== "prepare") throw new WorkflowError("FORBIDDEN", "You cannot approve or sign your own letter.");
    // The same person does not act twice in one run (separation of duties), except at a stamp step.
    if (step.action !== "stamp" && (await get("SELECT 1 AS x FROM corr_steps WHERE run_id = ? AND user_id = ? AND status IN ('approved','signed') AND action <> 'stamp' AND id <> ?", step.run_id, user.id, step.id)) && def.selfApproval === "forbid")
      throw new WorkflowError("FORBIDDEN", "You have already approved this letter at another stage; someone else must act here.");
    const cap = await capacityFor(user, step, d);
    if (!cap) throw new WorkflowError("FORBIDDEN", "You do not hold this position or authority now (or your delegation has ended).");
    const hash = await contentHash(d.id);
    if (hash !== runRow.content_hash) throw new WorkflowError("INVALID_STATE", "The letter changed after it was submitted; it must be submitted again.");
    const now = nowIso();
    const comment = String(input.comment ?? "").slice(0, 1000) || null;
    if (input.decision !== "approve") {
      if (!comment || comment.length < 3) throw new WorkflowError("VALIDATION", "Say why, so the writer knows what to change.");
      await run("UPDATE corr_steps SET status = 'rejected', user_id = ?, user_name = ?, capacity = ?, comment = ?, acted_at = ? WHERE id = ?", user.id, user.name, JSON.stringify({ ...parseJson(step.capacity, {}), ...cap }), comment, now, step.id);
      await run("UPDATE corr_steps SET status = 'cancelled' WHERE run_id = ? AND status IN ('pending','waiting')", step.run_id);
      await run("UPDATE corr_runs SET status = 'rejected', finished_at = ? WHERE id = ?", now, step.run_id);
      await run("UPDATE corr_documents SET status = 'draft', updated_at = ? WHERE id = ?", now, d.id);
      await audit(user, d.id, input.decision === "revise" ? "revision_requested" : "rejected", { stage: step.stage_name, capacity: cap.label, comment });
      return { done: false, notify: [] as StepRow[], back: d.created_by, comment, decision: input.decision };
    }
    // Signatures carry the signer's registered signature as it is now; stamps the stamp they chose (if allowed).
    let signature: string | null = null;
    let stamp: { id: string; image: string } | null = null;
    if (step.action === "sign") {
      signature = (await get<{ image: string }>("SELECT image FROM corr_signatures WHERE user_id = ? AND active = 1 AND revoked_at IS NULL AND (valid_from IS NULL OR valid_from <= ?) AND (valid_to IS NULL OR valid_to > ?) ORDER BY created_at DESC LIMIT 1", user.id, now, now))?.image ?? null;
      if (!signature) throw new WorkflowError("INVALID_STATE", "Register your signature first (Correspondence, Signatures and stamps).");
    }
    if (step.action === "stamp") {
      if (!input.stampId) throw new WorkflowError("VALIDATION", "Choose the stamp.");
      const { stampAllowed } = await import("./signing");
      stamp = await stampAllowed(user, input.stampId);
    }
    const status = step.action === "sign" ? "signed" : "approved";
    await run(
      "UPDATE corr_steps SET status = ?, user_id = ?, user_name = ?, capacity = ?, delegation_id = ?, comment = ?, content_hash = ?, signature_image = ?, stamp_image = ?, stamp_id = ?, acted_at = ? WHERE id = ?",
      status, user.id, user.name, JSON.stringify({ ...parseJson(step.capacity, {}), ...cap }), cap.delegationId ?? null, comment, hash, signature, stamp?.image ?? null, stamp?.id ?? null, now, step.id,
    );
    await audit(user, d.id, step.action === "sign" ? "signed" : step.action === "stamp" ? "stamped" : "approved", { stage: step.stage_name, capacity: cap.label, delegatedBy: cap.delegatedBy, hash, comment: comment ?? undefined });
    // Is the stage complete? Then open the next one; when all are, the letter is ready to issue.
    const stage = await all<StepRow>("SELECT * FROM corr_steps WHERE run_id = ? AND stage_index = ? ORDER BY created_at, id", step.run_id, step.stage_index);
    const doneN = stage.filter((x) => x.status === "approved" || x.status === "signed").length;
    const type = step.stage_type as StageType;
    const complete = type === "alternative" ? doneN >= 1 : type === "quorum" ? doneN >= Number(step.quorum ?? 1) : stage.every((x) => x.status === "approved" || x.status === "signed");
    const toNotify: StepRow[] = [];
    if (!complete && type === "sequential") {
      const next = stage.find((x) => x.status === "waiting");
      if (next) {
        await run("UPDATE corr_steps SET status = 'pending' WHERE id = ?", next.id);
        toNotify.push(next);
      }
    }
    if (complete) {
      await run("UPDATE corr_steps SET status = 'skipped' WHERE run_id = ? AND stage_index = ? AND status IN ('pending','waiting')", step.run_id, step.stage_index);
      const nextIndex = (await get<{ i: number | null }>("SELECT MIN(stage_index) AS i FROM corr_steps WHERE run_id = ? AND stage_index > ? AND status = 'waiting'", step.run_id, step.stage_index))?.i;
      if (nextIndex != null) {
        const nextStage = await all<StepRow>("SELECT * FROM corr_steps WHERE run_id = ? AND stage_index = ? ORDER BY created_at, id", step.run_id, nextIndex);
        const open = nextStage[0]?.stage_type === "sequential" ? nextStage.slice(0, 1) : nextStage;
        for (const x of open) await run("UPDATE corr_steps SET status = 'pending', due_at = COALESCE(due_at, ?) WHERE id = ?", null, x.id);
        toNotify.push(...open);
        const anySign = nextStage.some((x) => x.action === "sign");
        await run("UPDATE corr_documents SET status = ?, updated_at = ? WHERE id = ?", anySign ? "pending_signature" : "pending_approval", now, d.id);
      } else {
        await run("UPDATE corr_runs SET status = 'completed', finished_at = ? WHERE id = ?", now, step.run_id);
        const signed = await get("SELECT 1 AS x FROM corr_steps WHERE run_id = ? AND status = 'signed'", step.run_id);
        await run("UPDATE corr_documents SET status = ?, updated_at = ? WHERE id = ?", signed ? "signed" : "approved", now, d.id);
        await audit(null, d.id, "workflow.completed", { run: step.run_id });
        return { done: true, notify: toNotify, back: d.created_by, comment: null, decision: "approve" as const };
      }
    }
    return { done: false, notify: toNotify, back: null, comment: null, decision: "approve" as const };
  });
  const d = await docRow((await get<{ document_id: string }>("SELECT document_id FROM corr_steps WHERE id = ?", stepId))!.document_id);
  const ctx = { categoryId: d.category_id, department: d.department, classification: d.classification, value: d.financial_value == null ? null : Number(d.financial_value) };
  for (const s of result.notify) await notifyStep(d.id, s, ctx);
  if (result.back) {
    const { notify } = await import("../notifications");
    await notify([result.back], { type: "approval", title: result.done ? `Ready to issue: ${d.subject}` : `Sent back: ${d.subject}`, body: result.comment ?? "Every approval and signature is done.", link: `/correspondence/${d.id}` }, nowIso()).catch(() => {});
  }
  return result;
}

// The workflow state of a letter: the latest run's steps, for the letter page and the signature blocks.
export async function workflowState(docId: string) {
  const runRow = await get<{ id: string; status: string; definition: string; rules: string; workflow_id: string | null; workflow_version: number | null; content_hash: string; started_at: string; finished_at: string | null }>("SELECT * FROM corr_runs WHERE document_id = ? ORDER BY started_at DESC LIMIT 1", docId);
  if (!runRow) return null;
  const steps = await all<StepRow>("SELECT * FROM corr_steps WHERE run_id = ? ORDER BY stage_index, created_at, id", runRow.id);
  const history = await all<{ id: string; status: string; started_at: string; finished_at: string | null }>("SELECT id, status, started_at, finished_at FROM corr_runs WHERE document_id = ? ORDER BY started_at DESC", docId);
  return {
    run: { id: runRow.id, status: runRow.status, workflowId: runRow.workflow_id, workflowVersion: runRow.workflow_version, rules: parseJson<{ name: string; version: number }[]>(runRow.rules, []), contentHash: runRow.content_hash, startedAt: runRow.started_at, finishedAt: runRow.finished_at, definition: cleanDefinition(parseJson(runRow.definition, {})) },
    steps: steps.map((s) => {
      const c = parseJson<{ target?: Target; label?: string; kind?: string; delegatedBy?: string }>(s.capacity, {});
      return { id: s.id, stageIndex: Number(s.stage_index), stageName: s.stage_name, stageType: s.stage_type as StageType, action: s.action as AuthorityAction, label: s.label, quorum: s.quorum, status: s.status, userId: s.user_id, userName: s.user_name, target: c.target ?? null, capacity: c.label ?? null, capacityKind: c.kind ?? null, delegatedBy: c.delegatedBy ?? null, comment: s.comment, signed: !!s.signature_image, signatureImage: s.signature_image, stampImage: s.stamp_image, dueAt: s.due_at, actedAt: s.acted_at };
    }),
    history,
  };
}

// The signature blocks a letter shows: one per signature or approval stage step that is (or was) asked for, filled
// as people act. An unsigned block never shows a signature picture.
export async function signatureBlocks(docId: string, preparedBy: { name: string; title: string | null } | null) {
  const st = await workflowState(docId);
  if (!st) return [];
  const blocks: { label: string; name: string; position: string; capacity: string | null; date: string | null; status: "awaiting" | "signed" | "rejected" | "delegated" | "expired" | "revoked"; image: string | null; stamp: string | null }[] = [];
  if (st.run.definition.preparedBlock && preparedBy) blocks.push({ label: "Prepared by", name: preparedBy.name, position: preparedBy.title ?? "", capacity: null, date: st.run.startedAt, status: "signed", image: null, stamp: null });
  const stamps = st.steps.filter((s) => s.action === "stamp" && s.stampImage);
  const show = st.steps.filter((s) => s.action !== "stamp" && st.run.definition.stages.find((x) => x.name === s.stageName)?.signatureBlock !== false && (s.status !== "skipped" && s.status !== "cancelled"));
  for (const s of show) {
    const done = s.status === "signed" || s.status === "approved";
    blocks.push({
      label: s.label ?? s.stageName,
      name: s.userName ?? s.target?.label ?? "",
      position: s.capacity ?? s.target?.label ?? "",
      capacity: s.capacityKind === "delegated" || s.capacityKind === "acting" ? s.capacity : null,
      date: s.actedAt,
      status: done ? "signed" : s.status === "rejected" ? "rejected" : s.status === "invalidated" ? "revoked" : "awaiting",
      image: done ? s.signatureImage : null,
      stamp: null,
    });
  }
  // A stamp is shown on the last signature.
  const lastSigned = [...blocks].reverse().find((b) => b.status === "signed" && b.label !== "Prepared by");
  if (lastSigned && stamps.length) lastSigned.stamp = stamps.at(-1)!.stampImage;
  return blocks;
}

// What issuing needs: no workflow, or a completed run on exactly the current content.
// Whether this letter must carry an official stamp before it is issued (its category says so, or Admin's policy
// lists the category).
async function stampNeeded(docId: string) {
  const c = await get<{ code: string; config: string }>("SELECT c.code, c.config FROM corr_documents d JOIN corr_categories c ON c.id = d.category_id WHERE d.id = ?", docId);
  if (!c) return false;
  if (parseJson<{ stampRequired?: boolean }>(c.config, {}).stampRequired) return true;
  const { signPolicy } = await import("./signing");
  return (await signPolicy()).stampRequired.includes(c.code);
}

export async function issueReadiness(docId: string) {
  const plan = await planFor(docId);
  const st = await workflowState(docId);
  const needStamp = await stampNeeded(docId);
  if (!plan.def.stages.length) {
    if (needStamp) return { ok: false, reason: "This kind of letter must be stamped, but its workflow has no stamp step. Ask an administrator to add one." };
    return plan.requiresApproval ? { ok: false, reason: "This category needs approval, but no workflow is set for it. Ask an administrator." } : { ok: true as const };
  }
  if (needStamp && st && !st.steps.some((x) => x.action === "stamp" && x.stampImage)) return { ok: false, reason: "This kind of letter must carry the official stamp before it is issued." };
  if (!st || st.run.status !== "completed") return { ok: false, reason: "Every approval and signature must be done first." };
  if (st.run.contentHash !== (await contentHash(docId))) return { ok: false, reason: "The letter changed after it was approved; submit it again." };
  for (const s of st.steps) if ((s.status === "signed" || s.status === "approved") && !s.userId) return { ok: false, reason: "A step has no signer recorded." };
  return { ok: true as const };
}

// Steps waiting for this person (the executive inbox), most urgent first.
export async function myQueue(user: AppUser) {
  const steps = await all<StepRow & { subject: string; ref_number: string | null; priority: string; doc_status: string; created_by: string | null }>(
    `SELECT s.*, d.subject, d.ref_number, d.priority, d.status AS doc_status, d.created_by FROM corr_steps s JOIN corr_documents d ON d.id = s.document_id JOIN corr_runs r ON r.id = s.run_id
     WHERE s.status = 'pending' AND r.status = 'running' ORDER BY CASE d.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, COALESCE(s.due_at, '9999'), s.created_at LIMIT 500`,
  );
  const out = [];
  const docs = new Map<string, DocRow>();
  for (const s of steps) {
    const d = docs.get(s.document_id) ?? (await docRow(s.document_id));
    docs.set(s.document_id, d);
    const cap = await capacityFor(user, s, d).catch(() => null);
    if (!cap) continue;
    out.push({ stepId: s.id, documentId: s.document_id, subject: s.subject, ref: s.ref_number, priority: s.priority, stage: s.stage_name, action: s.action as AuthorityAction, capacity: cap.label, dueAt: s.due_at, overdue: !!s.due_at && s.due_at < nowIso(), own: s.created_by === user.id, since: s.created_at });
  }
  return out;
}

// Overdue steps are reminded once a day and escalated to the target's supervisor (called by the scheduled checks).
export async function remindOverdue() {
  const now = nowIso();
  const late = await all<StepRow>("SELECT s.* FROM corr_steps s JOIN corr_runs r ON r.id = s.run_id WHERE s.status = 'pending' AND r.status = 'running' AND s.due_at IS NOT NULL AND s.due_at < ?", now);
  let n = 0;
  for (const s of late) {
    const d = await docRow(s.document_id);
    const ctx = { categoryId: d.category_id, department: d.department, classification: d.classification, value: d.financial_value == null ? null : Number(d.financial_value) };
    await notifyStep(d.id, { ...s, stage_name: `Overdue: ${s.stage_name}` }, ctx);
    const t = parseJson<{ target?: Target }>(s.capacity, {}).target;
    const first = t ? (await targetUsers(t, s.action as AuthorityAction, ctx))[0] : null;
    const sup = first ? await supervisorOf(first) : null;
    if (sup) {
      const { notify } = await import("../notifications");
      await notify([sup.userId], { type: "approval", title: `Escalated: ${d.subject}`, body: `${s.stage_name} is overdue`, link: `/correspondence/${d.id}` }, now).catch(() => {});
    }
    n++;
  }
  return n;
}

export async function userName(id: string) {
  return (await loadUser(id))?.name ?? null;
}
