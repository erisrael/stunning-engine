// The support analytics dashboard (Update 1.2, spec 18): conversation, agent, call center and financial support
// metrics, all computed from stored data, filtered by date, agent, department, queue, category, customer and status,
// with CSV and Excel exports for people allowed to export.
import { all } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import * as sd from "./support-desk";
import { OPEN_REQUEST_STATUSES } from "@/lib/support-requests";

export type DashFilters = { from: string; to: string; agentId?: string | null; department?: string | null; queueId?: string | null; category?: string | null; customer?: string | null; status?: string | null };

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const mins = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60e3;
const PAYMENT = /pay|chapa|bill|invoice|refund|receipt|transaction|ክፍያ/i;

export async function canSeeAnalytics(user: AppUser) {
  return (await sd.isLead(user)) || can(user, "support.analytics");
}

export async function supportDashboard(user: AppUser, f: DashFilters) {
  if (!(await canSeeAnalytics(user))) throw new WorkflowError("FORBIDDEN", "Support analytics are for support leads and people allowed to see them.");
  const from = `${f.from}T00:00:00.000Z`;
  const to = `${f.to}T23:59:59.999Z`;
  // Conversations in the range, with the filters.
  const w: string[] = ["t.created_at BETWEEN ? AND ?"];
  const p: (string | number)[] = [from, to];
  if (f.agentId) (w.push("t.assignee_id = ?"), p.push(f.agentId));
  if (f.queueId) (w.push("t.queue_id = ?"), p.push(f.queueId));
  if (f.department) (w.push("q.department = ?"), p.push(f.department));
  if (f.category) (w.push("LOWER(COALESCE(t.category,'')) = ?"), p.push(f.category.toLowerCase()));
  if (f.status) (w.push("t.status = ?"), p.push(f.status));
  if (f.customer) (w.push("(LOWER(COALESCE(c.name,'')) LIKE ? OR COALESCE(c.phone,'') LIKE ? OR t.customer_id = ?)"), p.push(`%${f.customer.toLowerCase()}%`, `%${f.customer}%`, f.customer));
  const tickets = await all<{ id: string; status: string; created_at: string; first_response_at: string | null; solved_at: string | null; rating: number | null; escalated_at: string | null; assignee_id: string | null; subject: string; category: string | null; source: string | null }>(
    `SELECT t.id, t.status, t.created_at, t.first_response_at, t.solved_at, t.rating, t.escalated_at, t.assignee_id, t.subject, t.category, t.source
     FROM sup_tickets t LEFT JOIN sup_queues q ON q.id = t.queue_id LEFT JOIN sup_customers c ON c.id = t.customer_id WHERE ${w.join(" AND ")}`,
    ...p,
  );
  const ids = new Set(tickets.map((t) => t.id));
  const reopenedRows = tickets.length
    ? await all<{ ticket_id: string }>(`SELECT DISTINCT ticket_id FROM sup_activity WHERE (kind = 'reopened' OR (kind = 'status' AND (detail LIKE 'solved to %' AND detail NOT LIKE 'solved to closed%'))) AND ticket_id IN (${[...ids].map(() => "?").join(",")})`, ...ids)
    : [];
  const resolved = tickets.filter((t) => t.status === "solved" || t.status === "closed");
  const rated = tickets.filter((t) => t.rating !== null);
  const conversations = {
    total: tickets.length,
    new: tickets.filter((t) => t.status === "new").length,
    active: tickets.filter((t) => ["open", "pending", "on_hold"].includes(t.status)).length,
    resolved: resolved.length,
    unresolved: tickets.length - resolved.length,
    firstResponseMin: avg(tickets.filter((t) => t.first_response_at).map((t) => mins(t.created_at, t.first_response_at!))),
    resolutionHours: (() => {
      const m = avg(resolved.filter((t) => t.solved_at).map((t) => mins(t.created_at, t.solved_at!)));
      return m === null ? null : Math.round((m / 60) * 10) / 10;
    })(),
    satisfaction: rated.length ? Math.round((rated.reduce((a, t) => a + Number(t.rating), 0) / rated.length) * 10) / 10 : null,
    ratings: rated.length,
    reopened: reopenedRows.length,
    escalationRate: pct(tickets.filter((t) => t.escalated_at).length, tickets.length),
  };

  // Calls in the range.
  const cw: string[] = ["k.kind <> 'staff'", "k.started_at BETWEEN ? AND ?"];
  const cp: (string | number)[] = [from, to];
  if (f.agentId) (cw.push("k.agent_id = ?"), cp.push(f.agentId));
  if (f.queueId) (cw.push("COALESCE(k.ring_queue, k.queue_id, t.queue_id) = ?"), cp.push(f.queueId));
  if (f.department) (cw.push("q.department = ?"), cp.push(f.department));
  if (f.category) (cw.push("LOWER(COALESCE(k.category, t.category, '')) = ?"), cp.push(f.category.toLowerCase()));
  if (f.customer) (cw.push("(LOWER(COALESCE(c.name,'')) LIKE ? OR COALESCE(k.phone, c.phone, '') LIKE ? OR k.customer_id = ?)"), cp.push(`%${f.customer.toLowerCase()}%`, `%${f.customer}%`, f.customer));
  const calls = await all<{ id: string; agent_id: string | null; direction: string; status: string; answered_at: string | null; duration_s: number | null; wait_s: number | null; queue_id: string | null; sl: number | null }>(
    `SELECT k.id, k.agent_id, k.direction, k.status, k.answered_at, k.duration_s, k.wait_s, COALESCE(k.ring_queue, k.queue_id, t.queue_id) AS queue_id, q.sl_seconds AS sl
     FROM sup_calls k LEFT JOIN sup_tickets t ON t.id = k.ticket_id LEFT JOIN sup_queues q ON q.id = COALESCE(k.ring_queue, k.queue_id, t.queue_id) LEFT JOIN sup_customers c ON c.id = k.customer_id WHERE ${cw.join(" AND ")}`,
    ...cp,
  );
  const callIds = calls.map((k) => k.id);
  const abandoned = callIds.length ? Number((await all<{ n: number }>(`SELECT COUNT(*) AS n FROM sup_queue_events WHERE kind = 'abandoned' AND call_id IN (${callIds.map(() => "?").join(",")})`, ...callIds))[0]?.n ?? 0) : 0;
  const voice = calls.filter((k) => k.status !== "callback" || k.answered_at);
  const answered = voice.filter((k) => k.answered_at);
  const inbound = voice.filter((k) => k.direction === "inbound");
  const callbacks = await all<{ status: string; answered_at: string | null }>("SELECT status, answered_at FROM sup_calls WHERE started_at BETWEEN ? AND ? AND (status = 'callback' OR (kind = 'phone' AND direction = 'outbound' AND id IN (SELECT call_id FROM sup_queue_events WHERE kind = 'callback')))", from, to);
  const callCenter = {
    total: voice.length,
    incoming: inbound.length,
    outgoing: voice.length - inbound.length,
    answered: answered.length,
    missed: voice.filter((k) => k.status === "missed").length,
    declined: voice.filter((k) => k.status === "declined").length,
    abandoned,
    avgWaitS: avg(answered.filter((k) => k.wait_s !== null).map((k) => Number(k.wait_s))),
    avgDurationS: avg(answered.map((k) => Number(k.duration_s ?? 0)).filter((x) => x > 0)),
    serviceLevel: pct(inbound.filter((k) => k.answered_at && Number(k.wait_s ?? 0) <= Number(k.sl ?? 20)).length, inbound.filter((k) => k.status !== "ringing").length),
    callbackCompletion: pct(callbacks.filter((c) => c.answered_at || c.status === "ended").length, callbacks.length),
  };

  // Agents: everyone in a queue, or the one chosen.
  const queues = await sd.listQueues();
  const memberIds = f.agentId ? [f.agentId] : [...new Set(queues.flatMap((q) => q.members))];
  const names = new Map((await all<{ id: string; name: string }>(`SELECT id, name FROM users WHERE id IN (${memberIds.map(() => "?").join(",") || "''"})`, ...memberIds)).map((u) => [u.id, u.name]));
  const status = memberIds.length ? await all<{ user_id: string; kind: string; at: string }>(`SELECT user_id, kind, at FROM sup_activity WHERE kind LIKE 'status_%' AND at <= ? AND user_id IN (${memberIds.map(() => "?").join(",")}) ORDER BY at`, to, ...memberIds) : [];
  const availableHours = (id: string) => {
    // Hours spent Available in the range, from the status changes.
    let on: number | null = null;
    let total = 0;
    const lo = Date.parse(from);
    const hi = Math.min(Date.parse(to), Date.now());
    for (const s of status.filter((x) => x.user_id === id)) {
      const at = Math.max(lo, Date.parse(s.at));
      if (s.kind === "status_online") on ??= at;
      else if (on !== null) (total += Math.max(0, at - on), (on = null));
    }
    if (on !== null) total += Math.max(0, hi - on);
    return Math.round((total / 3600e3) * 10) / 10;
  };
  const agents = memberIds
    .map((id) => {
      const ts = tickets.filter((t) => t.assignee_id === id);
      const ks = answered.filter((k) => k.agent_id === id);
      const r = ts.filter((t) => t.rating !== null);
      return {
        id,
        name: names.get(id) ?? "Agent",
        conversations: ts.length,
        calls: ks.length,
        avgHandleS: avg(ks.map((k) => Number(k.duration_s ?? 0)).filter((x) => x > 0)),
        avgResponseMin: avg(ts.filter((t) => t.first_response_at).map((t) => mins(t.created_at, t.first_response_at!))),
        resolutionRate: pct(ts.filter((t) => t.status === "solved" || t.status === "closed").length, ts.length),
        missedCalls: voice.filter((k) => k.agent_id === id && k.status === "missed").length,
        rating: r.length ? Math.round((r.reduce((a, t) => a + Number(t.rating), 0) / r.length) * 10) / 10 : null,
        availableHours: availableHours(id),
        queues: queues.filter((q) => q.members.includes(id)).length,
      };
    })
    .sort((a, b) => b.conversations + b.calls - (a.conversations + a.calls));

  // Financial support: payment conversations, Chapa follow-ups, and requests to Finance.
  const pay = tickets.filter((t) => (t.category ?? "").toLowerCase().includes("pay") || PAYMENT.test(t.subject) || t.source === "chapa" || t.source === "cms_invoice");
  const reqs = await all<{ type: string; status: string; dept: string | null }>("SELECT r.type, r.status, d.dept FROM sup_requests r LEFT JOIN sup_request_destinations d ON d.id = r.destination_id WHERE r.created_at BETWEEN ? AND ? AND r.status <> 'draft'", from, to);
  const finance = {
    paymentInquiries: pay.length,
    verificationRequests: reqs.filter((r) => r.type === "payment_verification").length,
    failedTransactionInquiries: tickets.filter((t) => t.source === "chapa").length,
    refundRequests: reqs.filter((r) => r.type === "refund").length + tickets.filter((t) => /refund/i.test(t.subject)).length,
    resolvedPaymentIssues: pay.filter((t) => t.status === "solved" || t.status === "closed").length,
    pendingFinanceRequests: reqs.filter((r) => r.dept === "finance" && (OPEN_REQUEST_STATUSES as string[]).includes(r.status)).length,
  };
  return { filters: f, conversations, agents, callCenter, finance };
}

type Dash = Awaited<ReturnType<typeof supportDashboard>>;
function sheets(d: Dash): { name: string; rows: (string | number | null)[][] }[] {
  const kv = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => [k, v as string | number | null]);
  return [
    { name: "Conversations", rows: [["Metric", "Value"], ...kv(d.conversations)] },
    { name: "Calls", rows: [["Metric", "Value"], ...kv(d.callCenter)] },
    { name: "Financial support", rows: [["Metric", "Value"], ...kv(d.finance)] },
    {
      name: "Agents",
      rows: [["Agent", "Conversations", "Calls", "Avg handle (s)", "Avg response (min)", "Resolution %", "Missed calls", "Rating", "Available (h)", "Queues"], ...d.agents.map((a) => [a.name, a.conversations, a.calls, a.avgHandleS, a.avgResponseMin, a.resolutionRate, a.missedCalls, a.rating, a.availableHours, a.queues])],
    },
  ];
}

export async function exportDashboard(user: AppUser, f: DashFilters, format: "csv" | "xlsx") {
  if (!(await sd.isLead(user)) && !can(user, "support.export") && !can(user, "export.run")) throw new WorkflowError("FORBIDDEN", "Exporting support analytics needs the export permission.");
  const d = await supportDashboard(user, f);
  await audit({ actor: user }, { action: "support.analytics_export", summary: `${user.name} exported support analytics for ${f.from} to ${f.to} (${format.toUpperCase()})` });
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  if (format === "csv") return { name: `support-analytics-${f.from}-${f.to}.csv`, mime: "text/csv", base64: Buffer.from(sheets(d).map((s) => [s.name, ...s.rows.map((r) => r.map(esc).join(","))].join("\n")).join("\n\n")).toString("base64") };
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (const s of sheets(d)) {
    const ws = wb.addWorksheet(s.name);
    for (const r of s.rows) ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v)));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => (c.width = 22));
  }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { name: `support-analytics-${f.from}-${f.to}.xlsx`, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: buf.toString("base64") };
}
