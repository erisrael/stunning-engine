"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "");
const overdue = (iso: string | null) => !!iso && Date.parse(iso) < Date.now();
const STATUS_LABEL: Record<string, string> = { queued: "To do", in_progress: "In progress", paused: "Paused", blocked: "Blocked", finished: "Done", lead_review: "With the lead", awaiting_handoff: "Handed over", ready: "Ready" };

type Part = { id: string; code: string; title: string; grade: string | null; subject: string | null; unitNumber: number | null; partNumber: number | null; stage: Stage; status: string; priority: string; dueAt: string | null; draft: boolean };
type Col = { key: string; label: string; get: (p: Part) => string | number };
const COLS: Col[] = [
  { key: "title", label: "Part", get: (p) => p.title },
  { key: "grade", label: "Grade", get: (p) => p.grade ?? "" },
  { key: "subject", label: "Subject", get: (p) => p.subject ?? "" },
  { key: "unit", label: "Unit · part", get: (p) => (p.unitNumber ?? 0) * 1000 + (p.partNumber ?? 0) },
  { key: "stage", label: "Stage", get: (p) => STAGE_LABELS[p.stage] },
  { key: "status", label: "Status", get: (p) => STATUS_LABEL[p.status] ?? p.status },
  { key: "priority", label: "Priority", get: (p) => ({ urgent: 0, high: 1, normal: 2, low: 3 })[p.priority] ?? 2 },
  { key: "due", label: "Due", get: (p) => p.dueAt ?? "9999" },
];

// My production parts as a table: filter, sort by any column, and open a part on the board.
export function MyPartsTable({ items }: { items: Part[] }) {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [grade, setGrade] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 }>({ key: "due", dir: 1 });
  const grades = [...new Set(items.map((i) => i.grade).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const statuses = [...new Set(items.map((i) => i.status))];
  const col = COLS.find((c) => c.key === sort.key)!;
  const rows = items
    .filter((i) => (status === "all" || i.status === status) && (grade === "all" || i.grade === grade) && (!q.trim() || `${i.title} ${i.code} ${i.subject ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => {
      const x = col.get(a);
      const y = col.get(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filter my parts">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part, code, subject…" className="h-8 w-56 text-xs" aria-label="Search my parts" />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
          <option value="all">Every status</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
        </select>
        <select aria-label="Grade" value={grade} onChange={(e) => setGrade(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
          <option value="all">Every grade</option>
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{rows.length} of {items.length}</span>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-muted/90 text-left text-[11px] text-muted-foreground backdrop-blur">
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className="px-2 py-2 whitespace-nowrap">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? (sort.dir === 1 ? -1 : 1) : 1 })}>
                    {c.label}
                    {sort.key === c.key && (sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/40">
                <td className="px-2 py-1.5">
                  <Link href={`/my-work?tab=production&view=board&item=${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">{p.code}</span>
                  {p.draft && <Badge variant="outline" className="ml-1 text-[10px]">Not started</Badge>}
                </td>
                <td className="px-2 py-1.5 text-xs">{p.grade}</td>
                <td className="px-2 py-1.5 text-xs">{p.subject}</td>
                <td className="px-2 py-1.5 text-xs">{p.unitNumber != null ? `Unit ${p.unitNumber}` : ""}{p.partNumber != null ? ` · Part ${p.partNumber}` : ""}</td>
                <td className="px-2 py-1.5 text-xs">{STAGE_LABELS[p.stage]}</td>
                <td className="px-2 py-1.5 text-xs">{STATUS_LABEL[p.status] ?? p.status}</td>
                <td className="px-2 py-1.5 text-xs capitalize">{p.priority}</td>
                <td className={cn("px-2 py-1.5 text-xs whitespace-nowrap", overdue(p.dueAt) && p.status !== "finished" && "font-medium text-rose-600")}>{when(p.dueAt)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={COLS.length} className="px-3 py-8 text-center text-muted-foreground">Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Task = { id: string; code: string; title: string; dept: string; deptTitle: string; status: string; statusCategory: string; priority: string; due: string | null; project: string | null; href: string };

// Tasks assigned to me in every department, in one table.
export function MyTasksTable({ tasks }: { tasks: Task[] }) {
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("all");
  const depts = [...new Map(tasks.map((t) => [t.dept, t.deptTitle])).entries()];
  const rows = tasks.filter((t) => (dept === "all" || t.dept === dept) && (!q.trim() || `${t.title} ${t.code} ${t.project ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filter my tasks">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="h-8 w-56 text-xs" aria-label="Search my tasks" />
        {depts.length > 1 && (
          <select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="all">Every department</option>
            {depts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        )}
        <span className="text-xs text-muted-foreground">{rows.length} open</span>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-muted/90 text-left text-[11px] text-muted-foreground backdrop-blur">
            <tr><th className="px-2 py-2">Task</th><th className="px-2 py-2">Department</th><th className="px-2 py-2">Project</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Priority</th><th className="px-2 py-2">Due</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={`${t.dept}:${t.id}`} className="border-t hover:bg-muted/40">
                <td className="px-2 py-1.5"><Link href={t.href} className="font-medium hover:underline">{t.title}</Link> <span className="font-mono text-[10px] text-muted-foreground">{t.code}</span></td>
                <td className="px-2 py-1.5 text-xs">{t.deptTitle}</td>
                <td className="px-2 py-1.5 text-xs">{t.project ?? ""}</td>
                <td className="px-2 py-1.5 text-xs">{t.status}</td>
                <td className="px-2 py-1.5 text-xs capitalize">{t.priority}</td>
                <td className={cn("px-2 py-1.5 text-xs whitespace-nowrap", overdue(t.due) && "font-medium text-rose-600")}>{when(t.due)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No open tasks.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
