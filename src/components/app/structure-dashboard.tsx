"use client";

import * as React from "react";
import { BarsChart, ChartFrame, LinesChart } from "@/components/app/charts";
import type { StructureRow } from "@/server/structure";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";

const STAGE_COLOR: Record<Stage, string> = {
  recording: "var(--chart-3)",
  editing: "var(--chart-1)",
  uploading: "var(--chart-2)",
  publication: "var(--chart-4)",
};

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

// Week starting Monday, in the workspace timezone, as YYYY-MM-DD.
function weekKey(iso: string, tz: string) {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: tz }));
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

// Analysis of how much has been done in each stage, by grade or by subject.
export function StructureDashboard({ rows, mode = "grade", timezone = "Africa/Addis_Ababa", compact }: { rows: StructureRow[]; mode?: "grade" | "subject"; timezone?: string; compact?: boolean }) {
  const parts = rows.filter((r) => r.partId);
  const total = parts.length;
  const by = (r: StructureRow) => (mode === "grade" ? r.gradeName : r.subjectName);
  const sortKey = (r: StructureRow) => (mode === "grade" ? r.gradeSort : r.subjectSort);
  const groups = [...new Map(parts.map((r) => [by(r), sortKey(r)])).entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);

  const stageTotals = STAGES.map((st) => ({
    st,
    done: parts.filter((r) => r.stages[st] === "done").length,
    inProcess: parts.filter((r) => r.stages[st] === "in_process").length,
    missing: parts.filter((r) => r.stages[st] === "missing").length,
  }));

  const perGroup = groups.map((g) => {
    const list = parts.filter((r) => by(r) === g);
    return { group: g, parts: list.length, ...Object.fromEntries(STAGES.map((st) => [st, list.filter((r) => r.stages[st] === "done").length])) } as Record<string, number | string>;
  });

  // Completions per week over the last ten weeks, from the stage dates.
  const weeks: string[] = [];
  for (let i = 9; i >= 0; i--) weeks.push(weekKey(new Date(Date.now() - i * 7 * 864e5).toISOString(), timezone));
  const weekly = weeks.map((w) => ({
    week: w.slice(5),
    ...Object.fromEntries(STAGES.map((st) => [st, parts.filter((r) => r.stages[st] === "done" && r.dates[st] && weekKey(r.dates[st]!, timezone) === w).length])),
  }));

  const series = STAGES.map((st) => ({ key: st, label: STAGE_LABELS[st], color: STAGE_COLOR[st] }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stageTotals.map((t) => (
          <div key={t.st} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{STAGE_LABELS[t.st]}</span>
              <span className="size-2.5 rounded-full" style={{ background: STAGE_COLOR[t.st] }} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular">{t.done}</span>
              <span className="text-sm text-muted-foreground tabular">of {total} done</span>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
              <span style={{ width: `${pct(t.done, total)}%`, background: STAGE_COLOR[t.st] }} />
              <span className="bg-[var(--st-active-fg)]/40" style={{ width: `${pct(t.inProcess, total)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular">
              <span>{pct(t.done, total)}% done</span>
              <span>{t.inProcess} in process</span>
              <span>{t.missing} missing</span>
            </div>
          </div>
        ))}
      </div>

      <div className={cn("grid gap-4", !compact && "xl:grid-cols-2")}>
        <ChartFrame
          title={`Done per stage by ${mode === "grade" ? "grade" : "subject"}`}
          description="Number of parts whose stage is complete."
          table={{ columns: [mode === "grade" ? "Grade" : "Subject", "Parts", ...STAGES.map((s) => STAGE_LABELS[s])], rows: perGroup.map((g) => [g.group, g.parts, ...STAGES.map((s) => g[s])]) as (string | number)[][] }}
        >
          <BarsChart data={perGroup} xKey="group" series={series} height={260} />
        </ChartFrame>
        <ChartFrame
          title="Completed each week"
          description="Parts finished per stage per week, from the recorded, edited, uploaded and publication dates."
          table={{ columns: ["Week of", ...STAGES.map((s) => STAGE_LABELS[s])], rows: weekly.map((w) => [w.week, ...STAGES.map((s) => (w as Record<string, number | string>)[s])]) as (string | number)[][] }}
        >
          <LinesChart data={weekly} xKey="week" series={series} height={260} />
        </ChartFrame>
      </div>

      {!compact && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">{mode === "grade" ? "Grade" : "Subject"}</th>
                <th className="px-3 py-2 text-right">Parts</th>
                {STAGES.map((s) => (
                  <th key={s} className="px-3 py-2 text-center">
                    {STAGE_LABELS[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {perGroup.map((g) => (
                <tr key={g.group as string}>
                  <td className="px-3 py-2 font-medium">{g.group}</td>
                  <td className="px-3 py-2 text-right tabular">{g.parts}</td>
                  {STAGES.map((s) => {
                    const p = pct(g[s] as number, g.parts as number);
                    return (
                      <td key={s} className="px-2 py-1.5">
                        <div className="relative h-7 overflow-hidden rounded-md bg-muted">
                          <div className="absolute inset-y-0 left-0 opacity-80" style={{ width: `${p}%`, background: STAGE_COLOR[s] }} />
                          <span className="relative flex h-full items-center justify-center text-xs font-semibold tabular">
                            {g[s]} · {p}%
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
