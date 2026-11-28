"use client";

import * as React from "react";
import { toast } from "sonner";
import { BookOpenIcon, FileTextIcon, ListOrderedIcon, PanelTopIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteFileAction, getFileAction, listFilesAction, saveFileAction } from "@/app/actions/tools";
import { bandHtml, COVER_STYLES, DEFAULT_HF, EMPTY_ZONES, HF_PRESETS, coverHtml, fillText, newCover, numberText, type Cover, type DocLayout, type HeaderFooter, type HFSource, type HFZones, type Numbering } from "@/components/app/tools/page-layout";
import type { Block } from "@/components/app/tools/doc-model";
import type { Letterhead } from "@/lib/tools";
import { cn } from "@/lib/utils";

type Fields = import("@/components/app/tools/page-layout").Fields;
const FIELDS = [
  { key: "{page}", label: "Page" },
  { key: "{pages}", label: "Pages" },
  { key: "{title}", label: "Title" },
  { key: "{author}", label: "Author" },
  { key: "{date}", label: "Date" },
  { key: "{company}", label: "Company" },
  { key: "{address}", label: "Address" },
  { key: "{phone}", label: "Phone" },
  { key: "{email}", label: "Email" },
  { key: "{website}", label: "Website" },
];

// The header or footer as it shows on the page (fields filled in; page 1 of 3 as a sample): a banner when it has
// one, else a line of three zones. Text wraps; nothing is cut off.
export function ZonesPreview({ z, hf, f, where, logo }: { z: HFZones; hf: HeaderFooter; f: Fields; where: "header" | "footer"; logo?: string }) {
  const art = hf.art?.[where];
  if (art) return <div data-hf-preview={where} dangerouslySetInnerHTML={{ __html: bandHtml(art, z, f, logo ?? "/api/branding/logo", where, "1", "3") }} />;
  const t = (x: string) => fillText(x, f, "1", "3");
  if (!z.left && !z.center && !z.right && (where === "footer" || hf.logo === "none")) return null;
  return (
    <div
      className={cn("grid grid-cols-3 items-center gap-3 whitespace-pre-line break-words", where === "header" ? (hf.ruleUnderHeader ? "border-b pb-1" : "") : hf.ruleOverFooter ? "border-t pt-1" : "")}
      style={{ fontSize: `${hf.size}pt`, color: hf.color, borderColor: hf.color }}
      data-hf-preview={where}
    >
      <span className="flex items-center gap-1.5">
        {where === "header" && hf.logo === "left" && logo && <img src={logo} alt="" className="h-6" />}
        <span>{t(z.left)}</span>
      </span>
      <span className="text-center">{t(z.center)}</span>
      <span className="flex items-center justify-end gap-1.5 text-right">
        <span>{t(z.right)}</span>
        {where === "header" && hf.logo === "right" && logo && <img src={logo} alt="" className="h-6" />}
      </span>
    </div>
  );
}

function ZoneInputs({ label, z, onChange, focus }: { label: string; z: HFZones; onChange: (z: HFZones) => void; focus: (el: HTMLInputElement, set: (v: string) => void) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {(["left", "center", "right"] as const).map((k) => (
          <Input key={k} className="h-8 text-xs" placeholder={k === "left" ? "Left" : k === "center" ? "Centre" : "Right"} value={z[k]} onFocus={(e) => focus(e.currentTarget, (v) => onChange({ ...z, [k]: v }))} onChange={(e) => onChange({ ...z, [k]: e.target.value })} aria-label={`${label}, ${k}`} />
        ))}
      </div>
    </div>
  );
}

type SavedHF = { id: string; title: string };

// Header and footer: where they come from (the company's letterhead, the opened file's own, a design of one's own,
// or none), the designer (three zones with fields, logo, lines, a different first page), ready-made ones, and the
// person's saved ones (save the current one, or the opened file's, as a template).
export function HeaderFooterDialog({ open, onOpenChange, layout, setLayout, letterhead, fields }: { open: boolean; onOpenChange: (v: boolean) => void; layout: DocLayout; setLayout: (l: DocLayout) => void; letterhead: Letterhead; fields: Fields }) {
  const [src, setSrc] = React.useState<HFSource>(layout.source);
  const [hf, setHf] = React.useState<HeaderFooter>(layout.hf);
  const [saved, setSaved] = React.useState<SavedHF[]>([]);
  const [name, setName] = React.useState("");
  const target = React.useRef<{ el: HTMLInputElement; set: (v: string) => void } | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setSrc(layout.source);
    setHf(layout.hf);
    void listFilesAction("hf").then((r) => r.ok && setSaved((r.data as SavedHF[]) ?? []));
  }, [open, layout]);
  const insert = (k: string) => {
    const t = target.current;
    if (!t) return toast.info("Click in a box first, then add the field.");
    const el = t.el;
    const at = el.selectionStart ?? el.value.length;
    const v = `${el.value.slice(0, at)}${k}${el.value.slice(el.selectionEnd ?? at)}`;
    t.set(v);
    requestAnimationFrame(() => (el.focus(), el.setSelectionRange(at + k.length, at + k.length)));
  };
  const focus = (el: HTMLInputElement, set: (v: string) => void) => (target.current = { el, set });
  const shown = src === "document" ? layout.fromFile : src === "custom" ? hf : null;
  const logo = letterhead.logo || "/api/branding/logo";
  const keep = async (title: string, value: HeaderFooter) => {
    const r = await saveFileAction("hf", { title, data: value });
    if (!r.ok) return toast.error(r.error);
    setSaved((s) => [{ id: r.data as string, title }, ...s]);
    toast.success(`"${title}" saved as a header and footer template`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Header and footer</DialogTitle>
          <DialogDescription>Choose where they come from, or design your own. Fields like Page and Title fill in on every page, in the PDF and in Word.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Header and footer from">
          {([
            ["company", "The company's", "The official letterhead"],
            ["document", "The opened file's", layout.fromFile ? "From the Word file you opened" : "Open a Word file that has one"],
            ["custom", "My own design", "Design it below"],
            ["none", "None", "No header or footer"],
          ] as const).map(([k, l, h]) => (
            <button key={k} type="button" role="radio" aria-checked={src === k} disabled={k === "document" && !layout.fromFile} onClick={() => setSrc(k)} className={cn("rounded-lg border p-2.5 text-left text-sm disabled:opacity-50", src === k && "border-primary bg-primary/5")} data-hf-source={k}>
              <span className="block font-medium">{l}</span>
              <span className="block text-xs text-muted-foreground">{h}</span>
            </button>
          ))}
        </div>
        {src === "document" && layout.fromFile && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => ((setHf(layout.fromFile!), setSrc("custom")))}>Edit a copy of it</Button>
            <Button size="sm" variant="outline" onClick={() => keep(`${fields.title || "Document"}: header and footer`, layout.fromFile!)}><SaveIcon /> Save the file&apos;s as a template</Button>
          </div>
        )}
        {src === "custom" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value="" onChange={(e) => { const p = HF_PRESETS.find((x) => x.key === e.target.value); if (p) setHf(p.hf); }} aria-label="Start from a ready-made one">
                <option value="">Start from a ready-made one…</option>
                {HF_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              {saved.length > 0 && (
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value=""
                  aria-label="Use one of my saved ones"
                  onChange={async (e) => {
                    const id = e.target.value;
                    if (!id) return;
                    const r = await getFileAction("hf", id);
                    if (r.ok) setHf({ ...DEFAULT_HF, ...((r.data as { data: HeaderFooter }).data) });
                  }}
                >
                  <option value="">My saved ones…</option>
                  {saved.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-muted-foreground">Add a field:</span>
              {FIELDS.map((f) => (
                <button key={f.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(f.key)} className="rounded-full border px-2 py-0.5 hover:bg-muted" data-hf-field={f.key}>{f.label}</button>
              ))}
            </div>
            {(hf.art?.header || hf.art?.footer) && (
              <p className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs text-muted-foreground">
                This design has a colour banner{hf.raw ? " from the Word file (kept exactly as it is in Word exports)" : ""}.
                <button type="button" className="underline" onClick={() => setHf({ ...hf, art: undefined, raw: undefined })}>Remove the banner</button>
              </p>
            )}
            <ZoneInputs label="Header" z={hf.header} onChange={(z) => setHf({ ...hf, header: z })} focus={focus} />
            <ZoneInputs label="Footer" z={hf.footer} onChange={(z) => setHf({ ...hf, footer: z })} focus={focus} />
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <label className="space-y-1">
                <span className="font-medium">Company logo</span>
                <select className="h-8 w-full rounded-md border bg-background px-1" value={hf.logo} onChange={(e) => setHf({ ...hf, logo: e.target.value as HeaderFooter["logo"] })}>
                  <option value="none">None</option>
                  <option value="left">Left of the header</option>
                  <option value="right">Right of the header</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Text size (pt)</span>
                <Input className="h-8" type="number" min={6} max={14} step={0.5} value={hf.size} onChange={(e) => setHf({ ...hf, size: Number(e.target.value) || 9 })} />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Colour</span>
                <Input className="h-8 p-1" type="color" value={hf.color} onChange={(e) => setHf({ ...hf, color: e.target.value })} />
              </label>
              <div className="space-y-1">
                <label className="flex items-center gap-2"><input type="checkbox" checked={hf.ruleUnderHeader} onChange={(e) => setHf({ ...hf, ruleUnderHeader: e.target.checked })} /> Line under the header</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={hf.ruleOverFooter} onChange={(e) => setHf({ ...hf, ruleOverFooter: e.target.checked })} /> Line over the footer</label>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={hf.differentFirst} onChange={(e) => setHf({ ...hf, differentFirst: e.target.checked, firstHeader: hf.firstHeader ?? EMPTY_ZONES, firstFooter: hf.firstFooter ?? EMPTY_ZONES })} /> A different first page (after the cover)</label>
            {hf.differentFirst && (
              <div className="space-y-2 rounded-md border p-2">
                <ZoneInputs label="First page header" z={hf.firstHeader ?? EMPTY_ZONES} onChange={(z) => setHf({ ...hf, firstHeader: z })} focus={focus} />
                <ZoneInputs label="First page footer" z={hf.firstFooter ?? EMPTY_ZONES} onChange={(z) => setHf({ ...hf, firstFooter: z })} focus={focus} />
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Input className="h-8 w-64" placeholder="Name, to save it as a template" value={name} onChange={(e) => setName(e.target.value)} />
              <Button size="sm" variant="outline" disabled={!name.trim()} onClick={() => (keep(name.trim(), hf), setName(""))}><SaveIcon /> Save as template</Button>
              {saved.length > 0 && (
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value=""
                  aria-label="Delete a saved one"
                  onChange={async (e) => {
                    const s = saved.find((x) => x.id === e.target.value);
                    if (!s || !confirm(`Delete the saved header and footer "${s.title}"?`)) return;
                    const r = await deleteFileAction("hf", s.id);
                    if (r.ok) setSaved((l) => l.filter((x) => x.id !== s.id));
                  }}
                >
                  <option value="">Delete a saved one…</option>
                  {saved.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              )}
            </div>
          </div>
        )}
        {shown && (
          <div className="space-y-6 rounded-md border bg-white p-4 text-slate-900">
            <ZonesPreview z={shown.header} hf={shown} f={fields} where="header" logo={logo} />
            <p className="text-center text-xs text-slate-400">Page text</p>
            <ZonesPreview z={shown.footer} hf={shown} f={fields} where="footer" />
          </div>
        )}
        {src === "company" && <p className="rounded-md border p-3 text-sm text-muted-foreground">The company letterhead: {letterhead.company}, its logo and contacts (Admin sets it in Letters). <FileTextIcon className="inline size-3.5" /></p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => (setLayout({ ...layout, source: src, hf: src === "custom" ? hf : layout.hf }), onOpenChange(false))} data-hf-apply>Use it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// When an opened Word file has its own header and footer: use it, or the company's (or none), and optionally keep
// it as a template.
export function FileHFPrompt({ hf, fields, onChoose }: { hf: HeaderFooter | null; fields: Fields; onChoose: (src: HFSource, keep: boolean) => void }) {
  const [keep, setKeep] = React.useState(false);
  return (
    <Dialog open={!!hf} onOpenChange={(v) => !v && onChoose("company", false)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>This file has its own header and footer</DialogTitle>
          <DialogDescription>Use the opened file&apos;s, or the company&apos;s letterhead? You can change it later under Header and footer.</DialogDescription>
        </DialogHeader>
        {hf && (
          <div className="space-y-6 rounded-md border bg-white p-4 text-slate-900">
            <ZonesPreview z={hf.header} hf={hf} f={fields} where="header" />
            <p className="text-center text-xs text-slate-400">Page text</p>
            <ZonesPreview z={hf.footer} hf={hf} f={fields} where="footer" />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Also save the file&apos;s header and footer as a template</label>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onChoose("none", keep)}>Neither</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onChoose("company", keep)} data-file-hf="company">Use the company&apos;s</Button>
            <Button onClick={() => onChoose("document", keep)} data-file-hf="document">Use the file&apos;s</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The cover page: on or off, its design and its text.
export function CoverDialog({ open, onOpenChange, layout, setLayout, fields, color, logo }: { open: boolean; onOpenChange: (v: boolean) => void; layout: DocLayout; setLayout: (l: DocLayout) => void; fields: Fields; color: string; logo: string }) {
  const [c, setC] = React.useState<Cover>(layout.cover ?? newCover(fields.title, fields.author, fields.company, color));
  React.useEffect(() => {
    if (open) setC(layout.cover ?? newCover(fields.title, fields.author, fields.company, color));
  }, [open, layout.cover, fields.title, fields.author, fields.company, color]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Cover page</DialogTitle>
          <DialogDescription>The cover has no header, footer or page number; numbering starts after it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {COVER_STYLES.map((s) => (
                <button key={s.key} type="button" onClick={() => setC({ ...c, style: s.key })} className={cn("rounded-md border p-1 text-left text-[11px]", c.style === s.key && "border-primary ring-1 ring-primary")} data-cover-style={s.key}>
                  <div className="pointer-events-none aspect-[210/297] overflow-hidden rounded-sm bg-white text-slate-900">
                    <div className="origin-top-left scale-[0.14]" style={{ width: "210mm", padding: "10mm" }} dangerouslySetInnerHTML={{ __html: coverHtml({ ...c, style: s.key }, logo) }} />
                  </div>
                  <span className="mt-1 block truncate">{s.label}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {([["title", "Title"], ["subtitle", "Subtitle"], ["author", "Prepared by"], ["org", "Organisation or department"], ["date", "Date"], ["note", "Version, reference or note"]] as const).map(([k, l]) => (
                <label key={k} className="space-y-1 text-xs">
                  <span className="font-medium">{l}</span>
                  <Input className="h-8" value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
                </label>
              ))}
              <label className="space-y-1 text-xs"><span className="font-medium">Colour</span><Input className="h-8 p-1" type="color" value={c.color} onChange={(e) => setC({ ...c, color: e.target.value })} /></label>
              <label className="flex items-center gap-2 pt-5 text-xs"><input type="checkbox" checked={c.logo} onChange={(e) => setC({ ...c, logo: e.target.checked })} /> Company logo</label>
            </div>
          </div>
          <div className="aspect-[210/297] overflow-hidden rounded-md border bg-white text-slate-900 shadow-sm">
            <div className="origin-top-left scale-[0.29]" style={{ width: "210mm", padding: "12mm" }} dangerouslySetInnerHTML={{ __html: coverHtml(c, logo) }} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {layout.cover ? <Button variant="ghost" onClick={() => (setLayout({ ...layout, cover: null, numbering: { ...layout.numbering, cover: false } }), onOpenChange(false))}><Trash2Icon /> Remove the cover</Button> : <span />}
          <Button onClick={() => (setLayout({ ...layout, cover: c, numbering: { ...layout.numbering, cover: true } }), onOpenChange(false))} data-cover-apply>{layout.cover ? "Update the cover" : "Add the cover"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Page numbering in three parts, shown as they will print: Cover (no number), Front matter (i, ii, iii), Main
// pages (1, 2, 3). People pick where the main pages start from the document's headings.
export function NumberingDialog({ open, onOpenChange, layout, setLayout, blocks, pageNumbers, setPageNumbers, onAddCover, onInsertToc }: { open: boolean; onOpenChange: (v: boolean) => void; layout: DocLayout; setLayout: (l: DocLayout) => void; blocks: Block[]; pageNumbers: boolean; setPageNumbers: (v: boolean) => void; onAddCover: () => void; onInsertToc: () => void }) {
  const n = layout.numbering;
  const set = (p: Partial<Numbering>) => setLayout({ ...layout, numbering: { ...n, ...p } });
  const marks = blocks.filter((b) => b.type === "heading" || b.type === "section" || b.type === "toc" || b.type === "pagebreak");
  const label = (b: Block) => (b.type === "heading" ? `${"  ".repeat(b.level - 1)}${b.text.replace(/\*\*|__|~~|==/g, "") || "Heading"}` : b.type === "section" ? `Section break${b.title ? `: ${b.title}` : ""}` : b.type === "toc" ? "Contents" : "Page break");
  // A page break or section break starts the main pages at the block after it.
  const startId = n.mainStartsAt;
  const hasToc = blocks.some((b) => b.type === "toc");
  const frontLabel = n.front === "roman" ? "i, ii, iii" : n.front === "arabic" ? "1, 2, 3" : "no numbers";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Page numbering</DialogTitle>
          <DialogDescription>Like a book: the cover has no number, the front matter (contents, preface) counts i, ii, iii, and the main pages start again at 1.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pageNumbers} onChange={(e) => setPageNumbers(e.target.checked)} /> Show page numbers</label>
        <div className="grid grid-cols-3 gap-2 text-center text-sm" data-numbering-strip>
          <div className={cn("rounded-lg border p-3", !layout.cover && "border-dashed opacity-60")}>
            <BookOpenIcon className="mx-auto size-5 text-muted-foreground" />
            <p className="font-medium">Cover page</p>
            <p className="text-xs text-muted-foreground">{layout.cover ? "No number" : "None"}</p>
            {!layout.cover && <Button size="sm" variant="link" className="h-6 px-0 text-xs" onClick={onAddCover}>Add a cover</Button>}
          </div>
          <div className={cn("rounded-lg border p-3", !startId && "border-dashed opacity-60")}>
            <PanelTopIcon className="mx-auto size-5 text-muted-foreground" />
            <p className="font-medium">Front matter</p>
            <p className="text-xs text-muted-foreground">{startId ? frontLabel : "None"}</p>
          </div>
          <div className="rounded-lg border border-primary/50 bg-primary/5 p-3">
            <ListOrderedIcon className="mx-auto size-5 text-primary" />
            <p className="font-medium">Main pages</p>
            <p className="text-xs text-muted-foreground">{pageNumbers ? "1, 2, 3" : "no numbers"}</p>
          </div>
        </div>
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="font-medium">The main pages (1, 2, 3) start at</span>
            <select className="h-8 w-full rounded-md border bg-background px-1" value={startId ?? ""} onChange={(e) => set({ mainStartsAt: e.target.value || null })} data-main-start>
              <option value="">The beginning (no front matter)</option>
              {marks.slice(1).map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}
            </select>
            {!marks.length && <span className="text-muted-foreground">Add headings to the document to choose where the main pages start.</span>}
          </label>
          <label className="space-y-1">
            <span className="font-medium">Front matter numbers</span>
            <select className="h-8 w-full rounded-md border bg-background px-1" value={n.front} onChange={(e) => set({ front: e.target.value as Numbering["front"] })} disabled={!startId}>
              <option value="roman">i, ii, iii (Roman)</option>
              <option value="arabic">1, 2, 3</option>
              <option value="none">No numbers</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-medium">Where and how</span>
            <div className="flex gap-1">
              <select className="h-8 flex-1 rounded-md border bg-background px-1" value={n.position} onChange={(e) => set({ position: e.target.value as Numbering["position"] })}>
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
              <select className="h-8 flex-1 rounded-md border bg-background px-1" value={n.format} onChange={(e) => set({ format: e.target.value as Numbering["format"] })}>
                <option value="n">1</option>
                <option value="page-n">Page 1</option>
                <option value="n-of-m">Page 1 of 9</option>
                <option value="dash">- 1 -</option>
              </select>
            </div>
            <span className="text-muted-foreground">Used when the footer has no Page field of its own ({numberText(n).replace("{page}", "1").replace("{pages}", "9")}).</span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
          <span>Contents page:</span>
          {hasToc ? <span className="text-muted-foreground">in the document; it lists the headings with their page numbers and links to them.</span> : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onInsertToc}>Insert a contents page</Button>}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
