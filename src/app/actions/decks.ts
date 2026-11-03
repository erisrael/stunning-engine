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

// Presentation templates (Admin): made in the app, or imported from PowerPoint, Google Slides, Keynote or Canva.
export async function saveTemplateAction(input: Parameters<typeof import("@/server/deck-templates").saveTemplate>[1]) {
  return wrap(async () => (await import("@/server/deck-templates")).saveTemplate(await requireViewer(), input));
}
export async function deleteTemplateAction(id: string) {
  return wrap(async () => (await import("@/server/deck-templates")).deleteTemplate(await requireViewer(), id));
}
export async function defaultTemplateAction(id: string) {
  return wrap(async () => (await import("@/server/deck-templates")).setDefaultTemplate(await requireViewer(), id));
}
export async function importTemplateAction(formData: FormData) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file.");
    return (await import("@/server/deck-templates")).importTemplate(viewer, file.name, await file.arrayBuffer());
  });
}
