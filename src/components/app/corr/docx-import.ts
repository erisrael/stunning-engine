// Reads a Word file (.docx) into letter blocks in the browser: headings, paragraphs (with bold and italics), lists
// and tables. Pictures, text boxes and exact layout are not carried over; the letterhead comes from the template.

import type { Block } from "@/components/app/tools/doc-model";
import { bid } from "@/components/app/tools/doc-model";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function runsText(p: Element) {
  let out = "";
  for (const r of Array.from(p.getElementsByTagNameNS(W, "r"))) {
    const t = Array.from(r.childNodes)
      .map((n) => ((n as Element).localName === "t" ? (n.textContent ?? "") : (n as Element).localName === "tab" ? "\t" : (n as Element).localName === "br" ? "\n" : ""))
      .join("");
    if (!t) continue;
    const pr = r.getElementsByTagNameNS(W, "rPr")[0];
    const bold = !!pr?.getElementsByTagNameNS(W, "b")[0] && pr.getElementsByTagNameNS(W, "b")[0]!.getAttributeNS(W, "val") !== "0";
    const italic = !!pr?.getElementsByTagNameNS(W, "i")[0] && pr.getElementsByTagNameNS(W, "i")[0]!.getAttributeNS(W, "val") !== "0";
    const on = (tag: string) => !!pr?.getElementsByTagNameNS(W, tag)[0] && pr.getElementsByTagNameNS(W, tag)[0]!.getAttributeNS(W, "val") !== "0" && pr.getElementsByTagNameNS(W, tag)[0]!.getAttributeNS(W, "val") !== "none";
    const color = pr?.getElementsByTagNameNS(W, "color")[0]?.getAttributeNS(W, "val");
    let x = t;
    if (x.trim()) {
      if (bold) x = `**${x}**`;
      else if (italic) x = `*${x}*`;
      if (on("u")) x = `__${x}__`;
      if (on("strike")) x = `~~${x}~~`;
      if (pr?.getElementsByTagNameNS(W, "highlight")[0]) x = `==${x}==`;
      if (color && /^[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== "000000") x = `{#${color.toLowerCase()}|${x}}`;
    }
    out += x;
  }
  return out.replace(/\*\*\*\*/g, "");
}

const attrW = (el: Element | undefined | null, name: string) => el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? null;
// A "#rrggbb" colour from a Word attribute (auto, none and white-on-nothing are not colours).
const hexOf = (el: Element | undefined | null, name: string) => {
  const v = attrW(el, name);
  return v && /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : undefined;
};

export async function docxToBlocks(file: File): Promise<Block[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("This is not a Word document.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) return [];
  // Pictures: the relationship ids of the document's images, read as data URLs.
  const relXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const rels = new Map(Array.from(new DOMParser().parseFromString(relXml, "application/xml").getElementsByTagName("Relationship")).map((r) => [r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? ""]));
  const picture = async (p: Element) => {
    const blip = p.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "blip")[0];
    const rid = blip?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed");
    const target = rid ? rels.get(rid) : null;
    if (!target) return null;
    const path = `word/${target.replace(/^\.\//, "")}`;
    const ext = path.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : null;
    const data = mime ? await zip.file(path)?.async("base64") : null;
    return data && data.length < 2_000_000 ? `data:${mime};base64,${data}` : null;
  };
  const blocks: Block[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (list) blocks.push({ id: bid(), type: "list", ordered: list.ordered, items: list.items });
    list = null;
  };
  for (const node of Array.from(body.children)) {
    if (node.localName === "tbl") {
      flush();
      const trs = Array.from(node.getElementsByTagNameNS(W, "tr"));
      const rows = trs.map((tr) => Array.from(tr.getElementsByTagNameNS(W, "tc")).map((tc) => Array.from(tc.getElementsByTagNameNS(W, "p")).map(runsText).join("\n")));
      if (!rows.length) continue;
      // The first row is a header when it repeats on each page, is shaded, or is all bold.
      const first = trs[0]!;
      const headFill = hexOf(first.getElementsByTagNameNS(W, "shd")[0], "fill");
      const headColor = hexOf(first.getElementsByTagNameNS(W, "color")[0], "val");
      const header = !!first.getElementsByTagNameNS(W, "tblHeader")[0] || !!headFill || rows[0]!.every((c) => !c.trim() || /^\*\*[\s\S]*\*\*$/.test(c.trim()));
      const bordersEl = node.getElementsByTagNameNS(W, "tblBorders")[0];
      const border = hexOf(bordersEl ? Array.from(bordersEl.children).find((b) => hexOf(b, "color")) : node.getElementsByTagNameNS(W, "tcBorders")[0]?.firstElementChild ?? undefined, "color");
      const grid = Array.from(node.getElementsByTagNameNS(W, "gridCol")).map((g) => Number(attrW(g, "w")) || 0);
      const total = grid.reduce((a, b) => a + b, 0);
      const widths = total > 0 && grid.length === Math.max(...rows.map((r) => r.length)) ? grid.map((g) => Math.round((g / total) * 100)) : undefined;
      // A header's own colour mark is dropped: the header colour is the table's.
      const clean = header && headColor ? [rows[0]!.map((c) => c.replace(/^\{#[0-9a-f]{6}\|([\s\S]*)\}$/i, "$1")), ...rows.slice(1)] : rows;
      blocks.push({ id: bid(), type: "table", header, rows: clean, ...(headFill || headColor || border || widths ? { style: { ...(headFill ? { headFill } : {}), ...(headColor ? { headColor } : {}), ...(border ? { border } : {}), ...(widths ? { widths } : {}) } } : {}) });
      continue;
    }
    if (node.localName !== "p") continue;
    const style = node.getElementsByTagNameNS(W, "pStyle")[0]?.getAttributeNS(W, "val") ?? "";
    const numbered = !!node.getElementsByTagNameNS(W, "numPr")[0];
    const text = runsText(node);
    if (node.getElementsByTagNameNS(W, "drawing")[0]) {
      const src = await picture(node);
      if (src) {
        flush();
        blocks.push({ id: bid(), type: "image", src, width: 70, align: "center" });
        if (!text.trim()) continue;
      }
    }
    const h = /^Heading([1-3])$/i.exec(style) ?? (/^Title$/i.test(style) ? ["", "1"] : null);
    if (numbered || /List/i.test(style)) {
      const ordered = /Number/i.test(style);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      if (text.trim()) list.items.push(text);
      continue;
    }
    flush();
    if (h && text.trim()) blocks.push({ id: bid(), type: "heading", level: Number(h[1]) as 1 | 2 | 3, text: text.replace(/\*\*/g, "") });
    else if (text.trim()) {
      const jc = node.getElementsByTagNameNS(W, "jc")[0]?.getAttributeNS(W, "val");
      // A shaded or bordered paragraph (a subject band, a note box) keeps its fill and border.
      const pPr = Array.from(node.children).find((c) => c.localName === "pPr");
      const fill = hexOf(pPr ? Array.from(pPr.children).find((c) => c.localName === "shd") : undefined, "fill");
      const bdr = pPr ? Array.from(pPr.children).find((c) => c.localName === "pBdr") : undefined;
      const sides = bdr ? Array.from(bdr.children).filter((b) => attrW(b, "val") && attrW(b, "val") !== "none" && attrW(b, "val") !== "nil") : [];
      const borderColor = hexOf(sides[0], "color");
      const borderSide = sides.length >= 3 ? ("all" as const) : sides.some((b) => b.localName === "left") ? ("left" as const) : sides.some((b) => b.localName === "bottom") ? ("bottom" as const) : undefined;
      const style = fill || borderColor ? { ...(fill ? { fill } : {}), ...(borderColor && borderSide ? { border: borderColor, borderSide } : {}) } : undefined;
      blocks.push({ id: bid(), type: "paragraph", text, align: jc === "center" ? "center" : jc === "right" ? "right" : jc === "both" ? "justify" : "left", ...(style ? { style } : {}) });
    }
  }
  flush();
  return blocks;
}
