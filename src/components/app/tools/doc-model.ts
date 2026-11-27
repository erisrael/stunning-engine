// The Document Builder's and Letter Generator's content model, and its two outputs: a Word file (docx, built in the
// browser) and print-ready HTML (saved as PDF from the print dialog, as the app's other PDF reports are). All text
// is escaped before it goes into HTML.

import type { Letterhead } from "@/lib/tools";
import { computeTable } from "@/lib/formula";

// Paragraph settings: font, size (pt), colour, line spacing, space before and after (pt), indents (mm).
export type ParaStyle = { font?: string; size?: number; color?: string; lineHeight?: number; before?: number; after?: number; indent?: number; firstLine?: number };

export type Block =
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string; align?: "left" | "center" | "right" }
  | { id: string; type: "paragraph"; text: string; align?: "left" | "center" | "right" | "justify"; style?: ParaStyle }
  // style: 1, a, A, i, I numbering or a checklist (checked marks which items are ticked).
  | { id: string; type: "list"; ordered: boolean; items: string[]; style?: ListStyle; checked?: boolean[] }
  // Cells starting with "=" are formulas (=SUM(ABOVE), =B2*C2…); a cell that is exactly "<" joins the cell on its left.
  | { id: string; type: "table"; header: boolean; rows: string[][]; style?: TableStyle }
  | { id: string; type: "toc"; title?: string }
  | { id: string; type: "columns"; left: string; right: string; rule?: boolean }
  | { id: string; type: "quote"; text: string }
  | { id: string; type: "divider" }
  | { id: string; type: "pagebreak" }
  // A new section starts on a new page (in Word, a section break: its own page numbering can follow).
  | { id: string; type: "section"; title?: string }
  | { id: string; type: "image"; src: string; width: number; align: "left" | "center" | "right"; caption?: string }
  | { id: string; type: "textbox"; text: string; border: string; fill: string; align: "left" | "right" | "full"; width: number };

export type ListStyle = "1" | "a" | "A" | "i" | "I" | "check";
export type TableStyle = { headFill?: string; headColor?: string; border?: string; stripe?: string | null; align?: ("left" | "center" | "right")[]; widths?: number[]; size?: number; borders?: "all" | "rows" | "none" };
// Page setup of a document (Document Builder): paper, margins, header and footer text, page numbers, a watermark.
export type DocPage = { size: "A4" | "A5" | "Letter" | "Legal"; orientation: "portrait" | "landscape"; margins: { top: number; right: number; bottom: number; left: number }; header: string; footer: string; pageNumbers: boolean; watermark: string };
export const DOC_PAPER: Record<DocPage["size"], { w: number; h: number }> = { A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 }, Letter: { w: 215.9, h: 279.4 }, Legal: { w: 215.9, h: 355.6 } };
export const DEFAULT_PAGE: DocPage = { size: "A4", orientation: "portrait", margins: { top: 20, right: 18, bottom: 20, left: 18 }, header: "", footer: "", pageNumbers: true, watermark: "" };

export const FONTS: { label: string; css: string; word: string }[] = [
  { label: "Default", css: "", word: "" },
  { label: "Calibri", css: "Calibri, Arial, 'Noto Sans Ethiopic', sans-serif", word: "Calibri" },
  { label: "Arial", css: "Arial, 'Noto Sans Ethiopic', sans-serif", word: "Arial" },
  { label: "Times New Roman", css: "'Times New Roman', 'Noto Serif Ethiopic', serif", word: "Times New Roman" },
  { label: "Georgia", css: "Georgia, 'Noto Serif Ethiopic', serif", word: "Georgia" },
  { label: "Cambria", css: "Cambria, Georgia, serif", word: "Cambria" },
  { label: "Nyala (Amharic)", css: "Nyala, 'Noto Sans Ethiopic', sans-serif", word: "Nyala" },
  { label: "Abyssinica SIL (Amharic)", css: "'Abyssinica SIL', 'Noto Serif Ethiopic', serif", word: "Abyssinica SIL" },
  { label: "Courier New", css: "'Courier New', monospace", word: "Courier New" },
  { label: "Verdana", css: "Verdana, 'Noto Sans Ethiopic', sans-serif", word: "Verdana" },
  { label: "Garamond", css: "Garamond, 'Noto Serif Ethiopic', serif", word: "Garamond" },
  { label: "Segoe UI", css: "'Segoe UI', 'Noto Sans Ethiopic', sans-serif", word: "Segoe UI" },
  { label: "Noto Sans Ethiopic", css: "'Noto Sans Ethiopic', sans-serif", word: "Noto Sans Ethiopic" },
];
const fontCss = (f?: string) => FONTS.find((x) => x.label === f)?.css ?? "";
const fontWord = (f?: string) => FONTS.find((x) => x.label === f)?.word || undefined;

// layout: the cover, header and footer and page numbering (page-layout.ts); older documents have none.
export type DocData = { template: string; blocks: Block[]; meta?: { subtitle?: string; author?: string; date?: string }; page?: DocPage; layout?: import("./page-layout").DocLayout };

export const bid = () => Math.random().toString(36).slice(2, 10);
const h = (level: 1 | 2 | 3, text: string): Block => ({ id: bid(), type: "heading", level, text });
const p = (text: string): Block => ({ id: bid(), type: "paragraph", text });
const ul = (...items: string[]): Block => ({ id: bid(), type: "list", ordered: false, items });
const ol = (...items: string[]): Block => ({ id: bid(), type: "list", ordered: true, items });
const table = (...rows: string[][]): Block => ({ id: bid(), type: "table", header: true, rows });

export const DOC_TEMPLATES: { key: string; label: string; hint: string; blocks: () => Block[] }[] = [
  { key: "blank", label: "Blank", hint: "An empty page", blocks: () => [h(1, "Title"), p("")] },
  {
    key: "minutes",
    label: "Meeting minutes",
    hint: "Attendees, agenda, decisions, actions",
    blocks: () => [h(1, "Meeting minutes"), p("**Date:**  \n**Attendees:**  \n**Chair:**"), h(2, "Agenda"), ol("Item one", "Item two"), h(2, "Decisions"), ul("Decision"), h(2, "Actions"), table(["Action", "Owner", "Due"], ["", "", ""]), h(2, "Next meeting"), p("")],
  },
  {
    key: "report",
    label: "Report",
    hint: "Summary, findings, recommendations",
    blocks: () => [h(1, "Report title"), p("**Prepared by:**  \n**Period:**"), h(2, "Executive summary"), p(""), h(2, "Findings"), ul("Finding"), h(2, "Figures"), table(["Measure", "Target", "Actual"], ["", "", ""]), h(2, "Recommendations"), ol("Recommendation"), h(2, "Next steps"), p("")],
  },
  {
    key: "proposal",
    label: "Proposal",
    hint: "Problem, solution, budget, timeline",
    blocks: () => [h(1, "Proposal"), h(2, "Background"), p(""), h(2, "Objectives"), ul("Objective"), h(2, "Approach"), p(""), h(2, "Budget"), table(["Item", "Quantity", "Cost (ETB)"], ["", "", ""]), h(2, "Timeline"), table(["Milestone", "Date"], ["", ""]), h(2, "Approval"), p("Requested by:  \nApproved by:")],
  },
  {
    key: "sop",
    label: "Procedure (SOP)",
    hint: "Purpose, scope, steps, responsibilities",
    blocks: () => [h(1, "Standard operating procedure"), p("**Owner:**  \n**Version:** 1.0  \n**Effective:**"), h(2, "Purpose"), p(""), h(2, "Scope"), p(""), h(2, "Responsibilities"), table(["Role", "Responsibility"], ["", ""]), h(2, "Procedure"), ol("Step one", "Step two"), h(2, "Records"), ul("")],
  },
  {
    key: "memo",
    label: "Internal memo",
    hint: "To, from, subject, message",
    blocks: () => [h(1, "Memo"), p("**To:**  \n**From:**  \n**Date:**  \n**Subject:**"), { id: bid(), type: "divider" }, p(""), p("Regards,")],
  },
];

// A block's starting content when added from the toolbar.
export function newBlock(type: Block["type"]): Block {
  switch (type) {
    case "heading":
      return h(2, "Heading");
    case "list":
      return ul("");
    case "table":
      return table(["Column 1", "Column 2"], ["", ""]);
    case "quote":
      return { id: bid(), type: "quote", text: "" };
    case "divider":
      return { id: bid(), type: "divider" };
    case "pagebreak":
      return { id: bid(), type: "pagebreak" };
    case "section":
      return { id: bid(), type: "section", title: "" };
    case "image":
      return { id: bid(), type: "image", src: "", width: 60, align: "center", caption: "" };
    case "textbox":
      return { id: bid(), type: "textbox", text: "", border: "#94a3b8", fill: "#f8fafc", align: "full", width: 100 };
    case "toc":
      return { id: bid(), type: "toc", title: "Contents" };
    case "columns":
      return { id: bid(), type: "columns", left: "", right: "" };
    default:
      return p("");
  }
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const HEX = /^#[0-9a-f]{6}$/i;
const SAFE_URL = /^(https?:\/\/|mailto:)[^\s"'<>]+$/i;

// Inline formatting, written as marks in the text (the toolbar adds them): **bold**, *italic*, __underline__,
// ~~struck~~, ==highlight==, {#c00000|coloured text}, [link text](https://…) and ^[a footnote]. A newline is a
// line break. The same parser feeds the HTML (PDF) and the Word file, so both agree.
// {spec|text} takes one or more of: #c00000 (colour), bg#fff2cc (highlight colour), 14pt (size), f:Georgia (font),
// sup, sub and caps, joined by ";" (for example {#1d4ed8;14pt;f:Georgia|text}).
export type Run = { text: string; bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; highlight?: boolean; color?: string; link?: string; footnote?: string; break?: boolean; bg?: string; size?: number; font?: string; sup?: boolean; sub?: boolean; caps?: boolean };
const SPEC = "(?:#[0-9a-fA-F]{6}|bg#[0-9a-fA-F]{6}|\\d{1,2}(?:\\.\\d)?pt|f:[A-Za-z][\\w '-]{0,39}|sup|sub|caps)";
const INLINE_SRC = new RegExp(`\\*\\*(.+?)\\*\\*|__(.+?)__|~~(.+?)~~|==(.+?)==|\\{(${SPEC}(?:;${SPEC})*)\\|(.+?)\\}|\\[([^\\]]+)\\]\\(([^)\\s]+)\\)|\\^\\[([^\\]]+)\\]|\\*(?!\\s)(.+?)\\*`, "g");
function specOf(spec: string): Omit<Run, "text"> {
  const out: Omit<Run, "text"> = {};
  for (const t of spec.split(";")) {
    if (/^#[0-9a-f]{6}$/i.test(t)) out.color = t;
    else if (/^bg#[0-9a-f]{6}$/i.test(t)) out.bg = t.slice(2);
    else if (/pt$/.test(t)) out.size = Math.min(72, Math.max(5, Number(t.slice(0, -2))));
    else if (t.startsWith("f:")) out.font = t.slice(2);
    else if (t === "sup") out.sup = true;
    else if (t === "sub") out.sub = true;
    else if (t === "caps") out.caps = true;
  }
  return out;
}
export function parseInline(text: string, base: Omit<Run, "text"> = {}, depth = 0): Run[] {
  const out: Run[] = [];
  text.split(/ {2}\n|\n/).forEach((line, li) => {
    let last = 0;
    let first = true;
    const push = (r: Run) => {
      out.push({ ...r, ...(li > 0 && first ? { break: true } : {}) });
      first = false;
    };
    const inner = (t: string, add: Omit<Run, "text">) => {
      const rs = depth < 3 ? parseInline(t, { ...base, ...add }, depth + 1) : [{ text: t, ...base, ...add }];
      rs.forEach((r, i) => push(i === 0 ? r : { ...r, break: r.break }));
    };
    // A pattern of its own for each call: the nested calls below would otherwise move the outer loop's position.
    const INLINE = new RegExp(INLINE_SRC.source, "g");
    let m: RegExpExecArray | null;
    while ((m = INLINE.exec(line))) {
      if (m.index > last) push({ text: line.slice(last, m.index), ...base });
      if (m[1] !== undefined) inner(m[1], { bold: true });
      else if (m[2] !== undefined) inner(m[2], { underline: true });
      else if (m[3] !== undefined) inner(m[3], { strike: true });
      else if (m[4] !== undefined) inner(m[4], { highlight: true });
      else if (m[5] !== undefined) inner(m[6]!, specOf(m[5]));
      else if (m[7] !== undefined) {
        const url = SAFE_URL.test(m[8]!) ? m[8]! : undefined;
        inner(m[7], url ? { link: url, underline: true, color: base.color ?? "#1d4ed8" } : {});
      } else if (m[9] !== undefined) push({ text: "", footnote: m[9] });
      else if (m[10] !== undefined) inner(m[10], { italics: true });
      last = m.index + m[0].length;
    }
    if (last < line.length || first) push({ text: line.slice(last), ...base });
  });
  return out;
}

// HTML for runs; footnotes are numbered into the list given (shown as notes at the end of the document).
export function runsHtml(runs: Run[], notes?: string[]) {
  return runs
    .map((r) => {
      if (r.footnote !== undefined) {
        if (!notes) return "";
        notes.push(r.footnote);
        return `<sup class="fn">${notes.length}</sup>`;
      }
      let t = esc(r.text);
      if (r.bold) t = `<strong>${t}</strong>`;
      if (r.italics) t = `<em>${t}</em>`;
      if (r.underline) t = `<u>${t}</u>`;
      if (r.strike) t = `<s>${t}</s>`;
      if (r.highlight) t = `<mark>${t}</mark>`;
      if (r.sup) t = `<sup>${t}</sup>`;
      if (r.sub) t = `<sub>${t}</sub>`;
      const css = [r.color && HEX.test(r.color) ? `color:${r.color}` : "", r.bg && HEX.test(r.bg) ? `background:${r.bg}` : "", r.size ? `font-size:${r.size}pt` : "", r.font && fontCss(r.font) ? `font-family:${fontCss(r.font)}` : r.font && /^[\w '-]+$/.test(r.font) ? `font-family:'${r.font}'` : "", r.caps ? "text-transform:uppercase" : ""].filter(Boolean).join(";");
      if (css) t = `<span style="${css}">${t}</span>`;
      if (r.link) t = `<a href="${esc(r.link)}" rel="noopener noreferrer">${t}</a>`;
      return (r.break ? "<br>" : "") + t;
    })
    .join("");
}

// Inline marks to HTML on escaped text (footnotes are left out where there is no notes list).
export function inlineHtml(text: string, notes?: string[]) {
  return runsHtml(parseInline(text), notes);
}

// Runs for Word (kept for callers that only need bold, italics and breaks).
export function runsOf(text: string): Run[] {
  return parseInline(text);
}

function paraStyle(s?: ParaStyle) {
  if (!s) return "";
  const out: string[] = [];
  if (fontCss(s.font)) out.push(`font-family:${fontCss(s.font)}`);
  if (s.size) out.push(`font-size:${Math.min(48, Math.max(6, s.size))}pt`);
  if (s.color && HEX.test(s.color)) out.push(`color:${s.color}`);
  if (s.lineHeight) out.push(`line-height:${Math.min(3, Math.max(1, s.lineHeight))}`);
  if (s.before != null) out.push(`margin-top:${Math.min(72, Math.max(0, s.before))}pt`);
  if (s.after != null) out.push(`margin-bottom:${Math.min(72, Math.max(0, s.after))}pt`);
  if (s.indent) out.push(`margin-left:${Math.min(100, Math.max(0, s.indent))}mm`);
  if (s.firstLine) out.push(`text-indent:${Math.min(50, Math.max(-20, s.firstLine))}mm`);
  return out.join(";");
}
const IMG_SRC = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

// A table's cells worked out (formulas) and laid out (cells joined with "<").
export function tableLayout(b: Extract<Block, { type: "table" }>) {
  const width = Math.max(1, ...b.rows.map((r) => r.length));
  const rows = computeTable(b.rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")));
  return rows.map((r) => {
    const cells: { text: string; span: number; col: number }[] = [];
    r.forEach((c, j) => {
      if (c === "<" && cells.length) cells.at(-1)!.span++;
      else cells.push({ text: c === "<" ? "" : c, span: 1, col: j });
    });
    return cells;
  });
}

function tableHtml(b: Extract<Block, { type: "table" }>, notes: string[]) {
  const st = b.style ?? {};
  const border = HEX.test(st.border ?? "") ? st.border! : "#cbd5e1";
  const lines = st.borders ?? "all";
  const cellBorder = lines === "none" ? "border:0" : lines === "rows" ? `border:0;border-bottom:1px solid ${border}` : `border:1px solid ${border}`;
  const widths = st.widths?.length ? `<colgroup>${st.widths.map((w) => `<col style="width:${Math.min(100, Math.max(3, w))}%">`).join("")}</colgroup>` : "";
  const body = tableLayout(b)
    .map((r, i) => {
      const head = i === 0 && b.header;
      const stripe = !head && st.stripe && HEX.test(st.stripe) && i % 2 === (b.header ? 0 : 1) ? `background:${st.stripe};` : "";
      return `<tr>${r
        .map((c) => {
          const align = st.align?.[c.col] ?? (/^[-+]?[\d,.]+%?$/.test(c.text.trim()) && !head ? "right" : "left");
          const style = `${cellBorder};text-align:${align};${stripe}${head && st.headFill && HEX.test(st.headFill) ? `background:${st.headFill};` : ""}${head && st.headColor && HEX.test(st.headColor) ? `color:${st.headColor};` : ""}`;
          return `<${head ? "th" : "td"}${c.span > 1 ? ` colspan="${c.span}"` : ""} style="${style}">${inlineHtml(c.text, notes)}</${head ? "th" : "td"}>`;
        })
        .join("")}</tr>`;
    })
    .join("");
  return `<table style="${st.size ? `font-size:${Math.min(20, Math.max(6, st.size))}pt;` : ""}table-layout:${widths ? "fixed" : "auto"}">${widths}${body}</table>`;
}

const ROMAN = (n: number) => {
  const v = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const r = ["m", "cm", "d", "cd", "c", "xc", "l", "xl", "x", "ix", "v", "iv", "i"];
  let out = "";
  for (let i = 0; i < v.length; i++) while (n >= v[i]!) (out += r[i]), (n -= v[i]!);
  return out;
};
export function listMarker(style: ListStyle | undefined, ordered: boolean, n: number, checked?: boolean) {
  if (style === "check") return checked ? "[x] " : "[ ] ";
  if (!ordered) return "• ";
  const k = n + 1;
  if (style === "a") return `${String.fromCharCode(96 + (((k - 1) % 26) + 1))}. `;
  if (style === "A") return `${String.fromCharCode(64 + (((k - 1) % 26) + 1))}. `;
  if (style === "i") return `${ROMAN(k)}. `;
  if (style === "I") return `${ROMAN(k).toUpperCase()}. `;
  return `${k}. `;
}

// headsFrom: the whole document, when only one part of it is drawn (the contents lists every heading).
export function blocksHtml(blocks: Block[], headsFrom?: Block[]) {
  const notes: string[] = [];
  const heads = (headsFrom ?? blocks).filter((b): b is Extract<Block, { type: "heading" }> => b.type === "heading");
  const html = blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `<h${b.level} id="h-${esc(b.id)}"${b.align ? ` style="text-align:${b.align}"` : ""}>${inlineHtml(b.text, notes)}</h${b.level}>`;
        case "toc":
          return `<nav class="toc" style="margin:2mm 0 5mm">${b.title ? `<p style="font-weight:700;font-size:13pt;margin:0 0 2mm">${esc(b.title)}</p>` : ""}${heads
            .map((h) => `<div style="margin-left:${(h.level - 1) * 6}mm;border-bottom:1px dotted #cbd5e1;padding:0.6mm 0"><a href="#h-${esc(h.id)}" style="color:inherit;text-decoration:none">${esc(h.text.replace(/\*\*|__|~~|==/g, ""))}</a></div>`)
            .join("")}</nav>`;
        case "columns":
          return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin:2mm 0;${b.rule ? "background:linear-gradient(#cbd5e1,#cbd5e1) center/1px 100% no-repeat;" : ""}"><div>${b.left.split(/\n\s*\n/).map((p) => `<p>${inlineHtml(p, notes)}</p>`).join("")}</div><div>${b.right.split(/\n\s*\n/).map((p) => `<p>${inlineHtml(p, notes)}</p>`).join("")}</div></div>`;
        case "paragraph":
          return `<p style="text-align:${b.align ?? "left"};${paraStyle(b.style)}">${inlineHtml(b.text, notes) || "&nbsp;"}</p>`;
        case "list":
          if (b.style === "check") return `<ul style="list-style:none;margin-left:0;padding-left:0">${b.items.map((i, n) => `<li><span class="chk" style="display:inline-block;width:3.2mm;height:3.2mm;border:0.3mm solid #334155;border-radius:0.6mm;margin-right:1.5mm;text-align:center;line-height:3mm;font-size:8pt;vertical-align:-0.4mm">${b.checked?.[n] ? "✓" : ""}</span>${inlineHtml(i, notes)}</li>`).join("")}</ul>`;
          return `<${b.ordered ? "ol" : "ul"}${b.ordered && b.style && b.style !== "1" ? ` type="${b.style}"` : ""}>${b.items.map((i) => `<li>${inlineHtml(i, notes)}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
        case "table":
          return tableHtml(b, notes);
        case "quote":
          return `<blockquote>${inlineHtml(b.text, notes)}</blockquote>`;
        case "divider":
          return "<hr>";
        case "pagebreak":
          return '<div style="page-break-after:always;break-after:page"></div>';
        case "section":
          return `<div style="page-break-before:always;break-before:page"></div>${b.title ? `<h2>${esc(b.title)}</h2>` : ""}`;
        case "image":
          if (!IMG_SRC.test(b.src)) return "";
          return `<figure style="margin:3mm 0;text-align:${b.align}"><img src="${b.src}" alt="${esc(b.caption ?? "")}" style="width:${Math.min(100, Math.max(5, b.width))}%;height:auto">${b.caption ? `<figcaption style="font-size:8.5pt;color:#64748b">${esc(b.caption)}</figcaption>` : ""}</figure>`;
        case "textbox":
          return `<div style="border:0.4mm solid ${HEX.test(b.border) ? b.border : "#94a3b8"};background:${HEX.test(b.fill) ? b.fill : "#f8fafc"};padding:3mm 4mm;margin:3mm 0;${b.align === "full" ? "" : `float:${b.align};width:${Math.min(100, Math.max(20, b.width))}%;margin-${b.align === "left" ? "right" : "left"}:4mm`};break-inside:avoid">${inlineHtml(b.text, notes)}</div>`;
      }
    })
    .join("\n");
  return notes.length ? `${html}<div style="clear:both"></div><section class="notes" style="margin-top:6mm;border-top:1px solid #cbd5e1;padding-top:2mm;font-size:8.5pt;color:#334155"><ol style="margin:0 0 0 5mm;padding:0">${notes.map((n) => `<li>${inlineHtml(n)}</li>`).join("")}</ol></section>` : html;
}

export { fontWord, IMG_SRC };

// Opens the print dialog for the page (save as PDF there). Pictures are data URLs or same-site, so nothing leaks.
export function printHtml(title: string, body: string, css = "") {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    alert("Allow pop-ups for this site to save as PDF.");
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="viewport" content="width=device-width">
<style>
@page{size:A4;margin:18mm 16mm}
*{box-sizing:border-box}
body{font-family:"Segoe UI",Arial,"Noto Sans Ethiopic",sans-serif;color:#111827;font-size:11pt;line-height:1.5;margin:0}
h1{font-size:20pt;margin:0 0 8pt} h2{font-size:14pt;margin:14pt 0 6pt} h3{font-size:12pt;margin:10pt 0 4pt}
p{margin:0 0 6pt} ul,ol{margin:0 0 6pt 18pt;padding:0}
table{border-collapse:collapse;width:100%;margin:6pt 0 10pt} th,td{border:1px solid #cbd5e1;padding:4pt 6pt;text-align:left;vertical-align:top} th{background:#f1f5f9}
blockquote{border-left:3pt solid #94a3b8;margin:6pt 0;padding:2pt 10pt;color:#475569}
hr{border:0;border-top:1px solid #cbd5e1;margin:10pt 0}
${css}
</style></head><body>${body}<script>window.onload=()=>{setTimeout(()=>{window.focus();window.print();},300)}<\/script></body></html>`);
  w.document.close();
}

// Word file from blocks (with an optional letterhead header and footer).
// A template's page for Word: size and margins in millimetres, and the header and footer texts of the first and the
// later pages (Correspondence templates).
export type DocxBand = { text: string; align: "left" | "center" | "right"; size: number; bold: boolean; color: string }[];
export type DocxPage = { w: number; h: number; margins: { top: number; right: number; bottom: number; left: number }; differentFirst: boolean; header: { first: DocxBand; rest: DocxBand; even?: DocxBand }; footer: { first: DocxBand; rest: DocxBand; even?: DocxBand }; pageNumbers: boolean; footerNote?: string; oddEven?: boolean; mirror?: boolean };

// layout: the Document Builder's cover, header and footer and numbering (real Word sections; see page-layout.ts).
export type DocxLayout = {
  layout: import("./page-layout").DocLayout;
  hf: import("./page-layout").HeaderFooter | null;
  fields: { title: string; author: string; date: string; company: string };
  page: { w: number; h: number; margins: { top: number; right: number; bottom: number; left: number } };
  pageNumbers: boolean;
};
export async function blocksDocx(opts: { title: string; blocks: Block[]; letterhead?: Letterhead & { logoData?: Uint8Array | null; logoType?: "png" | "jpg" }; before?: Block[]; after?: Block[]; page?: DocxPage; layout?: DocxLayout }) {
  const d = await import("docx");
  const { AlignmentType, BorderStyle, Bookmark, Document, ExternalHyperlink, Footer, FootnoteReferenceRun, Header, HeadingLevel, ImageRun, InternalHyperlink, LeaderType, NumberFormat, Packer, PageBreak, PageNumber, PageReference, Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType, ShadingType } = d;
  // Headings carry bookmarks so the contents links to them and shows their page numbers (PAGEREF fields), which
  // Word, LibreOffice and other Word-compatible apps fill in; Word's own TOC field stays empty outside Word.
  const all = [...(opts.before ?? []), ...opts.blocks, ...(opts.after ?? [])];
  const withToc = all.some((b) => b.type === "toc");
  const anchor = (id: string) => `toc_${id.replace(/[^A-Za-z0-9]/g, "")}`;
  const headings = all.filter((b): b is Extract<Block, { type: "heading" }> => b.type === "heading" && !!b.text.trim());
  const color = (hex: string) => hex.replace("#", "");
  // Footnotes are numbered across the document, as Word does.
  const footnotes: Record<number, { children: InstanceType<typeof Paragraph>[] }> = {};
  let fn = 0;
  type Child = InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink> | InstanceType<typeof FootnoteReferenceRun>;
  const runs = (text: string, extra: Record<string, unknown> = {}): Child[] =>
    parseInline(text).map((r): Child => {
      if (r.footnote !== undefined) {
        fn += 1;
        footnotes[fn] = { children: [new Paragraph({ children: parseInline(r.footnote).map((x) => new TextRun({ text: x.text, bold: x.bold, italics: x.italics })) })] };
        return new FootnoteReferenceRun(fn);
      }
      const run = new TextRun({ text: r.text, bold: r.bold, italics: r.italics, underline: r.underline ? {} : undefined, strike: r.strike, highlight: r.highlight ? "yellow" : undefined, color: r.color ? color(r.color) : undefined, break: r.break ? 1 : undefined, ...extra, ...(r.size ? { size: Math.round(r.size * 2) } : {}), ...(r.font ? { font: fontWord(r.font) ?? r.font } : {}), ...(r.bg && /^#[0-9a-f]{6}$/i.test(r.bg) ? { shading: { type: ShadingType.CLEAR, fill: color(r.bg), color: "auto" } } : {}), ...(r.sup ? { superScript: true } : {}), ...(r.sub ? { subScript: true } : {}), ...(r.caps ? { allCaps: true } : {}) });
      return r.link ? new ExternalHyperlink({ link: r.link, children: [run] }) : run;
    });
  const align = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED, left: AlignmentType.LEFT, full: AlignmentType.LEFT };
  const mmTw = (mm: number) => Math.round(mm * 56.6929);
  const dataBytes = (src: string) => {
    const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(src);
    if (!m) return null;
    const bin = atob(m[2]!);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { data: out, type: (m[1] === "jpeg" ? "jpg" : m[1] === "gif" ? "gif" : "png") as "png" | "jpg" | "gif" };
  };
  const SECTION = Symbol("section");
  const para = (b: Block): (InstanceType<typeof Paragraph> | InstanceType<typeof Table> | typeof SECTION)[] => {
    switch (b.type) {
      case "heading":
        return [new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][b.level - 1], alignment: b.align ? align[b.align] : undefined, children: withToc ? [new Bookmark({ id: anchor(b.id), children: runs(b.text) })] : runs(b.text) })];
      case "paragraph": {
        const st = b.style ?? {};
        const extra: Record<string, unknown> = {};
        if (fontWord(st.font)) extra.font = fontWord(st.font);
        if (st.size) extra.size = Math.round(Math.min(48, Math.max(6, st.size)) * 2);
        if (st.color && /^#[0-9a-f]{6}$/i.test(st.color)) extra.color = color(st.color);
        return [
          new Paragraph({
            alignment: align[b.align ?? "left"],
            spacing: { before: st.before != null ? Math.round(st.before * 20) : undefined, after: st.after != null ? Math.round(st.after * 20) : 120, line: st.lineHeight ? Math.round(st.lineHeight * 240) : undefined },
            indent: st.indent || st.firstLine ? { left: st.indent ? mmTw(st.indent) : undefined, firstLine: st.firstLine && st.firstLine > 0 ? mmTw(st.firstLine) : undefined, hanging: st.firstLine && st.firstLine < 0 ? mmTw(-st.firstLine) : undefined } : undefined,
            children: runs(b.text, extra),
          }),
        ];
      }
      case "list":
        return b.items.map((i, n) => new Paragraph({ children: [new TextRun(listMarker(b.style, b.ordered, n, b.checked?.[n])), ...runs(i)], indent: { left: 360, hanging: 260 }, spacing: { after: 60 } }));
      case "toc": {
        // The text width, for the right-aligned page numbers with dotted leaders.
        const width = opts.layout ? mmTw(opts.layout.page.w - opts.layout.page.margins.left - opts.layout.page.margins.right) : 9026;
        return [
          new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: b.title || "Contents", bold: true, size: 32 })] }),
          ...headings.map(
            (x) =>
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: width, leader: LeaderType.DOT }],
                indent: { left: (x.level - 1) * 360 },
                spacing: { after: x.level === 1 ? 80 : 40 },
                children: [new InternalHyperlink({ anchor: anchor(x.id), children: [new TextRun({ text: x.text.replace(/\*\*|__|~~|==/g, "").replace(/\{[^|{}]{1,80}\|(.+?)\}/g, "$1"), bold: x.level === 1 })] }), new TextRun("\t"), new PageReference(anchor(x.id), { hyperlink: true })],
              }),
          ),
          new Paragraph(""),
        ];
      }
      case "columns": {
        const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
        const cell = (t: string) => new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none }, margins: { left: 80, right: 160 }, children: t.split(/\n\s*\n/).map((p) => new Paragraph({ spacing: { after: 100 }, children: runs(p) })) });
        return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: b.rule ? { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" } : none }, rows: [new TableRow({ children: [cell(b.left), cell(b.right)] })] }), new Paragraph("")];
      }
      case "table": {
        const st = b.style ?? {};
        const hx = (v: string | null | undefined, dflt: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? color(v) : dflt);
        const lines = st.borders ?? "all";
        const line = { style: BorderStyle.SINGLE, size: 4, color: hx(st.border, "CBD5E1") };
        const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
        const laid = tableLayout(b);
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: st.widths?.length ? st.widths.map((w) => Math.round((Math.min(100, Math.max(3, w)) / 100) * 9000)) : undefined,
            borders: lines === "none" ? { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none } : lines === "rows" ? { top: none, left: none, right: none, insideVertical: none, bottom: line, insideHorizontal: line } : { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
            rows: laid.map(
              (r, i) =>
                new TableRow({
                  tableHeader: i === 0 && b.header,
                  children: r.map((c) => {
                    const head = i === 0 && b.header;
                    const stripe = !head && st.stripe && i % 2 === (b.header ? 0 : 1) ? hx(st.stripe, "") : "";
                    const al = st.align?.[c.col] ?? (/^[-+]?[\d,.]+%?$/.test(c.text.trim()) && !head ? "right" : "left");
                    return new TableCell({
                      columnSpan: c.span > 1 ? c.span : undefined,
                      shading: head ? { type: ShadingType.CLEAR, fill: hx(st.headFill, "F1F5F9"), color: "auto" } : stripe ? { type: ShadingType.CLEAR, fill: stripe, color: "auto" } : undefined,
                      children: [new Paragraph({ alignment: al === "right" ? AlignmentType.RIGHT : al === "center" ? AlignmentType.CENTER : AlignmentType.LEFT, children: runs(c.text, { ...(head ? { bold: true, color: hx(st.headColor, "111827") } : {}), ...(st.size ? { size: Math.round(st.size * 2) } : {}) }) })],
                    });
                  }),
                }),
            ),
          }),
          new Paragraph(""),
        ];
      }
      case "quote":
        return [new Paragraph({ indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: "94A3B8", space: 8 } }, children: runs(b.text, { italics: true, color: "475569" }) })];
      case "divider":
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1", space: 1 } }, children: [] })];
      case "pagebreak":
        return [new Paragraph({ children: [new PageBreak()] })];
      case "section":
        return [SECTION, ...(b.title ? [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.title)] })] : [])];
      case "image": {
        const img = dataBytes(b.src);
        if (!img || img.type === "gif") return [];
        // Width as a share of a 16 cm text column, height kept in proportion (assumed 4:3 when unknown).
        const wpx = Math.round((Math.min(100, Math.max(5, b.width)) / 100) * 600);
        return [
          new Paragraph({ alignment: align[b.align], children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: wpx, height: Math.round(wpx * 0.75) } })] }),
          ...(b.caption ? [new Paragraph({ alignment: align[b.align], children: [new TextRun({ text: b.caption, size: 17, color: "64748B" })] })] : []),
        ];
      }
      case "textbox":
        return [
          new Table({
            width: { size: b.align === "full" ? 100 : Math.min(100, Math.max(20, b.width)), type: WidthType.PERCENTAGE },
            alignment: b.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
            rows: [new TableRow({ children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: color(/^#[0-9a-f]{6}$/i.test(b.fill) ? b.fill : "#f8fafc"), color: "auto" }, margins: { top: 100, bottom: 100, left: 140, right: 140 }, children: [new Paragraph({ children: runs(b.text) })] })] })],
          }),
          new Paragraph(""),
        ];
    }
  };
  const lh = opts.letterhead;
  if (opts.layout) return layoutDocx(opts.layout);
  // Cover, front matter (i, ii, iii), main pages (1, 2, 3); each part its own Word section with its header, footer
  // and numbering, so it works as it does in a document made in Word.
  async function layoutDocx(L: DocxLayout) {
    const pl = await import("./page-layout");
    const { layout, fields } = L;
    const tw = (mm: number) => Math.round(mm * 56.6929);
    const textW = tw(L.page.w - L.page.margins.left - L.page.margins.right);
    const pageProps = { size: { width: tw(L.page.w), height: tw(L.page.h) }, margin: { top: tw(L.page.margins.top), right: tw(L.page.margins.right), bottom: tw(L.page.margins.bottom), left: tw(L.page.margins.left), header: tw(Math.max(6, L.page.margins.top / 2 - 2)), footer: tw(Math.max(6, L.page.margins.bottom / 2 - 2)) } };
    const parts = pl.splitParts(opts.blocks, layout);
    const hasFront = parts.front.length > 0;
    const zoneRuns = (t: string, hf: import("./page-layout").HeaderFooter, inMain: boolean) => {
      const out: InstanceType<typeof TextRun>[] = [];
      const filled = pl.fillText(t, fields, "\u0001", "\u0002");
      for (const piece of filled.split(/(\u0001|\u0002)/)) {
        if (!piece) continue;
        const base = { size: Math.round(hf.size * 2), color: color(hf.color) };
        if (piece === "\u0001") out.push(new TextRun({ ...base, children: [PageNumber.CURRENT] }));
        else if (piece === "\u0002") out.push(new TextRun({ ...base, children: [hasFront || layout.cover ? PageNumber.TOTAL_PAGES_IN_SECTION : PageNumber.TOTAL_PAGES] }));
        else out.push(new TextRun({ ...base, text: piece }));
      }
      return out;
    };
    const logoRun = () => (lh?.logoData ? [new ImageRun({ type: lh.logoType ?? "png", data: lh.logoData, transformation: { width: 34, height: 34 } })] : []);
    // One line: left, centre and right zones on tab stops, as Word's own header and footer styles do.
    const band = (z: import("./page-layout").HFZones, hf: import("./page-layout").HeaderFooter, where: "header" | "footer", inMain: boolean) => {
      const logo = where === "header" && hf.logo !== "none" ? logoRun() : [];
      const rule = where === "header" ? (hf.ruleUnderHeader ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: color(hf.color), space: 4 } } : undefined) : hf.ruleOverFooter ? { top: { style: BorderStyle.SINGLE, size: 6, color: color(hf.color), space: 4 } } : undefined;
      return new Paragraph({
        border: rule,
        tabStops: [{ type: TabStopType.CENTER, position: Math.round(textW / 2) }, { type: TabStopType.RIGHT, position: textW }],
        children: [
          ...(hf.logo === "left" ? logo : []),
          ...(hf.logo === "left" && logo.length && z.left ? [new TextRun("  ")] : []),
          ...zoneRuns(z.left, hf, inMain),
          new TextRun("\t"),
          ...zoneRuns(z.center, hf, inMain),
          new TextRun("\t"),
          ...zoneRuns(z.right, hf, inMain),
          ...(hf.logo === "right" && logo.length ? [new TextRun("  "), ...logo] : []),
        ],
      });
    };
    const empty = () => ({ default: new Header({ children: [new Paragraph("")] }) });
    const emptyF = () => ({ default: new Footer({ children: [new Paragraph("")] }) });
    const chrome = (hf: import("./page-layout").HeaderFooter | null, inMain: boolean, first: boolean) => {
      if (!hf) return { headers: empty(), footers: emptyF() };
      const df = first && hf.differentFirst;
      return {
        headers: { default: new Header({ children: [band(hf.header, hf, "header", inMain)] }), ...(df ? { first: new Header({ children: [band(hf.firstHeader ?? pl.EMPTY_ZONES, hf, "header", inMain)] }) } : {}) },
        footers: { default: new Footer({ children: [band(hf.footer, hf, "footer", inMain)] }), ...(df ? { first: new Footer({ children: [band(hf.firstFooter ?? pl.EMPTY_ZONES, hf, "footer", inMain)] }) } : {}) },
        titlePage: df,
      };
    };
    const sections: Record<string, unknown>[] = [];
    // The cover: its own section, no header, footer or number.
    const c = layout.cover;
    if (c) {
      const col = /^#[0-9a-f]{6}$/i.test(c.color) ? color(c.color) : "16A34A";
      const center = c.style === "classic" || c.style === "framed";
      const al = center ? AlignmentType.CENTER : AlignmentType.LEFT;
      const kids: InstanceType<typeof Paragraph>[] = [];
      if (c.logo && lh?.logoData) kids.push(new Paragraph({ alignment: al, spacing: { after: 600 }, children: [new ImageRun({ type: lh.logoType ?? "png", data: lh.logoData, transformation: { width: 90, height: 90 } })] }));
      if (c.style === "minimal") kids.push(new Paragraph({ spacing: { before: 4200 }, children: [] }));
      const band2 = c.style === "band" ? { shading: { type: ShadingType.CLEAR, fill: col, color: "auto" } } : {};
      const ink = c.style === "band" ? "FFFFFF" : "0F172A";
      if (center) kids.push(new Paragraph({ alignment: al, spacing: { before: 2400, after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: col, space: 1 } }, children: [] }));
      kids.push(new Paragraph({ alignment: al, ...band2, spacing: { before: c.style === "band" ? 1800 : 240, after: 120 }, border: c.style === "minimal" || c.style === "split" ? { left: { style: BorderStyle.SINGLE, size: 36, color: col, space: 12 } } : undefined, children: [new TextRun({ text: c.title || opts.title, bold: true, size: 64, color: ink })] }));
      if (c.subtitle) kids.push(new Paragraph({ alignment: al, ...band2, spacing: { after: 240 }, children: [new TextRun({ text: c.subtitle, size: 30, color: c.style === "band" ? "FFFFFF" : "475569" })] }));
      kids.push(new Paragraph({ alignment: al, spacing: { before: 2400 }, children: [c.author, c.org, c.date, c.note].filter(Boolean).flatMap((t, i) => [...(i ? [new TextRun({ text: "", break: 1 })] : []), new TextRun({ text: t, size: 22, color: "334155" })]) }));
      sections.push({
        properties: { page: { ...pageProps, ...(c.style === "framed" || c.style === "split" ? { borders: { pageBorderTop: { style: BorderStyle.DOUBLE, size: 12, color: col, space: 24 }, pageBorderBottom: { style: BorderStyle.DOUBLE, size: 12, color: col, space: 24 }, pageBorderLeft: { style: BorderStyle.DOUBLE, size: c.style === "split" ? 48 : 12, color: col, space: 24 }, pageBorderRight: { style: BorderStyle.DOUBLE, size: 12, color: col, space: 24 } } } : {}) }, verticalAlign: c.style === "classic" || c.style === "framed" ? VerticalAlign.TOP : undefined },
        headers: empty(),
        footers: emptyF(),
        children: kids,
      });
    }
    // Each part is one Word section (so "of {pages}" counts the part's pages); a section break inside a part
    // starts a new page.
    const flat = (list: Block[]) => {
      const out: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
      for (const x of list.flatMap(para)) {
        if (x === SECTION) {
          if (out.length) out.push(new Paragraph({ children: [new PageBreak()] }));
        } else out.push(x);
      }
      return [out];
    };
    const shownMain = pl.withNumber(L.hf, layout.numbering, L.pageNumbers);
    if (hasFront) {
      const front = layout.numbering.front;
      const fh = !L.pageNumbers || front === "none" ? L.hf : pl.withNumber(L.hf, layout.numbering, true);
      flat(parts.front).forEach((g, i) =>
        sections.push({
          properties: { page: { ...pageProps, ...(i === 0 ? { pageNumbers: { start: 1, formatType: front === "arabic" ? NumberFormat.DECIMAL : NumberFormat.LOWER_ROMAN } } : {}) }, ...(i === 0 && !c && fh?.differentFirst ? { titlePage: true } : {}) },
          ...chrome(fh, false, i === 0 && !c),
          children: g.length ? g : [new Paragraph("")],
        }),
      );
    }
    flat(parts.main).forEach((g, i) => {
      const ch = chrome(shownMain, true, i === 0 && !c && !hasFront);
      sections.push({
        properties: { page: { ...pageProps, ...(i === 0 ? { pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } : {}) }, ...(ch.titlePage ? { titlePage: true } : {}) },
        headers: ch.headers,
        footers: ch.footers,
        children: g.length ? g : [new Paragraph("")],
      });
    });
    const doc = new Document({
      creator: fields.author || lh?.company || "Myseed",
      title: opts.title,
      description: fields.company,
      styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
      footnotes,
      // Word fills the contents' page numbers when the file opens.
      features: { updateFields: withToc },
      sections: sections as never,
    });
    return Packer.toBlob(doc);
  }
  const header = lh
    ? new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: color(lh.primary), space: 6 } },
            children: [
              ...(lh.logoData ? [new ImageRun({ type: lh.logoType ?? "png", data: lh.logoData, transformation: { width: 56, height: 56 } }), new TextRun("   ")] : []),
              new TextRun({ text: lh.company, bold: true, size: 32, color: color(lh.accent) }),
              ...(lh.tagline ? [new TextRun({ text: `   ${lh.tagline}`, size: 18, color: "64748B" })] : []),
            ],
          }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: [lh.address, lh.phone, lh.email, lh.website].filter(Boolean).join("  ·  "), size: 16, color: "475569" })] }),
        ],
      })
    : undefined;
  const footer = lh
    ? new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 6, color: color(lh.primary), space: 4 } }, children: [new TextRun({ text: lh.footer || [lh.company, lh.address, lh.website].filter(Boolean).join("  ·  "), size: 16, color: "64748B" })] })] })
    : undefined;
  // Section breaks split the document into Word sections (each starts on a new page).
  const groups: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[][] = [[]];
  for (const c of [...(opts.before ?? []), ...opts.blocks, ...(opts.after ?? [])].flatMap(para)) {
    if (c === SECTION) groups.push([]);
    else groups.at(-1)!.push(c);
  }
  const children = groups[0]!;
  const pg = opts.page;
  if (pg) {
    // Millimetres to twentieths of a point (Word's unit).
    const tw = (mm: number) => Math.round(mm * 56.6929);
    const al = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT };
    const band = (list: DocxBand, opts2: { logo?: boolean; rule?: "top" | "bottom"; numbers?: boolean; note?: string }) => [
      ...(opts2.logo && lh?.logoData ? [new Paragraph({ children: [new ImageRun({ type: lh.logoType ?? "png", data: lh.logoData, transformation: { width: 52, height: 52 } })] })] : []),
      ...list.map(
        (t, i) =>
          new Paragraph({
            alignment: al[t.align],
            border: opts2.rule === "bottom" && i === list.length - 1 && lh ? { bottom: { style: BorderStyle.SINGLE, size: 10, color: color(lh.primary), space: 4 } } : opts2.rule === "top" && i === 0 && lh ? { top: { style: BorderStyle.SINGLE, size: 6, color: color(lh.primary), space: 4 } } : undefined,
            children: runsOf(t.text).map((r) => new TextRun({ text: r.text, bold: r.bold || t.bold, italics: r.italics, break: r.break ? 1 : undefined, size: Math.round(t.size * 2), color: color(t.color) })),
          }),
      ),
      ...(opts2.note ? [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: opts2.note, size: 14, color: "64748B" })] })] : []),
      ...(opts2.numbers ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 14, color: "64748B" })] })] : []),
    ];
    const doc = new Document({
      creator: lh?.company ?? "Myseed",
      title: opts.title,
      styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
      sections: [
        {
          properties: { titlePage: pg.differentFirst, page: { size: { width: tw(pg.w), height: tw(pg.h) }, margin: { top: tw(pg.margins.top + 8), right: tw(pg.margins.right), bottom: tw(pg.margins.bottom + 6), left: tw(pg.margins.left), header: tw(6), footer: tw(5) } } },
          headers: { default: new Header({ children: band(pg.header.rest, { rule: "bottom" }) }), ...(pg.differentFirst ? { first: new Header({ children: band(pg.header.first, { logo: true, rule: "bottom" }) }) } : {}), ...(pg.oddEven ? { even: new Header({ children: band(pg.header.even ?? pg.header.rest, { rule: "bottom" }) }) } : {}) },
          footers: { default: new Footer({ children: band(pg.footer.rest, { rule: "top", numbers: pg.pageNumbers, note: pg.footerNote }) }), ...(pg.differentFirst ? { first: new Footer({ children: band(pg.footer.first, { rule: "top", numbers: pg.pageNumbers, note: pg.footerNote }) }) } : {}), ...(pg.oddEven ? { even: new Footer({ children: band(pg.footer.even ?? pg.footer.rest, { rule: "top", numbers: pg.pageNumbers, note: pg.footerNote }) }) } : {}) },
          children,
        },
        ...groups.slice(1).map((g) => ({
          properties: { page: { size: { width: tw(pg.w), height: tw(pg.h) }, margin: { top: tw(pg.margins.top + 8), right: tw(pg.margins.right), bottom: tw(pg.margins.bottom + 6), left: tw(pg.margins.left), header: tw(6), footer: tw(5) } } },
          headers: { default: new Header({ children: band(pg.header.rest, { rule: "bottom" }) }), ...(pg.oddEven ? { even: new Header({ children: band(pg.header.even ?? pg.header.rest, { rule: "bottom" }) }) } : {}) },
          footers: { default: new Footer({ children: band(pg.footer.rest, { rule: "top", numbers: pg.pageNumbers, note: pg.footerNote }) }), ...(pg.oddEven ? { even: new Footer({ children: band(pg.footer.even ?? pg.footer.rest, { rule: "top", numbers: pg.pageNumbers, note: pg.footerNote }) }) } : {}) },
          children: g,
        })),
      ],
      evenAndOddHeaderAndFooters: !!pg.oddEven,
      features: { updateFields: opts.blocks.some((b) => b.type === "toc") },
      footnotes,
    });
    return Packer.toBlob(doc);
  }
  const doc = new Document({
    creator: lh?.company ?? "Myseed",
    title: opts.title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    footnotes,
    features: { updateFields: opts.blocks.some((b) => b.type === "toc") },
    sections: groups.map((g, i) => ({ headers: header ? { default: header } : undefined, footers: footer ? { default: footer } : undefined, children: i === 0 ? children : g })),
  });
  return Packer.toBlob(doc);
}

// The letterhead's logo as PNG or JPEG bytes for Word (the letterhead's own, else the site's logo; an SVG is drawn
// on a canvas first, since Word does not read SVG).
export async function logoBytes(lh: Letterhead): Promise<{ data: Uint8Array; type: "png" | "jpg" } | null> {
  try {
    const src = lh.logo || "/api/branding/logo";
    const res = await fetch(src);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? (src.startsWith("data:image/jp") ? "image/jpeg" : "image/png");
    const blob = await res.blob();
    if (/png|jpe?g/.test(mime)) return { data: new Uint8Array(await blob.arrayBuffer()), type: mime.includes("png") ? "png" : "jpg" };
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((ok, bad) => ((img.onload = () => ok()), (img.onerror = () => bad(new Error("logo"))), (img.src = url)));
      const k = 256 / Math.max(img.naturalWidth || 256, img.naturalHeight || 256);
      const cv = document.createElement("canvas");
      cv.width = Math.round((img.naturalWidth || 256) * k);
      cv.height = Math.round((img.naturalHeight || 256) * k);
      cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
      const png = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/png"));
      return png ? { data: new Uint8Array(await png.arrayBuffer()), type: "png" } : null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

// A document's page setup as the Word page (and the CSS for the PDF).
export function docxPageOf(p: DocPage): DocxPage {
  const paper = DOC_PAPER[p.size] ?? DOC_PAPER.A4;
  const [w, h] = p.orientation === "landscape" ? [paper.h, paper.w] : [paper.w, paper.h];
  const band = (t: string): DocxBand => (t.trim() ? [{ text: t, align: "center", size: 8.5, bold: false, color: "#64748b" }] : []);
  return { w, h, margins: { top: Math.max(0, p.margins.top - 8), right: p.margins.right, bottom: Math.max(0, p.margins.bottom - 6), left: p.margins.left }, differentFirst: false, header: { first: band(p.header), rest: band(p.header) }, footer: { first: band(p.footer), rest: band(p.footer) }, pageNumbers: p.pageNumbers };
}
export function pageCss(p: DocPage) {
  const paper = DOC_PAPER[p.size] ?? DOC_PAPER.A4;
  const [w, h] = p.orientation === "landscape" ? [paper.h, paper.w] : [paper.w, paper.h];
  const m = p.margins;
  return `@page{size:${w}mm ${h}mm;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm${p.pageNumbers ? ';@bottom-right{content:counter(page) " / " counter(pages);font-size:8pt;color:#64748b}' : ""}}
.pg-head,.pg-foot{position:fixed;left:0;right:0;text-align:center;font-size:8.5pt;color:#64748b}.pg-head{top:-${Math.max(6, m.top - 6)}mm}.pg-foot{bottom:-${Math.max(6, m.bottom - 6)}mm}
.pg-wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:72pt;font-weight:800;color:rgba(100,116,139,.12);transform:rotate(-30deg);pointer-events:none}
sup.fn{font-size:7pt}`;
}
export function pageChrome(p: DocPage) {
  return `${p.header ? `<div class="pg-head">${esc(p.header)}</div>` : ""}${p.footer ? `<div class="pg-foot">${esc(p.footer)}</div>` : ""}${p.watermark ? `<div class="pg-wm">${esc(p.watermark)}</div>` : ""}`;
}
