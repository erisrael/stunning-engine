"use client";

// The Recording team's old catalog in this app's look: the same levels in the same order (Grades, Subjects, Units, Parts
// and video shots), the same add, edit and delete at each level, and the same Word and JSON files. Everything is saved
// straight into the real curriculum and the part's work.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightIcon, BookOpenIcon, BoxesIcon, CheckCheckIcon, ChevronRightIcon, DownloadIcon, FileTextIcon, FilmIcon, HomeIcon, LayersIcon, Loader2Icon, PencilIcon, PlusIcon, SettingsIcon, Trash2Icon, UploadIcon, VideoIcon } from "lucide-react";
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
} from "@/app/actions/legacy";
import type { LegacyConfig, LegacyPart, LegacyVideo } from "@/server/legacy";
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
  grades: GradeCard[];
  subjects: SubjectCard[];
  units: UnitCard[];
  parts: LegacyPart[];
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

      {!p.grade && <GradesView grades={p.grades} />}
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
  const [f, setF] = React.useState({ cameraCode: video?.cameraCode ?? "", title: video?.title ?? "", description: video?.description ?? "" });
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    let ok: boolean;
    if (video) ok = await act(editVideoAction(video.id, f), "Video details updated");
    else {
      const r = await addVideoAction(part.id, f);
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

function PartsView({ unit, parts, canRemove, config }: Props & { unit: NonNullable<Props["unit"]> }) {
  const act = useAct();
  const [adding, setAdding] = React.useState(false);
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
        <Button size="sm" onClick={() => setAdding(true)}>
          <PlusIcon /> Add new part
        </Button>
      </div>
      {!parts.length ? (
        <EmptyState icon={<LayersIcon className="size-5" />} title="No parts in this unit yet" description="Add part 1." />
      ) : (
        parts.map((p) => (
          <Card key={p.id} data-legacy-part={p.number}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                <LayersIcon className="size-4 text-primary" />
                <h3 className="font-semibold">
                  Part {p.number}: {p.title}
                </h3>
                <Badge variant="secondary">{many(p.videos.length, "video")}</Badge>
                <Badge variant="outline" data-legacy-where>
                  {p.where}
                </Badge>
                {isPlaceholderTitle(p.title) && <Badge variant="outline" className="border-[var(--st-paused-fg)] text-[var(--st-paused-fg)]">Needs a real name</Badge>}
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  {p.canMark && config.afterVideo === "stay" && (
                    <Button size="sm" variant="outline" onClick={() => void act(markRecordedAction(p.id), "Sent on to Editing")}>
                      <CheckCheckIcon /> Mark recorded
                    </Button>
                  )}
                  <Button size="sm" disabled={!p.canLog} title={p.canLog ? undefined : "This part has left Recording"} onClick={() => setAddVideo(p)}>
                    <VideoIcon /> Add video
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
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
      {adding && <NameDialog title={`Add part to unit ${unit.number}`} label="Part title" value={`Part ${(parts.at(-1)?.number ?? 0) + 1}: `} onClose={() => setAdding(false)} onSave={(v) => act(addPartAction(unit.id, v), "Part added")} />}
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
              <option value="stay">The part waits until someone presses Mark recorded</option>
              <option value="recorded">The part goes to Editing&apos;s incoming at once</option>
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
