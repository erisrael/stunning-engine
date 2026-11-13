// The call center (Update 1.1): in-call controls (hold, transfer to a colleague, bring a colleague into the call),
// calling customers (in the app when they have it open, or by phone with the number logged), call-back requests
// (from the widget or the Telegram bot), and the call history with recordings.
//
// Calls in the browser are one connection between the customer and one agent. A colleague joins through the
// agent's browser, which passes each side's voice to the other (a conference leg: kind 'staff'). A transfer ends
// the call and the customer's browser calls again, ringing only for the new agent.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import type { AppUser } from "./users";
import * as sd from "./support-desk";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const CUSTOMER_ONLINE_MS = 30_000;

async function myLiveCall(user: AppUser, callId: string) {
  const k = await sd.callFor(callId);
  if (k.agent_id !== user.id && !(k.direction === "outbound" && k.host_id === user.id)) throw new WorkflowError("FORBIDDEN", "Not your call.");
  if (k.status !== "answered") throw new WorkflowError("INVALID_STATE", "The call is not in progress.");
  return k;
}

// ---------------------------------------------------------------------------
// Hold
// ---------------------------------------------------------------------------

// On hold the customer hears hold music and neither side hears the other; the time on hold is kept with the call.
export async function holdCall(user: AppUser, callId: string, on: boolean) {
  const k = await myLiveCall(user, callId);
  const now = nowIso();
  if (on && !Number(k.on_hold)) await run("UPDATE sup_calls SET on_hold = 1, hold_since = ? WHERE id = ?", now, k.id);
  if (!on && Number(k.on_hold)) {
    const held = k.hold_since ? Math.round((Date.parse(now) - Date.parse(k.hold_since)) / 1000) : 0;
    await run("UPDATE sup_calls SET on_hold = 0, hold_since = NULL, hold_s = hold_s + ? WHERE id = ?", held, k.id);
  }
  if (k.ticket_id && on !== !!Number(k.on_hold)) await sd.activity(user.id, k.ticket_id, on ? "call_hold" : "call_resume", on ? "Put the caller on hold" : "Back from hold");
  return { onHold: on };
}

// ---------------------------------------------------------------------------
// Transfer and conference
// ---------------------------------------------------------------------------

// Colleagues who can take a call now: online support agents (any queue), not the one asking.
export async function transferTargets(user: AppUser) {
  await sd.needAgent(user);
  const online = await sd.availableAgents(null, undefined, { ignoreLimit: true });
  const ids = online.map((a) => a.userId).filter((id) => id !== user.id);
  if (!ids.length) return [];
  return all<{ id: string; name: string }>(`SELECT id, name FROM users WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY name`, ...ids);
}

async function needTarget(user: AppUser, toUserId: string) {
  if (toUserId === user.id) throw new WorkflowError("VALIDATION", "Pick a colleague.");
  const ok = (await transferTargets(user)).find((t) => t.id === toUserId);
  if (!ok) throw new WorkflowError("INVALID_STATE", "That colleague is not online in support right now.");
  return ok;
}

// Hands the caller to a colleague: this call ends as 'transferred', the ticket becomes theirs, and the caller's
// browser rings them at once. A warm transfer is the same after talking together in a conference first.
export async function transferCall(user: AppUser, callId: string, toUserId: string, note?: string | null) {
  const k = await myLiveCall(user, callId);
  if (k.kind !== "web") throw new WorkflowError("INVALID_STATE", "Only calls in the app can be transferred. For a phone call, give the colleague the number.");
  const to = await needTarget(user, toUserId);
  const now = nowIso();
  const dur = k.answered_at ? Math.round((Date.parse(now) - Date.parse(k.answered_at)) / 1000) : null;
  const held = Number(k.on_hold) && k.hold_since ? Math.round((Date.parse(now) - Date.parse(k.hold_since)) / 1000) : 0;
  await run("UPDATE sup_calls SET status = 'transferred', transfer_to = ?, ended_at = ?, duration_s = ?, on_hold = 0, hold_since = NULL, hold_s = hold_s + ? WHERE id = ? AND status = 'answered'", to.id, now, dur, held, k.id);
  for (const leg of await all<sd.CallRow>("SELECT * FROM sup_calls WHERE parent_id = ? AND status IN ('ringing','answered')", k.id)) await sd.finishCall(leg, user);
  if (k.ticket_id) {
    await run("UPDATE sup_tickets SET assignee_id = ?, assigned_at = ?, updated_at = ? WHERE id = ?", to.id, now, now, k.ticket_id);
    const n = clean(note, 500);
    await sd.activity(user.id, k.ticket_id, "call_transferred", `Transferred the call to ${to.name}${n ? `: ${n}` : ""}`);
    if (n) await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'agent', ?, ?, 1, ?)", uid("smg_"), k.ticket_id, user.id, `Transfer note for ${to.name}: ${n}`, now);
    const t = await get<{ number: number }>("SELECT number FROM sup_tickets WHERE id = ?", k.ticket_id);
    await notify([to.id], { type: "assignment", title: `${user.name} is transferring a call to you (#${t?.number ?? ""})`, body: n || "Answer in Customer support.", link: `/support?ticket=${k.ticket_id}`, dedupeKey: `sup-xfer-${k.id}` }, now);
  }
  return { to: to.name };
}

// Brings a colleague into the call: their phone rings in the desk; the agent's browser makes the offer and joins
// the voices. The colleague can be handed the call afterwards (a warm transfer).
export async function inviteToCall(user: AppUser, callId: string, toUserId: string, offer: string) {
  const k = await myLiveCall(user, callId);
  if (k.kind === "staff") throw new WorkflowError("INVALID_STATE", "Invite from the main call.");
  const to = await needTarget(user, toUserId);
  if (!offer || offer.length > 20000) throw new WorkflowError("VALIDATION", "The invitation could not start.");
  const busy = await get("SELECT id FROM sup_calls WHERE parent_id = ? AND status IN ('ringing','answered')", k.id);
  if (busy) throw new WorkflowError("INVALID_STATE", "A colleague is already in this call or being asked.");
  const id = uid("scl_");
  await run(
    "INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, direction, kind, status, offer, consent, started_at, parent_id, host_id, ring_stage, app_id) VALUES (?, ?, ?, ?, 'inbound', 'staff', 'ringing', ?, ?, ?, ?, ?, 9, ?)",
    id,
    k.ticket_id,
    k.customer_id,
    to.id,
    offer,
    k.consent,
    nowIso(),
    k.id,
    user.id,
    k.app_id,
  );
  if (k.ticket_id) await sd.activity(user.id, k.ticket_id, "call_invite", `Asked ${to.name} to join the call`);
  await notify([to.id], { type: "assignment", title: `${user.name} asks you to join a call`, body: "Answer in Customer support.", link: k.ticket_id ? `/support?ticket=${k.ticket_id}` : "/support", dedupeKey: `sup-join-${id}` }, nowIso());
  return { legId: id, name: to.name };
}

// ---------------------------------------------------------------------------
// Calling customers
// ---------------------------------------------------------------------------

// Can this ticket's customer be called in the app now (the app open in the last half minute, calls on for the
// system, its engine is the browser)? And the phone number on file.
export async function dialInfo(user: AppUser, ticketId: string) {
  const t = await sd.canWork(user, ticketId);
  const c = t.customer_id ? await get<{ id: string; app_id: string | null; external_id: string | null; phone: string | null; last_seen_at: string | null }>("SELECT id, app_id, external_id, phone, last_seen_at FROM sup_customers WHERE id = ?", t.customer_id) : null;
  const app = c?.app_id ? await get<{ channels: string | null; call_engine: string | null }>("SELECT channels, call_engine FROM sup_apps WHERE id = ?", c.app_id) : null;
  const { channelsOf } = await import("./connected-systems");
  const inApp = !!c && !!app && !/^(tg|mail):/.test(c.external_id ?? "") && channelsOf(app.channels).calls && (app.call_engine ?? "browser") === "browser";
  const online = inApp && !!c!.last_seen_at && Date.now() - Date.parse(c!.last_seen_at) < CUSTOMER_ONLINE_MS;
  return { inApp, online, phone: c?.phone ?? null };
}

// The agent calls the customer in the app: it rings in their open widget until they answer or decline.
export async function dialCustomer(user: AppUser, ticketId: string, offer: string) {
  const t = await sd.canWork(user, ticketId);
  const info = await dialInfo(user, ticketId);
  if (!info.inApp) throw new WorkflowError("INVALID_STATE", "This customer cannot be called in the app. Call their phone.");
  if (!info.online) throw new WorkflowError("INVALID_STATE", "The customer does not have the app open right now. Call their phone, or try again later.");
  if (!offer || offer.length > 20000) throw new WorkflowError("VALIDATION", "The call could not start.");
  if (await get("SELECT id FROM sup_calls WHERE customer_id = ? AND status IN ('ringing','answered') AND kind = 'web'", t.customer_id)) throw new WorkflowError("INVALID_STATE", "The customer is already in a call.");
  const cfg = await sd.supportConfig();
  const app = await get<{ app_id: string | null }>("SELECT app_id FROM sup_customers WHERE id = ?", t.customer_id);
  const id = uid("scl_");
  await run(
    "INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, direction, kind, status, offer, consent, started_at, host_id, ring_stage, app_id) VALUES (?, ?, ?, ?, 'outbound', 'web', 'ringing', ?, 0, ?, ?, 9, ?)",
    id,
    t.id,
    t.customer_id,
    user.id,
    offer,
    nowIso(),
    user.id,
    app?.app_id ?? null,
  );
  await sd.activity(user.id, t.id, "call_dial", "Called the customer in the app");
  return { callId: id, record: cfg.recordCalls };
}

// The customer's widget asks whether an agent is calling them.
export async function customerIncoming(app: sd.AppFull, token: string) {
  const c = await sd.customerByToken(app, token);
  const k = await get<{ id: string; offer: string; agent: string | null; ticket_id: string | null; started_at: string }>(
    "SELECT k.id, k.offer, u.name AS agent, k.ticket_id, k.started_at FROM sup_calls k LEFT JOIN users u ON u.id = k.agent_id WHERE k.customer_id = ? AND k.direction = 'outbound' AND k.kind = 'web' AND k.status = 'ringing' ORDER BY k.started_at DESC LIMIT 1",
    c.id,
  );
  if (!k) return { call: null };
  const cfg = await sd.supportConfig();
  return { call: { id: k.id, offer: k.offer, agent: k.agent?.split(" ")[0] ?? null, ticketId: k.ticket_id, record: cfg.recordCalls, notice: cfg.recordCalls ? cfg.recordingNotice : null } };
}

export async function customerAnswer(app: sd.AppFull, token: string, callId: string, input: { answer: string; consent: boolean }) {
  const c = await sd.customerByToken(app, token);
  const k = await sd.callFor(callId);
  if (k.customer_id !== c.id || k.direction !== "outbound") throw new WorkflowError("NOT_FOUND", "Call not found.");
  if (k.status !== "ringing") throw new WorkflowError("INVALID_STATE", "The call has ended.");
  if (!input.answer || input.answer.length > 20000) throw new WorkflowError("VALIDATION", "The call could not connect.");
  const now = nowIso();
  await run("UPDATE sup_calls SET status = 'answered', answer = ?, answered_at = ?, consent = ? WHERE id = ? AND status = 'ringing'", input.answer, now, input.consent ? 1 : 0, k.id);
  if (k.ticket_id) {
    await run("UPDATE sup_tickets SET first_response_at = COALESCE(first_response_at, ?), last_agent_at = ?, updated_at = ? WHERE id = ?", now, now, now, k.ticket_id);
    await sd.activity(null, k.ticket_id, "call_answered", "The customer answered");
  }
  return { ok: true };
}

export async function customerDecline(app: sd.AppFull, token: string, callId: string) {
  const c = await sd.customerByToken(app, token);
  const k = await sd.callFor(callId);
  if (k.customer_id !== c.id || k.direction !== "outbound") throw new WorkflowError("NOT_FOUND", "Call not found.");
  if (k.status !== "ringing") return { ok: true };
  await run("UPDATE sup_calls SET status = 'declined', ended_at = ? WHERE id = ? AND status = 'ringing'", nowIso(), k.id);
  if (k.ticket_id) await sd.activity(null, k.ticket_id, "call_declined", "The customer declined the call");
  return { ok: true };
}

// A call by phone (the agent's desk phone or mobile, opened from the dialer): the number and the time are kept
// from the start, and the agent ends it with notes. A waiting call-back request is taken by calling it.
export async function startPhoneCall(user: AppUser, input: { ticketId?: string | null; phone?: string | null; callbackId?: string | null }) {
  await sd.needAgent(user);
  const now = nowIso();
  if (input.callbackId) {
    const cb = await get<{ id: string; status: string; phone: string | null; ticket_id: string | null }>("SELECT id, status, phone, ticket_id FROM sup_calls WHERE id = ?", input.callbackId);
    if (!cb || cb.status !== "callback") throw new WorkflowError("INVALID_STATE", "Someone else has taken this call-back.");
    const got = await get<{ id: string }>("UPDATE sup_calls SET status = 'answered', agent_id = ?, answered_at = ?, started_at = ? WHERE id = ? AND status = 'callback' RETURNING id", user.id, now, now, cb.id);
    if (!got) throw new WorkflowError("INVALID_STATE", "Someone else has taken this call-back.");
    if (cb.ticket_id) {
      await run("UPDATE sup_tickets SET assignee_id = COALESCE(assignee_id, ?), assigned_at = COALESCE(assigned_at, ?), first_response_at = COALESCE(first_response_at, ?), last_agent_at = ?, updated_at = ? WHERE id = ?", user.id, now, now, now, now, cb.ticket_id);
      await sd.activity(user.id, cb.ticket_id, "call_dial", `Calling back ${cb.phone ?? ""}`.trim());
    }
    return { callId: cb.id, phone: cb.phone, ticketId: cb.ticket_id };
  }
  let ticketId = input.ticketId ?? null;
  let customerId: string | null = null;
  let phone = clean(input.phone, 40).replace(/[^\d+]/g, "");
  if (ticketId) {
    const t = await sd.canWork(user, ticketId);
    customerId = t.customer_id;
    if (!phone && customerId) phone = (await get<{ phone: string | null }>("SELECT phone FROM sup_customers WHERE id = ?", customerId))?.phone ?? "";
  } else if (phone) {
    const c = await get<{ id: string }>("SELECT id FROM sup_customers WHERE phone = ? ORDER BY last_seen_at DESC NULLS LAST LIMIT 1", phone);
    customerId = c?.id ?? null;
  }
  if (!/^\+?\d{7,15}$/.test(phone)) throw new WorkflowError("VALIDATION", "Enter a phone number (7 to 15 digits, + allowed).");
  const id = uid("scl_");
  await run(
    "INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, direction, kind, status, consent, started_at, answered_at, phone, host_id, ring_stage) VALUES (?, ?, ?, ?, 'outbound', 'phone', 'answered', 1, ?, ?, ?, ?, 9)",
    id,
    ticketId,
    customerId,
    user.id,
    now,
    now,
    phone,
    user.id,
  );
  if (ticketId) {
    await run("UPDATE sup_tickets SET first_response_at = COALESCE(first_response_at, ?), last_agent_at = ?, updated_at = ? WHERE id = ?", now, now, now, ticketId);
    await sd.activity(user.id, ticketId, "call_dial", `Called ${phone}`);
  }
  return { callId: id, phone, ticketId };
}

// A customer asks to be called: a ticket (the open one, or new) and a waiting call-back in the call center.
export async function requestCallback(input: { customerId: string; phone: string; appId?: string | null; channel: "telegram" | "widget"; ticketId?: string | null; note?: string | null }) {
  const phone = clean(input.phone, 40).replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(phone)) throw new WorkflowError("VALIDATION", "Give a phone number to call (7 to 15 digits).");
  const waiting = await get<{ id: string; ticket_id: string | null }>("SELECT id, ticket_id FROM sup_calls WHERE customer_id = ? AND status = 'callback'", input.customerId);
  if (waiting) return { callId: waiting.id, ticketId: waiting.ticket_id, again: true };
  let ticketId = input.ticketId ?? null;
  const now = nowIso();
  const body = `Please call me back on ${phone}.${input.note ? `\n${clean(input.note, 500)}` : ""}`;
  if (!ticketId) {
    const open = await get<{ id: string }>("SELECT id FROM sup_tickets WHERE customer_id = ? AND status NOT IN ('solved','closed') ORDER BY updated_at DESC LIMIT 1", input.customerId);
    ticketId = open?.id ?? null;
  }
  if (ticketId) await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'customer', ?, ?, 0, ?)", uid("smg_"), ticketId, input.customerId, body, now);
  else {
    const app = input.appId ? await get<{ queue_id: string | null }>("SELECT queue_id FROM sup_apps WHERE id = ?", input.appId) : null;
    ticketId = await sd.createTicketFromChannel({ subject: "Call-back request", body, customerId: input.customerId, channel: input.channel === "telegram" ? "telegram" : "web", appQueue: app?.queue_id ?? null, appId: input.appId ?? null });
  }
  const id = uid("scl_");
  await run("INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, direction, kind, status, consent, started_at, phone, ring_stage, app_id) VALUES (?, ?, ?, NULL, 'outbound', 'phone', 'callback', 1, ?, ?, 9, ?)", id, ticketId, input.customerId, now, phone, input.appId ?? null);
  await sd.activity(null, ticketId, "callback_requested", `Asked to be called on ${phone}`);
  const t = await get<{ assignee_id: string | null; queue_id: string | null; number: number }>("SELECT assignee_id, queue_id, number FROM sup_tickets WHERE id = ?", ticketId);
  const who = t?.assignee_id ? [t.assignee_id] : (await sd.availableAgents(t?.queue_id ?? null, undefined, { ignoreLimit: true })).map((a) => a.userId);
  if (who.length) await notify(who, { type: "assignment", title: `Call-back requested (#${t?.number ?? ""})`, body: phone, link: "/support?tab=calls", dedupeKey: `sup-cb-${id}` }, now);
  return { callId: id, ticketId, again: false };
}

export async function cancelCallback(user: AppUser, callId: string) {
  await sd.needAgent(user);
  const k = await get<{ status: string; ticket_id: string | null }>("SELECT status, ticket_id FROM sup_calls WHERE id = ?", callId);
  if (!k || k.status !== "callback") throw new WorkflowError("INVALID_STATE", "This call-back is no longer waiting.");
  await run("UPDATE sup_calls SET status = 'declined', agent_id = ?, ended_at = ? WHERE id = ?", user.id, nowIso(), callId);
  if (k.ticket_id) await sd.activity(user.id, k.ticket_id, "callback_closed", "Closed the call-back request without calling");
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type CallHistoryRow = {
  id: string;
  kind: string;
  direction: string;
  status: string;
  phone: string | null;
  startedAt: string;
  durationS: number | null;
  holdS: number;
  agent: string | null;
  customer: string | null;
  customerId: string | null;
  ticketId: string | null;
  number: number | null;
  recorded: boolean;
  notes: string | null;
  transferredTo: string | null;
  system: string | null;
};

// Agents see their own calls and their queues'; leads see every call. Filters: status, direction, kind, agent,
// customer, dates and a search (name, phone, ticket number).
export async function callHistory(user: AppUser, f: { status?: string | null; direction?: string | null; agentId?: string | null; customerId?: string | null; from?: string | null; to?: string | null; q?: string | null; limit?: number } = {}) {
  const cfg = await sd.needAgent(user);
  const lead = await sd.isLead(user, cfg);
  const where: string[] = ["k.kind <> 'staff'"];
  const args: (string | number)[] = [];
  if (!lead) {
    const qs = (await all<{ id: string; members: string }>("SELECT id, members FROM sup_queues WHERE active = 1")).filter((q) => parseJson<string[]>(q.members, []).includes(user.id)).map((q) => q.id);
    where.push(`(k.agent_id = ?${qs.length ? ` OR t.queue_id IN (${qs.map(() => "?").join(",")})` : ""})`);
    args.push(user.id, ...qs);
  }
  if (f.status === "missed") where.push("k.status IN ('missed','declined')");
  else if (f.status === "callback") where.push("k.status = 'callback'");
  else if (f.status === "answered") where.push("k.status IN ('ended','answered','transferred') AND k.answered_at IS NOT NULL");
  if (f.direction === "inbound" || f.direction === "outbound") (where.push("k.direction = ?"), args.push(f.direction));
  if (f.agentId) (where.push("k.agent_id = ?"), args.push(f.agentId));
  if (f.customerId) (where.push("k.customer_id = ?"), args.push(f.customerId));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) (where.push("k.started_at >= ?"), args.push(`${f.from}T00:00:00.000Z`));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) (where.push("k.started_at < ?"), args.push(new Date(Date.parse(`${f.to}T00:00:00.000Z`) + 864e5).toISOString()));
  const q = clean(f.q, 80);
  if (q) {
    const num = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : -1;
    where.push("(LOWER(c.name) LIKE ? OR k.phone LIKE ? OR c.phone LIKE ? OR t.number = ?)");
    args.push(`%${q.toLowerCase()}%`, `%${q}%`, `%${q}%`, num);
  }
  const rows = await all<{ id: string; kind: string; direction: string; status: string; phone: string | null; started_at: string; duration_s: number | null; hold_s: number; agent: string | null; customer: string | null; customer_id: string | null; ticket_id: string | null; number: number | null; recording_id: string | null; notes: string | null; xfer: string | null; cphone: string | null; system: string | null }>(
    `SELECT k.id, k.kind, k.direction, k.status, k.phone, k.started_at, k.duration_s, k.hold_s, u.name AS agent, c.name AS customer, k.customer_id, k.ticket_id, t.number, k.recording_id, k.notes, x.name AS xfer, c.phone AS cphone, a.name AS system
     FROM sup_calls k LEFT JOIN users u ON u.id = k.agent_id LEFT JOIN sup_customers c ON c.id = k.customer_id LEFT JOIN sup_tickets t ON t.id = k.ticket_id
     LEFT JOIN users x ON x.id = k.transfer_to LEFT JOIN sup_apps a ON a.id = COALESCE(k.app_id, t.app_id)
     WHERE ${where.join(" AND ")} ORDER BY k.started_at DESC LIMIT ${Math.min(500, Math.max(1, f.limit ?? 200))}`,
    ...args,
  );
  return rows.map<CallHistoryRow>((r) => ({
    id: r.id,
    kind: r.kind,
    direction: r.direction,
    status: r.status,
    phone: r.phone ?? r.cphone,
    startedAt: r.started_at,
    durationS: r.duration_s === null ? null : Number(r.duration_s),
    holdS: Number(r.hold_s ?? 0),
    agent: r.agent,
    customer: r.customer,
    customerId: r.customer_id,
    ticketId: r.ticket_id,
    number: r.number === null ? null : Number(r.number),
    recorded: !!r.recording_id,
    notes: r.notes,
    transferredTo: r.xfer,
    system: r.system,
  }));
}

// Totals for the top of the call center: today's calls, missed, waiting call-backs, average length and hold.
export async function callStats(user: AppUser) {
  const rows = await callHistory(user, { from: new Date().toISOString().slice(0, 10), limit: 500 });
  const talked = rows.filter((r) => r.durationS !== null && r.status !== "callback");
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const callbacks = (await callHistory(user, { status: "callback", limit: 500 })).length;
  return { today: rows.filter((r) => r.status !== "callback").length, missed: rows.filter((r) => r.status === "missed" || r.status === "declined").length, callbacks, avgTalkS: avg(talked.map((r) => r.durationS!)), avgHoldS: avg(talked.map((r) => r.holdS)) };
}

// ---------------------------------------------------------------------------
// Each system's call engine
// ---------------------------------------------------------------------------

export async function saveCallEngine(user: AppUser, appId: string, input: { engine: "browser" | "phone"; phone?: string | null }) {
  if (!sd.isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sets up connected systems.");
  const a = await get<{ name: string }>("SELECT name FROM sup_apps WHERE id = ?", appId);
  if (!a) throw new WorkflowError("NOT_FOUND", "Unknown system.");
  const engine = input.engine === "phone" ? "phone" : "browser";
  const phone = clean(input.phone, 40) || null;
  if (engine === "phone" && !(phone && /^\+?[\d\s-]{7,20}$/.test(phone))) throw new WorkflowError("VALIDATION", "Give the phone number customers call.");
  await run("UPDATE sup_apps SET call_engine = ?, call_phone = ? WHERE id = ?", engine, phone, appId);
  await audit({ actor: user }, { action: "support.system", summary: `${user.name} set ${a.name}'s calls to ${engine === "phone" ? `the phone number ${phone}` : "calls in the browser"}` });
}

export async function callEngineOf(appId: string) {
  const a = await get<{ call_engine: string | null; call_phone: string | null }>("SELECT call_engine, call_phone FROM sup_apps WHERE id = ?", appId);
  return { engine: (a?.call_engine === "phone" ? "phone" : "browser") as "browser" | "phone", phone: a?.call_phone ?? null };
}

// The widget's "Ask us to call you" (any engine).
export async function customerCallback(app: sd.AppFull, token: string, input: { phone?: string | null; ticketId?: string | null }) {
  await (await import("./connected-systems")).needChannel(app.id, "calls");
  const c = await sd.customerByToken(app, token);
  const phone = clean(input.phone, 40) || (await get<{ phone: string | null }>("SELECT phone FROM sup_customers WHERE id = ?", c.id))?.phone || "";
  const r = await requestCallback({ customerId: c.id, phone, appId: app.id, channel: "widget", ticketId: input.ticketId ?? null });
  if (clean(input.phone, 40)) await run("UPDATE sup_customers SET phone = COALESCE(phone, ?) WHERE id = ?", phone.replace(/[^\d+]/g, ""), c.id);
  return r;
}
