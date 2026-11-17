// Update 1.2, Phase 8: one call lifecycle kept by the database (initiated, ringing, accepted, connecting, connected,
// on hold, completed, missed, failed...), media states reported by the browsers, and the pre-call checks in order:
// the customer can be reached (the open app, or the bot for a Telegram customer whose app is closed), the agent may
// call, the agent is available. A Telegram customer gets the bot's call notice with a button to answer.
process.env.MAIL_FAKE = "1";
import { all, closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ch from "../../src/server/support-channels";
import * as K from "../../src/server/support-calls";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const phases = async (id: string) => (await all<{ phase: string }>("SELECT phase FROM sup_call_events WHERE call_id = ? ORDER BY id", id)).map((r) => r.phase);

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const [admin, abel] = [await by("admin@demo.local"), await by("abel@demo.local")];
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  const q = await sd.saveQueue(admin, { name: "General", members: [abel.id] });
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  ch.setTelegramPoster(async (url, body) => (posts.push({ url, body: body as Record<string, unknown> }), { ok: true, result: { username: "help_bot" } }));
  await ch.connectTelegram(admin, "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", "https://cm.myseed.et");
  const customer = async (ext: string, appSeen: string | null) => {
    const id = uid("cus_");
    await run("INSERT INTO sup_customers (id, app_id, external_id, name, created_at, app_seen_at, last_seen_at) VALUES (?, NULL, ?, 'Hana', ?, ?, ?)", id, ext, nowIso(), appSeen, nowIso());
    const t = await sd.createTicketFromChannel({ subject: "Call me", body: "Please call", customerId: id, channel: "telegram", appQueue: q });
    await run("UPDATE sup_tickets SET assignee_id = ? WHERE id = ?", abel.id, t);
    return { id, t };
  };
  const OFFER = JSON.stringify({ type: "offer", sdp: "v=0" });

  // 1. Pre-call checks.
  const open = await customer("tg:7001", nowIso());
  await sd.setAgentStatus(abel, "offline");
  check("an agent who is offline cannot call", /Go online/.test(await err(() => K.dialCustomer(abel, open.t, OFFER))));
  await sd.setAgentStatus(abel, "online");
  const closed = await customer("tg:7002", null);
  const info = await K.dialInfo(abel, closed.t);
  check("a Telegram customer with the app closed is reachable through the bot", info.inApp && !info.online && info.byBot, info);
  posts.length = 0;
  const viaBot = await K.dialCustomer(abel, closed.t, OFFER);
  const notice = posts.find((p) => p.url.endsWith("/sendMessage") && String(p.body.chat_id) === "7002");
  check("and gets the bot's call notice with a button that opens the app on the call", !!notice && String(notice.body.text).includes("is calling you") && JSON.stringify(notice.body.reply_markup).includes("call=1"), notice?.body);
  const mail = uid("cus_");
  await run("INSERT INTO sup_customers (id, app_id, external_id, name, created_at) VALUES (?, NULL, 'mail:x@example.et', 'Mail', ?)", mail, nowIso());
  const mt = await sd.createTicketFromChannel({ subject: "By mail", body: "x", customerId: mail, channel: "email", appQueue: q });
  await run("UPDATE sup_tickets SET assignee_id = ? WHERE id = ?", abel.id, mt);
  check("an email customer cannot be called in the app", /cannot be called in the app/.test(await err(() => K.dialCustomer(abel, mt, OFFER))));

  // 2. The lifecycle, written by the database for every change.
  const call = await K.dialCustomer(abel, open.t, OFFER);
  check("a new call is initiated, then ringing", (await phases(call.callId)).join() === "initiated,ringing", await phases(call.callId));
  await run("UPDATE sup_calls SET status = 'answered', answered_at = ?, answer = 'x' WHERE id = ?", nowIso(), call.callId);
  await K.agentCallState(abel, call.callId, "connecting");
  await K.agentCallState(abel, call.callId, "connected");
  await K.agentCallState(abel, call.callId, "connecting");
  check("accepted, connecting, connected (never back to connecting)", (await phases(call.callId)).join() === "initiated,ringing,accepted,connecting,connected", await phases(call.callId));
  await run("UPDATE sup_calls SET on_hold = 1 WHERE id = ?", call.callId);
  await run("UPDATE sup_calls SET on_hold = 0 WHERE id = ?", call.callId);
  await run("UPDATE sup_calls SET status = 'ended', ended_at = ? WHERE id = ?", nowIso(), call.callId);
  const life = await K.callLifecycle(abel, call.callId);
  check("hold and back, then completed", life.map((e) => e.phase).join() === "initiated,ringing,accepted,connecting,connected,on_hold,connected,completed", life.map((e) => e.phase));
  check("the call row carries its phase", (await get<{ phase: string }>("SELECT phase FROM sup_calls WHERE id = ?", call.callId))?.phase === "completed");

  await run("UPDATE sup_calls SET status = 'ended', ended_at = ? WHERE id = ?", nowIso(), viaBot.callId);
  check("ended before anyone answered is cancelled", (await phases(viaBot.callId)).at(-1) === "cancelled");
  const second = await customer("tg:7003", nowIso());
  const failing = await K.dialCustomer(abel, second.t, OFFER);
  await run("UPDATE sup_calls SET status = 'answered', answered_at = ? WHERE id = ?", nowIso(), failing.callId);
  await K.agentCallState(abel, failing.callId, "failed");
  const f = await get<{ status: string; phase: string }>("SELECT status, phase FROM sup_calls WHERE id = ?", failing.callId);
  check("audio that never flows: failed, and the call ends", f?.status === "ended" && f.phase === "failed" && (await phases(failing.callId)).at(-1) === "failed", f);
  const third = await customer("tg:7004", nowIso());
  const missed = await K.dialCustomer(abel, third.t, OFFER);
  await run("UPDATE sup_calls SET started_at = ? WHERE id = ?", new Date(Date.now() - 10 * 60e3).toISOString(), missed.callId);
  posts.length = 0;
  await sd.ringingFor(abel); // the desk's regular check, which ends calls that rang too long
  check("a call nobody answers is missed", (await phases(missed.callId)).at(-1) === "missed", await phases(missed.callId));
  check("and the Telegram customer is told", posts.some((p) => String(p.body.chat_id) === "7004" && String(p.body.text).startsWith("We tried to call you")));
  check("an unknown media state is refused", /Unknown call state/.test(await err(() => K.agentCallState(abel, missed.callId, "dancing"))));

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FAIL crashed", e);
  process.exit(1);
});
