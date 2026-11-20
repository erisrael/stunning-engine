// In the browser: Seed Town (walls stop you, doors let you in, stairs and the elevator take you up, town folk talk,
// vehicles drive, the shop sells, homes are decorated, the designer saves, the map travels, archery scores, voice
// rooms open, town chat), the richer games (snake modes, bigger boards and levels), the 3D pet (food dragged on it,
// roaming the screen) and the YouTube player inside the app.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "seed-town");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, ms = 15000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);
const until = (page, fn, arg, ms = 10000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, permissions: ["microphone"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${e.message} ${(e.stack ?? "").split(/\n/).slice(0, 3).join(" ")}`));
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
  check("the town is ready", await until(page, () => !!window.__seedTown, null, 30000));
  await page.waitForTimeout(800);
  const T = (fn, arg) => page.evaluate(fn, arg);
  // Walk north from a spot until `done` holds, or until the person has stopped moving (a wall), at most `ms`.
  const walk = async (x, y, z, ms, done = ["z", -1, -1e9]) => {
    await T(([x, y, z]) => { const t = window.__seedTown; t.teleport(x, y, z); t.yaw = 0; t.keys.add("w"); window.__last = [t.body.z, performance.now()]; }, [x, y, z]);
    await page.waitForFunction((done) => {
      const t = window.__seedTown, b = t.body;
      const [axis, sign, v] = done;
      if (sign * b[axis] > sign * v) return true;
      if (Math.abs(b.z - window.__last[0]) > 0.02) window.__last = [b.z, performance.now()];
      return performance.now() - window.__last[1] > 1500;
    }, done, { timeout: ms, polling: 100 }).catch(() => {});
    return T(() => { const t = window.__seedTown; t.keys.delete("w"); return { x: t.body.x, y: t.body.y, z: t.body.z }; });
  };

  // ------------------------------------------------------------ walls, doors, stairs, the elevator
  let p = await walk(10, 0, -40.5, 30000, ["z", -1, -45]);
  check("glass walls stop people walking through", p.z > -44.6 && p.z < -43.4, JSON.stringify(p));
  p = await walk(0, 0, -40.5, 30000, ["z", -1, -46]);
  check("the office door lets people in", p.z < -46, JSON.stringify(p));
  check("inside, the place shows the office floor", await seen(win.locator("[data-world-where]", { hasText: /Office · ground floor/ })));
  p = await walk(-23.75, 0, -49.2, 40000, ["y", 1, 3]);
  check("the stairs take people up a floor", p.y > 3, JSON.stringify(p));
  await T(() => window.__seedTown.teleport(20, 0, -52.4));
  check("at the elevator: choose a floor", await seen(win.locator("[data-world-prompt]", { hasText: /Elevator/ })));
  await win.locator("[data-world-prompt]").click();
  check("the floor picker opens", await seen(win.locator("[data-world-elevator]")));
  await win.locator('[data-floor="2"]').click();
  // The cabin moves in game time; the software renderer the tests use draws the city at a few frames a second.
  check("the elevator cabin goes up to the second floor", await until(page, () => window.__seedTown.city.elevator.y === 9, null, 60000));
  await T(() => window.__seedTown.elevator(0));
  await until(page, () => window.__seedTown.city.elevator.y === 0, null, 60000);
  await page.waitForTimeout(1500);
  await T(() => window.__seedTown.teleport(20, 0, -56));
  await T(() => window.__seedTown.elevator(1));
  check("riding the elevator takes me to the first floor", await until(page, () => Math.abs(window.__seedTown.body.y - 4.5) < 0.1, null, 60000));
  await page.screenshot({ path: path.join(shots, "office.png") });

  // ------------------------------------------------------------ town folk
  await T(() => window.__seedTown.teleport(9, 0, -46));
  check("walking up to someone offers a chat", await seen(win.locator("[data-world-prompt]", { hasText: /Talk to/ })));
  await win.locator("[data-world-prompt]").click();
  check("they talk", await seen(win.locator("[data-world-npc]")));
  await win.locator("[data-world-npc]").getByRole("button", { name: "Bye" }).click();

  // ------------------------------------------------------------ vehicles
  await T(() => { const t = window.__seedTown; t.teleport(0, 0, 24); t.yaw = 0; t.heading = Math.PI; t.callRide(); });
  check("calling the vehicle brings it", await until(page, () => !!window.__seedTown.car));
  await T(() => window.__seedTown.interact());
  check("getting in", await until(page, () => window.__seedTown.car?.driving === true));
  const c0 = await T(() => ({ x: window.__seedTown.car.c.x, z: window.__seedTown.car.c.z }));
  await T(() => window.__seedTown.keys.add("w"));
  check("it drives, with a speedometer", await seen(win.locator("[data-world-speed]")));
  await until(page, ([x, z]) => Math.hypot(window.__seedTown.car.c.x - x, window.__seedTown.car.c.z - z) > 6, [c0.x, c0.z], 30000);
  const c1 = await T(() => { const t = window.__seedTown; t.keys.delete("w"); return { x: t.car.c.x, z: t.car.c.z }; });
  check("the vehicle moved", Math.hypot(c1.x - c0.x, c1.z - c0.z) > 3, JSON.stringify([c0, c1]));
  // Straight at the office: the car stops at the glass.
  await T(() => { const t = window.__seedTown; t.car.c.x = 10; t.car.c.z = -38; t.car.c.heading = Math.PI; t.car.c.speed = 0; t.keys.add("s"); });
  await page.waitForTimeout(400);
  await T(() => { const t = window.__seedTown; t.keys.delete("s"); t.car.c.x = 10; t.car.c.z = -38; t.car.c.speed = 0; t.keys.add("w"); });
  // Full throttle at the glass for a good while: it must stop at the wall.
  await until(page, () => window.__seedTown.car.c.z < -45, null, 12000);
  const c2 = await T(() => { const t = window.__seedTown; t.keys.delete("w"); return t.car.c.z; });
  check("vehicles cannot drive through buildings", c2 > -44.5, c2);
  await T(() => window.__seedTown.interact());
  check("getting out", await until(page, () => window.__seedTown.car?.driving === false));
  await page.screenshot({ path: path.join(shots, "drive.png") });

  // ------------------------------------------------------------ the shop, my things, home, garage
  await win.locator("[data-world-shop]").click();
  await win.locator('[data-shop-tabs] button', { hasText: "Nest Home" }).click();
  await win.locator('[data-shop-item="furn.plant"]').click();
  await win.locator("[data-shop-buy]").click();
  check("buying from the shop", await seen(page.getByText(/Bought Potted plant/)));
  await win.locator("[data-world-inv]").click();
  await win.locator('[data-inv-cat="furniture"]').click();
  check("bought things are in my things", await seen(win.locator('[data-inv-item="furn.plant"]')));
  await win.locator('[data-inv-item="furn.plant"]').getByRole("button").click();
  check("placing opens the home decorator", await seen(win.locator("[data-home-grid]")));
  await win.locator('[data-home-furn="furn.plant"]').click();
  await win.locator("[data-home-grid] button[aria-label='Cell 12, 2']").click();
  await win.locator("[data-home-save]").click();
  check("the home is saved with the new plant", await seen(page.getByText("Home saved")));
  await win.locator("[data-world-panel]").getByRole("button", { name: "Close" }).click();

  // ------------------------------------------------------------ the designer
  await win.locator("[data-world-dress]").click();
  await win.locator("[data-studio-preview] canvas").waitFor();
  await page.waitForTimeout(400);
  await win.locator("[data-studio-preview]").screenshot({ path: path.join(shots, "character-front.png") });
  await win.locator('[data-studio-tab="body"]').click();
  await win.locator('[data-studio-slider="height"]').evaluate((el) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "0.5");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await win.locator('[data-studio-tab="characters"]').click();
  await win.locator('[data-studio-item="avatar.mei"]').click();
  await win.locator('[data-studio-tab="hair"]').click();
  await win.locator('[data-studio-tint="hair"]').click();
  await win.locator('[data-studio-pose="dance"]').click();
  await page.screenshot({ path: path.join(shots, "designer.png") });
  await win.locator("[data-world-save-look]").click();
  check("the designer saves a new look", await seen(page.getByText("Looking good!")));

  // ------------------------------------------------------------ the map, archery
  await win.locator("[data-world-mapbtn]").click();
  await win.locator("[data-world-panel]").getByRole("button", { name: "Park", exact: true }).click();
  check("the map travels to the park", await seen(win.locator("[data-world-where]", { hasText: "Park" })));
  await T(() => window.__seedTown.teleport(-99.5, 0, -23));
  check("the archery range", await seen(win.locator("[data-world-prompt]", { hasText: /archery/ })));
  // The range opens the archery setup (modes and bows); the round is played on the field.
  await win.locator("[data-world-prompt]").click();
  await win.locator('[data-archery-mode="practice"]').click();
  await win.locator("[data-archery-start]").click();
  check("a round starts on the archery field", await until(page, () => window.__seedTown.activity?.kind === "archery", null, 20000));
  await page.waitForTimeout(1500);
  const cv = await win.locator("[data-world-canvas] canvas").boundingBox();
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1300);
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
  check("holding and letting go shoots arrows", await until(page, () => (window.__seedTown.activity?.shots ?? 0) >= 2, null, 20000), await T(() => window.__seedTown.activity?.shots));
  await page.screenshot({ path: path.join(shots, "archery.png") });
  await T(() => window.__seedTown.stopActivity());

  // ------------------------------------------------------------ chat and voice
  await win.locator("[data-world-chat]").getByRole("button", { name: "Town" }).click();
  await win.locator("[data-world-say]").fill("Hello town");
  await win.locator("[data-world-say]").press("Enter");
  check("town chat shows the message", await seen(win.locator("[data-world-chat]").getByText("Hello town")));
  await win.locator("[data-world-voice-btn]").click();
  await win.locator('[data-voice-mode="near"]').click();
  check("voice turns on with a mute button", await seen(win.locator("[data-voice-mute]")));
  await win.locator("[data-world-voice]").getByLabel("Room name").fill("Design crew");
  await win.locator("[data-world-voice]").getByRole("button", { name: "Make the room" }).click();
  const roomOk = await seen(win.locator("[data-world-voice]").getByText("Design crew").first(), 20000);
  check("a voice room opens", roomOk, await T(() => JSON.stringify({ rooms: window.__seedTown.rooms, state: window.__seedTown.voiceState, q: window.__seedTown.outQueue })));
  await win.locator('[data-voice-mode="off"]').click();

  // ------------------------------------------------------------ settings rebuild the town
  await win.locator("[data-world-settings-btn]").click();
  await win.locator('[data-gfx-preset="low"]').click();
  check("low graphics rebuild the town", await until(page, () => !!document.querySelector("[data-world-canvas] canvas") && !!window.__seedTown, null, 20000));
  await win.getByRole("button", { name: "Back to the games" }).click();

  // ------------------------------------------------------------ the games
  await win.locator('[data-fun-game="snake"]').click();
  await win.locator('[data-snake-mode="maze"]').click();
  await win.locator("[data-snake-start]").click();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);
  await win.locator('[data-game="snake"] canvas').press(" ");
  check("snake plays its maze campaign", await seen(win.locator('[data-game="snake"]').getByText(/\/15/)));
  check("snake pauses", await seen(win.locator('[data-game="snake"]').getByText("Paused")));
  await win.getByRole("button", { name: "Back to the games" }).click();
  await win.locator('[data-fun-game="2048"]').click();
  await win.locator('[data-game="2048"]').getByRole("radio", { name: "5x5" }).click();
  check("2048 plays on a bigger board", await until(page, () => document.querySelectorAll('[data-game="2048"] [aria-label^="2048 board"] .aspect-square').length === 25));
  await win.getByRole("button", { name: "Back to the games" }).click();
  await win.locator('[data-fun-game="minesweeper"]').click();
  await win.locator('[data-game="minesweeper"]').getByRole("radio", { name: "Expert" }).click();
  check("minesweeper has an expert field", await until(page, () => document.querySelectorAll('[data-game="minesweeper"] button[aria-label="Hidden"]').length === 480));
  await win.getByRole("button", { name: "Back to the games" }).click();
  await win.locator('[data-fun-game="tictactoe"]').click();
  await win.locator('[data-game="tictactoe"]').getByRole("radio", { name: /five in a row/ }).click();
  await win.locator('[data-game="tictactoe"] button[aria-label="Square 41"]').click();
  check("five in a row on 9x9 against the computer", await until(page, () => document.querySelectorAll('[data-game="tictactoe"] button[aria-label="X"], [data-game="tictactoe"] button[aria-label="O"]').length === 2));
  await win.getByRole("button", { name: "Back to the games" }).click();
  await win.locator('[data-fun-game="memory"]').click();
  await win.locator('[data-game="memory"]').getByRole("radio", { name: "30 cards" }).click();
  check("memory has a hard board", await until(page, () => document.querySelectorAll('[data-game="memory"] button[aria-label="Hidden card"]').length === 30));
  await win.getByRole("button", { name: "Back to the games" }).click();
  await win.locator('[data-fun-game="reaction"]').click();
  await win.locator('[data-game="reaction"]').getByRole("radio", { name: "Aim trainer" }).click();
  for (let i = 0; i < 20; i++) await win.locator('[data-aim] button[aria-label="Target"]').click();
  check("the aim trainer times twenty targets", await seen(win.locator("[data-aim]").getByText(/ms a target/)));
  await win.getByRole("button", { name: "Back to the games" }).click();

  // ------------------------------------------------------------ the 3D pet
  await win.locator('[data-fun-tab="pet"]').click();
  await win.locator("[data-fun-adopt], [data-fun-pet]").first().waitFor({ timeout: 20000 });
  if (await win.locator("[data-fun-adopt]").isVisible().catch(() => false)) {
    await win.getByLabel("Pet's name").fill("Kiki");
    await win.getByRole("button", { name: "Adopt" }).click();
  }
  check("the pet stands in 3D", await seen(win.locator("[data-fun-pet] [data-pet-stage] canvas"), 20000));
  await win.locator('[data-pet-thing="water"]').dragTo(win.locator("[data-pet-stage]"));
  check("dropping water on the pet cares for it", await seen(page.getByText(/^\+\d+ care points for/), 10000));
  await win.locator("[data-pet-roam]").click();
  check("the pet roams the screen", await seen(page.locator("[data-pet-roaming] canvas"), 15000));
  await page.screenshot({ path: path.join(shots, "pet.png") });

  // ------------------------------------------------------------ YouTube inside the app
  await win.locator('[data-fun-tab="focus"]').click();
  if (await win.locator("[data-focus-quiz]").isVisible().catch(() => false)) {
    for (let i = 0; i < 4; i++) await win.locator("[data-focus-quiz] button").first().click();
    await win.getByRole("button", { name: "That's me" }).click();
  }
  await win.locator("[data-focus-yt]").first().click();
  check("YouTube plays in the app's own player", await seen(page.locator('[data-youtube-dock="big"]')));
  check("with the official embedded player", await seen(page.locator("[data-youtube-player] iframe"), 20000));
  await page.locator("[data-youtube-size]").click();
  check("the player shrinks to a mini player and keeps going", await seen(page.locator('[data-youtube-dock="mini"]')));
  await page.screenshot({ path: path.join(shots, "youtube.png") });

  check("no browser errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  check("flow completed", false, e.message);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
