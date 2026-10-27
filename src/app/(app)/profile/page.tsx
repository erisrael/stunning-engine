import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { ROLE_LABELS } from "@/lib/domain";
import { taxonomy } from "@/server/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, UserAvatar } from "@/components/app/primitives";
import { PasswordForm, PrefsForm } from "./profile-client";

export const metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ force?: string }> }) {
  const viewer = await requireViewer();
  const { force } = await searchParams;
  const tax = await taxonomy();
  const scope = viewer.scopes.length
    ? viewer.scopes.map((s) => [tax.grades.find((g) => g.id === s.gradeId)?.name, tax.subjects.find((x) => x.id === s.subjectId)?.name].filter(Boolean).join(" ")).join(", ")
    : "All grades and subjects";
  return (
    <div className="space-y-4">
      <PageHeader title="Profile and preferences" />
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
            <PasswordForm force={!!force} />
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
      </div>
    </div>
  );
}
