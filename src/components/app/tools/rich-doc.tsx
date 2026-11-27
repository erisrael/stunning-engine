"use client";

// The rich-text editor (as Word): type on the page with the formatting showing as you go. A ribbon with Home
// (styles, font, size, bold, italic, underline, strike, superscript, subscript, colours, highlight, clear), Paragraph
// (alignment, bullets, numbering, checklists, indent, line spacing), Insert (table, picture, link, line, page and
// section breaks, contents, two columns, text box, footnote) and Table (rows, columns, merge, split, header row) when
// the caret is in a table. Keyboard shortcuts as in Word (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Z, Ctrl+Y, Ctrl+Shift+7…).

import * as React from "react";
import { Extension, Node, mergeAttributes, type Editor } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import {
  AlignCenterIcon, AlignJustifyIcon, AlignLeftIcon, AlignRightIcon, BoldIcon, CaseUpperIcon, ColumnsIcon, EraserIcon, FootprintsIcon, HighlighterIcon, ImageIcon, IndentDecreaseIcon, IndentIncreaseIcon, ItalicIcon, LinkIcon, ListChecksIcon, ListIcon, ListOrderedIcon, ListTreeIcon, MinusIcon, PencilIcon, QuoteIcon, RectangleHorizontalIcon, Redo2Icon, ScissorsIcon, SeparatorHorizontalIcon, StrikethroughIcon, SubscriptIcon, SuperscriptIcon, TableIcon, Trash2Icon, UnderlineIcon, Undo2Icon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { BlockEditor } from "./block-editor";
import { blocksHtml, FONTS, newBlock, type Block, type ParaStyle } from "./doc-model";
import { blocksToBody, blocksToDoc, bodyToBlocks, docToBlocks } from "./rich-model";
import { cn } from "@/lib/utils";

// --- Extensions for what the stored model keeps beyond TipTap's own ---

// Font size and capitals on text (as textStyle attributes).
const TextExtras = Extension.create({
  name: "textExtras",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: { default: null, parseHTML: (el) => el.style.fontSize || null, renderHTML: (a) => (a.fontSize ? { style: `font-size:${a.fontSize}` } : {}) },
          textTransform: { default: null, parseHTML: (el) => el.style.textTransform || null, renderHTML: (a) => (a.textTransform ? { style: `text-transform:${a.textTransform}` } : {}) },
        },
      },
    ];
  },
});
// A paragraph's own settings (font, size, colour, spacing, indents), and the letter style of numbered lists.
const BlockExtras = Extension.create({
  name: "blockExtras",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          pstyle: {
            default: null,
            renderHTML: (a) => {
              const s = a.pstyle as ParaStyle | null;
              if (!s) return {};
              const css = [s.font ? `font-family:${FONTS.find((f) => f.label === s.font)?.css ?? s.font}` : "", s.size ? `font-size:${s.size}pt` : "", s.color ? `color:${s.color}` : "", s.lineHeight ? `line-height:${s.lineHeight}` : "", s.before != null ? `margin-top:${s.before}pt` : "", s.after != null ? `margin-bottom:${s.after}pt` : "", s.indent ? `margin-left:${s.indent}mm` : "", s.firstLine ? `text-indent:${s.firstLine}mm` : ""].filter(Boolean).join(";");
              return css ? { style: css } : {};
            },
          },
        },
      },
      { types: ["orderedList"], attributes: { listType: { default: null, renderHTML: (a) => (a.listType ? { type: a.listType } : {}) } } },
      { types: ["table"], attributes: { tstyle: { default: null, renderHTML: () => ({}) } } },
    ];
  },
});
// Pictures with a width (a share of the text column) and a side.
const Picture = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: 60, renderHTML: (a) => ({ style: `width:${a.width}%;height:auto;display:block;margin:${a.align === "left" ? "0 auto 0 0" : a.align === "right" ? "0 0 0 auto" : "0 auto"}` }) },
      align: { default: "center", renderHTML: () => ({}) },
    };
  },
});

// Blocks the editor has no node for (page and section breaks, contents, two columns, text boxes): drawn as they
// print, edited in a small panel.
function MyseedBlockView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const block = node.attrs.block as Block;
  const editable = !["pagebreak", "divider"].includes(block.type);
  return (
    <NodeViewWrapper className={cn("group/mb relative my-2 rounded-md border border-dashed border-transparent px-1 hover:border-sky-300", selected && "border-sky-400")} data-drag-handle>
      <div contentEditable={false} className="pointer-events-none select-none" dangerouslySetInnerHTML={{ __html: block.type === "pagebreak" ? '<div style="border-top:1px dashed #94a3b8;text-align:center;font-size:8pt;color:#64748b;margin:6px 0">Page break</div>' : block.type === "section" ? `<div style="border-top:2px solid #94a3b8;text-align:center;font-size:8pt;color:#64748b;margin:6px 0">Section break (new page)</div>${block.title ? `<h2>${block.title.replace(/[<>&]/g, "")}</h2>` : ""}` : blocksHtml([block]) }} />
      <div contentEditable={false} className="absolute -top-3 right-1 hidden gap-1 group-hover/mb:flex">
        {editable && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="rounded border bg-background px-1.5 py-0.5 text-[11px] shadow-sm hover:bg-muted">
                <PencilIcon className="inline size-3" /> Edit
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[36rem] max-w-[90vw]" align="end">
              <BlockEditor blocks={[block]} onChange={(b) => b[0] && updateAttributes({ block: b[0] })} />
            </PopoverContent>
          </Popover>
        )}
        <button type="button" aria-label="Remove" onClick={deleteNode} className="rounded border bg-background px-1.5 py-0.5 text-[11px] shadow-sm hover:bg-muted">
          <Trash2Icon className="inline size-3" />
        </button>
      </div>
    </NodeViewWrapper>
  );
}
const MyseedBlock = Node.create({
  name: "myseedBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({ block: { default: null } }),
  parseHTML: () => [{ tag: "div[data-myseed-block]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-myseed-block": "" })],
  addNodeView() {
    return ReactNodeViewRenderer(MyseedBlockView);
  },
});

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48];
const SWATCH = ["#000000", "#334155", "#64748b", "#c00000", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#1d4ed8", "#7c3aed", "#db2777"];
const MARKERS = ["#fef08a", "#bbf7d0", "#bae6fd", "#fbcfe8", "#fed7aa", "#e9d5ff"];

export function RichDoc({ blocks, onChange, simple = false, placeholder = "Type here…", className, minHeight = "60mm", sticky = true, barOnFocus = false }: { blocks: Block[]; onChange: (b: Block[]) => void; simple?: boolean; placeholder?: string; className?: string; minHeight?: string; sticky?: boolean; barOnFocus?: boolean }) {
  const last = React.useRef<string>("");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      TextExtras,
      BlockExtras,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      FontFamily,
      Link.configure({ openOnClick: false, autolink: true, protocols: ["https", "http", "mailto"] }),
      Picture.configure({ allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: false }),
      Placeholder.configure({ placeholder }),
      MyseedBlock,
    ],
    content: blocksToDoc(blocks),
    editorProps: { attributes: { class: cn("myseed-rich outline-none", className), style: `min-height:${minHeight}` } },
    onUpdate: ({ editor: e }) => {
      const next = docToBlocks(e.getJSON());
      last.current = JSON.stringify(next.map((b) => ({ ...b, id: "" })));
      onChange(next);
    },
  });
  // Blocks changed from outside (a template, an opened file) replace the content.
  React.useEffect(() => {
    if (!editor) return;
    const key = JSON.stringify(blocks.map((b) => ({ ...b, id: "" })));
    if (key !== last.current) {
      last.current = key;
      editor.commands.setContent(blocksToDoc(blocks), false);
    }
  }, [blocks, editor]);

  return (
    <div className="rich-doc group/rd relative">
      <style>{RICH_CSS}</style>
      {editor && (
        <div className={barOnFocus ? "pointer-events-none absolute inset-x-0 bottom-full z-30 mb-1 opacity-0 transition-opacity group-focus-within/rd:pointer-events-auto group-focus-within/rd:opacity-100 [&>div]:rounded-md [&>div]:border [&>div]:shadow-md" : undefined}>
          <Ribbon editor={editor} simple={simple} sticky={sticky && !barOnFocus} />
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function useTick(editor: Editor) {
  const [, set] = React.useState(0);
  React.useEffect(() => {
    const on = () => set((x) => x + 1);
    editor.on("transaction", on);
    return () => void editor.off("transaction", on);
  }, [editor]);
}

function Ribbon({ editor, simple, sticky }: { editor: Editor; simple: boolean; sticky: boolean }) {
  useTick(editor);
  const c = () => editor.chain().focus();
  const ts = editor.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string; color?: string };
  const style = editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : editor.isActive("blockquote") ? "quote" : "p";
  const inTable = editor.isActive("table");
  const pstyle = (editor.getAttributes("paragraph").pstyle ?? {}) as ParaStyle;
  const imgRef = React.useRef<HTMLInputElement>(null);
  const B = ({ icon: Icon, label, on, run, disabled }: { icon: React.ComponentType<{ className?: string }>; label: string; on?: boolean; run: () => void; disabled?: boolean }) => (
    <button type="button" title={label} aria-label={label} aria-pressed={on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run} className={cn("inline-flex size-7 items-center justify-center rounded hover:bg-muted disabled:opacity-40", on && "bg-primary/15 text-primary")}>
      <Icon className="size-4" />
    </button>
  );
  const Sep = () => <span className="mx-1 h-5 w-px bg-border" />;
  const insertBlock = (type: Block["type"]) => c().insertContent({ type: "myseedBlock", attrs: { block: newBlock(type) } }).run();
  return (
    <div className={cn("z-20 flex flex-wrap items-center gap-0.5 border-b bg-background/95 px-2 py-1 backdrop-blur", sticky && "sticky top-0")} role="toolbar" aria-label="Formatting">
      <input
        ref={imgRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 1_500_000) return alert("Use a picture under 1.5 MB.");
          const r = new FileReader();
          r.onload = () => c().setImage({ src: String(r.result) }).run();
          r.readAsDataURL(f);
        }}
      />
      <B icon={Undo2Icon} label="Undo (Ctrl+Z)" run={() => c().undo().run()} disabled={!editor.can().undo()} />
      <B icon={Redo2Icon} label="Redo (Ctrl+Y)" run={() => c().redo().run()} disabled={!editor.can().redo()} />
      <Sep />
      {!simple && (
        <select
          className="h-7 w-28 rounded border bg-background px-1 text-xs"
          aria-label="Style"
          value={style}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") c().setParagraph().run();
            else if (v === "quote") c().toggleBlockquote().run();
            else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
          }}
        >
          <option value="p">Normal</option>
          <option value="h1">Title</option>
          <option value="h2">Heading 1</option>
          <option value="h3">Heading 2</option>
          <option value="quote">Quote</option>
        </select>
      )}
      <select className="h-7 w-32 rounded border bg-background px-1 text-xs" aria-label="Font" value={ts.fontFamily ?? ""} onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}>
        <option value="">Default font</option>
        {FONTS.filter((f) => f.label !== "Default").map((f) => <option key={f.label} value={f.label}>{f.label}</option>)}
      </select>
      <select className="h-7 w-16 rounded border bg-background px-1 text-xs" aria-label="Size" value={ts.fontSize?.replace("pt", "") ?? ""} onChange={(e) => c().setMark("textStyle", { fontSize: e.target.value ? `${e.target.value}pt` : null }).run()}>
        <option value="">Size</option>
        {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <Sep />
      <B icon={BoldIcon} label="Bold (Ctrl+B)" on={editor.isActive("bold")} run={() => c().toggleBold().run()} />
      <B icon={ItalicIcon} label="Italic (Ctrl+I)" on={editor.isActive("italic")} run={() => c().toggleItalic().run()} />
      <B icon={UnderlineIcon} label="Underline (Ctrl+U)" on={editor.isActive("underline")} run={() => c().toggleUnderline().run()} />
      <B icon={StrikethroughIcon} label="Strike through" on={editor.isActive("strike")} run={() => c().toggleStrike().run()} />
      <B icon={SuperscriptIcon} label="Superscript" on={editor.isActive("superscript")} run={() => c().toggleSuperscript().run()} />
      <B icon={SubscriptIcon} label="Subscript" on={editor.isActive("subscript")} run={() => c().toggleSubscript().run()} />
      <B icon={CaseUpperIcon} label="Capitals" on={editor.getAttributes("textStyle").textTransform === "uppercase"} run={() => c().setMark("textStyle", { textTransform: editor.getAttributes("textStyle").textTransform === "uppercase" ? null : "uppercase" }).run()} />
      <Colors label="Font colour" value={ts.color} swatches={SWATCH} onPick={(v) => (v ? c().setColor(v).run() : c().unsetColor().run())}>
        <span className="text-sm font-bold leading-none">A</span>
      </Colors>
      <Colors label="Highlight" value={editor.getAttributes("highlight").color} swatches={MARKERS} onPick={(v) => (v ? c().setHighlight({ color: v }).run() : c().unsetHighlight().run())}>
        <HighlighterIcon className="size-3.5" />
      </Colors>
      <B icon={EraserIcon} label="Clear formatting" run={() => c().unsetAllMarks().run()} />
      <Sep />
      {([["left", AlignLeftIcon], ["center", AlignCenterIcon], ["right", AlignRightIcon], ["justify", AlignJustifyIcon]] as const).map(([a, I]) => (
        <B key={a} icon={I} label={`Align ${a}`} on={editor.isActive({ textAlign: a })} run={() => c().setTextAlign(a).run()} />
      ))}
      {!simple && (
        <>
          <B icon={ListIcon} label="Bullets" on={editor.isActive("bulletList")} run={() => c().toggleBulletList().run()} />
          <B icon={ListOrderedIcon} label="Numbering" on={editor.isActive("orderedList")} run={() => c().toggleOrderedList().run()} />
          <B icon={ListChecksIcon} label="Checklist" on={editor.isActive("taskList")} run={() => c().toggleTaskList().run()} />
          <B icon={IndentDecreaseIcon} label="Decrease indent" run={() => (editor.isActive("listItem") ? c().liftListItem("listItem").run() : c().updateAttributes("paragraph", { pstyle: { ...pstyle, indent: Math.max(0, (pstyle.indent ?? 0) - 10) || undefined } }).run())} />
          <B icon={IndentIncreaseIcon} label="Increase indent" run={() => (editor.isActive("listItem") ? c().sinkListItem("listItem").run() : c().updateAttributes("paragraph", { pstyle: { ...pstyle, indent: (pstyle.indent ?? 0) + 10 } }).run())} />
        </>
      )}
      <select className="h-7 w-[4.5rem] rounded border bg-background px-1 text-xs" aria-label="Line spacing" title="Line spacing" value={pstyle.lineHeight ?? ""} onChange={(e) => c().updateAttributes("paragraph", { pstyle: { ...pstyle, lineHeight: e.target.value ? Number(e.target.value) : undefined } }).run()}>
        <option value="">Spacing</option>
        {[1, 1.15, 1.5, 2].map((n) => <option key={n} value={n}>{n.toFixed(2)}</option>)}
      </select>
      {!simple && (
        <>
          <Sep />
          <TableGrid onPick={(rows, cols) => c().insertTable({ rows, cols, withHeaderRow: true }).run()} />
          <B icon={ImageIcon} label="Picture" run={() => imgRef.current?.click()} />
        </>
      )}
      <B
        icon={LinkIcon}
        label="Link"
        on={editor.isActive("link")}
        run={() => {
          const href = prompt("Link address (https://… or mailto:…)", editor.getAttributes("link").href ?? "");
          if (href === null) return;
          if (!href) return c().unsetLink().run();
          if (/^(https?:\/\/|mailto:)/i.test(href)) c().setLink({ href }).run();
        }}
      />
      {!simple && (
        <>
          <B icon={FootprintsIcon} label="Footnote" run={() => { const t = prompt("Footnote text"); if (t) c().insertContent(`^[${t.replace(/\]/g, ")")}]`).run(); }} />
          <B icon={QuoteIcon} label="Quote" on={editor.isActive("blockquote")} run={() => c().toggleBlockquote().run()} />
          <B icon={MinusIcon} label="Line" run={() => c().setHorizontalRule().run()} />
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex h-7 items-center rounded px-1.5 text-xs hover:bg-muted">More…</button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="start">
              {(
                [
                  ["pagebreak", ScissorsIcon, "Page break"],
                  ["section", SeparatorHorizontalIcon, "Section break"],
                  ["toc", ListTreeIcon, "Table of contents"],
                  ["columns", ColumnsIcon, "Two columns"],
                  ["textbox", RectangleHorizontalIcon, "Text box"],
                ] as const
              ).map(([t, I, l]) => (
                <button key={t} type="button" onClick={() => insertBlock(t)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <I className="size-4" /> {l}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </>
      )}
      {inTable && (
        <div className="flex w-full flex-wrap items-center gap-1 border-t pt-1 text-xs">
          <span className="font-medium text-primary">Table:</span>
          {(
            [
              ["Row above", () => c().addRowBefore().run()],
              ["Row below", () => c().addRowAfter().run()],
              ["Column left", () => c().addColumnBefore().run()],
              ["Column right", () => c().addColumnAfter().run()],
              ["Delete row", () => c().deleteRow().run()],
              ["Delete column", () => c().deleteColumn().run()],
              ["Merge cells", () => c().mergeCells().run()],
              ["Split cell", () => c().splitCell().run()],
              ["Header row", () => c().toggleHeaderRow().run()],
              ["Delete table", () => c().deleteTable().run()],
            ] as const
          ).map(([l, run]) => (
            <Button key={l} type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={run}>
              {l}
            </Button>
          ))}
          <span className="text-muted-foreground">A cell starting with = is a formula, such as =SUM(ABOVE).</span>
        </div>
      )}
    </div>
  );
}

function Colors({ label, value, swatches, onPick, children }: { label: string; value?: string; swatches: string[]; onPick: (v: string | null) => void; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} className="inline-flex h-7 w-8 flex-col items-center justify-center rounded hover:bg-muted">
          {children}
          <span className="mt-0.5 h-1 w-4 rounded-sm" style={{ background: value ?? "transparent", boxShadow: value ? undefined : "inset 0 0 0 1px #cbd5e1" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 space-y-2 p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="grid grid-cols-6 gap-1">
          {swatches.map((s) => <button key={s} type="button" aria-label={s} className="size-6 rounded border" style={{ background: s }} onClick={() => onPick(s)} />)}
        </div>
        <div className="flex items-center gap-2">
          <input type="color" aria-label="Any colour" onChange={(e) => onPick(e.target.value)} className="h-7 w-9 cursor-pointer" />
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => onPick(null)}>
            None
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TableGrid({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [h, setH] = React.useState({ r: 0, c: 0 });
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title="Table" aria-label="Insert a table" onMouseDown={(e) => e.preventDefault()} className="inline-flex size-7 items-center justify-center rounded hover:bg-muted">
          <TableIcon className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="mb-1 text-xs text-muted-foreground">{h.r ? `${h.r} × ${h.c} table` : "Insert a table"}</p>
        <div className="grid grid-cols-8 gap-0.5" onMouseLeave={() => setH({ r: 0, c: 0 })}>
          {Array.from({ length: 64 }, (_, i) => {
            const r = Math.floor(i / 8) + 1;
            const col = (i % 8) + 1;
            return <button key={i} type="button" aria-label={`${r} by ${col}`} onMouseEnter={() => setH({ r, c: col })} onClick={() => (onPick(r, col), setOpen(false))} className={cn("size-4 border", r <= h.r && col <= h.c ? "border-primary bg-primary/20" : "bg-background")} />;
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// How the page looks while typing (the same as print: headings, lists, tables, quotes, checklists).
const RICH_CSS = `
.myseed-rich{font-size:11pt;line-height:1.55;color:#111827}
.myseed-rich p{margin:0 0 6pt}
.myseed-rich h1{font-size:22pt;font-weight:700;margin:8pt 0 6pt;line-height:1.2}
.myseed-rich h2{font-size:15pt;font-weight:700;margin:12pt 0 5pt}
.myseed-rich h3{font-size:12.5pt;font-weight:600;margin:10pt 0 4pt}
.myseed-rich ul{list-style:disc;margin:0 0 6pt 18pt}.myseed-rich ol{list-style:decimal;margin:0 0 6pt 18pt}
.myseed-rich ol[type=a]{list-style:lower-alpha}.myseed-rich ol[type=A]{list-style:upper-alpha}.myseed-rich ol[type=i]{list-style:lower-roman}.myseed-rich ol[type=I]{list-style:upper-roman}
.myseed-rich li p{margin:0}
.myseed-rich ul[data-type=taskList]{list-style:none;margin-left:2pt}
.myseed-rich ul[data-type=taskList] li{display:flex;gap:6pt;align-items:flex-start}
.myseed-rich ul[data-type=taskList] li>label{margin-top:3pt}
.myseed-rich blockquote{border-left:3pt solid #94a3b8;margin:6pt 0;padding:2pt 10pt;color:#475569}
.myseed-rich hr{border:0;border-top:1px solid #cbd5e1;margin:10pt 0}
.myseed-rich a{color:#1d4ed8;text-decoration:underline}
.myseed-rich mark{border-radius:2px;padding:0 1px}
.myseed-rich table{border-collapse:collapse;width:100%;margin:6pt 0 10pt;table-layout:fixed}
.myseed-rich td,.myseed-rich th{border:1px solid #cbd5e1;padding:4pt 6pt;vertical-align:top;position:relative}
.myseed-rich th{background:#f1f5f9;font-weight:600;text-align:left}
.myseed-rich .selectedCell:after{content:"";position:absolute;inset:0;background:rgba(37,99,235,.12);pointer-events:none}
.myseed-rich .column-resize-handle{position:absolute;right:-2px;top:0;bottom:0;width:4px;background:#60a5fa;pointer-events:none}
.myseed-rich img{max-width:100%}
.myseed-rich img.ProseMirror-selectednode{outline:2px solid #60a5fa}
.myseed-rich p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:#94a3b8;float:left;height:0;pointer-events:none}
`;

// A letter's text (paragraphs separated by an empty line) typed with the rich editor. The editor keeps its own
// paragraphs while typing; it is reloaded only when the text changes from outside (a template, an opened letter).
export function RichBody({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const mine = React.useRef(value);
  const [blocks, setBlocks] = React.useState<Block[]>(() => bodyToBlocks(value));
  React.useEffect(() => {
    if (value !== mine.current) {
      mine.current = value;
      setBlocks(bodyToBlocks(value));
    }
  }, [value]);
  return (
    <RichDoc
      simple
      barOnFocus
      placeholder={placeholder}
      minHeight="45mm"
      blocks={blocks}
      onChange={(b) => {
        setBlocks(b);
        const v = blocksToBody(b);
        mine.current = v;
        onChange(v);
      }}
    />
  );
}
