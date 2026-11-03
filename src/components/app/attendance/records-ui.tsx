"use client";

// HR and Admin keep attendance by hand: log a missed check-in, change a check-in's time, remove one, clear days; and
// the employee rules with the written text everyone confirms. Server: src/server/attendance-admin.ts.
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EraserIcon, Loader2Icon, MegaphoneIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import * as A from "@/app/actions/attendance";
import { KIND_LABELS, EVENT_KINDS, type EventKind } from "@/lib/attendance";
import type { AttendanceRules, EditorEvent } from "@/server/attendance-admin";
import { cn } from "@/lib/utils";

type Res = { ok: boolean; error?: string; data?: unknown };
function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const act = async (fn: () => Promise<Res>, done: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Something went wrong.");
    toast.success(done);
    router.refresh();
    return r.data ?? true;
  };
  return { act, busy };
}

const select = "h-9 rounded-md border bg-background px-2 text-sm";

export function RecordsPanel({ people, employeeId, day, events, today }: { people: { id: string; name: string; code: string }[]; employeeId: string | null; day: string; events: EditorEvent[] | null; today: string }) {
  const router = useRouter();
  const { act, busy } = useAct();
  const open = (emp: string | null, d: string) => router.push(`/attendance?tab=records&day=${d}${emp ? `&emp=${emp}` : ""}`);
  const [add, setAdd] = React.useState<{ kind: EventKind; time: string; note: string }>({ kind: "in", time: "08:30", note: "" });
  const [edit, setEdit] = React.useState<{ id: string; time: string; note: string } | null>(null);
  const [clear, setClear] = React.useState({ who: employeeId ?? "", from: day, to: day, note: "" });
  const person = people.find((p) => p.id === employeeId);
  return (
    <div className="space-y-4" data-att-records>
      <Card>
        <CardHeader>
          <CardTitle>Edit check-ins</CardTitle>
          <CardDescription>Log a check-in someone missed, change a time or remove a wrong one. Each change needs a reason; the person is told and the old entry stays in the record, struck through.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="rec-emp">Employee</Label>
              <select id="rec-emp" className={cn(select, "w-64")} value={employeeId ?? ""} onChange={(e) => open(e.target.value || null, day)}>
                <option value="">Choose a person</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-day">Day</Label>
              <Input id="rec-day" type="date" max={today} className="w-44" value={day} onChange={(e) => e.target.value && open(employeeId, e.target.value)} />
            </div>
          </div>
          {person && events && (
            <>
              <div className="rounded-lg border">
                {events.length === 0 && <p className="p-3 text-muted-foreground">No check-ins on this day.</p>}
                {events.map((e) => (
                  <div key={e.id} className={cn("flex flex-wrap items-center gap-2 border-b p-2 last:border-b-0", e.voided && "text-muted-foreground")} data-rec-event={e.voided ? "voided" : "active"}>
                    <span className={cn("w-14 font-mono tabular-nums", e.voided && "line-through")}>{e.time}</span>
                    <span className={cn("w-36 capitalize", e.voided && "line-through")}>{KIND_LABELS[e.kind]}</span>
                    <span className="text-xs text-muted-foreground">{e.sourceLabel}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={e.note ?? ""}>
                      {e.note}
                    </span>
                    {!e.voided && edit?.id !== e.id && (
                      <>
                        <Button size="xs" variant="outline" onClick={() => setEdit({ id: e.id, time: e.time, note: "" })}>
                          <PencilIcon /> Change time
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            const note = window.prompt("Why is this check-in removed?");
                            if (note) void act(() => A.removeEventAction(e.id, note), "Removed");
                          }}
                        >
                          <Trash2Icon /> Remove
                        </Button>
                      </>
                    )}
                    {edit?.id === e.id && (
                      <div className="flex w-full flex-wrap items-center gap-2">
                        <Input aria-label="New time" type="time" className="w-32" value={edit.time} onChange={(x) => setEdit({ ...edit, time: x.target.value })} />
                        <Input aria-label="Reason for the change" placeholder="Reason" className="w-64" value={edit.note} onChange={(x) => setEdit({ ...edit, note: x.target.value })} />
                        <Button size="xs" disabled={busy || !edit.note.trim()} onClick={async () => (await act(() => A.editEventAction(edit.id, { time: edit.time, note: edit.note }), "Time changed")) && setEdit(null)}>
                          Save
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setEdit(null)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2" data-rec-add>
                <select aria-label="What to log" className={select} value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value as EventKind })}>
                  {EVENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                <Input aria-label="Time" type="time" className="w-32" value={add.time} onChange={(e) => setAdd({ ...add, time: e.target.value })} />
                <Input aria-label="Reason" placeholder='Reason, e.g. "kiosk was down"' className="w-72" value={add.note} onChange={(e) => setAdd({ ...add, note: e.target.value })} />
                <Button size="sm" disabled={busy || !add.note.trim()} onClick={async () => (await act(() => A.logEventAction({ employeeId: person.id, day, kind: add.kind, time: add.time, note: add.note }), `Logged for ${person.name}`)) && setAdd({ ...add, note: "" })}>
                  <PlusIcon /> Log it
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clear attendance</CardTitle>
          <CardDescription>Removes the check-ins and hand-made day records in the range, for one person or everyone (for example test check-ins before going live). The days then count from nothing.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2 text-sm" data-rec-clear>
          <select aria-label="Whose attendance" className={cn(select, "w-56")} value={clear.who} onChange={(e) => setClear({ ...clear, who: e.target.value })}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Input aria-label="From" type="date" className="w-40" value={clear.from} onChange={(e) => setClear({ ...clear, from: e.target.value })} />
          <Input aria-label="To" type="date" className="w-40" value={clear.to} onChange={(e) => setClear({ ...clear, to: e.target.value })} />
          <Input aria-label="Reason for clearing" placeholder="Reason" className="w-64" value={clear.note} onChange={(e) => setClear({ ...clear, note: e.target.value })} />
          <Button
            size="sm"
            variant="destructive"
            disabled={busy || !clear.note.trim()}
            onClick={() => {
              const who = clear.who ? people.find((p) => p.id === clear.who)?.name : "everyone";
              if (!window.confirm(`Clear ${who}'s attendance from ${clear.from} to ${clear.to}?`)) return;
              void act(() => A.clearAttendanceAction({ employeeId: clear.who || null, from: clear.from, to: clear.to, note: clear.note }), "Cleared");
            }}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <EraserIcon />} Clear
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function EmployeeRules({ rules, text, published }: { rules: AttendanceRules; text: string; published: boolean }) {
  const { act, busy } = useAct();
  const [r, setR] = React.useState(rules);
  const [t, setT] = React.useState(text);
  React.useEffect(() => setT(text), [text]);
  const num = (k: keyof AttendanceRules, label: string, hint: string, step = 1) => (
    <div className="space-y-1">
      <Label htmlFor={`ar-${k}`}>{label}</Label>
      <Input id={`ar-${k}`} type="number" min={0} step={step} value={Number(r[k])} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-2" data-att-rules>
      <Card>
        <CardHeader>
          <CardTitle>Rules for employees</CardTitle>
          <CardDescription>What happens after repeated lateness or absence, and limits on corrections. Shifts, grace time and overtime are under Shifts and settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            {num("lateWarnAfter", "Warn after late days", "In a month; the person and HR are told. 0: off.")}
            {num("absentWarnAfter", "Warn after absent days", "Without leave, in a month. 0: off.")}
            {num("latesPerDeduction", "Pay deducted every … late days", "0: no deduction for lateness.")}
            {num("deductionDays", "Days of pay deducted", "Each time, taken in payroll with the unpaid days.", 0.25)}
            {num("maxCorrections", "Corrections a month", "Per person. 0: no limit.")}
            {num("absenceNoticeHours", "Notice for absence (hours)", "Before the shift; shown in the written rules.")}
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={r.remindMissingOut} onChange={(e) => setR({ ...r, remindMissingOut: e.target.checked })} /> Remind people the next morning when they did not check out
          </label>
          <Button disabled={busy} onClick={() => act(() => A.saveAttendanceRulesAction(r), "Rules saved")}>
            Save rules
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>The written rules</CardTitle>
          <CardDescription>Written from the shifts and the rules. Change the wording if needed, then publish: everyone is asked to read and confirm it (Announcements).{published && " Published before; publishing again asks everyone to confirm the new text."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea aria-label="Attendance rules text" className="min-h-96 font-mono text-xs" value={t} onChange={(e) => setT(e.target.value)} />
          <Button disabled={busy || !t.trim()} onClick={() => act(() => A.publishRulesAction(t), "Published; everyone is asked to confirm")}>
            <MegaphoneIcon /> Publish to everyone
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
