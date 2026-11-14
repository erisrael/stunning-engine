// Update 1.1 knowledge base in the browser: a how-to guide written with step videos (a bad link refused, a good
// one checked with its title), filters, a CSV imported after its preview, bulk publish/move/delete, the export, and
// the guide as customers see it on the help center (thumbnail, then the player) and in the support widget.
import { chromium } from "playwright-core";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-1-kb");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const GOOD = "dQw4w9WgXcQ";
const PRIVATE = "aaaaaaaaaaa";

// YouTube's oEmbed, faked (the server is started with YOUTUBE_OEMBED_BASE pointing here).
const yt = http.createServer((req, res) => {
  const v = new URL(decodeURIComponent(new URL(req.url, "http://x").searchParams.get("url") ?? "")).searchParams.get("v");
  if (v === PRIVATE) return void res.writeHead(404).end("Not Found");
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ title: `Video ${v}` }));
});
await new Promise((r) => yt.listen(47393, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const seen = (loc, t = 12000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const gone = (loc, t = 12000) => loc.first().waitFor({ state: "detached", timeout: t }).then(() => true, () => false);
const toast = (page, re) => seen(page.locator("[data-sonner-toast]").filter({ hasText: re }));
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  await page.goto(`${base}/support?tab=kb`);
  check("the knowledge base lists articles and drafts", await seen(page.locator("[data-article='Reset your password']")) && (await seen(page.locator("[data-article='Old exam dates']").filter({ hasText: "draft" }))));

  // A how-to guide with step videos.
  await page.getByRole("button", { name: "New guide" }).click();
  const form = page.locator("[data-article-form=guide]");
  await form.getByLabel("Article title").fill("How to pay with telebirr");
  await form.getByLabel("Category").fill("Payments");
  await form.getByLabel("Introduction").fill("Pay your fees from your phone in **two minutes**.");
  await form.getByLabel("Step 1 title").fill("Open Payments");
  await form.getByLabel("Step 1 text").fill("Press the wallet at the bottom.");
  await form.getByLabel("Step 1 video").fill(`https://youtu.be/${PRIVATE}`);
  await form.locator("[data-video-input='Step 1 video']").getByRole("button", { name: "Check" }).click();
  check("a private video is refused with the reason", await seen(form.getByText(/private/)));
  await form.getByLabel("Step 1 video").fill(`https://www.youtube.com/watch?v=${GOOD}`);
  await form.locator("[data-video-input='Step 1 video']").getByRole("button", { name: "Check" }).click();
  check("a good video shows its thumbnail and title", await seen(form.locator(`[data-video-ok='${GOOD}']`).filter({ hasText: `Video ${GOOD}` })));
  await form.getByLabel("Step 2 title").fill("Confirm on telebirr");
  await form.getByRole("button", { name: "Add step" }).click();
  await form.getByLabel("Step 3 title").fill("Keep the receipt");
  await form.getByRole("button", { name: "Move step 3 up" }).click();
  check("steps can be reordered", (await form.getByLabel("Step 2 title").inputValue()) === "Keep the receipt");
  await form.getByRole("button", { name: "Move step 2 down" }).click();
  await form.getByRole("checkbox").check();
  await page.screenshot({ path: path.join(shots, "1-guide-editor.png"), fullPage: true });
  await form.getByRole("button", { name: "Save guide" }).click();
  check("the guide is saved", await toast(page, /Guide saved/));
  const row = page.locator("[data-article='How to pay with telebirr']");
  check("it is listed as a guide with its steps and video", await seen(row.filter({ hasText: "guide · 3 steps" }).filter({ hasText: "video" })));

  // Filters.
  await page.getByLabel("Kind").selectOption("guide");
  await page.waitForURL(/kind=guide/);
  check("the kind filter shows only guides", (await seen(row)) && (await page.locator("[data-article='Reset your password']").count()) === 0);
  await page.getByRole("link", { name: "Clear" }).click();
  await page.waitForURL((u) => !u.search.includes("kind="));
  await page.getByLabel("Search articles").fill("exam");
  await page.getByLabel("Search articles").press("Enter");
  await page.waitForURL(/q=exam/);
  check("search finds the draft", (await seen(page.locator("[data-article='Old exam dates']"))) && (await page.locator("[data-article]").count()) === 1);
  await page.goto(`${base}/support?tab=kb`);

  // Import a CSV: preview first, then import.
  const csv = ["title,body,category,published,step1,step1_video,step2", `"Change your school","Ask your school office.",Account,yes,,,`, `"Install the app",,Getting started,yes,"Open the store: Search MySeed",https://youtu.be/${GOOD},Install it`, `,"no title",Account,yes,,,`].join("\n");
  await page.getByLabel("Import file").setInputFiles({ name: "kb.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Preview" }).click();
  const res = page.locator("[data-import-result=preview]");
  check("the preview shows what would happen", await seen(res.filter({ hasText: "2 new, 0 updated, 1 skipped" })));
  check("the skipped row says why", await seen(res.locator("[data-import-line=skip]").filter({ hasText: /title/i })));
  check("nothing is saved by the preview", (await page.locator("[data-article='Change your school']").count()) === 0);
  await page.screenshot({ path: path.join(shots, "2-import-preview.png"), fullPage: true });
  await page.locator("[data-import-go]").click();
  check("the import runs", await toast(page, /Imported: 2 new, 0 updated, 1 skipped/));
  check("imported articles and guides are listed", (await seen(page.locator("[data-article='Change your school']"))) && (await seen(page.locator("[data-article='Install the app']").filter({ hasText: "guide · 2 steps" }))));

  // Bulk actions.
  await page.getByLabel("Choose Change your school").check();
  await page.getByLabel("Choose Old exam dates").check();
  check("the bulk bar counts the chosen", await seen(page.locator("[data-bulk-bar]").filter({ hasText: "2 chosen" })));
  await page.locator("[data-bulk-bar]").getByRole("button", { name: "Publish", exact: true }).click();
  check("publish many", (await toast(page, /2 articles published/)) && (await gone(page.locator("[data-article='Old exam dates']").filter({ hasText: "draft" }))));
  await page.getByLabel("Choose Change your school").check();
  await page.getByLabel("Choose Install the app").check();
  await page.getByLabel("Move to category").fill("Help");
  await page.locator("[data-bulk-bar]").getByRole("button", { name: "Move" }).click();
  check("move many to a category", (await toast(page, /2 articles moved/)) && (await seen(page.locator("[data-article='Install the app']").filter({ hasText: "· Help" }))));
  await page.getByLabel("Choose Old exam dates").check();
  await page.locator("[data-bulk-bar]").getByRole("button", { name: "Delete" }).click();
  check("delete after confirming", (await toast(page, /1 article deleted/)) && (await gone(page.locator("[data-article='Old exam dates']"))));

  // Export.
  const exp = await page.request.get(`${base}/api/support/kb/export`);
  const list = await exp.json().catch(() => []);
  const g = list.find((x) => x.title === "How to pay with telebirr");
  check("the export holds the guide with its step video", exp.ok() && g?.steps?.[0]?.video === `https://www.youtube.com/watch?v=${GOOD}`, g);
  await page.screenshot({ path: path.join(shots, "3-list.png"), fullPage: true });

  // As customers see it: the help center page.
  await row.getByRole("button", { name: "Edit" }).waitFor();
  const href = await row.getByRole("link", { name: "Open" }).getAttribute("href");
  const help = await ctx.newPage();
  help.on("pageerror", (e) => errors.push(e.message));
  await help.goto(href.replace(/^https?:\/\/[^/]+/, base));
  check("the help page shows the numbered steps", (await seen(help.locator("[data-guide-step='3']").filter({ hasText: "Keep the receipt" }))) && (await seen(help.getByText("two minutes").locator("xpath=self::strong"))));
  check("no YouTube player loads before it is pressed", (await help.locator("iframe").count()) === 0 && (await seen(help.locator(`[data-youtube='${GOOD}'] img`))));
  await help.getByRole("button", { name: `Play Video ${GOOD}` }).click();
  check("pressing the thumbnail opens the player", (await help.locator(`iframe[src^='https://www.youtube-nocookie.com/embed/${GOOD}']`).count()) === 1);
  await help.screenshot({ path: path.join(shots, "4-help-page.png"), fullPage: true });

  // And in the support widget.
  const cust = await ctx.newPage();
  await cust.goto(`${base}/support-widget?key=${encodeURIComponent(prep.key)}&id=kb-1&name=Hana%20Girma`);
  await cust.locator("[data-help-search]").getByLabel("Search help").fill("telebirr");
  await cust.locator("[data-help-result]").filter({ hasText: "How to pay with telebirr" }).first().click();
  check("the widget shows the guide's steps and video", (await seen(cust.locator("[data-guide-step='1']").filter({ hasText: "Open Payments" }))) && (await seen(cust.locator(`[data-youtube='${GOOD}']`))));
  await cust.screenshot({ path: path.join(shots, "5-widget.png") });

  check("no page errors", errors.length === 0, errors);
} catch (e) {
  console.error(e);
  fails++;
} finally {
  await browser.close();
  yt.close();
}
if (fails) process.exit(1);
