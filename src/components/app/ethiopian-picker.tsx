"use client";

// Picking dates in the Ethiopian calendar (Phase 16.4). For people who use it (account menu, Language and calendar,
// or the workspace's choice), any date field gets a small picker beside it while it has focus: the Ethiopian day,
// month and year, which fill the field with the same day. The pages themselves are not changed: the picker floats
// over them and sets the field the way typing would, so every form keeps working as before.
import * as React from "react";
import { createPortal } from "react-dom";
import { ET_MONTHS, ET_MONTHS_LATIN, fromEthiopian, toEthiopian } from "@/lib/ethiopian";

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (year: number, month: number) => (month < 13 ? 30 : (year + 1) % 4 === 0 ? 6 : 5);

function setNative(input: HTMLInputElement, value: string) {
  // React listens to the input event and reads the value through the prototype's setter.
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function EthiopianDatePicker({ defaultCalendar = "gregorian" }: { defaultCalendar?: string }) {
  const [target, setTarget] = React.useState<HTMLInputElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const [v, setV] = React.useState<{ year: number; month: number; day: number }>(() => {
    const d = new Date();
    return toEthiopian(d.getFullYear(), d.getMonth() + 1, d.getDate());
  });
  const panel = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const on = () => {
      const cal = document.documentElement.dataset.calendar || defaultCalendar;
      return cal === "ethiopian" || cal === "both";
    };
    const focus = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== "date" || !on() || el.disabled || el.readOnly) return;
      const r = el.getBoundingClientRect();
      setTarget(el);
      setPos({ top: Math.min(window.innerHeight - 150, r.bottom + 6), left: Math.max(8, Math.min(window.innerWidth - 300, r.left)) });
      const cur = el.value && /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : new Date().toISOString().slice(0, 10);
      const [y, m, d] = cur.split("-").map(Number);
      setV(toEthiopian(y!, m!, d!));
    };
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t)) return;
      if (t instanceof HTMLInputElement && t.type === "date") return;
      setTarget(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setTarget(null);
    document.addEventListener("focusin", focus);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [defaultCalendar]);

  if (!target || !pos) return null;
  const latin = document.documentElement.dataset.lang !== "am";
  const months = latin ? ET_MONTHS_LATIN : ET_MONTHS;
  const day = Math.min(v.day, daysIn(v.year, v.month));
  const g = fromEthiopian(v.year, v.month, day);
  const iso = `${g.year}-${pad(g.month)}-${pad(g.day)}`;
  const outside = (target.min && iso < target.min) || (target.max && iso > target.max);
  const sel = "h-8 rounded-md border bg-background px-1 text-sm";
  return createPortal(
    <div ref={panel} className="fixed z-[100] w-[290px] space-y-2 rounded-lg border bg-popover p-2 text-sm shadow-lg" style={{ top: pos.top, left: pos.left }} data-et-picker onMouseDown={(e) => e.target instanceof HTMLSelectElement || e.preventDefault()}>
      <p className="text-xs text-muted-foreground">{latin ? "Ethiopian calendar" : "የኢትዮጵያ ዘመን አቆጣጠር"}</p>
      <div className="flex gap-1">
        <select aria-label="Ethiopian day" className={sel} value={day} onChange={(e) => setV({ ...v, day: Number(e.target.value) })}>
          {Array.from({ length: daysIn(v.year, v.month) }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        <select aria-label="Ethiopian month" className={`${sel} flex-1`} value={v.month} onChange={(e) => setV({ ...v, month: Number(e.target.value) })}>
          {months.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select aria-label="Ethiopian year" className={sel} value={v.year} onChange={(e) => setV({ ...v, year: Number(e.target.value) })}>
          {Array.from({ length: 21 }, (_, i) => v.year - 10 + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50"
          disabled={!!outside}
          onClick={() => {
            setNative(target, iso);
            setTarget(null);
          }}
          data-et-use
        >
          {latin ? "Use this date" : "ይህን ቀን ተጠቀም"}
        </button>
        <span className="text-xs text-muted-foreground" data-no-localize>= {iso}</span>
      </div>
      {outside && <p className="text-xs text-destructive">{latin ? "Outside the dates allowed here." : "ከሚፈቀደው ቀን ውጭ ነው።"}</p>}
    </div>,
    document.body,
  );
}
