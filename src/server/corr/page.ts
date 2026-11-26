// What every Correspondence page needs first: the person, and a redirect when they have no Correspondence rights.
import { redirect } from "next/navigation";
import { requireViewer } from "../auth";
import { corrCan, hasCorrespondence } from "./core";

export async function corrPage() {
  const viewer = await requireViewer();
  if (!hasCorrespondence(viewer)) redirect("/dashboard?denied=permission");
  const extra = (c: string) => (viewer.perms as string[]).includes(c) || corrCan(viewer, "admin");
  const rights = { create: corrCan(viewer, "create"), issue: corrCan(viewer, "issue"), viewAll: corrCan(viewer, "view_all"), directory: corrCan(viewer, "directory"), admin: corrCan(viewer, "admin"), audit: corrCan(viewer, "audit"), template: extra("corr.template"), workflow: extra("corr.workflow"), stamp: extra("corr.stamp") };
  return { viewer, rights };
}
