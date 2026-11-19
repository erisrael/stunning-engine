// "Do it for me" in the browser: a tutorial chosen in the assistant is carried out on the pages (it opens the
// page, moves its pointer and presses the buttons itself), hands the person the form steps ("Your turn"), and an
// export asked for is only pointed at when the role may not have the assistant export.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "assistant-autopilot");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, ms = 10000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("no page error", false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  await page.goto(`${base}/dashboard`);
  await page.waitForLoadState("load");

  const ask = async (text) => {
    if (!(await page.getByLabel("Ask the assistant").isVisible().catch(() => false))) await page.getByRole("button", { name: "Open the assistant" }).click();
    await page.getByLabel("Ask the assistant").fill(text);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
  };

  // 1. A tutorial done for the person: it opens the page and runs the steps itself.
  await ask("change password");
  const doIt = page.getByRole("button", { name: "Do it for me" }).last();
  check("the assistant offers Do it for me", await seen(doIt));
  await doIt.click();
  const box = page.getByRole("dialog", { name: "Show me" });
  check("it runs the task on the pages", await seen(box) && (await box.textContent()).includes("doing it for you"));
  await page.waitForURL(/\/profile\?tab=account/, { timeout: 15000 }).catch(() => {});
  check("it opened the page itself", /\/profile/.test(page.url()), page.url());
  await page.screenshot({ path: path.join(shots, "1-doing.png") });
  // The steps without a control move on by themselves; the Change password button is the person's to press.
  check("saving the form is left to the person", await seen(page.locator("[data-assistant-your-turn]"), 20000), await box.textContent().catch(() => ""));
  await page.screenshot({ path: path.join(shots, "2-your-turn.png") });
  await box.getByRole("button", { name: "Pause" }).click();
  check("Do it for me can be paused", await seen(box.getByRole("button", { name: "Do it for me" }), 3000));
  await box.getByRole("button", { name: "Stop" }).click();

  // 2. A tutorial whose steps it presses itself: the pointer moves to the button.
  await page.goto(`${base}/dashboard`);
  await ask("two-step");
  await page.getByRole("button", { name: "Do it for me" }).last().click();
  check("its pointer shows what it presses", await seen(page.locator("[data-assistant-pointer]"), 15000));
  await page.screenshot({ path: path.join(shots, "3-pointer.png") });
  await page.getByRole("dialog", { name: "Show me" }).getByRole("button", { name: "Stop" }).click().catch(() => {});

  // 3. An export asked for: Admin has not let the assistant export for this role, so it opens the page and points.
  await page.goto(`${base}/dashboard`);
  await ask("export call records");
  const exp = page.getByRole("dialog", { name: "Show me" });
  check("an export it may not do is pointed at, not done", (await seen(exp.getByText(/Press Export here/), 20000)) && !(await page.locator("[data-assistant-pointer]").isVisible()), await exp.textContent().catch(() => ""));
  await page.waitForURL(/\/call-records/, { timeout: 15000 }).catch(() => {});
  check("it opens the page with the export", /\/call-records/.test(page.url()), page.url());
  await page.screenshot({ path: path.join(shots, "4-export.png") });
  await exp.getByRole("button", { name: "Stop" }).click().catch(() => {});

  // 4. A control that is not on the page: it says so instead of waiting.
  await page.goto(`${base}/dashboard`);
  await ask("export the audit log");
  const ok4 = await seen(page.getByText(/has no export for your role/), 25000);
  await page.screenshot({ path: path.join(shots, "5-no-export.png") });
  check("it says when the page has no export", ok4, page.url());
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
