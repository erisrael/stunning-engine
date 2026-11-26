"use client";

// Opening a PowerPoint file (.pptx) as a design: each slide a page, with its text boxes (position, size, font size,
// bold, italic, colour, alignment), filled shapes and pictures in place, and the speaker notes. Read in the browser;
// nothing is uploaded.

import { cleanDesign, did, type DElement, type Design, type DPage } from "@/lib/design";

const EMU_MM = 1 / 36000;
const NS = { a: "http://schemas.openxmlformats.org/drawingml/2006/main", p: "http://schemas.openxmlformats.org/presentationml/2006/main", r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships" };

function rels(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const out = new Map<string, string>();
  for (const r of Array.from(doc.getElementsByTagName("Relationship"))) out.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");
  return out;
}
const join = (base: string, target: string) => {
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
};
const hex = (el: Element | null | undefined) => {
  const c = el?.getElementsByTagNameNS(NS.a, "srgbClr")[0]?.getAttribute("val");
  return c && /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : null;
};
function box(el: Element) {
  const off = el.getElementsByTagNameNS(NS.a, "off")[0];
  const ext = el.getElementsByTagNameNS(NS.a, "ext")[0];
  const rot = Number(el.getElementsByTagNameNS(NS.a, "xfrm")[0]?.getAttribute("rot") ?? 0) / 60000;
  if (!off || !ext) return null;
  return { x: Number(off.getAttribute("x")) * EMU_MM, y: Number(off.getAttribute("y")) * EMU_MM, w: Number(ext.getAttribute("cx")) * EMU_MM, h: Number(ext.getAttribute("cy")) * EMU_MM, rotate: Math.round(rot) };
}

export async function importPptx(file: File): Promise<Design> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const text = async (p: string) => (await zip.file(p)?.async("string")) ?? "";
  const pres = new DOMParser().parseFromString(await text("ppt/presentation.xml"), "application/xml");
  const size = pres.getElementsByTagNameNS(NS.p, "sldSz")[0];
  const W = Number(size?.getAttribute("cx") ?? 12192000) * EMU_MM;
  const H = Number(size?.getAttribute("cy") ?? 6858000) * EMU_MM;
  const presRels = rels(await text("ppt/_rels/presentation.xml.rels"));
  const order = Array.from(pres.getElementsByTagNameNS(NS.p, "sldId")).map((s) => presRels.get(s.getAttributeNS(NS.r, "id") ?? s.getAttribute("r:id") ?? "") ?? "");
  const pages: DPage[] = [];
  for (const target of order.slice(0, 60)) {
    const path = join("ppt/presentation.xml", target);
    const xml = await text(path);
    if (!xml) continue;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const slideRels = rels(await text(path.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels")));
    const elements: DElement[] = [];
    const bgFill = hex(doc.getElementsByTagNameNS(NS.p, "bg")[0]);
    for (const sp of Array.from(doc.getElementsByTagNameNS(NS.p, "sp"))) {
      const b = box(sp);
      if (!b) continue;
      const fill = hex(sp.getElementsByTagNameNS(NS.p, "spPr")[0]?.getElementsByTagNameNS(NS.a, "solidFill")[0]);
      const paras = Array.from(sp.getElementsByTagNameNS(NS.a, "p"));
      const lines = paras.map((p) => Array.from(p.getElementsByTagNameNS(NS.a, "t")).map((t) => t.textContent ?? "").join(""));
      const body = lines.join("\n").trim();
      if (fill && (!body || paras.length === 0)) elements.push({ id: did(), kind: "shape", shape: "rect", fill, stroke: null, strokeWidth: 0, ...b, opacity: 1 } as DElement);
      if (!body) continue;
      const rPr = sp.getElementsByTagNameNS(NS.a, "rPr")[0] ?? sp.getElementsByTagNameNS(NS.a, "defRPr")[0];
      const algn = paras[0]?.getElementsByTagNameNS(NS.a, "pPr")[0]?.getAttribute("algn");
      const isTitle = /title/i.test(sp.getElementsByTagNameNS(NS.p, "ph")[0]?.getAttribute("type") ?? "");
      const size = Number(rPr?.getAttribute("sz") ?? 0) / 100 || (isTitle ? 32 : 18);
      const bullets = paras.length > 1 && paras.some((p) => p.getElementsByTagNameNS(NS.a, "buChar").length || p.getElementsByTagNameNS(NS.a, "buAutoNum").length);
      elements.push({
        id: did(),
        kind: "text",
        text: body,
        font: rPr?.getElementsByTagNameNS(NS.a, "latin")[0]?.getAttribute("typeface")?.replace(/[^\w '-]/g, "").slice(0, 40) || "Calibri",
        size,
        weight: rPr?.getAttribute("b") === "1" || isTitle ? 700 : 400,
        italic: rPr?.getAttribute("i") === "1",
        underline: !!rPr?.getAttribute("u") && rPr.getAttribute("u") !== "none",
        color: hex(rPr) ?? "#111827",
        align: algn === "ctr" ? "center" : algn === "r" ? "right" : algn === "just" ? "justify" : "left",
        lineHeight: 1.2,
        bg: fill,
        list: bullets ? "bullet" : "none",
        ...b,
        opacity: 1,
      } as DElement);
    }
    for (const pic of Array.from(doc.getElementsByTagNameNS(NS.p, "pic"))) {
      const b = box(pic);
      const rid = pic.getElementsByTagNameNS(NS.a, "blip")[0]?.getAttributeNS(NS.r, "embed");
      const target2 = rid ? slideRels.get(rid) : null;
      if (!b || !target2) continue;
      const mediaPath = join(path, target2);
      const ext = mediaPath.split(".").pop()?.toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : null;
      const data = mime ? await zip.file(mediaPath)?.async("base64") : null;
      if (!data || data.length > 3_000_000) continue;
      elements.push({ id: did(), kind: "image", src: `data:${mime};base64,${data}`, fit: "cover", ...b, opacity: 1 } as DElement);
    }
    // Speaker notes.
    const notesTarget = [...slideRels.values()].find((t) => /notesSlide/.test(t));
    let notes = "";
    if (notesTarget) {
      const nd = new DOMParser().parseFromString(await text(join(path, notesTarget)), "application/xml");
      notes = Array.from(nd.getElementsByTagNameNS(NS.a, "p"))
        .map((p) => Array.from(p.getElementsByTagNameNS(NS.a, "t")).map((t) => t.textContent ?? "").join(""))
        .filter((l) => l.trim() && !/^\d+$/.test(l.trim()))
        .join("\n");
    }
    pages.push({ id: did(), bg: bgFill ?? "#ffffff", elements, notes: notes || undefined });
  }
  if (!pages.length) throw new Error("No slides were found in this file.");
  return cleanDesign({ v: 1, w: W, h: H, unit: "mm", pages });
}
