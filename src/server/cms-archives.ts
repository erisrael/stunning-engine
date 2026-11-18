import { all, get, nowIso, parseJson, run } from "./db";
import type { AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { LEGACY_CMS_CATEGORIES, type LegacyCmsCategory } from "@/lib/legacy-cms";
import { allowedCategoriesForUser, canManageCmsData } from "./legacy-cms";

// Noor's scraped archives and storage (Update 1.2, System improvements 2): what is stored per resource against
// Noor's own totals and its size, "Fetch everything" (every switched-on resource mirrored in turn, resumable), and
// snapshots: frozen copies of the stored rows, opened as a full page (records, entities, schemas, logs, storage,
// data quality), filtered, sorted, paged, exported, and compared with each other or with the data stored now.

type SnapRecord = { id?: string; category: string; externalId: string | null; title: string | null; data: Record<string, unknown>; syncedAt?: string };
type SnapRow = { id: string; version_name: string; category: string; description: string | null; record_count: number; created_by: string | null; created_at: string; data_json: string };

// The resources a person may read: managers every resource, others the Noor tables their access allows.
async function readable(user: AppUser): Promise<{ manager: boolean; slugs: Set<string> | null }> {
  if (await canManageCmsData(user)) return { manager: true, slugs: null };
  const cats = new Set<string>((await Promise.all(user.roles.map((r) => allowedCategoriesForUser(r, user.id)))).flat());
  if (!cats.size) throw new WorkflowError("FORBIDDEN", "Your Noor access does not include stored data.");
  return { manager: false, slugs: cats };
}
const may = (r: { slugs: Set<string> | null }, slug: string) => !r.slugs || r.slugs.has(slug);
async function needManager(user: AppUser) {
  if (!(await canManageCmsData(user))) throw new WorkflowError("FORBIDDEN", "Fetching and snapshots are for Admin, or the people Admin allows to manage Noor data.");
}
const labelOf = async (slug: string) => (await get<{ label: string }>("SELECT label FROM cms_resources WHERE slug = ?", slug))?.label ?? LEGACY_CMS_CATEGORIES.find((c) => c.key === slug)?.label ?? slug;

// --- Storage -------------------------------------------------------------------

export async function archiveOverview(user: AppUser) {
  const r = await readable(user);
  const resources = await all<{ slug: string; label: string; nav_group: string | null; enabled: number; known: number; noor_total: number | null; last_mirror_at: string | null; checked_at: string | null; last_error: string | null }>(
    "SELECT slug, label, nav_group, enabled, known, noor_total, last_mirror_at, checked_at, last_error FROM cms_resources ORDER BY known DESC, label",
  );
  const stored = new Map(
    (await all<{ category: string; n: number | string; bytes: number | string | null; oldest: string | null; newest: string | null }>(
      "SELECT category, COUNT(*) AS n, SUM(LENGTH(data_json)) AS bytes, MIN(synced_at) AS oldest, MAX(synced_at) AS newest FROM legacy_cms_records GROUP BY category",
    )).map((x) => [x.category, { n: Number(x.n), bytes: Number(x.bytes ?? 0), oldest: x.oldest, newest: x.newest }]),
  );
  const { listRuns } = await import("./sync-runs");
  const runs = await listRuns("noor", resources.map((x) => x.slug), 200);
  const rows = resources
    .filter((x) => may(r, x.slug))
    .map((x) => {
      const s = stored.get(x.slug);
      const open = runs.find((y) => y.scopeId === x.slug && ["running", "paused", "partial"].includes(y.status));
      const last = runs.find((y) => y.scopeId === x.slug);
      return {
        slug: x.slug,
        label: x.label,
        group: x.nav_group,
        enabled: !!x.enabled,
        noorTotal: x.noor_total == null ? null : Number(x.noor_total),
        stored: s?.n ?? 0,
        bytes: s?.bytes ?? 0,
        // Rows read before the last full mirror began are older than Noor's copy.
        newest: s?.newest ?? null,
        oldest: s?.oldest ?? null,
        lastMirrorAt: x.last_mirror_at,
        checkedAt: x.checked_at,
        lastError: x.last_error,
        coverage: x.noor_total ? Math.min(1, (s?.n ?? 0) / Number(x.noor_total)) : null,
        run: open ? { id: open.id, status: open.status, discovered: open.discovered, pages: Number(open.detail.pages ?? 0) || null, cursor: open.cursor } : null,
        lastRun: last ? { status: last.status, at: last.finishedAt ?? last.startedAt, discovered: last.discovered, inserted: last.inserted, updated: last.updated, failed: last.failed } : null,
      };
    });
  const snaps = await all<{ category: string; n: number | string; bytes: number | string | null }>("SELECT category, COUNT(*) AS n, SUM(LENGTH(data_json)) AS bytes FROM legacy_cms_snapshots GROUP BY category");
  const snapBytes = snaps.reduce((a, s) => a + Number(s.bytes ?? 0), 0);
  return {
    manager: r.manager,
    resources: rows,
    totals: {
      resources: rows.length,
      enabled: rows.filter((x) => x.enabled).length,
      records: rows.reduce((a, x) => a + x.stored, 0),
      noorRecords: rows.reduce((a, x) => a + (x.noorTotal ?? 0), 0),
      bytes: rows.reduce((a, x) => a + x.bytes, 0),
      snapshots: snaps.reduce((a, s) => a + Number(s.n), 0),
      snapshotBytes: snapBytes,
      behind: rows.filter((x) => x.enabled && x.noorTotal != null && x.noorTotal !== x.stored).length,
      failing: rows.filter((x) => !!x.lastError).length,
    },
    snapshots: await listSnapshots(user),
  };
}

// "Fetch everything": every switched-on resource is mirrored in turn, within the time this call has. A resource
// part-read waits at its next page; calling again carries on, so the page calls it until everything is done.
export async function fetchEverything(user: AppUser, budgetMs = 50_000) {
  await needManager(user);
  const { mirrorCmsResource } = await import("./cms-fields");
  const { openRun } = await import("./sync-runs");
  const started = Date.now();
  const since = (await get<{ value: string }>("SELECT value FROM settings WHERE key = 'meta.noorFetchAll'"))?.value ?? null;
  // A new round starts when the last one finished (or none ran); its start marks what this round has read.
  const round = since ? parseJson<{ startedAt: string; done: boolean }>(since, { startedAt: nowIso(), done: true }) : { startedAt: nowIso(), done: true };
  const at = round.done ? nowIso() : round.startedAt;
  if (round.done) {
    await run("INSERT INTO settings (key, value, updated_at) VALUES ('meta.noorFetchAll', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", JSON.stringify({ startedAt: at, done: false }), nowIso());
    await audit({ actor: user }, { action: "cms.fetch_all", summary: `${user.name} started fetching everything from Noor` });
  }
  const resources = await all<{ slug: string; label: string; last_mirror_at: string | null }>("SELECT slug, label, last_mirror_at FROM cms_resources WHERE enabled = 1 ORDER BY known DESC, label");
  const out: { slug: string; label: string; status: "done" | "working" | "waiting" | "failed"; detail: string }[] = [];
  for (const r of resources) {
    const finished = !!r.last_mirror_at && r.last_mirror_at >= at && !(await openRun("noor", r.slug, "full"));
    if (finished) {
      out.push({ slug: r.slug, label: r.label, status: "done", detail: "Read in full" });
      continue;
    }
    const left = budgetMs - (Date.now() - started);
    if (left < 5_000) {
      out.push({ slug: r.slug, label: r.label, status: "waiting", detail: "Next" });
      continue;
    }
    try {
      const res = await mirrorCmsResource(user, r.slug, { budgetMs: left });
      out.push({ slug: r.slug, label: r.label, status: res.status === "paused" ? "working" : "done", detail: `${res.discovered.toLocaleString()} rows read of ${res.noorTotal.toLocaleString()}; ${res.stored.toLocaleString()} stored${res.removed ? `, ${res.removed} no longer in Noor removed` : ""}` });
    } catch (e) {
      out.push({ slug: r.slug, label: r.label, status: "failed", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  const done = out.every((x) => x.status === "done" || x.status === "failed");
  if (done) {
    await run("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'meta.noorFetchAll'", JSON.stringify({ startedAt: at, done: true }), nowIso());
    await audit({ actor: user }, { action: "cms.fetch_all", summary: `${user.name} fetched everything from Noor: ${out.filter((x) => x.status === "done").length} of ${out.length} resources read${out.some((x) => x.status === "failed") ? `, ${out.filter((x) => x.status === "failed").map((x) => x.label).join(", ")} failed` : ""}` });
  }
  return { done, startedAt: at, resources: out };
}

// --- Snapshots -----------------------------------------------------------------

export async function listSnapshots(user: AppUser) {
  const r = await readable(user);
  const rows = await all<Omit<SnapRow, "data_json"> & { bytes: number | string }>("SELECT id, version_name, category, description, record_count, created_by, created_at, LENGTH(data_json) AS bytes FROM legacy_cms_snapshots ORDER BY created_at DESC");
  return rows.filter((s) => s.category === "all" ? r.manager : may(r, s.category)).map((s) => ({ id: s.id, name: s.version_name, category: s.category, description: s.description, records: Number(s.record_count), createdBy: s.created_by, createdAt: s.created_at, bytes: Number(s.bytes) }));
}

export async function createSnapshot(user: AppUser, input: { name: string; category: string; description?: string | null }) {
  await needManager(user);
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) throw new WorkflowError("VALIDATION", "Name the snapshot, for example \"Before the price change\".");
  const scope = input.category === "all" ? "all" : String(input.category);
  if (scope !== "all" && !(await get("SELECT 1 AS x FROM cms_resources WHERE slug = ?", scope)) && !LEGACY_CMS_CATEGORIES.some((c) => c.key === scope)) throw new WorkflowError("NOT_FOUND", "That Noor resource is not known.");
  const rows = await all<{ id: string; category: string; external_id: string | null; title: string | null; data_json: string; synced_at: string }>(
    `SELECT id, category, external_id, title, data_json, synced_at FROM legacy_cms_records ${scope === "all" ? "" : "WHERE category = ?"} ORDER BY category, external_id`,
    ...(scope === "all" ? [] : [scope]),
  );
  if (!rows.length) throw new WorkflowError("INVALID_STATE", "Nothing is stored for that yet. Fetch it from Noor first.");
  const records: SnapRecord[] = rows.map((x) => ({ id: x.id, category: x.category, externalId: x.external_id, title: x.title, data: parseJson(x.data_json, {}), syncedAt: x.synced_at }));
  const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await run(
    "INSERT INTO legacy_cms_snapshots (id, version_name, category, description, record_count, created_by, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id, name, scope, String(input.description ?? "").trim().slice(0, 500) || null, records.length, user.name, nowIso(), JSON.stringify(records),
  );
  await audit({ actor: user }, { action: "create.legacy_cms_snapshot", summary: `${user.name} created snapshot "${name}" (${id}) with ${records.length} records of ${scope === "all" ? "every resource" : await labelOf(scope)}` });
  return { id, records: records.length };
}

export async function deleteSnapshot(user: AppUser, id: string) {
  await needManager(user);
  const s = await get<{ version_name: string }>("SELECT version_name FROM legacy_cms_snapshots WHERE id = ?", id);
  if (!s) throw new WorkflowError("NOT_FOUND", "Snapshot not found.");
  await run("DELETE FROM legacy_cms_snapshots WHERE id = ?", id);
  await audit({ actor: user }, { action: "delete.legacy_cms_snapshot", summary: `${user.name} deleted snapshot "${s.version_name}" (${id})` });
}

async function loadSnapshot(user: AppUser, id: string) {
  const r = await readable(user);
  const s = await get<SnapRow>("SELECT * FROM legacy_cms_snapshots WHERE id = ?", id);
  if (!s || (s.category === "all" ? !r.manager : !may(r, s.category))) throw new WorkflowError("NOT_FOUND", "Snapshot not found.");
  const records = parseJson<SnapRecord[]>(s.data_json, []).filter((x) => may(r, x.category));
  return { s, records };
}

// A value as text, for search, sorting, schema and export.
const text = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const visibleKeys = (d: Record<string, unknown>) => Object.keys(d).filter((k) => !k.startsWith("_"));
const typeOf = (v: string) => (v === "" ? "empty" : /^-?\d+(\.\d+)?$/.test(v) ? "number" : /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/.test(v) ? "date" : /^(true|false|yes|no)$/i.test(v) ? "yes/no" : /@/.test(v) && /^\S+@\S+\.\S+$/.test(v) ? "email" : /^\+?\d[\d\s-]{7,}$/.test(v) ? "phone" : /^[A-Z]{3} [\d,]+(\.\d+)?$/.test(v) ? "money" : "text");

// The snapshot's page: its facts and the five summaries (entities, schemas, storage, data quality, logs).
export async function snapshotDetail(user: AppUser, id: string) {
  const { s, records } = await loadSnapshot(user, id);
  const byCat = new Map<string, SnapRecord[]>();
  for (const x of records) (byCat.get(x.category) ?? byCat.set(x.category, []).get(x.category)!).push(x);
  const entities = await Promise.all(
    [...byCat].map(async ([cat, list]) => ({ category: cat, label: await labelOf(cat), records: list.length, fields: new Set(list.flatMap((x) => visibleKeys(x.data))).size, bytes: list.reduce((a, x) => a + JSON.stringify(x).length, 0), newest: list.reduce<string | null>((m, x) => (x.syncedAt && (!m || x.syncedAt > m) ? x.syncedAt : m), null) })),
  );
  // Schemas: each field, what it holds (the most common kind of value) and how often it is filled.
  const schemas = [...byCat].map(([cat, list]) => {
    const keys = [...new Set(list.flatMap((x) => visibleKeys(x.data)))];
    return {
      category: cat,
      fields: keys.map((k) => {
        const vals = list.map((x) => text(x.data[k]).trim());
        const filled = vals.filter(Boolean);
        const kinds = new Map<string, number>();
        for (const v of filled) kinds.set(typeOf(v), (kinds.get(typeOf(v)) ?? 0) + 1);
        const main = [...kinds].sort((a, b) => b[1] - a[1])[0];
        return { name: k, type: main?.[0] ?? "empty", mixed: kinds.size > 1, filled: filled.length, fillRate: list.length ? filled.length / list.length : 0, distinct: new Set(filled).size, sample: filled[0]?.slice(0, 60) ?? null };
      }),
    };
  });
  // Data quality: duplicates by Noor id, rows without an id or title, empty fields, mixed kinds of values.
  const quality = [...byCat].map(([cat, list]) => {
    const ids = new Map<string, number>();
    for (const x of list) if (x.externalId) ids.set(x.externalId, (ids.get(x.externalId) ?? 0) + 1);
    const sc = schemas.find((x) => x.category === cat)!;
    const duplicates = [...ids].filter(([, n]) => n > 1).map(([k, n]) => ({ id: k, times: n }));
    const noId = list.filter((x) => !x.externalId).length;
    const noTitle = list.filter((x) => !x.title?.trim()).length;
    const emptyFields = sc.fields.filter((f) => f.fillRate === 0).map((f) => f.name);
    const sparse = sc.fields.filter((f) => f.fillRate > 0 && f.fillRate < 0.5).map((f) => ({ name: f.name, fillRate: f.fillRate }));
    const mixed = sc.fields.filter((f) => f.mixed).map((f) => f.name);
    const issues = duplicates.length + (noId ? 1 : 0) + (noTitle ? 1 : 0) + emptyFields.length + mixed.length;
    const score = Math.max(0, Math.round(100 - (duplicates.length / Math.max(1, list.length)) * 100 - (noId / Math.max(1, list.length)) * 50 - (emptyFields.length / Math.max(1, sc.fields.length)) * 30 - (mixed.length / Math.max(1, sc.fields.length)) * 20));
    return { category: cat, records: list.length, duplicates: duplicates.slice(0, 50), duplicateCount: duplicates.length, noId, noTitle, emptyFields, sparse, mixed, issues, score };
  });
  // Storage: the snapshot's size per resource, against what is stored now.
  const nowRows = new Map((await all<{ category: string; n: number | string; bytes: number | string | null }>("SELECT category, COUNT(*) AS n, SUM(LENGTH(data_json)) AS bytes FROM legacy_cms_records GROUP BY category")).map((x) => [x.category, { n: Number(x.n), bytes: Number(x.bytes ?? 0) }]));
  const storage = { bytes: s.data_json.length, perResource: entities.map((e) => ({ category: e.category, label: e.label, bytes: e.bytes, records: e.records, nowRecords: nowRows.get(e.category)?.n ?? 0, nowBytes: nowRows.get(e.category)?.bytes ?? 0 })) };
  // Logs: what happened to this snapshot, and the Noor reads that filled it (the runs finished before it was taken).
  const audits = await all<{ action: string; summary: string; occurred_at: string }>("SELECT action, summary, occurred_at FROM audit_events WHERE summary LIKE ? ORDER BY occurred_at DESC LIMIT 50", `%${id}%`);
  const { listRuns } = await import("./sync-runs");
  const runs = (await listRuns("noor", [...byCat.keys()], 200)).filter((x) => (x.finishedAt ?? x.startedAt) <= s.created_at).slice(0, 30);
  const logs = [
    ...audits.map((a) => ({ at: a.occurred_at, kind: "audit", text: a.summary })),
    ...runs.map((x) => ({ at: x.finishedAt ?? x.startedAt, kind: "read", text: `${x.kind === "full" ? "Full read" : "Newest rows"} of ${x.scopeId}: ${x.status}, ${x.discovered.toLocaleString()} rows read (${x.inserted} new, ${x.updated} changed${x.failed ? `, ${x.failed} failed pages` : ""})` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return {
    id: s.id,
    name: s.version_name,
    scope: s.category,
    scopeLabel: s.category === "all" ? "Every resource" : await labelOf(s.category),
    description: s.description,
    records: records.length,
    createdBy: s.created_by,
    createdAt: s.created_at,
    entities,
    schemas,
    quality,
    storage,
    logs,
    canDelete: await canManageCmsData(user),
  };
}

export type RecordQuery = { q?: string | null; category?: string | null; sort?: string | null; dir?: "asc" | "desc" | null; page?: number; size?: number; field?: string | null; value?: string | null };

function filterRecords(records: SnapRecord[], f: RecordQuery) {
  const q = (f.q ?? "").trim().toLowerCase();
  let list = records.filter((x) => (!f.category || x.category === f.category) && (!q || `${x.title ?? ""} ${x.externalId ?? ""} ${Object.values(x.data).map(text).join(" ")}`.toLowerCase().includes(q)));
  if (f.field && f.value != null && f.value !== "") list = list.filter((x) => text(x.data[f.field!]).toLowerCase().includes(String(f.value).toLowerCase()));
  if (f.sort) {
    const k = f.sort;
    const dir = f.dir === "desc" ? -1 : 1;
    const val = (x: SnapRecord) => (k === "_id" ? x.externalId ?? "" : k === "_title" ? x.title ?? "" : text(x.data[k]));
    list = [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const na = Number(va.replace(/[^\d.-]/g, ""));
      const nb = Number(vb.replace(/[^\d.-]/g, ""));
      const num = va !== "" && vb !== "" && !Number.isNaN(na) && !Number.isNaN(nb) && /\d/.test(va) && /\d/.test(vb) && !/[a-z]{2}/i.test(va.replace(/^[A-Z]{3} /, ""));
      return (num ? na - nb : va.localeCompare(vb)) * dir;
    });
  }
  return list;
}

// The records tab: search, a resource, a field filter, sort by any column, pages.
export async function snapshotRecords(user: AppUser, id: string, f: RecordQuery) {
  const { records } = await loadSnapshot(user, id);
  const list = filterRecords(records, f);
  const size = Math.min(200, Math.max(10, Math.round(f.size ?? 50)));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(pages, Math.max(1, Math.round(f.page ?? 1)));
  const columns = [...new Set((f.category ? list : list.slice(0, 500)).flatMap((x) => visibleKeys(x.data)))];
  return { total: list.length, page, pages, size, columns, rows: list.slice((page - 1) * size, page * size).map((x) => ({ category: x.category, externalId: x.externalId, title: x.title, data: Object.fromEntries(visibleKeys(x.data).map((k) => [k, text(x.data[k])])) })) };
}

// The filtered records as CSV (only the chosen columns, when given).
export async function exportSnapshotRecords(user: AppUser, id: string, f: RecordQuery, columns?: string[] | null) {
  const { s, records } = await loadSnapshot(user, id);
  const list = filterRecords(records, f);
  const cols = columns?.length ? columns : [...new Set(list.flatMap((x) => visibleKeys(x.data)))];
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [["Resource", "Noor id", "Title", ...cols].map(esc).join(","), ...list.map((x) => [x.category, x.externalId ?? "", x.title ?? "", ...cols.map((c) => text(x.data[c]))].map(esc).join(","))];
  await audit({ actor: user }, { action: "cms.snapshot_export", summary: `${user.name} exported ${list.length} records of snapshot "${s.version_name}" (${id})` });
  return { fileName: `${s.version_name.replace(/[^\w-]+/g, "-").slice(0, 60) || "snapshot"}.csv`, csv: `﻿${lines.join("\r\n")}`, rows: list.length };
}

// Comparison: another snapshot, or the data stored now. Records match by resource and Noor id.
export async function compareSnapshot(user: AppUser, id: string, other: string, limit = 200) {
  const a = await loadSnapshot(user, id);
  let bName: string;
  let bRecords: SnapRecord[];
  if (other === "current") {
    const r = await readable(user);
    const cats = [...new Set(a.records.map((x) => x.category))];
    const rows = cats.length ? await all<{ category: string; external_id: string | null; title: string | null; data_json: string; synced_at: string }>(`SELECT category, external_id, title, data_json, synced_at FROM legacy_cms_records WHERE category IN (${cats.map(() => "?").join(",")})`, ...cats) : [];
    bRecords = rows.filter((x) => may(r, x.category)).map((x) => ({ category: x.category, externalId: x.external_id, title: x.title, data: parseJson(x.data_json, {}), syncedAt: x.synced_at }));
    bName = "Stored now";
  } else {
    const b = await loadSnapshot(user, other);
    bRecords = b.records;
    bName = b.s.version_name;
  }
  const key = (x: SnapRecord) => `${x.category}\u0000${x.externalId ?? x.title ?? ""}`;
  const A = new Map(a.records.map((x) => [key(x), x]));
  const B = new Map(bRecords.map((x) => [key(x), x]));
  const added: SnapRecord[] = [];
  const removed: SnapRecord[] = [];
  const changed: { rec: SnapRecord; fields: { name: string; before: string; after: string }[] }[] = [];
  for (const [k, x] of B) if (!A.has(k)) added.push(x);
  for (const [k, x] of A) {
    const y = B.get(k);
    if (!y) removed.push(x);
    else {
      const names = [...new Set([...visibleKeys(x.data), ...visibleKeys(y.data)])];
      const fields = names.filter((n) => text(x.data[n]) !== text(y.data[n])).map((n) => ({ name: n, before: text(x.data[n]), after: text(y.data[n]) }));
      if (fields.length) changed.push({ rec: y, fields });
    }
  }
  const brief = (x: SnapRecord) => ({ category: x.category, externalId: x.externalId, title: x.title });
  const perResource = [...new Set([...a.records, ...bRecords].map((x) => x.category))].map((c) => ({ category: c, before: a.records.filter((x) => x.category === c).length, after: bRecords.filter((x) => x.category === c).length, added: added.filter((x) => x.category === c).length, removed: removed.filter((x) => x.category === c).length, changed: changed.filter((x) => x.rec.category === c).length }));
  return {
    before: { id, name: a.s.version_name, at: a.s.created_at, records: a.records.length },
    after: { id: other, name: bName, records: bRecords.length },
    counts: { added: added.length, removed: removed.length, changed: changed.length, same: a.records.length - removed.length - changed.length },
    perResource,
    added: added.slice(0, limit).map(brief),
    removed: removed.slice(0, limit).map(brief),
    changed: changed.slice(0, limit).map((c) => ({ ...brief(c.rec), fields: c.fields.slice(0, 20) })),
  };
}

export const ARCHIVE_SCOPES = (): { key: LegacyCmsCategory | "all"; label: string }[] => [{ key: "all", label: "Every resource" }, ...LEGACY_CMS_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))];
