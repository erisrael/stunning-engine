"use client";

// A call on a computer, drawn as a phone in a call (iOS style) docked at the side of the screen: the person, the time,
// round labelled buttons, the red end button, and room under them for notes or choices. Used by the support desk's
// calls (support/call-center.tsx) and the team's voice calls (call-layer.tsx). Phones keep their full-screen call.

import * as React from "react";
import { PhoneOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PhoneControl = { key: string; label: string; icon: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void; data?: Record<string, string | boolean | undefined> };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

export function IosPhone({
  name,
  subtitle,
  status,
  badges,
  controls,
  endLabel = "End",
  onEnd,
  endData,
  ended = false,
  pulse = false,
  children,
  className,
  ...rest
}: {
  name: string;
  subtitle?: React.ReactNode;
  status: React.ReactNode;
  badges?: React.ReactNode;
  controls: PhoneControl[];
  endLabel?: string;
  onEnd?: () => void;
  endData?: Record<string, string | boolean | undefined>;
  ended?: boolean;
  pulse?: boolean;
  children?: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="dialog"
      aria-label={`${name}: ${typeof status === "string" ? status : "call"}`}
      className={cn(
        "fixed top-20 right-5 z-[90] flex max-h-[calc(100dvh-6rem)] w-[300px] flex-col overflow-hidden rounded-[46px] border-[10px] border-zinc-900 bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-950 text-white shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] ring-1 ring-black/40",
        className,
      )}
      data-ios-phone
      {...rest}
    >
      {/* The island at the top, as on the phone. */}
      <div aria-hidden className="mx-auto mt-2 h-6 w-24 shrink-0 rounded-full bg-black" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-5 pb-5">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className={cn("mb-2 flex size-20 items-center justify-center rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600 text-3xl font-medium", pulse && "motion-safe:animate-pulse")} aria-hidden>
            {initials(name)}
          </span>
          <span className="max-w-full truncate text-[22px] leading-tight font-normal tracking-tight">{name}</span>
          {subtitle && <span className="text-xs text-white/60">{subtitle}</span>}
          <span className="text-[15px] text-white/75 tabular-nums" aria-live="polite" data-call-clock>
            {status}
          </span>
          {badges && <div className="mt-1 flex flex-wrap justify-center gap-1 text-[11px]">{badges}</div>}
        </div>
        {!ended && controls.length > 0 && (
          <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-4">
            {controls.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={c.disabled}
                onClick={c.onClick}
                aria-label={c.label}
                aria-pressed={c.active}
                title={c.label}
                className="group flex flex-col items-center gap-1.5 disabled:opacity-40"
                {...c.data}
              >
                <span className={cn("flex size-[60px] items-center justify-center rounded-full backdrop-blur transition-colors [&_svg]:size-6", c.active ? "bg-white text-zinc-900" : "bg-white/15 group-hover:bg-white/25")}>{c.icon}</span>
                <span className="max-w-full truncate text-[11px] text-white/85">{c.label}</span>
              </button>
            ))}
          </div>
        )}
        {children && <div className="mt-5 space-y-2 text-sm">{children}</div>}
        {onEnd && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={onEnd}
              aria-label={endLabel}
              title={endLabel}
              className={cn("flex size-[68px] items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 [&_svg]:size-7", ended ? "bg-white/20 hover:bg-white/30" : "bg-[#ff3b30] hover:bg-[#ff5147]")}
              {...endData}
            >
              {ended ? <span className="text-sm font-medium">{endLabel}</span> : <PhoneOffIcon />}
            </button>
          </div>
        )}
      </div>
      {/* The home indicator. */}
      <div aria-hidden className="mx-auto mb-2 h-1 w-28 shrink-0 rounded-full bg-white/60" />
    </div>
  );
}
