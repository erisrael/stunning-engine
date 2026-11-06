import { requireViewer } from "@/server/auth";
import {
  getLegacyCmsConfig,
  listLegacyCmsRecords,
  getLegacyCmsStats,
  getCmsRoleVisibility,
  LEGACY_CMS_CATEGORIES,
  type LegacyCmsCategory,
} from "@/server/legacy-cms";
import { can } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { LegacyCmsClient } from "./legacy-cms-client";

export const metadata = { title: "Noor Ethiopia CMS (Legacy)" };

export default async function LegacyCmsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  const isAdmin = can(viewer, "users.manage") || can(viewer, "settings.manage");
  const visibility = await getCmsRoleVisibility();

  // Determine allowed categories for current user
  let allowedCategories: LegacyCmsCategory[] = LEGACY_CMS_CATEGORIES.map((c) => c.key);
  if (!isAdmin) {
    const set = new Set<LegacyCmsCategory>();
    for (const r of viewer.roles) {
      const allowed = visibility[r] || [];
      allowed.forEach((cat) => set.add(cat));
    }
    // Fallback if none matched
    if (set.size > 0) {
      allowedCategories = Array.from(set);
    } else {
      allowedCategories = ["students", "parents"];
    }
  }

  const requestedCategory = sp.category as LegacyCmsCategory;
  const initialCategory: LegacyCmsCategory =
    allowedCategories.includes(requestedCategory) ? requestedCategory : allowedCategories[0] || "students";

  const config = await getLegacyCmsConfig();
  const initialRecords = await listLegacyCmsRecords(initialCategory, { limit: 100 });
  const stats = await getLegacyCmsStats();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Legacy CMS Integration"
        description="Synchronized database mirror of cms.noorethiopia.com. Search students, parents, invoices, and subscriptions."
      />
      <LegacyCmsClient
        config={config}
        initialCategory={initialCategory}
        initialRecords={initialRecords}
        stats={stats}
        isAdmin={isAdmin}
        allowedCategories={allowedCategories}
        visibility={visibility}
      />
    </div>
  );
}
