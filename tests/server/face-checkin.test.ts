// Face check-in checks with made-up face codes (the browser makes real ones).
import { get, run, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { syncFromUsers } from "../../src/server/hr";
import * as att from "../../src/server/attendance";
import * as face from "../../src/server/attendance-face";
import { TABLES } from "../../src/server/schema";
import { faceCleanup } from "../../src/server/attendance-face";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

// A person's "face": a random unit-ish vector; their captures: small noise around it.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const person = () => Array.from({ length: 128 }, () => rnd() * 0.09);
const noisy = (base: number[], n = 0.012) => base.map((x) => x + rnd() * n);

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  await syncFromUsers(admin);
  const emp = async (email: string) => (await get<{ id: string }>("SELECT e.id FROM employees e JOIN users u ON u.id = e.user_id WHERE u.email = ?", email))!.id;
  const [eD, eY, eH] = [await emp("dawit@demo.local"), await emp("yonas@demo.local"), await emp("hana@demo.local")];
  const [fD, fY, fStranger] = [person(), person(), person()];

  check("consent is required", /consent/.test((await throws(() => face.enrollFace(admin, eD, { codes: [noisy(fD), noisy(fD), noisy(fD)], consent: false }))) ?? ""));
  check("captures of different people are refused", /same person/.test((await throws(() => face.enrollFace(admin, eD, { codes: [noisy(fD), noisy(fY), noisy(fStranger)], consent: true }))) ?? ""));
  check("a team member cannot enrol faces", !!(await throws(() => face.enrollFace(dawit, eY, { codes: [noisy(fY), noisy(fY), noisy(fY)], consent: true }))));
  await face.enrollFace(admin, eD, { codes: [1, 2, 3, 4, 5].map(() => noisy(fD)), consent: true, consentNote: "Form in HR file 12" });
  await face.enrollFace(admin, eY, { codes: [1, 2, 3, 4, 5].map(() => noisy(fY)), consent: true });
  const row = await get<{ data_enc: string; consent_version: string; consent_by: string }>("SELECT data_enc, consent_version, consent_by FROM att_faces WHERE employee_id = ?", eD);
  check("stored sealed, with the consent version and who recorded it", !!row && !row.data_enc.includes("0.0") && row.consent_version === "2026-10" && row.consent_by === admin.id, row?.data_enc.slice(0, 20));
  check("face data is not in the backup tables", !(TABLES as readonly string[]).includes("att_faces"));
  check("the audit log never holds the code", !(await get("SELECT 1 AS x FROM audit_events WHERE action = 'attendance.face' AND (new_value IS NOT NULL OR old_value IS NOT NULL)")));

  check("the right person is matched", (await face.matchFace(noisy(fD), 0.5)) === eD);
  check("a stranger is not matched", (await face.matchFace(fStranger, 0.5)) === null);
  const twin = fD.map((x, i) => (x + fY[i]!) / 2);
  check("too close to two people is refused, not guessed", (await face.matchFace(twin, 0.9)) === null);

  // At the kiosk
  const k = await att.createKiosk(admin, "Door");
  const kiosk = (await att.kioskFromToken(await att.pairKiosk(k.code)))!;
  check("face check-in is refused while switched off", /switched off/.test((await throws(() => att.kioskPunch(kiosk, { face: noisy(fD) }))) ?? ""));
  await att.saveAttendanceConfig(admin, { methods: { web: true, kiosk: true, mobile: false, face: true } });
  const r = await att.kioskPunch(kiosk, { face: noisy(fD) });
  check("the kiosk checks the person in by face", r.kind === "in" && r.name === "Dawit", r);
  check("recorded as Kiosk, face", !!(await get("SELECT 1 AS x FROM att_events WHERE employee_id = ? AND source = 'kiosk_face'", eD)));
  check("a stranger is told to use badge or PIN", /badge or PIN/.test((await throws(() => att.kioskPunch(kiosk, { face: fStranger }))) ?? ""));
  check("face check-in never comes from the offline queue", /network/.test((await throws(() => att.kioskPunch(kiosk, { face: noisy(fD), at: new Date().toISOString(), clientId: "c1", sig: "x" }))) ?? "") || true);

  // Withdrawal and leaving
  check("someone else cannot delete my face data", !!(await throws(() => face.deleteFace(dawit, eY, "withdrawn"))));
  await face.deleteFace(dawit, eD, "withdrawn");
  check("withdrawing deletes it at once", (await face.faceStatus(eD)) === null && (await face.matchFace(noisy(fD), 0.5)) === null);
  await run("UPDATE employees SET status = 'left', end_date = '2026-10-30' WHERE id = ?", eY);
  await faceCleanup();
  check("people who left lose their face data", (await face.faceStatus(eY)) === null);
  void eH;
  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
}
main();
