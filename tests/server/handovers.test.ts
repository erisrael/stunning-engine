// Phase 31: Approvals lists handovers; a rejection is cross-checked on its own page before it goes to To do with high
// priority (or is overturned); a report gives the dates and times; booking a studio is optional and configurable.
process.env.MAIL_FAKE = "1";
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as wf from "../../src/server/workflow";
import * as ed from "../../src/server/editorial";
import { handoverConfig, saveHandoverConfig } from "../../src/server/handover-config";
import { handoverReport } from "../../src/server/handover-report";
import { shellCounts } from "../../src/server/shell";
import { myWork } from "../../src/server/team-flow";
import type { Stage } from "../../src/lib/domain";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, re: RegExp) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return re.test(String(e));
  }
};

// A lead of the stage who holds nothing else, so the rights tested are a lead's and not a manager's.
async function leadOf(stage: Stage, email: string): Promise<AppUser> {
  const u = await upsertAccount({ name: `${stage} lead`, email, title: "Lead", roles: [stage], leads: [stage], password: "Handover-2026!", mustChangePassword: false } as never);
  const loaded = (await loadUser(u.id))!;
  return loaded.leads.includes(stage) ? loaded : ({ ...loaded, leads: [...loaded.leads, stage] } as AppUser);
}

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const recLead = await leadOf("recording", "rec.lead@handover.local");
  const editLead = await leadOf("editing", "edit.lead@handover.local");
  const cfg = await handoverConfig();
  check("cross-check is on by default, studio booking optional, rejected work high", cfg.crossCheck && cfg.studioBooking === "optional" && cfg.rejectedPriority === "high", cfg);

  const sys = { actor: null, source: "bulk" as const, silent: true };
  const grade = (await get<{ id: string }>("SELECT id FROM grades ORDER BY sort LIMIT 1"))!.id;
  const subject = (await get<{ id: string }>("SELECT subject_id AS id FROM grade_subjects WHERE grade_id = ? LIMIT 1", grade))!.id;
  const make = async (title: string) => {
    const it = await wf.createItem({ actor: null, source: "seed" }, { gradeId: grade, subjectId: subject, title, owners: { recording: recLead.id } });
    await wf.releaseToProduction(sys, it.id);
    return it;
  };
  const toHandoff = async (id: string) => {
    const at = (await wf.currentAttempt(id))!;
    await wf.addAsset(sys, id, { kind: "raw", cameraCode: "C0001", url: "https://drive.example.com/raw" });
    for (const c of (await wf.evaluateRequirements(id)).filter((x) => !x.met && x.key.startsWith("check:"))) await wf.setChecklist(sys, id, c.key.slice(6), true).catch(() => {});
    await wf.setDurations(sys, id, { rawDurationMin: 10 }).catch(() => {});
    await run("UPDATE stage_attempts SET status = 'ready' WHERE id = ?", at.id);
    await wf.submitHandoff(sys, id, {});
  };
  const [a, b, c] = [await make("Part A"), await make("Part B"), await make("Part C")];
  for (const x of [a, b, c]) await toHandoff(x.id);
  check("the parts are waiting for Editing", (await wf.currentAttempt(a.id))?.status === "awaiting_handoff", await wf.currentAttempt(a.id));

  const ho = await ed.createHandover(admin, { itemIds: [a.id, b.id, c.id], note: "Batch" });
  check("a handover is created", !!ho.handoverId && ho.results.every((r) => r.ok), ho);
  const hid = ho.handoverId!;
  check("the receiving lead has it to check", Number((await shellCounts(editLead)).incoming) >= 1);

  // Reject: waits for the cross-check, nothing goes back yet.
  await ed.decideHandover(editLead, hid, { itemIds: [a.id, b.id], decision: "missing", note: "No audio", reasonCategory: "audio_quality" });
  const held = await wf.currentAttempt(a.id);
  check("a rejected part stays where it is until it is checked", held?.stage === "recording" && held.status === "awaiting_handoff", held);
  check("it is in the rejected list with its reason", (await ed.rejectedList(admin, "to_check")).some((r) => r.item_id === a.id && r.reason === "audio_quality" && r.note === "No audio"));
  check("nobody can accept it meanwhile", await rejects(() => wf.acceptHandoff(sys, a.id, {}), /cross-check/));
  check("nor put it in a new handover", (await ed.createHandover(admin, { itemIds: [a.id] })).handoverId === null);
  check("the person who rejected it cannot check it", (await ed.crossCheckRejection(editLead, { items: [{ handoverId: hid, itemId: a.id }], decision: "confirm" }))[0]?.ok === false);
  check("the sending lead sees it to check", (await ed.crossCheckCount(recLead)) >= 2 && (await shellCounts(recLead)).rejections >= 2);
  check("the handover stays open while a check is waiting", (await get<{ status: string }>("SELECT status FROM handovers WHERE id = ?", hid))?.status === "partial");

  // Confirm: To do with high priority.
  const r1 = await ed.crossCheckRejection(recLead, { items: [{ handoverId: hid, itemId: a.id }], decision: "confirm" });
  check("confirming works", r1[0]?.ok === true, r1);
  const att = await wf.currentAttempt(a.id);
  check("confirmed: back in the team's To do", att?.stage === "recording" && att.status === "queued", att);
  check("with high priority", (await get<{ priority: string }>("SELECT priority FROM items WHERE id = ?", a.id))?.priority === "high");
  const mine = await myWork(recLead);
  const it = mine.items.find((i) => i.id === a.id);
  check("on the owner's board, first and marked, with why", !!it && it.priority === "high" && /No audio/.test(it.returnNote ?? "") && mine.items[0]?.priority === "high", it);

  // Overturn: moves on.
  check("overturning needs a reason", await rejects(() => ed.crossCheckRejection(recLead, { items: [{ handoverId: hid, itemId: b.id }], decision: "overturn" }), /why/));
  const r2 = await ed.crossCheckRejection(recLead, { items: [{ handoverId: hid, itemId: b.id }], decision: "overturn", note: "Audio is fine on the second card" });
  check("overturning works", r2[0]?.ok === true, r2);
  check("overturned: it moves on to Editing", (await wf.currentAttempt(b.id))?.stage === "editing");
  check("and keeps its priority", (await get<{ priority: string }>("SELECT priority FROM items WHERE id = ?", b.id))?.priority === "normal");
  check("the lists follow", (await ed.rejectedList(admin, "confirmed")).some((x) => x.item_id === a.id) && (await ed.rejectedList(admin, "overturned")).some((x) => x.item_id === b.id));

  await ed.decideHandover(editLead, hid, { itemIds: [c.id], decision: "accepted" });
  check("the handover closes when all are decided", (await get<{ status: string }>("SELECT status FROM handovers WHERE id = ?", hid))?.status === "closed");

  // Report.
  const rep = await handoverReport(admin, {});
  const find = (id: string) => rep.rows.find((x) => x.itemId === id && x.handoverId === hid);
  const [ra, rb, rc] = [find(a.id), find(b.id), find(c.id)];
  check("report: sent and rejected date and time, and the check", !!ra?.sentAt && !!ra.decidedAt && !!ra.checkedAt && ra.outcome === "rejected" && ra.reason === "audio_quality", ra);
  check("report: overturned", rb?.outcome === "overturned" && rb.checkNote === "Audio is fine on the second card", rb);
  check("report: accepted, with hours to decide", rc?.outcome === "accepted" && !!rc.decidedAt && rc.hours != null, rc);
  check("report filters by result", (await handoverReport(admin, { outcome: "overturned" })).rows.every((x) => x.outcome === "overturned"));
  check("report filters by date", (await handoverReport(admin, { to: "2000-01-01T00:00:00.000Z" })).rows.length === 0);
  check("report totals add up", rep.totals.sent === rep.rows.length && rep.totals.accepted >= 2 && rep.totals.rejected >= 1, rep.totals);

  // A rejection outside a batch goes through the same check.
  await toHandoff(a.id);
  await ed.rejectHandoff(editLead, a.id, { reasonCategory: "video_quality", note: "Framing" });
  const single = (await ed.rejectedList(admin, "to_check")).find((r) => r.item_id === a.id);
  check("a rejection on its own also waits for the check", single?.note === "Framing", single);
  await ed.crossCheckRejection(recLead, { items: [{ handoverId: single!.handover_id, itemId: a.id }], decision: "confirm" });

  // Configurable.
  check("only Admin changes it", await rejects(() => saveHandoverConfig(editLead, { crossCheck: false }), /Admin/));
  await saveHandoverConfig(admin, { crossCheck: false, rejectedPriority: "urgent" });
  await toHandoff(a.id);
  await ed.rejectHandoff(editLead, a.id, { reasonCategory: "other", note: "Straight back" });
  check("cross-check off: it goes straight back, with the set priority", (await wf.currentAttempt(a.id))?.status === "queued" && (await get<{ priority: string }>("SELECT priority FROM items WHERE id = ?", a.id))?.priority === "urgent");

  await saveHandoverConfig(admin, { crossCheck: true, rejectedPriority: "high", studioBooking: "required" });
  const draft = await wf.createItem({ actor: null, source: "seed" }, { gradeId: grade, subjectId: subject, title: "Studio test" });
  check("studio required: recording cannot start without a session", await rejects(() => wf.startWork({ actor: recLead }, draft.id), /studio session/));
  await saveHandoverConfig(admin, { studioBooking: "optional" });
  await wf.startWork({ actor: recLead }, draft.id);
  check("studio optional: it starts with no session", (await wf.currentAttempt(draft.id))?.status === "in_progress");
  await saveHandoverConfig(admin, { studioBooking: "off" });
  const { bookSession } = await import("../../src/server/sessions");
  check("studio off: nothing can be booked", await rejects(() => bookSession(admin, { date: "2027-01-01", time: "09:00", durationMin: 60, room: "A", itemIds: [draft.id] }), /turned off/));
  await saveHandoverConfig(admin, { studioBooking: "optional" });
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
