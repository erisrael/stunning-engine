"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as dt from "@/server/dev-tools";
import * as dp from "@/server/dev-plan";

// Development tools and planning (Phases 12b.2, 12b.4, 12b.5).
export async function newApiKeyAction(dept: string) {
  return wrap(async () => dt.newApiKey(await requireViewer(), dept));
}
export async function saveToolsSettingsAction(dept: string, input: Parameters<typeof dt.saveToolsSettings>[2]) {
  return wrap(async () => dt.saveToolsSettings(await requireViewer(), dept, input));
}
export async function webhookSecretAction(dept: string, id: string) {
  return wrap(async () => dt.webhookSecret(await requireViewer(), dept, id), { revalidate: false });
}
export async function setReleaseVersionAction(dept: string, releaseId: string, version: string) {
  return wrap(async () => dt.setReleaseVersion(await requireViewer(), dept, releaseId, version));
}
export async function incidentAction(dept: string, input: Parameters<typeof dt.incidentAction>[2]) {
  return wrap(async () => dt.incidentAction(await requireViewer(), dept, input));
}
export async function saveTestCaseAction(dept: string, input: Parameters<typeof dt.saveTestCase>[2]) {
  return wrap(async () => dt.saveTestCase(await requireViewer(), dept, input));
}
export async function recordTestRunAction(dept: string, input: Parameters<typeof dt.recordTestRun>[2]) {
  return wrap(async () => dt.recordTestRun(await requireViewer(), dept, input));
}
export async function traceabilityAction(dept: string, docId: string) {
  return wrap(async () => dt.traceability(await requireViewer(), dept, docId), { revalidate: false });
}
export async function importFromAction(dept: string, source: "jira" | "trello" | "asana", text: string, includeDone = false) {
  return wrap(async () => dt.importFrom(await requireViewer(), dept, source, text, { includeDone }));
}
export async function saveTemplateAction(dept: string, input: Parameters<typeof dp.saveTemplate>[2]) {
  return wrap(async () => dp.saveTemplate(await requireViewer(), dept, input));
}
export async function deleteTemplateAction(dept: string, id: string) {
  return wrap(async () => dp.deleteTemplate(await requireViewer(), dept, id));
}
export async function applyTemplateAction(dept: string, templateId: string, input: Parameters<typeof dp.applyTemplate>[3]) {
  return wrap(async () => dp.applyTemplate(await requireViewer(), dept, templateId, input));
}
export async function saveBaselineAction(dept: string, projectId: string | null) {
  return wrap(async () => dp.saveBaseline(await requireViewer(), dept, projectId));
}
