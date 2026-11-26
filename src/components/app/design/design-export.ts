"use client";

// Designs out of the browser: PNG and JPEG (each page, exactly as drawn), SVG, PDF (the print dialog, Save as PDF,
// page size from the design), PowerPoint (text boxes, shapes, lines, tables and pictures stay editable) and Word
// (each page as a full-page picture, for sending as .docx).

import { elementInner, pageHtml, pageSvg, webFontsCss, type Design, type DElement, type Extras } from "@/lib/design";

const MM_PX = 96 / 25.4;

// A page drawn off screen at the size asked, then photographed.
async function pageNode(d: Design, index: number, values: Record<string, string>, extras: Extras) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;z-index:-1";
  host.innerHTML = `<style>${webFontsCss(d)}</style>${pageHtml(d, d.pages[index]!, values, { ...extras, editing: false })}`;
  document.body.appendChild(host);
  await document.fonts?.ready?.catch(() => undefined);
  await Promise.all([...host.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((ok) => ((img.onload = ok), (img.onerror = ok))))));
  return { host, node: host.querySelector<HTMLElement>(".dz-page")! };
}

export async function pageImage(d: Design, index: number, type: "png" | "jpeg", values: Record<string, string> = {}, extras: Extras = {}, dpi = 200) {
  const ms = await import("modern-screenshot");
  const { host, node } = await pageNode(d, index, values, extras);
  try {
    const scale = dpi / 96;
    return type === "png" ? await ms.domToPng(node, { scale, backgroundColor: null }) : await ms.domToJpeg(node, { scale, quality: 0.92, backgroundColor: "#ffffff" });
  } finally {
    host.remove();
  }
}

export function download(href: string | Blob, name: string) {
  const a = document.createElement("a");
  const url = typeof href === "string" ? href : URL.createObjectURL(href);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof href !== "string") setTimeout(() => URL.revokeObjectURL(url), 3000);
}
const safe = (s: string) => (s || "design").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "design";

export async function exportImages(d: Design, title: string, type: "png" | "jpeg", values: Record<string, string> = {}, extras: Extras = {}, only?: number) {
  const list = only === undefined ? d.pages.map((_, i) => i) : [only];
  if (list.length === 1) return download(await pageImage(d, list[0]!, type, values, extras), `${safe(title)}.${type === "png" ? "png" : "jpg"}`);
  // Several pages: one zip.
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const i of list) {
    const url = await pageImage(d, i, type, values, extras);
    zip.file(`${safe(title)}-${String(i + 1).padStart(2, "0")}.${type === "png" ? "png" : "jpg"}`, url.split(",")[1]!, { base64: true });
  }
  download(await zip.generateAsync({ type: "blob" }), `${safe(title)}-pages.zip`);
}

export function exportSvg(d: Design, title: string, values: Record<string, string> = {}, extras: Extras = {}, index = 0) {
  download(new Blob([pageSvg(d, d.pages[index]!, values, extras)], { type: "image/svg+xml" }), `${safe(title)}.svg`);
}

export function printDesign(d: Design, title: string, values: Record<string, string> = {}, extras: Extras = {}) {
  const w = window.open("", "_blank", "width=1000,height=1100");
  if (!w) return alert("Allow pop-ups for this site to save as PDF.");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${webFontsCss(d)}
@page{size:${d.w}mm ${d.h}mm;margin:0}
html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.dz-page{page-break-after:always;break-after:page}
.dz-page:last-child{page-break-after:auto;break-after:auto}
@media screen{body{background:#e2e8f0}.dz-page{margin:12px auto;box-shadow:0 2px 12px rgba(0,0,0,.15)}}
</style></head><body>${d.pages.map((p) => pageHtml(d, p, values, { ...extras, editing: false })).join("")}<script>window.onload=()=>{(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>setTimeout(()=>{window.focus();window.print();},400))}<\/script></body></html>`);
  w.document.close();
}

// PowerPoint: positions in inches; text, shapes, lines and tables native (editable), the rest as pictures.
export async function exportPptx(d: Design, title: string, values: Record<string, string> = {}, extras: Extras = {}) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  const inch = (mm: number) => mm / 25.4;
  pres.defineLayout({ name: "DESIGN", width: inch(d.w), height: inch(d.h) });
  pres.layout = "DESIGN";
  pres.title = title;
  const c = (hex?: string | null) => (hex ? hex.replace("#", "").toUpperCase() : undefined);
  const fillText = (t: string) => t.replace(/\{\{\s*([a-z0-9_]{1,40})\s*\}\}/gi, (m, k: string) => values[k.toLowerCase()] ?? m);
  const SHAPES: Record<string, string> = { rect: "rect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", star: "star5", arrow: "rightArrow", hexagon: "hexagon", speech: "wedgeRectCallout", pill: "roundRect" };
  for (const p of d.pages) {
    const slide = pres.addSlide();
    if (p.bgImage) slide.background = { data: p.bgImage };
    else slide.background = { color: c(p.bg) ?? "FFFFFF" };
    if (p.notes) slide.addNotes(p.notes);
    for (const e of p.elements as DElement[]) {
      if (e.hidden) continue;
      const pos = { x: inch(e.x), y: inch(e.y), w: Math.max(0.01, inch(e.w)), h: Math.max(0.01, inch(e.h)), rotate: e.rotate || undefined };
      const transparency = e.opacity < 1 ? Math.round((1 - e.opacity) * 100) : undefined;
      if (e.kind === "text") {
        slide.addText(fillText(e.uppercase ? e.text.toUpperCase() : e.text), {
          ...pos,
          fontFace: e.font,
          fontSize: e.size,
          bold: e.weight >= 600,
          italic: !!e.italic,
          underline: e.underline ? { style: "sng" } : undefined,
          strike: e.strike ? "sngStrike" : undefined,
          color: c(e.color),
          align: e.align === "justify" ? "justify" : e.align,
          valign: e.valign === "middle" ? "middle" : e.valign === "bottom" ? "bottom" : "top",
          lineSpacingMultiple: e.lineHeight,
          charSpacing: e.letterSpacing || undefined,
          fill: e.bg ? { color: c(e.bg)! } : undefined,
          margin: (e.padding ?? 0) * 2.83,
          bullet: e.list === "bullet" ? true : e.list === "number" ? { type: "number" } : undefined,
          shadow: e.shadow ? { type: "outer", blur: 3, offset: 2, angle: 45, color: "000000", opacity: 0.35 } : undefined,
          hyperlink: e.link ? { url: e.link } : undefined,
          transparency,
        });
      } else if (e.kind === "shape") {
        slide.addShape(SHAPES[e.shape] as never, { ...pos, fill: e.fill ? { color: c(e.fill)!, transparency } : { type: "none" } as never, line: e.stroke ? { color: c(e.stroke)!, width: e.strokeWidth * 2.83, dashType: e.dash ? "dash" : "solid" } : { type: "none" } as never, rectRadius: e.shape === "pill" ? 0.5 : e.radius ? Math.min(0.5, e.radius / Math.min(e.w, e.h)) : undefined });
      } else if (e.kind === "line") {
        slide.addShape("line" as never, { x: pos.x, y: pos.y + pos.h / 2, w: pos.w, h: 0, rotate: pos.rotate, line: { color: c(e.stroke)!, width: e.strokeWidth * 2.83, dashType: e.dash ? "dash" : "solid", endArrowType: e.arrowEnd ? "triangle" : undefined, beginArrowType: e.arrowStart ? "triangle" : undefined } });
      } else if (e.kind === "table") {
        slide.addTable(
          e.rows.map((r, i) => r.map((t) => ({ text: fillText(t), options: i === 0 && e.header ? { bold: true, color: c(e.headColor), fill: { color: c(e.headFill)! } } : e.stripe && i % 2 === 0 ? { fill: { color: c(e.stripe)! } } : {} }))),
          { ...pos, fontFace: e.font, fontSize: e.size, color: c(e.color), border: { type: "solid", pt: 0.5, color: c(e.border)! }, align: e.align ?? "left", valign: "middle" },
        );
      } else if (e.kind === "image") {
        const src = e.src === "logo" ? extras.logo : e.src;
        if (src && /^data:image\/(png|jpeg|gif)/.test(src)) slide.addImage({ data: src, ...pos, sizing: { type: e.fit === "contain" ? "contain" : "cover", w: pos.w, h: pos.h }, transparency, hyperlink: e.link ? { url: e.link } : undefined });
        else if (src) {
          const png = await asPng(src);
          if (png) slide.addImage({ data: png, ...pos });
        }
      } else {
        // Icons, QR codes, signatures and stamps: drawn as pictures.
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${e.w} ${Math.max(0.01, e.h)}" width="${Math.round(e.w * MM_PX * 3)}" height="${Math.round(Math.max(1, e.h) * MM_PX * 3)}">${elementInner({ ...e, x: 0, y: 0, rotate: 0, opacity: 1 }, values, { ...extras, editing: false }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
        const png = await asPng(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`);
        if (png) slide.addImage({ data: png, ...pos });
      }
    }
  }
  await pres.writeFile({ fileName: `${safe(title)}.pptx` });
}

async function asPng(src: string): Promise<string | null> {
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => ((img.onload = () => ok()), (img.onerror = () => bad(new Error("img"))), (img.src = src)));
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth || 512;
    cv.height = img.naturalHeight || 512;
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/png");
  } catch {
    return null;
  }
}

// Word: each page a picture filling the page, at the design's size.
export async function exportDocx(d: Design, title: string, values: Record<string, string> = {}, extras: Extras = {}) {
  download(await designDocx(d, title, values, extras), `${safe(title)}.docx`);
}
export async function designDocx(d: Design, title: string, values: Record<string, string> = {}, extras: Extras = {}): Promise<Blob> {
  const docx = await import("docx");
  const { Document, ImageRun, Packer, Paragraph } = docx;
  const tw = (mm: number) => Math.round(mm * 56.6929);
  const sections = [];
  for (let i = 0; i < d.pages.length; i++) {
    const url = await pageImage(d, i, "png", values, extras, 200);
    const bin = atob(url.split(",")[1]!);
    const bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    sections.push({
      properties: { page: { size: { width: tw(d.w), height: tw(d.h) }, margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 } } },
      children: [new Paragraph({ children: [new ImageRun({ type: "png", data: bytes, transformation: { width: Math.round(d.w * MM_PX), height: Math.round(d.h * MM_PX) - 2 } })] })],
    });
  }
  const doc = new Document({ title, creator: "Myseed", sections });
  return Packer.toBlob(doc);
}
