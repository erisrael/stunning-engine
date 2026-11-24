import type { MetadataRoute } from "next";
import { fullName, identity } from "@/server/identity";

// The installed app (Add to Home Screen, or Install on Android and desktop Chrome), with the name and icon Admin set in
// Branding. PNG icons at the sizes Android and iOS look for (drawn from the favicon, /api/branding/app-icon), a maskable
// one for Android's shaped icons, and any orientation so tablets work in landscape too.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const id = await identity();
  const icon = `/api/branding/favicon?v=${id.version}`;
  const png = (size: number, maskable = false) => `/api/branding/app-icon?size=${size}${maskable ? "&maskable=1" : ""}&v=${id.version}`;
  return {
    name: fullName(id),
    short_name: id.shortName,
    description: "Production, editorial workflow and team chat.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#ffffff",
    theme_color: id.color,
    categories: ["business", "productivity"],
    icons: [
      { src: png(192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: png(512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: png(192, true), sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: png(512, true), sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: icon, sizes: "any", purpose: "any" },
    ],
    shortcuts: [
      { name: "My work", url: "/my-work", icons: [{ src: png(96), sizes: "96x96", type: "image/png" }] },
      { name: "Check in", url: "/attendance", icons: [{ src: png(96), sizes: "96x96", type: "image/png" }] },
      { name: "Chat", url: "/chat", icons: [{ src: png(96), sizes: "96x96", type: "image/png" }] },
      { name: "Announcements", url: "/announcements", icons: [{ src: png(96), sizes: "96x96", type: "image/png" }] },
    ],
  };
}
