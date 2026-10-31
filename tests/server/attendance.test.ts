// Attendance checks on a copy of the demo database.
import crypto from "node:crypto";
import { all, get, run, closeDb, nowIso } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { syncFromUsers } from "../../src/server/hr";
import * as att from "../../src/server/attendance";
import * as fin from "../../src/server/finance";
import { computeDay, monthTotals, unpaidDays, DEFAULT_ATTENDANCE, type DayInput } from "../../src/lib/attendance";

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

function rules() {
  const shift = DEFAULT_ATTENDANCE.shifts[0]!;
  const base: DayInput = { date: "2026-10-28", shift, events: [], leave: null, holiday: null, mark: null, now: { date: "2026-10-31", minutes: 600 }, rules: DEFAULT_ATTENDANCE };
  const ev = (inM: number, outM?: number) => [{ kind: "in" as const, minutes: inM, source: "web" as const }, ...(outM !== undefined ? [{ kind: "out" as const, minutes: outM, source: "web" as const }] : [])];
  const onTime = computeDay({ ...base, events: ev(8 * 60 + 40, 17 * 60 + 30) });
  check("on time within grace is present", onTime.status === "present" && onTime.lateMin === 0 && onTime.workedMin === 8 * 60 + 50 - 60, onTime);
  const late = computeDay({ ...base, events: ev(9 * 60, 17 * 60 + 30) });
  check("past grace is late, minutes from start", late.status === "late" && late.lateMin === 30, late);
  const half = computeDay({ ...base, events: ev(8 * 60 + 30, 11 * 60) });
  check("under four hours is a half day", half.status === "half_day", half);
  const missing = computeDay({ ...base, events: ev(8 * 60 + 30) });
  check("no check-out on a past day is flagged", missing.missingOut, missing);
  const ot = computeDay({ ...base, events: ev(8 * 60 + 30, 19 * 60) });
  check("overtime after the threshold", ot.overtimeMin === 90, ot);
  const absent = computeDay(base);
  check("no check-in on a past workday is absent", absent.status === "absent");
  const notYet = computeDay({ ...base, date: "2026-10-31", shift: { ...shift, workdays: [0, 1, 2, 3, 4, 5, 6] } });
  check("today before the end is not in yet", notYet.status === "not_in", notYet);
  const leave = computeDay({ ...base, leave: { label: "Annual leave", paid: true, half: false } });
  check("approved leave", leave.status === "leave" && leave.unpaidLeave === 0);
  const unpaid = computeDay({ ...base, leave: { label: "Unpaid leave", paid: false, half: false } });
  check("unpaid leave counts for payroll", unpaid.unpaidLeave === 1);
  const halfLeaveWorked = computeDay({ ...base, leave: { label: "Annual leave", paid: true, half: true }, events: ev(13 * 60, 17 * 60 + 30) });
  check("half day of leave plus the afternoon worked is present, not late", halfLeaveWorked.status === "present" && halfLeaveWorked.lateMin === 0, halfLeaveWorked);
  const holiday = computeDay({ ...base, holiday: "Meskel", events: ev(9 * 60, 13 * 60) });
  check("work on a holiday is all overtime", holiday.status === "holiday" && holiday.overtimeMin === 240, holiday);
  const sat = computeDay({ ...base, date: "2026-10-31", now: { date: "2026-11-01", minutes: 0 } });
  check("weekend with no work is a day off", sat.status === "off");
  const mark = computeDay({ ...base, mark: { status: "present", inMin: null, outMin: null, note: "Kiosk down", source: "lead", reviewed: false } });
  check("a lead's record wins and is a full day", mark.status === "present" && mark.manual && !mark.reviewed && mark.workedMin === 480, mark);
  const t = monthTotals([absent, half, unpaid, ot]);
  check("unpaid days: absent + half of a half day + unpaid leave", unpaidDays(t) === 2.5, t);
}

async function main() {
  rules();
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  await syncFromUsers(admin);
  const [hana, dawit, meron, yonas] = [await by("hana@demo.local"), await by("dawit@demo.local"), await by("meron@demo.local"), await by("yonas@demo.local")];
  const emp = async (u: { id: string }) => (await get<{ id: string; code: string }>("SELECT id, code FROM employees WHERE user_id = ?", u.id))!;
  const [eH, eD, eY] = [await emp(hana), await emp(dawit), await emp(yonas)];
  await run("UPDATE employees SET manager_id = ? WHERE id = ?", eH.id, eD.id);
  check("employees exist for everyone", !!eH && !!eD && !!eY);
  check("admin manages attendance", att.managesAttendance(admin));

  const p1 = await att.punchSelf(dawit, {});
  check("check in from the app", p1.kind === "in" && !p1.repeat, p1);
  const p2 = await att.punchSelf(dawit, {});
  check("a second press within a minute is the same check-in", p2.repeat && p2.kind === "in", p2);
  const mine = await att.myAttendance(dawit, p1.day.slice(0, 7));
  check("my attendance shows today's check-in", mine.events.length === 1 && mine.today?.firstIn !== null, mine.events);
  check("no absences before attendance began", mine.days.every((x) => x.date >= p1.day), mine.days.map((x) => x.date + x.status).slice(0, 3));

  check("Recording lead's team includes the recorder", (await att.teamIds(hana)).includes(eD.id));
  check("Recording lead's team leaves out an editor", !(await att.teamIds(hana)).includes(eY.id));
  const yesterday = new Date(Date.parse(`${p1.day}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  check("lead cannot record someone outside the team", !!(await throws(() => att.markDay(hana, { employeeId: eY.id, day: yesterday, status: "present", note: "x" }))));
  check("a record needs a reason", !!(await throws(() => att.markDay(hana, { employeeId: eD.id, day: yesterday, status: "present" }))));
  await att.markDay(hana, { employeeId: eD.id, day: yesterday, status: "late", inTime: "09:10", note: "Kiosk not working" });
  const board = await att.dailyBoard(hana, yesterday);
  const row = board.rows.find((r) => r.employeeId === eD.id);
  check("board shows the hand-made record", row?.result.manual === true && row.result.status === "late" && row.result.lateMin === 40, row?.result);
  check("lead sees only their team on the board", board.rows.every((r) => r.employeeId !== eY.id));
  const queue = await att.reviewQueue(admin);
  check("HR sees it to review", queue.some((q) => q.employee_id === eD.id && q.day === yesterday));
  await att.reviewMarks(admin, [{ employeeId: eD.id, day: yesterday }]);
  check("reviewed leaves the queue", !(await att.reviewQueue(admin)).some((q) => q.employee_id === eD.id));
  check("team members cannot open the review queue", !!(await throws(() => att.reviewQueue(dawit))));

  const cid = await att.requestCorrection(dawit, { day: yesterday, inTime: "08:35", outTime: "17:40", reason: "Forgot to check out" });
  const c = await get<{ status: string; approver_id: string }>("SELECT status, approver_id FROM att_corrections WHERE id = ?", cid);
  check("correction goes to the line manager", c?.status === "pending_lead" && c.approver_id === hana.id, c);
  check("someone else cannot decide it", !!(await throws(() => att.decideCorrection(meron, cid, { decision: "approve" }))));
  await att.clearMark(admin, eD.id, yesterday);
  await att.decideCorrection(hana, cid, { decision: "approve" });
  const day = (await att.dailyBoard(admin, yesterday)).rows.find((r) => r.employeeId === eD.id)!.result;
  check("approved correction sets the day's times", day.firstIn === 8 * 60 + 35 && day.lastOut === 17 * 60 + 40, day);

  // Kiosk: pairing, PIN, badge, offline.
  const k = await att.createKiosk(admin, "Main entrance");
  const token = await att.pairKiosk(k.code);
  check("setup code pairs once", !!token && !(await att.pairKiosk(k.code)));
  const kiosk = (await att.kioskFromToken(token))!;
  check("kiosk found by its token", kiosk?.name === "Main entrance");
  const pin = await att.resetPin(admin, eY.id);
  const y1 = await att.kioskPunch(kiosk, { code: eY.code.replace("EMP-", ""), pin });
  check("number and PIN check in at the kiosk", y1.kind === "in" && y1.name === "Yonas", y1);
  for (let i = 0; i < 5; i++) await throws(() => att.kioskPunch(kiosk, { code: eY.code, pin: "0000" }));
  check("five wrong PINs lock the number", /Too many/.test((await throws(() => att.kioskPunch(kiosk, { code: eY.code, pin }))) ?? ""));
  await att.newBadges(admin, [eH.id]);
  const badge = (await get<{ badge: string }>("SELECT badge FROM att_badges WHERE employee_id = ?", eH.id))!.badge;
  const b1 = await att.kioskPunch(kiosk, { badge });
  check("badge checks in", b1.kind === "in" && b1.name === "Hana", b1);
  const signKey = (await get<{ sign_key: string }>("SELECT sign_key FROM att_kiosks WHERE id = ?", kiosk.id))!.sign_key;
  const at = new Date(Date.now() - 2 * 36e5).toISOString();
  const clientId = crypto.randomUUID();
  const sig = crypto.createHmac("sha256", signKey).update(`${clientId}|${at}|${badge}`).digest("base64url");
  check("an unsigned saved check-in is refused", !!(await throws(() => att.kioskPunch(kiosk, { badge, at, clientId, sig: "bad" }))));
  await att.kioskPunch(kiosk, { badge, at, clientId, sig });
  const off = await get<{ offline: number; at: string }>("SELECT offline, at FROM att_events WHERE client_id = ?", clientId);
  check("a signed saved check-in keeps its real time, marked offline", off?.offline === 1 && off.at === at, off);
  const again = await att.kioskPunch(kiosk, { badge, at, clientId, sig });
  check("sending it twice records it once", again.duplicate === true);
  const old = new Date(Date.now() - 100 * 36e5).toISOString();
  const sig2 = crypto.createHmac("sha256", signKey).update(`x|${old}|${badge}`).digest("base64url");
  check("saved check-ins older than the limit are refused", /older than/.test((await throws(() => att.kioskPunch(kiosk, { badge, at: old, clientId: "x", sig: sig2 }))) ?? ""));

  // Phone at the site only.
  await att.saveAttendanceConfig(admin, { methods: { web: false, kiosk: true, mobile: true, face: false }, site: { label: "Office", lat: 9.0108, lng: 38.7613, radiusM: 200 } });
  check("phone check-in needs location", /Allow location/.test((await throws(() => att.punchSelf(meron, {}))) ?? ""));
  check("too far from the site is refused", /m from Office/.test((await throws(() => att.punchSelf(meron, { lat: 9.05, lng: 38.76, accuracy: 10 }))) ?? ""));
  const near = await att.punchSelf(meron, { lat: 9.0109, lng: 38.7614, accuracy: 10 });
  check("at the site checks in from the phone", near.kind === "in", near);
  check("saving phone check-in without a site is refused", !!(await throws(() => att.saveAttendanceConfig(admin, { methods: { web: false, kiosk: true, mobile: true, face: false }, site: { label: "x", lat: null, lng: null, radiusM: 100 } }))));

  // Timesheets and payroll.
  const month = yesterday.slice(0, 7);
  await att.saveAttendanceConfig(admin, { startDate: `${month}-01` });
  const sheets = await att.timesheets(admin, month);
  check("timesheets list everyone for HR", sheets.length >= 8, sheets.length);
  check("a lead's timesheets are their team only", (await att.timesheets(hana, month)).every((r) => r.employeeId !== eY.id));
  const payroll = { ...admin, perms: [...admin.perms, "finance.payroll" as const] };
  await fin.savePayStructure(payroll, eD.id, { basic: 8000, allowances: [], deductions: [] });
  await run("DELETE FROM fin_payroll_runs WHERE period = ?", month);
  const runId = await fin.createPayrollRun(payroll, month);
  const n = await fin.fillFromAttendance(payroll, runId);
  const slip = await get<{ unpaid_days: number; overtime_hours: number }>("SELECT unpaid_days, overtime_hours FROM fin_payslips WHERE run_id = ? AND employee_id = ?", runId, eD.id);
  const feed = (await att.payrollFeed(month, [eD.id])).get(eD.id)!;
  check("payroll takes unpaid days and overtime from Attendance", n === 1 && Number(slip?.unpaid_days) === feed.unpaidDays && Number(slip?.overtime_hours) === feed.overtimeHours, { slip, feed });

  await run("UPDATE att_kiosks SET last_seen_at = ? WHERE id = ?", new Date(Date.now() - 3 * 36e5).toISOString(), kiosk.id);
  await att.kioskSilenceChecks(nowIso());
  check("silence check runs", true);
  void all;
  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
}
main();
