import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
export { PageHeader, EmptyState } from "./primitives";

// Shared page kit (Update 1.0): the tab bar, toolbar, view switcher and status strip that pages build on, so
// pages added later look like the ClickUp-style shell instead of drifting. Header and empty state come from
// primitives and are re-exported here so a page imports one kit.

export type PageTab = { key: string; label: string; icon?: React.ReactNode; count?: number | string | null; hidden?: boolean };

// Underlined link tabs kept in the URL (?view=…), so a tab can be linked to, reloaded and opened in a new tab.
export function PageTabs({ tabs, active, href, label = "Sections", className }: { tabs: PageTab[]; active: string; href: (key: string) => string; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-1 flex gap-0.5 overflow-x-auto border-b px-1 [scrollbar-width:none]", className)}>
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={href(t.key)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors [&_svg]:size-3.5",
                on ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && t.count !== null && t.count !== "" && <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{t.count}</span>}
            </Link>
          );
        })}
    </nav>
  );
}

// A row of controls above a table or chart: wraps on small screens, keeps the primary action on the right.
export function Toolbar({ children, end, className, label }: { children?: React.ReactNode; end?: React.ReactNode; className?: string; label?: string }) {
  return (
    <div role="toolbar" aria-label={label} className={cn("flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2", className)}>
      {children}
      {end && <div className="ml-auto flex flex-wrap items-center gap-2">{end}</div>}
    </div>
  );
}

// A small labelled group inside a toolbar.
export function ToolbarField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  );
}

// Segmented control for switching between views or presets of the same data.
export function ViewSwitcher<T extends string>({ options, value, onChange, label, size = "sm" }: { options: readonly (readonly [T, string])[]; value: T | null; onChange: (v: T) => void; label: string; size?: "sm" | "xs" }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
      {options.map(([v, l]) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={cn("rounded-md font-medium transition-colors", size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs", on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

// One line of state under a toolbar: what is shown, how it was loaded, and when.
export function StatusStrip({ children, tone = "muted", className }: { children: React.ReactNode; tone?: "muted" | "warning" | "danger" | "success"; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs",
        tone === "muted" && "bg-muted/40 text-muted-foreground",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        tone === "danger" && "border-destructive/30 bg-destructive/5 text-destructive",
        tone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
        className,
      )}
    >
      {children}
    </div>
  );
}
