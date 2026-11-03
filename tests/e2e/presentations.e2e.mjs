// Phase 24 in the browser: the company deck in a template's colours, switching templates, writing a slide by hand,
// downloading the branded PowerPoint (opened and checked), and Admin importing a template from a .pptx file.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import Pptx from "pptxgenjs";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "presentations");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, t = 15000) => loc.waitFor({ timeout: t }).then(() => true, () => false);

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("no page error", false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  await page.goto(`${base}/present`);
  const deck = page.locator("[data-deck]");
  check("the deck opens in the Myseed template", await seen(deck) && (await deck.getAttribute("data-deck-template")) === "myseed");
  await page.getByRole("button", { name: "Deck" }).click();
  await page.locator("[data-template-pick]").selectOption("international");
  check("another template is chosen", (await deck.getAttribute("data-deck-template")) === "international");
  await page.screenshot({ path: path.join(shots, "1-international.png") });
  await page.locator("[data-template-pick]").selectOption("myseed");

  // A slide written by hand.
  await page.locator("[data-write-slide]").click();
  await page.locator("[data-slide-writer]").getByRole("button", { name: "Bullet points" }).click();
  await page.getByLabel("Slide title").fill("Our three goals");
  await page.getByLabel("Slide text").fill("More videos\nBetter quality\nFaster uploads");
  await page.locator("[data-add-slide]").click();
  check("the slide joins the deck", await seen(page.locator('[data-custom-slide]').filter({ hasText: "Our three goals" }), 5000));
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press("Escape");
  for (let n = 0; n < 60 && !(await page.locator('[data-slide-kind="bullets"]').count()); n++) await page.keyboard.press("ArrowLeft");
  check("it shows as bullets", await seen(page.locator('[data-slide-kind="bullets"]'), 5000) && /Better quality/.test(await page.locator("[data-slide]").innerText()));
  await page.screenshot({ path: path.join(shots, "2-written-slide.png") });

  // The branded PowerPoint.
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.locator("[data-export-pptx]").click()]);
  const file = path.join(shots, "deck.pptx");
  await dl.saveAs(file);
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  check("the PowerPoint has a cover, agenda, sections, slides and a closing slide", slideFiles.length >= 6, slideFiles.length);
  const all = (await Promise.all(slideFiles.map((f) => zip.file(f).async("string")))).join(" ");
  check("in the template's colours", /0B7A3B/.test(all) && /F9AB00/i.test(all));
  check("with the written slide and the closing", /Our three goals/.test(all) && /Thank you/.test(all));
  check("charts are editable charts", Object.keys(zip.files).some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)));

  // Admin imports a template from a .pptx.
  const p = new Pptx();
  p.addSlide().addText("Partner", { x: 1, y: 1, w: 3, h: 1 });
  const pptx = path.join(shots, "partner.pptx");
  fs.writeFileSync(pptx, await p.write({ outputType: "nodebuffer" }));
  await page.goto(`${base}/admin?tab=presentations`);
  check("Admin sees the templates", await seen(page.locator("[data-templates-admin]")) && (await page.locator("[data-template]").count()) >= 5);
  await page.locator("[data-template-file]").setInputFiles(pptx);
  check("a PowerPoint template is imported", await seen(page.locator("[data-template]").filter({ hasText: "from partner.pptx" }), 15000));
  await page.locator("[data-template]").filter({ hasText: "from partner.pptx" }).getByRole("button", { name: "Make default" }).click();
  check("and made the default", await seen(page.locator("[data-template]").filter({ hasText: "from partner.pptx" }).getByText("Default"), 10000));
  await page.screenshot({ path: path.join(shots, "3-templates-admin.png"), fullPage: true });
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
