"use client";

import * as React from "react";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type PickColumn = { key: string; label: string; group?: string };

// Choose the columns an export includes: grouped tick boxes, search, all, none and the defaults.
export function ColumnPicker({ columns, value, onChange, defaults }: { columns: PickColumn[]; value: string[]; onChange: (v: string[]) => void; defaults?: string[] }) {
  const [q, setQ] = React.useState("");
  const shown = columns.filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(shown.map((c) => c.group ?? ""))];
  const set = new Set(value);
  // Keeps the columns' own order whatever the order of clicks.
  const toggle = (k: string, on: boolean) => onChange(columns.map((c) => c.key).filter((x) => (x === k ? on : set.has(x))));
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex flex-wrap items-center gap-1">
        <div className="relative min-w-36 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a column" className="h-7 pl-7 text-xs" aria-label="Find a column" />
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange(columns.map((c) => c.key))}>
          All
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange([])}>
          None
        </Button>
        {defaults && (
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange(defaults)}>
            Defaults
          </Button>
        )}
        <span className="text-xs text-muted-foreground tabular">
          {value.length}/{columns.length}
        </span>
      </div>
      <div className="max-h-48 space-y-2 overflow-auto pr-1">
        {groups.map((g) => (
          <fieldset key={g}>
            {g && <legend className="mb-0.5 text-[11px] font-medium text-muted-foreground uppercase">{g}</legend>}
            <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
              {shown
                .filter((c) => (c.group ?? "") === g)
                .map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={set.has(c.key)} onChange={(e) => toggle(c.key, e.target.checked)} />
                    <span className="truncate">{c.label}</span>
                  </label>
                ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

// The first rows of an export as they will come out.
export function PreviewTable({ labels, rows, total, loading, error }: { labels: string[]; rows: string[][]; total: number | null; loading?: boolean; error?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 text-xs font-medium">
        Preview {loading && <Loader2Icon className="size-3 animate-spin" />}
        {total != null && !loading && <span className="font-normal text-muted-foreground">first {Math.min(rows.length, total)} of {total.toLocaleString()} rows</span>}
      </p>
      {error ? (
        <p className="rounded-md border border-destructive/40 p-2 text-xs text-destructive">{error}</p>
      ) : (
        <div className="max-h-56 overflow-auto rounded-md border">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {labels.map((l, i) => (
                  <th key={i} className="border-b px-2 py-1 text-left font-semibold whitespace-nowrap">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="odd:bg-muted/30">
                  {r.map((c, j) => (
                    <td key={j} className="max-w-48 truncate border-b px-2 py-0.5" title={c}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr>
                  <td className="px-2 py-3 text-center text-muted-foreground" colSpan={Math.max(1, labels.length)}>
                    {labels.length ? "No rows match." : "Choose at least one column."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
