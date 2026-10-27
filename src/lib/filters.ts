// Shared filter model. Filters live in the URL so they persist across Table, Sheet, Board,
// Calendar and Report views and can be shared as links.

export type Filters = {
  g: string[]; // grade ids
  s: string[]; // subject ids
  u: string[]; // unit ids
  stage: string[]; // recording | editing | uploading | publication | draft | published
  status: string[]; // attempt statuses
  owner: string[]; // user ids, "me", "unassigned"
  pri: string[];
  lang: string[];
  ctype: string[];
  dtype: string[];
  cx: string[];
  prov: string[];
  platform: string[];
  tag: string;
  teacher: string;
  q: string;
  life: string[]; // lifecycle; default excludes archived/cancelled
  flags: string[]; // overdue | blocked | unassigned | waiting | missing | rework | stale
  dateField: string; // due | created | started | completed | published | planned
  from: string;
  to: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  size: number;
};

export const MULTI_KEYS = ["g", "s", "u", "stage", "status", "owner", "pri", "lang", "ctype", "dtype", "cx", "prov", "platform", "life", "flags"] as const;
const SINGLE_KEYS = ["tag", "teacher", "q", "dateField", "from", "to", "sort"] as const;

export const FILTER_FLAG_LABELS: Record<string, string> = {
  overdue: "Overdue",
  blocked: "Blocked",
  unassigned: "Unassigned",
  waiting: "Submitted, not accepted",
  missing: "Missing required assets",
  rework: "Has rework",
  stale: "Stale timer",
};

export const DATE_FIELD_LABELS: Record<string, string> = {
  due: "Current due date",
  original_due: "Original due date",
  created: "Created",
  released: "Released to production",
  completed: "Stage completed",
  published: "Published",
  planned: "Planned publication",
  updated: "Last updated",
};

export function emptyFilters(): Filters {
  return {
    g: [],
    s: [],
    u: [],
    stage: [],
    status: [],
    owner: [],
    pri: [],
    lang: [],
    ctype: [],
    dtype: [],
    cx: [],
    prov: [],
    platform: [],
    tag: "",
    teacher: "",
    q: "",
    life: [],
    flags: [],
    dateField: "due",
    from: "",
    to: "",
    sort: "updated",
    dir: "desc",
    page: 1,
    size: 50,
  };
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(src: ParamSource, key: string): string | undefined {
  if (src instanceof URLSearchParams) return src.get(key) ?? undefined;
  const v = src[key];
  return Array.isArray(v) ? v.join(",") : v;
}

export function parseFilters(src: ParamSource): Filters {
  const f = emptyFilters();
  for (const k of MULTI_KEYS) {
    const v = read(src, k);
    if (v) (f[k] as string[]) = v.split(",").map((x) => x.trim()).filter(Boolean);
  }
  for (const k of SINGLE_KEYS) {
    const v = read(src, k);
    if (v) (f as Record<string, unknown>)[k] = v;
  }
  const dir = read(src, "dir");
  if (dir === "asc" || dir === "desc") f.dir = dir;
  const page = Number(read(src, "page"));
  if (page > 0) f.page = Math.floor(page);
  const size = Number(read(src, "size"));
  if ([25, 50, 100, 200, 500].includes(size)) f.size = size;
  return f;
}

export function filtersToParams(f: Partial<Filters>, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  const d = emptyFilters();
  for (const [k, v] of Object.entries(f)) {
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(","));
      else p.delete(k);
    } else if (v === "" || v === undefined || v === null || v === (d as Record<string, unknown>)[k]) p.delete(k);
    else p.set(k, String(v));
  }
  return p;
}

// Keys that represent filtering (not sorting or paging). Used for active chips and reset.
export const FILTER_KEYS = [...MULTI_KEYS, "tag", "teacher", "q", "from", "to", "dateField"] as const;

export function activeFilterCount(f: Filters) {
  let n = 0;
  for (const k of MULTI_KEYS) if ((f[k] as string[]).length) n++;
  if (f.tag) n++;
  if (f.teacher) n++;
  if (f.q) n++;
  if (f.from || f.to) n++;
  return n;
}

export function scopeQueryString(searchParams: URLSearchParams | string) {
  // Preserves only filter keys when switching between views.
  const src = typeof searchParams === "string" ? new URLSearchParams(searchParams) : searchParams;
  const out = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = src.get(k);
    if (v) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}
