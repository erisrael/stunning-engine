// UI styles: whole looks for the app, beyond colours (src/lib/themes.ts). A style changes shapes, borders, shadows,
// fonts, icons, backgrounds and motion, has a Light and a Dark version, and keeps the person's accent colour.
// The CSS lives in src/app/ui-styles.css under :root[data-style="<key>"]. Admin sets the style for everyone who has
// not chosen and which styles people may pick (Settings, Workspace); each person picks in Appearance.
export const UI_STYLES = [
  {
    key: "studio",
    label: "Studio",
    vibe: "Professional",
    description: "Clean, calm and quiet: soft shadows and smooth motion for long work days.",
    swatch: ["#ffffff", "#f4f5f7", "#7b68ee", "#1e1f21"],
    motion: "subtle",
  },
  {
    key: "zen",
    label: "Zen",
    vibe: "Minimalist",
    description: "Only what matters: flat surfaces, thin lines, one-colour icons and almost no motion.",
    swatch: ["#fafafa", "#ffffff", "#111111", "#ececec"],
    motion: "none",
  },
  {
    key: "classic",
    label: "Classic Desk",
    vibe: "Old school",
    description: "A 90s desktop: bevelled buttons, square windows, pixel headings and chunky scrollbars.",
    swatch: ["#d4d0c8", "#ffffff", "#000080", "#808080"],
    motion: "stepped",
  },
  {
    key: "sakura",
    label: "Sakura Pop",
    vibe: "Anime, animated",
    description: "Pastel and playful: round cards, bouncy buttons, sparkles and drifting petals.",
    swatch: ["#fff5f9", "#ffffff", "#ff7eb6", "#b28dff"],
    motion: "lively",
  },
  {
    key: "sunset",
    label: "Sunset City",
    vibe: "Neon city nights",
    description: "Palm-tree sunsets and neon: bold slanted headings, glowing edges and a retro horizon grid.",
    swatch: ["#120a1f", "#ff6ec7", "#ffb347", "#3ad6ff"],
    motion: "lively",
  },
  {
    key: "tactical",
    label: "Tactical",
    vibe: "Competitive HUD",
    description: "Sharp and precise: notched corners, a fine grid, condensed capitals and quick sweeps.",
    swatch: ["#0f1923", "#ece8e1", "#ff4655", "#2a3a48"],
    motion: "snappy",
  },
  {
    key: "comic",
    label: "Comic Pop",
    vibe: "Comic book",
    description: "Ink outlines, halftone dots, hard drop shadows and headings that go POW.",
    swatch: ["#fffbe8", "#111111", "#ffd400", "#e63946"],
    motion: "lively",
  },
  {
    key: "terminal",
    label: "Dev Terminal",
    vibe: "Developer, alive",
    description: "A living terminal: phosphor green on black, monospace everywhere, scanlines, typed headings with a blinking cursor, falling code and pixel bursts.",
    swatch: ["#06100b", "#00ff9c", "#ffcc33", "#0f2a1e"],
    motion: "lively",
  },
] as const;

export type UiStyleKey = (typeof UI_STYLES)[number]["key"];
export const UI_STYLE_KEYS = UI_STYLES.map((s) => s.key) as string[];
export const DEFAULT_UI_STYLE: UiStyleKey = "studio";
export const isUiStyle = (k: string | null | undefined): k is UiStyleKey => !!k && UI_STYLE_KEYS.includes(k);

// The style in effect: the person's choice when Admin allows it, else the workspace's, else Studio.
export function effectiveStyle(chosen: string | null | undefined, workspace: string | null | undefined, allowed: readonly string[] | null | undefined): UiStyleKey {
  const ok = (k: string | null | undefined) => isUiStyle(k) && (!allowed?.length || allowed.includes(k));
  if (ok(chosen)) return chosen as UiStyleKey;
  if (isUiStyle(workspace)) return workspace;
  return DEFAULT_UI_STYLE;
}
