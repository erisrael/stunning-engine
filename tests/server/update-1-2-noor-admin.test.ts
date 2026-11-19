// Update 1.2, System improvements 4: Noor's admin pages worked from here. The catalogue groups every page the spec
// names; lists are read live from Noor (search, Noor's filters, pages); records are created, edited and deleted
// through Noor's own forms and table actions; Send SMS and Settings are Noor form pages sent through Livewire;
// Noor's validation comes back per field; access follows the person's Noor tables; every change is audited.
import { closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { saveLegacyCmsConfig, saveUserCmsOverride } from "../../src/server/legacy-cms";
import * as X from "../../src/server/cms-admin";
import { readNoorForm, noorUpdates } from "../../src/lib/cms-forms";
import { smsCount } from "../../src/lib/sms-segments";
import { createNoorAdmin } from "../fixtures/noor-admin-fixture.mjs";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;

const BASE = "https://noor.fixture.test";
type Fake = {
  state: { students: { id: number; name: string; grade: string; active: boolean }[]; sms: { audience: string; message: string }[]; settings: { site_name: string; maintenance: boolean }; calls: { method: string; updates: Record<string, unknown> }[] };
  respond: (method: string, path: string, cookie: string, body: unknown) => { status?: number; html?: string; json?: unknown };
};
// The plain JavaScript fake Noor shared with the browser test.
const noor = createNoorAdmin() as unknown as Fake;
const original = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== BASE) return original(input, init);
  const cookie = String((init?.headers as Record<string, string>)?.Cookie ?? "");
  const r = noor.respond(init?.method ?? "GET", url.pathname, cookie, init?.body ? JSON.parse(String(init.body)) : null);
  return r.json ? Response.json(r.json) : new Response(r.html, { status: r.status, headers: { "Content-Type": "text/html" } });
}) as typeof fetch;

async function main() {
  const [admin, sara, dawit] = [await by("admin@demo.local"), await by("sara@demo.local"), await by("dawit@demo.local")];
  await saveLegacyCmsConfig(admin, { baseUrl: BASE, username: "fixture", password: "fixture", sessionCookie: "session=fixture", autoSync: false });
  await run("DELETE FROM cms_resources");
  // Sara (support) is given Students and Parents in Noor, nothing more.
  await saveUserCmsOverride(admin, { userId: sara.id, allowedTabs: ["students", "parents"] });

  // 1. The catalogue.
  const cat = await X.noorAdminCatalog(admin);
  const slugs = cat.groups.flatMap((g) => g.pages.map((p) => p.slug));
  const spec = ["users", "parents", "students", "grades", "roles", "permissions", "subject-templates", "academic-contents", "academic-quizzes", "flashcards", "national-exams", "feedback", "faqs", "send-sms", "send-push-notification", "settings", "subscription-plans", "subscriptions", "invoices", "mandates", "subscription-histories"];
  check("every page the spec names is in the catalogue", spec.every((s) => slugs.includes(s)), spec.filter((s) => !slugs.includes(s)));
  check("grouped as Noor groups them", cat.groups.map((g) => g.key).join() === "people,access,academics,agents,rewards,engagement,billing", cat.groups.map((g) => g.key));
  check("form pages are told apart from lists", cat.groups.flatMap((g) => g.pages).filter((p) => p.kind === "page").map((p) => p.slug).join() === "send-sms,send-push-notification,settings");
  check("before Noor's menu is read, it says so", cat.menuRead === false && cat.groups[0].pages[0].found === null);
  await run("INSERT INTO cms_resources (slug, label, path, nav_group, known, enabled, noor_total, stored, first_seen, last_seen) VALUES ('learners', 'Students', '/admin/learners', 'People', 0, 1, 77, 0, '2026-11-01', '2026-11-01'), ('coupons', 'Coupons', '/admin/coupons', 'Billing', 0, 1, 4, 0, '2026-11-01', '2026-11-01')");
  const cat2 = await X.noorAdminCatalog(admin);
  const students = cat2.groups.flatMap((g) => g.pages).find((p) => p.slug === "students")!;
  check("Noor's menu decides the real address and count", students.path === "/admin/learners" && students.noorTotal === 77 && students.found === true, students);
  check("a page Noor lacks is marked", cat2.groups.flatMap((g) => g.pages).find((p) => p.slug === "mandates")!.found === false);
  check("pages Noor added later are listed too", cat2.groups.some((g) => g.key === "other" && g.pages.some((p) => p.slug === "coupons")));
  await run("DELETE FROM cms_resources");

  // 2. Access.
  check("someone without Noor access sees nothing", /does not include Noor/.test(await err(() => X.noorAdminCatalog(dawit))));
  const saraCat = await X.noorAdminCatalog(sara);
  const open = (slug: string) => saraCat.groups.flatMap((g) => g.pages).find((p) => p.slug === slug)?.open;
  check("support opens the Noor tables its access includes, not the rest", saraCat.manager === false && open("students") === true && open("users") === false && open("send-sms") === false, { manager: saraCat.manager, students: open("students"), users: open("users") });
  check("and is refused them by address too", /does not include Users/.test(await err(() => X.noorAdminList(sara, "users"))));

  // 3. A list, live.
  const list = await X.noorAdminList(admin, "students");
  if (list.kind !== "list") throw new Error("students is not a list");
  check("a list is read live from Noor", list.total === 30 && list.rows.length === 25 && list.headers.join() === "ID,Name,Grade", { total: list.total, headers: list.headers });
  check("rows carry Noor's record id", list.rows[0].id === "1");
  check("Noor's own filters are offered without the empty choice", list.filters.length === 1 && list.filters[0].label === "Grade" && list.filters[0].options.map((o) => o.value).join() === "Grade 1,Grade 2", list.filters);
  check("create, edit and delete follow what Noor's page offers", list.canCreate && list.canEdit && list.canDelete);
  const q = await X.noorAdminList(admin, "students", { search: "Student 2", filters: { "grade.value": "Grade 2" }, page: 1, pageSize: 25 });
  check("search and filters reach Noor", q.kind === "list" && q.total === 6 && q.rows.every((r) => r.cells.Grade === "Grade 2"), q.kind === "list" ? q.rows.map((r) => r.cells.Name) : q);
  const p2 = await X.noorAdminList(admin, "students", { page: 3, pageSize: 10 });
  check("and pages", p2.kind === "list" && p2.page === 3 && p2.pages === 3 && p2.rows[0].cells.Name === "Student 21");
  check("a filter Noor does not have is refused", /Invalid/.test(await err(() => X.noorAdminList(admin, "students", { filters: { "grade.value": "Grade 9" } }))));
  check("without live access, support cannot open Noor's pages live", /grants live Noor access/.test(await err(() => X.noorAdminList(sara, "students"))));
  // Admin grants Sara live Noor access (Noor protection).
  await (await import("../../src/server/noor-gate")).saveNoorGate(admin, { grants: [sara.id] });
  const saraList = await X.noorAdminList(sara, "students");
  check("support reads it but cannot change it", saraList.kind === "list" && !saraList.canCreate && !saraList.canEdit && !saraList.canDelete);
  check("Noor refusing the app's login is said plainly", /not allowed to open/.test(await err(() => X.noorAdminList(admin, "grades"))));

  // 4. Forms: parsing.
  const createHtml = noor.respond("GET", "/admin/students/create", "session=x", null).html as string;
  const parsed = readNoorForm(createHtml);
  const kinds = Object.fromEntries(parsed.fields.map((f) => [f.name, f.kind]));
  check("Noor's form fields are read with their kinds", JSON.stringify(kinds) === JSON.stringify({ name: "text", grade: "select", bio: "textarea", is_active: "toggle", gender: "select", photo: "file" }), kinds);
  const nameF = parsed.fields.find((f) => f.name === "name")!;
  check("labels, required marks and limits come from Noor", nameF.label === "Full name" && nameF.required && nameF.maxLength === 120);
  check("options of Noor's searchable selects are read", parsed.fields.find((f) => f.name === "gender")!.options.map((o) => o.label).join() === "Female,Male");
  check("the submit method and button are Noor's", parsed.submit === "create" && parsed.submitLabel === "Create");
  check("uploads stay on Noor's page", parsed.fields.find((f) => f.name === "photo")!.editable === false);
  check("a value outside Noor's choices is refused before sending", /from the list/.test(await err(async () => noorUpdates(parsed, { grade: "Grade 9" }))));
  check("an unknown field is refused", /cannot be changed/.test(await err(async () => noorUpdates(parsed, { password: "x" }))));
  check("a form posting delete is never used", /no form/.test(await err(async () => readNoorForm(createHtml.replace('wire:submit="create"', 'wire:submit="delete"')))));

  // 5. Create, edit, delete in Noor.
  const bad = await X.submitNoorAdminForm(admin, "students", { mode: "create" }, { name: "Student 3" });
  check("Noor's validation comes back on the field", !bad.ok && bad.fieldErrors.name?.[0] === "The full name has already been taken.", bad);
  const made = await X.submitNoorAdminForm(admin, "students", { mode: "create" }, { name: "Hana Bekele", grade: "Grade 2", is_active: true, gender: "f" });
  check("a record is created in Noor", made.ok && made.createdId === "31" && noor.state.students[0].name === "Hana Bekele", made);
  const call = noor.state.calls.at(-1)!;
  check("only the form's fields are sent, as Noor's page sends them", call.method === "create" && call.updates["data.name"] === "Hana Bekele" && call.updates["data.is_active"] === true && !("data.photo" in call.updates), call);
  const edit = await X.noorAdminForm(admin, "students", { mode: "edit", id: "31" });
  check("an edit form opens with Noor's current values", edit.form.fields.find((f) => f.name === "name")!.value === "Hana Bekele" && edit.form.submit === "save");
  const saved = await X.submitNoorAdminForm(admin, "students", { mode: "edit", id: "31" }, { name: "Hana B. Bekele" });
  check("and saves in Noor", saved.ok && noor.state.students.find((s) => s.id === 31)?.name === "Hana B. Bekele");
  check("a record id that is not one is refused", /Choose a Noor record/.test(await err(() => X.noorAdminForm(admin, "students", { mode: "edit", id: "../users" }))));
  check("support cannot open the edit form", /Admin/.test(await err(() => X.noorAdminForm(sara, "students", { mode: "edit", id: "31" }))));
  check("nor send it", /Admin/.test(await err(() => X.submitNoorAdminForm(sara, "students", { mode: "edit", id: "31" }, { name: "x" }))));
  await X.deleteNoorAdminRecord(admin, "students", "31");
  check("a record is deleted through Noor's table action", !noor.state.students.some((s: { id: number }) => s.id === 31) && noor.state.calls.at(-2)?.method === "mountTableAction" && noor.state.calls.at(-1)?.method === "callMountedTableAction");
  check("support cannot delete", /Admin/.test(await err(() => X.deleteNoorAdminRecord(sara, "students", "2"))));

  // 6. Form pages.
  const sms = await X.noorAdminList(admin, "send-sms");
  check("Send SMS is recognised as a form page", sms.kind === "page");
  const smsForm = await X.noorAdminForm(admin, "send-sms", { mode: "page" });
  check("its fields are Noor's", smsForm.form.fields.map((f) => `${f.name}:${f.kind}`).join() === "audience:select,message:textarea,schedule:toggle" && smsForm.form.submitLabel === "Send SMS");
  const empty = await X.submitNoorAdminForm(admin, "send-sms", { mode: "page" }, { audience: "students" });
  check("Noor refuses an empty message", !empty.ok && /message field is required/.test(empty.fieldErrors.message?.[0] ?? ""), empty);
  const sent = await X.submitNoorAdminForm(admin, "send-sms", { mode: "page" }, { audience: "students", message: "School opens Monday." });
  check("an SMS is sent through Noor", sent.ok && noor.state.sms.at(-1)?.message === "School opens Monday." && noor.state.sms.at(-1)?.audience === "students");
  const st = await X.noorAdminForm(admin, "settings", { mode: "page" });
  check("Settings opens with Noor's values", st.form.fields.find((f) => f.name === "site_name")!.value === "Noor" && st.form.fields.find((f) => f.name === "maintenance")!.kind === "toggle");
  await X.submitNoorAdminForm(admin, "settings", { mode: "page" }, { maintenance: true });
  check("and saves them in Noor", noor.state.settings.maintenance === true && noor.state.settings.site_name === "Noor");
  check("an unknown page is refused", /no such admin page/.test(await err(() => X.noorAdminList(admin, "secret-page"))));

  // 7. Audit.
  const logs = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('noor.admin.submit', 'noor.admin.delete')"))?.n ?? 0);
  // Created, edited, deleted, the SMS and the settings; refused forms change nothing and are not logged.
  check("every change sent to Noor is audited", logs === 5, logs);

  // 8. SMS parts. SE is the Ethiopic syllable "se", written as an escape so the file stays ASCII.
  const SE = String.fromCharCode(0x1230);
  check("GSM text fits 160 in one part", smsCount("a".repeat(160)).segments === 1 && smsCount("a".repeat(161)).segments === 2);
  check("long GSM text splits at 153", smsCount("a".repeat(306)).segments === 2 && smsCount("a".repeat(307)).segments === 3);
  check("extension characters count twice", smsCount("{".repeat(80)).segments === 1 && smsCount("{".repeat(81)).segments === 2);
  check("Amharic goes as UCS-2: 70, then 67 a part", smsCount(SE.repeat(70)).segments === 1 && smsCount(SE.repeat(71)).encoding === "UCS-2" && smsCount(SE.repeat(135)).segments === 3);

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
    globalThis.fetch = original;
    await closeDb();
  });
