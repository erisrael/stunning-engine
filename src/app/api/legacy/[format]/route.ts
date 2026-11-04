import { getViewer } from "@/server/auth";
import { canUseLegacy, legacyBackup, legacyWord } from "@/server/legacy";

// The Legacy catalog's two exports: its JSON backup, and the Word document.
export async function GET(_req: Request, { params }: { params: Promise<{ format: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (!canUseLegacy(viewer)) return new Response("Not allowed", { status: 403 });
  const { format } = await params;
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "backup")
    return new Response(JSON.stringify(await legacyBackup(viewer), null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="ethio_curriculum_backup_${stamp}.json"`, "Cache-Control": "no-store" },
    });
  if (format === "word")
    return new Response(`﻿${await legacyWord(viewer)}`, {
      headers: { "Content-Type": "application/msword", "Content-Disposition": `attachment; filename="Recorded_Video_Catalog_${stamp}.doc"`, "Cache-Control": "no-store" },
    });
  return new Response("Not found", { status: 404 });
}
