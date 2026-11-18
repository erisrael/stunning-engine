// Update 1.2 reports (Phase 10, plan 10.2), shown under Customer support › Monitor: conversations by channel with
// first answer and resolution times, calls by queue (answered, abandoned, missed, wait and talk), phone-menu use,
// support requests by destination with the time they spend in each status, and the health of the Chapa and Noor syncs.
import { all } from "./db";
import { WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import * as sd from "./support-desk";
import { requestStatusLabel } from "@/lib/support-requests";

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export async function updateReports(user: AppUser, range: { from: string; to: string }) {
  if (!(await sd.isLead(user)) && !can(user, "support.queues")) throw new WorkflowError("FORBIDDEN", "Support reports are for support leads and Admin.");
  const from = `${range.from}T00:00:00.000Z`;
  const to = `${range.to}T23:59:59.999Z`;

  // Conversations by channel.
  const tickets = await all<{ channel: string; created_at: string; first_response_at: string | null; solved_at: string | null }>("SELECT channel, created_at, first_response_at, solved_at FROM sup_tickets WHERE created_at BETWEEN ? AND ?", from, to);
  const channels = [...new Set(tickets.map((t) => t.channel))].sort().map((ch) => {
    const ts = tickets.filter((t) => t.channel === ch);
    return {
      channel: ch,
      count: ts.length,
      firstAnswerMin: avg(ts.filter((t) => t.first_response_at).map((t) => (Date.parse(t.first_response_at!) - Date.parse(t.created_at)) / 60e3)),
      resolveHours: avg(ts.filter((t) => t.solved_at).map((t) => (Date.parse(t.solved_at!) - Date.parse(t.created_at)) / 3600e3)),
      solved: ts.filter((t) => t.solved_at).length,
    };
  });

  // Calls by queue.
  const calls = await all<{ queue: string | null; direction: string; status: string; answered_at: string | null; wait_s: number | null; duration_s: number | null }>(
    `SELECT q.name AS queue, k.direction, k.status, k.answered_at, k.wait_s, k.duration_s FROM sup_calls k LEFT JOIN sup_tickets t ON t.id = k.ticket_id LEFT JOIN sup_queues q ON q.id = COALESCE(k.ring_queue, k.queue_id, t.queue_id)
     WHERE k.kind <> 'staff' AND k.status <> 'callback' AND k.started_at BETWEEN ? AND ?`,
    from,
    to,
  );
  const ev = await all<{ queue: string | null; kind: string; n: number }>("SELECT q.name AS queue, e.kind, COUNT(*) AS n FROM sup_queue_events e LEFT JOIN sup_queues q ON q.id = e.queue_id WHERE e.at BETWEEN ? AND ? GROUP BY q.name, e.kind", from, to);
  const queueNames = [...new Set([...calls.map((c) => c.queue ?? "No queue"), ...ev.map((e) => e.queue ?? "No queue")])].sort();
  const callsByQueue = queueNames.map((name) => {
    const cs = calls.filter((c) => (c.queue ?? "No queue") === name);
    const n = (k: string) => Number(ev.find((e) => (e.queue ?? "No queue") === name && e.kind === k)?.n ?? 0);
    const answered = cs.filter((c) => c.answered_at);
    return {
      queue: name,
      incoming: cs.filter((c) => c.direction === "inbound").length,
      outgoing: cs.filter((c) => c.direction === "outbound").length,
      answered: answered.length,
      abandoned: n("abandoned"),
      missed: n("timeout"),
      refused: n("refused") + n("refused_closed") + n("refused_full"),
      overflowed: n("overflowed"),
      callbacks: n("callback"),
      avgWaitS: avg(answered.map((c) => Number(c.wait_s ?? 0))),
      avgTalkS: avg(answered.map((c) => Number(c.duration_s ?? 0)).filter((x) => x > 0)),
    };
  });

  // The phone menu.
  const ivr = await (await import("./support-ivr")).ivrStats(user, range).catch(() => null);

  // Support requests: by destination, and the hours spent in each status (until the next change, or now).
  const reqs = await all<{ id: string; status: string; label: string | null; dept: string | null }>(
    "SELECT r.id, r.status, d.label, d.dept FROM sup_requests r LEFT JOIN sup_request_destinations d ON d.id = r.destination_id WHERE r.created_at BETWEEN ? AND ? AND r.status <> 'draft'",
    from,
    to,
  );
  const byDest = [...new Set(reqs.map((r) => r.label ?? "No destination"))].sort().map((label) => {
    const rs = reqs.filter((r) => (r.label ?? "No destination") === label);
    return { destination: label, dept: rs[0]?.dept ?? null, count: rs.length, open: rs.filter((r) => !["resolved", "closed", "rejected", "cancelled"].includes(r.status)).length };
  });
  const events = reqs.length
    ? await all<{ request_id: string; to_status: string; created_at: string }>(`SELECT request_id, to_status, created_at FROM sup_request_events WHERE to_status IS NOT NULL AND request_id IN (${reqs.map(() => "?").join(",")}) ORDER BY request_id, created_at`, ...reqs.map((r) => r.id))
    : [];
  const spent = new Map<string, number[]>();
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const next = events[i + 1]?.request_id === e.request_id ? events[i + 1]!.created_at : null;
    if (!next && ["resolved", "closed", "rejected", "cancelled"].includes(e.to_status)) continue;
    const h = (Date.parse(next ?? new Date().toISOString()) - Date.parse(e.created_at)) / 3600e3;
    spent.set(e.to_status, [...(spent.get(e.to_status) ?? []), h]);
  }
  const timeInStatus = [...spent.entries()].map(([status, hs]) => ({ status, label: requestStatusLabel(status), avgHours: Math.round((hs.reduce((a, b) => a + b, 0) / hs.length) * 10) / 10, times: hs.length }));

  // Sync health: the latest run of each Chapa account and Noor table, and failures in the range.
  const runs = await all<{ source: string; scope_id: string; kind: string; status: string; started_at: string; finished_at: string | null; failed: number; error: string | null }>(
    "SELECT r.source, r.scope_id, r.kind, r.status, r.started_at, r.finished_at, r.failed, r.error FROM sync_runs r WHERE r.started_at = (SELECT MAX(x.started_at) FROM sync_runs x WHERE x.source = r.source AND x.scope_id = r.scope_id) ORDER BY r.source, r.scope_id",
  );
  const fails = await all<{ source: string; n: number }>("SELECT source, COUNT(*) AS n FROM sync_runs WHERE status = 'failed' AND started_at BETWEEN ? AND ? GROUP BY source", from, to);
  const names = new Map((await all<{ id: string; name: string }>("SELECT id, name FROM chapa_accounts")).map((a) => [a.id, a.name]));
  const sync = runs.map((r) => ({ source: r.source, scope: r.source === "chapa" ? (names.get(r.scope_id) ?? r.scope_id) : r.scope_id, kind: r.kind, status: r.status, at: r.finished_at ?? r.started_at, failed: Number(r.failed), error: r.error }));

  return { channels, callsByQueue, ivr, requests: { byDest, timeInStatus }, sync, syncFailures: Object.fromEntries(fails.map((f) => [f.source, Number(f.n)])) };
}
