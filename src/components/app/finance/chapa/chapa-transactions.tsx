"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon, BookmarkIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsUpDownIcon, Columns3Icon, DownloadIcon, FilterIcon, Loader2Icon, RefreshCwIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, StatusStrip, ViewSwitcher } from "@/components/app/page-kit";
import { MetricCard } from "@/components/app/primitives";
import { cn } from "@/lib/utils";
import { CHAPA_METHODS, CHAPA_STATUSES, CHAPA_STATUS_LABEL, CHAPA_TYPES, chapaMethodLabel, chapaTypeLabel, type ChapaStatus, type ChapaTx } from "@/lib/chapa";
import { DATE_PRESETS, datePresetLabel, datePresetRange, isDatePreset, type DatePreset } from "@/lib/date-presets";
import type { ChapaBusiness, TxPageInput, TxSort, TxSummary } from "@/server/chapa-hub";
import * as A from "@/app/actions/chapa-hub";
import { StatusPill, TxDrawer, money } from "./chapa-hub";

// Finance › Chapa › Transactions (Update 1.2). Everything on the screen reads one filter: the summary cards, the
// table, its paging and sorting (all done by the database, so the numbers are of every matching payment, not of
// the rows on screen), and the export. Filters can be saved; columns are chosen per person.

type Page = Awaited<ReturnType<typeof import("@/server/chapa-hub").chapaTxPage>>;
type View = { id: string; name: string; filter: Record<string, unknown>; shared: boolean; mine: boolean };
type Filter = { preset: DatePreset; from: string; until: string; fromTime: string; untilTime: string; q: string; status: string[]; type: string[]; method: string[]; currency: string; customer: string; ref: string };
const EMPTY: Filter = { preset: "7days", from: "", until: "", fromTime: "", untilTime: "", q: "", status: [], type: [], method: [], currency: "", customer: "", ref: "" };

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }) : "");
const dash = <span className="text-muted-foreground">-</span>;

type Col = { key: string; label: string; sort?: TxSort; right?: boolean; on: boolean; cell: (t: ChapaTx) => React.ReactNode };
const COLUMNS: Col[] = [
  { key: "status", label: "Status", sort: "status", on: true, cell: (t) => <StatusPill s={t.status} /> },
  { key: "customer", label: "Customer", sort: "customer", on: true, cell: (t) => <span className="font-medium">{t.customer}</span> },
  { key: "phone", label: "Phone", on: true, cell: (t) => t.phone ?? dash },
  { key: "email", label: "Email", on: false, cell: (t) => t.email ?? dash },
  { key: "amount", label: "Amount", sort: "amount", right: true, on: true, cell: (t) => <span className="tabular-nums">{t.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> },
  { key: "currency", label: "Currency", on: true, cell: (t) => t.currency },
  { key: "fee", label: "Fee", right: true, on: false, cell: (t) => <span className="tabular-nums">{t.charge.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> },
  { key: "method", label: "Payment method", sort: "method", on: true, cell: (t) => chapaMethodLabel(t.method) },
  { key: "source", label: "Source", on: false, cell: (t) => chapaTypeLabel(t.type ?? "") },
  { key: "ref", label: "Reference", sort: "reference", on: true, cell: (t) => <span className="font-mono text-[11px]">{t.txRef}</span> },
  { key: "id", label: "Chapa ID", on: false, cell: (t) => (t.refId ? <span className="font-mono text-[11px]">{t.refId}</span> : dash) },
  { key: "business", label: "Business", on: false, cell: (t) => t.business },
  { key: "created", label: "Created", sort: "created", on: true, cell: (t) => <span className="whitespace-nowrap">{when(t.createdAt)}{t.undated && <span title="Chapa gave no date: filed under the day it was read" className="ml-1 text-amber-600">*</span>}</span> },
  { key: "updated", label: "Updated", sort: "updated", on: false, cell: (t) => <span className="whitespace-nowrap">{when(t.providerUpdatedAt ?? t.updatedAt) || dash}</span> },
  { key: "verified", label: "Verified", sort: "verified", on: false, cell: (t) => <span className="whitespace-nowrap">{when(t.verifiedAt) || dash}</span> },
  { key: "callback", label: "Callback", on: true, cell: (t) => (t.lastWebhookAt ? <span className="whitespace-nowrap text-emerald-700 dark:text-emerald-300">Received {when(t.lastWebhookAt)}</span> : <span className="text-muted-foreground">None</span>) },
];
const DEFAULT_COLS = COLUMNS.filter((c) => c.on).map((c) => c.key);
const COLS_KEY = "myseed.chapa.tx.columns";

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: readonly (readonly [T, string])[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      {options.map(([k, l]) => {
        const on = value.includes(k);
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])} className={cn("rounded-full border px-2.5 py-0.5 text-[11px] transition-colors", on ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function TransactionsView({ biz, businesses, canExport, admin }: { biz: string | null; businesses: ChapaBusiness[]; canExport: boolean; admin: boolean }) {
  const [f, setF] = React.useState<Filter>(EMPTY);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [sort, setSort] = React.useState<{ by: TxSort; dir: "asc" | "desc" }>({ by: "created", dir: "desc" });
  const [panel, setPanel] = React.useState(false);
  const [cols, setCols] = React.useState<string[]>(DEFAULT_COLS);
  const [data, setData] = React.useState<Page | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState<ChapaTx | null>(null);
  const [views, setViews] = React.useState<View[]>([]);
  const [currency, setCurrency] = React.useState("");
  const [tick, setTick] = React.useState(0);
  const multi = !biz && businesses.length > 1;

  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLS_KEY) ?? "null");
      if (Array.isArray(saved) && saved.length) setCols(saved.filter((k) => COLUMNS.some((c) => c.key === k)));
    } catch {}
    void A.chapaTxViewsAction().then((r) => r.ok && setViews((r.data ?? []) as View[]));
  }, []);
  const saveCols = (next: string[]) => {
    setCols(next);
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(next));
    } catch {}
  };

  const range = datePresetRange(f.preset, f.from, f.until);
  const query: TxPageInput = React.useMemo(
    () => ({
      biz, q: f.q || undefined, status: f.status, type: f.type, method: f.method, currency: f.currency || undefined, customer: f.customer || undefined, ref: f.ref || undefined,
      from: range.from ?? undefined, until: range.until ?? undefined, fromTime: f.preset === "custom" ? f.fromTime || undefined : undefined, untilTime: f.preset === "custom" ? f.untilTime || undefined : undefined,
      page, pageSize, sort: sort.by, dir: sort.dir,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [biz, JSON.stringify(f), range.from, range.until, page, pageSize, sort.by, sort.dir],
  );
  React.useEffect(() => {
    let live = true;
    setLoading(true);
    void A.chapaTxPageAction(query).then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok && r.data) (setData(r.data), setError(""));
      else setError(r.ok ? "Could not load the transactions." : r.error);
    });
    return () => void (live = false);
  }, [query, tick]);

  // Any change to the filter goes back to the first page.
  const change = (p: Partial<Filter>) => (setF((x) => ({ ...x, ...p })), setPage(1));
  const reset = () => (setF(EMPTY), setSearch(""), setPage(1));
  const active = f.status.length + f.type.length + f.method.length + (f.currency ? 1 : 0) + (f.customer ? 1 : 0) + (f.ref ? 1 : 0);
  const exportQs = (() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ biz: biz ?? "", q: f.q, status: f.status.join(","), type: f.type.join(","), method: f.method.join(","), currency: f.currency, customer: f.customer, ref: f.ref, from: range.from ?? "", until: range.until ?? "", fromTime: query.fromTime ?? "", untilTime: query.untilTime ?? "" })) if (v) p.set(k, v);
    return p.toString();
  })();

  const summary = data?.summary ?? [];
  const cur = summary.find((s) => s.currency === currency) ?? summary[0] ?? null;
  // With every business on screen, the Business column is always shown.
  const visible = COLUMNS.filter((c) => cols.includes(c.key) || (c.key === "business" && multi));
  const first = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  const applyView = (v: View) => {
    const x = v.filter as Partial<Filter>;
    setF({ ...EMPTY, ...x, preset: isDatePreset(x.preset) ? x.preset : EMPTY.preset, status: x.status ?? [], type: x.type ?? [], method: x.method ?? [] });
    setSearch(typeof x.q === "string" ? x.q : "");
    setPage(1);
    toast.success(`Filter "${v.name}" applied`);
  };
  const saveView = async (shared: boolean) => {
    const name = window.prompt(shared ? "Name this filter (everyone will see it)" : "Name this filter");
    if (!name?.trim()) return;
    const r = await A.chapaSaveTxViewAction({ name, filter: f, shared });
    if (!r.ok) return void toast.error(r.error);
    setViews((r.data ?? []) as View[]);
    toast.success("Filter saved");
  };

  return (
    <div className="space-y-3" data-chapa-transactions>
      {/* Range, search and the tools */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2" role="toolbar" aria-label="Transactions filters">
        <select aria-label="Date range" value={f.preset} onChange={(e) => change({ preset: e.target.value as DatePreset })} className="h-8 rounded-md border bg-background px-2 text-xs font-medium">
          {DATE_PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {f.preset === "custom" ? (
          <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Input type="date" aria-label="Start date" value={f.from} onChange={(e) => change({ from: e.target.value })} className="h-8 w-[9.25rem] text-xs" />
            <Input type="time" aria-label="Start time" value={f.fromTime} onChange={(e) => change({ fromTime: e.target.value })} className="h-8 w-[6.5rem] text-xs" />
            to
            <Input type="date" aria-label="End date" value={f.until} onChange={(e) => change({ until: e.target.value })} className="h-8 w-[9.25rem] text-xs" />
            <Input type="time" aria-label="End time" value={f.untilTime} onChange={(e) => change({ untilTime: e.target.value })} className="h-8 w-[6.5rem] text-xs" />
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" data-range>{range.from ? (range.from === range.until ? range.from : `${range.from} to ${range.until}`) : "Every payment stored"}</span>
        )}
        <form className="relative min-w-[14rem] flex-1" onSubmit={(e) => (e.preventDefault(), change({ q: search.trim() }))}>
          <SearchIcon className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => search.trim() !== f.q && change({ q: search.trim() })} placeholder="Search reference, amount, email, phone or name" className="h-8 pl-8 text-xs" aria-label="Search transactions" />
        </form>
        <Button size="sm" variant={panel || active ? "secondary" : "outline"} className="h-8 text-xs" aria-expanded={panel} onClick={() => setPanel(!panel)}>
          <FilterIcon /> Filters{active ? <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{active}</span> : null}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="h-8 text-xs"><BookmarkIcon /> Saved</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Saved filters</DropdownMenuLabel>
            {!views.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">None yet. Set the filters, then save them here.</p>}
            {views.map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => applyView(v)} className="flex justify-between gap-2">
                <span className="truncate">{v.name}{v.shared && <span className="ml-1 text-[10px] text-muted-foreground">shared</span>}</span>
                {v.mine && (
                  <button type="button" aria-label={`Delete ${v.name}`} className="text-muted-foreground hover:text-destructive" onClick={async (e) => { e.stopPropagation(); e.preventDefault(); const r = await A.chapaDeleteTxViewAction(v.id); if (r.ok) setViews((r.data ?? []) as View[]); else toast.error(r.error); }}>
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void saveView(false)}>Save the current filters…</DropdownMenuItem>
            {admin && <DropdownMenuItem onSelect={() => void saveView(true)}>Save and share with everyone…</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="h-8 text-xs"><Columns3Icon /> Columns</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            {COLUMNS.map((c) => (
              <DropdownMenuCheckboxItem key={c.key} checked={cols.includes(c.key)} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => saveCols(v ? COLUMNS.filter((x) => cols.includes(x.key) || x.key === c.key).map((x) => x.key) : cols.length > 1 ? cols.filter((k) => k !== c.key) : cols)}>
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => saveCols(DEFAULT_COLS)}>Back to the default</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {canExport && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="h-8 text-xs"><DownloadIcon /> Export</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{data ? `All ${data.total.toLocaleString()} matching payments` : "All matching payments"}</DropdownMenuLabel>
              <DropdownMenuItem asChild><a href={`/api/finance/chapa/export?format=xlsx&${exportQs}`}>Excel</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href={`/api/finance/chapa/export?format=csv&${exportQs}`}>CSV</a></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button size="sm" variant="ghost" className="h-8 text-xs" aria-label="Refresh" onClick={() => setTick((t) => t + 1)}><RefreshCwIcon className={cn(loading && "animate-spin")} /></Button>
      </div>

      {panel && (
        <div className="space-y-2 rounded-xl border bg-card p-3" data-filter-panel>
          <Chips label="Status" options={CHAPA_STATUSES} value={f.status} onChange={(v) => change({ status: v })} />
          <Chips label="Method" options={CHAPA_METHODS.map((m) => [m, chapaMethodLabel(m)] as const)} value={f.method} onChange={(v) => change({ method: v })} />
          <Chips label="Source" options={CHAPA_TYPES} value={f.type} onChange={(v) => change({ type: v })} />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">More</span>
            <select aria-label="Currency" value={f.currency} onChange={(e) => change({ currency: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-xs">
              <option value="">Any currency</option>
              <option value="ETB">ETB</option>
              <option value="USD">USD</option>
            </select>
            <Input aria-label="Customer" placeholder="Customer name, email or phone" defaultValue={f.customer} key={`c-${f.customer}`} onBlur={(e) => e.target.value.trim() !== f.customer && change({ customer: e.target.value.trim() })} onKeyDown={(e) => e.key === "Enter" && change({ customer: e.currentTarget.value.trim() })} className="h-8 w-60 text-xs" />
            <Input aria-label="Transaction reference" placeholder="Transaction reference" defaultValue={f.ref} key={`r-${f.ref}`} onBlur={(e) => e.target.value.trim() !== f.ref && change({ ref: e.target.value.trim() })} onKeyDown={(e) => e.key === "Enter" && change({ ref: e.currentTarget.value.trim() })} className="h-8 w-52 text-xs" />
          </div>
        </div>
      )}

      {(active > 0 || f.q) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="Active filters">
          {f.q && <Chip onRemove={() => (setSearch(""), change({ q: "" }))}>Search: {f.q}</Chip>}
          {f.status.map((s) => <Chip key={s} onRemove={() => change({ status: f.status.filter((x) => x !== s) })}>{CHAPA_STATUS_LABEL[s as ChapaStatus] ?? s}</Chip>)}
          {f.method.map((s) => <Chip key={s} onRemove={() => change({ method: f.method.filter((x) => x !== s) })}>{chapaMethodLabel(s)}</Chip>)}
          {f.type.map((s) => <Chip key={s} onRemove={() => change({ type: f.type.filter((x) => x !== s) })}>{chapaTypeLabel(s)}</Chip>)}
          {f.currency && <Chip onRemove={() => change({ currency: "" })}>{f.currency}</Chip>}
          {f.customer && <Chip onRemove={() => change({ customer: "" })}>Customer: {f.customer}</Chip>}
          {f.ref && <Chip onRemove={() => change({ ref: "" })}>Reference: {f.ref}</Chip>}
          <button type="button" className="text-primary hover:underline" onClick={reset}>Reset all</button>
        </div>
      )}

      {data?.partial.map((p) => (
        <StatusStrip key={p.id} tone="warning">
          <AlertTriangleIcon className="size-3.5 shrink-0" />
          <span><strong>{p.name}:</strong> {p.reason}. The numbers below may be short.</span>
          <Link href={`/finance/chapa?tab=sync&biz=${p.id}`} className="ml-auto font-medium underline">Sync and reconcile</Link>
        </StatusStrip>
      ))}
      {error && <StatusStrip tone="danger"><AlertTriangleIcon className="size-3.5 shrink-0" /> {error} <button type="button" className="ml-auto underline" onClick={() => setTick((t) => t + 1)}>Try again</button></StatusStrip>}

      {/* Summary cards: every matching payment, not the page on screen */}
      {summary.length > 1 && <ViewSwitcher label="Currency" options={summary.map((s) => [s.currency, s.currency] as const)} value={cur?.currency ?? null} onChange={setCurrency} />}
      <Summary s={cur} loading={!data} />

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/90 text-left text-[11px] text-muted-foreground backdrop-blur">
              <tr>
                {visible.map((c) => {
                  const on = c.sort && sort.by === c.sort;
                  return (
                    <th key={c.key} scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={cn("px-3 py-2 font-medium whitespace-nowrap", c.right && "text-right")}>
                      {c.sort ? (
                        <button type="button" className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground")} onClick={() => (setSort({ by: c.sort!, dir: on && sort.dir === "desc" ? "asc" : "desc" }), setPage(1))}>
                          {c.label}
                          {on ? sort.dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ChevronsUpDownIcon className="size-3 opacity-40" />}
                        </button>
                      ) : c.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className={cn(loading && data && "opacity-60")}>
              {!data && !error && Array.from({ length: 8 }, (_, i) => (
                <tr key={i} className="border-t">{visible.map((c) => <td key={c.key} className="px-3 py-2.5"><Skeleton className="h-3.5 w-full max-w-28" /></td>)}</tr>
              ))}
              {data?.rows.map((t) => (
                <tr key={`${t.accountId}:${t.txRef}`} tabIndex={0} className="cursor-pointer border-t hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none" onClick={() => setOpen(t)} onKeyDown={(e) => e.key === "Enter" && setOpen(t)}>
                  {visible.map((c) => <td key={c.key} className={cn("px-3 py-2", c.right && "text-right")}>{c.cell(t)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.rows.length && (
            <div className="p-6">
              <EmptyState
                title={active || f.q ? "No payment matches these filters" : f.preset === "all" ? "No payments stored yet" : `No payments for ${datePresetLabel(f.preset).toLowerCase()}`}
                description={active || f.q ? "Remove a filter or choose a longer date range." : "If Chapa has payments for this range, run a sync or a reconciliation."}
                action={active || f.q ? <Button size="sm" variant="outline" onClick={reset}>Reset the filters</Button> : <Button asChild size="sm" variant="outline"><Link href="/finance/chapa?tab=sync">Sync and reconcile</Link></Button>}
              />
            </div>
          )}
        </div>
        {/* Paging */}
        <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
          <span data-total>{data ? (data.total ? <><strong className="text-foreground">{first.toLocaleString()}–{last.toLocaleString()}</strong> of <strong className="text-foreground">{data.total.toLocaleString()}</strong> transactions</> : "0 transactions") : "Loading…"}</span>
          {loading && data && <Loader2Icon className="size-3.5 animate-spin" />}
          {data?.lastSync && <span className="hidden sm:inline">Synced {when(data.lastSync)}</span>}
          <span className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1">Rows
              <select aria-label="Rows per page" value={pageSize} onChange={(e) => (setPageSize(Number(e.target.value)), setPage(1))} className="h-7 rounded-md border bg-background px-1 text-xs">
                {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <Button size="icon-sm" variant="outline" aria-label="Previous page" disabled={!data || data.page <= 1 || loading} onClick={() => setPage((p) => p - 1)}><ChevronLeftIcon /></Button>
            <span className="tabular-nums">Page {data?.page ?? 1} of {data?.pages ?? 1}</span>
            <Button size="icon-sm" variant="outline" aria-label="Next page" disabled={!data || data.page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}><ChevronRightIcon /></Button>
          </span>
        </div>
      </div>
      <TxDrawer tx={open} onClose={() => setOpen(null)} onChanged={() => setTick((t) => t + 1)} businesses={businesses} />
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2">
      {children}
      <button type="button" aria-label="Remove filter" className="rounded-full p-0.5 hover:bg-muted" onClick={onRemove}><XIcon className="size-3" /></button>
    </span>
  );
}

function Summary({ s, loading }: { s: TxSummary | null; loading: boolean }) {
  const n = (v: number | undefined) => (loading ? <Skeleton className="h-6 w-16" /> : (v ?? 0).toLocaleString());
  const c = s?.currency ?? "ETB";
  const pct = s?.rate == null ? "-" : `${(s.rate * 100).toFixed(1)}%`;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 [&_*]:[overflow-wrap:normal]" data-summary>
      <MetricCard label="Total transactions" value={n(s?.total)} />
      <MetricCard label="Successful" value={n(s?.success)} tone="success" />
      <MetricCard label="Successful amount" value={loading ? <Skeleton className="h-6 w-24" /> : <span className="text-[0.8em] whitespace-nowrap sm:text-[1em]">{money(s?.successAmount ?? 0, c)}</span>} tone="success" hint={s?.fees ? `Fees ${money(s.fees, c)}` : undefined} />
      <MetricCard label="Pending" value={n(s?.pending)} tone={s?.pending ? "warning" : "default"} />
      <MetricCard label="Failed" value={n(s?.failed)} tone={s?.failed ? "danger" : "default"} />
      <MetricCard label="Refunded" value={n((s?.refunded ?? 0) + (s?.reversed ?? 0))} hint={s?.reversed ? `${s.reversed} reversed` : undefined} />
      <MetricCard label="Average value" value={loading ? <Skeleton className="h-6 w-20" /> : s?.average == null ? "-" : <span className="text-[0.8em] whitespace-nowrap sm:text-[1em]">{money(s.average, c)}</span>} hint="Per successful payment" />
      <MetricCard label="Success rate" value={loading ? <Skeleton className="h-6 w-14" /> : pct} hint="Paid, of paid and failed" />
    </div>
  );
}
