"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileDownIcon, HashIcon, Loader2Icon, LockIcon, PrinterIcon, SaveIcon, UploadIcon } from "lucide-react";
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
import type { Letterhead } from "@/lib/tools";

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
};

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
});

const longDate = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
const paragraphs = (s: string) => s.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

// The letter in the locked official layout, as HTML (all text escaped).
function letterHtml(l: Letter, lh: Letterhead) {
  const logo = lh.logo || "/api/branding/logo";
  return `
<div class="ltr-lh"><img src="${esc(logo)}" alt=""><div class="ltr-co"><div class="ltr-name">${esc(lh.company)}</div>${lh.tagline ? `<div class="ltr-tag">${esc(lh.tagline)}</div>` : ""}</div>
<div class="ltr-contact">${[lh.address, lh.phone, lh.email, lh.website].filter(Boolean).map(esc).join("<br>")}</div></div>
<div class="ltr-meta"><div>Ref: <b>${esc(l.ref || "—")}</b></div><div>Date: <b>${esc(longDate(l.date))}</b></div></div>
<div class="ltr-to">${[l.recipientName && `<b>${esc(l.recipientName)}</b>`, l.recipientTitle && esc(l.recipientTitle), l.organisation && esc(l.organisation), ...l.address.split("\n").filter(Boolean).map(esc)].filter(Boolean).join("<br>")}</div>
${l.subject ? `<div class="ltr-subj">Subject: ${esc(l.subject)}</div>` : ""}
<p>${esc(l.salutation)}</p>
${paragraphs(l.body).map((p) => `<p class="ltr-body">${inlineHtml(p)}</p>`).join("")}
<p class="ltr-close">${esc(l.closing)}</p>
<div class="ltr-sign"><div class="ltr-line"></div><b>${esc(l.signName)}</b><br>${esc(l.signTitle)}<br>${esc(lh.company)}</div>
${l.enclosures ? `<p class="ltr-small">Enclosures: ${esc(l.enclosures)}</p>` : ""}${l.cc ? `<p class="ltr-small">CC: ${esc(l.cc)}</p>` : ""}
<div class="ltr-foot">${esc(lh.footer || [lh.company, lh.address, lh.website].filter(Boolean).join(" · "))}</div>`;
}
const letterCss = (lh: Letterhead) => `
.ltr-lh{display:flex;align-items:center;gap:12pt;border-bottom:3pt solid ${lh.primary};padding-bottom:8pt;margin-bottom:6pt}
.ltr-lh img{height:46pt;width:auto}.ltr-co{flex:1}.ltr-name{font-size:17pt;font-weight:700;color:${lh.accent};letter-spacing:.2pt}.ltr-tag{font-size:9pt;color:#64748b}
.ltr-contact{text-align:right;font-size:8.5pt;color:#475569;line-height:1.35}
.ltr-meta{display:flex;justify-content:space-between;font-size:10pt;margin:10pt 0 14pt;color:#334155}
.ltr-to{margin-bottom:12pt;line-height:1.4}.ltr-subj{font-weight:700;margin:0 0 10pt;text-decoration:underline;text-underline-offset:2pt}
.ltr-body{text-align:justify}.ltr-close{margin-top:14pt}.ltr-sign{margin-top:30pt;line-height:1.4}.ltr-sign .ltr-line{width:150pt;border-top:1px solid #0f172a;margin-bottom:4pt}
.ltr-small{font-size:9pt;color:#475569;margin:2pt 0}
.ltr-foot{position:fixed;bottom:0;left:0;right:0;border-top:1.5pt solid ${lh.primary};padding-top:4pt;font-size:8pt;color:#64748b;text-align:center}
@media screen{.ltr-foot{position:static;margin-top:28pt}}`;

export function LettersClient({ files: initialFiles, letterhead: initialLh, canEditLetterhead, author, tab: initialTab }: { files: SavedFile[]; letterhead: Letterhead; canEditLetterhead: boolean; author: { name: string; title: string | null }; tab: string }) {
  const [lh, setLh] = React.useState(initialLh);
  const [files, setFiles] = React.useState(initialFiles);
  const [id, setId] = React.useState<string | null>(null);
  const [l, setL] = React.useState<Letter>(() => blank(initialLh, author));
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState(initialTab);
  const set = (p: Partial<Letter>) => setL({ ...l, ...p });
  const title = l.subject || `Letter to ${l.recipientName || "recipient"}`;

  // Letter fields as blocks for Word (the header and footer come from the letterhead).
  const wordBlocks = (): Block[] => {
    const P = (text: string, align?: "left" | "right" | "justify"): Block => ({ id: bid(), type: "paragraph", text, align });
    return [
      P(`Ref: **${l.ref || "—"}**`),
      P(`Date: **${longDate(l.date)}**`),
      P(""),
      P([l.recipientName && `**${l.recipientName}**`, l.recipientTitle, l.organisation, ...l.address.split("\n").filter(Boolean)].filter(Boolean).join("\n")),
      P(""),
      ...(l.subject ? [P(`**Subject: ${l.subject}**`)] : []),
      P(l.salutation),
      ...paragraphs(l.body).map((x) => P(x, "justify")),
      P(""),
      P(l.closing),
      P("\n\n_______________________"),
      P(`**${l.signName}**\n${l.signTitle}\n${lh.company}`),
      ...(l.enclosures ? [P(`Enclosures: ${l.enclosures}`)] : []),
      ...(l.cc ? [P(`CC: ${l.cc}`)] : []),
    ];
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      {canEditLetterhead && (
        <TabsList>
          <TabsTrigger value="write">Write a letter</TabsTrigger>
          <TabsTrigger value="letterhead">Letterhead</TabsTrigger>
        </TabsList>
      )}
      <TabsContent value="write" className="mt-3">
        <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
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
              setL({ ...blank(lh, author), ...f.data });
            }}
          />
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
                <div className="space-y-1">
                  <Label htmlFor="l-subj">Subject</Label>
                  <Input id="l-subj" value={l.subject} onChange={(e) => set({ subject: e.target.value })} />
                </div>
                <Input value={l.salutation} onChange={(e) => set({ salutation: e.target.value })} aria-label="Salutation" />
                <div className="space-y-1">
                  <Label htmlFor="l-body">Letter</Label>
                  <Textarea id="l-body" value={l.body} onChange={(e) => set({ body: e.target.value })} rows={12} placeholder={"Type the message. Leave an empty line between paragraphs.\n**bold** and *italic* work."} />
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
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    disabled={busy === "save"}
                    onClick={async () => {
                      setBusy("save");
                      const r = await saveFileAction("letter", { id: id ?? undefined, title, data: l });
                      setBusy(null);
                      if (!r.ok) return toast.error(r.error);
                      const nid = r.data as string;
                      setId(nid);
                      setFiles([{ id: nid, title, updated_at: new Date().toISOString() }, ...files.filter((f) => f.id !== nid)]);
                      toast.success("Letter saved");
                    }}
                  >
                    <SaveIcon /> Save
                  </Button>
                  <Button variant="outline" onClick={() => printHtml(title, letterHtml(l, lh), letterCss(lh))}>
                    <PrinterIcon /> PDF
                  </Button>
                  <Button
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
                    {busy === "docx" ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />} Word (.docx)
                  </Button>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <LockIcon className="size-3" /> Official letterhead (locked)
              </p>
              <div className="mx-auto max-w-[210mm] rounded-md border bg-white p-8 text-[13px] leading-relaxed text-slate-900 shadow-sm">
                <style>{letterCss(lh)}</style>
                {/* All text is escaped in letterHtml. */}
                <div dangerouslySetInnerHTML={{ __html: letterHtml(l, lh) }} />
              </div>
            </div>
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
