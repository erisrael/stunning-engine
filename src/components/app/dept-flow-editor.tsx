"use client";

// Configure, Flow: the stages a department's tasks go through, who works or checks each one, whether the lead
// reviews, where it goes next, targets and limits, and the stage's own steps. Saved with the rest of the
// configuration (as a new version).

import * as React from "react";
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { DeptConfig } from "@/lib/dept-config";
import { FLOW_PRESETS, STAGE_KIND_LABELS, STAGE_KINDS, applyFlowPreset, blankStage, type FlowStage, type StageKind } from "@/lib/dept-flow";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string };

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const id = React.useId();
  const control = React.isValidElement<{ id?: string }>(children) && typeof children.type !== "string" ? React.cloneElement(children, { id }) : children;
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {control}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

const num = (v: string) => (v.trim() === "" ? null : Math.max(1, Math.round(Number(v)) || 1));

export function FlowEditor({ config: c, people, departments, github, onChange }: { config: DeptConfig; people: Person[]; departments: { key: string; title: string }[]; github: boolean; onChange: (c: DeptConfig) => void }) {
  const flow = c.flow;
  const [preset, setPreset] = React.useState(FLOW_PRESETS[0]!.key);
  const label = (k: string | null) => (k ? (c.statuses.find((s) => s.key === k)?.label ?? k) : "");
  const setStages = (stages: FlowStage[]) => onChange({ ...c, flow: { ...flow, stages } });
  const patch = (i: number, p: Partial<FlowStage>) => setStages(flow.stages.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const used = new Set(flow.stages.flatMap((s) => [s.status, ...(s.queueStatus ? [s.queueStatus] : [])]));
  const free = c.statuses.filter((s) => s.active && !used.has(s.key));
  const move = (i: number, d: -1 | 1) => {
    const list = [...flow.stages];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    setStages(list);
  };
  // The path from the first stage, following "next", for the picture at the top.
  const path: FlowStage[] = [];
  for (let cur: FlowStage | undefined = flow.stages[0]; cur && !path.includes(cur) && path.length < 25; cur = flow.stages.find((s) => s.status === cur!.next)) path.push(cur);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flow</CardTitle>
          <CardDescription>
            The loop production teams work in, for this department: the lead assigns, members start, fill in the card, mark it done and send it; the lead approves or returns it; only finished work moves on.
            Members get their own board on Home and leads a desk (approve, hand over, accept, assign). Each stage is one of the statuses, so the Board, List and reports keep working.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle
            label="Use the flow"
            checked={flow.on}
            onChange={(v) => onChange({ ...c, flow: { ...flow, on: v } })}
            hint={flow.stages.length ? "Off: tasks move freely between statuses, as before." : "Start from a ready flow below, or add stages."}
          />
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-2">
            <Row label="Start from a ready flow" hint={FLOW_PRESETS.find((p) => p.key === preset)?.hint}>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLOW_PRESETS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Button
              variant="outline"
              onClick={() => {
                if (flow.stages.length && !window.confirm("Replace the stages with this ready flow? Statuses, fields and checklist lines it needs are added; nothing is removed.")) return;
                onChange(applyFlowPreset(c, preset));
              }}
            >
              Use it
            </Button>
            <span className="text-xs text-muted-foreground">Then adjust it, and Save changes.</span>
          </div>
          {path.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-xs" aria-label="The flow from the first stage">
              {path.map((s, i) => (
                <React.Fragment key={s.status}>
                  {i > 0 && <ArrowRightIcon className="size-3 text-muted-foreground" />}
                  <span className="rounded-full border px-2 py-0.5" style={{ borderColor: c.statuses.find((x) => x.key === s.status)?.color }}>
                    {s.queueStatus ? `${label(s.queueStatus)} / ` : ""}
                    {label(s.status)}
                    {s.review ? " (lead approves)" : ""}
                    {s.nextDept ? ` → ${departments.find((d) => d.key === s.nextDept)?.title ?? s.nextDept}` : ""}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {flow.stages.map((s, i) => {
        const others = flow.stages.filter((x) => x.status !== s.status);
        const statusChoices = c.statuses.filter((x) => x.key === s.status || !used.has(x.key));
        const queueChoices = c.statuses.filter((x) => x.key === s.queueStatus || (!used.has(x.key) && x.key !== s.status));
        return (
          <Card key={`${s.status}-${i}`} data-flow-stage={s.status}>
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap items-end gap-2">
                <span className="mb-2 text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}.</span>
                <Row label="Status">
                  <Select value={s.status} onValueChange={(v) => setStages(flow.stages.map((x, j) => (j === i ? { ...x, status: v } : { ...x, next: x.next === s.status ? v : x.next, returnTo: x.returnTo === s.status ? v : x.returnTo })))}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusChoices.map((x) => (
                        <SelectItem key={x.key} value={x.key}>
                          {x.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
                <Row label="Kind">
                  <Select value={s.kind} onValueChange={(v) => patch(i, { ...blankStage(s.status, v as StageKind), next: s.next, days: s.days, steps: s.steps })}>
                    <SelectTrigger className="w-60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGE_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {STAGE_KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
                {s.kind !== "final" && (
                  <Row label="Next">
                    <Select value={s.next ?? "_end"} onValueChange={(v) => patch(i, { next: v === "_end" ? null : v })}>
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_end">The end (finished)</SelectItem>
                        {others.map((x) => (
                          <SelectItem key={x.status} value={x.status}>
                            {label(x.status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Row>
                )}
                <div className="ml-auto flex gap-1">
                  <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === flow.stages.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove the stage ${label(s.status)}`}
                    onClick={() => setStages(flow.stages.filter((_, j) => j !== i).map((x) => ({ ...x, next: x.next === s.status ? null : x.next, returnTo: x.returnTo === s.status ? null : x.returnTo })))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>

              {s.kind !== "final" && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {s.kind === "work" && (
                    <Row label="Not started yet" hint="A status for work waiting to start, such as To do">
                      <Select value={s.queueStatus ?? "_none"} onValueChange={(v) => patch(i, { queueStatus: v === "_none" ? null : v })}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">The same status</SelectItem>
                          {queueChoices.map((x) => (
                            <SelectItem key={x.key} value={x.key}>
                              {x.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Row>
                  )}
                  {s.kind === "work" && (
                    <Row label="Who has it when it arrives">
                      <Select value={s.receiver} onValueChange={(v) => patch(i, { receiver: v })}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="keep">The same person</SelectItem>
                          <SelectItem value="lead">Nobody; the lead assigns</SelectItem>
                          {people.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Row>
                  )}
                  {s.kind === "check" && (
                    <Row label="Who checks it">
                      <Select value={s.checkers} onValueChange={(v) => patch(i, { checkers: v as FlowStage["checkers"] })}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="leads">Heads and leads</SelectItem>
                          <SelectItem value="people">The people named (for example testers)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Row>
                  )}
                  {s.kind === "check" && (
                    <Row label="Returns go to" hint="Where the work goes back when it is returned">
                      <Select value={s.returnTo ?? "_auto"} onValueChange={(v) => patch(i, { returnTo: v === "_auto" ? null : v })}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_auto">The work stage before it</SelectItem>
                          {others
                            .filter((x) => x.kind === "work")
                            .map((x) => (
                              <SelectItem key={x.status} value={x.status}>
                                {label(x.status)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </Row>
                  )}
                  <Row label="Target (days in this stage)">
                    <Input type="number" min={1} value={s.days ?? ""} onChange={(e) => patch(i, { days: num(e.target.value) })} placeholder="None" />
                  </Row>
                  {s.kind === "work" && (
                    <Row label="In progress per person, at most">
                      <Input type="number" min={1} value={s.wip ?? ""} onChange={(e) => patch(i, { wip: num(e.target.value) })} placeholder="No limit" />
                    </Row>
                  )}
                  <Row label="Also hand it to another department" hint="As a request there, when it moves on">
                    <Select value={s.nextDept ?? "_none"} onValueChange={(v) => patch(i, { nextDept: v === "_none" ? null : v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">No</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.key} value={d.key}>
                            {d.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Row>
                </div>
              )}

              {s.kind === "check" && s.checkers === "people" && (
                <div className="space-y-1">
                  <Label className="text-xs">People who check {label(s.status)}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {people.map((p) => {
                      const on = s.people.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => patch(i, { people: on ? s.people.filter((x) => x !== p.id) : [...s.people, p.id] })}
                          className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                    {!people.length && <span className="text-xs text-muted-foreground">Nobody is in this department yet (Admin, Departments).</span>}
                  </div>
                </div>
              )}

              {s.kind !== "final" && s.kind !== "intake" && s.kind !== "release" && (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {s.kind === "work" && <Toggle label="The lead approves before it moves on" checked={s.review} onChange={(v) => patch(i, { review: v })} />}
                  {s.kind === "work" && <Toggle label="Every checklist line ticked before Done" checked={s.needChecklist} onChange={(v) => patch(i, { needChecklist: v })} />}
                  <Toggle label="Work arriving here is accepted first" checked={s.accept} onChange={(v) => patch(i, { accept: v })} hint="Or sent back as missing" />
                  {s.kind === "check" && <Toggle label="Returning sends it back as a bug" checked={s.returnAsBug} onChange={(v) => patch(i, { returnAsBug: v })} hint="Asks for steps to reproduce" />}
                  {github && <Toggle label="Moves on when its pull request is merged" checked={s.autoOnMerge} onChange={(v) => patch(i, { autoOnMerge: v })} hint="A pull request naming the task code (Repositories)" />}
                </div>
              )}

              {s.kind !== "final" && (
                <Row label={`How ${label(s.status)} works (one step per line, shown on Home)`}>
                  <Textarea rows={2} value={s.steps.join("\n")} onChange={(e) => patch(i, { steps: e.target.value.split("\n").slice(0, 15) })} />
                </Row>
              )}
            </CardContent>
          </Card>
        );
      })}

      {free.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Add a stage:</span>
          {free.map((x) => (
            <Button
              key={x.key}
              size="sm"
              variant="outline"
              onClick={() => setStages([...flow.stages, blankStage(x.key, x.category === "done" ? "final" : x.category === "review" ? "check" : x.category === "open" ? "intake" : "work")])}
            >
              <PlusIcon /> {x.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
