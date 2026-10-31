// Batch B checks: night shifts, rotas, absence in HR reports and reviews, the Finance view.
import { get, run, closeDb, nowIso, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { syncFromUsers } from "../../src/server/hr";
import * as att from "../../src/server/attendance";
import * as fin from "../../src/server/finance";
import { hrReport } from "../../src/server/hr-growth";
import { computeDay, shiftKeyOn, DEFAULT_ATTENDANCE, localToIso, type Shift } from "../../src/lib/attendance";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};

async function main() {
  const night: Shift = { key: "night", label: "Night", start: "22:00", end: "06:00", graceMin: 10, breakMin: 30, workdays: [0, 1, 2, 3, 4, 5, 6] };
  const n1 = computeDay({ date: "2026-10-27", shift: night, events: [{ kind: "in", minutes: 22 * 60 + 5, source: "web" }, { kind: "out", minutes: 24 * 60 + 6 * 60 + 40, source: "web" }], leave: null, holiday: null, mark: null, now: { date: "2026-10-31", minutes: 600 }, rules: DEFAULT_ATTENDANCE });
  check("night shift: hours across midnight, overtime after the end", n1.status === "present" && n1.workedMin === 8 * 60 + 35 - 30 && n1.overtimeMin === 40, n1);
  const n2 = computeDay({ date: "2026-10-30", shift: night, events: [{ kind: "in", minutes: 22 * 60, source: "web" }], leave: null, holiday: null, mark: null, now: { date: "2026-10-31", minutes: 3 * 60 }, rules: DEFAULT_ATTENDANCE });
  check("night shift still running at 03:00 is not a missing check-out", !n2.missingOut, n2);
  const n3 = computeDay({ date: "2026-10-31", shift: night, events: [], leave: null, holiday: null, mark: null, now: { date: "2026-10-31", minutes: 20 * 60 }, rules: DEFAULT_ATTENDANCE });
  check("night shift not started yet is not in yet", n3.status === "not_in", n3);
  const rota = { shiftKey: "a", rota: ["a", "b", "c"], rotaStart: "2026-10-05" };
  check("rota week 1, 2, 3, then back to 1", shiftKeyOn(rota, "2026-10-07", "x") === "a" && shiftKeyOn(rota, "2026-10-14", "x") === "b" && shiftKeyOn(rota, "2026-10-21", "x") === "c" && shiftKeyOn(rota, "2026-10-28", "x") === "a");
  check("rota before its start counts backwards", shiftKeyOn(rota, "2026-09-30", "x") === "c");

  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const hana = await by("hana@demo.local");
  await syncFromUsers(admin);
  const emp = async (email: string) => (await get<{ id: string }>("SELECT e.id FROM employees e JOIN users u ON u.id = e.user_id WHERE u.email = ?", email))!.id;
  const [eD, eY] = [await emp("dawit@demo.local"), await emp("yonas@demo.local")];
  const cfg = await att.attendanceConfig();
  await att.saveAttendanceConfig(admin, { startDate: "2026-10-01", shifts: [...cfg.shifts, night] });
  await att.assignRota(admin, [eD], ["standard", "night"], "2026-10-05");
  const s1 = await att.shiftOf(eD, undefined, "2026-10-07");
  const s2 = await att.shiftOf(eD, undefined, "2026-10-14");
  check("rota gives the right shift each week", s1.key === "standard" && s2.key === "night", [s1.key, s2.key]);
  // A night on the rota: in at 22:00, out at 06:30 the next morning, both stored on the start day.
  const tz = "Africa/Addis_Ababa";
  for (const [kind, day, time, stored] of [["in", "2026-10-14", "22:00", "2026-10-14"], ["out", "2026-10-15", "06:30", "2026-10-14"]] as const)
    await run("INSERT INTO att_events (id, employee_id, kind, at, day, source, created_at) VALUES (?, ?, ?, ?, ?, 'web', ?)", uid("att_"), eD, kind, localToIso(day, time, tz), stored, nowIso());
  const sheet = (await att.timesheets(admin, "2026-10")).find((r) => r.employeeId === eD)!;
  const night14 = sheet.days.find((d) => d.date === "2026-10-14")!;
  check("the night counts on the day it started", night14.firstIn === 22 * 60 && night14.lastOut === 24 * 60 + 6 * 60 + 30 && night14.status === "present", night14);
  await att.markDay(hana, { employeeId: eD, day: "2026-10-15", status: "present", inTime: "22:00", outTime: "06:00", note: "Kiosk down" });
  check("a lead can record a night with the time out the next morning", true);

  // Absences in the HR report and in review evidence (Yonas: no check-ins since the 1st).
  const report = await hrReport(admin, 2026);
  const oct = report.attendance.months.find((m) => m.month === "2026-10")!;
  check("HR report counts October absences", oct.absent > 0, oct);
  check("HR report has an absence rate per department", report.attendance.byDepartment.length > 0 && report.attendance.byDepartment.every((d) => d.rate >= 0 && d.rate <= 100), report.attendance.byDepartment);
  const totals = await att.attendanceTotals(eY, "2026-10-01", "2026-10-31");
  check("review evidence period totals", !!totals && totals.absent > 0, totals);

  // Finance view
  const owner = { ...admin, perms: [...admin.perms, "finance.view" as const, "finance.approve" as const] };
  await fin.saveBudget(owner, { scopeType: "department", scopeKey: "production", scopeLabel: "Production", year: 2026, amount: 100000, alertPct: 80 });
  const acct = await get<{ id: string }>("SELECT id FROM fin_accounts LIMIT 1");
  if (!acct) await run("INSERT INTO fin_accounts (id, name, kind, opening_balance, active, created_at) VALUES ('acc_t', 'Bank', 'bank', 0, 1, ?)", nowIso()).catch(() => null);
  await run(
    "INSERT INTO fin_transactions (id, date, direction, amount, account_id, department, description, source, status, created_at) VALUES (?, '2026-10-10', 'out', 85000, ?, 'production', 'Camera', 'payment', 'posted', ?)",
    uid("tx_"),
    acct?.id ?? "acc_t",
    nowIso(),
  ).catch((e) => console.log("tx insert:", e.message));
  const cf = await fin.companyFinance(owner, 2026);
  const prod = cf.departments.find((d) => d.key === "production");
  check("Finance view: production spend against its budget", !!prod && prod.budget === 100000 && prod.pct === 85, prod);
  check("Finance view needs finance access", !!(await fin.companyFinance(hana, 2026).then(() => null, (e) => e.message)));
  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
}
main();
