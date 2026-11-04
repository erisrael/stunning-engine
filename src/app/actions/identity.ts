"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { saveIdentity } from "@/server/identity";

export async function saveIdentityAction(input: Parameters<typeof saveIdentity>[1]) {
  return wrap(async () => saveIdentity(await requireViewer(), input));
}
