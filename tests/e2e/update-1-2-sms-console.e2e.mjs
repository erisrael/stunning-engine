// Update 1.2, System improvements 5 in the browser: Integrations hub › SMS. Compose shows the message as it arrives,
// its characters, parts and encoding, and the recipients, parts and cost before sending; sending asks first; History
// shows each message with its status, a delivery report turns pending into delivered or rejected, the detail holds the
// failure reason, and the list exports; Usage & costs sums messages, delivery rate and spend. Desktop and phone.
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-2-sms-console");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const seen = (loc, t = 15000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);

// A fake AfroMessage: accepts every number except ones ending in 000000.
const got = [];
const sms = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const b = JSON.parse(body || "{}");
    if (String(b.to).endsWith("000000")) return res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Invalid destination" }));
    got.push(b);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ acknowledge: "success", response: { message_id: `am-${got.length}` } }));
  });
});
await new Promise((r) => sms.listen(47394, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));

  // Compose.
  await page.goto(`${base}/admin/integrations?tab=sms`);
  await page.locator("[data-sms-compose]").waitFor({ timeout: 20000 });
  await page.getByLabel("Recipients", { exact: true }).fill("0911 223 344 Abebe\n0922000000, 0933112233, nope");
  await page.getByLabel("Message", { exact: true }).fill("a".repeat(161));
  check("characters, parts and encoding are counted as you type", (await page.locator("[data-sms-counter]").getAttribute("data-sms-counter")) === "2" && (await page.locator("[data-sms-counter]").innerText()).includes("GSM-7"));
  await page.locator("[data-sms-recipients='3']").waitFor({ timeout: 15000 });
  check("the estimate has the recipients and parts", (await page.locator("[data-sms-parts]").getAttribute("data-sms-parts")) === "6");
  check("and the cost from the price per part", (await page.locator("[data-sms-cost]").innerText()).includes("2.10 ETB"));
  check("what is not a number is named", (await page.locator("[data-sms-invalid]").innerText()).includes("nope"));
  await page.getByLabel("Message", { exact: true }).fill("School opens Monday.");
  check("the preview shows the message as it arrives", (await page.locator("[data-sms-preview]").innerText()).includes("School opens Monday."));
  await page.locator("[data-sms-parts='3']").waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(shots, "compose.png"), fullPage: true });
  await page.locator("[data-sms-send]").click();
  await page.locator("[data-sms-confirm]").waitFor();
  check("sending asks first, with the cost", got.length === 0 && (await page.getByRole("alertdialog").innerText()).includes("1.05 ETB"));
  await page.locator("[data-sms-confirm]").click();

  // History of the batch.
  await page.locator("[data-sms-history]").waitFor({ timeout: 20000 });
  await page.locator("[data-sms-total='3']").waitFor({ timeout: 15000 });
  check("the batch opens in History", (await page.locator("[data-sms-row]").count()) === 3 && got.length === 2);
  check("accepted messages are pending, a refused one failed", (await page.locator("[data-sms-row=pending]").count()) === 2 && (await page.locator("[data-sms-row=failed]").count()) === 1);
  const dlr = (b) => page.request.post(`${base}/api/integrations/sms/dlr?t=${prep.token}`, { data: b });
  await dlr({ id: "am-1", status: "Delivered" });
  await dlr({ id: "am-2", status: "Rejected", failureReason: "UserInBlacklist" });
  await page.getByRole("button", { name: "Reload" }).click();
  await page.locator("[data-sms-row=delivered]").waitFor({ timeout: 15000 });
  check("delivery reports mark delivered and rejected", (await page.locator("[data-sms-row=rejected]").count()) === 1);
  await page.locator("[data-sms-row=rejected]").click();
  check("the detail holds the provider's reason", await seen(page.locator("[data-sms-reason]").getByText("UserInBlacklist")));
  await page.screenshot({ path: path.join(shots, "detail.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Delivered" }).click();
  await page.locator("[data-sms-total='1']").waitFor({ timeout: 15000 });
  check("History filters by status", (await page.locator("[data-sms-row]").count()) === 1);
  const download = page.waitForEvent("download");
  await page.locator("[data-sms-export]").click();
  const csv = fs.readFileSync(await (await download).path(), "utf8").trim().split(/\r?\n/);
  check("and exports what it shows", csv.length === 2 && csv[1].includes("delivered"), csv);

  // Usage & costs.
  await page.getByRole("tab", { name: "Usage & costs" }).click();
  await page.locator("[data-sms-usage-totals]").waitFor({ timeout: 15000 });
  await page.locator("[data-sms-usage-totals]").getByText("0.70 ETB").waitFor({ timeout: 15000 });
  const totals = await page.locator("[data-sms-usage-totals]").innerText();
  check("usage sums messages, delivery rate and spend", totals.includes("3") && totals.includes("33%") && totals.includes("0.70 ETB"), totals);
  check("prices per provider are kept", (await page.getByLabel("AfroMessage price per part").inputValue()) === "0.35");
  await page.screenshot({ path: path.join(shots, "usage.png"), fullPage: true });

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const s of ["compose", "history", "usage"]) {
    await page.goto(`${base}/admin/integrations?tab=sms&sms=${s}`);
    await page.waitForTimeout(1500);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`${s} has no sideways scroll at phone width`, !wide);
    await page.screenshot({ path: path.join(shots, `${s}-phone.png`), fullPage: true });
  }
  check("no script errors", errors.length === 0, errors);
} catch (e) {
  console.log(`FAIL crashed ${e instanceof Error ? e.stack : e}`);
  fails++;
} finally {
  await browser.close();
  sms.close();
}
process.exit(fails ? 1 : 0);
