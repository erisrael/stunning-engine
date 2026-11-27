// Taking a role opens its impact page (not a modal), with finish-first and a confirmed forced change; the person
// is asked to finish on a page of their own. Documents: header and footer designer, cover page and page numbering.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "role-impact-docs");
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
  const a = await signIn("admin@demo.local");
  const errors = [];
  a.on("pageerror", (e) => errors.push(e.message));
  await a.goto(`${base}/admin/role-change/dawit?remove=recording`);
  await a.waitForSelector("[data-role-impact]", { timeout: 20000 });
  const text = await a.locator("[data-app-main]").innerText();
  check("the impact page names the person and the role", /Dawit/.test(text) && /Recording/.test(text));
  check("it shows the rights and pages they lose", /Rights and pages they lose/.test(text));
  check("it offers finish first and a forced change", (await a.locator("[data-role-finish]").count()) === 1 && (await a.locator("[data-role-force]").count()) === 1);
  await a.screenshot({ path: path.join(shots, "impact.png"), fullPage: true });
  // A forced change asks for the typed name before it goes through.
  await a.click("[data-role-force]");
  await a.waitForSelector("[data-role-confirm]");
  const confirmBtn = a.getByRole("alertdialog").getByRole("button", { name: /Take the roles|Force and forward/ });
  check("the forced change waits for the typed name", await confirmBtn.isDisabled());
  await a.keyboard.press("Escape");

  const m = await signIn("dawit@demo.local");
  await m.goto(`${base}/role-change`);
  check("the person's own role change page opens", /Your role changes/.test(await m.locator("h1").first().innerText()));

  // Documents: the header and footer designer, a cover page and numbering.
  await a.goto(`${base}/tools/docs`);
  await a.getByRole("button", { name: /^Report/ }).first().click();
  await a.waitForSelector("[data-open-hf]", { timeout: 15000 });
  await a.click("[data-open-hf]");
  await a.click('[data-hf-source="custom"]');
  check("the designer has fields to add", (await a.locator("[data-hf-field]").count()) >= 5);
  await a.click("[data-hf-apply]");
  check("the page shows the designed header", (await a.locator('[data-hf-preview="header"]').count()) >= 1);
  await a.click("[data-open-cover]");
  await a.click('[data-cover-style="band"]');
  await a.click("[data-cover-apply]");
  check("the cover page shows before the first page", (await a.locator("[data-cover-preview]").count()) === 1);
  await a.click("[data-open-numbering]");
  check("numbering shows cover, front matter and main pages", /Cover page[\s\S]*Front matter[\s\S]*Main pages/.test(await a.locator("[data-numbering-strip]").innerText()));
  await a.screenshot({ path: path.join(shots, "numbering.png") });
  await a.keyboard.press("Escape");
  const [dl] = await Promise.all([a.waitForEvent("download", { timeout: 20000 }), a.getByRole("button", { name: /Word \(\.docx\)/ }).click()]);
  check("the Word file downloads", /\.docx$/.test(dl.suggestedFilename()) && fs.readFileSync(await dl.path()).subarray(0, 2).toString() === "PK", dl.suggestedFilename());
  check("no script errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}
console.log(`\n${fails ? `${fails} failed` : "all passed"}`);
if (fails) process.exitCode = 1;
