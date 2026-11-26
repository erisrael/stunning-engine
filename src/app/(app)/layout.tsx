import { AskAnywhere, Assistant, EthiopianDatePicker, FunMode, GetStarted, TerminalAmbient } from "@/components/app/lazy-shell";
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
import { StyleEffects } from "@/components/app/style-effects";
import { MotionDirector } from "@/components/app/motion-director";
import { OfflineCheckinSync } from "@/components/app/attendance/offline-sync";
import { MobileNav } from "@/components/app/mobile-nav";
import { GeofenceWatch } from "@/components/app/attendance/geofence-watch";
import { PresencePing } from "@/components/app/presence-ping";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  // Alert checks run after the page is sent, so no visitor waits for them (hosts also call /api/cron/checks).
  after(() => maybeRunScheduledChecks());
  // Online status follows activity anywhere in the app, not only in chat (never while viewing as someone).
  if (!viewer.previewBy) after(() => touchPresence(viewer.id));
  const mod = {
    assistant: import("@/server/assistant"),
    chapa: import("@/server/chapa-access"),
    handover: import("@/server/handover-config"),
    legacy: import("@/server/legacy"),
    sessions: import("@/server/sessions"),
    identity: import("@/server/identity"),
    recognition: import("@/server/recognition"),
    overview: import("@/server/overview-teams"),
    support: import("@/server/support-desk"),
    callRecords: import("@/server/call-records"),
    fun: import("@/server/fun"),
    capture: import("@/server/attendance-capture"),
  };
  // Everything the shell needs, asked for at once. They were asked one after another (some two or three times) on
  // every page and every refresh, so the shell waited for the sum of them instead of the slowest one.
  const quiet = !viewer.previewBy && !viewer.mustChangePassword;
  const [
    counts,
    cookieStore,
    settings,
    users,
    home,
    cmsAccess,
    chapaAccess,
    handover,
    legacy,
    sessionsManager,
    ident,
    reportDepts,
    customDepts,
    roleSidebars,
    brand,
    recognition,
    overviewStages,
    support,
    callRecords,
    fun,
    capture,
    avatars,
    announcements,
    banners,
    privacy,
    assistantOn,
  ] = await Promise.all([
    shellCounts(viewer),
    cookies(),
    getSettings(),
    userDirectory(),
    homeDepartment(viewer),
    canOpenPath(viewer, "/legacy-cms"),
    mod.chapa.then((m) => m.hasChapaGrant(viewer)).catch(() => false),
    mod.handover.then((m) => m.handoverConfig()),
    mod.legacy.then((m) => m.legacyConfig()),
    mod.sessions.then((m) => m.canPlanSessions(viewer)),
    mod.identity.then((m) => m.identity()),
    can(viewer, "owners.view") ? Promise.resolve([] as string[]) : reportDepartments(viewer),
    myCustomDepartments(viewer),
    sidebarDefaults(),
    navBrand(),
    mod.recognition.then((m) => m.recognitionConfig()),
    mod.overview.then((m) => m.overviewStagesFor(viewer)),
    mod.support.then((m) => m.supportNav(viewer)),
    mod.callRecords.then((m) => m.canOpenCallRecords(viewer)).catch(() => false),
    quiet ? mod.fun.then((m) => m.funFor(viewer)).catch(() => null) : Promise.resolve(null),
    mod.capture.then((m) => m.captureConfig()),
    avatarsFor([viewer.id]),
    viewer.mustChangePassword ? Promise.resolve(null) : pendingAnnouncements(viewer),
    bannerMap(),
    viewer.previewBy ? Promise.resolve(null) : privacyToAccept(viewer),
    !quiet ? Promise.resolve(false) : viewer.prefs.assistantShown != null ? Promise.resolve(!!viewer.prefs.assistantShown) : mod.assistant.then(async (m) => !!(await m.roleOptions(viewer.activeRole)).shown),
  ]);
  const sidebarCookie = cookieStore.get("sidebar_state")?.value;
  const funOn = !!fun;
  const qrScan = capture.methods.qr && !!capture.methods.scanner;
  const [assistantCtx, ai, agent] = assistantOn ? await Promise.all([assistantContext(viewer), aiAvailable(viewer), agentAvailable(viewer)]) : [null, false, false];
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
        cmsAccess={cmsAccess}
        chapaAccess={chapaAccess}
        home={home}
        studioBooking={handover.studioBooking}
        legacy={legacy.on}
        sessionsManager={sessionsManager}
        identity={ident}
        viewerId={viewer.id}
        approver={viewer.leads.length > 0 || can(viewer, "team.view") || can(viewer, "attendance.manage") || can(viewer, "corrections.approve")}
        reportsLink={reportDepts.length > 0}
        customDepts={customDepts}
        userHidden={viewer.prefs.sidebarHidden ?? []}
        roleHidden={roleSidebars[viewer.activeRole] ?? []}
        perms={viewer.perms}
        activeRole={viewer.activeRole}
        counts={counts}
        workspaceName={settings.workspace.name}
        brand={brand}
        recognition={recognition.enabled}
        overviewTeam={!!overviewStages?.length}
        support={support}
        callRecords={callRecords}
      />
      <SidebarInset className="min-w-0">
        {viewer.previewBy && <PreviewBanner name={viewer.name} role={ROLE_LABELS[viewer.activeRole]} />}
        <Topbar user={{ name: viewer.name, email: viewer.email, roles: viewer.roles, avatar: avatars[viewer.id] ?? null }} activeRole={viewer.activeRole} unread={counts.notifications} chatUnread={counts.chat} assistant={assistantOn} fun={funOn} qrScan={qrScan} />
        <OfflineCheckinSync />
        {!viewer.previewBy && <AskAnywhere />}
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
        <main data-app-main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-3 pt-4 pb-[calc(var(--tabbar-space)+1rem)] sm:px-6 sm:pt-6 lg:pb-6">
          {announcements && <AnnouncementStrip pending={announcements} />}
          <SectionBanner banners={banners} />
          {children}
        </main>
        <MobileNav
          work={home ? { href: home.base, label: home.kind === "studio" ? "Studio" : "Work" } : viewer.leads.length || viewer.roles.some((r) => ["recording", "editing", "uploading", "publication"].includes(r)) ? { href: "/my-work", label: "My work" } : null}
          chat={counts.chat}
          alerts={counts.notifications}
          approvals={counts.approvals}
          appName={ident.shortName}
          roles={viewer.roles}
          activeRole={viewer.activeRole}
          qrScan={qrScan}
          fun={funOn}
        />
        <ChatKeyBootstrap viewerId={viewer.id} />
        <StyleEffects />
        <TerminalAmbient />
        <MotionDirector />
        {/* Developers start in the Dev Terminal style unless they chose a style or Admin does not allow it. */}
        {viewer.roles.includes("developer") && (
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var d=document.documentElement,a=JSON.parse(localStorage.getItem("myseed.appearance")||"{}"),SA=(d.dataset.styleAllowed||"").split(",").filter(Boolean);if(!a.style&&d.dataset.style&&!("plain" in d.dataset)&&(!SA.length||SA.indexOf("terminal")>=0)){d.dataset.styleDefault="terminal";d.dataset.style="terminal";}}catch(e){}`,
            }}
          />
        )}
        {!viewer.previewBy && <PresencePing />}
        <Localizer defaultCalendar={settings.workspace.calendarDisplay} />
        <EthiopianDatePicker defaultCalendar={settings.workspace.calendarDisplay} />
        {assistantOn && assistantCtx && <Assistant ctx={assistantCtx} ai={ai} agent={agent} />}
        {funOn && <FunMode />}
        {privacy && <PrivacyGate notice={privacy.notice} version={privacy.version} updatedAt={privacy.updatedAt} />}
        {!viewer.mustChangePassword && <GetStarted audience={audienceFor(viewer.activeRole, viewer.leads)} tour={viewer.prefs.tour ?? {}} />}
      </SidebarInset>
    </SidebarProvider>
    </CallLayer>
    </ActionCenter>
  );
}
