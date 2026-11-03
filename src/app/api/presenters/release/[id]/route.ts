import { getViewer } from "@/server/auth";
import { readRelease } from "@/server/presenters";

// A presenter's scanned release form, for the people who manage presenters.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const f = await readRelease(viewer, (await params).id).catch(() => null);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": f.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
