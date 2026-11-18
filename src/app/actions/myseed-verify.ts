"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { can, type AppUser } from "@/server/users";
import { WorkflowError } from "@/server/workflow";
import {
  publicVerifyConfig,
  saveMyseedVerifyConfig,
  testMyseedVerifyConnection,
  createVerifyPaymentRequest,
  type VerifyConfigInput,
  type CreatePaymentRequestInput,
} from "@/server/myseed-verify";

// Myseed Verify holds an API key and signs payment webhooks: only Admin (or Data Manager) reads, tests or uses it here.
async function admin(): Promise<AppUser> {
  const u = await requireViewer();
  if (!can(u, "users.manage") && !can(u, "data.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up Myseed Verify.");
  return u;
}

export async function getMyseedVerifyConfigAction() {
  return wrap(async () => {
    await admin();
    return publicVerifyConfig();
  }, { revalidate: false });
}

export async function saveMyseedVerifyConfigAction(input: VerifyConfigInput) {
  return wrap(async () => saveMyseedVerifyConfig(await admin(), input));
}

export async function testMyseedVerifyConnectionAction() {
  return wrap(async () => {
    await admin();
    return testMyseedVerifyConnection();
  });
}

export async function createVerifyPaymentRequestAction(input: CreatePaymentRequestInput) {
  return wrap(async () => {
    await admin();
    return createVerifyPaymentRequest(input);
  });
}
