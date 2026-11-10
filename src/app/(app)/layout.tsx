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
import { CallLayer } from "@/components/app/call-layer";
import { reportDepartments } from "@/server/owners";
import { myCustomDepartments } from "@/server/departments";
import { can } from "@/server/users";
import { GetStarted } from "@/components/app/get-started";
import { audienceFor } from "@/lib/help";
import { sidebarDefaults } from "@/server/ui-prefs";
import { canOpenPath } from "@/server/page-access";
import { avatarsFor } from "@/server/profiles";
import { touchPresence } from "@/server/chat-extras";
import { PreviewBanner } from "@/components/app/security";
import { ROLE_LABELS } from "@/lib/domain";
import { homeDepartment } from "@/server/nav";
import { assistantContext } from "@/server/assistant";
import { agentAvailable, aiAvailable } from "@/server/assistant-ai";
import { bannerMap, navBrand } from "@/server/branding";
import { SectionBanner } from "@/components/app/section-banner";
import { AnnouncementStrip } from "@/components/app/announcement-strip";
import { pendingAnnouncements } from "@/server/announcements";
import { privacyToAccept } from "@/server/privacy";
import { PrivacyGate } from "@/components/app/privacy-gate";
import { Localizer } from "@/components/app/localizer";
import { EthiopianDatePicker } from "@/components/app/ethiopian-picker";
import { Assistant } from "@/components/app/assistant";
import { OfflineCheckinSync } from "@/components/app/attendance/offline-sync";
import { MobileNav } from "@/components/app/mobile-nav";
import { GeofenceWatch } from "@/components/app/attendance/geofence-watch";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  // Alert checks run after the page is sent, so no visitor waits for them (hosts also call /api/cron/checks).
  after(() => maybeRunScheduledChecks());
  // Online status follows activity anywhere in the app, not only in chat (never while viewing as someone).
  if (!viewer.previewBy) after(() => touchPresence(viewer.id));
  const [counts, cookieStore, settings, users] = await Promise.all([shellCounts(viewer), cookies(), getSettings(), userDirectory()]);
  const sidebarCookie = cookieStore.get("sidebar_state")?.value;
  return (
    <ActionCenter
      users={users}
      destinations={settings.destinations.filter((d) => d.active).map((d) => ({ key: d.key, label: d.label }))}
      isManager={isManager(viewer)}
      timezone={settings.workspace.timezone}
    >
    <CallLayer disabled={!!viewer.previewBy}>
    <SidebarProvider defaultOpen={sidebarCookie !== "false"}>
      <AppSidebar
        cmsAccess={await canOpenPath(viewer, "/legacy-cms")}
        home={await homeDepartment(viewer)}
        studioBooking={(await (await import("@/server/handover-config")).handoverConfig()).studioBooking}
        legacy={(await (await import("@/server/legacy")).legacyConfig()).on}
        sessionsManager={await (await import("@/server/sessions")).canPlanSessions(viewer)}
        identity={await (await import("@/server/identity")).identity()}
        viewerId={viewer.id}
        approver={viewer.leads.length > 0 || can(viewer, "team.view") || can(viewer, "attendance.manage") || can(viewer, "corrections.approve")}
        reportsLink={!can(viewer, "owners.view") && (await reportDepartments(viewer)).length > 0} customDepts={await myCustomDepartments(viewer)} userHidden={viewer.prefs.sidebarHidden ?? []} roleHidden={(await sidebarDefaults())[viewer.activeRole] ?? []} perms={viewer.perms} activeRole={viewer.activeRole} counts={counts} workspaceName={settings.workspace.name} brand={await navBrand()} recognition={(await (await import("@/server/recognition")).recognitionConfig()).enabled} support={await (await import("@/server/support-desk")).supportNav(viewer)} />
      <SidebarInset className="min-w-0">
        {viewer.previewBy && <PreviewBanner name={viewer.name} role={ROLE_LABELS[viewer.activeRole]} />}
        <Topbar user={{ name: viewer.name, email: viewer.email, roles: viewer.roles, avatar: (await avatarsFor([viewer.id]))[viewer.id] ?? null }} activeRole={viewer.activeRole} unread={counts.notifications} chatUnread={counts.chat} qrScan={await (async () => { const c = await (await import("@/server/attendance-capture")).captureConfig(); return c.methods.qr && !!c.methods.scanner; })()} />
        <OfflineCheckinSync />
        <GeofenceWatch />
        {viewer.mustChangePassword && (
          <div className="border-b bg-[var(--st-paused-bg)] px-4 py-2 text-sm text-[var(--st-paused-fg)] no-print">
            You are signed in with a temporary password.{" "}
            <Link href="/profile?force=1" className="font-medium underline underline-offset-2">
              Set your own password now
            </Link>
            .
          </div>
        )}
        <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-3 pt-4 pb-24 sm:px-6 sm:py-6 md:pb-6">
          {!viewer.mustChangePassword && <AnnouncementStrip pending={await pendingAnnouncements(viewer)} />}
          <SectionBanner banners={await bannerMap()} />
          {children}
        </main>
        {await (async () => {
          const h = await homeDepartment(viewer);
          return <MobileNav work={h ? { href: h.base, label: h.kind === "studio" ? "Studio" : "Work" } : (viewer.leads.length || viewer.roles.some((r) => ["recording", "editing", "uploading", "publication"].includes(r))) ? { href: "/my-work", label: "My work" } : null} chat={counts.chat} alerts={counts.notifications} approvals={counts.approvals} />;
        })()}
        <ChatKeyBootstrap viewerId={viewer.id} />
        <Localizer defaultCalendar={settings.workspace.calendarDisplay} />
        <EthiopianDatePicker defaultCalendar={settings.workspace.calendarDisplay} />
        {!viewer.mustChangePassword && !viewer.previewBy && (viewer.prefs.assistantShown ?? (await (await import("@/server/assistant")).roleOptions(viewer.activeRole)).shown) && <Assistant ctx={await assistantContext(viewer)} ai={await aiAvailable(viewer)} agent={await agentAvailable(viewer)} />}
        {!viewer.previewBy && await privacyToAccept(viewer).then((p) => (p ? <PrivacyGate notice={p.notice} version={p.version} updatedAt={p.updatedAt} /> : null))}
        {!viewer.mustChangePassword && <GetStarted audience={audienceFor(viewer.activeRole, viewer.leads)} tour={viewer.prefs.tour ?? {}} />}
      </SidebarInset>
    </SidebarProvider>
    </CallLayer>
    </ActionCenter>
  );
}
