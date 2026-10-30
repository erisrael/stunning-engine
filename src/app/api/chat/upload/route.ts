import { getViewer } from "@/server/auth";
import { get } from "@/server/db";
import { putDatabaseBlob } from "@/server/storage";

// Step 2 of an upload when files are kept in the database: the browser sends the bytes here.
// (With Supabase Storage the browser uploads straight to the signed URL instead.)
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (viewer.previewBy) return new Response("Not available in View as", { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const f = await get<{ uploader_id: string; storage: string; size: number; message_id: string | null; deleted_at: string | null }>(
    "SELECT uploader_id, storage, size, message_id, deleted_at FROM chat_files WHERE id = ?",
    id,
  );
  if (!f || f.deleted_at) return new Response("Not found", { status: 404 });
  if (f.uploader_id !== viewer.id) return new Response("Not allowed", { status: 403 });
  if (f.storage !== "database" || f.message_id) return new Response("This upload is closed", { status: 409 });
  const data = new Uint8Array(await request.arrayBuffer());
  // The size was declared when the upload was prepared; a little slack covers encryption overhead.
  if (!data.length || data.length > Number(f.size) + 64) return new Response("The file does not match the declared size", { status: 400 });
  await putDatabaseBlob(id, data);
  return Response.json({ ok: true });
}
