"use client";

import * as React from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { ClipboardPasteIcon, DownloadIcon, FileSpreadsheetIcon, FolderOpenIcon, LayoutTemplateIcon, Loader2Icon, PlusIcon, PrinterIcon, SaveIcon, ScanSearchIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { crossCheckAction, deleteFileAction, getFileAction, saveFileAction } from "@/app/actions/tools";
import { CopyAiButton, downloadBlob, safeName, toCsv } from "@/components/app/tools/shared";
import { cellCss, display, Spreadsheet, usedRange } from "@/components/app/tools/spreadsheet";
import { blankBook, fromTable, toBook, type BookData } from "@/lib/sheet-book";
import { Calc } from "@/lib/formula";
import { esc, printHtml } from "@/components/app/tools/doc-model";
import { SHEET_TEMPLATES } from "@/lib/sheet-templates";
import type { CrossResult } from "@/server/tools-data";
import { cn } from "@/lib/utils";

type Saved = { id: string; title: string; updated_at: string };
type Check = { results: CrossResult[]; summary: { total: number; match: number; mismatch: number; missing: number; invalid: number } };
const STATUS_LABEL: Record<CrossResult["status"], string> = { match: "Matches", mismatch: "Differs", missing: "Not in production", invalid: "Invalid" };
const FILL: Record<CrossResult["status"], string> = { match: "DCFCE7", mismatch: "FEE2E2", missing: "FEE2E2", invalid: "FECACA" };

// Guesses which column holds the code, the title and the teacher.
function guess(headers: string[]) {
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h.toLowerCase()));
  return { code: find(/\b(code|item[_ ]?code|id|camera)\b/), title: find(/\b(title|name|part|lesson)\b/), teacher: find(/\b(teacher|presenter|instructor|tutor)\b/) };
}

export function SheetsClient({ saved: initialSaved, canCrossCheck, aiOn, workspace, who }: { saved: Saved[]; canCrossCheck: boolean; aiOn: boolean; workspace: string; who: string }) {
  const [book, setBook] = React.useState<BookData | null>(null);
  const [title, setTitle] = React.useState("Untitled workbook");
  const [fileId, setFileId] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(initialSaved);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [view, setView] = React.useState<"sheet" | "check">("sheet");
  const [paste, setPaste] = React.useState(false);
  const [check, setCheck] = React.useState<Check | null>(null);
  const [map, setMap] = React.useState({ code: -1, title: -1, teacher: -1 });
  const [statusFilter, setStatusFilter] = React.useState<"all" | "problems" | CrossResult["status"]>("all");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = (b: BookData, name: string, id: string | null = null) => {
    if (dirty && !confirm("Leave this workbook without saving?")) return;
    setBook(b);
    setTitle(name);
    setFileId(id);
    setCheck(null);
    setDirty(false);
    setView("sheet");
    const s = b.sheets[b.active]!;
    setMap(guess((s.cells[0] ?? []).map(String)));
  };
  const change = (b: BookData) => {
    setBook(b);
    setDirty(true);
  };

  const open = async (file: File) => {
    setBusy("open");
    const fd = new FormData();
    fd.set("file", file);
    const xlsx = /\.xlsx$/i.test(file.name);
    const res = await fetch(`/api/tools/sheet${xlsx ? "?book=1" : ""}`, { method: "POST", body: fd });
    const j = await res.json().catch(() => ({ error: "The file could not be read." }));
    setBusy(null);
    if (!res.ok) return toast.error(j.error);
    const name = file.name.replace(/\.[^.]+$/, "");
    if (xlsx) load(toBook(j), name);
    else load(fromTable(j.name ?? name, j.headers, j.rows), name);
    toast.success("Opened");
  };

  // The active sheet as a table (first row = column names) with values worked out, for the cross-check and exports.
  const calc = React.useMemo(() => (book ? new Calc(book.sheets.map((s) => ({ name: s.name, cells: s.cells }))) : null), [book]);
  const table = React.useMemo(() => {
    if (!book || !calc) return null;
    const s = book.sheets[book.active]!;
    const { r2, c2 } = usedRange(s);
    const rows = Array.from({ length: r2 + 1 }, (_, r) => Array.from({ length: c2 + 1 }, (_, c) => display(calc, book.active, s, r, c)));
    return { name: s.name, headers: (rows[0] ?? []).map((h, i) => h || `Column ${i + 1}`), rows: rows.slice(1) };
  }, [book, calc]);

  const save = async () => {
    if (!book) return;
    setBusy("save");
    const r = await saveFileAction("sheet", { id: fileId ?? undefined, title, data: book });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    const id = r.data as string;
    setFileId(id);
    setSaved((all) => [{ id, title, updated_at: new Date().toISOString() }, ...all.filter((f) => f.id !== id)]);
    setDirty(false);
    toast.success("Saved to your sheets");
  };

  const exportXlsx = async (name: string, body: unknown) => {
    setBusy("xlsx");
    const res = await fetch("/api/tools/sheet", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    if (!res.ok) return toast.error((await res.json().catch(() => ({ error: "Export failed." }))).error);
    downloadBlob(await res.blob(), safeName(name, "xlsx"));
  };
  const sheetHtml = () => {
    if (!book || !calc) return "";
    const s = book.sheets[book.active]!;
    const { r2, c2 } = usedRange(s);
    const rows: string[] = [];
    for (let r = 0; r <= r2; r++) {
      const tds: string[] = [];
      for (let c = 0; c <= c2; c++) {
        const st = s.styles[`${r}:${c}`];
        const css = cellCss(st, calc.value(book.active, r, c));
        const style = Object.entries(css)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${String(v).replace(/[<>"]/g, "")}`)
          .join(";");
        tds.push(`<td style="${style}">${esc(display(calc, book.active, s, r, c))}</td>`);
      }
      rows.push(`<tr>${tds.join("")}</tr>`);
    }
    return `<h2>${esc(title)} · ${esc(s.name)}</h2><table class="sheet">${rows.join("")}</table>`;
  };

  const runCheck = async () => {
    if (!table) return;
    if (map.code < 0 && map.title < 0) return toast.error("Choose the column with the code (or at least the title).");
    setBusy("check");
    const rows = table.rows.map((r, i) => ({ row: i + 2, code: map.code >= 0 ? (r[map.code] ?? "") : "", title: map.title >= 0 ? (r[map.title] ?? "") : "", teacher: map.teacher >= 0 ? (r[map.teacher] ?? "") : "" }));
    const r = await crossCheckAction(rows);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setCheck(r.data as Check);
    setStatusFilter("problems");
    const s = (r.data as Check).summary;
    toast.success(`${s.match} match, ${s.mismatch + s.missing + s.invalid} need a look`);
  };
  const reportRows = () =>
    check!.results.map((r) => [String(r.row), STATUS_LABEL[r.status], r.input.code, r.input.title, r.input.teacher, r.ops?.code ?? "", r.ops?.title ?? "", r.ops?.teacher ?? "", r.ops?.stage ?? "", r.ops?.lifecycle ?? "", [r.ops?.grade, r.ops?.subject].filter(Boolean).join(" · "), r.issues.join(" ")]);
  const REPORT_HEAD = ["Row", "Result", "Sheet code", "Sheet title", "Sheet teacher", "Production code", "Production title", "Production teacher", "Stage", "Lifecycle", "Grade · subject", "What differs"];
  const aiText = (ask: string) => {
    if (!check || !table) return "";
    const s = check.summary;
    const problems = check.results.filter((r) => r.status !== "match").slice(0, 300);
    return [
      `# Cross-check of "${table.name}" against ${workspace} production data`,
      "",
      `Checked by ${who} on ${new Date().toISOString().slice(0, 10)}. ${s.total} rows: ${s.match} match, ${s.mismatch} differ, ${s.missing} not in production, ${s.invalid} invalid.`,
      "",
      "## Rows that need a look",
      "",
      "| Row | Result | Sheet code | Sheet title | Sheet teacher | Production | What differs |",
      "|---|---|---|---|---|---|---|",
      ...problems.map((r) => `| ${r.row} | ${STATUS_LABEL[r.status]} | ${r.input.code} | ${r.input.title.replace(/\|/g, "/")} | ${r.input.teacher} | ${r.ops ? `${r.ops.code} · ${r.ops.title.replace(/\|/g, "/")} · ${r.ops.teacher ?? ""} · ${r.ops.stage ?? r.ops.lifecycle}` : "—"} | ${r.issues.join(" ").replace(/\|/g, "/")} |`),
      "",
      "## Request",
      "",
      ask.trim() || "_Write what you want the AI to do with these results._",
    ].join("\n");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt,.json" className="hidden" onChange={(e) => e.target.files?.[0] && open(e.target.files[0]).finally(() => (e.target.value = ""))} />
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          {busy === "open" ? <Loader2Icon className="animate-spin" /> : <FolderOpenIcon />} Open .xlsx / .csv
        </Button>
        <Button size="sm" variant="outline" onClick={() => load(blankBook(), "Untitled workbook")}>
          <PlusIcon /> New workbook
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <LayoutTemplateIcon /> Templates
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-1" align="start">
            {SHEET_TEMPLATES.map((t) => (
              <button key={t.key} type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted" onClick={() => load(t.book(), t.label)}>
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.hint}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="outline" onClick={() => setPaste(true)}>
          <ClipboardPasteIcon /> Paste data
        </Button>
        {saved.length > 0 && (
          <Select
            value=""
            onValueChange={async (id) => {
              const r = await getFileAction("sheet", id);
              if (!r.ok) return toast.error(r.error);
              const f = r.data as { id: string; title: string; data: unknown };
              load(toBook(f.data), f.title, f.id);
            }}
          >
            <SelectTrigger className="h-8 w-56" aria-label="Open a saved workbook">
              <SelectValue placeholder={`Saved workbooks (${saved.length})`} />
            </SelectTrigger>
            <SelectContent>
              {saved.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!book ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <FileSpreadsheetIcon className="size-8" />
            Open an Excel or CSV file, paste rows from a spreadsheet, start from a template, or start a new workbook.
            <span>Formulas work as in Excel (SUM, IF, VLOOKUP, XLOOKUP, SUMIFS and more than 100 others); styles, charts and several sheets are saved and exported to .xlsx.</span>
            {canCrossCheck && <span>Then cross-check codes, titles and teachers against production.</span>}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} className="h-8 w-64 font-medium" aria-label="Workbook name" />
            {dirty && <span className="text-xs text-amber-700 dark:text-amber-300">Not saved</span>}
            {canCrossCheck && (
              <div className="inline-flex rounded-md border p-0.5 text-xs" role="tablist" aria-label="View">
                <button type="button" role="tab" aria-selected={view === "sheet"} className={cn("rounded px-2 py-1", view === "sheet" && "bg-primary text-primary-foreground")} onClick={() => setView("sheet")}>
                  Spreadsheet
                </button>
                <button type="button" role="tab" aria-selected={view === "check"} className={cn("rounded px-2 py-1", view === "check" && "bg-primary text-primary-foreground")} onClick={() => setView("check")}>
                  Check against production
                </button>
              </div>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" onClick={save} disabled={busy === "save"}>
                {busy === "save" ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    <DownloadIcon /> Export
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-1" align="end">
                  <ExportItem label="Excel workbook (.xlsx)" hint="Every sheet, formulas, styles, widths" onClick={() => exportXlsx(title, { title, book })} />
                  <ExportItem label="CSV, this sheet (.csv)" hint="Values as shown" onClick={() => table && downloadBlob(new Blob([toCsv(table.headers, table.rows)], { type: "text/csv" }), safeName(`${title} ${table.name}`, "csv"))} />
                  <ExportItem
                    label="Tab-separated (.tsv)"
                    onClick={() => table && downloadBlob(new Blob([[table.headers, ...table.rows].map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\r\n")], { type: "text/tab-separated-values" }), safeName(`${title} ${table.name}`, "tsv"))}
                  />
                  <ExportItem label="Web page (.html)" onClick={() => downloadBlob(new Blob([`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>${SHEET_CSS}</style>${sheetHtml()}`], { type: "text/html" }), safeName(title, "html"))} />
                  <ExportItem label="JSON (.json)" hint="Rows as objects, by column name" onClick={() => table && downloadBlob(new Blob([JSON.stringify(table.rows.map((r) => Object.fromEntries(table.headers.map((h, i) => [h, r[i] ?? ""]))), null, 2)], { type: "application/json" }), safeName(title, "json"))} />
                  <ExportItem label="PDF (print)" hint="Save as PDF in the print dialog" icon={<PrinterIcon className="size-3.5" />} onClick={() => printHtml(title, sheetHtml(), `@page{size:A4 landscape;margin:12mm}${SHEET_CSS}`)} />
                </PopoverContent>
              </Popover>
              {fileId && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete saved workbook"
                  onClick={async () => {
                    if (!confirm("Delete this saved workbook?")) return;
                    const r = await deleteFileAction("sheet", fileId);
                    if (!r.ok) return toast.error(r.error);
                    setSaved((all) => all.filter((f) => f.id !== fileId));
                    setFileId(null);
                  }}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          </div>

          {view === "sheet" ? (
            <Spreadsheet book={book} onChange={change} />
          ) : (
            table && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ScanSearchIcon className="size-4" /> Cross-check {table.name} against Ops data
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">The first row holds the column names. Each row is looked up by its code in production (or by its title when it has no code), then the title and teacher are compared.</p>
                  <div className="flex flex-wrap items-end gap-3">
                    {(["code", "title", "teacher"] as const).map((k) => (
                      <label key={k} className="space-y-1 text-xs">
                        <span className="block font-medium capitalize">{k} column</span>
                        <Select value={String(map[k])} onValueChange={(v) => setMap({ ...map, [k]: Number(v) })}>
                          <SelectTrigger className="h-8 w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="-1">Not in this sheet</SelectItem>
                            {table.headers.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                    ))}
                    <Button onClick={runCheck} disabled={busy === "check"}>
                      {busy === "check" ? <Loader2Icon className="animate-spin" /> : <ScanSearchIcon />} Cross-check {table.rows.length.toLocaleString()} rows
                    </Button>
                  </div>
                  {check && (
                    <div className="space-y-3 border-t pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {(
                          [
                            ["all", `All ${check.summary.total}`],
                            ["problems", `Need a look ${check.summary.total - check.summary.match}`],
                            ["match", `Match ${check.summary.match}`],
                            ["mismatch", `Differ ${check.summary.mismatch}`],
                            ["missing", `Not in production ${check.summary.missing}`],
                            ["invalid", `Invalid ${check.summary.invalid}`],
                          ] as const
                        ).map(([k, l]) => (
                          <Button key={k} size="sm" variant={statusFilter === k ? "secondary" : "ghost"} onClick={() => setStatusFilter(k)}>
                            {k === "match" ? <Badge className="mr-1 size-2 rounded-full bg-green-600 p-0" /> : k !== "all" && k !== "problems" ? <Badge className="mr-1 size-2 rounded-full bg-red-600 p-0" /> : null}
                            {l}
                          </Button>
                        ))}
                        <div className="ml-auto flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === "xlsx"}
                            onClick={() =>
                              exportXlsx(`${table.name} cross-check`, {
                                title: `${table.name} cross-check`,
                                sheets: [
                                  { name: "Cross-check", headers: REPORT_HEAD, rows: reportRows(), fills: check.results.map((r) => FILL[r.status]), notes: [`Cross-check of ${table.name} against ${workspace} production data, ${new Date().toLocaleString()}.`, `${check.summary.match} match, ${check.summary.mismatch} differ, ${check.summary.missing} not in production, ${check.summary.invalid} invalid.`] },
                                  { name: "Sheet", headers: ["Result", ...table.headers], rows: table.rows.map((r, i) => [STATUS_LABEL[check.results[i]?.status ?? "invalid"], ...r]), fills: check.results.map((r) => FILL[r.status]) },
                                ],
                              })
                            }
                          >
                            <DownloadIcon /> Report .xlsx
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([toCsv(REPORT_HEAD, reportRows())], { type: "text/csv" }), safeName(`${table.name} cross-check`, "csv"))}>
                            <DownloadIcon /> Report .csv
                          </Button>
                          {aiOn && <CopyAiButton build={aiText} />}
                        </div>
                      </div>
                      <div className="max-h-[50vh] overflow-auto rounded-md border">
                        <table className="w-full border-collapse text-xs">
                          <thead className="sticky top-0 bg-muted">
                            <tr>
                              <th className="px-2 py-1 text-right">Row</th>
                              <th className="px-2 py-1 text-left">Result</th>
                              {table.headers.map((h, i) => (
                                <th key={i} className="border-l px-2 py-1 text-left">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {check.results
                              .map((r, i) => ({ r, i }))
                              .filter(({ r }) => (statusFilter === "all" ? true : statusFilter === "problems" ? r.status !== "match" : r.status === statusFilter))
                              .slice(0, 500)
                              .map(({ r, i }) => (
                                <tr key={i} className={r.status === "match" ? "bg-green-500/10" : "bg-red-500/10"} title={r.issues.join("\n")}>
                                  <td className="px-2 py-1 text-right tabular-nums">{r.row}</td>
                                  <td className="max-w-72 px-2 py-1">
                                    <span className={cn("font-medium", r.status === "match" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{STATUS_LABEL[r.status]}</span>
                                    {r.issues[0] && <span className="block truncate text-[11px] text-muted-foreground">{r.issues[0]}</span>}
                                  </td>
                                  {table.headers.map((_, c) => (
                                    <td key={c} className="border-l px-2 py-1">{table.rows[i]?.[c]}</td>
                                  ))}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {check.summary.match === check.summary.total && <p className="rounded-md border-l-4 border-green-600 bg-green-500/5 px-3 py-2 text-sm">Every row matches production.</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          )}
        </>
      )}

      <PasteDialog open={paste} onClose={() => setPaste(false)} onLoad={(headers, rows) => (load(fromTable("Pasted data", headers, rows), "Pasted data"), setPaste(false))} />
    </div>
  );
}

const SHEET_CSS = `table.sheet{border-collapse:collapse;font-size:9.5pt}table.sheet td{border:1px solid #d1d5db;padding:2pt 4pt;white-space:nowrap}h2{font-size:13pt;margin:0 0 6pt}`;

function ExportItem({ label, hint, onClick, icon }: { label: string; hint?: string; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-muted">
      <span className="mt-0.5">{icon ?? <DownloadIcon className="size-3.5" />}</span>
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

function PasteDialog({ open, onClose, onLoad }: { open: boolean; onClose: () => void; onLoad: (headers: string[], rows: string[][]) => void }) {
  const [text, setText] = React.useState("");
  const [header, setHeader] = React.useState(true);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste data</DialogTitle>
          <DialogDescription>Copy cells from Excel, Google Sheets or a CSV file and paste them here.</DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="font-mono text-xs" placeholder={"Code\tTitle\tTeacher\nG9-MAT-U1-P1\tIntroduction\tAbebe"} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} /> The first line has the column names
        </label>
        <DialogFooter>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy", delimiter: text.includes("\t") ? "\t" : "" });
              const data = parsed.data.slice(0, 50_000).map((r) => r.map((c) => String(c ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim()));
              if (!data.length) return toast.error("Nothing to read.");
              const width = Math.min(200, Math.max(...data.map((r) => r.length)));
              const headers = header ? Array.from({ length: width }, (_, i) => data[0]![i] || `Column ${i + 1}`) : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
              onLoad(headers, (header ? data.slice(1) : data).map((r) => headers.map((_, i) => r[i] ?? "")));
              setText("");
            }}
          >
            Load
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
