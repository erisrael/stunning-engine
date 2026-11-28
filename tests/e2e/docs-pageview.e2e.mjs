// Documents: the MYSEED official letter template (banner header and footer), the page view (real pages, each with
// its header, footer and number) and a background for one page only.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "docs-pageview");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const a = await ctx.newPage();
  const errors = [];
  a.on("pageerror", (e) => errors.push(e.message));
  await a.goto(`${base}/login`);
  await a.fill("input[name=email]", "admin@demo.local");
  await a.fill("input[name=password]", "Demo-Workflow-2026");
  await a.getByRole("button", { name: /log in/i }).click();
  await a.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });

  await a.goto(`${base}/tools/docs`);
  await a.waitForLoadState("networkidle").catch(() => {});
  await a.getByRole("button", { name: /MYSEED official letter \(English\)/ }).click();
  await a.waitForSelector('[data-hf-preview="header"] .hf-band', { timeout: 15000 });
  const head = await a.locator('[data-hf-preview="header"]').first().innerText();
  check("the MYSEED letter starts on the MYSEED banner", /MYSEED/.test(head) && /EDTECH/.test(head), head);
  check("it has the subject band", (await a.locator('.myseed-rich p[style*="background"]').count()) >= 1);

  // Enough text for a second page.
  await a.locator(".myseed-rich p").last().click();
  await a.keyboard.press("End");
  for (let i = 0; i < 45; i++) await a.keyboard.type(`\nLine ${i + 1} of the letter, to fill the page.`, { delay: 0 });

  await a.getByRole("tab", { name: "Page view" }).click();
  await a.waitForSelector("[data-page-view] .pv-sheet", { timeout: 15000 });
  const sheets = await a.locator("[data-page-view] .pv-sheet").count();
  check("the page view shows the letter on several pages", sheets >= 2, sheets);
  const box = await a.locator("[data-page-view] .pv-sheet").first().boundingBox();
  check("each page is A4", !!box && Math.abs(box.width - 210 * (96 / 25.4)) < 3 && Math.abs(box.height - 297 * (96 / 25.4)) < 3, JSON.stringify(box));
  check("every page has the banner header", (await a.locator("[data-page-view] .pv-sheet .hf-header").count()) === sheets);
  const p2 = await a.locator('[data-page-view] .pv-sheet[data-page="2"]').innerText();
  check("page 2 is numbered", /Page 2(?!\d)/.test(p2), p2.slice(-200));

  // A background for page 2 only.
  await a.click('[data-page-bg="2"]');
  await a.click('[data-bg-swatch="#f0fdf4"]');
  await a.keyboard.press("Escape");
  await a.waitForTimeout(400);
  const bg = async (n) => a.locator(`[data-page-view] .pv-sheet[data-page="${n}"]`).evaluate((el) => getComputedStyle(el).backgroundColor);
  check("page 2 has its own background", (await bg(2)) === "rgb(240, 253, 244)", await bg(2));
  check("page 1 keeps white", (await bg(1)) === "rgb(255, 255, 255)", await bg(1));
  await a.screenshot({ path: path.join(shots, "page-view.png"), fullPage: true });

  const [dl] = await Promise.all([a.waitForEvent("download", { timeout: 30000 }), a.getByRole("button", { name: /Word \(\.docx\)/ }).click()]);
  const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const headers = await Promise.all(Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n)).map((n) => zip.file(n).async("string")));
  check("the Word file has the MYSEED banner", headers.some((x) => x.includes('behindDoc="1"')));
  // The PDF is printed from the same pages.
  const [popup] = await Promise.all([a.waitForEvent("popup", { timeout: 15000 }), a.getByRole("button", { name: /^PDF$/ }).click()]);
  await popup.waitForLoadState("domcontentloaded");
  check("the PDF prints the same pages", (await popup.locator(".pv-sheet").count()) === sheets);
  await popup.close();
  check("no script errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}
console.log(`\n${fails ? `${fails} failed` : "all passed"}`);
if (fails) process.exitCode = 1;
