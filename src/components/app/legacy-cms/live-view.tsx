"use client";
import * as React from "react";
import Link from "next/link";
import { BarChart3Icon, CalendarRangeIcon, RadioIcon, RefreshCwIcon, SearchIcon, SquareIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, StatusStrip, Toolbar, ViewSwitcher } from "@/components/app/page-kit";
import { cmsPresetRange, CMS_DATE_PRESETS } from "@/lib/cms-filters";
import { LEGACY_CMS_CATEGORIES, type LegacyCmsCategory } from "@/lib/legacy-cms";
import { ExportButtons, NoorFilters, RangePicker, RowsTable, useShowEc, type Period } from "./range-controls";
import { exportHref, METHOD_LABEL, useCmsRange } from "./use-cms-range";
import { HistoryDialog, invoiceKey, ReviewBar, StateBadge, useReviewStates } from "./invoice-review";

// Live Noor data, date first (Update 1.0, Phase 2). Nothing loads until a range is chosen; the server picks the
// fastest accurate path (Noor's date filter, a sorted range search, or every page) and reports the true total.
export function CmsLiveView({ categories, canReview, initialCategory }: { categories: LegacyCmsCategory[]; canReview: boolean; initialCategory: LegacyCmsCategory }) {
  const [category, setCategory] = React.useState<LegacyCmsCategory>(categories.includes(initialCategory) ? initialCategory : categories[0]);
  const [period, setPeriod] = React.useState<Period | null>(null);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [sent, setSent] = React.useState("");
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [local, setLocal] = React.useState("");
  const [showEc, setShowEc] = useShowEc();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [history, setHistory] = React.useState<string | null>(null);
  const cms = useCmsRange();
  const range = period ? cmsPresetRange(period, start, end) : null;
  const key = range ? JSON.stringify([category, range, sent, filters]) : "";

  React.useEffect(() => {
    if (!range) return;
    const t = setTimeout(() => void cms.load({ category, ...range, search: sent, filters }), 250);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    setFilters({});
    setSelected(new Set());
  }, [category]);

  const r = cms.result && cms.result.category === category ? cms.result : null;

  // Live updates: while the range includes today, today's rows are fetched again every few seconds (past days
  // come from the cache, so a refresh is usually one request to Noor). New rows are highlighted.
  const [liveOn, setLiveOn] = React.useState(true);
  const [every, setEvery] = React.useState(20);
  const [fresh, setFresh] = React.useState<{ ids: Set<string>; at: number } | null>(null);
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  // Tables with no dates (Students, Parents) cannot update by day; they show the saved copy until Refresh.
  const liveRange = !!range && range.until >= today && !(r && r.total > 0 && r.undated === r.total);
  const prev = React.useRef<{ key: string; ids: Set<string> } | null>(null);
  React.useEffect(() => {
    if (!r) return;
    const ids = new Set(r.records.map((x, i) => invoiceKey(x) || `${i}`));
    if (prev.current?.key === key) {
      const added = [...ids].filter((id) => !prev.current!.ids.has(id));
      if (added.length) setFresh({ ids: new Set(added), at: Date.now() });
    } else setFresh(null);
    prev.current = { key, ids };
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!liveOn || !liveRange || !range) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible" || cms.loading) return;
      void cms.load({ category, ...range, search: sent, filters }, { quiet: true });
    }, every * 1000);
    return () => clearInterval(t);
  }, [liveOn, liveRange, every, key, cms.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = React.useMemo(() => {
    const q = local.trim().toLowerCase();
    return !r ? [] : q ? r.records.filter((x) => Object.values(x).some((v) => String(v).toLowerCase().includes(q))) : r.records;
  }, [r, local]);
  const isInvoices = category === "invoices" && canReview;
  const ids = React.useMemo(() => (isInvoices ? rows.map(invoiceKey).filter(Boolean) : []), [rows, isInvoices]);
  const { states, refresh } = useReviewStates(ids, isInvoices);
  const byId = React.useMemo(() => Object.fromEntries(rows.map((x) => [invoiceKey(x), x])), [rows]);
  const hrefs = cms.taskId && r ? { xlsx: exportHref(cms.taskId, "xlsx", { columns: [], groupBy: "none" }), csv: exportHref(cms.taskId, "csv", { columns: [], groupBy: "none" }), pdf: exportHref(cms.taskId, "pdf", { columns: [], groupBy: "none" }) } : null;
  const label = LEGACY_CMS_CATEGORIES.find((c) => c.key === category)?.label ?? category;

  return (
    <div className="space-y-3">
      <Toolbar label="Live CMS data">
        <select aria-label="Table" value={category} onChange={(e) => setCategory(e.target.value as LegacyCmsCategory)} className="h-8 rounded-md border bg-background px-2 text-sm font-medium">
          {categories.map((c) => (
            <option key={c} value={c}>
              {LEGACY_CMS_CATEGORIES.find((x) => x.key === c)?.label ?? c}
            </option>
          ))}
        </select>
        <RangePicker
          period={period}
          start={start}
          end={end}
          showEc={showEc}
          onShowEc={setShowEc}
          onChange={(v) => {
            setPeriod(v.period);
            setStart(v.start);
            setEnd(v.end);
          }}
        />
      </Toolbar>

      {range && (
        <Toolbar
          label="Filters"
          end={
            <>
              {cms.loading ? (
                <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={cms.stop}>
                  <SquareIcon /> Stop
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void cms.load({ category, ...range, search: sent, filters, refresh: true })} title="Fetch again from Noor, ignoring cached days">
                  <RefreshCwIcon /> Refresh
                </Button>
              )}
              <ExportButtons hrefs={hrefs} disabled={cms.loading} />
              {cms.taskId && r && (
                <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                  <Link href={`/legacy-cms?view=reports&task=${cms.taskId}`}>
                    <BarChart3Icon /> Build a report
                  </Link>
                </Button>
              )}
            </>
          }
        >
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(search.trim());
            }}
          >
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()} in Noor`} className="h-8 w-56 text-xs" aria-label="Search in Noor" />
            <Button type="submit" variant="ghost" size="icon" className="size-8" aria-label="Search">
              <SearchIcon />
            </Button>
          </form>
          <NoorFilters filters={r?.filters ?? []} values={filters} onChange={setFilters} />
          <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Filter loaded rows" className="h-8 w-44 text-xs" aria-label="Filter loaded rows" />
        </Toolbar>
      )}

      {!range ? (
        <EmptyState
          icon={<CalendarRangeIcon className="size-5" />}
          title="Pick a date range to load"
          description="Live data loads by date: Noor returns only the rows in the range, so even big tables come back in a few requests. Closed days are kept, so loading them again is instant."
          action={<ViewSwitcher label="Quick range" options={CMS_DATE_PRESETS.filter(([k]) => k !== "custom")} value={null} onChange={(p) => setPeriod(p)} />}
        />
      ) : (
        <>
          {cms.loading && <StatusStrip><RefreshCwIcon className="size-3.5 animate-spin" /> {cms.progress || "Loading from Noor…"}</StatusStrip>}
          {cms.error && !cms.loading && <StatusStrip tone="danger">{cms.error}</StatusStrip>}
          {liveRange && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <label className="flex items-center gap-2">
                <Switch checked={liveOn} onCheckedChange={setLiveOn} aria-label="Live updates" />
                <span className={liveOn ? "flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300" : ""}>
                  {liveOn && <RadioIcon className="size-3.5 animate-pulse" />}
                  {liveOn ? "Live" : "Live updates off"}
                </span>
              </label>
              {liveOn && (
                <select aria-label="Update every" value={every} onChange={(e) => setEvery(Number(e.target.value))} className="h-7 rounded-md border bg-background px-1">
                  {[10, 20, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      every {n} s
                    </option>
                  ))}
                </select>
              )}
              <span>Today&apos;s rows are fetched again; earlier days come from the cache.</span>
            </div>
          )}
          {r && !cms.loading && (
            <StatusStrip tone="success">
              <strong className="text-foreground tabular-nums" data-testid="live-total">
                {r.total.toLocaleString()} {label.toLowerCase()}
              </strong>
              <span>{r.from === r.until ? r.from : `${r.from} → ${r.until}`}</span>
              <span>· {METHOD_LABEL[r.method] ?? r.method}</span>
              <span>· {r.requests ? `${r.requests} request${r.requests === 1 ? "" : "s"} to Noor` : "no requests to Noor"}</span>
              {r.cachedDays > 0 && <span>· {r.cachedDays} day{r.cachedDays === 1 ? "" : "s"} from the cache</span>}
              {r.undated > 0 && r.undated === r.total ? <span>· this table has no dates in Noor, so every row is shown</span> : r.undated > 0 && <span>· {r.undated} rows have no readable date</span>}
              {fresh && <span className="rounded-full bg-emerald-600 px-2 py-0.5 font-medium text-white" data-testid="live-new">+{fresh.ids.size} new</span>}
              <span className="ml-auto">{liveOn && liveRange ? "Updated" : "Loaded"} {new Date(r.fetchedAt).toLocaleTimeString()}</span>
            </StatusStrip>
          )}
          {isInvoices && selected.size > 0 && (
            <ReviewBar
              ids={[...selected]}
              invoices={byId}
              onDone={() => {
                setSelected(new Set());
                void refresh();
              }}
            />
          )}
          {r && (
            <RowsTable
              headers={r.headers}
              rows={rows}
              rowKey={(x, i) => invoiceKey(x) || `${i}`}
              selected={isInvoices ? selected : undefined}
              onSelect={isInvoices ? setSelected : undefined}
              lead={isInvoices ? { label: "Verification", cell: (x) => <button type="button" onClick={(e) => (e.stopPropagation(), setHistory(invoiceKey(x)))} className="cursor-pointer" aria-label={`History of invoice ${invoiceKey(x)}`}><StateBadge state={states[invoiceKey(x)]?.state ?? "unverified"} reason={states[invoiceKey(x)]?.reason} /></button> } : undefined}
              empty={`No ${label.toLowerCase()} in this range.`}
              rowClass={(x) => (fresh?.ids.has(invoiceKey(x)) ? "bg-emerald-500/10 animate-in fade-in" : undefined)}
            />
          )}
        </>
      )}
      <HistoryDialog invoiceId={history} onClose={() => setHistory(null)} />
    </div>
  );
}
