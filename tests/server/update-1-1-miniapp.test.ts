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
  check("the menu opens the support app", rows.some((b) => b.text === "Open the support app" && b.web_app?.url === "https://cm.myseed.et/support-widget?tg=default"));
  check("and calling support in it", rows.some((b) => b.text === "Call support" && b.web_app?.url === "https://cm.myseed.et/support-widget?tg=default&call=1"));
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
  check("the agent's reply shows in the app", (await sd.customerMessages(A, mini.session.token, tid)).messages.some((m) => m.body === "We activated it"));
  check("and reaches the chat as a message", posts.some((p) => p.url.endsWith("/sendMessage") && String(p.body.chat_id) === "4242" && /We activated it/.test(String(p.body.text))));
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
  check("a file can become a link", item.kind === "link" && item.url === "https://drive.example/guide" && !item.fileName);
  await bm.saveContent(admin, app.id, { id: link.id, title: "How to sign in", file: { name: "signin.png", mime: "image/png", data: Buffer.from("png") } });
  item = (await bm.listContent(admin, app.id)).find((c) => c.id === link.id)!;
  check("and a link a file", item.kind === "image" && item.title === "How to sign in" && !item.url);
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
