"use client";

// Small pieces shared by the Dev and Marketing views (work-client and work-views).

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Task, TaskInput } from "@/server/work";
import type { Position } from "@/lib/domain";
import { statusOf, type DeptConfig, type Rights } from "@/lib/dept-config";

export type Person = { id: string; name: string; position: Position };
export type Access = { rights: Rights; readOnly: boolean };

export const today = () => new Date().toISOString().slice(0, 10);
export const finished = (t: Task) => t.status_category === "done" || t.status_category === "cancelled";
// Active items, plus the one already in use (a switched-off status or type stays readable on old tasks).
export const usable = <T extends { key: string; active: boolean }>(items: T[], current?: string) => items.filter((i) => i.active || i.key === current);
export const canEditTask = (access: Access, t: Task, viewerId: string) => !access.readOnly && (access.rights.editAll || t.assignee_id === viewerId || t.reporter_id === viewerId);

// The full input to save a task again with some changes (the server takes the whole task).
export function taskInput(t: Task, patch: Partial<TaskInput> = {}): TaskInput {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    status: t.status,
    priority: t.priority,
    projectId: t.project_id,
    milestoneId: t.milestone_id,
    assigneeId: t.assignee_id,
    estimateHours: t.estimate_hours,
    spentHours: t.spent_hours,
    progress: t.progress,
    startDate: t.start_date,
    dueDate: t.due_date,
    labels: t.labels,
    fields: t.fields,
    ...patch,
  };
}

export function Tone({ config, status }: { config: DeptConfig; status: string }) {
  const s = statusOf(config, status);
  const c = s?.color ?? "#94a3b8";
  return (
    <span className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap" style={{ background: `${c}22`, color: c }}>
      {s?.label ?? status}
    </span>
  );
}

export function PriorityDot({ config, priority }: { config: DeptConfig; priority: string }) {
  const p = config.priorities.find((x) => x.key === priority);
  return <span className="size-2 shrink-0 rounded-full" style={{ background: p?.color ?? "#94a3b8" }} title={p?.label ?? priority} />;
}

export function BulkPick({ label, options, onPick, disabled }: { label: string; options: { value: string; label: string }[]; onPick: (v: string) => void; disabled?: boolean }) {
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
