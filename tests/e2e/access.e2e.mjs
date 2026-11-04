// A plain team member (Dawit, Recording) opens every main page of the app, and asks the AI assistant for things
// they may not do. Pages they cannot open send them home or say so; nothing shows "This page could not load".
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "access");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const PAGES = ["/dashboard", "/attendance", "/approvals", "/profile?tab=leave", "/profile?tab=pay", "/notifications", "/chat", "/email", "/requests", "/people", "/sessions", "/overview", "/profile/help", "/admin", "/admin/platform", "/admin/assistant", "/admin/data", "/hr", "/finance", "/dev", "/dev/board", "/dev/analyze", "/marketing", "/studio", "/handovers", "/coverage", "/reports", "/calendar", "/company", "/present", "/strategy", "/performance", "/recognition", "/support", "/team", "/team?tab=analyze", "/owners", "/settings", "/audit", "/import-export", "/assign", "/checklists", "/content", "/pipeline", "/sheet", "/questions", "/routines", "/announcements", "/items/new", "/d/nothing-here"];

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "dawit@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  for (const p of PAGES) {
    const res = await page.goto(`${base}${p}`);
    await page.waitForLoadState("load");
    await page.waitForTimeout(400);
    const broken = await page.getByText("This page could not load").count();
    check(`${p} is safe for a member`, !broken && (res?.status() ?? 200) < 500, `status ${res?.status()} at ${page.url()}`);
    if (broken) await page.screenshot({ path: path.join(shots, `${p.replace(/[/?=]/g, "_")}.png`) });
  }
  check("no script errors", errors.length === 0, errors.join(" | "));

  // The assistant, asked for things outside the member's role.
  await page.goto(`${base}/dashboard`);
  await page.keyboard.press("Alt+KeyA");
  const ask = async (t) => {
    await page.getByLabel("Ask the assistant").fill(t);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.locator("[data-assistant-thinking]").waitFor({ state: "detached", timeout: 20000 }).catch(() => null);
    await page.waitForTimeout(300);
  };
  for (const t of ["tool:team_insights {\"department\":\"dev\"}", "tool:open_page {\"href\":\"/admin\",\"label\":\"Admin\"}", "tool:propose {\"kind\":\"decide_leave\",\"args\":{\"request_id\":\"x\",\"decision\":\"approve\"}}", "how is my team in dev", "where is finance"]) {
    await ask(t);
    check(`the assistant stays up after "${t.slice(0, 40)}"`, (await page.getByRole("dialog", { name: "Assistant" }).count()) === 1 && !(await page.getByText("This page could not load").count()));
  }
  check("it never offers Admin to a member", !(await page.getByRole("button", { name: "Open Admin" }).count()));
  check("still no script errors", errors.length === 0, errors.join(" | "));

  // View as someone with two roles, then switch their role.
  const adm = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  const admErrors = [];
  adm.on("pageerror", (e) => admErrors.push(e.message));
  await adm.goto(`${base}/login`);
  await adm.fill("input[name=email]", "admin@demo.local");
  await adm.fill("input[name=password]", "Demo-Workflow-2026");
  await adm.getByRole("button", { name: /log in/i }).click();
  await adm.waitForURL(/dashboard/, { timeout: 30000 });
  await adm.goto(`${base}/admin/preview`);
  await adm.getByLabel("Search people").fill("Two Roles");
  await adm.getByRole("button", { name: "View as" }).first().click();
  await adm.waitForURL(/dashboard/, { timeout: 20000 });
  const sw = adm.getByLabel("Active role");
  check("View as shows the person's role switcher", await sw.waitFor({ timeout: 10000 }).then(() => true, () => false));
  const before = await sw.innerText();
  await sw.click();
  await adm.getByRole("option", { name: before.includes("Editing") ? "Uploading" : "Editing" }).click();
  await adm.waitForTimeout(2500);
  check("switching their role keeps the site up", !(await adm.getByText("This page could not load").count()) && !(await adm.getByText(/Application error/).count()));
  check("and shows the other role", (await adm.getByLabel("Active role").innerText()) !== before, `${before} -> ${await adm.getByLabel("Active role").innerText()}`);
  check("still in View as", (await adm.getByText(/Viewing as|View as/).count()) > 0);
  check("no script errors in View as", admErrors.length === 0, admErrors.join(" | "));
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
