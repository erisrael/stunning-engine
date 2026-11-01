// Email verification set by Admin (Admin, Sign-in, Email verification): the setting, the one-time link, a changed
// email asked again, Admin marking an address confirmed, and nobody held back when no email can be sent.
import crypto from "node:crypto";
import { get, run, closeDb, nowIso } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as ev from "../../src/server/email-verify";
import { normalizeSignInPolicy, DEFAULT_SIGNIN_POLICY } from "../../src/lib/signin-policy";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};
const setPolicy = async (mode: "off" | "signup" | "all", graceDays = 0) =>
  run(
    "INSERT INTO settings (key, value, updated_at) VALUES ('cfg.signin', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    JSON.stringify({ policy: { ...structuredClone(DEFAULT_SIGNIN_POLICY), emailVerify: { mode, graceDays } }, secrets: {} }),
    nowIso(),
  );

async function main() {
  check("off by default", DEFAULT_SIGNIN_POLICY.emailVerify.mode === "off");
  check("an unknown mode falls back to off", normalizeSignInPolicy({ emailVerify: { mode: "sometimes" } }).emailVerify.mode === "off");
  check("the grace period is kept within 0 to 90 days", normalizeSignInPolicy({ emailVerify: { mode: "all", graceDays: 400 } }).emailVerify.graceDays === 90);

  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const dawit = (await get<{ id: string; email: string }>("SELECT id, email FROM users WHERE email = 'dawit@demo.local'"))!;
  await setPolicy("all");
  check("without an email account nobody is held back", !(await ev.mustConfirmEmail(dawit.id)));
  check("Admin is never held back", !(await ev.mustConfirmEmail(admin.id)));

  // The link (made here as the email would carry it).
  const token = crypto.randomBytes(32).toString("base64url");
  await run(
    "INSERT INTO email_verifications (token_hash, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    crypto.createHash("sha256").update(token).digest("hex"),
    dawit.id,
    dawit.email,
    new Date(Date.now() + 864e5).toISOString(),
    nowIso(),
  );
  check("Dawit is listed as not confirmed", (await ev.unconfirmedPeople(admin)).some((p) => p.id === dawit.id));
  const ok = await ev.confirmEmail(token);
  check("the link confirms the email", ok?.email === dawit.email && !!(await get<{ v: string | null }>("SELECT email_verified_at AS v FROM users WHERE id = ?", dawit.id))?.v);
  check("the link works once", (await ev.confirmEmail(token)) === null);
  check("a confirmed person is not listed", !(await ev.unconfirmedPeople(admin)).some((p) => p.id === dawit.id));

  await ev.emailChanged(dawit.id);
  check("a changed email is asked for again", !(await get<{ v: string | null }>("SELECT email_verified_at AS v FROM users WHERE id = ?", dawit.id))?.v);
  const hana = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'hana@demo.local'"))!.id))!;
  check("only Admin marks an email confirmed", !!(await ev.adminConfirm(hana, dawit.id).then(() => null, (e) => e)));
  await ev.adminConfirm(admin, dawit.id);
  check("Admin marks it confirmed", !!(await get<{ v: string | null }>("SELECT email_verified_at AS v FROM users WHERE id = ?", dawit.id))?.v);
  check("sending a link without an email account says so", /email account/.test(String(await ev.adminSendConfirmation(admin, hana.id).then(() => "", (e) => e.message))));
  await setPolicy("off");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
