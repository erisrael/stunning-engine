"use client";

// The import helper in the wizard's preview (Phase 23): fix what can be fixed safely, a checklist, the rows as an
// editable table (rows with errors first), and the AI's suggestions for what is left (accepted one by one or all).

import * as React from "react";
import { toast } from "sonner";
import { CheckIcon, CircleAlertIcon, ListChecksIcon, Loader2Icon, SparklesIcon, Table2Icon, WandSparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiFixImportAction, assistImportAction } from "@/app/actions/imports";
import type { ImportMode, ImportResult, ParsedSheet, TemplateKey } from "@/server/importer";
import type { CellChange, CheckItem } from "@/server/import-assist";
import { cn } from "@/lib/utils";

type Field = { key: string; label: string };
type Suggestion = { row: number; field: string; value: string; label: string; from: string };

export function ImportHelper({
  template,
  mode,
  sheet,
  mapping,
  fileName,
  fields,
  preview,
  onSheet,
  onPreview,
}: {
  template: TemplateKey;
  mode: ImportMode;
  sheet: ParsedSheet;
  mapping: Record<string, string>;
  fileName: string;
  fields: Field[];
  preview: ImportResult;
  onSheet: (s: ParsedSheet) => void;
  onPreview: (p: ImportResult) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [changes, setChanges] = React.useState<CellChange[] | null>(null);
  const [checklist, setChecklist] = React.useState<CheckItem[] | null>(null);
  const [ai, setAi] = React.useState(false);
  const [table, setTable] = React.useState(false);
  const [onlyErrors, setOnlyErrors] = React.useState(true);
  const [draft, setDraft] = React.useState<ParsedSheet>(sheet);
  const [suggestions, setSuggestions] = React.useState<Suggestion[] | null>(null);
  React.useEffect(() => setDraft(sheet), [sheet]);
  const cols = fields.filter((f) => mapping[f.key]).map((f) => ({ ...f, idx: sheet.headers.indexOf(mapping[f.key]!) })).filter((c) => c.idx >= 0);
  const errorsByRow = new Map(preview.outcomes.filter((o) => o.action === "error").map((o) => [o.row, o.errors]));
  const dirty = JSON.stringify(draft.rows) !== JSON.stringify(sheet.rows);

  const fix = async () => {
    setBusy("fix");
    const r = await assistImportAction({ template, mode, sheet: draft, mapping, fileName });
    setBusy(null);
    if (!r.ok || !r.data) return void toast.error((!r.ok && r.error) || "The helper could not run.");
    setChanges(r.data.changes);
    setChecklist(r.data.checklist);
    setAi(r.data.ai);
    onSheet(r.data.sheet);
    onPreview(r.data.after);
    toast.success(`${r.data.changes.length} cells fixed; errors ${r.data.before.error} → ${r.data.after.counts.error}`);
  };
  const recheck = async () => {
    setBusy("check");
    const r = await assistImportAction({ template, mode, sheet: draft, mapping, fileName });
    setBusy(null);
    if (!r.ok || !r.data) return void toast.error((!r.ok && r.error) || "Could not check.");
    setChecklist(r.data.checklist);
    setAi(r.data.ai);
    onSheet(r.data.sheet);
    onPreview(r.data.after);
  };
  const askAi = async () => {
    setBusy("ai");
    const r = await aiFixImportAction({ template, mode, sheet: draft, mapping, fileName });
    setBusy(null);
    if (!r.ok || !r.data) return void toast.error((!r.ok && r.error) || "The AI could not help.");
    setSuggestions(r.data.suggestions);
    if (!r.data.suggestions.length) toast.info("The AI had no safe suggestions; edit the cells in the table.");
  };
  const setCell = (ri: number, ci: number, v: string) =>
    setDraft((d) => ({ ...d, rows: d.rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)) }));
  const accept = (list: Suggestion[]) => {
    const next = { ...draft, rows: draft.rows.map((r) => [...r]) };
    for (const s of list) {
      const c = cols.find((x) => x.key === s.field);
      if (c && next.rows[s.row - 2]) next.rows[s.row - 2]![c.idx] = s.value;
    }
    setDraft(next);
    setSuggestions((x) => (x ? x.filter((s) => !list.includes(s)) : x));
    setTable(true);
    toast.success(`${list.length} accepted. Press Check again.`);
  };
  const rowIdx = draft.rows.map((_, i) => i).filter((i) => !onlyErrors || errorsByRow.has(i + 2));

  return (
    <div className="space-y-3 rounded-lg border border-[#9334E6]/30 bg-[#9334E6]/5 p-3" data-import-helper>
      <div className="flex flex-wrap items-center gap-2">
        <WandSparklesIcon className="size-4 text-[#9334E6]" />
        <p className="text-sm font-medium">Import helper</p>
        <span className="text-xs text-muted-foreground">Fixes dates, numbers, spaces, yes/no, emails and close matches; removes empty and repeated rows. Nothing is saved until you confirm.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={fix} disabled={!!busy} data-import-fix>
          {busy === "fix" ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />} Fix what can be fixed
        </Button>
        <Button size="sm" variant="outline" onClick={() => setTable(!table)} aria-pressed={table} data-import-table-toggle>
          <Table2Icon /> {table ? "Hide the table" : "Edit rows in a table"}
        </Button>
        {(table || dirty) && (
          <Button size="sm" variant="outline" onClick={recheck} disabled={!!busy} data-import-recheck>
            {busy === "check" ? <Loader2Icon className="animate-spin" /> : <ListChecksIcon />} Check again
          </Button>
        )}
        {ai && preview.counts.error > 0 && (
          <Button size="sm" variant="outline" onClick={askAi} disabled={!!busy} data-import-ai>
            {busy === "ai" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon className="text-[#9334E6]" />} Ask AI to fix the rest
          </Button>
        )}
      </div>
      {checklist && (
        <ul className="grid gap-1 sm:grid-cols-2" data-import-checklist>
          {checklist.map((c) => (
            <li key={c.key} className="flex items-start gap-1.5 text-xs" data-check={c.key} data-ok={c.ok ? "1" : "0"}>
              {c.ok ? <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-[#188038]" /> : <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-[#D93025]" />}
              <span>
                <span className="font-medium">{c.label}</span> <span className="text-muted-foreground">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {changes && changes.length > 0 && (
        <details className="rounded border bg-background p-2 text-xs" data-import-changes>
          <summary className="cursor-pointer font-medium">{changes.length} cells changed</summary>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {changes.slice(0, 300).map((c, i) => (
              <li key={i}>
                Row {c.row}, {c.label}: <span className="line-through">{c.from || "(empty)"}</span> → <span className="font-medium">{c.to || "(empty)"}</span> <span className="text-muted-foreground">({c.why})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {suggestions && suggestions.length > 0 && (
        <div className="space-y-1 rounded border bg-background p-2 text-xs" data-import-suggestions>
          <div className="flex items-center justify-between">
            <p className="font-medium">The AI suggests ({suggestions.length})</p>
            <Button size="xs" onClick={() => accept(suggestions)}>
              <CheckIcon /> Accept all
            </Button>
          </div>
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                Row {s.row}, {s.label}: <span className="line-through">{s.from || "(empty)"}</span> → <span className="font-medium">{s.value}</span>
              </span>
              <button type="button" aria-label="Accept" onClick={() => accept([s])}>
                <CheckIcon className="size-3.5 text-[#188038]" />
              </button>
              <button type="button" aria-label="Reject" onClick={() => setSuggestions((x) => x!.filter((y) => y !== s))}>
                <XIcon className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
      {table && (
        <div className="space-y-1" data-import-grid>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} /> Only rows with errors ({errorsByRow.size})
          </label>
          <div className="max-h-[45vh] overflow-auto rounded border bg-background">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1 text-left">Row</th>
                  {cols.map((c) => (
                    <th key={c.key} className="px-2 py-1 text-left whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowIdx.slice(0, 300).map((ri) => {
                  const errs = errorsByRow.get(ri + 2) ?? [];
                  return (
                    <tr key={ri} className={cn("border-t align-top", errs.length && "bg-[#D93025]/5")} data-grid-row={ri + 2}>
                      <td className="px-2 py-1 tabular" title={errs.join("\n")}>
                        {ri + 2}
                        {errs.length > 0 && <CircleAlertIcon className="ml-1 inline size-3 text-[#D93025]" />}
                      </td>
                      {cols.map((c) => {
                        const bad = errs.some((e) => e.toLowerCase().startsWith(c.label.toLowerCase()) || e.includes(`${c.label} `));
                        return (
                          <td key={c.key} className="p-0.5">
                            <input
                              aria-label={`Row ${ri + 2} ${c.label}`}
                              className={cn("w-full min-w-24 rounded border bg-transparent px-1 py-0.5", bad ? "border-[#D93025]" : "border-transparent hover:border-border")}
                              value={draft.rows[ri]?.[c.idx] ?? ""}
                              onChange={(e) => setCell(ri, c.idx, e.target.value)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {errorsByRow.size > 0 && <p className="text-[11px] text-muted-foreground">Hover a row number to see its errors. Change cells, then press Check again.</p>}
        </div>
      )}
    </div>
  );
}
