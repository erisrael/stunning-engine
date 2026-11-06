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

export async function syncLegacyCmsAction(opts?: { force?: boolean; category?: LegacyCmsCategory | "all" }) {
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
