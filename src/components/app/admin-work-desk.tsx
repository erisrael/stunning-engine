"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldCheckIcon,
  UsersIcon,
  CheckCheckIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ActivityIcon,
  DatabaseIcon,
  SparklesIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  KeyIcon,
  LayersIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminWorkspaceData } from "@/server/admin-workspace";
import { fmtDateTime, fmtShortDate } from "@/lib/format";

export function AdminWorkDesk({ data }: { data: AdminWorkspaceData }) {
  const totalPendingApprovals =
    data.approvals.leave.length + data.approvals.claims.length + data.approvals.corrections.length;

  return (
    <div className="space-y-6" data-admin-workspace>
      {/* Quick Actions Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" asChild>
          <Link href="/admin?tab=people">
            <UsersIcon className="size-3.5 mr-1.5" /> Invite & Manage Users
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/approvals">
            <CheckCheckIcon className="size-3.5 mr-1.5" /> Review Approvals ({totalPendingApprovals})
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/admin/assistant">
            <SparklesIcon className="size-3.5 mr-1.5 text-purple-500" /> AI Assistant Controls
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/admin?tab=system">
            <DatabaseIcon className="size-3.5 mr-1.5" /> System & Backups
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/audit">
            <ShieldCheckIcon className="size-3.5 mr-1.5 text-emerald-500" /> Security Audit Log
          </Link>
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1.5 pt-4">
            <CardDescription className="text-xs">Active Workspace Users</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              {data.systemHealth.totalUsersCount}
              <span className="text-xs font-normal text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {data.systemHealth.onlineUsersCount} online
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 text-xs text-muted-foreground">
            {data.pendingUsers.length > 0
              ? `${data.pendingUsers.length} user accounts pending activation`
              : "All user accounts active & verified"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5 pt-4">
            <CardDescription className="text-xs">Pending Approvals Queue</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {totalPendingApprovals}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 text-xs text-muted-foreground flex items-center justify-between">
            <span>
              {data.approvals.leave.length} leave · {data.approvals.claims.length} claims · {data.approvals.corrections.length} att
            </span>
            {totalPendingApprovals > 0 && (
              <Link href="/approvals" className="text-primary hover:underline font-medium">
                Resolve →
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5 pt-4">
            <CardDescription className="text-xs">My Assigned Department Tasks</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {data.tasks.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 text-xs text-muted-foreground flex items-center justify-between">
            <span>Actionable tasks across your departments</span>
            {data.tasks.length > 0 && (
              <span className="text-xs font-medium text-amber-600">In Progress</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5 pt-4">
            <CardDescription className="text-xs">Integration & Health Status</CardDescription>
            <CardTitle className="text-base font-semibold flex items-center gap-2 pt-1">
              <span className={`size-2.5 rounded-full ${data.systemHealth.noorConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
              {data.systemHealth.noorConnected ? "Noor CMS Connected" : "Noor CMS Idle"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 text-xs text-muted-foreground flex items-center justify-between">
            <span>Errors: {data.systemHealth.recentErrorsCount} in 15m</span>
            <Link href="/admin/platform?tab=status" className="text-primary hover:underline">
              Status →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: My Assigned Tasks */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BriefcaseIcon className="size-4 text-primary" /> Tasks Assigned to Me
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Work across Dev, Marketing, and Custom departments assigned to your account.
                  </CardDescription>
                </div>
                <Badge variant="outline">{data.tasks.length} open</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {data.tasks.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <CheckCircle2Icon className="size-8 text-emerald-500/50 mx-auto mb-2" />
                  No open department tasks assigned to you right now.
                </div>
              ) : (
                <div className="divide-y text-sm">
                  {data.tasks.map((t) => (
                    <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground font-medium">{t.code}</span>
                          <Link
                            href={`/${t.dept}/list?task=${t.id}`}
                            className="font-medium truncate hover:text-primary transition-colors"
                          >
                            {t.title}
                          </Link>
                          {t.priority && (
                            <Badge variant="secondary" className="text-[10px] uppercase h-4 px-1.5">
                              {t.priority}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{t.deptTitle}</span>
                          <span>·</span>
                          <span className="capitalize">{t.status.replace("_", " ")}</span>
                          {t.due_date && (
                            <>
                              <span>·</span>
                              <span>Due {fmtShortDate(t.due_date)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button size="xs" variant="ghost" asChild>
                        <Link href={`/${t.dept}/list?task=${t.id}`}>Open →</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Approvals Breakdown */}
          {totalPendingApprovals > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCheckIcon className="size-4 text-primary" /> Pending Administrative Approvals
                </CardTitle>
                <CardDescription className="text-xs">
                  Leave requests, claims, and attendance corrections waiting for your decision.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.approvals.leave.slice(0, 5).map((l) => (
                    <div key={l.id} className="flex items-center justify-between border-b pb-2 text-xs">
                      <div>
                        <span className="font-medium text-sm">{l.full_name}</span> · {l.type_key} leave
                        <div className="text-muted-foreground">
                          {fmtShortDate(l.start_date)} to {fmtShortDate(l.end_date)}
                        </div>
                      </div>
                      <Button size="xs" variant="outline" asChild>
                        <Link href="/approvals">Review</Link>
                      </Button>
                    </div>
                  ))}
                  {data.approvals.claims.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex items-center justify-between border-b pb-2 text-xs">
                      <div>
                        <span className="font-medium text-sm">{c.name}</span> · ETB {c.amount.toLocaleString()}
                        <div className="text-muted-foreground truncate max-w-xs">{c.description}</div>
                      </div>
                      <Button size="xs" variant="outline" asChild>
                        <Link href="/approvals">Review</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Administrative Tools & Security */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <LayersIcon className="size-4 text-primary" /> Admin Operations Center
              </CardTitle>
              <CardDescription className="text-xs">
                Essential control panels and administration shortcuts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Link
                href="/admin?tab=people"
                className="flex items-center justify-between p-2 rounded-md hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <UsersIcon className="size-4 text-blue-500" />
                  <div>
                    <div className="font-medium text-xs">People & Roles</div>
                    <div className="text-[11px] text-muted-foreground">Manage user accounts and role permissions</div>
                  </div>
                </div>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              </Link>

              <Link
                href="/admin/assistant"
                className="flex items-center justify-between p-2 rounded-md hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <SparklesIcon className="size-4 text-purple-500" />
                  <div>
                    <div className="font-medium text-xs">AI Assistant & HR AI</div>
                    <div className="text-[11px] text-muted-foreground">Configure models, keys & agent automations</div>
                  </div>
                </div>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              </Link>

              <Link
                href="/legacy-cms"
                className="flex items-center justify-between p-2 rounded-md hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ActivityIcon className="size-4 text-emerald-500" />
                  <div>
                    <div className="font-medium text-xs">Noor Ethiopia CMS</div>
                    <div className="text-[11px] text-muted-foreground">Live student sync, disconnect & scraper status</div>
                  </div>
                </div>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              </Link>

              <Link
                href="/admin?tab=system"
                className="flex items-center justify-between p-2 rounded-md hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <DatabaseIcon className="size-4 text-amber-500" />
                  <div>
                    <div className="font-medium text-xs">Backups & Disaster Recovery</div>
                    <div className="text-[11px] text-muted-foreground">
                      {data.systemHealth.lastBackupTime ? `Last: ${fmtShortDate(data.systemHealth.lastBackupTime)}` : "No backups created yet"}
                    </div>
                  </div>
                </div>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              </Link>

              <Link
                href="/audit"
                className="flex items-center justify-between p-2 rounded-md hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheckIcon className="size-4 text-rose-500" />
                  <div>
                    <div className="font-medium text-xs">Security & Audit History</div>
                    <div className="text-[11px] text-muted-foreground">Immutable log of all system actions</div>
                  </div>
                </div>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

