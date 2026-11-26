"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveCategoryAction, saveRuleAction, saveWorkflowAction } from "@/app/actions/correspondence";
import type { Cond, RuleEffect, Stage, Target, WorkflowDef } from "@/server/corr/workflow";
import type { Category } from "@/server/corr/setup";
import { cn } from "@/lib/utils";

type WF = { id: string; name: string; description: string | null; version: number; definition: WorkflowDef; active: boolean };
type Rule = { id: string; name: string; priority: number; condition: Cond | null; effect: RuleEffect; active: boolean; effectiveFrom: string | null; effectiveTo: string | null; version: number };
type Opts = { positions: { id: string; title: string }[]; roles: { key: string; label: string }[]; people: { id: string; name: string }[]; actions: { key: string; label: string }[] };
const sel = "h-8 rounded-md border bg-background px-2 text-xs";
const key = () => Math.random().toString(36).slice(2, 10);
const TYPE_HINT: Record<string, string> = { sequential: "each in turn", parallel: "all, any order", alternative: "any one of them", quorum: "a number of them" };
const FIELDS: [string, string][] = [["category", "Category code"], ["department", "Department"], ["classification", "Classification"], ["recipient_type", "Recipient type"], ["financial_value", "Amount (ETB)"], ["risk", "Risk"], ["direction", "Direction"], ["priority", "Priority"], ["entity", "Entity code"]];
const OPS: [string, string][] = [["eq", "is"], ["neq", "is not"], ["in", "is one of"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["contains", "contains"]];

function TargetPicker({ value, onChange, o }: { value: Target[]; onChange: (t: Target[]) => void; o: Opts }) {
  const [kind, setKind] = React.useState<Target["kind"]>("position");
  const [id, setId] = React.useState("");
  const list = kind === "position" ? o.positions.map((p) => ({ v: p.id, l: p.title })) : kind === "role" ? o.roles.map((r) => ({ v: r.key, l: r.label })) : kind === "user" ? o.people.map((p) => ({ v: p.id, l: p.name })) : [];
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {value.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">
            {t.label ?? t.kind}
            <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <select className={sel} value={kind} onChange={(e) => (setKind(e.target.value as Target["kind"]), setId(""))} aria-label="Who kind">
          <option value="position">Position</option>
          <option value="user">Person</option>
          <option value="role">Role</option>
          <option value="supervisor">Writer&apos;s supervisor</option>
          <option value="authority">Anyone with the authority</option>
        </select>
        {list.length > 0 && (
          <select className={cn(sel, "max-w-48")} value={id} onChange={(e) => setId(e.target.value)} aria-label="Who">
            <option value="">Choose</option>
            {list.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
          </select>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={list.length > 0 && !id}
          onClick={() => {
            const label = kind === "supervisor" ? "Writer's supervisor" : kind === "authority" ? "Anyone with the authority" : list.find((x) => x.v === id)?.l;
            onChange([...value, { kind, id: id || undefined, label }]);
            setId("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function CondEditor({ value, onChange, depth = 0 }: { value: Cond; onChange: (c: Cond) => void; depth?: number }) {
  if ("all" in value || "any" in value) {
    const mode = "all" in value ? "all" : "any";
    const items = ("all" in value ? value.all : value.any) as Cond[];
    const set = (list: Cond[]) => onChange(mode === "all" ? { all: list } : { any: list });
    return (
      <div className={cn("space-y-1 rounded-md border p-2", depth > 0 && "bg-muted/30")}>
        <select className={sel} value={mode} onChange={(e) => onChange(e.target.value === "all" ? { all: items } : { any: items })} aria-label="All or any">
          <option value="all">All of these (AND)</option>
          <option value="any">Any of these (OR)</option>
        </select>
        {items.map((c, i) => (
          <div key={i} className="flex items-start gap-1">
            <div className="flex-1">
              <CondEditor value={c} onChange={(n) => set(items.map((x, j) => (j === i ? n : x)))} depth={depth + 1} />
            </div>
            <button type="button" aria-label="Remove condition" className="mt-1.5 rounded p-0.5 hover:bg-muted" onClick={() => set(items.filter((_, j) => j !== i))}>
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set([...items, { field: "financial_value", op: "gt", value: 0 }])}>+ Condition</Button>
          {depth < 3 && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set([...items, { any: [] }])}>+ Group</Button>}
        </div>
      </div>
    );
  }
  if ("not" in value) return <CondEditor value={value.not} onChange={(n) => onChange({ not: n })} depth={depth} />;
  const c = value;
  return (
    <div className="flex flex-wrap gap-1">
      <select className={sel} value={c.field} onChange={(e) => onChange({ ...c, field: e.target.value as never })} aria-label="Field">{FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select className={sel} value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as never })} aria-label="Operator">{OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <Input className="h-8 w-40 text-xs" value={Array.isArray(c.value) ? c.value.join(",") : String(c.value)} onChange={(e) => onChange({ ...c, value: ["gt", "gte", "lt", "lte"].includes(c.op) ? Number(e.target.value) : c.op === "in" ? e.target.value.split(",") : e.target.value })} aria-label="Value" />
    </div>
  );
}

function StagesEditor({ stages, onChange, o }: { stages: Stage[]; onChange: (s: Stage[]) => void; o: Opts }) {
  const set = (i: number, p: Partial<Stage>) => onChange(stages.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.key} className="space-y-2 rounded-md border p-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
            <Input className="h-8 w-48 text-xs" value={s.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Stage name" />
            <select className={sel} value={s.action} onChange={(e) => set(i, { action: e.target.value as never })} aria-label="Action">{o.actions.filter((a) => !["cancel", "revoke"].includes(a.key)).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select>
            <select className={sel} value={s.type} onChange={(e) => set(i, { type: e.target.value as never })} aria-label="How">
              {Object.entries(TYPE_HINT).map(([k, l]) => <option key={k} value={k}>{k} ({l})</option>)}
            </select>
            {s.type === "quorum" && <Input type="number" min={1} className="h-8 w-16 text-xs" value={s.quorum ?? 1} onChange={(e) => set(i, { quorum: Number(e.target.value) })} aria-label="How many" />}
            <div className="ml-auto flex">
              <button type="button" aria-label="Up" className="rounded p-1 hover:bg-muted" onClick={() => i > 0 && onChange(stages.map((x, j) => (j === i - 1 ? stages[i]! : j === i ? stages[i - 1]! : x)))}><ArrowUpIcon className="size-3.5" /></button>
              <button type="button" aria-label="Down" className="rounded p-1 hover:bg-muted" onClick={() => i < stages.length - 1 && onChange(stages.map((x, j) => (j === i + 1 ? stages[i]! : j === i ? stages[i + 1]! : x)))}><ArrowDownIcon className="size-3.5" /></button>
              <button type="button" aria-label="Remove stage" className="rounded p-1 hover:bg-muted" onClick={() => onChange(stages.filter((_, j) => j !== i))}><Trash2Icon className="size-3.5" /></button>
            </div>
          </div>
          <TargetPicker value={s.targets} onChange={(targets) => set(i, { targets })} o={o} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">Block label <Input className="h-7 w-36 text-xs" value={s.label} onChange={(e) => set(i, { label: e.target.value })} /></label>
            <label className="flex items-center gap-1">Deadline (hours) <Input type="number" min={0} className="h-7 w-20 text-xs" value={s.deadlineHours ?? ""} onChange={(e) => set(i, { deadlineHours: e.target.value ? Number(e.target.value) : null })} /></label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={s.signatureBlock !== false} onChange={(e) => set(i, { signatureBlock: e.target.checked })} /> Signature block</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!s.optional} onChange={(e) => set(i, { optional: e.target.checked })} /> Optional</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!s.condition} onChange={(e) => set(i, { condition: e.target.checked ? { all: [{ field: "financial_value", op: "gt", value: 0 }] } : null })} /> Only when…</label>
          </div>
          {s.condition && <CondEditor value={s.condition} onChange={(condition) => set(i, { condition })} />}
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...stages, { key: key(), name: `Stage ${stages.length + 1}`, type: "sequential", action: "approve_department", label: "Approved by", targets: [], signatureBlock: true }])}>
        <PlusIcon /> Stage
      </Button>
    </div>
  );
}

export function WorkflowsClient({ workflows, rules, positions, roles, people, categories, templates, actions, canEditCategories }: Opts & { workflows: WF[]; rules: Rule[]; categories: { id: string; code: string; name: string; workflowId: string | null; templateId: string | null; raw: Category }[]; templates: { id: string; name: string }[]; canEditCategories: boolean }) {
  const router = useRouter();
  const o: Opts = { positions, roles, people, actions };
  const [wf, setWf] = React.useState<Partial<WF> | null>(null);
  const [rule, setRule] = React.useState<Partial<Rule> | null>(null);
  const save = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, done: () => void) => {
    const r = await fn();
    if (!r.ok) return toast.error(r.error);
    toast.success(ok);
    done();
    router.refresh();
  };
  return (
    <Tabs defaultValue="workflows">
      <TabsList>
        <TabsTrigger value="workflows">Workflows ({workflows.length})</TabsTrigger>
        <TabsTrigger value="rules">Routing rules ({rules.length})</TabsTrigger>
        <TabsTrigger value="categories">By category</TabsTrigger>
      </TabsList>

      <TabsContent value="workflows" className="mt-3 space-y-3">
        <div className="flex justify-end">
          <Button onClick={() => setWf({ name: "", definition: { stages: [], selfApproval: "forbid", preparedBlock: true }, active: true })}>
            <PlusIcon /> New workflow
          </Button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {workflows.map((w) => (
            <Card key={w.id} className={cn("cursor-pointer hover:border-primary", !w.active && "opacity-60")} onClick={() => setWf(w)}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">{w.name} <span className="text-xs font-normal text-muted-foreground">v{w.version}</span></CardTitle>
                {w.description && <CardDescription className="text-xs">{w.description}</CardDescription>}
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {w.definition.stages.map((s, i) => `${i + 1}. ${s.name}: ${s.targets.map((t) => t.label ?? t.kind).join(s.type === "alternative" ? " or " : ", ")}${s.type === "quorum" ? ` (${s.quorum})` : ""}`).join(" → ")}
              </CardContent>
            </Card>
          ))}
          {!workflows.length && <p className="text-sm text-muted-foreground">No workflows yet. Without one, a letter is issued directly by someone who may issue letters.</p>}
        </div>
      </TabsContent>

      <TabsContent value="rules" className="mt-3 space-y-3">
        <div className="flex justify-end">
          <Button onClick={() => setRule({ name: "", priority: 100, condition: { all: [{ field: "financial_value", op: "gt", value: 100000 }] }, effect: { addStages: [], place: "before_sign" }, active: true })}>
            <PlusIcon /> New rule
          </Button>
        </div>
        {rules.map((r) => (
          <Card key={r.id} className={cn("cursor-pointer hover:border-primary", !r.active && "opacity-60")} onClick={() => setRule(r)}>
            <CardContent className="p-3 text-sm">
              <b>{r.name}</b> <span className="text-xs text-muted-foreground">priority {r.priority} · v{r.version}{r.effectiveFrom ? ` · from ${r.effectiveFrom.slice(0, 10)}` : ""}{r.effectiveTo ? ` · to ${r.effectiveTo.slice(0, 10)}` : ""}</span>
              <p className="text-xs text-muted-foreground">
                {r.effect.requireWorkflow ? `Use workflow “${workflows.find((w) => w.id === r.effect.requireWorkflow)?.name ?? "?"}”` : ""}
                {r.effect.addStages?.length ? ` Add: ${r.effect.addStages.map((s) => s.name).join(", ")} (${r.effect.place})` : ""}
              </p>
            </CardContent>
          </Card>
        ))}
        {!rules.length && <p className="text-sm text-muted-foreground">No rules. Rules add stages or choose a workflow when their condition holds, for example “amount above 100,000 needs the CFO”.</p>}
      </TabsContent>

      <TabsContent value="categories" className="mt-3">
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground"><tr><th className="px-3 py-2">Category</th><th className="px-3 py-2">Workflow</th><th className="px-3 py-2">Template</th><th className="px-3 py-2">Keep for (years)</th></tr></thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-1.5">{c.name} <span className="font-mono text-muted-foreground">{c.code}</span></td>
                    <td className="px-3 py-1.5">
                      <select className={sel} disabled={!canEditCategories} value={c.workflowId ?? ""} onChange={(e) => save(() => saveCategoryAction({ ...c.raw, config: { ...c.raw.config, workflowId: e.target.value || null } }), "Saved", () => {})} aria-label={`Workflow for ${c.name}`}>
                        <option value="">None (issue directly)</option>
                        {workflows.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select className={sel} disabled={!canEditCategories} value={c.templateId ?? ""} onChange={(e) => save(() => saveCategoryAction({ ...c.raw, config: { ...c.raw.config, templateId: e.target.value || null } }), "Saved", () => {})} aria-label={`Template for ${c.name}`}>
                        <option value="">Company letterhead</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <Input type="number" min={0} className="h-8 w-20 text-xs" disabled={!canEditCategories} defaultValue={c.raw.config.retentionYears ?? ""} onBlur={(e) => String(c.raw.config.retentionYears ?? "") !== e.target.value && save(() => saveCategoryAction({ ...c.raw, config: { ...c.raw.config, retentionYears: e.target.value ? Number(e.target.value) : null } }), "Saved", () => {})} aria-label={`Retention for ${c.name}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">After its retention period an issued letter is archived (never deleted); letters on legal hold are kept as they are.</p>
      </TabsContent>

      {wf && (
        <Dialog open onOpenChange={(x) => !x && setWf(null)}>
          <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{wf.id ? `${wf.name} (saving makes version ${(wf.version ?? 0) + 1})` : "New workflow"}</DialogTitle>
              <DialogDescription>Letters already in a workflow keep the version they started with.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={wf.name ?? ""} onChange={(e) => setWf({ ...wf, name: e.target.value })} placeholder="Name" aria-label="Name" />
                <Input value={wf.description ?? ""} onChange={(e) => setWf({ ...wf, description: e.target.value })} placeholder="Description" aria-label="Description" />
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={wf.definition?.selfApproval !== "allow"} onChange={(e) => setWf({ ...wf, definition: { ...wf.definition!, selfApproval: e.target.checked ? "forbid" : "allow" } })} /> Nobody approves their own letter, nor acts twice</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={wf.definition?.preparedBlock !== false} onChange={(e) => setWf({ ...wf, definition: { ...wf.definition!, preparedBlock: e.target.checked } })} /> “Prepared by” block</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={wf.active !== false} onChange={(e) => setWf({ ...wf, active: e.target.checked })} /> In use</label>
              </div>
              <StagesEditor stages={wf.definition?.stages ?? []} onChange={(stages) => setWf({ ...wf, definition: { ...wf.definition!, stages } })} o={o} />
            </div>
            <DialogFooter>
              <Button onClick={() => save(() => saveWorkflowAction({ id: wf.id, name: wf.name ?? "", description: wf.description ?? "", definition: wf.definition, active: wf.active }), "Workflow saved", () => setWf(null))}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {rule && (
        <Dialog open onOpenChange={(x) => !x && setRule(null)}>
          <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{rule.id ? rule.name : "New rule"}</DialogTitle>
              <DialogDescription>Rules with a lower priority number are applied first; the first one that chooses a workflow wins.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
                <Input value={rule.name ?? ""} onChange={(e) => setRule({ ...rule, name: e.target.value })} placeholder="Name" aria-label="Name" />
                <Input type="number" value={rule.priority ?? 100} onChange={(e) => setRule({ ...rule, priority: Number(e.target.value) })} aria-label="Priority" />
              </div>
              <p className="text-xs font-medium">When</p>
              <CondEditor value={rule.condition ?? { all: [] }} onChange={(condition) => setRule({ ...rule, condition })} />
              <p className="text-xs font-medium">Then</p>
              <select className={cn(sel, "w-full")} value={rule.effect?.requireWorkflow ?? ""} onChange={(e) => setRule({ ...rule, effect: { ...rule.effect, requireWorkflow: e.target.value || undefined } })} aria-label="Use workflow">
                <option value="">Keep the category&apos;s workflow</option>
                {workflows.map((w) => <option key={w.id} value={w.id}>Use “{w.name}”</option>)}
              </select>
              <div className="flex items-center gap-2 text-xs">
                Add these stages
                <select className={sel} value={rule.effect?.place ?? "before_sign"} onChange={(e) => setRule({ ...rule, effect: { ...rule.effect, place: e.target.value as never } })} aria-label="Where">
                  <option value="start">at the start</option>
                  <option value="before_sign">before the signature</option>
                  <option value="end">at the end</option>
                </select>
              </div>
              <StagesEditor stages={rule.effect?.addStages ?? []} onChange={(addStages) => setRule({ ...rule, effect: { ...rule.effect, addStages } })} o={o} />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="space-y-1"><span className="font-medium">From</span><Input type="date" value={rule.effectiveFrom?.slice(0, 10) ?? ""} onChange={(e) => setRule({ ...rule, effectiveFrom: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
                <label className="space-y-1"><span className="font-medium">Until</span><Input type="date" value={rule.effectiveTo?.slice(0, 10) ?? ""} onChange={(e) => setRule({ ...rule, effectiveTo: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
              </div>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={rule.active !== false} onChange={(e) => setRule({ ...rule, active: e.target.checked })} /> In use</label>
            </div>
            <DialogFooter>
              <Button onClick={() => save(() => saveRuleAction({ id: rule.id, name: rule.name ?? "", priority: rule.priority, condition: rule.condition, effect: rule.effect ?? {}, active: rule.active, effectiveFrom: rule.effectiveFrom, effectiveTo: rule.effectiveTo }), "Rule saved", () => setRule(null))}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Tabs>
  );
}
