"use client";
import * as React from "react";
import { ExternalLinkIcon, FileTextIcon, ImageIcon, Loader2Icon, RotateCwIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchLegacyCmsInvoiceReceiptAction } from "@/app/actions/legacy-cms";

type Receipt = Awaited<ReturnType<typeof fetchLegacyCmsInvoiceReceiptAction>>;
const proxy = (u: string) => `/api/legacy-cms/image-proxy?url=${encodeURIComponent(u)}`;

// The payment slip of one Noor invoice: the uploaded image (zoom and rotate) or PDF, with what Noor records
// about the payment. Opened from Live, Invoices and Revenue.
export function SlipButton({ invoiceId, label = "Slip", onOpen }: { invoiceId: string; label?: string; onOpen?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={(e) => (e.stopPropagation(), setOpen(true), onOpen?.())} aria-label={`Payment slip of invoice ${invoiceId}`}>
        <ImageIcon /> {label}
      </Button>
      {open && <SlipDialog invoiceId={invoiceId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SlipDialog({ invoiceId, onClose, children }: { invoiceId: string; onClose: () => void; children?: React.ReactNode }) {
  const [r, setR] = React.useState<Receipt | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [turn, setTurn] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setR(null);
    void fetchLegacyCmsInvoiceReceiptAction(invoiceId).then(setR);
  }, [invoiceId]);
  const details: [string, string | undefined][] = r?.ok
    ? [
        ["Student", r.studentName],
        ["Amount", r.amount ?? r.rawDetails?.Amount],
        ["Payment method", r.paymentMethod ?? r.rawDetails?.PaymentMethod],
        ["Status", r.status ?? r.rawDetails?.Status],
        ["Date", r.date ?? r.rawDetails?.Date],
        ["Paid by", r.paidBy ?? r.rawDetails?.PaidBy],
        ["Bank reference", r.bankReference ?? r.rawDetails?.BankReference],
      ]
    : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Invoice #{invoiceId}: payment slip</DialogTitle>
          <DialogDescription>From Noor. Checking it here does not change Noor; mark the invoice Verified or Unable to verify in Myseed.</DialogDescription>
        </DialogHeader>
        {!r ? (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" /> Opening the invoice in Noor…</p>
        ) : !r.ok ? (
          <p className="py-6 text-sm text-rose-600">{r.message}</p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-auto md:grid-cols-[1fr_16rem]">
            <div className="min-h-[24rem] overflow-auto rounded-lg border bg-muted/30">
              {r.imageUrl && !failed ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center gap-1 border-b bg-background p-1">
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}><ZoomOutIcon /></Button>
                    <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Zoom in" onClick={() => setZoom(Math.min(4, zoom + 0.25))}><ZoomInIcon /></Button>
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Rotate" onClick={() => setTurn((turn + 90) % 360)}><RotateCwIcon /></Button>
                    <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" asChild><a href={proxy(r.imageUrl)} target="_blank" rel="noopener"><ExternalLinkIcon /> Open full size</a></Button>
                  </div>
                  <div className="flex flex-1 items-center justify-center overflow-auto p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proxy(r.imageUrl)} alt={`Payment slip for invoice ${invoiceId}`} onError={() => setFailed(true)} style={{ transform: `scale(${zoom}) rotate(${turn}deg)`, transformOrigin: "center", transition: "transform .15s" }} className="max-h-[60vh] max-w-full object-contain" />
                  </div>
                </div>
              ) : r.pdfUrl ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center border-b bg-background p-1">
                    <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground"><FileTextIcon className="size-3.5" /> PDF</span>
                    <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" asChild><a href={proxy(r.pdfUrl)} target="_blank" rel="noopener"><ExternalLinkIcon /> Open the PDF</a></Button>
                  </div>
                  <object data={proxy(r.pdfUrl)} type="application/pdf" className="h-[60vh] w-full" aria-label={`Payment document for invoice ${invoiceId}`}>
                    <p className="p-4 text-sm">The browser cannot show the PDF here. <a className="text-primary underline" href={proxy(r.pdfUrl)} target="_blank" rel="noopener">Open the PDF</a>.</p>
                  </object>
                </div>
              ) : (
                <p className="p-6 text-sm text-muted-foreground">{failed ? "Noor did not send the image. " : ""}No slip is attached to this invoice in Noor{r.paymentMethod ? ` (paid by ${r.paymentMethod})` : ""}. Online payments (Chapa, telebirr) have no slip; check them under Chapa.</p>
              )}
            </div>
            <div className="space-y-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {details.filter(([, v]) => v).map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium break-words">{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {children}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
