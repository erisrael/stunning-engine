"use client";

import * as React from "react";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// The Phosphor version of an app icon, in the one style the person chose (data-icon-pack on <html>, set before the
// page paints). Nothing is loaded for the default outline style; the Phosphor icons come in one shared download the
// first time a Phosphor style is in use, and until then the outline icon keeps showing (globals.css).
const WEIGHT = { fill: "fill", sticker: "fill", duotone: "duotone", soft: "regular", bold: "bold" } as const;
type Pack = keyof typeof WEIGHT;
const CLASS: Record<Pack, string> = { fill: "pk-fill", sticker: "pk-fill", duotone: "pk-duo", soft: "pk-soft", bold: "pk-bold" };

let icons: Record<string, Icon> | null = null;
let loading: Promise<Record<string, Icon>> | null = null;
const load = () => (loading ??= import("./phosphor-icons").then((m) => (icons = m.PH)));

const packNow = (): Pack | null => {
  const v = typeof document === "undefined" ? "" : (document.documentElement.dataset.iconPack ?? "");
  return v in WEIGHT ? (v as Pack) : null;
};
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!observer && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => listeners.forEach((l) => l()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-icon-pack"] });
  }
  return () => void listeners.delete(fn);
}

export function PhosphorTwin({ k, className }: { k: string; className?: string }) {
  const pack = React.useSyncExternalStore(subscribe, packNow, () => null);
  const [, ready] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (pack && !icons) void load().then(ready);
  }, [pack]);
  const Ph = pack && icons ? icons[k] : undefined;
  if (!pack || !Ph) return null;
  return <Ph className={cn(className, "pk-set", CLASS[pack])} weight={WEIGHT[pack]} />;
}
