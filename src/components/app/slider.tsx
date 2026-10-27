"use client";

// Native range input styled to the theme; keyboard and screen-reader support come from the browser.
export function Slider({ min, max, step = 1, value, onChange, label }: { min: number; max: number; step?: number; value: number; onChange: (v: number) => void; label?: string }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[var(--primary)]"
    />
  );
}
