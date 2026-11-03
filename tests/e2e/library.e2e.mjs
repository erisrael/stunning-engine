// Phase 26 in the browser: a developer makes a folder, opens it, adds a file, imports a Markdown document into it,
// finds it by its text, pins it, and downloads it as Word.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "library");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, t = 15000) => loc.waitFor({ timeout: t }).then(() => true, () => false);

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("no page error", false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "abebe@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard|dev/, { timeout: 30000 });

  await page.goto(`${base}/dev/docs`);
  check("the library opens", await seen(page.locator("[data-library]")));
  await page.locator("[data-new-folder]").click();
  await page.getByLabel("Folder name").fill("Mobile app");
  await page.getByRole("button", { name: "Make" }).click();
  check("a folder is made", await seen(page.locator('[data-folder="Mobile app"]')));
  await page.locator('[data-folder="Mobile app"]').click();
  check("and opened, with its path", await seen(page.locator("[data-breadcrumbs]").getByText("Mobile app")));
  const file = path.join(shots, "wireframe.txt");
  fs.writeFileSync(file, "home screen");
  await page.locator("[data-upload-input]").setInputFiles(file);
  check("a file is added to it", await seen(page.locator('[data-lib-file="wireframe.txt"]')));
  const md = path.join(shots, "Offline plan.md");
  fs.writeFileSync(md, "# Offline plan\nLessons download at night.\n- Wi-Fi only");
  await page.locator("[data-import-input]").setInputFiles(md);
  check("a Markdown file is imported and opened", await seen(page.locator("[data-doc-editor]"), 20000));
  await page.goto(`${base}/dev/docs`);
  await page.getByLabel("Search the library").fill("download at night");
  check("search finds it by its text", await seen(page.locator('[data-found-doc="Offline plan"]')));
  await page.getByLabel("Search the library").fill("");
  await page.locator('[data-tree-folder="Mobile app"]').click();
  const row = page.locator('[data-lib-doc="Offline plan"]');
  check("it is in the folder", await seen(row));
  await row.getByRole("button", { name: "Pin Offline plan" }).click();
  check("pinned", await seen(page.locator("[data-pins]").getByText("Offline plan")));
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), row.getByRole("link", { name: "Download Offline plan as Word" }).click()]);
  check("downloads as Word", dl.suggestedFilename().endsWith(".docx"), dl.suggestedFilename());
  await page.screenshot({ path: path.join(shots, "1-library.png"), fullPage: true });
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
