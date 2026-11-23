// A team member's request to Finance goes first to the right person, by its type: things for the work (a device, a
// subscription, a budget, a repair, a replacement) to their team lead or department head; personal money matters
// (a salary advance, an allowance, a loan, a benefit) to HR. That person passes it on to Finance or turns it down
// with a reason. Leads, heads, managers, HR and Admin send straight to Finance.

import { all, get, nowIso, run } from "./db";
import { notify } from "./notifications";
import { can, type AppUser } from "./users";
import { WorkflowError, audit } from "./workflow";
import { isPlainMember } from "./contact-rules";
import { STAGES } from "@/lib/domain";
import { REQUEST_KINDS, REQUEST_ROUTE, type RequestKind } from "@/lib/finance-requests";

export { REQUEST_KINDS, REQUEST_ROUTE };

const ROLE_DEPT: Record<string, string> = { developer: "dev", content: "studio", finance_manager: "finance", accountant: "finance" };

// The member's own team lead or department head (first found), or null.
export async function teamLeadOf(user: AppUser): Promise<string | null> {
  const stage = STAGES.find((s) => user.roles.includes(s));
  if (stage) {
    const lead = await get<{ user_id: string }>("SELECT user_id FROM team_leads WHERE stage = ? AND user_id <> ? LIMIT 1", stage, user.id);
    if (lead) return lead.user_id;
  }
  const depts = [...new Set([...user.roles.map((r) => ROLE_DEPT[r] ?? r), ...(await all<{ department: string }>("SELECT department FROM department_positions WHERE user_id = ?", user.id)).map((d) => d.department)])];
  if (depts.length) {
    const head = await get<{ user_id: string }>(
      `SELECT user_id FROM department_positions WHERE department IN (${depts.map(() => "?").join(",")}) AND position IN ('head','lead') AND user_id <> ? ORDER BY CASE position WHEN 'head' THEN 0 ELSE 1 END LIMIT 1`,
      ...depts,
      user.id,
    );
    if (head) return head.user_id;
  }
  const m = await get<{ user_id: string | null }>("SELECT m.user_id FROM employees e JOIN employees m ON m.id = e.manager_id WHERE e.user_id = ? AND m.status <> 'left'", user.id).catch(() => undefined);
  return m?.user_id && m.user_id !== user.id ? m.user_id : null;
}

export async function hrPeople(): Promise<string[]> {
  return (await all<{ user_id: string }>("SELECT DISTINCT r.user_id FROM role_assignments r JOIN users u ON u.id = r.user_id AND u.active = 1 WHERE r.role IN ('hr_manager','hr_officer')")).map((r) => r.user_id);
}

// Where a new request goes: { route, reviewer } for a member, or null (straight to Finance).
export async function routeFor(user: AppUser, kind: string): Promise<{ route: "lead" | "hr"; reviewer: string | null; notifyIds: string[] } | null> {
  if (!(await isPlainMember(user))) return null;
  const want = REQUEST_ROUTE[kind as RequestKind] ?? "lead";
  if (want === "lead") {
    const lead = await teamLeadOf(user);
    if (lead) return { route: "lead", reviewer: lead, notifyIds: [lead] };
  }
  // HR matters, and members with no lead, go to HR.
  const hr = (await hrPeople()).filter((x) => x !== user.id);
  if (hr.length) return { route: "hr", reviewer: null, notifyIds: hr };
  return null;
}

export async function canReview(user: AppUser, p: { route: string | null; reviewer_id: string | null; requester_id: string | null }) {
  if (p.requester_id === user.id) return false;
  if (can(user, "users.manage")) return true;
  if (p.route === "lead") return p.reviewer_id === user.id;
  if (p.route === "hr") return can(user, "hr.access") || user.roles.some((r) => r === "hr_manager" || r === "hr_officer");
  return false;
}

// Requests waiting for this person's review (Approvals).
export async function purchasesToReview(user: AppUser) {
  const rows = await all<{ id: string; number: string; title: string; estimate: number; route: string | null; reviewer_id: string | null; requester_id: string | null; requester: string | null; created_at: string; note: string | null }>(
    "SELECT p.id, p.number, p.title, p.estimate, p.route, p.reviewer_id, p.requester_id, u.name AS requester, p.created_at, p.note FROM fin_purchases p LEFT JOIN users u ON u.id = p.requester_id WHERE p.status = 'review' ORDER BY p.created_at",
  );
  const out = [];
  for (const r of rows) if (await canReview(user, r)) out.push(r);
  return out;
}

export async function reviewPurchase(user: AppUser, id: string, input: { approve: boolean; note?: string | null }) {
  const p = await get<{ status: string; route: string | null; reviewer_id: string | null; requester_id: string | null; title: string; estimate: number; number: string }>(
    "SELECT status, route, reviewer_id, requester_id, title, estimate, number FROM fin_purchases WHERE id = ?",
    id,
  );
  if (!p) throw new WorkflowError("NOT_FOUND", "Request not found.");
  if (p.status !== "review") throw new WorkflowError("INVALID_STATE", "This request is already decided.");
  if (!(await canReview(user, p))) throw new WorkflowError("FORBIDDEN", p.route === "hr" ? "HR reviews this request." : "Their team lead reviews this request.");
  const note = String(input.note ?? "").trim().slice(0, 500);
  if (!input.approve && note.length < 3) throw new WorkflowError("VALIDATION", "Say why it is not passed on.");
  const now = nowIso();
  await run("UPDATE fin_purchases SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?", input.approve ? "submitted" : "rejected", user.id, now, note || null, now, id);
  if (input.approve) {
    const ids = await (await import("./finance")).financeIds("finance.access");
    await notify(ids, { type: "approval", title: `Purchase request: ${p.title}`, body: `Passed on by ${user.name}, about ${p.estimate}`, link: "/finance?tab=purchasing", groupKey: "fin-purchases" }, now, user.id);
  }
  if (p.requester_id)
    await notify([p.requester_id], { type: "approval", title: input.approve ? `${p.number} passed on to Finance` : `${p.number} not passed on`, body: input.approve ? p.title : note, link: "/resources" }, now, user.id);
  await audit({ actor: user }, { action: input.approve ? "finance.request_passed" : "finance.request_declined", summary: `${user.name} ${input.approve ? "passed on" : "turned down"} ${p.number}${note ? `: ${note}` : ""}` });
}
