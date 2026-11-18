// Update 1.2, System improvements 5: the External API console. Keys are sealed and never go to the browser (a blank or
// masked field keeps the saved key, removing it is its own choice); the Myseed Verify webhook refuses everything unless
// Verify is on and the event is signed with the saved secret; tests of every provider land in the call monitor under
// their own source; AfroMessage's token is checked against its real /send address without sending; and each provider
// has a status (not set up, off, not tested, working, failing) with its latest calls. Only Admin uses it.
import http from "node:http";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as V from "../../src/server/myseed-verify";
import * as X from "../../src/server/external-api";
import * as S from "../../src/server/external-api-console";
import { POST as verifyWebhook } from "../../src/app/api/verify/webhook/route";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
const setting = async (key: string) => (await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key))?.value ?? "";

// A fake Verify, academy and AfroMessage in one server.
const seen: { path: string; auth: string | null }[] = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const auth = req.headers.authorization ?? null;
  seen.push({ path: url.pathname, auth });
  const json = (code: number, body: unknown) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  if (url.pathname === "/v1/health") return auth === "Bearer vfy-key" ? json(200, { ok: true }) : json(401, { error: "bad key" });
  if (url.pathname === "/academy/health") return auth === "Bearer acad-key" ? json(200, { status: "up" }) : json(403, { error: "no" });
  if (url.pathname === "/am/send") {
    if (auth !== "Bearer am-token") return json(200, { acknowledge: "error", response: { errors: ["Invalid token or token expired"] } });
    return json(200, { acknowledge: "error", response: { errors: ["The to field is required."] } });
  }
  json(404, { message: "not found" });
});

const hook = (body: string, opts: { secret?: string; ts?: number; sig?: string } = {}) => {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const sig = opts.sig ?? (opts.secret ? crypto.createHmac("sha256", opts.secret).update(`${ts}.${body}`).digest("hex") : "");
  return verifyWebhook(new NextRequest("http://localhost/api/verify/webhook", { method: "POST", body, headers: { "x-verify-timestamp": String(ts), "x-verify-signature": sig, "content-type": "application/json" } }));
};
const accepted = async () => Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'payment.verified_accepted'"))?.n ?? 0);

async function main() {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const [admin, dawit] = [await by("admin@demo.local"), await by("dawit@demo.local")];

  // 1. Myseed Verify keys.
  check("Members cannot set up Verify", /administrators/.test(await err(() => V.saveMyseedVerifyConfig(dawit, { baseUrl: base }))));
  check("switching on without a key is refused", /API key/.test(await err(() => V.saveMyseedVerifyConfig(admin, { baseUrl: base, enabled: true }))));
  check("an address must be a web address", /https/.test(await err(() => V.saveMyseedVerifyConfig(admin, { baseUrl: "verify.local" }))));
  const pub = await V.saveMyseedVerifyConfig(admin, { baseUrl: `${base}/`, apiKey: "vfy-key", environment: "sandbox", enabled: false });
  check("what the browser gets has no key", !("apiKey" in pub) && !("webhookSecret" in pub) && pub.hasApiKey && !pub.hasWebhookSecret, pub);
  check("the key is sealed in the settings", !(await setting("cfg.myseed_verify")).includes("vfy-key") && (await V.getMyseedVerifyConfig()).apiKey === "vfy-key");
  await V.saveMyseedVerifyConfig(admin, { apiKey: "", environment: "production" });
  await V.saveMyseedVerifyConfig(admin, { apiKey: "vfy-k••••" });
  check("a blank or masked key keeps the saved one", (await V.getMyseedVerifyConfig()).apiKey === "vfy-key" && (await V.getMyseedVerifyConfig()).environment === "production");
  // Configs from before sealing held the key in plain text: still read, sealed on the next save.
  await run("UPDATE settings SET value = ? WHERE key = 'cfg.myseed_verify'", JSON.stringify({ enabled: false, baseUrl: base, apiKey: "vfy-key", webhookSecret: "old-plain", environment: "sandbox", autoFulfill: true }));
  check("an old plain-text config is still read", (await V.getMyseedVerifyConfig()).webhookSecret === "old-plain");
  await V.saveMyseedVerifyConfig(admin, { autoFulfill: false });
  const raw = await setting("cfg.myseed_verify");
  check("and sealed on the next save", !raw.includes("old-plain") && !raw.includes("vfy-key") && (await V.getMyseedVerifyConfig()).webhookSecret === "old-plain");
  await V.saveMyseedVerifyConfig(admin, { clearWebhookSecret: true });
  check("removing the secret is its own choice", !(await V.publicVerifyConfig()).hasWebhookSecret && (await V.publicVerifyConfig()).hasApiKey);

  // 2. The webhook refuses what is not signed.
  const body = JSON.stringify({ id: "evt_1", type: "payment.accepted", data: { external_reference: "INV-1", amount: "50000", provider: "telebirr" } });
  const before = await accepted();
  check("while Verify is off, events are refused", (await hook(body)).status === 503);
  await V.saveMyseedVerifyConfig(admin, { enabled: true });
  check("with no signing secret saved, an unsigned payment is refused", (await hook(body)).status === 401 && (await accepted()) === before);
  await V.saveMyseedVerifyConfig(admin, { webhookSecret: "whsec_test" });
  check("a wrong signature is refused", (await hook(body, { sig: "00".repeat(32) })).status === 401 && (await accepted()) === before);
  check("an old timestamp is refused", (await hook(body, { secret: "whsec_test", ts: Math.floor(Date.now() / 1000) - 3600 })).status === 401);
  const ok = await hook(body, { secret: "whsec_test" });
  check("a signed event is accepted and recorded once", ok.status === 200 && (await accepted()) === before + 1);
  check("a repeat is not recorded twice", (await hook(body, { secret: "whsec_test" })).status === 200 && (await accepted()) === before + 1);
  const ins = await all<{ ok: number; direction: string }>("SELECT ok, direction FROM int_calls WHERE source = 'verify' AND direction = 'in'");
  check("callbacks, refused and accepted, are in the monitor", ins.filter((r) => !Number(r.ok)).length >= 4 && ins.some((r) => Number(r.ok)));

  // 3. Verify test.
  const t = await V.testMyseedVerifyConnection();
  check("the Verify test asks /v1/health with the key", t.ok && seen.some((s) => s.path === "/v1/health" && s.auth === "Bearer vfy-key"));
  check("and is in the monitor as Verify", !!(await get("SELECT 1 FROM int_calls WHERE source = 'verify' AND direction = 'out' AND ok = 1")));

  // 4. Academy, Finance and AfroMessage keys.
  check("Members cannot save", /Only Admin/.test(await err(() => X.saveExternalApiConfig(dawit, {}))));
  check("an address must be a web address", /https/.test(await err(() => X.saveExternalApiConfig(admin, { academy: { baseUrl: "academy" } }))));
  const p1 = await X.saveExternalApiConfig(admin, { academy: { enabled: true, baseUrl: `${base}/academy/`, apiKey: "acad-key", timeoutMs: 5000 } });
  check("saved settings come back without the key", p1.academy.apiKey === "" && p1.keys.academy.saved && p1.keys.academy.readable && p1.academy.baseUrl === `${base}/academy`, p1.academy);
  check("the key is sealed", !(await setting("cfg.external_apis")).includes("acad-key") && (await X.getExternalApiConfig()).academy.apiKey === "acad-key");
  await X.saveExternalApiConfig(admin, { academy: { timeoutMs: 999999 } });
  const c2 = await X.getExternalApiConfig();
  check("saving other fields keeps the key; the wait is kept sensible", c2.academy.apiKey === "acad-key" && c2.academy.timeoutMs === 60000);
  const ta = await X.testExternalApi("academy");
  check("the academy test asks /health with the key", ta.ok && seen.some((s) => s.path === "/academy/health" && s.auth === "Bearer acad-key"));
  check("and is in the monitor as Academy, marked a test", !!(await get("SELECT 1 FROM int_calls WHERE source = 'academy' AND test = 1 AND ok = 1")));
  await X.saveExternalApiConfig(admin, { sms: { baseUrl: `${base}/am`, apiKey: "wrong" } });
  const bad = await X.testExternalApi("sms");
  check("AfroMessage: a refused token is said so", !bad.ok && /refused the token/.test(bad.message), bad);
  await X.saveExternalApiConfig(admin, { sms: { apiKey: "am-token" } });
  const good = await X.testExternalApi("sms");
  check("an accepted token passes without sending anything", good.ok && /nothing was sent/.test(good.message) && seen.filter((s) => s.path === "/am/send").length === 2, good);
  await X.saveExternalApiConfig(admin, { clearKeys: ["sms"] });
  check("removing a key is its own choice", !(await X.publicExternalApiConfig()).keys.sms.saved && (await X.getExternalApiConfig()).academy.apiKey === "acad-key");

  // 5. Status per provider.
  check("Members cannot see the console", /Only Admin/.test(await err(() => S.externalApiStatus(dawit))));
  const all6 = await S.externalApiStatus(admin);
  check("every provider has a status", all6.map((s) => s.key).join() === "verify,chapa,sms,academy,finance,noor");
  const acad = all6.find((s) => s.key === "academy")!;
  check("a provider whose latest call worked is working, with its calls", acad.state === "healthy" && acad.recent.length >= 1 && acad.recent[0].test, acad);
  check("one with no address or key is not set up", all6.find((s) => s.key === "finance")!.state === "not_set_up");
  await X.saveExternalApiConfig(admin, { academy: { enabled: false } });
  check("one switched off is off", (await S.apiProviderStatus(admin, "academy")).state === "off");
  await X.saveExternalApiConfig(admin, { academy: { enabled: true, apiKey: "now-wrong" } });
  await X.testExternalApi("academy");
  const failing = await S.apiProviderStatus(admin, "academy");
  check("a failed latest call makes it failing, with the reason", failing.state === "failing" && /refused/.test(failing.lastError ?? ""), failing);
  check("Verify's status reads its calls and callbacks", (await S.apiProviderStatus(admin, "verify")).recent.some((r) => r.direction === "in"));
  check("Chapa without a business is not set up", (await S.apiProviderStatus(admin, "chapa")).state === "not_set_up");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(async () => {
    server.close();
    await closeDb();
  });
