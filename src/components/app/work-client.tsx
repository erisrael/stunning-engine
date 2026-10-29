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
  FolderKanbanIcon,
  KanbanIcon,
  ListIcon,
  Loader2Icon,
  MessageSquareIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
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
import { POSITION_LABELS, PRIORITY_LABELS, type Position, type Priority } from "@/lib/domain";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, TASK_PRIORITIES, TASK_STATUS_LABELS, TASK_STATUS_TONE, TASK_STATUSES, WORK_CONFIG, type TaskStatus, type WorkDept } from "@/lib/work";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; position: Position };
type Access = { manage: boolean; readOnly: boolean };

const PRIORITY_DOT: Record<string, string> = { urgent: "bg-red-500", high: "bg-orange-500", normal: "bg-sky-500", low: "bg-muted-foreground/40" };
const BOARD: TaskStatus[] = ["backlog", "todo", "in_progress", "review", "done"];
const today = () => new Date().toISOString().slice(0, 10);

function Tone({ status }: { status: TaskStatus }) {
  const t = TASK_STATUS_TONE[status];
  return (
    <span className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium" style={{ background: `var(--st-${t}-bg)`, color: `var(--st-${t}-fg)` }}>
      {TASK_STATUS_LABELS[status]}
    </span>
  );
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
  viewerId,
  openTaskId,
  showArchived,
}: {
  dept: WorkDept;
  tab: "board" | "list" | "projects" | "calendar";
  filter: TaskFilter;
  tasks: Task[];
  projects: Project[];
  people: Person[];
  access: Access;
  viewerId: string;
  openTaskId: string | null;
  showArchived: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const cfg = WORK_CONFIG[dept];
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const [q, setQ] = React.useState(filter.q ?? "");
  const [editing, setEditing] = React.useState<Task | { status?: TaskStatus; dueDate?: string } | null>(null);
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
  const exportCsv = (list: Task[]) =>
    download(`${dept}-tasks-${today()}.csv`, [
      ["code", "title", "description", "type", "status", "priority", "project_key", "assignee", "due_date", "estimate_hours", "spent_hours", "progress", "labels"],
      ...list.map((t) => [t.code, t.title, t.description, t.type, t.status, t.priority, t.project_key, t.assignee_name, t.due_date, t.estimate_hours, t.spent_hours, t.progress, t.labels.join(";")]),
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
        else toast.success(`${d.created} tasks imported`);
        router.refresh();
      },
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => go({ tab: v === "board" ? null : v })}>
          <TabsList>
            <TabsTrigger value="board">
              <KanbanIcon className="size-3.5" /> Board
            </TabsTrigger>
            <TabsTrigger value="list">
              <ListIcon className="size-3.5" /> List
            </TabsTrigger>
            <TabsTrigger value="projects">
              <FolderKanbanIcon className="size-3.5" /> {cfg.projects} ({projects.length})
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarIcon className="size-3.5" /> Calendar
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex flex-wrap gap-2">
          {writable && (
            <>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} title="Columns: title, description, type, status, priority, assignee_email, project_key, due_date, estimate_hours, labels">
                <UploadIcon /> Import CSV
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => exportCsv(tasks)} disabled={!tasks.length}>
            <DownloadIcon /> Export
          </Button>
          {access.manage && (
            <Button size="sm" variant="outline" onClick={() => setProjectDialog("new")}>
              <PlusIcon /> New {cfg.project.toLowerCase()}
            </Button>
          )}
          {writable && (
            <Button size="sm" onClick={() => setEditing({})}>
              <PlusIcon /> New task
            </Button>
          )}
        </div>
      </div>

      {tab !== "projects" && (
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              go({ q: q.trim() || null });
            }}
          >
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" className="h-8 w-48 pl-7 text-sm" />
          </form>
          <FilterSelect value={filter.project} onChange={(v) => go({ project: v })} placeholder={`Any ${cfg.project.toLowerCase()}`} options={[{ value: "none", label: `No ${cfg.project.toLowerCase()}` }, ...projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}` }))]} />
          <FilterSelect
            value={filter.assignee}
            onChange={(v) => go({ assignee: v })}
            placeholder="Anyone"
            options={[{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...(access.manage || access.readOnly ? people.map((p) => ({ value: p.id, label: p.name })) : [])]}
          />
          <FilterSelect value={filter.type} onChange={(v) => go({ type: v })} placeholder="Any type" options={cfg.taskTypes.map((t) => ({ value: t.key, label: t.label }))} />
          <FilterSelect value={filter.priority} onChange={(v) => go({ priority: v })} placeholder="Any priority" options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p as Priority] }))} />
          <FilterSelect value={filter.due} onChange={(v) => go({ due: v })} placeholder="Any due date" options={[{ value: "overdue", label: "Overdue" }, { value: "week", label: "Due this week" }, { value: "none", label: "No due date" }]} />
          {tab === "list" && (
            <FilterSelect
              value={filter.status?.length === 1 ? filter.status[0] : filter.status?.length ? "open" : null}
              onChange={(v) => go({ status: v === "open" ? "backlog,todo,in_progress,review" : v })}
              placeholder="Any status"
              options={[{ value: "open", label: "Open" }, ...TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))]}
            />
          )}
        </div>
      )}

      {tab === "board" && <Board dept={dept} tasks={tasks} viewerId={viewerId} access={access} onOpen={setEditing} onAdd={(status) => setEditing({ status })} />}
      {tab === "list" && <TaskList dept={dept} tasks={tasks} filter={filter} people={people} projects={projects} access={access} viewerId={viewerId} go={go} onOpen={setEditing} onExport={exportCsv} />}
      {tab === "projects" && <Projects dept={dept} projects={projects} access={access} showArchived={showArchived} go={go} onEdit={setProjectDialog} />}
      {tab === "calendar" && <MonthCalendar tasks={tasks} onOpen={setEditing} onAdd={writable ? (d) => setEditing({ dueDate: d }) : undefined} />}

      {editing && <TaskDialog dept={dept} task={"id" in editing ? editing : null} preset={"id" in editing ? {} : editing} people={people} projects={projects} access={access} viewerId={viewerId} onClose={closeTask} />}
      {projectDialog && <ProjectDialog dept={dept} project={projectDialog === "new" ? null : projectDialog} people={people} onClose={() => setProjectDialog(null)} />}
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

function TaskCard({ t, onOpen, draggable, onDragStart }: { t: Task; onOpen: () => void; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void }) {
  const overdue = t.due_date && t.due_date < today() && t.status !== "done" && t.status !== "cancelled";
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
        <span className={cn("size-2 rounded-full", PRIORITY_DOT[t.priority])} title={PRIORITY_LABELS[t.priority as Priority]} />
        <span className="font-mono">{t.code}</span>
        {t.comments > 0 && (
          <span className="ml-auto flex items-center gap-0.5">
            <MessageSquareIcon className="size-3" /> {t.comments}
          </span>
        )}
      </div>
      <p className="mt-0.5 line-clamp-2 font-medium">{t.title}</p>
      {t.progress > 0 && t.status !== "done" && (
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

function Board({ dept, tasks, viewerId, access, onOpen, onAdd }: { dept: WorkDept; tasks: Task[]; viewerId: string; access: Access; onOpen: (t: Task) => void; onAdd: (s: TaskStatus) => void }) {
  const router = useRouter();
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [local, setLocal] = React.useState(tasks);
  React.useEffect(() => setLocal(tasks), [tasks]);
  const canMove = (t: Task) => !access.readOnly && (access.manage || t.assignee_id === viewerId || t.reporter_id === viewerId);
  const drop = async (status: TaskStatus, e: React.DragEvent) => {
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
      const next = { ...moved, status };
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
      {BOARD.map((st) => {
        const list = local.filter((t) => t.status === st);
        return (
          <div
            key={st}
            className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-muted/40 p-2", dragging && "outline-dashed outline-1 outline-primary/30")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(st, e)}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <Tone status={st} />
              <span className="text-xs text-muted-foreground tabular">{list.length}</span>
              {!access.readOnly && (
                <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label={`Add to ${TASK_STATUS_LABELS[st]}`} onClick={() => onAdd(st)}>
                  <PlusIcon />
                </Button>
              )}
            </div>
            <div className="flex min-h-24 flex-col gap-2">
              {list.map((t) => (
                <TaskCard key={t.id} t={t} onOpen={() => onOpen(t)} draggable={canMove(t)} onDragStart={(e) => (e.dataTransfer.setData("text/plain", t.id), setDragging(t.id))} />
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
  if (!tasks.length) return <EmptyState title="No tasks" description="Change the filters, or add a task." />;
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
              <Head k="title">Task</Head>
              <Head k="status">Status</Head>
              <Head k="priority">Priority</Head>
              <th className="p-2 font-medium">Assignee</th>
              <Head k="due">Due</Head>
              <Head k="updated">Updated</Head>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const mine = access.manage || t.assignee_id === viewerId || t.reporter_id === viewerId;
              const overdue = t.due_date && t.due_date < today() && t.status !== "done" && t.status !== "cancelled";
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
                      {WORK_CONFIG[dept].taskTypes.find((x) => x.key === t.type)?.label}
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
                          {TASK_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {TASK_STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Tone status={t.status} />
                    )}
                  </td>
                  <td className="p-2 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <span className={cn("size-2 rounded-full", PRIORITY_DOT[t.priority])} /> {PRIORITY_LABELS[t.priority as Priority]}
                    </span>
                  </td>
                  <td className="p-2 text-xs">{t.assignee_name ?? <span className="text-muted-foreground italic">Unassigned</span>}</td>
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
              <BulkPick label="Status" options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))} onPick={(v) => bulk({ status: v }, "updated")} disabled={busy} />
              <BulkPick label="Priority" options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p as Priority] }))} onPick={(v) => bulk({ priority: v }, "updated")} disabled={busy} />
              {access.manage && (
                <>
                  <BulkPick label="Assignee" options={[{ value: "none", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))]} onPick={(v) => bulk({ assigneeId: v === "none" ? null : v }, "reassigned")} disabled={busy} />
                  <BulkPick
                    label={WORK_CONFIG[dept].project}
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
                  <button key={t.id} type="button" onClick={() => onOpen(t)} className={cn("block w-full truncate rounded px-1 py-0.5 text-left text-[11px]", t.status === "done" ? "bg-muted text-muted-foreground line-through" : "bg-primary/10 hover:bg-primary/20")}>
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

function Projects({ dept, projects, access, showArchived, go, onEdit }: { dept: WorkDept; projects: Project[]; access: Access; showArchived: boolean; go: (p: Record<string, string | null>) => void; onEdit: (p: Project) => void }) {
  const cfg = WORK_CONFIG[dept];
  const [kpiFor, setKpiFor] = React.useState<Project | null>(null);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={showArchived} onCheckedChange={(v) => go({ archived: v ? "1" : null })} /> Show archived
      </label>
      {!projects.length ? (
        <EmptyState icon={<FolderKanbanIcon className="size-5" />} title={`No ${cfg.projects.toLowerCase()}`} description={access.manage ? `Create one with New ${cfg.project.toLowerCase()}.` : "Heads and leads create them."} />
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
                      {PROJECT_STATUS_LABELS[p.status as keyof typeof PROJECT_STATUS_LABELS] ?? p.status}
                      {p.lead_name && ` · ${p.lead_name}`}
                      {p.due_date && ` · due ${p.due_date}`}
                    </p>
                  </div>
                  {access.manage && (
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
                      {p.done}/{p.total} tasks{p.overdue ? ` · ${p.overdue} overdue` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
                {p.milestones.length > 0 && (
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
                {cfg.metrics.length > 0 && (
                  <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                    {cfg.metrics
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
                            </span>
                          </div>
                        );
                      })}
                    {p.budget != null && <p className="text-muted-foreground">Budget {p.budget.toLocaleString("en-US")}</p>}
                    <Button size="xs" variant="outline" onClick={() => setKpiFor(p)}>
                      KPI entries
                    </Button>
                  </div>
                )}
                <Button size="xs" variant="ghost" onClick={() => go({ tab: "list", project: p.id })}>
                  Open its tasks
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {kpiFor && <KpiDialog dept={dept} project={kpiFor} access={access} onClose={() => setKpiFor(null)} />}
    </div>
  );
}

function ProjectDialog({ dept, project, people, onClose }: { dept: WorkDept; project: Project | null; people: Person[]; onClose: () => void }) {
  const router = useRouter();
  const cfg = WORK_CONFIG[dept];
  const [f, setF] = React.useState({
    key: project?.key ?? "",
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: project?.status ?? "active",
    leadId: project?.lead_id ?? "",
    startDate: project?.start_date ?? "",
    dueDate: project?.due_date ?? "",
    color: project?.color ?? "#7b68ee",
    budget: project?.budget != null ? String(project.budget) : "",
    channel: project?.meta.channel ?? "",
    archived: project?.archived ?? false,
    targets: Object.fromEntries(cfg.metrics.map((m) => [m.key, project?.meta.kpiTargets?.[m.key] ? String(project.meta.kpiTargets[m.key]) : ""])) as Record<string, string>,
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
      meta: { ...(cfg.metrics.length ? { kpiTargets: targets, channel: f.channel || undefined } : {}) },
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
            {project ? "Edit" : "New"} {cfg.project.toLowerCase()}
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
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PROJECT_STATUS_LABELS[s]}
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
          <div className="space-y-1.5">
            <Label>Budget (optional)</Label>
            <Input type="number" min={0} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
          </div>
        </div>
        {cfg.metrics.length > 0 && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Input value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} placeholder="Facebook, Telegram, TikTok, radio" />
            </div>
            <Label>KPI targets</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cfg.metrics.map((m) => (
                <div key={m.key} className="space-y-1">
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                  <Input type="number" min={0} value={f.targets[m.key]} onChange={(e) => setF({ ...f, targets: { ...f.targets, [m.key]: e.target.value } })} className="h-8" />
                </div>
              ))}
            </div>
          </div>
        )}
        {project && (
          <div className="space-y-2 rounded-lg border p-3">
            <Label>Milestones</Label>
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
                  aria-label="Delete milestone"
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
              <Input value={ms.name} onChange={(e) => setMs({ ...ms, name: e.target.value })} placeholder="New milestone" className="h-8" />
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
                if (!window.confirm(`Delete ${project.key}? Its tasks are kept without a ${cfg.project.toLowerCase()}.`)) return;
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

function KpiDialog({ dept, project, access, onClose }: { dept: WorkDept; project: Project; access: Access; onClose: () => void }) {
  const router = useRouter();
  const cfg = WORK_CONFIG[dept];
  const [rows, setRows] = React.useState<{ id: string; metric: string; value: number; recorded_on: string; note: string | null; created_by_name: string | null }[] | null>(null);
  const [f, setF] = React.useState({ metric: cfg.metrics[0]?.key ?? "", value: "", date: today(), note: "" });
  const load = React.useCallback(async () => {
    const r = await listMetricsAction(dept, project.id);
    if (r.ok) setRows(r.data as typeof rows);
  }, [dept, project.id]);
  React.useEffect(() => void load(), [load]);
  const label = (k: string) => cfg.metrics.find((m) => m.key === k)?.label ?? k;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>KPIs: {project.name}</DialogTitle>
          <DialogDescription>Record results as they come in; totals show on the campaign card.</DialogDescription>
        </DialogHeader>
        {!access.readOnly && (
          <div className="grid gap-2 sm:grid-cols-[1fr_100px_140px]">
            <Select value={f.metric} onValueChange={(v) => setF({ ...f, metric: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cfg.metrics.map((m) => (
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
                    {access.manage && (
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
  task,
  preset,
  people,
  projects,
  access,
  viewerId,
  onClose,
}: {
  dept: WorkDept;
  task: Task | null;
  preset: { status?: TaskStatus; dueDate?: string };
  people: Person[];
  projects: Project[];
  access: Access;
  viewerId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const cfg = WORK_CONFIG[dept];
  const canEdit = !access.readOnly && (!task || access.manage || task.assignee_id === viewerId || task.reporter_id === viewerId);
  const [f, setF] = React.useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    type: task?.type ?? cfg.taskTypes[0].key,
    status: (task?.status ?? preset.status ?? "todo") as string,
    priority: task?.priority ?? "normal",
    projectId: task?.project_id ?? "",
    milestoneId: task?.milestone_id ?? "",
    assigneeId: task?.assignee_id ?? (access.manage ? "" : viewerId),
    estimate: task?.estimate_hours != null ? String(task.estimate_hours) : "",
    spent: task?.spent_hours != null ? String(task.spent_hours) : "",
    progress: task?.progress ?? 0,
    startDate: task?.start_date ?? "",
    dueDate: task?.due_date ?? preset.dueDate ?? "",
    labels: task?.labels.join(", ") ?? "",
  });
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
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(task ? "Saved" : "Task created");
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
            {task ? (canEdit ? "Edit task" : task.title) : "New task"}
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
              {sel(f.type, (v) => setF({ ...f, type: v }), cfg.taskTypes.map((t) => ({ value: t.key, label: t.label })))}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              {sel(f.status, (v) => setF({ ...f, status: v, progress: v === "done" ? 100 : f.progress }), TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] })))}
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              {sel(f.priority, (v) => setF({ ...f, priority: v }), TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p as Priority] })))}
            </div>
            <div className="space-y-1.5">
              <Label>{cfg.project}</Label>
              {sel(f.projectId, (v) => setF({ ...f, projectId: v, milestoneId: "" }), projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}` })), "None")}
            </div>
            <div className="space-y-1.5">
              <Label>Milestone</Label>
              {sel(f.milestoneId, (v) => setF({ ...f, milestoneId: v }), (project?.milestones ?? []).map((m) => ({ value: m.id, label: m.name })), "None")}
            </div>
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              {access.manage
                ? sel(f.assigneeId, (v) => setF({ ...f, assigneeId: v }), people.map((p) => ({ value: p.id, label: `${p.name}${p.position !== "member" ? ` (${POSITION_LABELS[p.position].toLowerCase()})` : ""}` })), "Unassigned")
                : sel(f.assigneeId, (v) => setF({ ...f, assigneeId: v }), [{ value: viewerId, label: "Me" }, ...(task?.assignee_id && task.assignee_id !== viewerId ? [{ value: task.assignee_id, label: task.assignee_name ?? "Someone" }] : [])], "Unassigned")}
            </div>
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label>Due</Label>
              <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label>Labels</Label>
              <Input value={f.labels} onChange={(e) => setF({ ...f, labels: e.target.value })} placeholder="mobile, api" disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label>Estimate (hours)</Label>
              <Input type="number" min={0} step="0.5" value={f.estimate} onChange={(e) => setF({ ...f, estimate: e.target.value })} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label>Spent (hours)</Label>
              <Input type="number" min={0} step="0.5" value={f.spent} onChange={(e) => setF({ ...f, spent: e.target.value })} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label>Progress: {f.progress}%</Label>
              <input type="range" min={0} max={100} step={5} value={f.progress} onChange={(e) => setF({ ...f, progress: Number(e.target.value) })} disabled={!canEdit} className="w-full accent-[var(--primary)]" />
            </div>
          </div>
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
          {task && canEdit && (access.manage || task.reporter_id === viewerId) ? (
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
