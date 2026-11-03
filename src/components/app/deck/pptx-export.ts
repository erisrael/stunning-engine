// The PowerPoint export (Phase 24): the deck in its template's colours, fonts and logo. A coloured cover, a section
// slide at each new group, a master with the brand bars, logo, footer and slide numbers, colourful tiles and
// editable charts, tables with a coloured header, every hand-written slide kind, and a closing slide. The file opens
// in PowerPoint, Google Slides, Keynote and LibreOffice.

import type { Slide } from "@/lib/deck";
import { onColor, type DeckTemplate } from "@/lib/deck-templates";

const c = (h: string) => h.replace("#", "").toUpperCase();
const b64 = (data: string) => data.replace(/^data:/, "");

// Pictures as PNG (an SVG logo is drawn on a canvas first, for apps that do not read SVG).
async function asPng(src: string): Promise<string | null> {
  try {
    if (/^data:image\/(png|jpe?g|gif)/.test(src)) return src;
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok();
      img.onerror = () => bad(new Error("image"));
      img.src = src;
    });
    const w = img.naturalWidth || 256;
    const h = img.naturalHeight || 256;
    const k = 512 / Math.max(w, h);
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * k);
    cv.height = Math.round(h * k);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function exportPowerPoint(opts: { title: string; subtitle?: string; slides: Slide[]; template: DeckTemplate; workspace: string; fileName?: string }) {
  const { slides, template: t } = opts;
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pres.title = opts.title;
  pres.company = opts.workspace;
  const W = 13.33;
  const H = 7.5;
  const col = t.colors;
  const chart = col.chart.map(c);
  const logo = await asPng(t.logo ?? "/brand/myseed-logo.svg");
  const bg = t.background ? b64(t.background) : null;
  const head = { fontFace: t.fonts.heading, color: c(col.text) };
  const body = { fontFace: t.fonts.body, color: c(col.text) };

  // The master: the background, a thin brand bar on top, a coloured footer line, the logo, footer text and number.
  pres.defineSlideMaster({
    title: "BRAND",
    background: bg ? { data: bg } : { color: c(col.background) },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.12, fill: { color: c(col.primary) } } },
      { rect: { x: 0, y: 0.12, w: W * 0.35, h: 0.05, fill: { color: c(col.secondary) } } },
      { rect: { x: W * 0.35, y: 0.12, w: W * 0.15, h: 0.05, fill: { color: c(col.accent) } } },
      { rect: { x: 0, y: H - 0.42, w: W, h: 0.02, fill: { color: c(col.surface) } } },
      ...(logo ? [{ image: { x: W - 0.95, y: H - 0.38, w: 0.3, h: 0.3, data: b64(logo) } }] : []),
      { text: { text: [t.footer || opts.workspace, opts.title].filter(Boolean).join("  ·  "), options: { x: 0.5, y: H - 0.4, w: 9, h: 0.34, fontSize: 10, fontFace: t.fonts.body, color: c(col.muted) } } },
    ],
    slideNumber: t.slideNumbers ? { x: W - 1.6, y: H - 0.38, w: 0.5, h: 0.3, fontSize: 10, color: c(col.muted), fontFace: t.fonts.body } : undefined,
  });

  // The cover.
  const cover = pres.addSlide();
  const coverBg = t.cover.style === "image" && t.cover.image ? b64(t.cover.image) : null;
  if (coverBg) cover.background = { data: coverBg };
  else cover.background = { color: c(t.cover.style === "split" ? col.background : col.primary) };
  if (t.cover.style === "gradient") {
    // A gradient made of soft circles in the brand colours.
    cover.addShape(pres.ShapeType.ellipse, { x: W - 5.5, y: -2.5, w: 8, h: 8, fill: { color: c(col.secondary), transparency: 45 }, line: { color: c(col.secondary), transparency: 100 } });
    cover.addShape(pres.ShapeType.ellipse, { x: W - 3.2, y: 3.6, w: 5, h: 5, fill: { color: c(col.accent), transparency: 35 }, line: { color: c(col.accent), transparency: 100 } });
    cover.addShape(pres.ShapeType.ellipse, { x: -1.5, y: 5.2, w: 4, h: 4, fill: { color: c(col.chart[3] ?? col.secondary), transparency: 60 }, line: { color: c(col.primary), transparency: 100 } });
  } else if (t.cover.style === "split") {
    cover.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W * 0.42, h: H, fill: { color: c(col.primary) } });
    cover.addShape(pres.ShapeType.rect, { x: W * 0.42, y: 0, w: 0.12, h: H, fill: { color: c(col.accent) } });
  } else if (t.cover.style === "solid") {
    cover.addShape(pres.ShapeType.rect, { x: 0, y: H - 0.5, w: W, h: 0.5, fill: { color: c(col.secondary) } });
  }
  const coverText = t.cover.style === "split" ? onColor(col.primary) : coverBg ? col.text : onColor(col.primary);
  if (logo) cover.addImage({ data: b64(logo), x: 0.7, y: 0.7, w: 1.1, h: 1.1 });
  cover.addText(opts.title, { x: 0.7, y: 2.3, w: t.cover.style === "split" ? W * 0.42 - 1 : 9.5, h: 1.8, fontSize: 40, bold: true, fontFace: t.fonts.heading, color: c(coverText), valign: "top" });
  cover.addText(opts.subtitle ?? `${opts.workspace} · ${new Date().toLocaleDateString(undefined, { dateStyle: "long" })}`, { x: 0.7, y: 4.2, w: 9, h: 0.6, fontSize: 18, fontFace: t.fonts.body, color: c(coverText) });
  cover.addShape(pres.ShapeType.rect, { x: 0.7, y: 4.95, w: 1.6, h: 0.08, fill: { color: c(t.cover.style === "split" ? col.accent : onColor(col.primary) === "#FFFFFF" ? col.accent : col.secondary) } });

  // An agenda from the groups.
  const groups = [...new Set(slides.map((s) => s.group))];
  if (groups.length > 1) {
    const a = pres.addSlide({ masterName: "BRAND" });
    a.addText("Agenda", { x: 0.6, y: 0.45, w: 12, h: 0.8, fontSize: 30, bold: true, ...head, color: c(col.primary) });
    groups.slice(0, 10).forEach((g, i) => {
      const x = 0.7 + (i % 2) * 6.1;
      const y = 1.5 + Math.floor(i / 2) * 1.0;
      a.addShape(pres.ShapeType.roundRect, { x, y, w: 0.7, h: 0.7, fill: { color: chart[i % chart.length] }, rectRadius: 0.12, line: { color: chart[i % chart.length] } });
      a.addText(String(i + 1), { x, y, w: 0.7, h: 0.7, align: "center", valign: "middle", fontSize: 20, bold: true, fontFace: t.fonts.heading, color: c(onColor(col.chart[i % col.chart.length]!)) });
      a.addText(g, { x: x + 0.9, y, w: 5, h: 0.7, valign: "middle", fontSize: 18, ...body });
    });
  }

  let lastGroup = "";
  let gi = -1;
  for (const s of slides) {
    if (s.group !== lastGroup && groups.length > 1 && s.body.kind !== "section") {
      // A section slide at each new group, in the next chart colour.
      gi++;
      lastGroup = s.group;
      const sec = pres.addSlide();
      const tone = col.chart[gi % col.chart.length]!;
      sec.background = { color: c(tone) };
      sec.addShape(pres.ShapeType.ellipse, { x: W - 4, y: -1.5, w: 6, h: 6, fill: { color: "FFFFFF", transparency: 85 }, line: { color: "FFFFFF", transparency: 100 } });
      sec.addText(String(gi + 1).padStart(2, "0"), { x: 0.8, y: 2.0, w: 3, h: 1, fontSize: 48, bold: true, fontFace: t.fonts.heading, color: c(onColor(tone)) });
      sec.addText(s.group, { x: 0.8, y: 3.0, w: 11, h: 1.2, fontSize: 40, bold: true, fontFace: t.fonts.heading, color: c(onColor(tone)) });
      if (logo) sec.addImage({ data: b64(logo), x: W - 1.3, y: H - 1.1, w: 0.6, h: 0.6 });
    }
    const b = s.body;
    if (b.kind === "section") {
      const sec = pres.addSlide();
      sec.background = { color: c(col.primary) };
      sec.addShape(pres.ShapeType.rect, { x: 0.8, y: 4.3, w: 1.6, h: 0.1, fill: { color: c(col.accent) } });
      sec.addText(s.title, { x: 0.8, y: 2.4, w: 11.5, h: 1.6, fontSize: 44, bold: true, fontFace: t.fonts.heading, color: c(onColor(col.primary)) });
      if (b.subtitle) sec.addText(b.subtitle, { x: 0.8, y: 4.6, w: 11.5, h: 0.8, fontSize: 20, fontFace: t.fonts.body, color: c(onColor(col.primary)) });
      continue;
    }
    if (b.kind === "closing") {
      const cl = pres.addSlide();
      cl.background = { color: c(col.primary) };
      cl.addShape(pres.ShapeType.ellipse, { x: -2, y: -2, w: 7, h: 7, fill: { color: c(col.secondary), transparency: 50 }, line: { color: c(col.secondary), transparency: 100 } });
      if (logo) cl.addImage({ data: b64(logo), x: W / 2 - 0.6, y: 1.4, w: 1.2, h: 1.2 });
      cl.addText(b.text || "Thank you", { x: 0.5, y: 2.9, w: W - 1, h: 1.4, align: "center", fontSize: 48, bold: true, fontFace: t.fonts.heading, color: c(onColor(col.primary)) });
      if (b.contact) cl.addText(b.contact, { x: 0.5, y: 4.4, w: W - 1, h: 0.7, align: "center", fontSize: 18, fontFace: t.fonts.body, color: c(onColor(col.primary)) });
      continue;
    }
    const p = pres.addSlide({ masterName: "BRAND" });
    // The title, with a coloured marker for its group.
    const tone = c(col.chart[Math.max(0, gi) % col.chart.length]!);
    p.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.5, w: 0.1, h: 0.7, fill: { color: tone } });
    p.addText(s.title, { x: 0.75, y: 0.42, w: 10.5, h: 0.85, fontSize: 28, bold: true, ...head });
    p.addText(s.group, { x: 9.8, y: 0.5, w: 3, h: 0.4, align: "right", fontSize: 11, fontFace: t.fonts.body, color: tone });
    const explain = [s.say, s.why, s.next].filter(Boolean).join("\n");
    const box = { x: 0.6, y: 1.45, w: 12.1, h: explain ? 4.15 : 5.4 };
    if (b.kind === "bars" || b.kind === "lines")
      p.addChart(b.kind === "bars" ? pres.ChartType.bar : pres.ChartType.line, b.series.map((se) => ({ name: se.label, labels: b.data.map((d) => String(d[b.x] ?? "")), values: b.data.map((d) => Number(d[se.key] ?? 0)) })), { ...box, chartColors: chart, showLegend: b.series.length > 1, legendPos: "b", legendFontFace: t.fonts.body, catAxisLabelFontFace: t.fonts.body, valAxisLabelFontFace: t.fonts.body, barGrouping: b.kind === "bars" && b.stacked ? "stacked" : "clustered", lineSize: 3, lineDataSymbolSize: 7, valGridLine: { color: "E5E7EB", size: 0.5 }, catGridLine: { style: "none" } });
    else if (b.kind === "stages")
      b.items.forEach((g, i) => {
        const n = b.items.length;
        const w = Math.min(3, 12.1 / n - 0.2);
        const x = 0.6 + i * (w + 0.2);
        const color = c(g.color ?? col.chart[i % col.chart.length]!);
        p.addShape(pres.ShapeType.roundRect, { x, y: 1.7, w, h: 2.6, fill: { color }, rectRadius: 0.15, line: { color } });
        p.addText([{ text: `${g.value}\n`, options: { fontSize: 48, bold: true } }, { text: g.label, options: { fontSize: 15 } }, ...(g.late ? [{ text: `\n${g.late} late`, options: { fontSize: 12 } }] : [])], { x, y: 1.7, w, h: 2.6, align: "center", valign: "middle", fontFace: t.fonts.heading, color: c(onColor(g.color ?? col.chart[i % col.chart.length]!)) });
      });
    else if (b.kind === "progress")
      b.items.slice(0, 8).forEach((it, i) => {
        const y = 1.6 + i * 0.5;
        const color = c(it.tone === "bad" ? "#D93025" : it.tone === "neutral" ? col.accent : col.chart[i % col.chart.length]!);
        p.addText(it.label, { x: 0.6, y, w: 4, h: 0.4, fontSize: 14, ...body });
        p.addShape(pres.ShapeType.roundRect, { x: 4.7, y: y + 0.1, w: 7, h: 0.22, fill: { color: c(col.surface) }, rectRadius: 0.1, line: { color: c(col.surface) } });
        p.addShape(pres.ShapeType.roundRect, { x: 4.7, y: y + 0.1, w: Math.max(0.05, (7 * Math.min(100, it.value)) / 100), h: 0.22, fill: { color }, rectRadius: 0.1, line: { color } });
        p.addText(`${it.value}%`, { x: 11.8, y, w: 0.9, h: 0.4, fontSize: 14, bold: true, align: "right", ...body });
      });
    else if (b.kind === "numbers")
      b.items.slice(0, 6).forEach((x, i) => {
        const per = Math.min(3, b.items.length);
        const w = (12.1 - (per - 1) * 0.3) / per;
        const cx = 0.6 + (i % per) * (w + 0.3);
        const cy = 1.6 + Math.floor(i / per) * 2.1;
        const tone2 = x.tone === "bad" && x.value > 0 ? "#D93025" : x.tone === "good" ? "#1E8E3E" : col.chart[i % col.chart.length]!;
        p.addShape(pres.ShapeType.roundRect, { x: cx, y: cy, w, h: 1.9, fill: { color: c(tone2) }, rectRadius: 0.15, line: { color: c(tone2) } });
        p.addText([{ text: `${x.value.toLocaleString()}${x.unit ?? ""}\n`, options: { fontSize: 40, bold: true, fontFace: t.fonts.heading } }, { text: x.label, options: { fontSize: 15, fontFace: t.fonts.body } }], { x: cx, y: cy, w, h: 1.9, align: "center", valign: "middle", color: c(onColor(tone2)) });
      });
    else if (b.kind === "table")
      p.addTable(
        [b.columns.map((h) => ({ text: h, options: { bold: true, color: c(onColor(col.primary)), fill: { color: c(col.primary) } } })), ...b.rows.slice(0, 14).map((r, ri) => r.map((v) => ({ text: String(v), options: { fill: { color: ri % 2 ? c(col.surface) : c(col.background) } } })))],
        { ...box, fontSize: 13, fontFace: t.fonts.body, color: c(col.text), border: { type: "solid", pt: 0.5, color: "E5E7EB" }, autoPage: false },
      );
    else if (b.kind === "list")
      p.addText(b.items.length ? b.items.slice(0, 12).map((i) => ({ text: `${i.text}${i.meta ? `  ·  ${i.meta}` : ""}`, options: { bullet: { code: "25CF" }, color: c(col.text), breakLine: true } })) : (b.empty ?? ""), { ...box, fontSize: 18, fontFace: t.fonts.body, valign: "top", paraSpaceAfter: 6 });
    else if (b.kind === "bullets")
      p.addText(b.items.map((i) => ({ text: i, options: { bullet: { code: "25CF" }, breakLine: true } })), { ...box, fontSize: 22, ...body, valign: "top", paraSpaceAfter: 10 });
    else if (b.kind === "quote") {
      p.addShape(pres.ShapeType.rect, { x: 0.9, y: 1.8, w: 0.12, h: 2.6, fill: { color: c(col.accent) } });
      p.addText([{ text: `“${b.text}”`, options: { fontSize: 30, italic: true } }, ...(b.by ? [{ text: `\n— ${b.by}`, options: { fontSize: 18, color: c(col.muted) } }] : [])], { x: 1.3, y: 1.7, w: 11, h: 3.2, valign: "middle", ...head });
    } else if (b.kind === "image") {
      p.addImage({ data: b64(b.src), x: 1.5, y: 1.45, w: 10.3, h: explain ? 3.9 : 5, sizing: { type: "contain", w: 10.3, h: explain ? 3.9 : 5 } });
      if (b.caption) p.addText(b.caption, { x: 0.6, y: explain ? 5.35 : 6.5, w: 12.1, h: 0.4, align: "center", fontSize: 13, fontFace: t.fonts.body, color: c(col.muted) });
    } else if (b.kind === "columns")
      [b.left, b.right].forEach((side, i) => {
        const x = 0.6 + i * 6.2;
        const color = c(col.chart[i % col.chart.length]!);
        p.addShape(pres.ShapeType.rect, { x, y: 1.6, w: 5.9, h: 0.08, fill: { color } });
        p.addText(side.title, { x, y: 1.75, w: 5.9, h: 0.6, fontSize: 22, bold: true, fontFace: t.fonts.heading, color });
        p.addText(side.text, { x, y: 2.4, w: 5.9, h: 2.9, fontSize: 16, ...body, valign: "top" });
      });
    else if (b.kind === "timeline") {
      const n = Math.max(1, b.items.length);
      p.addShape(pres.ShapeType.rect, { x: 0.8, y: 3.05, w: 11.7, h: 0.06, fill: { color: c(col.muted) } });
      b.items.forEach((it, i) => {
        const x = 0.8 + (11.7 / n) * i + 11.7 / n / 2 - 0.25;
        const color = c(it.done ? "#1E8E3E" : col.chart[i % col.chart.length]!);
        p.addShape(pres.ShapeType.ellipse, { x, y: 2.83, w: 0.5, h: 0.5, fill: { color }, line: { color: "FFFFFF", width: 2 } });
        p.addText(it.date, { x: x - 0.9, y: 2.1, w: 2.3, h: 0.5, align: "center", fontSize: 13, bold: true, fontFace: t.fonts.body, color });
        p.addText(it.label, { x: x - 0.9, y: 3.5, w: 2.3, h: 1.2, align: "center", valign: "top", fontSize: 13, ...body });
      });
    } else if (b.kind === "text") p.addText(b.text, { ...box, fontSize: 22, ...body, valign: "top" });
    if (explain) {
      p.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 5.75, w: 12.1, h: 1.2, fill: { color: c(col.surface) }, rectRadius: 0.1, line: { color: c(col.surface) } });
      p.addShape(pres.ShapeType.rect, { x: 0.6, y: 5.75, w: 0.1, h: 1.2, fill: { color: tone } });
      p.addText(
        [
          { text: s.say, options: { fontSize: 15, bold: true, breakLine: true } },
          ...(s.why ? [{ text: s.why, options: { fontSize: 13, color: c(col.muted), breakLine: true } }] : []),
          ...(s.next ? [{ text: `Next: ${s.next}`, options: { fontSize: 13, color: tone } }] : []),
        ],
        { x: 0.85, y: 5.8, w: 11.7, h: 1.1, valign: "middle", fontFace: t.fonts.body, color: c(col.text) },
      );
    }
    if (s.note) p.addNotes(s.note);
  }

  // The closing slide, unless the deck has its own.
  if (!slides.some((s) => s.body.kind === "closing")) {
    const cl = pres.addSlide();
    cl.background = { color: c(col.primary) };
    cl.addShape(pres.ShapeType.ellipse, { x: W - 5, y: 3, w: 7, h: 7, fill: { color: c(col.accent), transparency: 50 }, line: { color: c(col.accent), transparency: 100 } });
    if (logo) cl.addImage({ data: b64(logo), x: W / 2 - 0.6, y: 1.5, w: 1.2, h: 1.2 });
    cl.addText("Thank you", { x: 0.5, y: 3, w: W - 1, h: 1.3, align: "center", fontSize: 46, bold: true, fontFace: t.fonts.heading, color: c(onColor(col.primary)) });
    cl.addText(opts.workspace, { x: 0.5, y: 4.3, w: W - 1, h: 0.6, align: "center", fontSize: 18, fontFace: t.fonts.body, color: c(onColor(col.primary)) });
  }
  const name = (opts.fileName ?? opts.title).replace(/[^\w -]/g, "").trim() || "Presentation";
  await pres.writeFile({ fileName: `${name}.pptx` });
}
