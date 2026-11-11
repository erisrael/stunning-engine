"use client";
import * as React from "react";
import { RefreshCwIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusStrip, Toolbar, ViewSwitcher } from "@/components/app/page-kit";
import { MetricCard } from "@/components/app/primitives";
import { cmsPresetRange } from "@/lib/cms-filters";
import { cmsAmount } from "@/lib/cms-report";
import { NoorFilters, RangePicker, RowsTable, ExportButtons, useShowEc, type Period } from "./range-controls";
import { exportHref, METHOD_LABEL, useCmsRange } from "./use-cms-range";
import { HistoryDialog, invoiceKey, ReviewBar, StateBadge, useReviewStates } from "./invoice-review";
import { SlipButton } from "./slip-viewer";
import { Breakdown, dayOfRow, daysOf, fmtMoney, fmtNum, PeriodBars, tally } from "./cms-charts";

type Sub = "overview" | "pending" | "all";
const status = (r: Record<string, string>) => (r.Status ?? r.status ?? "").toLowerCase();
const isPaid = (r: Record<string, string>) => /paid|success/.test(status(r));
const isPending = (r: Record<string, string>) => /pending|review/.test(status(r));
const amount = (r: Record<string, string>) => cmsAmount(r.Amount ?? r.amount);
const method = (r: Record<string, string>) => (r["Payment Method"] ?? r.method ?? "").toLowerCase() || "unknown";

// Revenue from Noor invoices, live and date first (Update 1.0): filters, a dashboard of paid and pending money,
// pending approvals in their own tab with the slip, and every invoice.
export function CmsRevenueView({ canReview }: { canReview: boolean }) {
  const [period, setPeriod] = React.useState<Period | null>("month");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [methodF, setMethodF] = React.useState("all");
  const [plan, setPlan] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [sub, setSub] = React.useState<Sub>("overview");
  const [showEc, setShowEc] = useShowEc();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [history, setHistory] = React.useState<string | null>(null);
  const cms = useCmsRange();
  const range = period ? cmsPresetRange(period, start, end) : null;
  const key = range ? JSON.stringify([range, filters]) : "";
  React.useEffect(() => {
    if (!range) return;
    const t = setTimeout(() => void cms.load({ category: "invoices", ...range, filters }), 200);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = cms.result?.category === "invoices" ? cms.result : null;
  const rows = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return (r?.records ?? []).filter((x) => (methodF === "all" || method(x) === methodF) && (plan === "all" || (x.Plan ?? "") === plan) && (!s || Object.values(x).some((v) => String(v).toLowerCase().includes(s))));
  }, [r, methodF, plan, q]);
  const paid = rows.filter(isPaid);
  const pending = rows.filter(isPending);
  const sum = (xs: Record<string, string>[]) => xs.reduce((a, x) => a + amount(x), 0);
  const days = range ? daysOf(range.from, range.until) : [];
  const perDay = (xs: Record<string, string>[], v: (x: Record<string, string>) => number) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(dayOfRow(x), (m.get(dayOfRow(x)) ?? 0) + v(x));
    return days.map((d) => m.get(d) ?? 0);
  };
  const shown = sub === "pending" ? pending : rows;
  const ids = React.useMemo(() => (canReview ? shown.map(invoiceKey).filter(Boolean) : []), [shown, canReview]);
  const { states, refresh } = useReviewStates(ids, canReview);
  const byId = React.useMemo(() => Object.fromEntries(shown.map((x) => [invoiceKey(x), x])), [shown]);
  const methods = [...new Set((r?.records ?? []).map(method))].sort();
  const plans = [...new Set((r?.records ?? []).map((x) => x.Plan ?? "").filter(Boolean))].sort();
  const hrefs = cms.taskId && r ? { xlsx: exportHref(cms.taskId, "xlsx", { columns: [], groupBy: "method" }), csv: exportHref(cms.taskId, "csv", { columns: [], groupBy: "method" }), pdf: exportHref(cms.taskId, "pdf", { columns: [], groupBy: "method", title: "Revenue" }) } : null;

  return (
    <div className="space-y-3">
      <Toolbar label="Revenue range" end={cms.loading ? <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={cms.stop}><SquareIcon /> Stop</Button> : <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!range} onClick={() => range && void cms.load({ category: "invoices", ...range, filters, refresh: true })}><RefreshCwIcon /> Refresh</Button>}>
        <RangePicker period={period} start={start} end={end} showEc={showEc} onShowEc={setShowEc} onChange={(v) => (setPeriod(v.period), setStart(v.start), setEnd(v.end))} />
      </Toolbar>
      <Toolbar label="Revenue filters" end={<ExportButtons hrefs={hrefs} disabled={cms.loading} />}>
        <NoorFilters filters={r?.filters ?? []} values={filters} onChange={setFilters} />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Method
          <select aria-label="Payment method" value={methodF} onChange={(e) => setMethodF(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"><option value="all">All</option>{methods.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Plan
          <select aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"><option value="all">All</option>{plans.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        </label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student, reference…" className="h-8 w-52 text-xs" aria-label="Search invoices" />
      </Toolbar>
      {cms.loading && <StatusStrip><RefreshCwIcon className="size-3.5 animate-spin" /> {cms.progress || "Loading invoices from Noor…"}</StatusStrip>}
      {cms.error && !cms.loading && <StatusStrip tone="danger">{cms.error}</StatusStrip>}
      {r && (
        <>
          <StatusStrip tone="success">
            <strong className="text-foreground">{rows.length.toLocaleString()} invoices</strong>
            <span>{r.from === r.until ? r.from : `${r.from} → ${r.until}`}</span>
            <span>· {METHOD_LABEL[r.method] ?? r.method}</span>
            <span className="ml-auto">Loaded {new Date(r.fetchedAt).toLocaleTimeString()}</span>
          </StatusStrip>
          <ViewSwitcher label="Revenue views" value={sub} onChange={setSub} options={[["overview", "Overview"], ["pending", `Pending approvals ${pending.length}`], ["all", `All invoices ${rows.length}`]]} />
        </>
      )}
      {r && sub === "overview" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard label="Paid revenue" value={fmtMoney(sum(paid))} hint={`${paid.length} paid invoices`} tone="success" />
            <MetricCard label="Waiting for approval" value={fmtMoney(sum(pending))} hint={`${pending.length} invoices`} tone={pending.length ? "warning" : "default"} />
            <MetricCard label="Average paid invoice" value={fmtMoney(paid.length ? sum(paid) / paid.length : 0)} />
            <MetricCard label="Other (expired, failed…)" value={fmtNum(rows.length - paid.length - pending.length)} />
            <MetricCard label="Paid share" value={`${rows.length ? Math.round((paid.length / rows.length) * 100) : 0}%`} hint="of invoices in range" />
          </div>
          <div className="rounded-xl border bg-card p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Paid and pending per day</p>
            <PeriodBars label="Paid and pending revenue per day" points={days} series={[{ name: "Paid", values: perDay(paid, amount), className: "bg-emerald-500", format: fmtMoney }, { name: "Pending", values: perDay(pending, amount), className: "bg-amber-400", format: fmtMoney }]} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Breakdown title="Paid by payment method" rows={tally(paid, method, amount)} format={fmtMoney} />
            <Breakdown title="Paid by plan" rows={tally(paid, (x) => x.Plan ?? "", amount)} format={fmtMoney} />
            <Breakdown title="Invoices by status" rows={tally(rows, (x) => x.Status ?? "")} />
          </div>
        </div>
      )}
      {r && sub !== "overview" && (
        <>
          {canReview && selected.size > 0 && <ReviewBar ids={[...selected]} invoices={byId} onDone={() => (setSelected(new Set()), void refresh())} />}
          {sub === "pending" && !pending.length && <StatusStrip tone="success">Nothing waits for approval in this range.</StatusStrip>}
          <RowsTable
            headers={r.headers}
            rows={shown}
            rowKey={(x, i) => invoiceKey(x) || `${i}`}
            selected={canReview ? selected : undefined}
            onSelect={canReview ? setSelected : undefined}
            lead={{
              label: canReview ? "Verification · slip" : "Slip",
              cell: (x) => (
                <span className="flex items-center gap-1.5">
                  {canReview && <button type="button" className="cursor-pointer" onClick={(e) => (e.stopPropagation(), setHistory(invoiceKey(x)))} aria-label={`History of invoice ${invoiceKey(x)}`}><StateBadge state={states[invoiceKey(x)]?.state ?? "unverified"} reason={states[invoiceKey(x)]?.reason} /></button>}
                  <SlipButton invoiceId={invoiceKey(x)} />
                </span>
              ),
            }}
            empty="No invoices match."
          />
        </>
      )}
      <HistoryDialog invoiceId={history} onClose={() => setHistory(null)} />
    </div>
  );
}
