// Ratings at the end of a conversation: when an agent solves a Telegram conversation the bot asks for one to five
// stars, then an optional comment; the rating is kept on the agent who handled it (and stays when conversations are
// cleared); the support app's rating is the same; a rating changes within its session and a reopened conversation
// solved again is a new one; agents see their own ratings, leads anyone's.
import { closeDb, get, run } from "../../src/server/db";
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

async function main() {
  const admin = await by("admin@demo.local");
  const sara = await by("sara@demo.local");
  const dawit = await by("dawit@demo.local");
  await sd.saveSupportConfig(admin, { enabled: true, leads: [admin.id] });
  await sd.saveQueue(admin, { name: "Help", keywords: [], members: [sara.id, dawit.id], strategy: "least_busy" });
  await sd.setAgentStatus(sara, "online");
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  ch.setTelegramPoster(async (url, body) => (posts.push({ url, body: body as Record<string, unknown> }), { ok: true, result: { username: "myseed_help_bot", message_id: posts.length } }));
  await ch.connectTelegram(admin, "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", "https://cm.myseed.et");
  const secret = String(posts.find((p) => p.url.endsWith("/setWebhook"))!.body.secret_token);
  const msg = (text: string, id = Date.now()) => ch.telegramUpdate(secret, secret, { message: { message_id: id, text, chat: { id: 555, type: "private" }, from: { id: 555, first_name: "Meron" } } });
  const press = (data: string) => ch.telegramUpdate(secret, secret, { callback_query: { id: `cb${Math.random()}`, data, from: { id: 555, first_name: "Meron" }, message: { chat: { id: 555, type: "private" } } } });
  const last = () => posts.filter((p) => p.url.endsWith("/sendMessage")).at(-1)!.body;
  const kb = () => ((last().reply_markup as { inline_keyboard?: { text: string; callback_data: string }[][] } | undefined)?.inline_keyboard ?? []).flat();

  await msg("/start");
  await press("l:en");
  await msg("My payment is not showing");
  const t = (await get<{ id: string; assignee_id: string | null }>("SELECT id, assignee_id FROM sup_tickets ORDER BY created_at DESC LIMIT 1"))!;
  await sd.assignTicket(admin, t.id, sara.id);
  await sd.agentReply(sara, t.id, { body: "Found it, your plan is active now." });
  posts.length = 0;
  await sd.setTicketStatus(sara, t.id, "solved");
  check("solving a Telegram conversation asks the customer to rate it, naming the agent", /How was the help from Sara/.test(String(last().text)) && kb().length === 5 && kb()[0]!.callback_data === `rt:${t.id}:5`, last());
  await press(`rt:${t.id}:4`);
  check("the stars are kept and a comment is offered", /Anything you want to add/.test(String(last().text)) && kb().some((b) => b.callback_data === "rs"));
  await msg("Quick and kind, thank you");
  check("the comment is kept with the stars", /we have your comment/.test(String(last().text)));
  const r = (await get<{ rating: number; comment: string; agent_id: string; channel: string }>("SELECT rating, comment, agent_id, channel FROM sup_ratings WHERE ticket_id = ?", t.id))!;
  check("the rating is on the agent who handled it", r.rating === 4 && r.comment === "Quick and kind, thank you" && r.agent_id === sara.id && r.channel === "telegram", r);
  check("and on the conversation", (await get<{ rating: number; rated_agent_id: string }>("SELECT rating, rated_agent_id FROM sup_tickets WHERE id = ?", t.id))?.rated_agent_id === sara.id);
  posts.length = 0;
  await sd.setTicketStatus(sara, t.id, "closed");
  check("closing after it was rated does not ask again", !posts.some((p) => /How was the help/.test(String(p.body.text ?? ""))));
  check("the comment did not open a new conversation", Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_tickets"))?.n) === 1);

  // Pressing again in the same session changes the stars, not the count.
  await press(`rt:${t.id}:2`);
  check("rating again in the same session changes it", Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_ratings WHERE ticket_id = ?", t.id))?.n) === 1 && (await get<{ rating: number }>("SELECT rating FROM sup_ratings WHERE ticket_id = ?", t.id))?.rating === 2);
  check("a low rating tells the agent", !!(await get("SELECT id FROM notifications WHERE user_id = ? AND title LIKE ?", sara.id, "%rated 2 of 5%")));
  check("an open conversation cannot be rated", /once your question is solved/.test(await err(async () => {
    await sd.setTicketStatus(sara, t.id, "open");
    await sd.recordRating(t.id, 5, null, "app");
  })));
  // Solved again: a new session, asked again, a second rating for the agent.
  await run("UPDATE sup_tickets SET solved_at = NULL WHERE id = ?", t.id);
  posts.length = 0;
  await sd.setTicketStatus(sara, t.id, "solved");
  check("a conversation solved again is asked again", /How was the help/.test(String(last().text)));
  await press(`rt:${t.id}:5`);
  await press("rs");
  check("and is a second rating", Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_ratings WHERE ticket_id = ?", t.id))?.n) === 2);

  // What agents and leads see.
  const mine = await sd.agentRatings(sara);
  check("an agent sees their own ratings: average, stars and comments", mine.count === 2 && mine.average === 3.5 && mine.stars.join() === "0,1,0,0,1" && mine.recent.some((x) => x.comment === "Quick and kind, thank you"), mine);
  check("an agent cannot see another agent's", /Only support leads/.test(await err(() => sd.agentRatings(dawit, sara.id))));
  check("a lead can", (await sd.agentRatings(admin, sara.id)).count === 2);
  check("the agent's own figures count them", (await sd.agentHome(sara)).stats.ratings === 2);

  // The ratings stay on the agent when the conversations are cleared.
  await run("DELETE FROM sup_tickets WHERE id = ?", t.id);
  check("ratings stay on the agent when conversations are deleted", (await sd.agentRatings(sara)).count === 2);
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
