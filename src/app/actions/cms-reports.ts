"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as inv from "@/server/cms-invoices";
import * as rep from "@/server/cms-reports";
import { cmsCapabilities } from "@/server/cms-range";
import type { InvoiceState } from "@/lib/cms-invoices";

// Invoice verification, report schedules and the Noor table measurements (Update 1.0, Phase 2).
export async function reviewInvoicesAction(input: { ids: string[]; state: InvoiceState; reason?: string; note?: string; invoices?: Record<string, Record<string, string>> }) {
  return wrap(async () => inv.reviewInvoices(await requireViewer(), input));
}
export async function listInvoiceReviewsAction(f: { state?: string; verifier?: string; search?: string; from?: string; until?: string }) {
  return wrap(async () => inv.listInvoiceReviews(await requireViewer(), f), { revalidate: false });
}
export async function invoiceReviewStatesAction(ids: string[]) {
  return wrap(async () => inv.invoiceReviewStates(await requireViewer(), ids), { revalidate: false });
}
export async function invoiceReviewHistoryAction(id: string) {
  return wrap(async () => inv.invoiceReviewHistory(await requireViewer(), id), { revalidate: false });
}
export async function invoiceVerifiersAction() {
  return wrap(async () => inv.invoiceVerifiers(await requireViewer()), { revalidate: false });
}
export async function invoiceReviewCountsAction() {
  return wrap(async () => inv.invoiceReviewCounts(await requireViewer()), { revalidate: false });
}
export async function listCmsSchedulesAction() {
  return wrap(async () => rep.listSchedules(await requireViewer()), { revalidate: false });
}
export async function saveCmsScheduleAction(input: Partial<rep.CmsSchedule> & { remove?: boolean }) {
  return wrap(async () => rep.saveSchedule(await requireViewer(), input));
}
export async function runCmsScheduleNowAction(id: string) {
  return wrap(async () => rep.runScheduleNow(await requireViewer(), id));
}
export async function cmsCapabilitiesAction() {
  return wrap(async () => {
    await requireViewer();
    return cmsCapabilities();
  }, { revalidate: false });
}
export async function cmsMetricsAction(from?: string, until?: string) {
  return wrap(async () => (await import("@/server/cms-metrics")).cmsMetrics(await requireViewer(), from, until), { revalidate: false });
}
