// In the browser: a game against the bot in chat, two people playing each other, Seed Town 3D (walk, dress up,
// chat), focus mode with its persona quiz, the installed Fun app (/fun), and the comic click effect.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "fun-more");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, ms = 15000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);
const login = async (email, viewport = { width: 1360, height: 900 }) => {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
};

try {
  const page = await login("admin@demo.local");
  const errors = [];
  globalThis.__errors = errors;
  page.on("pageerror", (e) => errors.push(`${e.message} ${(e.stack ?? "").split(/\n/).slice(0, 3).join(" ")}`));

  // ------------------------------------------------------------ chat games
  await page.goto(`${base}/chat?g=${prep.group}`);
  await page.locator("[data-chat-games]").click();
  await page.locator('[data-chat-game="tictactoe"]').click();
  await page.locator('[data-opponent="bot"]').click();
  await page.locator("[data-chat-game-start]").click();
  const card = page.locator('[data-game-card="tictactoe"]').last();
  check("a tic-tac-toe board appears in the chat", await seen(card));
  await card.locator('[data-ttt="4"]').click();
  check("the bot answers the move", await page.waitForFunction(() => [...document.querySelectorAll('[data-game-card="tictactoe"]')].at(-1)?.querySelectorAll("[data-ttt]:disabled").length >= 2, null, { timeout: 15000 }).then(() => true, () => false));
  await page.screenshot({ path: path.join(shots, "chat-ttt.png") });

  // Two people: Admin challenges Dawit to rock paper scissors.
  await page.locator("[data-chat-games]").click();
  await page.locator('[data-chat-game="rps"]').click();
  await page.getByRole("button", { name: prep.dawitName, exact: true }).click();
  await page.locator("[data-chat-game-start]").click();
  const rps = page.locator('[data-game-card="rps"]').last();
  await rps.waitFor();
  await rps.locator('[data-rps="rock"]').click();
  const dawit = await login("dawit@demo.local");
  await dawit.goto(`${base}/chat?g=${prep.group}`);
  const rps2 = dawit.locator('[data-game-card="rps"]').last();
  check("the challenged colleague sees the game", await seen(rps2));
  await rps2.locator('[data-rps="paper"]').click();
  check("both picks resolve the round for both sides", await seen(page.locator('[data-game-card="rps"]').last().getByText(/0 : 1/), 15000));
  await dawit.close();

  // ------------------------------------------------------------ Seed Town 3D
  await page.goto(`${base}/dashboard`);
  await page.locator("[data-fun-launcher]").click();
  const win = page.locator("[data-fun-window]");
  await win.locator('[data-fun-tab="games"]').click();
  await win.locator('[data-fun-game="world"]').click();
  check("Seed Town draws a 3D world", await seen(win.locator("[data-world-canvas] canvas"), 25000));
  const canvas = win.locator("[data-world-canvas] canvas");
  await canvas.click({ position: { x: 50, y: 300 } });
  await page.keyboard.down("w");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  await win.locator("[data-world-say]").fill("Hello from the plaza");
  await win.locator("[data-world-say]").press("Enter");
  await win.locator("[data-world-people]").click();
  check("who is where, by status", await seen(win.locator("[data-world-panel]")));
  await win.locator("[data-world-dress]").click();
  await win.locator("[data-world-dressup]").getByRole("button", { name: /Crown/ }).click();
  await win.locator("[data-world-save-look]").click();
  check("the character look is saved", await seen(page.getByText("Looking good!")));
  await page.screenshot({ path: path.join(shots, "seed-town.png") });
  await win.getByRole("button", { name: "Back to the games" }).click();

  // ------------------------------------------------------------ focus mode
  await win.locator('[data-fun-tab="focus"]').click();
  check("focus mode starts with the persona quiz", await seen(win.locator("[data-focus-quiz]")));
  for (let i = 0; i < 4; i++) await win.locator("[data-focus-quiz] button").first().click();
  await win.getByRole("button", { name: "That's me" }).click();
  await win.locator("[data-focus-start]").click();
  check("a focus session runs with the timer on top", await seen(page.locator("[data-focus-pill]")));
  await page.screenshot({ path: path.join(shots, "focus.png") });
  await page.locator("[data-focus-pill]").getByRole("button", { name: "Stop" }).click();

  // ------------------------------------------------------------ the comic click effect
  await page.evaluate(() => (document.documentElement.dataset.style = "comic"));
  const link = page.locator("[data-sidebar=sidebar] a").first();
  const bx = await link.boundingBox();
  await page.mouse.move(bx.x + 10, bx.y + bx.height / 2);
  await page.mouse.down();
  check("comic style pops a POW on click", await page.waitForFunction(() => !!document.querySelector(".fx-comic"), null, { timeout: 3000 }).then(() => true, () => false));
  await page.mouse.up();

  // ------------------------------------------------------------ the installed app
  const app = await (await browser.newContext({ viewport: { width: 400, height: 800 } })).newPage();
  await app.goto(`${base}/fun`);
  check("the Fun app asks for sign-in", /\/login/.test(app.url()));
  await page.goto(`${base}/fun`);
  check("signed in, the Fun app opens on its own page", await seen(page.locator("[data-fun-app] [data-fun-window]")));
  check("it can be installed (manifest)", (await page.locator('link[rel="manifest"]').getAttribute("href")) === "/fun.webmanifest");
  await page.screenshot({ path: path.join(shots, "fun-app.png") });
  check("no browser errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  check("flow completed", false, e.message);
  if (globalThis.__errors?.length) console.error("BROWSER ERRORS", globalThis.__errors);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
