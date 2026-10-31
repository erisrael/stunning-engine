"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, MailIcon, RotateCcwIcon, SaveIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderMark } from "@/components/app/signin-ui";
import { SignInHistory } from "@/components/app/account-security";
import { createInviteAction, decideSignupAction, resetTwoStepAction, revokeInviteAction, saveSignInPolicyAction, signInLogAction } from "@/app/actions/signin";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/domain";
import { cleanDomains, PROVIDER_IDS, SIGNIN_EVENTS, type ProviderId, type SignInPolicy, type TwoStepLevel } from "@/lib/signin-policy";
import type { InviteRow, SignInLogRow, SignupRequestRow, TwoStepRosterRow } from "@/server/signin";
import { fmtDateTime } from "@/lib/format";

const LEVEL_LABELS: Record<TwoStepLevel, string> = { off: "Off", optional: "Optional", required: "Required" };

export type SignInAdminData = {
  policy: SignInPolicy;
  googleReady: boolean;
  emailReady: boolean;
  redirectUris: Record<ProviderId, string>;
  invites: InviteRow[];
  requests: SignupRequestRow[];
  roster: TwoStepRosterRow[];
  log: SignInLogRow[];
};

function Num({ id, label, value, onChange, min = 0, max, hint, suffix }: { id: string; label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; hint?: string; suffix?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-24" />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ id, label, checked, onChange, hint, disabled }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function RolePicker({ value, onChange }: { value: Role[]; onChange: (r: Role[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {ROLES.map((r) => (
        <label key={r} className="flex items-center gap-1.5 text-sm">
          <Checkbox checked={value.includes(r)} onCheckedChange={(v) => onChange(v === true ? [...value, r] : value.filter((x) => x !== r))} />
          {ROLE_LABELS[r]}
        </label>
      ))}
    </div>
  );
}

function Copyable({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="font-mono text-xs" aria-label={label} />
      <Button size="icon" variant="outline" aria-label={`Copy ${label}`} onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"))}>
        <CopyIcon />
      </Button>
    </div>
  );
}

export function SignInPolicyAdmin({ data }: { data: SignInAdminData }) {
  const router = useRouter();
  const [p, setP] = React.useState<SignInPolicy>(data.policy);
  const [secrets, setSecrets] = React.useState<Partial<Record<ProviderId, string | null>>>({});
  const [domainText, setDomainText] = React.useState({ signup: data.policy.signup.domains.join(", "), ...Object.fromEntries(PROVIDER_IDS.map((id) => [id, data.policy.providers[id].domains.join(", ")])) } as Record<"signup" | ProviderId, string>);
  const [saving, setSaving] = React.useState(false);
  const dirty = JSON.stringify(p) !== JSON.stringify(data.policy) || Object.keys(secrets).length > 0;

  const set = <K extends keyof SignInPolicy>(k: K, v: Partial<SignInPolicy[K]>) => setP((o) => ({ ...o, [k]: { ...o[k], ...v } }));
  const setProvider = (id: ProviderId, v: Partial<SignInPolicy["providers"][ProviderId]>) => setP((o) => ({ ...o, providers: { ...o.providers, [id]: { ...o.providers[id], ...v } } }));

  const save = async () => {
    setSaving(true);
    const r = await saveSignInPolicyAction({ policy: p, secrets });
    setSaving(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Sign-in settings saved");
    setSecrets({});
    router.refresh();
  };

  const saveBar = (
    <div className="sticky bottom-3 z-10 flex justify-end">
      <Button onClick={save} disabled={!dirty || saving} className="shadow-lg">
        <SaveIcon /> {dirty ? "Save sign-in settings" : "Saved"}
      </Button>
    </div>
  );

  return (
    <Tabs defaultValue="rules" className="space-y-4">
      <TabsList className="flex-wrap">
        <TabsTrigger value="rules">Rules</TabsTrigger>
        <TabsTrigger value="providers">Google, Microsoft, SSO</TabsTrigger>
        <TabsTrigger value="signup">Sign-up {data.requests.filter((r) => r.status === "pending").length > 0 && <Badge className="ml-1">{data.requests.filter((r) => r.status === "pending").length}</Badge>}</TabsTrigger>
        <TabsTrigger value="people">Two-step by person</TabsTrigger>
        <TabsTrigger value="log">Sign-in log</TabsTrigger>
      </TabsList>

      <TabsContent value="rules" className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Passwords</CardTitle>
              <CardDescription>Applied when someone chooses a new password. Existing passwords keep working.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-6">
                <Num id="pw-min" label="Shortest" value={p.password.minLength} min={8} max={64} suffix="characters" onChange={(n) => set("password", { minLength: n })} />
                <Num id="pw-age" label="Change every" value={p.password.maxAgeDays} max={730} suffix="days (0: never)" onChange={(n) => set("password", { maxAgeDays: n })} />
                <Num id="pw-reuse" label="Cannot reuse the last" value={p.password.noReuse} max={24} suffix="passwords" onChange={(n) => set("password", { noReuse: n })} />
              </div>
              <Toggle id="pw-ln" label="Letters and numbers both" checked={p.password.lettersAndNumbers} onChange={(v) => set("password", { lettersAndNumbers: v })} />
              <Toggle
                id="pw-leak"
                label="Refuse passwords from known data leaks"
                checked={p.password.breachCheck}
                onChange={(v) => set("password", { breachCheck: v })}
                hint="Checked with Have I Been Pwned. Only the first 5 characters of a scrambled form of the password are sent, never the password."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Wrong attempts</CardTitle>
              <CardDescription>After too many wrong passwords the account waits, each time twice as long (at most a day). The person and Admin are told.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-6">
              <Num id="lo-n" label="Wrong passwords allowed" value={p.lockout.attempts} min={3} max={50} onChange={(n) => set("lockout", { attempts: n })} />
              <Num id="lo-min" label="Then wait" value={p.lockout.minutes} min={1} max={1440} suffix="minutes" onChange={(n) => set("lockout", { minutes: n })} />
              <Num
                id="lo-ip"
                label="Failures from one address"
                value={p.lockout.perAddress}
                min={10}
                max={1000}
                onChange={(n) => set("lockout", { perAddress: n })}
                hint="Then that address waits too. Keep it high if the whole office shares one address."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Two-step sign-in</CardTitle>
              <CardDescription>After the password, a code from a phone app or by email. Set who needs it per role below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Toggle id="ts-app" label="Authenticator apps" checked={p.twoStep.totp} onChange={(v) => set("twoStep", { totp: v })} hint="Google Authenticator, Microsoft Authenticator, Authy. Works offline; the safest choice." />
              <Toggle
                id="ts-email"
                label="Code by email"
                checked={p.twoStep.email}
                onChange={(v) => set("twoStep", { email: v })}
                hint={data.emailReady ? "Also a fallback for people without an app." : "Email is not set up (Email, Settings), so codes cannot be sent yet."}
              />
              <Toggle
                id="ts-prov"
                label="Google, Microsoft and SSO count as both steps"
                checked={p.twoStep.trustProviders}
                onChange={(v) => set("twoStep", { trustProviders: v })}
                hint="They have their own two-step sign-in. Turn off to ask for our code after them too."
              />
              <div className="flex flex-wrap gap-6">
                <Num id="ts-rem" label="Remember a device for" value={p.twoStep.rememberDays} max={90} suffix="days (0: ask every time)" onChange={(n) => set("twoStep", { rememberDays: n })} />
                <div className="space-y-1">
                  <Label>Roles not listed below</Label>
                  <Select value={p.twoStep.default} onValueChange={(v) => set("twoStep", { default: v as TwoStepLevel })}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(LEVEL_LABELS) as TwoStepLevel[]).map((l) => (
                        <SelectItem key={l} value={l}>
                          {LEVEL_LABELS[l]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
              <CardDescription>How long people stay signed in. Shorter limits per role are set below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-6">
                <Num id="se-idle" label="Sign out after no use for" value={p.sessions.default.idleMinutes} max={10080} suffix="minutes (0: never)" onChange={(n) => set("sessions", { default: { ...p.sessions.default, idleMinutes: n } })} />
                <Num id="se-max" label="Sign in again after" value={p.sessions.default.maxHours} min={1} max={2160} suffix="hours" onChange={(n) => set("sessions", { default: { ...p.sessions.default, maxHours: n } })} />
              </div>
              <Toggle id="se-new" label="Alert on a sign-in from a new device" checked={p.sessions.newDeviceAlert} onChange={(v) => set("sessions", { newDeviceAlert: v })} hint="In the app and by email, with the browser and address." />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Per role</CardTitle>
            <CardDescription>Someone with several roles gets the strictest of them. Empty session boxes use the defaults above.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Two-step</TableHead>
                  <TableHead>Sign out after no use (minutes)</TableHead>
                  <TableHead>Sign in again after (hours)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROLES.map((r) => {
                  const lim = p.sessions.roles[r];
                  const setLim = (v: Partial<{ idleMinutes: number; maxHours: number }> | null) =>
                    setP((o) => {
                      const roles = { ...o.sessions.roles };
                      if (v === null) delete roles[r];
                      else roles[r] = { ...(roles[r] ?? o.sessions.default), ...v };
                      return { ...o, sessions: { ...o.sessions, roles } };
                    });
                  return (
                    <TableRow key={r}>
                      <TableCell className="font-medium">{ROLE_LABELS[r]}</TableCell>
                      <TableCell>
                        <Select
                          value={p.twoStep.roles[r] ?? "default"}
                          onValueChange={(v) =>
                            setP((o) => {
                              const roles = { ...o.twoStep.roles };
                              if (v === "default") delete roles[r];
                              else roles[r] = v as TwoStepLevel;
                              return { ...o, twoStep: { ...o.twoStep, roles } };
                            })
                          }
                        >
                          <SelectTrigger className="w-36" aria-label={`Two-step for ${ROLE_LABELS[r]}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Default ({LEVEL_LABELS[p.twoStep.default]})</SelectItem>
                            {(Object.keys(LEVEL_LABELS) as TwoStepLevel[]).map((l) => (
                              <SelectItem key={l} value={l}>
                                {LEVEL_LABELS[l]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-24"
                          aria-label={`Idle minutes for ${ROLE_LABELS[r]}`}
                          placeholder={String(p.sessions.default.idleMinutes)}
                          value={lim ? lim.idleMinutes : ""}
                          onChange={(e) => setLim(e.target.value === "" && !lim?.maxHours ? null : { idleMinutes: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell className="flex items-center gap-2">
                        <Input
                          type="number"
                          className="w-24"
                          aria-label={`Maximum hours for ${ROLE_LABELS[r]}`}
                          placeholder={String(p.sessions.default.maxHours)}
                          value={lim ? lim.maxHours : ""}
                          onChange={(e) => setLim({ maxHours: Number(e.target.value) || p.sessions.default.maxHours })}
                        />
                        {lim && (
                          <Button size="icon" variant="ghost" aria-label="Use defaults" onClick={() => setLim(null)}>
                            <RotateCcwIcon />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {saveBar}
      </TabsContent>

      <TabsContent value="providers" className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Let people sign in with their company Google Workspace, Microsoft 365 or another OpenID Connect account. A sign-in matches the account here with the same email (the provider must confirm the
          address). People can also link accounts on Profile, Account.
        </p>
        <div className="grid gap-4 xl:grid-cols-3">
          {PROVIDER_IDS.map((id) => {
            const pr = p.providers[id];
            return (
              <Card key={id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ProviderMark id={id} /> {id === "google" ? "Google" : id === "microsoft" ? "Microsoft 365" : "Other provider (OpenID Connect)"}
                  </CardTitle>
                  <CardDescription>
                    {id === "google"
                      ? data.googleReady
                        ? "Uses the Google client set up in Google sign-in (below on this page). Add the address here to its Authorized redirect URIs."
                        : "Set up the Google client first (Google sign-in, below on this page)."
                      : id === "microsoft"
                        ? "Azure portal, Microsoft Entra ID, App registrations, New registration (single tenant). Add the address below as a Web redirect URI, then make a client secret."
                        : "Zoho, Keycloak, Okta, Auth0 and others. Register a web application there with the address below."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Toggle id={`pv-${id}`} label="Allow signing in with it" checked={pr.enabled} onChange={(v) => setProvider(id, { enabled: v })} disabled={id === "google" && !data.googleReady && !pr.enabled} />
                  <div className="space-y-1">
                    <Label>Redirect address</Label>
                    <Copyable value={data.redirectUris[id]} label="redirect address" />
                  </div>
                  {id === "oidc" && (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="oidc-name">Name on the button</Label>
                        <Input id="oidc-name" value={pr.name ?? ""} onChange={(e) => setProvider(id, { name: e.target.value })} placeholder="Zoho" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="oidc-iss">Issuer address</Label>
                        <Input id="oidc-iss" value={pr.issuer ?? ""} onChange={(e) => setProvider(id, { issuer: e.target.value })} placeholder="https://accounts.zoho.com" />
                      </div>
                    </>
                  )}
                  {id === "microsoft" && (
                    <div className="space-y-1">
                      <Label htmlFor="ms-tenant">Directory (tenant) ID</Label>
                      <Input id="ms-tenant" value={pr.tenant ?? ""} onChange={(e) => setProvider(id, { tenant: e.target.value })} placeholder="00000000-0000-0000-0000-000000000000" />
                    </div>
                  )}
                  {id !== "google" && (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor={`${id}-cid`}>Client ID</Label>
                        <Input id={`${id}-cid`} value={pr.clientId ?? ""} onChange={(e) => setProvider(id, { clientId: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${id}-sec`}>Client secret</Label>
                        <Input
                          id={`${id}-sec`}
                          type="password"
                          autoComplete="off"
                          value={secrets[id] ?? ""}
                          onChange={(e) => setSecrets((s) => ({ ...s, [id]: e.target.value }))}
                          placeholder={pr.hasSecret ? "Saved; paste to replace" : ""}
                        />
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-dom`}>Only these email domains</Label>
                    <Input
                      id={`${id}-dom`}
                      value={domainText[id]}
                      onChange={(e) => (setDomainText((d) => ({ ...d, [id]: e.target.value })), setProvider(id, { domains: cleanDomains(e.target.value) }))}
                      placeholder="myseed.et (empty: any)"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>The only way in for these roles</Label>
                    <RolePicker value={pr.onlyFor} onChange={(r) => setProvider(id, { onlyFor: r })} />
                    <p className="text-xs text-muted-foreground">Their password stops working. Link your own account first if you tick your role.</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {saveBar}
      </TabsContent>

      <TabsContent value="signup" className="space-y-4">
        <SignupSettings p={p} set={set} domainText={domainText.signup} setDomainText={(v) => (setDomainText((d) => ({ ...d, signup: v })), set("signup", { domains: cleanDomains(v) }))} />
        {saveBar}
        <Invites data={data} mode={data.policy.signup.mode} />
        <Requests rows={data.requests} defaultRole={data.policy.signup.startRole} />
      </TabsContent>

      <TabsContent value="people">
        <Roster rows={data.roster} />
      </TabsContent>

      <TabsContent value="log">
        <LogView initial={data.log} people={data.roster} />
      </TabsContent>
    </Tabs>
  );
}

function SignupSettings({ p, set, domainText, setDomainText }: { p: SignInPolicy; set: <K extends keyof SignInPolicy>(k: K, v: Partial<SignInPolicy[K]>) => void; domainText: string; setDomainText: (v: string) => void }) {
  const modes = [
    ["off", "Off", "Only Admin (and HR, when hiring) adds people. As today."],
    ["invite", "By invitation", "Admin sends a link; the person sets their own name and password. The link works once."],
    ["domain", "Open to company emails", "Anyone with an allowed email domain asks for an account; Admin approves it and the role."],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-up</CardTitle>
        <CardDescription>How new people get an account. New accounts are linked to their HR record when it has the same email.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3">
          {modes.map(([m, label, hint]) => (
            <button
              key={m}
              type="button"
              onClick={() => set("signup", { mode: m })}
              aria-pressed={p.signup.mode === m}
              className={`rounded-lg border p-3 text-left text-sm ${p.signup.mode === m ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}
            >
              <p className="font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-6">
          {p.signup.mode === "domain" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="su-dom">Allowed email domains</Label>
                <Input id="su-dom" value={domainText} onChange={(e) => setDomainText(e.target.value)} placeholder="myseed.et" className="w-64" />
              </div>
              <div className="space-y-1">
                <Label>Starting role</Label>
                <Select value={p.signup.startRole} onValueChange={(v) => set("signup", { startRole: v as Role })}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.filter((r) => r !== "admin" && r !== "owner").map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {p.signup.mode !== "off" && <Num id="su-days" label="Invitation links work for" value={p.signup.inviteDays} min={1} max={60} suffix="days" onChange={(n) => set("signup", { inviteDays: n })} />}
        </div>
      </CardContent>
    </Card>
  );
}

function Invites({ data, mode }: { data: SignInAdminData; mode: SignInPolicy["signup"]["mode"] }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("recording");
  const [send, setSend] = React.useState(true);
  const [link, setLink] = React.useState<string | null>(null);
  if (mode === "off") return null;
  const create = async () => {
    const r = await createInviteAction({ email: email || null, role, send });
    if (!r.ok) return void toast.error(r.error);
    setLink(r.data!.link);
    toast.success(r.data!.sent ? "Invitation emailed" : "Invitation link ready");
    setEmail("");
    router.refresh();
  };
  const now = new Date().toISOString();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitations</CardTitle>
        <CardDescription>With an email, only that address can use it. Without one, anyone with the link can, once.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="inv-email">Email (optional)</Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-64" placeholder="name@myseed.et" />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-48" aria-label="Invitation role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {email && data.emailReady && (
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Checkbox checked={send} onCheckedChange={(v) => setSend(v === true)} /> Email it
            </label>
          )}
          <Button onClick={create}>
            <MailIcon /> Make invitation
          </Button>
        </div>
        {link && (
          <div className="space-y-1">
            <Label>Link (shown once; copy it now)</Label>
            <Copyable value={link} label="invitation link" />
          </div>
        )}
        {data.invites.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>For</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>By</TableHead>
                <TableHead>State</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invites.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.email ?? "Anyone with the link"}</TableCell>
                  <TableCell>{ROLE_LABELS[i.role]}</TableCell>
                  <TableCell className="text-muted-foreground">{i.createdBy}</TableCell>
                  <TableCell>{i.usedAt ? `Used by ${i.usedBy ?? "someone"}, ${fmtDateTime(i.usedAt)}` : i.expiresAt < now ? "Expired" : `Open until ${fmtDateTime(i.expiresAt)}`}</TableCell>
                  <TableCell className="text-right">
                    {!i.usedAt && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove invitation"
                        onClick={async () => {
                          const r = await revokeInviteAction(i.id);
                          if (!r.ok) return void toast.error(r.error);
                          router.refresh();
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Requests({ rows, defaultRole }: { rows: SignupRequestRow[]; defaultRole: Role }) {
  const router = useRouter();
  const [roles, setRoles] = React.useState<Record<string, Role>>({});
  if (!rows.length) return null;
  const decide = async (id: string, approve: boolean) => {
    const r = await decideSignupAction(id, approve, roles[id] ?? defaultRole);
    if (!r.ok) return void toast.error(r.error);
    toast.success(approve ? "Account made; they were emailed" : "Declined");
    router.refresh();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account requests</CardTitle>
        <CardDescription>From the sign-up page or a first sign-in with Google, Microsoft or SSO.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>With</TableHead>
              <TableHead>Asked</TableHead>
              <TableHead>Role</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.email}</TableCell>
                <TableCell className="text-muted-foreground">{r.via}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDateTime(r.createdAt)}</TableCell>
                <TableCell>
                  {r.status === "pending" ? (
                    <Select value={roles[r.id] ?? defaultRole} onValueChange={(v) => setRoles((o) => ({ ...o, [r.id]: v as Role }))}>
                      <SelectTrigger className="w-44" aria-label={`Role for ${r.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.filter((x) => x !== "owner").map((x) => (
                          <SelectItem key={x} value={x}>
                            {ROLE_LABELS[x]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-muted-foreground">
                      {r.status === "approved" ? "Approved" : "Declined"} by {r.decidedBy}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {r.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => decide(r.id, true)}>
                        <CheckIcon /> Approve
                      </Button>{" "}
                      <Button size="sm" variant="ghost" onClick={() => decide(r.id, false)}>
                        <XIcon /> Decline
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Roster({ rows }: { rows: TwoStepRosterRow[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const missing = rows.filter((r) => r.level === "required" && !r.on).length;
  const shown = rows.filter((r) => !q || `${r.name} ${r.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card>
      <CardHeader>
        <CardTitle>People and two-step sign-in</CardTitle>
        <CardDescription>
          {missing ? `${missing} ${missing === 1 ? "person needs" : "people need"} two-step sign-in and have no app yet: they get an email code, or set up an app at their next sign-in. ` : ""}
          Reset someone who lost their phone and recovery codes: they set it up again at their next sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="max-w-xs" aria-label="Search people" />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Two-step for their roles</TableHead>
                <TableHead>Authenticator app</TableHead>
                <TableHead>Linked accounts</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.roles.map((x) => ROLE_LABELS[x]).join(", ")}</p>
                  </TableCell>
                  <TableCell>{LEVEL_LABELS[r.level]}</TableCell>
                  <TableCell>{r.on ? <Badge variant="secondary">On</Badge> : <span className={r.level === "required" ? "text-destructive" : "text-muted-foreground"}>Not set up</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{r.providers.join(", ")}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{r.lastSignIn ? fmtDateTime(r.lastSignIn) : "Never"}</TableCell>
                  <TableCell className="text-right">
                    {r.on && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (!confirm(`Reset two-step sign-in for ${r.name}? Their sessions end and they set it up again.`)) return;
                          const res = await resetTwoStepAction(r.id);
                          if (!res.ok) return void toast.error(res.error);
                          toast.success("Reset");
                          router.refresh();
                        }}
                      >
                        <RotateCcwIcon /> Reset
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function LogView({ initial, people }: { initial: SignInLogRow[]; people: TwoStepRosterRow[] }) {
  const [rows, setRows] = React.useState(initial);
  const [userId, setUserId] = React.useState("all");
  const [event, setEvent] = React.useState("all");
  React.useEffect(() => {
    if (userId === "all" && event === "all") return void setRows(initial);
    signInLogAction({ userId: userId === "all" ? undefined : userId, event: event === "all" ? undefined : event }).then((r) => (r.ok ? setRows(r.data!) : toast.error(r.error)));
  }, [userId, event, initial]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="w-56" aria-label="Person">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={event} onValueChange={setEvent}>
          <SelectTrigger className="w-56" aria-label="What happened">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            {Object.entries(SIGNIN_EVENTS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SignInHistory rows={rows} everyone />
    </div>
  );
}
