"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/app/multi-select";
import { createItemAction } from "@/app/actions/items";
import { COMPLEXITY_LABELS, PRIORITY_LABELS, STAGE_LABELS, STAGES, type Role, type Stage } from "@/lib/domain";
import { endOfLocalDayIso, localInputToIso } from "@/lib/format";

type Opts = {
  grades: { id: string; code: string; name: string }[];
  subjects: { id: string; code: string; name: string }[];
  gradeSubjects: { grade_id: string; subject_id: string }[];
  units: { id: string; gradeId: string; subjectId: string; number: number; title: string }[];
  lessons: { id: string; unitId: string; number: number; title: string; title_am: string | null; objectives: string | null; items: number }[];
  users: { id: string; name: string; roles: Role[] }[];
  lists: { deliverableTypes: { key: string; label: string; codeSuffix: string }[]; contentTypes: { key: string; label: string }[]; languages: { code: string; label: string }[] };
  destinations: { key: string; label: string; requiredByDefault: boolean }[];
  tz: string;
  prefix: string;
};

const DRAFT_KEY = "myseed:new-item-draft";

export function NewItemForm({ o }: { o: Opts }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [f, setF] = React.useState<Record<string, string>>({ deliverableType: "main_video", contentType: "lesson_video", language: "en", priority: "normal", complexity: "standard" });
  const [owners, setOwners] = React.useState<Partial<Record<Stage, string | null>>>({});
  const [dest, setDest] = React.useState<Record<string, "required" | "optional" | "none">>(Object.fromEntries(o.destinations.map((d) => [d.key, d.requiredByDefault ? "required" : "none"])));
  const [extra, setExtra] = React.useState<{ gradeId: string; subjectId: string }[]>([]);
  const [release, setRelease] = React.useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  // Unsaved drafts survive a refresh or an accidental navigation.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        setF((x) => ({ ...x, ...d.f }));
        if (d.owners) setOwners(d.owners);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ f, owners }));
    } catch {
      /* storage unavailable */
    }
  }, [f, owners]);

  const subjects = o.subjects.filter((s) => o.gradeSubjects.some((g) => g.grade_id === f.gradeId && g.subject_id === s.id));
  const units = o.units.filter((u) => u.gradeId === f.gradeId && u.subjectId === f.subjectId);
  const lessons = o.lessons.filter((l) => l.unitId === f.unitId);
  const grade = o.grades.find((g) => g.id === f.gradeId);
  const subject = o.subjects.find((s) => s.id === f.subjectId);
  const unit = o.units.find((u) => u.id === f.unitId);
  const lesson = o.lessons.find((l) => l.id === f.lessonId);
  const suffix = o.lists.deliverableTypes.find((d) => d.key === f.deliverableType)?.codeSuffix;
  const lessonNo = lesson?.number ?? (f.lessonNumber ? Number(f.lessonNumber) : null);
  const preview = grade && subject ? [o.prefix, grade.code, subject.code, unit ? `U${String(unit.number).padStart(2, "0")}` : null, lessonNo ? `L${String(lessonNo).padStart(2, "0")}` : null, suffix || null].filter(Boolean).join("-") : "Choose grade and subject";

  const submit = async () => {
    if (!f.gradeId || !f.subjectId || !f.title?.trim()) return toast.error("Grade, subject and title are required.");
    setBusy(true);
    const res = await createItemAction({
      gradeId: f.gradeId,
      subjectId: f.subjectId,
      unitId: f.unitId || null,
      lessonId: f.lessonId && f.lessonId !== "new" ? f.lessonId : null,
      lessonNumber: f.lessonId === "new" && f.lessonNumber ? Number(f.lessonNumber) : null,
      lessonTitle: f.lessonTitle || null,
      deliverableType: f.deliverableType,
      title: f.title,
      titleAm: f.titleAm || null,
      objectives: f.objectives || null,
      language: f.language,
      contentType: f.contentType,
      teacher: f.teacher || null,
      targetDurationMin: f.target ? Number(f.target) : null,
      complexity: f.complexity,
      complexityNote: f.complexityNote || null,
      priority: f.priority,
      tags: (f.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      plannedPublishAt: f.planned ? localInputToIso(`${f.planned}T09:00`, o.tz) : null,
      dueAt: f.due ? endOfLocalDayIso(f.due, o.tz) : null,
      owners,
      requiredDestinations: Object.entries(dest).filter(([, v]) => v === "required").map(([k]) => k),
      optionalDestinations: Object.entries(dest).filter(([, v]) => v === "optional").map(([k]) => k),
      secondaryMemberships: extra.filter((e) => e.gradeId && e.subjectId),
      release,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    const d = res.data as { id: string; code: string };
    toast.success(`Created ${d.code}`, { description: release ? "Queued for Recording" : "Saved as Not started" });
    router.push(`/items/${d.id}`);
  };

  const sel = (k: string, opts: { value: string; label: string }[], placeholder = "Choose", onChange?: (v: string) => void) => (
    <Select value={f[k] ?? ""} onValueChange={(v) => (onChange ? onChange(v) : set(k, v))}>
      <SelectTrigger id={`n-${k}`} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opts.map((x) => (
          <SelectItem key={x.value} value={x.value}>
            {x.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const field = (id: string, label: string, el: React.ReactNode, hint?: string, wide?: boolean) => (
    <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={`n-${id}`}>{label}</Label>
      {el}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Curriculum</CardTitle>
            <CardDescription>Place the deliverable in the planned lesson inventory. Coverage reports compare production against this inventory.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {field("gradeId", "Grade", sel("gradeId", o.grades.map((g) => ({ value: g.id, label: g.name })), "Choose grade", (v) => setF((x) => ({ ...x, gradeId: v, subjectId: "", unitId: "", lessonId: "" }))))}
            {field("subjectId", "Subject", sel("subjectId", subjects.map((s) => ({ value: s.id, label: s.name })), f.gradeId ? "Choose subject" : "Choose a grade first", (v) => setF((x) => ({ ...x, subjectId: v, unitId: "", lessonId: "" }))))}
            {field("unitId", "Unit", sel("unitId", units.map((u) => ({ value: u.id, label: `Unit ${u.number}: ${u.title}` })), units.length ? "Choose unit" : "No units yet", (v) => setF((x) => ({ ...x, unitId: v, lessonId: "" }))))}
            {field(
              "lessonId",
              "Lesson",
              sel(
                "lessonId",
                [...lessons.map((l) => ({ value: l.id, label: `Lesson ${l.number}: ${l.title}${l.items ? ` (${l.items} item${l.items > 1 ? "s" : ""})` : ""}` })), { value: "new", label: "Add a new lesson to this unit" }],
                f.unitId ? "Choose lesson" : "Choose a unit first",
                (v) => {
                  const l = o.lessons.find((x) => x.id === v);
                  setF((x) => ({ ...x, lessonId: v, title: x.title || l?.title || "", titleAm: x.titleAm || l?.title_am || "", objectives: x.objectives || l?.objectives || "" }));
                },
              ),
            )}
            {f.lessonId === "new" && (
              <>
                {field("lessonNumber", "New lesson number", <Input id="n-lessonNumber" type="number" min={1} value={f.lessonNumber ?? ""} onChange={(e) => set("lessonNumber", e.target.value)} />)}
                {field("lessonTitle", "New lesson title", <Input id="n-lessonTitle" value={f.lessonTitle ?? ""} onChange={(e) => set("lessonTitle", e.target.value)} />)}
              </>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label>Also appears in (secondary placements)</Label>
              {extra.map((e, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={e.gradeId} onValueChange={(v) => setExtra((x) => x.map((y, j) => (j === i ? { gradeId: v, subjectId: "" } : y)))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Grade" /></SelectTrigger>
                    <SelectContent>{o.grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={e.subjectId} onValueChange={(v) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, subjectId: v } : y)))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Subject" /></SelectTrigger>
                    <SelectContent>{o.subjects.filter((s) => o.gradeSubjects.some((g) => g.grade_id === e.gradeId && g.subject_id === s.id)).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" aria-label="Remove placement" onClick={() => setExtra((x) => x.filter((_, j) => j !== i))}><XIcon /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setExtra((x) => [...x, { gradeId: "", subjectId: "" }])}><PlusIcon /> Add placement</Button>
              <p className="text-xs text-muted-foreground">Shared content is stored once; merged totals count it once.</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Deliverable</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {field("title", "Title", <Input id="n-title" value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} />, undefined, true)}
            {field("titleAm", "Title (Amharic, optional)", <Input id="n-titleAm" lang="am" className="ethiopic" value={f.titleAm ?? ""} onChange={(e) => set("titleAm", e.target.value)} />, undefined, true)}
            {field("deliverableType", "Deliverable type", sel("deliverableType", o.lists.deliverableTypes.map((d) => ({ value: d.key, label: d.label }))))}
            {field("contentType", "Content type", sel("contentType", o.lists.contentTypes.map((d) => ({ value: d.key, label: d.label }))))}
            {field("language", "Language", sel("language", o.lists.languages.map((d) => ({ value: d.code, label: d.label }))))}
            {field("teacher", "Teacher or presenter", <Input id="n-teacher" value={f.teacher ?? ""} onChange={(e) => set("teacher", e.target.value)} />, "Metadata only; presenters do not need accounts.")}
            {field("target", "Target duration (min)", <Input id="n-target" type="number" min={1} value={f.target ?? ""} onChange={(e) => set("target", e.target.value)} />)}
            {field("complexity", "Complexity", sel("complexity", Object.entries(COMPLEXITY_LABELS).map(([value, label]) => ({ value, label }))))}
            {field("complexityNote", "Complexity justification", <Input id="n-complexityNote" value={f.complexityNote ?? ""} onChange={(e) => set("complexityNote", e.target.value)} placeholder="Two demonstrations and animated diagrams" />, undefined, true)}
            {field("objectives", "Learning objectives", <Textarea id="n-objectives" value={f.objectives ?? ""} onChange={(e) => set("objectives", e.target.value)} placeholder="Separate objectives with semicolons" />, undefined, true)}
            {field("tags", "Tags", <Input id="n-tags" value={f.tags ?? ""} onChange={(e) => set("tags", e.target.value)} placeholder="pilot, term-1" />, "Comma separated.", true)}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>Code preview: <span className="font-mono text-foreground">{preview}</span></CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {field("priority", "Priority", sel("priority", Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))))}
            {field("due", "Due date", <Input id="n-due" type="date" value={f.due ?? ""} onChange={(e) => set("due", e.target.value)} />, "Becomes the original deadline baseline.")}
            {field("planned", "Planned publication date", <Input id="n-planned" type="date" value={f.planned ?? ""} onChange={(e) => set("planned", e.target.value)} />)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Owners</CardTitle>
            <CardDescription>Optional now; unassigned stages alert managers when work arrives.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {STAGES.map((st) => (
              <div key={st} className="grid grid-cols-[90px_1fr] items-center gap-2">
                <span className="text-xs font-medium">{STAGE_LABELS[st]}</span>
                <Combobox size="sm" options={o.users.filter((u) => u.roles.includes(st)).map((u) => ({ value: u.id, label: u.name }))} value={owners[st] ?? null} onChange={(v) => setOwners((x) => ({ ...x, [st]: v }))} placeholder="Unassigned" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Destinations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {o.destinations.map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-2">
                <span className="text-sm">{d.label}</span>
                <Select value={dest[d.key]} onValueChange={(v) => setDest((x) => ({ ...x, [d.key]: v as never }))}>
                  <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                    <SelectItem value="none">Not used</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={release} onCheckedChange={(v) => setRelease(!!v)} className="mt-0.5" />
              <span>
                Put it in the Recording queue now
                <span className="block text-xs text-muted-foreground">Otherwise it is saved as Not started. Either way, Recording staff press Start when they begin and it shows In progress.</span>
              </span>
            </label>
            <Button className="w-full" disabled={busy} onClick={submit}>
              {busy && <Loader2Icon className="animate-spin" />}
              {release ? "Create and queue" : "Create"}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setF({ deliverableType: "main_video", contentType: "lesson_video", language: "en", priority: "normal", complexity: "standard" });
                setOwners({});
                try {
                  localStorage.removeItem(DRAFT_KEY);
                } catch {
                  /* ignore */
                }
              }}
            >
              Clear form
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
