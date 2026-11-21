// In the browser: Seed Core (five against five with agents and powers): pick an agent, the buy phase and the buy
// menu, a round won when the rivals are down (score, credits, the next round), the core planted on a site, and a
// power used. Screenshots go to test-results/seed-core.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "seed-core");
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
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  await page.goto(`${base}/fun`);
  const win = page.locator("[data-fun-window]");
  await win.locator('[data-fun-tab="games"]').click();
  await win.locator('[data-fun-game="world"]').click();
  await page.waitForFunction(() => !!window.__seedTown, null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  const T = (fn, a) => page.evaluate(fn, a);
  const until = (fn, a, ms = 60000) => page.waitForFunction(fn, a, { timeout: ms, polling: 250 }).then(() => true, () => false);

  // Pick Kestrel and start.
  await T(() => window.__seedTown.cb.open("strike"));
  await win.locator('[data-strike-mode="core"]').click();
  check("Seed Core shows the agents", (await win.locator("[data-core-agent]").count()) === 6);
  await win.locator('[data-core-agent="kestrel"]').click();
  await win.locator("[data-strike-start]").click();
  check("the agent select screen shows", await seen(win.locator("[data-core-select]"), 10000));
  await win.locator("[data-core-lockin]").click();
  check("the round display shows", await seen(win.locator("[data-core-hud]"), 30000));
  const start = await T(() => { const a = window.__seedTown.activity; return { phase: a.core.phase, bots: a.bots.length, mates: a.bots.filter((b) => b.team === 0).length, credits: a.core.credits, agent: a.core.agent, attack: a.core.attack, carrier: a.core.carrier === "me" }; });
  check("five against five, in the buy phase, attacking with the core", start.phase === "buy" && start.bots === 9 && start.mates === 4 && start.attack === 0 && start.carrier, JSON.stringify(start));
  check("Kestrel with the starting credits", start.agent === "kestrel" && start.credits === 800, JSON.stringify(start));

  // Buy: the menu, a Marshal for 800.
  await T(() => window.__seedTown.strikeAct("open-buy"));
  check("the buy menu opens", await seen(win.locator("[data-core-buy]")));
  await win.locator('[data-core-buy-item="revolver"]').click();
  const bought = await T(() => { const a = window.__seedTown.activity; return { primary: a.loadout[0], credits: a.core.credits }; });
  check("a weapon is bought with credits", bought.primary === "revolver" && bought.credits === 0, JSON.stringify(bought));
  await page.screenshot({ path: path.join(shots, "buy.png") });
  await T(() => window.__seedTown.strikeAct("close-buy"));

  // Live: a power (Kestrel's Flare), then the rivals go down: round won.
  await T(() => (window.__seedTown.activity.core.ends = performance.now()));
  check("the round goes live", await until(() => window.__seedTown.activity.core.phase === "live"));
  await T(() => window.__seedTown.strikeAct("q"));
  check("a power uses a charge", (await T(() => window.__seedTown.activity.core.charges.q)) === 1);
  await page.screenshot({ path: path.join(shots, "live.png") });
  await T(() => { const a = window.__seedTown.activity; for (const b of a.bots) if (b.team === 1) a.damageBot(b, 999, false); });
  check("with the rivals down the round is won", await until(() => window.__seedTown.activity.core.score[0] === 1));
  const after = await T(() => window.__seedTown.activity.core.credits);
  check("a win and five kills pay credits", after >= 3000 + 5 * 200, after);
  check("the next round starts with a buy phase", await until(() => { const c = window.__seedTown.activity.core; return c.round === 2 && c.phase === "buy"; }, null, 60000));

  // Plant on A: the rivals blinded (they do not shoot), me on the site holding F.
  await T(() => { const a = window.__seedTown.activity; a.core.ends = performance.now(); });
  await until(() => window.__seedTown.activity.core.phase === "live");
  await T(() => {
    const t = window.__seedTown, a = t.activity;
    for (const b of a.bots) if (b.team === 1) b.blindUntil = Infinity;
    t.teleport(a.origin.x + 30, 0, a.origin.z - 22);
    a.holdF = true;
  });
  check("holding F on a site plants the core", await until(() => window.__seedTown.activity.core.phase === "planted", null, 90000), await T(() => JSON.stringify({ p: window.__seedTown.activity.core.phase, prog: window.__seedTown.activity.core.prog, c: window.__seedTown.activity.core.carrier === "me" })));
  check("the display says where the core is", await seen(win.locator("[data-core-hud]", { hasText: "Core on A" })));
  await page.screenshot({ path: path.join(shots, "planted.png") });
  await T(() => window.__seedTown.stopActivity());
  check("no browser errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  check("flow completed", false, e.message);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
