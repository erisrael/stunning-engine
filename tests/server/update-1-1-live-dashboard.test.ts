// Update 1.1, phase 16: the live admin dashboard. Presence from the open app; each person On call, Busy, Online,
// Away or Offline with session time and workload; the desk's live numbers (tickets, chats, calls, first response,
// SMS health, traffic per system), all read from the database; Admin only.
import { closeDb, get, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as L from "../../src/server/live-dashboard";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
const ago = (min: number) => new Date(Date.now() - min * 60e3).toISOString();
let n = 9000;

async function main() {
  const admin = await by("admin@demo.local");
  const sara = await by("sara@demo.local");
  const dawit = await by("dawit@demo.local");
  const abel = await by("abel@demo.local");
  const liya = await by("liya@demo.local");
  const hana = await by("hana@demo.local");
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  const q = await sd.saveQueue(admin, { name: "Academy", keywords: [], members: [sara.id, liya.id], strategy: "least_busy" });
  const app = await sd.saveApp(admin, { name: "MySeed Academy", origins: [], queueId: q });
  await sd.saveApp(admin, { name: "Parents app", origins: [], queueId: q });

  check("only Admin sees it", /Only Admin/.test((await err(() => L.liveRoster(sara))) ?? "") && /Only Admin/.test((await err(() => L.liveMetrics(dawit))) ?? ""));

  // Presence.
  await L.pingPresence(dawit, true, ago(30));
  await L.pingPresence(dawit, true);
  let d = await get<{ online_since: string; presence: string }>("SELECT online_since, presence FROM users WHERE id = ?", dawit.id);
  check("a ping after a long gap starts a new stretch", Date.now() - Date.parse(d!.online_since) < 5000 && d!.presence === "visible");
  await run("UPDATE users SET online_since = ? WHERE id = ?", ago(95), dawit.id);
  await L.pingPresence(dawit, true);
  d = await get("SELECT online_since, presence FROM users WHERE id = ?", dawit.id);
  check("pings a minute apart keep it", Math.abs(Date.parse(d!.online_since) - Date.parse(ago(95))) < 5000);
  await L.pingPresence(abel, false); // app open, page hidden
  await L.pingPresence(hana, true, ago(8)); // last seen 8 minutes ago

  // Support agents: Sara online at her limit (Busy); Liya in a call.
  await sd.setAgentStatus(sara, "online");
  await sd.setAgentStatus(liya, "online");
  await L.pingPresence(sara, true);
  await L.pingPresence(liya, true);
  await run("UPDATE sup_agents SET max_open = 2 WHERE user_id = ?", sara.id);
  const cust = uid("cus_");
  await run("INSERT INTO sup_customers (id, app_id, external_id, name, created_at, last_seen_at) VALUES (?, ?, 'x1', 'Hana Girma', ?, ?)", cust, app.id, ago(60), ago(1));
  const ticket = async (o: { assignee?: string | null; status?: string; created: string; first?: string | null; appId?: string | null; channel?: string }) => {
    const id = uid("tk_");
    await run(
      "INSERT INTO sup_tickets (id, number, app_id, customer_id, subject, status, channel, assignee_id, created_at, updated_at, first_response_at) VALUES (?, ?, ?, ?, 'Help', ?, ?, ?, ?, ?, ?)",
      id, n++, o.appId === undefined ? app.id : o.appId, cust, o.status ?? "open", o.channel ?? "widget", o.assignee ?? null, o.created, o.created, o.first ?? null,
    );
    return id;
  };
  const t1 = await ticket({ assignee: sara.id, created: ago(50), first: ago(40) });
  await ticket({ assignee: sara.id, created: ago(30), first: ago(28) });
  await ticket({ assignee: null, status: "new", created: ago(45) });
  await ticket({ assignee: null, status: "new", created: ago(5), appId: null, channel: "email" });
  await ticket({ assignee: liya.id, status: "solved", created: ago(20), first: ago(18) });
  await run("UPDATE sup_tickets SET solved_at = ? WHERE status = 'solved'", ago(10));
  await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'customer', ?, 'still there?', 0, ?)", uid("smg_"), t1, cust, ago(2));
  await run("INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, status, started_at, answered_at) VALUES (?, ?, ?, ?, 'answered', ?, ?)", uid("call_"), t1, cust, liya.id, ago(7), ago(6));
  await run("INSERT INTO sup_calls (id, ticket_id, customer_id, status, started_at) VALUES (?, ?, ?, 'ringing', ?)", uid("call_"), t1, cust, ago(0.2));
  await run("INSERT INTO sup_calls (id, ticket_id, customer_id, status, started_at) VALUES (?, ?, ?, 'missed', ?)", uid("call_"), t1, cust, ago(25));

  const r = await L.liveRoster(admin);
  const st = (u: { id: string }) => r.rows.find((x) => x.id === u.id);
  check("in a call is On call, with whom and for how long", st(liya)?.status === "on_call" && st(liya)?.onCallWith === "Hana Girma" && st(liya)?.sessionMin === 6, st(liya));
  check("an agent at their ticket limit is Busy", st(sara)?.status === "busy" && st(sara)?.openTickets === 2 && st(sara)?.maxOpen === 2, st(sara));
  check("app in view is Online with the time since they came", st(dawit)?.status === "online" && st(dawit)?.sessionMin === 95, st(dawit));
  check("app open but hidden is Away", st(abel)?.status === "away");
  check("last seen 8 minutes ago is Away", st(hana)?.status === "away");
  check("not seen is Offline", st(await by("meron@demo.local"))?.status === "offline" && st(await by("meron@demo.local"))?.sessionMin === null);
  check("on call first, then busy, online, away, offline", r.rows[0]?.status === "on_call" && r.rows[1]?.status === "busy" && r.rows.at(-1)?.status === "offline");
  check("counts per status", r.counts.on_call === 1 && r.counts.busy === 1 && r.counts.online === 1 && r.counts.away === 2, r.counts);
  await sd.setAgentStatus(sara, "away");
  check("an agent who chose Away is Away", (await L.liveRoster(admin)).rows.find((x) => x.id === sara.id)?.status === "away");

  // Numbers.
  const m = await L.liveMetrics(admin);
  check("open tickets and those waiting for an agent", m.tickets.open === 4 && m.tickets.waiting === 2 && m.tickets.oldestWaitMin === 45, m.tickets);
  check("active chats: the customer wrote in the last 15 minutes", m.chats.active === 1);
  check("calls now, ringing and missed", m.calls.now === 1 && m.calls.ringing === 1 && m.calls.missedToday >= 1, m.calls);
  check("first response today, from the real times", m.firstResponseMin === 5, m.firstResponseMin);
  check("tickets still waiting for a first reply", m.tickets.awaitingFirst === 2);
  check("no SMS is said plainly", m.sms.total === 0 && m.sms.rate === null);
  const sms = (status: string, error: string | null = null) => run("INSERT INTO sms_messages (id, to_phone, status, error, created_at, updated_at) VALUES (?, '+251911000000', ?, ?, ?, ?)", uid("sms_"), status, error, ago(30), ago(29));
  for (let i = 0; i < 7; i++) await sms("delivered");
  await sms("sent");
  await sms("failed", "Insufficient credit");
  await sms("failed", "Invalid number");
  await sms("queued");
  await run("INSERT INTO sms_messages (id, to_phone, status, created_at, updated_at) VALUES (?, '+251911000000', 'failed', ?, ?)", uid("sms_"), ago(3000), ago(3000));
  const m2 = await L.liveMetrics(admin);
  check("SMS health over the last day", m2.sms.total === 11 && m2.sms.delivered === 7 && m2.sms.failed === 2 && m2.sms.queued === 1 && m2.sms.rate === 80, m2.sms);
  check("with the last failure's reason", !!m2.sms.lastError && /credit|number/.test(m2.sms.lastError));
  const academy = m2.traffic.find((t) => t.name === "MySeed Academy");
  check("traffic per system today", academy?.created === 4 && academy.messages === 1 && academy.open === 3, m2.traffic);
  check("systems without traffic are listed too", m2.traffic.some((t) => t.name === "Parents app" && t.created === 0));
  check("conversations without a system are counted apart", m2.traffic.some((t) => t.id === null && t.created === 1 && t.open === 1));

  const both = await L.liveDashboard(admin);
  check("one update carries both", both.roster.rows.length > 0 && !!both.metrics.at);

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
