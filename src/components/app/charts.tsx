"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type Series = { key: string; label: string; color: string };


function config(series: Series[]): ChartConfig {
  return Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]));
}

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
          <h3 className="text-sm font-semibold">{title}</h3>
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

export function BarsChart({
  data,
  xKey,
  series,
  stacked = false,
  height = 220,
  horizontal = false,
  unit,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  series: Series[];
  stacked?: boolean;
  height?: number;
  horizontal?: boolean;
  unit?: string;
}) {
  const cfg = config(series);
  const valueFormatter = unit !== undefined ? (v: number) => `${v}${unit}` : undefined;
  return (
    <ChartContainer config={cfg} className="w-full" style={{ height }}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 4, right: 8, left: horizontal ? 8 : -12, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} strokeDasharray="3 3" strokeOpacity={0.5} />
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} width={92} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} tickMargin={6} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} width={40} tickFormatter={valueFormatter} />
          </>
        )}
        <ChartTooltip cursor={{ fillOpacity: 0.06 }} content={<ChartTooltipContent formatter={valueFormatter ? (v, name) => (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-muted-foreground">{cfg[String(name)]?.label ?? name}</span>
            <span className="font-medium tabular">{valueFormatter(Number(v))}</span>
          </div>
        ) : undefined} />} />
        {series.length > 1 && <ChartLegend itemSorter={null} content={<ChartLegendContent />} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId={stacked ? "a" : undefined}
            fill={`var(--color-${s.key})`}
            stroke="var(--card)"
            strokeWidth={stacked ? 2 : 0}
            radius={!stacked || i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0}
            maxBarSize={36}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export function LinesChart({
  data,
  xKey,
  series,
  height = 220,
  unit,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  series: Series[];
  height?: number;
  unit?: string;
}) {
  const cfg = config(series);
  const valueFormatter = unit !== undefined ? (v: number) => `${v}${unit}` : undefined;
  return (
    <ChartContainer config={cfg} className="w-full" style={{ height }}>
      <LineChart data={data} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.5} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} tickMargin={6} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={valueFormatter} />
        <ChartTooltip content={<ChartTooltipContent formatter={valueFormatter ? (v, name) => (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-muted-foreground">{cfg[String(name)]?.label ?? name}</span>
            <span className="font-medium tabular">{v === null || v === undefined ? "No data" : valueFormatter(Number(v))}</span>
          </div>
        ) : undefined} />} />
        {series.length > 1 && <ChartLegend itemSorter={null} content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} type="monotone" isAnimationActive={false} stroke={`var(--color-${s.key})`} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: "var(--card)" }} activeDot={{ r: 5 }} connectNulls={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
