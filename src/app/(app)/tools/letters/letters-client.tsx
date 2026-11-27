"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BoldIcon, FolderOpenIcon, HighlighterIcon, ItalicIcon, UnderlineIcon, EyeIcon, FileDownIcon, HashIcon, ImageIcon, Loader2Icon, LockIcon, PencilLineIcon, PencilRulerIcon, PrinterIcon, RefreshCwIcon, SaveIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFileAction, nextLetterRefAction, saveFileAction, saveLetterheadAction } from "@/app/actions/tools";
import { bid, blocksDocx, esc, inlineHtml, logoBytes, printHtml, type Block } from "@/components/app/tools/doc-model";
import { FileShelf, type SavedFile } from "@/components/app/tools/file-shelf";
import { downloadBlob, safeName } from "@/components/app/tools/shared";
import { LetterTemplatePicker } from "@/components/app/tools/letter-templates";
import { RichBody } from "@/components/app/tools/rich-doc";
import { DesignEditor } from "@/components/app/design/design-editor";
import { exportImages } from "@/components/app/design/design-export";
import { cleanDesign, type Design, type DesignOptions } from "@/lib/design";
import { designGallery, letterDesign, type Brand } from "@/lib/design-templates";
import { fillLetter, LETTER_LIBRARY, type LetterTemplate } from "@/lib/letter-library";
import type { Letterhead } from "@/lib/tools";
import type { SealPolicy } from "@/server/tools";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Letter = {
  ref: string;
  date: string;
  recipientName: string;
  recipientTitle: string;
  organisation: string;
  address: string;
  subject: string;
  salutation: string;
  body: string;
  closing: string;
  signName: string;
  signTitle: string;
  cc: string;
  enclosures: string;
  template?: string;
  fields?: Record<string, string>;
  design?: Design | null;
  seal?: { signature: boolean; stamp: boolean };
};
type Mode = "write" | "design" | "preview";
type Seal = Omit<SealPolicy, "who"> | null;

const blank = (lh: Letterhead, author: { name: string; title: string | null }): Letter => ({
  ref: "",
  date: new Date().toISOString().slice(0, 10),
  recipientName: "",
  recipientTitle: "",
  organisation: "",
  address: "",
  subject: "",
  salutation: "Dear Sir/Madam,",
  body: "",
  closing: "Sincerely,",
  signName: lh.signName || author.name,
  signTitle: lh.signTitle || author.title || "",
  cc: "",
  enclosures: "",
  fields: {},
  design: null,
});

const longDate = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
const paragraphs = (s: string) => s.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

// The values {{fields}} are filled from: the template's own fields, then the standard ones.
function valuesOf(l: Letter, lh: Letterhead): Record<string, string> {
  return {
    ...(l.fields ?? {}),
    recipient_name: l.recipientName,
    recipient_title: l.recipientTitle,
    recipient_company: l.organisation,
    recipient_address: l.address,
    company_name: lh.company,
    company_address: lh.address,
    company_phone: lh.phone,
    company_email: lh.email,
    company_website: lh.website,
    issue_date: longDate(l.date),
    document_number: l.ref,
    signatory_name: l.signName,
    signatory_position: l.signTitle,
    subject: l.subject,
  };
}

// Whether the company signature and stamp go on this letter (Admin's rules, then the writer's ticks).
function sealOn(l: Letter, seal: Seal) {
  if (!seal) return { signature: false, stamp: false };
  const allowedHere = !seal.templates.length || (l.template ? seal.templates.includes(l.template) : false);
  const forced = seal.use === "always" || (!!l.template && seal.required.includes(l.template));
  if (!allowedHere && !forced) return { signature: false, stamp: false };
  return { signature: !!seal.signature && (forced || !!l.seal?.signature), stamp: !!seal.stamp && (forced || !!l.seal?.stamp) };
}

// The letterhead and footer of the official layout (all text escaped).
function headHtml(lh: Letterhead) {
  const logo = lh.logo || "/api/branding/logo";
  return `<div class="ltr-lh"><img src="${esc(logo)}" alt=""><div class="ltr-co"><div class="ltr-name">${esc(lh.company)}</div>${lh.tagline ? `<div class="ltr-tag">${esc(lh.tagline)}</div>` : ""}</div>
<div class="ltr-contact">${[lh.address, lh.phone, lh.email, lh.website].filter(Boolean).map(esc).join("<br>")}</div></div><div class="ltr-rule"><span></span></div>`;
}
function footHtml(lh: Letterhead) {
  return `<div class="ltr-foot"><div>${[lh.company, lh.footer].filter(Boolean).map(esc).join("<br>")}</div><div style="text-align:center">${esc(lh.address)}</div><div style="text-align:right">${[lh.phone, lh.email, lh.website].filter(Boolean).map(esc).join("<br>")}</div></div>`;
}

// The letter in the locked official layout, as HTML (all text escaped).
function letterHtml(l: Letter, lh: Letterhead, seal: Seal, on: { signature: boolean; stamp: boolean }) {
  const v = valuesOf(l, lh);
  const f = (s: string) => fillLetter(s, v);
  const sig = on.signature && seal?.signature ? `<img class="ltr-sig" src="${esc(seal.signature)}" alt="Signature" style="height:${seal.signHeight}mm">` : "";
  const stamp = on.stamp && seal?.stamp ? `<img class="ltr-stamp ${seal.placement === "over" ? "ltr-over" : ""}" src="${esc(seal.stamp)}" alt="Stamp" style="height:${seal.stampSize}mm;opacity:${seal.stampOpacity}">` : "";
  return `${headHtml(lh)}
<div class="ltr-meta"><div>Ref: ${esc(l.ref || "—")}</div><div>Date: ${esc(longDate(l.date))}</div></div>
<div class="ltr-to">${[l.recipientName && `<b>${esc(l.recipientName)}</b>`, l.recipientTitle && esc(l.recipientTitle), l.organisation && esc(l.organisation), ...l.address.split("\n").filter(Boolean).map(esc)].filter(Boolean).join("<br>")}</div>
${l.subject ? `<div class="ltr-subj">Subject: ${esc(f(l.subject))}</div>` : ""}
<p>${esc(f(l.salutation))}</p>
${paragraphs(f(l.body)).map((p) => `<p class="ltr-body">${inlineHtml(p)}</p>`).join("")}
<p class="ltr-close">${esc(l.closing)}</p>
<div class="ltr-sign"><div class="ltr-mark">${sig}${stamp}</div><div class="ltr-line"></div><b>${esc(l.signName)}</b><br>${esc(l.signTitle)}${on.signature && seal?.note ? `<div class="ltr-small">${esc(seal.note)}</div>` : ""}</div>
${l.enclosures ? `<p class="ltr-small">Enclosures: ${esc(l.enclosures)}</p>` : ""}${l.cc ? `<p class="ltr-small">CC: ${esc(l.cc)}</p>` : ""}
${footHtml(lh)}`;
}
const letterCss = (lh: Letterhead) => `
@page{size:A4;margin:16mm 22mm 26mm}
body{font-family:Inter,"Segoe UI",Arial,"Noto Sans Ethiopic",sans-serif;font-size:10.5pt;line-height:1.5;color:#1f2937}
.ltr-lh{display:flex;align-items:center;gap:10pt}
.ltr-lh img{height:17mm;width:auto}.ltr-co{flex:1}.ltr-name{font-size:15.5pt;font-weight:700;color:${lh.accent};line-height:1.2}.ltr-tag{font-size:7.8pt;color:#64748b;margin-top:2pt}
.ltr-contact{text-align:right;font-size:7.2pt;color:#475569;line-height:1.45}
.ltr-rule{height:0.7mm;background:${lh.primary};margin:4mm 0 0;position:relative}.ltr-rule span{position:absolute;left:0;top:0.7mm;width:34mm;height:0.7mm;background:${lh.accent}}
.ltr-meta{display:flex;justify-content:space-between;font-size:9pt;margin:7mm 0 5mm;color:#475569}
.ltr-to{margin-bottom:8mm;line-height:1.45}.ltr-subj{font-weight:700;margin:0 0 4mm;font-size:11pt}
p{margin:0 0 3mm}.ltr-body{text-align:left}.ltr-close{margin-top:5mm}.ltr-sign{margin-top:3mm;line-height:1.4;break-inside:avoid}.ltr-sign .ltr-line{width:58mm;border-top:0.25mm solid #334155;margin:1mm 0 2mm}
.ltr-mark{position:relative;min-height:16mm;display:flex;align-items:flex-end;gap:4mm}.ltr-stamp.ltr-over{position:absolute;left:18mm;bottom:-6mm}
.ltr-small{font-size:8.5pt;color:#64748b;margin:1.5mm 0}
.ltr-foot{position:fixed;bottom:-18mm;left:0;right:0;border-top:0.3mm solid #cbd5e1;padding-top:2.5mm;font-size:6.8pt;color:#64748b;line-height:1.4;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm}
@media screen{.ltr-foot{position:static;margin-top:20mm}}`;

const brandOf = (lh: Letterhead): Brand => ({ company: lh.company, tagline: lh.tagline, address: lh.address, phone: lh.phone, email: lh.email, website: lh.website, footer: lh.footer, primary: lh.primary, accent: lh.accent, hasLogo: true });

export function LettersClient({ files: initialFiles, letterhead: initialLh, canEditLetterhead, author, tab: initialTab, design: designOpts, seal }: { files: SavedFile[]; letterhead: Letterhead; canEditLetterhead: boolean; author: { name: string; title: string | null }; tab: string; design: DesignOptions | null; seal: Seal }) {
  const [lh, setLh] = React.useState(initialLh);
  const [files, setFiles] = React.useState(initialFiles);
  const [id, setId] = React.useState<string | null>(null);
  const [l, setL] = React.useState<Letter>(() => blank(initialLh, author));
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState(initialTab);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const canDesign = !!designOpts?.surfaces.letters;
  const startMode: Mode = canDesign && designOpts!.defaultMode === "design" ? "design" : designOpts?.defaultMode === "preview" ? "preview" : "write";
  const [mode, setModeRaw] = React.useState<Mode>(startMode);
  const lockedMode = canDesign && !designOpts!.allowModeSwitch;
  const set = (p: Partial<Letter>) => setL((cur) => ({ ...cur, ...p }));
  const tmpl = LETTER_LIBRARY.find((t) => t.key === l.template) ?? null;
  const values = valuesOf(l, lh);
  const title = fillLetter(l.subject, values) || `Letter to ${l.recipientName || "recipient"}`;
  const on = sealOn(l, seal);
  const forced = !!seal && (seal.use === "always" || (!!l.template && seal.required.includes(l.template)));
  const sealHere = !!seal && (!seal.templates.length || (!!l.template && seal.templates.includes(l.template)) || forced);
  const extras = { logo: lh.logo || "/api/branding/logo", signature: on.signature ? seal!.signature : null, stamp: on.stamp ? seal!.stamp : null };

  // A letter's design, built from what was written when it is first opened in design mode.
  const buildDesign = (from: Letter = l) =>
    letterDesign(brandOf(lh), {
      ref: from.ref || "{{document_number}}",
      date: longDate(from.date),
      to: [from.recipientName, from.recipientTitle, from.organisation, from.address].filter(Boolean).join("\n") || "{{recipient_name}}",
      subject: fillLetter(from.subject, valuesOf(from, lh)),
      salutation: fillLetter(from.salutation, valuesOf(from, lh)),
      body: paragraphs(fillLetter(from.body, valuesOf(from, lh))).join("\n\n").replace(/\*\*|__|~~|==/g, ""),
      closing: from.closing,
      signName: from.signName,
      signTitle: from.signTitle,
      cc: from.cc,
      enclosures: from.enclosures,
    }, (LETTER_LIBRARY.find((t) => t.key === from.template)?.design as "classic") ?? "classic");
  const setMode = (m: Mode) => {
    if (m === "design" && !l.design) set({ design: buildDesign() });
    setModeRaw(m);
  };
  React.useEffect(() => {
    if (startMode === "design" && !l.design) set({ design: buildDesign() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTemplate = (t: LetterTemplate) => {
    if ((l.body.trim() || l.design) && !confirm("Replace the letter's text with this template?")) return;
    const next = { ...l, template: t.key, subject: t.subject, salutation: t.salutation, body: t.body, closing: t.closing, fields: Object.fromEntries(t.fields.map((f) => [f.key, l.fields?.[f.key] ?? ""])), design: null, seal: { signature: !!t.needsSignature, stamp: !!t.needsStamp } };
    setL(mode === "design" ? { ...next, design: buildDesign(next) } : next);
    toast.success(`${t.label}: fill in the highlighted details`);
  };

  // Letter fields as blocks for Word (the header and footer come from the letterhead).
  const wordBlocks = (): Block[] => {
    const P = (text: string, align?: "left" | "right" | "justify"): Block => ({ id: bid(), type: "paragraph", text, align });
    const f = (s: string) => fillLetter(s, values);
    const sealBlocks: Block[] = [];
    if (seal && seal.onExports.word) {
      if (on.signature && seal.signature) sealBlocks.push({ id: bid(), type: "image", src: seal.signature, width: Math.round(((seal.signHeight * 3) / 160) * 100), align: "left" });
      if (on.stamp && seal.stamp) sealBlocks.push({ id: bid(), type: "image", src: seal.stamp, width: Math.round((seal.stampSize / 160) * 100), align: "left" });
    }
    return [
      P(`Ref: **${l.ref || "—"}**`),
      P(`Date: **${longDate(l.date)}**`),
      P(""),
      P([l.recipientName && `**${l.recipientName}**`, l.recipientTitle, l.organisation, ...l.address.split("\n").filter(Boolean)].filter(Boolean).join("\n")),
      P(""),
      ...(l.subject ? [P(`**Subject: ${f(l.subject)}**`)] : []),
      P(f(l.salutation)),
      ...paragraphs(f(l.body)).map((x) => P(x, "justify")),
      P(""),
      P(l.closing),
      ...(sealBlocks.length ? sealBlocks : [P("\n\n")]),
      P("_______________________"),
      P(`**${l.signName}**\n${l.signTitle}\n${lh.company}${on.signature && seal?.note ? `\n${seal.note}` : ""}`),
      ...(l.enclosures ? [P(`Enclosures: ${l.enclosures}`)] : []),
      ...(l.cc ? [P(`CC: ${l.cc}`)] : []),
    ];
  };
  const sealFor = (kind: "pdf" | "image") => (seal && seal.onExports[kind] ? on : { signature: false, stamp: false });

  const save = async () => {
    setBusy("save");
    const data = { ...l, design: l.design ? cleanDesign(l.design) : null };
    const r = await saveFileAction("letter", { id: id ?? undefined, title, data });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    const nid = r.data as string;
    setId(nid);
    setFiles([{ id: nid, title, updated_at: new Date().toISOString() }, ...files.filter((f) => f.id !== nid)]);
    toast.success("Letter saved");
  };
  const missing = tmpl ? tmpl.fields.filter((f) => !l.fields?.[f.key]?.trim()) : [];

  const modeBar = canDesign && !lockedMode && (
    <div className="inline-flex rounded-md border bg-background p-0.5 text-sm" role="tablist" aria-label="Letter mode">
      {(
        [
          ["write", PencilLineIcon, "Write"],
          ["design", PencilRulerIcon, "Design"],
          ["preview", EyeIcon, "Preview"],
        ] as const
      ).map(([k, Icon, label]) => (
        <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={cn("inline-flex items-center gap-1.5 rounded px-3 py-1", mode === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
          <Icon className="size-4" /> {label}
        </button>
      ))}
    </div>
  );

  return (
    <Tabs value={tab} onValueChange={setTab}>
      {canEditLetterhead && (
        <TabsList>
          <TabsTrigger value="write">Write a letter</TabsTrigger>
          <TabsTrigger value="letterhead">Letterhead</TabsTrigger>
        </TabsList>
      )}
      <TabsContent value="write" className="mt-3">
        <div className="grid gap-4">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {modeBar}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    <FolderOpenIcon /> My letters ({files.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <FileShelf
                    kind="letter"
                    files={files}
                    setFiles={setFiles}
                    current={id}
                    newLabel="New letter"
                    onNew={() => (setId(null), setL(blank(lh, author)))}
                    onOpen={async (fid) => {
                      const r = await getFileAction("letter", fid);
                      if (!r.ok) return toast.error(r.error);
                      const f = r.data as { id: string; data: Letter };
                      setId(f.id);
                      setL({ ...blank(lh, author), ...f.data, design: f.data.design ? cleanDesign(f.data.design) : null });
                    }}
                  />
                </PopoverContent>
              </Popover>
              <LetterTemplatePicker onPick={applyTemplate} label={tmpl ? `Template: ${tmpl.label}` : "Choose a kind of letter"} />
              {sealHere && seal && (
                <span className="inline-flex items-center gap-3 rounded-md border px-2 py-1 text-xs">
                  {seal.signature && (
                    <label className="flex items-center gap-1">
                      <input type="checkbox" disabled={forced || seal.use === "off"} checked={on.signature} onChange={(e) => set({ seal: { signature: e.target.checked, stamp: l.seal?.stamp ?? false } })} /> Company signature
                    </label>
                  )}
                  {seal.stamp && (
                    <label className="flex items-center gap-1">
                      <input type="checkbox" disabled={forced || seal.use === "off"} checked={on.stamp} onChange={(e) => set({ seal: { signature: l.seal?.signature ?? false, stamp: e.target.checked } })} /> Company stamp
                    </label>
                  )}
                  {forced && <span className="text-muted-foreground">(always on this letter)</span>}
                </span>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === "save"} onClick={save}>
                  {busy === "save" ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
                </Button>
                {mode !== "design" && !l.design && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => printHtml(title, letterHtml(l, lh, seal, sealFor("pdf")), letterCss(lh))}>
                      <PrinterIcon /> PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === "docx"}
                      onClick={async () => {
                        setBusy("docx");
                        try {
                          const logo = await logoBytes(lh);
                          downloadBlob(await blocksDocx({ title, blocks: wordBlocks(), letterhead: { ...lh, logoData: logo?.data ?? null, logoType: logo?.type } }), safeName(title, "docx"));
                        } catch {
                          toast.error("The Word file could not be made.");
                        }
                        setBusy(null);
                      }}
                    >
                      {busy === "docx" ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />} Word
                    </Button>
                    {canDesign && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === "png"}
                        onClick={async () => {
                          setBusy("png");
                          try {
                            const ex = { ...extras, signature: sealFor("image").signature ? extras.signature : null, stamp: sealFor("image").stamp ? extras.stamp : null };
                            await exportImages(buildDesign(), title, "png", values, ex);
                          } catch {
                            toast.error("The picture could not be made.");
                          }
                          setBusy(null);
                        }}
                      >
                        <ImageIcon /> PNG
                      </Button>
                    )}
                  </>
                )}
                {l.design && mode !== "write" && (
                  <Button size="sm" variant="ghost" onClick={() => confirm("Rebuild the design from the written letter? Changes made in the design are replaced.") && set({ design: buildDesign() })}>
                    <RefreshCwIcon /> Rebuild from the text
                  </Button>
                )}
              </div>
            </div>
            {tmpl && missing.length > 0 && mode === "write" && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-100">Still to fill: {missing.map((f) => f.label).join(", ")}.</p>}

            {mode === "write" && (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-w-0 overflow-hidden rounded-xl border bg-[#e9ebee] dark:bg-slate-900">
                  <div className="overflow-x-auto p-6">
                    <div className="mx-auto w-[210mm] max-w-full bg-white px-[22mm] pt-[14mm] pb-[12mm] text-[10.5pt] leading-[1.5] text-[#1f2937] shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)]" style={{ fontFamily: "Inter, 'Segoe UI', Arial, 'Noto Sans Ethiopic', sans-serif" }}>
                      <style>{letterCss(lh)}</style>
                      <div dangerouslySetInnerHTML={{ __html: headHtml(lh) }} />
                      <div className="mt-[7mm] mb-[5mm] flex justify-between text-[9pt] text-slate-600">
                        <span>Ref: {l.ref || "—"}</span>
                        <span>Date: {longDate(l.date)}</span>
                      </div>
                      <PageField area value={[l.recipientName, l.recipientTitle, l.organisation, l.address].filter((x, i) => x || i < 3).join("\n").replace(/\n+$/, "")} placeholder={"Recipient's name\nPosition\nOrganisation\nAddress"} className="mb-[6mm] leading-[1.45]" onChange={(v) => {
                        const [n = "", t = "", o = "", ...a] = v.split("\n");
                        set({ recipientName: n, recipientTitle: t, organisation: o, address: a.join("\n") });
                      }} />
                      <div className="mb-[4mm] flex items-baseline gap-1 text-[11pt] font-bold">
                        <span>Subject:</span>
                        <PageField value={l.subject} placeholder="What the letter is about" onChange={(subject) => set({ subject })} className="font-bold" />
                      </div>
                      <PageField value={l.salutation} placeholder="Dear Sir/Madam," onChange={(salutation) => set({ salutation })} className="mb-[3mm]" />
                      <div className="-mx-2 rounded-sm px-2 focus-within:bg-sky-50/40"><RichBody value={l.body} onChange={(body) => set({ body })} placeholder="Type the letter here…" /></div>
                      <PageField value={l.closing} placeholder="Yours sincerely," onChange={(closing) => set({ closing })} className="mt-[5mm]" />
                      <div className="mt-[3mm]">
                        <div className="relative flex min-h-[16mm] items-end gap-[4mm]">
                          {on.signature && seal?.signature && <img src={seal.signature} alt="Signature" style={{ height: `${seal.signHeight}mm` }} />}
                          {on.stamp && seal?.stamp && <img src={seal.stamp} alt="Stamp" style={{ height: `${seal.stampSize}mm`, opacity: seal.stampOpacity }} className={seal.placement === "over" ? "absolute bottom-[-6mm] left-[18mm]" : ""} />}
                        </div>
                        <div className="mt-[1mm] mb-[2mm] w-[58mm] border-t border-slate-700" />
                        <PageField value={l.signName} placeholder="Name" onChange={(signName) => set({ signName })} className="font-semibold" />
                        <PageField value={l.signTitle} placeholder="Position" onChange={(signTitle) => set({ signTitle })} />
                      </div>
                      <div className="mt-[4mm] space-y-0.5 text-[8.5pt] text-slate-500">
                        <PageField value={l.enclosures} placeholder="Enclosures (optional)" onChange={(enclosures) => set({ enclosures })} />
                        <PageField value={l.cc} placeholder="CC (optional)" onChange={(cc) => set({ cc })} />
                      </div>
                      <div dangerouslySetInnerHTML={{ __html: footHtml(lh) }} />
                    </div>
                  </div>
                </div>
                <aside className="space-y-3">
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <p className="text-sm font-semibold">Letter details</p>
                      <div className="space-y-1">
                        <Label htmlFor="l-ref">Reference number</Label>
                        <div className="flex gap-1">
                          <Input id="l-ref" value={l.ref} onChange={(e) => set({ ref: e.target.value })} placeholder={`${lh.refPrefix || "REF"}/…`} />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Next reference number"
                            title="Next reference number"
                            onClick={async () => {
                              const r = await nextLetterRefAction(lh.refPrefix);
                              if (!r.ok) return toast.error(r.error);
                              set({ ref: r.data as string });
                            }}
                          >
                            <HashIcon />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="l-date">Date</Label>
                        <Input id="l-date" type="date" value={l.date} onChange={(e) => set({ date: e.target.value })} />
                      </div>
                      {tmpl && tmpl.fields.length > 0 && (
                        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
                          <p className="text-xs font-medium">Details for {tmpl.label.toLowerCase()}</p>
                          {tmpl.fields.map((f) => (
                            <label key={f.key} className="block space-y-0.5 text-xs">
                              <span className="text-muted-foreground">{f.label}</span>
                              {f.kind === "long" ? (
                                <Textarea rows={2} value={l.fields?.[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => set({ fields: { ...l.fields, [f.key]: e.target.value } })} />
                              ) : (
                                <Input className="h-8" value={l.fields?.[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => set({ fields: { ...l.fields, [f.key]: e.target.value } })} />
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{"{{fields}}"} in the text are filled from these details when the letter is saved as PDF, Word or a picture.</p>
                    </CardContent>
                  </Card>
                </aside>
              </div>
            )}
            {mode !== "write" && canDesign && l.design && (
              <DesignEditor
                design={l.design}
                onChange={(design) => set({ design })}
                options={{ ...designOpts!, allowModeSwitch: false }}
                values={values}
                extras={extras}
                templates={designGallery(brandOf(lh)).filter((g) => !g.key.startsWith("slide") && g.key !== "post" && g.key !== "card")}
                title={title}
                slots
                mode={mode === "preview" ? "preview" : "design"}
                onModeChange={(m) => setModeRaw(m === "preview" ? "preview" : "design")}
              />
            )}
            {mode === "preview" && !l.design && (
              <div className="mx-auto max-w-[210mm] rounded-md border bg-white p-10 text-[13px] leading-relaxed text-slate-900 shadow-md">
                <style>{letterCss(lh)}</style>
                <div dangerouslySetInnerHTML={{ __html: letterHtml(l, lh, seal, on) }} />
              </div>
            )}
          </div>
        </div>
      </TabsContent>
      {canEditLetterhead && (
        <TabsContent value="letterhead" className="mt-3">
          <LetterheadEditor value={lh} onSaved={setLh} />
        </TabsContent>
      )}
    </Tabs>
  );
}

function LetterheadEditor({ value, onSaved }: { value: Letterhead; onSaved: (l: Letterhead) => void }) {
  const router = useRouter();
  const [v, setV] = React.useState(value);
  const [busy, setBusy] = React.useState(false);
  const field = (k: keyof Letterhead, label: string, opts: { area?: boolean; type?: string } = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`lh-${k}`}>{label}</Label>
      {opts.area ? (
        <Textarea id={`lh-${k}`} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })} rows={2} />
      ) : (
        <Input id={`lh-${k}`} type={opts.type} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
      )}
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Official letterhead</CardTitle>
        <CardDescription>Every letter uses this. People writing letters cannot change it; only people with &ldquo;Change the official company letterhead&rdquo; (Roles &amp; permissions) see this tab.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {field("company", "Company name")}
          {field("tagline", "Line under the name")}
          {field("address", "Address", { area: true })}
          {field("footer", "Footer (legal name, registration, bank…)", { area: true })}
          {field("phone", "Phone")}
          {field("email", "Email")}
          {field("website", "Website")}
          {field("refPrefix", "Reference prefix (e.g. MS)")}
          {field("signName", "Default signatory")}
          {field("signTitle", "Signatory's position")}
          {field("primary", "Brand colour", { type: "color" })}
          {field("accent", "Name colour", { type: "color" })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <img src={v.logo || "/api/branding/logo"} alt="Letterhead logo" className="h-12 w-auto rounded border bg-white p-1" />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            <UploadIcon className="size-4" /> Logo (PNG, JPEG or WebP, under 300 KB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 300_000) return toast.error("Use a picture under 300 KB.");
                const r = new FileReader();
                r.onload = () => setV({ ...v, logo: String(r.result) });
                r.readAsDataURL(f);
              }}
            />
          </label>
          {v.logo && (
            <Button variant="ghost" size="sm" onClick={() => setV({ ...v, logo: null })}>
              Use the site logo
            </Button>
          )}
        </div>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await saveLetterheadAction(v);
            setBusy(false);
            if (!r.ok) return toast.error(r.error);
            onSaved(v);
            toast.success("Letterhead saved");
            router.refresh();
          }}
        >
          Save letterhead
        </Button>
      </CardContent>
    </Card>
  );
}

// A field typed straight onto the letter page (no box until it is focused), growing with its text.
function PageField({ value, onChange, placeholder, className, area, refEl }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; area?: boolean; refEl?: React.RefObject<HTMLTextAreaElement | null> }) {
  const cls = cn("block w-full resize-none rounded-sm border-0 bg-transparent p-0 outline-none placeholder:text-slate-400 hover:bg-sky-50/60 focus:bg-sky-50 focus:ring-1 focus:ring-sky-300", className);
  if (area) return <textarea ref={refEl} rows={Math.max(1, value.split("\n").length)} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} style={{ fieldSizing: "content" } as React.CSSProperties} />;
  return <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />;
}

// The formatting bar above the page (as Word's Home tab): marks go around the selected words of the letter text.
function WordBar({ target, value, onChange }: { target: React.RefObject<HTMLTextAreaElement | null>; value: string; onChange: (v: string) => void }) {
  const [color, setColor] = React.useState("#c00000");
  const wrap = (a: string, b: string) => {
    const el = target.current;
    if (!el) return;
    const s0 = el.selectionStart;
    const e0 = el.selectionEnd;
    const sel = value.slice(s0, e0) || "text";
    onChange(value.slice(0, s0) + a + sel + b + value.slice(e0));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s0 + a.length, s0 + a.length + sel.length);
    });
  };
  const B = ({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) => (
    <button type="button" title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="inline-flex size-8 items-center justify-center rounded hover:bg-muted">
      <Icon className="size-4" />
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-background px-2 py-1">
      <select className="h-8 rounded border bg-background px-1 text-xs" aria-label="Font of the selected words" value="" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => e.target.value && wrap(`{f:${e.target.value}|`, "}")}>
        <option value="">Font</option>
        {["Calibri", "Arial", "Times New Roman", "Georgia", "Cambria", "Garamond", "Nyala", "Noto Sans Ethiopic"].map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select className="h-8 rounded border bg-background px-1 text-xs" aria-label="Size of the selected words" value="" onChange={(e) => e.target.value && wrap(`{${e.target.value}pt|`, "}")}>
        <option value="">Size</option>
        {[9, 10, 11, 12, 14, 16, 18, 20, 24].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <span className="mx-1 h-5 w-px bg-border" />
      <B icon={BoldIcon} label="Bold" onClick={() => wrap("**", "**")} />
      <B icon={ItalicIcon} label="Italic" onClick={() => wrap("*", "*")} />
      <B icon={UnderlineIcon} label="Underline" onClick={() => wrap("__", "__")} />
      <B icon={HighlighterIcon} label="Highlight" onClick={() => wrap("==", "==")} />
      <span className="inline-flex items-center">
        <button type="button" title="Colour" aria-label="Colour" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap(`{${color}|`, "}")} className="inline-flex size-8 flex-col items-center justify-center rounded hover:bg-muted">
          <span className="text-sm font-semibold">A</span>
          <span className="h-1 w-4 rounded-sm" style={{ background: color }} />
        </button>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-5 cursor-pointer border-0 bg-transparent p-0" aria-label="Choose the colour" />
      </span>
      <span className="ml-auto pr-1 text-xs text-muted-foreground">Type on the page. The letterhead is locked.</span>
    </div>
  );
}
