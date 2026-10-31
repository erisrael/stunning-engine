// Authenticator codes against the RFC 6238 test values, and the policy rules.
import { closeDb, get, run } from "../../src/server/db";
import { fromBase32, matchTotp, toBase32, totpCode } from "../../src/server/totp";
import { newPasswordProblem, setPassword } from "../../src/server/signin";
import { domainAllowed, normalizeSignInPolicy, sessionLimitFor, twoStepLevelFor, DEFAULT_SIGNIN_POLICY } from "../../src/lib/signin-policy";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};

async function main() {
  // RFC 6238 appendix B (SHA-1, secret "12345678901234567890"): the last six digits of each 8-digit value.
  const secret = toBase32(Buffer.from("12345678901234567890"));
  check("base32 round trip", fromBase32(secret).toString() === "12345678901234567890");
  const vectors: [number, string][] = [[59, "94287082"], [1111111109, "07081804"], [1234567890, "89005924"], [2000000000, "69279037"]];
  for (const [t, want] of vectors) check(`RFC 6238 at ${t}`, totpCode(secret, Math.floor(t / 30)) === want.slice(2), totpCode(secret, Math.floor(t / 30)));
  const ms = 1234567890 * 1000;
  check("code now matches", matchTotp(secret, "005924", 0, ms) === Math.floor(1234567890 / 30));
  check("the previous code still matches (slow phone clock)", matchTotp(secret, totpCode(secret, Math.floor(1234567890 / 30) - 1), 0, ms) !== null);
  check("a code two steps old does not", matchTotp(secret, totpCode(secret, Math.floor(1234567890 / 30) - 2), 0, ms) === null);
  check("a code used once cannot be used again", matchTotp(secret, "005924", Math.floor(1234567890 / 30), ms) === null);
  check("spaces are ignored", matchTotp(secret, "005 924", 0, ms) !== null);
  check("letters are refused", matchTotp(secret, "00592a", 0, ms) === null);

  const p = normalizeSignInPolicy({ password: { minLength: 3 }, lockout: { attempts: 1000 }, sessions: { default: { idleMinutes: 5, maxHours: 0 } }, signup: { mode: "domain", startRole: "admin", domains: "@MySeed.et, bad" } });
  check("values are kept inside safe limits", p.password.minLength === 8 && p.lockout.attempts === 50 && p.sessions.default.idleMinutes === 15 && p.sessions.default.maxHours === 1);
  check("sign-up never starts people as Admin", p.signup.startRole === "recording");
  check("domains are cleaned", JSON.stringify(p.signup.domains) === '["myseed.et"]', p.signup.domains);
  check("garbage gives the defaults", JSON.stringify(normalizeSignInPolicy("nonsense")) === JSON.stringify(normalizeSignInPolicy(undefined)));
  const d = DEFAULT_SIGNIN_POLICY;
  check("Admin needs two-step by default", twoStepLevelFor(d, ["admin"]) === "required");
  check("an editor may choose", twoStepLevelFor(d, ["editing"]) === "optional");
  check("several roles take the strictest", twoStepLevelFor(d, ["editing", "accountant"]) === "required");
  check("session limits: the shortest of the roles", sessionLimitFor(d, ["editing", "hr_officer"]).maxHours === 7 * 24 && sessionLimitFor(d, ["editing", "hr_officer"]).idleMinutes === 480);
  check("session limits: defaults for production roles", sessionLimitFor(d, ["editing"]).maxHours === 14 * 24 && sessionLimitFor(d, ["editing"]).idleMinutes === 0);
  check("domain rule: empty allows all", domainAllowed([], "a@b.com") && domainAllowed(["myseed.et"], "X@MySeed.et") && !domainAllowed(["myseed.et"], "x@gmail.com"));

  // Passwords in the database
  const u = (await get<{ id: string }>("SELECT id FROM users WHERE email = 'dawit@demo.local'"))!;
  check("too short is refused", /at least 10/.test((await newPasswordProblem("abc12")) ?? ""));
  check("letters and numbers needed", /letters and numbers/.test((await newPasswordProblem("abcdefghijkl")) ?? ""));
  check("the current password cannot be reused", /not used/.test((await newPasswordProblem("Demo-Workflow-2026", u.id)) ?? ""));
  await setPassword(u.id, "Fresh-Teff-Field-91");
  check("history keeps the old one", /not used/.test((await newPasswordProblem("Demo-Workflow-2026", u.id)) ?? ""));
  check("the change date is recorded", !!(await get<{ password_changed_at: string }>("SELECT password_changed_at FROM users WHERE id = ?", u.id))?.password_changed_at);
  const leaked = await newPasswordProblem("password123");
  console.log(`  (network) leaked-password check says: ${leaked}`);
  check("a well-known leaked password is refused (needs internet)", /leak/.test(leaked ?? ""), leaked);
  await run("UPDATE users SET password_hash = (SELECT hash FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1) WHERE id = ?", u.id, u.id);

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main();
