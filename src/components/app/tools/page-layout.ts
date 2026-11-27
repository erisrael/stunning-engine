// A document's page layout beyond the paper: its header and footer (three zones each, with fields), a cover page,
// and page numbering made simple (cover without a number, front matter in i, ii, iii, the main pages 1, 2, 3).
// Used by the Document Builder for the editor, the PDF (print) and the Word file; Word gets real sections, so the
// numbering, the different first page and the fields work in Word, LibreOffice and other Word-compatible apps.

import type { Letterhead } from "@/lib/tools";
import { esc } from "./doc-model";

// Fields in a zone's text: {page}, {pages}, {title}, {author}, {date}, {company}.
export type HFZones = { left: string; center: string; right: string };
export type HeaderFooter = {
  header: HFZones;
  footer: HFZones;
  // The company logo in the header.
  logo: "none" | "left" | "right";
  ruleUnderHeader: boolean;
  ruleOverFooter: boolean;
  size: number;
  color: string;
  // The first page of the document (after the cover, if any) can have its own (often empty) header and footer.
  differentFirst: boolean;
  firstHeader?: HFZones;
  firstFooter?: HFZones;
};
// Where the header and footer come from: the company letterhead, the file that was opened, a design of one's own,
// or none.
export type HFSource = "company" | "document" | "custom" | "none";

export type Numbering = {
  // The cover page has no header, footer or number.
  cover: boolean;
  // Front matter (contents, preface, abstract): lower-case Roman numerals, none, or Arabic numerals.
  front: "roman" | "none" | "arabic";
  // The block where the main pages start (numbered 1, 2, 3); null: no front matter, the main pages start at once.
  mainStartsAt: string | null;
  // How the number shows when the footer has no {page} field of its own.
  position: "left" | "center" | "right";
  format: "n" | "page-n" | "n-of-m" | "dash";
};

export type CoverStyle = "classic" | "band" | "minimal" | "framed" | "split";
export type Cover = { style: CoverStyle; title: string; subtitle: string; author: string; org: string; date: string; note: string; logo: boolean; color: string };

export type DocLayout = { source: HFSource; hf: HeaderFooter; numbering: Numbering; cover: Cover | null; fromFile?: HeaderFooter | null };

export const EMPTY_ZONES: HFZones = { left: "", center: "", right: "" };
export const DEFAULT_HF: HeaderFooter = {
  header: { left: "{company}", center: "", right: "{title}" },
  footer: { left: "{date}", center: "", right: "Page {page} of {pages}" },
  logo: "left",
  ruleUnderHeader: true,
  ruleOverFooter: true,
  size: 9,
  color: "#64748b",
  differentFirst: false,
};
export const DEFAULT_NUMBERING: Numbering = { cover: false, front: "roman", mainStartsAt: null, position: "right", format: "page-n" };
export const DEFAULT_LAYOUT: DocLayout = { source: "company", hf: DEFAULT_HF, numbering: DEFAULT_NUMBERING, cover: null };

// Ready-made headers and footers; people's own are saved beside them.
export const HF_PRESETS: { key: string; label: string; hf: HeaderFooter }[] = [
  { key: "report", label: "Report: company and title, date and page", hf: DEFAULT_HF },
  { key: "simple", label: "Simple: page number centred", hf: { ...DEFAULT_HF, header: EMPTY_ZONES, footer: { left: "", center: "{page}", right: "" }, logo: "none", ruleUnderHeader: false, ruleOverFooter: false } },
  { key: "confidential", label: "Confidential", hf: { ...DEFAULT_HF, header: { left: "{company}", center: "CONFIDENTIAL", right: "{date}" }, footer: { left: "{title}", center: "", right: "{page} / {pages}" } } },
  { key: "letter", label: "Letter: logo and company, contacts in the footer", hf: { ...DEFAULT_HF, header: { left: "", center: "", right: "{company}" }, footer: { left: "{company}", center: "", right: "{page}" }, logo: "left" } },
  { key: "academic", label: "Academic: title in the header, page at the bottom centre", hf: { ...DEFAULT_HF, header: { left: "", center: "{title}", right: "" }, footer: { left: "", center: "{page}", right: "" }, logo: "none", ruleUnderHeader: false, ruleOverFooter: false } },
];

export const COVER_STYLES: { key: CoverStyle; label: string }[] = [
  { key: "classic", label: "Classic: centred title" },
  { key: "band", label: "Colour band" },
  { key: "minimal", label: "Minimal: title at the bottom left" },
  { key: "framed", label: "Framed" },
  { key: "split", label: "Split: colour panel on the left" },
];
export const newCover = (title: string, author: string, org: string, color: string): Cover => ({ style: "classic", title, subtitle: "", author, org, date: new Date().toISOString().slice(0, 10), note: "", logo: true, color });

export function layoutOf(raw: unknown): DocLayout {
  const x = (raw ?? {}) as Partial<DocLayout>;
  const z = (v: unknown): HFZones => ({ left: String((v as HFZones)?.left ?? ""), center: String((v as HFZones)?.center ?? ""), right: String((v as HFZones)?.right ?? "") });
  const hfOf = (h: unknown): HeaderFooter => {
    const y = (h ?? {}) as Partial<HeaderFooter>;
    return {
      header: z(y.header ?? DEFAULT_HF.header),
      footer: z(y.footer ?? DEFAULT_HF.footer),
      logo: y.logo === "right" || y.logo === "none" ? y.logo : y.logo === "left" ? "left" : DEFAULT_HF.logo,
      ruleUnderHeader: y.ruleUnderHeader ?? true,
      ruleOverFooter: y.ruleOverFooter ?? true,
      size: Math.min(14, Math.max(6, Number(y.size) || 9)),
      color: /^#[0-9a-f]{6}$/i.test(String(y.color)) ? String(y.color) : DEFAULT_HF.color,
      differentFirst: !!y.differentFirst,
      firstHeader: y.firstHeader ? z(y.firstHeader) : undefined,
      firstFooter: y.firstFooter ? z(y.firstFooter) : undefined,
    };
  };
  const n = (x.numbering ?? {}) as Partial<Numbering>;
  return {
    source: (["company", "document", "custom", "none"] as const).includes(x.source as HFSource) ? (x.source as HFSource) : "company",
    hf: hfOf(x.hf),
    fromFile: x.fromFile ? hfOf(x.fromFile) : null,
    numbering: {
      cover: !!n.cover,
      front: n.front === "none" || n.front === "arabic" ? n.front : "roman",
      mainStartsAt: typeof n.mainStartsAt === "string" ? n.mainStartsAt : null,
      position: n.position === "left" || n.position === "center" ? n.position : "right",
      format: (["n", "page-n", "n-of-m", "dash"] as const).includes(n.format as Numbering["format"]) ? (n.format as Numbering["format"]) : "page-n",
    },
    cover: x.cover ? { ...newCover("", "", "", "#16a34a"), ...x.cover } : null,
  };
}

// The header and footer in effect: the company letterhead turned into zones, the file's own, the custom one, or none.
export function effectiveHF(l: DocLayout, lh: Letterhead): HeaderFooter | null {
  if (l.source === "none") return null;
  if (l.source === "document") return l.fromFile ?? null;
  if (l.source === "custom") return l.hf;
  return {
    header: { left: "", center: "", right: [lh.company, lh.tagline].filter(Boolean).join(" · ") ? "{company}" : "" },
    footer: { left: lh.footer || [lh.address, lh.phone, lh.email, lh.website].filter(Boolean).join(" · "), center: "", right: "" },
    logo: "left",
    ruleUnderHeader: true,
    ruleOverFooter: true,
    size: 8.5,
    color: "#475569",
    differentFirst: false,
  };
}

// A page number in the footer when the header and footer show none themselves.
export function numberText(n: Numbering) {
  return n.format === "n" ? "{page}" : n.format === "n-of-m" ? "Page {page} of {pages}" : n.format === "dash" ? "- {page} -" : "Page {page}";
}
export function hasPageField(hf: HeaderFooter | null) {
  if (!hf) return false;
  return [hf.header, hf.footer].some((z) => /\{page\}/.test(`${z.left}${z.center}${z.right}`));
}
// The footer actually used: the designed one, with the page number added where the numbering says when it has none.
export function withNumber(hf: HeaderFooter | null, n: Numbering, show: boolean): HeaderFooter | null {
  if (!show || hasPageField(hf)) return hf;
  const base = hf ?? { ...DEFAULT_HF, header: EMPTY_ZONES, footer: EMPTY_ZONES, logo: "none" as const, ruleUnderHeader: false, ruleOverFooter: false };
  const f = { ...base.footer };
  f[n.position] = f[n.position] ? `${f[n.position]}   ${numberText(n)}` : numberText(n);
  return { ...base, footer: f };
}

type Fields = { title: string; author: string; date: string; company: string };
export function fillText(t: string, f: Fields, page = "", pages = "") {
  return t.replace(/\{title\}/g, f.title).replace(/\{author\}/g, f.author).replace(/\{date\}/g, f.date).replace(/\{company\}/g, f.company).replace(/\{page\}/g, page).replace(/\{pages\}/g, pages);
}

// The three parts of the document as Word sections and printed pages: cover, front matter, main pages.
// A page or section break chosen as the start is the boundary itself (the part after it starts on its own page).
export function splitParts<T extends { id: string; type?: string }>(blocks: T[], l: DocLayout) {
  const at = l.numbering.mainStartsAt ? blocks.findIndex((b) => b.id === l.numbering.mainStartsAt) : -1;
  if (at <= 0) return { front: [] as T[], main: blocks };
  const isBreak = blocks[at]!.type === "pagebreak" || blocks[at]!.type === "section";
  const front = blocks.slice(0, at).filter((b, i, a) => !(i === a.length - 1 && (b.type === "pagebreak" || b.type === "section")));
  return { front, main: blocks.slice(isBreak && blocks[at]!.type === "pagebreak" ? at + 1 : at) };
}

// ---------------------------------------------------------------------------------------------------------------
// HTML: the cover and the print CSS (margin boxes for the header and footer; named pages for each part).
// ---------------------------------------------------------------------------------------------------------------

export function coverHtml(c: Cover, logo: string) {
  const col = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#16a34a";
  const img = c.logo ? `<img src="${esc(logo)}" alt="" style="height:56pt">` : "";
  const lines = `<div style="font-size:30pt;font-weight:800;line-height:1.15">${esc(c.title || "Title")}</div>${c.subtitle ? `<div style="font-size:15pt;margin-top:8pt;opacity:.8">${esc(c.subtitle)}</div>` : ""}`;
  const by = `<div style="font-size:11pt;line-height:1.6">${[c.author, c.org, c.date, c.note].filter(Boolean).map(esc).join("<br>")}</div>`;
  const wrap = (inner: string, extra = "") => `<section class="doc-cover" style="position:relative;min-height:247mm;display:flex;flex-direction:column;${extra}">${inner}</section>`;
  switch (c.style) {
    case "band":
      return wrap(`<div style="margin-bottom:auto">${img}</div><div style="background:${col};color:#fff;padding:22pt 18pt;margin:0 -4mm">${lines}</div><div style="margin-top:auto">${by}</div>`);
    case "minimal":
      return wrap(`<div>${img}</div><div style="margin-top:auto;border-left:4pt solid ${col};padding-left:12pt">${lines}<div style="margin-top:14pt">${by}</div></div>`);
    case "framed":
      return wrap(`<div style="flex:1;border:2pt solid ${col};outline:0.6pt solid ${col};outline-offset:-6pt;padding:28pt;display:flex;flex-direction:column;align-items:center;text-align:center">${img}<div style="margin:auto 0">${lines}</div>${by}</div>`);
    case "split":
      return wrap(`<div style="display:flex;flex:1"><div style="width:32%;background:${col}"></div><div style="flex:1;padding:24pt;display:flex;flex-direction:column">${img}<div style="margin:auto 0">${lines}</div>${by}</div></div>`);
    default:
      return wrap(`<div style="text-align:center">${img}</div><div style="margin:auto 0;text-align:center"><div style="width:60pt;height:3pt;background:${col};margin:0 auto 16pt"></div>${lines}</div><div style="text-align:center">${by}</div>`);
  }
}

const cssStr = (t: string) => `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
// A zone's text for a CSS margin box: {page} and {pages} become the page counters in the part's numbering.
function zoneContent(t: string, f: Fields, style: "decimal" | "lower-roman" | "none") {
  if (!t.trim()) return "none";
  const parts = fillText(t, f, "\u0001", "\u0002").split(/(\u0001|\u0002)/).filter((x) => x !== "");
  return parts.map((p) => (p === "\u0001" ? (style === "none" ? '""' : `counter(page, ${style})`) : p === "\u0002" ? "counter(pages)" : cssStr(p))).join(" ");
}
function boxes(hf: HeaderFooter | null, f: Fields, style: "decimal" | "lower-roman" | "none") {
  if (!hf) return ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"].map((b) => `@${b}{content:none}`).join("");
  const box = (name: string, t: string, rule: string) => `@${name}{content:${zoneContent(t, f, style)};font-size:${hf.size}pt;color:${hf.color};${rule}}`;
  const top = hf.ruleUnderHeader ? `border-bottom:0.6pt solid ${hf.color};padding-bottom:2pt;vertical-align:bottom` : "vertical-align:bottom";
  const bot = hf.ruleOverFooter ? `border-top:0.6pt solid ${hf.color};padding-top:2pt;vertical-align:top` : "vertical-align:top";
  return [box("top-left", hf.header.left, top), box("top-center", hf.header.center, top), box("top-right", hf.header.right, top), box("bottom-left", hf.footer.left, bot), box("bottom-center", hf.footer.center, bot), box("bottom-right", hf.footer.right, bot)].join("");
}

// Print CSS: the page, its header and footer as margin boxes, the cover with none, the front matter in Roman
// numerals, and the main pages counted again from 1.
export function layoutCss(l: DocLayout, hf: HeaderFooter | null, f: Fields, size: { w: number; h: number }, m: { top: number; right: number; bottom: number; left: number }, pageNumbers: boolean) {
  const shown = withNumber(hf, l.numbering, pageNumbers);
  const frontStyle = !pageNumbers || l.numbering.front === "none" ? "none" : l.numbering.front === "roman" ? "lower-roman" : "decimal";
  const frontHF = frontStyle === "none" ? hf : withNumber(hf, l.numbering, true);
  return `@page{size:${size.w}mm ${size.h}mm;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;${boxes(shown, f, pageNumbers ? "decimal" : "none")}}
@page cover{${boxes(null, f, "none")}}
@page front{${boxes(frontHF, f, frontStyle)}}
.doc-cover{page:cover;break-after:page}
.doc-front{page:front;break-after:page}
.doc-main{counter-reset:page 1}
sup.fn{font-size:7pt}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Reading the header and footer of an opened Word file (.docx or .dotx), so they can be used or saved as a template.
// ---------------------------------------------------------------------------------------------------------------

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function zonesOf(xml: string): HFZones | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paras = Array.from(doc.getElementsByTagNameNS(W, "p"));
  const out: HFZones = { left: "", center: "", right: "" };
  let any = false;
  for (const p of paras) {
    const jc = p.getElementsByTagNameNS(W, "jc")[0]?.getAttributeNS(W, "val") ?? p.getElementsByTagNameNS(W, "jc")[0]?.getAttribute("w:val") ?? "left";
    // Text with tabs splits into zones; PAGE and NUMPAGES fields become {page} and {pages}.
    let text = "";
    let field = "";
    // Complex fields: begin, the instruction, separate, the cached result (skipped), end.
    let state: "none" | "instr" | "result" = "none";
    const placeholder = (instr: string) => {
      const f = instr.trim().split(/\s+/)[0]?.toUpperCase();
      return f === "PAGE" ? "{page}" : f === "NUMPAGES" || f === "SECTIONPAGES" ? "{pages}" : f === "DATE" ? "{date}" : f === "TITLE" ? "{title}" : f === "AUTHOR" ? "{author}" : "";
    };
    for (const n of Array.from(p.getElementsByTagNameNS(W, "*"))) {
      if (n.localName === "instrText") field += n.textContent ?? "";
      else if (n.localName === "fldChar") {
        const t = n.getAttributeNS(W, "fldCharType") ?? n.getAttribute("w:fldCharType");
        if (t === "begin") ((state = "instr"), (field = ""));
        else if (t === "separate") ((text += placeholder(field)), (state = "result"));
        else if (t === "end") {
          if (state === "instr") text += placeholder(field);
          state = "none";
        }
      } else if (n.localName === "fldSimple") text += placeholder(n.getAttributeNS(W, "instr") ?? n.getAttribute("w:instr") ?? "");
      else if (n.localName === "t" && state === "none" && n.parentElement?.parentElement?.localName !== "fldSimple") text += n.textContent ?? "";
      else if (n.localName === "tab" && n.parentElement?.localName === "r" && state === "none") text += "\t";
    }
    const t = text.replace(/[ \u00a0]+/g, " ").trim();
    if (!t) continue;
    any = true;
    const parts = t.split("\t").map((x) => x.trim());
    if (parts.length >= 3) ((out.left = [out.left, parts[0]].filter(Boolean).join(" ")), (out.center = [out.center, parts[1]].filter(Boolean).join(" ")), (out.right = [out.right, parts.slice(2).join(" ")].filter(Boolean).join(" ")));
    else if (parts.length === 2) ((out.left = [out.left, parts[0]].filter(Boolean).join(" ")), (out.right = [out.right, parts[1]].filter(Boolean).join(" ")));
    else {
      const key = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : "left";
      out[key] = [out[key], parts[0]].filter(Boolean).join(" · ");
    }
  }
  return any ? out : null;
}

export async function headerFooterOfDocx(file: Blob): Promise<HeaderFooter | null> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const relXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const rels = new Map(Array.from(new DOMParser().parseFromString(relXml, "application/xml").getElementsByTagName("Relationship")).map((r) => [r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? ""]));
  const doc = new DOMParser().parseFromString(docXml, "application/xml");
  // The last section's references (the body's own sectPr) are the document's main header and footer.
  const sect = Array.from(doc.getElementsByTagNameNS(W, "sectPr")).at(-1);
  if (!sect) return null;
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const pick = async (tag: "headerReference" | "footerReference", type: string) => {
    const ref = Array.from(sect.getElementsByTagNameNS(W, tag)).find((x) => (x.getAttributeNS(W, "type") ?? x.getAttribute("w:type") ?? "default") === type);
    const target = ref ? rels.get(ref.getAttributeNS(R, "id") ?? ref.getAttribute("r:id") ?? "") : null;
    const xml = target ? await zip.file(`word/${target.replace(/^\.?\//, "")}`)?.async("string") : null;
    return xml ? zonesOf(xml) : null;
  };
  const [h, f, h1, f1] = await Promise.all([pick("headerReference", "default"), pick("footerReference", "default"), pick("headerReference", "first"), pick("footerReference", "first")]);
  if (!h && !f && !h1 && !f1) return null;
  const titlePg = !!sect.getElementsByTagNameNS(W, "titlePg")[0];
  const hasLogo = /<w:drawing|<v:imagedata/.test((await Promise.all(Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n)).map((n) => zip.file(n)!.async("string")))).join(""));
  return {
    ...DEFAULT_HF,
    header: h ?? EMPTY_ZONES,
    footer: f ?? EMPTY_ZONES,
    logo: hasLogo ? "left" : "none",
    ruleUnderHeader: false,
    ruleOverFooter: false,
    differentFirst: titlePg,
    firstHeader: titlePg ? (h1 ?? EMPTY_ZONES) : undefined,
    firstFooter: titlePg ? (f1 ?? EMPTY_ZONES) : undefined,
  };
}
