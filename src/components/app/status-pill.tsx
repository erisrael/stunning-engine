import { cn } from "@/lib/utils";
import { tip } from "@/lib/help";
import { sheetStatusLabel, LIFECYCLE_LABELS, type AttemptStatus, type Stage } from "@/lib/domain";

export type Tone = "neutral" | "queued" | "active" | "paused" | "blocked" | "handoff" | "done" | "scheduled" | "failed";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-[var(--st-neutral-bg)] text-[var(--st-neutral-fg)]",
  queued: "bg-[var(--st-queued-bg)] text-[var(--st-queued-fg)]",
  active: "bg-[var(--st-active-bg)] text-[var(--st-active-fg)]",
  paused: "bg-[var(--st-paused-bg)] text-[var(--st-paused-fg)]",
  blocked: "bg-[var(--st-blocked-bg)] text-[var(--st-blocked-fg)]",
  handoff: "bg-[var(--st-handoff-bg)] text-[var(--st-handoff-fg)]",
  done: "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
  scheduled: "bg-[var(--st-scheduled-bg)] text-[var(--st-scheduled-fg)]",
  failed: "bg-[var(--st-failed-bg)] text-[var(--st-failed-fg)]",
};

const DOT_CLASS: Record<Tone, string> = {
  neutral: "bg-[var(--st-neutral-fg)]",
  queued: "bg-[var(--st-queued-fg)]",
  active: "bg-[var(--st-active-fg)]",
  paused: "bg-[var(--st-paused-fg)]",
  blocked: "bg-[var(--st-blocked-fg)]",
  handoff: "bg-[var(--st-handoff-fg)]",
  done: "bg-[var(--st-done-fg)]",
  scheduled: "bg-[var(--st-scheduled-fg)]",
  failed: "bg-[var(--st-failed-fg)]",
};

export function toneFor(status: string | null | undefined, substate?: string | null): Tone {
  if (substate === "failed") return "failed";
  if (substate === "scheduled") return "scheduled";
  if (substate === "changes_requested") return "paused";
  if (substate === "ready") return "handoff";
  switch (status) {
    case "queued":
      return "queued";
    case "in_progress":
      return "active";
    case "paused":
      return "paused";
    case "blocked":
      return "blocked";
    case "finished":
      return "active";
    case "lead_review":
      return "paused";
    case "ready":
    case "awaiting_handoff":
      return "handoff";
    case "completed":
    case "published":
      return "done";
    case "returned":
    case "superseded":
    case "cancelled":
    case "archived":
      return "neutral";
    case "draft":
      return "neutral";
    default:
      return "neutral";
  }
}

export function StatusPill({
  tone,
  label,
  className,
  size = "sm",
  dot = true,
  title,
}: {
  tone: Tone;
  label: string;
  className?: string;
  size?: "xs" | "sm";
  dot?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "xs" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[tone])} />}
      <span className="truncate">{label}</span>
    </span>
  );
}

// Status of the item as a whole: lifecycle outside production, stage-specific label inside it.
export function ItemStatusPill({
  lifecycle,
  stage,
  status,
  substate,
  size,
}: {
  lifecycle: string;
  stage: Stage | null;
  status: AttemptStatus | null;
  substate: string | null;
  size?: "xs" | "sm";
}) {
  if (lifecycle !== "in_production" || !stage) {
    const tone: Tone = lifecycle === "published" ? "done" : "neutral";
    return <StatusPill tone={tone} size={size} title={tip(`status.${lifecycle}`)} label={LIFECYCLE_LABELS[lifecycle as keyof typeof LIFECYCLE_LABELS] ?? lifecycle} />;
  }
  return <StatusPill tone={toneFor(status, substate)} size={size} title={tip(`status.${status}`)} label={sheetStatusLabel(stage, status, substate)} />;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: "border-[var(--st-blocked-fg)]/40 text-[var(--st-blocked-fg)]",
    high: "border-[var(--st-paused-fg)]/40 text-[var(--st-paused-fg)]",
    normal: "border-border text-muted-foreground",
    low: "border-border text-muted-foreground/80",
  };
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-medium capitalize", map[priority] ?? map.normal)}>
      {priority}
    </span>
  );
}
