// The main pages, light and dark, on a computer and a phone: each opens without a page error, with its content, and
// on a phone without sideways scrolling. The screenshots are for reviewing the interface (System improvements 7).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "ui-tour");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const PAGES = [
  ["dashboard", "/dashboard"],
  ["cms-live", "/legacy-cms?view=live"],
  ["cms-revenue", "/legacy-cms?view=revenue"],
  ["cms-content", "/legacy-cms?view=content"],
  ["cms-admin", "/legacy-cms?view=admin"],
  ["chapa", "/finance/chapa"],
  ["support", "/support"],
  ["support-settings", "/support?tab=settings"],
  ["support-content", "/support?tab=content"],
  ["support-ratings", "/support?tab=ratings"],
  ["admin", "/admin"],
  ["work", "/my-work"],
  ["chat", "/chat"],
];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  for (const [device, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    for (const scheme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport, colorScheme: scheme });
      // Dark as a person chooses it: the theme setting (next-themes keeps it as "theme").
      await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, scheme);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}/login`);
      await page.fill("input[name=email]", "admin@demo.local");
      await page.fill("input[name=password]", "Demo-Workflow-2026");
      await page.getByRole("button", { name: /log in/i }).click();
      await page.waitForURL((u) => !u.pathname.includes("/login"));
      // The app's own dark mode follows the appearance setting.
      for (const [name, url] of PAGES) {
        errors.length = 0;
        const res = await page.goto(`${base}${url}`, { waitUntil: "domcontentloaded" }).catch(() => null);
        await page.waitForTimeout(1500);
        const status = res?.status() ?? 0;
        const wide = device === "phone" ? await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) : 0;
        check(`${name} (${device}, ${scheme}) opens`, status > 0 && status < 400 && !errors.length, { status, errors });
        if (device === "phone") check(`${name} (phone, ${scheme}) has no sideways scrolling`, wide <= 1, wide);
        await page.screenshot({ path: path.join(shots, `${device}-${scheme}-${name}.png`), fullPage: device === "desktop" });
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exitCode = fails ? 1 : 0;
