"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SIMPLE_STATUS_LABELS, STAGE_LABELS, STAGES } from "@/lib/domain";

type Opt = { id: string; name: string };

// Report settings (not printed): grouping, filters, columns, A4 orientation and page breaks.
export function ReportToolbar({ grades, subjects, fileTitle, paper }: { grades: Opt[]; subjects: Opt[]; fileTitle: string; paper: string }) {
  const router = useRouter();
  // The browser uses the document title as the suggested PDF file name.
  React.useEffect(() => {
    document.title = fileTitle;
  }, [fileTitle]);
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    if (!v || v === "all") p.delete(k);
    else p.set(k, v);
    router.replace(`${pathname}?${p}`, { scroll: false });
  };
  const sel = (k: string, label: string, value: string, opts: [string, string][], w = "w-40") => (
    <Select value={value} onValueChange={(v) => set(k, v)}>
      <SelectTrigger size="sm" className={`h-8 text-xs ${w}`} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const stageStatus = params.get("stage") && params.get("status") ? `${params.get("stage")}:${params.get("status")}` : "all";
  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 text-[#292d34] shadow-sm">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard">
          <ArrowLeftIcon /> Back
        </Link>
      </Button>
      {sel("mode", "Grouping", params.get("mode") ?? "grade", [
        ["grade", "Grade → Subject"],
        ["subject", "Subject → Grade"],
      ])}
      {sel("grade", "Grade", params.get("grade") ?? "all", [["all", "All grades"], ...grades.map((g) => [g.id, g.name] as [string, string])], "w-32")}
      {sel("subject", "Subject", params.get("subject") ?? "all", [["all", "All subjects"], ...subjects.map((s) => [s.id, s.name] as [string, string])])}
      <Select
        value={stageStatus}
        onValueChange={(v) => {
          const p = new URLSearchParams(params.toString());
          if (v === "all") {
            p.delete("stage");
            p.delete("status");
          } else {
            const [st, status] = v.split(":");
            p.set("stage", st);
            p.set("status", status);
          }
          router.replace(`${pathname}?${p}`, { scroll: false });
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-48 text-xs" aria-label="Status filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any status</SelectItem>
          {STAGES.flatMap((st) =>
            (["done", "in_process", "missing"] as const).map((s) => (
              <SelectItem key={`${st}:${s}`} value={`${st}:${s}`}>
                {STAGE_LABELS[st]}: {SIMPLE_STATUS_LABELS[s]}
              </SelectItem>
            )),
          )}
        </SelectContent>
      </Select>
      {sel("dates", "Dates", params.get("dates") ?? "1", [
        ["1", "With stage dates"],
        ["0", "Without dates"],
      ])}
      {sel("empty", "Empty units", params.get("empty") ?? "1", [
        ["1", "Include units without parts"],
        ["0", "Only units with parts"],
      ], "w-52")}
      {sel("orientation", "Orientation", params.get("orientation") ?? "landscape", [
        ["landscape", "Landscape"],
        ["portrait", "Portrait"],
      ], "w-32")}
      {sel("breaks", "Page breaks", params.get("breaks") ?? "0", [
        ["0", "Continuous pages"],
        ["1", `New page per ${params.get("mode") === "subject" ? "subject" : "grade"}`],
      ], "w-44")}
      <span className="ml-auto text-xs text-[#656f7d]">{paper}. In the print dialog choose Save as PDF; margins Default, Background graphics on.</span>
      <Button size="sm" onClick={() => window.print()}>
        <PrinterIcon /> Save as PDF
      </Button>
    </div>
  );
}
