// Call queues (Update 1.2, Phase 9, spec part G). A queue's agents and SLA targets live in support-desk.ts; this adds
// what a call needs: opening hours, a maximum size and wait, overflow, announcements, a call-back offer, routing
// strategies (least busy, round robin, longest idle, skills, agent priority, manual), caller priority rules, wrap-up
// time and a service level. Every step of a queued call is written to sup_queue_events, which the live board and the
// reports read. All state is in the database, so a restart loses nothing: the scheduled checks carry on from it.
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import * as sd from "./support-desk";
import { STRATEGY_KEYS, openAt, type ActiveHours, type PriorityRule, type QueueSettings, type QueueStrategy } from "@/lib/support-queues";

type Raw = {
  id: string;
  name: string;
  department: string | null;
  active_hours: string | null;
  max_size: number | null;
  max_wait_s: number | null;
  overflow_queue: string | null;
  announcement: string | null;
  music: number;
  callback_offer: number;
  auto_assign: number;
  priority_rules: string;
  wrap_up_s: number;
  skills: string;
  sl_seconds: number;
  accept_required: number;
};

const toSettings = (r: Raw): QueueSettings => ({
  id: r.id,
  name: r.name,
  department: r.department,
  activeHours: parseJson<ActiveHours>(r.active_hours, null),
  maxSize: r.max_size === null ? null : Number(r.max_size),
  maxWaitS: r.max_wait_s === null ? null : Number(r.max_wait_s),
  overflowQueue: r.overflow_queue,
  announcement: r.announcement,
  music: !!Number(r.music),
  callbackOffer: !!Number(r.callback_offer),
  autoAssign: !!Number(r.auto_assign),
  priorityRules: parseJson<PriorityRule[]>(r.priority_rules, []),
  wrapUpS: Number(r.wrap_up_s ?? 0),
  skills: parseJson<string[]>(r.skills, []),
  slSeconds: Number(r.sl_seconds ?? 20),
  acceptRequired: !!Number(r.accept_required ?? 0),
});

const COLS = "id, name, department, active_hours, max_size, max_wait_s, overflow_queue, announcement, music, callback_offer, auto_assign, priority_rules, wrap_up_s, skills, sl_seconds, accept_required";

export async function queueSettings(id: string | null | undefined) {
  if (!id) return null;
  const r = await get<Raw>(`SELECT ${COLS} FROM sup_queues WHERE id = ?`, id);
  return r ? toSettings(r) : null;
}

export async function allQueueSettings() {
  return (await all<Raw>(`SELECT ${COLS} FROM sup_queues ORDER BY sort, created_at`)).map(toSettings);
}

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown, lo: number, hi: number) => (v === null || v === undefined || v === "" ? null : Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo)));

export async function saveQueueSettings(user: AppUser, id: string, input: Partial<Omit<QueueSettings, "id" | "name">>) {
  if (!(await sd.isLead(user)) && !can(user, "support.queues")) throw new WorkflowError("FORBIDDEN", "Only support leads, Admin and people allowed to change queues do this.");
  const cur = await queueSettings(id);
  if (!cur) throw new WorkflowError("NOT_FOUND", "Queue not found.");
  const n = { ...cur, ...input };
  let hours: ActiveHours = null;
  if (n.activeHours) {
    const days = [...new Set((n.activeHours.days ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    const ok = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
    if (!days.length || !ok(n.activeHours.from) || !ok(n.activeHours.to) || n.activeHours.from === n.activeHours.to) throw new WorkflowError("VALIDATION", "Choose the open days, and an opening and closing time (HH:MM).");
    hours = { days, from: n.activeHours.from, to: n.activeHours.to };
  }
  if (n.overflowQueue === id) throw new WorkflowError("VALIDATION", "A queue cannot overflow into itself.");
  if (n.overflowQueue && !(await get("SELECT 1 AS x FROM sup_queues WHERE id = ?", n.overflowQueue))) throw new WorkflowError("VALIDATION", "Choose an existing overflow queue.");
  const rules = (n.priorityRules ?? [])
    .filter((r) => ["verified", "category", "tag", "ticket_priority", "repeat_caller"].includes(r.when))
    .slice(0, 20)
    .map((r) => ({ when: r.when, value: r.value ? clean(r.value, 60) : null, boost: Math.max(1, Math.min(100, Math.round(Number(r.boost) || 1))) }));
  await run(
    "UPDATE sup_queues SET department = ?, active_hours = ?, max_size = ?, max_wait_s = ?, overflow_queue = ?, announcement = ?, music = ?, callback_offer = ?, auto_assign = ?, priority_rules = ?, wrap_up_s = ?, skills = ?, sl_seconds = ?, accept_required = ? WHERE id = ?",
    clean(n.department, 60) || null,
    hours ? JSON.stringify(hours) : null,
    int(n.maxSize, 1, 1000),
    int(n.maxWaitS, 15, 3600),
    n.overflowQueue || null,
    clean(n.announcement, 500) || null,
    n.music ? 1 : 0,
    n.callbackOffer ? 1 : 0,
    n.autoAssign ? 1 : 0,
    JSON.stringify(rules),
    int(n.wrapUpS, 0, 600) ?? 0,
    JSON.stringify([...new Set((n.skills ?? []).map((s) => clean(s, 40).toLowerCase()).filter(Boolean))].slice(0, 20)),
    int(n.slSeconds, 5, 600) ?? 20,
    n.acceptRequired ? 1 : 0,
    id,
  );
  await audit({ actor: user }, { action: "support.queue", summary: `${user.name} changed the call settings of the queue ${cur.name}` });
}

export async function setAgentSkills(user: AppUser, agentId: string, skills: string[]) {
  if (!(await sd.isLead(user)) && !can(user, "support.queues")) throw new WorkflowError("FORBIDDEN", "Only support leads, Admin and people allowed to change queues set skills.");
  const list = [...new Set(skills.map((s) => clean(s, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
  await run("INSERT INTO sup_agents (user_id, status, status_since, skills) VALUES (?, 'offline', ?, ?) ON CONFLICT (user_id) DO UPDATE SET skills = excluded.skills", agentId, nowIso(), JSON.stringify(list));
}

export async function logQueue(kind: string, e: { queueId?: string | null; callId?: string | null; ticketId?: string | null; agentId?: string | null; detail?: string | null }) {
  await run("INSERT INTO sup_queue_events (id, queue_id, call_id, ticket_id, agent_id, kind, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("sqe_"), e.queueId ?? null, e.callId ?? null, e.ticketId ?? null, e.agentId ?? null, kind, e.detail ? clean(e.detail, 300) : null, nowIso());
}

// Agents on a live call (theirs, or one they host), and agents still wrapping up the last one.
export async function busyAgents(wrapUpS = 0) {
  const live = await all<{ id: string }>("SELECT DISTINCT COALESCE(agent_id, host_id) AS id FROM sup_calls WHERE status = 'answered' AND COALESCE(agent_id, host_id) IS NOT NULL");
  const busy = new Set(live.map((r) => r.id));
  const wrap = new Set<string>();
  if (wrapUpS > 0) {
    const since = new Date(Date.now() - wrapUpS * 1000).toISOString();
    for (const r of await all<{ id: string }>("SELECT DISTINCT agent_id AS id FROM sup_calls WHERE agent_id IS NOT NULL AND answered_at IS NOT NULL AND ended_at >= ? AND kind <> 'staff'", since)) if (!busy.has(r.id)) wrap.add(r.id);
  }
  return { busy, wrap };
}

// Agents of the queue who are online, in the order the queue's strategy offers them a call. Agents on a call or
// wrapping up are left out; so is everyone for a manual queue (its calls ring for all of them).
export async function pickAgents(queueId: string | null, opts: { forCall?: boolean } = {}) {
  const queues = await sd.listQueues();
  const q = queueId ? queues.find((x) => x.id === queueId) : null;
  const s = await queueSettings(queueId);
  const strategy = (q?.strategy ?? "least_busy") as QueueStrategy;
  let avail = await sd.availableAgents(queueId, undefined, { ignoreLimit: !!opts.forCall });
  if (opts.forCall) {
    const { busy, wrap } = await busyAgents(s?.wrapUpS ?? 0);
    avail = avail.filter((a) => !busy.has(a.userId) && !wrap.has(a.userId));
  }
  if (!avail.length || strategy === "manual") return { strategy, agents: strategy === "manual" ? [] : avail.map((a) => a.userId) };
  let order = avail.map((a) => a.userId);
  if (strategy === "round_robin" && q) {
    const last = (await get<{ last_assigned: string | null }>("SELECT last_assigned FROM sup_queues WHERE id = ?", q.id))?.last_assigned;
    const ring = q.members.filter((m) => order.includes(m));
    const i = last ? ring.indexOf(last) : -1;
    order = [...ring.slice(i + 1), ...ring.slice(0, i + 1)];
  } else if (strategy === "longest_idle") {
    const idle = new Map<string, string>();
    for (const id of order) {
      const r = await get<{ c: string | null; t: string | null }>("SELECT (SELECT MAX(COALESCE(ended_at, answered_at)) FROM sup_calls WHERE agent_id = ? AND kind <> 'staff') AS c, (SELECT MAX(assigned_at) FROM sup_tickets WHERE assignee_id = ?) AS t", id, id);
      idle.set(id, [r?.c ?? "", r?.t ?? ""].sort().at(-1) ?? "");
    }
    order.sort((a, b) => (idle.get(a) ?? "").localeCompare(idle.get(b) ?? ""));
  } else if (strategy === "skills" && s?.skills.length) {
    const skilled: string[] = [];
    for (const id of order) {
      const have = parseJson<string[]>((await get<{ skills: string }>("SELECT skills FROM sup_agents WHERE user_id = ?", id))?.skills, []);
      if (s.skills.every((k) => have.includes(k))) skilled.push(id);
    }
    if (skilled.length) order = skilled;
  } else if (strategy === "priority" && q) {
    order.sort((a, b) => q.members.indexOf(a) - q.members.indexOf(b));
  }
  return { strategy, agents: order };
}

// Agents of the queue who are signed in to the desk at all (busy or not): with none, a call cannot wait for anyone.
export async function anyoneOnline(queueId: string | null) {
  return (await sd.availableAgents(queueId, undefined, { ignoreLimit: true })).length > 0;
}

export async function waitingIn(queueId: string) {
  return Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_calls WHERE status = 'ringing' AND direction = 'inbound' AND kind = 'web' AND COALESCE(ring_queue, queue_id) = ?", queueId))?.n ?? 0);
}

// Where a new call goes: the queue if it is open, has room and someone online; else its overflow queue (one step);
// else it is refused with the reason, and the caller is offered a call-back.
export async function admitCall(queueId: string | null): Promise<{ queueId: string | null; overflowFrom?: string; refused?: "closed" | "full" | "nobody" }> {
  // Nobody free yet is not a refusal: the caller waits in the line (with the waiting message) until an agent is
  // free or comes online, or the line's waiting time runs out. Only a closed or full line turns a caller away.
  if (!queueId) return { queueId: null };
  const check = async (id: string): Promise<null | "closed" | "full" | "nobody"> => {
    const s = await queueSettings(id);
    if (!s) return "nobody";
    if (!openAt(s.activeHours, nowIso())) return "closed";
    if (s.maxSize && (await waitingIn(id)) >= s.maxSize) return "full";
    return null;
  };
  const why = await check(queueId);
  if (!why) return { queueId };
  const s = await queueSettings(queueId);
  if (s?.overflowQueue && !(await check(s.overflowQueue))) return { queueId: s.overflowQueue, overflowFrom: queueId };
  return { queueId, refused: why };
}

export const REFUSED_TEXT: Record<"closed" | "full" | "nobody", string> = {
  closed: "This line is closed now. Ask us to call you back, or leave a message.",
  full: "All our agents are busy and the line is full. Ask us to call you back, or leave a message.",
  nobody: "No one can take the call right now. Leave a message and we will answer soon.",
};

// A caller's place in the line: priority from the queue's rules, then the time they joined.
export async function callerPriority(queueId: string | null, input: { customerId: string | null; category?: string | null; ticketId?: string | null }) {
  const s = await queueSettings(queueId);
  if (!s?.priorityRules.length || !input.customerId) return 0;
  const c = await get<{ verified: number; meta: string }>("SELECT verified, meta FROM sup_customers WHERE id = ?", input.customerId);
  const tags = parseJson<{ tags?: string[] }>(c?.meta, {}).tags ?? [];
  const t = input.ticketId ? await get<{ priority: string; tags: string }>("SELECT priority, tags FROM sup_tickets WHERE id = ?", input.ticketId) : null;
  const allTags = [...tags, ...parseJson<string[]>(t?.tags, [])].map((x) => String(x).toLowerCase());
  const recent = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_calls WHERE customer_id = ? AND started_at >= ?", input.customerId, new Date(Date.now() - 864e5).toISOString()))?.n ?? 0) > 0;
  let p = 0;
  for (const r of s.priorityRules) {
    const v = (r.value ?? "").toLowerCase();
    const hit =
      (r.when === "verified" && !!Number(c?.verified)) ||
      (r.when === "category" && !!v && (input.category ?? "").toLowerCase() === v) ||
      (r.when === "tag" && !!v && allTags.includes(v)) ||
      (r.when === "ticket_priority" && !!v && t?.priority === v) ||
      (r.when === "repeat_caller" && recent);
    if (hit) p += r.boost;
  }
  return p;
}

// What a waiting caller sees: their place among calls of the same queue, an estimate only once the queue has ten
// answered calls in the last 30 days (the median wait), the queue's announcement, and whether to offer a call-back.
export async function callerQueueInfo(k: { id: string; queue_id: string | null; ring_queue: string | null; priority: number; started_at: string; queued_at: string | null }) {
  const q = k.ring_queue ?? k.queue_id;
  const ahead = q
    ? Number(
        (
          await get<{ n: number }>(
            "SELECT COUNT(*) AS n FROM sup_calls WHERE status = 'ringing' AND direction = 'inbound' AND kind = 'web' AND COALESCE(ring_queue, queue_id) = ? AND id <> ? AND (priority > ? OR (priority = ? AND COALESCE(queued_at, started_at) < ?))",
            q,
            k.id,
            k.priority,
            k.priority,
            k.queued_at ?? k.started_at,
          )
        )?.n ?? 0,
      )
    : Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_calls WHERE status = 'ringing' AND direction = 'inbound' AND kind = 'web' AND started_at < ?", k.started_at))?.n ?? 0);
  const s = await queueSettings(q);
  let estimateSec: number | null = null;
  if (q) {
    const past = await all<{ w: number; d: number | null }>("SELECT wait_s AS w, duration_s AS d FROM sup_calls WHERE COALESCE(ring_queue, queue_id) = ? AND answered_at IS NOT NULL AND wait_s IS NOT NULL AND started_at >= ?", q, new Date(Date.now() - 30 * 864e5).toISOString());
    if (past.length >= 10) {
      const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
      // The usual wait at the front of the line, or the calls ahead shared among the agents online, whichever is longer.
      const agents = Math.max(1, (await sd.availableAgents(q, undefined, { ignoreLimit: true })).length);
      const handle = median(past.map((r) => Number(r.d ?? 0)).filter((d) => d > 0));
      estimateSec = Math.max(10, Math.round(Math.max(median(past.map((r) => Number(r.w))), (ahead * handle) / agents)));
    }
  }
  // Too little history: the calls ahead (and the calls agents are on now) at Admin's usual call length,
  // shared among the agents online. Marked as approximate.
  let approx = false;
  if (estimateSec === null) {
    const cfg = await sd.supportConfig();
    const handle = cfg.defaultHandleSec || 240;
    const online = (await sd.availableAgents(q, undefined, { ignoreLimit: true })).length;
    if (online > 0) {
      const busy = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_calls WHERE status = 'answered' AND ended_at IS NULL"))?.n ?? 0);
      const freeNow = Math.max(0, online - busy);
      estimateSec = ahead < freeNow ? 15 : Math.max(30, Math.round(((ahead + 1 - freeNow) * handle) / online / (busy >= online ? 2 : 1)));
      approx = true;
    }
  }
  return { position: ahead + 1, estimateSec, estimateApprox: approx, announcement: s?.announcement ?? null, music: s ? s.music : true, callbackOffer: s ? s.callbackOffer : true, queue: s?.name ?? null };
}

// Calls past their queue's maximum wait move once to the overflow queue; calls past it with nowhere to go are
// returned to be marked missed (support-desk.ts expireRinging does that, and tells the caller).
export async function overflowWaiting(defaultRingS: number) {
  const ringing = await all<{ id: string; queue_id: string | null; ring_queue: string | null; started_at: string; queued_at: string | null; ring_stage: number; ticket_id: string | null }>(
    "SELECT id, queue_id, ring_queue, started_at, queued_at, ring_stage, ticket_id FROM sup_calls WHERE status = 'ringing' AND direction = 'inbound' AND kind = 'web' AND ring_stage <> 9 AND COALESCE(ring_queue, queue_id) IS NOT NULL",
  );
  const expired: string[] = [];
  const settings = new Map((await allQueueSettings()).map((s) => [s.id, s]));
  for (const k of ringing) {
    const qid = (k.ring_queue ?? k.queue_id)!;
    const s = settings.get(qid);
    const limit = (s?.maxWaitS ?? defaultRingS) * 1000;
    // The wait counts from the call's start, or from its move to the overflow queue.
    if (Date.now() - Date.parse(k.ring_stage === 3 && k.queued_at ? k.queued_at : k.started_at) < limit) continue;
    const over = s?.overflowQueue && k.ring_stage < 3 && settings.has(s.overflowQueue) ? s.overflowQueue : null;
    if (over && (await anyoneOnline(over))) {
      await run("UPDATE sup_calls SET ring_queue = ?, queued_at = ?, agent_id = NULL, ring_stage = 3 WHERE id = ? AND status = 'ringing'", over, nowIso(), k.id);
      await logQueue("overflowed", { queueId: qid, callId: k.id, ticketId: k.ticket_id, detail: `to ${settings.get(over)?.name ?? over}` });
      continue;
    }
    expired.push(k.id);
  }
  return expired;
}

// The live board (spec 10.3) and the supervisor's view of waiting callers and agents (plan 9.6).
export async function queueBoard(user: AppUser, sinceIso?: string) {
  if (!(await sd.isLead(user)) && !can(user, "support.queues")) throw new WorkflowError("FORBIDDEN", "Only support leads, Admin and people allowed to manage queues see the queue board.");
  const since = sinceIso ?? new Date(new Date().setUTCHours(0, 0, 0, 0) - 3 * 3600e3).toISOString();
  const queues = (await sd.listQueues()).filter((q) => q.active);
  const settings = new Map((await allQueueSettings()).map((s) => [s.id, s]));
  const { busy, wrap } = await busyAgents(Math.max(0, ...[...settings.values()].map((s) => s.wrapUpS)));
  const online = new Set((await sd.availableAgents(null, undefined, { ignoreLimit: true })).map((a) => a.userId));
  const now = Date.now();
  const rows = [];
  for (const q of queues) {
    const s = settings.get(q.id)!;
    const waiting = await all<{ id: string; customer: string | null; started_at: string; queued_at: string | null; priority: number; agent: string | null }>(
      `SELECT k.id, c.name AS customer, k.started_at, k.queued_at, k.priority, u.name AS agent FROM sup_calls k LEFT JOIN sup_customers c ON c.id = k.customer_id LEFT JOIN users u ON u.id = k.agent_id
       WHERE k.status = 'ringing' AND k.direction = 'inbound' AND k.kind = 'web' AND COALESCE(k.ring_queue, k.queue_id) = ? ORDER BY k.priority DESC, COALESCE(k.queued_at, k.started_at)`,
      q.id,
    );
    const active = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_calls WHERE status = 'answered' AND kind = 'web' AND COALESCE(ring_queue, queue_id) = ?", q.id))?.n ?? 0);
    const done = await all<{ status: string; wait_s: number | null; duration_s: number | null; answered_at: string | null }>(
      "SELECT status, wait_s, duration_s, answered_at FROM sup_calls WHERE kind = 'web' AND direction = 'inbound' AND COALESCE(ring_queue, queue_id) = ? AND started_at >= ? AND status NOT IN ('ringing','answered')",
      q.id,
      since,
    );
    const ev = await all<{ kind: string; n: number }>("SELECT kind, COUNT(*) AS n FROM sup_queue_events WHERE queue_id = ? AND at >= ? GROUP BY kind", q.id, since);
    const evn = (k: string) => Number(ev.find((e) => e.kind === k)?.n ?? 0);
    const answered = done.filter((d) => d.answered_at);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const inSl = answered.filter((d) => (d.wait_s ?? 0) <= s.slSeconds).length;
    const slBase = answered.length + evn("abandoned") + evn("timeout");
    const members = q.members.filter((m) => online.has(m));
    rows.push({
      id: q.id,
      name: q.name,
      strategy: q.strategy,
      open: openAt(s.activeHours, nowIso()),
      waiting: waiting.length,
      active,
      agentsAvailable: members.filter((m) => !busy.has(m) && !wrap.has(m)).length,
      agentsBusy: members.filter((m) => busy.has(m) || wrap.has(m)).length,
      avgWaitS: avg(answered.map((d) => Number(d.wait_s ?? 0))),
      longestWaitS: waiting.length ? Math.round(Math.max(...waiting.map((w) => now - Date.parse(w.queued_at ?? w.started_at))) / 1000) : 0,
      avgHandleS: avg(answered.map((d) => Number(d.duration_s ?? 0)).filter((x) => x > 0)),
      abandoned: evn("abandoned"),
      missed: evn("timeout"),
      completed: answered.length,
      overflowed: evn("overflowed"),
      serviceLevel: slBase ? Math.round((inSl / slBase) * 100) : null,
      slSeconds: s.slSeconds,
      callers: waiting.map((w) => ({ id: w.id, customer: w.customer ?? "Customer", waitS: Math.round((now - Date.parse(w.queued_at ?? w.started_at)) / 1000), priority: Number(w.priority), offeredTo: w.agent })),
    });
  }
  const members = [...new Set(queues.flatMap((q) => q.members))];
  const names = new Map((await all<{ id: string; name: string }>(`SELECT id, name FROM users WHERE id IN (${members.map(() => "?").join(",") || "''"})`, ...members)).map((u) => [u.id, u.name]));
  const st = new Map((await all<{ user_id: string; status: string; status_since: string }>(`SELECT user_id, status, status_since FROM sup_agents WHERE user_id IN (${members.map(() => "?").join(",") || "''"})`, ...members)).map((a) => [a.user_id, a]));
  const agents = members
    .map((id) => {
      const a = st.get(id);
      const state = busy.has(id) ? "on_call" : wrap.has(id) ? "wrap_up" : online.has(id) ? "available" : a?.status === "away" || a?.status === "busy" || a?.status === "break" ? a.status : "offline";
      return { id, name: names.get(id) ?? "Agent", state, since: a?.status_since ?? null, queues: queues.filter((q) => q.members.includes(id)).map((q) => q.name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { queues: rows, agents, since };
}

// Offered conversations (queues where agents accept): accept keeps it; decline, or no answer in two minutes, passes
// it to the next eligible agent, never back to one who declined.
const OFFER_MS = 2 * 60e3;
export async function acceptConversation(user: AppUser, ticketId: string) {
  const t = await get<{ assignee_id: string | null; offered_at: string | null }>("SELECT assignee_id, offered_at FROM sup_tickets WHERE id = ?", ticketId);
  if (!t || t.assignee_id !== user.id || !t.offered_at) throw new WorkflowError("INVALID_STATE", "This conversation is not waiting for you to accept it.");
  await run("UPDATE sup_tickets SET offered_at = NULL, updated_at = ? WHERE id = ?", nowIso(), ticketId);
  await sd.activity(user.id, ticketId, "accepted", "Accepted the conversation");
}
async function passOn(ticketId: string, agentId: string, why: string) {
  const t = await get<{ declined_by: string }>("SELECT declined_by FROM sup_tickets WHERE id = ?", ticketId);
  const list = [...new Set([...parseJson<string[]>(t?.declined_by, []), agentId])];
  const done = await get<{ id: string }>("UPDATE sup_tickets SET assignee_id = NULL, assigned_at = NULL, offered_at = NULL, declined_by = ?, updated_at = ? WHERE id = ? AND assignee_id = ? AND offered_at IS NOT NULL RETURNING id", JSON.stringify(list), nowIso(), ticketId, agentId);
  if (!done) return false;
  await sd.activity(agentId, ticketId, "declined", why);
  await sd.autoAssign(ticketId);
  return true;
}
export async function declineConversation(user: AppUser, ticketId: string) {
  if (!(await passOn(ticketId, user.id, "Declined the conversation"))) throw new WorkflowError("INVALID_STATE", "This conversation is not waiting for you to accept it.");
}
export async function expireOffers() {
  const old = await all<{ id: string; assignee_id: string }>("SELECT id, assignee_id FROM sup_tickets WHERE offered_at IS NOT NULL AND offered_at < ? AND assignee_id IS NOT NULL", new Date(Date.now() - OFFER_MS).toISOString());
  for (const t of old) await passOn(t.id, t.assignee_id, "Not accepted within two minutes");
  return old.length;
}

export function strategyOk(s: string) {
  return STRATEGY_KEYS.includes(s);
}
