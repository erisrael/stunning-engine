// In the browser: the guest arcade (/arcade) without an account: straight into Seed Town at the door of Seed
// Arcade (offline: no staff, nothing sent to the server), a cabinet's game on its screen and back, links out
// stopped; Admin's switch closes it.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "arcade");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, ms = 15000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);

try {
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const posts = [];
  page.on("request", (r) => r.method() === "POST" && posts.push(new URL(r.url()).pathname));
  await page.goto(`${base}/arcade?kiosk=1`);
  // Straight into the town, at the door of Seed Arcade.
  check("the arcade opens without an account, in the town", !/\/login/.test(page.url()) && (await seen(page.locator("[data-arcade-play=world]"), 30000)));
  check("nothing of Myseed is on the page (no sidebar, no links out)", (await page.locator("nav a, [data-sidebar]").count()) === 0);
  await page.waitForFunction(() => !!window.__seedTown, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const town = await page.evaluate(() => {
    const t = window.__seedTown;
    return t ? { offline: !!t.data.offline, residents: t.data.residents.map((r) => r.name), departments: t.data.departments.length, homes: Object.keys(t.data.homes).length, x: t.body.x, z: t.body.z, spawn: t.city.arcadeSpawn, cabinets: t.city.interacts.filter((i) => i.kind === "arcade" && i.data?.game).length } : null;
  });
  check("Seed Town runs offline for a guest", town?.offline === true, JSON.stringify(town));
  check("a guest sees no staff, departments or homes", town && town.residents.join() === "Guest" && town.departments === 0 && town.homes === 0, JSON.stringify(town));
  check("a guest starts at the door of Seed Arcade", !!town && Math.hypot(town.x - town.spawn.x, town.z - town.spawn.z) < 2, JSON.stringify(town));
  check("the hall has a cabinet for every game", (town?.cabinets ?? 0) >= 10, town?.cabinets);
  const box = await page.locator("[data-arcade-play=world] #seed-town").boundingBox().catch(() => null);
  check("the town fills the screen", !!box && box.height > 600, JSON.stringify(box));
  await page.screenshot({ path: path.join(shots, "town.png") });

  // A cabinet: walk up to Snake and press E; the game on the cabinet's screen; Esc back to the town.
  await page.evaluate(() => {
    const t = window.__seedTown;
    const c = t.city.interacts.find((i) => i.id === "arcade-snake");
    t.teleport(c.x, 0, c.z);
  });
  await page.waitForFunction(() => /SNAKE/.test(window.__seedTown.prompt?.label ?? ""), null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => window.__seedTown.interact());
  check("pressing E at a cabinet plays its game", await seen(page.locator('[data-arcade-screen="snake"]')));
  check("the town leaves the keyboard alone while playing", await page.evaluate(() => window.__seedTown.blockInput === true));
  await page.screenshot({ path: path.join(shots, "cabinet.png") });
  await page.keyboard.press("Escape");
  check("Esc goes back to the town", (await page.locator("[data-arcade-screen]").count()) === 0 && (await page.evaluate(() => window.__seedTown.blockInput === false)));

  // Links out are stopped.
  const before = page.url();
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "/dashboard";
    a.id = "way-out";
    a.textContent = "out";
    document.body.appendChild(a);
  });
  await page.locator("#way-out").click({ force: true });
  await page.waitForTimeout(1500);
  check("a link out of the arcade does nothing", page.url() === before, page.url());
  const sent = posts.filter((p) => !p.startsWith("/api/errors"));
  check("nothing was sent to the server", sent.length === 0, sent.join(","));
  check("no browser errors", errors.length === 0, errors.join(" | "));

  // Admin closes the arcade (the guest's 3D town closed first: the test browser draws in software).
  await page.close();
  const admin = await (await browser.newContext()).newPage();
  await admin.goto(`${base}/login`);
  await admin.fill("input[name=email]", "admin@demo.local");
  await admin.fill("input[name=password]", "Demo-Workflow-2026");
  await admin.getByRole("button", { name: /log in/i }).click();
  await admin.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60000 });
  await admin.goto(`${base}/admin?tab=fun`);
  const sw = admin.locator('[data-fun-switch="guestArcade"]');
  check("Admin has the Guest arcade switch, on", (await sw.getAttribute("data-state")) === "checked");
  await sw.click();
  await admin.locator("[data-fun-save]").click();
  await admin.waitForTimeout(2500);
  const closed = await (await browser.newContext()).newPage();
  await closed.goto(`${base}/arcade`);
  check("switched off, the arcade says it is closed", await seen(closed.getByText("THE ARCADE IS CLOSED")));
} catch (e) {
  console.error(e);
  check("flow completed", false, e.message);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
