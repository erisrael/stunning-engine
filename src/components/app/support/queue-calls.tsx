"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PhoneIncomingIcon, PlusIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import * as A from "@/app/actions/support-ivr";
import { DAY_NAMES, PRIORITY_WHEN, hoursLabel, type PriorityRule, type QueueSettings } from "@/lib/support-queues";

// Support › Queues and replies › Call settings, and Support › Live queues (Update 1.2, Phase 9).

const select = "h-8 w-full rounded-md border bg-background px-2 text-sm";
const secs = (s: number | null) => (s === null ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim());

export function QueueCallSettings({ queues, departments, agents }: { queues: QueueSettings[]; departments: { key: string; label: string }[]; agents: { id: string; name: string; skills: string[] }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState<QueueSettings | null>(null);
  const [skills, setSkills] = React.useState<Record<string, string>>(Object.fromEntries(agents.map((a) => [a.id, a.skills.join(", ")])));
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    if (!open) return;
    setBusy(true);
    const { id, name: _n, ...rest } = open;
    const r = await A.saveQueueSettingsAction(id, rest);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Call settings saved");
    setOpen(null);
    router.refresh();
  };
  const set = (p: Partial<QueueSettings>) => open && setOpen({ ...open, ...p });
  const h = open?.activeHours;
  return (
    <Card data-queue-call-settings>
      <CardHeader>
        <CardTitle className="text-base">Call settings by queue</CardTitle>
        <CardDescription>When each queue takes calls, how many may wait and for how long, where calls go when it is closed or full, who is offered a call first, and who waits less.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {queues.map((q) => (
          <div key={q.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2" data-queue-calls={q.name}>
            <span className="font-medium">{q.name}</span>
            <span className="text-xs text-muted-foreground">
              {hoursLabel(q.activeHours)} · {q.maxSize ? `up to ${q.maxSize} waiting` : "no size limit"} · {q.maxWaitS ? `waits up to ${secs(q.maxWaitS)}` : "waits the default ring time"}
              {q.overflowQueue ? ` · overflows to ${queues.find((x) => x.id === q.overflowQueue)?.name ?? "another queue"}` : ""}
              {q.wrapUpS ? ` · ${q.wrapUpS} s wrap-up` : ""}
              {q.department ? ` · ${departments.find((d) => d.key === q.department)?.label ?? q.department}` : ""}
            </span>
            <Button size="xs" variant="outline" className="ml-auto" onClick={() => setOpen(q)}>
              Call settings
            </Button>
          </div>
        ))}
        {open && (
          <div className="space-y-3 rounded-lg border border-primary/30 p-3" data-queue-call-form>
            <p className="font-medium">{open.name}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="qc-dept">Department</Label>
                <select id="qc-dept" className={select} value={open.department ?? ""} onChange={(e) => set({ department: e.target.value || null })}>
                  <option value="">None</option>
                  {departments.map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="qc-over">When closed or full, send calls to</Label>
                <select id="qc-over" className={select} value={open.overflowQueue ?? ""} onChange={(e) => set({ overflowQueue: e.target.value || null })}>
                  <option value="">Nowhere: offer a call-back</option>
                  {queues.filter((x) => x.id !== open.id).map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="qc-size">Most callers waiting (empty: no limit)</Label>
                <Input id="qc-size" type="number" min={1} value={open.maxSize ?? ""} onChange={(e) => set({ maxSize: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="qc-wait">Longest wait in seconds (empty: the ring time)</Label>
                <Input id="qc-wait" type="number" min={15} value={open.maxWaitS ?? ""} onChange={(e) => set({ maxWaitS: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="qc-wrap">Wrap-up after a call (seconds)</Label>
                <Input id="qc-wrap" type="number" min={0} max={600} value={open.wrapUpS} onChange={(e) => set({ wrapUpS: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="qc-sl">Service level: answered within (seconds)</Label>
                <Input id="qc-sl" type="number" min={5} max={600} value={open.slSeconds} onChange={(e) => set({ slSeconds: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={!!h} onCheckedChange={(v) => set({ activeHours: v ? { days: [1, 2, 3, 4, 5], from: "08:30", to: "17:30" } : null })} data-qc-hours /> Takes calls only at set hours (Addis Ababa time)
              </label>
              {h && (
                <div className="flex flex-wrap items-center gap-1">
                  {DAY_NAMES.map((d, i) => (
                    <Button key={d} size="xs" variant={h.days.includes(i) ? "default" : "outline"} onClick={() => set({ activeHours: { ...h, days: h.days.includes(i) ? h.days.filter((x) => x !== i) : [...h.days, i].sort() } })}>
                      {d}
                    </Button>
                  ))}
                  <Input aria-label="Opens" type="time" className="h-7 w-28" value={h.from} onChange={(e) => set({ activeHours: { ...h, from: e.target.value } })} />
                  <Input aria-label="Closes" type="time" className="h-7 w-28" value={h.to} onChange={(e) => set({ activeHours: { ...h, to: e.target.value } })} />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="qc-ann">Announcement for callers waiting</Label>
              <Input id="qc-ann" placeholder="e.g. Payments made today can take an hour to show." value={open.announcement ?? ""} onChange={(e) => set({ announcement: e.target.value || null })} />
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2"><Switch checked={open.music} onCheckedChange={(v) => set({ music: v })} /> Hold music</label>
              <label className="flex items-center gap-2"><Switch checked={open.callbackOffer} onCheckedChange={(v) => set({ callbackOffer: v })} /> Offer a call-back while waiting</label>
              <label className="flex items-center gap-2"><Switch checked={open.autoAssign} onCheckedChange={(v) => set({ autoAssign: v })} /> Give out conversations automatically</label>
              <label className="flex items-center gap-2"><Switch checked={open.acceptRequired} onCheckedChange={(v) => set({ acceptRequired: v })} data-qc-accept /> Agents accept or decline each conversation</label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="qc-skills">Skills a caller needs (for skill-based routing)</Label>
              <Input id="qc-skills" placeholder="e.g. amharic, billing" value={open.skills.join(", ")} onChange={(e) => set({ skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </div>
            <PriorityRules rules={open.priorityRules} onChange={(r) => set({ priorityRules: r })} />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => void save()} data-qc-save>Save call settings</Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
            </div>
          </div>
        )}
        {agents.length > 0 && (
          <details className="rounded-lg border p-2">
            <summary className="cursor-pointer text-sm font-medium">Agent skills</summary>
            <div className="mt-2 space-y-1">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 truncate text-xs">{a.name}</span>
                  <Input aria-label={`Skills of ${a.name}`} className="h-7" placeholder="e.g. amharic, billing" value={skills[a.id] ?? ""} onChange={(e) => setSkills({ ...skills, [a.id]: e.target.value })} />
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={async () => {
                      const r = await A.setAgentSkillsAction(a.id, (skills[a.id] ?? "").split(",").map((s) => s.trim()));
                      if (!r.ok) return void toast.error(r.error);
                      toast.success("Skills saved");
                    }}
                  >
                    Save
                  </Button>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function PriorityRules({ rules, onChange }: { rules: PriorityRule[]; onChange: (r: PriorityRule[]) => void }) {
  return (
    <div className="space-y-1" data-qc-priority>
      <Label className="text-xs">Callers who wait less (each match moves them up by its points)</Label>
      {rules.map((r, i) => {
        const def = PRIORITY_WHEN.find((w) => w.key === r.when);
        return (
          <div key={i} className="flex flex-wrap items-center gap-1">
            <select aria-label="When" className={cn(select, "w-auto")} value={r.when} onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, when: e.target.value as PriorityRule["when"] } : x)))}>
              {PRIORITY_WHEN.map((w) => (
                <option key={w.key} value={w.key}>{w.label}</option>
              ))}
            </select>
            {def?.needsValue && <Input aria-label="Value" className="h-8 w-32" value={r.value ?? ""} onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />}
            <Input aria-label="Points" type="number" min={1} max={100} className="h-8 w-20" value={r.boost} onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, boost: Number(e.target.value) } : x)))} />
            <Button size="icon-sm" variant="ghost" aria-label="Remove rule" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
              <XIcon />
            </Button>
          </div>
        );
      })}
      <Button size="xs" variant="outline" onClick={() => onChange([...rules, { when: "verified", boost: 1 }])}>
        <PlusIcon /> Add a rule
      </Button>
    </div>
  );
}

type Board = Awaited<ReturnType<typeof import("@/server/support-queues").queueBoard>>;
const STATE: Record<string, { label: string; cls: string }> = {
  available: { label: "Available", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  on_call: { label: "On a call", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  wrap_up: { label: "Wrapping up", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  away: { label: "Away", cls: "bg-muted text-muted-foreground" },
  busy: { label: "Busy", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
  break: { label: "Break", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  offline: { label: "Offline", cls: "bg-muted text-muted-foreground" },
};

// The supervisor's live board: refreshed every five seconds while open.
export function QueueBoard({ initial }: { initial: Board }) {
  const [b, setB] = React.useState(initial);
  const [at, setAt] = React.useState(() => new Date());
  const refresh = React.useCallback(async () => {
    const r = await A.queueBoardAction();
    if (r.ok && r.data) {
      setB(r.data);
      setAt(new Date());
    }
  }, []);
  React.useEffect(() => {
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
  }, [refresh]);
  const tile = (label: string, value: React.ReactNode, hint?: string) => (
    <div className="rounded-md border p-2" title={hint}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
  return (
    <div className="space-y-4" data-queue-board>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" suppressHydrationWarning>
        Today since {new Date(b.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (Addis Ababa midnight) · updated {at.toLocaleTimeString()}
        <Button size="xs" variant="ghost" onClick={() => void refresh()}>
          <RefreshCwIcon /> Refresh
        </Button>
      </div>
      {b.queues.length === 0 && <p className="text-sm text-muted-foreground">No active queues.</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {b.queues.map((q) => (
          <Card key={q.id} data-board-queue={q.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {q.name}
                <Badge variant={q.open ? "secondary" : "outline"}>{q.open ? "Open" : "Closed"}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {tile("Waiting", <span data-board-waiting>{q.waiting}</span>)}
                {tile("On calls", q.active)}
                {tile("Agents free", q.agentsAvailable)}
                {tile("Agents busy", q.agentsBusy)}
                {tile("Average wait", secs(q.avgWaitS))}
                {tile("Longest waiting", secs(q.longestWaitS))}
                {tile("Average talk", secs(q.avgHandleS))}
                {tile("Service level", q.serviceLevel === null ? "—" : `${q.serviceLevel}%`, `Answered within ${q.slSeconds} s, of calls answered, abandoned or missed`)}
                {tile("Completed", q.completed)}
                {tile("Abandoned", q.abandoned, "The caller hung up while waiting")}
                {tile("Missed", q.missed, "Nobody answered before the queue's longest wait")}
                {tile("Overflowed", q.overflowed)}
              </div>
              {q.callers.length > 0 && (
                <ul className="divide-y rounded-md border text-sm" data-board-callers>
                  {q.callers.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-2 py-1.5">
                      <PhoneIncomingIcon className="size-4 text-muted-foreground" />
                      <span className="font-medium">{c.customer}</span>
                      {c.priority > 0 && <Badge variant="outline">Priority {c.priority}</Badge>}
                      <span className="ml-auto text-xs text-muted-foreground">{secs(c.waitS)}{c.offeredTo ? ` · offered to ${c.offeredTo}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agents</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-board-agents>
            {b.agents.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className={cn("rounded px-1.5 py-0.5 text-xs", STATE[a.state]?.cls)}>{STATE[a.state]?.label ?? a.state}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
