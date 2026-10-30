"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GripVerticalIcon, LockIcon } from "lucide-react";
import { ItemStatusPill, PriorityBadge } from "@/components/app/status-pill";
import { UserAvatar } from "@/components/app/primitives";
import { ItemActions, ItemContextMenu, canWorkClient, type ActionViewer } from "@/components/app/item-actions";
import { useActions } from "@/components/app/action-center";
import { NEXT_STAGE, STAGE_LABELS, STAGES, STATUS_LABELS, type Stage } from "@/lib/domain";
import type { WorkRow } from "@/components/app/worklist";
import { fmtAge, fmtShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Col = { key: string; label: string; rows: WorkRow[]; hint?: string };

const isInteractive = (t: EventTarget | null) => t instanceof Element && !!t.closest("a,button,[role=menuitem]");

// Who may move a card: whoever can work its current stage, or receive its handoff.
function canMove(r: WorkRow, v: ActionViewer) {
  if (r.lifecycle === "draft") return canWorkClient(v, "recording", r.ownerId);
  if (r.lifecycle !== "in_production" || !r.stage) return false;
  if (r.stage_status === "awaiting_handoff") {
    const next = NEXT_STAGE[r.stage];
    return !!next && (v.perms.includes("work.override") || !!v.leads?.includes(next) || r.nextOwnerId === v.id);
  }
  return canWorkClient(v, r.stage, r.ownerId);
}

export function Board({ columns, viewer, users, tz, now, mode }: { columns: Col[]; viewer: ActionViewer; users: Record<string, string>; tz: string; now: number; mode: "team" | "mine" }) {
  const { open, run } = useActions();
  const router = useRouter();
  const [drag, setDrag] = React.useState<WorkRow | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const v = (st: Stage) => viewer.perms.includes("work.override") || !!viewer.leads?.includes(st);

  // Team board: dropping on the next stage sends the item on (or accepts it). Nothing skips evidence or acceptance.
  const dropTeam = (r: WorkRow, target: string) => {
    const ref = { id: r.id, code: r.code, title: r.title, version: r.version, stage: r.stage, status: r.stage_status };
    const from = r.lifecycle === "draft" ? "draft" : r.lifecycle === "published" ? "published" : r.stage!;
    if (from === target) return;
    // Recording staff start a draft themselves; it moves straight to In progress.
    if (from === "draft") {
      if (target === "recording") return void run(ref, { action: "start" }, { source: "board" });
      return toast.error("Drafts start in Recording. Drop it on Recording to start recording.");
    }
    if (from === "published") return toast.info("Published items change through a revision.");
    const fromStage = from as Stage;
    const next = NEXT_STAGE[fromStage];
    if (target === "published" && fromStage === "publication") return open("live", ref);
    if (target === next) {
      if (r.stage_status === "awaiting_handoff") return open("accept", ref);
      // Only the team lead hands over; members send to their lead.
      if (v(fromStage)) return open("submit", ref);
      return void run(ref, { action: "submitLead" }, { source: "board" });
    }
    if (STAGES.indexOf(target as Stage) > -1 && STAGES.indexOf(target as Stage) < STAGES.indexOf(fromStage)) return open("redo", ref, { target });
    toast.error(`Work moves one stage at a time. ${STAGE_LABELS[fromStage]} sends to ${next ? STAGE_LABELS[next] : "release"}.`);
  };

  // My work board: columns are statuses within the person's own stage.
  const dropMine = (r: WorkRow, target: string) => {
    const ref = { id: r.id, code: r.code, title: r.title, version: r.version, stage: r.stage, status: r.stage_status };
    if (target === r.stage_status || (r.lifecycle === "draft" && target === "queued")) return;
    if (target === "in_progress") return void run(ref, { action: "start" });
    if (r.lifecycle === "draft") return toast.info("Start recording first: drag it to In progress.");
    if (target === "paused") return open("pause", ref);
    if (target === "blocked") return open("block", ref);
    if (target === "finished") return void run(ref, { action: "finish" });
    if (target === "lead_review") return v(r.stage!) ? toast.info("Your own work goes straight to Ready.") : void run(ref, { action: "submitLead" });
    if (target === "ready") return v(r.stage!) ? void run(ref, { action: r.stage_status === "lead_review" ? "leadApprove" : "submitLead" }) : toast.error("Your team lead approves work.");
    if (target === "awaiting_handoff") return v(r.stage!) ? open("submit", ref) : toast.error("Your team lead hands work over. Send it to them instead.");
    if (target === "queued") return toast.info("Started work cannot go back to To do. Pause it instead.");
  };

  const drop = (target: string) => {
    const r = drag;
    setDrag(null);
    setOver(null);
    if (!r) return;
    if (!canMove(r, viewer)) return toast.error("You can only move items in your own stage.");
    if (mode === "mine") dropMine(r, target);
    else dropTeam(r, target);
  };

  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
      <div className="flex snap-x snap-mandatory gap-3">
        {columns.map((c) => {
          const byStatus = ["in_progress", "blocked", "paused", "queued", "finished", "lead_review", "ready", "awaiting_handoff"];
          return (
            <section
              key={c.key}
              aria-label={c.label}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(c.key);
              }}
              onDragLeave={() => setOver((o) => (o === c.key ? null : o))}
              onDrop={() => drop(c.key)}
              className={cn("flex w-[85vw] max-w-[340px] shrink-0 snap-start flex-col rounded-xl border bg-muted/40 sm:w-[290px]", over === c.key && drag && "border-primary bg-accent/50")}
            >
              <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                <div>
                  <h2 className="text-sm font-semibold">{c.label}</h2>
                  {c.hint && <p className="text-[11px] text-muted-foreground">{c.hint}</p>}
                </div>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular">{c.rows.length}</span>
              </header>
              {mode === "team" && STAGES.includes(c.key as Stage) && (
                <div className="flex flex-wrap gap-x-2 border-b px-3 py-1.5">
                  {byStatus.map((st) => {
                    const n = c.rows.filter((r) => r.stage_status === st).length;
                    return n ? (
                      <span key={st} className="text-[10px] text-muted-foreground">
                        {STATUS_LABELS[st as keyof typeof STATUS_LABELS]} {n}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
              <ul className="flex max-h-[68vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
                {c.rows.map((r) => {
                  const overdue = r.current_due_at && new Date(r.current_due_at).getTime() < now && r.lifecycle !== "published";
                  const movable = canMove(r, viewer);
                  return (
                    <ItemContextMenu
                      key={r.id}
                      item={{ id: r.id, code: r.code, title: r.title, version: r.version, lifecycle: r.lifecycle, stage: r.stage, status: r.stage_status, substate: r.substate, ownerId: r.ownerId, nextOwnerId: r.nextOwnerId, hasMySession: r.hasMySession }}
                      viewer={viewer}
                    >
                      <li
                        draggable={movable}
                        onDragStart={() => setDrag(r)}
                        onDragEnd={() => setDrag(null)}
                        onClick={(e) => !isInteractive(e.target) && router.push(`/items/${r.id}/form`)}
                        className={cn(
                          "group cursor-pointer rounded-lg border bg-card p-2.5 shadow-xs hover:border-primary/40",
                          drag?.id === r.id && "opacity-50",
                          r.stage_status === "blocked" && "border-l-4 border-l-[var(--st-blocked-fg)]",
                          !movable && "bg-card/70",
                        )}
                        title={movable ? "Drag to move, click to open, right-click for actions" : "View only: this stage belongs to another team or person. Click to open and comment."}
                      >
                        <div className="flex items-start gap-1.5">
                          {movable ? (
                            <GripVerticalIcon className="mt-0.5 size-3.5 shrink-0 cursor-grab text-muted-foreground/50" aria-hidden />
                          ) : (
                            <LockIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" aria-label="View only" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm leading-snug font-medium">{r.title}</p>
                            <p className="truncate font-mono text-[10px] text-muted-foreground">{r.code}</p>
                          </div>
                          <PriorityBadge priority={r.priority} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <ItemStatusPill lifecycle={r.lifecycle} stage={r.stage} status={r.stage_status} substate={r.substate} size="xs" />
                          {r.stage_status === "awaiting_handoff" && r.stage && NEXT_STAGE[r.stage] && <span className="text-[10px] text-muted-foreground">to {STAGE_LABELS[NEXT_STAGE[r.stage]!]}</span>}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span className="flex min-w-0 items-center gap-1" title="Assigned to">
                            <UserAvatar name={r.ownerId ? users[r.ownerId] : null} size="xs" />
                            <span className="truncate">{r.ownerId ? users[r.ownerId]?.split(" ")[0] : "Unassigned"}</span>
                          </span>
                          <span className="tabular">{r.lifecycle === "in_production" ? fmtAge(r.stage_entered_at, now) : ""}</span>
                          <span className={cn("tabular", overdue && "font-medium text-[var(--st-blocked-fg)]")}>{r.current_due_at ? fmtShortDate(r.current_due_at, tz) : ""}</span>
                        </div>
                        {movable && (
                          <ItemActions
                            className="mt-2 border-t pt-2"
                            item={{ id: r.id, code: r.code, title: r.title, version: r.version, lifecycle: r.lifecycle, stage: r.stage, status: r.stage_status, substate: r.substate, ownerId: r.ownerId, nextOwnerId: r.nextOwnerId, hasMySession: r.hasMySession }}
                            viewer={viewer}
                            size="xs"
                            max={2}
                          />
                        )}
                      </li>
                    </ItemContextMenu>
                  );
                })}
                {!c.rows.length && <li className="py-6 text-center text-xs text-muted-foreground">Nothing here</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
