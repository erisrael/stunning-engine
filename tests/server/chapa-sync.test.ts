// Update 1.2, Phase 1: reading every Chapa transaction, against fake Chapa APIs that behave in the ways the real
// one may: a date range applied but answers cut at 20 rows with no pages; pages that are ignored; a list that is
// oldest first; a window that fails; a run that runs out of time; dates without a zone; rows without a tx_ref.
// Then reconciliation: missing rows and changed statuses are found, repaired and counted.
process.env.CHAPA_API_BASE = "https://chapa.fake";
import { get, all, run, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { saveChapaAccount } from "../../src/server/chapa";
import * as H from "../../src/server/chapa-hub";
import * as S from "../../src/server/chapa-sync";
import { listRuns, runErrors } from "../../src/server/sync-runs";
import { normalizeChapaStatus } from "../../src/lib/chapa";
import { DATE_PRESETS, datePresetRange } from "../../src/lib/date-presets";
import crypto from "node:crypto";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};

const NOW = Date.now();
const HOUR = 3600e3;
const DAY = 86400e3;
const day = (t: number) => new Date(t + 3 * HOUR).toISOString().slice(0, 10);
type T = Record<string, any>;
const make = (prefix: string, i: number, at: number, extra: T = {}): T => ({
  tx_ref: `${prefix}-${i}`, ref_id: `AP${prefix}${i}`, amount: String(100 + (i % 4) * 25), charge: "3", currency: "ETB", payment_method: "telebirr", type: "API",
  status: i % 9 === 0 ? "failed/cancelled" : i % 13 === 0 ? "pending" : "success", first_name: `C${i}`, last_name: "T", email: `c${i}@x.test`, mobile: `09110${String(10000 + i)}`, created_at: new Date(at).toISOString(), ...extra,
});

// W: 300 payments over 40 days, 60 of them inside one hour. Date range applied, 20 rows an answer, no pages.
const W: T[] = [];
for (let i = 0; i < 240; i++) W.push(make("W", i, NOW - 2 * HOUR - i * 4 * HOUR));
W[0] = make("W", 0, NOW - 30 * 60e3, { status: "pending" });
for (let i = 240; i < 300; i++) W.push(make("W", i, NOW - 3 * DAY - (i - 240) * 60e3));
// P: 130 payments, oldest first, Laravel pages of 50, date range ignored.
const P: T[] = [];
for (let i = 0; i < 130; i++) P.push(make("P", i, NOW - 20 * DAY + i * 3 * HOUR));
// Z: dates in UTC written without a zone. R: the list gives only Chapa's reference. L: 20 rows, no range, no pages.
const Z: T[] = [];
for (let i = 0; i < 12; i++) Z.push(make("Z", i, 0, { created_at: new Date(NOW - 30 * 60e3 - i * 20 * 60e3).toISOString().slice(0, 19).replace("T", " ") }));
const R: T[] = [0, 1, 2].map((i) => {
  const t = make("R", i, NOW - HOUR - i * HOUR);
  delete t.tx_ref;
  return t;
});
const L: T[] = [];
for (let i = 0; i < 20; i++) L.push(make("L", i, NOW - HOUR - i * HOUR));

const failing = new Set<string>(); // "from_date" values that answer HTTP 400
let calls: string[] = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const windowed = (list: T[], u: URL, cap: number) => {
  const from = Date.parse(`${u.searchParams.get("from_date") ?? "1970-01-01T00:00:00"}Z`);
  const to = Date.parse(`${u.searchParams.get("to_date") ?? "2999-01-01T00:00:00"}Z`);
  const at = (t: T) => Date.parse(/Z$/.test(t.created_at) ? t.created_at : `${t.created_at.replace(" ", "T")}Z`);
  return list.filter((t) => at(t) >= from && at(t) <= to).sort((a, b) => at(b) - at(a)).slice(0, cap);
};
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = new URL(String(url));
  const key = String((init?.headers as Record<string, string>)?.Authorization ?? "");
  calls.push(`${u.pathname}${u.search}`);
  if (u.pathname === "/v1/transactions") {
    if (failing.has(u.searchParams.get("from_date") ?? "")) return json({ message: "Bad window" }, 400);
    if (key.includes("WWW")) return json({ status: "success", data: { transactions: windowed(W, u, 20) } });
    if (key.includes("ZZZ")) return json({ status: "success", data: { transactions: windowed(Z, u, 100) } });
    if (key.includes("RRR")) return json({ status: "success", data: { transactions: windowed(R, u, 100) } });
    if (key.includes("LLL")) return json({ status: "success", data: { transactions: L } });
    const page = Number(u.searchParams.get("page") || 1);
    const rows = P.slice((page - 1) * 50, page * 50);
    // The next address names another scheme and host, as a proxy in front of an API does.
    return json({ status: "success", data: { transactions: rows, pagination: { per_page: 50, current_page: page, next_page_url: page * 50 < P.length ? `http://internal.chapa/v1/transactions?page=${page + 1}` : null } } });
  }
  const m = u.pathname.match(/^\/v1\/transaction\/verify\/(.+)$/);
  if (m) return json({ status: "success", data: { tx_ref: decodeURIComponent(m[1]), reference: "APR0", status: "success", amount: "100", currency: "ETB", created_at: R[0].created_at } });
  return json({ message: "not found" }, 404);
}) as typeof fetch;

const count = async (id: string) => Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM chapa_transactions WHERE account_id = ?", id))?.c);

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const acc = (name: string, key: string) => saveChapaAccount(admin, { name, secretKey: `CHASECK-${key}`, webhookSecret: `wh-${key}`, currency: "ETB" });

  check("statuses: unpaid, incomplete and unsuccessful are never read as paid", ["unpaid", "incomplete", "Unsuccessful", "failed/cancelled", "not paid"].every((s) => normalizeChapaStatus(s) === "failed") && ["success", "Successful", "paid", "completed"].every((s) => normalizeChapaStatus(s) === "success") && normalizeChapaStatus("processing") === "pending");
  check("a missing date is not replaced by now", H.parseChapaDate("") === null && H.parseChapaDate("nonsense") === null && H.parseChapaDate("2026-01-05 10:00:00", "utc") === "2026-01-05T10:00:00.000Z" && H.parseChapaDate("2026-01-05 10:00:00") === "2026-01-05T07:00:00.000Z");

  // 1. Answers cut at 20 rows, no pages: every payment is still read.
  const a = await acc("Windows", "WWW");
  const s1 = await H.syncChapaBusiness(a, {});
  const w = await get<{ backfilled_at: string | null; row_cap: number | null; date_filter: string | null; health: string }>("SELECT backfilled_at, row_cap, date_filter, health FROM chapa_accounts WHERE id = ?", a);
  check("a full sync reads all 300 payments although each answer holds 20", s1.rows >= 300 && (await count(a)) === 300 && s1.complete && s1.mode === "windows", { s1, stored: await count(a) });
  check("the business is marked complete, with the row limit Chapa was seen to apply", !!w?.backfilled_at && w.row_cap === 20 && w.date_filter === "yes" && w.health === "ok", w);
  const lastThree = await H.listChapaTx(admin, { biz: a, from: day(NOW - 2 * DAY), until: day(NOW), limit: 10000 });
  const expectThree = W.filter((t) => day(Date.parse(t.created_at)) >= day(NOW - 2 * DAY)).length;
  check("the last three days show every payment Chapa has for them", lastThree.rows.length === expectThree, { got: lastThree.rows.length, expectThree });

  // 2. A normal sync: new payments and a changed status.
  W.unshift(make("W", 900, NOW - 60e3), make("W", 901, NOW - 120e3));
  const changed = W.find((t) => t.tx_ref === "W-0")!;
  changed.status = "success";
  calls = [];
  const s2 = await H.syncChapaBusiness(a, {});
  const ch = await get<{ status: string; status_history: string; provider_status: string }>("SELECT status, status_history, provider_status FROM chapa_transactions WHERE account_id = ? AND tx_ref = ?", a, changed.tx_ref);
  check("a normal sync adds new payments and updates a changed status with its history", s2.inserted === 2 && (await count(a)) === 302 && ch?.status === "success" && JSON.parse(ch.status_history).length === 2 && ch.provider_status === "success", { s2, ch });
  check("a normal sync asks only for the recent days", calls.length < 12 && calls.every((c) => c.includes("from_date")), calls.length);
  const s3 = await H.syncChapaBusiness(a, {});
  check("reading the same payments again changes nothing", s3.inserted === 0 && s3.updated === 0 && (await count(a)) === 302, s3);

  // 3. A run that runs out of time carries on from where it stopped.
  const b = await acc("Resume", "WWW-2");
  const p1 = await H.syncChapaBusiness(b, { budgetMs: -1 });
  check("a full run out of time is paused, not reported as done", p1.status === "paused" && !p1.complete && !(await get<{ backfilled_at: string | null }>("SELECT backfilled_at FROM chapa_accounts WHERE id = ?", b))?.backfilled_at, p1);
  const p2 = await H.syncChapaBusiness(b, {});
  check("the next call carries on the same run to the end", p2.runId === p1.runId && p2.status === "done" && (await count(b)) === 302, { p2, stored: await count(b) });

  // 4. A window that fails is kept, logged and tried again.
  const c = await acc("Retry", "WWW-3");
  const bad = new Date(Math.floor((NOW + 5 * 60e3) / 1000) * 1000 - 14 * DAY).toISOString().slice(0, 13);
  const orig = globalThis.fetch;
  let failOn = true;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const hit = failOn && u.pathname === "/v1/transactions" && (u.searchParams.get("from_date") ?? "").startsWith(bad) && Date.parse(`${u.searchParams.get("to_date")}Z`) - Date.parse(`${u.searchParams.get("from_date")}Z`) === 7 * DAY;
    return hit ? json({ message: "Temporary trouble" }, 400) : orig(url, init);
  }) as typeof fetch;
  const f1 = await H.syncChapaBusiness(c, {});
  const errs = await runErrors(f1.runId);
  check("a failed window leaves the run partial with the error logged", f1.status === "partial" && !f1.complete && errs.some((e) => /Temporary trouble/.test(e.message)) && (await count(c)) < 302, { f1, errs: errs.length });
  failOn = false;
  const f2 = await H.syncChapaBusiness(c, {});
  check("the next run reads the failed window and finishes", f2.runId === f1.runId && f2.status === "done" && f2.complete && (await count(c)) === 302, { f2, stored: await count(c) });
  globalThis.fetch = orig;

  // 5. Pages, oldest first, with a next address on another host; the date range is ignored.
  const d = await acc("Pages", "PPP");
  const g1 = await H.syncChapaBusiness(d, {});
  check("a paged list is read to its end, following next addresses on Chapa's own host", g1.mode === "pages" && g1.complete && (await count(d)) === 130, { g1, stored: await count(d) });
  P.push(make("P", 500, NOW - 60e3));
  const g2 = await H.syncChapaBusiness(d, {});
  check("a list that is oldest first is not stopped at its first page", g2.inserted === 1 && (await count(d)) === 131 && g2.notes.some((n) => /oldest first/.test(n)), g2);

  // 6. Dates without a zone are placed by the window that returned them.
  const z = await acc("Zone", "ZZZ");
  await H.syncChapaBusiness(z, {});
  const zr = await get<{ created_at: string }>("SELECT created_at FROM chapa_transactions WHERE account_id = ? AND tx_ref = 'Z-0'", z);
  const zone = (await get<{ date_zone: string | null }>("SELECT date_zone FROM chapa_accounts WHERE id = ?", z))?.date_zone;
  check("dates without a zone are read in the zone Chapa uses", zone === "utc" && Math.abs(Date.parse(zr!.created_at) - (NOW - 30 * 60e3)) < 2000, { zone, zr });

  // 7. A payment listed by Chapa's reference only, then verified by its tx_ref, is one row.
  const rr = await acc("Refs", "RRR");
  await H.syncChapaBusiness(rr, {});
  await H.verifyChapaTx(admin, rr, "my-order-77");
  const rows = await all<{ tx_ref: string; ref_id: string }>("SELECT tx_ref, ref_id FROM chapa_transactions WHERE account_id = ? ORDER BY tx_ref", rr);
  check("one payment known by two references stays one row", rows.length === 3 && rows.some((x) => x.tx_ref === "my-order-77" && x.ref_id === "APR0"), rows);

  // 8. Nothing but one full answer: said plainly, not reported as complete.
  const l = await acc("Limited", "LLL");
  const l1 = await H.syncChapaBusiness(l, {});
  check("a list that cannot be read further is not called complete", !l1.complete && l1.notes.some((n) => /cannot be read/.test(n)) && (await get<{ health: string }>("SELECT health FROM chapa_accounts WHERE id = ?", l))?.health === "partial", l1);

  // 9. Reconciliation.
  await run("DELETE FROM chapa_transactions WHERE account_id = ? AND tx_ref IN ('W-1','W-2','W-3','W-4','W-5')", a);
  await run("UPDATE chapa_transactions SET status = 'pending' WHERE account_id = ? AND tx_ref = 'W-6'", a);
  await run("INSERT INTO chapa_transactions (account_id, tx_ref, amount, status, created_at, updated_at) VALUES (?, 'only-here', 50, 'success', ?, ?)", a, new Date(NOW - 5 * HOUR).toISOString(), new Date().toISOString());
  const from = day(NOW - 6 * DAY);
  const rec = await S.reconcileChapa(admin, a, from, day(NOW));
  const provider = W.filter((t) => Date.parse(t.created_at) >= Date.parse(`${from}T00:00:00Z`) - 3 * HOUR).length;
  check("reconciliation counts Chapa's payments for the range", rec.provider.total === provider && rec.mode === "windows", { got: rec.provider.total, provider });
  check("it finds what is missing, what changed and what is only here", rec.missingCount === 5 && rec.statusChangedCount === 1 && rec.statusChanged[0].txRef === "W-6" && rec.localOnly.some((x) => x.txRef === "only-here"), { m: rec.missingCount, s: rec.statusChangedCount, o: rec.localOnlyCount });
  check("and repairs it: stored equals Chapa plus the row that is only here", rec.repaired.inserted === 5 && rec.localAfter.total === provider + 1 && rec.localAfter.byStatus.success.n === rec.provider.byStatus.success.n + 1, rec.localAfter);
  const again = await S.reconcileChapa(admin, a, from, day(NOW));
  check("a second reconciliation finds nothing missing", again.missingCount === 0 && again.statusChangedCount === 0);

  // 9b. Update 1.2 Phase 2: the date presets, one page of transactions counted and sorted by the database, the
  // callbacks kept per payment, and saved filters.
  const three = datePresetRange("3days", null, null, NOW);
  const lastWeek = datePresetRange("lastweek", null, null, NOW);
  const lastMonth = datePresetRange("lastmonth", null, null, NOW);
  check("date presets: last 3 days is three calendar days ending today; last week and last month are whole", three.from === day(NOW - 2 * DAY) && three.until === day(NOW) && (Date.parse(lastWeek.until!) - Date.parse(lastWeek.from!)) / DAY === 6 && new Date(lastWeek.from!).getUTCDay() === 1 && lastMonth.from!.endsWith("-01") && datePresetRange("all").from === null && DATE_PRESETS.length === 13, { three, lastWeek, lastMonth });
  const seven = datePresetRange("7days", null, null, NOW);
  const inThree = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM chapa_transactions WHERE account_id = ? AND created_at >= ?", a, new Date(Date.parse(`${seven.from}T00:00:00Z`) - 3 * HOUR).toISOString()))?.c);
  const pg1 = await H.chapaTxPage(admin, { biz: a, from: seven.from!, until: seven.until!, pageSize: 25, page: 1, sort: "amount", dir: "asc" });
  const pg2 = await H.chapaTxPage(admin, { biz: a, from: seven.from!, until: seven.until!, pageSize: 25, page: 2, sort: "amount", dir: "asc" });
  const sm = pg1.summary[0];
  check("a page holds 25 rows and the total is of every matching payment", pg1.rows.length === 25 && pg1.total === inThree && pg1.pages === Math.ceil(inThree / 25) && pg2.page === 2 && !pg2.rows.some((r) => pg1.rows.some((x) => x.txRef === r.txRef)), { total: pg1.total, inThree });
  check("sorting is done on the whole set, not the page", pg1.rows.every((r, i) => i === 0 || r.amount >= pg1.rows[i - 1].amount) && pg2.rows[0].amount >= pg1.rows[24].amount);
  check("the summary cards add up to the total", sm.total === pg1.total && sm.success + sm.pending + sm.failed + sm.refunded + sm.reversed === sm.total && sm.average !== null && Math.abs(sm.average - sm.successAmount / sm.success) < 0.001 && sm.rate !== null && sm.rate > 0 && sm.rate <= 1, sm);
  const failedOnly = await H.chapaTxPage(admin, { biz: a, from: seven.from!, until: seven.until!, status: ["failed"], customer: "c9@x.test" });
  check("filters work together and the summary follows them", failedOnly.total >= 1 && failedOnly.rows.every((r) => r.status === "failed" && r.email === "c9@x.test") && failedOnly.summary[0].success === 0, failedOnly.total);
  const byRef = await H.chapaTxPage(admin, { biz: a, ref: "W-17" });
  check("search by transaction reference over all time", byRef.rows.some((r) => r.txRef === "W-17") && byRef.rows.every((r) => r.txRef.includes("W-17")), byRef.total);
  const timed = await H.chapaTxPage(admin, { biz: a, from: day(NOW), until: day(NOW), fromTime: "00:00", untilTime: "00:00" });
  check("a time of day narrows the range", timed.total <= (await H.chapaTxPage(admin, { biz: a, from: day(NOW), until: day(NOW) })).total);
  check("a business with complete history shows no partial warning", pg1.partial.length === 0 && (await H.chapaTxPage(admin, { biz: l })).partial.length === 1);
  const hookBody = JSON.stringify({ event: "charge.success", tx_ref: "W-17", reference: "APW17", status: "success" });
  const sigOk = crypto.createHmac("sha256", "wh-WWW").update(hookBody).digest("hex");
  await H.chapaWebhook(a, hookBody, new Headers({ "x-chapa-signature": "wrong" }));
  await H.chapaWebhook(a, hookBody, new Headers({ "x-chapa-signature": sigOk }));
  const det = await H.chapaTxDetail(admin, a, "W-17");
  check("every callback is kept on its payment, a refused one too", det.webhooks.length === 2 && det.webhooks.some((x) => !x.signed && /bad signature/.test(x.outcome ?? "")) && det.webhooks.some((x) => x.signed && x.event === "charge.success") && !!det.tx.lastWebhookAt, det.webhooks);
  const v1 = await H.saveChapaTxView(admin, { name: "Failed this week", filter: { preset: "week", status: ["failed"] }, shared: true });
  const v2 = await H.saveChapaTxView(admin, { name: "failed this week", filter: { preset: "week", status: ["failed", "pending"] } });
  check("a saved filter is kept by name and can be removed", v1.length === 1 && v1[0].shared && v2.length === 1 && (v2[0].filter.status as string[]).length === 2 && (await H.deleteChapaTxView(admin, v2[0].id)).length === 0, v2);

  // 10. The run log and the Sync page's data.
  const runs = await listRuns("chapa", [a]);
  check("every run is logged with its counts and time", runs.some((x) => x.kind === "full" && x.status === "done" && x.discovered >= 300 && x.requests > 20) && runs.some((x) => x.kind === "incremental") && runs.filter((x) => x.kind === "reconcile").length === 2, runs.map((x) => [x.kind, x.status, x.discovered]));
  const state = await S.chapaSyncState(admin, a);
  check("the sync state shows what is stored and how Chapa is read", state.businesses[0].stored === 303 && state.businesses[0].dateFilter === "yes" && state.businesses[0].rowCap === 20 && state.businesses[0].backfilled && state.runs.length >= 4, state.businesses[0]);
  const probe = (await H.probeChapaBusiness(admin, a)) as { listing: { dateFilterApplied: boolean; pageParameter: string; order: string; readBy: string } };
  check("the API check reports the date filter, paging and order", probe.listing.dateFilterApplied && /ignored/.test(probe.listing.pageParameter) && probe.listing.order === "newest first" && probe.listing.readBy === "date windows", probe.listing);

  // 11. A key sealed with another encryption secret (database restored elsewhere, APP_SECRET changed): it is named
  // as unreadable, no run is started, the schedule does not retry it every minute, and a new key clears it.
  const k = await saveChapaAccount(admin, { name: "Unreadable key", secretKey: "CHASECK-KKK", currency: "ETB" });
  const sealed = (await get<{ s: string }>("SELECT secret_key_enc s FROM chapa_accounts WHERE id = ?", k))!.s.split(":");
  sealed[3] = Buffer.from("not-this-key").toString("base64");
  await run("UPDATE chapa_accounts SET secret_key_enc = ? WHERE id = ?", sealed.join(":"), k);
  const before = (await listRuns("chapa", [k])).length;
  const keyErr = await H.syncChapaBusiness(k, { full: true }).then(() => "", (e: Error) => e.message);
  check("an unreadable key is named as such, not as a missing key", /cannot be read/.test(keyErr) && /enter the secret key again/i.test(keyErr), keyErr);
  calls = [];
  await H.scheduledChapa(NOW + 10 * DAY);
  const kRow = (await get<{ health: string; last_error: string | null }>("SELECT health, last_error FROM chapa_accounts WHERE id = ?", k))!;
  check("no run and no request is made with an unreadable key", (await listRuns("chapa", [k])).length === before && !calls.some((c) => c.includes("KKK")) && kRow.health === "error" && /cannot be read/.test(kRow.last_error ?? ""), { kRow, runs: (await listRuns("chapa", [k])).length });
  await saveChapaAccount(admin, { id: k, name: "Unreadable key", secretKey: "CHASECK-KKK", currency: "ETB", active: false });
  const kAfter = (await get<{ health: string; last_error: string | null }>("SELECT health, last_error FROM chapa_accounts WHERE id = ?", k))!;
  check("entering the key again clears the key error", kAfter.health !== "error" && kAfter.last_error === null, kAfter);

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FAIL crashed", e);
  process.exit(1);
});
