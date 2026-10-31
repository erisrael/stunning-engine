"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftRightIcon,
  BookOpenIcon,
  BriefcaseIcon,
  Building2Icon,
  ChartColumnIcon,
  ClockIcon,
  CodeIcon,
  ContactIcon,
  CrownIcon,
  DatabaseIcon,
  EyeIcon,
  MonitorSmartphoneIcon,
  FilePlus2Icon,
  FileTextIcon,
  GridIcon,
  HomeIcon,
  IdCardIcon,
  InboxIcon,
  LayersIcon,
  ListChecksIcon,
  ListTreeIcon,
  MailIcon,
  MegaphoneIcon,
  MessageCircleQuestionIcon,
  PackageCheckIcon,
  PlaneIcon,
  Settings2Icon,
  SettingsIcon,
  ShieldCheckIcon,
  UserCogIcon,
  UserPlusIcon,
  UsersIcon,
  UsersRoundIcon,
  WalletIcon,
  LandmarkIcon,
  VideoIcon,
  KanbanIcon,
  ListIcon,
  SheetIcon,
  GanttChartIcon,
  CalendarIcon,
  FolderKanbanIcon,
  GitBranchIcon,
  CalculatorIcon,
  CheckCheckIcon,
  CircleUserIcon,
  UserCheckIcon,
  NotebookTextIcon,
  FileQuestionIcon,
  GalleryVerticalEndIcon,
} from "lucide-react";
import type { HomeDept } from "@/server/nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MyseedLogo } from "@/components/app/logo";
import { savePrefsAction } from "@/app/actions/admin";
import { NAV_TIPS } from "@/lib/help";
import { ROLE_LABELS, type Capability, type Role } from "@/lib/domain";
import { scopeQueryString } from "@/lib/filters";

type NavItem = {
  href: string;
  // Key used for hiding and tooltips when the link changes (the work views).
  id?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  cap?: Capability | Capability[];
  keepFilters?: boolean;
  // Other paths that count as this entry (the four work views share one entry).
  also?: string[];
  // Links shown under the entry while you are in that section.
  sub?: { label: string; href: string }[];
  locked?: boolean;
  // Matched on the whole address (path and query), for department views that share a path prefix.
  exact?: boolean;
};

const VIEW_PATHS: { href: string; cap: Capability }[] = [
  { href: "/content", cap: "nav.list" },
  { href: "/sheet", cap: "nav.sheet" },
  { href: "/pipeline", cap: "nav.board" },
  { href: "/calendar", cap: "nav.calendar" },
];

// The views of a department, folded under it for people who oversee several departments.
const deptViews = (base: string, extra: { label: string; view: string }[] = [], configure = false) => [
  { label: "Home", href: base },
  { label: "Board", href: `${base}/board` },
  { label: "List", href: `${base}/list` },
  { label: "Sheet", href: `${base}/sheet` },
  { label: "Overview", href: `${base}/overview` },
  { label: "Timeline", href: `${base}/timeline` },
  { label: "Calendar", href: `${base}/calendar` },
  { label: "Projects", href: `${base}/projects` },
  { label: "Team", href: `${base}/team` },
  { label: "Report", href: `${base}/report` },
  ...extra.map((e) => ({ label: e.label, href: `${base}/${e.view}` })),
  ...(configure ? [{ label: "Configure", href: `${base}/configure` }] : []),
];

// A department as the person's own sidebar: My work, Work, Plan, Insights, Tools and Manage, by position.
function homeGroups(h: HomeDept, viewerId: string): { label: string; items: NavItem[] }[] {
  const b = h.base;
  if (h.kind === "studio")
    return [
      {
        label: "Studio",
        items: [
          { href: b, label: "Home", icon: HomeIcon, exact: true },
          { href: `${b}?tab=board`, label: "Board", icon: KanbanIcon, exact: true },
          { href: `${b}?tab=calendar`, label: "Calendar", icon: CalendarIcon, exact: true },
        ],
      },
      {
        label: "Content",
        items: [
          { href: `${b}?tab=note`, label: "Notes", icon: NotebookTextIcon, exact: true },
          { href: `${b}?tab=exam`, label: "Exams", icon: FileTextIcon, exact: true },
          { href: `${b}?tab=flashcards`, label: "Flash cards", icon: GalleryVerticalEndIcon, exact: true },
          { href: `${b}?tab=questions`, label: "Question bank", icon: FileQuestionIcon, exact: true },
        ],
      },
      ...(h.seeAll || h.configure
        ? [
            {
              label: "Lead",
              items: [
                ...(h.seeAll ? [{ href: `${b}?tab=team`, label: "Team", icon: UsersIcon, exact: true }] : []),
                ...(h.configure ? [{ href: `${b}?tab=configure`, label: "Configure", icon: Settings2Icon, exact: true }] : []),
              ],
            },
          ]
        : []),
      { label: "Tools", items: [{ href: "/requests", label: "Requests", icon: InboxIcon }] },
    ];
  return [
    {
      label: h.title,
      items: [
        { href: b, label: "Home", icon: HomeIcon, exact: true },
        { href: `${b}/board?assignee=${viewerId}`, label: "My board", icon: UserCheckIcon, exact: true },
      ],
    },
    {
      label: "Work",
      items: [
        { href: `${b}/board`, label: "Board", icon: KanbanIcon, exact: true },
        { href: `${b}/list`, label: "List", icon: ListIcon, exact: true },
        ...(h.seeAll ? [{ href: `${b}/sheet`, label: "Sheet", icon: SheetIcon, exact: true }] : []),
      ],
    },
    {
      label: "Plan",
      items: [
        { href: `${b}/projects`, label: "Projects", icon: FolderKanbanIcon, exact: true },
        ...(h.seeAll
          ? [
              { href: `${b}/overview`, label: "Overview", icon: ListTreeIcon, exact: true },
              { href: `${b}/timeline`, label: "Timeline", icon: GanttChartIcon, exact: true },
            ]
          : []),
        { href: `${b}/calendar`, label: "Calendar", icon: CalendarIcon, exact: true },
      ],
    },
    {
      label: "Insights",
      items: [
        { href: `${b}/report`, label: h.seeAll ? "Report" : "My report", icon: ChartColumnIcon, exact: true },
        ...(h.seeAll ? [{ href: `${b}/team`, label: "Team", icon: UsersIcon, exact: true }] : []),
      ],
    },
    {
      label: "Tools",
      items: [
        ...(h.repos ? [{ href: `${b}/repos`, label: "Repositories", icon: GitBranchIcon, exact: true }] : []),
        ...(h.accounting ? [{ href: `${b}/accounting`, label: "Accounting", icon: CalculatorIcon, exact: true }] : []),
        { href: "/requests", label: "Requests", icon: InboxIcon },
      ],
    },
    ...(h.configure ? [{ label: "Department", items: [{ href: `${b}/configure`, label: "Configure", icon: Settings2Icon, exact: true }] }] : []),
  ];
}

export function AppSidebar({
  perms,
  activeRole,
  counts,
  workspaceName,
  reportsLink = false,
  customDepts = [],
  userHidden = [],
  roleHidden = [],
  home = null,
  viewerId = "",
  approver = false,
}: {
  home?: HomeDept | null;
  viewerId?: string;
  // Approves something (leave, claims, attendance, handovers): shows Approvals even when nothing waits.
  approver?: boolean;
  perms: Capability[];
  customDepts?: { key: string; title: string }[];
  reportsLink?: boolean;
  activeRole: Role;
  counts: { myWork: number; notifications: number; questions: number; handoffs: number; corrections: number; incoming: number; attendance: number; approvals: number };
  workspaceName: string;
  // Hidden by this person, and by Admin for the role they are viewing as.
  userHidden?: string[];
  roleHidden?: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { setOpenMobile, isMobile } = useSidebar();
  const [customizing, setCustomizing] = React.useState(false);
  const has = (c: Capability) => perms.includes(c);
  const allowed = (cap?: NavItem["cap"]) => !cap || (Array.isArray(cap) ? cap.some(has) : has(cap));
  const lead = has("team.view");
  const staff = !has("nav.overview") && !has("company.view");
  const views = VIEW_PATHS.filter((v) => has(v.cap));

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "My space",
      items: [
        // My record, Leave and Claims and pay are tabs of Profile (bottom of the sidebar and the avatar menu).
        { href: "/dashboard", label: home ? "Today" : staff ? "My work" : "Home", icon: HomeIcon, badge: home ? 0 : counts.myWork, locked: true },
        { href: "/attendance", label: "Attendance", icon: ClockIcon },
        ...(approver || counts.approvals > 0 ? [{ href: "/approvals", label: "Approvals", icon: CheckCheckIcon, badge: counts.approvals }] : []),
        ...(!lead && !home ? [{ href: "/team", label: "My effort", icon: UsersIcon, cap: "nav.team" as Capability }] : []),
        { href: "/questions", label: "Questions", icon: MessageCircleQuestionIcon, badge: counts.questions, cap: "nav.questions" },
        ...(home ? [{ href: "/people", label: "People", icon: UsersRoundIcon }] : []),
      ],
    },
    ...(home ? homeGroups(home, viewerId) : []),
    {
      label: "Workflow",
      items: [
        { href: "/overview", label: "Overview", icon: ListTreeIcon, keepFilters: true, cap: "nav.overview" },
        ...(views.length
          ? [{ id: "views", href: views[0]!.href, label: "Work views", icon: LayersIcon, keepFilters: true, also: views.map((v) => v.href), badge: has("nav.board") ? counts.handoffs : 0 }]
          : []),
        { href: "/handovers", label: "Handovers", icon: PackageCheckIcon, badge: counts.incoming, cap: "nav.handovers" },
        ...(has("items.plan") || has("team.view") || activeRole === "recording" ? [{ href: "/sessions", label: "Studio sessions", icon: VideoIcon }] : []),
        { href: "/coverage", label: "Coverage", icon: GridIcon, keepFilters: true, cap: "nav.coverage" },
        { href: "/reports", label: "Reports", icon: ChartColumnIcon, keepFilters: true, cap: "reports.view" },
        ...(lead ? [{ href: "/team", label: "Team", icon: UsersIcon, badge: has("corrections.approve") ? counts.corrections : 0, cap: "team.view" as Capability }] : []),
        { href: "/email", label: "Email", icon: MailIcon, cap: ["email.send", "email.manage"] },
      ],
    },
    {
      label: "Departments",
      items: [
        { href: "/company", label: "Company overview", icon: Building2Icon, cap: "company.view" },
        { href: "/dev", label: "Dev team", icon: CodeIcon, cap: ["dev.access", "owners.view"], sub: deptViews("/dev", [{ label: "Repositories", view: "repos" }], has("users.manage")) },
        { href: "/studio", label: "Studio", icon: BookOpenIcon, cap: ["studio.access", "owners.view"] },
        { href: "/marketing", label: "Marketing", icon: MegaphoneIcon, cap: ["marketing.access", "owners.view"], sub: deptViews("/marketing", [], has("users.manage")) },
        ...customDepts.map((d) => ({ href: `/d/${d.key}`, label: d.title, icon: BriefcaseIcon, sub: deptViews(`/d/${d.key}`, [], has("users.manage")) })),
        {
          href: "/hr",
          label: "HR",
          icon: ContactIcon,
          cap: "hr.access",
          sub: [
            { label: "People", href: "/hr" },
            { label: "Leave", href: "/hr?tab=leave" },
            { label: "Attendance", href: "/attendance?tab=team" },
            { label: "Hiring", href: "/hr?tab=hiring" },
            { label: "Performance", href: "/hr?tab=performance" },
            { label: "Reports", href: "/hr?tab=reports" },
          ],
        },
        {
          href: "/finance",
          label: "Finance",
          icon: LandmarkIcon,
          cap: ["finance.access", "finance.view", "finance.payroll", "finance.owner_approve"],
          sub: [
            { label: "Overview", href: "/finance" },
            { label: "Bills", href: "/finance?tab=bills" },
            { label: "Invoices", href: "/finance?tab=invoices" },
            { label: "Payroll", href: "/finance?tab=payroll" },
            { label: "Budgets", href: "/finance?tab=budgets" },
            { label: "Reports", href: "/finance?tab=reports" },
          ],
        },
        { href: "/people", label: "People", icon: UsersRoundIcon },
        { href: "/requests", label: "Requests", icon: InboxIcon },
        { href: "/owners", label: "Owners", icon: CrownIcon, cap: "owners.view" },
        ...(reportsLink ? [{ href: "/owners?tab=reports", label: "Department reports", icon: FileTextIcon }] : []),
      ],
    },
    {
      label: "Manage",
      items: [
        { href: "/items/new", label: "New item", icon: FilePlus2Icon, cap: "items.create" },
        { href: "/assign", label: "Assign work", icon: UserPlusIcon, cap: "assign.bulk" },
        { href: "/checklists", label: "Checklists", icon: ListChecksIcon, cap: "checklists.manage" },
        { href: "/import-export", label: "Import and export", icon: ArrowLeftRightIcon, cap: ["import.run", "import.stage", "import.tracker", "export.run", "export.report", "export.tracker", "export.audit"] },
        { href: "/settings", label: "Settings", icon: SettingsIcon, cap: "settings.manage" },
        { href: "/admin", label: "Admin", icon: UserCogIcon, cap: ["users.manage", "data.manage"] },
        { href: "/admin/preview", label: "View as", icon: EyeIcon, cap: "users.manage" },
        { href: "/admin?tab=sessions", label: "Sessions and devices", icon: MonitorSmartphoneIcon, cap: "users.manage" },
        { href: "/admin/data", label: "Data manager", icon: DatabaseIcon, cap: "data.manage" },
        { href: "/audit", label: "Audit log", icon: ShieldCheckIcon, cap: ["users.manage", "items.plan"] },
      ],
    },
  ];
  // People with their own department sidebar do not get the Departments heading.
  if (home) groups.splice(groups.findIndex((g) => g.label === "Departments"), 1);
  const keyOf = (i: NavItem) => i.id ?? i.href;
  const hidden = new Set([...roleHidden, ...userHidden]);
  const visible = (i: NavItem) => allowed(i.cap) && (i.locked || !hidden.has(keyOf(i)));
  const tabParam = searchParams.get("tab");
  // Department entries match on the whole address; of several matching ones (Board, My board), the one with the
  // most matching query parts wins.
  const exactScore = (href: string) => {
    const [path, query] = href.split("?");
    if (pathname !== path) return 0;
    const want = new URLSearchParams(query ?? "");
    for (const [k, v] of want) if (searchParams.get(k) !== v) return 0;
    if (!query && tabParam) return 0;
    return 1 + [...want.keys()].length;
  };
  const bestExact = Math.max(0, ...groups.flatMap((g) => g.items.filter((i) => i.exact).map((i) => exactScore(i.href))));
  const isActive = (item: NavItem) => {
    if (item.exact) return bestExact > 0 && exactScore(item.href) === bestExact;
    const [path, query] = item.href.split("?");
    if (item.also?.includes(pathname)) return true;
    if (query) return pathname === path && new URLSearchParams(query).get("tab") === tabParam;
    return pathname === item.href || (item.href !== "/dashboard" && item.href !== "/items/new" && item.href !== "/admin" && pathname.startsWith(item.href + "/"));
  };
  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <TooltipProvider delayDuration={600}>
        <SidebarHeader className="h-14 justify-center border-b border-sidebar-border py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={workspaceName} className="h-10">
                <Link href="/dashboard" onClick={close}>
                  <span className="flex size-8 items-center justify-center rounded-md bg-white shadow-xs ring-1 ring-sidebar-border dark:bg-[#0f2a1a]">
                    <MyseedLogo className="size-6" />
                  </span>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-semibold">Myseed</span>
                    <span className="truncate text-[11px] text-muted-foreground">Content Manager</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="gap-0 py-1">
          {groups.map((g) => {
            const items = g.items.filter(visible);
            if (!items.length) return null;
            return (
              <SidebarGroup key={g.label} className="py-1">
                <SidebarGroupLabel className="h-7 text-[11px] font-semibold tracking-wide uppercase">{g.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {items.map((item) => {
                      const active = isActive(item);
                      const inSection = pathname === item.href.split("?")[0] || pathname.startsWith(item.href.split("?")[0] + "/");
                      const href = item.keepFilters ? item.href + scopeQueryString(search) : item.href;
                      const tip = NAV_TIPS[keyOf(item)] ?? NAV_TIPS[item.href.split("?")[0]!];
                      return (
                        <SidebarMenuItem key={keyOf(item)}>
                          <SidebarMenuButton
                            asChild
                            isActive={active || (inSection && !!item.sub)}
                            tooltip={{
                              hidden: false,
                              side: "right",
                              children: (
                                <div className="max-w-60">
                                  <p className="font-semibold">{item.label}</p>
                                  {tip && <p className="opacity-80">{tip}</p>}
                                </div>
                              ),
                            }}
                            className="h-8 font-medium text-sidebar-foreground/85 data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
                          >
                            <Link href={href} onClick={close}>
                              <item.icon />
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuButton>
                          {!!item.badge && item.badge > 0 && (
                            <SidebarMenuBadge className="rounded-full bg-sidebar-border/80 px-1.5 text-[10px] tabular">{item.badge > 99 ? "99+" : item.badge}</SidebarMenuBadge>
                          )}
                          {item.sub && inSection && (
                            <SidebarMenuSub>
                              {item.sub.map((s) => {
                                const [p, q] = s.href.split("?");
                                const t = q ? new URLSearchParams(q).get("tab") : null;
                                const on = pathname === p && (t ? tabParam === t || (!tabParam && t === "dashboard") : !tabParam);
                                return (
                                  <SidebarMenuSubItem key={s.href}>
                                    <SidebarMenuSubButton asChild isActive={on}>
                                      <Link href={s.href} onClick={close}>
                                        {s.label}
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </SidebarMenuSub>
                          )}
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/profile"} tooltip="Profile: my record, leave, pay and claims, account" className="h-8 font-medium">
                <Link href="/profile" onClick={close}>
                  <CircleUserIcon />
                  <span>Profile</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex items-center gap-1 px-2 group-data-[collapsible=icon]:hidden">
            <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              Viewing as <span className="font-semibold text-foreground">{ROLE_LABELS[activeRole]}</span>
            </p>
            <Button size="icon-xs" variant="ghost" aria-label="Customize the sidebar" title="Choose what your sidebar shows" onClick={() => setCustomizing(true)}>
              <Settings2Icon />
            </Button>
          </div>
        </SidebarFooter>
      </TooltipProvider>
      <SidebarRail />
      {customizing && (
        <CustomizeSidebar
          groups={groups.map((g) => ({ label: g.label, items: g.items.filter((i) => allowed(i.cap)).map((i) => ({ key: keyOf(i), label: i.label, locked: !!i.locked, byAdmin: roleHidden.includes(keyOf(i)) })) }))}
          hidden={userHidden}
          onClose={() => setCustomizing(false)}
        />
      )}
    </Sidebar>
  );
}

// Each person chooses which of their entries to show; entries Admin hid for the role stay hidden.
function CustomizeSidebar({ groups, hidden, onClose }: { groups: { label: string; items: { key: string; label: string; locked: boolean; byAdmin: boolean }[] }[]; hidden: string[]; onClose: () => void }) {
  const router = useRouter();
  const [off, setOff] = React.useState(new Set(hidden));
  const save = async () => {
    const r = await savePrefsAction({ sidebarHidden: [...off] });
    if (!r.ok) return void toast.error(r.error);
    toast.success("Sidebar saved");
    onClose();
    router.refresh();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize your sidebar</DialogTitle>
          <DialogDescription>Untick what you do not use. You only see what your role allows; hidden pages still open from links.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.label} className="space-y-1.5">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</p>
                {g.items.map((i) => (
                  <label key={i.key} className="flex items-center gap-2">
                    <Checkbox
                      checked={!off.has(i.key) && !i.byAdmin}
                      disabled={i.locked || i.byAdmin}
                      onCheckedChange={(v) => setOff((s) => (v === true ? new Set([...s].filter((x) => x !== i.key)) : new Set([...s, i.key])))}
                    />
                    {i.label}
                    {i.locked && <span className="text-xs text-muted-foreground">(always shown)</span>}
                    {i.byAdmin && <span className="text-xs text-muted-foreground">(hidden by Admin for your role)</span>}
                  </label>
                ))}
              </div>
            ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOff(new Set())}>
            Show everything
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
