// Recognition: off by default; Admin's switch and weights; scores from finished work (on time, sent back) and
// attendance; who sees the board; kudos and their limits; the month's badges by rule (once); titles from HR.
import { get, run, closeDb, nowIso, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as r from "../../src/server/recognition";

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
  const dev = await by("sara@demo.local");
  const dawit = await by("dawit@demo.local");
  const hana = await by("hana@demo.local");

  check("off by default", !(await r.recognitionConfig()).enabled);
  check("the board is closed while off", /switched off/.test((await throws(() => r.leaderboard(dev))) ?? ""));
  check("only Admin switches it on", !!(await throws(() => r.saveRecognitionConfig(dev, { enabled: true }))));
  await r.saveRecognitionConfig(admin, { enabled: true, topN: 3 });
  check("on", (await r.recognitionConfig()).enabled);
  check("at least one weight", !!(await throws(() => r.saveRecognitionConfig(admin, { weights: { attendance: 0, delivery: 0, quality: 0, collaboration: 0 } }))));

  // Finished work this month: the developer five on time, Dawit five late with two sent back.
  const now = new Date();
  const period = now.toISOString().slice(0, 7);
  const today = now.toISOString().slice(0, 10);
  const task = async (who: string, due: string, n: number) => {
    const id = uid("tsk_");
    await run(
      "INSERT INTO dept_tasks (id, dept, code, title, status, status_category, assignee_id, due_date, created_at, updated_at, completed_at) VALUES (?, 'dev', ?, 'Scored work', 'done', 'done', ?, ?, ?, ?, ?)",
      id,
      `SC-${who.slice(-4)}-${n}`,
      who,
      due,
      nowIso(),
      nowIso(),
      nowIso(),
    );
    return id;
  };
  for (let i = 0; i < 5; i++) await task(dev.id, "2099-01-01", i);
  const late: string[] = [];
  for (let i = 0; i < 5; i++) late.push(await task(dawit.id, "2000-01-01", i));
  for (const id of late.slice(0, 2)) await run("INSERT INTO dept_task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, 'Returned: missing tests', ?)", uid("tcm_"), id, admin.id, nowIso());

  const scores = await r.computeScores(period);
  const sd = scores.find((x) => x.userId === dev.id);
  const sw = scores.find((x) => x.userId === dawit.id);
  check("on-time work scores delivery and quality", sd?.parts.delivery === 100 && sd.parts.quality === 100, sd);
  check("late work and returns pull the score down", !!sw && (sw.parts.delivery ?? 100) < 60 && sw.parts.quality === 60, sw);
  check("ranked best first", !!sd && !!sw && sd.rank < sw.rank);

  // Kudos.
  check("kudos need what they did", !!(await throws(() => r.giveKudos(hana, { to: dev.id, value: "helpful", message: "x" }))));
  check("not to yourself", !!(await throws(() => r.giveKudos(dev, { to: dev.id, value: "helpful", message: "Great job today" }))));
  await r.giveKudos(hana, { to: dev.id, value: "helpful", message: "Fixed the upload bug fast" });
  check("one a day for the same person", !!(await throws(() => r.giveKudos(hana, { to: dev.id, value: "quality", message: "Again, thanks" }))));
  await r.giveKudos(dawit, { to: dev.id, value: "teamwork", message: "Helped me with the board" });
  await r.giveKudos(admin, { to: dev.id, value: "quality", message: "Clean release notes" });
  check("the person is told", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE '%gave you kudos%'", dev.id)));
  check("kudos lift teamwork", ((await r.computeScores(period)).find((x) => x.userId === dev.id)?.parts.collaboration ?? 0) >= 85);
  await r.saveRecognitionConfig(admin, { kudosPerMonth: 1 });
  check("the monthly kudos limit", /your 1 kudos/.test((await throws(() => r.giveKudos(hana, { to: dawit.id, value: "helpful", message: "Thanks for the cover" }))) ?? ""));

  // Who sees what.
  const lb = await r.leaderboard(dev, period);
  check("everyone sees the top and their own place", lb.rows.length <= 3 && lb.mine?.userId === dev.id && lb.support.length === 0, { n: lb.rows.length });
  const lbA = await r.leaderboard(admin, period);
  check("HR and Admin see everyone and who needs support", lbA.rows.length === lbA.total && lbA.support.length >= 1);
  await r.saveRecognitionConfig(admin, { leaderboard: "managers" });
  check("a board for managers only", !!(await throws(() => r.leaderboard(dev, period))) && !!(await r.leaderboard(admin, period)));
  await r.saveRecognitionConfig(admin, { leaderboard: "everyone", showScores: false });
  const hidden = await r.leaderboard(dawit, period);
  check("scores hidden: only the order (own score still shown)", hidden.top.filter((x) => x.userId !== dawit.id).every((x) => x.score === 0) && (hidden.mine?.score ?? 0) > 0);

  // Badges for the month, once.
  const a1 = await r.awardMonth(period);
  const mine = await r.awards(dev, { userId: dev.id });
  check("badges by rule: top performer, always on time, zero returns, team player", ["top_performer", "on_time", "zero_defects", "team_player"].every((b) => mine.some((a) => a.badge === b)), mine.map((a) => a.badge));
  check("Dawit gets no zero-returns badge", !(await r.awards(dev, { userId: dawit.id })).some((a) => a.badge === "zero_defects"));
  check("given once", a1.awarded >= 4 && (await r.awardMonth(period)).awarded === 0);
  check("scores kept for next month", !!(await get("SELECT 1 AS x FROM recog_scores WHERE user_id = ? AND period = ?", dev.id, period)));
  check("winners are told", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE 'You earned%'", dev.id)));

  // Titles.
  check("members do not give titles", !!(await throws(() => r.giveTitle(dawit, { userId: dev.id, title: "Employee of the month", reason: "x" }))));
  await r.giveTitle(admin, { userId: dev.id, title: "Employee of the month", reason: "Shipped the quiz feature", period });
  check("the same title twice in a month is refused", !!(await throws(() => r.giveTitle(admin, { userId: dev.id, title: "Employee of the month", reason: "again", period }))));
  check("titles show beside the name", ((await r.titlesOf([dev.id]))[dev.id] ?? []).includes("Employee of the month"));

  // Switched off again: nothing shows and the job gives nothing.
  await r.saveRecognitionConfig(admin, { enabled: false });
  check("off hides titles", Object.keys(await r.titlesOf([dev.id])).length === 0);
  check("off: the job gives nothing", (await r.recognitionJob()).awarded === 0);
  void today;

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await closeDb();
});
