"use client";

// The Company overview's switcher and its Overall view: each department's progress, finished work per week across
// the company, and money (budgets and recorded spend now; revenue and expenses when Finance arrives).

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BriefcaseIcon, Building2Icon, CodeIcon, LandmarkIcon, LayoutDashboardIcon, MegaphoneIcon, BookOpenIcon, VideoIcon } from "lucide-react";
import { MetricCard, Meter } from "@/components/app/primitives";
import { BarsChart, ChartFrame } from "@/components/app/charts";
import type { CompanySummary } from "@/server/company";
import { CAT } from "@/lib/chart-colors";
import { COMPANY_VIEWS, type CompanyView } from "@/lib/dashboards";
import { cn } from "@/lib/utils";

const ICONS: Record<CompanyView, React.ComponentType<{ className?: string }>> = {
  overall: LayoutDashboardIcon,
  production: VideoIcon,
  dev: CodeIcon,
  studio: BookOpenIcon,
  marketing: MegaphoneIcon,
};

const fmt = (v: number) => v.toLocaleString("en-US");

// Switches the view, keeping the period; department filters are dropped because each department has its own.
export function ViewSwitcher({ current, labels, extra = [] }: { current: string; labels: Partial<Record<CompanyView, string>>; extra?: { key: string; label: string }[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const href = (v: string) => {
    const p = new URLSearchParams();
    if (params.get("tab")) p.set("tab", params.get("tab")!);
    if (params.get("period")) p.set("period", params.get("period")!);
    if (v !== "overall") p.set("view", v);
    const q = p.toString();
    return q ? `${pathname}?${q}` : pathname;
  };
  return (
    <nav aria-label="Department" className="flex w-full gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1">
      {[...COMPANY_VIEWS.map((v) => ({ key: v.key as string, label: v.label as string })), ...extra].map((v) => {
        const Icon = ICONS[v.key as CompanyView] ?? Building2Icon;
        return (
        <Link
          key={v.key}
          href={href(v.key)}
          aria-current={current === v.key ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
            current === v.key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          <Icon className="size-4" /> {labels[v.key as CompanyView] ?? v.label}
        </Link>
        );
      })}
    </nav>
  );
}


export function CompanyOverall({ data }: { data: CompanySummary }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const viewHref = (v: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("view", v);
    return `${pathname}?${p.toString()}`;
  };
  // One series per department: published videos and resources, finished tasks elsewhere.
  const series = data.departments.map((d, i) => ({ key: d.dept, label: `${d.title} (${d.dept === "production" || d.dept === "studio" ? "published" : "done"})`, color: CAT[i % CAT.length]! }));
  const totalBudget = data.money.reduce((s, m) => s + m.budget, 0);
  const totalSpend = data.money.reduce((s, m) => s + m.spendTotal, 0);
  return (
    <div className="space-y-6">
      <section className="space-y-2" aria-label="Departments">
        <h2 className="text-sm font-semibold text-muted-foreground">Progress by department · {data.period.label.toLowerCase()}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.departments.map((d) => {
            const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
            return (
              <Link key={d.dept} href={viewHref(d.dept)} className="space-y-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">{d.title}</h3>
                  <span className="text-2xl font-semibold tabular">{pct}%</span>
                </div>
                <Meter value={d.done} max={Math.max(1, d.total)} />
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Finished</dt>
                  <dd className="text-right tabular">
                    {fmt(d.done)} of {fmt(d.total)} {d.unit}
                  </dd>
                  <dt className="text-muted-foreground">Finished in the period</dt>
                  <dd className="text-right tabular">{fmt(d.donePeriod)}</dd>
                  <dt className="text-muted-foreground">Not finished</dt>
                  <dd className="text-right tabular">{fmt(d.open)}</dd>
                  <dt className="text-muted-foreground">{d.dept === "production" ? "At publication" : "In review"}</dt>
                  <dd className="text-right tabular">{fmt(d.inReview)}</dd>
                  {d.dept !== "studio" && (
                    <>
                      <dt className="text-muted-foreground">Overdue</dt>
                      <dd className={cn("text-right tabular", d.overdue && "font-medium text-destructive")}>{fmt(d.overdue)}</dd>
                    </>
                  )}
                </dl>
              </Link>
            );
          })}
        </div>
        <ChartFrame title="Finished per week across the company" description="Last 12 weeks" table={{ columns: ["Week", ...series.map((s) => s.label)], rows: data.weekly.map((w) => [w.week, ...series.map((s) => Number(w[s.key] ?? 0))]) }}>
          <BarsChart data={data.weekly.map((w) => ({ ...w, week: w.week.slice(5) }))} xKey="week" series={series} stacked />
        </ChartFrame>
      </section>

      <section className="space-y-2" aria-label="Money">
        <h2 className="text-sm font-semibold text-muted-foreground">Money</h2>
        {data.finance ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Revenue" value={`${fmt(data.finance.revenue)} ${data.finance.currency}`} hint={data.period.label} tone="success" />
            <MetricCard label="Expenses" value={`${fmt(data.finance.expenses)} ${data.finance.currency}`} hint={data.period.label} />
            <MetricCard label="Payroll" value={`${fmt(data.finance.payroll)} ${data.finance.currency}`} hint={data.period.label} />
            <MetricCard label="Net" value={`${fmt(data.finance.revenue - data.finance.expenses)} ${data.finance.currency}`} tone={data.finance.revenue >= data.finance.expenses ? "success" : "danger"} />
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm">
            <LandmarkIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Revenue, expenses and payroll</p>
              <p className="text-muted-foreground">
                These appear here, next to each department&apos;s progress, once the Finance module is set up (roadmap Phase 8: income by product and channel, expenses, payroll, budgets
                against actuals). Until then the figures below come from the departments: budgets on live projects and spend recorded as a KPI.
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Budgets on live projects" value={fmt(totalBudget)} hint={data.money.map((m) => `${m.title} ${fmt(m.budget)}`).join(" · ")} />
          <MetricCard label="Spend recorded" value={fmt(totalSpend)} hint="All time, on live projects" />
          {data.money.map((m) => (
            <MetricCard
              key={m.dept}
              label={`${m.title} spend`}
              value={m.spendLabel ? `${fmt(m.spendPeriod)}${m.spendUnit ? ` ${m.spendUnit}` : ""}` : "-"}
              hint={m.spendLabel ? `${data.period.label}; budget used ${m.budget ? Math.round((m.spendTotal / m.budget) * 100) : 0}%` : "Add a Spend KPI in Configure"}
              tone={m.budget && m.spendTotal > m.budget ? "danger" : "default"}
            />
          ))}
        </div>
        {data.money.some((m) => m.fields.length) && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.money.flatMap((m) => m.fields.map((f) => <MetricCard key={`${m.dept}-${f.label}`} label={`${m.title}: ${f.label}`} value={fmt(f.total)} hint={`On work finished, ${data.period.label.toLowerCase()}`} />))}
          </div>
        )}
      </section>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <BriefcaseIcon className="size-3.5" /> Open a department above for its own dashboard.
      </p>
    </div>
  );
}
