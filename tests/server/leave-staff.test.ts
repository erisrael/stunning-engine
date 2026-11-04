// Leave for staff: balances only for HR (unless HR shows them), asking HR a question or a correction, and sick leave
// with evidence that HR checks before approving.
process.env.MAIL_FAKE = "1";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { syncFromUsers } from "../../src/server/hr";
import { upsertAccount } from "../../src/server/workspace-data";
import * as lv from "../../src/server/leave";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, re: RegExp) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return re.test(String(e));
  }
};
const PDF = { name: "note.pdf", mime: "application/pdf", base64: Buffer.from("%PDF-1.4 medical note").toString("base64") };
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const status = async (id: string) => (await get<{ status: string }>("SELECT status FROM leave_requests WHERE id = ?", id))!.status;

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const dawit = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'dawit@demo.local'"))!.id))!;
  const hr = (await loadUser((await upsertAccount({ name: "Selam HR", email: "selam@leave.local", title: "HR", roles: ["hr_manager"], password: "Leave-2026-HR!", mustChangePassword: false } as never)).id))!;
  await syncFromUsers(admin);

  const cfg = await lv.leaveStaffConfig();
  check("by default people do not see balances, and sick leave needs evidence", !cfg.showBalances && cfg.requireEvidence && cfg.queries, cfg);
  const mine = await lv.myLeave(dawit);
  check("a member gets no balances", mine.balances.length === 0 && mine.showBalances === false, mine.balances);
  check("HR sees balances", (await lv.myLeave(hr)).showBalances === true);
  check("only HR managers or Admin change it", await rejects(() => lv.saveLeaveStaffConfig(dawit, { showBalances: true }), /Only HR/));

  // Asking for too much does not tell the number.
  const types = await lv.leaveTypes();
  const annual = types.find((t) => t.daysPerYear !== null && !t.needsDocument)!;
  const sick = types.find((t) => t.needsDocument)!;
  const y = new Date().getUTCFullYear();
  const msg = await lv.requestLeave(dawit, { typeKey: annual.key, startDate: `${y}-01-02`, endDate: `${y}-12-30` }).then(() => "", (e) => String(e));
  check("over the balance: refused without saying the number", /Ask HR about your balance/.test(msg) && !/\d+ days? of/.test(msg), msg);

  // Sick leave and evidence.
  check("sick leave needs evidence", await rejects(() => lv.requestLeave(dawit, { typeKey: sick.key, startDate: day(3), endDate: day(3) }), /needs evidence/));
  check("only a photo or PDF", await rejects(() => lv.requestLeave(dawit, { typeKey: sick.key, startDate: day(3), endDate: day(3), evidence: { ...PDF, mime: "text/html" } }), /photo or a PDF/));
  const id = await lv.requestLeave(dawit, { typeKey: sick.key, startDate: day(3), endDate: day(3), reason: "Flu", evidence: PDF });
  const row = await get<{ evidence_doc_id: string | null }>("SELECT evidence_doc_id FROM leave_requests WHERE id = ?", id);
  check("the evidence is kept on the person's HR record", !!row?.evidence_doc_id && !!(await get("SELECT 1 AS x FROM employee_documents WHERE id = ? AND kind = 'certificate'", row.evidence_doc_id)), row);
  const hrView = await lv.hrLeave(hr);
  const waiting = [...hrView.waiting, ...hrView.withManagers].find((r) => r.id === id);
  check("HR sees the request with its evidence", !!waiting?.needsDocument && waiting.evidenceId === row!.evidence_doc_id, waiting);
  await lv.decideLeave(hr, id, { decision: "approve" });
  check("HR approves it", (await status(id)) === "approved");

  // Without evidence: HR cannot give the final approval until it comes.
  await lv.saveLeaveStaffConfig(hr, { requireEvidence: false });
  const late = await lv.requestLeave(dawit, { typeKey: sick.key, startDate: day(6), endDate: day(6) });
  await lv.saveLeaveStaffConfig(hr, { requireEvidence: true });
  if ((await status(late)) === "pending_lead") {
    const lead = await get<{ approver_id: string }>("SELECT approver_id FROM leave_requests WHERE id = ?", late);
    const approver = lead?.approver_id ? await loadUser(lead.approver_id) : null;
    if (approver) await lv.decideLeave(approver, late, { decision: "approve" });
  }
  if ((await status(late)) === "pending_hr") check("HR cannot approve without evidence", await rejects(() => lv.decideLeave(hr, late, { decision: "approve" }), /no evidence/));
  await lv.addEvidence(dawit, late, PDF);
  check("evidence added later", !!(await get<{ evidence_doc_id: string | null }>("SELECT evidence_doc_id FROM leave_requests WHERE id = ?", late))?.evidence_doc_id);
  const hana = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'hana@demo.local'"))!.id))!;
  check("nobody else adds it (HR can)", await rejects(() => lv.addEvidence(hana, late, PDF), /own leave/));
  if ((await status(late)) === "pending_hr") {
    await lv.decideLeave(hr, late, { decision: "approve" });
    check("then HR approves", (await status(late)) === "approved");
  }

  // Asking HR.
  check("a question needs words", await rejects(() => lv.askHr(dawit, { kind: "question", message: " " }), /Write/));
  const q = await lv.askHr(dawit, { kind: "question", message: "How many annual days do I have?" });
  const c = await lv.askHr(dawit, { kind: "correction", message: "I came back early, it was one day", requestId: id });
  check("HR is told", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE 'Leave correction asked%'", hr.id)));
  check("HR sees both", (await lv.hrQueries(hr)).filter((x) => [q, c].includes(x.id)).length === 2);
  check("a correction names the leave", !!(await lv.hrQueries(hr)).find((x) => x.id === c)?.requestLabel);
  check("only HR answers", await rejects(() => lv.answerQuery(dawit, q, "x"), /Only HR/));
  await lv.answerQuery(hr, q, "You have 12 days of annual leave left.");
  const my = await lv.myQueries(dawit);
  check("the person sees the answer and is told", my.find((x) => x.id === q)?.answer === "You have 12 days of annual leave left." && !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title = 'HR answered about your leave'", dawit.id)));
  check("someone else's leave cannot be the subject", await rejects(() => lv.askHr(hr, { kind: "correction", message: "x", requestId: id }), /not your leave|HR record/));

  // HR shows balances.
  await lv.saveLeaveStaffConfig(hr, { showBalances: true });
  check("when HR shows them, people see their balances", (await lv.myLeave(dawit)).balances.length > 0);
  await lv.saveLeaveStaffConfig(hr, { showBalances: false, queries: false });
  check("questions can be turned off", await rejects(() => lv.askHr(dawit, { kind: "question", message: "x" }), /turned off/));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
