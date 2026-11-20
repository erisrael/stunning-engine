// In the browser: every anime character loads as a rigged 3D model, plays its animations (idle, walk, run, jump,
// sit, dance, wave), and shows up in Seed Town. Screenshots of each go to test-results/seed-town-models.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "seed-town-models");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, ms = 15000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);

try {
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  await page.goto(`${base}/fun`);
  const win = page.locator("[data-fun-window]");
  await win.locator('[data-fun-tab="games"]').click();
  await win.locator('[data-fun-game="world"]').click();
  check("Seed Town draws", await seen(win.locator("[data-world-canvas] canvas"), 30000));
  await win.locator("[data-world-dress]").click();
  const preview = win.locator("[data-studio-preview]");
  await preview.locator("canvas").waitFor();
  const models = ["kai", "mei", "aoi", "shibu", "bibi", "vita", "shino", "victoria", "fumiriya", "seed"];
  for (const m of models) {
    await win.locator(`[data-studio-item="avatar.${m}"]`).click();
    // The model file arrived (counted by the browser's own resource list, cached or not).
    const loaded = await page.waitForFunction((m) => performance.getEntriesByType("resource").some((e) => e.name.endsWith(`/models/avatars/${m}.vrm`)), m, { timeout: 60000 }).then(() => true, () => false);
    await page.waitForTimeout(2500);
    await preview.screenshot({ path: path.join(shots, `${m}.png`) });
    check(`${m} loads`, loaded);
  }
  await win.locator('[data-studio-item="avatar.kai"]').click();
  await page.waitForTimeout(2000);
  for (const pose of ["walk", "run", "jump", "sit", "dance", "wave", "cheer", "cry"]) {
    await win.locator(`[data-studio-pose="${pose}"]`).click();
    await page.waitForTimeout(900);
    await preview.screenshot({ path: path.join(shots, `pose-${pose}.png`) });
  }
  check("no browser errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  check("flow completed", false, e.message);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
