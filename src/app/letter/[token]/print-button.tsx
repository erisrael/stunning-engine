"use client";

export function PrintLetterButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm">
      Print or save as PDF
    </button>
  );
}
