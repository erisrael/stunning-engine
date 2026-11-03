"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as fp from "@/server/files-publishing";
import { can } from "@/server/users";
import { WorkflowError } from "@/server/workflow";

// Where the files live (16.2) and the Myseed App (16.3).
export async function saveStorageConfigAction(input: fp.StorageConfig) {
  return wrap(async () => fp.saveStorageConfig(await requireViewer(), input));
}
export async function saveAppConfigAction(input: { url: string; key?: string | null; clearKey?: boolean }) {
  return wrap(async () => fp.saveAppConfig(await requireViewer(), input));
}
export async function checkLinksNowAction() {
  return wrap(async () => {
    const v = await requireViewer();
    if (!can(v, "users.manage") && !can(v, "settings.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin runs this.");
    return await fp.checkLinks();
  });
}
export async function publishToAppAction(itemId: string) {
  return wrap(async () => fp.publishToApp(await requireViewer(), itemId));
}
export async function checkAppAction(itemId: string) {
  return wrap(async () => fp.checkApp(await requireViewer(), itemId));
}
