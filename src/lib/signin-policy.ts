// How people sign in, set by Admin in Admin, Sign-in: password rules, wrong attempts, two-step sign-in, sessions,
// sign-up and other sign-in providers. Stored as one settings entry ('cfg.signin'); secrets are sealed on the server.

import { ROLES, type Role } from "./domain";

export type TwoStepLevel = "off" | "optional" | "required";
export const TWO_STEP_LEVELS: TwoStepLevel[] = ["off", "optional", "required"];
export type SignupMode = "off" | "invite" | "domain";
export const PROVIDER_IDS = ["google", "microsoft", "oidc"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderPolicy = {
  enabled: boolean;
  // Only these email domains may use the provider (empty: any account that matches a person here).
  domains: string[];
  // People holding any of these roles must sign in with this provider (their password is refused).
  onlyFor: Role[];
  // Microsoft: the directory (tenant) ID; other providers: unused.
  tenant?: string;
  // Any OpenID Connect provider: the name on the button and the issuer address.
  name?: string;
  issuer?: string;
  // Microsoft and other providers keep their own client; Google uses the client in "Google sign-in".
  clientId?: string;
  hasSecret?: boolean;
};

export type SessionLimit = { idleMinutes: number; maxHours: number };

export type SignInPolicy = {
  password: { minLength: number; lettersAndNumbers: boolean; breachCheck: boolean; maxAgeDays: number; noReuse: number };
  lockout: { attempts: number; minutes: number; perAddress: number };
  twoStep: { totp: boolean; email: boolean; rememberDays: number; trustProviders: boolean; default: TwoStepLevel; roles: Partial<Record<Role, TwoStepLevel>> };
  sessions: { default: SessionLimit; roles: Partial<Record<Role, SessionLimit>>; newDeviceAlert: boolean };
  signup: { mode: SignupMode; domains: string[]; startRole: Role; inviteDays: number };
  providers: Record<ProviderId, ProviderPolicy>;
};

const SENSITIVE: Role[] = ["admin", "hr_manager", "hr_officer", "finance_manager", "accountant"];

export const DEFAULT_SIGNIN_POLICY: SignInPolicy = {
  password: { minLength: 10, lettersAndNumbers: true, breachCheck: true, maxAgeDays: 0, noReuse: 3 },
  lockout: { attempts: 5, minutes: 15, perAddress: 30 },
  twoStep: { totp: true, email: true, rememberDays: 30, trustProviders: true, default: "optional", roles: Object.fromEntries(SENSITIVE.map((r) => [r, "required"])) },
  sessions: { default: { idleMinutes: 0, maxHours: 14 * 24 }, roles: Object.fromEntries(SENSITIVE.map((r) => [r, { idleMinutes: 8 * 60, maxHours: 7 * 24 }])), newDeviceAlert: true },
  signup: { mode: "off", domains: [], startRole: "recording", inviteDays: 7 },
  providers: {
    google: { enabled: false, domains: [], onlyFor: [] },
    microsoft: { enabled: false, domains: [], onlyFor: [], tenant: "" },
    oidc: { enabled: false, domains: [], onlyFor: [], name: "", issuer: "" },
  },
};

export const SIGNIN_EVENTS = {
  signin: "Signed in",
  failed: "Wrong password",
  locked: "Locked after wrong passwords",
  blocked: "Tried while locked",
  new_device: "New device",
  two_step_failed: "Wrong two-step code",
  two_step_on: "Two-step turned on",
  two_step_off: "Two-step turned off",
  two_step_reset: "Two-step reset by Admin",
  recovery_used: "Recovery code used",
  recovery_new: "New recovery codes",
  provider_linked: "Account linked",
  provider_unlinked: "Account unlinked",
  provider_refused: "Refused",
  invite_used: "Joined from an invitation",
  signup_requested: "Asked for an account",
  signup_approved: "Account approved",
  signup_declined: "Account declined",
} as const;
export type SignInEvent = keyof typeof SIGNIN_EVENTS;
// Events shown in red in the logs.
export const SIGNIN_WARNINGS: SignInEvent[] = ["failed", "locked", "blocked", "two_step_failed", "provider_refused", "new_device"];

export const PROVIDER_LABELS: Record<ProviderId, string> = { google: "Google", microsoft: "Microsoft", oidc: "Single sign-on" };

const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const level = (v: unknown, d: TwoStepLevel) => (TWO_STEP_LEVELS.includes(v as TwoStepLevel) ? (v as TwoStepLevel) : d);
const roleList = (v: unknown) => (Array.isArray(v) ? v.filter((r): r is Role => ROLES.includes(r as Role)) : []);
export const cleanDomains = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,;]+/) : [])
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, ""))
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));

function limit(v: unknown, d: SessionLimit): SessionLimit {
  const o = (v ?? {}) as Partial<SessionLimit>;
  const idle = int(o.idleMinutes, 0, 7 * 24 * 60, d.idleMinutes);
  // Idle sign-out under 15 minutes would sign people out between page loads.
  return { idleMinutes: idle && idle < 15 ? 15 : idle, maxHours: int(o.maxHours, 1, 90 * 24, d.maxHours) };
}

// Fills gaps and clamps values, so an old or hand-edited setting never breaks sign-in.
export function normalizeSignInPolicy(raw: unknown): SignInPolicy {
  const r = (raw ?? {}) as Partial<SignInPolicy>;
  const D = DEFAULT_SIGNIN_POLICY;
  const pw = (r.password ?? {}) as Partial<SignInPolicy["password"]>;
  const lo = (r.lockout ?? {}) as Partial<SignInPolicy["lockout"]>;
  const ts = (r.twoStep ?? {}) as Partial<SignInPolicy["twoStep"]>;
  const se = (r.sessions ?? {}) as Partial<SignInPolicy["sessions"]>;
  const su = (r.signup ?? {}) as Partial<SignInPolicy["signup"]>;
  const pr = (r.providers ?? {}) as Partial<Record<ProviderId, Partial<ProviderPolicy>>>;
  const provider = (id: ProviderId): ProviderPolicy => {
    const p = pr[id] ?? {};
    const base = D.providers[id];
    return {
      ...base,
      enabled: bool(p.enabled, base.enabled),
      domains: cleanDomains(p.domains),
      onlyFor: roleList(p.onlyFor),
      ...(id === "microsoft" ? { tenant: String(p.tenant ?? "").trim() } : {}),
      ...(id === "oidc" ? { name: String(p.name ?? "").trim().slice(0, 40), issuer: String(p.issuer ?? "").trim().replace(/\/+$/, "") } : {}),
      ...(id !== "google" ? { clientId: String(p.clientId ?? "").trim(), hasSecret: !!p.hasSecret } : {}),
    };
  };
  const roleLevels: Partial<Record<Role, TwoStepLevel>> = {};
  for (const [k, v] of Object.entries(ts.roles ?? D.twoStep.roles)) if (ROLES.includes(k as Role)) roleLevels[k as Role] = level(v, "optional");
  const roleLimits: Partial<Record<Role, SessionLimit>> = {};
  for (const [k, v] of Object.entries(se.roles ?? D.sessions.roles)) if (ROLES.includes(k as Role)) roleLimits[k as Role] = limit(v, D.sessions.default);
  return {
    password: {
      minLength: int(pw.minLength, 8, 64, D.password.minLength),
      lettersAndNumbers: bool(pw.lettersAndNumbers, D.password.lettersAndNumbers),
      breachCheck: bool(pw.breachCheck, D.password.breachCheck),
      maxAgeDays: int(pw.maxAgeDays, 0, 730, D.password.maxAgeDays),
      noReuse: int(pw.noReuse, 0, 24, D.password.noReuse),
    },
    lockout: { attempts: int(lo.attempts, 3, 50, D.lockout.attempts), minutes: int(lo.minutes, 1, 24 * 60, D.lockout.minutes), perAddress: int(lo.perAddress, 10, 1000, D.lockout.perAddress) },
    twoStep: {
      totp: bool(ts.totp, D.twoStep.totp),
      email: bool(ts.email, D.twoStep.email),
      rememberDays: int(ts.rememberDays, 0, 90, D.twoStep.rememberDays),
      trustProviders: bool(ts.trustProviders, D.twoStep.trustProviders),
      default: level(ts.default, D.twoStep.default),
      roles: roleLevels,
    },
    sessions: { default: limit(se.default, D.sessions.default), roles: roleLimits, newDeviceAlert: bool(se.newDeviceAlert, D.sessions.newDeviceAlert) },
    signup: {
      mode: (["off", "invite", "domain"] as const).includes(su.mode as SignupMode) ? (su.mode as SignupMode) : D.signup.mode,
      domains: cleanDomains(su.domains),
      startRole: ROLES.includes(su.startRole as Role) && su.startRole !== "admin" && su.startRole !== "owner" ? (su.startRole as Role) : D.signup.startRole,
      inviteDays: int(su.inviteDays, 1, 60, D.signup.inviteDays),
    },
    providers: { google: provider("google"), microsoft: provider("microsoft"), oidc: provider("oidc") },
  };
}

const RANK: Record<TwoStepLevel, number> = { off: 0, optional: 1, required: 2 };

// A person with several roles gets the strictest rule of any of them.
export function twoStepLevelFor(p: SignInPolicy, roles: Role[]): TwoStepLevel {
  let best = roles.length ? ("off" as TwoStepLevel) : p.twoStep.default;
  for (const r of roles) {
    const l = p.twoStep.roles[r] ?? p.twoStep.default;
    if (RANK[l] > RANK[best]) best = l;
  }
  return best;
}

export function sessionLimitFor(p: SignInPolicy, roles: Role[]): SessionLimit {
  const all = (roles.length ? roles : [null]).map((r) => (r && p.sessions.roles[r]) || p.sessions.default);
  const idles = all.map((l) => l.idleMinutes).filter((n) => n > 0);
  return { idleMinutes: idles.length ? Math.min(...idles) : 0, maxHours: Math.min(...all.map((l) => l.maxHours)) };
}

// The password rules in one line, for the forms where people choose a password.
export function passwordHint(p: SignInPolicy["password"]) {
  return [
    `At least ${p.minLength} characters${p.lettersAndNumbers ? " with letters and numbers" : ""}.`,
    p.noReuse ? `Not one of your last ${p.noReuse + 1}.` : "",
    p.breachCheck ? "Not one known from data leaks." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function emailDomain(email: string) {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

export function domainAllowed(domains: string[], email: string) {
  return !domains.length || domains.includes(emailDomain(email));
}
