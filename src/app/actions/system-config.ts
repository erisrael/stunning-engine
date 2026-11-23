"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { saveSystemConfig, type SystemConfigInput } from "@/server/system-config";

export async function saveSystemConfigAction(input: SystemConfigInput) {
  return wrap(async () => saveSystemConfig(await requireViewer(), input));
}
