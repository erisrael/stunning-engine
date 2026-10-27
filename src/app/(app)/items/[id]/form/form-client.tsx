"use client";

import * as React from "react";
import { LockIcon, MessageSquareIcon, MessageSquarePlusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActions, type ItemRef } from "@/components/app/action-center";
import { CommentThread } from "@/components/app/comment-thread";
import { cn } from "@/lib/utils";
import type { Stage } from "@/lib/domain";

type CommentCtx = { itemId: string; viewerId: string; isManager: boolean; tz: string; counts: Record<string, number> };
const CommentContext = React.createContext<CommentCtx | null>(null);

export function CommentProvider({ value, children }: { value: CommentCtx; children: React.ReactNode }) {
  const [open, setOpen] = React.useState<{ field: string; label: string; stage: string | null } | null>(null);
  return (
    <CommentContext.Provider value={value}>
      <OpenComments.Provider value={setOpen}>{children}</OpenComments.Provider>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Comments: {open?.label}</SheetTitle>
            <SheetDescription>Anyone who can see this item can comment here, even when the field is not theirs to edit.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {open && (
              <CommentThread
                itemId={value.itemId}
                field={open.field}
                stage={open.stage}
                viewerId={value.viewerId}
                isManager={value.isManager}
                tz={value.tz}
                compact
                placeholder={`Comment on ${open.label.toLowerCase()}. Use @name to mention someone.`}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </CommentContext.Provider>
  );
}
const OpenComments = React.createContext<(v: { field: string; label: string; stage: string | null }) => void>(() => {});

export function CommentButton({ field, label, stage = null }: { field: string; label: string; stage?: string | null }) {
  const ctx = React.useContext(CommentContext);
  const open = React.useContext(OpenComments);
  const n = ctx?.counts[field] ?? 0;
  return (
    <button
      type="button"
      onClick={() => open({ field, label, stage })}
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded p-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
        n ? "text-[var(--st-paused-fg)]" : "opacity-0 group-hover/row:opacity-100 focus:opacity-100",
      )}
      aria-label={n ? `${n} comments on ${label}` : `Comment on ${label}`}
      title={n ? `${n} open comment${n > 1 ? "s" : ""}` : "Comment"}
    >
      {n ? <MessageSquareIcon className="size-3.5" /> : <MessageSquarePlusIcon className="size-3.5" />}
      {n > 0 && <span className="tabular">{n}</span>}
    </button>
  );
}

// One Notion-style property line: label on the left, value on the right, comments on hover.
export function PropertyRow({ label, field, stage, children, hint }: { label: string; field?: string; stage?: string | null; children: React.ReactNode; hint?: string }) {
  return (
    <div className="group/row grid min-h-9 grid-cols-[1fr_auto] items-start gap-x-2 rounded-md px-1 hover:bg-muted/40 sm:grid-cols-[minmax(7rem,11rem)_1fr_auto]">
      <span className="pt-2 text-xs font-medium text-muted-foreground sm:text-sm sm:font-normal" title={hint}>
        {label}
      </span>
      {/* On phones the value sits under its label, full width. */}
      <div className="order-last col-span-2 min-w-0 pb-1 text-sm sm:order-none sm:col-span-1 sm:py-1">{children}</div>
      <span className="pt-1">{field ? <CommentButton field={field} label={label} stage={stage} /> : null}</span>
    </div>
  );
}

function useSave(item: ItemRef) {
  const { run } = useActions();
  return (input: Parameters<ReturnType<typeof useActions>["run"]>[1], msg = "Saved") => run(item, input, { successMessage: msg });
}

export function InlineText({
  item,
  field,
  value,
  editable,
  placeholder = "Empty",
  multiline,
  type = "text",
}: {
  item: ItemRef;
  field: string;
  value: string | number | null;
  editable: boolean;
  placeholder?: string;
  multiline?: boolean;
  type?: "text" | "number" | "date";
}) {
  const save = useSave(item);
  const initial = value === null || value === undefined ? "" : String(value);
  const [v, setV] = React.useState(initial);
  React.useEffect(() => setV(initial), [initial]);
  if (!editable)
    return <span className={cn("block py-1 whitespace-pre-wrap", !initial && "text-muted-foreground/60")}>{initial || placeholder}</span>;
  const commit = async () => {
    if (v === initial) return;
    const ok = await save({ action: "fields", fields: { [field]: type === "number" ? (v === "" ? null : Number(v)) : v || null } });
    if (!ok) setV(initial);
  };
  const cls = "h-auto min-h-8 border-transparent bg-transparent px-1.5 py-1 shadow-none hover:border-input focus-visible:border-input";
  return multiline ? (
    <Textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder={placeholder} rows={2} className={cn(cls, "resize-y")} />
  ) : (
    <Input value={v} type={type} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} placeholder={placeholder} className={cls} />
  );
}

export function InlineSelect({ item, field, value, options, editable }: { item: ItemRef; field: string; value: string | null; options: { value: string; label: string }[]; editable: boolean }) {
  const save = useSave(item);
  const label = options.find((o) => o.value === value)?.label ?? value ?? "Empty";
  if (!editable) return <span className="block py-1">{label}</span>;
  return (
    <Select value={value ?? undefined} onValueChange={(v) => save({ action: "fields", fields: { [field]: v } })}>
      <SelectTrigger size="sm" className="h-8 w-fit min-w-36 border-transparent bg-transparent px-1.5 shadow-none hover:border-input">
        <SelectValue placeholder="Empty" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StageNotes({ item, value, editable }: { item: ItemRef; value: string | null; editable: boolean }) {
  const save = useSave(item);
  const [v, setV] = React.useState(value ?? "");
  React.useEffect(() => setV(value ?? ""), [value]);
  if (!editable) return <span className={cn("block py-1 whitespace-pre-wrap", !value && "text-muted-foreground/60")}>{value || "No notes"}</span>;
  return (
    <Textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={async () => {
        if (v === (value ?? "")) return;
        const ok = await save({ action: "stageNotes", notes: v || null }, "Notes saved");
        if (!ok) setV(value ?? "");
      }}
      placeholder="Add notes for this stage"
      rows={2}
      className="min-h-16 resize-y border-transparent bg-transparent px-1.5 shadow-none hover:border-input focus-visible:border-input"
    />
  );
}

export function LinkFileButton({ item, kind, label }: { item: ItemRef; kind: string; label: string }) {
  const { open } = useActions();
  return (
    <Button size="xs" variant="outline" onClick={() => open("asset", item, { kind })}>
      <PlusIcon /> {label}
    </Button>
  );
}

export function LockNote({ reason }: { reason: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title={reason}>
      <LockIcon className="size-3" /> {reason}
    </span>
  );
}

// Recorded, edited, uploaded or publication date. Editable by that stage's people.
export function StageDate({ item, stage, value, editable, tz }: { item: ItemRef; stage: Stage; value: string | null; editable: boolean; tz: string }) {
  const save = useSave(item);
  const local = value ? new Date(value).toLocaleDateString("en-CA", { timeZone: tz }) : "";
  if (!editable) return <span className={cn("block py-1", !value && "text-muted-foreground/60")}>{value ? new Date(value).toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }) : "Not done yet"}</span>;
  return (
    <Input
      type="date"
      defaultValue={local}
      className="h-8 w-44 border-transparent bg-transparent px-1.5 shadow-none hover:border-input"
      onChange={async (e) => {
        const v = e.target.value;
        await save({ action: "stageDate", stage, date: v ? new Date(`${v}T09:00:00+03:00`).toISOString() : null }, "Date saved");
      }}
    />
  );
}
