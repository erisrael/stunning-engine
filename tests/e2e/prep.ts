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
  // This test checks in from the Attendance page, so Admin allows "from the app anywhere" (off by default).
  await att.saveAttendanceConfig(a, { shifts: cfg.shifts.map((s) => ({ ...s, workdays: [0, 1, 2, 3, 4, 5, 6] })), methods: { ...cfg.methods, anywhere: true } });
  const k = await att.createKiosk(a, "Main entrance");
  const pin = await att.resetPin(a, yonas.id);
  await att.newBadges(a, [hana.id]);
  const badge = (await get<{ badge: string }>("SELECT badge FROM att_badges WHERE employee_id = ?", hana.id))!.badge;
  return { setup: k.code, pin, yonasCode: yonas.code, badge, dawit: dawit.id };
}

const PREPS: Record<string, () => Promise<unknown>> = {
  // Phase 13b: the AI assistant on (the server runs with AI_FAKE=1, a stand-in model), for a developer.
  async "assistant-ai"() {
    await passwordOnly();
    const { saveAiConfig } = await import("../../src/server/assistant-ai");
    const { setPosition } = await import("../../src/server/departments");
    const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
    const u = await upsertAccount({ name: "Abebe", email: "abebe@demo.local", title: "Developer", roles: ["developer"], password: "Demo-Workflow-2026", mustChangePassword: false });
    await setPosition(admin, "dev", u.id, "member");
    await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } }), u.id);
    await saveAiConfig(admin, { on: true, model: "claude-opus-5-5", effort: "low", offRoles: [], dailyLimit: 0, actions: true, key: "sk-ant-e2e" });
    return {};
  },
  // The main pages on a phone.
  async mobile() {
    await passwordOnly();
    return {};
  },
  // Admin's sidebar links, Branding and the icon packs.
  async branding() {
    await passwordOnly();
    return {};
  },
  // Admin, People: deactivate and delete.
  async accounts() {
    await passwordOnly();
    return {};
  },
  // Phase 14: Dawit (a team member who cannot send bulk email) and Yonas each have a mailbox in the app; the server
  // runs with MAIL_FAKE=1, so mail is kept in memory.
  async mail() {
    await passwordOnly();
    for (const [email, address] of [
      ["dawit@demo.local", "dawit@myseed.test"],
      ["yonas@demo.local", "yonas@myseed.test"],
    ] as const) {
      const u = (await get<{ id: string; name: string }>("SELECT id, name FROM users WHERE email = ?", email))!;
      await run(
        "INSERT INTO email_senders (id, address, display_name, user_id, smtp_user, smtp_pass_enc, is_default, active, mailbox, managed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, 'cpanel', ?, ?)",
        uid("snd_"),
        address,
        u.name,
        u.id,
        address,
        await seal("not-used-in-test-mode"),
        nowIso(),
        nowIso(),
      );
    }
    return {};
  },
  // The Dev flow: a lead, a developer and a tester; a bug in the intake, a task to do, one in code review.
  async flow() {
    await passwordOnly();
    const a = await admin();
    const { setPosition } = await import("../../src/server/departments");
    const { getDeptConfig, saveDeptConfig } = await import("../../src/server/dept-config");
    const { saveTask } = await import("../../src/server/work");
    const { applyFlowPreset } = await import("../../src/lib/dept-flow");
    const mk = async (key: string, name: string) =>
      (await loadUser((await upsertAccount({ name, email: `${key}@demo.local`, title: "Developer", roles: ["developer"], password: "Demo-Workflow-2026", mustChangePassword: false })).id))!;
    const lead = await mk("devlead", "Tigist (tech lead)");
    const dev = await mk("dev", "Bereket");
    const tester = await mk("tester", "Mahlet (QA)");
    const seen = JSON.stringify({ tour: { seen: ["member", "lead", "department", "manager", "owner"] } });
    for (const u of [lead, dev, tester]) await run("UPDATE users SET prefs = ? WHERE id = ?", seen, u.id);
    await setPosition(a, "dev", lead.id, "lead");
    const cfg = applyFlowPreset(await getDeptConfig("dev"), "dev");
    Object.assign(cfg.flow.stages.find((s) => s.status === "qa")!, { checkers: "people", people: [tester.id] });
    cfg.features.sprints = true;
    await saveDeptConfig(a, "dev", cfg, (await getDeptConfig("dev")).version);
    const bug = await saveTask(lead, "dev", { title: "Login button does nothing on Android", type: "bug", description: "Reported by two students." });
    const feat = await saveTask(lead, "dev", { title: "Dark mode for the lesson player", type: "feature", assigneeId: dev.id, status: "todo", estimateHours: 6 });
    const rev = await saveTask(lead, "dev", { title: "Cache curriculum on the phone", type: "improvement", assigneeId: dev.id, status: "review" });
    return { bug, feat, rev };
  },
  async attendance() {
    await passwordOnly();
    return attendance();
  },
  async "face-checkin"() {
    await passwordOnly();
    const r = await attendance();
    await att.saveAttendanceConfig(await admin(), { methods: { anywhere: true, kiosk: true, mobile: false, face: true } });
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
  // Customer support on: Liya leads, Sara answers the App queue, an app without signed customers.
  async support() {
    await passwordOnly();
    const a = await admin();
    const sd = await import("../../src/server/support-desk");
    const id = async (email: string) => (await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id;
    await sd.saveSupportConfig(a, { enabled: true, leads: [await id("liya@demo.local")], ringSeconds: 60 });
    const q = await sd.saveQueue(a, { name: "App and account", keywords: ["login"], members: [await id("sara@demo.local")], slaFirstMin: 30, slaResolveMin: 480 });
    await sd.saveApp(a, { name: "Myseed App", origins: [], queueId: q, verifyIdentity: false, greeting: "Selam! How can we help?" });
    return { key: (await sd.listApps(a))[0]!.publicKey };
  },
  // Attendance kept by hand, employee rules, payroll for everyone, recognition: Admin is also Finance Manager, QR is on
  // (so the scanner shows in the top bar), and Sara has finished work this month.
  async "people-ops"() {
    await passwordOnly();
    const a = await admin();
    await syncFromUsers(a);
    await run("INSERT INTO role_assignments (user_id, role) VALUES (?, 'finance_manager') ON CONFLICT DO NOTHING", a.id);
    const { saveCaptureConfig, captureConfig } = await import("../../src/server/attendance-capture");
    const base = await captureConfig();
    await saveCaptureConfig(a, { ...base, methods: { ...base.methods, qr: true }, sites: [{ id: "", name: "Head office", networks: ["196.188.10.0/24"], lat: null, lng: null, radiusM: 150, checks: { network: true, location: false, device: false }, posterKey: "", posterAt: "" }] });
    const sara = (await get<{ id: string }>("SELECT id FROM users WHERE email = 'sara@demo.local'"))!.id;
    for (let i = 0; i < 3; i++)
      await run("INSERT INTO dept_tasks (id, dept, code, title, status, status_category, assignee_id, due_date, created_at, updated_at, completed_at) VALUES (?, 'dev', ?, 'Done work', 'done', 'done', ?, '2099-01-01', ?, ?, ?)", uid("tsk_"), `PO-${i}`, sara, nowIso(), nowIso(), nowIso());
    const dawit = (await get<{ id: string }>("SELECT e.id FROM employees e JOIN users u ON u.id = e.user_id WHERE u.email = 'dawit@demo.local'"))!.id;
    return { dawit };
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
      methods: { qr: true, network: true, shared: true, leadScan: true, scanner: true },
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
