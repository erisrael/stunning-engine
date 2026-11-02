// Admin's sidebar links switch the page (no tab bar on the page), Admin, Branding (a banner on Home, another icon and
// colour for a sidebar entry), and the person's icon pack, font and contrast.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "branding");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const toast = (page, re) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
const visible = (loc, ms = 10000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("no page error", false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  await page.goto(`${base}/admin`);
  const side = page.locator("[data-sidebar=sidebar]").first();
  check("no tab bar on the Admin page", (await page.locator("main [role=tablist]").filter({ visible: true }).count()) === 0);
  await side.getByRole("link", { name: "Teams", exact: true }).click();
  await page.waitForURL(/tab=teams/);
  check("the sidebar link opens Teams", await visible(page.locator("main [role=tabpanel][data-state=active]")) && (await page.locator('main [role=tabpanel][data-state=active]').first().getAttribute("id"))?.includes("teams"));
  await side.getByRole("link", { name: "Sign-in", exact: true }).click();
  await page.waitForURL(/tab=signin/);
  check("and then Sign-in", (await page.locator('main [role=tabpanel][data-state=active]').first().getAttribute("id"))?.includes("signin"));

  // Branding: a banner on Home.
  await side.getByRole("link", { name: "Branding", exact: true }).click();
  await page.waitForURL(/tab=branding/);
  const ed = page.locator('[data-banner-editor="home"]');
  await ed.getByLabel("Banner title for Home (everyone)").fill("Welcome to Myseed");
  await ed.getByLabel("Banner line for Home (everyone)").fill("Learning for every student");
  await ed.getByRole("button", { name: "Colour #188038" }).click();
  await ed.getByRole("button", { name: "Save" }).click();
  check("banner saved", await toast(page, /Banner saved/));
  // Another icon and colour for Admin.
  const row = page.locator('[data-nav-brand="/admin"]');
  await row.getByRole("button", { name: "Admin in red" }).click();
  await row.getByRole("button", { name: "Icon" }).click();
  await row.getByRole("option", { name: "Rocket" }).click();
  await page.getByRole("button", { name: "Save sidebar icons" }).click();
  check("sidebar icons saved", await toast(page, /Sidebar icons saved/));
  await page.screenshot({ path: path.join(shots, "1-branding.png"), fullPage: true });

  await page.goto(`${base}/dashboard`);
  const banner = page.locator('[data-section-banner="home"]');
  check("the banner shows on Home", await visible(banner) && /Welcome to Myseed/.test(await banner.innerText()));
  const att = side.getByRole("link", { name: "Admin", exact: true });
  check("Admin has the rocket in red", (await att.locator("svg.lucide-rocket").count()) === 1 && (await att.locator("svg.lucide-rocket").getAttribute("class"))?.includes("D93025"));
  check("other pages have no banner", await page.goto(`${base}/attendance`).then(() => page.locator("[data-section-banner]").count()) === 0);

  // The person's style: icon pack, font, contrast (as the account menu sets them).
  await page.evaluate(() => {
    const d = document.documentElement;
    d.dataset.iconPack = "fill";
    d.dataset.font = "readable";
    d.dataset.contrast = "high";
  });
  const shown = await side.locator("svg.app-icon").evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.getAttribute("class")));
  check("filled icons show and outline ones hide", shown.length > 3 && shown.every((c) => /pk-fill|pk-lucide/.test(c ?? "")) && shown.some((c) => /pk-fill/.test(c ?? "")) && !shown.some((c) => /pk-alt/.test(c ?? "")), shown.slice(0, 4).join(" | "));
  check("the font changes", /Atkinson/i.test(await page.evaluate(() => getComputedStyle(document.body).fontFamily)));
  await page.screenshot({ path: path.join(shots, "2-filled-high-contrast.png") });
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
