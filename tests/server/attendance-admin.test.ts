// Attendance kept by hand (log, change, remove, clear), the employee rules (warnings, pay deducted for lateness,
// the corrections limit, the written rules published as a policy), and payroll for every account with the income
// tax law (Proclamation 1395/2025 by default, 979/2016 to choose) and the overtime rates.
import { get, run, closeDb, nowIso } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as att from "../../src/server/attendance";
import * as aa from "../../src/server/attendance-admin";
import * as fin from "../../src/server/finance";
import { TAX_LAWS, computePay, incomeTax, DEFAULT_FINANCE_SETTINGS } from "../../src/lib/finance";
import { fmtMin, toMin } from "../../src/lib/attendance";

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
  const dawit = await by("dawit@demo.local");
  const payroll = { ...admin, perms: [...admin.perms, "finance.payroll" as const, "finance.approve" as const] };

  // Payroll for every account.
  const before = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM employees"))!.c);
  const users = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE active = 1"))!.c);
  const en = await fin.enrolEveryone(payroll);
  const after = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM employees"))!.c);
  check("every account gets an HR record for payroll", en.added === after - before && Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM users u WHERE u.active = 1 AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)"))!.c) === 0, { en, users });
  check("people without a salary are counted", en.notSet >= users - 1, en);
  check("a second run adds nobody", (await fin.enrolEveryone(payroll)).added === 0);
  check("only payroll people add everyone", !!(await throws(() => fin.enrolEveryone(dawit))));
  const structures = await fin.payStructures(payroll);
  check("Payroll, Salaries lists every account", structures.length >= users && structures.some((s) => s.basic === null));
  await run("INSERT INTO users (id, name, email, handle, active, created_at) VALUES ('u_newbie', 'New Person', 'newbie@demo.local', 'newbie', 1, ?)", nowIso());
  await fin.enrolEveryone(null);
  check("the daily job adds a new account", !!(await get("SELECT 1 AS x FROM employees WHERE user_id = 'u_newbie'")));

  // Tax law.
  const s0 = await fin.financeSettings();
  check("Proclamation 1395/2025 by default", s0.taxLaw === "1395/2025" && JSON.stringify(s0.taxBrackets) === JSON.stringify(TAX_LAWS["1395/2025"]!.brackets));
  check("2,000 birr a month is free of tax", incomeTax(2000, s0.taxBrackets) === 0);
  check("3,000 birr: 15% less 300", incomeTax(3000, s0.taxBrackets) === 150);
  check("10,000 birr: 25% less 850", incomeTax(10000, s0.taxBrackets) === 1650);
  check("20,000 birr: 35% less 2,050", incomeTax(20000, s0.taxBrackets) === 4950);
  check("brackets are continuous at each limit", TAX_LAWS["1395/2025"]!.brackets.every((b, i, a) => i === 0 || b.upTo === null || Math.abs(incomeTax(a[i - 1]!.upTo!, a) - ((a[i - 1]!.upTo! * b.rate) / 100 - b.deduct)) < 0.01));
  const pay = computePay({ basic: 10000, allowances: [{ name: "Transport", amount: 600, taxable: false }], deductions: [], overtimeHours: 0, overtimeRate: 1.5, unpaidDays: 0 }, DEFAULT_FINANCE_SETTINGS);
  check("payslip: tax on basic, pension 7% and 11%, tax-free allowance", pay.incomeTax === 1650 && pay.pensionEmployee === 700 && pay.pensionEmployer === 1100 && pay.net === 10600 - 1650 - 700, pay);
  const s1 = await fin.saveFinanceSettings(payroll, { taxLaw: "979/2016" });
  check("choosing 979/2016 brings its brackets", s1.taxLaw === "979/2016" && s1.taxBrackets[0]!.upTo === 600);
  const s2 = await fin.saveFinanceSettings(payroll, { taxBrackets: [...s1.taxBrackets.slice(0, -1), { upTo: null, rate: 36, deduct: 1500 }] });
  check("brackets changed by hand are custom", s2.taxLaw === "custom");
  const s3 = await fin.saveFinanceSettings(payroll, { taxLaw: "1395/2025", overtimeRates: { normal: 1.5, night: 1.75, rest: 2, holiday: 2.5 } });
  check("back to 1395/2025", s3.taxLaw === "1395/2025" && s3.taxBrackets[0]!.upTo === 2000);
  check("overtime rates of the Labour Proclamation", JSON.stringify(s3.overtimeRates) === JSON.stringify({ normal: 1.5, night: 1.75, rest: 2, holiday: 2.5 }));

  // Records by hand.
  const eD = (await get<{ id: string }>("SELECT id FROM employees WHERE user_id = ?", dawit.id))!.id;
  const cfg = await att.attendanceConfig();
  const shift = cfg.shifts.find((x) => x.key === cfg.defaultShift)!;
  const today = new Date().toISOString().slice(0, 10);
  const pastWork = (n: number) => {
    const out: string[] = [];
    for (let t = Date.parse(`${today}T12:00:00Z`) - 864e5; out.length < n; t -= 864e5) {
      const d = new Date(t);
      if (shift.workdays.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    }
    return out;
  };
  const [d1] = pastWork(1);
  // Lateness is checked in last month, which always has enough working days.
  const lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  await att.saveAttendanceConfig(admin, { startDate: `${lastMonth}-01` });
  check("a reason is required", !!(await throws(() => aa.logEvent(admin, { employeeId: eD, day: d1!, kind: "in", time: "08:30", note: "" }))));
  check("only HR and Admin log by hand", !!(await throws(() => aa.logEvent(dawit, { employeeId: eD, day: d1!, kind: "in", time: "08:30", note: "x" }))));
  const inId = await aa.logEvent(admin, { employeeId: eD, day: d1!, kind: "in", time: shift.start, note: "Kiosk was down" });
  await aa.logEvent(admin, { employeeId: eD, day: d1!, kind: "out", time: shift.end, note: "Kiosk was down" });
  let ev = await aa.dayEvents(admin, eD, d1!);
  check("logged check-in and check-out", ev.filter((e) => !e.voided).map((e) => `${e.kind}@${e.time}`).join(",") === `in@${shift.start},out@${shift.end}`, ev);
  const lateTime = fmtMin(toMin(shift.start) + shift.graceMin + 20);
  await aa.editEvent(admin, inId, { time: lateTime, note: "He arrived later" });
  ev = await aa.dayEvents(admin, eD, d1!);
  check("a changed time keeps the old one, voided", ev.some((e) => e.id === inId && e.voided) && ev.some((e) => !e.voided && e.kind === "in" && e.time === lateTime && /Changed from/.test(e.note ?? "")), ev);
  const res = await att.dayResult(eD, d1!);
  check("the day follows the new time (late)", res?.status === "late", res);
  check("the person is told", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE 'Your check-in time was changed%'", dawit.id)));
  check("the change is in the audit log", !!(await get("SELECT 1 AS x FROM audit_events WHERE action = 'attendance.edit' AND summary LIKE '%changed%'")));
  const outId = ev.find((e) => !e.voided && e.kind === "out")!.id;
  await aa.removeEvent(admin, outId, "Wrong person");
  check("a removed check-out leaves the day without one", (await aa.dayEvents(admin, eD, d1!)).filter((e) => !e.voided).length === 1);
  await att.markDay(admin, { employeeId: eD, day: d1!, status: "present", note: "test" });
  const cl = await aa.clearAttendance(admin, { employeeId: eD, from: d1!, to: d1!, note: "Test entries" });
  check("clearing removes check-ins and day records", cl.events === 1 && cl.marks === 1 && (await aa.dayEvents(admin, eD, d1!)).every((e) => e.voided), cl);
  check("a cleared working day is absent again", (await att.dayResult(eD, d1!))?.status === "absent");

  // Rules.
  const rules = await aa.saveAttendanceRules(admin, { lateWarnAfter: 2, latesPerDeduction: 2, deductionDays: 0.5, maxCorrections: 1 });
  check("rules saved", rules.latesPerDeduction === 2 && rules.maxCorrections === 1);
  check("only HR and Admin change the rules", !!(await throws(() => aa.saveAttendanceRules(dawit, { lateWarnAfter: 0 }))));
  const month = lastMonth;
  const lates = pastWork(45).filter((d) => d.slice(0, 7) === month).slice(0, 2);
  check("last month has the working days to test", lates.length === 2);
  {
    for (const d of lates) {
      await aa.logEvent(admin, { employeeId: eD, day: d, kind: "in", time: lateTime, note: "late test" });
      await aa.logEvent(admin, { employeeId: eD, day: d, kind: "out", time: shift.end, note: "late test" });
    }
    const base = (await att.payrollFeed(month, [eD])).get(eD)!;
    await aa.saveAttendanceRules(admin, { latesPerDeduction: 0 });
    const without = (await att.payrollFeed(month, [eD])).get(eD)!;
    check("two late days cost half a day of pay", Math.abs(base.unpaidDays - without.unpaidDays - 0.5) < 0.01, { base, without });
    await aa.saveAttendanceRules(admin, { latesPerDeduction: 2 });
    await aa.ruleChecks(nowIso(), month);
    check("the person and HR are warned after two late days", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE '%late 2 times%'", dawit.id)));
  }
  const [c1, c2] = pastWork(45).filter((d) => d.slice(0, 7) === month).slice(2, 4);
  await att.requestCorrection(dawit, { day: c1!, inTime: shift.start, reason: "Forgot" });
  check("the corrections limit applies", /1 corrections a month/.test((await throws(() => att.requestCorrection(dawit, { day: c2!, inTime: shift.start, reason: "Again" }))) ?? ""));
  const text = await aa.rulesText();
  check("the written rules come from the shifts and rules", text.includes(shift.start) && text.includes("Every 2 late days") && text.includes("1.75"));
  const annId = await aa.publishRules(admin, text);
  const ann = await get<{ kind: string; title: string }>("SELECT kind, title FROM announcements WHERE id = ?", annId);
  check("published as a policy everyone confirms", ann?.kind === "policy" && ann.title === "Attendance rules", ann);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await closeDb();
});
