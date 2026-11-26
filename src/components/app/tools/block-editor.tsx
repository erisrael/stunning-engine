"use client";

import * as React from "react";
import { AlignCenterIcon, AlignJustifyIcon, AlignLeftIcon, AlignRightIcon, ArrowDownIcon, ArrowUpIcon, Heading2Icon, ListIcon, MinusIcon, PilcrowIcon, PlusIcon, QuoteIcon, ScissorsIcon, TableIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { newBlock, type Block } from "./doc-model";
import { cn } from "@/lib/utils";

const ADD: { type: Block["type"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "heading", label: "Heading", icon: Heading2Icon },
  { type: "paragraph", label: "Paragraph", icon: PilcrowIcon },
  { type: "list", label: "List", icon: ListIcon },
  { type: "table", label: "Table", icon: TableIcon },
  { type: "quote", label: "Quote", icon: QuoteIcon },
  { type: "divider", label: "Divider", icon: MinusIcon },
  { type: "pagebreak", label: "Page break", icon: ScissorsIcon },
];

export function AddBlockBar({ onAdd }: { onAdd: (b: Block) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ADD.map((a) => (
        <Button key={a.type} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAdd(newBlock(a.type))}>
          <a.icon className="size-3.5" /> {a.label}
        </Button>
      ))}
    </div>
  );
}

export function BlockEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const set = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <div key={b.id} className="group relative rounded-md border bg-background p-2 pr-10">
          <div className="absolute top-1 right-1 flex flex-col gap-0.5 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" aria-label="Move up" className="rounded p-0.5 hover:bg-muted" onClick={() => move(i, -1)}>
              <ArrowUpIcon className="size-3.5" />
            </button>
            <button type="button" aria-label="Move down" className="rounded p-0.5 hover:bg-muted" onClick={() => move(i, 1)}>
              <ArrowDownIcon className="size-3.5" />
            </button>
            <button type="button" aria-label="Remove block" className="rounded p-0.5 hover:bg-muted" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
          <BlockFields b={b} onChange={(nb) => set(i, nb)} />
          <button type="button" aria-label="Add a paragraph below" className="absolute -bottom-2.5 left-1/2 hidden -translate-x-1/2 rounded-full border bg-background p-0.5 group-hover:block" onClick={() => onChange([...blocks.slice(0, i + 1), newBlock("paragraph"), ...blocks.slice(i + 1)])}>
            <PlusIcon className="size-3" />
          </button>
        </div>
      ))}
      <AddBlockBar onAdd={(b) => onChange([...blocks, b])} />
      <p className="text-xs text-muted-foreground">Write **bold** and *italic*; a new line inside a paragraph is a line break.</p>
    </div>
  );
}

function BlockFields({ b, onChange }: { b: Block; onChange: (b: Block) => void }) {
  switch (b.type) {
    case "heading":
      return (
        <div className="flex gap-2">
          <select value={b.level} onChange={(e) => onChange({ ...b, level: Number(e.target.value) as 1 | 2 | 3 })} className="rounded-md border bg-background px-1 text-xs" aria-label="Heading level">
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <Input value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} className={cn("font-semibold", b.level === 1 ? "text-lg" : "text-base")} aria-label="Heading" />
        </div>
      );
    case "paragraph":
      return (
        <div className="space-y-1">
          <Textarea value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} rows={Math.max(2, b.text.split("\n").length)} aria-label="Paragraph" style={{ textAlign: b.align ?? "left" }} />
          <div className="flex gap-0.5">
            {(
              [
                ["left", AlignLeftIcon],
                ["center", AlignCenterIcon],
                ["right", AlignRightIcon],
                ["justify", AlignJustifyIcon],
              ] as const
            ).map(([a, Icon]) => (
              <button key={a} type="button" aria-label={`Align ${a}`} aria-pressed={(b.align ?? "left") === a} onClick={() => onChange({ ...b, align: a })} className={cn("rounded p-1 hover:bg-muted", (b.align ?? "left") === a && "bg-muted")}>
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
      );
    case "list":
      return (
        <div className="space-y-1">
          <Textarea value={b.items.join("\n")} onChange={(e) => onChange({ ...b, items: e.target.value.split("\n") })} rows={Math.max(2, b.items.length)} aria-label="List items, one per line" placeholder="One item per line" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={b.ordered} onChange={(e) => onChange({ ...b, ordered: e.target.checked })} /> Numbered
          </label>
        </div>
      );
    case "table": {
      const width = Math.max(1, ...b.rows.map((r) => r.length));
      return (
        <div className="space-y-1 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {Array.from({ length: width }, (_, j) => (
                    <td key={j} className="border p-0">
                      <input
                        value={r[j] ?? ""}
                        onChange={(e) => onChange({ ...b, rows: b.rows.map((row, x) => (x === i ? Array.from({ length: width }, (_, y) => (y === j ? e.target.value : (row[y] ?? ""))) : row)) })}
                        className={cn("w-full min-w-20 bg-transparent px-1.5 py-1 outline-none focus:bg-muted/50", i === 0 && b.header && "font-semibold")}
                        aria-label={`Row ${i + 1}, column ${j + 1}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => onChange({ ...b, rows: [...b.rows, Array(width).fill("")] })}>
              + Row
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => onChange({ ...b, rows: b.rows.map((r) => [...r, ""]) })}>
              + Column
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" disabled={b.rows.length < 2} onClick={() => onChange({ ...b, rows: b.rows.slice(0, -1) })}>
              − Row
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" disabled={width < 2} onClick={() => onChange({ ...b, rows: b.rows.map((r) => r.slice(0, width - 1)) })}>
              − Column
            </Button>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={b.header} onChange={(e) => onChange({ ...b, header: e.target.checked })} /> Header row
            </label>
          </div>
        </div>
      );
    }
    case "quote":
      return <Textarea value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} rows={2} className="border-l-4 italic" aria-label="Quote" />;
    case "divider":
      return <hr className="my-3" />;
    case "pagebreak":
      return <p className="py-1 text-center text-xs text-muted-foreground">— page break —</p>;
  }
}
