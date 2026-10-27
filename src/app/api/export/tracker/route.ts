import { getViewer } from "@/server/auth";
import { can } from "@/server/users";
import { exportTrackerBackup } from "@/server/workspace-data";

// Curriculum tracker JSON (grade -> subjects -> units -> parts -> videos) with each part's stage progress.
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (!can(viewer, "export.tracker")) return new Response("Not allowed", { status: 403 });
  const data = await exportTrackerBackup(viewer);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ethio_curriculum_backup_${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
