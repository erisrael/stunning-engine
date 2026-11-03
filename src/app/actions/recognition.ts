"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as r from "@/server/recognition";

// Recognition: settings (Admin), titles (HR, Admin, owners), kudos (everyone). Rights are checked on the server.
export async function saveRecognitionAction(input: Partial<r.RecognitionConfig>) {
  return wrap(async () => r.saveRecognitionConfig(await requireViewer(), input));
}
export async function giveTitleAction(input: { userId: string; title: string; reason: string; period?: string }) {
  return wrap(async () => r.giveTitle(await requireViewer(), input));
}
export async function removeAwardAction(id: string) {
  return wrap(async () => r.removeAward(await requireViewer(), id));
}
export async function giveKudosAction(input: { to: string; value: string; message: string }) {
  return wrap(async () => r.giveKudos(await requireViewer(), input));
}
export async function awardMonthAction(period: string) {
  return wrap(async () => {
    const v = await requireViewer();
    if (!r.configures(v)) throw new Error("Only Admin gives the month's badges by hand.");
    return r.awardMonth(period);
  });
}
