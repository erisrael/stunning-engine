"use client";

// A side column that can be resized with a slider (drag the bar between it and the main area, or focus it and use the
// arrow keys) and collapsed with the button on the bar. Its width and whether it is collapsed are kept on this device.
// From the given breakpoint up only; below it the column keeps its own classes (on phones it is usually full width).
// Used by the support desk: the conversation list (left) and the customer details (right).

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type From = "md" | "xl";
// Literal class names per breakpoint (Tailwind only sees whole strings).
const SHOW: Record<From, string> = { md: "md:flex", xl: "xl:flex" };
const WIDTH: Record<From, string> = { md: "md:w-(--pane-w)", xl: "xl:w-(--pane-w)" };
const HIDE: Record<From, string> = { md: "md:hidden", xl: "xl:hidden" };

export function ResizablePane({
  side,
  storageKey,
  label,
  from = "md",
  initial = 340,
  min = 260,
  max = 560,
  collapsible = true,
  onCollapse,
  className,
  children,
  ...rest
}: {
  side: "left" | "right";
  storageKey: string;
  label: string;
  from?: From;
  initial?: number;
  min?: number;
  max?: number;
  collapsible?: boolean;
  /** When given, the collapse button calls this instead of collapsing here (the owner hides the column). */
  onCollapse?: () => void;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  const key = `myseed.pane.${storageKey}`;
  const [w, setW] = React.useState(initial);
  const [collapsed, setCollapsed] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  React.useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "null") as { w?: number; c?: boolean } | null;
      if (v?.w) setW(Math.min(max, Math.max(min, v.w)));
      if (v?.c && !onCollapse) setCollapsed(true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const save = (next: { w?: number; c?: boolean }) => {
    try {
      const cur = JSON.parse(localStorage.getItem(key) ?? "{}") as object;
      localStorage.setItem(key, JSON.stringify({ ...cur, ...next }));
    } catch {}
  };
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const toggle = () => {
    if (onCollapse) return onCollapse();
    setCollapsed((c) => (save({ c: !c }), !c));
  };

  const start = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("button")) return;
    if (collapsed) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = w;
    let last = w0;
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const move = (ev: PointerEvent) => {
      last = clamp(side === "left" ? w0 + (ev.clientX - x0) : w0 - (ev.clientX - x0));
      setW(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setDragging(false);
      save({ w: last });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 16;
    const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
    if (e.key === grow || e.key === shrink) {
      e.preventDefault();
      if (collapsed) return toggle();
      const next = clamp(w + (e.key === grow ? step : -step));
      setW(next);
      save({ w: next });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  // The arrow on the button points the way the column will move.
  const Arrow = (side === "left") === collapsed ? ChevronRightIcon : ChevronLeftIcon;
  const handle = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`${label}: drag to resize, Enter to ${collapsed ? "show" : "hide"}`}
      aria-valuenow={collapsed ? 0 : w}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={start}
      onKeyDown={onKey}
      onDoubleClick={toggle}
      data-pane-handle={storageKey}
      data-dragging={dragging ? "" : undefined}
      className={cn(
        "group/handle relative z-10 hidden w-2 shrink-0 touch-none outline-none",
        SHOW[from],
        !collapsed && "cursor-col-resize",
        side === "left" ? "-mr-1" : "-ml-1",
      )}
    >
      {/* The visible line, brighter while hovered, focused or dragged. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors",
          "group-hover/handle:w-[3px] group-hover/handle:bg-primary/50 group-focus-visible/handle:w-[3px] group-focus-visible/handle:bg-primary group-data-dragging/handle:w-[3px] group-data-dragging/handle:bg-primary",
        )}
      />
      {collapsible && (
        <button
          type="button"
          onClick={toggle}
          tabIndex={-1}
          title={collapsed ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
          aria-label={collapsed ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
          className={cn(
            "glass absolute top-1/2 left-1/2 flex h-12 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-[opacity,transform] hover:text-foreground active:scale-95",
            collapsed ? "opacity-100" : "opacity-70 group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100",
          )}
          data-pane-toggle={storageKey}
        >
          <Arrow className="size-3.5" />
        </button>
      )}
    </div>
  );

  const pane = (
    <aside
      {...rest}
      aria-label={label}
      data-pane={storageKey}
      data-collapsed={collapsed ? "" : undefined}
      style={{ ["--pane-w" as string]: `${w}px` } as React.CSSProperties}
      className={cn(className, WIDTH[from], collapsed && HIDE[from], dragging && "select-none")}
    >
      {children}
    </aside>
  );
  return side === "left" ? (
    <>
      {pane}
      {handle}
    </>
  ) : (
    <>
      {handle}
      {pane}
    </>
  );
}
