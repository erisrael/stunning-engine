// Update 1.1 live admin dashboard in the browser: Admin's home shows who is in the app and the desk's numbers, and
// they change by themselves: Sara comes online, a customer writes from the widget, Sara steps away. Only Admin can
// open the live stream.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-1-live-dashboard");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const seen = (loc, t = 20000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const errors = [];

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email}: ${e.message}`));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  return { ctx, page };
}

try {
  const { page } = await login("admin@demo.local");
  await page.goto(`${base}/dashboard`);
  const live = page.locator("[data-live-ops]");
  check("Admin's home has the live view and it connects", await seen(page.locator("[data-live-ops=live]")));
  const roster = page.locator("[data-live-roster]");
  check("Admin is on the roster as Online", await seen(roster.locator("[data-roster-row='Admin'] [data-live-status=online]")));
  const tile = (label) => page.locator("[data-live-metrics] > *").filter({ hasText: label }).first();
  check("the desk's numbers start at zero", /Open tickets\s*0/.test(await tile("Open tickets").innerText()), await tile("Open tickets").innerText());

  // Sara opens the app and goes online for support.
  const sara = await login("sara@demo.local");
  await sara.page.goto(`${base}/support`);
  await sara.page.locator("[data-agent-bar] [data-status=online]").click();
  check("Sara appears Online by herself (no reload)", await seen(roster.locator("[data-roster-row='Sara'] [data-live-status=online]")));
  check("with her ticket workload", await seen(roster.locator("[data-roster-row='Sara']").filter({ hasText: "0 / 10 tickets" })));

  // A customer writes from the widget.
  const cust = await browser.newContext({ viewport: { width: 420, height: 800 } });
  const w = await cust.newPage();
  await w.goto(`${base}/support-widget?key=${encodeURIComponent(prep.key)}&id=live-1&name=Hana%20Girma`);
  await w.locator("[data-new-question]").click();
  await w.getByLabel("Subject").fill("Payment");
  await w.getByLabel("Your question").fill("I paid but the plan is not active.");
  await w.getByRole("button", { name: "Send" }).click();
  await w.locator("[data-thread]").first().waitFor({ timeout: 20000 }).catch(() => null);
  check("open tickets rise by themselves", await page.waitForFunction(() => /Open tickets\s*1/.test(document.querySelector("[data-live-metrics]")?.textContent ?? ""), null, { timeout: 20000 }).then(() => true, () => false));
  check("the chat counts as active", /Active chats\s*1/.test(await tile("Active chats").innerText()));
  check("traffic shows the system", await seen(page.locator("[data-traffic='MySeed Academy']").filter({ hasText: "1 new" })));
  await page.screenshot({ path: path.join(shots, "1-live.png"), fullPage: true });

  // Sara steps away.
  await sara.page.locator("[data-agent-bar] [data-status=away]").click();
  check("Sara shows Away by herself", await seen(roster.locator("[data-roster-row='Sara'] [data-live-status=away]")));
  await page.locator("[data-roster-filter=away]").click();
  check("the filter shows only the away", (await roster.locator("[data-roster-row]").count()) === 1);
  await page.locator("[data-roster-filter=all]").click();
  check("everyone, offline too", await seen(roster.locator("[data-live-status=offline]")));

  // Only Admin opens the stream.
  const r = await sara.page.request.get(`${base}/api/admin/live`);
  check("others cannot open the live stream", r.status() === 403, r.status());
  await sara.page.goto(`${base}/dashboard`);
  check("and their home has no live view", (await sara.page.locator("[data-live-ops]").count()) === 0);
  check("no page errors", errors.length === 0, errors);
} catch (e) {
  console.error(e);
  fails++;
} finally {
  await browser.close();
}
if (fails) process.exit(1);
