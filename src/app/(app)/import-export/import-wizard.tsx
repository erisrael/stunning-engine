"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, CircleAlertIcon, CircleMinusIcon, DownloadIcon, FileUpIcon, Loader2Icon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { parseImportFileAction, runImportAction } from "@/app/actions/imports";
import type { ImportMode, ImportResult, ParsedSheet, TemplateKey } from "@/server/importer";
import { cn } from "@/lib/utils";

export type TemplateInfo = {
  key: TemplateKey;
  title: string;
  summary: string;
  modes: ImportMode[];
  notes?: string[];
  stage?: string;
  prefill?: { label: string; hint: string };
  fields: { key: string; label: string; required: boolean | string; description: string }[];
};

const STEPS = ["Template", "Upload", "Map columns", "Preview", "Result"];

// `className` lets a dashboard dialog drop the card frame.
export function ImportWizard({ templates, initial, className, title = "Import wizard" }: { templates: TemplateInfo[]; initial?: string; className?: string; title?: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [tpl, setTpl] = React.useState<TemplateKey>((templates.find((t) => t.key === initial)?.key ?? templates[0]?.key) as TemplateKey);
  const t = templates.find((x) => x.key === tpl)!;
  const [mode, setMode] = React.useState<ImportMode>(t?.modes[0]);
  const [sheet, setSheet] = React.useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [preview, setPreview] = React.useState<ImportResult | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "create" | "update" | "skip" | "error">("all");
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setMode(t?.modes[0]);
  }, [tpl, t]);

  const reset = () => {
    setStep(0);
    setSheet(null);
    setPreview(null);
    setResult(null);
    setMapping({});
    setFileName("");
  };

  const upload = async (file: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("template", tpl);
    const r = await parseImportFileAction(fd);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const d = r.data as { sheet: ParsedSheet; fileName: string; mapping: Record<string, string> };
    setSheet(d.sheet);
    setFileName(d.fileName);
    setMapping(d.mapping);
    setStep(2);
  };

  const runPreview = async () => {
    if (!sheet) return;
    setBusy(true);
    const r = await runImportAction({ template: tpl, mode, sheet, mapping, dryRun: true, fileName });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setPreview(r.data as ImportResult);
    setStep(3);
  };

  const commit = async (validOnly: boolean) => {
    if (!sheet) return;
    setBusy(true);
    const r = await runImportAction({ template: tpl, mode, sheet, mapping, dryRun: false, fileName, validOnly });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const res = r.data as ImportResult;
    setResult(res);
    setStep(4);
    toast.success(res.duplicateOf ? "This exact file was already imported; the earlier result is shown." : "Import finished");
    router.refresh();
  };

  const outcomes = (step === 4 ? result : preview)?.outcomes ?? [];
  const counts = (step === 4 ? result : preview)?.counts;
  const shown = outcomes.filter((o) => filter === "all" || o.action === filter);
  const required = t?.fields.filter((f) => f.required === true || f.required === mode || (f.required === "create" && mode === "upsert")) ?? [];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Choose a template, upload, map columns, review every row, then confirm. Nothing changes until you confirm, and a retried file never duplicates records.</CardDescription>
        <ol className="mt-2 flex flex-wrap gap-1.5" aria-label="Import steps">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", i === step ? "border-primary bg-primary text-primary-foreground" : i < step ? "bg-accent text-accent-foreground" : "text-muted-foreground")} aria-current={i === step ? "step" : undefined}>
              <span className="tabular">{i + 1}</span> {s}
            </li>
          ))}
        </ol>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 0 && (
          <div className="space-y-4">
            {templates.length > 1 ? (
              <RadioGroup value={tpl} onValueChange={(v) => setTpl(v as TemplateKey)} className="grid gap-2 md:grid-cols-2">
                {templates.map((x) => (
                  <label key={x.key} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", tpl === x.key && "border-primary bg-accent/40")}>
                    <RadioGroupItem value={x.key} className="mt-1" />
                    <span>
                      <span className="block text-sm font-medium">{x.title}</span>
                      <span className="block text-xs text-muted-foreground">{x.summary}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.summary}</p>
                {!!t.notes?.length && (
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                    {t.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Columns: <span className="font-mono">{t.fields.map((f) => f.key).join(", ")}</span>
                </p>
              </div>
            )}
            {t?.prefill && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <span className="mr-auto text-xs">
                  <span className="block font-medium text-foreground">{t.prefill.label}</span>
                  <span className="text-muted-foreground">{t.prefill.hint}</span>
                </span>
                <Button size="sm" asChild>
                  <a href={`/api/templates/${tpl}?format=xlsx&prefill=1`}>
                    <DownloadIcon /> Excel
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/templates/${tpl}?format=csv&prefill=1`}>CSV</a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/templates/${tpl}?format=json&prefill=1`}>JSON</a>
                </Button>
              </div>
            )}
            {t && t.modes.length > 1 && (
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as ImportMode)}>
                  <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {t.modes.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m === "create" ? "Create new items only" : m === "update" ? "Update existing items by item code" : "Create or update by natural key"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStep(1)}>Continue</Button>
              <Button variant="outline" asChild>
                <a href={`/api/templates/${tpl}?format=xlsx`}>Download Excel template</a>
              </Button>
              <Button variant="ghost" asChild>
                <a href={`/api/templates/${tpl}?format=csv`}>CSV template</a>
              </Button>
              <Button variant="ghost" asChild>
                <a href={`/api/templates/${tpl}?format=json`}>JSON template</a>
              </Button>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-3">
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) upload(f);
              }}
            >
              {busy ? <Loader2Icon className="size-8 animate-spin text-muted-foreground" /> : <FileUpIcon className="size-8 text-muted-foreground" />}
              <p className="text-sm font-medium">Drop an Excel, CSV or JSON file here</p>
              <p className="text-xs text-muted-foreground">Up to 5,000 rows and 10 MB. The first row must contain column headers. In Excel files the Template sheet is read.</p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.json" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                Choose file
              </Button>
            </div>
            <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
          </div>
        )}
        {step === 2 && sheet && (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{fileName}</span>: {sheet.rows.length} rows, {sheet.headers.length} columns{sheet.sheetName ? ` from sheet "${sheet.sheetName}"` : ""}. Columns were matched automatically by name; adjust anything that is wrong.
            </p>
            <div className="max-h-[50vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Template field</th>
                    <th className="px-3 py-2 text-left font-medium">Your column</th>
                    <th className="px-3 py-2 text-left font-medium">First value</th>
                  </tr>
                </thead>
                <tbody>
                  {t.fields.map((f) => {
                    const req = required.some((r) => r.key === f.key);
                    const col = mapping[f.key];
                    const idx = col ? sheet.headers.indexOf(col) : -1;
                    return (
                      <tr key={f.key} className="border-t">
                        <td className="px-3 py-1.5">
                          <span className="font-medium">{f.label}</span> {req && <span className="text-xs text-[var(--st-blocked-fg)]">required</span>}
                          <span className="block text-[11px] text-muted-foreground">{f.description}</span>
                        </td>
                        <td className="px-3 py-1.5">
                          <Select value={col ?? "__none"} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none" ? "" : v }))}>
                            <SelectTrigger size="sm" className={cn("w-56", req && !col && "border-[var(--st-blocked-fg)]")}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">Not mapped</SelectItem>
                              {sheet.headers.map((h) => (
                                <SelectItem key={h} value={h}>{h}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="max-w-56 truncate px-3 py-1.5 text-xs text-muted-foreground">{idx >= 0 ? sheet.rows[0]?.[idx] : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={runPreview} disabled={busy}>
                {busy && <Loader2Icon className="animate-spin" />} Validate and preview
              </Button>
            </div>
          </div>
        )}
        {(step === 3 || step === 4) && counts && (
          <div className="space-y-3">
            {step === 4 && result?.duplicateOf && (
              <p className="rounded-lg border bg-[var(--st-paused-bg)] p-3 text-sm text-[var(--st-paused-fg)]">This file, template and mapping were already imported as job {result.duplicateOf}. Nothing was changed again.</p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  ["all", "Rows", counts.total, ""],
                  ["create", step === 4 ? "Created" : "Will create", counts.create, "text-[var(--st-done-fg)]"],
                  ["update", step === 4 ? "Updated" : "Will update", counts.update, "text-[var(--st-active-fg)]"],
                  ["skip", "Skipped", counts.skip, "text-muted-foreground"],
                  ["error", "Errors", counts.error, "text-[var(--st-blocked-fg)]"],
                ] as const
              ).map(([k, l, n, c]) => (
                <button key={k} onClick={() => setFilter(k)} className={cn("rounded-lg border p-2 text-left", filter === k && "border-primary bg-accent/40")}>
                  <span className="block text-xs text-muted-foreground">{l}</span>
                  <span className={cn("text-xl font-semibold tabular", c)}>{n}</span>
                </button>
              ))}
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="w-16 px-3 py-2 text-left font-medium">Row</th>
                    <th className="w-28 px-3 py-2 text-left font-medium">Result</th>
                    <th className="px-3 py-2 text-left font-medium">Key</th>
                    <th className="px-3 py-2 text-left font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((o) => (
                    <tr key={o.row} className="border-t align-top">
                      <td className="px-3 py-1.5 tabular">{o.row}</td>
                      <td className="px-3 py-1.5">
                        <span className={cn("flex items-center gap-1 text-xs font-medium capitalize", o.action === "error" ? "text-[var(--st-blocked-fg)]" : o.action === "skip" ? "text-muted-foreground" : "text-[var(--st-done-fg)]")}>
                          {o.action === "error" ? <CircleAlertIcon className="size-3.5" /> : o.action === "skip" ? <CircleMinusIcon className="size-3.5" /> : <CheckCircle2Icon className="size-3.5" />}
                          {o.action}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">{o.key}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {o.errors.length ? o.errors.map((e, i) => <span key={i} className="block text-[var(--st-blocked-fg)]">{e}</span>) : o.summary}
                        {o.warnings.map((w, i) => (
                          <span key={i} className="flex items-center gap-1 text-[var(--st-paused-fg)]"><TriangleAlertIcon className="size-3" /> {w}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {step === 3 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={() => setStep(2)}>Back to mapping</Button>
                {counts.error === 0 ? (
                  <Button onClick={() => commit(false)} disabled={busy || counts.create + counts.update === 0}>
                    {busy && <Loader2Icon className="animate-spin" />} Confirm import of {counts.create + counts.update} rows
                  </Button>
                ) : (
                  <>
                    <Button onClick={() => commit(true)} disabled={busy || counts.create + counts.update === 0}>
                      {busy && <Loader2Icon className="animate-spin" />} Import {counts.create + counts.update} valid rows only
                    </Button>
                    <Button variant="outline" onClick={reset}>Cancel the whole batch</Button>
                  </>
                )}
                <span className="text-xs text-muted-foreground">This preview was a dry run. Nothing has been saved yet.</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {result?.jobId && counts.error > 0 && (
                  <Button variant="outline" asChild>
                    <a href={`/api/jobs/${result.jobId}/errors`}>Download error rows</a>
                  </Button>
                )}
                <Button onClick={reset}>
                  <RefreshCwIcon /> Start another import
                </Button>
              </div>
            )}
            {step === 4 && result?.secrets && (
              <div className="rounded-lg border bg-[var(--st-paused-bg)] p-3 text-sm text-[var(--st-paused-fg)]">
                <p className="font-medium">Temporary passwords for new users. They are shown only now; share them privately.</p>
                <ul className="mt-1 font-mono text-xs">
                  {result.secrets.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
