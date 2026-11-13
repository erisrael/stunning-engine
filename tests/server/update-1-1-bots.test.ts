// Update 1.1, phase 13: the Telegram bot manager. Per bot: a content library (files and links) opened from the
// bot's menu or sent to every subscriber now or on a schedule; forms and surveys answered in the chat with their
// results; the feedback inbox (new, reviewed, escalated to a ticket); and the bot's own texts and menu buttons.
import { all, closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ch from "../../src/server/support-channels";
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

type Post = { url: string; body: Record<string, unknown> };
const posts: Post[] = [];
const blocked = new Set<string>();
const kb = (p: Post) => ((p.body.reply_markup as { inline_keyboard?: { text: string; callback_data?: string }[][] } | undefined)?.inline_keyboard ?? []).flat();
const last = (chat: string) => posts.filter((p) => String(p.body.chat_id) === chat).at(-1);

async function main() {
  const admin = await by("admin@demo.local");
  const sara = await by("sara@demo.local");
  const dawit = await by("dawit@demo.local");
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  const q = await sd.saveQueue(admin, { name: "Academy", keywords: [], members: [sara.id], strategy: "least_busy" });
  const app = await sd.saveApp(admin, { name: "MySeed Academy", origins: [], queueId: q });
  ch.setTelegramPoster(async (url, body) => {
    const b = body as Record<string, unknown>;
    posts.push({ url, body: b });
    if (blocked.has(String(b.chat_id))) return { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" };
    return { ok: true, result: { username: "academy_help_bot", message_id: posts.length } };
  });
  const TOKEN = "888000:AAbotManagerTokenForTests_xyz";
  await ch.connectSystemBot(admin, app.id, TOKEN, "https://cm.example");
  const secret = (await get<{ tg_secret: string }>("SELECT tg_secret FROM sup_apps WHERE id = ?", app.id))!.tg_secret;
  const msg = (chat: number, text: string, name = "Hana") => ch.telegramUpdate(secret, secret, { message: { message_id: Date.now(), text, chat: { id: chat, type: "private" }, from: { id: chat, first_name: name } } });
  const press = (chat: number, data: string) => ch.telegramUpdate(secret, secret, { callback_query: { id: `cb${Date.now()}`, data, from: { id: chat, first_name: "Hana" }, message: { chat: { id: chat, type: "private" } } } });

  // Bots.
  const bots = await bm.listBots(admin);
  check("the system's bot is listed", bots.some((b) => b.key === app.id && b.username === "academy_help_bot"), bots);
  check("members cannot manage bots", /support leads/.test((await err(() => bm.listBots(dawit))) ?? ""));
  check("an unknown bot is refused", !!(await err(() => bm.saveContent(admin, "sup_nope", { title: "x", url: "https://x.example" }))));

  // Three subscribers write to the bot.
  await msg(1001, "/start");
  await msg(1002, "/start", "Abel");
  await msg(1003, "/start", "Liya");
  check("subscribers are counted", (await bm.listBots(admin)).find((b) => b.key === app.id)?.subscribers === 3);
  const menu = last("1001")!;
  check("the menu has Send feedback", kb(menu).some((b) => b.callback_data === "f"));
  check("no Resources button while the library is empty", !kb(menu).some((b) => b.callback_data === "r"));

  // Content.
  check("content needs a file or a link", /file or a link/.test((await err(() => bm.saveContent(admin, app.id, { title: "Nothing" }))) ?? ""));
  check("a bad link is refused", /http/.test((await err(() => bm.saveContent(admin, app.id, { title: "Bad", url: "javascript:alert(1)" }))) ?? ""));
  check("files over 20 MB are refused", /20 MB/.test((await err(() => bm.saveContent(admin, app.id, { title: "Big", file: { name: "big.mp4", mime: "video/mp4", data: Buffer.alloc(bm.BOT_FILE_MAX + 1) } }))) ?? ""));
  const pdf = await bm.saveContent(admin, app.id, { title: "Grade 6 guide", caption: "Read before the exam", file: { name: "guide.pdf", mime: "application/pdf", data: Buffer.from("%PDF-1.4 test") } });
  const yt = await bm.saveContent(admin, app.id, { title: "How to log in", url: "https://youtu.be/abc123" });
  const lib = await bm.listContent(admin, app.id);
  check("the library lists both, PDF kind detected", lib.length === 2 && lib.find((c) => c.id === pdf.id)?.kind === "pdf" && lib.find((c) => c.id === yt.id)?.kind === "link", lib);
  const pub = (await get<{ pub: string }>("SELECT pub FROM sup_bot_content WHERE id = ?", pdf.id))!.pub;
  check("the file opens with its key", (await bm.contentFile(pdf.id, pub))?.data.toString() === "%PDF-1.4 test");
  check("and not with a wrong key", (await bm.contentFile(pdf.id, "0".repeat(pub.length))) === null && (await bm.contentFile(pdf.id, "")) === null);

  posts.length = 0;
  await msg(1001, "/menu");
  check("the menu now has Resources", kb(last("1001")!).some((b) => b.callback_data === "r"));
  await press(1001, "r");
  check("Resources lists the library", kb(last("1001")!).filter((b) => b.callback_data?.startsWith("r:")).length === 2);
  posts.length = 0;
  await press(1001, `r:${pdf.id}`);
  const doc = posts.find((p) => p.url.endsWith("/sendDocument"));
  check("a PDF is sent as a document by its link", !!doc && String(doc.body.document) === `https://cm.example/api/support/bot-file/${pdf.id}?k=${pub}` && String(doc.body.caption).includes("Read before the exam"), doc);
  check("through the system's own bot", !!doc && doc.url.includes(TOKEN));
  posts.length = 0;
  await press(1001, `r:${yt.id}`);
  check("a link is sent as text", posts.some((p) => p.url.endsWith("/sendMessage") && String(p.body.text).includes("https://youtu.be/abc123")));
  await bm.saveContent(admin, app.id, { id: yt.id, title: "How to log in", active: false });
  posts.length = 0;
  await press(1001, `r:${yt.id}`);
  check("hidden content is no longer given", posts.some((p) => String(p.body.text).includes("no longer available")));

  // Send to every subscriber now; a blocked subscriber is counted and left out next time.
  blocked.add("1003");
  posts.length = 0;
  await bm.schedulePush(admin, app.id, { contentId: pdf.id }, "https://cm.example");
  const sends = posts.filter((p) => p.url.endsWith("/sendDocument"));
  check("Send now reaches every subscriber", sends.length === 3, sends.length);
  const p1 = (await bm.listPushes(admin, app.id))[0];
  check("the send shows delivered and failed", p1.status === "sent" && p1.sent === 2 && p1.failed === 1, p1);
  posts.length = 0;
  await bm.schedulePush(admin, app.id, { message: "New lessons are out" }, "https://cm.example");
  check("a blocked subscriber is left out after", posts.filter((p) => String(p.body.text) === "New lessons are out").length === 2);
  blocked.delete("1003");
  await msg(1003, "/start", "Liya");
  check("writing again brings them back", (await bm.listBots(admin)).find((b) => b.key === app.id)?.subscribers === 3);

  // Scheduled.
  check("a time in the past is refused", /past/.test((await err(() => bm.schedulePush(admin, app.id, { message: "x", sendAt: new Date(Date.now() - 3600e3).toISOString() }, null))) ?? ""));
  const later = new Date(Date.now() + 3600e3).toISOString();
  const sch = await bm.schedulePush(admin, app.id, { message: "Exam tomorrow", sendAt: later }, "https://cm.example");
  const toCancel = await bm.schedulePush(admin, app.id, { message: "Cancelled one", sendAt: later }, "https://cm.example");
  await bm.cancelPush(admin, toCancel.id);
  posts.length = 0;
  await bm.runPushes(new Date().toISOString());
  check("nothing goes out before its time", !posts.length);
  await sd.supportChecks(new Date(Date.now() + 3601e3).toISOString());
  check("the support job sends it when due", posts.filter((p) => String(p.body.text) === "Exam tomorrow").length === 3);
  check("a cancelled send never goes", !posts.some((p) => String(p.body.text) === "Cancelled one"));
  const after = await bm.listPushes(admin, app.id);
  check("statuses are kept", after.find((x) => x.id === sch.id)?.status === "sent" && after.find((x) => x.id === toCancel.id)?.status === "cancelled");
  posts.length = 0;
  await bm.runPushes(new Date(Date.now() + 7200e3).toISOString());
  check("a send goes out once", !posts.length);

  // Forms and surveys.
  check("a choice needs two options", /two choices/.test((await err(() => bm.saveForm(admin, app.id, { title: "S", questions: [{ text: "Pick", type: "choice", options: ["One"] }] }))) ?? ""));
  const form = await bm.saveForm(admin, app.id, {
    title: "Lesson survey",
    intro: "Three quick questions",
    questions: [
      { text: "How do you rate the lessons?", type: "rating" },
      { text: "Which grade?", type: "choice", options: ["Grade 5", "Grade 6"] },
      { text: "Anything else?", type: "text", required: false },
    ],
  });
  posts.length = 0;
  await msg(1002, "/menu", "Abel");
  check("the menu shows Forms and surveys", kb(last("1002")!).some((b) => b.callback_data === "s"));
  await press(1002, `s:${form.id}`);
  const q1 = last("1002")!;
  check("the first question has rating buttons", String(q1.body.text).startsWith("1/3.") && kb(q1).filter((b) => /^q:.+:[1-5]$/.test(b.callback_data ?? "")).length === 5, q1.body);
  const rid = kb(q1)[0]!.callback_data!.split(":")[1];
  await press(1002, `q:${rid}:4`);
  await press(1002, `q:${rid}:4`);
  const q2 = last("1002")!;
  check("a double press does not skip a question", String(q2.body.text).startsWith("2/3."), q2.body.text);
  await msg(1002, "nonsense", "Abel");
  check("a typed answer that is not a choice asks again", posts.some((p) => String(p.body.chat_id) === "1002" && String(p.body.text).includes("use one of the buttons")));
  await msg(1002, "grade 6", "Abel");
  const q3 = last("1002")!;
  check("a typed choice is accepted; an optional question offers Skip", String(q3.body.text).startsWith("3/3.") && kb(q3).some((b) => b.callback_data === `q:${rid}:-`));
  const ticketsBefore = (await all("SELECT 1 FROM sup_tickets")).length;
  await msg(1002, "More science videos please", "Abel");
  check("answers do not open tickets", (await all("SELECT 1 FROM sup_tickets")).length === ticketsBefore);
  check("the customer is thanked", String(last("1002")!.body.text).includes("Thank you"));
  // A second one, skipped text.
  await press(1001, `s:${form.id}`);
  const rid2 = kb(last("1001")!)[0]!.callback_data!.split(":")[1];
  await press(1001, `q:${rid2}:2`);
  await press(1001, `q:${rid2}:0`);
  await press(1001, `q:${rid2}:-`);
  // A third, stopped half way.
  await press(1003, `s:${form.id}`);
  const rid3 = kb(last("1003")!)[0]!.callback_data!.split(":")[1];
  await press(1003, `q:${rid3}:5`);
  await press(1003, `x:${rid3}`);
  await msg(1003, "Hello, my video stops", "Liya");
  check("after Stop, a message is a normal request again", (await all("SELECT 1 FROM sup_tickets")).length === ticketsBefore + 1);
  const fl = (await bm.listForms(admin, app.id))[0];
  check("the form counts finished and unfinished", fl.responses === 2 && fl.started === 3, fl);
  const res = await bm.formResults(admin, form.id);
  check("results average the rating", res.summary[0].type === "rating" && (res.summary[0] as { average: number }).average === 3, res.summary[0]);
  check("results count the choices", JSON.stringify((res.summary[1] as { counts: unknown }).counts) === JSON.stringify([{ option: "Grade 5", n: 1 }, { option: "Grade 6", n: 1 }]), res.summary[1]);
  check("written answers are kept per person", res.responses.some((r) => r.name === "Abel" && r.answers[2] === "More science videos please") && res.responses.some((r) => r.answers[2] === null));
  posts.length = 0;
  await bm.schedulePush(admin, app.id, { formId: form.id }, null);
  check("a form can be sent to everyone with a Start button", posts.filter((p) => kb(p).some((b) => b.callback_data === `s:${form.id}`)).length === 3);
  await bm.saveForm(admin, app.id, { id: form.id, title: "Lesson survey", questions: res.questions, active: false });
  posts.length = 0;
  await press(1001, `s:${form.id}`);
  check("a closed form cannot be started", posts.some((p) => String(p.body.text).includes("closed")));

  // Feedback.
  posts.length = 0;
  await press(1001, "f");
  check("Send feedback asks for it", String(last("1001")!.body.text).includes("Write your feedback"));
  await msg(1001, "The new app is much faster, thank you");
  await msg(1002, "/feedback", "Abel");
  await msg(1002, "Payment page crashes on my phone", "Abel");
  check("feedback does not open tickets", (await all("SELECT 1 FROM sup_tickets")).length === ticketsBefore + 1);
  const inbox = await bm.listFeedback(admin, app.id, "new");
  check("both are in the New inbox", inbox.length === 2 && inbox.every((f) => f.status === "new"), inbox);
  check("the bot shows 2 new", (await bm.listBots(admin)).find((b) => b.key === app.id)?.newFeedback === 2);
  const praise = inbox.find((f) => f.body.includes("faster"))!;
  const crash = inbox.find((f) => f.body.includes("crashes"))!;
  await bm.setFeedbackStatus(admin, praise.id, "reviewed");
  check("marked reviewed", (await bm.listFeedback(admin, app.id, "reviewed")).length === 1);
  const esc = await bm.escalateFeedback(admin, crash.id);
  const t = await get<{ app_id: string; queue_id: string; channel: string; customer_id: string }>("SELECT app_id, queue_id, channel, customer_id FROM sup_tickets WHERE id = ?", esc.ticketId);
  check("escalating opens a ticket for the system, from the customer", t?.app_id === app.id && t.queue_id === q && t.channel === "telegram", t);
  const e1 = (await bm.listFeedback(admin, app.id, "escalated"))[0];
  check("the feedback links to its ticket", e1?.ticketId === esc.ticketId && e1.ticketNumber === esc.number);
  check("it cannot be escalated twice", /already a ticket/.test((await err(() => bm.escalateFeedback(admin, crash.id))) ?? ""));
  posts.length = 0;
  await sd.agentReply(sara, esc.ticketId, { body: "We fixed the payment page" });
  check("the agent's reply reaches the customer on Telegram", posts.some((p) => String(p.body.chat_id) === "1002" && String(p.body.text).includes("We fixed the payment page")));

  // Settings per bot.
  const defBefore = await ch.telegramTexts("default");
  await ch.saveTelegramTexts(admin, { welcome: "Welcome to MySeed Academy", feedback: false, resources: false }, app.id);
  check("the system's bot has its own texts", (await ch.telegramTexts(app.id)).welcome === "Welcome to MySeed Academy" && (await ch.telegramTexts("default")).welcome === defBefore.welcome);
  posts.length = 0;
  await msg(1001, "/start");
  const m2 = last("1001")!;
  check("the bot uses its own welcome and menu", String(m2.body.text).includes("Welcome to MySeed Academy") && !kb(m2).some((b) => b.callback_data === "f" || b.callback_data === "r"), m2.body);
  check("members cannot change texts", !!(await err(() => ch.saveTelegramTexts(dawit, { welcome: "x" }, app.id))));

  // Removing.
  await bm.deleteContent(admin, pdf.id);
  check("removed content is gone", (await bm.contentFile(pdf.id, pub)) === null);
  await bm.deleteForm(admin, form.id);
  check("removing a form removes its answers", !(await get("SELECT id FROM sup_bot_responses WHERE form_id = ?", form.id)));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
