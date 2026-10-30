"use client";

// Team and workload: per person, the estimated hours of open work against weekly capacity, what is due this week,
// overdue work, time logged this week and what was finished in the period. Leads move work between people here.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Meter, UserAvatar } from "@/components/app/primitives";
import { bulkTasksAction, setCapacityAction } from "@/app/actions/departments";
import type { TeamWorkload } from "@/server/work-extras";
import type { WorkDept } from "@/lib/work";
import { labelOf, type DeptConfig } from "@/lib/dept-config";
import { POSITION_LABELS, type Position } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { PriorityDot, Tone, today, type Access, type Person } from "./work-shared";

export function TeamView({ dept, config, data, people, access, onOpen }: { dept: WorkDept; config: DeptConfig; data: TeamWorkload; people: Person[]; access: Access; onOpen: (id: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = React.useState<string | null>(null);
  const canAssign = access.rights.assign && !access.readOnly;
  const move = async (taskId: string, to: string) => {
    const r = await bulkTasksAction(dept, [taskId], { assigneeId: to === "none" ? null : to });
    if (!r.ok) return toast.error(r.error);
    const bad = (r.data as { ok: boolean; error?: string }[]).find((x) => !x.ok);
    if (bad) return toast.error(bad.error);
    toast.success("Reassigned");
    router.refresh();
  };
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-2 font-medium">Person</th>
            <th className="w-64 p-2 font-medium">Open work against weekly capacity</th>
            <th className="p-2 text-right font-medium">Open</th>
            <th className="p-2 text-right font-medium">Due this week</th>
            <th className="p-2 text-right font-medium">Overdue</th>
            <th className="p-2 text-right font-medium">Logged this week</th>
            <th className="p-2 text-right font-medium">Done ({data.period.label.toLowerCase()})</th>
            <th className="p-2 text-right font-medium">Capacity (h/week)</th>
          </tr>
        </thead>
        <tbody>
          {data.people.map((p) => {
            const key = p.id ?? "none";
            const isOpen = open === key;
            const load = p.capacity ? p.hours / p.capacity : 0;
            return (
              <React.Fragment key={key}>
                <tr className="border-t">
                  <td className="p-2">
                    <button type="button" className="flex items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
                      {isOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                      {p.id && <UserAvatar name={p.name} size="xs" />}
                      <span>
                        <span className="block font-medium">{p.name}</span>
                        {p.position && <span className="block text-xs text-muted-foreground">{POSITION_LABELS[p.position as Position]}</span>}
                      </span>
                    </button>
                  </td>
                  <td className="p-2">
                    {p.id ? (
                      <div className="flex items-center gap-2">
                        <Meter value={Math.min(p.hours, Math.max(p.capacity, 1))} max={Math.max(p.capacity, 1)} tone={load > 1 ? "danger" : load > 0.85 ? "warning" : "primary"} className="flex-1" />
                        <span className={cn("w-24 text-right text-xs tabular", load > 1 && "font-medium text-destructive")}>
                          {p.hours}h / {p.capacity}h
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{p.hours}h estimated</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular">{p.open}</td>
                  <td className="p-2 text-right tabular">{p.dueWeekHours ? `${p.dueWeekHours}h` : "-"}</td>
                  <td className={cn("p-2 text-right tabular", p.overdue && "font-medium text-destructive")}>{p.overdue || "-"}</td>
                  <td className="p-2 text-right tabular">{p.logged ? `${p.logged}h` : "-"}</td>
                  <td className="p-2 text-right tabular">{p.done || "-"}</td>
                  <td className="p-2 text-right">
                    {p.id && canAssign ? (
                      <Input
                        type="number"
                        min={0}
                        max={80}
                        defaultValue={p.capacity}
                        aria-label={`Weekly capacity of ${p.name}`}
                        className="ml-auto h-7 w-20 text-right text-xs"
                        onBlur={async (e) => {
                          const v = Number(e.currentTarget.value);
                          if (v === p.capacity) return;
                          const r = await setCapacityAction(dept, p.id!, v);
                          if (!r.ok) return toast.error(r.error);
                          router.refresh();
                        }}
                      />
                    ) : (
                      <span className="text-xs tabular">{p.id ? p.capacity : ""}</span>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-t bg-muted/20">
                    <td colSpan={8} className="p-2">
                      {p.tasks.length ? (
                        <ul className="divide-y rounded-lg border bg-background">
                          {p.tasks.map((t) => (
                            <li key={t.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
                              <PriorityDot config={config} priority={t.priority} />
                              <span className="font-mono text-[11px] text-muted-foreground">{t.code}</span>
                              <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen(t.id)}>
                                {t.title}
                              </button>
                              <Tone config={config} status={t.status} />
                              <span className={cn("w-20 text-right text-xs", t.due_date && t.due_date < today() ? "font-medium text-destructive" : "text-muted-foreground")}>{t.due_date ?? ""}</span>
                              <span className="w-12 text-right text-xs text-muted-foreground">{t.estimate_hours ? `${t.estimate_hours}h` : ""}</span>
                              {canAssign && (
                                <select
                                  aria-label={`Move ${t.code} to`}
                                  className="h-7 rounded-md border bg-background px-1 text-xs"
                                  value=""
                                  onChange={(e) => e.target.value && move(t.id, e.target.value)}
                                >
                                  <option value="">Move to…</option>
                                  {p.id && <option value="none">Unassigned</option>}
                                  {people
                                    .filter((x) => x.id !== p.id)
                                    .map((x) => (
                                      <option key={x.id} value={x.id}>
                                        {x.name}
                                      </option>
                                    ))}
                                </select>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">No open {config.names.tasks.toLowerCase()}.</p>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="border-t p-2 text-xs text-muted-foreground">
        Capacity defaults to 40 hours a week. Workload counts estimated hours of open {config.names.tasks.toLowerCase()}; give {labelOf(config.types, config.types[0]?.key ?? "").toLowerCase() || "tasks"} estimates to make it meaningful.
      </p>
    </div>
  );
}
