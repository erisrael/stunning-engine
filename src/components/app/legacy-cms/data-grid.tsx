"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, DownloadIcon, FilterIcon, PhoneIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { auditCmsExportAction } from "@/app/actions/legacy-cms";

// The saved Noor rows as a working table: filter any column by its values, by text, or by empty / not empty;
// sort; choose rows (one by one, the whole filter, or a range); export the chosen rows and columns to CSV or
// Excel; copy phone numbers. Everything runs on the rows already stored, so Noor is never asked again.

type Row = Record<string, string>;
type ColFilter = { values?: string[]; text?: string; empty?: "empty" | "filled" };
export type GridTools = { columnFilters: boolean; export: boolean; copyPhone: boolean };

const PHONE_HEADER = /phone|mobile|tel\b|contact phone/i;
const PHONE_VALUE = /^\+?[0-9][0-9 ()-]{7,}$/;
const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === "" || String(v).trim() === "—";

function matches(v: string | undefined, f: ColFilter) {
  if (f.empty === "empty" && !blank(v)) return false;
  if (f.empty === "filled" && blank(v)) return false;
  if (f.values?.length && !f.values.includes(blank(v) ? "" : String(v))) return false;
  if (f.text && !String(v ?? "").toLowerCase().includes(f.text.toLowerCase())) return false;
  return true;
}
const active = (f?: ColFilter) => !!f && (!!f.values?.length || !!f.text || !!f.empty);

export function DataGrid({
  table,
  headers,
  rows,
  rowKey,
  tools,
  lead,
  rowClass,
  selected: outerSelected,
  onSelect: outerOnSelect,
  empty = "No rows.",
}: {
  table: string;
  headers: string[];
  rows: Row[];
  rowKey: (r: Row, i: number) => string;
  tools: GridTools;
  lead?: { label: string; cell: (r: Row) => React.ReactNode };
  rowClass?: (r: Row) => string | undefined;
  selected?: Set<string>;
  onSelect?: (s: Set<string>) => void;
  empty?: string;
}) {
  const [filters, setFilters] = React.useState<Record<string, ColFilter>>({});
  const [sort, setSort] = React.useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [innerSel, setInnerSel] = React.useState<Set<string>>(new Set());
  const selected = outerSelected ?? innerSel;
  const setSelected = outerOnSelect ?? setInnerSel;
  const [page, setPage] = React.useState(1);
  const [size, setSize] = React.useState(50);
  const [exporting, setExporting] = React.useState(false);
  React.useEffect(() => (setFilters({}), setSort(null), setInnerSel(new Set())), [table]);

  const phoneCols = React.useMemo(
    () => (tools.copyPhone ? headers.filter((h) => PHONE_HEADER.test(h) || rows.slice(0, 40).filter((r) => !blank(r[h])).every((r) => PHONE_VALUE.test(String(r[h]).trim())) && rows.slice(0, 40).some((r) => !blank(r[h]))) : []),
    [headers, rows, tools.copyPhone],
  );
  const keyed = React.useMemo(() => rows.map((r, i) => ({ r, k: rowKey(r, i) })), [rows, rowKey]);
  const shownAll = React.useMemo(() => {
    let out = keyed.filter(({ r }) => Object.entries(filters).every(([c, f]) => matches(r[c], f)));
    if (sort) {
      const num = (v: string) => (/^-?[\d,.]+$/.test(v) ? parseFloat(v.replace(/,/g, "")) : NaN);
      out = [...out].sort((a, b) => {
        const x = String(a.r[sort.col] ?? ""), y = String(b.r[sort.col] ?? "");
        const nx = num(x), ny = num(y);
        return (Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y, undefined, { numeric: true })) * sort.dir;
      });
    }
    return out;
  }, [keyed, filters, sort]);
  const count = shownAll.length;
  React.useEffect(() => setPage(1), [filters, sort, size]);
  const pages = Math.max(1, Math.ceil(count / size));
  const pageRows = shownAll.slice((page - 1) * size, page * size);
  const allOn = pageRows.length > 0 && pageRows.every(({ k }) => selected.has(k));
  const toggle = (k: string) => { const n = new Set(selected); if (n.has(k)) n.delete(k); else n.add(k); setSelected(n); };
  const nFilters = Object.values(filters).filter(active).length;

  const copyPhones = async (from: Row[]) => {
    const phones = [...new Set(from.flatMap((r) => phoneCols.map((c) => String(r[c] ?? "").trim())).filter((p) => p && !blank(p)))];
    if (!phones.length) return void toast.error("No phone numbers in these rows.");
    await navigator.clipboard.writeText(phones.join("\n"));
    toast.success(`${phones.length} phone number${phones.length === 1 ? "" : "s"} copied`);
  };
  const chosenRows = shownAll.filter(({ k }) => selected.has(k)).map(({ r }) => r);

  return (
    <div className="space-y-2">
      {(nFilters > 0 || selected.size > 0 || tools.export || phoneCols.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {nFilters > 0 && (
            <>
              {Object.entries(filters).filter(([, f]) => active(f)).map(([c, f]) => (
                <span key={c} className="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5">
                  <strong>{c}</strong>: {f.empty ? (f.empty === "empty" ? "empty" : "not empty") : ""}{f.values?.length ? `${f.values.length} value${f.values.length === 1 ? "" : "s"}` : ""}{f.text ? ` has “${f.text}”` : ""}
                  <button type="button" aria-label={`Clear the ${c} filter`} onClick={() => setFilters(({ [c]: _, ...rest }) => rest)}><XIcon className="size-3" /></button>
                </span>
              ))}
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFilters({})}>Clear filters</Button>
            </>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {selected.size > 0 && <span className="font-medium">{selected.size} chosen</span>}
            {selected.size > 0 && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Unchoose</Button>}
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!count} onClick={() => setSelected(new Set(shownAll.map(({ k }) => k)))}>Choose all {count.toLocaleString()} shown</Button>
            {phoneCols.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!count} onClick={() => copyPhones(selected.size ? chosenRows : shownAll.map(({ r }) => r))}>
                <PhoneIcon /> Copy phones ({selected.size ? "chosen" : "shown"})
              </Button>
            )}
            {tools.export && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!count} onClick={() => setExporting(true)}><DownloadIcon /> Export…</Button>}
          </span>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-[1] bg-muted/80 backdrop-blur">
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="w-8 px-2 py-2">
                  <Checkbox aria-label="Choose the rows on this page" checked={allOn} onCheckedChange={(v) => { const n = new Set(selected); pageRows.forEach(({ k }) => (v === true ? n.add(k) : n.delete(k))); setSelected(n); }} />
                </th>
                {lead && <th className="px-2 py-2 font-medium whitespace-nowrap">{lead.label}</th>}
                {headers.map((h) => (
                  <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">
                    <span className="flex items-center gap-0.5">
                      <button type="button" className="flex items-center gap-0.5 hover:text-foreground" onClick={() => setSort((s) => (s?.col !== h ? { col: h, dir: 1 } : s.dir === 1 ? { col: h, dir: -1 } : null))} aria-label={`Sort by ${h}`}>
                        {h}
                        {sort?.col === h && (sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
                      </button>
                      {tools.columnFilters && <ColumnFilter col={h} rows={keyed.filter(({ r }) => Object.entries(filters).every(([c, f]) => c === h || matches(r[c], f))).map(({ r }) => r)} value={filters[h]} onChange={(f) => setFilters(({ [h]: _, ...rest }) => (active(f) ? { ...rest, [h]: f } : rest))} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(({ r, k }) => (
                <tr key={k} className={cn("border-t hover:bg-muted/40", selected.has(k) && "bg-primary/5", rowClass?.(r))}>
                  <td className="px-2 py-1.5"><Checkbox aria-label={`Choose row ${k}`} checked={selected.has(k)} onCheckedChange={() => toggle(k)} /></td>
                  {lead && <td className="px-2 py-1.5 whitespace-nowrap">{lead.cell(r)}</td>}
                  {headers.map((h) => (
                    <td key={h} className="max-w-[22rem] truncate px-2 py-1.5" title={r[h]}>
                      {phoneCols.includes(h) && !blank(r[h]) ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="tabular-nums">{r[h]}</span>
                          <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Copy ${r[h]}`} onClick={async () => { await navigator.clipboard.writeText(String(r[h]).trim()); toast.success("Phone copied"); }}>
                            <CopyIcon className="size-3" />
                          </button>
                        </span>
                      ) : (
                        r[h]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {!count && (
                <tr><td colSpan={headers.length + 1 + (lead ? 1 : 0)} className="px-3 py-10 text-center text-muted-foreground">{rows.length ? "No rows match these filters." : empty}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {count > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>{((page - 1) * size + 1).toLocaleString()}–{Math.min(page * size, count).toLocaleString()} of {count.toLocaleString()}{count !== rows.length && ` (filtered from ${rows.length.toLocaleString()})`}</span>
            <span className="flex items-center gap-1">
              <select aria-label="Rows per page" value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-7 rounded-md border bg-background px-1">
                {[25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>{n} / page</option>)}
              </select>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeftIcon /></Button>
              <span className="tabular-nums">{page} / {pages}</span>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRightIcon /></Button>
            </span>
          </div>
        )}
      </div>
      {exporting && <ExportDialog table={table} headers={headers} shown={shownAll.map(({ r }) => r)} chosen={chosenRows} onClose={() => setExporting(false)} />}
    </div>
  );
}

function ColumnFilter({ col, rows, value, onChange }: { col: string; rows: Row[]; value?: ColFilter; onChange: (f: ColFilter) => void }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const counts = React.useMemo(() => {
    if (!open) return [] as [string, number][];
    const m = new Map<string, number>();
    for (const r of rows) { const v = blank(r[col]) ? "" : String(r[col]); m.set(v, (m.get(v) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows, col, open]);
  const list = counts.filter(([v]) => !q || v.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  const picked = new Set(value?.values ?? []);
  const set = (p: Partial<ColFilter>) => onChange({ ...(value ?? {}), ...p });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Filter ${col}`} className={cn("rounded p-0.5 hover:bg-muted hover:text-foreground", active(value) && "text-primary")}>
          <FilterIcon className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-3 text-xs">
        <p className="font-semibold">{col}</p>
        <Input value={value?.text ?? ""} onChange={(e) => set({ text: e.target.value || undefined })} placeholder="Contains…" className="h-7 text-xs" />
        <div className="flex gap-1">
          {([["", "Any"], ["filled", "Not empty"], ["empty", "Empty"]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={(value?.empty ?? "") === k ? "secondary" : "ghost"} className="h-6 px-2 text-[11px]" onClick={() => set({ empty: (k || undefined) as ColFilter["empty"] })}>{l}</Button>
          ))}
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${counts.length.toLocaleString()} values`} className="h-7 text-xs" />
        <div className="flex gap-2">
          <button type="button" className="underline" onClick={() => set({ values: list.map(([v]) => v) })}>All listed</button>
          <button type="button" className="underline" onClick={() => set({ values: undefined })}>None</button>
        </div>
        <div className="max-h-56 space-y-0.5 overflow-auto">
          {list.map(([v, n]) => (
            <label key={v || "(empty)"} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
              <Checkbox checked={picked.has(v)} onCheckedChange={(c) => set({ values: c === true ? [...picked, v] : [...picked].filter((x) => x !== v) })} />
              <span className="min-w-0 flex-1 truncate">{v || <em className="text-muted-foreground">(empty)</em>}</span>
              <span className="tabular-nums text-muted-foreground">{n}</span>
            </label>
          ))}
          {counts.length > 300 && !q && <p className="text-muted-foreground">Showing the 300 most common; search for others.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
const xmlCell = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function ExportDialog({ table, headers, shown, chosen, onClose }: { table: string; headers: string[]; shown: Row[]; chosen: Row[]; onClose: () => void }) {
  const [scope, setScope] = React.useState<"shown" | "chosen" | "range">(chosen.length ? "chosen" : "shown");
  const [from, setFrom] = React.useState(1);
  const [to, setTo] = React.useState(Math.min(shown.length, 1000));
  const [cols, setCols] = React.useState<string[]>(headers);
  const [format, setFormat] = React.useState<"csv" | "xls">("xls");
  const rows = scope === "chosen" ? chosen : scope === "range" ? shown.slice(Math.max(0, from - 1), Math.max(from, to)) : shown;
  const go = async () => {
    if (!cols.length) return void toast.error("Choose at least one column.");
    const r = await auditCmsExportAction({ table, rows: rows.length, columns: cols.length });
    if (!r.ok) return void toast.error(r.error);
    const name = `noor-${table}-${new Date().toISOString().slice(0, 10)}`;
    let blob: Blob;
    if (format === "csv") blob = new Blob(["﻿" + [cols.map(csvCell).join(","), ...rows.map((x) => cols.map((c) => csvCell(x[c])).join(","))].join("\r\n")], { type: "text/csv;charset=utf-8" });
    else {
      const head = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${xmlCell(table).slice(0, 30)}"><Table>`;
      const line = (vals: unknown[]) => `<Row>${vals.map((v) => `<Cell><Data ss:Type="String">${xmlCell(v)}</Data></Cell>`).join("")}</Row>`;
      blob = new Blob([head + line(cols) + rows.map((x) => line(cols.map((c) => x[c]))).join("") + "</Table></Worksheet></Workbook>"], { type: "application/vnd.ms-excel" });
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast.success(`${rows.length.toLocaleString()} rows exported`);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export saved {table}</DialogTitle>
          <DialogDescription>From the saved copy, with the filters and sort you see. Exports are recorded in the audit log.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Rows</p>
            <label className="flex items-center gap-2"><input type="radio" checked={scope === "shown"} onChange={() => setScope("shown")} /> All shown ({shown.length.toLocaleString()})</label>
            <label className="flex items-center gap-2"><input type="radio" disabled={!chosen.length} checked={scope === "chosen"} onChange={() => setScope("chosen")} /> Chosen rows ({chosen.length.toLocaleString()})</label>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" checked={scope === "range"} onChange={() => setScope("range")} /> Rows
              <Input type="number" min={1} max={shown.length} value={from} onChange={(e) => (setScope("range"), setFrom(Math.max(1, Number(e.target.value) || 1)))} className="h-7 w-24" aria-label="From row" />
              to
              <Input type="number" min={1} max={shown.length} value={to} onChange={(e) => (setScope("range"), setTo(Math.min(shown.length, Number(e.target.value) || 1)))} className="h-7 w-24" aria-label="To row" />
              of the shown order
            </label>
          </div>
          <div className="space-y-1.5">
            <p className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase">
              Columns ({cols.length} of {headers.length})
              <span className="flex gap-2 normal-case font-normal">
                <button type="button" className="underline" onClick={() => setCols(headers)}>All</button>
                <button type="button" className="underline" onClick={() => setCols([])}>None</button>
              </span>
            </p>
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-auto">
              {headers.map((h) => (
                <label key={h} className="flex items-center gap-2 text-xs">
                  <Checkbox checked={cols.includes(h)} onCheckedChange={(v) => setCols((c) => (v === true ? headers.filter((x) => c.includes(x) || x === h) : c.filter((x) => x !== h)))} />
                  <span className="truncate">{h}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2"><input type="radio" checked={format === "xls"} onChange={() => setFormat("xls")} /> Excel</label>
            <label className="flex items-center gap-2"><input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} /> CSV</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={!rows.length || !cols.length}><DownloadIcon /> Export {rows.length.toLocaleString()} rows</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
