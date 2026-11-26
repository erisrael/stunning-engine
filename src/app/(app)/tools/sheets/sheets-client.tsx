"use client";

import * as React from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, ClipboardPasteIcon, DownloadIcon, FileSpreadsheetIcon, FolderOpenIcon, Loader2Icon, PlusIcon, SaveIcon, ScanSearchIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crossCheckAction, deleteFileAction, getFileAction, saveFileAction } from "@/app/actions/tools";
import { CopyAiButton, downloadBlob, safeName, toCsv } from "@/components/app/tools/shared";
import type { CrossResult } from "@/server/tools-data";
import { cn } from "@/lib/utils";

type Sheet = { name: string; headers: string[]; rows: string[][] };
type Saved = { id: string; title: string; updated_at: string };
type Check = { results: CrossResult[]; summary: { total: number; match: number; mismatch: number; missing: number; invalid: number } };
const PAGE = 200;
const STATUS_LABEL: Record<CrossResult["status"], string> = { match: "Matches", mismatch: "Differs", missing: "Not in production", invalid: "Invalid" };
const FILL: Record<CrossResult["status"], string> = { match: "DCFCE7", mismatch: "FEE2E2", missing: "FEE2E2", invalid: "FECACA" };

// Guesses which column holds the code, the title and the teacher.
function guess(headers: string[]) {
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h.toLowerCase()));
  return { code: find(/\b(code|item[_ ]?code|id|camera)\b/), title: find(/\b(title|name|part|lesson)\b/), teacher: find(/\b(teacher|presenter|instructor|tutor)\b/) };
}

export function SheetsClient({ saved: initialSaved, canCrossCheck, aiOn, workspace, who }: { saved: Saved[]; canCrossCheck: boolean; aiOn: boolean; workspace: string; who: string }) {
  const [sheet, setSheet] = React.useState<Sheet | null>(null);
  const [fileId, setFileId] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(initialSaved);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [colFilter, setColFilter] = React.useState<{ col: number; value: string } | null>(null);
  const [sort, setSort] = React.useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [page, setPage] = React.useState(0);
  const [paste, setPaste] = React.useState(false);
  const [check, setCheck] = React.useState<Check | null>(null);
  const [map, setMap] = React.useState({ code: -1, title: -1, teacher: -1 });
  const [statusFilter, setStatusFilter] = React.useState<"all" | "problems" | CrossResult["status"]>("all");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = (s: Sheet, id: string | null = null) => {
    setSheet(s);
    setFileId(id);
    setCheck(null);
    setSort(null);
    setColFilter(null);
    setQ("");
    setPage(0);
    setMap(guess(s.headers));
  };

  const open = async (file: File) => {
    setBusy("open");
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/tools/sheet", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({ error: "The file could not be read." }));
    setBusy(null);
    if (!res.ok) return toast.error(j.error);
    load(j as Sheet);
    toast.success(`${(j as Sheet).rows.length.toLocaleString()} rows opened`);
  };

  // The rows shown, by index into sheet.rows, after search, column filter and sort.
  const view = React.useMemo(() => {
    if (!sheet) return [];
    const needle = q.toLowerCase();
    let idx = sheet.rows.map((_, i) => i);
    if (needle) idx = idx.filter((i) => sheet.rows[i]!.some((c) => c.toLowerCase().includes(needle)));
    if (colFilter?.value) idx = idx.filter((i) => (sheet.rows[i]![colFilter.col] ?? "").toLowerCase().includes(colFilter.value.toLowerCase()));
    if (check && statusFilter !== "all") idx = idx.filter((i) => (statusFilter === "problems" ? check.results[i]?.status !== "match" : check.results[i]?.status === statusFilter));
    if (sort) {
      const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      idx.sort((a, b) => sort.dir * coll.compare(sheet.rows[a]![sort.col] ?? "", sheet.rows[b]![sort.col] ?? ""));
    }
    return idx;
  }, [sheet, q, colFilter, sort, check, statusFilter]);
  const pages = Math.max(1, Math.ceil(view.length / PAGE));

  const setCell = (r: number, c: number, v: string) =>
    setSheet((s) => {
      if (!s) return s;
      const rows = s.rows.slice();
      const row = rows[r]!.slice();
      row[c] = v;
      rows[r] = row;
      return { ...s, rows };
    });

  const runCheck = async () => {
    if (!sheet) return;
    if (map.code < 0 && map.title < 0) return toast.error("Choose the column with the code (or at least the title).");
    setBusy("check");
    const rows = sheet.rows.map((r, i) => ({ row: i + 2, code: map.code >= 0 ? (r[map.code] ?? "") : "", title: map.title >= 0 ? (r[map.title] ?? "") : "", teacher: map.teacher >= 0 ? (r[map.teacher] ?? "") : "" }));
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

  const exportXlsx = async (title: string, sheets: { name: string; headers: string[]; rows: string[][]; fills?: (string | null)[]; notes?: string[] }[]) => {
    setBusy("xlsx");
    const res = await fetch("/api/tools/sheet", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, sheets }) });
    setBusy(null);
    if (!res.ok) return toast.error((await res.json().catch(() => ({ error: "Export failed." }))).error);
    downloadBlob(await res.blob(), safeName(title, "xlsx"));
  };

  const aiText = (ask: string) => {
    if (!check || !sheet) return "";
    const s = check.summary;
    const problems = check.results.filter((r) => r.status !== "match").slice(0, 300);
    return [
      `# Cross-check of "${sheet.name}" against ${workspace} production data`,
      "",
      `Checked by ${who} on ${new Date().toISOString().slice(0, 10)}. ${s.total} rows: ${s.match} match, ${s.mismatch} differ, ${s.missing} not in production, ${s.invalid} invalid.`,
      "",
      "## Rows that need a look",
      "",
      "| Row | Result | Sheet code | Sheet title | Sheet teacher | Production | What differs |",
      "|---|---|---|---|---|---|---|",
      ...problems.map((r) => `| ${r.row} | ${STATUS_LABEL[r.status]} | ${r.input.code} | ${r.input.title.replace(/\|/g, "/")} | ${r.input.teacher} | ${r.ops ? `${r.ops.code} · ${r.ops.title.replace(/\|/g, "/")} · ${r.ops.teacher ?? ""} · ${r.ops.stage ?? r.ops.lifecycle}` : "—"} | ${r.issues.join(" ").replace(/\|/g, "/")} |`),
      problems.length < check.results.filter((r) => r.status !== "match").length ? "\n_(First 300 shown.)_" : "",
      "",
      "## Request",
      "",
      ask.trim() || "_Write what you want the AI to do with these results._",
    ].join("\n");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt,.json" className="hidden" onChange={(e) => e.target.files?.[0] && open(e.target.files[0]).finally(() => (e.target.value = ""))} />
        <Button onClick={() => fileRef.current?.click()} disabled={!!busy}>
          {busy === "open" ? <Loader2Icon className="animate-spin" /> : <FolderOpenIcon />} Open .xlsx / .csv
        </Button>
        <Button variant="outline" onClick={() => setPaste(true)}>
          <ClipboardPasteIcon /> Paste data
        </Button>
        <Button variant="outline" onClick={() => load({ name: "New sheet", headers: ["Code", "Title", "Teacher"], rows: [["", "", ""]] })}>
          <PlusIcon /> New sheet
        </Button>
        {saved.length > 0 && (
          <Select
            value=""
            onValueChange={async (id) => {
              const r = await getFileAction("sheet", id);
              if (!r.ok) return toast.error(r.error);
              const f = r.data as { id: string; data: Sheet };
              load(f.data, f.id);
            }}
          >
            <SelectTrigger className="w-56" aria-label="Open a saved sheet">
              <SelectValue placeholder="Saved sheets" />
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

      {!sheet ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <FileSpreadsheetIcon className="size-8" />
            Open an Excel or CSV file, paste rows copied from a spreadsheet, or start a new sheet.
            {canCrossCheck && <span>Then cross-check its codes, titles and teachers against production.</span>}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input value={sheet.name} onChange={(e) => setSheet({ ...sheet, name: e.target.value })} className="h-8 w-56 font-medium" aria-label="Sheet name" />
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Search all cells" className="h-8 w-52 pl-7" aria-label="Search" />
                </div>
                <Select value={colFilter ? String(colFilter.col) : "none"} onValueChange={(v) => setColFilter(v === "none" ? null : { col: Number(v), value: colFilter?.value ?? "" })}>
                  <SelectTrigger className="h-8 w-40" aria-label="Filter column">
                    <SelectValue placeholder="Filter column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No column filter</SelectItem>
                    {sheet.headers.map((h, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {colFilter && <Input value={colFilter.value} onChange={(e) => (setColFilter({ ...colFilter, value: e.target.value }), setPage(0))} placeholder="contains…" className="h-8 w-36" aria-label="Column filter" />}
                <span className="text-xs text-muted-foreground tabular">
                  {view.length.toLocaleString()} of {sheet.rows.length.toLocaleString()} rows
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSheet({ ...sheet, rows: [...sheet.rows, sheet.headers.map(() => "")] })}>
                    <PlusIcon /> Row
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSheet({ ...sheet, headers: [...sheet.headers, `Column ${sheet.headers.length + 1}`], rows: sheet.rows.map((r) => [...r, ""]) })}>
                    <PlusIcon /> Column
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === "xlsx"} onClick={() => exportXlsx(sheet.name, [{ name: sheet.name, headers: sheet.headers, rows: view.map((i) => sheet.rows[i]!) }])}>
                    <DownloadIcon /> .xlsx
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([toCsv(sheet.headers, view.map((i) => sheet.rows[i]!))], { type: "text/csv" }), safeName(sheet.name, "csv"))}>
                    <DownloadIcon /> .csv
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === "save"}
                    onClick={async () => {
                      setBusy("save");
                      const r = await saveFileAction("sheet", { id: fileId ?? undefined, title: sheet.name, data: sheet });
                      setBusy(null);
                      if (!r.ok) return toast.error(r.error);
                      const id = r.data as string;
                      setFileId(id);
                      setSaved((all) => [{ id, title: sheet.name, updated_at: new Date().toISOString() }, ...all.filter((f) => f.id !== id)]);
                      toast.success("Saved to your sheets");
                    }}
                  >
                    <SaveIcon /> Save
                  </Button>
                  {fileId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Delete saved sheet"
                      onClick={async () => {
                        if (!confirm("Delete this saved sheet?")) return;
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

              <div className="max-h-[60vh] overflow-auto rounded-md border">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr>
                      <th className="w-12 border-b px-2 py-1 text-right text-muted-foreground">#</th>
                      {check && <th className="border-b px-2 py-1 text-left">Result</th>}
                      {sheet.headers.map((h, c) => (
                        <th key={c} className="min-w-32 border-b border-l px-1 py-1 text-left">
                          <div className="flex items-center gap-1">
                            <input value={h} onChange={(e) => setSheet({ ...sheet, headers: sheet.headers.map((x, j) => (j === c ? e.target.value : x)) })} className="w-full min-w-0 bg-transparent px-1 font-semibold outline-none focus:bg-background" aria-label={`Column ${c + 1} name`} />
                            <button type="button" aria-label={`Sort by ${h}`} className="rounded p-0.5 hover:bg-background" onClick={() => setSort(sort?.col === c ? (sort.dir === 1 ? { col: c, dir: -1 } : null) : { col: c, dir: 1 })}>
                              {sort?.col === c ? sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3 opacity-30" />}
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete column ${h}`}
                              className="rounded p-0.5 opacity-40 hover:bg-background hover:opacity-100"
                              onClick={() => sheet.headers.length > 1 && setSheet({ ...sheet, headers: sheet.headers.filter((_, j) => j !== c), rows: sheet.rows.map((r) => r.filter((_, j) => j !== c)) })}
                            >
                              <XIcon className="size-3" />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="w-8 border-b" />
                    </tr>
                  </thead>
                  <tbody>
                    {view.slice(page * PAGE, page * PAGE + PAGE).map((i) => {
                      const res = check?.results[i];
                      return (
                        <tr key={i} className={cn(res && (res.status === "match" ? "bg-green-500/10" : "bg-red-500/10"))}>
                          <td className="border-b px-2 text-right text-muted-foreground tabular">{i + 2}</td>
                          {check && (
                            <td className="max-w-72 border-b px-2 py-1" title={res?.issues.join("\n")}>
                              <span className={cn("font-medium", res?.status === "match" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{res ? STATUS_LABEL[res.status] : ""}</span>
                              {res?.issues.length ? <span className="block truncate text-[11px] text-muted-foreground">{res.issues[0]}</span> : null}
                            </td>
                          )}
                          {sheet.headers.map((_, c) => (
                            <td key={c} className="border-b border-l p-0">
                              <input value={sheet.rows[i]![c] ?? ""} onChange={(e) => setCell(i, c, e.target.value)} className="w-full bg-transparent px-2 py-1 outline-none focus:bg-background focus:ring-1 focus:ring-primary" aria-label={`Row ${i + 2}, ${sheet.headers[c]}`} />
                            </td>
                          ))}
                          <td className="border-b text-center">
                            <button type="button" aria-label={`Delete row ${i + 2}`} className="rounded p-0.5 opacity-40 hover:opacity-100" onClick={() => (setSheet({ ...sheet, rows: sheet.rows.filter((_, j) => j !== i) }), setCheck(null))}>
                              <Trash2Icon className="size-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-end gap-2 text-xs">
                  <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span className="tabular">
                    Page {page + 1} of {pages}
                  </span>
                  <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {canCrossCheck && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScanSearchIcon className="size-4" /> Cross-check against Ops data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Each row is looked up by its code in production (or by its title when it has no code), then the title and teacher are compared. Green matches; red needs a look.</p>
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
                          {sheet.headers.map((h, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  ))}
                  <Button onClick={runCheck} disabled={busy === "check"}>
                    {busy === "check" ? <Loader2Icon className="animate-spin" /> : <ScanSearchIcon />} Cross-check {sheet.rows.length.toLocaleString()} rows
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
                        <Button key={k} size="sm" variant={statusFilter === k ? "secondary" : "ghost"} onClick={() => (setStatusFilter(k), setPage(0))}>
                          {k === "match" ? <Badge className="mr-1 size-2 rounded-full bg-green-600 p-0" /> : k !== "all" && k !== "problems" ? <Badge className="mr-1 size-2 rounded-full bg-red-600 p-0" /> : null}
                          {l}
                        </Button>
                      ))}
                      <div className="ml-auto flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            exportXlsx(`${sheet.name} cross-check`, [
                              { name: "Cross-check", headers: REPORT_HEAD, rows: reportRows(), fills: check.results.map((r) => FILL[r.status]), notes: [`Cross-check of ${sheet.name} against ${workspace} production data, ${new Date().toLocaleString()}.`, `${check.summary.match} match, ${check.summary.mismatch} differ, ${check.summary.missing} not in production, ${check.summary.invalid} invalid.`] },
                              { name: "Sheet", headers: ["Result", ...sheet.headers], rows: sheet.rows.map((r, i) => [STATUS_LABEL[check.results[i]!.status], ...r]), fills: check.results.map((r) => FILL[r.status]) },
                            ])
                          }
                        >
                          <DownloadIcon /> Report .xlsx
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([toCsv(REPORT_HEAD, reportRows())], { type: "text/csv" }), safeName(`${sheet.name} cross-check`, "csv"))}>
                          <DownloadIcon /> Report .csv
                        </Button>
                        {aiOn && <CopyAiButton build={aiText} />}
                      </div>
                    </div>
                    <ul className="max-h-72 space-y-1 overflow-auto text-sm">
                      {check.results
                        .filter((r) => r.status !== "match")
                        .slice(0, 200)
                        .map((r) => (
                          <li key={r.row} className="rounded-md border-l-4 border-red-500 bg-red-500/5 px-3 py-1.5">
                            <span className="font-medium">Row {r.row}</span> <span className="text-xs text-muted-foreground">({STATUS_LABEL[r.status]})</span>
                            <ul className="list-disc pl-5 text-xs text-muted-foreground">
                              {r.issues.map((x, j) => (
                                <li key={j}>{x}</li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      {check.summary.match === check.summary.total && <li className="rounded-md border-l-4 border-green-600 bg-green-500/5 px-3 py-2">Every row matches production.</li>}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <PasteDialog open={paste} onClose={() => setPaste(false)} onLoad={(s) => (load(s), setPaste(false))} />
    </div>
  );
}

function PasteDialog({ open, onClose, onLoad }: { open: boolean; onClose: () => void; onLoad: (s: Sheet) => void }) {
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
              const rows = (header ? data.slice(1) : data).map((r) => headers.map((_, i) => r[i] ?? ""));
              onLoad({ name: "Pasted data", headers, rows });
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
