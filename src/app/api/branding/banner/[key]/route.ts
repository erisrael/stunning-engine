import { getViewer } from "@/server/auth";
import { bannerImage } from "@/server/branding";

// A section's banner picture (Admin, Branding), for anyone signed in. The URL carries the version, so it is cached.
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!(await getViewer())) return new Response("Sign in required", { status: 401 });
  const img = await bannerImage(decodeURIComponent((await params).key));
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.data), { headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
