"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as h from "@/server/support-help";
import * as ch from "@/server/support-channels";
import { appOrigin } from "@/server/password-reset";

// Staff: the help menu, routing rules, moving tickets, the Telegram bot. Rights are checked in support-help.ts.
export async function saveCategoriesAction(input: Parameters<typeof h.saveCategories>[1]) {
  return wrap(async () => h.saveCategories(await requireViewer(), input));
}
export async function saveRoutesAction(input: Parameters<typeof h.saveRoutes>[1]) {
  return wrap(async () => h.saveRoutes(await requireViewer(), input));
}
export async function transferTicketAction(ticketId: string, queueId: string, note: string) {
  return wrap(async () => h.transferTicket(await requireViewer(), ticketId, queueId, note));
}
export async function saveTelegramTextsAction(input: Partial<ch.TelegramTexts>) {
  return wrap(async () => ch.saveTelegramTexts(await requireViewer(), input));
}
export async function refreshTelegramAction() {
  return wrap(async () => ch.refreshTelegram(await requireViewer(), await appOrigin()));
}
export async function telegramHealthAction() {
  return wrap(async () => {
    await requireViewer();
    return ch.telegramHealth();
  }, { revalidate: false });
}
