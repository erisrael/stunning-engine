// Update 1.0 Phase 3 in the browser, against a fake Chapa API: Finance › Chapa syncs two businesses, shows the
// overview, filters transactions, opens a payment's detail, shows the daily board, sends a follow-up to Support,
// keeps money actions off until Admin turns them on, and Admin's rules page lists every action.
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-p3");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};

const now = Date.now();
const mk = (prefix, n) =>
  Array.from({ length: n }, (_, i) => ({
    tx_ref: `${prefix}-${i}`, ref_id: `AP${prefix}${i}`, amount: String(100 + (i % 3) * 50), charge: "3", currency: "ETB", payment_method: ["telebirr", "cbebirr", "mpesa"][i % 3],
    type: "API", status: i % 6 === 0 ? "failed" : "success", first_name: `Customer${i % 8}`, last_name: "T", email: `c${i % 8}@x.test`, mobile: i % 6 === 0 ? `09220000${String(i).padStart(2, "0")}` : `09111000${String(i % 8).padStart(2, "0")}`,
    created_at: new Date(now - i * 20 * 60e3 - 60e3).toISOString(),
  }));
const lists = { AAA: mk("SUB", 30), BBB: mk("DON", 10) };
const chapa = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const key = (req.headers.authorization || "").includes("BBB") ? "BBB" : "AAA";
  const send = (b, s = 200) => res.writeHead(s, { "Content-Type": "application/json" }).end(JSON.stringify(b));
  if (u.pathname === "/v1/transactions") return send({ status: "success", data: { transactions: lists[key], pagination: { next_page_url: null } } });
  if (u.pathname.startsWith("/v1/transaction/verify/")) {
    const ref = decodeURIComponent(u.pathname.split("/").pop());
    return send({ data: { ...(lists[key].find((t) => t.tx_ref === ref) ?? {}), tx_ref: ref } });
  }
  if (u.pathname.startsWith("/v1/transaction/events/")) return send({ data: [{ message: "Payment initiated" }] });
  if (u.pathname === "/v1/balances") return send({ data: [{ currency: "ETB", available_balance: 5000, ledger_balance: 5200 }] });
  if (u.pathname === "/v1/transfers") return send({ data: [] });
  if (u.pathname === "/v1/banks") return send({ data: [{ id: 946, name: "CBE" }] });
  send({ message: "not found" }, 404);
});
await new Promise((r) => chapa.listen(47392, "127.0.0.1", r));

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

  await page.goto(`${base}/finance/chapa`);
  const tabs = await page.getByRole("navigation", { name: "Chapa pages" }).getByRole("link").allInnerTexts();
  check("Chapa has every page", ["Overview", "Transactions", "Daily board", "Customers", "Follow-up", "Balance & swap", "Withdrawals", "Refunds", "Account funds", "Match to Noor", "Settings"].every((t) => tabs.some((x) => x.includes(t))), tabs);
  await page.getByRole("button", { name: "Sync now" }).click();
  await page.getByText(/Synced: Subscriptions 30, Donations 10/).waitFor({ timeout: 20000 });
  await page.reload();
  await page.getByText("Last 30 days").first().waitFor();
  check("the overview shows paid volume per window", (await page.getByText(/ETB [\d,]+\.\d\d/).count()) > 0);
  await page.screenshot({ path: path.join(shots, "overview.png"), fullPage: true });

  await page.goto(`${base}/finance/chapa?tab=transactions`);
  await page.getByText(/40 transactions/).waitFor({ timeout: 15000 });
  check("All businesses lists both businesses' transactions", true);
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Failed / cancelled" }).click();
  await page.getByText(/^\d+ transactions$/).filter({ hasText: /^7 transactions$/ }).waitFor({ timeout: 10000 });
  check("the status filter narrows to failed payments", (await page.locator("tbody tr").filter({ hasText: "Failed / cancelled" }).count()) === 7);
  await page.locator("tbody tr").first().click();
  await page.getByText("Chapa events").waitFor();
  await page.getByText("Payment initiated").waitFor({ timeout: 10000 });
  check("a payment's detail shows its history and Chapa's events", (await page.getByText("Status history").count()) === 1);
  await page.screenshot({ path: path.join(shots, "transaction.png") });
  await page.keyboard.press("Escape");
  const xlsx = await page.request.get(`${base}${await page.getByRole("link", { name: "Excel" }).getAttribute("href")}`);
  check("transactions export to Excel", xlsx.ok() && (await xlsx.body()).subarray(0, 2).toString() === "PK");

  await page.goto(`${base}/finance/chapa?tab=daily`);
  await page.getByRole("radiogroup", { name: "Daily status" }).waitFor({ timeout: 15000 });
  check("the daily board has Success, Failed and Pending", (await page.getByRole("radiogroup", { name: "Daily status" }).getByRole("radio").count()) === 3);

  await page.goto(`${base}/finance/chapa?tab=followup`);
  await page.getByText("Not sent").first().waitFor({ timeout: 15000 });
  const n = Number((await page.getByRole("button", { name: /Send all \d+/ }).innerText()).match(/\d+/)[0]);
  await page.getByRole("button", { name: /Send all \d+/ }).click();
  await page.getByText(/case.? sent to the Payment follow-up queue/).waitFor({ timeout: 15000 });
  await page.getByRole("link", { name: /^#\d+ / }).first().waitFor();
  check("follow-ups become Support cases", n > 0 && (await page.getByRole("link", { name: /^#\d+ / }).count()) === n, { n });
  await page.screenshot({ path: path.join(shots, "followup.png") });

  await page.goto(`${base}/finance/chapa?tab=withdrawals`);
  await page.getByText(/Withdrawals are off for your role/).waitFor({ timeout: 15000 });
  check("withdrawals are off until Admin turns them on", true);
  await page.goto(`${base}/finance/chapa?tab=balance`);
  await page.getByText("ETB 5,000.00").first().waitFor({ timeout: 15000 });
  check("balances come from Chapa per business", (await page.getByText("ETB 5,000.00").count()) === 2);

  await page.goto(`${base}/finance/chapa?tab=settings`);
  await page.getByRole("button", { name: "Save rules" }).waitFor();
  check("Admin's rules list every action", (await page.getByText("Withdraw to a bank or wallet").count()) === 1 && (await page.getByText("Send follow-ups automatically", { exact: true }).count()) === 1);
  await page.getByRole("checkbox", { name: "Withdraw to a bank or wallet on" }).check();
  await page.getByRole("button", { name: "Save rules" }).click();
  await page.getByText("Chapa rules saved").waitFor();
  await page.goto(`${base}/finance/chapa?tab=withdrawals`);
  await page.getByRole("button", { name: "New withdrawal" }).waitFor({ timeout: 15000 });
  check("turning withdrawals on shows the request button", await page.getByRole("button", { name: "New withdrawal" }).isEnabled());
  await page.screenshot({ path: path.join(shots, "settings-on.png") });

  check("no browser errors", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.error(e);
  check("Update 1.0 Phase 3 flow completed", false);
} finally {
  await browser.close();
  chapa.close();
}
process.exitCode = fails ? 1 : 0;
