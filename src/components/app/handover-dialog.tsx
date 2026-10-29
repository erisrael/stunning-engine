"use client";

// New handover: pick items waiting in one stage (or start from items selected in a list), choose who receives
// them, and send. Each item's handoff is submitted through the normal workflow; items missing evidence are listed.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleXIcon, Loader2Icon, SearchIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createHandoverAction, handoverSetupAction } from "@/app/actions/editorial";
import type { HandoverCreateResult } from "@/server/editorial";
import { NEXT_STAGE, STAGE_LABELS, STATUS_LABELS, type AttemptStatus, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";

type Candidate = { id: string; code: string; title: string; stage: Stage; stage_status: string; grade: string; subject: string; unit_number: number | null; part_number: number | null };

export function HandoverDialog({ preselected, onClose }: { preselected?: string[]; onClose: () => void }) {
  const router = useRouter();
  const [candidates, setCandidates] = React.useState<Candidate[] | null>(null);
  const [receivers, setReceivers] = React.useState<Record<string, { id: string; name: string }[]>>({});
  const [stage, setStage] = React.useState<Stage | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set(preselected ?? []));
  const [q, setQ] = React.useState("");
  const [to, setTo] = React.useState("team");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<HandoverCreateResult["results"] | null>(null);

  React.useEffect(() => {
    void handoverSetupAction().then((r) => {
      if (!r.ok) return toast.error(r.error);
      const d = r.data as { candidates: Candidate[]; receivers: Record<string, { id: string; name: string }[]> };
      setCandidates(d.candidates);
      setReceivers(d.receivers);
      const pre = d.candidates.filter((c) => preselected?.includes(c.id));
      const counts = new Map<Stage, number>();
      for (const c of pre.length ? pre : d.candidates) counts.set(c.stage, (counts.get(c.stage) ?? 0) + 1);
      setStage([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    });
  }, [preselected]);

  const stages = [...new Set((candidates ?? []).map((c) => c.stage))];
  const inStage = (candidates ?? []).filter((c) => c.stage === stage);
  const needle = q.trim().toLowerCase();
  const shown = inStage.filter((c) => !needle || `${c.code} ${c.title} ${c.grade} ${c.subject}`.toLowerCase().includes(needle));
  const chosen = inStage.filter((c) => picked.has(c.id));
  const next = stage ? NEXT_STAGE[stage] : null;
  const outside = (preselected ?? []).filter((id) => !(candidates ?? []).some((c) => c.id === id && c.stage === stage)).length;

  const send = async () => {
    setBusy(true);
    const r = await createHandoverAction({ itemIds: chosen.map((c) => c.id), toUserId: to === "team" ? null : to, note: note.trim() || null });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const res = r.data as HandoverCreateResult;
    const bad = res.results.filter((x) => !x.ok);
    if (!res.handoverId) {
      setFailed(bad);
      return toast.error("Nothing could be handed over", { description: "See the reasons below." });
    }
    toast.success(`${res.code} sent with ${res.results.length - bad.length} items`, { description: bad.length ? `${bad.length} were left out; see the list.` : undefined });
    if (bad.length) setFailed(bad);
    else onClose();
    router.push(`/handovers/${res.handoverId}`);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New handover</DialogTitle>
          <DialogDescription>
            Send finished work to the next team as one batch. They check what they received, accept it, or mark items missing with a note. Each item&apos;s handoff is submitted with its usual
            checks.
          </DialogDescription>
        </DialogHeader>
        {!candidates ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Loading your work
          </p>
        ) : !candidates.length ? (
          <p className="py-6 text-sm text-muted-foreground">You have no work waiting in a stage that can be handed over.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>From stage</Label>
                <Select value={stage ?? ""} onValueChange={(v) => (setStage(v as Stage), setTo("team"))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STAGE_LABELS[s]} → {STAGE_LABELS[NEXT_STAGE[s]!]} ({(candidates ?? []).filter((c) => c.stage === s).length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Receiver</Label>
                <Select value={to} onValueChange={setTo} disabled={!next}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team">Assigned owners and the {next ? STAGE_LABELS[next] : ""} lead</SelectItem>
                    {(next ? (receivers[next] ?? []) : []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {outside > 0 && <p className="text-xs text-muted-foreground">{outside} of the selected items are in another stage or not yours to hand over, so they are not listed.</p>}
            <div className="rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-muted/50 px-2 py-1.5">
                <Checkbox
                  checked={shown.length && shown.every((c) => picked.has(c.id)) ? true : shown.some((c) => picked.has(c.id)) ? "indeterminate" : false}
                  onCheckedChange={(v) =>
                    setPicked((s) => {
                      const n = new Set(s);
                      for (const c of shown) v ? n.add(c.id) : n.delete(c.id);
                      return n;
                    })
                  }
                  aria-label="Select all shown"
                />
                <div className="relative flex-1">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-7 pl-7 text-sm" />
                </div>
                <span className="text-xs text-muted-foreground tabular">{chosen.length} selected</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {shown.map((c) => (
                  <label key={c.id} className={cn("flex cursor-pointer items-center gap-2 border-t px-2 py-1 text-xs first:border-t-0 hover:bg-muted/40", picked.has(c.id) && "bg-primary/5")}>
                    <Checkbox checked={picked.has(c.id)} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(c.id)) : (s.delete(c.id), new Set(s))))} />
                    <span className="min-w-0 flex-1 truncate">
                      {c.title} <span className="font-mono text-[10px] text-muted-foreground">{c.code}</span>
                    </span>
                    <span className="hidden text-muted-foreground sm:inline">
                      {c.grade} / {c.subject}
                      {c.unit_number != null && ` / U${c.unit_number}`}
                      {c.part_number != null && ` P${c.part_number}`}
                    </span>
                    <span className="w-20 text-right text-muted-foreground">{STATUS_LABELS[c.stage_status as AttemptStatus] ?? c.stage_status}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note for the receiver (optional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Files are in the shared drive folder G7-Math/Unit 3" />
            </div>
            {failed && failed.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-destructive/30 p-2 text-xs">
                <p className="font-medium">Left out</p>
                {failed.map((f) => (
                  <p key={f.id} className="flex gap-1.5">
                    <CircleXIcon className="mt-0.5 size-3 shrink-0 text-destructive" />
                    <span className="font-mono">{f.code}</span>
                    <span className="text-muted-foreground">{f.missing?.length ? `Missing: ${f.missing.join("; ")}` : f.error}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {failed ? "Close" : "Cancel"}
          </Button>
          <Button disabled={busy || !chosen.length} onClick={send}>
            {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Hand over {chosen.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
