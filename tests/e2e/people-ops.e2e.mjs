// People operations in the browser: the QR scanner in the top bar, Admin editing a check-in and clearing a day, the
// employee rules published as a policy, the income tax law and overtime rates in Finance, everyone on payroll, and
// recognition switched on with the leaderboard, a title and kudos.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "people-ops");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const visible = (loc, ms = 10000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
const toast = (page, re) => visible(page.locator("[data-sonner-toast]").filter({ hasText: re }), 10000);
async function as(email) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`${email}: no page error`, false, e.message));
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Wrong entry" : undefined));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
}
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

try {
  const a = await as("admin@demo.local");
  check("the QR scanner is in the top bar", await visible(a.locator("[data-qr-scan-top]")));

  // Edit records.
  await a.goto(`${base}/attendance?tab=records&day=${yesterday}&emp=${prep.dawit}`);
  await a.locator("[data-rec-add]").waitFor();
  await a.locator("[data-rec-add]").getByLabel("Time").fill("08:20");
  await a.locator("[data-rec-add]").getByLabel("Reason").fill("Kiosk was down");
  await a.getByRole("button", { name: "Log it" }).click();
  check("a check-in logged by hand", await toast(a, /Logged for/));
  await a.waitForTimeout(800);
  await a.getByRole("button", { name: "Change time" }).first().click();
  await a.getByLabel("New time").fill("08:45");
  await a.getByLabel("Reason for the change").fill("Arrived later");
  await a.getByRole("button", { name: "Save", exact: true }).click();
  check("its time changed", await toast(a, /Time changed/));
  await a.waitForTimeout(800);
  check("the old entry stays, struck through", (await a.locator('[data-rec-event="voided"]').count()) === 1 && (await a.locator('[data-rec-event="active"]').count()) === 1);
  await a.screenshot({ path: path.join(shots, "1-records.png"), fullPage: true });
  await a.locator("[data-rec-clear]").getByLabel("Reason for clearing").fill("Test entries");
  await a.locator("[data-rec-clear]").getByRole("button", { name: "Clear" }).click();
  check("a day cleared", await toast(a, /Cleared/));

  // Employee rules.
  await a.goto(`${base}/attendance?tab=rules`);
  check("the written rules are drafted from the settings", ((await a.getByLabel("Attendance rules text").inputValue()) ?? "").includes("Working hours"));
  await a.getByRole("button", { name: "Publish to everyone" }).click();
  check("published for everyone to confirm", await toast(a, /Published/));
  await a.screenshot({ path: path.join(shots, "2-rules.png"), fullPage: true });

  // Finance: tax law, overtime, everyone on payroll.
  await a.goto(`${base}/finance?tab=settings`);
  check("Proclamation 1395/2025 is chosen", (await a.locator("#fs-law").inputValue()) === "1395/2025");
  check("overtime rates of the Labour Proclamation", (await a.locator("#fs-ot-night").inputValue()) === "1.75");
  await a.screenshot({ path: path.join(shots, "3-finance-rules.png"), fullPage: true });
  await a.goto(`${base}/finance?tab=payroll`);
  await a.getByRole("button", { name: "Add everyone to payroll" }).click();
  check("everyone on payroll", await toast(a, /Everyone with an account is on payroll/));
  check("people without a salary are shown", await visible(a.locator("[data-salary-not-set]")));
  await a.screenshot({ path: path.join(shots, "4-payroll.png"), fullPage: true });

  // Recognition: off, then switched on.
  await a.goto(`${base}/recognition?tab=settings`);
  await a.getByLabel("Recognition on").click();
  await a.getByRole("button", { name: "Save", exact: true }).click();
  check("recognition switched on", await toast(a, /Saved/));
  await a.goto(`${base}/recognition?tab=leaderboard`);
  check("the leaderboard ranks people", await visible(a.locator('[data-rank-row="1"]')));
  check("the Recognition link is in the sidebar", await visible(a.getByRole("link", { name: "Recognition", exact: true })));
  await a.screenshot({ path: path.join(shots, "5-leaderboard.png"), fullPage: true });
  await a.goto(`${base}/recognition?tab=badges`);
  const give = a.locator("[data-give-title]");
  await give.getByLabel("Person").selectOption({ label: "Sara" }).catch(async () => give.getByLabel("Person").selectOption({ index: 1 }));
  await give.getByLabel("Why").fill("Finished the term's lessons early");
  await give.getByRole("button", { name: "Give the title" }).click();
  check("a title given", await toast(a, /Title given/));

  const s = await as("sara@demo.local");
  await s.goto(`${base}/recognition?tab=badges`);
  check("Sara sees her title", await visible(s.locator("[data-my-badges]").getByText("Employee of the month")));
  await s.goto(`${base}/recognition?tab=kudos`);
  await s.locator("[data-give-kudos]").getByLabel("Who").selectOption({ index: 1 });
  await s.locator("[data-give-kudos]").getByLabel("What they did").fill("Helped me fix the timetable");
  await s.getByRole("button", { name: "Send kudos" }).click();
  check("kudos sent", await toast(s, /Kudos sent/));
  await s.waitForTimeout(800);
  check("on the kudos wall", await visible(s.locator("[data-kudos-wall]").getByText("Helped me fix the timetable")));
  await s.goto(`${base}/recognition?tab=leaderboard`);
  check("a member sees their own place", await visible(s.locator("[data-my-rank]")));
  check("and not who needs support", (await s.locator("[data-needs-support]").count()) === 0);
  await s.screenshot({ path: path.join(shots, "6-member-board.png"), fullPage: true });
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
