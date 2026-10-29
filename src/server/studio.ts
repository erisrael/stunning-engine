// Studio: notes, exams, a question bank and flash card decks, linked to grade, subject, unit and part.
// Content staff write and submit for review; Studio heads and leads approve, request changes and publish.
// Members see their own drafts and everything published; heads, leads and owners see everything.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { deptManagers, requireDept, type DeptAccess } from "./departments";
import type { AppUser } from "./users";
import { RESOURCE_STATUSES, RESOURCE_TYPES, QUESTION_TYPES, type QuestionOption, type ResourceStatus, type ResourceType } from "@/lib/studio";

export type Placement = { gradeId?: string | null; subjectId?: string | null; unitId?: string | null; lessonId?: string | null };

async function checkPlacement(p: Placement) {
  if (p.unitId) {
    const u = await get<{ grade_id: string; subject_id: string }>("SELECT grade_id, subject_id FROM units WHERE id = ?", p.unitId);
    if (!u) throw new WorkflowError("VALIDATION", "Unknown unit.");
    if ((p.gradeId && p.gradeId !== u.grade_id) || (p.subjectId && p.subjectId !== u.subject_id)) throw new WorkflowError("VALIDATION", "The unit does not belong to that grade and subject.");
  }
  if (p.lessonId && !(await get("SELECT 1 AS x FROM lessons WHERE id = ? AND unit_id = ?", p.lessonId, p.unitId ?? ""))) throw new WorkflowError("VALIDATION", "The part does not belong to that unit.");
}

// ---------------------------------------------------------------------------
// Resources: notes, exams, flash card decks
// ---------------------------------------------------------------------------

export type Resource = {
  id: string;
  type: ResourceType;
  title: string;
  grade_id: string | null;
  grade: string | null;
  subject_id: string | null;
  subject: string | null;
  unit_id: string | null;
  unit_number: number | null;
  lesson_id: string | null;
  lesson_number: number | null;
  language: string;
  status: ResourceStatus;
  body: string;
  meta: { durationMin?: number; passMark?: number; instructions?: string };
  author_id: string | null;
  author_name: string | null;
  reviewer_name: string | null;
  review_note: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  count: number; // questions in an exam, cards in a deck
};

export type ResourceFilter = { type: ResourceType; q?: string | null; status?: string | null; gradeId?: string | null; subjectId?: string | null; unitId?: string | null; mine?: boolean; sort?: "updated" | "title" | "status"; dir?: "asc" | "desc" };

function scope(user: AppUser, a: DeptAccess, alias = "r") {
  if (a.manage || a.readOnly) return { sql: "1=1", params: [] as string[] };
  return { sql: `(${alias}.author_id = ? OR ${alias}.status = 'published')`, params: [user.id] };
}

export async function listResources(user: AppUser, f: ResourceFilter): Promise<{ rows: Resource[]; access: DeptAccess }> {
  const a = await requireDept(user, "studio");
  if (!(RESOURCE_TYPES as readonly string[]).includes(f.type)) throw new WorkflowError("VALIDATION", "Unknown type.");
  const sc = scope(user, a);
  const where = ["r.type = ?", sc.sql];
  const params: string[] = [f.type, ...sc.params];
  for (const [col, v] of [
    ["r.status", f.status],
    ["r.grade_id", f.gradeId],
    ["r.subject_id", f.subjectId],
    ["r.unit_id", f.unitId],
  ] as const)
    if (v) {
      where.push(`${col} = ?`);
      params.push(v);
    }
  if (f.mine) {
    where.push("r.author_id = ?");
    params.push(user.id);
  }
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    where.push("(lower(r.title) LIKE ? OR lower(r.body) LIKE ?)");
    params.push(like, like);
  }
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  const order = f.sort === "title" ? `lower(r.title) ${dir}` : f.sort === "status" ? `r.status ${dir}, r.updated_at DESC` : `r.updated_at ${dir}`;
  const rows = await all<Resource & { meta: string }>(
    `SELECT r.*, g.name AS grade, s.name AS subject, u.number AS unit_number, l.number AS lesson_number, ua.name AS author_name, ur.name AS reviewer_name,
       CASE WHEN r.type = 'exam' THEN (SELECT COUNT(*) FROM studio_exam_questions q WHERE q.resource_id = r.id) WHEN r.type = 'flashcards' THEN (SELECT COUNT(*) FROM studio_cards c WHERE c.resource_id = r.id) ELSE 0 END AS count
     FROM studio_resources r LEFT JOIN grades g ON g.id = r.grade_id LEFT JOIN subjects s ON s.id = r.subject_id LEFT JOIN units u ON u.id = r.unit_id
     LEFT JOIN lessons l ON l.id = r.lesson_id LEFT JOIN users ua ON ua.id = r.author_id LEFT JOIN users ur ON ur.id = r.reviewer_id
     WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 1000`,
    ...params,
  );
  return { access: a, rows: rows.map((r) => ({ ...r, meta: parseJson(r.meta, {}), count: Number(r.count), version: Number(r.version) })) };
}

export async function getResource(user: AppUser, id: string) {
  const a = await requireDept(user, "studio");
  const r = (await listResources(user, { type: ((await get<{ type: ResourceType }>("SELECT type FROM studio_resources WHERE id = ?", id))?.type ?? "note") as ResourceType })).rows.find((x) => x.id === id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Not found, or not shared with you yet.");
  const questions =
    r.type === "exam"
      ? (
          await all<Question & { options: string; tags: string; points: number }>(
            "SELECT q.*, e.points FROM studio_exam_questions e JOIN studio_questions q ON q.id = e.question_id WHERE e.resource_id = ? ORDER BY e.sort",
            id,
          )
        ).map((q) => ({ ...q, options: parseJson<QuestionOption[]>(q.options, []), tags: parseJson<string[]>(q.tags, []), points: Number(q.points) }))
      : [];
  const cards = r.type === "flashcards" ? await all<{ id: string; front: string; back: string }>("SELECT id, front, back FROM studio_cards WHERE resource_id = ? ORDER BY sort", id) : [];
  return { resource: r, questions, cards, access: a };
}

export type ResourceInput = Placement & { id?: string; type: ResourceType; title: string; language?: string; body?: string; meta?: Resource["meta"] };

async function canEdit(user: AppUser, a: DeptAccess, id: string) {
  if (a.manage) return true;
  const r = await get<{ author_id: string | null }>("SELECT author_id FROM studio_resources WHERE id = ?", id);
  return r?.author_id === user.id;
}

export async function saveResource(user: AppUser, input: ResourceInput) {
  const a = await requireDept(user, "studio", "write");
  if (!(RESOURCE_TYPES as readonly string[]).includes(input.type)) throw new WorkflowError("VALIDATION", "Unknown type.");
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title) throw new WorkflowError("VALIDATION", "Add a title.");
  await checkPlacement(input);
  const now = nowIso();
  if (input.id) {
    const old = await get<{ status: string; version: number }>("SELECT status, version FROM studio_resources WHERE id = ?", input.id);
    if (!old) throw new WorkflowError("NOT_FOUND", "Not found.");
    if (!(await canEdit(user, a, input.id))) throw new WorkflowError("FORBIDDEN", "You can edit only your own work.");
    // Changing published work starts a new version that goes through review again.
    const reopen = old.status === "published" || old.status === "approved";
    await run(
      `UPDATE studio_resources SET title = ?, grade_id = ?, subject_id = ?, unit_id = ?, lesson_id = ?, language = ?, body = ?, meta = ?, updated_at = ?,
         status = ?, version = ? WHERE id = ?`,
      title,
      input.gradeId || null,
      input.subjectId || null,
      input.unitId || null,
      input.lessonId || null,
      input.language || "en",
      input.body ?? "",
      JSON.stringify(input.meta ?? {}),
      now,
      reopen ? "draft" : old.status,
      reopen ? Number(old.version) + 1 : Number(old.version),
      input.id,
    );
    await audit({ actor: user }, { action: "studio.saved", summary: `${user.name} edited ${input.type} "${title}"${reopen ? " (new version, back to draft)" : ""}` });
    return input.id;
  }
  const id = uid("res_");
  await run(
    `INSERT INTO studio_resources (id, type, title, grade_id, subject_id, unit_id, lesson_id, language, status, body, meta, author_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
    id,
    input.type,
    title,
    input.gradeId || null,
    input.subjectId || null,
    input.unitId || null,
    input.lessonId || null,
    input.language || "en",
    input.body ?? "",
    JSON.stringify(input.meta ?? {}),
    user.id,
    now,
    now,
  );
  await audit({ actor: user }, { action: "studio.created", summary: `${user.name} created ${input.type} "${title}"` });
  return id;
}

// Review flow: draft -> review (author) -> approved (head or lead) -> published (head or lead); changes go back to draft.
export async function setResourceStatus(user: AppUser, id: string, action: "submit" | "approve" | "changes" | "publish" | "unpublish" | "archive" | "restore", note?: string | null) {
  const a = await requireDept(user, "studio", "write");
  const r = await get<{ status: ResourceStatus; title: string; type: string; author_id: string | null }>("SELECT status, title, type, author_id FROM studio_resources WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Not found.");
  const own = r.author_id === user.id;
  const now = nowIso();
  const set = async (status: ResourceStatus) => {
    await run("UPDATE studio_resources SET status = ?, updated_at = ? WHERE id = ?", status, now, id);
    await audit({ actor: user }, { action: "studio.status", summary: `${user.name} moved ${r.type} "${r.title}" to ${status}`, reason: note ?? null });
  };
  switch (action) {
    case "submit":
      if (!own && !a.manage) throw new WorkflowError("FORBIDDEN", "Only the author submits for review.");
      if (r.status !== "draft") throw new WorkflowError("INVALID_STATE", "Only drafts are submitted.");
      await set("review");
      await notify(await deptManagers("studio"), { type: "approval", title: `Review: ${r.title}`, body: `${user.name} submitted a ${r.type} for review.`, link: `/studio?open=${id}`, dedupeKey: `studio-review:${id}:${now}` }, now, user.id);
      return;
    case "approve":
    case "changes":
    case "publish":
    case "unpublish":
      if (!a.manage) throw new WorkflowError("FORBIDDEN", "Only Studio heads and leads review and publish.");
      if (action === "approve") {
        if (r.status !== "review") throw new WorkflowError("INVALID_STATE", "Only work in review is approved.");
        await run("UPDATE studio_resources SET reviewer_id = ?, review_note = ? WHERE id = ?", user.id, note?.trim() || null, id);
        await set("approved");
      } else if (action === "changes") {
        if (!note?.trim()) throw new WorkflowError("VALIDATION", "Say what needs to change.");
        await run("UPDATE studio_resources SET reviewer_id = ?, review_note = ? WHERE id = ?", user.id, note.trim(), id);
        await set("draft");
      } else if (action === "publish") {
        if (r.status !== "approved" && r.status !== "review") throw new WorkflowError("INVALID_STATE", "Approve it before publishing.");
        await run("UPDATE studio_resources SET published_at = COALESCE(published_at, ?) WHERE id = ?", now, id);
        await set("published");
      } else await set("approved");
      if (r.author_id && r.author_id !== user.id)
        await notify(
          [r.author_id],
          {
            type: "approval",
            title: action === "changes" ? `Changes requested: ${r.title}` : action === "publish" ? `Published: ${r.title}` : action === "approve" ? `Approved: ${r.title}` : `Unpublished: ${r.title}`,
            body: note ?? undefined,
            link: `/studio?open=${id}`,
            dedupeKey: `studio-${action}:${id}:${now}`,
          },
          now,
          user.id,
        );
      return;
    case "archive":
    case "restore":
      if (!own && !a.manage) throw new WorkflowError("FORBIDDEN", "You can archive only your own work.");
      await set(action === "archive" ? "archived" : "draft");
      return;
  }
}

export async function deleteResources(user: AppUser, ids: string[]) {
  const a = await requireDept(user, "studio", "write");
  let n = 0;
  for (const id of ids) {
    const r = await get<{ author_id: string | null; status: string; title: string }>("SELECT author_id, status, title FROM studio_resources WHERE id = ?", id);
    if (!r) continue;
    if (!a.manage && !(r.author_id === user.id && r.status === "draft")) throw new WorkflowError("FORBIDDEN", "You can delete only your own drafts.");
    await run("DELETE FROM studio_resources WHERE id = ?", id);
    await audit({ actor: user }, { action: "studio.deleted", summary: `${user.name} deleted "${r.title}"` });
    n++;
  }
  return n;
}

export async function setCards(user: AppUser, resourceId: string, cards: { front: string; back: string }[]) {
  const a = await requireDept(user, "studio", "write");
  if (!(await canEdit(user, a, resourceId))) throw new WorkflowError("FORBIDDEN", "You can edit only your own decks.");
  const clean = cards.map((c) => ({ front: c.front.trim(), back: c.back.trim() })).filter((c) => c.front && c.back);
  if (clean.length > 1000) throw new WorkflowError("VALIDATION", "Up to 1,000 cards per deck.");
  await tx(async () => {
    await run("DELETE FROM studio_cards WHERE resource_id = ?", resourceId);
    for (const [i, c] of clean.entries()) await run("INSERT INTO studio_cards (id, resource_id, front, back, sort) VALUES (?, ?, ?, ?, ?)", uid("crd_"), resourceId, c.front, c.back, i);
    await run("UPDATE studio_resources SET updated_at = ? WHERE id = ?", nowIso(), resourceId);
  });
  return clean.length;
}

export async function setExamQuestions(user: AppUser, resourceId: string, list: { questionId: string; points: number }[]) {
  const a = await requireDept(user, "studio", "write");
  if (!(await canEdit(user, a, resourceId))) throw new WorkflowError("FORBIDDEN", "You can edit only your own exams.");
  const ids = [...new Set(list.map((q) => q.questionId))];
  if (ids.length && Number((await get<{ c: number }>(`SELECT COUNT(*) AS c FROM studio_questions WHERE id IN (${placeholders(ids.length)})`, ...ids))?.c) !== ids.length)
    throw new WorkflowError("VALIDATION", "Some questions no longer exist.");
  await tx(async () => {
    await run("DELETE FROM studio_exam_questions WHERE resource_id = ?", resourceId);
    for (const [i, q] of list.entries())
      await run("INSERT INTO studio_exam_questions (resource_id, question_id, sort, points) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", resourceId, q.questionId, i, q.points > 0 ? q.points : 1);
    await run("UPDATE studio_resources SET updated_at = ? WHERE id = ?", nowIso(), resourceId);
  });
}

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

export type Question = {
  id: string;
  grade_id: string | null;
  subject_id: string | null;
  unit_id: string | null;
  lesson_id: string | null;
  grade?: string | null;
  subject?: string | null;
  unit_number?: number | null;
  type: string;
  stem: string;
  options: QuestionOption[];
  answer: string | null;
  explanation: string | null;
  difficulty: string;
  tags: string[];
  status: string;
  author_id: string | null;
  author_name?: string | null;
  created_at: string;
  updated_at: string;
  used?: number;
};

export type QuestionFilter = { q?: string | null; type?: string | null; difficulty?: string | null; status?: string | null; gradeId?: string | null; subjectId?: string | null; unitId?: string | null; sort?: "updated" | "difficulty" | "type"; dir?: "asc" | "desc" };

export async function listQuestions(user: AppUser, f: QuestionFilter = {}): Promise<{ rows: Question[]; access: DeptAccess }> {
  const a = await requireDept(user, "studio");
  const where: string[] = [];
  const params: string[] = [];
  if (!a.manage && !a.readOnly) {
    where.push("(q.author_id = ? OR q.status = 'approved')");
    params.push(user.id);
  }
  for (const [col, v] of [
    ["q.type", f.type],
    ["q.difficulty", f.difficulty],
    ["q.status", f.status],
    ["q.grade_id", f.gradeId],
    ["q.subject_id", f.subjectId],
    ["q.unit_id", f.unitId],
  ] as const)
    if (v) {
      where.push(`${col} = ?`);
      params.push(v);
    }
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    where.push("(lower(q.stem) LIKE ? OR lower(q.tags) LIKE ? OR lower(COALESCE(q.answer, '')) LIKE ?)");
    params.push(like, like, like);
  }
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  const order = f.sort === "difficulty" ? `CASE q.difficulty WHEN 'easy' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ${dir}` : f.sort === "type" ? `q.type ${dir}` : `q.updated_at ${dir}`;
  const rows = await all<Question & { options: string; tags: string; used: number }>(
    `SELECT q.*, g.name AS grade, s.name AS subject, u.number AS unit_number, ua.name AS author_name,
       (SELECT COUNT(*) FROM studio_exam_questions e WHERE e.question_id = q.id) AS used
     FROM studio_questions q LEFT JOIN grades g ON g.id = q.grade_id LEFT JOIN subjects s ON s.id = q.subject_id LEFT JOIN units u ON u.id = q.unit_id
     LEFT JOIN users ua ON ua.id = q.author_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT 2000`,
    ...params,
  );
  return { access: a, rows: rows.map((q) => ({ ...q, options: parseJson<QuestionOption[]>(q.options, []), tags: parseJson<string[]>(q.tags, []), used: Number(q.used) })) };
}

export type QuestionInput = Placement & { id?: string; type: string; stem: string; options?: QuestionOption[]; answer?: string | null; explanation?: string | null; difficulty?: string; tags?: string[]; status?: string };

export async function saveQuestion(user: AppUser, input: QuestionInput) {
  const a = await requireDept(user, "studio", "write");
  if (!(QUESTION_TYPES as readonly string[]).includes(input.type)) throw new WorkflowError("VALIDATION", "Choose a question type.");
  const stem = input.stem.trim();
  if (!stem) throw new WorkflowError("VALIDATION", "Write the question.");
  await checkPlacement(input);
  let options = (input.options ?? []).map((o, i) => ({ id: o.id || `o${i + 1}`, text: o.text.trim(), correct: !!o.correct })).filter((o) => o.text);
  if (input.type === "true_false") options = [{ id: "t", text: "True", correct: input.answer === "true" }, { id: "f", text: "False", correct: input.answer === "false" }];
  if (input.type === "mcq" || input.type === "multi") {
    if (options.length < 2) throw new WorkflowError("VALIDATION", "Give at least two options.");
    const right = options.filter((o) => o.correct).length;
    if (!right) throw new WorkflowError("VALIDATION", "Mark the correct answer.");
    if (input.type === "mcq" && right > 1) throw new WorkflowError("VALIDATION", "A single-answer question has one correct option.");
  }
  if (input.type === "true_false" && input.answer !== "true" && input.answer !== "false") throw new WorkflowError("VALIDATION", "Choose True or False as the answer.");
  const difficulty = ["easy", "medium", "hard"].includes(input.difficulty ?? "") ? input.difficulty! : "medium";
  // Only heads and leads approve questions for everyone's use.
  const status = input.status === "approved" && a.manage ? "approved" : input.status === "archived" ? "archived" : "draft";
  const tags = JSON.stringify([...new Set((input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12));
  const now = nowIso();
  if (input.id) {
    const old = await get<{ author_id: string | null }>("SELECT author_id FROM studio_questions WHERE id = ?", input.id);
    if (!old) throw new WorkflowError("NOT_FOUND", "Not found.");
    if (!a.manage && old.author_id !== user.id) throw new WorkflowError("FORBIDDEN", "You can edit only your own questions.");
    await run(
      "UPDATE studio_questions SET grade_id = ?, subject_id = ?, unit_id = ?, lesson_id = ?, type = ?, stem = ?, options = ?, answer = ?, explanation = ?, difficulty = ?, tags = ?, status = ?, updated_at = ? WHERE id = ?",
      input.gradeId || null,
      input.subjectId || null,
      input.unitId || null,
      input.lessonId || null,
      input.type,
      stem,
      JSON.stringify(options),
      input.answer?.trim() || null,
      input.explanation?.trim() || null,
      difficulty,
      tags,
      status,
      now,
      input.id,
    );
    return input.id;
  }
  const id = uid("qst_");
  await run(
    "INSERT INTO studio_questions (id, grade_id, subject_id, unit_id, lesson_id, type, stem, options, answer, explanation, difficulty, tags, status, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    input.gradeId || null,
    input.subjectId || null,
    input.unitId || null,
    input.lessonId || null,
    input.type,
    stem,
    JSON.stringify(options),
    input.answer?.trim() || null,
    input.explanation?.trim() || null,
    difficulty,
    tags,
    status,
    user.id,
    now,
    now,
  );
  return id;
}

export async function deleteQuestions(user: AppUser, ids: string[]) {
  const a = await requireDept(user, "studio", "write");
  let n = 0;
  for (const id of ids) {
    const q = await get<{ author_id: string | null; used: number }>("SELECT author_id, (SELECT COUNT(*) FROM studio_exam_questions e WHERE e.question_id = q.id) AS used FROM studio_questions q WHERE id = ?", id);
    if (!q) continue;
    if (!a.manage && q.author_id !== user.id) throw new WorkflowError("FORBIDDEN", "You can delete only your own questions.");
    if (Number(q.used)) throw new WorkflowError("INVALID_STATE", "A question used in an exam cannot be deleted. Archive it instead.");
    await run("DELETE FROM studio_questions WHERE id = ?", id);
    n++;
  }
  return n;
}

export async function setQuestionsStatus(user: AppUser, ids: string[], status: "approved" | "draft" | "archived") {
  const a = await requireDept(user, "studio", "write");
  if (status === "approved" && !a.manage) throw new WorkflowError("FORBIDDEN", "Only Studio heads and leads approve questions.");
  for (const id of ids) {
    const q = await get<{ author_id: string | null }>("SELECT author_id FROM studio_questions WHERE id = ?", id);
    if (!q || (!a.manage && q.author_id !== user.id)) continue;
    await run("UPDATE studio_questions SET status = ?, updated_at = ? WHERE id = ?", status, nowIso(), id);
  }
}

// CSV import of questions. Columns: type, question, option_a..option_f, correct (letters, or true/false), answer, explanation,
// difficulty, tags, grade_code, subject_code, unit_number.
export async function importQuestions(user: AppUser, rows: Record<string, string>[]) {
  await requireDept(user, "studio", "write");
  const out = { created: 0, errors: [] as string[] };
  for (const [i, r] of rows.slice(0, 2000).entries()) {
    try {
      const g = r.grade_code ? await get<{ id: string }>("SELECT id FROM grades WHERE code = ?", r.grade_code.trim().toUpperCase()) : undefined;
      const s = r.subject_code ? await get<{ id: string }>("SELECT id FROM subjects WHERE code = ?", r.subject_code.trim().toUpperCase()) : undefined;
      if (r.grade_code && !g) throw new Error(`unknown grade ${r.grade_code}`);
      if (r.subject_code && !s) throw new Error(`unknown subject ${r.subject_code}`);
      const u = g && s && r.unit_number ? await get<{ id: string }>("SELECT id FROM units WHERE grade_id = ? AND subject_id = ? AND number = ?", g.id, s.id, Number(r.unit_number)) : undefined;
      const type = (r.type || "mcq").trim().toLowerCase();
      const correct = (r.correct ?? "").toLowerCase().split(/[;, ]+/).filter(Boolean);
      const options = ["a", "b", "c", "d", "e", "f"].map((k) => ({ id: k, text: r[`option_${k}`] ?? "", correct: correct.includes(k) })).filter((o) => o.text.trim());
      await saveQuestion(user, {
        type,
        stem: r.question ?? "",
        options,
        answer: type === "true_false" ? (correct[0] === "true" || correct[0] === "t" ? "true" : "false") : r.answer || null,
        explanation: r.explanation || null,
        difficulty: r.difficulty,
        tags: (r.tags ?? "").split(/[;,]/),
        gradeId: g?.id ?? null,
        subjectId: s?.id ?? null,
        unitId: u?.id ?? null,
      });
      out.created++;
    } catch (err) {
      out.errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

export const STUDIO_STATUSES = RESOURCE_STATUSES;
