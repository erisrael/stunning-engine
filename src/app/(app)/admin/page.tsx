import { roleCatalog } from "@/server/role-catalog";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DatabaseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireViewer } from "@/server/auth";
import { all, get, databaseLabel } from "@/server/db";
import { getPermissionMatrix } from "@/server/settings";
import { taxonomy } from "@/server/queries";
import { can, listUsers } from "@/server/users";
import { workspaceCounts } from "@/server/workspace-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandingAdmin } from "./branding-admin";
import { IdentityAdmin } from "./identity-admin";
import { identity } from "@/server/identity";
import { UsageAdmin } from "./usage-admin";
import { PrivacyAdmin } from "./privacy-admin";
import { FilesAdmin } from "./files-admin";
import { appConfigView, brokenLinks, linksOutside, storageConfig } from "@/server/files-publishing";
import { acceptanceReport, accessLog, privacyConfig } from "@/server/privacy";
import { usageReport } from "@/server/announcements";
import { ROLE_LABELS } from "@/lib/domain";
import { bannerSections, banners, navBrand } from "@/server/branding";
import { PageHeader } from "@/components/app/primitives";
import { ROLES, STAGES, type Role, type Stage } from "@/lib/domain";
import { AdminRoleProvider, AccessAdmin, DataAdmin, PeopleAdmin, PermissionsAdmin, TeamsAdmin, type AdminUser, type TeamPerson } from "./admin-client";
import { PageImport } from "@/components/app/page-import";
import { DepartmentsAdmin } from "./departments-admin";
import { customDepartments, deptPeople } from "@/server/departments";
import { DEPARTMENTS } from "@/lib/domain";
import { headers } from "next/headers";
import { cn } from "@/lib/utils";
import { DATASETS, listTokens, type Dataset } from "@/server/feeds";
import { IntegrationsAdmin } from "@/components/app/integrations";
import { sidebarDefaults } from "@/server/ui-prefs";
import { LegacyCmsAdmin } from "./legacy-cms-admin";
import { SidebarAdmin } from "./sidebar-admin";
import { listBlocked, listSessions } from "@/server/devices";
import { SessionsTable } from "@/components/app/security";
import { appOrigin, googleConfig, googleSettings } from "@/server/password-reset";
import { SignInPolicyAdmin } from "./signin-policy-admin";
import { signInPolicy } from "@/server/signin-config";
import { listInvites, listSignupRequests, signInLog, twoStepRoster } from "@/server/signin";
import { redirectUri } from "@/server/oidc";
import { PROVIDER_IDS } from "@/lib/signin-policy";
import { SystemAdmin } from "./system-admin";
import { healthChecks, jobStatus, listErrors, opsConfig } from "@/server/ops";
import { backupConfig, backupRuns, defaultBackupDir, listBackups } from "@/server/backups";
import { googleConnection, GOOGLE_SCOPES } from "@/server/google";
import { smtpSettings } from "@/server/email";
import { SignInAdmin } from "./signin-admin";
import { PeopleVisibilityAdmin } from "./people-visibility-admin";
import { peopleVisibility, profileFieldsConfig } from "@/server/profiles";
import { ChatAdmin, FeedbackAdmin, ReportsAdmin } from "./support-admin";
import { chatConfig, chatUsage } from "@/server/chat-extras";
import { maxUploadBytes } from "@/server/storage";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, REPORT_REASONS, REPORT_STATUSES, listFeedback, listReports } from "@/server/support";
import { CleanDataAdmin } from "./clean-data-admin";
import { ExternalApiConsole } from "@/components/app/integrations/external-api-console";
import { getExternalApiConfig } from "@/server/external-api";
import { SupportSettings } from "@/components/app/support/setup";
import { supportConfig } from "@/server/support-desk";
import * as ch from "@/server/support-channels";

export const metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewer();
  const manageUsers = can(viewer, "users.manage");
  const manageData = can(viewer, "data.manage");
  if (!manageUsers && !manageData) redirect("/dashboard?denied=permission");
  const { tab = manageUsers ? "people" : "data" } = await searchParams;
  if (tab === "email") redirect("/email?tab=settings");
  if (tab === "integrations" && manageUsers) redirect("/admin/integrations?tab=connections");

  const tax = await taxonomy();
  const grades = tax.grades.map((g) => ({ id: g.id, name: g.name }));
  const subjects = tax.subjects.map((s) => ({ id: s.id, name: s.name }));

  const rows = await all<{ id: string; handle: string; phone: string | null; bio: string | null; last_login_at: string | null }>(
    "SELECT id, handle, phone, bio, last_login_at FROM users",
  );
  const capacity = await all<{ user_id: string; stage: Stage; hours_per_week: number }>("SELECT user_id, stage, hours_per_week FROM user_capacity");
  const sessions = await all<{ user_id: string; c: number }>("SELECT user_id, COUNT(*) AS c FROM sessions WHERE expires_at > ? GROUP BY user_id", new Date().toISOString());
  const users: AdminUser[] = (await listUsers({ includeInactive: true })).map((u) => {
    const r = rows.find((x) => x.id === u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: r?.handle ?? u.handle,
      title: u.title,
      phone: r?.phone ?? null,
      bio: r?.bio ?? null,
      roles: u.roles,
      scopes: u.scopes,
      capacity: Object.fromEntries(capacity.filter((c) => c.user_id === u.id).map((c) => [c.stage, c.hours_per_week])),
      active: u.active,
      lastLogin: r?.last_login_at ?? null,
      mustChange: u.mustChangePassword,
      sessions: Number(sessions.find((s) => s.user_id === u.id)?.c ?? 0),
    };
  });
  const leadRows = await all<{ stage: Stage; user_id: string }>("SELECT stage, user_id FROM team_leads");
  const ownRows = await all<{ id: string; own_work_only: number }>("SELECT id, own_work_only FROM users");
  const openRows = await all<{ owner_id: string; c: number }>(
    "SELECT a.owner_id, COUNT(*) AS c FROM stage_attempts a JOIN items i ON i.current_attempt_id = a.id WHERE i.lifecycle = 'in_production' AND a.owner_id IS NOT NULL GROUP BY a.owner_id",
  );
  const team: TeamPerson[] = users
    .filter((u) => u.active)
    .map((u) => ({
      id: u.id,
      name: u.name,
      roles: u.roles,
      leads: leadRows.filter((l) => l.user_id === u.id).map((l) => l.stage),
      ownWorkOnly: !!ownRows.find((o) => o.id === u.id)?.own_work_only,
      open: Number(openRows.find((o) => o.owner_id === u.id)?.c ?? 0),
    }));
  const roleCounts = Object.fromEntries(ROLES.map((r) => [r, users.filter((u) => u.active && u.roles.includes(r)).length])) as Record<Role, number>;
  const leadCounts = Object.fromEntries(STAGES.map((st) => [st, team.filter((u) => u.leads.includes(st)).length])) as Record<Stage, number>;
  const openFeedback = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM feedback WHERE status IN ('new','reviewing')").catch(() => null))?.c ?? 0);
  const openReports = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM reports WHERE status IN ('open','reviewing')").catch(() => null))?.c ?? 0);

  const ADMIN_TAB_GROUPS: {
    key: string;
    label: string;
    tabs: { id: string; label: string; count?: number }[];
  }[] = [
    ...(manageUsers
      ? [
          {
            key: "people",
            label: "People & roles",
            tabs: [
              { id: "people", label: "People", count: users.filter((u) => u.active).length },
              { id: "teams", label: "Teams", count: team.length },
              { id: "departments", label: "Departments" },
              { id: "permissions", label: "Roles & permissions" },
              { id: "access", label: "Access" },
              { id: "sidebar", label: "Sidebar" },
            ],
          },
          {
            key: "security",
            label: "Security",
            tabs: [
              { id: "signin", label: "Sign-in" },
              { id: "sessions", label: "Sessions & devices" },
              { id: "privacy", label: "Privacy" },
            ],
          },
          {
            key: "comms",
            label: "Communication & support",
            tabs: [
              { id: "customer-support", label: "Support setup" },
              { id: "chat", label: "Chat" },
              { id: "feedback", label: "Feedback", count: openFeedback },
              { id: "reports", label: "Safety reports", count: openReports },
            ],
          },
          {
            key: "integrations",
            label: "Integrations",
            tabs: [
              { id: "external-apis", label: "External APIs" },
              { id: "integrations", label: "Integrations" },
            ],
          },
          {
            key: "system",
            label: "System & workspace",
            tabs: [
              { id: "system", label: "System" },
              { id: "branding", label: "Branding" },
              { id: "files", label: "Files & publishing" },
              { id: "usage", label: "Usage" },
              { id: "clean-data", label: "Clean data" },
              { id: "presentations", label: "Presentation templates" },
              ...(manageData ? [{ id: "data", label: "Data" }] : []),
            ],
          },
        ]
      : manageData
        ? [
            {
              key: "data",
              label: "Data",
              tabs: [{ id: "data", label: "Data" }],
            },
          ]
        : []),
  ];

  const currentGroup = ADMIN_TAB_GROUPS.find((g) => g.tabs.some((t) => t.id === tab)) ?? ADMIN_TAB_GROUPS[0];

  return (
    <AdminRoleProvider roles={await roleCatalog()}><div className="space-y-4">
      <PageHeader help="admin" title="Admin" description="People, roles, permissions, access and workspace data. Every change is kept in the audit log." actions={
          <>
            {manageData && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/data">
                  <DatabaseIcon /> Data manager
                </Link>
              </Button>
            )}
            {manageUsers && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/assistant">Assistant</Link>
              </Button>
            )}
            <PageImport viewer={viewer} page="admin" />
          </>
        }
      />
      <div className="space-y-3">
        {ADMIN_TAB_GROUPS.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-2.5">
            {ADMIN_TAB_GROUPS.map((g) => {
              const isCurrent = g.key === currentGroup?.key;
              return (
                <Link
                  key={g.key}
                  href={`/admin?tab=${g.tabs[0].id}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                    isCurrent
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold ring-1 ring-primary/30"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>{g.label}</span>
                </Link>
              );
            })}
          </div>
        )}
        <Tabs key={tab} value={tab} className="gap-4">
          {currentGroup && (
            <TabsList className="inline-flex h-9 w-auto max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1 text-muted-foreground">
              {currentGroup.tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="h-7 px-3 text-xs" asChild>
                  <Link href={`/admin?tab=${t.id}`} className="flex items-center gap-1.5">
                    <span>{t.label}</span>
                    {t.count !== undefined && t.count > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold text-primary tabular-nums">
                        {t.count}
                      </span>
                    )}
                  </Link>
                </TabsTrigger>
              ))}
            </TabsList>
          )}
        {manageUsers && (
          <>
            <TabsContent value="people" className="space-y-4">
              <PeopleAdmin users={users} grades={grades} subjects={subjects} viewerId={viewer.id} />
              <PeopleVisibilityAdmin config={await peopleVisibility()} roles={ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] }))} />
            </TabsContent>
            <TabsContent value="teams">
              <TeamsAdmin people={team} />
            </TabsContent>
            <TabsContent value="departments">
              <DepartmentsAdmin
                departments={await Promise.all(DEPARTMENTS.map(async (d) => ({ dept: d, people: (await deptPeople(d)).map((x) => ({ id: x.id, name: x.name, roles: x.roles, position: x.position })) })))}
                custom={await Promise.all(
                  (await customDepartments({ includeArchived: true })).map(async (c) => ({ ...c, people: (await deptPeople(c.key)).map((x) => ({ id: x.id, name: x.name, roles: x.roles, position: x.position })) })),
                )}
                everyone={users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))}
                presenters={await all<{ id: string; name: string; kind: string; subjects: string | null; department: string | null }>("SELECT id, name, kind, subjects, department FROM presenters WHERE active = 1 ORDER BY name")}
              />
            </TabsContent>
            <TabsContent value="permissions">
              <PermissionsAdmin matrix={await getPermissionMatrix()} counts={roleCounts} leadCounts={leadCounts} />
            </TabsContent>
            <TabsContent value="access">
              <AccessAdmin users={users} grades={grades} subjects={subjects} />
            </TabsContent>
            <TabsContent value="sessions">
              <SessionsTable rows={await listSessions(viewer, { everyone: true })} blocked={await listBlocked(viewer)} everyone />
            </TabsContent>
            <TabsContent value="chat">
              <ChatAdmin config={await chatConfig()} usage={await chatUsage(viewer)} hardMaxMb={Math.round(maxUploadBytes() / 1048576)} />
            </TabsContent>
            <TabsContent value="feedback">
              <FeedbackAdmin rows={await listFeedback(viewer)} categories={FEEDBACK_CATEGORIES} statuses={FEEDBACK_STATUSES} />
            </TabsContent>
            <TabsContent value="reports">
              <ReportsAdmin rows={await listReports(viewer)} reasons={REPORT_REASONS} statuses={REPORT_STATUSES} />
            </TabsContent>
            <TabsContent value="signin" className="space-y-6">
              <SignInPolicyAdmin
                data={{
                  policy: await signInPolicy(),
                  googleReady: !!(await googleConfig()),
                  emailReady: (await smtpSettings()).source !== "none",
                  redirectUris: Object.fromEntries(await Promise.all(PROVIDER_IDS.map(async (id) => [id, await redirectUri(id)]))),
                  invites: await listInvites(viewer),
                  requests: await listSignupRequests(viewer),
                  roster: await twoStepRoster(viewer),
                  log: await signInLog(viewer, { limit: 200 }),
                  unconfirmed: await (await import("@/server/email-verify")).unconfirmedPeople(viewer),
                }}
              />
              <SignInAdmin google={await googleSettings()} emailReady={(await smtpSettings()).source !== "none"} profileFields={await profileFieldsConfig()} />
            </TabsContent>
            <TabsContent value="files">
              {tab === "files" && <FilesAdmin storage={await storageConfig()} app={await appConfigView()} broken={await brokenLinks()} outside={await linksOutside()} />}
            </TabsContent>
            <TabsContent value="privacy">
              {tab === "privacy" && <PrivacyAdmin config={await privacyConfig()} report={await acceptanceReport(viewer)} log={await accessLog(viewer)} />}
            </TabsContent>
            <TabsContent value="usage">
              {tab === "usage" && <UsageAdmin report={await usageReport(viewer)} roleLabel={ROLE_LABELS as Record<string, string>} />}
            </TabsContent>
            <TabsContent value="branding">
              {tab === "branding" && <IdentityAdmin value={await identity()} />}
              {tab === "branding" && <BrandingAdmin sections={(await bannerSections()).map((x) => ({ key: x.key, label: x.label }))} banners={await banners()} nav={await navBrand()} />}
            </TabsContent>
            <TabsContent value="presentations">
              {tab === "presentations" &&
                (await (async () => {
                  const { listTemplates } = await import("@/server/deck-templates");
                  const { TemplatesAdmin } = await import("./templates-admin");
                  const t = await listTemplates();
                  return <TemplatesAdmin templates={t.templates} defaultId={t.defaultId} />;
                })())}
            </TabsContent>
            <TabsContent value="system">
              {tab === "system" && (
                <SystemAdmin
                  data={{
                    health: await healthChecks(),
                    jobs: await jobStatus(),
                    backup: await backupConfig(),
                    backups: await listBackups(viewer),
                    runs: await backupRuns(viewer),
                    errors: await listErrors(viewer),
                    ops: await opsConfig(),
                    driveConnected: !!(await googleConnection(viewer.id))?.scopes.includes(GOOGLE_SCOPES.drive),
                    googleReady: !!(await googleConfig()),
                    appUrl: await appOrigin(),
                    defaultDir: defaultBackupDir(),
                    onRender: !!process.env.RENDER,
                  }}
                />
              )}
            </TabsContent>
            <TabsContent value="sidebar">
              <SidebarAdmin defaults={await sidebarDefaults()} roles={await roleCatalog()} departments={await customDepartments()} />
            </TabsContent>
            <TabsContent value="legacy-cms">
              {tab === "legacy-cms" && (
                <LegacyCmsAdmin
                  users={users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.roles[0] || "staff" }))}
                />
              )}
            </TabsContent>
            <TabsContent value="integrations">
              <IntegrationsAdmin
                tokens={await listTokens(viewer)}
                datasets={Object.fromEntries(Object.entries(DATASETS).map(([k, v]) => [k, v.label])) as Record<Dataset, string>}
                origin={`${(await headers()).get("x-forwarded-proto") ?? "https"}://${(await headers()).get("host") ?? "localhost"}`}
              />
              {tab === "integrations" &&
                (await (async () => {
                  const C = await import("@/server/connectors");
                  const { notionStatus } = await import("@/server/notion");
                  const { IntegrationsHub } = await import("@/components/app/integrations-hub");
                  return (
                    <div className="mt-4">
                      <IntegrationsHub
                        datasets={Object.entries(DATASETS).map(([k, v]) => ({ key: k, label: v.label }))}
                        notion={await notionStatus()}
                        connectors={await C.listConnectors(viewer)}
                        presets={C.PRESETS.map((x) => ({ key: x.key, name: x.name, capability: x.capability, region: x.region, docsUrl: x.docsUrl ?? null, secrets: x.secrets }))}
                        calls={await C.callLog(viewer, 40)}
                      />
                    </div>
                  );
                })())}
            </TabsContent>
            <TabsContent value="customer-support" className="space-y-4">
              {tab === "customer-support" && (
                <SupportSettings
                  cfg={await supportConfig()}
                  people={users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))}
                  admin={manageUsers}
                  mailboxes={(await all<{ address: string }>("SELECT address FROM email_senders WHERE mailbox = 1 AND active = 1 ORDER BY address")).map((m) => m.address)}
                  telegram={await ch.telegramInfo()}
                />
              )}
            </TabsContent>
            <TabsContent value="external-apis">
              {tab === "external-apis" && <ExternalApiConsole config={await getExternalApiConfig()} />}
            </TabsContent>
            <TabsContent value="clean-data">
              {tab === "clean-data" && <CleanDataAdmin />}
            </TabsContent>
          </>
        )}
        {manageData && (
          <TabsContent value="data">
            <DataAdmin counts={await workspaceCounts()} database={databaseLabel()} canManageUsers={manageUsers} />
          </TabsContent>
        )}
      </Tabs>
      </div>
    </div></AdminRoleProvider>
  );
}
