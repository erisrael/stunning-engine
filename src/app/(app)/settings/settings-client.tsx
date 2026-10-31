"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  deleteLessonAction,
  runChecksAction,
  saveSettingsAction,
  setGradeSubjectAction,
  upsertGradeAction,
  upsertLessonAction,
  upsertSubjectAction,
  upsertUnitAction,
} from "@/app/actions/admin";
import type { Settings } from "@/server/settings";
import { NEXT_STAGE, PREV_STAGE, STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";
import { DEFAULT_TEAM_RULES, teamRules, type TeamRules } from "@/lib/team-rules";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function useSave<K extends keyof Settings>(key: K) {
  const router = useRouter();
  return async (value: Settings[K], msg = "Settings saved") => {
    const r = await saveSettingsAction(key, value);
    if (!r.ok) return toast.error(r.error), false;
    toast.success(msg);
    router.refresh();
    return true;
  };
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-b py-3 last:border-0 sm:grid-cols-[260px_1fr] sm:items-center sm:gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function WorkspaceSettings({ settings }: { settings: Settings }) {
  const [w, setW] = React.useState(settings.workspace);
  const [r, setR] = React.useState(settings.reporting);
  const save = useSave("workspace");
  const saveR = useSave("reporting");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Instants are stored in UTC; every screen and export shows them in this timezone.</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Workspace name"><Input value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Row>
          <Row label="Timezone" hint="IANA name, for example Africa/Addis_Ababa">
            <Input value={w.timezone} onChange={(e) => setW({ ...w, timezone: e.target.value })} />
          </Row>
          <Row label="Week starts on">
            <Select value={String(w.weekStartsOn)} onValueChange={(v) => setW({ ...w, weekStartsOn: Number(v) })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Item code prefix" hint="Readable codes look like MY-G08-MATH-U02-L04. Existing codes never change.">
            <Input value={w.codePrefix} onChange={(e) => setW({ ...w, codePrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className="w-32" />
          </Row>
          <Row label="Calendar display" hint="Ethiopian calendar display is reserved for a later release; stored instants are unaffected.">
            <Select value={w.calendarDisplay} onValueChange={(v) => setW({ ...w, calendarDisplay: v as "gregorian" })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gregorian">Gregorian, 24-hour</SelectItem>
                <SelectItem value="ethiopian" disabled>Ethiopian (planned)</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <div className="pt-3">
            <Button
              onClick={() => {
                try {
                  new Intl.DateTimeFormat("en", { timeZone: w.timezone });
                } catch {
                  return toast.error("That timezone is not recognised.");
                }
                save(w);
              }}
            >
              Save workspace
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Reporting</CardTitle>
          <CardDescription>Metrics with fewer observations than the minimum sample show as insufficient data.</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Default comparison window (weeks)"><Input type="number" min={1} max={26} value={r.comparisonWeeks} onChange={(e) => setR({ ...r, comparisonWeeks: Number(e.target.value) })} className="w-24" /></Row>
          <Row label="Minimum sample size"><Input type="number" min={1} value={r.minSample} onChange={(e) => setR({ ...r, minSample: Number(e.target.value) })} className="w-24" /></Row>
          <Row label="Queue aging bands (days)" hint="Three ascending boundaries used for backlog bars">
            <div className="flex gap-2">
              {r.agingBands.map((b, i) => (
                <Input key={i} type="number" min={1} value={b} onChange={(e) => setR({ ...r, agingBands: r.agingBands.map((x, j) => (j === i ? Number(e.target.value) : x)) })} className="w-20" />
              ))}
            </div>
          </Row>
          <div className="pt-3"><Button onClick={() => saveR(r)}>Save reporting</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function WorkflowSettings({ settings }: { settings: Settings }) {
  const [p, setP] = React.useState(settings.policies);
  const [c, setC] = React.useState(settings.checklists);
  const saveP = useSave("policies");
  const saveC = useSave("checklists");
  const policy = (k: keyof Settings["policies"], label: string, hint: string) => (
    <Row label={label} hint={hint}>
      <Switch checked={p[k]} onCheckedChange={(v) => setP({ ...p, [k]: v })} aria-label={label} />
    </Row>
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Handoff and approval policies</CardTitle>
          <CardDescription>These rules apply identically in the lesson page, sheet, board and bulk actions.</CardDescription>
        </CardHeader>
        <CardContent>
          {policy("captionsRequired", "Captions required before editing handoff", "Editing cannot submit without a captions file.")}
          {policy("thumbnailRequired", "Thumbnail required before editing handoff", "Editing cannot submit without a thumbnail.")}
          {policy("requirePlaybackCheck", "Playback verification required for upload", "Each required destination must have playback verified.")}
          {policy("allowSelfApproval", "Publication self-approval", "When on, a Publication reviewer may approve an item even if they did the last stage (Uploading) themselves; it is recorded as self-approval. When off, a different reviewer must approve.")}
          {policy("requireManagerApproval", "Require manager approval before release", "Adds a manager approval step to Publication. Not a sixth role.")}
          {policy("managerEmergencyRelease", "Manager emergency release", "Managers without the Publication role may confirm a release with a written reason. Always audited.")}
          {policy("autoPauseOtherSessions", "Auto-pause other timers on start", "When off, staff are asked before switching timers.")}
          <div className="pt-3"><Button onClick={() => saveP(p)}>Save policies</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Stage checklists</CardTitle>
          <CardDescription>
            Required items gate the handoff. Changing a checklist affects open and future attempts; completed attempts keep their recorded results. Standard and extra checklists, and lines the team lead
            verifies, are managed together on the <Link href="/checklists" className="text-primary hover:underline">Checklists</Link> page.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {STAGES.map((st) => (
            <div key={st} className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-semibold">{STAGE_LABELS[st]}</p>
              {c[st].map((item, i) => (
                <div key={item.key} className="flex items-center gap-1.5">
                  <Input value={item.label} onChange={(e) => setC({ ...c, [st]: c[st].map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="h-8 text-sm" aria-label="Checklist label" />
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <Checkbox checked={item.required} onCheckedChange={(v) => setC({ ...c, [st]: c[st].map((x, j) => (j === i ? { ...x, required: !!v } : x)) })} /> Required
                  </label>
                  <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => { const n = [...c[st]]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setC({ ...c, [st]: n }); }}><ArrowUpIcon /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={i === c[st].length - 1} onClick={() => { const n = [...c[st]]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setC({ ...c, [st]: n }); }}><ArrowDownIcon /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Remove" onClick={() => setC({ ...c, [st]: c[st].filter((_, j) => j !== i) })}><Trash2Icon /></Button>
                </div>
              ))}
              <Button size="xs" variant="outline" onClick={() => setC({ ...c, [st]: [...c[st], { key: `custom_${Date.now().toString(36)}`, label: "New check", required: false }] })}>
                <PlusIcon /> Add check
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 lg:col-span-2">
            <Button onClick={() => saveC(c, "Checklists saved")}>Save checklists</Button>
            <Button variant="outline" asChild>
              <Link href="/checklists">Open Checklists (extra checklists and lead verification)</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

// How each production team works: what reaches it, what it hands on, review, limits and its written procedure.
export function TeamSettings({ settings }: { settings: Settings }) {
  const [t, setT] = React.useState<Record<Stage, TeamRules>>(() => Object.fromEntries(STAGES.map((st) => [st, teamRules(settings.teams, st)])) as Record<Stage, TeamRules>);
  const save = useSave("teams");
  const set = (st: Stage, patch: Partial<TeamRules>) => setT({ ...t, [st]: { ...t[st], ...patch } });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every team works the same way: the lead assigns; team members start, fill in the card, mark done and send to the lead; the lead approves and hands over to the next team&apos;s lead, who
        accepts or marks missing and assigns. These rules tune that flow per team. Checklists are on the Workflow tab and the Checklists page.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {STAGES.map((st) => {
          const r = t[st];
          const prev = PREV_STAGE[st];
          const next = NEXT_STAGE[st];
          return (
            <Card key={st} data-team={st}>
              <CardHeader>
                <CardTitle>{STAGE_LABELS[st]}</CardTitle>
                <CardDescription>
                  {prev ? `Receives from ${STAGE_LABELS[prev]}` : "Starts the work"}
                  {next ? `, hands over to ${STAGE_LABELS[next]}.` : ", and publishes."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {prev && (
                  <Row label="Work the lead can assign" hint="What shows on Assign work for this team.">
                    <Select value={r.intake} onValueChange={(v) => set(st, { intake: v as TeamRules["intake"] })}>
                      <SelectTrigger className="w-full sm:w-80" aria-label={`${STAGE_LABELS[st]} intake`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="handed_over">Only parts {STAGE_LABELS[prev]} finished and handed over</SelectItem>
                        <SelectItem value="all">Every planned part (plan ahead)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Row>
                )}
                {next && (
                  <>
                    <Row label="Team lead review" hint="Members send finished work to the lead, who approves it or returns it with a note. Off: sending makes it ready for handover.">
                      <Switch checked={r.leadReview} onCheckedChange={(v) => set(st, { leadReview: v })} aria-label={`${STAGE_LABELS[st]} lead review`} />
                    </Row>
                    <Row label="What the lead hands over" hint="Work in progress or not started is never handed over.">
                      <Select value={r.handoverFrom} onValueChange={(v) => set(st, { handoverFrom: v as TeamRules["handoverFrom"] })}>
                        <SelectTrigger className="w-full sm:w-80" aria-label={`${STAGE_LABELS[st]} handover`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="approved">Only work the lead approved</SelectItem>
                          <SelectItem value="done">Anything the team marked done</SelectItem>
                        </SelectContent>
                      </Select>
                    </Row>
                  </>
                )}
                <Row label="Work in progress per person" hint="Most parts one person may have started and not yet marked done. 0: no limit.">
                  <Input type="number" min={0} max={50} className="w-24" value={r.wipLimit} onChange={(e) => set(st, { wipLimit: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} aria-label={`${STAGE_LABELS[st]} limit`} />
                </Row>
                {prev && (
                  <Row label="Days to finish" hint="Sets the team's due date when work arrives, if none is set. 0: none.">
                    <Input type="number" min={0} max={60} className="w-24" value={r.targetDays} onChange={(e) => set(st, { targetDays: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} aria-label={`${STAGE_LABELS[st]} days`} />
                  </Row>
                )}
                <div className="space-y-1.5 pt-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">How the team works</p>
                    <Button size="xs" variant="ghost" className="ml-auto" onClick={() => set(st, { guide: DEFAULT_TEAM_RULES[st].guide })}>Use the standard steps</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">One step per line. Shown to the team on Home.</p>
                  <Textarea rows={7} value={r.guide} onChange={(e) => set(st, { guide: e.target.value })} className="text-sm" aria-label={`${STAGE_LABELS[st]} steps`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Button onClick={() => save(t, "Team rules saved")}>Save team rules</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function DestinationSettings({ settings }: { settings: Settings }) {
  const [d, setD] = React.useState(settings.destinations);
  const save = useSave("destinations");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Publication destinations</CardTitle>
        <CardDescription>Published means every required destination of an item is confirmed live. Defaults apply to new items; existing items keep their own list.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {d.map((x, i) => (
          <div key={x.key} className="grid items-center gap-2 rounded-lg border p-2 sm:grid-cols-[160px_1fr_auto_auto_auto]">
            <Input value={x.key} disabled className="h-8 font-mono text-xs" aria-label="Key" />
            <Input value={x.label} onChange={(e) => setD(d.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} className="h-8" aria-label="Label" />
            <label className="flex items-center gap-1.5 text-xs"><Switch checked={x.requiredByDefault} onCheckedChange={(v) => setD(d.map((y, j) => (j === i ? { ...y, requiredByDefault: v } : y)))} /> Required by default</label>
            <label className="flex items-center gap-1.5 text-xs"><Switch checked={x.active} onCheckedChange={(v) => setD(d.map((y, j) => (j === i ? { ...y, active: v } : y)))} /> Active</label>
            <span />
          </div>
        ))}
        <NewKeyRow placeholder="new_platform" onAdd={(key, label) => setD([...d, { key, label, requiredByDefault: false, active: true }])} />
        <Button onClick={() => save(d, "Destinations saved")}>Save destinations</Button>
      </CardContent>
    </Card>
  );
}

function NewKeyRow({ placeholder, onAdd }: { placeholder: string; onAdd: (key: string, label: string) => void }) {
  const [k, setK] = React.useState("");
  const [l, setL] = React.useState("");
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-dashed p-2">
      <Input value={k} onChange={(e) => setK(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder={placeholder} className="h-8 w-40 font-mono text-xs" aria-label="New key" />
      <Input value={l} onChange={(e) => setL(e.target.value)} placeholder="Label" className="h-8 flex-1" aria-label="New label" />
      <Button size="sm" variant="outline" disabled={!k || !l} onClick={() => { onAdd(k, l); setK(""); setL(""); }}><PlusIcon /> Add</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function CalendarSettings({ settings }: { settings: Settings }) {
  const [c, setC] = React.useState(settings.calendar);
  const [a, setA] = React.useState(settings.alerts);
  const [h, setH] = React.useState({ date: "", name: "" });
  const save = useSave("calendar");
  const saveA = useSave("alerts");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Working calendar</CardTitle>
          <CardDescription>Used for business-time measures and capacity. Staff timers always use actual timestamps. Confirm lunar holidays (Eid al-Fitr, Eid al-Adha, Mawlid) every year.</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Workdays">
            <div className="flex flex-wrap gap-1.5">
              {days.map((d, i) => {
                const on = c.workdays.includes(i);
                return (
                  <button key={d} onClick={() => setC({ ...c, workdays: on ? c.workdays.filter((x) => x !== i) : [...c.workdays, i].sort() })} className={cn("h-8 w-12 rounded-lg border text-xs", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")} aria-pressed={on}>
                    {d}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label="Working hours">
            <div className="flex items-center gap-2">
              <Input type="time" value={c.dayStart} onChange={(e) => setC({ ...c, dayStart: e.target.value })} className="w-32" aria-label="Day start" />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="time" value={c.dayEnd} onChange={(e) => setC({ ...c, dayEnd: e.target.value })} className="w-32" aria-label="Day end" />
            </div>
          </Row>
          <Row label="Holidays" hint={`${c.holidays.length} configured`}>
            <div className="space-y-2">
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {[...c.holidays].sort((x, y) => x.date.localeCompare(y.date)).map((x) => (
                  <div key={x.date + x.name} className="flex items-center gap-2 text-sm">
                    <span className="w-28 font-mono text-xs">{x.date}</span>
                    <span className="flex-1">{x.name}</span>
                    <Button size="icon-xs" variant="ghost" aria-label="Remove holiday" onClick={() => setC({ ...c, holidays: c.holidays.filter((y) => y !== x) })}><Trash2Icon /></Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} className="h-8 w-40" aria-label="Holiday date" />
                <Input value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} placeholder="Holiday name" className="h-8 flex-1" aria-label="Holiday name" />
                <Button size="sm" variant="outline" disabled={!h.date || !h.name} onClick={() => { setC({ ...c, holidays: [...c.holidays, h] }); setH({ date: "", name: "" }); }}><PlusIcon /> Add</Button>
              </div>
            </div>
          </Row>
          <div className="pt-3"><Button onClick={() => save(c, "Calendar saved")}>Save calendar</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Alert thresholds</CardTitle>
          <CardDescription>Starting hypotheses to calibrate during the pilot. Alerts are deduplicated and never sent on every page refresh.</CardDescription>
        </CardHeader>
        <CardContent>
          {(
            [
              ["dueSoonHours", "Due soon warning (hours before deadline)"],
              ["blockerAgeHours", "Unresolved blocker alert (hours)"],
              ["queueAgingDays", "Queue aging flag (days in stage)"],
              ["staleSessionHours", "Stale timer review (hours running)"],
              ["handoffWaitHours", "Unaccepted handoff alert (hours)"],
              ["questionDueHours", "Default question answer window (hours)"],
            ] as const
          ).map(([k, l]) => (
            <Row key={k} label={l}>
              <Input type="number" min={1} value={a[k]} onChange={(e) => setA({ ...a, [k]: Number(e.target.value) })} className="w-28" />
            </Row>
          ))}
          <div className="flex flex-wrap gap-2 pt-3">
            <Button onClick={() => saveA(a, "Alert thresholds saved")}>Save thresholds</Button>
            <Button
              variant="outline"
              onClick={async () => {
                const r = await runChecksAction();
                if (!r.ok) return toast.error(r.error);
                const d = r.data as Record<string, number>;
                toast.success("Checks run", { description: Object.entries(d).map(([k, v]) => `${k} ${v}`).join(", ") });
              }}
            >
              Run checks now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ListSettings({ settings }: { settings: Settings }) {
  const [l, setL] = React.useState(settings.lists);
  const save = useSave("lists");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lists</CardTitle>
        <CardDescription>Values offered in forms, filters, the sheet and import templates. Keys are stored on records; labels can change safely.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold">Deliverable types</p>
          {l.deliverableTypes.map((d, i) => (
            <div key={d.key} className="grid grid-cols-[130px_1fr_70px] gap-2">
              <Input value={d.key} disabled className="h-8 font-mono text-xs" />
              <Input value={d.label} onChange={(e) => setL({ ...l, deliverableTypes: l.deliverableTypes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="h-8" />
              <Input value={d.codeSuffix} placeholder="Suffix" onChange={(e) => setL({ ...l, deliverableTypes: l.deliverableTypes.map((x, j) => (j === i ? { ...x, codeSuffix: e.target.value.toUpperCase() } : x)) })} className="h-8 font-mono text-xs" aria-label="Code suffix" />
            </div>
          ))}
          <NewKeyRow placeholder="new_type" onAdd={(key, label) => setL({ ...l, deliverableTypes: [...l.deliverableTypes, { key, label, codeSuffix: key.slice(0, 3).toUpperCase() }] })} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Content types</p>
          {l.contentTypes.map((d, i) => (
            <div key={d.key} className="grid grid-cols-[130px_1fr] gap-2">
              <Input value={d.key} disabled className="h-8 font-mono text-xs" />
              <Input value={d.label} onChange={(e) => setL({ ...l, contentTypes: l.contentTypes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="h-8" />
            </div>
          ))}
          <NewKeyRow placeholder="new_content" onAdd={(key, label) => setL({ ...l, contentTypes: [...l.contentTypes, { key, label }] })} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Languages</p>
          {l.languages.map((d, i) => (
            <div key={d.code} className="grid grid-cols-[130px_1fr] gap-2">
              <Input value={d.code} disabled className="h-8 font-mono text-xs" />
              <Input value={d.label} onChange={(e) => setL({ ...l, languages: l.languages.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="h-8" />
            </div>
          ))}
          <NewKeyRow placeholder="ti" onAdd={(code, label) => setL({ ...l, languages: [...l.languages, { code, label }] })} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Terms</p>
          <Input value={l.terms.join(", ")} onChange={(e) => setL({ ...l, terms: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
          <p className="text-xs text-muted-foreground">Comma separated.</p>
        </div>
        <div className="lg:col-span-2"><Button onClick={() => save(l, "Lists saved")}>Save lists</Button></div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

type TaxProps = {
  grades: { id: string; code: string; name: string; sort: number; active: number }[];
  subjects: { id: string; code: string; name: string; name_am: string | null; sort: number; active: number }[];
  gradeSubjects: { grade_id: string; subject_id: string }[];
  units: { id: string; grade_id: string; subject_id: string; number: number; title: string; title_am: string | null; term: string | null }[];
  lessons: { id: string; unit_id: string; number: number; title: string; title_am: string | null; objectives: string | null; planned_deliverables: number; items: number }[];
  terms: string[];
};

export function TaxonomySettings({ t }: { t: TaxProps }) {
  const router = useRouter();
  const done = (r: { ok: boolean; error?: string }, msg = "Saved") => {
    if (!r.ok) return toast.error((r as { error: string }).error);
    toast.success(msg);
    router.refresh();
  };
  const [ng, setNg] = React.useState({ code: "", name: "" });
  const [ns, setNs] = React.useState({ code: "", name: "", nameAm: "" });
  const [sel, setSel] = React.useState<{ g: string; s: string }>({ g: t.grades[0]?.id ?? "", s: "" });
  const offeredSubjects = t.subjects.filter((s) => t.gradeSubjects.some((x) => x.grade_id === sel.g && x.subject_id === s.id));
  const subj = sel.s || offeredSubjects[0]?.id || "";
  const units = t.units.filter((u) => u.grade_id === sel.g && u.subject_id === subj);
  const [nu, setNu] = React.useState({ number: "", title: "", titleAm: "", term: "" });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Grades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {t.grades.map((g) => (
              <GradeRow key={g.id} g={g} onSave={async (v) => done(await upsertGradeAction(v))} />
            ))}
            <div className="flex gap-2 border-t pt-2">
              <Input value={ng.code} onChange={(e) => setNg({ ...ng, code: e.target.value.toUpperCase() })} placeholder="G13" className="h-8 w-24" aria-label="New grade code" />
              <Input value={ng.name} onChange={(e) => setNg({ ...ng, name: e.target.value })} placeholder="Grade name" className="h-8" aria-label="New grade name" />
              <Button size="sm" variant="outline" disabled={!ng.code || !ng.name} onClick={async () => { done(await upsertGradeAction({ code: ng.code, name: ng.name, sort: t.grades.length + 1, active: true })); setNg({ code: "", name: "" }); }}><PlusIcon /> Add</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subjects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {t.subjects.map((s) => (
              <SubjectRow key={s.id} s={s} onSave={async (v) => done(await upsertSubjectAction(v))} />
            ))}
            <div className="flex flex-wrap gap-2 border-t pt-2">
              <Input value={ns.code} onChange={(e) => setNs({ ...ns, code: e.target.value.toUpperCase() })} placeholder="GEO" className="h-8 w-24" aria-label="New subject code" />
              <Input value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} placeholder="Subject name" className="h-8 flex-1" aria-label="New subject name" />
              <Input value={ns.nameAm} onChange={(e) => setNs({ ...ns, nameAm: e.target.value })} placeholder="Amharic name" lang="am" className="ethiopic h-8 w-36" aria-label="Amharic name" />
              <Button size="sm" variant="outline" disabled={!ns.code || !ns.name} onClick={async () => { done(await upsertSubjectAction({ ...ns, sort: t.subjects.length + 1, active: true })); setNs({ code: "", name: "", nameAm: "" }); }}><PlusIcon /> Add</Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Subjects offered per grade</CardTitle>
          <CardDescription>Items, units and imports can only use offered combinations.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th />
                {t.subjects.map((s) => <th key={s.id} className="px-2 text-xs font-medium text-muted-foreground">{s.code}</th>)}
              </tr>
            </thead>
            <tbody>
              {t.grades.map((g) => (
                <tr key={g.id}>
                  <th className="pr-3 text-left text-sm font-medium whitespace-nowrap">{g.name}</th>
                  {t.subjects.map((s) => {
                    const on = t.gradeSubjects.some((x) => x.grade_id === g.id && x.subject_id === s.id);
                    return (
                      <td key={s.id} className="px-2 py-1 text-center">
                        <Checkbox checked={on} aria-label={`${g.name} ${s.name}`} onCheckedChange={async (v) => done(await setGradeSubjectAction(g.id, s.id, !!v), v ? "Subject offered" : "Subject removed")} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Units and planned lessons</CardTitle>
          <CardDescription>The planned lesson inventory drives coverage. For large changes use the Curriculum inventory import.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={sel.g} onValueChange={(v) => setSel({ g: v, s: "" })}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{t.grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={subj} onValueChange={(v) => setSel({ ...sel, s: v })}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Subject" /></SelectTrigger>
              <SelectContent>{offeredSubjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {units.map((u) => (
            <UnitBlock key={u.id} u={u} lessons={t.lessons.filter((l) => l.unit_id === u.id)} terms={t.terms} done={done} />
          ))}
          {subj && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-dashed p-2">
              <Input value={nu.number} onChange={(e) => setNu({ ...nu, number: e.target.value })} type="number" placeholder="No." className="h-8 w-20" aria-label="Unit number" />
              <Input value={nu.title} onChange={(e) => setNu({ ...nu, title: e.target.value })} placeholder="Unit title" className="h-8 flex-1" aria-label="Unit title" />
              <Input value={nu.titleAm} onChange={(e) => setNu({ ...nu, titleAm: e.target.value })} placeholder="Amharic title" lang="am" className="ethiopic h-8 w-40" aria-label="Unit Amharic title" />
              <Button size="sm" variant="outline" disabled={!nu.number || !nu.title} onClick={async () => { done(await upsertUnitAction({ gradeId: sel.g, subjectId: subj, number: Number(nu.number), title: nu.title, titleAm: nu.titleAm })); setNu({ number: "", title: "", titleAm: "", term: "" }); }}><PlusIcon /> Add unit</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GradeRow({ g, onSave }: { g: TaxProps["grades"][number]; onSave: (v: { id: string; code: string; name: string; sort: number; active: boolean }) => void }) {
  const [v, setV] = React.useState({ code: g.code, name: g.name, sort: g.sort, active: !!g.active });
  const dirty = v.code !== g.code || v.name !== g.name || v.sort !== g.sort || v.active !== !!g.active;
  return (
    <div className="flex items-center gap-2">
      <Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} className="h-8 w-20 font-mono text-xs" aria-label="Code" />
      <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-8" aria-label="Name" />
      <Input value={v.sort} type="number" onChange={(e) => setV({ ...v, sort: Number(e.target.value) })} className="h-8 w-16" aria-label="Sort order" />
      <Switch checked={v.active} onCheckedChange={(x) => setV({ ...v, active: x })} aria-label="Active" />
      <Button size="xs" variant={dirty ? "default" : "ghost"} disabled={!dirty} onClick={() => onSave({ id: g.id, ...v })}>Save</Button>
    </div>
  );
}

function SubjectRow({ s, onSave }: { s: TaxProps["subjects"][number]; onSave: (v: { id: string; code: string; name: string; nameAm?: string; sort: number; active: boolean }) => void }) {
  const [v, setV] = React.useState({ code: s.code, name: s.name, nameAm: s.name_am ?? "", sort: s.sort, active: !!s.active });
  const dirty = v.code !== s.code || v.name !== s.name || v.nameAm !== (s.name_am ?? "") || v.sort !== s.sort || v.active !== !!s.active;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} className="h-8 w-20 font-mono text-xs" aria-label="Code" />
      <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-8 flex-1" aria-label="Name" />
      <Input value={v.nameAm} onChange={(e) => setV({ ...v, nameAm: e.target.value })} lang="am" className="ethiopic h-8 w-36" aria-label="Amharic name" />
      <Switch checked={v.active} onCheckedChange={(x) => setV({ ...v, active: x })} aria-label="Active" />
      <Button size="xs" variant={dirty ? "default" : "ghost"} disabled={!dirty} onClick={() => onSave({ id: s.id, ...v })}>Save</Button>
    </div>
  );
}

function UnitBlock({ u, lessons, terms, done }: { u: TaxProps["units"][number]; lessons: TaxProps["lessons"]; terms: string[]; done: (r: { ok: boolean; error?: string }, msg?: string) => void }) {
  const [v, setV] = React.useState({ number: u.number, title: u.title, titleAm: u.title_am ?? "", term: u.term ?? "" });
  const [nl, setNl] = React.useState({ number: String((lessons.at(-1)?.number ?? 0) + 1), title: "" });
  return (
    <Collapsible className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <CollapsibleTrigger className="text-xs text-primary underline-offset-2 hover:underline">{lessons.length} lessons</CollapsibleTrigger>
        <Input type="number" value={v.number} onChange={(e) => setV({ ...v, number: Number(e.target.value) })} className="h-8 w-16" aria-label="Unit number" />
        <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className="h-8 min-w-48 flex-1" aria-label="Unit title" />
        <Input value={v.titleAm} onChange={(e) => setV({ ...v, titleAm: e.target.value })} lang="am" className="ethiopic h-8 w-40" aria-label="Unit Amharic title" />
        <Select value={v.term || "none"} onValueChange={(x) => setV({ ...v, term: x === "none" ? "" : x })}>
          <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No term</SelectItem>
            {terms.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="xs" variant="outline" onClick={async () => done(await upsertUnitAction({ id: u.id, gradeId: u.grade_id, subjectId: u.subject_id, ...v }))}>Save</Button>
      </div>
      <CollapsibleContent className="space-y-1 border-t p-2">
        {lessons.map((l) => (
          <LessonRow key={l.id} l={l} unitId={u.id} done={done} />
        ))}
        <div className="flex gap-2 pt-1">
          <Input type="number" value={nl.number} onChange={(e) => setNl({ ...nl, number: e.target.value })} className="h-8 w-16" aria-label="Lesson number" />
          <Input value={nl.title} onChange={(e) => setNl({ ...nl, title: e.target.value })} placeholder="New lesson title" className="h-8" aria-label="Lesson title" />
          <Button size="sm" variant="outline" disabled={!nl.title} onClick={async () => { done(await upsertLessonAction({ unitId: u.id, number: Number(nl.number), title: nl.title })); setNl({ number: String(Number(nl.number) + 1), title: "" }); }}><PlusIcon /> Add</Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LessonRow({ l, unitId, done }: { l: TaxProps["lessons"][number]; unitId: string; done: (r: { ok: boolean; error?: string }, msg?: string) => void }) {
  const [v, setV] = React.useState({ number: l.number, title: l.title, titleAm: l.title_am ?? "", planned: l.planned_deliverables });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="number" value={v.number} onChange={(e) => setV({ ...v, number: Number(e.target.value) })} className="h-7 w-16 text-xs" aria-label="Lesson number" />
      <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className="h-7 min-w-48 flex-1 text-xs" aria-label="Lesson title" />
      <Input value={v.titleAm} onChange={(e) => setV({ ...v, titleAm: e.target.value })} lang="am" className="ethiopic h-7 w-40 text-xs" aria-label="Amharic title" />
      <Input type="number" min={1} value={v.planned} onChange={(e) => setV({ ...v, planned: Number(e.target.value) })} className="h-7 w-16 text-xs" aria-label="Planned deliverables" title="Planned deliverables" />
      {l.items > 0 && <Badge variant="secondary" className="font-normal">{l.items} items</Badge>}
      <Button size="xs" variant="ghost" onClick={async () => done(await upsertLessonAction({ id: l.id, unitId, number: v.number, title: v.title, titleAm: v.titleAm, objectives: l.objectives ?? undefined, plannedDeliverables: v.planned }))}>Save</Button>
      {l.items === 0 && <Button size="icon-xs" variant="ghost" aria-label="Delete lesson" onClick={async () => done(await deleteLessonAction(l.id), "Lesson deleted")}><Trash2Icon /></Button>}
    </div>
  );
}

// ---------------------------------------------------------------------------

