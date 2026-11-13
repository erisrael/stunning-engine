"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { WorkTable, type WtCol, type WtFilter, type WtView } from "./work-table";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "");
const overdue = (iso: string | null) => !!iso && Date.parse(iso) < Date.now();
const dueBucket = (iso: string | null) => {
  if (!iso) return "No due date";
  const d = (Date.parse(iso) - Date.now()) / 86400e3;
  return d < 0 ? "Overdue" : d < 1 ? "Today" : d < 7 ? "This week" : "Later";
};
const PRI: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const STATUS_LABEL: Record<string, string> = { queued: "To do", in_progress: "In progress", paused: "Paused", blocked: "Blocked", finished: "Done", lead_review: "With the lead", awaiting_handoff: "Handed over", ready: "Ready" };

type Part = { id: string; code: string; title: string; grade: string | null; subject: string | null; unitNumber: number | null; partNumber: number | null; stage: Stage; status: string; priority: string; dueAt: string | null; draft: boolean };

const PART_COLS: WtCol<Part>[] = [
  {
    key: "title",
    label: "Part",
    sort: (p) => p.title,
    cell: (p) => (
      <>
        <Link href={`/my-work?tab=production&view=board&item=${p.id}`} className="font-medium hover:underline">{p.title}</Link>
        <span className="ml-1 font-mono text-[10px] text-muted-foreground">{p.code}</span>
        {p.draft && <Badge variant="outline" className="ml-1 text-[10px]">Not started</Badge>}
      </>
    ),
  },
  { key: "grade", label: "Grade", sort: (p) => p.grade ?? "", cell: (p) => p.grade, group: (p) => p.grade ?? "" },
  { key: "subject", label: "Subject", sort: (p) => p.subject ?? "", cell: (p) => p.subject, group: (p) => p.subject ?? "" },
  { key: "unit", label: "Unit · part", sort: (p) => (p.unitNumber ?? 0) * 1000 + (p.partNumber ?? 0), cell: (p) => `${p.unitNumber != null ? `Unit ${p.unitNumber}` : ""}${p.partNumber != null ? ` · Part ${p.partNumber}` : ""}`, group: (p) => (p.unitNumber != null ? `${p.grade ?? ""} ${p.subject ?? ""} · Unit ${p.unitNumber}`.trim() : "") },
  { key: "stage", label: "Stage", sort: (p) => STAGE_LABELS[p.stage], cell: (p) => STAGE_LABELS[p.stage], group: (p) => STAGE_LABELS[p.stage] },
  { key: "status", label: "Status", sort: (p) => STATUS_LABEL[p.status] ?? p.status, cell: (p) => STATUS_LABEL[p.status] ?? p.status, group: (p) => STATUS_LABEL[p.status] ?? p.status },
  { key: "priority", label: "Priority", sort: (p) => PRI[p.priority] ?? 2, cell: (p) => <span className="capitalize">{p.priority}</span>, group: (p) => p.priority },
  { key: "due", label: "Due", sort: (p) => p.dueAt ?? "9999", cell: (p) => <span className={cn("whitespace-nowrap", overdue(p.dueAt) && p.status !== "finished" && "font-medium text-rose-600")}>{when(p.dueAt)}</span>, group: (p) => dueBucket(p.dueAt) },
];
const PART_FILTERS: WtFilter<Part>[] = [
  { key: "status", label: "Status", get: (p) => p.status, label_: (v) => STATUS_LABEL[v] ?? v },
  { key: "grade", label: "Grade", get: (p) => p.grade ?? "" },
  { key: "subject", label: "Subject", get: (p) => p.subject ?? "" },
  { key: "stage", label: "Stage", get: (p) => p.stage, label_: (v) => STAGE_LABELS[v as Stage] ?? v },
  { key: "priority", label: "Priority", get: (p) => p.priority },
];

// My production parts as a table: columns, sort, group, filters and saved views.
export function MyPartsTable({ items, views = [], canShare = false }: { items: Part[]; views?: WtView[]; canShare?: boolean }) {
  return (
    <WorkTable
      rows={items}
      cols={PART_COLS}
      filters={PART_FILTERS}
      search={(p) => `${p.title} ${p.code} ${p.subject ?? ""}`}
      rowKey={(p) => p.id}
      page="my-work:parts"
      views={views}
      canShare={canShare}
      defaultSort={{ key: "due", dir: 1 }}
      label="my parts"
    />
  );
}

type Task = { id: string; code: string; title: string; dept: string; deptTitle: string; status: string; statusCategory: string; priority: string; due: string | null; project: string | null; href: string };

const TASK_COLS: WtCol<Task>[] = [
  { key: "title", label: "Task", sort: (t) => t.title, cell: (t) => (<><Link href={t.href} className="font-medium hover:underline">{t.title}</Link> <span className="font-mono text-[10px] text-muted-foreground">{t.code}</span></>) },
  { key: "dept", label: "Department", sort: (t) => t.deptTitle, cell: (t) => t.deptTitle, group: (t) => t.deptTitle },
  { key: "project", label: "Project", sort: (t) => t.project ?? "", cell: (t) => t.project ?? "", group: (t) => t.project ?? "No project" },
  { key: "status", label: "Status", sort: (t) => t.status, cell: (t) => t.status, group: (t) => t.status },
  { key: "priority", label: "Priority", sort: (t) => PRI[t.priority] ?? 2, cell: (t) => <span className="capitalize">{t.priority}</span>, group: (t) => t.priority },
  { key: "due", label: "Due", sort: (t) => t.due ?? "9999", cell: (t) => <span className={cn("whitespace-nowrap", overdue(t.due) && "font-medium text-rose-600")}>{when(t.due)}</span>, group: (t) => dueBucket(t.due) },
];
const TASK_FILTERS: WtFilter<Task>[] = [
  { key: "dept", label: "Department", get: (t) => t.deptTitle },
  { key: "status", label: "Status", get: (t) => t.status },
  { key: "priority", label: "Priority", get: (t) => t.priority },
];

// Tasks assigned to me in every department, in one table.
export function MyTasksTable({ tasks, views = [], canShare = false }: { tasks: Task[]; views?: WtView[]; canShare?: boolean }) {
  return (
    <WorkTable
      rows={tasks}
      cols={TASK_COLS}
      filters={TASK_FILTERS}
      search={(t) => `${t.title} ${t.code} ${t.project ?? ""}`}
      rowKey={(t) => `${t.dept}:${t.id}`}
      page="my-work:tasks"
      views={views}
      canShare={canShare}
      defaultSort={{ key: "due", dir: 1 }}
      label="my tasks"
      empty="No open tasks."
    />
  );
}
