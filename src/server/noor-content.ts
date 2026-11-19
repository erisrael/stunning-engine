import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { loadUser, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { canManageCmsData, getLegacyCmsConfigForUser } from "./legacy-cms";
import { access, noorAdminList, openNoor } from "./cms-admin";

// Noor's academic content in ops (Legacy CMS, Content).
//
// Reading: each subject's edit page in Noor (Academic Content > Edit) holds the whole subject in one Livewire form:
// units, their lessons (YouTube or uploaded video, notes with PDFs, quizzes, flashcard decks), unit notes and unit
// quizzes with every question. It is read as is, kept in noor_content, and shown here as a tree, with a report of
// what each subject has and lacks.
//
// Writing goes through Noor's own forms, the ones its buttons open: Add Unit, Add Lesson, Add Note, Add Quiz, Edit
// Quiz, Edit Lesson, Edit Unit. Each is opened (mountAction), filled and submitted (callMountedAction), exactly as a
// person in Noor would, so Noor checks and saves everything itself. What Noor's screen does one question at a time
// is done here in batches: a quiz is made with its first batch of questions and the rest are added to it batch by
// batch with Edit Quiz. Every step is logged on the job; after the last, the subject is read again to confirm.

// --- The subject as Noor keeps it -------------------------------------------------------

export type ContentQuestion = { id: number | null; text: string; options: string[]; correct: number };
export type ContentQuiz = { id: number; title: string; timeLimit: number | null; questions: ContentQuestion[] };
export type ContentNote = { id: number; text: string; pdf: string | null };
export type ContentLesson = { id: number; title: string; position: number; description: string; video: { disk: string | null; youtube: string | null; url: string | null; status: string | null }; duration: number | null; free: boolean; notes: ContentNote[]; quizzes: ContentQuiz[]; flashcards: number };
export type ContentUnit = { id: number; title: string; position: number; description: string; lessons: ContentLesson[]; notes: ContentNote[]; quizzes: ContentQuiz[]; flashcards: number };
export type ContentSubject = { id: string; name: string; code: string | null; type: string | null; stem: boolean; gradeIds: string[]; previewSource: string | null; units: ContentUnit[]; quizzes: ContentQuiz[] };
export type ContentStats = {
  units: number;
  lessons: number;
  videos: number;
  freePreviews: number;
  minutes: number;
  lessonsWithNotes: number;
  notes: number;
  pdfs: number;
  quizzes: number;
  questions: number;
  flashcards: number;
  lessonsWithoutVideo: number;
  lessonsWithoutNotes: number;
  unitsWithoutQuiz: number;
  unitsWithoutLessons: number;
};

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
export const htmlText = (s: unknown) =>
  decode(decode(String(s ?? "")).replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
// Livewire keeps arrays and objects as [value, {s: "arr"}] pairs.
export function unwrap(x: unknown): unknown {
  if (Array.isArray(x) && x.length === 2 && x[1] && typeof x[1] === "object" && "s" in (x[1] as object)) return unwrap(x[0]);
  if (Array.isArray(x)) return x.map(unwrap);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, unwrap(v)]));
  return x;
}
type Obj = Record<string, unknown>;
const items = (v: unknown): Obj[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []).filter((x): x is Obj => !!x && typeof x === "object");
const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const LETTERS = "ABCDEFGHIJ";

function quizOf(q: Obj): ContentQuiz {
  return {
    id: Number(q.id),
    title: String(q.title ?? "Quiz"),
    timeLimit: num(q.time_limit_seconds),
    questions: items(q.questions).map((x) => {
      const options = (Array.isArray(x.options) ? x.options : items(x.options).map((o) => o.value)).map((o) => String(o ?? "").trim());
      return { id: num(x.id), text: htmlText(x.question_text), options, correct: Math.max(0, LETTERS.indexOf(String(x.correct_answer ?? "").trim().toUpperCase())) };
    }),
  };
}
const noteOf = (n: Obj): ContentNote => ({ id: Number(n.id), text: htmlText(n.content_text), pdf: typeof n.pdf_url === "string" && n.pdf_url ? n.pdf_url : null });

// The subject from the edit page's form data (the snapshot's data.data).
export function subjectFrom(id: string, raw: unknown): ContentSubject {
  const d = unwrap(raw) as Obj;
  const units = items(d.units)
    .map((u) => ({
      id: Number(u.id),
      title: String(u.title ?? ""),
      position: Number(u.position ?? 0),
      description: htmlText(u.description),
      lessons: items(u.lessons)
        .map((l) => ({
          id: Number(l.id),
          title: String(l.title ?? ""),
          position: Number(l.position ?? 0),
          description: htmlText(l.description),
          video: { disk: (l.video_disk as string) ?? null, youtube: (l.youtube_video_id as string) || null, url: typeof l.video_url === "string" && l.video_url ? l.video_url : null, status: (l.transcoding_status as string) ?? null },
          duration: num(l.duration_seconds),
          free: !!l.is_free_preview,
          notes: items(l.notes).map(noteOf),
          quizzes: items(l.quizzes).map(quizOf),
          flashcards: items(l.flashcardDecks).length,
        }))
        .sort((a, b) => a.position - b.position || a.id - b.id),
      notes: items(u.notes).map(noteOf),
      quizzes: items(u.quizzes).map(quizOf),
      flashcards: items(u.flashcardDecks).length,
    }))
    .sort((a, b) => a.position - b.position || a.id - b.id);
  const inUnits = new Set(units.flatMap((u) => [...u.quizzes, ...u.lessons.flatMap((l) => l.quizzes)].map((q) => q.id)));
  return {
    id,
    name: String(d.name ?? ""),
    code: (d.code as string) ?? null,
    type: (d.type as string) ?? null,
    stem: !!d.is_stem,
    gradeIds: (Array.isArray(d.grade_ids) ? d.grade_ids : [d.grade_id]).filter((g) => g !== null && g !== undefined).map(String),
    previewSource: (d.preview_source as string) ?? null,
    units,
    quizzes: items(d.quizzes).map(quizOf).filter((q) => !inUnits.has(q.id)),
  };
}

// A lesson can be played when it has a YouTube video, or an uploaded one that finished converting.
export const lessonHasVideo = (l: ContentLesson) => !!l.video.youtube || (!!l.video.url && (!l.video.status || /complete|done|ready|finished|success/i.test(l.video.status)));

export function subjectStats(s: ContentSubject): ContentStats {
  const lessons = s.units.flatMap((u) => u.lessons);
  const quizzes = [...s.quizzes, ...s.units.flatMap((u) => [...u.quizzes, ...u.lessons.flatMap((l) => l.quizzes)])];
  const notes = s.units.flatMap((u) => [...u.notes, ...u.lessons.flatMap((l) => l.notes)]);
  return {
    units: s.units.length,
    lessons: lessons.length,
    videos: lessons.filter(lessonHasVideo).length,
    freePreviews: lessons.filter((l) => l.free).length,
    minutes: Math.round(lessons.reduce((n, l) => n + (l.duration ?? 0), 0) / 60),
    lessonsWithNotes: lessons.filter((l) => l.notes.length).length,
    notes: notes.length,
    pdfs: notes.filter((n) => n.pdf).length,
    quizzes: quizzes.length,
    questions: quizzes.reduce((n, q) => n + q.questions.length, 0),
    flashcards: s.units.reduce((n, u) => n + u.flashcards + u.lessons.reduce((m, l) => m + l.flashcards, 0), 0),
    lessonsWithoutVideo: lessons.filter((l) => !lessonHasVideo(l)).length,
    lessonsWithoutNotes: lessons.filter((l) => !l.notes.length).length,
    unitsWithoutQuiz: s.units.filter((u) => !u.quizzes.length && !u.lessons.some((l) => l.quizzes.length)).length,
    unitsWithoutLessons: s.units.filter((u) => !u.lessons.length).length,
  };
}

// --- Talking to the edit page -----------------------------------------------------------

const SUBJECT_ID = /^\d{1,9}$/;
const editPath = (id: string) => `/admin/academic-contents/${id}/edit`;
type Page = { baseUrl: string; cookie: string; csrf: string; endpoint: URL; snapshot: string; html: string };

async function openSubject(user: AppUser, id: string): Promise<Page> {
  if (!SUBJECT_ID.test(id)) throw new WorkflowError("VALIDATION", "Unknown subject.");
  // Noor's server sometimes answers its largest pages with a gateway error (502, 503, 504): wait, try once more.
  const { html, cookie, baseUrl } = await openNoor(user, editPath(id)).catch(async (e: Error) => {
    if (!/HTTP 50[234]/.test(e.message)) throw e;
    await new Promise((r) => setTimeout(r, 4000));
    return openNoor(user, editPath(id)).catch((e2: Error) => {
      throw /HTTP 50[234]/.test(e2.message) ? new WorkflowError("VALIDATION", "Noor is busy and did not open this subject. Try again in a minute.") : e2;
    });
  });
  const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1] ?? "";
  const uri = decode(html.match(/data-update-uri="([^"]+)"/)?.[1] ?? "/livewire/update");
  const endpoint = new URL(uri, baseUrl);
  if (endpoint.origin !== new URL(baseUrl).origin) throw new WorkflowError("VALIDATION", "Unexpected Noor endpoint.");
  const snapshot = [...html.matchAll(/wire:snapshot="([^"]+)"/g)].map((m) => decode(m[1])).find((s) => /EditAcademicContent|AcademicContent/.test(s) && s.includes('"units"'));
  if (!snapshot) throw new WorkflowError("VALIDATION", "Noor did not show this subject's form. Open it in Noor to check it still exists.");
  return { baseUrl, cookie, csrf, endpoint, snapshot, html };
}

type Wire = { snapshot: string; data: Obj; errors: Record<string, string[]>; html: string; dispatches: { name: string; params: unknown }[] };
async function wire(p: Page, snapshot: string, updates: Record<string, unknown>, calls: { method: string; params: unknown[] }[]): Promise<Wire> {
  const r = await fetch(p.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Livewire": "true", "X-CSRF-TOKEN": p.csrf, Cookie: p.cookie },
    body: JSON.stringify({ _token: p.csrf, components: [{ snapshot, updates, calls: calls.map((c) => ({ path: "", ...c })) }] }),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  if (r.status === 419 || r.status === 401 || r.status === 302) throw new WorkflowError("VALIDATION", "The Noor session ended. Try again.");
  if (!r.ok) throw new WorkflowError("VALIDATION", `Noor refused the change (HTTP ${r.status}).`);
  const c = (await r.json())?.components?.[0];
  if (!c?.snapshot) throw new WorkflowError("VALIDATION", "Noor did not answer as expected.");
  const snap = JSON.parse(c.snapshot) as { data: Obj; memo?: { errors?: Record<string, string[]> } };
  const errors = snap.memo?.errors && !Array.isArray(snap.memo.errors) ? snap.memo.errors : {};
  return { snapshot: c.snapshot, data: snap.data, errors, html: typeof c.effects?.html === "string" ? c.effects.html : "", dispatches: Array.isArray(c.effects?.dispatches) ? c.effects.dispatches : [] };
}

// A file for one of Noor's file fields, uploaded the way Livewire uploads it in the browser: ask for a signed
// address (_startUpload), send the file there (Livewire's own upload route, or the storage it signs for), then
// hand the temporary file to the field (_finishUpload). Noor stores it when the form is submitted.
export type NoorFile = { field: string; name: string; type: string; data: Buffer };
async function uploadInto(p: Page, snapshot: string, statePath: string, f: NoorFile): Promise<string> {
  const name = `${statePath}.${crypto.randomUUID()}`;
  const started = await wire(p, snapshot, {}, [{ method: "_startUpload", params: [name, [{ name: f.name, size: f.data.length, type: f.type }], false] }]);
  const signed = started.dispatches.find((d) => /^upload:generatedSignedUrl/.test(d.name));
  const params = (signed?.params ?? {}) as { url?: string; payload?: { url?: string; headers?: Record<string, string | string[]>; path?: string } };
  let paths: string[] = [];
  if (signed?.name === "upload:generatedSignedUrlForS3" && params.payload?.url) {
    const headers = Object.fromEntries(Object.entries(params.payload.headers ?? {}).filter(([k]) => k.toLowerCase() !== "host").map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]));
    const r = await fetch(params.payload.url, { method: "PUT", headers, body: new Uint8Array(f.data), signal: AbortSignal.timeout(300_000) });
    if (!r.ok) throw new WorkflowError("VALIDATION", `Noor's storage did not take ${f.name} (HTTP ${r.status}).`);
    paths = [params.payload.path ?? ""];
  } else if (params.url) {
    const url = new URL(params.url, p.baseUrl);
    if (url.origin !== new URL(p.baseUrl).origin) throw new WorkflowError("VALIDATION", "Unexpected upload address.");
    const form = new FormData();
    form.append("files[]", new Blob([new Uint8Array(f.data)], { type: f.type }), f.name);
    const r = await fetch(url, { method: "POST", headers: { "X-CSRF-TOKEN": p.csrf, Cookie: p.cookie, Accept: "application/json" }, body: form, signal: AbortSignal.timeout(300_000) });
    if (!r.ok) throw new WorkflowError("VALIDATION", `Noor did not take ${f.name} (HTTP ${r.status}).`);
    paths = ((await r.json().catch(() => ({}))) as { paths?: string[] }).paths ?? [];
  } else throw new WorkflowError("VALIDATION", "Noor did not open its upload for this field.");
  if (!paths.length || !paths[0]) throw new WorkflowError("VALIDATION", `Noor did not keep ${f.name}.`);
  const finished = await wire(p, started.snapshot, {}, [{ method: "_finishUpload", params: [name, paths, false] }]);
  const errs = Object.values(finished.errors).flat();
  if (errs.length) throw new WorkflowError("VALIDATION", `Noor refused ${f.name}: ${errs.join(" ")}`);
  return finished.snapshot;
}

// One of Noor's forms: opened, filled and submitted. fill gets the form as Noor opened it (its blank or current
// values) and gives back the values to set, by their place in the form (title, questions, …).
export async function noorAction(user: AppUser, subjectId: string, action: { name: string; args: Obj | unknown[]; context: Obj }, fill: (data: Obj) => Obj, files: NoorFile[] = []) {
  const p = await openSubject(user, subjectId);
  const opened = await wire(p, p.snapshot, {}, [{ method: "mountAction", params: [action.name, action.args, action.context] }]);
  const mounted = unwrap(opened.data.mountedActions) as Obj[] | null;
  const form = mounted?.[mounted.length - 1];
  if (!form || form.name !== action.name) throw new WorkflowError("VALIDATION", `Noor did not open "${action.name.replace(/_/g, " ")}". The page may have changed: open it in Noor.`);
  const at = (mounted!.length - 1).toString();
  const values = fill((form.data as Obj) ?? {});
  const updates = Object.fromEntries(Object.entries(values).map(([k, v]) => [`mountedActions.${at}.data.${k}`, v]));
  let snapshot = opened.snapshot;
  for (const f of files) snapshot = await uploadInto(p, snapshot, `mountedActions.${at}.data.${f.field}`, f);
  const done = await wire(p, snapshot, updates, [{ method: "callMountedAction", params: [] }]);
  const errs = Object.entries(done.errors);
  if (errs.length) throw new WorkflowError("VALIDATION", `Noor did not accept it: ${errs.map(([k, v]) => `${k.replace(/^mountedActions\.\d+\.data\./, "")}: ${(v ?? []).join(" ")}`).join("; ").slice(0, 600)}`);
  const left = unwrap(done.data.mountedActions) as unknown[] | null;
  if (Array.isArray(left) && left.length > mounted!.length - 1) throw new WorkflowError("VALIDATION", "Noor kept the form open without saving. Check the values and try again.");
  return done;
}

// What Noor's rich text editor keeps: a document of paragraphs.
export function textDoc(text: string) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  return { type: "doc", content: lines.map((l) => ({ type: "paragraph", content: l.trim() ? [{ type: "text", text: l }] : [] })) };
}
const key = () => crypto.randomUUID();
export const questionItems = (qs: ContentQuestion[]) =>
  Object.fromEntries(qs.map((q) => [key(), { question_text: textDoc(q.text), options: Object.fromEntries(q.options.map((o, i) => [key(), { value: o, is_correct: i === q.correct }])) }]));

// --- Reading ------------------------------------------------------------------------------

async function reader(user: AppUser) {
  await access(user);
}
async function manager(user: AppUser) {
  if (!(await canManageCmsData(user))) throw new WorkflowError("FORBIDDEN", "Changing Noor's content is for Admin, or the people Admin allows to manage Noor data.");
}

type Row = { subject_id: string; name: string; grades: string; data_json: string; stats_json: string; fetched_at: string };
// Reads a subject from Noor and keeps it.
export async function readSubject(user: AppUser, id: string, grades?: string[]) {
  await reader(user);
  const p = await openSubject(user, id);
  const data = (JSON.parse(p.snapshot) as { data: Obj }).data;
  const s = subjectFrom(id, (data as Obj).data);
  const stats = subjectStats(s);
  const prev = await get<{ grades: string }>("SELECT grades FROM noor_content WHERE subject_id = ?", id);
  const g = grades ?? parseJson<string[]>(prev?.grades, []);
  await run(
    "INSERT INTO noor_content (subject_id, name, grades, data_json, stats_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (subject_id) DO UPDATE SET name = excluded.name, grades = excluded.grades, data_json = excluded.data_json, stats_json = excluded.stats_json, fetched_at = excluded.fetched_at",
    id,
    s.name,
    JSON.stringify(g),
    JSON.stringify(s),
    JSON.stringify(stats),
    nowIso(),
  );
  return { subject: s, stats, grades: g, fetchedAt: nowIso() };
}

export async function contentSubject(user: AppUser, id: string, opts: { refresh?: boolean } = {}) {
  await reader(user);
  const r = await get<Row>("SELECT * FROM noor_content WHERE subject_id = ?", id);
  if (r && !opts.refresh) return { subject: parseJson<ContentSubject>(r.data_json, null as never), stats: parseJson<ContentStats>(r.stats_json, null as never), grades: parseJson<string[]>(r.grades, []), fetchedAt: r.fetched_at };
  return readSubject(user, id);
}

// Noor's subject list (every page), with what is kept for each.
export async function noorSubjectList(user: AppUser) {
  await reader(user);
  const out: { id: string; name: string; grades: string[]; cells: Record<string, string> }[] = [];
  for (let page = 1; page <= 20; page++) {
    const l = await noorAdminList(user, "academic-contents", { page, pageSize: 50 });
    if (l.kind !== "list") break;
    for (const r of l.rows) {
      if (!r.id) continue;
      const cell = (re: RegExp) => Object.entries(r.cells).find(([k]) => re.test(k))?.[1] ?? "";
      // "Chemistry (Gr 10)": the course and its grade.
      const course = cell(/^(course|name|subject|subject name)$/i);
      const m = course.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      const grades = (cell(/grade/i) || m?.[2] || "")
        .split(/,|\n|·/)
        .map((g) => g.trim().replace(/^Gr\s*/i, "Grade "))
        .filter(Boolean);
      out.push({ id: r.id, name: (m?.[1] || course || `Subject ${r.id}`).trim(), grades, cells: r.cells });
    }
    if (page >= l.pages) break;
  }
  return out;
}

// Noor's subject list, read live (one request per 50 subjects) and kept for a few minutes, so moving between
// subjects is quick. Units and lessons come from Noor's own list; the detail of a subject is read only when it is
// opened (and the last copy opened is shown at once while Noor's current one loads).
const LIST_MS = 5 * 60e3;
let listCache: { at: number; value: Promise<Awaited<ReturnType<typeof noorSubjectList>>> } | null = null;
export function forgetSubjectList() {
  listCache = null;
}
export async function contentOverview(user: AppUser, opts: { refresh?: boolean } = {}) {
  await reader(user);
  if (opts.refresh || !listCache || Date.now() - listCache.at > LIST_MS) {
    const value = noorSubjectList(user);
    listCache = { at: Date.now(), value };
    value.catch(() => {
      if (listCache?.value === value) listCache = null;
    });
  }
  const opened = new Map((await all<Row>("SELECT subject_id, name, grades, stats_json, fetched_at, '' AS data_json FROM noor_content")).map((r) => [r.subject_id, r]));
  // Noor down or busy: the subjects opened before, said plainly.
  let listError: string | null = null;
  const list = await listCache.value.catch((e: Error) => {
    listError = `Noor's subject list could not be read (${e.message}). Showing the subjects opened before.`;
    return [...opened.values()].map((r) => {
      const st = parseJson<Partial<ContentStats>>(r.stats_json, {});
      return { id: r.subject_id, name: r.name, grades: parseJson<string[]>(r.grades, []), cells: { Units: String(st.units ?? 0), Lessons: String(st.lessons ?? 0) } as Record<string, string> };
    });
  });
  const jobs = await all<{ id: string; kind: string; subject_id: string; title: string; status: string; done: number; total: number; progress: string; updated_at: string; created_at: string }>(
    "SELECT id, kind, subject_id, title, status, done, total, progress, updated_at, created_at FROM noor_content_jobs WHERE kind <> 'refresh' ORDER BY created_at DESC LIMIT 30",
  );
  const cell = (cells: Record<string, string>, re: RegExp) => Number(String(Object.entries(cells).find(([k]) => re.test(k))?.[1] ?? "").replace(/\D/g, "")) || 0;
  return {
    subjects: list.map((x) => {
      const o = opened.get(x.id);
      return { id: x.id, name: x.name, grades: x.grades, code: Object.entries(x.cells).find(([k]) => /^code$/i.test(k))?.[1] ?? null, units: cell(x.cells, /^units?$/i), lessons: cell(x.cells, /^lessons?$/i), stats: o ? parseJson<ContentStats | null>(o.stats_json, null) : null, fetchedAt: o?.fetched_at ?? null };
    }),
    listedAt: new Date(listCache?.at ?? Date.now()).toISOString(),
    listError,
    jobs: jobs.map((j) => ({ ...j, status: staleStatus(j.status, j.updated_at) })),
    canEdit: await canManageCmsData(user),
    noorBase: (await getLegacyCmsConfigForUser(user)).baseUrl.replace(/\/+$/, ""),
  };
}

// --- The report: what content there is, and what is missing ---------------------------------

export async function contentReport(user: AppUser) {
  const o = await contentOverview(user);
  const { buildCmsReport } = await import("@/lib/cms-report");
  const { getSettings } = await import("./settings");
  const { fmtDateTime } = await import("@/lib/format");
  const s = await getSettings();
  const headers = ["Grade", "Subject", "Units", "Lessons", "With video", "Video minutes", "Free previews", "With notes", "PDF notes", "Quizzes", "Questions", "Flashcard decks", "Lessons without video", "Lessons without notes", "Units without quiz", "Read from Noor"];
  const blank = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const data = o.subjects.map((y) => ({ ...y, stats: (y.stats ?? {}) as Partial<ContentStats> })).map((x) => ({
    Grade: x.grades.join(", "),
    Subject: x.name,
    Units: String(x.units),
    Lessons: String(x.lessons),
    "With video": blank(x.stats.videos),
    "Video minutes": blank(x.stats.minutes),
    "Free previews": blank(x.stats.freePreviews),
    "With notes": blank(x.stats.lessonsWithNotes),
    "PDF notes": blank(x.stats.pdfs),
    Quizzes: blank(x.stats.quizzes),
    Questions: blank(x.stats.questions),
    "Flashcard decks": blank(x.stats.flashcards),
    "Lessons without video": blank(x.stats.lessonsWithoutVideo),
    "Lessons without notes": blank(x.stats.lessonsWithoutNotes),
    "Units without quiz": blank(x.stats.unitsWithoutQuiz),
    "Read from Noor": x.fetchedAt ? fmtDateTime(x.fetchedAt, s.workspace.timezone) : "Not opened yet",
  }));
  const day = nowIso().slice(0, 10);
  const report = buildCmsReport(data, headers, { category: "noor-content", from: day, until: day, columns: headers, groupBy: "none" as const, sumColumn: "Lessons", title: "Academic content" });
  const opened = o.subjects.filter((x) => x.stats);
  const t = { ...totals(opened.map((x) => x.stats!)), units: o.subjects.reduce((n, x) => n + x.units, 0), lessons: o.subjects.reduce((n, x) => n + x.lessons, 0) };
  const meta = {
    table: "Academic content in Noor",
    from: day,
    until: day,
    filters: `${o.subjects.length} subjects: ${t.units} units, ${t.lessons} lessons. In the ${opened.length} subjects opened: ${t.videos} lessons with video (${t.minutes} minutes), ${t.quizzes} quizzes with ${t.questions} questions, ${t.notes} notes`,
    exportedAt: fmtDateTime(nowIso(), s.workspace.timezone),
    exportedBy: user.name,
    method: "Noor's subject list; the detail of each subject as last opened",
    workspace: s.workspace.name,
  };
  return { report, meta, totals: t, subjects: o.subjects };
}
export function totals(list: ContentStats[]) {
  const t = { units: 0, lessons: 0, videos: 0, freePreviews: 0, minutes: 0, lessonsWithNotes: 0, notes: 0, pdfs: 0, quizzes: 0, questions: 0, flashcards: 0, lessonsWithoutVideo: 0, lessonsWithoutNotes: 0, unitsWithoutQuiz: 0, unitsWithoutLessons: 0 } as ContentStats;
  for (const s of list) for (const k of Object.keys(t) as (keyof ContentStats)[]) t[k] += Number(s?.[k] ?? 0);
  return t;
}

// --- Importing questions ----------------------------------------------------------------------

// Questions from text: the Aiken format (a question, its options A. B. C. …, then ANSWER: B), one question after
// another; or a table (CSV or a spreadsheet's rows) with a question, options A to F and the answer (a letter, a
// number, or the right option's text).
export type ParsedQuestions = { questions: ContentQuestion[]; errors: { at: string; message: string }[] };
export function parseAiken(text: string): ParsedQuestions {
  const out: ParsedQuestions = { questions: [], errors: [] };
  let n = 0;
  let q: string[] = [];
  let opts: string[] = [];
  const finish = (answer: string | null) => {
    if (!q.length && !opts.length) return;
    n++;
    const x = check({ text: q.join("\n"), options: opts, answer }, `Question ${n}`, out.errors);
    if (x) out.questions.push(x);
    q = [];
    opts = [];
  };
  for (const raw of String(text ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const a = l.match(/^(?:ANSWER|ANS|CORRECT|መልስ)\s*[:：-]\s*(.+)$/i);
    const o = l.match(/^\(?([A-Ja-j])[.)：:]\s*(.+)$/);
    if (a) finish(a[1].trim());
    else if (o && q.length && o[1].toUpperCase() === LETTERS[opts.length]) opts.push(o[2].trim());
    else if (opts.length) {
      // A new question started without an answer line for the last one.
      if (/^\d+[.)]\s+/.test(l)) {
        finish(null);
        q.push(l.replace(/^\d+[.)]\s*/, ""));
      } else opts[opts.length - 1] += ` ${l}`;
    } else q.push(q.length ? l : l.replace(/^\d+[.)]\s*/, ""));
  }
  finish(null);
  return out;
}
export function parseQuestionRows(rows: Record<string, unknown>[]): ParsedQuestions {
  const out: ParsedQuestions = { questions: [], errors: [] };
  rows.forEach((r, i) => {
    const get = (re: RegExp) => {
      const k = Object.keys(r).find((x) => re.test(x.trim()));
      return k === undefined ? "" : String(r[k] ?? "").trim();
    };
    const text = get(/^(question|question text|q|ጥያቄ)$/i);
    const options = ["a", "b", "c", "d", "e", "f"].map((l) => get(new RegExp(`^(option\\s*)?${l}$|^choice\\s*${l}$`, "i"))).filter(Boolean);
    if (!text && !options.length) return;
    const q = check({ text, options, answer: get(/^(answer|correct|correct answer|key|መልስ)$/i) || null }, `Row ${i + 2}`, out.errors);
    if (q) out.questions.push(q);
  });
  return out;
}
function check(x: { text: string; options: string[]; answer: string | null }, at: string, errors: ParsedQuestions["errors"]): ContentQuestion | null {
  const text = x.text.trim();
  const options = x.options.map((o) => o.trim()).filter(Boolean);
  if (!text) return errors.push({ at, message: "The question is empty." }), null;
  if (options.length < 2) return errors.push({ at, message: "A question needs at least two options." }), null;
  if (options.length > 6) return errors.push({ at, message: "At most six options." }), null;
  if (text.length > 4000 || options.some((o) => o.length > 1000)) return errors.push({ at, message: "Too long." }), null;
  const a = (x.answer ?? "").trim();
  let correct = -1;
  if (/^[A-Ja-j]$/.test(a)) correct = LETTERS.indexOf(a.toUpperCase());
  else if (/^\d+$/.test(a)) correct = Number(a) - 1;
  else if (a) correct = options.findIndex((o) => o.toLowerCase() === a.toLowerCase());
  if (correct < 0 || correct >= options.length) return errors.push({ at, message: a ? `The answer "${a}" is not one of the options.` : "Say which option is right (ANSWER: B)." }), null;
  return { id: null, text, options, correct };
}

// Lessons from a table: title, YouTube link or id, duration (minutes:seconds or seconds), free preview, description.
export type LessonInput = { title: string; youtube: string | null; duration: number | null; free: boolean; description: string };
export function youtubeId(v: string) {
  const s = String(v ?? "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}
export function parseLessonRows(rows: Record<string, unknown>[]) {
  const out: { lessons: LessonInput[]; errors: { at: string; message: string }[] } = { lessons: [], errors: [] };
  rows.forEach((r, i) => {
    const get = (re: RegExp) => String(Object.entries(r).find(([k]) => re.test(k.trim()))?.[1] ?? "").trim();
    const title = get(/^(title|lesson|lesson title|name)$/i);
    if (!title) return;
    const video = get(/^(youtube|video|link|url|youtube id|video id)$/i);
    const yt = video ? youtubeId(video) : null;
    if (video && !yt) return void out.errors.push({ at: `Row ${i + 2}`, message: `"${video}" is not a YouTube link.` });
    const dur = get(/^(duration|length|seconds|minutes)$/i);
    const mm = dur.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    const duration = !dur ? null : mm ? (mm[3] ? Number(mm[1]) * 3600 + Number(mm[2]) * 60 + Number(mm[3]) : Number(mm[1]) * 60 + Number(mm[2])) : Number.isFinite(Number(dur)) ? Math.round(Number(dur)) : null;
    if (dur && duration === null) return void out.errors.push({ at: `Row ${i + 2}`, message: `"${dur}" is not a duration (12:30 or seconds).` });
    out.lessons.push({ title: title.slice(0, 250), youtube: yt, duration, free: /^(yes|y|true|1|free)$/i.test(get(/^(free|free preview|preview)$/i)), description: get(/^(description|about|summary)$/i).slice(0, 4000) });
  });
  return out;
}

// --- Jobs: changes to Noor, step by step ------------------------------------------------------

export type ContentJobInput =
  | { kind: "refresh"; subjectId: "all" }
  | { kind: "quiz"; subjectId: string; unitId: number; lessonId?: number | null; quizId?: number | null; title: string; timeLimitMinutes?: number | null; questions: ContentQuestion[]; batch?: number }
  | { kind: "lessons"; subjectId: string; unitId: number; lessons: LessonInput[] }
  | { kind: "units"; subjectId: string; units: { title: string; description?: string }[] }
  | { kind: "note"; subjectId: string; unitId: number; lessonId?: number | null; text: string; pdf?: { name: string; base64: string } | null }
  | { kind: "edit-lesson"; subjectId: string; unitId: number; lessonId: number; patch: Partial<LessonInput> }
  | { kind: "edit-unit"; subjectId: string; unitId: number; patch: { title?: string; description?: string } };
type Step = { label: string; run: (job: { log: (m: string) => Promise<void> }) => Promise<string> };
const STALE_MS = 15 * 60e3;
const staleStatus = (status: string, updated: string) => ((status === "running" || status === "queued") && Date.now() - Date.parse(updated) > STALE_MS ? "stopped" : status);
const BATCH = 20;

function validate(i: ContentJobInput) {
  if (i.kind === "refresh") return;
  if (!SUBJECT_ID.test(String(i.subjectId))) throw new WorkflowError("VALIDATION", "Choose a subject.");
  const int = (v: unknown) => Number.isSafeInteger(Number(v)) && Number(v) > 0;
  if ("unitId" in i && !int(i.unitId)) throw new WorkflowError("VALIDATION", "Choose a unit.");
  if (i.kind === "quiz") {
    if (!i.quizId && !i.title?.trim()) throw new WorkflowError("VALIDATION", "Give the quiz a title.");
    if (!i.questions?.length) throw new WorkflowError("VALIDATION", "There are no questions to add.");
    if (i.questions.length > 1000) throw new WorkflowError("VALIDATION", "At most 1,000 questions at a time.");
    const errors: ParsedQuestions["errors"] = [];
    i.questions = i.questions.map((q, n) => check({ text: q.text, options: q.options, answer: String(q.correct + 1) }, `Question ${n + 1}`, errors)).filter((q): q is ContentQuestion => !!q);
    if (errors.length) throw new WorkflowError("VALIDATION", errors.slice(0, 5).map((e) => `${e.at}: ${e.message}`).join(" "));
  }
  if (i.kind === "lessons" && (!i.lessons?.length || i.lessons.length > 300)) throw new WorkflowError("VALIDATION", "Add between 1 and 300 lessons at a time.");
  if (i.kind === "units" && (!i.units?.length || i.units.length > 50 || i.units.some((u) => !u.title?.trim()))) throw new WorkflowError("VALIDATION", "Every unit needs a title (at most 50 at a time).");
  if (i.kind === "note" && !i.text?.trim() && !i.pdf) throw new WorkflowError("VALIDATION", "Write the note or attach a PDF.");
  if (i.kind === "note" && i.pdf && (!/\.pdf$/i.test(i.pdf.name) || i.pdf.base64.length > 14_000_000)) throw new WorkflowError("VALIDATION", "Attach a PDF of at most 10 MB.");
}

export async function startContentJob(user: AppUser, input: ContentJobInput) {
  if (input.kind === "refresh") await reader(user);
  else await manager(user);
  validate(input);
  if (JSON.stringify(input).length > 2_000_000) throw new WorkflowError("VALIDATION", "Too much at once: split it.");
  const running = await get<{ id: string; updated_at: string }>("SELECT id, updated_at FROM noor_content_jobs WHERE subject_id IN (?, 'all') AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1", String(input.subjectId));
  if (running && Date.now() - Date.parse(running.updated_at) < STALE_MS) throw new WorkflowError("INVALID_STATE", "Another change to this subject is still running. Wait for it to finish.");
  const id = uid("ncj_");
  const now = nowIso();
  const title = jobTitle(input);
  await run("INSERT INTO noor_content_jobs (id, actor_id, kind, subject_id, title, input_json, status, total, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, 'Waiting to start', ?, ?)", id, user.id, input.kind, String(input.subjectId), title, JSON.stringify(input), input.kind === "refresh" ? 0 : plan(user, input).length, now, now);
  await audit({ actor: user }, { action: "noor.content_job", summary: `${user.name} started: ${title}` });
  void runContentJob(id).catch((e) => console.error("Noor content job failed", e));
  return { id };
}
function jobTitle(i: ContentJobInput) {
  if (i.kind === "refresh") return "Read every subject from Noor";
  if (i.kind === "quiz") return `${i.quizId ? "Add" : "New quiz with"} ${i.questions.length} question${i.questions.length === 1 ? "" : "s"}${i.quizId ? " to a quiz" : `: ${i.title}`}`;
  if (i.kind === "lessons") return `Add ${i.lessons.length} lesson${i.lessons.length === 1 ? "" : "s"}`;
  if (i.kind === "units") return `Add ${i.units.length} unit${i.units.length === 1 ? "" : "s"}`;
  if (i.kind === "note") return "Add a note";
  if (i.kind === "edit-lesson") return "Change a lesson";
  return "Change a unit";
}

// The steps of a job: each one of Noor's forms, filled and submitted.
function plan(user: AppUser, i: Exclude<ContentJobInput, { kind: "refresh" }>): Step[] {
  const sid = String(i.subjectId);
  const unitCtx = (u: number) => ({ recordKey: String(u), schemaComponent: `form.units.record-${u}` });
  const lessonsCtx = (u: number) => ({ recordKey: String(u), schemaComponent: `form.units.record-${u}.lessons` });
  if (i.kind === "units")
    return i.units.map((u, n) => ({
      label: `Unit ${n + 1}: ${u.title}`,
      run: async () => (await noorAction(user, sid, { name: "add", args: {}, context: { recordKey: sid, schemaComponent: "form.units" } }, () => ({ title: u.title.trim().slice(0, 250), description: textDoc(u.description ?? "") })), "added"),
    }));
  if (i.kind === "lessons")
    return i.lessons.map((l, n) => ({
      label: `Lesson ${n + 1}: ${l.title}`,
      run: async () => (
        await noorAction(user, sid, { name: "add_lesson", args: {}, context: unitCtx(i.unitId) }, () => ({ title: l.title, description: textDoc(l.description), video_disk: "youtube", youtube_video_id: l.youtube, duration_seconds: l.duration, is_free_preview: l.free })),
        l.youtube ? "added with its YouTube video" : "added (no video yet)"
      ),
    }));
  if (i.kind === "note") {
    const files: NoorFile[] = i.pdf ? [{ field: "pdf_url", name: i.pdf.name, type: "application/pdf", data: Buffer.from(i.pdf.base64, "base64") }] : [];
    return [
      {
        label: i.pdf ? `Note with ${i.pdf.name}` : "Note",
        run: async () =>
          i.lessonId
            ? (await noorAction(user, sid, { name: "add_note_btn", args: { item: `record-${i.lessonId}` }, context: lessonsCtx(i.unitId) }, () => ({ content_text: textDoc(i.text) }), files), "added to the lesson")
            : (await noorAction(user, sid, { name: "add_note", args: {}, context: unitCtx(i.unitId) }, () => ({ content_text: textDoc(i.text) }), files), "added to the unit"),
      },
    ];
  }
  if (i.kind === "edit-lesson")
    return [
      {
        label: "Lesson",
        run: async () => {
          const p = i.patch;
          await noorAction(user, sid, { name: "edit_lesson", args: { item: `record-${i.lessonId}` }, context: lessonsCtx(i.unitId) }, () => ({
            ...(p.title !== undefined ? { title: p.title } : {}),
            ...(p.description !== undefined ? { description: textDoc(p.description) } : {}),
            ...(p.youtube !== undefined ? { video_disk: "youtube", youtube_video_id: p.youtube } : {}),
            ...(p.duration !== undefined ? { duration_seconds: p.duration } : {}),
            ...(p.free !== undefined ? { is_free_preview: p.free } : {}),
          }));
          return "changed";
        },
      },
    ];
  if (i.kind === "edit-unit")
    return [
      {
        label: "Unit",
        run: async () => (await noorAction(user, sid, { name: "edit_unit", args: {}, context: unitCtx(i.unitId) }, () => ({ ...(i.patch.title !== undefined ? { title: i.patch.title } : {}), ...(i.patch.description !== undefined ? { description: textDoc(i.patch.description) } : {}) })), "changed"),
      },
    ];
  // A quiz: the first batch makes it (or, for an existing quiz, is added with Edit Quiz), the others are added to it.
  const size = Math.min(50, Math.max(5, i.batch ?? BATCH));
  const batches: ContentQuestion[][] = [];
  for (let n = 0; n < i.questions.length; n += size) batches.push(i.questions.slice(n, n + size));
  let quizId = i.quizId ?? null;
  return batches.map((qs, n) => ({
    label: `Questions ${n * size + 1}–${n * size + qs.length}`,
    run: async (job) => {
      if (!quizId) {
        const create = i.lessonId ? { name: "add_quiz_btn", args: { item: `record-${i.lessonId}` }, context: lessonsCtx(i.unitId) } : { name: "add_quiz", args: {}, context: unitCtx(i.unitId) };
        const before = new Set(quizIds(await readSubject(user, sid).then((r) => r.subject), i.unitId, i.lessonId));
        await noorAction(user, sid, create, () => ({ title: i.title.trim().slice(0, 250), time_limit_seconds: i.timeLimitMinutes ? Math.round(i.timeLimitMinutes * 60) : null, questions: questionItems(qs) }));
        // The new quiz's number, for the next batches.
        const after = quizIds((await readSubject(user, sid)).subject, i.unitId, i.lessonId).filter((x) => !before.has(x));
        quizId = after.length ? Math.max(...after) : null;
        if (!quizId && batches.length > 1) throw new WorkflowError("VALIDATION", "Noor made the quiz but it could not be found again to add the next questions.");
        await job.log(`Made the quiz${quizId ? ` (#${quizId})` : ""}`);
        return `${qs.length} added`;
      }
      const ctx = i.lessonId ? { recordKey: String(i.unitId), schemaComponent: `form.units.record-${i.unitId}.lessons.record-${i.lessonId}.quizzes` } : { recordKey: String(i.unitId), schemaComponent: `form.units.record-${i.unitId}.quizzes` };
      let had = 0;
      await noorAction(user, sid, { name: "edit_quiz", args: { item: `record-${quizId}` }, context: ctx }, (data) => {
        // Added after the questions the quiz has; the existing ones are left as Noor sent them.
        had = Object.keys((data.questions as Obj) ?? {}).length;
        return Object.fromEntries(Object.entries(questionItems(qs)).map(([k, v]) => [`questions.${k}`, v]));
      });
      return `${qs.length} added (the quiz had ${had})`;
    },
  }));
}
function quizIds(s: ContentSubject, unitId: number, lessonId?: number | null) {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return [];
  return (lessonId ? (u.lessons.find((l) => l.id === lessonId)?.quizzes ?? []) : u.quizzes).map((q) => q.id);
}

export async function runContentJob(id: string) {
  const j = await get<{ id: string; actor_id: string | null; input_json: string; status: string }>("SELECT id, actor_id, input_json, status FROM noor_content_jobs WHERE id = ?", id);
  if (!j || j.status !== "queued") return;
  const user = j.actor_id ? await loadUser(j.actor_id) : null;
  if (!user) return void (await run("UPDATE noor_content_jobs SET status = 'failed', progress = 'The person who started it is gone.', updated_at = ? WHERE id = ?", nowIso(), id));
  const input = JSON.parse(j.input_json) as ContentJobInput;
  const log: { at: string; step: string; ok: boolean; message: string }[] = [];
  const save = (status: string, done: number, progress: string) => run("UPDATE noor_content_jobs SET status = ?, done = ?, progress = ?, log_json = ?, updated_at = ? WHERE id = ?", status, done, progress, JSON.stringify(log), nowIso(), id);
  if (input.kind === "refresh") {
    await save("running", 0, "Reading Noor's subject list…");
    try {
      let n = 0;
      const r = await refreshAllContent(user, async (m) => {
        n++;
        await run("UPDATE noor_content_jobs SET done = ?, progress = ?, updated_at = ? WHERE id = ?", n, m, nowIso(), id);
      });
      for (const e of r.errors) log.push({ at: nowIso(), step: "Subject", ok: false, message: e });
      await run("UPDATE noor_content_jobs SET total = ? WHERE id = ?", r.subjects, id);
      await save(r.errors.length && r.errors.length === r.subjects ? "failed" : "done", r.subjects - r.errors.length, `Read ${r.subjects - r.errors.length} of ${r.subjects} subjects${r.errors.length ? `; ${r.errors.length} could not be read` : ""}`);
    } catch (e) {
      log.push({ at: nowIso(), step: "List", ok: false, message: e instanceof Error ? e.message : String(e) });
      await save("failed", 0, e instanceof Error ? e.message : String(e));
    }
    return;
  }
  const steps = plan(user, input);
  await save("running", 0, "Starting");
  let done = 0;
  for (const s of steps) {
    if ((await get<{ status: string }>("SELECT status FROM noor_content_jobs WHERE id = ?", id))?.status === "cancelled") return void log.push({ at: nowIso(), step: "Stopped", ok: false, message: "Stopped by request" });
    await save("running", done, `${s.label}…`);
    try {
      const msg = await s.run({ log: async (m) => void log.push({ at: nowIso(), step: s.label, ok: true, message: m }) });
      log.push({ at: nowIso(), step: s.label, ok: true, message: msg });
      done++;
    } catch (e) {
      log.push({ at: nowIso(), step: s.label, ok: false, message: e instanceof Error ? e.message : String(e) });
      await save("failed", done, `Stopped at ${s.label}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500));
      await readSubject(user, String(input.subjectId)).catch(() => null);
      return;
    }
  }
  // Read again: what Noor now has (and Noor's list, whose counts changed).
  forgetSubjectList();
  const after = await readSubject(user, String(input.subjectId)).catch(() => null);
  log.push({ at: nowIso(), step: "Check", ok: !!after, message: after ? `Noor now has ${after.stats.lessons} lessons and ${after.stats.questions} questions in this subject` : "Could not read the subject again" });
  await save("done", done, `Done: ${done} of ${steps.length}`);
}

export async function contentJob(user: AppUser, id: string) {
  await reader(user);
  const j = await get<{ id: string; kind: string; subject_id: string; title: string; status: string; done: number; total: number; progress: string; log_json: string; created_at: string; updated_at: string }>("SELECT id, kind, subject_id, title, status, done, total, progress, log_json, created_at, updated_at FROM noor_content_jobs WHERE id = ?", id);
  if (!j) throw new WorkflowError("NOT_FOUND", "No such job.");
  return { ...j, status: staleStatus(j.status, j.updated_at), log: parseJson<{ at: string; step: string; ok: boolean; message: string }[]>(j.log_json, []) };
}
export async function cancelContentJob(user: AppUser, id: string) {
  await manager(user);
  await run("UPDATE noor_content_jobs SET status = 'cancelled', progress = 'Stopping…', updated_at = ? WHERE id = ? AND status IN ('queued','running')", nowIso(), id);
}

// Every subject read again from Noor (Refresh all), one after another.
export async function refreshAllContent(user: AppUser, progress: (m: string) => Promise<void> = async () => {}) {
  await reader(user);
  const list = await noorSubjectList(user);
  const errors: string[] = [];
  let n = 0;
  for (const s of list) {
    await progress(`Reading ${s.name} (${++n} of ${list.length})`);
    try {
      await readSubject(user, s.id, s.grades);
    } catch (e) {
      errors.push(`${s.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const ids = new Set(list.map((s) => s.id));
  // Subjects Noor no longer lists leave the report.
  for (const r of await all<{ subject_id: string }>("SELECT subject_id FROM noor_content")) if (!ids.has(r.subject_id)) await run("DELETE FROM noor_content WHERE subject_id = ?", r.subject_id);
  return { subjects: list.length, errors };
}
