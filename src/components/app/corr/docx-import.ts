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
      const rows = Array.from(node.getElementsByTagNameNS(W, "tr")).map((tr) => Array.from(tr.getElementsByTagNameNS(W, "tc")).map((tc) => Array.from(tc.getElementsByTagNameNS(W, "p")).map(runsText).join("\n")));
      if (rows.length) blocks.push({ id: bid(), type: "table", header: true, rows });
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
      blocks.push({ id: bid(), type: "paragraph", text, align: jc === "center" ? "center" : jc === "right" ? "right" : jc === "both" ? "justify" : "left" });
    }
  }
  flush();
  return blocks;
}
