// Prepares a fresh copy of the demo database for one browser test: `tsx tests/e2e/prep.ts <name>`, with
// PGLITE_DIR set to the copy and PREP_FILE where the test reads what it needs (codes, ids).
import fs from "node:fs";
import { closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { syncFromUsers } from "../../src/server/hr";
import { upsertAccount } from "../../src/server/workspace-data";
import { seal } from "../../src/server/secrets";
import * as att from "../../src/server/attendance";
import { DEFAULT_SIGNIN_POLICY } from "../../src/lib/signin-policy";

const admin = async () => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
const out = (v: unknown) => process.env.PREP_FILE && fs.writeFileSync(process.env.PREP_FILE, JSON.stringify(v));

// Tests other than sign-in sign in with a password only.
async function passwordOnly(extra: Partial<typeof DEFAULT_SIGNIN_POLICY> = {}, secrets: Record<string, string> = {}) {
  const policy = { ...structuredClone(DEFAULT_SIGNIN_POLICY), ...extra };
  if (!extra.twoStep) policy.twoStep = { ...policy.twoStep, default: "off", roles: {} };
  await run(
    "INSERT INTO settings (key, value, updated_at) VALUES ('cfg.signin', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    JSON.stringify({ policy, secrets }),
    nowIso(),
  );
}

async function attendance() {
  const a = await admin();
  await syncFromUsers(a);
  const emp = async (email: string) => (await get<{ id: string; code: string }>("SELECT e.id, e.code FROM employees e JOIN users u ON u.id = e.user_id WHERE u.email = ?", email))!;
  const [hana, dawit, yonas] = [await emp("hana@demo.local"), await emp("dawit@demo.local"), await emp("yonas@demo.local")];
  await run("UPDATE employees SET manager_id = ? WHERE id = ?", hana.id, dawit.id);
  // Every day a workday, so the test works on weekends too.
  const cfg = await att.attendanceConfig();
  await att.saveAttendanceConfig(a, { shifts: cfg.shifts.map((s) => ({ ...s, workdays: [0, 1, 2, 3, 4, 5, 6] })) });
  const k = await att.createKiosk(a, "Main entrance");
  const pin = await att.resetPin(a, yonas.id);
  await att.newBadges(a, [hana.id]);
  const badge = (await get<{ badge: string }>("SELECT badge FROM att_badges WHERE employee_id = ?", hana.id))!.badge;
  return { setup: k.code, pin, yonasCode: yonas.code, badge, dawit: dawit.id };
}

const PREPS: Record<string, () => Promise<unknown>> = {
  async attendance() {
    await passwordOnly();
    return attendance();
  },
  async "face-checkin"() {
    await passwordOnly();
    const r = await attendance();
    await att.saveAttendanceConfig(await admin(), { methods: { web: true, kiosk: true, mobile: false, face: true } });
    return r;
  },
  async "batch-a"() {
    await passwordOnly();
  },
  async "batch-b"() {
    await passwordOnly();
    const o = await upsertAccount({ name: "Owner", email: "owner@demo.local", title: "Owner", roles: ["owner"], password: "Demo-Workflow-2026", mustChangePassword: false });
    await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } }), o.id);
    await syncFromUsers(await admin());
  },
  async "batch-c"() {
    await passwordOnly();
    const id = async (e: string) => (await get<{ id: string }>("SELECT id FROM users WHERE email = ?", e))!.id;
    const [h, d] = [await id("hana@demo.local"), await id("dawit@demo.local")];
    const gid = uid("grp_");
    await run("INSERT INTO chat_groups (id, name, kind, created_by, created_at) VALUES (?, 'Recording team', 'group', ?, ?)", gid, h, nowIso());
    for (const u of [h, d]) await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, 'member', ?)", gid, u, nowIso());
    return { group: gid };
  },
  // The real defaults (two-step required for Admin), plus a mock single sign-on provider the test runs on :3999.
  async signin() {
    const policy = structuredClone(DEFAULT_SIGNIN_POLICY);
    policy.providers.oidc = { enabled: true, domains: [], onlyFor: [], name: "Mock SSO", issuer: "http://localhost:3999", clientId: "myseed-test" };
    await run(
      "INSERT INTO settings (key, value, updated_at) VALUES ('cfg.signin', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      JSON.stringify({ policy, secrets: { oidc: await seal("s3cret") } }),
      nowIso(),
    );
  },
  async system() {
    await passwordOnly();
  },
  // A Dev team member (Dina) and a Dev lead (Leul), for the department sidebar.
  async navigation() {
    await passwordOnly();
    const seen = JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } });
    for (const [name, email] of [["Dina", "dina@demo.local"], ["Leul", "leul@demo.local"]]) {
      const u = await upsertAccount({ name, email, title: "Developer", roles: ["developer"], password: "Demo-Workflow-2026", mustChangePassword: false });
      await run("UPDATE users SET prefs = ? WHERE id = ?", seen, u.id);
    }
    const leul = (await get<{ id: string }>("SELECT id FROM users WHERE email = 'leul@demo.local'"))!.id;
    await run("INSERT INTO department_positions (department, user_id, position) VALUES ('dev', ?, 'lead') ON CONFLICT DO NOTHING", leul);
    await syncFromUsers(await admin());
  },
  // A site on 196.188.10.0/24 (the test sends that address as the proxy would), QR, network, shared computer and
  // lead recording on, a shift covering the whole day, Hana as Dawit's lead, and a PIN for Yonas.
  async "qr-checkin"() {
    await passwordOnly();
    const a = await admin();
    await syncFromUsers(a);
    const { saveCaptureConfig, captureConfig, posterCode } = await import("../../src/server/attendance-capture");
    const emp = async (email: string) => (await get<{ id: string; code: string }>("SELECT e.id, e.code FROM employees e JOIN users u ON u.id = e.user_id WHERE u.email = ?", email))!;
    const [hana, dawit, yonas] = [await emp("hana@demo.local"), await emp("dawit@demo.local"), await emp("yonas@demo.local")];
    await run("UPDATE employees SET manager_id = ? WHERE id = ?", hana.id, dawit.id);
    const cfg = await att.attendanceConfig();
    await att.saveAttendanceConfig(a, {
      shifts: cfg.shifts.map((s) => ({ ...s, start: "00:00", end: "23:59", workdays: [0, 1, 2, 3, 4, 5, 6], lunch: { from: "00:00", to: "23:59", minutes: 60 }, shortBreaks: { count: 2, minutes: 15, paid: true } })),
    });
    const base = await captureConfig();
    const c = await saveCaptureConfig(a, {
      ...base,
      methods: { qr: true, network: true, shared: true, leadScan: true },
      window: { beforeMin: 600, afterMin: 900 },
      sites: [{ id: "", name: "Head office", networks: ["196.188.10.0/24"], lat: null, lng: null, radiusM: 150, checks: { network: true, location: false, device: false }, posterKey: "", posterAt: "" }],
    });
    const pin = await att.resetPin(a, yonas.id);
    return { siteId: c.sites[0]!.id, code: posterCode(c.sites[0]!), pin, yonasCode: yonas.code };
  },
};

async function main() {
  const name = process.argv[2]!;
  const prep = PREPS[name];
  if (prep) out((await prep()) ?? {});
  await closeDb();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
