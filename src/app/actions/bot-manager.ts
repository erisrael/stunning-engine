"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as bm from "@/server/bot-manager";
import * as ch from "@/server/support-channels";
import { appOrigin } from "@/server/password-reset";

// The Telegram bot manager. Rights (support leads and Admin) are checked in src/server/bot-manager.ts.
export async function saveLinkContentAction(bot: string, input: { id?: string | null; title: string; caption?: string | null; url?: string | null; active?: boolean }) {
  return wrap(async () => bm.saveContent(await requireViewer(), bot, input));
}
export async function deleteContentAction(id: string) {
  return wrap(async () => bm.deleteContent(await requireViewer(), id));
}
export async function schedulePushAction(bot: string, input: { contentId?: string | null; formId?: string | null; message?: string | null; sendAt?: string | null }) {
  return wrap(async () => bm.schedulePush(await requireViewer(), bot, input, await appOrigin()));
}
export async function cancelPushAction(id: string) {
  return wrap(async () => bm.cancelPush(await requireViewer(), id));
}
export async function saveFormAction(bot: string, input: Parameters<typeof bm.saveForm>[2]) {
  return wrap(async () => bm.saveForm(await requireViewer(), bot, input));
}
export async function deleteFormAction(id: string) {
  return wrap(async () => bm.deleteForm(await requireViewer(), id));
}
export async function formResultsAction(id: string) {
  return wrap(async () => bm.formResults(await requireViewer(), id), { revalidate: false });
}
export async function setFeedbackStatusAction(id: string, status: "new" | "reviewed") {
  return wrap(async () => bm.setFeedbackStatus(await requireViewer(), id, status));
}
export async function escalateFeedbackAction(id: string) {
  return wrap(async () => bm.escalateFeedback(await requireViewer(), id));
}
export async function saveBotTextsAction(bot: string, input: Partial<ch.TelegramTexts>) {
  return wrap(async () => ch.saveTelegramTexts(await requireViewer(), input, bot));
}
