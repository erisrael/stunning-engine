// Customer support: setup, apps with keys and signed customers, queues with keyword routing, automatic assignment
// (online, under the limit, least busy and in turn, waiting tickets given out later), replies and notes, what the
// customer sees, rating, targets missed, auto close, calls (ring, answer, missed), recordings and monitoring.
import crypto from "node:crypto";
import { get, run, closeDb, nowIso } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const [abel, sara, liya, dawit] = [await by("abel@demo.local"), await by("sara@demo.local"), await by("liya@demo.local"), await by("dawit@demo.local")];

  // Setup.
  check("off by default", !(await sd.supportConfig()).enabled);
  check("only Admin switches it on", !!(await throws(() => sd.saveSupportConfig(abel, { enabled: true }))));
  await sd.saveSupportConfig(admin, { enabled: true, leads: [liya.id], ringSeconds: 30 });
  check("Liya leads support", await sd.isLead(liya));
  const qApp = await sd.saveQueue(liya, { name: "App and account", keywords: ["password", "login"], members: [abel.id, sara.id], strategy: "least_busy", slaFirstMin: 30, slaResolveMin: 240 });
  const qLessons = await sd.saveQueue(liya, { name: "Lessons", keywords: ["video", "lesson"], members: [sara.id], strategy: "round_robin" });
  check("agents can work, others cannot", (await sd.isAgent(abel)) && !(await sd.isAgent(dawit)));
  check("members only see the desk if they are agents", !!(await throws(() => sd.inbox(dawit, "mine"))));
  const app = await sd.saveApp(admin, { name: "Myseed App", origins: ["https://app.myseed.et"], queueId: qApp, verifyIdentity: true });
  check("an app gets a secret, shown once", !!app.secret);
  const appRow = (await sd.listApps(admin))[0]!;
  check("a refused web address", /may not use/.test((await throws(() => sd.appByKey(appRow.publicKey, "https://evil.example"))) ?? ""));
  const A = await sd.appByKey(appRow.publicKey, "https://app.myseed.et");
  check("an unsigned customer is refused", /signs its customers/.test((await throws(() => sd.identify(A, { id: "u-1", name: "Abebe" }))) ?? ""));
  check("a wrong signature is refused", /does not match/.test((await throws(() => sd.identify(A, { id: "u-1", name: "Abebe", hash: "0".repeat(64) }))) ?? ""));
  const hash = crypto.createHmac("sha256", app.secret!).update("u-1").digest("hex");
  const s1 = await sd.identify(A, { id: "u-1", name: "Abebe Kebede", email: "abebe@example.com", hash, meta: { grade: "9" } });
  check("a signed customer gets a token", !!s1.token && s1.customer.name === "Abebe Kebede");
  check("nobody online yet", !s1.online);
  check("a forged token is refused", !!(await throws(() => sd.customerTickets(A, `${s1.customer.id}.bad`))));

  // A ticket while nobody is online waits; leads are told.
  const t1 = await sd.customerCreateTicket(A, s1.token, { subject: "Cannot login", message: "I forgot my password" });
  let r1 = await get<{ queue_id: string; assignee_id: string | null; status: string; sla_first_due: string }>("SELECT queue_id, assignee_id, status, sla_first_due FROM sup_tickets WHERE id = ?", t1);
  check("routed by keyword to App and account", r1?.queue_id === qApp);
  check("waits unassigned while nobody is online", r1?.assignee_id === null && r1.status === "new");
  check("leads are told it waits", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE '%waits%'", liya.id)));
  check("first answer due in 30 minutes", Math.abs(Date.parse(r1!.sla_first_due) - Date.now() - 30 * 60e3) < 60e3);

  // Abel comes online: the waiting ticket is his.
  await sd.setAgentStatus(abel, "online");
  r1 = await get("SELECT queue_id, assignee_id, status, sla_first_due FROM sup_tickets WHERE id = ?", t1);
  check("the waiting ticket goes to the agent who comes online", r1?.assignee_id === abel.id && r1.status === "open");
  check("he is told", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE 'Ticket #% is yours'", abel.id)));
  await sd.setAgentStatus(sara, "online");
  const s2 = await sd.identify(A, { id: "u-2", name: "Hirut", hash: crypto.createHmac("sha256", app.secret!).update("u-2").digest("hex") });
  const t2 = await sd.customerCreateTicket(A, s2.token, { message: "My login code does not arrive" });
  check("least busy: the next goes to Sara", (await get<{ assignee_id: string }>("SELECT assignee_id FROM sup_tickets WHERE id = ?", t2))?.assignee_id === sara.id);
  await sd.setAgentLimit(liya, abel.id, 1);
  await sd.setAgentLimit(liya, sara.id, 1);
  const t3 = await sd.customerCreateTicket(A, s2.token, { message: "Password reset fails" });
  check("agents at their limit get no more", (await get<{ assignee_id: string | null }>("SELECT assignee_id FROM sup_tickets WHERE id = ?", t3))?.assignee_id === null);
  await sd.setAgentLimit(liya, abel.id, 10);
  check("the scheduled check gives it out", (await sd.supportChecks()).assigned >= 1 && (await get<{ assignee_id: string | null }>("SELECT assignee_id FROM sup_tickets WHERE id = ?", t3))?.assignee_id === abel.id);
  await run("UPDATE sup_agents SET last_seen_at = ? WHERE user_id = ?", new Date(Date.now() - 10 * 60e3).toISOString(), abel.id);
  check("an agent who closed the desk is not available", !(await sd.availableAgents(qApp)).some((a) => a.userId === abel.id));
  await sd.heartbeat(abel);

  // Replies, notes, what the customer sees.
  await sd.agentReply(abel, t1, { body: "Internal: check the SMS provider", internal: true });
  await sd.agentReply(abel, t1, { body: "Hi Abebe, I sent you a reset link.", status: "pending" });
  const seen = await sd.customerMessages(A, s1.token, t1);
  check("the customer sees the reply, not the note", seen.messages.some((m) => m.body.startsWith("Hi Abebe") && m.name === "Abel") && !seen.messages.some((m) => m.body.startsWith("Internal")));
  check("the first answer is recorded", !!(await get<{ first_response_at: string | null }>("SELECT first_response_at FROM sup_tickets WHERE id = ?", t1))?.first_response_at);
  check("another customer cannot read it", !!(await throws(() => sd.customerMessages(A, s2.token, t1))));
  await sd.customerReply(A, s1.token, t1, "Got it, thanks, it works");
  check("a customer reply brings a waiting ticket back to open", (await get<{ status: string }>("SELECT status FROM sup_tickets WHERE id = ?", t1))?.status === "open");
  check("rating before solved is refused", !!(await throws(() => sd.customerRate(A, s1.token, t1, 5))));
  await sd.setTicketStatus(abel, t1, "solved");
  await sd.customerRate(A, s1.token, t1, 5, "Quick help");
  check("rated", (await get<{ rating: number }>("SELECT rating FROM sup_tickets WHERE id = ?", t1))?.rating === 5);
  const lessonT = await sd.customerCreateTicket(A, s2.token, { message: "The lesson video does not play" });
  check("Lessons tickets go to the Lessons queue", (await get<{ queue_id: string }>("SELECT queue_id FROM sup_tickets WHERE id = ?", lessonT))?.queue_id === qLessons);
  check("Abel is not in Lessons: he cannot open it", !!(await throws(() => sd.ticketDetail(abel, lessonT))));
  check("a member gives a ticket to someone else only as a lead", !!(await throws(() => sd.assignTicket(abel, t3, sara.id))));
  await sd.assignTicket(liya, lessonT, sara.id);
  check("a lead assigns", (await get<{ assignee_id: string }>("SELECT assignee_id FROM sup_tickets WHERE id = ?", lessonT))?.assignee_id === sara.id);

  // Targets.
  await run("UPDATE sup_tickets SET sla_first_due = ?, first_response_at = NULL WHERE id = ?", new Date(Date.now() - 60e3).toISOString(), t3);
  const ch = await sd.supportChecks();
  check("a missed target marks it late and tells the agent and leads", ch.breached >= 1 && (await get<{ breached: number }>("SELECT breached FROM sup_tickets WHERE id = ?", t3))?.breached === 1 && !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE '%missed its target%'", liya.id)));
  check("late tickets have their view", (await sd.inbox(liya, "breached")).some((t) => t.id === t3));
  await run("UPDATE sup_tickets SET solved_at = ? WHERE id = ?", new Date(Date.now() - 30 * 864e5).toISOString(), t1);
  await sd.supportChecks();
  check("old solved tickets close by themselves", (await get<{ status: string }>("SELECT status FROM sup_tickets WHERE id = ?", t1))?.status === "closed");

  // Agent-opened ticket for a phone call, and a logged call.
  const tp = await sd.agentCreateTicket(abel, { customerName: "Meseret", phone: "+251911000000", subject: "Phone: subscription", body: "Called about renewing", channel: "phone" });
  check("an agent opens a ticket for a phone call", (await get<{ channel: string; assignee_id: string }>("SELECT channel, assignee_id FROM sup_tickets WHERE id = ?", tp))?.assignee_id === abel.id);
  await sd.logPhoneCall(abel, tp, { direction: "outbound", minutes: 4, notes: "Explained the renewal" });
  check("a phone call is logged", !!(await get("SELECT 1 AS x FROM sup_calls WHERE ticket_id = ? AND kind = 'phone' AND duration_s = 240", tp)));

  // Calls from the app.
  check("a recorded call needs consent", /Agree/.test((await throws(() => sd.customerStartCall(A, s2.token, { offer: "{}", consent: false }))) ?? ""));
  const call = await sd.customerStartCall(A, s2.token, { ticketId: t2, offer: '{"type":"offer","sdp":"x"}', consent: true });
  check("the call rings for the ticket's agent", (await sd.ringingFor(sara)).some((r) => r.id === call.callId) && !(await sd.ringingFor(abel)).some((r) => r.id === call.callId));
  await sd.answerCall(sara, call.callId, '{"type":"answer","sdp":"y"}');
  const polled = await sd.customerPollCall(A, s2.token, call.callId);
  check("the customer gets the answer and the agent's first name", polled.status === "answered" && polled.answer?.includes("answer") === true && polled.agent === "Sara");
  check("a second agent cannot answer it", !!(await throws(() => sd.answerCall(abel, call.callId, "{}"))));
  await run("UPDATE sup_calls SET answered_at = ? WHERE id = ?", new Date(Date.now() - 125e3).toISOString(), call.callId);
  await sd.customerEndCall(A, s2.token, call.callId);
  const ended = await get<{ status: string; duration_s: number }>("SELECT status, duration_s FROM sup_calls WHERE id = ?", call.callId);
  check("the call ends with its length", ended?.status === "ended" && ended.duration_s >= 124, ended);
  await sd.saveRecording(sara, call.callId, { mime: "audio/webm", data: new Uint8Array([26, 69, 223, 163, 1, 2, 3]) });
  const rec = await sd.readRecording(liya, call.callId);
  check("the recording is kept and the lead can listen", rec.data?.length === 7);
  check("other agents cannot listen", !!(await throws(() => sd.readRecording(abel, call.callId))));
  check("listening is logged", !!(await get("SELECT 1 AS x FROM sup_activity WHERE kind = 'recording_played' AND user_id = ?", liya.id)));
  const missed = await sd.customerStartCall(A, s1.token, { offer: '{"type":"offer"}', consent: true });
  await run("UPDATE sup_calls SET started_at = ? WHERE id = ?", new Date(Date.now() - 60e3).toISOString(), missed.callId);
  check("unanswered calls are missed", (await sd.customerPollCall(A, s1.token, missed.callId)).status === "missed");
  await sd.setAgentStatus(abel, "offline");
  await sd.setAgentStatus(sara, "offline");
  check("nobody online: the call is refused with the away message", !!(await throws(() => sd.customerStartCall(A, s1.token, { offer: "{}", consent: true }))));

  // Monitoring.
  const today = new Date().toISOString().slice(0, 10);
  const m = await sd.monitor(liya, { from: new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10), to: today });
  const ma = m.agents.find((a) => a.userId === abel.id);
  check("the monitor counts each agent's work", !!ma && ma.solved >= 1 && ma.replies >= 1 && ma.rating === 5 && ma.firstResponseMin !== null, ma);
  check("Sara's calls and minutes", (m.agents.find((a) => a.userId === sara.id)?.calls ?? 0) === 1);
  check("queues show what waits", m.queues.length === 2 && m.recordings.length === 1);
  check("agents cannot open the monitor", !!(await throws(() => sd.monitor(abel, { from: today, to: today }))));
  check("activity is logged", m.log.some((l) => l.kind === "assigned") && m.log.some((l) => l.kind === "status_online"));

  await sd.saveSupportConfig(admin, { enabled: false });
  check("switched off: apps are refused", !!(await throws(() => sd.appByKey(appRow.publicKey, null))));
  void nowIso;

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await closeDb();
});
