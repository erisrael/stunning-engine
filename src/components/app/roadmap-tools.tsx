"use client";

// The Roadmap's project tools: generate a project pack (a full project or a sub-project, its roadmap from a template
// and its documents with diagrams), each project's roadmap infographic (roadmap.sh style), the picture of every
// project, and the project book.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpenIcon, DownloadIcon, ImageIcon, LayoutTemplateIcon, MapIcon, PrinterIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generatePackAction, portfolioGraphicAction, projectGraphicAction } from "@/app/actions/departments";
import { PACK_DOCS, PROJECT_TYPES, ROADMAP_TEMPLATES, type ProjectType } from "@/lib/project-pack";
import { cn } from "@/lib/utils";

type P = { id: string; key: string; name: string; parent_id: string | null };

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function svgToPng(svg: string): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await new Promise<void>((res, rej) => ((img.onload = () => res()), (img.onerror = rej), (img.src = url)));
  const scale = 2;
  const c = document.createElement("canvas");
  c.width = img.width * scale;
  c.height = img.height * scale;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

// An infographic with Download SVG, PNG and Print.
function GraphicDialog({ title, svg, file, onClose }: { title: string; svg: string; file: string; onClose: () => void }) {
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return toast.error("Allow pop-ups to print.");
    w.document.write(`<!doctype html><title>${title.replace(/</g, "")}</title><style>@page{size:A4;margin:10mm}body{margin:0}svg{width:100%;height:auto}</style>${svg}<script>onload=()=>print()</script>`);
    w.document.close();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden sm:max-w-5xl" data-roadmap-graphic>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Download it for slides and reports, or print it. It updates as the work moves.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[62vh] overflow-auto rounded-lg border bg-white p-2 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => download(`${file}.svg`, new Blob([svg], { type: "image/svg+xml" }))} data-graphic-svg>
            <DownloadIcon /> SVG
          </Button>
          <Button variant="outline" onClick={async () => download(`${file}.png`, await svgToPng(svg))} data-graphic-png>
            <ImageIcon /> PNG
          </Button>
          <Button onClick={print}>
            <PrinterIcon /> Print or PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// On each project card: its infographic and its book.
export function ProjectRoadmapButtons({ dept, project }: { dept: string; project: { id: string; key: string; name: string } }) {
  const [g, setG] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const open = async () => {
    setBusy(true);
    const r = await projectGraphicAction(dept, project.id);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setG(r.data!.svg);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="xs" variant="outline" onClick={open} disabled={busy} data-project-infographic={project.key}>
        <MapIcon /> Infographic
      </Button>
      <Button size="xs" variant="outline" asChild>
        <Link href={`/book/${dept}/${project.id}`} target="_blank" data-project-book={project.key}>
          <BookOpenIcon /> Project book
        </Link>
      </Button>
      {g && <GraphicDialog title={`${project.name} roadmap`} svg={g} file={`${project.key}-roadmap`} onClose={() => setG(null)} />}
    </div>
  );
}

// Above the roadmap: generate a project pack, and every project in one picture.
export function RoadmapToolbar({ dept, projects, canCreate }: { dept: string; projects: P[]; canCreate: boolean }) {
  const router = useRouter();
  const [all, setAll] = React.useState<string | null>(null);
  const [gen, setGen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [mode, setMode] = React.useState<"new" | "existing">("new");
  const [type, setType] = React.useState<ProjectType>("full");
  const [f, setF] = React.useState({ name: "", key: "", description: "", parentId: "", startDate: new Date().toISOString().slice(0, 10), projectId: "", template: "web-app", roadmap: true, docs: true });
  const fulls = projects.filter((p) => !p.parent_id);
  const templates = ROADMAP_TEMPLATES.filter((t) => t.type === type);
  const tpl = ROADMAP_TEMPLATES.find((t) => t.key === f.template && t.type === type) ?? null;
  React.useEffect(() => {
    if (!templates.some((t) => t.key === f.template)) setF((x) => ({ ...x, template: templates[0]?.key ?? "" }));
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAll = async () => {
    setBusy(true);
    const r = await portfolioGraphicAction(dept);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setAll(r.data!);
  };
  const submit = async () => {
    setBusy(true);
    const r = await generatePackAction(dept, {
      projectId: mode === "existing" ? f.projectId || null : null,
      project: mode === "new" ? { name: f.name.trim(), key: f.key.trim().toUpperCase(), description: f.description.trim() || null, parentId: type === "sub" ? f.parentId || null : null, startDate: f.startDate || null } : null,
      type,
      template: tpl?.key ?? null,
      roadmap: f.roadmap && !!tpl,
      docs: f.docs,
    });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Project pack ready", { description: `${r.data!.milestones} phases, ${r.data!.tasks} topics, ${r.data!.docs} documents` });
    setGen(false);
    router.refresh();
  };
  const ok = mode === "existing" ? !!f.projectId : !!f.name.trim() && /^[A-Za-z][A-Za-z0-9]{1,7}$/.test(f.key.trim()) && (type === "full" || !!f.parentId);
  return (
    <div className="flex flex-wrap items-center gap-2" data-roadmap-tools>
      {canCreate && (
        <Button size="sm" onClick={() => setGen(true)} data-generate-pack>
          <SparklesIcon /> Generate project pack
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={openAll} disabled={busy || !projects.length} data-portfolio-graphic>
        <MapIcon /> All projects infographic
      </Button>
      {all && <GraphicDialog title="Projects roadmap" svg={all} file={`${dept}-projects-roadmap`} onClose={() => setAll(null)} />}
      <Dialog open={gen} onOpenChange={setGen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-pack-dialog>
          <DialogHeader>
            <DialogTitle>Generate a project pack</DialogTitle>
            <DialogDescription>The roadmap (phases and topics, as tasks with dates) and the documents to the IEEE standards with diagrams, ready to fill in. Everything stays editable.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Project type">
              {PROJECT_TYPES.map((t) => (
                <button key={t.key} type="button" role="radio" aria-checked={type === t.key} onClick={() => setType(t.key)} className={cn("rounded-lg border p-3 text-left transition-colors", type === t.key ? "border-primary bg-primary/5" : "hover:bg-muted/50")} data-pack-type={t.key}>
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.hint}</p>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>New project</Button>
              <Button size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")} disabled={!projects.length}>An existing project</Button>
            </div>
            {mode === "existing" ? (
              <label className="grid gap-1">
                Project
                <select className="h-9 rounded-md border bg-background px-2" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} data-pack-project>
                  <option value="">Choose</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.key} · {p.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
                  <label className="grid gap-1">Name<Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="For example: SchoolHub" data-pack-name /></label>
                  <label className="grid gap-1">Key<Input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toUpperCase().slice(0, 8) })} placeholder="SHUB" data-pack-key /></label>
                </div>
                {type === "sub" && (
                  <label className="grid gap-1">
                    Part of
                    <select className="h-9 rounded-md border bg-background px-2" value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })} data-pack-parent>
                      <option value="">Choose the full project</option>
                      {fulls.map((p) => (
                        <option key={p.id} value={p.id}>{p.key} · {p.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="grid gap-1">What it is<Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="One or two sentences: the purpose and scope" /></label>
                <label className="grid gap-1 sm:w-48">Starts<Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label>
              </>
            )}
            <label className="grid gap-1">
              <span className="flex items-center gap-1.5"><LayoutTemplateIcon className="size-4" /> Roadmap template</span>
              <select className="h-9 rounded-md border bg-background px-2" value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })} data-pack-template>
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
                <option value="">No template (documents only)</option>
              </select>
            </label>
            {tpl && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-2 text-xs text-muted-foreground">{tpl.summary}</p>
                <ol className="grid gap-1.5 sm:grid-cols-2">
                  {tpl.phases.map((ph, i) => (
                    <li key={ph.name} className="text-xs">
                      <span className="font-semibold">{i + 1}. {ph.name}</span> <span className="text-muted-foreground">({ph.weeks} wk): {ph.topics.map((t) => t.title).join(", ")}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.roadmap && !!tpl} disabled={!tpl} onChange={(e) => setF({ ...f, roadmap: e.target.checked })} /> Create the roadmap: phases as milestones, topics as tasks with dates</label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={f.docs} onChange={(e) => setF({ ...f, docs: e.target.checked })} />
              <span>Create the documents: {PACK_DOCS[type].map((d) => d.title.toLowerCase()).join(", ")} (with class, sequence, data and other diagrams)</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !ok} data-pack-create>
              <SparklesIcon /> Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
