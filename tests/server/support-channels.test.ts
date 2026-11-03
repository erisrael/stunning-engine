// Customer support by email and Telegram, and the knowledge base: new mail opens a ticket given to an agent, a reply
// to the agent's email continues it (by [#number] or by the headers), the agent's reply goes out by email; Telegram
// messages open and continue a ticket and replies go back to the chat; articles written by agents, published by
// leads, found by customers' words, read and voted on.
process.env.MAIL_FAKE = "1";
import { get, run, closeDb, nowIso, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ch from "../../src/server/support-channels";
import { deliverForTest, memOutbox } from "../../src/server/mail";

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
  const [abel, liya, dawit] = [await by("abel@demo.local"), await by("liya@demo.local"), await by("dawit@demo.local")];
  const now = nowIso();
  await run("INSERT INTO email_senders (id, address, display_name, user_id, mailbox, active, created_at, updated_at) VALUES (?, 'support@myseed.test', 'Myseed support', ?, 1, 1, ?, ?)", uid("snd_"), admin.id, now, now);

  check("the mailbox must exist in the app", !!(await throws(() => sd.saveSupportConfig(admin, { enabled: true, mailbox: "nobody@myseed.test" }))));
  await sd.saveSupportConfig(admin, { enabled: true, leads: [liya.id], mailbox: "support@myseed.test" });
  await sd.saveQueue(liya, { name: "General", members: [abel.id] });
  await sd.setAgentStatus(abel, "online");

  // Email in.
  await deliverForTest("support@myseed.test", { from: "parent@example.com", fromName: "Almaz Bekele", subject: "My son cannot open grade 6 math", text: "The videos stop loading after a minute.", messageId: "<m1@example.com>" });
  const r1 = await ch.pollSupportMailbox();
  const t = await get<{ id: string; number: number; channel: string; assignee_id: string | null; subject: string }>("SELECT id, number, channel, assignee_id, subject FROM sup_tickets WHERE channel = 'email' LIMIT 1");
  check("new mail opens a ticket from the sender", r1.read === 1 && !!t && t.subject === "My son cannot open grade 6 math");
  check("given to the online agent", t?.assignee_id === abel.id);
  check("the customer is the sender", (await get<{ email: string; name: string }>("SELECT c.email, c.name FROM sup_customers c JOIN sup_tickets t ON t.customer_id = c.id WHERE t.id = ?", t!.id))?.name === "Almaz Bekele");
  check("the same mail is not read twice", (await ch.pollSupportMailbox()).read === 0);

  // The agent's reply goes out by email.
  await sd.agentReply(abel, t!.id, { body: "Please try the low-quality setting under the video." });
  const out = memOutbox.list.at(-1);
  check("the reply goes to the customer by email with the number", out?.to[0] === "parent@example.com" && out.subject.includes(`[#${t!.number}]`) && out.inReplyTo === "<m1@example.com>", out);
  check("internal notes do not go out", (await sd.agentReply(abel, t!.id, { body: "Check CDN", internal: true }), memOutbox.list.length === 1));

  // The customer answers by email: by the headers, and by the number.
  await deliverForTest("support@myseed.test", { from: "parent@example.com", subject: `Re: My son cannot open grade 6 math [#${t!.number}]`, text: "That worked, thank you!\n\nOn Mon, Support wrote:\n> Please try", inReplyTo: out!.messageId });
  await ch.pollSupportMailbox();
  const msgs = await sd.ticketDetail(abel, t!.id);
  check("the reply continues the ticket, without the quoted part", msgs.messages.at(-1)?.body === "That worked, thank you!", msgs.messages.at(-1));
  await deliverForTest("support@myseed.test", { from: "stranger@example.com", subject: `Re: something [#${t!.number}]`, text: "I am not the customer" });
  await ch.pollSupportMailbox();
  check("someone else using the number gets a new ticket", Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM sup_tickets WHERE channel = 'email'"))?.c) === 2);
  await deliverForTest("support@myseed.test", { from: "support@myseed.test", subject: "loop", text: "our own" });
  check("our own mail is left alone", (await ch.pollSupportMailbox()).read === 0);

  // Telegram.
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  ch.setTelegramPoster(async (url, body) => (posts.push({ url, body: body as Record<string, unknown> }), { ok: true, result: { username: "myseed_help_bot" } }));
  check("only Admin connects the bot", !!(await throws(() => ch.connectTelegram(abel, "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", "https://cm.myseed.et"))));
  check("a bad token is refused", !!(await throws(() => ch.connectTelegram(admin, "nope", "https://cm.myseed.et"))));
  await ch.connectTelegram(admin, "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", "https://cm.myseed.et");
  const hook = posts.find((p) => p.url.endsWith("/setWebhook"))!;
  const secret = String(hook.body.secret_token);
  check("the webhook points at this site", String(hook.body.url).startsWith("https://cm.myseed.et/api/support/telegram/") && (await ch.telegramInfo()).bot === "myseed_help_bot");
  check("a wrong secret is refused", !!(await throws(() => ch.telegramUpdate("wrong", null, {}))));
  const msg = (text: string, id = 1) => ({ message: { message_id: id, text, chat: { id: 555, type: "private" }, from: { first_name: "Tigist" } } });
  await ch.telegramUpdate(secret, secret, msg("Hello, how do I renew my subscription?"));
  const tg = await get<{ id: string; number: number; assignee_id: string | null }>("SELECT id, number, assignee_id FROM sup_tickets WHERE channel = 'telegram'");
  check("a Telegram message opens a ticket for an agent", !!tg && tg.assignee_id === abel.id);
  check("the customer is told the number", posts.some((p) => p.url.endsWith("/sendMessage") && String(p.body.text).includes(`#${tg!.number}`)));
  await ch.telegramUpdate(secret, secret, msg("I pay with telebirr", 2));
  check("the next message continues the same ticket", Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM sup_tickets WHERE channel = 'telegram'"))?.c) === 1 && (await sd.ticketDetail(abel, tg!.id)).messages.length === 2);
  await sd.agentReply(abel, tg!.id, { body: "Open Profile, then Subscription, then Renew." });
  check("the agent's reply goes back to the chat", posts.some((p) => p.url.endsWith("/sendMessage") && p.body.chat_id === "555" && String(p.body.text).startsWith("Open Profile")));

  // Knowledge base.
  check("members cannot write articles", !!(await throws(() => ch.saveArticle(dawit, { title: "x", body: "y" }))));
  check("agents cannot publish", !!(await throws(() => ch.saveArticle(abel, { title: "x", body: "y", published: true }))));
  const draft = await ch.saveArticle(abel, { title: "Videos stop loading", body: "Choose the low-quality setting under the video, or download the lesson on Wi-Fi.", category: "Videos", keywords: "buffering slow stuck" });
  check("drafts are not found by customers", (await ch.searchArticles("videos stop loading")).length === 0);
  await ch.saveArticle(liya, { id: draft, title: "Videos stop loading", body: "Choose the low-quality setting under the video, or download the lesson on Wi-Fi.", category: "Videos", keywords: "buffering slow stuck", published: true });
  await ch.saveArticle(liya, { title: "Renew a subscription", body: "Open Profile, then Subscription, then Renew. Telebirr and CBE Birr work.", category: "Payments", published: true });
  const found = await ch.searchArticles("the video is stuck buffering");
  check("customers find articles by their words (keywords count)", found[0]?.id === draft, found);
  check("unrelated words find nothing", (await ch.searchArticles("zebra galaxy")).length === 0);
  await ch.readArticle(draft);
  await ch.voteArticle(draft, true);
  const a = (await ch.listArticles(abel)).find((x) => x.id === draft)!;
  check("reads and helpful votes are counted", a.views === 1 && a.helpful === 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await closeDb();
});
