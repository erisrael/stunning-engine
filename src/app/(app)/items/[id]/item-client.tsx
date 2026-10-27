"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, CircleIcon, ExternalLinkIcon, LinkIcon, PencilIcon, PlusIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/app/multi-select";
import { StatusPill } from "@/components/app/status-pill";
import { useActions, type ItemRef } from "@/components/app/action-center";
import { itemAction } from "@/app/actions/items";
import { answerQuestionAction, askQuestionAction, escalateQuestionAction, resolveQuestionAction } from "@/app/actions/collab";
import { COMPLEXITY_LABELS, PRIORITY_LABELS, STAGE_LABELS, STAGES, type Role, type Stage } from "@/lib/domain";
import { fmtDateTime, fmtRelative, isoToLocalInput, localInputToIso, endOfLocalDayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

type Req = { key: string; label: string; met: boolean };

export function RequirementPanel({ requirements }: { requirements: Req[] }) {
  const done = requirements.filter((r) => r.met).length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Handoff requirements</span>
        <span className="text-muted-foreground tabular">
          {done} of {requirements.length} complete
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${requirements.length ? (done / requirements.length) * 100 : 100}%` }} />
      </div>
      <ul className="space-y-1">
        {requirements.map((r) => (
          <li key={r.key} className="flex items-start gap-2 text-sm">
            {r.met ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[var(--st-done-fg)]" /> : <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <span className={cn(r.met && "text-muted-foreground")}>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChecklistEditor({
  item,
  checklist,
  canEdit,
}: {
  item: ItemRef;
  checklist: { key: string; label: string; required: boolean; checked: boolean; by: string | null; at: string | null }[];
  canEdit: boolean;
}) {
  const { run } = useActions();
  const [pending, setPending] = React.useState<string | null>(null);
  return (
    <ul className="space-y-1.5">
      {checklist.map((c) => (
        <li key={c.key} className="flex items-start gap-2">
          <Checkbox
            id={`chk-${c.key}`}
            checked={c.checked}
            disabled={!canEdit || pending === c.key}
            onCheckedChange={async (v) => {
              setPending(c.key);
              await run(item, { action: "checklist", key: c.key, checked: !!v }, { silent: true });
              setPending(null);
            }}
            className="mt-0.5"
          />
          <label htmlFor={`chk-${c.key}`} className="min-w-0 flex-1 text-sm">
            {c.label}
            {c.required && <span className="ml-1 text-xs text-muted-foreground">required</span>}
            {c.checked && c.by && <span className="block text-[11px] text-muted-foreground">{c.by}, {c.at}</span>}
          </label>
        </li>
      ))}
    </ul>
  );
}

export function DurationEditor({ item, stage, raw, final, canEdit }: { item: ItemRef; stage: Stage; raw: number | null; final: number | null; canEdit: boolean }) {
  const { run } = useActions();
  const [value, setValue] = React.useState(String((stage === "recording" ? raw : final) ?? ""));
  if (stage !== "recording" && stage !== "editing") return null;
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="dur" className="text-xs">
          {stage === "recording" ? "Raw recorded duration (min)" : "Final duration (min)"}
        </Label>
        <Input id="dur" type="number" min={0} step="0.5" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit} className="h-8 w-32" />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={!canEdit}
        onClick={() => run(item, stage === "recording" ? { action: "durations", rawDurationMin: value ? Number(value) : null } : { action: "durations", actualDurationMin: value ? Number(value) : null }, { successMessage: "Duration saved" })}
      >
        Save
      </Button>
    </div>
  );
}

type Target = {
  platform: string;
  label: string;
  required: boolean;
  upload_status: string;
  external_id: string | null;
  upload_url: string | null;
  playback_checked: number;
  metadata_checked: number;
  release_status: string;
  scheduled_at: string | null;
  live_url: string | null;
  published_at: string | null;
  verified_at: string | null;
  failure_reason: string | null;
  retry_count: number;
  versionOk: boolean;
};

export function TargetsTable({ item, targets, stage, canUpload, canPublish, tz }: { item: ItemRef; targets: Target[]; stage: Stage | null; canUpload: boolean; canPublish: boolean; tz: string }) {
  const { run, open } = useActions();
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Destination</th>
            <th className="px-3 py-2 text-left font-medium">Upload</th>
            <th className="px-3 py-2 text-left font-medium">Checks</th>
            <th className="px-3 py-2 text-left font-medium">Release</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t.platform} className="border-t align-top">
              <td className="px-3 py-2">
                <div className="font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.required ? "Required" : "Optional"}</div>
              </td>
              <td className="px-3 py-2">
                <StatusPill size="xs" tone={t.upload_status === "uploaded" ? "done" : t.upload_status === "failed" ? "failed" : t.upload_status === "pending" ? "neutral" : "active"} label={t.upload_status} />
                {(t.external_id || t.upload_url) && (
                  <div className="mt-1 text-xs">
                    {t.upload_url ? (
                      <a href={t.upload_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {t.external_id ?? "Destination link"}
                      </a>
                    ) : (
                      t.external_id
                    )}
                  </div>
                )}
                {t.upload_status === "uploaded" && !t.versionOk && <div className="mt-1 text-xs text-[var(--st-blocked-fg)]">Uploaded version is not the current master</div>}
                {t.failure_reason && <div className="mt-1 text-xs text-[var(--st-failed-fg)]">{t.failure_reason}</div>}
                {t.retry_count > 0 && <div className="text-[11px] text-muted-foreground">{t.retry_count} failed attempt(s)</div>}
              </td>
              <td className="px-3 py-2">
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={!!t.playback_checked}
                    disabled={!canUpload || stage !== "uploading" || t.upload_status !== "uploaded"}
                    onCheckedChange={(v) => run(item, { action: "verify", platform: t.platform, playback: v }, { silent: true })}
                    aria-label={`Playback verified for ${t.label}`}
                  />
                  Playback
                </label>
                <label className="mt-1 flex items-center gap-2 text-xs">
                  <Switch
                    checked={!!t.metadata_checked}
                    disabled={!canUpload || stage !== "uploading" || t.upload_status !== "uploaded"}
                    onCheckedChange={(v) => run(item, { action: "verify", platform: t.platform, metadata: v }, { silent: true })}
                    aria-label={`Metadata verified for ${t.label}`}
                  />
                  Metadata
                </label>
              </td>
              <td className="px-3 py-2">
                <StatusPill size="xs" tone={t.release_status === "live" ? "done" : t.release_status === "scheduled" ? "scheduled" : t.release_status === "failed" ? "failed" : "neutral"} label={t.release_status} />
                {t.scheduled_at && t.release_status !== "live" && <div className="mt-1 text-xs text-muted-foreground">for {fmtDateTime(t.scheduled_at, tz)}</div>}
                {t.live_url && (
                  <a href={t.live_url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLinkIcon className="size-3" /> Live link
                  </a>
                )}
                {t.published_at && <div className="text-[11px] text-muted-foreground">Released {fmtDateTime(t.published_at, tz)}</div>}
                {t.verified_at && <div className="text-[11px] text-muted-foreground">Verified {fmtDateTime(t.verified_at, tz)}</div>}
              </td>
              <td className="px-3 py-2 text-right">
                {stage === "uploading" && canUpload && (
                  <Button size="xs" variant="outline" onClick={() => open("upload", item, { platform: t.platform, externalId: t.external_id ?? "", uploadUrl: t.upload_url ?? "" })}>
                    Record upload
                  </Button>
                )}
                {stage === "publication" && canPublish && t.release_status !== "live" && (
                  <Button size="xs" onClick={() => open("live", item, { platform: t.platform })}>
                    Confirm live
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Lists = { deliverableTypes: { key: string; label: string }[]; contentTypes: { key: string; label: string }[]; languages: { code: string; label: string }[] };

export function EditDetails({
  item,
  values,
  lists,
  isManager,
  tz,
}: {
  item: ItemRef;
  values: Record<string, string | number | null>;
  lists: Lists;
  isManager: boolean;
  tz: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (open)
      setF(
        Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k, k === "planned_publish_at" ? isoToLocalInput(v as string | null, tz, true) : v === null ? "" : String(v)]),
        ),
      );
  }, [open, values, tz]);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const field = (k: string, label: string, input: React.ReactNode, wide = false) => (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <Label htmlFor={`ed-${k}`}>{label}</Label>
      {input}
    </div>
  );
  const sel = (k: string, opts: [string, string][]) => (
    <Select value={f[k] ?? ""} onValueChange={(v) => set(k, v)} disabled={!isManager}>
      <SelectTrigger id={`ed-${k}`} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PencilIcon /> Edit details
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit details</DialogTitle>
            <DialogDescription>
              {isManager ? "Every change is recorded with its previous value." : "As the current stage owner you can update teacher, objectives, Amharic title and complexity note."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("title", "Title", <Input id="ed-title" value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} disabled={!isManager} />, true)}
            {field("title_am", "Title (Amharic)", <Input id="ed-title_am" lang="am" className="ethiopic" value={f.title_am ?? ""} onChange={(e) => set("title_am", e.target.value)} />, true)}
            {field("objectives", "Learning objectives", <Textarea id="ed-objectives" value={f.objectives ?? ""} onChange={(e) => set("objectives", e.target.value)} />, true)}
            {field("teacher", "Teacher or presenter", <Input id="ed-teacher" value={f.teacher ?? ""} onChange={(e) => set("teacher", e.target.value)} />)}
            {field("target_duration_min", "Target duration (min)", <Input id="ed-target_duration_min" type="number" value={f.target_duration_min ?? ""} onChange={(e) => set("target_duration_min", e.target.value)} disabled={!isManager} />)}
            {field("priority", "Priority", sel("priority", Object.entries(PRIORITY_LABELS)))}
            {field("complexity", "Complexity", sel("complexity", Object.entries(COMPLEXITY_LABELS)))}
            {field("complexity_note", "Complexity justification", <Input id="ed-complexity_note" value={f.complexity_note ?? ""} onChange={(e) => set("complexity_note", e.target.value)} />, true)}
            {field("deliverable_type", "Deliverable", sel("deliverable_type", lists.deliverableTypes.map((d) => [d.key, d.label])))}
            {field("content_type", "Content type", sel("content_type", lists.contentTypes.map((d) => [d.key, d.label])))}
            {field("language", "Language", sel("language", lists.languages.map((d) => [d.code, d.label])))}
            {field("planned_publish_at", "Planned publication date", <Input id="ed-planned_publish_at" type="date" value={f.planned_publish_at ?? ""} onChange={(e) => set("planned_publish_at", e.target.value)} disabled={!isManager} />)}
            {field("tags", "Tags (comma separated)", <Input id="ed-tags" value={f.tags ?? ""} onChange={(e) => set("tags", e.target.value)} disabled={!isManager} />, true)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const allowed = isManager ? Object.keys(f) : ["teacher", "objectives", "title_am", "complexity_note"];
                const changed: Record<string, unknown> = {};
                for (const k of allowed) {
                  const orig = k === "planned_publish_at" ? isoToLocalInput(values[k] as string | null, tz, true) : values[k] === null ? "" : String(values[k]);
                  if ((f[k] ?? "") !== orig) changed[k] = k === "planned_publish_at" ? (f[k] ? localInputToIso(`${f[k]}T09:00`, tz) : null) : f[k] === "" ? null : f[k];
                }
                if (!Object.keys(changed).length) return setOpen(false);
                const res = await itemAction(item.id, { action: "fields", fields: changed }, { expectedVersion: item.version });
                if (!res.ok) return toast.error(res.error);
                toast.success("Details saved");
                setOpen(false);
                router.refresh();
              }}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PlacementEditor({
  item,
  memberships,
  grades,
  subjects,
  gradeSubjects,
  units,
}: {
  item: ItemRef;
  memberships: { gradeId: string; subjectId: string; unitId: string | null; primary: boolean }[];
  grades: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  gradeSubjects: { grade_id: string; subject_id: string }[];
  units: { id: string; gradeId: string; subjectId: string; number: number; title: string }[];
}) {
  const { run } = useActions();
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState(memberships);
  React.useEffect(() => {
    if (open) setList(memberships);
  }, [open, memberships]);
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        <PencilIcon /> Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Curriculum placement</DialogTitle>
            <DialogDescription>One item can belong to several grades and subjects without duplication. The primary placement is used where totals must add up.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {list.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                <Select value={m.gradeId} onValueChange={(v) => setList((l) => l.map((x, j) => (j === i ? { ...x, gradeId: v, unitId: null } : x)))}>
                  <SelectTrigger className="w-full" size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={m.subjectId} onValueChange={(v) => setList((l) => l.map((x, j) => (j === i ? { ...x, subjectId: v, unitId: null } : x)))}>
                  <SelectTrigger className="w-full" size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subjects.filter((s) => gradeSubjects.some((gs) => gs.grade_id === m.gradeId && gs.subject_id === s.id)).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={m.unitId ?? "none"} onValueChange={(v) => setList((l) => l.map((x, j) => (j === i ? { ...x, unitId: v === "none" ? null : v } : x)))}>
                  <SelectTrigger className="w-full" size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No unit</SelectItem>
                    {units.filter((u) => u.gradeId === m.gradeId && u.subjectId === m.subjectId).map((u) => <SelectItem key={u.id} value={u.id}>U{u.number} {u.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="radio" name="primary" checked={m.primary} onChange={() => setList((l) => l.map((x, j) => ({ ...x, primary: j === i })))} /> Primary
                  </label>
                  {!m.primary && <Button size="icon-xs" variant="ghost" aria-label="Remove placement" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>x</Button>}
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setList((l) => [...l, { gradeId: grades[0].id, subjectId: subjects[0].id, unitId: null, primary: false }])}>
              <PlusIcon /> Add placement
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={async () => { if (await run(item, { action: "memberships", memberships: list })) setOpen(false); }}>Save placement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AssignmentEditor({
  item,
  assignments,
  users,
  tz,
  isManager,
}: {
  item: ItemRef;
  assignments: { stage: Stage; userId: string | null; dueAt: string | null }[];
  users: { id: string; name: string; roles: Role[] }[];
  tz: string;
  isManager: boolean;
}) {
  const { run } = useActions();
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return (
    <ul className="divide-y">
      {STAGES.map((st) => {
        const a = assignments.find((x) => x.stage === st);
        return (
          <li key={st} className="grid grid-cols-[96px_1fr] items-center gap-2 py-2 sm:grid-cols-[110px_1fr_150px]">
            <span className="text-xs font-medium">{STAGE_LABELS[st]}</span>
            {isManager ? (
              <Combobox
                size="sm"
                options={users.filter((u) => u.roles.includes(st)).map((u) => ({ value: u.id, label: u.name }))}
                value={a?.userId ?? null}
                onChange={(v) => run(item, { action: "assign", stage: st, userId: v })}
                placeholder="Unassigned"
              />
            ) : (
              <span className={cn("text-sm", !a?.userId && "text-muted-foreground")}>{a?.userId ? names[a.userId] : "Unassigned"}</span>
            )}
            {isManager ? (
              <Input
                type="date"
                aria-label={`${STAGE_LABELS[st]} target date`}
                className="col-span-2 h-8 sm:col-span-1"
                defaultValue={isoToLocalInput(a?.dueAt, tz, true)}
                onBlur={(e) => {
                  const v = e.target.value;
                  const cur = isoToLocalInput(a?.dueAt, tz, true);
                  if (v !== cur) run(item, { action: "stageDue", stage: st, dueAt: v ? endOfLocalDayIso(v, tz) : null }, { successMessage: "Stage target saved" });
                }}
              />
            ) : (
              <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1">{a?.dueAt ? `Target ${fmtDateTime(a.dueAt, tz)}` : ""}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DestinationsEditor({ item, targets, destinations }: { item: ItemRef; targets: { platform: string; required: boolean; live: boolean }[]; destinations: { key: string; label: string }[] }) {
  const { run } = useActions();
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<Record<string, "required" | "optional" | "none">>({});
  React.useEffect(() => {
    if (open) setState(Object.fromEntries(destinations.map((d) => { const t = targets.find((x) => x.platform === d.key); return [d.key, t ? (t.required ? "required" : "optional") : "none"]; })));
  }, [open, targets, destinations]);
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}><PencilIcon /> Edit</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publication destinations</DialogTitle>
            <DialogDescription>Published means every required destination is confirmed live. Optional destinations never change that rule.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {destinations.map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-2">
                <span className="text-sm">{d.label}</span>
                <Select value={state[d.key] ?? "none"} onValueChange={(v) => setState((s) => ({ ...s, [d.key]: v as never }))} disabled={targets.find((t) => t.platform === d.key)?.live}>
                  <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                    <SelectItem value="none">Not used</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                const list = Object.entries(state).filter(([, v]) => v !== "none").map(([platform, v]) => ({ platform, required: v === "required" }));
                if (await run(item, { action: "destinations", destinations: list })) setOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CorrectionButton({ item, session, tz }: { item: ItemRef; session: { id: string; started_at: string; ended_at: string | null }; tz: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState(isoToLocalInput(session.started_at, tz));
  const [end, setEnd] = React.useState(isoToLocalInput(session.ended_at, tz));
  const [reason, setReason] = React.useState("");
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)} disabled={!session.ended_at}>Request correction</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a timer correction</DialogTitle>
            <DialogDescription>A manager approves corrections. The original times stay in the history next to the corrected ones.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Started</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Ended</Label><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!reason.trim()}
              onClick={async () => {
                const res = await itemAction(item.id, { action: "correction", sessionId: session.id, startedAt: localInputToIso(start, tz)!, endedAt: localInputToIso(end, tz)!, reason });
                if (!res.ok) return toast.error(res.error);
                toast.success("Correction requested");
                setOpen(false);
                router.refresh();
              }}
            >
              Send for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function QuestionsPanel({
  itemId,
  questions,
  users,
  viewerId,
  isManager,
  tz,
  defaultOwner,
  stage,
  allowAsk = true,
}: {
  allowAsk?: boolean;
  itemId: string;
  questions: { id: string; asked_by: string; owner_id: string; question: string; due_at: string | null; status: string; answer: string | null; answered_at: string | null; created_at: string }[];
  users: { id: string; name: string; roles: Role[] }[];
  viewerId: string;
  isManager: boolean;
  tz: string;
  defaultOwner: string | null;
  stage: string | null;
}) {
  const router = useRouter();
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const [q, setQ] = React.useState("");
  const [owner, setOwner] = React.useState<string | null>(defaultOwner);
  const [due, setDue] = React.useState("");
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  return (
    <div className="space-y-3">
      {questions.length === 0 && <p className="text-sm text-muted-foreground">No manager questions on this item.</p>}
      {questions.map((x) => (
        <div key={x.id} className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>
              <span className="font-medium">{names[x.asked_by]}</span> asked <span className="font-medium">{names[x.owner_id]}</span> {fmtRelative(x.created_at)}
            </span>
            <StatusPill size="xs" tone={x.status === "open" ? (x.due_at && x.due_at < new Date().toISOString() ? "blocked" : "paused") : x.status === "answered" ? "handoff" : "done"} label={x.status} />
          </div>
          <p className="text-sm">{x.question}</p>
          {x.due_at && <p className="text-xs text-muted-foreground">Answer by {fmtDateTime(x.due_at, tz)}</p>}
          {x.answer && (
            <div className="rounded-md bg-muted/60 p-2 text-sm">
              <span className="text-xs text-muted-foreground">Answer, {fmtDateTime(x.answered_at, tz)}</span>
              <p>{x.answer}</p>
            </div>
          )}
          {x.status === "open" && (x.owner_id === viewerId || isManager) && (
            <div className="flex gap-2">
              <Input value={answers[x.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [x.id]: e.target.value }))} placeholder="Answer" />
              <Button
                size="sm"
                onClick={async () => {
                  const res = await answerQuestionAction(x.id, answers[x.id] ?? "");
                  if (!res.ok) return toast.error(res.error);
                  toast.success("Answer sent");
                  router.refresh();
                }}
              >
                <SendIcon /> Answer
              </Button>
            </div>
          )}
          {isManager && (
            <div className="flex gap-2">
              {x.status !== "resolved" && (
                <Button size="xs" variant="outline" onClick={async () => { await resolveQuestionAction(x.id); router.refresh(); }}>Mark resolved</Button>
              )}
              {x.status === "resolved" && (
                <Button size="xs" variant="ghost" onClick={async () => { await resolveQuestionAction(x.id, true); router.refresh(); }}>Reopen</Button>
              )}
              {x.status === "open" && (
                <Button size="xs" variant="ghost" onClick={async () => { await escalateQuestionAction(x.id, "Escalated from item page"); toast.success("Escalated"); router.refresh(); }}>Escalate</Button>
              )}
            </div>
          )}
        </div>
      ))}
      {isManager && allowAsk && (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">Ask a tracked question</p>
          <Textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder="Can this still meet its release date?" />
          <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
            <Combobox options={users.map((u) => ({ value: u.id, label: u.name }))} value={owner} onChange={setOwner} placeholder="Who should answer" />
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Answer by" />
            <Button
              disabled={!q.trim() || !owner}
              onClick={async () => {
                const res = await askQuestionAction({ itemId, ownerId: owner!, question: q, dueAt: due ? localInputToIso(due, tz) : null, stage });
                if (!res.ok) return toast.error(res.error);
                toast.success("Question sent");
                setQ("");
                router.refresh();
              }}
            >
              Ask
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AddAssetButton({ item, kind }: { item: ItemRef; kind: string }) {
  const { open } = useActions();
  return (
    <Button size="sm" variant="outline" onClick={() => open("asset", item, { kind })}>
      <LinkIcon /> Link a file
    </Button>
  );
}

export function RecordingSessionButton({ item, presenter, tz }: { item: ItemRef; presenter: string | null; tz: string }) {
  const { run } = useActions();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ start: "", duration: "90", presenter: presenter ?? "", location: "Studio A", notes: "" });
  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}><PlusIcon /> Book session</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book a recording session</DialogTitle>
            <DialogDescription>Booking a session does not start the timer. Start recording when the session begins. Times in {tz}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Start</Label><Input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Duration (min)</Label><Input type="number" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Presenter</Label><Input value={f.presenter} onChange={(e) => setF({ ...f, presenter: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Location</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!f.start}
              onClick={async () => {
                const ok = await run(item, { action: "recordingSession", scheduledStart: localInputToIso(f.start, tz)!, durationMin: Number(f.duration) || 60, presenter: f.presenter, location: f.location, notes: f.notes }, { successMessage: "Session booked" });
                if (ok) setOpen(false);
              }}
            >
              Book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SessionStatusSelect({ item, sessionId, status }: { item: ItemRef; sessionId: string; status: string }) {
  const { run } = useActions();
  return (
    <Select value={status} onValueChange={(v) => run(item, { action: "recordingSessionStatus", sessionId, status: v as "scheduled" }, { successMessage: "Session updated" })}>
      <SelectTrigger size="sm" className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {["scheduled", "completed", "rescheduled", "cancelled"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function HistoryFilter({ categories, value, onChange }: { categories: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {["all", ...categories].map((c) => (
        <button key={c} onClick={() => onChange(c)} className={cn("h-6 rounded-full border px-2.5 text-xs capitalize", value === c ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {c}
        </button>
      ))}
    </div>
  );
}

export function HistoryList({
  events,
  tz,
}: {
  events: { id: string; actor: string; action: string; summary: string; old_value: string | null; new_value: string | null; reason: string | null; occurred_at: string; source_occurred_at: string | null; stage: string | null; request_id: string | null; job_id: string | null }[];
  tz: string;
}) {
  const [cat, setCat] = React.useState("all");
  const categories = [...new Set(events.map((e) => e.action.split(".")[0]))];
  const shown = events.filter((e) => cat === "all" || e.action.startsWith(cat + "."));
  const pretty = (v: string | null) => {
    if (v === null) return "empty";
    try {
      const j = JSON.parse(v);
      if (j === null) return "empty";
      if (typeof j === "string") return j.includes("T") && !Number.isNaN(Date.parse(j)) ? fmtDateTime(j, tz) : j;
      if (typeof j === "boolean" || typeof j === "number") return String(j);
      return Object.entries(j).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : x}`).join(", ");
    } catch {
      return v;
    }
  };
  return (
    <div className="space-y-3">
      <HistoryFilter categories={categories} value={cat} onChange={setCat} />
      <ol className="relative space-y-0 border-l pl-5">
        {shown.map((e) => (
          <li key={e.id} className="relative pb-4">
            <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              <time dateTime={e.occurred_at} className="font-medium text-foreground tabular">{fmtDateTime(e.occurred_at, tz, { seconds: true })}</time>
              {e.stage && <span className="rounded bg-muted px-1">{e.stage}</span>}
              <span className="font-mono text-[10px]">{e.action}</span>
            </div>
            <p className="text-sm">{e.summary}</p>
            {(e.old_value !== null || e.new_value !== null) && e.action !== "item.created" && (
              <p className="text-xs text-muted-foreground">
                Changed from <span className="text-foreground">{pretty(e.old_value)}</span> to <span className="text-foreground">{pretty(e.new_value)}</span>
              </p>
            )}
            {e.reason && <p className="text-xs">Reason: {e.reason}</p>}
            {e.source_occurred_at && <p className="text-xs text-muted-foreground">Occurred at source {fmtDateTime(e.source_occurred_at, tz)}; recorded {fmtDateTime(e.occurred_at, tz)}</p>}
            {(e.request_id || e.job_id) && <p className="font-mono text-[10px] text-muted-foreground">{e.job_id ? `job ${e.job_id}` : `request ${e.request_id}`}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
