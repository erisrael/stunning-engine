"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon, ImageIcon, LockIcon, MinusIcon, QrCodeIcon, Redo2Icon, SaveIcon, SquareIcon, Trash2Icon, TypeIcon, Undo2Icon, UnlockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decideTemplateAction, saveTemplateDraftAction, setTemplateActiveAction, submitTemplateAction, withdrawTemplateAction } from "@/app/actions/correspondence";
import { letterCss, letterHtml, type LetterModel } from "@/components/app/corr/letter-render";
import { eid, fillFields, fromUnit, pageSize, PAPER_SIZES, STANDARD_FIELDS, toUnit, type TemplateElement, type TemplateLayout } from "@/lib/corr-template";
import type { Letterhead } from "@/lib/tools";
import { cn } from "@/lib/utils";

type T = { id: string; name: string; description: string | null; active: boolean; currentVersion: number | null; layout: TemplateLayout; versions: { version: number; status: string; note: string | null; createdBy: string | null; createdAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null }[]; canDesign: boolean; canApprove: boolean };
const SAMPLE: Record<string, string> = { document_number: "MS/GEN/2026/000123", document_id: "0190f3a2-7c1e-7b11-9a4e-0c55d1f0aa01", issue_date: "26 November 2026", recipient_name: "Ato Bekele Tesfaye", recipient_company: "Addis Ababa Education Bureau", subject: "Sample subject", page: "1", pages: "2", signatory_name: "Signatory", signatory_position: "Chief Executive Officer" };

export function DesignerClient({ t, letterhead, entity }: { t: T; letterhead: Letterhead; entity: LetterModel["entity"] }) {
  const router = useRouter();
  const [layout, setLayoutRaw] = React.useState<TemplateLayout>(t.layout);
  const [past, setPast] = React.useState<TemplateLayout[]>([]);
  const [future, setFuture] = React.useState<TemplateLayout[]>([]);
  const [sel, setSel] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"first" | "rest" | "even">("first");
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const latest = t.versions[0]!;
  const editable = t.canDesign && latest.status !== "pending";
  // Every change is a step that undo can take back.
  const setLayout = (next: TemplateLayout, record = true) => {
    if (!editable) return;
    if (record) {
      setPast((p) => [...p.slice(-60), layout]);
      setFuture([]);
    }
    setLayoutRaw(next);
    setDirty(true);
  };
  const undo = () => past.length && (setFuture((f) => [layout, ...f]), setLayoutRaw(past.at(-1)!), setPast((p) => p.slice(0, -1)), setDirty(true));
  const redo = () => future.length && (setPast((p) => [...p, layout]), setLayoutRaw(future[0]!), setFuture((f) => f.slice(1)), setDirty(true));
  const save = React.useCallback(async () => {
    setSaving(true);
    const r = await saveTemplateDraftAction(t.id, { layout });
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    setDirty(false);
  }, [layout, t.id]);
  React.useEffect(() => {
    if (!dirty) return;
    const x = setTimeout(() => void save(), 2000);
    return () => clearTimeout(x);
  }, [dirty, save]);
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") (e.preventDefault(), e.shiftKey ? redo() : undo());
      if ((e.ctrlKey || e.metaKey) && e.key === "y") (e.preventDefault(), redo());
      const el = layout.elements.find((x) => x.id === sel);
      if (!el || el.locked || (e.target as HTMLElement).closest("input,textarea,select")) return;
      const step = e.shiftKey ? 5 : 0.5;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (mv[e.key]) (e.preventDefault(), patch(el.id, { x: el.x + mv[e.key]![0], y: el.y + mv[e.key]![1] }));
      if (e.key === "Delete") setLayout({ ...layout, elements: layout.elements.filter((x) => x.id !== sel) });
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const { w, h } = pageSize(layout);
  const scale = Math.min(3, 640 / w);
  const zones: TemplateElement["zone"][] = view === "first" ? ["page", "header-first", "footer-first"] : view === "even" ? ["page", "header-even", "footer-even"] : ["page", "header-rest", "footer-rest"];
  const shown = layout.elements.filter((e) => zones.includes(e.zone));
  const selected = layout.elements.find((e) => e.id === sel) ?? null;
  const patch = (id: string, p: Partial<TemplateElement>, record = true) => setLayout({ ...layout, elements: layout.elements.map((e) => (e.id === id ? { ...e, ...p } : e)) }, record);
  const add = (kind: TemplateElement["kind"], src?: string) => {
    const zone: TemplateElement["zone"] = view === "first" ? "header-first" : view === "even" ? "header-even" : "header-rest";
    const el: TemplateElement = { id: eid(), kind, zone, x: layout.page.margins.left, y: 8, w: kind === "line" ? w - layout.page.margins.left - layout.page.margins.right : kind === "qr" ? 16 : 50, h: kind === "line" ? 0 : kind === "qr" ? 16 : 10, text: kind === "text" ? "{{company_name}}" : undefined, src, size: 10, color: "#111827", stroke: kind === "line" || kind === "rect" ? layout.colors.primary : undefined, strokeWidth: 0.5, fill: kind === "rect" ? "#ffffff" : undefined };
    setLayout({ ...layout, elements: [...layout.elements, el] });
    setSel(el.id);
  };
  // Dragging and resizing, in millimetres, snapped to half a millimetre.
  const drag = React.useRef<{ id: string; mode: "move" | "size"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; before: TemplateLayout } | null>(null);
  const onDown = (e: React.PointerEvent, el: TemplateElement, mode: "move" | "size") => {
    e.stopPropagation();
    setSel(el.id);
    if (el.locked || !editable) return;
    drag.current = { id: el.id, mode, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h, before: layout };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.round(((e.clientX - d.sx) / scale) * 2) / 2;
    const dy = Math.round(((e.clientY - d.sy) / scale) * 2) / 2;
    setLayoutRaw((l) => ({ ...l, elements: l.elements.map((x) => (x.id === d.id ? (d.mode === "move" ? { ...x, x: d.ox + dx, y: d.oy + dy } : { ...x, w: Math.max(1, d.ow + dx), h: x.kind === "line" ? 0 : Math.max(1, d.oh + dy) }) : x)) }));
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setPast((p) => [...p.slice(-60), d.before]);
    setFuture([]);
    setDirty(true);
  };
  const values = { ...SAMPLE, company_name: entity.legalName, company_address: entity.address ?? letterhead.address, company_phone: entity.phone ?? letterhead.phone, company_email: entity.email ?? letterhead.email, company_website: entity.website ?? letterhead.website, company_registration: entity.registrationNo ?? "", company_tin: entity.taxId ?? "" } as Record<string, string>;
  const logo = letterhead.logo || "/api/branding/logo";
  const u = layout.page.unit;
  const num = (mm: number) => Math.round(toUnit(mm, u) * 100) / 100;
  const preview: LetterModel = {
    documentId: SAMPLE.document_id!, ref: SAMPLE.document_number!, status: "issued", classification: "internal", subject: "Sample letter subject", category: "General correspondence", entity, letterhead, layout,
    recipients: [{ kind: "to", name: "Ato Bekele Tesfaye", title: "Head of Curriculum", organisation: "Addis Ababa Education Bureau", address: "P.O. Box 1234\nAddis Ababa" }],
    data: { date: new Date().toISOString().slice(0, 10), salutation: "Dear Ato Bekele,", closing: "Sincerely,", blocks: [{ id: "a", type: "paragraph", text: "This is how a letter looks on this template. **Bold**, *italic* and {{recipient_company}} are filled in.\n\nEach letter keeps the template version it was issued with." }], signName: "Signatory", signTitle: "Chief Executive Officer" },
    signatures: [{ label: "Prepared by", name: "Writer", position: "Department Manager", status: "signed" }, { label: "Authorised by", name: "Chief Executive", position: "Chief Executive Officer", status: "awaiting" }],
  };

  return (
    <Tabs defaultValue="design">
      <div className="flex flex-wrap items-center gap-2">
        <TabsList>
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="page">Page</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="versions">Versions ({t.versions.length})</TabsTrigger>
        </TabsList>
        <span className="text-xs text-muted-foreground">
          v{latest.version}: {latest.status}
          {saving ? " · saving…" : dirty ? " · unsaved" : ""}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="icon" variant="outline" disabled={!past.length} onClick={undo} aria-label="Undo"><Undo2Icon /></Button>
          <Button size="icon" variant="outline" disabled={!future.length} onClick={redo} aria-label="Redo"><Redo2Icon /></Button>
          {editable && <Button size="sm" variant="outline" onClick={save}><SaveIcon /> Save</Button>}
          {t.canDesign && latest.status === "draft" && (
            <Button size="sm" onClick={async () => { if (dirty) await save(); const note = prompt("What changed? (for the approver)") ?? ""; const r = await submitTemplateAction(t.id, note); if (!r.ok) return toast.error(r.error); toast.success("Submitted for approval"); router.refresh(); }}>
              Submit for approval
            </Button>
          )}
          {t.canDesign && latest.status === "pending" && <Button size="sm" variant="outline" onClick={async () => { const r = await withdrawTemplateAction(t.id); if (!r.ok) return toast.error(r.error); router.refresh(); }}>Withdraw</Button>}
          {t.canApprove && latest.status === "pending" && (
            <>
              <Button size="sm" onClick={async () => { const r = await decideTemplateAction(t.id, true, ""); if (!r.ok) return toast.error(r.error); toast.success("Published"); router.refresh(); }}>Approve and publish</Button>
              <Button size="sm" variant="outline" onClick={async () => { const n = prompt("What should change?") ?? ""; if (!n.trim()) return; const r = await decideTemplateAction(t.id, false, n); if (!r.ok) return toast.error(r.error); router.refresh(); }}>Ask for changes</Button>
            </>
          )}
          {t.canApprove && <Button size="sm" variant="ghost" onClick={async () => { const r = await setTemplateActiveAction(t.id, !t.active); if (!r.ok) return toast.error(r.error); router.refresh(); }}>{t.active ? "Retire" : "Restore"}</Button>}
        </div>
      </div>

      <TabsContent value="design" className="mt-3">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1">
              {(["first", "rest", "even"] as const).map((v) => (
                <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} onClick={() => setView(v)} disabled={(v === "rest" && !layout.differentFirst) || (v === "even" && !layout.oddEven)}>
                  {v === "first" ? "First page" : v === "even" ? "Even pages" : layout.oddEven ? "Odd pages" : "Later pages"}
                </Button>
              ))}
              <span className="mx-2 h-5 w-px bg-border" />
              {editable && (
                <>
                  <Button size="sm" variant="outline" onClick={() => add("text")}><TypeIcon /> Text</Button>
                  <Button size="sm" variant="outline" onClick={() => add("image", "logo")}><ImageIcon /> Logo</Button>
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted">
                    <ImageIcon className="size-3.5" /> Picture
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 800_000) return toast.error("Pictures up to 800 KB."); const r = new FileReader(); r.onload = () => add("image", String(r.result)); r.readAsDataURL(f); }} />
                  </label>
                  <Button size="sm" variant="outline" onClick={() => add("line")}><MinusIcon /> Line</Button>
                  <Button size="sm" variant="outline" onClick={() => add("rect")}><SquareIcon /> Box</Button>
                  <Button size="sm" variant="outline" onClick={() => add("qr")}><QrCodeIcon /> QR code</Button>
                </>
              )}
            </div>
            <div className="overflow-auto rounded-md border bg-muted/40 p-4">
              <div
                className="relative mx-auto bg-white shadow"
                style={{ width: w * scale, height: h * scale, backgroundImage: "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)", backgroundSize: `${10 * scale}px ${10 * scale}px` }}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerDown={() => setSel(null)}
              >
                {/* The bands the letter text never enters, and the margins. */}
                <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-sky-400 bg-sky-400/5" style={{ height: (view === "first" && layout.differentFirst ? layout.header.first : layout.header.rest) * scale }} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-sky-400 bg-sky-400/5" style={{ height: (view === "first" && layout.differentFirst ? layout.footer.first : layout.footer.rest) * scale }} />
                <div className="pointer-events-none absolute border border-dashed border-rose-300" style={{ left: layout.page.margins.left * scale, right: layout.page.margins.right * scale, top: layout.page.margins.top * scale, bottom: layout.page.margins.bottom * scale }} />
                {layout.watermark && <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-extrabold" style={{ fontSize: layout.watermark.size * scale * 0.35, color: `rgba(15,23,42,${layout.watermark.opacity})`, transform: `rotate(${layout.watermark.angle}deg)` }}>{layout.watermark.text}</div>}
                {shown.map((el) => (
                  <div
                    key={el.id}
                    onPointerDown={(e) => onDown(e, el, "move")}
                    className={cn("absolute select-none", sel === el.id ? "outline outline-2 outline-primary" : "hover:outline hover:outline-1 hover:outline-sky-400", el.locked ? "cursor-default" : "cursor-move")}
                    style={{ left: el.x * scale, top: el.y * scale, width: el.w * scale, height: el.kind === "line" ? Math.max(4, (el.strokeWidth ?? 0.5) * scale) : el.h * scale, opacity: el.opacity ?? 1 }}
                  >
                    {el.kind === "text" && <div style={{ fontSize: (el.size ?? 10) * scale * 0.3528, fontWeight: el.weight, fontStyle: el.italic ? "italic" : undefined, color: el.color, textAlign: el.align, lineHeight: 1.3, whiteSpace: "pre-wrap", overflow: "hidden", height: "100%" }}>{fillFields(el.text ?? "", values)}</div>}
                    {el.kind === "image" && <img src={el.src === "logo" ? logo : el.src} alt="" className="size-full object-contain" draggable={false} />}
                    {el.kind === "line" && <div style={{ borderTop: `${(el.strokeWidth ?? 0.5) * scale}px solid ${el.stroke}`, marginTop: 1 }} />}
                    {el.kind === "rect" && <div className="size-full" style={{ background: el.fill, border: el.stroke ? `${(el.strokeWidth ?? 0.3) * scale}px solid ${el.stroke}` : undefined, borderRadius: (el.radius ?? 0) * scale }} />}
                    {el.kind === "qr" && <div className="flex size-full items-center justify-center border border-dashed text-[10px] text-muted-foreground"><QrCodeIcon className="size-1/2" /></div>}
                    {el.locked && <LockIcon className="absolute -top-2 -right-2 size-3 text-muted-foreground" />}
                    {sel === el.id && !el.locked && editable && <div onPointerDown={(e) => onDown(e, el, "size")} className="absolute -right-1 -bottom-1 size-3 cursor-se-resize rounded-sm bg-primary" aria-label="Resize" />}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Drag to move, the corner to resize, arrow keys to nudge (Shift for 5 mm), Delete to remove, Ctrl+Z / Ctrl+Y to undo and redo. Blue bands: header and footer (the letter text stays out); red: the margins.</p>
          </div>

          <Card className="h-fit">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{selected ? `Selected: ${selected.kind}` : "Elements"}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              {!selected && (
                <ul className="max-h-80 space-y-1 overflow-auto">
                  {shown.map((e) => (
                    <li key={e.id}>
                      <button type="button" className="w-full truncate rounded px-1 py-0.5 text-left hover:bg-muted" onClick={() => setSel(e.id)}>
                        {e.kind} · {e.zone}{e.text ? ` · ${e.text.slice(0, 30)}` : ""}{e.locked ? " (locked)" : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <fieldset disabled={!editable} className="space-y-2">
                  <select className="h-8 w-full rounded-md border bg-background px-2" value={selected.zone} onChange={(e) => patch(selected.id, { zone: e.target.value as TemplateElement["zone"] })} aria-label="Where">
                    <option value="header-first">First page header</option>
                    <option value="footer-first">First page footer</option>
                    <option value="header-rest">Later (odd) pages header</option>
                    <option value="header-even">Even pages header</option>
                    <option value="footer-rest">Later (odd) pages footer</option>
                    <option value="footer-even">Even pages footer</option>
                    <option value="page">Every page (behind the text)</option>
                  </select>
                  <div className="grid grid-cols-4 gap-1">
                    {(["x", "y", "w", "h"] as const).map((k) => (
                      <label key={k} className="space-y-0.5"><span className="uppercase text-muted-foreground">{k} ({u})</span><Input className="h-7 text-xs" type="number" step="0.5" value={num(selected[k])} onChange={(e) => patch(selected.id, { [k]: fromUnit(Number(e.target.value), u) })} /></label>
                    ))}
                  </div>
                  {selected.kind === "text" && (
                    <>
                      <Textarea rows={4} value={selected.text ?? ""} onChange={(e) => patch(selected.id, { text: e.target.value }, false)} onBlur={() => setPast((p) => [...p, layout])} aria-label="Text" />
                      <select className="h-8 w-full rounded-md border bg-background px-2" value="" onChange={(e) => e.target.value && patch(selected.id, { text: `${selected.text ?? ""}{{${e.target.value}}}` })} aria-label="Insert field">
                        <option value="">Insert a field…</option>
                        {[...STANDARD_FIELDS, ...layout.fields].map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                      <div className="grid grid-cols-3 gap-1">
                        <Input className="h-7 text-xs" type="number" value={selected.size ?? 10} onChange={(e) => patch(selected.id, { size: Number(e.target.value) })} aria-label="Size (pt)" />
                        <select className="h-7 rounded-md border bg-background px-1" value={selected.weight ?? 400} onChange={(e) => patch(selected.id, { weight: Number(e.target.value) as 400 })} aria-label="Weight"><option value={400}>Normal</option><option value={600}>Semibold</option><option value={700}>Bold</option></select>
                        <select className="h-7 rounded-md border bg-background px-1" value={selected.align ?? "left"} onChange={(e) => patch(selected.id, { align: e.target.value as "left" })} aria-label="Align"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select>
                      </div>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!selected.italic} onChange={(e) => patch(selected.id, { italic: e.target.checked })} /> Italic</label>
                    </>
                  )}
                  <div className="grid grid-cols-3 gap-1">
                    {selected.kind === "text" && <label className="space-y-0.5"><span className="text-muted-foreground">Colour</span><Input className="h-7" type="color" value={selected.color ?? "#111827"} onChange={(e) => patch(selected.id, { color: e.target.value })} /></label>}
                    {(selected.kind === "line" || selected.kind === "rect") && <label className="space-y-0.5"><span className="text-muted-foreground">Line</span><Input className="h-7" type="color" value={selected.stroke ?? "#111827"} onChange={(e) => patch(selected.id, { stroke: e.target.value })} /></label>}
                    {selected.kind === "rect" && <label className="space-y-0.5"><span className="text-muted-foreground">Fill</span><Input className="h-7" type="color" value={selected.fill ?? "#ffffff"} onChange={(e) => patch(selected.id, { fill: e.target.value })} /></label>}
                    {(selected.kind === "line" || selected.kind === "rect") && <label className="space-y-0.5"><span className="text-muted-foreground">Width (mm)</span><Input className="h-7 text-xs" type="number" step="0.1" value={selected.strokeWidth ?? 0.5} onChange={(e) => patch(selected.id, { strokeWidth: Number(e.target.value) })} /></label>}
                    <label className="space-y-0.5"><span className="text-muted-foreground">Opacity</span><Input className="h-7 text-xs" type="number" step="0.05" min={0} max={1} value={selected.opacity ?? 1} onChange={(e) => patch(selected.id, { opacity: Number(e.target.value) })} /></label>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => patch(selected.id, { locked: !selected.locked })}>{selected.locked ? <UnlockIcon /> : <LockIcon />} {selected.locked ? "Unlock" : "Lock"}</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { const c = { ...selected, id: eid(), x: selected.x + 3, y: selected.y + 3 }; setLayout({ ...layout, elements: [...layout.elements, c] }); setSel(c.id); }}><CopyIcon /> Duplicate</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => (setLayout({ ...layout, elements: layout.elements.filter((x) => x.id !== selected.id) }), setSel(null))}><Trash2Icon /> Remove</Button>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={() => setSel(null)}>Done</Button>
                </fieldset>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="page" className="mt-3">
        <PageSettings layout={layout} setLayout={setLayout} disabled={!editable} />
      </TabsContent>

      <TabsContent value="preview" className="mt-3">
        <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-md border bg-white text-slate-900 shadow-sm">
          <style>{letterCss(preview)}</style>
          <div dangerouslySetInnerHTML={{ __html: letterHtml(preview) }} />
        </div>
      </TabsContent>

      <TabsContent value="versions" className="mt-3">
        <Card>
          <CardContent className="space-y-1 p-3 text-xs">
            {t.versions.map((v) => (
              <p key={v.version} className="border-b py-1 last:border-0">
                <b>v{v.version}</b> · {v.status} · by {v.createdBy ?? "?"} {new Date(v.createdAt).toLocaleString()}
                {v.note ? ` · “${v.note}”` : ""}
                {v.decidedBy ? ` · ${v.status === "rejected" ? "changes asked" : "approved"} by ${v.decidedBy} ${v.decidedAt ? new Date(v.decidedAt).toLocaleDateString() : ""}` : ""}
                {v.decisionNote ? ` · “${v.decisionNote}”` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function PageSettings({ layout, setLayout, disabled }: { layout: TemplateLayout; setLayout: (l: TemplateLayout) => void; disabled: boolean }) {
  const u = layout.page.unit;
  const n = (mm: number) => Math.round(toUnit(mm, u) * 100) / 100;
  const pg = layout.page;
  const set = (p: Partial<TemplateLayout>) => setLayout({ ...layout, ...p });
  return (
    <fieldset disabled={disabled} className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Paper</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-xs sm:grid-cols-2">
          <label className="space-y-1"><span className="font-medium">Size</span>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={pg.size} onChange={(e) => set({ page: { ...pg, size: e.target.value, w: PAPER_SIZES[e.target.value]?.w ?? pg.w, h: PAPER_SIZES[e.target.value]?.h ?? pg.h } })}>
              {Object.entries(PAPER_SIZES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="space-y-1"><span className="font-medium">Orientation</span>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={pg.orientation} onChange={(e) => set({ page: { ...pg, orientation: e.target.value as "portrait" } })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
          </label>
          {pg.size === "custom" && (
            <>
              <label className="space-y-1"><span className="font-medium">Width ({u})</span><Input type="number" value={n(pg.w)} onChange={(e) => set({ page: { ...pg, w: fromUnit(Number(e.target.value), u) } })} /></label>
              <label className="space-y-1"><span className="font-medium">Height ({u})</span><Input type="number" value={n(pg.h)} onChange={(e) => set({ page: { ...pg, h: fromUnit(Number(e.target.value), u) } })} /></label>
            </>
          )}
          <label className="space-y-1"><span className="font-medium">Units</span>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={u} onChange={(e) => set({ page: { ...pg, unit: e.target.value as "mm" } })}><option value="mm">Millimetres</option><option value="cm">Centimetres</option><option value="in">Inches</option></select>
          </label>
          <label className="flex items-center gap-2 self-end"><input type="checkbox" checked={!!pg.duplex} onChange={(e) => set({ page: { ...pg, duplex: e.target.checked } })} /> Printed on both sides</label>
          {(["top", "right", "bottom", "left"] as const).map((k) => (
            <label key={k} className="space-y-1"><span className="font-medium capitalize">{k} margin ({u})</span><Input type="number" step="0.5" value={n(pg.margins[k])} onChange={(e) => set({ page: { ...pg, margins: { ...pg.margins, [k]: fromUnit(Number(e.target.value), u) } } })} /></label>
          ))}
          <label className="space-y-1"><span className="font-medium">Bleed ({u})</span><Input type="number" step="0.5" value={n(pg.bleed ?? 0)} onChange={(e) => set({ page: { ...pg, bleed: fromUnit(Number(e.target.value), u) } })} /></label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Headers, footers and text</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-xs sm:grid-cols-2">
          <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={layout.differentFirst} onChange={(e) => set({ differentFirst: e.target.checked })} /> A different header and footer on the first page</label>
          <label className="flex items-start gap-2 sm:col-span-2"><input type="checkbox" className="mt-0.5" checked={!!layout.oddEven} onChange={(e) => set({ oddEven: e.target.checked })} /> <span>Different headers and footers on odd and even pages<span className="block text-muted-foreground">For printing on both sides. Applied in the Word file; the PDF uses the odd-page ones on every later page.</span></span></label>
          <label className="space-y-1"><span className="font-medium">First page header height ({u})</span><Input type="number" value={n(layout.header.first)} onChange={(e) => set({ header: { ...layout.header, first: fromUnit(Number(e.target.value), u) } })} /></label>
          <label className="space-y-1"><span className="font-medium">Later pages header ({u})</span><Input type="number" value={n(layout.header.rest)} onChange={(e) => set({ header: { ...layout.header, rest: fromUnit(Number(e.target.value), u) } })} /></label>
          <label className="space-y-1"><span className="font-medium">First page footer ({u})</span><Input type="number" value={n(layout.footer.first)} onChange={(e) => set({ footer: { ...layout.footer, first: fromUnit(Number(e.target.value), u) } })} /></label>
          <label className="space-y-1"><span className="font-medium">Later pages footer ({u})</span><Input type="number" value={n(layout.footer.rest)} onChange={(e) => set({ footer: { ...layout.footer, rest: fromUnit(Number(e.target.value), u) } })} /></label>
          <label className="space-y-1 sm:col-span-2"><span className="font-medium">Font</span>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={layout.font.family} onChange={(e) => set({ font: { ...layout.font, family: e.target.value } })}>
              {["Segoe UI, Arial, 'Noto Sans Ethiopic', sans-serif", "Georgia, 'Times New Roman', 'Noto Serif Ethiopic', serif", "Calibri, Arial, 'Noto Sans Ethiopic', sans-serif", "'Nyala', 'Noto Sans Ethiopic', Arial, sans-serif"].map((f) => <option key={f} value={f}>{f.split(",")[0]!.replace(/'/g, "")}</option>)}
            </select>
          </label>
          <label className="space-y-1"><span className="font-medium">Text size (pt)</span><Input type="number" value={layout.font.size} onChange={(e) => set({ font: { ...layout.font, size: Number(e.target.value) } })} /></label>
          <label className="space-y-1"><span className="font-medium">Line spacing</span><Input type="number" step="0.1" value={layout.font.lineHeight} onChange={(e) => set({ font: { ...layout.font, lineHeight: Number(e.target.value) } })} /></label>
          <label className="space-y-1"><span className="font-medium">Brand colour</span><Input type="color" value={layout.colors.primary} onChange={(e) => set({ colors: { ...layout.colors, primary: e.target.value } })} /></label>
          <label className="space-y-1"><span className="font-medium">Accent</span><Input type="color" value={layout.colors.accent} onChange={(e) => set({ colors: { ...layout.colors, accent: e.target.value } })} /></label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Watermark, border and background</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-xs sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2"><span className="font-medium">Watermark text</span><Input value={layout.watermark?.text ?? ""} onChange={(e) => set({ watermark: e.target.value ? { text: e.target.value, opacity: layout.watermark?.opacity ?? 0.07, angle: layout.watermark?.angle ?? -30, size: layout.watermark?.size ?? 70 } : null })} placeholder="e.g. OFFICIAL or CONFIDENTIAL" /></label>
          {layout.watermark && (
            <>
              <label className="space-y-1"><span className="font-medium">Opacity</span><Input type="number" step="0.01" min={0} max={1} value={layout.watermark.opacity} onChange={(e) => set({ watermark: { ...layout.watermark!, opacity: Number(e.target.value) } })} /></label>
              <label className="space-y-1"><span className="font-medium">Angle</span><Input type="number" value={layout.watermark.angle} onChange={(e) => set({ watermark: { ...layout.watermark!, angle: Number(e.target.value) } })} /></label>
            </>
          )}
          <label className="space-y-1"><span className="font-medium">Page border</span><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={layout.border.style} onChange={(e) => set({ border: { ...layout.border, style: e.target.value as "none" } })}><option value="none">None</option><option value="solid">Single</option><option value="double">Double</option></select></label>
          <label className="space-y-1"><span className="font-medium">Border colour</span><Input type="color" value={layout.border.color} onChange={(e) => set({ border: { ...layout.border, color: e.target.value } })} /></label>
          <label className="space-y-1"><span className="font-medium">Border inset ({u})</span><Input type="number" value={n(layout.border.inset)} onChange={(e) => set({ border: { ...layout.border, inset: fromUnit(Number(e.target.value), u) } })} /></label>
          <label className="space-y-1"><span className="font-medium">Border width (mm)</span><Input type="number" step="0.1" value={layout.border.width} onChange={(e) => set({ border: { ...layout.border, width: Number(e.target.value) } })} /></label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 sm:col-span-2">
            <ImageIcon className="size-3.5" /> {layout.background ? "Change background picture" : "Background picture (faint)"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 1_500_000) return toast.error("Up to 1.5 MB."); const r = new FileReader(); r.onload = () => set({ background: String(r.result) }); r.readAsDataURL(f); }} />
          </label>
          {layout.background && <Button size="sm" variant="ghost" onClick={() => set({ background: null })}>Remove background</Button>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Letter parts, signatures and fields</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          {([["refDate", "Reference and date"], ["recipient", "Recipient block"], ["subject", "Subject line"], ["classificationLabel", "Confidential / restricted label"], ["pageNumbers", "Page numbers (Page 1 of 2)"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={layout.blocks[k]} onChange={(e) => set({ blocks: { ...layout.blocks, [k]: e.target.checked } })} /> {l}</label>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className="font-medium">Signature layout</span><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={layout.signatures.layout} onChange={(e) => set({ signatures: { ...layout.signatures, layout: e.target.value as "row" } })}><option value="row">Side by side</option><option value="grid">Two by two</option><option value="column">One under the other</option><option value="left">Left</option><option value="center">Centred</option><option value="right">Right</option></select></label>
            <label className="space-y-1"><span className="font-medium">Signatures go</span><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={layout.signatures.placement} onChange={(e) => set({ signatures: { ...layout.signatures, placement: e.target.value as "end" } })}><option value="end">After the letter</option><option value="own-page">On their own page</option></select></label>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={layout.signatures.showDate} onChange={(e) => set({ signatures: { ...layout.signatures, showDate: e.target.checked } })} /> Signing date under each signature</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={layout.signatures.showCapacity} onChange={(e) => set({ signatures: { ...layout.signatures, showCapacity: e.target.checked } })} /> Capacity (acting, delegated)</label>
          <div className="space-y-1 border-t pt-2">
            <p className="font-medium">This template&apos;s own fields</p>
            {layout.fields.map((f, i) => (
              <div key={i} className="flex gap-1">
                <Input className="h-7 text-xs" value={f.key} onChange={(e) => set({ fields: layout.fields.map((x, j) => (j === i ? { ...x, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") } : x)) })} placeholder="key" />
                <Input className="h-7 text-xs" value={f.label} onChange={(e) => set({ fields: layout.fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Label" />
                <Input className="h-7 text-xs" value={f.default ?? ""} onChange={(e) => set({ fields: layout.fields.map((x, j) => (j === i ? { ...x, default: e.target.value } : x)) })} placeholder="Default" />
                <Button size="icon" variant="ghost" className="size-7" onClick={() => set({ fields: layout.fields.filter((_, j) => j !== i) })} aria-label="Remove field"><Trash2Icon /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => set({ fields: [...layout.fields, { key: `field_${layout.fields.length + 1}`, label: "New field" }] })}>+ Field</Button>
          </div>
        </CardContent>
      </Card>
    </fieldset>
  );
}
