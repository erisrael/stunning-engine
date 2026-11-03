"use client";

// Admin, Presentation templates (Phase 24): the colours, fonts, logo and cover every deck is shown and exported
// with. Built-in ones (Myseed, International...) are copied to change them; own ones are made here or imported from
// a PowerPoint, Google Slides, Keynote or Canva file (.pptx, .potx, .thmx). One is the default for all decks.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon, FileUpIcon, Loader2Icon, PresentationIcon, StarIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { defaultTemplateAction, deleteTemplateAction, importTemplateAction, saveTemplateAction } from "@/app/actions/decks";
import { onColor, type DeckTemplate } from "@/lib/deck-templates";
import { cn } from "@/lib/utils";

function Preview({ t }: { t: DeckTemplate }) {
  const fg = onColor(t.colors.primary);
  return (
    <div className="grid grid-cols-2 gap-1.5" aria-hidden>
      <div className="relative aspect-video overflow-hidden rounded-md" style={{ background: t.cover.style === "image" && t.cover.image ? `url(${t.cover.image}) center/cover` : t.cover.style === "split" ? t.colors.background : t.colors.primary }}>
        {t.cover.style === "split" && <div className="absolute inset-y-0 left-0 w-[42%]" style={{ background: t.colors.primary }} />}
        {t.cover.style === "gradient" && (
          <>
            <div className="absolute -top-6 -right-6 size-20 rounded-full opacity-60" style={{ background: t.colors.secondary }} />
            <div className="absolute -right-2 -bottom-4 size-12 rounded-full opacity-70" style={{ background: t.colors.accent }} />
          </>
        )}
        <p className="absolute top-1/3 left-2 text-[10px] font-bold" style={{ color: t.cover.style === "image" ? t.colors.text : fg, fontFamily: t.fonts.heading }}>
          Monthly report
        </p>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-md border" style={{ background: t.background ? `url(${t.background}) center/cover` : t.colors.background }}>
        <div className="h-1" style={{ background: t.colors.primary }} />
        <p className="px-2 pt-1 text-[9px] font-semibold" style={{ color: t.colors.primary, fontFamily: t.fonts.heading }}>
          Videos published
        </p>
        <div className="flex h-8 items-end gap-0.5 px-2">
          {t.colors.chart.slice(0, 6).map((c, i) => (
            <span key={c + i} className="flex-1 rounded-t-sm" style={{ background: c, height: `${30 + ((i * 37) % 70)}%` }} />
          ))}
        </div>
        <div className="mx-2 mt-1 h-2 rounded-sm" style={{ background: t.colors.surface }} />
      </div>
    </div>
  );
}

function Editor({ t, onDone }: { t: DeckTemplate; onDone: () => void }) {
  const router = useRouter();
  const copy = t.source === "built-in";
  const [v, setV] = React.useState<DeckTemplate>(copy ? { ...t, name: `${t.name} (copy)` } : t);
  const [busy, setBusy] = React.useState(false);
  const color = (k: keyof Omit<DeckTemplate["colors"], "chart">, label: string) => (
    <label className="flex items-center gap-1.5 text-xs">
      <input type="color" aria-label={label} value={v.colors[k]} onChange={(e) => setV({ ...v, colors: { ...v.colors, [k]: e.target.value } })} className="h-7 w-9 cursor-pointer rounded border" />
      {label}
    </label>
  );
  const image = (label: string, set: (x: string | null) => void) => (
    <label className="text-xs">
      {label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="block text-xs"
        aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 2_000_000) return void toast.error("Pictures up to 2 MB.");
          const r = new FileReader();
          r.onload = () => set(String(r.result));
          r.readAsDataURL(f);
        }}
      />
    </label>
  );
  return (
    <div className="space-y-3 rounded-lg border p-3" data-template-editor>
      <Preview t={v} />
      <Input aria-label="Template name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <div className="flex flex-wrap gap-3">
        {color("primary", "Main")}
        {color("secondary", "Second")}
        {color("accent", "Accent")}
        {color("background", "Background")}
        {color("surface", "Boxes")}
        {color("text", "Text")}
        {color("muted", "Quiet text")}
      </div>
      <div className="flex flex-wrap items-center gap-1 text-xs">
        Chart colours
        {v.colors.chart.map((c, i) => (
          <input key={i} type="color" aria-label={`Chart colour ${i + 1}`} value={c} onChange={(e) => setV({ ...v, colors: { ...v.colors, chart: v.colors.chart.map((x, j) => (j === i ? e.target.value : x)) } })} className="h-6 w-7 cursor-pointer rounded border" />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="Heading font" placeholder="Heading font" value={v.fonts.heading} onChange={(e) => setV({ ...v, fonts: { ...v.fonts, heading: e.target.value } })} />
        <Input aria-label="Body font" placeholder="Body font" value={v.fonts.body} onChange={(e) => setV({ ...v, fonts: { ...v.fonts, body: e.target.value } })} />
        <select aria-label="Cover" className="h-9 rounded-md border bg-background px-2 text-sm" value={v.cover.style} onChange={(e) => setV({ ...v, cover: { ...v.cover, style: e.target.value as DeckTemplate["cover"]["style"] } })}>
          <option value="gradient">Cover: colourful circles</option>
          <option value="solid">Cover: one colour</option>
          <option value="split">Cover: split</option>
          <option value="image">Cover: a picture</option>
        </select>
        <Input aria-label="Footer" placeholder="Footer text (the workspace name when empty)" value={v.footer} onChange={(e) => setV({ ...v, footer: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-4">
        {image("Logo", (logo) => setV({ ...v, logo }))}
        {image("Cover picture", (image) => setV({ ...v, cover: { ...v.cover, image, style: "image" } }))}
        {image("Slide background", (background) => setV({ ...v, background }))}
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={v.slideNumbers} onChange={(e) => setV({ ...v, slideNumbers: e.target.checked })} /> Slide numbers
        </label>
        {(v.background || v.logo) && (
          <Button size="xs" variant="ghost" onClick={() => setV({ ...v, background: null, logo: null })}>
            Remove logo and background
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await saveTemplateAction({ ...v, id: copy ? null : v.id, basedOn: t.id, importedFrom: v.importedFrom ?? undefined });
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            toast.success(copy ? "Saved as a new template" : "Template saved");
            onDone();
            router.refresh();
          }}
        >
          {busy && <Loader2Icon className="animate-spin" />} {copy ? "Save as a new template" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function TemplatesAdmin({ templates, defaultId }: { templates: DeckTemplate[]; defaultId: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const file = React.useRef<HTMLInputElement>(null);
  const upload = async (f: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.set("file", f);
    const r = await importTemplateAction(fd);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Imported "${r.data!.name}": ${Object.keys(r.data!.colors).length} colours${r.data!.fonts.heading ? `, ${r.data!.fonts.heading}` : ""}${r.data!.background ? ", background" : ""}${r.data!.logo ? ", logo" : ""}`);
    router.refresh();
  };
  return (
    <Card data-templates-admin>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <PresentationIcon className="size-4" /> Presentation templates
        </CardTitle>
        <CardDescription>
          The colours, fonts, logo and cover used for every presentation, on screen and in PowerPoint. Copy a built-in one to change it, or import a template from PowerPoint, Google Slides (File, Download, .pptx), Keynote (Export to PowerPoint) or Canva (Download, PPTX). The default is used by every deck that
          does not choose its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={file} type="file" accept=".pptx,.potx,.thmx" className="hidden" aria-label="Template file" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} data-template-file />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} Import from PowerPoint, Google Slides, Keynote or Canva
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className={cn("space-y-2 rounded-lg border p-2", t.id === defaultId && "border-primary ring-1 ring-primary")} data-template={t.id}>
              {editing === t.id ? (
                <Editor t={t} onDone={() => setEditing(null)} />
              ) : (
                <>
                  <Preview t={t} />
                  <div className="flex items-center gap-1">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {t.name}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{t.source === "built-in" ? "built in" : t.source === "imported" ? `from ${t.importedFrom ?? "a file"}` : "own"}</span>
                    </p>
                    {t.id === defaultId ? (
                      <span className="flex items-center gap-0.5 text-xs text-primary">
                        <StarIcon className="size-3 fill-current" /> Default
                      </span>
                    ) : (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={async () => {
                          const r = await defaultTemplateAction(t.id);
                          if (!r.ok) return void toast.error(r.error);
                          toast.success(`${t.name} is the default`);
                          router.refresh();
                        }}
                      >
                        Make default
                      </Button>
                    )}
                    <Button size="xs" variant="ghost" onClick={() => setEditing(t.id)} aria-label={t.source === "built-in" ? `Copy ${t.name}` : `Edit ${t.name}`}>
                      {t.source === "built-in" ? <CopyIcon /> : "Edit"}
                    </Button>
                    {t.source !== "built-in" && (
                      <Button
                        size="xs"
                        variant="ghost"
                        aria-label={`Delete ${t.name}`}
                        onClick={async () => {
                          if (!window.confirm(`Delete the template "${t.name}"?`)) return;
                          const r = await deleteTemplateAction(t.id);
                          if (!r.ok) return void toast.error(r.error);
                          router.refresh();
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
