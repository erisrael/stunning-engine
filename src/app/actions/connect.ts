"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as C from "@/server/connectors";
import * as N from "@/server/notion";

// Integrate a platform (Phase 27): read the docs, review, test, switch on.
export async function setupFromDocsAction(input: { url?: string | null; spec?: string | null; capability: C.Capability }) {
  return wrap(async () => C.setupFromDocs(await requireViewer(), input), { revalidate: false });
}
export async function saveConnectorAction(input: Parameters<typeof C.saveConnector>[1]) {
  return wrap(async () => C.saveConnector(await requireViewer(), input));
}
export async function deleteConnectorAction(id: string) {
  return wrap(async () => C.deleteConnector(await requireViewer(), id));
}
export async function testConnectorAction(id: string, input: Record<string, string>) {
  return wrap(async () => C.testConnector(await requireViewer(), id, input));
}
export async function installPresetAction(key: string) {
  return wrap(async () => C.installPreset(await requireViewer(), key));
}
export async function sendSmsAction(to: string, message: string) {
  return wrap(async () => {
    const v = await requireViewer();
    const { can } = await import("@/server/users");
    if (!can(v, "users.manage") && !can(v, "hr.access")) throw new Error("Only Admin and HR send SMS from here.");
    return C.sendSms(to, message);
  });
}
export async function paymentLinkAction(input: Parameters<typeof C.createPaymentLink>[1]) {
  return wrap(async () => C.createPaymentLink(await requireViewer(), input));
}

// Notion.
export async function connectNotionAction(input: { token?: string | null; parentPage?: string | null; disconnect?: boolean }) {
  return wrap(async () => N.connectNotion(await requireViewer(), input));
}
export async function docToNotionAction(dept: string, docId: string) {
  return wrap(async () => N.docToNotion(await requireViewer(), dept, docId), { revalidate: false });
}
export async function notionToDocAction(dept: string, input: { page: string; folderId?: string | null }) {
  return wrap(async () => N.notionToDoc(await requireViewer(), dept, input), { revalidate: false });
}
export async function datasetToNotionAction(dataset: string) {
  return wrap(async () => {
    const v = await requireViewer();
    const F = await import("@/server/feeds");
    if (!F.isDataset(dataset)) throw new Error("Unknown dataset.");
    const { can } = await import("@/server/users");
    if (!can(v, F.DATASETS[dataset].needs as never)) throw new Error("You cannot see this dataset.");
    return N.datasetToNotion(v, F.DATASETS[dataset].label, (await F.datasetRows(v, dataset)) as Record<string, unknown>[]);
  }, { revalidate: false });
}
