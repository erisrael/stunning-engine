"use client";

import { useFilters } from "@/components/app/filter-bar";
import { cn } from "@/lib/utils";

// One chip per grade with its item count, so every grade (Grade 12 included) is one click away even
// when the sheet is capped at 500 rows. Clicking a chosen grade again clears it.
export function GradeJump({ grades }: { grades: { id: string; name: string; c: number }[] }) {
  const { filters, update } = useFilters();
  if (grades.length < 2) return null;
  const chosen = filters.g;
  const chip = "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Jump to grade">
      <button type="button" onClick={() => update({ g: [] }, { resetPage: false })} className={cn(chip, !chosen.length ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")} aria-pressed={!chosen.length}>
        All grades
      </button>
      {grades.map((g) => {
        const on = chosen.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => update({ g: on ? [] : [g.id] }, { resetPage: false })}
            className={cn(chip, on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            aria-pressed={on}
          >
            {g.name}
            <span className={cn("tabular", on ? "opacity-80" : "text-muted-foreground")}>{Number(g.c)}</span>
          </button>
        );
      })}
    </div>
  );
}
