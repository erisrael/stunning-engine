import { eligibleQuestionRecipients } from "@/server/question-routing";
import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import {
  getLegacyCmsConfigForUser,
  publicCmsConfig,
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

  // Determine allowed categories for current user (checks per-user overrides first)
  const allowedCategories:LegacyCmsCategory[]=[...new Set((await Promise.all(viewer.roles.map(role=>allowedCategoriesForUser(role,viewer.id)))).flat())];

  if (!allowedCategories.length) redirect("/dashboard?denied=permission");
  const requestedCategory = sp.category as LegacyCmsCategory;
  const initialCategory: LegacyCmsCategory =
    allowedCategories.includes(requestedCategory) ? requestedCategory : allowedCategories[0] || "students";

  const config = publicCmsConfig(await getLegacyCmsConfigForUser(viewer));
  const [initialRecords, stats, initialRelations, initialRevenue, initialGrowth, initialStorage, allUsers] = await Promise.all([
    listLegacyCmsRecords(initialCategory, { limit: 0 }),
    getLegacyCmsStats(allowedCategories),
    allowedCategories.includes("students") && allowedCategories.includes("parents") ? getStudentParentRelations() : Promise.resolve({ relations: [], summary: { totalStudents: 0, linkedParents: 0, withPhone: 0, activeSubscriptions: 0 } }),
    allowedCategories.includes("invoices") ? getLegacyCmsRevenueAnalytics() : Promise.resolve({ summary: { totalRevenue: 0, totalPaidCount: 0, pendingApprovalRevenue: 0, pendingApprovalCount: 0, averageInvoiceValue: 0 }, byPaymentMethod: [], byStatus: [], byMonth: [], byPlan: [], invoices: [] }),
    ["students", "parents", "invoices", "subscriptions"].every(c => allowedCategories.includes(c as LegacyCmsCategory)) ? getLegacyCmsGrowthAnalytics() : Promise.resolve({ summary: { totalStudents: 0, totalParents: 0, totalInvoices: 0, activeSubscriptions: 0, conversionRate: 0 }, gradeDistribution: [], cityDemographics: [], planPopularity: [], genderBreakdown: [] }),
    getLegacyCmsStorageStatus(),
    eligibleQuestionRecipients(viewer),
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
        cmsRoles={isAdmin?await (await import("@/server/role-catalog")).roleCatalog():[]}
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
        initialStorage={initialStorage.filter(s=>allowedCategories.includes(s.category))}
        staffUsers={staffUsers}
      />
    </div>
  );
}
