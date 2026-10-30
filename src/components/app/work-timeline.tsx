"use client";

// Timeline (Gantt): projects and their tasks as bars from start to due date, milestones as diamonds, dependencies as
// arrows and the critical path (the longest chain of blocked work) outlined. Drag a bar to move it; drag its right
// edge to change the due date.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/app/primitives";
import { saveTaskAction } from "@/app/actions/departments";
import type { Project, Task } from "@/server/work";
import type { WorkDept } from "@/lib/work";
import { statusOf, type DeptConfig } from "@/lib/dept-config";
import { cn } from "@/lib/utils";
import { canEditTask, taskInput, today, type Access } from "./work-shared";

const DAY = 864e5;
const ROW = 34;
const ZOOMS = { week: 36, month: 14, quarter: 5 } as const;
type Zoom = keyof typeof ZOOMS;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Start and end of a task's bar: its dates, or one day around whichever date it has.
function span(t: Task): [string, string] | null {
  const s = t.start_date ?? t.due_date;
  const e = t.due_date ?? t.start_date;
  if (!s || !e) return null;
  return s <= e ? [s, e] : [e, s];
}

// The longest chain through the dependencies, by days of work: delaying any of these delays the end.
function criticalPath(tasks: Task[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const len = (t: Task) => {
    const s = span(t);
    return s ? Math.max(1, Math.round((toMs(s[1]) - toMs(s[0])) / DAY) + 1) : 0;
  };
  const memo = new Map<string, { total: number; chain: string[] }>();
  const walk = (id: string, seen: Set<string>): { total: number; chain: string[] } => {
    if (memo.has(id)) return memo.get(id)!;
    const t = byId.get(id);
    if (!t || seen.has(id)) return { total: 0, chain: [] };
    seen.add(id);
    let best = { total: 0, chain: [] as string[] };
    for (const b of t.blocked_by) {
      const r = walk(b, seen);
      if (r.total > best.total) best = r;
    }
    seen.delete(id);
    const out = { total: best.total + len(t), chain: [...best.chain, id] };
    memo.set(id, out);
    return out;
  };
  let top = { total: 0, chain: [] as string[] };
  for (const t of tasks) {
    const r = walk(t.id, new Set());
    if (r.total > top.total) top = r;
  }
  return new Set(top.chain.length > 1 ? top.chain : []);
}

export function TimelineView({ dept, config, tasks, projects, access, viewerId, onOpen }: { dept: WorkDept; config: DeptConfig; tasks: Task[]; projects: Project[]; access: Access; viewerId: string; onOpen: (t: Task) => void }) {
  const router = useRouter();
  const [zoom, setZoom] = React.useState<Zoom>("month");
  const [showDone, setShowDone] = React.useState(true);
  const [drag, setDrag] = React.useState<{ id: string; mode: "move" | "end"; x0: number; delta: number } | null>(null);
  const px = ZOOMS[zoom];
  const scheduled = tasks.filter((t) => span(t) && (showDone || t.status_category !== "done") && t.status_category !== "cancelled");
  const unscheduled = tasks.filter((t) => !span(t) && t.status_category !== "cancelled" && t.status_category !== "done").length;
  const critical = React.useMemo(() => criticalPath(scheduled), [scheduled]);

  const dates = [
    ...scheduled.flatMap((t) => span(t)!),
    ...projects.flatMap((p) => [p.start_date, p.due_date, ...p.milestones.map((m) => m.due_date)].filter((x): x is string => !!x)),
    today(),
  ];
  const min = toMs(dates.reduce((a, b) => (a < b ? a : b))) - 7 * DAY;
  const max = toMs(dates.reduce((a, b) => (a > b ? a : b))) + 14 * DAY;
  const days = Math.round((max - min) / DAY) + 1;
  const x = (d: string) => Math.round(((toMs(d) - min) / DAY) * px);
  const width = days * px;

  // Rows: each project with its tasks, then tasks without a project.
  type Row = { kind: "project"; p: Project } | { kind: "task"; t: Task } | { kind: "loose" };
  const rows: Row[] = [];
  for (const p of projects) {
    const list = scheduled.filter((t) => t.project_id === p.id);
    if (!list.length && !p.start_date && !p.due_date && !p.milestones.some((m) => m.due_date)) continue;
    rows.push({ kind: "project", p });
    list.sort((a, b) => span(a)![0].localeCompare(span(b)![0])).forEach((t) => rows.push({ kind: "task", t }));
  }
  const loose = scheduled.filter((t) => !t.project_id || !projects.some((p) => p.id === t.project_id)).sort((a, b) => span(a)![0].localeCompare(span(b)![0]));
  if (loose.length) {
    rows.push({ kind: "loose" });
    loose.forEach((t) => rows.push({ kind: "task", t }));
  }
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => r.kind === "task" && rowOf.set(r.t.id, i));

  // Ticks: every day in week zoom, Mondays in month zoom, first of the month in quarter zoom.
  const ticks: { d: string; label: string; strong: boolean }[] = [];
  for (let ms = min; ms <= max; ms += DAY) {
    const d = toDay(ms);
    const dt = new Date(ms);
    const first = dt.getUTCDate() === 1;
    if (zoom === "week" || (zoom === "month" && dt.getUTCDay() === 1) || (zoom === "quarter" && first))
      ticks.push({ d, label: zoom === "quarter" || first ? dt.toLocaleDateString("en-GB", { month: "short", day: zoom === "quarter" ? undefined : "numeric", timeZone: "UTC" }) : String(dt.getUTCDate()), strong: first });
  }

  const shifted = (t: Task): [string, string] => {
    const [s, e] = span(t)!;
    if (drag?.id !== t.id) return [s, e];
    const dd = Math.round(drag.delta / px);
    if (drag.mode === "move") return [toDay(toMs(s) + dd * DAY), toDay(toMs(e) + dd * DAY)];
    const end = toDay(Math.max(toMs(s), toMs(e) + dd * DAY));
    return [s, end];
  };
  const finish = async (t: Task) => {
    if (!drag) return;
    const dd = Math.round(drag.delta / px);
    const [s, e] = shifted(t);
    setDrag(null);
    if (!dd) return onOpen(t);
    const r = await saveTaskAction(dept, taskInput(t, { startDate: t.start_date || drag.mode === "move" ? s : t.start_date, dueDate: e }));
    if (!r.ok) return toast.error(r.error);
    toast.success(`${t.code}: ${s === e ? e : `${s} to ${e}`}`);
    router.refresh();
  };

  if (!rows.length)
    return <EmptyState title="Nothing scheduled" description={`Give ${config.names.tasks.toLowerCase()} a start or due date to see them on the timeline.${unscheduled ? ` ${unscheduled} open without dates.` : ""}`} />;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Select value={zoom} onValueChange={(v) => setZoom(v as Zoom)}>
          <SelectTrigger size="sm" className="h-8 w-32 text-xs" aria-label="Zoom">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Days</SelectItem>
            <SelectItem value="month">Weeks</SelectItem>
            <SelectItem value="quarter">Months</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={showDone} onCheckedChange={setShowDone} /> Show done
        </label>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="inline-block h-2.5 w-5 rounded-sm ring-2 ring-red-500 ring-offset-1" /> Critical path
        </span>
        {unscheduled > 0 && <span className="text-xs text-muted-foreground">{unscheduled} open without dates are not shown</span>}
        <span className="ml-auto text-xs text-muted-foreground">Drag a bar to move it; drag its right edge to change the due date.</span>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <div className="relative" style={{ width: width + 260, minWidth: "100%" }}>
          {/* Scale */}
          <div className="sticky top-0 z-10 flex h-8 border-b bg-muted/60 text-[10px] text-muted-foreground">
            <div className="sticky left-0 z-20 w-[260px] shrink-0 border-r bg-muted px-2 py-2 font-medium">{config.names.project} / {config.names.task}</div>
            <div className="relative" style={{ width }}>
              {ticks.map((tk) => (
                <span key={tk.d} className={cn("absolute top-0 h-full border-l pl-0.5 pt-2", tk.strong && "border-foreground/30 font-medium text-foreground")} style={{ left: x(tk.d) }}>
                  {tk.label}
                </span>
              ))}
            </div>
          </div>
          {/* Rows */}
          <div className="relative">
            <div className="pointer-events-none absolute top-0 bottom-0 z-[1] border-l-2 border-primary/70" style={{ left: 260 + x(today()) }} title="Today" />
            {rows.map((r, i) => {
              if (r.kind === "project" || r.kind === "loose") {
                const p = r.kind === "project" ? r.p : null;
                return (
                  <div key={p?.id ?? "loose"} className="flex border-b bg-muted/30" style={{ height: ROW }}>
                    <div className="sticky left-0 z-[2] flex w-[260px] shrink-0 items-center gap-1.5 truncate border-r bg-muted/70 px-2 text-xs font-semibold">
                      {p ? (
                        <>
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color ?? "#7b68ee" }} />
                          <span className="font-mono text-muted-foreground">{p.key}</span> <span className="truncate">{p.name}</span>
                        </>
                      ) : (
                        `No ${config.names.project.toLowerCase()}`
                      )}
                    </div>
                    <div className="relative" style={{ width }}>
                      {p?.start_date && p.due_date && (
                        <div className="absolute top-[13px] h-2 rounded-full opacity-40" style={{ left: x(p.start_date), width: Math.max(px, x(p.due_date) - x(p.start_date) + px), background: p.color ?? "#7b68ee" }} title={`${p.name}: ${p.start_date} to ${p.due_date}`} />
                      )}
                      {p?.milestones
                        .filter((m) => m.due_date)
                        .map((m) => (
                          <span
                            key={m.id}
                            className={cn("absolute top-[10px] size-3 rotate-45 border-2", m.status === "done" ? "border-emerald-600 bg-emerald-500" : "border-amber-600 bg-amber-400")}
                            style={{ left: x(m.due_date!) + px / 2 - 6 }}
                            title={`${m.name}: ${m.due_date}${m.status === "done" ? " (done)" : ""}`}
                          />
                        ))}
                    </div>
                  </div>
                );
              }
              const t = r.t;
              const [s, e] = shifted(t);
              const status = statusOf(config, t.status);
              const left = x(s);
              const w = Math.max(px, x(e) - x(s) + px);
              const editable = canEditTask(access, t, viewerId);
              const late = t.due_date && t.due_date < today() && t.status_category !== "done";
              return (
                <div key={t.id} className="flex border-b hover:bg-muted/20" style={{ height: ROW }}>
                  <button type="button" onClick={() => onOpen(t)} className="sticky left-0 z-[2] flex w-[260px] shrink-0 items-center gap-1.5 truncate border-r bg-background px-2 pl-5 text-left text-xs hover:underline">
                    <span className="font-mono text-[10px] text-muted-foreground">{t.code}</span>
                    <span className={cn("truncate", t.status_category === "done" && "text-muted-foreground line-through")}>{t.title}</span>
                  </button>
                  <div className="relative" style={{ width }}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${t.code} ${t.title}, ${s} to ${e}`}
                      onKeyDown={(ev) => ev.key === "Enter" && onOpen(t)}
                      onPointerDown={(ev) => {
                        if (!editable) return;
                        (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
                        const mode = ev.nativeEvent.offsetX > w - 8 ? "end" : "move";
                        setDrag({ id: t.id, mode, x0: ev.clientX, delta: 0 });
                      }}
                      onPointerMove={(ev) => drag?.id === t.id && setDrag({ ...drag, delta: ev.clientX - drag.x0 })}
                      onPointerUp={() => (drag?.id === t.id ? finish(t) : onOpen(t))}
                      className={cn(
                        "absolute top-[7px] flex h-5 items-center overflow-hidden rounded px-1.5 text-[10px] font-medium text-white shadow-sm select-none",
                        editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                        critical.has(t.id) && "ring-2 ring-red-500 ring-offset-1",
                        late && "outline-dashed outline-1 outline-red-500",
                      )}
                      style={{ left, width: w, background: status?.color ?? "#64748b", opacity: t.status_category === "done" ? 0.55 : 1 }}
                      title={`${t.code} ${t.title}\n${s} to ${e}${t.assignee_name ? `\n${t.assignee_name}` : ""}`}
                    >
                      <span className="truncate">{w > 60 ? (t.assignee_name ?? t.title) : ""}</span>
                      {editable && <span className="absolute top-0 right-0 h-full w-2 cursor-ew-resize bg-black/20" />}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Dependency arrows */}
            <svg className="pointer-events-none absolute top-0 left-[260px] z-[3]" width={width} height={rows.length * ROW} aria-hidden>
              <defs>
                <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" fill="currentColor" className="text-muted-foreground" />
                </marker>
              </defs>
              {scheduled.flatMap((t) =>
                t.blocked_by
                  .filter((b) => rowOf.has(b) && rowOf.has(t.id))
                  .map((b) => {
                    const from = scheduled.find((x2) => x2.id === b)!;
                    const [, fe] = shifted(from);
                    const [ts] = shifted(t);
                    const x1 = x(fe) + px;
                    const y1 = rowOf.get(b)! * ROW + ROW / 2;
                    const x2 = x(ts);
                    const y2 = rowOf.get(t.id)! * ROW + ROW / 2;
                    const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 8));
                    return (
                      <path
                        key={`${b}-${t.id}`}
                        d={`M${x1},${y1} H${mid} V${y2} H${x2}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={critical.has(b) && critical.has(t.id) ? 2 : 1.2}
                        className={critical.has(b) && critical.has(t.id) ? "text-red-500" : x2 < x1 ? "text-amber-500" : "text-muted-foreground"}
                        markerEnd="url(#arrow)"
                      />
                    );
                  }),
              )}
            </svg>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">An amber arrow means a {config.names.task.toLowerCase()} starts before the one it waits for ends.</p>
    </div>
  );
}
