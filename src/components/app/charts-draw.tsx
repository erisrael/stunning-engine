"use client";

// The charts themselves (Recharts), in their own file: charts.tsx loads this only when a chart is on the page.
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { Series } from "./charts";

function config(series: Series[]): ChartConfig {
  return Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]));
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
