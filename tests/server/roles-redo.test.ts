// Redo instead of In progress (a team lead's return, a next team's return, a redo request), the Roles and permissions
// "By role" grid (every capability in one View, Edit, Delete or Update box), the Assistant Manager role (production
// read only; studio sessions and presenters to run), the separate session and presenter permissions, and the team
// overview Recording members see.
import { all, get, closeDb, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { getSettings, getPermissionMatrix, savePermissionMatrix } from "../../src/server/settings";
import { upsertAccount } from "../../src/server/workspace-data";
import * as wf from "../../src/server/workflow";
import * as ss from "../../src/server/sessions";
import * as pr from "../../src/server/presenters";
import { listItems } from "../../src/server/queries";
import { emptyFilters } from "../../src/lib/filters";
import { myWork, teamOverview } from "../../src/server/team-flow";
import { CAPABILITIES, CRUD_AREAS, DEFAULT_PERMISSIONS, ROLES, isRedo, sheetStatusLabel, type Capability } from "../../src/lib/domain";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
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
  const [admin, hana, dawit] = [await by("admin@demo.local"), await by("hana@demo.local"), await by("dawit@demo.local")];

  // ---------------------------------------------------------------- labels
  check("redo work reads Redo, not In progress", sheetStatusLabel("recording", "in_progress", null, true) === "Redo" && sheetStatusLabel("recording", "in_progress", null, false) === "In progress");
  check("redo to do and paused say so", sheetStatusLabel("editing", "queued", null, true) === "Redo, to do" && sheetStatusLabel("editing", "paused", null, true) === "Redo, paused");
  check("finished redo work reads as usual", sheetStatusLabel("recording", "finished", null, true) === "Done, not sent");
  check("publication keeps its own words", sheetStatusLabel("publication", "queued", null, true) === "In review");
  check("returned and redo requests are redo; a restore is not", isRedo("returned", "x") && isRedo("reopened", "Audio: bad") && !isRedo("reopened", "Restored: oops") && !isRedo("initial", null) && isRedo("initial", null, 1));

  // ---------------------------------------------------------------- a team lead's return
  const items = await all<{ id: string; code: string }>("SELECT i.id, i.code FROM items i JOIN lessons l ON l.id = i.lesson_id ORDER BY l.number");
  const p1 = items[0]!;
  await wf.assignStage({ actor: admin }, p1.id, { stage: "recording", userId: dawit.id }).catch(() => null);
  const d = { actor: dawit };
  await wf.startWork(d, p1.id, { switchFrom: true });
  await wf.addAsset(d, p1.id, { kind: "raw", url: "https://drive.example/raw-redo", cameraCode: "00011" } as never);
  for (const c of (await getSettings()).checklists.recording) if (c.required) await wf.setChecklist(d, p1.id, c.key, true);
  await wf.submitToLead(d, p1.id);
  const rowOf = async () => (await listItems(admin, emptyFilters(), new Date().toISOString(), { ids: [p1.id] })).rows.find((r) => r.id === p1.id);
  check("before a return it is not redo", (await rowOf())?.redo === false, await rowOf());
  await wf.leadDecide({ actor: hana }, p1.id, { decision: "return", note: "Board is out of focus" });
  check("the lead's return marks the attempt", Number((await get<{ v: number }>("SELECT lead_returned AS v FROM stage_attempts a JOIN items i ON i.current_attempt_id = a.id WHERE i.id = ?", p1.id))?.v) === 1);
  let r = await rowOf();
  check("lists show it as redo", r?.redo === true && r.stages.recording.redo === true, r?.stages.recording);
  check("its label is Redo, paused", sheetStatusLabel("recording", r!.stage_status, r!.substate, r!.redo) === "Redo, paused");
  await wf.startWork(d, p1.id, { switchFrom: true });
  r = await rowOf();
  check("started again it reads Redo (not In progress)", r?.stage_status === "in_progress" && sheetStatusLabel("recording", r.stage_status, r.substate, r.redo) === "Redo");
  const card = (await myWork(dawit)).items.find((x) => x.id === p1.id);
  check("the member's board knows it is a redo", card?.redo === true);

  // ---------------------------------------------------------------- the team overview
  const ov = await teamOverview(dawit, "recording");
  check("members see the team overview with the redo counted", ov.counts.redo >= 1 && ov.open.some((x) => x.id === p1.id && x.redo), ov.counts);
  check("the overview lists the team's people", ov.people.some((p) => p.id === dawit.id && p.redo >= 1));
  check("Recording members have the overview by default", (await getPermissionMatrix()).recording.includes("team.overview"));

  // ---------------------------------------------------------------- the grid
  const all_ = CRUD_AREAS.flatMap((a) => Object.values(a.caps).flat()) as Capability[];
  check("every capability is in exactly one box of the grid", CAPABILITIES.every((c) => all_.filter((x) => x === c.key).length === 1), CAPABILITIES.filter((c) => all_.filter((x) => x === c.key).length !== 1).map((c) => c.key));
  check("studio sessions and presenters have all four boxes", ["sessions", "presenters"].every((k) => { const a = CRUD_AREAS.find((x) => x.key === k)!; return !!(a.caps.v && a.caps.e && a.caps.d && a.caps.u); }));

  // ---------------------------------------------------------------- the Assistant Manager
  check("the Assistant Manager role exists", (ROLES as readonly string[]).includes("assistant_manager"));
  const am = (await loadUser((await upsertAccount({ name: "Assistant Abeba", email: "am@demo.local", title: "Assistant manager", roles: ["assistant_manager"] as never, password: "Assistant-Mgr-2026!", mustChangePassword: false })).id))!;
  const caps = (k: Capability) => am.perms.includes(k);
  check("sees production", caps("nav.overview") && caps("nav.list") && caps("items.detail") && caps("reports.view"));
  check("cannot create, plan, close or override production", !caps("items.create") && !caps("items.plan") && !caps("items.close") && !caps("work.override"));
  check("cannot update a part's status", !!(await throws(() => wf.startWork({ actor: am }, items[1]!.id, { switchFrom: true }))));
  check("cannot edit a part's planning", !!(await throws(() => wf.updateItemFields({ actor: am }, items[1]!.id, { title: "Changed by AM" } as never))));
  check("runs studio sessions", (await ss.canPlanSessions(am)) && (await ss.canCancelSessions(am)) && (await ss.seesAllSessions(am)));
  const day = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  const batch = await ss.bookSession(am, { date: day, time: "09:00", durationMin: 60, room: "Studio C", presenter: "Teacher Sara", itemIds: [items[2]!.id] });
  check("books a session", !!batch);
  await ss.moveSession(am, batch, { date: day, time: "10:00" });
  check("moves it", (await ss.sessionWeek(am, ss.weekStartOf(day, 1))).bookings.some((b) => b.batchId === batch));
  const pid = await pr.savePresenter(am, { name: "Teacher Sara", kind: "teacher", subjects: "Biology" });
  check("registers a presenter", !!pid && (await pr.listPresenters(am)).some((p) => p.id === pid));
  await pr.setPresenterDepartment(am, pid, "production");
  check("assigns a presenter", (await get<{ department: string }>("SELECT department FROM presenters WHERE id = ?", pid))?.department === "production");
  check("does not see presenter fees", !!(await throws(() => pr.statements(am, new Date().toISOString().slice(0, 7)))));
  const { templateList } = await import("../../src/server/importer");
  const { curriculumAccess } = await import("../../src/server/curriculum-fix");
  check("no Curriculum by default", !curriculumAccess(am));
  check("Admin keeps Curriculum", curriculumAccess(admin));
  check("imports nothing by default", templateList(am).length === 0, templateList(am).map((t) => t.key).join(","));
  {
    const m0 = await getPermissionMatrix();
    await savePermissionMatrix({ ...m0, assistant_manager: [...m0.assistant_manager!, "import.stage"] }, admin.id);
    const amI = (await loadUser(am.id))!;
    const keys = templateList(amI).map((t) => t.key);
    check("imports progress once Admin allows it", keys.includes("progress") && !keys.includes("curriculum") && !keys.includes("users"), keys.join(","));
    await savePermissionMatrix(m0, admin.id);
  }
  check("the role is on Admin's list with defaults", JSON.stringify((await getPermissionMatrix()).assistant_manager?.slice().sort()) === JSON.stringify(DEFAULT_PERMISSIONS.assistant_manager.slice().sort()));

  // ---------------------------------------------------------------- the boxes are enforced
  const m = await getPermissionMatrix();
  await savePermissionMatrix({ ...m, assistant_manager: m.assistant_manager!.filter((c) => c !== "sessions.cancel" && c !== "presenters.remove") }, admin.id);
  const am2 = (await loadUser(am.id))!;
  check("without Delete, cancelling a session is refused", /Cancel permission/.test((await throws(() => ss.setSessionStatus(am2, batch, "cancelled"))) ?? ""));
  check("without Delete, deleting a session is refused", /Cancel permission/.test((await throws(() => ss.deleteSessions(am2, [batch]))) ?? ""));
  check("without Delete, taking a presenter off the list is refused", /Remove permission/.test((await throws(() => pr.savePresenter(am2, { id: pid, name: "Teacher Sara", active: false }))) ?? ""));
  await savePermissionMatrix({ ...m, assistant_manager: m.assistant_manager!.filter((c) => c !== "sessions.book") }, admin.id);
  const am3 = (await loadUser(am.id))!;
  check("without Edit, booking is refused but changing is not", !!(await throws(() => ss.bookSession(am3, { date: day, time: "14:00", durationMin: 30, room: "Studio C", itemIds: [items[3]!.id] }))) && !(await throws(() => ss.moveSession(am3, batch, { date: day, time: "11:00" }))));
  await savePermissionMatrix({ ...m, assistant_manager: m.assistant_manager!.filter((c) => c !== "sessions.update") }, admin.id);
  const am4 = (await loadUser(am.id))!;
  check("without Update, changing is refused", !!(await throws(() => ss.moveSession(am4, batch, { date: day, time: "12:00" }))));
  await savePermissionMatrix(m, admin.id);
  check("a plain member still cannot book", !!(await throws(() => ss.bookSession(dawit, { date: day, time: "16:00", durationMin: 30, room: "Studio D", itemIds: [items[3]!.id] }))));
  await run("DELETE FROM recording_sessions WHERE batch_id = ?", batch);

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
