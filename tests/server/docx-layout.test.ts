// The Document Builder's Word file: cover without a number, front matter in Roman numerals, main pages from 1,
// a contents page linked to its headings, and the designed header and footer with page fields.
import JSZip from "jszip";
import { blocksDocx, type Block } from "../../src/components/app/tools/doc-model";
import { DEFAULT_LAYOUT, effectiveHF, newCover, splitParts, withNumber } from "../../src/components/app/tools/page-layout";
import { DEFAULT_LETTERHEAD } from "../../src/lib/tools";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};

async function main() {
  const blocks: Block[] = [
    { id: "t1", type: "toc", title: "Contents" },
    { id: "pb", type: "pagebreak" },
    { id: "h1", type: "heading", level: 1, text: "Introduction" },
    { id: "p1", type: "paragraph", text: "Hello **world**." },
    { id: "s1", type: "section", title: "Part two" },
    { id: "h2", type: "heading", level: 1, text: "Findings" },
  ];
  const layout = { ...DEFAULT_LAYOUT, source: "custom" as const, cover: newCover("Annual report", "Author", "Company", "#16a34a"), numbering: { ...DEFAULT_LAYOUT.numbering, cover: true, mainStartsAt: "pb" } };
  const parts = splitParts(blocks, layout);
  check("the front matter is the contents", parts.front.length === 1 && parts.front[0]!.type === "toc", parts.front);
  check("the main pages start after the break", parts.main[0]?.id === "h1", parts.main[0]);
  check("a footer without a page field gets the number", /\{page\}/.test(JSON.stringify(withNumber({ ...layout.hf, footer: { left: "", center: "", right: "" } }, layout.numbering, true)?.footer)));

  const blob = await blocksDocx({ title: "Annual report", blocks, letterhead: { ...DEFAULT_LETTERHEAD, logoData: null }, layout: { layout, hf: effectiveHF(layout, DEFAULT_LETTERHEAD), fields: { title: "Annual report", author: "A", date: "2026-11-27", company: "Company" }, page: { w: 210, h: 297, margins: { top: 20, right: 18, bottom: 20, left: 18 } }, pageNumbers: true } });
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
  const doc = await zip.file("word/document.xml")!.async("string");
  const sects = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) ?? [];
  check("three Word sections: cover, front matter, main pages", sects.length === 3, sects.length);
  check("front matter counts in Roman numerals from i", /w:start="1" w:fmt="lowerRoman"/.test(sects[1] ?? ""));
  check("main pages count again from 1", /w:start="1" w:fmt="decimal"/.test(sects[2] ?? ""));
  check("the contents links to the headings", (doc.match(/<w:bookmarkStart/g) ?? []).length === 2 && (doc.match(/PAGEREF/g) ?? []).length === 2);
  const footers = await Promise.all(Object.keys(zip.files).filter((n) => /footer\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async("string")));
  check("the cover's footer has no page number", footers.some((f) => !/PAGE/.test(f)));
  check("the other footers show the page of the part", footers.filter((f) => /SECTIONPAGES/.test(f)).length === 2);
  check("Word fills the contents' page numbers on opening", (await zip.file("word/settings.xml")!.async("string")).includes("updateFields"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  console.log("FAIL crashed");
  process.exit(1);
});
