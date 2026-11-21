"use client";

import * as React from "react";
import { ArrowUpIcon, FootprintsIcon, FrownIcon, HandHeartIcon, HandIcon, LaughIcon, MusicIcon, PartyPopperIcon, SparklesIcon } from "lucide-react";

// The emote wheel: hold T, move the mouse towards an emote (the wheel follows the direction, not a click), let go
// of T to play it. Clicking a slice works too. Not in a first-person match.

export const WHEEL = [
  { key: "wave", label: "Wave", Icon: HandIcon },
  { key: "cheer", label: "Cheer", Icon: PartyPopperIcon },
  { key: "dance", label: "Dance", Icon: MusicIcon },
  { key: "laugh", label: "Laugh", Icon: LaughIcon },
  { key: "clap", label: "Clap", Icon: HandHeartIcon },
  { key: "bow", label: "Bow", Icon: FootprintsIcon },
  { key: "jump", label: "Jump", Icon: ArrowUpIcon },
  { key: "cry", label: "Cry", Icon: FrownIcon },
  { key: "firework", label: "Firework", Icon: SparklesIcon },
] as const;

export function EmoteWheel({ enabled, onPick }: { enabled: () => boolean; onPick: (key: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [sel, setSel] = React.useState(-1);
  const vec = React.useRef({ x: 0, y: 0 });
  const selRef = React.useRef(-1);
  selRef.current = sel;
  React.useEffect(() => {
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.("input, textarea, select");
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "t" || e.repeat || typing(e) || !enabled()) return;
      e.preventDefault();
      vec.current = { x: 0, y: 0 };
      setSel(-1);
      setOpen(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "t") return;
      setOpen((o) => {
        if (o && selRef.current >= 0) onPick(WHEEL[selRef.current]!.key);
        return false;
      });
    };
    // The mouse's direction picks a slice (works with the mouse locked or free).
    const move = (e: MouseEvent) => {
      const v = vec.current;
      v.x = Math.max(-120, Math.min(120, v.x + e.movementX));
      v.y = Math.max(-120, Math.min(120, v.y + e.movementY));
      if (Math.hypot(v.x, v.y) < 24) return setSel(-1);
      const a = (Math.atan2(v.x, -v.y) + Math.PI * 2) % (Math.PI * 2);
      setSel(Math.round(a / ((Math.PI * 2) / WHEEL.length)) % WHEEL.length);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", move);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", move);
    };
  }, [enabled, onPick]);
  if (!open) return null;
  const R = 92;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" data-emote-wheel>
      <div className="relative size-64 rounded-full bg-black/45 ring-2 ring-white/20 backdrop-blur-sm">
        {WHEEL.map((w, i) => {
          const a = (i / WHEEL.length) * Math.PI * 2;
          const on = sel === i;
          return (
            <button
              key={w.key}
              type="button"
              onClick={() => (onPick(w.key), setOpen(false))}
              className={`pointer-events-auto absolute flex size-14 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-[10px] font-medium transition-transform ${on ? "scale-115 bg-white text-black" : "bg-black/60 text-white"}`}
              style={{ left: `calc(50% + ${Math.sin(a) * R}px)`, top: `calc(50% - ${Math.cos(a) * R}px)` }}
              data-emote-slice={w.key}
            >
              <w.Icon className="size-5" />
              {w.label}
            </button>
          );
        })}
        <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-[11px] text-white/80">{sel >= 0 ? WHEEL[sel]!.label : "Move the mouse"}</p>
      </div>
    </div>
  );
}
