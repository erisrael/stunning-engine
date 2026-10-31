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
import { LeaveSection, MyRecordSection, PaySection } from "@/components/app/profile-sections";
import { myAttendance } from "@/server/attendance";
import { MyAttendance } from "@/components/app/attendance/attendance-ui";
import { getSettings } from "@/server/settings";
import { localParts } from "@/lib/attendance";
import { cn } from "@/lib/utils";

const TABS = [
  ["profile", "Profile"],
  ["record", "My record"],
  ["leave", "Leave"],
  ["pay", "Pay and claims"],
  ["attendance", "Attendance history"],
  ["account", "Account"],
] as const;
type Tab = (typeof TABS)[number][0];

export const metadata = { title: "Profile" };

// Everything about the person in one place, in tabs: their profile, HR record, leave, pay and claims, attendance
// history, and account (password, two-step sign-in, linked accounts, devices).
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string; force?: string; linked?: string; error?: string; month?: string; pay?: string }> }) {
  const viewer = await requireViewer();
  const { force, linked, error, month, pay } = await searchParams;
  const asked = (await searchParams).tab;
  // A forced password change and the return from linking an account land on Account.
  const tab: Tab = TABS.some(([k]) => k === asked) ? (asked as Tab) : force || linked || error ? "account" : "profile";
  const tax = await taxonomy();
  const scope = viewer.scopes.length
    ? viewer.scopes.map((s) => [tax.grades.find((g) => g.id === s.gradeId)?.name, tax.subjects.find((x) => x.id === s.subjectId)?.name].filter(Boolean).join(" ")).join(", ")
    : "All grades and subjects";
  return (
    <div className="space-y-4">
      <PageHeader
        title="Profile"
        explainer="profile"
        actions={
          <Link href="/profile/help" className="text-sm font-medium text-primary hover:underline">
            Help and training
          </Link>
        }
      />
      <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-fit" aria-label="Profile sections">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={k === "profile" ? "/profile" : `/profile?tab=${k}`}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
            aria-current={tab === k ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "record" && <MyRecordSection />}
      {tab === "leave" && <LeaveSection monthParam={month} />}
      {tab === "pay" && <PaySection payTab={pay} />}
      {tab === "attendance" && (await attendanceTab(viewer, month))}
      {(linked || error) && (
        <Alert variant={error ? "destructive" : "default"}>
          <AlertDescription>{error ? error.slice(0, 200) : `Your ${PROVIDER_LABELS[linked as ProviderId] ?? ""} account is linked. You can now sign in with it.`}</AlertDescription>
        </Alert>
      )}
      {tab === "profile" && <ProfileCard profile={(await getProfile(viewer, viewer.id))!} />}
      {tab === "profile" && (
        <div className="grid gap-4 lg:grid-cols-3">
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
      )}
      {tab === "account" && (
      <>
      <div className="grid gap-4 lg:grid-cols-2">
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
      </div>
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
      </>
      )}
    </div>
  );
}

// The month view of the person's attendance (today's check-in stays on the Attendance page).
async function attendanceTab(viewer: Awaited<ReturnType<typeof requireViewer>>, monthParam?: string) {
  const tz = (await getSettings()).workspace.timezone;
  const today = localParts(new Date().toISOString(), tz).date;
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? monthParam! : today.slice(0, 7);
  return <MyAttendance data={await myAttendance(viewer, month)} month={month} today={today} monthLink="/profile?tab=attendance&month=" />;
}
