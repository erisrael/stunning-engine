"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangleIcon, BanIcon, ImageDownIcon, CheckCircle2Icon, CircleDashedIcon, CopyIcon, FileDownIcon, FilePenLineIcon, LinkIcon, Loader2Icon, LockIcon, MailIcon, PaperclipIcon, PrinterIcon, RotateCcwIcon, SaveIcon, SearchIcon, SendIcon, ShieldCheckIcon, StampIcon, Trash2Icon, UndoIcon, UserPlusIcon, UsersIcon, XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  actOnStepAction, advanceLetterAction, ocrAttachmentAction, bulkLettersAction, dispatchLetterAction, duplicateLetterAction, issueLetterAction, recordExportAction, removeAttachmentAction, retryDispatchAction, saveLetterAction, searchOrgsAction, setLegalHoldAction, submitLetterAction, voidLetterAction, withdrawLetterAction,
} from "@/app/actions/correspondence";
import { BlockEditor } from "@/components/app/tools/block-editor";
import { printHtml, type Block } from "@/components/app/tools/doc-model";
import { copyText, downloadBlob, safeName } from "@/components/app/tools/shared";
import { forOutput, letterCss, letterDocx, letterHtml, type LetterModel, type SignatureBlock, type SignLook } from "@/components/app/corr/letter-render";
import { LetterTemplatePicker } from "@/components/app/tools/letter-templates";
import { DesignEditor } from "@/components/app/design/design-editor";
import { bid as blockId } from "@/components/app/tools/doc-model";
import { type Design, type DesignOptions } from "@/lib/design";
import { designGallery, letterDesign } from "@/lib/design-templates";
import { LETTER_LIBRARY, type LetterTemplate } from "@/lib/letter-library";
import { STATUS_TONE } from "@/components/app/corr/corr-nav";
import { cleanLayout, STANDARD_FIELDS, type TemplateLayout } from "@/lib/corr-template";
import type { Letterhead } from "@/lib/tools";
import type { Org } from "@/server/corr/directory";
import { cn } from "@/lib/utils";

type Recipient = { kind: "to" | "cc" | "bcc"; orgId?: string | null; contactId?: string | null; name?: string | null; title?: string | null; organisation?: string | null; address?: string | null; email?: string | null; phone?: string | null; fax?: string | null };
type Step = { id: string; stageIndex: number; stageName: string; stageType: string; action: string; label: string | null; quorum: number | null; status: string; userName: string | null; target: { kind: string; label?: string } | null; capacity: string | null; capacityKind: string | null; comment: string | null; signed: boolean; stampImage: string | null; dueAt: string | null; actedAt: string | null };
type Data = { date?: string; salutation?: string; blocks?: unknown[]; closing?: string; signName?: string; signTitle?: string; enclosures?: string; sender?: string; receivedAt?: string; summary?: string; fields?: Record<string, string>; design?: Design | null; libraryKey?: string };
type Doc = {
  id: string; ref: string | null; direction: "outgoing" | "incoming"; status: string; classification: string; priority: string; subject: string; categoryId: string | null; categoryName: string | null; department: string | null; version: number; contentHash: string | null;
  data: Data; recipients: Recipient[]; externalRef: string | null; inReplyTo: string | null; replacesId: string | null; replacedBy: { id: string; ref: string | null } | null; voidReason: string | null; dueAt: string | null; deliveryMethod: string | null;
  creatorName: string | null; issuerName: string | null; createdAt: string; issuedAt: string | null; dispatchedAt: string | null; deliveredAt: string | null; acknowledgedAt: string | null; archivedAt: string | null; voidedAt: string | null;
  templateId: string | null; templateVersion: number | null; financialValue: number | null; recipientType: string | null; risk: string | null; verifyCode: string | null; signed: boolean; legalHold: boolean;
  snapshot: { recipients: Recipient[]; data: Data; subject: string; entity: LetterModel["entity"]; letterhead: Partial<Letterhead>; classification: string; externalRef: string | null; layout?: unknown; signatures?: SignatureBlock[]; attachments?: { n: number; name: string }[]; category?: { name: string } } | null;
  versions: { version: number; subject: string; saved_by: string | null; saved_at: string }[];
  trail: { events: { seq: number; action: string; actorName: string | null; at: string; detail: Record<string, unknown> }[]; intact: boolean; brokenAt: number | null } | null;
  workflow: { run: { status: string; startedAt: string; rules: { name: string; version: number }[]; definition: { stages: { name: string }[] } }; steps: Step[]; history: { id: string; status: string; started_at: string }[] } | null;
  readiness: { ok: boolean; reason?: string } | null;
  plan: { stages: { name: string; type: string; action: string; targets: string[] }[]; workflow: string | null; rules: string[] } | null;
  attachments: { id: string; n: number; name: string; description: string | null; mime: string; size: number; sha256: string; scan: string; ocrText?: string | null }[];
  dispatches: { id: string; channel: string; address: string | null; status: string; attempts: number; error: string | null; scheduled_at: string | null; sent_at: string | null; delivered_at: string | null; opened_at: string | null }[];
  layout: TemplateLayout | null;
  signatures: SignatureBlock[] | null;
  verifications: { result: string; ip: string | null; at: string }[];
  can: { edit: boolean; submit: boolean; withdraw: boolean; issue: boolean; deliver: boolean; void: boolean; amend: boolean; attach: boolean; hold: boolean };
};

const ACTION_LABEL: Record<string, string> = {
  created: "Created", saved: "Saved", submitted: "Submitted for approval", approved: "Approved", signed: "Signed", stamped: "Stamped", rejected: "Rejected", revision_requested: "Revision requested", withdrawn: "Withdrawn to draft", "workflow.completed": "All approvals done",
  issued: "Issued", dispatched: "Dispatched", delivered: "Delivered", acknowledged: "Acknowledged", archived: "Archived", voided: "Voided", duplicated: "Copied from another letter", "amendment.created": "Amendment of another letter", "amendment.started": "An amendment was started", replaced: "Replaced by an amendment", registered: "Registered as received",
  exported: "Exported", "attachment.added": "File attached", "attachment.removed": "File removed", "attachment.downloaded": "File downloaded", "dispatch.created": "Delivery requested", "dispatch.sent": "Sent", "dispatch.failed": "Delivery failed", "link.opened": "Opened by the recipient", "fax.confirmed": "Fax confirmed", "legal_hold.on": "Legal hold placed", "legal_hold.off": "Legal hold lifted", "bulk.created": "Bulk letters made from it",
};
const STEP_TONE: Record<string, string> = { pending: "text-amber-700 dark:text-amber-300", waiting: "text-muted-foreground", approved: "text-emerald-700 dark:text-emerald-300", signed: "text-emerald-700 dark:text-emerald-300", rejected: "text-red-700 dark:text-red-300", skipped: "text-muted-foreground line-through", cancelled: "text-muted-foreground line-through", invalidated: "text-red-700 line-through dark:text-red-300" };
const ACT: Record<string, string> = { review: "Review", approve_department: "Approve", approve_executive: "Approve", approve_financial: "Authorise", approve_legal: "Approve", approve_board: "Approve", sign: "Sign", stamp: "Stamp", issue: "Issue", dispatch: "Dispatch", prepare: "Confirm" };
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";

export function LetterClient({
  doc, categories, entity, letterhead, replyRef, statusLabels, canDirectory, templates, myTurn, stamps, fax, qr, origin, viewer, design: designOpts = null, signLook,
}: {
  design?: DesignOptions | null;
  signLook?: SignLook;
  doc: Doc; categories: { id: string; code: string; name: string }[]; entity: LetterModel["entity"]; letterhead: Letterhead; replyRef: string | null; statusLabels: Record<string, string>; canDirectory: boolean;
  templates: { id: string; name: string }[]; myTurn: { stepId: string; stage: string; action: string; capacity: string }[]; stamps: { id: string; name: string; image: string }[]; fax: boolean; qr: string | null; origin: string; viewer: { name: string; title: string | null };
}) {
  const router = useRouter();
  const editing = doc.can.edit && doc.status === "draft";
  const [subject, setSubject] = React.useState(doc.subject);
  const [data, setData] = React.useState(doc.data);
  const [recipients, setRecipients] = React.useState<Recipient[]>(doc.recipients);
  const [meta, setMeta] = React.useState({ classification: doc.classification, priority: doc.priority, department: doc.department ?? "", externalRef: doc.externalRef ?? "", categoryId: doc.categoryId ?? "", templateId: doc.templateId ?? "", financialValue: doc.financialValue == null ? "" : String(doc.financialValue), recipientType: doc.recipientType ?? "", risk: doc.risk ?? "" });
  const [version, setVersion] = React.useState(doc.version);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const mark = () => setDirty(true);
  const [mode, setMode] = React.useState<"write" | "design" | "preview">(designOpts?.defaultMode === "design" && doc.data.design ? "design" : "write");

  // What the letter looks like: the live draft while writing, the frozen snapshot once issued.
  const s = doc.snapshot;
  const model: LetterModel = s
    ? {
        documentId: doc.id, ref: doc.ref, status: doc.status, classification: s.classification, subject: s.subject, category: s.category?.name ?? doc.categoryName, entity: s.entity, letterhead: s.letterhead, recipients: s.recipients.filter((r) => r.kind !== "bcc"), data: s.data, externalRef: s.externalRef, inReplyToRef: replyRef,
        layout: s.layout ? cleanLayout(s.layout) : null, signatures: s.signatures, attachments: s.attachments, qr, department: doc.department, preparedBy: doc.creatorName, signLook,
      }
    : {
        documentId: doc.id, ref: null, status: doc.status, classification: meta.classification, subject, category: categories.find((c) => c.id === meta.categoryId)?.name ?? doc.categoryName, entity, letterhead, recipients: recipients.filter((r) => r.kind !== "bcc"), data, externalRef: meta.externalRef || null, inReplyToRef: replyRef,
        layout: doc.layout, signatures: doc.signatures ?? undefined, attachments: doc.attachments.map((a) => ({ n: a.n, name: a.name })), qr: null, department: meta.department || null, preparedBy: doc.creatorName, signLook,
      };

  // Design mode: the letter as a free design, built from what was written the first time.
  const brand = { company: entity.legalName || letterhead.company || "", tagline: letterhead.tagline, address: entity.address ?? letterhead.address, phone: entity.phone ?? letterhead.phone, email: entity.email ?? letterhead.email, website: entity.website ?? letterhead.website, footer: letterhead.footer, primary: letterhead.primary ?? "#16a34a", accent: letterhead.accent ?? "#0f172a", hasLogo: true };
  const textOf = (b: unknown[]) => (b as Block[]).map((x) => ("text" in x && typeof x.text === "string" ? x.text : "items" in x && Array.isArray(x.items) ? x.items.map((i) => `• ${i}`).join("\n") : "")).filter(Boolean).join("\n\n").replace(/\*\*|__|~~|==/g, "");
  const buildDesign = (): Design => {
    const to = recipients.find((r) => r.kind === "to");
    return letterDesign(brand, { ref: "{{document_number}}", date: "{{issue_date}}", to: [to?.name, to?.title, to?.organisation, to?.address].filter(Boolean).join("\n") || "{{recipient_name}}", subject, salutation: data.salutation ?? "", body: textOf(data.blocks ?? []), closing: data.closing ?? "", signName: data.signName ?? "{{signatory_name}}", signTitle: data.signTitle ?? "{{signatory_position}}", enclosures: data.enclosures }, (LETTER_LIBRARY.find((t) => t.key === data.libraryKey)?.design as "classic") ?? "classic");
  };
  const goMode = (m: "write" | "design" | "preview") => {
    if (m === "design" && !data.design) (setData({ ...data, design: buildDesign() }), mark());
    setMode(m);
  };
  const libTemplate = LETTER_LIBRARY.find((t) => t.key === data.libraryKey) ?? null;
  const applyLibrary = (t: LetterTemplate) => {
    if (((data.blocks ?? []).length || subject) && !confirm("Replace the subject and text with this template?")) return;
    const blocks: Block[] = t.body.split(/\n\s*\n/).map((p) => ({ id: blockId(), type: "paragraph", text: p.trim(), align: "justify" }));
    setSubject(t.subject);
    setData({ ...data, salutation: t.salutation, closing: t.closing, blocks, libraryKey: t.key, design: data.design ? null : data.design, fields: { ...Object.fromEntries(t.fields.map((f) => [f.key, data.fields?.[f.key] ?? ""])), ...(data.fields ?? {}) } });
    const cat = categories.find((c) => c.code === t.category);
    setMeta({ ...meta, categoryId: cat?.id ?? meta.categoryId, classification: t.classification ?? meta.classification });
    mark();
    toast.success(`${t.label}: fill in the details, then check the text`);
  };

  const save = async (quiet = false) => {
    setBusy("save");
    const r = await saveLetterAction(doc.id, {
      subject, data, recipients, classification: meta.classification, priority: meta.priority, department: meta.department || null, categoryId: meta.categoryId || undefined, externalRef: meta.externalRef || null, baseVersion: version,
      templateId: meta.templateId || null, financialValue: meta.financialValue === "" ? null : Number(meta.financialValue), recipientType: meta.recipientType || null, risk: meta.risk || null,
    });
    setBusy(null);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setVersion((r.data as { version: number }).version);
    setDirty(false);
    if (!quiet) toast.success("Draft saved");
    return true;
  };
  React.useEffect(() => {
    if (!dirty || !editing) return;
    const t = setTimeout(() => void save(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, subject, data, recipients, meta]);

  const act = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, ok: string, then?: (d: unknown) => void) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast.error(r.error ?? "Could not do that.");
    toast.success(ok);
    if (then) then(r.data);
    else router.refresh();
  };
  const previewRef = React.useRef<HTMLDivElement>(null);
  const exportAs = async (kind: "pdf" | "docx" | "png" | "jpeg" | "fax") => {
    void recordExportAction(doc.id, kind === "jpeg" ? "png" : kind === "fax" ? "fax_pdf" : kind);
    if (kind === "pdf") return printHtml(model.subject || "Letter", letterHtml(forOutput(model, "pdf")), letterCss(model));
    // Fax-ready: black and white, higher contrast, no faint backgrounds (fax machines lose them).
    if (kind === "fax") return printHtml(`${model.subject || "Letter"} (fax)`, letterHtml({ ...model, layout: model.layout ? { ...model.layout, background: null, watermark: null } : model.layout }), `${letterCss(model)}\nhtml{filter:grayscale(1) contrast(1.25)}`);
    if (kind === "png" || kind === "jpeg") {
      const el = previewRef.current?.querySelector(".cl-doc") as HTMLElement | null;
      if (!el) return toast.error("Open the letter preview first.");
      setBusy("img");
      try {
        const ms = await import("modern-screenshot");
        const url = kind === "png" ? await ms.domToPng(el, { scale: 2, backgroundColor: "#ffffff" }) : await ms.domToJpeg(el, { scale: 2, quality: 0.92, backgroundColor: "#ffffff" });
        const a = document.createElement("a");
        a.href = url;
        a.download = safeName(doc.ref ?? (model.subject || "letter"), kind === "png" ? "png" : "jpg");
        a.click();
      } catch {
        toast.error("The picture could not be made.");
      }
      setBusy(null);
      return;
    }
    setBusy("docx");
    try {
      downloadBlob(await letterDocx(forOutput(model, "word")), safeName(doc.ref ?? (model.subject || "letter"), "docx"));
    } catch {
      toast.error("The Word file could not be made.");
    }
    setBusy(null);
  };

  const incoming = doc.direction === "incoming";
  const fieldKeys = (doc.layout?.fields ?? []).filter((f) => !STANDARD_FIELDS.some((x) => x.key === f.key));
  return (
    <div className="space-y-4">
      {doc.status === "void" && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
          <BanIcon className="mt-0.5 size-4 text-red-600" />
          <span>
            <b>Void</b> since {when(doc.voidedAt)}: {doc.voidReason}. {doc.ref ? `The number ${doc.ref} stays taken and is never given again.` : ""}
          </span>
        </div>
      )}
      {doc.replacedBy && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Replaced by an amendment: <Link className="font-medium underline" href={`/correspondence/${doc.replacedBy.id}`}>{doc.replacedBy.ref ?? "draft"}</Link>
        </div>
      )}
      {doc.replacesId && (
        <div className="rounded-md border p-3 text-sm">
          This letter amends <Link className="underline" href={`/correspondence/${doc.replacesId}`}>an earlier letter</Link>; that one stays in the registry as it was.
        </div>
      )}
      {doc.legalHold && (
        <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
          <LockIcon className="size-4" /> On legal hold: kept whatever its retention period says.
        </div>
      )}
      {myTurn.length > 0 && (
        <MyTurn steps={myTurn} stamps={stamps} busy={busy} act={act} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs", STATUS_TONE[doc.status] ?? "bg-amber-500/15 text-amber-800 dark:text-amber-200")}>{statusLabels[doc.status] ?? doc.status}</span>
        <span className="font-mono text-xs text-muted-foreground" title="Permanent document ID">ID {doc.id}</span>
        {editing && !incoming && designOpts && designOpts.allowModeSwitch && (
          <div className="inline-flex rounded-md border p-0.5 text-xs" role="tablist" aria-label="Letter mode">
            {(["write", "design", "preview"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => goMode(m)} className={cn("rounded px-2.5 py-1 capitalize", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {m}
              </button>
            ))}
          </div>
        )}
        {editing && !incoming && <LetterTemplatePicker onPick={applyLibrary} label={libTemplate ? libTemplate.label : "Letter templates"} />}
        {editing && data.design && mode !== "write" && (
          <Button size="sm" variant="ghost" onClick={() => confirm("Rebuild the design from the written text? Changes made in the design are replaced.") && (setData({ ...data, design: buildDesign() }), mark())}>
            <RotateCcwIcon /> Rebuild design
          </Button>
        )}
        {editing && data.design && mode === "write" && (
          <Button size="sm" variant="ghost" onClick={() => confirm("Stop using the design for this letter? It goes back to the template's layout.") && (setData({ ...data, design: null }), mark())}>
            Use the template layout
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {editing && (
            <Button size="sm" variant="outline" disabled={busy === "save"} onClick={() => save()}>
              {busy === "save" ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} {dirty ? "Save" : "Saved"}
            </Button>
          )}
          {doc.can.submit && !incoming && (
            <Button
              size="sm"
              disabled={!!busy}
              onClick={async () => {
                if (dirty && !(await save(true))) return;
                if (!confirm("Submit for approval? The letter is locked while it is reviewed; a rejection sends it back to you.")) return;
                await act("submit", () => submitLetterAction(doc.id), "Submitted for approval");
              }}
            >
              <UsersIcon /> Submit for approval
            </Button>
          )}
          {doc.can.withdraw && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => confirm("Withdraw to draft? Approvals already given are cancelled and asked for again on resubmission.") && act("withdraw", () => withdrawLetterAction(doc.id), "Back to draft")}>
              <UndoIcon /> Withdraw
            </Button>
          )}
          {doc.can.issue && !incoming && (
            <Button
              size="sm"
              disabled={!!busy}
              onClick={async () => {
                if (dirty && !(await save(true))) return;
                if (!confirm("Issue this letter? It gets its official number and is signed by the server; it can no longer be changed (only amended by a new letter).")) return;
                await act("issue", () => issueLetterAction(doc.id), "Issued", (d) => (toast.success(`Number ${(d as { ref: string }).ref}`), router.refresh()));
              }}
            >
              {busy === "issue" ? <Loader2Icon className="animate-spin" /> : <StampIcon />} Issue
            </Button>
          )}
          {doc.can.deliver && (
            <Button size="sm" variant="outline" onClick={() => setSendOpen(true)}>
              <SendIcon /> Send
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => exportAs("pdf")}>
            <PrinterIcon /> PDF / print
          </Button>
          <Button size="sm" variant="outline" disabled={busy === "docx"} onClick={() => exportAs("docx")}>
            {busy === "docx" ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />} Word
          </Button>
          {!incoming && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy === "img"}>
                  {busy === "img" ? <Loader2Icon className="animate-spin" /> : <ImageDownIcon />} More
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 space-y-1 p-1" align="end">
                <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => exportAs("png")}>Page picture (PNG)</Button>
                <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => exportAs("jpeg")}>Page picture (JPEG)</Button>
                <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => exportAs("fax")}>Fax-ready PDF (black and white)</Button>
              </PopoverContent>
            </Popover>
          )}
          {doc.can.amend && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("amend", () => duplicateLetterAction(doc.id, "amend"), "Amendment started", (id) => router.push(`/correspondence/${id as string}`))}>
              <FilePenLineIcon /> Amend
            </Button>
          )}
          {!incoming && (
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("copy", () => duplicateLetterAction(doc.id, "copy"), "Copied to a new draft", (id) => router.push(`/correspondence/${id as string}`))}>
              <CopyIcon /> Copy
            </Button>
          )}
          {editing && (
            <Button size="sm" variant="ghost" onClick={() => setBulkOpen(true)}>
              <UsersIcon /> Bulk
            </Button>
          )}
          {doc.can.hold && (
            <Button size="sm" variant="ghost" onClick={() => {
              const reason = doc.legalHold ? "" : prompt("Why is the letter placed on legal hold?") ?? "";
              if (!doc.legalHold && reason.trim().length < 3) return;
              void act("hold", () => setLegalHoldAction(doc.id, !doc.legalHold, reason), doc.legalHold ? "Hold lifted" : "Legal hold placed");
            }}>
              <LockIcon /> {doc.legalHold ? "Lift hold" : "Legal hold"}
            </Button>
          )}
          {doc.can.void && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setVoidOpen(true)}>
              <Trash2Icon /> Void
            </Button>
          )}
        </div>
      </div>

      {doc.readiness && !doc.readiness.ok && doc.status !== "draft" && <p className="text-xs text-amber-700 dark:text-amber-300">{doc.readiness.reason}</p>}

      {editing && !incoming && mode !== "write" && data.design && designOpts && (
        <DesignEditor
          design={data.design}
          onChange={(d) => (setData({ ...data, design: d }), mark())}
          options={designOpts}
          values={{ ...(data.fields ?? {}), subject, company_name: brand.company, recipient_name: recipients.find((r) => r.kind === "to")?.name ?? "", recipient_company: recipients.find((r) => r.kind === "to")?.organisation ?? "" }}
          extras={{ logo: letterhead.logo || "/api/branding/logo" }}
          templates={designGallery(brand).filter((g) => g.key.startsWith("letter") || g.key === "memo" || g.key === "notice" || g.key === "certificate")}
          title={subject || "Letter"}
          slots
          mode={mode === "preview" ? "preview" : "design"}
          onModeChange={(m) => setMode(m === "preview" ? "preview" : "design")}
        />
      )}
      <div className={cn("grid gap-4", editing ? "2xl:grid-cols-2" : "xl:grid-cols-[minmax(0,1fr)_22rem]", editing && mode !== "write" && data.design && "hidden")}>
        {editing && (
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Category</span>
                  <select className={sel} value={meta.categoryId} onChange={(e) => (setMeta({ ...meta, categoryId: e.target.value }), mark())}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Template</span>
                  <select className={sel} value={meta.templateId} onChange={(e) => (setMeta({ ...meta, templateId: e.target.value }), mark())}>
                    <option value="">Company letterhead (default)</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Classification</span>
                  <select className={sel} value={meta.classification} onChange={(e) => (setMeta({ ...meta, classification: e.target.value }), mark())}>
                    {["public", "internal", "confidential", "restricted"].map((x) => <option key={x} value={x}>{x[0]!.toUpperCase() + x.slice(1)}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Priority</span>
                  <select className={sel} value={meta.priority} onChange={(e) => (setMeta({ ...meta, priority: e.target.value }), mark())}>
                    {["low", "normal", "high", "urgent"].map((x) => <option key={x} value={x}>{x[0]!.toUpperCase() + x.slice(1)}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Department</span>
                  <Input value={meta.department} onChange={(e) => (setMeta({ ...meta, department: e.target.value }), mark())} placeholder="e.g. HR" />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Amount involved (ETB)</span>
                  <Input type="number" min={0} value={meta.financialValue} onChange={(e) => (setMeta({ ...meta, financialValue: e.target.value }), mark())} placeholder="if any" />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Recipient type</span>
                  <select className={sel} value={meta.recipientType} onChange={(e) => (setMeta({ ...meta, recipientType: e.target.value }), mark())}>
                    <option value="">Not set</option>
                    {["government", "regulator", "school", "partner", "supplier", "customer", "bank", "court", "staff", "other"].map((x) => <option key={x} value={x}>{x[0]!.toUpperCase() + x.slice(1)}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Risk</span>
                  <select className={sel} value={meta.risk} onChange={(e) => (setMeta({ ...meta, risk: e.target.value }), mark())}>
                    <option value="">Not set</option>
                    {["low", "medium", "high"].map((x) => <option key={x} value={x}>{x[0]!.toUpperCase() + x.slice(1)}</option>)}
                  </select>
                </label>
              </div>
              {doc.plan && (
                <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                  {doc.plan.stages.length ? (
                    <>
                      Goes through: {doc.plan.stages.map((st) => `${st.name} (${st.targets.join(st.type === "alternative" ? " or " : ", ")})`).join(" → ")}
                      {doc.plan.workflow ? ` · workflow "${doc.plan.workflow}"` : ""}
                      {doc.plan.rules.length ? ` · rules: ${doc.plan.rules.join(", ")}` : ""}. Save to update this after changing the category, amount or recipient type.
                    </>
                  ) : (
                    "No approval is needed for this kind of letter: it is issued directly by someone who may issue letters."
                  )}
                </p>
              )}

              <Recipients value={recipients} onChange={(v) => (setRecipients(v), mark())} canDirectory={canDirectory} />

              <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Subject</span>
                  <Input value={subject} onChange={(e) => (setSubject(e.target.value), mark())} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Their reference</span>
                  <Input value={meta.externalRef} onChange={(e) => (setMeta({ ...meta, externalRef: e.target.value }), mark())} placeholder="optional" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Letter date</span>
                  <Input type="date" value={data.date ?? ""} onChange={(e) => (setData({ ...data, date: e.target.value }), mark())} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Salutation</span>
                  <Input value={data.salutation ?? ""} onChange={(e) => (setData({ ...data, salutation: e.target.value }), mark())} />
                </label>
              </div>
              {libTemplate && libTemplate.fields.length > 0 && (
                <fieldset className="grid gap-3 rounded-md border border-amber-500/40 p-3 sm:grid-cols-2">
                  <legend className="px-1 text-xs font-medium text-muted-foreground">Details for {libTemplate.label.toLowerCase()}</legend>
                  {libTemplate.fields.map((f) => (
                    <label key={f.key} className={cn("space-y-1 text-xs", f.kind === "long" && "sm:col-span-2")}>
                      <span className="font-medium">{f.label}</span>
                      {f.kind === "long" ? (
                        <Textarea rows={2} value={data.fields?.[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => (setData({ ...data, fields: { ...data.fields, [f.key]: e.target.value } }), mark())} />
                      ) : (
                        <Input value={data.fields?.[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => (setData({ ...data, fields: { ...data.fields, [f.key]: e.target.value } }), mark())} />
                      )}
                    </label>
                  ))}
                </fieldset>
              )}
              {fieldKeys.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {fieldKeys.map((f) => (
                    <label key={f.key} className="space-y-1 text-xs">
                      <span className="font-medium">{f.label} <span className="font-mono text-muted-foreground">{`{{${f.key}}}`}</span></span>
                      <Input value={data.fields?.[f.key] ?? f.default ?? ""} onChange={(e) => (setData({ ...data, fields: { ...data.fields, [f.key]: e.target.value } }), mark())} />
                    </label>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">Letter</p>
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted">
                    <FileDownIcon className="size-3.5" /> Import from Word (.docx)
                    <input
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        try {
                          const { docxToBlocks } = await import("@/components/app/corr/docx-import");
                          const blocks = await docxToBlocks(f);
                          if (!blocks.length) return toast.error("No text was found in that file.");
                          if ((data.blocks ?? []).length && !confirm("Replace the letter's text with the Word file's?")) return;
                          setData({ ...data, blocks });
                          mark();
                          toast.success(`${blocks.length} parts imported`);
                        } catch {
                          toast.error("That Word file could not be read.");
                        }
                      }}
                    />
                  </label>
                </div>
                <BlockEditor blocks={(data.blocks ?? []) as Block[]} onChange={(blocks) => (setData({ ...data, blocks }), mark())} />
                <p className="text-[11px] text-muted-foreground">
                  Fields like <span className="font-mono">{"{{recipient_name}}"}</span>, <span className="font-mono">{"{{company_name}}"}</span> or <span className="font-mono">{"{{document_number}}"}</span> are filled in automatically.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Closing</span>
                  <Input value={data.closing ?? ""} onChange={(e) => (setData({ ...data, closing: e.target.value }), mark())} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Signed by (when no workflow)</span>
                  <Input value={data.signName ?? ""} onChange={(e) => (setData({ ...data, signName: e.target.value }), mark())} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium">Position</span>
                  <Input value={data.signTitle ?? ""} onChange={(e) => (setData({ ...data, signTitle: e.target.value }), mark())} />
                </label>
              </div>
              <label className="block space-y-1 text-xs">
                <span className="font-medium">Enclosures (besides attached files)</span>
                <Input value={data.enclosures ?? ""} onChange={(e) => (setData({ ...data, enclosures: e.target.value }), mark())} placeholder="optional" />
              </label>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {incoming && !editing && (
            <Card>
              <CardContent className="space-y-1 p-4 text-sm">
                <p><span className="text-muted-foreground">From:</span> {doc.data.sender ?? model.recipients[0]?.organisation}</p>
                <p><span className="text-muted-foreground">Their reference:</span> {doc.externalRef ?? "-"}</p>
                <p><span className="text-muted-foreground">Received:</span> {when(doc.data.receivedAt ?? doc.deliveredAt)}</p>
                {doc.dueAt && <p className={cn(new Date(doc.dueAt) < new Date() && doc.status !== "acknowledged" && "text-destructive")}><span className="text-muted-foreground">Answer by:</span> {when(doc.dueAt)}</p>}
                {doc.data.summary && <p className="pt-2 whitespace-pre-wrap">{doc.data.summary}</p>}
              </CardContent>
            </Card>
          )}
          {!incoming && (
            <div ref={previewRef} className="mx-auto w-fit max-w-full overflow-x-auto rounded-md border bg-white text-slate-900 shadow-sm">
              <style>{letterCss(model)}</style>
              {/* Every piece of text is escaped in letterHtml. */}
              <div dangerouslySetInnerHTML={{ __html: letterHtml(model) }} />
            </div>
          )}
        </div>

        {!editing && <Side doc={doc} statusLabels={statusLabels} />}
      </div>

      {(doc.workflow || doc.attachments.length || doc.can.attach || doc.dispatches.length) && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {doc.workflow && <WorkflowPanel wf={doc.workflow} />}
          {(doc.attachments.length > 0 || doc.can.attach) && <Attachments doc={doc} onChange={() => router.refresh()} />}
          {doc.dispatches.length > 0 && <Dispatches list={doc.dispatches} busy={busy} act={act} />}
        </div>
      )}

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <VoidDialog ref_={doc.ref} busy={busy === "void"} onVoid={(reason) => act("void", () => voidLetterAction(doc.id, reason), "Letter voided", () => (setVoidOpen(false), router.refresh()))} />
      </Dialog>
      {sendOpen && <SendDialog doc={doc} fax={fax} onClose={() => setSendOpen(false)} />}
      {bulkOpen && <BulkDialog docId={doc.id} fields={fieldKeys.map((f) => f.key)} onClose={() => setBulkOpen(false)} />}
      <p className="text-[11px] text-muted-foreground">
        {doc.verifyCode ? <>Verification code <span className="font-mono">{doc.verifyCode}</span> · <Link className="underline" href={`/verify/${doc.verifyCode}`}>check page</Link> · </> : null}
        Signed in as {viewer.name}. Public verification address: {origin}/verify
      </p>
    </div>
  );
}

function MyTurn({ steps, stamps, busy, act }: { steps: { stepId: string; stage: string; action: string; capacity: string }[]; stamps: { id: string; name: string; image: string }[]; busy: string | null; act: (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void }) {
  const [comment, setComment] = React.useState("");
  const [stamp, setStamp] = React.useState(stamps[0]?.id ?? "");
  return (
    <Card className="border-amber-500/50">
      <CardContent className="space-y-3 p-4">
        {steps.map((s) => (
          <div key={s.stepId} className="space-y-2">
            <p className="text-sm">
              <b>Your {ACT[s.action]?.toLowerCase() ?? "action"} is needed</b> at <b>{s.stage}</b>, as <i>{s.capacity}</i>.
            </p>
            {s.action === "stamp" && (
              <div className="flex flex-wrap items-center gap-2">
                {stamps.map((st) => (
                  <button key={st.id} type="button" onClick={() => setStamp(st.id)} className={cn("rounded-md border p-1", stamp === st.id && "border-primary ring-1 ring-primary")} title={st.name}>
                    <img src={st.image} alt={st.name} className="h-12 w-auto" />
                  </button>
                ))}
                {!stamps.length && <span className="text-xs text-muted-foreground">No stamps are set up.</span>}
              </div>
            )}
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Comment (needed to reject or ask for changes)" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!!busy} onClick={() => act(`step${s.stepId}`, () => actOnStepAction(s.stepId, { decision: "approve", comment, stampId: s.action === "stamp" ? stamp : null }), s.action === "sign" ? "Signed" : s.action === "stamp" ? "Stamped" : "Approved")}>
                <CheckCircle2Icon /> {ACT[s.action] ?? "Approve"}
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(`rev${s.stepId}`, () => actOnStepAction(s.stepId, { decision: "revise", comment }), "Sent back for changes")}>
                <RotateCcwIcon /> Ask for changes
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={!!busy} onClick={() => act(`rej${s.stepId}`, () => actOnStepAction(s.stepId, { decision: "reject", comment }), "Rejected")}>
                <XCircleIcon /> Reject
              </Button>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">Signing uses your registered signature (Correspondence, Signatures and stamps) and records the capacity shown above.</p>
      </CardContent>
    </Card>
  );
}

function WorkflowPanel({ wf }: { wf: NonNullable<Doc["workflow"]> }) {
  const stages = [...new Set(wf.steps.map((s) => s.stageIndex))];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          Approvals <span className="text-xs font-normal text-muted-foreground">({wf.run.status}{wf.run.rules.length ? ` · rules: ${wf.run.rules.map((r) => r.name).join(", ")}` : ""})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {stages.map((i) => {
          const list = wf.steps.filter((s) => s.stageIndex === i);
          const first = list[0]!;
          return (
            <div key={i} className="space-y-1">
              <p className="font-medium">
                {i + 1}. {first.stageName} <span className="font-normal text-muted-foreground">({first.stageType === "quorum" ? `${first.quorum} of ${list.length}` : first.stageType === "alternative" ? "any one" : first.stageType === "parallel" ? "all, in any order" : "in order"})</span>
              </p>
              {list.map((s) => (
                <p key={s.id} className={cn("flex items-start gap-1.5 pl-3", STEP_TONE[s.status])}>
                  {s.status === "approved" || s.status === "signed" ? <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" /> : s.status === "rejected" ? <XCircleIcon className="mt-0.5 size-3.5 shrink-0" /> : <CircleDashedIcon className="mt-0.5 size-3.5 shrink-0" />}
                  <span>
                    {s.userName ? <b>{s.userName}</b> : s.target?.label ?? s.target?.kind}
                    {s.capacity && s.userName ? <span className="text-muted-foreground">, {s.capacity}</span> : null} · {s.status}
                    {s.actedAt ? ` ${when(s.actedAt)}` : s.dueAt ? ` · due ${when(s.dueAt)}` : ""}
                    {s.comment ? <span className="block text-muted-foreground">“{s.comment}”</span> : null}
                  </span>
                  {s.stampImage && <img src={s.stampImage} alt="Stamp" className="ml-auto h-8" />}
                </p>
              ))}
            </div>
          );
        })}
        {wf.history.length > 1 && <p className="border-t pt-2 text-muted-foreground">Earlier rounds: {wf.history.slice(1).map((h) => `${h.status} (${when(h.started_at)})`).join("; ")}</p>}
      </CardContent>
    </Card>
  );
}

function Attachments({ doc, onChange }: { doc: Doc; onChange: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [reading, setReading] = React.useState<string | null>(null);
  const [read, setRead] = React.useState<Record<string, { text: string; hints: { ref: string | null; subject: string | null; date: string | null } }>>({});
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Attachments ({doc.attachments.length})</CardTitle>
        {doc.can.attach && (
          <>
            <input
              ref={ref}
              type="file"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy(true);
                const fd = new FormData();
                fd.set("doc", doc.id);
                fd.set("file", f);
                const res = await fetch("/api/corr/attachments", { method: "POST", body: fd });
                setBusy(false);
                const j = await res.json().catch(() => ({ error: "Upload failed." }));
                if (!res.ok) return toast.error(j.error);
                toast.success("Attached");
                onChange();
              }}
            />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>
              {busy ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />} Attach
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent className="space-y-1 text-xs">
        {doc.attachments.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <span className="w-5 text-right tabular text-muted-foreground">{a.n}.</span>
            <a href={`/api/corr/attachments/${a.id}`} className="min-w-0 flex-1 truncate hover:underline" title={`SHA-256 ${a.sha256}`}>
              {a.name}
            </a>
            <span className="shrink-0 text-muted-foreground">{(a.size / 1024).toFixed(0)} KB</span>
            <span className={cn("shrink-0 rounded px-1 text-[10px]", a.scan === "clean" ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "bg-muted")}>{a.scan === "clean" ? "scanned" : "not scanned"}</span>
            {(a.mime === "application/pdf" || a.mime.startsWith("image/")) && (
              <button
                type="button"
                className="shrink-0 rounded px-1 text-[10px] underline-offset-2 hover:underline"
                disabled={reading === a.id}
                onClick={async () => {
                  setReading(a.id);
                  const r = await ocrAttachmentAction(a.id);
                  setReading(null);
                  if (!r.ok) return toast.error(r.error);
                  setRead({ ...read, [a.id]: r.data as never });
                }}
              >
                {reading === a.id ? "Reading…" : a.ocrText ? "Read again" : "Read the text"}
              </button>
            )}
            {doc.can.edit && (
              <button type="button" aria-label={`Remove ${a.name}`} className="rounded p-0.5 hover:bg-muted" onClick={async () => { const r = await removeAttachmentAction(a.id); if (!r.ok) return toast.error(r.error); onChange(); }}>
                <Trash2Icon className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {doc.attachments.map((a) => {
          const text = read[a.id]?.text ?? a.ocrText;
          if (!text) return null;
          const hints = read[a.id]?.hints;
          return (
            <details key={`t${a.id}`} className="rounded-md border p-2" open={!!read[a.id]}>
              <summary className="cursor-pointer">Text read from {a.name}</summary>
              {hints && (hints.ref || hints.subject || hints.date) && (
                <p className="mt-1 text-muted-foreground">Found: {[hints.ref && `reference ${hints.ref}`, hints.subject && `subject “${hints.subject}”`, hints.date && `date ${hints.date}`].filter(Boolean).join(" · ")}</p>
              )}
              <pre className="mt-1 max-h-60 overflow-auto font-sans whitespace-pre-wrap">{text}</pre>
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => copyText(text, "Text copied")}>Copy the text</Button>
            </details>
          );
        })}
        {!doc.attachments.length && <p className="text-muted-foreground">PDF, Word, Excel, PowerPoint or pictures, up to 10 MB each. They are listed on the letter.{doc.direction === "incoming" ? " Scans are read (OCR) so their text can be searched." : ""}</p>}
      </CardContent>
    </Card>
  );
}

function Dispatches({ list, busy, act }: { list: Doc["dispatches"]; busy: string | null; act: (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Deliveries</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-xs">
        {list.map((d) => (
          <div key={d.id} className="flex items-start gap-2">
            {d.channel === "email" ? <MailIcon className="mt-0.5 size-3.5" /> : d.channel === "fax" ? <PrinterIcon className="mt-0.5 size-3.5" /> : <LinkIcon className="mt-0.5 size-3.5" />}
            <span className="min-w-0 flex-1">
              {d.channel} {d.address ? `to ${d.address}` : ""} · <b className={cn(d.status === "failed" && "text-destructive")}>{d.status}</b>
              <span className="block text-muted-foreground">
                {d.scheduled_at && d.status === "scheduled" ? `scheduled ${when(d.scheduled_at)}` : d.sent_at ? `sent ${when(d.sent_at)}` : ""}
                {d.opened_at ? ` · opened ${when(d.opened_at)}` : ""}
                {d.error ? ` · ${d.error}` : ""}
              </span>
            </span>
            {d.status === "failed" && (
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={!!busy} onClick={() => act(`retry${d.id}`, () => retryDispatchAction(d.id), "Sent again")}>
                Retry
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SendDialog({ doc, fax, onClose }: { doc: Doc; fax: boolean; onClose: () => void }) {
  const router = useRouter();
  const first = doc.snapshot?.recipients.find((r) => r.kind === "to");
  const [f, setF] = React.useState({ channel: "email" as "email" | "link" | "fax", address: first?.email ?? "", message: "", when: "", days: "30" });
  const [busy, setBusy] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState("hand");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send the letter</DialogTitle>
          <DialogDescription>Email sends a secure link to the issued letter (opening it records delivery). A link can also be handed over. Fax goes through the connected fax service.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-1">
            {(["email", "link", ...(fax ? ["fax"] : [])] as const).map((c) => (
              <Button key={c} size="sm" variant={f.channel === c ? "secondary" : "ghost"} onClick={() => setF({ ...f, channel: c as typeof f.channel, address: c === "fax" ? (first?.fax ?? "") : c === "email" ? (first?.email ?? "") : "" })} className="capitalize">
                {c}
              </Button>
            ))}
          </div>
          {f.channel !== "link" && <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder={f.channel === "fax" ? "Fax number with country code" : "Email address"} />}
          {f.channel === "email" && <Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} rows={3} placeholder="A short message (optional)" />}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="font-medium">Send at (optional)</span>
              <Input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium">Link works for (days)</span>
              <Input type="number" min={1} max={365} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} />
            </label>
          </div>
          {link && (
            <div className="flex gap-1">
              <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button size="icon" variant="outline" onClick={() => copyText(link, "Link copied")} aria-label="Copy link">
                <CopyIcon />
              </Button>
            </div>
          )}
          <div className="border-t pt-3">
            <p className="mb-1 text-xs font-medium">Or record a delivery made by hand</p>
            <div className="flex flex-wrap gap-2">
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value={manual} onChange={(e) => setManual(e.target.value)}>
                {["hand", "courier", "post", "portal", "other"].map((m) => <option key={m} value={m}>{m[0]!.toUpperCase() + m.slice(1)}</option>)}
              </select>
              {(["dispatched", "delivered", "acknowledged"] as const).map((st) => (
                <Button key={st} size="sm" variant="outline" className="h-8 text-xs" onClick={async () => { const r = await advanceLetterAction(doc.id, st, { method: manual }); if (!r.ok) return toast.error(r.error); toast.success(`Marked ${st}`); router.refresh(); }}>
                  Mark {st}
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={async () => { const r = await advanceLetterAction(doc.id, "archived"); if (!r.ok) return toast.error(r.error); toast.success("Archived"); router.refresh(); onClose(); }}>
                Archive
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || (f.channel !== "link" && !f.address.trim())}
            onClick={async () => {
              setBusy(true);
              const r = await dispatchLetterAction(doc.id, { channel: f.channel, address: f.address, message: f.message, scheduledAt: f.when ? new Date(f.when).toISOString() : null, linkDays: Number(f.days) });
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              const d = r.data as { link: string | null };
              toast.success(f.when ? "Scheduled" : f.channel === "fax" ? "Handed to the fax service (recorded as faxed once it confirms)" : "Sent");
              if (d.link) setLink(d.link);
              else onClose();
              router.refresh();
            }}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} {f.when ? "Schedule" : f.channel === "link" ? "Make the link" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDialog({ docId, fields, onClose }: { docId: string; fields: string[]; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const cols = ["name", "title", "organisation", "address", "email", ...fields];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk letters from this draft</DialogTitle>
          <DialogDescription>Paste rows from a spreadsheet (tab or comma separated), with a heading row. One draft is made per row with that recipient and fields; each gets its own number when issued.</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Columns: <span className="font-mono">{cols.join(", ")}</span></p>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="font-mono text-xs" placeholder={cols.join("\t")} />
        <DialogFooter>
          <Button
            disabled={busy || !text.trim()}
            onClick={async () => {
              const lines = text.trim().split(/\r?\n/);
              const sep = lines[0]!.includes("\t") ? "\t" : ",";
              const head = lines[0]!.split(sep).map((h) => h.trim().toLowerCase());
              const rows = lines.slice(1).map((l) => {
                const v = l.split(sep);
                const g = (k: string) => (v[head.indexOf(k)] ?? "").trim();
                return { name: g("name"), title: g("title"), organisation: g("organisation") || g("organization") || g("company"), address: g("address"), email: g("email"), fields: Object.fromEntries(fields.map((k) => [k, g(k)]).filter(([, x]) => x)) };
              });
              setBusy(true);
              const r = await bulkLettersAction(docId, rows);
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              toast.success(`${(r.data as { ids: string[] }).ids.length} drafts made`);
              onClose();
              router.push("/correspondence?mine=1&status=draft");
            }}
          >
            Make the drafts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({ ref_, busy, onVoid }: { ref_: string | null; busy: boolean; onVoid: (reason: string) => void }) {
  const [reason, setReason] = React.useState("");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Void this letter?</DialogTitle>
        <DialogDescription>{ref_ ? `It stays in the registry marked void, and the number ${ref_} is never given to another letter.` : "The draft stays in the registry marked void."} This cannot be undone.</DialogDescription>
      </DialogHeader>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (kept in the record)" rows={3} />
      <DialogFooter>
        <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => onVoid(reason)}>
          Void
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Side({ doc, statusLabels }: { doc: Doc; statusLabels: Record<string, string> }) {
  const steps: [string, string | null][] = [
    ["Created", doc.createdAt],
    [doc.direction === "incoming" ? "Registered" : "Issued", doc.issuedAt],
    ["Dispatched", doc.dispatchedAt],
    [doc.direction === "incoming" ? "Received" : "Delivered", doc.deliveredAt],
    ["Acknowledged", doc.acknowledgedAt],
    ["Archived", doc.archivedAt],
  ];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs">
          <p><span className="text-muted-foreground">Reference:</span> <span className="font-mono">{doc.ref ?? "given when issued"}</span></p>
          <p><span className="text-muted-foreground">Document ID:</span> <span className="font-mono break-all">{doc.id}</span></p>
          <p><span className="text-muted-foreground">Status:</span> {statusLabels[doc.status]}</p>
          <p><span className="text-muted-foreground">Category:</span> {doc.categoryName ?? "-"}</p>
          <p><span className="text-muted-foreground">Classification:</span> {doc.classification}</p>
          <p><span className="text-muted-foreground">Written by:</span> {doc.creatorName ?? "-"}</p>
          {doc.issuerName && <p><span className="text-muted-foreground">{doc.direction === "incoming" ? "Registered" : "Issued"} by:</span> {doc.issuerName}</p>}
          {doc.templateVersion != null && <p><span className="text-muted-foreground">Template version:</span> {doc.templateVersion}</p>}
          {doc.financialValue != null && <p><span className="text-muted-foreground">Amount:</span> {doc.financialValue.toLocaleString()} ETB</p>}
          {doc.contentHash && <p title={doc.contentHash}><span className="text-muted-foreground">Fingerprint:</span> <span className="font-mono">{doc.contentHash.slice(0, 16)}…</span></p>}
          {doc.signed && <p className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><ShieldCheckIcon className="size-3.5" /> Signed by the issuing server</p>}
          <ol className="mt-2 space-y-0.5 border-t pt-2">
            {steps.map(([l, at]) => (
              <li key={l} className={cn("flex justify-between", !at && "text-muted-foreground/60")}>
                <span>{l}</span>
                <span className="tabular">{at ? when(at) : "-"}</span>
              </li>
            ))}
          </ol>
          {doc.verifications.length > 0 && <p className="border-t pt-2 text-muted-foreground">Checked {doc.verifications.length} times, last {when(doc.verifications[0]!.at)}.</p>}
        </CardContent>
      </Card>
      {doc.trail && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              {doc.trail.intact ? <ShieldCheckIcon className="size-4 text-emerald-600" /> : <AlertTriangleIcon className="size-4 text-destructive" />}
              History {doc.trail.intact ? <span className="text-xs font-normal text-muted-foreground">(record chain intact)</span> : <span className="text-xs font-normal text-destructive">record {doc.trail.brokenAt} was changed</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="max-h-80 space-y-1.5 overflow-auto text-xs">
              {doc.trail.events.slice().reverse().map((e) => (
                <li key={e.seq} className="border-l-2 pl-2">
                  <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span> <span className="text-muted-foreground">by {e.actorName ?? "System"}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {when(e.at)}
                    {typeof e.detail.ref === "string" ? ` · ${e.detail.ref}` : ""}
                    {typeof e.detail.capacity === "string" ? ` · as ${e.detail.capacity}` : ""}
                    {typeof e.detail.stage === "string" ? ` · ${e.detail.stage}` : ""}
                    {typeof e.detail.reason === "string" ? ` · ${e.detail.reason}` : ""}
                    {typeof e.detail.comment === "string" ? ` · “${e.detail.comment}”` : ""}
                    {typeof e.detail.method === "string" ? ` · ${e.detail.method}` : ""}
                    {typeof e.detail.kind === "string" ? ` · ${e.detail.kind}` : ""}
                    {typeof e.detail.version === "number" ? ` · version ${e.detail.version}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
      {doc.versions.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Versions ({doc.versions.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-48 space-y-0.5 overflow-auto text-xs">
            {doc.versions.map((v) => (
              <p key={v.version} className="flex justify-between gap-2">
                <span className="truncate">v{v.version} · {v.subject || "(no subject)"}</span>
                <span className="shrink-0 text-muted-foreground">{when(v.saved_at)}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// To, cc and bcc: pick from the directory (organisation, then the contact) or type someone in.
function Recipients({ value, onChange, canDirectory }: { value: Recipient[]; onChange: (v: Recipient[]) => void; canDirectory: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Org[]>([]);
  const [kind, setKind] = React.useState<Recipient["kind"]>("to");
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const r = await searchOrgsAction(q);
      if (r.ok) setHits(r.data as Org[]);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);
  const add = (r: Recipient) => {
    onChange([...value, r]);
    setOpen(false);
    setQ("");
  };
  const patch = (i: number, p: Partial<Recipient>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium">Recipients</p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <SearchIcon /> From the directory
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 max-w-[calc(100vw-2rem)] p-2" align="start">
            <div className="flex gap-1">
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company, registration no., contact, email or phone" className="h-8 text-xs" />
              <select className="h-8 rounded-md border bg-background px-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value as Recipient["kind"])} aria-label="As">
                <option value="to">To</option>
                <option value="cc">Cc</option>
                <option value="bcc">Bcc</option>
              </select>
            </div>
            <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
              {hits.map((o) => (
                <li key={o.id} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center gap-1 font-medium">
                    {o.legalName}
                    {o.source === "verified" && <ShieldCheckIcon className="size-3 text-emerald-600" aria-label="Verified" />}
                    {o.source === "external" && <span className="rounded bg-amber-500/15 px-1 text-[10px]">not verified</span>}
                  </div>
                  <div className="text-muted-foreground">{[o.city, o.registrationNo, o.letters ? `${o.letters} letters` : null].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button size="sm" variant="secondary" className="h-6 text-[11px]" onClick={() => add({ kind, orgId: o.id, organisation: o.legalName, address: [o.address, o.city].filter(Boolean).join("\n"), email: o.email, phone: o.phone, fax: o.fax })}>
                      The organisation
                    </Button>
                    {o.contacts?.map((c) => (
                      <Button key={c.id} size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => add({ kind, orgId: o.id, contactId: c.id, name: c.name, title: c.title, organisation: o.legalName, address: [o.address, o.city].filter(Boolean).join("\n"), email: c.email ?? o.email, phone: c.phone ?? o.phone, fax: c.fax ?? o.fax })}>
                        {c.name}
                        {c.title ? `, ${c.title}` : ""}
                      </Button>
                    ))}
                  </div>
                </li>
              ))}
              {!hits.length && <li className="px-2 py-3 text-xs text-muted-foreground">Nothing found. {canDirectory ? <Link href="/correspondence/directory" className="underline">Add it to the directory</Link> : null}</li>}
            </ul>
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange([...value, { kind: "to", name: "", organisation: "" }])}>
          <UserPlusIcon /> Type one in
        </Button>
      </div>
      {value.map((r, i) => (
        <div key={i} className="grid gap-1 rounded-md border p-2 sm:grid-cols-[4.5rem_1fr_1fr_1fr_auto]">
          <select className="h-8 rounded-md border bg-background px-1 text-xs" value={r.kind} onChange={(e) => patch(i, { kind: e.target.value as Recipient["kind"] })} aria-label="To, cc or bcc">
            <option value="to">To</option>
            <option value="cc">Cc</option>
            <option value="bcc">Bcc</option>
          </select>
          <Input className="h-8 text-xs" value={r.name ?? ""} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Name" aria-label="Name" />
          <Input className="h-8 text-xs" value={r.title ?? ""} onChange={(e) => patch(i, { title: e.target.value })} placeholder="Position" aria-label="Position" />
          <Input className="h-8 text-xs" value={r.organisation ?? ""} onChange={(e) => patch(i, { organisation: e.target.value })} placeholder="Organisation" aria-label="Organisation" />
          <Button size="icon" variant="ghost" className="size-8" aria-label="Remove recipient" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2Icon />
          </Button>
          <Textarea className="text-xs sm:col-span-4" rows={2} value={r.address ?? ""} onChange={(e) => patch(i, { address: e.target.value })} placeholder="Address" aria-label="Address" />
          <Input className="h-8 text-xs" value={r.email ?? ""} onChange={(e) => patch(i, { email: e.target.value })} placeholder="Email" aria-label="Email" />
        </div>
      ))}
      {!value.length && <p className="text-xs text-muted-foreground">No recipients yet.</p>}
    </div>
  );
}
