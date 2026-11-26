// Letter templates (Correspondence): the page, the letterhead and every element on it, as plain data shared by the
// designer, the preview, the PDF (print) and the Word export. Positions and sizes are in millimetres; the unit a
// designer works in (mm, cm, in) is only for display.

export const PAPER_SIZES: Record<string, { label: string; w: number; h: number }> = {
  A0: { label: "A0", w: 841, h: 1189 },
  A1: { label: "A1", w: 594, h: 841 },
  A2: { label: "A2", w: 420, h: 594 },
  A3: { label: "A3", w: 297, h: 420 },
  A4: { label: "A4", w: 210, h: 297 },
  A5: { label: "A5", w: 148, h: 210 },
  A6: { label: "A6", w: 105, h: 148 },
  B4: { label: "B4", w: 250, h: 353 },
  B5: { label: "B5", w: 176, h: 250 },
  Letter: { label: "Letter", w: 215.9, h: 279.4 },
  Legal: { label: "Legal", w: 215.9, h: 355.6 },
  Executive: { label: "Executive", w: 184.15, h: 266.7 },
  Tabloid: { label: "Tabloid", w: 279.4, h: 431.8 },
  Ledger: { label: "Ledger", w: 431.8, h: 279.4 },
};
export type Unit = "mm" | "cm" | "in";
export const toUnit = (mm: number, u: Unit) => (u === "cm" ? mm / 10 : u === "in" ? mm / 25.4 : mm);
export const fromUnit = (v: number, u: Unit) => (u === "cm" ? v * 10 : u === "in" ? v * 25.4 : v);

export type ElementKind = "text" | "image" | "line" | "rect" | "qr";
export type TemplateElement = {
  id: string;
  kind: ElementKind;
  // Where: the header or footer band of the first page or of the later pages, or the page itself (behind the text).
  zone: "header-first" | "header-rest" | "header-even" | "footer-first" | "footer-rest" | "footer-even" | "page";
  x: number;
  y: number;
  w: number;
  h: number;
  // Text with {{fields}} (text), an image (data URL, or "logo" for the company logo), colours and lines.
  text?: string;
  src?: string;
  size?: number;
  weight?: 400 | 600 | 700;
  italic?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  opacity?: number;
  locked?: boolean;
};

export type SignatureLayout = "row" | "grid" | "column" | "left" | "right" | "center";
export type TemplateLayout = {
  page: { size: string; orientation: "portrait" | "landscape"; w: number; h: number; unit: Unit; margins: { top: number; right: number; bottom: number; left: number }; duplex?: boolean; bleed?: number };
  // Band heights (mm) at the top and bottom of the page that the letter text never enters.
  header: { first: number; rest: number };
  footer: { first: number; rest: number };
  differentFirst: boolean;
  // Even pages get their own header and footer (in the Word file; the PDF uses the later-pages ones).
  oddEven?: boolean;
  font: { family: string; size: number; color: string; lineHeight: number };
  colors: { primary: string; accent: string };
  watermark: { text: string; opacity: number; angle: number; size: number } | null;
  border: { style: "none" | "solid" | "double"; width: number; color: string; inset: number };
  background: string | null;
  elements: TemplateElement[];
  // The parts of the letter between the letterhead and the text (reference, date, recipient, subject) and where the
  // signatures go.
  blocks: { refDate: boolean; recipient: boolean; subject: boolean; classificationLabel: boolean; pageNumbers: boolean };
  signatures: { layout: SignatureLayout; placement: "end" | "own-page"; showDate: boolean; showCapacity: boolean };
  // Fields this template asks for when a letter is written, beyond the standard ones.
  fields: { key: string; label: string; default?: string }[];
};

export const STANDARD_FIELDS: { key: string; label: string }[] = [
  { key: "company_name", label: "Company name" },
  { key: "company_address", label: "Company address" },
  { key: "company_phone", label: "Company phone" },
  { key: "company_email", label: "Company email" },
  { key: "company_website", label: "Company website" },
  { key: "company_registration", label: "Company registration number" },
  { key: "company_tin", label: "Company tax ID" },
  { key: "document_number", label: "Reference number" },
  { key: "document_id", label: "Document ID" },
  { key: "issue_date", label: "Issue date" },
  { key: "recipient_name", label: "Recipient name" },
  { key: "recipient_title", label: "Recipient position" },
  { key: "recipient_company", label: "Recipient organisation" },
  { key: "recipient_address", label: "Recipient address" },
  { key: "recipient_email", label: "Recipient email" },
  { key: "subject", label: "Subject" },
  { key: "department", label: "Department" },
  { key: "category", label: "Letter category" },
  { key: "classification", label: "Classification" },
  { key: "prepared_by", label: "Prepared by" },
  { key: "approved_by", label: "Approved by" },
  { key: "signatory_name", label: "Signatory name" },
  { key: "signatory_position", label: "Signatory position" },
  { key: "page", label: "Page number" },
  { key: "pages", label: "Number of pages" },
];

// {{field}} replaced from the values given; unknown fields stay visible so a missing value is noticed.
export function fillFields(text: string, values: Record<string, string | null | undefined>) {
  return text.replace(/\{\{\s*([a-z0-9_]{1,40})\s*\}\}/gi, (m, k: string) => {
    const v = values[k.toLowerCase()];
    return v == null || v === "" ? (k === "document_number" ? "(given when issued)" : m) : v;
  });
}

export const eid = () => Math.random().toString(36).slice(2, 10);

// A letterhead much like the Tools one: logo and name on the left, contacts on the right, a coloured rule, and a
// footer with the address and the document's identity.
export function defaultLayout(size = "A4"): TemplateLayout {
  const p = PAPER_SIZES[size] ?? PAPER_SIZES.A4!;
  const W = p.w;
  const H = p.h;
  return {
    page: { size, orientation: "portrait", w: W, h: H, unit: "mm", margins: { top: 20, right: 20, bottom: 18, left: 20 } },
    header: { first: 38, rest: 16 },
    footer: { first: 18, rest: 14 },
    differentFirst: true,
    font: { family: "Segoe UI, Arial, 'Noto Sans Ethiopic', sans-serif", size: 11, color: "#111827", lineHeight: 1.5 },
    colors: { primary: "#16a34a", accent: "#0f172a" },
    watermark: null,
    border: { style: "none", width: 0.5, color: "#94a3b8", inset: 8 },
    background: null,
    elements: [
      { id: eid(), kind: "image", zone: "header-first", x: 20, y: 10, w: 18, h: 18, src: "logo", locked: true },
      { id: eid(), kind: "text", zone: "header-first", x: 41, y: 11, w: 90, h: 9, text: "{{company_name}}", size: 16, weight: 700, color: "#0f172a", locked: true },
      { id: eid(), kind: "text", zone: "header-first", x: 41, y: 20, w: 90, h: 6, text: "", size: 8.5, color: "#64748b" },
      { id: eid(), kind: "text", zone: "header-first", x: W - 90, y: 11, w: 70, h: 18, text: "{{company_address}}\n{{company_phone}}\n{{company_email}}\n{{company_website}}", size: 8, align: "right", color: "#475569" },
      { id: eid(), kind: "line", zone: "header-first", x: 20, y: 31, w: W - 40, h: 0, stroke: "#16a34a", strokeWidth: 1, locked: true },
      { id: eid(), kind: "text", zone: "header-rest", x: 20, y: 8, w: W - 40, h: 5, text: "{{company_name}} · {{document_number}}", size: 8, color: "#64748b" },
      { id: eid(), kind: "line", zone: "header-rest", x: 20, y: 14, w: W - 40, h: 0, stroke: "#cbd5e1", strokeWidth: 0.4 },
      { id: eid(), kind: "line", zone: "footer-first", x: 20, y: H - 16, w: W - 40, h: 0, stroke: "#16a34a", strokeWidth: 0.6 },
      { id: eid(), kind: "text", zone: "footer-first", x: 20, y: H - 14, w: W - 62, h: 9, text: "{{company_name}} · {{company_address}}\nDocument ID {{document_id}} · {{document_number}}", size: 7, color: "#64748b" },
      { id: eid(), kind: "qr", zone: "footer-first", x: W - 36, y: H - 15.5, w: 14, h: 14 },
      { id: eid(), kind: "text", zone: "footer-rest", x: 20, y: H - 10, w: W - 40, h: 5, text: "{{document_number}} · page {{page}}", size: 7, align: "right", color: "#64748b" },
    ],
    blocks: { refDate: true, recipient: true, subject: true, classificationLabel: true, pageNumbers: true },
    signatures: { layout: "row", placement: "end", showDate: true, showCapacity: true },
    fields: [],
  };
}

// The page size after orientation.
export function pageSize(l: TemplateLayout) {
  const p = PAPER_SIZES[l.page.size];
  const w = l.page.size === "custom" || !p ? l.page.w : p.w;
  const h = l.page.size === "custom" || !p ? l.page.h : p.h;
  return l.page.orientation === "landscape" ? { w: Math.max(w, h), h: Math.min(w, h) } : { w: Math.min(w, h), h: Math.max(w, h) };
}

const num = (v: unknown, d: number, lo = -5000, hi = 5000) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const color = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const ZONES = ["header-first", "header-rest", "header-even", "footer-first", "footer-rest", "footer-even", "page"] as const;
const KINDS: ElementKind[] = ["text", "image", "line", "rect", "qr"];
const IMG = /^(logo|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+)$/;

// Makes a layout from the browser safe to keep: known keys only, numbers in range, colours as hex, pictures as data.
export function cleanLayout(input: unknown): TemplateLayout {
  const d = defaultLayout();
  const x = (input ?? {}) as Partial<TemplateLayout>;
  const pg = (x.page ?? {}) as Partial<TemplateLayout["page"]>;
  const m = (pg.margins ?? {}) as Partial<TemplateLayout["page"]["margins"]>;
  const size = typeof pg.size === "string" && (pg.size in PAPER_SIZES || pg.size === "custom") ? pg.size : "A4";
  const els = Array.isArray(x.elements) ? x.elements.slice(0, 200) : [];
  const out: TemplateLayout = {
    page: {
      size,
      orientation: pg.orientation === "landscape" ? "landscape" : "portrait",
      w: num(pg.w, PAPER_SIZES[size]?.w ?? 210, 50, 1500),
      h: num(pg.h, PAPER_SIZES[size]?.h ?? 297, 50, 1500),
      unit: pg.unit === "cm" || pg.unit === "in" ? pg.unit : "mm",
      margins: { top: num(m.top, 20, 0, 200), right: num(m.right, 20, 0, 200), bottom: num(m.bottom, 18, 0, 200), left: num(m.left, 20, 0, 200) },
      duplex: !!pg.duplex,
      bleed: num(pg.bleed, 0, 0, 10),
    },
    header: { first: num(x.header?.first, d.header.first, 0, 300), rest: num(x.header?.rest, d.header.rest, 0, 300) },
    footer: { first: num(x.footer?.first, d.footer.first, 0, 300), rest: num(x.footer?.rest, d.footer.rest, 0, 300) },
    differentFirst: x.differentFirst !== false,
    oddEven: !!x.oddEven,
    font: { family: String(x.font?.family ?? d.font.family).replace(/[;{}<>]/g, "").slice(0, 120), size: num(x.font?.size, 11, 6, 30), color: color(x.font?.color, d.font.color), lineHeight: num(x.font?.lineHeight, 1.5, 1, 3) },
    colors: { primary: color(x.colors?.primary, d.colors.primary), accent: color(x.colors?.accent, d.colors.accent) },
    watermark: x.watermark && String(x.watermark.text ?? "").trim() ? { text: String(x.watermark.text).slice(0, 40), opacity: num(x.watermark.opacity, 0.08, 0, 1), angle: num(x.watermark.angle, -30, -90, 90), size: num(x.watermark.size, 70, 10, 200) } : null,
    border: { style: x.border?.style === "solid" || x.border?.style === "double" ? x.border.style : "none", width: num(x.border?.width, 0.5, 0, 5), color: color(x.border?.color, "#94a3b8"), inset: num(x.border?.inset, 8, 0, 50) },
    background: typeof x.background === "string" && IMG.test(x.background) && x.background !== "logo" && x.background.length < 3_000_000 ? x.background : null,
    elements: els
      .map((e): TemplateElement | null => {
        const k = (e ?? {}) as Partial<TemplateElement>;
        if (!KINDS.includes(k.kind as ElementKind)) return null;
        const src = typeof k.src === "string" && IMG.test(k.src) && k.src.length < 2_000_000 ? k.src : undefined;
        if (k.kind === "image" && !src) return null;
        return {
          id: /^[a-z0-9]{4,20}$/i.test(String(k.id)) ? String(k.id) : eid(),
          kind: k.kind as ElementKind,
          zone: (ZONES as readonly string[]).includes(String(k.zone)) ? (k.zone as TemplateElement["zone"]) : "page",
          x: num(k.x, 0),
          y: num(k.y, 0),
          w: num(k.w, 20, 0, 1500),
          h: num(k.h, 10, 0, 1500),
          text: k.kind === "text" ? String(k.text ?? "").slice(0, 2000) : undefined,
          src,
          size: num(k.size, 10, 4, 120),
          weight: k.weight === 600 || k.weight === 700 ? k.weight : 400,
          italic: !!k.italic,
          align: k.align === "center" || k.align === "right" ? k.align : "left",
          color: color(k.color, "#111827"),
          fill: k.fill ? color(k.fill, "#ffffff") : undefined,
          stroke: k.stroke ? color(k.stroke, "#111827") : undefined,
          strokeWidth: num(k.strokeWidth, 0.5, 0, 20),
          radius: num(k.radius, 0, 0, 100),
          opacity: num(k.opacity, 1, 0, 1),
          locked: !!k.locked,
        };
      })
      .filter((e): e is TemplateElement => !!e),
    blocks: { refDate: x.blocks?.refDate !== false, recipient: x.blocks?.recipient !== false, subject: x.blocks?.subject !== false, classificationLabel: x.blocks?.classificationLabel !== false, pageNumbers: x.blocks?.pageNumbers !== false },
    signatures: {
      layout: (["row", "grid", "column", "left", "right", "center"] as const).includes(x.signatures?.layout as SignatureLayout) ? (x.signatures!.layout as SignatureLayout) : "row",
      placement: x.signatures?.placement === "own-page" ? "own-page" : "end",
      showDate: x.signatures?.showDate !== false,
      showCapacity: x.signatures?.showCapacity !== false,
    },
    fields: (Array.isArray(x.fields) ? x.fields : [])
      .slice(0, 40)
      .map((f) => ({ key: String(f?.key ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40), label: String(f?.label ?? "").slice(0, 80), default: f?.default ? String(f.default).slice(0, 400) : undefined }))
      .filter((f) => f.key && f.label && !STANDARD_FIELDS.some((s) => s.key === f.key)),
  };
  return out;
}
