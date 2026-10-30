"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { getSettings } from "@/server/settings";
import { can } from "@/server/users";
import { WorkflowError } from "@/server/workflow";
import {
  checkInboxDelivery,
  checkSmtpLogin,
  deleteSender,
  deleteTemplate,
  getLog,
  isEmail,
  renderEmail,
  resendFailed,
  resolveRecipients,
  saveSender,
  saveSmtp,
  saveTemplate,
  sendEmail,
  sendersFor,
  testSmtp,
  type RecipientInput,
  type SendInput,
} from "@/server/email";

async function manager() {
  const viewer = await requireViewer();
  if (!can(viewer, "email.manage")) throw new WorkflowError("FORBIDDEN", "Only email managers can change email settings.");
  return viewer;
}

async function sender() {
  const viewer = await requireViewer();
  if (!can(viewer, "email.send")) throw new WorkflowError("FORBIDDEN", "You do not have permission to send email.");
  return viewer;
}

const workspace = async () => (await getSettings()).workspace.name;

export async function saveSmtpAction(input: Parameters<typeof saveSmtp>[1]) {
  return wrap(async () => saveSmtp(await manager(), input));
}

export async function testSmtpAction(senderId: string | null, to: string) {
  return wrap(async () => {
    const viewer = await sender();
    if (senderId && !(await sendersFor(viewer)).some((s) => s.id === senderId)) throw new WorkflowError("FORBIDDEN", "You cannot send from that address.");
    if (!isEmail(to)) throw new WorkflowError("VALIDATION", "Enter the address to send the test to.");
    await testSmtp(viewer, senderId, to);
  }, { revalidate: false });
}

export async function checkSmtpLoginAction(senderId: string | null) {
  return wrap(async () => {
    await manager();
    return checkSmtpLogin(senderId);
  }, { revalidate: false });
}

export async function checkInboxDeliveryAction(address: string) {
  return wrap(async () => {
    await manager();
    return checkInboxDelivery(address);
  }, { revalidate: false });
}

export async function saveSenderAction(input: Parameters<typeof saveSender>[1]) {
  return wrap(async () => saveSender(await manager(), input));
}

export async function deleteSenderAction(id: string) {
  return wrap(async () => deleteSender(await manager(), id));
}

export async function saveEmailTemplateAction(input: { id?: string; name: string; subject: string; body: string; shared: boolean }) {
  return wrap(async () => saveTemplate(await sender(), input));
}

export async function deleteEmailTemplateAction(id: string) {
  return wrap(async () => deleteTemplate(await sender(), id));
}

// Who an email would reach, before sending.
export async function previewRecipientsAction(input: RecipientInput) {
  return wrap(async () => {
    await sender();
    return resolveRecipients(input);
  }, { revalidate: false });
}

export async function previewEmailAction(body: string, sample: { name?: string; email?: string } | null) {
  return wrap(async () => {
    const viewer = await sender();
    const r = sample ? { name: sample.name ?? null, address: sample.email ?? "", firstName: sample.name?.split(/\s+/)[0] ?? "", role: "", userId: null } : null;
    return renderEmail(body, r, { name: viewer.name }, await workspace()).html;
  }, { revalidate: false });
}

export async function sendEmailAction(input: SendInput) {
  return wrap(async () => sendEmail(await sender(), input, await workspace()));
}

export async function emailLogAction(id: string) {
  return wrap(async () => getLog(await sender(), id), { revalidate: false });
}

export async function resendFailedAction(id: string) {
  return wrap(async () => resendFailed(await sender(), id, await workspace()));
}
