// Presentation studio: department slides (with releases), the company deck by who may see it, decks saved for
// yourself or the team, meetings whose actions become tasks, share links (copy, expiry, revoke), weekly email.
import { get, run, closeDb, nowIso, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { syncFromUsers } from "../../src/server/hr";
import * as d from "../../src/server/decks";

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

// Today's weekday in the workspace's time zone (as the weekly email reads it), not in UTC.
async function workspaceWeekday() {
  const { getSettings } = await import("../../src/server/settings");
  const { localParts } = await import("../../src/lib/attendance");
  const p = localParts(new Date().toISOString(), (await getSettings()).workspace.timezone);
  return new Date(`${p.date}T12:00:00Z`).getUTCDay();
}

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const PW = "Demo-Workflow-2026";
  for (const [email, name, roles] of [
    ["head@demo.local", "Dev Head", ["developer"]],
    ["devm@demo.local", "Dev Member", ["developer"]],
  ] as const)
    await upsertAccount({ email, name, roles: [...roles], password: PW });
  await syncFromUsers(admin);
  const head = await by("head@demo.local");
  const devm = await by("devm@demo.local");
  await setPosition(admin, "dev", head.id, "head");
  await setPosition(admin, "dev", devm.id, "member");
  const H = (await loadUser(head.id))!;
  const M = (await loadUser(devm.id))!;
  const now = nowIso();
  for (let i = 0; i < 3; i++)
    await run("INSERT INTO dept_tasks (id, dept, code, title, status, status_category, assignee_id, created_at, updated_at, completed_at) VALUES (?, 'dev', ?, 'Shipped work', 'done', 'done', ?, ?, ?, ?)", uid("tsk_"), `DK-${i}`, M.id, now, now, now);
  await run("INSERT INTO dept_releases (id, dept, name, version, task_count, created_at, created_by) VALUES (?, 'dev', 'Quiz', '1.2.0', 3, ?, ?)", uid("rel_"), now, H.id).catch(() => null);

  const dept = await d.deptSlides(H, "dev");
  const keys = dept.slides.map((s) => s.key);
  check("department slides with plain sentences", ["numbers", "throughput", "recent"].every((k) => keys.includes(k)) && dept.slides.every((s) => s.say.length > 5), keys);
  check("finished work since last time", !!(dept.slides.find((s) => s.key === "recent")?.say.startsWith("3 pieces")));
  check("releases and DORA when the department has releases", keys.includes("releases") && keys.includes("dora"), keys);
  const since = await d.deptSlides(H, "dev", { since: new Date(Date.now() + 60e3).toISOString() });
  check("since the last meeting only counts what came after", !!(since.slides.find((s) => s.key === "recent")?.title === "Since the last meeting" && since.slides.find((s) => s.key === "recent")?.say.startsWith("Nothing")));

  const company = await d.companySlides(admin);
  const ck = company.slides.map((s) => s.key);
  check("the company deck for Admin: departments and people (production when parts are in production)", ck.includes("departments") && ck.includes("people"), ck);
  check("members cannot open the company deck", !!(await throws(() => d.companySlides(M))));

  // Decks.
  check("a member saves their own deck", !!(await d.saveDeck(M, { name: "Mine", scope: "dept:dev", slides: ["numbers", "recent"] })));
  check("but not one for the team", !!(await throws(() => d.saveDeck(M, { name: "Team", scope: "dept:dev", slides: ["numbers"], shared: true }))));
  const team = await d.saveDeck(H, { name: "Weekly team meeting", scope: "dept:dev", slides: ["numbers", "flow", "recent", "nope"], minutes: { numbers: 5, recent: 3 }, shared: true, theme: { bigText: true }, emailTo: [H.id], emailDay: await workspaceWeekday() });
  const seen = await d.listDecks(M, "dept:dev");
  check("the team deck is seen by members, the private one only by its owner", seen.some((x) => x.id === team) && (await d.listDecks(H, "dept:dev")).every((x) => x.name !== "Mine"));
  const t = seen.find((x) => x.id === team)!;
  check("order, minutes and look are kept", t.slides[0] === "numbers" && t.minutes.numbers === 5 && t.theme.bigText);
  check("a member cannot change the team deck", !!(await throws(() => d.saveDeck(M, { id: team, name: "x", scope: "dept:dev", slides: ["numbers"], shared: true }))));
  check("ready decks are offered", d.readyDecks("dept:dev", keys).some((x) => x.name === "Weekly team meeting"));

  // Meeting.
  const n = await d.endMeeting(H, { scope: "dept:dev", deckId: team, actions: [{ text: "Fix the login bug", assigneeId: M.id, due: "2026-12-01" }, { text: "  ", assigneeId: null, due: null }] });
  check("meeting actions become tasks", n === 1 && !!(await get("SELECT 1 AS x FROM dept_tasks WHERE dept = 'dev' AND title = 'Fix the login bug' AND assignee_id = ? AND due_date = '2026-12-01'", M.id)));
  check("the deck remembers the meeting", !!(await d.getDeck(H, team)).lastMeetingAt);
  check("company actions need a department", !!(await throws(() => d.endMeeting(admin, { scope: "company", actions: [{ text: "Hire an editor", assigneeId: null, due: null }] }))));
  check("company actions go to the chosen department", (await d.endMeeting(admin, { scope: "company", actions: [{ text: "Plan the Q1 roadmap", assigneeId: null, due: null, dept: "dev" }] })) === 1);

  // Share links.
  check("members do not share outside", !!(await throws(() => d.createShare(M, { scope: "dept:dev", name: "x", slideKeys: [], days: 3 }))));
  const sh = await d.createShare(H, { scope: "dept:dev", name: "Weekly team meeting", slideKeys: ["numbers", "recent"], days: 3 });
  const open = await d.openShare(sh.token);
  check("the link opens a copy of the chosen slides", open?.slides.length === 2 && open.slides[0]!.key === "numbers");
  check("views are counted", Number((await get<{ views: number }>("SELECT views FROM pres_shares WHERE token = ?", sh.token))?.views) === 1);
  await run("UPDATE pres_shares SET expires_at = ? WHERE token = ?", new Date(Date.now() - 1000).toISOString(), sh.token);
  check("an ended link shows nothing", (await d.openShare(sh.token)) === null);
  const sh2 = await d.createShare(H, { scope: "dept:dev", name: "x", slideKeys: [], days: 1 });
  await d.revokeShare(H, sh2.token);
  check("a stopped link shows nothing", (await d.openShare(sh2.token)) === null);

  // Weekly email.
  const e = await d.weeklyDeckEmails();
  check("the deck goes out by email on its day, once", e.sent === 1 && (await d.weeklyDeckEmails()).sent === 0);
  const mail = await get<{ subject: string; text: string }>("SELECT subject, text FROM email_outbox WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", H.id);
  check("with each slide's sentence", !!mail?.subject.startsWith("Weekly team meeting") && mail.text.includes("Since the last meeting"));

  // The phone remote.
  const tok = await d.createRemote(H);
  await d.remoteMove(tok, 1);
  await d.remoteMove(tok, 1);
  await d.remoteMove(tok, -1);
  check("the phone's moves add up for the deck", (await d.remoteState(tok)).steps === 1);
  check("the deck tells the phone the slide", (await d.remoteState(tok, { title: "Projects", position: "3 of 5" })).title === "Projects" && (await d.remoteState(tok)).position === "3 of 5");
  await run("UPDATE pres_remotes SET expires_at = ? WHERE token = ?", new Date(Date.now() - 1000).toISOString(), tok);
  check("an ended remote is refused", !!(await throws(() => d.remoteMove(tok, 1))));

  await d.deleteDeck(H, team);
  check("removed", (await d.listDecks(H, "dept:dev")).every((x) => x.id !== team));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await closeDb();
});
