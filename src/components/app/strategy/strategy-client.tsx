"use client";

// Strategy and M&E (Phase 25): the plan, its results framework, monitoring, risks, evaluations and documents.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, DownloadIcon, FileTextIcon, Loader2Icon, PencilIcon, PlusIcon, RefreshCwIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import * as A from "@/app/actions/strategy";
import type { PlanView, Recommendation } from "@/server/strategy";
import {
  CHILD_LEVEL,
  DAC_CRITERIA,
  DAC_RATINGS,
  DOC_KINDS,
  DOC_STYLES,
  FREQUENCIES,
  LEVELS,
  PERSPECTIVES,
  RAG_COLORS,
  RAG_LABELS,
  RISK_CATEGORIES,
  RISK_COLORS,
  UNITS,
  periodLabel,
  periodsOf,
  riskLevel,
  type DacCriterion,
  type Frequency,
  type Level,
  type Perspective,
  type Rag,
} from "@/lib/strategy";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string };
type Measure = { key: string; name: string; unit: string; area: string };
type Res = { ok: boolean; error?: string; data?: unknown };
const sel = "h-9 rounded-md border bg-background px-2 text-sm";
const TABS = [
  ["overview", "Overview"],
  ["framework", "Results framework"],
  ["monitor", "Monitor"],
  ["risks", "Risks"],
  ["evaluations", "Evaluations"],
  ["documents", "Documents"],
] as const;

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const act = async (fn: () => Promise<Res>, done?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Could not save."), false;
    if (done) toast.success(done);
    router.refresh();
    return r.data ?? true;
  };
  return { act, busy };
}

function RagDot({ rag, label }: { rag: Rag; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs" data-rag={rag}>
      <span className="size-2.5 rounded-full" style={{ background: RAG_COLORS[rag] }} />
      {label && RAG_LABELS[rag]}
    </span>
  );
}

function RagBar({ g, a, r, n }: { g: number; a: number; r: number; n: number }) {
  const total = Math.max(1, g + a + r + n);
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      {[
        [g, "green"],
        [a, "amber"],
        [r, "red"],
        [n, "none"],
      ].map(([v, k]) => (Number(v) ? <span key={String(k)} style={{ width: `${(Number(v) / total) * 100}%`, background: RAG_COLORS[k as Rag] }} /> : null))}
    </div>
  );
}

export function StrategyClient({ plans, view, tab, canManage, people, measures }: { plans: { id: string; name: string; status: string }[]; view: PlanView | null; tab: string; canManage: boolean; people: Person[]; measures: Measure[] }) {
  const router = useRouter();
  const { act, busy } = useAct();
  const [newPlan, setNewPlan] = React.useState(false);
  const href = (t: string) => `/strategy?${new URLSearchParams({ ...(view ? { plan: view.plan.id } : {}), tab: t }).toString()}`;
  return (
    <div className="space-y-4" data-strategy>
      <div className="flex flex-wrap items-center gap-2">
        {plans.length > 0 && (
          <select aria-label="Plan" className={sel} value={view?.plan.id ?? ""} onChange={(e) => router.push(`/strategy?plan=${e.target.value}&tab=${tab}`)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.status})
              </option>
            ))}
          </select>
        )}
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setNewPlan(!newPlan)}>
            <PlusIcon /> New plan
          </Button>
        )}
        {canManage && (
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const id = await act(() => A.examplePlanAction(), "An example plan was made: edit it to fit"); if (typeof id === "string") router.push(`/strategy?plan=${id}`); }} data-example-plan>
            <SparklesIcon /> Start from an example
          </Button>
        )}
      </div>
      {newPlan && <PlanForm onDone={(id) => (setNewPlan(false), id && router.push(`/strategy?plan=${id}`))} />}
      {!view ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{canManage ? "No plan yet. Start a new plan, or start from the example and change it." : "No plan has been shared with you yet."}</CardContent>
        </Card>
      ) : (
        <>
          <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="Strategy sections">
            {TABS.map(([k, l]) => (
              <Link key={k} href={href(k)} className={cn("rounded-full px-3 py-1 text-sm", tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")} aria-current={tab === k ? "page" : undefined}>
                {l}
              </Link>
            ))}
          </nav>
          {tab === "framework" ? (
            <Framework v={view} people={people} measures={measures} />
          ) : tab === "monitor" ? (
            <Monitor v={view} />
          ) : tab === "risks" ? (
            <Risks v={view} people={people} />
          ) : tab === "evaluations" ? (
            <Evaluations v={view} people={people} />
          ) : tab === "documents" ? (
            <Documents v={view} />
          ) : (
            <Overview v={view} />
          )}
        </>
      )}
    </div>
  );
}

function PlanForm({ plan, onDone }: { plan?: PlanView["plan"]; onDone: (id?: string) => void }) {
  const { act, busy } = useAct();
  const y = new Date().getFullYear();
  const [p, setP] = React.useState({ name: plan?.name ?? `Strategic plan ${y}–${y + 4}`, start: plan?.start ?? `${y}-01-01`, end: plan?.end ?? `${y + 4}-12-31`, vision: plan?.vision ?? "", mission: plan?.mission ?? "", values: (plan?.values ?? []).join("\n"), pillars: (plan?.pillars ?? []).join("\n"), status: plan?.status ?? "draft", green: plan?.rag.green ?? 90, amber: plan?.rag.amber ?? 70 });
  return (
    <Card data-plan-form>
      <CardContent className="grid gap-2 pt-4 sm:grid-cols-2">
        <Input aria-label="Plan name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        <div className="flex gap-2">
          <Input aria-label="Start" type="date" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} />
          <Input aria-label="End" type="date" value={p.end} onChange={(e) => setP({ ...p, end: e.target.value })} />
        </div>
        <textarea aria-label="Vision" placeholder="Vision: where the company wants to be" className="min-h-16 rounded-md border bg-background p-2 text-sm" value={p.vision} onChange={(e) => setP({ ...p, vision: e.target.value })} />
        <textarea aria-label="Mission" placeholder="Mission: what the company does, for whom" className="min-h-16 rounded-md border bg-background p-2 text-sm" value={p.mission} onChange={(e) => setP({ ...p, mission: e.target.value })} />
        <textarea aria-label="Values" placeholder="Values, one per line" className="min-h-16 rounded-md border bg-background p-2 text-sm" value={p.values} onChange={(e) => setP({ ...p, values: e.target.value })} />
        <textarea aria-label="Pillars" placeholder="Strategic pillars, one per line" className="min-h-16 rounded-md border bg-background p-2 text-sm" value={p.pillars} onChange={(e) => setP({ ...p, pillars: e.target.value })} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Status" className={sel} value={p.status} onChange={(e) => setP({ ...p, status: e.target.value as "draft" })}>
            <option value="draft">Draft</option>
            <option value="active">Active (monitored)</option>
            <option value="closed">Closed</option>
          </select>
          On track from <Input aria-label="Green from" type="number" className="h-8 w-16" value={p.green} onChange={(e) => setP({ ...p, green: Number(e.target.value) })} />% · needs attention from <Input aria-label="Amber from" type="number" className="h-8 w-16" value={p.amber} onChange={(e) => setP({ ...p, amber: Number(e.target.value) })} />%
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              const id = await act(() => A.savePlanAction({ id: plan?.id, name: p.name, start: p.start, end: p.end, vision: p.vision, mission: p.mission, values: p.values.split("\n"), pillars: p.pillars.split("\n"), status: p.status, rag: { green: p.green, amber: p.amber } }), "Plan saved");
              if (id) onDone(typeof id === "string" ? id : plan?.id);
            }}
          >
            Save the plan
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDone()}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview({ v }: { v: PlanView }) {
  const [edit, setEdit] = React.useState(false);
  const s = v.summary;
  return (
    <div className="space-y-4" data-strategy-overview>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-lg">{v.plan.name}</CardTitle>
              <CardDescription>
                {v.plan.start} to {v.plan.end} · {v.plan.status}
              </CardDescription>
            </div>
            {v.canManage && (
              <Button size="xs" variant="ghost" onClick={() => setEdit(!edit)}>
                <PencilIcon /> Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase">Vision</p>
            <p>{v.plan.vision || "–"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase">Mission</p>
            <p>{v.plan.mission || "–"}</p>
          </div>
          {v.plan.values.length > 0 && (
            <div className="flex flex-wrap gap-1 md:col-span-2">
              {v.plan.values.map((x) => (
                <span key={x} className="rounded-full bg-[#0B7A3B]/10 px-2.5 py-0.5 text-xs text-[#0B7A3B]">
                  {x}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {edit && <PlanForm plan={v.plan} onDone={() => setEdit(false)} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(["green", "amber", "red", "none"] as Rag[]).map((k) => (
          <div key={k} className="rounded-xl border bg-card p-4" style={{ borderTop: `5px solid ${RAG_COLORS[k]}` }} data-rag-count={k}>
            <p className="text-xs text-muted-foreground">{RAG_LABELS[k]}</p>
            <p className="text-3xl font-semibold tabular-nums">{s.all[k]}</p>
          </div>
        ))}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Indicators meeting SMART</p>
          <p className="text-3xl font-semibold tabular-nums">
            {s.smart}/{s.all.total}
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By pillar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {s.byPillar.map((x) => (
              <div key={x.pillar} className="space-y-1">
                <div className="flex justify-between">
                  <span>{x.pillar}</span>
                  <span className="text-xs text-muted-foreground">
                    {x.green} on track · {x.amber} attention · {x.red} off track
                  </span>
                </div>
                <RagBar g={x.green} a={x.amber} r={x.red} n={x.none} />
              </div>
            ))}
            {!s.byPillar.length && <p className="text-muted-foreground">Add results and indicators in Results framework.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Balanced Scorecard</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {s.byPerspective.map((x, i) => (
              <div key={x.perspective} className="rounded-lg border p-2" style={{ borderLeft: `5px solid ${["#1A73E8", "#1E8E3E", "#F9AB00", "#9334E6"][i]}` }} data-perspective={x.perspective}>
                <p className="text-xs font-medium">{x.label}</p>
                <p className="text-xs text-muted-foreground">{x.total} indicators</p>
                <RagBar g={x.green} a={x.amber} r={x.red} n={x.none} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="rounded-lg border p-3">Results not entered: <b>{s.missing}</b></div>
        <div className="rounded-lg border p-3">Results not verified: <b>{s.unverified}</b></div>
        <div className="rounded-lg border p-3">
          Activities done: <b>{s.activities.done}/{s.activities.total}</b>
          {s.activities.late ? <span className="text-[#D93025]"> · {s.activities.late} late</span> : null}
        </div>
        <div className="rounded-lg border p-3">
          Open risks: <b>{s.risks.open}</b> ({s.risks.high} high) · open recommendations: <b>{s.recommendations}</b>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results framework
// ---------------------------------------------------------------------------

type NodeDraft = { id?: string; parentId: string | null; level: Level; title: string; description: string; pillar: string; perspective: string; ownerId: string; assumptions: string; status: string; start: string; end: string; budget: string };

function Framework({ v, people, measures }: { v: PlanView; people: Person[]; measures: Measure[] }) {
  const { act, busy } = useAct();
  const [node, setNode] = React.useState<NodeDraft | null>(null);
  const [ind, setInd] = React.useState<{ nodeId: string; id?: string } | null>(null);
  const roots = v.nodes.filter((n) => !n.parentId);
  const blank = (parentId: string | null, level: Level): NodeDraft => ({ parentId, level, title: "", description: "", pillar: "", perspective: "", ownerId: "", assumptions: "", status: "planned", start: "", end: "", budget: "" });
  const render = (id: string, depth: number): React.ReactNode => {
    const n = v.nodes.find((x) => x.id === id)!;
    const kids = v.nodes.filter((x) => x.parentId === id);
    const inds = v.indicators.filter((i) => i.nodeId === id);
    const child = CHILD_LEVEL[n.level];
    return (
      <div key={id} className={cn("space-y-1", depth && "border-l pl-3")} data-node={n.code}>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
          <span className="font-mono text-xs text-muted-foreground">{n.code}</span>
          <span className="rounded bg-muted px-1.5 text-[11px]">{LEVELS[n.level]}</span>
          <span className="min-w-0 flex-1 font-medium">{n.title}</span>
          {n.perspective && <span className="text-[11px] text-muted-foreground">{PERSPECTIVES[n.perspective]}</span>}
          {n.pillar && <span className="rounded-full bg-[#1A73E8]/10 px-2 text-[11px] text-[#1A73E8]">{n.pillar}</span>}
          {n.level === "activity" && <span className={cn("text-[11px]", n.overdue ? "text-[#D93025]" : "text-muted-foreground")}>{n.overdue ? "late" : n.status.replace("_", " ")}</span>}
          <RagDot rag={n.rag} />
          {v.canManage && (
            <span className="flex gap-0.5">
              <Button size="xs" variant="ghost" onClick={() => setNode({ id: n.id, parentId: n.parentId, level: n.level, title: n.title, description: n.description, pillar: n.pillar ?? "", perspective: n.perspective ?? "", ownerId: n.ownerId ?? "", assumptions: n.assumptions, status: n.status, start: n.start ?? "", end: n.end ?? "", budget: n.budget === null ? "" : String(n.budget) })} aria-label={`Edit ${n.code}`}>
                <PencilIcon />
              </Button>
              {child && (
                <Button size="xs" variant="ghost" onClick={() => setNode(blank(n.id, child))} data-add-child={n.code}>
                  <PlusIcon /> {LEVELS[child]}
                </Button>
              )}
              <Button size="xs" variant="ghost" onClick={() => setInd({ nodeId: n.id })} data-add-indicator={n.code}>
                <PlusIcon /> Indicator
              </Button>
              <Button size="xs" variant="ghost" aria-label={`Delete ${n.code}`} onClick={() => window.confirm(`Delete ${n.code} and everything under it?`) && act(() => A.deleteNodeAction(n.id), "Deleted")}>
                <Trash2Icon />
              </Button>
            </span>
          )}
        </div>
        {node?.parentId === n.id && !node.id && <NodeForm d={node} set={setNode} v={v} people={people} busy={busy} act={act} />}
        {node?.id === n.id && <NodeForm d={node} set={setNode} v={v} people={people} busy={busy} act={act} />}
        {inds.map((i) => (
          <div key={i.id} className="ml-4 flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm" data-indicator={i.code}>
            <RagDot rag={i.rag} />
            <span className="font-mono text-xs text-muted-foreground">{i.code}</span>
            <span className="min-w-0 flex-1">{i.name}</span>
            <span className="text-xs text-muted-foreground">
              {i.baseline !== null ? `baseline ${i.baseline}` : "no baseline"} · {FREQUENCIES[i.frequency]}
              {i.measure ? " · from the app" : ""}
            </span>
            {i.gaps.length ? (
              <span className="rounded bg-[#F9AB00]/15 px-1.5 text-[11px] text-[#B06000]" title={i.gaps.map((g) => g.text).join("\n")} data-smart-gaps={i.gaps.length}>
                SMART: {[...new Set(i.gaps.map((g) => g.key))].join("")} missing
              </span>
            ) : (
              <span className="rounded bg-[#1E8E3E]/10 px-1.5 text-[11px] text-[#1E8E3E]">SMART</span>
            )}
            {v.canManage && (
              <>
                <Button size="xs" variant="ghost" aria-label={`Edit ${i.code}`} onClick={() => setInd({ nodeId: n.id, id: i.id })}>
                  <PencilIcon />
                </Button>
                <Button size="xs" variant="ghost" aria-label={`Delete ${i.code}`} onClick={() => window.confirm(`Delete the indicator ${i.code}?`) && act(() => A.deleteIndicatorAction(i.id), "Deleted")}>
                  <Trash2Icon />
                </Button>
              </>
            )}
          </div>
        ))}
        {ind?.nodeId === n.id && <IndicatorForm v={v} nodeId={n.id} existing={v.indicators.find((x) => x.id === ind.id) ?? null} people={people} measures={measures} onDone={() => setInd(null)} />}
        {kids.map((k) => render(k.id, depth + 1))}
      </div>
    );
  };
  return (
    <div className="space-y-2" data-framework>
      <p className="text-sm text-muted-foreground">The results chain: a goal (impact), the outcomes that lead to it, the outputs that deliver each outcome, and the activities that produce them. Each result has indicators with a full reference sheet.</p>
      {roots.map((r) => render(r.id, 0))}
      {v.canManage && (
        <>
          {node && !node.parentId && !node.id && <NodeForm d={node} set={setNode} v={v} people={people} busy={busy} act={act} />}
          <Button size="sm" variant="outline" onClick={() => setNode(blank(null, "goal"))} data-add-goal>
            <PlusIcon /> Add a goal
          </Button>
        </>
      )}
    </div>
  );
}

function NodeForm({ d, set, v, people, busy, act }: { d: NodeDraft; set: (x: NodeDraft | null) => void; v: PlanView; people: Person[]; busy: boolean; act: (fn: () => Promise<Res>, done?: string) => Promise<unknown> }) {
  return (
    <div className="ml-4 grid gap-2 rounded-lg border border-primary/40 p-2 sm:grid-cols-2" data-node-form>
      <Input aria-label="Result" placeholder={`${LEVELS[d.level]}: the change or product, e.g. "More schools use Myseed lessons"`} className="sm:col-span-2" value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} />
      <select aria-label="Pillar" className={sel} value={d.pillar} onChange={(e) => set({ ...d, pillar: e.target.value })}>
        <option value="">Pillar (from the one above)</option>
        {v.plan.pillars.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <select aria-label="Perspective" className={sel} value={d.perspective} onChange={(e) => set({ ...d, perspective: e.target.value })}>
        <option value="">Balanced Scorecard perspective</option>
        {Object.entries(PERSPECTIVES).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <select aria-label="Owner" className={sel} value={d.ownerId} onChange={(e) => set({ ...d, ownerId: e.target.value })}>
        <option value="">Owner</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {d.level === "activity" ? (
        <div className="flex gap-1">
          <select aria-label="Activity status" className={sel} value={d.status} onChange={(e) => set({ ...d, status: e.target.value })}>
            {["planned", "in_progress", "done", "delayed", "dropped"].map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <Input aria-label="Starts" type="date" value={d.start} onChange={(e) => set({ ...d, start: e.target.value })} />
          <Input aria-label="Ends" type="date" value={d.end} onChange={(e) => set({ ...d, end: e.target.value })} />
          <Input aria-label="Budget" type="number" placeholder="Budget" value={d.budget} onChange={(e) => set({ ...d, budget: e.target.value })} />
        </div>
      ) : (
        <Input aria-label="Assumptions" placeholder="Assumptions (what must hold for it to lead to the result above)" value={d.assumptions} onChange={(e) => set({ ...d, assumptions: e.target.value })} />
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button
          size="xs"
          disabled={busy || !d.title.trim()}
          onClick={async () => {
            const ok = await act(() => A.saveNodeAction({ id: d.id, planId: v.plan.id, parentId: d.parentId, level: d.level, title: d.title, description: d.description, pillar: d.pillar || null, perspective: (d.perspective || null) as Perspective | null, ownerId: d.ownerId || null, assumptions: d.assumptions, status: d.status, start: d.start || null, end: d.end || null, budget: d.budget ? Number(d.budget) : null }), "Saved");
            if (ok) set(null);
          }}
          data-save-node
        >
          Save
        </Button>
        <Button size="xs" variant="ghost" onClick={() => set(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function IndicatorForm({ v, nodeId, existing, people, measures, onDone }: { v: PlanView; nodeId: string; existing: PlanView["indicators"][number] | null; people: Person[]; measures: Measure[]; onDone: () => void }) {
  const { act, busy } = useAct();
  const [f, setF] = React.useState({
    name: existing?.name ?? "",
    definition: existing?.definition ?? "",
    unit: existing?.unit ?? "number",
    direction: existing?.direction ?? ("up" as "up" | "down"),
    baseline: existing?.baseline === null || existing?.baseline === undefined ? "" : String(existing.baseline),
    baselineDate: existing?.baselineDate ?? v.plan.start,
    frequency: existing?.frequency ?? ("quarterly" as Frequency),
    dataSource: existing?.dataSource ?? "",
    method: existing?.method ?? "",
    verification: existing?.verification ?? "",
    responsibleId: existing?.responsibleId ?? "",
    formula: existing?.formula ?? "",
    disaggregation: existing?.disaggregation ?? "",
    measure: existing?.measure ?? "",
    targets: Object.fromEntries(Object.entries(existing?.targets ?? {}).map(([k, x]) => [k, String(x)])) as Record<string, string>,
  });
  const periods = periodsOf(f.frequency, v.plan.start, v.plan.end);
  const [all, setAll] = React.useState("");
  return (
    <div className="ml-4 space-y-2 rounded-lg border border-[#9334E6]/40 bg-[#9334E6]/5 p-2" data-indicator-form>
      <p className="text-xs font-medium">Indicator reference sheet</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="Indicator name" placeholder="Name, e.g. Students using Myseed lessons each month" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select aria-label="Read from the app" className={sel} value={f.measure} onChange={(e) => { const m = measures.find((x) => x.key === e.target.value); setF({ ...f, measure: e.target.value, unit: m ? (m.unit === "percent" ? "percent" : m.unit === "count" ? "number" : m.unit) : f.unit }); }}>
          <option value="">Entered by hand each period</option>
          {measures.map((m) => (
            <option key={m.key} value={m.key}>
              From the app: {m.name} ({m.area})
            </option>
          ))}
        </select>
        <textarea aria-label="Definition" placeholder="Definition: exactly what is counted, and what is not" className="min-h-14 rounded-md border bg-background p-2 text-sm sm:col-span-2" value={f.definition} onChange={(e) => setF({ ...f, definition: e.target.value })} />
        <div className="flex gap-1">
          <select aria-label="Unit" className={sel} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <select aria-label="Better when" className={sel} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value as "up" })}>
            <option value="up">Higher is better</option>
            <option value="down">Lower is better</option>
          </select>
          <select aria-label="Frequency" className={sel} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as Frequency })}>
            {Object.entries(FREQUENCIES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1">
          <Input aria-label="Baseline" type="number" placeholder="Baseline" value={f.baseline} onChange={(e) => setF({ ...f, baseline: e.target.value })} />
          <Input aria-label="Baseline date" type="date" value={f.baselineDate} onChange={(e) => setF({ ...f, baselineDate: e.target.value })} />
        </div>
        <Input aria-label="Formula" placeholder="Calculation, e.g. on-time ÷ all × 100" value={f.formula} onChange={(e) => setF({ ...f, formula: e.target.value })} />
        <Input aria-label="Disaggregation" placeholder="Broken down by, e.g. grade, region, sex" value={f.disaggregation} onChange={(e) => setF({ ...f, disaggregation: e.target.value })} />
        {!f.measure && <Input aria-label="Data source" placeholder="Data source" value={f.dataSource} onChange={(e) => setF({ ...f, dataSource: e.target.value })} />}
        {!f.measure && <Input aria-label="Collection method" placeholder="How it is collected" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} />}
        <Input aria-label="Means of verification" placeholder="Means of verification (the report or file that proves it)" value={f.verification} onChange={(e) => setF({ ...f, verification: e.target.value })} />
        <select aria-label="Responsible" className={sel} value={f.responsibleId} onChange={(e) => setF({ ...f, responsibleId: e.target.value })}>
          <option value="">Who reports it</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1 text-xs">
          Targets per period
          <Input aria-label="Same target for all" placeholder="Same for all" className="h-7 w-24" value={all} onChange={(e) => setAll(e.target.value)} />
          <Button size="xs" variant="outline" onClick={() => setF({ ...f, targets: Object.fromEntries(periods.map((p) => [p, all])) })}>
            Fill
          </Button>
        </div>
        <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
          {periods.map((p) => (
            <label key={p} className="flex items-center gap-1 text-[11px]">
              {periodLabel(p)}
              <Input aria-label={`Target ${p}`} type="number" className="h-7 w-20" value={f.targets[p] ?? ""} onChange={(e) => setF({ ...f, targets: { ...f.targets, [p]: e.target.value } })} />
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="xs"
          disabled={busy || !f.name.trim()}
          onClick={async () => {
            const ok = await act(
              () =>
                A.saveIndicatorAction({
                  id: existing?.id,
                  nodeId,
                  name: f.name,
                  definition: f.definition,
                  unit: f.unit,
                  direction: f.direction,
                  baseline: f.baseline === "" ? null : Number(f.baseline),
                  baselineDate: f.baselineDate || null,
                  frequency: f.frequency,
                  dataSource: f.dataSource,
                  method: f.method,
                  verification: f.verification,
                  responsibleId: f.responsibleId || null,
                  formula: f.formula,
                  disaggregation: f.disaggregation,
                  measure: f.measure || null,
                  targets: Object.fromEntries(Object.entries(f.targets).filter(([, x]) => x !== "").map(([k, x]) => [k, Number(x)])),
                }),
              "Indicator saved",
            );
            if (ok) onDone();
          }}
          data-save-indicator
        >
          Save the indicator
        </Button>
        <Button size="xs" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monitor: results per period
// ---------------------------------------------------------------------------

function Monitor({ v }: { v: PlanView }) {
  const { act, busy } = useAct();
  const [mine, setMine] = React.useState(!v.canManage);
  const [entry, setEntry] = React.useState<Record<string, { value: string; note: string }>>({});
  const list = v.indicators.filter((i) => !mine || i.mine);
  return (
    <div className="space-y-3" data-monitor>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only the ones I report
        </label>
        {v.canManage && (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => act(() => A.refreshAutoAction(v.plan.id), "Results from the app updated")}>
            <RefreshCwIcon /> Read results from the app now
          </Button>
        )}
      </div>
      {list.map((i) => {
        const due = i.rows.filter((r) => r.due);
        const open = [...due].reverse().find((r) => r.actual === null) ?? due[due.length - 1];
        const key = `${i.id}|${open?.period}`;
        return (
          <Card key={i.id} data-monitor-indicator={i.code}>
            <CardContent className="space-y-2 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <RagDot rag={i.rag} label />
                <span className="font-mono text-xs text-muted-foreground">{i.code}</span>
                <span className="font-medium">{i.name}</span>
                <span className="text-xs text-muted-foreground">
                  {i.unit} · {i.direction === "up" ? "higher is better" : "lower is better"} · baseline {i.baseline ?? "–"} · {i.responsible ?? "nobody named"}
                </span>
                {i.missing.length > 0 && <span className="text-xs text-[#D93025]">{i.missing.length} periods without a result</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <tbody>
                    <tr>
                      <th className="pr-2 text-left font-medium text-muted-foreground">Period</th>
                      {due.slice(-8).map((r) => (
                        <td key={r.period} className="px-2 text-center">
                          {periodLabel(r.period)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th className="pr-2 text-left font-medium text-muted-foreground">Target</th>
                      {due.slice(-8).map((r) => (
                        <td key={r.period} className="px-2 text-center tabular-nums">
                          {r.target ?? "–"}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th className="pr-2 text-left font-medium text-muted-foreground">Actual</th>
                      {due.slice(-8).map((r) => (
                        <td key={r.period} className="px-2 text-center tabular-nums" title={r.note ?? ""}>
                          <span className="inline-flex items-center gap-1">
                            {r.actual ?? "–"}
                            {r.actual !== null && <RagDot rag={r.rag} />}
                            {r.actual !== null && (r.verified ? <CheckIcon className="size-3 text-[#1E8E3E]" aria-label="Verified" /> : v.canManage && (
                              <button type="button" className="text-[10px] text-primary underline" onClick={() => act(() => A.verifyActualAction(i.id, r.period), "Verified")} data-verify={`${i.code}:${r.period}`}>
                                verify
                              </button>
                            ))}
                          </span>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th className="pr-2 text-left font-medium text-muted-foreground">Achieved</th>
                      {due.slice(-8).map((r) => (
                        <td key={r.period} className="px-2 text-center tabular-nums">
                          {r.achievement === null ? "–" : `${r.achievement}%`}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              {open && (i.mine || v.canManage) && !i.measure && (
                <div className="flex flex-wrap items-center gap-2" data-enter={i.code}>
                  <span className="text-xs">Result for {periodLabel(open.period)}:</span>
                  <Input aria-label={`Result ${i.code}`} type="number" className="h-8 w-28" value={entry[key]?.value ?? ""} onChange={(e) => setEntry({ ...entry, [key]: { value: e.target.value, note: entry[key]?.note ?? "" } })} />
                  <Input aria-label={`Comment ${i.code}`} placeholder="Comment (why above or below the target)" className="h-8 min-w-60 flex-1" value={entry[key]?.note ?? ""} onChange={(e) => setEntry({ ...entry, [key]: { value: entry[key]?.value ?? "", note: e.target.value } })} />
                  <Button size="xs" disabled={busy || !entry[key]?.value} onClick={async () => (await act(() => A.enterActualAction({ indicatorId: i.id, period: open.period, value: Number(entry[key]!.value), note: entry[key]!.note }), "Result saved")) && setEntry({ ...entry, [key]: { value: "", note: "" } })}>
                    Save
                  </Button>
                </div>
              )}
              {i.measure && <p className="text-xs text-muted-foreground">Read from the app every day; nothing to enter.</p>}
            </CardContent>
          </Card>
        );
      })}
      {!list.length && <p className="text-sm text-muted-foreground">No indicators {mine ? "for you to report" : "yet"}.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------

function Risks({ v, people }: { v: PlanView; people: Person[] }) {
  const { act, busy } = useAct();
  const blank = { title: "", category: "Operational", likelihood: 3, impact: 3, mitigation: "", ownerId: "", status: "open", reviewDate: "" };
  const [f, setF] = React.useState<(typeof blank & { id?: string }) | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]" data-risks>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Heat map</CardTitle>
          <CardDescription>Likelihood × impact, open risks.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-0.5 text-[10px]">
            {[5, 4, 3, 2, 1].map((L) => (
              <React.Fragment key={L}>
                <span className="pr-1 text-right text-muted-foreground">{L}</span>
                {[1, 2, 3, 4, 5].map((I) => {
                  const here = v.risks.filter((r) => r.status !== "closed" && r.likelihood === L && r.impact === I);
                  return (
                    <div key={I} className="flex aspect-square items-center justify-center rounded font-semibold text-white" style={{ background: RISK_COLORS[riskLevel(L * I)], opacity: here.length ? 1 : 0.35 }} title={here.map((r) => r.title).join("\n")} data-heat={`${L}x${I}`}>
                      {here.length || ""}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
            <span />
            {[1, 2, 3, 4, 5].map((I) => (
              <span key={I} className="text-center text-muted-foreground">
                {I}
              </span>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Up: likelihood · across: impact</p>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {v.risks.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm" data-risk={r.title}>
            <span className="rounded px-1.5 text-xs font-semibold text-white" style={{ background: RISK_COLORS[r.level] }}>
              {r.score}
            </span>
            <span className="min-w-0 flex-1 font-medium">{r.title}</span>
            <span className="text-xs text-muted-foreground">
              {r.category} · {r.owner ?? "no owner"} · {r.status}
              {r.overdueReview ? " · review overdue" : ""}
            </span>
            {v.canManage && (
              <>
                <Button size="xs" variant="ghost" aria-label={`Edit ${r.title}`} onClick={() => setF({ id: r.id, title: r.title, category: r.category, likelihood: r.likelihood, impact: r.impact, mitigation: r.mitigation ?? "", ownerId: r.ownerId ?? "", status: r.status, reviewDate: r.reviewDate ?? "" })}>
                  <PencilIcon />
                </Button>
                <Button size="xs" variant="ghost" aria-label={`Delete ${r.title}`} onClick={() => act(() => A.deleteRiskAction(r.id), "Deleted")}>
                  <Trash2Icon />
                </Button>
              </>
            )}
            {r.mitigation && <p className="w-full text-xs text-muted-foreground">Mitigation: {r.mitigation}</p>}
          </div>
        ))}
        {v.canManage &&
          (f ? (
            <div className="grid gap-2 rounded-lg border border-primary/40 p-2 sm:grid-cols-2" data-risk-form>
              <Input aria-label="Risk" placeholder="What could happen, and its effect" className="sm:col-span-2" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <select aria-label="Category" className={sel} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {RISK_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <div className="flex items-center gap-1 text-xs">
                Likelihood
                <select aria-label="Likelihood" className={sel} value={f.likelihood} onChange={(e) => setF({ ...f, likelihood: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                Impact
                <select aria-label="Impact" className={sel} value={f.impact} onChange={(e) => setF({ ...f, impact: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
              <Input aria-label="Mitigation" placeholder="Mitigation" className="sm:col-span-2" value={f.mitigation} onChange={(e) => setF({ ...f, mitigation: e.target.value })} />
              <select aria-label="Risk owner" className={sel} value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
                <option value="">Owner</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <select aria-label="Risk status" className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                  <option value="open">Open</option>
                  <option value="watch">Watch</option>
                  <option value="closed">Closed</option>
                </select>
                <Input aria-label="Review date" type="date" value={f.reviewDate} onChange={(e) => setF({ ...f, reviewDate: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button size="xs" disabled={busy || !f.title.trim()} onClick={async () => (await act(() => A.saveRiskAction({ ...f, planId: v.plan.id, ownerId: f.ownerId || null, reviewDate: f.reviewDate || null }), "Risk saved")) && setF(null)} data-save-risk>
                  Save
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setF(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setF(blank)} data-add-risk>
              <PlusIcon /> Add a risk
            </Button>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evaluations (OECD-DAC)
// ---------------------------------------------------------------------------

function Evaluations({ v, people }: { v: PlanView; people: Person[] }) {
  const { act, busy } = useAct();
  type Draft = { id?: string; title: string; kind: string; period: string; scores: Partial<Record<DacCriterion, { rating: number; evidence: string }>>; summary: string; findings: string; lessons: string; recommendations: Recommendation[]; status: string };
  const [f, setF] = React.useState<Draft | null>(null);
  return (
    <div className="space-y-3" data-evaluations>
      {v.evaluations.map((e) => (
        <Card key={e.id} data-evaluation={e.title}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="flex-1 text-base">
                {e.title} <span className="text-xs font-normal text-muted-foreground">{e.kind} · {e.period ?? ""} · {e.status}</span>
              </CardTitle>
              <Button asChild size="xs" variant="outline">
                <a href={`/api/strategy/doc?plan=${v.plan.id}&kind=evaluation&evaluation=${e.id}&style=international`}>
                  <FileTextIcon /> Report
                </a>
              </Button>
              {v.canManage && (
                <Button size="xs" variant="ghost" onClick={() => setF({ ...e, period: e.period ?? "" })}>
                  <PencilIcon />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
            {(Object.keys(DAC_CRITERIA) as DacCriterion[]).map((k) => (
              <div key={k} className="rounded border p-2" style={{ borderTop: `4px solid ${e.scores[k] ? ["#D93025", "#E8710A", "#1A73E8", "#1E8E3E"][e.scores[k]!.rating - 1] : "#9AA0A6"}` }}>
                <p className="font-medium">{DAC_CRITERIA[k].label}</p>
                <p className="text-muted-foreground">{e.scores[k] ? DAC_RATINGS[e.scores[k]!.rating as 1 | 2 | 3 | 4] : "Not rated"}</p>
              </div>
            ))}
            {e.recommendations.length > 0 && (
              <p className="sm:col-span-3 lg:col-span-6">
                {e.recommendations.length} recommendations · {e.recommendations.filter((r) => r.status === "done").length} done
              </p>
            )}
          </CardContent>
        </Card>
      ))}
      {v.canManage &&
        (f ? (
          <Card data-evaluation-form>
            <CardContent className="space-y-2 pt-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input aria-label="Evaluation title" placeholder="Title, e.g. Mid-term review 2028" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
                <select aria-label="Kind" className={sel} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                  {["baseline", "annual", "midterm", "final", "thematic"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <Input aria-label="Evaluation period" placeholder="Period covered, e.g. 2026–2027" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {(Object.keys(DAC_CRITERIA) as DacCriterion[]).map((k) => (
                  <div key={k} className="space-y-1 rounded border p-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="flex-1 font-medium">
                        {DAC_CRITERIA[k].label}: <span className="font-normal text-muted-foreground">{DAC_CRITERIA[k].question}</span>
                      </span>
                      <select aria-label={`${DAC_CRITERIA[k].label} rating`} className={cn(sel, "h-7")} value={f.scores[k]?.rating ?? ""} onChange={(e) => setF({ ...f, scores: { ...f.scores, [k]: { rating: Number(e.target.value), evidence: f.scores[k]?.evidence ?? "" } } })}>
                        <option value="">Rating</option>
                        {[4, 3, 2, 1].map((r) => (
                          <option key={r} value={r}>
                            {r} {DAC_RATINGS[r as 1]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input aria-label={`${DAC_CRITERIA[k].label} evidence`} placeholder="Evidence" className="h-8" value={f.scores[k]?.evidence ?? ""} onChange={(e) => setF({ ...f, scores: { ...f.scores, [k]: { rating: f.scores[k]?.rating ?? 0, evidence: e.target.value } } })} />
                  </div>
                ))}
              </div>
              <textarea aria-label="Summary" placeholder="Executive summary" className="min-h-16 w-full rounded-md border bg-background p-2 text-sm" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
              <textarea aria-label="Lessons" placeholder="Lessons learned" className="min-h-12 w-full rounded-md border bg-background p-2 text-sm" value={f.lessons} onChange={(e) => setF({ ...f, lessons: e.target.value })} />
              <p className="text-xs font-medium">Recommendations and management response</p>
              {f.recommendations.map((r, n) => (
                <div key={n} className="grid gap-1 sm:grid-cols-[2fr_2fr_1fr_1fr_1fr]">
                  <Input aria-label={`Recommendation ${n + 1}`} value={r.text} onChange={(e) => setF({ ...f, recommendations: f.recommendations.map((x, j) => (j === n ? { ...x, text: e.target.value } : x)) })} />
                  <Input aria-label={`Response ${n + 1}`} placeholder="Management response" value={r.response} onChange={(e) => setF({ ...f, recommendations: f.recommendations.map((x, j) => (j === n ? { ...x, response: e.target.value } : x)) })} />
                  <select aria-label={`Owner ${n + 1}`} className={sel} value={r.ownerId ?? ""} onChange={(e) => setF({ ...f, recommendations: f.recommendations.map((x, j) => (j === n ? { ...x, ownerId: e.target.value || null } : x)) })}>
                    <option value="">Owner</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Input aria-label={`Due ${n + 1}`} type="date" value={r.due ?? ""} onChange={(e) => setF({ ...f, recommendations: f.recommendations.map((x, j) => (j === n ? { ...x, due: e.target.value || null } : x)) })} />
                  <select aria-label={`Status ${n + 1}`} className={sel} value={r.status} onChange={(e) => setF({ ...f, recommendations: f.recommendations.map((x, j) => (j === n ? { ...x, status: e.target.value as Recommendation["status"] } : x)) })}>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                    <option value="not_accepted">Not accepted</option>
                  </select>
                </div>
              ))}
              <Button size="xs" variant="outline" onClick={() => setF({ ...f, recommendations: [...f.recommendations, { text: "", response: "", ownerId: null, due: null, status: "open" }] })}>
                <PlusIcon /> Recommendation
              </Button>
              <div className="flex gap-2">
                <Button size="xs" disabled={busy || !f.title.trim()} onClick={async () => (await act(() => A.saveEvaluationAction({ ...f, planId: v.plan.id }), "Evaluation saved")) && setF(null)} data-save-evaluation>
                  Save
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setF(null)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setF({ title: "", kind: "annual", period: "", scores: {}, summary: "", findings: "", lessons: "", recommendations: [], status: "draft" })} data-add-evaluation>
            <PlusIcon /> Record an evaluation
          </Button>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function Documents({ v }: { v: PlanView }) {
  const [style, setStyle] = React.useState<"myseed" | "international">("myseed");
  const periods = [...new Set(v.indicators.flatMap((i) => i.rows.filter((r) => r.actual !== null).map((r) => r.period)))].sort();
  const [period, setPeriod] = React.useState(periods[periods.length - 1] ?? "");
  const [narrative, setNarrative] = React.useState(false);
  const link = (kind: string, extra: Record<string, string> = {}) => `/api/strategy/doc?${new URLSearchParams({ plan: v.plan.id, kind, style, ...extra }).toString()}`;
  return (
    <div className="space-y-3" data-documents>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        Look:
        {(Object.keys(DOC_STYLES) as ("myseed" | "international")[]).map((s) => (
          <button key={s} type="button" aria-pressed={style === s} onClick={() => setStyle(s)} className={cn("rounded-full border px-3 py-1 text-xs", style === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")} data-doc-style={s}>
            {DOC_STYLES[s]}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(DOC_KINDS) as (keyof typeof DOC_KINDS)[]).filter((k) => k !== "evaluation").map((k) => (
          <Card key={k}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <FileTextIcon className="size-4 text-[#1A73E8]" /> {DOC_KINDS[k]}
              </CardTitle>
              <CardDescription className="text-xs">
                {k === "plan" ? "Vision, mission, values, pillars, the results framework, indicators and targets, risks and how it is monitored." : k === "meplan" ? "The logframe matrix, a reference sheet for each indicator, the data collection plan, reporting and data quality." : k === "report" ? "Results against targets (Red, Amber, Green), activities, risks and follow-up of recommendations." : k === "kpis" ? "Every indicator and staff KPI with its definition, formula, source and owner." : "The matrix of results, indicators, baselines, targets, verification and assumptions (landscape)."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {k === "report" && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select aria-label="Report period" className={sel} value={period} onChange={(e) => setPeriod(e.target.value)}>
                    <option value="">Latest results</option>
                    {periods.map((p) => (
                      <option key={p} value={p}>
                        {periodLabel(p)}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={narrative} onChange={(e) => setNarrative(e.target.checked)} /> Narrative written by the AI
                  </label>
                </div>
              )}
              <Button asChild size="sm">
                <a href={link(k, k === "report" ? { ...(period ? { period } : {}), ...(narrative ? { narrative: "1" } : {}) } : {})} data-doc={k}>
                  <DownloadIcon /> Word document
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <FileTextIcon className="size-4 text-[#1E8E3E]" /> Indicator tracking table
            </CardTitle>
            <CardDescription className="text-xs">Targets, results and achievement per period, coloured, and the risk register, in Excel.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <a href={link("tracking")} data-doc="tracking">
                <DownloadIcon /> Excel workbook
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
