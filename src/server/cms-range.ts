import { createHash } from "node:crypto";
import { all, nowIso, run, tx, uid } from "./db";
import { cmsSession, cmsTableSeed } from "./cms-session";
import { getMeta, setMeta } from "./settings";
import { type AppUser } from "./users";
import { WorkflowError } from "./workflow";
import {
  authenticateFilament,
  cmsStoppedSince,
  getLegacyCmsConfigForUser,
  parseFilamentTable,
  requireCmsCategories,
  LEGACY_CMS_CATEGORIES,
  type LegacyCmsCategory,
} from "./legacy-cms";
import { cmsPagination, dateSortColumn, dateFieldsOf, queryCmsTable, remoteFilters, type CmsDateField, type CmsRemoteFilter, type CmsTableQuery } from "@/lib/cms-livewire";
import { cmsDate, parseCmsDate } from "@/lib/cms-filters";

// Date-first loading from Noor (Update 1.0, Phase 2). A date range is answered with as few Noor requests as possible:
//   1. Noor's own date filter, when the table has one: only rows in range come back, with Noor's true total.
//   2. Otherwise a sorted range search: newest first, binary-search the pages where the range starts and ends,
//      fetch only those pages and check each row's date at the edges.
//   3. Otherwise (no date filter and no sortable date column) every page, filtered here.
// Pages are fetched 4 at a time from the same signed snapshot, with backoff on 429/5xx, and Stop ends the run.
// Closed past days are cached per table, day and filters; today is always fetched again.

export type CmsRangeMethod = "noor-filter" | "sorted-search" | "full-scan" | "mirror";
// dateField: which date the range means (a Noor column such as created_at or start_date); empty = the best one.
export type CmsRangeInput = { category: LegacyCmsCategory; from: string; until: string; search?: string; filters?: Record<string, string>; refresh?: boolean; dateField?: string };
export type CmsRangeResult = {
  ok: true;
  category: LegacyCmsCategory;
  from: string;
  until: string;
  method: CmsRangeMethod;
  headers: string[];
  records: Record<string, string>[];
  total: number;
  requests: number;
  cachedDays: number;
  fetchedDays: number;
  undated: number;
  filters: CmsRemoteFilter[];
  dateField?: string | null;
  dateFields?: CmsDateField[];
  fetchedAt: string;
};
export type CmsTableCapability = {
  category: LegacyCmsCategory;
  dateFilter: string | null;
  dateFilterWorks: boolean | null;
  sortColumn: string | null;
  selects: string[];
  method: CmsRangeMethod;
  totalRows: number;
  pages: number;
  pageSize: number;
  checkedAt: string;
  note: string;
};

// Noor is asked for big pages first (fewer round trips); the first size it really honours is kept per table.
// Measured on Noor: it renders about 20-27 rows a second whatever the page size, and a 50-row page answers in
// about 4 s against 20 s for 250. Bulk loads use 100-row pages 8 at a time; recent ranges start with 50.
const SIZE_TRIES = [100, 50];
const sizeKnown = new Map<string, number>();
const CONCURRENCY = 8;
const MAX_DAYS = 366;
const MAX_ROWS = 50_000;
const MAX_PAGES = 2_000;
const HOUR3 = 3 * 3600_000;
const DAY = 86400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Workspace days are Addis Ababa days (UTC+3, no daylight saving).
export const addisDay = (t: number | Date) => new Date(+t + HOUR3).toISOString().slice(0, 10);
export const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) - HOUR3;
const nextDay = (day: string) => addisDay(dayStart(day) + DAY + HOUR3 / 3);
export function daysBetween(from: string, until: string) {
  const out: string[] = [];
  for (let d = from; d <= until && out.length <= MAX_DAYS; d = nextDay(d)) out.push(d);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

type Page = { records: Record<string, string>[]; total: number; pageSize: number; pages: number; dates: number[] };
type Base = Omit<CmsTableQuery, "page" | "pageSize">;
export type CmsConnection = { base: string; cookie: string };

// One Noor table, reused by every page request of a run (same signed snapshot, same session).
export class CmsTable {
  requests = 0;
  // The label of the date column a range uses (set by fetchSpan); null = the first date the row has.
  dateLabel: string | null = null;
  size = 50;
  private seed = "";
  private cookie = "";
  private base = "";
  private url = "";
  constructor(
    private user: AppUser,
    readonly category: LegacyCmsCategory,
    private check: () => Promise<void>,
    private conn?: CmsConnection,
  ) {}
  async open(fresh = false): Promise<this> {
    let username = "";
    if (this.conn && !fresh) {
      this.base = this.conn.base;
      this.cookie = this.conn.cookie;
    } else {
      const config = await getLegacyCmsConfigForUser(this.user);
      if (!config.username && !config.sessionCookie) throw new WorkflowError("VALIDATION", "Connect Noor CMS first (Admin, Noor access).");
      username = config.username;
      this.base = config.baseUrl.replace(/\/+$/, "");
      this.cookie = await cmsSession(config, authenticateFilament, fresh);
    }
    this.url = `${this.base}${LEGACY_CMS_CATEGORIES.find((c) => c.key === this.category)!.path}`;
    try {
      this.seed = await cmsTableSeed(this.url, this.cookie, fresh);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/HTTP (302|401|403|419)/.test(msg)) throw e;
      // An expired or replaced Noor session (Noor ends older sessions when the same login signs in again):
      // sign in once more. If Noor still sends us to its login page, the saved email or password is wrong.
      if (!fresh) return this.open(true);
      throw new WorkflowError("INVALID_STATE", `Noor did not accept the sign-in${username ? ` for ${username}` : ""}. Check the Noor email and password in Admin, Noor access, then press Check.`);
    }
    return this;
  }
  get html() {
    return this.seed;
  }
  async page(q: CmsTableQuery): Promise<Page> {
    let reauthed = false;
    for (let attempt = 0; ; attempt++) {
      await this.check();
      try {
        this.requests++;
        const res = await queryCmsTable(this.seed, this.base, this.cookie, q);
        const records = parseFilamentTable(res.html);
        const { totalResults } = cmsPagination(res.html, records.length, q.page, res.pageSize);
        // Each row carries the time of the chosen date column in _date (cache, sorting and day placement read it).
        for (const r of records) {
          const d = this.dateLabel ? parseCmsDate(r[this.dateLabel]) : cmsDate(r);
          if (d) r._date = d.toISOString();
        }
        const dates = records.map((r) => (r._date ? Date.parse(r._date) : NaN)).filter((d) => !Number.isNaN(d));
        return { records, total: totalResults, pageSize: res.pageSize, pages: Math.max(1, Math.ceil(totalResults / res.pageSize)), dates };
      } catch (error) {
        const msg = String(error instanceof Error ? error.message : error);
        if (/Invalid .* (filter|date)|no such date filter|cannot be sorted|cancelled|stopped/i.test(msg)) throw error;
        if (!reauthed && /HTTP (302|401|403|419)|session|Reconnect|redirect/i.test(msg)) {
          reauthed = true;
          await this.open(true);
          continue;
        }
        if (attempt < 3 && /HTTP (429|5\d\d)|timeout|aborted|fetch failed|ECONNRESET|socket/i.test(msg)) {
          await sleep(600 * 2 ** attempt);
          continue;
        }
        throw error;
      }
    }
  }
  // Page 1 at the biggest page size Noor honours (it must return that many rows, or all of them).
  async first(q: Omit<CmsTableQuery, "page" | "pageSize">): Promise<Page> {
    const known = sizeKnown.get(this.category);
    const tries = known ? [known] : SIZE_TRIES;
    let last: Page | null = null;
    for (const size of tries) {
      const pg = await this.page({ ...q, page: 1, pageSize: size });
      last = pg;
      const honoured = pg.pageSize === size && (pg.records.length === size || pg.records.length === pg.total);
      if (honoured) {
        this.size = size;
        sizeKnown.set(this.category, size);
        return pg;
      }
    }
    // Nothing honoured: page by what actually came back.
    const real = last!.records.length && last!.records.length < last!.total ? last!.records.length : last!.pageSize;
    this.size = real;
    sizeKnown.set(this.category, real);
    return { ...last!, pageSize: real, pages: Math.max(1, Math.ceil(last!.total / real)) };
  }
  at(q: Omit<CmsTableQuery, "page" | "pageSize">, p: number) {
    return this.page({ ...q, page: p, pageSize: this.size });
  }
}

const rowTime = (r: Record<string, string>) => {
  if (r._date) return Date.parse(r._date);
  const d = cmsDate(r);
  return d ? +d : null;
};

// Every page after the first, CONCURRENCY at a time.
async function rest(t: CmsTable, q: Base, first: Page, label: string, progress: (m: string) => Promise<void>) {
  if (first.pages > MAX_PAGES) throw new WorkflowError("VALIDATION", `Noor has ${first.total.toLocaleString()} rows here. Narrow the range or the filters.`);
  let done = 1;
  const pages = await mapLimit(
    Array.from({ length: first.pages - 1 }, (_, i) => i + 2),
    CONCURRENCY,
    async (p) => {
      const pg = await t.at(q, p);
      await progress(`${label}: page ${++done} of ${first.pages}`);
      return pg;
    },
  );
  return [first, ...pages];
}

async function viaNoorFilter(t: CmsTable, filter: CmsRemoteFilter, base: Base, from: string, until: string, progress: (m: string) => Promise<void>) {
  const q = { ...base, dates: { [filter.key]: { from, until } } };
  const first = await t.first(q);
  // Trust, then verify: if most dated rows fall well outside the range, Noor ignored the filter.
  const lo = dayStart(from) - DAY;
  const hi = dayStart(until) + 2 * DAY;
  const outside = first.dates.filter((d) => d < lo || d >= hi).length;
  if (first.dates.length >= 3 && outside > first.dates.length / 2) return null;
  const pages = await rest(t, q, first, "Noor date filter", progress);
  return { records: pages.flatMap((p) => p.records), total: first.total, exact: false };
}

async function viaSortedSearch(t: CmsTable, column: string, base: Base, from: string, until: string, progress: (m: string) => Promise<void>, now: number, newestFirst = true) {
  const q = { ...base, sort: { column, direction: "desc" as const } };
  const start0 = dayStart(from);
  const end0 = dayStart(until) + DAY;
  // Recent ranges (ending today or later): newest first in small pages, the first alone, then a few at a time,
  // stopping at the first page older than the range.
  if (newestFirst && end0 > now - DAY) {
    const small = (p: number) => t.page({ ...q, page: p, pageSize: 50 });
    const p1 = await small(1);
    if (!p1.records.length) return { records: [], total: 0, exact: true };
    if (!p1.dates.length) return null;
    const keep = (r: Record<string, string>) => {
      const time = rowTime(r);
      return time !== null && time >= start0 && time < end0;
    };
    const out = p1.records.filter(keep);
    if (Math.min(...p1.dates) < start0 || p1.pages === 1) return { records: out, total: out.length, exact: true };
    // How many pages the range needs, judged from the time the first page covers (plus one for safety).
    const span1 = Math.max(1, Math.max(...p1.dates) - Math.min(...p1.dates));
    let step = Math.min(CONCURRENCY, Math.max(1, Math.ceil((Math.min(...p1.dates) - start0) / span1) + 1));
    for (let p = 2; p <= p1.pages; p += step, step = CONCURRENCY) {
      const batch = await Promise.all(Array.from({ length: Math.min(step, p1.pages - p + 1) }, (_, i) => small(p + i)));
      await progress(`Newest first: ${Math.min(p1.pages, p + CONCURRENCY - 1)} pages read`);
      out.push(...batch.flatMap((b) => b.records).filter(keep));
      if (batch.some((b) => b.dates.length && Math.min(...b.dates) < start0)) break;
    }
    return { records: out, total: out.length, exact: true };
  }
  const first = await t.first(q);
  if (!first.records.length) return { records: [], total: 0, exact: true };
  if (!first.dates.length) return null;
  const memo = new Map<number, Promise<Page>>([[1, Promise.resolve(first)]]);
  const get = (p: number) => {
    if (!memo.has(p)) memo.set(p, t.at(q, p));
    return memo.get(p)!;
  };
  const start = dayStart(from);
  const end = dayStart(until) + DAY;
  const n = first.pages;
  const inRange = (r: Record<string, string>) => {
    const time = rowTime(r);
    return time !== null && time >= start && time < end;
  };
  // Recent ranges (ending today or later): newest first, so walk forward from page 1 a batch at a time.
  if (end > now - DAY) {
    const out: Record<string, string>[] = [];
    for (let p = 1; p <= n; p += CONCURRENCY) {
      const batch = await Promise.all(Array.from({ length: Math.min(CONCURRENCY, n - p + 1) }, (_, i) => get(p + i)));
      await progress(`Newest first: ${Math.min(n, p + CONCURRENCY - 1)} of ${n} pages read`);
      out.push(...batch.flatMap((b) => b.records).filter(inRange));
      if (batch.some((b) => b.dates.length && Math.min(...b.dates) < start)) break;
    }
    return { records: out, total: out.length, exact: true };
  }
  await progress(`Sorted range search over ${n.toLocaleString()} pages…`);
  let lo = 1,
    hi = n,
    firstPage = n + 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const pg = await get(mid);
    if (pg.dates.length && Math.min(...pg.dates) < end) {
      firstPage = mid;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  lo = firstPage;
  hi = n;
  let lastPage = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const pg = await get(mid);
    if (pg.dates.length && Math.max(...pg.dates) >= start) {
      lastPage = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (firstPage > lastPage) return { records: [], total: 0, exact: true };
  if (lastPage - firstPage > MAX_PAGES) throw new WorkflowError("VALIDATION", "This range spans too many Noor pages. Narrow the range or the filters.");
  const span = Array.from({ length: lastPage - firstPage + 1 }, (_, i) => firstPage + i);
  let done = 0;
  const pages = await mapLimit(span, CONCURRENCY, async (p) => {
    const pg = await get(p);
    await progress(`Sorted range search: page ${++done} of ${span.length} in range`);
    return pg;
  });
  // Exact edges: every row's own date decides.
  const records = pages.flatMap((p) => p.records).filter(inRange);
  return { records, total: records.length, exact: true };
}

async function viaFullScan(t: CmsTable, base: Base, from: string, until: string, progress: (m: string) => Promise<void>) {
  const first = await t.first(base);
  const pages = await rest(t, base, first, "No date filter in Noor", progress);
  const start = dayStart(from);
  const end = dayStart(until) + DAY;
  const all = pages.flatMap((p) => p.records);
  // A table with no dates at all (Students, Parents in Noor): every row, since a range cannot apply.
  if (all.length && all.every((r) => rowTime(r) === null)) return { records: all, total: all.length, exact: true, undated: true };
  const records = all.filter((r) => {
    const time = rowTime(r);
    return time !== null && time >= start && time < end;
  });
  return { records, total: records.length, exact: true };
}

// The date a range uses: the one asked for, else a created date Noor can sort (directly or by id), else any
// sortable date, else the first date column.
// Tables whose snapshot lists no columns (Filament 3): the sortable date column, read from the row itself.
export function tableDateFields(html: string): CmsDateField[] {
  const fields = dateFieldsOf(html);
  if (fields.length) return fields;
  const col = dateSortColumn(html);
  return col ? [{ key: col, label: "", sortBy: col, hidden: false }] : [];
}

export function chooseDateField(fields: CmsDateField[], wanted?: string | null) {
  return fields.find((f) => f.key === wanted) ?? fields.find((f) => f.sortBy && /created_at$/.test(f.key)) ?? fields.find((f) => f.sortBy) ?? fields[0] ?? null;
}

async function fetchSpan(t: CmsTable, baseIn: Base, from: string, until: string, progress: (m: string) => Promise<void>, now: number, wanted?: string | null) {
  const filters = remoteFilters(t.html);
  const field = chooseDateField(tableDateFields(t.html), wanted);
  t.dateLabel = field?.label || null;
  // A hidden date column (Noor's "Created at" on Students and Parents) is switched on for these requests.
  const base: Base = { ...baseIn, show: field?.hidden ? [field.key] : [] };
  // Noor's own date filter only stands for the created date.
  const dateFilter = !field || /created_at$/.test(field.key) ? filters.find((f) => f.kind === "date") : undefined;
  // Each faster path falls back to the next if Noor refuses it (its table version, a renamed column).
  const soft = (e: unknown) => !/stopped|cancelled|Narrow the range|too many/i.test(String(e instanceof Error ? e.message : e));
  if (dateFilter) {
    try {
      const r = await viaNoorFilter(t, dateFilter, base, from, until, progress);
      if (r) return { ...r, method: "noor-filter" as const };
    } catch (e) {
      if (!soft(e)) throw e;
    }
  }
  const column = field?.sortBy ?? null;
  if (column) {
    try {
      // Newest-first walking suits creation order (created_at or id); other dates (an end date) use the search.
      const r = await viaSortedSearch(t, column, base, from, until, progress, now, column === "id" || /created/.test(column));
      if (r) return { ...r, method: "sorted-search" as const };
    } catch (e) {
      if (!soft(e)) throw e;
    }
  }
  return { ...(await viaFullScan(t, base, from, until, progress)), method: "full-scan" as const };
}

// A whole table (or everything matching a search and Noor's filters), all pages in parallel. Used by the
// synchronized mirror and by views that filter on columns Noor cannot filter.
export async function fetchCmsAll(
  user: AppUser,
  input: { category: LegacyCmsCategory; search?: string; filters?: Record<string, string>; maxPages?: number; conn?: CmsConnection },
  progress: (m: string) => Promise<void> = async () => {},
  check: () => Promise<void> = async () => {},
) {
  await requireCmsCategories(user, [input.category]);
  const startedAt = Date.now();
  const t = await new CmsTable(user, input.category, async () => {
    if (cmsStoppedSince(startedAt)) throw new Error("Noor CMS loading stopped by user.");
    await check();
  }, input.conn).open();
  const base = { search: (input.search || "").trim().slice(0, 500), filters: input.filters || {} };
  const first = await t.first(base);
  const limit = input.maxPages && input.maxPages > 0 ? Math.min(first.pages, input.maxPages) : first.pages;
  const pages = await rest(t, base, { ...first, pages: limit }, `Loading ${LEGACY_CMS_CATEGORIES.find((c) => c.key === input.category)?.label ?? input.category}`, progress);
  const records = pages.flatMap((p) => p.records);
  if (pages.slice(0, -1).some((p) => p.records.length !== t.size)) throw new Error("Noor returned an incomplete page. Retry; nothing was replaced.");
  return {
    records,
    total: first.total,
    complete: limit === first.pages,
    headers: records[0] ? Object.keys(records[0]).filter((k) => !k.startsWith("_")) : [],
    filters: remoteFilters(t.html),
    requests: t.requests,
    pageSize: t.size,
  };
}

function validate(input: CmsRangeInput) {
  if (!LEGACY_CMS_CATEGORIES.some((c) => c.key === input.category)) throw new WorkflowError("VALIDATION", "Unknown CMS table.");
  if (!DAY_RE.test(input.from) || !DAY_RE.test(input.until) || input.from > input.until) throw new WorkflowError("VALIDATION", "Choose a valid date range.");
  if (daysBetween(input.from, input.until).length > MAX_DAYS) throw new WorkflowError("VALIDATION", "Choose a range of one year or less.");
}

const filterKey = (username: string, input: CmsRangeInput) =>
  createHash("sha256")
    .update(JSON.stringify([username, (input.search || "").trim().toLowerCase(), Object.entries(input.filters || {}).filter(([, v]) => v).sort(), input.dateField || ""]))
    .digest("hex")
    .slice(0, 24);

export async function fetchCmsRange(user: AppUser, input: CmsRangeInput, progress: (m: string) => Promise<void> = async () => {}, now = Date.now()): Promise<CmsRangeResult> {
  validate(input);
  await requireCmsCategories(user, [input.category]);
  const startedAt = Date.now();
  const check = async () => {
    if (cmsStoppedSince(startedAt)) throw new Error("Noor CMS loading stopped by user.");
  };
  // Tables with no dates in Noor (Students, Parents): the saved copy answers at once; Refresh reads Noor
  // again (several minutes for thousands of rows) and replaces the copy.
  const undatedTables = parseJsonList(await getMeta("cmsUndated2"));
  const plainQuery = !Object.values(input.filters || {}).some(Boolean);
  if (!input.refresh && plainQuery && undatedTables.includes(input.category)) {
    const saved = await all<{ data_json: string; synced_at: string }>("SELECT data_json, synced_at FROM legacy_cms_records WHERE category = ?", input.category);
    if (saved.length) {
      const q = (input.search || "").trim().toLowerCase();
      const records = saved.map((r) => JSON.parse(r.data_json) as Record<string, string>).filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
      return {
        ok: true, category: input.category, from: input.from, until: input.until, method: "mirror",
        headers: records[0] ? Object.keys(records[0]).filter((k) => !k.startsWith("_")) : [], records, total: records.length, requests: 0, cachedDays: 0, fetchedDays: 0,
        undated: records.length, filters: parseJsonSafe(await getMeta(`cmsFilters.${input.category}`)), fetchedAt: saved.map((r) => r.synced_at).sort().at(-1) ?? nowIso(),
      };
    }
  }
  const config = await getLegacyCmsConfigForUser(user);
  const key = filterKey(config.username || "session", input);
  const today = addisDay(now);
  const days = daysBetween(input.from, input.until);
  const cached = new Map<string, { rows: Record<string, string>[]; headers: string[]; method: CmsRangeMethod }>();
  if (!input.refresh)
    for (const r of await all<{ day: string; rows_json: string; headers_json: string; method: string }>(
      "SELECT day, rows_json, headers_json, method FROM cms_range_cache WHERE category = ? AND filter_key = ? AND day >= ? AND day <= ? AND day < ?",
      input.category,
      key,
      input.from,
      input.until,
      today,
    ))
      cached.set(r.day, { rows: JSON.parse(r.rows_json), headers: JSON.parse(r.headers_json), method: r.method as CmsRangeMethod });

  // Contiguous runs of days still to fetch.
  const spans: { from: string; until: string }[] = [];
  for (const d of days) {
    if (cached.has(d)) continue;
    const last = spans.at(-1);
    if (last && nextDay(last.until) === d) last.until = d;
    else spans.push({ from: d, until: d });
  }

  let requests = 0;
  let methodUsed: CmsRangeMethod | null = null;
  let filters: CmsRemoteFilter[] = [];
  let dateFields: CmsDateField[] = [];
  const fetched: Record<string, string>[] = [];
  const base = { search: (input.search || "").trim().slice(0, 500), filters: input.filters || {} };
  if (spans.length) {
    const t = await new CmsTable(user, input.category, check).open();
    filters = remoteFilters(t.html);
    dateFields = dateFieldsOf(t.html);
    await setMeta(`cmsDateFields.${input.category}`, JSON.stringify(dateFields));
    for (const [i, span] of spans.entries()) {
      await progress(spans.length > 1 ? `Loading ${span.from} to ${span.until} (${i + 1} of ${spans.length} gaps)…` : `Loading ${span.from} to ${span.until} from Noor…`);
      const res = await fetchSpan(t, base, span.from, span.until, progress, now, input.dateField);
      if ("undated" in res && res.undated) {
        if (!undatedTables.includes(input.category)) await setMeta("cmsUndated2", JSON.stringify([...undatedTables, input.category]));
        // A whole undated table (no search or filters) refreshes the saved copy.
        if (plainQuery && !base.search) {
          const at = nowIso();
          await tx(async () => {
            await run("DELETE FROM legacy_cms_records WHERE category = ?", input.category);
            for (let i = 0; i < res.records.length; i += 200) {
              const chunk = res.records.slice(i, i + 200);
              const args = chunk.flatMap((r) => { const ext = String(r._recordId || r.ID || r.id || uid()); return [uid(), input.category, ext, String(r.Name || r.name || r.Student || r.Parent || ext), JSON.stringify(r), at]; });
              await run(`INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`, ...args);
            }
          });
        }
      }
      methodUsed ??= res.method;
      fetched.push(...res.records);
      if (fetched.length > MAX_ROWS) throw new WorkflowError("VALIDATION", `More than ${MAX_ROWS.toLocaleString()} rows. Narrow the range or the filters.`);
      // Cache the closed days of this span when every row can be placed on its day.
      const byDay = new Map<string, Record<string, string>[]>(daysBetween(span.from, span.until).map((d) => [d, []]));
      let placeable = true;
      for (const r of res.records) {
        const time = rowTime(r);
        if (time === null) {
          placeable = false;
          break;
        }
        const d = addisDay(time);
        const slot = byDay.get(d < span.from ? span.from : d > span.until ? span.until : d)!;
        slot.push(r);
      }
      if (placeable) {
        const headers = res.records.length ? Object.keys(res.records[0]).filter((k) => !k.startsWith("_")) : [];
        for (const [d, rows] of byDay) {
          if (d >= today) continue;
          await run(
            `INSERT INTO cms_range_cache (category, day, filter_key, headers_json, rows_json, row_count, method, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (category, day, filter_key) DO UPDATE SET headers_json = excluded.headers_json, rows_json = excluded.rows_json, row_count = excluded.row_count, method = excluded.method, fetched_at = excluded.fetched_at`,
            input.category,
            d,
            key,
            JSON.stringify(headers),
            JSON.stringify(rows),
            rows.length,
            res.method,
            nowIso(),
          );
        }
      }
    }
    requests = t.requests;
  }

  const records = [...[...cached.values()].flatMap((c) => c.rows), ...fetched];
  records.sort((a, b) => (rowTime(b) ?? 0) - (rowTime(a) ?? 0));
  const headers = [...new Set([...[...cached.values()].flatMap((c) => c.headers), ...(fetched[0] ? Object.keys(fetched[0]).filter((k) => !k.startsWith("_")) : [])])];
  if (!filters.length && cached.size) filters = parseJsonSafe(await getMeta(`cmsFilters.${input.category}`));
  if (filters.length) await setMeta(`cmsFilters.${input.category}`, JSON.stringify(filters));
  // Closed days are kept (they are the stored daily data the dashboard and reports read); nothing is pruned.
  return {
    ok: true,
    category: input.category,
    from: input.from,
    until: input.until,
    method: methodUsed ?? [...cached.values()][0]?.method ?? "noor-filter",
    headers,
    records,
    total: records.length,
    requests,
    cachedDays: cached.size,
    fetchedDays: days.length - cached.size,
    undated: records.filter((r) => rowTime(r) === null).length,
    filters,
    dateFields: dateFields.length ? dateFields : parseJsonAny<CmsDateField[]>(await getMeta(`cmsDateFields.${input.category}`), []),
    dateField: chooseDateField(dateFields.length ? dateFields : parseJsonAny<CmsDateField[]>(await getMeta(`cmsDateFields.${input.category}`), []), input.dateField)?.key ?? null,
    fetchedAt: nowIso(),
  };
}

function parseJsonAny<T>(v: string | null, fallback: T): T {
  try {
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonList(v: string | null): string[] {
  try {
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

function parseJsonSafe(v: string | null): CmsRemoteFilter[] {
  try {
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

// Measures each Noor table once: which filters it has, whether its date filter really narrows rows, whether it
// can sort by a created date, and how big it is. Decides and records the loading path per table.
export async function probeCmsTables(user: AppUser, progress: (m: string) => Promise<void> = async () => {}): Promise<CmsTableCapability[]> {
  const out: CmsTableCapability[] = [];
  const startedAt = Date.now();
  for (const c of LEGACY_CMS_CATEGORIES) {
    try {
      await requireCmsCategories(user, [c.key]);
    } catch {
      continue;
    }
    await progress(`Measuring ${c.label}…`);
    try {
      const t = await new CmsTable(user, c.key, async () => {
        if (cmsStoppedSince(startedAt)) throw new Error("Stopped by user.");
      }).open();
      const filters = remoteFilters(t.html);
      const dateFilter = filters.find((f) => f.kind === "date") ?? null;
      const sortColumn = chooseDateField(tableDateFields(t.html))?.sortBy ?? null;
      const first = await t.first({ search: "" });
      let works: boolean | null = null;
      if (dateFilter) {
        const until = addisDay(Date.now());
        const from = addisDay(Date.now() - 30 * DAY);
        const probe = await viaNoorFilter(t, dateFilter, { search: "" }, from, until, async () => {}).catch(() => null);
        works = !!probe && probe.total <= first.total;
      }
      const method: CmsRangeMethod = dateFilter && works ? "noor-filter" : sortColumn ? "sorted-search" : "full-scan";
      out.push({
        category: c.key,
        dateFilter: dateFilter?.key ?? null,
        dateFilterWorks: works,
        sortColumn,
        selects: filters.filter((f) => f.kind === "select").map((f) => f.key),
        method,
        totalRows: first.total,
        pages: first.pages,
        pageSize: first.pageSize,
        checkedAt: nowIso(),
        note:
          method === "noor-filter"
            ? `Noor filters by ${dateFilter!.label}: about ${1 + Math.ceil(first.total / 30 / t.size)} requests per month of data.`
            : method === "sorted-search"
              ? `No date filter; sorted search on ${sortColumn}: about ${2 * Math.ceil(Math.log2(Math.max(2, first.pages)))} probes plus the pages in range.`
              : `No date filter or date sorting: a range reads all ${first.pages.toLocaleString()} pages.`,
      });
    } catch (e) {
      out.push({ category: c.key, dateFilter: null, dateFilterWorks: null, sortColumn: null, selects: [], method: "full-scan", totalRows: 0, pages: 0, pageSize: 0, checkedAt: nowIso(), note: `Could not measure: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  await setMeta("cmsCapabilities", JSON.stringify(out));
  return out;
}

export async function cmsCapabilities(): Promise<CmsTableCapability[]> {
  try {
    return JSON.parse((await getMeta("cmsCapabilities")) || "[]");
  } catch {
    return [];
  }
}

// Old cache rows (closed days fetched more than 60 days ago) are dropped; they are cheap to fetch again.
export async function pruneCmsRangeCache() {
  await run("DELETE FROM cms_range_cache WHERE fetched_at < ?", new Date(Date.now() - 60 * DAY).toISOString());
}
