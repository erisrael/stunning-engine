"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as an from "@/server/announcements";

// Announcements and policies; page visits for Admin's usage view (Phase 18).
export async function saveAnnouncementAction(input: Parameters<typeof an.saveAnnouncement>[1]) {
  return wrap(async () => an.saveAnnouncement(await requireViewer(), input));
}
export async function deleteAnnouncementAction(id: string) {
  return wrap(async () => an.deleteAnnouncement(await requireViewer(), id));
}
export async function markAnnouncementAction(id: string, ack: boolean) {
  return wrap(async () => an.markAnnouncement(await requireViewer(), id, ack));
}
export async function announcementStatusAction(id: string) {
  return wrap(async () => an.announcementStatus(await requireViewer(), id), { revalidate: false });
}
export async function remindAnnouncementAction(id: string) {
  return wrap(async () => an.remindAnnouncement(await requireViewer(), id), { revalidate: false });
}
export async function recordVisitAction(path: string) {
  return wrap(async () => {
    const v = await requireViewer();
    if (v.previewBy) return;
    await an.recordVisit(v.id, v.activeRole, String(path).slice(0, 300));
  }, { revalidate: false });
}
