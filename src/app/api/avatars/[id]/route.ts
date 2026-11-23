import { getViewerFast } from "@/server/auth";
import { avatarImage } from "@/server/profiles";

// A person's profile photo, for anyone signed in who may see them. The address carries the version, so it is cached.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewerFast();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const img = await avatarImage(viewer, decodeURIComponent((await params).id));
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.data), { headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
