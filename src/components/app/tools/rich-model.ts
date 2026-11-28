// The rich-text editor (TipTap, on ProseMirror) and the stored document model (blocks with inline marks) turned into
// each other. Blocks stay what is saved, compared, exported to Word and PDF and drawn in letters; the editor is only
// how they are typed. Blocks the editor has no node for (page and section breaks, contents, two columns, text boxes)
// travel as one "myseedBlock" node that keeps the block whole.

import type { JSONContent } from "@tiptap/core";
import { bid, parseInline, type Block, type ParaStyle, type TableStyle, type ListStyle } from "./doc-model";

type Mark = { type: string; attrs?: Record<string, unknown> };
const HEX = /^#[0-9a-f]{6}$/i;

// ---------------------------------------------------------------------------
// Inline: our marks to editor nodes
// ---------------------------------------------------------------------------

export function textToNodes(text: string): JSONContent[] {
  const out: JSONContent[] = [];
  for (const r of parseInline(text)) {
    if (r.break) out.push({ type: "hardBreak" });
    if (r.footnote !== undefined) {
      out.push({ type: "text", text: `^[${r.footnote}]` });
      continue;
    }
    if (!r.text) continue;
    const marks: Mark[] = [];
    if (r.bold) marks.push({ type: "bold" });
    if (r.italics) marks.push({ type: "italic" });
    if (r.underline && !r.link) marks.push({ type: "underline" });
    if (r.strike) marks.push({ type: "strike" });
    if (r.highlight || r.bg) marks.push({ type: "highlight", attrs: r.bg ? { color: r.bg } : {} });
    if (r.sup) marks.push({ type: "superscript" });
    if (r.sub) marks.push({ type: "subscript" });
    if (r.link) marks.push({ type: "link", attrs: { href: r.link } });
    const ts: Record<string, unknown> = {};
    if (r.color && HEX.test(r.color) && !(r.link && r.color === "#1d4ed8")) ts.color = r.color;
    if (r.size) ts.fontSize = `${r.size}pt`;
    if (r.font) ts.fontFamily = r.font;
    if (r.caps) ts.textTransform = "uppercase";
    if (Object.keys(ts).length) marks.push({ type: "textStyle", attrs: ts });
    out.push({ type: "text", text: r.text, ...(marks.length ? { marks } : {}) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inline: editor nodes back to our marks
// ---------------------------------------------------------------------------

function wrap(text: string, marks: Mark[] = []) {
  // Spaces stay outside the marks (so "**bold **" never happens).
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text.slice(lead.length))![0];
  let t = text.slice(lead.length, text.length - trail.length);
  if (!t) return text;
  const has = (k: string) => marks.find((m) => m.type === k);
  const spec: string[] = [];
  const ts = has("textStyle")?.attrs ?? {};
  if (typeof ts.color === "string" && HEX.test(ts.color)) spec.push(ts.color);
  const hl = has("highlight");
  if (hl && typeof hl.attrs?.color === "string" && HEX.test(hl.attrs.color)) spec.push(`bg${hl.attrs.color}`);
  if (typeof ts.fontSize === "string" && /^\d{1,2}(\.\d)?pt$/.test(ts.fontSize)) spec.push(ts.fontSize);
  if (typeof ts.fontFamily === "string" && /^[A-Za-z][\w '-]{0,39}$/.test(ts.fontFamily)) spec.push(`f:${ts.fontFamily}`);
  if (has("superscript")) spec.push("sup");
  if (has("subscript")) spec.push("sub");
  if (ts.textTransform === "uppercase") spec.push("caps");
  if (spec.length) t = `{${spec.join(";")}|${t}}`;
  if (hl && !(typeof hl.attrs?.color === "string" && HEX.test(hl.attrs.color))) t = `==${t}==`;
  if (has("strike")) t = `~~${t}~~`;
  if (has("underline")) t = `__${t}__`;
  if (has("italic")) t = `*${t}*`;
  if (has("bold")) t = `**${t}**`;
  const link = has("link");
  if (link && typeof link.attrs?.href === "string" && /^(https?:\/\/|mailto:)/i.test(link.attrs.href)) t = `[${t}](${link.attrs.href})`;
  return lead + t + trail;
}

export function nodesToText(content: JSONContent[] | undefined): string {
  return (content ?? []).map((n) => (n.type === "hardBreak" ? "\n" : n.type === "text" ? wrap(n.text ?? "", n.marks as Mark[]) : nodesToText(n.content))).join("");
}
// All the inline text of a node (a list item or a table cell may hold several paragraphs).
const innerText = (n: JSONContent): string => (n.content ?? []).map((c): string => (c.type === "paragraph" || c.type === "heading" ? nodesToText(c.content) : innerText(c))).filter((x) => x !== "").join("\n");

// ---------------------------------------------------------------------------
// Blocks to the editor's document
// ---------------------------------------------------------------------------

const para = (text: string, attrs: Record<string, unknown> = {}): JSONContent => ({ type: "paragraph", attrs, content: textToNodes(text) });

export function blocksToDoc(blocks: Block[]): JSONContent {
  const content: JSONContent[] = blocks.map((b): JSONContent => {
    switch (b.type) {
      case "heading":
        return { type: "heading", attrs: { level: b.level, textAlign: b.align ?? "left" }, content: textToNodes(b.text) };
      case "paragraph":
        return para(b.text, { textAlign: b.align ?? "left", pstyle: b.style && Object.keys(b.style).length ? b.style : null });
      case "list":
        if (b.style === "check") return { type: "taskList", content: b.items.map((t, i) => ({ type: "taskItem", attrs: { checked: !!b.checked?.[i] }, content: [para(t)] })) };
        return { type: b.ordered ? "orderedList" : "bulletList", attrs: b.ordered ? { listType: b.style && b.style !== "1" ? b.style : null } : {}, content: b.items.map((t) => ({ type: "listItem", content: [para(t)] })) };
      case "table": {
        const width = Math.max(1, ...b.rows.map((r) => r.length));
        return {
          type: "table",
          attrs: { tstyle: b.style ?? null },
          content: b.rows.map((r, i) => {
            const cells: JSONContent[] = [];
            for (let j = 0; j < width; j++) {
              const v = r[j] ?? "";
              if (v === "<" && cells.length) {
                const last = cells.at(-1)!;
                last.attrs = { ...last.attrs, colspan: Number(last.attrs?.colspan ?? 1) + 1 };
                continue;
              }
              const head = i === 0 && b.header;
              const st = b.style;
              const tcell = st && (st.border || (head && (st.headFill || st.headColor))) ? { ...(head && st.headFill ? { fill: st.headFill } : {}), ...(head && st.headColor ? { color: st.headColor } : {}), ...(st.border ? { border: st.border } : {}) } : null;
              cells.push({ type: head ? "tableHeader" : "tableCell", attrs: { colspan: 1, rowspan: 1, ...(tcell ? { tcell } : {}) }, content: [para(v)] });
            }
            return { type: "tableRow", content: cells };
          }),
        };
      }
      case "quote":
        return { type: "blockquote", content: [para(b.text)] };
      case "divider":
        return { type: "horizontalRule" };
      case "image":
        return { type: "image", attrs: { src: b.src, alt: b.caption ?? "", width: b.width, align: b.align } };
      default:
        return { type: "myseedBlock", attrs: { block: b } };
    }
  });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

// ---------------------------------------------------------------------------
// The editor's document back to blocks
// ---------------------------------------------------------------------------

export function docToBlocks(doc: JSONContent): Block[] {
  const out: Block[] = [];
  for (const n of doc.content ?? []) {
    const a = (n.attrs ?? {}) as Record<string, unknown>;
    const align = (v: unknown) => (v === "center" || v === "right" || v === "justify" ? v : undefined);
    switch (n.type) {
      case "heading":
        out.push({ id: bid(), type: "heading", level: Math.min(3, Math.max(1, Number(a.level) || 1)) as 1 | 2 | 3, text: nodesToText(n.content), align: align(a.textAlign) as "center" | "right" | undefined });
        break;
      case "paragraph":
        out.push({ id: bid(), type: "paragraph", text: nodesToText(n.content), align: align(a.textAlign) as "center" | "right" | "justify" | undefined, ...(a.pstyle ? { style: a.pstyle as ParaStyle } : {}) });
        break;
      case "bulletList":
      case "orderedList":
        out.push({ id: bid(), type: "list", ordered: n.type === "orderedList", items: (n.content ?? []).map(innerText), ...(n.type === "orderedList" && a.listType ? { style: a.listType as ListStyle } : {}) });
        break;
      case "taskList":
        out.push({ id: bid(), type: "list", ordered: false, style: "check", items: (n.content ?? []).map(innerText), checked: (n.content ?? []).map((i) => !!i.attrs?.checked) });
        break;
      case "table": {
        const rows = (n.content ?? []).map((r) => (r.content ?? []).flatMap((c) => [innerText(c), ...Array(Math.max(0, Number(c.attrs?.colspan ?? 1) - 1)).fill("<")]));
        const header = (n.content?.[0]?.content ?? []).some((c) => c.type === "tableHeader");
        out.push({ id: bid(), type: "table", header, rows: rows.length ? rows : [[""]], ...(a.tstyle ? { style: a.tstyle as TableStyle } : {}) });
        break;
      }
      case "blockquote":
        out.push({ id: bid(), type: "quote", text: innerText(n) });
        break;
      case "horizontalRule":
        out.push({ id: bid(), type: "divider" });
        break;
      case "image":
        if (typeof a.src === "string") out.push({ id: bid(), type: "image", src: a.src, width: Number(a.width) || 60, align: a.align === "left" || a.align === "right" ? a.align : "center", caption: typeof a.alt === "string" && a.alt ? a.alt : undefined });
        break;
      case "myseedBlock":
        if (a.block && typeof a.block === "object") out.push({ ...(a.block as Block), id: (a.block as Block).id || bid() });
        break;
    }
  }
  // An empty last paragraph (the caret's resting place) is not saved.
  while (out.length > 1 && out.at(-1)!.type === "paragraph" && !(out.at(-1) as { text: string }).text) out.pop();
  return out;
}

// A letter's body (paragraphs separated by an empty line) as blocks and back.
export const bodyToBlocks = (body: string): Block[] => (body.trim() ? body.split(/\n\s*\n/).map((p) => ({ id: bid(), type: "paragraph" as const, text: p.trim() })) : [{ id: bid(), type: "paragraph", text: "" }]);
export const blocksToBody = (blocks: Block[]) =>
  blocks
    .map((b) => (b.type === "list" ? b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : "•"} ${i}`).join("\n") : "text" in b ? b.text : ""))
    .filter((t) => t !== "")
    .join("\n\n");
