"use client";

// Page view: the document laid out on real pages, as Word's print layout. The text flows from page to page (a table
// longer than a page continues on the next with its header row repeated), and each page has its header and footer,
// its number (the cover none, the front matter i, ii, iii, the main pages 1, 2, 3) and its own background. The PDF
// prints these same pages, so what is on screen is what is printed.

import * as React from "react";
import { ImageIcon, PaintBucketIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { blocksHtml, esc, type Block } from "@/components/app/tools/doc-model";
import { bandHtml, coverHtml, fillText, hasPageField, hfValues, splitParts, withNumber, type DocLayout, type Fields, type HeaderFooter, type HFZones, type PageBg } from "@/components/app/tools/page-layout";
import { pageHtml, webFontsCss } from "@/lib/design";
import { cn } from "@/lib/utils";

const MM = 96 / 25.4;

// The page's type, scoped to .pv: the page view and the PDF use the same rules, so the pages break the same way.
export const PV_CSS = `.pv{font-family:"Segoe UI",Arial,"Noto Sans Ethiopic",sans-serif;color:#111827;font-size:11pt;line-height:1.5}
.pv h1{font-size:20pt;margin:0 0 8pt;font-weight:700}.pv h2{font-size:14pt;margin:14pt 0 6pt;font-weight:600}.pv h3{font-size:12pt;margin:10pt 0 4pt;font-weight:600}
.pv p{margin:0 0 6pt}.pv ul,.pv ol{margin:0 0 6pt 18pt;padding:0}.pv ul{list-style:disc}.pv ol{list-style:decimal}
.pv table{border-collapse:collapse;width:100%;margin:6pt 0 10pt}.pv th,.pv td{border:1px solid #cbd5e1;padding:4pt 6pt;text-align:left;vertical-align:top}.pv th{background:#f1f5f9}
.pv blockquote{border-left:3pt solid #94a3b8;margin:6pt 0;padding:2pt 10pt;color:#475569}.pv hr{border:0;border-top:1px solid #cbd5e1;margin:10pt 0}
.pv img{max-width:100%}
.pv-sheet{position:relative;overflow:hidden;background:#fff;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pv-body{position:absolute;overflow:hidden}
.pv-band{position:absolute;left:0;right:0}`;

const HEX = /^#[0-9a-f]{6}$/i;
const IMG = /^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/;
export function pageBgCss(bg: PageBg | null | undefined) {
  if (!bg) return "";
  const out: string[] = [];
  if (bg.color && HEX.test(bg.color)) out.push(`background-color:${bg.color}`);
  if (bg.image && IMG.test(bg.image)) out.push(`background-image:url('${bg.image}');background-position:center;background-repeat:no-repeat;background-size:${bg.fit === "contain" ? "contain" : bg.fit === "stretch" ? "100% 100%" : "cover"}`);
  return out.join(";");
}

// Flows HTML into pages of the given text area (mm): block by block, a page or section break starts a new page, and
// a table too long for what is left of a page is split between its rows (its header row repeated).
export function paginate(html: string, wMm: number, hMm: number): string[] {
  const host = document.createElement("div");
  host.className = "pv";
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${wMm}mm;visibility:hidden;pointer-events:none`;
  host.innerHTML = `<style>${PV_CSS}</style><div class="pv-flow" style="display:flow-root">${html}</div>`;
  document.body.appendChild(host);
  try {
    const flow = host.querySelector<HTMLElement>(".pv-flow")!;
    const limit = hMm * MM;
    const pages: string[][] = [[]];
    let used = 0;
    const next = () => {
      pages.push([]);
      used = 0;
    };
    const outer = (el: Element) => {
      const cs = getComputedStyle(el);
      return el.getBoundingClientRect().height + parseFloat(cs.marginTop || "0") + parseFloat(cs.marginBottom || "0");
    };
    for (const el of Array.from(flow.children)) {
      const cs = getComputedStyle(el);
      if ((cs.breakBefore === "page" || cs.pageBreakBefore === "always") && pages.at(-1)!.length) next();
      const h = outer(el);
      if (used + h > limit && el.tagName === "TABLE") {
        // Rows that fit go on this page; the rest continue on the next, under a copy of the header row.
        const table = el as HTMLTableElement;
        const head = table.tHead ?? (table.rows[0]?.querySelector("th") ? table.rows[0] : null);
        const rows = Array.from(table.rows).filter((r) => r !== head && !(table.tHead && table.tHead.contains(r)));
        const headH = head ? head.getBoundingClientRect().height : 0;
        let chunk: HTMLTableRowElement[] = [];
        let chunkH = headH;
        const emit = () => {
          if (!chunk.length) return;
          const t = table.cloneNode(false) as HTMLTableElement;
          if (head) t.appendChild(head.cloneNode(true));
          const tb = document.createElement("tbody");
          for (const r of chunk) tb.appendChild(r.cloneNode(true));
          t.appendChild(tb);
          pages.at(-1)!.push(t.outerHTML);
          used += chunkH + 14;
          chunk = [];
          chunkH = headH;
        };
        for (const r of rows) {
          const rh = r.getBoundingClientRect().height;
          if (used + chunkH + rh > limit && (chunk.length || pages.at(-1)!.length)) {
            emit();
            next();
          }
          chunk.push(r);
          chunkH += rh;
        }
        emit();
      } else {
        if (used + h > limit && pages.at(-1)!.length) next();
        pages.at(-1)!.push(el.outerHTML);
        used += h;
      }
      if (cs.breakAfter === "page" || cs.pageBreakAfter === "always") next();
    }
    while (pages.length > 1 && !pages.at(-1)!.length) pages.pop();
    return pages.map((p) => p.join(""));
  } finally {
    host.remove();
  }
}

const roman = (n: number) => {
  const m: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let s = "";
  for (const [v, r] of m) while (n >= v) ((s += r), (n -= v));
  return s;
};

export type Sheet = { html: string; kind: "cover" | "front" | "main"; label: string };
export type SheetInput = {
  blocks: Block[];
  layout: DocLayout;
  hf: HeaderFooter | null;
  fields: Fields;
  logoUrl: string;
  w: number;
  h: number;
  mg: { top: number; right: number; bottom: number; left: number };
  pageNumbers: boolean;
  watermark: string;
  // The company letterhead block shown at the top of the first page (the company's header).
  letterheadTop: string;
};

// The pages as HTML: each one a sheet of the paper's size with its background, header, body, footer and number.
export function buildSheets(o: SheetInput): Sheet[] {
  const parts = splitParts(o.blocks, o.layout);
  const bodyW = o.w - o.mg.left - o.mg.right;
  const bodyH = o.h - o.mg.top - o.mg.bottom;
  const front = parts.front.length ? paginate(blocksHtml(parts.front, o.blocks), bodyW, bodyH) : [];
  const main = paginate(o.letterheadTop + blocksHtml(parts.main, o.blocks), bodyW, bodyH);
  const values = hfValues(o.fields);
  const fontCss = [o.hf?.design?.header, o.hf?.design?.footer].filter(Boolean).map((d) => webFontsCss(d!)).join("");
  const frontStyle = !o.pageNumbers || o.layout.numbering.front === "none" ? null : o.layout.numbering.front;
  const designed = (where: "header" | "footer") => o.hf?.design?.[where];
  const bandH = (where: "header" | "footer") => designed(where)?.h ?? o.hf?.art?.[where]?.heightMm ?? 0;
  const zonesLine = (z: HFZones, hf: HeaderFooter, page: string, pages: string) =>
    `<div style="display:flex;gap:4mm;font-size:${hf.size}pt;color:${hf.color};white-space:pre-line">${(["left", "center", "right"] as const).map((k) => `<div style="flex:1;text-align:${k}">${esc(fillText(z[k], o.fields, page, pages))}</div>`).join("")}</div>`;
  const band = (where: "header" | "footer", hf: HeaderFooter, page: string, pages: string) => {
    const d = designed(where);
    if (d?.pages[0]) return `<div class="pv-band" style="${where === "header" ? "top:0" : "bottom:0"}">${pageHtml(d, d.pages[0], values, { logo: o.logoUrl })}</div>`;
    const z = where === "header" ? hf.header : hf.footer;
    const art = hf.art?.[where];
    if (art) return `<div class="pv-band" style="${where === "header" ? "top:0" : "bottom:0"}">${bandHtml(art, z, o.fields, o.logoUrl, where, page, pages)}</div>`;
    if (!z.left && !z.center && !z.right) return "";
    const rule = where === "header" ? (hf.ruleUnderHeader ? `border-bottom:0.6pt solid ${hf.color};padding-bottom:1.5mm` : "") : hf.ruleOverFooter ? `border-top:0.6pt solid ${hf.color};padding-top:1.5mm` : "";
    return `<div class="pv-band" style="${where === "header" ? `top:${Math.max(5, o.mg.top / 2 - 4)}mm` : `bottom:${Math.max(5, o.mg.bottom / 2 - 4)}mm`};left:${o.mg.left}mm;right:${o.mg.right}mm;${rule}">${zonesLine(z, hf, page, pages)}</div>`;
  };
  const sheet = (i: number, inner: string, chrome: HeaderFooter | null, page: string, pages: string, numberOverlay: boolean) => {
    const bg = o.layout.pageBg?.pages?.[String(i + 1)] ?? o.layout.pageBg?.all ?? null;
    const wm = o.watermark ? `<div style="position:absolute;top:40%;left:0;right:0;text-align:center;font-size:72pt;font-weight:800;color:rgba(100,116,139,.12);transform:rotate(-30deg);pointer-events:none">${esc(o.watermark)}</div>` : "";
    const overlay = numberOverlay && page ? `<div style="position:absolute;right:${o.mg.right}mm;bottom:${Math.max(3, (bandH("footer") || o.mg.bottom) / 2 - 2.5)}mm;font-size:9pt;color:${bandH("footer") ? "#ffffff" : "#64748b"}">Page ${esc(page)} of ${esc(pages)}</div>` : "";
    return `<section class="pv-sheet" data-page="${i + 1}" style="width:${o.w}mm;height:${o.h}mm;${pageBgCss(bg)}">${chrome ? band("header", chrome, page, pages) : ""}<div class="pv-body" style="top:${o.mg.top}mm;left:${o.mg.left}mm;width:${bodyW}mm;height:${bodyH}mm">${inner}</div>${chrome ? band("footer", chrome, page, pages) : ""}${overlay}${wm}</section>`;
  };
  const out: Sheet[] = [];
  if (o.layout.cover) out.push({ html: sheet(0, coverHtml(o.layout.cover, o.logoUrl), null, "", "", false), kind: "cover", label: "Cover" });
  const numbered = (hf: HeaderFooter | null, show: boolean) => (show ? withNumber(hf, o.layout.numbering, true) : hf);
  const needsOverlay = (hf: HeaderFooter | null, show: boolean) => show && !!hf && !!(hf.design?.footer) && !hasPageField(hf);
  front.forEach((html, n) => {
    const num = frontStyle === "roman" ? roman(n + 1) : frontStyle === "arabic" ? String(n + 1) : "";
    const chrome = numbered(o.hf, !!frontStyle && !o.hf?.design?.footer);
    out.push({ html: sheet(out.length, html, chrome, num, frontStyle === "roman" ? roman(front.length) : String(front.length), needsOverlay(o.hf, !!frontStyle)), kind: "front", label: num ? `Page ${num}` : "Front matter" });
  });
  main.forEach((html, n) => {
    const num = o.pageNumbers ? String(n + 1) : "";
    const chrome = numbered(o.hf, o.pageNumbers && !o.hf?.design?.footer);
    out.push({ html: sheet(out.length, html, chrome, num, String(main.length), needsOverlay(o.hf, o.pageNumbers)), kind: "main", label: num ? `Page ${num}` : `Page ${n + 1}` });
  });
  if (fontCss && out[0]) out[0] = { ...out[0], html: `<style>${fontCss}</style>${out[0].html}` };
  return out;
}

// One page's background: colours, a picture (fitted, filled or stretched), for this page or all of them.
function BackgroundMenu({ index, layout, setLayout }: { index: number; layout: DocLayout; setLayout: (l: DocLayout) => void }) {
  const key = String(index + 1);
  const cur = layout.pageBg?.pages?.[key] ?? layout.pageBg?.all ?? null;
  const fileRef = React.useRef<HTMLInputElement>(null);
  const set = (bg: PageBg | null, all = false) => {
    const pb = { all: layout.pageBg?.all ?? null, pages: { ...(layout.pageBg?.pages ?? {}) } };
    if (all) ((pb.all = bg), (pb.pages = {}));
    else if (bg) pb.pages[key] = bg;
    else delete pb.pages[key];
    setLayout({ ...layout, pageBg: pb });
  };
  const SW = ["#ffffff", "#f8fafc", "#f0fdf4", "#ecfdf5", "#eff6ff", "#fefce8", "#fff7ed", "#fdf2f8", "#f1f5f9", "#e2e8f0"];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 bg-background text-xs" data-page-bg={key}>
          <PaintBucketIcon /> Page background
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3 text-xs" align="end">
        <p className="font-medium">Background of page {key}</p>
        <div className="flex flex-wrap gap-1.5">
          {SW.map((c) => (
            <button key={c} type="button" aria-label={`Colour ${c}`} className={cn("size-6 rounded border", cur?.color === c && "ring-2 ring-primary")} style={{ background: c }} onClick={() => set({ ...(cur ?? {}), color: c })} data-bg-swatch={c} />
          ))}
          <input type="color" aria-label="Another colour" className="h-6 w-8 cursor-pointer rounded border p-0" value={cur?.color && HEX.test(cur.color) ? cur.color : "#ffffff"} onChange={(e) => set({ ...(cur ?? {}), color: e.target.value })} />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 2_000_000) return alert("Use a picture under 2 MB.");
            const fr = new FileReader();
            fr.onload = () => set({ ...(cur ?? {}), image: String(fr.result), fit: cur?.fit ?? "cover" });
            fr.readAsDataURL(f);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
            <ImageIcon /> {cur?.image ? "Change picture" : "Picture"}
          </Button>
          {cur?.image && (
            <>
              <select className="h-7 rounded-md border bg-background px-1" value={cur.fit ?? "cover"} onChange={(e) => set({ ...cur, fit: e.target.value as PageBg["fit"] })} aria-label="How the picture fits">
                <option value="cover">Fill the page</option>
                <option value="contain">Fit inside</option>
                <option value="stretch">Stretch</option>
              </select>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set({ ...cur, image: null })}>Remove picture</Button>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => set(cur, true)} disabled={!cur}>Use on every page</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set(null)} disabled={!layout.pageBg?.pages?.[key]}>
            <Trash2Icon /> Reset this page
          </Button>
          {layout.pageBg?.all && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setLayout({ ...layout, pageBg: { all: null, pages: layout.pageBg?.pages ?? {} } })}>Clear for all</Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PageView({ input, setLayout, onEditBand }: { input: SheetInput; setLayout: (l: DocLayout) => void; onEditBand: () => void }) {
  const [sheets, setSheets] = React.useState<Sheet[]>([]);
  const key = JSON.stringify([input.blocks, input.layout, input.hf?.header, input.hf?.footer, input.w, input.h, input.mg, input.pageNumbers, input.watermark, input.fields, !!input.hf?.design]);
  React.useLayoutEffect(() => {
    let live = true;
    setSheets(buildSheets(input));
    // Fonts arriving late change the heights: lay the pages out again once they are ready.
    void document.fonts?.ready?.then(() => live && setSheets(buildSheets(input)));
    return () => void (live = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div className="pv space-y-6" data-page-view>
      <style>{PV_CSS}</style>
      {sheets.map((s, i) => (
        <div key={i} className="group relative mx-auto w-fit">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{s.label}</span>
            <span className="flex gap-1">
              {s.kind !== "cover" && (
                <Button size="sm" variant="outline" className="h-7 bg-background text-xs" onClick={onEditBand}>
                  Header and footer
                </Button>
              )}
              <BackgroundMenu index={i} layout={input.layout} setLayout={setLayout} />
            </span>
          </div>
          <div className="shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)]" dangerouslySetInnerHTML={{ __html: s.html }} />
        </div>
      ))}
    </div>
  );
}
