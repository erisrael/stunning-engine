"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, ExternalLinkIcon, EyeIcon, Loader2Icon, ReceiptIcon, RefreshCwIcon, TrendingUpIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchExternalRevenueAction, listExternalReceiptsAction, reviewExternalReceiptAction } from "@/app/actions/external-api";
import type { ExternalReceipt, ExternalRevenueSummary } from "@/server/external-api";

export function ExternalReceiptsCard() {
  const router = useRouter();
  const [revenue, setRevenue] = React.useState<ExternalRevenueSummary | null>(null);
  const [receipts, setReceipts] = React.useState<ExternalReceipt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [previewReceipt, setPreviewReceipt] = React.useState<ExternalReceipt | null>(null);
  const [rejectDialogReceipt, setRejectDialogReceipt] = React.useState<ExternalReceipt | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [revRes, rcptRes] = await Promise.all([
      fetchExternalRevenueAction(),
      listExternalReceiptsAction("pending"),
    ]);
    setLoading(false);
    if (revRes.ok && revRes.data) setRevenue(revRes.data);
    if (rcptRes.ok && rcptRes.data) setReceipts(rcptRes.data);
  };

  React.useEffect(() => {
    loadData();
  }, []);

  const handleDecision = async (receipt: ExternalReceipt, decision: "approve" | "reject", reason?: string) => {
    setBusyAction(`${receipt.id}:${decision}`);
    const res = await reviewExternalReceiptAction(receipt.id, decision, reason);
    setBusyAction(null);

    if (!res.ok) {
      toast.error(res.error || "Failed to submit decision to external API");
      return;
    }

    toast.success(`Receipt ${receipt.referenceNumber} ${decision === "approve" ? "approved" : "rejected"}.`);
    setRejectDialogReceipt(null);
    setRejectReason("");
    setPreviewReceipt(null);
    // Refresh list
    setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Revenue Summary Banner */}
      {revenue && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">External Academy Revenue (Total)</p>
                <h3 className="text-lg font-bold text-foreground mt-0.5">
                  {revenue.totalRevenue.toLocaleString()} {revenue.currency}
                </h3>
              </div>
              <TrendingUpIcon className="size-6 text-primary opacity-80" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">This Month Sales</p>
              <h3 className="text-lg font-bold text-foreground mt-0.5">
                {revenue.thisMonthRevenue.toLocaleString()} {revenue.currency}
              </h3>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Pending Manual Bank Receipts</p>
                <h3 className="text-lg font-bold text-foreground mt-0.5">
                  {receipts.length} to verify
                </h3>
              </div>
              <Button size="icon-xs" variant="ghost" onClick={loadData} disabled={loading} title="Refresh">
                <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Receipts Review Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ReceiptIcon className="size-4 text-primary" />
              Manual Bank Transfer Receipts (Uploaded on External Site)
            </CardTitle>
            <CardDescription className="text-xs">
              Verify student payments made via CBE, telebirr, or Awash Bank. Approving unlocks their courses on the main platform.
            </CardDescription>
          </div>
          <Button size="xs" variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCwIcon className={`size-3 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && (
            <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin mr-2" /> Fetching external receipts...
            </div>
          )}

          {!loading && receipts.length === 0 && (
            <div className="text-center p-8 border rounded-lg bg-muted/10 text-xs text-muted-foreground">
              <CheckCircle2Icon className="size-6 text-[#188038] mx-auto mb-2 opacity-80" />
              All uploaded bank receipts are reviewed! No pending receipts at this moment.
            </div>
          )}

          {!loading && receipts.length > 0 && (
            <div className="divide-y rounded-lg border">
              {receipts.map((r) => (
                <div key={r.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/10 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setPreviewReceipt(r)}
                      className="size-14 rounded border overflow-hidden shrink-0 bg-muted/50 group relative cursor-pointer"
                      title="Click to zoom receipt"
                    >
                      <img src={r.receiptUrl} alt="Receipt" className="size-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <EyeIcon className="size-4 text-white" />
                      </div>
                    </button>

                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{r.studentName}</span>
                        {r.grade && <span className="text-[11px] text-muted-foreground">({r.grade})</span>}
                      </div>
                      <p className="text-muted-foreground">
                        Bank: <span className="font-medium text-foreground">{r.bankName}</span> · Ref: <span className="font-mono font-bold text-foreground">{r.referenceNumber}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Parent phone: {r.parentPhone || "Not provided"} · Submitted: {new Date(r.submittedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <div className="text-right">
                      <span className="text-sm font-bold text-foreground block">
                        {r.amount.toLocaleString()} {r.currency}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewReceipt(r)}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1 justify-end"
                      >
                        <EyeIcon className="size-3" /> View receipt slip
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="default"
                        className="bg-[#188038] hover:bg-[#188038]/90 text-white"
                        disabled={busyAction === `${r.id}:approve`}
                        onClick={() => handleDecision(r, "approve")}
                      >
                        {busyAction === `${r.id}:approve` ? <Loader2Icon className="size-3 animate-spin mr-1" /> : <CheckCircle2Icon className="size-3 mr-1" />}
                        Approve
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={busyAction === `${r.id}:reject`}
                        onClick={() => {
                          setRejectDialogReceipt(r);
                          setRejectReason("");
                        }}
                      >
                        <XCircleIcon className="size-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Preview Modal */}
      {previewReceipt && (
        <Dialog open onOpenChange={(o) => !o && setPreviewReceipt(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-sm">
                Receipt Verification: {previewReceipt.studentName} ({previewReceipt.amount} {previewReceipt.currency})
              </DialogTitle>
              <DialogDescription className="text-xs">
                Bank: {previewReceipt.bankName} · Transaction Ref: <span className="font-mono font-bold">{previewReceipt.referenceNumber}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/20 p-2 flex items-center justify-center">
              <img src={previewReceipt.receiptUrl} alt="Receipt proof" className="max-w-full max-h-[55vh] object-contain rounded" />
            </div>
            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <a
                href={previewReceipt.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Open in new tab <ExternalLinkIcon className="size-3" />
              </a>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => {
                    const r = previewReceipt;
                    setPreviewReceipt(null);
                    setRejectDialogReceipt(r);
                  }}
                >
                  Reject…
                </Button>
                <Button
                  size="sm"
                  className="bg-[#188038] hover:bg-[#188038]/90 text-white"
                  onClick={() => handleDecision(previewReceipt, "approve")}
                >
                  Approve Payment
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Rejection Dialog */}
      {rejectDialogReceipt && (
        <Dialog open onOpenChange={(o) => !o && setRejectDialogReceipt(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm text-destructive">Disapprove Payment Receipt</DialogTitle>
              <DialogDescription className="text-xs">
                Provide a reason for rejecting the receipt of {rejectDialogReceipt.studentName} (Ref: {rejectDialogReceipt.referenceNumber}). The customer will be notified to re-upload.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label className="text-xs">Rejection reason (shown to student/parent):</Label>
              <Input
                placeholder="e.g. Unreadable receipt image, amount does not match, or fake transaction number."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => setRejectDialogReceipt(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDecision(rejectDialogReceipt, "reject", rejectReason)}
              >
                Confirm Rejection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

