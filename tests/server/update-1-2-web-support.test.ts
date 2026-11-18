// The support app on the web (/support-app): signing in with Telegram's Login Widget (the same customer as in the
// bot chat; forged or old data refused) or as a guest with a phone number, matched to the parents' records.
import crypto from "node:crypto";
import { closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ch from "../../src/server/support-channels";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;

// What Telegram's Login Widget sends, signed with the bot's token.
function login(token: string, user: Record<string, string | number>) {
  const check = Object.keys(user).sort().map((k) => `${k}=${user[k]}`).join("\n");
  const hash = crypto.createHmac("sha256", crypto.createHash("sha256").update(token).digest()).update(check).digest("hex");
  return { ...user, hash };
}

async function main() {
  const admin = await by("admin@demo.local");
  check("nothing to sign in to while support is off", /not available/.test(await err(() => ch.webAppSignIn({ guest: { device: "dabcdefabcdef12", name: "Hana", phone: "0911223344" } }))));
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  ch.setTelegramPoster(async () => ({ ok: true, result: { username: "myseed_help_bot", message_id: 1 } }));
  const TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  await ch.connectTelegram(admin, TOKEN, "https://cm.myseed.et");
  const info = await ch.webAppLoginInfo();
  check("the page offers Telegram's sign-in with the bot, and guests", info.enabled && info.bot === "myseed_help_bot" && info.guest, info);

  // The same person writes to the bot first.
  const secret = (JSON.parse((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'sup.telegram'"))!.value) as { secret: string }).secret;
  await ch.telegramUpdate(secret, secret, { message: { message_id: 1, text: "/start", chat: { id: 5151, type: "private" }, from: { id: 5151, first_name: "Selam" } } });
  const botCustomer = (await get<{ id: string }>("SELECT id FROM sup_customers WHERE external_id = 'tg:5151'"))!.id;

  const now = Math.floor(Date.now() / 1000);
  const tg = await ch.webAppSignIn({ telegram: login(TOKEN, { id: 5151, first_name: "Selam", auth_date: now }) });
  check("Telegram's sign-in is the same customer as in the bot's chat", tg.session.customer.id === botCustomer && tg.session.customer.telegram === true, tg.session.customer);
  check("a changed name is refused", /could not confirm/.test(await err(() => ch.webAppSignIn({ telegram: { ...login(TOKEN, { id: 5151, first_name: "Selam", auth_date: now }), first_name: "Eve" } }))));
  check("data signed with another bot is refused", /could not confirm/.test(await err(() => ch.webAppSignIn({ telegram: login("999:other", { id: 5151, first_name: "Selam", auth_date: now }) }))));
  check("a sign-in older than a month is refused", /old/.test(await err(() => ch.webAppSignIn({ telegram: login(TOKEN, { id: 5151, first_name: "Selam", auth_date: now - 31 * 86400 }) }))));

  // A guest whose number is a parent's in Noor.
  await run("INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES (?, 'parents', 'p77', 'Almaz Bekele', ?, ?)", uid(), JSON.stringify({ Name: "Almaz Bekele", "Phone Number": "0911223344" }), nowIso());
  check("a guest needs a phone number", /phone number/.test(await err(() => ch.webAppSignIn({ guest: { device: "dabcdefabcdef12", name: "Almaz", phone: "12" } }))));
  check("and a name", /name/.test(await err(() => ch.webAppSignIn({ guest: { device: "dabcdefabcdef12", name: "", phone: "0911223344" } }))));
  const g = await ch.webAppSignIn({ guest: { device: "dabcdefabcdef12", name: "Almaz", phone: "+251 911 223 344" } });
  const row = (await get<{ phone: string; meta: string; external_id: string }>("SELECT phone, meta, external_id FROM sup_customers WHERE id = ?", g.session.customer.id))!;
  const meta = JSON.parse(row.meta) as Record<string, string>;
  check("a guest is a customer of their own, kept on their device", row.external_id === "web:dabcdefabcdef12" && g.session.customer.telegram === false);
  check("the agent sees the number is not confirmed", /guest/.test(meta["Signed in"] ?? "") && /not confirmed/.test(meta["Signed in"] ?? ""), meta);
  check("their number is matched to the parent in Noor", Object.values(meta).some((v) => /Almaz Bekele/.test(v)), meta);
  const again = await ch.webAppSignIn({ guest: { device: "dabcdefabcdef12", name: "Almaz B", phone: "0911223344" } });
  check("the same device is the same customer next time", again.session.customer.id === g.session.customer.id && again.session.customer.name === "Almaz B");

  // A guest can ask a question through the support app's API.
  const app = await sd.defaultTelegramApp();
  const t = await sd.customerCreateTicket(app, g.session.token, { subject: "Payment", message: "My payment did not show" });
  check("a guest can start a conversation", !!(await get("SELECT id FROM sup_tickets WHERE id = ? AND customer_id = ?", t, g.session.customer.id)));
  check("and a Telegram customer's web conversations are their bot conversations", (await sd.customerTickets(app, tg.session.token)).length >= 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
