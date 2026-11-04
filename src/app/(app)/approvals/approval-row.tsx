"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decideHandoverAction } from "@/app/actions/editorial";
import { itemAction } from "@/app/actions/items";

// A row on Approvals that can be decided right there: accept a whole handover, or approve a part sent to the lead.
// Rejecting needs a reason, so it stays on the page that the row opens.
export function ApprovalRow({ text, meta, href, handover, item }: { text: string; meta: string; href: string; handover?: { id: string; itemIds: string[] }; item?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const approve = async () => {
    setBusy(true);
    if (handover) {
      const r = await decideHandoverAction(handover.id, { itemIds: handover.itemIds, decision: "accepted" });
      setBusy(false);
      if (!r.ok) return void toast.error(r.error);
      const res = r.data?.results ?? [];
      const bad = res.filter((x) => !x.ok);
      if (bad.length) toast.error(`${bad.length} not accepted`, { description: bad.map((b) => `${b.code}: ${b.error}`).join("; ").slice(0, 300) });
      else toast.success(`${res.length} accepted`);
    } else if (item) {
      const r = await itemAction(item, { action: "leadApprove" });
      setBusy(false);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Approved");
    }
    router.refresh();
  };
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5" data-approval-row={text}>
      <Link href={href} className="min-w-0 flex-1 truncate hover:underline">
        {text}
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </Link>
      <Button size="xs" variant="outline" disabled={busy} onClick={approve}>
        {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {handover ? "Accept all" : "Approve"}
      </Button>
    </li>
  );
}
