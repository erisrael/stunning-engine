"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart3Icon, CalendarRangeIcon, CheckCheckIcon, DatabaseIcon, RadioIcon, RefreshCwIcon, SearchIcon, SquareIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, StatusStrip, Toolbar, ViewSwitcher } from "@/components/app/page-kit";
import { cmsDateMatches, cmsPresetRange, CMS_DATE_PRESETS } from "@/lib/cms-filters";
import { LEGACY_CMS_CATEGORIES, type LegacyCmsCategory } from "@/lib/legacy-cms";
import { waitForCmsTask } from "@/lib/cms-task-client";
import { listLegacyCmsRecordsAction, resolveLegacyCmsFeedbackAction } from "@/app/actions/legacy-cms";
import { ExportButtons, NoorFilters, RangePicker, RowsTable, TableTabs, useShowEc, type Period } from "./range-controls";
import { exportHref, METHOD_LABEL, useCmsRange } from "./use-cms-range";
import { HistoryDialog, invoiceKey, ReviewBar, StateBadge, useReviewStates } from "./invoice-review";
import { SlipButton } from "./slip-viewer";

type Source = "live" | "saved";

// Noor data, one tab per table (Update 1.0). Live: date first from Noor itself, updating while the range includes
// today. Saved copy: the synchronized mirror kept in Myseed (instant, works when Noor is slow), with Sync for the
// people allowed to refresh it. Invoices show their slip and verification; feedback can be resolved in Noor.
export function CmsLiveView({ categories, canReview, initialCategory, canManageData = false, canResolveFeedback = false }: { categories: LegacyCmsCategory[]; canReview: boolean; initialCategory: LegacyCmsCategory; canManageData?: boolean; canResolveFeedback?: boolean }) {
  const [category, setCategory] = React.useState<LegacyCmsCategory>(categories.includes(initialCategory) ? initialCategory : categories[0]);
  const [source, setSource] = React.useState<Source>("live");
  const [period, setPeriod] = React.useState<Period | null>(null);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [sent, setSent] = React.useState("");
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [local, setLocal] = React.useState("");
  // Which Noor date the range means (account created, subscription start or end…); empty = the best one.
  const [dateField, setDateField] = React.useState("");
  const [showEc, setShowEc] = useShowEc();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [history, setHistory] = React.useState<string | null>(null);
  const [resolve, setResolve] = React.useState<Record<string, string> | null>(null);
  const cms = useCmsRange();
  const range = period ? cmsPresetRange(period, start, end) : null;
  const key = range ? JSON.stringify([category, range, sent, filters, dateField]) : "";

  React.useEffect(() => {
    if (!range || source !== "live") return;
    const t = setTimeout(() => void cms.load({ category, ...range, search: sent, filters, dateField: dateField || undefined }), 250);
    return () => clearTimeout(t);
  }, [key, source]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    setFilters({});
    setDateField("");
    setSelected(new Set());
  }, [category]);

  const r = cms.result && cms.result.category === category ? cms.result : null;

  // The saved copy of this table.
  const [saved, setSaved] = React.useState<{ rows: Record<string, string>[]; last: string | null } | null>(null);
  const [syncing, setSyncing] = React.useState("");
  const loadSaved = React.useCallback(async () => {
    setSaved(null);
    const res = await listLegacyCmsRecordsAction(category, { limit: 0 });
    if (res.ok && res.data) setSaved({ rows: res.data.rows.map((x) => ({ ...(x.data as Record<string, string>), _recordId: String((x.data as Record<string, string>)._recordId ?? x.externalId) })), last: res.data.rows.map((x) => x.syncedAt).sort().at(-1) ?? null });
    else setSaved({ rows: [], last: null });
  }, [category]);
  React.useEffect(() => {
    if (source === "saved") void loadSaved();
  }, [source, loadSaved]);
  const syncTable = async () => {
    setSyncing("Starting…");
    try {
      await waitForCmsTask({ kind: "sync", category }, setSyncing);
      toast.success("Saved copy refreshed from Noor");
      await loadSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing("");
    }
  };

  // Live updates: while the range includes today, today's rows are fetched again every few seconds (past days
  // come from the cache, so a refresh is usually one request to Noor). New rows are highlighted.
  const [liveOn, setLiveOn] = React.useState(true);
  const [every, setEvery] = React.useState(20);
  const [fresh, setFresh] = React.useState<{ ids: Set<string>; at: number } | null>(null);
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const liveRange = source === "live" && !!range && range.until >= today && !(r && r.total > 0 && r.undated === r.total);
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
      void cms.load({ category, ...range, search: sent, filters, dateField: dateField || undefined }, { quiet: true });
    }, every * 1000);
    return () => clearInterval(t);
  }, [liveOn, liveRange, every, key, cms.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = source === "live" ? (r?.records ?? []) : (saved?.rows ?? []).filter((x) => !range || cmsDateMatches(x, "custom", range.from, range.until));
  const headers = source === "live" ? (r?.headers ?? []) : [...new Set((saved?.rows ?? []).slice(0, 30).flatMap((x) => Object.keys(x).filter((k) => !k.startsWith("_"))))];
  const rows = React.useMemo(() => {
    const q = (source === "saved" ? `${local} ${sent}` : local).trim().toLowerCase();
    return q ? base.filter((x) => Object.values(x).some((v) => String(v).toLowerCase().includes(q))) : base;
  }, [base, local, sent, source]); // eslint-disable-line react-hooks/exhaustive-deps
  const isInvoices = category === "invoices";
  const reviewing = isInvoices && canReview;
  const ids = React.useMemo(() => (reviewing ? rows.map(invoiceKey).filter(Boolean) : []), [rows, reviewing]);
  const { states, refresh } = useReviewStates(ids, reviewing);
  const byId = React.useMemo(() => Object.fromEntries(rows.map((x) => [invoiceKey(x), x])), [rows]);
  const hrefs = source === "live" && cms.taskId && r ? { xlsx: exportHref(cms.taskId, "xlsx", { columns: [], groupBy: "none" }), csv: exportHref(cms.taskId, "csv", { columns: [], groupBy: "none" }), pdf: exportHref(cms.taskId, "pdf", { columns: [], groupBy: "none" }) } : null;
  const label = LEGACY_CMS_CATEGORIES.find((c) => c.key === category)?.label ?? category;
  const lead = isInvoices
    ? {
        label: reviewing ? "Verification · slip" : "Slip",
        cell: (x: Record<string, string>) => (
          <span className="flex items-center gap-1.5">
            {reviewing && (
              <button type="button" onClick={(e) => (e.stopPropagation(), setHistory(invoiceKey(x)))} className="cursor-pointer" aria-label={`History of invoice ${invoiceKey(x)}`}>
                <StateBadge state={states[invoiceKey(x)]?.state ?? "unverified"} reason={states[invoiceKey(x)]?.reason} />
              </button>
            )}
            <SlipButton invoiceId={invoiceKey(x)} />
          </span>
        ),
      }
    : category === "feedback" && canResolveFeedback
      ? { label: "Action", cell: (x: Record<string, string>) => <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={(e) => (e.stopPropagation(), setResolve(x))}><CheckCheckIcon /> Resolve</Button> }
      : undefined;

  return (
    <div className="space-y-3">
      <TableTabs categories={categories} value={category} onChange={setCategory} />
      <Toolbar label="Live CMS data">
        <ViewSwitcher label="Source" value={source} onChange={setSource} options={[["live", "Live from Noor"], ["saved", "Saved copy"]]} />
        <RangePicker period={period} start={start} end={end} showEc={showEc} onShowEc={setShowEc} onChange={(v) => (setPeriod(v.period), setStart(v.start), setEnd(v.end))} />
        {source === "saved" && period && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setPeriod(null)}>All dates</Button>}
      </Toolbar>

      {(source === "saved" || range) && (
        <Toolbar
          label="Filters"
          end={
            source === "live" ? (
              <>
                {cms.loading ? (
                  <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={cms.stop}><SquareIcon /> Stop</Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => range && void cms.load({ category, ...range, search: sent, filters, dateField: dateField || undefined, refresh: true })} title="Fetch again from Noor, ignoring cached days"><RefreshCwIcon /> Refresh</Button>
                )}
                <ExportButtons hrefs={hrefs} disabled={cms.loading} />
                {cms.taskId && r && (
                  <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                    <Link href={`/legacy-cms?view=reports&task=${cms.taskId}`}><BarChart3Icon /> Build a report</Link>
                  </Button>
                )}
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">{saved?.last ? `Saved ${new Date(saved.last).toLocaleString()}` : "Not saved yet"}</span>
                {canManageData && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!syncing} onClick={syncTable}>
                    <DatabaseIcon className={syncing ? "animate-pulse" : ""} /> {syncing || "Sync this table from Noor"}
                  </Button>
                )}
              </>
            )
          }
        >
          <form className="flex items-center gap-1" onSubmit={(e) => (e.preventDefault(), setSent(search.trim()))}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={source === "live" ? `Search ${label.toLowerCase()} in Noor` : `Search the saved ${label.toLowerCase()}`} className="h-8 w-56 text-xs" aria-label="Search in Noor" />
            <Button type="submit" variant="ghost" size="icon" className="size-8" aria-label="Search"><SearchIcon /></Button>
          </form>
          {source === "live" && !!r?.dateFields?.length && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Date
              <select aria-label="Date field" value={dateField || r.dateField || ""} onChange={(e) => setDateField(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground">
                {r.dateFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                    {f.sortBy === "id" ? " (newest first by id)" : !f.sortBy ? " (reads every page)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {source === "live" && <NoorFilters filters={r?.filters ?? []} values={filters} onChange={setFilters} />}
          <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Filter shown rows" className="h-8 w-44 text-xs" aria-label="Filter loaded rows" />
        </Toolbar>
      )}

      {source === "live" && !range ? (
        <EmptyState
          icon={<CalendarRangeIcon className="size-5" />}
          title="Pick a date range to load"
          description="Live data loads by date: Noor returns only the rows in the range, so even big tables come back in a few requests. Closed days are kept, so loading them again is instant. For everything already saved in Myseed, use Saved copy."
          action={<ViewSwitcher label="Quick range" options={CMS_DATE_PRESETS.filter(([k]) => k !== "custom")} value={null} onChange={(p) => setPeriod(p)} />}
        />
      ) : (
        <>
          {source === "live" && cms.loading && <StatusStrip><RefreshCwIcon className="size-3.5 animate-spin" /> {cms.progress || "Loading from Noor…"}</StatusStrip>}
          {source === "live" && cms.error && !cms.loading && <StatusStrip tone="danger">{cms.error}</StatusStrip>}
          {source === "saved" && !saved && <StatusStrip>Opening the saved copy…</StatusStrip>}
          {source === "saved" && saved && !saved.rows.length && <StatusStrip tone="warning">Nothing is saved for {label} yet.{canManageData ? " Sync this table from Noor." : " Admin syncs it from Noor."}</StatusStrip>}
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
                  {[10, 20, 30, 60].map((n) => <option key={n} value={n}>every {n} s</option>)}
                </select>
              )}
              <span>Today&apos;s rows are fetched again; earlier days come from the cache.</span>
            </div>
          )}
          {source === "live" && r && !cms.loading && (
            <StatusStrip tone="success">
              <strong className="text-foreground tabular-nums" data-testid="live-total">{r.total.toLocaleString()} {label.toLowerCase()}</strong>
              <span>{r.from === r.until ? r.from : `${r.from} → ${r.until}`}</span>
              <span>· {METHOD_LABEL[r.method] ?? r.method}{r.dateField ? ` by ${r.dateFields?.find((f) => f.key === r.dateField)?.label ?? r.dateField}` : ""}</span>
              <span>· {r.requests ? `${r.requests} request${r.requests === 1 ? "" : "s"} to Noor` : "no requests to Noor"}</span>
              {r.cachedDays > 0 && <span>· {r.cachedDays} day{r.cachedDays === 1 ? "" : "s"} from the cache</span>}
              {r.undated > 0 && r.undated === r.total ? <span>· no dates for these rows, so all are shown</span> : r.undated > 0 && <span>· {r.undated} rows have no readable date</span>}
              {fresh && <span className="rounded-full bg-emerald-600 px-2 py-0.5 font-medium text-white" data-testid="live-new">+{fresh.ids.size} new</span>}
              <span className="ml-auto">{liveOn && liveRange ? "Updated" : "Loaded"} {new Date(r.fetchedAt).toLocaleTimeString()}</span>
            </StatusStrip>
          )}
          {source === "saved" && saved && saved.rows.length > 0 && (
            <StatusStrip>
              <strong className="text-foreground">{rows.length.toLocaleString()} of {saved.rows.length.toLocaleString()} saved {label.toLowerCase()}</strong>
              {range && <span>· {range.from === range.until ? range.from : `${range.from} → ${range.until}`}</span>}
            </StatusStrip>
          )}
          {reviewing && selected.size > 0 && <ReviewBar ids={[...selected]} invoices={byId} onDone={() => (setSelected(new Set()), void refresh())} />}
          {(source === "saved" ? !!saved : !!r) && (
            <RowsTable
              headers={headers}
              rows={rows}
              rowKey={(x, i) => invoiceKey(x) || `${i}`}
              selected={reviewing ? selected : undefined}
              onSelect={reviewing ? setSelected : undefined}
              lead={lead}
              empty={`No ${label.toLowerCase()} ${range ? "in this range" : "saved"}.`}
              rowClass={(x) => (fresh?.ids.has(invoiceKey(x)) ? "bg-emerald-500/10 animate-in fade-in" : undefined)}
            />
          )}
        </>
      )}
      <HistoryDialog invoiceId={history} onClose={() => setHistory(null)} />
      <ResolveDialog row={resolve} onClose={() => setResolve(null)} />
    </div>
  );
}

// Resolve a Noor feedback record (the change is made in Noor itself).
function ResolveDialog({ row, onClose }: { row: Record<string, string> | null; onClose: () => void }) {
  const [status, setStatus] = React.useState<"resolved" | "reviewed" | "pending">("resolved");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const id = row ? invoiceKey(row) : "";
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Feedback #{id}</DialogTitle>
          <DialogDescription>{row?.Description ?? row?.description}</DialogDescription>
        </DialogHeader>
        <ViewSwitcher label="Feedback status" value={status} onChange={setStatus} options={[["resolved", "Resolved"], ["reviewed", "Reviewed"], ["pending", "Pending"]]} />
        <label className="grid gap-1 text-sm">What was done<Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <DialogFooter>
          <Button disabled={busy || !notes.trim()} onClick={async () => { setBusy(true); const res = await resolveLegacyCmsFeedbackAction(id, { status, notes }); setBusy(false); if (!res.ok) return toast.error(res.message ?? "Noor did not accept the change"); toast.success("Updated in Noor"); setNotes(""); onClose(); }}>Save in Noor</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
