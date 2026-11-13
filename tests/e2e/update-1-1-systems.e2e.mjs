// Update 1.1 connected systems in the browser: Admin opens Customer support, Connected systems, switches a channel
// off, adds a webhook (its signing secret is shown once) and the settings stay after a reload.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-1-systems");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const seen = (loc, t = 12000) => loc.waitFor({ timeout: t }).then(() => true, () => false);
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  await page.goto(`${base}/support`);
  await page.getByRole("link", { name: "Connected systems" }).click();
  await page.waitForURL(/tab=systems/);
  const card = page.locator("[data-system='MySeed Academy']");
  check("the system is listed with its four channels", await seen(card) && (await card.locator("[data-system-channels] [role=switch]").count()) === 4);
  await card.getByRole("switch", { name: "Calls for MySeed Academy" }).click();
  await card.getByLabel("Webhook for MySeed Academy").fill("https://academy.example/hooks/support");
  await card.locator("[data-save-system]").click();
  check("saving shows the webhook secret once", await seen(card.locator("[data-webhook-secret]").getByText(/^whsec_/)));
  await page.screenshot({ path: path.join(shots, "1-systems.png"), fullPage: true });
  await page.reload();
  const c2 = page.locator("[data-system='MySeed Academy']");
  await c2.waitFor();
  check("calls stay off", (await c2.getByRole("switch", { name: "Calls for MySeed Academy" }).getAttribute("aria-checked")) === "false");
  check("web chat stays on", (await c2.getByRole("switch", { name: "Web chat for MySeed Academy" }).getAttribute("aria-checked")) === "true");
  check("the webhook is kept and the secret is not shown again", (await c2.getByLabel("Webhook for MySeed Academy").inputValue()) === "https://academy.example/hooks/support" && (await c2.locator("[data-webhook-secret]").count()) === 0);
  check("the bot can be connected", await seen(c2.getByLabel("Bot token for MySeed Academy")));
  check("no browser errors", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.error(e);
  check("connected systems flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
