"use client";

import * as React from "react";

// Accent colour, corner style and text size. Stored per browser; applied to <html> before paint.
export type Appearance = { accent: string; radius: string; text: string };

export const ACCENTS = [
  { key: "violet", label: "Violet", color: "#7b68ee" },
  { key: "blue", label: "Blue", color: "#2563eb" },
  { key: "green", label: "Myseed green", color: "#0b7a3b" },
  { key: "teal", label: "Teal", color: "#0f8a8a" },
  { key: "orange", label: "Orange", color: "#e8590c" },
  { key: "pink", label: "Pink", color: "#d6336c" },
  { key: "slate", label: "Slate", color: "#3d4350" },
];

const KEY = "myseed.appearance";
const DEFAULTS: Appearance = { accent: "violet", radius: "default", text: "normal" };

export function readAppearance(): Appearance {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Appearance>) };
  } catch {
    return DEFAULTS;
  }
}

function apply(a: Appearance) {
  const el = document.documentElement;
  el.dataset.accent = a.accent;
  el.dataset.radius = a.radius;
  el.dataset.text = a.text;
}

export function useAppearance() {
  const [a, setA] = React.useState<Appearance>(DEFAULTS);
  React.useEffect(() => setA(readAppearance()), []);
  const update = (patch: Partial<Appearance>) => {
    const next = { ...a, ...patch };
    setA(next);
    apply(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage blocked: applies for this visit only */
    }
  };
  return [a, update] as const;
}

// Inline script for the root layout, so the saved appearance is applied before the first paint.
export const APPEARANCE_SCRIPT = `try{var a=JSON.parse(localStorage.getItem("${KEY}")||"{}");var d=document.documentElement;d.dataset.accent=a.accent||"violet";d.dataset.radius=a.radius||"default";d.dataset.text=a.text||"normal";}catch(e){}`;
