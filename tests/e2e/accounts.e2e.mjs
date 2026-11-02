// Admin, People: deactivate and reactivate from the row, and delete with the history shown and the email typed.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "accounts");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const toast = (page, re) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("no page error", false, e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  await page.goto(`${base}/admin`);
  // The short Admin sidebar: Admin's tabs fold out under Admin; production pages under one entry.
  const side = page.locator("[data-sidebar=sidebar]").first();
  const groups = (await side.locator("[data-sidebar=group-label]").allInnerTexts()).map((t) => t.trim().toLowerCase());
  check("the Admin sidebar is short", groups.join() === "my space,administration,production,departments", groups);
  check("Admin's tabs fold out under Admin", await side.getByRole("link", { name: "Sign-in", exact: true }).isVisible());
  check("no Workflow list for Admin", (await side.getByRole("link", { name: "Handovers", exact: true }).count()) === 0);
  await page.screenshot({ path: path.join(shots, "0-admin-sidebar.png") });

  await page.getByRole("button", { name: "Reset the password of Liya" }).click();
  const rd = page.locator("[data-reset-password]");
  const go = rd.getByRole("button", { name: "Reset password" });
  check("reset waits for RESET", await go.isDisabled());
  await rd.getByLabel("Type RESET to confirm").fill("reset");
  check("lower case is not enough", await go.isDisabled());
  await rd.getByLabel("Type RESET to confirm").fill("RESET");
  await go.click();
  check("the temporary password is shown", await page.getByText(/Myseed-[0-9a-f]{8}/).first().waitFor({ timeout: 10000 }).then(() => true, () => false));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Deactivate Liya" }).click();
  check("deactivated from the row", await toast(page, /Liya deactivated/));
  await page.getByRole("button", { name: "Reactivate Liya" }).waitFor({ timeout: 10000 });
  check("shown as deactivated", (await page.locator("tr").filter({ hasText: "liya@demo.local" }).getByText("Deactivated").count()) === 1);
  await page.getByRole("button", { name: "Reactivate Liya" }).click();
  check("reactivated", await toast(page, /Liya reactivated/));
  check("no delete or deactivate on your own row", (await page.locator("tr").filter({ hasText: "admin@demo.local" }).getByRole("button", { name: /^Delete/ }).count()) === 0);

  await page.getByRole("button", { name: "Delete Abel" }).click();
  const dlg = page.locator("[data-delete-account]");
  await dlg.getByLabel(/Type abel@demo.local/).waitFor({ timeout: 10000 });
  check("the dialog says what happens", (await dlg.innerText()).match(/removed completely|has history/) !== null);
  const del = dlg.getByRole("button", { name: "Delete for good" });
  check("delete waits for the email", await del.isDisabled());
  await dlg.getByLabel(/Type abel@demo.local/).fill("abel@demo.local");
  await page.screenshot({ path: path.join(shots, "1-delete.png") });
  await del.click();
  check("deleted", await toast(page, /account was deleted/));
  await page.waitForTimeout(800);
  check("gone from the list", (await page.locator("tr").filter({ hasText: "abel@demo.local" }).count()) === 0);
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
