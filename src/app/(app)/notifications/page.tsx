import { requireViewer } from "@/server/auth";
import Link from "next/link";
import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/primitives";
import { Inbox } from "./notifications-client";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireViewer();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Your actionable inbox. Repeated alerts are grouped, retries never notify twice, and overdue alerts repeat at most once a day."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/preferences#notifications">
              <SettingsIcon /> Notification settings
            </Link>
          </Button>
        }
      />
      <Inbox />
    </div>
  );
}
