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
  // A banner behind the header or footer (a colour band with the logo, as on the company letterhead).
  art?: { header?: HFArt; footer?: HFArt };
  // A Word file's own header and footer parts, put back unchanged in Word files made from it.
  raw?: { header?: HFRaw; footer?: HFRaw };
  // The Word file's page margins (mm), so the text clears its banner.
  margins?: { top: number; bottom: number; left: number; right: number; header: number; footer: number };
};
// logo: a data URL, "brand" for the company's logo, or none; bg: a picture covering the whole band.
export type HFArt = { colors: string[]; angle: number; heightMm: number; textColor: string; logo: string | null; bg?: string | null; bold?: boolean };
export type HFRaw = { xml: string; rels: string; media: { name: string; b64: string; type: string }[] };
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
// The company letterhead as a banner: green band with the logo and name, contacts on the right; a matching footer.
export const MYSEED_BANNER: HeaderFooter = {
  header: { left: "MYSEED\nEDTECH P.L.C", center: "", right: "{address}\n{phone}\n{email}\n{website}" },
  footer: { left: "", center: "MYSEED EdTech PLC  |  {address}\nPhone: {phone}  |  Email: {email}  |  Website: {website}", right: "" },
  logo: "none",
  ruleUnderHeader: false,
  ruleOverFooter: false,
  size: 9,
  color: "#475569",
  differentFirst: false,
  art: {
    header: { colors: ["#5aa84a", "#1f6b3a", "#0a362a"], angle: 0, heightMm: 30, textColor: "#ffffff", logo: "/brand/myseed-mark-white.png", bold: false },
    footer: { colors: ["#5aa84a", "#1f6b3a", "#0a362a"], angle: 0, heightMm: 16, textColor: "#ffffff", logo: null, bold: false },
  },
};
export const HF_PRESETS: { key: string; label: string; hf: HeaderFooter }[] = [
  { key: "myseed", label: "MYSEED EdTech PLC banner (green letterhead)", hf: MYSEED_BANNER },
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
      art: y.art && typeof y.art === "object" ? y.art : undefined,
      raw: y.raw && typeof y.raw === "object" ? y.raw : undefined,
      margins: y.margins && typeof y.margins === "object" ? y.margins : undefined,
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

export type Fields = { title: string; author: string; date: string; company: string; address?: string; phone?: string; email?: string; website?: string };
export function fillText(t: string, f: Fields, page = "", pages = "") {
  return t
    .replace(/\{title\}/g, f.title)
    .replace(/\{author\}/g, f.author)
    .replace(/\{date\}/g, f.date)
    .replace(/\{company\}/g, f.company)
    .replace(/\{address\}/g, f.address ?? "")
    .replace(/\{phone\}/g, f.phone ?? "")
    .replace(/\{email\}/g, f.email ?? "")
    .replace(/\{website\}/g, f.website ?? "")
    .replace(/\{page\}/g, page)
    .replace(/\{pages\}/g, pages);
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
// Reading the header and footer of an opened Word file (.docx or .dotx), so they can be used or saved as a template:
// the text by zone, the banner (its colours, height, logo and text colour) for the page on screen and the PDF, the
// page margins, and the parts themselves, put back unchanged into the Word file made from it.
// ---------------------------------------------------------------------------------------------------------------

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const attr = (el: Element | undefined | null, name: string) => el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? null;
// Word keeps each text box twice (the modern shape and a fallback for old versions); only the first counts.
const inFallback = (n: Element) => {
  for (let p = n.parentElement; p; p = p.parentElement) if (p.namespaceURI === MC && p.localName === "Fallback") return true;
  return false;
};
const ownPara = (n: Element) => {
  for (let p = n.parentElement; p; p = p.parentElement) if (p.namespaceURI === W && p.localName === "p") return p;
  return null;
};

function zonesOf(doc: Document): HFZones | null {
  const paras = Array.from(doc.getElementsByTagNameNS(W, "p")).filter((p) => !inFallback(p));
  const out: HFZones = { left: "", center: "", right: "" };
  let any = false;
  for (const p of paras) {
    const jc = attr(Array.from(p.getElementsByTagNameNS(W, "jc")).find((j) => ownPara(j) === p), "val") ?? "left";
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
      if (ownPara(n) !== p) continue;
      if (n.localName === "instrText") field += n.textContent ?? "";
      else if (n.localName === "fldChar") {
        const t = attr(n, "fldCharType");
        if (t === "begin") ((state = "instr"), (field = ""));
        else if (t === "separate") ((text += placeholder(field)), (state = "result"));
        else if (t === "end") {
          if (state === "instr") text += placeholder(field);
          state = "none";
        }
      } else if (n.localName === "fldSimple") text += placeholder(attr(n, "instr") ?? "");
      else if (n.localName === "t" && state === "none" && n.parentElement?.parentElement?.localName !== "fldSimple") text += n.textContent ?? "";
      else if (n.localName === "tab" && n.parentElement?.localName === "r" && state === "none") text += "\t";
      else if (n.localName === "br" && n.parentElement?.localName === "r" && state === "none") text += "\n";
    }
    const t = text.replace(/[  ]+/g, " ").trim();
    if (!t) continue;
    any = true;
    const add = (k: keyof HFZones, v: string) => (out[k] = [out[k], v.trim()].filter(Boolean).join("\n"));
    const parts = t.split("\t").map((x) => x.trim());
    if (parts.length >= 3) (add("left", parts[0]!), add("center", parts[1]!), add("right", parts.slice(2).join(" ")));
    else if (parts.length === 2) (add("left", parts[0]!), add("right", parts[1]!));
    else add(jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : "left", parts[0]!);
  }
  return any ? out : null;
}

// The banner: the widest filled shape (its gradient or colour and height) or a page-wide picture, the logo (the
// first other picture), and the colour of the text on it.
async function artOf(doc: Document, media: (rid: string) => Promise<string | null>): Promise<HFArt | null> {
  const emuMm = (v: string | null) => (v ? Number(v) / 36000 : 0);
  let best: { w: number; h: number; colors: string[]; angle: number } | null = null;
  let bg: { src: string; h: number } | null = null;
  let logo: string | null = null;
  for (const d of Array.from(doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "extent"))) {
    const holder = d.parentElement;
    if (!holder || inFallback(holder)) continue;
    const w = emuMm(d.getAttribute("cx"));
    const h = emuMm(d.getAttribute("cy"));
    const blip = holder.getElementsByTagNameNS(A, "blip")[0];
    if (blip) {
      const src = await media(blip.getAttributeNS(R, "embed") ?? blip.getAttribute("r:embed") ?? "");
      if (!src) continue;
      if (w >= 150) bg = bg && bg.h >= h ? bg : { src, h };
      else logo ??= src;
      continue;
    }
    const sp = Array.from(holder.getElementsByTagNameNS(A, "*")).find((x) => x.localName === "gradFill" || x.localName === "solidFill");
    if (!sp || w < 120) continue;
    const colors = sp.localName === "gradFill" ? Array.from(sp.getElementsByTagNameNS(A, "srgbClr")).map((c) => `#${c.getAttribute("val")}`) : [`#${sp.getElementsByTagNameNS(A, "srgbClr")[0]?.getAttribute("val") ?? "16a34a"}`];
    const ang = Number(sp.getElementsByTagNameNS(A, "lin")[0]?.getAttribute("ang") ?? 0) / 60000;
    if (colors.length && (!best || w * h > best.w * best.h)) best = { w, h, colors: colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)), angle: ang };
  }
  if (!best && !bg) return null;
  const textColor = Array.from(doc.getElementsByTagNameNS(W, "color")).map((c) => attr(c, "val")).find((v) => v && /^[0-9a-f]{6}$/i.test(v));
  const bold = doc.getElementsByTagNameNS(W, "b").length > 0;
  return {
    colors: best?.colors.length ? best.colors : ["#16a34a"],
    angle: best?.angle ?? 0,
    heightMm: Math.min(60, Math.max(8, Math.round(best?.h ?? bg?.h ?? 25))),
    textColor: textColor ? `#${textColor}` : "#ffffff",
    logo,
    bg: bg?.src ?? null,
    bold,
  };
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", emf: "image/x-emf", wmf: "image/x-wmf", tif: "image/tiff", tiff: "image/tiff" };

export async function headerFooterOfDocx(file: Blob): Promise<HeaderFooter | null> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const relXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const parse = (x: string) => new DOMParser().parseFromString(x, "application/xml");
  const relMap = (x: string) => new Map(Array.from(parse(x).getElementsByTagName("Relationship")).map((r) => [r.getAttribute("Id") ?? "", { target: r.getAttribute("Target") ?? "", mode: r.getAttribute("TargetMode") }]));
  const rels = relMap(relXml);
  const doc = parse(docXml);
  // The last section's references (the body's own sectPr) are the document's main header and footer.
  const sect = Array.from(doc.getElementsByTagNameNS(W, "sectPr")).at(-1);
  if (!sect) return null;
  const tw = (v: string | null) => (v ? Math.round((Number(v) / 56.6929) * 10) / 10 : 0);
  const mar = sect.getElementsByTagNameNS(W, "pgMar")[0];
  const margins = mar ? { top: tw(attr(mar, "top")), bottom: tw(attr(mar, "bottom")), left: tw(attr(mar, "left")), right: tw(attr(mar, "right")), header: tw(attr(mar, "header")), footer: tw(attr(mar, "footer")) } : undefined;
  type Part = { zones: HFZones | null; art: HFArt | null; raw: HFRaw };
  const pick = async (tag: "headerReference" | "footerReference", type: string): Promise<Part | null> => {
    const ref = Array.from(sect.getElementsByTagNameNS(W, tag)).find((x) => (attr(x, "type") ?? "default") === type);
    const target = ref ? rels.get(ref.getAttributeNS(R, "id") ?? ref.getAttribute("r:id") ?? "")?.target : null;
    if (!target) return null;
    const path = `word/${target.replace(/^\.?\//, "")}`;
    const xml = await zip.file(path)?.async("string");
    if (!xml) return null;
    const partRelsXml = (await zip.file(path.replace(/([^/]+)$/, "_rels/$1.rels"))?.async("string")) ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
    const partRels = relMap(partRelsXml);
    // The pictures it uses, kept with the part (for the Word file) and as data URLs (for the screen and the PDF).
    const files: HFRaw["media"] = [];
    const seen = new Map<string, string | null>();
    const media = async (rid: string) => {
      if (seen.has(rid)) return seen.get(rid)!;
      const r = partRels.get(rid);
      let url: string | null = null;
      if (r && r.mode !== "External") {
        const p = `word/${r.target.replace(/^\.?\//, "")}`;
        const b64 = await zip.file(p)?.async("base64");
        const ext = p.split(".").pop()!.toLowerCase();
        if (b64 && MIME[ext] && b64.length < 1_500_000) url = `data:${MIME[ext]};base64,${b64}`;
      }
      seen.set(rid, url);
      return url;
    };
    for (const [, r] of partRels) {
      if (r.mode === "External" || !/^(\.\/)?media\//.test(r.target)) continue;
      const p = `word/${r.target.replace(/^\.?\//, "")}`;
      const b64 = await zip.file(p)?.async("base64");
      if (b64 && b64.length < 1_500_000) files.push({ name: p.split("/").pop()!, b64, type: MIME[p.split(".").pop()!.toLowerCase()] ?? "application/octet-stream" });
    }
    const d = parse(xml);
    return { zones: zonesOf(d), art: await artOf(d, media), raw: { xml, rels: partRelsXml, media: files } };
  };
  const [h, f, h1, f1] = await Promise.all([pick("headerReference", "default"), pick("footerReference", "default"), pick("headerReference", "first"), pick("footerReference", "first")]);
  if (!h && !f && !h1 && !f1) return null;
  const titlePg = !!sect.getElementsByTagNameNS(W, "titlePg")[0];
  const main = { header: h ?? h1, footer: f ?? f1 };
  return {
    ...DEFAULT_HF,
    header: main.header?.zones ?? EMPTY_ZONES,
    footer: main.footer?.zones ?? EMPTY_ZONES,
    // The banner's own logo is drawn with it; the company logo is not added again.
    logo: "none",
    ruleUnderHeader: false,
    ruleOverFooter: false,
    color: "#475569",
    differentFirst: titlePg && !!(h1 || f1) && !h,
    art: { header: main.header?.art ?? undefined, footer: main.footer?.art ?? undefined },
    raw: { header: main.header?.raw, footer: main.footer?.raw },
    margins,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Banners: drawn as HTML on the page and in the PDF, and as a picture behind the text in a Word file made from a
// design (a Word file's own header goes back into Word unchanged instead).
// ---------------------------------------------------------------------------------------------------------------

const HEX6 = /^#[0-9a-f]{6}$/i;
const DATA_IMG = /^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/;
// Only hex colours, numbers and data-URL pictures go into the band's style (it is written as an HTML attribute).
function safeArt(a: HFArt): HFArt {
  const colors = (Array.isArray(a.colors) ? a.colors : []).filter((c) => HEX6.test(c));
  return { ...a, colors: colors.length ? colors : ["#16a34a"], angle: Number(a.angle) || 0, heightMm: Math.min(80, Math.max(6, Number(a.heightMm) || 25)), textColor: HEX6.test(a.textColor) ? a.textColor : "#ffffff", bg: a.bg && DATA_IMG.test(a.bg) ? a.bg : null, logo: a.logo === "brand" || (a.logo && (DATA_IMG.test(a.logo) || /^\/brand\/[\w.-]+\.png$/.test(a.logo))) ? a.logo : null };
}
// Single quotes around the picture: the band is written into a double-quoted style attribute.
export const bandBackground = (x: HFArt) => {
  const a = safeArt(x);
  return a.bg ? `url('${a.bg}') center/cover no-repeat` : a.colors.length > 1 ? `linear-gradient(${90 + a.angle}deg, ${a.colors.join(", ")})` : a.colors[0]!;
};

// One band: logo, then the zones' text (fields filled in; page numbers as given), in the band's text colour.
export function bandHtml(raw: HFArt, z: HFZones, f: Fields, logoUrl: string, where: "header" | "footer", page = "", pages = "") {
  const a = safeArt(raw);
  // Lines left empty (a contact the letterhead does not have) are dropped, not shown as gaps.
  const t = (x: string) => fillText(x, f, page, pages).split("\n").filter((l) => l.trim()).map(esc).join("<br>");
  const logo = a.logo === "brand" ? logoUrl : a.logo;
  const img = logo && !a.bg ? `<img src="${esc(logo)}" alt="" style="height:${Math.min(a.heightMm - 8, 18)}mm;width:auto;flex:none">` : "";
  const col = (x: string, align: string, grow = 1) => (x.trim() ? `<div style="flex:${grow};text-align:${align};line-height:1.35">${t(x)}</div>` : `<div style="flex:${grow}"></div>`);
  const big = where === "header" && z.left.includes("\n") ? z.left.split("\n") : null;
  const left = big ? `<div style="flex:1;line-height:1.1"><div style="font-size:20pt;font-weight:800;letter-spacing:.5pt">${esc(fillText(big[0]!, f))}</div><div style="font-size:11pt;letter-spacing:1pt;opacity:.9">${big.slice(1).map((x) => esc(fillText(x, f))).join("<br>")}</div></div>` : col(z.left, "left");
  return `<div class="hf-band hf-${where}" style="background:${bandBackground(a)};color:${a.textColor};height:${a.heightMm}mm;display:flex;align-items:center;gap:5mm;padding:0 14mm;font-size:${where === "header" ? 10 : 8.5}pt;${a.bold ? "font-weight:600;" : ""}-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box">${img}${left}${col(z.center, "center", where === "footer" ? 3 : 1)}${col(z.right, "right")}</div>`;
}

// The band as a PNG (twice the screen's resolution), for Word.
export async function bandPng(raw: HFArt, z: HFZones, f: Fields, logoUrl: string, where: "header" | "footer", widthMm: number): Promise<Uint8Array | null> {
  const a = safeArt(raw);
  try {
    const k = 12; // pixels per millimetre (about 300 dpi)
    const cv = document.createElement("canvas");
    cv.width = Math.round(widthMm * k);
    cv.height = Math.round(a.heightMm * k);
    const g = cv.getContext("2d")!;
    const load = (src: string) => new Promise<HTMLImageElement | null>((ok) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    if (a.bg) {
      const i = await load(a.bg);
      if (i) g.drawImage(i, 0, 0, cv.width, cv.height);
    } else {
      const rad = (a.angle * Math.PI) / 180;
      const grad = g.createLinearGradient(0, 0, cv.width * Math.cos(rad) || cv.width, cv.width * Math.sin(rad));
      const cs = a.colors.length ? a.colors : ["#16a34a"];
      cs.forEach((c, i) => grad.addColorStop(cs.length === 1 ? 0 : i / (cs.length - 1), c));
      g.fillStyle = grad;
      g.fillRect(0, 0, cv.width, cv.height);
    }
    let x = 14 * k;
    const logo = a.logo === "brand" ? logoUrl : a.logo;
    if (logo && !a.bg) {
      const i = await load(logo);
      if (i) {
        const h = Math.min(a.heightMm - 8, 18) * k;
        const w = (i.naturalWidth / Math.max(1, i.naturalHeight)) * h;
        g.drawImage(i, x, (cv.height - h) / 2, w, h);
        x += w + 5 * k;
      }
    }
    g.fillStyle = a.textColor;
    g.textBaseline = "middle";
    const pt = (n: number) => (n / 72) * 25.4 * k;
    const lines = (s: string) => fillText(s, f).split("\n").filter((l) => l.trim());
    const draw = (ls: string[], tx: number, align: CanvasTextAlign, size: number, weight: string, first?: { size: number; weight: string }) => {
      g.textAlign = align;
      const sizes = ls.map((_, i) => (i === 0 && first ? first : { size, weight }));
      const total = sizes.reduce((s, v) => s + pt(v.size) * 1.3, 0);
      let y = (cv.height - total) / 2;
      ls.forEach((l, i) => {
        const s = sizes[i]!;
        g.font = `${s.weight} ${pt(s.size)}px "Segoe UI", Arial, "Noto Sans Ethiopic", sans-serif`;
        y += (pt(s.size) * 1.3) / 2;
        g.fillText(l, tx, y);
        y += (pt(s.size) * 1.3) / 2;
      });
    };
    const base = where === "header" ? 10 : 8.5;
    const weight = a.bold ? "600" : "400";
    const L = lines(z.left);
    if (where === "header" && L.length > 1) draw(L, x, "left", 11, "400", { size: 20, weight: "800" });
    else draw(L, x, "left", base, weight);
    draw(lines(z.center), cv.width / 2, "center", base, weight);
    draw(lines(z.right), cv.width - 14 * k, "right", base, weight);
    const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

// Puts a Word file's own header and footer parts (and their pictures) in place of the marked ones in a new file.
export async function transplantHF(blob: Blob, raw: { header?: HFRaw; footer?: HFRaw }): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  let types = (await zip.file("[Content_Types].xml")!.async("string")) ?? "";
  for (const [where, part] of Object.entries(raw) as ["header" | "footer", HFRaw | undefined][]) {
    if (!part) continue;
    const marker = where === "header" ? "@@RAW_HEADER@@" : "@@RAW_FOOTER@@";
    for (const name of Object.keys(zip.files).filter((n) => new RegExp(`^word/${where}\\d*\\.xml$`).test(n))) {
      const xml = await zip.file(name)!.async("string");
      if (!xml.includes(marker)) continue;
      let rels = part.rels;
      for (const m of part.media) {
        const to = `hf_${where}_${m.name}`;
        zip.file(`word/media/${to}`, m.b64, { base64: true });
        rels = rels.split(`media/${m.name}"`).join(`media/${to}"`);
        const ext = m.name.split(".").pop()!.toLowerCase();
        if (!new RegExp(`Extension="${ext}"`, "i").test(types)) types = types.replace("<Default ", `<Default Extension="${ext}" ContentType="${m.type}"/><Default `);
      }
      zip.file(name, part.xml);
      zip.file(name.replace(/^word\/(.+)$/, "word/_rels/$1.rels"), rels);
    }
  }
  zip.file("[Content_Types].xml", types);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
