// Update 1.2, spec 14.2: customer support's configuration center. Every area is listed with its state; business
// hours and holidays answer conversations started while closed and say when support opens; escalation rules raise
// conversations by themselves (keywords, low ratings, missed targets); notifications can be turned off for the leads
// and on for customers (request updates); chat limits what customers may send.
process.env.MAIL_FAKE = "1";
import { closeDb, get, nowIso, run } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as C from "../../src/server/support-center";
import * as R from "../../src/server/support-requests";
import { getSettings, saveSetting } from "../../src/server/settings";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
// Addis Ababa wall time as an instant.
const at = (iso: string) => Date.parse(`${iso}+03:00`);
const notes = async (u: AppUser, like: string) => Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title LIKE ?", u.id, like))?.n ?? 0);

async function main() {
  const [admin, sara, liya] = [await by("admin@demo.local"), await by("sara@demo.local"), await by("liya@demo.local")];
  await sd.saveSupportConfig(admin, { enabled: true, leads: [liya.id] });
  const q = await sd.saveQueue(admin, { name: "General", members: [sara.id] });
  const app = await sd.saveApp(admin, { name: "Center App", origins: [], queueId: q });
  const A = await sd.appByKey((await sd.listApps(admin)).find((x) => x.id === app.id)!.publicKey, null);
  const s = await sd.identify(A, { id: "c-1", name: "Hana Girma" });

  // 1. The center.
  const areas = await C.configurationCenter(liya);
  check("the center lists all nineteen areas of the spec", areas.length === 19 && ["telegram-bot", "mini-app", "webrtc", "ivr", "holidays", "escalation", "data-retention", "integrations"].every((k) => areas.some((a) => a.key === k)), areas.map((a) => a.key));
  check("each area says where it is managed", areas.every((a) => a.href.startsWith("/")));
  check("an agent does not see it", /support leads/.test(await err(() => C.configurationCenter(sara))));
  check("nor change it", /support leads/.test(await err(() => C.saveCenterConfig(sara, { chat: { customerFiles: false, voiceNotes: true, maxFileMb: 10 } }))));

  // 2. Business hours and holidays.
  check("without hours set, support is always open", (await C.supportOpen(at("2026-11-21T23:00"))).open);
  const days = { mon: { open: "08:30", close: "17:30" }, tue: { open: "08:30", close: "17:30" }, wed: { open: "08:30", close: "17:30" }, thu: { open: "08:30", close: "17:30" }, fri: { open: "08:30", close: "17:30" }, sat: null, sun: null };
  check("closing before opening is refused", /close after it opens/.test(await err(() => C.saveCenterConfig(liya, { schedule: { on: true, days: { ...days, mon: { open: "17:00", close: "09:00" } }, holidays: [], companyHolidays: true, closedMessage: "x" } }))));
  check("a holiday must be a date", /not a date/.test(await err(() => C.saveCenterConfig(liya, { schedule: { on: true, days, holidays: [{ date: "soon", name: "x" }], companyHolidays: true, closedMessage: "x" } }))));
  await C.saveCenterConfig(liya, { schedule: { on: true, days, holidays: [{ date: "2026-11-25", name: "Support day off" }], companyHolidays: true, closedMessage: "We are closed right now." } });
  const set = await getSettings();
  await saveSetting("calendar", { ...set.calendar, holidays: [...set.calendar.holidays, { date: "2026-11-26", name: "Company holiday" }] }, admin.id);
  check("open on a weekday morning (Addis time)", (await C.supportOpen(at("2026-11-23T09:00"))).open);
  const sat = await C.supportOpen(at("2026-11-21T10:00"));
  check("closed on Saturday, opening Monday 08:30", !sat.open && sat.reason === "hours" && sat.nextOpen === "2026-11-23T08:30:00+03:00", sat);
  const eve = await C.supportOpen(at("2026-11-23T18:00"));
  check("after hours, opening the next morning", !eve.open && eve.nextOpen === "2026-11-24T08:30:00+03:00", eve);
  const hol = await C.supportOpen(at("2026-11-25T10:00"));
  check("closed on support's own holiday, named", !hol.open && hol.reason === "holiday" && hol.holiday === "Support day off" && hol.nextOpen === "2026-11-27T08:30:00+03:00", hol);
  check("and on the workspace calendar's holidays", (await C.supportOpen(at("2026-11-26T10:00"))).holiday === "Company holiday");
  await C.saveCenterConfig(liya, { schedule: { ...(await C.centerConfig()).schedule, companyHolidays: false } });
  check("unless the workspace holidays are left out", (await C.supportOpen(at("2026-11-26T10:00"))).open);
  const week = await sd.sessionFor(A, s.customer.id);
  check("the app gets the week and the coming holidays", !!week.schedule && week.schedule.days.sat === null && week.schedule.days.mon?.open === "08:30");
  // Closed all week: a new conversation is answered at once.
  await C.saveCenterConfig(liya, { schedule: { on: true, days: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }, holidays: [], companyHolidays: false, closedMessage: "We are closed right now." } });
  const t1 = await sd.customerCreateTicket(A, s.token, { message: "Hello, is anyone there?" });
  const auto = await get<{ body: string; internal: number }>("SELECT body, internal FROM sup_messages WHERE ticket_id = ? AND author_kind = 'system' ORDER BY created_at LIMIT 1", t1);
  check("a conversation started while closed is answered with the closed message", !!auto && auto.body.startsWith("We are closed right now.") && Number(auto.internal) === 0, auto);
  await C.saveCenterConfig(liya, { schedule: { ...(await C.centerConfig()).schedule, on: false } });
  const t2 = await sd.customerCreateTicket(A, s.token, { message: "Open now?" });
  check("while open, no automatic answer", !(await get("SELECT 1 AS x FROM sup_messages WHERE ticket_id = ? AND author_kind = 'system'", t2)));

  // 3. Escalation rules.
  await C.saveCenterConfig(liya, { escalation: { onBreach: true, lowRating: true, keywords: ["fraud", "ማጭበርበር", "no"] } });
  check("keywords keep whole words of three letters or more", (await C.centerConfig()).escalation.keywords.join() === "fraud,ማጭበርበር");
  const t3 = await sd.customerCreateTicket(A, s.token, { message: "I think this charge is fraud." });
  const e3 = await get<{ escalated_at: string | null; priority: string; escalation_note: string }>("SELECT escalated_at, priority, escalation_note FROM sup_tickets WHERE id = ?", t3);
  check("a keyword escalates a new conversation and raises it to high", !!e3?.escalated_at && e3.priority === "high" && /fraud/.test(e3.escalation_note), e3);
  check("the leads are told", (await notes(liya, `%escalated%`)) >= 1);
  const t4 = await sd.customerCreateTicket(A, s.token, { message: "A defraud-free question" });
  check("only whole words count", !(await get<{ escalated_at: string | null }>("SELECT escalated_at FROM sup_tickets WHERE id = ?", t4))?.escalated_at);
  await sd.customerReply(A, s.token, t4, "ይህ ማጭበርበር ነው");
  check("a keyword in a reply escalates too, in Amharic as well", !!(await get<{ escalated_at: string | null }>("SELECT escalated_at FROM sup_tickets WHERE id = ?", t4))?.escalated_at);
  await run("UPDATE sup_tickets SET status = 'solved', solved_at = ?, assignee_id = ? WHERE id = ?", nowIso(), sara.id, t2);
  await sd.customerRate(A, s.token, t2, 1, "Nobody helped");
  check("a rating of 1 escalates the conversation", /rated 1/.test((await get<{ escalation_note: string | null }>("SELECT escalation_note FROM sup_tickets WHERE id = ?", t2))?.escalation_note ?? ""));
  await run("UPDATE sup_tickets SET status = 'open', sla_first_due = ?, first_response_at = NULL WHERE id = ?", new Date(Date.now() - 3600e3).toISOString(), t1);
  await sd.supportChecks();
  check("a missed target escalates the conversation", /first answer target/.test((await get<{ escalation_note: string | null }>("SELECT escalation_note FROM sup_tickets WHERE id = ?", t1))?.escalation_note ?? ""));

  // 4. Notifications.
  const before = await notes(liya, "%missed its target%");
  await C.saveCenterConfig(liya, { notifications: { breachToLeads: false, waitingToLeads: false, requestUpdatesToCustomer: true } });
  const t5 = await sd.customerCreateTicket(A, s.token, { message: "Late one" });
  await run("UPDATE sup_tickets SET status = 'open', sla_first_due = ?, first_response_at = NULL, assignee_id = ? WHERE id = ?", new Date(Date.now() - 3600e3).toISOString(), sara.id, t5);
  await sd.supportChecks();
  check("with missed targets off, the leads are not told (the agent still is)", (await notes(liya, "%missed its target%")) === before && (await notes(sara, `%missed its target%`)) >= 1);
  await sd.setAgentStatus(sara, "offline");
  const waitBefore = await notes(liya, "%waits%");
  await sd.customerCreateTicket(A, s.token, { message: "Anyone?" });
  check("with waiting conversations off, the leads are not told", (await notes(liya, "%waits%")) === waitBefore);
  const dest = (await R.saveDestination(admin, { label: "Administration", kind: "admin" })).destinations.find((d) => d.label === "Administration")!;
  const rq = await R.createSupportRequest(admin, { type: "refund", title: "Refund", destinationId: dest.id, ticketId: t3 });
  await R.act(admin, rq.id, "submit");
  await R.act(admin, rq.id, "acknowledge");
  await R.act(admin, rq.id, "resolve", { text: "Refunded 300 ETB." });
  const told = (await sd.customerMessages(A, s.token, t3)).messages.map((m) => m.body);
  check("the customer is told of their request's progress in the conversation", told.some((b) => b.includes(`${rq.reference} is being worked on`)) && told.some((b) => b.includes("is resolved. Refunded 300 ETB.")), told);

  // 5. Chat.
  await C.saveCenterConfig(liya, { chat: { customerFiles: false, voiceNotes: true, maxFileMb: 1 } });
  const png = Buffer.alloc(100).toString("base64");
  check("with files off, a customer's file is refused", /Files are not taken/.test(await err(() => sd.customerUpload(A, s.token, t4, { name: "a.png", mime: "image/png", data: png }))));
  check("a voice note larger than the limit is refused", /larger than 1 MB/.test(await err(() => sd.customerUpload(A, s.token, t4, { name: "v.webm", mime: "audio/webm", data: Buffer.alloc(1.5 * 1024 * 1024).toString("base64") }))));
  check("a small voice note is taken", (await err(() => sd.customerUpload(A, s.token, t4, { name: "v.webm", mime: "audio/webm", data: png }))) === "");
  check("more than 10 MB cannot be allowed", /1 to 10 MB/.test(await err(() => C.saveCenterConfig(liya, { chat: { customerFiles: true, voiceNotes: true, maxFileMb: 50 } }))));
  check("changes are audited", !!(await get("SELECT 1 AS x FROM audit_events WHERE action = 'support.center'")));

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FAIL crashed", e);
  process.exit(1);
});
