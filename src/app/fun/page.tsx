import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { funFor } from "@/server/fun";
import { FunApp } from "./fun-app";

// Myseed Fun on its own: the Fun window as a full page that can be installed (Add to Home Screen, or Install in the
// browser). It still needs the person's Myseed sign-in; nothing is kept on the device but the app's own files.
export const metadata = { title: "Myseed Fun", manifest: "/fun.webmanifest", appleWebApp: { capable: true, title: "Myseed Fun" } };

export default async function FunPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/fun");
  const on = !viewer.previewBy && !!(await funFor(viewer).catch(() => null));
  return <FunApp name={viewer.name} on={on} />;
}
