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

// Office-standard page geometry (A4, millimetres): 22 mm side margins, the letterhead in the top 34 mm, the
// recipient block where a window envelope shows it (about 50 mm from the top), and a three-column footer.
const W = 210;
const H = 297;
const M = 22;
const CW = W - 2 * M;
const MUTED = "#64748b";
const INK = "#1f2937";
const FONT = "Inter";

function footer(b: Brand, dark: boolean): DElement[] {
  const color = dark ? "#e2e8f0" : MUTED;
  const y = H - 17;
  const legal = [b.company, b.footer].filter(Boolean).join("\n");
  const where = b.address || "";
  const reach = [b.phone, b.email, b.website].filter(Boolean).join("\n");
  return [
    ...(dark ? [lock(shapeEl("rect", 0, H - 22, W, 22, { fill: b.accent }), "footer band")] : [lock(line(M, y - 3, CW, "#cbd5e1", 0.3), "footer rule")]),
    lock(textEl(legal, M, y, 60, 11, { size: 6.8, color, lineHeight: 1.35, font: FONT }), "footer, company"),
    lock(textEl(where, M + 62, y, 50, 11, { size: 6.8, color, lineHeight: 1.35, font: FONT, align: "center" }), "footer, address"),
    lock(textEl(reach, M + 114, y, CW - 114, 11, { size: 6.8, color, lineHeight: 1.35, font: FONT, align: "right" }), "footer, contacts"),
  ];
}

function letterhead(b: Brand, style: string): DElement[] {
  const contacts = [b.address, b.phone, b.email, b.website].filter(Boolean).join("\n");
  if (style === "modern")
    return [
      lock(shapeEl("rect", 0, 0, W, 32, { fill: b.primary }), "band"),
      lock(shapeEl("rect", 0, 32, W, 1.2, { fill: b.accent }), "band rule"),
      ...(b.hasLogo ? [lock(shapeEl("rect", M - 1.5, 6.5, 19, 19, { fill: "#ffffff", radius: 3 }), "logo tile"), lock(img(M, 8, 16, 16), "logo")] : []),
      lock(textEl(b.company, b.hasLogo ? M + 20 : M, 9, 100, 9, { size: 17, weight: 700, color: "#ffffff", font: FONT }), "name"),
      ...(b.tagline ? [lock(textEl(b.tagline, b.hasLogo ? M + 20 : M, 18.5, 100, 6, { size: 8, color: "#ecfdf5", font: FONT }), "tagline")] : []),
      lock(textEl(contacts, W - M - 64, 8, 64, 18, { size: 7.2, color: "#ffffff", align: "right", lineHeight: 1.35, font: FONT }), "contacts"),
      ...footer(b, true),
    ];
  if (style === "memo")
    return [
      ...(b.hasLogo ? [lock(img(M, 14, 13, 13), "logo")] : []),
      lock(textEl(b.company, b.hasLogo ? M + 16 : M, 15.5, 100, 7, { size: 11.5, weight: 700, color: b.accent, font: FONT }), "name"),
      lock(textEl(contacts.replace(/\n/g, " · "), b.hasLogo ? M + 16 : M, 21.5, 120, 5, { size: 7, color: MUTED, font: FONT }), "contacts"),
      lock(textEl("MEMORANDUM", W - M - 70, 14, 70, 10, { size: 17, weight: 800, color: b.primary, align: "right", letterSpacing: 2.5, font: FONT }), "title"),
      lock(line(M, 31, CW, b.primary, 0.8), "rule"),
      ...footer(b, false),
    ];
  if (style === "notice")
    return [
      lock(shapeEl("rect", 12, 12, W - 24, H - 24, { fill: null, stroke: b.primary, strokeWidth: 0.8 }), "frame"),
      lock(shapeEl("rect", 14.5, 14.5, W - 29, H - 29, { fill: null, stroke: b.accent, strokeWidth: 0.25 }), "inner frame"),
      ...(b.hasLogo ? [lock(img(W / 2 - 9, 22, 18, 18), "logo")] : []),
      lock(textEl(b.company, M, 42, CW, 8, { size: 13, weight: 700, color: b.accent, align: "center", font: FONT }), "name"),
      lock(textEl("NOTICE", M, 52, CW, 13, { size: 26, weight: 800, color: b.primary, align: "center", letterSpacing: 5, font: FONT }), "title"),
      lock(line(W / 2 - 25, 68, 50, b.primary, 0.6), "rule"),
      lock(textEl([b.address, b.phone, b.website].filter(Boolean).join("  ·  "), M, H - 26, CW, 5, { size: 7, color: MUTED, align: "center", font: FONT }), "footer"),
    ];
  // Classic: logo and name on the left, contacts on the right, a fine rule in the brand colour, three-column footer.
  return [
    ...(b.hasLogo ? [lock(img(M, 11, 17, 17), "logo")] : []),
    lock(textEl(b.company, b.hasLogo ? M + 21 : M, 12, 96, 8.5, { size: 15.5, weight: 700, color: b.accent, font: FONT }), "name"),
    ...(b.tagline ? [lock(textEl(b.tagline, b.hasLogo ? M + 21 : M, 21, 96, 5, { size: 7.8, color: MUTED, font: FONT }), "tagline")] : []),
    lock(textEl(contacts, W - M - 66, 11, 66, 18, { size: 7.2, color: "#475569", align: "right", lineHeight: 1.4, font: FONT }), "contacts"),
    lock(line(M, 32, CW, b.primary, 0.7), "rule"),
    lock(line(M, 33.2, 34, b.accent, 0.7), "accent"),
    ...footer(b, false),
  ];
}

// A letter as a design: the letterhead (locked), the reference and date, the recipient, the subject, the text, and
// the signature and stamp places.
// qr: Correspondence letters carry a verification code; letters from the Tools do not.
export function letterDesign(b: Brand, l: LetterParts, style: "classic" | "modern" | "memo" | "notice" | "certificate" = "classic", qr = false): Design {
  if (style === "certificate") return certificateDesign(b, l);
  const els: DElement[] = [...letterhead(b, style)];
  const body = { size: 10.5, lineHeight: 1.5, color: INK, font: FONT } as const;
  const bottom = style === "modern" ? H - 26 : H - 24;
  if (style === "memo") {
    const rows: [string, string][] = [["To", l.to.split("\n")[0] ?? ""], ["From", `${l.signName}${l.signTitle ? `, ${l.signTitle}` : ""}`], ["Date", l.date], ["Subject", l.subject]];
    rows.forEach(([k, v], i) => {
      els.push(textEl(`${k}:`, M, 38 + i * 7.5, 22, 6, { size: 10, weight: 700, color: "#334155", font: FONT }), textEl(v, M + 24, 38 + i * 7.5, CW - 24, 6, { size: 10, color: INK, font: FONT }));
    });
    els.push(line(M, 70, CW, "#cbd5e1", 0.3));
    const mt = [l.body, l.closing].filter(Boolean).join("\n\n");
    const mh = Math.max(30, Math.min(bottom - 76 - 34, Math.ceil(mt.length / 100 + mt.split("\n").length) * 5.6));
    els.push({ ...textEl(mt, M, 76, CW, mh, { ...body }), name: "Letter text" } as DElement);
    els.push(slot("signature", M, 80 + mh, 48, 15, "Signature"), textEl(`${l.signName}\n${l.signTitle}`, M, 96 + mh, 90, 10, { size: 9.5, weight: 600, color: INK, lineHeight: 1.35, font: FONT }));
    return { v: 1, w: W, h: H, unit: "mm", pages: [page(els)] };
  }
  const top = style === "modern" ? 42 : style === "notice" ? 76 : 40;
  // Reference and date on one line, then the recipient in the envelope window.
  els.push(
    textEl(`Ref: ${l.ref || "—"}`, M, top, 90, 5.5, { size: 9, color: "#475569", font: FONT }),
    textEl(`Date: ${l.date}`, W - M - 80, top, 80, 5.5, { size: 9, color: "#475569", align: "right", font: FONT }),
  );
  let y = top + 9;
  if (style !== "notice") {
    els.push(textEl(l.to, M, y, 95, 24, { size: 10.5, lineHeight: 1.4, color: INK, font: FONT }));
    y += 30;
  }
  if (l.subject) {
    els.push(textEl(`Subject: ${l.subject}`, M, y, CW, 6.5, { size: 11, weight: 700, color: INK, font: FONT }));
    y += 10;
  }
  const text = [l.salutation, l.body, l.closing].filter(Boolean).join("\n\n");
  const room = bottom - y - 44;
  const need = Math.ceil(text.length / 100 + text.split("\n").length) * 5.6;
  const bodyH = Math.max(30, Math.min(room, need));
  els.push({ ...textEl(text, M, y, CW, bodyH, { ...body }), name: "Letter text" } as DElement);
  y += bodyH + 4;
  // Signature block: the signature over a line, the stamp beside it, name and position under it.
  els.push(slot("signature", M, y, 50, 16, "Signature"), slot("stamp", M + 46, y - 6, 30, 30, "Stamp"));
  els.push(line(M, y + 17, 58, "#334155", 0.25), textEl(`${l.signName}\n${l.signTitle}`, M, y + 18.5, 100, 11, { size: 10, weight: 600, color: INK, lineHeight: 1.35, font: FONT }));
  const extra = [l.enclosures && `Enclosures: ${l.enclosures}`, l.cc && `CC: ${l.cc}`].filter(Boolean).join("\n");
  if (extra) els.push(textEl(extra, M, y + 31, CW - 30, 8, { size: 8, color: MUTED, font: FONT }));
  if (qr) els.push({ id: did(), kind: "qr", x: W - M - 16, y: bottom - 22, w: 16, h: 16, rotate: 0, opacity: 1, name: "Verification QR" } as DElement, textEl("Scan to verify", W - M - 26, bottom - 5.5, 26, 4, { size: 6, color: MUTED, align: "right", font: FONT }));
  return { v: 1, w: W, h: H, unit: "mm", pages: [page(els)] };
}

export function certificateDesign(b: Brand, l: Partial<LetterParts> & { name?: string; course?: string } = {}): Design {
  const W = 297;
  const H = 210;
  const body = l.body?.split("\n").filter(Boolean) ?? [];
  // Corner ornaments: short brand-coloured strokes at each inner corner.
  const corner = (x: number, y: number, right: boolean, down: boolean): DElement[] => [
    lock(shapeEl("rect", right ? x : x - 18, y, 18, 0.9, { fill: b.primary }), "corner"),
    lock(shapeEl("rect", right ? x : x - 0.9, down ? y : y - 17.1, 0.9, 18, { fill: b.primary }), "corner"),
  ];
  return {
    v: 1,
    w: W,
    h: H,
    unit: "mm",
    pages: [
      page([
        lock(shapeEl("rect", 9, 9, W - 18, H - 18, { fill: null, stroke: b.accent, strokeWidth: 0.35 }), "frame"),
        ...corner(14, 14, true, true),
        ...corner(W - 14, 14, false, true),
        ...corner(14, H - 14.9, true, false),
        ...corner(W - 14, H - 14.9, false, false),
        ...(b.hasLogo ? [lock(img(W / 2 - 10, 20, 20, 20), "logo")] : []),
        lock(textEl(b.company.toUpperCase(), 30, 43, W - 60, 7, { size: 11, weight: 600, color: b.accent, align: "center", letterSpacing: 2.5, font: "Inter" }), "name"),
        textEl(l.subject || "Certificate of Completion", 30, 56, W - 60, 16, { size: 32, weight: 700, font: "Playfair Display", color: b.primary, align: "center" }),
        textEl(l.salutation || "This is to certify that", 30, 77, W - 60, 8, { size: 12.5, color: "#475569", align: "center", italic: true, font: "Inter" }),
        textEl(l.name || body[0] || "Full Name", 30, 88, W - 60, 16, { size: 30, weight: 700, font: "Merriweather", color: "#0f172a", align: "center" }),
        line(W / 2 - 65, 107, 130, b.primary, 0.4),
        textEl(body.slice(1).join("\n") || l.course || "has successfully completed the programme.", 45, 112, W - 90, 16, { size: 12.5, color: "#334155", align: "center", lineHeight: 1.45, font: "Inter" }),
        // Signature on the left, the seal in the middle, the date on the right.
        slot("signature", 46, 143, 64, 17, "Signature"),
        line(46, 161, 64, "#0f172a", 0.3),
        textEl(`${l.signName || "Name"}\n${l.signTitle || "Position"}`, 40, 163, 76, 11, { size: 9.5, weight: 600, align: "center", lineHeight: 1.3, color: "#1f2937", font: "Inter" }),
        slot("stamp", W / 2 - 16, 141, 32, 32, "Seal"),
        textEl(l.date || "{{issue_date}}", W - 110, 154, 64, 6, { size: 11, align: "center", color: "#1f2937", font: "Inter" }),
        line(W - 110, 161, 64, "#0f172a", 0.3),
        textEl("Date", W - 110, 163, 64, 5, { size: 9.5, weight: 600, align: "center", color: "#1f2937", font: "Inter" }),
        { id: did(), kind: "qr", x: W - 36, y: H - 36, w: 15, h: 15, rotate: 0, opacity: 1 } as DElement,
        textEl(`No. ${l.ref || "{{document_number}}"}`, 22, H - 24, 90, 5, { size: 7.5, color: "#64748b", font: "Inter" }),
      ]),
    ],
  };
}

// The template gallery of the design editor.
export function designGallery(b: Brand) {
  const sample: LetterParts = { ref: "{{document_number}}", date: "{{issue_date}}", to: "{{recipient_name}}\n{{recipient_title}}\n{{recipient_company}}", subject: "Subject of the letter", salutation: "Dear Sir/Madam,", body: "Type the letter here. Double-click any text to change it, drag things to move them, and use Insert on the ribbon to add pictures, shapes, tables and icons.", closing: "Yours sincerely,", signName: "Name", signTitle: "Position" };
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
