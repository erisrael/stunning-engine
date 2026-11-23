import { requireCapability } from "@/server/auth";
import { PageHeader } from "@/components/app/primitives";
import { ICON_PACKS, systemConfig } from "@/server/system-config";
import { SystemConfigClient } from "./system-config-client";

export const metadata = { title: "Configure whole system" };

// Admin, Configure whole system: the names, logo, motion and icons of the whole system, for internal admins.
export default async function ConfigureSystemPage() {
  await requireCapability("users.manage");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Configure whole system"
        description="The system's name, the name on reports and documents, the logo, and how everything moves and looks by default. Nothing changes until you confirm."
      />
      <SystemConfigClient value={await systemConfig()} packs={ICON_PACKS.map((p) => ({ ...p }))} />
    </div>
  );
}
