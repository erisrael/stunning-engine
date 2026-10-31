import { requireViewer } from "@/server/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/primitives";
import { Inbox, Preferences } from "./notifications-client";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const viewer = await requireViewer();
  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" description="Your actionable inbox. Repeated alerts are grouped, retries never notify twice, and overdue alerts repeat at most once a day." />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Inbox />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>In-app delivery. Muting an optional type stops new notices of that type; your workflow queues stay visible either way.</CardDescription>
          </CardHeader>
          <CardContent>
            <Preferences muted={viewer.prefs.mutedNotificationTypes ?? []} emailed={viewer.prefs.emailNotificationTypes ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
