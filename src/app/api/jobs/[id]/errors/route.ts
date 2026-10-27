import { getViewer } from "@/server/auth";
import { get } from "@/server/db";
import { csvEscape } from "@/server/exporter";
import { isManager } from "@/server/users";

// Row-level error file: the original columns plus the error message, ready to fix and re-import.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const { id } = await params;
  const job = await get<{ actor_id: string; report: string | null; file_name: string | null }>("SELECT actor_id, report, file_name FROM jobs WHERE id = ?", id);
  if (!job) return new Response("Not found", { status: 404 });
  if (job.actor_id !== viewer.id && !isManager(viewer)) return new Response("Not allowed", { status: 403 });
  const report = JSON.parse(job.report ?? "{}") as { outcomes?: { row: number; action: string; errors: string[] }[]; headers?: string[]; rows?: string[][] };
  const headers = report.headers ?? [];
  const lines = [[...headers, "import_row", "import_errors"].map(csvEscape).join(",")];
  for (const o of report.outcomes ?? []) {
    if (o.action !== "error") continue;
    const original = report.rows?.[o.row - 2] ?? [];
    lines.push([...original, String(o.row), o.errors.join(" | ")].map(csvEscape).join(","));
  }
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="errors-${(job.file_name ?? id).replace(/\.[a-z]+$/i, "")}.csv"` },
  });
}
