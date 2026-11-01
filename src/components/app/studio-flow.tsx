"use client";

// Studio's flow on Home (Phase 12): writers see their own work (Assigned, Draft with the reviewer's note, In
// review, Approved); heads, leads and subject reviewers see what to review, what to publish and what to assign.
// A published piece changes as a new version, which goes through review again.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, ExternalLinkIcon, RotateCcwIcon, SendIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { resourceStatusAction } from "@/app/actions/departments";
import type { StudioFlowCard, StudioHome } from "@/server/studio-extras";
import { RESOURCE_TYPE_LABELS } from "@/lib/studio";
import { cn } from "@/lib/utils";

const today = () => new Date().toISOString().slice(0, 10);

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  return {
    busy,
    run: async (key: string, id: string, action: Parameters<typeof resourceStatusAction>[1], note: string | null, done: string) => {
      setBusy(key);
      const r = await resourceStatusAction(id, action, note);
      setBusy(null);
      if (!r.ok) return toast.error(r.error), false;
      toast.success(done);
      router.refresh();
      return true;
    },
  };
}

function Card({ c, children }: { c: StudioFlowCard; children?: React.ReactNode }) {
  const late = c.dueDate && c.dueDate < today();
  return (
    <div className={cn("rounded-lg border bg-card p-2.5 shadow-xs", c.note && "border-amber-500/60")} data-studio-card={c.id}>
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{RESOURCE_TYPE_LABELS[c.type].one}</span>
        {c.version > 1 && <span className="rounded bg-muted px-1">v{c.version}</span>}
        {c.checklist.total > 0 && (
          <span className="rounded bg-muted px-1 tabular-nums">
            {c.checklist.done}/{c.checklist.total} checklist
          </span>
        )}
        {c.dueDate && <span className={cn("ml-auto", late && "font-medium text-destructive")}>{late ? `Late: ${c.dueDate}` : `Due ${c.dueDate.slice(5)}`}</span>}
      </p>
      <a href={`/studio?open=${c.id}`} className="mt-0.5 block font-medium hover:underline">
        {c.title}
      </a>
      <p className="truncate text-xs text-muted-foreground">{[c.place, c.assignee ?? c.author].filter(Boolean).join(" · ")}</p>
      {c.note && <p className="mt-1.5 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">Changes asked: {c.note}</p>}
      {children}
    </div>
  );
}

function Column({ title, hint, items, children, name }: { title: string; hint: string; items: StudioFlowCard[]; children: (c: StudioFlowCard) => React.ReactNode; name: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2" data-studio-column={name}>
      <div className="px-1">
        <p className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground tabular-nums">{items.length}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      {items.slice(0, 15).map(children)}
      {items.length > 15 && <p className="text-center text-xs text-muted-foreground">and {items.length - 15} more on the Board</p>}
      {!items.length && <p className="py-3 text-center text-xs text-muted-foreground">Nothing here</p>}
    </div>
  );
}

function ReviewCard({ c }: { c: StudioFlowCard }) {
  const { run, busy } = useRun();
  const [returning, setReturning] = React.useState(false);
  const [note, setNote] = React.useState("");
  return (
    <Card c={c}>
      {returning ? (
        <div className="mt-2 space-y-2">
          <Textarea autoFocus rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change" aria-label="What needs to change" />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setReturning(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!note.trim() || busy === "changes"} onClick={() => run("changes", c.id, "changes", note, "Returned to the writer")}>
              Return
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" disabled={busy === "approve"} onClick={() => run("approve", c.id, "approve", null, "Approved")}>
            <CheckIcon /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => setReturning(true)}>
            <RotateCcwIcon /> Return
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={`/studio?open=${c.id}`}>
              <ExternalLinkIcon /> Open
            </a>
          </Button>
        </div>
      )}
    </Card>
  );
}

export function StudioFlowHome({ data }: { data: StudioHome }) {
  const { run, busy } = useRun();
  const mine = (s: string) => data.mine.filter((c) => c.status === s);
  const desk = data.lead || data.reviewer;
  return (
    <div className="space-y-4" data-studio-home>
      {(data.mine.length > 0 || !desk) && (
        <section className="space-y-2" aria-label="My Studio work">
          <h2 className="text-lg font-semibold">My work</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Column name="draft" title="To write" hint="Assigned to you; returned work shows the reviewer's note" items={mine("draft")}>
              {(c) => (
                <Card key={c.id} c={c}>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" disabled={busy === `s${c.id}`} onClick={() => run(`s${c.id}`, c.id, "submit", null, "Sent for review")}>
                      <SendIcon /> Send for review
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/studio?open=${c.id}`}>Write</a>
                    </Button>
                  </div>
                </Card>
              )}
            </Column>
            <Column name="review" title="In review" hint="With the subject reviewer or lead" items={mine("review")}>
              {(c) => <Card key={c.id} c={c} />}
            </Column>
            <Column name="approved" title="Approved" hint="Waiting to be published" items={mine("approved")}>
              {(c) => <Card key={c.id} c={c} />}
            </Column>
          </div>
        </section>
      )}
      {desk && (
        <section className="space-y-2" aria-label="Review desk">
          <h2 className="text-lg font-semibold">{data.lead ? "Review desk" : "To review in your subjects"}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Column name="to-review" title="To review" hint="Work through the checklist, then approve or return" items={data.toReview}>
              {(c) => <ReviewCard key={c.id} c={c} />}
            </Column>
            {data.lead && (
              <Column name="to-publish" title="To publish" hint="Approved" items={data.toPublish}>
                {(c) => (
                  <Card key={c.id} c={c}>
                    <Button size="sm" className="mt-2" disabled={busy === `p${c.id}`} onClick={() => run(`p${c.id}`, c.id, "publish", null, "Published")}>
                      <UploadIcon /> Publish
                    </Button>
                  </Card>
                )}
              </Column>
            )}
            {data.lead && (
              <Column name="unassigned" title="Nobody writing it" hint="Drafts without a writer; open one to assign it" items={data.unassigned}>
                {(c) => <Card key={c.id} c={c} />}
              </Column>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
