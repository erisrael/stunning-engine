// Phase 18: the main pages on a small phone (390 px): no sideways scrolling of the whole page, no page errors.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "mobile");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);

const PAGES = ["/dashboard", "/attendance", "/announcements", "/routines", "/notifications", "/chat", "/people", "/requests", "/overview", "/dev", "/dev/list", "/dev/sprint", "/studio", "/marketing", "/hr", "/finance", "/admin", "/admin?tab=branding", "/admin/assistant", "/admin?tab=privacy", "/admin?tab=files", "/presenters", "/presenters?tab=fees", "/settings", "/profile", "/email"];

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  for (const p of PAGES) {
    await page.goto(`${base}${p}`);
    await page.waitForLoadState("load");
    await page.waitForTimeout(500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${p} fits a phone`, over <= 2, `${over}px too wide`);
    if (over > 2) await page.screenshot({ path: path.join(shots, `${p.replace(/[/?=]/g, "_")}.png`), fullPage: false });
  }
  check("no page errors", errors.length === 0, errors.join(" | "));
  // Phase 5b: installable with shortcuts; without a network the offline page shows (not the browser's error).
  const man = await (await page.request.get(`${base}/manifest.webmanifest`)).json();
  check("the app can be installed with shortcuts", man.display === "standalone" && man.shortcuts?.some((x) => x.url === "/attendance"));
  await page.goto(`${base}/dashboard`);
  const ready = await page.evaluate(async () => !!(await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))])));
  check("the service worker is ready", ready);
  await page.waitForTimeout(1500);
  await page.reload();
  check("the offline page is kept", await page.evaluate(async () => !!navigator.serviceWorker.controller && !!(await caches.match("/offline.html"))));
  // (The browser test tool cannot cut the service worker's own network, so showing it when offline is checked by
  // hand: open the app once, switch the phone to airplane mode, open a page.)
  const off = await page.request.get(`${base}/offline.html`);
  check("the offline page is served", off.ok() && /No connection/.test(await off.text()));
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
