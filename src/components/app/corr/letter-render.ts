// An official letter drawn from its template layout and data. The same functions feed the live preview, the PDF
// (the print dialog, Save as PDF) and the Word file, so what is previewed is what is issued. All text is escaped.
//
// Printing: the page is the template's paper size with no browser margins. The later-pages header and footer are
// fixed, so they repeat on every printed page; the first page's own header and footer sit on top of them on page 1.
// A table header and footer of the band heights keep the text out of the bands on every page. Page numbers come from
// the printer's page counter ("Page 2 of 3").

import { bid, blocksDocx, blocksHtml, esc, inlineHtml, logoBytes, type Block } from "@/components/app/tools/doc-model";
import type { Letterhead } from "@/lib/tools";
import { defaultLayout, fillFields, pageSize, type TemplateElement, type TemplateLayout } from "@/lib/corr-template";
import { cleanDesign, pageHtml, webFontsCss, type Design } from "@/lib/design";

// How signatures and stamps are drawn (Correspondence, Signatures and stamps, Rules); the same as the server's
// SignPolicy, without importing the server.
export type SignLook = { stampPlacement: "over-signature" | "beside-signature" | "below-signature"; stampSize: number; stampOpacity: number; stampRotate: number; signatureHeight: number; showAwaiting: boolean; note: string; showOn: { pdf: boolean; word: boolean; link: boolean; image: boolean } };
const LOOK: SignLook = { stampPlacement: "over-signature", stampSize: 22, stampOpacity: 0.85, stampRotate: -8, signatureHeight: 16, showAwaiting: true, note: "", showOn: { pdf: true, word: true, link: true, image: true } };

export type SignatureBlock = { label: string; name: string; position: string; capacity?: string | null; date?: string | null; status: "awaiting" | "signed" | "rejected" | "delegated" | "expired" | "revoked"; image?: string | null; stamp?: string | null };

export type LetterModel = {
  documentId: string;
  ref: string | null;
  status: string;
  classification: string;
  subject: string;
  category?: string | null;
  department?: string | null;
  entity: { legalName: string; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; registrationNo?: string | null; taxId?: string | null };
  letterhead: Partial<Letterhead>;
  recipients: { kind: string; name?: string | null; title?: string | null; organisation?: string | null; address?: string | null; email?: string | null }[];
  data: { date?: string; salutation?: string; blocks?: unknown[]; closing?: string; signName?: string; signTitle?: string; enclosures?: string; fields?: Record<string, string> };
  externalRef?: string | null;
  inReplyToRef?: string | null;
  preparedBy?: string | null;
  layout?: TemplateLayout | null;
  // Filled when the letter is issued and as the workflow goes: the QR picture (verification) and the signatures.
  qr?: string | null;
  signatures?: SignatureBlock[];
  attachments?: { n: number; name: string }[];
  signLook?: Partial<SignLook>;
};

// The letter for one kind of output: where Admin hides signature pictures (PDF, Word, the shared link, pictures),
// the record of signing stays but the pictures go.
export function forOutput(m: LetterModel, kind: keyof SignLook["showOn"]): LetterModel {
  const look = { ...LOOK, ...(m.signLook ?? {}) };
  if (look.showOn?.[kind] !== false) return m;
  return { ...m, signatures: m.signatures?.map((x) => ({ ...x, image: null, stamp: null })) };
}

function designOf(m: LetterModel): Design | null {
  const d = (m.data as { design?: unknown }).design;
  return d && typeof d === "object" && Array.isArray((d as Design).pages) ? cleanDesign(d) : null;
}
export const hasDesign = (m: LetterModel) => !!designOf(m);

const longDate = (d?: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

export function fieldValues(m: LetterModel): Record<string, string> {
  const to = m.recipients.find((r) => r.kind === "to");
  const signed = m.signatures?.filter((s) => s.status === "signed") ?? [];
  const last = signed.at(-1);
  return {
    company_name: m.entity.legalName || m.letterhead.company || "",
    company_address: m.entity.address ?? m.letterhead.address ?? "",
    company_phone: m.entity.phone ?? m.letterhead.phone ?? "",
    company_email: m.entity.email ?? m.letterhead.email ?? "",
    company_website: m.entity.website ?? m.letterhead.website ?? "",
    company_registration: m.entity.registrationNo ?? "",
    company_tin: m.entity.taxId ?? "",
    document_number: m.ref ?? "",
    document_id: m.documentId,
    issue_date: longDate(m.data.date),
    recipient_name: to?.name ?? "",
    recipient_title: to?.title ?? "",
    recipient_company: to?.organisation ?? "",
    recipient_address: to?.address ?? "",
    recipient_email: to?.email ?? "",
    subject: m.subject,
    department: m.department ?? "",
    category: m.category ?? "",
    classification: m.classification,
    prepared_by: m.preparedBy ?? "",
    approved_by: signed.map((s) => s.name).join(", "),
    signatory_name: last?.name ?? m.data.signName ?? "",
    signatory_position: last?.position ?? m.data.signTitle ?? "",
    page: "",
    pages: "",
    ...(m.data.fields ?? {}),
  };
}

function elementHtml(e: TemplateElement, values: Record<string, string>, m: LetterModel, logo: string) {
  const box = `left:${e.x}mm;top:${e.y}mm;width:${e.w}mm;height:${e.h}mm;opacity:${e.opacity ?? 1}`;
  if (e.kind === "line") return `<div class="cl-el" style="left:${e.x}mm;top:${e.y}mm;width:${e.w}mm;border-top:${e.strokeWidth ?? 0.5}mm solid ${esc(e.stroke ?? "#111827")};opacity:${e.opacity ?? 1}"></div>`;
  if (e.kind === "rect") return `<div class="cl-el" style="${box};background:${esc(e.fill ?? "transparent")};border:${e.stroke ? `${e.strokeWidth ?? 0.3}mm solid ${esc(e.stroke)}` : "0"};border-radius:${e.radius ?? 0}mm"></div>`;
  if (e.kind === "image") return `<img class="cl-el" alt="" src="${esc(e.src === "logo" ? logo : (e.src ?? ""))}" style="${box};object-fit:contain">`;
  if (e.kind === "qr") return m.qr ? `<img class="cl-el" alt="Verification code" src="${esc(m.qr)}" style="${box}">` : `<div class="cl-el cl-qr" style="${box}">QR</div>`;
  const text = inlineHtml(fillFields(e.text ?? "", values).replace(/\n{2,}/g, "\n").replace(/^\n+|\n+$/g, ""));
  return `<div class="cl-el" style="${box};font-size:${e.size ?? 10}pt;font-weight:${e.weight ?? 400};font-style:${e.italic ? "italic" : "normal"};text-align:${e.align ?? "left"};color:${esc(e.color ?? "#111827")};line-height:1.3;overflow:hidden">${text}</div>`;
}

export function signaturesHtml(list0: SignatureBlock[], l: TemplateLayout, look0?: Partial<SignLook>) {
  const look = { ...LOOK, ...(look0 ?? {}) };
  const list = look.showAwaiting ? list0 : list0.filter((x) => x.status === "signed");
  if (!list.length) return "";
  const cols = l.signatures.layout === "column" || l.signatures.layout === "left" || l.signatures.layout === "right" || l.signatures.layout === "center" ? 1 : l.signatures.layout === "grid" ? 2 : Math.min(4, list.length);
  const justify = l.signatures.layout === "right" ? "end" : l.signatures.layout === "center" ? "center" : "start";
  const status: Record<SignatureBlock["status"], string> = { awaiting: "Awaiting signature", signed: "", rejected: "Rejected", delegated: "Delegated", expired: "Expired", revoked: "Signature revoked" };
  return `<div class="cl-sigs" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,${cols === 1 ? "70mm" : "1fr"}));justify-content:${justify};gap:8mm 10mm;margin-top:12mm;page-break-inside:avoid">${list
    .map(
      (s) => `<div class="cl-sig"><div class="cl-sig-label">${esc(s.label)}</div><div class="cl-sig-mark">${
        s.status === "signed" && s.image ? `<img src="${esc(s.image)}" alt="Signature" style="max-height:${look.signatureHeight}mm;max-width:100%">` : s.status === "signed" ? '<span class="cl-signed">Signed electronically</span>' : `<span class="cl-pending">${esc(status[s.status])}</span>`
      }${s.stamp ? `<img class="cl-stamp cl-stamp-${look.stampPlacement}" src="${esc(s.stamp)}" alt="Stamp" style="height:${look.stampSize}mm;opacity:${look.stampOpacity};transform:rotate(${look.stampRotate}deg)">` : ""}</div><div class="cl-line"></div><b>${esc(s.name)}</b><br>${esc(s.position)}${l.signatures.showCapacity && s.capacity ? `<br><i>${esc(s.capacity)}</i>` : ""}${l.signatures.showDate && s.date ? `<br>${esc(longDate(s.date))}` : ""}${s.status === "signed" && look.note ? `<br><span class="cl-small">${esc(look.note)}</span>` : ""}</div>`,
    )
    .join("")}</div>`;
}

export function letterCss(m: LetterModel) {
  const dz = designOf(m);
  if (dz)
    return `${webFontsCss(dz)}
@page{size:${dz.w}mm ${dz.h}mm;margin:0}
.cl-doc.cl-design{position:relative;width:${dz.w}mm}
.cl-design .dz-page{page-break-after:always;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cl-design .dz-page:last-child{page-break-after:auto;break-after:auto}
.cl-design-draft{position:absolute;left:0;right:0;top:35%;text-align:center;font-size:80pt;font-weight:800;color:rgba(220,38,38,.10);transform:rotate(-25deg);pointer-events:none;z-index:5}
@media print{html,body{margin:0}}`;
  const l = m.layout ?? defaultLayout();
  const { w, h } = pageSize(l);
  const primary = hex(m.letterhead.primary, l.colors.primary);
  const foot = Math.max(l.footer.first, l.footer.rest);
  return `
@page{size:${w}mm ${h}mm;margin:0${l.blocks.pageNumbers ? `;@bottom-right{content:"Page " counter(page) " of " counter(pages);font-size:7pt;color:#64748b;margin-right:${l.page.margins.right}mm}` : ""}}
.cl-doc{position:relative;width:${w}mm;font-family:${l.font.family};font-size:${l.font.size}pt;color:${l.font.color};line-height:${l.font.lineHeight}}
.cl-el{position:absolute;white-space:pre-wrap;box-sizing:border-box}
.cl-qr{border:1px dashed #94a3b8;color:#94a3b8;font-size:7pt;display:flex;align-items:center;justify-content:center}
.cl-fixed{position:fixed;left:0;top:0;width:${w}mm;height:${h}mm;pointer-events:none}
.cl-first{position:absolute;left:0;top:0;width:${w}mm;height:${h}mm;pointer-events:none;z-index:2}
.cl-cover{position:absolute;left:0;width:${w}mm;background:#fff}
.cl-table{width:100%;border-collapse:collapse}.cl-table>thead>tr>td,.cl-table>tfoot>tr>td{padding:0}
.cl-body-cell{padding:0 ${l.page.margins.right}mm 0 ${l.page.margins.left}mm}
.cl-meta{display:flex;justify-content:space-between;gap:12pt;font-size:${Math.max(8, l.font.size - 1)}pt;margin:0 0 4mm;color:#334155}
.cl-class{display:inline-block;border:1px solid #b91c1c;color:#b91c1c;font-size:7.5pt;font-weight:700;letter-spacing:.5pt;padding:0 4pt;text-transform:uppercase}
.cl-to{margin-bottom:4mm;line-height:1.4}.cl-subj{font-weight:700;margin:0 0 4mm;text-decoration:underline;text-underline-offset:2pt}
.cl-text p{text-align:justify;margin:0 0 2.5mm}.cl-text h1{font-size:${l.font.size + 6}pt;margin:3mm 0 2mm}.cl-text h2{font-size:${l.font.size + 3}pt;margin:3mm 0 1.5mm}.cl-text h3{font-size:${l.font.size + 1}pt;margin:2mm 0 1mm}
.cl-text ul,.cl-text ol{margin:0 0 2.5mm 6mm;padding:0}.cl-text table{border-collapse:collapse;width:100%;margin:2mm 0 3mm}.cl-text th,.cl-text td{border:1px solid #cbd5e1;padding:1mm 2mm;text-align:left;vertical-align:top}.cl-text th{background:#f1f5f9}
.cl-text blockquote{border-left:1mm solid #94a3b8;margin:2mm 0;padding:0 3mm;color:#475569}.cl-text hr{border:0;border-top:1px solid #cbd5e1;margin:3mm 0}
.cl-close{margin-top:5mm}.cl-sign{margin-top:12mm;line-height:1.4;page-break-inside:avoid}.cl-line{width:55mm;border-top:1px solid #0f172a;margin:1mm 0}
.cl-sig{font-size:${Math.max(8, l.font.size - 1)}pt;line-height:1.35}.cl-sig-label{font-size:8pt;color:#64748b;text-transform:uppercase;letter-spacing:.3pt}
.cl-sig-mark{position:relative;min-height:18mm;display:flex;align-items:flex-end;gap:3mm}.cl-stamp{height:22mm;opacity:.85}.cl-stamp-over-signature{position:absolute;right:0;bottom:-3mm}.cl-stamp-below-signature{position:absolute;left:12mm;top:100%;margin-top:6mm}
.cl-signed{font-size:8pt;color:#047857}.cl-pending{font-size:8pt;color:#b45309;border:1px dashed #f59e0b;padding:1mm 2mm}
.cl-small{font-size:8.5pt;color:#475569;margin:1mm 0}
.cl-wm{position:absolute;left:0;right:0;top:40%;text-align:center;font-weight:800;pointer-events:none;z-index:1}
.cl-draft{color:rgba(220,38,38,.10)}
.cl-border{position:absolute;pointer-events:none}
@media screen{.cl-fixed{display:none}.cl-doc{min-height:${h}mm}}
@media print{.cl-sigs{break-inside:avoid}html,body{margin:0}}
.cl-own-page{page-break-before:always;break-before:page}
${primary ? "" : ""}`;
}

// The letter's page(s). On screen only the first page's letterhead shows (with the body flowing below); the print
// adds the repeating later-page bands.
// A letter laid out in the design editor: its pages, with the fields, the verification code, the last signature and
// the stamp filled into their places.
function designLetterHtml(m: LetterModel, dz: Design) {
  const values = fieldValues(m);
  const signed = (m.signatures ?? []).filter((x) => x.status === "signed");
  const extras = { logo: m.letterhead.logo || "/api/branding/logo", qr: m.qr ?? null, signature: signed.at(-1)?.image ?? null, stamp: (m.signatures ?? []).find((x) => x.stamp)?.stamp ?? null, editing: false };
  const pages = dz.pages.map((p) => pageHtml(dz, p, values, extras)).join("");
  return `<div class="cl-doc cl-design">${!m.ref ? '<div class="cl-design-draft">DRAFT</div>' : ""}${pages}</div>`;
}

export function letterHtml(m: LetterModel) {
  const dz = designOf(m);
  if (dz) return designLetterHtml(m, dz);
  const l = m.layout ?? defaultLayout();
  const { w, h } = pageSize(l);
  const lh = m.letterhead;
  const logo = lh.logo || "/api/branding/logo";
  const values = fieldValues(m);
  const zone = (z: TemplateElement["zone"]) => l.elements.filter((e) => e.zone === z).map((e) => elementHtml(e, values, m, logo)).join("");
  const to = m.recipients.filter((r) => r.kind === "to");
  const cc = m.recipients.filter((r) => r.kind === "cc");
  const draft = !m.ref;
  const first = l.differentFirst;
  const headFirst = first ? l.header.first : l.header.rest;
  const footFirst = first ? l.footer.first : l.footer.rest;
  const recipient = (r: LetterModel["recipients"][number]) => [r.name && `<b>${esc(r.name)}</b>`, r.title && esc(r.title), r.organisation && esc(r.organisation), ...(r.address ?? "").split("\n").filter(Boolean).map(esc)].filter(Boolean).join("<br>");
  const b = l.border.style !== "none" ? `<div class="cl-border" style="left:${l.border.inset}mm;top:${l.border.inset}mm;width:${w - 2 * l.border.inset}mm;height:${h - 2 * l.border.inset}mm;border:${l.border.style === "double" ? Math.max(0.6, l.border.width * 3) : l.border.width}mm ${l.border.style} ${esc(l.border.color)}"></div>` : "";
  const wm = l.watermark ? `<div class="cl-wm" style="font-size:${l.watermark.size}pt;color:rgba(15,23,42,${l.watermark.opacity});transform:rotate(${l.watermark.angle}deg)">${esc(l.watermark.text)}</div>` : "";
  const bg = l.background ? `<img src="${esc(l.background)}" alt="" style="position:absolute;inset:0;width:${w}mm;height:${h}mm;object-fit:cover;opacity:.15">` : "";
  const sigs = m.signatures?.length ? signaturesHtml(m.signatures, l, m.signLook) : "";
  const ownPage = l.signatures.placement === "own-page" && sigs;
  const body = `
${l.blocks.refDate ? `<div class="cl-meta"><div>Ref: <b>${esc(m.ref ?? "(given when issued)")}</b>${m.inReplyToRef || m.externalRef ? `<br>Your ref: ${esc(m.inReplyToRef ?? m.externalRef ?? "")}` : ""}</div><div style="text-align:right">Date: <b>${esc(longDate(m.data.date))}</b>${l.blocks.classificationLabel && (m.classification === "confidential" || m.classification === "restricted") ? `<br><span class="cl-class">${esc(m.classification)}</span>` : ""}</div></div>` : ""}
${l.blocks.recipient ? to.map((r) => `<div class="cl-to">${recipient(r)}</div>`).join("") : ""}
${l.blocks.subject && m.subject ? `<div class="cl-subj">Subject: ${esc(m.subject)}</div>` : ""}
${m.data.salutation ? `<p>${esc(m.data.salutation)}</p>` : ""}
<div class="cl-text">${blocksHtml(((m.data.blocks ?? []) as Block[]).map((x) => ("text" in x && typeof x.text === "string" ? { ...x, text: fillFields(x.text, values) } : x)) as Block[])}</div>
${m.data.closing ? `<p class="cl-close">${esc(m.data.closing)}</p>` : ""}
${sigs && !ownPage ? sigs : !sigs ? `<div class="cl-sign"><div class="cl-line"></div><b>${esc(m.data.signName ?? "")}</b><br>${esc(m.data.signTitle ?? "")}<br>${esc(values.company_name ?? "")}</div>` : ""}
${m.attachments?.length ? `<p class="cl-small">Enclosures: ${m.attachments.map((a) => `${a.n}. ${esc(a.name)}`).join("; ")}</p>` : m.data.enclosures ? `<p class="cl-small">Enclosures: ${inlineHtml(m.data.enclosures)}</p>` : ""}
${cc.length ? `<p class="cl-small">CC: ${cc.map((r) => esc([r.name, r.organisation].filter(Boolean).join(", "))).join("; ")}</p>` : ""}
${ownPage ? `<div class="cl-own-page"><p class="cl-small">Signatures for ${esc(m.ref ?? "this letter")}: ${esc(m.subject)}</p>${sigs}</div>` : ""}`;
  return `<div class="cl-doc">
<div class="cl-fixed">${bg}${b}${wm}${zone("page")}${zone("header-rest")}${zone("footer-rest")}</div>
<div class="cl-first">${bg}${b}${wm}${draft ? `<div class="cl-wm cl-draft" style="font-size:80pt;transform:rotate(-25deg)">DRAFT</div>` : ""}${zone("page")}
<div class="cl-cover" style="top:0;height:${headFirst}mm"></div><div class="cl-cover" style="top:${h - footFirst}mm;height:${footFirst}mm"></div>
${first ? zone("header-first") + zone("footer-first") : zone("header-rest") + zone("footer-rest")}</div>
<table class="cl-table"><thead><tr><td style="height:${l.header.rest}mm"></td></tr></thead>
<tfoot><tr><td style="height:${Math.max(l.footer.first, l.footer.rest) + (l.blocks.pageNumbers ? 4 : 0)}mm"></td></tr></tfoot>
<tbody><tr><td class="cl-body-cell"><div style="height:${Math.max(0, headFirst - l.header.rest) + 4}mm"></div>${body}</td></tr></tbody></table></div>`;
}

// The letter as an editable Word file: the page size and margins of the template, the first-page and later-page
// headers and footers as text (Word places them in its own header and footer areas, not at exact positions).
export async function letterDocx(m: LetterModel) {
  const dz = designOf(m);
  if (dz) {
    const { designDocx } = await import("@/components/app/design/design-export");
    const signed = (m.signatures ?? []).filter((x) => x.status === "signed");
    return designDocx(dz, m.subject || "Letter", fieldValues(m), { logo: m.letterhead.logo || "/api/branding/logo", qr: m.qr ?? null, signature: signed.at(-1)?.image ?? null, stamp: (m.signatures ?? []).find((x) => x.stamp)?.stamp ?? null });
  }
  const l = m.layout ?? defaultLayout();
  const values = fieldValues(m);
  const P = (text: string, align?: "left" | "right" | "justify"): Block => ({ id: bid(), type: "paragraph", text, align });
  const to = m.recipients.filter((r) => r.kind === "to");
  const cc = m.recipients.filter((r) => r.kind === "cc");
  const before: Block[] = [
    ...(l.blocks.refDate ? [P(`Ref: **${m.ref ?? "(given when issued)"}**${m.externalRef ? `\nYour ref: ${m.externalRef}` : ""}`), P(`Date: **${longDate(m.data.date)}**`, "right")] : []),
    ...(l.blocks.recipient ? to.map((r) => P([r.name && `**${r.name}**`, r.title, r.organisation, ...(r.address ?? "").split("\n").filter(Boolean)].filter(Boolean).join("\n"))) : []),
    ...(l.blocks.subject && m.subject ? [P(`**Subject: ${m.subject}**`)] : []),
    ...(m.data.salutation ? [P(m.data.salutation)] : []),
  ];
  const sig = m.signatures?.length
    ? m.signatures.map((s) => P(`${s.label}\n${s.status === "signed" ? "Signed electronically" : "Awaiting signature"}\n_______________________\n**${s.name}**\n${s.position}${s.capacity ? `\n*${s.capacity}*` : ""}${s.date ? `\n${longDate(s.date)}` : ""}`))
    : [P("\n\n_______________________"), P(`**${m.data.signName ?? ""}**\n${m.data.signTitle ?? ""}\n${values.company_name}`)];
  const after: Block[] = [
    ...(m.data.closing ? [P(m.data.closing)] : []),
    ...sig,
    ...(m.attachments?.length ? [P(`Enclosures: ${m.attachments.map((a) => `${a.n}. ${a.name}`).join("; ")}`)] : m.data.enclosures ? [P(`Enclosures: ${m.data.enclosures}`)] : []),
    ...(cc.length ? [P(`CC: ${cc.map((r) => [r.name, r.organisation].filter(Boolean).join(", ")).join("; ")}`)] : []),
  ];
  const lhFull = { ...(m.letterhead as Letterhead), company: values.company_name ?? "", primary: hex(m.letterhead.primary, l.colors.primary), accent: hex(m.letterhead.accent, l.colors.accent) };
  const logo = await logoBytes(lhFull);
  const texts = (z: TemplateElement["zone"]) =>
    l.elements
      .filter((e) => e.zone === z && e.kind === "text")
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((e) => ({ text: fillFields(e.text ?? "", values).replace(/\{\{\s*page\s*\}\}/g, "").trim(), align: e.align ?? "left", size: e.size ?? 10, bold: (e.weight ?? 400) >= 600, color: e.color ?? "#111827" }))
      .filter((t) => t.text);
  const blocks = ((m.data.blocks ?? []) as Block[]).map((x) => ("text" in x && typeof x.text === "string" ? { ...x, text: fillFields(x.text, values) } : x)) as Block[];
  return blocksDocx({
    title: m.subject || "Letter",
    blocks,
    before,
    after,
    letterhead: { ...lhFull, logoData: logo?.data ?? null, logoType: logo?.type },
    page: { ...pageSize(l), margins: l.page.margins, differentFirst: l.differentFirst, oddEven: !!l.oddEven, header: { first: texts("header-first"), rest: texts("header-rest"), even: l.oddEven ? texts("header-even") : undefined }, footer: { first: texts("footer-first"), rest: texts("footer-rest"), even: l.oddEven ? texts("footer-even") : undefined }, pageNumbers: l.blocks.pageNumbers, footerNote: `Document ID ${m.documentId}${m.ref ? ` · ${m.ref}` : " · DRAFT"}` },
  });
}
