import { getViewer } from "@/server/auth";
import { readAttachment } from "@/server/corr/delivery";
import { getDoc } from "@/server/corr/documents";
import { audit } from "@/server/corr/core";

// Downloads an attachment for someone who may see its letter (each download is in the letter's history).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in first.", { status: 401 });
  const a = await readAttachment((await params).id);
  if (!a || !(await getDoc(viewer, a.document_id).catch(() => null))) return new Response("Not found.", { status: 404 });
  await audit(viewer, a.document_id, "attachment.downloaded", { name: a.name });
  return new Response(new Uint8Array(a.data), {
    headers: { "Content-Type": a.mime, "Content-Disposition": `attachment; filename="${a.name.replace(/["\r\n]/g, "_")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
