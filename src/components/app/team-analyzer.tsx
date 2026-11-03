"use client";

// The team analyzer (Phase 23): how work flows through a department, for its leads. Charts and tables come from
// the app's own analysis; with the AI on, "Explain with AI" writes it up and answers a question about it.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, Loader2Icon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarsChart, ChartFrame } from "@/components/app/charts";
import { MetricCard } from "@/components/app/primitives";
import { analyzeTeamAction } from "@/app/actions/insights";
import type { TeamInsights } from "@/server/team-insights";
import { cn } from "@/lib/utils";

const TONE = {
  bad: { icon: CircleAlertIcon, cls: "border-[#D93025]/40 bg-[#D93025]/5", ic: "text-[#D93025]" },
  warn: { icon: TriangleAlertIcon, cls: "border-[#F9AB00]/50 bg-[#F9AB00]/5", ic: "text-[#B06000]" },
  info: { icon: InfoIcon, cls: "border-[#1A73E8]/30 bg-[#1A73E8]/5", ic: "text-[#1A73E8]" },
  good: { icon: CircleCheckIcon, cls: "border-[#188038]/30 bg-[#188038]/5", ic: "text-[#188038]" },
} as const;

const fmt = (n: number | null, unit = " d") => (n === null ? "–" : `${n}${unit}`);

export function TeamAnalyzer({ dept, data, ai, taskHref }: { dept: string; data: TeamInsights; ai: boolean; taskHref: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const explain = async () => {
    setBusy(true);
    const r = await analyzeTeamAction(dept, question.trim() || null, data.weeks);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setAnswer(r.data?.text ?? "The AI is not on; the analysis below is the app's own.");
  };
  const setWeeks = (w: number) => {
    const q = new URLSearchParams(sp.toString());
    q.set("weeks", String(w));
    router.push(`${pathname}?${q.toString()}`);
  };
  const open = (id: string) => `${taskHref}?task=${id}`;
  const riskList = (title: string, rows: { id: string; code: string; title: string; status: string; due: string | null; assignee: string | null; days?: number; href?: string | null }[], key: string) => (
    <Card data-risk={key}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {title} ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {rows.length ? (
          rows.slice(0, 8).map((t) => (
            <Link key={t.id} href={t.href ?? open(t.id)} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
              <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{t.days !== undefined ? `${t.days} d in ${t.status}` : t.due ? `due ${t.due}` : t.status}</span>
            </Link>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">None.</p>
        )}
      </CardContent>
    </Card>
  );
  return (
    <div className="space-y-4" data-team-analyzer>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Looking at the last</span>
        {[4, 8, 13, 26].map((w) => (
          <Button key={w} size="xs" variant={data.weeks === w ? "default" : "outline"} onClick={() => setWeeks(w)}>
            {w} weeks
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Open" value={data.totals.open} hint={`${data.totals.wip} being worked on`} />
        <MetricCard label="Finished" value={data.totals.done} hint={`${data.totals.created} created`} tone={data.totals.done >= data.totals.created ? "success" : "default"} />
        <MetricCard label="Overdue" value={data.totals.overdue} tone={data.totals.overdue ? "danger" : "default"} />
        <MetricCard label="No owner" value={data.totals.unassigned} tone={data.totals.unassigned ? "warning" : "default"} />
        <MetricCard label="Cycle time" value={fmt(data.cycle.median)} hint={`85% within ${fmt(data.cycle.p85)}`} />
        <MetricCard label="Lead time" value={fmt(data.lead.median)} hint={`85% within ${fmt(data.lead.p85)}`} />
      </div>

      <Card className="border-[#9334E6]/30" data-analyzer-ai>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-base">
            <SparklesIcon className="size-4 text-[#9334E6]" /> What the analysis says
          </CardTitle>
          <CardDescription>Worked out from the tasks and every move between statuses.{ai ? " Explain with AI writes it up and answers your question." : ""}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            {data.insights.map((x, i) => {
              const T = TONE[x.tone];
              return (
                <div key={i} className={cn("flex gap-2 rounded-lg border p-2.5 text-sm", T.cls)} data-insight={x.tone}>
                  <T.icon className={cn("mt-0.5 size-4 shrink-0", T.ic)} />
                  <div>
                    <p className="font-medium">{x.title}</p>
                    <p className="text-xs text-muted-foreground">{x.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {ai && (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your team, e.g. who can take more work?" aria-label="Question about the team" />
                <Button onClick={explain} disabled={busy} className="shrink-0">
                  {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Explain with AI
                </Button>
              </div>
              {answer && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap" data-analyzer-answer>
                  {answer}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Created and finished per week" description="When more arrives than is finished, the backlog grows." table={{ columns: ["Week", "Created", "Finished"], rows: data.flow.map((f) => [f.week, f.created, f.done]) }}>
          <BarsChart
            data={data.flow.map((f) => ({ week: f.week.slice(5), created: f.created, done: f.done }))}
            xKey="week"
            series={[
              { key: "created", label: "Created", color: "#4285F4" },
              { key: "done", label: "Finished", color: "#34A853" },
            ]}
          />
        </ChartFrame>
        <ChartFrame title="Where work is now" description="Open tasks in each status and how many days they have waited there on average." table={{ columns: ["Status", "Tasks", "Average days", "Oldest"], rows: data.statuses.map((s) => [s.label, s.count, s.avgDays, s.oldestDays]) }}>
          <BarsChart
            data={data.statuses.map((s) => ({ status: s.label, count: s.count, avgDays: s.avgDays }))}
            xKey="status"
            series={[
              { key: "count", label: "Tasks", color: "#9334E6" },
              { key: "avgDays", label: "Average days there", color: "#F9AB00" },
            ]}
          />
        </ChartFrame>
      </div>

      <Card data-analyzer-members>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>Open work against weekly capacity, pace and on-time rate over the period.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">Person</th>
                <th>Open</th>
                <th>In progress</th>
                <th>Overdue</th>
                <th>Finished</th>
                <th>Per week</th>
                <th>On time</th>
                <th>Cycle</th>
                <th>Load</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id} className="border-t" data-member={m.name}>
                  <td className="py-1.5 font-medium">{m.name}</td>
                  <td>{m.open}</td>
                  <td className={m.inProgress >= 5 ? "text-[#B06000]" : ""}>{m.inProgress}</td>
                  <td className={m.overdue ? "text-[#D93025]" : ""}>{m.overdue}</td>
                  <td>{m.done}</td>
                  <td>{m.perWeek}</td>
                  <td>{m.onTimePct === null ? "–" : `${m.onTimePct}%`}</td>
                  <td>{fmt(m.cycleMedian)}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", (m.loadPct ?? 0) > 120 ? "bg-[#D93025]" : (m.loadPct ?? 0) > 90 ? "bg-[#F9AB00]" : "bg-[#34A853]")} style={{ width: `${Math.min(100, m.loadPct ?? 0)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{m.loadPct === null ? "–" : `${m.loadPct}%`}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {riskList("Overdue", data.risks.overdue, "overdue")}
        {riskList("Stuck for a week or more", data.risks.stuck, "stuck")}
        {riskList("Blocked", data.risks.blocked, "blocked")}
        {riskList("Urgent without an owner", data.risks.unowned, "unowned")}
      </div>
    </div>
  );
}
