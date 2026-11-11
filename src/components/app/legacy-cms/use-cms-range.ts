"use client";
import * as React from "react";
import { waitForCmsTask } from "@/lib/cms-task-client";
import { cmsTaskStatusAction } from "@/app/actions/cms-tasks";
import type { CmsRangeResult } from "@/server/cms-range";
import type { LegacyCmsCategory } from "@/lib/legacy-cms";

export type RangeQuery = { category: LegacyCmsCategory; from: string; until: string; search?: string; filters?: Record<string, string>; refresh?: boolean; dateField?: string };
export const METHOD_LABEL: Record<string, string> = { "noor-filter": "Noor date filter", "sorted-search": "Sorted range search", "full-scan": "All pages (no date filter in Noor)", mirror: "Saved copy (this table has no dates in Noor; Refresh reads it again)" };

// One date-first load at a time, run as a background CMS job. Keeps the job id so exports use exactly these rows.
export function useCmsRange() {
  const [result, setResult] = React.useState<CmsRangeResult | null>(null);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [progress, setProgress] = React.useState("");
  const [error, setError] = React.useState("");
  const run = React.useRef(0);

  // quiet: a background refresh (live updates) keeps the table on screen and shows no progress.
  const load = React.useCallback(async (q: RangeQuery, opts: { quiet?: boolean } = {}) => {
    const id = ++run.current;
    if (!opts.quiet) {
      setLoading(true);
      setProgress("Starting…");
    }
    setError("");
    try {
      const r = await waitForCmsTask<CmsRangeResult>(
        { kind: "range", ...q },
        (m) => id === run.current && !opts.quiet && setProgress(m),
        () => id !== run.current,
        (task) => id === run.current && setTaskId(task),
      );
      if (id !== run.current) return null;
      setResult(r);
      return r;
    } catch (e) {
      if (id === run.current) setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      if (id === run.current) {
        setLoading(false);
        setProgress("");
      }
    }
  }, []);

  // Stop: the job is cancelled and ends at its next Noor page.
  const stop = React.useCallback(() => {
    run.current++;
    setLoading(false);
    setProgress("");
    setError("Stopped. Load again to continue; days already fetched stay cached.");
  }, []);

  // Reopen a finished load by its job id (for example from the Live view's "Build a report").
  const open = React.useCallback(async (task: string) => {
    const r = await cmsTaskStatusAction(task);
    if (r.ok && r.data?.status === "completed" && r.data.result) {
      setTaskId(task);
      setResult(r.data.result as CmsRangeResult);
      return r.data.result as CmsRangeResult;
    }
    return null;
  }, []);

  return { result, taskId, loading, progress, error, load, stop, open, setResult };
}

export function exportHref(taskId: string, format: "xlsx" | "csv" | "pdf", spec: object) {
  const s = encodeURIComponent(JSON.stringify(spec));
  return format === "pdf" ? `/export/cms-report?task=${taskId}&spec=${s}` : `/api/legacy-cms/report?task=${taskId}&format=${format}&spec=${s}`;
}
