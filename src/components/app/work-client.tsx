"use client";

// Dev and Marketing work: board, list, projects (campaigns) and calendar, with task and project dialogs.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  LayoutDashboardIcon,
  FolderKanbanIcon,
  KanbanIcon,
  FileTextIcon,
  GanttChartIcon,
  TimerIcon,
  UsersIcon,
  ListTreeIcon,
  SheetIcon,
  ListIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  Trash2Icon,
  UploadIcon,
  XIcon, GitBranchIcon, CalculatorIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/primitives";
import {
  getTaskAction,
  stopTimerAction,
  saveSprintAction,
  deleteSprintAction,
  addMetricAction,
  addTaskCommentAction,
  bulkTasksAction,
  deleteMetricAction,
  deleteMilestoneAction,
  deleteProjectAction,
  importTasksAction,
  listMetricsAction,
  saveMilestoneAction,
  saveProjectAction,
  saveTaskAction,
  taskCommentsAction,
} from "@/app/actions/departments";
import type { DeptView, Project, Task, TaskFilter } from "@/server/work";
import { POSITION_LABELS, type Position } from "@/lib/domain";
import type { WorkDept } from "@/lib/work";
import { fieldRequired, fieldShown, formatField, labelOf, statusOf, type DeptConfig, type DeptField, type FieldValue, type Rights } from "@/lib/dept-config";
import { cn } from "@/lib/utils";
import { today, usable, type Access, type Person } from "./work-shared";
import { Board, OverviewTree, SheetView, TaskList, ViewOptions } from "./work-views";
import { TaskDialog } from "./work-task-dialog";
import { TimelineView } from "./work-timeline";
import { TeamView } from "./work-team";
import { ReportView } from "./work-report";
import { DashFilters } from "./dept-dashboard";
import type { DeptReportData, Sprint, TeamWorkload } from "@/server/work-extras";
import type { Period } from "@/lib/dashboards";

function download(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function WorkClient({
  dept,
  tab,
  filter,
  tasks,
  projects,
  people,
  access,
  config,
  viewerId,
  openTaskId,
  showArchived,
  dashboard,
  extraTabs = [],
  panel,
  views = [],
  sprints = [],
  timer = null,
  team = null,
  report = null,
  period = "30d",
  workspace = "",
}: {
  dept: WorkDept;
  tab: "dashboard" | "board" | "list" | "sheet" | "overview" | "timeline" | "team" | "report" | "projects" | "calendar" | "repos" | "accounting";
  filter: TaskFilter;
  tasks: Task[];
  projects: Project[];
  people: Person[];
  access: Access;
  config: DeptConfig;
  viewerId: string;
  openTaskId: string | null;
  showArchived: boolean;
  dashboard?: React.ReactNode;
  // Tabs a department adds (GitHub repositories, accounting) and the panel for the open one.
  extraTabs?: { key: "repos" | "accounting"; label: string }[];
  panel?: React.ReactNode;
  views?: DeptView[];
  sprints?: Sprint[];
  // The viewer's running timer, if any (in any department).
  timer?: { task_id: string; code: string; title: string; started_at: string; dept: string } | null;
  team?: TeamWorkload | null;
  report?: DeptReportData | null;
  period?: Period;
  workspace?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const cfg = config;
  const names = cfg.names;
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const [q, setQ] = React.useState(filter.q ?? "");
  const [editing, setEditing] = React.useState<Task | { status?: string; dueDate?: string; parentId?: string } | null>(null);
  // Opens a task by id, fetching it when this tab did not load it (Team, Report, notifications).
  const openById = async (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (t) return setEditing(t);
    const r = await getTaskAction(dept, id);
    if (!r.ok) return toast.error(r.error);
    setEditing(r.data as Task);
  };
  const [projectDialog, setProjectDialog] = React.useState<Project | "new" | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const writable = !access.readOnly;
  React.useEffect(() => {
    if (openTaskId) void openById(openTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTaskId]);
  const closeTask = () => {
    setEditing(null);
    if (openTaskId) go({ task: null });
  };
  const fieldCols = cfg.fields.filter((f) => f.active);
  const exportCsv = (list: Task[]) =>
    download(`${dept}-tasks-${today()}.csv`, [
      ["code", "title", "description", "type", "status", "priority", "project_key", "assignee", "due_date", "estimate_hours", "spent_hours", "progress", "labels", ...fieldCols.map((f) => f.key)],
      ...list.map((t) => [
        t.code,
        t.title,
        t.description,
        labelOf(cfg.types, t.type),
        labelOf(cfg.statuses, t.status),
        labelOf(cfg.priorities, t.priority),
        t.project_key,
        t.assignee_name,
        t.due_date,
        t.estimate_hours,
        t.spent_hours,
        t.progress,
        t.labels.join(";"),
        ...fieldCols.map((f) => (f.type === "multiselect" && Array.isArray(t.fields[f.key]) ? (t.fields[f.key] as string[]).join(";") : formatField(f, t.fields[f.key], people))),
      ]),
    ]);
  const importCsv = (file: File) =>
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: async (res) => {
        const r = await importTasksAction(dept, res.data);
        if (fileRef.current) fileRef.current.value = "";
        if (!r.ok) return toast.error(r.error);
        const d = r.data as { created: number; errors: string[] };
        if (d.errors.length) toast.warning(`${d.created} imported, ${d.errors.length} skipped`, { description: d.errors.slice(0, 4).join("\n"), duration: 12000 });
        else toast.success(`${d.created} ${names.tasks.toLowerCase()} imported`);
        router.refresh();
      },
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => (v === "dashboard" ? router.push(pathname) : go({ tab: v, task: null }))}>
          <TabsList>
            <TabsTrigger value="dashboard">
              <LayoutDashboardIcon className="size-3.5" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="board">
              <KanbanIcon className="size-3.5" /> Board
            </TabsTrigger>
            <TabsTrigger value="list">
              <ListIcon className="size-3.5" /> List
            </TabsTrigger>
            <TabsTrigger value="sheet">
              <SheetIcon className="size-3.5" /> Sheet
            </TabsTrigger>
            <TabsTrigger value="overview">
              <ListTreeIcon className="size-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <GanttChartIcon className="size-3.5" /> Timeline
            </TabsTrigger>
            {access.rights.seeAll && (
              <TabsTrigger value="team">
                <UsersIcon className="size-3.5" /> Team
              </TabsTrigger>
            )}
            <TabsTrigger value="report">
              <FileTextIcon className="size-3.5" /> {access.rights.seeAll ? "Report" : "My report"}
            </TabsTrigger>
            {extraTabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.key === "repos" ? <GitBranchIcon className="size-3.5" /> : <CalculatorIcon className="size-3.5" />} {t.label}
              </TabsTrigger>
            ))}
            <TabsTrigger value="projects">
              <FolderKanbanIcon className="size-3.5" /> {names.projects} ({projects.length})
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarIcon className="size-3.5" /> Calendar
            </TabsTrigger>
            {access.rights.configure && (
              <TabsTrigger value="configure">
                <Settings2Icon className="size-3.5" /> Configure
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex flex-wrap gap-2">
          {timer && <RunningTimer timer={timer} onStop={async () => {
            const r = await stopTimerAction();
            if (!r.ok) return toast.error(r.error);
            toast.success("Timer stopped");
            router.refresh();
          }} />}
          {writable && (
            <>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} title={`Columns: title, description, type, status, priority, assignee_email, project_key, due_date, estimate_hours, labels${fieldCols.length ? `, ${fieldCols.map((f) => f.key).join(", ")}` : ""}`}>
                <UploadIcon /> Import CSV
              </Button>
            </>
          )}
          {tab !== "dashboard" && tab !== "repos" && tab !== "accounting" && (
            <Button size="sm" variant="outline" onClick={() => exportCsv(tasks)} disabled={!tasks.length}>
              <DownloadIcon /> Export
            </Button>
          )}
          {writable && access.rights.projects && (
            <Button size="sm" variant="outline" onClick={() => setProjectDialog("new")}>
              <PlusIcon /> New {names.project.toLowerCase()}
            </Button>
          )}
          {writable && (
            <Button size="sm" onClick={() => setEditing({})}>
              <PlusIcon /> New {names.task.toLowerCase()}
            </Button>
          )}
        </div>
      </div>

      {tab !== "projects" && tab !== "dashboard" && tab !== "team" && tab !== "report" && tab !== "repos" && tab !== "accounting" && (
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              go({ q: q.trim() || null });
            }}
          >
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${names.tasks.toLowerCase()}`} className="h-8 w-48 pl-7 text-sm" />
          </form>
          <FilterSelect value={filter.project} onChange={(v) => go({ project: v })} placeholder={`Any ${names.project.toLowerCase()}`} options={[{ value: "none", label: `No ${names.project.toLowerCase()}` }, ...projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}` }))]} />
          <FilterSelect
            value={filter.assignee}
            onChange={(v) => go({ assignee: v })}
            placeholder="Anyone"
            options={[{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...(access.rights.seeAll ? people.map((p) => ({ value: p.id, label: p.name })) : [])]}
          />
          <FilterSelect value={filter.type} onChange={(v) => go({ type: v })} placeholder="Any type" options={cfg.types.map((t) => ({ value: t.key, label: t.label }))} />
          <FilterSelect value={filter.priority} onChange={(v) => go({ priority: v })} placeholder="Any priority" options={cfg.priorities.map((p) => ({ value: p.key, label: p.label }))} />
          <FilterSelect value={filter.due} onChange={(v) => go({ due: v })} placeholder="Any due date" options={[{ value: "overdue", label: "Overdue" }, { value: "week", label: "Due this week" }, { value: "none", label: "No due date" }]} />
          {cfg.features.sprints && sprints.length > 0 && (
            <FilterSelect
              value={filter.sprint}
              onChange={(v) => go({ sprint: v })}
              placeholder="Any sprint"
              options={[{ value: "current", label: "Current sprint" }, { value: "none", label: "No sprint" }, ...sprints.map((sp) => ({ value: sp.id, label: sp.name }))]}
            />
          )}
          {cfg.features.requests && access.rights.assign && (
            <FilterSelect value={filter.request} onChange={(v) => go({ request: v })} placeholder="All work" options={[{ value: "pending", label: "Requests waiting" }]} />
          )}
          {(tab === "list" || tab === "sheet" || tab === "overview" || tab === "timeline") && (
            <FilterSelect
              value={filter.open ? "open" : filter.status?.length === 1 ? filter.status[0] : null}
              onChange={(v) => go({ status: v })}
              placeholder="Any status"
              options={[{ value: "open", label: "Not finished" }, ...cfg.statuses.map((s) => ({ value: s.key, label: s.label }))]}
            />
          )}
        </div>
      )}

      {tab !== "projects" && tab !== "dashboard" && tab !== "team" && tab !== "report" && tab !== "repos" && tab !== "accounting" && <ViewOptions dept={dept} tab={tab} config={cfg} access={access} views={views} people={people} projects={projects} />}

      {tab === "dashboard" && dashboard}
      {(tab === "repos" || tab === "accounting") && panel}
      {tab === "board" && <Board dept={dept} config={cfg} people={people} tasks={tasks} viewerId={viewerId} access={access} onOpen={setEditing} onDetails={(status) => setEditing({ status })} />}
      {tab === "sheet" && <SheetView dept={dept} config={cfg} tasks={tasks} people={people} projects={projects} access={access} viewerId={viewerId} onOpen={setEditing} />}
      {tab === "overview" && <OverviewTree config={cfg} tasks={tasks} projects={projects} onOpen={setEditing} />}
      {tab === "timeline" && <TimelineView dept={dept} config={cfg} tasks={tasks} projects={projects} access={access} viewerId={viewerId} onOpen={setEditing} />}
      {(tab === "team" || tab === "report") && <DashFilters period={period} filters={[]} />}
      {tab === "team" && team && <TeamView dept={dept} config={cfg} data={team} people={people} access={access} onOpen={openById} />}
      {tab === "report" && report && <ReportView dept={dept} data={report} period={period} workspace={workspace} />}
      {tab === "list" && <TaskList dept={dept} config={cfg} tasks={tasks} filter={filter} people={people} projects={projects} access={access} viewerId={viewerId} go={go} onOpen={setEditing} onExport={exportCsv} />}
      {tab === "projects" && cfg.features.sprints && <Sprints dept={dept} sprints={sprints} canEdit={!access.readOnly && access.rights.projects} go={go} />}
      {tab === "projects" && <Projects dept={dept} config={cfg} projects={projects} access={access} showArchived={showArchived} go={go} onEdit={setProjectDialog} />}
      {tab === "calendar" && <MonthCalendar tasks={tasks} onOpen={setEditing} onAdd={writable ? (d) => setEditing({ dueDate: d }) : undefined} />}

      {editing && (
        <TaskDialog dept={dept} config={cfg} task={"id" in editing ? editing : null} preset={"id" in editing ? {} : editing} people={people} projects={projects} tasks={tasks} sprints={sprints} access={access} viewerId={viewerId} onClose={closeTask} />
      )}
      {projectDialog && <ProjectDialog dept={dept} config={cfg} project={projectDialog === "new" ? null : projectDialog} people={people} onClose={() => setProjectDialog(null)} />}
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options }: { value: string | null | undefined; onChange: (v: string | null) => void; placeholder: string; options: { value: string; label: string }[] }) {
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? null : v)}>
      <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label={placeholder}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MonthCalendar({ tasks, onOpen, onAdd }: { tasks: Task[]; onOpen: (t: Task) => void; onAdd?: (date: string) => void }) {
  const [month, setMonth] = React.useState(() => today().slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDay = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((startDay + days) / 7) * 7 }, (_, i) => {
    const d = i - startDay + 1;
    return d >= 1 && d <= days ? `${month}-${String(d).padStart(2, "0")}` : null;
  });
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const undated = tasks.filter((t) => !t.due_date).length;
  const done = (t: Task) => t.status_category === "done";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="outline" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeftIcon />
        </Button>
        <span className="w-40 text-center text-sm font-semibold">{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
        <Button size="icon-sm" variant="outline" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRightIcon />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMonth(today().slice(0, 7))}>
          Today
        </Button>
        {undated > 0 && <span className="ml-auto text-xs text-muted-foreground">{undated} tasks without a due date are not shown</span>}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-b bg-muted/50 p-1.5 font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          const list = d ? tasks.filter((t) => t.due_date === d) : [];
          return (
            <div key={i} className={cn("group min-h-24 border-r border-b p-1", !d && "bg-muted/20", d === today() && "bg-primary/5")}>
              {d && (
                <div className="flex items-center justify-between">
                  <span className={cn("text-[11px]", d === today() ? "font-bold text-primary" : "text-muted-foreground")}>{Number(d.slice(8))}</span>
                  {onAdd && (
                    <button type="button" className="opacity-0 group-hover:opacity-100" aria-label={`Add task on ${d}`} onClick={() => onAdd(d)}>
                      <PlusIcon className="size-3" />
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-0.5">
                {list.slice(0, 4).map((t) => (
                  <button key={t.id} type="button" onClick={() => onOpen(t)} className={cn("block w-full truncate rounded px-1 py-0.5 text-left text-[11px]", done(t) ? "bg-muted text-muted-foreground line-through" : "bg-primary/10 hover:bg-primary/20")}>
                    {t.title}
                  </button>
                ))}
                {list.length > 4 && <span className="text-[10px] text-muted-foreground">+{list.length - 4} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projects (campaigns)
// ---------------------------------------------------------------------------

function Projects({
  dept,
  config: cfg,
  projects,
  access,
  showArchived,
  go,
  onEdit,
}: {
  dept: WorkDept;
  config: DeptConfig;
  projects: Project[];
  access: Access;
  showArchived: boolean;
  go: (p: Record<string, string | null>) => void;
  onEdit: (p: Project) => void;
}) {
  const kpis = cfg.features.kpis ? cfg.kpis.filter((k) => k.active) : [];
  const [kpiFor, setKpiFor] = React.useState<Project | null>(null);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={showArchived} onCheckedChange={(v) => go({ archived: v ? "1" : null })} /> Show archived
      </label>
      {!projects.length ? (
        <EmptyState
          icon={<FolderKanbanIcon className="size-5" />}
          title={`No ${cfg.names.projects.toLowerCase()}`}
          description={access.rights.projects ? `Create one with New ${cfg.names.project.toLowerCase()}.` : "Heads and leads create them."}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className={cn(p.archived && "opacity-60")}>
              <CardHeader className="pb-2">
                <div className="flex items-start gap-2">
                  <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: p.color ?? "#7b68ee" }} />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">
                      <span className="font-mono text-xs text-muted-foreground">{p.key}</span> {p.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {labelOf(cfg.projectStatuses, p.status)}
                      {p.lead_name && ` · ${p.lead_name}`}
                      {p.due_date && ` · due ${p.due_date}`}
                    </p>
                  </div>
                  {access.rights.projects && !access.readOnly && (
                    <Button size="icon-xs" variant="ghost" aria-label="Edit" onClick={() => onEdit(p)}>
                      <PencilIcon />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.description && <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
                <div>
                  <div className="flex justify-between text-xs">
                    <span>{p.progress}% done</span>
                    <span className="text-muted-foreground tabular">
                      {p.done}/{p.total} {cfg.names.tasks.toLowerCase()}
                      {p.overdue ? ` · ${p.overdue} overdue` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
                {cfg.features.milestones && p.milestones.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {p.milestones.map((m) => (
                      <li key={m.id} className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", m.status === "done" ? "bg-[var(--st-done-fg)]" : "bg-muted-foreground/40")} />
                        <span className={cn("flex-1 truncate", m.status === "done" && "line-through")}>{m.name}</span>
                        <span className="text-muted-foreground tabular">
                          {m.done}/{m.total}
                          {m.due_date && ` · ${m.due_date.slice(5)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {kpis.length > 0 && (
                  <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                    {kpis
                      .filter((m) => p.meta.kpiTargets?.[m.key] || p.metrics[m.key])
                      .map((m) => {
                        const target = p.meta.kpiTargets?.[m.key];
                        const actual = p.metrics[m.key] ?? 0;
                        return (
                          <div key={m.key} className="flex items-center gap-2">
                            <span className="w-20">{m.label}</span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full bg-primary" style={{ width: `${target ? Math.min(100, (actual / target) * 100) : 0}%` }} />
                            </div>
                            <span className="tabular">
                              {actual.toLocaleString("en-US")}
                              {target ? ` / ${target.toLocaleString("en-US")}` : ""}
                              {m.unit && ` ${m.unit}`}
                            </span>
                          </div>
                        );
                      })}
                    {cfg.features.budget && p.budget != null && <p className="text-muted-foreground">Budget {p.budget.toLocaleString("en-US")}</p>}
                    <Button size="xs" variant="outline" onClick={() => setKpiFor(p)}>
                      KPI entries
                    </Button>
                  </div>
                )}
                <Button size="xs" variant="ghost" onClick={() => go({ tab: "list", project: p.id })}>
                  Open its {cfg.names.tasks.toLowerCase()}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {kpiFor && <KpiDialog dept={dept} config={cfg} project={kpiFor} access={access} onClose={() => setKpiFor(null)} />}
    </div>
  );
}

function ProjectDialog({ dept, config: cfg, project, people, onClose }: { dept: WorkDept; config: DeptConfig; project: Project | null; people: Person[]; onClose: () => void }) {
  const router = useRouter();
  const kpis = cfg.features.kpis ? cfg.kpis.filter((k) => k.active || project?.meta.kpiTargets?.[k.key]) : [];
  const [f, setF] = React.useState({
    key: project?.key ?? "",
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: project?.status ?? (cfg.projectStatuses.find((s) => s.active && s.category === "active") ?? cfg.projectStatuses.find((s) => s.active))!.key,
    leadId: project?.lead_id ?? "",
    startDate: project?.start_date ?? "",
    dueDate: project?.due_date ?? "",
    color: project?.color ?? "#7b68ee",
    budget: project?.budget != null ? String(project.budget) : "",
    channel: project?.meta.channel ?? "",
    archived: project?.archived ?? false,
    targets: Object.fromEntries(kpis.map((m) => [m.key, project?.meta.kpiTargets?.[m.key] ? String(project.meta.kpiTargets[m.key]) : ""])) as Record<string, string>,
  });
  const [ms, setMs] = React.useState({ name: "", due: "" });
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    const targets = Object.fromEntries(Object.entries(f.targets).filter(([, v]) => v && Number(v) > 0).map(([k, v]) => [k, Number(v)]));
    const r = await saveProjectAction(dept, {
      id: project?.id,
      key: f.key,
      name: f.name,
      description: f.description,
      status: f.status,
      leadId: f.leadId || null,
      startDate: f.startDate || null,
      dueDate: f.dueDate || null,
      color: f.color,
      budget: f.budget ? Number(f.budget) : null,
      meta: { ...project?.meta, ...(kpis.length ? { kpiTargets: targets, channel: f.channel || undefined } : {}) },
      archived: f.archived,
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Saved");
    onClose();
    router.refresh();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {project ? "Edit" : "New"} {cfg.names.project.toLowerCase()}
          </DialogTitle>
          <DialogDescription>The key prefixes its task codes, for example {f.key || "WEB"}-12.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <div className="space-y-1.5">
            <Label>Key</Label>
            <Input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toUpperCase() })} placeholder="WEB" maxLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {usable(cfg.projectStatuses, project?.status).map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Lead</Label>
            <Select value={f.leadId || "none"} onValueChange={(v) => setF({ ...f, leadId: v === "none" ? "" : v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No lead</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Start</Label>
            <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Due</Label>
            <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <Input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-9 p-1" />
          </div>
          {cfg.features.budget && (
            <div className="space-y-1.5">
              <Label>Budget (optional)</Label>
              <Input type="number" min={0} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
            </div>
          )}
        </div>
        {kpis.length > 0 && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Input value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} placeholder="Facebook, Telegram, TikTok, radio" />
            </div>
            <Label>KPI targets</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {kpis.map((m) => (
                <div key={m.key} className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    {m.label}
                    {m.unit && ` (${m.unit})`}
                  </span>
                  <Input type="number" min={0} value={f.targets[m.key]} onChange={(e) => setF({ ...f, targets: { ...f.targets, [m.key]: e.target.value } })} className="h-8" />
                </div>
              ))}
            </div>
          </div>
        )}
        {project && cfg.features.milestones && (
          <div className="space-y-2 rounded-lg border p-3">
            <Label>{cfg.names.milestone}s</Label>
            {project.milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={m.status === "done"}
                  onCheckedChange={async (v) => {
                    const r = await saveMilestoneAction(dept, { id: m.id, projectId: project.id, name: m.name, dueDate: m.due_date, status: v ? "done" : "open" });
                    if (!r.ok) return toast.error(r.error);
                    router.refresh();
                  }}
                />
                <span className="flex-1">{m.name}</span>
                <span className="text-xs text-muted-foreground">{m.due_date ?? ""}</span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Delete ${cfg.names.milestone.toLowerCase()}`}
                  onClick={async () => {
                    const r = await deleteMilestoneAction(dept, m.id);
                    if (!r.ok) return toast.error(r.error);
                    router.refresh();
                  }}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={ms.name} onChange={(e) => setMs({ ...ms, name: e.target.value })} placeholder={`New ${cfg.names.milestone.toLowerCase()}`} className="h-8" />
              <Input type="date" value={ms.due} onChange={(e) => setMs({ ...ms, due: e.target.value })} className="h-8 w-40" />
              <Button
                size="sm"
                variant="outline"
                disabled={!ms.name.trim()}
                onClick={async () => {
                  const r = await saveMilestoneAction(dept, { projectId: project.id, name: ms.name, dueDate: ms.due || null });
                  if (!r.ok) return toast.error(r.error);
                  setMs({ name: "", due: "" });
                  router.refresh();
                }}
              >
                Add
              </Button>
            </div>
          </div>
        )}
        {project && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.archived} onCheckedChange={(v) => setF({ ...f, archived: v })} /> Archived (hidden from lists)
          </label>
        )}
        <DialogFooter className="sm:justify-between">
          {project ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (!window.confirm(`Delete ${project.key}? Its ${cfg.names.tasks.toLowerCase()} are kept without a ${cfg.names.project.toLowerCase()}.`)) return;
                const r = await deleteProjectAction(dept, project.id);
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
              Cancel
            </Button>
            <Button disabled={busy || !f.key || !f.name.trim()} onClick={save}>
              {busy && <Loader2Icon className="animate-spin" />} Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiDialog({ dept, config, project, access, onClose }: { dept: WorkDept; config: DeptConfig; project: Project; access: Access; onClose: () => void }) {
  const router = useRouter();
  const metrics = config.kpis.filter((k) => k.active);
  const [rows, setRows] = React.useState<{ id: string; metric: string; value: number; recorded_on: string; note: string | null; created_by_name: string | null }[] | null>(null);
  const [f, setF] = React.useState({ metric: metrics[0]?.key ?? "", value: "", date: today(), note: "" });
  const load = React.useCallback(async () => {
    const r = await listMetricsAction(dept, project.id);
    if (r.ok) setRows(r.data as typeof rows);
  }, [dept, project.id]);
  React.useEffect(() => void load(), [load]);
  const label = (k: string) => labelOf(config.kpis, k);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>KPIs: {project.name}</DialogTitle>
          <DialogDescription>Record results as they come in; totals show on the {config.names.project.toLowerCase()} card.</DialogDescription>
        </DialogHeader>
        {!access.readOnly && access.rights.kpis && (
          <div className="grid gap-2 sm:grid-cols-[1fr_100px_140px]">
            <Select value={f.metric} onValueChange={(v) => setF({ ...f, metric: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {metrics.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="Value" />
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <Input className="sm:col-span-2" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (optional)" />
            <Button
              disabled={!f.value}
              onClick={async () => {
                const r = await addMetricAction(dept, { projectId: project.id, metric: f.metric, value: Number(f.value), recordedOn: f.date, note: f.note });
                if (!r.ok) return toast.error(r.error);
                setF({ ...f, value: "", note: "" });
                await load();
                router.refresh();
              }}
            >
              Add
            </Button>
          </div>
        )}
        <div className="max-h-72 overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <tbody>
              {rows?.map((r) => (
                <tr key={r.id} className="border-t first:border-t-0">
                  <td className="p-1.5">{r.recorded_on}</td>
                  <td className="p-1.5">{label(r.metric)}</td>
                  <td className="p-1.5 text-right tabular">{Number(r.value).toLocaleString("en-US")}</td>
                  <td className="p-1.5 text-muted-foreground">{r.note ?? r.created_by_name ?? ""}</td>
                  <td className="p-1.5">
                    {access.rights.projects && !access.readOnly && (
                      <button
                        type="button"
                        aria-label="Delete entry"
                        onClick={async () => {
                          const d = await deleteMetricAction(dept, r.id);
                          if (!d.ok) return toast.error(d.error);
                          await load();
                          router.refresh();
                        }}
                      >
                        <XIcon className="size-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows && !rows.length && (
                <tr>
                  <td className="p-3 text-center text-muted-foreground">No entries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RunningTimer({ timer, onStop }: { timer: { code: string; title: string; started_at: string }; onStop: () => void }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const m = Math.max(0, Math.floor((now - Date.parse(timer.started_at)) / 60000));
  return (
    <Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400" onClick={onStop} title={`Stop the timer on ${timer.code} ${timer.title}`}>
      <TimerIcon className="animate-pulse" /> {timer.code} {Math.floor(m / 60)}:{String(m % 60).padStart(2, "0")} · Stop
    </Button>
  );
}

// Sprints: plan, start (one at a time; starting one closes the previous) and close.
function Sprints({ dept, sprints, canEdit, go }: { dept: WorkDept; sprints: Sprint[]; canEdit: boolean; go: (p: Record<string, string | null>) => void }) {
  const router = useRouter();
  const [f, setF] = React.useState({ name: "", startDate: "", endDate: "", goal: "" });
  const save = async (input: Parameters<typeof saveSprintAction>[1]) => {
    const r = await saveSprintAction(dept, input);
    if (!r.ok) return toast.error(r.error);
    router.refresh();
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Sprints</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sprints.length ? (
          <ul className="divide-y rounded-lg border">
            {sprints.map((sp) => (
              <li key={sp.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{sp.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {sp.status === "active" ? "current" : sp.status}
                    {sp.start_date && ` · ${sp.start_date} to ${sp.end_date ?? "?"}`}
                    {sp.goal && ` · ${sp.goal}`}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground tabular">
                  {sp.done}/{sp.total} done
                </span>
                <Button size="xs" variant="ghost" onClick={() => go({ tab: "board", sprint: sp.id })}>
                  Open board
                </Button>
                {canEdit && sp.status !== "active" && sp.status !== "closed" && (
                  <Button size="xs" variant="outline" onClick={() => save({ id: sp.id, name: sp.name, goal: sp.goal, startDate: sp.start_date, endDate: sp.end_date, status: "active" })}>
                    Start
                  </Button>
                )}
                {canEdit && sp.status === "active" && (
                  <Button size="xs" variant="outline" onClick={() => save({ id: sp.id, name: sp.name, goal: sp.goal, startDate: sp.start_date, endDate: sp.end_date, status: "closed" })}>
                    Close
                  </Button>
                )}
                {canEdit && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Delete ${sp.name}`}
                    onClick={async () => {
                      if (!window.confirm(`Delete ${sp.name}? Its tasks stay, without a sprint.`)) return;
                      const r = await deleteSprintAction(dept, sp.id);
                      if (!r.ok) return toast.error(r.error);
                      router.refresh();
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No sprints yet.</p>
        )}
        {canEdit && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await save({ name: f.name, goal: f.goal, startDate: f.startDate || null, endDate: f.endDate || null, status: "planned" });
              setF({ name: "", startDate: "", endDate: "", goal: "" });
            }}
          >
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Sprint name" aria-label="Sprint name" className="h-8 w-40" />
            <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} aria-label="Sprint start" className="h-8 w-36" />
            <Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} aria-label="Sprint end" className="h-8 w-36" />
            <Input value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="Goal (optional)" aria-label="Sprint goal" className="h-8 flex-1" />
            <Button size="sm" variant="outline" type="submit" disabled={!f.name.trim()}>
              <PlusIcon /> Plan sprint
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
