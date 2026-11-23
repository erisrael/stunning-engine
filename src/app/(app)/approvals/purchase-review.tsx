"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { reviewPurchaseAction } from "@/app/actions/resources";

type Row = { id: string; number: string; title: string; estimate: number; route: string | null; requester: string | null; note: string | null };

// A team member's request to Finance, waiting for their team lead or HR: pass it on to Finance, or turn it down with a reason.
export function PurchaseReview({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [declining, setDeclining] = React.useState<Row | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const decide = async (r: Row, approve: boolean, note?: string) => {
    setBusy(true);
    const res = await reviewPurchaseAction(r.id, approve, note);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(approve ? `${r.number} passed on to Finance` : `${r.number} turned down`);
    setDeclining(null);
    setReason("");
    router.refresh();
  };
  return (
    <Card data-testid="approvals-finance-review">
      <CardHeader>
        <CardTitle>Requests to Finance ({rows.length})</CardTitle>
        <CardDescription>From your team (work things) or for HR (salary advance, allowance, loan, benefit). Pass each on to Finance or turn it down.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2" data-review-row={r.number}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {r.number}: {r.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.requester ?? "Someone"} · about {Number(r.estimate).toLocaleString()} · {r.route === "hr" ? "for HR" : "for the team lead"}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
              <Button size="xs" disabled={busy} onClick={() => decide(r, true)} data-review-pass>
                <CheckIcon /> Pass on
              </Button>
              <Button size="xs" variant="outline" disabled={busy} onClick={() => setDeclining(r)} data-review-decline>
                <XIcon /> Turn down
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      <Dialog open={!!declining} onOpenChange={(o) => !o && setDeclining(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn down {declining?.number}</DialogTitle>
            <DialogDescription>Say why. The person who asked is told.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" data-review-reason />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclining(null)}>
              Cancel
            </Button>
            <Button disabled={busy || reason.trim().length < 3} onClick={() => declining && decide(declining, false, reason)} data-review-send>
              Turn down
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
