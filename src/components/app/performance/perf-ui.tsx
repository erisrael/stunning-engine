"use client";

// Performance (Phase 17): a scorecard (KRAs, KPIs with actual, target, trend and colour), the team and company views,
// OKRs (the tree, key results, check-ins), the library (KPIs and KRA templates) and periods with approvals.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon, PlusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import * as A from "@/app/actions/performance";
import { CONFIDENCE, OKR_LEVELS, type Confidence, type KpiDef, type OkrLevel, type PerfConfig, type Scorecard, type Template, type TemplateKra } from "@/lib/performance";
import { cn } from "@/lib/utils";

type Res = { ok: boolean; error?: string; data?: unknown };
function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const act = async (fn: () => Promise<Res>, done?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Something went wrong.");
    if (done) toast.success(done);
    router.refresh();
    return r.data ?? true;
  };
  return { act, busy };
}
const select = "h-9 rounded-md border bg-background px-2 text-sm";
const colour = (s: number | null) => (s === null ? "text-muted-foreground" : s >= 90 ? "text-[#188038]" : s >= 60 ? "text-[#B06000]" : "text-[#D93025]");
const bar = (s: number | null) => (s === null ? "bg-muted" : s >= 90 ? "bg-[#188038]" : s >= 60 ? "bg-[#F9AB00]" : "bg-[#D93025]");
const fmt = (v: number | null, unit: string) => (v === null ? "-" : `${v.toLocaleString()}${unit === "percent" ? "%" : unit === "minutes" ? " min" : unit === "hours" ? " h" : unit === "days" ? " d" : ""}`);

export function MonthPicker({ period, base }: { period: string; base: string }) {
  const router = useRouter();
  return <Input aria-label="Month" type="month" className="w-44" value={period} onChange={(e) => e.target.value && router.push(`${base}${base.includes("?") ? "&" : "?"}period=${e.target.value}`)} />;
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

export function ScorecardView({ card, trend, canEdit, kpis }: { card: Scorecard; trend: { period: string; score: number | null }[]; canEdit: boolean; kpis: KpiDef[] }) {
  const { act, busy } = useAct();
  const [edit, setEdit] = React.useState<{ kpi: string; mode: "target" | "value"; v: string; reason: string } | null>(null);
  return (
    <div className="space-y-4" data-scorecard={card.userId}>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 py-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {card.name} · {card.period} · {card.template ?? "no template"}
              {card.frozen && " · closed"}
            </p>
            <p className={cn("text-5xl font-semibold tabular-nums", colour(card.score))} data-overall>
              {card.score ?? "-"}
            </p>
            <p className="font-medium">{card.rating ?? "Not enough data yet"}</p>
          </div>
          <div className="flex h-16 items-end gap-1" aria-label="Last six months">
            {trend.map((t) => (
              <div key={t.period} className="flex flex-col items-center gap-0.5">
                <div className={cn("w-6 rounded-t", bar(t.score))} style={{ height: `${Math.max(4, Math.min(100, t.score ?? 0) * 0.5)}px` }} title={`${t.period}: ${t.score ?? "-"}`} />
                <span className="text-[10px] text-muted-foreground">{t.period.slice(5)}</span>
              </div>
            ))}
          </div>
          {card.warnings.map((w) => (
            <p key={w} className="text-sm text-[#B06000]">
              {w}
            </p>
          ))}
        </CardContent>
      </Card>
      {card.kras.map((k) => (
        <Card key={k.name}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {k.name} <span className="text-xs font-normal text-muted-foreground">{k.weight}%</span>
              <span className={cn("ml-auto tabular-nums", colour(k.score))}>{k.score ?? "-"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {k.kpis.map((x) => (
              <div key={x.kpi} className="space-y-1" data-kpi={x.kpi}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-48 flex-1">
                    {x.name} <span className="text-xs text-muted-foreground">{x.weight}%</span>
                  </span>
                  <span className="tabular-nums">{fmt(x.value, x.unit)}</span>
                  <span className="text-xs text-muted-foreground">
                    target {fmt(x.target, x.unit)}
                    {x.targetOverridden && " (own)"}
                  </span>
                  {x.previous !== null && x.value !== null && x.previous !== x.value && (
                    <span className={cn("inline-flex items-center text-xs", (x.value > x.previous) === (x.direction === "up") ? "text-[#188038]" : "text-[#D93025]")} title={`Last month ${x.previous}`}>
                      {x.value > x.previous ? <TrendingUpIcon className="size-3" /> : <TrendingDownIcon className="size-3" />}
                    </span>
                  )}
                  <span className={cn("w-10 text-right font-medium tabular-nums", colour(x.score))}>{x.score ?? "-"}</span>
                  {canEdit && !card.frozen && (
                    <Button size="xs" variant="ghost" onClick={() => setEdit({ kpi: x.kpi, mode: "target", v: String(x.target), reason: "" })}>
                      Target
                    </Button>
                  )}
                  {canEdit && (kpis.find((d) => d.key === x.kpi)?.source === "manual" || card.frozen) && (
                    <Button size="xs" variant="ghost" onClick={() => setEdit({ kpi: x.kpi, mode: "value", v: String(x.value ?? ""), reason: "" })}>
                      {card.frozen ? "Correct" : "Enter"}
                    </Button>
                  )}
                </div>
                <div className="h-1.5 rounded bg-muted">
                  <div className={cn("h-1.5 rounded", bar(x.score))} style={{ width: `${Math.min(100, (x.score ?? 0) / 1.2)}%` }} />
                </div>
                {x.note && <p className="text-xs text-muted-foreground">{x.note}</p>}
                {edit?.kpi === x.kpi && (
                  <div className="flex flex-wrap items-center gap-2 rounded border p-2" data-kpi-edit>
                    <Input aria-label={edit.mode === "target" ? "New target" : "Value"} type="number" className="h-8 w-28" value={edit.v} onChange={(e) => setEdit({ ...edit, v: e.target.value })} />
                    <Input aria-label="Reason" placeholder={edit.mode === "target" ? "Why this person's target differs" : "Why (needed once the month is closed)"} className="h-8 w-72" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />
                    <Button
                      size="xs"
                      disabled={busy}
                      onClick={async () => {
                        const r =
                          edit.mode === "target"
                            ? await act(() => A.setTargetAction({ userId: card.userId, kpi: x.kpi, period: card.period, target: Number(edit.v), reason: edit.reason }))
                            : await act(() => A.enterValueAction({ userId: card.userId, kpi: x.kpi, period: card.period, value: Number(edit.v), note: edit.reason }));
                        if (r) (toast.success(r === "pending" ? "Sent to HR to approve" : "Saved"), setEdit(null));
                      }}
                    >
                      Save
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setEdit(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TeamView({ cards, period }: { cards: Scorecard[]; period: string }) {
  return (
    <Card data-team-scorecards>
      <CardHeader>
        <CardTitle className="text-base">Team scorecards {period}</CardTitle>
        <CardDescription>
          Open a person to see each KPI, set their own targets or enter typed-in numbers.{" "}
          <a className="text-primary hover:underline" href={`/api/performance?period=${period}`}>
            <DownloadIcon className="inline size-3" /> Spreadsheet
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Person</th>
              <th>Template</th>
              {["Score", "Rating"].map((h) => (
                <th key={h}>{h}</th>
              ))}
              <th className="hidden md:table-cell">KRAs</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.userId} className="border-t">
                <td className="py-1.5">
                  <Link className="font-medium hover:underline" href={`/performance?person=${c.userId}&period=${period}`}>
                    {c.name}
                  </Link>
                </td>
                <td className="text-muted-foreground">{c.template}</td>
                <td className={cn("font-semibold tabular-nums", colour(c.score))}>{c.score ?? "-"}</td>
                <td>{c.rating ?? "-"}</td>
                <td className="hidden text-xs text-muted-foreground md:table-cell">{c.kras.map((k) => `${k.name} ${k.score ?? "-"}`).join(" · ")}</td>
              </tr>
            ))}
            {!cards.length && (
              <tr>
                <td colSpan={5} className="py-3 text-muted-foreground">
                  Nobody yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function CompanyView({ data }: { data: { period: string; departments: { department: string; people: number; score: number; ratings: Record<string, number> }[]; ratings: string[]; kpis: { key: string; name: string; unit: string; value: number | null; sample: number; previous: number | null }[]; people: number } }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2" data-company-scorecard>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Departments and calibration</CardTitle>
          <CardDescription>Average score and how many people in each rating; a department with nobody below or everyone above may need its targets checked.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Department</th>
                <th>People</th>
                <th>Average</th>
                {data.ratings.map((r) => (
                  <th key={r}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.departments.map((d) => (
                <tr key={d.department} className="border-t">
                  <td className="py-1.5">{d.department}</td>
                  <td className="tabular-nums">{d.people}</td>
                  <td className={cn("font-semibold tabular-nums", colour(d.score))}>{d.score}</td>
                  {data.ratings.map((r) => (
                    <td key={r} className="tabular-nums">
                      {d.ratings[r] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company KPIs {data.period}</CardTitle>
          <CardDescription>Each measure over everyone, against last month.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {data.kpis.map((k) => (
            <div key={k.key} className="flex items-center gap-2">
              <span className="flex-1">{k.name}</span>
              <span className="tabular-nums">{fmt(k.value, k.unit)}</span>
              <span className="w-24 text-right text-xs text-muted-foreground">last {fmt(k.previous, k.unit)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OKRs
// ---------------------------------------------------------------------------

type KR = { id: string; title: string; kind: string; start_value: number; target: number; current: number; unit: string | null; kpi_key: string | null; confidence: string | null; score: number; tasks: { total: number; done: number } };
type Obj = { id: string; level: OkrLevel; scope: string | null; owner_id: string | null; owner: string | null; title: string; parent_id: string | null; visibility: string; score: number | null; reflection: string | null; krs: KR[] };
type Cycle = { id: string; name: string; start_date: string; end_date: string; status: string };

export function Okrs({ cycles, cycleId, tree, me, departments, measures, canCycle }: { cycles: Cycle[]; cycleId: string | null; tree: Obj[]; me: string; departments: { key: string; title: string }[]; measures: { key: string; name: string }[]; canCycle: boolean }) {
  const router = useRouter();
  const { act, busy } = useAct();
  const [o, setO] = React.useState<{ level: OkrLevel; scope: string; title: string; parentId: string; visibility: string } | null>(null);
  const [cy, setCy] = React.useState<{ name: string; start: string; end: string } | null>(null);
  const kids = (id: string | null) => tree.filter((x) => (x.parent_id ?? null) === id || (id === null && x.parent_id && !tree.some((p) => p.id === x.parent_id)));
  return (
    <div className="space-y-4" data-okrs>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Cycle" className={select} value={cycleId ?? ""} onChange={(e) => router.push(`/performance?tab=okrs&cycle=${e.target.value}`)}>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.start_date} to {c.end_date})
            </option>
          ))}
          {!cycles.length && <option value="">No cycle yet</option>}
        </select>
        {canCycle && (
          <Button size="sm" variant="outline" onClick={() => setCy({ name: "", start: "", end: "" })}>
            <PlusIcon /> New cycle
          </Button>
        )}
        {cycleId && (
          <Button size="sm" onClick={() => setO({ level: "person", scope: me, title: "", parentId: "", visibility: "everyone" })}>
            <PlusIcon /> New objective
          </Button>
        )}
      </div>
      {cy && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2" data-cycle-form>
          <Input aria-label="Cycle name" placeholder="Q1 2027" className="w-40" value={cy.name} onChange={(e) => setCy({ ...cy, name: e.target.value })} />
          <Input aria-label="First day" type="date" className="w-40" value={cy.start} onChange={(e) => setCy({ ...cy, start: e.target.value })} />
          <Input aria-label="Last day" type="date" className="w-40" value={cy.end} onChange={(e) => setCy({ ...cy, end: e.target.value })} />
          <Button size="sm" disabled={busy} onClick={async () => { const id = await act(() => A.saveCycleAction(cy), "Cycle opened"); if (id) (setCy(null), router.push(`/performance?tab=okrs&cycle=${id}`)); }}>
            Open the cycle
          </Button>
        </div>
      )}
      {o && cycleId && (
        <div className="grid gap-2 rounded-lg border border-primary/30 p-3 sm:grid-cols-2" data-objective-form>
          <select aria-label="Level" className={select} value={o.level} onChange={(e) => setO({ ...o, level: e.target.value as OkrLevel, scope: e.target.value === "person" ? me : e.target.value === "department" ? (departments[0]?.key ?? "") : "" })}>
            {(Object.keys(OKR_LEVELS) as OkrLevel[]).map((l) => (
              <option key={l} value={l}>
                {OKR_LEVELS[l]}
              </option>
            ))}
          </select>
          {o.level === "department" && (
            <select aria-label="Department" className={select} value={o.scope} onChange={(e) => setO({ ...o, scope: e.target.value })}>
              {departments.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.title}
                </option>
              ))}
            </select>
          )}
          <Input aria-label="Objective" placeholder="What we want to achieve" className="sm:col-span-2" value={o.title} onChange={(e) => setO({ ...o, title: e.target.value })} />
          <select aria-label="Supports" className={select} value={o.parentId} onChange={(e) => setO({ ...o, parentId: e.target.value })}>
            <option value="">Supports no other objective</option>
            {tree.map((x) => (
              <option key={x.id} value={x.id}>
                Supports: {x.title}
              </option>
            ))}
          </select>
          <select aria-label="Who sees it" className={select} value={o.visibility} onChange={(e) => setO({ ...o, visibility: e.target.value })}>
            <option value="everyone">Everyone sees it</option>
            <option value="department">The department</option>
            <option value="private">Only me and my lead</option>
          </select>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !o.title.trim()} onClick={async () => (await act(() => A.saveObjectiveAction({ cycleId, level: o.level, scope: o.scope || null, title: o.title, parentId: o.parentId || null, visibility: o.visibility }), "Objective set")) && setO(null)}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setO(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!tree.length && cycleId && <p className="text-sm text-muted-foreground">No objectives yet in this cycle.</p>}
      {!cycles.length && <p className="text-sm text-muted-foreground">No cycle yet. {canCycle ? "Open one with New cycle (a quarter is usual)." : "HR or the owners open one, usually each quarter."}</p>}
      <div className="space-y-2">
        {kids(null).map((x) => (
          <ObjectiveCard key={x.id} o={x} tree={tree} depth={0} measures={measures} />
        ))}
      </div>
    </div>
  );
}

function ObjectiveCard({ o, tree, depth, measures }: { o: Obj; tree: Obj[]; depth: number; measures: { key: string; name: string }[] }) {
  const { act, busy } = useAct();
  const [kr, setKr] = React.useState<{ title: string; kind: string; start: string; target: string; unit: string; kpiKey: string } | null>(null);
  const [ci, setCi] = React.useState<{ id: string; value: string; confidence: Confidence; note: string } | null>(null);
  const [link, setLink] = React.useState<{ id: string; code: string } | null>(null);
  const children = tree.filter((x) => x.parent_id === o.id);
  return (
    <div style={{ marginLeft: depth * 20 }} className="space-y-2">
      <Card data-objective={o.title}>
        <CardContent className="space-y-2 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-1.5 text-xs">{OKR_LEVELS[o.level]}{o.level === "department" && o.scope ? `: ${o.scope}` : ""}</span>
            <span className="flex-1 font-medium">{o.title}</span>
            <span className="text-xs text-muted-foreground">{o.owner}</span>
            <span className={cn("w-12 text-right font-semibold tabular-nums", colour(o.score === null ? null : o.score * 100))}>{o.score === null ? "-" : `${Math.round(o.score * 100)}%`}</span>
          </div>
          {o.krs.map((k) => (
            <div key={k.id} className="space-y-1 rounded border p-2" data-kr={k.title}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1">{k.title}</span>
                <span className="text-xs tabular-nums">
                  {k.kind === "milestone" ? (k.current >= 1 ? "done" : "not yet") : `${k.current} of ${k.target}${k.unit ? ` ${k.unit}` : ""}`}
                  {k.kpi_key && " · moves by itself"}
                </span>
                {k.confidence && <span className={cn("rounded px-1.5 text-xs", k.confidence === "off_track" ? "bg-red-500/15 text-red-700" : k.confidence === "at_risk" ? "bg-amber-500/15 text-amber-800" : "bg-emerald-500/15 text-emerald-700")}>{CONFIDENCE[k.confidence as Confidence]}</span>}
                {k.tasks.total > 0 && (
                  <span className="text-xs text-muted-foreground">
                    tasks {k.tasks.done}/{k.tasks.total}
                  </span>
                )}
                <Button size="xs" variant="ghost" onClick={() => setCi({ id: k.id, value: String(k.current), confidence: (k.confidence as Confidence) ?? "on_track", note: "" })}>
                  Check in
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setLink({ id: k.id, code: "" })}>
                  Link a task
                </Button>
              </div>
              <div className="h-1.5 rounded bg-muted">
                <div className={cn("h-1.5 rounded", bar(k.score * 100))} style={{ width: `${k.score * 100}%` }} />
              </div>
              {ci?.id === k.id && (
                <div className="flex flex-wrap items-center gap-2" data-checkin>
                  <Input aria-label="Value now" type="number" className="h-8 w-24" value={ci.value} onChange={(e) => setCi({ ...ci, value: e.target.value })} />
                  <select aria-label="Confidence" className={cn(select, "h-8")} value={ci.confidence} onChange={(e) => setCi({ ...ci, confidence: e.target.value as Confidence })}>
                    {(Object.keys(CONFIDENCE) as Confidence[]).map((c) => (
                      <option key={c} value={c}>
                        {CONFIDENCE[c]}
                      </option>
                    ))}
                  </select>
                  <Input aria-label="Note" placeholder="What changed, what blocks it" className="h-8 w-64" value={ci.note} onChange={(e) => setCi({ ...ci, note: e.target.value })} />
                  <Button size="xs" disabled={busy} onClick={async () => (await act(() => A.checkInAction(k.id, { value: Number(ci.value), confidence: ci.confidence, note: ci.note }), "Checked in")) && setCi(null)}>
                    Save
                  </Button>
                </div>
              )}
              {link?.id === k.id && (
                <div className="flex items-center gap-2">
                  <Input aria-label="Task code" placeholder="Task code, e.g. WEB-12" className="h-8 w-48" value={link.code} onChange={(e) => setLink({ ...link, code: e.target.value })} />
                  <Button size="xs" disabled={busy || !link.code.trim()} onClick={async () => (await act(() => A.linkTaskAction(k.id, link.code), "Task linked")) && setLink(null)}>
                    Link
                  </Button>
                </div>
              )}
            </div>
          ))}
          {kr ? (
            <div className="flex flex-wrap items-center gap-2 rounded border border-dashed p-2" data-kr-form>
              <Input aria-label="Key result" placeholder="Measurable result" className="h-8 w-64" value={kr.title} onChange={(e) => setKr({ ...kr, title: e.target.value })} />
              <select aria-label="Kind" className={cn(select, "h-8")} value={kr.kind} onChange={(e) => setKr({ ...kr, kind: e.target.value })}>
                <option value="number">A number</option>
                <option value="milestone">Done or not</option>
              </select>
              {kr.kind === "number" && (
                <>
                  <Input aria-label="Start" type="number" className="h-8 w-20" value={kr.start} onChange={(e) => setKr({ ...kr, start: e.target.value })} />
                  <Input aria-label="Target" type="number" className="h-8 w-20" value={kr.target} onChange={(e) => setKr({ ...kr, target: e.target.value })} />
                  <Input aria-label="Unit" placeholder="unit" className="h-8 w-20" value={kr.unit} onChange={(e) => setKr({ ...kr, unit: e.target.value })} />
                  <select aria-label="Moves with" className={cn(select, "h-8")} value={kr.kpiKey} onChange={(e) => setKr({ ...kr, kpiKey: e.target.value })}>
                    <option value="">Updated by check-ins</option>
                    {measures.map((m) => (
                      <option key={m.key} value={m.key}>
                        Moves with: {m.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <Button size="xs" disabled={busy || !kr.title.trim()} onClick={async () => (await act(() => A.saveKeyResultAction({ objectiveId: o.id, title: kr.title, kind: kr.kind, start: Number(kr.start), target: Number(kr.target), unit: kr.unit, kpiKey: kr.kpiKey || null }), "Key result added")) && setKr(null)}>
                Add
              </Button>
            </div>
          ) : (
            <Button size="xs" variant="outline" onClick={() => setKr({ title: "", kind: "number", start: "0", target: "", unit: "", kpiKey: "" })}>
              <PlusIcon /> Key result
            </Button>
          )}
        </CardContent>
      </Card>
      {children.map((c) => (
        <ObjectiveCard key={c.id} o={c} tree={tree} depth={depth + 1} measures={measures} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library, periods and settings (HR)
// ---------------------------------------------------------------------------

export function Library({ kpis, templates, measures }: { kpis: KpiDef[]; templates: Template[]; measures: { key: string; name: string; area: string }[] }) {
  const { act, busy } = useAct();
  const [t, setT] = React.useState<{ id: string | null; name: string; appliesTo: string; kras: TemplateKra[] } | null>(null);
  const [k, setK] = React.useState<{ name: string; source: "measure" | "manual"; measure: string; unit: string; direction: "up" | "down"; quality: boolean; meta?: Record<string, string | null> } | null>(null);
  return (
    <div className="grid gap-4 xl:grid-cols-2" data-library>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">KRA templates</CardTitle>
          <CardDescription>Per role or position (role:editing, lead:editing, dept:dev:lead, support:agent, * for everyone else). KRA weights add up to 100, and the KPIs in each KRA too.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {templates.map((x) => (
            <div key={x.id} className="rounded border p-2" data-template-row={x.name}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{x.name}</span>
                <span className="text-xs text-muted-foreground">{x.appliesTo.join(", ")}</span>
                <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setT({ id: x.id, name: x.name, appliesTo: x.appliesTo.join(", "), kras: structuredClone(x.kras) })}>
                  Edit
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{x.kras.map((r) => `${r.name} ${r.weight}%: ${r.kpis.map((p) => `${kpis.find((d) => d.key === p.kpi)?.name ?? p.kpi} (${p.target})`).join(", ")}`).join(" · ")}</p>
            </div>
          ))}
          {!t && (
            <Button size="sm" variant="outline" onClick={() => setT({ id: null, name: "", appliesTo: "", kras: [{ name: "Delivery", weight: 100, kpis: [{ kpi: "tasks_done", weight: 100, target: 10 }] }] })}>
              <PlusIcon /> New template
            </Button>
          )}
          {t && (
            <div className="space-y-2 rounded-lg border border-primary/30 p-2" data-template-form>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input aria-label="Template name" placeholder="Editor" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
                <Input aria-label="For" placeholder="role:editing, dept:dev:member" value={t.appliesTo} onChange={(e) => setT({ ...t, appliesTo: e.target.value })} />
              </div>
              {t.kras.map((r, i) => (
                <div key={i} className="space-y-1 rounded border p-2">
                  <div className="flex gap-2">
                    <Input aria-label="KRA" className="h-8" value={r.name} onChange={(e) => setT({ ...t, kras: t.kras.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <Input aria-label="KRA weight" type="number" className="h-8 w-20" value={r.weight} onChange={(e) => setT({ ...t, kras: t.kras.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} />
                    <Button size="xs" variant="ghost" onClick={() => setT({ ...t, kras: t.kras.filter((_, j) => j !== i) })}>
                      Remove
                    </Button>
                  </div>
                  {r.kpis.map((p, n) => (
                    <div key={n} className="flex gap-2 pl-4">
                      <select aria-label="KPI" className={cn(select, "h-8 flex-1")} value={p.kpi} onChange={(e) => setT({ ...t, kras: t.kras.map((x, j) => (j === i ? { ...x, kpis: x.kpis.map((y, m) => (m === n ? { ...y, kpi: e.target.value } : y)) } : x)) })}>
                        {kpis.map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <Input aria-label="KPI weight" type="number" className="h-8 w-20" value={p.weight} onChange={(e) => setT({ ...t, kras: t.kras.map((x, j) => (j === i ? { ...x, kpis: x.kpis.map((y, m) => (m === n ? { ...y, weight: Number(e.target.value) } : y)) } : x)) })} />
                      <Input aria-label="Default target" type="number" className="h-8 w-24" value={p.target} onChange={(e) => setT({ ...t, kras: t.kras.map((x, j) => (j === i ? { ...x, kpis: x.kpis.map((y, m) => (m === n ? { ...y, target: Number(e.target.value) } : y)) } : x)) })} />
                      <Button size="xs" variant="ghost" onClick={() => setT({ ...t, kras: t.kras.map((x, j) => (j === i ? { ...x, kpis: x.kpis.filter((_, m) => m !== n) } : x)) })}>
                        ✕
                      </Button>
                    </div>
                  ))}
                  <Button size="xs" variant="ghost" className="ml-4" onClick={() => setT({ ...t, kras: t.kras.map((x, j) => (j === i ? { ...x, kpis: [...x.kpis, { kpi: kpis[0]?.key ?? "", weight: 0, target: 0 }] } : x)) })}>
                    <PlusIcon /> KPI
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="xs" variant="outline" onClick={() => setT({ ...t, kras: [...t.kras, { name: "", weight: 0, kpis: [] }] })}>
                  <PlusIcon /> KRA
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    const r = (await act(() => A.saveTemplateAction({ id: t.id, name: t.name, appliesTo: t.appliesTo.split(",").map((x) => x.trim()), kras: t.kras }), "Template saved")) as { warnings: string[] } | undefined;
                    if (r) (r.warnings.forEach((w) => toast.warning(w)), setT(null));
                  }}
                >
                  Save template
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setT(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">KPIs</CardTitle>
          <CardDescription>Most come from what the app records; some are typed in by leads. Rates need a minimum sample before they count.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {kpis.map((x) => (
            <div key={x.key} className="flex items-center gap-2">
              <span className="flex-1">
                {x.name} {x.quality && <span className="rounded bg-muted px-1 text-[10px]">quality</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {x.source === "manual" ? "typed in" : (measures.find((m) => m.key === x.measure)?.area ?? "")} · {x.direction === "up" ? "higher is better" : "lower is better"}
                {x.minSample ? ` · min ${x.minSample}` : ""}
              </span>
            </div>
          ))}
          {k ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-primary/30 p-2" data-kpi-form>
              <Input aria-label="KPI name" placeholder="Name" className="h-8 w-48" value={k.name} onChange={(e) => setK({ ...k, name: e.target.value })} />
              <select aria-label="From" className={cn(select, "h-8")} value={k.source} onChange={(e) => setK({ ...k, source: e.target.value as "manual" })}>
                <option value="manual">Typed in</option>
                <option value="measure">From the app</option>
              </select>
              {k.source === "measure" && (
                <select aria-label="Measure" className={cn(select, "h-8")} value={k.measure} onChange={(e) => setK({ ...k, measure: e.target.value })}>
                  {measures.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
              <select aria-label="Unit" className={cn(select, "h-8")} value={k.unit} onChange={(e) => setK({ ...k, unit: e.target.value })}>
                {["count", "percent", "hours", "days", "minutes", "money", "score"].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <select aria-label="Direction" className={cn(select, "h-8")} value={k.direction} onChange={(e) => setK({ ...k, direction: e.target.value as "up" })}>
                <option value="up">Higher is better</option>
                <option value="down">Lower is better</option>
              </select>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={k.quality} onChange={(e) => setK({ ...k, quality: e.target.checked })} /> quality
              </label>
              <details className="w-full text-xs" data-kpi-sheet>
                <summary className="cursor-pointer">Reference sheet (international KPI dictionary)</summary>
                <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                  <select aria-label="Perspective" className={cn(select, "h-8")} value={k.meta?.perspective ?? ""} onChange={(e) => setK({ ...k, meta: { ...k.meta, perspective: e.target.value || null } })}>
                    <option value="">Balanced Scorecard perspective</option>
                    <option value="financial">Financial and sustainability</option>
                    <option value="customer">Learners, schools and partners</option>
                    <option value="process">Internal processes</option>
                    <option value="learning">People, learning and growth</option>
                  </select>
                  <select aria-label="Frequency" className={cn(select, "h-8")} value={k.meta?.frequency ?? ""} onChange={(e) => setK({ ...k, meta: { ...k.meta, frequency: e.target.value || null } })}>
                    <option value="">How often it is reported</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="semiannual">Every six months</option>
                    <option value="annual">Yearly</option>
                  </select>
                  <Input aria-label="Formula" placeholder="Formula, e.g. on-time tasks ÷ tasks with a due date × 100" className="h-8" value={k.meta?.formula ?? ""} onChange={(e) => setK({ ...k, meta: { ...k.meta, formula: e.target.value } })} />
                  <Input aria-label="Data source" placeholder="Data source, e.g. the work app" className="h-8" value={k.meta?.dataSource ?? ""} onChange={(e) => setK({ ...k, meta: { ...k.meta, dataSource: e.target.value } })} />
                  <Input aria-label="KPI owner" placeholder="Owner (role), e.g. Head of production" className="h-8" value={k.meta?.owner ?? ""} onChange={(e) => setK({ ...k, meta: { ...k.meta, owner: e.target.value } })} />
                  <Input aria-label="Why it matters" placeholder="Why it matters" className="h-8" value={k.meta?.rationale ?? ""} onChange={(e) => setK({ ...k, meta: { ...k.meta, rationale: e.target.value } })} />
                </div>
              </details>
              <Button size="xs" disabled={busy || !k.name.trim()} onClick={async () => (await act(() => A.saveKpiAction(k), "KPI saved")) && setK(null)}>
                Save
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="mt-2" onClick={() => setK({ name: "", source: "manual", measure: measures[0]?.key ?? "", unit: "count", direction: "up", quality: false })}>
              <PlusIcon /> New KPI
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function Periods({ periods, pending, cfg, current }: { periods: { period: string; status: string; closed_at: string | null; by: string | null }[]; pending: { targets: { id: string; name: string; kpi_key: string; period: string; target: number; reason: string | null; by: string | null }[]; values: { id: string; name: string | null; kpi_key: string; period: string; value: number; note: string | null; by: string | null }[] }; cfg: PerfConfig; current: string }) {
  const { act, busy } = useAct();
  const [c, setC] = React.useState(cfg);
  const last = new Date(Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const [close, setClose] = React.useState(last);
  return (
    <div className="grid gap-4 xl:grid-cols-2" data-periods>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">To approve</CardTitle>
          <CardDescription>Target changes to a month already started, and corrections to a closed month.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[...pending.targets.map((t) => ({ kind: "target" as const, id: t.id, text: `${t.name}: ${t.kpi_key} target ${t.target} in ${t.period}`, why: t.reason, by: t.by })), ...pending.values.map((v) => ({ kind: "value" as const, id: v.id, text: `${v.name ?? ""}: ${v.kpi_key} = ${v.value} in ${v.period}`, why: v.note, by: v.by }))].map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-2 rounded border p-2" data-pending={x.kind}>
              <span className="flex-1">
                {x.text}
                <span className="block text-xs text-muted-foreground">
                  {x.by}: {x.why}
                </span>
              </span>
              <Button size="xs" disabled={busy} onClick={() => act(() => A.decideChangeAction(x.kind, x.id, true), "Approved")}>
                Approve
              </Button>
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => act(() => A.decideChangeAction(x.kind, x.id, false), "Refused")}>
                Refuse
              </Button>
            </div>
          ))}
          {!pending.targets.length && !pending.values.length && <p className="text-muted-foreground">Nothing waits.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Months</CardTitle>
          <CardDescription>Closing a month freezes its scorecards; later changes need your approval.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Input aria-label="Month to close" type="month" className="w-44" max={last} value={close} onChange={(e) => setClose(e.target.value)} />
            <Button size="sm" disabled={busy} onClick={() => act(() => A.closePeriodAction(close), `${close} closed`)}>
              Close the month
            </Button>
          </div>
          {periods.map((p) => (
            <div key={p.period} className="flex items-center gap-2">
              <span className="w-20 font-mono">{p.period}</span>
              <span className="flex-1 text-muted-foreground">
                {p.status}
                {p.closed_at ? ` · ${p.closed_at.slice(0, 10)}${p.by ? ` by ${p.by}` : " automatically"}` : ""}
              </span>
              {p.status === "closed" && (
                <Button size="xs" variant="ghost" disabled={busy} onClick={() => window.confirm(`Reopen ${p.period}? Its scorecards will be computed again.`) && act(() => A.reopenPeriodAction(p.period), "Reopened")}>
                  Reopen
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <Switch checked={c.enabled} onCheckedChange={(v) => setC({ ...c, enabled: v })} aria-label="Performance on" /> Performance on
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={c.staffSeeOwn} onCheckedChange={(v) => setC({ ...c, staffSeeOwn: v })} aria-label="Staff see their own scorecard" /> Everyone sees their own scorecard (off: leads and HR only, while targets are tuned)
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="pc-close">Last month closes by itself on day</Label>
              <Input id="pc-close" type="number" min={0} max={28} value={c.closeDay} onChange={(e) => setC({ ...c, closeDay: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pc-red">A KPI is red below</Label>
              <Input id="pc-red" type="number" value={c.redBelow} onChange={(e) => setC({ ...c, redBelow: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pc-day">OKR check-in reminder</Label>
              <select id="pc-day" className={cn(select, "w-full")} value={c.checkinDay} onChange={(e) => setC({ ...c, checkinDay: Number(e.target.value) })}>
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Ratings (from score)</Label>
            {c.ratings.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label="Rating label" className="h-8 w-40" value={r.label} onChange={(e) => setC({ ...c, ratings: c.ratings.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <Input aria-label="From score" type="number" className="h-8 w-24" value={r.min} onChange={(e) => setC({ ...c, ratings: c.ratings.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })} />
              </div>
            ))}
          </div>
          <Button disabled={busy} onClick={() => act(() => A.savePerfConfigAction(c), "Saved")}>
            Save settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
