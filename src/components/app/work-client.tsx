"use client";

// Dev and Marketing work: board, list, projects (campaigns) and calendar, with task and project dialogs.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  LayoutDashboardIcon,
  FolderKanbanIcon,
  KanbanIcon,
  ListIcon,
  Loader2Icon,
  MessageSquareIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, UserAvatar } from "@/components/app/primitives";
import {
  addMetricAction,
  addTaskCommentAction,
  bulkTasksAction,
  deleteMetricAction,
  deleteMilestoneAction,
  deleteProjectAction,
  importTasksAction,
  listMetricsAction,
  moveTaskAction,
  saveMilestoneAction,
  saveProjectAction,
  saveTaskAction,
  taskCommentsAction,
} from "@/app/actions/departments";
import type { Project, Task, TaskFilter } from "@/server/work";
import { POSITION_LABELS, type Position } from "@/lib/domain";
import type { WorkDept } from "@/lib/work";
import { fieldEmpty, fieldRequired, fieldShown, formatField, labelOf, statusOf, type DeptConfig, type DeptField, type FieldValue, type Rights } from "@/lib/dept-config";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; position: Position };
type Access = { rights: Rights; readOnly: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const finished = (t: Task) => t.status_category === "done" || t.status_category === "cancelled";
// Active items, plus the one already in use (a switched-off status or type stays readable on old tasks).
const usable = <T extends { key: string; active: boolean }>(items: T[], current?: string) => items.filter((i) => i.active || i.key === current);

function Tone({ config, status }: { config: DeptConfig; status: string }) {
  const s = statusOf(config, status);
  const c = s?.color ?? "#94a3b8";
  return (
    <span className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium" style={{ background: `${c}22`, color: c }}>
      {s?.label ?? status}
    </span>
  );
}

function PriorityDot({ config, priority }: { config: DeptConfig; priority: string }) {
  const p = config.priorities.find((x) => x.key === priority);
  return <span className="size-2 shrink-0 rounded-full" style={{ background: p?.color ?? "#94a3b8" }} title={p?.label ?? priority} />;
}

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
}: {
  dept: WorkDept;
  tab: "dashboard" | "board" | "list" | "projects" | "calendar";
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
  const [editing, setEditing] = React.useState<Task | { status?: string; dueDate?: string } | null>(null);
  const [projectDialog, setProjectDialog] = React.useState<Project | "new" | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const writable = !access.readOnly;
  React.useEffect(() => {
    if (openTaskId) {
      const t = tasks.find((x) => x.id === openTaskId);
      if (t) setEditing(t);
    }
  }, [openTaskId, tasks]);
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
          {writable && (
            <>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} title={`Columns: title, description, type, status, priority, assignee_email, project_key, due_date, estimate_hours, labels${fieldCols.length ? `, ${fieldCols.map((f) => f.key).join(", ")}` : ""}`}>
                <UploadIcon /> Import CSV
              </Button>
            </>
          )}
          {tab !== "dashboard" && (
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

      {tab !== "projects" && tab !== "dashboard" && (
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
          {tab === "list" && (
            <FilterSelect
              value={filter.open ? "open" : filter.status?.length === 1 ? filter.status[0] : null}
              onChange={(v) => go({ status: v })}
              placeholder="Any status"
              options={[{ value: "open", label: "Not finished" }, ...cfg.statuses.map((s) => ({ value: s.key, label: s.label }))]}
            />
          )}
        </div>
      )}

      {tab === "dashboard" && dashboard}
      {tab === "board" && <Board dept={dept} config={cfg} people={people} tasks={tasks} viewerId={viewerId} access={access} onOpen={setEditing} onAdd={(status) => setEditing({ status })} />}
      {tab === "list" && <TaskList dept={dept} config={cfg} tasks={tasks} filter={filter} people={people} projects={projects} access={access} viewerId={viewerId} go={go} onOpen={setEditing} onExport={exportCsv} />}
      {tab === "projects" && <Projects dept={dept} config={cfg} projects={projects} access={access} showArchived={showArchived} go={go} onEdit={setProjectDialog} />}
      {tab === "calendar" && <MonthCalendar tasks={tasks} onOpen={setEditing} onAdd={writable ? (d) => setEditing({ dueDate: d }) : undefined} />}

      {editing && <TaskDialog dept={dept} config={cfg} task={"id" in editing ? editing : null} preset={"id" in editing ? {} : editing} people={people} projects={projects} access={access} viewerId={viewerId} onClose={closeTask} />}
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

function TaskCard({ t, config, people, onOpen, draggable, onDragStart }: { t: Task; config: DeptConfig; people: Person[]; onOpen: () => void; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void }) {
  const overdue = t.due_date && t.due_date < today() && !finished(t);
  const type = config.types.find((x) => x.key === t.type);
  const shown = config.fields.filter((f) => f.onCard && fieldShown(f, t.type) && !fieldEmpty(t.fields[f.key]));
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onOpen}
      data-task={t.id}
      className="block w-full rounded-lg border bg-card p-2 text-left text-sm shadow-xs hover:border-primary/40"
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <PriorityDot config={config} priority={t.priority} />
        <span className="font-mono">{t.code}</span>
        {type && (
          <span className="truncate rounded px-1 text-[10px]" style={{ background: `${type.color}22`, color: type.color }}>
            {type.label}
          </span>
        )}
        {t.comments > 0 && (
          <span className="ml-auto flex items-center gap-0.5">
            <MessageSquareIcon className="size-3" /> {t.comments}
          </span>
        )}
      </div>
      <p className="mt-0.5 line-clamp-2 font-medium">{t.title}</p>
      {shown.length > 0 && (
        <dl className="mt-1 space-y-0.5 text-[11px]">
          {shown.map((f) => (
            <div key={f.key} className="flex gap-1">
              <dt className="text-muted-foreground">{f.label}:</dt>
              <dd className="truncate">{formatField(f, t.fields[f.key], people)}</dd>
            </div>
          ))}
        </dl>
      )}
      {config.features.progress && t.progress > 0 && !finished(t) && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${t.progress}%` }} />
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        {t.assignee_name ? <UserAvatar name={t.assignee_name} size="xs" /> : <span className="text-[11px] text-muted-foreground italic">Unassigned</span>}
        {t.labels.slice(0, 2).map((l) => (
          <span key={l} className="rounded bg-muted px-1 text-[10px]">
            {l}
          </span>
        ))}
        {t.due_date && <span className={cn("ml-auto text-[11px]", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{t.due_date.slice(5)}</span>}
      </div>
    </button>
  );
}

function Board({
  dept,
  config,
  people,
  tasks,
  viewerId,
  access,
  onOpen,
  onAdd,
}: {
  dept: WorkDept;
  config: DeptConfig;
  people: Person[];
  tasks: Task[];
  viewerId: string;
  access: Access;
  onOpen: (t: Task) => void;
  onAdd: (s: string) => void;
}) {
  const router = useRouter();
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [local, setLocal] = React.useState(tasks);
  React.useEffect(() => setLocal(tasks), [tasks]);
  const canMove = (t: Task) => !access.readOnly && (access.rights.editAll || t.assignee_id === viewerId || t.reporter_id === viewerId);
  // Columns: statuses shown on the board, plus any switched-off status that still holds tasks.
  const columns = config.statuses.filter((s) => (s.active && s.onBoard) || (!s.active && local.some((t) => t.status === s.key)));
  const drop = async (status: string, e: React.DragEvent) => {
    e.preventDefault();
    const id = dragging;
    setDragging(null);
    if (!id) return;
    const target = (e.target as HTMLElement).closest("[data-task]") as HTMLElement | null;
    const beforeId = target?.dataset.task && target.dataset.task !== id ? target.dataset.task : null;
    setLocal((l) => {
      const moved = l.find((t) => t.id === id);
      if (!moved) return l;
      const rest = l.filter((t) => t.id !== id);
      const at = beforeId ? rest.findIndex((t) => t.id === beforeId) : -1;
      const next = { ...moved, status, status_category: statusOf(config, status)?.category ?? moved.status_category };
      if (at < 0) return [...rest, next];
      return [...rest.slice(0, at), next, ...rest.slice(at)];
    });
    const r = await moveTaskAction(dept, id, status, beforeId);
    if (!r.ok) {
      toast.error(r.error);
      setLocal(tasks);
    } else router.refresh();
  };
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const st = col.key;
        const list = local.filter((t) => t.status === st);
        const over = col.limit != null && list.length > col.limit;
        return (
          <div
            key={st}
            className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-muted/40 p-2", dragging && col.active && "outline-dashed outline-1 outline-primary/30", !col.active && "opacity-70")}
            onDragOver={(e) => col.active && e.preventDefault()}
            onDrop={(e) => col.active && drop(st, e)}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <Tone config={config} status={st} />
              <span className={cn("text-xs tabular", over ? "font-semibold text-destructive" : "text-muted-foreground")} title={col.limit != null ? `Limit ${col.limit}` : undefined}>
                {list.length}
                {col.limit != null && ` / ${col.limit}`}
              </span>
              {!access.readOnly && col.active && (
                <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label={`Add to ${col.label}`} onClick={() => onAdd(st)}>
                  <PlusIcon />
                </Button>
              )}
            </div>
            <div className="flex min-h-24 flex-col gap-2">
              {list.map((t) => (
                <TaskCard key={t.id} t={t} config={config} people={people} onOpen={() => onOpen(t)} draggable={canMove(t)} onDragStart={(e) => (e.dataTransfer.setData("text/plain", t.id), setDragging(t.id))} />
              ))}
              {!list.length && <p className="py-4 text-center text-xs text-muted-foreground">Nothing here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskList({
  dept,
  config,
  tasks,
  filter,
  people,
  projects,
  access,
  viewerId,
  go,
  onOpen,
  onExport,
}: {
  dept: WorkDept;
  config: DeptConfig;
  tasks: Task[];
  filter: TaskFilter;
  people: Person[];
  projects: Project[];
  access: Access;
  viewerId: string;
  go: (p: Record<string, string | null>) => void;
  onOpen: (t: Task) => void;
  onExport: (t: Task[]) => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const ids = [...picked].filter((id) => tasks.some((t) => t.id === id));
  const sortBy = (k: NonNullable<TaskFilter["sort"]>) => go({ sort: k, dir: filter.sort === k && filter.dir === "desc" ? "asc" : "desc" });
  const Head = ({ k, children }: { k: NonNullable<TaskFilter["sort"]>; children: React.ReactNode }) => (
    <th className="p-2 font-medium">
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => sortBy(k)}>
        {children}
        {filter.sort === k ? filter.dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-40" />}
      </button>
    </th>
  );
  const bulk = async (patch: Parameters<typeof bulkTasksAction>[2], label: string) => {
    if (patch.delete && !window.confirm(`Delete ${ids.length} tasks? This cannot be undone.`)) return;
    setBusy(true);
    const r = await bulkTasksAction(dept, ids, patch);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const res = r.data as { ok: boolean; error?: string }[];
    const bad = res.filter((x) => !x.ok);
    if (bad.length) toast.warning(`${res.length - bad.length} ${label}, ${bad.length} not allowed`, { description: bad[0].error });
    else toast.success(`${res.length} ${label}`);
    setPicked(new Set());
    router.refresh();
  };
  const setStatus = async (t: Task, status: string) => {
    const r = await bulkTasksAction(dept, [t.id], { status });
    if (!r.ok) return toast.error(r.error);
    const bad = (r.data as { ok: boolean; error?: string }[]).find((x) => !x.ok);
    if (bad) return toast.error(bad.error);
    router.refresh();
  };
  const cols = config.fields.filter((f) => f.active && f.inList);
  if (!tasks.length) return <EmptyState title={`No ${config.names.tasks.toLowerCase()}`} description={`Change the filters, or add a ${config.names.task.toLowerCase()}.`} />;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 p-2">
                <Checkbox checked={ids.length === tasks.length ? true : ids.length ? "indeterminate" : false} onCheckedChange={(v) => setPicked(v ? new Set(tasks.map((t) => t.id)) : new Set())} aria-label="Select all" />
              </th>
              <Head k="code">Code</Head>
              <Head k="title">{config.names.task}</Head>
              <Head k="status">Status</Head>
              <Head k="priority">Priority</Head>
              <th className="p-2 font-medium">Assignee</th>
              {cols.map((f) => (
                <th key={f.key} className="p-2 font-medium whitespace-nowrap">
                  {f.label}
                </th>
              ))}
              <Head k="due">Due</Head>
              <Head k="updated">Updated</Head>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const mine = access.rights.editAll || t.assignee_id === viewerId || t.reporter_id === viewerId;
              const overdue = t.due_date && t.due_date < today() && !finished(t);
              return (
                <tr key={t.id} className={cn("border-t", picked.has(t.id) && "bg-primary/5")}>
                  <td className="p-2">
                    <Checkbox checked={picked.has(t.id)} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(t.id)) : (s.delete(t.id), new Set(s))))} />
                  </td>
                  <td className="p-2 font-mono text-xs whitespace-nowrap">{t.code}</td>
                  <td className="max-w-[360px] p-2">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(t)}>
                      {t.title}
                    </button>
                    <span className="block truncate text-xs text-muted-foreground">
                      {labelOf(config.types, t.type)}
                      {t.project_name && ` · ${t.project_name}`}
                      {t.milestone_name && ` · ${t.milestone_name}`}
                    </span>
                  </td>
                  <td className="p-2">
                    {mine && !access.readOnly ? (
                      <Select value={t.status} onValueChange={(v) => setStatus(t, v)}>
                        <SelectTrigger size="sm" className="h-7 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {usable(config.statuses, t.status).map((s) => (
                            <SelectItem key={s.key} value={s.key}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Tone config={config} status={t.status} />
                    )}
                  </td>
                  <td className="p-2 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <PriorityDot config={config} priority={t.priority} /> {labelOf(config.priorities, t.priority)}
                    </span>
                  </td>
                  <td className="p-2 text-xs">{t.assignee_name ?? <span className="text-muted-foreground italic">Unassigned</span>}</td>
                  {cols.map((f) => (
                    <td key={f.key} className="max-w-48 truncate p-2 text-xs">
                      {fieldShown(f, t.type) ? formatField(f, t.fields[f.key], people) : ""}
                    </td>
                  ))}
                  <td className={cn("p-2 text-xs whitespace-nowrap", overdue && "font-medium text-destructive")}>{t.due_date ?? "-"}</td>
                  <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">{t.updated_at.slice(0, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ids.length > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-lg">
          <span className="text-sm font-medium tabular">{ids.length} selected</span>
          {!access.readOnly && (
            <>
              <BulkPick label="Status" options={usable(config.statuses).map((s) => ({ value: s.key, label: s.label }))} onPick={(v) => bulk({ status: v }, "updated")} disabled={busy} />
              <BulkPick label="Priority" options={usable(config.priorities).map((p) => ({ value: p.key, label: p.label }))} onPick={(v) => bulk({ priority: v }, "updated")} disabled={busy} />
              {access.rights.assign && (
                <>
                  <BulkPick label="Assignee" options={[{ value: "none", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))]} onPick={(v) => bulk({ assigneeId: v === "none" ? null : v }, "reassigned")} disabled={busy} />
                  <BulkPick
                    label={config.names.project}
                    options={[{ value: "none", label: "None" }, ...projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}` }))]}
                    onPick={(v) => bulk({ projectId: v === "none" ? null : v }, "moved")}
                    disabled={busy}
                  />
                </>
              )}
              <Input
                type="date"
                aria-label="Set due date"
                className="h-7 w-36 text-xs"
                onChange={(e) => e.target.value && bulk({ dueDate: e.target.value }, "updated")}
                disabled={busy}
              />
            </>
          )}
          <Button size="xs" variant="outline" onClick={() => onExport(tasks.filter((t) => picked.has(t.id)))}>
            <DownloadIcon /> Export
          </Button>
          {!access.readOnly && (
            <Button size="xs" variant="outline" className="text-destructive" disabled={busy} onClick={() => bulk({ delete: true }, "deleted")}>
              <Trash2Icon /> Delete
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => setPicked(new Set())}>
            <XIcon /> Clear
          </Button>
        </div>
      )}
    </div>
  );
}

function BulkPick({ label, options, onPick, disabled }: { label: string; options: { value: string; label: string }[]; onPick: (v: string) => void; disabled?: boolean }) {
  return (
    <Select value="" onValueChange={onPick} disabled={disabled}>
      <SelectTrigger size="sm" className="h-7 w-32 text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
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

// ---------------------------------------------------------------------------
// Task dialog
// ---------------------------------------------------------------------------

function TaskDialog({
  dept,
  config: cfg,
  task,
  preset,
  people,
  projects,
  access,
  viewerId,
  onClose,
}: {
  dept: WorkDept;
  config: DeptConfig;
  task: Task | null;
  preset: { status?: string; dueDate?: string };
  people: Person[];
  projects: Project[];
  access: Access;
  viewerId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const canEdit = !access.readOnly && (!task || access.rights.editAll || task.assignee_id === viewerId || task.reporter_id === viewerId);
  const firstStatus = (cfg.statuses.find((s) => s.active && s.category === "open") ?? cfg.statuses.find((s) => s.active))!.key;
  const [f, setF] = React.useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    type: task?.type ?? cfg.types.find((t) => t.active)!.key,
    status: task?.status ?? preset.status ?? firstStatus,
    priority: task?.priority ?? (cfg.priorities.find((p) => p.key === "normal" && p.active) ?? cfg.priorities.find((p) => p.active))!.key,
    projectId: task?.project_id ?? "",
    milestoneId: task?.milestone_id ?? "",
    assigneeId: task?.assignee_id ?? (access.rights.assign ? "" : viewerId),
    estimate: task?.estimate_hours != null ? String(task.estimate_hours) : "",
    spent: task?.spent_hours != null ? String(task.spent_hours) : "",
    progress: task?.progress ?? 0,
    startDate: task?.start_date ?? "",
    dueDate: task?.due_date ?? preset.dueDate ?? "",
    labels: task?.labels.join(", ") ?? "",
  });
  const [values, setValues] = React.useState<Record<string, FieldValue>>(task?.fields ?? {});
  const category = statusOf(cfg, f.status)?.category ?? "open";
  const fields = cfg.fields.filter((x) => fieldShown(x, f.type));
  const [busy, setBusy] = React.useState(false);
  const [comments, setComments] = React.useState<{ id: string; author_name: string; body: string; created_at: string }[] | null>(null);
  const [comment, setComment] = React.useState("");
  const project = projects.find((p) => p.id === f.projectId);
  const loadComments = React.useCallback(async () => {
    if (!task) return;
    const r = await taskCommentsAction(dept, task.id);
    if (r.ok) setComments(r.data as typeof comments);
  }, [dept, task]);
  React.useEffect(() => void loadComments(), [loadComments]);
  const save = async () => {
    setBusy(true);
    const r = await saveTaskAction(dept, {
      id: task?.id,
      title: f.title,
      description: f.description,
      type: f.type,
      status: f.status,
      priority: f.priority,
      projectId: f.projectId || null,
      milestoneId: f.milestoneId || null,
      assigneeId: f.assigneeId || null,
      estimateHours: f.estimate ? Number(f.estimate) : null,
      spentHours: f.spent ? Number(f.spent) : null,
      progress: Number(f.progress),
      startDate: f.startDate || null,
      dueDate: f.dueDate || null,
      labels: f.labels.split(","),
      fields: values,
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(task ? "Saved" : `${cfg.names.task} created`);
    onClose();
    router.refresh();
  };
  const sel = (value: string, onChange: (v: string) => void, options: { value: string; label: string }[], placeholder?: string) => (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={!canEdit}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {placeholder && <SelectItem value="none">{placeholder}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {task && <span className="font-mono text-sm text-muted-foreground">{task.code}</span>}
            {task ? (canEdit ? `Edit ${cfg.names.task.toLowerCase()}` : task.title) : `New ${cfg.names.task.toLowerCase()}`}
          </DialogTitle>
          {task && (
            <DialogDescription>
              Created by {task.reporter_name ?? "someone"} on {task.created_at.slice(0, 10)}
              {task.completed_at && `, done ${task.completed_at.slice(0, 10)}`}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What needs doing" disabled={!canEdit} />
          <Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Details, links, acceptance criteria" disabled={!canEdit} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              {sel(f.type, (v) => setF({ ...f, type: v }), usable(cfg.types, task?.type).map((t) => ({ value: t.key, label: t.label })))}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              {sel(
                f.status,
                (v) => setF({ ...f, status: v, progress: statusOf(cfg, v)?.category === "done" ? 100 : f.progress }),
                usable(cfg.statuses, task?.status).map((s) => ({ value: s.key, label: s.label })),
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              {sel(f.priority, (v) => setF({ ...f, priority: v }), usable(cfg.priorities, task?.priority).map((p) => ({ value: p.key, label: p.label })))}
            </div>
            <div className="space-y-1.5">
              <Label>{cfg.names.project}</Label>
              {sel(f.projectId, (v) => setF({ ...f, projectId: v, milestoneId: "" }), projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}` })), "None")}
            </div>
            {cfg.features.milestones && (
              <div className="space-y-1.5">
                <Label>{cfg.names.milestone}</Label>
                {sel(f.milestoneId, (v) => setF({ ...f, milestoneId: v }), (project?.milestones ?? []).map((m) => ({ value: m.id, label: m.name })), "None")}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              {access.rights.assign
                ? sel(f.assigneeId, (v) => setF({ ...f, assigneeId: v }), people.map((p) => ({ value: p.id, label: `${p.name}${p.position !== "member" ? ` (${POSITION_LABELS[p.position].toLowerCase()})` : ""}` })), "Unassigned")
                : sel(f.assigneeId, (v) => setF({ ...f, assigneeId: v }), [{ value: viewerId, label: "Me" }, ...(task?.assignee_id && task.assignee_id !== viewerId ? [{ value: task.assignee_id, label: task.assignee_name ?? "Someone" }] : [])], "Unassigned")}
            </div>
            {cfg.features.startDate && (
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} disabled={!canEdit} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Due</Label>
              <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} disabled={!canEdit} />
            </div>
            {cfg.features.labels && (
              <div className="space-y-1.5">
                <Label>Labels</Label>
                <Input value={f.labels} onChange={(e) => setF({ ...f, labels: e.target.value })} placeholder={cfg.labels.slice(0, 3).join(", ") || "mobile, api"} disabled={!canEdit} list={`labels-${dept}`} />
                {cfg.labels.length > 0 && (
                  <datalist id={`labels-${dept}`}>
                    {cfg.labels.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                )}
              </div>
            )}
            {cfg.features.estimates && (
              <div className="space-y-1.5">
                <Label>Estimate (hours)</Label>
                <Input type="number" min={0} step="0.5" value={f.estimate} onChange={(e) => setF({ ...f, estimate: e.target.value })} disabled={!canEdit} />
              </div>
            )}
            {cfg.features.timeSpent && (
              <div className="space-y-1.5">
                <Label>Spent (hours)</Label>
                <Input type="number" min={0} step="0.5" value={f.spent} onChange={(e) => setF({ ...f, spent: e.target.value })} disabled={!canEdit} />
              </div>
            )}
            {cfg.features.progress && (
              <div className="space-y-1.5">
                <Label>Progress: {f.progress}%</Label>
                <input type="range" min={0} max={100} step={5} value={f.progress} onChange={(e) => setF({ ...f, progress: Number(e.target.value) })} disabled={!canEdit} className="w-full accent-[var(--primary)]" />
              </div>
            )}
          </div>
          {fields.length > 0 && (
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              {fields.map((fd) => (
                <FieldInput
                  key={fd.key}
                  field={fd}
                  value={values[fd.key] ?? null}
                  people={people}
                  required={fieldRequired(fd, category)}
                  disabled={!canEdit || (fd.leadsOnly && !access.rights.editAll)}
                  onChange={(v) => setValues((x) => ({ ...x, [fd.key]: v }))}
                />
              ))}
            </div>
          )}
        </div>
        {task && (
          <div className="space-y-2 border-t pt-3">
            <Label>Comments</Label>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {comments?.map((c) => (
                <div key={c.id} className="rounded-lg bg-muted/50 p-2 text-sm">
                  <p className="text-xs font-medium">
                    {c.author_name} <span className="font-normal text-muted-foreground">{c.created_at.slice(0, 16).replace("T", " ")}</span>
                  </p>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              {comments && !comments.length && <p className="text-xs text-muted-foreground">No comments yet.</p>}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment" />
                <Button
                  variant="outline"
                  disabled={!comment.trim()}
                  onClick={async () => {
                    const r = await addTaskCommentAction(dept, task.id, comment);
                    if (!r.ok) return toast.error(r.error);
                    setComment("");
                    await loadComments();
                  }}
                >
                  Post
                </Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          {task && canEdit && (access.rights.deleteAll || task.reporter_id === viewerId) ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (!window.confirm(`Delete ${task.code}?`)) return;
                const r = await bulkTasksAction(dept, [task.id], { delete: true });
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
              <Button disabled={busy || !f.title.trim()} onClick={save}>
                {busy && <Loader2Icon className="animate-spin" />} {task ? "Save" : "Create"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// One custom field in the task dialog, drawn by its type.
function FieldInput({
  field: f,
  value,
  people,
  required,
  disabled,
  onChange,
}: {
  field: DeptField;
  value: FieldValue;
  people: Person[];
  required: boolean;
  disabled: boolean;
  onChange: (v: FieldValue) => void;
}) {
  const id = `fld-${f.key}`;
  const wide = f.type === "longtext" || f.type === "multiselect";
  const label = (
    <Label htmlFor={id}>
      {f.label}
      {required && <span className="text-destructive"> *</span>}
    </Label>
  );
  let input: React.ReactNode;
  switch (f.type) {
    case "longtext":
      input = <Textarea id={id} rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
      break;
    case "number":
    case "money":
      input = <Input id={id} type="number" step="any" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} disabled={disabled} />;
      break;
    case "date":
      input = <Input id={id} type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} />;
      break;
    case "url":
      input = <Input id={id} type="url" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="https://" disabled={disabled} />;
      break;
    case "checkbox":
      input = (
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox id={id} checked={value === true} onCheckedChange={(v) => onChange(v === true)} disabled={disabled} /> Yes
        </label>
      );
      break;
    case "rating":
      input = (
        <div className="flex h-9 items-center gap-1" role="radiogroup" aria-label={f.label}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} of 5`}
              disabled={disabled}
              onClick={() => onChange(value === n ? null : n)}
              className={cn("text-lg leading-none", Number(value) >= n ? "text-amber-500" : "text-muted-foreground/40")}
            >
              ★
            </button>
          ))}
        </div>
      );
      break;
    case "select":
    case "person": {
      const options = f.type === "person" ? people.map((p) => ({ value: p.id, label: p.name })) : f.options.map((o) => ({ value: o, label: o }));
      input = (
        <Select value={value ? String(value) : "none"} onValueChange={(v) => onChange(v === "none" ? null : v)} disabled={disabled}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    }
    case "multiselect": {
      const picked = Array.isArray(value) ? value : [];
      input = (
        <div className="flex flex-wrap gap-1.5">
          {f.options.map((o) => {
            const on = picked.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    default:
      input = <Input id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  }
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      {label}
      {input}
      {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
    </div>
  );
}
