// The live admin dashboard (Update 1.1 phase 16): who is working right now and how the desk is doing, read fresh from
// the database every few seconds (no stored or made-up numbers).
//
// Presence: the open app reports every minute, and when its page is hidden or shown again (pingPresence). From that
// and the call and support tables, each person is
//   On call  - in a support call now;
//   Busy     - a support agent at or over their open-ticket limit;
//   Online   - the app was in view within the last 2 minutes;
//   Away     - the app is open but hidden, the agent chose Away, or last seen 2 to 15 minutes ago;
//   Offline  - otherwise.
import { all, get, nowIso, run } from "./db";
import { can, type AppUser } from "./users";
import { WorkflowError } from "./workflow";

export const ONLINE_MS = 2 * 60e3;
export const AWAY_MS = 15 * 60e3;
// A gap longer than this starts a new stretch of presence (session time).
const GAP_MS = 10 * 60e3;

export type LiveStatus = "on_call" | "busy" | "online" | "away" | "offline";
export const STATUS_ORDER: LiveStatus[] = ["on_call", "busy", "online", "away", "offline"];

// The app is open: visible says whether its page is in view.
export async function pingPresence(user: AppUser, visible: boolean, now = nowIso()) {
  const r = await get<{ last_active_at: string | null; online_since: string | null }>("SELECT last_active_at, online_since FROM users WHERE id = ?", user.id);
  const gap = !r?.last_active_at || Date.parse(now) - Date.parse(r.last_active_at) > GAP_MS;
  await run("UPDATE users SET last_active_at = ?, presence = ?, online_since = ? WHERE id = ?", now, visible ? "visible" : "hidden", gap || !r?.online_since ? now : r.online_since, user.id);
}

function admin(user: AppUser) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees the live dashboard.");
}

type Row = { id: string; name: string; title: string | null; last_active_at: string | null; presence: string | null; online_since: string | null };

export async function liveRoster(user: AppUser, now = Date.now()) {
  admin(user);
  const people = await all<Row>("SELECT id, name, title, last_active_at, presence, online_since FROM users WHERE active = 1 AND deleted_at IS NULL ORDER BY name");
  const map = <T,>(rows: (T & { k: string })[]) => new Map(rows.map((r) => [r.k, r]));
  const calls = map(await all<{ k: string; since: string; customer: string | null }>("SELECT k.agent_id AS k, MIN(COALESCE(k.answered_at, k.started_at)) AS since, MAX(c.name) AS customer FROM sup_calls k LEFT JOIN sup_customers c ON c.id = k.customer_id WHERE k.status = 'answered' AND k.agent_id IS NOT NULL GROUP BY k.agent_id"));
  const agents = map(await all<{ k: string; status: string; max_open: number; last_seen_at: string | null }>("SELECT user_id AS k, status, max_open, last_seen_at FROM sup_agents"));
  const tickets = map(await all<{ k: string; n: number }>("SELECT assignee_id AS k, COUNT(*) AS n FROM sup_tickets WHERE assignee_id IS NOT NULL AND status IN ('new','open','pending','on_hold') GROUP BY assignee_id"));
  const work = map(
    await all<{ k: string; n: number }>("SELECT a.owner_id AS k, COUNT(*) AS n FROM stage_attempts a JOIN items i ON i.current_attempt_id = a.id WHERE i.lifecycle = 'in_production' AND a.owner_id IS NOT NULL GROUP BY a.owner_id").catch(() => []),
  );
  const rows = people.map((p) => {
    const seenMs = p.last_active_at ? now - Date.parse(p.last_active_at) : Infinity;
    const call = calls.get(p.id);
    const ag = agents.get(p.id);
    const open = Number(tickets.get(p.id)?.n ?? 0);
    const items = Number(work.get(p.id)?.n ?? 0);
    const maxOpen = ag ? Number(ag.max_open ?? 10) : null;
    let status: LiveStatus = "offline";
    if (call) status = "on_call";
    else if (seenMs <= AWAY_MS || (ag?.status === "online" && ag.last_seen_at && now - Date.parse(ag.last_seen_at) <= ONLINE_MS)) {
      const away = ag?.status === "away" || p.presence === "hidden" || seenMs > ONLINE_MS;
      if (!away && maxOpen !== null && ag?.status === "online" && open >= maxOpen) status = "busy";
      else status = away ? "away" : "online";
    }
    const since = status === "on_call" ? call!.since : status === "offline" ? null : p.online_since;
    return {
      id: p.id,
      name: p.name,
      title: p.title,
      status,
      since,
      sessionMin: since ? Math.max(0, Math.round((now - Date.parse(since)) / 60e3)) : null,
      lastActive: p.last_active_at,
      onCallWith: call?.customer ?? null,
      agent: !!ag,
      agentStatus: (ag?.status as "online" | "away" | "offline" | undefined) ?? null,
      openTickets: open,
      maxOpen,
      workItems: items,
    };
  });
  rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<LiveStatus, number>;
  return { rows, counts };
}

const num = async (sql: string, ...a: (string | number)[]) => Number((await get<{ n: number | null }>(sql, ...a))?.n ?? 0);

export async function liveMetrics(user: AppUser, now = new Date()) {
  admin(user);
  // Today in the workspace's zone (Addis Ababa, UTC+3).
  const dayStart = new Date(Date.parse(new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 10) + "T00:00:00.000Z") - 3 * 3600e3).toISOString();
  const nowS = now.toISOString();
  const recent = new Date(now.getTime() - 15 * 60e3).toISOString();
  const day = new Date(now.getTime() - 864e5).toISOString();

  const open = await num("SELECT COUNT(*) AS n FROM sup_tickets WHERE status IN ('new','open','pending','on_hold')");
  const waiting = await get<{ n: number; oldest: string | null }>("SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM sup_tickets WHERE assignee_id IS NULL AND status IN ('new','open')");
  const createdToday = await num("SELECT COUNT(*) AS n FROM sup_tickets WHERE created_at >= ?", dayStart);
  const solvedToday = await num("SELECT COUNT(*) AS n FROM sup_tickets WHERE solved_at >= ?", dayStart);
  // A chat is active while the customer has written in the last 15 minutes and it is not solved.
  const activeChats = await num("SELECT COUNT(DISTINCT m.ticket_id) AS n FROM sup_messages m JOIN sup_tickets t ON t.id = m.ticket_id WHERE m.author_kind = 'customer' AND m.created_at >= ? AND t.status NOT IN ('solved','closed')", recent);
  const firsts = await all<{ c: string; f: string }>("SELECT created_at AS c, first_response_at AS f FROM sup_tickets WHERE created_at >= ? AND first_response_at IS NOT NULL", dayStart);
  const firstResponseMin = firsts.length ? Math.round(firsts.reduce((t, x) => t + (Date.parse(x.f) - Date.parse(x.c)) / 60e3, 0) / firsts.length) : null;
  const awaitingFirst = await num("SELECT COUNT(*) AS n FROM sup_tickets WHERE first_response_at IS NULL AND status IN ('new','open')");

  const callsNow = await num("SELECT COUNT(*) AS n FROM sup_calls WHERE status = 'answered' AND parent_id IS NULL");
  const ringing = await num("SELECT COUNT(*) AS n FROM sup_calls WHERE status = 'ringing'");
  const callsToday = await num("SELECT COUNT(*) AS n FROM sup_calls WHERE started_at >= ? AND parent_id IS NULL", dayStart);
  const missedToday = await num("SELECT COUNT(*) AS n FROM sup_calls WHERE started_at >= ? AND status = 'missed'", dayStart);
  const callbacks = await num("SELECT COUNT(*) AS n FROM sup_calls WHERE status = 'callback'");

  const sms = await all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM sms_messages WHERE created_at >= ? GROUP BY status", day).catch(() => []);
  const smsBy = Object.fromEntries(sms.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
  const smsTotal = Object.values(smsBy).reduce((a, b) => a + b, 0);
  const smsDone = (smsBy.delivered ?? 0) + (smsBy.sent ?? 0);
  const smsFailed = (smsBy.failed ?? 0) + (smsBy.undelivered ?? 0) + (smsBy.rejected ?? 0);
  const smsRate = smsDone + smsFailed ? Math.round((smsDone / (smsDone + smsFailed)) * 100) : null;
  const lastFail = await get<{ error: string | null; updated_at: string }>("SELECT error, updated_at FROM sms_messages WHERE status = 'failed' AND created_at >= ? ORDER BY updated_at DESC LIMIT 1", day).catch(() => null);

  // Traffic per connected system today (and conversations that came in without one).
  const systems = await all<{ id: string | null; name: string | null; created: number; messages: number; open: number }>(
    `SELECT a.id, a.name,
       (SELECT COUNT(*) FROM sup_tickets t WHERE t.app_id = a.id AND t.created_at >= ?) AS created,
       (SELECT COUNT(*) FROM sup_messages m JOIN sup_tickets t ON t.id = m.ticket_id WHERE t.app_id = a.id AND m.created_at >= ? AND m.author_kind = 'customer') AS messages,
       (SELECT COUNT(*) FROM sup_tickets t WHERE t.app_id = a.id AND t.status IN ('new','open','pending','on_hold')) AS open
     FROM sup_apps a ORDER BY a.name`,
    dayStart,
    dayStart,
  );
  const other = {
    created: await num("SELECT COUNT(*) AS n FROM sup_tickets WHERE app_id IS NULL AND created_at >= ?", dayStart),
    messages: await num("SELECT COUNT(*) AS n FROM sup_messages m JOIN sup_tickets t ON t.id = m.ticket_id WHERE t.app_id IS NULL AND m.created_at >= ? AND m.author_kind = 'customer'", dayStart),
    open: await num("SELECT COUNT(*) AS n FROM sup_tickets WHERE app_id IS NULL AND status IN ('new','open','pending','on_hold')"),
  };
  const traffic = [
    ...systems.map((s) => ({ id: s.id, name: s.name ?? "System", created: Number(s.created), messages: Number(s.messages), open: Number(s.open) })),
    ...(other.created || other.messages || other.open ? [{ id: null, name: "Help center, email and other", ...other }] : []),
  ];

  return {
    at: nowS,
    tickets: { open, waiting: Number(waiting?.n ?? 0), oldestWaitMin: waiting?.oldest ? Math.round((now.getTime() - Date.parse(waiting.oldest)) / 60e3) : null, createdToday, solvedToday, awaitingFirst },
    chats: { active: activeChats },
    firstResponseMin,
    calls: { now: callsNow, ringing, today: callsToday, missedToday, callbacks },
    sms: { total: smsTotal, delivered: smsBy.delivered ?? 0, sent: smsBy.sent ?? 0, queued: smsBy.queued ?? 0, failed: smsFailed, rate: smsRate, lastError: lastFail?.error ?? null, lastErrorAt: lastFail?.updated_at ?? null },
    traffic,
  };
}

// Both, for one live update.
export async function liveDashboard(user: AppUser) {
  const [roster, metrics] = await Promise.all([liveRoster(user), liveMetrics(user)]);
  return { roster, metrics };
}
