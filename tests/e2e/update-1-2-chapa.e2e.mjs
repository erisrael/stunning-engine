// Update 1.2 Phases 1 and 2 in the browser, against a fake Chapa that applies date ranges and cuts every answer at
// 20 rows with no pages: the full sync still stores every payment and shows its progress, reconciliation reports
// and repairs, and the Transactions screen pages, sorts, filters and totals on the server with all 13 date ranges,
// saved filters and chosen columns. Checked at desktop and phone width.
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-2-chapa");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};

const now = Date.now();
const HOUR = 3600e3;
// 160 payments: one every 90 minutes for ten days, newest first.
const tx = Array.from({ length: 160 }, (_, i) => ({
  tx_ref: `ORD-${1000 + i}`, ref_id: `APch${i}`, amount: String(150 + (i % 5) * 75), charge: "4.5", currency: "ETB", payment_method: ["telebirr", "cbebirr", "mpesa"][i % 3], type: i % 8 === 0 ? "Payment Link" : "API",
  status: i % 7 === 0 ? "failed/cancelled" : i % 10 === 0 ? "pending" : "success", first_name: ["Hana", "Dawit", "Meron", "Samuel", "Liya"][i % 5], last_name: ["Tesfaye", "Bekele", "Alemu"][i % 3], email: `customer${i % 12}@example.et`, mobile: `0911${String(200000 + (i % 12)).slice(-6)}`,
  created_at: new Date(now - 10 * 60e3 - i * 1.5 * HOUR).toISOString(), updated_at: new Date(now - 5 * 60e3 - i * 1.5 * HOUR).toISOString(),
}));
let requests = 0;
const chapa = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (b, s = 200) => res.writeHead(s, { "Content-Type": "application/json" }).end(JSON.stringify(b));
  if (u.pathname === "/v1/transactions") {
    requests++;
    const from = Date.parse(`${u.searchParams.get("from_date") ?? "1970-01-01T00:00:00"}Z`);
    const to = Date.parse(`${u.searchParams.get("to_date") ?? "2999-01-01T00:00:00"}Z`);
    return send({ status: "success", data: { transactions: tx.filter((t) => Date.parse(t.created_at) >= from && Date.parse(t.created_at) <= to).slice(0, 20) } });
  }
  if (u.pathname.startsWith("/v1/transaction/verify/")) {
    const ref = decodeURIComponent(u.pathname.split("/").pop());
    return send({ data: { ...(tx.find((t) => t.tx_ref === ref) ?? {}), tx_ref: ref } });
  }
  if (u.pathname.startsWith("/v1/transaction/events/")) return send({ data: [{ message: "Payment initiated" }] });
  if (u.pathname === "/v1/balances") return send({ data: [{ currency: "ETB", available_balance: 5000, ledger_balance: 5200 }] });
  send({ message: "not found" }, 404);
});
await new Promise((r) => chapa.listen(47392, "127.0.0.1", r));

const day = (t) => new Date(t + 3 * HOUR).toISOString().slice(0, 10);
const since = (days) => tx.filter((t) => day(Date.parse(t.created_at)) >= day(now - (days - 1) * 86400e3));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));

  // Sync and reconcile.
  await page.goto(`${base}/finance/chapa?tab=sync`);
  await page.getByText("The whole history has not been read yet").waitFor({ timeout: 20000 });
  check("a business not read yet says so", (await page.getByText("History not complete").count()) === 1);
  await page.screenshot({ path: path.join(shots, "sync-before.png"), fullPage: true });
  await page.getByRole("button", { name: "Full sync" }).click();
  await page.getByRole("button", { name: "Start the full sync" }).click();
  await page.getByText(/Subscriptions: 1\d\d read, 160 new/).waitFor({ timeout: 120000 });
  await page.getByText("Complete", { exact: true }).waitFor({ timeout: 20000 });
  const stored = await page.locator("[data-sync-business] dd").first().innerText();
  check("the full sync stored all 160 payments although each answer held 20", stored === "160", { stored, requests });
  check("the screen shows how Chapa is read", (await page.getByText("By date range, 20 rows an answer").count()) === 1);
  check("the run is in the log with its counts", (await page.locator("tbody tr").filter({ hasText: "Full sync" }).filter({ hasText: "Done" }).count()) === 1);
  await page.screenshot({ path: path.join(shots, "sync-after.png"), fullPage: true });

  await page.locator("[data-reconcile]").getByRole("button", { name: "Reconcile" }).click();
  await page.getByText(/Nothing was missing: Chapa has \d+ payments and all are stored/).waitFor({ timeout: 60000 });
  const recTotal = Number((await page.locator("[data-reconcile-result]").getByText(/Nothing was missing/).innerText()).match(/Chapa has (\d+)/)[1]);
  check("reconciling the last 3 days finds every payment stored", recTotal === since(3).length, { recTotal, want: since(3).length });
  await page.screenshot({ path: path.join(shots, "reconcile.png"), fullPage: true });
  await page.locator("tbody tr").filter({ hasText: "Reconciliation" }).first().click();
  await page.getByText("Requests to Chapa").waitFor();
  check("a run opens with its details", (await page.getByText("Requests that failed").count()) === 1);
  await page.keyboard.press("Escape");

  // Transactions.
  await page.goto(`${base}/finance/chapa?tab=transactions`);
  const total = page.locator("[data-total]");
  await total.filter({ hasText: `of ${since(7).length} transactions` }).waitFor({ timeout: 20000 });
  check("the default range is the last 7 days, counted by the database", true);
  const presets = await page.getByLabel("Date range").locator("option").allInnerTexts();
  check("all 13 date ranges are offered", presets.length === 13 && ["All time", "Today", "Yesterday", "Last 3 days", "Last 14 days", "Last week", "Last month", "This year", "Custom range"].every((p) => presets.includes(p)), presets);
  await page.getByLabel("Date range").selectOption("3days");
  await total.filter({ hasText: `of ${since(3).length} transactions` }).waitFor({ timeout: 15000 });
  const three = since(3);
  const cards = await page.locator("[data-summary]").innerText();
  const paid = three.filter((t) => t.status === "success");
  check("last 3 days: the cards count every payment of the range", cards.includes(String(three.length)) && cards.includes(String(paid.length)) && cards.includes(`ETB ${paid.reduce((a, t) => a + Number(t.amount), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`), cards.replace(/\n/g, " | "));
  await page.screenshot({ path: path.join(shots, "transactions-3days.png"), fullPage: true });

  await page.getByLabel("Date range").selectOption("all");
  await total.filter({ hasText: "of 160 transactions" }).waitFor({ timeout: 15000 });
  check("all time shows 1–50 of 160", (await total.innerText()).replace(/\s+/g, " ").startsWith("1–50 of 160") && (await page.locator("tbody tr").count()) === 50);
  await page.getByRole("button", { name: "Next page" }).click();
  await total.filter({ hasText: "51–100" }).waitFor({ timeout: 15000 });
  check("the next page comes from the server", (await page.getByText("Page 2 of 4").count()) === 1);
  await page.getByRole("button", { name: "Amount" }).click();
  await total.filter({ hasText: "1–50 of 160" }).waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("th[aria-sort]")?.textContent?.includes("Amount"));
  await page.waitForTimeout(600);
  const amounts = (await page.locator("tbody tr td.text-right").allInnerTexts()).map((x) => Number(x.replace(/,/g, "")));
  check("sorting by amount is over all pages, largest first", amounts[0] === 450 && amounts.every((v, i) => i === 0 || v <= amounts[i - 1]), amounts.slice(0, 5));

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Failed / cancelled" }).click();
  const failed = tx.filter((t) => t.status.startsWith("failed")).length;
  await total.filter({ hasText: `of ${failed} transactions` }).waitFor({ timeout: 15000 });
  check("the status filter narrows the table and the cards together", (await page.locator("tbody tr").filter({ hasText: "Failed / cancelled" }).count()) === failed && (await page.locator("[data-summary]").innerText()).includes("0.0%"));
  await page.getByLabel("Customer", { exact: true }).fill("customer0@example.et");
  await page.getByLabel("Customer", { exact: true }).press("Enter");
  const both = tx.filter((t) => t.status.startsWith("failed") && t.email === "customer0@example.et").length;
  await total.filter({ hasText: `of ${both} transactions` }).waitFor({ timeout: 15000 });
  check("filters work together", both > 0 && (await page.getByLabel("Active filters").getByText("Customer: customer0@example.et").count()) === 1, { both });

  page.once("dialog", (d) => d.accept("Failed, customer 0"));
  await page.getByRole("button", { name: "Saved" }).click();
  await page.getByRole("menuitem", { name: "Save the current filters…" }).click();
  await page.getByText("Filter saved").waitFor();
  await page.getByRole("button", { name: "Reset all" }).click();
  await total.filter({ hasText: `of ${since(7).length} transactions` }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Saved" }).click();
  await page.getByRole("menuitem", { name: /Failed, customer 0/ }).click();
  await total.filter({ hasText: `of ${both} transactions` }).waitFor({ timeout: 15000 });
  check("a saved filter brings the same result back", true);

  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Email" }).click();
  await page.keyboard.press("Escape");
  check("a chosen column is added to the table", (await page.locator("thead th").filter({ hasText: "Email" }).count()) === 1);
  await page.reload();
  await page.locator("thead th").filter({ hasText: "Email" }).waitFor({ timeout: 15000 });
  check("the chosen columns are remembered", true);
  await total.filter({ hasText: `of ${since(7).length} transactions` }).waitFor({ timeout: 15000 });

  await page.locator("tbody tr").first().click();
  await page.getByText("Callbacks from Chapa").waitFor({ timeout: 15000 });
  check("a payment's detail shows callbacks and Chapa's own status", (await page.getByText("None received for this payment.").count()) === 1 && (await page.getByText("Chapa's status").count()) === 1);
  await page.screenshot({ path: path.join(shots, "transaction-detail.png") });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Export" }).click();
  const href = await page.locator('a[href*="format=csv"]').getAttribute("href");
  const csv = await page.request.get(`${base}${href}`);
  const lines = (await csv.text()).split(/\r?\n/).filter((l) => /ORD-\d+/.test(l)).length;
  check("the export holds every matching payment of the range", csv.ok() && lines === since(7).length, { lines, want: since(7).length });
  await page.keyboard.press("Escape");

  await page.getByLabel("Date range").selectOption("custom");
  await page.getByLabel("Start date").fill("2019-01-01");
  await page.getByLabel("End date").fill("2019-01-31");
  await page.getByText("No payments for custom range").waitFor({ timeout: 15000 });
  check("an empty range explains itself and offers a sync", (await page.getByRole("link", { name: "Sync and reconcile" }).count()) >= 1);
  await page.screenshot({ path: path.join(shots, "transactions-empty.png"), fullPage: true });

  // Phone width: nothing scrolls sideways.
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() })).newPage();
  for (const tab of ["transactions", "sync"]) {
    await phone.goto(`${base}/finance/chapa?tab=${tab}`);
    await phone.locator(tab === "sync" ? "[data-sync-business]" : "[data-total]").first().waitFor({ timeout: 20000 });
    await phone.waitForTimeout(800);
    const wide = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${tab} fits a phone without sideways scrolling`, wide <= 2, { wide });
    await phone.screenshot({ path: path.join(shots, `phone-${tab}.png`), fullPage: true });
  }

  check("no browser errors", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  check("the test ran to the end", false, String(e).slice(0, 600));
} finally {
  await browser.close();
  chapa.close();
}
process.exit(fails ? 1 : 0);
