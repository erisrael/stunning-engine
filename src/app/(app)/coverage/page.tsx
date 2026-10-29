import Link from "next/link";
import { requireCapability } from "@/server/auth";
import { taxonomy } from "@/server/queries";
import { structureRows, type StructureRow } from "@/server/structure";
import { scopeAllowsGradeSubject } from "@/server/users";
import { fmtPct } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard, PageHeader } from "@/components/app/primitives";
import { StructureReport } from "@/components/app/structure-report";
import { cn } from "@/lib/utils";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";
import { PageImport } from "@/components/app/page-import";

export const metadata = { title: "Curriculum coverage" };

function band(p: number) {
  if (p >= 0.75) return "bg-[var(--seq-4)] text-white";
  if (p >= 0.5) return "bg-[var(--seq-3)] text-white";
  if (p >= 0.25) return "bg-[var(--seq-2)] text-foreground";
  if (p > 0) return "bg-[var(--seq-1)] text-foreground";
  return "bg-muted text-muted-foreground";
}

type Cell = { units: number; parts: number; recorded: number; edited: number; published: number; inProcess: number; done: Record<Stage, number> };
type Lens = "overall" | Stage;

function summarize(rows: StructureRow[]): Cell {
  const parts = rows.filter((r) => r.partId);
  const done = Object.fromEntries(STAGES.map((s) => [s, parts.filter((r) => r.stages[s] === "done").length])) as Record<Stage, number>;
  return {
    units: new Set(rows.map((r) => r.unitId)).size,
    parts: parts.length,
    recorded: done.recording,
    edited: done.editing,
    published: done.publication,
    inProcess: parts.filter((r) => Object.values(r.stages).includes("in_process")).length,
    done,
  };
}

// Share shown in a cell: one stage's done share, or the average across the four stages.
function share(c: Cell, lens: Lens) {
  if (!c.parts) return 0;
  if (lens === "overall") return STAGES.reduce((a, s) => a + c.done[s], 0) / (c.parts * STAGES.length);
  return c.done[lens] / c.parts;
}

export default async function CoveragePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireCapability("nav.coverage");
  const sp = await searchParams;
  const tab = sp.tab === "structure" ? "structure" : "matrix";
  const mode = sp.mode === "subject" ? "subject" : "grade";
  const lens: Lens = STAGES.includes(sp.stage as Stage) ? (sp.stage as Stage) : "overall";
  const tax = await taxonomy();
  const rows = await structureRows(viewer);
  const grades = tax.grades.filter((g) => g.active && rows.some((r) => r.gradeId === g.id));
  const subjects = tax.subjects.filter((s) => s.active && rows.some((r) => r.subjectId === s.id));
  const total = summarize(rows);
  const offered = (g: string, s: string) => tax.gradeSubjects.some((x) => x.grade_id === g && x.subject_id === s) && scopeAllowsGradeSubject(viewer, g, s);
  const rowAxis = mode === "grade" ? grades : subjects;
  const colAxis = mode === "grade" ? subjects : grades;
  const tabHref = (t: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), tab: t, ...extra });
    return `/coverage?${p}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Curriculum coverage"
        description="Every unit and part of the curriculum against production. A part counts as recorded once its Recording stage is done, and published once it is live."
        actions={<PageImport viewer={viewer} page="curriculum" label="Import curriculum" />}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Units" value={total.units.toLocaleString()} definition={{ definition: "Units in the curriculum for the grades and subjects in your access." }} />
        <MetricCard label="Parts" value={total.parts.toLocaleString()} definition={{ definition: "Planned parts (lessons) across those units." }} />
        <MetricCard
          label="Recorded"
          value={total.recorded.toLocaleString()}
          hint={fmtPct(total.parts ? total.recorded / total.parts : 0)}
          tone="success"
          definition={{ definition: "Parts whose Recording stage is complete.", denominator: "Parts", sample: total.parts }}
        />
        <MetricCard label="In process" value={total.inProcess.toLocaleString()} definition={{ definition: "Parts currently in one of the four stages." }} />
        <MetricCard
          label="Published"
          value={total.published.toLocaleString()}
          hint={fmtPct(total.parts ? total.published / total.parts : 0)}
          definition={{ definition: "Parts that are live on every required destination.", denominator: "Parts", sample: total.parts }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b">
        {[
          ["matrix", "Matrix"],
          ["structure", "Units and parts"],
        ].map(([k, l]) => (
          <Link key={k} href={tabHref(k)} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {l}
          </Link>
        ))}
      </div>

      {tab === "matrix" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{mode === "grade" ? "Grade by subject" : "Subject by grade"}</CardTitle>
              <CardDescription>
                Shading shows {lens === "overall" ? "the overall share of stage work done (all four stages)" : `the share of parts with ${STAGE_LABELS[lens]} done`}. Click a cell to see its units and parts.
              </CardDescription>
            </div>
            <div className="flex flex-wrap rounded-lg border p-0.5 text-xs">
              {(["overall", ...STAGES] as Lens[]).map((k) => (
                <Link key={k} href={tabHref("matrix", { stage: k })} className={cn("rounded-md px-2.5 py-1 font-medium", lens === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {k === "overall" ? "Overall" : STAGE_LABELS[k]}
                </Link>
              ))}
            </div>
            <div className="flex rounded-lg border p-0.5 text-xs">
              {[
                ["grade", "Grade → Subject"],
                ["subject", "Subject → Grade"],
              ].map(([k, l]) => (
                <Link key={k} href={tabHref("matrix", { mode: k })} className={cn("rounded-md px-2.5 py-1 font-medium", mode === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {l}
                </Link>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-card px-2 text-left text-xs font-medium text-muted-foreground">{mode === "grade" ? "Grade" : "Subject"}</th>
                    {colAxis.map((c) => (
                      <th key={c.id} className="px-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowAxis.map((r) => (
                    <tr key={r.id}>
                      <th className="sticky left-0 bg-card px-2 text-left text-sm font-medium whitespace-nowrap">{r.name}</th>
                      {colAxis.map((c) => {
                        const g = mode === "grade" ? r.id : c.id;
                        const s = mode === "grade" ? c.id : r.id;
                        if (!offered(g, s))
                          return (
                            <td key={c.id} className="rounded-md bg-muted/30 p-2 text-center text-xs text-muted-foreground/60">
                              -
                            </td>
                          );
                        const cell = summarize(rows.filter((x) => x.gradeId === g && x.subjectId === s));
                        const p = share(cell, lens);
                        return (
                          <td key={c.id} className="p-0">
                            <Link
                              href={tabHref("structure", { grade: g, subject: s, mode })}
                              className={cn("block min-w-24 rounded-md p-2 transition-opacity hover:opacity-85", band(p))}
                              title={`${cell.units} units, ${cell.parts} parts: ${cell.recorded} recorded, ${cell.edited} edited, ${cell.published} published`}
                            >
                              <span className="block text-sm font-semibold tabular">{cell.parts ? fmtPct(p) : "No parts"}</span>
                              <span className="block text-[11px] tabular opacity-90">
                                {lens === "overall" ? `${cell.recorded}/${cell.parts} recorded` : `${cell.done[lens]}/${cell.parts} ${STAGE_LABELS[lens].toLowerCase()} done`}
                              </span>
                              <span className="block text-[11px] tabular opacity-90">
                                {cell.units} units · {cell.published} live
                              </span>
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{lens === "overall" ? "Overall" : STAGE_LABELS[lens]} done share:</span>
              {[
                ["0%", "bg-muted"],
                ["1-24%", "bg-[var(--seq-1)]"],
                ["25-49%", "bg-[var(--seq-2)]"],
                ["50-74%", "bg-[var(--seq-3)]"],
                ["75%+", "bg-[var(--seq-4)]"],
              ].map(([l, c]) => (
                <span key={l} className="flex items-center gap-1">
                  <span className={cn("size-3 rounded-sm", c)} />
                  {l}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <StructureReport
          rows={rows}
          grades={grades.map((g) => ({ id: g.id, name: g.name }))}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
          defaultMode="grade"
          defaultView="table"
        />
      )}
    </div>
  );
}
