"use client";
import * as React from "react";
import { toast } from "sonner";
import {
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleAlertIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FileUpIcon,
  GraduationCapIcon,
  LayersIcon,
  ListChecksIcon,
  Loader2Icon,
  PencilIcon,
  PlayCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SquareIcon,
  StickyNoteIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MetricCard, EmptyState } from "@/components/app/primitives";
import { StatusStrip, Toolbar, ViewSwitcher } from "@/components/app/page-kit";
import { cn } from "@/lib/utils";
import { cancelContentJobAction, contentJobAction, contentOverviewAction, contentSubjectAction, parseImportFileAction, parseQuestionsAction, startContentJobAction } from "@/app/actions/noor-content";
import type { ContentJobInput, ContentLesson, ContentQuestion, ContentQuiz, ContentStats, ContentSubject, ContentUnit, LessonInput } from "@/server/noor-content";

type ListedSubject = { id: string; name: string; grades: string[]; code: string | null; units: number; lessons: number; stats: ContentStats | null; fetchedAt: string | null };
type Overview = { subjects: ListedSubject[]; listedAt: string; listError: string | null; live: boolean; jobs: Job[]; canEdit: boolean; noorBase: string };
type Job = { id: string; kind: string; subject_id: string; title: string; status: string; done: number; total: number; progress: string; updated_at: string; created_at: string; log?: { at: string; step: string; ok: boolean; message: string }[] };
type Loaded = { subject: ContentSubject; stats: ContentStats; grades: string[]; fetchedAt: string };
const fmt = (n: number | undefined) => (n ?? 0).toLocaleString("en-US");
const mmss = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");
const n = (v: number | undefined, one: string, many = `${one}s`) => `${fmt(v)} ${(v ?? 0) === 1 ? one : many}`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const LETTERS = "ABCDEF";

// Legacy CMS > Content: Noor's academic content managed from here. Subjects by grade with what each has; a subject
// as units, lessons (video, notes, quizzes), quizzes with their questions; adding units, lessons, notes and quizzes
// (imported in bulk and sent to Noor in batches through Noor's own forms); and the report of what is available.
export function CmsContentView() {
  const [o, setO] = React.useState<Overview | null>(null);
  const [view, setView] = React.useState<"subjects" | "report" | "jobs">("subjects");
  const [open, setOpen] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [listing, setListing] = React.useState(false);
  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setListing(true);
    const r = await contentOverviewAction(refresh);
    setListing(false);
    if (r.ok) setO(r.data as Overview);
    else setError(r.error ?? "Could not load.");
  }, []);
  React.useEffect(() => void load(), [load]);
  // Running jobs: followed until they finish.
  const running = o?.jobs.some((j) => j.status === "running" || j.status === "queued");
  React.useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [running, load]);

  const startJob = async (input: ContentJobInput) => {
    const r = await startContentJobAction(input);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Sent to Noor. Follow it under Jobs.");
    await load();
    return (r.data as { id: string }).id;
  };

  if (error && !o) return <StatusStrip tone="danger">{error}</StatusStrip>;
  if (!o)
    return (
      <div className="space-y-3" data-content-loading>
        <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/50" />)}</div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2Icon className="size-3.5 animate-spin" /> Reading Noor&apos;s subject list…</p>
      </div>
    );
  const units = o.subjects.reduce((k, s) => k + s.units, 0);
  const lessons = o.subjects.reduce((k, s) => k + s.lessons, 0);
  const grades = new Set(o.subjects.flatMap((s) => s.grades)).size;
  return (
    <div className="space-y-4" data-content-view>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Subjects" value={fmt(o.subjects.length)} hint={n(grades, "grade")} />
        <MetricCard label="Units" value={fmt(units)} hint="In Noor's list" />
        <MetricCard label="Lessons" value={fmt(lessons)} hint="In Noor's list" />
        <MetricCard label="Changes sent" value={fmt(o.jobs.filter((j) => j.status === "done").length)} hint={running ? "One running now" : "Through Noor's forms"} />
      </div>
      <Toolbar
        label="Content"
        end={
          <div className="flex flex-wrap items-center gap-2">
            {o.live ? (
              <>
                <span className="text-xs text-muted-foreground">List from Noor {ago(o.listedAt)}</span>
                <Button size="sm" variant="outline" disabled={listing} onClick={() => void load(true)} data-content-refresh-list>
                  <RefreshCwIcon className={listing ? "animate-spin" : ""} /> Refresh list
                </Button>
                <Button size="sm" variant="outline" disabled={!!o.jobs.find((j) => j.kind === "refresh" && (j.status === "running" || j.status === "queued"))} onClick={() => void startJob({ kind: "refresh", subjectId: "all" })} title="Reads every subject, one at a time, at Noor protection's pace" data-content-collect>
                  <DownloadIcon /> Collect from Noor (slow)
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Saved copy: the subjects collected from Noor</span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" data-content-export>
                  <DownloadIcon /> Report
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild><a href="/api/legacy-cms/content-report?format=xlsx">Excel</a></DropdownMenuItem>
                <DropdownMenuItem asChild><a href="/api/legacy-cms/content-report?format=csv">CSV</a></DropdownMenuItem>
                <DropdownMenuItem asChild><a href="/export/cms-report?list=noor-content" target="_blank" rel="noreferrer">PDF</a></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <ViewSwitcher label="Content views" value={view} onChange={setView} options={[["subjects", "Subjects"], ["report", "Report"], ["jobs", `Jobs${running ? " ·" : ""}`]]} />
      </Toolbar>
      {o.listError && <StatusStrip tone="warning">{o.listError}</StatusStrip>}
      {!o.subjects.length && <EmptyState icon={<BookOpenIcon className="size-5" />} title="Noor lists no subjects" description="Noor's Academic Content list is empty, or this Noor login cannot see it." />}
      {view === "subjects" && o.subjects.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <SubjectList subjects={o.subjects} open={open} onOpen={setOpen} />
          {open ? <SubjectPane key={open} id={open} live={o.live} listed={o.subjects.find((s) => s.id === open) ?? null} canEdit={o.canEdit && o.live} noorBase={o.noorBase} jobs={o.jobs.filter((j) => j.subject_id === open)} startJob={startJob} /> : <EmptyState icon={<LayersIcon className="size-5" />} title="Choose a subject" description="Its units, lessons, notes and quizzes show here." />}
        </div>
      )}
      {view === "report" && <ContentReport subjects={o.subjects} onOpen={(id) => (setOpen(id), setView("subjects"))} />}
      {view === "jobs" && <JobList jobs={o.jobs} subjects={o.subjects} />}
    </div>
  );
}

const ZERO: ContentStats = { units: 0, lessons: 0, videos: 0, freePreviews: 0, minutes: 0, lessonsWithNotes: 0, notes: 0, pdfs: 0, quizzes: 0, questions: 0, flashcards: 0, lessonsWithoutVideo: 0, lessonsWithoutNotes: 0, unitsWithoutQuiz: 0, unitsWithoutLessons: 0 };
function sum(list: ContentStats[]) {
  const t: Record<string, number> = { ...ZERO };
  for (const s of list) for (const [k, v] of Object.entries(s ?? {})) t[k] = (t[k] ?? 0) + Number(v ?? 0);
  return t as ContentStats;
}

// A bar of how complete something is.
function Coverage({ value, of, label, tone = "bg-primary" }: { value: number; of: number; label: string; tone?: string }) {
  const p = pct(value, of);
  return (
    <div className="space-y-0.5" title={`${label}: ${value} of ${of}`}>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span>{p}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function SubjectList({ subjects, open, onOpen }: { subjects: Overview["subjects"]; open: string | null; onOpen: (id: string) => void }) {
  const [q, setQ] = React.useState("");
  const [grade, setGrade] = React.useState<string>("");
  const grades = [...new Set(subjects.flatMap((s) => s.grades))].sort((a, b) => (parseInt(a.replace(/\D/g, "")) || 0) - (parseInt(b.replace(/\D/g, "")) || 0) || a.localeCompare(b));
  const shown = subjects.filter((s) => (!grade || s.grades.includes(grade)) && (!q || s.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <aside className="space-y-2" aria-label="Subjects">
      <div className="relative">
        <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subjects" className="pl-8" aria-label="Search subjects" />
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => setGrade("")} className={cn("rounded-full border px-2.5 py-0.5 text-xs", !grade && "border-primary bg-primary/10 text-primary")}>All</button>
        {grades.map((g) => (
          <button key={g} type="button" onClick={() => setGrade(g)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", grade === g && "border-primary bg-primary/10 text-primary")} data-grade-filter={g}>
            {g.replace(/^Grade\s*/i, "G")}
          </button>
        ))}
      </div>
      <ul className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
        {shown.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onOpen(s.id)} className={cn("w-full space-y-2 rounded-xl border bg-card p-3 text-left transition hover:border-primary/50", open === s.id && "border-primary ring-1 ring-primary/30")} data-subject={s.id}>
              <span className="flex items-start gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><GraduationCapIcon className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.name}</span>
                  <span className="block text-xs text-muted-foreground">{s.grades.join(", ") || "No grade"} · {n(s.units, "unit")} · {n(s.lessons, "lesson")}</span>
                </span>
                {s.code && <span className="rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{s.code}</span>}
              </span>
              {s.stats && (
                <span className="grid grid-cols-3 gap-2">
                  <Coverage label="Video" value={s.stats.videos ?? 0} of={s.stats.lessons ?? 0} />
                  <Coverage label="Notes" value={s.stats.lessonsWithNotes ?? 0} of={s.stats.lessons ?? 0} tone="bg-sky-500" />
                  <Coverage label="Quizzes" value={(s.stats.units ?? 0) - (s.stats.unitsWithoutQuiz ?? 0)} of={s.stats.units ?? 0} tone="bg-emerald-500" />
                </span>
              )}
            </button>
          </li>
        ))}
        {!shown.length && <li className="p-4 text-center text-sm text-muted-foreground">No subject matches.</li>}
      </ul>
    </aside>
  );
}

type Dialogs =
  | { kind: "quiz"; unit: ContentUnit; lesson?: ContentLesson; quiz?: ContentQuiz }
  | { kind: "lessons"; unit: ContentUnit }
  | { kind: "units" }
  | { kind: "note"; unit: ContentUnit; lesson?: ContentLesson }
  | { kind: "edit-lesson"; unit: ContentUnit; lesson: ContentLesson }
  | { kind: "edit-unit"; unit: ContentUnit }
  | { kind: "questions"; quiz: ContentQuiz };

function SubjectPane({ id, live, listed, canEdit, noorBase, jobs, startJob }: { id: string; live: boolean; listed: ListedSubject | null; canEdit: boolean; noorBase: string; jobs: Job[]; startJob: (i: ContentJobInput) => Promise<string | undefined> }) {
  const [d, setD] = React.useState<Loaded | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<Dialogs | null>(null);
  const [expanded, setExpanded] = React.useState<number[]>([]);
  const load = React.useCallback(
    async (refresh: boolean) => {
      setBusy(true);
      const r = await contentSubjectAction(id, refresh);
      setBusy(false);
      if (r.ok) (setD(r.data as Loaded), setFailed(null));
      else (setFailed(r.error ?? "Noor did not open this subject."), refresh && toast.error(r.error));
      return r.ok ? (r.data as Loaded) : null;
    },
    [id],
  );
  // Opening: the copy from the last time it was opened shows at once, and Noor's current one replaces it. Never
  // opened: it is read from Noor now.
  React.useEffect(() => {
    let stop = false;
    (async () => {
      // Without live access only the collected copy is shown; with it, the copy at once and Noor's when older than
      // ten minutes (one heavy page, through Noor protection).
      if (listed?.fetchedAt || !live) {
        const cached = await load(false);
        if (stop || !cached || !live) return;
        if (Date.now() - Date.parse(cached.fetchedAt) > 10 * 60e3) await load(true);
      } else await load(true);
    })();
    return () => {
      stop = true;
    };
    // Once per subject opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // When a job on this subject finishes, read it again.
  const lastDone = jobs.find((j) => j.status === "done" || j.status === "failed")?.updated_at;
  const seen = React.useRef(lastDone);
  React.useEffect(() => {
    if (lastDone && lastDone !== seen.current) {
      seen.current = lastDone;
      void load(false);
    }
  }, [lastDone, load]);
  if (!d)
    return (
      <section className="min-w-0 space-y-3" aria-busy={!failed} data-subject-loading>
        <div className="rounded-2xl border bg-card p-4 shadow-xs">
          <p className="text-xs text-muted-foreground">{listed?.grades.join(", ")}{listed?.code ? ` · ${listed.code}` : ""}</p>
          <h2 className="text-xl font-bold">{listed?.name ?? "Subject"}</h2>
          {failed ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-destructive" data-subject-failed>
              <CircleAlertIcon className="size-4" /> {failed}
              <Button size="sm" variant="outline" onClick={() => void load(true)}><RefreshCwIcon /> Try again</Button>
            </div>
          ) : (
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Loader2Icon className="size-3.5 animate-spin" /> Opening it in Noor{listed ? ` · ${n(listed.units, "unit")}, ${n(listed.lessons, "lesson")}` : ""}…</p>
          )}
        </div>
        {!failed && Array.from({ length: Math.min(6, Math.max(2, listed?.units ?? 3)) }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-2xl border bg-muted/40" />)}
      </section>
    );
  const s = d.subject;
  const st = d.stats;
  const runningHere = jobs.find((j) => j.status === "running" || j.status === "queued");
  const toggle = (uid: number) => setExpanded((x) => (x.includes(uid) ? x.filter((y) => y !== uid) : [...x, uid]));
  const editUrl = `${noorBase}/admin/academic-contents/${s.id}/edit`;
  return (
    <section className="min-w-0 space-y-3" aria-label={s.name} data-subject-pane={s.id}>
      <div className="rounded-2xl border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{d.grades.join(", ") || "Grade not read"} {s.code ? `· ${s.code}` : ""} {s.stem ? "· STEM" : ""}</p>
            <h2 className="truncate text-xl font-bold">{s.name}</h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-subject-fresh={busy ? "updating" : "current"}>
              {busy ? (
                <>
                  <Loader2Icon className="size-3 animate-spin" /> Updating from Noor (showing the copy from {ago(d.fetchedAt)})
                </>
              ) : (
                <>{live ? "From Noor" : "Saved copy"}, read {ago(d.fetchedAt)}</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {live && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void load(true)} data-subject-refresh>
                <RefreshCwIcon className={busy ? "animate-spin" : ""} /> Read again
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <a href={editUrl} target="_blank" rel="noreferrer"><ExternalLinkIcon /> Open in Noor</a>
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => setDialog({ kind: "units" })} data-add-units>
                <PlusIcon /> Add units
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {[
            [LayersIcon, n(st.units, "unit")],
            [PlayCircleIcon, `${n(st.lessons, "lesson")} · ${fmt(st.videos)} with video`],
            [ClockIcon, st.minutes >= 60 ? `${Math.floor(st.minutes / 60)} h ${st.minutes % 60} min of video` : `${st.minutes} min of video`],
            [StickyNoteIcon, `${n(st.notes, "note")} · ${n(st.pdfs, "PDF")}`],
            [ListChecksIcon, `${n(st.quizzes, "quiz", "quizzes")} · ${n(st.questions, "question")}`],
            [BookOpenIcon, n(st.freePreviews, "free preview")],
          ].map(([Icon, label], i) => {
            const I = Icon as typeof LayersIcon;
            return (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                <I className="size-3.5 text-primary" /> {label as string}
              </span>
            );
          })}
        </div>
        {(st.lessonsWithoutVideo > 0 || st.lessonsWithoutNotes > 0 || st.unitsWithoutQuiz > 0) && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-700 dark:text-amber-400" data-content-gaps>
            <CircleAlertIcon className="size-3.5" />
            {st.lessonsWithoutVideo > 0 && <span>{n(st.lessonsWithoutVideo, "lesson")} without a playable video</span>}
            {st.lessonsWithoutNotes > 0 && <span>{n(st.lessonsWithoutNotes, "lesson")} without notes</span>}
            {st.unitsWithoutQuiz > 0 && <span>{n(st.unitsWithoutQuiz, "unit")} without a quiz</span>}
          </p>
        )}
        {runningHere && <JobStrip job={runningHere} />}
      </div>
      <div className="flex justify-end gap-2 text-xs">
        <button type="button" className="text-primary" onClick={() => setExpanded(s.units.map((u) => u.id))}>Expand all</button>
        <button type="button" className="text-primary" onClick={() => setExpanded([])}>Collapse all</button>
      </div>
      <ol className="space-y-2">
        {s.units.map((u, ui) => {
          const isOpen = expanded.includes(u.id);
          const questions = [...u.quizzes, ...u.lessons.flatMap((l) => l.quizzes)].reduce((n, q) => n + q.questions.length, 0);
          return (
            <li key={u.id} className="overflow-hidden rounded-2xl border bg-card shadow-xs" data-unit={u.id}>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button type="button" onClick={() => toggle(u.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={isOpen}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{ui + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{u.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {n(u.lessons.length, "lesson")} · {n(u.quizzes.length + u.lessons.reduce((k, l) => k + l.quizzes.length, 0), "quiz", "quizzes")} ({n(questions, "question")}) · {n(u.notes.length + u.lessons.reduce((k, l) => k + l.notes.length, 0), "note")}
                    </span>
                  </span>
                  <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" data-unit-actions={u.id}><PlusIcon /> Add</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDialog({ kind: "lessons", unit: u })}><PlayCircleIcon /> Lessons (one or many)</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDialog({ kind: "quiz", unit: u })}><ListChecksIcon /> Quiz (import questions)</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDialog({ kind: "note", unit: u })}><StickyNoteIcon /> Unit note</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDialog({ kind: "edit-unit", unit: u })}><PencilIcon /> Change the unit</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {isOpen && (
                <div className="space-y-3 border-t bg-muted/20 p-3">
                  {u.description && <p className="text-xs whitespace-pre-line text-muted-foreground">{u.description}</p>}
                  <ul className="space-y-1.5">
                    {u.lessons.map((l) => (
                      <LessonRow key={l.id} l={l} canEdit={canEdit} onEdit={() => setDialog({ kind: "edit-lesson", unit: u, lesson: l })} onQuiz={() => setDialog({ kind: "quiz", unit: u, lesson: l })} onNote={() => setDialog({ kind: "note", unit: u, lesson: l })} onQuestions={(q) => setDialog({ kind: "questions", quiz: q })} />
                    ))}
                    {!u.lessons.length && <li className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">No lessons yet.</li>}
                  </ul>
                  {u.notes.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Unit notes</p>
                      {u.notes.map((n) => <NoteChip key={n.id} n={n} />)}
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Unit quizzes</p>
                    {u.quizzes.map((q) => (
                      <div key={q.id} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm" data-quiz={q.id}>
                        <ListChecksIcon className="size-4 text-emerald-600" />
                        <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => setDialog({ kind: "questions", quiz: q })}>{q.title}</button>
                        <span className="text-xs text-muted-foreground">{n(q.questions.length, "question")}{q.timeLimit ? ` · ${Math.round(q.timeLimit / 60)} min` : ""}</span>
                        {canEdit && <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "quiz", unit: u, quiz: q })} data-quiz-append={q.id}><PlusIcon /> Questions</Button>}
                      </div>
                    ))}
                    {!u.quizzes.length && <p className="text-xs text-muted-foreground">No unit quiz.</p>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {s.quizzes.length > 0 && (
        <div className="space-y-1 rounded-2xl border bg-card p-3">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Subject quizzes</p>
          {s.quizzes.map((q) => (
            <button key={q.id} type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setDialog({ kind: "questions", quiz: q })}>
              <ListChecksIcon className="size-4 text-emerald-600" /> <span className="flex-1">{q.title}</span> <span className="text-xs text-muted-foreground">{q.questions.length} questions</span>
            </button>
          ))}
        </div>
      )}
      {dialog && <ContentDialog d={dialog} subject={s} close={() => setDialog(null)} startJob={startJob} />}
    </section>
  );
}

function LessonRow({ l, canEdit, onEdit, onQuiz, onNote, onQuestions }: { l: ContentLesson; canEdit: boolean; onEdit: () => void; onQuiz: () => void; onNote: () => void; onQuestions: (q: ContentQuiz) => void }) {
  const video = !!l.video.youtube || !!l.video.url;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-2" data-lesson={l.id}>
      <a href={l.video.youtube ? `https://www.youtube.com/watch?v=${l.video.youtube}` : undefined} target="_blank" rel="noreferrer" className="relative block h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-muted" aria-label={video ? `Watch ${l.title}` : "No video"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {l.video.youtube ? <img src={`https://i.ytimg.com/vi/${l.video.youtube}/mqdefault.jpg`} alt="" className="size-full object-cover" loading="lazy" /> : <span className="flex size-full items-center justify-center"><PlayCircleIcon className={cn("size-5", video ? "text-primary" : "text-muted-foreground/50")} /></span>}
        {l.duration ? <span className="absolute right-0.5 bottom-0.5 rounded bg-black/75 px-1 text-[10px] text-white">{mmss(l.duration)}</span> : null}
      </a>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{l.title}</p>
        <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
          {!video && <span className="rounded-full bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">No video</span>}
          {l.video.url && !l.video.youtube && <span className="rounded-full bg-muted px-1.5">Uploaded{l.video.status ? ` · ${l.video.status}` : ""}</span>}
          {l.free && <span className="rounded-full bg-emerald-100 px-1.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Free preview</span>}
          {l.notes.map((n) => <NoteChip key={n.id} n={n} small />)}
          {l.quizzes.map((q) => (
            <button key={q.id} type="button" onClick={() => onQuestions(q)} className="rounded-full bg-emerald-100 px-1.5 text-emerald-800 hover:underline dark:bg-emerald-950 dark:text-emerald-200">
              Quiz · {q.questions.length} q
            </button>
          ))}
          {l.flashcards > 0 && <span className="rounded-full bg-violet-100 px-1.5 text-violet-800 dark:bg-violet-950 dark:text-violet-200">{l.flashcards} flashcard decks</span>}
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-1">
          <Button size="icon-sm" variant="ghost" aria-label={`Change ${l.title}`} title="Change the lesson" onClick={onEdit} data-lesson-edit={l.id}><PencilIcon /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Add a note to ${l.title}`} title="Add a note" onClick={onNote}><StickyNoteIcon /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Add a quiz to ${l.title}`} title="Add a quiz" onClick={onQuiz} data-lesson-quiz={l.id}><ListChecksIcon /></Button>
        </div>
      )}
    </li>
  );
}

function NoteChip({ n, small }: { n: { id: number; text: string; pdf: string | null }; small?: boolean }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200", small ? "px-1.5 text-[10px]" : "px-2 py-0.5 text-xs")} title={n.text}>
      <FileTextIcon className="size-3" /> {n.pdf ? "PDF note" : "Note"}
      {!small && n.text && <span className="truncate opacity-80">· {n.text.slice(0, 60)}</span>}
    </span>
  );
}

function JobStrip({ job }: { job: Job }) {
  return (
    <div className="mt-3 space-y-1 rounded-xl bg-primary/5 p-2 text-xs" data-job-strip>
      <div className="flex items-center gap-2">
        <Loader2Icon className="size-3.5 animate-spin text-primary" />
        <span className="font-medium">{job.title}</span>
        <span className="ml-auto text-muted-foreground">{job.done} of {job.total || "?"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct(job.done, job.total || 1)}%` }} /></div>
      <p className="text-muted-foreground">{job.progress}</p>
    </div>
  );
}

// --- Dialogs: what is sent to Noor ------------------------------------------------------------

function ContentDialog({ d, subject, close, startJob }: { d: Dialogs; subject: ContentSubject; close: () => void; startJob: (i: ContentJobInput) => Promise<string | undefined> }) {
  const title =
    d.kind === "quiz" ? (d.quiz ? `Add questions to "${d.quiz.title}"` : `New quiz in ${d.lesson ? `"${d.lesson.title}"` : d.unit.title}`) : d.kind === "lessons" ? `Add lessons to ${d.unit.title}` : d.kind === "units" ? `Add units to ${subject.name}` : d.kind === "note" ? `Add a note to ${d.lesson ? d.lesson.title : d.unit.title}` : d.kind === "edit-lesson" ? "Change the lesson" : d.kind === "edit-unit" ? "Change the unit" : d.quiz.title;
  const send = async (i: ContentJobInput) => {
    const id = await startJob(i);
    if (id) close();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {d.kind !== "questions" && <DialogDescription>Sent to Noor through Noor&apos;s own form, as a person there would, {d.kind === "quiz" ? "in batches of questions" : "one at a time"}. Follow it under Jobs.</DialogDescription>}
        </DialogHeader>
        {d.kind === "questions" && <QuestionList quiz={d.quiz} />}
        {d.kind === "quiz" && <QuizImport unit={d.unit} lesson={d.lesson} quiz={d.quiz} subjectId={subject.id} send={send} />}
        {d.kind === "lessons" && <LessonsImport unitId={d.unit.id} subjectId={subject.id} send={send} />}
        {d.kind === "units" && <UnitsForm subjectId={subject.id} send={send} />}
        {d.kind === "note" && <NoteForm subjectId={subject.id} unitId={d.unit.id} lessonId={d.lesson?.id ?? null} send={send} />}
        {d.kind === "edit-lesson" && <LessonEdit subjectId={subject.id} unitId={d.unit.id} lesson={d.lesson} send={send} />}
        {d.kind === "edit-unit" && <UnitEdit subjectId={subject.id} unit={d.unit} send={send} />}
      </DialogContent>
    </Dialog>
  );
}

function QuestionList({ quiz }: { quiz: ContentQuiz }) {
  return (
    <ol className="space-y-2" data-question-list>
      {quiz.questions.map((q, i) => (
        <li key={q.id ?? i} className="rounded-xl border p-3 text-sm">
          <p className="font-medium whitespace-pre-line"><span className="text-muted-foreground">{i + 1}.</span> {q.text}</p>
          <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
            {q.options.map((o, k) => (
              <li key={k} className={cn("flex items-start gap-1.5 rounded-lg px-2 py-1 text-xs", k === q.correct ? "bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "bg-muted/60")}>
                {k === q.correct ? <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" /> : <span className="w-3.5 shrink-0 text-center">{LETTERS[k]}</span>} {o}
              </li>
            ))}
          </ul>
        </li>
      ))}
      {!quiz.questions.length && <p className="text-sm text-muted-foreground">No questions yet.</p>}
    </ol>
  );
}

const AIKEN_SAMPLE = `What is the chemical symbol of water?
A. H2O
B. CO2
C. O2
D. NaCl
ANSWER: A

Which gas do plants take in?
A. Oxygen
B. Carbon dioxide
C. Nitrogen
ANSWER: B`;
const QUESTIONS_CSV = "data:text/csv;charset=utf-8," + encodeURIComponent("Question,A,B,C,D,Answer\nWhat is the chemical symbol of water?,H2O,CO2,O2,NaCl,A\n");
const LESSONS_CSV = "data:text/csv;charset=utf-8," + encodeURIComponent("Title,YouTube,Duration,Free,Description\nPart 1 - Change of State,https://youtu.be/io7hjBF5phY,16:46,yes,\n");

function QuizImport({ unit, lesson, quiz, subjectId, send }: { unit: ContentUnit; lesson?: ContentLesson; quiz?: ContentQuiz; subjectId: string; send: (i: ContentJobInput) => Promise<void> }) {
  const [mode, setMode] = React.useState<"paste" | "file" | "type">("paste");
  const [text, setText] = React.useState("");
  const [parsed, setParsed] = React.useState<{ questions: ContentQuestion[]; errors: { at: string; message: string }[] } | null>(null);
  const [typed, setTyped] = React.useState<ContentQuestion[]>([{ id: null, text: "", options: ["", "", "", ""], correct: 0 }]);
  const [title, setTitle] = React.useState(quiz?.title ?? (lesson ? `${lesson.title} quiz` : `${unit.title} quiz`));
  const [minutes, setMinutes] = React.useState(quiz?.timeLimit ? String(Math.round(quiz.timeLimit / 60)) : "30");
  const [batch, setBatch] = React.useState("20");
  const [busy, setBusy] = React.useState(false);
  // Pasted text is read as it is typed.
  React.useEffect(() => {
    if (mode !== "paste") return;
    if (!text.trim()) return setParsed(null);
    const t = window.setTimeout(async () => {
      const r = await parseQuestionsAction(text);
      if (r.ok) setParsed(r.data as typeof parsed);
    }, 350);
    return () => window.clearTimeout(t);
  }, [text, mode]);
  const typedOk = typed.filter((q) => q.text.trim() && q.options.filter((o) => o.trim()).length >= 2 && q.options[q.correct]?.trim());
  const questions = mode === "type" ? typedOk.map((q) => ({ ...q, options: q.options.filter((o) => o.trim()), correct: q.options.slice(0, q.correct).filter((o) => o.trim()).length })) : (parsed?.questions ?? []);
  const go = async () => {
    setBusy(true);
    await send({ kind: "quiz", subjectId, unitId: unit.id, lessonId: lesson?.id ?? null, quizId: quiz?.id ?? null, title, timeLimitMinutes: Number(minutes) || null, questions, batch: Number(batch) || 20 });
    setBusy(false);
  };
  return (
    <div className="space-y-4" data-quiz-import>
      {!quiz && (
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <div className="space-y-1"><Label htmlFor="qz-title">Quiz title</Label><Input id="qz-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="qz-min">Time limit (minutes)</Label><Input id="qz-min" type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
        </div>
      )}
      <ViewSwitcher label="How to add questions" size="xs" value={mode} onChange={(m) => (setMode(m), setParsed(null))} options={[["paste", "Paste text"], ["file", "Excel or CSV"], ["type", "Type them"]]} />
      {mode === "paste" && (
        <div className="space-y-1">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={AIKEN_SAMPLE} className="font-mono text-xs" data-quiz-paste />
          <p className="text-xs text-muted-foreground">One question after another: the question, its options as A. B. C. D., then ANSWER: and the right letter.</p>
        </div>
      )}
      {mode === "file" && <FileRows kind="questions" template={QUESTIONS_CSV} templateName="questions-template.csv" onParsed={(r) => setParsed(r as typeof parsed)} />}
      {mode === "type" && (
        <div className="space-y-3">
          {typed.map((q, i) => (
            <div key={i} className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Question {i + 1}</span>
                {typed.length > 1 && <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setTyped(typed.filter((_, k) => k !== i))}><XCircleIcon /> Remove</Button>}
              </div>
              <Textarea rows={2} value={q.text} onChange={(e) => setTyped(typed.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} placeholder="The question" />
              <div className="grid gap-1.5 sm:grid-cols-2">
                {q.options.map((o, k) => (
                  <label key={k} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1", q.correct === k && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40")}>
                    <input type="radio" name={`c${i}`} checked={q.correct === k} onChange={() => setTyped(typed.map((x, j) => (j === i ? { ...x, correct: k } : x)))} aria-label={`Option ${LETTERS[k]} is right`} />
                    <span className="text-xs font-semibold">{LETTERS[k]}</span>
                    <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={o} onChange={(e) => setTyped(typed.map((x, j) => (j === i ? { ...x, options: x.options.map((y, m) => (m === k ? e.target.value : y)) } : x)))} placeholder={`Option ${LETTERS[k]}`} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setTyped([...typed, { id: null, text: "", options: ["", "", "", ""], correct: 0 }])}><PlusIcon /> Another question</Button>
        </div>
      )}
      {parsed && mode !== "type" && <ParsedPreview parsed={parsed} />}
      <DialogFooter className="sticky -bottom-6 -mx-6 items-center gap-2 border-t bg-background px-6 py-3 sm:justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Questions per batch
          <Input type="number" min={5} max={50} value={batch} onChange={(e) => setBatch(e.target.value)} className="h-7 w-16 text-xs" aria-label="Questions per batch" />
        </label>
        <Button disabled={busy || !questions.length || (!quiz && !title.trim())} onClick={go} data-quiz-send>
          {busy ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} Send {questions.length} question{questions.length === 1 ? "" : "s"} to Noor
        </Button>
      </DialogFooter>
    </div>
  );
}

function ParsedPreview({ parsed }: { parsed: { questions: ContentQuestion[]; errors: { at: string; message: string }[] } }) {
  return (
    <div className="space-y-2" data-quiz-preview>
      <p className="text-sm"><CheckCircle2Icon className="inline size-4 text-emerald-600" /> {parsed.questions.length} questions ready{parsed.errors.length ? `, ${parsed.errors.length} need fixing` : ""}</p>
      {parsed.errors.length > 0 && (
        <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" data-quiz-errors>
          {parsed.errors.map((e, i) => <li key={i}><b>{e.at}:</b> {e.message}</li>)}
        </ul>
      )}
      <div className="max-h-64 overflow-y-auto rounded-lg border">
        <QuestionList quiz={{ id: 0, title: "", timeLimit: null, questions: parsed.questions.slice(0, 50) }} />
        {parsed.questions.length > 50 && <p className="p-2 text-center text-xs text-muted-foreground">and {parsed.questions.length - 50} more</p>}
      </div>
    </div>
  );
}

function FileRows({ kind, template, templateName, onParsed }: { kind: "questions" | "lessons"; template: string; templateName: string; onParsed: (r: unknown) => void }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4">
      <Input
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="max-w-xs"
        disabled={busy}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          const fd = new FormData();
          fd.set("file", f);
          fd.set("kind", kind);
          const r = await parseImportFileAction(fd);
          setBusy(false);
          if (r.ok) onParsed(r.data);
          else toast.error(r.error);
        }}
        data-import-file={kind}
      />
      {busy && <Loader2Icon className="size-4 animate-spin" />}
      <a href={template} download={templateName} className="text-xs text-primary underline">Download a template</a>
    </div>
  );
}

function LessonsImport({ unitId, subjectId, send }: { unitId: number; subjectId: string; send: (i: ContentJobInput) => Promise<void> }) {
  const [rows, setRows] = React.useState<LessonInput[]>([{ title: "", youtube: "", duration: null, free: false, description: "" }]);
  const [mode, setMode] = React.useState<"type" | "file">("type");
  const [errors, setErrors] = React.useState<{ at: string; message: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const ytId = (v: string) => (/^[\w-]{11}$/.test(v.trim()) ? v.trim() : (v.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/)?.[1] ?? null));
  const ready = rows.filter((r) => r.title.trim()).map((r) => ({ ...r, youtube: r.youtube ? ytId(r.youtube) : null }));
  const bad = rows.filter((r) => r.title.trim() && r.youtube && !ytId(r.youtube));
  return (
    <div className="space-y-3" data-lessons-import>
      <ViewSwitcher label="How to add lessons" size="xs" value={mode} onChange={setMode} options={[["type", "Type them"], ["file", "Excel or CSV"]]} />
      {mode === "file" && (
        <FileRows
          kind="lessons"
          template={LESSONS_CSV}
          templateName="lessons-template.csv"
          onParsed={(r) => {
            const x = r as { lessons: LessonInput[]; errors: { at: string; message: string }[] };
            setRows(x.lessons.length ? x.lessons : rows);
            setErrors(x.errors);
            setMode("type");
          }}
        />
      )}
      {errors.length > 0 && <StatusStrip tone="warning">{errors.map((e) => `${e.at}: ${e.message}`).join(" · ")}</StatusStrip>}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-xl border p-2 sm:grid-cols-[1fr_1fr_90px_auto_auto]">
            <Input value={r.title} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} placeholder="Lesson title" aria-label="Lesson title" />
            <Input value={r.youtube ?? ""} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, youtube: e.target.value } : x)))} placeholder="YouTube link" aria-label="YouTube link" className={cn(r.youtube && !ytId(r.youtube) && "border-destructive")} />
            <Input value={r.duration ? mmss(r.duration) : ""} onChange={(e) => { const m = e.target.value.match(/^(\d+):(\d{1,2})$/); setRows(rows.map((x, k) => (k === i ? { ...x, duration: m ? Number(m[1]) * 60 + Number(m[2]) : Number(e.target.value) || null } : x))); }} placeholder="12:30" aria-label="Duration" />
            <label className="flex items-center gap-1.5 text-xs"><Switch checked={r.free} onCheckedChange={(v) => setRows(rows.map((x, k) => (k === i ? { ...x, free: v } : x)))} /> Free</label>
            <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setRows(rows.length > 1 ? rows.filter((_, k) => k !== i) : rows)}><XCircleIcon /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setRows([...rows, { title: "", youtube: "", duration: null, free: false, description: "" }])}><PlusIcon /> Another lesson</Button>
      </div>
      <DialogFooter className="sticky -bottom-6 -mx-6 border-t bg-background px-6 py-3">
        <Button disabled={busy || !ready.length || bad.length > 0} onClick={async () => (setBusy(true), await send({ kind: "lessons", subjectId, unitId, lessons: ready }), setBusy(false))} data-lessons-send>
          {busy ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} Send {ready.length} lesson{ready.length === 1 ? "" : "s"} to Noor
        </Button>
      </DialogFooter>
    </div>
  );
}

function UnitsForm({ subjectId, send }: { subjectId: string; send: (i: ContentJobInput) => Promise<void> }) {
  const [text, setText] = React.useState("");
  const units = text.split("\n").map((t) => t.trim()).filter(Boolean).map((title) => ({ title }));
  return (
    <div className="space-y-3">
      <Label htmlFor="units">One unit title a line</Label>
      <Textarea id="units" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Unit 7: Chemistry in Industry\nUnit 8: Environmental Chemistry"} />
      <DialogFooter>
        <Button disabled={!units.length} onClick={() => void send({ kind: "units", subjectId, units })} data-units-send><FileUpIcon /> Send {units.length} unit{units.length === 1 ? "" : "s"} to Noor</Button>
      </DialogFooter>
    </div>
  );
}

function NoteForm({ subjectId, unitId, lessonId, send }: { subjectId: string; unitId: number; lessonId: number | null; send: (i: ContentJobInput) => Promise<void> }) {
  const [text, setText] = React.useState("");
  const [pdf, setPdf] = React.useState<{ name: string; base64: string; size: number } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const pick = (f: File | undefined) => {
    if (!f) return setPdf(null);
    if (!/\.pdf$/i.test(f.name) || f.size > 10 * 1024 * 1024) return void toast.error("Choose a PDF of at most 10 MB.");
    const r = new FileReader();
    r.onload = () => setPdf({ name: f.name, size: f.size, base64: String(r.result).replace(/^data:[^,]*,/, "") });
    r.readAsDataURL(f);
  };
  return (
    <div className="space-y-3">
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="The note students read" aria-label="Note" />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3">
        <FileTextIcon className="size-4 text-muted-foreground" />
        <Input type="file" accept="application/pdf,.pdf" className="max-w-xs" onChange={(e) => pick(e.target.files?.[0])} aria-label="PDF" data-note-pdf />
        {pdf && <span className="text-xs text-muted-foreground">{pdf.name} · {Math.round(pdf.size / 1024)} KB</span>}
      </div>
      <p className="text-xs text-muted-foreground">The PDF goes to Noor's storage through Noor's own upload, as when it is attached in Noor.</p>
      <DialogFooter>
        <Button disabled={busy || (!text.trim() && !pdf)} onClick={async () => (setBusy(true), await send({ kind: "note", subjectId, unitId, lessonId, text, pdf: pdf ? { name: pdf.name, base64: pdf.base64 } : null }), setBusy(false))} data-note-send>
          {busy ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} Send the note to Noor
        </Button>
      </DialogFooter>
    </div>
  );
}

function LessonEdit({ subjectId, unitId, lesson, send }: { subjectId: string; unitId: number; lesson: ContentLesson; send: (i: ContentJobInput) => Promise<void> }) {
  const [v, setV] = React.useState({ title: lesson.title, youtube: lesson.video.youtube ?? "", duration: lesson.duration ? mmss(lesson.duration) : "", free: lesson.free, description: lesson.description });
  const yt = v.youtube ? (/^[\w-]{11}$/.test(v.youtube.trim()) ? v.youtube.trim() : (v.youtube.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/)?.[1] ?? null)) : null;
  const dm = v.duration.match(/^(\d+):(\d{1,2})$/);
  const duration = dm ? Number(dm[1]) * 60 + Number(dm[2]) : Number(v.duration) || null;
  const patch: Partial<LessonInput> = {
    ...(v.title !== lesson.title ? { title: v.title } : {}),
    ...(yt !== (lesson.video.youtube ?? null) && (yt || !v.youtube) ? { youtube: yt } : {}),
    ...(duration !== lesson.duration ? { duration } : {}),
    ...(v.free !== lesson.free ? { free: v.free } : {}),
    ...(v.description !== lesson.description ? { description: v.description } : {}),
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1"><Label htmlFor="le-t">Title</Label><Input id="le-t" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div className="space-y-1"><Label htmlFor="le-y">YouTube link</Label><Input id="le-y" value={v.youtube} onChange={(e) => setV({ ...v, youtube: e.target.value })} className={cn(v.youtube && !yt && "border-destructive")} /></div>
        <div className="space-y-1"><Label htmlFor="le-d">Duration</Label><Input id="le-d" value={v.duration} onChange={(e) => setV({ ...v, duration: e.target.value })} placeholder="12:30" /></div>
      </div>
      {yt && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://i.ytimg.com/vi/${yt}/mqdefault.jpg`} alt="" className="h-24 rounded-lg" />
      )}
      <label className="flex items-center gap-2 text-sm"><Switch checked={v.free} onCheckedChange={(free) => setV({ ...v, free })} /> Free preview</label>
      <div className="space-y-1"><Label htmlFor="le-ds">Description</Label><Textarea id="le-ds" rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      <DialogFooter>
        <Button disabled={!Object.keys(patch).length || (!!v.youtube && !yt)} onClick={() => void send({ kind: "edit-lesson", subjectId, unitId, lessonId: lesson.id, patch })} data-lesson-save><FileUpIcon /> Save in Noor</Button>
      </DialogFooter>
    </div>
  );
}

function UnitEdit({ subjectId, unit, send }: { subjectId: string; unit: ContentUnit; send: (i: ContentJobInput) => Promise<void> }) {
  const [v, setV] = React.useState({ title: unit.title, description: unit.description });
  return (
    <div className="space-y-3">
      <div className="space-y-1"><Label htmlFor="ue-t">Title</Label><Input id="ue-t" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="ue-d">Description</Label><Textarea id="ue-d" rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      <DialogFooter>
        <Button disabled={!v.title.trim() || (v.title === unit.title && v.description === unit.description)} onClick={() => void send({ kind: "edit-unit", subjectId, unitId: unit.id, patch: { ...(v.title !== unit.title ? { title: v.title } : {}), ...(v.description !== unit.description ? { description: v.description } : {}) } })}><FileUpIcon /> Save in Noor</Button>
      </DialogFooter>
    </div>
  );
}

// --- Report and jobs -------------------------------------------------------------------------

function ContentReport({ subjects, onOpen }: { subjects: Overview["subjects"]; onOpen: (id: string) => void }) {
  const byGrade = new Map<string, Overview["subjects"]>();
  for (const s of subjects) for (const g of s.grades.length ? s.grades : ["No grade"]) byGrade.set(g, [...(byGrade.get(g) ?? []), s]);
  const grades = [...byGrade.keys()].sort((a, b) => (parseInt(a.replace(/\D/g, "")) || 99) - (parseInt(b.replace(/\D/g, "")) || 99) || a.localeCompare(b));
  const opened = subjects.filter((s) => s.stats).length;
  return (
    <div className="space-y-4" data-content-report>
      <p className="text-xs text-muted-foreground">Units and lessons are Noor&apos;s own counts. Video, notes and quizzes show for the {opened} of {subjects.length} subjects opened here; open a subject to count it.</p>
      {grades.map((g) => {
        const list = byGrade.get(g)!;
        return (
          <section key={g} className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-2">
              <h3 className="font-semibold">{g}</h3>
              <span className="text-xs text-muted-foreground">{n(list.length, "subject")} · {n(list.reduce((k, s) => k + s.units, 0), "unit")} · {n(list.reduce((k, s) => k + s.lessons, 0), "lesson")}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-2 font-medium">Subject</th>
                    <th className="px-2 py-2 text-right font-medium">Units</th>
                    <th className="px-2 py-2 text-right font-medium">Lessons</th>
                    <th className="px-2 py-2 font-medium">Video</th>
                    <th className="px-2 py-2 font-medium">Notes</th>
                    <th className="px-2 py-2 font-medium">Quiz per unit</th>
                    <th className="px-2 py-2 text-right font-medium">Questions</th>
                    <th className="px-4 py-2 text-right font-medium">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2"><button type="button" className="font-medium hover:underline" onClick={() => onOpen(s.id)}>{s.name}</button></td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(s.units)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(s.lessons)}</td>
                      {s.stats ? (
                        <>
                          <td className="w-28 px-2 py-2"><Coverage label={`${s.stats.videos ?? 0}`} value={s.stats.videos ?? 0} of={s.stats.lessons ?? 0} /></td>
                          <td className="w-28 px-2 py-2"><Coverage label={`${s.stats.lessonsWithNotes ?? 0}`} value={s.stats.lessonsWithNotes ?? 0} of={s.stats.lessons ?? 0} tone="bg-sky-500" /></td>
                          <td className="w-28 px-2 py-2"><Coverage label={`${(s.stats.units ?? 0) - (s.stats.unitsWithoutQuiz ?? 0)}`} value={(s.stats.units ?? 0) - (s.stats.unitsWithoutQuiz ?? 0)} of={s.stats.units ?? 0} tone="bg-emerald-500" /></td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(s.stats.questions)}</td>
                        </>
                      ) : (
                        <td colSpan={4} className="px-2 py-2 text-xs text-muted-foreground"><button type="button" className="text-primary hover:underline" onClick={() => onOpen(s.id)}>Open to count</button></td>
                      )}
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">{s.fetchedAt ? ago(s.fetchedAt) : "Not yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function JobList({ jobs, subjects }: { jobs: Job[]; subjects: Overview["subjects"] }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Job | null>(null);
  React.useEffect(() => {
    if (!open) return setDetail(null);
    let stop = false;
    const tick = async () => {
      const r = await contentJobAction(open);
      if (!stop && r.ok) setDetail(r.data as Job);
    };
    void tick();
    const t = window.setInterval(tick, 3000);
    return () => ((stop = true), window.clearInterval(t));
  }, [open]);
  const name = (id: string) => (id === "all" ? "All subjects" : (subjects.find((s) => s.id === id)?.name ?? `Subject ${id}`));
  if (!jobs.length) return <EmptyState icon={<ListChecksIcon className="size-5" />} title="No jobs yet" description="Changes sent to Noor show here with each step." />;
  return (
    <ul className="space-y-2" data-content-jobs>
      {jobs.map((j) => {
        const active = j.status === "running" || j.status === "queued";
        return (
          <li key={j.id} className="rounded-xl border bg-card">
            <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => setOpen(open === j.id ? null : j.id)} data-job={j.status}>
              {active ? <Loader2Icon className="size-4 animate-spin text-primary" /> : j.status === "done" ? <CheckCircle2Icon className="size-4 text-emerald-600" /> : <XCircleIcon className="size-4 text-destructive" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{j.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{name(j.subject_id)} · {ago(j.created_at)} · {j.progress}</span>
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{j.done}/{j.total || "?"}</span>
            </button>
            {open === j.id && detail && (
              <div className="space-y-1 border-t px-3 py-2 text-xs">
                {detail.log?.map((l, i) => (
                  <p key={i} className={cn("flex gap-2", !l.ok && "text-destructive")}>
                    {l.ok ? <CheckCircle2Icon className="mt-0.5 size-3 shrink-0 text-emerald-600" /> : <XCircleIcon className="mt-0.5 size-3 shrink-0" />}
                    <span><b>{l.step}:</b> {l.message}</span>
                  </p>
                ))}
                {!detail.log?.length && <p className="text-muted-foreground">Nothing done yet.</p>}
                {active && <Button size="xs" variant="outline" onClick={async () => { const r = await cancelContentJobAction(j.id); if (!r.ok) toast.error(r.error); }}><SquareIcon /> Stop after this step</Button>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
