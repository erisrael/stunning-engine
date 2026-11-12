"use client";

// The Recording team's old catalog in this app's look: the same levels in the same order (Grades, Subjects, Units, Parts
// and video shots), the same add, edit and delete at each level, and the same Word and JSON files. Everything is saved
// straight into the real curriculum and the part's work.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightIcon, BookOpenIcon, BoxesIcon, CheckCheckIcon, ChevronRightIcon, DownloadIcon, FileTextIcon, FilmIcon, HomeIcon, LayersIcon, Loader2Icon, LockIcon, PencilIcon, PlusIcon, SettingsIcon, SparklesIcon, Trash2Icon, UploadIcon, VideoIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/primitives";
import {
  addPartAction,
  addSubjectAction,
  addUnitAction,
  addVideoAction,
  deletePartAction,
  deleteSubjectAction,
  deleteUnitAction,
  deleteVideoAction,
  editPartAction,
  editUnitAction,
  editVideoAction,
  importLegacyAction,
  markRecordedAction,
  saveLegacyConfigAction,
  reopenPartAction,
  handOffAction,
  migratePartNamesAction,
} from "@/app/actions/legacy";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AttachPicker, FileLinks, useAttachments } from "@/components/app/attach-picker";
import { cn } from "cn";
import type { LegacyConfig, LegacyPart, LegacyVideo, ReadyRow } from "@/server/legacy";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardCheckIcon, SendIcon, Undo2Icon } from "lucide-react";
import { fmtMS, parseMS } from "@/lib/duration";

type Result = { ok: boolean; error?: string };
type GradeCard = { id: string; name: string; level: string | null; subjects: number; videos: number };
type SubjectCard = { id: string; name: string; units: number; videos: number };
type UnitCard = { id: string; number: number; title: string; parts: number; videos: number };
type Choices = { studios: string[]; presenters: string[] };
type Props = {
  stats: { videos: number; units: number };
  grade: { id: string; name: string; level: string | null } | null;
  subject: { id: string; name: string } | null;
  unit: { id: string; number: number; title: string } | null;
  subjects: SubjectCard[];
  units: UnitCard[];
  parts: LegacyPart[];
  ready: ReadyRow[] | null;
  readyCount: number;
  lead: boolean;
  grades: GradeCard[];
  canImport: boolean;
  canRemove: boolean;
  admin: boolean;
  planner: boolean;
  config: LegacyConfig;
  choices: Choices;
};

const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;
const href = (g?: string | null, s?: string | null, u?: string | null) => `/legacy${g ? `?g=${g}${s ? `&s=${s}${u ? `&u=${u}` : ""}` : ""}` : ""}`;

function useAct() {
  const router = useRouter();
  return async (p: Promise<Result>, msg: string) => {
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

// One-field dialog, for adding or renaming at each level.
function NameDialog({ title, label, value, onSave, onClose }: { title: string; label: string; value: string; onSave: (v: string) => Promise<boolean>; onClose: () => void }) {
  const [v, setV] = React.useState(value);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await onSave(v.trim());
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-legacy-dialog>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="lg-name">{label}</Label>
          <Input id="lg-name" autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && v.trim() && void save()} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !v.trim()} onClick={save}>
            {busy && <Loader2Icon className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDelete({ text, detail, onYes, onClose }: { text: string; detail: string; onYes: () => Promise<boolean>; onClose: () => void }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text}</DialogTitle>
          <DialogDescription>{detail}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await onYes();
              setBusy(false);
              if (ok) onClose();
            }}
          >
            {busy && <Loader2Icon className="animate-spin" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LegacyClient(p: Props) {
  const [importing, setImporting] = React.useState(false);
  const [settings, setSettings] = React.useState(false);
  return (
    <div className="space-y-4" data-legacy>
      {!p.config.on && <p className="rounded-lg border bg-muted/40 p-2 text-sm">The Legacy catalog is off for the team. Only Admin sees it now.</p>}
      {/* The bar: where you are, the totals, and the files. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3" data-legacy-bar>
        <nav className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Where you are in the catalog">
          <Link href={href()} className={p.grade ? "flex items-center gap-1 text-muted-foreground hover:text-foreground" : "flex items-center gap-1 font-medium"}>
            <HomeIcon className="size-3.5" /> All grades
          </Link>
          {p.grade && (
            <>
              <ChevronRightIcon className="size-3.5 text-muted-foreground" />
              <Link href={href(p.grade.id)} className={p.subject ? "text-muted-foreground hover:text-foreground" : "font-medium"}>
                {p.grade.name}
              </Link>
            </>
          )}
          {p.subject && (
            <>
              <ChevronRightIcon className="size-3.5 text-muted-foreground" />
              <Link href={href(p.grade!.id, p.subject.id)} className={p.unit ? "text-muted-foreground hover:text-foreground" : "font-medium"}>
                {p.subject.name}
              </Link>
            </>
          )}
          {p.unit && (
            <>
              <ChevronRightIcon className="size-3.5 text-muted-foreground" />
              <span className="font-medium">
                Unit {p.unit.number}: {p.unit.title}
              </span>
            </>
          )}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-3 text-xs text-muted-foreground tabular" data-legacy-stats>
            <span className="flex items-center gap-1">
              <VideoIcon className="size-3.5" /> {many(p.stats.videos, "video")}
            </span>
            <span className="flex items-center gap-1">
              <BoxesIcon className="size-3.5" /> {many(p.stats.units, "unit")}
            </span>
          </span>
          <Button size="sm" variant="outline" asChild>
            <a href="/api/legacy/word">
              <FileTextIcon /> Word
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href="/api/legacy/backup" aria-label="Download the JSON backup">
              <DownloadIcon /> Backup
            </a>
          </Button>
          <Button size="sm" variant={p.ready ? "default" : "outline"} asChild>
            <Link href="/legacy?view=ready" data-legacy-ready-link>
              <ClipboardCheckIcon /> Ready to hand off{p.readyCount ? ` (${p.readyCount})` : ""}
            </Link>
          </Button>
          {p.canImport && (
            <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
              <UploadIcon /> Import
            </Button>
          )}
          {p.admin && (
            <Button size="icon-sm" variant="ghost" aria-label="Legacy catalog settings" onClick={() => setSettings(true)}>
              <SettingsIcon />
            </Button>
          )}
        </div>
      </div>

      {p.ready && <ReadyView rows={p.ready} lead={p.lead} />}
      {!p.ready && !p.grade && <GradesView grades={p.grades} />}
      {p.grade && !p.subject && <SubjectsView {...p} grade={p.grade} />}
      {p.grade && p.subject && !p.unit && <UnitsView {...p} grade={p.grade} subject={p.subject} />}
      {p.unit && <PartsView {...p} unit={p.unit} />}

      {importing && <ImportDialog config={p.config} onClose={() => setImporting(false)} />}
      {settings && <SettingsDialog config={p.config} onClose={() => setSettings(false)} />}
    </div>
  );
}

function GradesView({ grades }: { grades: GradeCard[] }) {
  const levels = [...new Set(grades.map((g) => g.level ?? "Grades"))];
  if (!grades.length) return <EmptyState icon={<BookOpenIcon className="size-5" />} title="No grades yet" description="Import the catalog's backup to bring your grades, subjects and recordings in." />;
  return (
    <div className="space-y-6">
      {levels.map((level) => (
        <section key={level} className="space-y-2">
          <h2 className="text-sm font-semibold">{level}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {grades
              .filter((g) => (g.level ?? "Grades") === level)
              .map((g) => (
                <Link key={g.id} href={href(g.id)} className="group rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm" data-legacy-grade={g.name}>
                  <span className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold text-primary">{g.name.replace(/\D/g, "") || g.name[0]}</span>
                    <Badge variant="secondary">{many(g.subjects, "subject")}</Badge>
                  </span>
                  <span className="mt-2 block font-semibold">{g.name}</span>
                  <span className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FilmIcon className="size-3.5" /> {many(g.videos, "video")}
                    </span>
                    <span className="flex items-center gap-1 group-hover:text-primary">
                      Open <ArrowRightIcon className="size-3" />
                    </span>
                  </span>
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SubjectsView({ grade, subjects, canRemove }: Props & { grade: NonNullable<Props["grade"]> }) {
  const act = useAct();
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [del, setDel] = React.useState<SubjectCard | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{grade.name} subjects</h2>
        {canRemove && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <PlusIcon /> Add new subject
          </Button>
        )}
      </div>
      {!subjects.length ? (
        <EmptyState icon={<BookOpenIcon className="size-5" />} title={`No subjects in ${grade.name} yet`} description={canRemove ? "Add the first one." : "The Recording lead adds the subjects."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <Card key={s.id} className="gap-0 p-4" data-legacy-subject={s.name}>
              <div className="flex items-start justify-between gap-2">
                <Link href={href(grade.id, s.id)} className="font-semibold hover:underline">
                  {s.name}
                </Link>
                {canRemove && (
                  <Button size="icon-xs" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => setDel(s)}>
                    <Trash2Icon />
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {many(s.units, "unit")} · {many(s.videos, "video")}
              </p>
              <Button size="sm" variant="secondary" className="mt-3" asChild>
                <Link href={href(grade.id, s.id)}>
                  View units <ArrowRightIcon />
                </Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
      {adding && (
        <NameDialog
          title={`Add subject to ${grade.name}`}
          label="Subject name"
          value=""
          onClose={() => setAdding(false)}
          onSave={async (v) => {
            const r = await addSubjectAction(grade.id, v);
            if (!r.ok) return toast.error(r.error), false;
            toast.success(r.data?.sameAs ? `That is the subject "${r.data.sameAs}", so it was used.` : "Subject added");
            router.refresh();
            return true;
          }}
        />
      )}
      {del && <ConfirmDelete text={`Delete "${del.name}" from ${grade.name}?`} detail="Its units and parts go too. If any part has gone past Recording, nothing is deleted." onClose={() => setDel(null)} onYes={() => act(deleteSubjectAction(grade.id, del.id), "Subject deleted")} />}
    </div>
  );
}

function UnitsView({ grade, subject, units, canRemove }: Props & { grade: NonNullable<Props["grade"]>; subject: NonNullable<Props["subject"]> }) {
  const act = useAct();
  const [adding, setAdding] = React.useState(false);
  const [del, setDel] = React.useState<UnitCard | null>(null);
  const [edit, setEdit] = React.useState<UnitCard | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{subject.name}</h2>
        <Button size="sm" onClick={() => setAdding(true)}>
          <PlusIcon /> Add new unit
        </Button>
      </div>
      {!units.length ? (
        <EmptyState icon={<BoxesIcon className="size-5" />} title="No units in this subject yet" description="Add unit 1." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {units.map((u) => (
            <Card key={u.id} className="gap-0 p-4" data-legacy-unit={u.number}>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">Chapter {u.number}</Badge>
                {canRemove && (
                  <span className="flex">
                    <Button size="icon-xs" variant="ghost" aria-label={`Edit unit ${u.number}`} onClick={() => setEdit(u)}>
                      <PencilIcon />
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label={`Delete unit ${u.number}`} onClick={() => setDel(u)}>
                      <Trash2Icon />
                    </Button>
                  </span>
                )}
              </div>
              <Link href={href(grade.id, subject.id, u.id)} className="mt-2 font-semibold hover:underline">
                Unit {u.number}: {u.title}
              </Link>
              <p className="mt-1 flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <LayersIcon className="size-3.5" /> {many(u.parts, "part")}
                </span>
                <span className="flex items-center gap-1">
                  <FilmIcon className="size-3.5" /> {many(u.videos, "video shot")}
                </span>
              </p>
              <Button size="sm" variant="secondary" className="mt-3" asChild>
                <Link href={href(grade.id, subject.id, u.id)}>
                  Manage parts and videos <ArrowRightIcon />
                </Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
      {adding && <NameDialog title={`Add Unit ${Math.max(0, ...units.map((u) => u.number)) + 1} to ${subject.name}`} label="Unit title (required)" value="" onClose={() => setAdding(false)} onSave={(v) => act(addUnitAction(grade.id, subject.id, v), "Unit added")} />}
      {edit && <NameDialog title={`Edit unit ${edit.number}`} label="Unit title" value={edit.title} onClose={() => setEdit(null)} onSave={(v) => act(editUnitAction(edit.id, v), "Unit updated")} />}
      {del && <ConfirmDelete text={`Delete unit ${del.number}, "${del.title}"?`} detail="Its parts go too. If any part has gone past Recording, nothing is deleted." onClose={() => setDel(null)} onYes={() => act(deleteUnitAction(del.id), "Unit deleted")} />}
    </div>
  );
}

const CODE_HELP = "The code the camera gives the file, as C0172. Several files for one video: C0172 & C0173.";
const OTHER = "Other";
const RES_ACCEPT = ".pdf,.ppt,.pptx,.key,.odp,.doc,.docx,.odt,.xls,.xlsx,.csv,.txt,image/*,.zip";
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
type Place = { grade: string; subject: string; unit: string };

// One video entry, entered in one place. Grade, subject, unit and part come from where it is opened and cannot be
// changed. A Draft needs the camera code, title and studio; Submit for Review needs everything.
function VideoDialog({ part, video, place, choices, onClose }: { part: LegacyPart; video?: LegacyVideo; place: Place; choices: Choices; onClose: () => void }) {
  const router = useRouter();
  const prev = [...part.videos].reverse().find((v) => v.id !== video?.id && v.presenter) ?? null;
  const last = [...part.videos].reverse().find((v) => v.id !== video?.id) ?? null;
  const [f, setF] = React.useState({
    cameraCode: video?.cameraCode ?? "",
    title: video?.title ?? "",
    description: video?.description ?? "",
    minutes: fmtMS(video?.minutes),
    link: video?.link ?? "",
    disk: video?.disk ?? "",
    path: video?.path ?? "",
    // The presenter is carried over from the previous clip in the part; it can still be changed.
    presenter: video?.presenter ?? prev?.presenter ?? part.teacher ?? "",
    studio: video?.studio ?? last?.studio ?? "",
    studioReason: video?.studioReason ?? "",
    recordedOn: video?.recordedOn ?? last?.recordedOn ?? todayLocal(),
    noResources: video?.noResources ?? false,
  });
  const [onDisk, setOnDisk] = React.useState(!!video?.disk);
  const [removing, setRemoving] = React.useState<Set<string>>(new Set());
  const att = useAttachments({ max: 6, maxBytes: 9 * 1024 * 1024 });
  const [busy, setBusy] = React.useState<"" | "draft" | "submitted">("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const kept = (video?.files ?? []).filter((x) => !removing.has(x.id));
  const fileCount = kept.length + att.files.length;
  const len = parseMS(f.minutes);
  const studios = choices.studios.length ? choices.studios : [];
  const presenters = [...new Set([...choices.presenters, ...(f.presenter && !choices.presenters.includes(f.presenter) ? [f.presenter] : [])])];
  // What Submit for Review still needs, shown as you go.
  const missing = [
    !f.cameraCode.trim() && "camera code",
    !f.title.trim() && "title",
    !f.presenter.trim() && "presenter",
    !f.studio && "studio",
    f.studio === OTHER && !f.studioReason.trim() && "reason for Other",
    !f.recordedOn && "recording date",
    (!f.minutes.trim() || Number.isNaN(len) || !((len ?? 0) > 0)) && "length",
    (onDisk ? !(f.disk.trim() && f.path.trim()) : !f.link.trim()) && "storage location",
    !fileCount && !f.noResources && "supporting resources",
  ].filter(Boolean) as string[];
  const draftOk = !!f.cameraCode.trim() && !!f.title.trim() && !!f.studio && (f.studio !== OTHER || !!f.studioReason.trim());
  const save = async (status: "draft" | "submitted") => {
    if (f.minutes.trim() && Number.isNaN(len)) return void toast.error("Length as minutes:seconds, e.g. 12:30");
    setBusy(status);
    const input = {
      cameraCode: f.cameraCode,
      title: f.title,
      description: f.description,
      minutes: Number.isNaN(len) ? null : len,
      presenter: f.presenter || null,
      studio: f.studio || null,
      studioReason: f.studio === OTHER ? f.studioReason : null,
      recordedOn: f.recordedOn || null,
      link: onDisk ? null : f.link || null,
      disk: onDisk ? f.disk || null : null,
      path: onDisk ? f.path || null : null,
      noResources: !fileCount && f.noResources,
      files: att.payload(),
      removeFiles: [...removing],
      status,
    };
    const r = video ? await editVideoAction(video.id, input) : await addVideoAction(part.id, input);
    setBusy("");
    if (!r.ok) return void toast.error(r.error);
    const code = r.data?.code ?? f.cameraCode;
    if (r.data && "doubtful" in r.data && r.data.doubtful) toast.warning(`Saved ${code} as a draft. Check it: it does not look like a camera code.`);
    else toast.success(status === "draft" ? `${code} saved as a draft` : video ? `${code} saved and submitted for review` : `${code} submitted for review`);
    router.refresh();
    onClose();
  };
  const req = <span className="text-destructive"> *</span>;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-legacy-video>
        <DialogHeader>
          <DialogTitle>{video ? `Edit video entry ${video.cameraCode}` : `Add video to Part ${part.number}`}</DialogTitle>
          <DialogDescription>Everything about this recording is entered here only. Fields with * are needed to submit for review; a draft needs the camera code, title and studio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs" data-legacy-place>
            <LockIcon className="size-3.5 text-muted-foreground" />
            {[place.grade, place.subject, place.unit, `Part ${part.number}`].map((x, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRightIcon className="size-3 text-muted-foreground" />}
                <span className="font-medium">{x}</span>
              </span>
            ))}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="lg-code">Camera code{req}</Label>
              <Input id="lg-code" autoFocus={!video} className="font-mono uppercase" placeholder="C0172" value={f.cameraCode} onChange={set("cameraCode")} />
              <p className="text-[11px] text-muted-foreground">{CODE_HELP}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lg-title">Video title{req}</Label>
              <Input id="lg-title" placeholder="The topic only, e.g. Photosynthesis" value={f.title} onChange={set("title")} />
              <p className="text-[11px] text-muted-foreground">Just the topic: no grade, unit or part number.</p>
            </div>
            <div className="space-y-1">
              <Label>Presenter{req}</Label>
              {presenters.length ? (
                <Select value={f.presenter} onValueChange={(v) => setF({ ...f, presenter: v })}>
                  <SelectTrigger aria-label="Presenter" className="w-full">
                    <SelectValue placeholder="Choose the presenter" />
                  </SelectTrigger>
                  <SelectContent>
                    {presenters.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input aria-label="Presenter" value={f.presenter} onChange={set("presenter")} placeholder="Add presenters on the Presenters page" />
              )}
              {!video && prev?.presenter && f.presenter === prev.presenter && <p className="text-[11px] text-muted-foreground">Carried over from the previous clip.</p>}
            </div>
            <div className="space-y-1">
              <Label>Studio{req}</Label>
              {studios.length ? (
                <Select value={f.studio} onValueChange={(v) => setF({ ...f, studio: v })}>
                  <SelectTrigger aria-label="Studio" className="w-full">
                    <SelectValue placeholder="Choose the studio" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...studios, ...(f.studio && f.studio !== OTHER && !studios.includes(f.studio) ? [f.studio] : [])])].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER}>Other (say why)</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input aria-label="Studio" value={f.studio} onChange={set("studio")} placeholder="Studio 1" />
              )}
              {f.studio === OTHER && <Input aria-label="Why Other" value={f.studioReason} onChange={set("studioReason")} placeholder="Short reason, e.g. recorded on location at school" />}
            </div>
            <div className="space-y-1">
              <Label htmlFor="lg-date">Recording date{req}</Label>
              <Input id="lg-date" type="date" max={todayLocal()} value={f.recordedOn} onChange={set("recordedOn")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lg-min">Length (M:S){req}</Label>
              <Input id="lg-min" inputMode="numeric" placeholder="12:30" title="Minutes and seconds, e.g. 12:30" value={f.minutes} onChange={set("minutes")} />
            </div>
          </div>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-xs font-medium">Storage location / raw footage{req}</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={onDisk} onCheckedChange={(v) => setOnDisk(v === true)} /> On an external disk
            </label>
            {onDisk ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="lg-disk">Disk name or label</Label>
                  <Input id="lg-disk" value={f.disk} onChange={set("disk")} placeholder="Disk A (2TB blue)" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lg-path">Folder on the disk</Label>
                  <Input id="lg-path" value={f.path} onChange={set("path")} placeholder="G9/Biology/U1" />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="lg-link">Raw footage link or path</Label>
                <Input id="lg-link" value={f.link} onChange={set("link")} placeholder="https://drive.example.com/... or D:\Raw\G9\Biology" />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">The Recording lead can change this later, for example when the files move from a PC to an external disk.</p>
          </fieldset>
          <fieldset className="space-y-2 rounded-lg border p-3" data-legacy-resources>
            <legend className="px-1 text-xs font-medium">Supporting resources{req}</legend>
            {(video?.files ?? []).length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {video!.files.map((x) => (
                  <li key={x.id} className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-xs", removing.has(x.id) && "line-through opacity-50")}>
                    <a href={`/api/legacy-files/${x.id}`} target="_blank" rel="noreferrer" className="max-w-48 truncate hover:underline">
                      {x.name}
                    </a>
                    <button type="button" className="text-muted-foreground hover:text-destructive" aria-label={removing.has(x.id) ? `Keep ${x.name}` : `Remove ${x.name}`} onClick={() => setRemoving((s) => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })}>
                      {removing.has(x.id) ? <Undo2Icon className="size-3" /> : <XIcon className="size-3" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <AttachPicker files={att.files} add={(x) => void att.add(x)} remove={att.remove} label="Attach PDFs, slides or handouts" hint="Up to 9 MB." accept={RES_ACCEPT} disabled={f.noResources} />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox disabled={fileCount > 0} checked={!fileCount && f.noResources} onCheckedChange={(v) => setF({ ...f, noResources: v === true })} /> None: this video has no supporting resources
            </label>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="lg-desc">Notes</Label>
            <Textarea id="lg-desc" rows={3} className="max-h-48 overflow-y-auto [field-sizing:fixed]" placeholder="Takes, problems, anything Editing should know" value={f.description} onChange={set("description")} />
          </div>
          {missing.length > 0 && <p className="text-xs text-muted-foreground" data-legacy-missing>To submit for review, still needed: {missing.join(", ")}.</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={!!busy || !draftOk} title={draftOk ? undefined : "A draft needs the camera code, title and studio"} onClick={() => void save("draft")}>
            {busy === "draft" && <Loader2Icon className="animate-spin" />} Save as draft
          </Button>
          <Button disabled={!!busy || missing.length > 0} onClick={() => void save("submitted")}>
            {busy === "submitted" && <Loader2Icon className="animate-spin" />} Submit for review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Marking a part done is where its recording checklist is ticked (it is entered nowhere else).
function DoneDialog({ part, onClose }: { part: LegacyPart; onClose: () => void }) {
  const act = useAct();
  const [checks, setChecks] = React.useState<Record<string, boolean>>(Object.fromEntries(part.checks.map((c) => [c.key, c.checked])));
  const [busy, setBusy] = React.useState(false);
  const open = part.checks.filter((c) => c.required && !checks[c.key]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-legacy-done>
        <DialogHeader>
          <DialogTitle>Mark Part {part.number} done</DialogTitle>
          <DialogDescription>Check the recording, then it waits on Ready to hand off.</DialogDescription>
        </DialogHeader>
        {part.drafts > 0 && <p className="rounded-lg border border-[var(--st-paused-fg)] px-3 py-2 text-sm text-[var(--st-paused-fg)]">Submit or remove the {many(part.drafts, "draft entry", "draft entries")} first.</p>}
        <fieldset className="space-y-2 text-sm">
          {part.checks.map((c) => (
            <label key={c.key} className="flex items-center gap-2">
              <Checkbox checked={!!checks[c.key]} onCheckedChange={(v) => setChecks({ ...checks, [c.key]: v === true })} /> {c.label}
              {c.required && <span className="text-xs text-muted-foreground">required</span>}
            </label>
          ))}
        </fieldset>
        {part.missing.length > 0 && <p className="text-xs text-[var(--st-paused-fg)]">Also needed: {part.missing.join("; ")}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || open.length > 0 || part.drafts > 0}
            onClick={async () => {
              setBusy(true);
              const ok = await act(markRecordedAction(part.id, checks), "Done. It waits on Ready to hand off.");
              setBusy(false);
              if (ok) onClose();
            }}
          >
            {busy && <Loader2Icon className="animate-spin" />} <CheckCheckIcon /> Mark done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Ready to hand off: the parts done, to check and hand off one by one or many at once, with filters.
function ReadyView({ rows, lead }: { rows: ReadyRow[]; lead: boolean }) {
  const router = useRouter();
  const [f, setF] = React.useState({ grade: "", subject: "", teacher: "", owner: "", status: "", q: "" });
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const opts = (k: (r: ReadyRow) => [string, string] | null) => [...new Map(rows.map(k).filter((x): x is [string, string] => !!x)).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const needle = f.q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!f.grade || r.gradeId === f.grade) &&
      (!f.subject || r.subjectId === f.subject) &&
      (!f.teacher || (r.teacher ?? "") === f.teacher) &&
      (!f.owner || r.ownerId === f.owner) &&
      (!f.status || r.status === f.status) &&
      (!needle || `${r.code} ${r.title} ${r.teacher ?? ""} ${r.owner ?? ""}`.toLowerCase().includes(needle)),
  );
  const chosen = shown.filter((r) => picked.has(r.itemId));
  const STATUS: Record<string, string> = { finished: "Done, to check", lead_review: "With the lead", ready: "Approved" };
  const sel = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="space-y-3" data-legacy-ready>
      <div>
        <h2 className="text-lg font-semibold">Ready to hand off</h2>
        <p className="text-sm text-muted-foreground">
          {lead ? "Parts your team marked done, sent to you, or approved. Check them, then hand them over to Editing as one batch." : "Your parts marked done. Check each one, then hand them off to the Recording lead, one by one or many at once."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Grade" className={sel} value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}>
          <option value="">Any grade</option>
          {opts((r) => [r.gradeId, r.grade]).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Subject" className={sel} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}>
          <option value="">Any subject</option>
          {opts((r) => [r.subjectId, r.subject]).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Teacher" className={sel} value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })}>
          <option value="">Any teacher</option>
          {opts((r) => (r.teacher ? [r.teacher, r.teacher] : null)).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {lead && (
          <>
            <select aria-label="Recorded by" className={sel} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
              <option value="">Anyone</option>
              {opts((r) => (r.ownerId ? [r.ownerId, r.owner ?? ""] : null)).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select aria-label="Status" className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">Any status</option>
              {Object.entries(STATUS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </>
        )}
        <Input className="h-9 w-44" placeholder="Search" aria-label="Search ready parts" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      </div>
      {!shown.length ? (
        <EmptyState icon={<ClipboardCheckIcon className="size-5" />} title="Nothing ready" description="Parts you mark Done wait here until you hand them off." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 p-2">
                  <Checkbox aria-label="Select all shown" checked={chosen.length > 0 && chosen.length === shown.length} onCheckedChange={(v) => setPicked(v ? new Set(shown.map((r) => r.itemId)) : new Set())} />
                </th>
                <th className="p-2 font-medium">Part</th>
                <th className="p-2 font-medium">Teacher</th>
                <th className="p-2 font-medium">Shots</th>
                <th className="p-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.itemId} className="border-t align-top" data-ready-row={r.code}>
                  <td className="p-2">
                    <Checkbox aria-label={`Select ${r.code}`} checked={picked.has(r.itemId)} onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(r.itemId); else n.delete(r.itemId); return n; })} />
                  </td>
                  <td className="p-2">
                    <Link href={`/items/${r.itemId}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {r.grade} · {r.subject}
                      {r.unit != null ? ` · Unit ${r.unit}` : ""}
                      {r.part != null ? ` · Part ${r.part}` : ""}
                      {lead && r.owner ? ` · ${r.owner}` : ""}
                    </span>
                  </td>
                  <td className="p-2 text-xs">{r.teacher ?? "-"}</td>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {r.videos}
                    {r.minutes ? ` · ${r.minutes} min` : ""}
                  </td>
                  <td className="p-2 text-xs whitespace-nowrap">{STATUS[r.status] ?? r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {chosen.length > 0 && (
        <div className="sticky bottom-20 z-20 mx-auto flex w-fit max-w-full items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-lg md:bottom-3" data-ready-bar>
          <span className="text-sm font-medium tabular">{chosen.length} selected</span>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await handOffAction(chosen.map((x) => x.itemId));
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              const ok = r.data!.results.filter((x) => x.ok).length;
              const bad = r.data!.results.filter((x) => !x.ok);
              if (ok) toast.success(r.data!.handover ? `${ok} handed over to Editing (${r.data!.handover})` : `${ok} sent to the Recording lead`);
              if (bad.length) toast.error(`${bad.length} not handed off`, { description: bad.map((b) => `${b.code}: ${b.error}`).join("; ").slice(0, 300) });
              setPicked(new Set());
              router.refresh();
            }}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} {lead ? "Hand over to Editing" : "Hand off"}
          </Button>
        </div>
      )}
    </div>
  );
}

// Adding (or, for the lead, changing) a part: only its number, unique in the unit, and whether it is a review. Parts are
// named "Part X"; the topic is typed once, as the video title. Parts are always listed by number.
function PartDialog({ unitNumber, parts, part, initialKind = "standard", onClose, onSave }: { unitNumber: number; parts: LegacyPart[]; part?: LegacyPart; initialKind?: "standard" | "review"; onClose: () => void; onSave: (number: number, kind: "standard" | "review") => Promise<boolean> }) {
  const next = Math.max(0, ...parts.map((p) => p.number)) + 1;
  const [num, setNum] = React.useState(String(part?.number ?? next));
  const [kind, setKind] = React.useState<"standard" | "review">(part?.kind ?? initialKind);
  const [busy, setBusy] = React.useState(false);
  const n = Number(num);
  const valid = Number.isInteger(n) && n >= 1 && n <= 999;
  const taken = valid && parts.some((p) => p.number === n && p.id !== part?.id);
  const save = async () => {
    if (!valid || taken) return;
    setBusy(true);
    const ok = await onSave(n, kind);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm" data-legacy-dialog>
        <DialogHeader>
          <DialogTitle>{part ? `Change Part ${part.number}` : `Add a part to Unit ${unitNumber}`}</DialogTitle>
          <DialogDescription>Parts are named by number only. The topic goes in each video&apos;s title.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="lg-part-num">Part number</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Part</span>
              <Input id="lg-part-num" autoFocus type="number" min={1} max={999} className="w-24" value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} aria-invalid={taken || !valid} />
            </div>
            {taken && <p className="text-xs text-destructive">Part {n} already exists in this unit.</p>}
            {!valid && num !== "" && <p className="text-xs text-destructive">A whole number from 1.</p>}
          </div>
          <div className="space-y-1">
            <Label>Kind</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["standard", "review"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs transition-colors",
                    kind === k ? (k === "review" ? "border-amber-500 bg-amber-500/10 font-semibold text-amber-700 dark:text-amber-300" : "border-primary bg-primary/10 font-semibold text-primary") : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {k === "review" ? <SparklesIcon className="size-4" /> : <LayersIcon className="size-4" />} {k === "review" ? "Review part" : "Standard part"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !valid || taken} onClick={save}>
            {busy && <Loader2Icon className="animate-spin" />} {part ? "Save" : `Add Part ${valid ? n : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VideoCard({ v, onEdit, onDelete }: { v: LegacyVideo; onEdit: () => void; onDelete: () => void }) {
  // The heading is always the video title; a draft without one yet shows its camera code.
  const heading = v.title || v.cameraCode;
  return (
    <div className={cn("rounded-lg border bg-background p-3", v.status === "draft" && "border-dashed")} data-legacy-shot={v.cameraCode}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm font-semibold" data-legacy-shot-title>
            {heading}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-[var(--st-paused-bg)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--st-paused-fg)]">{v.cameraCode}</span>
            {v.status === "draft" ? (
              <Badge variant="outline" className="border-[var(--st-paused-fg)] text-[var(--st-paused-fg)]">
                Draft
              </Badge>
            ) : (
              <Badge variant="secondary">Submitted</Badge>
            )}
          </span>
        </span>
        <span className="flex shrink-0">
          {v.canEdit && (
            <Button size="icon-xs" variant="ghost" aria-label={`Edit ${v.cameraCode}`} onClick={onEdit}>
              <PencilIcon />
            </Button>
          )}
          {v.canDelete && (
            <Button size="icon-xs" variant="ghost" aria-label={`Delete ${v.cameraCode}`} onClick={onDelete}>
              <Trash2Icon />
            </Button>
          )}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Presenter</dt>
        <dd className="truncate">{v.presenter ?? "-"}</dd>
        <dt className="text-muted-foreground">Studio</dt>
        <dd className="truncate">
          {v.studio ?? "-"}
          {v.studioReason ? ` (${v.studioReason})` : ""}
        </dd>
        <dt className="text-muted-foreground">Recorded</dt>
        <dd className="tabular">
          {v.recordedOn ?? "-"}
          {v.minutes ? ` · ${fmtMS(v.minutes)}` : ""}
        </dd>
        <dt className="text-muted-foreground">Stored</dt>
        <dd className="truncate">
          {v.disk ? `${v.disk}${v.path ? `, ${v.path}` : ""}` : v.link ? (
            /^https?:\/\//.test(v.link) ? (
              <a href={v.link} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {v.link}
              </a>
            ) : (
              v.link
            )
          ) : (
            "-"
          )}
        </dd>
      </dl>
      {v.description && <p className="mt-1.5 max-h-24 overflow-y-auto text-xs whitespace-pre-line text-muted-foreground">{v.description}</p>}
      {v.files.length > 0 ? (
        <div className="mt-2">
          <FileLinks files={v.files} base="/api/legacy-files" />
        </div>
      ) : v.noResources ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">No supporting resources</p>
      ) : null}
      {v.by && <p className="mt-1.5 text-[11px] text-muted-foreground">Logged by {v.by}</p>}
    </div>
  );
}

function PartsView({ grade, subject, unit, parts, canRemove, choices }: Props & { unit: NonNullable<Props["unit"]> }) {
  const act = useAct();
  const [adding, setAdding] = React.useState<"standard" | "review" | null>(null);
  const [edit, setEdit] = React.useState<LegacyPart | null>(null);
  const [del, setDel] = React.useState<LegacyPart | null>(null);
  const [done, setDone] = React.useState<LegacyPart | null>(null);
  const [addVideo, setAddVideo] = React.useState<LegacyPart | null>(null);
  const [editVideo, setEditVideo] = React.useState<{ part: LegacyPart; video: LegacyVideo } | null>(null);
  const [delVideo, setDelVideo] = React.useState<LegacyVideo | null>(null);
  const place: Place = { grade: grade?.name ?? "", subject: subject?.name ?? "", unit: `Unit ${unit.number}: ${unit.title}` };
  const sorted = [...parts].sort((a, b) => a.number - b.number);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Unit {unit.number}: {unit.title}
        </h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding("review")}>
            <SparklesIcon className="mr-1 size-3.5 text-amber-500" /> Add review part
          </Button>
          <Button size="sm" onClick={() => setAdding("standard")}>
            <PlusIcon /> Add part
          </Button>
        </div>
      </div>
      {!sorted.length ? (
        <EmptyState icon={<LayersIcon className="size-5" />} title="No parts in this unit yet" description="Add Part 1." />
      ) : (
        sorted.map((p) => (
          <Card key={p.id} data-legacy-part={p.number}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                {p.kind === "review" ? <SparklesIcon className="size-4 text-amber-500" /> : <LayersIcon className="size-4 text-primary" />}
                <h3 className="font-semibold" data-legacy-part-name>
                  Part {p.number}
                </h3>
                {p.kind === "review" && (
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 font-medium text-amber-700 dark:text-amber-300">
                    Review
                  </Badge>
                )}
                <Badge variant="secondary">{many(p.videos.length, "video")}</Badge>
                {p.drafts > 0 && (
                  <Badge variant="outline" className="border-[var(--st-paused-fg)] text-[var(--st-paused-fg)]">
                    {many(p.drafts, "draft")}
                  </Badge>
                )}
                <Badge variant="outline" data-legacy-where>
                  {p.where}
                </Badge>
                {(p.teacher || p.rawMin) && (
                  <span className="text-xs text-muted-foreground" title="From the video entries">
                    {[p.teacher, p.rawMin ? `${fmtMS(p.rawMin)} raw` : null].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  {p.canMark && (
                    <Button size="sm" variant="outline" onClick={() => setDone(p)}>
                      <CheckCheckIcon /> Done
                    </Button>
                  )}
                  {p.canReopen && (
                    <Button size="sm" variant="ghost" onClick={() => void act(reopenPartAction(p.id), "Reopened")}>
                      <Undo2Icon /> Reopen
                    </Button>
                  )}
                  <Button size="sm" disabled={!p.canLog} title={p.canLog ? undefined : "This part has left Recording"} onClick={() => setAddVideo(p)}>
                    <VideoIcon /> Add video
                  </Button>
                  {canRemove && (
                    <>
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit part ${p.number}`} onClick={() => setEdit(p)}>
                        <PencilIcon />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete part ${p.number}`} onClick={() => setDel(p)}>
                        <Trash2Icon />
                      </Button>
                    </>
                  )}
                </span>
              </div>
              {!p.videos.length ? (
                <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No video entries in this part yet.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {p.videos.map((v) => (
                    <VideoCard key={v.id} v={v} onEdit={() => setEditVideo({ part: p, video: v })} onDelete={() => setDelVideo(v)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
      {adding && <PartDialog unitNumber={unit.number} parts={parts} initialKind={adding} onClose={() => setAdding(null)} onSave={(n, kind) => act(addPartAction(unit.id, n, { kind }), `Part ${n} added`)} />}
      {edit && <PartDialog unitNumber={unit.number} parts={parts} part={edit} onClose={() => setEdit(null)} onSave={(n, kind) => act(editPartAction(edit.id, { number: n, kind }), `Saved as Part ${n}`)} />}
      {del && <ConfirmDelete text={`Delete Part ${del.number}?`} detail={del.videos.length ? `Its ${many(del.videos.length, "video entry", "video entries")} go too. If it has gone past Recording, it stays.` : "If it has gone past Recording, it stays."} onClose={() => setDel(null)} onYes={() => act(deletePartAction(del.id), "Part deleted")} />}
      {done && <DoneDialog part={done} onClose={() => setDone(null)} />}
      {addVideo && <VideoDialog part={addVideo} place={place} choices={choices} onClose={() => setAddVideo(null)} />}
      {editVideo && <VideoDialog part={editVideo.part} video={editVideo.video} place={place} choices={choices} onClose={() => setEditVideo(null)} />}
      {delVideo && <ConfirmDelete text={`Delete the entry ${delVideo.title || delVideo.cameraCode}?`} detail="The recording is taken off this part." onClose={() => setDelVideo(null)} onYes={() => act(deleteVideoAction(delVideo.id), "Video entry deleted")} />}
    </div>
  );
}

type ImportCheck = { counts: { grades: number; subjects: number; units: number; parts: number; videos: number }; fixes: { where: string; what: string }[]; fixCount: number };

function ImportDialog({ config, onClose }: { config: LegacyConfig; onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [check, setCheck] = React.useState<ImportCheck | null>(null);
  const [busy, setBusy] = React.useState(false);
  const send = async (dry: boolean) => {
    const form = new FormData();
    form.set("file", file!);
    setBusy(true);
    const r = await importLegacyAction(form, dry);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    if (dry) return setCheck(r.data as ImportCheck);
    toast.success("Catalog imported", { description: r.data?.summary ? `${r.data.summary.parts.created} new parts, ${r.data.summary.recordings.created} new recordings.` : undefined });
    onClose();
    router.refresh();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl" data-legacy-import>
        <DialogHeader>
          <DialogTitle>Import the catalog&apos;s backup</DialogTitle>
          <DialogDescription>
            The JSON file the old catalog downloaded. It is checked and tidied first. Importing again updates the same parts, and names people have corrected are kept.
            {config.importAsRecorded ? " Parts with videos count as recorded and move on to Editing." : " Parts stay in Recording."}
          </DialogDescription>
        </DialogHeader>
        <Input aria-label="Catalog backup" type="file" accept=".json" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setCheck(null))} />
        {check && (
          <div className="space-y-2 rounded-lg border p-3 text-sm" data-legacy-check>
            <p className="font-medium">
              {many(check.counts.grades, "grade")}, {many(check.counts.subjects, "subject")}, {many(check.counts.units, "unit")}, {many(check.counts.parts, "part")}, {many(check.counts.videos, "video")}
            </p>
            <p className="text-muted-foreground">{check.fixCount ? `${check.fixCount} things will be tidied or need a look:` : "Nothing needs tidying."}</p>
            <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
              {check.fixes.slice(0, 200).map((f, i) => (
                <li key={i}>
                  <span className="text-muted-foreground">{f.where}:</span> {f.what}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!check ? (
            <Button disabled={busy || !file} onClick={() => void send(true)}>
              {busy && <Loader2Icon className="animate-spin" />} Check the file
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => void send(false)}>
              {busy && <Loader2Icon className="animate-spin" />} Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ config, onClose }: { config: LegacyConfig; onClose: () => void }) {
  const act = useAct();
  const [c, setC] = React.useState(config);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-legacy-settings>
        <DialogHeader>
          <DialogTitle>Legacy catalog settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Switch id="lc-on" checked={c.on} onCheckedChange={(v) => setC({ ...c, on: v })} />
            <Label htmlFor="lc-on">Show the Legacy catalog to the Recording team</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lc-after">After a video shot is logged</Label>
            <select id="lc-after" className="h-9 w-full rounded-md border bg-background px-2" value={c.afterVideo} onChange={(e) => setC({ ...c, afterVideo: e.target.value as LegacyConfig["afterVideo"] })}>
              <option value="stay">The part stays open until someone presses Done</option>
              <option value="done">The part is marked done at once (it still waits on Ready to hand off)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="lc-name" checked={c.nameFromVideo} onCheckedChange={(v) => setC({ ...c, nameFromVideo: v })} />
            <Label htmlFor="lc-name">A part&apos;s work item takes its first video&apos;s title (so other teams see the topic)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="lc-import" checked={c.importAsRecorded} onCheckedChange={(v) => setC({ ...c, importAsRecorded: v })} />
            <Label htmlFor="lc-import">Importing a backup: parts with videos count as recorded and move on to Editing</Label>
          </div>
          <PartNamesFix />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={async () => (await act(saveLegacyConfigAction(c), "Settings saved")) && onClose()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// One-time clean-up: parts that still carry their own titles become "Part X" (shown first, then done on confirm).
function PartNamesFix() {
  const router = useRouter();
  const [check, setCheck] = React.useState<{ count: number; sample: { from: string; to: string }[] } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const go = async (commit: boolean) => {
    setBusy(true);
    const r = await migratePartNamesAction(commit);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    if (commit) {
      toast.success(`${many(r.data!.count, "part")} renamed`);
      setCheck(null);
      router.refresh();
    } else setCheck(r.data!);
  };
  return (
    <div className="space-y-2 rounded-lg border p-3" data-legacy-part-names>
      <p className="font-medium">Number-only part names</p>
      <p className="text-xs text-muted-foreground">Renames parts like &quot;Part 3: text&quot; to &quot;Part 3&quot;. The work items keep their topic, and the old names stay in the history.</p>
      {check && (
        <div className="space-y-1 text-xs">
          <p>{check.count ? `${many(check.count, "part")} will be renamed:` : "Every part already has a number-only name."}</p>
          <ul className="max-h-32 overflow-y-auto text-muted-foreground">
            {check.sample.map((x, i) => (
              <li key={i}>
                {x.from} → {x.to}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void go(false)}>
          Check
        </Button>
        {check && check.count > 0 && (
          <Button size="sm" disabled={busy} onClick={() => void go(true)}>
            {busy && <Loader2Icon className="animate-spin" />} Rename {many(check.count, "part")}
          </Button>
        )}
      </div>
    </div>
  );
}
