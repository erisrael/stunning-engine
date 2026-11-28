// Documents: a Word letterhead (banner header and footer) opened in Documents keeps its header and footer: shown on
// the page as a full-width banner, and put back unchanged in the Word file made from it. The built-in MYSEED
// banner can be chosen in the designer.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "docs-letterhead");
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
  a.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 300)));
  await a.goto(`${base}/login`);
  await a.fill("input[name=email]", "admin@demo.local");
  await a.fill("input[name=password]", "Demo-Workflow-2026");
  await a.getByRole("button", { name: /log in/i }).click();
  await a.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });

  await a.goto(`${base}/tools/docs`);
  // The page's scripts must be running before a file is picked.
  await a.waitForLoadState("networkidle").catch(() => {});
  await a.waitForTimeout(1500);
  await a.locator('input[type=file][accept*=".dotx"]').first().setInputFiles(path.join(here, "..", "fixtures", "myseed-letterhead.docx"));
  await a.waitForSelector('[data-file-hf="document"]', { timeout: 20000 }).catch(async (e) => {
    console.log("toasts:", await a.locator("[data-sonner-toast]").allInnerTexts().catch(() => []));
    await a.screenshot({ path: path.join(shots, "no-prompt.png") });
    throw e;
  });
  check("opening the letterhead asks which header and footer to use", true);
  await a.screenshot({ path: path.join(shots, "ask.png") });
  await a.click('[data-file-hf="document"]');
  await a.waitForSelector('[data-hf-preview="header"] .hf-band', { timeout: 10000 });
  const band = await a.locator('[data-hf-preview="header"] .hf-band').first().boundingBox();
  const page = await a.locator('[data-hf-preview="header"]').first().evaluate((el) => el.closest("[class*=bg-white]")?.getBoundingClientRect().width ?? 0);
  check("the file's header shows as a full-width banner", !!band && band.width >= page - 2 && band.height > 60, JSON.stringify({ band, page }));
  check("the footer banner shows too", (await a.locator('[data-hf-preview="footer"] .hf-band').count()) === 1);
  check("the subject band keeps its fill and border in the editor", (await a.locator('.myseed-rich p[style*="background"][style*="border-left"]').count()) >= 1);
  await a.screenshot({ path: path.join(shots, "page.png") });

  const [dl] = await Promise.all([a.waitForEvent("download", { timeout: 30000 }), a.getByRole("button", { name: /Word \(\.docx\)/ }).click()]);
  const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const headers = await Promise.all(Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n)).map((n) => zip.file(n).async("string")));
  check("the Word file has the letterhead's own header back", headers.some((x) => x.includes("<pic:pic") && !x.includes("@@RAW")));
  check("its pictures came with it", Object.keys(zip.files).some((n) => /^word\/media\/hf_header_/.test(n)) && Object.keys(zip.files).some((n) => /^word\/media\/hf_footer_/.test(n)));
  const types = await zip.file("[Content_Types].xml").async("string");
  check("the picture type is declared", /Extension="png"/i.test(types));

  // A full letter: its table keeps the header colour.
  a.on("dialog", (d) => d.accept());
  await a.locator('input[type=file][accept*=".dotx"]').first().setInputFiles(path.join(here, "..", "fixtures", "myseed-letter.docx"));
  await a.waitForSelector('[data-file-hf="document"]', { timeout: 20000 });
  await a.click('[data-file-hf="document"]');
  await a.waitForSelector(".myseed-rich table", { timeout: 10000 });
  const th = await a.locator(".myseed-rich table th").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  check("the letter's table keeps its green header", th === "rgb(31, 107, 58)", th);
  await a.screenshot({ path: path.join(shots, "letter.png"), fullPage: true });

  // The built-in MYSEED banner in the designer.
  await a.click("[data-open-hf]");
  await a.click('[data-hf-source="custom"]');
  await a.locator('select[aria-label="Start from a ready-made one"]').selectOption("myseed");
  await a.click("[data-hf-apply]");
  await a.waitForTimeout(500);
  const txt = await a.locator('[data-hf-preview="header"]').first().innerText();
  check("the MYSEED banner shows the company and its contacts", /MYSEED/.test(txt) && /EDTECH/.test(txt), txt);
  await a.screenshot({ path: path.join(shots, "myseed-banner.png") });
  const [dl2] = await Promise.all([a.waitForEvent("download", { timeout: 30000 }), a.getByRole("button", { name: /Word \(\.docx\)/ }).click()]);
  const z2 = await JSZip.loadAsync(fs.readFileSync(await dl2.path()));
  const h2 = await Promise.all(Object.keys(z2.files).filter((n) => /^word\/header\d*\.xml$/.test(n)).map((n) => z2.file(n).async("string")));
  check("the banner goes into Word as a picture behind the text", h2.some((x) => x.includes('behindDoc="1"')));
  check("no script errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}
console.log(`\n${fails ? `${fails} failed` : "all passed"}`);
if (fails) process.exitCode = 1;
