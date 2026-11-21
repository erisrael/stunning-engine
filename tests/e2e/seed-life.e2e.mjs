// In the browser: life in Seed Town and the game modes' menus. Home: cook, eat, a bath, the radio, the game console
// (its menu and a game), the dog; town folk: a high five and a fist fight to a knock-out; the Grand Prix on another
// circuit with GT cars; a free kick; Esc pauses a mode (the menu, Exit); the HQ campus and its sky deck; Seed
// Strike's pause menu and crosshair; the steady frame rate. Screenshots go to test-results/seed-life.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "seed-life");
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
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60000 });
  await page.goto(`${base}/fun`);
  const win = page.locator("[data-fun-window]");
  await win.locator('[data-fun-tab="games"]').click();
  await win.locator('[data-fun-game="world"]').click();
  await page.waitForFunction(() => !!window.__seedTown, null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  // Midday (town folk are out and about), clear weather.
  await page.evaluate(() => { const t = window.__seedTown; t.atmosphere.pinHours = 12; t.atmosphere.pinWeather = "clear"; for (const n of t.npcs) if (n.brain) n.brain.nextDecide = 0; });
  const T = (fn, a) => page.evaluate(fn, a);
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms, polling: 250 }).then(() => true, () => false);
  // Walk up to a thing by its kind (anywhere: town or a home) and press E.
  const useKind = async (kind, near) =>
    T(([k, n]) => {
      const t = window.__seedTown;
      const all = [...t.city.interacts, ...[...t.homeInteracts.values()].flat()];
      const list = all.filter((i) => i.kind === k);
      list.sort((a, b) => Math.hypot(a.x - (n?.x ?? t.body.x), a.z - (n?.z ?? t.body.z)) - Math.hypot(b.x - (n?.x ?? t.body.x), b.z - (n?.z ?? t.body.z)));
      const i = list[0];
      if (!i) return false;
      t.teleport(i.x, i.y ?? 0, i.z);
      return { x: i.x, z: i.z, label: i.label };
    }, [kind, near]);
  const pressE = async () => {
    await page.waitForTimeout(700);
    await T(() => window.__seedTown.interact());
    await page.waitForTimeout(500);
  };

  // ------------------------------------------------------------ home life
  const myHome = await T(() => { const t = window.__seedTown; const d = t.city.homeDoors.get(t.data.meId); return d ? { x: d.x, z: d.z } : null; });
  check("I have a home", !!myHome);
  const cook = await useKind("cook", myHome);
  check("the starter home has a kitchen", !!cook, JSON.stringify(cook));
  await pressE();
  check("cooking a meal", await T(() => window.__seedTown.meal === true));
  await useKind("dine", myHome);
  await pressE();
  check("eating it at the table", await T(() => window.__seedTown.meal === false && !!window.__seedTown.sit));
  await T(() => window.__seedTown.stand());
  await useKind("bath", myHome);
  await pressE();
  check("a bath", await T(() => !!window.__seedTown.sit));
  await T(() => window.__seedTown.stand());
  await useKind("radio", myHome);
  await pressE();
  check("the radio switches on", await T(() => window.__seedTown.radio === true));
  await pressE();
  check("and off", await T(() => window.__seedTown.radio === false));
  await useKind("pet", myHome);
  await pressE();
  check("the dog comes when called", await T(() => !!window.__seedTown.homeLive.get(window.__seedTown.data.meId)));
  await useKind("console", myHome);
  await pressE();
  check("the game console shows its games", await seen(page.locator("[data-console-menu]")));
  await page.screenshot({ path: path.join(shots, "console.png") });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  check("Enter starts the chosen game", (await seen(page.locator('[data-arcade-screen="2048"]'))) && (await page.locator("[data-console-menu]").count()) === 0);
  await page.keyboard.press("Escape");
  check("Esc goes back to the console menu", await seen(page.locator("[data-console-menu]")));
  await page.keyboard.press("Escape");
  check("and Esc again turns it off", (await page.locator("[data-arcade-screen]").count()) === 0);
  await useKind("sleep", myHome);
  await pressE();
  check("sleeping darkens the screen", await seen(win.locator("[data-world-sleep]"), 5000));
  check("and you wake up", await until(() => !document.querySelector("[data-world-sleep]"), null, 20000));
  await page.screenshot({ path: path.join(shots, "home.png") });

  // ------------------------------------------------------------ town folk
  await until(() => window.__seedTown.npcs.some((n) => n.brain && n.brain.doing !== "home"), null, 30000);
  const who = await T(() => {
    const t = window.__seedTown;
    const n = t.npcs.find((x) => x.brain && x.brain.doing !== "home") ?? t.npcs.find((x) => x.brain);
    t.teleport(n.brain.body.x + 1.2, 0, n.brain.body.z);
    return n.def.id;
  });
  await page.waitForTimeout(500);
  await T((id) => window.__seedTown.socialWith(id, "highfive"), who);
  check("a high five", await T((id) => window.__seedTown.npcs.find((n) => n.def.id === id).brain.social?.emote === "highfive", who));
  await T((id) => window.__seedTown.socialWith(id, "fight"), who);
  check("a fight shows both health bars", await seen(win.locator("[data-world-fight]"), 8000));
  // Punch until they go down (face them each time).
  let ko = false;
  for (let i = 0; i < 30 && !ko; i++) {
    ko = await T((id) => {
      const t = window.__seedTown;
      const n = t.npcs.find((x) => x.def.id === id).brain;
      t.heading = Math.atan2(n.body.x - t.body.x, n.body.z - t.body.z);
      if (Math.hypot(n.body.x - t.body.x, n.body.z - t.body.z) > 1.5) t.teleport(n.body.x - Math.sin(t.heading) * 1.1, 0, n.body.z - Math.cos(t.heading) * 1.1);
      t.punch();
      return !!n.fight && n.fight.koUntil > Date.now();
    }, who);
    await page.waitForTimeout(450);
  }
  check("punches knock them out", ko);
  await page.screenshot({ path: path.join(shots, "fight.png") });
  await T(() => { const t = window.__seedTown; for (const n of t.npcs) if (n.brain) n.brain.fight = null; t.teleport(0, 0, 12); });

  // ------------------------------------------------------------ Grand Prix: another circuit, GT cars, pause menu
  await T(() => window.__seedTown.cb.open("gp"));
  await win.locator('[data-gp-circuit="harbour"]').click({ timeout: 90000 });
  await win.locator('[data-gp-class="gt"]').click({ timeout: 90000 });
  await win.locator('[data-gp-mode="sprint"]').click({ timeout: 90000 });
  await win.locator("[data-gp-start]").click({ timeout: 90000 });
  check("the Harbour circuit is built", await until(() => window.__seedTown.scene.getObjectByName("grandprix")?.userData.circuit === "harbour", null, 20000));
  check("GT cars on the grid", await until(() => window.__seedTown.activity?.kind === "gp" && window.__seedTown.activity.bots.length > 0, null, 20000));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(shots, "gp-harbour.png") });
  await page.keyboard.press("Escape");
  check("Esc pauses the race with its menu", await seen(win.locator("[data-world-pause]"), 30000) && (await T(() => window.__seedTown.paused === true)));
  check("the menu has the driving settings", await seen(win.locator("[data-pause-manual]"), 20000));
  await page.screenshot({ path: path.join(shots, "pause.png") });
  await win.locator("[data-pause-exit]").click({ timeout: 90000 });
  check("Exit to town ends the session", await until(() => !window.__seedTown.activity && !window.__seedTown.paused, null, 10000));
  // Back to the usual circuit.
  await T(() => window.__seedTown.startActivity("gp", 1, { mode: "practice", difficulty: "amateur", opponents: 0, compound: "medium", circuit: "park" }));
  check("and back to the Seed Park Circuit", await until(() => window.__seedTown.scene.getObjectByName("grandprix")?.userData.circuit === "park", null, 20000));
  await T(() => window.__seedTown.stopActivity());

  // ------------------------------------------------------------ football: a free kick
  await T(() => window.__seedTown.cb.open("activity", { kind: "penalty" }));
  check("the football panel lists free kicks", await seen(win.locator('[data-freekick-level="1"]')));
  await win.locator('[data-freekick-level="1"]').click();
  check("a free kick with a wall", await until(() => window.__seedTown.activity?.kind === "freekick", null, 30000));
  await page.waitForTimeout(1500);
  const cv = await win.locator("[data-world-canvas] canvas").boundingBox();
  // Below the challenge's display (it sits at the top of the screen).
  await page.mouse.move(cv.x + cv.width * 0.5, cv.y + cv.height * 0.62);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, "freekick.png") });
  check("the ball is struck", await T(() => { const v = window.__seedTown.soccer.state(); return Math.hypot(v.vx, v.vz) > 3 || v.x < 175; }));
  await T(() => window.__seedTown.stopActivity());

  // ------------------------------------------------------------ football: a five-a-side match
  await T(() => window.__seedTown.startActivity("match", 1));
  check("a five-a-side match with nine bots", await until(() => window.__seedTown.activity?.kind === "match" && window.__seedTown.activity.bots.length === 9, null, 30000));
  check("the match display shows the score and clock", await seen(win.locator("[data-world-hud]", { hasText: /Five-a-side/ }), 20000));
  await page.waitForTimeout(4000);
  check("the bots move", await T(() => window.__seedTown.activity.bots.some((b) => Math.hypot(b.x - b.home.x, b.z - b.home.z) > 0.5)));
  await page.screenshot({ path: path.join(shots, "match.png") });
  await T(() => window.__seedTown.stopActivity());

  // ------------------------------------------------------------ the HQ campus and its sky deck
  await T(() => window.__seedTown.teleport(38, 0, -200));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(shots, "hq-lobby.png") });
  await useKind("skydeck", { x: 36, z: -208 });
  await pressE();
  check("the elevator goes up to the sky deck", await until(() => window.__seedTown.body.y > 80, null, 8000), await T(() => window.__seedTown.body.y));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "skydeck.png") });
  await T(() => window.__seedTown.teleport(0, 0, 12));

  // ------------------------------------------------------------ Seed Strike: pause menu and crosshair
  await T(() => window.__seedTown.cb.open("strike"));
  await win.locator('[data-strike-mode="training"]').click();
  await win.locator("[data-strike-start]").click();
  check("Seed Strike starts", await seen(win.locator("[data-strike-hud]"), 30000));
  check("the crosshair has four lines", (await win.locator("[data-strike-crosshair] span").count()) >= 4);
  await T(() => window.__seedTown.strikeAct("pause"));
  check("the pause menu has sensitivity and the crosshair", await seen(win.locator("[data-strike-pause]"), 5000) && (await win.locator("[data-strike-sens]").count()) === 1);
  await page.screenshot({ path: path.join(shots, "strike-pause.png") });
  await win.locator("[data-strike-sens]").fill("1.5");
  check("sensitivity is saved", await T(() => JSON.parse(localStorage.getItem("myseed.world.gfx") ?? "{}").sens === 1.5));
  await win.locator("[data-strike-leave]").click();
  check("Leave the match", await until(() => !window.__seedTown.activity, null, 10000));

  // ------------------------------------------------------------ settings
  check("the steady frame rate is on by default", await T(() => window.__seedTown.gfx.steady !== false && window.__seedTown.renderScale > 0));
  await page.keyboard.press("F1");
  check("F1 shows the controls", await seen(win.locator("[data-world-controls]"), 5000));
  check("no browser errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  check("flow completed", false, e.message);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
