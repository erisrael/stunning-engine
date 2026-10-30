"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill, type Tone } from "@/components/app/status-pill";
import { cn } from "@/lib/utils";

// Small building blocks shared by the Finance screens: a form dialog from a field list, an action runner, money.

export type Opt = { value: string; label: string };
export type FieldSpec =
  | { key: string; label: string; type: "text" | "number" | "date" | "textarea"; placeholder?: string; hint?: string; wide?: boolean }
  | { key: string; label: string; type: "select"; options: Opt[]; placeholder?: string; hint?: string; wide?: boolean }
  | { key: string; label: string; type: "check"; hint?: string; wide?: boolean }
  | { key: string; label: string; type: "file"; hint?: string; wide?: boolean }
  | { key: string; label: string; type: "lines"; hint?: string; wide?: boolean };

export type FileValue = { name: string; mime: string; base64: string } | null;
export type LineValue = { description: string; qty: number; price: number }[];

const toBase64 = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(f);
  });

export function useRun() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const go = async (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, done?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    if (done) toast.success(done);
    router.refresh();
    return r;
  };
  return { busy, go };
}

export function FormDialog({
  title,
  description,
  fields,
  initial = {},
  submit,
  onClose,
  okLabel = "Save",
}: {
  title: string;
  description?: string;
  fields: FieldSpec[];
  initial?: Record<string, unknown>;
  submit: (v: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: unknown }>;
  onClose: () => void;
  okLabel?: string;
}) {
  const [v, setV] = React.useState<Record<string, unknown>>(initial);
  const { busy, go } = useRun();
  const set = (k: string, x: unknown) => setV((o) => ({ ...o, [k]: x }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => {
            const id = `ff-${f.key}`;
            return (
              <div key={f.key} className={cn("space-y-1", (f.wide || f.type === "textarea" || f.type === "lines") && "sm:col-span-2")}>
                {f.type !== "check" && <Label htmlFor={id}>{f.label}</Label>}
                {f.type === "select" ? (
                  <Select value={String(v[f.key] ?? "") || "__none"} onValueChange={(x) => set(f.key, x === "__none" ? "" : x)}>
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">{f.placeholder ?? "None"}</SelectItem>
                      {f.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.type === "textarea" ? (
                  <Textarea id={id} rows={3} value={String(v[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
                ) : f.type === "check" ? (
                  <label className="flex items-center gap-2 pt-5 text-sm">
                    <Checkbox checked={!!v[f.key]} onCheckedChange={(x) => set(f.key, x === true)} /> {f.label}
                  </label>
                ) : f.type === "file" ? (
                  <Input
                    id={id}
                    type="file"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return set(f.key, null);
                      if (file.size > 8 * 1024 * 1024) return void toast.error("Files are limited to 8 MB.");
                      set(f.key, { name: file.name, mime: file.type, base64: await toBase64(file) });
                    }}
                  />
                ) : f.type === "lines" ? (
                  <Lines value={(v[f.key] as LineValue) ?? [{ description: "", qty: 1, price: 0 }]} onChange={(x) => set(f.key, x)} />
                ) : (
                  <Input id={id} type={f.type} value={String(v[f.key] ?? "")} onChange={(e) => set(f.key, f.type === "number" ? e.target.value : e.target.value)} placeholder={f.placeholder} step={f.type === "number" ? "0.01" : undefined} />
                )}
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={async () => (await go(() => submit(v), "Saved")) && onClose()}>
            {okLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Lines({ value, onChange }: { value: LineValue; onChange: (v: LineValue) => void }) {
  const total = value.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  return (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_4rem_6rem_auto] gap-2">
          <Input value={l.description} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="Item" aria-label={`Item ${i + 1}`} />
          <Input type="number" value={l.qty} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} aria-label="Quantity" />
          <Input type="number" value={l.price} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} aria-label="Unit price" />
          <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button size="xs" variant="outline" onClick={() => onChange([...value, { description: "", qty: 1, price: 0 }])}>
          <PlusIcon /> Add line
        </Button>
        <span className="text-sm font-medium tabular">Total {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

const TONE: Record<string, Tone> = {
  awaiting_approval: "paused",
  submitted: "paused",
  lead_approved: "handoff",
  approved: "handoff",
  checked: "handoff",
  ordered: "active",
  received: "active",
  draft: "neutral",
  sent: "active",
  paid: "done",
  billed: "done",
  locked: "done",
  void: "neutral",
  rejected: "blocked",
};
export const Status = ({ s, labels }: { s: string; labels: Record<string, string> }) => <StatusPill size="xs" tone={TONE[s] ?? "neutral"} label={labels[s] ?? s} />;

export const fmt = (n: number | string, cur?: string) => `${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ""}`;
