"use server";

import { requireViewer } from "@/server/auth";
import * as cms from "@/server/legacy-cms";
import type { LegacyCmsCategory, CmsRoleVisibility } from "@/server/legacy-cms";

export async function getLegacyCmsConfigAction() {
  try {
    const viewer = await requireViewer();
    const data = await cms.getLegacyCmsConfig();
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function saveLegacyCmsConfigAction(input: Parameters<typeof cms.saveLegacyCmsConfig>[1]) {
  try {
    const viewer = await requireViewer();
    await cms.saveLegacyCmsConfig(viewer, input);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function syncLegacyCmsAction(opts?: { force?: boolean; category?: LegacyCmsCategory | "all"; deep?: boolean; maxPages?: number }) {
  try {
    const viewer = await requireViewer();
    const result = await cms.syncLegacyCms(viewer, opts);
    return { ok: result.ok, message: result.message, counts: result.counts, targetCategory: result.targetCategory };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function loginLegacyCmsAction(credentials?: { username?: string; password?: string }) {
  try {
    const viewer = await requireViewer();
    const result = await cms.loginLegacyCms(viewer, credentials);
    return result;
  } catch (err: any) {
    return { ok: false, message: String(err?.message || err) };
  }
}

export async function checkLegacyCmsAuthAction() {
  try {
    const viewer = await requireViewer();
    const result = await cms.checkLegacyCmsAuth(viewer);
    return result;
  } catch (err: any) {
    return { ok: false, status: "error" as const, username: "", message: String(err?.message || err), ms: 0 };
  }
}

export async function logoutLegacyCmsAction() {
  try {
    const viewer = await requireViewer();
    const result = await cms.logoutLegacyCms(viewer);
    return result;
  } catch (err: any) {
    return { ok: false, message: String(err?.message || err) };
  }
}

export async function clearLegacyCmsDataAction(category?: LegacyCmsCategory) {
  try {
    const viewer = await requireViewer();
    const result = await cms.clearLegacyCmsData(viewer, category);
    return { ok: true, count: result.count };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function getCmsRoleVisibilityAction() {
  try {
    await requireViewer();
    const data = await cms.getCmsRoleVisibility();
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function saveCmsRoleVisibilityAction(visibility: CmsRoleVisibility) {
  try {
    const viewer = await requireViewer();
    await cms.saveCmsRoleVisibility(viewer, visibility);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function listLegacyCmsRecordsAction(
  category: LegacyCmsCategory,
  opts?: { q?: string; limit?: number; offset?: number }
) {
  try {
    await requireViewer();
    const data = await cms.listLegacyCmsRecords(category, opts);
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err), data: { rows: [], total: 0 } };
  }
}

export async function searchLegacyCmsAction(q: string) {
  try {
    await requireViewer();
    const data = await cms.searchLegacyCms(q);
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err), data: { students: [], parents: [], invoices: [], subscriptions: [] } };
  }
}

export async function getLegacyCmsStatsAction() {
  try {
    await requireViewer();
    const data = await cms.getLegacyCmsStats();
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function getStudentParentRelationsAction(opts?: Parameters<typeof cms.getStudentParentRelations>[0]) {
  try {
    await requireViewer();
    const data = await cms.getStudentParentRelations(opts);
    return { ok: true, data };
  } catch (err: any) {
    return {
      ok: false,
      error: String(err?.message || err),
      data: { relations: [], summary: { totalStudents: 0, linkedParents: 0, withPhone: 0, activeSubscriptions: 0 } },
    };
  }
}

export async function getLegacyCmsRevenueAnalyticsAction(opts?: Parameters<typeof cms.getLegacyCmsRevenueAnalytics>[0]) {
  try {
    await requireViewer();
    const data = await cms.getLegacyCmsRevenueAnalytics(opts);
    return { ok: true, data };
  } catch (err: any) {
    return {
      ok: false,
      error: String(err?.message || err),
      data: {
        summary: { totalRevenue: 0, totalPaidCount: 0, pendingApprovalRevenue: 0, pendingApprovalCount: 0, averageInvoiceValue: 0 },
        byPaymentMethod: [],
        byStatus: [],
        byMonth: [],
        byPlan: [],
        invoices: [],
      },
    };
  }
}

export async function approveLegacyCmsInvoiceAction(invoiceId: string, notes?: string) {
  try {
    const viewer = await requireViewer();
    const data = await cms.approveLegacyCmsInvoice(viewer, invoiceId, notes);
    return data;
  } catch (err: any) {
    return { ok: false, message: String(err?.message || err) };
  }
}

export async function getLegacyCmsGrowthAnalyticsAction() {
  try {
    await requireViewer();
    const data = await cms.getLegacyCmsGrowthAnalytics();
    return { ok: true, data };
  } catch (err: any) {
    return {
      ok: false,
      error: String(err?.message || err),
      data: {
        summary: { totalStudents: 0, totalParents: 0, totalInvoices: 0, activeSubscriptions: 0, conversionRate: 0 },
        gradeDistribution: [],
        cityDemographics: [],
        planPopularity: [],
        genderBreakdown: [],
      },
    };
  }
}

export async function fetchLegacyCmsLivePageAction(opts: {
  category: LegacyCmsCategory;
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  try {
    const viewer = await requireViewer();
    const res = await cms.fetchLegacyCmsLivePage(viewer, opts);
    return res;
  } catch (err: any) {
    return {
      ok: false,
      message: String(err?.message || err),
      category: opts.category,
      currentPage: 1,
      totalPages: 1,
      totalResults: 0,
      from: 0,
      to: 0,
      headers: [],
      records: [],
    };
  }
}

export async function fetchLegacyCmsInvoiceReceiptAction(invoiceId: string) {
  try {
    const viewer = await requireViewer();
    const res = await cms.fetchLegacyCmsInvoiceReceipt(viewer, invoiceId);
    return res;
  } catch (err: any) {
    return { ok: false, message: String(err?.message || err), invoiceId };
  }
}

export async function deleteLegacyCmsCategoryDataAction(category: LegacyCmsCategory | "all") {
  try {
    const viewer = await requireViewer();
    const res = await cms.deleteLegacyCmsCategoryData(viewer, category);
    return res;
  } catch (err: any) {
    return { ok: false, count: 0, message: String(err?.message || err) };
  }
}

export async function getLegacyCmsStorageStatusAction() {
  try {
    await requireViewer();
    const data = await cms.getLegacyCmsStorageStatus();
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err), data: [] };
  }
}

export async function listStaffUsersAction() {
  try {
    const { userDirectory } = await import("@/server/users");
    const users = await userDirectory();
    return {
      ok: true,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        handle: u.handle,
        role: u.roles[0] || "staff",
      })),
    };
  } catch (err: any) {
    return { ok: false, users: [], error: String(err?.message || err) };
  }
}

export async function reportUserIssueToQuestionsAction(input: {
  ownerId: string;
  category: string;
  title: string;
  question: string;
  context?: Record<string, unknown>;
}) {
  try {
    const { askQuestionAction } = await import("@/app/actions/collab");
    const res = await askQuestionAction({
      ownerId: input.ownerId,
      question: input.question,
      contextType: "legacy_cms_issue",
      context: {
        category: input.category,
        title: input.title,
        ...input.context,
      },
    });
    return res;
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}
