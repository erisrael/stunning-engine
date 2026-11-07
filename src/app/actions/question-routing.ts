"use server";

import { requireViewer } from "@/server/auth";
import {
  getQuestionRoutingConfig,
  saveQuestionRoutingConfig,
  getAllowedRecipientRoles,
  type QuestionRoutingConfig,
} from "@/server/question-routing";
import { userDirectory } from "@/server/users";

export async function getQuestionRoutingAction() {
  try {
    const viewer = await requireViewer();
    const config = await getQuestionRoutingConfig();
    const allowed = getAllowedRecipientRoles(viewer.roles, config);
    return { ok: true, config, allowedRoles: allowed };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function saveQuestionRoutingAction(config: QuestionRoutingConfig) {
  try {
    const viewer = await requireViewer();
    await saveQuestionRoutingConfig(viewer, config);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function getEligibleQuestionRecipientsAction() {
  try {
    const viewer = await requireViewer();
    const [config, users] = await Promise.all([
      getQuestionRoutingConfig(),
      userDirectory(),
    ]);

    const allowed = getAllowedRecipientRoles(viewer.roles, config);

    const eligible = users
      .filter((u) => u.id !== viewer.id) // Don't assign to oneself
      .filter((u) => {
        if (allowed === "*") return true;
        // User must have at least one allowed role
        return u.roles.some((r) => allowed.includes(r));
      })
      .map((u) => ({
        id: u.id,
        name: u.name,
        handle: u.handle,
        roles: u.roles,
        primaryRole: u.roles[0] || "staff",
      }));

    return { ok: true, recipients: eligible, allowedRoles: allowed };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

