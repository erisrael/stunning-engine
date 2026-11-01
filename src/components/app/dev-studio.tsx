"use client";

// The Dev studio views (Phase 12b): Sprint (planning against capacity, burndown and burnup, stand-ups, review and
// retrospective, velocity), Roadmap (projects by quarter with health, and DORA measures), and Specs and docs
// (SRS and the rest from templates, versions, reviewers, requirements traced to tasks, Word and PDF).

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckIcon, DownloadIcon, Loader2Icon, MinusIcon, PlayIcon, PlusIcon, PrinterIcon, SquareCheckIcon, Trash2Icon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChartFrame, LinesChart } from "@/components/app/charts";
import { CAT } from "@/lib/chart-colors";
import * as A from "@/app/actions/departments";
import type { DocView, Roadmap, SprintPage } from "@/server/dev-studio";
import { DOC_KINDS, DOC_STATUS_LABELS, DOC_TEMPLATES, type DocKind } from "@/lib/dev-docs";
import { RITUALS } from "@/lib/dept-config";
import { deptViewPath } from "@/lib/work";
import { cn } from "@/lib/utils";

type R = { ok: boolean; error?: string; data?: unknown };
function useRun() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (key: string, p: () => Promise<R>, done?: string) => {
    setBusy(key);
    const r = await p();
    setBusy(null);
    if (!r.ok) return toast.error(r.error ?? "Something went wrong."), null;
    if (done) toast.success(done);
    router.refresh();
    return r.data ?? true;
  };
  return { run, busy };
}
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---------------------------------------------------------------------------
// Sprint
// ---------------------------------------------------------------------------

export function SprintView({ dept, data, viewerId }: { dept: string; data: SprintPage; viewerId: string }) {
  const router = useRouter();
  const { run, busy } = useRun();
  const [goal, setGoal] = React.useState("");
  const [closing, setClosing] = React.useState(false);
  const [note, setNote] = React.useState("");
  const s = data.current;
  const unit = data.unit === "points" ? "pts" : "h";
  const total = data.tasks.reduce((n, t) => n + t.units, 0);
  const doneU = data.tasks.filter((t) => t.done).reduce((n, t) => n + t.units, 0);
  return (
    <div className="space-y-4" data-sprint-view>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={s?.id ?? ""} onValueChange={(v) => router.push(deptViewPath(dept, "sprint", `sprint=${v}`))}>
          <SelectTrigger className="w-64" aria-label="Sprint">
            <SelectValue placeholder="No sprint yet" />
          </SelectTrigger>
          <SelectContent>
            {data.sprints.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.name} ({x.status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data.canPlan && (
          <Button variant="outline" disabled={busy === "new"} onClick={() => run("new", () => A.createNextSprintAction(dept), "Next sprint planned")}>
            <PlusIcon /> Plan the next sprint
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {data.cfg.lengthWeeks} week{data.cfg.lengthWeeks === 1 ? "" : "s"}, from {DAYS[data.cfg.startDay]}; estimates in {data.unit}; unfinished work goes {data.cfg.carryOver === "next" ? "to the next sprint" : "back to the backlog"}.
        </span>
      </div>
      {!s ? (
        <p className="text-sm text-muted-foreground">No sprint yet. Plan the first one.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {s.name} <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                <span className="text-sm font-normal text-muted-foreground">
                  {s.start_date} to {s.end_date}
                </span>
              </CardTitle>
              <CardDescription>{s.goal ? `Goal: ${s.goal}` : "No goal yet."}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4 text-sm">
              <span>
                <b className="tabular-nums">{doneU}</b> of <b className="tabular-nums">{total}</b> {unit} done
              </span>
              {data.burn && data.burn.added > 0 && <span className="text-amber-700 dark:text-amber-400">{data.burn.added} {unit} added after the start</span>}
              {data.velocity.average !== null && (
                <span className="text-muted-foreground">
                  Velocity: {data.velocity.average} {unit} (last {data.velocity.last.length})
                </span>
              )}
              {data.canPlan && s.status === "planned" && (
                <span className="ml-auto flex gap-2">
                  <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Sprint goal" aria-label="Sprint goal" className="h-8 w-64" />
                  <Button size="sm" disabled={busy === "start"} onClick={() => run("start", () => A.startSprintAction(dept, s.id, goal || null), "Sprint started")}>
                    <PlayIcon /> Start
                  </Button>
                </span>
              )}
              {data.canPlan && s.status === "active" && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setClosing(!closing)}>
                  <SquareCheckIcon /> Sprint review and close
                </Button>
              )}
            </CardContent>
            {closing && s.status === "active" && (
              <CardContent className="space-y-2 border-t pt-3">
                <p className="text-sm">
                  Finished: {data.tasks.filter((t) => t.done).length}. Not finished: {data.tasks.filter((t) => !t.done).length}, which go {data.cfg.carryOver === "next" ? "to the next sprint" : "back to the backlog"}.
                </p>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review notes: what was shown, what was learned" aria-label="Review notes" />
                <Button size="sm" disabled={busy === "close"} onClick={() => run("close", () => A.closeSprintAction(dept, s.id, note || null), "Sprint closed").then((x) => x && setClosing(false))}>
                  Close the sprint
                </Button>
              </CardContent>
            )}
          </Card>

          {data.burn && (
            <div className="grid gap-3 lg:grid-cols-2">
              <ChartFrame
                title="Burndown"
                description={`Work left (${unit}) against the ideal line`}
                table={{ columns: ["Day", "Left", "Ideal"], rows: data.burn.days.map((d, i) => [d, data.burn!.remaining[i] ?? "", data.burn!.ideal[i]!]) }}
              >
                <LinesChart
                  data={data.burn.days.map((d, i) => ({ day: d.slice(5), left: data.burn!.remaining[i] ?? null, ideal: data.burn!.ideal[i] ?? null }))}
                  xKey="day"
                  series={[
                    { key: "left", label: "Left", color: CAT[0]! },
                    { key: "ideal", label: "Ideal", color: CAT[3]! },
                  ]}
                />
              </ChartFrame>
              <ChartFrame
                title="Burnup"
                description={`Work done against the total; a rising total is scope added (${unit})`}
                table={{ columns: ["Day", "Done", "Total"], rows: data.burn.days.map((d, i) => [d, data.burn!.done[i] ?? "", data.burn!.scope[i] ?? ""]) }}
              >
                <LinesChart
                  data={data.burn.days.map((d, i) => ({ day: d.slice(5), done: data.burn!.done[i] ?? null, total: data.burn!.scope[i] ?? null }))}
                  xKey="day"
                  series={[
                    { key: "done", label: "Done", color: CAT[1]! },
                    { key: "total", label: "Total", color: CAT[2]! },
                  ]}
                />
              </ChartFrame>
            </div>
          )}

          {s.status !== "closed" && <Planning dept={dept} data={data} />}
          <div className="grid gap-3 xl:grid-cols-2">
            <Standups dept={dept} data={data} viewerId={viewerId} />
            <Retro dept={dept} data={data} />
          </div>
          {data.cfg.definitionOfDone.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Definition of done</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {data.cfg.definitionOfDone.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {s.review_note && <p className="text-sm text-muted-foreground">Review notes: {s.review_note}</p>}
        </>
      )}
    </div>
  );
}

function Planning({ dept, data }: { dept: string; data: SprintPage }) {
  const { run, busy } = useRun();
  const [q, setQ] = React.useState("");
  const s = data.current!;
  const unit = data.unit === "points" ? "pts" : "h";
  const backlog = data.backlog.filter((t) => !q.trim() || `${t.code} ${t.title}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_18rem]" data-sprint-planning>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backlog</CardTitle>
          <CardDescription>Open work in no sprint, by priority.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the backlog" aria-label="Search the backlog" className="h-8" />
          <ul className="max-h-96 space-y-1 overflow-y-auto">
            {backlog.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded border px-2 py-1 text-sm" data-backlog-task={t.code}>
                <span className="font-mono text-[11px] text-muted-foreground">{t.code}</span>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{t.units || "?"}</span>
                {data.canPlan && (
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Add ${t.code} to the sprint`} disabled={busy === t.id} onClick={() => run(t.id, () => A.planTaskAction(dept, t.id, s.id))}>
                    <PlusIcon />
                  </Button>
                )}
              </li>
            ))}
            {!backlog.length && <li className="text-xs text-muted-foreground">Nothing in the backlog.</li>}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">In {s.name}</CardTitle>
          <CardDescription>
            {data.tasks.length} tasks, {data.tasks.reduce((n, t) => n + t.units, 0)} {unit}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="max-h-96 space-y-1 overflow-y-auto">
            {data.tasks.map((t) => (
              <li key={t.id} className={cn("flex items-center gap-2 rounded border px-2 py-1 text-sm", t.done && "opacity-60")} data-sprint-task={t.code}>
                <span className="font-mono text-[11px] text-muted-foreground">{t.code}</span>
                <span className={cn("min-w-0 flex-1 truncate", t.done && "line-through")}>{t.title}</span>
                {t.addedLate && <Badge variant="secondary">added late</Badge>}
                <span className="text-xs text-muted-foreground">{t.assignee ?? "nobody"}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{t.units || "?"}</span>
                {data.canPlan && !t.done && (
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Take ${t.code} out of the sprint`} disabled={busy === t.id} onClick={() => run(t.id, () => A.planTaskAction(dept, t.id, null))}>
                    <MinusIcon />
                  </Button>
                )}
              </li>
            ))}
            {!data.tasks.length && <li className="text-xs text-muted-foreground">Add work from the backlog.</li>}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capacity</CardTitle>
          <CardDescription>Per person, in {data.unit === "points" ? "story points per sprint" : "hours this sprint (from hours per week)"}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.capacity.map((p) => {
            const over = p.capacity > 0 && p.load > p.capacity;
            const pct = p.capacity ? Math.min(100, Math.round((p.load / p.capacity) * 100)) : 0;
            return (
              <div key={p.id} className="space-y-1 text-sm" data-capacity={p.name}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className={cn("tabular-nums text-xs", over ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {p.load} / {p.capacity || "?"}
                  </span>
                  {data.canPlan && (
                    <Input
                      type="number"
                      min={0}
                      defaultValue={p.capacity || ""}
                      key={p.capacity}
                      aria-label={`${p.name}'s capacity`}
                      className="h-7 w-16 text-xs"
                      onBlur={(e) => Number(e.currentTarget.value) !== p.capacity && run(`cap${p.id}`, () => A.setSprintCapacityAction(dept, p.id, Number(e.currentTarget.value)))}
                    />
                  )}
                </div>
                <div className="h-1.5 rounded bg-muted">
                  <div className={cn("h-1.5 rounded", over ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Standups({ dept, data, viewerId }: { dept: string; data: SprintPage; viewerId: string }) {
  const { run, busy } = useRun();
  const day = new Date().toISOString().slice(0, 10);
  const mine = data.standups.find((x) => x.user_id === viewerId && x.day === day);
  const [f, setF] = React.useState({ yesterday: mine?.yesterday ?? "", today: mine?.today ?? "", blockers: mine?.blockers ?? "" });
  const standup = data.cfg.rituals.find((r) => r.key === "standup");
  const days = [...new Set(data.standups.map((x) => x.day))].slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily stand-up</CardTitle>
        <CardDescription>{standup?.on ? `Every working day at ${standup.time}.` : "Notes per person per day."} Blockers go to the leads at once.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.current!.status !== "closed" && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Textarea rows={2} value={f.yesterday} onChange={(e) => setF({ ...f, yesterday: e.target.value })} placeholder="Yesterday" aria-label="Yesterday" />
            <Textarea rows={2} value={f.today} onChange={(e) => setF({ ...f, today: e.target.value })} placeholder="Today" aria-label="Today" />
            <Textarea rows={2} value={f.blockers} onChange={(e) => setF({ ...f, blockers: e.target.value })} placeholder="Blockers" aria-label="Blockers" />
            <Button size="sm" className="w-fit" disabled={busy === "su"} onClick={() => run("su", () => A.saveStandupAction(dept, data.current!.id, f), "Stand-up saved")}>
              Save my stand-up
            </Button>
          </div>
        )}
        {days.map((d) => (
          <div key={d} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{d}</p>
            {data.standups
              .filter((x) => x.day === d)
              .map((x) => (
                <p key={x.user_id + d} className="text-sm">
                  <b>{x.name}</b>: {[x.yesterday && `yesterday ${x.yesterday}`, x.today && `today ${x.today}`].filter(Boolean).join("; ")}
                  {x.blockers && <span className="text-destructive"> Blocked: {x.blockers}</span>}
                </p>
              ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Retro({ dept, data }: { dept: string; data: SprintPage }) {
  const { run, busy } = useRun();
  const [text, setText] = React.useState({ well: "", improve: "", action: "" });
  const cols = [
    ["well", "Went well"],
    ["improve", "To improve"],
    ["action", "Actions"],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Retrospective</CardTitle>
        <CardDescription>Actions become tasks, in the next sprint when there is one.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3" data-retro>
        {cols.map(([k, label]) => (
          <div key={k} className="space-y-1.5">
            <p className="text-sm font-medium">{label}</p>
            {data.retro
              .filter((r) => r.kind === k)
              .map((r) => (
                <div key={r.id} className="rounded border p-1.5 text-sm">
                  <p>{r.text}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    {r.author}
                    {k === "action" &&
                      (r.task_code ? (
                        <Badge variant="secondary" className="ml-auto">
                          {r.task_code}
                        </Badge>
                      ) : (
                        <Button size="xs" variant="outline" className="ml-auto" disabled={busy === r.id} onClick={() => run(r.id, () => A.retroToTaskAction(dept, r.id, null), "Task made")}>
                          Make a task
                        </Button>
                      ))}
                    <button type="button" aria-label="Remove" className="hover:text-foreground" onClick={() => run(`d${r.id}`, () => A.deleteRetroAction(dept, r.id))}>
                      <XIcon className="size-3" />
                    </button>
                  </p>
                </div>
              ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run(`a${k}`, () => A.addRetroAction(dept, data.current!.id, k, text[k]))) setText({ ...text, [k]: "" });
              }}
            >
              <Input value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} placeholder="Add" aria-label={`Add to ${label}`} className="h-8" />
            </form>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

const HEALTH: Record<string, { label: string; cls: string }> = {
  on_track: { label: "On track", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  at_risk: { label: "At risk", cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  late: { label: "Late", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
  done: { label: "Finished", cls: "bg-muted text-muted-foreground" },
};

export function RoadmapView({ data, dora }: { data: Roadmap; dora: { deploysPerWeek: number; releases: number; leadTimeHours: number | null; changeFailureRate: number | null } }) {
  const quarter = (d: string | null) => (d ? `${d.slice(0, 4)} Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}` : "No dates");
  const quarters = [...new Set(data.projects.map((p) => quarter(p.due_date ?? p.start_date)))].sort();
  return (
    <div className="space-y-4" data-roadmap>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="DORA measures">
        {[
          ["Deployments per week", String(dora.deploysPerWeek), `${dora.releases} releases in 90 days`],
          ["Lead time for changes", dora.leadTimeHours === null ? "No data" : dora.leadTimeHours < 48 ? `${dora.leadTimeHours} h` : `${Math.round(dora.leadTimeHours / 24)} days`, "From task created to released (median)"],
          ["Change failure rate", dora.changeFailureRate === null ? "No data" : `${dora.changeFailureRate}%`, "Releases followed by a bug within a week"],
          ["Time to restore", "Needs incidents", "Comes with incident tracking"],
        ].map(([l, v, h]) => (
          <div key={l} className="rounded-lg border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="text-xl font-semibold tabular-nums">{v}</p>
            <p className="text-[11px] text-muted-foreground">{h}</p>
          </div>
        ))}
      </div>
      {!data.projects.length && <p className="text-sm text-muted-foreground">No projects yet. Add them in Projects, with start and due dates.</p>}
      {quarters.map((q) => (
        <section key={q} className="space-y-2">
          <h3 className="text-sm font-semibold">{q}</h3>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.projects
              .filter((p) => quarter(p.due_date ?? p.start_date) === q)
              .map((p) => (
                <div key={p.id} className="space-y-1.5 rounded-lg border bg-card p-3" style={{ borderLeft: `4px solid ${p.color ?? "var(--chart-1)"}` }} data-roadmap-project={p.key}>
                  <div className="flex items-start gap-2">
                    <p className="flex-1 font-medium">
                      <span className="font-mono text-xs text-muted-foreground">{p.key}</span> {p.name}
                    </p>
                    <span className={cn("rounded px-1.5 py-0.5 text-[11px]", HEALTH[p.health]!.cls)}>{HEALTH[p.health]!.label}</span>
                  </div>
                  <div className="h-1.5 rounded bg-muted">
                    <div className="h-1.5 rounded bg-primary" style={{ width: `${p.progress}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.progress}% of {p.tasks} tasks (by {data.unit}) · {p.status}
                    {p.start_date || p.due_date ? ` · ${p.start_date ?? "?"} to ${p.due_date ?? "?"}` : ""}
                  </p>
                  <p className="text-xs">
                    {p.lead && <span>Lead: {p.lead}. </span>}
                    {p.team.length > 0 && <span className="text-muted-foreground">Team: {p.team.join(", ")}. </span>}
                    {p.openBugs > 0 && <span className="text-destructive">{p.openBugs} open bugs. </span>}
                    {p.nextMilestone && (
                      <span className="text-muted-foreground">
                        Next: {p.nextMilestone.name}
                        {p.nextMilestone.due ? ` (${p.nextMilestone.due})` : ""}
                      </span>
                    )}
                  </p>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Specs and docs
// ---------------------------------------------------------------------------

type DocRowT = { id: string; kind: DocKind; title: string; status: string; version: number; project: string | null; author: string | null; updatedAt: string };

export function DocsView({ dept, docs, projects, people, openId, workspace }: { dept: string; docs: DocRowT[]; projects: { id: string; name: string }[]; people: { id: string; name: string }[]; openId: string | null; workspace: string }) {
  const router = useRouter();
  const { run, busy } = useRun();
  const [template, setTemplate] = React.useState(DOC_TEMPLATES[0]!.key);
  const [project, setProject] = React.useState("none");
  if (openId) return <DocEditor dept={dept} id={openId} people={people} workspace={workspace} onBack={() => router.push(deptViewPath(dept, "docs"))} />;
  const t = DOC_TEMPLATES.find((x) => x.key === template)!;
  return (
    <div className="space-y-4" data-docs>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New document</CardTitle>
          <CardDescription>From a template; Myseed's own are included (an SRS for a learning feature, a test plan with the phones students use).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger className="w-80" aria-label="Template">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_TEMPLATES.map((x) => (
                <SelectItem key={x.key} value={x.key}>
                  {x.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={project} onValueChange={setProject}>
            <SelectTrigger className="w-56" aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={busy === "new"}
            onClick={async () => {
              const id = await run("new", () => A.createDocAction(dept, { kind: t.kind, template: t.key, projectId: project === "none" ? null : project }), "Document started");
              if (typeof id === "string") router.push(deptViewPath(dept, "docs", `doc=${id}`));
            }}
          >
            <PlusIcon /> Start
          </Button>
        </CardContent>
      </Card>
      <ul className="divide-y rounded-lg border bg-card">
        {docs.map((d) => (
          <li key={d.id}>
            <a href={deptViewPath(dept, "docs", `doc=${d.id}`)} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50" data-doc={d.title}>
              <span className="font-medium">{d.title}</span>
              <Badge variant="secondary">{DOC_KINDS.find((k) => k.key === d.kind)?.label ?? d.kind}</Badge>
              <span className="text-xs text-muted-foreground">
                v{d.version} · {DOC_STATUS_LABELS[d.status] ?? d.status}
                {d.project ? ` · ${d.project}` : ""}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {d.author} · {d.updatedAt.slice(0, 10)}
              </span>
            </a>
          </li>
        ))}
        {!docs.length && <li className="px-3 py-3 text-sm text-muted-foreground">No documents yet.</li>}
      </ul>
    </div>
  );
}

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
// Plain text with "#" headings, as HTML for Word and printing, with a cover page.
function docHtml(d: DocView, workspace: string) {
  const body = d.body
    .split("\n")
    .map((l) => {
      const h = l.match(/^(#{1,3})\s+(.*)$/);
      if (h) return `<h${h[1]!.length + 1}>${esc(h[2]!)}</h${h[1]!.length + 1}>`;
      return l.trim() ? `<p>${esc(l)}</p>` : "";
    })
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>body{font-family:Calibri,Arial,sans-serif;line-height:1.4;max-width:46rem;margin:2rem auto;color:#111}h2{margin-top:1.6em}.cover{page-break-after:always;padding-top:30vh}.cover h1{font-size:2.2em;margin:0}.muted{color:#555}</style></head><body><div class="cover"><p class="muted">${esc(workspace)}</p><h1>${esc(d.title)}</h1><p class="muted">${esc(DOC_KINDS.find((k) => k.key === d.kind)?.label ?? "")}, version ${d.version}, ${esc(DOC_STATUS_LABELS[d.status] ?? d.status)}</p><p class="muted">${new Date().toISOString().slice(0, 10)}</p></div>${body}</body></html>`;
}

function DocEditor({ dept, id, people, workspace, onBack }: { dept: string; id: string; people: { id: string; name: string }[]; workspace: string; onBack: () => void }) {
  const { run, busy } = useRun();
  const [d, setD] = React.useState<DocView | null>(null);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [reviewers, setReviewers] = React.useState<string[]>([]);
  const [link, setLink] = React.useState<Record<string, string>>({});
  const [note, setNote] = React.useState("");
  const load = React.useCallback(async () => {
    const r = await A.getDocAction(dept, id);
    if (!r.ok) return void toast.error(r.error);
    const v = r.data as DocView;
    setD(v);
    setTitle(v.title);
    setBody(v.body);
  }, [dept, id]);
  React.useEffect(() => void load(), [load]);
  if (!d) return <Loader2Icon className="animate-spin" />;
  const dirty = title !== d.title || body !== d.body;
  const save = async () => (await run("save", () => A.saveDocAction(dept, id, { title, body }), d.status === "draft" ? "Saved" : "Saved as a new version")) && load();
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([docHtml({ ...d, title, body }, workspace)], { type: "application/msword" }));
    a.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "document"}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(docHtml({ ...d, title, body }, workspace));
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <div className="space-y-3" data-doc-editor>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeftIcon /> All documents
        </Button>
        <Badge variant="secondary">
          v{d.version} · {DOC_STATUS_LABELS[d.status] ?? d.status}
        </Badge>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={download}>
            <DownloadIcon /> Word
          </Button>
          <Button size="sm" variant="outline" onClick={print}>
            <PrinterIcon /> PDF (print)
          </Button>
        </span>
      </div>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" className="text-lg font-semibold" disabled={!d.canEdit} />
      {d.status !== "draft" && <p className="text-xs text-muted-foreground">Changing it now saves a new version (the {d.status === "approved" ? "approved" : "reviewed"} one is kept in the history) and it goes through review again.</p>}
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={22} className="font-mono text-sm" aria-label="Document" disabled={!d.canEdit} />
      <div className="flex flex-wrap gap-2">
        {d.canEdit && (
          <Button disabled={!dirty || busy === "save"} onClick={save}>
            Save
          </Button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review and approval</CardTitle>
            <CardDescription>Named reviewers approve; when all have, it is approved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.reviewers.length > 0 && (
              <ul>
                {d.reviewers.map((r) => (
                  <li key={r.id}>
                    {r.approved ? <CheckIcon className="inline size-4 text-emerald-600" /> : "·"} {r.name}
                  </li>
                ))}
              </ul>
            )}
            {d.status === "draft" && d.canEdit && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {people.map((p) => {
                    const on = reviewers.includes(p.id);
                    return (
                      <button key={p.id} type="button" aria-pressed={on} onClick={() => setReviewers(on ? reviewers.filter((x) => x !== p.id) : [...reviewers, p.id])} className={cn("rounded-full border px-2 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                <Button size="sm" disabled={!reviewers.length || dirty || busy === "submit"} onClick={async () => (await run("submit", () => A.submitDocAction(dept, id, reviewers), "Sent for review")) && load()}>
                  Send for review
                </Button>
              </>
            )}
            {d.canApprove && (
              <div className="space-y-2">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comments (needed to ask for changes)" aria-label="Review comments" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={async () => (await run("ok", () => A.decideDocAction(dept, id, true, note), "Approved")) && load()}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={!note.trim()} onClick={async () => (await run("no", () => A.decideDocAction(dept, id, false, note), "Changes asked")) && load()}>
                    Ask for changes
                  </Button>
                </div>
              </div>
            )}
            {d.versions.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">Earlier versions</summary>
                <ul className="mt-1 text-xs text-muted-foreground">
                  {d.versions.map((v) => (
                    <li key={v.version}>
                      v{v.version} · {DOC_STATUS_LABELS[v.status] ?? v.status} · {v.saved_at.slice(0, 10)} {v.by ? `· ${v.by}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requirements traced to tasks</CardTitle>
            <CardDescription>IDs such as FR-1 in the text. Link each to the tasks that build it; uncovered ones stand out.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm" data-trace>
            {!d.trace.length && <p className="text-muted-foreground">No requirement IDs in the document yet (write FR-1, NFR-1...).</p>}
            {d.trace.map((t) => (
              <div key={t.req} className="flex flex-wrap items-center gap-1.5">
                <span className={cn("w-16 font-mono text-xs", !t.covered && "text-destructive")}>{t.req}</span>
                {t.tasks.map((x) => (
                  <Badge key={x.id} variant={x.done ? "default" : "secondary"} className="gap-1">
                    {x.code} {x.status}
                    {d.canEdit && (
                      <button type="button" aria-label={`Unlink ${x.code}`} onClick={async () => (await run(`u${t.req}${x.id}`, () => A.linkRequirementAction(dept, id, t.req, x.id, false))) && load()}>
                        <Trash2Icon className="size-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                {!t.covered && <span className="text-xs text-destructive">not covered</span>}
                {d.canEdit && (
                  <form
                    className="ml-auto flex gap-1"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await run(`l${t.req}`, () => A.linkRequirementAction(dept, id, t.req, link[t.req] ?? "", true), "Linked")) (setLink({ ...link, [t.req]: "" }), load());
                    }}
                  >
                    <Input value={link[t.req] ?? ""} onChange={(e) => setLink({ ...link, [t.req]: e.target.value })} placeholder="DEV-12" aria-label={`Task for ${t.req}`} className="h-7 w-24 text-xs" />
                  </form>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configure, Sprints
// ---------------------------------------------------------------------------

export function SprintSettings({ value, onChange }: { value: import("@/lib/dept-config").SprintConfig; onChange: (v: import("@/lib/dept-config").SprintConfig) => void }) {
  const v = value;
  const [line, setLine] = React.useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sprints</CardTitle>
        <CardDescription>How sprints work here. Switch sprints on in General, Features. The Sprint page plans, tracks and reviews them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-4">
          <label className="space-y-1">
            <span className="block text-xs font-medium">Length</span>
            <Select value={String(v.lengthWeeks)} onValueChange={(x) => onChange({ ...v, lengthWeeks: Number(x) })}>
              <SelectTrigger className="w-32" aria-label="Sprint length">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} week{n > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium">Starts on</span>
            <Select value={String(v.startDay)} onValueChange={(x) => onChange({ ...v, startDay: Number(x) })}>
              <SelectTrigger className="w-36" aria-label="Start day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d, i) => (
                  <SelectItem key={d} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium">Names</span>
            <Select value={v.naming} onValueChange={(x) => onChange({ ...v, naming: x as "number" | "date" })}>
              <SelectTrigger className="w-44" aria-label="Sprint names">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Sprint 14</SelectItem>
                <SelectItem value="date">Sprint 3 Nov (by date)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium">Estimates</span>
            <Select value={v.unit} onValueChange={(x) => onChange({ ...v, unit: x as "hours" | "points" })}>
              <SelectTrigger className="w-40" aria-label="Estimates in">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="points">Story points</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium">Unfinished work at the end</span>
            <Select value={v.carryOver} onValueChange={(x) => onChange({ ...v, carryOver: x as "next" | "backlog" })}>
              <SelectTrigger className="w-56" aria-label="Unfinished work">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="next">Moves to the next sprint</SelectItem>
                <SelectItem value="backlog">Goes back to the backlog</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium">Working days</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => {
              const on = v.workdays.includes(i);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => onChange({ ...v, workdays: on ? v.workdays.filter((x) => x !== i) : [...v.workdays, i].sort() })} className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  {d.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Rituals</p>
          {v.rituals.map((r, i) => (
            <div key={r.key} className="flex flex-wrap items-center gap-2">
              <label className="flex w-44 items-center gap-2">
                <input type="checkbox" checked={r.on} onChange={(e) => onChange({ ...v, rituals: v.rituals.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) })} />
                {RITUALS.find((x) => x.key === r.key)!.label}
              </label>
              {r.key !== "standup" && (
                <Select value={String(r.day ?? 1)} onValueChange={(x) => onChange({ ...v, rituals: v.rituals.map((y, j) => (j === i ? { ...y, day: Number(x) } : y)) })}>
                  <SelectTrigger className="h-8 w-32" aria-label={`${r.key} day`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, k) => (
                      <SelectItem key={d} value={String(k)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input type="time" value={r.time} onChange={(e) => onChange({ ...v, rituals: v.rituals.map((y, j) => (j === i ? { ...y, time: e.target.value } : y)) })} className="h-8 w-28" aria-label={`${r.key} time`} />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Definition of done</p>
          <ul className="space-y-1">
            {v.definitionOfDone.map((x, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="flex-1">{x}</span>
                <button type="button" aria-label="Remove" onClick={() => onChange({ ...v, definitionOfDone: v.definitionOfDone.filter((_, j) => j !== i) })}>
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), line.trim() && (onChange({ ...v, definitionOfDone: [...v.definitionOfDone, line.trim()] }), setLine("")))}>
            <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="For example: reviewed, tested on the low-end phone, docs updated" aria-label="Add to the definition of done" className="h-8" />
            <Button size="sm" variant="outline" type="submit">
              Add
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
