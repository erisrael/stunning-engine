"use client";

// The design editor (Canva style): pages you draw on with text, pictures, shapes, lines, icons, tables, QR codes and
// the letter's signature and stamp places. Drag to move (with smart guides that snap to the page and to other
// elements), handles to resize and rotate, double-click to type, layers, grouping, alignment and distribution,
// copy and paste, undo and redo, zoom, pages, backgrounds and brand colours, and a preview that shows the design as
// it will print. What is offered follows the options Admin set (Admin, Tools hub, Design editor).

import * as React from "react";
import {
  AlignCenterHorizontalIcon, AlignCenterVerticalIcon, AlignEndHorizontalIcon, AlignEndVerticalIcon, AlignStartHorizontalIcon, AlignStartVerticalIcon, ArrowDownIcon, ArrowUpIcon, BoldIcon, BringToFrontIcon, CopyIcon, DownloadIcon, EyeIcon, EyeOffIcon, FileImageIcon, GridIcon, GroupIcon, ImageIcon, ImagePlusIcon, ItalicIcon, LayersIcon, LayoutTemplateIcon, LinkIcon, LockIcon, MagnetIcon, MinusIcon, MousePointer2Icon, PaintBucketIcon, PencilRulerIcon, PlusIcon, QrCodeIcon, Redo2Icon, SendToBackIcon, ShapesIcon, SignatureIcon, SquareIcon, StampIcon, StrikethroughIcon, TableIcon, Trash2Icon, TypeIcon, UnderlineIcon, UngroupIcon, Undo2Icon, UnlockIcon, ZoomInIcon, ZoomOutIcon, FilesIcon, StarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DEFAULT_DESIGN_OPTIONS, DESIGN_FONTS, DESIGN_SIZES, did, elementInner, ICONS, pageBackground, pageHtml, shapeEl, textCss, textEl, WEB_FONTS, fontStack,
  type DElement, type Design, type DesignOptions, type DPage, type DShape, type DText, type Extras,
} from "@/lib/design";
import { download, exportDocx, exportImages, exportPptx, exportSvg, printDesign } from "./design-export";
import { cn } from "@/lib/utils";

const MM = 96 / 25.4;
type Mode = "design" | "preview";
type Guide = { axis: "x" | "y"; at: number };

export type DesignTemplate = { key: string; label: string; hint?: string; design: () => Design };

type Props = {
  design: Design;
  onChange: (d: Design) => void;
  options?: DesignOptions;
  values?: Record<string, string>;
  extras?: Extras;
  templates?: DesignTemplate[];
  title?: string;
  // Slots offered for letters (signature, stamp, date, reference, recipient, body).
  slots?: boolean;
  // Slide notes under each page (Deck Maker).
  notes?: boolean;
  mode?: Mode;
  onModeChange?: (m: Mode) => void;
  height?: string;
};

export function DesignEditor({ design, onChange, options = DEFAULT_DESIGN_OPTIONS, values = {}, extras = {}, templates = [], title = "Design", slots = false, notes = false, mode: modeProp, onModeChange, height = "78vh" }: Props) {
  const [modeLocal, setModeLocal] = React.useState<Mode>("design");
  const mode = modeProp ?? modeLocal;
  const setMode = (m: Mode) => (onModeChange ? onModeChange(m) : setModeLocal(m));
  const [page, setPage] = React.useState(0);
  const [sel, setSel] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(0.9);
  const [live, setLive] = React.useState<Design | null>(null);
  const [guides, setGuides] = React.useState<Guide[]>([]);
  const [panel, setPanel] = React.useState<"templates" | "elements" | "text" | "uploads" | "background" | "layers" | "pages">(templates.length ? "templates" : "elements");
  const [snap, setSnap] = React.useState(options.snap);
  const [grid, setGrid] = React.useState(options.grid);
  const [marquee, setMarquee] = React.useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const past = React.useRef<Design[]>([]);
  const future = React.useRef<Design[]>([]);
  const clip = React.useRef<DElement[]>([]);
  const pageRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const scroller = React.useRef<HTMLDivElement>(null);

  const d = live ?? design;
  const cur = d.pages[Math.min(page, d.pages.length - 1)]!;
  const selected = cur.elements.filter((e) => sel.includes(e.id));
  const one = selected.length === 1 ? selected[0]! : null;
  const fonts = options.allowAllFonts ? DESIGN_FONTS : DESIGN_FONTS.filter((f) => options.fonts.includes(f));
  const palette = [...new Set([...options.palette, ...(d.palette ?? [])])];
  // A template's letterhead parts stay put when Admin locks them.
  const frozen = (e: DElement) => !!e.locked && options.lockLetterhead && e.name?.startsWith("Letterhead");

  const commit = React.useCallback(
    (next: Design) => {
      past.current.push(design);
      if (past.current.length > 120) past.current.shift();
      future.current = [];
      setLive(null);
      onChange(next);
    },
    [design, onChange],
  );
  const undo = () => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(design);
    onChange(p);
  };
  const redo = () => {
    const f = future.current.pop();
    if (!f) return;
    past.current.push(design);
    onChange(f);
  };
  const setPageEls = (els: DElement[], base: Design = design, p = page) => ({ ...base, pages: base.pages.map((x, i) => (i === p ? { ...x, elements: els } : x)) });
  const update = (ids: string[], patch: (e: DElement) => DElement) => commit(setPageEls(cur.elements.map((e) => (ids.includes(e.id) && !frozen(e) ? patch(e) : e))));
  const updateOne = (patch: Partial<DElement>) => one && update([one.id], (e) => ({ ...e, ...patch }) as DElement);
  const add = (e: DElement) => {
    // New elements land in the middle of the page.
    const el = (e.x === 0 && e.y === 0 ? { ...e, x: round((d.w - e.w) / 2), y: round((d.h - e.h) / 2) } : e) as DElement;
    commit(setPageEls([...cur.elements, el]));
    setSel([el.id]);
  };
  const removeSel = () => {
    const ids = selected.filter((e) => !frozen(e)).map((e) => e.id);
    if (!ids.length) return;
    commit(setPageEls(cur.elements.filter((e) => !ids.includes(e.id))));
    setSel([]);
  };
  const duplicate = (list = selected) => {
    const copies = list.filter((e) => !frozen(e)).map((e) => ({ ...structuredClone(e), id: did(), x: e.x + 5, y: e.y + 5, locked: false, name: e.name?.replace(/^Letterhead/, "") }) as DElement);
    if (!copies.length) return;
    commit(setPageEls([...cur.elements, ...copies]));
    setSel(copies.map((c) => c.id));
  };
  const arrange = (how: "front" | "back" | "forward" | "backward") => {
    const els = cur.elements.slice();
    const ids = new Set(sel);
    if (how === "front") return commit(setPageEls([...els.filter((e) => !ids.has(e.id)), ...els.filter((e) => ids.has(e.id))]));
    if (how === "back") return commit(setPageEls([...els.filter((e) => ids.has(e.id)), ...els.filter((e) => !ids.has(e.id))]));
    const step = how === "forward" ? 1 : -1;
    const order = how === "forward" ? [...els.keys()].reverse() : [...els.keys()];
    for (const i of order) {
      const j = i + step;
      if (ids.has(els[i]!.id) && j >= 0 && j < els.length && !ids.has(els[j]!.id)) [els[i], els[j]] = [els[j]!, els[i]!];
    }
    commit(setPageEls(els));
  };
  const alignSel = (how: "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom") => {
    // One element aligns to the page; several align to their shared box.
    const box = selected.length > 1 ? bounds(selected) : { x: 0, y: 0, w: d.w, h: d.h };
    update(sel, (e) => ({ ...e, x: how === "left" ? box.x : how === "hcenter" ? box.x + (box.w - e.w) / 2 : how === "right" ? box.x + box.w - e.w : e.x, y: how === "top" ? box.y : how === "vmiddle" ? box.y + (box.h - e.h) / 2 : how === "bottom" ? box.y + box.h - e.h : e.y }));
  };
  const distribute = (axis: "x" | "y") => {
    if (selected.length < 3) return;
    const list = [...selected].sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));
    const first = list[0]!;
    const last = list.at(-1)!;
    const total = list.reduce((s, e) => s + (axis === "x" ? e.w : e.h), 0);
    const gap = ((axis === "x" ? last.x + last.w - first.x : last.y + last.h - first.y) - total) / (list.length - 1);
    let at = axis === "x" ? first.x : first.y;
    const pos = new Map<string, number>();
    for (const e of list) {
      pos.set(e.id, at);
      at += (axis === "x" ? e.w : e.h) + gap;
    }
    update(sel, (e) => (axis === "x" ? { ...e, x: pos.get(e.id) ?? e.x } : { ...e, y: pos.get(e.id) ?? e.y }));
  };
  const group = () => {
    if (selected.length < 2) return;
    const g = did();
    update(sel, (e) => ({ ...e, group: g }));
  };
  const ungroup = () => update(sel, (e) => ({ ...e, group: undefined }));

  // Selecting an element of a group selects the group.
  const pick = (e: DElement, add: boolean) => {
    const ids = e.group ? cur.elements.filter((x) => x.group === e.group).map((x) => x.id) : [e.id];
    setSel((s) => (add ? (ids.every((i) => s.includes(i)) ? s.filter((i) => !ids.includes(i)) : [...new Set([...s, ...ids])]) : s.length && ids.every((i) => s.includes(i)) ? s : ids));
  };

  const toMm = (ev: { clientX: number; clientY: number }, p = page) => {
    const r = pageRefs.current[p]?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (ev.clientX - r.left) / (MM * zoom), y: (ev.clientY - r.top) / (MM * zoom) };
  };

  // Moving, with guides that snap to the page's edges and middle, to other elements and to the grid.
  const startMove = (ev: React.PointerEvent, e: DElement) => {
    if (mode !== "design" || editing === e.id) return;
    ev.stopPropagation();
    if (frozen(e)) return setSel([e.id]);
    const already = sel.includes(e.id);
    if (!already || ev.shiftKey) pick(e, ev.shiftKey);
    const ids = already && !ev.shiftKey ? sel : e.group ? cur.elements.filter((x) => x.group === e.group).map((x) => x.id) : [e.id];
    const moving = cur.elements.filter((x) => ids.includes(x.id) && !frozen(x) && !x.locked);
    if (!moving.length) return;
    const start = toMm(ev);
    const orig = new Map(moving.map((x) => [x.id, { x: x.x, y: x.y }]));
    const box0 = bounds(moving);
    const others = cur.elements.filter((x) => !ids.includes(x.id) && !x.hidden);
    const xs = [0, d.w / 2, d.w, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const ys = [0, d.h / 2, d.h, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
    let moved = false;
    let latest: Design | null = null;
    const mv = (pe: PointerEvent) => {
      const p = toMm(pe);
      let dx = p.x - start.x;
      let dy = p.y - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 0.6) return;
      moved = true;
      const g: Guide[] = [];
      if (snap && !pe.altKey) {
        const tol = 2 / zoom;
        const cand = (vals: number[], edges: number[]) => {
          let best: { d: number; at: number } | null = null;
          for (const edge of edges) for (const v of vals) if (Math.abs(v - edge) < tol && (!best || Math.abs(v - edge) < Math.abs(best.d))) best = { d: v - edge, at: v };
          return best;
        };
        const bx = cand(xs, [box0.x + dx, box0.x + box0.w / 2 + dx, box0.x + box0.w + dx]);
        const by = cand(ys, [box0.y + dy, box0.y + box0.h / 2 + dy, box0.y + box0.h + dy]);
        if (bx) (dx += bx.d), g.push({ axis: "x", at: bx.at });
        if (by) (dy += by.d), g.push({ axis: "y", at: by.at });
        if (grid && !bx) dx = Math.round((box0.x + dx) / options.gridSize) * options.gridSize - box0.x;
        if (grid && !by) dy = Math.round((box0.y + dy) / options.gridSize) * options.gridSize - box0.y;
      }
      setGuides(g);
      latest = setPageEls(cur.elements.map((x) => (orig.has(x.id) ? { ...x, x: round(orig.get(x.id)!.x + dx), y: round(orig.get(x.id)!.y + dy) } : x)));
      setLive(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      setGuides([]);
      if (moved && latest) commit(latest);
      else setLive(null);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const startResize = (ev: React.PointerEvent, e: DElement, handle: string) => {
    ev.stopPropagation();
    ev.preventDefault();
    const start = toMm(ev);
    const o = { x: e.x, y: e.y, w: e.w, h: e.h };
    const ratio = o.w / Math.max(0.01, o.h);
    const keep = e.kind === "image" || e.kind === "icon" || e.kind === "qr";
    let latest: Design | null = null;
    const mv = (pe: PointerEvent) => {
      const p = toMm(pe);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      let { x, y, w, h } = o;
      if (handle.includes("e")) w = Math.max(1, o.w + dx);
      if (handle.includes("s")) h = Math.max(e.kind === "line" ? 0 : 1, o.h + dy);
      if (handle.includes("w")) (w = Math.max(1, o.w - dx)), (x = o.x + o.w - w);
      if (handle.includes("n")) (h = Math.max(1, o.h - dy)), (y = o.y + o.h - h);
      if ((keep || pe.shiftKey) && handle.length === 2) {
        if (w / h > ratio) w = h * ratio;
        else h = w / ratio;
        if (handle.includes("w")) x = o.x + o.w - w;
        if (handle.includes("n")) y = o.y + o.h - h;
      }
      latest = setPageEls(cur.elements.map((x0) => (x0.id === e.id ? ({ ...x0, x: round(x), y: round(y), w: round(w), h: round(h) } as DElement) : x0)));
      setLive(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      if (latest) commit(latest);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const startRotate = (ev: React.PointerEvent, e: DElement) => {
    ev.stopPropagation();
    ev.preventDefault();
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    let latest: Design | null = null;
    const mv = (pe: PointerEvent) => {
      const p = toMm(pe);
      let a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (!pe.shiftKey) {
        const s = Math.round(a / 15) * 15;
        if (Math.abs(a - s) < 4) a = s;
      }
      a = Math.round(((a + 540) % 360) - 180);
      latest = setPageEls(cur.elements.map((x0) => (x0.id === e.id ? ({ ...x0, rotate: a } as DElement) : x0)));
      setLive(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      if (latest) commit(latest);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  // A drag on the empty page selects everything it touches.
  const startMarquee = (ev: React.PointerEvent, p: number) => {
    if (mode !== "design") return;
    if (p !== page) setPage(p);
    setEditing(null);
    const s = toMm(ev, p);
    if (!ev.shiftKey) setSel([]);
    let box = { x0: s.x, y0: s.y, x1: s.x, y1: s.y };
    setMarquee(box);
    const mv = (pe: PointerEvent) => {
      const q = toMm(pe, p);
      box = { ...box, x1: q.x, y1: q.y };
      setMarquee(box);
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      setMarquee(null);
      const x1 = Math.min(box.x0, box.x1);
      const x2 = Math.max(box.x0, box.x1);
      const y1 = Math.min(box.y0, box.y1);
      const y2 = Math.max(box.y0, box.y1);
      if (x2 - x1 < 1 && y2 - y1 < 1) return;
      const els = (design.pages[p]?.elements ?? []).filter((e) => !e.hidden && e.x < x2 && e.x + e.w > x1 && e.y < y2 && e.y + e.h > y1);
      setSel((cur0) => [...new Set([...(ev.shiftKey ? cur0 : []), ...els.map((e) => e.id)])]);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (editing || mode !== "design") return;
    const t = e.target as HTMLElement;
    if (t.closest("input,textarea,select,[contenteditable=true]")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
    if (mod && k === "y") return e.preventDefault(), redo();
    if (mod && k === "d") return e.preventDefault(), duplicate();
    if (mod && k === "c") return (clip.current = structuredClone(selected));
    if (mod && k === "x") return (clip.current = structuredClone(selected)), removeSel();
    if (mod && k === "v" && clip.current.length) {
      e.preventDefault();
      const copies = clip.current.map((x) => ({ ...structuredClone(x), id: did(), x: x.x + 4, y: x.y + 4, locked: false, name: x.name?.replace(/^Letterhead/, "") }) as DElement);
      commit(setPageEls([...cur.elements, ...copies]));
      setSel(copies.map((c) => c.id));
      return;
    }
    if (mod && k === "a") return e.preventDefault(), setSel(cur.elements.filter((x) => !x.hidden).map((x) => x.id));
    if (mod && k === "g") return e.preventDefault(), e.shiftKey ? ungroup() : group();
    if (k === "delete" || k === "backspace") return e.preventDefault(), removeSel();
    if (k === "escape") return setSel([]);
    if (k === "]") return arrange(mod ? "front" : "forward");
    if (k === "[") return arrange(mod ? "back" : "backward");
    if (k.startsWith("arrow") && sel.length) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
      const dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
      update(sel, (x) => (x.locked ? x : { ...x, x: round(x.x + dx), y: round(x.y + dy) }));
    }
    if (k === "t" && !mod) return e.preventDefault(), add(textEl("Your text", 0, 0, 80, 12, { size: 16 }));
  };

  const upload = (f: File, then: (src: string) => void) => {
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(f.type)) return alert("Use a PNG, JPEG, WebP, GIF or SVG picture.");
    if (f.size > options.maxUploadKb * 1024) return alert(`Use a picture under ${options.maxUploadKb} KB.`);
    const r = new FileReader();
    r.onload = () => then(String(r.result));
    r.readAsDataURL(f);
  };
  const addImage = (src: string) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min((d.w * 0.6) / (img.naturalWidth || 1), (d.h * 0.4) / (img.naturalHeight || 1));
      const w = round((img.naturalWidth || 100) * k);
      const h = round((img.naturalHeight || 100) * k);
      add({ id: did(), kind: "image", src, fit: "cover", x: (d.w - w) / 2, y: (d.h - h) / 2, w, h, rotate: 0, opacity: 1 } as DElement);
    };
    img.src = src;
  };

  const setPages = (pages: DPage[], to?: number) => {
    commit({ ...design, pages });
    if (to !== undefined) setPage(Math.max(0, Math.min(pages.length - 1, to)));
    setSel([]);
  };

  // Text editing in place (double-click a text box).
  const commitText = (id: string, text: string) => {
    setEditing(null);
    const el = cur.elements.find((x) => x.id === id);
    if (el && el.kind === "text" && el.text !== text) commit(setPageEls(cur.elements.map((x) => (x.id === id ? ({ ...x, text } as DElement) : x))));
  };

  const fitZoom = () => {
    const w = scroller.current?.clientWidth ?? 800;
    setZoom(Math.max(0.2, Math.min(2.5, Math.round(((w - 48) / (d.w * MM)) * 20) / 20)));
  };
  React.useEffect(() => {
    fitZoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.w]);
  React.useEffect(() => setSel([]), [mode]);

  const exportAs = async (kind: "png" | "jpeg" | "pdf" | "svg" | "pptx" | "docx" | "pagepng") => {
    setBusy(kind);
    try {
      const ex = { ...extras, editing: false };
      if (kind === "png" || kind === "jpeg") await exportImages(d, title, kind, values, ex);
      if (kind === "pagepng") await exportImages(d, `${title}-page-${page + 1}`, "png", values, ex, page);
      if (kind === "pdf") printDesign(d, title, values, ex);
      if (kind === "svg") exportSvg(d, title, values, ex, page);
      if (kind === "pptx") await exportPptx(d, title, values, ex);
      if (kind === "docx") await exportDocx(d, title, values, ex);
    } catch {
      alert("The export did not finish. Try again, or use a smaller picture.");
    }
    setBusy(null);
  };

  const tb = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40";
  const ex = { ...extras, editing: mode === "design" };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-background" onKeyDown={onKey} tabIndex={-1}>
      {options.webFonts && <style>{`@import url("https://fonts.googleapis.com/css2?${WEB_FONTS.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,400;0,600;0,700;1,400`).join("&")}&display=swap");`}</style>}
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-2 py-1">
        {options.allowModeSwitch && (
          <div className="mr-1 inline-flex rounded-md border bg-background p-0.5 text-xs" role="tablist" aria-label="Mode">
            <button type="button" role="tab" aria-selected={mode === "design"} className={cn("inline-flex items-center gap-1 rounded px-2 py-1", mode === "design" && "bg-primary text-primary-foreground")} onClick={() => setMode("design")}>
              <PencilRulerIcon className="size-3.5" /> Edit
            </button>
            <button type="button" role="tab" aria-selected={mode === "preview"} className={cn("inline-flex items-center gap-1 rounded px-2 py-1", mode === "preview" && "bg-primary text-primary-foreground")} onClick={() => setMode("preview")}>
              <EyeIcon className="size-3.5" /> Preview
            </button>
          </div>
        )}
        {mode === "design" && (
          <>
            <button type="button" className={tb} onClick={undo} disabled={!past.current.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2Icon className="size-4" /></button>
            <button type="button" className={tb} onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2Icon className="size-4" /></button>
            <span className="mx-1 h-5 w-px bg-border" />
            <button type="button" className={cn(tb, snap && "bg-muted text-primary")} onClick={() => setSnap(!snap)} title="Snap to guides (hold Alt to move freely)" aria-label="Snap"><MagnetIcon className="size-4" /></button>
            <button type="button" className={cn(tb, grid && "bg-muted text-primary")} onClick={() => setGrid(!grid)} title={`Grid (${options.gridSize} mm)`} aria-label="Grid"><GridIcon className="size-4" /></button>
          </>
        )}
        {options.allowPageSize && mode === "design" && (
          <select
            className="h-8 rounded-md border bg-background px-1 text-xs"
            aria-label="Page size"
            value={DESIGN_SIZES.find((s) => Math.abs(s.w - d.w) < 0.5 && Math.abs(s.h - d.h) < 0.5)?.key ?? "custom"}
            onChange={(e) => {
              const s = DESIGN_SIZES.find((x) => x.key === e.target.value);
              if (!s) return;
              // Elements keep their place in proportion to the new size.
              const kx = s.w / d.w;
              const ky = s.h / d.h;
              commit({ ...design, w: s.w, h: s.h, pages: design.pages.map((p) => ({ ...p, elements: p.elements.map((el) => ({ ...el, x: round(el.x * kx), y: round(el.y * ky), w: round(el.w * kx), h: round(el.h * ky) }) as DElement) })) });
            }}
          >
            {DESIGN_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            <option value="custom" hidden>Custom {Math.round(d.w)} × {Math.round(d.h)} mm</option>
          </select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={tb} onClick={() => setZoom((z) => Math.max(0.2, Math.round((z - 0.1) * 10) / 10))} aria-label="Zoom out"><ZoomOutIcon className="size-4" /></button>
          <button type="button" className="h-8 rounded-md px-1 text-xs tabular-nums hover:bg-muted" onClick={fitZoom} title="Fit to width">{Math.round(zoom * 100)}%</button>
          <button type="button" className={tb} onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))} aria-label="Zoom in"><ZoomInIcon className="size-4" /></button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8" disabled={!!busy}>
                <DownloadIcon /> {busy ? "Exporting…" : "Download"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-1">
              {options.exports.pdf && <MenuBtn onClick={() => exportAs("pdf")} label="PDF (print, Save as PDF)" />}
              {options.exports.png && <MenuBtn onClick={() => exportAs("png")} label={d.pages.length > 1 ? "PNG, every page (.zip)" : "PNG picture"} />}
              {options.exports.png && d.pages.length > 1 && <MenuBtn onClick={() => exportAs("pagepng")} label={`PNG, page ${page + 1} only`} />}
              {options.exports.jpeg && <MenuBtn onClick={() => exportAs("jpeg")} label="JPEG picture" />}
              {options.exports.svg && <MenuBtn onClick={() => exportAs("svg")} label={`SVG, page ${page + 1}`} />}
              {options.exports.pptx && <MenuBtn onClick={() => exportAs("pptx")} label="PowerPoint (.pptx), editable" />}
              {options.exports.docx && <MenuBtn onClick={() => exportAs("docx")} label="Word (.docx)" />}
              <MenuBtn onClick={() => download(new Blob([JSON.stringify(design)], { type: "application/json" }), `${title.replace(/[^\w\- ]+/g, "") || "design"}.myseed-design.json`)} label="Design file (.json), to open again" />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex min-h-0" style={{ height }}>
        {/* Left panel */}
        {mode === "design" && (
          <div className="flex w-[19rem] shrink-0 border-r max-md:hidden">
            <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-muted/20 py-2" aria-label="Design panels">
              {(
                [
                  ...(templates.length ? [["templates", LayoutTemplateIcon, "Templates"] as const] : []),
                  ["elements", ShapesIcon, "Elements"],
                  ["text", TypeIcon, "Text"],
                  ...(options.allowUploads ? [["uploads", ImagePlusIcon, "Uploads"] as const] : []),
                  ["background", PaintBucketIcon, "Background"],
                  ["layers", LayersIcon, "Layers"],
                  ["pages", FilesIcon, "Pages"],
                ] as const
              ).map(([k, Icon, label]) => (
                <button key={k} type="button" onClick={() => setPanel(k)} className={cn("flex w-12 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px]", panel === k ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </nav>
            <div className="min-w-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
              {panel === "templates" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Starting a template replaces this design (undo brings it back).</p>
                  <div className="grid grid-cols-2 gap-2">
                    {templates.map((t) => {
                      const td = t.design();
                      return (
                        <button key={t.key} type="button" className="space-y-1 text-left" onClick={() => (commit(td), setPage(0), setSel([]))} title={t.hint}>
                          <Thumb d={td} p={td.pages[0]!} width={116} values={values} extras={ex} />
                          <span className="block truncate text-xs font-medium">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {panel === "text" && (
                <div className="space-y-2">
                  <Button className="w-full" size="sm" onClick={() => add(textEl("Add a heading", 0, 0, Math.min(150, d.w - 20), 16, { size: 28, weight: 700 }))}>Add a heading</Button>
                  <Button className="w-full" size="sm" variant="outline" onClick={() => add(textEl("Add a subheading", 0, 0, Math.min(130, d.w - 20), 11, { size: 18, weight: 600 }))}>Add a subheading</Button>
                  <Button className="w-full" size="sm" variant="outline" onClick={() => add(textEl("Add a little body text. Double-click to type.", 0, 0, Math.min(120, d.w - 20), 20, { size: 11 }))}>Add body text</Button>
                  <p className="pt-2 text-xs font-medium text-muted-foreground">Styles</p>
                  {[
                    { label: "Bold title", t: textEl("BOLD TITLE", 0, 0, 140, 18, { font: "Montserrat", size: 32, weight: 800, letterSpacing: 2 }) },
                    { label: "Elegant serif", t: textEl("Elegant heading", 0, 0, 140, 16, { font: "Playfair Display", size: 30, italic: true }) },
                    { label: "Quote", t: textEl("“A quote that matters.”", 0, 0, 130, 18, { font: "Georgia", size: 18, italic: true, color: "#475569", align: "center" }) },
                    { label: "Label", t: textEl("LABEL", 0, 0, 40, 8, { size: 9, weight: 700, color: "#ffffff", bg: "#16a34a", align: "center", valign: "middle", padding: 1, letterSpacing: 1.5 }) },
                    { label: "Bullet list", t: textEl("First point\nSecond point\nThird point", 0, 0, 100, 24, { size: 12, list: "bullet" }) },
                    { label: "Amharic heading", t: textEl("የምስክር ወረቀት", 0, 0, 120, 16, { font: "Noto Sans Ethiopic", size: 26, weight: 700 }) },
                  ].map((s) => (
                    <button key={s.label} type="button" className="block w-full rounded-md border px-2 py-2 text-left hover:border-primary" onClick={() => add({ ...s.t, id: did() } as DElement)}>
                      <span style={{ fontFamily: fontStack((s.t as DText).font), fontWeight: (s.t as DText).weight, fontStyle: (s.t as DText).italic ? "italic" : undefined }} className="text-sm">{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {panel === "elements" && (
                <div className="space-y-3">
                  {options.allowShapes && (
                    <Section title="Shapes">
                      <div className="grid grid-cols-5 gap-1">
                        {(["rect", "ellipse", "triangle", "diamond", "star", "arrow", "hexagon", "speech", "pill"] as DShape["shape"][]).map((s) => (
                          <button key={s} type="button" title={s} className="flex aspect-square items-center justify-center rounded border hover:border-primary" onClick={() => add(shapeEl(s, 0, 0, s === "pill" ? 50 : 40, s === "pill" ? 14 : s === "arrow" ? 22 : 40, { fill: palette[0] ?? "#16a34a" }))}>
                            <span className="block size-6" dangerouslySetInnerHTML={{ __html: elementInner(shapeEl(s, 0, 0, 24, 24, { fill: "#64748b" })) }} />
                          </button>
                        ))}
                        <button type="button" title="Rounded rectangle" className="flex aspect-square items-center justify-center rounded border hover:border-primary" onClick={() => add(shapeEl("rect", 0, 0, 60, 30, { fill: palette[0] ?? "#16a34a", radius: 4 }))}>
                          <span className="block h-4 w-6 rounded bg-slate-500" />
                        </button>
                      </div>
                    </Section>
                  )}
                  <Section title="Lines">
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { label: "Line", p: {} },
                        { label: "Dashed", p: { dash: true } },
                        { label: "Arrow", p: { arrowEnd: true } },
                        { label: "Both ends", p: { arrowEnd: true, arrowStart: true } },
                      ].map((l) => (
                        <button key={l.label} type="button" className="rounded border px-1 py-2 text-[10px] hover:border-primary" onClick={() => add({ id: did(), kind: "line", stroke: "#0f172a", strokeWidth: 0.6, x: (d.w - 80) / 2, y: d.h / 2, w: 80, h: 2, rotate: 0, opacity: 1, ...l.p } as DElement)}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </Section>
                  {options.allowIcons && (
                    <Section title="Icons">
                      <div className="grid grid-cols-6 gap-1">
                        {Object.entries(ICONS).map(([k, path]) => (
                          <button key={k} type="button" title={k} className="flex aspect-square items-center justify-center rounded border hover:border-primary" onClick={() => add({ id: did(), kind: "icon", icon: k, color: palette[0] ?? "#16a34a", x: (d.w - 14) / 2, y: (d.h - 14) / 2, w: 14, h: 14, rotate: 0, opacity: 1 } as DElement)}>
                            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
                          </button>
                        ))}
                      </div>
                    </Section>
                  )}
                  <Section title="More">
                    <div className="grid grid-cols-2 gap-1">
                      {options.allowTables && (
                        <Button size="sm" variant="outline" onClick={() => add({ id: did(), kind: "table", rows: [["Item", "Detail", "Amount"], ["", "", ""], ["", "", ""]], header: true, font: "Inter", size: 10, color: "#111827", headFill: palette[1] ?? "#0f172a", headColor: "#ffffff", border: "#cbd5e1", stripe: "#f8fafc", x: (d.w - 150) / 2, y: (d.h - 30) / 2, w: 150, h: 30, rotate: 0, opacity: 1 } as DElement)}>
                          <TableIcon /> Table
                        </Button>
                      )}
                      {options.allowQr && (
                        <Button size="sm" variant="outline" onClick={() => add({ id: did(), kind: "qr", x: (d.w - 22) / 2, y: (d.h - 22) / 2, w: 22, h: 22, rotate: 0, opacity: 1 } as DElement)}>
                          <QrCodeIcon /> QR code
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => extras.logo && add({ id: did(), kind: "image", src: "logo", fit: "contain", x: 20, y: 15, w: 25, h: 25, rotate: 0, opacity: 1 } as DElement)} disabled={!extras.logo}>
                        <StarIcon /> Logo
                      </Button>
                    </div>
                  </Section>
                  {slots && (
                    <Section title="Letter places">
                      <p className="text-xs text-muted-foreground">Filled when the letter is signed, stamped or issued.</p>
                      <div className="grid grid-cols-2 gap-1">
                        {(
                          [
                            ["signature", SignatureIcon, "Signature", 50, 18],
                            ["stamp", StampIcon, "Stamp", 32, 32],
                            ["date", MousePointer2Icon, "Date", 50, 6],
                            ["reference", MousePointer2Icon, "Reference", 60, 6],
                          ] as const
                        ).map(([slot, Icon, label, w, h]) => (
                          <Button key={slot} size="sm" variant="outline" onClick={() => add({ id: did(), kind: "slot", slot, label, x: (d.w - w) / 2, y: (d.h - h) / 2, w, h, rotate: 0, opacity: 1 } as DElement)}>
                            <Icon /> {label}
                          </Button>
                        ))}
                      </div>
                    </Section>
                  )}
                </div>
              )}
              {panel === "uploads" && (
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-6 text-sm hover:border-primary">
                    <ImagePlusIcon className="size-4" /> Upload a picture
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], addImage)} />
                  </label>
                  <p className="text-xs text-muted-foreground">Up to {options.maxUploadKb} KB. You can also paste a picture or drop it on the page.</p>
                  <div className="grid grid-cols-3 gap-1">
                    {[...new Set(d.pages.flatMap((p) => p.elements.filter((e) => e.kind === "image" && e.src !== "logo").map((e) => (e as { src: string }).src)))].slice(0, 30).map((src, i) => (
                      <button key={i} type="button" className="aspect-square overflow-hidden rounded border" onClick={() => addImage(src)}>
                        <img src={src} alt="" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {panel === "background" && (
                <div className="space-y-3">
                  <Section title="Colour">
                    <Swatches palette={palette} custom={options.allowCustomColors} value={cur.bg} onPick={(c) => setPages(design.pages.map((p, i) => (i === page ? { ...p, bg: c ?? "#ffffff", bgGradient: null } : p)))} />
                  </Section>
                  <Section title="Gradient">
                    <div className="grid grid-cols-4 gap-1">
                      {GRADIENTS.map((g) => (
                        <button key={g} type="button" className="aspect-square rounded border" style={{ background: g }} aria-label={g} onClick={() => setPages(design.pages.map((p, i) => (i === page ? { ...p, bgGradient: g } : p)))} />
                      ))}
                    </div>
                  </Section>
                  {options.allowBackgroundImage && (
                    <Section title="Picture">
                      <div className="flex gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                          <ImageIcon className="size-3.5" /> Choose
                          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], (src) => setPages(design.pages.map((p, i) => (i === page ? { ...p, bgImage: src } : p))))} />
                        </label>
                        {cur.bgImage && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPages(design.pages.map((p, i) => (i === page ? { ...p, bgImage: null } : p)))}>Remove</Button>}
                      </div>
                    </Section>
                  )}
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setPages(design.pages.map((p) => ({ ...p, bg: cur.bg, bgGradient: cur.bgGradient, bgImage: cur.bgImage })))}>Use on every page</Button>
                </div>
              )}
              {panel === "layers" && (
                <ul className="space-y-1">
                  {[...cur.elements].reverse().map((e) => (
                    <li key={e.id} className={cn("flex items-center gap-1 rounded border px-2 py-1 text-xs", sel.includes(e.id) && "border-primary bg-primary/5")}>
                      <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={(ev) => pick(e, ev.shiftKey)}>
                        {e.name ?? layerName(e)}
                      </button>
                      <button type="button" aria-label={e.hidden ? "Show" : "Hide"} onClick={() => update([e.id], (x) => ({ ...x, hidden: !x.hidden }))}>{e.hidden ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}</button>
                      <button type="button" aria-label={e.locked ? "Unlock" : "Lock"} disabled={frozen(e)} onClick={() => update([e.id], (x) => ({ ...x, locked: !x.locked }))}>{e.locked ? <LockIcon className="size-3.5" /> : <UnlockIcon className="size-3.5 opacity-40" />}</button>
                    </li>
                  ))}
                  {!cur.elements.length && <li className="text-xs text-muted-foreground">Nothing on this page yet.</li>}
                </ul>
              )}
              {panel === "pages" && (
                <div className="space-y-2">
                  {d.pages.map((p, i) => (
                    <div key={p.id} className={cn("rounded-md border p-1", i === page && "border-primary")}>
                      <button type="button" className="block w-full" onClick={() => (setPage(i), pageRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" }))}>
                        <Thumb d={d} p={p} width={220} values={values} extras={ex} />
                      </button>
                      <div className="mt-1 flex items-center gap-0.5 text-xs">
                        <span className="flex-1 px-1">Page {i + 1}</span>
                        <button type="button" className="rounded p-1 hover:bg-muted" aria-label="Move up" disabled={i === 0} onClick={() => setPages(d.pages.map((x, j) => (j === i - 1 ? p : j === i ? d.pages[i - 1]! : x)), i - 1)}><ArrowUpIcon className="size-3.5" /></button>
                        <button type="button" className="rounded p-1 hover:bg-muted" aria-label="Move down" disabled={i === d.pages.length - 1} onClick={() => setPages(d.pages.map((x, j) => (j === i + 1 ? p : j === i ? d.pages[i + 1]! : x)), i + 1)}><ArrowDownIcon className="size-3.5" /></button>
                        <button type="button" className="rounded p-1 hover:bg-muted" aria-label="Duplicate page" disabled={d.pages.length >= options.maxPages} onClick={() => setPages([...d.pages.slice(0, i + 1), { ...structuredClone(p), id: did(), elements: p.elements.map((e) => ({ ...structuredClone(e), id: did() })) }, ...d.pages.slice(i + 1)], i + 1)}><CopyIcon className="size-3.5" /></button>
                        <button type="button" className="rounded p-1 hover:bg-muted" aria-label="Delete page" disabled={d.pages.length < 2} onClick={() => confirm(`Delete page ${i + 1}?`) && setPages(d.pages.filter((_, j) => j !== i), Math.min(i, d.pages.length - 2))}><Trash2Icon className="size-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="w-full" disabled={d.pages.length >= options.maxPages} onClick={() => setPages([...d.pages.slice(0, page + 1), { id: did(), bg: cur.bg, bgGradient: cur.bgGradient, elements: cur.elements.filter((e) => e.name?.startsWith("Letterhead")).map((e) => ({ ...structuredClone(e), id: did() })) }, ...d.pages.slice(page + 1)], page + 1)}>
                    <PlusIcon /> Add a page
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="relative min-w-0 flex-1">
          {mode === "design" && selected.length > 0 && (
            <ContextBar
              el={one}
              count={selected.length}
              fonts={fonts}
              palette={palette}
              custom={options.allowCustomColors}
              onPatch={updateOne}
              onDuplicate={() => duplicate()}
              onDelete={removeSel}
              onArrange={arrange}
              onAlign={alignSel}
              onDistribute={distribute}
              onGroup={group}
              onUngroup={ungroup}
              grouped={selected.some((e) => e.group)}
              frozen={selected.some(frozen)}
              onToggleLock={() => update(sel, (e) => ({ ...e, locked: !selected.every((x) => x.locked) }))}
              locked={selected.every((x) => x.locked)}
            />
          )}
          <div
            ref={scroller}
            className="absolute inset-0 overflow-auto bg-slate-100 p-6 dark:bg-slate-900"
            style={{ top: mode === "design" && selected.length ? 44 : 0 }}
            onPointerDown={(e) => e.target === e.currentTarget && (setSel([]), setEditing(null))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f && options.allowUploads && mode === "design") upload(f, addImage);
            }}
            onPaste={(e) => {
              const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
              if (f && options.allowUploads && mode === "design") {
                e.preventDefault();
                upload(f, addImage);
              }
            }}
          >
            <div className="mx-auto flex w-max flex-col items-center gap-6">
              {d.pages.map((p, pi) => (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Page {pi + 1}{d.pages.length > 1 ? ` of ${d.pages.length}` : ""}</span>
                    {mode === "design" && pi === page && <span>{Math.round(d.w)} × {Math.round(d.h)} mm</span>}
                  </div>
                  <div
                    ref={(el) => {
                      pageRefs.current[pi] = el;
                    }}
                    className={cn("relative shadow-md ring-1 ring-black/5", mode === "design" && pi === page && "ring-2 ring-primary/40")}
                    style={{ width: d.w * MM * zoom, height: d.h * MM * zoom }}
                    onPointerDown={(e) => {
                      if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.pageBg) startMarquee(e, pi);
                    }}
                  >
                    <div data-page-bg="1" className="absolute top-0 left-0 overflow-hidden" style={{ width: `${d.w}mm`, height: `${d.h}mm`, transform: `scale(${zoom})`, transformOrigin: "0 0", ...cssOf(pageBackground(p)) }}>
                      {grid && mode === "design" && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, rgba(37,99,235,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,.12) 1px, transparent 1px)`, backgroundSize: `${options.gridSize}mm ${options.gridSize}mm` }} />}
                      {p.elements.map((e) => {
                        if (e.hidden && mode === "preview") return null;
                        const isSel = pi === page && sel.includes(e.id) && mode === "design";
                        const isEdit = editing === e.id && e.kind === "text";
                        return (
                          <div
                            key={e.id}
                            className={cn("absolute", mode === "design" && !isEdit && "cursor-move", e.hidden && "opacity-30", isSel && "outline outline-[0.35mm] outline-primary")}
                            style={{ left: `${e.x}mm`, top: `${e.y}mm`, width: `${e.w}mm`, height: `${Math.max(e.h, e.kind === "line" ? 0.01 : 0)}mm`, transform: e.rotate ? `rotate(${e.rotate}deg)` : undefined, opacity: e.hidden ? undefined : e.opacity }}
                            onPointerDown={(ev) => {
                              if (pi !== page) setPage(pi);
                              startMove(ev, e);
                            }}
                            onDoubleClick={() => mode === "design" && e.kind === "text" && !e.locked && setEditing(e.id)}
                          >
                            {isEdit ? (
                              <EditableText el={e as DText & DElement} onDone={(t) => commitText(e.id, t)} />
                            ) : (
                              <div className="pointer-events-none size-full" dangerouslySetInnerHTML={{ __html: elementInner(e, mode === "preview" ? values : values, ex) }} />
                            )}
                            {isSel && one?.id === e.id && !e.locked && !frozen(e) && !isEdit && (
                              <Handles kind={e.kind} zoom={zoom} onResize={(ev, h) => startResize(ev, e, h)} onRotate={(ev) => startRotate(ev, e)} />
                            )}
                            {isSel && (e.locked || frozen(e)) && <span className="absolute -top-[4mm] left-0 rounded bg-slate-700 px-1 text-[2.6mm] text-white">{frozen(e) ? "Letterhead (locked by Admin)" : "Locked"}</span>}
                          </div>
                        );
                      })}
                      {pi === page &&
                        guides.map((g, i) => (
                          <div key={i} aria-hidden className="pointer-events-none absolute bg-pink-500" style={g.axis === "x" ? { left: `${g.at}mm`, top: 0, width: "0.25mm", height: "100%" } : { top: `${g.at}mm`, left: 0, height: "0.25mm", width: "100%" }} />
                        ))}
                      {pi === page && marquee && (
                        <div aria-hidden className="pointer-events-none absolute border border-primary bg-primary/10" style={{ left: `${Math.min(marquee.x0, marquee.x1)}mm`, top: `${Math.min(marquee.y0, marquee.y1)}mm`, width: `${Math.abs(marquee.x1 - marquee.x0)}mm`, height: `${Math.abs(marquee.y1 - marquee.y0)}mm` }} />
                      )}
                    </div>
                  </div>
                  {notes && mode === "design" && (
                    <Textarea
                      className="text-xs"
                      rows={2}
                      style={{ width: d.w * MM * zoom }}
                      placeholder="Speaker notes"
                      value={p.notes ?? ""}
                      onChange={(e) => onChange({ ...design, pages: design.pages.map((x, i) => (i === pi ? { ...x, notes: e.target.value } : x)) })}
                    />
                  )}
                </div>
              ))}
              {mode === "design" && (
                <Button size="sm" variant="outline" disabled={d.pages.length >= options.maxPages} onClick={() => setPages([...d.pages, { id: did(), bg: cur.bg, elements: [] }], d.pages.length)}>
                  <PlusIcon /> Add a page
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const GRADIENTS = ["linear-gradient(135deg, #16a34a, #0f172a)", "linear-gradient(135deg, #2563eb, #7c3aed)", "linear-gradient(135deg, #f59e0b, #dc2626)", "linear-gradient(180deg, #ffffff, #e2e8f0)", "linear-gradient(135deg, #0ea5e9, #22c55e)", "linear-gradient(90deg, #111827, #374151)", "linear-gradient(135deg, #fdf2f8, #e0e7ff)", "linear-gradient(180deg, #ecfdf5, #ffffff)"];

const round = (n: number) => Math.round(n * 10) / 10;
function bounds(list: DElement[]) {
  const x1 = Math.min(...list.map((e) => e.x));
  const y1 = Math.min(...list.map((e) => e.y));
  const x2 = Math.max(...list.map((e) => e.x + e.w));
  const y2 = Math.max(...list.map((e) => e.y + e.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
function layerName(e: DElement) {
  if (e.kind === "text") return `Text: ${e.text.slice(0, 30) || "(empty)"}`;
  if (e.kind === "shape") return `Shape: ${e.shape}`;
  if (e.kind === "slot") return `${e.slot[0]!.toUpperCase()}${e.slot.slice(1)} place`;
  if (e.kind === "icon") return `Icon: ${e.icon}`;
  return e.kind[0]!.toUpperCase() + e.kind.slice(1);
}
// A style string (from the shared page drawing) as React style.
function cssOf(s: string): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const part of s.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[k] = part.slice(i + 1).trim();
  }
  return out as React.CSSProperties;
}

function Thumb({ d, p, width, values, extras }: { d: Design; p: DPage; width: number; values: Record<string, string>; extras: Extras }) {
  const k = width / (d.w * MM);
  return (
    <div className="overflow-hidden rounded border bg-white" style={{ width, height: d.h * MM * k }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: "0 0", width: `${d.w}mm`, height: `${d.h}mm` }} dangerouslySetInnerHTML={{ __html: pageHtml(d, p, values, { ...extras, editing: true }) }} />
    </div>
  );
}

function Handles({ kind, zoom, onResize, onRotate }: { kind: DElement["kind"]; zoom: number; onResize: (e: React.PointerEvent, h: string) => void; onRotate: (e: React.PointerEvent) => void }) {
  const size = 2.4 / Math.max(0.5, zoom);
  const hs = kind === "line" ? ["w", "e"] : kind === "text" ? ["nw", "ne", "sw", "se", "e", "w", "s", "n"] : ["nw", "ne", "sw", "se", "n", "s", "e", "w"];
  const pos: Record<string, React.CSSProperties> = {
    nw: { left: 0, top: 0, cursor: "nwse-resize" },
    ne: { left: "100%", top: 0, cursor: "nesw-resize" },
    sw: { left: 0, top: "100%", cursor: "nesw-resize" },
    se: { left: "100%", top: "100%", cursor: "nwse-resize" },
    n: { left: "50%", top: 0, cursor: "ns-resize" },
    s: { left: "50%", top: "100%", cursor: "ns-resize" },
    e: { left: "100%", top: "50%", cursor: "ew-resize" },
    w: { left: 0, top: "50%", cursor: "ew-resize" },
  };
  return (
    <>
      {hs.map((h) => (
        <span key={h} onPointerDown={(e) => onResize(e, h)} className="absolute z-10 rounded-full border border-primary bg-white" style={{ ...pos[h], width: `${size}mm`, height: `${size}mm`, transform: "translate(-50%,-50%)" }} />
      ))}
      {kind !== "line" && (
        <span onPointerDown={onRotate} title="Rotate (Shift for free rotation)" className="absolute left-1/2 z-10 flex items-center justify-center rounded-full border border-primary bg-white" style={{ top: `-${size * 3}mm`, width: `${size * 1.4}mm`, height: `${size * 1.4}mm`, transform: "translateX(-50%)", cursor: "grab" }}>
          <span className="block size-[40%] rounded-full bg-primary" />
        </span>
      )}
    </>
  );
}

function EditableText({ el, onDone }: { el: DText & DElement; onDone: (t: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const n = ref.current;
    if (!n) return;
    n.innerText = el.text;
    n.focus();
    const r = document.createRange();
    r.selectNodeContents(n);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      aria-label="Text"
      className="size-full cursor-text outline-none"
      style={cssOf(textCss(el))}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.currentTarget.innerText.replace(/\n$/, ""))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") (e.currentTarget as HTMLElement).blur();
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
function MenuBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
      <FileImageIcon className="size-3.5 text-muted-foreground" /> {label}
    </button>
  );
}

function Swatches({ palette, custom, value, onPick, none }: { palette: string[]; custom: boolean; value?: string | null; onPick: (c: string | null) => void; none?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {none && <button type="button" aria-label="None" className={cn("size-6 rounded border bg-[linear-gradient(135deg,transparent_45%,#dc2626_45%,#dc2626_55%,transparent_55%)]", !value && "ring-2 ring-primary")} onClick={() => onPick(null)} />}
      {palette.map((c) => (
        <button key={c} type="button" aria-label={c} className={cn("size-6 rounded border", value?.toLowerCase() === c.toLowerCase() && "ring-2 ring-primary ring-offset-1")} style={{ background: c }} onClick={() => onPick(c)} />
      ))}
      {custom && <input type="color" aria-label="Any colour" value={value ?? "#000000"} onChange={(e) => onPick(e.target.value)} className="h-6 w-8 cursor-pointer rounded border p-0" />}
    </div>
  );
}

function ColorPop({ icon: Icon, label, value, palette, custom, onPick, none }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null; palette: string[]; custom: boolean; onPick: (c: string | null) => void; none?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title={label} aria-label={label} className="inline-flex h-8 w-9 flex-col items-center justify-center rounded-md hover:bg-muted">
          <Icon className="size-3.5" />
          <span className="mt-0.5 h-1 w-5 rounded-sm" style={{ background: value ?? "transparent", boxShadow: value ? undefined : "inset 0 0 0 1px #cbd5e1" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <Swatches palette={palette} custom={custom} value={value} onPick={onPick} none={none} />
      </PopoverContent>
    </Popover>
  );
}

function Num({ label, value, onChange, step = 1, min, max, w = "w-16" }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; w?: string }) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title={label}>
      {label}
      <Input type="number" className={cn("h-7 px-1 text-xs", w)} value={Math.round(value * 10) / 10} step={step} min={min} max={max} onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))} />
    </label>
  );
}

// The bar above the page for what is selected.
function ContextBar(p: {
  el: DElement | null;
  count: number;
  fonts: string[];
  palette: string[];
  custom: boolean;
  onPatch: (x: Partial<DElement>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onArrange: (h: "front" | "back" | "forward" | "backward") => void;
  onAlign: (h: "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom") => void;
  onDistribute: (a: "x" | "y") => void;
  onGroup: () => void;
  onUngroup: () => void;
  grouped: boolean;
  frozen: boolean;
  locked: boolean;
  onToggleLock: () => void;
}) {
  const e = p.el;
  const tb = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40";
  const patch = (x: Record<string, unknown>) => p.onPatch(x as Partial<DElement>);
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex h-11 items-center gap-0.5 overflow-x-auto border-b bg-background px-2">
      {e?.kind === "text" && (
        <>
          <select className="h-8 w-36 rounded-md border bg-background px-1 text-xs" value={e.font} onChange={(x) => patch({ font: x.target.value })} aria-label="Font">
            {[...new Set([e.font, ...p.fonts])].map((f) => <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>{f}</option>)}
          </select>
          <div className="flex items-center">
            <button type="button" className={tb} aria-label="Smaller" onClick={() => patch({ size: Math.max(3, Math.round(e.size - 1)) })}><MinusIcon className="size-3.5" /></button>
            <Input type="number" className="h-8 w-14 px-1 text-center text-xs" value={e.size} onChange={(x) => patch({ size: Number(x.target.value) || e.size })} aria-label="Font size" />
            <button type="button" className={tb} aria-label="Bigger" onClick={() => patch({ size: Math.round(e.size + 1) })}><PlusIcon className="size-3.5" /></button>
          </div>
          <ColorPop icon={TypeIcon} label="Text colour" value={e.color} palette={p.palette} custom={p.custom} onPick={(c) => c && patch({ color: c })} />
          <button type="button" className={cn(tb, e.weight >= 700 && "bg-muted")} aria-label="Bold" onClick={() => patch({ weight: e.weight >= 700 ? 400 : 700 })}><BoldIcon className="size-4" /></button>
          <button type="button" className={cn(tb, e.italic && "bg-muted")} aria-label="Italic" onClick={() => patch({ italic: !e.italic })}><ItalicIcon className="size-4" /></button>
          <button type="button" className={cn(tb, e.underline && "bg-muted")} aria-label="Underline" onClick={() => patch({ underline: !e.underline })}><UnderlineIcon className="size-4" /></button>
          <button type="button" className={cn(tb, e.strike && "bg-muted")} aria-label="Strike through" onClick={() => patch({ strike: !e.strike })}><StrikethroughIcon className="size-4" /></button>
          <select className="h-8 rounded-md border bg-background px-1 text-xs" value={e.align} onChange={(x) => patch({ align: x.target.value })} aria-label="Alignment">
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
            <option value="justify">Justify</option>
          </select>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 text-xs">Spacing and effects</Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2 text-xs" align="start">
              <div className="grid grid-cols-2 gap-2">
                <Num label="Line" value={e.lineHeight} step={0.05} min={0.7} max={4} onChange={(v) => patch({ lineHeight: v })} />
                <Num label="Letters" value={e.letterSpacing ?? 0} step={0.5} onChange={(v) => patch({ letterSpacing: v })} />
                <Num label="Padding mm" value={e.padding ?? 0} step={0.5} min={0} onChange={(v) => patch({ padding: v })} />
                <select className="h-7 rounded border bg-background px-1" value={e.weight} onChange={(x) => patch({ weight: Number(x.target.value) })} aria-label="Weight">
                  {[400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>Weight {w}</option>)}
                </select>
                <select className="h-7 rounded border bg-background px-1" value={e.valign ?? "top"} onChange={(x) => patch({ valign: x.target.value })} aria-label="Vertical position">
                  <option value="top">Top</option>
                  <option value="middle">Middle</option>
                  <option value="bottom">Bottom</option>
                </select>
                <select className="h-7 rounded border bg-background px-1" value={e.list ?? "none"} onChange={(x) => patch({ list: x.target.value })} aria-label="List">
                  <option value="none">No list</option>
                  <option value="bullet">Bullets</option>
                  <option value="number">Numbers</option>
                </select>
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!e.uppercase} onChange={(x) => patch({ uppercase: x.target.checked })} /> Capital letters</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!e.shadow} onChange={(x) => patch({ shadow: x.target.checked })} /> Shadow</label>
              <div className="flex items-center gap-2">Highlight <Swatches palette={p.palette} custom={p.custom} value={e.bg} onPick={(c) => patch({ bg: c })} none /></div>
              <div className="flex items-center gap-2">Outline <Swatches palette={p.palette} custom={p.custom} value={e.outline} onPick={(c) => patch({ outline: c })} none /></div>
            </PopoverContent>
          </Popover>
        </>
      )}
      {e?.kind === "shape" && (
        <>
          <ColorPop icon={PaintBucketIcon} label="Fill" value={e.fill} palette={p.palette} custom={p.custom} onPick={(c) => patch({ fill: c, gradient: null })} none />
          <ColorPop icon={SquareIcon} label="Border" value={e.stroke} palette={p.palette} custom={p.custom} onPick={(c) => patch({ stroke: c })} none />
          <Num label="Border" value={e.strokeWidth} step={0.1} min={0} onChange={(v) => patch({ strokeWidth: v })} />
          {e.shape === "rect" && <Num label="Corners" value={e.radius ?? 0} step={0.5} min={0} onChange={(v) => patch({ radius: v })} />}
          <label className="flex items-center gap-1 px-1 text-xs"><input type="checkbox" checked={!!e.dash} onChange={(x) => patch({ dash: x.target.checked })} /> Dashed</label>
          <select className="h-8 rounded-md border bg-background px-1 text-xs" value={e.gradient ?? ""} onChange={(x) => patch({ gradient: x.target.value || null })} aria-label="Gradient">
            <option value="">No gradient</option>
            {GRADIENTS.map((g) => <option key={g} value={g}>{g.replace("linear-gradient(", "").replace(")", "")}</option>)}
          </select>
        </>
      )}
      {e?.kind === "line" && (
        <>
          <ColorPop icon={SquareIcon} label="Colour" value={e.stroke} palette={p.palette} custom={p.custom} onPick={(c) => c && patch({ stroke: c })} />
          <Num label="Width" value={e.strokeWidth} step={0.1} min={0.1} onChange={(v) => patch({ strokeWidth: v })} />
          <label className="flex items-center gap-1 px-1 text-xs"><input type="checkbox" checked={!!e.dash} onChange={(x) => patch({ dash: x.target.checked })} /> Dashed</label>
          <label className="flex items-center gap-1 px-1 text-xs"><input type="checkbox" checked={!!e.arrowStart} onChange={(x) => patch({ arrowStart: x.target.checked })} /> Start arrow</label>
          <label className="flex items-center gap-1 px-1 text-xs"><input type="checkbox" checked={!!e.arrowEnd} onChange={(x) => patch({ arrowEnd: x.target.checked })} /> End arrow</label>
        </>
      )}
      {e?.kind === "image" && (
        <>
          <select className="h-8 rounded-md border bg-background px-1 text-xs" value={e.fit} onChange={(x) => patch({ fit: x.target.value })} aria-label="Fit">
            <option value="cover">Fill the box</option>
            <option value="contain">Fit inside</option>
          </select>
          <Num label="Corners" value={e.radius ?? 0} step={0.5} min={0} onChange={(v) => patch({ radius: v })} />
          <select className="h-8 rounded-md border bg-background px-1 text-xs" value={e.filter ?? "none"} onChange={(x) => patch({ filter: x.target.value })} aria-label="Filter">
            {["none", "grayscale", "sepia", "bright", "dark", "blur"].map((f) => <option key={f} value={f}>{f === "none" ? "No filter" : f}</option>)}
          </select>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => patch({ flipX: !e.flipX })}>Flip across</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => patch({ flipY: !e.flipY })}>Flip up and down</Button>
          <ColorPop icon={SquareIcon} label="Frame" value={e.border} palette={p.palette} custom={p.custom} onPick={(c) => patch({ border: c, borderWidth: c ? Math.max(0.5, e.borderWidth ?? 0) : 0 })} none />
        </>
      )}
      {e?.kind === "icon" && <ColorPop icon={StarIcon} label="Colour" value={e.color} palette={p.palette} custom={p.custom} onPick={(c) => c && patch({ color: c })} />}
      {e?.kind === "table" && <TableEdit el={e} palette={p.palette} custom={p.custom} onPatch={patch} />}
      {e?.kind === "qr" && <Input className="h-8 w-64 text-xs" placeholder="Link or text (empty: the letter's verification code)" value={e.value ?? ""} onChange={(x) => patch({ value: x.target.value })} />}
      {e?.kind === "slot" && <Input className="h-8 w-48 text-xs" value={e.label ?? ""} onChange={(x) => patch({ label: x.target.value })} aria-label="Label" />}
      {e && (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 text-xs">Position</Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-2" align="start">
            <div className="grid grid-cols-2 gap-2">
              <Num label="X mm" value={e.x} onChange={(v) => patch({ x: v })} />
              <Num label="Y mm" value={e.y} onChange={(v) => patch({ y: v })} />
              <Num label="Width" value={e.w} min={1} onChange={(v) => patch({ w: v })} />
              <Num label="Height" value={e.h} min={0} onChange={(v) => patch({ h: v })} />
              <Num label="Rotate°" value={e.rotate} onChange={(v) => patch({ rotate: v })} />
              <Num label="Opacity %" value={Math.round(e.opacity * 100)} min={0} max={100} onChange={(v) => patch({ opacity: Math.min(1, Math.max(0, v / 100)) })} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <LinkIcon className="size-3.5" />
              <Input className="h-7 text-xs" placeholder="Link (https://…)" value={e.link ?? ""} onChange={(x) => patch({ link: /^(https?:\/\/|mailto:|tel:)/i.test(x.target.value) ? x.target.value : x.target.value ? e.link : null })} />
            </label>
          </PopoverContent>
        </Popover>
      )}
      <span className="mx-1 h-5 w-px shrink-0 bg-border" />
      <button type="button" className={tb} title="Align left" aria-label="Align left" onClick={() => p.onAlign("left")}><AlignStartVerticalIcon className="size-4" /></button>
      <button type="button" className={tb} title="Centre across" aria-label="Centre across" onClick={() => p.onAlign("hcenter")}><AlignCenterVerticalIcon className="size-4" /></button>
      <button type="button" className={tb} title="Align right" aria-label="Align right" onClick={() => p.onAlign("right")}><AlignEndVerticalIcon className="size-4" /></button>
      <button type="button" className={tb} title="Align top" aria-label="Align top" onClick={() => p.onAlign("top")}><AlignStartHorizontalIcon className="size-4" /></button>
      <button type="button" className={tb} title="Centre up and down" aria-label="Centre up and down" onClick={() => p.onAlign("vmiddle")}><AlignCenterHorizontalIcon className="size-4" /></button>
      <button type="button" className={tb} title="Align bottom" aria-label="Align bottom" onClick={() => p.onAlign("bottom")}><AlignEndHorizontalIcon className="size-4" /></button>
      {p.count >= 3 && (
        <>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => p.onDistribute("x")}>Space across</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => p.onDistribute("y")}>Space down</Button>
        </>
      )}
      <span className="mx-1 h-5 w-px shrink-0 bg-border" />
      <button type="button" className={tb} title="Bring to front (Ctrl+])" aria-label="Bring to front" onClick={() => p.onArrange("front")}><BringToFrontIcon className="size-4" /></button>
      <button type="button" className={tb} title="Send to back (Ctrl+[)" aria-label="Send to back" onClick={() => p.onArrange("back")}><SendToBackIcon className="size-4" /></button>
      {p.count > 1 && !p.grouped && <button type="button" className={tb} title="Group (Ctrl+G)" aria-label="Group" onClick={p.onGroup}><GroupIcon className="size-4" /></button>}
      {p.grouped && <button type="button" className={tb} title="Ungroup (Ctrl+Shift+G)" aria-label="Ungroup" onClick={p.onUngroup}><UngroupIcon className="size-4" /></button>}
      <button type="button" className={tb} title={p.locked ? "Unlock" : "Lock"} aria-label={p.locked ? "Unlock" : "Lock"} onClick={p.onToggleLock} disabled={p.frozen}>{p.locked ? <LockIcon className="size-4" /> : <UnlockIcon className="size-4" />}</button>
      <button type="button" className={tb} title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={p.onDuplicate} disabled={p.frozen}><CopyIcon className="size-4" /></button>
      <button type="button" className={tb} title="Delete" aria-label="Delete" onClick={p.onDelete} disabled={p.frozen}><Trash2Icon className="size-4" /></button>
      <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{p.count > 1 ? `${p.count} selected` : e ? layerName(e) : ""}</span>
    </div>
  );
}

function TableEdit({ el, palette, custom, onPatch }: { el: Extract<DElement, { kind: "table" }>; palette: string[]; custom: boolean; onPatch: (x: Record<string, unknown>) => void }) {
  const width = el.rows[0]?.length ?? 1;
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 text-xs">
            <TableIcon /> Edit cells
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[34rem] max-w-[90vw] space-y-2" align="start">
          <div className="max-h-72 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <tbody>
                {el.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className="border p-0">
                        <input className={cn("w-full min-w-16 bg-transparent px-1 py-0.5 outline-none", i === 0 && el.header && "font-semibold")} value={c} onChange={(x) => onPatch({ rows: el.rows.map((row, a) => (a === i ? row.map((v, b) => (b === j ? x.target.value : v)) : row)) })} aria-label={`Row ${i + 1}, column ${j + 1}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPatch({ rows: [...el.rows, Array(width).fill("")], h: el.h + el.h / el.rows.length })}>+ Row</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPatch({ rows: el.rows.map((r) => [...r, ""]) })}>+ Column</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={el.rows.length < 2} onClick={() => onPatch({ rows: el.rows.slice(0, -1), h: el.h - el.h / el.rows.length })}>− Row</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={width < 2} onClick={() => onPatch({ rows: el.rows.map((r) => r.slice(0, -1)) })}>− Column</Button>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={el.header} onChange={(x) => onPatch({ header: x.target.checked })} /> Header row</label>
          </div>
        </PopoverContent>
      </Popover>
      <Num label="Size" value={el.size} min={4} max={60} onChange={(v) => onPatch({ size: v })} w="w-12" />
      <ColorPop icon={PaintBucketIcon} label="Header colour" value={el.headFill} palette={palette} custom={custom} onPick={(c) => c && onPatch({ headFill: c })} />
      <ColorPop icon={TypeIcon} label="Header text" value={el.headColor} palette={palette} custom={custom} onPick={(c) => c && onPatch({ headColor: c })} />
      <ColorPop icon={SquareIcon} label="Lines" value={el.border} palette={palette} custom={custom} onPick={(c) => c && onPatch({ border: c })} />
      <ColorPop icon={PaintBucketIcon} label="Stripes" value={el.stripe} palette={palette} custom={custom} onPick={(c) => onPatch({ stripe: c })} none />
    </>
  );
}
