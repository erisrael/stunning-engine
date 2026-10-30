"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileTextIcon, Loader2Icon, PlusIcon, SearchIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, MetricCard, Meter } from "@/components/app/primitives";
import { BarsChart, ChartFrame } from "@/components/app/charts";
import { deleteReportAction, reportFactsAction, saveReportAction } from "@/app/actions/departments";
import type { DeptReport, OwnerStats } from "@/server/owners";
import { CAT } from "@/lib/chart-colors";
import { DEPARTMENT_LABELS, DEPARTMENTS, STAGE_LABELS, type Department } from "@/lib/domain";

export function OwnersClient({
  tab,
  isOwner,
  stats,
  reports,
  writeFor,
  viewerId,
  filter,
  openId,
}: {
  tab: "overview" | "reports";
  isOwner: boolean;
  stats: OwnerStats | null;
  reports: DeptReport[];
  writeFor: Department[];
  viewerId: string;
  filter: { department: Department | null; status: string | null; q: string | null };
  openId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  return (
    <div className="space-y-4">
      {isOwner && (
        <Tabs value={tab} onValueChange={(v) => go({ tab: v === "overview" ? null : v })}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="reports">Department reports</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {tab === "overview" && stats && <Overview s={stats} />}
      {tab === "reports" && <Reports reports={reports} writeFor={writeFor} viewerId={viewerId} filter={filter} openId={openId} go={go} />}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US");

function Overview({ s }: { s: OwnerStats }) {
  const p = s.production;
  const coverage = p.grades.reduce((a, g) => ({ total: a.total + g.total, done: a.done + g.done }), { total: 0, done: 0 });
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Products</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Published videos" value={fmt(s.products.videos)} hint={`${fmt(p.publishedThisMonth)} this month`} />
          <MetricCard label="Published notes" value={fmt(s.products.notes)} />
          <MetricCard label="Published exams" value={fmt(s.products.exams)} />
          <MetricCard label="Flash card decks" value={fmt(s.products.decks)} hint={`${fmt(s.products.cards)} cards`} />
          <MetricCard label="Approved questions" value={fmt(s.products.questions)} />
          <MetricCard label="Studio work in review" value={fmt(s.products.inReview)} hint={`${fmt(s.products.drafts)} drafts`} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Production</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="In production" value={fmt(p.inProduction)} hint={`${fmt(p.draft)} not started`} />
          <MetricCard label="Overdue" value={fmt(p.overdue)} tone={p.overdue ? "warning" : "default"} />
          <MetricCard label="Curriculum covered" value={`${coverage.total ? Math.round((coverage.done / coverage.total) * 100) : 0}%`} hint={`${fmt(coverage.done)} of ${fmt(coverage.total)} parts published`} />
          <MetricCard label="People active this week" value={fmt(s.users.activeWeek)} hint={`of ${fmt(s.users.total)} accounts`} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartFrame title="Published per week" description="Last 8 weeks" table={{ columns: ["Week ending", "Published"], rows: p.weekly.map((w) => [w.week, w.published]) }}>
            <BarsChart data={p.weekly.map((w) => ({ week: w.week.slice(5), published: w.published }))} xKey="week" series={[{ key: "published", label: "Published", color: CAT[0] }]} />
          </ChartFrame>
          <ChartFrame title="Work in each stage now" table={{ columns: ["Stage", "Items"], rows: p.byStage.map((b) => [STAGE_LABELS[b.stage], b.count]) }}>
            <BarsChart data={p.byStage.map((b) => ({ stage: STAGE_LABELS[b.stage], items: b.count }))} xKey="stage" series={[{ key: "items", label: "Items", color: CAT[0] }]} />
          </ChartFrame>
        </div>
        {p.grades.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Curriculum covered by grade</h3>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {p.grades.map((g) => (
                <div key={g.grade} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0">{g.grade}</span>
                  <Meter value={g.done} max={Math.max(1, g.total)} className="flex-1" />
                  <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular">
                    {fmt(g.done)}/{fmt(g.total)} ({g.total ? Math.round((g.done / g.total) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Departments</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {s.people.map((d) => (
            <MetricCard key={d.dept} label={`${d.label} people`} value={fmt(d.count)} />
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {s.work.map((w) => (
            <div key={w.dept} className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{s.names[w.dept]?.title ?? w.dept}</h3>
                <span className="text-xs text-muted-foreground tabular">
                  {fmt(w.done)} done · {fmt(w.open)} open{w.overdue ? ` · ${fmt(w.overdue)} overdue` : ""}
                </span>
              </div>
              <Meter value={w.done} max={Math.max(1, w.total)} />
              <ul className="space-y-1.5 pt-1">
                {s.projects
                  .filter((x) => x.dept === w.dept)
                  .map((x) => (
                    <li key={x.key} className="flex items-center gap-2 text-xs">
                      <span className="w-40 truncate">
                        <span className="font-mono text-muted-foreground">{x.key}</span> {x.name}
                      </span>
                      <Meter value={x.done} max={Math.max(1, x.total)} className="flex-1" />
                      <span className="w-24 text-right text-muted-foreground tabular">
                        {x.total ? Math.round((x.done / x.total) * 100) : 0}%{x.due_date ? ` · ${x.due_date.slice(5)}` : ""}
                      </span>
                    </li>
                  ))}
                {!s.projects.some((x) => x.dept === w.dept) && <li className="text-xs text-muted-foreground">No active {(s.names[w.dept]?.projects ?? "projects").toLowerCase()}.</li>}
              </ul>
            </div>
          ))}
        </div>
        {s.kpis.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {s.kpis.map((k) => (
              <MetricCard key={k.metric} label={`Marketing ${k.label.toLowerCase()}`} value={fmt(k.total)} hint="this month" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function Reports({
  reports,
  writeFor,
  viewerId,
  filter,
  openId,
  go,
}: {
  reports: DeptReport[];
  writeFor: Department[];
  viewerId: string;
  filter: { department: Department | null; status: string | null; q: string | null };
  openId: string | null;
  go: (p: Record<string, string | null>) => void;
}) {
  const [q, setQ] = React.useState(filter.q ?? "");
  const [open, setOpen] = React.useState<DeptReport | "new" | null>(null);
  React.useEffect(() => {
    if (openId) setOpen(reports.find((r) => r.id === openId) ?? null);
  }, [openId, reports]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() || null });
          }}
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports" className="h-8 w-52 pl-7 text-sm" />
        </form>
        <Select value={filter.department ?? "all"} onValueChange={(v) => go({ dept: v === "all" ? null : v })}>
          <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Department">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Every department</SelectItem>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter.status ?? "all"} onValueChange={(v) => go({ status: v === "all" ? null : v })}>
          <SelectTrigger size="sm" className="h-8 w-36 text-xs" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Drafts and sent</SelectItem>
            <SelectItem value="submitted">Sent</SelectItem>
            <SelectItem value="draft">Drafts</SelectItem>
          </SelectContent>
        </Select>
        {writeFor.length > 0 && (
          <Button size="sm" className="ml-auto" onClick={() => setOpen("new")}>
            <PlusIcon /> New report
          </Button>
        )}
      </div>
      {!reports.length ? (
        <EmptyState icon={<FileTextIcon className="size-5" />} title="No reports" description={writeFor.length ? "Write one for your department; owners are told when it is sent." : "Reports appear here when department heads and leads send them."} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {reports.map((r) => (
            <button key={r.id} type="button" onClick={() => setOpen(r)} className="space-y-1.5 rounded-xl border bg-card p-4 text-left hover:border-primary/40">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{DEPARTMENT_LABELS[r.department]}</Badge>
                {r.status === "draft" && <Badge variant="outline">Draft</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {r.period_start} to {r.period_end}
                </span>
              </div>
              <p className="font-medium">{r.title}</p>
              <p className="line-clamp-3 text-sm text-muted-foreground">{r.summary}</p>
              <p className="text-xs text-muted-foreground">
                {r.author_name ?? "Unknown"}
                {r.submitted_at ? `, sent ${r.submitted_at.slice(0, 10)}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}
      {open && <ReportDialog report={open === "new" ? null : open} writeFor={writeFor} viewerId={viewerId} onClose={() => (setOpen(null), openId && go({ open: null }))} />}
    </div>
  );
}

function lastWeek() {
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 864e5);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function ReportDialog({ report, writeFor, viewerId, onClose }: { report: DeptReport | null; writeFor: Department[]; viewerId: string; onClose: () => void }) {
  const router = useRouter();
  const canEdit = !report || (report.author_id === viewerId && writeFor.includes(report.department));
  const lw = lastWeek();
  const [f, setF] = React.useState({
    department: report?.department ?? writeFor[0] ?? "production",
    periodStart: report?.period_start ?? lw.start,
    periodEnd: report?.period_end ?? lw.end,
    title: report?.title ?? `Week ending ${lw.end}`,
    summary: report?.summary ?? "",
    highlights: report?.highlights ?? "",
    risks: report?.risks ?? "",
    nextSteps: report?.next_steps ?? "",
  });
  const [busy, setBusy] = React.useState(false);
  const save = async (submit: boolean) => {
    setBusy(true);
    const r = await saveReportAction({ id: report?.id, ...f, department: f.department as Department, submit });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(submit ? "Sent to the owners" : "Draft saved");
    onClose();
    router.refresh();
  };
  const field = (k: "summary" | "highlights" | "risks" | "nextSteps", label: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {canEdit ? <Textarea rows={k === "summary" ? 4 : 3} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={placeholder} /> : <p className="text-sm whitespace-pre-wrap">{f[k] || "-"}</p>}
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{report ? (canEdit ? "Edit report" : report.title) : "New department report"}</DialogTitle>
          <DialogDescription>
            {report ? `${DEPARTMENT_LABELS[report.department]}, ${report.period_start} to ${report.period_end}, by ${report.author_name ?? "unknown"}` : "Saved as a draft until you send it. Owners are told when it is sent."}
          </DialogDescription>
        </DialogHeader>
        {canEdit && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={f.department} onValueChange={(v) => setF({ ...f, department: v as Department })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {writeFor.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DEPARTMENT_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Title</Label>
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </div>
          </div>
        )}
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={async () => {
              const r = await reportFactsAction(f.department as Department, f.periodStart, f.periodEnd);
              if (!r.ok) return toast.error(r.error);
              setF((x) => ({ ...x, summary: x.summary ? `${x.summary}\n${r.data}` : String(r.data) }));
            }}
          >
            <SparklesIcon /> Add the period&apos;s numbers
          </Button>
        )}
        {field("summary", "Summary", "What happened in this period")}
        {field("highlights", "Highlights", "Wins and finished work")}
        {field("risks", "Risks and blockers", "What could slow the team down, and what help is needed")}
        {field("nextSteps", "Next steps", "Plans for the next period")}
        <DialogFooter className="sm:justify-between">
          {report && canEdit && report.status === "draft" ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (!window.confirm("Delete this draft?")) return;
                const r = await deleteReportAction(report.id);
                if (!r.ok) return toast.error(r.error);
                onClose();
                router.refresh();
              }}
            >
              <Trash2Icon /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {canEdit ? "Cancel" : "Close"}
            </Button>
            {canEdit && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => save(false)}>
                  Save draft
                </Button>
                <Button disabled={busy || !f.summary.trim() || !f.title.trim()} onClick={() => save(true)}>
                  {busy && <Loader2Icon className="animate-spin" />} {report?.status === "submitted" ? "Update" : "Send to owners"}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
