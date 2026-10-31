import { getViewer } from "@/server/auth";
import { can } from "@/server/users";
import { readBackup, type TargetId } from "@/server/backups";
import { audit } from "@/server/workflow";
import { isBackupName } from "@/lib/backup-retention";

// Admin downloads one backup file: ?target=local|drive|s3&ref=...&name=...
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.previewBy || !can(viewer, "users.manage")) return new Response("Not allowed", { status: 403 });
  const url = new URL(request.url);
  const target = url.searchParams.get("target") as TargetId;
  const ref = url.searchParams.get("ref") ?? "";
  const name = url.searchParams.get("name") ?? "";
  if (!["local", "drive", "s3"].includes(target) || !ref || !isBackupName(name)) return new Response("Bad request", { status: 400 });
  try {
    const body = await readBackup(viewer, target, ref);
    await audit({ actor: viewer }, { action: "backup.downloaded", summary: `${viewer.name} downloaded the backup ${name}` });
    return new Response(new Uint8Array(body), { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Could not read the backup", { status: 404 });
  }
}
