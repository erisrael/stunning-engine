// Slide layouts (as PowerPoint's New Slide gallery) and colour themes (as its Design tab), for the design editor on
// slide-shaped pages. Layouts are placed in proportion to the page, so they fit 16:9 and 4:3 alike.

import { did, shapeEl, textEl, type DElement, type Design, type DPage } from "./design";

export type SlideTheme = { key: string; label: string; bg: string; title: string; text: string; accent: string; soft: string; font: string };

export const SLIDE_THEMES: SlideTheme[] = [
  { key: "office", label: "Office", bg: "#ffffff", title: "#0f172a", text: "#334155", accent: "#16a34a", soft: "#f1f5f9", font: "Inter" },
  { key: "midnight", label: "Midnight", bg: "#0f172a", title: "#ffffff", text: "#cbd5e1", accent: "#22c55e", soft: "#1e293b", font: "Inter" },
  { key: "ocean", label: "Ocean", bg: "#f0f9ff", title: "#0c4a6e", text: "#1e3a5f", accent: "#0284c7", soft: "#e0f2fe", font: "Poppins" },
  { key: "sunrise", label: "Sunrise", bg: "#fffbeb", title: "#7c2d12", text: "#44403c", accent: "#ea580c", soft: "#ffedd5", font: "Montserrat" },
  { key: "royal", label: "Royal", bg: "#faf5ff", title: "#3b0764", text: "#3f3f46", accent: "#7c3aed", soft: "#ede9fe", font: "Playfair Display" },
  { key: "forest", label: "Forest", bg: "#052e16", title: "#f0fdf4", text: "#bbf7d0", accent: "#4ade80", soft: "#14532d", font: "Merriweather" },
  { key: "mono", label: "Monochrome", bg: "#fafafa", title: "#111111", text: "#3f3f3f", accent: "#111111", soft: "#ececec", font: "Inter" },
];

export const SLIDE_LAYOUTS = ["title", "content", "two", "section", "picture", "comparison", "quote", "number", "blank"] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];
export const LAYOUT_LABELS: Record<SlideLayout, string> = { title: "Title slide", content: "Title and content", two: "Two content", section: "Section header", picture: "Picture with caption", comparison: "Comparison", quote: "Quote", number: "Big number", blank: "Blank" };

// A new slide in a layout, in the theme's colours.
export function slideLayout(layout: SlideLayout, w: number, h: number, t: SlideTheme = SLIDE_THEMES[0]!): DPage {
  const X = (f: number) => Math.round(w * f * 10) / 10;
  const Y = (f: number) => Math.round(h * f * 10) / 10;
  const tt = (text: string, x: number, y: number, ww: number, hh: number, size: number, extra: Record<string, unknown> = {}) => textEl(text, X(x), Y(y), X(ww), Y(hh), { size, weight: 700, color: t.title, font: t.font, ...extra });
  const tx = (text: string, x: number, y: number, ww: number, hh: number, size: number, extra: Record<string, unknown> = {}) => textEl(text, X(x), Y(y), X(ww), Y(hh), { size, color: t.text, font: t.font, lineHeight: 1.45, ...extra });
  const bar = shapeEl("rect", 0, 0, w, Y(0.025), { fill: t.accent });
  const els: DElement[] = [];
  switch (layout) {
    case "title":
      els.push(shapeEl("rect", 0, Y(0.82), w, Y(0.18), { fill: t.accent }), tt("Presentation title", 0.08, 0.3, 0.84, 0.18, 40, { weight: 800 }), tx("Subtitle, presenter and date", 0.08, 0.52, 0.84, 0.1, 18));
      break;
    case "content":
      els.push(bar, tt("Slide title", 0.06, 0.08, 0.88, 0.12, 28), tx("First point\nSecond point\nThird point", 0.06, 0.25, 0.88, 0.62, 18, { list: "bullet", lineHeight: 1.6 }));
      break;
    case "two":
      els.push(bar, tt("Slide title", 0.06, 0.08, 0.88, 0.12, 28), tx("First point\nSecond point", 0.06, 0.25, 0.42, 0.62, 16, { list: "bullet", lineHeight: 1.6 }), tx("First point\nSecond point", 0.52, 0.25, 0.42, 0.62, 16, { list: "bullet", lineHeight: 1.6 }));
      break;
    case "section":
      els.push(shapeEl("rect", 0, 0, X(0.035), h, { fill: t.accent }), tt("Section title", 0.1, 0.36, 0.8, 0.16, 36, { weight: 800 }), tx("What this part covers", 0.1, 0.54, 0.8, 0.1, 16));
      break;
    case "picture":
      els.push(shapeEl("rect", X(0.06), Y(0.08), X(0.52), Y(0.8), { fill: t.soft, radius: 3 }), tx("Insert, Picture, or drop one here", 0.06, 0.45, 0.52, 0.08, 12, { align: "center", color: t.text }), tt("Picture title", 0.63, 0.25, 0.31, 0.15, 24), tx("A caption that explains the picture.", 0.63, 0.42, 0.31, 0.3, 14));
      break;
    case "comparison":
      els.push(bar, tt("Comparison", 0.06, 0.08, 0.88, 0.12, 28));
      for (const [i, label] of ["Before", "After"].entries()) {
        const x = 0.06 + i * 0.46;
        els.push(shapeEl("rect", X(x), Y(0.25), X(0.42), Y(0.1), { fill: i ? t.accent : t.soft, radius: 2 }), tx(label, x + 0.02, 0.265, 0.38, 0.07, 16, { weight: 700, color: i ? "#ffffff" : t.title }), tx("A point\nAnother point", x, 0.39, 0.42, 0.5, 15, { list: "bullet", lineHeight: 1.6 }));
      }
      break;
    case "quote":
      els.push(tx("“A sentence worth remembering.”", 0.12, 0.3, 0.76, 0.3, 30, { italic: true, align: "center", valign: "middle", color: t.title, font: "Playfair Display" }), tx("— Name, position", 0.12, 0.64, 0.76, 0.08, 16, { align: "center" }));
      break;
    case "number":
      els.push(bar, tt("This month", 0.06, 0.08, 0.88, 0.12, 24), tt("1,250", 0.06, 0.3, 0.88, 0.3, 96, { color: t.accent, align: "center", weight: 800 }), tx("lessons published", 0.06, 0.64, 0.88, 0.1, 20, { align: "center" }));
      break;
    default:
      break;
  }
  return { id: did(), bg: t.bg, elements: els };
}

// A theme over every slide: the background, and the text by role (titles and the rest), the accent shapes and the
// font. Pictures and the colours someone set on purpose elsewhere are kept.
export function applyTheme(d: Design, t: SlideTheme, from?: SlideTheme): Design {
  return {
    ...d,
    pages: d.pages.map((p) => ({
      ...p,
      bg: t.bg,
      bgGradient: null,
      elements: p.elements.map((e) => {
        if (e.kind === "text") return { ...e, font: t.font, color: e.size >= 22 || e.weight >= 700 ? (e.color === "#ffffff" && e.size < 30 ? e.color : t.title) : e.color === "#ffffff" ? e.color : t.text } as DElement;
        if (e.kind === "shape" && e.fill && (!from || e.fill === from.accent || e.fill === from.soft)) return { ...e, fill: from && e.fill === from.soft ? t.soft : t.accent } as DElement;
        if (e.kind === "line") return { ...e, stroke: t.accent } as DElement;
        return e;
      }),
    })),
  };
}

// Slide numbers in the bottom right of every slide (added, or taken off again).
export function setSlideNumbers(d: Design, on: boolean, color = "#64748b"): Design {
  return {
    ...d,
    pages: d.pages.map((p, i) => {
      const rest = p.elements.filter((e) => e.name !== "Slide number");
      return on ? { ...p, elements: [...rest, { ...textEl(String(i + 1), d.w - 24, d.h - 10, 16, 6, { size: 10, color, align: "right" }), name: "Slide number", id: did() } as DElement] } : { ...p, elements: rest };
    }),
  };
}
