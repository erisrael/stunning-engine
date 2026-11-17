"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon, CheckCircle2Icon, DatabaseIcon, GitCompareIcon, HistoryIcon, Loader2Icon, RefreshCwIcon, ScaleIcon, SearchCheckIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { EmptyState, StatusStrip, ViewSwitcher } from "@/components/app/page-kit";
import { cn } from "@/lib/utils";
import { CHAPA_STATUSES } from "@/lib/chapa";
import type { ChapaReconcile } from "@/server/chapa-sync";
import * as A from "@/app/actions/chapa-hub";

// Finance › Chapa › Sync and reconcile (Update 1.2): what is stored for each business and how Chapa is read, a full
// sync that shows its progress and can be stopped, reconciliation of a range against Chapa, and the run log.

type State = Awaited<ReturnType<typeof import("@/server/chapa-sync").chapaSyncState>>;
type Biz = State["businesses"][number];
type Run = State["runs"][number];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }) : "never");
const dayOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa" }) : "");
const addis = (offsetDays = 0) => new Date(Date.now() + 3 * 3600e3 - offsetDays * 86400e3).toISOString().slice(0, 10);
const span = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);
const amount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: "Done", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  running: { label: "Running", cls: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  paused: { label: "To be continued", cls: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  partial: { label: "Partial", cls: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200" },
  failed: { label: "Failed", cls: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
};
const KIND: Record<string, string> = { full: "Full sync", incremental: "Sync", manual: "Sync", reconcile: "Reconciliation" };
function Pill({ status }: { status: string }) {
  const s = RUN_STATUS[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={cn("text-[10px] font-medium", s.cls)}>{s.label}</Badge>;
}
function Health({ b }: { b: Biz }) {
  if (b.health === "error") return <Badge variant="outline" className={cn("text-[10px]", RUN_STATUS.failed.cls)}>Sync failing</Badge>;
  if (b.fullRun) return <Badge variant="outline" className={cn("text-[10px]", RUN_STATUS.paused.cls)}>Reading history</Badge>;
  if (b.health === "partial" || !b.backfilled) return <Badge variant="outline" className={cn("text-[10px]", RUN_STATUS.partial.cls)}>{b.backfilled ? "Partial" : "History not complete"}</Badge>;
  return <Badge variant="outline" className={cn("text-[10px]", RUN_STATUS.done.cls)}>Complete</Badge>;
}

export function SyncView({ biz }: { biz: string | null }) {
  const router = useRouter();
  const [state, setState] = React.useState<State | null>(null);
  const [error, setError] = React.useState("");
  const [working, setWorking] = React.useState<{ id: string; text: string } | null>(null);
  const stop = React.useRef(false);
  const [openRun, setOpenRun] = React.useState<Run | null>(null);
  const load = React.useCallback(async () => {
    const r = await A.chapaSyncStateAction(biz);
    if (r.ok && r.data) (setState(r.data), setError(""));
    else setError(r.ok ? "Could not load." : r.error);
  }, [biz]);
  React.useEffect(() => void load(), [load]);

  // A sync is done in steps of about 40 seconds: each step reports where it got to, and Stop ends after the step.
  const sync = async (b: Biz, full: boolean) => {
    stop.current = false;
    setWorking({ id: b.id, text: full ? "Starting the full sync…" : "Syncing…" });
    for (let step = 0; step < 400; step++) {
      const r = await A.chapaSyncAction(b.id, full);
      const x = r.ok ? r.data?.[0] : null;
      if (!r.ok || !x) {
        toast.error(r.ok ? "The sync did not run." : r.error);
        break;
      }
      if (x.error) {
        toast.error(`${b.name}: ${x.error}`);
        break;
      }
      await load();
      if (x.status === "paused" && !stop.current) {
        setWorking({ id: b.id, text: `${x.rows.toLocaleString()} payments read so far…` });
        continue;
      }
      if (x.status === "paused") toast.message(`${b.name}: stopped at ${x.rows.toLocaleString()} payments. It carries on at the next sync.`);
      else if (x.status === "partial") toast.warning(`${b.name}: ${x.rows.toLocaleString()} read, but some date ranges failed. They are tried again at the next sync.`);
      else if (!x.complete) toast.warning(`${b.name}: ${x.rows.toLocaleString()} read. ${x.note ?? "Chapa could not give the whole history."}`);
      else toast.success(`${b.name}: ${x.rows.toLocaleString()} read, ${x.inserted.toLocaleString()} new, ${x.updated.toLocaleString()} updated.`);
      break;
    }
    setWorking(null);
    await load();
    router.refresh();
  };

  if (error) return <StatusStrip tone="danger">{error}</StatusStrip>;
  if (!state) return <StatusStrip><Loader2Icon className="size-3.5 animate-spin" /> Loading the sync state…</StatusStrip>;
  if (!state.businesses.length) return <EmptyState title="No business to show" description="Choose a business you may verify." />;
  return (
    <div className="space-y-5">
      <section className="space-y-2" aria-label="Businesses">
        <div className={cn("grid gap-3", state.businesses.length > 1 && "lg:grid-cols-2")}>
          {state.businesses.map((b) => {
            const busy = working?.id === b.id;
            return (
              <article key={b.id} className="space-y-3 rounded-xl border bg-card p-4" data-sync-business={b.id}>
                <header className="flex flex-wrap items-center gap-2">
                  <DatabaseIcon className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">{b.name}</h2>
                  {b.mode === "test" && <Badge variant="outline" className="text-[10px]">Test</Badge>}
                  <Health b={b} />
                  <span className="ml-auto text-xs text-muted-foreground">every {b.syncMinutes} min</span>
                </header>
                <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3", state.businesses.length === 1 && "lg:grid-cols-6")}>
                  <div><dt className="text-muted-foreground">Stored here</dt><dd className="text-lg font-semibold tabular-nums">{b.stored.toLocaleString()}</dd></div>
                  <div><dt className="text-muted-foreground">From</dt><dd className="font-medium">{dayOf(b.firstAt) || "-"}</dd></div>
                  <div><dt className="text-muted-foreground">To</dt><dd className="font-medium">{dayOf(b.lastAt) || "-"}</dd></div>
                  <div><dt className="text-muted-foreground">Last good sync</dt><dd className="font-medium">{when(b.lastOkSyncAt)}</dd></div>
                  <div><dt className="text-muted-foreground">Last attempt</dt><dd className="font-medium">{when(b.lastSyncAt)}</dd></div>
                  <div>
                    <dt className="text-muted-foreground">How Chapa is read</dt>
                    <dd className="font-medium">{b.dateFilter === "yes" ? "By date range" : b.dateFilter === "no" ? "Page by page" : "Not checked yet"}{b.rowCap ? `, ${b.rowCap} rows an answer` : ""}</dd>
                  </div>
                </dl>
                {b.health === "error" && b.lastError && <StatusStrip tone="danger"><AlertTriangleIcon className="size-3.5 shrink-0" /> {b.lastError}</StatusStrip>}
                {b.health !== "error" && b.lastError && <StatusStrip tone="warning"><AlertTriangleIcon className="size-3.5 shrink-0" /> {b.lastError}</StatusStrip>}
                {!b.backfilled && !b.lastError && !b.fullRun && <StatusStrip tone="warning">The whole history has not been read yet. Run a full sync.</StatusStrip>}
                {b.fullRun && !busy && <StatusStrip>A full sync is under way: {b.fullRun.discovered.toLocaleString()} payments read{b.fullRun.cursor && !b.fullRun.cursor.startsWith("/") ? `, back to ${dayOf(b.fullRun.cursor)}` : ""}. It carries on by itself every few minutes, or press Continue.</StatusStrip>}
                {b.undated > 0 && <StatusStrip tone="warning">{b.undated.toLocaleString()} payment(s) came from Chapa without a date and are filed under the day they were read.</StatusStrip>}
                {busy && <StatusStrip><Loader2Icon className="size-3.5 animate-spin" /> {working!.text}</StatusStrip>}
                {b.canSync && (
                  <footer className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={!!working} onClick={() => sync(b, false)}><RefreshCwIcon className={cn(busy && "animate-spin")} /> Sync now</Button>
                    {b.fullRun ? (
                      <Button size="sm" disabled={!!working} onClick={() => sync(b, true)}><HistoryIcon /> Continue the full sync</Button>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="sm" variant="outline" disabled={!!working}><HistoryIcon /> Full sync</Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Read {b.name}'s whole history again?</AlertDialogTitle>
                            <AlertDialogDescription>Every payment Chapa holds for this business is read and compared with what is stored. Nothing is deleted. It can take several minutes; you can stop it and it carries on later from where it stopped.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => sync(b, true)}>Start the full sync</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {busy && <Button size="sm" variant="ghost" onClick={() => ((stop.current = true), setWorking({ id: b.id, text: "Stopping after this step…" }))}><SquareIcon /> Stop</Button>}
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <Reconcile businesses={state.businesses.filter((b) => b.canSync)} onDone={load} />

      <section className="space-y-2" aria-label="Sync runs">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><HistoryIcon className="size-4" /> Sync runs</h2>
        {!state.runs.length ? (
          <EmptyState title="No sync has run yet" description="Runs appear here with what they found, how long they took and any request that failed." />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 text-left text-[11px] text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2">Business</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Result</th>
                    <th className="px-3 py-2 text-right">Found</th>
                    <th className="px-3 py-2 text-right">New</th>
                    <th className="px-3 py-2 text-right">Updated</th>
                    <th className="px-3 py-2 text-right">Unchanged</th>
                    <th className="px-3 py-2 text-right">Failed</th>
                    <th className="px-3 py-2 text-right">Requests</th>
                    <th className="px-3 py-2 text-right">Took</th>
                  </tr>
                </thead>
                <tbody>
                  {state.runs.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setOpenRun(r)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenRun(r)}>
                      <td className="px-3 py-1.5 whitespace-nowrap">{when(r.startedAt)}</td>
                      <td className="px-3 py-1.5">{r.business}</td>
                      <td className="px-3 py-1.5">{KIND[r.kind] ?? r.kind}</td>
                      <td className="px-3 py-1.5"><Pill status={r.status} /></td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.discovered.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.inserted.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.updated.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.skipped.toLocaleString()}</td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums", r.failed > 0 && "font-semibold text-rose-600 dark:text-rose-400")}>{r.failed.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.requests.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{span(r.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <RunSheet run={openRun} onClose={() => setOpenRun(null)} />
    </div>
  );
}

function RunSheet({ run, onClose }: { run: Run | null; onClose: () => void }) {
  const [errors, setErrors] = React.useState<{ at: string; request: string | null; status: number | null; message: string }[] | null>(null);
  React.useEffect(() => {
    setErrors(null);
    if (run) void A.chapaRunErrorsAction(run.id).then((r) => setErrors(r.ok ? (r.data ?? []) : []));
  }, [run]);
  const notes: string[] = (run?.detail as { notes?: string[] } | undefined)?.notes ?? [];
  return (
    <Sheet open={!!run} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {run && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">{KIND[run.kind] ?? run.kind} <Pill status={run.status} /></SheetTitle>
              <SheetDescription>{run.business} · started {when(run.startedAt)} · {span(run.seconds)}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6 text-xs">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {run.from && <><dt className="text-muted-foreground">Range</dt><dd>{when(run.from)} to {when(run.until)}</dd></>}
                <dt className="text-muted-foreground">Found at Chapa</dt><dd className="tabular-nums">{run.discovered.toLocaleString()}</dd>
                <dt className="text-muted-foreground">New here</dt><dd className="tabular-nums">{run.inserted.toLocaleString()}</dd>
                <dt className="text-muted-foreground">Updated</dt><dd className="tabular-nums">{run.updated.toLocaleString()}</dd>
                <dt className="text-muted-foreground">Unchanged</dt><dd className="tabular-nums">{run.skipped.toLocaleString()}</dd>
                <dt className="text-muted-foreground">Failed</dt><dd className="tabular-nums">{run.failed.toLocaleString()}</dd>
                <dt className="text-muted-foreground">Requests to Chapa</dt><dd className="tabular-nums">{run.requests.toLocaleString()}</dd>
                {run.finishedAt && <><dt className="text-muted-foreground">Finished</dt><dd>{when(run.finishedAt)}</dd></>}
              </dl>
              {run.error && <StatusStrip tone="danger">{run.error}</StatusStrip>}
              {notes.map((n) => <StatusStrip key={n} tone="warning">{n}</StatusStrip>)}
              {run.kind === "reconcile" && run.status === "done" && <ReconcileResult r={run.detail as unknown as ChapaReconcile} />}
              <section>
                <h3 className="mb-1 font-semibold">Requests that failed</h3>
                {!errors ? <p className="text-muted-foreground">Loading…</p> : !errors.length ? <p className="text-muted-foreground">None.</p> : (
                  <ol className="space-y-1.5">
                    {errors.map((e, i) => (
                      <li key={i} className="rounded border p-2">
                        <div className="flex justify-between gap-2"><span className="font-medium">{e.message}</span><span className="shrink-0 text-muted-foreground">{e.status ? `HTTP ${e.status}` : ""}</span></div>
                        {e.request && <div className="mt-0.5 font-mono text-[10px] break-all text-muted-foreground">{e.request}</div>}
                        <div className="text-[10px] text-muted-foreground">{when(e.at)}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

const RANGES = [["3", "Last 3 days"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["custom", "Custom"]] as const;

function Reconcile({ businesses, onDone }: { businesses: Biz[]; onDone: () => void }) {
  const [id, setId] = React.useState(businesses[0]?.id ?? "");
  const [range, setRange] = React.useState<(typeof RANGES)[number][0]>("3");
  const [from, setFrom] = React.useState(addis(2));
  const [until, setUntil] = React.useState(addis());
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ChapaReconcile | null>(null);
  React.useEffect(() => {
    if (!businesses.some((b) => b.id === id)) setId(businesses[0]?.id ?? "");
  }, [businesses, id]);
  if (!businesses.length) return null;
  const pick = (v: (typeof RANGES)[number][0]) => {
    setRange(v);
    if (v !== "custom") (setFrom(addis(Number(v) - 1)), setUntil(addis()));
  };
  const go = async () => {
    setBusy(true);
    const r = await A.chapaReconcileAction(id, from, until);
    setBusy(false);
    if (!r.ok || !r.data) return void toast.error(r.ok ? "The reconciliation did not run." : r.error);
    setResult(r.data);
    onDone();
  };
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Reconcile with Chapa" data-reconcile>
      <header>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ScaleIcon className="size-4" /> Reconcile with Chapa</h2>
        <p className="text-xs text-muted-foreground">Reads the range from Chapa again and compares it with what is stored, status by status. Anything missing or changed is corrected and listed. It also runs by itself every night for the last 7 days.</p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        {businesses.length > 1 && (
          <select aria-label="Business" value={id} onChange={(e) => setId(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs font-medium">
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <ViewSwitcher label="Range" options={RANGES} value={range} onChange={pick} />
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Input type="date" aria-label="From" value={from} max={until} onChange={(e) => (setRange("custom"), setFrom(e.target.value))} className="h-8 w-[9.5rem] text-xs" />
          to
          <Input type="date" aria-label="Until" value={until} min={from} max={addis()} onChange={(e) => (setRange("custom"), setUntil(e.target.value))} className="h-8 w-[9.5rem] text-xs" />
        </span>
        <Button size="sm" disabled={busy || !id} onClick={go}>{busy ? <Loader2Icon className="animate-spin" /> : <GitCompareIcon />} {busy ? "Comparing…" : "Reconcile"}</Button>
      </div>
      {result && <ReconcileResult r={result} />}
    </section>
  );
}

export function ReconcileResult({ r }: { r: ChapaReconcile }) {
  if (!r?.provider) return null;
  const clean = r.missingCount === 0 && r.statusChangedCount === 0;
  const statuses = CHAPA_STATUSES.filter(([k]) => r.provider.byStatus[k] || r.localBefore.byStatus[k] || r.localAfter.byStatus[k]);
  const cell = (s?: { n: number; sum: number }) => (s ? <><span className="font-medium tabular-nums">{s.n.toLocaleString()}</span> <span className="text-[10px] text-muted-foreground tabular-nums">{amount(s.sum)}</span></> : <span className="text-muted-foreground">0</span>);
  return (
    <div className="space-y-3 text-xs" data-reconcile-result>
      <StatusStrip tone={clean ? "success" : "warning"}>
        {clean ? <CheckCircle2Icon className="size-3.5 shrink-0" /> : <SearchCheckIcon className="size-3.5 shrink-0" />}
        <span>
          <strong>{r.business}, {r.from} to {r.until}.</strong>{" "}
          {clean ? `Nothing was missing: Chapa has ${r.provider.total.toLocaleString()} payments and all are stored.` : `${r.missingCount.toLocaleString()} payment(s) were missing here and ${r.statusChangedCount.toLocaleString()} had another status. They are corrected now.`}
        </span>
      </StatusStrip>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
            <tr><th className="px-3 py-2">Status</th><th className="px-3 py-2">At Chapa</th><th className="px-3 py-2">Stored before</th><th className="px-3 py-2">Stored now</th></tr>
          </thead>
          <tbody>
            {statuses.map(([k, label]) => {
              const off = (r.provider.byStatus[k]?.n ?? 0) !== (r.localBefore.byStatus[k]?.n ?? 0);
              return (
                <tr key={k} className="border-t">
                  <td className="px-3 py-1.5">{label}</td>
                  <td className="px-3 py-1.5">{cell(r.provider.byStatus[k])}</td>
                  <td className={cn("px-3 py-1.5", off && "bg-amber-500/10")}>{cell(r.localBefore.byStatus[k])}</td>
                  <td className="px-3 py-1.5">{cell(r.localAfter.byStatus[k])}</td>
                </tr>
              );
            })}
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-1.5">Total</td>
              <td className="px-3 py-1.5 tabular-nums">{r.provider.total.toLocaleString()}</td>
              <td className="px-3 py-1.5 tabular-nums">{r.localBefore.total.toLocaleString()}</td>
              <td className="px-3 py-1.5 tabular-nums">{r.localAfter.total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([["Missing here", r.missingCount, "Now added"], ["Status differed", r.statusChangedCount, "Now updated"], ["Only stored here", r.localOnlyCount, "Not in Chapa's list for the range"], ["Filed on another day", r.datedDifferently, "Date corrected"]] as const).map(([l, n, hint]) => (
          <div key={l} className="rounded-lg border p-2">
            <dt className="text-[11px] text-muted-foreground">{l}</dt>
            <dd className={cn("text-base font-semibold tabular-nums", n > 0 && l !== "Only stored here" && "text-amber-700 dark:text-amber-300")}>{n.toLocaleString()}</dd>
            <dd className="text-[10px] text-muted-foreground">{hint}</dd>
          </div>
        ))}
      </dl>
      {(r.provider.duplicates > 0 || r.localDuplicates > 0 || r.provider.undated > 0) && (
        <p className="text-muted-foreground">
          {r.provider.duplicates > 0 && `Chapa repeated ${r.provider.duplicates} row(s) in its answers; each is stored once. `}
          {r.localDuplicates > 0 && `${r.localDuplicates} Chapa reference(s) are on more than one stored payment. `}
          {r.provider.undated > 0 && `${r.provider.undated} payment(s) came without a date.`}
        </p>
      )}
      {r.notes?.map((n) => <StatusStrip key={n} tone="warning">{n}</StatusStrip>)}
      {r.missing.length > 0 && <RefList title={`Were missing (${r.missingCount.toLocaleString()})`} rows={r.missing.map((m) => [m.txRef, `${m.status} · ${m.currency} ${amount(m.amount)} · ${when(m.createdAt)}`])} />}
      {r.statusChanged.length > 0 && <RefList title={`Status differed (${r.statusChangedCount.toLocaleString()})`} rows={r.statusChanged.map((m) => [m.txRef, `${m.was} here, ${m.now} at Chapa`])} />}
      {r.localOnly.length > 0 && <RefList title={`Only stored here (${r.localOnlyCount.toLocaleString()})`} rows={r.localOnly.map((m) => [m.txRef, `${m.status} · ${amount(m.amount)} · ${when(m.createdAt)}`])} />}
    </div>
  );
}

function RefList({ title, rows }: { title: string; rows: (readonly [string, string])[] }) {
  return (
    <details className="rounded-lg border">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">{title}</summary>
      <ul className="max-h-56 divide-y overflow-auto border-t">
        {rows.map(([ref, text]) => (
          <li key={ref} className="flex flex-wrap justify-between gap-x-3 px-3 py-1.5"><span className="font-mono text-[11px]">{ref}</span><span className="text-muted-foreground">{text}</span></li>
        ))}
      </ul>
    </details>
  );
}
