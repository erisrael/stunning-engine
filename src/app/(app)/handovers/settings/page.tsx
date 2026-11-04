import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { crossCheckCount } from "@/server/editorial";
import { handoverConfig } from "@/server/handover-config";
import { can } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { HandoverNav } from "../handover-nav";
import { HandoverSettings } from "./settings-client";

export const metadata = { title: "Handover settings" };

export default async function HandoverSettingsPage() {
  const viewer = await requireViewer();
  if (!can(viewer, "settings.manage") && !can(viewer, "users.manage")) redirect("/dashboard?denied=permission");
  const [cfg, count] = await Promise.all([handoverConfig(), crossCheckCount(viewer)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Handover settings" description="Whether a rejection is cross-checked and by whom, the priority rejected work comes back with, and whether booking a studio is needed." />
      <HandoverNav settings rejected={count} />
      <HandoverSettings config={cfg} />
    </div>
  );
}
