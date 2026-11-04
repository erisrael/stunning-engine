"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon, PackageCheckIcon, Undo2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/primitives";
import { crossCheckAction } from "@/app/actions/editorial";
import type { RejectedRow } from "@/server/editorial";
import { RETURN_REASON_LABELS, STAGE_LABELS } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

type Tab = "to_check" | "confirmed" | "overturned";
const key = (r: RejectedRow) => `${r.handover_id}:${r.item_id}`;

export function RejectedClient({ rows, tab, tz }: { rows: RejectedRow[]; tab: Tab; tz: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<"confirm" | "overturn" | null>(null);
  const checkable = rows.filter((r) => r.canCheck);
  const chosen = checkable.filter((r) => picked.has(key(r)));

  const decide = async (decision: "confirm" | "overturn") => {
    setBusy(decision);
    const r = await crossCheckAction({ items: chosen.map((x) => ({ handoverId: x.handover_id, itemId: x.item_id })), decision, note: note.trim() || null });
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    const res = r.data ?? [];
    const ok = res.filter((x) => x.ok).length;
    const bad = res.filter((x) => !x.ok);
    if (ok) toast.success(decision === "confirm" ? `${ok} back in the team's To do` : `${ok} moved on to the next team`);
    if (bad.length) toast.error(`${bad.length} not done`, { description: bad.map((b) => `${b.code}: ${b.error}`).join("; ").slice(0, 300) });
    setPicked(new Set());
    setNote("");
    router.refresh();
  };

  return (
    <div className="space-y-3" data-rejected-page>
      <Tabs value={tab} onValueChange={(v) => router.replace(v === "to_check" ? pathname : `${pathname}?tab=${v}`, { scroll: false })}>
        <TabsList>
          <TabsTrigger value="to_check">To check</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
          <TabsTrigger value="overturned">Overturned</TabsTrigger>
        </TabsList>
      </Tabs>
      {!rows.length ? (
        <EmptyState icon={<PackageCheckIcon className="size-5" />} title={tab === "to_check" ? "No rejections to check" : "Nothing here yet"} description={tab === "to_check" ? "When a team rejects work it receives, it waits here first." : "Checked rejections are listed here."} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {tab === "to_check" && (
                  <th className="w-8 p-2">
                    <Checkbox
                      aria-label="Select all"
                      disabled={!checkable.length}
                      checked={checkable.length > 0 && chosen.length === checkable.length}
                      onCheckedChange={(v) => setPicked(v ? new Set(checkable.map(key)) : new Set())}
                    />
                  </th>
                )}
                <th className="p-2 font-medium">Part</th>
                <th className="p-2 font-medium">From → To</th>
                <th className="p-2 font-medium">Why it was rejected</th>
                <th className="p-2 font-medium">Rejected</th>
                {tab !== "to_check" && <th className="p-2 font-medium">Checked</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={key(r)} className="border-t align-top" data-rejected-row={r.item_code}>
                  {tab === "to_check" && (
                    <td className="p-2">
                      {r.canCheck ? (
                        <Checkbox aria-label={`Select ${r.item_code}`} checked={picked.has(key(r))} onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(key(r)); else n.delete(key(r)); return n; })} />
                      ) : null}
                    </td>
                  )}
                  <td className="p-2">
                    <Link href={`/items/${r.item_id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      <span className="font-mono">{r.item_code}</span> · {r.place}
                    </span>
                    {r.owner_name && <span className="block text-xs text-muted-foreground">Worked on by {r.owner_name}</span>}
                  </td>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {STAGE_LABELS[r.from_stage]} → {STAGE_LABELS[r.to_stage]}
                    <Link href={`/handovers/${r.handover_id}`} className="block font-mono text-muted-foreground hover:underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="p-2 text-xs">
                    {r.reason && <Badge variant="secondary">{RETURN_REASON_LABELS[r.reason] ?? r.reason}</Badge>}
                    <span className="mt-1 block">{r.note}</span>
                  </td>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {r.rejected_at ? fmtDateTime(r.rejected_at, tz) : "-"}
                    <span className="block text-muted-foreground">{r.rejected_by_name}</span>
                    {tab === "to_check" && !r.canCheck && <span className="block text-muted-foreground">Someone else checks this</span>}
                  </td>
                  {tab !== "to_check" && (
                    <td className="p-2 text-xs whitespace-nowrap">
                      {r.checked_at ? fmtDateTime(r.checked_at, tz) : "No check"}
                      <span className="block text-muted-foreground">{r.checked_by_name}</span>
                      {r.check_note && <span className="block whitespace-normal">{r.check_note}</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "to_check" && chosen.length > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-lg" data-crosscheck-bar>
          <span className="text-sm font-medium tabular">{chosen.length} selected</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (needed to overturn)" aria-label="Cross-check note" className="h-7 w-56 text-xs" />
          <Button size="xs" disabled={!!busy} onClick={() => decide("confirm")}>
            {busy === "confirm" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Rejection is right
          </Button>
          <Button size="xs" variant="outline" disabled={!!busy || !note.trim()} onClick={() => decide("overturn")}>
            {busy === "overturn" ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />} Rejection is wrong
          </Button>
        </div>
      )}
    </div>
  );
}
