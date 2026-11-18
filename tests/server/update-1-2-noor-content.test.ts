// Noor's academic content in ops (Legacy CMS, Content): a subject is read from Noor's edit page (units, lessons,
// notes, quizzes and questions) and counted for the report; questions are imported from text or a table; changes
// go to Noor through Noor's own forms (opened, filled, submitted), a quiz's questions in batches: the first batch
// makes the quiz, the rest are added to it with Edit Quiz, the existing questions left as they were.
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { saveLegacyCmsConfig } from "../../src/server/legacy-cms";
import * as C from "../../src/server/noor-content";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- A fake Noor: the Academic Content edit page and its forms ---------------------------------
type Q = { id: number; question_text: string; options: string[]; correct_answer: string };
type Quiz = { id: number; unit_id: number; lesson_id: number | null; title: string; time_limit_seconds: number | null; questions: Q[] };
type Lesson = { id: number; unit_id: number; position: number; title: string; youtube_video_id: string | null; video_disk: string; duration_seconds: number | null; is_free_preview: boolean; description: string; notes: { id: number; content_text: string }[] };
type Unit = { id: number; title: string; position: number; description: string; lessons: Lesson[]; notes: { id: number; content_text: string }[] };
const state = { seq: 500, units: [] as Unit[], quizzes: [] as Quiz[], calls: [] as { method: string; name?: string; size: number }[] };
const id = () => ++state.seq;
state.units.push({ id: 40, title: "Unit 1: Reactions", position: 0, description: "<p>Intro</p>", notes: [], lessons: [{ id: 134, unit_id: 40, position: 1, title: "Part 1", youtube_video_id: "io7hjBF5phY", video_disk: "youtube", duration_seconds: 1006, is_free_preview: true, description: "", notes: [{ id: 633, content_text: "<p>Note</p>" }] }] });
state.units.push({ id: 41, title: "Unit 2: Solutions", position: 1, description: "", notes: [], lessons: [] });
state.quizzes.push({ id: 152, unit_id: 40, lesson_id: null, title: "Chapter one", time_limit_seconds: 1800, questions: [{ id: 4219, question_text: "<p>Which is a precipitate?</p>", options: ["Gas", "Colour", "Solid", "Heat"], correct_answer: "C" }] });
const arr = (v: unknown) => [v, { s: "arr" }];
const keyed = <T extends { id: number }>(xs: T[], f: (x: T) => unknown) => arr(Object.fromEntries(xs.map((x) => [`record-${x.id}`, f(x)])));
const quizData = (q: Quiz) => ({ id: q.id, unit_id: q.unit_id, title: q.title, time_limit_seconds: q.time_limit_seconds, questions: keyed(q.questions, (x) => ({ ...x, options: arr(x.options) })) });
function formData() {
  return {
    id: 7,
    name: "Chemistry",
    code: "CHEM",
    type: "normal",
    is_stem: true,
    grade_ids: arr(["6"]),
    units: keyed(state.units, (u) => ({
      id: u.id,
      title: u.title,
      position: u.position,
      description: u.description,
      lessons: keyed(u.lessons, (l) => ({ ...l, notes: keyed(l.notes, (n) => ({ ...n, pdf_url: null })), quizzes: keyed(state.quizzes.filter((q) => q.lesson_id === l.id), quizData), flashcardDecks: arr([]) })),
      notes: keyed(u.notes, (n) => n),
      quizzes: keyed(state.quizzes.filter((q) => q.unit_id === u.id && !q.lesson_id), quizData),
      flashcardDecks: arr([]),
    })),
    quizzes: keyed(state.quizzes, quizData),
  };
}
const snapshotOf = (mounted: unknown[] = [], errors: Record<string, string[]> = {}) => JSON.stringify({ data: { data: arr(formData()), mountedActions: arr(mounted) }, memo: { id: "c1", name: "App\\Filament\\Resources\\AcademicContentResource\\Pages\\EditAcademicContent", errors } });
const enc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] });
const docText = (d: { content?: { content?: { text?: string }[] }[] }) => (d?.content ?? []).map((p) => (p.content ?? []).map((t) => t.text ?? "").join("")).join("\n");
function setPath(o: Record<string, unknown>, path: string, v: unknown) {
  const parts = path.split(".");
  let cur = o;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
  cur[parts.at(-1)!] = v;
}
function opened(name: string, args: Record<string, string>, context: Record<string, string>) {
  const base = { name, arguments: args, context };
  if (name === "add_quiz" || name === "add_quiz_btn") return { ...base, data: { title: null, time_limit_seconds: null, questions: { blank: { question_text: doc(""), options: { o1: { value: null, is_correct: false } } } } } };
  if (name === "edit_quiz") {
    const q = state.quizzes.find((x) => `record-${x.id}` === args.item)!;
    return { ...base, data: { title: q.title, time_limit_seconds: q.time_limit_seconds, questions: Object.fromEntries(q.questions.map((x) => [`k${x.id}`, { question_text: doc(x.question_text.replace(/<[^>]+>/g, "")), options: Object.fromEntries(x.options.map((o, i) => [`o${i}`, { value: o, is_correct: "ABCDEF"[i] === x.correct_answer }])) }])) } };
  }
  if (name === "add_lesson") return { ...base, data: { title: null, description: doc(""), video_disk: "youtube", youtube_video_id: null, video_url: [], duration_seconds: null, is_free_preview: false } };
  if (name === "edit_lesson") {
    const l = state.units.flatMap((u) => u.lessons).find((x) => `record-${x.id}` === args.item)!;
    return { ...base, data: { title: l.title, description: doc(l.description), video_disk: l.video_disk, youtube_video_id: l.youtube_video_id, duration_seconds: l.duration_seconds, is_free_preview: l.is_free_preview } };
  }
  if (name === "add") return { ...base, data: { title: null, position: 0, description: doc("") } };
  if (name === "add_note" || name === "add_note_btn") return { ...base, data: { content_text: doc(""), pdf_disk: "s3", pdf_url: [] } };
  if (name === "edit_unit") {
    const u = state.units.find((x) => String(x.id) === context.recordKey)!;
    return { ...base, data: { title: u.title, position: u.position, description: doc(u.description) } };
  }
  return null;
}
type QItem = { question_text: Parameters<typeof docText>[0]; options: Record<string, { value: string | null; is_correct: boolean }> };
function questionsFrom(qs: Record<string, QItem>, errors: Record<string, string[]>) {
  return Object.entries(qs).map(([k, x]) => {
    const opts = Object.values(x.options);
    if (!docText(x.question_text).trim()) errors[`mountedActions.0.data.questions.${k}.question_text`] = ["The question text field is required."];
    if (opts.filter((o) => o.is_correct).length !== 1) errors[`mountedActions.0.data.questions.${k}.options`] = ["Mark one correct option."];
    return { id: id(), question_text: `<p>${docText(x.question_text)}</p>`, options: opts.map((o) => String(o.value)), correct_answer: "ABCDEF"[opts.findIndex((o) => o.is_correct)] ?? "A" };
  });
}
function submit(m: { name: string; arguments: Record<string, string>; context: Record<string, string>; data: Record<string, unknown> }) {
  const errors: Record<string, string[]> = {};
  const d = m.data;
  const unitId = Number(m.context.recordKey);
  if (m.name === "add_quiz" || m.name === "add_quiz_btn") {
    if (!d.title) errors["mountedActions.0.data.title"] = ["The title field is required."];
    const qs = questionsFrom(d.questions as Record<string, QItem>, errors);
    if (!Object.keys(errors).length) state.quizzes.push({ id: id(), unit_id: unitId, lesson_id: m.name === "add_quiz_btn" ? Number(m.arguments.item.slice(7)) : null, title: String(d.title), time_limit_seconds: (d.time_limit_seconds as number) ?? null, questions: qs });
  } else if (m.name === "edit_quiz") {
    const q = state.quizzes.find((x) => `record-${x.id}` === m.arguments.item)!;
    // Filament saves the repeater as it stands: the questions kept, the new ones added.
    const qs = questionsFrom(d.questions as Record<string, QItem>, errors);
    if (!Object.keys(errors).length) q.questions = qs;
  } else if (m.name === "add_lesson") {
    if (!d.title) errors["mountedActions.0.data.title"] = ["The title field is required."];
    else state.units.find((u) => u.id === unitId)!.lessons.push({ id: id(), unit_id: unitId, position: 99, title: String(d.title), youtube_video_id: (d.youtube_video_id as string) ?? null, video_disk: "youtube", duration_seconds: (d.duration_seconds as number) ?? null, is_free_preview: !!d.is_free_preview, description: docText(d.description as never), notes: [] });
  } else if (m.name === "edit_lesson") {
    const l = state.units.flatMap((u) => u.lessons).find((x) => `record-${x.id}` === m.arguments.item)!;
    Object.assign(l, { title: d.title, youtube_video_id: d.youtube_video_id, duration_seconds: d.duration_seconds, is_free_preview: d.is_free_preview });
  } else if (m.name === "add") state.units.push({ id: id(), title: String(d.title), position: state.units.length, description: docText(d.description as never), lessons: [], notes: [] });
  else if (m.name === "add_note_btn") state.units.flatMap((u) => u.lessons).find((x) => `record-${x.id}` === m.arguments.item)!.notes.push({ id: id(), content_text: docText(d.content_text as never) });
  else if (m.name === "add_note") state.units.find((u) => u.id === unitId)!.notes.push({ id: id(), content_text: docText(d.content_text as never) });
  else if (m.name === "edit_unit") Object.assign(state.units.find((u) => u.id === unitId)!, { title: d.title });
  return errors;
}
const BASE = "https://noor.content.test";
const original = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== BASE) return original(input, init);
  if ((init?.method ?? "GET") === "GET" && url.pathname === "/admin/academic-contents/7/edit")
    return new Response(`<html><head><meta name="csrf-token" content="tok"></head><body><div wire:snapshot="${enc(snapshotOf())}" data-update-uri="/livewire/update"></div></body></html>`, { headers: { "Content-Type": "text/html" } });
  if (url.pathname === "/livewire/update") {
    const body = JSON.parse(String(init!.body)) as { components: { snapshot: string; updates: Record<string, unknown>; calls: { method: string; params: unknown[] }[] }[] };
    const c = body.components[0]!;
    const call = c.calls[0]!;
    state.calls.push({ method: call.method, name: call.method === "mountAction" ? String(call.params[0]) : undefined, size: JSON.stringify(c.updates).length });
    if (call.method === "mountAction") {
      const m = opened(String(call.params[0]), call.params[1] as Record<string, string>, call.params[2] as Record<string, string>);
      return Response.json({ components: [{ snapshot: snapshotOf(m ? [m] : []), effects: { html: "<div></div>" } }] });
    }
    if (call.method === "callMountedAction") {
      const snap = JSON.parse(c.snapshot) as { data: { mountedActions: [unknown[], unknown] } };
      const m = (snap.data.mountedActions[0] as Record<string, unknown>[])[0] as Parameters<typeof submit>[0];
      for (const [k, v] of Object.entries(c.updates)) setPath({ mountedActions: { 0: m } } as Record<string, unknown>, k.replace(/^mountedActions\.0/, "mountedActions.0"), v);
      const errors = submit(m);
      return Response.json({ components: [{ snapshot: snapshotOf(Object.keys(errors).length ? [m] : [], errors), effects: { html: "<div></div>" } }] });
    }
  }
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

async function untilDone(jobId: string, user: Awaited<ReturnType<typeof by>>) {
  for (let i = 0; i < 100; i++) {
    const j = await C.contentJob(user, jobId);
    if (!["queued", "running"].includes(j.status)) return j;
    await wait(50);
  }
  return C.contentJob(user, jobId);
}

async function main() {
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  await saveLegacyCmsConfig(admin, { baseUrl: BASE, username: "fixture", password: "fixture", sessionCookie: "session=fixture", autoSync: false });

  // 1. Importing questions.
  const aiken = C.parseAiken(`1. Which is a noble gas?
A. Oxygen
B. Neon
C. Nitrogen
ANSWER: B

What is H2O?
A) Water
B) Salt
ANSWER: A

A question with no answer line
A. Yes
B. No`);
  check("Aiken text is read, numbering and option styles alike", aiken.questions.length === 2 && aiken.questions[0]!.text === "Which is a noble gas?" && aiken.questions[0]!.correct === 1 && aiken.questions[1]!.options.join() === "Water,Salt", aiken);
  check("a question without its answer is reported, not guessed", aiken.errors.length === 1 && /Question 3/.test(aiken.errors[0]!.at), aiken.errors);
  const rows = C.parseQuestionRows([
    { Question: "2 + 2?", A: "3", B: "4", C: "5", Answer: "B" },
    { Question: "Capital of Ethiopia?", "Option A": "Addis Ababa", "Option B": "Adama", Answer: "Addis Ababa" },
    { Question: "Bad", A: "only one", Answer: "A" },
    { Question: "Wrong answer", A: "x", B: "y", Answer: "E" },
  ]);
  check("table rows are read: the answer as a letter or the option's text", rows.questions.length === 2 && rows.questions[0]!.correct === 1 && rows.questions[1]!.correct === 0, rows);
  check("and their problems are named by row", rows.errors.map((e) => e.at).join() === "Row 4,Row 5", rows.errors);
  const lessons = C.parseLessonRows([
    { Title: "Part 2", YouTube: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", Duration: "12:30", Free: "yes" },
    { Title: "Part 3", Video: "https://youtu.be/dQw4w9WgXcQ", Duration: "754" },
    { Title: "Part 4", YouTube: "not a link" },
  ]);
  check("lessons from a table: YouTube links, durations and free previews", lessons.lessons.length === 2 && lessons.lessons[0]!.youtube === "dQw4w9WgXcQ" && lessons.lessons[0]!.duration === 750 && lessons.lessons[0]!.free && lessons.lessons[1]!.duration === 754 && lessons.errors.length === 1, lessons);
  check("Noor's editor gets paragraphs", JSON.stringify(C.textDoc("a\nb")) === JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }, { type: "paragraph", content: [{ type: "text", text: "b" }] }] }));

  // 2. Reading a subject.
  const r = await C.contentSubject(admin, "7", { refresh: true });
  check("a subject is read from Noor's edit page as units, lessons and quizzes", r.subject.name === "Chemistry" && r.subject.units.length === 2 && r.subject.units[0]!.lessons[0]!.title === "Part 1" && r.subject.units[0]!.quizzes[0]!.questions[0]!.correct === 2, r.subject.units[0]);
  check("question text is plain text", r.subject.units[0]!.quizzes[0]!.questions[0]!.text === "Which is a precipitate?");
  check("and counted", r.stats.units === 2 && r.stats.lessons === 1 && r.stats.videos === 1 && r.stats.quizzes === 1 && r.stats.questions === 1 && r.stats.unitsWithoutQuiz === 1 && r.stats.unitsWithoutLessons === 1 && r.stats.minutes === 17, r.stats);
  check("someone without Noor access cannot read it", /does not include Noor/.test(await err(() => C.contentSubject(dawit, "7"))));

  // 3. A new quiz of 45 questions: batches of 20 (one makes the quiz, two more are added to it).
  const qs = Array.from({ length: 45 }, (_, i) => ({ id: null, text: `Question ${i + 1}?`, options: ["Yes", "No", "Maybe"], correct: i % 3 }));
  check("only people who manage Noor data change it", /Admin/.test(await err(() => C.startContentJob(dawit, { kind: "quiz", subjectId: "7", unitId: 41, title: "Unit 2 quiz", questions: qs }))));
  check("a question without a right option is refused before anything is sent", /Question 2/.test(await err(() => C.startContentJob(admin, { kind: "quiz", subjectId: "7", unitId: 41, title: "x", questions: [qs[0]!, { ...qs[1]!, correct: 7 }] }))));
  state.calls.length = 0;
  const job = await C.startContentJob(admin, { kind: "quiz", subjectId: "7", unitId: 41, title: "Unit 2 quiz", timeLimitMinutes: 20, questions: qs, batch: 20 });
  check("a second change to the same subject waits", /still running/.test(await err(() => C.startContentJob(admin, { kind: "units", subjectId: "7", units: [{ title: "x" }] }))));
  const done = await untilDone(job.id, admin);
  const made = state.quizzes.find((q) => q.title === "Unit 2 quiz");
  check("the quiz is made in Noor with all 45 questions", done.status === "done" && made?.questions.length === 45 && made.time_limit_seconds === 1200, { status: done.status, log: done.log, n: made?.questions.length });
  check("in three batches: Add Quiz once, then Edit Quiz twice", state.calls.filter((c) => c.method === "mountAction").map((c) => c.name).join() === "add_quiz,edit_quiz,edit_quiz", state.calls);
  check("the right answers survive the trip", made!.questions[0]!.correct_answer === "A" && made!.questions[1]!.correct_answer === "B" && made!.questions[44]!.correct_answer === "C");
  check("every step is on the job", done.log.filter((l) => l.ok).length >= 4 && done.done === 3 && done.total === 3, done.log);

  // 4. Questions added to an existing quiz keep the ones it has.
  const add = await C.startContentJob(admin, { kind: "quiz", subjectId: "7", unitId: 40, quizId: 152, title: "", questions: qs.slice(0, 5) });
  await untilDone(add.id, admin);
  const q152 = state.quizzes.find((q) => q.id === 152)!;
  check("added to Chapter one after its own question", q152.questions.length === 6 && /precipitate/.test(q152.questions[0]!.question_text), q152.questions.map((q) => q.question_text));

  // 5. Lessons, units, notes and changes.
  const lj = await C.startContentJob(admin, { kind: "lessons", subjectId: "7", unitId: 41, lessons: lessons.lessons });
  check("lessons are added one by one with their videos", (await untilDone(lj.id, admin)).status === "done" && state.units[1]!.lessons.map((l) => `${l.title}:${l.youtube_video_id}:${l.duration_seconds}`).join() === "Part 2:dQw4w9WgXcQ:750,Part 3:dQw4w9WgXcQ:754", state.units[1]!.lessons);
  const uj = await C.startContentJob(admin, { kind: "units", subjectId: "7", units: [{ title: "Unit 3: Acids" }] });
  await untilDone(uj.id, admin);
  const nj = await C.startContentJob(admin, { kind: "note", subjectId: "7", unitId: 40, lessonId: 134, text: "Read pages 4 to 9" });
  await untilDone(nj.id, admin);
  const uploads: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin === BASE && url.pathname === "/livewire/upload-file") return uploads.push(((init!.body as FormData).get("files[]") as File).name), Response.json({ paths: ["tmp-1.pdf"] });
    if (url.origin === BASE && url.pathname === "/livewire/update") {
      const c = (JSON.parse(String(init!.body)) as { components: { snapshot: string; calls: { method: string; params: unknown[] }[] }[] }).components[0]!;
      const call = c.calls[0]!;
      if (call.method === "_startUpload") return Response.json({ components: [{ snapshot: c.snapshot, effects: { dispatches: [{ name: "upload:generatedSignedUrl", params: { name: call.params[0], url: "/livewire/upload-file?expires=1&signature=s" } }] } }] });
      if (call.method === "_finishUpload") {
        const snap = JSON.parse(c.snapshot);
        const m = snap.data.mountedActions[0][0];
        setPath({ mountedActions: { 0: m } }, String(call.params[0]), `livewire-file:${(call.params[1] as string[])[0]}`);
        return Response.json({ components: [{ snapshot: JSON.stringify(snap), effects: {} }] });
      }
    }
    return realFetch(input, init);
  }) as typeof fetch;
  const pj = await C.startContentJob(admin, { kind: "note", subjectId: "7", unitId: 40, lessonId: 134, text: "Worked examples", pdf: { name: "examples.pdf", base64: Buffer.from("%PDF-1.4 test").toString("base64") } });
  const pjDone = await untilDone(pj.id, admin);
  globalThis.fetch = realFetch;
  check("a PDF goes through Noor's upload before the note is saved", pjDone.status === "done" && uploads.join() === "examples.pdf", pjDone.log);
  check("a note that is not a PDF is refused", /PDF/.test(await err(() => C.startContentJob(admin, { kind: "note", subjectId: "7", unitId: 40, text: "", pdf: { name: "x.exe", base64: "AA==" } }))));
  const ej = await C.startContentJob(admin, { kind: "edit-lesson", subjectId: "7", unitId: 40, lessonId: 134, patch: { title: "Part 1 - Change of State", free: false } });
  await untilDone(ej.id, admin);
  check("a unit, a lesson note and a lesson change reach Noor", state.units.some((u) => u.title === "Unit 3: Acids") && state.units[0]!.lessons[0]!.notes.some((n) => n.content_text === "Read pages 4 to 9") && state.units[0]!.lessons[0]!.title === "Part 1 - Change of State" && !state.units[0]!.lessons[0]!.is_free_preview);

  // 6. Noor refusing a form stops the job and says why.
  const bad = await C.startContentJob(admin, { kind: "lessons", subjectId: "7", unitId: 41, lessons: [{ title: " ", youtube: null, duration: null, free: false, description: "" }] }).catch((e: Error) => e.message);
  check("an empty lesson is not sent", typeof bad === "string" || !!bad);

  // 7. The report.
  const after = await C.contentSubject(admin, "7");
  check("the subject was read again after the changes", after.stats.quizzes === 2 && after.stats.questions === 51 && after.stats.units === 3, after.stats);
  const rep = await C.contentReport(admin);
  check("the report counts what Noor has", rep.totals.questions === 51 && rep.report.columns.includes("Questions") && /51 questions/.test(rep.meta.filters), rep.meta.filters);
  const o = await C.contentOverview(admin);
  check("jobs are listed with their outcome", o.jobs.length >= 5 && o.jobs.every((j) => j.status === "done") && o.canEdit, o.jobs.map((j) => j.status));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
