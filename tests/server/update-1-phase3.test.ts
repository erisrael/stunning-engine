// Update 1.0, Phase 3: Chapa for every business, against a fake Chapa API: paged sync and incremental sync,
// totals, filters, the daily board, customers, re-checking pending, the signed webhook, payment follow-up cases
// (no duplicates, closed when the customer pays), Admin's action rules with maker–checker money actions, the
// API probe, exports, matching to Noor invoices, and CMS invoices handed to Support or Finance.
process.env.CHAPA_API_BASE = "https://chapa.fake";
import crypto from "node:crypto";
import { get, all, run, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { saveChapaAccount } from "../../src/server/chapa";
import * as H from "../../src/server/chapa-hub";
import { reviewInvoices, sendInvoicesToSupport, setInvoiceOutcome, handleInvoicesInFinance, invoiceFollowups } from "../../src/server/cms-invoices";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

const NOW = Date.now();
const day = (t: number) => new Date(t + 3 * 3600e3).toISOString().slice(0, 10);
const TODAY = day(NOW);
// Business A: 90 transactions over three days, newest first, Laravel-style pages of 40.
type T = { tx_ref: string; ref_id: string; amount: string; charge: string; currency: string; payment_method: string; type: string; status: string; first_name: string; last_name: string; email: string; mobile: string; created_at: string };
const txA: T[] = [];
for (let i = 0; i < 90; i++) {
  const t = NOW - i * 45 * 60e3 - 60e3;
  txA.push({ tx_ref: `A-${i}`, ref_id: `APX${i}`, amount: String(100 + (i % 3) * 50), charge: "3.5", currency: "ETB", payment_method: ["telebirr", "cbebirr", "mpesa"][i % 3], type: i % 10 === 0 ? "Payment Link" : "API", status: i % 7 === 0 ? "failed/cancelled" : i % 11 === 0 ? "pending" : "success", first_name: `Cust${i % 20}`, last_name: "T", email: `c${i % 20}@x.test`, mobile: `0911${String(100000 + (i % 20)).slice(-6)}`, created_at: new Date(t).toISOString() });
}
// Business B ignores the page number (same list every time).
const txB: T[] = txA.slice(0, 5).map((t) => ({ ...t, tx_ref: t.tx_ref.replace("A-", "B-") }));
const verified: Record<string, string> = {};
let calls: string[] = [];
const original = globalThis.fetch;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = new URL(String(url));
  const key = String((init?.headers as Record<string, string>)?.Authorization ?? "");
  const isB = key.includes("BBB");
  calls.push(`${init?.method ?? "GET"} ${u.pathname}${u.search}`);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
  if (u.pathname === "/v1/transactions") {
    const list = isB ? txB : txA;
    if (isB) return json({ status: "success", data: { transactions: list } });
    const page = Number(u.searchParams.get("page") || 1);
    const per = 40;
    const rows = list.slice((page - 1) * per, page * per);
    const last = Math.ceil(list.length / per);
    return json({ status: "success", data: { transactions: rows, pagination: { current_page: page, next_page_url: page < last ? `https://chapa.fake/v1/transactions?page=${page + 1}&per_page=40` : null } } });
  }
  const m = u.pathname.match(/^\/v1\/transaction\/verify\/(.+)$/);
  if (m) {
    const ref = decodeURIComponent(m[1]);
    const t = [...txA, ...txB].find((x) => x.tx_ref === ref);
    return json({ status: "success", data: { ...(t ?? {}), tx_ref: ref, status: verified[ref] ?? t?.status ?? "pending" } });
  }
  if (u.pathname.startsWith("/v1/transaction/events/")) return json({ data: [{ message: "Payment initiated" }, { message: "Payment completed" }] });
  if (u.pathname === "/v1/balances") return json({ data: [{ currency: "ETB", available_balance: 12345.5, ledger_balance: 13000 }, { currency: "USD", available_balance: 40, ledger_balance: 40 }] });
  if (u.pathname === "/v1/banks") return json({ data: [{ id: 946, name: "CBE" }, { id: 855, name: "telebirr" }] });
  if (u.pathname === "/v1/transfers") return init?.method === "POST" ? json({ status: "success", data: "queued" }) : json({ data: [{ account_name: "X", amount: 10, currency: "ETB", status: "success", reference: "R1" }] });
  if (u.pathname.startsWith("/v1/refund/")) return json({ status: "success", message: "Refund processed" });
  return json({ message: "not found" }, 404);
}) as typeof fetch;

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  // Hana works in Finance (the second approver).
  await run("INSERT INTO role_assignments (user_id, role) VALUES (?, 'finance_manager') ON CONFLICT DO NOTHING", (await by("hana@demo.local")).id);
  const hana = await by("hana@demo.local");

  const A = await saveChapaAccount(admin, { name: "Subscriptions", secretKey: "CHASECK-AAA", webhookSecret: "whsec-A", currency: "ETB" });
  const B = await saveChapaAccount(admin, { name: "Donations", secretKey: "CHASECK-BBB", currency: "ETB" });
  const T = await saveChapaAccount(admin, { name: "Sandbox", secretKey: "CHASECK_TEST-ZZZ", currency: "ETB" });
  const biz = await H.chapaBusinesses(admin);
  check("test keys make a test business", biz.find((b) => b.id === T)?.mode === "test" && biz.find((b) => b.id === A)?.mode === "live");
  check("people outside Finance do not see Chapa", (await H.chapaBusinesses(dawit)).length === 0);
  check("Finance sees every business but cannot move money by default", (await H.chapaBusinesses(hana)).every((b) => b.rights.view && b.rights.verify && !b.rights.refund && !b.rights.transfer));

  // Sync.
  calls = [];
  const s1 = await H.syncChapaBusiness(A);
  const stored = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM chapa_transactions WHERE account_id = ?", A))?.c);
  check("the first sync reads all history across pages", s1.rows === 90 && stored === 90 && calls.filter((c) => c.includes("/v1/transactions")).length === 3, { s1, stored });
  calls = [];
  await H.syncChapaBusiness(A);
  check("later syncs stop at the last sync", calls.filter((c) => c.includes("/v1/transactions")).length === 1, calls);
  const sb = await H.syncChapaBusiness(B);
  check("a list that ignores the page number is read once", sb.rows === 5 && sb.complete);

  // Reading.
  const all1 = await H.listChapaTx(admin, { biz: A, limit: 1000 });
  check("transactions list with statuses normalized", all1.rows.length === 90 && all1.rows.some((r) => r.status === "failed") && all1.rows.some((r) => r.status === "pending"));
  const byPhone = await H.listChapaTx(admin, { biz: A, q: "911100003" });
  check("search by phone", byPhone.rows.length > 0 && byPhone.rows.every((r) => r.phone?.includes("100003")), byPhone.rows.length);
  const filtered = await H.listChapaTx(admin, { biz: A, status: ["success"], method: ["telebirr"], type: ["payment_link"] });
  check("filters by status, method and type", filtered.rows.length > 0 && filtered.rows.every((r) => r.status === "success" && r.method === "telebirr" && r.type === "payment_link"), filtered.rows.length);
  const allBiz = await H.listChapaTx(admin, { limit: 1000 });
  check("All businesses includes every live business and leaves test out", new Set(allBiz.rows.map((r) => r.accountId)).size === 2 && !allBiz.businesses.some((b) => b.id === T));
  const ov = await H.chapaOverview(admin, A, NOW);
  const etb = ov.currencies.find((c) => c.currency === "ETB")!;
  const todaySuccess = txA.filter((t) => day(Date.parse(t.created_at)) === TODAY && t.status === "success").reduce((a, t) => a + Number(t.amount), 0);
  check("overview: today's paid volume and success rate", etb.windows.today.volume === todaySuccess && etb.windows.d30.rate !== null && etb.daily.length === 30, { got: etb.windows.today.volume, todaySuccess });
  const board = await H.chapaDailyBoard(admin, TODAY, A);
  check("daily board: success, failed and pending with the day before", board.tabs.length === 3 && board.tabs.reduce((a, t) => a + t.n, 0) === txA.filter((t) => day(Date.parse(t.created_at)) === TODAY).length);
  const customers = await H.chapaCustomers(admin, { biz: A });
  check("customers are grouped by phone", customers.length === 20 && customers.every((c) => c.paidCount + c.failed > 0), customers.length);

  // Re-check pending.
  const stuck = txA.find((t) => t.status === "pending" && Date.parse(t.created_at) < NOW - 40 * 60e3)!;
  verified[stuck.tx_ref] = "success";
  const re = await H.recheckPending(NOW);
  const after = await get<{ status: string; status_history: string }>("SELECT status, status_history FROM chapa_transactions WHERE account_id = ? AND tx_ref = ?", A, stuck.tx_ref);
  check("stuck pending payments are re-checked with Chapa and their history kept", re.changed >= 1 && after?.status === "success" && JSON.parse(after.status_history).length === 2, { re, after });

  // Follow-up.
  const fu = await H.chapaFollowups(admin, TODAY, A, NOW);
  check("the follow-up list has failed and stuck pending payments, one row per customer", fu.length > 0 && new Set(fu.map((g) => g.key)).size === fu.length && fu.every((g) => g.reasons.length), fu.length);
  check("a member cannot send follow-ups", !!(await err(() => H.sendFollowups(dawit, TODAY, "all", A))));
  const sent = await H.sendFollowups(hana, TODAY, [fu[0].key], A);
  const tk = await get<{ id: string; source: string; queue: string; status: string }>("SELECT t.id, t.source, q.name AS queue, t.status FROM sup_tickets t JOIN sup_queues q ON q.id = t.queue_id WHERE t.source = 'chapa' ORDER BY t.created_at DESC LIMIT 1");
  check("a follow-up becomes a case in the Payment follow-up queue", sent.created === 1 && tk?.queue === "Payment follow-up" && tk.source === "chapa", { sent, tk });
  const again = await H.sendFollowups(hana, TODAY, [fu[0].key], A);
  check("sending the same customer again does not open a second case", again.created === 0);
  // The customer pays: the webhook (checked with Chapa) closes the case.
  const g = fu[0];
  const payRef = "A-paid-later";
  txA.unshift({ ...txA.find((t) => t.tx_ref === g.txRefs[0])!, tx_ref: payRef, status: "success", created_at: new Date(NOW).toISOString() });
  const body = JSON.stringify({ event: "charge.success", tx_ref: payRef, status: "success" });
  const bad = await H.chapaWebhook(A, body, new Headers({ "x-chapa-signature": "nope" }));
  check("a webhook with a bad signature is refused", bad.status === 401);
  const sig = crypto.createHmac("sha256", "whsec-A").update(body).digest("hex");
  const ok = await H.chapaWebhook(A, body, new Headers({ "x-chapa-signature": sig }));
  const closed = await get<{ status: string }>("SELECT status FROM sup_tickets WHERE id = ?", tk!.id);
  check("a signed webhook records the payment and the open case closes by itself", ok.status === 200 && closed?.status === "solved", { ok, closed });

  // Detail with events and the CMS link.
  const det = await H.chapaTxDetail(admin, A, txA[3].tx_ref);
  check("transaction detail has history, Chapa events and raw payload", det.history.length >= 1 && det.events.length === 2 && !!det.raw);

  // Money actions: off until Admin turns them on; maker–checker.
  const paid = (await H.listChapaTx(admin, { biz: A, status: ["success"] })).rows[0];
  check("refunds are off by default", /off for your role/.test((await err(() => H.requestChapaOp(hana, { kind: "refund", accountId: A, amount: 10, reason: "Wrong", detail: { tx_ref: paid.txRef } }))) ?? ""));
  const s = await H.chapaSettings();
  s.access["*"].refund = { enabled: true, roles: ["admin", "finance_manager"], limit: 1000, secondApprover: true };
  s.access["*"].transfer = { enabled: true, roles: ["admin", "finance_manager"], limit: 5000, dailyCap: 6000, secondApprover: false };
  check("only Admin changes the rules", !!(await err(() => H.saveChapaSettings(hana, s))));
  await H.saveChapaSettings(admin, s);
  const opId = await H.requestChapaOp(hana, { kind: "refund", accountId: A, amount: paid.amount, reason: "Charged twice", detail: { tx_ref: paid.txRef } });
  check("a refund waits for a second approver", (await get<{ status: string }>("SELECT status FROM chapa_operations WHERE id = ?", opId))?.status === "awaiting_approval");
  check("the requester cannot approve their own refund", /Someone else/.test((await err(() => H.decideChapaOp(hana, opId, true))) ?? ""));
  await H.decideChapaOp(admin, opId, true);
  const op = await get<{ status: string; approved_by: string }>("SELECT status, approved_by FROM chapa_operations WHERE id = ?", opId);
  const refunded = await get<{ status: string }>("SELECT status FROM chapa_transactions WHERE account_id = ? AND tx_ref = ?", A, paid.txRef);
  check("an approved refund is sent to Chapa and the payment shows Refunded", op?.status === "sent" && op.approved_by === admin.id && refunded?.status === "refunded" && calls.some((c) => c.startsWith("POST /v1/refund/")), { op, refunded });
  check("a refund above the limit is refused", /limit/.test((await err(() => H.requestChapaOp(hana, { kind: "refund", accountId: A, amount: 5000, reason: "x", detail: { tx_ref: paid.txRef } }))) ?? ""));
  await H.requestChapaOp(hana, { kind: "transfer", accountId: A, amount: 4000, detail: { account_name: "Abebe", account_number: "1000123", bank_code: "946" } });
  check("withdrawals respect the daily cap", /cap/.test((await err(() => H.requestChapaOp(hana, { kind: "transfer", accountId: A, amount: 3000, detail: { account_name: "Abebe", account_number: "1000123", bank_code: "946" } }))) ?? ""));
  const bal = await H.chapaBalances(admin, A);
  check("balances per currency", bal.some((b) => b.currency === "ETB" && b.available === 12345.5) && bal.some((b) => b.currency === "USD"));

  // Probe and exports.
  const probe = await H.probeChapaBusiness(admin, A);
  check("the API probe records shapes, paging, statuses and types", (probe.transactions as { paging: string; statuses: string[] }).paging === "next_page_url" && (probe.transactions as { statuses: string[] }).statuses.includes("failed"));
  const rep = await H.chapaReport(admin, { biz: A, status: ["failed"] });
  check("exports carry the filtered rows", rep.report.totals.count === txA.filter((t) => /fail/.test(t.status)).length && rep.report.columns.includes("Chapa reference"));

  // Match to Noor.
  await run("INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES ('inv1','invoices','777','Invoice 777',?,?)", JSON.stringify({ _recordId: "777", Student: "Cust1", Amount: "ETB 150", Reference: txA[2].tx_ref, "Created at": txA[2].created_at.replace("T", " ").slice(0, 19) }), new Date().toISOString());
  const mt = await H.matchChapaToNoor(admin, { from: day(NOW - 3 * 86400e3), until: TODAY, biz: A });
  check("Chapa payments match Noor invoices by reference", mt.matched.some((m) => m.invoiceId === "777" && m.how === "reference") && mt.unmatchedChapa.length > 0, { matched: mt.matched.length });

  // CMS invoices handed over (c16).
  await reviewInvoices(admin, { ids: ["901", "902"], state: "unable", reason: "no_slip", invoices: { "901": { Student: "Sara", Phone: "0911223344", Amount: "300" }, "902": { Student: "Lulu", Amount: "200" } } });
  const toSupport = await sendInvoicesToSupport(admin, ["901"]);
  const f1 = (await invoiceFollowups(admin, ["901"]))["901"];
  check("Finance sends an unverifiable invoice to Support", toSupport.created === 1 && !!f1.ticketId && f1.ticketNumber !== null);
  await handleInvoicesInFinance(admin, ["902"], hana.id);
  check("or keeps it in Finance with a member", (await invoiceFollowups(admin, ["902"]))["902"].financeAssignee === hana.name);
  await setInvoiceOutcome(admin, "901", "paid");
  const f2 = (await invoiceFollowups(admin, ["901"]))["901"];
  check("the outcome shows on the invoice and Paid closes the case", f2.outcome === "paid" && f2.ticketStatus === "solved", f2);

  // The schedule.
  await run("UPDATE chapa_accounts SET last_sync_at = ? WHERE id = ?", new Date(NOW - 60 * 60e3).toISOString(), A);
  calls = [];
  await H.scheduledChapa(NOW);
  check("the schedule syncs businesses whose interval has passed", calls.some((c) => c.includes("/v1/transactions")));
  void all;

  console.log(`\n${pass} passed, ${fail} failed`);
  globalThis.fetch = original;
  await closeDb();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  globalThis.fetch = original;
  await closeDb();
  process.exit(1);
});
