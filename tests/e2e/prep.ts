// Prepares a fresh copy of the demo database for one browser test: `tsx tests/e2e/prep.ts <name>`, with
// PGLITE_DIR set to the copy and PREP_FILE where the test reads what it needs (codes, ids).
import fs from "node:fs";
import { all, closeDb, get, nowIso, run, uid } from "../../src/server/db";
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
  const {captureConfig,saveCaptureConfig}=await import("../../src/server/attendance-capture");
  await saveCaptureConfig(a,{...(await captureConfig()),sites:[{id:"",name:"Main Entrance",networks:[],lat:null,lng:null,radiusM:150,checks:{network:false,location:false,device:true},posterKey:"",posterAt:""}]});
  const k = await att.createKiosk(a, "Main entrance");
  const pin = await att.resetPin(a, yonas.id);
  await att.newBadges(a, [hana.id]);
  const badge = (await get<{ badge: string }>("SELECT badge FROM att_badges WHERE employee_id = ?", hana.id))!.badge;
  return { setup: k.code, pin, yonasCode: yonas.code, badge, dawit: dawit.id };
}

// Two handovers from Recording to Editing, a part with a placeholder name, and a routine, for the production test.
async function production() {
  await passwordOnly();
  const wf = await import("../../src/server/workflow");
  const ed = await import("../../src/server/editorial");
  const rt = await import("../../src/server/routines");
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const [hana, dawit] = [await by("hana@demo.local"), await by("dawit@demo.local")];
  const sys = { actor: null, source: "bulk" as const, silent: true };
  const pair = (await get<{ grade_id: string; subject_id: string; grade: string }>("SELECT gs.grade_id, gs.subject_id, g.name AS grade FROM grade_subjects gs JOIN grades g ON g.id = gs.grade_id ORDER BY g.sort LIMIT 1"))!;
  await run("INSERT INTO grades (id, code, name, level, sort, active) VALUES ('grd_g10', 'G10', 'Grade 10', 'Secondary School', 10, 1) ON CONFLICT (code) DO NOTHING");
  const other = { id: "grd_g10" };
  const unit = uid("unt_");
  await run("INSERT INTO units (id, curriculum_id, grade_id, subject_id, number, title) VALUES (?, (SELECT id FROM curricula WHERE active = 1 LIMIT 1), ?, ?, 90, 'Prep unit')", unit, pair.grade_id, pair.subject_id);
  const part = async (n: number, title: string) => {
    const lesson = uid("les_");
    await run("INSERT INTO lessons (id, unit_id, number, title, created_at) VALUES (?, ?, ?, ?, ?)", lesson, unit, String(n), title, nowIso());
    const it = await wf.createItem({ actor: null, source: "seed" }, { lessonId: lesson, gradeId: pair.grade_id, subjectId: pair.subject_id, title, owners: { recording: dawit.id } });
    return { lesson, id: it.id, code: it.code };
  };
  const ready = async (id: string) => {
    await wf.releaseToProduction(sys, id);
    await wf.addAsset(sys, id, { kind: "raw", cameraCode: "C0001", url: "https://drive.example.com/raw" });
    const s = (await import("../../src/server/settings"));
    for (const c of (await s.getSettings()).checklists.recording.filter((x) => x.required)) await wf.setChecklist(sys, id, c.key, true);
    await wf.submitHandoff(sys, id, {});
  };
  const [a, b, bad] = [await part(1, "Accepted part"), await part(2, "Rejected part"), await part(3, "Topic Name")];
  await ready(a.id);
  await ready(b.id);
  const hoA = await ed.createHandover(hana, { itemIds: [a.id] });
  const hoB = await ed.createHandover(hana, { itemIds: [b.id] });
  const routine = await rt.saveRoutine({ ...dawit, activeRole: "recording" } as never, {
    name: "Ask for things",
    steps: [
      { path: "/requests", do: "fill", label: "Title", value: "Lights", ask: true },
      { path: "/requests", do: "click", role: "button", name: "Back" },
      { path: "/requests", do: "click", role: "button", name: "Send" },
    ],
  });
  return { acceptCode: hoA.code, acceptItemCode: a.code, rejectId: hoB.handoverId, rejectCode: b.code, rejectItem: b.id, badLesson: bad.lesson, gradeId: pair.grade_id, gradeName: pair.grade, subjectId: pair.subject_id, otherGradeId: other.id, routine };
}

const PREPS: Record<string, () => Promise<unknown>> = {
  production,
  // A site with a location, leaving it only tells the person (reports every 15 s), Dawit checked in, and a chat.
  async phone() {
    await passwordOnly();
    const a = await admin();
    await syncFromUsers(a);
    const { captureConfig, saveCaptureConfig } = await import("../../src/server/attendance-capture");
    const cap = await captureConfig();
    await saveCaptureConfig(a, { ...cap, sites: [{ id: "", name: "Head office", networks: [], lat: 9.0108, lng: 38.7613, radiusM: 150, checks: { network: false, location: true, device: false }, posterKey: "", posterAt: "" }] });
    const gf = await import("../../src/server/geofence");
    await gf.saveGeofenceConfig(a, { mode: "notify", intervalSec: 15 });
    const emp = (await get<{ id: string }>("SELECT e.id FROM employees e JOIN users u ON u.id = e.user_id WHERE u.email = 'dawit@demo.local'"))!.id;
    const { punchKind } = await import("../../src/server/attendance");
    await punchKind(emp, "in", { at: new Date(Date.now() - 3600e3).toISOString(), source: "web" });
    const { stageGroup } = await import("../../src/server/chat");
    return { group: await stageGroup("recording") };
  },
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
  // Phases 22-23: Agent mode in the docked assistant, the team analyzer for a lead, who members see in People.
  async agent() {
    await passwordOnly();
    const { saveAiConfig } = await import("../../src/server/assistant-ai");
    const { setPosition } = await import("../../src/server/departments");
    const { saveTask } = await import("../../src/server/work");
    const a = await admin();
    const seen = JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } });
    const u = await upsertAccount({ name: "Abebe", email: "abebe@demo.local", title: "Developer", roles: ["developer"], password: "Demo-Workflow-2026", mustChangePassword: false });
    const l = await upsertAccount({ name: "Lena Lead", email: "lena@demo.local", title: "Dev lead", roles: ["developer"], password: "Demo-Workflow-2026", mustChangePassword: false });
    await setPosition(a, "dev", u.id, "member");
    await setPosition(a, "dev", l.id, "lead");
    for (const id of [u.id, l.id, a.id]) await run("UPDATE users SET prefs = ? WHERE id = ?", seen, id);
    const lead = (await loadUser(l.id))!;
    for (let i = 0; i < 4; i++) await saveTask(lead, "dev", { title: `Analyzer task ${i}`, assigneeId: u.id, status: i < 2 ? "in_progress" : "todo", dueDate: i === 0 ? "2020-01-01" : null, priority: i === 3 ? "urgent" : "normal" });
    await saveAiConfig(a, { on: true, model: "claude-opus-5-5", effort: "low", offRoles: [], dailyLimit: 0, actions: true, agent: true, key: "sk-ant-e2e" });
    return {};
  },
  // Phase 24: presentation templates and hand-written slides (Admin presents the company deck).
  async presentations() {
    await passwordOnly();
    const a = await admin();
    await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } }), a.id);
    return {};
  },
  // Phase 25: strategy and M&E (Admin plans).
  async strategy() {
    await passwordOnly();
    const a = await admin();
    await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } }), a.id);
    return {};
  },
  // Phase 26: the Dev team's document library, for a developer.
  async library() {
    await passwordOnly();
    const { setPosition } = await import("../../src/server/departments");
    const a = await admin();
    const u = await upsertAccount({ name: "Abebe", email: "abebe@demo.local", title: "Developer", roles: ["developer"], password: "Demo-Workflow-2026", mustChangePassword: false });
    await setPosition(a, "dev", u.id, "member");
    await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } }), u.id);
    return {};
  },
  // Phase 27: Admin's integrations.
  async integrations() {
    await passwordOnly();
    const a = await admin();
    await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } }), a.id);
    return {};
  },
  // Phase 28: Admin, Platform.
  async platform() {
    await passwordOnly();
    const a = await admin();
    await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } }), a.id);
    return {};
  },
  // Every page opened by a plain member (no access is a friendly message or a redirect, never a crash).
  async access() {
    await passwordOnly();
    const { saveAiConfig } = await import("../../src/server/assistant-ai");
    const a = await admin();
    await saveAiConfig(a, { on: true, offRoles: [], dailyLimit: 0, actions: true, agent: true, key: "sk-ant-e2e" });
    const d = (await get<{ id: string }>("SELECT id FROM users WHERE email = 'dawit@demo.local'"))!;
    await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } }), d.id);
    // Someone with two roles, for switching roles in View as.
    await upsertAccount({ name: "Two Roles", email: "tworoles@demo.local", title: "Editor and uploader", roles: ["editing", "uploading"], password: "Demo-Workflow-2026", mustChangePassword: false });
    await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } }), a.id);
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
    // Hana books studio sessions as the academic manager.
    const hana = (await get<{ id: string }>("SELECT id FROM users WHERE email = 'hana@demo.local'"))!.id;
    await (await import("../../src/server/sessions")).saveSessionsConfig(await admin(), { managers: [hana] });
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
    await production();
    const seen = JSON.stringify({ tour: { seen: ["member", "lead", "publication", "manager", "owner", "department", "hr", "finance"] } });
    for (const [name, email] of [["Dina", "dina@demo.local"], ["Leul", "leul@demo.local"]]) {
      const u = await upsertAccount({ name, email, title: "Developer", roles: ["developer"], password: "Demo-Workflow-2026", mustChangePassword: false });
      await run("UPDATE users SET prefs = ? WHERE id = ?", seen, u.id);
    }
    const leul = (await get<{ id: string }>("SELECT id FROM users WHERE email = 'leul@demo.local'"))!.id;
    await run("INSERT INTO department_positions (department, user_id, position) VALUES ('dev', ?, 'lead') ON CONFLICT DO NOTHING", leul);
    await syncFromUsers(await admin());
    const dina=(await get<{id:string}>("SELECT id FROM users WHERE email='dina@demo.local'"))!.id;
    const cms=await import("../../src/server/legacy-cms");
    await cms.saveLegacyCmsConfig(await admin(),{baseUrl:"http://127.0.0.1:9",autoSync:false});
    await cms.saveUserCmsOverride(await admin(),{userId:dina,allowedTabs:["students"]});

  },
  // Passkeys: two-step sign-in optional for everyone (a passkey makes it apply), passkeys on.
  async passkeys() {
    await passwordOnly({ twoStep: { ...DEFAULT_SIGNIN_POLICY.twoStep, default: "optional", roles: {}, passkey: true } });
    return {};
  },
  // Performance: HR records for everyone; Dawit (recording) reports to Hana (recording lead).
  async performance() {
    await passwordOnly();
    const a = await admin();
    await syncFromUsers(a);
    const emp = async (email: string) => (await get<{ id: string }>("SELECT e.id FROM employees e JOIN users u ON u.id = e.user_id WHERE u.email = ?", email))!.id;
    await run("UPDATE employees SET manager_id = ? WHERE id = ?", await emp("hana@demo.local"), await emp("dawit@demo.local"));
    return {};
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

PREPS["repair-ui"]=async()=>{
 await PREPS.navigation();const a=await admin();
 const settings=await import("../../src/server/settings");await settings.savePermissionMatrix({...await settings.getPermissionMatrix(),qa_2026:["nav.questions"]},a.id);
 const {saveLegacyCmsConfig,createLegacyCmsSnapshot}=await import("../../src/server/legacy-cms");
 await saveLegacyCmsConfig(a,{baseUrl:"http://127.0.0.1:9",username:"fixture",password:"fixture",autoSync:false});
 for(let i=0;i<125;i++) await run("INSERT INTO legacy_cms_records (id,category,external_id,title,data_json,synced_at) VALUES (?,?,?,?,?,?)",`fixture-${i}`,"students",String(i),`Fixture student ${i}`,JSON.stringify({Name:`Fixture student ${i}`,Grade:i%2?"Grade 10":"Grade 1",Status:i%2?"inactive":"active",Date:i<100?"2026-10-01":"2026-11-06",Phone:`090000${String(i).padStart(4,"0")}`}),new Date().toISOString());
 await createLegacyCmsSnapshot(a,{versionName:"Browser verification",category:"students"});
 const {captureConfig,saveCaptureConfig}=await import("../../src/server/attendance-capture");const cfg=await captureConfig();await saveCaptureConfig(a,{...cfg,sites:["Main office","Branch office"].map(name=>({id:"",name,networks:[],lat:null,lng:null,radiusM:100,checks:{network:false,location:false,device:true},posterKey:"",posterAt:""}))});
 return {};
};

PREPS["cms-background"] = PREPS["repair-ui"];

// Update 1.0 Phase 1: sticky context, Kiosk visibility, assistant show and hide. Password sign-in only.
PREPS["update-1"] = async () => {
  await passwordOnly();
  // Grade 12 next to Grade 9, for the Sheet with every grade and for taking several parts at once in My work.
  const { importCurriculumBackup } = await import("../../src/server/workspace-data");
  const hana = await get<{ id: string }>("SELECT id FROM users WHERE email = 'hana@demo.local'");
  const parts = Array.from({ length: 6 }, (_, i) => ({ id: `p-chem-${i + 1}`, title: `Part ${i + 1}: Chemistry topic ${i + 1}`, videos: [] }));
  await importCurriculumBackup({ "grade-12": { name: "Grade 12", type: "Secondary School", subjects: [{ id: "g12-chem", name: "Chemistry", units: [{ id: "u-chem-1", title: "Unit 1: Reactions", parts }] }] } } as never, { createItems: true, actorId: hana!.id, fileName: "grade-12.json" });
  // In production, waiting in Recording with nobody on them.
  const { releaseToProduction } = await import("../../src/server/workflow");
  const a = await admin();
  for (const it of await all<{ id: string }>("SELECT id FROM items WHERE code LIKE '%G12-CHEM%'")) await releaseToProduction({ actor: a, now: nowIso() } as never, it.id, "recording");
  return {};
};

// Update 1.0 Phase 6: the same waiting Grade 12 parts, for a member taking a range and the lead approving it.
PREPS["update-1-phase6"] = async () => PREPS["update-1"]();
// Phase 7: calls in the monitor (Noor failing, Chapa callbacks), kiosk check-in on with one paired kiosk.
PREPS["update-1-phase7"] = async () => {
  await passwordOnly();
  const M = await import("../../src/server/call-monitor");
  for (let i = 0; i < 4; i++) await M.recordCall({ source: "noor", ok: i === 0, status: i === 0 ? 200 : 503, ms: 120, summary: "GET cms.example/admin/students", error: i === 0 ? null : "HTTP 503" });
  await M.recordIncoming("chapa", { ok: true, status: 200, summary: "Webhook charge.success", ref: "tx-e2e-1" });
  const a = await admin();
  await syncFromUsers(a);
  await att.saveAttendanceConfig(a, { methods: { anywhere: true, kiosk: true, mobile: false, face: false } });
  const sites = (await (await import("../../src/server/attendance-capture")).captureConfig()).sites;
  const k = await att.createKiosk(a, "Front desk", sites[0]?.name ?? "Main Entrance");
  await att.pairKiosk(k.code);
};

// The Customer Support home: Sara has only the Support role and is an agent of a queue with a waiting ticket.
PREPS["hotfix-support-home"] = async () => {
  await passwordOnly();
  const sd = await import("../../src/server/support-desk");
  const crypto = await import("node:crypto");
  const a = await admin();
  const sara = (await get<{ id: string }>("SELECT id FROM users WHERE email = 'sara@demo.local'"))!.id;
  await run("DELETE FROM role_assignments WHERE user_id = ?", sara);
  await run("DELETE FROM team_leads WHERE user_id = ?", sara);
  await run("INSERT INTO role_assignments (user_id, role) VALUES (?, 'support')", sara);
  await sd.saveSupportConfig(a, { enabled: true, leads: [] });
  const q = await sd.saveQueue(a, { name: "Help", keywords: [], members: [sara], strategy: "least_busy", slaFirstMin: 30, slaResolveMin: 240 });
  const app = await sd.saveApp(a, { name: "App", origins: ["https://a.example"], queueId: q, verifyIdentity: true });
  const A = await sd.appByKey((await sd.listApps(a))[0]!.publicKey, "https://a.example");
  const c = await sd.identify(A, { id: "c-1", name: "Almaz Bekele", hash: crypto.createHmac("sha256", app.secret!).update("c-1").digest("hex") });
  await sd.customerCreateTicket(A, c.token, { subject: "Video does not load", message: "The grade 6 video stops" });
};

// Update 1.1 connected systems: support on with one connected app (MySeed Academy).
PREPS["update-1-1-live"] = async () => PREPS["update-1-1-systems"]!();
PREPS["update-1-1-systems"] = async () => {
  await passwordOnly();
  const sd = await import("../../src/server/support-desk");
  const a = await admin();
  await sd.saveSupportConfig(a, { enabled: true, leads: [] });
  const q = await sd.saveQueue(a, { name: "Academy", keywords: [], members: [a.id], strategy: "least_busy" });
  await sd.saveApp(a, { name: "MySeed Academy", origins: ["https://academy.example"], queueId: q });
  return { key: (await sd.listApps(a))[0]!.publicKey };
};

// Update 1.1 phase 13: a system with its own bot (token sealed directly, no call to Telegram), two subscribers and
// one piece of feedback waiting.
PREPS["update-1-1-bots"] = async () => {
  const { key } = (await PREPS["update-1-1-systems"]!()) as { key: string };
  const app = (await get<{ id: string }>("SELECT id FROM sup_apps LIMIT 1"))!;
  await run("UPDATE sup_apps SET tg_token = ?, tg_secret = ?, tg_bot = ?, tg_origin = ? WHERE id = ?", await seal("999000:AAe2eBotTokenNotRealAtAll_abc"), "e2esecret", "academy_help_bot", "https://cm.example", app.id);
  const now = nowIso();
  const c1 = uid("cus_");
  await run("INSERT INTO sup_customers (id, app_id, external_id, name, created_at, last_seen_at) VALUES (?, ?, 'tg:501', 'Hana Girma', ?, ?)", c1, app.id, now, now);
  await run("INSERT INTO sup_customers (id, app_id, external_id, name, created_at, last_seen_at) VALUES (?, ?, 'tg:502', 'Abel Tesfaye', ?, ?)", uid("cus_"), app.id, now, now);
  await run("INSERT INTO sup_bot_feedback (id, bot, customer_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'The payment page crashes on my phone', 'new', ?, ?)", uid("bfb_"), app.id, c1, now, now);
  return { key, bot: app.id };
};

// Update 1.1 phase 14: Admin and Sara answer calls in the Academy queue; calls are not recorded (no consent step).
PREPS["update-1-1-calls"] = async () => {
  await passwordOnly();
  const sd = await import("../../src/server/support-desk");
  const a = await admin();
  const sara = (await get<{ id: string }>("SELECT id FROM users WHERE email = 'sara@demo.local'"))!;
  await sd.saveSupportConfig(a, { enabled: true, leads: [], recordCalls: false, ringSeconds: 90, callEscalateSec: 60 });
  const q = await sd.saveQueue(a, { name: "Academy", keywords: [], members: [a.id, sara.id], strategy: "least_busy" });
  await sd.saveApp(a, { name: "MySeed Academy", origins: [], queueId: q });
  return { key: (await sd.listApps(a))[0]!.publicKey };
};

// Update 1.1 phase 15: the knowledge base with one published article and one draft; Admin leads support.
PREPS["update-1-1-kb"] = async () => {
  await passwordOnly();
  const sd = await import("../../src/server/support-desk");
  const kb = await import("../../src/server/kb-guides");
  kb.setYoutubeChecker(async () => ({ ok: true, title: "Prep video" }));
  const a = await admin();
  await sd.saveSupportConfig(a, { enabled: true, leads: [] });
  const q = await sd.saveQueue(a, { name: "Academy", keywords: [], members: [a.id], strategy: "least_busy" });
  await sd.saveApp(a, { name: "MySeed Academy", origins: [], queueId: q });
  await kb.saveKbArticle(a, { title: "Reset your password", body: "Press **Forgot password** on the sign-in page.", category: "Account", published: true });
  await kb.saveKbArticle(a, { title: "Old exam dates", body: "These dates changed.", category: "Account", published: false });
  return { key: (await sd.listApps(a))[0]!.publicKey };
};

// Update 1.0 Phase 8: a Chapa business (for the Overview) and a support app (its widget keeps its own look).
PREPS["update-1-phase8"] = async () => {
  await passwordOnly();
  const { saveChapaAccount } = await import("../../src/server/chapa");
  const sd = await import("../../src/server/support-desk");
  const a = await admin();
  await saveChapaAccount(a, { name: "Subscriptions", secretKey: "CHASECK-AAA", currency: "ETB" });
  await sd.saveSupportConfig(a, { enabled: true, leads: [] });
  const q = await sd.saveQueue(a, { name: "Academy", keywords: [], members: [a.id], strategy: "least_busy" });
  await sd.saveApp(a, { name: "MySeed Academy", origins: [], queueId: q });
  return { key: (await sd.listApps(a))[0]!.publicKey };
};

// Update 1.0 Phase 2: Legacy CMS points at the fake Noor that the browser test starts on this port.
PREPS["update-1-p2"] = async () => {
  await passwordOnly();
  const { saveLegacyCmsConfig } = await import("../../src/server/legacy-cms");
  await saveLegacyCmsConfig(await admin(), { baseUrl: "http://127.0.0.1:47391", username: "fixture", password: "fixture", sessionCookie: "session=fixture", autoSync: false });
  return { port: 47391 };
};

// Update 1.0 Phase 3: two Chapa businesses whose API is the fake the browser test starts (CHAPA_API_BASE).
PREPS["update-1-p3"] = async () => {
  await passwordOnly();
  const { saveChapaAccount } = await import("../../src/server/chapa");
  const a = await admin();
  const sub = await saveChapaAccount(a, { name: "Subscriptions", secretKey: "CHASECK-AAA", webhookSecret: "whsec-A", currency: "ETB" });
  const don = await saveChapaAccount(a, { name: "Donations", secretKey: "CHASECK-BBB", currency: "ETB" });
  return { sub, don };
};

// Admin, Noor access, the new sidebar entries and Finance requests for Admin.
PREPS["noor-access"] = async () => {
  await passwordOnly();
  return {};
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
