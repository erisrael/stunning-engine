// Sign-in in the browser: two-step setup and codes, recovery codes, remembered devices, lockouts, invitations,
// open sign-up with approval, single sign-on through a mock OpenID Connect provider, linking, Admin's reset and log.
import { chromium } from "playwright-core";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "signin");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const PW = "Demo-Workflow-2026";
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- authenticator codes
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const b32 = (s) => {
  let bits = 0, v = 0; const out = [];
  for (const c of s.replace(/\s/g, "").toUpperCase()) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
};
const code = (secret, step) => {
  const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
};
const stepNow = () => Math.floor(Date.now() / 30000);
async function freshCode(secret, used) {
  while (stepNow() <= used) await sleep(500);
  const s = stepNow();
  return [code(secret, s), s];
}

// --- a mock single sign-on provider
let identity = { sub: "u-meron", email: "meron@demo.local", email_verified: true, name: "Meron" };
const codes = new Map();
const idp = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost:3999");
  if (u.pathname === "/.well-known/openid-configuration")
    return res.end(JSON.stringify({ issuer: "http://localhost:3999", authorization_endpoint: "http://localhost:3999/authorize", token_endpoint: "http://localhost:3999/token" }));
  if (u.pathname === "/authorize") {
    const c = crypto.randomBytes(8).toString("hex");
    codes.set(c, { nonce: u.searchParams.get("nonce"), challenge: u.searchParams.get("code_challenge"), id: { ...identity }, client: u.searchParams.get("client_id") });
    res.writeHead(302, { location: `${u.searchParams.get("redirect_uri")}?code=${c}&state=${u.searchParams.get("state")}` });
    return res.end();
  }
  if (u.pathname === "/token") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const f = new URLSearchParams(body);
      const c = codes.get(f.get("code"));
      const pkce = c && crypto.createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url") === c.challenge;
      if (!c || !pkce || f.get("client_secret") !== "s3cret" || f.get("client_id") !== "myseed-test") return (res.writeHead(400), res.end("{}"));
      codes.delete(f.get("code"));
      const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const claims = { iss: "http://localhost:3999", aud: "myseed-test", exp: Math.floor(Date.now() / 1000) + 300, nonce: c.nonce, ...c.id };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id_token: `${enc({ alg: "RS256" })}.${enc(claims)}.sig`, access_token: "x" }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => idp.listen(3999, r));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const fresh = async () => (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
async function password(page, email, pw = PW) {
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", pw);
  await page.getByRole("button", { name: /log in/i }).click();
}
const alertText = async (page) => (await page.locator("[data-slot=alert]").first().innerText({ timeout: 8000 }).catch(() => "")).trim();
const signedIn = (page) => page.waitForURL((u) => !/\/login|\/signup/.test(u.pathname), { timeout: 20000 }).then(() => true, () => false);

try {
  // 1. Admin's role needs two-step: the first sign-in sets up the app.
  const a1 = await fresh();
  await password(a1, "admin@demo.local");
  await a1.waitForURL(/\/login\/verify/, { timeout: 20000 });
  check("Admin is asked to set up two-step after the password", await a1.getByRole("heading", { name: "Set up two-step sign-in" }).isVisible());
  const secret = (await a1.getByTestId("setup-key").innerText()).replace(/\s/g, "");
  check("the setup key and QR are shown", secret.length >= 32 && (await a1.locator("img[alt^='QR code']").isVisible()));
  await a1.screenshot({ path: path.join(shots, "1-setup.png") });
  await a1.fill("#code", "000000");
  await a1.getByRole("button", { name: "Turn on and continue" }).click();
  check("a wrong code is refused with the tries left", /not right\. 4 tries left/.test(await alertText(a1)), await alertText(a1));
  let [c, used] = await freshCode(secret, 0);
  await a1.fill("#code", c);
  await a1.getByRole("button", { name: "Turn on and continue" }).click();
  await a1.getByTestId("recovery-codes").waitFor({ timeout: 15000 });
  const recovery = (await a1.getByTestId("recovery-codes").locator("li").allInnerTexts()).map((t) => t.trim());
  check("ten recovery codes are shown once", recovery.length === 10 && recovery.every((r) => /^[0-9a-f]{5}-[0-9a-f]{5}$/.test(r)), recovery.join(","));
  await a1.screenshot({ path: path.join(shots, "2-recovery.png") });
  await a1.getByRole("button", { name: "I saved them, continue" }).click();
  check("then Admin is signed in", await signedIn(a1));

  // 2. Next sign-in (another browser, so a new device): code from the app, a reused code refused, remember this device.
  const a2 = await fresh();
  await password(a2, "admin@demo.local");
  await a2.waitForURL(/\/login\/verify/);
  check("next time it asks for the code", await a2.getByRole("heading", { name: "Two-step sign-in" }).isVisible());
  await a2.fill("#code", code(secret, used));
  await a2.getByRole("button", { name: "Verify" }).click();
  check("the code already used at setup is refused", /not right/.test(await alertText(a2)), await alertText(a2));
  [c, used] = await freshCode(secret, used);
  await a2.fill("#code", c);
  await a2.getByText(/Do not ask again on this device/).click();
  await a2.getByRole("button", { name: "Verify" }).click();
  check("a fresh code signs in", await signedIn(a2));
  await a2.context().clearCookies({ name: "myseed_session" });
  await password(a2, "admin@demo.local");
  check("a remembered device skips the code", await signedIn(a2));
  await a2.goto(`${base}/notifications`);
  check("a new device sends a security alert", await a2.getByText("New sign-in to your account").first().waitFor({ timeout: 10000 }).then(() => true, () => false));

  // 3. A recovery code works once.
  const a3 = await fresh();
  await password(a3, "admin@demo.local");
  await a3.waitForURL(/\/login\/verify/);
  await a3.getByRole("tab", { name: /Recovery code/ }).click();
  await a3.fill("#code", recovery[0]);
  await a3.getByRole("button", { name: "Verify" }).click();
  check("a recovery code signs in", await signedIn(a3));
  const a4 = await fresh();
  await password(a4, "admin@demo.local");
  await a4.waitForURL(/\/login\/verify/);
  await a4.getByRole("tab", { name: /Recovery code/ }).click();
  await a4.fill("#code", recovery[0]);
  await a4.getByRole("button", { name: "Verify" }).click();
  check("the same recovery code is refused the second time", /not right/.test(await alertText(a4)), await alertText(a4));
  await a4.context().close();

  // 4. Wrong passwords lock the account, the same way for an account that does not exist.
  const d = await fresh();
  for (let i = 1; i <= 5; i++) {
    await password(d, "dawit@demo.local", "wrong-password-1");
    const t = await alertText(d);
    if (i < 5) check(`wrong password ${i}: plain message`, /Email or password is incorrect/.test(t), t);
    else check("the fifth locks it for a while", /Too many attempts/.test(t), t);
  }
  await password(d, "dawit@demo.local");
  check("even the right password waits while locked", /Too many attempts/.test(await alertText(d)), await alertText(d));
  for (let i = 1; i <= 5; i++) {
    await password(d, "nobody@demo.local", "wrong-password-1");
    if (i < 5) await alertText(d);
  }
  check("an unknown email gets the same answers", /Too many attempts/.test(await alertText(d)), await alertText(d));
  await d.context().close();

  // 5. Admin: invitations.
  const a = a1;
  await a.goto(`${base}/admin?tab=signin`);
  await a.getByRole("tab", { name: /^Sign-up/ }).click();
  await a.getByRole("button", { name: /By invitation/ }).click();
  await a.getByRole("button", { name: "Save sign-in settings" }).click();
  await a.getByText("Sign-in settings saved").waitFor({ timeout: 10000 });
  await a.fill("#inv-email", "newbie@demo.local");
  await a.getByRole("combobox", { name: "Invitation role" }).click();
  await a.getByRole("option", { name: "Editing" }).click();
  await a.getByRole("button", { name: "Make invitation" }).click();
  const link = await a.getByRole("textbox", { name: "invitation link" }).inputValue({ timeout: 10000 });
  check("an invitation link is made", /\/signup\?invite=/.test(link), link);
  await a.screenshot({ path: path.join(shots, "3-invite.png"), fullPage: true });
  const n = await fresh();
  await n.goto(link.replace(/^https?:\/\/[^/]+/, base));
  check("the invitation shows the role and the fixed email", (await n.getByText("You were invited as Editing.").isVisible()) && (await n.locator("#email").inputValue()) === "newbie@demo.local");
  await n.fill("#name", "New Bie");
  await n.fill("#password", "short1");
  await n.fill("#confirm", "short1");
  await n.getByRole("button", { name: "Create my account" }).click();
  check("a weak password is refused", /at least 10/.test(await alertText(n)), await alertText(n));
  await n.fill("#password", "Teff-Harvest-Kx91-Unique");
  await n.fill("#confirm", "Teff-Harvest-Kx91-Unique");
  await n.getByRole("button", { name: "Create my account" }).click();
  check("the new person is signed in", await signedIn(n));
  const n2 = await fresh();
  await n2.goto(link.replace(/^https?:\/\/[^/]+/, base));
  check("the link works only once", await n2.getByText("Invitation not valid").isVisible());
  await n2.context().close();

  // 6. Single sign-on: matches by verified email; unverified and unknown are refused.
  const s = await fresh();
  await s.goto(`${base}/login`);
  check("the sign-in page offers the provider", await s.getByRole("link", { name: "Continue with Mock SSO" }).isVisible());
  await s.getByRole("link", { name: "Continue with Mock SSO" }).click();
  check("SSO signs Meron in (matched by email; the provider counts as both steps)", await signedIn(s));
  await s.goto(`${base}/profile`);
  check("Profile shows the linked account", await s.getByRole("button", { name: "Unlink" }).isVisible().catch(() => false));
  await s.screenshot({ path: path.join(shots, "4-profile.png"), fullPage: true });
  const s2 = await fresh();
  identity = { sub: "u-x", email: "yonas@demo.local", email_verified: false, name: "X" };
  await s2.goto(`${base}/api/auth/oauth/oidc`);
  await s2.waitForURL(/\/login\?error=/);
  check("an unconfirmed email is refused", /did not confirm your email/.test(await alertText(s2)), await alertText(s2));
  identity = { sub: "u-stranger", email: "stranger@newco.test", email_verified: true, name: "Stranger" };
  await s2.goto(`${base}/api/auth/oauth/oidc`);
  await s2.waitForURL(/\/login\?error=/);
  check("an unknown person is refused while sign-up is by invitation", /no account/.test(await alertText(s2)), await alertText(s2));

  // 7. Open sign-up for a domain, approved by Admin.
  await a.goto(`${base}/admin?tab=signin`);
  await a.getByRole("tab", { name: /^Sign-up/ }).click();
  await a.getByRole("button", { name: /Open to company emails/ }).click();
  await a.fill("#su-dom", "newco.test");
  await a.getByRole("button", { name: "Save sign-in settings" }).click();
  await a.getByText("Sign-in settings saved").waitFor({ timeout: 10000 });
  await s2.goto(`${base}/api/auth/oauth/oidc`);
  await s2.waitForURL(/notice=requested/);
  check("SSO from an allowed domain asks for an account", /went to the administrator/.test(await alertText(s2)), await alertText(s2));
  await s2.goto(`${base}/login`);
  await s2.getByRole("link", { name: "Ask for an account" }).click();
  await s2.fill("#name", "Nia Person");
  await s2.fill("#email", "nia@gmail.com");
  await s2.fill("#password", "Teff-Harvest-Kx91-Other");
  await s2.fill("#confirm", "Teff-Harvest-Kx91-Other");
  await s2.getByRole("button", { name: "Ask for an account" }).click();
  check("other domains are refused", /newco\.test/.test(await alertText(s2)), await alertText(s2));
  await s2.fill("#email", "nia@newco.test");
  await s2.getByRole("button", { name: "Ask for an account" }).click();
  check("the request is sent", await s2.getByText(/request went to the administrator/).waitFor({ timeout: 10000 }).then(() => true, () => false));
  await a.reload();
  await a.getByRole("tab", { name: /^Sign-up/ }).click();
  check("Admin sees both requests", (await a.getByRole("row", { name: /Nia Person/ }).isVisible()) && (await a.getByRole("row", { name: /Stranger/ }).isVisible()));
  await a.getByRole("combobox", { name: "Role for Nia Person" }).click();
  await a.getByRole("option", { name: "Marketing" }).click();
  await a.getByRole("row", { name: /Nia Person/ }).getByRole("button", { name: "Approve" }).click();
  await a.getByText(/Account made/).waitFor({ timeout: 10000 });
  await a.getByRole("row", { name: /Stranger/ }).getByRole("button", { name: "Decline" }).click();
  await a.getByText("Declined").first().waitFor({ timeout: 10000 });
  await a.screenshot({ path: path.join(shots, "5-requests.png"), fullPage: true });
  const nia = await fresh();
  await password(nia, "nia@newco.test", "Teff-Harvest-Kx91-Other");
  check("the approved person signs in with the password they chose", await signedIn(nia));
  await nia.context().close();

  // 8. Admin cannot make SSO their only way in before linking it.
  await a.getByRole("tab", { name: /Google, Microsoft, SSO/ }).click();
  const card = a.locator("[data-slot=card]", { hasText: "Other provider (OpenID Connect)" });
  await card.getByText("Admin", { exact: true }).click();
  await a.getByRole("button", { name: "Save sign-in settings" }).click();
  check("Admin is stopped from locking themselves out", await a.getByText(/Link your own account to Mock SSO first/).waitFor({ timeout: 10000 }).then(() => true, () => false));
  await a.reload();

  // 9. Yonas turns on two-step from Profile; Admin resets it.
  const y = await fresh();
  await password(y, "yonas@demo.local");
  check("Yonas (optional, not set up) signs in with the password only", await signedIn(y));
  await y.goto(`${base}/profile#account`);
  await y.getByRole("button", { name: "Set up an authenticator app" }).click();
  const ysecret = (await y.getByRole("dialog").getByTestId("setup-key").innerText()).replace(/\s/g, "");
  const [yc] = await freshCode(ysecret, 0);
  await y.fill("#ts-code", yc);
  await y.getByRole("button", { name: "Turn on" }).click();
  check("Profile shows the recovery codes", await y.getByTestId("recovery-codes").waitFor({ timeout: 10000 }).then(() => true, () => false));
  await y.getByRole("button", { name: "I saved them" }).click();
  await y.reload();
  check("Profile shows two-step on", await y.getByText(/^On$/).first().isVisible());
  await a.goto(`${base}/admin?tab=signin`);
  await a.getByRole("tab", { name: "Two-step by person" }).click();
  a.once("dialog", (dlg) => dlg.accept());
  await a.getByRole("row", { name: /Yonas/ }).getByRole("button", { name: "Reset" }).click();
  await a.getByText("Reset", { exact: true }).last().waitFor({ timeout: 10000 });
  await a.reload();
  await a.getByRole("tab", { name: "Two-step by person" }).click();
  check("after the reset Yonas has no app set up", await a.getByRole("row", { name: /Yonas/ }).getByText("Not set up").waitFor({ timeout: 8000 }).then(() => true, () => false));
  await y.goto(`${base}/dashboard`);
  check("and Yonas's sessions ended", /\/login/.test(y.url()));

  // 10. The log.
  await a.getByRole("tab", { name: "Sign-in log" }).click();
  await a.getByRole("combobox", { name: "What happened" }).click();
  await a.getByRole("option", { name: "Locked after wrong passwords" }).click();
  check("the log shows Dawit's lockout", await a.getByRole("cell", { name: "Dawit" }).first().waitFor({ timeout: 8000 }).then(() => true, () => false));
  await a.screenshot({ path: path.join(shots, "6-log.png"), fullPage: true });

} catch (e) {
  check("run finished", false, e.message);
  let i = 0;
  for (const ctx of browser.contexts()) for (const pg of ctx.pages()) await pg.screenshot({ path: path.join(shots, `fail-${i++}.png`) }).catch(() => {});
}
await browser.close();
idp.close();
console.log(fails ? `${fails} failed` : "all passed");
