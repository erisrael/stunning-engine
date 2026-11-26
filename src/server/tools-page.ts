// What every Tools page needs first: the person, their apps, and a redirect when the app is not theirs.
import { redirect } from "next/navigation";
import { requireViewer } from "./auth";
import { toolsFor } from "./tools";
import type { ToolApp } from "@/lib/tools";

export async function toolsPage(app: ToolApp | "hub") {
  const viewer = await requireViewer();
  if (viewer.previewBy) redirect("/dashboard?denied=private");
  const tools = await toolsFor(viewer);
  if (app === "hub" ? !tools.apps.length : !tools.apps.some((a) => a.key === app)) redirect("/dashboard?denied=permission");
  return { viewer, tools, nav: tools.apps.map((a) => ({ key: a.key, label: a.label, href: a.href })) };
}
