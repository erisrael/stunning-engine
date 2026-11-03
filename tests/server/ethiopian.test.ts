// Phase 16.4 checks: the Ethiopian calendar against known dates (new year, Pagume, Genna), both ways, over years.
import { closeDb } from "../../src/server/db";
import { formatEthiopian, fromEthiopian, toEthiopian } from "../../src/lib/ethiopian";
import { AM } from "../../src/lib/amharic";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};
const eq = (a: { year: number; month: number; day: number }, y: number, m: number, d: number) => a.year === y && a.month === m && a.day === d;

check("Enkutatash 2016 was 12 Sep 2023 (after a Pagume of 6 days)", eq(toEthiopian(2023, 9, 12), 2016, 1, 1) && eq(toEthiopian(2023, 9, 11), 2015, 13, 6));
check("Enkutatash 2017 was 11 Sep 2024", eq(toEthiopian(2024, 9, 11), 2017, 1, 1));
check("Genna (Christmas) 7 Jan 2025 is Tahsas 29, 2017", eq(toEthiopian(2025, 1, 7), 2017, 4, 29));
check("Timket 19 Jan 2026 is Tir 11, 2018", eq(toEthiopian(2026, 1, 19), 2018, 5, 11));
let ok = true;
for (let t = Date.UTC(2015, 0, 1); t < Date.UTC(2035, 0, 1); t += 864e5 * 3) {
  const d = new Date(t);
  const e = toEthiopian(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const g = fromEthiopian(e.year, e.month, e.day);
  if (g.year !== d.getUTCFullYear() || g.month !== d.getUTCMonth() + 1 || g.day !== d.getUTCDate()) ok = false;
}
check("both ways agree for every few days over 20 years", ok);
check("formatted in Amharic and Latin letters", formatEthiopian("2026-11-03") === "ጥቅምት 24, 2019" && formatEthiopian("2026-11-03", { latin: true }) === "Tikimt 24, 2019");
check("the interface has Amharic for the sidebar and common buttons", ["Home", "Attendance", "Save", "Cancel", "Approve", "Check in"].every((k) => !!AM[k]));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
void closeDb();
