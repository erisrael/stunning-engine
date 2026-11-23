// Icon packs a person (account menu) or Admin (Configure whole system, the default) can choose. Outline, Soft and
// Bold, Filled and Duotone are drawn as their own icons (src/components/app/app-icon.tsx); Neon, Sticker and Pixel
// restyle them with CSS (src/app/globals.css).
export const ICON_PACKS = [
  { value: "lucide", label: "Outline", hint: "Thin lines, the default" },
  { value: "fill", label: "Filled", hint: "Solid shapes" },
  { value: "duotone", label: "Duotone", hint: "Two tones" },
  { value: "soft", label: "Soft", hint: "Rounded lines" },
  { value: "bold", label: "Bold", hint: "Thick, rounded lines" },
  { value: "neon", label: "Neon", hint: "Glowing outlines" },
  { value: "sticker", label: "Sticker", hint: "Filled with a white edge" },
  { value: "pixel", label: "Pixel", hint: "Square, crisp lines" },
] as const;
export const isIconPack = (v: unknown): v is string => ICON_PACKS.some((p) => p.value === v);

// Motion: off, subtle or cinematic. "auto" follows the workspace (Configure whole system).
export const MOTION_CHOICES = [
  { value: "auto", label: "Automatic" },
  { value: "off", label: "Off" },
  { value: "subtle", label: "Subtle" },
  { value: "cinematic", label: "Cinematic" },
] as const;
