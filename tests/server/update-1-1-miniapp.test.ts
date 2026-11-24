// Update 1.1: the support app inside Telegram (Mini App). Telegram's signed data signs the customer in (forged or
// old data refused) as the same customer as in the bot chat, for the default bot and a system's own bot; its tickets
// are Telegram tickets (replies reach the chat too); agents can call a Telegram customer while the app is open; the
// bot's menu and menu button open the app (and calling in it); the bot's resources show in it; bot content can be
// edited (title, caption, link, a new file) and deleted.
import crypto from "node:crypto";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ch from "../../src/server/support-channels";
import * as sc from "../../src/server/support-calls";
import * as bm from "../../src/server/bot-manager";

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

// initData as Telegram signs it for a bot.
function initData(token: string, user: { id: number; first_name: string }, authDate = Math.floor(Date.now() / 1000)) {
  const p = new URLSearchParams({ auth_date: String(authDate), query_id: "AAH", user: JSON.stringify(user) });
  const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const key = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", crypto.createHmac("sha256", key).update(check).digest("hex"));
  return p.toString();
}

async function main() {
  const admin = await by("admin@demo.local");
  const sara = await by("sara@demo.local");
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  const q = await sd.saveQueue(admin, { name: "Help", keywords: [], members: [sara.id], strategy: "least_busy" });
  await sd.setAgentStatus(sara, "online");

  const posts: { url: string; body: Record<string, unknown> }[] = [];
  ch.setTelegramPoster(async (url, body) => {
    posts.push({ url, body: body as Record<string, unknown> });
    return { ok: true, result: { username: url.includes("777000") ? "academy_bot" : "myseed_help_bot", message_id: posts.length } };
  });
  const TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  await ch.connectTelegram(admin, TOKEN, "https://cm.myseed.et");
  const menuBtn = posts.find((p) => p.url.endsWith("/setChatMenuButton"));
  const mb = menuBtn?.body.menu_button as { type?: string; web_app?: { url?: string }; text?: string } | undefined;
  check("the bot's menu button opens the support app", mb?.type === "web_app" && mb.web_app?.url === "https://cm.myseed.et/support-widget?tg=default" && mb.text === "Support", mb);
  const secret = String(posts.find((p) => p.url.endsWith("/setWebhook"))!.body.secret_token);

  // The customer starts in the bot chat.
  posts.length = 0;
  await ch.telegramUpdate(secret, secret, { message: { message_id: 1, text: "/start", chat: { id: 4242, type: "private" }, from: { id: 4242, first_name: "Selam" } } });
  const menu = posts.filter((p) => p.url.endsWith("/sendMessage")).at(-1)!;
  const rows = ((menu.body.reply_markup as { inline_keyboard: { text: string; web_app?: { url: string } }[][] }).inline_keyboard ?? []).flat();
  check("the menu opens the support app", rows.some((b) => b.text.startsWith("Open the support app") && b.web_app?.url === "https://cm.myseed.et/support-widget?tg=default"));
  posts.length = 0;
  await ch.telegramUpdate(secret, secret, { callback_query: { id: "q-call", data: "sm:call", from: { id: 4242 }, message: { chat: { id: 4242, type: "private" } } } });
  const callRows = ((posts.filter((p) => p.url.endsWith("/sendMessage")).at(-1)?.body.reply_markup as { inline_keyboard?: { text: string; web_app?: { url: string } }[][] } | undefined)?.inline_keyboard ?? []).flat();
  // "Call support now" first checks for an online agent (Admin, Support: check for an online agent first).
  check("and calling support in it", [...rows, ...callRows].some((b) => /Call support/.test(b.text) && (b as { callback_data?: string }).callback_data === "cn"), callRows);
  const lastText = () => String(posts.filter((p) => p.url.endsWith("/sendMessage")).at(-1)?.body.text ?? "");
  const lastRows = () => ((posts.filter((p) => p.url.endsWith("/sendMessage")).at(-1)?.body.reply_markup as { inline_keyboard?: { text: string; callback_data?: string; web_app?: { url: string } }[][] } | undefined)?.inline_keyboard ?? []).flat();
  posts.length = 0;
  await ch.telegramUpdate(secret, secret, { callback_query: { id: "q-cn", data: "cn", from: { id: 4242 }, message: { chat: { id: 4242, type: "private" } } } });
  const online = (await (await import("../../src/server/support-desk")).availableAgents(null, undefined, { ignoreLimit: true })).length;
  check(
    "pressing it says nobody is online, or gives the call button",
    online ? lastRows().some((b) => b.web_app?.url === "https://cm.myseed.et/support-widget?tg=default&call=1") : /No agent is online/.test(lastText()) && lastRows().some((b) => b.callback_data === "cb"),
    { online, text: lastText(), rows: lastRows() },
  );
  const botCustomer = (await get<{ id: string }>("SELECT id FROM sup_customers WHERE external_id = 'tg:4242' AND app_id IS NULL"))!;

  // Signing in to the Mini App.
  check("forged data is refused", /could not confirm/.test((await err(() => ch.telegramMiniApp(initData("999:WRONG", { id: 4242, first_name: "Selam" }), "default"))) ?? ""));
  check("old data is refused", /old/.test((await err(() => ch.telegramMiniApp(initData(TOKEN, { id: 4242, first_name: "Selam" }, Math.floor(Date.now() / 1000) - 2 * 86400), "default"))) ?? ""));
  check("future-dated data is refused", !!(await err(() => ch.telegramMiniApp(initData(TOKEN, { id: 4242, first_name: "Selam" }, Math.floor(Date.now() / 1000) + 3600), "default"))));
  const mini = await ch.telegramMiniApp(initData(TOKEN, { id: 4242, first_name: "Selam" }), "default");
  check("Telegram's data signs them in as the same customer as in the chat", mini.key === sd.TELEGRAM_APP_KEY && mini.session.customer.id === botCustomer.id && mini.session.customer.telegram, mini);
  const A = await sd.appByKey(mini.key, null);
  check("the Telegram app is not open to other sites", /may not use/.test((await err(() => sd.appByKey(mini.key, "https://evil.example"))) ?? ""));
  check("nobody can sign in to it without Telegram", /Telegram bot/.test((await err(() => sd.identify(A, { id: "tg:4242", name: "x" }))) ?? ""));
  const tid = await sd.customerCreateTicket(A, mini.session.token, { subject: "Payment", message: "I paid but it is not active" });
  const t = (await get<{ channel: string; customer_id: string; app_id: string | null }>("SELECT channel, customer_id, app_id FROM sup_tickets WHERE id = ?", tid))!;
  check("a question from the app is a Telegram ticket of that customer", t.channel === "telegram" && t.customer_id === botCustomer.id && t.app_id === null, t);
  check("they see their conversations", (await sd.customerTickets(A, mini.session.token)).some((x) => x.id === tid));
  posts.length = 0;
  await sd.assignTicket(admin, tid, sara.id).catch(() => null);
  await sd.agentReply(sara, tid, { body: "We activated it" });
  // Update 1.2: the Mini App's words and topics come from the content store; a topic names and routes a question;
  // what support wrote comes back as the customer's updates.
  const content = (mini.session as { content?: { welcome: { en: string }; topics: { key: string; en: string }[] } }).content;
  check("the app has the content store's welcome and seven topics", !!content?.welcome.en.startsWith("Welcome to MySeed Support") && content.topics.length === 7, content);
  const tid2 = await sd.customerCreateTicket(A, mini.session.token, { message: "My card was charged twice", topic: "topic.payments" });
  const t2 = (await get<{ subject: string; category: string | null }>("SELECT subject, category FROM sup_tickets WHERE id = ?", tid2))!;
  check("a topic names the question and routes it by its category", t2.subject.startsWith("Payments and Billing:") && t2.category === "payments", t2);
  const ups = await sd.customerUpdates(A, mini.session.token);
  check("support's replies are the customer's updates", ups.some((u) => u.ticket_id === tid && u.body === "We activated it"), ups);
  check("the agent's reply shows in the app", (await sd.customerMessages(A, mini.session.token, tid)).messages.some((m) => m.body === "We activated it"));
  check("and reaches the chat as a message", posts.some((p) => p.url.endsWith("/sendMessage") && String(p.body.chat_id) === "4242" && /We activated it/.test(String(p.body.text))));
  // Update 1.2, spec 15: the reply's button opens that conversation in the support app (a deep link).
  const replyMsg = posts.find((p) => p.url.endsWith("/sendMessage") && /We activated it/.test(String(p.body.text)));
  const deep = ((replyMsg?.body.reply_markup as { inline_keyboard?: { text: string; web_app?: { url: string } }[][] } | undefined)?.inline_keyboard ?? []).flat();
  check("the reply's button opens its conversation in the support app", deep.some((b) => b.web_app?.url === `https://cm.myseed.et/support-widget?tg=default&page=t_${tid}`), deep);

  // The customer's own pages: requests, profile and language, FAQ.
  const C = await import("../../src/server/support-customer");
  const R = await import("../../src/server/support-requests");
  const dest = (await R.saveDestination(admin, { label: "Administration", kind: "admin" })).destinations.find((d) => d.label === "Administration")!;
  const rq = await R.createSupportRequest(admin, { type: "refund", title: "Refund the double charge", description: "Internal: card ending 4242, charged twice", destinationId: dest.id, ticketId: tid2 });
  const draft = await R.createSupportRequest(admin, { type: "other", title: "A draft only the team sees", destinationId: dest.id, ticketId: tid2 });
  check("a draft request is not shown to the customer", !(await C.customerRequests(A, mini.session.token)).some((r) => r.id === draft.id || r.id === rq.id));
  await R.act(admin, rq.id, "submit");
  await R.act(admin, rq.id, "acknowledge");
  let mine = await C.customerRequests(A, mini.session.token);
  check("a submitted request from their conversation is listed, in plain words", mine.length === 1 && mine[0]!.status.en === "In progress" && mine[0]!.type.en === "Refund" && mine[0]!.conversation?.id === tid2, mine);
  check("its details hide the team's notes until it is finished", (await C.customerRequest(A, mini.session.token, rq.id)).resolution === null && !JSON.stringify(await C.customerRequest(A, mini.session.token, rq.id)).includes("card ending"));
  await R.act(admin, rq.id, "resolve", { text: "Refunded 300 ETB to your card." });
  const rd = await C.customerRequest(A, mini.session.token, mine[0]!.reference);
  check("finished, it shows the outcome and the steps it went through", rd.resolution === "Refunded 300 ETB to your card." && rd.steps.map((x) => x.status.key).join() === "received,progress,resolved" && !rd.status.open, rd);
  const db = await import("../../src/server/db");
  const other = db.uid("cus_");
  await db.run("INSERT INTO sup_customers (id, app_id, external_id, name, created_at) VALUES (?, NULL, 'tg:5555', 'Someone Else', ?)", other, new Date().toISOString());
  const otherTok = (await sd.sessionFor(A, other)).token;
  check("another customer cannot open it", /not found/.test((await err(() => C.customerRequest(A, otherTok, rq.id))) ?? "") && !(await C.customerRequests(A, otherTok)).length);
  let prof = await C.customerProfile(A, mini.session.token);
  check("the profile shows who they are and their numbers", prof.source === "telegram" && prof.canRename && prof.counts.conversations === 2 && prof.counts.requests === 1, prof);
  prof = await C.customerSaveProfile(A, mini.session.token, { name: "Selam Tesfaye", lang: "am" });
  const meta = JSON.parse((await get<{ meta: string }>("SELECT meta FROM sup_customers WHERE id = ?", botCustomer.id))!.meta);
  check("they correct their name and choose Amharic, which the bot uses too", prof.name === "Selam Tesfaye" && prof.lang === "am" && meta.lang === "am");
  check("a language other than English or Amharic is refused", /English or Amharic/.test((await err(() => C.customerSaveProfile(A, mini.session.token, { lang: "fr" }))) ?? ""));
  await ch.saveArticle(admin, { title: "How do I renew my subscription?", body: "Open Payments and choose Renew.", published: true });
  check("the FAQ lists the published help articles", (await C.customerFaq(A, mini.session.token)).some((a) => a.title === "How do I renew my subscription?"));

  await sd.customerReply(A, mini.session.token, tid, "Thank you");
  check("they can answer from the app", (await sd.customerMessages(A, mini.session.token, tid)).messages.some((m) => m.body === "Thank you"));

  // Calling a Telegram customer.
  const { run } = await import("../../src/server/db");
  await run("UPDATE sup_customers SET app_seen_at = NULL WHERE id = ?", botCustomer.id);
  let info = await sc.dialInfo(sara, tid);
  check("a Telegram customer can be called in the support app", info.inApp, info);
  check("but not while only the chat is open", !info.online);
  await sd.customerTickets(A, mini.session.token);
  info = await sc.dialInfo(sara, tid);
  check("with the app open they can be called now", info.inApp && info.online, info);

  // A system's own bot.
  const app = await sd.saveApp(admin, { name: "MySeed Academy", origins: [], queueId: q });
  const sysKey = (await sd.listApps(admin)).find((x) => x.id === app.id)!.publicKey;
  const SYS_TOKEN = "777000:AAsystemBotTokenForMiniApp_xyz";
  await ch.connectSystemBot(admin, app.id, SYS_TOKEN, "https://academy.example");
  const sysMini = await ch.telegramMiniApp(initData(SYS_TOKEN, { id: 5151, first_name: "Abel" }), app.id);
  const sysCust = (await get<{ app_id: string }>("SELECT app_id FROM sup_customers WHERE id = ?", sysMini.session.customer.id))!;
  check("a system's bot signs in as that system", sysMini.key === sysKey && sysCust.app_id === app.id && sysMini.session.app.name === "MySeed Academy");
  check("data from another bot is refused", !!(await err(() => ch.telegramMiniApp(initData(TOKEN, { id: 5151, first_name: "Abel" }), app.id))));
  check("an unknown bot is refused", /not connected/.test((await err(() => ch.telegramMiniApp(initData(TOKEN, { id: 1, first_name: "x" }), "sup_nope"))) ?? ""));

  // Resources in the app.
  const pdf = await bm.saveContent(admin, app.id, { title: "Exam guide", caption: "Read before the exam", file: { name: "guide.pdf", mime: "application/pdf", data: Buffer.from("%PDF-1") } });
  const link = await bm.saveContent(admin, app.id, { title: "How to log in", url: "https://youtu.be/abc" });
  await bm.saveContent(admin, app.id, { id: link.id, title: "How to log in", url: "https://youtu.be/abc", active: false });
  const SA = await sd.appByKey(sysKey, null);
  check("web identify cannot impersonate a Telegram customer", !!(await err(() => sd.identify(SA, { id: "tg:5151", name: "Impostor" }))));
  check("sessions cannot cross app boundaries", !!(await err(() => sd.sessionFor(SA, mini.session.customer.id))));
  let res = await bm.customerResources(SA, sysMini.session.token);
  check("the app lists the bot's resources", res.length === 1 && res[0]!.title === "Exam guide" && res[0]!.url!.startsWith("https://academy.example/api/support/bot-file/"), res);
  check("hidden ones are left out", !res.some((r) => r.title === "How to log in"));
  check("it needs the customer's sign-in", !!(await err(() => bm.customerResources(SA, "bad.token"))));

  // Editing and deleting content.
  const oldUrl = res[0]!.url!;
  const oldPub = new URL(oldUrl).searchParams.get("k")!;
  await bm.saveContent(admin, app.id, { id: pdf.id, title: "Exam guide 2026", caption: "Updated", file: { name: "guide-2026.mp4", mime: "video/mp4", data: Buffer.from("mp4data") } });
  let item = (await bm.listContent(admin, app.id)).find((c) => c.id === pdf.id)!;
  check("an edit renames it and replaces the file", item.title === "Exam guide 2026" && item.caption === "Updated" && item.fileName === "guide-2026.mp4" && item.kind === "video", item);
  check("the old file link stops working", (await bm.contentFile(pdf.id, oldPub)) === null);
  res = await bm.customerResources(SA, sysMini.session.token);
  const newPub = new URL(res[0]!.url!).searchParams.get("k")!;
  check("the new file is served", (await bm.contentFile(pdf.id, newPub))?.data.toString() === "mp4data");
  await bm.saveContent(admin, app.id, { id: pdf.id, title: "Exam guide 2026", url: "https://drive.example/guide" });
  item = (await bm.listContent(admin, app.id)).find((c) => c.id === pdf.id)!;
  // A link given to a file item goes beside the file (a video and its YouTube page), not in its place.
  check("a link is kept beside the file", item.kind !== "link" && item.url === "https://drive.example/guide" && !!item.fileName);
  await bm.saveContent(admin, app.id, { id: link.id, title: "How to sign in", file: { name: "signin.png", mime: "image/png", data: Buffer.from("png") } });
  item = (await bm.listContent(admin, app.id)).find((c) => c.id === link.id)!;
  check("and a file added to a link keeps the link", item.kind === "image" && item.title === "How to sign in" && !!item.url);
  check("members cannot edit", !!(await err(() => bm.saveContent(sara, app.id, { id: link.id, title: "x" }))));
  await bm.schedulePush(admin, app.id, { contentId: link.id, sendAt: new Date(Date.now() + 864e5).toISOString() }, "https://academy.example");
  await bm.deleteContent(admin, link.id);
  check("deleting removes it and cancels its scheduled send", !(await get("SELECT id FROM sup_bot_content WHERE id = ?", link.id)) && !!(await get("SELECT id FROM sup_bot_pushes WHERE content_id = ? AND status = 'cancelled'", link.id)));
  check("members cannot delete", !!(await err(() => bm.deleteContent(sara, pdf.id))));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
