// Update 1.1, phase 11: connected systems. Each support app has channel switches (web chat, Telegram, calls, SMS),
// its own Telegram bot (its customers and tickets belong to it, replies go back through it), a signed webhook for
// ticket events, and customer sync from its server.
import http from "node:http";
import crypto from "node:crypto";
import { all, closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ch from "../../src/server/support-channels";
import * as cs from "../../src/server/connected-systems";
import * as C from "../../src/server/connectors";

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

let base = "";
const hooks: { event: string; sig: string; body: string }[] = [];
const sms: Record<string, unknown>[] = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url === "/hook") hooks.push({ event: String(req.headers["x-myseed-event"]), sig: String(req.headers["x-myseed-signature"]), body });
    if (req.url === "/sms") sms.push(JSON.parse(body || "{}"));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: `m-${sms.length}` }));
  });
});

async function main() {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const admin = await by("admin@demo.local");
  const sara = await by("sara@demo.local");
  const dawit = await by("dawit@demo.local");
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  const qAcademy = await sd.saveQueue(admin, { name: "Academy", keywords: [], members: [sara.id], strategy: "least_busy" });
  const app = await sd.saveApp(admin, { name: "MySeed Academy", origins: ["https://academy.example"], queueId: qAcademy, verifyIdentity: true });
  const row = (await sd.listApps(admin))[0]!;
  const A = await sd.appByKey(row.publicKey, "https://academy.example");
  const sign = (id: string) => crypto.createHmac("sha256", app.secret!).update(id).digest("hex");

  // Channels.
  const s0 = (await cs.listSystems(admin)).systems[0];
  check("every channel is on at first", Object.values(s0.channels).every(Boolean));
  await cs.saveSystem(admin, app.id, { channels: { web_chat: false } });
  const cust = await sd.identify(A, { id: "stu-1", name: "Abel", phone: "+251911222333", hash: sign("stu-1") });
  check("identify tells the widget which channels are on", cust.channels.web_chat === false && cust.channels.calls === true);
  check("web chat off refuses new conversations", /Web chat is switched off/.test((await err(() => sd.customerCreateTicket(A, cust.token, { message: "hi" }))) ?? ""));
  check("only Admin changes systems", !!(await err(() => cs.saveSystem(sara, app.id, { channels: { web_chat: true } }))));

  // Webhook: signed events.
  const saved = await cs.saveSystem(admin, app.id, { channels: { web_chat: true }, webhookUrl: `${base}/hook`, description: "Students and parents" });
  check("a webhook gets a signing secret, shown once", !!saved.webhookSecret?.startsWith("whsec_"));
  const t1 = await sd.customerCreateTicket(A, cust.token, { subject: "Video", message: "The video stops" });
  const created = hooks.find((h) => h.event === "ticket.created");
  check("ticket.created reaches the system", !!created && JSON.parse(created.body).data.customerId === "stu-1");
  check("signed with the secret", !!created && created.sig === cs.signBody(saved.webhookSecret!, created.body));
  await sd.setAgentStatus(sara, "online");
  await sd.agentReply(sara, t1, { body: "Try again", status: "solved" });
  check("replies and solving are sent", hooks.some((h) => h.event === "ticket.replied" && JSON.parse(h.body).data.reply === "Try again") && hooks.some((h) => h.event === "ticket.solved"));
  await sd.agentReply(sara, t1, { body: "secret note", internal: true });
  check("internal notes are never sent", !hooks.some((h) => h.body.includes("secret note")));
  check("the last delivery is shown", (await cs.listSystems(admin)).systems[0].webhookLast?.ok === true);

  // Its own Telegram bot.
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  ch.setTelegramPoster(async (url, body) => {
    posts.push({ url, body: body as Record<string, unknown> });
    return { ok: true, result: { username: "academy_help_bot" } };
  });
  const TOKEN = "777000:AAacademyBotTokenForTests_x";
  check("a bad token is refused", /BotFather/.test((await err(() => ch.connectSystemBot(admin, app.id, "nope", "https://cm.example"))) ?? ""));
  await ch.connectSystemBot(admin, app.id, TOKEN, "https://cm.example");
  const hook = posts.find((p) => p.url.includes(TOKEN) && p.url.endsWith("/setWebhook"))!;
  const secret = String(hook.body.secret_token);
  check("the bot gets its own webhook address", String(hook.body.url) === `https://cm.example/api/support/telegram/${secret}`);
  check("the system shows its bot", (await cs.listSystems(admin)).systems[0].bot === "academy_help_bot");
  posts.length = 0;
  await ch.telegramUpdate(secret, secret, { message: { message_id: 1, text: "My payment is not showing", chat: { id: 4242, type: "private" }, from: { id: 4242, first_name: "Hana" } } });
  const t2 = await get<{ id: string; app_id: string; queue_id: string; channel: string }>("SELECT t.id, t.app_id, t.queue_id, t.channel FROM sup_tickets t JOIN sup_customers c ON c.id = t.customer_id WHERE c.external_id = 'tg:4242'");
  check("a message to the system's bot is that system's ticket, in its queue", t2?.app_id === app.id && t2.queue_id === qAcademy && t2.channel === "telegram", t2);
  check("the thank-you goes out through the system's bot", posts.some((p) => p.url.includes(TOKEN) && p.url.endsWith("/sendMessage")));
  posts.length = 0;
  await sd.agentReply(sara, t2!.id, { body: "We are checking" });
  check("the agent's reply goes back through the same bot", posts.some((p) => p.url.includes(TOKEN) && p.url.endsWith("/sendMessage") && String(p.body.text).includes("We are checking")));
  check("a wrong secret is refused", !!(await err(() => ch.telegramUpdate("wrong", null, { message: { message_id: 2, text: "x", chat: { id: 1, type: "private" } } }))));
  await cs.saveSystem(admin, app.id, { channels: { telegram: false } });
  posts.length = 0;
  const before = (await all("SELECT 1 FROM sup_tickets")).length;
  await ch.telegramUpdate(secret, secret, { message: { message_id: 3, text: "/start", chat: { id: 5151, type: "private" }, from: { id: 5151 } } });
  check("Telegram off: the customer is told, no ticket", (await all("SELECT 1 FROM sup_tickets")).length === before && posts.some((p) => String(p.body.text).includes("not available")));
  await cs.saveSystem(admin, app.id, { channels: { telegram: true } });
  check("the same token cannot serve two systems", /already uses this bot/.test((await err(async () => {
    const b = await sd.saveApp(admin, { name: "Transaction Verify", origins: [] });
    await ch.connectSystemBot(admin, b.id, TOKEN, "https://cm.example");
  })) ?? ""));
  await ch.disconnectSystemBot(admin, app.id);
  check("disconnecting removes the bot", (await cs.listSystems(admin)).systems[0].bot === null);

  // Customer sync from the system's server.
  check("sync needs the secret", /Wrong app key/.test((await err(() => cs.syncCustomers(row.publicKey, "bad", [{ id: "x" }]))) ?? ""));
  const sy = await cs.syncCustomers(row.publicKey, app.secret!, [{ id: "stu-1", name: "Abel Tesfaye", email: "abel@ex.com" }, { id: "stu-2", name: "Liya", phone: "+251900000002" }]);
  check("sync creates and updates customers", sy.created === 1 && sy.updated === 1 && (await get<{ name: string }>("SELECT name FROM sup_customers WHERE app_id = ? AND external_id = 'stu-1'", app.id))?.name === "Abel Tesfaye", sy);

  // SMS from the ticket.
  await cs.saveSystem(admin, app.id, { channels: { sms: false } });
  check("SMS off is refused", /SMS is switched off/.test((await err(() => sd.agentSms(sara, t1, "Hello"))) ?? ""));
  await cs.saveSystem(admin, app.id, { channels: { sms: true } });
  await C.saveConnector(admin, { name: "Test SMS", capability: "sms", baseUrl: base, auth: { kind: "none" } as never, operation: { method: "POST", path: "/sms", contentType: "json", map: { to: "{{to}}", text: "{{message}}" }, headers: {} }, response: { idPath: "id" }, secrets: { token: "k" }, status: "active" });
  await sd.agentSms(sara, t1, "Your access is back");
  check("the SMS goes to the customer's phone", sms.some((m) => m.to === "+251911222333" && m.text === "Your access is back"), sms);
  check("and is kept on the ticket", !!(await get("SELECT 1 FROM sup_messages WHERE ticket_id = ? AND body LIKE 'SMS to +251911222333:%'", t1)));

  // Traffic and rights.
  const sys = (await cs.listSystems(admin)).systems[0];
  check("traffic per system and channel", sys.tickets7 === 2 && sys.byChannel.widget === 1 && sys.byChannel.telegram === 1, sys);
  check("members cannot see systems", !!(await err(() => cs.listSystems(dawit))));

  server.close();
  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  server.close();
  await closeDb().catch(() => {});
  process.exit(1);
});
