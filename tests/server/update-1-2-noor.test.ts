// Update 1.2, Phase 3 (Noor complete): resources found in Noor's admin menu, the field registry with inferred types
// and Admin's corrections, a mirror that reads every row across several calls, notices changed and removed rows,
// the incremental read of the newest rows, Noor's totals against the stored count, and the schedule.
import { get, run, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { saveLegacyCmsConfig } from "../../src/server/legacy-cms";
import * as F from "../../src/server/cms-fields";
import { listRuns } from "../../src/server/sync-runs";
import * as Q from "../../src/server/cms-query";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);

// ---- A fake Noor (Filament 4): a menu, a "teachers" table sortable by id with hidden columns, and "coupons"
// that cannot be sorted. ----
const NAV = `<html><body><nav class="fi-sidebar-nav">
  <li class="fi-sidebar-group" data-group-label="People">
    <a href="https://cms.fixture.test/admin/students" class="fi-sidebar-item-button"><svg><path/></svg><span class="fi-sidebar-item-label">Students</span></a>
    <a href="/admin/teachers" class="fi-sidebar-item-button"><span class="fi-sidebar-item-label">Teachers</span></a>
  </li>
  <li class="fi-sidebar-group" data-group-label="Sales">
    <a href="/admin/sales/coupons"><span class="fi-sidebar-item-label">Coupons &amp; codes</span></a>
    <a href="/admin/invoices"><span class="fi-sidebar-item-label">Invoices</span></a>
  </li>
  <a href="/admin">Dashboard</a><a href="/admin/teachers/create">New</a><a href="/admin/teachers/12/edit">Edit</a>
  <a href="/admin/logout">Sign out</a><a href="https://elsewhere.test/admin/users">Other site</a><a href="/admin/profile">Profile</a>
</nav></body></html>`;

type Row = { id: number; name: string; phone: string; salary: string; active: string; status: string; created: string; password_hint: string };
let teachers: Row[] = [];
for (let i = 1; i <= 230; i++)
  teachers.push({ id: i, name: `Teacher ${i}`, phone: `0911${String(100000 + i)}`, salary: `ETB ${(5000 + i * 10).toLocaleString("en-US")}`, active: i % 3 ? "Yes" : "No", status: ["active", "on leave", "left"][i % 3], created: `2026-0${1 + (i % 9)}-1${i % 9} 10:${String(i % 60).padStart(2, "0")}:00`, password_hint: `hint${i}` });
const coupons = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, code: `C${i}`, percent: String(5 + (i % 4) * 5) }));
const COLS = [
  { name: "id", label: "ID", isToggled: true, isToggleable: false },
  { name: "name", label: "Name", isToggled: true, isToggleable: false },
  { name: "phone", label: "Phone", isToggled: false, isToggleable: true },
  { name: "salary", label: "Salary", isToggled: true, isToggleable: false },
  { name: "active", label: "Active", isToggled: true, isToggleable: false },
  { name: "status", label: "Status", isToggled: true, isToggleable: false },
  { name: "created_at", label: "Created at", isToggled: false, isToggleable: true },
  { name: "password_hint", label: "Password hint", isToggled: true, isToggleable: false },
];
const arr = (x: unknown) => [x, { s: "arr" }];
const enc = (s: string) => s.replaceAll('"', "&quot;");
function seed(kind: "teachers" | "coupons") {
  const cols = kind === "teachers" ? COLS : [{ name: "code", label: "Code", isToggled: true, isToggleable: false }, { name: "percent", label: "Percent", isToggled: true, isToggleable: false }];
  const filters = kind === "teachers" ? arr({ status: arr({ value: null }) }) : arr({});
  const snap = JSON.stringify({ memo: { name: kind }, data: { tableRecordsPerPage: 10, tableSort: null, tableDeferredFilters: filters, tableColumns: arr(cols.map((c) => arr({ type: "column", ...c }))) } });
  const sort = kind === "teachers" ? `<button wire:click="sortTable(&#039;id&#039;)">ID</button>` : "";
  const sel = kind === "teachers" ? `<select wire:model="tableDeferredFilters.status.value"><option value="">All</option><option value="active">Active</option><option value="left">Left</option><option value="on leave">On leave</option></select>` : "";
  return `<meta name="csrf-token" content="test"><div wire:snapshot="${enc(snap)}" data-update-uri="/livewire/update">${sort}${sel}</div>`;
}
let posts = 0;
let failPage: number | null = null;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = new URL(String(url));
  if (!init?.method) {
    if (u.pathname.endsWith("/login")) return new Response("<html>signed in</html>", { headers: { "Set-Cookie": "session=fixture" } });
    if (u.pathname === "/admin") return new Response(NAV);
    if (u.pathname === "/admin/teachers") return new Response(seed("teachers"));
    if (u.pathname === "/admin/sales/coupons") return new Response(seed("coupons"));
    return new Response("not found", { status: 404 });
  }
  posts++;
  const c = JSON.parse(String(init.body)).components[0];
  const kind = JSON.parse(c.snapshot).memo.name as "teachers" | "coupons";
  const up = c.updates as Record<string, unknown>;
  const per = Number(up.tableRecordsPerPage) || 10;
  const page = c.calls.find((x: { method: string }) => x.method === "gotoPage").params[0] as number;
  if (failPage === page) return new Response("down", { status: 500 });
  if (kind === "coupons") {
    const slice = coupons.slice((page - 1) * per, page * per);
    const html = `<table><thead><tr><th>Code</th><th>Percent</th></tr></thead><tbody>${slice.map((r) => `<tr wire:key="c${r.id}"><td><a href="/admin/sales/coupons/${r.id}">${r.code}</a></td><td>${r.percent}</td></tr>`).join("")}</tbody></table>Showing ${(page - 1) * per + 1} to ${(page - 1) * per + slice.length} of ${coupons.length} results`;
    return Response.json({ components: [{ snapshot: JSON.stringify({ data: { tableRecordsPerPage: per } }), effects: { html } }] });
  }
  let rows = [...teachers];
  if (up.tableSort === "id:desc") rows.sort((a, b) => b.id - a.id);
  if (up.tableSort === "id:asc") rows.sort((a, b) => a.id - b.id);
  if (up["tableDeferredFilters.status.value"]) rows = rows.filter((r) => r.status === up["tableDeferredFilters.status.value"]);
  const shown = COLS.filter((col, i) => col.isToggled || up[`tableColumns.${i}.isToggled`] === true);
  const slice = rows.slice((page - 1) * per, page * per);
  const cell = (r: Row, name: string) => (name === "created_at" ? r.created : name === "id" ? `<a href="/admin/teachers/${r.id}">${r.id}</a>` : String((r as unknown as Record<string, unknown>)[name]));
  const html = `<table><thead><tr>${shown.map((col) => `<th>${col.label}</th>`).join("")}</tr></thead><tbody>${slice.map((r) => `<tr wire:key="t${r.id}">${shown.map((col) => `<td>${cell(r, col.name)}</td>`).join("")}</tr>`).join("")}</tbody></table>Showing ${slice.length ? (page - 1) * per + 1 : 0} to ${(page - 1) * per + slice.length} of ${rows.length} results`;
  return Response.json({ components: [{ snapshot: JSON.stringify({ data: { tableRecordsPerPage: per } }), effects: { html } }] });
}) as typeof fetch;

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  await saveLegacyCmsConfig(admin, { baseUrl: "https://cms.fixture.test", username: "fixture", password: "fixture", sessionCookie: "session=test", autoSync: false });

  // 1. Reading the menu.
  const nav = F.parseCmsNavigation(NAV, "https://cms.fixture.test");
  check("the menu gives every resource on Noor's own host, with its group", nav.map((n) => n.slug).sort().join() === "invoices,sales/coupons,students,teachers" && nav.find((n) => n.slug === "sales/coupons")?.label === "Coupons & codes" && nav.find((n) => n.slug === "teachers")?.group === "People", nav);
  check("people without Noor data rights cannot see resources", /Admin/.test(await err(() => F.cmsResources(dawit))));
  const d = await F.discoverCmsResources(admin);
  const res = (slug: string) => d.resources.find((r) => r.slug === slug)!;
  check("discovery adds new resources switched off and keeps the seven", d.found === 4 && d.added === 2 && !res("teachers").enabled && !res("teachers").known && res("students").known && res("students").enabled && d.resources.filter((r) => r.known).length === 7, d.resources.map((r) => [r.slug, r.enabled, r.known]));
  check("a known table not in Noor's menu is not switched on", !res("parents").enabled);
  const again = await F.discoverCmsResources(admin);
  check("discovering again adds nothing", again.added === 0 && again.resources.length === d.resources.length);

  // 2. Types.
  const t = (name: string, values: unknown[], label = name) => F.inferCmsFieldType(name, label, values).type;
  check("types are inferred from values", t("amount", ["ETB 1,200.00", "ETB 50"]) === "currency" && t("count", ["1", "2", "30"]) === "integer" && t("rate", ["1.5", "2.25"]) === "decimal" && t("paid", ["Yes", "No"]) === "boolean" && t("created_at", ["2026-01-02 10:00:00"]) === "datetime" && t("birthday", ["2020-01-02"]) === "date" && t("meta", ['{"a":1}']) === "json" && t("parent_id", ["4", "5"]) === "relationship" && t("student.name", ["A"]) === "relationship" && t("status", ["paid", "pending", "paid"]) === "status");
  check("few repeated values make an enum; an empty value makes it nullable", t("grade", ["G1", "G2", "G1", "G2", "G1", "G2", "G1", "G3", "G1", "G2"]) === "enum" && F.inferCmsFieldType("x", "x", ["a", ""]).nullable && t("note", ["anything", "else"]) === "string");

  // 3. Fields of a discovered resource.
  const rf = await F.refreshCmsFields(admin, "teachers");
  let fields = (await F.cmsFields(admin, "teachers")).fields;
  const fld = (n: string) => fields.find((f) => f.name === n)!;
  check("every column is a field, hidden ones too", rf.fields === 8 && rf.total === 230 && fld("phone").hiddenInNoor && fld("created_at").hiddenInNoor && !fld("name").hiddenInNoor, fields.map((f) => f.name));
  check("types and abilities come from Noor", fld("salary").type === "currency" && fld("active").type === "boolean" && fld("created_at").type === "datetime" && fld("id").type === "integer" && fld("status").filterable && fld("status").type === "status" && fld("id").sortable && !fld("name").sortable, fields.map((f) => [f.name, f.type, f.filterable, f.sortable]));
  check("a password-like field is sensitive and keeps no sample", fld("password_hint").sensitive && fld("password_hint").sample === null && fld("name").sample === "Teacher 230", fld("password_hint"));
  fields = await F.updateCmsField(admin, "teachers", "phone", { label: "Mobile", type: "string", sensitive: true });
  fields = await F.updateCmsField(admin, "teachers", "salary", { type: "decimal" });
  await F.refreshCmsFields(admin, "teachers");
  fields = (await F.cmsFields(admin, "teachers")).fields;
  check("Admin's label, type and sensitivity survive reading the fields again", fld("phone").label === "Mobile" && fld("phone").noorLabel === "Phone" && fld("phone").sensitive && fld("salary").type === "decimal" && fld("salary").typeOverridden && fld("salary").inferredType === "currency", [fld("phone"), fld("salary")]);
  check("an unknown type is refused", /Unknown field type/.test(await err(() => F.updateCmsField(admin, "teachers", "name", { type: "colour" }))));

  // 4. The mirror, across calls.
  await F.setCmsResourceEnabled(admin, "teachers", true);
  const m1 = await F.mirrorCmsResource(admin, "teachers", { budgetMs: 0 });
  check("a mirror out of time stops after its first page and keeps its place", m1.status === "paused" && m1.discovered === 100 && !m1.complete, m1);
  posts = 0;
  const m2 = await F.mirrorCmsResource(admin, "teachers");
  check("the next call carries on from that page to the end", m2.status === "done" && m2.complete && m2.stored === 230 && m2.noorTotal === 230 && m2.discovered === 230 && posts <= 4, { m2, posts });
  const one = JSON.parse((await get<{ data_json: string }>("SELECT data_json FROM legacy_cms_records WHERE category = 'teachers' AND external_id = '17'"))!.data_json);
  check("hidden columns are stored with each row", one.Phone === "0911100017" && one["Created at"].startsWith("2026-"), one);
  teachers[3] = { ...teachers[3], status: "left" }; // id 4 was "on leave"
  teachers = teachers.filter((r) => r.id !== 9);
  const m3 = await F.mirrorCmsResource(admin, "teachers");
  check("a mirror counts changed rows, skips unchanged ones and removes rows Noor no longer has", m3.complete && m3.updated === 1 && m3.inserted === 0 && m3.removed === 1 && m3.stored === 229, m3);
  failPage = 2;
  const failed = await err(() => F.mirrorCmsResource(admin, "teachers", { restart: true }));
  const runs = await listRuns("noor", ["teachers"]);
  const broken = runs.find((r) => r.kind === "full" && r.status === "paused");
  check("a page that fails is not skipped: the run waits at it and logs the request", !failed && !!broken && broken.cursor === "2" && broken.failed > 0, { failed, runs: runs.map((r) => [r.kind, r.status, r.cursor, r.failed]) });
  // Each later call tries the failed page again and waits there while it still fails.
  const waits = [];
  for (let i = 0; i < 2; i++) waits.push(await F.mirrorCmsResource(admin, "teachers"));
  failPage = null;
  check("while the page still fails each call waits at it without ending the run", waits.every((w) => w.status === "paused" && w.notes.some((n) => /page 2/.test(n))), waits);
  const m4 = await F.mirrorCmsResource(admin, "teachers");
  check("once Noor answers again the run finishes from where it waited", m4.status === "done" && m4.complete && m4.stored === 229, m4);

  // 5. Incremental: new rows at the top are found without reading the table again.
  for (let i = 231; i <= 236; i++) teachers.push({ ...teachers[0], id: i, name: `Teacher ${i}` });
  posts = 0;
  const inc = await F.incrementalCmsResource("teachers");
  const stored = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM legacy_cms_records WHERE category = 'teachers'"))!.n);
  check("the incremental read stores the newest rows and stops at the first page with nothing new", inc.pages === 2 && stored === 235 && posts <= 3, { inc, stored, posts });
  await F.setCmsResourceEnabled(admin, "sales/coupons", true);
  const incC = await F.incrementalCmsResource("sales/coupons");
  check("a table Noor cannot sort by id is left to the full mirror", incC.pages === 0);
  const mc = await F.mirrorCmsResource(admin, "sales/coupons");
  check("a resource in a cluster (/admin/sales/coupons) is mirrored too", mc.complete && mc.stored === 30 && mc.notes.some((n) => /sort/.test(n)), mc);

  // 6. Totals.
  for (let i = 237; i <= 240; i++) teachers.push({ ...teachers[0], id: i, name: `Teacher ${i}` });
  // Two rows lost here (on the oldest page, where the incremental read does not look).
  await run("DELETE FROM legacy_cms_records WHERE category = 'teachers' AND external_id IN ('5', '6')");
  const totals = await F.checkCmsTotals(admin);
  const tt = totals.find((x) => x.slug === "teachers")!;
  check("Noor's total is compared with the stored count per resource", tt.noorTotal === 239 && tt.stored === 233 && totals.find((x) => x.slug === "sales/coupons")!.noorTotal === 30, totals);

  // 7. The schedule: the nightly check opens a mirror for a gap and Admin is told; the next tick reads it.
  await run("DELETE FROM settings WHERE key = 'meta.noorTotalsCheck' OR key LIKE 'meta.noorIncremental:%'").catch(() => null);
  const night = Date.parse("2026-11-18T00:30:00Z"); // 03:30 in Addis
  await F.scheduledCmsMirror(night);
  const alert = await get<{ title: string }>("SELECT title FROM notifications WHERE title LIKE 'Noor:%' LIMIT 1");
  await F.scheduledCmsMirror(night + 60e3);
  const after = (await F.cmsResources(admin)).find((r) => r.slug === "teachers")!;
  check("the schedule brings the stored rows level with Noor", after.stored === 239 && !after.run, after);
  check("Admin is told of a gap", !!alert, alert);
  const resRuns = await F.cmsRuns(admin, "teachers");
  check("every Noor run is in the run log", resRuns.some((r) => r.kind === "incremental") && resRuns.filter((r) => r.kind === "full").length >= 3);

  // 8. Filtering the mirror (Phase 4): answered by the database for every stored row.
  const T = "teachers";
  const money = (r: Row) => Number(r.salary.replace(/[^0-9.-]/g, ""));
  const q = (filter: Q.CmsQueryFilter, extra: Partial<Parameters<typeof Q.queryCmsRecords>[1]> = {}) => Q.queryCmsRecords(admin, { resource: T, filter, ...extra });
  const all0 = await q({ join: "and", items: [] });
  check("with no filter every stored row is counted and paged", all0.total === teachers.length && all0.rows.length === 50 && all0.pages === Math.ceil(teachers.length / 50), { total: all0.total });
  const left = await q({ join: "and", items: [{ field: "status", op: "in", value: ["left"] }] });
  check("a status filter counts every match", left.total === teachers.filter((r) => r.status === "left").length && left.rows.every((r) => r.values.status === "left"), left.total);
  const either = await q({ join: "or", items: [{ field: "status", op: "eq", value: "active" }, { field: "salary", op: "gt", value: 7000 }] });
  check("OR joins conditions", either.total === teachers.filter((r) => r.status === "active" || money(r) > 7000).length, either.total);
  const nested = await q({ join: "and", items: [{ field: "active", op: "is_true" }, { join: "or", items: [{ field: "salary", op: "between", value: 6000, value2: 6500 }, { field: "name", op: "ends", value: "7" }] }] });
  check("groups nest, with numbers read from money text and yes/no values", nested.total === teachers.filter((r) => r.active === "Yes" && ((money(r) >= 6000 && money(r) <= 6500) || r.name.endsWith("7"))).length, nested.total);
  const march = await q({ join: "and", items: [{ field: "created_at", op: "between", value: "2026-03-01", value2: "2026-03-31" }] });
  check("a date range on a hidden column", march.total === teachers.filter((r) => r.created.startsWith("2026-03")).length && march.total > 0, march.total);
  const sorted = await q({ join: "and", items: [] }, { sort: { field: "salary", dir: "desc" }, pageSize: 10 });
  check("sorting by a number column uses its value, not its text", Number(sorted.rows[0].values.salary.replace(/[^0-9.]/g, "")) === Math.max(...teachers.map(money)), sorted.rows[0].values);
  const found = await q({ join: "and", items: [] }, { search: "Teacher 17" });
  check("search looks in the visible columns", found.total >= 1 && found.rows.some((r) => r.values.name === "Teacher 17"));
  check("a field that is not registered is refused", /not a field/.test(await err(() => q({ join: "and", items: [{ field: "name') OR 1=1 --", op: "eq", value: "x" }] }))));
  check("an operator the field's type does not allow is refused", /cannot be used/.test(await err(() => q({ join: "and", items: [{ field: "salary", op: "starts", value: "1" }] }))));
  const quoted = await q({ join: "and", items: [{ field: "name", op: "contains", value: "'; DROP TABLE legacy_cms_records; --" }] });
  check("a value is a parameter, never SQL", quoted.total === 0 && Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM legacy_cms_records"))!.n) > 0);
  check("the quick filters find their fields", all0.quick.status === "status" && all0.quick.amount === "salary" && all0.quick.created === "created_at", all0.quick);
  check("a resource outside Noor access is refused", /open to Admin/.test(await err(() => Q.queryCmsRecords(dawit, { resource: T, filter: { join: "and", items: [] } }))));
  const exp = await Q.exportCmsRecords(admin, { resource: T, filter: { join: "and", items: [{ field: "status", op: "in", value: ["left"] }] }, columns: { order: ["name", "id"], hidden: ["password_hint"], widths: {}, pinned: [] } });
  const lines = exp.csv.trim().split("\r\n");
  check("export gives every matching row, in the chosen column order, without hidden columns", exp.rows === left.total && lines.length === left.total + 1 && lines[0].replace("\uFEFF", "").startsWith("Name,ID") && !lines[0].includes("Password"), lines[0]);
  const views = await Q.saveCmsView(admin, T, { name: "Leavers", view: { filter: { join: "and", items: [{ field: "status", op: "in", value: ["left"] }] }, sort: { field: "name", dir: "asc" } } });
  check("a view is saved and listed", views.length === 1 && views[0].view.sort?.field === "name");
  check("a view that cannot run is refused when saved", /not a field/.test(await err(() => Q.saveCmsView(admin, T, { name: "Bad", view: { filter: { join: "and", items: [{ field: "nope", op: "eq", value: "1" }] } } }))));
  check("a view is removed", (await Q.deleteCmsView(admin, T, views[0].id)).length === 0);
  // A student row stored without dates normalised, mentioning a teacher.
  await run("INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES ('s-1', 'students', '9001', 'Abel', ?, ?)", JSON.stringify({ Name: "Abel", Teacher: "Teacher 17", Joined: "2026-02-03 09:00:00" }), new Date().toISOString());
  const det = await Q.cmsRecordDetail(admin, T, "17");
  check("a record shows every field and the records that mention it", det.fields.find((f) => f.name === "name")?.value === "Teacher 17" && det.related.some((r) => r.resource === "students" && r.records.some((x) => x.title === "Abel")), det.related);
  await Q.queryCmsRecords(admin, { resource: "students", filter: { join: "and", items: [] } });
  const iso = JSON.parse((await get<{ data_json: string }>("SELECT data_json FROM legacy_cms_records WHERE id = 's-1'"))!.data_json)._iso;
  check("rows stored before dates were normalised get them when first queried", iso?.Joined === "2026-02-03T06:00:00.000Z", iso);

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FAIL crashed", e);
  process.exit(1);
});
