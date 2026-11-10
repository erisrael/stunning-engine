import { requireViewer } from "@/server/auth";
import { geofenceConfig } from "@/server/geofence";
import { roleOptions } from "@/server/assistant";
import { PageHeader } from "@/components/app/primitives";
import { PersonalSettings } from "./settings-client";

export const metadata = { title: "Settings" };

// The person's own settings, in one place that fits a phone: look, language, notifications, help, calls, location.
export default async function PreferencesPage() {
  const viewer = await requireViewer();
  const geo = await geofenceConfig();
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="How the app looks and talks to you on this device and your account: appearance, language, notifications, help, calls and location." />
      <PersonalSettings muted={viewer.prefs.mutedNotificationTypes ?? []} emailed={viewer.prefs.emailNotificationTypes ?? []} geofence={geo.mode} assistant={{ shown: viewer.prefs.assistantShown ?? null, roleDefault: (await roleOptions(viewer.activeRole)).shown }} />
    </div>
  );
}
