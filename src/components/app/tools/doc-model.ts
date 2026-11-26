// The Document Builder's and Letter Generator's content model, and its two outputs: a Word file (docx, built in the
// browser) and print-ready HTML (saved as PDF from the print dialog, as the app's other PDF reports are). All text
// is escaped before it goes into HTML.

import type { Letterhead } from "@/lib/tools";

export type Block =
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "paragraph"; text: string; align?: "left" | "center" | "right" | "justify" }
  | { id: string; type: "list"; ordered: boolean; items: string[] }
  | { id: string; type: "table"; header: boolean; rows: string[][] }
  | { id: string; type: "quote"; text: string }
  | { id: string; type: "divider" }
  | { id: string; type: "pagebreak" };

export type DocData = { template: string; blocks: Block[]; meta?: { subtitle?: string; author?: string; date?: string } };

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
    default:
      return p("");
  }
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// **bold**, *italic*, and a line break for two trailing spaces or a newline, on escaped text.
export function inlineHtml(text: string) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/ {2}\n|\n/g, "<br>");
}

// Runs of text with bold and italics, for Word.
export function runsOf(text: string): { text: string; bold?: boolean; italics?: boolean; break?: boolean }[] {
  const out: { text: string; bold?: boolean; italics?: boolean; break?: boolean }[] = [];
  text.split(/ {2}\n|\n/).forEach((line, li) => {
    const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let first = true;
    const push = (r: { text: string; bold?: boolean; italics?: boolean }) => {
      out.push({ ...r, ...(li > 0 && first ? { break: true } : {}) });
      first = false;
    };
    while ((m = re.exec(line))) {
      if (m.index > last) push({ text: line.slice(last, m.index) });
      push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2]!, italics: true });
      last = m.index + m[0].length;
    }
    if (last < line.length || first) push({ text: line.slice(last) });
  });
  return out;
}

export function blocksHtml(blocks: Block[]) {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `<h${b.level}>${inlineHtml(b.text)}</h${b.level}>`;
        case "paragraph":
          return `<p style="text-align:${b.align ?? "left"}">${inlineHtml(b.text) || "&nbsp;"}</p>`;
        case "list":
          return `<${b.ordered ? "ol" : "ul"}>${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
        case "table":
          return `<table>${b.rows.map((r, i) => `<tr>${r.map((c) => (i === 0 && b.header ? `<th>${inlineHtml(c)}</th>` : `<td>${inlineHtml(c)}</td>`)).join("")}</tr>`).join("")}</table>`;
        case "quote":
          return `<blockquote>${inlineHtml(b.text)}</blockquote>`;
        case "divider":
          return "<hr>";
        case "pagebreak":
          return '<div style="page-break-after:always"></div>';
      }
    })
    .join("\n");
}

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
export async function blocksDocx(opts: { title: string; blocks: Block[]; letterhead?: Letterhead & { logoData?: Uint8Array | null; logoType?: "png" | "jpg" }; before?: Block[]; after?: Block[] }) {
  const d = await import("docx");
  const { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, ShadingType } = d;
  const color = (hex: string) => hex.replace("#", "");
  const runs = (text: string, extra: Record<string, unknown> = {}) => runsOf(text).map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italics, break: r.break ? 1 : undefined, ...extra }));
  const para = (b: Block): (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] => {
    switch (b.type) {
      case "heading":
        return [new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][b.level - 1], children: runs(b.text) })];
      case "paragraph":
        return [new Paragraph({ alignment: { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED, left: AlignmentType.LEFT }[b.align ?? "left"], spacing: { after: 120 }, children: runs(b.text) })];
      case "list":
        return b.items.map((i, n) => new Paragraph({ children: [new TextRun(b.ordered ? `${n + 1}. ` : "• "), ...runs(i)], indent: { left: 360, hanging: 260 }, spacing: { after: 60 } }));
      case "table": {
        const width = Math.max(1, ...b.rows.map((r) => r.length));
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: b.rows.map(
              (r, i) =>
                new TableRow({
                  tableHeader: i === 0 && b.header,
                  children: Array.from({ length: width }, (_, j) => new TableCell({ shading: i === 0 && b.header ? { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" } : undefined, children: [new Paragraph({ children: runs(r[j] ?? "", i === 0 && b.header ? { bold: true } : {}) })] })),
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
    }
  };
  const lh = opts.letterhead;
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
  const doc = new Document({
    creator: lh?.company ?? "Myseed",
    title: opts.title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ headers: header ? { default: header } : undefined, footers: footer ? { default: footer } : undefined, children: [...(opts.before ?? []), ...opts.blocks, ...(opts.after ?? [])].flatMap(para) }],
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
