// Update 1.2, System improvements 5 in the browser: Admin, External APIs. Every provider shows its status; Myseed
// Verify is set up with a key that is never shown again, tested, and its call appears in Latest calls; a refused key
// makes the Academy API failing with the reason; the webhook address is this server's; Noor shows its stored counts.
// Light and dark, desktop and phone.
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-2-external-apis");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const seen = (loc, t = 15000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);

// A fake Verify (/v1/health) and academy API (/academy/health) that accept one key each.
const fake = http.createServer((req, res) => {
  const auth = req.headers.authorization;
  const json = (code, body) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  if (req.url === "/v1/health") return auth === "Bearer vfy-key" ? json(200, { ok: true }) : json(401, {});
  if (req.url === "/academy/health") return auth === "Bearer acad-key" ? json(200, { ok: true }) : json(403, {});
  json(404, {});
});
await new Promise((r) => fake.listen(prep.port, "127.0.0.1", r));
const api = `http://127.0.0.1:${prep.port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));

  await page.goto(`${base}/admin?tab=external-apis`);
  await page.locator("[data-api-console]").waitFor({ timeout: 30000 });
  check("every provider has a tile", (await page.locator("[data-api-tile]").count()) === 6);
  check("Verify starts not set up", (await page.locator("[data-api-tile=verify] [data-api-state]").getAttribute("data-api-state")) === "not_set_up");
  check("the webhook address is this server's", await seen(page.getByText(`${new URL(base).origin}/api/verify/webhook`)));

  // Verify: save a key, it is never shown again; test; the call is listed.
  await page.getByLabel("Address", { exact: true }).fill(api);
  await page.getByLabel("API key", { exact: true }).fill("vfy-key");
  await page.locator("[data-verify-card] [data-api-save]").click();
  await page.locator("[data-verify-card] [data-key-state=saved]").first().waitFor({ timeout: 15000 });
  check("a saved key is not shown again", (await page.getByLabel("API key", { exact: true }).inputValue()) === "" && !(await page.content()).includes("vfy-key"));
  await page.locator("#verify-enable").click();
  await page.locator("[data-verify-card] [data-api-save]").click();
  await page.locator("[data-api-tile=verify] [data-api-state=untested]").waitFor({ timeout: 15000 });
  await page.locator("[data-verify-card] [data-api-test]").click();
  check("the test connects", await seen(page.locator("[data-verify-card] [data-api-result=ok]")));
  check("its call is in Latest calls", await seen(page.locator("[data-api-calls] [data-api-call=ok]")));
  await page.locator("[data-api-tile=verify] [data-api-state=healthy]").waitFor({ timeout: 15000 });
  check("and Verify is working", true);
  await page.screenshot({ path: path.join(shots, "verify.png"), fullPage: true });

  // Academy with a wrong key: failing, with the reason.
  await page.locator("[data-api-tile=academy]").click();
  await page.locator("[data-service-card=academy]").waitFor();
  check("the provider is in the address", await page.waitForURL(/api=academy/, { timeout: 10000 }).then(() => true, () => false));
  await page.getByLabel("Address", { exact: true }).fill(`${api}/academy`);
  await page.getByLabel("API key", { exact: true }).fill("wrong");
  await page.locator("#academy-enable").click();
  await page.locator("[data-service-card=academy] [data-api-save]").click();
  await page.locator("[data-service-card=academy] [data-key-state=saved]").first().waitFor({ timeout: 15000 });
  await page.locator("[data-service-card=academy] [data-api-test]").click();
  check("a refused key is said so", await seen(page.locator("[data-service-card=academy] [data-api-result=failed]").getByText(/refused/)));
  await page.locator("[data-api-tile=academy] [data-api-state=failing]").waitFor({ timeout: 15000 });
  check("the Academy API is failing, with the reason on top", await seen(page.locator("[data-api-last-error]").getByText(/refused/)));
  check("the failed call is listed", await seen(page.locator("[data-api-calls] [data-api-call=failed]")));

  // Noor: the stored counts.
  await page.locator("[data-api-tile=noor]").click();
  check("Noor shows its stored records", await seen(page.locator("[data-noor-card]").getByText("Students")) && (await page.locator("[data-noor-card] dd").first().innerText()) === "3");

  // Dark mode.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.locator("[data-api-tile=verify]").click();
  await page.screenshot({ path: path.join(shots, "verify-dark.png"), fullPage: true });

  // Phone width.
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const k of ["verify", "chapa", "sms", "academy", "noor"]) {
    await page.goto(`${base}/admin?tab=external-apis&api=${k}`);
    await page.locator(`[data-api-panel=${k}]`).waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`${k} has no sideways scroll at phone width`, !wide);
    await page.screenshot({ path: path.join(shots, `${k}-phone.png`), fullPage: true });
  }
  check("no script errors", errors.length === 0, errors);
} catch (e) {
  console.log(`FAIL crashed ${e instanceof Error ? e.stack : e}`);
  fails++;
} finally {
  await browser.close();
  fake.close();
}
process.exit(fails ? 1 : 0);
