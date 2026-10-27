"use client";

import Link from "next/link";
import { MessageSquareIcon, CircleHelpIcon } from "lucide-react";
import { ItemStatusPill, PriorityBadge, StatusPill, toneFor } from "@/components/app/status-pill";
import { UserAvatar } from "@/components/app/primitives";
import {
  BLOCKER_CAUSE_LABELS,
  COMPLEXITY_LABELS,
  SIMPLE_STATUS_LABELS,
  STAGE_LABELS,
  sheetStatusLabel,
  type SimpleStatus,
  type Stage,
} from "@/lib/domain";
import { fmtAge, fmtDate, fmtDateTime, fmtRelative } from "@/lib/format";
import type { ItemListRow } from "@/server/queries";
import { cn } from "@/lib/utils";
import { progressOf } from "@/lib/progress";

export type CellContext = {
  users: Record<string, string>;
  tz: string;
  now: number;
  lists: { deliverableTypes: { key: string; label: string }[]; contentTypes: { key: string; label: string }[]; languages: { code: string; label: string }[] };
};

export function stageCell(row: ItemListRow, st: Stage) {
  if (st === "publication" && row.lifecycle === "published") return <StatusPill tone="done" size="xs" label="Published" />;
  const c = row.stages[st];
  if (!c.status) return <span className="text-xs text-muted-foreground">Not started</span>;
  return <StatusPill tone={toneFor(c.status, c.substate)} size="xs" label={sheetStatusLabel(st, c.status, c.substate)} />;
}

function person(id: string | null, ctx: CellContext, fallback = "Unassigned") {
  const name = id ? ctx.users[id] : null;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <UserAvatar name={name} size="xs" />
      <span className={cn("truncate text-xs", !name && "text-muted-foreground")}>{name ?? fallback}</span>
    </span>
  );
}

const PROGRESS_CHIP: Record<SimpleStatus, string> = {
  done: "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
  in_process: "bg-[var(--st-active-bg)] text-[var(--st-active-fg)]",
  missing: "bg-[var(--st-blocked-bg)] text-[var(--st-blocked-fg)]",
  none: "text-muted-foreground",
};

export { progressOf };

export function progressChip(status: SimpleStatus) {
  return <span className={cn("inline-flex h-6 min-w-16 items-center justify-center rounded-md px-2 text-[11px] font-semibold", PROGRESS_CHIP[status])}>{SIMPLE_STATUS_LABELS[status]}</span>;
}

export function renderCell(row: ItemListRow, key: string, ctx: CellContext): React.ReactNode {
  if (key.endsWith("_progress")) return progressChip(progressOf(row, key.replace("_progress", "") as Stage));
  switch (key) {
    case "recorded_date":
      return <span className="text-xs tabular">{row.recorded_at ? fmtDate(row.recorded_at, ctx.tz) : "-"}</span>;
    case "edited_date":
      return <span className="text-xs tabular">{row.edited_at ? fmtDate(row.edited_at, ctx.tz) : "-"}</span>;
    case "uploaded_date":
      return <span className="text-xs tabular">{row.uploaded_at ? fmtDate(row.uploaded_at, ctx.tz) : "-"}</span>;
    case "code":
      return (
        <Link href={`/items/${row.id}`} className="font-mono text-xs hover:underline">
          {row.code}
        </Link>
      );
    case "id":
      return <span className="font-mono text-[11px] text-muted-foreground">{row.id}</span>;
    case "title":
      return (
        <div className="min-w-0">
          <Link href={`/items/${row.id}`} className="line-clamp-2 text-sm font-medium hover:underline" title={row.title}>
            {row.title}
          </Link>
          {row.title_am && (
            <span className="ethiopic line-clamp-1 text-xs text-muted-foreground" lang="am">
              {row.title_am}
            </span>
          )}
        </div>
      );
    case "title_am":
      return row.title_am ? <span className="ethiopic text-sm" lang="am">{row.title_am}</span> : null;
    case "grade":
      return <span className="text-xs">{row.grade_name}</span>;
    case "subject":
      return <span className="text-xs">{row.subject_name}</span>;
    case "unit":
      return row.unit_number ? <span className="line-clamp-2 text-xs">U{row.unit_number}: {row.unit_title}</span> : null;
    case "lesson":
      return row.lesson_number ? <span className="text-xs tabular">L{row.lesson_number}</span> : null;
    case "memberships":
      return row.membership_count > 1 ? <span className="text-xs" title="Appears in more than one grade or subject">{row.membership_count} placements</span> : <span className="text-xs text-muted-foreground">1</span>;
    case "stage":
      return <span className="text-xs">{row.lifecycle === "in_production" && row.stage ? STAGE_LABELS[row.stage] : row.lifecycle === "published" ? "Published" : row.lifecycle === "draft" ? "Draft" : row.lifecycle}</span>;
    case "status":
      return <ItemStatusPill lifecycle={row.lifecycle} stage={row.stage} status={row.stage_status} substate={row.substate} size="xs" />;
    case "recording_status":
      return stageCell(row, "recording");
    case "editing_status":
      return stageCell(row, "editing");
    case "uploading_status":
      return stageCell(row, "uploading");
    case "publication_status":
      return stageCell(row, "publication");
    case "owner":
      return row.lifecycle === "in_production" ? person(row.next_action_owner_id, ctx) : <span className="text-xs text-muted-foreground">-</span>;
    case "recording_owner":
    case "editing_owner":
    case "uploading_owner":
    case "publication_owner":
      return person(row.owners[key.replace("_owner", "") as Stage], ctx);
    case "teacher":
      return <span className="text-xs">{row.teacher ?? ""}</span>;
    case "next_action":
      return row.next_action ? <span className="line-clamp-2 text-xs">{row.next_action}</span> : <span className="text-xs text-muted-foreground">-</span>;
    case "age":
      return row.lifecycle === "in_production" ? <span className="text-xs tabular">{fmtAge(row.stage_entered_at, ctx.now)}</span> : null;
    case "due": {
      const overdue = row.current_due_at && new Date(row.current_due_at).getTime() < ctx.now && (row.lifecycle === "in_production" || row.lifecycle === "draft");
      const moved = row.original_due_at && row.current_due_at && row.original_due_at !== row.current_due_at;
      return (
        <span className={cn("text-xs tabular", overdue && "font-medium text-[var(--st-blocked-fg)]")} title={moved ? `Original deadline ${fmtDate(row.original_due_at, ctx.tz)}` : undefined}>
          {fmtDate(row.current_due_at, ctx.tz)}
          {moved && <span className="ml-1 text-muted-foreground">(moved)</span>}
        </span>
      );
    }
    case "original_due":
      return <span className="text-xs tabular">{fmtDate(row.original_due_at, ctx.tz)}</span>;
    case "planned_publish":
      return <span className="text-xs tabular">{fmtDate(row.planned_publish_at, ctx.tz)}</span>;
    case "scheduled_publish":
      return <span className="text-xs tabular">{fmtDateTime(row.scheduled_publish_at, ctx.tz)}</span>;
    case "published":
      return <span className="text-xs tabular">{fmtDateTime(row.published_at, ctx.tz)}</span>;
    case "priority":
      return <PriorityBadge priority={row.priority} />;
    case "complexity":
      return <span className="text-xs">{COMPLEXITY_LABELS[row.complexity as keyof typeof COMPLEXITY_LABELS] ?? row.complexity}</span>;
    case "deliverable_type":
      return <span className="text-xs">{ctx.lists.deliverableTypes.find((d) => d.key === row.deliverable_type)?.label ?? row.deliverable_type}</span>;
    case "content_type":
      return <span className="text-xs">{ctx.lists.contentTypes.find((d) => d.key === row.content_type)?.label ?? row.content_type}</span>;
    case "language":
      return <span className="text-xs">{ctx.lists.languages.find((l) => l.code === row.language)?.label ?? row.language}</span>;
    case "target_duration":
      return <span className="text-xs tabular">{row.target_duration_min ?? ""}</span>;
    case "actual_duration":
      return <span className="text-xs tabular">{row.actual_duration_min ?? ""}</span>;
    case "tags":
      return (
        <span className="flex flex-wrap gap-1">
          {(JSON.parse(row.tags || "[]") as string[]).map((t) => (
            <span key={t} className="rounded bg-muted px-1.5 text-[11px]">
              {t}
            </span>
          ))}
        </span>
      );
    case "blocker":
      return row.open_blocker ? <StatusPill tone="blocked" size="xs" label={BLOCKER_CAUSE_LABELS[row.open_blocker] ?? row.open_blocker} /> : null;
    case "rework":
      return row.rework_count ? <span className="text-xs tabular">{row.rework_count}</span> : null;
    case "questions":
      return row.open_questions ? (
        <Link href={`/items/${row.id}?tab=discussion`} className="inline-flex items-center gap-1 text-xs text-[var(--st-paused-fg)]">
          <CircleHelpIcon className="size-3.5" /> {row.open_questions}
        </Link>
      ) : null;
    case "comments":
      return row.comment_count ? (
        <Link href={`/items/${row.id}?tab=discussion`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <MessageSquareIcon className="size-3.5" /> {row.comment_count}
        </Link>
      ) : null;
    case "live_url":
      return row.live_url ? (
        <a href={row.live_url} target="_blank" rel="noreferrer" className="line-clamp-1 text-xs text-primary underline-offset-2 hover:underline">
          {row.live_url.replace(/^https?:\/\//, "")}
        </a>
      ) : null;
    case "provenance":
      return <span className="text-xs capitalize">{row.provenance}</span>;
    case "updated":
      return (
        <span className="text-xs text-muted-foreground" title={fmtDateTime(row.updated_at, ctx.tz)}>
          {fmtRelative(row.updated_at, ctx.now)}
          {row.last_actor_id && ctx.users[row.last_actor_id] ? ` by ${ctx.users[row.last_actor_id].split(" ")[0]}` : ""}
        </span>
      );
    default:
      return null;
  }
}
