"use client";

// Studio's Board (the review flow as columns), Calendar (by due date), Team (per person) and Configure (the review
// checklist), alongside the per-type lists.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/app/primitives";
import { resourceStatusAction, saveStudioConfigAction } from "@/app/actions/departments";
import type { StudioConfig, StudioTeamData, StudioWork } from "@/server/studio-extras";
import { RESOURCE_STATUS_LABELS, RESOURCE_TYPE_LABELS, type ResourceStatus } from "@/lib/studio";
import { POSITION_LABELS, type Position } from "@/lib/domain";
import { cn } from "@/lib/utils";

const COLUMNS: ResourceStatus[] = ["draft", "review", "approved", "published"];
const COLOR: Record<string, string> = { draft: "#94a3b8", review: "#f59e0b", approved: "#0ea5e9", published: "#22c55e" };
const today = () => new Date().toISOString().slice(0, 10);

// Which review step a move between two columns is.
function step(from: string, to: string): "submit" | "approve" | "changes" | "publish" | "unpublish" | null {
  if (from === "draft" && to === "review") return "submit";
  if (from === "review" && to === "approved") return "approve";
  if ((from === "review" || from === "approved") && to === "draft") return "changes";
  if ((from === "approved" || from === "review") && to === "published") return "publish";
  if (from === "published" && to === "approved") return "unpublish";
  return null;
}

export function StudioBoard({ work, manage, viewerId, readOnly, onOpen }: { work: StudioWork[]; manage: boolean; viewerId: string; readOnly: boolean; onOpen: (id: string) => void }) {
  const router = useRouter();
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState<{ id: string; title: string } | null>(null);
  const [note, setNote] = React.useState("");
  const move = async (id: string, action: NonNullable<ReturnType<typeof step>>, why?: string) => {
    const r = await resourceStatusAction(id, action, why ?? null);
    if (!r.ok) return toast.error(r.error);
    toast.success({ submit: "Submitted for review", approve: "Approved", changes: "Sent back with changes", publish: "Published", unpublish: "Unpublished" }[action]);
    router.refresh();
  };
  const drop = (to: string) => {
    const w = work.find((x) => x.id === dragging);
    setDragging(null);
    if (!w || w.status === to) return;
    const s = step(w.status, to);
    if (!s) return toast.error(`${RESOURCE_STATUS_LABELS[w.status as ResourceStatus]} to ${RESOURCE_STATUS_LABELS[to as ResourceStatus]} is not a step in the review flow.`);
    if (s === "changes") return setAsking({ id: w.id, title: w.title });
    void move(w.id, s);
  };
  const canDrag = (w: StudioWork) => !readOnly && (manage || w.author_id === viewerId || w.assignee_id === viewerId);
  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const list = work.filter((w) => w.status === col);
          return (
            <div key={col} className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-muted/40 p-2", dragging && "outline-dashed outline-1 outline-primary/30")} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(col)}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium" style={{ background: `${COLOR[col]}22`, color: COLOR[col] }}>
                  {RESOURCE_STATUS_LABELS[col]}
                </span>
                <span className="text-xs text-muted-foreground tabular">{list.length}</span>
              </div>
              <div className="flex min-h-16 flex-col gap-2">
                {list.map((w) => {
                  const late = w.due_date && w.due_date < today() && w.status !== "published";
                  return (
                    <button
                      key={w.id}
                      type="button"
                      draggable={canDrag(w)}
                      onDragStart={() => setDragging(w.id)}
                      onClick={() => onOpen(w.id)}
                      className="block w-full rounded-lg border bg-card p-2 text-left text-sm shadow-xs hover:border-primary/40"
                    >
                      <span className="text-[11px] text-muted-foreground">
                        {RESOURCE_TYPE_LABELS[w.type].one}
                        {w.grade && ` · ${w.grade}`}
                        {w.subject && ` · ${w.subject}`}
                      </span>
                      <p className="line-clamp-2 font-medium">{w.title}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                        {(w.assignee_name ?? w.author_name) && <UserAvatar name={w.assignee_name ?? w.author_name} size="xs" />}
                        {w.checklist.total > 0 && (
                          <span className="rounded bg-muted px-1">
                            {w.checklist.done}/{w.checklist.total} checks
                          </span>
                        )}
                        {w.due_date && <span className={cn("ml-auto", late ? "font-medium text-destructive" : "text-muted-foreground")}>{w.due_date.slice(5)}</span>}
                      </div>
                    </button>
                  );
                })}
                {!list.length && <p className="py-3 text-center text-xs text-muted-foreground">Nothing here</p>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Drag along the review flow: draft to review (submit), review to approved, approved to published, or back to draft with what needs changing.</p>
      <Dialog open={!!asking} onOpenChange={(o) => !o && setAsking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send back: {asking?.title}</DialogTitle>
            <DialogDescription>Tell the author what needs to change.</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-label="What needs to change" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button
              disabled={!note.trim()}
              onClick={async () => {
                await move(asking!.id, "changes", note);
                setAsking(null);
                setNote("");
              }}
            >
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StudioCalendar({ work, onOpen }: { work: StudioWork[]; onOpen: (id: string) => void }) {
  const [month, setMonth] = React.useState(() => today().slice(0, 7));
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDay = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((startDay + days) / 7) * 7 }, (_, i) => {
    const d = i - startDay + 1;
    return d >= 1 && d <= days ? `${month}-${String(d).padStart(2, "0")}` : null;
  });
  const shift = (n: number) => setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  const undated = work.filter((w) => !w.due_date && w.status !== "published").length;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="outline" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeftIcon />
        </Button>
        <span className="w-40 text-center text-sm font-semibold">{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
        <Button size="icon-sm" variant="outline" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRightIcon />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMonth(today().slice(0, 7))}>
          Today
        </Button>
        {undated > 0 && <span className="ml-auto text-xs text-muted-foreground">{undated} unpublished without a due date are not shown</span>}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-b bg-muted/50 p-1.5 font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          const list = d ? work.filter((w) => w.due_date === d) : [];
          return (
            <div key={i} className={cn("min-h-24 border-r border-b p-1", !d && "bg-muted/20", d === today() && "bg-primary/5")}>
              {d && <span className={cn("text-[11px]", d === today() ? "font-bold text-primary" : "text-muted-foreground")}>{Number(d.slice(8))}</span>}
              <div className="space-y-0.5">
                {list.slice(0, 4).map((w) => (
                  <button key={w.id} type="button" onClick={() => onOpen(w.id)} className={cn("block w-full truncate rounded px-1 py-0.5 text-left text-[11px]", w.status === "published" ? "bg-muted text-muted-foreground line-through" : "bg-primary/10 hover:bg-primary/20")}>
                    {w.title}
                  </button>
                ))}
                {list.length > 4 && <span className="text-[10px] text-muted-foreground">+{list.length - 4} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StudioTeam({ data, onOpen }: { data: StudioTeamData; onOpen: (id: string) => void }) {
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-2 font-medium">Person</th>
            <th className="p-2 text-right font-medium">Drafts</th>
            <th className="p-2 text-right font-medium">In review</th>
            <th className="p-2 text-right font-medium">Approved</th>
            <th className="p-2 text-right font-medium">Overdue</th>
            <th className="p-2 text-right font-medium">Published ({data.period.label.toLowerCase()})</th>
          </tr>
        </thead>
        <tbody>
          {data.people.map((p) => (
            <React.Fragment key={p.id}>
              <tr className="border-t">
                <td className="p-2">
                  <button type="button" className="flex items-center gap-2 text-left" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
                    {open === p.id ? <ChevronLeftIcon className="size-4 -rotate-90" /> : <ChevronRightIcon className="size-4" />}
                    <UserAvatar name={p.name} size="xs" />
                    <span>
                      <span className="block font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{POSITION_LABELS[p.position as Position]}</span>
                    </span>
                  </button>
                </td>
                <td className="p-2 text-right tabular">{p.drafts || "-"}</td>
                <td className="p-2 text-right tabular">{p.review || "-"}</td>
                <td className="p-2 text-right tabular">{p.approved || "-"}</td>
                <td className={cn("p-2 text-right tabular", p.overdue && "font-medium text-destructive")}>{p.overdue || "-"}</td>
                <td className="p-2 text-right tabular">{p.published || "-"}</td>
              </tr>
              {open === p.id && (
                <tr className="border-t bg-muted/20">
                  <td colSpan={6} className="p-2">
                    {p.open.length ? (
                      <ul className="divide-y rounded-lg border bg-background">
                        {p.open.map((w) => (
                          <li key={w.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                            <span className="text-[11px] text-muted-foreground">{RESOURCE_TYPE_LABELS[w.type].one}</span>
                            <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen(w.id)}>
                              {w.title}
                            </button>
                            <span className="text-xs text-muted-foreground">{RESOURCE_STATUS_LABELS[w.status as ResourceStatus]}</span>
                            <span className={cn("w-20 text-right text-xs", w.due_date && w.due_date < today() ? "font-medium text-destructive" : "text-muted-foreground")}>{w.due_date ?? ""}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nothing unpublished.</p>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudioConfigure({ config }: { config: StudioConfig }) {
  const router = useRouter();
  const [c, setC] = React.useState(config);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const dirty = JSON.stringify(c) !== JSON.stringify(config);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Review checklist</CardTitle>
        <CardDescription>Copied onto each piece of work when it is first submitted for review. The author ticks lines; lines marked for verifying are checked by a head or lead.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1">
          {c.reviewChecklist.map((l, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input aria-label={`Line ${i + 1}`} value={l.text} onChange={(e) => setC({ ...c, reviewChecklist: c.reviewChecklist.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} className="h-8 flex-1" />
              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                <Switch checked={l.verify} onCheckedChange={(v) => setC({ ...c, reviewChecklist: c.reviewChecklist.map((x, j) => (j === i ? { ...x, verify: v } : x)) })} /> Lead verifies
              </label>
              <Button size="icon-xs" variant="ghost" className="text-destructive" aria-label={`Remove line ${i + 1}`} onClick={() => setC({ ...c, reviewChecklist: c.reviewChecklist.filter((_, j) => j !== i) })}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
          {!c.reviewChecklist.length && <li className="text-sm text-muted-foreground">No lines yet. For example: spelling checked, answers verified, placed on the right part.</li>}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setC({ ...c, reviewChecklist: [...c.reviewChecklist, { text: text.trim(), verify: false }] });
            setText("");
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="New line" aria-label="New checklist line" className="h-8 w-80" />
          <Button size="sm" variant="outline" type="submit" disabled={!text.trim()}>
            <PlusIcon /> Add
          </Button>
        </form>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={c.requireChecklist} onCheckedChange={(v) => setC({ ...c, requireChecklist: v })} /> Approving and publishing need every line done (and verified)
        </label>
        <Button
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            const r = await saveStudioConfigAction(c);
            setBusy(false);
            if (!r.ok) return toast.error(r.error);
            toast.success("Studio settings saved");
            router.refresh();
          }}
        >
          {busy && <Loader2Icon className="animate-spin" />} Save
        </Button>
      </CardContent>
    </Card>
  );
}
