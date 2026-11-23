"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { respondToAssignment } from "@/server/assignment-response";

export async function respondToAssignmentAction(itemId: string, decision: "accepted" | "declined", reason?: string | null) {
  return wrap(async () => respondToAssignment(await requireViewer(), itemId, decision, reason));
}
