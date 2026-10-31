// The sign-in policy as stored ('cfg.signin'), with provider client secrets sealed. Read once per request (it is
// needed on every page for session limits). Not kept longer: pages, actions and API routes are separate bundles,
// so a longer cache in one would miss Admin's change saved through another.

import { cache } from "react";
import { get, nowIso, parseJson, run } from "./db";
import { seal, unseal } from "./secrets";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { googleConfig } from "./password-reset";
import { safeUrl } from "./oidc";
import { normalizeSignInPolicy, PROVIDER_IDS, PROVIDER_LABELS, type ProviderId, type SignInPolicy } from "@/lib/signin-policy";

type Stored = { policy: unknown; secrets?: Partial<Record<ProviderId, string>> };

const load = cache(async () => {
  const s = parseJson<Stored | null>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.signin'"))?.value, null);
  const secrets = s?.secrets ?? {};
  const policy = normalizeSignInPolicy(s?.policy);
  for (const id of PROVIDER_IDS) if (id !== "google") policy.providers[id].hasSecret = !!secrets[id];
  return { policy, secrets };
});

// A copy, so a caller changing it cannot change what the rest of the request sees.
export async function signInPolicy(): Promise<SignInPolicy> {
  return structuredClone((await load()).policy);
}

export async function providerSecret(id: Exclude<ProviderId, "google">) {
  const sealed = (await load()).secrets[id];
  return sealed ? unseal(sealed) : null;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveSignInPolicy(user: AppUser, input: { policy: SignInPolicy; secrets?: Partial<Record<ProviderId, string | null>> }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets how people sign in.");
  const policy = normalizeSignInPolicy(input.policy);
  const old = await load();
  const secrets: Partial<Record<ProviderId, string>> = { ...old.secrets };
  for (const id of PROVIDER_IDS) {
    if (id === "google") continue;
    const v = input.secrets?.[id];
    if (v === null) delete secrets[id];
    else if (v?.trim()) secrets[id] = await seal(v.trim());
  }
  const ms = policy.providers.microsoft;
  if (ms.enabled) {
    if (!ms.clientId || !secrets.microsoft) throw new WorkflowError("VALIDATION", "Microsoft needs the application (client) ID and a client secret.");
    // A shared directory ("common") would let any Microsoft account claim any address, so one directory is required.
    if (!GUID.test(ms.tenant ?? "") && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(ms.tenant ?? ""))
      throw new WorkflowError("VALIDATION", "Enter your Microsoft directory (tenant) ID, or its domain such as myseed.onmicrosoft.com.");
  }
  const oidc = policy.providers.oidc;
  if (oidc.enabled) {
    if (!oidc.name || !safeUrl(oidc.issuer ?? "")) throw new WorkflowError("VALIDATION", "Single sign-on needs a button name and the issuer address (https://...).");
    if (!oidc.clientId || !secrets.oidc) throw new WorkflowError("VALIDATION", "Single sign-on needs the client ID and client secret.");
  }
  if (policy.providers.google.enabled && !(await googleConfig())) throw new WorkflowError("VALIDATION", "Set up the Google client first (Google sign-in, below), then turn Google on.");
  const required = Object.values(policy.twoStep.roles).includes("required") || policy.twoStep.default === "required";
  if (required && !policy.twoStep.totp && !policy.twoStep.email) throw new WorkflowError("VALIDATION", "Two-step sign-in is required for some roles, so keep at least one way (authenticator app or email code) on.");
  if (policy.signup.mode === "domain" && !policy.signup.domains.length) throw new WorkflowError("VALIDATION", "Open sign-up needs at least one allowed email domain, for example myseed.et.");
  // Admin must not lock themselves out: a provider that is the only way in for their role must already be linked.
  for (const id of PROVIDER_IDS) {
    const p = policy.providers[id];
    if (!p.enabled || !p.onlyFor.some((r) => user.roles.includes(r))) continue;
    if (!(await get("SELECT 1 AS x FROM user_identities WHERE user_id = ? AND provider = ?", user.id, id)))
      throw new WorkflowError("VALIDATION", `Link your own account to ${id === "oidc" ? oidc.name || PROVIDER_LABELS.oidc : PROVIDER_LABELS[id]} first (Profile, Account), so you can still sign in.`);
  }
  for (const id of PROVIDER_IDS) delete (policy.providers[id] as { hasSecret?: boolean }).hasSecret;
  const value: Stored = { policy, secrets };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.signin', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(value),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.signin", summary: `${user.name} changed how people sign in`, oldValue: old.policy, newValue: policy });
}
