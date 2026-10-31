// Checks the team rules on a copy of the demo database.
import { all, get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { getSettings, saveSetting } from "../../src/server/settings";
import * as wf from "../../src/server/workflow";
import * as ed from "../../src/server/editorial";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  if (ok) pass++;
  else fail++;
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
  const [hana, dawit, meron, yonas] = [await by("hana@demo.local"), await by("dawit@demo.local"), await by("meron@demo.local"), await by("yonas@demo.local")];
  const items = await all<{ id: string; code: string }>("SELECT i.id, i.code FROM items i JOIN lessons l ON l.id = i.lesson_id ORDER BY l.number");
  const [p1, p2, p3, p4] = items;
  check("four draft parts", items.length === 4);
  const gradeIds = (await all<{ id: string }>("SELECT id FROM grades")).map((g) => g.id);

  const e0 = await ed.assignCandidates(meron, { stage: "editing", gradeIds, subjectIds: [] });
  check("editing assign hides parts not recorded", e0.rows.length === 0 && e0.hidden === 4 && e0.intake === "handed_over", e0);
  const r0 = await ed.assignCandidates(hana, { stage: "recording", gradeIds, subjectIds: [] });
  check("recording assign lists every planned part", r0.rows.length === 4 && r0.hidden === 0);

  await ed.bulkAssign(hana, { stage: "recording", rows: [p1, p2, p3].map((p) => ({ itemId: p.id, userId: dawit.id })) });
  const d = { actor: dawit };
  for (const p of [p1, p2]) await wf.startWork(d, p.id, { switchFrom: true });
  const fill = async (id: string) => {
    await wf.addAsset(d, id, { kind: "raw", url: `https://drive.example/${id}`, cameraCode: "00001" } as never);
    for (const c of (await getSettings()).checklists.recording) if (c.required) await wf.setChecklist(d, id, c.key, true);
  };
  await fill(p1.id);
  await wf.submitToLead(d, p1.id, { note: "Recorded" });
  check("sent work waits with the lead", (await wf.currentAttempt(p1.id))!.status === "lead_review");

  let cands = await ed.handoverCandidates(hana);
  check("unapproved work is not offered for handover", cands.length === 0, cands.map((c) => [c.code, c.stage_status]));
  const lead = { actor: hana };
  check("lead cannot hand over in-progress work", !!(await throws(() => wf.submitHandoff(lead, p2.id))));
  check("lead cannot hand over unapproved work", !!(await throws(() => wf.submitHandoff(lead, p1.id))));
  await wf.leadDecide(lead, p1.id, { decision: "approve" });
  cands = await ed.handoverCandidates(hana);
  check("approved work is offered, in-progress is not", cands.length === 1 && cands[0].id === p1.id, cands.map((c) => c.code));
  const ho = await ed.createHandover(hana, { itemIds: [p1.id, p2.id] });
  const bad = ho.results.find((r) => r.id === p2.id);
  check("handover refuses in-progress work", !!ho.handoverId && !bad?.ok && /not marked done/i.test(bad?.error ?? ""), ho.results);

  const e1 = await ed.assignCandidates(meron, { stage: "editing", gradeIds, subjectIds: [] });
  check("editing sees only the handed-over part", e1.rows.length === 1 && e1.rows[0].id === p1.id && e1.hidden === 3, { rows: e1.rows.map((r) => r.code), hidden: e1.hidden });

  await ed.decideHandover(meron, ho.handoverId!, { itemIds: [p1.id], decision: "accepted" });
  const due = await get<{ stage_due_at: string | null }>("SELECT stage_due_at FROM stage_assignments WHERE item_id = ? AND stage = 'editing'", p1.id);
  const days = due?.stage_due_at ? Math.round((Date.parse(due.stage_due_at) - Date.now()) / 864e5) : null;
  check("editing due date follows days to finish (3)", days === 3, due);

  // Missing work leaves the next team's list.
  await fill(p2.id);
  await wf.finishWork(d, p2.id);
  await wf.submitToLead(d, p2.id);
  await wf.leadDecide(lead, p2.id, { decision: "approve" });
  const ho2 = await ed.createHandover(hana, { itemIds: [p2.id] });
  await ed.decideHandover(meron, ho2.handoverId!, { itemIds: [p2.id], decision: "missing", note: "No audio on the second camera" });
  const e2 = await ed.assignCandidates(meron, { stage: "editing", gradeIds, subjectIds: [] });
  check("part marked missing leaves the editing list", !e2.rows.some((r) => r.id === p2.id), e2.rows.map((r) => r.code));
  check("missing part is back with Recording", (await wf.currentAttempt(p2.id))!.stage === "recording");

  // Work in progress limit.
  const s = await getSettings();
  await saveSetting("teams", { ...s.teams, recording: { ...s.teams.recording, wipLimit: 1 }, editing: { ...s.teams.editing, leadReview: false } });
  await wf.startWork(d, p2.id, { switchFrom: true }).catch(() => null);
  const wip = await throws(() => wf.startWork(d, p3.id, { switchFrom: true }));
  check("work in progress limit stops a second start", !!wip && /at most 1/.test(wip), wip);

  // Without lead review, sent work is ready at once.
  await wf.assignStage({ actor: meron }, p1.id, { stage: "editing", userId: yonas.id });
  const y = { actor: yonas };
  await wf.startWork(y, p1.id);
  await wf.addAsset(y, p1.id, { kind: "master", url: "https://drive.example/m1" } as never);
  await wf.addAsset(y, p1.id, { kind: "captions", url: "https://drive.example/c1" } as never);
  await wf.addAsset(y, p1.id, { kind: "thumbnail", url: "https://drive.example/t1" } as never);
  await wf.setDurations(y, p1.id, { actualDurationMin: 12 });
  for (const c of (await getSettings()).checklists.editing) if (c.required) await wf.setChecklist(y, p1.id, c.key, true);
  await wf.submitToLead(y, p1.id);
  check("no lead review: sent work is ready for handover", (await wf.currentAttempt(p1.id))!.status === "ready");
  const ho3 = await ed.createHandover(meron, { itemIds: [p1.id] });
  check("editing lead hands over to uploading", !!ho3.handoverId && ho3.results[0].ok, ho3.results);
  void p4;
  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
}
main();
