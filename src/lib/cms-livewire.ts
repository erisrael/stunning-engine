export type CmsRemoteFilter = {
  key: string;
  label: string;
  // "select" sends one value; "date" sends a from/until pair (Filament date picker fields).
  kind: "select" | "date";
  options: { value: string; label: string }[];
  from?: string;
  until?: string;
};
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const plain = (s: string) => decode(s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const FROM = /(?:^|_)(?:from|start|starts|after|since|min)$/i;
const UNTIL = /(?:^|_)(?:until|to|end|ends|before|max)$/i;

// Livewire 3 sends arrays as [value, {s:"arr"}] tuples.
const unwrap = (v: unknown): unknown => (Array.isArray(v) && v.length === 2 && v[1] && typeof v[1] === "object" && "s" in (v[1] as object) ? unwrap(v[0]) : v);

function tableSnapshot(html: string) {
  return [...html.matchAll(/wire:snapshot="([^"]+)"/g)].map((m) => decode(m[1])).find((s) => Object.hasOwn(JSON.parse(s).data ?? {}, "tableRecordsPerPage"));
}

// Date filters, from the snapshot's tableDeferredFilters (group → fields) and from bindings in the markup
// (wire:model on native inputs, $entangle on Filament's own date picker).
function dateFilters(html: string, selectKeys: Set<string>): CmsRemoteFilter[] {
  const groups = new Map<string, Set<string>>();
  const add = (group: string, field: string) => {
    if (selectKeys.has(`${group}.${field}`) || selectKeys.has(group)) return;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group)!.add(field);
  };
  const snap = tableSnapshot(html);
  if (snap) {
    const filters = unwrap(JSON.parse(snap).data?.tableDeferredFilters);
    if (filters && typeof filters === "object")
      for (const [group, value] of Object.entries(filters as Record<string, unknown>)) {
        const fields = unwrap(value);
        if (fields && typeof fields === "object" && !Array.isArray(fields)) for (const field of Object.keys(fields)) add(group, field);
      }
  }
  for (const m of decode(html).matchAll(/tableDeferredFilters\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/g)) add(m[1], m[2]);
  const out: CmsRemoteFilter[] = [];
  for (const [group, fields] of groups) {
    const list = [...fields];
    const from = list.find((f) => FROM.test(f));
    const until = list.find((f) => UNTIL.test(f));
    if (!from || !until) continue;
    out.push({ key: group, label: group.replace(/[_.]/g, " "), kind: "date", options: [], from: `${group}.${from}`, until: `${group}.${until}` });
  }
  // The created date comes first: it is what a date range means.
  return out.sort((a, b) => Number(/created/i.test(b.key)) - Number(/created/i.test(a.key)));
}

export function remoteFilters(html: string): CmsRemoteFilter[] {
  const filters: CmsRemoteFilter[] = [];
  for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const key = match[1].match(/wire:model(?:\.[\w.]+)?="tableDeferredFilters\.([^"]+)"/)?.[1];
    if (!key) continue;
    filters.push({ key, label: key.replace(/\.value$/, "").replace(/[_.]/g, " "), kind: "select", options: [...match[2].matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)].map(m => ({ value: decode(m[1]), label: plain(m[2]) })) });
  }
  return [...filters, ...dateFilters(html, new Set(filters.map((f) => f.key)))];
}

// Columns the table can sort by (sortTable('created_at') on its header buttons).
export function sortableColumns(html: string): string[] {
  return [...new Set([...decode(html).matchAll(/sortTable\(\s*'([A-Za-z0-9_.]+)'/g)].map((m) => m[1]))];
}

// The column a date range sorts on: created first, then any other date-like sortable column.
export function dateSortColumn(html: string): string | null {
  const cols = sortableColumns(html);
  return cols.find((c) => /^created(_at)?$/i.test(c)) ?? cols.find((c) => /created/i.test(c)) ?? cols.find((c) => /(date|_at)$/i.test(c)) ?? null;
}

export type CmsTableQuery = {
  page: number;
  pageSize: number;
  search: string;
  filters?: Record<string, string>;
  // Date filter key → inclusive YYYY-MM-DD bounds, sent to Noor before paging.
  dates?: Record<string, { from?: string; until?: string }>;
  sort?: { column: string; direction: "asc" | "desc" };
};

// Use the table's signed snapshot and supported Livewire controls, just as its UI does.
export async function queryCmsTable(html: string, baseUrl: string, cookie: string, input: CmsTableQuery) {
  const filters = remoteFilters(html);
  const snapshot = tableSnapshot(html);
  const csrf = html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1];
  const uri = html.match(/data-update-uri="([^"]+)"/)?.[1];
  if (!snapshot || !csrf || !uri) throw new Error("The CMS table session is unavailable. Reconnect Noor CMS.");
  const endpoint = new URL(decode(uri), baseUrl);
  if (endpoint.origin !== new URL(baseUrl).origin) throw new Error("Unexpected CMS update endpoint.");
  const data = JSON.parse(snapshot).data ?? {};
  const updates: Record<string, unknown> = { tableSearch: input.search, tableRecordsPerPage: input.pageSize };
  if (input.dates && Object.keys(input.dates).some((k) => !filters.some((f) => f.kind === "date" && f.key === k))) throw new Error("This CMS table has no such date filter.");
  for (const filter of filters) {
    if (filter.kind === "date") {
      const range = input.dates?.[filter.key];
      for (const [field, value] of [[filter.from!, range?.from], [filter.until!, range?.until]] as const) {
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid ${filter.label} date`);
        updates[`tableDeferredFilters.${field}`] = value || null;
      }
      continue;
    }
    const value = input.filters?.[filter.key] ?? "";
    if (value && !filter.options.some(o => o.value === value)) throw new Error(`Invalid ${filter.label} filter`);
    updates[`tableDeferredFilters.${filter.key}`] = value || null;
  }
  if (input.sort) {
    if (!sortableColumns(html).includes(input.sort.column) || !Object.hasOwn(data, "tableSortColumn")) throw new Error("This CMS table cannot be sorted by that column.");
    updates.tableSortColumn = input.sort.column;
    updates.tableSortDirection = input.sort.direction;
  }
  const calls = [...(filters.length ? [{ path: "", method: "applyTableFilters", params: [] }] : []), { path: "", method: "gotoPage", params: [input.page, "page"] }];
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Livewire": "true", "X-CSRF-TOKEN": decode(csrf), Cookie: cookie }, body: JSON.stringify({ _token: decode(csrf), components: [{ snapshot, updates, calls }] }), signal: AbortSignal.timeout(60_000), redirect: "error", cache: "no-store" });
  if (!response.ok) throw new Error(`CMS table query failed (HTTP ${response.status})`);
  const result = await response.json();
  const component = result.components?.[0];
  if (!component?.effects?.html || component.effects.redirect) throw new Error("CMS returned no table. Reconnect the CMS session.");
  const state = JSON.parse(component.snapshot).data;
  return { html: component.effects.html as string, filters, pageSize: Number(state.tableRecordsPerPage) || input.pageSize };
}

export function cmsPagination(html: string, count: number, page: number, pageSize: number) {
  const match = plain(html).match(/Showing\s+([\d,]+)\s+to\s+([\d,]+)\s+of\s+([\d,]+)\s+results/i);
  const number = (s: string) => Number(s.replace(/,/g, ""));
  return match ? { from: number(match[1]), to: number(match[2]), totalResults: number(match[3]) } : { from: count ? (page - 1) * pageSize + 1 : 0, to: count ? (page - 1) * pageSize + count : 0, totalResults: count };
}

// Mount the remote form first; its signed snapshot and field names remain server-owned.
export async function updateCmsFeedback(baseUrl:string,cookie:string,id:string,status:string,note:string) {
  if(!/^\d+$/.test(id)) throw new Error("Choose a live feedback record.");
  const page=new URL(`/admin/feedback/${id}`,baseUrl);
  const response=await fetch(page,{headers:{Cookie:cookie},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error(`Feedback unavailable (HTTP ${response.status})`);
  const html=await response.text();
  let snapshot=[...html.matchAll(/wire:snapshot="([^"]+)"/g)].map(m=>decode(m[1])).find(s=>JSON.parse(s).memo?.name?.endsWith("ViewFeedback"));
  const csrf=html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1];
  const uri=html.match(/data-update-uri="([^"]+)"/)?.[1];
  if(!snapshot || !csrf || !uri || !html.includes("update_status")) throw new Error("Your Noor account cannot update this feedback.");
  const endpoint=new URL(decode(uri),baseUrl);
  if(endpoint.origin!==page.origin) throw new Error("Unexpected CMS endpoint.");
  const send=async(method:string,params:unknown[],updates:Record<string,unknown>)=>{
    const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","X-Livewire":"true","X-CSRF-TOKEN":decode(csrf),Cookie:cookie},body:JSON.stringify({_token:decode(csrf),components:[{snapshot,updates,calls:[{path:"",method,params}]}]}),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000)});
    if(!r.ok) throw new Error(`Noor feedback update failed (HTTP ${r.status})`);
    const c=(await r.json()).components?.[0];
    if(!c?.snapshot || c.effects?.redirect) throw new Error("Noor did not confirm the feedback action.");
    snapshot=c.snapshot;
    const state=JSON.parse(c.snapshot);
    if(Object.keys(state.memo?.errors || {}).length) throw new Error("Noor rejected the feedback form. Check the status and note.");
    return state.data;
  };
  const mounted=await send("mountAction",["update_status",{}, {recordKey:id}],{});
  if(!JSON.stringify(mounted.mountedActions).includes("admin_note")) throw new Error("The Noor feedback form changed. Open the record in Noor to update it.");
  const saved=await send("callMountedAction",[],{"mountedActions.0.data.status":status,"mountedActions.0.data.admin_note":note.trim().slice(0,5000)});
  if(JSON.stringify(saved.mountedActions).includes("update_status")) throw new Error("Noor kept the form open; the change was not confirmed.");
}
