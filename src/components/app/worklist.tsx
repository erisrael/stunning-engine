"use client";

import Link from "next/link";
import { ItemStatusPill, PriorityBadge } from "@/components/app/status-pill";
import { UserAvatar, EmptyState } from "@/components/app/primitives";
import { ItemActions, type ActionViewer } from "@/components/app/item-actions";
import { STAGE_LABELS, NEXT_STAGE, type AttemptStatus, type Stage } from "@/lib/domain";
import { fmtAge, fmtShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type WorkRow = {
  id: string;
  code: string;
  title: string;
  title_am: string | null;
  lifecycle: string;
  stage: Stage | null;
  stage_status: AttemptStatus | null;
  substate: string | null;
  priority: string;
  grade_name: string;
  subject_name: string;
  unit_number: number | null;
  lesson_number: number | null;
  current_due_at: string | null;
  stage_entered_at: string | null;
  next_action: string | null;
  next_action_owner_id: string | null;
  version: number;
  ownerId: string | null;
  nextOwnerId: string | null;
  open_blocker: string | null;
  comment_count: number;
  hasMySession?: boolean;
};

export function Worklist({
  rows,
  viewer,
  users,
  tz,
  empty,
  limit,
  now,
}: {
  now: number;
  rows: WorkRow[];
  viewer: ActionViewer;
  users: Record<string, string>;
  tz: string;
  empty?: { title: string; description?: string };
  limit?: number;
}) {
  const list = limit ? rows.slice(0, limit) : rows;
  if (!list.length) return <EmptyState title={empty?.title ?? "Nothing waiting"} description={empty?.description} />;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {list.map((r) => {
        const overdue = r.current_due_at && new Date(r.current_due_at).getTime() < now && r.lifecycle !== "published";
        const incoming = r.stage_status === "awaiting_handoff" && r.stage && NEXT_STAGE[r.stage];
        return (
          <li key={r.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <Link href={`/items/${r.id}`} className="line-clamp-2 min-w-0 text-sm font-medium hover:underline">
                  {r.title}
                </Link>
                <PriorityBadge priority={r.priority} />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-mono">{r.code}</span>
                <span>
                  {r.grade_name} / {r.subject_name}
                  {r.unit_number ? ` / U${r.unit_number}` : ""}
                  {r.lesson_number ? ` L${r.lesson_number}` : ""}
                </span>
                {r.title_am && <span className="ethiopic truncate" lang="am">{r.title_am}</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <ItemStatusPill lifecycle={r.lifecycle} stage={r.stage} status={r.stage_status} substate={r.substate} size="xs" />
                {incoming && <span className="text-muted-foreground">From {STAGE_LABELS[r.stage!]}</span>}
                <span className="flex items-center gap-1.5" title="Next action owner">
                  <UserAvatar name={r.next_action_owner_id ? users[r.next_action_owner_id] : null} size="xs" />
                  <span className="text-muted-foreground">{r.next_action_owner_id ? users[r.next_action_owner_id] : "Unassigned"}</span>
                </span>
                <span className={cn("tabular", overdue ? "font-medium text-[var(--st-blocked-fg)]" : "text-muted-foreground")}>
                  {r.current_due_at ? `${overdue ? "Overdue, due" : "Due"} ${fmtShortDate(r.current_due_at, tz)}` : "No due date"}
                </span>
                <span className="text-muted-foreground tabular" title="Age in stage">
                  {fmtAge(r.stage_entered_at, now)} in stage
                </span>
              </div>
              {r.next_action && <p className="mt-1 text-xs text-muted-foreground">Next: {r.next_action}</p>}
            </div>
            <ItemActions
              item={{
                id: r.id,
                code: r.code,
                title: r.title,
                version: r.version,
                lifecycle: r.lifecycle,
                stage: r.stage,
                status: r.stage_status,
                substate: r.substate,
                ownerId: r.ownerId,
                nextOwnerId: r.nextOwnerId,
                hasMySession: r.hasMySession,
              }}
              viewer={viewer}
              size="xs"
              max={2}
              className="shrink-0 md:justify-end"
            />
          </li>
        );
      })}
    </ul>
  );
}
