"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as prof from "@/server/profiles";

// Profiles are edited by their owner only (checked in profiles.ts).
export async function saveProfileAction(input: prof.ProfileInput) {
  return wrap(async () => prof.saveProfile(await requireViewer(), input));
}
export async function addProfileFileAction(input: { kind: string; title?: string; file: { name: string; mime: string; base64: string } }) {
  return wrap(async () => prof.addProfileFile(await requireViewer(), input));
}
export async function deleteProfileFileAction(id: string) {
  return wrap(async () => prof.deleteProfileFile(await requireViewer(), id));
}
