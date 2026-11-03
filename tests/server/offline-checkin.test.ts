// Phase 19: check-ins saved on the phone without signal and sent later: taken once with their real time, at the
// site of the QR code, flagged for HR; refused when too old or in the future.
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { syncFromUsers } from "../../src/server/hr";
import * as cap from "../../src/server/attendance-capture";

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

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  await syncFromUsers(admin);
  const base = await cap.captureConfig();
  const c = await cap.saveCaptureConfig(admin, { ...base, methods: { ...base.methods, qr: true }, sites: [{ id: "", name: "Head office", networks: ["196.188.10.0/24"], lat: null, lng: null, radiusM: 150, checks: { network: true, location: false, device: false }, posterKey: "", posterAt: "" }] });
  const code = cap.posterCode(c.sites[0]!);
  const at = new Date(Date.now() - 2 * 36e5).toISOString();
  const r = await cap.offlineCheckin(dawit, { kind: "in", at, code, clientId: "abc123" });
  const ev = await get<{ at: string; source: string; offline: number; flag: string; flag_state: string; site_id: string }>("SELECT at, source, offline, flag, flag_state, site_id FROM att_events WHERE client_id = 'off:abc123'");
  check("a saved check-in keeps its real time", ev?.at === at && !r.duplicate, ev);
  check("at the QR's site, marked offline", ev?.source === "qr" && Number(ev.offline) === 1 && ev.site_id === c.sites[0]!.id);
  check("HR reviews it", ev?.flag_state === "pending" && /without signal/.test(ev.flag));
  check("the same saved check-in is taken once", (await cap.offlineCheckin(dawit, { kind: "in", at, code, clientId: "abc123" })).duplicate === true);
  check("too old is refused", /hours later/.test((await throws(() => cap.offlineCheckin(dawit, { kind: "out", at: new Date(Date.now() - 200 * 36e5).toISOString(), code, clientId: "old" }))) ?? ""));
  check("a clock ahead is refused", /ahead/.test((await throws(() => cap.offlineCheckin(dawit, { kind: "out", at: new Date(Date.now() + 36e5).toISOString(), code, clientId: "future" }))) ?? ""));
  check("without a code it is an app check-in", (await cap.offlineCheckin(dawit, { kind: "out", at: new Date(Date.now() - 36e5).toISOString(), clientId: "nocode" })).kind === "out");
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
  await closeDb();
}
main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await closeDb();
});
