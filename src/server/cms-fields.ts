import { createHash } from "node:crypto";
import { all, get, nowIso, run, tx, uid, type Param } from "./db";
import type { AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { getMeta, setMeta } from "./settings";
import { cmsSession } from "./cms-session";
import { authenticateFilament, canManageCmsData, getLegacyCmsConfig, LEGACY_CMS_CATEGORIES } from "./legacy-cms";
import { CmsTable, type CmsConnection } from "./cms-range";
import { getRun, listRuns, openRun, reviveStaleRuns, runError, runErrors, saveRun, startRun, type SyncRun } from "./sync-runs";
import { remoteFilters, sortableColumns, tableColumnsOf } from "@/lib/cms-livewire";
import { parseCmsDate } from "@/lib/cms-filters";

// Noor, complete (Update 1.2, Phase 3).
//   - Resources: every table Noor's admin navigation offers, not only the seven the app was built with. Admin
//     switches each on or off; nothing is invented, only what Noor's navigation shows is offered.
//   - Fields: each resource's columns (hidden ones too), Noor's filters and sort buttons, and a type inferred from
//     the values seen. Admin may correct the label, the type and whether a field is sensitive; that survives the
//     next discovery.
//   - Mirror: every row of an enabled resource into legacy_cms_records, with hidden columns switched on, page by
//     page through a sync_runs row that keeps its place, so a long table is read across several calls instead of
//     stopping at a silent limit. Rows carry a hash: new, changed and unchanged rows are counted, and rows Noor no
//     longer has are removed when a mirror ends complete.
//   - Incremental: the newest pages (by id) until a page holds nothing new or changed.
//   - Nightly check: Noor's own total ("Showing x to y of z") against the count stored here, per resource.
// Noor is read through its admin pages, so a field its admin never shows cannot be collected.

const HOUR = 3600e3;
const CONCURRENCY = 4;
const addisDay = (t: number) => new Date(t + 3 * HOUR).toISOString().slice(0, 10);

export const CMS_FIELD_TYPES = ["string", "integer", "decimal", "currency", "boolean", "date", "datetime", "enum", "status", "json", "relationship"] as const;
export type CmsFieldType = (typeof CMS_FIELD_TYPES)[number];

// ---------------------------------------------------------------------------
// Reading Noor's navigation and inferring field types (pure, tested on their own)
// ---------------------------------------------------------------------------

export type CmsNavItem = { slug: string; label: string; path: string; group: string | null };
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const plain = (s: string) => decode(s.replace(/<!--[\s\S]*?-->/g, "").replace(/<(svg|style|script)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const NOT_A_RESOURCE = /^(login|logout|register|password-reset|reset-password|email-verification|profile|dashboard|tenant|tenants\/register|livewire|filament|horizon|telescope|pulse|log-viewer)$/i;
const PAGE_WORD = /^(create|edit|view|new)$/i;

// Links to /admin/<resource> (or /admin/<cluster>/<resource>) on Noor's own host, with their sidebar group.
export function parseCmsNavigation(html: string, baseUrl: string): CmsNavItem[] {
  const base = new URL(baseUrl);
  const groups: { at: number; label: string }[] = [];
  for (const m of html.matchAll(/data-group-label="([^"]*)"/g)) groups.push({ at: m.index ?? 0, label: decode(m[1]).trim() });
  for (const m of html.matchAll(/<[a-z]+\b[^>]*class="[^"]*fi-sidebar-group-label[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/g)) groups.push({ at: m.index ?? 0, label: plain(m[1]) });
  groups.sort((a, b) => a.at - b.at);
  const out = new Map<string, CmsNavItem>();
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const href = m[1].match(/\bhref="([^"]+)"/)?.[1];
    if (!href) continue;
    let u: URL;
    try {
      u = new URL(decode(href), base);
    } catch {
      continue;
    }
    if (u.origin !== base.origin) continue;
    const parts = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts[0] !== "admin" || parts.length < 2 || parts.length > 3) continue;
    const rest = parts.slice(1);
    if (rest.some((p) => /^\d+$/.test(p) || PAGE_WORD.test(p)) || !rest.every((p) => /^[a-z0-9][a-z0-9_-]*$/i.test(p))) continue;
    const slug = rest.join("/").toLowerCase();
    if (NOT_A_RESOURCE.test(slug) || NOT_A_RESOURCE.test(rest[0])) continue;
    const labelHtml = m[2].match(/class="[^"]*fi-sidebar-item-label[^"]*"[^>]*>([\s\S]*?)<\//)?.[1] ?? m[2];
    const label = plain(labelHtml) || rest[rest.length - 1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const group = [...groups].reverse().find((g) => g.at < (m.index ?? 0))?.label || null;
    const prev = out.get(slug);
    if (!prev || (!prev.label && label)) out.set(slug, { slug, label: label.slice(0, 120), path: `/${parts.join("/")}`, group });
  }
  return [...out.values()];
}

export type InferredField = { type: CmsFieldType; nullable: boolean; relationship: string | null; options: string[] | null };
const BOOL = new Set(["yes", "no", "true", "false"]);
const MONEY = /^(?:ETB|USD|EUR|Br\.?|Birr|\$)\s?-?[\d,]+(?:\.\d+)?$|^-?[\d,]+(?:\.\d+)?\s?(?:ETB|USD|EUR|Br\.?|Birr)$/i;
const INT = /^-?\d{1,15}$/;
const DEC = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const DATETIME = /\d{1,2}:\d{2}/;

export function inferCmsFieldType(name: string, label: string, values: unknown[]): InferredField {
  const all = values.map((v) => (v == null ? "" : String(v).trim()));
  const vals = all.filter((v) => v !== "" && v !== "-" && v !== "—");
  const nullable = vals.length < all.length;
  const key = `${name} ${label}`.toLowerCase();
  const dotted = name.includes(".") ? name.split(".")[0] : null;
  const relationship = dotted ?? (/_id$/.test(name) && name !== "id" ? name.replace(/_id$/, "") : null);
  const every = (re: RegExp | ((v: string) => boolean)) => vals.length > 0 && vals.every((v) => (typeof re === "function" ? re(v) : re.test(v)));
  const distinct = [...new Set(vals)];
  const done = (type: CmsFieldType, options: string[] | null = null): InferredField => ({ type, nullable, relationship, options });
  if (!vals.length) return done(relationship ? "relationship" : /(_at|date)$/.test(name) ? "datetime" : "string");
  if (every((v) => /^[[{]/.test(v) && (() => { try { JSON.parse(v); return true; } catch { return false; } })())) return done("json");
  if (every((v) => BOOL.has(v.toLowerCase()))) return done("boolean");
  if (every(MONEY) || (/amount|price|total|fee|balance|paid|cost/.test(key) && every(DEC) && !/(^|[ _])(id|count|number|qty|quantity)\b/.test(key))) return done("currency");
  if (relationship && !dotted && every(INT)) return done("relationship");
  if (every(INT)) return done("integer");
  if (every(DEC)) return done("decimal");
  if (every((v) => !!parseCmsDate(v) && /\d{4}|\d{1,2}[/-]\d{1,2}|ago$/i.test(v))) return done(vals.some((v) => DATETIME.test(v)) ? "datetime" : "date");
  if (/status|state/.test(key) && distinct.length <= 15) return done("status", distinct.sort());
  if (distinct.length <= 12 && vals.length >= 8 && distinct.length / vals.length <= 0.5) return done("enum", distinct.sort());
  return done(relationship ? "relationship" : "string");
}
const SENSITIVE = /password|passwd|secret|token|otp|\bpin\b|national[ _-]?id|passport|api[ _-]?key|cvv|card[ _-]?number/i;

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

async function connection(fresh = false): Promise<CmsConnection> {
  const config = await getLegacyCmsConfig();
  if (!config.username && !config.sessionCookie) throw new WorkflowError("VALIDATION", "Connect Noor CMS first (Admin, Noor access).");
  return { base: config.baseUrl.replace(/\/+$/, ""), cookie: await cmsSession(config, authenticateFilament, fresh) };
}
async function noorPage(path: string): Promise<string> {
  for (const fresh of [false, true]) {
    const c = await connection(fresh);
    const res = await fetch(`${c.base}${path}`, { headers: { Cookie: c.cookie, Accept: "text/html" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (res.ok) return res.text();
    if (!fresh && [302, 401, 403, 419].includes(res.status)) continue;
    throw new WorkflowError("INVALID_STATE", `Noor's admin could not be opened (HTTP ${res.status}).`);
  }
  throw new WorkflowError("INVALID_STATE", "Noor did not accept the sign-in. Check the Noor login in Admin, Noor access.");
}
async function needManager(user: AppUser) {
  if (!(await canManageCmsData(user))) throw new WorkflowError("FORBIDDEN", "Noor resources and fields are for Admin, or the people Admin allows to manage Noor data.");
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

type ResRow = { slug: string; label: string; path: string; nav_group: string | null; known: number; enabled: number; noor_total: number | null; stored: number | null; checked_at: string | null; last_mirror_at: string | null; last_error: string | null; first_seen: string; last_seen: string };
export type CmsResource = { slug: string; label: string; path: string; group: string | null; known: boolean; enabled: boolean; noorTotal: number | null; stored: number; checkedAt: string | null; lastMirrorAt: string | null; lastError: string | null; lastSeen: string; fields: number; run: { id: string; kind: string; status: string; discovered: number; cursor: string | null; pages: number | null } | null };

async function ensureKnown() {
  const now = nowIso();
  for (const c of LEGACY_CMS_CATEGORIES)
    await run("INSERT INTO cms_resources (slug, label, path, known, enabled, first_seen, last_seen) VALUES (?, ?, ?, 1, 0, ?, ?) ON CONFLICT (slug) DO NOTHING", c.key, c.label, c.path, now, now);
}
async function resRow(slug: string) {
  const r = await get<ResRow>("SELECT * FROM cms_resources WHERE slug = ?", slug);
  if (!r) throw new WorkflowError("NOT_FOUND", "This Noor resource has not been discovered.");
  return r;
}

export async function discoverCmsResources(user: AppUser) {
  await needManager(user);
  const html = await noorPage("/admin");
  const config = await getLegacyCmsConfig();
  const found = parseCmsNavigation(html, config.baseUrl);
  if (!found.length) throw new WorkflowError("INVALID_STATE", "Noor's admin page showed no resources. Check that the Noor login can see the admin menu.");
  await ensureKnown();
  const now = nowIso();
  const knownPaths = new Map(LEGACY_CMS_CATEGORIES.map((c) => [c.path, c.key]));
  // At the first reading of the menu, the seven tables the app already reads are switched on when Noor shows them;
  // every other resource waits for Admin. Later readings never change what Admin chose.
  const firstTime = !(await getMeta("cmsDiscoveredAt"));
  let added = 0;
  for (const f of found) {
    const slug = knownPaths.get(f.path) ?? f.slug;
    const known = knownPaths.has(f.path) ? 1 : 0;
    const exists = await get("SELECT 1 FROM cms_resources WHERE slug = ?", slug);
    if (!exists) added++;
    await run(
      `INSERT INTO cms_resources (slug, label, path, nav_group, known, enabled, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (slug) DO UPDATE SET label = excluded.label, path = excluded.path, nav_group = excluded.nav_group, last_seen = excluded.last_seen`,
      slug, f.label, f.path, f.group, known, known, now, now,
    );
    if (firstTime && known) await run("UPDATE cms_resources SET enabled = 1 WHERE slug = ?", slug);
  }
  await setMeta("cmsDiscoveredAt", now);
  await audit({ actor: user }, { action: "cms.discover", summary: `${user.name} read Noor's admin menu: ${found.length} resources (${added} new)` });
  return { found: found.length, added, resources: await cmsResources(user) };
}

export async function cmsResources(user: AppUser): Promise<CmsResource[]> {
  await needManager(user);
  await ensureKnown();
  const rows = await all<ResRow & { fields: number | string; stored_now: number | string }>(
    `SELECT r.*, (SELECT COUNT(*) FROM cms_fields f WHERE f.resource = r.slug) AS fields, (SELECT COUNT(*) FROM legacy_cms_records x WHERE x.category = r.slug) AS stored_now
     FROM cms_resources r ORDER BY r.known DESC, r.nav_group, r.label`,
  );
  const runs = await listRuns("noor", rows.map((r) => r.slug), 200);
  return rows.map((r) => {
    const open = runs.find((x) => x.scopeId === r.slug && ["running", "paused", "partial"].includes(x.status));
    return {
      slug: r.slug, label: r.label, path: r.path, group: r.nav_group, known: !!r.known, enabled: !!r.enabled, noorTotal: r.noor_total == null ? null : Number(r.noor_total), stored: Number(r.stored_now),
      checkedAt: r.checked_at, lastMirrorAt: r.last_mirror_at, lastError: r.last_error, lastSeen: r.last_seen, fields: Number(r.fields),
      run: open ? { id: open.id, kind: open.kind, status: open.status, discovered: open.discovered, cursor: open.cursor, pages: Number(open.detail.pages ?? 0) || null } : null,
    };
  });
}

export async function setCmsResourceEnabled(user: AppUser, slug: string, enabled: boolean) {
  await needManager(user);
  const r = await resRow(slug);
  await run("UPDATE cms_resources SET enabled = ? WHERE slug = ?", enabled ? 1 : 0, slug);
  await audit({ actor: user }, { action: "cms.resource", summary: `${user.name} switched Noor resource ${r.label} ${enabled ? "on" : "off"}` });
}

// ---------------------------------------------------------------------------
// Field registry
// ---------------------------------------------------------------------------

type FieldRow = { resource: string; name: string; label: string; label_override: string | null; inferred_type: string; type_override: string | null; filterable: number; searchable: number; sortable: number; exportable: number; nullable: number; relationship: string | null; sensitive: number; hidden_in_noor: number; source: string; options_json: string | null; sample: string | null; position: number; first_seen: string; last_seen: string };
export type CmsField = { name: string; label: string; noorLabel: string; type: CmsFieldType; inferredType: CmsFieldType; typeOverridden: boolean; filterable: boolean; searchable: boolean; sortable: boolean; exportable: boolean; nullable: boolean; relationship: string | null; sensitive: boolean; hiddenInNoor: boolean; source: string; options: string[] | null; sample: string | null; position: number; lastSeen: string; stale: boolean };
const toField = (f: FieldRow, latest: string | null): CmsField => ({
  name: f.name, label: f.label_override || f.label, noorLabel: f.label, type: (f.type_override || f.inferred_type) as CmsFieldType, inferredType: f.inferred_type as CmsFieldType, typeOverridden: !!f.type_override,
  filterable: !!f.filterable, searchable: !!f.searchable, sortable: !!f.sortable, exportable: !!f.exportable, nullable: !!f.nullable, relationship: f.relationship, sensitive: !!f.sensitive, hiddenInNoor: !!f.hidden_in_noor,
  source: f.source, options: f.options_json ? (JSON.parse(f.options_json) as string[]) : null, sample: f.sample, position: f.position, lastSeen: f.last_seen, stale: !!latest && f.last_seen < latest,
});

// The registry as every reader of Noor data uses it (filters, tables, exports in Phase 4).
export async function cmsFieldRegistry(slug: string): Promise<CmsField[]> {
  const rows = await all<FieldRow>("SELECT * FROM cms_fields WHERE resource = ? ORDER BY position, name", slug);
  const latest = rows.reduce<string | null>((m, r) => (!m || r.last_seen > m ? r.last_seen : m), null);
  return rows.map((r) => toField(r, latest));
}
export async function cmsFields(user: AppUser, slug: string) {
  await needManager(user);
  return { resource: (await cmsResources(user)).find((r) => r.slug === slug) ?? null, fields: await cmsFieldRegistry(slug) };
}

const filterFor = (name: string, filters: ReturnType<typeof remoteFilters>) =>
  filters.find((f) => f.key === name || f.key === `${name}.value` || f.key.split(".")[0] === name || (f.kind === "date" && (f.from?.startsWith(`${name}.`) || name.startsWith(f.key))));

// Read the resource's table once (its first page with hidden columns switched on) and refresh its fields.
export async function refreshCmsFields(user: AppUser | null, slug: string) {
  if (user) await needManager(user);
  const r = await resRow(slug);
  const t = await new CmsTable(null, slug, async () => {}, await connection(), r.path).open();
  const html = t.html;
  const columns = tableColumnsOf(html);
  const filters = remoteFilters(html);
  const sortable = sortableColumns(html);
  const show = columns.filter((c) => !c.toggled && c.toggleable).map((c) => c.name);
  const sort = sortable.includes("id") ? { column: "id", direction: "desc" as const } : undefined;
  const first = await t.first({ search: "", filters: {}, show, sort });
  const stored = await all<{ data_json: string }>("SELECT data_json FROM legacy_cms_records WHERE category = ? ORDER BY synced_at DESC LIMIT 400", slug);
  const sample = [...first.records, ...stored.map((x) => JSON.parse(x.data_json) as Record<string, string>)];
  const headers = [...new Set(first.records.flatMap((x) => Object.keys(x)).filter((k) => !k.startsWith("_")))];
  // Filament 4 names its columns in the snapshot; an older table only has the headers it prints.
  const list = columns.length ? columns.map((c) => ({ name: c.name, label: c.label, hidden: !c.toggled })) : headers.map((h) => ({ name: h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), label: h, hidden: false }));
  const now = nowIso();
  const seen = new Set<string>();
  let position = 0;
  const upsert = async (f: { name: string; label: string; hidden: boolean; source: string; values: unknown[]; filter?: ReturnType<typeof filterFor>; sortable: boolean }) => {
    if (!f.name || seen.has(f.name)) return;
    seen.add(f.name);
    const inf = inferCmsFieldType(f.name, f.label, f.values);
    const options = f.filter?.kind === "select" ? f.filter.options.filter((o) => o.value).map((o) => o.label || o.value) : inf.options;
    const type: CmsFieldType = f.filter?.kind === "select" && inf.type === "string" ? (/status|state/i.test(f.name) ? "status" : "enum") : inf.type;
    const firstValue = f.values.map((v) => String(v ?? "").trim()).find(Boolean) ?? null;
    await run(
      `INSERT INTO cms_fields (resource, name, label, inferred_type, filterable, searchable, sortable, exportable, nullable, relationship, sensitive, hidden_in_noor, source, options_json, sample, position, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (resource, name) DO UPDATE SET label = excluded.label, inferred_type = excluded.inferred_type, filterable = excluded.filterable, sortable = excluded.sortable,
         nullable = excluded.nullable, relationship = excluded.relationship, hidden_in_noor = excluded.hidden_in_noor, source = excluded.source, options_json = excluded.options_json,
         sample = CASE WHEN cms_fields.sensitive = 1 THEN NULL ELSE excluded.sample END, position = excluded.position, last_seen = excluded.last_seen`,
      slug, f.name, f.label.slice(0, 200), type, f.filter ? 1 : 0, ["json"].includes(type) ? 0 : 1, f.sortable ? 1 : 0, inf.nullable ? 1 : 0, inf.relationship,
      SENSITIVE.test(`${f.name} ${f.label}`) ? 1 : 0, f.hidden ? 1 : 0, f.source, options?.length ? JSON.stringify(options.slice(0, 100)) : null,
      SENSITIVE.test(`${f.name} ${f.label}`) ? null : firstValue?.slice(0, 200) ?? null, position++, now, now,
    );
  };
  for (const c of list) await upsert({ name: c.name, label: c.label, hidden: c.hidden, source: "column", values: sample.map((x) => x[c.label]), filter: filterFor(c.name, filters), sortable: sortable.includes(c.name) });
  // A filter with no column of its own is still a field (Noor can narrow by it).
  for (const f of filters) {
    const name = f.key.replace(/\.value$/, "");
    if (seen.has(name) || [...seen].some((s) => filterFor(s, [f]))) continue;
    await upsert({ name, label: f.label, hidden: true, source: "filter", values: [], filter: f, sortable: sortable.includes(name) });
  }
  return { fields: seen.size, total: first.total };
}

export async function updateCmsField(user: AppUser, slug: string, name: string, input: { label?: string | null; type?: string | null; sensitive?: boolean; exportable?: boolean; searchable?: boolean }) {
  await needManager(user);
  const f = await get<FieldRow>("SELECT * FROM cms_fields WHERE resource = ? AND name = ?", slug, name);
  if (!f) throw new WorkflowError("NOT_FOUND", "Field not found.");
  if (input.type && !(CMS_FIELD_TYPES as readonly string[]).includes(input.type)) throw new WorkflowError("VALIDATION", "Unknown field type.");
  const label = input.label === undefined ? f.label_override : input.label?.trim() && input.label.trim() !== f.label ? input.label.trim().slice(0, 200) : null;
  const type = input.type === undefined ? f.type_override : input.type && input.type !== f.inferred_type ? input.type : null;
  const sensitive = input.sensitive === undefined ? f.sensitive : input.sensitive ? 1 : 0;
  await run(
    "UPDATE cms_fields SET label_override = ?, type_override = ?, sensitive = ?, exportable = ?, searchable = ?, sample = CASE WHEN ? = 1 THEN NULL ELSE sample END WHERE resource = ? AND name = ?",
    label, type, sensitive, input.exportable === undefined ? f.exportable : input.exportable ? 1 : 0, input.searchable === undefined ? f.searchable : input.searchable ? 1 : 0, sensitive, slug, name,
  );
  await audit({ actor: user }, { action: "cms.field", summary: `${user.name} set Noor field ${slug}.${name}: ${[label && `label "${label}"`, type && `type ${type}`, `sensitive ${sensitive ? "yes" : "no"}`].filter(Boolean).join(", ")}` });
  return cmsFieldRegistry(slug);
}

// ---------------------------------------------------------------------------
// Mirror
// ---------------------------------------------------------------------------

// _date and _iso are worked out here from the row's own values, so they do not make a row "changed".
const hashOf = (r: Record<string, unknown>) => createHash("sha256").update(JSON.stringify(Object.entries(r).filter(([k]) => k !== "_date" && k !== "_iso").sort())).digest("hex").slice(0, 32);

// Every date-like value of a row as an ISO instant (Noor writes "2026-01-11 10:01:00", "Nov 2, 2026 14:50:35 1 week
// ago" and more): the filter engine compares these (cms-query.ts).
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}|^[A-Za-z]{3,9}\.? \d{1,2}, \d{4}|^\d{1,2}[/-]\d{1,2}[/-]\d{4}/;
export function isoValues(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith("_") || typeof v !== "string" || !DATE_LIKE.test(v.trim())) continue;
    const d = parseCmsDate(v);
    if (d && !Number.isNaN(+d)) out[k] = d.toISOString();
  }
  return out;
}
const extIdOf = (r: Record<string, string>) => String(r._recordId || r.id || r.ID || r.Id || "") || `h:${hashOf(r)}`;
const titleOf = (r: Record<string, string>, ext: string) => String(r.name || r.Name || r.title || r.Title || r.student_name || r.Student || r.Parent || ext).slice(0, 300);

type Counts = { discovered: number; inserted: number; updated: number; skipped: number; failed: number };
async function storeRows(slug: string, rows: Record<string, string>[], at: string): Promise<Counts> {
  const c: Counts = { discovered: rows.length, inserted: 0, updated: 0, skipped: 0, failed: 0 };
  const byId = new Map<string, Record<string, string>>();
  for (const r of rows) byId.set(extIdOf(r), { ...r, _iso: isoValues(r) } as unknown as Record<string, string>); // the same record twice on one read (a page shifted) is one row
  const ids = [...byId.keys()];
  c.skipped += rows.length - ids.length;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const known = new Map((await all<{ id: string; external_id: string; row_hash: string | null }>(`SELECT id, external_id, row_hash FROM legacy_cms_records WHERE category = ? AND external_id IN (${chunk.map(() => "?").join(",")})`, slug, ...chunk)).map((x) => [x.external_id, x]));
    const inserts: Param[][] = [];
    await tx(async () => {
      for (const ext of chunk) {
        const r = byId.get(ext)!;
        const h = hashOf(r);
        const k = known.get(ext);
        if (!k) inserts.push([uid(), slug, ext, titleOf(r, ext), JSON.stringify(r), at, h]);
        else if (k.row_hash === h) {
          c.skipped++;
          await run("UPDATE legacy_cms_records SET synced_at = ? WHERE id = ?", at, k.id);
        } else {
          c.updated++;
          await run("UPDATE legacy_cms_records SET title = ?, data_json = ?, synced_at = ?, row_hash = ? WHERE id = ?", titleOf(r, ext), JSON.stringify(r), at, h, k.id);
        }
      }
      if (inserts.length) await run(`INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at, row_hash) VALUES ${inserts.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}`, ...inserts.flat());
    });
    c.inserted += inserts.length;
  }
  return c;
}

async function openTable(slug: string, check: () => Promise<void>) {
  const r = await resRow(slug);
  const t = await new CmsTable(null, slug, check, await connection(), r.path).open();
  const columns = tableColumnsOf(t.html);
  const sortable = sortableColumns(t.html);
  return { r, t, show: columns.filter((c) => !c.toggled && c.toggleable).map((c) => c.name), sortable };
}

export type CmsMirrorResult = { runId: string; status: string; complete: boolean; discovered: number; inserted: number; updated: number; removed: number; noorTotal: number; stored: number; notes: string[] };

// Every row of one resource. Resumes an unfinished run from its next page; stops at the budget and says so.
export async function mirrorCmsResource(user: AppUser | null, slug: string, opts: { budgetMs?: number; restart?: boolean } = {}, progress: (m: string) => Promise<void> = async () => {}): Promise<CmsMirrorResult> {
  if (user) await needManager(user);
  await reviveStaleRuns("noor");
  let open = await openRun("noor", slug, "full");
  if (open && opts.restart) {
    await saveRun(open.id, { status: "failed", error: "Started again from the first page." });
    open = null;
  }
  const runRow: SyncRun = open ?? (await startRun({ source: "noor", scopeId: slug, kind: "full", cursor: "1", by: user?.id ?? null, detail: { attempts: 0 } }));
  const detail: Record<string, any> = { notes: [], ...runRow.detail, attempts: Number(runRow.detail.attempts ?? 0) + 1 };
  await saveRun(runRow.id, { status: "running", error: null, detail });
  const deadline = Date.now() + (opts.budgetMs ?? 4 * 60e3);
  let requests = 0;
  const notes: string[] = detail.notes;
  const note = (s: string) => void (notes.includes(s) || notes.push(s));
  try {
    const { r, t, show, sortable } = await openTable(slug, async () => {});
    // Oldest first by id: rows added while the mirror runs land after the pages already read, so nothing shifts.
    const sort = sortable.includes("id") ? { column: "id", direction: "asc" as const } : undefined;
    if (!sort) note("Noor cannot sort this table by id, so rows added while the mirror runs may move between pages; the nightly check compares totals.");
    const base = { search: "", filters: {}, show, sort };
    const first = await t.first(base);
    let page = Number(runRow.cursor) || 1;
    // A different page size than the run began with: the page numbers no longer line up, start again.
    if (detail.pageSize && detail.pageSize !== t.size) {
      page = 1;
      note("Noor's page size changed during the mirror; it started again from the first page.");
    }
    detail.pageSize = t.size;
    detail.pages = first.pages;
    detail.noorTotal = first.total;
    const at = nowIso();
    if (page === 1) {
      const c = await storeRows(slug, first.records, at);
      await saveRun(runRow.id, { add: c, cursor: "2", detail });
      page = 2;
    }
    let paused = false;
    while (page <= first.pages) {
      if (Date.now() > deadline) {
        paused = true;
        break;
      }
      const batch = Array.from({ length: Math.min(CONCURRENCY, first.pages - page + 1) }, (_, i) => page + i);
      const got = await Promise.all(batch.map((p) => t.page({ ...base, page: p, pageSize: t.size }).then((x) => ({ p, x }), (e: unknown) => ({ p, e }))));
      const rows: Record<string, string>[] = [];
      let failed = 0;
      for (const g of got) {
        if ("e" in g) {
          failed++;
          await runError(runRow.id, `${r.path} page ${g.p}`, null, g.e instanceof Error ? g.e.message : String(g.e));
          continue;
        }
        if (g.p < first.pages && g.x.records.length !== t.size) note(`Page ${g.p} came back with ${g.x.records.length} of ${t.size} rows.`);
        rows.push(...g.x.records);
      }
      // A failed page is not skipped: this call ends and the run waits at that page (each page was already tried
      // with backoff). The next call, or the schedule, tries it again; six calls in a row that fail end the run.
      const okUntil = got.findIndex((g) => "e" in g);
      const c = await storeRows(slug, rows, at);
      page = okUntil === -1 ? page + batch.length : batch[okUntil];
      detail.failuresInARow = okUntil === -1 ? 0 : Number(detail.failuresInARow ?? 0) + 1;
      await saveRun(runRow.id, { add: { ...c, failed }, cursor: String(page), detail });
      await progress(`${r.label}: page ${Math.min(page - 1, first.pages)} of ${first.pages}`);
      if (okUntil !== -1) {
        if (detail.failuresInARow >= 6) throw new Error(`Noor did not answer page ${page} six times in a row.`);
        note(`Noor did not answer page ${page}; the mirror waits there and tries it again.`);
        paused = true;
        break;
      }
    }
    requests = t.requests;
    const after = (await getRun(runRow.id))!;
    let removed = 0;
    let complete = false;
    if (!paused) {
      const seen = await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM legacy_cms_records WHERE category = ? AND synced_at >= ?", slug, runRow.startedAt);
      complete = Number(seen?.n ?? 0) >= first.total;
      // Rows Noor no longer has go only when the whole table was read in this run.
      if (complete) removed = (await run("DELETE FROM legacy_cms_records WHERE category = ? AND synced_at < ?", slug, runRow.startedAt)).changes ?? 0;
      else note(`Noor reports ${first.total.toLocaleString()} rows; ${Number(seen?.n ?? 0).toLocaleString()} were read. Rows were added or removed while the mirror ran; the next mirror reads them.`);
    }
    const stored = Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM legacy_cms_records WHERE category = ?", slug))?.n ?? 0);
    detail.removed = removed;
    const status = paused ? "paused" : complete ? "done" : "partial";
    await saveRun(runRow.id, { add: { requests }, status, detail });
    await run("UPDATE cms_resources SET noor_total = ?, stored = ?, checked_at = ?, last_mirror_at = CASE WHEN ? = 1 THEN ? ELSE last_mirror_at END, last_error = NULL WHERE slug = ?", first.total, stored, nowIso(), paused ? 0 : 1, nowIso(), slug);
    return { runId: runRow.id, status, complete, discovered: after.discovered, inserted: after.inserted, updated: after.updated, removed, noorTotal: first.total, stored, notes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await runError(runRow.id, null, null, msg);
    await saveRun(runRow.id, { status: detail.attempts >= 6 ? "failed" : "paused", error: msg, detail });
    await run("UPDATE cms_resources SET last_error = ? WHERE slug = ?", msg.slice(0, 500), slug);
    throw e;
  }
}

// The newest rows: pages by id, newest first, until a page holds nothing new or changed.
export async function incrementalCmsResource(slug: string, maxPages = 20) {
  const runRow = await startRun({ source: "noor", scopeId: slug, kind: "incremental" });
  try {
    const { t, show, sortable } = await openTable(slug, async () => {});
    if (!sortable.includes("id")) {
      await saveRun(runRow.id, { status: "done", detail: { notes: ["Noor cannot sort this table by id; it is kept current by the full mirror."] } });
      return { runId: runRow.id, pages: 0 };
    }
    const base = { search: "", filters: {}, show, sort: { column: "id", direction: "desc" as const } };
    const at = nowIso();
    let pages = 0;
    let pg = await t.first(base);
    for (let p = 1; ; p++) {
      pages++;
      const c = await storeRows(slug, pg.records, at);
      await saveRun(runRow.id, { add: c, cursor: String(p + 1) });
      if (c.inserted + c.updated === 0 || p >= pg.pages || p >= maxPages) break;
      pg = await t.page({ ...base, page: p + 1, pageSize: t.size });
    }
    await saveRun(runRow.id, { status: "done", add: { requests: t.requests } });
    return { runId: runRow.id, pages };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await runError(runRow.id, null, null, msg);
    await saveRun(runRow.id, { status: "failed", error: msg });
    throw e;
  }
}

export async function startCmsMirror(user: AppUser, slug: string, restart = false) {
  await needManager(user);
  const r = await resRow(slug);
  const out = await mirrorCmsResource(user, slug, { budgetMs: 50_000, restart });
  await audit({ actor: user }, { action: "cms.mirror", summary: `${user.name} mirrored Noor ${r.label}: ${out.status}, ${out.discovered.toLocaleString()} rows read, Noor ${out.noorTotal.toLocaleString()}, stored ${out.stored.toLocaleString()}` });
  return out;
}

// Noor's total against the stored count, for every enabled resource.
export async function checkCmsTotals(user: AppUser | null) {
  if (user) await needManager(user);
  const out: { slug: string; label: string; noorTotal: number | null; stored: number; error: string | null }[] = [];
  for (const r of await all<ResRow>("SELECT * FROM cms_resources WHERE enabled = 1 ORDER BY label")) {
    const stored = Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM legacy_cms_records WHERE category = ?", r.slug))?.n ?? 0);
    try {
      const { t } = await openTable(r.slug, async () => {});
      const first = await t.first({ search: "", filters: {} });
      await run("UPDATE cms_resources SET noor_total = ?, stored = ?, checked_at = ?, last_error = NULL WHERE slug = ?", first.total, stored, nowIso(), r.slug);
      out.push({ slug: r.slug, label: r.label, noorTotal: first.total, stored, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await run("UPDATE cms_resources SET last_error = ?, checked_at = ? WHERE slug = ?", msg.slice(0, 500), nowIso(), r.slug);
      out.push({ slug: r.slug, label: r.label, noorTotal: null, stored, error: msg });
    }
  }
  return out;
}

// The schedule: an unfinished mirror goes on; a resource never mirrored starts; the newest rows every hour; and
// once a night Noor's totals are compared with what is stored, with Admin told of a gap.
export async function scheduledCmsMirror(now = Date.now()) {
  const resources = await all<ResRow>("SELECT * FROM cms_resources WHERE enabled = 1");
  if (!resources.length) return;
  const config = await getLegacyCmsConfig();
  if (!config.username && !config.sessionCookie) return;
  const { acquireLease, releaseLease } = await import("./ops");
  if (!(await acquireLease("noor-mirror", 10 * 60e3))) return;
  try {
    let budget = 90_000;
    for (const r of resources) {
      if (budget <= 5_000) break;
      const started = Date.now();
      try {
        const unfinished = await openRun("noor", r.slug, "full");
        if (unfinished || !r.last_mirror_at) await mirrorCmsResource(null, r.slug, { budgetMs: budget });
        else if ((await getMeta(`noorIncremental:${r.slug}`)) !== String(Math.floor(now / HOUR))) {
          await setMeta(`noorIncremental:${r.slug}`, String(Math.floor(now / HOUR)));
          await incrementalCmsResource(r.slug);
        }
      } catch (e) {
        console.error(`Noor mirror failed for ${r.label}`, e);
      }
      budget -= Date.now() - started;
    }
    const day = addisDay(now);
    if (new Date(now + 3 * HOUR).getUTCHours() >= 2 && (await getMeta("noorTotalsCheck")) !== day) {
      await setMeta("noorTotalsCheck", day);
      const gaps = (await checkCmsTotals(null)).filter((x) => x.noorTotal != null && x.noorTotal !== x.stored);
      if (gaps.length) {
        const { alertAdmins } = await import("./ops");
        await alertAdmins("Noor: stored rows differ from Noor", gaps.map((g) => `${g.label}: Noor ${g.noorTotal}, stored ${g.stored}`).join("; ") + ". The next mirror reads them again.", "/legacy-cms?view=fields", "noor-totals");
        for (const g of gaps) if (!(await openRun("noor", g.slug, "full"))) await startRun({ source: "noor", scopeId: g.slug, kind: "full", cursor: "1", detail: { attempts: 0, reason: "nightly check" } }).then((x) => saveRun(x.id, { status: "paused" }));
      }
    }
  } finally {
    await releaseLease("noor-mirror");
  }
}

export async function cmsRuns(user: AppUser, slug?: string | null) {
  await needManager(user);
  const slugs = slug ? [slug] : (await all<{ slug: string }>("SELECT slug FROM cms_resources")).map((x) => x.slug);
  return listRuns("noor", slugs, 40);
}
export async function cmsRunErrors(user: AppUser, runId: string) {
  await needManager(user);
  const r = await getRun(runId);
  if (!r || r.source !== "noor") throw new WorkflowError("NOT_FOUND", "Run not found.");
  return runErrors(runId, 100);
}

