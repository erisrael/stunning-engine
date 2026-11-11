"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveGoogleSettingsAction } from "@/app/actions/auth";
import { saveProfileFieldsConfigAction } from "@/app/actions/profile";
import { PROFILE_FIELDS, type ProfileFieldKey } from "@/lib/profile-fields";

// Admin connects a Google OAuth client so people can prove their Gmail address to reset a forgotten password or sign in.
export function SignInAdmin({
  google,
  emailReady,
  profileFields,
}: {
  google: {
    fromEnv: boolean;
    clientId: string;
    hasSecret: boolean;
    redirectUri: string;
    redirectUris?: string[];
    origin?: string;
    googleSignIn?: boolean;
    googleReset?: boolean;
  };
  emailReady: boolean;
  profileFields?: { editable: ProfileFieldKey[] };
}) {
  const router = useRouter();
  const [clientId, setClientId] = React.useState(google.clientId);
  const [secret, setSecret] = React.useState("");
  const [googleSignIn, setGoogleSignIn] = React.useState(google.googleSignIn ?? true);
  const [googleReset, setGoogleReset] = React.useState(google.googleReset ?? true);
  const [editable, setEditable] = React.useState<ProfileFieldKey[]>(profileFields?.editable ?? PROFILE_FIELDS.map((f) => f.key));
  const [savingFields, setSavingFields] = React.useState(false);

  const save = async (off = false) => {
    const r = await saveGoogleSettingsAction(
      off
        ? { clientId: "" }
        : { clientId, secret: secret || null, googleSignIn, googleReset }
    );
    if (!r.ok) return void toast.error(r.error);
    toast.success(off ? "Google turned off" : "Google settings saved");
    setSecret("");
    router.refresh();
  };

  const saveFields = async () => {
    setSavingFields(true);
    try {
      const r = await saveProfileFieldsConfigAction(editable);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Profile field editability saved");
      router.refresh();
    } finally {
      setSavingFields(false);
    }
  };

  const toggleField = (key: ProfileFieldKey, on: boolean) => {
    setEditable((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Forgotten passwords</CardTitle>
          <CardDescription>People can reset a forgotten password from the sign-in page in two ways.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <b>Email link:</b> {emailReady ? "ready. The link goes out through the email account in Email, Settings." : "set up email first (Email, Settings), otherwise the link cannot be sent."}
          </p>
          <p>
            <b>Reset with Google:</b> {google.clientId && google.hasSecret ? (googleReset ? "ready (enabled)." : "disabled by admin.") : "not set up yet."} People choose the Google account with their work email or attached Gmail.
          </p>
          <div className="pt-2 border-t space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={googleReset} onCheckedChange={setGoogleReset} aria-label="Allow password reset via Google" />
              <span>Allow password reset via Google / Gmail</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={googleSignIn} onCheckedChange={setGoogleSignIn} aria-label="Allow direct Sign in with Google" />
              <span>Allow direct &ldquo;Sign in with Google&rdquo; on login page</span>
            </label>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Google sign-in & auth client</CardTitle>
          <CardDescription>Free OAuth client configured in Google Cloud Console.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground text-xs">
            <li>Open console.cloud.google.com, select your project, go to <strong>APIs &amp; Services &rarr; Credentials</strong>.</li>
            <li>Create or edit your <strong>OAuth 2.0 Client ID</strong> (Application type: <em>Web application</em>).</li>
            <li>Add to <strong>Authorized JavaScript origins</strong>:
              <div className="mt-1 flex flex-wrap gap-1 font-mono text-[11px] text-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5">https://ops.myseed.com.et</span>
                <span className="rounded bg-muted px-1.5 py-0.5">https://myseedops.tech</span>
              </div>
            </li>
            <li>Add all required callback paths to <strong>Authorized redirect URIs</strong> below:</li>
          </ol>
          <div className="space-y-1.5 rounded-lg border bg-muted/40 p-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span>Authorized Redirect URIs ({google.redirectUris?.length ?? 1})</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-xs"
                onClick={() => {
                  const list = (google.redirectUris ?? [google.redirectUri]).join("\n");
                  navigator.clipboard.writeText(list).then(() => toast.success("Copied all redirect URIs"));
                }}
              >
                <CopyIcon className="size-3" /> Copy All
              </Button>
            </div>
            {(google.redirectUris ?? [google.redirectUri]).map((uri) => (
              <div key={uri} className="flex items-center gap-1.5">
                <Input readOnly value={uri} className="h-7 font-mono text-[11px]" aria-label="Redirect URI" />
                <Button
                  size="icon"
                  variant="outline"
                  className="size-7 shrink-0"
                  aria-label="Copy URI"
                  onClick={() => navigator.clipboard.writeText(uri).then(() => toast.success("Copied"))}
                >
                  <CopyIcon className="size-3" />
                </Button>
              </div>
            ))}
          </div>
          {google.fromEnv ? (
            <p className="text-muted-foreground">Set in the hosting environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="g-id">Client ID</Label>
                <Input id="g-id" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234-abc.apps.googleusercontent.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-secret">Client secret</Label>
                <Input id="g-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={google.hasSecret ? "Saved; paste to replace" : "GOCSPX-..."} autoComplete="off" />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => save()} disabled={!clientId.trim()}>
                  Save Google settings
                </Button>
                {google.clientId && (
                  <Button variant="ghost" onClick={() => save(true)}>
                    Turn off
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4" /> Editable profile fields policy
          </CardTitle>
          <CardDescription>
            Choose which profile fields regular users are permitted to edit. Unchecked fields are locked as read-only for regular users and can only be configured by administrators.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {PROFILE_FIELDS.map((f) => (
              <label key={f.key} className="flex items-start gap-2 text-sm rounded border p-2 cursor-pointer hover:bg-muted/50">
                <Checkbox
                  checked={editable.includes(f.key)}
                  onCheckedChange={(checked) => toggleField(f.key, !!checked)}
                  aria-label={f.label}
                  className="mt-0.5"
                />
                <div>
                  <span className="font-medium text-xs block">{f.label}</span>
                  <span className="text-[11px] text-muted-foreground">{editable.includes(f.key) ? "Editable by user" : "Locked (Admin only)"}</span>
                </div>
              </label>
            ))}
          </div>
          <Button onClick={saveFields} disabled={savingFields}>
            Save editable profile fields
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
