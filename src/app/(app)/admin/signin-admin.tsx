"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveGoogleSettingsAction } from "@/app/actions/auth";

// Admin connects a Google OAuth client so people can prove their Gmail address to reset a forgotten password.
export function SignInAdmin({ google, emailReady }: { google: { fromEnv: boolean; clientId: string; hasSecret: boolean; redirectUri: string }; emailReady: boolean }) {
  const router = useRouter();
  const [clientId, setClientId] = React.useState(google.clientId);
  const [secret, setSecret] = React.useState("");
  const save = async (off = false) => {
    const r = await saveGoogleSettingsAction(off ? { clientId: "" } : { clientId, secret: secret || null });
    if (!r.ok) return void toast.error(r.error);
    toast.success(off ? "Google turned off" : "Google saved");
    setSecret("");
    router.refresh();
  };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Forgotten passwords</CardTitle>
          <CardDescription>People can reset a forgotten password from the sign-in page in two ways.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <b>Email link:</b> {emailReady ? "ready. The link goes out through the email account in Email, Settings." : "set up email first (Email, Settings), otherwise the link cannot be sent."}
          </p>
          <p>
            <b>Reset with Google:</b> {google.clientId && google.hasSecret ? "ready." : "not set up yet."} People choose the Google (Gmail or Workspace) account with the same email as their account here.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Google sign-in</CardTitle>
          <CardDescription>Free. Takes about five minutes in the Google Cloud console.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Open console.cloud.google.com, create a project, then APIs and Services, OAuth consent screen: External, app name Myseed, your email.</li>
            <li>Credentials, Create credentials, OAuth client ID, Web application.</li>
            <li>Under Authorized redirect URIs add the address below, then Create.</li>
            <li>Paste the client ID and secret here and save. Publish the consent screen so everyone can use it.</li>
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
                  Save
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
    </div>
  );
}
