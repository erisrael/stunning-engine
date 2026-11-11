"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export const fmtNum = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmtMoney = (n: number) => `ETB ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// Bars per period, one or two series side by side, with the value on hover and the latest labels below.
export function PeriodBars({ points, series, height = 140, label }: { points: string[]; series: { name: string; values: number[]; className: string; format?: (n: number) => string }[]; height?: number; label: string }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const every = Math.max(1, Math.ceil(points.length / 12));
  return (
    <figure className="space-y-1">
      <div className="flex items-end gap-px" style={{ height }} role="img" aria-label={label}>
        {points.map((p, i) => (
          <div key={p} className="group flex h-full flex-1 items-end gap-px" title={`${p}: ${series.map((s) => `${s.name} ${(s.format ?? fmtNum)(s.values[i] ?? 0)}`).join(", ")}`}>
            {series.map((s) => (
              <div key={s.name} className={cn("flex-1 rounded-t-sm opacity-85 group-hover:opacity-100", s.className)} style={{ height: `${Math.max((s.values[i] ?? 0) > 0 ? 2 : 0, ((s.values[i] ?? 0) / max) * height)}px` }} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-px text-[10px] text-muted-foreground">
        {points.map((p, i) => (
          <span key={p} className="flex-1 truncate text-center">{i % every === 0 ? p.slice(p.length > 7 ? 5 : 0) : ""}</span>
        ))}
      </div>
      {series.length > 1 && (
        <figcaption className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {series.map((s) => <span key={s.name} className="flex items-center gap-1"><span className={cn("inline-block size-2.5 rounded-sm", s.className)} />{s.name}</span>)}
        </figcaption>
      )}
    </figure>
  );
}

// Running total over time (overall progress).
export function CumulativeLine({ points, values, label, format = fmtNum }: { points: string[]; values: number[]; label: string; format?: (n: number) => string }) {
  const total: number[] = [];
  values.reduce((a, v, i) => ((total[i] = a + v), a + v), 0);
  const max = Math.max(1, ...total);
  const w = 600;
  const h = 120;
  const xy = total.map((v, i) => [points.length > 1 ? (i / (points.length - 1)) * w : w / 2, h - (v / max) * (h - 8) - 4]);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" role="img" aria-label={label} preserveAspectRatio="none">
        <polyline points={[[0, h], ...xy, [w, h]].map((p) => p.join(",")).join(" ")} className="fill-primary/10 stroke-none" />
        <polyline points={xy.map((p) => p.join(",")).join(" ")} className="fill-none stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-[11px] text-muted-foreground">
        <span>{points[0]}</span>
        <span className="font-medium text-foreground">{format(total.at(-1) ?? 0)} in all</span>
        <span>{points.at(-1)}</span>
      </figcaption>
    </figure>
  );
}

// A ranked breakdown with share bars.
export function Breakdown({ title, rows, format = fmtNum, limit = 8 }: { title: string; rows: [string, number][]; format?: (n: number) => string; limit?: number }) {
  const total = rows.reduce((a, [, v]) => a + v, 0) || 1;
  const sorted = [...rows].sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-1.5 text-xs">
        {sorted.slice(0, limit).map(([k, v]) => (
          <li key={k}>
            <div className="flex justify-between gap-2"><span className="truncate">{k || "Not set"}</span><span className="tabular-nums">{format(v)}</span></div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(v / total) * 100}%` }} /></div>
          </li>
        ))}
        {!sorted.length && <li className="text-muted-foreground">Nothing in this range.</li>}
      </ul>
    </div>
  );
}

export const tally = (rows: Record<string, string>[], pick: (r: Record<string, string>) => string, value: (r: Record<string, string>) => number = () => 1): [string, number][] => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(pick(r) || "Not set", (m.get(pick(r) || "Not set") ?? 0) + value(r));
  return [...m.entries()];
};

export const daysOf = (from: string, until: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); out.length < 400 && new Date(t).toISOString().slice(0, 10) <= until; t += 86400e3) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};
export const dayOfRow = (r: Record<string, string>) => (r._date ? new Date(Date.parse(r._date) + 3 * 3600e3).toISOString().slice(0, 10) : "");
