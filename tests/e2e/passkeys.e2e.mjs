// Passkeys in the browser (Chrome's virtual authenticator stands in for a fingerprint): add one on Profile,
// Account; sign in again: the password, then "Use a passkey" instead of a code.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "passkeys");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const visible = (loc, ms = 12000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);

try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("no page error", false, e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const login = async () => {
    await page.goto(`${base}/login`);
    await page.fill("input[name=email]", "dawit@demo.local");
    await page.fill("input[name=password]", "Demo-Workflow-2026");
    await page.getByRole("button", { name: /log in/i }).click();
  };
  await login();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  check("signs in with the password alone before a passkey", true);
  await page.goto(`${base}/profile?tab=account`);
  await page.locator("[data-passkeys]").getByLabel("Passkey name").fill("Test laptop");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  check("a passkey is added", await visible(page.locator("[data-sonner-toast]").filter({ hasText: /Passkey added/ })));
  check("and listed", await visible(page.locator("[data-passkey]").getByText("Test laptop")));
  await page.screenshot({ path: path.join(shots, "1-profile.png"), fullPage: true });

  await ctx.clearCookies();
  await login();
  await page.waitForURL(/\/login\/verify/, { timeout: 20000 });
  check("the second step is asked now", true);
  await page.screenshot({ path: path.join(shots, "2-verify.png") });
  await page.locator("[data-use-passkey]").click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 }).then(() => check("signed in with the passkey", true), () => check("signed in with the passkey", false, page.url()));
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
