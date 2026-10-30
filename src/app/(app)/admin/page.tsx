import Link from "next/link";
import { redirect } from "next/navigation";
import { DatabaseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireViewer } from "@/server/auth";
import { all, databaseLabel } from "@/server/db";
import { getPermissionMatrix } from "@/server/settings";
import { taxonomy } from "@/server/queries";
import { can, listUsers } from "@/server/users";
import { workspaceCounts } from "@/server/workspace-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/primitives";
import { ROLES, STAGES, type Role, type Stage } from "@/lib/domain";
import { AccessAdmin, DataAdmin, PeopleAdmin, PermissionsAdmin, TeamsAdmin, type AdminUser, type TeamPerson } from "./admin-client";
import { PageImport } from "@/components/app/page-import";
import { DepartmentsAdmin } from "./departments-admin";
import { customDepartments, deptPeople } from "@/server/departments";
import { DEPARTMENTS } from "@/lib/domain";
import { headers } from "next/headers";
import { DATASETS, listTokens, type Dataset } from "@/server/feeds";
import { IntegrationsAdmin } from "@/components/app/integrations";
import { sidebarDefaults } from "@/server/ui-prefs";
import { SidebarAdmin } from "./sidebar-admin";
import { listBlocked, listSessions } from "@/server/devices";
import { SessionsTable } from "@/components/app/security";
import { googleSettings } from "@/server/password-reset";
import { smtpSettings } from "@/server/email";
import { SignInAdmin } from "./signin-admin";
import { ChatAdmin, FeedbackAdmin, ReportsAdmin } from "./support-admin";
import { chatConfig, chatUsage } from "@/server/chat-extras";
import { maxUploadBytes } from "@/server/storage";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, REPORT_REASONS, REPORT_STATUSES, listFeedback, listReports } from "@/server/support";

export const metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewer();
  const manageUsers = can(viewer, "users.manage");
  const manageData = can(viewer, "data.manage");
  if (!manageUsers && !manageData) redirect("/dashboard?denied=permission");
  const { tab = manageUsers ? "people" : "data" } = await searchParams;

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

  return (
    <div className="space-y-4">
      <PageHeader help="admin" title="Admin" description="People, roles, permissions, access and workspace data. Every change is kept in the audit log." actions={
          <>
            {manageData && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/data">
                  <DatabaseIcon /> Data manager
                </Link>
              </Button>
            )}
            <PageImport viewer={viewer} page="admin" />
          </>
        }
      />
      <Tabs defaultValue={tab} className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          {manageUsers && <TabsTrigger value="people">People ({users.filter((u) => u.active).length})</TabsTrigger>}
          {manageUsers && <TabsTrigger value="teams">Teams</TabsTrigger>}
          {manageUsers && <TabsTrigger value="departments">Departments</TabsTrigger>}
          {manageUsers && <TabsTrigger value="permissions">Roles and permissions</TabsTrigger>}
          {manageUsers && <TabsTrigger value="access">Access</TabsTrigger>}
          {manageUsers && <TabsTrigger value="sessions">Sessions and devices</TabsTrigger>}
          {manageUsers && <TabsTrigger value="chat">Chat</TabsTrigger>}
          {manageUsers && <TabsTrigger value="feedback">Feedback</TabsTrigger>}
          {manageUsers && <TabsTrigger value="reports">Safety reports</TabsTrigger>}
          {manageUsers && <TabsTrigger value="signin">Sign-in</TabsTrigger>}
          {manageUsers && <TabsTrigger value="sidebar">Sidebar</TabsTrigger>}
          {manageUsers && <TabsTrigger value="integrations">Integrations</TabsTrigger>}
          {manageData && <TabsTrigger value="data">Data</TabsTrigger>}
        </TabsList>
        {manageUsers && (
          <>
            <TabsContent value="people">
              <PeopleAdmin users={users} grades={grades} subjects={subjects} viewerId={viewer.id} />
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
            <TabsContent value="signin">
              <SignInAdmin google={await googleSettings()} emailReady={(await smtpSettings()).source !== "none"} />
            </TabsContent>
            <TabsContent value="sidebar">
              <SidebarAdmin defaults={await sidebarDefaults()} />
            </TabsContent>
            <TabsContent value="integrations">
              <IntegrationsAdmin
                tokens={await listTokens(viewer)}
                datasets={Object.fromEntries(Object.entries(DATASETS).map(([k, v]) => [k, v.label])) as Record<Dataset, string>}
                origin={`${(await headers()).get("x-forwarded-proto") ?? "https"}://${(await headers()).get("host") ?? "localhost"}`}
              />
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
  );
}
