// A fake Noor Academic Content edit page (subject 7, Chemistry) for the browser test: the page with its Livewire
// form, and Noor's forms (Add Quiz, Edit Quiz, Add Lesson, Add Unit, Add Note, Edit Lesson, Edit Unit) opened and
// submitted through /livewire/update, as Filament does.
const arr = (v) => [v, { s: "arr" }];
const keyed = (xs, f) => arr(Object.fromEntries(xs.map((x) => [`record-${x.id}`, f(x)])));
const doc = (text) => ({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] });
const docText = (d) => (d?.content ?? []).map((p) => (p.content ?? []).map((t) => t.text ?? "").join("")).join("\n");
const enc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function createNoorContent() {
  const state = { seq: 500, units: [], quizzes: [], calls: [] };
  const id = () => ++state.seq;
  state.units.push({ id: 40, title: "Unit 1: Chemical Reactions", position: 0, description: "<p>Reactions and equations</p>", notes: [], lessons: [
    { id: 134, unit_id: 40, position: 1, title: "Part 1 - Change of State", youtube_video_id: "io7hjBF5phY", video_disk: "youtube", duration_seconds: 1006, is_free_preview: true, description: "", notes: [{ id: 633, content_text: "<p>Chemical reactions note</p>", pdf_url: "lessons/notes/a.pdf" }] },
    { id: 135, unit_id: 40, position: 2, title: "Part 2 - Balancing Equations", youtube_video_id: null, video_disk: "youtube", duration_seconds: null, is_free_preview: false, description: "", notes: [] },
  ] });
  state.units.push({ id: 41, title: "Unit 2: Solutions", position: 1, description: "", notes: [], lessons: [] });
  state.quizzes.push({ id: 152, unit_id: 40, lesson_id: null, title: "Chemistry chapter one", time_limit_seconds: 1800, questions: [{ id: 4219, question_text: "<p>Which shows a precipitate forming?</p>", options: ["Gas", "Colour change", "A solid forms", "Heat"], correct_answer: "C" }] });
  const quizData = (q) => ({ id: q.id, unit_id: q.unit_id, title: q.title, time_limit_seconds: q.time_limit_seconds, questions: keyed(q.questions, (x) => ({ ...x, options: arr(x.options) })) });
  const formData = () => ({
    id: 7, name: "Chemistry", code: "CHEM", type: "normal", is_stem: true, grade_ids: arr(["6"]),
    units: keyed(state.units, (u) => ({
      id: u.id, title: u.title, position: u.position, description: u.description,
      lessons: keyed(u.lessons, (l) => ({ ...l, notes: keyed(l.notes, (n) => n), quizzes: keyed(state.quizzes.filter((q) => q.lesson_id === l.id), quizData), flashcardDecks: arr([]) })),
      notes: keyed(u.notes, (n) => n),
      quizzes: keyed(state.quizzes.filter((q) => q.unit_id === u.id && !q.lesson_id), quizData),
      flashcardDecks: arr([]),
    })),
    quizzes: keyed(state.quizzes, quizData),
  });
  const snapshotOf = (mounted = [], errors = {}) => JSON.stringify({ data: { data: arr(formData()), mountedActions: arr(mounted) }, memo: { id: "c1", name: "App\\Filament\\Resources\\AcademicContentResource\\Pages\\EditAcademicContent", errors } });
  const opened = (name, args, context) => {
    const base = { name, arguments: args, context };
    if (name === "add_quiz" || name === "add_quiz_btn") return { ...base, data: { title: null, time_limit_seconds: null, questions: { blank: { question_text: doc(""), options: { o1: { value: null, is_correct: false } } } } } };
    if (name === "edit_quiz") {
      const q = state.quizzes.find((x) => `record-${x.id}` === args.item);
      return { ...base, data: { title: q.title, time_limit_seconds: q.time_limit_seconds, questions: Object.fromEntries(q.questions.map((x) => [`k${x.id}`, { question_text: doc(x.question_text.replace(/<[^>]+>/g, "")), options: Object.fromEntries(x.options.map((o, i) => [`o${i}`, { value: o, is_correct: "ABCDEF"[i] === x.correct_answer }])) }])) } };
    }
    if (name === "add_lesson") return { ...base, data: { title: null, description: doc(""), video_disk: "youtube", youtube_video_id: null, duration_seconds: null, is_free_preview: false } };
    if (name === "edit_lesson") {
      const l = state.units.flatMap((u) => u.lessons).find((x) => `record-${x.id}` === args.item);
      return { ...base, data: { title: l.title, description: doc(l.description), video_disk: l.video_disk, youtube_video_id: l.youtube_video_id, duration_seconds: l.duration_seconds, is_free_preview: l.is_free_preview } };
    }
    if (name === "add") return { ...base, data: { title: null, position: 0, description: doc("") } };
    if (name === "add_note" || name === "add_note_btn") return { ...base, data: { content_text: doc(""), pdf_disk: "s3", pdf_url: [] } };
    if (name === "edit_unit") {
      const u = state.units.find((x) => String(x.id) === context.recordKey);
      return { ...base, data: { title: u.title, position: u.position, description: doc(u.description) } };
    }
    return null;
  };
  const questionsFrom = (qs, errors) =>
    Object.entries(qs).map(([k, x]) => {
      const opts = Object.values(x.options);
      if (!docText(x.question_text).trim()) errors[`mountedActions.0.data.questions.${k}.question_text`] = ["The question text field is required."];
      if (opts.filter((o) => o.is_correct).length !== 1) errors[`mountedActions.0.data.questions.${k}.options`] = ["Mark one correct option."];
      return { id: id(), question_text: `<p>${docText(x.question_text)}</p>`, options: opts.map((o) => String(o.value)), correct_answer: "ABCDEF"[opts.findIndex((o) => o.is_correct)] ?? "A" };
    });
  const submit = (m) => {
    const errors = {};
    const d = m.data;
    const unitId = Number(m.context.recordKey);
    if (m.name === "add_quiz" || m.name === "add_quiz_btn") {
      if (!d.title) errors["mountedActions.0.data.title"] = ["The title field is required."];
      const qs = questionsFrom(d.questions, errors);
      if (!Object.keys(errors).length) state.quizzes.push({ id: id(), unit_id: unitId, lesson_id: m.name === "add_quiz_btn" ? Number(m.arguments.item.slice(7)) : null, title: String(d.title), time_limit_seconds: d.time_limit_seconds ?? null, questions: qs });
    } else if (m.name === "edit_quiz") {
      const q = state.quizzes.find((x) => `record-${x.id}` === m.arguments.item);
      const qs = questionsFrom(d.questions, errors);
      if (!Object.keys(errors).length) q.questions = qs;
    } else if (m.name === "add_lesson") {
      if (!d.title) errors["mountedActions.0.data.title"] = ["The title field is required."];
      else state.units.find((u) => u.id === unitId).lessons.push({ id: id(), unit_id: unitId, position: 99, title: String(d.title), youtube_video_id: d.youtube_video_id ?? null, video_disk: "youtube", duration_seconds: d.duration_seconds ?? null, is_free_preview: !!d.is_free_preview, description: docText(d.description), notes: [] });
    } else if (m.name === "edit_lesson") {
      const l = state.units.flatMap((u) => u.lessons).find((x) => `record-${x.id}` === m.arguments.item);
      Object.assign(l, { title: d.title, youtube_video_id: d.youtube_video_id, duration_seconds: d.duration_seconds, is_free_preview: d.is_free_preview });
    } else if (m.name === "add") state.units.push({ id: id(), title: String(d.title), position: state.units.length, description: docText(d.description), lessons: [], notes: [] });
    else if (m.name === "add_note_btn") state.units.flatMap((u) => u.lessons).find((x) => `record-${x.id}` === m.arguments.item).notes.push({ id: id(), content_text: docText(d.content_text), pdf_url: d.pdf_url && typeof d.pdf_url === "object" && Object.keys(d.pdf_url).length ? `lessons/notes/${String(Object.values(d.pdf_url)[0]).replace("livewire-file:", "")}` : null });
    else if (m.name === "add_note") state.units.find((u) => u.id === unitId).notes.push({ id: id(), content_text: docText(d.content_text) });
    else if (m.name === "edit_unit") Object.assign(state.units.find((u) => u.id === unitId), { title: d.title });
    return errors;
  };
  const setPath = (o, path, v) => {
    const parts = path.split(".");
    let cur = o;
    for (const p of parts.slice(0, -1)) {
      // PHP keeps an empty list and a keyed list alike; here a keyed entry needs an object.
      if (Array.isArray(cur[p]) && !cur[p].length) cur[p] = {};
      cur = cur[p] ??= {};
    }
    cur[parts.at(-1)] = v;
  };
  return {
    state,
    respond(method, path, body) {
      if (method === "GET" && path === "/admin/academic-contents/7/edit") return { status: 200, html: `<html><head><meta name="csrf-token" content="tok"></head><body><div wire:snapshot="${enc(snapshotOf())}" data-update-uri="/livewire/update"></div></body></html>` };
      if (method === "POST" && path === "/livewire/upload-file") {
        state.uploads = (state.uploads ?? 0) + 1;
        return { json: { paths: [`tmp-${state.uploads}.pdf`] } };
      }
      if (method === "POST" && path === "/livewire/update") {
        const c = body.components[0];
        const call = c.calls[0];
        state.calls.push(call.method === "mountAction" ? call.params[0] : call.method);
        if (call.method === "_startUpload") {
          state.uploading = call.params[0];
          return { json: { components: [{ snapshot: c.snapshot, effects: { html: "<div></div>", dispatches: [{ name: "upload:generatedSignedUrl", params: { name: call.params[0], url: "/livewire/upload-file?expires=1&signature=x" } }] } }] } };
        }
        if (call.method === "_finishUpload") {
          // The temporary file goes into the form's state, as Livewire does.
          const snap = JSON.parse(c.snapshot);
          const m = snap.data.mountedActions[0][0];
          setPath({ mountedActions: { 0: m } }, call.params[0], `livewire-file:${call.params[1][0]}`);
          return { json: { components: [{ snapshot: JSON.stringify(snap), effects: { html: "<div></div>" } }] } };
        }
        if (call.method === "mountAction") {
          const m = opened(call.params[0], call.params[1], call.params[2]);
          return { json: { components: [{ snapshot: snapshotOf(m ? [m] : []), effects: { html: "<div></div>" } }] } };
        }
        if (call.method === "callMountedAction") {
          const m = JSON.parse(c.snapshot).data.mountedActions[0][0];
          for (const [k, v] of Object.entries(c.updates)) setPath({ mountedActions: { 0: m } }, k, v);
          const errors = submit(m);
          return { json: { components: [{ snapshot: snapshotOf(Object.keys(errors).length ? [m] : [], errors), effects: { html: "<div></div>" } }] } };
        }
      }
      return { status: 404, html: "Not found" };
    },
    // The edit page's form data, for the test's preparation.
    formData,
  };
}
