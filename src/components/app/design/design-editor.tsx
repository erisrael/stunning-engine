"use client";

// The design editor, laid out as Word and PowerPoint (a ribbon with Home, Insert, Design, Arrange and View, a pages
// pane, a Format pane and a status bar with zoom), with Canva's ease: pages you draw on with text, pictures, shapes, lines, icons, tables, QR codes and
// the letter's signature and stamp places. Drag to move (with smart guides that snap to the page and to other
// elements), handles to resize and rotate, double-click to type, layers, grouping, alignment and distribution,
// copy and paste, undo and redo, zoom, pages, backgrounds and brand colours, and a preview that shows the design as
// it will print. What is offered follows the options Admin set (Admin, Tools hub, Design editor).

import * as React from "react";
import {
  AArrowDownIcon, AArrowUpIcon, AlignCenterHorizontalIcon, AlignCenterIcon, AlignCenterVerticalIcon, AlignEndHorizontalIcon, AlignEndVerticalIcon, AlignHorizontalSpaceAroundIcon, AlignJustifyIcon, AlignLeftIcon, AlignRightIcon, AlignStartHorizontalIcon, AlignStartVerticalIcon, AlignVerticalSpaceAroundIcon, ArrowDownIcon, ArrowDownToLineIcon, ArrowUpIcon, ArrowUpToLineIcon, BoldIcon, BringToFrontIcon, CalendarIcon, CaseUpperIcon, CopyIcon, DownloadIcon, EyeIcon, EyeOffIcon, FileImageIcon, FilePlusIcon, FlipHorizontalIcon, FlipVerticalIcon, FoldVerticalIcon, FrameIcon, GridIcon, GroupIcon, HashIcon, HeadingIcon, HighlighterIcon, ImageIcon, ImagePlusIcon, ItalicIcon, LayoutTemplateIcon, ListIcon, ListOrderedIcon, LockIcon, MagnetIcon, MinusIcon, MoveLeftIcon, MoveRightIcon, PaintBucketIcon, PaintbrushIcon, PanelLeftIcon, PanelRightIcon, PencilRulerIcon, PlusIcon, QrCodeIcon, QuoteIcon, Redo2Icon, ReplaceIcon, RotateCcwIcon, RotateCwIcon, ScanIcon, SendToBackIcon, ShapesIcon, SignatureIcon, SparklesIcon, SquareIcon, StampIcon, StarIcon, StrikethroughIcon, TableIcon, Trash2Icon, TypeIcon, UnderlineIcon, UngroupIcon, Undo2Icon, UnlockIcon, XIcon, ZoomInIcon, ZoomOutIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [tab, setTab] = React.useState<"home" | "insert" | "design" | "arrange" | "view" | "format">("home");
  const [showFormat, setShowFormat] = React.useState(true);
  const [showPages, setShowPages] = React.useState(true);
  const [tplOpen, setTplOpen] = React.useState(false);
  const [painting, setPainting] = React.useState(false);
  const painter = React.useRef<Partial<DElement> | null>(null);
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
  const frozen = (e: DElement) => !!e.locked && options.lockLetterhead && !!e.name?.startsWith("Letterhead");

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
    if (k === "escape") return void (setSel([]), setPainting(false));
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

  // Fit the page to the canvas width (and height for wide pages such as slides), leaving room around it.
  const fitZoom = () => {
    const el = scroller.current;
    const w = (el?.clientWidth ?? 800) - 72;
    const h = (el?.clientHeight ?? 600) - 72;
    const byW = w / (d.w * MM);
    const byH = d.w > d.h ? h / (d.h * MM) : byW;
    setZoom(Math.max(0.2, Math.min(2.5, Math.floor(Math.min(byW, byH) * 20) / 20)));
  };
  React.useEffect(() => {
    fitZoom();
    const el = scroller.current;
    if (!el) return;
    let last = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - last) > 40) (last = el.clientWidth), fitZoom();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.w, d.h, showPages, showFormat, mode]);
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

  const ex = { ...extras, editing: mode === "design" };
  const txt = one?.kind === "text" ? (one as DText & DElement) : null;
  const patchText = (p: Partial<DText>) => txt && updateOne(p as Partial<DElement>);
  // Text styles, as Word's Styles gallery.
  const STYLES: { label: string; p: Partial<DText> }[] = [
    { label: "Title", p: { size: 30, weight: 700, italic: false, color: palette[1] ?? "#0f172a" } },
    { label: "Heading 1", p: { size: 20, weight: 700, italic: false, color: palette[1] ?? "#0f172a" } },
    { label: "Heading 2", p: { size: 15, weight: 600, italic: false, color: palette[0] ?? "#16a34a" } },
    { label: "Normal", p: { size: 11, weight: 400, italic: false, color: "#111827", lineHeight: 1.45 } },
    { label: "Caption", p: { size: 8.5, weight: 400, italic: false, color: "#64748b" } },
    { label: "Quote", p: { size: 14, weight: 400, italic: true, color: "#475569" } },
  ];
  // Format painter: copy how one element looks and paint it on the next one clicked.
  const STYLE_KEYS = ["font", "size", "weight", "italic", "underline", "strike", "color", "align", "valign", "lineHeight", "letterSpacing", "uppercase", "bg", "padding", "shadow", "outline", "fill", "stroke", "strokeWidth", "radius", "dash", "gradient", "opacity", "filter", "border", "borderWidth", "headFill", "headColor", "stripe"];
  const pickStyle = () => {
    if (!one) return;
    painter.current = Object.fromEntries(Object.entries(one).filter(([k]) => STYLE_KEYS.includes(k))) as Partial<DElement>;
    setPainting(true);
  };
  const paintOn = (e: DElement) => {
    const st = painter.current;
    setPainting(false);
    if (!st || frozen(e)) return;
    const keep = Object.fromEntries(Object.entries(st).filter(([k]) => k in e || ["bg", "shadow", "outline", "gradient", "dash", "filter", "border", "borderWidth", "stripe"].includes(k)));
    update([e.id], (x) => ({ ...x, ...keep }) as DElement);
    setSel([e.id]);
  };
  // Find and replace across every text box and table in the design.
  const replaceText = (q: string, r: string) => {
    if (!q) return 0;
    let n = 0;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const fix = (t: string) => t.replace(re, () => (n++, r));
    commit({ ...design, pages: design.pages.map((p) => ({ ...p, elements: p.elements.map((e) => (e.kind === "text" ? { ...e, text: fix(e.text) } : e.kind === "table" ? { ...e, rows: e.rows.map((row) => row.map(fix)) } : e)) })) });
    return n;
  };
  const rotateSel = (deg: number) => update(sel, (e) => ({ ...e, rotate: ((((e.rotate + deg) % 360) + 540) % 360) - 180 }));
  const insertAt = (e: DElement) => add(e);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const RTAB = ["home", "insert", "design", "arrange", "view"] as const;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-background shadow-sm" onKeyDown={onKey} tabIndex={-1}>
      {options.webFonts && <style>{`@import url("https://fonts.googleapis.com/css2?${WEB_FONTS.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,400;0,600;0,700;1,400`).join("&")}&display=swap");`}</style>}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={(e) => (e.target.files?.[0] && upload(e.target.files[0], addImage), (e.target.value = ""))} />

      {/* Title bar: quick access, tabs, mode and download (as Office) */}
      <div className="flex items-center gap-1 border-b bg-muted/40 px-2">
        {mode === "design" && (
          <>
            <button type="button" className={qa} onClick={undo} disabled={!past.current.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2Icon className="size-4" /></button>
            <button type="button" className={qa} onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2Icon className="size-4" /></button>
            <span className="mx-1 h-5 w-px bg-border" />
            <div role="tablist" aria-label="Ribbon" className="flex">
              {RTAB.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] capitalize", tab === k ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {k}
                </button>
              ))}
              {selected.length > 0 && (
                <button type="button" role="tab" aria-selected={tab === "format"} onClick={() => setTab("format")} className={cn("-mb-px border-b-2 px-3 py-2 text-[13px]", tab === "format" ? "border-primary font-medium text-primary" : "border-transparent text-primary/80 hover:text-primary")}>
                  {txt ? "Text format" : one?.kind === "image" ? "Picture format" : one?.kind === "table" ? "Table design" : "Shape format"}
                </button>
              )}
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5 py-1">
          {options.allowModeSwitch && (
            <div className="inline-flex rounded-md border bg-background p-0.5 text-xs" role="tablist" aria-label="Mode">
              <button type="button" role="tab" aria-selected={mode === "design"} className={cn("inline-flex items-center gap-1 rounded px-2 py-1", mode === "design" && "bg-primary text-primary-foreground")} onClick={() => setMode("design")}>
                <PencilRulerIcon className="size-3.5" /> Edit
              </button>
              <button type="button" role="tab" aria-selected={mode === "preview"} className={cn("inline-flex items-center gap-1 rounded px-2 py-1", mode === "preview" && "bg-primary text-primary-foreground")} onClick={() => setMode("preview")}>
                <EyeIcon className="size-3.5" /> Preview
              </button>
            </div>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" className="h-8" disabled={!!busy}>
                <DownloadIcon /> {busy ? "Exporting…" : "Download"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-1">
              {options.exports.pdf && <MenuBtn onClick={() => exportAs("pdf")} label="PDF document (print, Save as PDF)" />}
              {options.exports.docx && <MenuBtn onClick={() => exportAs("docx")} label="Word document (.docx)" />}
              {options.exports.pptx && <MenuBtn onClick={() => exportAs("pptx")} label="PowerPoint (.pptx), editable" />}
              {options.exports.png && <MenuBtn onClick={() => exportAs("png")} label={d.pages.length > 1 ? "PNG, every page (.zip)" : "PNG picture"} />}
              {options.exports.png && d.pages.length > 1 && <MenuBtn onClick={() => exportAs("pagepng")} label={`PNG, page ${page + 1} only`} />}
              {options.exports.jpeg && <MenuBtn onClick={() => exportAs("jpeg")} label="JPEG picture" />}
              {options.exports.svg && <MenuBtn onClick={() => exportAs("svg")} label={`SVG, page ${page + 1}`} />}
              <MenuBtn onClick={() => download(new Blob([JSON.stringify(design)], { type: "application/json" }), `${title.replace(/[^\w\- ]+/g, "") || "design"}.myseed-design.json`)} label="Design file (.json), to open again" />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Ribbon */}
      {mode === "design" && (
        <div className="flex min-h-[5.25rem] items-stretch gap-0 overflow-x-auto border-b bg-background px-1 py-1">
          {tab === "home" && (
            <>
              <RGroup label="Clipboard">
                <RBig icon={CopyIcon} label="Duplicate" onClick={() => duplicate()} disabled={!selected.length} />
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={PaintbrushIcon} label={painting ? "Click a target" : "Format painter"} onClick={pickStyle} active={painting} disabled={!one} />
                  <RSmall icon={Trash2Icon} label="Delete" onClick={removeSel} disabled={!selected.length} />
                </div>
              </RGroup>
              <RGroup label="Font">
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">
                    <select className="h-7 w-36 rounded border bg-background px-1 text-xs disabled:opacity-50" disabled={!txt} value={txt?.font ?? "Inter"} onChange={(e) => patchText({ font: e.target.value })} aria-label="Font">
                      {[...new Set([txt?.font ?? "Inter", ...fonts])].map((f) => <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>{f}</option>)}
                    </select>
                    <select className="h-7 w-16 rounded border bg-background px-1 text-xs disabled:opacity-50" disabled={!txt} value={txt?.size ?? 12} onChange={(e) => patchText({ size: Number(e.target.value) })} aria-label="Font size">
                      {[...new Set([txt?.size ?? 12, 8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72, 96])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <RIcon icon={AArrowUpIcon} label="Grow font" onClick={() => txt && patchText({ size: Math.round(txt.size * 1.1 + 0.5) })} disabled={!txt} />
                    <RIcon icon={AArrowDownIcon} label="Shrink font" onClick={() => txt && patchText({ size: Math.max(4, Math.round(txt.size / 1.1)) })} disabled={!txt} />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <RIcon icon={BoldIcon} label="Bold (Ctrl+B)" active={!!txt && txt.weight >= 700} onClick={() => txt && patchText({ weight: txt.weight >= 700 ? 400 : 700 })} disabled={!txt} />
                    <RIcon icon={ItalicIcon} label="Italic" active={!!txt?.italic} onClick={() => patchText({ italic: !txt?.italic })} disabled={!txt} />
                    <RIcon icon={UnderlineIcon} label="Underline" active={!!txt?.underline} onClick={() => patchText({ underline: !txt?.underline })} disabled={!txt} />
                    <RIcon icon={StrikethroughIcon} label="Strike through" active={!!txt?.strike} onClick={() => patchText({ strike: !txt?.strike })} disabled={!txt} />
                    <RIcon icon={CaseUpperIcon} label="Capitals" active={!!txt?.uppercase} onClick={() => patchText({ uppercase: !txt?.uppercase })} disabled={!txt} />
                    <ColorPop icon={TypeIcon} label="Font colour" value={txt?.color} palette={palette} custom={options.allowCustomColors} onPick={(c) => c && patchText({ color: c })} />
                    <ColorPop icon={HighlighterIcon} label="Highlight" value={txt?.bg} palette={palette} custom={options.allowCustomColors} onPick={(c) => patchText({ bg: c })} none />
                  </div>
                </div>
              </RGroup>
              <RGroup label="Paragraph">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-0.5">
                    <RIcon icon={ListIcon} label="Bullets" active={txt?.list === "bullet"} onClick={() => patchText({ list: txt?.list === "bullet" ? "none" : "bullet" })} disabled={!txt} />
                    <RIcon icon={ListOrderedIcon} label="Numbering" active={txt?.list === "number"} onClick={() => patchText({ list: txt?.list === "number" ? "none" : "number" })} disabled={!txt} />
                    <select className="h-7 rounded border bg-background px-1 text-xs disabled:opacity-50" disabled={!txt} value={txt?.lineHeight ?? 1.35} onChange={(e) => patchText({ lineHeight: Number(e.target.value) })} aria-label="Line spacing" title="Line spacing">
                      {[...new Set([txt?.lineHeight ?? 1.35, 1, 1.15, 1.35, 1.5, 2, 2.5])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n.toFixed(2)}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {([["left", AlignLeftIcon], ["center", AlignCenterIcon], ["right", AlignRightIcon], ["justify", AlignJustifyIcon]] as const).map(([a, I]) => (
                      <RIcon key={a} icon={I} label={`Align ${a}`} active={txt?.align === a} onClick={() => patchText({ align: a })} disabled={!txt} />
                    ))}
                    {([["top", ArrowUpToLineIcon], ["middle", FoldVerticalIcon], ["bottom", ArrowDownToLineIcon]] as const).map(([a, I]) => (
                      <RIcon key={a} icon={I} label={`Text to the ${a}`} active={(txt?.valign ?? "top") === a && !!txt} onClick={() => patchText({ valign: a })} disabled={!txt} />
                    ))}
                  </div>
                </div>
              </RGroup>
              <RGroup label="Styles">
                <div className="grid grid-cols-3 gap-1">
                  {STYLES.map((s) => (
                    <button key={s.label} type="button" disabled={!txt} onClick={() => patchText(s.p)} className="h-7 w-[4.6rem] truncate rounded border bg-background px-1 text-left disabled:opacity-40 hover:border-primary" style={{ fontSize: Math.min(13, Math.max(9, (s.p.size ?? 11) / 2 + 4)), fontWeight: s.p.weight, fontStyle: s.p.italic ? "italic" : undefined, color: s.p.color }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </RGroup>
              <RGroup label="Drawing">
                <ShapeGallery onPick={(s) => insertAt(shapeEl(s, 0, 0, s === "pill" ? 50 : 40, s === "pill" ? 14 : s === "arrow" ? 22 : 40, { fill: palette[0] ?? "#16a34a" }))} disabled={!options.allowShapes} />
                <div className="flex flex-col gap-0.5">
                  <ColorPop icon={PaintBucketIcon} label="Shape fill" value={one && one.kind === "shape" ? one.fill : null} palette={palette} custom={options.allowCustomColors} onPick={(c) => one?.kind === "shape" && updateOne({ fill: c, gradient: null } as Partial<DElement>)} none />
                  <ColorPop icon={SquareIcon} label="Shape outline" value={one && one.kind === "shape" ? one.stroke : null} palette={palette} custom={options.allowCustomColors} onPick={(c) => one?.kind === "shape" && updateOne({ stroke: c } as Partial<DElement>)} none />
                </div>
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={BringToFrontIcon} label="Bring to front" onClick={() => arrange("front")} disabled={!selected.length} />
                  <RSmall icon={SendToBackIcon} label="Send to back" onClick={() => arrange("back")} disabled={!selected.length} />
                </div>
              </RGroup>
              <RGroup label="Editing">
                <FindReplace onReplace={replaceText} />
              </RGroup>
            </>
          )}
          {tab === "insert" && (
            <>
              <RGroup label="Pages">
                <RBig icon={FilePlusIcon} label="New page" onClick={() => setPages([...d.pages.slice(0, page + 1), { id: did(), bg: cur.bg, bgGradient: cur.bgGradient, elements: cur.elements.filter((e) => e.name?.startsWith("Letterhead")).map((e) => ({ ...structuredClone(e), id: did() })) }, ...d.pages.slice(page + 1)], page + 1)} disabled={d.pages.length >= options.maxPages} />
                <RBig icon={CopyIcon} label="Duplicate page" onClick={() => setPages([...d.pages.slice(0, page + 1), { ...structuredClone(cur), id: did(), elements: cur.elements.map((e) => ({ ...structuredClone(e), id: did() })) }, ...d.pages.slice(page + 1)], page + 1)} disabled={d.pages.length >= options.maxPages} />
              </RGroup>
              <RGroup label="Text">
                <RBig icon={TypeIcon} label="Text box" onClick={() => insertAt(textEl("Click twice to type", 0, 0, Math.min(110, d.w - 30), 14, { size: 12 }))} />
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={HeadingIcon} label="Heading" onClick={() => insertAt(textEl("Heading", 0, 0, Math.min(150, d.w - 30), 14, { size: 24, weight: 700, color: palette[1] ?? "#0f172a" }))} />
                  <RSmall icon={ListIcon} label="Bulleted list" onClick={() => insertAt(textEl("First point\nSecond point\nThird point", 0, 0, 110, 24, { size: 12, list: "bullet", lineHeight: 1.5 }))} />
                  <RSmall icon={QuoteIcon} label="Quote" onClick={() => insertAt(textEl("“A sentence worth remembering.”", 0, 0, 120, 16, { size: 15, italic: true, color: "#475569", align: "center" }))} />
                </div>
              </RGroup>
              <RGroup label="Illustrations">
                {options.allowUploads && <RBig icon={ImagePlusIcon} label="Picture" onClick={() => fileRef.current?.click()} />}
                {extras.logo && <RBig icon={StarIcon} label="Logo" onClick={() => insertAt({ id: did(), kind: "image", src: "logo", fit: "contain", x: 20, y: 15, w: 25, h: 25, rotate: 0, opacity: 1 } as DElement)} />}
                {options.allowShapes && <ShapeGallery big onPick={(s) => insertAt(shapeEl(s, 0, 0, s === "pill" ? 50 : 40, s === "pill" ? 14 : s === "arrow" ? 22 : 40, { fill: palette[0] ?? "#16a34a" }))} />}
                {options.allowIcons && <IconGallery onPick={(k) => insertAt({ id: did(), kind: "icon", icon: k, color: palette[0] ?? "#16a34a", x: 0, y: 0, w: 14, h: 14, rotate: 0, opacity: 1 } as DElement)} />}
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={MinusIcon} label="Line" onClick={() => insertAt({ id: did(), kind: "line", stroke: "#0f172a", strokeWidth: 0.5, x: (d.w - 80) / 2, y: d.h / 2, w: 80, h: 2, rotate: 0, opacity: 1 } as DElement)} />
                  <RSmall icon={MoveRightIcon} label="Arrow" onClick={() => insertAt({ id: did(), kind: "line", stroke: "#0f172a", strokeWidth: 0.6, arrowEnd: true, x: (d.w - 60) / 2, y: d.h / 2, w: 60, h: 2, rotate: 0, opacity: 1 } as DElement)} />
                </div>
              </RGroup>
              {(options.allowTables || options.allowQr) && (
                <RGroup label="Tables and codes">
                  {options.allowTables && <TableGrid onPick={(r, c) => insertAt({ id: did(), kind: "table", rows: Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (i === 0 ? `Heading ${j + 1}` : ""))), header: true, font: "Inter", size: 10, color: "#111827", headFill: palette[1] ?? "#0f172a", headColor: "#ffffff", border: "#cbd5e1", stripe: "#f8fafc", x: 0, y: 0, w: Math.min(d.w - 30, c * 40), h: r * 8, rotate: 0, opacity: 1 } as DElement)} />}
                  {options.allowQr && <RBig icon={QrCodeIcon} label="QR code" onClick={() => insertAt({ id: did(), kind: "qr", x: 0, y: 0, w: 22, h: 22, rotate: 0, opacity: 1 } as DElement)} />}
                </RGroup>
              )}
              {slots && (
                <RGroup label="Letter places">
                  <RBig icon={SignatureIcon} label="Signature" onClick={() => insertAt({ id: did(), kind: "slot", slot: "signature", label: "Signature", x: 0, y: 0, w: 50, h: 18, rotate: 0, opacity: 1 } as DElement)} />
                  <RBig icon={StampIcon} label="Stamp" onClick={() => insertAt({ id: did(), kind: "slot", slot: "stamp", label: "Stamp", x: 0, y: 0, w: 32, h: 32, rotate: 0, opacity: 1 } as DElement)} />
                  <div className="flex flex-col gap-0.5">
                    <RSmall icon={CalendarIcon} label="Date" onClick={() => insertAt({ id: did(), kind: "slot", slot: "date", label: "Date", x: 0, y: 0, w: 50, h: 6, rotate: 0, opacity: 1 } as DElement)} />
                    <RSmall icon={HashIcon} label="Reference" onClick={() => insertAt({ id: did(), kind: "slot", slot: "reference", label: "Reference", x: 0, y: 0, w: 60, h: 6, rotate: 0, opacity: 1 } as DElement)} />
                  </div>
                </RGroup>
              )}
            </>
          )}
          {tab === "design" && (
            <>
              {templates.length > 0 && (
                <RGroup label="Templates">
                  <div className="flex gap-1.5">
                    {templates.slice(0, 6).map((t) => {
                      const td = t.design();
                      return (
                        <button key={t.key} type="button" title={t.hint ?? t.label} className="group flex flex-col items-center gap-0.5" onClick={() => confirm(`Start from "${t.label}"? This page set is replaced (Undo brings it back).`) && (commit(td), setPage(0), setSel([]))}>
                          <span className="rounded border group-hover:border-primary"><Thumb d={td} p={td.pages[0]!} height={46} values={values} extras={ex} /></span>
                          <span className="max-w-20 truncate text-[10px] text-muted-foreground">{t.label}</span>
                        </button>
                      );
                    })}
                    {templates.length > 6 && <RBig icon={LayoutTemplateIcon} label="More" onClick={() => setTplOpen(true)} />}
                  </div>
                </RGroup>
              )}
              {options.allowPageSize && (
                <RGroup label="Page">
                  <div className="flex flex-col gap-1">
                    <select
                      className="h-7 w-44 rounded border bg-background px-1 text-xs"
                      aria-label="Page size"
                      value={DESIGN_SIZES.find((s) => Math.abs(s.w - d.w) < 0.5 && Math.abs(s.h - d.h) < 0.5)?.key ?? "custom"}
                      onChange={(e) => {
                        const s = DESIGN_SIZES.find((x) => x.key === e.target.value);
                        if (!s) return;
                        const kx = s.w / d.w;
                        const ky = s.h / d.h;
                        commit({ ...design, w: s.w, h: s.h, pages: design.pages.map((p) => ({ ...p, elements: p.elements.map((el) => ({ ...el, x: round(el.x * kx), y: round(el.y * ky), w: round(el.w * kx), h: round(el.h * ky) }) as DElement) })) });
                      }}
                    >
                      {DESIGN_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      <option value="custom" hidden>Custom {Math.round(d.w)} × {Math.round(d.h)} mm</option>
                    </select>
                    <span className="text-[11px] text-muted-foreground">{Math.round(d.w)} × {Math.round(d.h)} mm</span>
                  </div>
                </RGroup>
              )}
              <RGroup label="Background">
                <div className="flex flex-col gap-1">
                  <Swatches palette={palette} custom={options.allowCustomColors} value={cur.bg} onPick={(c) => setPages(design.pages.map((p, i) => (i === page ? { ...p, bg: c ?? "#ffffff", bgGradient: null } : p)))} />
                  <div className="flex gap-1">
                    {GRADIENTS.slice(0, 6).map((g) => <button key={g} type="button" className="size-5 rounded border" style={{ background: g }} aria-label="Gradient" onClick={() => setPages(design.pages.map((p, i) => (i === page ? { ...p, bgGradient: g } : p)))} />)}
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  {options.allowBackgroundImage && (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-muted">
                      <ImageIcon className="size-3.5" /> Picture
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], (src) => setPages(design.pages.map((p, i) => (i === page ? { ...p, bgImage: src } : p))))} />
                    </label>
                  )}
                  {cur.bgImage && <RSmall icon={XIcon} label="Remove picture" onClick={() => setPages(design.pages.map((p, i) => (i === page ? { ...p, bgImage: null } : p)))} />}
                  <RSmall icon={CopyIcon} label="Apply to all pages" onClick={() => setPages(design.pages.map((p) => ({ ...p, bg: cur.bg, bgGradient: cur.bgGradient, bgImage: cur.bgImage })))} />
                </div>
              </RGroup>
            </>
          )}
          {tab === "arrange" && (
            <>
              <RGroup label="Arrange">
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={BringToFrontIcon} label="Bring to front" onClick={() => arrange("front")} disabled={!selected.length} />
                  <RSmall icon={ArrowUpIcon} label="Bring forward" onClick={() => arrange("forward")} disabled={!selected.length} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={SendToBackIcon} label="Send to back" onClick={() => arrange("back")} disabled={!selected.length} />
                  <RSmall icon={ArrowDownIcon} label="Send backward" onClick={() => arrange("backward")} disabled={!selected.length} />
                </div>
              </RGroup>
              <RGroup label={selected.length > 1 ? "Align to each other" : "Align to page"}>
                <div className="grid grid-cols-3 gap-0.5">
                  <RIcon icon={AlignStartVerticalIcon} label="Align left" onClick={() => alignSel("left")} disabled={!selected.length} />
                  <RIcon icon={AlignCenterVerticalIcon} label="Centre" onClick={() => alignSel("hcenter")} disabled={!selected.length} />
                  <RIcon icon={AlignEndVerticalIcon} label="Align right" onClick={() => alignSel("right")} disabled={!selected.length} />
                  <RIcon icon={AlignStartHorizontalIcon} label="Align top" onClick={() => alignSel("top")} disabled={!selected.length} />
                  <RIcon icon={AlignCenterHorizontalIcon} label="Middle" onClick={() => alignSel("vmiddle")} disabled={!selected.length} />
                  <RIcon icon={AlignEndHorizontalIcon} label="Align bottom" onClick={() => alignSel("bottom")} disabled={!selected.length} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={AlignHorizontalSpaceAroundIcon} label="Space across" onClick={() => distribute("x")} disabled={selected.length < 3} />
                  <RSmall icon={AlignVerticalSpaceAroundIcon} label="Space down" onClick={() => distribute("y")} disabled={selected.length < 3} />
                </div>
              </RGroup>
              <RGroup label="Group and rotate">
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={GroupIcon} label="Group (Ctrl+G)" onClick={group} disabled={selected.length < 2} />
                  <RSmall icon={UngroupIcon} label="Ungroup" onClick={ungroup} disabled={!selected.some((e) => e.group)} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={RotateCwIcon} label="Rotate right 90°" onClick={() => rotateSel(90)} disabled={!selected.length} />
                  <RSmall icon={RotateCcwIcon} label="Rotate left 90°" onClick={() => rotateSel(-90)} disabled={!selected.length} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={selected.length && selected.every((x) => x.locked) ? UnlockIcon : LockIcon} label={selected.length && selected.every((x) => x.locked) ? "Unlock" : "Lock"} onClick={() => update(sel, (e) => ({ ...e, locked: !selected.every((x) => x.locked) }))} disabled={!selected.length || selected.some(frozen)} />
                  <RSmall icon={EyeOffIcon} label="Hide" onClick={() => update(sel, (e) => ({ ...e, hidden: true }))} disabled={!selected.length} />
                </div>
              </RGroup>
            </>
          )}
          {tab === "view" && (
            <>
              <RGroup label="Zoom">
                <RBig icon={ZoomOutIcon} label="Smaller" onClick={() => setZoom((z) => Math.max(0.2, Math.round((z - 0.1) * 10) / 10))} />
                <RBig icon={ScanIcon} label="Fit" onClick={fitZoom} />
                <RBig icon={ZoomInIcon} label="Bigger" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))} />
              </RGroup>
              <RGroup label="Show">
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={GridIcon} label={`Grid (${options.gridSize} mm)`} active={grid} onClick={() => setGrid(!grid)} />
                  <RSmall icon={MagnetIcon} label="Snap to guides" active={snap} onClick={() => setSnap(!snap)} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <RSmall icon={PanelLeftIcon} label="Pages pane" active={showPages} onClick={() => setShowPages(!showPages)} />
                  <RSmall icon={PanelRightIcon} label="Format pane" active={showFormat} onClick={() => setShowFormat(!showFormat)} />
                </div>
              </RGroup>
            </>
          )}
          {tab === "format" && one && (
            <FormatRibbon el={one} palette={palette} custom={options.allowCustomColors} onPatch={updateOne} onReplaceImage={() => fileRef.current?.click()} />
          )}
        </div>
      )}

      <div className="flex min-h-0" style={{ height }}>
        {/* Pages pane (as PowerPoint's slide thumbnails) */}
        {showPages && (
          <div className="flex w-44 shrink-0 flex-col border-r bg-muted/20 max-md:hidden">
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {d.pages.map((p, i) => (
                <div key={p.id} className="flex gap-1.5">
                  <span className="w-4 pt-1 text-right text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <button type="button" className={cn("block w-full overflow-hidden rounded ring-offset-1", i === page ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-primary/50")} onClick={() => (setPage(i), pageRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" }))}>
                      <Thumb d={d} p={p} width={128} values={values} extras={ex} />
                    </button>
                    {i === page && mode === "design" && (
                      <div className="mt-1 flex justify-end gap-0.5">
                        <button type="button" className="rounded p-0.5 hover:bg-muted" aria-label="Move up" disabled={i === 0} onClick={() => setPages(d.pages.map((x, j) => (j === i - 1 ? p : j === i ? d.pages[i - 1]! : x)), i - 1)}><ArrowUpIcon className="size-3.5" /></button>
                        <button type="button" className="rounded p-0.5 hover:bg-muted" aria-label="Move down" disabled={i === d.pages.length - 1} onClick={() => setPages(d.pages.map((x, j) => (j === i + 1 ? p : j === i ? d.pages[i + 1]! : x)), i + 1)}><ArrowDownIcon className="size-3.5" /></button>
                        <button type="button" className="rounded p-0.5 hover:bg-muted" aria-label="Delete page" disabled={d.pages.length < 2} onClick={() => confirm(`Delete page ${i + 1}?`) && setPages(d.pages.filter((_, j) => j !== i), Math.min(i, d.pages.length - 2))}><Trash2Icon className="size-3.5" /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {mode === "design" && (
              <button type="button" className="flex items-center justify-center gap-1 border-t py-2 text-xs hover:bg-muted disabled:opacity-40" disabled={d.pages.length >= options.maxPages} onClick={() => setPages([...d.pages, { id: did(), bg: cur.bg, elements: [] }], d.pages.length)}>
                <PlusIcon className="size-3.5" /> New page
              </button>
            )}
          </div>
        )}

        {/* Canvas */}
        <div className="relative min-w-0 flex-1">
          <div
            ref={scroller}
            className={cn("absolute inset-0 overflow-auto bg-[#e9ebee] p-8 dark:bg-slate-900", painting && "cursor-copy")}
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
            <div className="mx-auto flex w-max flex-col items-center gap-8">
              {d.pages.map((p, pi) => (
                <div key={p.id} className="space-y-1.5">
                  <div
                    ref={(el) => {
                      pageRefs.current[pi] = el;
                    }}
                    className="relative bg-white shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)]"
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
                            className={cn("absolute", mode === "design" && !isEdit && (painting ? "cursor-copy" : "cursor-move"), e.hidden && "opacity-30", isSel && "outline outline-[0.3mm] outline-primary", mode === "design" && !isSel && !isEdit && "hover:outline hover:outline-[0.25mm] hover:outline-primary/40")}
                            style={{ left: `${e.x}mm`, top: `${e.y}mm`, width: `${e.w}mm`, height: `${Math.max(e.h, e.kind === "line" ? 0.01 : 0)}mm`, transform: e.rotate ? `rotate(${e.rotate}deg)` : undefined, opacity: e.hidden ? undefined : e.opacity }}
                            onPointerDown={(ev) => {
                              if (pi !== page) setPage(pi);
                              if (painting && mode === "design") return (ev.stopPropagation(), paintOn(e));
                              startMove(ev, e);
                            }}
                            onDoubleClick={() => mode === "design" && e.kind === "text" && !e.locked && setEditing(e.id)}
                          >
                            {isEdit ? <EditableText el={e as DText & DElement} onDone={(t) => commitText(e.id, t)} /> : <div className="pointer-events-none size-full" dangerouslySetInnerHTML={{ __html: elementInner(e, values, ex) }} />}
                            {isSel && one?.id === e.id && !e.locked && !frozen(e) && !isEdit && <Handles kind={e.kind} zoom={zoom} onResize={(ev, h) => startResize(ev, e, h)} onRotate={(ev) => startRotate(ev, e)} />}
                            {isSel && (e.locked || frozen(e)) && <span className="absolute -top-[4.5mm] left-0 rounded bg-slate-700 px-1 text-[2.6mm] whitespace-nowrap text-white">{frozen(e) ? "Letterhead (locked by Admin)" : "Locked"}</span>}
                          </div>
                        );
                      })}
                      {pi === page && guides.map((g, i) => <div key={i} aria-hidden className="pointer-events-none absolute bg-pink-500" style={g.axis === "x" ? { left: `${g.at}mm`, top: 0, width: "0.25mm", height: "100%" } : { top: `${g.at}mm`, left: 0, height: "0.25mm", width: "100%" }} />)}
                      {pi === page && marquee && <div aria-hidden className="pointer-events-none absolute border border-primary bg-primary/10" style={{ left: `${Math.min(marquee.x0, marquee.x1)}mm`, top: `${Math.min(marquee.y0, marquee.y1)}mm`, width: `${Math.abs(marquee.x1 - marquee.x0)}mm`, height: `${Math.abs(marquee.y1 - marquee.y0)}mm` }} />}
                    </div>
                  </div>
                  {notes && mode === "design" && (
                    <Textarea className="bg-background text-xs" rows={2} style={{ width: d.w * MM * zoom }} placeholder="Click to add speaker notes" value={p.notes ?? ""} onChange={(e) => onChange({ ...design, pages: design.pages.map((x, i) => (i === pi ? { ...x, notes: e.target.value } : x)) })} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Format pane (as Office's Format Shape pane) */}
        {showFormat && mode === "design" && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l bg-background max-lg:hidden" aria-label="Format">
            <FormatPane
              el={one}
              count={selected.length}
              page={cur}
              palette={palette}
              custom={options.allowCustomColors}
              onPatch={updateOne}
              onPage={(p) => setPages(design.pages.map((x, i) => (i === page ? { ...x, ...p } : x)))}
              layers={[...cur.elements].reverse()}
              selected={sel}
              onPick={(e, add2) => pick(e, add2)}
              onToggle={(id, k) => update([id], (x) => ({ ...x, [k]: !x[k] }))}
              frozen={frozen}
            />
          </aside>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 border-t bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
        <span>Page {page + 1} of {d.pages.length}</span>
        <span>{selected.length ? (selected.length > 1 ? `${selected.length} selected` : layerName(selected[0]!)) : "Nothing selected"}</span>
        {painting && <span className="text-primary">Format painter: click the element to paint (Esc cancels)</span>}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.2, Math.round((z - 0.1) * 10) / 10))}><MinusIcon className="size-3" /></button>
          <input type="range" min={20} max={300} value={Math.round(zoom * 100)} onChange={(e) => setZoom(Number(e.target.value) / 100)} className="w-24 accent-[var(--primary)]" aria-label="Zoom" />
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))}><PlusIcon className="size-3" /></button>
          <button type="button" className="w-10 tabular-nums" onClick={fitZoom} title="Fit">{Math.round(zoom * 100)}%</button>
        </span>
      </div>

      {tplOpen && (
        <Dialog open onOpenChange={setTplOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Templates</DialogTitle>
            </DialogHeader>
            <div className="grid max-h-[70vh] grid-cols-2 gap-4 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
              {templates.map((t) => {
                const td = t.design();
                return (
                  <button key={t.key} type="button" className="space-y-1 text-left" onClick={() => (commit(td), setPage(0), setSel([]), setTplOpen(false))}>
                    <span className="flex h-40 items-center justify-center rounded border bg-muted/30 p-2 hover:border-primary"><Thumb d={td} p={td.pages[0]!} height={140} values={values} extras={ex} /></span>
                    <span className="block text-sm font-medium">{t.label}</span>
                    {t.hint && <span className="block text-xs text-muted-foreground">{t.hint}</span>}
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
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

function Thumb({ d, p, width, height, values, extras }: { d: Design; p: DPage; width?: number; height?: number; values: Record<string, string>; extras: Extras }) {
  const k = width ? width / (d.w * MM) : (height ?? 60) / (d.h * MM);
  return (
    <div className="overflow-hidden bg-white" style={{ width: d.w * MM * k, height: d.h * MM * k }}>
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

// --- The ribbon's parts (as Office): groups with a label under them, big and small buttons, icon buttons. ---
const qa = "inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted disabled:opacity-40";
function RGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col border-r px-2 last:border-r-0">
      <div className="flex flex-1 items-start gap-1.5">{children}</div>
      <span className="pt-0.5 text-center text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
function RBig({ icon: Icon, label, onClick, disabled, active }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn("flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded px-1 text-[11px] leading-tight hover:bg-muted disabled:opacity-40", active && "bg-primary/10 text-primary")}>
      <Icon className="size-5" />
      <span className="line-clamp-2 text-center">{label}</span>
    </button>
  );
}
function RSmall({ icon: Icon, label, onClick, disabled, active }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn("flex h-6 items-center gap-1.5 rounded px-1.5 text-xs whitespace-nowrap hover:bg-muted disabled:opacity-40", active && "bg-primary/10 text-primary")}>
      <Icon className="size-3.5" /> {label}
    </button>
  );
}
function RIcon({ icon: Icon, label, onClick, disabled, active }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled} className={cn("inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted disabled:opacity-40", active && "bg-primary/15 text-primary")}>
      <Icon className="size-4" />
    </button>
  );
}

const SHAPES: DShape["shape"][] = ["rect", "ellipse", "triangle", "diamond", "star", "arrow", "hexagon", "speech", "pill"];
function ShapeGallery({ onPick, big, disabled }: { onPick: (s: DShape["shape"]) => void; big?: boolean; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {big ? (
          <button type="button" disabled={disabled} className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded text-[11px] hover:bg-muted disabled:opacity-40">
            <ShapesIcon className="size-5" /> Shapes
          </button>
        ) : (
          <button type="button" disabled={disabled} className="grid h-14 grid-cols-3 gap-0.5 rounded border bg-background p-1 hover:border-primary disabled:opacity-40" aria-label="Shapes">
            {SHAPES.slice(0, 6).map((s) => (
              <span key={s} className="block size-4" dangerouslySetInnerHTML={{ __html: elementInner(shapeEl(s, 0, 0, 16, 16, { fill: null, stroke: "#475569", strokeWidth: 1.2 })) }} />
            ))}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" align="start">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Shapes</p>
        <div className="grid grid-cols-5 gap-1">
          {SHAPES.map((s) => (
            <button key={s} type="button" title={s} className="flex aspect-square items-center justify-center rounded border hover:border-primary hover:bg-primary/5" onClick={() => (onPick(s), setOpen(false))}>
              <span className="block size-6" dangerouslySetInnerHTML={{ __html: elementInner(shapeEl(s, 0, 0, 24, 24, { fill: "#94a3b8" })) }} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
function IconGallery({ onPick }: { onPick: (k: string) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded text-[11px] hover:bg-muted">
          <StarIcon className="size-5" /> Icons
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="grid grid-cols-7 gap-1">
          {Object.entries(ICONS).map(([k, path]) => (
            <button key={k} type="button" title={k} className="flex aspect-square items-center justify-center rounded border hover:border-primary" onClick={() => (onPick(k), setOpen(false))}>
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
// Choosing a table's size by hovering a grid (as Word's Insert Table).
function TableGrid({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [open, setOpen] = React.useState(false);
  const [h, setH] = React.useState({ r: 0, c: 0 });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded text-[11px] hover:bg-muted">
          <TableIcon className="size-5" /> Table
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <p className="mb-1 text-xs text-muted-foreground">{h.r ? `${h.r} × ${h.c} table` : "Insert a table"}</p>
        <div className="grid grid-cols-8 gap-0.5" onMouseLeave={() => setH({ r: 0, c: 0 })}>
          {Array.from({ length: 64 }, (_, i) => {
            const r = Math.floor(i / 8) + 1;
            const c = (i % 8) + 1;
            return <button key={i} type="button" aria-label={`${r} by ${c}`} onMouseEnter={() => setH({ r, c })} onClick={() => (onPick(r, c), setOpen(false))} className={cn("size-4 border", r <= h.r && c <= h.c ? "border-primary bg-primary/20" : "bg-background")} />;
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
function FindReplace({ onReplace }: { onReplace: (q: string, r: string) => number }) {
  const [q, setQ] = React.useState("");
  const [r, setR] = React.useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded text-[11px] hover:bg-muted">
          <ReplaceIcon className="size-5" /> Replace
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="start">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find" />
        <Input value={r} onChange={(e) => setR(e.target.value)} placeholder="Replace with" />
        <Button size="sm" className="w-full" disabled={!q} onClick={() => alert(`${onReplace(q, r)} replaced.`)}>
          Replace all
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// The contextual tab for what is selected (Shape format, Picture format, Table design, Text format).
function FormatRibbon({ el, palette, custom, onPatch, onReplaceImage }: { el: DElement; palette: string[]; custom: boolean; onPatch: (x: Partial<DElement>) => void; onReplaceImage: () => void }) {
  const p = (x: Record<string, unknown>) => onPatch(x as Partial<DElement>);
  if (el.kind === "image")
    return (
      <>
        <RGroup label="Adjust">
          <RBig icon={ImagePlusIcon} label="Change picture" onClick={onReplaceImage} />
          <div className="grid grid-cols-3 gap-1">
            {(["none", "grayscale", "sepia", "bright", "dark", "blur"] as const).map((f) => (
              <button key={f} type="button" onClick={() => p({ filter: f })} className={cn("h-6 rounded border px-1 text-[11px] capitalize", el.filter === f && "border-primary bg-primary/10")}>
                {f === "none" ? "Original" : f}
              </button>
            ))}
          </div>
        </RGroup>
        <RGroup label="Picture style">
          <div className="flex flex-col gap-0.5">
            <RSmall icon={FrameIcon} label={el.fit === "cover" ? "Fill the frame" : "Fit inside"} onClick={() => p({ fit: el.fit === "cover" ? "contain" : "cover" })} />
            <RSmall icon={FlipHorizontalIcon} label="Flip across" onClick={() => p({ flipX: !el.flipX })} />
            <RSmall icon={FlipVerticalIcon} label="Flip up and down" onClick={() => p({ flipY: !el.flipY })} />
          </div>
          <div className="flex flex-col gap-1">
            <Num label="Corners" value={el.radius ?? 0} min={0} onChange={(v) => p({ radius: v })} />
            <ColorPop icon={SquareIcon} label="Picture border" value={el.border} palette={palette} custom={custom} onPick={(c) => p({ border: c, borderWidth: c ? Math.max(0.5, el.borderWidth ?? 0) : 0 })} none />
          </div>
        </RGroup>
      </>
    );
  if (el.kind === "table")
    return (
      <>
        <RGroup label="Table styles">
          <div className="flex gap-1">
            {[
              ["#0f172a", "#ffffff", "#f8fafc"],
              [palette[0] ?? "#16a34a", "#ffffff", "#f0fdf4"],
              ["#1d4ed8", "#ffffff", "#eff6ff"],
              ["#f1f5f9", "#0f172a", null],
              ["#ffffff", "#0f172a", "#f8fafc"],
            ].map(([hf, hc, st], i) => (
              <button key={i} type="button" onClick={() => p({ headFill: hf, headColor: hc, stripe: st })} className="flex h-12 w-12 flex-col overflow-hidden rounded border hover:border-primary" aria-label="Table style">
                <span className="h-3" style={{ background: hf! }} />
                {[0, 1, 2].map((r) => <span key={r} className="h-3 border-t" style={{ background: r % 2 === 0 && st ? st : "#fff" }} />)}
              </button>
            ))}
          </div>
        </RGroup>
        <RGroup label="Cells">
          <TableEdit el={el} palette={palette} custom={custom} onPatch={p} />
        </RGroup>
      </>
    );
  if (el.kind === "text") return (
    <RGroup label="Text effects">
      <div className="flex flex-col gap-0.5">
        <RSmall icon={SparklesIcon} label="Shadow" active={!!el.shadow} onClick={() => p({ shadow: !el.shadow })} />
        <RSmall icon={CaseUpperIcon} label="Capitals" active={!!el.uppercase} onClick={() => p({ uppercase: !el.uppercase })} />
      </div>
      <div className="flex flex-col gap-1">
        <Num label="Letter spacing" value={el.letterSpacing ?? 0} step={0.5} onChange={(v) => p({ letterSpacing: v })} />
        <Num label="Inner margin" value={el.padding ?? 0} step={0.5} min={0} onChange={(v) => p({ padding: v })} />
      </div>
      <div className="flex flex-col gap-1">
        <ColorPop icon={SquareIcon} label="Text outline" value={el.outline} palette={palette} custom={custom} onPick={(c) => p({ outline: c })} none />
      </div>
    </RGroup>
  );
  if (el.kind === "shape" || el.kind === "line")
    return (
      <>
        <RGroup label="Shape styles">
          <div className="flex gap-1">
            {[palette[0] ?? "#16a34a", palette[1] ?? "#0f172a", "#2563eb", "#f59e0b", "#dc2626", "#ffffff"].map((c) => (
              <button key={c} type="button" className="size-7 rounded border" style={{ background: c }} aria-label={c} onClick={() => p(el.kind === "line" ? { stroke: c } : { fill: c, gradient: null })} />
            ))}
          </div>
        </RGroup>
        <RGroup label="Outline">
          <Num label="Width" value={el.strokeWidth} step={0.1} min={0} onChange={(v) => p({ strokeWidth: v })} />
          <RSmall icon={MinusIcon} label={el.dash ? "Solid" : "Dashed"} onClick={() => p({ dash: !el.dash })} />
          {el.kind === "line" && (
            <div className="flex flex-col gap-0.5">
              <RSmall icon={MoveRightIcon} label="End arrow" active={!!el.arrowEnd} onClick={() => p({ arrowEnd: !el.arrowEnd })} />
              <RSmall icon={MoveLeftIcon} label="Start arrow" active={!!el.arrowStart} onClick={() => p({ arrowStart: !el.arrowStart })} />
            </div>
          )}
        </RGroup>
      </>
    );
  return <span className="self-center px-3 text-xs text-muted-foreground">Use the pane on the right for this element.</span>;
}

// The pane on the right: what is selected (position, size, fill, line, text, picture), or the page; and the layers.
function FormatPane(p: {
  el: DElement | null;
  count: number;
  page: DPage;
  palette: string[];
  custom: boolean;
  onPatch: (x: Partial<DElement>) => void;
  onPage: (x: Partial<DPage>) => void;
  layers: DElement[];
  selected: string[];
  onPick: (e: DElement, add: boolean) => void;
  onToggle: (id: string, k: "hidden" | "locked") => void;
  frozen: (e: DElement) => boolean;
}) {
  const e = p.el;
  const set = (x: Record<string, unknown>) => p.onPatch(x as Partial<DElement>);
  const H = ({ children }: { children: React.ReactNode }) => <p className="border-b px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</p>;
  return (
    <div className="text-sm">
      {!e && p.count === 0 && (
        <>
          <H>Page</H>
          <div className="space-y-2 p-3">
            <p className="text-xs text-muted-foreground">Fill</p>
            <Swatches palette={p.palette} custom={p.custom} value={p.page.bg} onPick={(c) => p.onPage({ bg: c ?? "#ffffff", bgGradient: null })} />
            <p className="pt-1 text-xs text-muted-foreground">Select something on the page to format it. Double-click text to type.</p>
          </div>
        </>
      )}
      {p.count > 1 && (
        <>
          <H>{p.count} selected</H>
          <p className="p-3 text-xs text-muted-foreground">Use Arrange to align, space or group them.</p>
        </>
      )}
      {e && (
        <>
          <H>Size and position</H>
          <div className="grid grid-cols-2 gap-2 p-3">
            <Num label="Width" value={e.w} min={1} onChange={(v) => set({ w: v })} w="w-full" />
            <Num label="Height" value={e.h} min={0} onChange={(v) => set({ h: v })} w="w-full" />
            <Num label="Left" value={e.x} onChange={(v) => set({ x: v })} w="w-full" />
            <Num label="Top" value={e.y} onChange={(v) => set({ y: v })} w="w-full" />
            <Num label="Rotation" value={e.rotate} onChange={(v) => set({ rotate: v })} w="w-full" />
            <Num label="Opacity %" value={Math.round(e.opacity * 100)} min={0} max={100} onChange={(v) => set({ opacity: Math.min(1, Math.max(0, v / 100)) })} w="w-full" />
          </div>
          {e.kind === "text" && (
            <>
              <H>Text box</H>
              <div className="space-y-2 p-3">
                <div className="flex items-center gap-2 text-xs">Fill <Swatches palette={p.palette} custom={p.custom} value={e.bg} onPick={(c) => set({ bg: c })} none /></div>
                <Num label="Inner margin (mm)" value={e.padding ?? 0} step={0.5} min={0} onChange={(v) => set({ padding: v })} w="w-full" />
                <Num label="Line spacing" value={e.lineHeight} step={0.05} min={0.7} max={4} onChange={(v) => set({ lineHeight: v })} w="w-full" />
              </div>
            </>
          )}
          {e.kind === "shape" && (
            <>
              <H>Fill and line</H>
              <div className="space-y-2 p-3">
                <div className="flex items-center gap-2 text-xs">Fill <Swatches palette={p.palette} custom={p.custom} value={e.fill} onPick={(c) => set({ fill: c, gradient: null })} none /></div>
                <select className="h-8 w-full rounded-md border bg-background px-1 text-xs" value={e.gradient ?? ""} onChange={(x) => set({ gradient: x.target.value || null })} aria-label="Gradient">
                  <option value="">No gradient</option>
                  {GRADIENTS.map((g) => <option key={g} value={g}>{g.replace("linear-gradient(", "").replace(")", "")}</option>)}
                </select>
                <div className="flex items-center gap-2 text-xs">Line <Swatches palette={p.palette} custom={p.custom} value={e.stroke} onPick={(c) => set({ stroke: c })} none /></div>
                <Num label="Line width" value={e.strokeWidth} step={0.1} min={0} onChange={(v) => set({ strokeWidth: v })} w="w-full" />
                {e.shape === "rect" && <Num label="Rounded corners" value={e.radius ?? 0} step={0.5} min={0} onChange={(v) => set({ radius: v })} w="w-full" />}
              </div>
            </>
          )}
          {e.kind === "icon" && (
            <>
              <H>Icon</H>
              <div className="p-3"><Swatches palette={p.palette} custom={p.custom} value={e.color} onPick={(c) => c && set({ color: c })} /></div>
            </>
          )}
          {e.kind === "qr" && (
            <>
              <H>QR code</H>
              <div className="p-3"><Input className="h-8 text-xs" placeholder="Link or text (empty: the letter's check code)" value={e.value ?? ""} onChange={(x) => set({ value: x.target.value })} /></div>
            </>
          )}
          {e.kind === "slot" && (
            <>
              <H>Place</H>
              <div className="p-3"><Input className="h-8 text-xs" value={e.label ?? ""} onChange={(x) => set({ label: x.target.value })} aria-label="Label" /></div>
            </>
          )}
          <H>Link</H>
          <div className="p-3">
            <Input className="h-8 text-xs" placeholder="https://… (optional)" value={e.link ?? ""} onChange={(x) => set({ link: /^(https?:\/\/|mailto:|tel:)/i.test(x.target.value) ? x.target.value : x.target.value ? e.link : null })} />
          </div>
        </>
      )}
      <H>Layers</H>
      <ul className="space-y-0.5 p-2">
        {p.layers.map((l) => (
          <li key={l.id} className={cn("flex items-center gap-1 rounded px-1.5 py-1 text-xs", p.selected.includes(l.id) ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
            <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={(ev) => p.onPick(l, ev.shiftKey)}>
              {l.name ?? layerName(l)}
            </button>
            <button type="button" aria-label={l.hidden ? "Show" : "Hide"} onClick={() => p.onToggle(l.id, "hidden")}>{l.hidden ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5 opacity-50" />}</button>
            <button type="button" aria-label={l.locked ? "Unlock" : "Lock"} disabled={p.frozen(l)} onClick={() => p.onToggle(l.id, "locked")}>{l.locked ? <LockIcon className="size-3.5" /> : <UnlockIcon className="size-3.5 opacity-30" />}</button>
          </li>
        ))}
        {!p.layers.length && <li className="px-1.5 py-1 text-xs text-muted-foreground">Nothing on this page yet.</li>}
      </ul>
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
