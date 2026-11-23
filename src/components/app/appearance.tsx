"use client";

import * as React from "react";
import { PRESET_FREE_PATHS, THEME_PRESETS, isPreset } from "@/lib/themes";
import { APPEARANCE_KEY } from "@/lib/appearance-script";
import { effectiveStyle } from "@/lib/ui-styles";

// Colour theme preset, accent colour, corner style, text size and colourful or plain icons. Stored per browser; applied
// to <html> before paint. preset: "" follows the workspace's (Admin), "none" is plain Light or Dark.
export type Appearance = { style: string; preset: string; accent: string; radius: string; text: string; icons: string; iconPack: string; iconWeight: string; motion: string; font: string; contrast: string; lite: string; lang: string; calendar: string; helpLinks: string; tips: string };

export const FONTS = [
  { key: "app", label: "Jakarta (default)" },
  { key: "inter", label: "Inter" },
  { key: "readable", label: "Atkinson (easy to read)" },
  { key: "rounded", label: "Nunito (rounded)" },
  { key: "serif", label: "Lora (serif)" },
  { key: "manrope", label: "Manrope" },
  { key: "plex", label: "IBM Plex Sans" },
  { key: "source", label: "Source Sans 3" },
  { key: "roboto", label: "Roboto" },
  { key: "ethiopic", label: "Noto Ethiopic (Amharic first)" },
  { key: "abyssinica", label: "Abyssinica SIL (Amharic, traditional)" },
];

export const ACCENTS = [
  { key: "violet", label: "Violet", color: "#7b68ee" },
  { key: "blue", label: "Blue", color: "#2563eb" },
  { key: "green", label: "Myseed green", color: "#0b7a3b" },
  { key: "teal", label: "Teal", color: "#0f8a8a" },
  { key: "orange", label: "Orange", color: "#e8590c" },
  { key: "pink", label: "Pink", color: "#d6336c" },
  { key: "slate", label: "Slate", color: "#3d4350" },
];

const KEY = APPEARANCE_KEY;
const DEFAULTS: Appearance = { style: "", preset: "", accent: "violet", radius: "default", text: "normal", icons: "colour", iconPack: "default", iconWeight: "regular", motion: "auto", font: "app", contrast: "normal", lite: "off", lang: "en", calendar: "", helpLinks: "on", tips: "on" };

export function readAppearance(): Appearance {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Appearance>) };
  } catch {
    return DEFAULTS;
  }
}

// The preset in effect: the person's, else the workspace's; none on pages that keep their own look.
function applyPreset(el: HTMLElement, chosen: string) {
  const key = chosen || el.dataset.presetDefault || "";
  const p = THEME_PRESETS.find((x) => x.key === key);
  if (p && isPreset(key) && !PRESET_FREE_PATHS.some((x) => location.pathname.startsWith(x))) {
    el.dataset.preset = p.key;
    el.dataset.mode = p.mode;
  } else {
    delete el.dataset.preset;
    delete el.dataset.mode;
  }
}

// The UI style in effect: the person's when Admin allows it, else the workspace's (data-style-default).
function applyStyle(el: HTMLElement, chosen: string) {
  if (PRESET_FREE_PATHS.some((x) => location.pathname.startsWith(x))) return void delete el.dataset.style;
  const allowed = (el.dataset.styleAllowed ?? "").split(",").filter(Boolean);
  el.dataset.style = effectiveStyle(chosen, el.dataset.styleDefault, allowed);
}

// The motion in effect: the person's choice, else the workspace's; cinematic only where Admin allows it.
export function effectiveMotion(chosen: string | undefined, el: HTMLElement) {
  let m = !chosen || chosen === "auto" ? el.dataset.motionDefault || "subtle" : chosen;
  if (m === "cinematic" && el.dataset.motionAllowed === "0") m = "subtle";
  return m;
}
export const cinematicAllowed = () => typeof document === "undefined" || document.documentElement.dataset.motionAllowed !== "0";

// The styles this person may pick (Admin, Settings, Workspace), read from <html>.
export function allowedStyles(): string[] {
  if (typeof document === "undefined") return [];
  return (document.documentElement.dataset.styleAllowed ?? "").split(",").filter(Boolean);
}

function apply(a: Appearance) {
  const el = document.documentElement;
  applyPreset(el, a.preset);
  applyStyle(el, a.style);
  el.dataset.accent = a.accent;
  el.dataset.radius = a.radius;
  el.dataset.text = a.text;
  el.dataset.icons = a.icons;
  // "default" and "auto" follow the workspace (Admin, Configure whole system), read from <html>.
  el.dataset.iconPack = !a.iconPack || a.iconPack === "default" ? (el.dataset.iconPackDefault || "lucide") : a.iconPack;
  el.dataset.motion = effectiveMotion(a.motion, el);
  el.dataset.iconWeight = a.iconWeight;
  el.dataset.font = a.font;
  el.dataset.contrast = a.contrast;
  el.dataset.lite = a.lite;
  el.dataset.lang = a.lang;
  el.dataset.helplinks = a.helpLinks;
  el.dataset.tips = a.tips;
  window.dispatchEvent(new Event("myseed-appearance"));
  // No choice: the workspace's calendar (Settings), read by the Localizer.
  if (a.calendar) el.dataset.calendar = a.calendar;
  else delete el.dataset.calendar;
  el.lang = a.lang === "am" ? "am" : "en";
}

// Hover tips are on unless the person turned them off on this device (Settings, Help).
export function useTipsOn() {
  return React.useSyncExternalStore(
    (cb) => (window.addEventListener("myseed-appearance", cb), () => window.removeEventListener("myseed-appearance", cb)),
    () => document.documentElement.dataset.tips !== "off",
    () => true,
  );
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

// Change part of the look from anywhere (the assistant: "switch to comic style", "make it green"), merged with
// what is saved on this device.
export function patchAppearance(patch: Partial<Appearance>) {
  const next = { ...readAppearance(), ...patch };
  apply(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: applies for this visit only */
  }
  return next;
}
