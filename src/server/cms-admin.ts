import { all } from "./db";
import type { AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import type { LegacyCmsCategory } from "@/lib/legacy-cms";
import { allowedCategoriesForUser, authenticateFilament, canManageCmsData, getLegacyCmsConfigForUser, parseFilamentTable } from "./legacy-cms";
import { cmsSession } from "./cms-session";
import { cmsPagination, queryCmsTable, remoteFilters } from "@/lib/cms-livewire";
import { callNoorForm, NoorFormError, readNoorForm, sendNoorForm, unwrap, type NoorForm, type ParsedNoorForm } from "@/lib/cms-forms";

// Noor's admin pages, worked from here (Update 1.2, System improvements 4). Each page is Noor's own: lists are read
// live from Noor (search, filters, pages), records are created, edited and deleted through Noor's own forms and
// table actions, and Noor's pages such as Send SMS, Send Push Notification and Settings are filled in and sent
// through Livewire as Noor's page sends them, so Noor stays the system of record and nothing is copied or mocked.

type Kind = "list" | "page";
type Def = { slug: string; label: string; path: string; kind: Kind; about: string; category?: LegacyCmsCategory; aliases?: string[] };

export const NOOR_ADMIN: { key: string; label: string; pages: Def[] }[] = [
  {
    key: "people",
    label: "People",
    pages: [
      { slug: "users", label: "Users", path: "/admin/users", kind: "list", about: "Noor's sign-in accounts." },
      { slug: "parents", label: "Parents", path: "/admin/parents", kind: "list", about: "Parents and guardians.", category: "parents" },
      { slug: "students", label: "Students", path: "/admin/students", kind: "list", about: "Students, their grade and parent.", category: "students" },
      { slug: "grades", label: "Grades", path: "/admin/grades", kind: "list", about: "The grades students belong to." },
    ],
  },
  {
    key: "access",
    label: "Roles and permissions",
    pages: [
      { slug: "roles", label: "Roles", path: "/admin/shield/roles", kind: "list", about: "Roles and the permissions each one grants.", aliases: ["shield/roles"] },
      { slug: "permissions", label: "Permissions", path: "/admin/permissions", kind: "list", about: "Every permission Noor checks." },
    ],
  },
  {
    key: "academics",
    label: "Academics",
    pages: [
      { slug: "subject-templates", label: "Subject Templates", path: "/admin/subject-templates", kind: "list", about: "Subjects each grade studies." },
      { slug: "academic-contents", label: "Academic Content", path: "/admin/academic-contents", kind: "list", about: "Lessons and learning material.", aliases: ["academic-content"] },
      { slug: "academic-quizzes", label: "Academic Quizzes", path: "/admin/academic-quizzes", kind: "list", about: "Quizzes and their questions.", aliases: ["quizzes"] },
      { slug: "flashcards", label: "Flashcards", path: "/admin/flashcards", kind: "list", about: "Flashcard decks for revision.", aliases: ["flash-cards"] },
      { slug: "national-exams", label: "National Exams", path: "/admin/national-exams", kind: "list", about: "Past national exam papers." },
      { slug: "academic-years", label: "Academic Years", path: "/admin/academic-years", kind: "list", about: "The school years." },
      { slug: "semesters", label: "Semesters", path: "/admin/semesters", kind: "list", about: "The terms of each school year." },
      { slug: "attendances", label: "Attendances", path: "/admin/attendances", kind: "list", about: "Students' attendance." },
      { slug: "disciplines", label: "Disciplines", path: "/admin/disciplines", kind: "list", about: "Discipline records of students." },
      { slug: "grade-reports", label: "Grade Reports", path: "/admin/grade-reports", kind: "list", about: "Students' results per term." },
    ],
  },
  {
    key: "agents",
    label: "Agents and commissions",
    pages: [
      { slug: "agents", label: "Agents", path: "/admin/agents", kind: "list", about: "Sales agents who bring in subscribers." },
      { slug: "commission-rules", label: "Commission Rules", path: "/admin/commission-rules", kind: "list", about: "How much an agent earns per sale." },
      { slug: "agent-commissions", label: "Agent Commissions", path: "/admin/agent-commissions", kind: "list", about: "Commissions earned by agents." },
      { slug: "agent-payouts", label: "Agent Payouts", path: "/admin/agent-payouts", kind: "list", about: "Commissions paid out to agents." },
      { slug: "user-commissions", label: "User Commissions", path: "/admin/user-commissions", kind: "list", about: "Referral commissions earned by users." },
      { slug: "withdrawal-requests", label: "Withdrawal Requests", path: "/admin/withdrawal-requests", kind: "list", about: "Requests to withdraw earned commissions." },
    ],
  },
  {
    key: "rewards",
    label: "Rewards and app content",
    pages: [
      { slug: "badges", label: "Badges", path: "/admin/badges", kind: "list", about: "Badges students earn." },
      { slug: "levels", label: "Levels", path: "/admin/levels", kind: "list", about: "Levels students reach." },
      { slug: "daily-task-definitions", label: "Daily Tasks", path: "/admin/daily-task-definitions", kind: "list", about: "The daily tasks offered in the app.", aliases: ["daily-tasks"] },
      { slug: "certificate-templates", label: "Certificate Templates", path: "/admin/certificate-templates", kind: "list", about: "Designs of the certificates." },
      { slug: "certificates", label: "Certificates", path: "/admin/certificates", kind: "list", about: "Certificates issued to students." },
      { slug: "banners", label: "Banners", path: "/admin/banners", kind: "list", about: "Banners shown in the app." },
    ],
  },
  {
    key: "engagement",
    label: "Feedback and messages",
    pages: [
      { slug: "feedback", label: "Feedback", path: "/admin/feedback", kind: "list", about: "Feedback, bug reports and complaints.", category: "feedback", aliases: ["feedbacks"] },
      { slug: "faqs", label: "FAQs", path: "/admin/faqs", kind: "list", about: "Questions answered in the app.", aliases: ["faq"] },
      { slug: "send-sms", label: "Send SMS", path: "/admin/send-sms", kind: "page", about: "Text parents and students from Noor." },
      { slug: "send-push-notification", label: "Send Push Notification", path: "/admin/send-push-notification", kind: "page", about: "Notify app users from Noor.", aliases: ["send-push-notifications", "push-notifications"] },
      { slug: "settings", label: "Settings", path: "/admin/settings", kind: "page", about: "Noor's own settings.", aliases: ["manage-settings", "general-settings"] },
    ],
  },
  {
    key: "billing",
    label: "Subscriptions and billing",
    pages: [
      { slug: "subscription-plans", label: "Subscription Plans", path: "/admin/subscription-plans", kind: "list", about: "Plans, prices and billing periods.", category: "subscription-plans" },
      { slug: "subscriptions", label: "Subscriptions", path: "/admin/subscriptions", kind: "list", about: "Who is subscribed to what.", category: "subscriptions" },
      { slug: "invoices", label: "Invoices", path: "/admin/invoices", kind: "list", about: "Invoices and their payment slips.", category: "invoices" },
      { slug: "mandates", label: "Mandates", path: "/admin/mandates", kind: "list", about: "Recurring payment mandates." },
      { slug: "subscription-histories", label: "Subscription History", path: "/admin/subscription-histories", kind: "list", about: "Plan changes, renewals and cancellations.", category: "subscription-histories", aliases: ["subscription-history"] },
    ],
  },
];

const ALL = NOOR_ADMIN.flatMap((g) => g.pages);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const SAFE_PATH = /^\/admin(?:\/[a-z0-9_-]+){1,3}$/i;
// Links in Noor's menu that do something when opened instead of showing a page: the language switch
// (/admin/locale/am changes the shared session's language), signing out.
const ACTION_LINK = /^\/admin\/(?:locale|lang|language|logout|log-out|impersonate)(?:\/|$)/i;
const SAFE_ID = /^[\w-]{1,64}$/;

type NavRow = { slug: string; label: string; path: string; nav_group: string | null; noor_total: number | null };
async function navRows() {
  return (await all<NavRow>("SELECT slug, label, path, nav_group, noor_total FROM cms_resources")).filter((n) => !ACTION_LINK.test(n.path));
}
// Noor's menu decides the real path when it was read; the catalogue's path otherwise.
function resolve(def: Def, nav: NavRow[]) {
  const keys = new Set([def.slug, ...(def.aliases ?? [])].map(norm));
  const hit = nav.find((n) => keys.has(norm(n.slug)) || keys.has(norm(n.path.replace(/^\/admin\//, ""))) || norm(n.label) === norm(def.label));
  const path = hit && SAFE_PATH.test(hit.path) ? hit.path : def.path;
  return { path, found: nav.length ? !!hit : null, noorTotal: hit?.noor_total ?? null, stored: hit?.slug ?? def.slug };
}

export async function access(user: AppUser) {
  const cats = new Set<string>((await Promise.all(user.roles.map((r) => allowedCategoriesForUser(r, user.id)))).flat());
  const manager = await canManageCmsData(user);
  if (!cats.size && !manager) throw new WorkflowError("FORBIDDEN", "Your access does not include Noor.");
  return { manager, cats };
}
// Pages tied to a Noor table follow the person's Noor tables; the rest are for the people who manage Noor data.
const mayOpen = (a: { manager: boolean; cats: Set<string> }, def: Def) => a.manager || (!!def.category && a.cats.has(def.category));

async function pageDef(user: AppUser, slug: string) {
  const a = await access(user);
  const nav = await navRows();
  let def = ALL.find((d) => d.slug === slug);
  // Pages Noor's menu lists that the catalogue does not name (added to Noor later) open too, for managers.
  if (!def) {
    const n = nav.find((x) => x.slug === slug && SAFE_PATH.test(x.path));
    if (!n) throw new WorkflowError("NOT_FOUND", "Noor has no such admin page.");
    def = { slug: n.slug, label: n.label, path: n.path, kind: "list", about: "" };
  }
  if (!mayOpen(a, def)) throw new WorkflowError("FORBIDDEN", `Your Noor access does not include ${def.label}.`);
  return { def, ...resolve(def, nav), manager: a.manager };
}

export async function noorAdminCatalog(user: AppUser) {
  const a = await access(user);
  const nav = await navRows();
  const stored = new Map((await all<{ category: string; n: number | string }>("SELECT category, COUNT(*) AS n FROM legacy_cms_records GROUP BY category")).map((r) => [r.category, Number(r.n)]));
  const known = new Set(ALL.flatMap((d) => [d.slug, ...(d.aliases ?? [])].map(norm)));
  const groups = NOOR_ADMIN.map((g) => ({
    key: g.key,
    label: g.label,
    pages: g.pages.map((d) => {
      const r = resolve(d, nav);
      return { slug: d.slug, label: d.label, about: d.about, kind: d.kind, path: r.path, found: r.found, noorTotal: r.noorTotal, stored: stored.get(r.stored) ?? 0, open: mayOpen(a, d) };
    }),
  }));
  const extra = nav.filter((n) => !known.has(norm(n.slug)) && !ALL.some((d) => norm(d.label) === norm(n.label)) && SAFE_PATH.test(n.path));
  if (extra.length && a.manager)
    groups.push({ key: "other", label: "More in Noor's menu", pages: extra.map((n) => ({ slug: n.slug, label: n.label, about: n.nav_group ? `In Noor's ${n.nav_group} menu.` : "In Noor's menu.", kind: "list" as Kind, path: n.path, found: true, noorTotal: n.noor_total, stored: stored.get(n.slug) ?? 0, open: true })) });
  return { groups, manager: a.manager, menuRead: nav.length > 0 };
}

// --- Talking to Noor -----------------------------------------------------------------

async function connection(user: AppUser) {
  const config = await getLegacyCmsConfigForUser(user);
  if (!config.baseUrl) throw new WorkflowError("VALIDATION", "Noor is not connected. Admin connects it under Legacy CMS.");
  return { config, baseUrl: config.baseUrl.replace(/\/+$/, "") };
}

export async function openNoor(user: AppUser, path: string) {
  if (!SAFE_PATH.test(path)) throw new WorkflowError("VALIDATION", "That is not a Noor admin page.");
  const { config, baseUrl } = await connection(user);
  for (let attempt = 0; attempt < 2; attempt++) {
    const cookie = await cmsSession(config, authenticateFilament, attempt > 0);
    const res = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie, Accept: "text/html" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(45_000) });
    if (res.status === 302 || res.status === 401 || res.status === 419) {
      if (attempt) throw new WorkflowError("VALIDATION", "Noor did not accept the sign-in. Reconnect Noor under Legacy CMS.");
      continue;
    }
    if (res.status === 403) throw new WorkflowError("FORBIDDEN", "The Noor login this app uses is not allowed to open this page.");
    if (res.status === 404) throw new WorkflowError("NOT_FOUND", "Noor has no such page.");
    if (!res.ok) throw new WorkflowError("VALIDATION", `Noor could not open the page (HTTP ${res.status}).`);
    return { html: await res.text(), cookie, baseUrl };
  }
  throw new WorkflowError("VALIDATION", "Noor could not be reached.");
}

const hasTable = (html: string) => /wire:snapshot="[^"]*tableRecordsPerPage/.test(html);

export type AdminListQuery = { page?: number; pageSize?: number; search?: string; filters?: Record<string, string>; sort?: { column: string; direction: "asc" | "desc" } | null };

export async function noorAdminList(user: AppUser, slug: string, q: AdminListQuery = {}) {
  const p = await pageDef(user, slug);
  const { html, cookie, baseUrl } = await openNoor(user, p.path);
  if (!hasTable(html)) return { kind: "page" as const, label: p.def.label };
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const pageSize = [10, 25, 50].includes(q.pageSize ?? 0) ? q.pageSize! : 25;
  const filters = Object.fromEntries(Object.entries(q.filters ?? {}).filter(([, v]) => v));
  let queried;
  try {
    queried = await queryCmsTable(html, baseUrl, cookie, { page, pageSize, search: (q.search ?? "").trim().slice(0, 200), filters, sort: q.sort ?? undefined });
  } catch (e) {
    throw new WorkflowError("VALIDATION", e instanceof Error ? e.message : "Noor could not filter this list.");
  }
  const rows = parseFilamentTable(queried.html).map((r) => {
    const id = r._recordId || (r.ID && SAFE_ID.test(r.ID) ? r.ID : "");
    const cells = Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_")));
    return { id, cells };
  });
  const headers = rows.length ? Object.keys(rows[0].cells) : [];
  const { from, to, totalResults } = cmsPagination(queried.html, rows.length, page, queried.pageSize);
  const pathRe = p.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const both = html + queried.html;
  return {
    kind: "list" as const,
    label: p.def.label,
    path: p.path,
    headers,
    rows,
    filters: remoteFilters(html).filter((f) => f.kind !== "date").map((f) => ({ key: f.key, label: f.label.replace(/^\w/, (c) => c.toUpperCase()), options: f.options.filter((o) => o.value !== "") })),
    page,
    pageSize: queried.pageSize,
    from,
    to,
    total: totalResults,
    pages: Math.max(1, Math.ceil(totalResults / queried.pageSize)),
    canCreate: p.manager && new RegExp(`href="[^"]*${pathRe}/create"`).test(both),
    canEdit: p.manager && new RegExp(`href="[^"]*${pathRe}/[\\w-]+/edit"`).test(both),
    canDelete: p.manager && /mountTableAction\(\s*(?:&#0?39;|')delete(?:&#0?39;|')/.test(queried.html),
    stored: p.stored,
  };
}

// tab: a page with tabs (Send SMS: students, parents, typed numbers) opened on that tab first.
export type FormTarget = { mode: "page"; tab?: string | null } | { mode: "create" } | { mode: "edit"; id: string };
function formPath(path: string, t: FormTarget) {
  if (t.mode === "page") return path;
  if (t.mode === "create") return `${path}/create`;
  if (!SAFE_ID.test(t.id)) throw new WorkflowError("VALIDATION", "Choose a Noor record.");
  return `${path}/${t.id}/edit`;
}
const publicForm = (f: NoorForm): NoorForm => ({ title: f.title, submit: f.submit, submitLabel: f.submitLabel, fields: f.fields, ...(f.tabs ? { tabs: f.tabs, tab: f.tab ?? null } : {}) });

// The form of a page, on the tab asked for (switched through the page's own setActiveTab, as Noor's button does).
async function formOn(html: string, cookie: string, baseUrl: string, target: FormTarget): Promise<ParsedNoorForm> {
  const form = readNoorForm(html);
  const tab = target.mode === "page" ? target.tab : null;
  if (!tab || form.tab === tab) return form;
  if (!form.tabs?.some((t) => t.value === tab)) throw new NoorFormError("This Noor page has no such tab.");
  return callNoorForm(baseUrl, cookie, form, "setActiveTab", [tab]);
}

export async function noorAdminForm(user: AppUser, slug: string, target: FormTarget) {
  const p = await pageDef(user, slug);
  if (target.mode !== "page" && !p.manager) throw new WorkflowError("FORBIDDEN", "Creating and editing Noor records is for Admin, or the people Admin allows to manage Noor data.");
  const { html, cookie, baseUrl } = await openNoor(user, formPath(p.path, target));
  try {
    return { label: p.def.label, form: publicForm(await formOn(html, cookie, baseUrl, target)), canSubmit: p.manager };
  } catch (e) {
    if (e instanceof NoorFormError) throw new WorkflowError("VALIDATION", e.message);
    throw e;
  }
}

export async function submitNoorAdminForm(user: AppUser, slug: string, target: FormTarget, values: Record<string, unknown>) {
  const p = await pageDef(user, slug);
  if (!p.manager) throw new WorkflowError("FORBIDDEN", "Sending to Noor is for Admin, or the people Admin allows to manage Noor data.");
  const path = formPath(p.path, target);
  const { html, cookie, baseUrl } = await openNoor(user, path);
  let result;
  try {
    const form = await formOn(html, cookie, baseUrl, target);
    result = await sendNoorForm(baseUrl, cookie, form, values);
  } catch (e) {
    if (e instanceof NoorFormError) return { ok: false as const, error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
  const what = target.mode === "page" ? `sent ${p.def.label}` : target.mode === "create" ? `created a record in ${p.def.label}` : `edited ${p.def.label} record ${target.id}`;
  await audit({ actor: user }, { action: "noor.admin.submit", summary: `In Noor, ${what} (${result.sent.join(", ") || "no fields"})` });
  return { ok: true as const, createdId: result.createdId, sent: result.sent };
}

export async function deleteNoorAdminRecord(user: AppUser, slug: string, id: string) {
  const p = await pageDef(user, slug);
  if (!p.manager) throw new WorkflowError("FORBIDDEN", "Deleting Noor records is for Admin, or the people Admin allows to manage Noor data.");
  if (!SAFE_ID.test(id)) throw new WorkflowError("VALIDATION", "Choose a Noor record.");
  const { html, cookie, baseUrl } = await openNoor(user, p.path);
  const snapRaw = [...html.matchAll(/wire:snapshot="([^"]+)"/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")).find((s) => /tableRecordsPerPage/.test(s));
  const csrf = html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1];
  const uri = html.match(/data-update-uri="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
  if (!snapRaw || !csrf || !uri) throw new WorkflowError("VALIDATION", "This Noor list cannot delete records.");
  const endpoint = new URL(uri, baseUrl);
  if (endpoint.origin !== new URL(baseUrl).origin) throw new WorkflowError("VALIDATION", "Unexpected Noor endpoint.");
  let snapshot = snapRaw;
  const call = async (method: string, params: unknown[]) => {
    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Livewire": "true", "X-CSRF-TOKEN": csrf, Cookie: cookie }, body: JSON.stringify({ _token: csrf, components: [{ snapshot, updates: {}, calls: [{ path: "", method, params }] }] }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (r.status === 403) throw new WorkflowError("FORBIDDEN", "The Noor login this app uses may not delete here.");
    if (!r.ok) throw new WorkflowError("VALIDATION", `Noor did not delete the record (HTTP ${r.status}).`);
    const c = (await r.json())?.components?.[0];
    if (!c?.snapshot) throw new WorkflowError("VALIDATION", "Noor did not confirm the delete.");
    snapshot = c.snapshot;
    return unwrap(JSON.parse(c.snapshot).data) as Record<string, unknown>;
  };
  const mounted = await call("mountTableAction", ["delete", id]);
  if (!JSON.stringify(mounted.mountedTableActions ?? []).includes("delete")) throw new WorkflowError("FORBIDDEN", "Noor does not allow deleting this record.");
  const done = await call("callMountedTableAction", []);
  if (JSON.stringify(done.mountedTableActions ?? []).includes("delete")) throw new WorkflowError("VALIDATION", "Noor kept the delete open; the record was not deleted.");
  await audit({ actor: user }, { action: "noor.admin.delete", summary: `In Noor, deleted ${p.def.label} record ${id}` });
  return { ok: true };
}
