"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeIcon, FileDownIcon, HashIcon, ImageIcon, Loader2Icon, LockIcon, PencilLineIcon, PencilRulerIcon, PrinterIcon, RefreshCwIcon, SaveIcon, UploadIcon } from "lucide-react";
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
import { DesignEditor } from "@/components/app/design/design-editor";
import { exportImages } from "@/components/app/design/design-export";
import { cleanDesign, type Design, type DesignOptions } from "@/lib/design";
import { designGallery, letterDesign, type Brand } from "@/lib/design-templates";
import { fillLetter, LETTER_LIBRARY, type LetterTemplate } from "@/lib/letter-library";
import type { Letterhead } from "@/lib/tools";
import type { SealPolicy } from "@/server/tools";
import { cn } from "@/lib/utils";

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

// The letter in the locked official layout, as HTML (all text escaped).
function letterHtml(l: Letter, lh: Letterhead, seal: Seal, on: { signature: boolean; stamp: boolean }) {
  const logo = lh.logo || "/api/branding/logo";
  const v = valuesOf(l, lh);
  const f = (s: string) => fillLetter(s, v);
  const sig = on.signature && seal?.signature ? `<img class="ltr-sig" src="${esc(seal.signature)}" alt="Signature" style="height:${seal.signHeight}mm">` : "";
  const stamp = on.stamp && seal?.stamp ? `<img class="ltr-stamp ${seal.placement === "over" ? "ltr-over" : ""}" src="${esc(seal.stamp)}" alt="Stamp" style="height:${seal.stampSize}mm;opacity:${seal.stampOpacity}">` : "";
  return `
<div class="ltr-lh"><img src="${esc(logo)}" alt=""><div class="ltr-co"><div class="ltr-name">${esc(lh.company)}</div>${lh.tagline ? `<div class="ltr-tag">${esc(lh.tagline)}</div>` : ""}</div>
<div class="ltr-contact">${[lh.address, lh.phone, lh.email, lh.website].filter(Boolean).map(esc).join("<br>")}</div></div>
<div class="ltr-meta"><div>Ref: <b>${esc(l.ref || "—")}</b></div><div>Date: <b>${esc(longDate(l.date))}</b></div></div>
<div class="ltr-to">${[l.recipientName && `<b>${esc(l.recipientName)}</b>`, l.recipientTitle && esc(l.recipientTitle), l.organisation && esc(l.organisation), ...l.address.split("\n").filter(Boolean).map(esc)].filter(Boolean).join("<br>")}</div>
${l.subject ? `<div class="ltr-subj">Subject: ${esc(f(l.subject))}</div>` : ""}
<p>${esc(f(l.salutation))}</p>
${paragraphs(f(l.body)).map((p) => `<p class="ltr-body">${inlineHtml(p)}</p>`).join("")}
<p class="ltr-close">${esc(l.closing)}</p>
<div class="ltr-sign"><div class="ltr-mark">${sig}${stamp}</div><div class="ltr-line"></div><b>${esc(l.signName)}</b><br>${esc(l.signTitle)}<br>${esc(lh.company)}${on.signature && seal?.note ? `<div class="ltr-small">${esc(seal.note)}</div>` : ""}</div>
${l.enclosures ? `<p class="ltr-small">Enclosures: ${esc(l.enclosures)}</p>` : ""}${l.cc ? `<p class="ltr-small">CC: ${esc(l.cc)}</p>` : ""}
<div class="ltr-foot">${esc(lh.footer || [lh.company, lh.address, lh.website].filter(Boolean).join(" · "))}</div>`;
}
const letterCss = (lh: Letterhead) => `
.ltr-lh{display:flex;align-items:center;gap:12pt;border-bottom:3pt solid ${lh.primary};padding-bottom:8pt;margin-bottom:6pt}
.ltr-lh img{height:46pt;width:auto}.ltr-co{flex:1}.ltr-name{font-size:17pt;font-weight:700;color:${lh.accent};letter-spacing:.2pt}.ltr-tag{font-size:9pt;color:#64748b}
.ltr-contact{text-align:right;font-size:8.5pt;color:#475569;line-height:1.35}
.ltr-meta{display:flex;justify-content:space-between;font-size:10pt;margin:10pt 0 14pt;color:#334155}
.ltr-to{margin-bottom:12pt;line-height:1.4}.ltr-subj{font-weight:700;margin:0 0 10pt;text-decoration:underline;text-underline-offset:2pt}
.ltr-body{text-align:justify}.ltr-close{margin-top:14pt}.ltr-sign{margin-top:14pt;line-height:1.4;break-inside:avoid}.ltr-sign .ltr-line{width:150pt;border-top:1px solid #0f172a;margin-bottom:4pt}
.ltr-mark{position:relative;min-height:16mm;display:flex;align-items:flex-end;gap:4mm}.ltr-stamp.ltr-over{position:absolute;left:18mm;bottom:-6mm}
.ltr-small{font-size:9pt;color:#475569;margin:2pt 0}
.ltr-foot{position:fixed;bottom:0;left:0;right:0;border-top:1.5pt solid ${lh.primary};padding-top:4pt;font-size:8pt;color:#64748b;text-align:center}
@media screen{.ltr-foot{position:static;margin-top:28pt}}`;

const brandOf = (lh: Letterhead): Brand => ({ company: lh.company, tagline: lh.tagline, address: lh.address, phone: lh.phone, email: lh.email, website: lh.website, footer: lh.footer, primary: lh.primary, accent: lh.accent, hasLogo: true });

export function LettersClient({ files: initialFiles, letterhead: initialLh, canEditLetterhead, author, tab: initialTab, design: designOpts, seal }: { files: SavedFile[]; letterhead: Letterhead; canEditLetterhead: boolean; author: { name: string; title: string | null }; tab: string; design: DesignOptions | null; seal: Seal }) {
  const [lh, setLh] = React.useState(initialLh);
  const [files, setFiles] = React.useState(initialFiles);
  const [id, setId] = React.useState<string | null>(null);
  const [l, setL] = React.useState<Letter>(() => blank(initialLh, author));
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState(initialTab);
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
        <div className={cn("grid gap-4", mode === "write" && "lg:grid-cols-[15rem_minmax(0,1fr)]")}>
          {mode === "write" && (
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
          )}
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {modeBar}
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
              <div className="grid gap-4 2xl:grid-cols-2">
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="l-ref">Reference number</Label>
                        <div className="flex gap-1">
                          <Input id="l-ref" value={l.ref} onChange={(e) => set({ ref: e.target.value })} placeholder={`${lh.refPrefix || "REF"}/…`} />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Next reference number"
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
                    </div>
                    <fieldset className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                      <legend className="px-1 text-xs font-medium text-muted-foreground">Recipient</legend>
                      <Input value={l.recipientName} onChange={(e) => set({ recipientName: e.target.value })} placeholder="Name" aria-label="Recipient name" />
                      <Input value={l.recipientTitle} onChange={(e) => set({ recipientTitle: e.target.value })} placeholder="Title or position" aria-label="Recipient title" />
                      <Input value={l.organisation} onChange={(e) => set({ organisation: e.target.value })} placeholder="Organisation" aria-label="Organisation" className="sm:col-span-2" />
                      <Textarea value={l.address} onChange={(e) => set({ address: e.target.value })} placeholder="Address (one line each)" rows={2} aria-label="Address" className="sm:col-span-2" />
                    </fieldset>
                    {tmpl && tmpl.fields.length > 0 && (
                      <fieldset className="grid gap-3 rounded-md border border-amber-500/40 p-3 sm:grid-cols-2">
                        <legend className="px-1 text-xs font-medium text-muted-foreground">Details for {tmpl.label.toLowerCase()}</legend>
                        {tmpl.fields.map((f) =>
                          f.kind === "long" ? (
                            <Textarea key={f.key} className="sm:col-span-2" rows={2} value={l.fields?.[f.key] ?? ""} placeholder={f.placeholder ?? f.label} aria-label={f.label} onChange={(e) => set({ fields: { ...l.fields, [f.key]: e.target.value } })} />
                          ) : (
                            <Input key={f.key} value={l.fields?.[f.key] ?? ""} placeholder={f.placeholder ?? f.label} aria-label={f.label} title={f.label} onChange={(e) => set({ fields: { ...l.fields, [f.key]: e.target.value } })} />
                          ),
                        )}
                      </fieldset>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor="l-subj">Subject</Label>
                      <Input id="l-subj" value={l.subject} onChange={(e) => set({ subject: e.target.value })} />
                    </div>
                    <Input value={l.salutation} onChange={(e) => set({ salutation: e.target.value })} aria-label="Salutation" />
                    <div className="space-y-1">
                      <Label htmlFor="l-body">Letter</Label>
                      <Textarea id="l-body" value={l.body} onChange={(e) => set({ body: e.target.value })} rows={12} placeholder={"Type the message. Leave an empty line between paragraphs.\n**bold**, *italic*, __underline__ and {{fields}} work."} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Input value={l.closing} onChange={(e) => set({ closing: e.target.value })} aria-label="Closing" />
                      <Input value={l.signName} onChange={(e) => set({ signName: e.target.value })} placeholder="Signed by" aria-label="Signed by" />
                      <Input value={l.signTitle} onChange={(e) => set({ signTitle: e.target.value })} placeholder="Position" aria-label="Signer's position" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input value={l.enclosures} onChange={(e) => set({ enclosures: e.target.value })} placeholder="Enclosures (optional)" aria-label="Enclosures" />
                      <Input value={l.cc} onChange={(e) => set({ cc: e.target.value })} placeholder="CC (optional)" aria-label="CC" />
                    </div>
                  </CardContent>
                </Card>
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <LockIcon className="size-3" /> Official letterhead (locked){l.design ? " · this letter also has a design (Design or Preview)" : ""}
                  </p>
                  <div className="mx-auto max-w-[210mm] rounded-md border bg-white p-8 text-[13px] leading-relaxed text-slate-900 shadow-sm">
                    <style>{letterCss(lh)}</style>
                    {/* All text is escaped in letterHtml. */}
                    <div dangerouslySetInnerHTML={{ __html: letterHtml(l, lh, seal, on) }} />
                  </div>
                </div>
              </div>
            )}
            {mode !== "write" && canDesign && l.design && (
              <DesignEditor
                design={l.design}
                onChange={(design) => set({ design })}
                options={designOpts!}
                values={values}
                extras={extras}
                templates={designGallery(brandOf(lh))}
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
