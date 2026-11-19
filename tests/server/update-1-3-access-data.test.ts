// Chapa user access (grants per person), Chapa and Noor income on the Company overview, the Noor saved-copy
// tools (live rows kept, Families merge, Admin's switches), and the call switches (calls off, wait estimate).
import { closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as CA from "../../src/server/chapa-access";
import { chapaCan, chapaBusinesses } from "../../src/server/chapa-hub";
import * as CI from "../../src/server/company-income";
import * as T from "../../src/server/cms-data-tools";
import * as sd from "../../src/server/support-desk";
import { canOpenPath, placesFor } from "../../src/server/page-access";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => {
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
  const fin = (await loadUser((await upsertAccount({ name: "Fin", email: "fin@t13.local", title: "Finance", roles: ["finance_manager"] as never, password: "Finance-2026-ok!", mustChangePassword: false })).id))!;
  const t0 = nowIso();
  const a1 = uid(), a2 = uid();
  await run("INSERT INTO chapa_accounts (id, name, secret_key_enc, currency, mode, active, created_at, updated_at) VALUES (?, 'Subs', 'x', 'ETB', 'live', 1, ?, ?), (?, 'Test', 'x', 'ETB', 'test', 1, ?, ?)", a1, t0, t0, a2, t0, t0);
  const tx = (acct: string, status: string, amount: number) => run("INSERT INTO chapa_transactions (account_id, tx_ref, amount, currency, method, status, created_at, updated_at) VALUES (?, ?, ?, 'ETB', 'telebirr', ?, ?, ?)", acct, uid(), amount, status, t0, t0);
  await tx(a1, "success", 500);
  await tx(a1, "success", 300);
  await tx(a1, "failed", 100);
  await tx(a2, "success", 9999);

  // 1. Chapa access.
  check("only Admin opens Chapa access", !!(await err(() => CA.chapaAccessOverview(dawit))));
  const before = await chapaCan(dawit, "view", a1);
  check("a person without a Finance role has no Chapa at first", !before && !(await canOpenPath(dawit, "/finance/chapa")));
  await CA.grantChapaAccess(admin, { userIds: [dawit.id], actions: ["export"], businesses: [a1] });
  check("a grant gives viewing and the chosen actions on the chosen business", (await chapaCan(dawit, "view", a1)) && (await chapaCan(dawit, "export", a1)) && !(await chapaCan(dawit, "view", a2)));
  check("the granted person can open Chapa and sees only that business", (await canOpenPath(dawit, "/finance/chapa")) && (await chapaBusinesses(dawit)).map((b) => b.id).join() === a1);
  await CA.grantChapaAccess(admin, { userIds: [dawit.id], actions: ["view", "refund"], businesses: "*" });
  check("a money action still needs it switched on for the business", !(await chapaCan(dawit, "refund", a1)));
  await CA.revokeChapaAccess(admin, [dawit.id]);
  check("removing Chapa takes it away", !(await chapaCan(dawit, "view", a1)) && !(await CA.hasChapaGrant(dawit)));
  await CA.resetChapaAccess(admin, [dawit.id]);
  check("back to role leaves no grant", !(await CA.chapaGrants())[dawit.id]);

  // 2. Company overview income.
  const day = t0.slice(0, 10);
  await run("INSERT INTO cms_daily_metrics (day, metrics_json, updated_at) VALUES (?, ?, ?) ON CONFLICT (day) DO UPDATE SET metrics_json = excluded.metrics_json", day, JSON.stringify({ paid: 2, paidAmount: 700, pending: 1, pendingAmount: 200, failed: 0, methods: { bank: 700 } }), t0);
  const inc = (await CI.companyIncome(fin, { from: day, to: day }))!;
  check("the overview reads stored Chapa income", inc.chapa!.success.find((m) => m.currency === "ETB")!.amount === 500 + 300 + 9999 && inc.chapa!.failed === 1, inc.chapa);
  check("the overview reads stored Noor income", inc.noor!.paidAmount === 700 && inc.noor!.paid === 2, inc.noor);
  await CI.saveCompanyIncomeConfig(fin, { excludeBusinesses: [a2], noor: false });
  const inc2 = (await CI.companyIncome(fin, { from: day, to: day }))!;
  check("Admin leaves a business out and turns Noor off", inc2.chapa!.success[0]!.amount === 800 && inc2.noor === null, inc2.chapa);
  check("people who cannot read finance get nothing", (await CI.companyIncome(dawit, { from: day, to: day })) === null);
  check("only Admin or Finance configures it", !!(await err(() => CI.saveCompanyIncomeConfig(dawit, { chapa: false }))));

  // 3. Noor saved-copy tools.
  await run("DELETE FROM legacy_cms_records WHERE category IN ('students','parents','subscriptions')");
  const kept = await T.snapshotLiveRows("parents", [{ _recordId: "p1", Name: "Abebe Kebede", Phone: "0911223344" }, { _recordId: "p2", Name: "Lonely Parent", Phone: "0911000000" }, { Name: "No id" }]);
  check("live rows with an id are kept in the saved copy", kept === 2 && Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM legacy_cms_records WHERE category = 'parents'"))!.n) === 2);
  await T.snapshotLiveRows("parents", [{ _recordId: "p1", Name: "Abebe Kebede", Phone: "0911223399" }]);
  check("a row read again replaces its saved version", Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM legacy_cms_records WHERE category = 'parents'"))!.n) === 2 && /0911223399/.test((await get<{ d: string }>("SELECT data_json AS d FROM legacy_cms_records WHERE external_id = 'p1'"))!.d));
  await T.snapshotLiveRows("students", [{ _recordId: "s1", Name: "Liya", Parent: "Abebe Kebede", Grade: "5" }, { _recordId: "s2", Name: "Solo", Grade: "7", Phone: "0922000000" }]);
  const fam = await T.cmsFamilies(admin);
  const kinds = Object.fromEntries(fam.rows.map((r) => [r.Student || r.Parent, r.Kind]));
  check("Families merges students with parents, students on their own and parents without a student", kinds.Liya === "Student with parent" && kinds.Solo === "Student on own" && kinds["Lonely Parent"] === "Parent without student", kinds);
  check("Families gives one contact phone per row", fam.rows.find((r) => r.Student === "Liya")!["Contact phone"].includes("0911223399") && fam.rows.find((r) => r.Student === "Solo")!["Contact phone"].includes("0922000000"));
  await T.saveCmsDataTools(admin, { snapshotLive: false, families: false });
  check("Admin switches keeping live rows off", (await T.snapshotLiveRows("parents", [{ _recordId: "p9", Name: "X" }])) === 0);
  check("Admin switches Families off", /switched off/.test((await err(() => T.cmsFamilies(admin))) ?? ""));
  check("only Admin sets the Noor tools", !!(await err(() => T.saveCmsDataTools(dawit, { export: false }))));
  await T.saveCmsDataTools(admin, { snapshotLive: true, families: true });

  // 4. Calls switched off, and the assistant's pages.
  await sd.saveSupportConfig(admin, { callsEnabled: false });
  check("calls off is saved", (await sd.supportConfig()).callsEnabled === false);
  await sd.saveSupportConfig(admin, { enabled: true, callsEnabled: true, defaultHandleSec: 5 });
  check("the usual call length is kept within limits", (await sd.supportConfig()).defaultHandleSec === 30);
  const places = (await placesFor(admin, null)).map((p) => p.href);
  check("the assistant knows the support, Chapa and Noor pages", ["/support", "/call-records", "/finance/chapa", "/admin?tab=chapa-access", "/legacy-cms?view=families"].every((h) => places.includes(h)), ["/support", "/call-records", "/finance/chapa", "/admin?tab=chapa-access", "/legacy-cms?view=families"].filter((h) => !places.includes(h)));
  check("the assistant does not offer the kiosk to people without attendance rights", !(await placesFor(dawit, null)).some((p) => p.href === "/kiosk") || dawit.perms.includes("attendance.manage"));

  console.log(`${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
