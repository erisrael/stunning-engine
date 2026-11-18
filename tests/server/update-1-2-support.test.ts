// Update 1.2, Phase 5: the bot and Mini App content in one versioned store (defaults from the spec in English and
// Amharic, drafts, publishing, history and restore, translations, switching off, order, the Telegram page writing to
// the same store), and the bot's new abilities: language choice, the spec's menu and topics, request tracking and
// history, FAQ search, place in line, change of topic, close and reopen, and call notices.
process.env.MAIL_FAKE = "1";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ch from "../../src/server/support-channels";
import * as C from "../../src/server/support-content";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ";

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const [admin, abel, liya, dawit] = [await by("admin@demo.local"), await by("abel@demo.local"), await by("liya@demo.local"), await by("dawit@demo.local")];
  await sd.saveSupportConfig(admin, { enabled: true, leads: [liya.id] });
  const general = await sd.saveQueue(liya, { name: "General", members: [abel.id] });
  const finance = await sd.paymentFollowupQueue();
  await sd.saveQueue(liya, { id: finance, name: sd.FOLLOWUP_QUEUE, members: [dawit.id] });
  const h = await import("../../src/server/support-help");
  const cats = await h.helpCategories();
  await h.saveCategories(liya, cats.map((c) => (c.key === "app" ? { ...c, queueId: general } : c)));

  // 1. Defaults.
  const both = await C.contentEntries("menu", "both");
  check("the spec's eight menu entries, in English and Amharic", both.length === 8 && both[0].label === "Start a Conversation · ውይይት ይጀምሩ" && both.map((e) => e.action).join() === "start,requests,history,faq,category:account,category:payments,category:app,contact", both);
  const topics = await C.contentEntries("category", "en");
  check("the spec's seven topics", topics.map((t) => t.label).join("|") === "Account and Login|Learning and Educational Content|Subscription|Payments and Billing|Technical Problems|School and Enrollment|Other Inquiries", topics);
  check("the spec's welcome", (await C.contentText("welcome", "en")) === "Welcome to MySeed Support. How can we help you today?" && /[ሀ-፿]/.test(await C.contentText("welcome", "am")));

  // 2. Managing.
  check("only leads manage content", /support leads/.test(await err(() => C.listSupportContent(abel))));
  const list = await C.listSupportContent(liya);
  const welcomeEn = list.items.find((i) => i.key === "welcome" && i.lang === "en")!;
  await C.saveContentDraft(liya, { id: welcomeEn.id, key: "welcome", kind: "welcome", lang: "en", body: "Hello from MySeed. What do you need?" });
  check("a draft is not what customers see", (await C.contentText("welcome", "en")) === "Welcome to MySeed Support. How can we help you today?");
  const pub = await C.publishContent(liya, welcomeEn.id);
  check("publishing makes it what customers see", (await C.contentText("welcome", "en")) === "Hello from MySeed. What do you need?" && !pub.changed);
  const hist = await C.contentHistory(liya, welcomeEn.id);
  check("each publish is kept", hist.length === 2 && hist[0].body.startsWith("Hello"), hist.map((v) => v.body));
  const restored = await C.restoreContentVersion(liya, hist[1].id);
  check("an older version comes back as the draft", restored.draft === "Welcome to MySeed Support. How can we help you today?" && restored.changed);
  await C.publishContent(liya, welcomeEn.id);
  check("and is published again", (await C.contentText("welcome", "en")).startsWith("Welcome to MySeed Support"));
  await C.saveContentDraft(liya, { key: "welcome", kind: "welcome", lang: "om", body: "Baga gara Deeggarsa MySeed dhuftan.", publish: true });
  check("a translation in another language", (await C.contentText("welcome", "om")) === "Baga gara Deeggarsa MySeed dhuftan." && (await C.listSupportContent(liya)).langs.includes("om"));
  check("a missing language falls back to English", (await C.contentText("queue.position", "om", "default", { position: 3 })) === "You are number 3 in line.");
  const history = list.items.find((i) => i.key === "menu.history" && i.lang === "en")!;
  await C.setContentEnabled(liya, history.id, false);
  check("an entry switched off leaves the menu, in every language", !(await C.contentEntries("menu", "am")).some((e) => e.key === "menu.history"));
  await C.setContentEnabled(liya, history.id, true);
  await C.reorderContent(liya, "default", "menu", ["menu.contact", ...both.map((e) => e.key).filter((k) => k !== "menu.contact")]);
  check("entries can be reordered", (await C.contentEntries("menu", "en"))[0].key === "menu.contact");
  check("a built-in item cannot be deleted", /cannot be deleted/.test(await err(() => C.deleteContent(liya, history.id, true))));
  const offer = await C.saveContentDraft(liya, { key: "menu.offers", kind: "menu", lang: "en", body: "Offers", action: "url:https://myseed.et/offers", publish: true });
  check("a new entry that opens a page", (await C.contentEntries("menu", "en")).some((e) => e.key === "menu.offers" && e.action === "url:https://myseed.et/offers"));
  await C.deleteContent(liya, offer.id, true);
  check("a new entry can be deleted", !(await C.contentEntries("menu", "en")).some((e) => e.key === "menu.offers"));
  check("a bad action is refused", /not one the bot can do/.test(await err(() => C.saveContentDraft(liya, { key: "menu.x", kind: "menu", lang: "en", body: "X", action: "javascript:alert(1)" }))));
  check("a bad key is refused", /lowercase/.test(await err(() => C.saveContentDraft(liya, { key: "Menu X!", kind: "menu", lang: "en", body: "X", action: "start" }))));

  // 3. The Telegram page writes to the same store.
  await ch.saveTelegramTexts(liya, { ask: "Tell us your question in one message, please." });
  check("the Telegram page publishes into the content store", (await C.contentText("ask", "en")) === "Tell us your question in one message, please." && (await ch.telegramTexts()).ask === "Tell us your question in one message, please.");

  // 4. The bot.
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  ch.setTelegramPoster(async (url, body) => {
    posts.push({ url, body: body as Record<string, unknown> });
    return { ok: true, result: { username: "myseed_help_bot" } };
  });
  await ch.connectTelegram(admin, TOKEN, "https://cm.myseed.et");
  const secret = String(posts.find((p) => p.url.endsWith("/setWebhook"))!.body.secret_token);
  const sent = () => posts.filter((p) => p.url.endsWith("/sendMessage")).map((p) => p.body);
  const last = () => sent().at(-1)!;
  const kb = (b: Record<string, unknown>) => ((b.reply_markup as { inline_keyboard?: { text: string; callback_data?: string }[][] } | undefined)?.inline_keyboard ?? []).flat();
  const msg = (text: string, id = 1) => ch.telegramUpdate(secret, secret, { message: { message_id: id, text, chat: { id: 888, type: "private" }, from: { id: 888, first_name: "Hana" } } });
  const press = (data: string) => ch.telegramUpdate(secret, secret, { callback_query: { id: `cb${Math.random()}`, data, from: { id: 888, first_name: "Hana" }, message: { chat: { id: 888, type: "private" } } } });

  await msg("/start");
  const menu = last();
  check("/start shows the welcome and the menu in both languages", String(menu.text).includes("Welcome to MySeed Support") && kb(menu).some((b) => b.callback_data === "sm:mine") && kb(menu).some((b) => b.callback_data === "sm:settings") && kb(menu).length <= 8, menu);
  await press("sm:mine");
  check("My requests opens its submenu", kb(last()).some((b) => b.callback_data === "mn:requests") && kb(last()).some((b) => b.callback_data === "mn:history") && kb(last()).some((b) => b.callback_data === "m"));
  await press("sm:settings");
  check("Settings has the language", kb(last()).some((b) => b.callback_data === "lang"));
  await press("lang");
  check("Language offers English and Amharic", kb(last()).map((b) => b.callback_data).join() === "l:en,l:am");
  await press("l:am");
  await press("sm:help");
  const amMenu = last();
  check("after choosing Amharic the menu is in Amharic only", kb(amMenu).some((b) => b.text === "ውይይት ይጀምሩ") && !kb(amMenu).some((b) => b.text.includes("Start a Conversation")), kb(amMenu).map((b) => b.text));
  await press("l:en");
  await press("mn:requests");
  check("no requests yet", String(last().text) === "You have no open support requests.");
  await press("mn:start");
  check("Start a Conversation lists the topics", kb(last()).filter((b) => b.callback_data?.startsWith("tp:")).length === 7);
  await press("tp:topic.payments");
  check("a topic asks for the question", String(last().text).includes("Tell us your question"));
  await msg("I paid but my plan is not active", 2);
  const tk = await get<{ id: string; number: number; queue_id: string; subject: string; assignee_id: string | null }>("SELECT t.id, t.number, t.queue_id, t.subject, t.assignee_id FROM sup_tickets t JOIN sup_customers c ON c.id = t.customer_id WHERE c.external_id = 'tg:888'");
  check("the request goes to the topic's queue, named by the topic", tk?.queue_id === finance && tk.subject.startsWith("Payments and Billing:"), tk);
  const after = sent().slice(-2).map((b) => String(b.text));
  check("the customer gets the number and who has it", after[0].includes(`#${tk!.number}`) && /agent is available|number \d+ in line|offline/.test(after[1]), after);
  await press("mn:requests");
  check("My Support Requests lists it with its status", String(last().text).includes(`#${tk!.number}`) && /In progress|Received/.test(String(last().text)) && kb(last()).some((b) => b.callback_data === "tr"));
  await msg("/transfer", 3);
  check("/transfer offers the topics", kb(last()).filter((b) => b.callback_data?.startsWith("tt:")).length === 7);
  await press("tt:topic.technical");
  const moved = await get<{ queue_id: string; assignee_id: string | null }>("SELECT queue_id, assignee_id FROM sup_tickets WHERE id = ?", tk!.id);
  check("changing the topic moves the request to that queue", moved?.queue_id === general && String(last().text).includes("Technical Problems"), { moved, text: last().text });
  await msg("/close", 4);
  check("/close closes it", (await get<{ status: string }>("SELECT status FROM sup_tickets WHERE id = ?", tk!.id))?.status === "closed" && String(last().text).includes("is closed"));
  await press("mn:history");
  check("Previous Conversations shows it with Reopen", String(last().text).includes(`#${tk!.number}`) && kb(last()).some((b) => b.callback_data === "ro"));
  await press("ro");
  check("it can be reopened", (await get<{ status: string }>("SELECT status FROM sup_tickets WHERE id = ?", tk!.id))?.status === "open" && String(last().text).includes("open again"));

  // FAQ search.
  await ch.saveArticle(liya, { title: "Why is my plan not active after paying?", body: "Plans start within 10 minutes of a payment.", keywords: "plan payment active", published: true });
  await press("mn:faq");
  check("FAQ asks for the question", String(last().text).startsWith("Type your question"));
  await msg("plan not active", 5);
  check("the answer lists matching articles", String(last().text).startsWith("These answers may help") && kb(last()).some((b) => b.text.startsWith("Why is my plan")), last());
  const tickets = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_tickets t JOIN sup_customers c ON c.id = t.customer_id WHERE c.external_id = 'tg:888'"))?.n);
  check("a FAQ search does not open a request", tickets === 1);

  // Calls.
  const cust = await get<{ id: string }>("SELECT id FROM sup_customers WHERE external_id = 'tg:888'");
  await ch.notifyTelegramCall(cust!.id, "incoming", "Abel Tesfaye");
  check("an incoming call is announced with a button that opens the app", String(last().text).startsWith("Abel from MySeed Support is calling you") && JSON.stringify(last().reply_markup).includes("support-widget?tg=default&call=in"), last());
  await ch.notifyTelegramCall(cust!.id, "missed");
  check("a missed call is said too", String(last().text).startsWith("We tried to call you"));

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FAIL crashed", e);
  process.exit(1);
});
