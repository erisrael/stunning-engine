"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, PlayIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { decideRunAction, deleteRoutineAction } from "@/app/actions/assistant";
import { beginRun } from "@/components/app/routines-client";
import type { Routine, Run } from "@/server/routines";

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const STATUS: Record<Run["status"], string> = { pending: "Waiting for approval", approved: "Approved, ready", rejected: "Not approved", running: "Running", done: "Done", failed: "Stopped" };
const SHARE = { none: "only you", team: "shared with your departments", everyone: "shared with everyone" };

export function RoutinesPage({ routines, runs, open, tab, viewerId }: { routines: Routine[]; runs: { mine: Run[]; toApprove: Run[] }; open: boolean; tab: "mine" | "approve"; viewerId: string }) {
  const router = useRouter();
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const decide = async (id: string, approve: boolean) => {
    const r = await decideRunAction(id, approve, notes[id] ?? null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(approve ? "Approved" : "Rejected");
    router.refresh();
  };
  return (
    <div className="space-y-4" data-routines-page>
      {runs.toApprove.length > 0 && (
        <Card id="approve" className={tab === "approve" ? "border-primary" : ""}>
          <CardHeader>
            <CardTitle className="text-base">Waiting for your approval</CardTitle>
            <CardDescription>Approving lets the person run it once, in their own browser, with their own permissions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {runs.toApprove.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2" data-run-approve={x.id}>
                <p className="min-w-0 flex-1">
                  <span className="font-medium">{x.userName}</span> wants to run <span className="font-medium">{x.routineName}</span>
                  <span className="block text-xs text-muted-foreground">{when(x.requestedAt)}</span>
                </p>
                <Input className="h-8 w-48" placeholder="Note (needed to reject)" aria-label={`Note for ${x.userName}`} value={notes[x.id] ?? ""} onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })} />
                <Button size="sm" onClick={() => decide(x.id, true)}>
                  <CheckIcon /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(x.id, false)}>
                  <XIcon /> Reject
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My routines and shared ones</CardTitle>
          <CardDescription>{open ? "Record a new one from the assistant (bottom right): Record a routine." : "Routines are switched off for your role."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!routines.length && <p className="text-muted-foreground">No routines yet.</p>}
          {routines.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2" data-routine={r.id}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.steps.length} steps · used {r.uses} times · {r.mine ? SHARE[r.shared] : `by ${r.ownerName}`}
                  {r.description ? ` · ${r.description}` : ""}
                </p>
              </div>
              {r.ownerId === viewerId && (
                <Button size="sm" variant="ghost" aria-label={`Remove ${r.name}`} onClick={async () => (await deleteRoutineAction(r.id), router.refresh())}>
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {!runs.mine.length && <p className="text-muted-foreground">Nothing has run yet.</p>}
          {runs.mine.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-2 border-b py-1.5 last:border-0" data-run={x.id}>
              <p className="min-w-0 flex-1">
                {x.routineName} <span className="text-xs text-muted-foreground">· {when(x.requestedAt)}</span>
              </p>
              <span className="text-xs">
                {STATUS[x.status]}
                {x.decidedBy ? ` (${x.decidedBy})` : ""}
                {x.note ? `: ${x.note}` : ""}
                {x.error ? `: ${x.error}` : ""}
              </span>
              {x.status === "approved" && (
                <Button size="xs" onClick={() => void beginRun(x.id)}>
                  <PlayIcon /> Run now
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
