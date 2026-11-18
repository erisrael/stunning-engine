import { all, get, nowIso, parseJson, run, tx, uid, type Param } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import * as sd from "./support-desk";
import {
  ACTION_NEEDS_TEXT,
  DESTINATION_KINDS,
  OPEN_REQUEST_STATUSES,
  REQUEST_TYPES,
  requestStatusLabel,
  type ApprovalStep,
  type RequestAction,
  type RequestStatus,
} from "@/lib/support-requests";

// Customer Support Requests (Update 1.2, Phase 7). Support asks an internal team for help on a customer's case:
// a destination Admin switched on (a department, its heads, a chosen member, the support leads, Administration).
// Every move is one of the actions below, allowed from set statuses for set people, and written to the history.
// An approval follows the chain Admin set for the destination and type; nobody approves their own request unless
// the chain allows it, and each such use is recorded and audited. Once the destination acknowledges a request, a
// linked task is made in that department's own workspace (work-extras createRequest), so its work is tracked where
// the team works. Resolving returns the result to support: the creator is told and the conversation gets a note.

type Who = "creator" | "receiver" | "approver" | "admin";
const MOVES: Record<RequestAction, { from: RequestStatus[]; to: RequestStatus | null; who: Who[] }> = {
  submit: { from: ["draft"], to: "submitted", who: ["creator"] },
  acknowledge: { from: ["submitted", "received"], to: "acknowledged", who: ["receiver", "admin"] },
  start: { from: ["received", "acknowledged", "approved"], to: "in_progress", who: ["receiver", "admin"] },
  ask_info: { from: ["received", "acknowledged", "in_progress", "approved"], to: "waiting_info", who: ["receiver", "admin"] },
  provide_info: { from: ["waiting_info"], to: "in_progress", who: ["creator"] },
  submit_approval: { from: ["received", "acknowledged", "in_progress"], to: "pending_approval", who: ["receiver", "admin"] },
  approve: { from: ["pending_approval"], to: null, who: ["approver"] },
  reject: { from: ["submitted", "received", "acknowledged", "in_progress", "pending_approval"], to: "rejected", who: ["receiver", "approver", "admin"] },
  escalate: { from: OPEN_REQUEST_STATUSES, to: null, who: ["receiver", "creator", "admin"] },
  resolve: { from: ["acknowledged", "in_progress", "approved"], to: "resolved", who: ["receiver", "admin"] },
  reopen: { from: ["resolved"], to: "in_progress", who: ["creator"] },
  close: { from: ["resolved", "rejected"], to: "closed", who: ["creator", "receiver", "admin"] },
};

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isAdmin = (u: AppUser) => can(u, "users.manage") || can(u, "settings.manage");
const FILE_MAX = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Destinations and approval chains (Admin)
// ---------------------------------------------------------------------------

type DestRow = { id: string; label: string; kind: string; dept: string | null; member_id: string | null; types_json: string; active: number; sort: number };
export type Destination = { id: string; label: string; kind: string; dept: string | null; memberId: string | null; types: string[]; active: boolean; sort: number };
const toDest = (r: DestRow): Destination => ({ id: r.id, label: r.label, kind: r.kind, dept: r.dept, memberId: r.member_id, types: parseJson<string[]>(r.types_json, []), active: !!Number(r.active), sort: Number(r.sort) });
type ChainRow = { id: string; destination_id: string | null; type: string | null; steps_json: string; allow_self: number };
export type Chain = { id: string; destinationId: string | null; type: string | null; steps: ApprovalStep[]; allowSelf: boolean };
const toChain = (r: ChainRow): Chain => ({ id: r.id, destinationId: r.destination_id, type: r.type, steps: parseJson<ApprovalStep[]>(r.steps_json, []), allowSelf: !!Number(r.allow_self) });

function needAdmin(user: AppUser) {
  if (!isAdmin(user) && !user.perms.includes("support.requests_setup")) throw new WorkflowError("FORBIDDEN", "Only Admin and people allowed to set up support requests set destinations and approval chains.");
}
export async function requestSetup(user: AppUser) {
  needAdmin(user);
  return {
    destinations: (await all<DestRow>("SELECT * FROM sup_request_destinations ORDER BY sort, label")).map(toDest),
    chains: (await all<ChainRow>("SELECT * FROM sup_request_chains ORDER BY created_at")).map(toChain),
  };
}
export async function saveDestination(user: AppUser, input: Partial<Destination> & { label: string; kind: string }) {
  needAdmin(user);
  const label = clean(input.label, 80);
  if (!label) throw new WorkflowError("VALIDATION", "Name the destination.");
  if (!DESTINATION_KINDS.some(([k]) => k === input.kind)) throw new WorkflowError("VALIDATION", "Choose who receives the requests.");
  const dept = input.kind === "dept" || input.kind === "dept_head" ? clean(input.dept, 60) : null;
  const member = input.kind === "member" ? clean(input.memberId, 60) : null;
  if ((input.kind === "dept" || input.kind === "dept_head") && !dept) throw new WorkflowError("VALIDATION", "Choose the department.");
  if (input.kind === "member" && !(await get("SELECT 1 FROM users WHERE id = ? AND active = 1", member))) throw new WorkflowError("VALIDATION", "Choose an active member.");
  const types = (input.types ?? []).filter((t) => REQUEST_TYPES.some(([k]) => k === t));
  const probe = { id: "", label, kind: input.kind, dept, memberId: member, types, active: true, sort: 0 };
  if (!(await receivers(probe)).length) throw new WorkflowError("VALIDATION", "Nobody would receive requests sent there.");
  let id = input.id ?? null;
  const v: Param[] = [label, input.kind, dept, member, JSON.stringify(types), input.active === false ? 0 : 1, Math.round(input.sort ?? 0)];
  if (id && (await get("SELECT 1 FROM sup_request_destinations WHERE id = ?", id))) await run("UPDATE sup_request_destinations SET label = ?, kind = ?, dept = ?, member_id = ?, types_json = ?, active = ?, sort = ? WHERE id = ?", ...v, id);
  else {
    id = uid("srd_");
    await run("INSERT INTO sup_request_destinations (label, kind, dept, member_id, types_json, active, sort, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ...v, id, nowIso());
  }
  await audit({ actor: user }, { action: "support.request_destination", summary: `${user.name} set the request destination "${label}"` });
  return requestSetup(user);
}
export async function deleteDestination(user: AppUser, id: string) {
  needAdmin(user);
  if (await get("SELECT 1 FROM sup_requests WHERE destination_id = ? AND status NOT IN ('closed','draft')", id)) throw new WorkflowError("INVALID_STATE", "Requests are open there. Switch it off instead.");
  await run("DELETE FROM sup_request_destinations WHERE id = ?", id);
  return requestSetup(user);
}
export async function saveChain(user: AppUser, input: Partial<Chain> & { steps: ApprovalStep[] }) {
  needAdmin(user);
  const steps = input.steps.filter((s) => ["user", "dept_head", "support_leads", "admin"].includes(s.kind)).map((s) => ({ kind: s.kind, target: s.kind === "user" || s.kind === "dept_head" ? clean(s.target, 60) : null }));
  if (!steps.length) throw new WorkflowError("VALIDATION", "Add at least one approver.");
  for (const s of steps) if (!(await approversOf(s)).length) throw new WorkflowError("VALIDATION", "Nobody would approve one of the steps.");
  const type = input.type && REQUEST_TYPES.some(([k]) => k === input.type) ? input.type : null;
  const v: Param[] = [input.destinationId || null, type, JSON.stringify(steps), input.allowSelf ? 1 : 0];
  let id = input.id ?? null;
  if (id && (await get("SELECT 1 FROM sup_request_chains WHERE id = ?", id))) await run("UPDATE sup_request_chains SET destination_id = ?, type = ?, steps_json = ?, allow_self = ? WHERE id = ?", ...v, id);
  else {
    id = uid("src_");
    await run("INSERT INTO sup_request_chains (destination_id, type, steps_json, allow_self, id, created_at) VALUES (?, ?, ?, ?, ?, ?)", ...v, id, nowIso());
  }
  await audit({ actor: user }, { action: "support.request_chain", summary: `${user.name} set an approval chain (${steps.length} step(s)${input.allowSelf ? ", self-approval allowed" : ""})` });
  return requestSetup(user);
}
export async function deleteChain(user: AppUser, id: string) {
  needAdmin(user);
  await run("DELETE FROM sup_request_chains WHERE id = ?", id);
  return requestSetup(user);
}

async function adminIds() {
  return (await all<{ user_id: string }>("SELECT DISTINCT r.user_id FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE r.role = 'admin' AND u.active = 1")).map((r) => r.user_id);
}
async function headsOf(dept: string) {
  return (await all<{ user_id: string }>("SELECT p.user_id FROM department_positions p JOIN users u ON u.id = p.user_id WHERE p.department = ? AND p.position IN ('head','lead') AND u.active = 1", dept)).map((r) => r.user_id);
}
// Who works a destination's requests.
async function receivers(d: Destination): Promise<string[]> {
  if (d.kind === "member") return d.memberId ? [d.memberId] : [];
  if (d.kind === "support_leads") return (await sd.supportConfig()).leads;
  if (d.kind === "admin") return adminIds();
  if (d.kind === "dept_head") return headsOf(d.dept!);
  const { deptPeople } = await import("./departments");
  return (await deptPeople(d.dept!)).map((p) => p.id);
}
// Who may assign within a destination (its heads, or the member themself, the support leads, Admin).
async function managersOf(d: Destination): Promise<string[]> {
  if (d.kind === "dept" || d.kind === "dept_head") return headsOf(d.dept!);
  return receivers(d);
}
async function approversOf(s: ApprovalStep): Promise<string[]> {
  if (s.kind === "user") return s.target && (await get("SELECT 1 FROM users WHERE id = ? AND active = 1", s.target)) ? [s.target] : [];
  if (s.kind === "dept_head") return s.target ? (await all<{ user_id: string }>("SELECT p.user_id FROM department_positions p JOIN users u ON u.id = p.user_id WHERE p.department = ? AND p.position = 'head' AND u.active = 1", s.target)).map((r) => r.user_id) : [];
  if (s.kind === "support_leads") return (await sd.supportConfig()).leads;
  return adminIds();
}

export async function requestDestinationsFor(user: AppUser) {
  return (await all<DestRow>("SELECT * FROM sup_request_destinations WHERE active = 1 ORDER BY sort, label")).map(toDest).map((d) => ({ id: d.id, label: d.label, types: d.types }));
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

type ReqRow = {
  id: string; reference: string; type: string; title: string; description: string | null; destination_id: string | null; assignee_id: string | null; priority: string; status: RequestStatus;
  customer_id: string | null; ticket_id: string | null; chapa_ref: string | null; requested_action: string | null; error_details: string | null; due_date: string | null; resolution: string | null;
  task_id: string | null; task_dept: string | null; chain_id: string | null; approval_step: number; created_by: string; created_at: string; updated_at: string; submitted_at: string | null; resolved_at: string | null; closed_at: string | null;
};
async function row(id: string) {
  const r = await get<ReqRow>("SELECT * FROM sup_requests WHERE id = ? OR reference = ?", id, id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Request not found.");
  return r;
}
async function destOf(r: ReqRow) {
  const d = r.destination_id ? await get<DestRow>("SELECT * FROM sup_request_destinations WHERE id = ?", r.destination_id) : null;
  return d ? toDest(d) : null;
}
async function chainFor(r: ReqRow): Promise<Chain | null> {
  const rows = await all<ChainRow>("SELECT * FROM sup_request_chains WHERE (destination_id = ? OR destination_id IS NULL) AND (type = ? OR type IS NULL)", r.destination_id, r.type);
  // The most specific chain wins: destination and type, then destination, then type, then any.
  const score = (c: ChainRow) => (c.destination_id ? 2 : 0) + (c.type ? 1 : 0);
  const best = rows.sort((a, b) => score(b) - score(a))[0];
  return best ? toChain(best) : null;
}
async function rolesOf(user: AppUser, r: ReqRow): Promise<Set<Who>> {
  const out = new Set<Who>();
  if (r.created_by === user.id) out.add("creator");
  if (isAdmin(user)) out.add("admin");
  const d = await destOf(r);
  if ((d && (await receivers(d)).includes(user.id)) || r.assignee_id === user.id) out.add("receiver");
  if (r.status === "pending_approval") {
    const chain = r.chain_id ? await get<ChainRow>("SELECT * FROM sup_request_chains WHERE id = ?", r.chain_id) : null;
    const step = chain ? toChain(chain).steps[r.approval_step] : null;
    if (step && (await approversOf(step)).includes(user.id)) out.add("approver");
  }
  return out;
}
async function canSee(user: AppUser, r: ReqRow) {
  if ((await rolesOf(user, r)).size) return true;
  // Approvers of any step, and the support leads, follow requests too.
  if ((await sd.supportConfig()).leads.includes(user.id)) return true;
  return !!(await get("SELECT 1 FROM sup_request_approvals WHERE request_id = ? AND approver_id = ?", r.id, user.id));
}

async function event(r: { id: string }, userId: string | null, kind: string, from: string | null, to: string | null, body: string | null) {
  await run("INSERT INTO sup_request_events (id, request_id, user_id, kind, from_status, to_status, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("sre_"), r.id, userId, kind, from, to, body, nowIso());
}
async function tell(ids: (string | null | undefined)[], except: string, title: string, body: string, r: ReqRow) {
  await notify([...new Set(ids.filter((x): x is string => !!x && x !== except))], { type: "assignment", title, body: body.slice(0, 200), link: `/support-requests?r=${r.reference}`, dedupeKey: `sreq-${r.id}-${Date.now()}` }, nowIso());
}

async function nextReference() {
  const year = new Date().getUTCFullYear();
  const n = Number((await get<{ n: number | null }>("SELECT COUNT(*) AS n FROM sup_requests WHERE reference LIKE ?", `SR-${year}-%`))?.n ?? 0);
  for (let i = 1; i < 50; i++) {
    const ref = `SR-${year}-${String(n + i).padStart(4, "0")}`;
    if (!(await get("SELECT 1 FROM sup_requests WHERE reference = ?", ref))) return ref;
  }
  return `SR-${year}-${uid("").slice(-6)}`;
}

export type RequestInput = {
  type: string; title: string; description?: string | null; destinationId: string; assigneeId?: string | null; priority?: string | null;
  ticketId?: string | null; customerId?: string | null; chapaRef?: string | null; requestedAction?: string | null; errorDetails?: string | null; dueDate?: string | null; submit?: boolean;
};
export async function createSupportRequest(user: AppUser, input: RequestInput) {
  if (!(await sd.isAgent(user)) && !isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Support agents and Admin create support requests.");
  const title = clean(input.title, 200);
  if (!title) throw new WorkflowError("VALIDATION", "Give the request a title.");
  if (!REQUEST_TYPES.some(([k]) => k === input.type)) throw new WorkflowError("VALIDATION", "Choose the type of request.");
  const dr = await get<DestRow>("SELECT * FROM sup_request_destinations WHERE id = ? AND active = 1", input.destinationId);
  if (!dr) throw new WorkflowError("VALIDATION", "Choose where the request goes.");
  const dest = toDest(dr);
  if (dest.types.length && !dest.types.includes(input.type)) throw new WorkflowError("VALIDATION", `${dest.label} does not take that type of request.`);
  const people = await receivers(dest);
  const assignee = input.assigneeId && people.includes(input.assigneeId) ? input.assigneeId : null;
  if (input.assigneeId && !assignee) throw new WorkflowError("VALIDATION", "That member is not in the destination.");
  let customer = clean(input.customerId, 60) || null;
  let ticket: string | null = null;
  if (input.ticketId) {
    const t = await sd.canWork(user, input.ticketId);
    ticket = t.id;
    customer ??= t.customer_id;
  }
  const due = input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null;
  const priority = ["low", "normal", "high", "urgent"].includes(input.priority ?? "") ? input.priority! : "normal";
  const id = uid("sreq_");
  const reference = await nextReference();
  const now = nowIso();
  await run(
    `INSERT INTO sup_requests (id, reference, type, title, description, destination_id, assignee_id, priority, status, customer_id, ticket_id, chapa_ref, requested_action, error_details, due_date, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, reference, input.type, title, clean(input.description, 8000) || null, dest.id, assignee, priority, customer, ticket, clean(input.chapaRef, 120) || null,
    clean(input.requestedAction, 2000) || null, clean(input.errorDetails, 8000) || null, due, user.id, now, now,
  );
  await event({ id }, user.id, "created", null, "draft", null);
  if (ticket) await sd.activity(user.id, ticket, "request_created", `${reference}: ${title}`);
  await audit({ actor: user }, { action: "support.request", summary: `${user.name} wrote request ${reference} to ${dest.label}: ${title}` });
  if (input.submit) await act(user, id, "submit");
  return { id, reference };
}

// One action on a request: checked against the status and the person, written to the history, the people told.
export async function act(user: AppUser, id: string, action: RequestAction, input: { text?: string | null; assigneeId?: string | null } = {}) {
  const r = await row(id);
  const move = MOVES[action];
  if (!move) throw new WorkflowError("VALIDATION", "Unknown action.");
  if (!move.from.includes(r.status)) throw new WorkflowError("INVALID_STATE", `A request that is ${requestStatusLabel(r.status).toLowerCase()} cannot be moved that way.`);
  const roles = await rolesOf(user, r);
  if (!move.who.some((w) => roles.has(w))) throw new WorkflowError("FORBIDDEN", "This step is not yours to take on this request.");
  const text = clean(input.text, 4000) || null;
  if (ACTION_NEEDS_TEXT[action] && !text) throw new WorkflowError("VALIDATION", ACTION_NEEDS_TEXT[action]!);
  const now = nowIso();
  const dest = await destOf(r);
  const people = dest ? await receivers(dest) : [];
  let to: RequestStatus | null = move.to;

  if (action === "approve") {
    const chain = r.chain_id ? await get<ChainRow>("SELECT * FROM sup_request_chains WHERE id = ?", r.chain_id) : null;
    if (!chain) throw new WorkflowError("INVALID_STATE", "The request has no approval chain.");
    const c = toChain(chain);
    // Separation of duties: not one's own request, unless the chain allows it, and then on record.
    const own = r.created_by === user.id;
    if (own && !c.allowSelf) throw new WorkflowError("FORBIDDEN", "You cannot approve your own request.");
    await run("INSERT INTO sup_request_approvals (id, request_id, step, approver_id, decision, reason, self_exception, created_at) VALUES (?, ?, ?, ?, 'approved', ?, ?, ?)", uid("sra_"), r.id, r.approval_step, user.id, text, own ? 1 : 0, now);
    if (own) await audit({ actor: user }, { action: "support.request_self_approval", summary: `${user.name} approved their own request ${r.reference} under an allowed exception` });
    const next = r.approval_step + 1;
    if (next < c.steps.length) {
      await run("UPDATE sup_requests SET approval_step = ?, updated_at = ? WHERE id = ?", next, now, r.id);
      await event(r, user.id, "approved_step", r.status, r.status, text ?? `Step ${next} of ${c.steps.length} approved`);
      await tell(await approversOf(c.steps[next]), user.id, `Request ${r.reference} waits for your approval`, r.title, r);
      return detail(user, r.id);
    }
    to = "approved";
  }
  if (action === "reject" && r.status === "pending_approval" && roles.has("approver"))
    await run("INSERT INTO sup_request_approvals (id, request_id, step, approver_id, decision, reason, created_at) VALUES (?, ?, ?, ?, 'rejected', ?, ?)", uid("sra_"), r.id, r.approval_step, user.id, text, now);
  if (action === "submit_approval") {
    const chain = await chainFor(r);
    if (!chain) throw new WorkflowError("INVALID_STATE", "Admin has set no approval chain for this destination and type.");
    await run("UPDATE sup_requests SET chain_id = ?, approval_step = 0 WHERE id = ?", chain.id, r.id);
    await tell(await approversOf(chain.steps[0]), user.id, `Request ${r.reference} waits for your approval`, r.title, r);
  }
  if (action === "escalate") {
    await event(r, user.id, "escalated", r.status, r.status, text);
    await run("UPDATE sup_requests SET priority = CASE WHEN priority IN ('low','normal') THEN 'high' ELSE priority END, updated_at = ? WHERE id = ?", now, r.id);
    await tell([...(await adminIds()), ...(dest ? await managersOf(dest) : [])], user.id, `Request ${r.reference} was escalated by ${user.name}`, text ?? r.title, r);
    await audit({ actor: user }, { action: "support.request_escalate", summary: `${user.name} escalated ${r.reference}` });
    return detail(user, r.id);
  }

  await tx(async () => {
    const sets = ["status = ?", "updated_at = ?"];
    const args: Param[] = [to, now];
    if (action === "submit") sets.push("submitted_at = ?"), args.push(now);
    if (action === "resolve") sets.push("resolution = ?", "resolved_at = ?"), args.push(text, now);
    if (action === "reopen") sets.push("resolved_at = NULL");
    if (action === "close") sets.push("closed_at = ?"), args.push(now);
    if (action === "start" && !r.assignee_id && roles.has("receiver")) sets.push("assignee_id = ?"), args.push(user.id);
    await run(`UPDATE sup_requests SET ${sets.join(", ")} WHERE id = ?`, ...args, r.id);
    await event(r, user.id, action, r.status, to, text);
  });
  await audit({ actor: user }, { action: `support.request_${action}`, summary: `${user.name}: ${r.reference} ${requestStatusLabel(r.status)} to ${requestStatusLabel(to!)}` });

  // Who hears about it.
  const fresh = await row(r.id);
  const label = requestStatusLabel(to!);
  if (action === "submit") await tell(fresh.assignee_id ? [fresh.assignee_id] : people, user.id, `New support request ${r.reference} from ${user.name}`, r.title, fresh);
  else if (["ask_info", "resolve", "reject", "approve", "acknowledge", "start"].includes(action)) await tell([r.created_by, r.assignee_id], user.id, `${r.reference} is ${label.toLowerCase()}`, text ?? r.title, fresh);
  else if (["provide_info", "reopen", "close"].includes(action)) await tell([r.assignee_id ?? null, ...(r.assignee_id ? [] : people)], user.id, `${r.reference} is ${label.toLowerCase()}`, text ?? r.title, fresh);

  if (action === "acknowledge") await linkTask(user, fresh, dest);
  // The result goes back to the support conversation as a note for the agents.
  if ((action === "resolve" || action === "reject") && r.ticket_id)
    await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 1, ?)", uid("smg_"), r.ticket_id, `Request ${r.reference} ${action === "resolve" ? "resolved" : "rejected"} by ${user.name}: ${text}`, now);
  return detail(user, r.id);
}

// The department's own task for the work, once acknowledged (when the department takes requests).
async function linkTask(user: AppUser, r: ReqRow, dest: Destination | null) {
  if (!dest?.dept || r.task_id) return;
  const w = await import("./work-extras");
  const target = (await w.requestTargets(user)).find((t) => t.dept === dest.dept);
  if (!target) return void (await event(r, null, "note", null, null, `${dest.label} does not take workspace requests, so no task was made there.`));
  const words = `${r.type} ${r.title}`.toLowerCase();
  const type = target.types.find((t) => words.includes(t.key) || words.includes(t.label.toLowerCase())) ?? target.types.find((t) => /bug|fix|issue|support/i.test(`${t.key} ${t.label}`)) ?? target.types[0];
  try {
    const made = await w.createRequest(user, dest.dept, { title: `${r.reference} ${r.title}`.slice(0, 200), description: [r.description, r.requested_action ? `Requested action: ${r.requested_action}` : null, r.error_details ? `Error details: ${r.error_details}` : null, `From Customer Support Requests: /support-requests?r=${r.reference}`].filter(Boolean).join("\n\n"), type: type.key, dueDate: r.due_date });
    // Acknowledged here means accepted there.
    await run("UPDATE dept_tasks SET request_state = 'accepted', assignee_id = COALESCE(assignee_id, ?) WHERE id = ?", r.assignee_id, made.id);
    await run("UPDATE sup_requests SET task_id = ?, task_dept = ? WHERE id = ?", made.id, dest.dept, r.id);
    await event(r, null, "note", null, null, `Task ${made.code} made in ${target.title}.`);
  } catch (e) {
    await event(r, null, "note", null, null, `No task could be made in ${target.title}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function assignRequest(user: AppUser, id: string, assigneeId: string | null) {
  const r = await row(id);
  const dest = await destOf(r);
  if (!dest) throw new WorkflowError("INVALID_STATE", "The request has no destination.");
  if (!isAdmin(user) && !(await managersOf(dest)).includes(user.id)) throw new WorkflowError("FORBIDDEN", "The destination's heads and Admin assign requests.");
  if (assigneeId && !(await receivers(dest)).includes(assigneeId)) throw new WorkflowError("VALIDATION", "Choose someone in the destination.");
  if (!OPEN_REQUEST_STATUSES.includes(r.status)) throw new WorkflowError("INVALID_STATE", "Only an open request is assigned.");
  await run("UPDATE sup_requests SET assignee_id = ?, updated_at = ? WHERE id = ?", assigneeId, nowIso(), r.id);
  if (r.task_id) await run("UPDATE dept_tasks SET assignee_id = ? WHERE id = ?", assigneeId, r.task_id);
  const name = assigneeId ? (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", assigneeId))?.name : null;
  await event(r, user.id, "assigned", r.status, r.status, name ? `Assigned to ${name}` : "Unassigned");
  if (assigneeId) await tell([assigneeId], user.id, `${r.reference} was assigned to you`, r.title, r);
  return detail(user, r.id);
}

export async function commentRequest(user: AppUser, id: string, body: string) {
  const r = await row(id);
  if (!(await canSee(user, r))) throw new WorkflowError("NOT_FOUND", "Request not found.");
  const text = clean(body, 4000);
  if (!text) throw new WorkflowError("VALIDATION", "Write a comment.");
  await event(r, user.id, "comment", null, null, text);
  await run("UPDATE sup_requests SET updated_at = ? WHERE id = ?", nowIso(), r.id);
  const dest = await destOf(r);
  await tell([r.created_by, r.assignee_id, ...(r.assignee_id || !dest ? [] : await receivers(dest))], user.id, `${user.name} commented on ${r.reference}`, text, r);
  return detail(user, r.id);
}

export async function deleteDraft(user: AppUser, id: string) {
  const r = await row(id);
  if (r.status !== "draft" || r.created_by !== user.id) throw new WorkflowError("FORBIDDEN", "Only your own draft can be deleted.");
  await run("DELETE FROM sup_requests WHERE id = ?", r.id);
}

export async function addRequestFile(user: AppUser, id: string, file: { name: string; mime: string; base64: string }) {
  const r = await row(id);
  if (!(await canSee(user, r))) throw new WorkflowError("NOT_FOUND", "Request not found.");
  const data = Buffer.from(file.base64, "base64");
  if (!data.length) throw new WorkflowError("VALIDATION", "The file is empty.");
  if (data.length > FILE_MAX) throw new WorkflowError("VALIDATION", "The file is larger than 10 MB.");
  const fid = uid("srf_");
  await run("INSERT INTO sup_request_files (id, request_id, name, mime, size, data, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", fid, r.id, clean(file.name, 160).replace(/[\\/]/g, "_") || "file", clean(file.mime, 100) || "application/octet-stream", data.length, file.base64, user.id, nowIso());
  await event(r, user.id, "file", null, null, clean(file.name, 160));
  return detail(user, r.id);
}
export async function readRequestFile(user: AppUser, fileId: string) {
  const f = await get<{ request_id: string; name: string; mime: string; data: string }>("SELECT request_id, name, mime, data FROM sup_request_files WHERE id = ?", fileId);
  if (!f || !(await canSee(user, await row(f.request_id)))) return null;
  return { name: f.name, mime: f.mime, data: Buffer.from(f.data, "base64") };
}

export async function detail(user: AppUser, id: string) {
  let r = await row(id);
  if (!(await canSee(user, r))) throw new WorkflowError("NOT_FOUND", "Request not found.");
  const roles = await rolesOf(user, r);
  // Opened by its destination: received.
  if (r.status === "submitted" && roles.has("receiver") && !roles.has("creator")) {
    await run("UPDATE sup_requests SET status = 'received', updated_at = ? WHERE id = ?", nowIso(), r.id);
    await event(r, user.id, "received", "submitted", "received", null);
    await tell([r.created_by], user.id, `${r.reference} was received`, r.title, r);
    r = await row(r.id);
  }
  const dest = await destOf(r);
  const name = async (uidv: string | null) => (uidv ? ((await get<{ name: string }>("SELECT name FROM users WHERE id = ?", uidv))?.name ?? null) : null);
  const events = await all<{ id: string; kind: string; from_status: string | null; to_status: string | null; body: string | null; created_at: string; by: string | null }>(
    "SELECT e.id, e.kind, e.from_status, e.to_status, e.body, e.created_at, u.name AS by FROM sup_request_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.request_id = ? ORDER BY e.created_at", r.id,
  );
  const approvals = await all<{ step: number; decision: string; reason: string | null; self_exception: number; created_at: string; by: string | null }>(
    "SELECT a.step, a.decision, a.reason, a.self_exception, a.created_at, u.name AS by FROM sup_request_approvals a LEFT JOIN users u ON u.id = a.approver_id WHERE a.request_id = ? ORDER BY a.created_at", r.id,
  );
  const files = await all<{ id: string; name: string; mime: string; size: number; created_at: string }>("SELECT id, name, mime, size, created_at FROM sup_request_files WHERE request_id = ? ORDER BY created_at", r.id);
  const ticket = r.ticket_id ? await get<{ number: number; subject: string }>("SELECT number, subject FROM sup_tickets WHERE id = ?", r.ticket_id) : null;
  const customer = r.customer_id ? await get<{ name: string; phone: string | null; email: string | null }>("SELECT name, phone, email FROM sup_customers WHERE id = ?", r.customer_id) : null;
  const chain = r.chain_id ? await get<ChainRow>("SELECT * FROM sup_request_chains WHERE id = ?", r.chain_id) : null;
  const task = r.task_id ? await get<{ code: string; status: string }>("SELECT code, status FROM dept_tasks WHERE id = ?", r.task_id) : null;
  const actions = (Object.keys(MOVES) as RequestAction[]).filter((a) => MOVES[a].from.includes(r.status) && MOVES[a].who.some((w) => roles.has(w)) && !(a === "approve" && r.created_by === user.id && !(chain && toChain(chain).allowSelf)));
  return {
    id: r.id, reference: r.reference, type: r.type, title: r.title, description: r.description, status: r.status, priority: r.priority, dueDate: r.due_date,
    requestedAction: r.requested_action, errorDetails: r.error_details, resolution: r.resolution, chapaRef: r.chapa_ref,
    destination: dest ? { id: dest.id, label: dest.label } : null, assignee: { id: r.assignee_id, name: await name(r.assignee_id) }, creator: { id: r.created_by, name: await name(r.created_by) },
    ticket: r.ticket_id && ticket ? { id: r.ticket_id, number: ticket.number, subject: ticket.subject } : null, customer,
    task: task ? { code: task.code, dept: r.task_dept, status: task.status } : null,
    approval: chain ? { step: r.approval_step, steps: toChain(chain).steps.length } : null,
    createdAt: r.created_at, updatedAt: r.updated_at, events, approvals: approvals.map((a) => ({ ...a, selfException: !!Number(a.self_exception) })), files,
    actions, canAssign: !!dest && (isAdmin(user) || (await managersOf(dest)).includes(user.id)) && OPEN_REQUEST_STATUSES.includes(r.status),
    assignable: dest ? await Promise.all((await receivers(dest)).map(async (x) => ({ id: x, name: (await name(x)) ?? x }))) : [],
    canDelete: r.status === "draft" && r.created_by === user.id,
  };
}

// The lists: what I asked, what my teams received, what waits for my approval, and (support leads and Admin) all.
export async function listSupportRequests(user: AppUser, scope: "mine" | "inbox" | "approvals" | "all", status?: string | null) {
  const lead = (await sd.supportConfig()).leads.includes(user.id) || isAdmin(user);
  const rows = await all<ReqRow & { destination: string | null; assignee: string | null; creator: string | null }>(
    `SELECT r.*, d.label AS destination, a.name AS assignee, c.name AS creator FROM sup_requests r LEFT JOIN sup_request_destinations d ON d.id = r.destination_id
     LEFT JOIN users a ON a.id = r.assignee_id LEFT JOIN users c ON c.id = r.created_by
     ${status ? "WHERE r.status = ?" : ""} ORDER BY r.updated_at DESC LIMIT 500`,
    ...(status ? [status] : []),
  );
  const out = [];
  for (const r of rows) {
    if (r.status === "draft" && r.created_by !== user.id) continue;
    const roles = await rolesOf(user, r);
    const keep = scope === "mine" ? roles.has("creator") : scope === "inbox" ? roles.has("receiver") && r.status !== "draft" : scope === "approvals" ? roles.has("approver") : lead;
    if (!keep) continue;
    out.push({ id: r.id, reference: r.reference, type: r.type, title: r.title, status: r.status, priority: r.priority, destination: r.destination, assignee: r.assignee, creator: r.creator, dueDate: r.due_date, updatedAt: r.updated_at, createdAt: r.created_at });
  }
  return out;
}

export async function supportRequestCounts(user: AppUser) {
  const [mine, inbox, approvals] = await Promise.all([listSupportRequests(user, "mine"), listSupportRequests(user, "inbox"), listSupportRequests(user, "approvals")]);
  const open = (l: { status: string }[]) => l.filter((x) => OPEN_REQUEST_STATUSES.includes(x.status as RequestStatus)).length;
  return { mine: open(mine), inbox: open(inbox), approvals: approvals.length };
}
