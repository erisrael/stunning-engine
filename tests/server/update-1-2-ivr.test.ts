// Update 1.2, Phase 9: the IVR engine (the spec's default flow, drafts, publishing, versions, switching on, validation,
// test calls, the caller's session and voice messages), call queues (hours, size, overflow, routing strategies,
// caller priority, waiting limits, abandoned and missed calls, the live board, wait estimates) and Call Records
// (who sees what, notes and outcomes, legal hold, recordings in pieces, the access log and the purge).
process.env.MAIL_FAKE = "1";
import { all, closeDb, get, nowIso, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ivr from "../../src/server/support-ivr";
import * as Q from "../../src/server/support-queues";
import * as R from "../../src/server/call-records";
import { defaultIvrGraph, validateIvr, type IvrGraph } from "../../src/lib/support-ivr";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 700)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
const OFFER = '{"type":"offer","sdp":"v=0"}';
const ANSWER = '{"type":"answer","sdp":"v=0"}';
const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
// A Tuesday at 10:00 and at 21:00 in Addis Ababa (UTC+3).
const OPEN = "2026-11-17T07:00:00.000Z";
const NIGHT = "2026-11-17T18:00:00.000Z";

async function main() {
  const [admin, sara, abel, dawit] = [await by("admin@demo.local"), await by("sara@demo.local"), await by("abel@demo.local"), await by("dawit@demo.local")];
  await sd.saveSupportConfig(admin, { enabled: true, leads: [], recordCalls: true, ringSeconds: 60, callEscalateSec: 10 });
  const general = await sd.saveQueue(admin, { name: "General support", members: [sara.id, abel.id], strategy: "least_busy" });
  const payment = await sd.saveQueue(admin, { name: "Payment support", keywords: ["payment"], members: [abel.id], strategy: "least_busy" });
  await sd.saveApp(admin, { name: "MySeed Academy", origins: [], queueId: general });
  const A = await sd.appByKey((await sd.listApps(admin))[0]!.publicKey, null);
  await sd.setAgentStatus(sara, "online");
  await sd.setAgentStatus(abel, "online");

  // 1. Flows: the spec's default, validation, drafts, publishing and switching on.
  const flows = await ivr.listFlows(admin);
  check("the spec's default flow is there, switched off and unpublished", flows.length === 1 && flows[0]!.name === "Main line" && !flows[0]!.active && !flows[0]!.publishedVersion);
  const d = await ivr.flowDetail(admin, flows[0]!.id);
  check("the default flow passes validation", d.check.errors.length === 0, d.check.errors);
  check("it welcomes, asks for a language (1 Amharic, 2 English) and offers the six choices", d.graph.nodes.find((n) => n.id === "language")?.options?.map((o) => `${o.key}${o.lang}`).join() === "1am,2en" && d.graph.nodes.find((n) => n.id === "menu")?.options?.map((o) => o.key).join() === "1,2,3,4,5,0");
  check("an agent cannot change the phone menu", /support leads/.test(await err(() => ivr.listFlows(dawit))));
  check("a flow cannot be switched on before it is published", /Publish the flow/.test(await err(() => ivr.setFlowActive(admin, flows[0]!.id, true))));
  const broken: IvrGraph = { ...defaultIvrGraph(), nodes: defaultIvrGraph().nodes.map((n) => (n.id === "welcome" ? { ...n, next: { next: null } } : n)) };
  check("validation names an unconnected output", validateIvr(broken).errors.some((e) => e.nodeId === "welcome" && /connect/.test(e.message)));
  const loop: IvrGraph = { start: "a", settings: defaultIvrGraph().settings, nodes: [{ id: "a", type: "tts", x: 0, y: 0, text: { en: "Hi" }, next: { next: "b" } }, { id: "b", type: "tts", x: 0, y: 0, text: { en: "Again" }, next: { next: "a" } }, { id: "c", type: "end", x: 0, y: 0, next: {} }] };
  const lc = validateIvr(loop);
  check("a loop that never asks anything is an error, an unreachable node a warning", lc.errors.some((e) => /loop/.test(e.message)) && lc.warnings.some((w) => w.nodeId === "c"));
  await ivr.saveFlowDraft(admin, { id: flows[0]!.id, name: "Main line", graph: broken });
  check("a draft with errors saves but does not publish", /Fix the flow first/.test(await err(() => ivr.publishFlow(admin, flows[0]!.id))));
  await ivr.saveFlowDraft(admin, { id: flows[0]!.id, name: "Main line", graph: defaultIvrGraph() });
  const v1 = await ivr.publishFlow(admin, flows[0]!.id, "First version");
  await ivr.setFlowActive(admin, flows[0]!.id, true);
  check("published as version 1 and switched on", v1 === 1 && (await ivr.listFlows(admin))[0]!.active);

  // 2. Test calls through the draft.
  const t1 = await ivr.testIvr(admin, defaultIvrGraph(), ["2", "3"], { now: OPEN });
  const last = t1.steps.at(-1)!.screen;
  check("a test call: welcome and the language question come first", t1.steps[0]!.screen.say.some((s) => s.text.startsWith("Welcome to MySeed")) && t1.steps[0]!.screen.ask?.options.length === 2);
  check("English, then 3 (payment) in open hours goes to the payment queue with its topic", last.done?.action === "queue" && last.done.queueId === payment && last.done.category === "payment", last);
  const am = await ivr.testIvr(admin, defaultIvrGraph(), ["1"], { now: OPEN });
  check("Amharic switches the rest of the menu to Amharic", am.steps[1]!.screen.lang === "am" && /ለመለያ/.test(am.steps[1]!.screen.say.map((s) => s.text).join(" ")));
  const night = await ivr.testIvr(admin, defaultIvrGraph(), ["2", "1"], { now: NIGHT });
  check("after hours the caller is offered a voice message or a call-back", night.steps[1]!.screen.say.some((s) => /closed/.test(s.text)) && night.steps.at(-1)!.screen.done?.action === "voicemail", night.steps.map((s) => s.screen.done ?? s.screen.ask?.options.map((o) => o.key)));
  const wrong = await ivr.testIvr(admin, defaultIvrGraph(), ["2", "9"], { now: OPEN });
  check("a wrong key says so and asks again", wrong.steps.at(-1)!.screen.say[0]?.text.startsWith("Sorry") && !!wrong.steps.at(-1)!.screen.ask);
  const giveUp = await ivr.testIvr(admin, defaultIvrGraph(), ["2", "#timeout", "#timeout", "#timeout", "#timeout"], { now: OPEN });
  check("after the retry limit the menu's fallback is used (general support)", giveUp.steps.at(-1)!.screen.done?.queueId === general, giveUp.steps.at(-1)!.screen);

  // 3. A real caller through the menu into the queue.
  const hana = await sd.identify(A, { id: "c-hana", name: "Hana Girma", phone: "+251911000111" });
  // Hours checks use the real clock here, so the test flow has no hours node.
  const simple: IvrGraph = { ...defaultIvrGraph(), nodes: defaultIvrGraph().nodes.map((n) => (n.id === "language" ? { ...n, next: { ...n.next, "opt:1": "menu", "opt:2": "menu" } } : n)) };
  await ivr.saveFlowDraft(admin, { id: flows[0]!.id, name: "Main line", graph: simple });
  await ivr.publishFlow(admin, flows[0]!.id);
  const s1 = await ivr.customerStartIvr(A, hana.token, { lang: "en" });
  check("tapping Call starts the active menu", !!s1?.sessionId && s1.ask?.kind === "choice");
  const s2 = await ivr.customerIvrInput(A, hana.token, s1!.sessionId, "2");
  const s3 = await ivr.customerIvrInput(A, hana.token, s1!.sessionId, "3");
  check("the caller's choices route them to Payment support", s3.done?.action === "queue" && s3.done.queueId === payment && !!s2.ask);
  check("a finished menu takes no more keys", /has ended/.test(await err(() => ivr.customerIvrInput(A, hana.token, s1!.sessionId, "1"))));
  const call = await sd.customerStartCall(A, hana.token, { offer: OFFER, consent: true, ivrSession: s1!.sessionId });
  const k = await get<{ queue_id: string; category: string; agent_id: string | null; ivr_session: string }>("SELECT queue_id, category, agent_id, ivr_session FROM sup_calls WHERE id = ?", call.callId);
  check("the call waits in Payment support with the topic, offered first to its agent", k?.queue_id === payment && k.category === "payment" && k.agent_id === abel.id && k.ivr_session === s1!.sessionId, k);
  check("the menu session cannot start a second call", /has ended/.test(await err(() => sd.customerStartCall(A, hana.token, { offer: OFFER, consent: true, ivrSession: s1!.sessionId }))));
  const stats = await ivr.ivrStats(admin, { from: nowIso().slice(0, 10), to: nowIso().slice(0, 10) });
  check("IVR reports count the choices pressed", stats.choices.some((c) => c.choice.startsWith("3: Payment") && c.n >= 1), stats.choices);
  await ivr.setFlowActive(admin, flows[0]!.id, false);
  check("with no active menu, Call goes straight to the queue", (await ivr.customerStartIvr(A, hana.token, {})) === null);

  // 4. One live call per caller; queue events; answering.
  const again = await sd.customerStartCall(A, hana.token, { offer: OFFER, consent: true });
  check("calling again (a refresh) ends the earlier ringing call", (await get<{ status: string }>("SELECT status FROM sup_calls WHERE id = ?", call.callId))?.status === "missed");
  await sd.answerCall(sara, again.callId, ANSWER).catch(() => null);
  const ans = await get<{ agent_id: string | null; status: string; wait_s: number | null }>("SELECT agent_id, status, wait_s FROM sup_calls WHERE id = ?", again.callId);
  const offeredTo = (await get<{ agent_id: string | null }>("SELECT agent_id FROM sup_queue_events WHERE call_id = ? AND kind = 'joined'", again.callId))?.agent_id;
  if (offeredTo === sara.id) check("the offered agent answers and the wait is recorded", ans?.status === "answered" && ans.wait_s !== null);
  else {
    await sd.answerCall(abel, again.callId, ANSWER);
    check("the offered agent answers and the wait is recorded", (await get<{ status: string; wait_s: number | null }>("SELECT status, wait_s FROM sup_calls WHERE id = ?", again.callId))?.wait_s !== null);
  }
  const onCall = (await get<{ agent_id: string }>("SELECT agent_id FROM sup_calls WHERE id = ?", again.callId))!.agent_id;
  const liya = await sd.identify(A, { id: "c-liya", name: "Liya" });
  const c2 = await sd.customerStartCall(A, liya.token, { offer: OFFER, consent: true });
  const offered2 = (await get<{ agent_id: string | null }>("SELECT agent_id FROM sup_calls WHERE id = ?", c2.callId))?.agent_id;
  check("an agent on a call is not offered the next one", offered2 !== onCall && offered2 !== null, { offered2, onCall });
  const onCallUser = onCall === sara.id ? sara : abel;
  check("and queue calls do not ring for them meanwhile", !(await sd.ringingFor(onCallUser)).some((r) => r.id === c2.callId));
  await sd.customerEndCall(A, liya.token, c2.callId);
  check("hanging up while waiting is logged as abandoned", !!(await get("SELECT 1 AS x FROM sup_queue_events WHERE call_id = ? AND kind = 'abandoned'", c2.callId)));
  await sd.agentEndCall(onCallUser, again.callId, null);

  // 5. Queue settings: hours, size, overflow, waiting limit, strategies, priority.
  await Q.saveQueueSettings(admin, general, { activeHours: { days: [], from: "08:00", to: "17:00" } }).catch(() => null);
  check("open hours need days and times", /open days/.test(await err(() => Q.saveQueueSettings(admin, general, { activeHours: { days: [], from: "08:00", to: "17:00" } }))));
  check("a queue cannot overflow into itself", /itself/.test(await err(() => Q.saveQueueSettings(admin, general, { overflowQueue: general }))));
  const today = new Date(Date.now() + 3 * 3600e3).getUTCDay();
  await Q.saveQueueSettings(admin, general, { activeHours: { days: [(today + 1) % 7], from: "08:00", to: "09:00" } });
  const meron = await sd.identify(A, { id: "c-meron", name: "Meron" });
  check("a closed queue refuses the call with the call-back offer", /closed now/.test(await err(() => sd.customerStartCall(A, meron.token, { offer: OFFER, consent: true }))));
  await Q.saveQueueSettings(admin, general, { overflowQueue: payment });
  const ov = await sd.customerStartCall(A, meron.token, { offer: OFFER, consent: true });
  const ovRow = await get<{ queue_id: string; ring_queue: string }>("SELECT queue_id, ring_queue FROM sup_calls WHERE id = ?", ov.callId);
  check("with an overflow queue, the call goes there instead", ovRow?.queue_id === general && ovRow.ring_queue === payment, ovRow);
  await sd.customerEndCall(A, meron.token, ov.callId);
  await Q.saveQueueSettings(admin, general, { activeHours: null, overflowQueue: null, maxSize: 1 });
  const w1 = await sd.customerStartCall(A, (await sd.identify(A, { id: "c-w1", name: "W1" })).token, { offer: OFFER, consent: true });
  check("a full queue refuses the next caller", /line is full/.test(await err(async () => sd.customerStartCall(A, (await sd.identify(A, { id: "c-w2", name: "W2" })).token, { offer: OFFER, consent: true }))));
  await Q.saveQueueSettings(admin, general, { maxSize: null, maxWaitS: 15, overflowQueue: payment });
  await run("UPDATE sup_calls SET queued_at = ?, started_at = ? WHERE id = ?", ago(30), ago(30), w1.callId);
  await sd.ringingFor(sara);
  const w1r = await get<{ status: string; ring_queue: string | null }>("SELECT status, ring_queue FROM sup_calls WHERE id = ?", w1.callId);
  check("past the queue's maximum wait the call moves to the overflow queue", w1r?.status === "ringing" && w1r.ring_queue === payment, w1r);
  await run("UPDATE sup_calls SET queued_at = ?, started_at = ? WHERE id = ?", ago(120), ago(150), w1.callId);
  await sd.ringingFor(sara);
  check("past the overflow queue's wait too, the call is missed and logged", (await get<{ status: string }>("SELECT status FROM sup_calls WHERE id = ?", w1.callId))?.status === "missed" && !!(await get("SELECT 1 AS x FROM sup_queue_events WHERE call_id = ? AND kind = 'timeout'", w1.callId)));
  await Q.saveQueueSettings(admin, general, { maxWaitS: null, overflowQueue: null });
  await sd.saveQueue(admin, { id: general, name: "General support", members: [abel.id, sara.id], strategy: "priority" });
  check("agent priority offers the first listed agent first", (await Q.pickAgents(general, { forCall: true })).agents[0] === abel.id);
  await sd.saveQueue(admin, { id: general, name: "General support", members: [sara.id, abel.id], strategy: "skills" });
  await Q.saveQueueSettings(admin, general, { skills: ["amharic"] });
  await Q.setAgentSkills(admin, abel.id, ["Amharic", "billing"]);
  check("skill-based routing offers only agents with the skill", (await Q.pickAgents(general, { forCall: true })).agents.join() === abel.id);
  await sd.saveQueue(admin, { id: general, name: "General support", members: [sara.id, abel.id], strategy: "longest_idle" });
  await run("UPDATE sup_tickets SET assigned_at = ? WHERE assignee_id IN (?, ?)", ago(7200), sara.id, abel.id);
  await run("UPDATE sup_calls SET ended_at = ?, answered_at = ? WHERE agent_id = ?", ago(3600), ago(3700), abel.id);
  await run("UPDATE sup_calls SET ended_at = ?, answered_at = ? WHERE agent_id = ?", ago(5), ago(60), sara.id);
  check("longest idle offers the agent idle longest", (await Q.pickAgents(general)).agents[0] === abel.id, await Q.pickAgents(general));
  await sd.saveQueue(admin, { id: general, name: "General support", members: [sara.id, abel.id], strategy: "manual" });
  check("manual assignment offers nobody (the call rings for all)", (await Q.pickAgents(general)).agents.length === 0);
  await sd.saveQueue(admin, { id: general, name: "General support", members: [sara.id, abel.id], strategy: "least_busy" });
  await Q.saveQueueSettings(admin, general, { priorityRules: [{ when: "verified", boost: 5 }, { when: "category", value: "payment", boost: 2 }] });
  await run("UPDATE sup_customers SET verified = 1 WHERE external_id = 'c-meron'");
  const pr = await Q.callerPriority(general, { customerId: (await get<{ id: string }>("SELECT id FROM sup_customers WHERE external_id = 'c-meron'"))!.id, category: "payment" });
  check("caller priority adds up the matching rules", pr === 7, pr);
  const wrapQ = await Q.saveQueueSettings(admin, general, { wrapUpS: 60 }).then(() => Q.busyAgents(60));
  check("an agent who just ended a call is wrapping up", wrapQ.wrap.has(onCall), [...wrapQ.wrap]);

  // 6. The board and wait estimates.
  const board = await Q.queueBoard(admin);
  const g = board.queues.find((q) => q.id === general)!;
  const pq = board.queues.find((q) => q.id === payment)!;
  // The missed call had moved to Payment support, so it counts there; General shows the overflow.
  check("the board counts abandoned, overflowed and missed calls and agents by state", g.abandoned >= 1 && g.overflowed >= 1 && pq.missed >= 1 && board.agents.length >= 2, { g, pq });
  check("only leads see the board", /support leads/.test(await err(() => Q.queueBoard(dawit))));
  const fresh = await sd.customerStartCall(A, (await sd.identify(A, { id: "c-e1", name: "E1" })).token, { offer: OFFER, consent: true });
  const p0 = await sd.customerPollCall(A, (await sd.identify(A, { id: "c-e1", name: "E1" })).token, fresh.callId);
  check("no wait estimate before ten answered calls", p0.status === "ringing" && (p0 as { estimateSec: number | null }).estimateSec === null && (p0 as { position: number }).position >= 1);
  for (let i = 0; i < 10; i++) await run("INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, direction, kind, status, consent, started_at, answered_at, ended_at, duration_s, wait_s, queue_id) VALUES (?, NULL, NULL, ?, 'inbound', 'web', 'ended', 1, ?, ?, ?, 120, ?, ?)", `scl_est${i}`, sara.id, ago(3600), ago(3500), ago(3400), 30 + i, general);
  const p1 = (await sd.customerPollCall(A, (await sd.identify(A, { id: "c-e1", name: "E1" })).token, fresh.callId)) as { estimateSec: number | null };
  check("with ten answered calls the caller sees an estimate", (p1.estimateSec ?? 0) >= 30, p1);

  // 7. Call records.
  const recs = await R.listCallRecords(admin, {});
  check("Admin sees every call in Call Records", recs.all && recs.rows.length >= 5);
  const mine = await R.listCallRecords(sara, {});
  check("an agent sees only their own calls", !mine.all && mine.rows.every((r) => r.agentId === sara.id), mine.rows.map((r) => r.agentId));
  const paid = (await R.listCallRecords(admin, { queueId: payment })).rows;
  check("records filter by queue", paid.length >= 1 && paid.every((r) => r.queueId === payment));
  const target = again.callId;
  const owner = onCallUser;
  await R.updateCallRecord(owner, target, { notes: "Reset the password", tags: ["Login", "login"], outcome: "resolved" });
  const det = await R.callRecordDetail(owner, target);
  check("the agent adds notes, tags and the outcome", det.record.notes === "Reset the password" && det.record.tags.join() === "login" && det.record.outcome === "resolved");
  check("the record shows the lifecycle and the queue steps", det.lifecycle.length >= 3 && det.queue.some((e) => e.kind === "joined"));
  const other = owner.id === sara.id ? abel : sara;
  check("another agent cannot open it", /own calls/.test(await err(() => R.callRecordDetail(other, target))));
  check("an unknown outcome is refused", /from the list/.test(await err(() => R.updateCallRecord(owner, target, { outcome: "great" }))));

  // Recording in pieces, finishing, listening, downloading, legal hold and the purge.
  await R.saveRecordingChunk(owner, target, 0, { mime: "audio/webm;codecs=opus", data: new Uint8Array([1, 2, 3]) });
  await R.saveRecordingChunk(owner, target, 1, { mime: "audio/webm", data: new Uint8Array([4, 5]) });
  check("pieces arrive while the call runs", (await get<{ recording_status: string }>("SELECT recording_status FROM sup_calls WHERE id = ?", target))?.recording_status === "recording");
  check("only the agent of the call sends pieces", /Not your call/.test(await err(() => R.saveRecordingChunk(other, target, 2, { mime: "audio/webm", data: new Uint8Array([9]) }))));
  await run("UPDATE sup_recording_chunks SET at = ? WHERE call_id = ?", ago(300), target);
  check("a recording whose tab closed is finished by the scheduled checks", (await R.finishStaleRecordings()) === 1);
  const rec = await get<{ recording_id: string; recording_size: number; recording_status: string }>("SELECT recording_id, recording_size, recording_status FROM sup_calls WHERE id = ?", target);
  check("the pieces join into one file", !!rec?.recording_id && Number(rec.recording_size) === 5 && rec.recording_status === "saved", rec);
  const heard = await sd.readRecording(owner, target);
  check("the agent can listen to their own call", heard.data?.length === 5);
  check("but cannot download it", /download/.test(await err(() => sd.readRecording(owner, target, true))));
  await sd.readRecording(admin, target, true);
  const log = (await R.callRecordDetail(admin, target)).access;
  check("each listen and download is in the access log", log.some((a) => a.action === "play") && log.some((a) => a.action === "download"));
  await sd.saveSupportConfig(admin, { recordingViewers: [dawit.id] });
  check("a manager Admin names sees every call record", (await R.listCallRecords(dawit, {})).all);
  check("a legal hold needs a reason", /Say why/.test(await err(() => R.setLegalHold(admin, target, true, ""))));
  check("only leads put calls under legal hold", /legal hold/.test(await err(() => R.setLegalHold(dawit, target, true, "Complaint"))));
  await R.setLegalHold(admin, target, true, "Customer complaint");
  await run("UPDATE sup_calls SET started_at = ? WHERE id = ?", ago(200 * 86400), target);
  await sd.supportChecks();
  check("the purge keeps a recording under legal hold", !!(await get<{ recording_id: string | null }>("SELECT recording_id FROM sup_calls WHERE id = ?", target))?.recording_id);
  await R.setLegalHold(admin, target, false);
  await sd.supportChecks();
  check("and removes it once the hold is lifted", (await get<{ recording_status: string }>("SELECT recording_status FROM sup_calls WHERE id = ?", target))?.recording_status === "purged");
  const csv = await R.exportCallRecords(admin, {});
  check("call records export with the spec's fields", csv.split("\n")[0]!.includes("Wait (s)") && csv.includes("Reset the password"));

  // 8. Voice messages and call-backs at a chosen time.
  const vm = await ivr.customerVoicemail(A, hana.token, { mime: "audio/webm", data: Buffer.from("voice").toString("base64") });
  check("a voice message lands on the caller's conversation as audio", !!(await get("SELECT 1 AS x FROM sup_files WHERE id = ? AND mime = 'audio/webm'", vm.fileId)));
  check("a voice message must be audio", /audio recording/.test(await err(() => ivr.customerVoicemail(A, hana.token, { mime: "image/png", data: "eA==" }))));
  const { customerCallback } = await import("../../src/server/support-calls");
  const later = new Date(Date.now() + 3 * 3600e3).toISOString();
  const cb = await customerCallback(A, (await sd.identify(A, { id: "c-cb", name: "CB", phone: "+251911222333" })).token, { at: later });
  check("a call-back can be booked for a later time", (await get<{ scheduled_for: string }>("SELECT scheduled_for FROM sup_calls WHERE id = ?", cb.callId))?.scheduled_for === later);
  check("but not weeks ahead", /two weeks/.test(await err(async () => customerCallback(A, (await sd.identify(A, { id: "c-cb2", name: "CB2", phone: "+251911222334" })).token, { at: new Date(Date.now() + 30 * 864e5).toISOString() }))));
  await run("UPDATE sup_calls SET scheduled_for = ? WHERE id = ?", ago(60), cb.callId);
  await sd.supportChecks();
  check("when it falls due the agents are told", (await all("SELECT 1 AS x FROM notifications WHERE dedupe_key = ?", `sup-cb-due-${cb.callId}`)).length >= 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FAIL crashed", e);
  process.exit(1);
});
