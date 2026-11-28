// Free designs (the Canva-style editor): pages of a set size holding text boxes, pictures, shapes, lines, tables,
// icons, QR codes and the signature and stamp places. Used by the Letter Generator's design mode, the Deck Maker's
// free slides and Correspondence letters in design mode. Positions and sizes are in millimetres from the page's
// top-left corner; rotation in degrees. The same data draws the editor, the preview, SVG, PNG, PDF and PowerPoint.

export type DText = {
  kind: "text";
  text: string;
  font: string;
  size: number;
  weight: 400 | 500 | 600 | 700 | 800;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color: string;
  align: "left" | "center" | "right" | "justify";
  valign?: "top" | "middle" | "bottom";
  lineHeight: number;
  letterSpacing?: number;
  uppercase?: boolean;
  bg?: string | null;
  padding?: number;
  list?: "none" | "bullet" | "number";
  shadow?: boolean;
  outline?: string | null;
};
export type DImage = { kind: "image"; src: string; fit: "cover" | "contain"; radius?: number; border?: string | null; borderWidth?: number; flipX?: boolean; flipY?: boolean; filter?: "none" | "grayscale" | "sepia" | "bright" | "dark" | "blur" };
export type DShape = { kind: "shape"; shape: "rect" | "ellipse" | "triangle" | "diamond" | "star" | "arrow" | "hexagon" | "speech" | "pill"; fill: string | null; stroke: string | null; strokeWidth: number; radius?: number; dash?: boolean; gradient?: string | null };
export type DLine = { kind: "line"; stroke: string; strokeWidth: number; dash?: boolean; arrowEnd?: boolean; arrowStart?: boolean };
export type DTable = { kind: "table"; rows: string[][]; header: boolean; font: string; size: number; color: string; headFill: string; headColor: string; border: string; stripe?: string | null; align?: "left" | "center" | "right" };
export type DIcon = { kind: "icon"; icon: string; color: string };
export type DQr = { kind: "qr"; value?: string };
export type DSlot = { kind: "slot"; slot: "signature" | "stamp" | "date" | "reference" | "recipient" | "body"; label?: string };
export type DElementBody = DText | DImage | DShape | DLine | DTable | DIcon | DQr | DSlot;
export type DElement = DElementBody & { id: string; x: number; y: number; w: number; h: number; rotate: number; opacity: number; locked?: boolean; hidden?: boolean; name?: string; group?: string; link?: string | null };
export type DPage = { id: string; bg: string; bgImage?: string | null; bgGradient?: string | null; elements: DElement[]; notes?: string; name?: string };
export type Design = { v: 1; w: number; h: number; unit: "mm" | "px"; pages: DPage[]; fonts?: string[]; palette?: string[] };

export const DESIGN_SIZES: { key: string; label: string; w: number; h: number }[] = [
  { key: "a4", label: "A4 portrait (letter)", w: 210, h: 297 },
  { key: "a4l", label: "A4 landscape", w: 297, h: 210 },
  { key: "a5", label: "A5", w: 148, h: 210 },
  { key: "letter", label: "US Letter", w: 215.9, h: 279.4 },
  { key: "slide", label: "Slide 16:9", w: 254, h: 142.875 },
  { key: "slide43", label: "Slide 4:3", w: 254, h: 190.5 },
  { key: "certificate", label: "Certificate (A4 landscape)", w: 297, h: 210 },
  { key: "card", label: "Business card", w: 85, h: 55 },
  { key: "post", label: "Social post (square)", w: 150, h: 150 },
  { key: "story", label: "Story (9:16)", w: 108, h: 192 },
  { key: "poster", label: "Poster A3", w: 297, h: 420 },
  { key: "flyer", label: "Flyer A5", w: 148, h: 210 },
  { key: "banner", label: "Web banner", w: 300, h: 100 },
  { key: "envelope", label: "Envelope DL", w: 220, h: 110 },
];

export const DESIGN_FONTS = ["Inter", "Calibri", "Arial", "Helvetica", "Georgia", "Times New Roman", "Garamond", "Cambria", "Verdana", "Trebuchet MS", "Courier New", "Nyala", "Abyssinica SIL", "Noto Sans Ethiopic", "Noto Serif Ethiopic", "Segoe UI", "Montserrat", "Poppins", "Playfair Display", "Merriweather", "Roboto", "Open Sans", "Lato", "Oswald", "Raleway"];
// Fonts offered from Google Fonts in the editor and the preview (loaded on demand; the rest are on the computer).
export const WEB_FONTS = ["Inter", "Montserrat", "Poppins", "Playfair Display", "Merriweather", "Roboto", "Open Sans", "Lato", "Oswald", "Raleway", "Noto Sans Ethiopic", "Noto Serif Ethiopic"];
// Single quotes only: the stack goes inside style="…" attributes.
export const fontStack = (f: string) => `'${f.replace(/["'\\;<>]/g, "")}',${/serif|georgia|times|garamond|cambria|merriweather|playfair|abyssinica/i.test(f) ? "'Noto Serif Ethiopic', serif" : "'Noto Sans Ethiopic', Arial, sans-serif"}`;

export const ICONS: Record<string, string> = {
  check: "M20 6 9 17l-5-5",
  star: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 2-10 7L2 6",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20",
  pin: "M12 22s-8-6.5-8-13a8 8 0 0 1 16 0c0 6.5-8 13-8 13zm0-10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  calendar: "M3 5h18v16H3zM16 3v4M8 3v4M3 10h18",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  award: "M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM8.2 13.9 7 23l5-3 5 3-1.2-9.1",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9z",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  chart: "M3 3v18h18M7 16V9M12 16V5M17 16v-4",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  quote: "M3 21c3 0 7-1 7-8V5H3v8h4c0 4-2 5-4 5zm11 0c3 0 7-1 7-8V5h-7v8h4c0 4-2 5-4 5z",
  arrow: "M5 12h14M12 5l7 7-7 7",
  building: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1",
  graduation: "M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5",
};

export const did = () => Math.random().toString(36).slice(2, 10);
const HEX = /^#[0-9a-f]{6}$/i;
const GRAD = /^linear-gradient\((\d{1,3})deg, ?(#[0-9a-f]{6}), ?(#[0-9a-f]{6})\)$/i;
const IMG = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

export function blankDesign(size = "a4"): Design {
  const s = DESIGN_SIZES.find((x) => x.key === size) ?? DESIGN_SIZES[0]!;
  return { v: 1, w: s.w, h: s.h, unit: "mm", pages: [{ id: did(), bg: "#ffffff", elements: [] }] };
}

export function textEl(text: string, x: number, y: number, w: number, h: number, extra: Partial<DText> = {}): DElement {
  return { id: did(), kind: "text", text, font: "Inter", size: 12, weight: 400, color: "#111827", align: "left", lineHeight: 1.35, x, y, w, h, rotate: 0, opacity: 1, ...extra } as DElement;
}
export function shapeEl(shape: DShape["shape"], x: number, y: number, w: number, h: number, extra: Partial<DShape> = {}): DElement {
  return { id: did(), kind: "shape", shape, fill: "#16a34a", stroke: null, strokeWidth: 0.5, x, y, w, h, rotate: 0, opacity: 1, ...extra } as DElement;
}

// ---------------------------------------------------------------------------
// Cleaning (everything from the browser is checked before it is kept)
// ---------------------------------------------------------------------------

const num = (v: unknown, d: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const col = (v: unknown, d: string | null) => (typeof v === "string" && HEX.test(v) ? v : d);
const grad = (v: unknown) => (typeof v === "string" && GRAD.test(v) ? v : null);
const str = (v: unknown, n: number) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, n);
const font = (v: unknown) => (typeof v === "string" && /^[\w '-]{1,40}$/.test(v) ? v : "Inter");
const img = (v: unknown, max = 3_000_000) => (typeof v === "string" && (IMG.test(v) || v === "logo") && v.length <= max ? v : null);
const SAFE_URL = /^(https?:\/\/|mailto:|tel:)[^\s"'<>]{1,500}$/i;

export function cleanElement(e0: unknown): DElement | null {
  const e = (e0 ?? {}) as Record<string, unknown>;
  const base = {
    id: /^[a-z0-9]{4,20}$/i.test(String(e.id)) ? String(e.id) : did(),
    x: num(e.x, 10, -2000, 4000),
    y: num(e.y, 10, -2000, 4000),
    w: num(e.w, 40, 0, 4000),
    h: num(e.h, 20, 0, 4000),
    rotate: num(e.rotate, 0, -360, 360),
    opacity: num(e.opacity, 1, 0, 1),
    locked: !!e.locked,
    hidden: !!e.hidden,
    name: e.name ? str(e.name, 60) : undefined,
    group: e.group && /^[a-z0-9]{4,20}$/i.test(String(e.group)) ? String(e.group) : undefined,
    link: typeof e.link === "string" && SAFE_URL.test(e.link) ? e.link : null,
  };
  switch (e.kind) {
    case "text":
      return {
        ...base,
        kind: "text",
        text: str(e.text, 20_000),
        font: font(e.font),
        size: num(e.size, 12, 3, 400),
        weight: ([400, 500, 600, 700, 800] as const).includes(Number(e.weight) as 400) ? (Number(e.weight) as DText["weight"]) : 400,
        italic: !!e.italic,
        underline: !!e.underline,
        strike: !!e.strike,
        color: col(e.color, "#111827")!,
        align: (["left", "center", "right", "justify"] as const).includes(e.align as "left") ? (e.align as DText["align"]) : "left",
        valign: (["top", "middle", "bottom"] as const).includes(e.valign as "top") ? (e.valign as DText["valign"]) : "top",
        lineHeight: num(e.lineHeight, 1.35, 0.7, 4),
        letterSpacing: num(e.letterSpacing, 0, -5, 30),
        uppercase: !!e.uppercase,
        bg: col(e.bg, null),
        padding: num(e.padding, 0, 0, 50),
        list: e.list === "bullet" || e.list === "number" ? e.list : "none",
        shadow: !!e.shadow,
        outline: col(e.outline, null),
      };
    case "image": {
      const src = img(e.src);
      if (!src) return null;
      return { ...base, kind: "image", src, fit: e.fit === "contain" ? "contain" : "cover", radius: num(e.radius, 0, 0, 500), border: col(e.border, null), borderWidth: num(e.borderWidth, 0, 0, 20), flipX: !!e.flipX, flipY: !!e.flipY, filter: (["none", "grayscale", "sepia", "bright", "dark", "blur"] as const).includes(e.filter as "none") ? (e.filter as DImage["filter"]) : "none" };
    }
    case "shape":
      return { ...base, kind: "shape", shape: (["rect", "ellipse", "triangle", "diamond", "star", "arrow", "hexagon", "speech", "pill"] as const).includes(e.shape as "rect") ? (e.shape as DShape["shape"]) : "rect", fill: col(e.fill, null), stroke: col(e.stroke, null), strokeWidth: num(e.strokeWidth, 0.5, 0, 30), radius: num(e.radius, 0, 0, 500), dash: !!e.dash, gradient: grad(e.gradient) };
    case "line":
      return { ...base, kind: "line", stroke: col(e.stroke, "#111827")!, strokeWidth: num(e.strokeWidth, 0.5, 0.1, 30), dash: !!e.dash, arrowEnd: !!e.arrowEnd, arrowStart: !!e.arrowStart };
    case "table": {
      const rows = (Array.isArray(e.rows) ? e.rows : []).slice(0, 60).map((r) => (Array.isArray(r) ? r : []).slice(0, 20).map((c) => str(c, 2000)));
      const width = Math.max(1, ...rows.map((r) => r.length));
      return { ...base, kind: "table", rows: (rows.length ? rows : [["", ""]]).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")), header: e.header !== false, font: font(e.font), size: num(e.size, 10, 4, 60), color: col(e.color, "#111827")!, headFill: col(e.headFill, "#0f172a")!, headColor: col(e.headColor, "#ffffff")!, border: col(e.border, "#cbd5e1")!, stripe: col(e.stripe, null), align: e.align === "center" || e.align === "right" ? e.align : "left" };
    }
    case "icon":
      return { ...base, kind: "icon", icon: typeof e.icon === "string" && e.icon in ICONS ? e.icon : "star", color: col(e.color, "#16a34a")! };
    case "qr":
      return { ...base, kind: "qr", value: e.value ? str(e.value, 500) : undefined };
    case "slot":
      return { ...base, kind: "slot", slot: (["signature", "stamp", "date", "reference", "recipient", "body"] as const).includes(e.slot as "signature") ? (e.slot as DSlot["slot"]) : "signature", label: e.label ? str(e.label, 80) : undefined };
  }
  return null;
}

export function cleanDesign(input: unknown, maxPages = 60): Design {
  const d = (input ?? {}) as Partial<Design>;
  const pages = (Array.isArray(d.pages) ? d.pages : []).slice(0, maxPages).map(
    (p0): DPage => {
      const p = (p0 ?? {}) as Partial<DPage>;
      return {
        id: /^[a-z0-9]{4,20}$/i.test(String(p.id)) ? String(p.id) : did(),
        bg: col(p.bg, "#ffffff")!,
        bgImage: img(p.bgImage),
        bgGradient: grad(p.bgGradient),
        elements: (Array.isArray(p.elements) ? p.elements : []).slice(0, 400).map(cleanElement).filter((x): x is DElement => !!x),
        notes: p.notes ? str(p.notes, 5000) : undefined,
        name: p.name ? str(p.name, 80) : undefined,
      };
    },
  );
  return {
    v: 1,
    w: num(d.w, 210, 8, 2000),
    h: num(d.h, 297, 8, 2000),
    unit: "mm",
    pages: pages.length ? pages : blankDesign().pages,
    palette: (Array.isArray(d.palette) ? d.palette : []).filter((c) => typeof c === "string" && HEX.test(c)).slice(0, 24),
  };
}

// ---------------------------------------------------------------------------
// Drawing: one page as SVG (preview, PNG, PDF) with {{fields}} filled in
// ---------------------------------------------------------------------------

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const fill = (text: string, values: Record<string, string> = {}) => text.replace(/\{\{\s*([a-z0-9_]{1,40})\s*\}\}/gi, (m, k: string) => values[k.toLowerCase()] ?? m);

export function shapePath(shape: DShape["shape"], w: number, h: number, r = 0) {
  switch (shape) {
    case "ellipse":
      return `M${w / 2},0 A${w / 2},${h / 2} 0 1 1 ${w / 2 - 0.001},0 Z`;
    case "triangle":
      return `M${w / 2},0 L${w},${h} L0,${h} Z`;
    case "diamond":
      return `M${w / 2},0 L${w},${h / 2} L${w / 2},${h} L0,${h / 2} Z`;
    case "hexagon":
      return `M${w * 0.25},0 L${w * 0.75},0 L${w},${h / 2} L${w * 0.75},${h} L${w * 0.25},${h} L0,${h / 2} Z`;
    case "arrow":
      return `M0,${h * 0.3} L${w * 0.65},${h * 0.3} L${w * 0.65},0 L${w},${h / 2} L${w * 0.65},${h} L${w * 0.65},${h * 0.7} L0,${h * 0.7} Z`;
    case "speech":
      return `M0,0 L${w},0 L${w},${h * 0.75} L${w * 0.35},${h * 0.75} L${w * 0.2},${h} L${w * 0.22},${h * 0.75} L0,${h * 0.75} Z`;
    case "star": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? 0.4 : 1;
        pts.push(`${w / 2 + (w / 2) * rr * Math.cos(a)},${h / 2 + (h / 2) * rr * Math.sin(a)}`);
      }
      return `M${pts.join(" L")} Z`;
    }
    case "pill": {
      const k = Math.min(w, h) / 2;
      return `M${k},0 H${w - k} A${k},${k} 0 0 1 ${w - k},${h} H${k} A${k},${k} 0 0 1 ${k},0 Z`;
    }
    default: {
      const k = Math.min(r, w / 2, h / 2);
      return k ? `M${k},0 H${w - k} A${k},${k} 0 0 1 ${w},${k} V${h - k} A${k},${k} 0 0 1 ${w - k},${h} H${k} A${k},${k} 0 0 1 0,${h - k} V${k} A${k},${k} 0 0 1 ${k},0 Z` : `M0,0 H${w} V${h} H0 Z`;
    }
  }
}

const FILTERS: Record<string, string> = { grayscale: "grayscale(1)", sepia: "sepia(0.8)", bright: "brightness(1.2) saturate(1.2)", dark: "brightness(0.7)", blur: "blur(1.5px)" };

// Text wrapped into lines that fit a width (an estimate from the font size; the editor shows the real browser layout).
function wrap(text: string, widthMm: number, sizePt: number, spacing = 0) {
  const avg = (sizePt * 0.3528 * 0.52) + spacing * 0.3528; // mm per character, near enough for Latin and Ethiopic
  const per = Math.max(1, Math.floor(widthMm / avg));
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if ((line + word).length > per && line.trim()) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else line += word;
    }
    out.push(line);
  }
  return out;
}

// Inner SVG markup for one element (in mm units; the page's viewBox is in mm).
export function elementSvg(e: DElement, values: Record<string, string> = {}, extras: { logo?: string; qr?: string | null; signature?: string | null; stamp?: string | null; editing?: boolean } = {}): string {
  if (e.hidden) return "";
  const t = `translate(${e.x} ${e.y}) rotate(${e.rotate} ${e.w / 2} ${e.h / 2})`;
  const op = e.opacity < 1 ? ` opacity="${e.opacity}"` : "";
  let inner = "";
  switch (e.kind) {
    case "text": {
      const size = (e.size * 25.4) / 72; // pt to mm
      const lines = wrap(fill(e.uppercase ? e.text.toUpperCase() : e.text, values), e.w - (e.padding ?? 0) * 2, e.size, e.letterSpacing);
      const lh = size * e.lineHeight;
      const total = lines.length * lh;
      const pad = e.padding ?? 0;
      const y0 = e.valign === "middle" ? (e.h - total) / 2 : e.valign === "bottom" ? e.h - total - pad : pad;
      const anchor = e.align === "center" ? "middle" : e.align === "right" ? "end" : "start";
      const tx = e.align === "center" ? e.w / 2 : e.align === "right" ? e.w - pad : pad;
      const deco = [e.underline && "underline", e.strike && "line-through"].filter(Boolean).join(" ");
      const bg = e.bg ? `<rect width="${e.w}" height="${e.h}" fill="${e.bg}"/>` : "";
      inner = `${bg}<text font-family="${x(fontStack(e.font))}" font-size="${size}" font-weight="${e.weight}"${e.italic ? ' font-style="italic"' : ""}${deco ? ` text-decoration="${deco}"` : ""} fill="${e.color}"${e.letterSpacing ? ` letter-spacing="${(e.letterSpacing * 0.3528).toFixed(3)}"` : ""}${e.outline ? ` stroke="${e.outline}" stroke-width="${size * 0.04}" paint-order="stroke"` : ""}${e.shadow ? ' filter="url(#ds)"' : ""} text-anchor="${anchor}">${lines
        .map((l, i) => `<tspan x="${tx}" y="${(y0 + size * 0.85 + i * lh).toFixed(3)}">${x((e.list === "bullet" && l ? "• " : e.list === "number" && l ? `${i + 1}. ` : "") + l)}</tspan>`)
        .join("")}</text>`;
      break;
    }
    case "image": {
      const src = e.src === "logo" ? (extras.logo ?? "") : e.src;
      const clip = e.radius ? `<clipPath id="c${e.id}"><rect width="${e.w}" height="${e.h}" rx="${e.radius}"/></clipPath>` : "";
      const flip = e.flipX || e.flipY ? ` transform="translate(${e.flipX ? e.w : 0} ${e.flipY ? e.h : 0}) scale(${e.flipX ? -1 : 1} ${e.flipY ? -1 : 1})"` : "";
      inner = `${clip}<image href="${x(src)}" width="${e.w}" height="${e.h}" preserveAspectRatio="${e.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}"${e.radius ? ` clip-path="url(#c${e.id})"` : ""}${flip}${e.filter && e.filter !== "none" ? ` style="filter:${FILTERS[e.filter]}"` : ""}/>${e.border && e.borderWidth ? `<rect width="${e.w}" height="${e.h}" rx="${e.radius ?? 0}" fill="none" stroke="${e.border}" stroke-width="${e.borderWidth}"/>` : ""}`;
      break;
    }
    case "shape": {
      const g = e.gradient ? GRAD.exec(e.gradient) : null;
      const gid = `g${e.id}`;
      const defs = g ? `<linearGradient id="${gid}" gradientTransform="rotate(${Number(g[1]) - 90} .5 .5)"><stop offset="0" stop-color="${g[2]}"/><stop offset="1" stop-color="${g[3]}"/></linearGradient>` : "";
      inner = `${defs}<path d="${shapePath(e.shape, e.w, e.h, e.radius)}" fill="${g ? `url(#${gid})` : (e.fill ?? "none")}" stroke="${e.stroke ?? "none"}" stroke-width="${e.stroke ? e.strokeWidth : 0}"${e.dash ? ` stroke-dasharray="${e.strokeWidth * 3} ${e.strokeWidth * 2}"` : ""}/>`;
      break;
    }
    case "line": {
      const head = (id: string) => `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${e.stroke}"/></marker>`;
      inner = `${e.arrowEnd || e.arrowStart ? head(`m${e.id}`) : ""}<line x1="0" y1="${e.h / 2}" x2="${e.w}" y2="${e.h / 2}" stroke="${e.stroke}" stroke-width="${e.strokeWidth}"${e.dash ? ` stroke-dasharray="${e.strokeWidth * 3} ${e.strokeWidth * 2}"` : ""}${e.arrowEnd ? ` marker-end="url(#m${e.id})"` : ""}${e.arrowStart ? ` marker-start="url(#m${e.id})"` : ""}/>`;
      break;
    }
    case "table": {
      const rows = e.rows;
      const n = rows.length || 1;
      const m = rows[0]?.length || 1;
      const rh = e.h / n;
      const cw = e.w / m;
      const size = (e.size * 25.4) / 72;
      const cells: string[] = [];
      rows.forEach((r, i) => {
        const head = i === 0 && e.header;
        const bgc = head ? e.headFill : e.stripe && i % 2 === 0 ? e.stripe : null;
        if (bgc) cells.push(`<rect x="0" y="${i * rh}" width="${e.w}" height="${rh}" fill="${bgc}"/>`);
        r.forEach((c, j) => {
          const anchor = e.align === "center" ? "middle" : e.align === "right" ? "end" : "start";
          const tx = e.align === "center" ? j * cw + cw / 2 : e.align === "right" ? (j + 1) * cw - 1.5 : j * cw + 1.5;
          cells.push(`<text x="${tx}" y="${i * rh + rh / 2 + size * 0.35}" font-family="${x(fontStack(e.font))}" font-size="${size}" font-weight="${head ? 700 : 400}" fill="${head ? e.headColor : e.color}" text-anchor="${anchor}">${x(fill(c, values).slice(0, 80))}</text>`);
        });
      });
      const grid = [...Array.from({ length: n + 1 }, (_, i) => `<line x1="0" x2="${e.w}" y1="${i * rh}" y2="${i * rh}"/>`), ...Array.from({ length: m + 1 }, (_, j) => `<line y1="0" y2="${e.h}" x1="${j * cw}" x2="${j * cw}"/>`)].join("");
      inner = `${cells.join("")}<g stroke="${e.border}" stroke-width="0.25">${grid}</g>`;
      break;
    }
    case "icon":
      inner = `<svg viewBox="0 0 24 24" width="${e.w}" height="${e.h}" fill="none" stroke="${e.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[e.icon] ?? ICONS.star}"/></svg>`;
      break;
    case "qr":
      inner = extras.qr ? `<image href="${x(extras.qr)}" width="${e.w}" height="${e.h}"/>` : `<rect width="${e.w}" height="${e.h}" fill="#f8fafc" stroke="#94a3b8" stroke-dasharray="1 1" stroke-width="0.3"/><text x="${e.w / 2}" y="${e.h / 2 + 1.2}" font-size="3.4" text-anchor="middle" fill="#64748b" font-family="Arial">QR</text>`;
      break;
    case "slot": {
      const pic = e.slot === "signature" ? extras.signature : e.slot === "stamp" ? extras.stamp : null;
      if (pic) inner = `<image href="${x(pic)}" width="${e.w}" height="${e.h}" preserveAspectRatio="xMidYMid meet"/>`;
      else if (e.slot === "date" || e.slot === "reference") inner = `<text x="0" y="${e.h * 0.7}" font-size="${Math.min(4.2, e.h * 0.7)}" font-family="Arial" fill="#111827">${x(fill(e.slot === "date" ? "{{issue_date}}" : "{{document_number}}", values))}</text>`;
      else if (extras.editing) inner = `<rect width="${e.w}" height="${e.h}" fill="#eff6ff" stroke="#60a5fa" stroke-dasharray="1 1" stroke-width="0.3"/><text x="${e.w / 2}" y="${e.h / 2 + 1.2}" font-size="3.2" text-anchor="middle" fill="#2563eb" font-family="Arial">${x(e.label ?? { signature: "Signature", stamp: "Stamp", body: "Letter text", recipient: "Recipient", date: "Date", reference: "Reference" }[e.slot])}</text>`;
      break;
    }
  }
  const body = e.link ? `<a href="${x(e.link)}">${inner}</a>` : inner;
  return `<g transform="${t}"${op}>${body}</g>`;
}

export function pageSvg(d: Design, page: DPage, values: Record<string, string> = {}, extras: Parameters<typeof elementSvg>[2] = {}, widthPx?: number) {
  const g = page.bgGradient ? GRAD.exec(page.bgGradient) : null;
  const bg = g
    ? `<defs><linearGradient id="pbg" gradientTransform="rotate(${Number(g[1]) - 90} .5 .5)"><stop offset="0" stop-color="${g[2]}"/><stop offset="1" stop-color="${g[3]}"/></linearGradient></defs><rect width="${d.w}" height="${d.h}" fill="url(#pbg)"/>`
    : `<rect width="${d.w}" height="${d.h}" fill="${page.bg}"/>`;
  const bgImg = page.bgImage ? `<image href="${x(page.bgImage)}" width="${d.w}" height="${d.h}" preserveAspectRatio="xMidYMid slice"/>` : "";
  const size = widthPx ? ` width="${widthPx}" height="${Math.round((widthPx * d.h) / d.w)}"` : ` width="${d.w}mm" height="${d.h}mm"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${d.w} ${d.h}"${size}><defs><filter id="ds" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0.4" dy="0.4" stdDeviation="0.5" flood-opacity="0.35"/></filter></defs>${bg}${bgImg}${page.elements.map((e) => elementSvg(e, values, extras)).join("")}</svg>`;
}

// Text a design carries (for search, AI copy and the plain-text part of exports).
export function designText(d: Design) {
  return d.pages
    .map((p) =>
      p.elements
        .filter((e) => !e.hidden)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((e) => (e.kind === "text" ? e.text : e.kind === "table" ? e.rows.map((r) => r.join(" | ")).join("\n") : ""))
        .filter(Boolean)
        .join("\n\n"),
    )
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Drawing as HTML (the editor, the preview and the PDF use this; exact browser text layout)
// ---------------------------------------------------------------------------

export type Extras = { logo?: string; qr?: string | null; signature?: string | null; stamp?: string | null; editing?: boolean };

export function textCss(e: DText) {
  return [
    `font-family:${fontStack(e.font)}`,
    `font-size:${e.size}pt`,
    `font-weight:${e.weight}`,
    e.italic ? "font-style:italic" : "",
    e.underline || e.strike ? `text-decoration:${[e.underline && "underline", e.strike && "line-through"].filter(Boolean).join(" ")}` : "",
    `color:${e.color}`,
    `text-align:${e.align}`,
    `line-height:${e.lineHeight}`,
    e.letterSpacing ? `letter-spacing:${e.letterSpacing}pt` : "",
    e.uppercase ? "text-transform:uppercase" : "",
    e.bg ? `background:${e.bg}` : "",
    `padding:${e.padding ?? 0}mm`,
    e.shadow ? "text-shadow:0.3mm 0.3mm 0.6mm rgba(0,0,0,.35)" : "",
    e.outline ? `-webkit-text-stroke:0.25pt ${e.outline}` : "",
    "display:flex;flex-direction:column",
    `justify-content:${e.valign === "middle" ? "center" : e.valign === "bottom" ? "flex-end" : "flex-start"}`,
    "white-space:pre-wrap;word-break:break-word;overflow:hidden;width:100%;height:100%;box-sizing:border-box",
  ]
    .filter(Boolean)
    .join(";");
}

export function textInner(e: DText, values: Record<string, string> = {}) {
  const t = fill(e.text, values);
  if (e.list === "bullet" || e.list === "number") {
    const tag = e.list === "bullet" ? "ul" : "ol";
    return `<${tag} style="margin:0;padding-left:1.2em">${t
      .split("\n")
      .map((l) => `<li>${x(l)}</li>`)
      .join("")}</${tag}>`;
  }
  return `<div>${x(t)}</div>`;
}

export function elementInner(e: DElement, values: Record<string, string> = {}, extras: Extras = {}): string {
  switch (e.kind) {
    case "text":
      return `<div style="${textCss(e)}">${textInner(e, values)}</div>`;
    case "image": {
      const src = e.src === "logo" ? (extras.logo ?? "") : e.src;
      const tf = e.flipX || e.flipY ? `transform:scale(${e.flipX ? -1 : 1},${e.flipY ? -1 : 1});` : "";
      return `<img alt="" draggable="false" src="${x(src)}" style="width:100%;height:100%;object-fit:${e.fit};border-radius:${e.radius ?? 0}mm;${e.border && e.borderWidth ? `border:${e.borderWidth}mm solid ${e.border};box-sizing:border-box;` : ""}${tf}${e.filter && e.filter !== "none" ? `filter:${FILTERS[e.filter]};` : ""}display:block">`;
    }
    case "table": {
      const rows = e.rows
        .map((r, i) => {
          const head = i === 0 && e.header;
          const bg = head ? e.headFill : e.stripe && i % 2 === 0 ? e.stripe : "";
          return `<tr style="${bg ? `background:${bg};` : ""}${head ? `color:${e.headColor};font-weight:700;` : ""}">${r.map((c) => `<td style="border:0.25mm solid ${e.border};padding:0.8mm 1.5mm;text-align:${e.align ?? "left"}">${x(fill(c, values))}</td>`).join("")}</tr>`;
        })
        .join("");
      return `<table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;font-family:${fontStack(e.font)};font-size:${e.size}pt;color:${e.color}">${rows}</table>`;
    }
    case "qr":
    case "slot":
    case "shape":
    case "line":
    case "icon": {
      // Drawn as SVG inside the box (same as the SVG export).
      const svg = elementSvg({ ...e, x: 0, y: 0, rotate: 0, opacity: 1 }, values, extras);
      const pad = e.kind === "line" ? 4 : 0;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${e.w + pad * 2} ${Math.max(e.h, 0.01) + pad * 2}" preserveAspectRatio="none" style="width:calc(100% + ${pad * 2}mm);height:calc(100% + ${pad * 2}mm);margin:-${pad}mm;overflow:visible;display:block">${svg}</svg>`;
    }
  }
}

export function elementHtml(e: DElement, values: Record<string, string> = {}, extras: Extras = {}) {
  if (e.hidden) return "";
  const box = `position:absolute;left:${e.x}mm;top:${e.y}mm;width:${e.w}mm;height:${e.h}mm;${e.rotate ? `transform:rotate(${e.rotate}deg);` : ""}${e.opacity < 1 ? `opacity:${e.opacity};` : ""}`;
  const inner = elementInner(e, values, extras);
  return e.link ? `<a href="${x(e.link)}" style="${box}display:block" rel="noopener noreferrer">${inner}</a>` : `<div style="${box}">${inner}</div>`;
}

export function pageBackground(p: DPage) {
  return `${p.bgGradient ? `background:${p.bgGradient};` : `background:${p.bg};`}${p.bgImage ? `background-image:url('${p.bgImage}');background-size:cover;background-position:center;` : ""}`;
}

export function pageHtml(d: Design, p: DPage, values: Record<string, string> = {}, extras: Extras = {}) {
  return `<div class="dz-page" style="position:relative;overflow:hidden;width:${d.w}mm;height:${d.h}mm;${pageBackground(p)}">${p.elements.map((e) => elementHtml(e, values, extras)).join("")}</div>`;
}

// The Google Fonts a design uses (loaded in the editor, the preview and the print window).
export function webFontsCss(d: Design) {
  const used = new Set<string>();
  for (const p of d.pages) for (const e of p.elements) if ((e.kind === "text" || e.kind === "table") && WEB_FONTS.includes(e.font)) used.add(e.font);
  if (!used.size) return "";
  return `@import url("https://fonts.googleapis.com/css2?${[...used].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,400;0,600;0,700;1,400`).join("&")}&display=swap");`;
}

// ---------------------------------------------------------------------------
// What Admin allows in the design editor (Admin, Tools hub, Design editor)
// ---------------------------------------------------------------------------

export type DesignOptions = {
  // Where the editor is offered.
  surfaces: { letters: boolean; decks: boolean; correspondence: boolean };
  // The mode a letter opens in, and whether people may switch between writing, designing and previewing.
  defaultMode: "write" | "design" | "preview";
  allowModeSwitch: boolean;
  allowUploads: boolean;
  maxUploadKb: number;
  allowCustomColors: boolean;
  allowAllFonts: boolean;
  fonts: string[];
  webFonts: boolean;
  allowPageSize: boolean;
  allowShapes: boolean;
  allowIcons: boolean;
  allowTables: boolean;
  allowQr: boolean;
  allowBackgroundImage: boolean;
  // Letterhead parts placed by a template stay where they are (cannot be unlocked, moved or deleted).
  lockLetterhead: boolean;
  snap: boolean;
  grid: boolean;
  gridSize: number;
  maxPages: number;
  exports: { png: boolean; jpeg: boolean; pdf: boolean; svg: boolean; pptx: boolean; docx: boolean };
  // Brand colours offered first (and only these when custom colours are off).
  palette: string[];
};

export const DEFAULT_DESIGN_OPTIONS: DesignOptions = {
  surfaces: { letters: true, decks: true, correspondence: true },
  defaultMode: "write",
  allowModeSwitch: true,
  allowUploads: true,
  maxUploadKb: 1500,
  allowCustomColors: true,
  allowAllFonts: true,
  fonts: ["Inter", "Calibri", "Arial", "Georgia", "Times New Roman", "Nyala", "Noto Sans Ethiopic"],
  webFonts: true,
  allowPageSize: true,
  allowShapes: true,
  allowIcons: true,
  allowTables: true,
  allowQr: true,
  allowBackgroundImage: true,
  lockLetterhead: true,
  snap: true,
  grid: false,
  gridSize: 5,
  maxPages: 30,
  exports: { png: true, jpeg: true, pdf: true, svg: true, pptx: true, docx: true },
  palette: ["#16a34a", "#0f172a", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#ffffff", "#64748b"],
};

export function cleanDesignOptions(input: unknown): DesignOptions {
  const o = (input ?? {}) as Partial<DesignOptions>;
  const d = DEFAULT_DESIGN_OPTIONS;
  const b = (v: unknown, dv: boolean) => (typeof v === "boolean" ? v : dv);
  return {
    surfaces: { letters: b(o.surfaces?.letters, d.surfaces.letters), decks: b(o.surfaces?.decks, d.surfaces.decks), correspondence: b(o.surfaces?.correspondence, d.surfaces.correspondence) },
    defaultMode: o.defaultMode === "design" || o.defaultMode === "preview" ? o.defaultMode : "write",
    allowModeSwitch: b(o.allowModeSwitch, d.allowModeSwitch),
    allowUploads: b(o.allowUploads, d.allowUploads),
    maxUploadKb: num(o.maxUploadKb, d.maxUploadKb, 100, 3000),
    allowCustomColors: b(o.allowCustomColors, d.allowCustomColors),
    allowAllFonts: b(o.allowAllFonts, d.allowAllFonts),
    fonts: (Array.isArray(o.fonts) ? o.fonts : d.fonts).filter((f) => typeof f === "string" && DESIGN_FONTS.includes(f)).slice(0, 40),
    webFonts: b(o.webFonts, d.webFonts),
    allowPageSize: b(o.allowPageSize, d.allowPageSize),
    allowShapes: b(o.allowShapes, d.allowShapes),
    allowIcons: b(o.allowIcons, d.allowIcons),
    allowTables: b(o.allowTables, d.allowTables),
    allowQr: b(o.allowQr, d.allowQr),
    allowBackgroundImage: b(o.allowBackgroundImage, d.allowBackgroundImage),
    lockLetterhead: b(o.lockLetterhead, d.lockLetterhead),
    snap: b(o.snap, d.snap),
    grid: b(o.grid, d.grid),
    gridSize: num(o.gridSize, d.gridSize, 1, 50),
    maxPages: num(o.maxPages, d.maxPages, 1, 60),
    exports: { png: b(o.exports?.png, true), jpeg: b(o.exports?.jpeg, true), pdf: b(o.exports?.pdf, true), svg: b(o.exports?.svg, true), pptx: b(o.exports?.pptx, true), docx: b(o.exports?.docx, true) },
    palette: (Array.isArray(o.palette) ? o.palette : d.palette).filter((c) => typeof c === "string" && HEX.test(c)).slice(0, 24),
  };
}
