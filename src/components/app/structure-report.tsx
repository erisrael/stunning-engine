"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChartColumnIcon, ChevronRightIcon, DownloadIcon, ListTreeIcon, SearchIcon, TableIcon } from "lucide-react";
import { StructureDashboard } from "@/components/app/structure-dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MultiSelect } from "@/components/app/multi-select";
import type { StructureRow } from "@/server/structure";
import { SIMPLE_STATUS_LABELS, STAGE_LABELS, STAGES, type SimpleStatus, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type ReportMode = "grade" | "subject";
export type ReportView = "table" | "tree" | "dashboard";

const CHIP: Record<SimpleStatus, string> = {
  done: "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
  in_process: "bg-[var(--st-active-bg)] text-[var(--st-active-fg)]",
  missing: "bg-[var(--st-blocked-bg)] text-[var(--st-blocked-fg)]",
  none: "bg-transparent text-muted-foreground",
};

export function SimpleChip({ status, className }: { status: SimpleStatus; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 min-w-16 items-center justify-center rounded-md px-2 text-[11px] font-semibold", CHIP[status], className)}>{SIMPLE_STATUS_LABELS[status]}</span>
  );
}

type Opt = { id: string; name: string };

const TOGGLE = "px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary";

function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  return { params, set };
}

function levels(mode: ReportMode) {
  return mode === "grade"
    ? ([
        ["gradeId", "gradeName", "Grade"],
        ["subjectId", "subjectName", "Subject"],
      ] as const)
    : ([
        ["subjectId", "subjectName", "Subject"],
        ["gradeId", "gradeName", "Grade"],
      ] as const);
}

function sortRows(rows: StructureRow[], mode: ReportMode) {
  return [...rows].sort((a, b) =>
    mode === "grade"
      ? a.gradeSort - b.gradeSort || a.subjectSort - b.subjectSort || a.unitNumber - b.unitNumber || (a.partNumber ?? 0) - (b.partNumber ?? 0)
      : a.subjectSort - b.subjectSort || a.subjectName.localeCompare(b.subjectName) || a.gradeSort - b.gradeSort || a.unitNumber - b.unitNumber || (a.partNumber ?? 0) - (b.partNumber ?? 0),
  );
}

function tally(rows: StructureRow[]) {
  const out = Object.fromEntries(STAGES.map((s) => [s, { done: 0, in_process: 0, missing: 0, none: 0 }])) as Record<Stage, Record<SimpleStatus, number>>;
  for (const r of rows) for (const s of STAGES) out[s][r.stages[s]]++;
  return out;
}

// Titles that only repeat the number ("Part 2") are not shown twice.
const partLabel = (r: StructureRow) => (!r.partId ? "No parts yet" : /^part \d+$/i.test(r.partTitle ?? "") ? `Part ${r.partNumber}` : `Part ${r.partNumber}: ${r.partTitle}`);
const unitLabel = (r: StructureRow) => (/^unit \d+$/i.test(r.unitTitle) ? `Unit ${r.unitNumber}` : `Unit ${r.unitNumber}: ${r.unitTitle}`);

export function StructureReport({
  rows,
  grades,
  subjects,
  defaultMode = "grade",
  defaultView = "table",
  allowViewToggle = true,
  heading,
}: {
  rows: StructureRow[];
  grades: Opt[];
  subjects: Opt[];
  defaultMode?: ReportMode;
  defaultView?: ReportView;
  allowViewToggle?: boolean;
  heading?: React.ReactNode;
}) {
  const { params, set } = useUrlState();
  const mode = (params.get("mode") as ReportMode) || defaultMode;
  // Phones open in the hierarchy, which needs no sideways scrolling, unless the address says otherwise.
  const [fallbackView, setFallbackView] = React.useState<ReportView>(defaultView);
  React.useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setFallbackView("tree");
  }, []);
  const view = (params.get("view") as ReportView) || fallbackView;
  // Several grades and subjects can be chosen (comma separated in the address). The second filter only
  // offers what exists in the first: subjects of the chosen grades, or grades of the chosen subjects.
  const list = (k: string) => (params.get(k) ?? "").split(",").filter((x) => x && x !== "all");
  const pickedGrades = list("grade");
  const pickedSubjects = list("subject");
  const gradeOptions = mode === "subject" && pickedSubjects.length ? grades.filter((g) => rows.some((r) => r.gradeId === g.id && pickedSubjects.includes(r.subjectId))) : grades;
  const subjectOptions = mode === "grade" && pickedGrades.length ? subjects.filter((x) => rows.some((r) => r.subjectId === x.id && pickedGrades.includes(r.gradeId))) : subjects;
  const gradeSet = pickedGrades.filter((g) => gradeOptions.some((o) => o.id === g));
  const subjectSet = pickedSubjects.filter((x) => subjectOptions.some((o) => o.id === x));
  const status = params.get("status") ?? "all";
  const [q, setQ] = React.useState(params.get("q") ?? "");

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sortRows(
      rows.filter((r) => {
        if (gradeSet.length && !gradeSet.includes(r.gradeId)) return false;
        if (subjectSet.length && !subjectSet.includes(r.subjectId)) return false;
        if (status !== "all") {
          const [st, v] = status.split(":") as [Stage | "any", SimpleStatus];
          if (st === "any" ? !STAGES.some((s) => r.stages[s] === v) : r.stages[st] !== v) return false;
        }
        if (needle && !`${r.unitTitle} ${r.partTitle ?? ""} ${r.itemCode ?? ""} ${r.cameraCodes.join(" ")}`.toLowerCase().includes(needle)) return false;
        return true;
      }),
      mode,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the sets derive from the address
  }, [rows, gradeSet.join(), subjectSet.join(), status, q, mode]);

  const totals = tally(filtered.filter((r) => r.partId));
  const parts = filtered.filter((r) => r.partId).length;

  const download = () => {
    const [l1, l2] = levels(mode);
    const head = [l1[2], l2[2], "Unit", "Part", "Item code", "Camera codes", ...STAGES.map((s) => STAGE_LABELS[s])];
    const lines = filtered.map((r) => [r[l1[1]], r[l2[1]], unitLabel(r), partLabel(r), r.itemCode ?? "", r.cameraCodes.join(" "), ...STAGES.map((s) => SIMPLE_STATUS_LABELS[r.stages[s]])]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `status-${mode === "grade" ? "by-grade" : "by-subject"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {heading}
        <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && set({ mode: v })} aria-label="Structure">
          <ToggleGroupItem value="grade" className={TOGGLE}>
            Grade → Subject
          </ToggleGroupItem>
          <ToggleGroupItem value="subject" className={TOGGLE}>
            Subject → Grade
          </ToggleGroupItem>
        </ToggleGroup>
        {allowViewToggle && (
          <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && set({ view: v })} aria-label="Layout">
            <ToggleGroupItem value="table" className={TOGGLE} aria-label="Table">
              <TableIcon /> Table
            </ToggleGroupItem>
            <ToggleGroupItem value="tree" className={TOGGLE} aria-label="Hierarchy">
              <ListTreeIcon /> Hierarchy
            </ToggleGroupItem>
            <ToggleGroupItem value="dashboard" className={TOGGLE} aria-label="Dashboard">
              <ChartColumnIcon /> Dashboard
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(mode === "grade" ? ["grade", "subject"] : ["subject", "grade"]).map((k) =>
            k === "grade" ? (
              <MultiSelect
                key={k}
                label="Grade"
                placeholder="All grades"
                options={gradeOptions.map((g) => ({ value: g.id, label: g.name }))}
                value={gradeSet}
                onChange={(v) => set({ grade: v.join(",") })}
                align="end"
              />
            ) : (
              <MultiSelect
                key={k}
                label="Subject"
                placeholder="All subjects"
                options={subjectOptions.map((x) => ({ value: x.id, label: x.name }))}
                value={subjectSet}
                onChange={(v) => set({ subject: v.join(",") })}
                align="end"
              />
            ),
          )}
          <Select value={status} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger size="sm" className="h-8 w-44 text-xs" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="any:missing">Anything missing</SelectItem>
              <SelectItem value="any:in_process">Anything in process</SelectItem>
              {STAGES.flatMap((s) =>
                (["done", "in_process", "missing"] as SimpleStatus[]).map((v) => (
                  <SelectItem key={`${s}:${v}`} value={`${s}:${v}`}>
                    {STAGE_LABELS[s]}: {SIMPLE_STATUS_LABELS[v]}
                  </SelectItem>
                )),
              )}
            </SelectContent>
          </Select>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => set({ q: q.trim() || null })}
              placeholder="Unit, part or camera code"
              className="h-8 w-56 pl-7 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8" onClick={download}>
            <DownloadIcon /> CSV
          </Button>
        </div>
      </div>

      <div className={cn("grid grid-cols-2 gap-2 lg:grid-cols-4", view === "dashboard" && "hidden")}>
        {STAGES.map((s) => {
          const t = totals[s];
          return (
            <div key={s} className="rounded-lg border bg-card p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold">{STAGE_LABELS[s]}</span>
                <span className="text-xs text-muted-foreground tabular">
                  {t.done}/{parts} done
                </span>
              </div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                <span className="bg-[var(--st-done-fg)]" style={{ width: `${parts ? (t.done / parts) * 100 : 0}%` }} />
                <span className="bg-[var(--st-active-fg)]" style={{ width: `${parts ? (t.in_process / parts) * 100 : 0}%` }} />
                <span className="bg-[var(--st-blocked-fg)]/70" style={{ width: `${parts ? (t.missing / parts) * 100 : 0}%` }} />
              </div>
              <div className="mt-1.5 flex gap-3 text-[11px] text-muted-foreground tabular">
                <span>{t.in_process} in process</span>
                <span>{t.missing} missing</span>
              </div>
            </div>
          );
        })}
      </div>

      {!filtered.length ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">Nothing matches these filters.</div>
      ) : view === "dashboard" ? (
        <StructureDashboard rows={filtered} mode={mode} />
      ) : view === "table" ? (
        <MergedTable rows={filtered} mode={mode} />
      ) : (
        <Hierarchy rows={filtered} mode={mode} />
      )}
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">Done</span> stage complete, <span className="font-medium">In process</span> the part is in this stage now, <span className="font-medium">Missing</span> nothing recorded yet,{" "}
        <span className="font-medium">-</span> not reached yet.
      </p>
    </div>
  );
}

// Grade (or subject), then subject (or grade), then unit cells span the rows that belong to them.
function MergedTable({ rows, mode }: { rows: StructureRow[]; mode: ReportMode }) {
  const router = useRouter();
  const [l1, l2] = levels(mode);
  const span = (i: number, key: (r: StructureRow) => string) => {
    if (i > 0 && key(rows[i - 1]) === key(rows[i])) return 0;
    let n = 1;
    while (i + n < rows.length && key(rows[i + n]) === key(rows[i])) n++;
    return n;
  };
  const k1 = (r: StructureRow) => r[l1[0]];
  const k2 = (r: StructureRow) => `${r[l1[0]]}|${r[l2[0]]}`;
  const k3 = (r: StructureRow) => `${k2(r)}|${r.unitId}`;
  return (
    <div className="overflow-auto rounded-lg border bg-card" style={{ maxHeight: "calc(100dvh - 18rem)" }}>
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="w-28 border-b px-3 py-2">{l1[2]}</th>
            <th className="w-40 border-b px-3 py-2">{l2[2]}</th>
            <th className="w-64 border-b px-3 py-2">Unit</th>
            <th className="border-b px-3 py-2">Part</th>
            {STAGES.map((s) => (
              <th key={s} className="w-28 border-b px-2 py-2 text-center">
                {STAGE_LABELS[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const s1 = span(i, k1);
            const s2 = span(i, k2);
            const s3 = span(i, k3);
            const groupStart = s1 > 0;
            return (
              <tr
                key={`${r.unitId}-${r.partId ?? "u"}`}
                className={cn("hover:[&>td.cell]:bg-muted/40", r.itemId && "cursor-pointer")}
                onClick={(e) => r.itemId && !(e.target instanceof Element && e.target.closest("a,button")) && router.push(`/items/${r.itemId}/form`)}
              >
                {s1 > 0 && (
                  <td rowSpan={s1} className={cn("border-r border-b bg-card px-3 py-2 align-top font-semibold", groupStart && i > 0 && "border-t-2 border-t-border")}>
                    {r[l1[1]]}
                  </td>
                )}
                {s2 > 0 && (
                  <td rowSpan={s2} className="border-r border-b bg-card px-3 py-2 align-top font-medium">
                    {r[l2[1]]}
                  </td>
                )}
                {s3 > 0 && (
                  <td rowSpan={s3} className="border-r border-b bg-card px-3 py-2 align-top">
                    <span className="text-xs text-muted-foreground">Unit {r.unitNumber}</span>
                    {!/^unit \d+$/i.test(r.unitTitle) && <span className="block">{r.unitTitle}</span>}
                  </td>
                )}
                <td className="cell border-b px-3 py-1.5">
                  {r.partId ? (
                    <span className="flex flex-wrap items-center gap-x-2">
                      {r.itemId ? (
                        <Link href={`/items/${r.itemId}/form`} className="hover:text-primary hover:underline">
                          {partLabel(r)}
                        </Link>
                      ) : (
                        <span>{partLabel(r)}</span>
                      )}
                      {r.cameraCodes.length > 0 && <span className="font-mono text-[10px] text-muted-foreground">{r.cameraCodes.join(" ")}</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No parts yet</span>
                  )}
                </td>
                {STAGES.map((s) => (
                  <td key={s} className="cell border-b px-2 py-1.5 text-center">
                    <SimpleChip status={r.stages[s]} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ rows }: { rows: StructureRow[] }) {
  const parts = rows.filter((r) => r.partId);
  const t = tally(parts);
  return (
    <span className="ml-auto hidden items-center gap-1.5 sm:flex">
      {STAGES.map((s) => (
        <span key={s} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular" title={`${STAGE_LABELS[s]}: ${t[s].done} done, ${t[s].in_process} in process, ${t[s].missing} missing`}>
          <span className="font-semibold">{STAGE_LABELS[s].slice(0, 3)}</span>
          {t[s].done}/{parts.length}
        </span>
      ))}
    </span>
  );
}

function Hierarchy({ rows, mode }: { rows: StructureRow[]; mode: ReportMode }) {
  const [l1, l2] = levels(mode);
  const [open, setOpen] = React.useState<Set<string>>(() => new Set());
  const toggle = (k: string) => setOpen((o) => new Set(o.has(k) ? [...o].filter((x) => x !== k) : [...o, k]));
  const group = <T,>(list: StructureRow[], key: (r: StructureRow) => string, make: (k: string, rs: StructureRow[]) => T) => {
    const m = new Map<string, StructureRow[]>();
    for (const r of list) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return [...m.entries()].map(([k, rs]) => make(k, rs));
  };
  const allKeys = () => {
    const ks = new Set<string>();
    for (const r of rows) {
      ks.add(r[l1[0]]);
      ks.add(`${r[l1[0]]}|${r[l2[0]]}`);
      ks.add(`${r[l1[0]]}|${r[l2[0]]}|${r.unitId}`);
    }
    return ks;
  };
  const row = ({ k, depth, label, sub, rs }: { k: string; depth: number; label: React.ReactNode; sub?: string; rs: StructureRow[] }) => (
    <button onClick={() => toggle(k)} className="flex w-full items-center gap-2 border-b px-3 py-2 text-left hover:bg-muted/40" style={{ paddingLeft: 12 + depth * 20 }}>
      <ChevronRightIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open.has(k) && "rotate-90")} />
      <span className={cn("truncate", depth === 0 ? "font-semibold" : depth === 1 ? "font-medium" : "")}>{label}</span>
      {sub && <span className="shrink-0 text-xs text-muted-foreground">{sub}</span>}
      <Summary rows={rs} />
    </button>
  );
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
        <Button variant="ghost" size="xs" onClick={() => setOpen(allKeys())}>
          Expand all
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setOpen(new Set())}>
          Collapse all
        </Button>
      </div>
      {group(rows, (r) => r[l1[0]], (k1, rs1) => (
        <div key={k1}>
          {row({ k: k1, depth: 0, label: rs1[0][l1[1]], sub: `${new Set(rs1.map((r) => r[l2[0]])).size} ${l2[2].toLowerCase()}s`, rs: rs1 })}
          {open.has(k1) &&
            group(rs1, (r) => r[l2[0]], (k2, rs2) => {
              const key2 = `${k1}|${k2}`;
              return (
                <div key={key2}>
                  {row({ k: key2, depth: 1, label: rs2[0][l2[1]], sub: `${new Set(rs2.map((r) => r.unitId)).size} units`, rs: rs2 })}
                  {open.has(key2) &&
                    group(rs2, (r) => r.unitId, (k3, rs3) => {
                      const key3 = `${key2}|${k3}`;
                      const u = rs3[0];
                      return (
                        <div key={key3}>
                          {row({ k: key3, depth: 2, label: unitLabel(u), sub: u.partId ? `${rs3.length} parts` : "no parts", rs: rs3 })}
                          {open.has(key3) &&
                            rs3.map((r) => (
                              <div key={r.partId ?? r.unitId} className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-1.5 text-sm" style={{ paddingLeft: 12 + 3 * 20 + 16 }}>
                                <span className="min-w-0 flex-1 truncate">
                                  {r.itemId ? (
                                    <Link href={`/items/${r.itemId}/form`} className="hover:text-primary hover:underline">
                                      {partLabel(r)}
                                    </Link>
                                  ) : (
                                    <span className={cn(!r.partId && "text-muted-foreground italic")}>{partLabel(r)}</span>
                                  )}
                                  {r.cameraCodes.length > 0 && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{r.cameraCodes.join(" ")}</span>}
                                </span>
                                <span className="flex gap-1">
                                  {STAGES.map((s) => (
                                    <span key={s} className="flex flex-col items-center">
                                      <span className="text-[9px] text-muted-foreground uppercase">{STAGE_LABELS[s].slice(0, 3)}</span>
                                      <SimpleChip status={r.stages[s]} className="min-w-14" />
                                    </span>
                                  ))}
                                </span>
                              </div>
                            ))}
                        </div>
                      );
                    })}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
