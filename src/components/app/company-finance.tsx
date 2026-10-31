import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/app/primitives";
import type { companyFinance } from "@/server/finance";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof companyFinance>>;

// The Company overview's Finance view: spend against each department's budget, and the year so far. Read only.
export function CompanyFinance({ data, base }: { data: Data; base: string }) {
  const money = (n: number) => `${data.currency} ${Math.round(n).toLocaleString("en-US")}`;
  const tone = (pct: number | null, alert: number | null) => (pct === null ? "bg-muted-foreground/40" : pct >= 100 ? "bg-[var(--st-blocked-fg)]" : pct >= (alert ?? 80) ? "bg-[var(--st-paused-fg)]" : "bg-primary");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="outline" asChild aria-label="Previous year">
          <Link href={`${base}&year=${data.year - 1}`}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold tabular-nums">{data.year}</h2>
        <Button size="icon-sm" variant="outline" asChild aria-label="Next year">
          <Link href={`${base}&year=${data.year + 1}`}>
            <ChevronRightIcon />
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">{data.pace}% of the year has passed</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Revenue" value={money(data.revenue)} />
        <MetricCard label="Spending, payroll included" value={money(data.expenses)} />
        <MetricCard label="Payroll" value={money(data.payroll)} />
        <MetricCard label="Net" value={money(data.net)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Departments against budget</CardTitle>
          <CardDescription>Spending and payroll this year. The line marks an even pace through the year; amber is past the alert level, red is over budget.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.departments.map((d) => (
            <div key={d.key || "none"} className="grid gap-1 sm:grid-cols-[200px_1fr_220px] sm:items-center sm:gap-4">
              <p className="text-sm font-medium">{d.label}</p>
              <div className="relative h-3 rounded-full bg-muted" role="img" aria-label={d.pct === null ? `${d.label}: no budget set` : `${d.label}: ${d.pct}% of budget used`}>
                {d.pct !== null && <div className={cn("h-3 rounded-full", tone(d.pct, d.alertPct))} style={{ width: `${Math.min(100, d.pct)}%` }} />}
                {d.budget !== null && <div className="absolute top-[-3px] h-[18px] w-0.5 bg-foreground/60" style={{ left: `${data.pace}%` }} aria-hidden />}
              </div>
              <p className="text-sm tabular-nums sm:text-right">
                {money(d.spent)}
                {d.budget !== null ? (
                  <span className="text-muted-foreground">
                    {" "}
                    of {money(d.budget)} · <span className={cn(d.pct !== null && d.pct >= 100 && "font-medium text-[var(--st-blocked-fg)]")}>{d.pct}%</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground"> · no budget</span>
                )}
              </p>
            </div>
          ))}
          {!data.departments.length && <p className="text-sm text-muted-foreground">No spending or budgets for {data.year} yet. Budgets are set in Finance, Budgets.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Month by month</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 font-medium">Month</th>
                  <th className="text-right font-medium">Revenue</th>
                  <th className="text-right font-medium">Spending</th>
                  <th className="text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.byMonth.map((m) => (
                  <tr key={m.month} className="border-t">
                    <td className="py-1.5">{m.month}</td>
                    <td className="text-right">{money(m.revenue)}</td>
                    <td className="text-right">{money(m.expenses)}</td>
                    <td className={cn("text-right", m.revenue - m.expenses < 0 && "text-[var(--st-blocked-fg)]")}>{money(m.revenue - m.expenses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.byMonth.length && <p className="py-3 text-sm text-muted-foreground">Nothing recorded yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Other budgets</CardTitle>
            <CardDescription>Projects, campaigns and production lines.</CardDescription>
            <CardAction>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/finance?tab=budgets">Budgets</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {data.other.map((b, i) => (
                <li key={i} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{b.label}</span>
                  <span className="text-xs text-muted-foreground capitalize">{b.type}</span>
                  <span className="tabular-nums">
                    {money(b.spent)} <span className="text-muted-foreground">of {money(b.budget)}</span>
                  </span>
                  <span className={cn("w-12 text-right tabular-nums", b.pct !== null && b.pct >= 100 && "font-medium text-[var(--st-blocked-fg)]")}>{b.pct ?? "-"}%</span>
                </li>
              ))}
              {!data.other.length && <li className="py-2 text-muted-foreground">None set.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
