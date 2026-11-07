import { requireViewer } from "@/server/auth";
import {
  getLegacyCmsConfig,
  listLegacyCmsRecords,
  getLegacyCmsStats,
  getCmsRoleVisibility,
  getStudentParentRelations,
  getLegacyCmsRevenueAnalytics,
  getLegacyCmsGrowthAnalytics,
  getLegacyCmsStorageStatus,
  LEGACY_CMS_CATEGORIES,
  allowedCategoriesForUser,
  type LegacyCmsCategory,
} from "@/server/legacy-cms";
import { can, userDirectory } from "@/server/users";
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

  // Determine allowed categories for current user (checks per-user overrides first)
  let allowedCategories: LegacyCmsCategory[] = LEGACY_CMS_CATEGORIES.map((c) => c.key);
  const userOverrideCategories = await allowedCategoriesForUser(viewer.roles[0] || "staff", viewer.id);
  if (!isAdmin) {
    allowedCategories = userOverrideCategories;
  } else if (userOverrideCategories.length < LEGACY_CMS_CATEGORIES.length) {
    allowedCategories = userOverrideCategories;
  }

  const requestedCategory = sp.category as LegacyCmsCategory;
  const initialCategory: LegacyCmsCategory =
    allowedCategories.includes(requestedCategory) ? requestedCategory : allowedCategories[0] || "students";

  const config = await getLegacyCmsConfig();
  const [initialRecords, stats, initialRelations, initialRevenue, initialGrowth, initialStorage, allUsers] = await Promise.all([
    listLegacyCmsRecords(initialCategory, { limit: 100 }),
    getLegacyCmsStats(),
    getStudentParentRelations({ limit: 150 }),
    getLegacyCmsRevenueAnalytics(),
    getLegacyCmsGrowthAnalytics(),
    getLegacyCmsStorageStatus(),
    userDirectory(),
  ]);

  const staffUsers = allUsers.map((u) => ({
    id: u.id,
    name: u.name,
    handle: u.handle,
    roles: u.roles,
    role: u.roles[0] || "staff",
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Legacy CMS Integration"
        description="Synchronized database mirror of cms.noorethiopia.com. Search students, parents, invoices, subscriptions, and revenue."
      />
      <LegacyCmsClient
        config={config}
        initialCategory={initialCategory}
        initialRecords={initialRecords}
        stats={stats}
        isAdmin={isAdmin}
        allowedCategories={allowedCategories}
        visibility={visibility}
        initialRelations={initialRelations}
        initialRevenue={initialRevenue}
        initialGrowth={initialGrowth}
        initialStorage={initialStorage}
        staffUsers={staffUsers}
      />
    </div>
  );
}
