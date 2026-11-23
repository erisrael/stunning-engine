import fs from "node:fs/promises";
import path from "node:path";
import { identityImage } from "@/server/identity";

// The site's logo and favicon (Admin, Branding), or the Myseed mark when none is set. Public: the sign-in page and the
// browser tab need them.
// With ?v=<version> (the app always asks that way) the picture never changes at that address, so it is kept for a year.
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const cache = new URL(req.url).searchParams.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=300";
  if (kind !== "logo" && kind !== "favicon") return new Response("Not found", { status: 404 });
  const img = await identityImage(kind).catch(() => null);
  if (img)
    return new Response(new Uint8Array(img.data), {
      headers: { "Content-Type": img.mime, "Cache-Control": cache, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" },
    });
  const svg = await fs.readFile(path.join(process.cwd(), "public", "brand", "myseed-logo.svg"));
  return new Response(new Uint8Array(svg), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": cache } });
}
