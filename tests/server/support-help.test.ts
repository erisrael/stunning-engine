// Update 1.0 phase 4: one help menu everywhere. Categories in English and Amharic, routing rules (Payments to
// Finance), Finance working only its queue, moving a ticket with a note, the Telegram bot's buttons (articles first,
// then a request in the right queue), shared phone numbers, photos kept on the ticket, the webhook asking for button
// presses, the public help page (ask, follow, reply, never internal notes), the Telegram Mini App sign-in, and the
// reports by category, channel and queue.
process.env.MAIL_FAKE = "1";
import crypto from "node:crypto";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ch from "../../src/server/support-channels";
import * as h from "../../src/server/support-help";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, re: RegExp) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return re.test(String(e));
  }
};
const TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ";

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const [admin, abel, liya, dawit] = [await by("admin@demo.local"), await by("abel@demo.local"), await by("liya@demo.local"), await by("dawit@demo.local")];
  await sd.saveSupportConfig(admin, { enabled: true, leads: [liya.id] });
  const general = await sd.saveQueue(liya, { name: "General", members: [abel.id] });
  const finance = await sd.paymentFollowupQueue();
  await sd.saveQueue(liya, { id: finance, name: sd.FOLLOWUP_QUEUE, members: [dawit.id] });
  const tech = await sd.saveQueue(liya, { name: "Tech", members: [abel.id] });
  await sd.setAgentStatus(abel, "online");
  await sd.setAgentStatus(dawit, "online");

  // The menu.
  const cats = await h.helpCategories();
  check("the menu has the eight topics in English and Amharic", cats.map((c) => c.key).join(",") === "quick,faq,howto,plans,payments,account,app,person" && cats.every((c) => c.labelAm && /[ሀ-፿]/.test(c.labelAm)), cats.map((c) => c.key));
  check("Payments goes to the Payment follow-up queue", cats.find((c) => c.key === "payments")?.queueId === finance);
  check("Talk to a person skips the articles", cats.find((c) => c.key === "person")?.selfHelp === false);
  check("only leads change the menu", await rejects(() => h.saveCategories(abel, cats), /support leads/));
  await h.saveCategories(liya, cats.map((c) => (c.key === "app" ? { ...c, queueId: general, labelAm: "የመተግበሪያ እገዛ" } : c.key === "faq" ? { ...c, active: false } : c)));
  const saved = await h.helpCategories({ activeOnly: true });
  check("the lead saves labels, queues and what is shown", !saved.some((c) => c.key === "faq") && saved.find((c) => c.key === "app")?.labelAm === "የመተግበሪያ እገዛ" && saved.find((c) => c.key === "app")?.queueId === general);

  // Routing rules.
  check("a rule needs a queue", await rejects(() => h.saveRoutes(liya, [{ queueId: "nope", category: "app" }]), /needs a queue/));
  await h.saveRoutes(liya, [{ category: "app", keywords: ["crash", "bug"], channel: "any", queueId: tech, priority: "high" }]);
  check("words pick the Tech queue with its priority", JSON.stringify(await h.routeFor({ category: "app", text: "The app crash on start", channel: "web" })) === JSON.stringify({ queueId: tech, priority: "high", by: "rule" }));
  check("otherwise the menu item's queue", (await h.routeFor({ category: "app", text: "videos are slow", channel: "web" }))?.queueId === general);
  check("Payments goes to Finance", (await h.routeFor({ category: "payments", text: "I paid twice", channel: "telegram" }))?.queueId === finance);

  // Telegram: connect, then the menu.
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  ch.setTelegramPoster(async (url, body) => {
    posts.push({ url, body: body as Record<string, unknown> });
    if (url.endsWith("/getFile")) return { ok: true, result: { file_path: "photos/file_1.jpg" } };
    if (url.endsWith("/getWebhookInfo")) return { ok: true, result: { url: "https://cm.myseed.et/api/support/telegram/x", pending_update_count: 0, allowed_updates: ["message", "callback_query"] } };
    return { ok: true, result: { username: "myseed_help_bot" } };
  });
  ch.setTelegramDownloader(async () => Buffer.from("jpeg-bytes"));
  await ch.connectTelegram(admin, TOKEN, "https://cm.myseed.et");
  const hook = posts.find((p) => p.url.endsWith("/setWebhook"))!;
  const secret = String(hook.body.secret_token);
  check("the webhook asks for button presses too", JSON.stringify(hook.body.allowed_updates) === JSON.stringify(["message", "callback_query"]));
  check("the menu button opens the help center inside Telegram", posts.some((p) => p.url.endsWith("/setChatMenuButton") && JSON.stringify(p.body).includes("https://cm.myseed.et/help")));
  const health = await ch.telegramHealth();
  check("the health check reads the webhook", health.connected && health.buttons && health.miniApp && health.pending === 0, health);
  const last = () => posts.filter((p) => p.url.endsWith("/sendMessage")).at(-1)!.body;
  const msg = (text: string, id = 1, extra: Record<string, unknown> = {}) => ({ message: { message_id: id, text, chat: { id: 777, type: "private" }, from: { id: 777, first_name: "Selam" }, ...extra } });
  const press = (data: string) => ({ callback_query: { id: `cb${Math.random()}`, data, from: { id: 777, first_name: "Selam" }, message: { chat: { id: 777, type: "private" } } } });

  await ch.telegramUpdate(secret, secret, msg("/start"));
  const menu = JSON.stringify(last().reply_markup);
  check("/start shows the menu as buttons, in both languages", menu.includes("c:payments") && menu.includes("Payments · ክፍያዎች") && String(last().text).includes("ሰላም") && menu.includes("web_app"), last());
  await ch.saveArticle(liya, { title: "Paid but not active", body: "Send the receipt from telebirr and we activate it within a day.", category: "Payments", published: true });
  await ch.telegramUpdate(secret, secret, press("c:payments"));
  check("a topic shows its articles, then Still need help?", String(last().text).includes("Paid but not active") && JSON.stringify(last().reply_markup).includes("a:payments"), last());
  check("button presses are answered (no spinner left)", posts.some((p) => p.url.endsWith("/answerCallbackQuery")));
  await ch.telegramUpdate(secret, secret, press("a:payments"));
  check("then it asks for the question and offers to share the phone", String(last().text).includes("Write your question") && JSON.stringify(last().reply_markup).includes("request_contact"), last());
  await ch.telegramUpdate(secret, secret, msg("", 2, { contact: { phone_number: "251911223344", user_id: 777 } }));
  const cus = await get<{ id: string; phone: string }>("SELECT id, phone FROM sup_customers WHERE external_id = 'tg:777'");
  check("the shared number is kept on the customer", cus?.phone === "+251911223344", cus);
  await ch.telegramUpdate(secret, secret, msg("I paid 300 birr with telebirr yesterday but my plan is not active", 3));
  const tk = await get<{ id: string; number: number; queue_id: string; category: string; assignee_id: string | null }>("SELECT id, number, queue_id, category, assignee_id FROM sup_tickets WHERE customer_id = ?", cus!.id);
  check("the request goes to Finance, with its topic, to the Finance agent", tk?.queue_id === finance && tk.category === "payments" && tk.assignee_id === dawit.id, tk);
  check("and the customer gets the number", String(last().text).includes(`#${tk!.number}`));
  await ch.telegramUpdate(secret, secret, msg("", 4, { caption: "the receipt", photo: [{ file_id: "small", file_size: 100 }, { file_id: "big", file_size: 2000 }] }));
  const files = await h.ticketFiles([tk!.id]);
  check("a photo is kept on the ticket, not as placeholder text", files.length === 1 && files[0]!.mime === "image/jpeg" && posts.some((p) => p.url.endsWith("/getFile") && p.body.file_id === "big"), files);
  check("the agent reads the photo", (await h.readTicketFile(dawit, files[0]!.id))?.data.toString() === "jpeg-bytes");
  check("an agent of another queue cannot", await rejects(() => h.readTicketFile(abel, files[0]!.id), /another team/));

  // Finance sees only its queue; moving keeps one thread.
  check("Finance sees its ticket", (await sd.inbox(dawit, "all")).some((r) => r.id === tk!.id));
  check("Support does not see Finance's ticket", !(await sd.inbox(abel, "all")).some((r) => r.id === tk!.id));
  check("moving needs a note", await rejects(() => h.transferTicket(dawit, tk!.id, general, " "), /note/));
  await h.transferTicket(dawit, tk!.id, general, "Payment confirmed; the app still shows the free plan");
  const moved = await sd.ticketDetail(abel, tk!.id);
  check("moved to Support with the note, given to a Support agent", (moved.ticket as { queue_id: string }).queue_id === general && (moved.ticket as { assignee_id: string }).assignee_id === abel.id && moved.messages.some((m) => m.internal && m.body.includes("Payment confirmed")));
  await sd.agentReply(abel, tk!.id, { body: "Your plan is active now." });
  check("the customer keeps one thread: the reply goes to the same chat", posts.some((p) => p.url.endsWith("/sendMessage") && p.body.chat_id === "777" && String(p.body.text).startsWith("Your plan is active")));

  // The help page.
  const home = await h.helpHome();
  check("the help page has the menu and the articles", home.categories.length === 7 && home.articles.some((a) => a.title === "Paid but not active") && !("queueId" in home.categories[0]!));
  check("a request needs a way to reach the customer", await rejects(() => h.helpAsk({ name: "Hanna", message: "The lessons do not load" }), /phone number or an email/));
  const asked = await h.helpAsk({ name: "Hanna", phone: "0911 223 344", category: "app", message: "The app crash when I open grade 8 maths" });
  const webT = await get<{ channel: string; queue_id: string; priority: string; category: string }>("SELECT channel, queue_id, priority, category FROM sup_tickets WHERE id = ?", asked.ticketId);
  check("a help-page request is routed by its rule", webT?.channel === "web" && webT.queue_id === tech && webT.priority === "high" && webT.category === "app", webT);
  await sd.agentReply(abel, asked.ticketId, { body: "Internal: check device", internal: true });
  await sd.agentReply(abel, asked.ticketId, { body: "Please update the app to the latest version." });
  const thread = await h.helpMessages(asked.token, asked.ticketId);
  check("the customer follows it with the link, never seeing internal notes", thread.messages.length === 2 && !thread.messages.some((m) => m.body.includes("Internal")) && thread.messages[1]!.author === "Abel", thread.messages);
  await h.helpReply(asked.token, asked.ticketId, "Updated, it works now. Thank you!");
  check("and replies on the same request", (await sd.ticketDetail(abel, asked.ticketId)).messages.some((m) => m.body.startsWith("Updated, it works")));
  check("a forged link is refused", (await rejects(() => h.helpTickets(`${asked.token.split(".")[0]}.abc`), /not valid/)) && (await rejects(() => h.helpMessages(asked.token, tk!.id), /not found/)));

  // Inside Telegram: the Mini App's signed data is checked with the bot token.
  const initData = (user: object, authDate = Math.floor(Date.now() / 1000), token = TOKEN) => {
    const p = new URLSearchParams({ auth_date: String(authDate), query_id: "q1", user: JSON.stringify(user) });
    const dc = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
    const key = crypto.createHmac("sha256", "WebAppData").update(token).digest();
    p.set("hash", crypto.createHmac("sha256", key).update(dc).digest("hex"));
    return p.toString();
  };
  const tgIn = await h.helpTelegram(initData({ id: 777, first_name: "Selam" }), await ch.telegramBotToken());
  check("the Mini App knows the Telegram customer", (await h.helpTickets(tgIn.token)).tickets.some((t) => t.id === tk!.id));
  check("data signed with another token is refused", await rejects(() => h.helpTelegram(initData({ id: 777 }, undefined, "999:OTHERTOKENOTHERTOKENOTHER"), TOKEN), /could not confirm/));
  check("old data is refused", await rejects(async () => h.helpTelegram(initData({ id: 777 }, Math.floor(Date.now() / 1000) - 90000), await ch.telegramBotToken()), /old/));
  const fromApp = await h.helpAsk({ token: tgIn.token, name: "", category: "account", message: "How do I change my password?" });
  check("a request from the Mini App stays a Telegram conversation", (await get<{ channel: string }>("SELECT channel FROM sup_tickets WHERE id = ?", fromApp.ticketId))?.channel === "telegram");

  // Reports.
  const day = new Date().toISOString().slice(0, 10);
  const rep = await h.categoryReport(liya, { from: day, to: day });
  check("reports by topic, channel and queue", rep.byCategory.some((r) => r.name === "Payments" && r.tickets === 1) && rep.byChannel.some((r) => r.name === "Help page") && rep.byQueue.some((r) => r.name === "Tech"), rep);
  check("only leads see them", await rejects(() => h.categoryReport(abel, { from: day, to: day }), /support leads/));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
