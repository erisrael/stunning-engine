// Update 1.0, Phase 2 (Legacy CMS): date-first loading from a fake Noor with the three table shapes (a date filter,
// date sorting only, neither), retries, the day cache, report files, the three invoice states with their log, and
// scheduled reports.
import { get, all, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { saveLegacyCmsConfig, approveLegacyCmsInvoice, syncLegacyCms } from "../../src/server/legacy-cms";
import { remoteFilters, sortableColumns, dateSortColumn } from "../../src/lib/cms-livewire";
import { fetchCmsRange, fetchCmsAll, daysBetween, addisDay } from "../../src/server/cms-range";
import { adminWorkspaceData } from "../../src/server/admin-workspace";
import { startCmsTask, runCmsTask, cmsTaskStatus, completedRangeTask } from "../../src/server/cms-tasks";
import { reviewInvoices, listInvoiceReviews, invoiceReviewHistory, invoiceVerifiers, extractInvoiceContact } from "../../src/server/cms-invoices";
import { reportCsv, reportXlsx, reportMeta, cleanSpec, saveSchedule, scheduleWindow, runSchedule, unableReport } from "../../src/server/cms-reports";
import { buildCmsReport } from "../../src/lib/cms-report";
import type { CmsRangeResult } from "../../src/server/cms-range";

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

// ---- A fake Noor: 30 invoices a day for 120 days, newest day = "today" (11 Nov 2026, Addis). ----
const NOW = Date.parse("2026-11-11T09:00:00Z");
const pad = (n: number) => String(n).padStart(2, "0");
type Inv = { id: number; t: number; day: string; created: string; amount: number; method: string; status: string; student: string };
const data: Inv[] = [];
for (let d = 0; d < 120; d++)
  for (let i = 0; i < 30; i++) {
    const t = NOW - d * 86400_000 - i * 600_000 - 3600_000; // spread through the day, all before now
    const local = new Date(t + 3 * 3600_000);
    const created = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00`;
    data.push({ id: data.length + 1, t, day: created.slice(0, 10), created, amount: 100 + (i % 5) * 50, method: ["Telebirr", "CBE", "Chapa"][i % 3], status: i % 4 ? "paid" : "pending", student: `Student ${i}` });
  }
// Noor's unsorted order is not by date.
const unsorted = [...data].sort((a, b) => ((a.id * 7919) % 3607) - ((b.id * 7919) % 3607));

type Mode = "filter" | "sort" | "none" | "ignores" | "v4";
const MODES: Record<string, Mode> = { invoices: "filter", "subscription-histories": "sort", feedback: "none", subscriptions: "ignores", parents: "filter", students: "sort", "subscription-plans": "v4" };
// Tables whose Noor ignores page sizes above 50 (it echoes the size but returns 50 rows).
const CAP50 = new Set(["filter-cap"]);
const enc = (s: string) => s.replaceAll('"', "&quot;");
// Filament 4 (Noor today): tableSort "column:direction", tableColumns with "Created at" hidden, sortable by id only.
function seedV4() {
  const snap = JSON.stringify({ memo: { name: "v4" }, data: { tableRecordsPerPage: 10, tableSort: null, tableDeferredFilters: [{ status: [{ value: null }, { s: "arr" }] }, { s: "arr" }], tableColumns: [[[{ type: "column", name: "id", label: "ID", isToggled: true, isToggleable: false }, { s: "arr" }], [{ type: "column", name: "created_at", label: "Created at", isToggled: false, isToggleable: true }, { s: "arr" }]], { s: "arr" }] } });
  return `<meta name="csrf-token" content="test"><div wire:snapshot="${enc(snap)}" data-update-uri="/livewire/update"><button wire:click="sortTable(&#039;id&#039;)">ID</button></div>`;
}
function seed(mode: Mode) {
  if (mode === "v4") return seedV4();
  const filters = mode === "filter" || mode === "ignores" ? [{ created_at: [{ created_from: null, created_until: null }, { s: "arr" }], status: [{ value: null }, { s: "arr" }] }, { s: "arr" }] : [{ status: [{ value: null }, { s: "arr" }] }, { s: "arr" }];
  const snap = JSON.stringify({ memo: { name: mode, cap: mode === "filter" && capNext ? 50 : 0 }, data: { tableRecordsPerPage: 10, tableSortColumn: null, tableSortDirection: null, tableDeferredFilters: filters } });
  const sortBtn = mode === "none" ? "" : `<button wire:click="sortTable(&#039;created_at&#039;)">Created at</button>`;
  return `<meta name="csrf-token" content="test"><div wire:snapshot="${enc(snap)}" data-update-uri="/livewire/update">${sortBtn}<select wire:model="tableDeferredFilters.status.value"><option value="">All</option><option value="paid">Paid</option><option value="pending">Pending</option></select></div>`;
}
let posts = 0;
let capNext = false;
// The next table page answers 302 (Noor sent an expired session to its login page).
let expireOnce = false;
let fail429 = 0;
const original = globalThis.fetch;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = new URL(String(url));
  if (!init?.method) {
    const cat = u.pathname.split("/").pop()!;
    if (cat === "login") return new Response("<html>signed in</html>", { headers: { "Set-Cookie": "session=fixture" } });
    if (expireOnce) {
      expireOnce = false;
      return new Response(null, { status: 302, headers: { Location: "/admin/login" } });
    }
    return new Response(seed(MODES[cat] ?? "none"));
  }
  posts++;
  if (fail429 > 0) {
    fail429--;
    return new Response("Too many", { status: 429 });
  }
  const c = JSON.parse(String(init.body)).components[0];
  const memo = JSON.parse(c.snapshot).memo;
  const mode = memo.name as Mode;
  const up = c.updates as Record<string, string | number | null>;
  const per = Math.min(Number(up.tableRecordsPerPage) || 10, memo.cap || Infinity);
  const page = c.calls.find((x: { method: string }) => x.method === "gotoPage").params[0];
  let rows = up.tableSortColumn === "created_at" || up.tableSort === "id:desc" ? [...data].sort((a, b) => b.t - a.t) : unsorted;
  if (mode === "v4") {
    // Ids grow with time; "Created at" comes back only when the hidden column is switched on.
    const shown = (up["tableColumns.1.isToggled"] as unknown) === true;
    const slice = rows.slice((page - 1) * per, page * per);
    const html = `<table><thead><tr><th>ID</th>${shown ? "<th>Created at</th>" : ""}</tr></thead><tbody>${slice.map((r) => `<tr wire:key="r${r.id}"><td><a href="/admin/subscription-plans/${10000 - r.id}">${10000 - r.id}</a></td>${shown ? `<td>${r.created}</td>` : ""}</tr>`).join("")}</tbody></table>Showing ${slice.length ? (page - 1) * per + 1 : 0} to ${(page - 1) * per + slice.length} of ${rows.length} results`;
    return Response.json({ components: [{ snapshot: JSON.stringify({ data: { tableRecordsPerPage: per } }), effects: { html } }] });
  }
  if (mode === "filter") {
    const from = up["tableDeferredFilters.created_at.created_from"] as string | null;
    const until = up["tableDeferredFilters.created_at.created_until"] as string | null;
    rows = rows.filter((r) => (!from || r.day >= from) && (!until || r.day <= until));
  }
  if (up["tableDeferredFilters.status.value"]) rows = rows.filter((r) => r.status === up["tableDeferredFilters.status.value"]);
  const slice = rows.slice((page - 1) * per, page * per);
  const html = `<table><thead><tr><th>ID</th><th>Student</th><th>Amount</th><th>Payment Method</th><th>Status</th><th>Created at</th></tr></thead><tbody>${slice
    .map((r) => `<tr wire:key="r${r.id}"><td><a href="/admin/invoices/${r.id}">${r.id}</a></td><td>${r.student}</td><td>ETB ${r.amount}</td><td>${r.method}</td><td>${r.status}</td><td>${r.created}</td></tr>`)
    .join("")}</tbody></table>Showing ${slice.length ? (page - 1) * per + 1 : 0} to ${(page - 1) * per + slice.length} of ${rows.length} results`;
  return Response.json({ components: [{ snapshot: JSON.stringify({ data: { tableRecordsPerPage: Number(up.tableRecordsPerPage) || 10 } }), effects: { html } }] });
}) as typeof fetch;

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  await saveLegacyCmsConfig(admin, { baseUrl: "https://cms.fixture.test", username: "fixture", password: "fixture", sessionCookie: "session=test", autoSync: false });

  // Reading the table's controls.
  const filters = remoteFilters(seed("filter"));
  const date = filters.find((f) => f.kind === "date");
  check("a Filament date filter is read from the snapshot", date?.key === "created_at" && date.from === "created_at.created_from" && date.until === "created_at.created_until", filters);
  check("select filters are still read", filters.some((f) => f.kind === "select" && f.key === "status.value"));
  const entangled = remoteFilters(`<div x-data="dateTimePickerFormComponent({state: $wire.$entangle('tableDeferredFilters.paid_at.paid_from')})"></div><div x-data="x({state: $wire.$entangle('tableDeferredFilters.paid_at.paid_until')})"></div>`);
  check("a date picker bound with $entangle is read too", entangled.some((f) => f.kind === "date" && f.key === "paid_at"), entangled);
  check("sortable columns are read from the header buttons", sortableColumns(seed("sort")).includes("created_at") && dateSortColumn(seed("sort")) === "created_at" && dateSortColumn(seed("none")) === null);

  const week = { from: "2026-11-01", until: "2026-11-07" };
  const expected = data.filter((r) => r.day >= week.from && r.day <= week.until).length;

  posts = 0;
  const viaFilter = await fetchCmsRange(admin, { category: "invoices", ...week }, undefined, NOW);
  check(`Noor's date filter: ${expected} rows with Noor's total`, viaFilter.method === "noor-filter" && viaFilter.total === expected, { method: viaFilter.method, total: viaFilter.total });
  check("Noor's date filter with 250-row pages: one request for the week", posts === Math.ceil(expected / 100), { posts });

  posts = 0;
  const viaSort = await fetchCmsRange(admin, { category: "subscription-histories", ...week }, undefined, NOW);
  const totalPages = Math.ceil(data.length / 100);
  check(`sorted range search: exactly the ${expected} rows in range`, viaSort.method === "sorted-search" && viaSort.total === expected && viaSort.records.every((r) => r["Created at"].slice(0, 10) >= week.from && r["Created at"].slice(0, 10) <= week.until), { method: viaSort.method, total: viaSort.total });
  check(`sorted range search reads ${posts} of ${totalPages} pages`, posts < totalPages / 2, { posts, totalPages });

  posts = 0;
  const viaScan = await fetchCmsRange(admin, { category: "feedback", ...week }, undefined, NOW);
  check("no date filter or sorting: every page, filtered exactly", viaScan.method === "full-scan" && viaScan.total === expected && posts === totalPages, { method: viaScan.method, total: viaScan.total, posts });

  const ignored = await fetchCmsRange(admin, { category: "subscriptions", ...week }, undefined, NOW);
  check("a date filter Noor ignores is detected and the sorted search is used", ignored.method === "sorted-search" && ignored.total === expected, { method: ignored.method, total: ignored.total });

  const filtered = await fetchCmsRange(admin, { category: "invoices", ...week, filters: { "status.value": "pending" } }, undefined, NOW);
  check("select filters are sent with the date range", filtered.total === data.filter((r) => r.day >= week.from && r.day <= week.until && r.status === "pending").length, filtered.total);

  // Noor that only honours 50 rows a page: the size steps down and paging stays exact.
  capNext = true;
  const capped = await fetchCmsRange(admin, { category: "parents", ...week }, undefined, NOW);
  capNext = false;
  check("a smaller page size is used when Noor ignores the bigger ones", capped.total === expected && capped.records.length === expected, { total: capped.total, rows: capped.records.length });

  // A recent range on a sort-only table reads newest pages first and stops at the range start.
  posts = 0;
  const recent = await fetchCmsRange(admin, { category: "students", from: "2026-11-09", until: "2026-11-11" }, undefined, NOW);
  check("a range ending today walks the newest pages only", recent.method === "sorted-search" && recent.total === data.filter((r) => r.day >= "2026-11-09").length && posts <= 4, { total: recent.total, posts });

  // A whole table in one parallel job (old live mode without a date, and the synchronized mirror).
  posts = 0;
  const whole = await fetchCmsAll(admin, { category: "feedback" });
  check("a whole table loads in parallel at the big page size", whole.records.length === data.length && whole.complete && posts === Math.ceil(data.length / 100), { rows: whole.records.length, posts });
  const synced = await syncLegacyCms(admin, { category: "feedback", deep: true });
  const stored = await get<{ c: number }>("SELECT COUNT(*) AS c FROM legacy_cms_records WHERE category = 'feedback'");
  check("the synchronized mirror saves every row in batches", synced.ok && Number(stored?.c) === data.length, { synced: synced.message, stored });

  // Admin's My work page (it failed on tables and columns that do not exist).
  const desk = await adminWorkspaceData(admin);
  check("Admin's My work data loads", desk.systemHealth.totalUsersCount > 0 && Array.isArray(desk.pendingUsers), desk.systemHealth);

  // Filament 4: a hidden created date is switched on and the table is walked newest first by id.
  const v4 = await fetchCmsRange(admin, { category: "subscription-plans", from: "2026-11-09", until: "2026-11-11" }, undefined, NOW);
  check("a hidden Created at column is switched on and sorted newest first by id", v4.method === "sorted-search" && v4.dateField === "created_at" && v4.total === data.filter((r) => r.day >= "2026-11-09").length && v4.records.every((r) => r["Created at"]), { method: v4.method, field: v4.dateField, total: v4.total });

  // An expired Noor session: the table answers 302 once, the loader signs in again and carries on.
  const { forgetCmsSessions } = await import("../../src/server/cms-session");
  forgetCmsSessions();
  expireOnce = true;
  const afterExpiry = await err(() => fetchCmsRange(admin, { category: "invoices", from: "2026-11-11", until: "2026-11-11", refresh: true }, undefined, NOW));
  check("an expired Noor session (HTTP 302) signs in again instead of failing", afterExpiry === null && !expireOnce, afterExpiry);

  // Cache: closed days are reused, today is fetched again.
  posts = 0;
  const again = await fetchCmsRange(admin, { category: "invoices", ...week }, undefined, NOW);
  check("closed past days come from the cache with no Noor requests", posts === 0 && again.cachedDays === 7 && again.total === expected, { posts, cachedDays: again.cachedDays });
  posts = 0;
  const withToday = await fetchCmsRange(admin, { category: "invoices", from: "2026-11-05", until: "2026-11-11" }, undefined, NOW);
  check("a range ending today fetches only the days not cached", withToday.cachedDays === 3 && withToday.fetchedDays === 4 && withToday.total === data.filter((r) => r.day >= "2026-11-05").length, { cachedDays: withToday.cachedDays, fetchedDays: withToday.fetchedDays });
  posts = 0;
  const today2 = await fetchCmsRange(admin, { category: "invoices", from: "2026-11-11", until: "2026-11-11" }, undefined, NOW);
  check("today is always fetched again", posts > 0 && today2.cachedDays === 0, { posts });
  posts = 0;
  await fetchCmsRange(admin, { category: "invoices", ...week, refresh: true }, undefined, NOW);
  check("Refresh ignores the cache", posts > 0);

  fail429 = 2;
  const retried = await fetchCmsRange(admin, { category: "invoices", from: "2026-10-01", until: "2026-10-02", refresh: true }, undefined, NOW);
  check("429 answers are retried with backoff", retried.total === 60, retried.total);

  check("ranges are validated", !!(await err(() => fetchCmsRange(admin, { category: "invoices", from: "2026-11-07", until: "2026-11-01" }))) && !!(await err(() => fetchCmsRange(admin, { category: "invoices", from: "2024-01-01", until: "2026-01-01" }))));
  check("Addis days and day lists", addisDay(Date.parse("2026-11-10T21:30:00Z")) === "2026-11-11" && daysBetween("2026-10-30", "2026-11-02").join() === "2026-10-30,2026-10-31,2026-11-01,2026-11-02");

  // As a background job, and exporting exactly what was loaded.
  const id = await startCmsTask(admin, { kind: "range", category: "invoices", ...week });
  await runCmsTask(id);
  const st = await cmsTaskStatus(admin, id);
  check("the range load runs as a background CMS job", st.status === "completed" && (st.result as CmsRangeResult).total === expected, st.status);
  check("only its owner can export the loaded rows", !!(await err(() => completedRangeTask(dawit, id))));
  const { result } = await completedRangeTask(admin, id);
  const spec = cleanSpec({ groupBy: "method", columns: ["ID", "Student", "Amount", "Payment Method", "Created at"] }, result);
  const report = buildCmsReport(result.records, result.headers, spec);
  check("the report groups and totals rows", report.groups.length === 3 && report.totals.count === expected && report.sumColumn === "Amount" && report.totals.sum === result.records.reduce((s, r) => s + Number(r.Amount.replace(/\D/g, "")), 0), { groups: report.groups.length, sum: report.totals.sum });
  const meta = await reportMeta(admin, result, spec);
  const csv = reportCsv(report, meta);
  const lines = csv.replace("﻿", "").split("\r\n");
  check("the CSV starts with what it is: table, range, filters, export time", lines[1] === "Table,Invoices" && lines[2] === "Date range,2026-11-01 to 2026-11-07" && lines.some((l) => l.startsWith("Exported,")) && lines.includes(""), lines.slice(0, 10));
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await reportXlsx(report, meta)) as never);
  const names = wb.worksheets.map((w) => w.name);
  const sheet = wb.worksheets[1];
  const amountCell = sheet.getRow(2).getCell(3).value;
  const dateCell = sheet.getRow(2).getCell(5).value;
  check("Excel has a Summary sheet and one sheet per group", names[0] === "Summary" && names.length === 4, names);
  check("Excel cells are numbers and dates, with a frozen header and a totals row", typeof amountCell === "number" && dateCell instanceof Date && sheet.views[0]?.state === "frozen" && String(sheet.getRow(sheet.rowCount).getCell(1).value).startsWith("Total"), { amountCell, dateCell: String(dateCell) });

  // Invoice states.
  const inv = result.records[0];
  const invId = inv._recordId;
  check("a member cannot verify invoices", !!(await err(() => reviewInvoices(dawit, { ids: [invId], state: "verified" }))));
  check("Unable to verify needs a reason", /why/.test((await err(() => reviewInvoices(admin, { ids: [invId], state: "unable" }))) ?? ""));
  check("the Other reason needs a note", /note/.test((await err(() => reviewInvoices(admin, { ids: [invId], state: "unable", reason: "other" }))) ?? ""));
  const marked = await reviewInvoices(admin, { ids: [invId], state: "unable", reason: "no_slip", invoices: { [invId]: inv } });
  const rec = (await listInvoiceReviews(admin, { state: "unable" }))[0];
  check("an unverifiable invoice keeps its contact details and flags a missing phone", rec?.invoiceId === invId && rec.student === inv.Student && rec.amount > 0 && marked.missingPhone.includes(invId), rec);
  const contact = extractInvoiceContact({ Student: "Abel T", Amount: "ETB 300" }, [{ studentId: "1", studentName: "Abel T", grade: "Grade 9", city: "", gender: "", subscriptionStatus: "", parentName: "Hirut T", parentPhone: "0911000000", planName: "Gold", hasDirectLink: true, hasPhone: true }]);
  check("contact extraction joins invoice → student → parent", contact.contactName === "Hirut T" && contact.phone === "0911000000" && contact.grade === "Grade 9" && contact.plan === "Gold" && contact.amount === 300, contact);
  await reviewInvoices(admin, { ids: [invId], state: "verified", note: "Slip found" });
  const log = await invoiceReviewHistory(admin, invId);
  check("every change is logged with from and to state", log.length === 2 && log[0].fromState === "unable" && log[0].toState === "verified" && log[1].reason === "no_slip", log);
  check("invoices can be filtered by verifier", (await invoiceVerifiers(admin)).some((v) => v.id === admin.id) && (await listInvoiceReviews(admin, { verifier: admin.id })).length === 1);
  const bulk = await reviewInvoices(admin, { ids: result.records.slice(1, 6).map((r) => r._recordId), state: "unable", reason: "amount_mismatch" });
  check("bulk updates mark several invoices at once", bulk.updated === 5 && (await listInvoiceReviews(admin, { state: "unable" })).length === 5);
  const unable = await unableReport(admin);
  check("the Unable-to-verify list exports with its contacts", unable.report.totals.count === 5 && unable.report.columns.includes("Phone") && unable.missingPhone === 5);
  await get("SELECT 1"); // keep the connection warm for the mirrored-record check
  await (await import("../../src/server/db")).run("INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES ('rec1','invoices','9001','Invoice 9001','{\"Student\":\"X\"}',?)", new Date().toISOString());
  await approveLegacyCmsInvoice(admin, "9001");
  const mirrored = await get<{ data_json: string }>("SELECT data_json FROM legacy_cms_records WHERE id = 'rec1'");
  const review = await get<{ state: string }>("SELECT state FROM cms_invoice_reviews WHERE invoice_id = '9001'");
  check("the receipt viewer's Approve writes a review, not the mirrored record", review?.state === "verified" && !mirrored!.data_json.includes("local_verification"));

  // Scheduled reports.
  check("a schedule needs recipients", /receives/.test((await err(() => saveSchedule(admin, { category: "invoices", name: "Daily" }))) ?? ""));
  const saved = await saveSchedule(admin, { category: "invoices", name: "Daily invoices", cadence: "daily", hour: 7, window: "yesterday", groupBy: "method", emails: ["finance@example.test"], roles: ["owner"] });
  check("Finance can schedule a daily report", saved.length === 1 && saved[0].createdBy === admin.id);
  const w = scheduleWindow("last7", NOW);
  check("report windows end yesterday", w.from === "2026-11-04" && w.until === "2026-11-10" && scheduleWindow("yesterday", NOW).from === "2026-11-10", w);
  const ran = await runSchedule(saved[0], NOW);
  const runs = await all<{ id: string }>("SELECT id FROM cms_report_runs");
  check("a scheduled run stores its rows for the emailed links", runs.length === 1 && ran.rows === 30 && ran.recipients >= 1, ran);
  check("a member cannot schedule reports", !!(await err(() => saveSchedule(dawit, { category: "invoices", emails: ["x@example.test"] }))));

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
