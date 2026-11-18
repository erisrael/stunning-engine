import { all, get, nowIso, parseJson, run, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import * as sd from "./support-desk";

// Forwarding a customer message out of support (Update 1.2, Phase 6). Admin and the support leads set the targets:
// a person, a department (its heads and leads, or everyone when it has none), a department's head, or the support
// leads. Each target says who may use it, whether a lead approves first, and what goes with the message: its files,
// the customer's details, a link to the conversation. Without customer details, emails and phone numbers in the text
// are hidden. A forward arrives as a card in the recipient's direct chat with the agent, and is on the ticket's log.

export const FORWARD_KINDS = ["user", "department", "department_head", "support_leads"] as const;
export type ForwardKind = (typeof FORWARD_KINDS)[number];
type TargetRow = { id: string; kind: string; target: string; label: string; allowed_json: string; needs_approval: number; include_files: number; include_customer: number; link_conversation: number; active: number; sort: number; created_at: string };
export type ForwardTarget = { id: string; kind: ForwardKind; target: string; label: string; allowed: string[]; needsApproval: boolean; includeFiles: boolean; includeCustomer: boolean; linkConversation: boolean; active: boolean; sort: number };
const toTarget = (r: TargetRow): ForwardTarget => ({
  id: r.id, kind: r.kind as ForwardKind, target: r.target, label: r.label, allowed: parseJson<string[]>(r.allowed_json, []), needsApproval: !!Number(r.needs_approval),
  includeFiles: !!Number(r.include_files), includeCustomer: !!Number(r.include_customer), linkConversation: !!Number(r.link_conversation), active: !!Number(r.active), sort: Number(r.sort),
});
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

async function manager(user: AppUser) {
  if (!can(user, "users.manage") && !can(user, "settings.manage") && !can(user, "support.forwarding") && !(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Only Admin, the support leads and people allowed to set forwarding targets do this.");
}

export async function listForwardTargets(user: AppUser) {
  await manager(user);
  return (await all<TargetRow>("SELECT * FROM sup_forward_targets ORDER BY sort, label")).map(toTarget);
}

export async function saveForwardTarget(user: AppUser, input: Partial<ForwardTarget> & { kind: string; target: string; label: string }) {
  await manager(user);
  if (!(FORWARD_KINDS as readonly string[]).includes(input.kind)) throw new WorkflowError("VALIDATION", "Choose a person, a department, a department head or the support leads.");
  const label = clean(input.label, 80);
  if (!label) throw new WorkflowError("VALIDATION", "Name the target.");
  const target = input.kind === "support_leads" ? "support" : clean(input.target, 80);
  if (input.kind === "user" && !(await get("SELECT 1 FROM users WHERE id = ? AND active = 1", target))) throw new WorkflowError("NOT_FOUND", "Choose an active person.");
  if ((input.kind === "department" || input.kind === "department_head") && !(await recipients(input.kind, target)).length) throw new WorkflowError("VALIDATION", "Nobody is in that department to receive it.");
  const allowed = [...new Set((input.allowed ?? []).map((x) => clean(x, 60)).filter(Boolean))];
  const v = [input.kind, target, label, JSON.stringify(allowed), input.needsApproval ? 1 : 0, input.includeFiles === false ? 0 : 1, input.includeCustomer ? 1 : 0, input.linkConversation === false ? 0 : 1, input.active === false ? 0 : 1, Math.round(input.sort ?? 0)];
  let id = input.id ?? null;
  if (id && (await get("SELECT 1 FROM sup_forward_targets WHERE id = ?", id)))
    await run("UPDATE sup_forward_targets SET kind = ?, target = ?, label = ?, allowed_json = ?, needs_approval = ?, include_files = ?, include_customer = ?, link_conversation = ?, active = ?, sort = ? WHERE id = ?", ...v, id);
  else {
    id = uid("sft_");
    await run("INSERT INTO sup_forward_targets (kind, target, label, allowed_json, needs_approval, include_files, include_customer, link_conversation, active, sort, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...v, id, nowIso());
  }
  await audit({ actor: user }, { action: "support.forward_target", summary: `${user.name} set the forwarding target "${label}"` });
  return listForwardTargets(user);
}

export async function deleteForwardTarget(user: AppUser, id: string) {
  await manager(user);
  await run("DELETE FROM sup_forward_targets WHERE id = ?", id);
  return listForwardTargets(user);
}

// Who receives a forward to a target.
async function recipients(kind: string, target: string): Promise<string[]> {
  const dep = await import("./departments");
  if (kind === "user") return [target];
  if (kind === "support_leads") return (await sd.supportConfig()).leads;
  if (kind === "department_head") return (await all<{ user_id: string }>("SELECT p.user_id FROM department_positions p JOIN users u ON u.id = p.user_id WHERE p.department = ? AND p.position = 'head' AND u.active = 1", target)).map((r) => r.user_id);
  const managers = await dep.deptManagers(target);
  return managers.length ? managers : (await dep.deptPeople(target)).map((p) => p.id);
}

// The targets this agent may use (an empty list of allowed people and roles means every agent).
export async function forwardTargetsFor(user: AppUser) {
  await sd.needAgent(user);
  return (await all<TargetRow>("SELECT * FROM sup_forward_targets WHERE active = 1 ORDER BY sort, label"))
    .map(toTarget)
    .filter((t) => !t.allowed.length || t.allowed.includes(user.id) || user.roles.some((r) => t.allowed.includes(`role:${r}`)))
    .map((t) => ({ id: t.id, label: t.label, needsApproval: t.needsApproval, includeCustomer: t.includeCustomer }));
}

const redact = (s: string) =>
  s
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email hidden]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[number hidden]");

export async function forwardMessage(user: AppUser, input: { messageId: string; targetId: string; note?: string | null }) {
  const m = await get<{ id: string; ticket_id: string; body: string; internal: number; deleted_at: string | null; author_kind: string }>("SELECT id, ticket_id, body, internal, deleted_at, author_kind FROM sup_messages WHERE id = ?", input.messageId);
  if (!m || m.deleted_at) throw new WorkflowError("NOT_FOUND", "Message not found.");
  const t = await sd.canWork(user, m.ticket_id);
  const target = (await forwardTargetsFor(user)).find((x) => x.id === input.targetId);
  if (!target) throw new WorkflowError("FORBIDDEN", "You may not forward to that target.");
  const id = uid("sfw_");
  const note = clean(input.note, 1000) || null;
  const status = target.needsApproval ? "pending" : "sent";
  await run("INSERT INTO sup_forwards (id, target_id, message_id, ticket_id, by_id, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, target.id, m.id, t.id, user.id, note, status, nowIso());
  await sd.activity(user.id, t.id, "forwarded", `${target.label}${status === "pending" ? " (waiting for approval)" : ""}`);
  await audit({ actor: user }, { action: "support.forward", summary: `${user.name} forwarded a message of #${t.number} to ${target.label}${status === "pending" ? ", waiting for a lead" : ""}` });
  if (status === "pending") {
    await notify((await sd.supportConfig()).leads.filter((x) => x !== user.id), { type: "assignment", title: `${user.name} asks to forward a message of #${t.number} to ${target.label}`, body: note ?? m.body.slice(0, 200), link: "/support?tab=forwards", dedupeKey: `sup-fwd-${id}` }, nowIso());
    return { id, status, recipients: 0 };
  }
  const sent = await deliver(id);
  return { id, status: "sent", recipients: sent };
}

async function deliver(forwardId: string) {
  const f = await get<{ id: string; target_id: string; message_id: string; ticket_id: string; by_id: string; note: string | null }>("SELECT id, target_id, message_id, ticket_id, by_id, note FROM sup_forwards WHERE id = ?", forwardId);
  if (!f) throw new WorkflowError("NOT_FOUND", "Forward not found.");
  const tr = await get<TargetRow>("SELECT * FROM sup_forward_targets WHERE id = ?", f.target_id);
  if (!tr) throw new WorkflowError("NOT_FOUND", "The target was removed.");
  const target = toTarget(tr);
  const m = (await get<{ body: string; author_kind: string; created_at: string }>("SELECT body, author_kind, created_at FROM sup_messages WHERE id = ?", f.message_id))!;
  const t = (await get<{ number: number; subject: string; customer_id: string | null }>("SELECT number, subject, customer_id FROM sup_tickets WHERE id = ?", f.ticket_id))!;
  const c = t.customer_id ? await get<{ name: string; email: string | null; phone: string | null; external_id: string | null }>("SELECT name, email, phone, external_id FROM sup_customers WHERE id = ?", t.customer_id) : null;
  const by = (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", f.by_id))?.name ?? "Support";
  const files = target.includeFiles ? await all<{ name: string }>("SELECT name FROM sup_files WHERE message_id = ?", f.message_id) : [];
  const lines = [
    `Forwarded from support conversation #${t.number} by ${by}`,
    f.note ? `Note: ${f.note}` : null,
    target.includeCustomer && c ? `Customer: ${[c.name, c.phone, c.email, c.external_id?.startsWith("tg:") ? `Telegram ${c.external_id.slice(3)}` : null].filter(Boolean).join(", ")}` : null,
    "",
    target.includeCustomer ? m.body : redact(m.body),
    files.length ? `\nFiles: ${files.map((x) => x.name).join(", ")}` : null,
    target.linkConversation ? `\nConversation: /support?ticket=${f.ticket_id}` : null,
  ].filter((x) => x !== null).join("\n");
  const { directGroup, postCard } = await import("./chat");
  const people = [...new Set(await recipients(target.kind, target.target))].filter((x) => x !== f.by_id);
  for (const p of people) await postCard(await directGroup(f.by_id, p), f.by_id, { kind: "request", body: lines.slice(0, 8000), meta: { supportForward: f.id, ticketId: target.linkConversation ? f.ticket_id : null } });
  await notify(people, { type: "mention", title: `${by} forwarded a support message (#${t.number})`, body: (f.note ?? (target.includeCustomer ? m.body : redact(m.body))).slice(0, 200), link: "/chat", dedupeKey: `sup-fwd-in-${f.id}` }, nowIso());
  await run("UPDATE sup_forwards SET status = 'sent', recipients_json = ? WHERE id = ?", JSON.stringify(people), f.id);
  return people.length;
}

export async function pendingForwards(user: AppUser) {
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Support leads approve forwards.");
  return all<{ id: string; label: string; number: number; ticket_id: string; body: string; note: string | null; by: string; created_at: string }>(
    `SELECT f.id, ft.label, t.number, t.id AS ticket_id, m.body, f.note, u.name AS by, f.created_at FROM sup_forwards f JOIN sup_forward_targets ft ON ft.id = f.target_id
     JOIN sup_tickets t ON t.id = f.ticket_id JOIN sup_messages m ON m.id = f.message_id JOIN users u ON u.id = f.by_id WHERE f.status = 'pending' ORDER BY f.created_at`,
  );
}

export async function decideForward(user: AppUser, id: string, approve: boolean) {
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Support leads approve forwards.");
  const f = await get<{ status: string; by_id: string; ticket_id: string }>("SELECT status, by_id, ticket_id FROM sup_forwards WHERE id = ?", id);
  if (!f) throw new WorkflowError("NOT_FOUND", "Forward not found.");
  if (f.status !== "pending") throw new WorkflowError("INVALID_STATE", "This forward was already decided.");
  if (f.by_id === user.id) throw new WorkflowError("FORBIDDEN", "Another lead approves your own forward.");
  await run("UPDATE sup_forwards SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?", approve ? "approved" : "declined", user.id, nowIso(), id);
  await sd.activity(user.id, f.ticket_id, approve ? "forward_approved" : "forward_declined");
  await audit({ actor: user }, { action: "support.forward_decide", summary: `${user.name} ${approve ? "approved" : "declined"} a forward` });
  const n = approve ? await deliver(id) : 0;
  await notify([f.by_id], { type: "assignment", title: approve ? "Your forward was approved and sent" : "Your forward was declined", link: `/support?ticket=${f.ticket_id}`, dedupeKey: `sup-fwd-done-${id}` }, nowIso());
  return { recipients: n };
}
