"use client";

import * as React from "react";
import {
  AlignCenterIcon, AlignJustifyIcon, AlignLeftIcon, AlignRightIcon, ArrowDownIcon, ArrowUpIcon, BoldIcon, CaseUpperIcon, ColumnsIcon, EraserIcon, FootprintsIcon, Heading2Icon, HighlighterIcon, ImageIcon, ItalicIcon, LinkIcon, ListIcon, ListTreeIcon, MinusIcon, PaletteIcon, PilcrowIcon, PlusIcon, QuoteIcon, RectangleHorizontalIcon, ScissorsIcon, SeparatorHorizontalIcon, SlidersHorizontalIcon, StrikethroughIcon, SubscriptIcon, SuperscriptIcon, TableIcon, Trash2Icon, TypeIcon, UnderlineIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FONTS, newBlock, type Block, type ListStyle, type ParaStyle, type TableStyle } from "./doc-model";
import { FUNCTION_NAMES } from "@/lib/formula";
import { cn } from "@/lib/utils";

const ADD: { type: Block["type"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "heading", label: "Heading", icon: Heading2Icon },
  { type: "paragraph", label: "Paragraph", icon: PilcrowIcon },
  { type: "list", label: "List", icon: ListIcon },
  { type: "table", label: "Table", icon: TableIcon },
  { type: "image", label: "Picture", icon: ImageIcon },
  { type: "textbox", label: "Text box", icon: RectangleHorizontalIcon },
  { type: "quote", label: "Quote", icon: QuoteIcon },
  { type: "divider", label: "Divider", icon: MinusIcon },
  { type: "pagebreak", label: "Page break", icon: ScissorsIcon },
  { type: "section", label: "Section break", icon: SeparatorHorizontalIcon },
  { type: "toc", label: "Contents", icon: ListTreeIcon },
  { type: "columns", label: "Two columns", icon: ColumnsIcon },
];

export function AddBlockBar({ onAdd }: { onAdd: (b: Block) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ADD.map((a) => (
        <Button key={a.type} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAdd(newBlock(a.type))}>
          <a.icon className="size-3.5" /> {a.label}
        </Button>
      ))}
    </div>
  );
}

// A text area with a formatting bar: the marks go around the selected text (or are inserted at the cursor).
function RichText({ value, onChange, rows = 3, label, style }: { value: string; onChange: (v: string) => void; rows?: number; label: string; style?: React.CSSProperties }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [color, setColor] = React.useState("#c00000");
  const [hl, setHl] = React.useState("#fff2cc");
  const clear = () => {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart;
    const b = el.selectionEnd;
    if (a === b) return;
    const plain = value
      .slice(a, b)
      .replace(/\{[^|{}]{1,80}\|(.+?)\}/g, "$1")
      .replace(/\*\*|__|~~|==/g, "")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2");
    onChange(value.slice(0, a) + plain + value.slice(b));
  };
  const wrap = (before: string, after: string, placeholder = "text") => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const B = ({ title, icon: Icon, onClick }: { title: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void }) => (
    <button type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="rounded p-1 hover:bg-muted">
      <Icon className="size-3.5" />
    </button>
  );
  return (
    <div className="rounded-md border focus-within:ring-1 focus-within:ring-ring">
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-0.5">
        <B title="Bold" icon={BoldIcon} onClick={() => wrap("**", "**")} />
        <B title="Italic" icon={ItalicIcon} onClick={() => wrap("*", "*")} />
        <B title="Underline" icon={UnderlineIcon} onClick={() => wrap("__", "__")} />
        <B title="Strike through" icon={StrikethroughIcon} onClick={() => wrap("~~", "~~")} />
        <B title="Highlight" icon={HighlighterIcon} onClick={() => wrap("==", "==")} />
        <span className="flex items-center">
          <B title="Colour" icon={PaletteIcon} onClick={() => wrap(`{${color}|`, "}")} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-4 cursor-pointer border-0 bg-transparent p-0" aria-label="Text colour" />
        </span>
        <span className="flex items-center">
          <button type="button" title="Highlight colour" aria-label="Highlight colour" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap(`{bg${hl}|`, "}")} className="rounded p-1 hover:bg-muted">
            <span className="block size-3.5 rounded-sm border" style={{ background: hl }} />
          </button>
          <input type="color" value={hl} onChange={(e) => setHl(e.target.value)} className="size-4 cursor-pointer border-0 bg-transparent p-0" aria-label="Choose the highlight colour" />
        </span>
        <select
          className="h-6 w-24 rounded border bg-background px-0.5 text-[11px]"
          aria-label="Font of the selected text"
          value=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => e.target.value && wrap(`{f:${e.target.value}|`, "}")}
        >
          <option value="">Font…</option>
          {FONTS.filter((f) => f.label !== "Default").map((f) => (
            <option key={f.label} value={f.label}>
              {f.label}
            </option>
          ))}
        </select>
        <select className="h-6 w-16 rounded border bg-background px-0.5 text-[11px]" aria-label="Size of the selected text" value="" onChange={(e) => e.target.value && wrap(`{${e.target.value}pt|`, "}")}>
          <option value="">Size…</option>
          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <B title="Superscript" icon={SuperscriptIcon} onClick={() => wrap("{sup|", "}")} />
        <B title="Subscript" icon={SubscriptIcon} onClick={() => wrap("{sub|", "}")} />
        <B title="Capitals" icon={CaseUpperIcon} onClick={() => wrap("{caps|", "}")} />
        <B title="Clear formatting of the selection" icon={EraserIcon} onClick={clear} />
        <B
          title="Link"
          icon={LinkIcon}
          onClick={() => {
            const url = prompt("Link address (https://… or mailto:…)");
            if (url && /^(https?:\/\/|mailto:)/i.test(url)) wrap("[", `](${url.trim()})`, "link text");
          }}
        />
        <B
          title="Footnote"
          icon={FootprintsIcon}
          onClick={() => {
            const note = prompt("Footnote text");
            if (!note) return;
            const el = ref.current;
            const at = el?.selectionEnd ?? value.length;
            onChange(`${value.slice(0, at)}^[${note.replace(/\]/g, ")")}]${value.slice(at)}`);
          }}
        />
      </div>
      <Textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={Math.max(rows, value.split("\n").length)} aria-label={label} className="rounded-none border-0 shadow-none focus-visible:ring-0" style={style} />
    </div>
  );
}

function StyleMenu({ value, onChange }: { value: ParaStyle; onChange: (s: ParaStyle) => void }) {
  const num = (v: string) => (v === "" ? undefined : Number(v));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Paragraph settings" className={cn("rounded p-1 hover:bg-muted", Object.values(value).some((x) => x != null && x !== "") && "bg-muted")}>
          <SlidersHorizontalIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 text-xs" align="start">
        <label className="block space-y-1">
          <span className="font-medium">Font</span>
          <select className="h-8 w-full rounded-md border bg-background px-2" value={value.font ?? "Default"} onChange={(e) => onChange({ ...value, font: e.target.value === "Default" ? undefined : e.target.value })}>
            {FONTS.map((f) => <option key={f.label} value={f.label}>{f.label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="font-medium">Size (pt)</span><Input className="h-8" type="number" min={6} max={48} value={value.size ?? ""} onChange={(e) => onChange({ ...value, size: num(e.target.value) })} /></label>
          <label className="space-y-1"><span className="font-medium">Colour</span><Input className="h-8" type="color" value={value.color ?? "#111827"} onChange={(e) => onChange({ ...value, color: e.target.value })} /></label>
          <label className="space-y-1"><span className="font-medium">Line spacing</span><Input className="h-8" type="number" step={0.1} min={1} max={3} value={value.lineHeight ?? ""} onChange={(e) => onChange({ ...value, lineHeight: num(e.target.value) })} /></label>
          <label className="space-y-1"><span className="font-medium">Indent (mm)</span><Input className="h-8" type="number" min={0} max={100} value={value.indent ?? ""} onChange={(e) => onChange({ ...value, indent: num(e.target.value) })} /></label>
          <label className="space-y-1"><span className="font-medium">Space before (pt)</span><Input className="h-8" type="number" min={0} max={72} value={value.before ?? ""} onChange={(e) => onChange({ ...value, before: num(e.target.value) })} /></label>
          <label className="space-y-1"><span className="font-medium">Space after (pt)</span><Input className="h-8" type="number" min={0} max={72} value={value.after ?? ""} onChange={(e) => onChange({ ...value, after: num(e.target.value) })} /></label>
          <label className="col-span-2 space-y-1"><span className="font-medium">First line (mm; negative hangs)</span><Input className="h-8" type="number" min={-20} max={50} value={value.firstLine ?? ""} onChange={(e) => onChange({ ...value, firstLine: num(e.target.value) })} /></label>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={() => onChange({})}>Reset</Button>
      </PopoverContent>
    </Popover>
  );
}

export function BlockEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const set = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <div key={b.id} className="group relative rounded-md border bg-background p-2 pr-10">
          <div className="absolute top-1 right-1 flex flex-col gap-0.5 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" aria-label="Move up" className="rounded p-0.5 hover:bg-muted" onClick={() => move(i, -1)}>
              <ArrowUpIcon className="size-3.5" />
            </button>
            <button type="button" aria-label="Move down" className="rounded p-0.5 hover:bg-muted" onClick={() => move(i, 1)}>
              <ArrowDownIcon className="size-3.5" />
            </button>
            <button type="button" aria-label="Remove block" className="rounded p-0.5 hover:bg-muted" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
          <BlockFields b={b} onChange={(nb) => set(i, nb)} />
          <button type="button" aria-label="Add a paragraph below" className="absolute -bottom-2.5 left-1/2 hidden -translate-x-1/2 rounded-full border bg-background p-0.5 group-hover:block" onClick={() => onChange([...blocks.slice(0, i + 1), newBlock("paragraph"), ...blocks.slice(i + 1)])}>
            <PlusIcon className="size-3" />
          </button>
        </div>
      ))}
      <AddBlockBar onAdd={(b) => onChange([...blocks, b])} />
      <p className="text-xs text-muted-foreground">Select text and use the bar above a paragraph for bold, italic, underline, colours, font, size, superscript, links and footnotes; the slider icon sets a paragraph&apos;s font, size and spacing. In tables, a cell starting with = is a formula (=SUM(ABOVE), =B2*C2) and a cell holding &lt; joins the cell on its left.</p>
    </div>
  );
}

const ALIGNS = [
  ["left", AlignLeftIcon],
  ["center", AlignCenterIcon],
  ["right", AlignRightIcon],
  ["justify", AlignJustifyIcon],
] as const;

function BlockFields({ b, onChange }: { b: Block; onChange: (b: Block) => void }) {
  switch (b.type) {
    case "heading":
      return (
        <div className="flex gap-2">
          <select value={b.level} onChange={(e) => onChange({ ...b, level: Number(e.target.value) as 1 | 2 | 3 })} className="rounded-md border bg-background px-1 text-xs" aria-label="Heading level">
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <Input value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} className={cn("font-semibold", b.level === 1 ? "text-lg" : "text-base")} aria-label="Heading" style={{ textAlign: b.align ?? "left" }} />
          <select value={b.align ?? "left"} onChange={(e) => onChange({ ...b, align: e.target.value as "left" })} className="rounded-md border bg-background px-1 text-xs" aria-label="Heading alignment">
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </select>
        </div>
      );
    case "paragraph":
      return (
        <div className="space-y-1">
          <RichText value={b.text} onChange={(text) => onChange({ ...b, text })} label="Paragraph" rows={2} style={{ textAlign: b.align ?? "left", fontFamily: FONTS.find((f) => f.label === b.style?.font)?.css || undefined, color: b.style?.color }} />
          <div className="flex items-center gap-0.5">
            {ALIGNS.map(([a, Icon]) => (
              <button key={a} type="button" aria-label={`Align ${a}`} aria-pressed={(b.align ?? "left") === a} onClick={() => onChange({ ...b, align: a })} className={cn("rounded p-1 hover:bg-muted", (b.align ?? "left") === a && "bg-muted")}>
                <Icon className="size-3.5" />
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            <StyleMenu value={b.style ?? {}} onChange={(style) => onChange({ ...b, style })} />
          </div>
        </div>
      );
    case "list":
      return (
        <div className="space-y-1">
          <RichText value={b.items.join("\n")} onChange={(v) => onChange({ ...b, items: v.split("\n") })} rows={Math.max(2, b.items.length)} label="List items, one per line" />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              className="h-7 rounded-md border bg-background px-1"
              aria-label="List style"
              value={b.style === "check" ? "check" : b.ordered ? (b.style ?? "1") : "bullet"}
              onChange={(e) => {
                const v = e.target.value;
                onChange(v === "bullet" ? { ...b, ordered: false, style: undefined } : v === "check" ? { ...b, ordered: false, style: "check", checked: b.checked ?? b.items.map(() => false) } : { ...b, ordered: true, style: v as ListStyle });
              }}
            >
              <option value="bullet">• Bullets</option>
              <option value="1">1. 2. 3.</option>
              <option value="a">a. b. c.</option>
              <option value="A">A. B. C.</option>
              <option value="i">i. ii. iii.</option>
              <option value="I">I. II. III.</option>
              <option value="check">Checklist</option>
            </select>
            {b.style === "check" &&
              b.items.map((it, n) => (
                <label key={n} className="flex items-center gap-1">
                  <input type="checkbox" checked={!!b.checked?.[n]} onChange={(e) => onChange({ ...b, checked: b.items.map((_, j) => (j === n ? e.target.checked : !!b.checked?.[j])) })} /> {it.slice(0, 20) || `Item ${n + 1}`}
                </label>
              ))}
          </div>
        </div>
      );
    case "toc":
      return (
        <div className="flex items-center gap-2 text-xs">
          <ListTreeIcon className="size-4 text-muted-foreground" />
          <Input className="h-7 max-w-60 text-xs" value={b.title ?? ""} onChange={(e) => onChange({ ...b, title: e.target.value })} placeholder="Contents" aria-label="Contents title" />
          <span className="text-muted-foreground">Lists the headings; Word fills page numbers when the file is opened (Update field).</span>
        </div>
      );
    case "columns":
      return (
        <div className="space-y-1">
          <div className="grid gap-2 md:grid-cols-2">
            <RichText value={b.left} onChange={(left) => onChange({ ...b, left })} rows={4} label="Left column" />
            <RichText value={b.right} onChange={(right) => onChange({ ...b, right })} rows={4} label="Right column" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!b.rule} onChange={(e) => onChange({ ...b, rule: e.target.checked })} /> Line between the columns
          </label>
        </div>
      );
    case "table": {
      const width = Math.max(1, ...b.rows.map((r) => r.length));
      return <TableFields b={b} width={width} onChange={onChange} />;
    }
    case "quote":
      return <RichText value={b.text} onChange={(text) => onChange({ ...b, text })} rows={2} label="Quote" style={{ fontStyle: "italic" }} />;
    case "textbox":
      return (
        <div className="space-y-1">
          <RichText value={b.text} onChange={(text) => onChange({ ...b, text })} rows={2} label="Text box" style={{ background: b.fill }} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select className="h-7 rounded-md border bg-background px-1" value={b.align} onChange={(e) => onChange({ ...b, align: e.target.value as "full" })} aria-label="Placement">
              <option value="full">Full width</option>
              <option value="left">Left, text beside</option>
              <option value="right">Right, text beside</option>
            </select>
            {b.align !== "full" && <label className="flex items-center gap-1">Width % <Input className="h-7 w-16 text-xs" type="number" min={20} max={100} value={b.width} onChange={(e) => onChange({ ...b, width: Number(e.target.value) })} /></label>}
            <label className="flex items-center gap-1">Border <input type="color" value={b.border} onChange={(e) => onChange({ ...b, border: e.target.value })} aria-label="Border colour" /></label>
            <label className="flex items-center gap-1">Fill <input type="color" value={b.fill} onChange={(e) => onChange({ ...b, fill: e.target.value })} aria-label="Fill colour" /></label>
          </div>
        </div>
      );
    case "image":
      return (
        <div className="space-y-1">
          {b.src ? <img src={b.src} alt={b.caption ?? ""} className="mx-auto max-h-40 rounded border" style={{ width: `${b.width}%`, objectFit: "contain" }} /> : <p className="text-xs text-muted-foreground">No picture yet.</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted">
              <ImageIcon className="size-3.5" /> {b.src ? "Change" : "Choose a picture"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 1_500_000) return alert("Use a picture under 1.5 MB.");
                  const r = new FileReader();
                  r.onload = () => onChange({ ...b, src: String(r.result) });
                  r.readAsDataURL(f);
                }}
              />
            </label>
            <label className="flex items-center gap-1">Width % <Input className="h-7 w-16 text-xs" type="number" min={5} max={100} value={b.width} onChange={(e) => onChange({ ...b, width: Number(e.target.value) })} /></label>
            <select className="h-7 rounded-md border bg-background px-1" value={b.align} onChange={(e) => onChange({ ...b, align: e.target.value as "center" })} aria-label="Picture alignment">
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
            <Input className="h-7 min-w-40 flex-1 text-xs" value={b.caption ?? ""} onChange={(e) => onChange({ ...b, caption: e.target.value })} placeholder="Caption" aria-label="Caption" />
          </div>
        </div>
      );
    case "divider":
      return <hr className="my-3" />;
    case "pagebreak":
      return <p className="py-1 text-center text-xs text-muted-foreground">— page break —</p>;
    case "section":
      return (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">— section break (new page) —</span>
          <Input className="h-7 text-xs" value={b.title ?? ""} onChange={(e) => onChange({ ...b, title: e.target.value })} placeholder="Section title (optional)" aria-label="Section title" />
        </div>
      );
  }
}

function TableFields({ b, width, onChange }: { b: Extract<Block, { type: "table" }>; width: number; onChange: (b: Block) => void }) {
  const [cell, setCell] = React.useState<{ r: number; c: number } | null>(null);
  const st: TableStyle = b.style ?? {};
  const setSt = (p: Partial<TableStyle>) => onChange({ ...b, style: { ...st, ...p } });
  const put = (r: number, c: number, v: string) => onChange({ ...b, rows: b.rows.map((row, x) => (x === r ? Array.from({ length: width }, (_, y) => (y === c ? v : (row[y] ?? ""))) : row)) });
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <label className="flex items-center gap-1">Header <input type="color" value={st.headFill ?? "#f1f5f9"} onChange={(e) => setSt({ headFill: e.target.value })} aria-label="Header colour" /></label>
        <label className="flex items-center gap-1">Header text <input type="color" value={st.headColor ?? "#111827"} onChange={(e) => setSt({ headColor: e.target.value })} aria-label="Header text colour" /></label>
        <label className="flex items-center gap-1">Lines <input type="color" value={st.border ?? "#cbd5e1"} onChange={(e) => setSt({ border: e.target.value })} aria-label="Line colour" /></label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!st.stripe} onChange={(e) => setSt({ stripe: e.target.checked ? "#f8fafc" : null })} /> Stripes</label>
        <select className="h-7 rounded-md border bg-background px-1" value={st.borders ?? "all"} onChange={(e) => setSt({ borders: e.target.value as "all" })} aria-label="Borders">
          <option value="all">All lines</option>
          <option value="rows">Lines between rows</option>
          <option value="none">No lines</option>
        </select>
        <select className="h-7 rounded-md border bg-background px-1" value={st.size ?? ""} onChange={(e) => setSt({ size: e.target.value ? Number(e.target.value) : undefined })} aria-label="Text size">
          <option value="">Text size</option>
          {[8, 9, 10, 11, 12, 14].map((n) => <option key={n} value={n}>{n} pt</option>)}
        </select>
        {cell && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <span className="text-muted-foreground">Cell {String.fromCharCode(65 + cell.c)}{cell.r + 1}:</span>
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" disabled={cell.c + 1 >= width} onClick={() => put(cell.r, cell.c + 1, "<")}>Merge right</Button>
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => b.rows[cell.r]?.[cell.c + 1] === "<" && put(cell.r, cell.c + 1, "")}>Split</Button>
            {(["left", "center", "right"] as const).map((a) => (
              <Button key={a} type="button" size="sm" variant={(st.align?.[cell.c] ?? "left") === a ? "secondary" : "ghost"} className="h-6 text-xs" onClick={() => setSt({ align: Array.from({ length: width }, (_, i) => (i === cell.c ? a : (st.align?.[i] ?? "left"))) })}>
                {a === "center" ? "Centre" : a[0]!.toUpperCase() + a.slice(1)}
              </Button>
            ))}
            <select className="h-6 rounded border bg-background px-0.5 text-[11px]" value="" aria-label="Insert a formula" onChange={(e) => e.target.value && put(cell.r, cell.c, `=${e.target.value}`)}>
              <option value="">Formula…</option>
              <option value="SUM(ABOVE)">Sum above</option>
              <option value="SUM(LEFT)">Sum left</option>
              <option value="AVERAGE(ABOVE)">Average above</option>
              <option value="COUNT(ABOVE)">Count above</option>
              <option value="MAX(ABOVE)">Largest above</option>
              <option value="MIN(ABOVE)">Smallest above</option>
              {FUNCTION_NAMES.slice(0, 0).map((f) => <option key={f} value={`${f}()`}>{f}</option>)}
            </select>
          </>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {Array.from({ length: width }, (_, j) => (
                  <td key={j} className={cn("border p-0", r[j] === "<" && "bg-muted/60")} style={i === 0 && b.header && st.headFill ? { background: st.headFill } : undefined}>
                    <input
                      value={r[j] ?? ""}
                      onFocus={() => setCell({ r: i, c: j })}
                      onChange={(e) => put(i, j, e.target.value)}
                      className={cn("w-full min-w-20 bg-transparent px-1.5 py-1 outline-none focus:bg-muted/50", i === 0 && b.header && "font-semibold", (r[j] ?? "").startsWith("=") && "font-mono text-primary")}
                      style={i === 0 && b.header && st.headColor ? { color: st.headColor } : undefined}
                      aria-label={`Row ${i + 1}, column ${j + 1}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => onChange({ ...b, rows: [...b.rows, Array(width).fill("")] })}>+ Row</Button>
        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => onChange({ ...b, rows: b.rows.map((r) => [...r, ""]) })}>+ Column</Button>
        {cell && <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => onChange({ ...b, rows: [...b.rows.slice(0, cell.r + 1), Array(width).fill(""), ...b.rows.slice(cell.r + 1)] })}>+ Row below {cell.r + 1}</Button>}
        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" disabled={b.rows.length < 2} onClick={() => onChange({ ...b, rows: cell ? b.rows.filter((_, x) => x !== cell.r) : b.rows.slice(0, -1) })}>− Row</Button>
        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" disabled={width < 2} onClick={() => onChange({ ...b, rows: b.rows.map((r) => (cell ? r.filter((_, y) => y !== cell.c) : r.slice(0, width - 1))) })}>− Column</Button>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={b.header} onChange={(e) => onChange({ ...b, header: e.target.checked })} /> Header row
        </label>
      </div>
    </div>
  );
}
