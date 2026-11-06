"use server";

import { requireViewer } from "@/server/auth";
import * as cms from "@/server/legacy-cms";
import type { LegacyCmsCategory } from "@/server/legacy-cms";

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

export async function syncLegacyCmsAction(opts?: { force?: boolean }) {
  try {
    const viewer = await requireViewer();
    const result = await cms.syncLegacyCms(viewer, opts);
    return { ok: result.ok, message: result.message, counts: result.counts };
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

