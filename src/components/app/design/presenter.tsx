"use client";

// Presenting a design full screen (slides): arrow keys, space or a click move on; Esc ends; N shows the notes.

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { pageHtml, webFontsCss, type Design, type Extras } from "@/lib/design";

const MM = 96 / 25.4;

export function DesignPresenter({ design, start = 0, onClose, values = {}, extras = {} }: { design: Design; start?: number; onClose: () => void; values?: Record<string, string>; extras?: Extras }) {
  const [i, setI] = React.useState(start);
  const [notes, setNotes] = React.useState(false);
  const [size, setSize] = React.useState({ w: 1280, h: 720 });
  const ref = React.useRef<HTMLDivElement>(null);
  const n = design.pages.length;
  React.useEffect(() => {
    const el = ref.current;
    el?.requestFullscreen?.().catch(() => undefined);
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) setI((x) => Math.min(n - 1, x + 1));
      else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) setI((x) => Math.max(0, x - 1));
      else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(n - 1);
      else if (e.key.toLowerCase() === "n") setNotes((v) => !v);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    const fs = () => !document.fullscreenElement && onClose();
    document.addEventListener("fullscreenchange", fs);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", fs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [n, onClose]);
  const k = Math.min(size.w / (design.w * MM), (size.h - (notes ? 140 : 0)) / (design.h * MM));
  const p = design.pages[i]!;
  return (
    <div ref={ref} className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black text-white" onClick={(e) => e.target === e.currentTarget && setI((x) => Math.min(n - 1, x + 1))}>
      <style>{webFontsCss(design)}</style>
      <div style={{ width: design.w * MM * k, height: design.h * MM * k }} className="overflow-hidden" onClick={() => setI((x) => Math.min(n - 1, x + 1))}>
        <div style={{ transform: `scale(${k})`, transformOrigin: "0 0" }} dangerouslySetInnerHTML={{ __html: pageHtml(design, p, values, { ...extras, editing: false }) }} />
      </div>
      {notes && <div className="mt-2 h-32 w-full max-w-4xl overflow-auto rounded bg-white/10 p-3 text-sm whitespace-pre-wrap">{p.notes || "No notes for this slide."}</div>}
      <div className="absolute right-3 bottom-3 flex items-center gap-2 text-xs opacity-60 hover:opacity-100">
        <button type="button" aria-label="Previous" onClick={() => setI((x) => Math.max(0, x - 1))} className="rounded bg-white/10 p-1.5"><ChevronLeftIcon className="size-4" /></button>
        <span className="tabular-nums">{i + 1} / {n}</span>
        <button type="button" aria-label="Next" onClick={() => setI((x) => Math.min(n - 1, x + 1))} className="rounded bg-white/10 p-1.5"><ChevronRightIcon className="size-4" /></button>
        <button type="button" onClick={() => setNotes((v) => !v)} className="rounded bg-white/10 px-2 py-1">Notes (N)</button>
        <button type="button" aria-label="End the show" onClick={onClose} className="rounded bg-white/10 p-1.5"><XIcon className="size-4" /></button>
      </div>
    </div>
  );
}
