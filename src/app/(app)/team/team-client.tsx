"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/app/slider";
import { Combobox } from "@/components/app/multi-select";
import { StatusPill } from "@/components/app/status-pill";
import { decideCorrectionAction, deleteLeaveAction, saveLeaveAction } from "@/app/actions/admin";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";
import { fmtDateTime, fmtNum } from "@/lib/format";
import type { CapacityData } from "@/server/capacity";
import { cn } from "@/lib/utils";

export function ScenarioPlanner({ data }: { data: CapacityData }) {
  const baseVolume = Math.max(1, Math.round(data.arrivalsPerWeek));
  const [volume, setVolume] = React.useState(baseVolume);
  const [clearWeeks, setClearWeeks] = React.useState(4);
  const [hoursPerPerson, setHoursPerPerson] = React.useState(28);
  const [added, setAdded] = React.useState<Record<Stage, number>>({ recording: 0, editing: 0, uploading: 0, publication: 0 });
  const [estimates, setEstimates] = React.useState<Record<Stage, number>>(
    Object.fromEntries(data.stages.map((s) => [s.stage, Math.round((s.laborPerItem ?? { recording: 3, editing: 6, uploading: 1.5, publication: 1 }[s.stage]) * 10) / 10])) as Record<Stage, number>,
  );

  const rows = data.stages.map((s) => {
    const perItem = estimates[s.stage];
    const demand = volume * perItem + (s.backlog * perItem) / clearWeeks;
    const available = s.availableWeek + added[s.stage] * hoursPerPerson;
    const gap = demand - available;
    const people = gap > 0 ? Math.ceil(gap / hoursPerPerson) : 0;
    const throughput = perItem > 0 ? available / perItem : 0;
    const backlogChange = volume - throughput;
    return { ...s, perItem, demand, available, gap, people, throughput, backlogChange };
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-xl border bg-muted/30 p-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label>Target items per week: {volume}</Label>
          <Slider min={0} max={Math.max(40, baseVolume * 3)} value={volume} onChange={setVolume} />
          <p className="text-xs text-muted-foreground">Recent arrivals: {fmtNum(data.arrivalsPerWeek, 1)} per week. {data.plannedNext4} drafts are due in the next 4 weeks.</p>
        </div>
        <div className="space-y-2">
          <Label>Clear current backlog in: {clearWeeks} weeks</Label>
          <Slider min={1} max={12} value={clearWeeks} onChange={setClearWeeks} />
        </div>
        <div className="space-y-2">
          <Label>Production hours per added person: {hoursPerPerson}</Label>
          <Slider min={10} max={40} value={hoursPerPerson} onChange={setHoursPerPerson} />
          <p className="text-xs text-muted-foreground">Not every paid hour is production time.</p>
        </div>
        <div className="space-y-2">
          <Label>Labor hours per item (editable)</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {STAGES.map((st) => (
              <label key={st} className="flex items-center gap-1 text-xs">
                <span className="w-16 truncate">{STAGE_LABELS[st]}</span>
                <Input type="number" step="0.5" min={0} className="h-7 w-16 text-xs" value={estimates[st]} onChange={(e) => setEstimates((x) => ({ ...x, [st]: Number(e.target.value) }))} />
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Stage</th>
              <th className="px-3 py-2 text-right font-medium">Labor per item</th>
              <th className="px-3 py-2 text-right font-medium">Backlog</th>
              <th className="px-3 py-2 text-right font-medium">Demand h/week</th>
              <th className="px-3 py-2 text-right font-medium">Available h/week</th>
              <th className="px-3 py-2 text-right font-medium">Gap</th>
              <th className="px-3 py-2 text-right font-medium">Added people</th>
              <th className="px-3 py-2 text-right font-medium">Backlog change/week</th>
              <th className="px-3 py-2 text-left font-medium">Reading</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stage} className="border-t">
                <td className="px-3 py-2 font-medium">{STAGE_LABELS[r.stage]}</td>
                <td className="px-3 py-2 text-right tabular">
                  {r.perItem}h
                  <span className="block text-[11px] text-muted-foreground">{r.sample >= data.minSample ? `observed, n = ${r.sample}` : "estimate, insufficient data"}</span>
                </td>
                <td className="px-3 py-2 text-right tabular">{r.backlog}</td>
                <td className="px-3 py-2 text-right tabular">{fmtNum(r.demand, 1)}</td>
                <td className="px-3 py-2 text-right tabular">
                  {fmtNum(r.available, 1)}
                  <span className="block text-[11px] text-muted-foreground">{r.people} people</span>
                </td>
                <td className={cn("px-3 py-2 text-right font-medium tabular", r.gap > 0 ? "text-[var(--st-blocked-fg)]" : "text-[var(--st-done-fg)]")}>{r.gap > 0 ? `+${fmtNum(r.gap, 1)}h short` : `${fmtNum(-r.gap, 1)}h spare`}</td>
                <td className="px-3 py-2 text-right">
                  <Input type="number" min={0} max={10} className="ml-auto h-7 w-16 text-right text-xs" value={added[r.stage]} onChange={(e) => setAdded((x) => ({ ...x, [r.stage]: Math.max(0, Number(e.target.value)) }))} aria-label={`Added people in ${STAGE_LABELS[r.stage]}`} />
                  {r.people > 0 && <span className="block text-[11px] text-muted-foreground">about {r.people} to close the gap</span>}
                </td>
                <td className={cn("px-3 py-2 text-right tabular", r.backlogChange > 0 ? "text-[var(--st-blocked-fg)]" : "text-[var(--st-done-fg)]")}>
                  {r.backlogChange > 0 ? "+" : ""}
                  {fmtNum(r.backlogChange, 1)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.waiting > r.backlog / 2 && r.backlog > 2
                    ? "Most items are waiting for acceptance; adding staff here may not help."
                    : r.blocked > r.backlog / 3 && r.backlog > 2
                      ? "A large share is blocked; resolve causes before hiring."
                      : r.gap > 0
                        ? "Demand exceeds capacity at this target."
                        : "Capacity covers this target."}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Gap = demand hours minus available production hours after leave. Added people = gap divided by realistic hours per person, rounded up. This is a scenario, not a hiring
        decision: skills, ramp-up time and the real cause of delays (for example waiting for raw footage or approval) matter more than headcount.
      </p>
    </div>
  );
}

export function Corrections({ rows, names, tz, isManager }: { rows: CapacityData["corrections"]; names: Record<string, string>; tz: string; isManager: boolean }) {
  const router = useRouter();
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No timer corrections requested.</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {rows.map((c) => (
        <li key={c.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1 text-sm">
            <p>
              <span className="font-medium">{names[c.requested_by]}</span> on{" "}
              <Link href={`/items/${c.item_id}?tab=workflow`} className="font-mono text-xs text-primary hover:underline">
                {c.code}
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              Recorded {fmtDateTime(c.started_at, tz)} to {fmtDateTime(c.ended_at, tz)}; proposed {fmtDateTime(c.proposed_started_at, tz)} to {fmtDateTime(c.proposed_ended_at, tz)}
            </p>
            <p className="text-xs">Reason: {c.reason}</p>
          </div>
          {c.status === "pending" && isManager ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  const r = await decideCorrectionAction(c.id, true);
                  if (!r.ok) return toast.error(r.error);
                  toast.success("Correction approved; the original times stay in the history");
                  router.refresh();
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const r = await decideCorrectionAction(c.id, false);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              >
                Reject
              </Button>
            </div>
          ) : (
            <StatusPill size="xs" tone={c.status === "approved" ? "done" : c.status === "rejected" ? "neutral" : "paused"} label={c.status} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function LeaveManager({ leave, users, names, viewerId, isManager }: { leave: CapacityData["leave"]; users: { id: string; name: string }[]; names: Record<string, string>; viewerId: string; isManager: boolean }) {
  const router = useRouter();
  const [f, setF] = React.useState({ userId: viewerId, from: "", to: "", note: "" });
  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_150px_150px_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">Person</Label>
          {isManager ? <Combobox size="sm" options={users.map((u) => ({ value: u.id, label: u.name }))} value={f.userId} onChange={(v) => setF({ ...f, userId: v ?? viewerId })} allowClear={false} /> : <p className="text-sm">{names[viewerId]}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Note</Label>
          <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="h-8" placeholder="Annual leave, training" />
        </div>
        <Button
          size="sm"
          onClick={async () => {
            const r = await saveLeaveAction({ userId: f.userId, startsOn: f.from, endsOn: f.to || f.from, note: f.note });
            if (!r.ok) return toast.error(r.error);
            toast.success("Leave recorded; capacity updated");
            setF({ ...f, from: "", to: "", note: "" });
            router.refresh();
          }}
        >
          Add leave
        </Button>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {leave.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No upcoming leave.</li>}
        {leave.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-40 truncate font-medium">{names[l.user_id]}</span>
            <span className="tabular">
              {l.starts_on} to {l.ends_on}
            </span>
            <span className="flex-1 truncate text-muted-foreground">{l.note}</span>
            {(isManager || l.user_id === viewerId) && (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Remove leave"
                onClick={async () => {
                  await deleteLeaveAction(l.id);
                  router.refresh();
                }}
              >
                <Trash2Icon />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
