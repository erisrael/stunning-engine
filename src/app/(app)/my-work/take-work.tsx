"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { takePartsAction, setTakeLimitAction } from "@/app/actions/my-work";
import type { Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type TakeItem = { id: string; code: string; title: string; place: string; stage: Stage; stageLabel: string; grade: string | null; subject: string | null; unitNumber: number | null; partNumber: number | null; priority: string; dueAt: string | null };

// A lead takes parts waiting in their stages for themselves: filter, tick several (or all shown) and take them at
// once, up to the number Admin allows. They then show on the person's own board or table above.
export function TakeWork({ items, limit, canSetLimit }: { items: TakeItem[]; me?: string; limit: number; canSetLimit: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [stage, setStage] = React.useState("all");
  const [grade, setGrade] = React.useState("all");
  const [subject, setSubject] = React.useState("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [shown, setShown] = React.useState(50);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const stages = [...new Map(items.map((i) => [i.stage, i.stageLabel])).entries()];
  const rows = items.filter(
    (i) =>
      (stage === "all" || i.stage === stage) &&
      (grade === "all" || i.grade === grade) &&
      (subject === "all" || i.subject === subject) &&
      (!q.trim() || `${i.title} ${i.code} ${i.place}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const ids = [...selected].filter((id) => items.some((i) => i.id === id));
  const take = async (list: TakeItem[]) => {
    if (list.length > limit) return toast.error(`Take at most ${limit} at once.`);
    setBusy(true);
    const r = await takePartsAction(list.map((i) => ({ id: i.id, stage: i.stage })));
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    const bad = (r.data ?? []).filter((x) => !x.ok);
    if (bad.length) toast.warning(`${(r.data ?? []).length - bad.length} taken, ${bad.length} not`, { description: bad.map((b) => `${b.code}: ${b.error}`).join("\n") });
    else toast.success(`${list.length === 1 ? "It is" : `${list.length} parts are`} on your work now`);
    setSelected(new Set());
    router.refresh();
  };
  const sel = (id: string, on: boolean) => {
    const n = new Set(selected);
    if (on) n.add(id);
    else n.delete(id);
    setSelected(n);
  };
  return (
    <Card data-take-work>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Waiting with nobody on it ({items.length})</CardTitle>
        <CardDescription>
          In the stages you lead. Tick parts to take them yourself, up to {limit} at once; assigning them to your team is on Home.
          {canSetLimit && (
            <span className="ml-2 inline-flex items-center gap-1">
              Limit
              <Input
                type="number"
                min={1}
                max={200}
                defaultValue={limit}
                aria-label="Most parts one person takes at once"
                className="inline-block h-6 w-16 px-1 text-xs"
                onBlur={async (e) => {
                  const n = Number(e.target.value);
                  if (n === limit) return;
                  const r = await setTakeLimitAction(n);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(`Up to ${r.data} parts at once`);
                  router.refresh();
                }}
              />
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filter waiting parts">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part, code…" className="h-8 w-48 text-xs" aria-label="Search waiting parts" />
          {stages.length > 1 && (
            <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
              <option value="all">Every stage</option>
              {stages.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          <select aria-label="Grade" value={grade} onChange={(e) => setGrade(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="all">Every grade</option>
            {uniq(items.map((i) => i.grade)).map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="all">Every subject</option>
            {uniq(items.filter((i) => grade === "all" || i.grade === grade).map((i) => i.subject)).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">{rows.length} shown</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set(rows.slice(0, limit).map((i) => i.id)))}>
              Select {Math.min(rows.length, limit)} shown
            </Button>
            <Button size="sm" className="h-8 text-xs" disabled={busy || !ids.length} onClick={() => take(items.filter((i) => selected.has(i.id)))}>
              {busy ? <Loader2Icon className="animate-spin" /> : <HandIcon />} Take {ids.length || ""} selected
            </Button>
          </div>
        </div>
        <div className="overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2"><Checkbox aria-label="Select all shown" checked={rows.length > 0 && rows.slice(0, shown).every((i) => selected.has(i.id))} onCheckedChange={(v) => setSelected(v === true ? new Set(rows.slice(0, Math.min(shown, limit)).map((i) => i.id)) : new Set())} /></th>
                <th className="px-2 py-2">Part</th>
                <th className="px-2 py-2">Grade</th>
                <th className="px-2 py-2">Subject</th>
                <th className="px-2 py-2">Unit</th>
                <th className="px-2 py-2">Stage</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((i) => (
                <tr key={i.id} className={cn("border-t", selected.has(i.id) && "bg-primary/5")}>
                  <td className="px-2 py-1.5"><Checkbox aria-label={`Select ${i.code}`} checked={selected.has(i.id)} onCheckedChange={(v) => sel(i.id, v === true)} /></td>
                  <td className="px-2 py-1.5"><span className="font-medium">{i.title}</span> <span className="font-mono text-[10px] text-muted-foreground">{i.code}</span></td>
                  <td className="px-2 py-1.5 text-xs">{i.grade}</td>
                  <td className="px-2 py-1.5 text-xs">{i.subject}</td>
                  <td className="px-2 py-1.5 text-xs">{i.unitNumber != null ? `Unit ${i.unitNumber}` : ""}{i.partNumber != null ? ` · Part ${i.partNumber}` : ""}</td>
                  <td className="px-2 py-1.5 text-xs">{i.stageLabel}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => take([i])}><HandIcon /> Take it</Button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No waiting parts match.</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length > shown && <Button size="sm" variant="ghost" onClick={() => setShown(shown + 100)}>Show more ({rows.length - shown} left)</Button>}
      </CardContent>
    </Card>
  );
}
