// Starter answers behind the help menu: added once in English and Amharic, each shown to customers of its own
// language, in sections (Payments: Paying, Problems, Refunds), and never added back after the team deletes or
// changes one. In Telegram a grouped topic shows its sections, then the answers, each read in the chat.
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as h from "../../src/server/support-help";
import * as ch from "../../src/server/support-channels";
import * as sd from "../../src/server/support-desk";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};

async function main() {
  await h.helpCategories();
  const n = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_articles WHERE keywords LIKE '%starter%'"))?.n);
  check("starter answers are added for every topic, in both languages", n === 60, n);
  check("every starter answer is in a section", !(await get("SELECT id FROM sup_articles WHERE keywords LIKE '%starter%' AND keywords NOT LIKE '%section:%'")));
  const en = await h.categoryArticles("payments", 60, "en");
  const am = await h.categoryArticles("payments", 60, "am");
  check("English customers get the English answers", en.length === 7 && en.every((a) => /[a-z]/i.test(a.title)), en.map((a) => a.title));
  check("Amharic customers get the Amharic ones", am.length === 7 && am.every((a) => /[ሀ-፿]/.test(a.title)), am.map((a) => a.title));
  check("in sections", [...new Set(en.map((a) => a.section))].sort().join() === "Paying,Problems,Refunds", en.map((a) => a.section));
  check("customers who chose no language see English", (await h.categoryArticles("payments", 60, "both")).map((a) => a.id).join() === en.map((a) => a.id).join());
  check("search keeps to the language too", (await ch.searchArticles("", 50, "am")).every((a) => /[ሀ-፿]/.test(a.title)));

  // In Telegram: Payments shows its sections, a section its answers, an answer is read in the chat.
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  ch.setTelegramPoster(async (url, body) => (posts.push({ url, body: body as Record<string, unknown> }), { ok: true, result: { username: "myseed_help_bot", message_id: posts.length } }));
  await ch.connectTelegram(admin, "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", "https://cm.myseed.et");
  const secret = String(posts.find((p) => p.url.endsWith("/setWebhook"))!.body.secret_token);
  const press = (data: string) => ch.telegramUpdate(secret, secret, { callback_query: { id: `cb${Math.random()}`, data, from: { id: 321, first_name: "Abel" }, message: { chat: { id: 321, type: "private" } } } });
  const last = () => posts.filter((p) => p.url.endsWith("/sendMessage")).at(-1)!.body;
  const kb = () => ((last().reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] }).inline_keyboard ?? []).flat();
  await ch.telegramUpdate(secret, secret, { message: { message_id: 1, text: "/start", chat: { id: 321, type: "private" }, from: { id: 321, first_name: "Abel" } } });
  await press("l:en");
  await press("c:payments");
  check("a grouped topic shows its sections with how many answers", /Choose a section/.test(String(last().text)) && kb().some((b) => b.text === "Paying (3)") && kb().some((b) => b.text === "Problems (3)"), kb().map((b) => b.text));
  await press(kb().find((b) => b.text.startsWith("Problems"))!.callback_data);
  check("a section lists its answers", /Payments › Problems/.test(String(last().text)) && kb().some((b) => b.text === "My bank receipt was not accepted"), kb().map((b) => b.text));
  const back = kb().find((b) => b.text === "« Back")!.callback_data;
  await press(kb().find((b) => b.text === "My bank receipt was not accepted")!.callback_data);
  check("the answer is read in the chat and Back returns to its section", /cannot be read/.test(String(last().text)) && kb().some((b) => b.callback_data.startsWith("cs:payments:")), kb());
  check("the section's Back returns to the topic", back === "c:payments");

  await run("DELETE FROM sup_articles WHERE id = ?", en[0]!.id);
  await h.helpCategories();
  check("a deleted answer is not added back", !(await get("SELECT id FROM sup_articles WHERE id = ?", en[0]!.id)) && (await all("SELECT id FROM sup_articles WHERE keywords LIKE '%starter%'")).length === 59);
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
