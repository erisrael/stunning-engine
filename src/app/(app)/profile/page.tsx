import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { ROLE_LABELS } from "@/lib/domain";
import { taxonomy } from "@/server/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, UserAvatar } from "@/components/app/primitives";
import { PasswordForm, PrefsForm } from "./profile-client";
import { PushToggle } from "@/components/app/push-toggle";
import { getProfile } from "@/server/profiles";
import { listSessions } from "@/server/devices";
import { ProfileCard } from "@/components/app/profile-card";
import { SessionsTable } from "@/components/app/security";
import { GoogleAccount } from "@/components/app/google-connect";
import { googleConnection } from "@/server/google";
import { LinkedAccounts, SignInHistory, TwoStepCard } from "@/components/app/account-security";
import { myIdentities, myTwoStep, signInLog } from "@/server/signin";
import { readyProviders } from "@/server/oidc";
import { signInPolicy } from "@/server/signin-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { passwordHint, PROVIDER_LABELS, type ProviderId } from "@/lib/signin-policy";

export const metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ force?: string; linked?: string; error?: string }> }) {
  const viewer = await requireViewer();
  const { force, linked, error } = await searchParams;
  const tax = await taxonomy();
  const scope = viewer.scopes.length
    ? viewer.scopes.map((s) => [tax.grades.find((g) => g.id === s.gradeId)?.name, tax.subjects.find((x) => x.id === s.subjectId)?.name].filter(Boolean).join(" ")).join(", ")
    : "All grades and subjects";
  return (
    <div className="space-y-4">
      <PageHeader
        title="Profile and preferences"
        explainer="profile"
        actions={
          <Link href="/profile/help" className="text-sm font-medium text-primary hover:underline">
            Help and training
          </Link>
        }
      />
      {(linked || error) && (
        <Alert variant={error ? "destructive" : "default"}>
          <AlertDescription>{error ? error.slice(0, 200) : `Your ${PROVIDER_LABELS[linked as ProviderId] ?? ""} account is linked. You can now sign in with it.`}</AlertDescription>
        </Alert>
      )}
      <ProfileCard profile={(await getProfile(viewer, viewer.id))!} />
      <h2 className="pt-2 text-lg font-semibold">Account and preferences</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <UserAvatar name={viewer.name} size="md" />
            <div>
              <CardTitle>{viewer.name}</CardTitle>
              <CardDescription>{viewer.email}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Roles</p>
              <div className="mt-1 flex flex-wrap gap-1">{viewer.roles.map((r) => <Badge key={r} variant="secondary">{ROLE_LABELS[r]}</Badge>)}</div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Access scope</p>
              <p>{scope}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Mention handle</p>
              <p className="font-mono">@{viewer.handle}</p>
            </div>
            <p className="text-xs text-muted-foreground">Roles and scope are managed by a manager in Settings. The role switcher in the top bar changes your view only.</p>
          </CardContent>
        </Card>
        <Card className={force ? "border-[var(--st-paused-fg)]" : ""}>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>{force || viewer.mustChangePassword ? "You are using a temporary password. Choose your own to continue." : "Changing it signs out your other sessions."}</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm force={!!force} hint={passwordHint((await signInPolicy()).password)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Theme is in the account menu. Notification types are on the <Link href="/notifications" className="text-primary hover:underline">Notifications</Link> page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PrefsForm density={viewer.prefs.density ?? "comfortable"} landing={viewer.prefs.defaultLanding ?? "/dashboard"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Push notifications</CardTitle>
            <CardDescription>
              Get work alerts and chat messages on this device even when the app is closed. Turn it on separately on each browser or phone. On iPhone and iPad, first use Share,
              Add to Home Screen, then open the app from there.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PushToggle />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Google account</CardTitle>
            <CardDescription>Connect your own Google account to create Google Meet links from group chats and to upload videos to YouTube from the Uploading card.</CardDescription>
          </CardHeader>
          <CardContent>
            <GoogleAccount initial={await googleConnection(viewer.id)} />
          </CardContent>
        </Card>
      </div>
      <h2 id="account" className="scroll-mt-20 pt-2 text-lg font-semibold">
        Sign-in and security
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <TwoStepCard state={await myTwoStep(viewer)} />
        <LinkedAccounts providers={await readyProviders().catch(() => [])} linked={await myIdentities(viewer.id)} />
      </div>
      <SessionsTable rows={await listSessions(viewer)} />
      <div className="space-y-2">
        <h3 className="font-semibold">Your recent sign-ins</h3>
        <p className="text-sm text-muted-foreground">If you see something you did not do, change your password and tell your administrator.</p>
        <SignInHistory rows={await signInLog(viewer, { userId: viewer.id, limit: 20 })} />
      </div>
    </div>
  );
}
