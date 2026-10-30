"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenIcon,
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  FileQuestionIcon,
  Loader2Icon,
  PlusIcon,
  PrinterIcon,
  RotateCwIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SavedViews } from "@/components/app/work-views";
import { StudioBoard, StudioCalendar, StudioConfigure, StudioTeam } from "./studio-views";
import type { StudioConfig, StudioTeamData, StudioWork } from "@/server/studio-extras";
import type { DeptView } from "@/server/work";
import type { TaskCheck } from "@/lib/dept-config";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/primitives";
import {
  deleteQuestionsAction,
  deleteResourcesAction,
  getResourceAction,
  importQuestionsAction,
  listQuestionsAction,
  questionsStatusAction,
  resourceStatusAction,
  setResourceChecklistAction,
  saveQuestionAction,
  saveResourceAction,
  setCardsAction,
  setExamQuestionsAction,
  studioLessonsAction,
} from "@/app/actions/departments";
import type { Question, Resource } from "@/server/studio";
import {
  DIFFICULTIES,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  RESOURCE_STATUS_LABELS,
  RESOURCE_STATUS_TONE,
  RESOURCE_STATUSES,
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  type QuestionOption,
  type QuestionType,
  type ResourceStatus,
  type ResourceType,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

type Tax = { grades: { id: string; name: string; code: string }[]; subjects: { id: string; name: string; code: string }[]; units: { id: string; gradeId: string; subjectId: string; number: number; title: string }[] };
type Access = { manage: boolean; readOnly: boolean };
type Filter = { q: string | null; status: string | null; gradeId: string | null; subjectId: string | null; unitId: string | null; type: string | null; difficulty: string | null; mine: boolean; sort: string | null; dir: "asc" | "desc"; person?: string | null };
type Placement = { gradeId: string; subjectId: string; unitId: string; lessonId: string };

function StatusTag({ status }: { status: string }) {
  const t = RESOURCE_STATUS_TONE[status as ResourceStatus] ?? "neutral";
  return (
    <span className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium" style={{ background: `var(--st-${t}-bg)`, color: `var(--st-${t}-fg)` }}>
      {RESOURCE_STATUS_LABELS[status as ResourceStatus] ?? status}
    </span>
  );
}

function csvDownload(name: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const placeLabel = (r: { grade?: string | null; subject?: string | null; unit_number?: number | null; lesson_number?: number | null }) =>
  [r.grade, r.subject, r.unit_number != null ? `U${r.unit_number}` : null, r.lesson_number != null ? `P${r.lesson_number}` : null].filter(Boolean).join(" / ") || "Not placed";

export function StudioClient({
  tab: current,
  filter,
  resources,
  questions,
  access,
  viewerId,
  openId,
  taxonomy,
  dashboard,
  work = [],
  team = null,
  studioConfig = null,
  canConfigure = false,
  people = [],
  views = [],
}: {
  tab: ResourceType | "questions" | "dashboard" | "board" | "calendar" | "team" | "configure";
  filter: Filter;
  resources: Resource[];
  questions: Question[];
  access: Access;
  viewerId: string;
  openId: string | null;
  taxonomy: Tax;
  dashboard?: React.ReactNode;
  work?: StudioWork[];
  team?: StudioTeamData | null;
  studioConfig?: StudioConfig | null;
  canConfigure?: boolean;
  people?: { id: string; name: string }[];
  views?: DeptView[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const [q, setQ] = React.useState(filter.q ?? "");
  const [open, setOpen] = React.useState<string | "new" | null>(openId);
  const [questionDialog, setQuestionDialog] = React.useState<Question | "new" | null>(null);
  React.useEffect(() => setOpen(openId), [openId]);
  const units = taxonomy.units.filter((u) => (!filter.gradeId || u.gradeId === filter.gradeId) && (!filter.subjectId || u.subjectId === filter.subjectId));
  const writable = !access.readOnly;
  const nav = (
    <Tabs value={current} onValueChange={(v) => (v === "dashboard" ? router.push(pathname) : go({ tab: v, status: null, sort: null, type: null, difficulty: null, period: null, person: null, grade: null }))}>
      <TabsList>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="board">Board</TabsTrigger>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
        {(access.manage || access.readOnly) && <TabsTrigger value="team">Team</TabsTrigger>}
        <TabsTrigger value="note">Notes</TabsTrigger>
        <TabsTrigger value="exam">Exams</TabsTrigger>
        <TabsTrigger value="flashcards">Flash cards</TabsTrigger>
        <TabsTrigger value="questions">Question bank</TabsTrigger>
        {canConfigure && <TabsTrigger value="configure">Configure</TabsTrigger>}
      </TabsList>
    </Tabs>
  );
  const [openWork, setOpenWork] = React.useState<{ id: string; type: ResourceType } | null>(null);
  const openById = (id: string) => {
    const w = work.find((x) => x.id === id) ?? team?.people.flatMap((p) => p.open).find((x) => x.id === id);
    if (w) setOpenWork({ id, type: w.type });
  };
  if (current === "board" || current === "calendar" || current === "team" || current === "configure")
    return (
      <div className="space-y-3">
        {nav}
        {current !== "configure" && current !== "team" && (
          <div className="flex flex-wrap items-center gap-2">
            <SavedViews dept="studio" views={views} canShare={access.manage && !access.readOnly} canDeleteShared={access.manage && !access.readOnly} />
            <Pick value={filter.type} onChange={(v) => go({ type: v })} placeholder="Every type" options={RESOURCE_TYPES.map((t) => ({ value: t, label: RESOURCE_TYPE_LABELS[t].many }))} />
            <Pick value={filter.gradeId} onChange={(v) => go({ g: v })} placeholder="Any grade" options={taxonomy.grades.map((g) => ({ value: g.id, label: g.name }))} />
            {(access.manage || access.readOnly) && <Pick value={filter.person ?? null} onChange={(v) => go({ person: v })} placeholder="Everyone" options={[{ value: "me", label: "Me" }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />}
          </div>
        )}
        {current === "board" && <StudioBoard work={work} manage={access.manage} viewerId={viewerId} readOnly={access.readOnly} onOpen={openById} />}
        {current === "calendar" && <StudioCalendar work={work} onOpen={openById} />}
        {current === "team" && team && <StudioTeam data={team} onOpen={openById} />}
        {current === "configure" && studioConfig && <StudioConfigure config={studioConfig} />}
        {openWork && <ResourceEditor id={openWork.id} type={openWork.type} taxonomy={taxonomy} access={access} viewerId={viewerId} people={people} onClose={() => setOpenWork(null)} />}
      </div>
    );
  if (current === "dashboard")
    return (
      <div className="space-y-3">
        {nav}
        {dashboard}
      </div>
    );
  const tab = current;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {nav}
        {writable && (
          <Button size="sm" className="ml-auto" onClick={() => (tab === "questions" ? setQuestionDialog("new") : setOpen("new"))}>
            <PlusIcon /> New {tab === "questions" ? "question" : RESOURCE_TYPE_LABELS[tab].one}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() || null });
          }}
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-48 pl-7 text-sm" />
        </form>
        <Pick value={filter.gradeId} onChange={(v) => go({ g: v, u: null })} placeholder="Any grade" options={taxonomy.grades.map((g) => ({ value: g.id, label: g.name }))} />
        <Pick value={filter.subjectId} onChange={(v) => go({ s: v, u: null })} placeholder="Any subject" options={taxonomy.subjects.map((s) => ({ value: s.id, label: s.name }))} />
        <Pick value={filter.unitId} onChange={(v) => go({ u: v })} placeholder="Any unit" options={units.map((u) => ({ value: u.id, label: `Unit ${u.number}: ${u.title}` }))} />
        {tab === "questions" ? (
          <>
            <Pick value={filter.type} onChange={(v) => go({ type: v })} placeholder="Any type" options={QUESTION_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] }))} />
            <Pick value={filter.difficulty} onChange={(v) => go({ difficulty: v })} placeholder="Any difficulty" options={DIFFICULTIES.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))} />
            <Pick value={filter.status} onChange={(v) => go({ status: v })} placeholder="Any status" options={["draft", "approved", "archived"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
          </>
        ) : (
          <>
            <Pick value={filter.status} onChange={(v) => go({ status: v })} placeholder="Any status" options={RESOURCE_STATUSES.map((s) => ({ value: s, label: RESOURCE_STATUS_LABELS[s] }))} />
            <label className="flex items-center gap-1.5 text-xs">
              <Switch checked={filter.mine} onCheckedChange={(v) => go({ mine: v ? "1" : null })} /> Only mine
            </label>
          </>
        )}
        <Pick
          value={filter.sort}
          onChange={(v) => go({ sort: v })}
          placeholder="Sort: last changed"
          options={tab === "questions" ? [{ value: "difficulty", label: "Sort: difficulty" }, { value: "type", label: "Sort: type" }] : [{ value: "title", label: "Sort: title" }, { value: "status", label: "Sort: status" }]}
        />
        <Button size="icon-sm" variant="outline" aria-label="Sort direction" onClick={() => go({ dir: filter.dir === "asc" ? null : "asc" })}>
          {filter.dir === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
        </Button>
      </div>

      {tab === "questions" ? (
        <QuestionBank questions={questions} access={access} viewerId={viewerId} onEdit={setQuestionDialog} />
      ) : (
        <ResourceList type={tab} resources={resources} access={access} viewerId={viewerId} onOpen={setOpen} />
      )}

      {open && tab !== "questions" && <ResourceEditor id={open === "new" ? null : open} type={tab} taxonomy={taxonomy} access={access} viewerId={viewerId} people={people} onClose={() => (setOpen(null), openId && go({ open: null }))} />}
      {questionDialog && <QuestionDialog question={questionDialog === "new" ? null : questionDialog} taxonomy={taxonomy} access={access} onClose={() => setQuestionDialog(null)} onSaved={() => (setQuestionDialog(null), router.refresh())} />}
    </div>
  );
}

function Pick({ value, onChange, placeholder, options }: { value: string | null; onChange: (v: string | null) => void; placeholder: string; options: { value: string; label: string }[] }) {
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? null : v)}>
      <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label={placeholder}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Notes, exams and decks
// ---------------------------------------------------------------------------

function ResourceList({ type, resources, access, viewerId, onOpen }: { type: ResourceType; resources: Resource[]; access: Access; viewerId: string; onOpen: (id: string) => void }) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const ids = [...picked].filter((id) => resources.some((r) => r.id === id));
  if (!resources.length)
    return <EmptyState icon={<BookOpenIcon className="size-5" />} title={`No ${RESOURCE_TYPE_LABELS[type].many.toLowerCase()}`} description="Change the filters, or create one." />;
  const exportCsv = (list: Resource[]) =>
    csvDownload(`studio-${type}-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["title", "status", "version", "grade", "subject", "unit", "part", "author", "updated", type === "note" ? "text" : "items"],
      ...list.map((r) => [r.title, r.status, r.version, r.grade, r.subject, r.unit_number, r.lesson_number, r.author_name, r.updated_at.slice(0, 10), type === "note" ? r.body : r.count]),
    ]);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => exportCsv(resources)}>
          <DownloadIcon /> Export
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 p-2">
                <Checkbox checked={ids.length === resources.length ? true : ids.length ? "indeterminate" : false} onCheckedChange={(v) => setPicked(v ? new Set(resources.map((r) => r.id)) : new Set())} aria-label="Select all" />
              </th>
              <th className="p-2 font-medium">Title</th>
              <th className="p-2 font-medium">Placement</th>
              <th className="p-2 font-medium">Status</th>
              {type !== "note" && <th className="p-2 text-right font-medium">{type === "exam" ? "Questions" : "Cards"}</th>}
              <th className="p-2 font-medium">Author</th>
              <th className="p-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id} className={cn("border-t", picked.has(r.id) && "bg-primary/5")}>
                <td className="p-2">
                  <Checkbox checked={picked.has(r.id)} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(r.id)) : (s.delete(r.id), new Set(s))))} />
                </td>
                <td className="max-w-[320px] p-2">
                  <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(r.id)}>
                    {r.title}
                  </button>
                  {r.version > 1 && <span className="ml-1 text-xs text-muted-foreground">v{r.version}</span>}
                  {r.review_note && r.status === "draft" && <span className="block truncate text-xs text-[var(--st-paused-fg)]">Changes: {r.review_note}</span>}
                </td>
                <td className="p-2 text-xs">{placeLabel(r)}</td>
                <td className="p-2">
                  <StatusTag status={r.status} />
                </td>
                {type !== "note" && <td className="p-2 text-right tabular">{r.count}</td>}
                <td className="p-2 text-xs">{r.author_name ?? "-"}</td>
                <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">{r.updated_at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ids.length > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-lg">
          <span className="text-sm font-medium tabular">{ids.length} selected</span>
          <Button size="xs" variant="outline" onClick={() => exportCsv(resources.filter((r) => picked.has(r.id)))}>
            <DownloadIcon /> Export
          </Button>
          {!access.readOnly && (
            <Button
              size="xs"
              variant="outline"
              className="text-destructive"
              disabled={!access.manage && resources.some((r) => picked.has(r.id) && (r.author_id !== viewerId || r.status !== "draft"))}
              onClick={async () => {
                if (!window.confirm(`Delete ${ids.length}? This cannot be undone.`)) return;
                const r = await deleteResourcesAction(ids);
                if (!r.ok) return toast.error(r.error);
                setPicked(new Set());
                router.refresh();
              }}
            >
              <Trash2Icon /> Delete
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => setPicked(new Set())}>
            <XIcon /> Clear
          </Button>
        </div>
      )}
    </div>
  );
}

function PlacementFields({ value, onChange, taxonomy, disabled }: { value: Placement; onChange: (p: Placement) => void; taxonomy: Tax; disabled?: boolean }) {
  const [lessons, setLessons] = React.useState<{ id: string; number: number; title: string }[]>([]);
  React.useEffect(() => {
    if (!value.unitId) return setLessons([]);
    void studioLessonsAction(value.unitId).then((r) => r.ok && setLessons(r.data as typeof lessons));
  }, [value.unitId]);
  const units = taxonomy.units.filter((u) => u.gradeId === value.gradeId && u.subjectId === value.subjectId);
  const sel = (v: string, set: (v: string) => void, opts: { value: string; label: string }[], none: string) => (
    <Select value={v || "none"} onValueChange={(x) => set(x === "none" ? "" : x)} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{none}</SelectItem>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {sel(value.gradeId, (v) => onChange({ gradeId: v, subjectId: value.subjectId, unitId: "", lessonId: "" }), taxonomy.grades.map((g) => ({ value: g.id, label: g.name })), "No grade")}
      {sel(value.subjectId, (v) => onChange({ ...value, subjectId: v, unitId: "", lessonId: "" }), taxonomy.subjects.map((s) => ({ value: s.id, label: s.name })), "No subject")}
      {sel(value.unitId, (v) => onChange({ ...value, unitId: v, lessonId: "" }), units.map((u) => ({ value: u.id, label: `Unit ${u.number}: ${u.title}` })), "No unit")}
      {sel(value.lessonId, (v) => onChange({ ...value, lessonId: v }), lessons.map((l) => ({ value: l.id, label: `Part ${l.number}: ${l.title}` })), "No part")}
    </div>
  );
}

type Loaded = { resource: Resource; questions: (Question & { points: number })[]; cards: { id: string; front: string; back: string }[] };

function ResourceEditor({
  id,
  type,
  taxonomy,
  access,
  viewerId,
  people = [],
  onClose,
}: {
  id: string | null;
  type: ResourceType;
  taxonomy: Tax;
  access: Access;
  viewerId: string;
  people?: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = React.useState<Loaded | null>(null);
  const [f, setF] = React.useState({ title: "", body: "", language: "en", durationMin: "", passMark: "", instructions: "", assigneeId: "", dueDate: "" });
  const [place, setPlace] = React.useState<Placement>({ gradeId: "", subjectId: "", unitId: "", lessonId: "" });
  const [examQs, setExamQs] = React.useState<(Question & { points: number })[]>([]);
  const [cards, setCards] = React.useState<{ front: string; back: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [bank, setBank] = React.useState(false);
  const [study, setStudy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [newQuestion, setNewQuestion] = React.useState(false);
  const load = React.useCallback(async () => {
    if (!id) return;
    const r = await getResourceAction(id);
    if (!r.ok) return toast.error(r.error);
    const d = r.data as unknown as Loaded;
    setData(d);
    setF({
      title: d.resource.title,
      body: d.resource.body,
      language: d.resource.language,
      durationMin: String(d.resource.meta.durationMin ?? ""),
      passMark: String(d.resource.meta.passMark ?? ""),
      instructions: d.resource.meta.instructions ?? "",
      assigneeId: d.resource.assignee_id ?? "",
      dueDate: d.resource.due_date ?? "",
    });
    setPlace({ gradeId: d.resource.grade_id ?? "", subjectId: d.resource.subject_id ?? "", unitId: d.resource.unit_id ?? "", lessonId: d.resource.lesson_id ?? "" });
    setExamQs(d.questions);
    setCards(d.cards.map((c) => ({ front: c.front, back: c.back })));
  }, [id]);
  React.useEffect(() => void load(), [load]);
  const r = data?.resource;
  const own = !r || r.author_id === viewerId || r.assignee_id === viewerId;
  const canEdit = !access.readOnly && (own || access.manage);

  const save = async (andClose = false) => {
    setBusy(true);
    try {
      const saved = await saveResourceAction({
        id: id ?? undefined,
        type,
        title: f.title,
        language: f.language,
        body: f.body,
        meta: type === "exam" ? { durationMin: Number(f.durationMin) || undefined, passMark: Number(f.passMark) || undefined, instructions: f.instructions || undefined } : {},
        assigneeId: f.assigneeId || null,
        dueDate: f.dueDate || null,
        ...place,
      });
      if (!saved.ok) throw new Error(saved.error);
      const rid = saved.data as string;
      if (type === "exam") {
        const q = await setExamQuestionsAction(rid, examQs.map((x) => ({ questionId: x.id, points: x.points })));
        if (!q.ok) throw new Error(q.error);
      }
      if (type === "flashcards") {
        const c = await setCardsAction(rid, cards);
        if (!c.ok) throw new Error(c.error);
      }
      toast.success(r?.status === "published" ? "Saved as a new draft version; submit it for review to publish again" : "Saved");
      router.refresh();
      if (andClose || !id) onClose();
      else await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  const act = async (action: Parameters<typeof resourceStatusAction>[1], msg: string) => {
    const res = await resourceStatusAction(id!, action, note || null);
    if (!res.ok) return toast.error(res.error);
    toast.success(msg);
    setNote("");
    router.refresh();
    await load();
  };
  const printExam = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const total = examQs.reduce((s, q) => s + q.points, 0);
    w.document.write(`<!doctype html><title>${esc(f.title)}</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;line-height:1.5}h1{font-size:22px}.q{margin:18px 0}.o{margin-left:22px}.k{margin-top:40px;page-break-before:always}</style>
<h1>${esc(f.title)}</h1><p>${f.durationMin ? `Time: ${f.durationMin} minutes. ` : ""}Total: ${total} points.${f.passMark ? ` Pass mark: ${f.passMark}.` : ""}</p><p>${esc(f.instructions)}</p><p>Name: ______________________</p>
${examQs.map((q, i) => `<div class="q"><b>${i + 1}.</b> ${esc(q.stem)} <i>(${q.points} pt)</i>${q.options.map((o, j) => `<div class="o">${String.fromCharCode(65 + j)}. ${esc(o.text)}</div>`).join("")}${q.type === "short" ? "<p>____________________________</p>" : q.type === "essay" ? "<p style='height:120px'></p>" : ""}</div>`).join("")}
<div class="k"><h2>Answer key</h2>${examQs.map((q, i) => `<p>${i + 1}. ${q.type === "mcq" || q.type === "multi" ? q.options.map((o, j) => (o.correct ? String.fromCharCode(65 + j) : "")).filter(Boolean).join(", ") : q.type === "true_false" ? (q.options.find((o) => o.correct)?.text ?? "") : esc(q.answer ?? "")}</p>`).join("")}</div>`);
    w.document.close();
    w.print();
  };

  if (id && !data)
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogTitle>Loading</DialogTitle>
          <Loader2Icon className="mx-auto size-5 animate-spin" />
        </DialogContent>
      </Dialog>
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {id ? f.title || "Untitled" : `New ${RESOURCE_TYPE_LABELS[type].one}`}
            {r && <StatusTag status={r.status} />}
            {r && r.version > 1 && <span className="text-xs font-normal text-muted-foreground">version {r.version}</span>}
          </DialogTitle>
          <DialogDescription>
            {r ? `By ${r.author_name ?? "unknown"}, updated ${r.updated_at.slice(0, 10)}${r.reviewer_name ? `; reviewed by ${r.reviewer_name}` : ""}.` : "Saved as a draft. Submit it for review when it is ready."}
            {r?.review_note && <span className="mt-1 block text-[var(--st-paused-fg)]">Review note: {r.review_note}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title" disabled={!canEdit} />
            <Select value={f.language} onValueChange={(v) => setF({ ...f, language: v })} disabled={!canEdit}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="am">Amharic</SelectItem>
                <SelectItem value="om">Afaan Oromo</SelectItem>
                <SelectItem value="ti">Tigrinya</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <PlacementFields value={place} onChange={setPlace} taxonomy={taxonomy} disabled={!canEdit} />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Assigned to</Label>
              <Select value={f.assigneeId || "none"} onValueChange={(v) => setF({ ...f, assigneeId: v === "none" ? "" : v })} disabled={!canEdit}>
                <SelectTrigger className="w-full" aria-label="Assigned to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">The author</SelectItem>
                  {(access.manage ? people : people.filter((p) => p.id === viewerId)).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="res-due">
                Due
              </Label>
              <Input id="res-due" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} disabled={!canEdit} />
            </div>
          </div>
          {r && r.checklist.length > 0 && <ReviewChecklist id={r.id} lines={r.checklist} canTick={canEdit} canVerify={access.manage && !access.readOnly} onChanged={async () => void (await load())} />}

          {type === "note" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Note (Markdown: # headings, **bold**, - lists, tables)</Label>
                <Button size="xs" variant="ghost" onClick={() => setPreview((p) => !p)}>
                  <EyeIcon /> {preview ? "Edit" : "Preview"}
                </Button>
              </div>
              {preview ? (
                <div className="max-h-[50vh] overflow-y-auto rounded-lg border p-3 text-sm whitespace-pre-wrap">{f.body || "Nothing yet."}</div>
              ) : (
                <Textarea rows={16} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} disabled={!canEdit} className="font-mono text-sm" />
              )}
            </div>
          )}

          {type === "exam" && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Time (minutes)</Label>
                  <Input type="number" min={0} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} disabled={!canEdit} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pass mark (points)</Label>
                  <Input type="number" min={0} value={f.passMark} onChange={(e) => setF({ ...f, passMark: e.target.value })} disabled={!canEdit} />
                </div>
                <div className="flex items-end text-sm text-muted-foreground">
                  {examQs.length} questions, {examQs.reduce((s, q) => s + q.points, 0)} points
                </div>
              </div>
              <Textarea rows={2} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="Instructions for students" disabled={!canEdit} />
              <div className="space-y-1.5 rounded-lg border p-2">
                {examQs.map((q, i) => (
                  <div key={q.id} className="flex items-start gap-2 rounded-md bg-muted/40 p-2 text-sm">
                    <span className="w-6 text-right text-muted-foreground tabular">{i + 1}.</span>
                    <span className="min-w-0 flex-1">
                      {q.stem}
                      <span className="block text-xs text-muted-foreground">
                        {QUESTION_TYPE_LABELS[q.type as QuestionType]} · {q.difficulty}
                      </span>
                    </span>
                    {canEdit && (
                      <>
                        <Input type="number" min={0.5} step={0.5} value={q.points} onChange={(e) => setExamQs((l) => l.map((x) => (x.id === q.id ? { ...x, points: Number(e.target.value) || 1 } : x)))} className="h-7 w-16 text-xs" aria-label="Points" />
                        <Button size="icon-xs" variant="ghost" aria-label="Up" disabled={i === 0} onClick={() => setExamQs((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>
                          <ArrowUpIcon />
                        </Button>
                        <Button size="icon-xs" variant="ghost" aria-label="Down" disabled={i === examQs.length - 1} onClick={() => setExamQs((l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>
                          <ArrowDownIcon />
                        </Button>
                        <Button size="icon-xs" variant="ghost" aria-label="Remove" onClick={() => setExamQs((l) => l.filter((x) => x.id !== q.id))}>
                          <XIcon />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
                {!examQs.length && <p className="p-2 text-xs text-muted-foreground">No questions yet.</p>}
                {canEdit && (
                  <div className="flex gap-2">
                    <Button size="xs" variant="outline" onClick={() => setBank(true)}>
                      <FileQuestionIcon /> Add from the bank
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => setNewQuestion(true)}>
                      <PlusIcon /> Write a new question
                    </Button>
                  </div>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={printExam} disabled={!examQs.length}>
                <PrinterIcon /> Print with answer key
              </Button>
            </div>
          )}

          {type === "flashcards" && (
            <CardsEditor cards={cards} setCards={setCards} canEdit={canEdit} onStudy={() => setStudy(true)} />
          )}

          {r && !access.readOnly && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <Label>Review</Label>
              {access.manage && (r.status === "review" || r.status === "approved") && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the author (required to request changes)" />}
              <div className="flex flex-wrap gap-2">
                {r.status === "draft" && own && (
                  <Button size="sm" onClick={() => act("submit", "Submitted for review")}>
                    Submit for review
                  </Button>
                )}
                {access.manage && r.status === "review" && (
                  <>
                    <Button size="sm" onClick={() => act("approve", "Approved")}>
                      <CheckIcon /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act("publish", "Published")}>
                      Approve and publish
                    </Button>
                    <Button size="sm" variant="outline" disabled={!note.trim()} onClick={() => act("changes", "Sent back with your note")}>
                      Request changes
                    </Button>
                  </>
                )}
                {access.manage && r.status === "approved" && (
                  <>
                    <Button size="sm" onClick={() => act("publish", "Published")}>
                      Publish
                    </Button>
                    <Button size="sm" variant="outline" disabled={!note.trim()} onClick={() => act("changes", "Sent back with your note")}>
                      Request changes
                    </Button>
                  </>
                )}
                {access.manage && r.status === "published" && (
                  <Button size="sm" variant="outline" onClick={() => act("unpublish", "Unpublished")}>
                    Unpublish
                  </Button>
                )}
                {(own || access.manage) && r.status !== "archived" && (
                  <Button size="sm" variant="ghost" onClick={() => act("archive", "Archived")}>
                    Archive
                  </Button>
                )}
                {(own || access.manage) && r.status === "archived" && (
                  <Button size="sm" variant="ghost" onClick={() => act("restore", "Restored as a draft")}>
                    Restore
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button disabled={busy || !f.title.trim()} onClick={() => save(false)}>
              {busy && <Loader2Icon className="animate-spin" />} Save
            </Button>
          )}
        </DialogFooter>

        {bank && <BankPicker subjectId={place.subjectId} gradeId={place.gradeId} exclude={examQs.map((q) => q.id)} onClose={() => setBank(false)} onPick={(qs) => setExamQs((l) => [...l, ...qs.map((q) => ({ ...q, points: 1 }))])} />}
        {newQuestion && (
          <QuestionDialog
            question={null}
            taxonomy={taxonomy}
            access={access}
            defaults={place}
            onClose={() => setNewQuestion(false)}
            onSaved={async (qid) => {
              setNewQuestion(false);
              const r2 = await listQuestionsAction({});
              const q = r2.ok ? (r2.data as Question[]).find((x) => x.id === qid) : undefined;
              if (q) setExamQs((l) => [...l, { ...q, points: 1 }]);
            }}
          />
        )}
        {study && <StudyCards cards={cards} onClose={() => setStudy(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CardsEditor({ cards, setCards, canEdit, onStudy }: { cards: { front: string; back: string }[]; setCards: React.Dispatch<React.SetStateAction<{ front: string; back: string }[]>>; canEdit: boolean; onStudy: () => void }) {
  const [paste, setPaste] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label>{cards.length} cards</Label>
        <Button size="xs" variant="outline" className="ml-auto" onClick={onStudy} disabled={!cards.length}>
          <RotateCwIcon /> Study preview
        </Button>
        {canEdit && (
          <>
            <Button size="xs" variant="outline" onClick={() => setPaste("")}>
              Paste many
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                Papa.parse<string[]>(file, {
                  skipEmptyLines: true,
                  complete: (res) => {
                    const rows = res.data.filter((r) => r[0] && r[1] && !/^front$/i.test(r[0].trim()));
                    setCards((c) => [...c, ...rows.map((r) => ({ front: r[0], back: r[1] }))]);
                    toast.success(`${rows.length} cards added`);
                  },
                });
                e.target.value = "";
              }}
            />
            <Button size="xs" variant="outline" onClick={() => fileRef.current?.click()} title="Two columns: front, back">
              <UploadIcon /> CSV
            </Button>
          </>
        )}
        <Button size="xs" variant="outline" onClick={() => csvDownload("flashcards.csv", [["front", "back"], ...cards.map((c) => [c.front, c.back])])} disabled={!cards.length}>
          <DownloadIcon /> CSV
        </Button>
      </div>
      {paste !== null && (
        <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
          <Label className="text-xs">One card per line: front | back</Label>
          <Textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Photosynthesis | How plants make food from light\nMitochondria | The cell's power plant"} />
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={() => setPaste(null)}>
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={() => {
                const add = paste
                  .split(/\r?\n/)
                  .map((l) => l.split("|"))
                  .filter((p) => p.length >= 2 && p[0].trim() && p[1].trim())
                  .map((p) => ({ front: p[0].trim(), back: p.slice(1).join("|").trim() }));
                setCards((c) => [...c, ...add]);
                setPaste(null);
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
      <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
        {cards.map((c, i) => (
          <div key={i} className="flex gap-2">
            <span className="w-6 pt-2 text-right text-xs text-muted-foreground tabular">{i + 1}</span>
            <Textarea rows={2} value={c.front} onChange={(e) => setCards((l) => l.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} placeholder="Front" disabled={!canEdit} />
            <Textarea rows={2} value={c.back} onChange={(e) => setCards((l) => l.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))} placeholder="Back" disabled={!canEdit} />
            {canEdit && (
              <Button size="icon-xs" variant="ghost" aria-label="Remove card" onClick={() => setCards((l) => l.filter((_, j) => j !== i))}>
                <XIcon />
              </Button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <Button size="xs" variant="ghost" onClick={() => setCards((l) => [...l, { front: "", back: "" }])}>
          <PlusIcon /> Add card
        </Button>
      )}
    </div>
  );
}

function StudyCards({ cards, onClose }: { cards: { front: string; back: string }[]; onClose: () => void }) {
  const list = cards.filter((c) => c.front && c.back);
  const [i, setI] = React.useState(0);
  const [flip, setFlip] = React.useState(false);
  const c = list[i];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Card {i + 1} of {list.length}
          </DialogTitle>
          <DialogDescription>Tap the card to turn it over.</DialogDescription>
        </DialogHeader>
        {c && (
          <button type="button" onClick={() => setFlip((f) => !f)} className={cn("flex min-h-48 items-center justify-center rounded-xl border p-6 text-center text-lg transition-colors", flip ? "bg-primary/10" : "bg-card")}>
            {flip ? c.back : c.front}
          </button>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={i === 0} onClick={() => (setI(i - 1), setFlip(false))}>
            Previous
          </Button>
          <Button disabled={i >= list.length - 1} onClick={() => (setI(i + 1), setFlip(false))}>
            Next
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BankPicker({ subjectId, gradeId, exclude, onClose, onPick }: { subjectId: string; gradeId: string; exclude: string[]; onClose: () => void; onPick: (qs: Question[]) => void }) {
  const [rows, setRows] = React.useState<Question[] | null>(null);
  const [q, setQ] = React.useState("");
  const [sameSubject, setSameSubject] = React.useState(!!subjectId);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    void listQuestionsAction(sameSubject ? { subjectId: subjectId || null, gradeId: gradeId || null } : {}).then((r) => (r.ok ? setRows(r.data as Question[]) : toast.error(r.error)));
  }, [sameSubject, subjectId, gradeId]);
  const shown = (rows ?? []).filter((x) => !exclude.includes(x.id) && x.status !== "archived" && (!q || `${x.stem} ${x.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add questions from the bank</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions and tags" className="h-8 flex-1" />
          {subjectId && (
            <label className="flex items-center gap-1.5 text-xs">
              <Switch checked={sameSubject} onCheckedChange={setSameSubject} /> Same grade and subject
            </label>
          )}
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto rounded-lg border p-1">
          {!rows && <Loader2Icon className="mx-auto my-4 size-4 animate-spin" />}
          {shown.map((x) => (
            <label key={x.id} className={cn("flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-muted/50", picked.has(x.id) && "bg-primary/5")}>
              <Checkbox checked={picked.has(x.id)} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(x.id)) : (s.delete(x.id), new Set(s))))} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                {x.stem}
                <span className="block text-xs text-muted-foreground">
                  {QUESTION_TYPE_LABELS[x.type as QuestionType]} · {x.difficulty} · {x.status}
                  {x.tags.length ? ` · ${x.tags.join(", ")}` : ""}
                </span>
              </span>
            </label>
          ))}
          {rows && !shown.length && <p className="p-3 text-center text-xs text-muted-foreground">No questions match.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!picked.size}
            onClick={() => {
              onPick((rows ?? []).filter((x) => picked.has(x.id)));
              onClose();
            }}
          >
            Add {picked.size}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

function QuestionBank({ questions, access, viewerId, onEdit }: { questions: Question[]; access: Access; viewerId: string; onEdit: (q: Question) => void }) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const fileRef = React.useRef<HTMLInputElement>(null);
  const ids = [...picked].filter((id) => questions.some((q) => q.id === id));
  const letters = (q: Question) => q.options.map((o, i) => (o.correct ? String.fromCharCode(97 + i) : "")).filter(Boolean).join(";");
  const exportCsv = (list: Question[]) =>
    csvDownload(`question-bank-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["type", "question", "option_a", "option_b", "option_c", "option_d", "option_e", "option_f", "correct", "answer", "explanation", "difficulty", "tags", "grade", "subject", "unit_number", "status"],
      ...list.map((q) => [
        q.type,
        q.stem,
        ...Array.from({ length: 6 }, (_, i) => (q.type === "true_false" ? "" : (q.options[i]?.text ?? ""))),
        q.type === "true_false" ? (q.options.find((o) => o.correct)?.text.toLowerCase() ?? "") : letters(q),
        q.answer,
        q.explanation,
        q.difficulty,
        q.tags.join(";"),
        q.grade,
        q.subject,
        q.unit_number,
        q.status,
      ]),
    ]);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    const r = await fn();
    if (!r.ok) return toast.error(r.error);
    toast.success(msg);
    setPicked(new Set());
    router.refresh();
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        {!access.readOnly && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                Papa.parse<Record<string, string>>(file, {
                  header: true,
                  skipEmptyLines: true,
                  transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
                  complete: async (res) => {
                    const r = await importQuestionsAction(res.data);
                    if (fileRef.current) fileRef.current.value = "";
                    if (!r.ok) return toast.error(r.error);
                    const d = r.data as { created: number; errors: string[] };
                    if (d.errors.length) toast.warning(`${d.created} imported, ${d.errors.length} skipped`, { description: d.errors.slice(0, 4).join("\n"), duration: 12000 });
                    else toast.success(`${d.created} questions imported`);
                    router.refresh();
                  },
                });
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} title="Columns: type, question, option_a to option_f, correct (a;c or true/false), answer, explanation, difficulty, tags, grade_code, subject_code, unit_number">
              <UploadIcon /> Import CSV
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => exportCsv(questions)} disabled={!questions.length}>
          <DownloadIcon /> Export CSV
        </Button>
      </div>
      {!questions.length ? (
        <EmptyState icon={<FileQuestionIcon className="size-5" />} title="No questions" description="Write questions here or import them, then use them in exams." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 p-2">
                  <Checkbox checked={ids.length === questions.length ? true : ids.length ? "indeterminate" : false} onCheckedChange={(v) => setPicked(v ? new Set(questions.map((q) => q.id)) : new Set())} aria-label="Select all" />
                </th>
                <th className="p-2 font-medium">Question</th>
                <th className="p-2 font-medium">Type</th>
                <th className="p-2 font-medium">Difficulty</th>
                <th className="p-2 font-medium">Placement</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 text-right font-medium">In exams</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id} className={cn("border-t", picked.has(q.id) && "bg-primary/5")}>
                  <td className="p-2">
                    <Checkbox checked={picked.has(q.id)} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(q.id)) : (s.delete(q.id), new Set(s))))} />
                  </td>
                  <td className="max-w-[420px] p-2">
                    <button type="button" className="line-clamp-2 text-left hover:underline" onClick={() => onEdit(q)}>
                      {q.stem}
                    </button>
                    {q.tags.length > 0 && <span className="text-xs text-muted-foreground">{q.tags.join(", ")}</span>}
                  </td>
                  <td className="p-2 text-xs">{QUESTION_TYPE_LABELS[q.type as QuestionType]}</td>
                  <td className="p-2 text-xs capitalize">{q.difficulty}</td>
                  <td className="p-2 text-xs">{placeLabel(q)}</td>
                  <td className="p-2 text-xs capitalize">{q.status}</td>
                  <td className="p-2 text-right tabular">{q.used ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ids.length > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-lg">
          <span className="text-sm font-medium tabular">{ids.length} selected</span>
          {access.manage && (
            <Button size="xs" variant="outline" onClick={() => run(() => questionsStatusAction(ids, "approved"), "Approved")}>
              <CheckIcon /> Approve
            </Button>
          )}
          {!access.readOnly && (
            <>
              <Button size="xs" variant="outline" onClick={() => run(() => questionsStatusAction(ids, "draft"), "Back to draft")}>
                Draft
              </Button>
              <Button size="xs" variant="outline" onClick={() => run(() => questionsStatusAction(ids, "archived"), "Archived")}>
                Archive
              </Button>
            </>
          )}
          <Button size="xs" variant="outline" onClick={() => exportCsv(questions.filter((q) => picked.has(q.id)))}>
            <DownloadIcon /> Export
          </Button>
          {!access.readOnly && (
            <Button
              size="xs"
              variant="outline"
              className="text-destructive"
              disabled={!access.manage && questions.some((q) => picked.has(q.id) && q.author_id !== viewerId)}
              onClick={() => window.confirm(`Delete ${ids.length} questions?`) && run(() => deleteQuestionsAction(ids), "Deleted")}
            >
              <Trash2Icon /> Delete
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => setPicked(new Set())}>
            <XIcon /> Clear
          </Button>
        </div>
      )}
    </div>
  );
}

function QuestionDialog({
  question,
  taxonomy,
  access,
  defaults,
  onClose,
  onSaved,
}: {
  question: Question | null;
  taxonomy: Tax;
  access: Access;
  defaults?: Placement;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [type, setType] = React.useState<QuestionType>((question?.type as QuestionType) ?? "mcq");
  const [stem, setStem] = React.useState(question?.stem ?? "");
  const [options, setOptions] = React.useState<QuestionOption[]>(question?.options.length && question.type !== "true_false" ? question.options : [{ id: "", text: "", correct: false }, { id: "", text: "", correct: false }, { id: "", text: "", correct: false }, { id: "", text: "", correct: false }]);
  const [answer, setAnswer] = React.useState(question?.type === "true_false" ? (question.options.find((o) => o.correct)?.id === "t" ? "true" : "false") : (question?.answer ?? ""));
  const [explanation, setExplanation] = React.useState(question?.explanation ?? "");
  const [difficulty, setDifficulty] = React.useState(question?.difficulty ?? "medium");
  const [tags, setTags] = React.useState(question?.tags.join(", ") ?? "");
  const [approved, setApproved] = React.useState(question?.status === "approved");
  const [place, setPlace] = React.useState<Placement>({
    gradeId: question?.grade_id ?? defaults?.gradeId ?? "",
    subjectId: question?.subject_id ?? defaults?.subjectId ?? "",
    unitId: question?.unit_id ?? defaults?.unitId ?? "",
    lessonId: question?.lesson_id ?? defaults?.lessonId ?? "",
  });
  const [busy, setBusy] = React.useState(false);
  const choice = type === "mcq" || type === "multi";
  const readOnly = access.readOnly;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{question ? "Question" : "New question"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={type} onValueChange={(v) => setType(v as QuestionType)} disabled={readOnly}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {QUESTION_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={difficulty} onValueChange={setDifficulty} disabled={readOnly}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d[0].toUpperCase() + d.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea rows={3} value={stem} onChange={(e) => setStem(e.target.value)} placeholder="The question" disabled={readOnly} />
          {choice && (
            <div className="space-y-1.5">
              <Label>Options (tick the correct {type === "multi" ? "ones" : "one"})</Label>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 text-xs text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                  <Checkbox
                    checked={o.correct}
                    disabled={readOnly}
                    onCheckedChange={(v) => setOptions((l) => l.map((x, j) => (j === i ? { ...x, correct: !!v } : type === "mcq" && v ? { ...x, correct: false } : x)))}
                    aria-label="Correct"
                  />
                  <Input value={o.text} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} disabled={readOnly} className="h-8" />
                  {options.length > 2 && !readOnly && (
                    <Button size="icon-xs" variant="ghost" aria-label="Remove option" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))}>
                      <XIcon />
                    </Button>
                  )}
                </div>
              ))}
              {options.length < 6 && !readOnly && (
                <Button size="xs" variant="ghost" onClick={() => setOptions((l) => [...l, { id: "", text: "", correct: false }])}>
                  <PlusIcon /> Option
                </Button>
              )}
            </div>
          )}
          {type === "true_false" && (
            <Select value={answer || "none"} onValueChange={(v) => setAnswer(v === "none" ? "" : v)} disabled={readOnly}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose the answer</SelectItem>
                <SelectItem value="true">True</SelectItem>
                <SelectItem value="false">False</SelectItem>
              </SelectContent>
            </Select>
          )}
          {(type === "short" || type === "essay") && <Textarea rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={type === "essay" ? "Marking guide" : "Expected answer"} disabled={readOnly} />}
          <Textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explanation shown after answering (optional)" disabled={readOnly} />
          <PlacementFields value={place} onChange={setPlace} taxonomy={taxonomy} disabled={readOnly} />
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags: fractions, word problems" disabled={readOnly} />
          {access.manage && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={approved} onCheckedChange={setApproved} /> Approved for everyone&apos;s exams
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button
              disabled={busy || !stem.trim()}
              onClick={async () => {
                setBusy(true);
                const r = await saveQuestionAction({
                  id: question?.id,
                  type,
                  stem,
                  options: choice ? options : [],
                  answer: type === "true_false" ? answer : answer || null,
                  explanation,
                  difficulty,
                  tags: tags.split(","),
                  status: approved ? "approved" : question?.status === "archived" ? "archived" : "draft",
                  ...place,
                });
                setBusy(false);
                if (!r.ok) return toast.error(r.error);
                toast.success("Question saved");
                onSaved(r.data as string);
              }}
            >
              {busy && <Loader2Icon className="animate-spin" />} Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewChecklist({ id, lines, canTick, canVerify, onChanged }: { id: string; lines: TaskCheck[]; canTick: boolean; canVerify: boolean; onChanged: () => Promise<void> }) {
  const set = async (next: TaskCheck[]) => {
    const r = await setResourceChecklistAction(id, next);
    if (!r.ok) return toast.error(r.error);
    await onChanged();
  };
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <Label>Review checklist</Label>
      <ul className="space-y-1">
        {lines.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 text-sm">
            <Checkbox aria-label={`Done: ${c.text}`} checked={c.done} disabled={!canTick} onCheckedChange={(v) => set(lines.map((x, j) => (j === i ? { ...x, done: v === true, verifiedBy: v === true ? x.verifiedBy : null } : x)))} />
            <span className={cn("flex-1", c.done && "text-muted-foreground line-through")}>{c.text}</span>
            {c.verify && (
              <Button size="xs" variant={c.verifiedBy ? "secondary" : "outline"} disabled={!canVerify || !c.done} onClick={() => set(lines.map((x, j) => (j === i ? { ...x, verifiedBy: x.verifiedBy ? null : "me" } : x)))}>
                {c.verifiedBy ? "Verified" : "Verify"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
