"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as mail from "@/server/mail";

// The inbox in the app (Phase 14). Every action checks that the mailbox is the viewer's own, or, for email managers
// when Admin allows it, opens someone else's read-only (recorded and told to the person).
export async function mailHomeAction(box?: string | null) {
  return wrap(async () => mail.mailHome(await requireViewer(), box));
}
export async function mailFoldersAction(box?: string | null) {
  return wrap(async () => mail.mailFolders(await requireViewer(), box));
}
export async function mailListAction(input: Parameters<typeof mail.mailList>[1]) {
  return wrap(async () => mail.mailList(await requireViewer(), input));
}
export async function mailMessageAction(input: Parameters<typeof mail.mailMessage>[1]) {
  return wrap(async () => mail.mailMessage(await requireViewer(), input));
}
export async function mailActAction(input: Parameters<typeof mail.mailAct>[1]) {
  return wrap(async () => mail.mailAct(await requireViewer(), input));
}
export async function mailSendAction(input: mail.MailCompose) {
  return wrap(async () => mail.mailSend(await requireViewer(), input));
}
export async function mailSaveDraftAction(input: mail.MailCompose) {
  return wrap(async () => mail.mailSaveDraft(await requireViewer(), input));
}
export async function mailDraftAction(input: Parameters<typeof mail.mailDraft>[1]) {
  return wrap(async () => mail.mailDraft(await requireViewer(), input));
}

// Email managers: settings and mailboxes.
export async function saveMailConfigAction(input: Parameters<typeof mail.saveMailConfig>[1]) {
  return wrap(async () => mail.saveMailConfig(await requireViewer(), input));
}
export async function checkCpanelAction() {
  return wrap(async () => mail.checkCpanel(await requireViewer()));
}
export async function cpanelMailboxesAction() {
  return wrap(async () => mail.cpanelMailboxes(await requireViewer()));
}
export async function checkMailServerAction(id?: string | null) {
  return wrap(async () => mail.checkMailServer(await requireViewer(), id));
}
export async function createMailboxAction(input: Parameters<typeof mail.createMailbox>[1]) {
  return wrap(async () => mail.createMailbox(await requireViewer(), input));
}
export async function takeOverMailboxAction(input: Parameters<typeof mail.takeOverMailbox>[1]) {
  return wrap(async () => mail.takeOverMailbox(await requireViewer(), input));
}
export async function connectMailboxAction(input: Parameters<typeof mail.connectMailbox>[1]) {
  return wrap(async () => mail.connectMailbox(await requireViewer(), input));
}
export async function newMailboxPasswordAction(id: string) {
  return wrap(async () => mail.newMailboxPassword(await requireViewer(), id));
}
export async function setMailboxOnAction(id: string, on: boolean) {
  return wrap(async () => mail.setMailboxOn(await requireViewer(), id, on));
}
export async function removeMailboxAction(id: string, atHost: boolean) {
  return wrap(async () => mail.removeMailbox(await requireViewer(), id, atHost));
}

// Signatures and sending later.
export async function mySignatureAction() {
  return wrap(async () => mail.mySignature(await requireViewer()), { revalidate: false });
}
export async function saveSignatureAction(text: string) {
  return wrap(async () => mail.saveSignature(await requireViewer(), text), { revalidate: false });
}
export async function mailScheduleAction(input: mail.MailCompose, sendAt: string) {
  return wrap(async () => mail.mailSchedule(await requireViewer(), input, sendAt), { revalidate: false });
}
export async function myScheduledAction() {
  return wrap(async () => mail.myScheduled(await requireViewer()), { revalidate: false });
}
export async function cancelScheduledAction(id: string) {
  return wrap(async () => mail.cancelScheduled(await requireViewer(), id), { revalidate: false });
}
