import type { MetadataRoute } from "next";
import { fullName, identity } from "@/server/identity";

// The installed app (Add to Home Screen), with the name and icon Admin set in Branding.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const id = await identity();
  const icon = `/api/branding/favicon?v=${id.version}`;
  return {
    name: fullName(id),
    short_name: id.shortName,
    description: "Production, editorial workflow and team chat.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: id.color,
    icons: [
      { src: icon, sizes: "any", purpose: "any" },
      { src: icon, sizes: "192x192", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My work", url: "/my-work", icons: [{ src: icon, sizes: "any" }] },
      { name: "Check in", url: "/attendance", icons: [{ src: icon, sizes: "any" }] },
      { name: "Chat", url: "/chat", icons: [{ src: icon, sizes: "any" }] },
      { name: "Announcements", url: "/announcements", icons: [{ src: icon, sizes: "any" }] },
    ],
  };
}
