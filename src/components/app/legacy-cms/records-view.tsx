"use client";
import * as React from "react";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, BookmarkIcon, ChevronLeftIcon, ChevronRightIcon, Columns3Icon, DownloadIcon, FilterIcon, Link2Icon, Loader2Icon, PinIcon, PlusIcon, RotateCcwIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, StatusStrip } from "@/components/app/page-kit";
import { cn } from "@/lib/utils";
import { DATE_PRESETS } from "@/lib/date-presets";
import { CMS_OPS, CMS_QUICK, cmsDefaultOp, cmsOpsFor, emptyGroup, isGroup, opNeedsSecond, opNeedsValue, type CmsColumnsConfig, type CmsCond, type CmsGroup, type CmsRecordsView } from "@/lib/cms-query";
import type { CmsField } from "@/server/cms-fields";
import * as A from "@/app/actions/cms-query";

// Legacy CMS › Records (Update 1.2, Phase 4): the stored Noor rows of any resource, filtered, sorted and paged by the
// database. Quick filters for the fields the spec names, a builder for AND / OR groups of conditions, saved views,
// columns that can be shown, hidden, moved, resized and pinned, export of every matching row, and each record's
// detail with the records it links to.

type Result = Awaited<ReturnType<typeof import("@/server/cms-query").queryCmsRecords>>;
type Detail = Awaited<ReturnType<typeof import("@/server/cms-query").cmsRecordDetail>>;
type View = { id: string; name: string; shared: boolean; mine: boolean; view: CmsRecordsView };
const NO_COLS: CmsColumnsConfig = { order: [], hidden: [], widths: {}, pinned: [] };
const colsKey = (r: string) => `cms-records-columns:${r}`;
const loadCols = (r: string): CmsColumnsConfig => {
  try {
    return { ...NO_COLS, ...JSON.parse(localStorage.getItem(colsKey(r)) ?? "{}") };
  } catch {
    return NO_COLS;
  }
};
// Until the person chooses columns, sensitive fields start hidden (those who may see them can switch them on).
const withDefaults = (c: CmsColumnsConfig, fields: CmsField[]): CmsColumnsConfig =>
  c.order.length || c.hidden.length || c.pinned.length ? c : { ...c, hidden: fields.filter((f) => f.sensitive).map((f) => f.name) };
const saveCols = (r: string, c: CmsColumnsConfig) => {
  try {
    localStorage.setItem(colsKey(r), JSON.stringify(c));
  } catch {}
};

export function CmsRecordsView({ resources }: { resources: { slug: string; label: string; stored: number }[] }) {
  const [resource, setResource] = React.useState(resources.find((r) => r.stored)?.slug ?? resources[0]?.slug ?? "");
  const [builder, setBuilder] = React.useState<CmsGroup>(emptyGroup());
  const [quick, setQuick] = React.useState<Record<string, CmsCond | null>>({});
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<CmsRecordsView["sort"]>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [cols, setCols] = React.useState<CmsColumnsConfig>(NO_COLS);
  const [data, setData] = React.useState<Result | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [views, setViews] = React.useState<View[]>([]);
  const [detail, setDetail] = React.useState<{ resource: string; id: string } | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const filter = React.useMemo<CmsGroup>(() => {
    const items: (CmsCond | CmsGroup)[] = Object.values(quick).filter((x): x is CmsCond => !!x);
    if (builder.items.length) items.push(builder);
    return { join: "and", items };
  }, [quick, builder]);

  React.useEffect(() => {
    if (!resource) return;
    setCols(loadCols(resource));
    setQuick({});
    setBuilder(emptyGroup());
    setSort(null);
    setPage(1);
    void A.cmsViewsAction(resource).then((r) => r.ok && setViews(r.data ?? []));
  }, [resource]);

  const load = React.useCallback(async () => {
    if (!resource) return;
    setLoading(true);
    const r = await A.cmsRecordsAction({ resource, filter, search, sort, page, pageSize });
    setLoading(false);
    if (r.ok) (setData(r.data!), setError(""));
    else setError(r.error);
  }, [resource, filter, search, sort, page, pageSize]);
  React.useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const fields = data?.resource === resource ? data.fields : [];
  const effective = React.useMemo(() => withDefaults(cols, fields), [cols, fields]);
  const shown = React.useMemo(() => {
    const cols = effective;
    const hidden = new Set(cols.hidden);
    const pos = (n: string) => (cols.order.indexOf(n) + 1 || 1e6);
    const list = fields.filter((f) => !hidden.has(f.name)).sort((a, b) => pos(a.name) - pos(b.name) || a.position - b.position);
    const pinned = list.filter((f) => cols.pinned.includes(f.name));
    return [...pinned, ...list.filter((f) => !cols.pinned.includes(f.name))];
  }, [fields, effective]);
  const updateCols = (c: CmsColumnsConfig) => (setCols(c), saveCols(resource, c));

  const applyView = (v: CmsRecordsView) => {
    setBuilder(v.filter ?? emptyGroup());
    setQuick({});
    setSearch(v.search ?? "");
    setSort(v.sort ?? null);
    if (v.columns) updateCols({ ...NO_COLS, ...v.columns });
    setPage(1);
  };
  const reset = () => applyView({ filter: emptyGroup(), search: "", sort: null });
  const saveView = async () => {
    const name = window.prompt("Name this view");
    if (!name) return;
    const r = await A.cmsSaveViewAction(resource, { name, view: { filter, search, sort, columns: effective } });
    if (!r.ok) return void toast.error(r.error);
    setViews(r.data ?? []);
    toast.success("View saved.");
  };
  const exportCsv = async () => {
    setExporting(true);
    const r = await A.cmsExportRecordsAction({ resource, filter, search, sort, columns: effective });
    setExporting(false);
    if (!r.ok) return void toast.error(r.error);
    const url = URL.createObjectURL(new Blob([r.data!.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = r.data!.filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${r.data!.rows.toLocaleString()} rows exported.`);
  };

  if (!resources.length) return <EmptyState title="No Noor table is open to you" description="Admin opens Noor tables in Admin, Noor access." />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={resource} onValueChange={setResource}>
          <SelectTrigger className="h-8 w-56 text-xs" aria-label="Noor resource"><SelectValue /></SelectTrigger>
          <SelectContent>{resources.map((r) => <SelectItem key={r.slug} value={r.slug}>{r.label} ({r.stored.toLocaleString()})</SelectItem>)}</SelectContent>
        </Select>
        <div className="relative min-w-[12rem] flex-1">
          <SearchIcon className="absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search the visible columns" className="h-8 pl-8 text-xs" aria-label="Search records" />
        </div>
        <FilterBuilder fields={fields} group={builder} onChange={(g) => (setBuilder(g), setPage(1))} />
        <ViewsMenu views={views} onApply={applyView} onSave={saveView} onDelete={async (id) => { const r = await A.cmsDeleteViewAction(resource, id); if (r.ok) setViews(r.data ?? []); else toast.error(r.error); }} />
        <ColumnsMenu fields={fields} cols={effective} onChange={updateCols} />
        <Button size="sm" variant="outline" className="h-8" onClick={exportCsv} disabled={exporting || !data?.total}>{exporting ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Export</Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={reset}><RotateCcwIcon /> Reset</Button>
      </div>
      {data && <QuickFilters fields={fields} quick={data.quick} value={quick} onChange={(k, c) => (setQuick((q) => ({ ...q, [k]: c })), setPage(1))} />}
      {error && <StatusStrip tone="danger">{error}</StatusStrip>}
      {data && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {loading && <Loader2Icon className="size-3.5 animate-spin" />}
          <span data-records-total><strong className="text-foreground tabular-nums">{data.total.toLocaleString()}</strong> matching records</span>
          {data.storedAt && <span>· stored copy from {new Date(data.storedAt).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      )}
      {data && !data.fields.length && <EmptyState title="No fields registered for this resource" description="Admin reads its fields in Resources & fields; then its columns can be filtered here." />}
      {data && !!data.fields.length && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-20 bg-muted text-left text-[11px] text-muted-foreground">
                <tr>
                  {shown.map((f, i) => (
                    <HeaderCell key={f.name} f={f} width={cols.widths[f.name]} pinnedLeft={pinnedOffset(shown, effective, i)} sort={sort} onSort={(dir) => (setSort(dir ? { field: f.name, dir } : null), setPage(1))} onResize={(w) => updateCols({ ...cols, widths: { ...cols.widths, [f.name]: w } })} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetail({ resource, id: r.id })} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setDetail({ resource, id: r.id })}>
                    {shown.map((f, i) => {
                      const left = pinnedOffset(shown, effective, i);
                      return (
                        <td key={f.name} className={cn("max-w-[28rem] truncate border-t px-2 py-1.5", left != null && "sticky z-10 bg-card", ["integer", "decimal", "currency"].includes(f.type) && "text-right tabular-nums")} style={{ width: cols.widths[f.name], maxWidth: cols.widths[f.name], left: left ?? undefined }} title={r.values[f.name]}>
                          {r.values[f.name] || <span className="text-muted-foreground/50">-</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.rows.length && <div className="p-6"><EmptyState title="Nothing matches" description="Change or reset the filters." /></div>}
          </div>
          <footer className="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-xs">
            <span className="text-muted-foreground">Page {data.page} of {data.pages}</span>
            <Button size="sm" variant="ghost" className="h-7" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="Previous page"><ChevronLeftIcon /></Button>
            <Button size="sm" variant="ghost" className="h-7" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label="Next page"><ChevronRightIcon /></Button>
            <Select value={String(pageSize)} onValueChange={(v) => (setPageSize(Number(v)), setPage(1))}>
              <SelectTrigger className="ml-auto h-7 w-28 text-xs" aria-label="Rows per page"><SelectValue /></SelectTrigger>
              <SelectContent>{[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n} a page</SelectItem>)}</SelectContent>
            </Select>
          </footer>
        </div>
      )}
      <RecordSheet at={detail} onOpen={setDetail} onClose={() => setDetail(null)} />
    </div>
  );
}

// Pinned columns stay at the left; their offsets add up the widths before them.
function pinnedOffset(shown: CmsField[], cols: CmsColumnsConfig, i: number): number | null {
  if (!cols.pinned.includes(shown[i].name)) return null;
  let x = 0;
  for (let j = 0; j < i; j++) x += cols.widths[shown[j].name] ?? 160;
  return x;
}

function HeaderCell({ f, width, pinnedLeft, sort, onSort, onResize }: { f: CmsField; width?: number; pinnedLeft: number | null; sort: CmsRecordsView["sort"]; onSort: (dir: "asc" | "desc" | null) => void; onResize: (w: number) => void }) {
  const ref = React.useRef<HTMLTableCellElement>(null);
  const dir = sort?.field === f.name ? sort.dir : null;
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const start = e.clientX;
    const w0 = ref.current?.offsetWidth ?? 160;
    const move = (ev: PointerEvent) => ref.current && (ref.current.style.width = `${Math.max(60, w0 + ev.clientX - start)}px`);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onResize(Math.max(60, Math.round(w0 + ev.clientX - start)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <th ref={ref} className={cn("relative whitespace-nowrap border-b px-2 py-1.5 font-medium", pinnedLeft != null && "sticky z-30 bg-muted")} style={{ width: width ?? 160, minWidth: width ?? 160, left: pinnedLeft ?? undefined }} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}>
      <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => onSort(dir === null ? "asc" : dir === "asc" ? "desc" : null)}>
        {f.label}
        {dir === "asc" && <ArrowUpIcon className="size-3" />}
        {dir === "desc" && <ArrowDownIcon className="size-3" />}
      </button>
      <span role="separator" aria-orientation="vertical" aria-label={`Resize ${f.label}`} onPointerDown={startResize} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40" />
    </th>
  );
}

function QuickFilters({ fields, quick, value, onChange }: { fields: CmsField[]; quick: Partial<Record<string, string>>; value: Record<string, CmsCond | null>; onChange: (k: string, c: CmsCond | null) => void }) {
  const field = (k: string) => fields.find((f) => f.name === quick[k]);
  const present = CMS_QUICK.filter(([k]) => field(k));
  if (!present.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Quick filters">
      {present.map(([k, label]) => {
        const f = field(k)!;
        const cur = value[k];
        if (["date", "datetime"].includes(f.type))
          return (
            <Select key={k} value={cur ? String(cur.value) : "all"} onValueChange={(v) => onChange(k, v === "all" ? null : { field: f.name, op: "preset", value: v })}>
              <SelectTrigger className="h-7 w-auto gap-1 text-xs" aria-label={`${label} date`}><span className="text-muted-foreground">{label}:</span> <SelectValue /></SelectTrigger>
              <SelectContent>{DATE_PRESETS.filter(([p]) => p !== "custom").map(([p, l]) => <SelectItem key={p} value={p}>{l}</SelectItem>)}</SelectContent>
            </Select>
          );
        if (["integer", "decimal", "currency"].includes(f.type))
          return (
            <span key={k} className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">{label}</span>
              <Input className="h-7 w-20 text-xs" inputMode="decimal" placeholder="from" aria-label={`${label} from`} defaultValue={cur?.op === "between" || cur?.op === "gte" ? String(cur.value ?? "") : ""} onBlur={(e) => onRange(k, f, e.target.value, (e.target.nextElementSibling as HTMLInputElement)?.value, onChange)} />
              <Input className="h-7 w-20 text-xs" inputMode="decimal" placeholder="to" aria-label={`${label} to`} onBlur={(e) => onRange(k, f, (e.target.previousElementSibling as HTMLInputElement)?.value, e.target.value, onChange)} />
            </span>
          );
        if (f.options?.length)
          return (
            <Select key={k} value={cur ? String((cur.value as string[])[0]) : "__all"} onValueChange={(v) => onChange(k, v === "__all" ? null : { field: f.name, op: "in", value: [v] })}>
              <SelectTrigger className="h-7 w-auto gap-1 text-xs" aria-label={label}><span className="text-muted-foreground">{label}:</span> <SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Any</SelectItem>
                {f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          );
        return <Input key={k} className="h-7 w-36 text-xs" placeholder={label} aria-label={label} defaultValue={cur ? String(cur.value ?? "") : ""} onBlur={(e) => onChange(k, e.target.value.trim() ? { field: f.name, op: "contains", value: e.target.value.trim() } : null)} />;
      })}
    </div>
  );
}
function onRange(k: string, f: CmsField, a: string | undefined, b: string | undefined, onChange: (k: string, c: CmsCond | null) => void) {
  const x = a?.trim() ? Number(a) : null;
  const y = b?.trim() ? Number(b) : null;
  if (x != null && y != null) onChange(k, { field: f.name, op: "between", value: x, value2: y });
  else if (x != null) onChange(k, { field: f.name, op: "gte", value: x });
  else if (y != null) onChange(k, { field: f.name, op: "lte", value: y });
  else onChange(k, null);
}

function FilterBuilder({ fields, group, onChange }: { fields: CmsField[]; group: CmsGroup; onChange: (g: CmsGroup) => void }) {
  const [draft, setDraft] = React.useState(group);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => void (open && setDraft(group)), [open, group]);
  const count = (g: CmsGroup): number => g.items.reduce((n, x) => n + (isGroup(x) ? count(x) : 1), 0);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={group.items.length ? "default" : "outline"} className="h-8" disabled={!fields.length}><FilterIcon /> Filters{group.items.length ? ` (${count(group)})` : ""}</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(44rem,calc(100vw-2rem))] space-y-3">
        <GroupEditor fields={fields} group={draft} onChange={setDraft} depth={0} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDraft(emptyGroup())}>Clear</Button>
          <Button size="sm" onClick={() => (onChange(draft), setOpen(false))}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupEditor({ fields, group, onChange, depth, onRemove }: { fields: CmsField[]; group: CmsGroup; onChange: (g: CmsGroup) => void; depth: number; onRemove?: () => void }) {
  const set = (i: number, x: CmsCond | CmsGroup) => onChange({ ...group, items: group.items.map((y, j) => (j === i ? x : y)) });
  const drop = (i: number) => onChange({ ...group, items: group.items.filter((_, j) => j !== i) });
  const first = fields[0];
  return (
    <div className={cn("space-y-2", depth > 0 && "rounded-lg border border-dashed p-2")}>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Match</span>
        <Select value={group.join} onValueChange={(v) => onChange({ ...group, join: v as "and" | "or" })}>
          <SelectTrigger className="h-7 w-36 text-xs" aria-label="Join"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="and">all (AND)</SelectItem><SelectItem value="or">any (OR)</SelectItem></SelectContent>
        </Select>
        {onRemove && <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={onRemove} aria-label="Remove group"><XIcon /></Button>}
      </div>
      {group.items.map((x, i) => (isGroup(x) ? <GroupEditor key={i} fields={fields} group={x} onChange={(g) => set(i, g)} depth={depth + 1} onRemove={() => drop(i)} /> : <CondEditor key={i} fields={fields} cond={x} onChange={(c) => set(i, c)} onRemove={() => drop(i)} />))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!first} onClick={() => onChange({ ...group, items: [...group.items, { field: first.name, op: cmsDefaultOp(first.type), value: "" }] })}><PlusIcon /> Condition</Button>
        {depth < 3 && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange({ ...group, items: [...group.items, { join: group.join === "and" ? "or" : "and", items: [] }] })}><PlusIcon /> Group</Button>}
      </div>
    </div>
  );
}

function CondEditor({ fields, cond, onChange, onRemove }: { fields: CmsField[]; cond: CmsCond; onChange: (c: CmsCond) => void; onRemove: () => void }) {
  const f = fields.find((x) => x.name === cond.field) ?? fields[0];
  const ops = cmsOpsFor(f.type);
  const num = ["integer", "decimal", "currency"].includes(f.type);
  const date = ["date", "datetime"].includes(f.type);
  const value = (v: string, second = false) => onChange({ ...cond, [second ? "value2" : "value"]: num && v !== "" ? Number(v) : v });
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-cms-condition>
      <Select value={f.name} onValueChange={(name) => { const nf = fields.find((x) => x.name === name)!; onChange({ field: name, op: cmsDefaultOp(nf.type), value: "" }); }}>
        <SelectTrigger className="h-7 w-40 text-xs" aria-label="Field"><SelectValue /></SelectTrigger>
        <SelectContent>{fields.map((x) => <SelectItem key={x.name} value={x.name}>{x.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={ops.includes(cond.op) ? cond.op : ops[0]} onValueChange={(op) => onChange({ ...cond, op, value: op === "in" || op === "not_in" ? [] : op === "preset" ? "7days" : "" })}>
        <SelectTrigger className="h-7 w-36 text-xs" aria-label="Operator"><SelectValue /></SelectTrigger>
        <SelectContent>{ops.map((o) => <SelectItem key={o} value={o}>{CMS_OPS[o]}</SelectItem>)}</SelectContent>
      </Select>
      {opNeedsValue(cond.op) && (cond.op === "preset" ? (
        <Select value={String(cond.value || "7days")} onValueChange={(v) => onChange({ ...cond, value: v })}>
          <SelectTrigger className="h-7 w-36 text-xs" aria-label="Range"><SelectValue /></SelectTrigger>
          <SelectContent>{DATE_PRESETS.filter(([p]) => p !== "custom").map(([p, l]) => <SelectItem key={p} value={p}>{l}</SelectItem>)}</SelectContent>
        </Select>
      ) : (cond.op === "in" || cond.op === "not_in") && f.options?.length ? (
        <Popover>
          <PopoverTrigger asChild><Button size="sm" variant="outline" className="h-7 text-xs">{(cond.value as string[] | undefined)?.length ? (cond.value as string[]).join(", ").slice(0, 30) : "Choose"}</Button></PopoverTrigger>
          <PopoverContent className="w-56 space-y-1">
            {f.options.map((o) => {
              const list = (Array.isArray(cond.value) ? cond.value : []) as string[];
              return <label key={o} className="flex items-center gap-2 text-xs"><Checkbox checked={list.includes(o)} onCheckedChange={(v) => onChange({ ...cond, value: v ? [...list, o] : list.filter((x) => x !== o) })} />{o}</label>;
            })}
          </PopoverContent>
        </Popover>
      ) : (
        <Input className="h-7 w-36 text-xs" type={date ? "date" : num ? "number" : "text"} value={Array.isArray(cond.value) ? cond.value.join(", ") : String(cond.value ?? "")} onChange={(e) => (cond.op === "in" || cond.op === "not_in" ? onChange({ ...cond, value: e.target.value.split(",").map((s) => s.trim()) }) : value(e.target.value))} aria-label="Value" placeholder={cond.op === "in" || cond.op === "not_in" ? "a, b, c" : "value"} />
      ))}
      {opNeedsSecond(cond.op) && <Input className="h-7 w-36 text-xs" type={date ? "date" : "number"} value={String(cond.value2 ?? "")} onChange={(e) => value(e.target.value, true)} aria-label="And" />}
      <Button size="sm" variant="ghost" className="h-7" onClick={onRemove} aria-label="Remove condition"><Trash2Icon /></Button>
    </div>
  );
}

function ViewsMenu({ views, onApply, onSave, onDelete }: { views: View[]; onApply: (v: CmsRecordsView) => void; onSave: () => void; onDelete: (id: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild><Button size="sm" variant="outline" className="h-8"><BookmarkIcon /> Views{views.length ? ` (${views.length})` : ""}</Button></PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-1">
        {!views.length && <p className="text-xs text-muted-foreground">No saved views yet.</p>}
        {views.map((v) => (
          <div key={v.id} className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 flex-1 justify-start text-xs" onClick={() => onApply(v.view)}>{v.name}{v.shared && <Badge variant="outline" className="ml-1 text-[9px]">shared</Badge>}</Button>
            {v.mine && <Button size="sm" variant="ghost" className="h-7" onClick={() => onDelete(v.id)} aria-label={`Remove ${v.name}`}><Trash2Icon /></Button>}
          </div>
        ))}
        <Button size="sm" className="mt-1 h-7 w-full text-xs" onClick={onSave}><PlusIcon /> Save the current view</Button>
      </PopoverContent>
    </Popover>
  );
}

function ColumnsMenu({ fields, cols, onChange }: { fields: CmsField[]; cols: CmsColumnsConfig; onChange: (c: CmsColumnsConfig) => void }) {
  const pos = (n: string) => (cols.order.indexOf(n) + 1 || 1e6);
  const list = [...fields].sort((a, b) => pos(a.name) - pos(b.name) || a.position - b.position);
  const move = (i: number, d: number) => {
    const names = list.map((f) => f.name);
    const j = i + d;
    if (j < 0 || j >= names.length) return;
    [names[i], names[j]] = [names[j], names[i]];
    onChange({ ...cols, order: names });
  };
  const toggle = (key: "hidden" | "pinned", n: string) => onChange({ ...cols, [key]: cols[key].includes(n) ? cols[key].filter((x) => x !== n) : [...cols[key], n] });
  return (
    <Popover>
      <PopoverTrigger asChild><Button size="sm" variant="outline" className="h-8" disabled={!fields.length}><Columns3Icon /> Columns</Button></PopoverTrigger>
      <PopoverContent align="start" className="max-h-[60vh] w-72 space-y-0.5 overflow-y-auto">
        {list.map((f, i) => (
          <div key={f.name} className="flex items-center gap-1 text-xs">
            <Checkbox checked={!cols.hidden.includes(f.name)} onCheckedChange={() => toggle("hidden", f.name)} aria-label={`Show ${f.label}`} />
            <span className="flex-1 truncate">{f.label}</span>
            <Button size="sm" variant="ghost" className={cn("size-6 p-0", cols.pinned.includes(f.name) && "text-primary")} onClick={() => toggle("pinned", f.name)} aria-label={`Pin ${f.label}`} aria-pressed={cols.pinned.includes(f.name)}><PinIcon className="size-3" /></Button>
            <Button size="sm" variant="ghost" className="size-6 p-0" onClick={() => move(i, -1)} aria-label={`Move ${f.label} up`}><ArrowUpIcon className="size-3" /></Button>
            <Button size="sm" variant="ghost" className="size-6 p-0" onClick={() => move(i, 1)} aria-label={`Move ${f.label} down`}><ArrowDownIcon className="size-3" /></Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="mt-1 h-7 w-full text-xs" onClick={() => onChange(NO_COLS)}><RotateCcwIcon /> Default columns</Button>
      </PopoverContent>
    </Popover>
  );
}

function RecordSheet({ at, onOpen, onClose }: { at: { resource: string; id: string } | null; onOpen: (x: { resource: string; id: string }) => void; onClose: () => void }) {
  const [d, setD] = React.useState<Detail | null>(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    setD(null);
    setErr("");
    if (at) void A.cmsRecordDetailAction(at.resource, at.id).then((r) => (r.ok ? setD(r.data!) : setErr(r.error)));
  }, [at]);
  return (
    <Sheet open={!!at} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{d?.title ?? "Record"}</SheetTitle>
          <SheetDescription>{d ? `Noor id ${d.externalId ?? "-"} · stored ${new Date(d.syncedAt).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" })}` : "Loading…"}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {err && <StatusStrip tone="danger">{err}</StatusStrip>}
          {!d && !err && <StatusStrip><Loader2Icon className="size-3.5 animate-spin" /> Loading…</StatusStrip>}
          {d && (
            <>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                {[...d.fields, ...d.extra.map((x) => ({ name: x.label, label: x.label, type: "string", value: x.value }))].map((f) => (
                  <div key={f.name} className="min-w-0"><dt className="text-muted-foreground">{f.label}</dt><dd className="break-words font-medium">{f.value || "-"}</dd></div>
                ))}
              </dl>
              <section className="space-y-2">
                <h3 className="flex items-center gap-1 text-sm font-semibold"><Link2Icon className="size-4" /> Related records</h3>
                {!d.related.length && <p className="text-xs text-muted-foreground">No stored record links to this one.</p>}
                {d.related.map((g) => (
                  <div key={`${g.resource}-${g.via}`} className="space-y-1">
                    <p className="text-xs text-muted-foreground">{g.label} · {g.via}</p>
                    <div className="flex flex-wrap gap-1">{g.records.map((x) => <Button key={x.id} size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen({ resource: g.resource, id: x.id })}>{x.title ?? x.id}</Button>)}</div>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
