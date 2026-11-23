// UI styles in the browser (each in Light and Dark, following the accent), Fun mode (music, games, chess,
// sudoku, the pet, the boost tab), the assistant's new commands, and Admin's Fun mode switches.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "fun-and-styles");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, ms = 10000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);
const STYLES = ["studio", "zen", "classic", "sakura", "sunset", "tactical", "comic", "terminal"];

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });

  // ------------------------------------------------------------ UI styles
  await page.goto(`${base}/preferences`);
  await page.locator("[data-ui-style-picker]").waitFor({ timeout: 20000 });
  check("every style is offered", (await page.locator("[data-ui-style]").count()) === STYLES.length);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const look = {};
  for (const s of STYLES) {
    await page.locator(`[data-ui-style="${s}"]`).click();
    await page.waitForFunction((k) => document.documentElement.dataset.style === k, s);
    await page.evaluate(() => (document.documentElement.classList.remove("dark"), document.documentElement.classList.add("light")));
    await page.waitForTimeout(150);
    const light = await bg();
    await page.goto(`${base}/dashboard`);
    await page.evaluate(() => (document.documentElement.classList.remove("light"), document.documentElement.classList.add("light")));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(shots, `${s}-light.png`) });
    await page.evaluate(() => (document.documentElement.classList.remove("light"), document.documentElement.classList.add("dark")));
    await page.waitForTimeout(400);
    const dark = await bg();
    await page.screenshot({ path: path.join(shots, `${s}-dark.png`) });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    look[s] = { light, dark, style: await page.evaluate(() => document.documentElement.dataset.style) };
    await page.goto(`${base}/preferences`);
    await page.locator("[data-ui-style-picker]").waitFor();
  }
  check("the chosen style stays after moving between pages", Object.entries(look).every(([k, v]) => v.style === k), JSON.stringify(look));
  check("each style has its own Light and Dark", STYLES.filter((s) => s !== "studio").every((s) => look[s].light !== look[s].dark), JSON.stringify(look));
  check("the styles look different from each other", new Set(STYLES.map((s) => look[s].light)).size >= 6, JSON.stringify(look));
  await page.locator('[data-ui-style="comic"]').click();
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
  await page.evaluate(() => { const a = JSON.parse(localStorage.getItem("myseed.appearance") || "{}"); a.accent = "green"; localStorage.setItem("myseed.appearance", JSON.stringify(a)); });
  await page.reload();
  const accent2 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
  check("the accent colour applies inside a style", accent !== accent2 && (await page.evaluate(() => document.documentElement.dataset.style)) === "comic", `${accent} ${accent2}`);

  // ------------------------------------------------------------ Fun mode
  await page.goto(`${base}/dashboard`);
  await page.locator("[data-fun-launcher]").click();
  const win = page.locator("[data-fun-window]");
  check("Fun mode opens as a side window", await seen(win));
  const tracks = win.locator("[data-fun-tracks] [data-track]");
  const gotMusic = await seen(tracks.first(), 25000);
  check("music: trending songs load (free, from Audius)", gotMusic);
  if (gotMusic) {
    await tracks.first().click();
    check("a song plays in the player", await seen(win.locator("[data-now-playing]")));
    await page.screenshot({ path: path.join(shots, "fun-music.png") });
    await win.getByRole("tab", { name: "Playlists" }).click();
    await win.getByLabel("New playlist name").fill("Focus mix");
    await win.getByRole("button", { name: "Make" }).click();
    check("a playlist is made", await seen(win.getByText("Focus mix").first()));
  }
  await win.locator('[data-fun-tab="games"]').click();
  check("the games are listed", (await win.locator("[data-fun-game]").count()) >= 10);
  await win.locator('[data-fun-game="2048"]').click();
  const board = win.locator('[data-game="2048"] [aria-label^="2048 board"]');
  await board.waitFor();
  await board.focus();
  for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) await page.keyboard.press(k);
  check("2048 plays with the arrow keys", (await win.locator('[data-game="2048"] .bg-\\[\\#cdc1b4\\]').count()) < 15);
  await win.getByRole("button", { name: "Back to the games" }).click();

  await win.locator('[data-fun-game="chess"]').click();
  const sq = (s) => win.locator(`[data-game="chess"] [data-square="${s}"]`);
  check("the chessboard shows", await seen(sq("e2"), 20000));
  await sq("e2").click();
  await sq("e4").click();
  check("a move is made and the computer answers", await page.waitForFunction(() => /Moves: e4 \S+/.test(document.querySelector('[data-game="chess"]')?.textContent ?? ""), null, { timeout: 20000 }).then(() => true, () => false));
  await page.screenshot({ path: path.join(shots, "fun-chess.png") });
  await win.getByRole("button", { name: "Back to the games" }).click();

  await win.locator('[data-fun-game="chess-learn"]').click();
  const lsq = (s) => win.locator(`[data-game="chess-learn"] [data-square="${s}"]`);
  await seen(lsq("d4"), 20000);
  await lsq("d4").click();
  await lsq("d8").click();
  check("a chess lesson checks the move", await seen(win.locator("[data-chess-msg]").filter({ hasText: "Well done" })));
  await win.getByRole("button", { name: "Back to the games" }).click();

  await win.locator('[data-fun-game="sudoku"]').click();
  check("sudoku has 81 squares", await page.waitForFunction(() => document.querySelectorAll('[data-game="sudoku"] [aria-label^="Row "]').length === 81, null, { timeout: 15000 }).then(() => true, () => false));
  await page.screenshot({ path: path.join(shots, "fun-sudoku.png") });
  await win.getByRole("button", { name: "Back to the games" }).click();

  await win.locator('[data-fun-tab="pet"]').click();
  await win.locator("[data-fun-adopt]").waitFor({ timeout: 15000 });
  await win.getByLabel("Pet's name").fill("Kuku");
  await win.getByRole("button", { name: "Adopt" }).click();
  check("a pet is adopted", await seen(win.locator("[data-fun-pet]")));
  await page.screenshot({ path: path.join(shots, "fun-pet.png") });
  await win.locator('[data-fun-tab="boost"]').click();
  await win.getByRole("button", { name: "Mood 4 of 5" }).click();
  check("the mood check-in shows the team's spread", await seen(win.getByText(/Team today/)));
  await page.screenshot({ path: path.join(shots, "fun-boost.png") });
  await win.getByRole("button", { name: "Close Fun mode" }).click();
  check("music keeps playing in the small player with the window closed", !gotMusic || (await seen(page.locator("[data-fun-mini]"))));

  // ------------------------------------------------------------ the assistant
  const ask = async (text) => {
    if (!(await page.getByLabel("Ask the assistant").isVisible().catch(() => false))) await page.getByRole("button", { name: "Open the assistant" }).click();
    await page.getByLabel("Ask the assistant").fill(text);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
  };
  await ask("switch to tactical style");
  check("the assistant changes the UI style", await page.waitForFunction(() => document.documentElement.dataset.style === "tactical", null, { timeout: 5000 }).then(() => true, () => false));
  await ask("dark mode");
  check("and the mode", await page.waitForFunction(() => document.documentElement.classList.contains("dark"), null, { timeout: 5000 }).then(() => true, () => false));
  await page.screenshot({ path: path.join(shots, "assistant-tactical-dark.png") });
  await ask("let's play sudoku");
  check("the assistant opens a game", await seen(page.locator('[data-fun-window] [data-game="sudoku"]')));
  await page.locator("[data-fun-window]").getByRole("button", { name: "Close Fun mode" }).click();
  await ask("what can I say");
  check("the assistant lists the voice commands", await seen(page.getByText(/Hey Seed/).first()));

  // ------------------------------------------------------------ Admin
  await page.goto(`${base}/admin?tab=fun`);
  await page.locator("[data-fun-admin]").first().waitFor({ timeout: 20000 });
  await page.locator('[data-fun-switch="pet"]').first().click();
  await page.locator("[data-fun-save]").first().click();
  await page.getByText("Fun mode saved").waitFor();
  await page.reload();
  await page.locator("[data-fun-launcher]").click();
  await page.locator('[data-fun-window] [data-fun-tab="music"]').waitFor();
  check("Admin switches the pet off", (await page.locator('[data-fun-window] [data-fun-tab="pet"]').count()) === 0);
  check("no browser errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  check("fun and styles flow completed", false, e.message);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
