import { get, nowIso, run, tx, uid } from "./db";
import { createItem, recordStageCompletion, type Ctx } from "./workflow";
import { subjectCode } from "./workspace-data";
import { runsStage } from "./importer";
import { can, type AppUser } from "./users";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";

/*
 * The Uploading team's video tracker (CSV: row, title, grade, subject, unit, part, status, owner, notes, duplicate, updated).
 * A row means the uploader has the edited file, so Recording and Editing are done. Status then says how far it got:
 *   Missing      the uploader has not received the file yet (nothing beyond what is already recorded)
 *   Not Started  received, not uploaded yet               -> waiting in Uploading
 *   Completed    uploaded                                 -> waiting in Publication
 *   Verified     published                                -> Published
 * Several rows for the same part (re-exports, colour-graded copies) count once, at the furthest status.
 * Parts the curriculum tracker does not list yet are added, so this file and the Recording team's file
 * together give the full trace. Running it again is safe: stages already done are left alone.
 */

export type TraceRow = {
  key: string;
  grade: string;
  subject: string;
  unit: number | null;
  part: number | null;
  rows: string;
  titles: string;
  trackerStatus: string;
  inRecorderFile: boolean;
  before: string;
  after: string;
  action: "create" | "update" | "skip" | "error";
  note: string;
};

export type VideoTrackerResult = {
  dryRun: boolean;
  jobId: string | null;
  counts: { rows: number; parts: number; create: number; update: number; skip: number; error: number };
  trace: TraceRow[];
};

// Who may load it: planners, the curriculum tracker owners, or the Uploading team.
export function canImportVideoTracker(user: AppUser) {
  return can(user, "import.run") || can(user, "import.tracker") || (can(user, "import.stage") && runsStage(user, "uploading"));
}

const REQUIRED = ["grade", "subject", "unit", "part", "status"];

export function isVideoTrackerHeader(headers: string[]) {
  const h = headers.map((x) => x.trim().toLowerCase());
  return REQUIRED.every((r) => h.includes(r));
}

// How far a tracker status takes a part: the number of stages done (Recording = 1 ... Publication = 4).
function reach(status: string): number {
  const s = status.trim().toLowerCase();
  if (s === "missing") return 0;
  if (["verified", "published", "live"].includes(s)) return 4;
  if (["completed", "complete", "uploaded", "done"].includes(s)) return 3;
  return 2;
}

const STATUS_RANK = (s: string) => [0, 0, 1, 2, 3][reach(s)];

// n = stages done: 0 is in Recording, 2 is in Uploading, 4 is Published.
const positionLabel = (n: number) => (n >= 4 ? "Published" : `In ${STAGE_LABELS[STAGES[n]]}`);

const num = (v: string | undefined, title: string, words: RegExp) => {
  const n = Number((v ?? "").trim());
  if (Number.isInteger(n) && n > 0) return n;
  const m = words.exec(title);
  return m ? Number(m[1]) : null;
};

export async function importVideoTracker(
  text: string,
  opts: { dryRun: boolean; actorId: string | null; fileName: string; createMissing?: boolean },
): Promise<VideoTrackerResult> {
  const Papa = (await import("papaparse")).default;
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase() });
  const createMissing = opts.createMissing ?? true;
  const now = nowIso();

  // Group rows by part; the furthest status wins.
  type Group = { grade: number; subject: string; unit: number | null; part: number | null; rows: string[]; titles: string[]; status: string; notes: string[]; updated: string | null };
  const groups = new Map<string, Group>();
  const trace: TraceRow[] = [];
  for (const [i, r] of parsed.data.entries()) {
    const title = (r.title ?? "").trim();
    const rowNo = r.row?.trim() || String(i + 2);
    const grade = num(r.grade, title, /grade\s*(\d+)/i);
    const subject = (r.subject ?? "").trim();
    const unit = num(r.unit, title, /(?:unit|chapter)\s*(\d+)/i);
    const part = num(r.part, title, /\b(?:part|par|p)\s*(\d+)/i);
    if (!grade || !subject || !unit || !part) {
      trace.push({
        key: `row ${rowNo}`,
        grade: grade ? `Grade ${grade}` : "",
        subject,
        unit,
        part,
        rows: rowNo,
        titles: title,
        trackerStatus: r.status ?? "",
        inRecorderFile: false,
        before: "",
        after: "",
        action: "skip",
        note: !part ? "No part number (review questions or similar). Add it in the app by hand." : "Grade, subject or unit is missing.",
      });
      continue;
    }
    const key = `G${String(grade).padStart(2, "0")}-${subjectCode(subject)}-U${unit}-P${part}`;
    const g = groups.get(key) ?? { grade, subject, unit, part, rows: [], titles: [], status: r.status ?? "", notes: [], updated: null };
    g.rows.push(rowNo);
    g.titles.push(title);
    if (STATUS_RANK(r.status ?? "") > STATUS_RANK(g.status)) g.status = r.status ?? "";
    if (r.notes?.trim()) g.notes.push(r.notes.trim());
    if (r.updated?.trim() && !Number.isNaN(Date.parse(r.updated)) && (!g.updated || r.updated > g.updated)) g.updated = r.updated.trim();
    groups.set(key, g);
  }

  const ctx: Ctx = { actor: null, now, source: "import", silent: true };
  let jobId: string | null = null;
  if (!opts.dryRun) {
    jobId = uid("job_");
    ctx.jobId = jobId;
    await run(
      "INSERT INTO jobs (id, kind, template, mode, file_name, status, dry_run, total_rows, actor_id, created_at) VALUES (?, 'import', 'video_tracker', 'upsert', ?, 'running', 0, ?, ?, ?)",
      jobId,
      opts.fileName,
      parsed.data.length,
      opts.actorId,
      now,
    );
  }

  for (const [key, g] of groups) {
    const row: TraceRow = {
      key,
      grade: `Grade ${g.grade}`,
      subject: g.subject,
      unit: g.unit,
      part: g.part,
      rows: g.rows.join(" "),
      titles: g.titles.join(" | "),
      trackerStatus: g.status,
      inRecorderFile: false,
      before: "",
      after: "",
      action: "update",
      note: g.rows.length > 1 ? `${g.rows.length} rows for this part, counted once.` : "",
    };
    trace.push(row);
    const note = (s: string) => (row.note = [row.note, s].filter(Boolean).join(" "));
    try {
      const grade = await get<{ id: string }>("SELECT id FROM grades WHERE code = ?", `G${String(g.grade).padStart(2, "0")}`);
      const subject = await get<{ id: string; name: string }>("SELECT id, name FROM subjects WHERE code = ?", subjectCode(g.subject));
      if (!grade || !subject) {
        row.action = "error";
        note(`${!grade ? `Grade ${g.grade}` : g.subject} is not in the curriculum. Import the curriculum tracker first.`);
        continue;
      }
      const unit = await get<{ id: string }>("SELECT id FROM units WHERE grade_id = ? AND subject_id = ? AND number = ?", grade.id, subject.id, g.unit);
      const lesson = unit ? await get<{ id: string; source_ref: string | null }>("SELECT id, source_ref FROM lessons WHERE unit_id = ? AND number = ?", unit.id, g.part) : undefined;
      const item = lesson
        ? await get<{ id: string; lifecycle: string; stage: Stage | null }>(
            "SELECT id, lifecycle, stage FROM items WHERE lesson_id = ? AND lifecycle NOT IN ('archived','cancelled') ORDER BY created_at LIMIT 1",
            lesson.id,
          )
        : undefined;
      row.inRecorderFile = !!lesson?.source_ref && !lesson.source_ref.startsWith("vt:");
      const current = !item || item.lifecycle === "draft" ? 0 : item.lifecycle === "published" ? 4 : STAGES.indexOf(item.stage!);
      const target = reach(g.status);
      row.before = !item ? "Not in the app" : item.lifecycle === "draft" ? "Draft" : positionLabel(current);
      if (!lesson && !createMissing) {
        row.action = "skip";
        row.after = row.before;
        note("Part is not in the curriculum; adding parts is turned off.");
        continue;
      }
      if (!lesson) {
        row.action = "create";
        note(unit ? "Part added (only in the upload tracker)." : "Unit and part added (only in the upload tracker).");
      }
      row.after = positionLabel(Math.max(current, target));
      if (target <= current && lesson && item) {
        row.action = "skip";
        note(target === 0 ? "Missing: the uploader has not received the edited file." : "Already at or past this point.");
        continue;
      }
      if (target === 0) note("Missing: the uploader has not received the edited file.");
      if (opts.dryRun) continue;

      const doneAt = g.updated ? new Date(g.updated).toISOString() : now;
      await tx(async () => {
        let unitId = unit?.id;
        if (!unitId) {
          unitId = uid("unt_");
          await run(
            "INSERT INTO units (id, curriculum_id, grade_id, subject_id, number, title, source_ref) VALUES (?, (SELECT id FROM curricula WHERE active = 1 LIMIT 1), ?, ?, ?, ?, ?)",
            unitId,
            grade.id,
            subject.id,
            g.unit,
            `Unit ${g.unit}`,
            `vt:${key.replace(/-P\d+$/, "")}`,
          );
          await run("INSERT INTO grade_subjects (grade_id, subject_id) VALUES (?, ?) ON CONFLICT DO NOTHING", grade.id, subject.id);
        }
        let lessonId = lesson?.id;
        if (!lessonId) {
          lessonId = uid("les_");
          await run(
            "INSERT INTO lessons (id, unit_id, number, title, language, planned_deliverables, source_ref, created_at) VALUES (?, ?, ?, ?, 'en', 1, ?, ?)",
            lessonId,
            unitId,
            g.part,
            `Part ${g.part}`,
            `vt:${key}`,
            now,
          );
        }
        const itemId =
          item?.id ??
          (
            await createItem(ctx, {
              lessonId,
              gradeId: grade.id,
              subjectId: subject.id,
              title: `${subject.name} Grade ${g.grade} Unit ${g.unit} Part ${g.part}`,
              provenance: "imported",
              sourceReference: `vt:${key}`,
            })
          ).id;
        for (let s = current; s < target; s++)
          await recordStageCompletion(ctx, itemId, STAGES[s], {
            doneAt,
            note: [`From the upload tracker (${opts.fileName}, row ${g.rows.join(", ")})`, ...g.notes].join(". "),
          });
      });
    } catch (err) {
      row.action = "error";
      note(err instanceof Error ? err.message : String(err));
    }
  }

  trace.sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }));
  const counts = {
    rows: parsed.data.length,
    parts: groups.size,
    create: trace.filter((t) => t.action === "create").length,
    update: trace.filter((t) => t.action === "update").length,
    skip: trace.filter((t) => t.action === "skip").length,
    error: trace.filter((t) => t.action === "error").length,
  };
  if (jobId)
    await run(
      "UPDATE jobs SET status = ?, created_count = ?, updated_count = ?, skipped_count = ?, error_count = ?, report = ?, finished_at = ? WHERE id = ?",
      counts.error ? "completed_with_errors" : "completed",
      counts.create,
      counts.update,
      counts.skip,
      counts.error,
      JSON.stringify({ trace }),
      nowIso(),
      jobId,
    );
  return { dryRun: opts.dryRun, jobId, counts, trace };
}
