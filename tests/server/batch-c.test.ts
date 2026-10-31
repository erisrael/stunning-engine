// Batch C checks: email copies of notifications, scheduled email, group calls, Google not connected.
import { all, get, run, closeDb, nowIso, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { notify } from "../../src/server/notifications";
import * as ob from "../../src/server/outbox";
import * as gc from "../../src/server/group-calls";
import * as gg from "../../src/server/google";
import { departmentChapter } from "../../src/lib/help-departments";
import { ensureDeptConfigs } from "../../src/server/dept-config";

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const [admin, hana, dawit, meron, yonas, liya] = await Promise.all(["admin", "hana", "dawit", "meron", "yonas", "liya"].map((n) => by(`${n}@demo.local`)));

  // Email copies of notifications
  await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify({ emailNotificationTypes: ["approval"] }), dawit!.id);
  await notify([dawit!.id, yonas!.id], { type: "approval", title: "To approve: X", body: "Something", link: "/dashboard" }, nowIso());
  await sleep(300);
  const rows = await all<{ user_id: string; status: string; subject: string; attempts: number }>("SELECT user_id, status, subject, attempts FROM email_outbox WHERE kind = 'notification'");
  check("only people who chose email copies get one", rows.length === 1 && rows[0]!.user_id === dawit!.id, rows);
  await notify([dawit!.id], { type: "assignment", title: "Assigned", link: "/dashboard" }, nowIso());
  check("types not chosen are not emailed", (await all("SELECT 1 AS x FROM email_outbox WHERE kind = 'notification'")).length === 1);
  await ob.flushOutbox();
  const after = await get<{ status: string; attempts: number; error: string | null }>("SELECT status, attempts, error FROM email_outbox WHERE user_id = ?", dawit!.id);
  check("without an email account it waits to try again", after?.status === "queued" && after.attempts === 1 && !!after.error, after);

  // Scheduled sending
  const input = { to: { emails: ["someone@example.com"] }, subject: "Weekly plan", body: "Hello", mode: "individual" as const };
  check("a time in the past is refused", /at least a minute/.test((await throws(() => ob.scheduleEmail(admin!, input, "W", new Date(Date.now() - 60e3).toISOString()))) ?? ""));
  const sid = await ob.scheduleEmail(admin!, input, "W", new Date(Date.now() + 36e5).toISOString());
  check("scheduled message is listed", (await ob.scheduledEmails(admin!)).some((s) => s.id === sid && s.status === "queued"));
  check("someone else cannot cancel it", !!(await throws(() => ob.cancelScheduled(hana!, sid))));
  await ob.cancelScheduled(admin!, sid);
  check("cancelled", (await ob.scheduledEmails(admin!)).find((s) => s.id === sid)?.status === "cancelled");

  // Group calls
  const gid = uid("grp_");
  await run("INSERT INTO chat_groups (id, name, kind, created_by, created_at) VALUES (?, 'Production team', 'group', ?, ?)", gid, admin!.id, nowIso());
  for (const u of [admin, hana, dawit, meron, yonas]) await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, 'member', ?)", gid, u!.id, nowIso()).catch(async (e) => {
    console.log("member insert:", e.message);
  });
  check("a non-member cannot start the group's call", !!(await throws(() => gc.startGroupCall(liya!, gid, "video"))));
  const call = await gc.startGroupCall(hana!, gid, "video");
  check("start a group call", !!call.id && !call.existing);
  check("a second start joins the same call", (await gc.startGroupCall(dawit!, gid, "video")).id === call.id);
  for (const u of [hana, dawit, meron, yonas]) await gc.joinGroupCall(u!, call.id);
  check("a fifth person is refused while four are in", /full/.test((await throws(() => gc.joinGroupCall(admin!, call.id))) ?? ""));
  await gc.signalGroupCall(hana!, call.id, dawit!.id, "offer", JSON.stringify({ type: "offer", sdp: "x" }));
  const p = await gc.pollGroupCall(dawit!, call.id, 0);
  check("signals reach only the person they are for", p.signals.length === 1 && p.signals[0]!.from === hana!.id && (await gc.pollGroupCall(meron!, call.id, 0)).signals.length === 0);
  check("everyone sees the four people", p.participants.length === 4);
  await gc.leaveGroupCall(yonas!, call.id);
  await gc.joinGroupCall(admin!, call.id);
  check("after someone leaves, another can join", (await gc.pollGroupCall(admin!, call.id, 0)).participants.some((x) => x.id === admin!.id));
  check("the group's call is active for the Join banner", (await gc.activeGroupCall(gid))?.id === call.id);
  for (const u of [hana, dawit, meron, admin]) await gc.leaveGroupCall(u!, call.id);
  check("the call ends when everyone has left", (await get<{ status: string }>("SELECT status FROM group_calls WHERE id = ?", call.id))?.status === "ended");
  check("a notice went to the group's members", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND link = ?", meron!.id, `/call/${call.id}`)));

  // Google not connected
  check("no Google account yet", (await gg.googleConnection(dawit!.id)) === null);
  const yt = await throws(() => gg.startYoutubeUpload(dawit!, { title: "x", size: 10, mime: "video/mp4" }));
  check("YouTube upload asks to connect first", !!yt && /Connect/.test(yt), yt);

  // Department chapters in Help
  const configs = await ensureDeptConfigs();
  const ch = Object.entries(configs).map(([k, c]) => departmentChapter(k, c));
  check("a Help chapter per department, in its own words", ch.length === Object.keys(configs).length && ch.length >= 2 && ch.every((c) => c.sections.length >= 3 && c.title.includes(": how it works")), ch.map((c) => c.title));
  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
}
main();
