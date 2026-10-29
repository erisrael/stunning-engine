import { cookies } from "next/headers";
import Link from "next/link";
import { after } from "next/server";
import { requireViewer } from "@/server/auth";
import { maybeRunScheduledChecks } from "@/server/jobs";
import { shellCounts } from "@/server/shell";
import { getSettings } from "@/server/settings";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import { Topbar } from "@/components/app/topbar";
import { ActionCenter } from "@/components/app/action-center";
import { isManager, userDirectory } from "@/server/users";
import { ChatKeyBootstrap } from "./chat/secure";
import { reportDepartments } from "@/server/owners";
import { can } from "@/server/users";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  // Alert checks run after the page is sent, so no visitor waits for them (hosts also call /api/cron/checks).
  after(() => maybeRunScheduledChecks());
  const [counts, cookieStore, settings, users] = await Promise.all([shellCounts(viewer), cookies(), getSettings(), userDirectory()]);
  const sidebarCookie = cookieStore.get("sidebar_state")?.value;
  return (
    <ActionCenter
      users={users}
      destinations={settings.destinations.filter((d) => d.active).map((d) => ({ key: d.key, label: d.label }))}
      isManager={isManager(viewer)}
      timezone={settings.workspace.timezone}
    >
    <SidebarProvider defaultOpen={sidebarCookie !== "false"}>
      <AppSidebar reportsLink={!can(viewer, "owners.view") && (await reportDepartments(viewer)).length > 0} perms={viewer.perms} activeRole={viewer.activeRole} counts={counts} workspaceName={settings.workspace.name} />
      <SidebarInset className="min-w-0">
        <Topbar user={{ name: viewer.name, email: viewer.email, roles: viewer.roles }} activeRole={viewer.activeRole} unread={counts.notifications} chatUnread={counts.chat} />
        {viewer.mustChangePassword && (
          <div className="border-b bg-[var(--st-paused-bg)] px-4 py-2 text-sm text-[var(--st-paused-fg)] no-print">
            You are signed in with a temporary password.{" "}
            <Link href="/profile?force=1" className="font-medium underline underline-offset-2">
              Set your own password now
            </Link>
            .
          </div>
        )}
        <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
        <ChatKeyBootstrap viewerId={viewer.id} />
      </SidebarInset>
    </SidebarProvider>
    </ActionCenter>
  );
}
