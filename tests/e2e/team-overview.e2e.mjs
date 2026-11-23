// A Recording team member sees the whole team's overview (Home and its own page in the sidebar) and has no
// Curriculum; the team lead has Curriculum and sees the overview under the desk.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "team-overview");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const signIn = async (email) => {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
};
try {
  const m = await signIn("dawit@demo.local");
  const errors = [];
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto(`${base}/dashboard`);
  check("a Recording member sees the team overview on Home", (await m.locator('[data-team-overview="recording"]').count()) === 1);
  const side = await m.locator("[data-sidebar=sidebar]").first().innerText().catch(() => m.content());
  check("the sidebar has Team overview", /Team overview/.test(side), side.slice(0, 400));
  check("and no Curriculum", !/Curriculum/.test(side));
  await m.goto(`${base}/team-overview`);
  check("the Team overview page shows the whole team", (await m.locator('[data-team-overview="recording"]').count()) === 1 && /Recording team overview/.test(await m.locator("h1").first().innerText()));
  await m.screenshot({ path: path.join(shots, "member.png"), fullPage: true });
  await m.goto(`${base}/curriculum`);
  await m.waitForURL(/\/dashboard/, { timeout: 10000 }).catch(() => {});
  check("Curriculum is closed to a member", /\/dashboard/.test(m.url()), `${m.url()} ${await m.locator("h1").first().innerText().catch(() => "")}`);
  check("no script errors", errors.length === 0, errors.join(" | "));

  const l = await signIn("hana@demo.local");
  await l.goto(`${base}/curriculum`);
  check("the team lead opens Curriculum", /\/curriculum/.test(l.url()), l.url());
} finally {
  await browser.close();
}
console.log(`\n${fails ? `${fails} failed` : "all passed"}`);
if (fails) process.exitCode = 1;
