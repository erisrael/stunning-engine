"use client";

// Comparing a workbook with Myseed's own data (production, a department's tasks, finance, HR): the rows are matched
// by a key (an item code, a task code, a reference), then the columns paired by name are compared. Shows what
// matches, what differs (cell by cell), what is only in the workbook and what is only in Myseed; the result can be
// added to the workbook as sheets or downloaded as a coloured .xlsx report.

import * as React from "react";
import { toast } from "sonner";
import { DatabaseIcon, DownloadIcon, GitCompareArrowsIcon, Loader2Icon, SheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sheetSourceRowsAction, sheetSourcesAction } from "@/app/actions/tools";
import { downloadBlob, safeName } from "@/components/app/tools/shared";
import { blankSheet, type BookSheet, type CellStyle } from "@/lib/sheet-book";
import type { SheetSource } from "@/server/sheet-data";
import { cn } from "@/lib/utils";

type Row = Record<string, string | number | boolean | null>;
type Data = { columns: string[]; rows: Row[]; truncated: boolean };
type Result = { status: "same" | "different" | "sheet-only" | "myseed-only"; key: string; sheetRow: number | null; diffs: { col: string; mine: string; theirs: string }[]; theirs: Row | null; mine: string[] | null };

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const ALIASES: Record<string, string[]> = { code: ["itemcode", "partcode", "id", "taskcode", "employeecode"], title: ["name", "parttitle", "lesson", "task"], assignee: ["owner", "assignedto", "responsible"], amount: ["total", "value", "etb"], due_date: ["due", "deadline"], status: ["state", "stage_status"] };
function guess(header: string, fields: string[]) {
  const n = normName(header);
  const exact = fields.find((f) => normName(f) === n);
  if (exact) return exact;
  for (const [f, al] of Object.entries(ALIASES)) if (fields.includes(f) && (al.includes(n) || normName(f) === n)) return f;
  return fields.find((f) => n.length > 3 && (normName(f).includes(n) || n.includes(normName(f)))) ?? "";
}
// Values compared the way people mean them: case and spacing ignored, numbers as numbers, dates as dates.
function same(a: string, b: string) {
  const x = a.trim().replace(/\s+/g, " ").toLowerCase();
  const y = b.trim().replace(/\s+/g, " ").toLowerCase();
  if (x === y) return true;
  const nx = Number(x.replace(/,/g, ""));
  const ny = Number(y.replace(/,/g, ""));
  if (x !== "" && y !== "" && Number.isFinite(nx) && Number.isFinite(ny)) return Math.abs(nx - ny) < 0.005;
  const dx = /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null;
  const dy = /^\d{4}-\d{2}-\d{2}/.test(y) ? y.slice(0, 10) : null;
  return !!dx && dx === dy;
}
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function SheetCompare({ table, onAddSheets }: { table: { name: string; headers: string[]; rows: string[][] }; onAddSheets: (sheets: BookSheet[]) => void }) {
  const [sources, setSources] = React.useState<SheetSource[] | null>(null);
  const [src, setSrc] = React.useState("");
  const [data, setData] = React.useState<Data | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [keyCol, setKeyCol] = React.useState(-1);
  const [keyField, setKeyField] = React.useState("");
  const [pairs, setPairs] = React.useState<Record<number, string>>({});
  const [results, setResults] = React.useState<Result[] | null>(null);
  const [show, setShow] = React.useState<Result["status"] | "problems">("problems");

  React.useEffect(() => {
    void sheetSourcesAction().then((r) => (r.ok ? setSources(r.data as SheetSource[]) : setSources([])));
  }, []);

  const load = async (key: string) => {
    setSrc(key);
    setResults(null);
    if (!key) return setData(null);
    setBusy(true);
    const r = await sheetSourceRowsAction(key);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const d = r.data as Data;
    setData(d);
    const s = sources?.find((x) => x.key === key);
    const kf = s?.keyField && d.columns.includes(s.keyField) ? s.keyField : (d.columns[0] ?? "");
    setKeyField(kf);
    const kc = table.headers.findIndex((h) => guess(h, [kf]) === kf);
    setKeyCol(kc >= 0 ? kc : 0);
    setPairs(Object.fromEntries(table.headers.map((h, i) => [i, guess(h, d.columns)]).filter(([i, f]) => f && i !== (kc >= 0 ? kc : 0))));
    if (d.truncated) toast.message("The first 20,000 rows were loaded.");
  };

  const run = () => {
    if (!data || keyCol < 0 || !keyField) return;
    const theirs = new Map<string, Row>();
    for (const r of data.rows) {
      const k = str(r[keyField]).trim().toLowerCase();
      if (k) theirs.set(k, r);
    }
    const seen = new Set<string>();
    const out: Result[] = [];
    table.rows.forEach((row, i) => {
      const key = str(row[keyCol]).trim();
      if (!key) return;
      const t = theirs.get(key.toLowerCase());
      seen.add(key.toLowerCase());
      if (!t) return out.push({ status: "sheet-only", key, sheetRow: i + 2, diffs: [], theirs: null, mine: row });
      const diffs = Object.entries(pairs)
        .filter(([, f]) => f)
        .flatMap(([c, f]) => {
          const mine = str(row[Number(c)]);
          const th = str(t[f]);
          return same(mine, th) ? [] : [{ col: table.headers[Number(c)] ?? f, mine, theirs: th }];
        });
      out.push({ status: diffs.length ? "different" : "same", key, sheetRow: i + 2, diffs, theirs: t, mine: row });
    });
    for (const [k, r] of theirs) if (!seen.has(k)) out.push({ status: "myseed-only", key: str(r[keyField]), sheetRow: null, diffs: [], theirs: r, mine: null });
    setResults(out);
    setShow("problems");
  };

  const count = (s: Result["status"]) => results?.filter((r) => r.status === s).length ?? 0;
  const shown = (results ?? []).filter((r) => (show === "problems" ? r.status !== "same" : r.status === show));
  const srcLabel = sources?.find((s) => s.key === src)?.label ?? "Myseed";

  // The Myseed data as a sheet, and the comparison as a coloured sheet.
  const asSheets = (): BookSheet[] => {
    const out: BookSheet[] = [];
    if (data) {
      const cells = [data.columns, ...data.rows.map((r) => data.columns.map((c) => str(r[c])))];
      const styles: Record<string, CellStyle> = Object.fromEntries(data.columns.map((_, c) => [`0:${c}`, { b: true, fill: "#0f172a", color: "#ffffff" }]));
      out.push({ ...blankSheet(srcLabel.slice(0, 28)), cells, styles, freeze: { rows: 1, cols: 0 } });
    }
    if (results) {
      const head = ["Key", "Result", "Row in my sheet", "Column", "My value", "Myseed value"];
      const lines: string[][] = [];
      const fills: string[] = [];
      const LABEL = { same: "Same", different: "Differs", "sheet-only": "Only in my sheet", "myseed-only": "Only in Myseed" };
      const FILL = { same: "#dcfce7", different: "#fef3c7", "sheet-only": "#fee2e2", "myseed-only": "#dbeafe" };
      for (const r of results) {
        if (r.diffs.length) for (const d of r.diffs) (lines.push([r.key, LABEL[r.status], String(r.sheetRow ?? ""), d.col, d.mine, d.theirs]), fills.push(FILL[r.status]));
        else (lines.push([r.key, LABEL[r.status], String(r.sheetRow ?? ""), "", "", ""]), fills.push(FILL[r.status]));
      }
      const styles: Record<string, CellStyle> = Object.fromEntries(head.map((_, c) => [`0:${c}`, { b: true, fill: "#0f172a", color: "#ffffff" }]));
      fills.forEach((f, i) => head.forEach((_, c) => (styles[`${i + 1}:${c}`] = { fill: f })));
      out.push({ ...blankSheet("Comparison"), cells: [head, ...lines], styles, freeze: { rows: 1, cols: 0 }, cols: { 0: 140, 1: 120, 3: 140, 4: 180, 5: 180 } });
    }
    return out;
  };
  const exportReport = async () => {
    const res = await fetch("/api/tools/sheet", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `${table.name} compared with ${srcLabel}`, book: { v: 2, sheets: asSheets(), active: 0 } }) });
    if (!res.ok) return toast.error("The report could not be made.");
    downloadBlob(await res.blob(), safeName(`${table.name} compared`, "xlsx"));
  };

  if (sources && !sources.length) return <p className="rounded-md border p-4 text-sm text-muted-foreground">No Myseed data is open to you to compare with. Ask Admin for access to the department or production data you need.</p>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompareArrowsIcon className="size-4" /> Compare with Myseed data
        </CardTitle>
        <CardDescription>The active sheet&apos;s first row holds its column names. Rows are matched by a key, then the paired columns are compared (case, spacing, number formats and date formats are ignored).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs md:col-span-3">
            <span className="font-medium">Myseed data</span>
            <div className="flex flex-wrap gap-2">
              {(sources ?? []).map((s) => (
                <button key={s.key} type="button" onClick={() => load(s.key)} className={cn("rounded-lg border px-3 py-2 text-left hover:border-primary", src === s.key && "border-primary bg-primary/5")}>
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <DatabaseIcon className="size-3.5" /> {s.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{s.hint}</span>
                </button>
              ))}
              {!sources && <span className="text-sm text-muted-foreground">Loading…</span>}
            </div>
          </label>
        </div>
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Loading the data…
          </p>
        )}
        {data && (
          <>
            <p className="text-xs text-muted-foreground">
              {data.rows.length.toLocaleString()} rows from Myseed, {table.rows.length.toLocaleString()} in {table.name}.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="font-medium">Match rows by (my column)</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={keyCol} onChange={(e) => setKeyCol(Number(e.target.value))}>
                  {table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">… with Myseed&apos;s</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={keyField} onChange={(e) => setKeyField(e.target.value)}>
                  {data.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Columns to compare</p>
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {table.headers.map((h, i) =>
                  i === keyCol ? null : (
                    <label key={i} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                      <span className="w-32 truncate font-medium" title={h}>{h}</span>
                      <span className="text-muted-foreground">with</span>
                      <select className="h-7 min-w-0 flex-1 rounded border bg-background px-1" value={pairs[i] ?? ""} onChange={(e) => setPairs({ ...pairs, [i]: e.target.value })}>
                        <option value="">Do not compare</option>
                        {data.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  ),
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={run}>
                <GitCompareArrowsIcon /> Compare
              </Button>
              <Button variant="outline" onClick={() => (onAddSheets(asSheets().slice(0, 1)), toast.success("Added as a new sheet"))}>
                <SheetIcon /> Open Myseed&apos;s data as a sheet
              </Button>
            </div>
          </>
        )}
        {results && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["problems", `Need a look ${results.length - count("same")}`, ""],
                  ["same", `Same ${count("same")}`, "bg-green-600"],
                  ["different", `Differ ${count("different")}`, "bg-amber-500"],
                  ["sheet-only", `Only in my sheet ${count("sheet-only")}`, "bg-red-600"],
                  ["myseed-only", `Only in Myseed ${count("myseed-only")}`, "bg-blue-600"],
                ] as const
              ).map(([k, l, dot]) => (
                <Button key={k} size="sm" variant={show === k ? "secondary" : "ghost"} onClick={() => setShow(k)}>
                  {dot && <span className={cn("mr-1 size-2 rounded-full", dot)} />}
                  {l}
                </Button>
              ))}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => (onAddSheets(asSheets()), toast.success("Added to the workbook"))}>
                  <SheetIcon /> Add to the workbook
                </Button>
                <Button size="sm" variant="outline" onClick={exportReport}>
                  <DownloadIcon /> Report .xlsx
                </Button>
              </div>
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-md border">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Key</th>
                    <th className="px-2 py-1.5 text-left">Result</th>
                    <th className="px-2 py-1.5 text-right">Row</th>
                    <th className="px-2 py-1.5 text-left">What differs (mine → Myseed)</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 1000).map((r, i) => (
                    <tr key={i} className={cn("border-t", r.status === "same" ? "bg-green-500/5" : r.status === "different" ? "bg-amber-500/10" : r.status === "sheet-only" ? "bg-red-500/10" : "bg-blue-500/10")}>
                      <td className="px-2 py-1 font-mono">{r.key}</td>
                      <td className="px-2 py-1">{{ same: "Same", different: "Differs", "sheet-only": "Only in my sheet", "myseed-only": "Only in Myseed" }[r.status]}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.sheetRow ?? ""}</td>
                      <td className="px-2 py-1">
                        {r.diffs.map((d, j) => (
                          <span key={j} className="mr-3 inline-block">
                            <b>{d.col}:</b> <span className="line-through opacity-70">{d.mine || "(empty)"}</span> → <span className="font-medium">{d.theirs || "(empty)"}</span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {!shown.length && (
                    <tr>
                      <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">Nothing here.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
