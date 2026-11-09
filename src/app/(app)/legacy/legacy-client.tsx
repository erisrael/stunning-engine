"use client";

// The Recording team's old catalog in this app's look: the same levels in the same order (Grades, Subjects, Units, Parts
// and video shots), the same add, edit and delete at each level, and the same Word and JSON files. Everything is saved
// straight into the real curriculum and the part's work.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightIcon, BookOpenIcon, BoxesIcon, CheckCheckIcon, ChevronRightIcon, DownloadIcon, FileTextIcon, FilmIcon, HomeIcon, LayersIcon, ListPlusIcon, Loader2Icon, PencilIcon, PlusIcon, SettingsIcon, SparklesIcon, Trash2Icon, UploadIcon, VideoIcon } from "lucide-react";
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
  saveDetailsAction,
  handOffAction,
} from "@/app/actions/legacy";
import type { LegacyConfig, LegacyPart, LegacyVideo, ReadyRow } from "@/server/legacy";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardCheckIcon, SendIcon, Undo2Icon } from "lucide-react";
import { isPlaceholderTitle } from "@/lib/curriculum-names";

type Result = { ok: boolean; error?: string };
type GradeCard = { id: string; name: string; level: string | null; subjects: number; videos: number };
type SubjectCard = { id: string; name: string; units: number; videos: number };
type UnitCard = { id: string; number: number; title: string; parts: number; videos: number };
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
  config: LegacyConfig;
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
        <Button size="sm" onClick={() => setAdding(true)}>
          <PlusIcon /> Add new subject
        </Button>
      </div>
      {!subjects.length ? (
        <EmptyState icon={<BookOpenIcon className="size-5" />} title={`No subjects in ${grade.name} yet`} description="Add the first one." />
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
                <span className="flex">
                  <Button size="icon-xs" variant="ghost" aria-label={`Edit unit ${u.number}`} onClick={() => setEdit(u)}>
                    <PencilIcon />
                  </Button>
                  {canRemove && (
                    <Button size="icon-xs" variant="ghost" aria-label={`Delete unit ${u.number}`} onClick={() => setDel(u)}>
                      <Trash2Icon />
                    </Button>
                  )}
                </span>
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
      {adding && <NameDialog title={`Add unit to ${subject.name}`} label="Unit title" value={`Unit ${(units.at(-1)?.number ?? 0) + 1}: `} onClose={() => setAdding(false)} onSave={(v) => act(addUnitAction(grade.id, subject.id, v), "Unit added")} />}
      {edit && <NameDialog title={`Edit unit ${edit.number}`} label="Unit title" value={edit.title} onClose={() => setEdit(null)} onSave={(v) => act(editUnitAction(edit.id, v), "Unit updated")} />}
      {del && <ConfirmDelete text={`Delete unit ${del.number}, "${del.title}"?`} detail="Its parts go too. If any part has gone past Recording, nothing is deleted." onClose={() => setDel(null)} onYes={() => act(deleteUnitAction(del.id), "Unit deleted")} />}
    </div>
  );
}

function VideoDialog({ part, video, onClose }: { part: LegacyPart; video?: LegacyVideo; onClose: () => void }) {
  const act = useAct();
  const router = useRouter();
  const [f, setF] = React.useState({ cameraCode: video?.cameraCode ?? "", title: video?.title ?? "", description: video?.description ?? "", minutes: video?.minutes ? String(video.minutes) : "", link: video?.link ?? "", disk: video?.disk ?? "", path: video?.path ?? "" });
  const [onDisk, setOnDisk] = React.useState(!!video?.disk);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    let ok: boolean;
    const input = { ...f, minutes: f.minutes ? Number(f.minutes) : null, link: onDisk ? null : f.link || null, disk: onDisk ? f.disk || null : null, path: onDisk ? f.path || null : null };
    if (video) ok = await act(editVideoAction(video.id, input), "Video details updated");
    else {
      const r = await addVideoAction(part.id, input);
      ok = r.ok;
      if (!r.ok) toast.error(r.error);
      else {
        // The code as it was tidied; one that does not look like a code is pointed out, not changed.
        if (r.data?.doubtful) toast.warning(`Added ${r.data.code}. Check it: it does not look like a camera code.`);
        else toast.success(`Added video shot ${r.data?.code}`);
        router.refresh();
      }
    }
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-legacy-video>
        <DialogHeader>
          <DialogTitle>{video ? "Edit video details" : `Add video shot to part ${part.number}`}</DialogTitle>
          <DialogDescription>Several files for one video go together, as C0172 &amp; C0173. Capitals and spacing are tidied for you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="lg-code">Camera code</Label>
            <Input id="lg-code" autoFocus className="font-mono uppercase" placeholder="C0001" value={f.cameraCode} onChange={(e) => setF({ ...f, cameraCode: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lg-title">Video title</Label>
            <Input id="lg-title" placeholder="Introduction and key definitions" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lg-min">Minutes</Label>
              <Input id="lg-min" type="number" min={0} step="0.5" inputMode="decimal" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <Checkbox checked={onDisk} disabled={!!video} onCheckedChange={(v) => setOnDisk(v === true)} /> On an external disk
            </label>
          </div>
          {onDisk ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="lg-disk">Disk</Label>
                <Input id="lg-disk" disabled={!!video} value={f.disk} onChange={(e) => setF({ ...f, disk: e.target.value })} placeholder="Disk A" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lg-path">Folder</Label>
                <Input id="lg-path" disabled={!!video} value={f.path} onChange={(e) => setF({ ...f, path: e.target.value })} placeholder="G9/Biology/U1" />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="lg-link">Raw footage link (optional)</Label>
              <Input id="lg-link" type="url" inputMode="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://drive.example.com/..." />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="lg-desc">Description or notes</Label>
            <Textarea id="lg-desc" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !f.cameraCode.trim()} onClick={save}>
            {busy && <Loader2Icon className="animate-spin" />} {video ? "Save changes" : "Save video shot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The rest of what the Recording team enters on a part, as on their work card.
function PartDetails({ part }: { part: LegacyPart }) {
  const act = useAct();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ teacher: part.teacher ?? "", rawMin: part.rawMin == null ? "" : String(part.rawMin), notes: part.notes ?? "", checks: Object.fromEntries(part.checks.map((c) => [c.key, c.checked])) as Record<string, boolean> });
  React.useEffect(() => setF({ teacher: part.teacher ?? "", rawMin: part.rawMin == null ? "" : String(part.rawMin), notes: part.notes ?? "", checks: Object.fromEntries(part.checks.map((c) => [c.key, c.checked])) }), [part]);
  const editable = part.canLog;
  const filled = [part.teacher, part.rawMin, part.notes].filter((x) => x !== null && x !== "").length + part.checks.filter((c) => c.checked).length;
  return (
    <div className="rounded-lg border bg-muted/20" data-legacy-details>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronRightIcon className={open ? "size-4 rotate-90 transition-transform" : "size-4 transition-transform"} />
        <span className="font-medium">Recording details</span>
        <span className="text-xs text-muted-foreground">
          {part.teacher ? `${part.teacher} · ` : ""}
          {part.rawMin ? `${part.rawMin} min · ` : ""}
          {part.checks.filter((c) => c.checked).length}/{part.checks.length} checked
        </span>
        {part.missing.length > 0 && <span className="ml-auto text-xs text-[var(--st-paused-fg)]">Still needed: {part.missing.length}</span>}
        {!filled && !part.missing.length && <span className="ml-auto text-xs text-muted-foreground">Not filled in</span>}
      </button>
      {open && (
        <div className="space-y-3 border-t p-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`lt-${part.id}`}>Presenter (teacher)</Label>
              <Input id={`lt-${part.id}`} value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })} placeholder="Ato Kebede" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`lm-${part.id}`}>Raw minutes in total</Label>
              <Input id={`lm-${part.id}`} type="number" min={0} step="0.5" inputMode="decimal" disabled={!editable} value={f.rawMin} onChange={(e) => setF({ ...f, rawMin: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`ln-${part.id}`}>Notes for the team (studio, takes, problems)</Label>
            <Textarea id={`ln-${part.id}`} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
          {part.checks.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="font-medium">Checklist</legend>
              {part.checks.map((c) => (
                <label key={c.key} className="flex items-center gap-2">
                  <Checkbox disabled={!editable} checked={!!f.checks[c.key]} onCheckedChange={(v) => setF({ ...f, checks: { ...f.checks, [c.key]: v === true } })} /> {c.label}
                  {c.required && <span className="text-xs text-muted-foreground">required</span>}
                </label>
              ))}
            </fieldset>
          )}
          {part.missing.length > 0 && <p className="text-xs text-[var(--st-paused-fg)]">Before it is done: {part.missing.join("; ")}</p>}
          <Button
            size="sm"
            onClick={() => void act(saveDetailsAction(part.id, { teacher: f.teacher, notes: f.notes, ...(editable ? { rawMin: f.rawMin === "" ? null : Number(f.rawMin), checks: f.checks } : {}) }), "Details saved")}
          >
            Save details
          </Button>
        </div>
      )}
    </div>
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

type AddPartState = {
  insertAt?: number | null;
  kind?: "standard" | "review" | "custom";
};

const isReviewPart = (title: string) => /^(?:review|summary|ክለሳ|ፈተና|exam)/i.test(String(title ?? "").trim());

function AddPartDialog({
  unitNumber,
  existingParts,
  initial,
  onClose,
  onSave,
}: {
  unitNumber: number;
  existingParts: LegacyPart[];
  initial: AddPartState;
  onClose: () => void;
  onSave: (title: string, opts: { insertAt?: number | null; kind: "standard" | "review" | "custom" }) => Promise<boolean>;
}) {
  const [kind, setKind] = React.useState<"standard" | "review" | "custom">(initial.kind ?? "standard");
  const nextNum = (existingParts.at(-1)?.number ?? 0) + 1;
  const [insertAt, setInsertAt] = React.useState<number | "end">(
    initial.insertAt && initial.insertAt <= nextNum ? initial.insertAt : "end"
  );

  const defaultTitle = (k: "standard" | "review" | "custom", pos: number | "end") => {
    const num = pos === "end" ? nextNum : pos;
    if (k === "standard") return `Part ${num}: `;
    if (k === "review") return `Review: Unit ${unitNumber}`;
    return "";
  };

  const [title, setTitle] = React.useState(() => defaultTitle(initial.kind ?? "standard", initial.insertAt ?? "end"));
  const [busy, setBusy] = React.useState(false);

  const handleKindChange = (nextK: "standard" | "review" | "custom") => {
    setKind(nextK);
    setTitle(defaultTitle(nextK, insertAt));
  };

  const handleInsertAtChange = (val: string) => {
    const nextPos = val === "end" ? "end" : Number(val);
    setInsertAt(nextPos);
    if (kind === "standard" && title.startsWith("Part ")) {
      const num = nextPos === "end" ? nextNum : nextPos;
      const rest = title.replace(/^Part\s*\d+\s*[:.\-–]?\s*/i, "");
      setTitle(`Part ${num}: ${rest}`);
    }
  };

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const chosenInsertAt = insertAt === "end" ? null : insertAt;
    const ok = await onSave(title.trim(), { insertAt: chosenInsertAt, kind });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-legacy-dialog>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind === "review" ? <SparklesIcon className="size-5 text-amber-500" /> : <LayersIcon className="size-5 text-primary" />}
            {kind === "review" ? "Add Review Part" : kind === "custom" ? "Add Custom Part" : "Add Part"}
          </DialogTitle>
          <DialogDescription>
            Add a lesson, review session, or custom part to Unit {unitNumber}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Part Type Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Part Type</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleKindChange("standard")}
                className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center text-xs transition-colors ${
                  kind === "standard"
                    ? "border-primary bg-primary/10 font-semibold text-primary shadow-sm"
                    : "border-border hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                <LayersIcon className="mb-1 size-4" />
                <span>Standard Part</span>
              </button>
              <button
                type="button"
                onClick={() => handleKindChange("review")}
                className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center text-xs transition-colors ${
                  kind === "review"
                    ? "border-amber-500 bg-amber-500/10 font-semibold text-amber-600 dark:text-amber-400 shadow-sm"
                    : "border-border hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                <SparklesIcon className="mb-1 size-4" />
                <span>Review Part</span>
              </button>
              <button
                type="button"
                onClick={() => handleKindChange("custom")}
                className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center text-xs transition-colors ${
                  kind === "custom"
                    ? "border-primary bg-primary/10 font-semibold text-primary shadow-sm"
                    : "border-border hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                <FileTextIcon className="mb-1 size-4" />
                <span>Custom Part</span>
              </button>
            </div>
          </div>

          {/* Placement / Position Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="lg-part-pos" className="text-xs font-semibold uppercase text-muted-foreground">Placement</Label>
            <select
              id="lg-part-pos"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={String(insertAt)}
              onChange={(e) => handleInsertAtChange(e.target.value)}
            >
              <option value="end">At end (Position {nextNum})</option>
              {existingParts.map((p) => (
                <option key={p.id} value={p.number}>
                  Insert at position {p.number} (before: {p.title || `Part ${p.number}`})
                </option>
              ))}
            </select>
            {insertAt !== "end" && (
              <p className="text-xs text-muted-foreground">
                Existing parts from #{insertAt} onward will automatically shift down by 1.
              </p>
            )}
          </div>

          {/* Part Title Input */}
          <div className="space-y-1.5">
            <Label htmlFor="lg-part-title" className="text-xs font-semibold uppercase text-muted-foreground">
              {kind === "review" ? "Review Title" : kind === "custom" ? "Custom Part Title" : "Part Title"}
            </Label>
            <Input
              id="lg-part-title"
              autoFocus
              placeholder={
                kind === "review"
                  ? "e.g. Unit Review, Review Part 1, ክለሳ"
                  : kind === "custom"
                  ? "e.g. Lab Exercise, Special Topic, Exam Prep"
                  : `Part ${insertAt === "end" ? nextNum : insertAt}: Topic name`
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && title.trim() && void save()}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !title.trim()} onClick={save}>
            {busy && <Loader2Icon className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartsView({ unit, parts, canRemove, config }: Props & { unit: NonNullable<Props["unit"]> }) {
  const act = useAct();
  const [adding, setAdding] = React.useState<AddPartState | null>(null);
  const [edit, setEdit] = React.useState<LegacyPart | null>(null);
  const [del, setDel] = React.useState<LegacyPart | null>(null);
  const [addVideo, setAddVideo] = React.useState<LegacyPart | null>(null);
  const [editVideo, setEditVideo] = React.useState<{ part: LegacyPart; video: LegacyVideo } | null>(null);
  const [delVideo, setDelVideo] = React.useState<LegacyVideo | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Unit {unit.number}: {unit.title}
        </h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding({ insertAt: null, kind: "review" })}>
            <SparklesIcon className="mr-1 size-3.5 text-amber-500" /> Add review part
          </Button>
          <Button size="sm" onClick={() => setAdding({ insertAt: null, kind: "standard" })}>
            <PlusIcon /> Add new part
          </Button>
        </div>
      </div>
      {!parts.length ? (
        <EmptyState icon={<LayersIcon className="size-5" />} title="No parts in this unit yet" description="Add part 1." />
      ) : (
        parts.map((p) => (
          <Card key={p.id} data-legacy-part={p.number}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                {isReviewPart(p.title) ? (
                  <SparklesIcon className="size-4 text-amber-500" />
                ) : (
                  <LayersIcon className="size-4 text-primary" />
                )}
                <h3 className="font-semibold">
                  {isReviewPart(p.title)
                    ? p.title
                    : p.title.toLowerCase().startsWith("part ")
                    ? p.title
                    : `Part ${p.number}: ${p.title}`}
                </h3>
                {isReviewPart(p.title) && (
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
                    Review
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground font-mono">#{p.number}</span>
                <Badge variant="secondary">{many(p.videos.length, "video")}</Badge>
                <Badge variant="outline" data-legacy-where>
                  {p.where}
                </Badge>
                {!isReviewPart(p.title) && isPlaceholderTitle(p.title) && <Badge variant="outline" className="border-[var(--st-paused-fg)] text-[var(--st-paused-fg)]">Needs a real name</Badge>}
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  {p.canMark && (
                    <Button size="sm" variant="outline" onClick={() => void act(markRecordedAction(p.id), "Done. It waits on Ready to hand off.")}>
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
                  <Button size="icon-sm" variant="ghost" title="Insert part before this one" aria-label={`Insert part before ${p.number}`} onClick={() => setAdding({ insertAt: p.number, kind: "standard" })}>
                    <ListPlusIcon className="size-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit part ${p.number}`} onClick={() => setEdit(p)}>
                    <PencilIcon />
                  </Button>
                  {canRemove && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete part ${p.number}`} onClick={() => setDel(p)}>
                      <Trash2Icon />
                    </Button>
                  )}
                </span>
              </div>
              <PartDetails part={p} />
              {!p.videos.length ? (
                <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No video shots added to this part yet.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {p.videos.map((v) => (
                    <div key={v.id} className="rounded-lg border bg-background p-3" data-legacy-shot={v.cameraCode}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <FilmIcon className="size-4 shrink-0 text-primary" />
                          <span className="truncate rounded bg-[var(--st-paused-bg)] px-1.5 py-0.5 font-mono text-xs font-semibold text-[var(--st-paused-fg)]">{v.cameraCode}</span>
                        </span>
                        <span className="flex shrink-0">
                          <Button size="icon-xs" variant="ghost" aria-label={`Edit ${v.cameraCode}`} onClick={() => setEditVideo({ part: p, video: v })}>
                            <PencilIcon />
                          </Button>
                          {p.canLog && (
                            <Button size="icon-xs" variant="ghost" aria-label={`Delete ${v.cameraCode}`} onClick={() => setDelVideo(v)}>
                              <Trash2Icon />
                            </Button>
                          )}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium">{v.title || "To be determined"}</p>
                      <p className="mt-0.5 text-xs whitespace-pre-line text-muted-foreground">{v.description || "No description provided."}</p>
                      {(v.minutes || v.link || v.disk) && (
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {v.minutes ? `${v.minutes} min` : ""}
                          {v.disk ? `${v.minutes ? " · " : ""}${v.disk}${v.path ? `, ${v.path}` : ""}` : ""}
                          {v.link ? (
                            <a href={v.link} target="_blank" rel="noreferrer" className="ml-1 text-primary hover:underline">
                              link
                            </a>
                          ) : null}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
      {adding && (
        <AddPartDialog
          unitNumber={unit.number}
          existingParts={parts}
          initial={adding}
          onClose={() => setAdding(null)}
          onSave={async (title, opts) => act(addPartAction(unit.id, title, opts), opts.kind === "review" ? "Review part added" : "Part added")}
        />
      )}
      {edit && <NameDialog title={`Edit part ${edit.number}`} label="Part title" value={edit.title} onClose={() => setEdit(null)} onSave={(v) => act(editPartAction(edit.id, v), "Part name updated")} />}
      {del && <ConfirmDelete text={`Delete part ${del.number}, "${del.title}"?`} detail={del.videos.length ? `Its ${many(del.videos.length, "video shot")} go too. If it has gone past Recording, it stays.` : "If it has gone past Recording, it stays."} onClose={() => setDel(null)} onYes={() => act(deletePartAction(del.id), "Part deleted")} />}
      {addVideo && <VideoDialog part={addVideo} onClose={() => setAddVideo(null)} />}
      {editVideo && <VideoDialog part={editVideo.part} video={editVideo.video} onClose={() => setEditVideo(null)} />}
      {delVideo && <ConfirmDelete text={`Delete the shot ${delVideo.cameraCode}?`} detail="The recording is taken off this part." onClose={() => setDelVideo(null)} onYes={() => act(deleteVideoAction(delVideo.id), "Video deleted")} />}
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
            <Label htmlFor="lc-name">A part with no real name takes its video&apos;s title</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="lc-import" checked={c.importAsRecorded} onCheckedChange={(v) => setC({ ...c, importAsRecorded: v })} />
            <Label htmlFor="lc-import">Importing a backup: parts with videos count as recorded and move on to Editing</Label>
          </div>
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
