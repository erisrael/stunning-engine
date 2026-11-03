"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as pv from "@/server/privacy";
import { can } from "@/server/users";
import { WorkflowError } from "@/server/workflow";

// Data protection (Phase 16.5).
export async function acceptPrivacyAction(version: number) {
  return wrap(async () => pv.acceptPrivacy(await requireViewer(), version));
}
export async function savePrivacyAction(input: Parameters<typeof pv.savePrivacy>[1]) {
  return wrap(async () => pv.savePrivacy(await requireViewer(), input));
}
export async function applyRetentionAction() {
  return wrap(async () => {
    const v = await requireViewer();
    if (!can(v, "users.manage") && !can(v, "hr.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin and HR managers run this.");
    return await pv.applyRetention();
  });
}
