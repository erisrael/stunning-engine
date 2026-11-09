// Leaving the site: notice, then the action Admin chose, coming back ends the break; weak readings ignored; the sweep.
process.env.MAIL_FAKE = "1";
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { syncFromUsers } from "../../src/server/hr";
import * as gf from "../../src/server/geofence";
import { saveCaptureConfig, captureConfig } from "../../src/server/attendance-capture";
import { punchKind, stateOf } from "../../src/server/attendance";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const SITE = { lat: 9.0108, lng: 38.7613 };
const away = { lat: 9.03, lng: 38.79, accuracy: 20 }; // about 3.8 km
const here = { lat: SITE.lat, lng: SITE.lng, accuracy: 15 };
const ago = (min: number) => new Date(Date.now() - min * 60e3).toISOString();

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const dawit = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'dawit@demo.local'"))!.id))!;
  await syncFromUsers(admin);
  const emp = (await get<{ id: string }>("SELECT id FROM employees WHERE user_id = ?", dawit.id))!.id;

  check("off by default", (await gf.geofenceConfig()).mode === "off" && !(await gf.geofenceStatus(dawit)).watch);
  check("it needs a site with a location", await gf.saveGeofenceConfig(admin, { mode: "break" }).then(() => false, (e) => /latitude/.test(String(e))));
  const cap = await captureConfig();
  await saveCaptureConfig(admin, { ...cap, sites: [{ id: "", name: "Head office", networks: [], lat: SITE.lat, lng: SITE.lng, radiusM: 150, checks: { network: false, location: true, device: false }, posterKey: "", posterAt: "" }] });
  check("only Admin sets it", await gf.saveGeofenceConfig(dawit, { mode: "break" }).then(() => false, (e) => /Only Admin/.test(String(e))));
  await gf.saveGeofenceConfig(admin, { mode: "break_then_checkout", graceMin: 10, checkoutAfterMin: 60 });

  check("checked out: nothing is watched", !(await gf.geofenceStatus(dawit)).watch);
  await punchKind(emp, "in", { at: ago(15), source: "web" });
  check("checked in: the phone watches", (await gf.geofenceStatus(dawit)).watch);

  const t0 = await gf.geofenceTick(dawit, here);
  check("at the office: inside", t0.inside === true && t0.site === "Head office", t0);
  const weak = await gf.geofenceTick(dawit, { ...away, accuracy: 900 });
  check("a weak reading is ignored", weak.inside === null && !(await get("SELECT 1 AS x FROM att_geofence WHERE employee_id = ?", emp)), weak);
  const t1 = await gf.geofenceTick(dawit, away);
  check("one reading outside does nothing yet", !t1.warnedAt && t1.inside === false, t1);
  const t2 = await gf.geofenceTick(dawit, away);
  check("two in a row: the person is told", !!t2.warnedAt && !!t2.actsAt && !t2.acted, t2);
  check("with a notice", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title = 'You left Head office'", dawit.id)));
  check("still checked in during the grace time", (await stateOf(emp)).state === "in");

  await run("UPDATE att_geofence SET outside_since = ? WHERE employee_id = ?", ago(11), emp);
  const t3 = await gf.geofenceTick(dawit, away);
  check("after the grace time a break starts", t3.acted === "break" && (await stateOf(emp)).state === "break", t3);
  const ev = await get<{ source: string; note: string }>("SELECT source, note FROM att_events WHERE employee_id = ? AND kind = 'break_start' ORDER BY at DESC LIMIT 1", emp);
  check("recorded as automatic", ev?.source === "geofence" && /left Head office/.test(ev.note), ev);

  const t4 = await gf.geofenceTick(dawit, here);
  check("coming back ends the break", (await stateOf(emp)).state === "in" && t4.inside === true && !(await get("SELECT 1 AS x FROM att_geofence WHERE employee_id = ?", emp)), t4);

  // Gone, and the phone went quiet: the regular checks act on the last reading.
  await gf.geofenceTick(dawit, away);
  await gf.geofenceTick(dawit, away);
  await run("UPDATE att_geofence SET outside_since = ? WHERE employee_id = ?", ago(15), emp);
  check("the sweep starts the break", (await gf.geofenceSweep()) === 1 && (await stateOf(emp)).state === "break");
  await run("UPDATE att_geofence SET outside_since = ? WHERE employee_id = ?", ago(65), emp);
  await gf.geofenceSweep();
  check("and checks out after the longer time", (await stateOf(emp)).state === "out");
  check("checked out: the row is cleared at the next reading", (await gf.geofenceTick(dawit, away)).watch === false && !(await get("SELECT 1 AS x FROM att_geofence WHERE employee_id = ?", emp)));

  // Check out straight away.
  await gf.saveGeofenceConfig(admin, { mode: "checkout", graceMin: 5, flagForHr: true });
  await punchKind(emp, "in", { at: new Date().toISOString(), source: "web" });
  await gf.geofenceTick(dawit, away);
  await gf.geofenceTick(dawit, away);
  await run("UPDATE att_geofence SET outside_since = ? WHERE employee_id = ?", ago(6), emp);
  await gf.geofenceTick(dawit, away);
  const out = await get<{ kind: string; flag: string | null }>("SELECT kind, flag FROM att_events WHERE employee_id = ? ORDER BY at DESC LIMIT 1", emp);
  check("checkout mode checks out, flagged for HR when set", out?.kind === "out" && /Automatic/.test(out.flag ?? ""), out);

  // Only telling.
  await gf.saveGeofenceConfig(admin, { mode: "notify" });
  await run("UPDATE att_events SET voided = 1 WHERE employee_id = ?", emp);
  await punchKind(emp, "in", { at: new Date().toISOString(), source: "web" });
  await gf.geofenceTick(dawit, away);
  const n = await gf.geofenceTick(dawit, away);
  await run("UPDATE att_geofence SET outside_since = ? WHERE employee_id = ?", ago(300), emp);
  await gf.geofenceTick(dawit, away);
  check("notify mode only tells", !!n.warnedAt && !n.actsAt && (await stateOf(emp)).state === "in", n);
  await gf.saveGeofenceConfig(admin, { mode: "off" });
  check("off again: nothing watched", !(await gf.geofenceStatus(dawit)).watch);
  void all;
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
