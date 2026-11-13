"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, HandIcon, Loader2Icon, Settings2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { decideTakesAction, saveTakeRulesAction, takePartsAction } from "@/app/actions/my-work";
import { STAGE_LABELS, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type TakeItem = { id: string; code: string; title: string; place: string; stage: Stage; stageLabel: string; grade: string | null; subject: string | null; unitNumber: number | null; partNumber: number | null; priority: string; dueAt: string | null };
export type TakeStage = { stage: Stage; lead: boolean; rule: { maxPerTake: number; maxOpen: number; members: boolean; leadApproval: boolean }; open: number };
type Rule = TakeStage["rule"];
type Rules = Rule & { stages: Partial<Record<Stage, Partial<Rule>>> };

const dueBucket = (iso: string | null) => {
  if (!iso) return "none";
  const d = (Date.parse(iso) - Date.now()) / 86400e3;
  return d < 0 ? "overdue" : d < 1 ? "today" : d < 7 ? "week" : "later";
};
const DUE: Record<string, string> = { overdue: "Overdue", today: "Due today", week: "Due this week", later: "Due later", none: "No due date" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "");

// Parts waiting with nobody on them, in the stages this person may take work in: filter, tick several (shift-click
// for a range, or all filtered) and take them at once, within Admin's rules. Members' takes may wait for the lead.
export function TakeWork({ items, stages, limit, pendingMine = 0 }: { items: TakeItem[]; stages: TakeStage[]; limit: number; pendingMine?: number; me?: string; canSetLimit?: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [f, setF] = React.useState<Record<string, string>>({});
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [shown, setShown] = React.useState(50);
  const last = React.useRef<number | null>(null);
  const ruleOf = (s: Stage) => stages.find((x) => x.stage === s);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const unitOf = (i: TakeItem) => (i.unitNumber != null ? `Unit ${i.unitNumber}` : "");
  const getters: Record<string, (i: TakeItem) => string> = { stage: (i) => i.stage, grade: (i) => i.grade ?? "", subject: (i) => i.subject ?? "", unit: unitOf, priority: (i) => i.priority, due: (i) => dueBucket(i.dueAt) };
  const rows = items.filter((i) => Object.entries(f).every(([k, v]) => !v || v === "all" || getters[k](i) === v) && (!q.trim() || `${i.title} ${i.code} ${i.place}`.toLowerCase().includes(q.trim().toLowerCase())));
  const ids = [...selected].filter((id) => items.some((i) => i.id === id));
  const room = (s: Stage) => {
    const r = ruleOf(s);
    if (!r) return 0;
    return Math.min(r.rule.maxPerTake, r.rule.maxOpen ? Math.max(0, r.rule.maxOpen - r.open) : Infinity);
  };
  // Select up to what each stage allows, in the order shown.
  const pick = (list: TakeItem[]) => {
    const n = new Map<Stage, number>();
    const out = new Set<string>();
    for (const i of list) {
      const c = n.get(i.stage) ?? 0;
      if (c >= room(i.stage)) continue;
      n.set(i.stage, c + 1);
      out.add(i.id);
    }
    return out;
  };
  const take = async (list: TakeItem[]) => {
    for (const s of new Set(list.map((i) => i.stage))) {
      const n = list.filter((i) => i.stage === s).length;
      if (n > room(s)) return toast.error(`${STAGE_LABELS[s]}: take at most ${room(s)} now (Admin's rules).`);
    }
    setBusy(true);
    const r = await takePartsAction(list.map((i) => ({ id: i.id, stage: i.stage })));
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    const res = r.data ?? [];
    const bad = res.filter((x) => !x.ok);
    const waiting = res.filter((x) => x.ok && x.pending).length;
    const taken = res.filter((x) => x.ok && !x.pending).length;
    const msg = [taken && `${taken} on your work now`, waiting && `${waiting} waiting for the lead`].filter(Boolean).join(", ");
    if (bad.length) toast.warning(`${msg || "None taken"}; ${bad.length} not`, { description: bad.map((b) => `${b.code}: ${b.error}`).join("\n") });
    else toast.success(msg || "Done");
    setSelected(new Set());
    router.refresh();
  };
  const click = (idx: number, id: string, on: boolean, shift: boolean) => {
    const n = new Set(selected);
    if (shift && last.current !== null) {
      const [a, b] = [Math.min(last.current, idx), Math.max(last.current, idx)];
      for (const i of rows.slice(a, b + 1)) on ? n.add(i.id) : n.delete(i.id);
    } else on ? n.add(id) : n.delete(id);
    last.current = idx;
    setSelected(n);
  };
  const approvalStages = stages.filter((s) => !s.lead && s.rule.leadApproval).map((s) => STAGE_LABELS[s.stage]);
  const select = (key: string, label: string, opts: [string, string][]) =>
    opts.length > 0 ? (
      <select aria-label={label} value={f[key] ?? "all"} onChange={(e) => setF({ ...f, [key]: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-xs">
        <option value="all">Every {label.toLowerCase()}</option>
        {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    ) : null;
  return (
    <Card data-take-work>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Waiting with nobody on it ({items.length})</CardTitle>
        <CardDescription>
          Tick parts to take them yourself (shift-click for a range), up to {limit} at once
          {stages.some((s) => s.rule.maxOpen) && `, with ${stages.filter((s) => s.rule.maxOpen).map((s) => `${STAGE_LABELS[s.stage]} ${s.open}/${s.rule.maxOpen} open`).join(", ")}`}.
          {approvalStages.length > 0 && ` In ${approvalStages.join(", ")} your lead approves each take.`}
          {pendingMine > 0 && ` ${pendingMine} of your takes are waiting for the lead.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filter waiting parts">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part, code…" className="h-8 w-48 text-xs" aria-label="Search waiting parts" />
          {select("stage", "Stage", [...new Map(items.map((i) => [i.stage, i.stageLabel])).entries()])}
          {select("grade", "Grade", uniq(items.map((i) => i.grade)).map((g) => [g, g]))}
          {select("subject", "Subject", uniq(items.filter((i) => !f.grade || f.grade === "all" || i.grade === f.grade).map((i) => i.subject)).map((s) => [s, s]))}
          {select("unit", "Unit", uniq(items.filter((i) => (!f.subject || f.subject === "all" || i.subject === f.subject)).map(unitOf)).map((u) => [u, u]))}
          {select("priority", "Priority", ["urgent", "high", "normal", "low"].filter((p) => items.some((i) => i.priority === p)).map((p) => [p, p[0].toUpperCase() + p.slice(1)]))}
          {select("due", "Due", Object.keys(DUE).filter((k) => items.some((i) => dueBucket(i.dueAt) === k)).map((k) => [k, DUE[k]]))}
          <span className="text-xs text-muted-foreground">{rows.length} shown</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(pick(rows))} data-select-filtered>
              Select all filtered ({Math.min(rows.length, pick(rows).size)})
            </Button>
            <Button size="sm" className="h-8 text-xs" disabled={busy || !ids.length} onClick={() => take(items.filter((i) => selected.has(i.id)))} data-take-selected>
              {busy ? <Loader2Icon className="animate-spin" /> : <HandIcon />} Take {ids.length || ""} selected
            </Button>
          </div>
        </div>
        <div className="overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2"><Checkbox aria-label="Select all shown" checked={rows.length > 0 && rows.slice(0, shown).every((i) => selected.has(i.id))} onCheckedChange={(v) => setSelected(v === true ? pick(rows.slice(0, shown)) : new Set())} /></th>
                <th className="px-2 py-2">Part</th>
                <th className="px-2 py-2">Grade</th>
                <th className="px-2 py-2">Subject</th>
                <th className="px-2 py-2">Unit</th>
                <th className="px-2 py-2">Stage</th>
                <th className="px-2 py-2">Due</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((i, idx) => (
                <tr key={i.id} className={cn("border-t", selected.has(i.id) && "bg-primary/5")}>
                  <td className="px-2 py-1.5" onClickCapture={(e) => { if (e.shiftKey) { e.preventDefault(); e.stopPropagation(); click(idx, i.id, !selected.has(i.id), true); } }}>
                    <Checkbox aria-label={`Select ${i.code}`} checked={selected.has(i.id)} onCheckedChange={(v) => click(idx, i.id, v === true, false)} />
                  </td>
                  <td className="px-2 py-1.5"><span className="font-medium">{i.title}</span> <span className="font-mono text-[10px] text-muted-foreground">{i.code}</span></td>
                  <td className="px-2 py-1.5 text-xs">{i.grade}</td>
                  <td className="px-2 py-1.5 text-xs">{i.subject}</td>
                  <td className="px-2 py-1.5 text-xs">{unitOf(i)}{i.partNumber != null ? ` · Part ${i.partNumber}` : ""}</td>
                  <td className="px-2 py-1.5 text-xs">{i.stageLabel}</td>
                  <td className={cn("px-2 py-1.5 text-xs whitespace-nowrap", dueBucket(i.dueAt) === "overdue" && "font-medium text-rose-600")}>{when(i.dueAt)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || room(i.stage) < 1} onClick={() => take([i])}>
                      <HandIcon /> {ruleOf(i.stage) && !ruleOf(i.stage)!.lead && ruleOf(i.stage)!.rule.leadApproval ? "Ask for it" : "Take it"}
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No waiting parts match.</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length > shown && <Button size="sm" variant="ghost" onClick={() => setShown(shown + 100)}>Show more ({rows.length - shown} left)</Button>}
      </CardContent>
    </Card>
  );
}

type Req = { id: string; code: string; title: string; stage: Stage; userName: string; createdAt: string };

// Leads: team members' takes waiting for approval.
export function TakeRequests({ rows }: { rows: Req[] }) {
  const router = useRouter();
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  if (!rows.length) return null;
  const decide = async (ids: string[], approve: boolean) => {
    const note = approve ? undefined : (window.prompt("Why not? (optional)") ?? undefined);
    setBusy(true);
    const r = await decideTakesAction(ids, approve, note);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    const bad = (r.data ?? []).filter((x) => !x.ok);
    if (bad.length) toast.warning(`${ids.length - bad.length} done, ${bad.length} not`, { description: bad.map((b) => b.error).join("\n") });
    else toast.success(approve ? `${ids.length} approved` : `${ids.length} declined`);
    setSel(new Set());
    router.refresh();
  };
  const ids = [...sel];
  return (
    <Card data-take-requests>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Takes to approve ({rows.length})</CardTitle>
        <CardDescription>Your team asked for these parts. Approving gives each part to the person who asked.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          <Button size="sm" className="h-8 text-xs" disabled={busy || !ids.length} onClick={() => decide(ids, true)}><CheckIcon /> Approve {ids.length || ""}</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy || !ids.length} onClick={() => decide(ids, false)}><XIcon /> Decline</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="w-8 px-2 py-1"><Checkbox aria-label="Select all requests" checked={sel.size === rows.length} onCheckedChange={(v) => setSel(v === true ? new Set(rows.map((r) => r.id)) : new Set())} /></th><th className="px-2">Part</th><th className="px-2">Who</th><th className="px-2">Stage</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1.5"><Checkbox aria-label={`Select request ${r.code}`} checked={sel.has(r.id)} onCheckedChange={(v) => { const n = new Set(sel); if (v === true) n.add(r.id); else n.delete(r.id); setSel(n); }} /></td>
                <td className="px-2 py-1.5"><span className="font-medium">{r.title}</span> <span className="font-mono text-[10px] text-muted-foreground">{r.code}</span></td>
                <td className="px-2 py-1.5 text-xs">{r.userName}</td>
                <td className="px-2 py-1.5 text-xs">{STAGE_LABELS[r.stage]}</td>
                <td className="px-2 py-1.5 text-right"><Button size="xs" variant="outline" disabled={busy} onClick={() => decide([r.id], true)}>Approve</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// Admin: the rules for taking work, with an override per team.
export function TakeRulesEditor({ rules, stages }: { rules: Rules; stages: Stage[] }) {
  const router = useRouter();
  const [r, setR] = React.useState<Rules>(rules);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    const res = await saveTakeRulesAction(r);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Rules for taking work saved");
    router.refresh();
  };
  const st = (s: Stage, p: Partial<Rule>) => setR({ ...r, stages: { ...r.stages, [s]: { ...(r.stages[s] ?? {}), ...p } } });
  const numIn = (v: number | undefined, on: (n: number | undefined) => void, label: string, ph?: number) => (
    <Input type="number" min={0} value={v ?? ""} placeholder={ph !== undefined ? String(ph) : undefined} onChange={(e) => on(e.target.value === "" ? undefined : Number(e.target.value))} className="h-7 w-16 text-xs" aria-label={label} />
  );
  return (
    <Card data-take-rules>
      <CardHeader className="pb-2">
        <button type="button" className="flex items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Settings2Icon className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm">Rules for taking work (Admin)</CardTitle>
          <span className="text-xs text-muted-foreground">up to {rules.maxPerTake} per take · {rules.maxOpen ? `${rules.maxOpen} open at once` : "no open limit"} · members {rules.members ? (rules.leadApproval ? "ask the lead" : "take directly") : "do not take"}</span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">Most per take {numIn(r.maxPerTake, (n) => setR({ ...r, maxPerTake: n ?? 20 }), "Most per take")}</label>
            <label className="flex items-center gap-2">Most open at once {numIn(r.maxOpen, (n) => setR({ ...r, maxOpen: n ?? 0 }), "Most open at once")} <span className="text-muted-foreground">0 = no limit</span></label>
            <label className="flex items-center gap-2"><Switch checked={r.members} onCheckedChange={(v) => setR({ ...r, members: v })} aria-label="Team members may take work" /> Team members may take work</label>
            <label className="flex items-center gap-2"><Switch checked={r.leadApproval} onCheckedChange={(v) => setR({ ...r, leadApproval: v })} aria-label="Lead approves members' takes" /> Lead approves members&apos; takes</label>
          </div>
          <table className="w-full">
            <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="py-1">Team</th><th>Per take</th><th>Open</th><th>Members take</th><th>Lead approves</th></tr></thead>
            <tbody>
              {stages.map((s) => {
                const o = r.stages[s] ?? {};
                return (
                  <tr key={s} className="border-t">
                    <td className="py-1.5">{STAGE_LABELS[s]}</td>
                    <td>{numIn(o.maxPerTake, (n) => st(s, { maxPerTake: n }), `${STAGE_LABELS[s]} most per take`, r.maxPerTake)}</td>
                    <td>{numIn(o.maxOpen, (n) => st(s, { maxOpen: n }), `${STAGE_LABELS[s]} most open`, r.maxOpen)}</td>
                    <td>
                      <select aria-label={`${STAGE_LABELS[s]} members take`} value={o.members === undefined ? "" : o.members ? "1" : "0"} onChange={(e) => st(s, { members: e.target.value === "" ? undefined : e.target.value === "1" })} className="h-7 rounded border bg-background px-1">
                        <option value="">Same ({r.members ? "yes" : "no"})</option><option value="1">Yes</option><option value="0">No</option>
                      </select>
                    </td>
                    <td>
                      <select aria-label={`${STAGE_LABELS[s]} lead approves`} value={o.leadApproval === undefined ? "" : o.leadApproval ? "1" : "0"} onChange={(e) => st(s, { leadApproval: e.target.value === "" ? undefined : e.target.value === "1" })} className="h-7 rounded border bg-background px-1">
                        <option value="">Same ({r.leadApproval ? "yes" : "no"})</option><option value="1">Yes</option><option value="0">No</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Button size="sm" onClick={save} disabled={busy} data-save-take-rules>{busy && <Loader2Icon className="animate-spin" />} Save rules</Button>
        </CardContent>
      )}
    </Card>
  );
}
