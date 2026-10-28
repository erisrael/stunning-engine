"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon, Loader2Icon, SearchCheckIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importVideoTrackerAction } from "@/app/actions/imports";
import type { TraceRow, VideoTrackerResult } from "@/server/video-tracker";
import { cn } from "@/lib/utils";

const ACTION_LABEL: Record<TraceRow["action"], string> = { create: "Add part", update: "Update", skip: "No change", error: "Error" };
const ACTION_TONE: Record<TraceRow["action"], string> = {
  create: "text-[var(--st-done-fg)]",
  update: "text-[var(--st-active-fg)]",
  skip: "text-muted-foreground",
  error: "text-[var(--st-blocked-fg)]",
};

function downloadTrace(trace: TraceRow[], fileName: string) {
  const cols: (keyof TraceRow)[] = ["key", "grade", "subject", "unit", "part", "trackerStatus", "inRecorderFile", "before", "after", "action", "note", "rows", "titles"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = "﻿" + [cols.join(","), ...trace.map((t) => cols.map((c) => esc(c === "inRecorderFile" ? (t[c] ? "yes" : "no") : t[c])).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `trace-${fileName.replace(/\.csv$/i, "")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// The Uploading team's video tracker: preview the trace, then apply it.
export function VideoTrackerImport() {
  const router = useRouter();
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [addParts, setAddParts] = React.useState(true);
  const [result, setResult] = React.useState<VideoTrackerResult | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [filter, setFilter] = React.useState<TraceRow["action"] | "all">("all");

  const send = async (dryRun: boolean) => {
    const file = ref.current?.files?.[0];
    if (!file) return toast.error("Choose the video tracker CSV first.");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("dryRun", dryRun ? "1" : "0");
    fd.set("createMissing", addParts ? "1" : "0");
    setBusy(true);
    const r = await importVideoTrackerAction(fd);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setResult(r.data as VideoTrackerResult);
    setFileName(file.name);
    if (!dryRun) {
      toast.success("Video tracker applied");
      router.refresh();
    }
  };

  const c = result?.counts;
  const shown = result?.trace.filter((t) => filter === "all" || t.action === filter) ?? [];
  return (
    <div className="space-y-3">
      <Input ref={ref} type="file" accept=".csv,text/csv" onChange={() => setResult(null)} />
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={addParts} onChange={(e) => setAddParts(e.target.checked)} />
        Add parts that are only in the upload tracker
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => send(true)}>
          {busy ? <Loader2Icon className="animate-spin" /> : <SearchCheckIcon />} Preview trace
        </Button>
        {result?.dryRun && (
          <Button size="sm" disabled={busy || !c || c.create + c.update === 0} onClick={() => send(false)}>
            <UploadIcon /> Apply {c ? c.create + c.update : 0} parts
          </Button>
        )}
        {result && (
          <Button size="sm" variant="ghost" onClick={() => downloadTrace(result.trace, fileName)}>
            <DownloadIcon /> Trace CSV
          </Button>
        )}
      </div>
      {result && c && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {result.dryRun ? "Preview, nothing saved yet." : "Applied."} {c.rows} rows, {c.parts} distinct parts.
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {(
              [
                ["all", "All", result.trace.length],
                ["create", "Add part", c.create],
                ["update", "Update", c.update],
                ["skip", "No change", c.skip],
                ["error", "Error", c.error],
              ] as const
            ).map(([k, l, n]) => (
              <button key={k} onClick={() => setFilter(k)} className={cn("rounded-lg border p-1.5 text-left", filter === k && "border-primary bg-accent/40")}>
                <span className="block text-[10px] text-muted-foreground">{l}</span>
                <span className={cn("text-base font-semibold tabular", k !== "all" && ACTION_TONE[k])}>{n}</span>
              </button>
            ))}
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Part</th>
                  <th className="px-2 py-1.5 text-left font-medium">Tracker</th>
                  <th className="px-2 py-1.5 text-left font-medium">Now → after</th>
                  <th className="px-2 py-1.5 text-left font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.key} className="border-t align-top">
                    <td className="px-2 py-1">
                      <span className="font-mono">{t.key}</span>
                      <span className="block text-muted-foreground">{t.inRecorderFile ? "In the Recording team's file" : "Upload tracker only"}</span>
                    </td>
                    <td className="px-2 py-1">{t.trackerStatus}</td>
                    <td className="px-2 py-1">
                      {t.before}
                      {t.after && t.after !== t.before ? ` → ${t.after}` : ""}
                    </td>
                    <td className="px-2 py-1">
                      <span className={cn("font-medium", ACTION_TONE[t.action])}>{ACTION_LABEL[t.action]}</span>
                      {t.note && <span className="block text-muted-foreground">{t.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
