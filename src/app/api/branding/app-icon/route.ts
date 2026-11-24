import fs from "node:fs/promises";
import path from "node:path";
import { createElement as h } from "react";
import { ImageResponse } from "next/og";
import { identityImage } from "@/server/identity";

// The installed app's icon as a PNG (iPhone and iPad need PNG for the home screen, Android needs 192 and 512): the
// favicon Admin set in Branding, or the Myseed mark, centred on white. ?maskable=1 leaves the wider margin Android
// needs when it cuts the icon into a circle or squircle. Public, like the favicon.
// ?size=<48..1024> (default 512). With ?v=<version> the picture never changes at that address, so it is kept for a year.
const DRAWABLE = /^image\/(png|jpe?g|svg\+xml|gif)$/;
const MARK_ZOOM = 2.2;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const size = Math.min(1024, Math.max(48, Math.round(Number(q.get("size")) || 512)));
  const maskable = q.get("maskable") === "1";
  const cache = q.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=300";
  const img = await identityImage("favicon").catch(() => null);
  const markSvg = await fs.readFile(path.join(process.cwd(), "public", "brand", "myseed-logo.svg"));
  const fallback = `data:image/svg+xml;base64,${markSvg.toString("base64")}`;
  const own = img && DRAWABLE.test(img.mime) && !img.data.equals(markSvg) ? img : null;
  const src = own ? `data:${own.mime};base64,${own.data.toString("base64")}` : fallback;
  // Apple's grid: the mark fills about 70%; Android's safe zone for maskable icons is the middle 80% circle. The Myseed
  // mark's drawing fills only about a third of its canvas, so it is drawn larger (the empty margin is cut off).
  const frac = maskable ? 0.56 : 0.7;
  const draw = (s: string, zoom: number) => {
    const mark = Math.round(size * frac * zoom);
    return new ImageResponse(
      h("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#ffffff" } }, h("img", { src: s, width: mark, height: mark, style: { objectFit: "contain" } })),
      { width: size, height: size },
    );
  };
  let png: ArrayBuffer;
  try {
    png = await draw(src, own ? 1 : MARK_ZOOM).arrayBuffer();
  } catch {
    // A picture the renderer cannot read: the Myseed mark instead.
    png = await draw(fallback, MARK_ZOOM).arrayBuffer();
  }
  return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });
}
