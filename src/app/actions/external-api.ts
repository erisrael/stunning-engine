"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as api from "@/server/external-api";
import { apiProviderStatus, type ApiProvider } from "@/server/external-api-console";
import { can, type AppUser } from "@/server/users";
import { WorkflowError } from "@/server/workflow";

// The settings hold API keys: only Admin reads them, tests them or checks balances. Keys never go back to the browser.
async function admin(): Promise<AppUser> {
  const u = await requireViewer();
  if (!can(u, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up external APIs.");
  return u;
}

export async function getExternalApiConfigAction() {
  return wrap(async () => {
    await admin();
    return api.publicExternalApiConfig();
  }, { revalidate: false });
}

export async function saveExternalApiConfigAction(input: api.ExternalApiInput) {
  return wrap(async () => api.saveExternalApiConfig(await admin(), input));
}

export async function testExternalApiAction(service: "academy" | "finance" | "sms" | "iconicSms", phone?: string | null) {
  return wrap(async () => {
    await admin();
    return api.testExternalApi(service, phone);
  });
}

// One provider's status and latest calls, after a test or save.
export async function apiProviderStatusAction(key: ApiProvider) {
  return wrap(async () => apiProviderStatus(await admin(), key), { revalidate: false });
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

export async function fetchIconicSmsStatusAction() {
  return wrap(async () => {
    await admin();
    return api.fetchIconicSmsStatus();
  });
}
