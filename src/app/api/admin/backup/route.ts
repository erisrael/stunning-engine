import { getViewer } from "@/server/auth";
import { can } from "@/server/users";
import { audit } from "@/server/workflow";
import { backupSnapshot } from "@/server/workspace-data";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (!can(viewer, "data.manage")) return new Response("Not allowed", { status: 403 });
  const snapshot = await backupSnapshot();
  await audit({ actor: viewer }, { action: "workspace.backup", summary: `${viewer.name} downloaded a full backup` });
  const stamp = snapshot.createdAt.slice(0, 16).replace(/[-:T]/g, "");
  return new Response(JSON.stringify(snapshot), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="myseed-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
