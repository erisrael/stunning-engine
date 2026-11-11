"use client";
import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, FileSpreadsheetIcon, FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ViewSwitcher } from "@/components/app/page-kit";
import { CMS_DATE_PRESETS, cmsPresetRange } from "@/lib/cms-filters";
import { formatEthiopian } from "@/lib/ethiopian";
import { cn } from "@/lib/utils";

export type Period = (typeof CMS_DATE_PRESETS)[number][0];

// The date range is the first control: presets, a custom from/until, and the same days in the Ethiopian calendar.
export function RangePicker({
  period,
  start,
  end,
  onChange,
  showEc,
  onShowEc,
}: {
  period: Period | null;
  start: string;
  end: string;
  onChange: (v: { period: Period; start: string; end: string }) => void;
  showEc: boolean;
  onShowEc: (v: boolean) => void;
}) {
  const range = period ? cmsPresetRange(period, start, end) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ViewSwitcher label="Date range" options={CMS_DATE_PRESETS} value={period} onChange={(p) => onChange({ period: p, start: p === "custom" ? start || range?.from || "" : "", end: p === "custom" ? end || range?.until || "" : "" })} />
      {period === "custom" && (
        <span className="flex items-center gap-1">
          <Input type="date" aria-label="From" value={start} onChange={(e) => onChange({ period: "custom", start: e.target.value, end })} className="h-8 w-[9.5rem] text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" aria-label="Until" value={end} onChange={(e) => onChange({ period: "custom", start, end: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
        </span>
      )}
      {range && (
        <span className="text-xs text-muted-foreground" data-testid="range-label">
          {range.from === range.until ? range.from : `${range.from} → ${range.until}`}
          {showEc && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5">{range.from === range.until ? formatEthiopian(range.from) : `${formatEthiopian(range.from)} → ${formatEthiopian(range.until)}`} E.C.</span>}
        </span>
      )}
      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Checkbox checked={showEc} onCheckedChange={(v) => onShowEc(v === true)} aria-label="Show Ethiopian calendar dates" />
        E.C.
      </label>
    </div>
  );
}

export function useShowEc() {
  const [v, setV] = React.useState(false);
  React.useEffect(() => {
    try {
      setV(localStorage.getItem("cms.showEc") === "1" || document.documentElement.dataset.calendar === "ethiopian");
    } catch {}
  }, []);
  return [
    v,
    (next: boolean) => {
      setV(next);
      try {
        localStorage.setItem("cms.showEc", next ? "1" : "0");
      } catch {}
    },
  ] as const;
}

export function ExportButtons({ hrefs, disabled }: { hrefs: { xlsx: string; csv: string; pdf: string } | null; disabled?: boolean }) {
  const off = disabled || !hrefs;
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" className="h-8 text-xs" disabled={off} asChild={!off}>
        {off ? <span><FileSpreadsheetIcon /> Excel</span> : <a href={hrefs!.xlsx}><FileSpreadsheetIcon /> Excel</a>}
      </Button>
      <Button variant="outline" size="sm" className="h-8 text-xs" disabled={off} asChild={!off}>
        {off ? <span><DownloadIcon /> CSV</span> : <a href={hrefs!.csv}><DownloadIcon /> CSV</a>}
      </Button>
      <Button variant="outline" size="sm" className="h-8 text-xs" disabled={off} asChild={!off}>
        {off ? <span><FileTextIcon /> PDF</span> : <a href={hrefs!.pdf} target="_blank" rel="noopener"><FileTextIcon /> PDF</a>}
      </Button>
    </div>
  );
}

// Rows from Noor, paged here (the full set is already on the page), with optional selection and extra columns.
export function RowsTable({
  headers,
  rows,
  rowKey,
  selected,
  onSelect,
  lead,
  pageSize: initialSize = 25,
  onRow,
  empty = "No rows.",
  rowClass,
}: {
  headers: string[];
  rows: Record<string, string>[];
  rowKey: (r: Record<string, string>, i: number) => string;
  selected?: Set<string>;
  onSelect?: (next: Set<string>) => void;
  lead?: { label: string; cell: (r: Record<string, string>) => React.ReactNode };
  pageSize?: number;
  onRow?: (r: Record<string, string>) => void;
  empty?: string;
  rowClass?: (r: Record<string, string>) => string | undefined;
}) {
  const [page, setPage] = React.useState(1);
  const [size, setSize] = React.useState(initialSize);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  // A live refresh adds rows without sending the reader back to page 1; a new size or row set does.
  const count = rows.length;
  React.useEffect(() => setPage(1), [size]);
  React.useEffect(() => setPage((p) => Math.min(p, Math.max(1, Math.ceil(count / size)))), [count, size]);
  const shown = rows.slice((page - 1) * size, page * size);
  const keys = shown.map(rowKey);
  const allOn = !!selected && keys.length > 0 && keys.every((k) => selected.has(k));
  const toggle = (k: string) => {
    if (!selected || !onSelect) return;
    const n = new Set(selected);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    onSelect(n);
  };
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-[1] bg-muted/80 backdrop-blur">
            <tr className="text-left text-[11px] text-muted-foreground">
              {onSelect && (
                <th className="w-8 px-2 py-2">
                  <Checkbox
                    aria-label="Select the rows on this page"
                    checked={allOn}
                    onCheckedChange={(v) => {
                      const n = new Set(selected);
                      keys.forEach((k) => (v === true ? n.add(k) : n.delete(k)));
                      onSelect(n);
                    }}
                  />
                </th>
              )}
              {lead && <th className="px-2 py-2 font-medium whitespace-nowrap">{lead.label}</th>}
              {headers.map((h) => (
                <th key={h} className="px-2 py-2 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const k = keys[i];
              return (
                <tr key={k} className={cn("border-t hover:bg-muted/40", onRow && "cursor-pointer", selected?.has(k) && "bg-primary/5", rowClass?.(r))} onClick={onRow ? () => onRow(r) : undefined}>
                  {onSelect && (
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox aria-label={`Select row ${k}`} checked={selected?.has(k) ?? false} onCheckedChange={() => toggle(k)} />
                    </td>
                  )}
                  {lead && <td className="px-2 py-1.5 whitespace-nowrap">{lead.cell(r)}</td>}
                  {headers.map((h) => (
                    <td key={h} className="max-w-[22rem] truncate px-2 py-1.5" title={r[h]}>
                      {r[h]}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={headers.length + (onSelect ? 1 : 0) + (lead ? 1 : 0)} className="px-3 py-10 text-center text-muted-foreground">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>
            {((page - 1) * size + 1).toLocaleString()}–{Math.min(page * size, rows.length).toLocaleString()} of {rows.length.toLocaleString()}
            {selected && selected.size > 0 && <span className="ml-2 font-medium text-foreground">{selected.size} selected</span>}
          </span>
          <span className="flex items-center gap-1">
            <select aria-label="Rows per page" value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-7 rounded-md border bg-background px-1">
              {[25, 50, 100, 250].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeftIcon />
            </Button>
            <span className="tabular-nums">
              {page} / {pages}
            </span>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              <ChevronRightIcon />
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}

// Noor's own select filters for the table, shown once a load has read them.
export function NoorFilters({ filters, values, onChange }: { filters: { key: string; label: string; kind: string; options: { value: string; label: string }[] }[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const selects = filters.filter((f) => f.kind === "select");
  if (!selects.length) return null;
  return (
    <>
      {selects.map((f) => (
        <label key={f.key} className="flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
          {f.label}
          <select value={values[f.key] ?? ""} onChange={(e) => onChange({ ...values, [f.key]: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground">
            <option value="">All</option>
            {f.options
              .filter((o) => o.value)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
        </label>
      ))}
    </>
  );
}

// One tab per Noor table (instead of a dropdown): what is shown is always one click away.
const TABLE_SHORT: Record<string, string> = { students: "Students", parents: "Parents", invoices: "Invoices", subscriptions: "Subscriptions", "subscription-histories": "Subscription history", "subscription-plans": "Plans", feedback: "Feedback" };
const TABLE_ORDER = ["invoices", "students", "parents", "subscriptions", "subscription-histories", "feedback", "subscription-plans"];
export function TableTabs<T extends string>({ categories, value, onChange }: { categories: T[]; value: T; onChange: (c: T) => void }) {
  const list = [...categories].sort((a, b) => TABLE_ORDER.indexOf(a) - TABLE_ORDER.indexOf(b));
  return (
    <div role="tablist" aria-label="Noor tables" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
      {list.map((c) => {
        const on = c === value;
        return (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(c)}
            className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
          >
            {TABLE_SHORT[c] ?? c}
          </button>
        );
      })}
    </div>
  );
}
