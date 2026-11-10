import { eligibleQuestionRecipients } from "@/server/question-routing";
import { redirect } from "next/navigation";
import { BarChart3Icon, DatabaseIcon, DollarSignIcon, FileCheck2Icon, LayersIcon, RadioIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
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
  allowedCategoriesForUser,
  type LegacyCmsCategory,
} from "@/server/legacy-cms";
import { canReviewInvoices } from "@/server/cms-invoices";
import { can } from "@/server/users";
import { PageHeader, PageTabs, type PageTab } from "@/components/app/page-kit";
import { CmsLiveView } from "@/components/app/legacy-cms/live-view";
import { CmsInvoicesView } from "@/components/app/legacy-cms/invoices-view";
import { CmsReportsView } from "@/components/app/legacy-cms/reports-view";
import { LegacyCmsClient } from "./legacy-cms-client";

export const metadata = { title: "Noor Ethiopia CMS (Legacy)" };

// Views: the date-first ones (Live, Invoices, Reports) are separate components; the older ones (Tables & sync,
// Contacts, Revenue, Growth, Storage) are views of the earlier client, which loads its data only when shown.
const OLD = { tables: "subpages", contacts: "relations", revenue: "revenue", growth: "growth", storage: "storage" } as const;
type View = "live" | "invoices" | "reports" | keyof typeof OLD;

export default async function LegacyCmsPage({ searchParams }: { searchParams: Promise<{ category?: string; view?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  const isAdmin = can(viewer, "users.manage") || can(viewer, "settings.manage");
  const allowedCategories: LegacyCmsCategory[] = [...new Set((await Promise.all(viewer.roles.map((role) => allowedCategoriesForUser(role, viewer.id)))).flat())];
  if (!allowedCategories.length) redirect("/dashboard?denied=permission");
  const has = (...c: LegacyCmsCategory[]) => c.every((x) => allowedCategories.includes(x));
  const canReview = has("invoices") && canReviewInvoices(viewer);
  const canSchedule = can(viewer, "finance.access") || can(viewer, "users.manage");

  const tabs: PageTab[] = [
    { key: "live", label: "Live", icon: <RadioIcon /> },
    { key: "invoices", label: "Invoices", icon: <FileCheck2Icon />, hidden: !canReview },
    { key: "reports", label: "Reports", icon: <BarChart3Icon /> },
    { key: "tables", label: "Tables & sync", icon: <LayersIcon /> },
    { key: "contacts", label: "Contacts", icon: <UsersIcon />, hidden: !has("students", "parents") },
    { key: "revenue", label: "Revenue", icon: <DollarSignIcon />, hidden: !has("invoices") },
    { key: "growth", label: "Growth", icon: <TrendingUpIcon />, hidden: !has("students", "parents", "invoices", "subscriptions") },
    { key: "storage", label: "Storage & snapshots", icon: <DatabaseIcon /> },
  ];
  const requested = tabs.find((t) => t.key === sp.view && !t.hidden)?.key as View | undefined;
  const view: View = requested ?? "live";
  const requestedCategory = sp.category as LegacyCmsCategory;
  const initialCategory: LegacyCmsCategory = allowedCategories.includes(requestedCategory) ? requestedCategory : allowedCategories.includes("invoices") ? "invoices" : allowedCategories[0];

  let body: React.ReactNode;
  if (view === "live") body = <CmsLiveView categories={allowedCategories} canReview={canReview} initialCategory={initialCategory} />;
  else if (view === "invoices") body = <CmsInvoicesView />;
  else if (view === "reports") {
    const { listGroups } = await import("@/server/chat");
    const groups = canSchedule ? (await listGroups(viewer).catch(() => [])).filter((g) => g.kind !== "direct" && g.canPost).map((g) => ({ id: g.id, name: g.name })) : [];
    body = <CmsReportsView categories={allowedCategories} canSchedule={canSchedule} isAdmin={can(viewer, "data.manage") || can(viewer, "users.manage")} chatGroups={groups} />;
  } else body = await oldView(view, viewer, allowedCategories, initialCategory, isAdmin);

  return (
    <div className="space-y-4">
      <PageHeader title="Legacy CMS" description="Noor Ethiopia CMS: live data by date, invoice verification, reports, and the synchronized mirror." />
      <PageTabs tabs={tabs} active={view} href={(k) => `/legacy-cms?view=${k}`} label="Legacy CMS views" />
      {body}
    </div>
  );
}

async function oldView(view: keyof typeof OLD, viewer: Awaited<ReturnType<typeof requireViewer>>, allowedCategories: LegacyCmsCategory[], initialCategory: LegacyCmsCategory, isAdmin: boolean) {
  const has = (...c: LegacyCmsCategory[]) => c.every((x) => allowedCategories.includes(x));
  const emptyRevenue = { summary: { totalRevenue: 0, totalPaidCount: 0, pendingApprovalRevenue: 0, pendingApprovalCount: 0, averageInvoiceValue: 0 }, byPaymentMethod: [], byStatus: [], byMonth: [], byPlan: [], invoices: [] };
  const emptyGrowth = { summary: { totalStudents: 0, totalParents: 0, totalInvoices: 0, activeSubscriptions: 0, conversionRate: 0 }, gradeDistribution: [], cityDemographics: [], planPopularity: [], genderBreakdown: [] };
  const emptyRelations = { relations: [], summary: { totalStudents: 0, linkedParents: 0, withPhone: 0, activeSubscriptions: 0 } };
  const config = publicCmsConfig(await getLegacyCmsConfigForUser(viewer));
  const [visibility, initialRecords, stats, initialRelations, initialRevenue, initialGrowth, initialStorage, allUsers] = await Promise.all([
    getCmsRoleVisibility(),
    view === "tables" ? listLegacyCmsRecords(initialCategory, { limit: 0 }) : Promise.resolve({ rows: [], total: 0 }),
    getLegacyCmsStats(allowedCategories),
    view === "contacts" && has("students", "parents") ? getStudentParentRelations() : Promise.resolve(emptyRelations),
    view === "revenue" && has("invoices") ? getLegacyCmsRevenueAnalytics() : Promise.resolve(emptyRevenue),
    view === "growth" && has("students", "parents", "invoices", "subscriptions") ? getLegacyCmsGrowthAnalytics() : Promise.resolve(emptyGrowth),
    getLegacyCmsStorageStatus(),
    eligibleQuestionRecipients(viewer),
  ]);
  const staffUsers = allUsers.map((u) => ({ id: u.id, name: u.name, handle: u.handle, roles: u.roles, role: u.roles[0] || "staff" }));
  return (
    <LegacyCmsClient
      view={OLD[view]}
      cmsRoles={isAdmin ? await (await import("@/server/role-catalog")).roleCatalog() : []}
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
      initialStorage={initialStorage.filter((s) => allowedCategories.includes(s.category))}
      staffUsers={staffUsers}
    />
  );
}
