// Phase 16.1 checks: presenters and releases; a part cannot leave Recording without a valid release when required;
// releases ending warn HR; monthly fee statements sent to Finance and made a bill.
import { get, run, closeDb, nowIso, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { createItem, evaluateRequirements, releaseToProduction } from "../../src/server/workflow";
import * as pr from "../../src/server/presenters";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
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
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@pr.local`, title: "Staff", roles: roles as never, password: "Presenters-2026!", mustChangePassword: false })).id))!;
  const dev = await mk("prdev", ["developer"]);
  const fin = await mk("prfin", ["finance_manager"]);
  const hr = await mk("prhr", ["hr_manager"]);

  check("people outside cannot manage presenters", !!(await throws(() => pr.savePresenter(dev, { name: "X" }))));
  const id = await pr.savePresenter(hr, { name: "Abebech Tadesse", kind: "teacher", subjects: "Grade 9 Physics", aliases: ["Ms. Abebech"], rateKind: "session", rate: 1500 });
  const list = await pr.listPresenters(hr);
  check("a presenter with no release", list.find((p) => p.id === id)?.releaseState === "none");

  // A part in Recording whose teacher is this presenter.
  const g = (await get<{ id: string }>("SELECT id FROM grades LIMIT 1"))!.id;
  const sub = (await get<{ id: string }>("SELECT id FROM subjects LIMIT 1"))!.id;
  const made = await createItem({ actor: admin }, { gradeId: g, subjectId: sub, title: "Presenter release part", teacher: "Ms. Abebech" });
  await releaseToProduction({ actor: admin }, made.id, "recording");
  const item = { id: made.id };
  check("no rule, no release requirement", !(await evaluateRequirements(item.id)).some((r) => r.key === "release"));
  await pr.savePresenterConfig(hr, { requireRelease: true, warnDays: 30 });
  const r1 = (await evaluateRequirements(item.id)).find((r) => r.key === "release");
  check("with the rule, the part needs a valid release (found by another name)", !!r1 && !r1.met && /Abebech Tadesse/.test(r1.label), r1);
  check("the date it ends cannot be before it was signed", /before/.test((await throws(() => pr.addRelease(hr, id, { signedOn: "2026-05-01", expiresOn: "2026-01-01" }))) ?? ""));
  const past = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  await pr.addRelease(hr, id, { signedOn: past, expiresOn: yesterday, file: { name: "release.pdf", mime: "application/pdf", base64: Buffer.from("%PDF-1.4 test").toString("base64") } });
  check("an expired release does not count", (await evaluateRequirements(item.id)).find((r) => r.key === "release")?.met === false);
  const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  await pr.addRelease(hr, id, { signedOn: yesterday, expiresOn: soon });
  check("a valid release meets it", (await evaluateRequirements(item.id)).find((r) => r.key === "release")?.met === true);
  check("ending within the warning days is shown", (await pr.listPresenters(hr)).find((p) => p.id === id)?.releaseState === "expiring");
  await pr.releaseChecks();
  check("HR is warned", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE '%release ends%'", hr.id)));
  await pr.releaseChecks();
  check("once", Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND title LIKE '%release ends%'", hr.id))?.c) === 1);

  // Fees.
  const month = nowIso().slice(0, 7);
  for (let i = 0; i < 3; i++)
    await run("INSERT INTO recording_sessions (id, item_id, scheduled_start, duration_min, presenter, status, created_at) VALUES (?, ?, ?, 90, 'Abebech Tadesse', 'completed', ?)", uid("ses_"), item.id, `${month}-0${i + 1}T09:00:00.000Z`, nowIso());
  const st = (await pr.statements(hr, month)).find((s) => s.presenterId === id);
  check("the month's statement counts sessions and the fee", st?.sessions === 3 && st.amount === 4500 && st.hours === 4.5, st);
  check("Finance cannot bill before it is sent", !!(await throws(() => pr.billStatement(fin, id, month))));
  await pr.sendStatement(hr, id, month);
  check("Finance is told", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE 'Presenter fees to pay%'", fin.id)));
  check("only Finance makes the bill", !!(await throws(() => pr.billStatement(hr, id, month))));
  const bill = await pr.billStatement(fin, id, month);
  const b = await get<{ amount: number; vendor_id: string }>("SELECT amount, vendor_id FROM fin_bills WHERE id = ?", bill);
  check("the bill is made for the presenter as a vendor", Number(b?.amount) === 4500 && !!(await get("SELECT 1 AS x FROM fin_parties WHERE id = ? AND name = 'Abebech Tadesse'", b?.vendor_id ?? "")));
  check("and the statement shows billed", (await pr.statements(fin, month)).find((s) => s.presenterId === id)?.status === "billed");
  void admin;

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
