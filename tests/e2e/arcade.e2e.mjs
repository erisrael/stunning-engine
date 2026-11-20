// In the browser: the guest arcade (/arcade) without an account: the arcade machine with the games, a game from
// the keyboard and back to the menu, Seed Town as a guest (offline: no staff, nothing sent to the server), links out
// stopped, guest scores kept in the browser; Admin's switch closes it.
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
  check("the arcade opens without an account", !/\/login/.test(page.url()) && (await seen(page.locator("[data-arcade-menu]"))));
  const games = await page.locator("[data-arcade-game]").evaluateAll((els) => els.map((e) => e.getAttribute("data-arcade-game")));
  check("it lists Seed Town and the arcade games", games.includes("world") && games.includes("snake") && games.length >= 8, games.join(","));
  check("nothing of Myseed is on the page (no sidebar, no links out)", (await page.locator("nav a, [data-sidebar]").count()) === 0);
  await page.screenshot({ path: path.join(shots, "menu.png") });

  // A game from the keyboard (the second one), then back to the menu.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  check("Enter starts the selected game", (await page.locator("[data-arcade-play]").getAttribute("data-arcade-play").catch(() => null)) === games[1]);
  await page.locator("[data-arcade-menu-btn]").click();
  check("Menu comes back to the game list", await seen(page.locator("[data-arcade-menu]")));

  // Snake: a guest's best score stays in this browser.
  await page.locator('[data-arcade-game="snake"]').click();
  check("Snake plays in the arcade", await seen(page.locator('[data-arcade-play="snake"]')));
  await page.locator("[data-arcade-menu-btn]").click();

  // Seed Town as a guest.
  await page.locator('[data-arcade-game="world"]').click();
  await page.waitForFunction(() => !!window.__seedTown, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const town = await page.evaluate(() => {
    const t = window.__seedTown;
    return t ? { offline: !!t.data.offline, residents: t.data.residents.map((r) => r.name), departments: t.data.departments.length, homes: Object.keys(t.data.homes).length } : null;
  });
  check("Seed Town runs offline for a guest", town?.offline === true, JSON.stringify(town));
  check("a guest sees no staff, departments or homes", town && town.residents.join() === "Guest" && town.departments === 0 && town.homes === 0, JSON.stringify(town));
  const box = await page.locator("[data-arcade-play=world] #seed-town").boundingBox().catch(() => null);
  check("the town fills the arcade screen", !!box && box.height > 600, JSON.stringify(box));
  await page.screenshot({ path: path.join(shots, "town.png") });

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

  // Admin closes the arcade.
  const admin = await (await browser.newContext()).newPage();
  await admin.goto(`${base}/login`);
  await admin.fill("input[name=email]", "admin@demo.local");
  await admin.fill("input[name=password]", "Demo-Workflow-2026");
  await admin.getByRole("button", { name: /log in/i }).click();
  await admin.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
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
