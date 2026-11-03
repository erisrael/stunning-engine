// Presentation templates (Phase 24): the colours, fonts, logo, cover and background a deck is shown and exported
// with. Built in: Myseed (the brand, colourful), Myseed dark, International (plain and formal, for partners and
// donors), Ocean and Sunrise. Admin adds more, edits them, or imports one from PowerPoint, Google Slides, Keynote or
// Canva (a .pptx, .potx or .thmx file: its theme colours, fonts, background and logo).

export type DeckTemplate = {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    chart: string[];
  };
  fonts: { heading: string; body: string };
  // A data URL (image) or null for the workspace's own logo.
  logo: string | null;
  cover: { style: "gradient" | "solid" | "split" | "image"; image: string | null };
  // A picture behind every slide (from an imported template), or null.
  background: string | null;
  footer: string;
  slideNumbers: boolean;
  source: "built-in" | "custom" | "imported";
  importedFrom?: string | null;
};

const MYSEED_CHART = ["#1E8E3E", "#1A73E8", "#F9AB00", "#D93025", "#9334E6", "#12B5CB", "#E8710A", "#E52592"];

export const BUILT_IN_TEMPLATES: DeckTemplate[] = [
  {
    id: "myseed",
    name: "Myseed",
    colors: { primary: "#0B7A3B", secondary: "#1A73E8", accent: "#F9AB00", background: "#FFFFFF", surface: "#F1F8F3", text: "#1F2937", muted: "#6B7280", chart: MYSEED_CHART },
    fonts: { heading: "Segoe UI Semibold", body: "Segoe UI" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: null,
    footer: "Myseed",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "myseed-dark",
    name: "Myseed dark",
    colors: { primary: "#34A853", secondary: "#8AB4F8", accent: "#FDD663", background: "#0F1A14", surface: "#18261D", text: "#F3F4F6", muted: "#9CA3AF", chart: ["#81C995", "#8AB4F8", "#FDD663", "#F28B82", "#C58AF9", "#78D9EC", "#FCAD70", "#FF8BCB"] },
    fonts: { heading: "Segoe UI Semibold", body: "Segoe UI" },
    logo: null,
    cover: { style: "split", image: null },
    background: null,
    footer: "Myseed",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "international",
    name: "International (formal)",
    colors: { primary: "#1F3864", secondary: "#2E75B6", accent: "#C00000", background: "#FFFFFF", surface: "#F2F2F2", text: "#262626", muted: "#595959", chart: ["#1F3864", "#2E75B6", "#9DC3E6", "#A5A5A5", "#C00000", "#70AD47", "#FFC000", "#7F7F7F"] },
    fonts: { heading: "Calibri Light", body: "Calibri" },
    logo: null,
    cover: { style: "solid", image: null },
    background: null,
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "ocean",
    name: "Ocean",
    colors: { primary: "#006D77", secondary: "#83C5BE", accent: "#E29578", background: "#FFFFFF", surface: "#EDF6F9", text: "#14213D", muted: "#5C677D", chart: ["#006D77", "#83C5BE", "#E29578", "#FFDDD2", "#3D5A80", "#98C1D9", "#EE6C4D", "#293241"] },
    fonts: { heading: "Georgia", body: "Segoe UI" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: null,
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "sunrise",
    name: "Sunrise",
    colors: { primary: "#E8710A", secondary: "#D93025", accent: "#FBBC04", background: "#FFFDF8", surface: "#FFF4E5", text: "#3C2A1E", muted: "#7A6A5E", chart: ["#E8710A", "#D93025", "#FBBC04", "#1E8E3E", "#9334E6", "#1A73E8", "#E52592", "#12B5CB"] },
    fonts: { heading: "Trebuchet MS", body: "Segoe UI" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: null,
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
];

export const DEFAULT_TEMPLATE_ID = "myseed";

const HEX = /^#[0-9a-f]{6}$/i;
export const hex = (v: unknown, fallback: string) => {
  const s = String(v ?? "").trim();
  const h = s.startsWith("#") ? s : `#${s}`;
  return HEX.test(h) ? h.toUpperCase() : fallback;
};

// A template made safe to keep: colours as #RRGGBB, short names, images as data URLs within limits.
export function cleanTemplate(input: Partial<Omit<DeckTemplate, "id" | "importedFrom">> & { importedFrom?: string | null }, base: DeckTemplate = BUILT_IN_TEMPLATES[0]!): Omit<DeckTemplate, "id" | "source"> {
  const c: Partial<DeckTemplate["colors"]> = input.colors ?? {};
  const img = (v: unknown, max = 3_000_000) => (typeof v === "string" && /^data:image\/(png|jpe?g|gif|svg\+xml|webp);base64,/.test(v) && v.length <= max ? v : null);
  const chart = Array.isArray(c.chart) ? c.chart.map((x, i) => hex(x, base.colors.chart[i % base.colors.chart.length]!)).slice(0, 10) : base.colors.chart;
  return {
    name: String(input.name ?? "").trim().slice(0, 60) || "Template",
    colors: {
      primary: hex(c.primary, base.colors.primary),
      secondary: hex(c.secondary, base.colors.secondary),
      accent: hex(c.accent, base.colors.accent),
      background: hex(c.background, base.colors.background),
      surface: hex(c.surface, base.colors.surface),
      text: hex(c.text, base.colors.text),
      muted: hex(c.muted, base.colors.muted),
      chart: chart.length >= 3 ? chart : base.colors.chart,
    },
    fonts: { heading: String(input.fonts?.heading ?? base.fonts.heading).replace(/[^\w \-]/g, "").slice(0, 40) || base.fonts.heading, body: String(input.fonts?.body ?? base.fonts.body).replace(/[^\w \-]/g, "").slice(0, 40) || base.fonts.body },
    logo: img(input.logo, 600_000),
    cover: { style: (["gradient", "solid", "split", "image"] as const).includes(input.cover?.style as never) ? input.cover!.style : base.cover.style, image: img(input.cover?.image) },
    background: img(input.background),
    footer: String(input.footer ?? "").slice(0, 80),
    slideNumbers: input.slideNumbers !== false,
    importedFrom: input.importedFrom ? String(input.importedFrom).slice(0, 120) : null,
  };
}

// Light or dark text on a colour.
export function onColor(bg: string) {
  const h = bg.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.6 ? "#1F2937" : "#FFFFFF";
}
