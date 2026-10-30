"use client";

import Link from "next/link";
import { CircleHelpIcon, InfoIcon, InboxIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { initials } from "@/lib/format";

export function PageHeader({
  title,
  description,
  actions,
  children,
  eyebrow,
  help,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  eyebrow?: React.ReactNode;
  // Help chapter key: shows a link to that chapter of the manual next to the title.
  help?: string;
}) {
  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</div>}
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
            {help && (
              <Link href={`/profile/help#${help}`} title="How this page works" aria-label="Help for this page" className="text-muted-foreground hover:text-foreground">
                <CircleHelpIcon className="size-4" />
              </Link>
            )}
          </h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export type MetricDefinition = { definition: string; basis?: string; denominator?: string; sample?: string | number };

export function MetricCard({
  label,
  value,
  hint,
  href,
  tone = "default",
  definition,
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: "default" | "warning" | "danger" | "success";
  definition?: MetricDefinition;
  trend?: { direction: "up" | "down" | "flat"; text: string; good?: boolean };
  className?: string;
}) {
  const toneClass = {
    default: "",
    warning: "before:bg-[var(--st-paused-fg)]",
    danger: "before:bg-[var(--st-blocked-fg)]",
    success: "before:bg-[var(--st-done-fg)]",
  }[tone];
  const body = (
    <Card
      className={cn(
        "relative h-full gap-1 overflow-hidden p-4 transition-colors",
        tone !== "default" && "before:absolute before:inset-y-0 before:left-0 before:w-1",
        toneClass,
        href && "hover:border-primary/40 hover:bg-accent/30",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {definition && (
          <HoverCard openDelay={150}>
            <HoverCardTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                aria-label={`How ${label} is calculated`}
                className="-m-1 rounded p-1 text-muted-foreground/70 hover:text-foreground"
                onClick={(e) => e.preventDefault()}
              >
                <InfoIcon className="size-3.5" />
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="w-72 text-xs" align="end">
              <div className="space-y-1.5">
                <p className="font-medium text-foreground">{label}</p>
                <p className="text-muted-foreground">{definition.definition}</p>
                {definition.basis && (
                  <p>
                    <span className="font-medium">Date basis: </span>
                    {definition.basis}
                  </p>
                )}
                {definition.denominator && (
                  <p>
                    <span className="font-medium">Denominator: </span>
                    {definition.denominator}
                  </p>
                )}
                {definition.sample !== undefined && (
                  <p>
                    <span className="font-medium">Sample size: </span>
                    {definition.sample}
                  </p>
                )}
                {href && <p className="text-muted-foreground">Select the card to open the underlying records.</p>}
              </div>
            </HoverCardContent>
          </HoverCard>
        )}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular">{value}</div>
      {(hint || trend) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {trend && (
            <span
              className={cn(
                "font-medium",
                trend.good === undefined ? "" : trend.good ? "text-[var(--st-done-fg)]" : "text-[var(--st-blocked-fg)]",
              )}
            >
              {trend.text}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon ?? <InboxIcon className="size-5" />}</div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function UserAvatar({ name, size = "sm", className }: { name: string | null | undefined; size?: "xs" | "sm" | "md"; className?: string }) {
  const label = name ?? "Unassigned";
  const palette = ["#074924", "#2f6f45", "#3b6fb6", "#8a5300", "#5434a8", "#0f625c", "#9b3d2c"];
  const color = name ? palette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length] : "#9aa59d";
  const dim = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs" }[size];
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", dim, className)}
      style={{ backgroundColor: color }}
    >
      {name ? initials(name) : "-"}
    </span>
  );
}

export function SectionTitle({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function KeyValue({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

export function Meter({ value, max, tone = "primary", className }: { value: number; max: number; tone?: "primary" | "warning" | "danger"; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = { primary: "bg-primary", warning: "bg-[var(--st-paused-fg)]", danger: "bg-[var(--st-blocked-fg)]" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="meter" aria-valuenow={value} aria-valuemax={max} aria-valuemin={0}>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
