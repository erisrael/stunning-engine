"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as d from "@/server/decks";

// Presentation studio: saved decks, meetings, share links. Rights are checked on the server.
export async function saveDeckAction(input: Parameters<typeof d.saveDeck>[1]) {
  return wrap(async () => d.saveDeck(await requireViewer(), input));
}
export async function deleteDeckAction(id: string) {
  return wrap(async () => d.deleteDeck(await requireViewer(), id));
}
export async function endMeetingAction(input: Parameters<typeof d.endMeeting>[1]) {
  return wrap(async () => d.endMeeting(await requireViewer(), input));
}
export async function shareDeckAction(input: Parameters<typeof d.createShare>[1]) {
  return wrap(async () => d.createShare(await requireViewer(), input));
}
export async function revokeShareAction(token: string) {
  return wrap(async () => d.revokeShare(await requireViewer(), token));
}
export async function createRemoteAction() {
  return wrap(async () => d.createRemote(await requireViewer()), { revalidate: false });
}
