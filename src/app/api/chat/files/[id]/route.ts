import { getViewer } from "@/server/auth";
import { get, nowIso } from "@/server/db";
import { canManageChat } from "@/server/chat";
import { readDatabaseBlob, signedReadUrl } from "@/server/storage";

// Serves a chat file to members of its chat. Encrypted files (direct chats) are sent as they are stored and
// decrypted in the browser. Expired voice messages answer 410 Gone.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const { id } = await params;
  const f = await get<{ group_id: string; name: string | null; mime: string; storage: string; path: string; encrypted: number; expires_at: string | null; deleted_at: string | null; kind: string }>(
    "SELECT group_id, name, mime, storage, path, encrypted, expires_at, deleted_at, kind FROM chat_files WHERE id = ?",
    id,
  );
  if (!f) return new Response("Not found", { status: 404 });
  const member = await get("SELECT 1 AS x FROM chat_members WHERE group_id = ? AND user_id = ?", f.group_id, viewer.id);
  const g = await get<{ kind: string }>("SELECT kind FROM chat_groups WHERE id = ?", f.group_id);
  if (!member && !(canManageChat(viewer) && g?.kind !== "direct")) return new Response("Not allowed", { status: 403 });
  if (f.deleted_at || (f.expires_at && f.expires_at < nowIso())) return new Response(f.kind === "voice" ? "This voice message has expired" : "This file was removed", { status: 410 });
  const headers = {
    "Content-Type": f.encrypted ? "application/octet-stream" : f.mime,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    // Unencrypted files that browsers could run (SVG) are always downloaded, never shown inline.
    "Content-Disposition": `${!f.encrypted && /^(image\/(png|jpe?g|gif|webp)|audio\/|video\/|application\/pdf)/.test(f.mime) ? "inline" : "attachment"}; filename="${encodeURIComponent(f.name ?? id)}"`,
  };
  if (f.storage === "supabase") return Response.redirect(await signedReadUrl(f.path, 120), 302);
  const data = await readDatabaseBlob(id);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), { headers });
}
