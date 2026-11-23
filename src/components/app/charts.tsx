"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type Series = { key: string; label: string; color: string };


export function ChartFrame({
  title,
  description,
  children,
  table,
  className,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  table: { columns: string[]; rows: (string | number)[][] };
  className?: string;
  actions?: React.ReactNode;
}) {
  const [mode, setMode] = React.useState<"chart" | "table">("chart");
  return (
    <section className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", className)} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <ToggleGroup type="single" size="sm" variant="outline" value={mode} onValueChange={(v) => v && setMode(v as "chart" | "table")}>
            <ToggleGroupItem value="chart" className="h-7 px-2 text-xs">
              Chart
            </ToggleGroupItem>
            <ToggleGroupItem value="table" className="h-7 px-2 text-xs">
              Table
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {mode === "chart" ? (
        children
      ) : (
        <div className="max-h-80 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {table.columns.map((c) => (
                  <TableHead key={c} className="text-xs">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((r, i) => (
                <TableRow key={i}>
                  {r.map((c, j) => (
                    <TableCell key={j} className="text-xs tabular">
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

type ChartProps = { data: Record<string, string | number | null>[]; xKey: string; series: Series[]; height?: number; unit?: string };

// Until the chart code arrives, a quiet block of the chart's own height holds its place (nothing moves).
const holder = (height?: number) => <div className="w-full animate-pulse rounded-lg bg-muted/40" style={{ height: height ?? 220 }} aria-hidden />;
const Bars = dynamic(() => import("./charts-draw").then((m) => m.BarsChart), { ssr: false, loading: () => holder() });
const Lines = dynamic(() => import("./charts-draw").then((m) => m.LinesChart), { ssr: false, loading: () => holder() });

export function BarsChart(props: ChartProps & { stacked?: boolean; horizontal?: boolean }) {
  return <div style={{ minHeight: props.height ?? 220 }}><Bars {...props} /></div>;
}

export function LinesChart(props: ChartProps) {
  return <div style={{ minHeight: props.height ?? 220 }}><Lines {...props} /></div>;
}
