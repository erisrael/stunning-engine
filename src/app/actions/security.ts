"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PREVIEW_COOKIE, realViewer, requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { audit } from "@/server/workflow";
import { can, loadUser } from "@/server/users";
import * as dev from "@/server/devices";
import { ROLE_LABELS, type Role } from "@/lib/domain";

// Sessions and devices (the server checks own sessions or Admin in devices.ts).
export async function endSessionAction(id: string) {
  return wrap(async () => dev.endSession(await requireViewer(), id));
}
export async function endOtherSessionsAction(userId?: string) {
  return wrap(async () => dev.endOtherSessions(await requireViewer(), userId));
}
export async function blockDeviceAction(sessionId: string, reason?: string | null) {
  return wrap(async () => dev.blockDevice(await requireViewer(), sessionId, reason));
}
export async function unblockDeviceAction(deviceId: string) {
  return wrap(async () => dev.unblockDevice(await requireViewer(), deviceId));
}

// View as: Admin sees the app as another person, read only. These two work while previewing, so they do not use
// wrap's read-only guard; they check the real person behind the session instead.
export async function startPreviewAction(userId: string, role?: Role | null) {
  const me = await realViewer();
  if (!me || !can(me, "users.manage")) return { ok: false as const, error: "Only Admin can use View as." };
  const target = await loadUser(userId);
  if (!target?.active) return { ok: false as const, error: "Choose an active person." };
  if (target.id === me.id) return { ok: false as const, error: "That is you." };
  (await cookies()).set(PREVIEW_COOKIE, `${target.id}:${role && target.roles.includes(role) ? role : ""}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 4 * 3600 });
  await audit({ actor: me }, { action: "user.preview", summary: `${me.name} viewed the app as ${target.name}${role ? ` (${ROLE_LABELS[role]})` : ""}` });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function exitPreviewAction() {
  (await cookies()).delete(PREVIEW_COOKIE);
  revalidatePath("/", "layout");
  redirect("/admin/preview");
}
