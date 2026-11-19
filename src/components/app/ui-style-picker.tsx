"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { UI_STYLES } from "@/lib/ui-styles";
import { cn } from "@/lib/utils";
import { allowedStyles } from "./appearance";

// A small drawing of each style: its colours, its corners and its heading lettering.
function Sample({ k, swatch }: { k: string; swatch: readonly string[] }) {
  const [bg, surface, accent, ink] = swatch;
  const radius = k === "classic" || k === "tactical" ? 0 : k === "sakura" ? 10 : k === "zen" ? 4 : 6;
  const font = k === "classic" ? "var(--font-vt323), monospace" : k === "comic" ? "var(--font-bangers), Impact" : k === "sunset" ? "var(--font-bebas), Impact" : k === "tactical" ? "var(--font-rajdhani)" : k === "sakura" ? "var(--font-fredoka)" : "inherit";
  return (
    <span aria-hidden className="relative block h-16 w-full overflow-hidden" style={{ background: k === "sunset" ? `linear-gradient(180deg, ${bg}, #3a1450)` : bg, borderRadius: radius }}>
      <span
        className="absolute top-2 left-2 right-8 bottom-2 flex flex-col justify-between p-1.5"
        style={{
          background: surface,
          borderRadius: radius,
          border: k === "comic" ? `2px solid ${ink}` : k === "classic" ? "2px outset #fff" : `1px solid ${ink}22`,
          boxShadow: k === "comic" ? `3px 3px 0 ${ink}` : k === "sunset" ? `0 0 10px ${accent}` : "none",
          clipPath: k === "tactical" ? "polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px))" : undefined,
        }}
      >
        <span className="truncate text-[11px] leading-none font-bold" style={{ fontFamily: font, color: k === "sunset" ? accent : ink, textTransform: k === "tactical" ? "uppercase" : undefined }}>
          {k === "comic" ? "POW!" : k === "classic" ? "C:\\>_" : "Aa"}
        </span>
        <span className="h-2 w-10" style={{ background: accent, borderRadius: k === "sakura" ? 99 : radius / 2 }} />
      </span>
      <span className="absolute top-2 right-2 bottom-2 w-4" style={{ background: accent, opacity: 0.85, borderRadius: radius }} />
    </span>
  );
}

// The UI styles as cards. value "" follows the workspace. Admin's allowed list hides the others (allowed: all when empty).
export function UiStylePicker({ value, onChange, workspaceStyle, allowed, showWorkspaceOption = true }: { value: string; onChange: (k: string) => void; workspaceStyle?: string; allowed?: string[]; showWorkspaceOption?: boolean }) {
  const [ok, setOk] = React.useState<string[]>(allowed ?? []);
  React.useEffect(() => {
    if (!allowed) setOk(allowedStyles());
  }, [allowed]);
  const list = UI_STYLES.filter((s) => !ok.length || ok.includes(s.key));
  const ws = UI_STYLES.find((s) => s.key === workspaceStyle);
  return (
    <div className="space-y-2" data-ui-style-picker>
      {showWorkspaceOption && (
        <button type="button" role="radio" aria-checked={value === ""} onClick={() => onChange("")} className={cn("rounded-full border px-3 py-1 text-xs", value === "" ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted")}>
          As set for the workspace{ws ? ` (${ws.label})` : ""}
        </button>
      )}
      <div role="radiogroup" aria-label="UI style" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((s) => {
          const on = value === s.key;
          return (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${s.label}: ${s.vibe}`}
              onClick={() => onChange(s.key)}
              className={cn("group relative overflow-hidden rounded-lg border bg-card p-1.5 text-left transition-shadow hover:shadow-md", on && "border-primary ring-2 ring-primary/40")}
              data-ui-style={s.key}
            >
              <Sample k={s.key} swatch={s.swatch} />
              <span className="mt-1.5 flex items-center gap-1 px-0.5 text-sm font-medium">
                {s.label}
                {on && <CheckIcon className="ml-auto size-4 text-primary" />}
              </span>
              <span className="block px-0.5 text-[11px] text-muted-foreground">{s.vibe}</span>
              <span className="mt-0.5 line-clamp-2 block px-0.5 text-[11px] text-muted-foreground/90">{s.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
