"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { StatusPill, type Tone } from "@/components/app/status-pill";
import { EMPLOYEE_STATUS_LABELS, EQUIPMENT_STATUS_LABELS, type EmployeeStatus, type EquipmentStatus } from "@/lib/hr";
import { cn } from "@/lib/utils";

// A labelled control; the label is tied to the control so it is announced and clickable.
export function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  const id = React.useId();
  const control = React.isValidElement<{ id?: string }>(children) && typeof children.type !== "string" ? React.cloneElement(children, { id }) : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const EMPLOYEE_TONE: Record<EmployeeStatus, Tone> = { active: "done", probation: "paused", on_leave: "queued", left: "neutral" };
export const EmployeeStatusPill = ({ status }: { status: EmployeeStatus }) => <StatusPill tone={EMPLOYEE_TONE[status]} size="xs" label={EMPLOYEE_STATUS_LABELS[status]} />;

const EQUIPMENT_TONE: Record<EquipmentStatus, Tone> = { available: "done", issued: "active", repair: "paused", retired: "neutral" };
export const EquipmentStatusPill = ({ status }: { status: EquipmentStatus }) => <StatusPill tone={EQUIPMENT_TONE[status]} size="xs" label={EQUIPMENT_STATUS_LABELS[status]} />;

// Days from today to a YYYY-MM-DD date (negative when it has passed).
export const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00`) - new Date(new Date().toDateString()).getTime()) / 864e5);

export function DueBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  const tone: Tone = d < 0 ? "blocked" : d <= 14 ? "paused" : "queued";
  return <StatusPill tone={tone} size="xs" dot={false} label={d < 0 ? `${-d} days ago` : d === 0 ? "Today" : `In ${d} days`} />;
}

export const fmtDay = (date: string | null | undefined) => (date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "-");

export function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
