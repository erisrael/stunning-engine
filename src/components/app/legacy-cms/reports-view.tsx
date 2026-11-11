"use client";
import * as React from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { CalendarClockIcon, GaugeIcon, PlayIcon, PlusIcon, RefreshCwIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, StatusStrip, Toolbar, ViewSwitcher } from "@/components/app/page-kit";
import { cmsPresetRange } from "@/lib/cms-filters";
import { buildCmsReport, cmsAmountColumn, CMS_GROUP_BY, type CmsGroupBy, type CmsReportSpec } from "@/lib/cms-report";
import { LEGACY_CMS_CATEGORIES, type LegacyCmsCategory } from "@/lib/legacy-cms";
import { waitForCmsTask } from "@/lib/cms-task-client";
import { cmsCapabilitiesAction, listCmsSchedulesAction, runCmsScheduleNowAction, saveCmsScheduleAction } from "@/app/actions/cms-reports";
import type { CmsSchedule } from "@/server/cms-reports";
import type { CmsTableCapability } from "@/server/cms-range";
import { ExportButtons, NoorFilters, RangePicker, useShowEc, type Period } from "./range-controls";
import { exportHref, METHOD_LABEL, useCmsRange } from "./use-cms-range";
import { CmsDashboardView } from "./dashboard-view";

const tableName = (c: string) => LEGACY_CMS_CATEGORIES.find((x) => x.key === c)?.label ?? c;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// Report builder (Update 1.0, Phase 2): table, range, filters, columns, grouping and totals, previewed here and
// exported as Excel, CSV or PDF from exactly the rows previewed. Finance and Admin can schedule reports.
export function CmsReportsView({ categories, canSchedule, isAdmin, chatGroups }: { categories: LegacyCmsCategory[]; canSchedule: boolean; isAdmin: boolean; chatGroups: { id: string; name: string }[] }) {
  const params = useSearchParams();
  const [category, setCategory] = React.useState<LegacyCmsCategory>(categories.includes("invoices") ? "invoices" : categories[0]);
  const [period, setPeriod] = React.useState<Period | null>(null);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [columns, setColumns] = React.useState<string[]>([]);
  const [groupBy, setGroupBy] = React.useState<CmsGroupBy>("day");
  const [sumColumn, setSumColumn] = React.useState<string | undefined>(undefined);
  const [title, setTitle] = React.useState("");
  const [dateField, setDateField] = React.useState("");
  const [showEc, setShowEc] = useShowEc();
  const cms = useCmsRange();
  const range = period ? cmsPresetRange(period, start, end) : null;

  // Opened from the Live view with its finished load.
  React.useEffect(() => {
    const task = params.get("task");
    if (task)
      void cms.open(task).then((r) => {
        if (!r) return toast.error("That load has expired. Load the range again.");
        setCategory(r.category);
        setPeriod("custom");
        setStart(r.from);
        setEnd(r.until);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const r = cms.result;
  React.useEffect(() => {
    if (r) setColumns((c) => (c.length && c.every((x) => r.headers.includes(x)) ? c : r.headers));
  }, [r]);
  const spec: CmsReportSpec | null = r ? { category: r.category, from: r.from, until: r.until, search, filters, columns, groupBy, sumColumn, title: title || undefined } : null;
  const report = React.useMemo(() => (r && spec ? buildCmsReport(r.records, r.headers, spec) : null), [r, columns, groupBy, sumColumn, title]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportSpec = spec ? { columns, groupBy, sumColumn, title: title || undefined, search, filters } : {};
  const hrefs = cms.taskId && r ? { xlsx: exportHref(cms.taskId, "xlsx", exportSpec), csv: exportHref(cms.taskId, "csv", exportSpec), pdf: exportHref(cms.taskId, "pdf", exportSpec) } : null;
  const stale = r && range && (r.category !== category || r.from !== range.from || r.until !== range.until);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Build a report</CardTitle>
          <CardDescription>Choose the table and dates, load a preview, then pick columns, grouping and totals. The files contain exactly the rows in the preview.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toolbar label="Report source">
            <select aria-label="Report table" value={category} onChange={(e) => (setCategory(e.target.value as LegacyCmsCategory), setFilters({}))} className="h-8 rounded-md border bg-background px-2 text-sm font-medium">
              {categories.map((c) => (
                <option key={c} value={c}>
                  {tableName(c)}
                </option>
              ))}
            </select>
            <RangePicker period={period} start={start} end={end} showEc={showEc} onShowEc={setShowEc} onChange={(v) => (setPeriod(v.period), setStart(v.start), setEnd(v.end))} />
          </Toolbar>
          <Toolbar
            label="Report filters"
            end={
              cms.loading ? (
                <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={cms.stop}>
                  <SquareIcon /> Stop
                </Button>
              ) : (
                <Button size="sm" className="h-8 text-xs" disabled={!range} onClick={() => range && void cms.load({ category, ...range, search: search.trim(), filters, dateField: dateField || undefined })}>
                  <PlayIcon /> {r ? "Load again" : "Load preview"}
                </Button>
              )
            }
          >
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in Noor (optional)" className="h-8 w-56 text-xs" aria-label="Report search" />
            {r?.category === category && !!r.dateFields?.length && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Date
                <select aria-label="Report date field" value={dateField || r.dateField || ""} onChange={(e) => setDateField(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground">
                  {r.dateFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </label>
            )}
            <NoorFilters filters={r?.category === category ? r.filters : []} values={filters} onChange={setFilters} />
          </Toolbar>
          {cms.loading && <StatusStrip><RefreshCwIcon className="size-3.5 animate-spin" /> {cms.progress || "Loading from Noor…"}</StatusStrip>}
          {cms.error && !cms.loading && <StatusStrip tone="danger">{cms.error}</StatusStrip>}
          {stale && !cms.loading && <StatusStrip tone="warning">The preview is for {tableName(r!.category)}, {r!.from} to {r!.until}. Load again to use the new choices.</StatusStrip>}
          {params.get("expired") && !r && <StatusStrip tone="warning">That report link has expired. Load the range again.</StatusStrip>}
        </CardContent>
      </Card>

      {!r ? (
        <EmptyState icon={<CalendarClockIcon className="size-5" />} title="No preview yet" description="Pick a table and a date range, then Load preview." />
      ) : (
        report && (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
              <div>
                <CardTitle className="text-base">
                  {title || `${tableName(r.category)} report`} · {r.from === r.until ? r.from : `${r.from} to ${r.until}`}
                </CardTitle>
                <CardDescription>
                  {fmt(report.totals.count)} rows{report.sumColumn ? ` · total ${report.sumColumn} ${fmt(report.totals.sum)}` : ""} · {report.groups.length} groups · {METHOD_LABEL[r.method]}
                </CardDescription>
              </div>
              <ExportButtons hrefs={hrefs} />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                <div className="space-y-3">
                  <label className="grid gap-1 text-xs font-medium">
                    Title
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${tableName(r.category)} report`} className="h-8 text-xs" />
                  </label>
                  <div className="grid gap-1 text-xs font-medium">
                    Group by
                    <ViewSwitcher label="Group by" size="xs" options={CMS_GROUP_BY} value={groupBy} onChange={setGroupBy} />
                  </div>
                  <label className="grid gap-1 text-xs font-medium">
                    Total of
                    <select value={sumColumn ?? cmsAmountColumn(r.headers) ?? ""} onChange={(e) => setSumColumn(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
                      <option value="">Count only</option>
                      {r.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="grid gap-1 text-xs">
                    <legend className="mb-1 font-medium">
                      Columns{" "}
                      <button type="button" className="ml-1 text-primary underline-offset-2 hover:underline" onClick={() => setColumns(columns.length === r.headers.length ? [] : r.headers)}>
                        {columns.length === r.headers.length ? "none" : "all"}
                      </button>
                    </legend>
                    <div className="grid max-h-56 grid-cols-2 gap-1 overflow-auto rounded-md border p-2">
                      {r.headers.map((h) => (
                        <label key={h} className="flex items-center gap-1.5 truncate">
                          <input type="checkbox" checked={columns.includes(h)} onChange={(e) => setColumns(e.target.checked ? r.headers.filter((x) => columns.includes(x) || x === h) : columns.filter((x) => x !== h))} />
                          {h}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <div className="overflow-hidden rounded-xl border">
                  <table className="w-full text-xs" aria-label="Report summary">
                    <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">{CMS_GROUP_BY.find(([k]) => k === groupBy)?.[1]}</th>
                        <th className="px-3 py-2 text-right">Rows</th>
                        {report.sumColumn && <th className="px-3 py-2 text-right">{report.sumColumn}</th>}
                        <th className="w-1/3 px-3 py-2">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.groups.slice(0, 40).map((g) => (
                        <tr key={g.key} className="border-t">
                          <td className="px-3 py-1.5 font-medium">{g.label}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(g.count)}</td>
                          {report.sumColumn && <td className="px-3 py-1.5 text-right tabular-nums">{fmt(g.sum)}</td>}
                          <td className="px-3 py-1.5">
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${report.totals.count ? (g.count / report.totals.count) * 100 : 0}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t font-semibold">
                        <td className="px-3 py-1.5">Total</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt(report.totals.count)}</td>
                        {report.sumColumn && <td className="px-3 py-1.5 text-right tabular-nums">{fmt(report.totals.sum)}</td>}
                        <td />
                      </tr>
                    </tbody>
                  </table>
                  {report.groups.length > 40 && <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Showing 40 of {report.groups.length} groups; the files have all of them.</p>}
                </div>
              </div>
              {report.groups[0] && (
                <div className="overflow-auto rounded-xl border">
                  <p className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">First rows · {report.groups[0].label}</p>
                  <table className="w-full text-xs">
                    <thead className="text-left text-[11px] text-muted-foreground">
                      <tr>
                        {report.columns.map((c) => (
                          <th key={c} className="px-2 py-1.5 whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.groups[0].rows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t">
                          {report.columns.map((c) => (
                            <td key={c} className="max-w-[16rem] truncate px-2 py-1">
                              {row[c]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )
      )}

      {canSchedule && <Schedules categories={categories} chatGroups={chatGroups} draft={r ? { category: r.category, columns, groupBy, filters, search } : null} />}
      {isAdmin && <Capabilities />}
    </div>
  );
}

const WINDOWS = [
  ["yesterday", "Yesterday"],
  ["last7", "Last 7 days"],
  ["last30", "Last 30 days"],
  ["month", "This month so far"],
] as const;
const ROLES = [
  ["finance_manager", "Finance managers"],
  ["accountant", "Accountants"],
  ["owner", "Owners"],
  ["admin", "Admins"],
] as const;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Schedules({ categories, chatGroups, draft }: { categories: LegacyCmsCategory[]; chatGroups: { id: string; name: string }[]; draft: Partial<CmsSchedule> | null }) {
  const [list, setList] = React.useState<CmsSchedule[]>([]);
  const [edit, setEdit] = React.useState<Partial<CmsSchedule> | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => void listCmsSchedulesAction().then((r) => r.ok && r.data && setList(r.data)), []);
  const save = async (input: Partial<CmsSchedule> & { remove?: boolean }) => {
    setBusy(true);
    try {
      const r = await saveCmsScheduleAction(input);
      if (!r.ok) return toast.error(r.error);
      setList(r.data ?? []);
      setEdit(null);
      toast.success(input.remove ? "Scheduled report removed" : "Scheduled report saved");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">Scheduled reports</CardTitle>
          <CardDescription>Daily or weekly, by email or team chat, with links to the PDF, Excel and CSV. Times are Addis Ababa time.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEdit({ name: "", category: draft?.category ?? categories[0], cadence: "daily", weekday: 1, hour: 7, window: "yesterday", groupBy: draft?.groupBy ?? "method", columns: draft?.columns ?? [], filters: draft?.filters ?? {}, search: draft?.search ?? "", emails: [], roles: ["finance_manager", "owner"], chatGroupId: null, active: true })}>
          <PlusIcon /> {draft ? "Schedule this report" : "New schedule"}
        </Button>
      </CardHeader>
      <CardContent>
        {!list.length ? (
          <p className="text-sm text-muted-foreground">No scheduled reports.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {s.name} {!s.active && <span className="text-xs text-muted-foreground">(paused)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tableName(s.category)} · {WINDOWS.find(([k]) => k === s.window)?.[1]} · {s.cadence === "weekly" ? `every ${DAYS[s.weekday - 1]}` : "every day"} at {String(s.hour).padStart(2, "0")}:00 · to {[...s.roles.map((r) => ROLES.find(([k]) => k === r)?.[1] ?? r), ...s.emails, ...(s.chatGroupId ? [`#${chatGroups.find((g) => g.id === s.chatGroupId)?.name ?? "team chat"}`] : [])].join(", ")}
                  </p>
                  {s.lastStatus && <p className="text-[11px] text-muted-foreground">Last run {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : ""}: {s.lastStatus}</p>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const r = await runCmsScheduleNowAction(s.id);
                    setBusy(false);
                    if (!r.ok) return toast.error(r.error);
                    toast.success(r.data?.status ?? "Sent");
                    void listCmsSchedulesAction().then((x) => x.ok && x.data && setList(x.data));
                  }}
                >
                  <PlayIcon /> Run now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(s)}>
                  Edit
                </Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label={`Remove ${s.name}`} onClick={() => confirm(`Remove "${s.name}"?`) && save({ id: s.id, remove: true })}>
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit scheduled report" : "Schedule a report"}</DialogTitle>
            <DialogDescription>Each run loads the window from Noor (closed days come from the cache) and sends the summary with links.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">
                Name
                <Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Daily invoices by payment method" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  Table
                  <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as LegacyCmsCategory })} className="h-9 rounded-md border bg-background px-2">
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {tableName(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  Covers
                  <select value={edit.window} onChange={(e) => setEdit({ ...edit, window: e.target.value as CmsSchedule["window"] })} className="h-9 rounded-md border bg-background px-2">
                    {WINDOWS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  How often
                  <select value={edit.cadence} onChange={(e) => setEdit({ ...edit, cadence: e.target.value as CmsSchedule["cadence"] })} className="h-9 rounded-md border bg-background px-2">
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                  </select>
                </label>
                {edit.cadence === "weekly" ? (
                  <label className="grid gap-1">
                    On
                    <select value={edit.weekday} onChange={(e) => setEdit({ ...edit, weekday: Number(e.target.value) })} className="h-9 rounded-md border bg-background px-2">
                      {DAYS.map((d, i) => (
                        <option key={d} value={i + 1}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span />
                )}
                <label className="grid gap-1">
                  At (hour)
                  <Input type="number" min={0} max={23} value={edit.hour ?? 7} onChange={(e) => setEdit({ ...edit, hour: Number(e.target.value) })} />
                </label>
                <label className="grid gap-1">
                  Group by
                  <select value={edit.groupBy} onChange={(e) => setEdit({ ...edit, groupBy: e.target.value as CmsGroupBy })} className="h-9 rounded-md border bg-background px-2">
                    {CMS_GROUP_BY.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset className="grid gap-1">
                <legend className="mb-1">Send to</legend>
                <div className="flex flex-wrap gap-3">
                  {ROLES.map(([k, l]) => (
                    <label key={k} className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={edit.roles?.includes(k) ?? false} onChange={(e) => setEdit({ ...edit, roles: e.target.checked ? [...(edit.roles ?? []), k] : (edit.roles ?? []).filter((x) => x !== k) })} />
                      {l}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="grid gap-1">
                Other email addresses (comma separated)
                <Input value={(edit.emails ?? []).join(", ")} onChange={(e) => setEdit({ ...edit, emails: e.target.value.split(/[,\s]+/).filter(Boolean) })} placeholder="finance@example.com" />
              </label>
              <label className="grid gap-1">
                Team chat
                <select value={edit.chatGroupId ?? ""} onChange={(e) => setEdit({ ...edit, chatGroupId: e.target.value || null })} className="h-9 rounded-md border bg-background px-2">
                  <option value="">No chat post</option>
                  {chatGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => edit && save(edit)}>
              Save schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// c1: what each Noor table supports, measured against Noor itself, and so how a date range is loaded.
function Capabilities() {
  const [caps, setCaps] = React.useState<CmsTableCapability[]>([]);
  const [progress, setProgress] = React.useState("");
  React.useEffect(() => void cmsCapabilitiesAction().then((r) => r.ok && r.data && setCaps(r.data)), []);
  const measure = async () => {
    setProgress("Starting…");
    try {
      setCaps(await waitForCmsTask<CmsTableCapability[]>({ kind: "probe" }, setProgress));
      toast.success("Noor tables measured");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress("");
    }
  };
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">How each Noor table loads by date</CardTitle>
          <CardDescription>Measured against Noor: which filters a table has, whether its date filter narrows rows, whether it sorts by created date, and its size.</CardDescription>
        </div>
        <Button size="sm" variant="outline" disabled={!!progress} onClick={measure}>
          <GaugeIcon /> {progress ? progress : caps.length ? "Measure again" : "Measure the tables"}
        </Button>
      </CardHeader>
      <CardContent>
        {!caps.length ? (
          <p className="text-sm text-muted-foreground">Not measured yet. Loading still works: each load checks the table and picks the path itself.</p>
        ) : (
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Table</th>
                  <th className="px-3 py-2">Path</th>
                  <th className="px-3 py-2">Date filter</th>
                  <th className="px-3 py-2">Sorts by</th>
                  <th className="px-3 py-2">Select filters</th>
                  <th className="px-3 py-2 text-right">Rows</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {caps.map((c) => (
                  <tr key={c.category} className="border-t">
                    <td className="px-3 py-1.5 font-medium">{tableName(c.category)}</td>
                    <td className="px-3 py-1.5">{METHOD_LABEL[c.method]}</td>
                    <td className="px-3 py-1.5">{c.dateFilter ? `${c.dateFilter}${c.dateFilterWorks === false ? " (ignored by Noor)" : ""}` : "None"}</td>
                    <td className="px-3 py-1.5">{c.sortColumn ?? "None"}</td>
                    <td className="px-3 py-1.5">{c.selects.join(", ") || "None"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{c.totalRows.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Reports: the trend dashboard (stored daily figures) and the report builder.
export function CmsReportsHome(props: React.ComponentProps<typeof CmsReportsView> & { canBuild: boolean }) {
  const params = useSearchParams();
  const [sub, setSub] = React.useState<"dashboard" | "builder">(params.get("task") || params.get("expired") ? "builder" : "dashboard");
  return (
    <div className="space-y-3">
      <ViewSwitcher label="Reports views" value={sub} onChange={setSub} options={[["dashboard", "Dashboard"], ["builder", "Build a report"]]} />
      {sub === "dashboard" ? <CmsDashboardView canBuild={props.canBuild} /> : <CmsReportsView {...props} />}
    </div>
  );
}
