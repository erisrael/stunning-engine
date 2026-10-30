"use client";

// Dev and Marketing views, as configurable as the production workflow's: List (columns, grouping, totals), Board
// (swimlanes, card contents, collapsible columns, quick add), Sheet (type into cells, paste rows, undo) and the
// Overview tree (project, milestone, task with rollups). View settings live in the URL, so saved views keep them.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  BookmarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ClipboardPasteIcon,
  Columns3Icon,
  DownloadIcon,
  LayersIcon,
  Loader2Icon,
  MessageSquareIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Meter, UserAvatar } from "@/components/app/primitives";
import { bulkTasksAction, deleteDeptViewAction, importTasksAction, moveTaskAction, saveDeptViewAction, saveTaskAction } from "@/app/actions/departments";
import type { DeptView, Project, Task, TaskFilter, TaskInput } from "@/server/work";
import type { WorkDept } from "@/lib/work";
import { fieldEmpty, fieldShown, formatField, labelOf, statusOf, type DeptConfig, type DeptField, type FieldValue } from "@/lib/dept-config";
import { cn } from "@/lib/utils";
import { BulkPick, PriorityDot, Tone, canEditTask, finished, taskInput, today, usable, type Access, type Person } from "./work-shared";

type Go = (patch: Record<string, string | null>) => void;
const fmt = (v: number) => v.toLocaleString("en-US");

// ---------------------------------------------------------------------------
// Columns (List and Sheet)
// ---------------------------------------------------------------------------

type Edit = "text" | "longtext" | "number" | "date" | "select" | "person" | "project" | "checkbox" | "multi";
export type Col = {
  key: string;
  label: string;
  sort?: NonNullable<TaskFilter["sort"]>;
  text: (t: Task) => string;
  cell?: (t: Task) => React.ReactNode;
  num?: (t: Task) => number | null; // totals in group headers
  edit?: Edit;
  options?: { value: string; label: string }[];
  field?: DeptField;
  // Builds the change to save from an edited value.
  patch?: (t: Task, v: string | boolean) => Partial<TaskInput>;
};

export function columnsFor(cfg: DeptConfig, people: Person[], projects: Project[]): Col[] {
  const f = cfg.features;
  const opt = (items: { key: string; label: string; active: boolean }[]) => usable(items).map((i) => ({ value: i.key, label: i.label }));
  const cols: Col[] = [
    { key: "code", label: "Code", sort: "code", text: (t) => t.code, cell: (t) => <span className="font-mono text-xs whitespace-nowrap">{t.code}</span> },
    { key: "title", label: cfg.names.task, sort: "title", text: (t) => t.title, edit: "text", patch: (_, v) => ({ title: String(v) }) },
    { key: "type", label: "Type", text: (t) => labelOf(cfg.types, t.type), edit: "select", options: opt(cfg.types), patch: (_, v) => ({ type: String(v) }) },
    { key: "status", label: "Status", sort: "status", text: (t) => labelOf(cfg.statuses, t.status), cell: (t) => <Tone config={cfg} status={t.status} />, edit: "select", options: opt(cfg.statuses), patch: (_, v) => ({ status: String(v) }) },
    {
      key: "priority",
      label: "Priority",
      sort: "priority",
      text: (t) => labelOf(cfg.priorities, t.priority),
      cell: (t) => (
        <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
          <PriorityDot config={cfg} priority={t.priority} /> {labelOf(cfg.priorities, t.priority)}
        </span>
      ),
      edit: "select",
      options: opt(cfg.priorities),
      patch: (_, v) => ({ priority: String(v) }),
    },
    { key: "assignee", label: "Assignee", text: (t) => t.assignee_name ?? "", cell: (t) => t.assignee_name ?? <span className="text-muted-foreground italic">Unassigned</span>, edit: "person", patch: (_, v) => ({ assigneeId: v ? String(v) : null }) },
    { key: "project", label: cfg.names.project, text: (t) => (t.project_key ? `${t.project_key} ${t.project_name}` : ""), edit: "project", options: projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}` })), patch: (_, v) => ({ projectId: v ? String(v) : null, milestoneId: null }) },
    ...(f.milestones ? [{ key: "milestone", label: cfg.names.milestone, text: (t: Task) => t.milestone_name ?? "" }] : []),
    { key: "due", label: "Due", sort: "due", text: (t) => t.due_date ?? "", cell: (t) => <span className={cn("whitespace-nowrap", t.due_date && t.due_date < today() && !finished(t) && "font-medium text-destructive")}>{t.due_date ?? "-"}</span>, edit: "date", patch: (_, v) => ({ dueDate: v ? String(v) : null }) },
    ...(f.startDate ? [{ key: "start", label: "Start", text: (t: Task) => t.start_date ?? "", edit: "date" as Edit, patch: (_: Task, v: string | boolean) => ({ startDate: v ? String(v) : null }) }] : []),
    ...(f.estimates ? [{ key: "estimate", label: "Estimate (h)", text: (t: Task) => (t.estimate_hours == null ? "" : String(t.estimate_hours)), num: (t: Task) => t.estimate_hours, edit: "number" as Edit, patch: (_: Task, v: string | boolean) => ({ estimateHours: v === "" ? null : Number(v) }) }] : []),
    ...(f.timeSpent ? [{ key: "spent", label: "Spent (h)", text: (t: Task) => (t.spent_hours == null ? "" : String(t.spent_hours)), num: (t: Task) => t.spent_hours, edit: "number" as Edit, patch: (_: Task, v: string | boolean) => ({ spentHours: v === "" ? null : Number(v) }) }] : []),
    ...(f.progress ? [{ key: "progress", label: "Progress", text: (t: Task) => `${t.progress}%`, edit: "number" as Edit, patch: (_: Task, v: string | boolean) => ({ progress: Number(v || 0) }) }] : []),
    ...(f.labels ? [{ key: "labels", label: "Labels", text: (t: Task) => t.labels.join(", "), edit: "text" as Edit, patch: (_: Task, v: string | boolean) => ({ labels: String(v).split(",") }) }] : []),
    { key: "reporter", label: "Created by", text: (t) => t.reporter_name ?? "" },
    { key: "created", label: "Created", text: (t) => t.created_at.slice(0, 10) },
    { key: "updated", label: "Updated", sort: "updated", text: (t) => t.updated_at.slice(0, 10), cell: (t) => <span className="whitespace-nowrap text-muted-foreground">{t.updated_at.slice(0, 10)}</span> },
  ];
  for (const fd of cfg.fields.filter((x) => x.active)) {
    const value = (t: Task) => t.fields[fd.key];
    const edit: Edit =
      fd.type === "number" || fd.type === "money" || fd.type === "rating"
        ? "number"
        : fd.type === "date"
          ? "date"
          : fd.type === "select"
            ? "select"
            : fd.type === "person"
              ? "person"
              : fd.type === "checkbox"
                ? "checkbox"
                : fd.type === "multiselect"
                  ? "multi"
                  : fd.type === "longtext"
                    ? "longtext"
                    : "text";
    cols.push({
      key: `field:${fd.key}`,
      label: fd.label,
      field: fd,
      text: (t) => (fieldShown(fd, t.type) ? formatField(fd, value(t), people) : ""),
      num: fd.type === "money" || fd.type === "number" ? (t) => (fieldShown(fd, t.type) && !fieldEmpty(value(t)) ? Number(value(t)) : null) : undefined,
      edit,
      options: fd.type === "select" ? fd.options.map((o) => ({ value: o, label: o })) : undefined,
      patch: (t, v) => {
        let next: FieldValue = v === "" ? null : (v as FieldValue);
        if (edit === "number" && v !== "") next = Number(v);
        if (edit === "multi") next = String(v).split(/[;,]/).map((x) => x.trim()).filter(Boolean);
        return { fields: { ...t.fields, [fd.key]: next } };
      },
    });
  }
  return cols;
}

export function defaultColumns(cfg: DeptConfig) {
  return ["code", "title", "status", "priority", "assignee", ...cfg.fields.filter((f) => f.active && f.inList).map((f) => `field:${f.key}`), "due", "updated"];
}

function pickColumns(all: Col[], param: string | null, defaults: string[]) {
  const keys = (param ? param.split(",") : defaults).filter((k) => all.some((c) => c.key === k));
  if (!keys.includes("title")) keys.splice(Math.min(1, keys.length), 0, "title");
  return keys.map((k) => all.find((c) => c.key === k)!);
}

// ---------------------------------------------------------------------------
// Grouping (List) and swimlanes (Board)
// ---------------------------------------------------------------------------

type Grouper = { key: string; label: string; of: (t: Task) => { key: string; label: string; order: number } };

function groupers(cfg: DeptConfig, people: Person[]): Grouper[] {
  const by = (items: { key: string; label: string }[], prop: (t: Task) => string) => (t: Task) => {
    const k = prop(t);
    const i = items.findIndex((x) => x.key === k);
    return { key: k, label: items[i]?.label ?? k, order: i < 0 ? 999 : i };
  };
  const list: Grouper[] = [
    { key: "status", label: "Status", of: by(cfg.statuses, (t) => t.status) },
    { key: "assignee", label: "Assignee", of: (t) => ({ key: t.assignee_id ?? "", label: t.assignee_name ?? "Unassigned", order: t.assignee_id ? 0 : 1 }) },
    { key: "project", label: cfg.names.project, of: (t) => ({ key: t.project_id ?? "", label: t.project_key ? `${t.project_key} ${t.project_name}` : `No ${cfg.names.project.toLowerCase()}`, order: t.project_id ? 0 : 1 }) },
    { key: "type", label: "Type", of: by(cfg.types, (t) => t.type) },
    { key: "priority", label: "Priority", of: by(cfg.priorities, (t) => t.priority) },
  ];
  if (cfg.features.milestones) list.push({ key: "milestone", label: cfg.names.milestone, of: (t) => ({ key: t.milestone_id ?? "", label: t.milestone_name ?? `No ${cfg.names.milestone.toLowerCase()}`, order: t.milestone_id ? 0 : 1 }) });
  for (const f of cfg.fields.filter((x) => x.active && (x.type === "select" || x.type === "person" || x.type === "checkbox")))
    list.push({
      key: `field:${f.key}`,
      label: f.label,
      of: (t) => {
        const v = t.fields[f.key];
        const label = fieldEmpty(v) ? `No ${f.label.toLowerCase()}` : formatField(f, v, people) || String(v);
        const order = f.type === "select" ? (fieldEmpty(v) ? 999 : f.options.indexOf(String(v))) : fieldEmpty(v) ? 1 : 0;
        return { key: fieldEmpty(v) ? "" : String(v), label, order };
      },
    });
  return list;
}

function groupTasks(tasks: Task[], g: Grouper) {
  const map = new Map<string, { key: string; label: string; order: number; tasks: Task[] }>();
  for (const t of tasks) {
    const k = g.of(t);
    if (!map.has(k.key)) map.set(k.key, { ...k, tasks: [] });
    map.get(k.key)!.tasks.push(t);
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// View options: saved views, columns, grouping, swimlanes, card contents
// ---------------------------------------------------------------------------

export const CARD_PARTS = [
  { key: "type", label: "Type" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "due", label: "Due date" },
  { key: "labels", label: "Labels" },
  { key: "progress", label: "Progress" },
  { key: "comments", label: "Comments" },
  { key: "project", label: "Project" },
  { key: "estimate", label: "Estimate" },
];

export function defaultCard(cfg: DeptConfig) {
  return ["type", "priority", "assignee", "due", "labels", "progress", "comments", ...cfg.fields.filter((f) => f.active && f.onCard).map((f) => `field:${f.key}`)];
}

export function ViewOptions({ dept, tab, config: cfg, access, views, people, projects }: { dept: WorkDept; tab: string; config: DeptConfig; access: Access; views: DeptView[]; people: Person[]; projects: Project[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go: Go = (patch) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const cols = React.useMemo(() => columnsFor(cfg, people, projects), [cfg, people, projects]);
  // Ticks show at once; the page follows when the URL updates.
  const fromUrl = pickColumns(cols, params.get("cols"), defaultColumns(cfg)).map((c) => c.key).join(",");
  const cardUrl = params.get("card") ?? defaultCard(cfg).join(",");
  const [shownRaw, setShown] = React.useState(fromUrl);
  const [cardRaw, setCard] = React.useState(cardUrl);
  React.useEffect(() => setShown(fromUrl), [fromUrl]);
  React.useEffect(() => setCard(cardUrl), [cardUrl]);
  const shown = shownRaw.split(",").filter(Boolean);
  const card = cardRaw.split(",").filter(Boolean);
  const setCols = (keys: string[]) => (setShown(keys.join(",")), go({ cols: keys.join(",") }));
  const setCardParts = (keys: string[]) => (setCard(keys.join(",")), go({ card: keys.join(",") }));
  const groups = groupers(cfg, people);
  const cardParts = [...CARD_PARTS.map((p) => (p.key === "project" ? { ...p, label: cfg.names.project } : p)), ...cfg.fields.filter((f) => f.active).map((f) => ({ key: `field:${f.key}`, label: f.label }))];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SavedViews dept={dept} views={views} canShare={!access.readOnly && (access.rights.assign || access.rights.configure)} canDeleteShared={access.rights.configure} />
      {(tab === "list" || tab === "sheet") && (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-8">
              <Columns3Icon /> Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <p className="px-1 pb-1 text-xs text-muted-foreground">Tick to show; arrows to reorder.</p>
            <ul className="max-h-80 space-y-0.5 overflow-y-auto">
              {[...shown.map((k) => cols.find((c) => c.key === k)!), ...cols.filter((c) => !shown.includes(c.key))].map((c) => {
                const i = shown.indexOf(c.key);
                return (
                  <li key={c.key} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                    <Checkbox
                      id={`col-${c.key}`}
                      checked={i >= 0}
                      disabled={c.key === "title"}
                      onCheckedChange={(v) => setCols(v ? [...shown, c.key] : shown.filter((k) => k !== c.key))}
                    />
                    <label htmlFor={`col-${c.key}`} className="flex-1 truncate">
                      {c.label}
                    </label>
                    {i >= 0 && (
                      <>
                        <button type="button" aria-label={`Move ${c.label} left`} disabled={i === 0} className="text-muted-foreground disabled:opacity-30" onClick={() => setCols(shown.map((k, j) => (j === i - 1 ? c.key : j === i ? shown[i - 1]! : k)))}>
                          <ArrowUpIcon className="size-3.5" />
                        </button>
                        <button type="button" aria-label={`Move ${c.label} right`} disabled={i === shown.length - 1} className="text-muted-foreground disabled:opacity-30" onClick={() => setCols(shown.map((k, j) => (j === i + 1 ? c.key : j === i ? shown[i + 1]! : k)))}>
                          <ArrowDownIcon className="size-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button size="xs" variant="ghost" className="mt-1" onClick={() => go({ cols: null })}>
              Reset columns
            </Button>
          </PopoverContent>
        </Popover>
      )}
      {tab === "list" && (
        <Select value={params.get("group") ?? "none"} onValueChange={(v) => go({ group: v === "none" ? null : v })}>
          <SelectTrigger size="sm" className="h-8 w-44 text-xs" aria-label="Group by">
            <LayersIcon className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No grouping</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.key} value={g.key}>
                Group by {g.label.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {tab === "board" && (
        <>
          <Select value={params.get("lanes") ?? "none"} onValueChange={(v) => go({ lanes: v === "none" ? null : v })}>
            <SelectTrigger size="sm" className="h-8 w-44 text-xs" aria-label="Swimlanes">
              <LayersIcon className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No swimlanes</SelectItem>
              {groups
                .filter((g) => g.key !== "status")
                .map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    Lanes by {g.label.toLowerCase()}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8">
                <Columns3Icon /> Cards show
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-2">
              <ul className="max-h-80 space-y-0.5 overflow-y-auto">
                {cardParts.map((p) => (
                  <li key={p.key} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                    <Checkbox id={`card-${p.key}`} checked={card.includes(p.key)} onCheckedChange={(v) => setCardParts(v ? [...card, p.key] : card.filter((k) => k !== p.key))} />
                    <label htmlFor={`card-${p.key}`} className="flex-1 truncate">
                      {p.label}
                    </label>
                  </li>
                ))}
              </ul>
              <Button size="xs" variant="ghost" className="mt-1" onClick={() => go({ card: null })}>
                Reset
              </Button>
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
}

function SavedViews({ dept, views, canShare, canDeleteShared }: { dept: WorkDept; views: DeptView[]; canShare: boolean; canDeleteShared: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [list, setList] = React.useState(views);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  React.useEffect(() => setList(views), [views]);
  const query = (() => {
    const p = new URLSearchParams(params.toString());
    p.delete("task");
    return p.toString();
  })();
  const active = list.find((v) => v.query === query);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8">
            <BookmarkIcon /> {active ? active.name : "Views"} <ChevronDownIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {list.length > 0 && <DropdownMenuLabel>Saved views</DropdownMenuLabel>}
          {list.map((v) => (
            <DropdownMenuItem key={v.id} onClick={() => router.push(`/${dept}?${v.query}`)} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{v.name}</span>
              {v.shared && <span className="text-[10px] text-muted-foreground">shared</span>}
              {(v.mine || canDeleteShared) && (
                <button
                  type="button"
                  aria-label={`Delete view ${v.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (!window.confirm(`Delete the view "${v.name}"?`)) return;
                    const r = await deleteDeptViewAction(dept, v.id);
                    if (!r.ok) return toast.error(r.error);
                    setList((l) => l.filter((x) => x.id !== v.id));
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          {list.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={() => (setName(active?.name ?? ""), setShared(active?.shared ?? false), setSaving(true))}>
            <PlusIcon /> Save this view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>Keeps the tab, filters, columns, grouping and swimlanes. Saving under an existing name replaces it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="view-name">Name</Label>
            <Input id="view-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="My open bugs" />
          </div>
          {canShare && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={shared} onCheckedChange={setShared} /> Share with the department
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaving(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim()}
              onClick={async () => {
                const r = await saveDeptViewAction(dept, { name, query, shared });
                if (!r.ok) return toast.error(r.error);
                toast.success("View saved");
                setSaving(false);
                setList((l) => [...l.filter((x) => !(x.mine && x.name.toLowerCase() === name.trim().toLowerCase())), { id: r.data as string, name: name.trim(), query, shared, mine: true }]);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

function TaskCard({ t, config, people, parts, onOpen, draggable, onDragStart }: { t: Task; config: DeptConfig; people: Person[]; parts: string[]; onOpen: () => void; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void }) {
  const has = (k: string) => parts.includes(k);
  const overdue = t.due_date && t.due_date < today() && !finished(t);
  const type = config.types.find((x) => x.key === t.type);
  const fields = config.fields.filter((f) => has(`field:${f.key}`) && fieldShown(f, t.type) && !fieldEmpty(t.fields[f.key]));
  return (
    <button type="button" draggable={draggable} onDragStart={onDragStart} onClick={onOpen} data-task={t.id} className="block w-full rounded-lg border bg-card p-2 text-left text-sm shadow-xs hover:border-primary/40">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {has("priority") && <PriorityDot config={config} priority={t.priority} />}
        <span className="font-mono">{t.code}</span>
        {has("type") && type && (
          <span className="truncate rounded px-1 text-[10px]" style={{ background: `${type.color}22`, color: type.color }}>
            {type.label}
          </span>
        )}
        {has("comments") && t.comments > 0 && (
          <span className="ml-auto flex items-center gap-0.5">
            <MessageSquareIcon className="size-3" /> {t.comments}
          </span>
        )}
      </div>
      <p className="mt-0.5 line-clamp-2 font-medium">{t.title}</p>
      {has("project") && t.project_key && <p className="truncate text-[11px] text-muted-foreground">{`${t.project_key} ${t.project_name}`}</p>}
      {fields.length > 0 && (
        <dl className="mt-1 space-y-0.5 text-[11px]">
          {fields.map((f) => (
            <div key={f.key} className="flex gap-1">
              <dt className="text-muted-foreground">{f.label}:</dt>
              <dd className="truncate">{formatField(f, t.fields[f.key], people)}</dd>
            </div>
          ))}
        </dl>
      )}
      {has("progress") && config.features.progress && t.progress > 0 && !finished(t) && <Meter value={t.progress} max={100} className="mt-1.5" />}
      <div className="mt-1.5 flex items-center gap-1.5">
        {has("assignee") && (t.assignee_name ? <UserAvatar name={t.assignee_name} size="xs" /> : <span className="text-[11px] text-muted-foreground italic">Unassigned</span>)}
        {has("labels") &&
          t.labels.slice(0, 2).map((l) => (
            <span key={l} className="rounded bg-muted px-1 text-[10px]">
              {l}
            </span>
          ))}
        {has("estimate") && t.estimate_hours != null && <span className="text-[11px] text-muted-foreground">{t.estimate_hours}h</span>}
        {has("due") && t.due_date && <span className={cn("ml-auto text-[11px]", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{t.due_date.slice(5)}</span>}
      </div>
    </button>
  );
}

// The change that puts a task in a lane (dragging between lanes, or adding in one).
function laneChange(lanes: string, value: string): Partial<TaskInput> | null {
  if (lanes === "assignee") return { assigneeId: value || null };
  if (lanes === "project") return { projectId: value || null, milestoneId: null };
  if (lanes === "milestone") return { milestoneId: value || null };
  if (lanes === "type") return { type: value };
  if (lanes === "priority") return { priority: value };
  return null;
}

export function Board({
  dept,
  config,
  people,
  tasks,
  viewerId,
  access,
  onOpen,
  onDetails,
}: {
  dept: WorkDept;
  config: DeptConfig;
  people: Person[];
  tasks: Task[];
  viewerId: string;
  access: Access;
  onOpen: (t: Task) => void;
  onDetails: (status: string) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const lanesKey = params.get("lanes") ?? "none";
  const parts = params.get("card")?.split(",") ?? defaultCard(config);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [local, setLocal] = React.useState(tasks);
  const [adding, setAdding] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<string[]>([]);
  React.useEffect(() => setLocal(tasks), [tasks]);
  React.useEffect(() => {
    try {
      setCollapsed(JSON.parse(localStorage.getItem(`board-collapsed:${dept}`) ?? "[]"));
    } catch {
      /* storage unavailable */
    }
  }, [dept]);
  const toggle = (k: string) => {
    const next = collapsed.includes(k) ? collapsed.filter((x) => x !== k) : [...collapsed, k];
    setCollapsed(next);
    try {
      localStorage.setItem(`board-collapsed:${dept}`, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };
  const grouper = groupers(config, people).find((g) => g.key === lanesKey) ?? null;
  const lanes = grouper ? groupTasks(local, grouper) : [{ key: "", label: "", order: 0, tasks: local }];
  // Lane by a custom field cannot be changed by dragging (the value may need checking); others can.
  const laneEditable = grouper && !grouper.key.startsWith("field:");
  const canMove = (t: Task) => canEditTask(access, t, viewerId);
  const columns = config.statuses.filter((s) => (s.active && s.onBoard) || (!s.active && local.some((t) => t.status === s.key)));

  const drop = async (status: string, laneValue: string, e: React.DragEvent) => {
    e.preventDefault();
    const id = dragging;
    setDragging(null);
    if (!id) return;
    const moved = local.find((t) => t.id === id);
    if (!moved) return;
    const fromLane = grouper ? grouper.of(moved).key : "";
    const lanePatch = laneEditable && laneValue !== fromLane ? laneChange(grouper!.key, laneValue) : null;
    const target = (e.target as HTMLElement).closest("[data-task]") as HTMLElement | null;
    const beforeId = target?.dataset.task && target.dataset.task !== id ? target.dataset.task : null;
    setLocal((l) => {
      const rest = l.filter((t) => t.id !== id);
      const next = { ...moved, status, status_category: statusOf(config, status)?.category ?? moved.status_category };
      const at = beforeId ? rest.findIndex((t) => t.id === beforeId) : -1;
      return at < 0 ? [...rest, next] : [...rest.slice(0, at), next, ...rest.slice(at)];
    });
    const r = lanePatch ? await saveTaskAction(dept, taskInput(moved, { ...lanePatch, status })) : await moveTaskAction(dept, id, status, beforeId);
    if (!r.ok) {
      toast.error(r.error);
      setLocal(tasks);
    } else router.refresh();
  };

  const quickAdd = async (title: string, status: string, laneValue: string) => {
    const lanePatch = laneEditable ? laneChange(grouper!.key, laneValue) : null;
    const r = await saveTaskAction(dept, { title, status, ...(lanePatch ?? {}) });
    if (!r.ok) return toast.error(r.error), false;
    router.refresh();
    return true;
  };

  return (
    <div className="space-y-4">
      {lanes.map((lane) => (
        <section key={lane.key || "none"} aria-label={lane.label || "Board"} className="space-y-2">
          {grouper && (
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {lane.label} <span className="text-xs font-normal text-muted-foreground tabular">{lane.tasks.length}</span>
            </h3>
          )}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {columns.map((col) => {
              const list = lane.tasks.filter((t) => t.status === col.key);
              const all = local.filter((t) => t.status === col.key).length;
              const over = col.limit != null && all > col.limit;
              const shut = collapsed.includes(col.key);
              const addKey = `${lane.key}|${col.key}`;
              if (shut)
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => toggle(col.key)}
                    onDragOver={(e) => col.active && e.preventDefault()}
                    onDrop={(e) => col.active && drop(col.key, lane.key, e)}
                    className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-xl bg-muted/40 py-2 text-xs"
                    title={`Show ${col.label}`}
                    aria-label={`Show ${col.label} (${list.length})`}
                  >
                    <PanelLeftOpenIcon className="size-3.5 text-muted-foreground" />
                    <span className="tabular">{list.length}</span>
                    <span className="[writing-mode:vertical-rl]" style={{ color: col.color }}>
                      {col.label}
                    </span>
                  </button>
                );
              return (
                <div
                  key={col.key}
                  className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-muted/40 p-2", dragging && col.active && "outline-dashed outline-1 outline-primary/30", !col.active && "opacity-70")}
                  onDragOver={(e) => col.active && e.preventDefault()}
                  onDrop={(e) => col.active && drop(col.key, lane.key, e)}
                >
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <Tone config={config} status={col.key} />
                    <span className={cn("text-xs tabular", over ? "font-semibold text-destructive" : "text-muted-foreground")} title={col.limit != null ? `Limit ${col.limit}` : undefined}>
                      {list.length}
                      {col.limit != null && ` / ${col.limit}`}
                    </span>
                    <span className="ml-auto flex items-center">
                      {!access.readOnly && col.active && (
                        <Button size="icon-xs" variant="ghost" aria-label={`Add to ${col.label}`} onClick={() => setAdding(addKey)}>
                          <PlusIcon />
                        </Button>
                      )}
                      <Button size="icon-xs" variant="ghost" aria-label={`Collapse ${col.label}`} onClick={() => toggle(col.key)}>
                        <PanelLeftCloseIcon />
                      </Button>
                    </span>
                  </div>
                  <div className="flex min-h-16 flex-col gap-2">
                    {adding === addKey && (
                      <QuickAdd
                        placeholder={`New ${config.names.task.toLowerCase()} title`}
                        onCancel={() => setAdding(null)}
                        onDetails={() => (setAdding(null), onDetails(col.key))}
                        onAdd={(title) => quickAdd(title, col.key, lane.key)}
                      />
                    )}
                    {list.map((t) => (
                      <TaskCard
                        key={t.id}
                        t={t}
                        config={config}
                        people={people}
                        parts={parts}
                        onOpen={() => onOpen(t)}
                        draggable={canMove(t)}
                        onDragStart={(e) => (e.dataTransfer.setData("text/plain", t.id), setDragging(t.id))}
                      />
                    ))}
                    {!list.length && adding !== addKey && <p className="py-3 text-center text-xs text-muted-foreground">Nothing here</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// Type a title and press Enter; stays open for the next one.
function QuickAdd({ placeholder, onAdd, onCancel, onDetails }: { placeholder: string; onAdd: (title: string) => Promise<boolean>; onCancel: () => void; onDetails?: () => void }) {
  const [v, setV] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="space-y-1 rounded-lg border bg-card p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.trim()) return;
        setBusy(true);
        const ok = await onAdd(v.trim());
        setBusy(false);
        if (ok) setV("");
      }}
    >
      <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-8 text-sm" onKeyDown={(e) => e.key === "Escape" && onCancel()} disabled={busy} />
      <div className="flex items-center gap-1">
        <Button size="xs" type="submit" disabled={busy || !v.trim()}>
          {busy && <Loader2Icon className="animate-spin" />} Add
        </Button>
        {onDetails && (
          <Button size="xs" variant="ghost" type="button" onClick={onDetails}>
            More details
          </Button>
        )}
        <Button size="icon-xs" variant="ghost" type="button" className="ml-auto" aria-label="Close" onClick={onCancel}>
          <XIcon />
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function TaskList({
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
  go: Go;
  onOpen: (t: Task) => void;
  onExport: (t: Task[]) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const all = React.useMemo(() => columnsFor(config, people, projects), [config, people, projects]);
  const cols = pickColumns(all, params.get("cols"), defaultColumns(config));
  const grouper = groupers(config, people).find((g) => g.key === params.get("group")) ?? null;
  const groups = grouper ? groupTasks(tasks, grouper) : [{ key: "", label: "", order: 0, tasks }];
  const [closed, setClosed] = React.useState<string[]>([]);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const ids = [...picked].filter((id) => tasks.some((t) => t.id === id));
  const sortBy = (k: NonNullable<TaskFilter["sort"]>) => go({ sort: k, dir: filter.sort === k && filter.dir === "desc" ? "asc" : "desc" });
  const bulk = async (patch: Parameters<typeof bulkTasksAction>[2], label: string) => {
    if (patch.delete && !window.confirm(`Delete ${ids.length} ${config.names.tasks.toLowerCase()}? This cannot be undone.`)) return;
    setBusy(true);
    const r = await bulkTasksAction(dept, ids, patch);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const res = r.data as { ok: boolean; error?: string }[];
    const bad = res.filter((x) => !x.ok);
    if (bad.length) toast.warning(`${res.length - bad.length} ${label}, ${bad.length} not allowed`, { description: bad[0]!.error });
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
  const totals = (list: Task[]) =>
    cols
      .filter((c) => c.num)
      .map((c) => ({ label: c.label, sum: list.reduce((s, t) => s + (c.num!(t) ?? 0), 0) }))
      .filter((x) => x.sum);
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
              {cols.map((c) => (
                <th key={c.key} className="p-2 font-medium whitespace-nowrap">
                  {c.sort ? (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => sortBy(c.sort!)}>
                      {c.label}
                      {filter.sort === c.sort ? filter.dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-40" />}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => {
            const shut = closed.includes(g.key);
            const sums = totals(g.tasks);
            return (
              <tbody key={g.key || "all"}>
                {grouper && (
                  <tr className="border-t bg-muted/30">
                    <td colSpan={cols.length + 1} className="p-0">
                      <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm font-semibold" onClick={() => setClosed((x) => (shut ? x.filter((k) => k !== g.key) : [...x, g.key]))} aria-expanded={!shut}>
                        {shut ? <ChevronRightIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
                        {g.label}
                        <span className="text-xs font-normal text-muted-foreground tabular">
                          {g.tasks.length}
                          {sums.map((x) => ` · ${x.label} ${fmt(x.sum)}`).join("")}
                        </span>
                      </button>
                    </td>
                  </tr>
                )}
                {!shut &&
                  g.tasks.map((t) => {
                    const mine = canEditTask(access, t, viewerId);
                    return (
                      <tr key={t.id} className={cn("border-t", picked.has(t.id) && "bg-primary/5")}>
                        <td className="p-2">
                          <Checkbox checked={picked.has(t.id)} aria-label={`Select ${t.code}`} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(t.id)) : (s.delete(t.id), new Set(s))))} />
                        </td>
                        {cols.map((c) => (
                          <td key={c.key} className={cn("p-2 text-xs", c.key === "title" && "max-w-[360px] text-sm")}>
                            {c.key === "title" ? (
                              <>
                                <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(t)}>
                                  {t.title}
                                </button>
                                {!cols.some((x) => x.key === "type" || x.key === "project") && (
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {labelOf(config.types, t.type)}
                                    {t.project_name && ` · ${t.project_name}`}
                                  </span>
                                )}
                              </>
                            ) : c.key === "status" && mine ? (
                              <Select value={t.status} onValueChange={(v) => setStatus(t, v)}>
                                <SelectTrigger size="sm" className="h-7 w-32 text-xs" aria-label={`Status of ${t.code}`}>
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
                            ) : c.cell ? (
                              c.cell(t)
                            ) : (
                              <span className="block max-w-48 truncate">{c.text(t)}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
              </tbody>
            );
          })}
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
                  <BulkPick label={config.names.project} options={[{ value: "none", label: "None" }, ...projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}` }))]} onPick={(v) => bulk({ projectId: v === "none" ? null : v }, "moved")} disabled={busy} />
                </>
              )}
              <Input type="date" aria-label="Set due date" className="h-7 w-36 text-xs" onChange={(e) => e.target.value && bulk({ dueDate: e.target.value }, "updated")} disabled={busy} />
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

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

type UndoStep = { label: string; run: () => Promise<{ ok: boolean; error?: string }> };

const cellInput = "h-8 w-full min-w-24 rounded-none border-0 bg-transparent px-2 text-xs shadow-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-default disabled:opacity-100";

export function SheetView({ dept, config, tasks, people, projects, access, viewerId, onOpen }: { dept: WorkDept; config: DeptConfig; tasks: Task[]; people: Person[]; projects: Project[]; access: Access; viewerId: string; onOpen: (t: Task) => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const all = React.useMemo(() => columnsFor(config, people, projects), [config, people, projects]);
  const cols = pickColumns(all, params.get("cols"), defaultColumns(config));
  const [undo, setUndo] = React.useState<UndoStep[]>([]);
  const [saving, setSaving] = React.useState(0);
  const [pasting, setPasting] = React.useState(false);
  const push = (s: UndoStep) => setUndo((u) => [...u.slice(-19), s]);

  const save = async (t: Task, c: Col, v: string | boolean) => {
    if (!c.patch) return;
    if (String(v) === c.text(t) || (c.edit === "checkbox" && !!v === !!t.fields[c.field!.key])) return;
    setSaving((n) => n + 1);
    const before = taskInput(t);
    const r = await saveTaskAction(dept, taskInput(t, c.patch(t, v)));
    setSaving((n) => n - 1);
    if (!r.ok) {
      toast.error(r.error);
      return router.refresh();
    }
    push({ label: `${t.code} ${c.label.toLowerCase()}`, run: () => saveTaskAction(dept, before) });
    router.refresh();
  };
  const addRow = async (title: string) => {
    const r = await saveTaskAction(dept, { title });
    if (!r.ok) return toast.error(r.error), false;
    const id = r.data as string;
    push({ label: `adding "${title}"`, run: () => bulkTasksAction(dept, [id], { delete: true }) });
    router.refresh();
    return true;
  };
  const doUndo = async () => {
    const step = undo[undo.length - 1];
    if (!step) return;
    setUndo((u) => u.slice(0, -1));
    const r = await step.run();
    if (!r.ok) toast.error(r.error ?? "Could not undo.");
    else toast.success(`Undid ${step.label}`);
    router.refresh();
  };

  const editor = (t: Task, c: Col) => {
    const can = canEditTask(access, t, viewerId) && !!c.edit && (!c.field || ((!c.field.leadsOnly || access.rights.editAll) && fieldShown(c.field, t.type)));
    const key = `${t.id}:${c.key}:${t.updated_at}`;
    const value = c.field ? t.fields[c.field.key] : null;
    if (c.key === "code")
      return (
        <button type="button" className="px-2 font-mono text-xs hover:underline" onClick={() => onOpen(t)}>
          {t.code}
        </button>
      );
    if (!can) return <span className="block truncate px-2 text-xs text-muted-foreground">{c.text(t) || ""}</span>;
    const commit = (v: string | boolean) => void save(t, c, v);
    const blurCommit = (e: React.FocusEvent<HTMLInputElement>) => commit(e.currentTarget.value);
    const enter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur();
    switch (c.edit) {
      case "select":
      case "person":
      case "project": {
        const current = c.key === "type" ? t.type : c.key === "status" ? t.status : c.key === "priority" ? t.priority : c.key === "assignee" ? (t.assignee_id ?? "") : c.key === "project" ? (t.project_id ?? "") : String(value ?? "");
        let options = c.options ?? [];
        if (c.edit === "person") options = c.key === "assignee" && !access.rights.assign ? [{ value: viewerId, label: "Me" }, ...(t.assignee_id && t.assignee_id !== viewerId ? [{ value: t.assignee_id, label: t.assignee_name ?? "Someone" }] : [])] : people.map((p) => ({ value: p.id, label: p.name }));
        if (c.key === "status") options = usable(config.statuses, t.status).map((s) => ({ value: s.key, label: s.label }));
        const blank = c.key === "assignee" ? "Unassigned" : c.key === "project" || c.field ? "-" : null;
        return (
          <select key={key} aria-label={`${c.label} of ${t.code}`} defaultValue={current} onChange={(e) => commit(e.target.value)} className={cn(cellInput, "cursor-pointer")}>
            {blank !== null && <option value="">{blank}</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }
      case "checkbox":
        return (
          <span className="flex h-8 items-center px-2">
            <Checkbox aria-label={`${c.label} of ${t.code}`} checked={value === true} onCheckedChange={(v) => commit(v === true)} />
          </span>
        );
      case "date":
        return <Input key={key} type="date" aria-label={`${c.label} of ${t.code}`} defaultValue={c.text(t)} onBlur={blurCommit} onKeyDown={enter} className={cellInput} />;
      case "number":
        return <Input key={key} type="number" step="any" aria-label={`${c.label} of ${t.code}`} defaultValue={c.key === "progress" ? String(t.progress) : c.field ? (value == null ? "" : String(value)) : c.text(t)} onBlur={blurCommit} onKeyDown={enter} className={cn(cellInput, "w-24")} />;
      default:
        return <Input key={key} aria-label={`${c.label} of ${t.code}`} defaultValue={c.field ? (Array.isArray(value) ? value.join(", ") : String(value ?? "")) : c.text(t)} onBlur={blurCommit} onKeyDown={enter} className={cn(cellInput, c.key === "title" && "min-w-64")} />;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Type into a cell, then press Enter or click away to save.</span>
        {saving > 0 && (
          <span className="flex items-center gap-1">
            <Loader2Icon className="size-3 animate-spin" /> Saving
          </span>
        )}
        <span className="ml-auto flex gap-2">
          {!access.readOnly && (
            <Button size="sm" variant="outline" onClick={() => setPasting(true)}>
              <ClipboardPasteIcon /> Paste rows
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={!undo.length} onClick={doUndo} title={undo.length ? `Undo ${undo[undo.length - 1]!.label}` : "Nothing to undo"}>
            <Undo2Icon /> Undo{undo.length ? ` (${undo.length})` : ""}
          </Button>
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="border-r px-2 py-1.5 font-medium whitespace-nowrap last:border-r-0">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t hover:bg-muted/20">
                {cols.map((c) => (
                  <td key={c.key} className="border-r p-0 last:border-r-0">
                    {editor(t, c)}
                  </td>
                ))}
              </tr>
            ))}
            {!access.readOnly && (
              <tr className="border-t">
                <td colSpan={cols.length} className="p-0">
                  <AddRow placeholder={`Add a ${config.names.task.toLowerCase()}: type a title and press Enter`} onAdd={addRow} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pasting && <PasteRows dept={dept} config={config} cols={cols} onClose={() => setPasting(false)} />}
    </div>
  );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => Promise<boolean> }) {
  const [v, setV] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="flex items-center"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.trim()) return;
        setBusy(true);
        if (await onAdd(v.trim())) setV("");
        setBusy(false);
      }}
    >
      <PlusIcon className="ml-2 size-3.5 text-muted-foreground" />
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label="New row title" disabled={busy} className={cn(cellInput, "flex-1")} />
    </form>
  );
}

// Rows copied from Excel or Google Sheets (tab separated), in the order of the visible columns.
const IMPORT_KEY: Record<string, string> = { title: "title", type: "type", status: "status", priority: "priority", assignee: "assignee", project: "project_key", due: "due_date", start: "start_date", estimate: "estimate_hours", labels: "labels" };

function PasteRows({ dept, config, cols, onClose }: { dept: WorkDept; config: DeptConfig; cols: Col[]; onClose: () => void }) {
  const router = useRouter();
  // Pasted columns line up with the visible ones; those that cannot be set (code, dates of change) are skipped.
  const importable = (c: Col) => !!(IMPORT_KEY[c.key] || c.field);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const rows = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split("\t"));
  // A first row matching the column names is a header.
  const header = rows[0] && rows[0].every((cell, i) => !cell.trim() || cell.trim().toLowerCase() === cols[i]?.label.toLowerCase());
  const data = header ? rows.slice(1) : rows;
  const records = data.map((r) =>
    Object.fromEntries(
      cols.flatMap((c, i) => {
        if (!importable(c)) return [];
        let v = (r[i] ?? "").trim();
        if (c.key === "project") v = v.split(/\s+/)[0] ?? "";
        return [[c.field ? c.field.key : IMPORT_KEY[c.key]!, v]];
      }),
    ),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste rows</DialogTitle>
          <DialogDescription>
            Copy cells from Excel or Google Sheets and paste them here. Columns are read in the order shown in the sheet: {cols.map((c) => (importable(c) ? c.label : `(${c.label}, ignored)`)).join(", ")}. Statuses, types and people can be names. Each row becomes a new{" "}
            {config.names.task.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={cols.map((c) => c.label).join("\t")} className="font-mono text-xs" aria-label="Rows to paste" />
        <p className="text-xs text-muted-foreground">
          {data.length} row{data.length === 1 ? "" : "s"}
          {header ? " (header row skipped)" : ""}.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!data.length || busy}
            onClick={async () => {
              setBusy(true);
              const r = await importTasksAction(dept, records);
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              const d = r.data as { created: number; errors: string[] };
              if (d.errors.length) toast.warning(`${d.created} added, ${d.errors.length} skipped`, { description: d.errors.slice(0, 4).join("\n"), duration: 12000 });
              else toast.success(`${d.created} added`);
              onClose();
              router.refresh();
            }}
          >
            {busy && <Loader2Icon className="animate-spin" />} Add {data.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Overview tree
// ---------------------------------------------------------------------------

type Roll = { total: number; done: number; overdue: number; hours: number };
function rollup(list: Task[]): Roll {
  const live = list.filter((t) => t.status_category !== "cancelled");
  return {
    total: live.length,
    done: live.filter((t) => t.status_category === "done").length,
    overdue: live.filter((t) => t.due_date && t.due_date < today() && !finished(t)).length,
    hours: live.reduce((s, t) => s + (t.estimate_hours ?? 0), 0),
  };
}

function RollCells({ r }: { r: Roll }) {
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
  return (
    <>
      <td className="w-48 p-2">
        <div className="flex items-center gap-2">
          <Meter value={r.done} max={Math.max(1, r.total)} className="flex-1" />
          <span className="w-10 text-right text-xs tabular">{pct}%</span>
        </div>
      </td>
      <td className="p-2 text-right text-xs tabular whitespace-nowrap">
        {fmt(r.done)} / {fmt(r.total)}
      </td>
      <td className={cn("p-2 text-right text-xs tabular", r.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{r.overdue || ""}</td>
      <td className="p-2 text-right text-xs tabular text-muted-foreground">{r.hours ? `${fmt(r.hours)}h` : ""}</td>
    </>
  );
}

export function OverviewTree({ config, tasks, projects, onOpen }: { config: DeptConfig; tasks: Task[]; projects: Project[]; onOpen: (t: Task) => void }) {
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((s) => (s.has(k) ? (s.delete(k), new Set(s)) : new Set(s.add(k))));
  const groups = [
    ...projects.map((p) => ({ key: p.id, label: `${p.key} ${p.name}`, due: p.due_date, status: labelOf(config.projectStatuses, p.status), milestones: config.features.milestones ? p.milestones : [], tasks: tasks.filter((t) => t.project_id === p.id) })),
    { key: "none", label: `No ${config.names.project.toLowerCase()}`, due: null, status: "", milestones: [], tasks: tasks.filter((t) => !t.project_id) },
  ].filter((g) => g.tasks.length || g.key !== "none");
  const allKeys = groups.flatMap((g) => [g.key, ...g.milestones.map((m) => `${g.key}:${m.id}`), `${g.key}:none`]);
  const taskRow = (t: Task, depth: number) => (
    <tr key={t.id} className="border-t">
      <td className="p-2" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
        <button type="button" onClick={() => onOpen(t)} className="flex items-center gap-2 text-left hover:underline">
          <span className="font-mono text-[11px] text-muted-foreground">{t.code}</span>
          <span className={cn("text-sm", t.status_category === "done" && "text-muted-foreground line-through")}>{t.title}</span>
        </button>
      </td>
      <td className="p-2">
        <Tone config={config} status={t.status} />
      </td>
      <td className="p-2 text-right text-xs text-muted-foreground">{t.assignee_name ?? ""}</td>
      <td className={cn("p-2 text-right text-xs", t.due_date && t.due_date < today() && !finished(t) ? "font-medium text-destructive" : "text-muted-foreground")}>{t.due_date ?? ""}</td>
      <td className="p-2 text-right text-xs text-muted-foreground tabular">{t.estimate_hours ? `${t.estimate_hours}h` : ""}</td>
    </tr>
  );
  if (!groups.length) return <EmptyState title={`No ${config.names.projects.toLowerCase()} or ${config.names.tasks.toLowerCase()}`} description="Change the filters, or add some." />;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(new Set(allKeys))}>
          <ChevronsUpDownIcon /> Expand all
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(new Set())}>
          <ChevronsDownUpIcon /> Collapse all
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">
                {config.names.project} / {config.names.milestone} / {config.names.task}
              </th>
              <th className="p-2 font-medium">Progress</th>
              <th className="p-2 text-right font-medium">Done</th>
              <th className="p-2 text-right font-medium">Overdue</th>
              <th className="p-2 text-right font-medium">Estimate</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isOpen = open.has(g.key);
              const loose = g.tasks.filter((t) => !t.milestone_id || !g.milestones.some((m) => m.id === t.milestone_id));
              return (
                <React.Fragment key={g.key}>
                  <tr className="border-t bg-muted/20">
                    <td className="p-2">
                      <button type="button" className="flex items-center gap-1.5 text-left font-semibold" onClick={() => toggle(g.key)} aria-expanded={isOpen}>
                        {isOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                        {g.label}
                        <span className="text-xs font-normal text-muted-foreground">
                          {g.status}
                          {g.due && ` · due ${g.due}`}
                        </span>
                      </button>
                    </td>
                    <RollCells r={rollup(g.tasks)} />
                  </tr>
                  {isOpen &&
                    g.milestones.map((m) => {
                      const k = `${g.key}:${m.id}`;
                      const list = g.tasks.filter((t) => t.milestone_id === m.id);
                      return (
                        <React.Fragment key={k}>
                          <tr className="border-t">
                            <td className="p-2 pl-7">
                              <button type="button" className="flex items-center gap-1.5 text-left font-medium" onClick={() => toggle(k)} aria-expanded={open.has(k)}>
                                {open.has(k) ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
                                {m.name}
                                {m.due_date && <span className="text-xs font-normal text-muted-foreground">due {m.due_date}</span>}
                              </button>
                            </td>
                            <RollCells r={rollup(list)} />
                          </tr>
                          {open.has(k) && list.map((t) => taskRow(t, 3))}
                        </React.Fragment>
                      );
                    })}
                  {isOpen && loose.length > 0 && (g.milestones.length > 0 ? (
                    <>
                      <tr className="border-t">
                        <td className="p-2 pl-7">
                          <button type="button" className="flex items-center gap-1.5 text-left font-medium text-muted-foreground" onClick={() => toggle(`${g.key}:none`)} aria-expanded={open.has(`${g.key}:none`)}>
                            {open.has(`${g.key}:none`) ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
                            No {config.names.milestone.toLowerCase()}
                          </button>
                        </td>
                        <RollCells r={rollup(loose)} />
                      </tr>
                      {open.has(`${g.key}:none`) && loose.map((t) => taskRow(t, 3))}
                    </>
                  ) : (
                    loose.map((t) => taskRow(t, 2))
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
