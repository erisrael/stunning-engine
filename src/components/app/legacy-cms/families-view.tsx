"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusStrip, ViewSwitcher } from "@/components/app/page-kit";
import { MetricCard } from "@/components/app/primitives";
import { cmsFamiliesAction, cmsToolRightsAction } from "@/app/actions/legacy-cms";
import { DataGrid, type GridTools } from "./data-grid";

type Data = Awaited<ReturnType<typeof import("@/server/cms-data-tools").cmsFamilies>>;
const KINDS = [["all", "Everyone"], ["Student with parent", "With parent"], ["Student on own", "Students on their own"], ["Parent without student", "Parents without a student"]] as const;

// Families: students merged with their parents from the saved Noor copy, plus students on their own and
// parents no student points to. Built from stored data only.
export function CmsFamiliesView() {
  const [d, setD] = React.useState<Data | null>(null);
  const [error, setError] = React.useState("");
  const [tools, setTools] = React.useState<GridTools>({ columnFilters: true, export: false, copyPhone: true });
  const [kind, setKind] = React.useState<(typeof KINDS)[number][0]>("all");
  const load = React.useCallback(async () => {
    setD(null);
    const [r, t] = await Promise.all([cmsFamiliesAction(), cmsToolRightsAction()]);
    if (t.ok && t.data) setTools(t.data);
    if (r.ok && r.data) (setD(r.data), setError(""));
    else setError(r.ok ? "" : r.error);
  }, []);
  React.useEffect(() => void load(), [load]);
  if (error) return <StatusStrip tone="danger">{error}</StatusStrip>;
  if (!d) return <StatusStrip>Merging students and parents from the saved copy…</StatusStrip>;
  const rows = kind === "all" ? d.rows : d.rows.filter((r) => r.Kind === kind);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Families" value={d.summary.families.toLocaleString()} />
        <MetricCard label="Students with a parent" value={d.summary.withParent.toLocaleString()} />
        <MetricCard label="Students on their own" value={d.summary.studentsOnOwn.toLocaleString()} />
        <MetricCard label="Parents without a student" value={d.summary.parentsOnly.toLocaleString()} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ViewSwitcher label="Who" options={KINDS} value={kind} onChange={setKind} />
        <Button size="sm" variant="ghost" className="ml-auto h-8 text-xs" onClick={load}><RefreshCwIcon /> Rebuild from the saved copy</Button>
      </div>
      <p className="text-xs text-muted-foreground">A student is matched to a parent by the parent named on the student, then by phone number. &quot;Contact phone&quot; is the parent&apos;s phone, or the student&apos;s own when there is no parent.</p>
      <DataGrid table="families" headers={d.headers} rows={rows} rowKey={(r) => r._recordId} tools={tools} empty="No students or parents are saved yet. Sync Students and Parents first." />
    </div>
  );
}
