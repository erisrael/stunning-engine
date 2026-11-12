"use server";

import { wrap } from "@/server/action-result";
import * as h from "@/server/support-help";
import { telegramBotToken } from "@/server/support-channels";

// The public help page (no account): a customer is known by the private token they were given, or inside Telegram by
// its signed initData. Nothing here reads anything without that token.
export async function helpAskAction(input: Parameters<typeof h.helpAsk>[0]) {
  return wrap(async () => h.helpAsk(input), { revalidate: false });
}
export async function helpTicketsAction(token: string) {
  return wrap(async () => h.helpTickets(token), { revalidate: false });
}
export async function helpMessagesAction(token: string, ticketId: string) {
  return wrap(async () => h.helpMessages(token, ticketId), { revalidate: false });
}
export async function helpReplyAction(token: string, ticketId: string, body: string) {
  return wrap(async () => h.helpReply(token, ticketId, body), { revalidate: false });
}
export async function helpTelegramAction(initData: string) {
  return wrap(async () => h.helpTelegram(initData, await telegramBotToken()), { revalidate: false });
}
