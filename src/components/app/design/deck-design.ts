// A layout deck (Deck Maker) turned into free-design slides, in the deck's template colours and fonts: the cover and
// every slide become editable pages (titles, points, columns, tables, numbers, timelines, quotes, pictures).

import type { Slide } from "@/lib/deck";
import type { DeckTemplate } from "@/lib/deck-templates";
import { did, shapeEl, textEl, type DElement, type Design, type DPage } from "@/lib/design";

const W = 254;
const H = 142.875;
const font = (f: string) => f.split(",")[0]!.replace(/["']/g, "").trim().slice(0, 40) || "Inter";

export function deckToDesign(deck: { title: string; subtitle: string; slides: Slide[] }, t: DeckTemplate): Design {
  const c = t.colors;
  const hf = font(t.fonts.heading);
  const bf = font(t.fonts.body);
  const logo = (x: number, y: number, s = 14): DElement => ({ id: did(), kind: "image", src: t.logo ?? "logo", fit: "contain", x, y, w: s, h: s, rotate: 0, opacity: 1 }) as DElement;
  const bar = shapeEl("rect", 0, 0, W, 3, { fill: c.primary });
  const foot = (n: number) => [textEl(t.footer || deck.title, 14, H - 9, 180, 5, { size: 8, color: c.muted, font: bf }), ...(t.slideNumbers ? [textEl(String(n), W - 24, H - 9, 10, 5, { size: 8, color: c.muted, align: "right", font: bf })] : [])];
  const title = (s: string) => textEl(s, 14, 10, W - 28, 14, { size: 26, weight: 700, color: c.text, font: hf });
  const pages: DPage[] = [
    {
      id: did(),
      bg: c.primary,
      bgGradient: t.cover.style === "gradient" ? `linear-gradient(135deg, ${c.primary}, ${c.secondary})` : null,
      elements: [textEl(deck.title, 18, 46, W - 36, 22, { size: 40, weight: 800, color: "#ffffff", font: hf }), textEl(deck.subtitle, 18, 72, W - 36, 10, { size: 16, color: "#e2e8f0", font: bf }), logo(W - 34, H - 30, 18)],
    },
  ];
  deck.slides.forEach((s, i) => {
    const b = s.body;
    const els: DElement[] = [];
    const accent = b.kind === "section" || b.kind === "closing";
    if (!accent) els.push(bar, title(s.title));
    switch (b.kind) {
      case "section":
        els.push(textEl(s.title, 18, 52, W - 36, 18, { size: 34, weight: 800, color: "#ffffff", font: hf }), textEl(b.subtitle ?? "", 18, 74, W - 36, 10, { size: 16, color: "#e2e8f0", font: bf }));
        break;
      case "closing":
        els.push(textEl(b.text, 18, 50, W - 36, 20, { size: 36, weight: 800, color: "#ffffff", align: "center", font: hf }), textEl(b.contact ?? "", 18, 76, W - 36, 10, { size: 14, color: "#e2e8f0", align: "center", font: bf }), logo(W / 2 - 9, 98, 18));
        break;
      case "bullets":
        els.push(textEl(b.items.join("\n"), 16, 32, W - 32, 90, { size: 18, list: "bullet", lineHeight: 1.55, color: c.text, font: bf }));
        break;
      case "text":
        els.push(textEl(b.text, 16, 32, W - 32, 90, { size: 16, lineHeight: 1.5, color: c.text, font: bf }));
        break;
      case "quote":
        els.push(textEl(`“${b.text}”`, 26, 38, W - 52, 50, { size: 24, italic: true, color: c.text, align: "center", font: hf, valign: "middle" }), textEl(b.by ? `— ${b.by}` : "", 26, 92, W - 52, 8, { size: 13, color: c.muted, align: "center", font: bf }));
        break;
      case "columns":
        (["left", "right"] as const).forEach((side, j) => {
          const x = 16 + j * ((W - 40) / 2 + 8);
          els.push(shapeEl("rect", x, 32, (W - 40) / 2, 90, { fill: c.surface, radius: 3 }), textEl(b[side].title, x + 5, 36, (W - 40) / 2 - 10, 9, { size: 16, weight: 700, color: c.primary, font: hf }), textEl(b[side].text, x + 5, 48, (W - 40) / 2 - 10, 70, { size: 13, lineHeight: 1.45, color: c.text, font: bf }));
        });
        break;
      case "table":
        els.push({ id: did(), kind: "table", rows: [b.columns, ...b.rows], header: true, font: bf, size: 12, color: c.text, headFill: c.primary, headColor: "#ffffff", border: "#cbd5e1", stripe: c.surface, x: 16, y: 34, w: W - 32, h: Math.min(88, 9 * (b.rows.length + 1)), rotate: 0, opacity: 1 } as DElement);
        break;
      case "numbers":
        b.items.slice(0, 4).forEach((it, j, all) => {
          const w = (W - 32 - (all.length - 1) * 6) / all.length;
          const x = 16 + j * (w + 6);
          els.push(shapeEl("rect", x, 40, w, 60, { fill: c.surface, radius: 4 }), textEl(`${it.value.toLocaleString()}${it.unit ?? ""}`, x, 50, w, 22, { size: 36, weight: 800, color: c.chart[j % c.chart.length] ?? c.primary, align: "center", font: hf }), textEl(it.label, x + 3, 78, w - 6, 14, { size: 13, color: c.muted, align: "center", font: bf }));
        });
        break;
      case "timeline":
        els.push({ id: did(), kind: "line", stroke: c.primary, strokeWidth: 0.8, x: 20, y: 70, w: W - 40, h: 0.01, rotate: 0, opacity: 1 } as DElement);
        b.items.slice(0, 8).forEach((it, j, all) => {
          const x = 20 + ((W - 40) * j) / Math.max(1, all.length - 1);
          els.push(shapeEl("ellipse", x - 3, 67, 6, 6, { fill: it.done ? c.primary : "#ffffff", stroke: c.primary, strokeWidth: 0.6 }), textEl(it.date, x - 20, 56, 40, 7, { size: 11, weight: 700, color: c.primary, align: "center", font: bf }), textEl(it.label, x - 22, 77, 44, 20, { size: 11, color: c.text, align: "center", font: bf }));
        });
        break;
      case "image":
        if (b.src) els.push({ id: did(), kind: "image", src: b.src, fit: "contain", x: 30, y: 30, w: W - 60, h: 88, rotate: 0, opacity: 1 } as DElement);
        if (b.caption) els.push(textEl(b.caption, 30, 120, W - 60, 7, { size: 11, color: c.muted, align: "center", font: bf }));
        break;
      default:
        break;
    }
    if (!accent) els.push(...foot(i + 2));
    pages.push({ id: did(), bg: accent ? c.primary : c.background, bgImage: !accent ? (t.background ?? null) : null, elements: els, notes: [s.note, s.say].filter(Boolean).join("\n") || undefined });
  });
  return { v: 1, w: W, h: H, unit: "mm", pages };
}
