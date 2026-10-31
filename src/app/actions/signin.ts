"use server";

import { requireCapability, requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { saveSignInPolicy } from "@/server/signin-config";
import {
  adminResetTwoStep,
  beginTotpSetup,
  cancelChallenge,
  confirmTotpSetup,
  createInvite,
  decideSignup,
  finishSetupChallenge,
  forgetTrustedDevices,
  newRecoveryCodes,
  requestSignUp,
  revokeInvite,
  sendChallengeEmail,
  signInLog,
  signUpWithInvite,
  turnOffTwoStep,
  unlinkIdentity,
  verifyChallenge,
} from "@/server/signin";
import { WorkflowError } from "@/server/workflow";
import type { ProviderId, SignInPolicy } from "@/lib/signin-policy";
import type { Role } from "@/lib/domain";

// The second step at sign-in (no session yet, so nothing to refresh).
export async function verifyTwoStepAction(input: { kind: "totp" | "email" | "recovery"; code: string; remember?: boolean }) {
  return wrap(() => verifyChallenge(input), { revalidate: false });
}

export async function finishTwoStepSetupAction() {
  return wrap(() => finishSetupChallenge(), { revalidate: false });
}

export async function sendTwoStepEmailAction() {
  return wrap(() => sendChallengeEmail(), { revalidate: false });
}

export async function cancelTwoStepAction() {
  return wrap(() => cancelChallenge(), { revalidate: false });
}

export async function signUpWithInviteAction(input: { token: string; name: string; email: string; password: string }) {
  return wrap(async () => {
    const r = await signUpWithInvite(input.token, input);
    if (!r.ok) throw new WorkflowError("FORBIDDEN", r.error);
    return { next: r.next };
  }, { revalidate: false });
}

export async function requestSignUpAction(input: { name: string; email: string; password: string }) {
  return wrap(() => requestSignUp(input), { revalidate: false });
}

// Profile, Account
export async function beginTotpSetupAction() {
  return wrap(async () => beginTotpSetup(await requireViewer()));
}

export async function confirmTotpSetupAction(code: string) {
  return wrap(async () => confirmTotpSetup(await requireViewer(), code));
}

export async function turnOffTwoStepAction(code: string) {
  return wrap(async () => turnOffTwoStep(await requireViewer(), code));
}

export async function newRecoveryCodesAction(code: string) {
  return wrap(async () => newRecoveryCodes(await requireViewer(), code));
}

export async function forgetTrustedDevicesAction() {
  return wrap(async () => forgetTrustedDevices(await requireViewer()));
}

export async function unlinkIdentityAction(provider: ProviderId) {
  return wrap(async () => unlinkIdentity(await requireViewer(), provider));
}

// Admin, Sign-in
export async function saveSignInPolicyAction(input: { policy: SignInPolicy; secrets?: Partial<Record<ProviderId, string | null>> }) {
  return wrap(async () => saveSignInPolicy(await requireCapability("users.manage"), input));
}

export async function resetTwoStepAction(userId: string) {
  return wrap(async () => adminResetTwoStep(await requireCapability("users.manage"), userId));
}

export async function createInviteAction(input: { email?: string | null; role: Role; send?: boolean }) {
  return wrap(async () => createInvite(await requireCapability("users.manage"), input));
}

export async function revokeInviteAction(id: string) {
  return wrap(async () => revokeInvite(await requireCapability("users.manage"), id));
}

export async function decideSignupAction(id: string, approve: boolean, role?: Role) {
  return wrap(async () => decideSignup(await requireCapability("users.manage"), id, approve, role));
}

export async function signInLogAction(filter: { userId?: string; event?: string }) {
  return wrap(async () => signInLog(await requireViewer(), { ...filter, limit: 300 }), { revalidate: false });
}
