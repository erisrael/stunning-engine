import Link from "next/link";
import { DownloadIcon, FileSpreadsheetIcon } from "lucide-react";
import { requireViewer } from "@/server/auth";
import { all } from "@/server/db";
import { getSettings } from "@/server/settings";
import { templateInfo, templateList } from "@/server/importer";
import { userNames } from "@/server/rows";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/primitives";
import { StatusPill } from "@/components/app/status-pill";
import { ImportWizard } from "./import-wizard";
import { TrackerImport } from "./tracker-import";
import { VideoTrackerImport } from "./video-tracker-import";
import { canImportVideoTracker } from "@/server/video-tracker";
import { ExportMenu } from "@/components/app/bulk-and-export";
import { DEFAULT_CONTENT_COLUMNS } from "@/lib/columns";
import { can } from "@/server/users";
import { countItems } from "@/server/queries";
import { emptyFilters } from "@/lib/filters";
import { nowIso } from "@/server/db";

export const metadata = { title: "Import and export" };

export default async function ImportExportPage({ searchParams }: { searchParams: Promise<{ template?: string; job?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const allJobs = can(viewer, "import.run") || can(viewer, "data.manage");
  const canTracker = can(viewer, "import.tracker");
  const canVideoTracker = canImportVideoTracker(viewer);
  const canExport = can(viewer, "export.run") || can(viewer, "export.report") || can(viewer, "export.tracker") || can(viewer, "export.audit");
  const total = await countItems(viewer, emptyFilters(), nowIso());
  const tz = (await getSettings()).workspace.timezone;
  const templates = templateList(viewer).map(templateInfo);
  // Team members start on their own team's template.
  const ownTemplate = templates.find((t) => t.stage && t.stage === viewer.activeRole)?.key;
  const jobs = await all<{ id: string; kind: string; template: string | null; mode: string | null; file_name: string | null; status: string; total_rows: number; created_count: number; updated_count: number; skipped_count: number; error_count: number; actor_id: string | null; created_at: string; finished_at: string | null }>(
      `SELECT * FROM jobs ${allJobs ? "" : "WHERE actor_id = ?"} ORDER BY created_at DESC LIMIT 40`,
      ...(allJobs ? [] : [viewer.id]),
    );
  const names = await userNames();
  return (
    <div className="space-y-4">
      <PageHeader
        help="manager" title="Import and export"
        description="Bring in work done outside the app (CSV, Excel or JSON), or take data out as Excel, CSV, JSON, the tracker file or a PDF report. You only see what your role allows."
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {templates.length > 0 && <ImportWizard templates={templates} initial={sp.template ?? ownTemplate ?? (templates.some((t) => t.key === "progress") ? "progress" : undefined)} />}
          <Card>
            <CardHeader>
              <CardTitle>Job history</CardTitle>
              <CardDescription>Every import and export is kept with its counts. Imported records link back to their job in the item history.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">When</th>
                    <th className="text-left font-medium">Job</th>
                    <th className="text-left font-medium">File</th>
                    <th className="text-right font-medium">Rows</th>
                    <th className="text-right font-medium">Created</th>
                    <th className="text-right font-medium">Updated</th>
                    <th className="text-right font-medium">Errors</th>
                    <th className="text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className={`border-b last:border-0 ${sp.job === j.id ? "bg-accent/40" : ""}`}>
                      <td className="py-2 text-xs tabular">
                        {fmtDateTime(j.created_at, tz)}
                        <span className="block text-muted-foreground">{j.actor_id ? names[j.actor_id] : "System"}</span>
                      </td>
                      <td className="text-xs capitalize">
                        {j.kind} {j.template?.replace("_", " ")}
                        {j.mode && <span className="block text-muted-foreground">{j.mode}</span>}
                      </td>
                      <td className="max-w-48 truncate text-xs">{j.file_name}</td>
                      <td className="text-right tabular">{j.total_rows}</td>
                      <td className="text-right tabular">{j.created_count}</td>
                      <td className="text-right tabular">{j.updated_count}</td>
                      <td className="text-right tabular">
                        {j.error_count > 0 ? (
                          <a href={`/api/jobs/${j.id}/errors`} className="text-[var(--st-blocked-fg)] underline-offset-2 hover:underline">
                            {j.error_count}
                          </a>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="text-right">
                        <StatusPill size="xs" tone={j.status === "completed" ? "done" : j.status === "running" ? "active" : "paused"} label={j.status.replace(/_/g, " ")} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {jobs.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No jobs yet.</p>}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          {templates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Templates</CardTitle>
              <CardDescription>Excel templates include an Instructions sheet and dropdowns built from your current grades, subjects, destinations and lists.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {templates.map((t) => (
                <div key={t.key} className="rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <FileSpreadsheetIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.summary}</p>
                    </div>
                  </div>
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Rules ({t.fields.length} columns)</summary>
                    <ul className="mt-1 list-inside list-disc space-y-0.5">
                      {t.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </details>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="xs" asChild>
                      <a href={`/api/templates/${t.key}?format=xlsx`}>
                        <DownloadIcon /> Excel
                      </a>
                    </Button>
                    <Button size="xs" variant="outline" asChild>
                      <a href={`/api/templates/${t.key}?format=csv`}>CSV</a>
                    </Button>
                    <Button size="xs" variant="outline" asChild>
                      <a href={`/api/templates/${t.key}?format=json`}>JSON</a>
                    </Button>
                    {t.prefill && (
                      <Button size="xs" variant="outline" asChild>
                        <a href={`/api/templates/${t.key}?format=xlsx&prefill=1`}>{t.stage ? "My parts" : "Current data"}</a>
                      </Button>
                    )}
                    <Button size="xs" variant="ghost" asChild>
                      <Link href={`/import-export?template=${t.key}`}>Use in wizard</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          )}
          {canExport && (
            <Card>
              <CardHeader>
                <CardTitle>Export</CardTitle>
                <CardDescription>Everything in your access. For a filtered export, use Export on the List or Sheet; it keeps those filters.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <ExportMenu columns={DEFAULT_CONTENT_COLUMNS} query="" selected={[]} pageCount={Math.min(total, 50)} total={total} perms={viewer.perms} />
                  {can(viewer, "export.tracker") && (
                    <Button size="sm" variant="outline" className="h-8" asChild>
                      <a href="/api/export/tracker">
                        <DownloadIcon /> Tracker JSON
                      </a>
                    </Button>
                  )}
                  {can(viewer, "export.report") && (
                    <Button size="sm" variant="outline" className="h-8" asChild>
                      <Link href="/export/report" target="_blank">
                        PDF report
                      </Link>
                    </Button>
                  )}
                </div>
                <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                  <li>Excel and CSV: rows grouped by grade and subject with each stage&apos;s status and date.</li>
                  <li>Tracker JSON: the same structure as the Recording team&apos;s tracker, with progress added. Import it back here any time.</li>
                  <li>PDF report: a printable summary; choose grouping, filters and page size, then Save as PDF.</li>
                </ul>
                <p className="text-xs text-muted-foreground">Cells that start with =, +, - or @ are escaped so spreadsheets never run them as formulas. Media files are never exported, only their links and camera codes.</p>
              </CardContent>
            </Card>
          )}
          {canVideoTracker && (
            <Card>
              <CardHeader>
                <CardTitle>Upload team&apos;s video tracker CSV</CardTitle>
                <CardDescription>
                  A row means the edited file reached Uploading, so Recording and Editing are done. Not Started waits in Uploading, Completed means uploaded,
                  Verified means published and Missing means the file has not arrived. Duplicate rows count once. Import the curriculum tracker JSON first; parts it
                  does not list are added from here. Preview the trace before applying; running it again is safe.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VideoTrackerImport />
              </CardContent>
            </Card>
          )}
          {canTracker && (
            <Card>
              <CardHeader>
                <CardTitle>Curriculum tracker JSON</CardTitle>
                <CardDescription>
                  The Recording team&apos;s tracker file (grade, subjects, units, parts and videos). New units and parts are added, videos are logged by camera code and recorded parts move to Editing. Safe to run again.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TrackerImport />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
