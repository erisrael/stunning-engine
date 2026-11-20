// In the browser: the production and admin changes (Redo on the member's board and the item page, the recording
// team overview, the Roles and permissions "By role" grid, the Assistant Manager's Home and pages, Everything free and
// the asset library), then Seed Town's city overhaul (streets, districts, the Grand Prix, weather; town folk you can
// talk to, with directions and tasks; driving the Porsche with the gauge; a Grand Prix sprint start; an archery
// shot; a Seed Strike training round; the TV; the performance overlay). Screenshots go to test-results/seed-town-city.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "seed-town-city");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const prep = process.env.PREP_FILE ? JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8")) : {};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, ms = 15000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
const login = async (email) => {
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
};

try {
  // ---------------------------------------------------------------- a Recording member: Redo and the team overview
  const dawit = await login("dawit@demo.local");
  await dawit.goto(`${base}/dashboard`);
  check("the member's board has a Redo column", await seen(dawit.getByText(/^Redo$/)));
  check("the recording team overview is on Home", await seen(dawit.locator('[data-team-overview="recording"]')));
  const redoTile = await dawit.locator('[data-overview-tile="Redo"]').innerText().catch(() => "");
  check("the overview counts the redo", /Redo\s*[1-9]/.test(redoTile), redoTile);
  await dawit.screenshot({ path: path.join(shots, "member-home.png"), fullPage: true });

  // ---------------------------------------------------------------- Admin: the grid, everything free, the asset library
  const admin = await login("admin@demo.local");
  if (prep.part) {
    await admin.goto(`${base}/items/${prep.part}`);
    check("the item page says Redo", await seen(admin.getByText(/^Redo$/)));
  }
  await admin.goto(`${base}/admin?tab=permissions`);
  await admin.locator('[data-perm-mode="role"]').click();
  await admin.locator("[data-perm-grid-role]").selectOption("assistant_manager");
  const cell = (k) => admin.locator(`[data-perm-cell="${k}"]`).getAttribute("data-state");
  check("the Assistant Manager may view production", (await cell("production:v")) === "checked");
  check("but not create or update production", (await cell("production:e")) === "unchecked" && (await cell("production:u")) === "unchecked");
  check("and runs studio sessions and presenters", (await cell("sessions:e")) === "checked" && (await cell("presenters:u")) === "checked" && (await cell("presenters:e")) === "checked");
  await admin.locator('[data-perm-cell="reports:v"]').click();
  check("ticking a box changes the role", (await cell("reports:v")) === "unchecked");
  await admin.screenshot({ path: path.join(shots, "roles-grid.png"), fullPage: true });
  await admin.goto(`${base}/admin?tab=fun`);
  check("Everything free is on by default", (await admin.locator('[data-fun-switch="freeAll"]').getAttribute("data-state")) === "checked");
  const rows = await admin.locator("[data-asset-library] [data-asset]").count().catch(() => 0);
  await admin.locator("[data-asset-library]").scrollIntoViewIfNeeded().catch(() => {});
  await admin.waitForTimeout(1500);
  const rows2 = await admin.locator("[data-asset-library] [data-asset]").count();
  check("the asset library lists every asset with its licence", Math.max(rows, rows2) >= 80, rows2);

  // ---------------------------------------------------------------- the Assistant Manager
  const am = await login("am@demo.local");
  await am.goto(`${base}/dashboard`);
  check("the Assistant Manager's Home is the production overview", await seen(am.getByText(/Production overview|Organization overview|Good (morning|afternoon|evening)/)));
  await am.goto(`${base}/sessions`);
  check("they open studio sessions", !/denied/.test(am.url()) && (await seen(am.getByRole("heading", { name: /Studio sessions/ }))));
  await am.goto(`${base}/presenters`);
  check("they open presenters", !/denied/.test(am.url()));

  // ---------------------------------------------------------------- Seed Town
  const page = admin;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/fun`);
  const win = page.locator("[data-fun-window]");
  await win.locator('[data-fun-tab="games"]').click();
  await win.locator('[data-fun-game="world"]').click();
  check("Seed Town draws", await seen(win.locator("[data-world-canvas] canvas"), 60000));
  await page.waitForFunction(() => !!window.__seedTown, null, { timeout: 60000 });
  await page.waitForTimeout(6000);
  const world = await page.evaluate(() => {
    const t = window.__seedTown;
    t.atmosphere.pinHours = 13;
    t.atmosphere.pinWeather = "clear";
    return { streets: !!t.scene.getObjectByName("streets"), districts: !!t.scene.getObjectByName("districts"), gp: !!t.scene.getObjectByName("grandprix"), sky: !!t.scene.getObjectByName("sky"), folk: t.npcs.filter((n) => n.brain).length, label: t.atmosphere.label() };
  });
  check("the city has its streets, districts, the Grand Prix and a sky", world.streets && world.districts && world.gp && world.sky, world);
  check("town folk live in town", world.folk >= 6, world.folk);
  check("the town has a time and weather", /\d\d:\d\d · Clear/.test(world.label), world.label);
  await page.evaluate(() => { const t = window.__seedTown; t.atmosphere.pinWeather = "rain"; t.atmosphere.wet = 1; });
  await page.waitForTimeout(1500);
  check("rain makes the roads slippery", await page.evaluate(() => window.__seedTown.atmosphere.grip < 0.85));
  await page.evaluate(() => { const t = window.__seedTown; t.atmosphere.pinWeather = "clear"; t.atmosphere.wet = 0; });

  // A conversation: directions and a task.
  await page.evaluate(() => { const t = window.__seedTown; const n = t.npcs.find((x) => x.brain); t.teleport(n.av.root.position.x + 1.4, 0, n.av.root.position.z); t.cb.npc(n.def); });
  check("talking to someone opens the conversation", await seen(win.locator("[data-world-npc]")));
  check("they greet you", await seen(win.locator('[data-npc-line="npc"]'), 20000));
  await win.locator("[data-npc-input]").fill("where is the stadium?");
  await win.locator("[data-npc-send]").click();
  await page.waitForFunction(() => !!window.__seedTown.marker, null, { timeout: 15000 }).catch(() => {});
  check("asking the way puts a marker on the map", await page.evaluate(() => window.__seedTown.marker?.label === "the stadium"));
  await win.locator('[data-npc-option="task"]').click();
  await page.waitForFunction(() => window.__seedTown.quests.size > 0, null, { timeout: 20000 }).catch(() => {});
  check("they give you a task", await page.evaluate(() => window.__seedTown.quests.size > 0));
  await page.screenshot({ path: path.join(shots, "conversation.png") });
  await win.getByRole("button", { name: "Bye" }).click().catch(() => {});

  // Driving the Porsche.
  await page.evaluate(() => { const t = window.__seedTown; t.data.ride = { key: "car.gt911", paint: "#c0c0c0" }; t.teleport(4, 0, 50); t.spawnCar(4, 50, 0); t.enterCar(); t.keys.add("w"); });
  await page.waitForFunction(() => Math.abs(window.__seedTown.car.c.speed) * 3.6 > 20, null, { timeout: 30000 }).catch(() => {});
  const drive = await page.evaluate(() => { const t = window.__seedTown; t.keys.delete("w"); return { kmh: Math.round(Math.abs(t.car.c.speed) * 3.6), gear: t.car.st?.gear, rpm: Math.round(t.car.st?.rpm ?? 0) }; });
  check("the Porsche drives with real gears", drive.kmh > 20 && drive.gear >= 1 && drive.rpm > 900, drive);
  check("the gauge shows the gear and revs", await seen(win.locator("[data-world-gauge]")));
  await page.evaluate(() => window.__seedTown.interact?.());

  // A Grand Prix sprint start.
  await page.evaluate(() => { const t = window.__seedTown; t.teleport(214, 0, -127); t.cb.open("gp"); });
  await win.locator('[data-gp-mode="sprint"]').click();
  await win.locator("[data-gp-start]").click();
  check("the race display shows", await seen(win.locator("[data-gp-hud]"), 30000));
  await page.waitForFunction(() => window.__seedTown.activity?.st?.phase === "racing", null, { timeout: 40000 }).catch(() => {});
  check("the lights go out and the race starts", await page.evaluate(() => window.__seedTown.activity?.st?.phase === "racing"));
  check("AI drivers are on track", await page.evaluate(() => window.__seedTown.activity.bots.length >= 5));
  await page.screenshot({ path: path.join(shots, "grand-prix.png") });
  await page.evaluate(() => window.__seedTown.stopActivity());

  // Archery: a shot on the field.
  await page.evaluate(() => window.__seedTown.cb.open("activity", { kind: "archery" }));
  await win.locator('[data-archery-mode="classic"]').click();
  await win.locator("[data-archery-start]").click();
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const a = window.__seedTown.activity; a.move({ x: 0, y: 0.012 }); a.down(); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__seedTown.activity.up());
  await page.waitForFunction(() => window.__seedTown.activity?.arrows?.some((a) => !a.flying), null, { timeout: 20000 }).catch(() => {});
  const shot = await page.evaluate(() => { const a = window.__seedTown.activity; return { shots: a.shots, score: a.score }; });
  check("an arrow flies and lands", shot.shots === 1, shot);
  await page.screenshot({ path: path.join(shots, "archery.png") });
  await page.evaluate(() => window.__seedTown.stopActivity());

  // Seed Strike: a training round.
  await page.evaluate(() => window.__seedTown.cb.open("strike"));
  await win.locator('[data-strike-mode="training"]').click();
  await win.locator("[data-strike-start]").click();
  check("Seed Strike shows its display", await seen(win.locator("[data-strike-hud]"), 30000));
  check("bots and targets are in the map", await page.evaluate(() => window.__seedTown.activity.bots.length >= 2 && window.__seedTown.activity.targets.length >= 4));
  await page.evaluate(() => { const a = window.__seedTown.activity; a.trigger = true; a.fire(); a.trigger = false; });
  check("the gun fires", await page.evaluate(() => window.__seedTown.activity.shots === 1));
  await page.screenshot({ path: path.join(shots, "strike.png") });
  await page.evaluate(() => window.__seedTown.stopActivity());

  // The TV and the overlay.
  await page.evaluate(() => window.__seedTown.cb.open("tv"));
  check("the TV lists channels", await seen(win.locator("[data-tv-channel]")));
  await page.keyboard.press("Escape").catch(() => {});
  await page.keyboard.press("F3");
  check("F3 shows the frame rate", await seen(win.locator("[data-world-perf]"), 8000));
  check("no browser errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  check("flow completed", false, e.message);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
