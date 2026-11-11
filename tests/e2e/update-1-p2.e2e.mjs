// Update 1.0 Phase 2 in the browser, against a fake Noor (Filament table with a created-date filter):
// Live loads by date with Noor's total, invoices get verified or marked Unable to verify with a reason,
// the report builder previews and exports Excel, CSV and the A4 PDF page, and the older views still open.
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-p2");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};

// ---- Fake Noor: 30 invoices a day for 60 days before now. ----
const pad = (n) => String(n).padStart(2, "0");
const now = Date.now();
const data = [];
for (let d = 0; d < 60; d++)
  for (let i = 0; i < 30; i++) {
    const t = now - d * 86400e3 - i * 60e3 - 60e3;
    const l = new Date(t + 3 * 3600e3);
    const created = `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())} ${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}:00`;
    data.push({ id: 5000 + data.length, t, day: created.slice(0, 10), created, amount: 100 + (i % 5) * 50, method: ["Telebirr", "CBE", "Chapa"][i % 3], status: i % 4 ? "paid" : "pending", student: `Student ${i}` });
  }
const yesterday = new Date(now + 3 * 3600e3 - 86400e3).toISOString().slice(0, 10);
const enc = (s) => s.replaceAll('"', "&quot;");
const snap = JSON.stringify({ memo: { name: "invoices" }, data: { tableRecordsPerPage: 10, tableSortColumn: null, tableSortDirection: null, tableDeferredFilters: [{ created_at: [{ created_from: null, created_until: null }, { s: "arr" }], status: [{ value: null }, { s: "arr" }] }, { s: "arr" }] } });
const seed = `<html><head><meta name="csrf-token" content="t"></head><body><div wire:snapshot="${enc(snap)}" data-update-uri="/livewire/update"><button wire:click="sortTable(&#039;created_at&#039;)">Created</button><select wire:model="tableDeferredFilters.status.value"><option value="">All</option><option value="paid">Paid</option><option value="pending">Pending</option></select></div></body></html>`;
let posts = 0;
const noor = http.createServer((req, res) => {
  if (req.method === "GET") return res.writeHead(200, { "Content-Type": "text/html" }).end(seed);
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    posts++;
    const c = JSON.parse(body).components[0];
    const up = c.updates;
    const per = Number(up.tableRecordsPerPage) || 10;
    const page = c.calls.find((x) => x.method === "gotoPage").params[0];
    const from = up["tableDeferredFilters.created_at.created_from"];
    const until = up["tableDeferredFilters.created_at.created_until"];
    let rows = [...data].sort((a, b) => b.t - a.t).filter((r) => (!from || r.day >= from) && (!until || r.day <= until));
    if (up["tableDeferredFilters.status.value"]) rows = rows.filter((r) => r.status === up["tableDeferredFilters.status.value"]);
    const slice = rows.slice((page - 1) * per, page * per);
    const html = `<table><thead><tr><th>ID</th><th>Student</th><th>Amount</th><th>Payment Method</th><th>Status</th><th>Created at</th></tr></thead><tbody>${slice.map((r) => `<tr wire:key="r${r.id}"><td><a href="/admin/invoices/${r.id}">${r.id}</a></td><td>${r.student}</td><td>ETB ${r.amount}</td><td>${r.method}</td><td>${r.status}</td><td>${r.created}</td></tr>`).join("")}</tbody></table>Showing ${slice.length ? (page - 1) * per + 1 : 0} to ${(page - 1) * per + slice.length} of ${rows.length} results`;
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ components: [{ snapshot: JSON.stringify({ data: { tableRecordsPerPage: per } }), effects: { html } }] }));
  });
});
await new Promise((r) => noor.listen(47391, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const login = async (email) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  return page;
};

try {
  const admin = await login("admin@demo.local");
  await admin.goto(`${base}/legacy-cms`);
  const nav = admin.getByRole("navigation", { name: "Legacy CMS views" });
  check("the page kit tab bar lists the views", (await nav.getByRole("link").allInnerTexts()).join("|").includes("Live") && (await nav.getByRole("link", { name: /Invoices/ }).count()) === 1 && (await nav.getByRole("link", { name: /Reports/ }).count()) === 1);
  check("Live waits for a date before loading", await admin.getByText("Pick a date range to load").isVisible());
  posts = 0;
  await admin.getByRole("radiogroup", { name: "Quick range" }).getByRole("radio", { name: "Yesterday" }).click();
  const total = admin.getByTestId("live-total");
  await total.waitFor({ timeout: 30000 });
  check("Yesterday loads 30 invoices with Noor's total", (await total.innerText()).startsWith("30 "), await total.innerText());
  check("loaded through Noor's date filter in one request", (await admin.getByText("Noor date filter").count()) > 0 && posts === 1, { posts });
  await admin.screenshot({ path: path.join(shots, "live.png") });

  // Live updates: Today refreshes on its own and a new invoice appears highlighted.
  await admin.getByRole("radiogroup", { name: "Date range" }).getByRole("radio", { name: "Today" }).click();
  await admin.getByRole("switch", { name: "Live updates" }).waitFor({ timeout: 20000 });
  await admin.getByRole("combobox", { name: "Update every" }).selectOption("10");
  const todayDay = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  await admin.getByRole("status").filter({ hasText: todayDay }).filter({ hasText: "invoices" }).waitFor({ timeout: 20000 });
  const before = await admin.getByTestId("live-total").innerText();
  const l = new Date(Date.now() + 3 * 3600e3);
  data.push({ id: 99999, t: Date.now(), day: l.toISOString().slice(0, 10), created: l.toISOString().slice(0, 19).replace("T", " "), amount: 999, method: "Chapa", status: "paid", student: "Live Student" });
  await admin.getByTestId("live-new").waitFor({ timeout: 30000 });
  check("Live mode picks up a new invoice by itself", (await admin.getByTestId("live-new").innerText()) === "+1 new" && (await admin.getByText("Live Student").count()) === 1, { before, after: await admin.getByTestId("live-total").innerText() });
  await admin.screenshot({ path: path.join(shots, "live-update.png") });
  await admin.getByRole("radiogroup", { name: "Date range" }).getByRole("radio", { name: "Yesterday" }).click();
  await admin.getByTestId("live-total").filter({ hasText: /^30 / }).waitFor({ timeout: 20000 });

  // Verify two invoices as Unable to verify.
  const boxes = admin.getByRole("checkbox", { name: /^Select row / });
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  const bar = admin.getByRole("region", { name: "Verify selected invoices" });
  await bar.getByRole("button", { name: "Unable to verify…" }).click();
  const dialog = admin.getByRole("dialog");
  const mark = dialog.getByRole("button", { name: "Mark Unable to verify" });
  check("Unable to verify needs a reason first", await mark.isDisabled());
  await dialog.getByLabel("No payment slip").check();
  await mark.click();
  await admin.getByText(/2 invoices marked Unable to verify/).waitFor();
  await admin.getByText("Unable to verify · No payment slip").first().waitFor();
  check("the rows show their new state", (await admin.getByText("Unable to verify · No payment slip").count()) === 2);

  // Exports of the live load.
  const excel = await admin.getByRole("link", { name: "Excel" }).getAttribute("href");
  const xr = await admin.request.get(`${base}${excel}`);
  check("Excel export is a real workbook", xr.ok() && xr.headers()["content-type"].includes("spreadsheetml") && (await xr.body()).subarray(0, 2).toString() === "PK");
  const csvHref = await admin.getByRole("link", { name: "CSV" }).getAttribute("href");
  const csv = await (await admin.request.get(`${base}${csvHref}`)).text();
  check("CSV starts with the table, range and filters", /Table,Invoices/.test(csv) && csv.includes(`Date range,${yesterday} to ${yesterday}`) && /\r\nFilters,/.test(csv), csv.slice(0, 200));

  // Report builder from this load.
  await admin.getByRole("link", { name: "Build a report" }).click();
  await admin.waitForURL(/view=reports/);
  await admin.getByText(/30 rows · total Amount/).waitFor({ timeout: 15000 });
  await admin.getByRole("radiogroup", { name: "Group by" }).getByRole("radio", { name: "Payment method" }).click();
  const summary = admin.getByRole("table", { name: "Report summary" });
  check("the preview groups by payment method", (await summary.locator("tbody tr").count()) === 4, await summary.innerText());
  await admin.screenshot({ path: path.join(shots, "reports.png"), fullPage: true });
  const pdfHref = await admin.getByRole("link", { name: "PDF" }).getAttribute("href");
  const pdf = await (await browser.contexts()[0].newPage());
  await pdf.goto(`${base}${pdfHref}`);
  await pdf.getByRole("heading", { level: 1 }).waitFor();
  check("the PDF page has the cover, KPIs, chart and group tables", (await pdf.getByRole("heading", { level: 1 }).innerText()).includes("Invoices report") && (await pdf.getByRole("img", { name: "Bar chart" }).count()) === 1 && (await pdf.getByRole("heading", { level: 2, name: "Telebirr" }).count()) === 1);
  await pdf.screenshot({ path: path.join(shots, "pdf.png"), fullPage: true });
  await pdf.close();

  // Invoices: the Unable to verify list with contacts.
  await admin.goto(`${base}/legacy-cms?view=invoices`);
  await admin.getByRole("radio", { name: "Unable to verify" }).click();
  await admin.getByText("No payment slip").first().waitFor();
  check("the Unable to verify list has both invoices", (await admin.getByRole("checkbox", { name: /^Select row / }).count()) === 2);
  check("missing phones are flagged", (await admin.getByText(/have no phone number/).count()) === 1);
  const listCsv = await (await admin.request.get(`${base}${await admin.getByRole("link", { name: "CSV" }).getAttribute("href")}`)).text();
  check("the contact list exports", /Invoices unable to verify/.test(listCsv) && /No phone/.test(listCsv));
  await admin.screenshot({ path: path.join(shots, "invoices.png") });
  await admin.getByRole("radio", { name: "Verification log" }).click();
  await admin.getByRole("combobox", { name: "Verifier" }).locator("option", { hasText: "Admin" }).waitFor({ state: "attached" });
  await admin.getByRole("combobox", { name: "Verifier" }).selectOption({ label: "Admin" });
  await admin.getByText("Marked by").first().waitFor();
  check("the verification log can be filtered by verifier", (await admin.getByRole("combobox", { name: "Verifier" }).locator("option").allInnerTexts()).some((t) => /Admin/i.test(t)));

  // Tables & sync now lives in Live: tabs per table, and the saved copy.
  await admin.goto(`${base}/legacy-cms?view=tables`);
  await admin.getByRole("tablist", { name: "Noor tables" }).waitFor();
  check("old Tables & sync links open Live, with a tab per table", (await admin.getByRole("tablist", { name: "Noor tables" }).getByRole("tab").count()) >= 5);
  await admin.getByRole("radiogroup", { name: "Source" }).getByRole("radio", { name: "Saved copy" }).click();
  await admin.getByRole("button", { name: "Sync this table from Noor" }).waitFor();
  check("the saved copy can be synced from Live", true);

  // Revenue: live from Noor with its own pending approvals tab and slips.
  await admin.goto(`${base}/legacy-cms?view=revenue`);
  await admin.getByText("Paid revenue").waitFor({ timeout: 30000 });
  check("Revenue loads live with a Pending approvals tab", (await admin.getByRole("radiogroup", { name: "Revenue views" }).getByRole("radio", { name: /Pending approvals/ }).count()) === 1);
  await admin.screenshot({ path: path.join(shots, "revenue.png"), fullPage: true });
  await admin.getByRole("radiogroup", { name: "Revenue views" }).getByRole("radio", { name: /Pending approvals/ }).click();
  check("pending invoices have a slip button", (await admin.getByRole("button", { name: /Payment slip of invoice/ }).count()) > 0);

  // Reports open on the trend dashboard.
  await admin.goto(`${base}/legacy-cms?view=reports`);
  await admin.getByRole("radiogroup", { name: "Reports views" }).waitFor();
  check("Reports open on the Dashboard", (await admin.getByRole("radiogroup", { name: "Reports views" }).getByRole("radio", { name: "Dashboard", checked: true }).count()) === 1);

  check("no browser errors", admin.errors.length === 0, admin.errors.slice(0, 5));
} catch (e) {
  console.error(e);
  check("Update 1.0 Phase 2 flow completed", false);
} finally {
  await browser.close();
  noor.close();
}
process.exitCode = fails ? 1 : 0;
