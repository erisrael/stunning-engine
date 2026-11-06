"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as api from "@/server/external-api";

export async function getExternalApiConfigAction() {
  return wrap(async () => {
    await requireViewer();
    return api.getExternalApiConfig();
  });
}

export async function saveExternalApiConfigAction(input: Partial<api.ExternalApiConfig>) {
  return wrap(async () => api.saveExternalApiConfig(await requireViewer(), input));
}

export async function testExternalApiAction(service: "academy" | "finance" | "sms" | "iconicSms") {
  return wrap(async () => {
    await requireViewer();
    return api.testExternalApi(service);
  });
}

export async function searchStudentParentAction(query: string) {
  return wrap(async () => api.searchStudentParent(await requireViewer(), query));
}

export async function fetchExternalRevenueAction() {
  return wrap(async () => api.fetchExternalRevenue(await requireViewer()));
}

export async function listExternalReceiptsAction(status: "pending" | "approved" | "rejected" = "pending") {
  return wrap(async () => api.listExternalReceipts(await requireViewer(), status));
}

export async function reviewExternalReceiptAction(receiptId: string, decision: "approve" | "reject", reason?: string) {
  return wrap(async () => api.reviewExternalReceipt(await requireViewer(), receiptId, decision, reason));
}

export async function fetchSmsStatusAction() {
  return wrap(async () => {
    await requireViewer();
    return api.fetchSmsStatus();
  });
}

export async function fetchIconicSmsStatusAction() {
  return wrap(async () => {
    await requireViewer();
    return api.fetchIconicSmsStatus();
  });
}

