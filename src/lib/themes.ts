// Theme presets (Update 1.0 Phase 8): whole colour sets a person picks in Settings, Appearance, or Admin sets for
// everyone who has not chosen (Settings, Workspace). Each is light or dark; the colours live in globals.css under
// :root[data-preset="<key>"], and data-mode makes the dark: styles follow the preset.
export const THEME_PRESETS = [
  { key: "dim", label: "Dim", mode: "dark", swatch: ["#22272e", "#2d333b", "#539bf5", "#adbac7"] },
  { key: "midnight", label: "Midnight", mode: "dark", swatch: ["#0b1020", "#141b2e", "#8c7cf0", "#c9cce0"] },
  { key: "forest", label: "Myseed Forest", mode: "dark", swatch: ["#0f1a14", "#18261d", "#34a853", "#e8f5ec"] },
  { key: "ocean", label: "Ocean", mode: "light", swatch: ["#f2f8fb", "#ffffff", "#006d77", "#14213d"] },
  { key: "sand", label: "Sand", mode: "light", swatch: ["#faf6ee", "#ffffff", "#a14c08", "#2b2620"] },
  { key: "contrast", label: "High contrast", mode: "dark", swatch: ["#000000", "#111111", "#ffd400", "#ffffff"] },
] as const;
export type ThemePresetKey = (typeof THEME_PRESETS)[number]["key"];
export const PRESET_KEYS = THEME_PRESETS.map((p) => p.key) as string[];
export const isPreset = (k: string | null | undefined): k is ThemePresetKey => !!k && PRESET_KEYS.includes(k);
// Pages that keep their own look whatever the preset (the customer widget, kiosks).
export const PRESET_FREE_PATHS = ["/support-widget", "/kiosk"];
