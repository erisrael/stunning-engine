import { all, get, nowIso, run, uid, type Param } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { allowedCategoriesForUser, canManageCmsData, LEGACY_CMS_CATEGORIES } from "./legacy-cms";
import { cmsFieldRegistry, isoValues, type CmsField } from "./cms-fields";
import { CMS_QUICK, cmsOpsFor, isGroup, type CmsCond, type CmsGroup, type CmsQuickKey, type CmsRecordsView } from "@/lib/cms-query";
import { datePresetRange, isDatePreset, rangeInstants } from "@/lib/date-presets";

// Noor records from the mirror (Update 1.2, Phase 4): filters, sorting, paging, totals and export are answered by
// the database for every stored row, not for the rows on screen. A condition may only name a field of the
// resource's registry (cms_fields) with an operator its type allows; every value goes in as a parameter, never as
// SQL. Sensitive fields are left out for people who may not manage Noor data.

const MAX_DEPTH = 4;
const MAX_CONDS = 60;
const EXPORT_LIMIT = 200_000;

// Who may read a resource: the seven tables by Noor access (roles and personal overrides), anything else found
// in Noor's menu only by those who manage Noor data.
async function access(user: AppUser, resource: string) {
  const manager = await canManageCmsData(user);
  const known = LEGACY_CMS_CATEGORIES.some((c) => c.key === resource);
  if (known) {
    const allowed = new Set((await Promise.all(user.roles.map((r) => allowedCategoriesForUser(r, user.id)))).flat());
    if (!allowed.has(resource as never) && !manager) throw new WorkflowError("FORBIDDEN", "This Noor table is not open to you.");
  } else if (!manager) throw new WorkflowError("FORBIDDEN", "This Noor resource is open to Admin and the people who manage Noor data.");
  if (!(await get("SELECT 1 FROM cms_resources WHERE slug = ?", resource)) && !known) throw new WorkflowError("NOT_FOUND", "Unknown Noor resource.");
  const all = await cmsFieldRegistry(resource);
  // Only columns are in the stored rows; a filter-only field cannot be read here.
  const fields = all.filter((f) => f.source === "column" && (manager || !f.sensitive || can(user, "cms.sensitive")));
  return { manager, fields };
}

// Rows stored before dates were normalised get their _iso once, when their resource is first queried.
async function ensureIso(resource: string) {
  for (let n = 0; n < 200; n++) {
    const rows = await all<{ id: string; data_json: string }>("SELECT id, data_json FROM legacy_cms_records WHERE category = ? AND data_json NOT LIKE '%\"_iso\":%' LIMIT 500", resource);
    if (!rows.length) return;
    for (const r of rows) {
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(r.data_json);
      } catch {
        d = {};
      }
      d._iso = isoValues(d);
      await run("UPDATE legacy_cms_records SET data_json = ? WHERE id = ?", JSON.stringify(d), r.id);
    }
  }
}

// ---------------------------------------------------------------------------
// SQL from conditions
// ---------------------------------------------------------------------------

type Sql = { sql: string; params: Param[] };
const NUM_CLEAN = "regexp_replace(COALESCE(x.d ->> ?, ''), '[^0-9.-]', '', 'g')";
const expr = {
  text: (k: string): Sql => ({ sql: "COALESCE(x.d ->> ?, '')", params: [k] }),
  num: (k: string): Sql => ({ sql: `(CASE WHEN ${NUM_CLEAN} ~ '^-?[0-9]+([.][0-9]+)?$' THEN ${NUM_CLEAN}::numeric END)`, params: [k, k] }),
  date: (k: string): Sql => ({ sql: "(x.d -> '_iso' ->> ?)", params: [k] }),
};
const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const isNum = (v: unknown) => v !== null && v !== "" && Number.isFinite(Number(v));
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function condSql(c: CmsCond, fields: Map<string, CmsField>): Sql {
  const f = fields.get(c.field);
  if (!f) throw new WorkflowError("VALIDATION", `"${c.field}" is not a field of this resource.`);
  if (!cmsOpsFor(f.type).includes(c.op)) throw new WorkflowError("VALIDATION", `"${c.op}" cannot be used on ${f.label}.`);
  const k = f.noorLabel;
  const t = expr.text(k);
  const v = c.value;
  const str = () => {
    if (v == null || Array.isArray(v) || String(v).trim() === "") throw new WorkflowError("VALIDATION", `Enter a value for ${f.label}.`);
    return String(v).trim().slice(0, 500);
  };
  const list = () => {
    const xs = (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 100);
    if (!xs.length) throw new WorkflowError("VALIDATION", `Choose at least one value for ${f.label}.`);
    return xs;
  };
  const numeric = () => {
    if (!isNum(v)) throw new WorkflowError("VALIDATION", `${f.label} needs a number.`);
    return Number(v);
  };
  if (c.op === "empty") return { sql: `TRIM(${t.sql}) IN ('', '-')`, params: t.params };
  if (c.op === "not_empty") return { sql: `TRIM(${t.sql}) NOT IN ('', '-')`, params: t.params };
  if (["integer", "decimal", "currency"].includes(f.type)) {
    const n = expr.num(k);
    const cmp = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[c.op as "eq"];
    if (cmp) return { sql: `${n.sql} ${cmp} ?`, params: [...n.params, numeric()] };
    if (c.op === "between") {
      if (!isNum(c.value) || !isNum(c.value2)) throw new WorkflowError("VALIDATION", `${f.label} needs two numbers.`);
      const [a, b] = [Number(c.value), Number(c.value2)].sort((p, q) => p - q);
      return { sql: `${n.sql} BETWEEN ? AND ?`, params: [...n.params, a, b] };
    }
  }
  if (["date", "datetime"].includes(f.type)) {
    const d = expr.date(k);
    let from: string | null = null;
    let until: string | null = null;
    if (c.op === "preset") {
      if (!isDatePreset(v)) throw new WorkflowError("VALIDATION", `Choose a date range for ${f.label}.`);
      ({ from, until } = datePresetRange(v, c.value2 == null ? null : String(c.value2).split("..")[0], c.value2 == null ? null : String(c.value2).split("..")[1]));
      if (v === "all") return { sql: "TRUE", params: [] };
    } else if (c.op === "between") {
      if (!isDay(v) || !isDay(c.value2)) throw new WorkflowError("VALIDATION", `${f.label} needs a start and an end day.`);
      [from, until] = [v, c.value2].sort();
    } else if (c.op === "on") {
      if (!isDay(v)) throw new WorkflowError("VALIDATION", `${f.label} needs a day.`);
      from = until = v;
    } else if (c.op === "before" || c.op === "after") {
      if (!isDay(v)) throw new WorkflowError("VALIDATION", `${f.label} needs a day.`);
      const { start, end } = rangeInstants(v, v);
      return c.op === "before" ? { sql: `${d.sql} < ?`, params: [...d.params, start!] } : { sql: `${d.sql} >= ?`, params: [...d.params, end!] };
    }
    const { start, end } = rangeInstants(from, until);
    const parts: Sql[] = [];
    if (start) parts.push({ sql: `${d.sql} >= ?`, params: [...d.params, start] });
    if (end) parts.push({ sql: `${d.sql} < ?`, params: [...d.params, end] });
    if (!parts.length) return { sql: `${d.sql} IS NOT NULL`, params: d.params };
    return { sql: parts.map((p) => p.sql).join(" AND "), params: parts.flatMap((p) => p.params) };
  }
  if (c.op === "is_true") return { sql: `LOWER(TRIM(${t.sql})) IN ('yes', 'true', '1', 'active', 'y')`, params: t.params };
  if (c.op === "is_false") return { sql: `LOWER(TRIM(${t.sql})) IN ('no', 'false', '0', 'inactive', 'n')`, params: t.params };
  switch (c.op) {
    case "contains":
      return { sql: `${t.sql} ILIKE ?`, params: [...t.params, `%${like(str())}%`] };
    case "not_contains":
      return { sql: `${t.sql} NOT ILIKE ?`, params: [...t.params, `%${like(str())}%`] };
    case "starts":
      return { sql: `${t.sql} ILIKE ?`, params: [...t.params, `${like(str())}%`] };
    case "ends":
      return { sql: `${t.sql} ILIKE ?`, params: [...t.params, `%${like(str())}`] };
    case "eq":
      return { sql: `LOWER(TRIM(${t.sql})) = ?`, params: [...t.params, str().toLowerCase()] };
    case "neq":
      return { sql: `LOWER(TRIM(${t.sql})) <> ?`, params: [...t.params, str().toLowerCase()] };
    case "in":
    case "not_in": {
      const xs = list();
      return { sql: `LOWER(TRIM(${t.sql})) ${c.op === "in" ? "IN" : "NOT IN"} (${xs.map(() => "?").join(", ")})`, params: [...t.params, ...xs] };
    }
  }
  throw new WorkflowError("VALIDATION", `"${c.op}" cannot be used on ${f.label}.`);
}

export function groupSql(g: CmsGroup, fields: Map<string, CmsField>, depth = 0, count = { n: 0 }): Sql {
  if (depth > MAX_DEPTH) throw new WorkflowError("VALIDATION", "Filters can be nested four groups deep.");
  if (g.join !== "and" && g.join !== "or") throw new WorkflowError("VALIDATION", "A group joins with AND or OR.");
  const parts: Sql[] = [];
  for (const item of g.items ?? []) {
    if (++count.n > MAX_CONDS) throw new WorkflowError("VALIDATION", `Use at most ${MAX_CONDS} conditions.`);
    const p = isGroup(item) ? groupSql(item, fields, depth + 1, count) : condSql(item, fields);
    if (p.sql) parts.push(p);
  }
  if (!parts.length) return { sql: "", params: [] };
  return { sql: `(${parts.map((p) => `(${p.sql})`).join(g.join === "and" ? " AND " : " OR ")})`, params: parts.flatMap((p) => p.params) };
}

// The spec's fixed filters, matched to the resource's fields by name and type.
export function quickFields(fields: CmsField[]): Partial<Record<CmsQuickKey, string>> {
  const by = (re: RegExp, types?: string[]) => fields.find((f) => re.test(`${f.name} ${f.noorLabel}`.toLowerCase()) && (!types || types.includes(f.type)))?.name;
  const out: Partial<Record<CmsQuickKey, string>> = {
    status: by(/status|state/, ["status", "enum", "string"]),
    entity: by(/\b(type|kind|entity|category)\b|_type\b/),
    method: by(/method|channel|gateway|bank/),
    currency: by(/currency/),
    amount: fields.find((f) => f.type === "currency")?.name ?? by(/amount|total|price|paid|salary|fee|cost|balance/, ["integer", "decimal", "currency"]),
    created: by(/created|submitted|registered|joined/, ["date", "datetime"]) ?? fields.find((f) => f.type === "datetime" || f.type === "date")?.name,
    updated: by(/updated|modified/, ["date", "datetime"]),
    customer: by(/customer|student|parent|client|subscriber/),
    user: by(/\buser|agent|staff|admin|_by\b|\bby\b/),
    organization: by(/organi[sz]ation|school|company|institution/),
    department: by(/department|team|division/),
    related: fields.find((f) => f.type === "relationship")?.name,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Partial<Record<CmsQuickKey, string>>;
}

function orderSql(sort: CmsRecordsView["sort"], fields: Map<string, CmsField>): Sql {
  const fallback = "(CASE WHEN x.external_id ~ '^[0-9]+$' THEN x.external_id::numeric END) DESC NULLS LAST, x.id";
  if (!sort) return { sql: fallback, params: [] };
  const f = fields.get(sort.field);
  if (!f) throw new WorkflowError("VALIDATION", "That column cannot be sorted.");
  const dir = sort.dir === "asc" ? "ASC" : "DESC";
  const e = ["integer", "decimal", "currency"].includes(f.type) ? expr.num(f.noorLabel) : ["date", "datetime"].includes(f.type) ? expr.date(f.noorLabel) : { sql: `LOWER(${expr.text(f.noorLabel).sql})`, params: [f.noorLabel] };
  return { sql: `${e.sql} ${dir} NULLS LAST, ${fallback}`, params: e.params };
}

type QueryInput = CmsRecordsView & { resource: string; page?: number; pageSize?: number };

async function build(user: AppUser, input: QueryInput) {
  const { manager, fields } = await access(user, input.resource);
  await ensureIso(input.resource);
  const map = new Map(fields.map((f) => [f.name, f]));
  const where: Sql[] = [];
  const g = groupSql(input.filter ?? { join: "and", items: [] }, map);
  if (g.sql) where.push(g);
  const q = (input.search ?? "").trim().slice(0, 200);
  if (q) {
    const cols = fields.filter((f) => f.searchable);
    where.push({ sql: `(x.title ILIKE ? OR x.external_id = ?${cols.map(() => ` OR ${expr.text("").sql} ILIKE ?`).join("")})`, params: [`%${like(q)}%`, q, ...cols.flatMap((f) => [f.noorLabel, `%${like(q)}%`])] });
  }
  const from = "FROM (SELECT id, external_id, title, synced_at, data_json::jsonb AS d FROM legacy_cms_records WHERE category = ?) x";
  const w = where.length ? ` WHERE ${where.map((p) => p.sql).join(" AND ")}` : "";
  return { manager, fields, map, from, where: w, params: [input.resource, ...where.flatMap((p) => p.params)] as Param[] };
}

const valuesOf = (d: Record<string, unknown>, fields: CmsField[]) => Object.fromEntries(fields.map((f) => [f.name, d[f.noorLabel] == null ? "" : String(d[f.noorLabel])]));

export async function queryCmsRecords(user: AppUser, input: QueryInput) {
  const b = await build(user, input);
  const pageSize = Math.min(200, Math.max(10, Math.round(input.pageSize ?? 50)));
  const total = Number((await get<{ n: number | string }>(`SELECT COUNT(*) AS n ${b.from}${b.where}`, ...b.params))?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Math.round(input.page ?? 1)));
  const o = orderSql(input.sort ?? null, b.map);
  const rows = await all<{ id: string; external_id: string | null; title: string | null; synced_at: string; d: unknown }>(
    `SELECT x.id, x.external_id, x.title, x.synced_at, x.d ${b.from}${b.where} ORDER BY ${o.sql} LIMIT ? OFFSET ?`,
    ...b.params, ...o.params, pageSize, (page - 1) * pageSize,
  );
  const last = await get<{ at: string | null }>("SELECT MAX(synced_at) AS at FROM legacy_cms_records WHERE category = ?", input.resource);
  return {
    resource: input.resource,
    fields: b.fields,
    quick: quickFields(b.fields),
    rows: rows.map((r) => ({ id: r.id, externalId: r.external_id, title: r.title, values: valuesOf((typeof r.d === "string" ? JSON.parse(r.d) : r.d) as Record<string, unknown>, b.fields) })),
    total, page, pages, pageSize, storedAt: last?.at ?? null,
  };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  // A cell that a spreadsheet would run as a formula is written as text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export async function exportCmsRecords(user: AppUser, input: QueryInput & { columns?: { order: string[]; hidden: string[]; widths: Record<string, number>; pinned: string[] } }) {
  const { canManageCmsData } = await import("./legacy-cms");
  if (!(await canManageCmsData(user)) && !can(user, "cms.export") && !can(user, "export.run")) throw new WorkflowError("FORBIDDEN", "Exporting Noor records needs the Noor export permission.");
  const b = await build(user, input);
  const hidden = new Set(input.columns?.hidden ?? []);
  const order = input.columns?.order ?? [];
  const cols = b.fields.filter((f) => f.exportable && !hidden.has(f.name)).sort((a, c) => (order.indexOf(a.name) + 1 || 1e6) - (order.indexOf(c.name) + 1 || 1e6));
  const o = orderSql(input.sort ?? null, b.map);
  const rows = await all<{ d: unknown }>(`SELECT x.d ${b.from}${b.where} ORDER BY ${o.sql} LIMIT ?`, ...b.params, ...o.params, EXPORT_LIMIT + 1);
  if (rows.length > EXPORT_LIMIT) throw new WorkflowError("VALIDATION", `More than ${EXPORT_LIMIT.toLocaleString()} rows match. Narrow the filters.`);
  const lines = [cols.map((c) => csvCell(c.label)).join(",")];
  for (const r of rows) {
    const d = (typeof r.d === "string" ? JSON.parse(r.d) : r.d) as Record<string, unknown>;
    lines.push(cols.map((c) => csvCell(d[c.noorLabel])).join(","));
  }
  await audit({ actor: user }, { action: "cms.export", summary: `${user.name} exported ${rows.length.toLocaleString()} Noor ${input.resource} records` });
  return { filename: `noor-${input.resource.replace(/[^a-z0-9]+/gi, "-")}-${nowIso().slice(0, 10)}.csv`, csv: `﻿${lines.join("\r\n")}\r\n`, rows: rows.length };
}

// One record with every field the person may see, and the records it links to and that link to it.
export async function cmsRecordDetail(user: AppUser, resource: string, id: string) {
  const { manager, fields } = await access(user, resource);
  const r = await get<{ id: string; external_id: string | null; title: string | null; data_json: string; synced_at: string }>("SELECT id, external_id, title, data_json, synced_at FROM legacy_cms_records WHERE category = ? AND (id = ? OR external_id = ?)", resource, id, id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Record not found.");
  const d = JSON.parse(r.data_json) as Record<string, unknown>;
  const registered = new Set((await cmsFieldRegistry(resource)).map((f) => f.noorLabel));
  // Values Noor showed that the registry does not name yet (only for those who manage Noor data).
  const extra = manager ? Object.entries(d).filter(([k]) => !k.startsWith("_") && !registered.has(k)).map(([k, v]) => ({ label: k, value: String(v ?? "") })) : [];
  const resources = await all<{ slug: string; label: string }>("SELECT slug, label FROM cms_resources");
  const open = async (slug: string) => {
    try {
      await access(user, slug);
      return true;
    } catch {
      return false;
    }
  };
  const related: { resource: string; label: string; via: string; records: { id: string; title: string | null }[] }[] = [];
  // Out: a relationship field's value names a record of the resource it points at.
  for (const f of fields.filter((x) => x.type === "relationship" && x.relationship)) {
    const value = String(d[f.noorLabel] ?? "").trim();
    if (!value) continue;
    const target = resources.find((x) => x.slug === f.relationship || x.slug === `${f.relationship}s` || x.slug.endsWith(`/${f.relationship}s`) || x.label.toLowerCase().startsWith(f.relationship!.toLowerCase()));
    if (!target || !(await open(target.slug))) continue;
    const hits = await all<{ id: string; title: string | null }>("SELECT id, title FROM legacy_cms_records WHERE category = ? AND (external_id = ? OR LOWER(title) = LOWER(?)) LIMIT 5", target.slug, value, value);
    if (hits.length) related.push({ resource: target.slug, label: target.label, via: f.label, records: hits });
  }
  // In: other resources whose rows carry this record's name or link to its id.
  const name = (r.title ?? "").trim();
  if (name.length >= 3 || r.external_id) {
    for (const x of resources.filter((x) => x.slug !== resource)) {
      if (!(await open(x.slug))) continue;
      const hits = await all<{ id: string; title: string | null }>(
        `SELECT id, title FROM legacy_cms_records WHERE category = ? AND (${name.length >= 3 ? "data_json ILIKE ? OR " : ""}data_json LIKE ?) LIMIT 10`,
        x.slug, ...(name.length >= 3 ? [`%":"${like(name)}"%`] : []), `%/${resource.split("/").pop()}/${r.external_id ?? "-"}"%`,
      );
      if (hits.length) related.push({ resource: x.slug, label: x.label, via: "mentions this record", records: hits });
    }
  }
  return { id: r.id, externalId: r.external_id, title: r.title, syncedAt: r.synced_at, fields: fields.map((f) => ({ name: f.name, label: f.label, type: f.type, value: String(d[f.noorLabel] ?? "") })), extra, related };
}

// ---------------------------------------------------------------------------
// Saved views: a person's filters, sort and columns per resource; Admin may share one with everyone.
// ---------------------------------------------------------------------------

const viewPage = (resource: string) => `cms-records:${resource}`;
export async function listCmsViews(user: AppUser, resource: string) {
  await access(user, resource);
  const rows = await all<{ id: string; name: string; query: string; shared: number; owner_id: string }>("SELECT id, name, query, shared, owner_id FROM saved_views WHERE page = ? AND (owner_id = ? OR shared = 1) ORDER BY shared DESC, LOWER(name)", viewPage(resource), user.id);
  return rows.map((r) => ({ id: r.id, name: r.name, shared: !!r.shared, mine: r.owner_id === user.id, view: JSON.parse(r.query) as CmsRecordsView }));
}
export async function saveCmsView(user: AppUser, resource: string, input: { name: string; view: CmsRecordsView; shared?: boolean }) {
  const { fields } = await access(user, resource);
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the view.");
  // A view that cannot run is refused when saved, not when someone opens it.
  groupSql(input.view.filter ?? { join: "and", items: [] }, new Map(fields.map((f) => [f.name, f])));
  const shared = !!input.shared && (can(user, "users.manage") || can(user, "settings.manage"));
  const query = JSON.stringify({ filter: input.view.filter, search: input.view.search ?? "", sort: input.view.sort ?? null, columns: input.view.columns ?? null });
  const same = await get<{ id: string }>("SELECT id FROM saved_views WHERE page = ? AND owner_id = ? AND LOWER(name) = LOWER(?)", viewPage(resource), user.id, name);
  if (same) await run("UPDATE saved_views SET query = ?, shared = ? WHERE id = ?", query, shared ? 1 : 0, same.id);
  else await run("INSERT INTO saved_views (id, owner_id, name, page, query, config, shared, created_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)", uid(), user.id, name, viewPage(resource), query, shared ? 1 : 0, nowIso());
  return listCmsViews(user, resource);
}
export async function deleteCmsView(user: AppUser, resource: string, id: string) {
  const v = await get<{ owner_id: string }>("SELECT owner_id FROM saved_views WHERE id = ? AND page = ?", id, viewPage(resource));
  if (!v) throw new WorkflowError("NOT_FOUND", "View not found.");
  if (v.owner_id !== user.id && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only the owner or Admin removes a view.");
  await run("DELETE FROM saved_views WHERE id = ?", id);
  return listCmsViews(user, resource);
}

// The resources a person may open on the Records tab, with their stored count.
export async function cmsRecordResources(user: AppUser) {
  const manager = await canManageCmsData(user);
  const allowed = new Set((await Promise.all(user.roles.map((r) => allowedCategoriesForUser(r, user.id)))).flat() as string[]);
  const rows = await all<{ slug: string; label: string; known: number; n: number | string }>(
    "SELECT r.slug, r.label, r.known, (SELECT COUNT(*) FROM legacy_cms_records x WHERE x.category = r.slug) AS n FROM cms_resources r ORDER BY r.known DESC, r.label",
  );
  const known = LEGACY_CMS_CATEGORIES.filter((c) => !rows.some((r) => r.slug === c.key)).map((c) => ({ slug: c.key, label: c.label, known: 1, n: 0 }));
  return [...rows, ...known]
    .filter((r) => (r.known ? manager || allowed.has(r.slug) : manager))
    .map((r) => ({ slug: r.slug, label: r.label, stored: Number(r.n) }));
}

export { CMS_QUICK };
export type CmsQueryFilter = CmsGroup;
