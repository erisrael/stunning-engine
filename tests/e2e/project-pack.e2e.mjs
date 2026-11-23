// Roadmap project packs in the browser: generate a full project from a template, its roadmap infographic (roadmap.sh
// style) and the all-projects picture, the project book (cover, contents, Mermaid diagrams drawn), and the documents'
// Diagram menu (a Mermaid class diagram drawn; a draw.io drawing opens the editor).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "project-pack");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, timeout = 10000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const a = await ctx.newPage();
  const errors = [];
  a.on("pageerror", (e) => errors.push(e.message));
  await a.goto(`${base}/login`);
  await a.fill("input[name=email]", "admin@demo.local");
  await a.fill("input[name=password]", "Demo-Workflow-2026");
  await a.getByRole("button", { name: /log in/i }).click();
  await a.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });

  await a.goto(`${base}/dev/roadmap`);
  check("the Roadmap has Generate project pack", await seen(a.locator("[data-generate-pack]")));
  await a.click("[data-generate-pack]");
  await a.click('[data-pack-type="full"]');
  await a.fill("[data-pack-name]", "SchoolHub");
  await a.fill("[data-pack-key]", "SHUB");
  await a.selectOption("[data-pack-template]", "web-app");
  check("the template's phases are previewed", /Discovery/.test(await a.locator("[data-pack-dialog]").innerText()));
  await a.screenshot({ path: path.join(shots, "generate.png") });
  await a.click("[data-pack-create]");
  check("the pack is generated", await seen(a.getByText("Project pack ready")));
  const card = a.locator('[data-roadmap-project="SHUB"]');
  check("the project is on the roadmap as a full project", (await seen(card)) && /Full project/.test(await card.innerText()));

  await card.locator('[data-project-infographic="SHUB"]').click();
  const dlg = a.locator("[data-roadmap-graphic]");
  check("the infographic opens with every phase", (await seen(dlg)) && /Discovery/.test(await dlg.locator("svg[role=img]").innerHTML()) && /Operate and grow/.test(await dlg.locator("svg[role=img]").innerHTML()));
  await a.screenshot({ path: path.join(shots, "infographic.png") });
  const [svgDl] = await Promise.all([a.waitForEvent("download"), a.click("[data-graphic-svg]")]);
  check("it downloads as SVG", /SHUB-roadmap\.svg$/.test(svgDl.suggestedFilename()));
  await a.keyboard.press("Escape");
  await a.click("[data-portfolio-graphic]");
  check("the all-projects picture shows the project", (await seen(a.locator("[data-roadmap-graphic] svg[role=img]"))) && /SHUB/.test(await a.locator("[data-roadmap-graphic] svg[role=img]").innerHTML()));
  await a.keyboard.press("Escape");

  // The book.
  const bookUrl = await card.locator('[data-project-book="SHUB"]').getAttribute("href");
  await a.goto(`${base}${bookUrl}`);
  check("the book has its cover", await seen(a.locator(".book-cover .cover-title", { hasText: "SchoolHub" })));
  check("contents and chapters", (await a.locator("#contents .toc > li").count()) >= 6);
  await a.waitForFunction(() => document.querySelectorAll(".book .spec-mermaid-svg svg").length > 3, null, { timeout: 30000 }).catch(() => {});
  const drawn = await a.locator(".book .spec-mermaid-svg svg").count();
  check("the diagrams are drawn (class, sequence, data and more)", drawn > 3, drawn);
  check("the class diagram is drawn", (await a.locator(".book figure.is-drawn").count()) > 0);
  check("Print is ready once the diagrams are drawn", await a.waitForFunction(() => !document.querySelector("[data-book-print]")?.hasAttribute("disabled"), null, { timeout: 60000 }).then(() => true, () => false));
  await a.screenshot({ path: path.join(shots, "book-cover.png") });
  await a.locator('#contents a[href="#ch-design"]').click().catch(() => {});
  await a.waitForTimeout(500);
  await a.screenshot({ path: path.join(shots, "book-design.png") });

  // Diagrams in a document.
  await a.goto(`${base}/dev/docs`);
  const docLink = a.getByText("SchoolHub: Software design description").first();
  check("the pack's documents are in Specs and docs", await seen(docLink));
  await docLink.click();
  const formatted = a.locator("[data-doc-formatted]");
  await a.waitForFunction(() => document.querySelectorAll("[data-doc-formatted] .spec-mermaid-svg svg").length > 0, null, { timeout: 30000 }).catch(() => {});
  check("the document's diagrams are drawn", (await formatted.locator(".spec-mermaid-svg svg").count()) > 0);
  await a.locator("[data-doc-modes] button", { hasText: "Side by side" }).click().catch(() => {});
  if (await seen(a.locator("[data-insert-diagram]"), 5000)) {
    await a.click("[data-insert-diagram]");
    await a.click('[data-mermaid-snippet="Sequence diagram"]');
    check("the Diagram menu inserts a Mermaid diagram", /sequenceDiagram/.test(await a.locator("textarea[aria-label=Document]").inputValue()));
    await a.waitForTimeout(400);
    await a.click("[data-insert-diagram]");
    await a.click('[data-drawio-new="blank"]');
    check("a draw.io drawing opens the editor", await seen(a.locator("[data-drawio-editor] iframe")));
    check("and is linked in the document", /\/api\/diagrams\/dgm_/.test(await a.locator("textarea[aria-label=Document]").inputValue()));
    await a.click("[data-drawio-close]");
  } else check("the editor shows the Diagram menu", false);
  check("no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.log(`FAIL crashed: ${String(e?.message ?? e).split(String.fromCharCode(10)).slice(0, 6).join(" | ")}`);
  await browser.contexts()[0]?.pages()[0]?.screenshot({ path: path.join(shots, "crash.png") }).catch(() => {});
  fails++;
} finally {
  await browser.close();
}
console.log(`\n${fails ? "FAILED" : "ok"}`);
process.exitCode = fails ? 1 : 0;
