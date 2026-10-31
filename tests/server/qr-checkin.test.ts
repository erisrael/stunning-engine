// Phase 10b on the server: the day's result with breaks and lunch, the steps allowed in each state, Admin's capture
// setup and who may change what, flags for HR, and break overruns in payroll.
import { closeDb, get, nowIso, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { syncFromUsers } from "../../src/server/hr";
import * as att from "../../src/server/attendance";
import { captureConfig, decideFlags, flaggedEvents, saveCaptureConfig } from "../../src/server/attendance-capture";
import { computeDay, localToIso, monthTotals, NEXT_KINDS, stateAfter, toggleKind, type DayEvent, type Shift } from "../../src/lib/attendance";
import { getSettings } from "../../src/server/settings";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};
const throws = async (fn: () => unknown) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

async function main() {
  // The day with breaks
  const shift: Shift = { key: "s", label: "S", start: "08:30", end: "17:30", graceMin: 15, breakMin: 60, workdays: [0, 1, 2, 3, 4, 5, 6], lunch: { from: "12:00", to: "14:00", minutes: 60 }, shortBreaks: { count: 2, minutes: 15, paid: true } };
  const day = (events: [DayEvent["kind"], string][], s = shift, nowMin = 23 * 60) =>
    computeDay({ date: "2026-10-28", shift: s, events: events.map(([kind, t]) => ({ kind, minutes: m(t), source: "qr" })), leave: null, holiday: null, mark: null, now: { date: "2026-10-28", minutes: nowMin }, rules: { earlyLeaveMin: 15, overtimeAfterMin: 30, halfDayHours: 4 } });
  const plain = day([["in", "08:30"], ["out", "17:30"]]);
  check("without recorded breaks the fixed break comes off (9 h - 1 h)", plain.workedMin === 8 * 60 && plain.breakMin === 0 && plain.breakOverMin === 0, plain);
  const full = day([["in", "08:30"], ["break_start", "10:00"], ["break_end", "10:15"], ["lunch_start", "12:30"], ["lunch_end", "13:30"], ["break_start", "15:00"], ["break_end", "15:15"], ["out", "17:30"]]);
  check("real lunch is unpaid, paid short breaks count as work", full.workedMin === 9 * 60 - 60 && full.lunchMin === 60 && full.breakMin === 30 && full.breakOverMin === 0, full);
  const long = day([["in", "08:30"], ["lunch_start", "12:00"], ["lunch_end", "13:45"], ["out", "17:30"]]);
  check("a lunch 45 minutes over the hour is flagged as over", long.lunchMin === 105 && long.breakOverMin === 45 && long.workedMin === 9 * 60 - 105, long);
  const unpaid = day([["in", "08:30"], ["break_start", "10:00"], ["break_end", "10:40"], ["out", "17:30"]], { ...shift, shortBreaks: { count: 2, minutes: 15, paid: false } });
  check("unpaid breaks: all of the break comes off; time over the allowance is over", unpaid.workedMin === 9 * 60 - 40 && unpaid.breakOverMin === 10, unpaid);
  const now = day([["in", "08:30"], ["lunch_start", "12:30"]], shift, m("12:45"));
  check("someone at lunch now shows as at lunch", now.onBreak === "lunch" && !now.missingReturn && !now.missingOut, now);
  const gone = day([["in", "08:30"], ["break_start", "16:00"]], shift, m("23:00"));
  check("a break never ended by the end of the day is a missing return", gone.missingReturn && gone.onBreak === null, gone);
  const outOnBreak = day([["in", "08:30"], ["break_start", "17:00"], ["out", "17:30"]]);
  check("checking out ends a break", outOnBreak.breakMin === 30 && !outOnBreak.missingReturn, outOnBreak);
  const t = monthTotals([full, long, unpaid]);
  check("month totals add lunch, breaks and overruns", t.lunchMin === 165 && t.breakMin === 70 && t.breakOverMin === 55, t);

  // States and steps
  check("states follow the last step", stateAfter("lunch_start") === "lunch" && stateAfter("break_end") === "in" && stateAfter("out") === "out" && stateAfter(undefined) === "out");
  check("only fitting buttons are offered", NEXT_KINDS.in.join() === "break_start,lunch_start,out" && NEXT_KINDS.break.join() === "break_end");
  check("the kiosk's single button ends a break first", toggleKind("break") === "break_end" && toggleKind("in") === "out" && toggleKind("out") === "in");

  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  await syncFromUsers(admin);
  const emp = async (email: string) => (await get<{ id: string }>("SELECT e.id FROM employees e JOIN users u ON u.id = e.user_id WHERE u.email = ?", email))!.id;
  const dawit = await emp("dawit@demo.local");
  check("lunch cannot start before checking in", /Check in first/.test((await throws(() => att.punchKind(dawit, "lunch_start", { source: "qr" }))) ?? ""));
  // A fixed morning, so the steps never cross midnight whenever the test runs.
  const t0 = Date.parse(localToIso("2026-01-05", "08:00", (await getSettings()).workspace.timezone));
  const at = (min: number) => new Date(t0 + min * 60e3).toISOString();
  await att.punchKind(dawit, "in", { source: "qr", at: at(0) });
  check("checking in twice is refused", /already checked in/.test((await throws(() => att.punchKind(dawit, "in", { source: "qr", at: at(5) }))) ?? ""));
  await att.punchKind(dawit, "lunch_start", { source: "qr", at: at(60) });
  check("on lunch, a break cannot start", /Back from lunch/.test((await throws(() => att.punchKind(dawit, "break_start", { source: "qr", at: at(70) }))) ?? ""));
  check("the state is lunch", (await att.stateOf(dawit, at(75))).state === "lunch");
  await att.punchKind(dawit, "lunch_end", { source: "qr", at: at(120) });
  check("the state is in again", (await att.stateOf(dawit, at(125))).state === "in");

  // Who may change what
  const hrUser = await by("hana@demo.local");
  await run("INSERT INTO role_assignments (user_id, role) VALUES (?, 'hr_officer') ON CONFLICT DO NOTHING", hrUser.id);
  const hr = (await loadUser(hrUser.id))!;
  check("HR can change the rules", !(await throws(() => att.saveAttendanceConfig(hr, { halfDayHours: 4 }))));
  check("HR cannot change how people check in", /Only Admin/.test((await throws(() => att.saveAttendanceConfig(hr, { methods: { web: true, kiosk: true, mobile: false, face: false } }))) ?? ""));
  check("HR cannot set up kiosks", /Only Admin/.test((await throws(() => att.createKiosk(hr, "Door"))) ?? ""));
  const capNow = await captureConfig();
  check("HR cannot change the capture setup", /Only Admin/.test((await throws(() => saveCaptureConfig(hr, capNow))) ?? ""));
  check("lunch rules are checked", /lunch window/.test((await throws(() => att.saveAttendanceConfig(hr, { shifts: [{ ...shift, lunch: { from: "14:00", to: "12:00", minutes: 60 } }] }))) ?? ""));

  // Capture setup
  const base = await captureConfig();
  const site = { id: "", name: "Head office", networks: ["196.188.10.0/24", "office.example.org"], lat: null, lng: null, radiusM: 150, checks: { network: true, location: false, device: false }, posterKey: "", posterAt: "" };
  check("a bad network entry is refused", /not an address/.test((await throws(() => saveCaptureConfig(admin, { ...base, sites: [{ ...site, networks: ["999.1.1.1/8"] }] }))) ?? ""));
  check("a site with no check is refused (a QR alone can be photographed)", /at least one check/.test((await throws(() => saveCaptureConfig(admin, { ...base, sites: [{ ...site, checks: { network: false, location: false, device: false } }] }))) ?? ""));
  check("QR needs a site", /Add a site/.test((await throws(() => saveCaptureConfig(admin, { ...base, methods: { ...base.methods, qr: true }, sites: [] }))) ?? ""));
  const saved = await saveCaptureConfig(admin, { ...base, methods: { ...base.methods, qr: true, network: true }, sites: [site] });
  check("a site is saved with an id and a poster code", !!saved.sites[0]!.id && saved.sites[0]!.posterKey.length >= 10);
  const again = await saveCaptureConfig(admin, saved);
  check("saving again keeps the poster code", again.sites[0]!.posterKey === saved.sites[0]!.posterKey);

  // Flags for HR
  await run(
    "INSERT INTO att_events (id, employee_id, kind, at, day, source, offline, created_at, flag, flag_state, device_id) VALUES ('att_flag1', ?, 'out', ?, ?, 'qr', 0, ?, 'Outside the usual hours', 'pending', 'dev1')",
    dawit,
    at(200),
    (await att.stateOf(dawit, at(199))).day,
    nowIso(),
  );
  const flagged = await flaggedEvents(admin);
  check("flagged check-ins are listed for HR", flagged.some((f) => f.id === "att_flag1" && f.flag === "Outside the usual hours"));
  check("they count in HR's review number", ((await att.attendanceInbox(admin))?.review ?? 0) >= 1);
  await decideFlags(admin, ["att_flag1"], false, "Not at work then");
  check("one not accepted is removed from the day", !!(await get<{ voided: number }>("SELECT voided FROM att_events WHERE id = 'att_flag1'"))?.voided);
  check("and the state goes back", (await att.stateOf(dawit, at(201))).state === "in");

  // Payroll and break overruns
  const month = new Date().toISOString().slice(0, 7);
  await att.saveAttendanceConfig(admin, { deductBreakOverrun: true });
  check("the setting is kept", (await att.attendanceConfig()).deductBreakOverrun === true);
  const feed = await att.payrollFeed(month, [dawit]);
  check("payroll still gets a line", feed.has(dawit));

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main();
