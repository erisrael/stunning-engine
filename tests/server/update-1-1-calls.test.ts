// Update 1.1, phase 14: the call center. Hold with its time, cold transfer (the caller's browser rings the new
// agent only), a colleague brought into the call (a conference leg that ends with the call), ringing that widens
// from the ticket's agent to the queue and the overflow queue, calling a customer in the app, phone calls with the
// number, call-backs from the widget and the Telegram bot, each system's call engine, and the call history.
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as sc from "../../src/server/support-calls";
import * as ch from "../../src/server/support-channels";
import * as cs from "../../src/server/connected-systems";

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
const OFFER = '{"type":"offer","sdp":"v=0"}';
const ANSWER = '{"type":"answer","sdp":"v=0"}';
const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();

async function main() {
  const admin = await by("admin@demo.local");
  const sara = await by("sara@demo.local");
  const abel = await by("abel@demo.local");
  const dawit = await by("dawit@demo.local");
  await sd.saveSupportConfig(admin, { enabled: true, leads: [], recordCalls: false, ringSeconds: 60, callEscalateSec: 10 });
  const qA = await sd.saveQueue(admin, { name: "Academy", keywords: [], members: [sara.id], strategy: "least_busy" });
  const qOver = await sd.saveQueue(admin, { name: "Overflow", keywords: [], members: [abel.id], strategy: "least_busy" });
  const app = await sd.saveApp(admin, { name: "MySeed Academy", origins: [], queueId: qA });
  const A = await sd.appByKey((await sd.listApps(admin))[0]!.publicKey, null);
  await sd.setAgentStatus(sara, "online");
  await sd.setAgentStatus(abel, "online");
  const hana = await sd.identify(A, { id: "c-hana", name: "Hana Girma", phone: "+251911000111" });

  // Hold.
  const c1 = await sd.customerStartCall(A, hana.token, { offer: OFFER, consent: true });
  check("the call rings for the queue", (await sd.ringingFor(sara)).some((r) => r.id === c1.callId));
  check("not for an agent outside the queue", !(await sd.ringingFor(abel)).some((r) => r.id === c1.callId));
  await sd.answerCall(sara, c1.callId, ANSWER);
  check("only the agent of the call can hold it", !!(await err(() => sc.holdCall(abel, c1.callId, true))));
  await sc.holdCall(sara, c1.callId, true);
  check("the caller sees they are on hold", (await sd.customerPollCall(A, hana.token, c1.callId)).onHold === true);
  await run("UPDATE sup_calls SET hold_since = ? WHERE id = ?", ago(30), c1.callId);
  await sc.holdCall(sara, c1.callId, false);
  const held = await get<{ hold_s: number; on_hold: number }>("SELECT hold_s, on_hold FROM sup_calls WHERE id = ?", c1.callId);
  check("time on hold is kept", Number(held?.hold_s) >= 29 && !Number(held?.on_hold), held);
  check("the agent sees it is no longer on hold", (await sd.agentPollCall(sara, c1.callId)).onHold === false);

  // Conference: Sara brings Abel in; Abel answers; ending the call ends his leg.
  await sd.saveQueue(admin, { id: qA, name: "Academy", keywords: [], members: [sara.id, abel.id], strategy: "least_busy" });
  check("colleagues online are offered", (await sc.transferTargets(sara)).some((t) => t.id === abel.id) && !(await sc.transferTargets(sara)).some((t) => t.id === sara.id));
  const leg = await sc.inviteToCall(sara, c1.callId, abel.id, OFFER);
  const ringAbel = (await sd.ringingFor(abel)).find((r) => r.id === leg.legId);
  check("the invite rings for the colleague, saying who asks", ringAbel?.kind === "staff" && ringAbel.host === sara.name, ringAbel);
  check("not for anyone else", !(await sd.ringingFor(sara)).some((r) => r.id === leg.legId));
  check("one colleague at a time", /already/.test((await err(() => sc.inviteToCall(sara, c1.callId, abel.id, OFFER))) ?? ""));
  await sd.answerCall(abel, leg.legId, ANSWER);
  const hostView = await sd.agentPollCall(sara, leg.legId);
  check("the agent's browser gets the colleague's answer", hostView.status === "answered" && hostView.answer === ANSWER);
  check("the call lists the colleague", (await sd.agentPollCall(sara, c1.callId)).legs.some((l) => l.id === leg.legId && l.status === "answered"));
  const t1 = (await get<{ assignee_id: string }>("SELECT assignee_id FROM sup_tickets WHERE id = ?", c1.ticketId))!;
  check("joining does not take the ticket", t1.assignee_id === sara.id);

  // Warm transfer: hand over to Abel after talking together.
  await sc.transferCall(sara, c1.callId, abel.id, "Wants a refund for grade 6");
  const after = await get<{ status: string; transfer_to: string }>("SELECT status, transfer_to FROM sup_calls WHERE id = ?", c1.callId);
  check("the call ends as transferred", after?.status === "transferred" && after.transfer_to === abel.id, after);
  check("the conference leg ends with it", (await get<{ status: string }>("SELECT status FROM sup_calls WHERE id = ?", leg.legId))?.status === "ended");
  check("the ticket becomes the new agent's", (await get<{ assignee_id: string }>("SELECT assignee_id FROM sup_tickets WHERE id = ?", c1.ticketId))?.assignee_id === abel.id);
  check("the note is kept for them", !!(await get("SELECT id FROM sup_messages WHERE ticket_id = ? AND internal = 1 AND body LIKE '%refund%'", c1.ticketId)));
  const poll = await sd.customerPollCall(A, hana.token, c1.callId);
  check("the caller is told where they go", poll.status === "transferred" && poll.transferTo === "Abel", poll);
  check("only Hana can follow the transfer", !!(await err(async () => sd.customerStartCall(A, (await sd.identify(A, { id: "c-x", name: "X" })).token, { offer: OFFER, consent: true, transferFrom: c1.callId }))));
  const c2 = await sd.customerStartCall(A, hana.token, { offer: OFFER, consent: true, transferFrom: c1.callId });
  const again = await sd.customerStartCall(A, hana.token, { offer: OFFER, consent: true, transferFrom: c1.callId });
  check("the reconnect is the same call if sent twice", again.callId === c2.callId);
  check("it rings only for the new agent", (await sd.ringingFor(abel)).some((r) => r.id === c2.callId && r.transferred === 1) && !(await sd.ringingFor(sara)).some((r) => r.id === c2.callId));
  await run("UPDATE sup_calls SET started_at = ? WHERE id = ?", ago(25), c2.callId);
  await sd.ringingFor(abel);
  check("a transferred call does not widen to the queue", (await get<{ agent_id: string }>("SELECT agent_id FROM sup_calls WHERE id = ?", c2.callId))?.agent_id === abel.id);
  await sd.answerCall(abel, c2.callId, ANSWER);
  check("cold transfer to someone offline is refused", /not online/.test((await err(() => sc.transferCall(abel, c2.callId, dawit.id))) ?? ""));
  await sd.agentEndCall(abel, c2.callId, "Refund explained");

  // Ringing widens: the ticket's agent, then the queue, then the overflow queue.
  await sd.saveSupportConfig(admin, { callOverflowQueue: qOver });
  await sd.saveQueue(admin, { id: qA, name: "Academy", keywords: [], members: [sara.id], strategy: "least_busy" });
  const liya = await sd.identify(A, { id: "c-liya", name: "Liya" });
  const tk = await sd.customerCreateTicket(A, liya.token, { subject: "Login", message: "I cannot log in" });
  await run("UPDATE sup_tickets SET assignee_id = ? WHERE id = ?", sara.id, tk);
  const c3 = await sd.customerStartCall(A, liya.token, { ticketId: tk, offer: OFFER, consent: true });
  check("first it rings for the ticket's own agent", (await get<{ agent_id: string }>("SELECT agent_id FROM sup_calls WHERE id = ?", c3.callId))?.agent_id === sara.id);
  await run("UPDATE sup_calls SET started_at = ? WHERE id = ?", ago(12), c3.callId);
  await sd.ringingFor(sara);
  const s1 = await get<{ agent_id: string | null; ring_stage: number }>("SELECT agent_id, ring_stage FROM sup_calls WHERE id = ?", c3.callId);
  check("after the wait it rings for the whole queue", s1?.agent_id === null && Number(s1.ring_stage) === 1, s1);
  check("the overflow agent does not hear it yet", !(await sd.ringingFor(abel)).some((r) => r.id === c3.callId));
  await run("UPDATE sup_calls SET started_at = ? WHERE id = ?", ago(22), c3.callId);
  check("then the overflow queue hears it", (await sd.ringingFor(abel)).some((r) => r.id === c3.callId));
  await run("UPDATE sup_calls SET started_at = ? WHERE id = ?", ago(61), c3.callId);
  await sd.ringingFor(abel);
  check("unanswered, it is missed", (await get<{ status: string }>("SELECT status FROM sup_calls WHERE id = ?", c3.callId))?.status === "missed");
  await sd.saveSupportConfig(admin, { callOverflowQueue: null });

  // Calling the customer in the app.
  const info = await sc.dialInfo(sara, tk);
  check("the customer with the app open can be called in the app", info.inApp && info.online, info);
  await run("UPDATE sup_customers SET last_seen_at = ? WHERE id = ?", ago(120), liya.customer.id);
  check("not when the app is closed", /does not have the app open/.test((await err(() => sc.dialCustomer(sara, tk, OFFER))) ?? ""));
  const inc0 = await sc.customerIncoming(A, liya.token);
  check("no incoming call yet", inc0.call === null);
  const out = await sc.dialCustomer(sara, tk, OFFER);
  check("the agent's own outgoing call never rings in the desk", !(await sd.ringingFor(sara)).some((r) => r.id === out.callId));
  const inc = await sc.customerIncoming(A, liya.token);
  check("the widget sees the agent calling", inc.call?.id === out.callId && inc.call.agent === "Sara" && inc.call.offer === OFFER, inc);
  check("an agent cannot answer an outgoing call", /ringing for the customer/.test((await err(() => sd.answerCall(abel, out.callId, ANSWER))) ?? ""));
  await sc.customerAnswer(A, liya.token, out.callId, { answer: ANSWER, consent: true });
  const op = await sd.agentPollCall(sara, out.callId);
  check("the agent gets the customer's answer", op.status === "answered" && op.answer === ANSWER);
  await sc.holdCall(sara, out.callId, true);
  check("an outgoing call can be held too", (await sd.customerPollCall(A, liya.token, out.callId)).onHold === true);
  await sd.agentEndCall(sara, out.callId, null);
  const out2 = await sc.dialCustomer(sara, tk, OFFER);
  await sc.customerDecline(A, liya.token, out2.callId);
  check("the customer can decline", (await sd.agentPollCall(sara, out2.callId)).status === "declined");

  // A phone call from the dialer, with notes.
  check("a bad number is refused", /phone number/.test((await err(() => sc.startPhoneCall(sara, { phone: "12" }))) ?? ""));
  const ph = await sc.startPhoneCall(sara, { phone: "+251 911-000-111" });
  const prow = await get<{ customer_id: string; phone: string; status: string }>("SELECT customer_id, phone, status FROM sup_calls WHERE id = ?", ph.callId);
  check("dialling a known number finds the customer", prow?.customer_id === hana.customer.id && prow.phone === "+251911000111" && prow.status === "answered", prow);
  await run("UPDATE sup_calls SET answered_at = ? WHERE id = ?", ago(90), ph.callId);
  await sd.agentEndCall(sara, ph.callId, "Explained the refund steps");
  const pend = await get<{ duration_s: number; notes: string }>("SELECT duration_s, notes FROM sup_calls WHERE id = ?", ph.callId);
  check("its length and notes are kept", Number(pend?.duration_s) >= 89 && pend?.notes === "Explained the refund steps", pend);

  // Call-backs: from the widget, and from the Telegram bot (asking for the number first).
  const cb = await sc.customerCallback(A, liya.token, { phone: "0911222333" });
  check("the widget's call-back request waits in the call center", (await get<{ status: string }>("SELECT status FROM sup_calls WHERE id = ?", cb.callId))?.status === "callback");
  check("asking twice keeps one request", (await sc.customerCallback(A, liya.token, {})).callId === cb.callId);
  check("the callback is on the customer's ticket", cb.ticketId === tk);
  const took = await sc.startPhoneCall(sara, { callbackId: cb.callId });
  check("calling it back takes it", took.phone === "0911222333" && (await get<{ status: string; agent_id: string }>("SELECT status, agent_id FROM sup_calls WHERE id = ?", cb.callId))?.agent_id === sara.id);
  check("nobody else can take it then", /Someone else/.test((await err(() => sc.startPhoneCall(abel, { callbackId: cb.callId }))) ?? ""));
  await sd.agentEndCall(sara, cb.callId, "Called back");

  const posts: { url: string; body: Record<string, unknown> }[] = [];
  ch.setTelegramPoster(async (url, body) => (posts.push({ url, body: body as Record<string, unknown> }), { ok: true, result: { username: "academy_help_bot" } }));
  await ch.connectSystemBot(admin, app.id, "888111:AAcallCenterBotTokenForTests_q", "https://cm.example");
  const secret = (await get<{ tg_secret: string }>("SELECT tg_secret FROM sup_apps WHERE id = ?", app.id))!.tg_secret;
  await ch.telegramUpdate(secret, secret, { message: { message_id: 1, text: "/start", chat: { id: 7001, type: "private" }, from: { id: 7001, first_name: "Meron" } } });
  const kb = (p?: { body: Record<string, unknown> }) => ((p?.body.reply_markup as { inline_keyboard?: { callback_data?: string }[][] } | undefined)?.inline_keyboard ?? []).flat();
  check("the bot menu has Call me back", kb(posts.at(-1)).some((b) => b.callback_data === "cb"));
  await ch.telegramUpdate(secret, secret, { callback_query: { id: "q1", data: "cb", from: { id: 7001 }, message: { chat: { id: 7001, type: "private" } } } });
  check("without a number it asks to share it", posts.some((p) => String(p.body.text).includes("Share the phone number")));
  await ch.telegramUpdate(secret, secret, { message: { message_id: 2, chat: { id: 7001, type: "private" }, from: { id: 7001 }, contact: { phone_number: "251922333444", user_id: 7001 } } });
  const tgcb = await get<{ id: string; phone: string; app_id: string; ticket_id: string }>("SELECT k.id, k.phone, k.app_id, k.ticket_id FROM sup_calls k JOIN sup_customers c ON c.id = k.customer_id WHERE c.external_id = 'tg:7001' AND k.status = 'callback'");
  check("sharing it makes the call-back for that system", tgcb?.phone === "+251922333444" && tgcb.app_id === app.id, tgcb);
  check("the customer is told we will call", posts.some((p) => String(p.body.text).includes("We will call you on +251922333444")));
  await cs.saveSystem(admin, app.id, { channels: { calls: false } });
  posts.length = 0;
  await ch.telegramUpdate(secret, secret, { message: { message_id: 3, text: "/start", chat: { id: 7001, type: "private" }, from: { id: 7001 } } });
  check("with calls off the button is gone", !kb(posts.at(-1)).some((b) => b.callback_data === "cb"));
  await cs.saveSystem(admin, app.id, { channels: { calls: true } });
  await sc.cancelCallback(sara, tgcb!.id);
  check("a call-back can be closed without calling", (await get<{ status: string }>("SELECT status FROM sup_calls WHERE id = ?", tgcb!.id))?.status === "declined");

  // The system's call engine.
  check("members cannot change it", !!(await err(() => sc.saveCallEngine(sara, app.id, { engine: "phone", phone: "+251116000000" }))));
  check("a phone engine needs the number", /phone number/.test((await err(() => sc.saveCallEngine(admin, app.id, { engine: "phone" }))) ?? ""));
  await sc.saveCallEngine(admin, app.id, { engine: "phone", phone: "+251116000000" });
  const sess = await sd.identify(A, { id: "c-hana", name: "Hana Girma" });
  check("the widget is told to show the number", sess.callEngine.engine === "phone" && sess.callEngine.phone === "+251116000000", sess.callEngine);
  check("and the agent is told to call by phone", (await sc.dialInfo(sara, tk)).inApp === false);
  await sc.saveCallEngine(admin, app.id, { engine: "browser" });

  // History.
  const hist = await sc.callHistory(admin, {});
  check("the history lists calls without conference legs", hist.length >= 6 && !hist.some((h) => h.kind === "staff"), hist.length);
  const tr = hist.find((h) => h.id === c1.callId);
  check("a transferred call shows to whom and its hold time", tr?.status === "transferred" && tr.transferredTo === abel.name && tr.holdS >= 29, tr);
  check("filter: missed", (await sc.callHistory(admin, { status: "missed" })).every((h) => h.status === "missed" || h.status === "declined"));
  check("filter: outbound", (await sc.callHistory(admin, { direction: "outbound" })).every((h) => h.direction === "outbound"));
  check("search by phone", (await sc.callHistory(admin, { q: "911000111" })).some((h) => h.id === ph.callId));
  check("filter by customer", (await sc.callHistory(admin, { customerId: hana.customer.id })).every((h) => h.customer === "Hana Girma"));
  check("an agent sees their own and their queues' calls", (await sc.callHistory(abel, {})).every((h) => h.agent === abel.name || h.agent === null || h.agent === sara.name));
  check("non-agents cannot see calls", !!(await err(() => sc.callHistory(dawit, {}))));
  const st = await sc.callStats(admin);
  check("today's totals", st.today >= 6 && st.missed >= 2 && st.avgTalkS > 0, st);

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
