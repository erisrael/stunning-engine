// Starting designs for the design editor, drawn from the company letterhead (name, colours, contacts, logo):
// letters in several styles (the letterhead parts are named "Letterhead…" so Admin can lock them), certificates,
// invitations, notices, flyers, business cards, social posts and slides.

import { did, shapeEl, textEl, type DElement, type Design, type DPage } from "./design";

export type Brand = { company: string; tagline?: string; address?: string; phone?: string; email?: string; website?: string; footer?: string; primary: string; accent: string; hasLogo?: boolean };
export type LetterParts = { ref: string; date: string; to: string; subject: string; salutation: string; body: string; closing: string; signName: string; signTitle: string; cc?: string; enclosures?: string };

const lock = (e: DElement, name: string): DElement => ({ ...e, locked: true, name: `Letterhead: ${name}` });
const contacts = (b: Brand) => [b.address, b.phone, b.email, b.website].filter(Boolean).join("\n");
const page = (elements: DElement[], bg = "#ffffff"): DPage => ({ id: did(), bg, elements });
const img = (x: number, y: number, w: number, h: number, name?: string): DElement => ({ id: did(), kind: "image", src: "logo", fit: "contain", x, y, w, h, rotate: 0, opacity: 1, name }) as DElement;
const line = (x: number, y: number, w: number, stroke: string, width = 0.6): DElement => ({ id: did(), kind: "line", stroke, strokeWidth: width, x, y, w, h: 0.01, rotate: 0, opacity: 1 }) as DElement;
const slot = (s: "signature" | "stamp" | "date" | "reference", x: number, y: number, w: number, h: number, label: string): DElement => ({ id: did(), kind: "slot", slot: s, label, x, y, w, h, rotate: 0, opacity: 1 }) as DElement;

function letterhead(b: Brand, style: string): DElement[] {
  if (style === "modern")
    return [
      lock(shapeEl("rect", 0, 0, 210, 34, { fill: b.primary }), "band"),
      ...(b.hasLogo ? [lock(img(16, 7, 20, 20), "logo")] : []),
      lock(textEl(b.company, b.hasLogo ? 40 : 16, 9, 110, 10, { size: 18, weight: 700, color: "#ffffff", font: "Montserrat" }), "name"),
      ...(b.tagline ? [lock(textEl(b.tagline, b.hasLogo ? 40 : 16, 20, 110, 6, { size: 8.5, color: "#ecfdf5" }), "tagline")] : []),
      lock(textEl(contacts(b), 130, 8, 64, 20, { size: 7.5, color: "#ffffff", align: "right", lineHeight: 1.3 }), "contacts"),
      lock(shapeEl("rect", 0, 287, 210, 10, { fill: b.accent }), "footer band"),
      lock(textEl(b.footer || [b.company, b.address, b.website].filter(Boolean).join(" · "), 14, 289, 182, 6, { size: 7, color: "#ffffff", align: "center", valign: "middle" }), "footer"),
    ];
  if (style === "memo")
    return [
      ...(b.hasLogo ? [lock(img(18, 12, 16, 16), "logo")] : []),
      lock(textEl(b.company, b.hasLogo ? 38 : 18, 14, 120, 8, { size: 13, weight: 700, color: b.accent }), "name"),
      lock(textEl("MEMORANDUM", 120, 13, 72, 10, { size: 20, weight: 800, color: b.primary, align: "right", letterSpacing: 2 }), "title"),
      lock(line(18, 31, 174, b.primary, 1.2), "rule"),
      lock(textEl(b.footer || b.company, 18, 284, 174, 6, { size: 7, color: "#64748b", align: "center" }), "footer"),
    ];
  if (style === "notice")
    return [
      lock(shapeEl("rect", 12, 12, 186, 273, { fill: null, stroke: b.primary, strokeWidth: 1.2 }), "frame"),
      ...(b.hasLogo ? [lock(img(95, 18, 20, 20), "logo")] : []),
      lock(textEl(b.company, 20, 40, 170, 9, { size: 15, weight: 700, color: b.accent, align: "center" }), "name"),
      lock(textEl("NOTICE", 20, 51, 170, 14, { size: 30, weight: 800, color: b.primary, align: "center", letterSpacing: 4 }), "title"),
      lock(line(60, 68, 90, b.primary, 0.8), "rule"),
    ];
  // Classic: logo and name on the left, contacts on the right, a coloured rule, a footer with a thin rule.
  return [
    ...(b.hasLogo ? [lock(img(20, 11, 18, 18), "logo")] : []),
    lock(textEl(b.company, b.hasLogo ? 41 : 20, 12, 92, 9, { size: 16, weight: 700, color: b.accent }), "name"),
    ...(b.tagline ? [lock(textEl(b.tagline, b.hasLogo ? 41 : 20, 21, 92, 5, { size: 8, color: "#64748b" }), "tagline")] : []),
    lock(textEl(contacts(b), 122, 11, 68, 19, { size: 7.5, color: "#475569", align: "right", lineHeight: 1.3 }), "contacts"),
    lock(line(20, 32, 170, b.primary, 1), "rule"),
    lock(line(20, 281, 170, b.primary, 0.5), "footer rule"),
    lock(textEl(b.footer || [b.company, b.address, b.website].filter(Boolean).join(" · "), 20, 283, 150, 8, { size: 7, color: "#64748b" }), "footer"),
  ];
}

// A letter as a design: the letterhead (locked), the reference and date, the recipient, the subject, the text, and
// the signature and stamp places.
export function letterDesign(b: Brand, l: LetterParts, style: "classic" | "modern" | "memo" | "notice" | "certificate" = "classic"): Design {
  if (style === "certificate") return certificateDesign(b, l);
  const top = style === "modern" ? 44 : style === "notice" ? 76 : 40;
  const els: DElement[] = [...letterhead(b, style)];
  if (style === "memo") {
    els.push(textEl(`To:\nFrom:\nDate:\nSubject:`, 20, top, 24, 26, { size: 10.5, weight: 700, lineHeight: 1.55 }), textEl(`${l.to.split("\n")[0] ?? ""}\n${l.signName}${l.signTitle ? `, ${l.signTitle}` : ""}\n${l.date}\n${l.subject}`, 44, top, 146, 26, { size: 10.5, lineHeight: 1.55 }), line(20, top + 30, 170, "#cbd5e1", 0.4));
    els.push(textEl([l.body, l.closing].filter(Boolean).join("\n\n"), 20, top + 36, 170, 150, { size: 11, lineHeight: 1.5, align: "justify", name: "Letter text" } as never));
    els.push(slot("signature", 20, top + 192, 50, 16, "Signature"), textEl(`${l.signName}\n${l.signTitle}`, 20, top + 210, 90, 12, { size: 10, lineHeight: 1.35 }));
    return { v: 1, w: 210, h: 297, unit: "mm", pages: [page(els)] };
  }
  els.push(
    textEl(`Ref: ${l.ref || "—"}`, 20, top, 90, 6, { size: 10, color: "#334155" }),
    textEl(`Date: ${l.date}`, 110, top, 80, 6, { size: 10, color: "#334155", align: "right" }),
    textEl(l.to, 20, top + 10, 110, 24, { size: 10.5, lineHeight: 1.4 }),
  );
  let y = top + 38;
  if (l.subject) {
    els.push(textEl(`Subject: ${l.subject}`, 20, y, 170, 7, { size: 11, weight: 700, underline: true }));
    y += 11;
  }
  const text = [l.salutation, l.body, l.closing].filter(Boolean).join("\n\n");
  const lines = Math.max(8, Math.ceil(text.length / 95) + text.split("\n").length);
  const bodyH = Math.min(style === "modern" ? 165 : 170, lines * 5.4);
  els.push({ ...textEl(text, 20, y, 170, bodyH, { size: 11, lineHeight: 1.5, align: "justify" }), name: "Letter text" } as DElement);
  y += bodyH + 6;
  els.push(slot("signature", 20, y, 52, 18, "Signature"), slot("stamp", 62, y - 4, 30, 30, "Stamp"));
  els.push(line(20, y + 19, 55, "#0f172a", 0.3), textEl(`${l.signName}\n${l.signTitle}`, 20, y + 21, 100, 12, { size: 10.5, weight: 600, lineHeight: 1.35 }));
  const extra = [l.enclosures && `Enclosures: ${l.enclosures}`, l.cc && `CC: ${l.cc}`].filter(Boolean).join("\n");
  if (extra) els.push(textEl(extra, 20, y + 36, 170, 10, { size: 8.5, color: "#475569" }));
  els.push({ id: did(), kind: "qr", x: 172, y: style === "modern" ? 263 : 259, w: 18, h: 18, rotate: 0, opacity: 1, name: "Verification QR" } as DElement);
  return { v: 1, w: 210, h: 297, unit: "mm", pages: [page(els)] };
}

export function certificateDesign(b: Brand, l: Partial<LetterParts> & { name?: string; course?: string } = {}): Design {
  const W = 297;
  const H = 210;
  const body = l.body?.split("\n").filter(Boolean) ?? [];
  return {
    v: 1,
    w: W,
    h: H,
    unit: "mm",
    pages: [
      page([
        lock(shapeEl("rect", 8, 8, W - 16, H - 16, { fill: null, stroke: b.primary, strokeWidth: 1.6 }), "outer frame"),
        lock(shapeEl("rect", 12, 12, W - 24, H - 24, { fill: null, stroke: b.accent, strokeWidth: 0.4 }), "inner frame"),
        lock(shapeEl("triangle", 8, 8, 40, 40, { fill: b.primary, opacity: 0.12 } as never), "corner"),
        ...(b.hasLogo ? [lock(img(W / 2 - 12, 20, 24, 24), "logo")] : []),
        lock(textEl(b.company, 30, 46, W - 60, 8, { size: 13, weight: 600, color: b.accent, align: "center", letterSpacing: 1 }), "name"),
        textEl(l.subject || "Certificate of completion", 30, 60, W - 60, 16, { size: 34, weight: 700, font: "Playfair Display", color: b.primary, align: "center" }),
        textEl(l.salutation || "This certifies that", 30, 82, W - 60, 8, { size: 13, color: "#475569", align: "center", italic: true }),
        textEl(l.name || body[0] || "Full name", 30, 93, W - 60, 16, { size: 30, weight: 700, font: "Merriweather", color: "#0f172a", align: "center" }),
        line(W / 2 - 70, 112, 140, b.primary, 0.5),
        textEl(body.slice(1).join("\n") || l.course || "has successfully completed the programme.", 40, 117, W - 80, 18, { size: 13, color: "#334155", align: "center", lineHeight: 1.45 }),
        slot("signature", 50, 148, 60, 18, "Signature"),
        line(45, 168, 70, "#0f172a", 0.3),
        textEl(`${l.signName || "Name"}\n${l.signTitle || "Position"}`, 45, 170, 70, 12, { size: 10, align: "center", lineHeight: 1.3 }),
        slot("stamp", W / 2 - 17, 145, 34, 34, "Stamp"),
        textEl(`Date: ${l.date || "{{issue_date}}"}`, W - 115, 160, 70, 6, { size: 11, align: "center" }),
        textEl(`Certificate no. ${l.ref || "{{document_number}}"}`, W - 115, 168, 70, 6, { size: 9, color: "#64748b", align: "center" }),
        { id: did(), kind: "qr", x: W - 36, y: H - 38, w: 20, h: 20, rotate: 0, opacity: 1 } as DElement,
      ]),
    ],
  };
}

// The template gallery of the design editor.
export function designGallery(b: Brand) {
  const sample: LetterParts = { ref: "{{document_number}}", date: "{{issue_date}}", to: "{{recipient_name}}\n{{recipient_title}}\n{{recipient_company}}", subject: "Subject of the letter", salutation: "Dear Sir/Madam,", body: "Type the letter here. Double-click any text to change it, drag things to move them, and use the panels on the left to add pictures, shapes, tables and icons.", closing: "Yours sincerely,", signName: "Name", signTitle: "Position" };
  const P = b.primary;
  const A = b.accent;
  return [
    { key: "letter-classic", label: "Letter, classic", hint: "Official letter on the letterhead", design: () => letterDesign(b, sample, "classic") },
    { key: "letter-modern", label: "Letter, modern", hint: "Coloured band at the top", design: () => letterDesign(b, sample, "modern") },
    { key: "memo", label: "Memo", hint: "Internal memorandum", design: () => letterDesign(b, { ...sample, salutation: "" }, "memo") },
    { key: "notice", label: "Notice", hint: "Framed notice for a board", design: () => letterDesign(b, { ...sample, salutation: "" }, "notice") },
    { key: "certificate", label: "Certificate", hint: "A4 landscape with frame and seal", design: () => certificateDesign(b, {}) },
    {
      key: "invitation",
      label: "Invitation card",
      hint: "A5 invitation",
      design: (): Design => ({
        v: 1,
        w: 148,
        h: 210,
        unit: "mm",
        pages: [
          page(
            [
              shapeEl("rect", 0, 0, 148, 70, { gradient: `linear-gradient(135deg, ${P}, ${A})`, fill: P }),
              ...(b.hasLogo ? [img(62, 12, 24, 24)] : []),
              textEl("You are invited", 10, 42, 128, 14, { size: 24, weight: 700, color: "#ffffff", align: "center", font: "Playfair Display", italic: true }),
              textEl("{{event_name}}", 10, 84, 128, 12, { size: 20, weight: 700, color: A, align: "center" }),
              textEl("{{event_date}}\n{{venue}}", 10, 100, 128, 16, { size: 12, color: "#334155", align: "center", lineHeight: 1.5 }),
              line(44, 122, 60, P, 0.5),
              textEl("A short line about the event, the programme or the dress code.", 16, 128, 116, 20, { size: 10.5, color: "#475569", align: "center", lineHeight: 1.5 }),
              textEl("Kindly reply to {{contact_person}}", 10, 180, 128, 6, { size: 9, color: "#64748b", align: "center" }),
              textEl(b.company, 10, 192, 128, 6, { size: 9, weight: 700, color: P, align: "center", letterSpacing: 1 }),
            ],
            "#ffffff",
          ),
        ],
      }),
    },
    {
      key: "flyer",
      label: "Flyer",
      hint: "A5 promotional flyer",
      design: (): Design => ({
        v: 1,
        w: 148,
        h: 210,
        unit: "mm",
        pages: [
          page([
            shapeEl("rect", 0, 0, 148, 210, { fill: A }),
            shapeEl("ellipse", 70, -30, 120, 120, { fill: P, opacity: 0.85 } as never),
            textEl("BIG HEADLINE", 12, 70, 124, 30, { size: 34, weight: 800, color: "#ffffff", font: "Montserrat", lineHeight: 1.05 }),
            textEl("A line that says what you offer and why it matters.", 12, 104, 110, 18, { size: 12, color: "#e2e8f0", lineHeight: 1.4 }),
            textEl("First benefit\nSecond benefit\nThird benefit", 12, 128, 110, 26, { size: 12, color: "#ffffff", list: "bullet", lineHeight: 1.5 }),
            shapeEl("pill", 12, 166, 60, 12, { fill: P }),
            textEl("Call to action", 12, 166, 60, 12, { size: 11, weight: 700, color: "#ffffff", align: "center", valign: "middle" }),
            textEl([b.website, b.phone].filter(Boolean).join("  ·  ") || b.company, 12, 192, 124, 6, { size: 9, color: "#cbd5e1" }),
          ]),
        ],
      }),
    },
    {
      key: "card",
      label: "Business card",
      hint: "85 × 55 mm",
      design: (): Design => ({
        v: 1,
        w: 85,
        h: 55,
        unit: "mm",
        pages: [
          page([shapeEl("rect", 0, 0, 6, 55, { fill: P }), ...(b.hasLogo ? [img(64, 6, 14, 14)] : []), textEl("Full name", 12, 14, 60, 7, { size: 13, weight: 700, color: A }), textEl("Position", 12, 22, 60, 5, { size: 8.5, color: P }), textEl(contacts(b) || "Phone\nEmail", 12, 32, 66, 18, { size: 7, color: "#475569", lineHeight: 1.35 })]),
          page([shapeEl("rect", 0, 0, 85, 55, { fill: P }), ...(b.hasLogo ? [img(32.5, 12, 20, 20)] : []), textEl(b.company, 5, 36, 75, 7, { size: 11, weight: 700, color: "#ffffff", align: "center" })]),
        ],
      }),
    },
    {
      key: "post",
      label: "Social post",
      hint: "Square post",
      design: (): Design => ({
        v: 1,
        w: 150,
        h: 150,
        unit: "mm",
        pages: [page([shapeEl("rect", 0, 0, 150, 150, { gradient: `linear-gradient(135deg, ${P}, ${A})`, fill: P }), textEl("Announcement", 15, 50, 120, 24, { size: 30, weight: 800, color: "#ffffff", align: "center", font: "Montserrat" }), textEl("Add the details here", 15, 80, 120, 12, { size: 14, color: "#f1f5f9", align: "center" }), ...(b.hasLogo ? [img(65, 118, 20, 20)] : [])])],
      }),
    },
    {
      key: "slide-title",
      label: "Slide, title",
      hint: "16:9 cover slide",
      design: (): Design => ({
        v: 1,
        w: 254,
        h: 142.875,
        unit: "mm",
        pages: [page([shapeEl("rect", 0, 0, 254, 142.875, { fill: A }), shapeEl("rect", 0, 120, 254, 22.875, { fill: P }), textEl("Presentation title", 20, 40, 214, 22, { size: 40, weight: 800, color: "#ffffff", font: "Montserrat" }), textEl("Subtitle, presenter and date", 20, 66, 214, 10, { size: 16, color: "#cbd5e1" }), ...(b.hasLogo ? [img(218, 124, 16, 16)] : []), textEl(b.company, 20, 126, 150, 8, { size: 12, weight: 600, color: "#ffffff", valign: "middle" })])],
      }),
    },
    {
      key: "slide-content",
      label: "Slide, content",
      hint: "16:9 title and points",
      design: (): Design => ({
        v: 1,
        w: 254,
        h: 142.875,
        unit: "mm",
        pages: [page([shapeEl("rect", 0, 0, 254, 4, { fill: P }), textEl("Slide title", 16, 12, 222, 14, { size: 28, weight: 700, color: A }), textEl("First point\nSecond point\nThird point", 16, 34, 130, 70, { size: 18, list: "bullet", lineHeight: 1.6, color: "#334155" }), shapeEl("rect", 156, 34, 82, 70, { fill: "#f1f5f9", radius: 3 }), textEl("Picture or chart", 156, 64, 82, 10, { size: 12, color: "#94a3b8", align: "center" }), textEl(b.company, 16, 132, 150, 6, { size: 9, color: "#94a3b8" })])],
      }),
    },
  ];
}
