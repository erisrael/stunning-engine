"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon, MoveIcon, PencilIcon, PlusIcon, Trash2Icon, WandSparklesIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/primitives";
import {
  applyAllSuggestionsAction,
  applyIssueAction,
  mergeSubjectAction,
  movePartAction,
  moveSubjectAction,
  moveUnitAction,
  renamePartAction,
  renameSubjectAction,
  renameUnitAction,
  renumberAction,
  runAutoAssignAction,
  saveAutoAssignAction,
  saveCurriculumConfigAction,
} from "@/app/actions/curriculum";
import type { AutoAssignConfig, StageAutoAssign } from "@/server/auto-assign";
import type { CurriculumConfig, CurriculumUnit, Issue, IssueKind } from "@/server/curriculum-fix";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";

const SELECT = "h-9 rounded-md border bg-background px-2 text-sm";
const KIND: Record<IssueKind, string> = {
  subject_typo: "Subject name",
  subject_place: "Wrong place?",
  merged_unit: "Two units in one",
  unit_name: "Unit with no name",
  part_name: "Part with no name",
  camera_code: "Camera code",
};

type Index = { grades: { id: string; name: string; level: string | null }[]; subjects: { id: string; name: string; code: string }[]; offered: { grade_id: string; subject_id: string }[] };
type Props = {
  tab: string;
  rights: { rename: boolean; structure: boolean };
  admin: boolean;
  index: Index;
  gradeId: string | null;
  subjectId: string | null;
  issues: Issue[];
  units: CurriculumUnit[];
  changes: { id: string; kind: string; summary: string; actor: string | null; created_at: string }[];
  auto: AutoAssignConfig | null;
  teams: Record<string, { id: string; name: string }[]>;
  assignable: Stage[];
  config: CurriculumConfig;
};

function useDo() {
  const router = useRouter();
  return async (p: Promise<{ ok: boolean; error?: string }>, msg: string) => {
    const r = await p;
    if (!r.ok) {
      toast.error(r.error ?? "That did not work.");
      return false;
    }
    toast.success(msg);
    router.refresh();
    return true;
  };
}

export function CurriculumClient(p: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  return (
    <div className="space-y-3" data-curriculum>
      <Tabs value={p.tab} onValueChange={(v) => go({ tab: v })}>
        <TabsList>
          {p.rights.rename && <TabsTrigger value="fix">Fix</TabsTrigger>}
          {p.rights.rename && <TabsTrigger value="browse">Browse and edit</TabsTrigger>}
          {p.assignable.length > 0 && <TabsTrigger value="auto">Auto-assign</TabsTrigger>}
          <TabsTrigger value="changes">Changes</TabsTrigger>
          {p.admin && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>
      </Tabs>
      {p.tab === "fix" && <FixTab {...p} />}
      {p.tab === "browse" && <BrowseTab {...p} go={go} />}
      {p.tab === "auto" && p.auto && <AutoTab auto={p.auto} teams={p.teams} assignable={p.assignable} index={p.index} />}
      {p.tab === "changes" && <ChangesTab changes={p.changes} />}
      {p.tab === "settings" && p.admin && <SettingsTab config={p.config} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fix: what looks wrong
// ---------------------------------------------------------------------------

function FixTab({ issues, index, rights }: Props) {
  const act = useDo();
  const [kind, setKind] = React.useState<IssueKind | "all">("all");
  const [grade, setGrade] = React.useState("all");
  const [typed, setTyped] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const shown = issues.filter((i) => (kind === "all" || i.kind === kind) && (grade === "all" || i.gradeId === grade));
  const ready = issues.filter((i) => i.kind === "part_name" && i.suggestion).length + issues.filter((i) => i.kind === "camera_code").length;
  const counts = new Map<IssueKind, number>();
  for (const i of issues) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  if (!issues.length) return <EmptyState icon={<CheckIcon className="size-5" />} title="Nothing looks wrong" description="No placeholder names, slips in subject names or misplaced subjects were found." />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Kind of problem" className={SELECT} value={kind} onChange={(e) => setKind(e.target.value as IssueKind | "all")}>
          <option value="all">Everything ({issues.length})</option>
          {[...counts].map(([k, n]) => (
            <option key={k} value={k}>
              {KIND[k]} ({n})
            </option>
          ))}
        </select>
        <select aria-label="Grade" className={SELECT} value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="all">Any grade</option>
          {index.grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {ready > 0 && (
          <Button
            size="sm"
            className="ml-auto"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await applyAllSuggestionsAction(["part_name", "camera_code"]);
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              toast.success(`${r.data?.done ?? 0} fixed`, { description: r.data?.failed.length ? `${r.data.failed.length} could not be fixed.` : undefined });
              location.reload();
            }}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />} Use all {ready} suggested names and codes
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">Where</th>
              <th className="p-2 font-medium">Problem</th>
              <th className="p-2 font-medium">Fix</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 300).map((i) => {
              const needsName = i.kind === "part_name" || i.kind === "unit_name";
              const value = typed[i.id] ?? i.suggestion ?? "";
              const allowed = i.kind === "part_name" || i.kind === "unit_name" || i.kind === "camera_code" ? rights.rename : rights.structure;
              return (
                <tr key={i.id} className="border-t align-top" data-issue={i.id}>
                  <td className="p-2 text-xs">{i.where}</td>
                  <td className="p-2">
                    <Badge variant="secondary">{KIND[i.kind]}</Badge>
                    <span className="mt-1 block text-xs text-muted-foreground">{i.message}</span>
                    <span className="block text-xs">Now: {i.current}</span>
                  </td>
                  <td className="p-2">
                    {i.kind === "subject_place" ? (
                      <Button size="xs" variant="outline" asChild>
                        <Link href={`/curriculum?tab=browse&g=${i.gradeId}&s=${i.subjectId}`}>
                          <MoveIcon /> Open to move it
                        </Link>
                      </Button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {needsName ? <Input className="h-8 w-56" aria-label={`Name for ${i.where}`} value={value} onChange={(e) => setTyped({ ...typed, [i.id]: e.target.value })} placeholder="Type the name" /> : <span className="text-xs">{i.suggestion}</span>}
                        <Button size="xs" disabled={!allowed || (needsName && !value.trim())} onClick={() => void act(applyIssueAction(i.id, needsName ? value : null), "Fixed")}>
                          <CheckIcon /> {i.kind === "subject_typo" ? "Merge" : i.kind === "merged_unit" ? "Split" : "Use"}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length > 300 && <p className="border-t p-2 text-xs text-muted-foreground">Showing 300 of {shown.length}. Choose a grade to see the rest.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browse and edit
// ---------------------------------------------------------------------------

function NameField({ value, label, onSave }: { value: string; label: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  if (!editing)
    return (
      <button type="button" className="group inline-flex items-center gap-1 text-left hover:underline" onClick={() => setEditing(true)} aria-label={`Rename ${label}`}>
        {value}
        <PencilIcon className="size-3 opacity-40 group-hover:opacity-100" />
      </button>
    );
  const save = () => {
    setEditing(false);
    if (v.trim() && v.trim() !== value) onSave(v.trim());
  };
  return (
    <span className="inline-flex items-center gap-1">
      <Input autoFocus className="h-7 w-72 text-sm" aria-label={`New name for ${label}`} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} />
      <Button size="icon-xs" aria-label="Save the name" onClick={save}>
        <CheckIcon />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Cancel" onClick={() => setEditing(false)}>
        <XIcon />
      </Button>
    </span>
  );
}

function BrowseTab({ index, gradeId, subjectId, units, rights, go }: Props & { go: (p: Record<string, string | null>) => void }) {
  const act = useDo();
  const [dialog, setDialog] = React.useState<null | "moveSubject" | "mergeSubject" | { unit: CurriculumUnit } | { part: CurriculumUnit["parts"][number] }>(null);
  const inGrade = index.subjects.filter((s) => index.offered.some((o) => o.grade_id === gradeId && o.subject_id === s.id));
  const subject = index.subjects.find((s) => s.id === subjectId);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Grade" className={SELECT} value={gradeId ?? ""} onChange={(e) => go({ g: e.target.value, s: null })}>
          {index.grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select aria-label="Subject" className={SELECT} value={subjectId ?? ""} onChange={(e) => go({ s: e.target.value })}>
          {inGrade.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {rights.structure && subject && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { const n = prompt("Subject name", subject.name); if (n) void act(renameSubjectAction(subject.id, n), "Subject renamed"); }}>
              <PencilIcon /> Rename subject
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("moveSubject")}>
              <MoveIcon /> Move to another grade
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("mergeSubject")}>
              Merge into another subject
            </Button>
          </div>
        )}
      </div>
      {!units.length ? (
        <EmptyState title="No units here" description="This subject has no units in this grade." />
      ) : (
        units.map((u) => (
          <Card key={u.id} data-unit={u.number}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span className="text-muted-foreground">Unit {u.number}</span>
                <NameField value={u.title} label={`unit ${u.number}`} onSave={(v) => void act(renameUnitAction(u.id, v), "Unit renamed")} />
                {rights.structure && (
                  <span className="ml-auto flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => { const n = prompt("Unit number", String(u.number)); if (n) void act(renumberAction("unit", u.id, Number(n)), "Unit renumbered"); }}>
                      Number
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setDialog({ unit: u })}>
                      <MoveIcon /> Move
                    </Button>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y text-sm">
              {!u.parts.length && <p className="text-xs text-muted-foreground">No parts.</p>}
              {u.parts.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-2 py-1.5" data-part={l.number}>
                  <span className="w-12 text-xs text-muted-foreground">Part {l.number}</span>
                  <NameField value={l.title} label={`part ${l.number}`} onSave={(v) => void act(renamePartAction(l.id, v), "Part renamed")} />
                  {l.videoTitle && l.videoTitle !== l.title && <span className="truncate text-xs text-muted-foreground">Video: {l.videoTitle}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    {l.itemId && (
                      <Link href={`/items/${l.itemId}`} className="font-mono text-[11px] text-muted-foreground hover:underline">
                        {l.itemCode}
                      </Link>
                    )}
                    {rights.structure && (
                      <>
                        <Button size="xs" variant="ghost" onClick={() => { const n = prompt("Part number", String(l.number)); if (n) void act(renumberAction("part", l.id, Number(n)), "Part renumbered"); }}>
                          Number
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setDialog({ part: l })}>
                          <MoveIcon /> Move
                        </Button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
      {dialog && <MoveDialog dialog={dialog} index={index} gradeId={gradeId!} subjectId={subjectId!} units={units} onClose={() => setDialog(null)} />}
    </div>
  );
}

function MoveDialog({ dialog, index, gradeId, subjectId, units, onClose }: { dialog: "moveSubject" | "mergeSubject" | { unit: CurriculumUnit } | { part: CurriculumUnit["parts"][number] }; index: Index; gradeId: string; subjectId: string; units: CurriculumUnit[]; onClose: () => void }) {
  const act = useDo();
  const subject = index.subjects.find((s) => s.id === subjectId);
  const grade = index.grades.find((g) => g.id === gradeId);
  const [toGrade, setToGrade] = React.useState(index.grades.find((g) => g.id !== gradeId)?.id ?? gradeId);
  const [toSubject, setToSubject] = React.useState(index.subjects.find((s) => s.id !== subjectId)?.id ?? subjectId);
  const [everywhere, setEverywhere] = React.useState(false);
  const [toUnit, setToUnit] = React.useState(units[0]?.id ?? "");
  const title = dialog === "moveSubject" ? `Move ${subject?.name} out of ${grade?.name}` : dialog === "mergeSubject" ? `Merge ${subject?.name} into another subject` : "unit" in dialog ? `Move unit ${dialog.unit.number}` : `Move part ${dialog.part.number}`;
  const run = async () => {
    let ok = false;
    if (dialog === "moveSubject") ok = await act(moveSubjectAction({ subjectId, fromGradeId: gradeId, toGradeId: toGrade }), "Subject moved");
    else if (dialog === "mergeSubject") ok = await act(mergeSubjectAction({ fromId: subjectId, toId: toSubject, gradeId: everywhere ? null : gradeId }), "Subjects merged");
    else if ("unit" in dialog) ok = await act(moveUnitAction({ unitId: dialog.unit.id, gradeId: toGrade, subjectId: toSubject }), "Unit moved");
    else ok = await act(movePartAction({ lessonId: dialog.part.id, unitId: toUnit }), "Part moved");
    if (ok) onClose();
  };
  const isUnit = typeof dialog === "object" && "unit" in dialog;
  const isPart = typeof dialog === "object" && "part" in dialog;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Its work and its team assignments move with it. Item codes stay the same, because other teams&apos; files refer to them. If a number is already taken it gets the next free one.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {(dialog === "moveSubject" || isUnit) && (
            <div className="space-y-1">
              <Label htmlFor="mv-grade">To grade</Label>
              <select id="mv-grade" className={`${SELECT} w-full`} value={toGrade} onChange={(e) => setToGrade(e.target.value)}>
                {index.grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(dialog === "mergeSubject" || isUnit) && (
            <div className="space-y-1">
              <Label htmlFor="mv-subject">{isUnit ? "To subject" : "Merge into"}</Label>
              <select id="mv-subject" className={`${SELECT} w-full`} value={toSubject} onChange={(e) => setToSubject(e.target.value)}>
                {index.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {dialog === "mergeSubject" && (
            <label className="flex items-center gap-2">
              <Checkbox checked={everywhere} onCheckedChange={(v) => setEverywhere(v === true)} /> In every grade, not only {grade?.name}
            </label>
          )}
          {isPart && (
            <div className="space-y-1">
              <Label htmlFor="mv-unit">To unit</Label>
              <select id="mv-unit" className={`${SELECT} w-full`} value={toUnit} onChange={(e) => setToUnit(e.target.value)}>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.number}: {u.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={run}>{dialog === "mergeSubject" ? "Merge" : "Move"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Auto-assign
// ---------------------------------------------------------------------------

function AutoTab({ auto, teams, assignable, index }: { auto: AutoAssignConfig; teams: Record<string, { id: string; name: string }[]>; assignable: Stage[]; index: Index }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {STAGES.filter((s) => assignable.includes(s)).map((s) => (
        <AutoCard key={s} stage={s} value={auto[s]} team={teams[s] ?? []} index={index} />
      ))}
    </div>
  );
}

function AutoCard({ stage, value, team, index }: { stage: Stage; value: StageAutoAssign; team: { id: string; name: string }[]; index: Index }) {
  const act = useDo();
  const [c, setC] = React.useState(value);
  const [busy, setBusy] = React.useState(false);
  const id = `aa-${stage}`;
  return (
    <Card data-autoassign={stage}>
      <CardHeader>
        <CardTitle className="text-base">{STAGE_LABELS[stage]}</CardTitle>
        <CardDescription>Who a part goes to when it reaches this team with nobody on it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor={`${id}-mode`}>How</Label>
          <select id={`${id}-mode`} className={`${SELECT} w-full`} value={c.mode} onChange={(e) => setC({ ...c, mode: e.target.value as StageAutoAssign["mode"] })}>
            <option value="off">Off: the lead assigns</option>
            <option value="rules">Only by the rules below</option>
            <option value="least_loaded">Rules, then whoever has least open work</option>
            <option value="round_robin">Rules, then in turn</option>
          </select>
        </div>
        {(c.mode === "least_loaded" || c.mode === "round_robin") && (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Share between (none ticked: the whole team)</legend>
            {team.map((p) => (
              <label key={p.id} className="mr-3 inline-flex items-center gap-1.5">
                <Checkbox checked={c.people.includes(p.id)} aria-label={`Share with ${p.name}`} onCheckedChange={(v) => setC({ ...c, people: v ? [...c.people, p.id] : c.people.filter((x) => x !== p.id) })} /> {p.name}
              </label>
            ))}
          </fieldset>
        )}
        {c.mode !== "off" && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Rules by grade and subject</p>
            {c.rules.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5" data-rule={i}>
                <select aria-label="Rule grade" className={SELECT} value={r.gradeId ?? ""} onChange={(e) => setC({ ...c, rules: c.rules.map((x, j) => (j === i ? { ...x, gradeId: e.target.value || null } : x)) })}>
                  <option value="">Any grade</option>
                  {index.grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <select aria-label="Rule subject" className={SELECT} value={r.subjectId ?? ""} onChange={(e) => setC({ ...c, rules: c.rules.map((x, j) => (j === i ? { ...x, subjectId: e.target.value || null } : x)) })}>
                  <option value="">Any subject</option>
                  {index.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select aria-label="Rule person" className={SELECT} value={r.userId} onChange={(e) => setC({ ...c, rules: c.rules.map((x, j) => (j === i ? { ...x, userId: e.target.value } : x)) })}>
                  {team.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button size="icon-xs" variant="ghost" aria-label={`Remove rule ${i + 1}`} onClick={() => setC({ ...c, rules: c.rules.filter((_, j) => j !== i) })}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <Button size="xs" variant="outline" disabled={!team.length} onClick={() => setC({ ...c, rules: [...c.rules, { gradeId: index.grades[0]?.id ?? null, subjectId: null, userId: team[0]!.id }] })}>
              <PlusIcon /> Add a rule
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); await act(saveAutoAssignAction(stage, c), `${STAGE_LABELS[stage]} auto-assign saved`); setBusy(false); }}>
            {busy && <Loader2Icon className="animate-spin" />} Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || value.mode === "off"}
            onClick={async () => {
              setBusy(true);
              const r = await runAutoAssignAction(stage);
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              toast.success(`${r.data?.assigned ?? 0} of ${r.data?.waiting ?? 0} waiting parts assigned`);
            }}
          >
            Assign waiting parts now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ChangesTab({ changes }: { changes: Props["changes"] }) {
  if (!changes.length) return <EmptyState title="No changes yet" description="Every rename, move and merge is listed here." />;
  return (
    <ul className="divide-y rounded-lg border text-sm" data-curriculum-changes>
      {changes.map((c) => (
        <li key={c.id} className="flex flex-wrap justify-between gap-2 p-2">
          <span>{c.summary}</span>
          <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
        </li>
      ))}
    </ul>
  );
}

function SettingsTab({ config }: { config: CurriculumConfig }) {
  const act = useDo();
  const [c, setC] = React.useState(config);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Who fixes the curriculum</CardTitle>
        <CardDescription>Corrections are always listed under Changes and in the audit log.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <fieldset className="space-y-1">
          <legend className="font-medium">Teams that correct lesson, part and unit names</legend>
          {STAGES.map((s) => (
            <label key={s} className="mr-3 inline-flex items-center gap-1.5">
              <Checkbox checked={c.renameRoles.includes(s)} onCheckedChange={(v) => setC({ ...c, renameRoles: v ? [...c.renameRoles, s] : c.renameRoles.filter((x) => x !== s) })} aria-label={`${STAGE_LABELS[s]} corrects names`} /> {STAGE_LABELS[s]}
            </label>
          ))}
        </fieldset>
        <div className="space-y-1">
          <Label htmlFor="cc-structure">Who moves and merges subjects, units and parts</Label>
          <select id="cc-structure" className={`${SELECT} w-full sm:w-80`} value={c.structure} onChange={(e) => setC({ ...c, structure: e.target.value as CurriculumConfig["structure"] })}>
            <option value="planners">Planners and Admin</option>
            <option value="leads">Team leads too</option>
          </select>
        </div>
        <Button size="sm" onClick={() => void act(saveCurriculumConfigAction(c), "Saved")}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
