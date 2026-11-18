// A fake Noor (Filament 3 over Livewire 3) for the admin pages: Students is a list with create, edit and delete,
// Send SMS and Settings are form pages, Grades is refused to the app's Noor login. It answers like Noor: signed
// snapshots in the page, POST /livewire/update with updates and calls, validation errors in memo.errors.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const head = (snap, title) => `<!doctype html><html><head><meta name="csrf-token" content="tok-1"></head><body><h1>${title}</h1><div wire:snapshot="${esc(JSON.stringify(snap))}" wire:id="c1">`;
const tail = `</div><script data-update-uri="/livewire/update"></script></body></html>`;

export function createNoorAdmin() {
  const state = {
    students: Array.from({ length: 30 }, (_, k) => ({ id: k + 1, name: `Student ${k + 1}`, grade: k % 2 ? "Grade 2" : "Grade 1", active: k % 3 !== 0 })),
    sms: [],
    settings: { site_name: "Noor", maintenance: false },
    calls: [],
  };
  const tableSnap = { data: { tableRecordsPerPage: 10, tableSearch: "", tableDeferredFilters: [{ grade: [{ value: null }, { s: "arr" }] }, { s: "arr" }] }, memo: { name: "app.filament.resources.student-resource.pages.list-students" } };
  const tableHtml = (rows, page, size, total) =>
    `<table><thead><tr><th>ID</th><th>Name</th><th>Grade</th><th class="fi-ta-actions-header-cell"></th></tr></thead><tbody>${rows
      .map((r) => `<tr wire:key="r${r.id}"><td><a href="/admin/students/${r.id}">${r.id}</a></td><td>${r.name}</td><td>${r.grade}</td><td><a href="/admin/students/${r.id}/edit">Edit</a> <button wire:click="mountTableAction('delete', '${r.id}')">Delete</button></td></tr>`)
      .join("")}</tbody></table><p>Showing ${total ? (page - 1) * size + 1 : 0} to ${Math.min(page * size, total)} of ${total} results</p>`;
  const filtered = (search, grade) => state.students.filter((s) => (!search || s.name.toLowerCase().includes(search.toLowerCase())) && (!grade || s.grade === grade));
  const listPage = () =>
    head(tableSnap, "Students") +
    `<a href="/admin/students/create">New student</a><select wire:model.live="tableDeferredFilters.grade.value"><option value="">All</option><option value="Grade 1">Grade 1</option><option value="Grade 2">Grade 2</option></select>` +
    tableHtml(state.students.slice(0, 10), 1, 10, state.students.length) +
    tail;

  const studentForm = (s, submit) =>
    head({ data: { data: [{ name: s?.name ?? null, grade: s?.grade ?? null, bio: null, is_active: s ? s.active : true, gender: null, photo: null }, { s: "arr" }], record: s?.id ?? null }, memo: { name: `app.filament.resources.student-resource.pages.${submit === "create" ? "create" : "edit"}-student` } }, s ? `Edit ${s.name}` : "Create Student") +
    `<form wire:submit="${submit}">` +
    `<label for="data.name"><span>Full name</span><sup>*</sup></label><input type="text" id="data.name" wire:model="data.name" maxlength="120">` +
    `<label for="data.grade"><span>Grade</span></label><select id="data.grade" wire:model="data.grade"><option value="">Select an option</option><option value="Grade 1">Grade 1</option><option value="Grade 2">Grade 2</option></select>` +
    `<label for="data.bio"><span>Bio</span></label><textarea id="data.bio" wire:model.blur="data.bio"></textarea>` +
    `<label for="data.is_active"><span>Active</span></label><button type="button" role="switch" class="fi-fo-toggle" x-data="{ state: $wire.$entangle('data.is_active', false) }" x-bind:aria-checked="state > 0"></button>` +
    `<label for="data.gender"><span>Gender</span></label><div class="fi-fo-select" x-data="selectFormComponent({ isMultiple: false, options: ${esc(JSON.stringify([{ label: "Female", value: "f" }, { label: "Male", value: "m" }]))}, placeholder: null, state: $wire.$entangle('data.gender') })"></div>` +
    `<label for="data.photo"><span>Photo</span></label><div class="fi-fo-file-upload" x-data="fileUploadFormComponent({ state: $wire.$entangle('data.photo') })"></div>` +
    `<button type="submit"><span>${submit === "create" ? "Create" : "Save changes"}</span></button></form>` +
    tail;

  const smsPage = () =>
    head({ data: { data: [{ audience: "parents", message: null, schedule: false }, { s: "arr" }] }, memo: { name: "app.filament.pages.send-sms" } }, "Send SMS") +
    `<form wire:submit="send"><label for="data.audience"><span>Recipients</span><sup>*</sup></label><select id="data.audience" wire:model="data.audience"><option value="parents">All parents</option><option value="students">All students</option></select>` +
    `<label for="data.message"><span>Message</span><sup>*</sup></label><textarea id="data.message" wire:model="data.message"></textarea>` +
    `<label for="data.schedule"><span>Send later</span></label><input type="checkbox" id="data.schedule" wire:model="data.schedule">` +
    `<button type="submit">Send SMS</button></form>` +
    tail;
  const settingsPage = () =>
    head({ data: { data: [{ ...state.settings }, { s: "arr" }] }, memo: { name: "app.filament.pages.manage-settings" } }, "Settings") +
    `<form wire:submit="save"><label for="data.site_name"><span>Site name</span></label><input type="text" id="data.site_name" wire:model="data.site_name">` +
    `<label for="data.maintenance"><span>Maintenance mode</span></label><button role="switch" x-data="{ state: $wire.$entangle('data.maintenance') }"></button>` +
    `<button type="submit">Save</button></form>` +
    tail;

  const answer = (snap, effects = {}) => ({ json: { components: [{ snapshot: JSON.stringify(snap), effects }] } });

  // method, path, cookie, body (parsed JSON for POST) -> { status, html } or { json }
  function respond(method, path, cookie, body) {
    if (!cookie || !cookie.includes("session=")) return { status: 302, html: "" };
    if (method === "GET") {
      if (path === "/admin/students") return { status: 200, html: listPage() };
      if (path === "/admin/students/create") return { status: 200, html: studentForm(null, "create") };
      const m = path.match(/^\/admin\/students\/(\d+)\/edit$/);
      if (m) {
        const s = state.students.find((x) => x.id === Number(m[1]));
        return s ? { status: 200, html: studentForm(s, "save") } : { status: 404, html: "" };
      }
      if (path === "/admin/send-sms") return { status: 200, html: smsPage() };
      if (path === "/admin/settings") return { status: 200, html: settingsPage() };
      if (path === "/admin/grades") return { status: 403, html: "Forbidden" };
      return { status: 404, html: "Not found" };
    }
    if (method === "POST" && path === "/livewire/update") {
      const c = body.components[0];
      const snap = JSON.parse(c.snapshot);
      const call = c.calls.at(-1);
      state.calls.push({ name: snap.memo?.name, method: call?.method, updates: c.updates, params: call?.params });
      const name = snap.memo?.name ?? "";
      if (name.endsWith("list-students")) {
        if (call.method === "mountTableAction") return answer({ ...snap, data: { ...snap.data, mountedTableActions: [[call.params[0]], { s: "arr" }], mountedTableActionsData: [[{}], { s: "arr" }], mountedTableActionRecord: call.params[1] } });
        if (call.method === "callMountedTableAction") {
          state.students = state.students.filter((s) => String(s.id) !== String(snap.data.mountedTableActionRecord));
          return answer({ ...snap, data: { ...snap.data, mountedTableActions: [[], { s: "arr" }] } });
        }
        const size = Number(c.updates.tableRecordsPerPage) || 10;
        const page = Number(call.params[0]) || 1;
        const rows = filtered(c.updates.tableSearch || "", c.updates["tableDeferredFilters.grade.value"] || "");
        return answer({ ...snap, data: { ...snap.data, tableRecordsPerPage: size } }, { html: tableHtml(rows.slice((page - 1) * size, page * size), page, size, rows.length) });
      }
      const data = { ...(Array.isArray(snap.data.data) ? snap.data.data[0] : snap.data.data) };
      for (const [k, v] of Object.entries(c.updates)) data[k.replace(/^data\./, "")] = v;
      const errors = {};
      if (name.endsWith("create-student") || name.endsWith("edit-student")) {
        if (!data.name) errors["data.name"] = ["The full name field is required."];
        else if (state.students.some((s) => s.name === data.name && s.id !== snap.data.record)) errors["data.name"] = ["The full name has already been taken."];
        if (!Object.keys(errors).length) {
          if (name.endsWith("create-student")) {
            const id = Math.max(0, ...state.students.map((s) => s.id)) + 1;
            state.students.unshift({ id, name: data.name, grade: data.grade ?? "Grade 1", active: !!data.is_active });
            return answer({ ...snap, memo: { ...snap.memo, errors: [] } }, { redirect: `http://noor.test/admin/students/${id}/edit` });
          }
          const s = state.students.find((x) => x.id === snap.data.record);
          Object.assign(s, { name: data.name, grade: data.grade ?? s.grade, active: !!data.is_active });
        }
      }
      if (name.endsWith("send-sms")) {
        if (!data.message) errors["data.message"] = ["The message field is required."];
        else state.sms.push({ audience: data.audience, message: data.message });
      }
      if (name.endsWith("manage-settings") && !Object.keys(errors).length) state.settings = { site_name: data.site_name, maintenance: !!data.maintenance };
      return answer({ ...snap, data: { ...snap.data, data: [data, { s: "arr" }] }, memo: { ...snap.memo, errors: Object.keys(errors).length ? errors : [] } });
    }
    return { status: 404, html: "" };
  }
  return { state, respond };
}
