"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, DownloadIcon, Loader2Icon, PencilIcon, PlayIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decideBatchAction, decideRunAction, deleteRoutineAction, importRoutineAction } from "@/app/actions/assistant";
import { beginBatch, beginRun } from "@/components/app/routines-client";
import type { Routine, Run } from "@/server/routines";

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const STATUS: Record<Run["status"], string> = { pending: "Waiting for approval", approved: "Approved, ready", rejected: "Not approved", running: "Running", done: "Done", failed: "Stopped" };
const SHARE = { none: "only you", team: "shared with your departments", everyone: "shared with everyone" };

export function DeleteRoutine({ routine, onDone }: { routine: { id: string; name: string }; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" aria-label={`Delete ${routine.name}`} onClick={() => setOpen(true)}>
        <Trash2Icon />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{routine.name}&quot;?</DialogTitle>
            <DialogDescription>The routine and its run history go. People it was shared with lose it too. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await deleteRoutineAction(routine.id);
                setBusy(false);
                if (!r.ok) return void toast.error(r.error);
                toast.success("Routine deleted");
                setOpen(false);
                onDone();
              }}
            >
              {busy && <Loader2Icon className="animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImportRoutine({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-import-routine>
        <DialogHeader>
          <DialogTitle>Import a routine</DialogTitle>
          <DialogDescription>From the routine template (each row is one step: the page, what to do, the field or button, its value), or from a routine exported as JSON.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Button size="sm" variant="outline" asChild>
            <a href="/api/routines/steps/template">
              <DownloadIcon /> Download the template
            </a>
          </Button>
          <div className="space-y-1">
            <Label htmlFor="ir-name">Name</Label>
            <Input id="ir-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="From the file, if left empty" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ir-file">File (CSV, Excel or JSON)</Label>
            <Input id="ir-file" type="file" accept=".csv,.xlsx,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !file}
            onClick={async () => {
              setBusy(true);
              const form = new FormData();
              form.set("file", file!);
              form.set("name", name);
              const r = await importRoutineAction(form);
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Routine imported. Check its steps.");
              router.push(`/routines/${r.data}`);
            }}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RoutinesPage({ routines, runs, open, imports, tab, viewerId }: { routines: Routine[]; runs: { mine: Run[]; toApprove: Run[] }; open: boolean; imports: boolean; tab: "mine" | "approve"; viewerId: string }) {
  const router = useRouter();
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [importing, setImporting] = React.useState(false);
  const decide = async (run: Run, approve: boolean, key: string) => {
    const r = run.batchId ? await decideBatchAction(run.batchId, approve, notes[key] ?? null) : await decideRunAction(run.id, approve, notes[key] ?? null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(approve ? "Approved" : "Rejected");
    router.refresh();
  };
  // Runs from one file show as one line.
  const groups = (list: Run[]) => {
    const out: { key: string; run: Run; n: number; ids: string[] }[] = [];
    for (const r of list) {
      const hit = r.batchId ? out.find((g) => g.run.batchId === r.batchId && g.run.status === r.status) : null;
      if (hit) {
        hit.n++;
        hit.ids.push(r.id);
      } else out.push({ key: r.id, run: r, n: 1, ids: [r.id] });
    }
    return out;
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
            {groups(runs.toApprove).map(({ key, run: x, n }) => (
              <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border p-2" data-run-approve={x.id}>
                <p className="min-w-0 flex-1">
                  <span className="font-medium">{x.userName}</span> wants to run <span className="font-medium">{x.routineName}</span>
                  {n > 1 ? ` ${n} times, from a file` : ""}
                  <span className="block text-xs text-muted-foreground">{when(x.requestedAt)}</span>
                </p>
                <Input className="h-8 w-48" placeholder="Note (needed to reject)" aria-label={`Note for ${x.userName}`} value={notes[key] ?? ""} onChange={(e) => setNotes({ ...notes, [key]: e.target.value })} />
                <Button size="sm" onClick={() => decide(x, true, key)}>
                  <CheckIcon /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(x, false, key)}>
                  <XIcon /> Reject
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">My routines and shared ones</CardTitle>
            <CardDescription>{open ? "Record a new one from the assistant (bottom right), or import one. Open a routine to change its steps, fill it from a file, or delete it." : "Routines are switched off for your role."}</CardDescription>
          </div>
          {open && imports && (
            <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
              <UploadIcon /> Import a routine
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!routines.length && <p className="text-muted-foreground">No routines yet.</p>}
          {routines.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2" data-routine={r.id}>
              <div className="min-w-0 flex-1">
                <Link href={`/routines/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {r.steps.length} steps · used {r.uses} times · {r.mine ? SHARE[r.shared] : `by ${r.ownerName}`}
                  {r.description ? ` · ${r.description}` : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/routines/${r.id}`}>
                  <PencilIcon /> {r.ownerId === viewerId ? "Edit" : "Open"}
                </Link>
              </Button>
              {r.ownerId === viewerId && <DeleteRoutine routine={r} onDone={() => router.refresh()} />}
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
          {groups(runs.mine).map(({ key, run: x, n, ids }) => (
            <div key={key} className="flex flex-wrap items-center gap-2 border-b py-1.5 last:border-0" data-run={x.id}>
              <p className="min-w-0 flex-1">
                {x.routineName}
                {n > 1 ? ` · ${n} rows from a file` : ""} <span className="text-xs text-muted-foreground">· {when(x.requestedAt)}</span>
              </p>
              <span className="text-xs">
                {STATUS[x.status]}
                {x.decidedBy ? ` (${x.decidedBy})` : ""}
                {x.note ? `: ${x.note}` : ""}
                {x.error ? `: ${x.error}` : ""}
              </span>
              {x.status === "approved" && (
                <Button size="xs" onClick={() => void (n > 1 ? beginBatch(ids) : beginRun(x.id))}>
                  <PlayIcon /> {n > 1 ? `Run all ${n}` : "Run now"}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      {importing && <ImportRoutine onClose={() => setImporting(false)} />}
    </div>
  );
}
