// Update 1.0 Phase 8 in the browser: theme presets (a person's own, Admin's for everyone, None, the widget left
// alone), the new fonts, Admin's settings search and section tabs, the Chapa Overview customized; then screenshot
// checks of key pages in light, dark and every preset, at desktop and phone widths: no sideways scrolling, readable
// headings, no page errors. Screenshots are kept in test-results/update-1-phase8 for review.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-phase8");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const seen = (loc, t = 12000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const toast = (page, re) => seen(page.locator("[data-sonner-toast]").filter({ hasText: re }));
const html = (page, k) => page.evaluate((key) => document.documentElement.dataset[key] ?? "", k);
const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const errors = [];

async function login(email, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email}: ${e.message}`));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  return { ctx, page };
}

// Layout and legibility on the open page: no sideways scrolling, and the page title readable on its background.
const audit = (page) =>
  page.evaluate(() => {
    const rgb = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const back = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = rgb(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c.length < 4 || c[3] > 0.5)) return c;
      }
      return [255, 255, 255];
    };
    const h = document.querySelector("main h1") ?? document.querySelector("h1");
    let contrast = 21;
    if (h) {
      const a = lum(rgb(getComputedStyle(h).color));
      const b = lum(back(h));
      contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, contrast: Math.round(contrast * 10) / 10, heading: h?.textContent?.trim().slice(0, 40) ?? null };
  });

try {
  const { ctx, page } = await login("admin@demo.local");

  // A person's own preset.
  await page.goto(`${base}/preferences`);
  const presets = page.getByRole("radiogroup", { name: "Colour theme" });
  await presets.getByRole("radio", { name: /Dim/ }).waitFor();
  const names = await presets.getByRole("radio").allTextContents();
  check("Settings lists the six colour themes", names.length === 8, names);
  await presets.getByRole("radio", { name: /Dim/ }).click();
  check("Dim applies at once", (await html(page, "preset")) === "dim" && (await html(page, "mode")) === "dark" && (await bg(page)) === "rgb(34, 39, 46)", [await html(page, "preset"), await bg(page)]);
  check("Light or Dark is set aside while a theme is on", (await seen(page.locator("[data-preset-note]"))) && (await page.getByRole("radiogroup", { name: "Theme", exact: true }).count()) === 0);
  await page.screenshot({ path: path.join(shots, "1-preferences-dim.png") });
  await page.reload();
  check("and stays after a reload, before paint", (await html(page, "preset")) === "dim" && (await bg(page)) === "rgb(34, 39, 46)");
  await page.goto(`${base}/dashboard`);
  check("dark styles follow the theme on other pages", (await html(page, "mode")) === "dark" && (await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)) === "dark");
  await page.goto(`${base}/preferences`);
  await page.getByRole("radiogroup", { name: "Colour theme" }).getByRole("radio", { name: "None", exact: true }).click();
  check("None goes back to plain Light", (await html(page, "preset")) === "" && (await bg(page)) === "rgb(255, 255, 255)");

  // Fonts.
  await page.getByRole("radiogroup", { name: "Font" }).getByRole("radio", { name: "Manrope" }).click();
  await page.waitForFunction(() => document.fonts.status === "loaded").catch(() => null);
  check("a new font applies", /manrope/i.test(await page.evaluate(() => getComputedStyle(document.body).fontFamily)), await page.evaluate(() => getComputedStyle(document.body).fontFamily));
  await page.getByRole("radiogroup", { name: "Font" }).getByRole("radio", { name: /Abyssinica/ }).click();
  check("Abyssinica SIL for Amharic", /abyssinica/i.test(await page.evaluate(() => getComputedStyle(document.body).fontFamily)));
  await page.getByRole("radiogroup", { name: "Font" }).getByRole("radio", { name: /Jakarta/ }).click();

  // Admin sets a theme for everyone.
  await page.goto(`${base}/settings?tab=workspace`);
  await page.getByLabel("Colour theme for everyone").click();
  await page.getByRole("option", { name: /Ocean/ }).click();
  await page.getByRole("button", { name: "Save workspace" }).click();
  check("Admin saves Ocean for everyone", await toast(page, /saved/i));
  await page.goto(`${base}/preferences`);
  await page.getByRole("radiogroup", { name: "Colour theme" }).getByRole("radio", { name: /As set for the workspace/ }).click();
  const sara = await login("sara@demo.local");
  check("someone who has not chosen sees Ocean", (await html(sara.page, "preset")) === "ocean" && (await bg(sara.page)) === "rgb(242, 248, 251)", [await html(sara.page, "preset"), await bg(sara.page)]);
  await sara.page.goto(`${base}/preferences`);
  check("their settings say so", await seen(sara.page.getByRole("radio", { name: "As set for the workspace (Ocean)" })));
  await sara.page.screenshot({ path: path.join(shots, "2-workspace-ocean.png") });
  await sara.page.goto(`${base}/support-widget?key=${encodeURIComponent(prep.key)}&id=p8&name=Hana`);
  await sara.page.waitForLoadState("domcontentloaded");
  check("the customer widget keeps its own look", (await html(sara.page, "preset")) === "");
  await sara.ctx.close();

  // Theme from the account menu.
  await page.goto(`${base}/dashboard`);
  check("Admin also follows the workspace theme", (await html(page, "preset")) === "ocean");

  // Admin: search and section tabs.
  await page.goto(`${base}/admin`);
  const search = page.getByLabel("Search settings");
  await search.fill("smtp");
  check("search finds the screen holding a setting", await seen(page.locator("[data-admin-hit='Email settings']")));
  await search.fill("sessions");
  await search.press("Enter");
  await page.waitForURL(/tab=sessions/);
  check("Enter opens it, with its title and what it holds", await seen(page.locator("[data-admin-section=sessions]").filter({ hasText: "Who is signed in where" })));
  await page.keyboard.press("/");
  check("/ focuses the search", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Search settings"));
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "Security sections" }).getByRole("link", { name: "Privacy" }).click();
  await page.waitForURL(/tab=privacy/);
  check("section tabs are the shared page tabs", (await page.getByRole("navigation", { name: "Security sections" }).getByRole("link", { name: "Privacy" }).getAttribute("aria-current")) === "page");
  await page.screenshot({ path: path.join(shots, "3-admin.png") });

  // Chapa Overview.
  await page.goto(`${base}/finance/chapa`);
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  const panel = page.locator("[data-customize-overview]");
  await panel.getByLabel("Show By status").click();
  await panel.getByRole("button", { name: "Move Paid per day (chart) up" }).click();
  await panel.getByRole("button", { name: "Save for me" }).click();
  check("the Overview is saved for me", await toast(page, /Overview saved/));
  check("in the chosen order without the hidden widget", await seen(page.locator("[data-overview='sync,today,d7,daily,d30,method,type']")), await page.locator("[data-overview]").getAttribute("data-overview"));
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  check("Admin can save it for everyone, or go back to the default", (await seen(panel.getByRole("button", { name: "Save for everyone" }))) && (await seen(panel.getByRole("button", { name: "Use the default" }))));
  await panel.getByRole("button", { name: "Use the default" }).click();
  check("the default again", await seen(page.locator("[data-overview='sync,today,d7,d30,daily,method,type,status']")));
  await ctx.close();

  // Screenshot checks: key pages in light, dark and each preset; desktop and phone.
  const pages = ["/dashboard", "/support", "/admin?tab=people", "/finance/chapa", "/settings", "/preferences", "/my-work"];
  const looks = [{ name: "light", theme: "light", preset: "none" }, { name: "dark", theme: "dark", preset: "none" }, ...["dim", "midnight", "forest", "ocean", "sand", "contrast"].map((p) => ({ name: p, theme: "light", preset: p }))];
  const bad = [];
  for (const vp of [{ width: 1440, height: 900, tag: "desktop" }, { width: 390, height: 844, tag: "phone" }]) {
    const s = await login("admin@demo.local", vp);
    for (const look of vp.tag === "desktop" ? looks : looks.filter((l) => ["light", "dark", "contrast"].includes(l.name))) {
      await s.page.evaluate(({ theme, preset }) => {
        localStorage.setItem("theme", theme);
        const a = JSON.parse(localStorage.getItem("myseed.appearance") || "{}");
        localStorage.setItem("myseed.appearance", JSON.stringify({ ...a, preset }));
      }, look);
      for (const p of look.name === "light" || look.name === "dark" ? pages : pages.slice(0, 3)) {
        await s.page.goto(`${base}${p}`);
        await s.page.waitForLoadState("networkidle").catch(() => null);
        const r = await audit(s.page);
        const file = `shot-${vp.tag}-${look.name}-${p.replace(/[^a-z]+/gi, "-").replace(/^-|-$/g, "")}.png`;
        await s.page.screenshot({ path: path.join(shots, file) });
        if (look.preset !== "none" && (await html(s.page, "preset")) !== look.preset) bad.push({ page: p, look: look.name, vp: vp.tag, problem: "theme not applied" });
        if (r.overflow > 1) bad.push({ page: p, look: look.name, vp: vp.tag, problem: `scrolls sideways by ${r.overflow}px` });
        if (r.contrast < 4.5) bad.push({ page: p, look: look.name, vp: vp.tag, problem: `heading contrast ${r.contrast}` });
      }
    }
    await s.ctx.close();
  }
  check("key pages in every look: applied, no sideways scrolling, readable headings", bad.length === 0, bad);
  check("no page errors", errors.length === 0, errors);
} catch (e) {
  console.error(e);
  fails++;
} finally {
  await browser.close();
}
if (fails) process.exit(1);
