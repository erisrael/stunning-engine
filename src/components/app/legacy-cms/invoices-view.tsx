"use client";
import * as React from "react";
import { CalendarRangeIcon, PhoneOffIcon, RefreshCwIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, StatusStrip, Toolbar, ViewSwitcher } from "@/components/app/page-kit";
import { MetricCard } from "@/components/app/primitives";
import { cmsPresetRange } from "@/lib/cms-filters";
import { INVOICE_STATES, UNABLE_REASON_LABEL, type InvoiceReview, type InvoiceState } from "@/lib/cms-invoices";
import { invoiceReviewCountsAction, invoiceVerifiersAction, listInvoiceReviewsAction } from "@/app/actions/cms-reports";
import { ExportButtons, NoorFilters, RangePicker, RowsTable, useShowEc, type Period } from "./range-controls";
import { METHOD_LABEL, useCmsRange } from "./use-cms-range";
import { HistoryDialog, invoiceKey, ReviewBar, StateBadge, useReviewStates } from "./invoice-review";

type Sub = "review" | "unable" | "reviewed";
const SUBS = [
  ["review", "Review by date"],
  ["unable", "Unable to verify"],
  ["reviewed", "Verification log"],
] as const;

// Finance: Unverified → Verified, or Unable to verify with a reason and the contact Support needs (Update 1.0).
export function CmsInvoicesView() {
  const [sub, setSub] = React.useState<Sub>("review");
  const [counts, setCounts] = React.useState({ verified: 0, unable: 0, unverified: 0, unableNoPhone: 0 });
  const loadCounts = React.useCallback(() => void invoiceReviewCountsAction().then((r) => r.ok && r.data && setCounts(r.data)), []);
  React.useEffect(loadCounts, [loadCounts]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Verified" value={counts.verified} />
        <MetricCard label="Unable to verify" value={counts.unable} />
        <MetricCard label="Unable, no phone" value={counts.unableNoPhone} />
        <MetricCard label="Set back to Unverified" value={counts.unverified} />
      </div>
      <ViewSwitcher label="Invoice views" options={SUBS} value={sub} onChange={setSub} />
      {sub === "review" && <ReviewByDate onChanged={loadCounts} />}
      {sub === "unable" && <UnableList onChanged={loadCounts} />}
      {sub === "reviewed" && <ReviewedLog />}
    </div>
  );
}

function ReviewByDate({ onChanged }: { onChanged: () => void }) {
  const [period, setPeriod] = React.useState<Period | null>(null);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [state, setState] = React.useState<"all" | InvoiceState>("all");
  const [showEc, setShowEc] = useShowEc();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [history, setHistory] = React.useState<string | null>(null);
  const cms = useCmsRange();
  const range = period ? cmsPresetRange(period, start, end) : null;
  const key = range ? JSON.stringify([range, filters]) : "";
  React.useEffect(() => {
    if (!range) return;
    const t = setTimeout(() => void cms.load({ category: "invoices", ...range, filters }), 250);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = cms.result;
  const all = r?.records ?? [];
  const ids = React.useMemo(() => all.map(invoiceKey).filter(Boolean), [all]);
  const { states, refresh } = useReviewStates(ids, true);
  const st = (x: Record<string, string>) => states[invoiceKey(x)]?.state ?? "unverified";
  const rows = state === "all" ? all : all.filter((x) => st(x) === state);
  const byId = React.useMemo(() => Object.fromEntries(all.map((x) => [invoiceKey(x), x])), [all]);
  const tally = { unverified: 0, verified: 0, unable: 0 } as Record<InvoiceState, number>;
  for (const x of all) tally[st(x)]++;
  return (
    <div className="space-y-3">
      <Toolbar label="Invoices by date" end={cms.loading ? <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={cms.stop}><SquareIcon /> Stop</Button> : range ? <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void cms.load({ category: "invoices", ...range, filters, refresh: true })}><RefreshCwIcon /> Refresh</Button> : null}>
        <RangePicker period={period} start={start} end={end} showEc={showEc} onShowEc={setShowEc} onChange={(v) => (setPeriod(v.period), setStart(v.start), setEnd(v.end))} />
        <NoorFilters filters={r?.filters ?? []} values={filters} onChange={setFilters} />
      </Toolbar>
      {!range ? (
        <EmptyState icon={<CalendarRangeIcon className="size-5" />} title="Pick the invoice dates to review" description="Invoices load from Noor by date. Mark each one Verified, or Unable to verify with the reason; their contacts go to the Unable to verify list." />
      ) : (
        <>
          {cms.loading && <StatusStrip><RefreshCwIcon className="size-3.5 animate-spin" /> {cms.progress || "Loading invoices…"}</StatusStrip>}
          {cms.error && !cms.loading && <StatusStrip tone="danger">{cms.error}</StatusStrip>}
          {r && !cms.loading && (
            <StatusStrip>
              <strong className="text-foreground">{r.total.toLocaleString()} invoices</strong>
              <span>· {METHOD_LABEL[r.method]}</span>
              <span className="ml-auto flex items-center gap-1">
                <ViewSwitcher
                  label="Verification state"
                  size="xs"
                  value={state}
                  onChange={setState}
                  options={[["all", `All ${all.length}`], ...INVOICE_STATES.map(([k, l]) => [k, `${l} ${tally[k]}`] as const)]}
                />
              </span>
            </StatusStrip>
          )}
          <ReviewBar
            ids={[...selected]}
            invoices={byId}
            onDone={() => {
              setSelected(new Set());
              void refresh();
              onChanged();
            }}
          />
          {r && (
            <RowsTable
              headers={r.headers}
              rows={rows}
              rowKey={(x, i) => invoiceKey(x) || `${i}`}
              selected={selected}
              onSelect={setSelected}
              lead={{ label: "Verification", cell: (x) => <button type="button" className="cursor-pointer" aria-label={`History of invoice ${invoiceKey(x)}`} onClick={(e) => (e.stopPropagation(), setHistory(invoiceKey(x)))}><StateBadge state={st(x)} reason={states[invoiceKey(x)]?.reason} /></button> }}
              empty="No invoices in this range."
            />
          )}
        </>
      )}
      <HistoryDialog invoiceId={history} onClose={() => setHistory(null)} />
    </div>
  );
}

const asRow = (r: InvoiceReview): Record<string, string> => ({
  _recordId: r.invoiceId,
  Invoice: r.invoiceId,
  Student: r.student,
  Contact: r.contactName,
  Phone: r.phone || "No phone",
  Grade: r.grade,
  Plan: r.plan,
  Amount: r.amount ? r.amount.toLocaleString() : "",
  Method: r.method,
  "Invoice date": r.invoiceDate,
  Reason: UNABLE_REASON_LABEL[r.reason ?? ""]?.replace(/ \(.*\)$/, "") ?? "",
  Note: r.note ?? "",
  "Marked by": r.updatedByName ?? "",
  "Marked at": new Date(r.updatedAt).toLocaleString(),
});

function useVerifiers() {
  const [v, setV] = React.useState<{ id: string; name: string }[]>([]);
  React.useEffect(() => void invoiceVerifiersAction().then((r) => r.ok && r.data && setV(r.data)), []);
  return v;
}

function UnableList({ onChanged }: { onChanged: () => void }) {
  const [q, setQ] = React.useState("");
  const [verifier, setVerifier] = React.useState("all");
  const [noPhone, setNoPhone] = React.useState(false);
  const [list, setList] = React.useState<InvoiceReview[] | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [history, setHistory] = React.useState<string | null>(null);
  const verifiers = useVerifiers();
  const load = React.useCallback(() => void listInvoiceReviewsAction({ state: "unable", search: q, verifier }).then((r) => setList(r.ok ? r.data ?? [] : [])), [q, verifier]);
  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  const rows = (list ?? []).filter((r) => !noPhone || !r.phone).map(asRow);
  const ids = [...selected];
  const qs = new URLSearchParams({ list: "unable", ...(q ? { q } : {}), ...(verifier !== "all" ? { verifier } : {}), ...(ids.length ? { ids: ids.join(",") } : {}) }).toString();
  const hrefs = { xlsx: `/api/legacy-cms/report?${qs}&format=xlsx`, csv: `/api/legacy-cms/report?${qs}&format=csv`, pdf: `/export/cms-report?${qs}` };
  const missing = (list ?? []).filter((r) => !r.phone).length;
  return (
    <div className="space-y-3">
      <Toolbar label="Unable to verify" end={<><span className="text-xs text-muted-foreground">{ids.length ? `Export ${ids.length} selected` : "Export all shown"}</span><ExportButtons hrefs={hrefs} disabled={!rows.length} /></>}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice, student, contact or phone" className="h-8 w-72 text-xs" aria-label="Search the list" />
        <select aria-label="Marked by" value={verifier} onChange={(e) => setVerifier(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
          <option value="all">Marked by anyone</option>
          {verifiers.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={noPhone} onChange={(e) => setNoPhone(e.target.checked)} /> Only without a phone
        </label>
      </Toolbar>
      {missing > 0 && (
        <StatusStrip tone="warning">
          <PhoneOffIcon className="size-3.5" /> {missing} {missing === 1 ? "invoice has" : "invoices have"} no phone number. Sync Students and Parents (Tables &amp; sync) or find the number in Noor before handing over.
        </StatusStrip>
      )}
      <ReviewBar
        ids={ids}
        onDone={() => {
          setSelected(new Set());
          load();
          onChanged();
        }}
      />
      {list === null ? (
        <StatusStrip>Loading…</StatusStrip>
      ) : (
        <RowsTable
          headers={["Invoice", "Student", "Contact", "Phone", "Grade", "Plan", "Amount", "Invoice date", "Reason", "Note", "Marked by"]}
          rows={rows}
          rowKey={(r) => r._recordId}
          selected={selected}
          onSelect={setSelected}
          onRow={(r) => setHistory(r._recordId)}
          empty="No invoices are marked Unable to verify."
        />
      )}
      <HistoryDialog invoiceId={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function ReviewedLog() {
  const [state, setState] = React.useState<"all" | InvoiceState>("all");
  const [verifier, setVerifier] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [until, setUntil] = React.useState("");
  const [list, setList] = React.useState<InvoiceReview[] | null>(null);
  const [history, setHistory] = React.useState<string | null>(null);
  const verifiers = useVerifiers();
  React.useEffect(() => {
    void listInvoiceReviewsAction({ state, verifier, from, until }).then((r) => setList(r.ok ? r.data ?? [] : []));
  }, [state, verifier, from, until]);
  const rows = (list ?? []).map((r) => ({ ...asRow(r), State: r.state === "verified" ? "Verified" : r.state === "unable" ? "Unable to verify" : "Unverified" }));
  return (
    <div className="space-y-3">
      <Toolbar label="Verification log">
        <ViewSwitcher label="State" size="xs" value={state} onChange={setState} options={[["all", "All"], ...INVOICE_STATES]} />
        <select aria-label="Verifier" value={verifier} onChange={(e) => setVerifier(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
          <option value="all">Any verifier</option>
          {verifiers.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          Changed
          <Input type="date" aria-label="Changed from" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
          to
          <Input type="date" aria-label="Changed until" value={until} onChange={(e) => setUntil(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
        </span>
      </Toolbar>
      {list === null ? <StatusStrip>Loading…</StatusStrip> : <RowsTable headers={["Invoice", "State", "Student", "Amount", "Reason", "Note", "Marked by", "Marked at"]} rows={rows} rowKey={(r) => r._recordId} onRow={(r) => setHistory(r._recordId)} empty="No invoices reviewed with these filters." />}
      <HistoryDialog invoiceId={history} onClose={() => setHistory(null)} />
    </div>
  );
}
