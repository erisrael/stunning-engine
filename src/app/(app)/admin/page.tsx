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
      <PageHeader title="Admin" description="People, roles, permissions, access and workspace data. Every change is kept in the audit log." actions={
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
          {manageUsers && <TabsTrigger value="permissions">Roles and permissions</TabsTrigger>}
          {manageUsers && <TabsTrigger value="access">Access</TabsTrigger>}
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
            <TabsContent value="permissions">
              <PermissionsAdmin matrix={await getPermissionMatrix()} counts={roleCounts} leadCounts={leadCounts} />
            </TabsContent>
            <TabsContent value="access">
              <AccessAdmin users={users} grades={grades} subjects={subjects} />
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
