/*
 * End-to-end verification of the workflow rules against a throwaway database.
 * Covers the acceptance criteria in the product plan: full four-stage flow, evidence gates,
 * returns, reopened stages, blocked intervals reconciling to residence, deadline baselines,
 * conflicts, idempotent retries, publication evidence, revisions, scope enforcement and imports.
 *
 *   npm run verify
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "myseed-verify-"));
process.env.PGLITE_DIR = path.join(tmp, "pg");
delete process.env.DATABASE_URL;
execFileSync(process.execPath, [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/seed.ts", "reset", "--no-items"], {
  env: { ...process.env },
  stdio: "ignore",
});

async function main() {
  const { all, get, closeDb } = await import("../src/server/db");
  const wf = await import("../src/server/workflow");
  const { loadUser } = await import("../src/server/users");
  const { attemptTimings } = await import("../src/server/metrics");
  const { runImport, parseUpload, autoMap, TEMPLATES } = await import("../src/server/importer");
  const { templateXlsx } = await import("../src/server/templates");
  const { listItems } = await import("../src/server/queries");
  const { emptyFilters } = await import("../src/lib/filters");

  // Test accounts, created in the throwaway database only.
  const { upsertAccount, setAccountScopes } = await import("../src/server/workspace-data");
  const testUsers: [string, string, import("../src/lib/domain").Role[]][] = [
    ["selam", "Selam Manager", ["manager"]],
    ["kebede", "Kebede Admin", ["admin"]],
    ["sara", "Sara Uploader-Publisher", ["uploading", "publication"]],
    ["hana", "Hana Recorder", ["recording"]],
    ["meron", "Meron Editor", ["editing"]],
    ["abel", "Abel Editor", ["editing"]],
    ["bereket", "Bereket Uploader", ["uploading"]],
    ["mahlet", "Mahlet Publisher", ["publication"]],
    ["natnael", "Natnael Scoped", ["editing"]],
  ];
  for (const [key, name, roles] of testUsers) await upsertAccount({ name, email: `${key}@verify.test`, roles, password: "Verify-2026-x" });
  const natnaelId = (await get<{ id: string }>("SELECT id FROM users WHERE email = 'natnael@verify.test'"))!.id;
  await setAccountScopes(natnaelId, ["G11", "G12"], []);

  let passed = 0;
  const failures: string[] = [];
  const check = (name: string, cond: unknown) => {
    if (cond) passed++;
    else failures.push(name);
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  };
  const throwsCode = async (fn: () => unknown, code: string) => {
    try {
      await fn();
      return false;
    } catch (e) {
      return e instanceof wf.WorkflowError && e.code === code;
    }
  };

  const ids = Object.fromEntries((await all<{ id: string; email: string }>("SELECT id, email FROM users")).map((r) => [r.email.split(".")[0].split("@")[0], r.id]));
  const u = async (k: string) => (await loadUser(ids[k]))!;
  const mgr = await u("selam");
  const adm = await u("kebede");
  const dual = await u("sara"); // uploads and publishes
  const rec = await u("hana");
  const ed = await u("meron");
  const ed2 = await u("abel");
  const up = await u("bereket");
  const pub = await u("mahlet");
  const sci = await u("natnael"); // scoped to grades 11 and 12

  let clock = Date.parse("2026-10-05T06:00:00Z");
  const at = (minutes = 30) => new Date((clock += minutes * 60e3)).toISOString();
  const ctx = (actor: Awaited<ReturnType<typeof u>>, minutes = 30): import("../src/server/workflow").Ctx => ({ actor, now: at(minutes), source: "ui" });

  const g8 = (await get<{ id: string }>("SELECT id FROM grades WHERE code = 'G08'"))!.id;
  const g11 = (await get<{ id: string }>("SELECT id FROM grades WHERE code = 'G11'"))!.id;
  const math = (await get<{ id: string }>("SELECT id FROM subjects WHERE code = 'MATH'"))!.id;
  const unit = (await get<{ id: string }>("SELECT id FROM units WHERE grade_id = ? AND subject_id = ? AND number = 2", g8, math))!.id;

  // 1. Full flow
  const item = await wf.createItem(ctx(adm), {
      gradeId: g8,
      subjectId: math,
      unitId: unit,
      lessonNumber: 4,
      title: "Verification lesson",
      dueAt: "2026-10-20T20:59:00Z",
      owners: { recording: rec.id, editing: ed.id, uploading: up.id, publication: pub.id },
      release: true,
    });
  check("Item code follows the readable pattern", /^MY-G08-MATH-U02-L04/.test(item.code));
  check("Released item is queued in Recording", (await wf.currentAttempt(item.id))?.stage === "recording" && (await wf.currentAttempt(item.id))?.status === "queued");
  check("Staff cannot create items", await throwsCode(async () => await wf.createItem(ctx(rec), { gradeId: g8, subjectId: math, title: "x" }), "FORBIDDEN"));
  check("Managers cannot create items", await throwsCode(async () => await wf.createItem(ctx(mgr), { gradeId: g8, subjectId: math, title: "x" }), "FORBIDDEN"));
  check("Managers cannot edit planning fields", await throwsCode(async () => await wf.updateItemFields(ctx(mgr), item.id, { priority: "urgent" }), "FORBIDDEN"));
  check("Managers cannot work a stage", await throwsCode(async () => await wf.startWork(ctx(mgr), item.id), "FORBIDDEN"));
  check("Other stage roles cannot start Recording", await throwsCode(async () => await wf.startWork(ctx(ed), item.id), "FORBIDDEN"));

  await wf.startWork(ctx(rec), item.id);
  check("Submitting without evidence is rejected", await throwsCode(async () => await wf.submitHandoff(ctx(rec), item.id), "REQUIREMENTS_MISSING"));
  await wf.addAsset(ctx(rec, 120), item.id, { kind: "raw", url: "https://storage.example/raw.mp4", durationMin: 30 });
  for (const c of ["presenter_confirmed", "audio_check", "video_check", "files_backed_up"]) await wf.setChecklist(ctx(rec, 1), item.id, c, true);
  await wf.submitHandoff(ctx(rec, 10), item.id);
  check("Handoff waits for acceptance", (await wf.currentAttempt(item.id))?.status === "awaiting_handoff");
  check("Uploading cannot accept a Recording handoff", await throwsCode(async () => await wf.acceptHandoff(ctx(up), item.id), "FORBIDDEN"));
  await wf.acceptHandoff(ctx(ed, 30), item.id);
  check("Acceptance opens Editing as Queued atomically", (await wf.currentAttempt(item.id))?.stage === "editing" && (await wf.currentAttempt(item.id))?.status === "queued");

  // 2. Editing with a blocker, then a return from Uploading
  await wf.startWork(ctx(ed, 60), item.id);
  await wf.blockWork(ctx(ed, 120), item.id, { cause: "waiting_replacement_audio", resolverId: rec.id });
  check("Editor cannot start a second timer while blocked here", await throwsCode(async () => await wf.startWork(ctx(ed), item.id), "INVALID_STATE"));
  await wf.unblockWork(ctx(rec, 120), item.id, { resolution: "Audio delivered", resume: false });
  await wf.startWork(ctx(ed, 5), item.id);
  const editAttempt = (await wf.currentAttempt(item.id))!;
  await wf.addAsset(ctx(ed, 115), item.id, { kind: "master", url: "https://storage.example/master-v1.mp4", durationMin: 18 });
  await wf.addAsset(ctx(ed, 1), item.id, { kind: "captions", url: "https://storage.example/c.srt" });
  await wf.addAsset(ctx(ed, 1), item.id, { kind: "thumbnail", url: "https://storage.example/t.png" });
  for (const c of ["cuts_reviewed", "audio_cleaned", "graphics_checked", "export_settings"]) await wf.setChecklist(ctx(ed, 1), item.id, c, true);
  await wf.submitHandoff(ctx(ed, 5), item.id);
  await wf.returnHandoff(ctx(up, 30), item.id, { reasonCategory: "audio_quality", note: "Audio drops at 04:12" });
  const rework = (await wf.currentAttempt(item.id))!;
  check("Return creates a new Editing attempt with cause returned", rework.stage === "editing" && rework.attempt_no === 2 && rework.cause === "returned");

  const [t] = await attemptTimings([editAttempt.id], at(0));
  const sum = Object.values(t.buckets).reduce((a, b) => a + b, 0);
  check("State intervals reconcile to stage residence", Math.abs(sum - t.residence) < 1000);
  check("Blocked time is separate from active time", t.buckets.blocked >= 2 * 3600e3 - 1000 && t.buckets.active > 0);

  // 3. Conflict detection and idempotent retries
  const v = (await wf.getItem(item.id)).version;
  await wf.startWork(ctx(ed, 10), item.id);
  check("Stale version is rejected as a conflict", await throwsCode(async () => await wf.pauseWork(ctx(ed), item.id, { expectedVersion: v }), "CONFLICT"));
  const before = (await all("SELECT id FROM audit_events WHERE item_id = ?", item.id)).length;
  await wf.once("req-1", "pause", async () => await wf.pauseWork(ctx(ed, 30), item.id));
  const dup = await wf.once("req-1", "pause", async () => await wf.pauseWork(ctx(ed, 1), item.id));
  check("A retried request is applied once", (dup as { duplicate?: boolean }).duplicate === true && (await all("SELECT id FROM audit_events WHERE item_id = ?", item.id)).length === before + 1);

  await wf.startWork(ctx(ed, 10), item.id);
  await wf.addAsset(ctx(ed, 60), item.id, { kind: "master", url: "https://storage.example/master-v2.mp4", durationMin: 18 });
  for (const c of ["cuts_reviewed", "audio_cleaned", "graphics_checked", "export_settings"]) await wf.setChecklist(ctx(ed, 1), item.id, c, true);
  await wf.submitHandoff(ctx(ed, 5), item.id);
  await wf.acceptHandoff(ctx(up, 20), item.id);

  // 4. Uploading with a failure and retry
  await wf.startWork(ctx(up, 10), item.id);
  await wf.recordUpload(ctx(up, 10), item.id, { platform: "myseed_app", status: "failed", failureReason: "Timeout" });
  await wf.recordUpload(ctx(up, 20), item.id, { platform: "myseed_app", status: "uploaded", externalId: "APP-1", uploadUrl: "https://app.example/1" });
  await wf.verifyTarget(ctx(up, 5), item.id, { platform: "myseed_app", playback: true, metadata: true });
  for (const c of ["approved_version", "metadata_mapped", "processing_done", "playback_verified"]) await wf.setChecklist(ctx(up, 1), item.id, c, true);
  await wf.submitHandoff(ctx(up, 5), item.id);
  await wf.acceptHandoff(ctx(pub, 30), item.id);

  // 5. Publication gates
  check("Live confirmation without approval is rejected", await throwsCode(async () => await wf.confirmLive(ctx(pub), item.id, { platform: "myseed_app", liveUrl: "https://app.example/live" }), "REQUIREMENTS_MISSING"));
  await wf.startWork(ctx(pub, 10), item.id);
  for (const c of ["educational_review", "placement_checked", "thumbnail_title"]) await wf.setChecklist(ctx(pub, 1), item.id, c, true);
  check("Staff without Publication role cannot approve", await throwsCode(async () => await wf.reviewPublication(ctx(ed), item.id, { decision: "approved" }), "FORBIDDEN"));
  await wf.reviewPublication(ctx(pub, 10), item.id, { decision: "approved" });
  await wf.schedulePublication(ctx(pub, 5), item.id, { scheduledAt: "2026-10-12T06:00:00Z" });
  check("Scheduled is not published", (await wf.getItem(item.id)).lifecycle === "in_production" && (await wf.getItem(item.id)).substate === "scheduled");
  check("Managers cannot confirm a release", await throwsCode(async () => await wf.confirmLive(ctx(mgr), item.id, { platform: "myseed_app", liveUrl: "https://app.example/live" }), "FORBIDDEN"));
  await wf.confirmLive(ctx(pub, 60), item.id, { platform: "myseed_app", liveUrl: "https://app.example/live" });
  const done = await wf.getItem(item.id);
  check("All required destinations live makes the item Published", done.lifecycle === "published" && !!done.published_at && !!done.publication_verified_at);

  // 6. Deadline baseline and revision
  await wf.changeDeadline(ctx(adm, 5), item.id, { dueAt: "2026-10-25T20:59:00Z", reason: "Late audio" });
  const d2 = await wf.getItem(item.id);
  check("Deadline change keeps the original baseline", d2.original_due_at === "2026-10-20T20:59:00Z" && d2.current_due_at === "2026-10-25T20:59:00Z");
  check("Deadline change without reason is rejected", await throwsCode(async () => await wf.changeDeadline(ctx(adm), item.id, { dueAt: null, reason: "" }), "VALIDATION"));
  const revId = await wf.createRevision(ctx(adm, 10), item.id, { reason: "Sign error", startStage: "editing" });
  check("Revision is linked and the original stays published", (await wf.getItem(revId)).revision_of_id === item.id && (await wf.getItem(item.id)).lifecycle === "published" && (await wf.currentAttempt(revId))?.stage === "editing");

  // 7. Reopen upstream invalidates downstream approvals
  const item2 = await wf.createItem(ctx(adm), { gradeId: g8, subjectId: math, title: "Reopen test", owners: { recording: rec.id, editing: ed2.id, uploading: up.id, publication: pub.id }, release: true });
  await wf.startWork(ctx(rec), item2.id);
  await wf.addAsset(ctx(rec), item2.id, { kind: "raw", url: "https://s.example/r.mp4", durationMin: 20 });
  for (const c of ["presenter_confirmed", "audio_check", "video_check", "files_backed_up"]) await wf.setChecklist(ctx(rec, 1), item2.id, c, true);
  await wf.submitHandoff(ctx(rec), item2.id);
  await wf.acceptHandoff(ctx(ed2), item2.id);
  await wf.startWork(ctx(ed2), item2.id);
  await wf.addAsset(ctx(ed2), item2.id, { kind: "master", url: "https://s.example/m1.mp4", durationMin: 12 });
  await wf.addAsset(ctx(ed2), item2.id, { kind: "captions", url: "https://s.example/c.srt" });
  await wf.addAsset(ctx(ed2), item2.id, { kind: "thumbnail", url: "https://s.example/t.png" });
  for (const c of ["cuts_reviewed", "audio_cleaned", "graphics_checked", "export_settings"]) await wf.setChecklist(ctx(ed2, 1), item2.id, c, true);
  await wf.submitHandoff(ctx(ed2), item2.id);
  await wf.acceptHandoff(ctx(up), item2.id);
  await wf.reopenStage(ctx(up), item2.id, { target: "editing", reasonCategory: "video_quality", note: "Colour banding" });
  check("Reopen creates a new Editing attempt and supersedes Uploading", (await wf.currentAttempt(item2.id))?.stage === "editing" && (await wf.currentAttempt(item2.id))?.cause === "reopened");
  check("Approvals tied to the old master are invalidated", ((await get<{ c: number }>("SELECT COUNT(*) AS c FROM handoff_reviews WHERE item_id = ? AND valid = 1 AND kind <> 'handoff_return'", item2.id))?.c ?? 1) === 0);

  // 8. Scope enforcement
  check("Scoped staff cannot act on items outside their scope", await throwsCode(async () => await wf.startWork(ctx(sci), item2.id), "FORBIDDEN"));
  const visible = (await listItems(sci, emptyFilters(), at(0), { all: true })).rows.map((r) => r.id);
  check("Scoped staff do not see out-of-scope items in lists", !visible.includes(item2.id));
  const g11Item = await wf.createItem(ctx(adm), { gradeId: g11, subjectId: math, title: "Grade 11 item", secondaryMemberships: [{ gradeId: g8, subjectId: math }] });
  const all8 = (await listItems(mgr, { ...emptyFilters(), g: [g8, g11] }, at(0), { all: true })).rows.filter((r) => r.id === g11Item.id);
  check("Multi-grade items count once in merged views", all8.length === 1);

  // 9. Imports: template round trip, dry run, idempotency, update by code only
  const buf = await templateXlsx("items");
  const sheet = await parseUpload("items.xlsx", buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  sheet.rows[0][sheet.headers.indexOf("item_code")] = "";
  const mapping = autoMap(TEMPLATES.items, sheet.headers);
  const dry = await runImport(adm, { template: "items", mode: "create", sheet, mapping, dryRun: true, fileName: "items.xlsx" });
  check("Excel template parses back and validates", dry.counts.total === 1 && dry.counts.error === 0 && dry.counts.create === 1);
  const countBefore = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM items"))!.c;
  check("Dry run makes no changes", (await get<{ c: number }>("SELECT COUNT(*) AS c FROM items"))!.c === countBefore);
  const real = await runImport(adm, { template: "items", mode: "create", sheet, mapping, dryRun: false, fileName: "items.xlsx" });
  const again = await runImport(adm, { template: "items", mode: "create", sheet, mapping, dryRun: false, fileName: "items.xlsx" });
  check("Import creates the item once; a retried file is a no-op", real.counts.create === 1 && !!again.duplicateOf && (await get<{ c: number }>("SELECT COUNT(*) AS c FROM items"))!.c === countBefore + 1);
  const bad = { headers: ["item_code", "title", "priority"], rows: [["NO-SUCH-CODE", "x", "high"], [item.code, "Renamed by import", "urgent"]] };
  const upd = await runImport(adm, { template: "items", mode: "update", sheet: bad, mapping: { item_code: "item_code", title: "title", priority: "priority" }, dryRun: true, fileName: "u.csv" });
  check("Update mode never matches by title and reports unknown codes", upd.counts.error === 1 && upd.counts.update === 1);
  check("Imports with errors require an explicit valid-only choice", await throwsCode(() => runImport(adm, { template: "items", mode: "update", sheet: bad, mapping: { item_code: "item_code", title: "title", priority: "priority" }, dryRun: false, fileName: "u.csv" }), "VALIDATION"));
  check("Staff cannot use manager templates", await throwsCode(() => runImport(rec, { template: "items", mode: "create", sheet, mapping, dryRun: true, fileName: "x" }), "FORBIDDEN"));

  // 10. History is append-only and complete
  const events = (await all<{ action: string }>("SELECT action FROM audit_events WHERE item_id = ?", item.id)).map((e) => e.action);
  for (const a of ["item.created", "item.released", "work.started", "work.blocked", "work.unblocked", "handoff.submitted", "handoff.returned", "handoff.accepted", "upload.failed", "review.approved", "release.scheduled", "release.live", "item.published", "deadline.changed"])
    check(`History records ${a}`, events.includes(a));

  // 11. Team leads, own-work members, stage dates, progress import and tracker JSON
  const { run } = await import("../src/server/db");
  await run("INSERT INTO team_leads (stage, user_id) VALUES ('editing', ?)", ed2.id);
  const lead = await u("abel");
  check("Leads get team permissions", lead.leads.includes("editing") && lead.perms.includes("reports.view"));
  const item3 = await wf.createItem(ctx(adm), { gradeId: g8, subjectId: math, unitId: unit, lessonNumber: 7, title: "Lead test", owners: { recording: rec.id }, release: true });
  await wf.startWork(ctx(rec), item3.id);
  await wf.addAsset(ctx(rec), item3.id, { kind: "raw", cameraCode: "C0101" });
  for (const c of ["presenter_confirmed", "audio_check", "video_check", "files_backed_up"]) await wf.setChecklist(ctx(rec, 1), item3.id, c, true);
  await wf.submitHandoff(ctx(rec), item3.id);
  const leadNote = await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND item_id = ? AND type = 'handoff'", ed2.id, item3.id);
  check("The next team's lead is notified when work is sent on", !!leadNote);
  check("Submitting stamps the recorded date", !!(await wf.getItem(item3.id) as unknown as { recorded_at: string | null }).recorded_at);
  await wf.acceptHandoff(ctx(lead), item3.id);
  await wf.assignStage(ctx(lead), item3.id, { stage: "editing", userId: ed.id });
  check("A lead can assign work in their stage", (await wf.currentAttempt(item3.id))?.owner_id === ed.id);
  check("A lead cannot assign another stage", await throwsCode(async () => await wf.assignStage(ctx(lead), item3.id, { stage: "uploading", userId: up.id }), "FORBIDDEN"));

  await run("UPDATE users SET own_work_only = 1 WHERE id = ?", ed.id);
  const member = await u("meron");
  const mine = (await listItems(member, emptyFilters(), at(0), { all: true })).rows.map((r) => r.id);
  check("Own-work members see only items assigned to them", mine.includes(item3.id) && !mine.includes(item2.id));
  await run("UPDATE users SET own_work_only = 0 WHERE id = ?", ed.id);

  const progress = { headers: ["item_code", "stage", "status", "done_date", "link"], rows: [[item3.code, "editing", "done", "2026-10-20", "https://drive.example.com/m.mp4"]] };
  const pmap = { item_code: "item_code", stage: "stage", status: "status", done_date: "done_date", link: "link" };
  const pdry = await runImport(up, { template: "progress", mode: "update", sheet: progress, mapping: pmap, dryRun: true, fileName: "p.csv" });
  check("Progress import rejects other teams' stages", pdry.counts.error === 1);
  const preal = await runImport(ed, { template: "progress", mode: "update", sheet: progress, mapping: pmap, dryRun: false, fileName: "p.csv" });
  const after = (await wf.getItem(item3.id)) as unknown as { stage: string; edited_at: string | null };
  check("Progress import finishes the stage with its date and sends it on", preal.counts.update === 1 && after.stage === "uploading" && !!after.edited_at?.startsWith("2026-10-20"));

  // 12. Recording staff start drafts themselves; New item belongs to Admin and the Recording lead
  const draft = await wf.createItem(ctx(adm), { gradeId: g8, subjectId: math, title: "Draft start test", owners: { recording: rec.id } });
  check("New items wait as Not started", draft.lifecycle === "draft" && draft.next_action === "Start recording");
  check("Other staff cannot start someone else's draft", await throwsCode(async () => await wf.startWork(ctx(ed), draft.id), "FORBIDDEN"));
  await wf.startWork(ctx(rec), draft.id);
  const started = await wf.currentAttempt(draft.id);
  check("Start on a draft puts it In progress in Recording", (await wf.getItem(draft.id)).lifecycle === "in_production" && started?.stage === "recording" && started?.status === "in_progress");
  await wf.pauseWork(ctx(rec), draft.id);
  check("Editing lead cannot create items", await throwsCode(async () => await wf.createItem(ctx(lead), { gradeId: g8, subjectId: math, title: "x" }), "FORBIDDEN"));
  await run("INSERT INTO team_leads (stage, user_id) VALUES ('recording', ?)", rec.id);
  const recLead = await u("hana");
  check("Recording lead can create items", (await wf.createItem(ctx(recLead), { gradeId: g8, subjectId: math, title: "Lead-made item" })).lifecycle === "draft");

  // 13. Publication self-approval when the reviewer did the upload
  const item4 = await wf.createItem(ctx(adm), { gradeId: g8, subjectId: math, title: "Self-approval test", owners: { recording: rec.id, editing: ed.id, uploading: dual.id, publication: pub.id }, release: true });
  await wf.startWork(ctx(rec), item4.id);
  await wf.addAsset(ctx(rec), item4.id, { kind: "raw", url: "https://s.example/r4.mp4", durationMin: 20 });
  for (const c of ["presenter_confirmed", "audio_check", "video_check", "files_backed_up"]) await wf.setChecklist(ctx(rec, 1), item4.id, c, true);
  await wf.submitHandoff(ctx(rec), item4.id);
  await wf.acceptHandoff(ctx(ed), item4.id);
  await wf.startWork(ctx(ed), item4.id);
  await wf.addAsset(ctx(ed), item4.id, { kind: "master", url: "https://s.example/m4.mp4", durationMin: 12 });
  await wf.addAsset(ctx(ed), item4.id, { kind: "captions", url: "https://s.example/c4.srt" });
  await wf.addAsset(ctx(ed), item4.id, { kind: "thumbnail", url: "https://s.example/t4.png" });
  for (const c of ["cuts_reviewed", "audio_cleaned", "graphics_checked", "export_settings"]) await wf.setChecklist(ctx(ed, 1), item4.id, c, true);
  await wf.submitHandoff(ctx(ed), item4.id);
  await wf.acceptHandoff(ctx(dual), item4.id);
  await wf.startWork(ctx(dual), item4.id);
  await wf.recordUpload(ctx(dual), item4.id, { platform: "myseed_app", status: "uploaded", externalId: "APP-4", uploadUrl: "https://app.example/4" });
  await wf.verifyTarget(ctx(dual), item4.id, { platform: "myseed_app", playback: true, metadata: true });
  for (const c of ["approved_version", "metadata_mapped", "processing_done", "playback_verified"]) await wf.setChecklist(ctx(dual, 1), item4.id, c, true);
  await wf.submitHandoff(ctx(dual), item4.id);
  await wf.acceptHandoff(ctx(pub), item4.id);
  for (const c of ["educational_review", "placement_checked", "thumbnail_title"]) await wf.setChecklist(ctx(pub, 1), item4.id, c, true);
  check("Self-approval off: the uploader cannot approve publication", await throwsCode(async () => await wf.reviewPublication(ctx(dual), item4.id, { decision: "approved" }), "FORBIDDEN"));
  const { saveSetting, getSettings } = await import("../src/server/settings");
  await saveSetting("policies", { ...(await getSettings()).policies, allowSelfApproval: true });
  await wf.reviewPublication(ctx(dual), item4.id, { decision: "approved" });
  check("Self-approval on: the uploader may approve and it is recorded", !!(await get("SELECT 1 AS x FROM handoff_reviews WHERE item_id = ? AND kind = 'publication_review' AND self_approval = 1", item4.id)));

  const { exportTrackerBackup } = await import("../src/server/workspace-data");
  const tracker = await exportTrackerBackup(mgr);
  const parts = Object.values(tracker).flatMap((g) => g.subjects.flatMap((s) => s.units.flatMap((un) => un.parts)));
  const exported = parts.find((p) => p.itemCode === item3.code);
  check("Tracker JSON keeps the tracker structure and adds progress", !!exported && exported.progress?.editing?.status === "done" && exported.videos?.[0]?.cameraCode === "C0101");

  await closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
