import { eligibleQuestionRecipients } from "@/server/question-routing";
import { redirect } from "next/navigation";
import { BarChart3Icon, DatabaseIcon, DollarSignIcon, FileCheck2Icon, RadioIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
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
  cmsViewerFlags,
  type LegacyCmsCategory,
} from "@/server/legacy-cms";
import { canReviewInvoices } from "@/server/cms-invoices";
import { can } from "@/server/users";
import { PageHeader, PageTabs, type PageTab } from "@/components/app/page-kit";
import { CmsLiveView } from "@/components/app/legacy-cms/live-view";
import { CmsInvoicesView } from "@/components/app/legacy-cms/invoices-view";
import { CmsReportsHome } from "@/components/app/legacy-cms/reports-view";
import { CmsRevenueView } from "@/components/app/legacy-cms/revenue-view";
import { CmsGrowthView } from "@/components/app/legacy-cms/growth-view";
import { LegacyCmsClient } from "./legacy-cms-client";

export const metadata = { title: "Noor Ethiopia CMS (Legacy)" };

// Views: Live (tabs per table, live from Noor or the saved copy), Invoices, Revenue, Growth and Reports are
// date-first; Contacts and Storage & snapshots are views of the earlier client, which loads only when shown.
// Tables & sync was folded into Live (Saved copy, Sync, slips, feedback) and the connection into Admin.
const OLD = { contacts: "relations", storage: "storage" } as const;
type View = "live" | "invoices" | "revenue" | "growth" | "reports" | keyof typeof OLD;

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
    { key: "revenue", label: "Revenue", icon: <DollarSignIcon />, hidden: !has("invoices") },
    { key: "growth", label: "Growth", icon: <TrendingUpIcon />, hidden: !allowedCategories.some((c) => ["students", "parents", "subscriptions"].includes(c)) },
    { key: "reports", label: "Reports", icon: <BarChart3Icon /> },
    { key: "contacts", label: "Contacts", icon: <UsersIcon />, hidden: !has("students", "parents") },
    { key: "storage", label: "Storage & snapshots", icon: <DatabaseIcon /> },
  ];
  // Old links to Tables & sync open Live.
  const requested = tabs.find((t) => t.key === (sp.view === "tables" ? "live" : sp.view) && !t.hidden)?.key as View | undefined;
  const flags = await cmsViewerFlags(viewer);
  const view: View = requested ?? "live";
  const requestedCategory = sp.category as LegacyCmsCategory;
  const initialCategory: LegacyCmsCategory = allowedCategories.includes(requestedCategory) ? requestedCategory : allowedCategories.includes("invoices") ? "invoices" : allowedCategories[0];

  let body: React.ReactNode;
  if (view === "live") body = <CmsLiveView categories={allowedCategories} canReview={canReview} initialCategory={initialCategory} canManageData={flags.canManageData} canResolveFeedback={flags.canResolveFeedback} />;
  else if (view === "invoices") body = <CmsInvoicesView />;
  else if (view === "revenue") body = <CmsRevenueView canReview={canReview} />;
  else if (view === "growth") body = <CmsGrowthView categories={allowedCategories} />;
  else if (view === "reports") {
    const { listGroups } = await import("@/server/chat");
    const groups = canSchedule ? (await listGroups(viewer).catch(() => [])).filter((g) => g.kind !== "direct" && g.canPost).map((g) => ({ id: g.id, name: g.name })) : [];
    body = <CmsReportsHome categories={allowedCategories} canSchedule={canSchedule} isAdmin={can(viewer, "data.manage") || can(viewer, "users.manage")} chatGroups={groups} canBuild={flags.canManageData} />;
  } else body = await oldView(view, viewer, allowedCategories, initialCategory, isAdmin);

  return (
    <div className="space-y-4">
      <PageHeader title="Legacy CMS" description="Noor Ethiopia CMS: live data by date, invoice verification, revenue and growth, and daily trends stored every night." />
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
    Promise.resolve({ rows: [], total: 0 }),
    getLegacyCmsStats(allowedCategories),
    view === "contacts" && has("students", "parents") ? getStudentParentRelations() : Promise.resolve(emptyRelations),
    Promise.resolve(emptyRevenue),
    Promise.resolve(emptyGrowth),
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
