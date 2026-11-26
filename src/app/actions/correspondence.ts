"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as Doc from "@/server/corr/documents";
import * as Dir from "@/server/corr/directory";
import * as S from "@/server/corr/setup";

// Correspondence actions. Every rule (who may write, issue, void or see a letter) is checked on the server in
// src/server/corr/*. Saving a draft does not refresh the whole page.
const quiet = { revalidate: false } as const;

export async function createLetterAction(input: { categoryId: string; department?: string | null }) {
  return wrap(async () => Doc.createDraft(await requireViewer(), input), quiet);
}
export async function saveLetterAction(id: string, input: Parameters<typeof Doc.saveDraft>[2]) {
  return wrap(async () => Doc.saveDraft(await requireViewer(), id, input), quiet);
}
export async function issueLetterAction(id: string) {
  return wrap(async () => Doc.issueDoc(await requireViewer(), id));
}
export async function advanceLetterAction(id: string, to: "dispatched" | "delivered" | "acknowledged" | "archived", input: { method?: string; note?: string } = {}) {
  return wrap(async () => Doc.advanceDoc(await requireViewer(), id, to, input));
}
export async function voidLetterAction(id: string, reason: string) {
  return wrap(async () => Doc.voidDoc(await requireViewer(), id, reason));
}
export async function duplicateLetterAction(id: string, as: "copy" | "amend") {
  return wrap(async () => Doc.duplicateDoc(await requireViewer(), id, as));
}
export async function registerIncomingAction(input: Parameters<typeof Doc.registerIncoming>[1]) {
  return wrap(async () => Doc.registerIncoming(await requireViewer(), input));
}
export async function searchOrgsAction(q: string) {
  return wrap(async () => Dir.searchOrgs(await requireViewer(), q), quiet);
}
export async function saveOrgAction(input: Parameters<typeof Dir.saveOrg>[1]) {
  return wrap(async () => Dir.saveOrg(await requireViewer(), input));
}
export async function saveContactAction(input: Parameters<typeof Dir.saveContact>[1]) {
  return wrap(async () => Dir.saveContact(await requireViewer(), input));
}
export async function deleteContactAction(id: string) {
  return wrap(async () => Dir.deleteContact(await requireViewer(), id));
}
export async function saveEntityAction(input: Parameters<typeof S.saveEntity>[1]) {
  return wrap(async () => S.saveEntity(await requireViewer(), input));
}
export async function saveCategoryAction(input: Parameters<typeof S.saveCategory>[1]) {
  return wrap(async () => S.saveCategory(await requireViewer(), input));
}

// --- Templates ---
import * as T from "@/server/corr/templates";
export async function createTemplateAction(input: Parameters<typeof T.createTemplate>[1]) {
  return wrap(async () => T.createTemplate(await requireViewer(), input));
}
export async function saveTemplateDraftAction(id: string, input: Parameters<typeof T.saveTemplateDraft>[2]) {
  return wrap(async () => T.saveTemplateDraft(await requireViewer(), id, input), quiet);
}
export async function submitTemplateAction(id: string, note: string) {
  return wrap(async () => T.submitTemplate(await requireViewer(), id, note));
}
export async function withdrawTemplateAction(id: string) {
  return wrap(async () => T.withdrawTemplate(await requireViewer(), id));
}
export async function decideTemplateAction(id: string, approve: boolean, note: string) {
  return wrap(async () => T.decideTemplate(await requireViewer(), id, approve, note));
}
export async function setTemplateActiveAction(id: string, active: boolean) {
  return wrap(async () => T.setTemplateActive(await requireViewer(), id, active));
}
export async function templateVersionAction(id: string, version: number) {
  return wrap(async () => T.templateVersion(await requireViewer(), id, version), quiet);
}

// --- Organisation and authority ---
import * as O from "@/server/corr/org";
export async function saveUnitAction(input: Parameters<typeof O.saveUnit>[1]) {
  return wrap(async () => O.saveUnit(await requireViewer(), input));
}
export async function savePositionAction(input: Parameters<typeof O.savePosition>[1]) {
  return wrap(async () => O.savePosition(await requireViewer(), input));
}
export async function assignAction(input: Parameters<typeof O.assign>[1]) {
  return wrap(async () => O.assign(await requireViewer(), input));
}
export async function endAssignmentAction(id: string, endAt?: string | null) {
  return wrap(async () => O.endAssignment(await requireViewer(), id, endAt));
}
export async function loadDefaultHierarchyAction() {
  return wrap(async () => O.loadDefaultHierarchy(await requireViewer()));
}
export async function grantAuthorityAction(input: Parameters<typeof O.grantAuthority>[1]) {
  return wrap(async () => O.grantAuthority(await requireViewer(), input));
}
export async function revokeAuthorityAction(id: string) {
  return wrap(async () => O.revokeAuthority(await requireViewer(), id));
}
export async function createDelegationAction(input: Parameters<typeof O.createDelegation>[1]) {
  return wrap(async () => O.createDelegation(await requireViewer(), input));
}
export async function revokeDelegationAction(id: string) {
  return wrap(async () => O.revokeDelegation(await requireViewer(), id));
}

// --- Workflows ---
import * as W from "@/server/corr/workflow";
export async function saveWorkflowAction(input: Parameters<typeof W.saveWorkflow>[1]) {
  return wrap(async () => W.saveWorkflow(await requireViewer(), input));
}
export async function saveRuleAction(input: Parameters<typeof W.saveRule>[1]) {
  return wrap(async () => W.saveRule(await requireViewer(), input));
}
export async function submitLetterAction(id: string) {
  return wrap(async () => W.submitDoc(await requireViewer(), id));
}
export async function actOnStepAction(stepId: string, input: Parameters<typeof W.actOnStep>[2]) {
  return wrap(async () => W.actOnStep(await requireViewer(), stepId, input));
}
export async function withdrawLetterAction(id: string) {
  return wrap(async () => Doc.withdrawDoc(await requireViewer(), id));
}

// --- Signatures and stamps ---
import * as G from "@/server/corr/signing";
export async function registerSignatureAction(input: Parameters<typeof G.registerSignature>[1]) {
  return wrap(async () => G.registerSignature(await requireViewer(), input));
}
export async function revokeSignatureAction(id: string) {
  return wrap(async () => G.revokeSignature(await requireViewer(), id));
}
export async function saveStampAction(input: Parameters<typeof G.saveStamp>[1]) {
  return wrap(async () => G.saveStamp(await requireViewer(), input));
}
export async function saveSignPolicyAction(input: Partial<G.SignPolicy>) {
  return wrap(async () => G.saveSignPolicy(await requireViewer(), input));
}

// --- Delivery, attachments, bulk, holds ---
import * as Dl from "@/server/corr/delivery";
import { appOrigin } from "@/server/password-reset";
export async function dispatchLetterAction(id: string, input: Parameters<typeof Dl.dispatchDoc>[2]) {
  return wrap(async () => Dl.dispatchDoc(await requireViewer(), id, input, await appOrigin()));
}
export async function retryDispatchAction(id: string) {
  return wrap(async () => Dl.retryDispatch(await requireViewer(), id, await appOrigin()));
}
export async function removeAttachmentAction(id: string) {
  return wrap(async () => Dl.removeAttachment(await requireViewer(), id));
}
export async function bulkLettersAction(modelId: string, rows: Parameters<typeof Dl.bulkFromRows>[2]) {
  return wrap(async () => Dl.bulkFromRows(await requireViewer(), modelId, rows));
}
export async function setLegalHoldAction(id: string, on: boolean, reason: string) {
  return wrap(async () => Doc.setLegalHold(await requireViewer(), id, on, reason));
}
export async function recordExportAction(id: string, kind: Parameters<typeof Doc.recordExport>[2]) {
  return wrap(async () => Doc.recordExport(await requireViewer(), id, kind), quiet);
}
export async function setAttachPolicyAction(input: { allowZip: boolean; requireScan: boolean }) {
  return wrap(async () => Dl.setAttachPolicy(await requireViewer(), input));
}

// --- Text messages ---
export async function saveCorrNotifyAction(input: { smsApprovals: boolean; smsOverdue: boolean; smsDelivery: boolean }) {
  return wrap(async () => (await import("@/server/corr/notify")).saveCorrNotifyConfig(await requireViewer(), input));
}

// --- OCR ---
export async function ocrAttachmentAction(id: string) {
  return wrap(async () => (await import("@/server/corr/ocr")).ocrAttachment(await requireViewer(), id), quiet);
}
