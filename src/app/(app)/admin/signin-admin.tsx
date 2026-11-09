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
  google: { fromEnv: boolean; clientId: string; hasSecret: boolean; redirectUri: string; googleSignIn?: boolean; googleReset?: boolean };
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
            <li>Open console.cloud.google.com, create a project, then APIs and Services, OAuth consent screen.</li>
            <li>Credentials, Create credentials, OAuth client ID, Web application.</li>
            <li>Under Authorized redirect URIs add the address below, then Create.</li>
            <li>Paste the client ID and secret here and save. Users can also attach their personal/work Gmail on their profile to sign in with Google.</li>
          </ol>
          <div className="flex gap-2">
            <Input readOnly value={google.redirectUri} className="font-mono text-xs" aria-label="Redirect URI" />
            <Button size="icon" variant="outline" aria-label="Copy" onClick={() => navigator.clipboard.writeText(google.redirectUri).then(() => toast.success("Copied"))}>
              <CopyIcon />
            </Button>
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
