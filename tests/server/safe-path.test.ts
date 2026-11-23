// After signing in, only a path on this site: no open redirects (Security audit, 23 November 2026).
import { safeNext } from "../../src/lib/safe-path";
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => (ok ? pass++ : fail++, console.log(`${ok ? "PASS" : "FAIL"} ${name}`));
check("a path on the site is kept", safeNext("/dev/docs?doc=1#x") === "/dev/docs?doc=1#x");
for (const bad of ["//evil.com", "/\\evil.com", "\\\\evil.com", "/%5C%5Cevil.com".replace(/%5C/g, "\\"), "https://evil.com", "javascript:alert(1)", "/\t/evil.com", "/\n/evil.com", "", "dev"]) check(`refused: ${JSON.stringify(bad)}`, safeNext(bad) === "/dashboard");
check("a missing value falls back", safeNext(null) === "/dashboard" && safeNext(undefined, "/login") === "/login");
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
