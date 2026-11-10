"use client";
import * as React from "react";
import { toast } from "sonner";
import { BanIcon, CheckCircle2Icon, CircleDashedIcon, HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { reviewInvoicesAction, invoiceReviewHistoryAction, invoiceReviewStatesAction } from "@/app/actions/cms-reports";
import { INVOICE_STATE_LABEL, UNABLE_REASONS, UNABLE_REASON_LABEL, type InvoiceReviewLog, type InvoiceState } from "@/lib/cms-invoices";
import { cn } from "@/lib/utils";

export type ReviewStates = Record<string, { state: InvoiceState; reason: string | null; by: string | null; at: string }>;
export const invoiceKey = (r: Record<string, string>) => r._recordId || r.ID || r.Id || r.id || "";

export function StateBadge({ state, reason }: { state: InvoiceState; reason?: string | null }) {
  const Icon = state === "verified" ? CheckCircle2Icon : state === "unable" ? BanIcon : CircleDashedIcon;
  return (
    <Badge
      variant="outline"
      title={reason ? UNABLE_REASON_LABEL[reason] : undefined}
      className={cn(
        "gap-1 text-[10px] font-medium",
        state === "verified" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        state === "unable" && "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        state === "unverified" && "text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      {INVOICE_STATE_LABEL[state]}
      {state === "unable" && reason ? ` · ${UNABLE_REASON_LABEL[reason]?.replace(/ \(.*\)$/, "")}` : ""}
    </Badge>
  );
}

// Verification states for the invoice rows on screen.
export function useReviewStates(ids: string[], enabled: boolean) {
  const [states, setStates] = React.useState<ReviewStates>({});
  const key = ids.join(",");
  const refresh = React.useCallback(async () => {
    if (!enabled || !ids.length) return setStates({});
    const r = await invoiceReviewStatesAction(ids);
    if (r.ok && r.data) setStates(r.data);
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  return { states, refresh };
}

// Bulk bar: Verified, Unable to verify (with a required reason) or back to Unverified.
export function ReviewBar({ ids, invoices, onDone, className }: { ids: string[]; invoices?: Record<string, Record<string, string>>; onDone: () => void; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<string>("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const send = async (state: InvoiceState, extra: { reason?: string; note?: string } = {}) => {
    setBusy(true);
    try {
      const sub = invoices ? Object.fromEntries(ids.filter((id) => invoices[id]).map((id) => [id, invoices[id]])) : undefined;
      const r = await reviewInvoicesAction({ ids, state, invoices: sub, ...extra });
      if (!r.ok) return toast.error(r.error);
      const miss = r.data?.missingPhone.length ?? 0;
      toast.success(`${ids.length === 1 ? "Invoice" : `${ids.length} invoices`} marked ${INVOICE_STATE_LABEL[state]}${miss ? `. ${miss} have no phone number; find it before handing over.` : ""}`);
      setOpen(false);
      setReason("");
      setNote("");
      onDone();
    } finally {
      setBusy(false);
    }
  };
  if (!ids.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs", className)} role="region" aria-label="Verify selected invoices">
      <span className="font-medium">{ids.length} selected</span>
      <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => send("verified")}>
        <CheckCircle2Icon /> Verified
      </Button>
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => setOpen(true)}>
        <BanIcon /> Unable to verify…
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => send("unverified")}>
        Back to Unverified
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unable to verify {ids.length === 1 ? `invoice #${ids[0]}` : `${ids.length} invoices`}</DialogTitle>
            <DialogDescription>The reason is required. The contact (name, phone, grade, plan, amount) is taken from the invoice and the student&apos;s parent so Support can reach them.</DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-medium">Reason</legend>
            {UNABLE_REASONS.map(([k, l]) => (
              <label key={k} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", reason === k && "border-primary bg-primary/5")}>
                <input type="radio" name="unable-reason" value={k} checked={reason === k} onChange={() => setReason(k)} />
                {l}
              </label>
            ))}
          </fieldset>
          <label className="grid gap-1 text-sm">
            Note {reason === "other" ? "(required)" : "(optional)"}
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was checked, what is missing" />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !reason || (reason === "other" && !note.trim())} onClick={() => send("unable", { reason, note })}>
              Mark Unable to verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Who changed an invoice's state, when, from what, and why.
export function HistoryDialog({ invoiceId, onClose }: { invoiceId: string | null; onClose: () => void }) {
  const [log, setLog] = React.useState<InvoiceReviewLog[] | null>(null);
  React.useEffect(() => {
    setLog(null);
    if (invoiceId) void invoiceReviewHistoryAction(invoiceId).then((r) => setLog(r.ok ? r.data ?? [] : []));
  }, [invoiceId]);
  return (
    <Dialog open={!!invoiceId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4" /> Invoice #{invoiceId} verification history
          </DialogTitle>
          <DialogDescription>Every change, newest first.</DialogDescription>
        </DialogHeader>
        {!log ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !log.length ? (
          <p className="text-sm text-muted-foreground">Not reviewed yet: this invoice is Unverified.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {log.map((l) => (
              <li key={l.id} className="rounded-md border p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StateBadge state={l.fromState as InvoiceState} /> → <StateBadge state={l.toState as InvoiceState} reason={l.reason} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {l.actorName ?? "Someone"} · {new Date(l.at).toLocaleString()}
                </p>
                {l.note && <p className="mt-1 text-xs">{l.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
