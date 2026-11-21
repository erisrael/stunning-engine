// In the browser: football with real physics (a kick moves the ball, a goal counts on the scoreboard, penalties
// against a keeper), Seed Circuit, several pets, Admin's 3D town editor with an uploaded model, two people in town
// who see each other and talk by voice, and a phone with the touch joystick.
import { chromium, devices } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "seed-town-play");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, ms = 15000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);
const until = (page, fn, arg, ms = 15000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
const errors = [];
async function login(email, ctxOpts = { viewport: { width: 1360, height: 900 } }) {
  const page = await (await browser.newContext({ ...ctxOpts, permissions: ["microphone"] })).newPage();
  page.on("pageerror", (e) => errors.push(`${email}: ${e.message}`));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
}
async function openTown(page) {
  await page.goto(`${base}/fun`);
  const win = page.locator("[data-fun-window]");
  await win.locator('[data-fun-tab="games"]').click();
  await win.locator('[data-fun-game="world"]').click();
  await win.locator("[data-world-canvas] canvas").waitFor({ timeout: 30000 });
  await until(page, () => !!window.__seedTown, null, 30000);
  return win;
}
const tinyGlb = () => {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [0] }], nodes: [{ name: "box" }], scene: 0 }).padEnd(80, " "));
  const out = Buffer.alloc(20 + json.length);
  out.write("glTF", 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12);
  out.write("JSON", 16);
  json.copy(out, 20);
  return out;
};

try {
  const page = await login("admin@demo.local");
  const win = await openTown(page);
  const T = (fn, arg) => page.evaluate(fn, arg);

  // ------------------------------------------------------------ football
  await T(() => { const t = window.__seedTown; t.teleport(183.5, 0, 60); t.heading = Math.PI / 2; });
  check("the football physics loads near the stadium", await until(page, () => !!window.__seedTown.soccer, null, 30000));
  await T(() => window.__seedTown.soccer.setState({ x: 184.2, y: 0.22, z: 60, vx: 0, vy: 0, vz: 0 }));
  await page.waitForTimeout(400);
  check("with the ball at my feet I can kick it", await seen(win.locator("[data-world-prompt]", { hasText: /Kick the ball/ })));
  const b0 = await T(() => window.__seedTown.soccer.pos.x);
  await T(() => window.__seedTown.kickBall(true));
  check("a kick sends the ball flying (real physics)", await until(page, (x0) => window.__seedTown.soccer.pos.x > x0 + 4, b0, 15000));
  // Straight into the east goal: Gold scores.
  await T(() => { const t = window.__seedTown; t.teleport(205, 0, 60); t.heading = Math.PI / 2; t.soccer.setState({ x: 205.8, y: 0.22, z: 60, vx: 0, vy: 0, vz: 0 }); });
  await page.waitForTimeout(300);
  await T(() => window.__seedTown.kickBall(false));
  check("a goal counts on the scoreboard", await until(page, () => window.__seedTown.score.gold >= 1, null, 20000));
  await page.screenshot({ path: path.join(shots, "football.png") });
  await T(() => window.__seedTown.startActivity("penalty", 1));
  check("penalties against a goalkeeper", await seen(win.locator("[data-world-hud]", { hasText: "Penalties" }), 20000));
  const cv = await win.locator("[data-world-canvas] canvas").boundingBox();
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(cv.x + cv.width * (i % 2 ? 0.3 : 0.7), cv.y + cv.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    await page.waitForTimeout(3200);
  }
  check("five penalties finish the round", await seen(page.getByText(/goals from 5 penalties/), 20000));
  await page.screenshot({ path: path.join(shots, "penalty.png") });

  // ------------------------------------------------------------ the circuit
  await T(() => window.__seedTown.stopActivity());
  await T(() => window.__seedTown.startActivity("circuit", 1));
  check("Seed Circuit: three laps in my vehicle", await seen(win.locator("[data-world-hud]", { hasText: /Seed Circuit · lap 1 of 3/ }), 20000));
  check("I am driving at the start line", await T(() => window.__seedTown.car?.driving === true));
  await page.screenshot({ path: path.join(shots, "circuit.png") });
  await T(() => window.__seedTown.stopActivity());
  await win.getByRole("button", { name: "Back to the games" }).click();

  // ------------------------------------------------------------ several pets
  await win.locator('[data-fun-tab="pet"]').click();
  await win.locator("[data-fun-adopt], [data-fun-pet]").first().waitFor({ timeout: 20000 });
  if (await win.locator("[data-fun-adopt]").isVisible().catch(() => false)) {
    await win.getByLabel("Pet's name").fill("Kiki");
    await win.getByRole("button", { name: "Adopt" }).click();
    await win.locator("[data-fun-pet]").waitFor();
  }
  await win.locator("[data-pet-adopt-more]").click();
  await win.getByLabel("Pet's name").fill("Bolt");
  await win.getByRole("button", { name: "Adopt" }).click();
  check("a second pet comes home; the first rests", await seen(win.locator('[data-pet-switch="Kiki"]')));
  await win.locator('[data-pet-switch="Kiki"]').click();
  check("switching brings the first pet back out", await seen(win.locator('[data-pet-switch="Bolt"]')));

  // ------------------------------------------------------------ Admin's 3D town editor with an uploaded model
  await page.goto(`${base}/admin?tab=fun`);
  const ed = page.locator("[data-fun-town-editor]");
  await ed.scrollIntoViewIfNeeded();
  check("the town editor shows the town in 3D", await seen(ed.locator("[data-town-3d] canvas"), 30000));
  await ed.locator("[data-town-upload]").setInputFiles({ name: "statue.glb", mimeType: "model/gltf-binary", buffer: tinyGlb() });
  check("a model uploads", await seen(page.getByText("statue uploaded"), 60000));
  const v = await ed.locator("[data-town-3d]").boundingBox();
  await page.mouse.click(v.x + v.width / 2, v.y + v.height / 2);
  check("clicking the 3D town places it", await seen(ed.getByText(/1 things placed/)));
  await ed.locator("[data-town-save]").click({ timeout: 90000 });
  check("the town is published", await seen(page.getByText("Town published")));
  await page.screenshot({ path: path.join(shots, "editor.png") });

  // ------------------------------------------------------------ two people in town, talking by voice
  await openTown(page);
  const dawit = await login("dawit@demo.local");
  await openTown(dawit);
  await T(() => window.__seedTown.teleport(0, 0, 14));
  await dawit.evaluate(() => window.__seedTown.teleport(2, 0, 14));
  check("each sees the other in town", await until(page, () => [...window.__seedTown.people.values()].some((p) => p.live), null, 20000) && (await until(dawit, () => [...window.__seedTown.people.values()].some((p) => p.live), null, 20000)));
  await T(() => window.__seedTown.setVoice("near"));
  await dawit.evaluate(() => window.__seedTown.setVoice("near"));
  check("nearby voice connects the two browsers", await until(page, () => window.__seedTown.voice.status().some((s) => s.state === "connected"), null, 60000), await T(() => JSON.stringify(window.__seedTown.voice.status())));
  await page.screenshot({ path: path.join(shots, "two-people.png") });
  await dawit.close();

  // ------------------------------------------------------------ a phone
  const phone = await login("admin@demo.local", { ...devices["Pixel 7"] });
  const pw = await openTown(phone);
  check("phones get the joystick", await seen(pw.locator("[data-world-joystick]")));
  const p0 = await phone.evaluate(() => { const t = window.__seedTown; t.teleport(0, 0, 30); t.yaw = 0; return t.body.z; });
  const j = await pw.locator("[data-world-joystick]").boundingBox();
  await phone.touchscreen.tap(j.x + j.width / 2, j.y + 4);
  await phone.evaluate(() => window.__seedTown.setJoy(0, -1));
  check("pushing the joystick walks", await until(phone, (z0) => window.__seedTown.body.z < z0 - 2, p0, 20000));
  await phone.evaluate(() => window.__seedTown.setJoy(0, 0));
  await phone.screenshot({ path: path.join(shots, "phone.png") });
  check("no browser errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  check("flow completed", false, e.message);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
