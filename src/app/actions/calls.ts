"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { iceServers, saveTurn } from "@/server/calls";
import { can } from "@/server/users";
import { WorkflowError } from "@/server/workflow";

async function admin() {
  const viewer = await requireViewer();
  if (!can(viewer, "settings.manage")) throw new WorkflowError("FORBIDDEN", "Only people who manage settings can change the call relay.");
  return viewer;
}

export async function saveTurnAction(input: { keyId: string; token?: string | null; clear?: boolean }) {
  return wrap(async () => saveTurn(await admin(), input));
}

// Asks Cloudflare for relay credentials with the saved key, without placing a call.
export async function testTurnAction() {
  return wrap(async () => {
    await admin();
    const r = await iceServers({ strict: true });
    return r.iceServers.filter((s) => s.username).length;
  }, { revalidate: false });
}
