import Link from "next/link";
import {
  ShieldCheckIcon,
  UsersIcon,
  CheckCheckIcon,
  AlertTriangleIcon,
  ActivityIcon,
  SparklesIcon,
  DatabaseIcon,
  KeyIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  Building2Icon,
  HeadphonesIcon,
  LockIcon,
  ServerIcon,
  ClockIcon,
  BriefcaseIcon,
  BadgeCheckIcon,
  ExternalLinkIcon,
} from "lucide-react";
import type { Viewer } from "@/server/auth";
import { all, get, nowIso } from "@/server/db";
import { can } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime, fmtShortDate } from "@/lib/format";
import { myApprovals } from "@/server/assistant-ops";
import { cn } from "@/lib/utils";
import { LiveOps } from "@/components/app/live-ops";

export async function AdminHome({
  viewer,
  timezone,
  greeting,
}: {
  viewer: Viewer;
  timezone: string;
  greeting: string;
}) {
  const isSuper = can(viewer, "users.manage");

  // Fetch operational admin metrics in parallel
  const [
    approvals,
    pendingUsers,
    onlineSessions,
    totalUsers,
    recentAudits,
    noorSetting,
    aiSetting,
  ] = await Promise.all([
    myApprovals(viewer as any).catch(() => ({ leave: [], claims: [], corrections: [] })),
    isSuper
      ? all<{ id: string; name: string; email: string; created_at: string; role: string }>(
          "SELECT u.id, u.name, u.email, u.created_at, COALESCE((SELECT r.role FROM role_assignments r WHERE r.user_id = u.id ORDER BY r.role LIMIT 1), '') AS role FROM users u WHERE u.active = 0 AND u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 8"
        ).catch(() => [])
      : Promise.resolve([]),
    get<{ c: number }>("SELECT COUNT(DISTINCT user_id) AS c FROM sessions WHERE expires_at > ?", nowIso()).catch(
      () => ({ c: 0 })
    ),
    get<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL").catch(() => ({ c: 0 })),
    all<{ id: string; action: string; summary: string; actor_id: string; occurred_at: string }>(
      "SELECT id, action, summary, actor_id, occurred_at FROM audit_events ORDER BY occurred_at DESC LIMIT 8"
    ).catch(() => []),
    get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'").catch(() => null),
    get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.ai_assistant'").catch(() => null),
  ]);

  let noorConnected = false;
  let noorLastSync = "Never";
  if (noorSetting?.value) {
    try {
      const parsed = JSON.parse(noorSetting.value);
      noorConnected = !!parsed.sessionCookieEnc;
      if (parsed.lastSyncTime) {
        noorLastSync = fmtDateTime(parsed.lastSyncTime, timezone);
      }
    } catch {}
  }

  let aiModel = "gpt-4o-mini";
  let aiProvider = "OpenAI";
  if (aiSetting?.value) {
    try {
      const parsed = JSON.parse(aiSetting.value);
      if (parsed.model) aiModel = parsed.model;
      if (parsed.provider) aiProvider = parsed.provider;
    } catch {}
  }

  const totalPendingApprovals =
    approvals.leave.length + approvals.claims.length + approvals.corrections.length;
  // The live view (Admin): who is in the app now, from the presence each open app reports.
  const live = isSuper && !viewer.previewBy ? await (await import("@/server/live-dashboard")).liveDashboard(viewer).catch(() => null) : null;
  const onlineCount = live ? live.roster.rows.length - live.roster.counts.offline : Number(onlineSessions?.c ?? 0);
  const totalUserCount = Number(totalUsers?.c ?? 0);

  const adminActions = [
    {
      href: "/my-work?tab=admin",
      label: "My Admin Desk",
      hint: "Your tasks & approvals queue",
      icon: BriefcaseIcon,
      badge: totalPendingApprovals > 0 ? String(totalPendingApprovals) : undefined,
      color: "text-blue-500",
    },
    {
      href: "/admin?tab=people",
      label: "Users & Access",
      hint: `${pendingUsers.length} waiting activation`,
      icon: UsersIcon,
      badge: pendingUsers.length > 0 ? String(pendingUsers.length) : undefined,
      color: "text-purple-500",
    },
    {
      href: "/approvals",
      label: "Approvals Queue",
      hint: "Leave, expenses & attendance",
      icon: CheckCheckIcon,
      badge: totalPendingApprovals > 0 ? String(totalPendingApprovals) : undefined,
      color: "text-emerald-500",
    },
    {
      href: "/admin/assistant",
      label: "AI Assistant Config",
      hint: `${aiProvider} · ${aiModel}`,
      icon: SparklesIcon,
      color: "text-amber-500",
    },
    {
      href: "/legacy-cms",
      label: "Noor CMS Integration",
      hint: noorConnected ? "Connected & active" : "Disconnected",
      icon: RefreshCwIcon,
      badge: noorConnected ? "Connected" : "Offline",
      badgeVariant: noorConnected ? "outline" : "destructive",
      color: "text-cyan-500",
    },
    {
      href: "/audit",
      label: "Security Audit Log",
      hint: "System & user audit trails",
      icon: ShieldCheckIcon,
      color: "text-indigo-500",
    },
    {
      href: "/admin?tab=system",
      label: "Database & Backups",
      hint: "Snapshots, health & storage",
      icon: DatabaseIcon,
      color: "text-emerald-600",
    },
    {
      href: "/company",
      label: "Company Financials",
      hint: "Budgets, requests & payroll",
      icon: Building2Icon,
      color: "text-teal-500",
    },
    {
      href: "/support",
      label: "Support Desk",
      hint: "Customer tickets & live chat",
      icon: HeadphonesIcon,
      color: "text-sky-500",
    },
    {
      href: "/admin?tab=roles",
      label: "Roles & Matrix",
      hint: "Permissions & capabilities",
      icon: LockIcon,
      color: "text-rose-500",
    },
  ];

  return (
    <div className="space-y-6" data-admin-home>
      <PageHeader
        eyebrow="Administration Workspace"
        title={`${greeting}, ${viewer.name.split(" ")[0]}`}
        description="Operational oversight, user accounts, system integrations, security logs, and administrative controls."
      />

      {/* Metrics Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1.5 pt-4">
            <CardDescription className="text-xs">User Accounts</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              {totalUserCount}
              {/* With the live view below, its roster is the one count of who is online. */}
              {!live && (
                <span className="text-xs font-normal text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {onlineCount} online now
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 text-xs text-muted-foreground">
            {pendingUsers.length > 0 ? (
              <span className="text-amber-600 font-medium">{pendingUsers.length} pending account activation</span>
            ) : (
              "All registered users active"
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5 pt-4">
            <CardDescription className="text-xs">Pending Approvals</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              {totalPendingApprovals}
              {totalPendingApprovals > 0 ? (
                <Badge variant="destructive" className="text-xs font-normal">
                  Action required
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs font-normal">
                  Clear
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 text-xs text-muted-foreground">
            {approvals.leave.length} leave · {approvals.claims.length} claims · {approvals.corrections.length} attendance
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5 pt-4">
            <CardDescription className="text-xs">Noor CMS Integration</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              {noorConnected ? "Connected" : "Offline"}
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  noorConnected ? "bg-emerald-500" : "bg-muted-foreground/40"
                )}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 text-xs text-muted-foreground">
            {noorConnected ? `Last sync: ${noorLastSync}` : "Session cookie disconnected"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5 pt-4">
            <CardDescription className="text-xs">AI Assistant Engine</CardDescription>
            <CardTitle className="text-xl font-bold truncate">
              {aiModel}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 text-xs text-muted-foreground flex items-center justify-between">
            <span>Provider: {aiProvider}</span>
            <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300">
              Active
            </Badge>
          </CardContent>
        </Card>
      </div>

      {live && <LiveOps initial={live} />}

      {/* Quick Action Navigation Grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
          Administrative Operations
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {adminActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex flex-col justify-between rounded-xl border bg-card p-3.5 transition-all hover:border-primary/50 hover:bg-accent/40 hover:shadow-xs"
            >
              <div className="flex items-start justify-between">
                <div className={cn("p-2 rounded-lg bg-muted/60 group-hover:scale-105 transition-transform", a.color)}>
                  <a.icon className="size-4" />
                </div>
                {a.badge && (
                  <Badge variant={a.badgeVariant as any ?? "default"} className="text-[10px] h-5 px-1.5">
                    {a.badge}
                  </Badge>
                )}
              </div>
              <div className="mt-3">
                <span className="block text-sm font-medium">{a.label}</span>
                <span className="block text-xs text-muted-foreground line-clamp-1">{a.hint}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 2-Column Section: Pending Approvals & Users + Security Audit Feed */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Queues waiting on Admin */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCheckIcon className="size-4 text-emerald-500" />
                    Pending Approvals
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Staff requests awaiting review
                  </CardDescription>
                </div>
                <Button size="sm" variant="ghost" asChild className="text-xs h-7">
                  <Link href="/approvals">
                    View all <ArrowRightIcon className="size-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {totalPendingApprovals === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  No pending requests requiring your review.
                </div>
              ) : (
                <>
                  {approvals.leave.slice(0, 3).map((l) => (
                    <div key={l.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-xs">
                      <div>
                        <span className="font-semibold">{l.full_name}</span>
                        <span className="text-muted-foreground ml-1.5">
                          Leave ({fmtShortDate(l.start_date, timezone)} - {fmtShortDate(l.end_date, timezone)})
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {l.type_key}
                      </Badge>
                    </div>
                  ))}
                  {approvals.claims.slice(0, 3).map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-xs">
                      <div>
                        <span className="font-semibold">{c.name}</span>
                        <span className="text-muted-foreground ml-1.5">{c.description}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {c.amount.toFixed(2)} ETB
                      </Badge>
                    </div>
                  ))}
                  {approvals.corrections.slice(0, 3).map((cr) => (
                    <div key={cr.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-xs">
                      <div>
                        <span className="font-semibold">{cr.full_name}</span>
                        <span className="text-muted-foreground ml-1.5">{cr.reason}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {cr.day}
                      </Badge>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {isSuper && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <UsersIcon className="size-4 text-purple-500" />
                      Pending User Activations
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Registered users pending role activation
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="ghost" asChild className="text-xs h-7">
                    <Link href="/admin?tab=people">
                      Manage <ArrowRightIcon className="size-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {pendingUsers.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    All users are active. No pending signups.
                  </div>
                ) : (
                  pendingUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-xs">
                      <div>
                        <span className="font-semibold">{u.name}</span>
                        <span className="text-muted-foreground ml-1.5">{u.email}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        Pending
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Security & System Audit Trail */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheckIcon className="size-4 text-indigo-500" />
                    Recent System & Security Activity
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Live audit logs across production, users & infrastructure
                  </CardDescription>
                </div>
                <Button size="sm" variant="ghost" asChild className="text-xs h-7">
                  <Link href="/audit">
                    Full Log <ArrowRightIcon className="size-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {recentAudits.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">
                  No recent audit events recorded.
                </div>
              ) : (
                recentAudits.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 text-xs border-b pb-2 last:border-0 last:pb-0">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-primary">{a.action}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground text-[10px]">{fmtDateTime(a.occurred_at, timezone)}</span>
                      </div>
                      <p className="text-muted-foreground line-clamp-1">{a.summary || "Action performed"}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-muted/20 border-dashed">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <ServerIcon className="size-4 text-emerald-600" />
                Infrastructure & Environment
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1.5 text-muted-foreground pb-4">
              <div className="flex justify-between">
                <span>Database Engine:</span>
                <span className="font-mono font-medium text-foreground">{(await import("@/server/db")).databaseLabel()}</span>
              </div>
              <div className="flex justify-between">
                <span>App Server Runtime:</span>
                <span className="font-mono font-medium text-foreground">{`Next.js ${(await import("next/package.json")).version} · Node ${process.versions.node}`}</span>
              </div>
              <div className="flex justify-between">
                <span>Timezone:</span>
                <span className="font-mono font-medium text-foreground">{timezone}</span>
              </div>
              <div className="flex justify-between">
                <span>Google OAuth Verification:</span>
                <span className="font-mono font-medium text-foreground">{(await (await import("@/server/password-reset")).googleConfig().catch(() => null)) ? "Configured" : "Not set up"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

