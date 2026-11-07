"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CompassIcon,
  WrenchIcon,
  MicIcon,
  ZapIcon,
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
  FilmIcon,
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
  TimerIcon,
  MapIcon,
  PresentationIcon,
  TrophyIcon,
  TargetIcon,
  HeadsetIcon,
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
import { BrandMark } from "@/components/app/brand-mark";
import { savePrefsAction } from "@/app/actions/admin";
import { NAV_TIPS } from "@/lib/help";
import { ROLE_LABELS, type Capability, type Role } from "@/lib/domain";
import { scopeQueryString } from "@/lib/filters";
import { AppIcon, type Tone } from "@/components/app/app-icon";

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
  // The sub links open while you are on any of their pages (entries that gather pages from several paths).
  gather?: boolean;
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
  { label: "Analyze", href: `${base}/analyze` },
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
        ...(h.sprints ? [{ href: `${b}/sprint`, label: "Sprint", icon: TimerIcon, exact: true }] : []),
        { href: `${b}/projects`, label: "Projects", icon: FolderKanbanIcon, exact: true },
        ...(h.studio ? [{ href: `${b}/roadmap`, label: "Roadmap", icon: MapIcon, exact: true }] : []),
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
        ...(h.seeAll ? [{ href: `${b}/present`, label: "Present", icon: PresentationIcon, exact: true }] : []),
        ...(h.seeAll ? [{ href: `${b}/team`, label: "Team", icon: UsersIcon, exact: true }] : []),
        ...(h.seeAll ? [{ href: `${b}/analyze`, label: "Analyze", icon: ChartColumnIcon, exact: true }] : []),
      ],
    },
    {
      label: "Tools",
      items: [
        ...(h.repos ? [{ href: `${b}/repos`, label: "Repositories", icon: GitBranchIcon, exact: true }] : []),
        ...(h.studio ? [{ href: `${b}/docs`, label: "Specs and docs", icon: FileTextIcon, exact: true }] : []),
        { href: `${b}/tools`, label: "Releases and quality", icon: WrenchIcon, exact: true },
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
  brand = {},
  recognition = false,
  support = false,
  studioBooking = "optional",
  legacy = false,
  sessionsManager = false,
  identity = { name: "Myseed", tagline: "Content Manager", logo: false, version: "0" },
}: {
  // The site's name, tagline and logo (Admin, Branding).
  identity?: { name: string; tagline: string; logo: boolean; version: string };
  // Named to manage studio sessions (the academic manager).
  sessionsManager?: boolean;
  // The Recording team's old catalog is on (the sidebar then shows it to them and to planners).
  legacy?: boolean;
  // Studio booking (Handovers, Settings): off hides Studio sessions.
  studioBooking?: "off" | "optional" | "required";
  // Recognition switched on (Admin, Recognition): the leaderboard, badges and kudos for everyone.
  recognition?: boolean;
  // Customer support: the agent desk for agents and leads (Admin, Support).
  support?: boolean;
  // Admin's icons and colours per entry (Admin, Branding).
  brand?: Record<string, { icon?: string | null; tone?: string | null }>;
  home?: HomeDept | null;
  viewerId?: string;
  // Approves something (leave, claims, attendance, handovers): shows Approvals even when nothing waits.
  approver?: boolean;
  perms: Capability[];
  customDepts?: { key: string; title: string }[];
  reportsLink?: boolean;
  activeRole: Role;
  counts: { myWork: number; notifications: number; questions: number; handoffs: number; corrections: number; incoming: number; attendance: number; approvals: number; mail?: number; mailbox?: boolean; routines?: number };
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

  // Every Admin tab, grouped cleanly into core operational categories so the sidebar remains compact.
  const adminSub = [
    ...(has("users.manage")
      ? [
          { label: "People & Teams", href: "/admin?tab=people" },
          { label: "Departments", href: "/admin?tab=departments" },
          { label: "Roles & permissions", href: "/admin?tab=permissions" },
          { label: "Sign-in & security", href: "/admin?tab=signin" },
          { label: "External APIs & Chapa", href: "/admin?tab=external-apis" },
          { label: "Customer support", href: "/admin?tab=customer-support" },
          { label: "Clean data", href: "/admin?tab=clean-data" },
          { label: "Legacy CMS (Noor)", href: "/legacy-cms" },
          { label: "System & workspace", href: "/admin?tab=system" },
          { label: "Platform & health", href: "/admin/platform?tab=status" },
        ]
      : []),
    ...(has("data.manage") ? [{ label: "Data manager", href: "/admin/data" }] : []),
    ...(has("users.manage") ? [{ label: "Assistant AI", href: "/admin/assistant" }] : []),
  ];
  // Attendance's parts for leads, HR and Admin (the page has no tab bar for them).
  const attSub =
    approver || has("attendance.manage") || has("attendance.capture")
      ? [
          { label: "Me", href: "/attendance" },
          { label: has("attendance.manage") ? "Daily board" : "My team", href: "/attendance?tab=team" },
          { label: "Corrections", href: "/attendance?tab=corrections" },
          { label: "Timesheets", href: "/attendance?tab=timesheets" },
          ...(has("attendance.manage") ? [{ label: "Review", href: "/attendance?tab=review" }, { label: "Edit records", href: "/attendance?tab=records" }, { label: "Employee rules", href: "/attendance?tab=rules" }, { label: "Shifts and settings", href: "/attendance?tab=setup" }] : []),
          ...(has("attendance.capture") ? [{ label: "Capture", href: "/attendance?tab=capture" }] : []),
        ]
      : undefined;
  // Email's parts, for people who send to many or set it up (an inbox alone needs no links).
  const emailSub =
    has("email.send") || has("email.manage")
      ? [
          ...(counts.mailbox ? [{ label: "Inbox", href: "/email" }] : []),
          { label: counts.mailbox ? "Send to many" : "Compose", href: counts.mailbox ? "/email?tab=compose" : "/email" },
          { label: "Sent log", href: "/email?tab=sent" },
          { label: "Templates", href: "/email?tab=templates" },
          ...(has("email.manage") ? [{ label: "Settings", href: "/email?tab=settings" }] : []),
        ]
      : undefined;
  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "My space",
      items: [
        // My record, Leave and Claims and pay are tabs of Profile (bottom of the sidebar and the avatar menu).
        { href: "/dashboard", label: home ? "Today" : "Home", icon: HomeIcon, locked: true },
        // Only the person's own work (production parts, support tickets), apart from managing a team.
        ...(staff || lead || support ? [{ href: "/my-work", label: "My work", icon: BriefcaseIcon, badge: counts.myWork }] : []),
        { href: "/attendance", label: "Attendance", icon: ClockIcon, sub: attSub },
        { href: "/routines", label: "Routines", icon: ZapIcon, badge: counts.routines ?? 0 },
        { href: "/announcements", label: "Announcements", icon: MegaphoneIcon },
        ...(recognition ? [{ href: "/recognition", label: "Recognition", icon: TrophyIcon }] : []),
        { href: "/performance", label: "Performance", icon: TargetIcon },
        { href: "/strategy", label: "Strategy and M&E", icon: CompassIcon, cap: ["perf.library", "perf.view_company", "users.manage", "owners.view"] as Capability[] },
        ...(support ? [{ href: "/support", label: "Customer support", icon: HeadsetIcon }] : []),
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
          ? [{ id: "views", href: views[0]!.href, label: "Work views", icon: LayersIcon, keepFilters: true, also: views.map((v) => v.href), badge: counts.myWork }]
          : []),
        { href: "/handovers", label: "Handovers", icon: PackageCheckIcon, badge: counts.incoming, cap: "nav.handovers", sub: [{ label: "Handovers", href: "/handovers" }, { label: "Rejected", href: "/handovers/rejected" }, { label: "Report", href: "/handovers/report" }] },
        ...(studioBooking !== "off" && (sessionsManager || has("items.plan") || has("team.view") || activeRole === "recording") ? [{ href: "/sessions", label: "Studio sessions", icon: VideoIcon }] : []),
        ...(has("items.plan") || has("hr.access") || has("finance.access") || ((["recording", "editing", "uploading"] as Role[]).includes(activeRole) && lead)
          ? [{ href: "/presenters", label: "Presenters", icon: MicIcon, sub: has("hr.access") || has("finance.access") ? [{ label: "Presenters", href: "/presenters" }, { label: "Fees", href: "/presenters?tab=fees" }] : undefined }]
          : []),
        ...(legacy && (has("items.plan") || has("import.run") || has("data.manage") || activeRole === "recording") ? [{ href: "/legacy", label: "Legacy catalog", icon: FilmIcon }] : []),
        ...(has("items.plan") || has("import.run") || has("data.manage") || has("assign.bulk") || (["recording", "editing", "uploading", "publication"] as Role[]).includes(activeRole) ? [{ href: "/curriculum", label: "Curriculum", icon: ListChecksIcon, sub: [{ label: "Fix", href: "/curriculum" }, { label: "Browse and edit", href: "/curriculum?tab=browse" }, { label: "Auto-assign", href: "/curriculum?tab=auto" }, { label: "Changes", href: "/curriculum?tab=changes" }] }] : []),
        { href: "/coverage", label: "Coverage", icon: GridIcon, keepFilters: true, cap: "nav.coverage" },
        { href: "/reports", label: "Reports", icon: ChartColumnIcon, keepFilters: true, cap: "reports.view" },
        ...(lead ? [{ href: "/team", label: "Team", icon: UsersIcon, badge: has("corrections.approve") ? counts.corrections : 0, cap: "team.view" as Capability }] : []),
        ...(counts.mailbox ? [{ href: "/email", label: "Email", icon: MailIcon, badge: counts.mail ?? 0, sub: emailSub }] : [{ href: "/email", label: "Email", icon: MailIcon, cap: ["email.send", "email.manage"] as Capability[], sub: emailSub }]),
      ],
    },
    {
      label: "Departments",
      items: [
        { href: "/company", label: "Company overview", icon: Building2Icon, cap: "company.view" },
        { href: "/present", label: "Company presentation", icon: PresentationIcon, cap: "company.view" },
        { href: "/dev", label: "Dev team", icon: CodeIcon, cap: ["dev.access", "owners.view"], sub: deptViews("/dev", [{ label: "Repositories", view: "repos" }, { label: "Roadmap", view: "roadmap" }, { label: "Specs and docs", view: "docs" }, { label: "Releases and quality", view: "tools" }], has("users.manage")) },
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
            { label: "Joiners and leavers", href: "/hr?tab=lifecycle" },
            { label: "Performance", href: "/hr?tab=performance" },
            { label: "Training", href: "/hr?tab=training" },
            ...(has("hr.cases") ? [{ label: "Cases", href: "/hr?tab=cases" }] : []),
            { label: "Reports", href: "/hr?tab=reports" },
            { label: "Due soon", href: "/hr?tab=due" },
            { label: "Org chart", href: "/hr?tab=org" },
            { label: "Equipment", href: "/hr?tab=equipment" },
          ],
        },
        {
          href: "/finance",
          label: "Finance",
          icon: LandmarkIcon,
          cap: ["finance.access", "finance.view", "finance.payroll", "finance.owner_approve"],
          sub: [
            { label: "Overview", href: "/finance" },
            ...(has("finance.access") || has("finance.view")
              ? [
                  { label: "Transactions", href: "/finance?tab=transactions" },
                  { label: "Bills", href: "/finance?tab=bills" },
                  { label: "Invoices", href: "/finance?tab=invoices" },
                  { label: "External receipts", href: "/finance?tab=receipts" },
                  { label: "Expense claims", href: "/finance?tab=claims" },
                  { label: "Purchasing", href: "/finance?tab=purchasing" },
                  { label: "Budgets", href: "/finance?tab=budgets" },
                ]
              : []),
            ...(has("finance.payroll") || has("finance.owner_approve") ? [{ label: "Payroll", href: "/finance?tab=payroll" }] : []),
            ...(has("finance.access") || has("finance.view")
              ? [
                  { label: "Vendors and customers", href: "/finance?tab=parties" },
                  { label: "Accounts", href: "/finance?tab=accounts" },
                  { label: "Reports", href: "/finance?tab=reports" },
                ]
              : []),
            ...(has("finance.access") || has("finance.approve") ? [{ label: "Settings", href: "/finance?tab=settings" }] : []),
          ],
        },
        { href: "/people", label: "People", icon: UsersRoundIcon },
        { href: "/requests", label: "Requests", icon: InboxIcon },
        { href: "/owners", label: "Owners", icon: CrownIcon, cap: "owners.view", sub: [{ label: "Overview", href: "/owners" }, { label: "Department reports", href: "/owners?tab=reports" }] },
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
        { href: "/settings", label: "Settings", icon: SettingsIcon, cap: "settings.manage", sub: [{ label: "Curriculum", href: "/settings" }, { label: "Workflow", href: "/settings?tab=workflow" }, { label: "Teams", href: "/settings?tab=teams" }, { label: "Destinations", href: "/settings?tab=destinations" }, { label: "Calendar and alerts", href: "/settings?tab=calendar" }, { label: "Lists", href: "/settings?tab=lists" }, { label: "Workspace", href: "/settings?tab=workspace" }, { label: "Calls", href: "/settings?tab=calls" }] },
        { href: "/admin", label: "Admin", icon: UserCogIcon, cap: ["users.manage", "data.manage"], sub: adminSub },
        { href: "/admin/preview", label: "View as", icon: EyeIcon, cap: "users.manage" },
        { href: "/admin?tab=sessions", label: "Sessions and devices", icon: MonitorSmartphoneIcon, cap: "users.manage" },
        { href: "/admin/data", label: "Data manager", icon: DatabaseIcon, cap: "data.manage" },
        { href: "/audit", label: "Audit log", icon: ShieldCheckIcon, cap: ["users.manage", "items.plan"] },
      ],
    },
  ];
  // People with their own department sidebar do not get the Departments heading.
  if (home) groups.splice(groups.findIndex((g) => g.label === "Departments"), 1);
  // Viewing as Admin: a short sidebar. Production pages fold under one entry, the Admin tabs under Admin, and the
  // workspace setup pages sit together; departments stay as they are.
  if (activeRole === "admin" && !home) {
    const dept = groups.find((g) => g.label === "Departments")!;
    groups.splice(
      0,
      groups.length,
      {
        label: "My space",
        items: [
          { href: "/dashboard", label: "Home", icon: HomeIcon, locked: true },
          { href: "/announcements", label: "Announcements", icon: MegaphoneIcon },
          ...(recognition ? [{ href: "/recognition", label: "Recognition", icon: TrophyIcon }] : []),
          { href: "/performance", label: "Performance", icon: TargetIcon },
          { href: "/strategy", label: "Strategy and M&E", icon: CompassIcon, cap: ["perf.library", "perf.view_company", "users.manage", "owners.view"] as Capability[] },
          ...(support ? [{ href: "/support", label: "Customer support", icon: HeadsetIcon }] : []),
          ...(counts.approvals > 0 ? [{ href: "/approvals", label: "Approvals", icon: CheckCheckIcon, badge: counts.approvals }] : []),
          ...(counts.routines ? [{ href: "/routines", label: "Routines", icon: ZapIcon, badge: counts.routines }] : []),
          ...(counts.mailbox ? [{ href: "/email", label: "Email", icon: MailIcon, badge: counts.mail ?? 0, sub: emailSub }] : []),
        ],
      },
      {
        label: "Administration",
        items: [
          {
            href: "/admin",
            label: "Admin",
            icon: UserCogIcon,
            cap: ["users.manage", "data.manage"],
            gather: true,
            sub: adminSub,
          },
          {
            href: "/settings",
            label: "Settings",
            icon: SettingsIcon,
            cap: "settings.manage",
            sub: [
              { label: "Curriculum", href: "/settings" },
              { label: "Workflow", href: "/settings?tab=workflow" },
              { label: "Teams", href: "/settings?tab=teams" },
              { label: "Destinations", href: "/settings?tab=destinations" },
              { label: "Calendar and alerts", href: "/settings?tab=calendar" },
              { label: "Lists", href: "/settings?tab=lists" },
              { label: "Workspace", href: "/settings?tab=workspace" },
              { label: "Calls", href: "/settings?tab=calls" },
            ],
          },
        ],
      },
      {
        label: "Other Tools",
        items: [
          { href: "/legacy-cms", label: "Legacy CMS (Noor)", icon: ArrowLeftRightIcon, cap: ["users.manage", "data.manage"] },
          { href: "/admin/data", label: "Data manager", icon: DatabaseIcon, cap: "data.manage" },
          {
            href: "/attendance?tab=capture",
            label: "System Setups",
            icon: ClockIcon,
            sub: [
              { label: "Attendance setup", href: "/attendance?tab=capture" },
              { label: "Email setup", href: "/email?tab=settings" },
              { label: "Support setup", href: "/support?tab=settings" },
              { label: "Recognition setup", href: "/recognition?tab=settings" },
            ],
          },
          { href: "/import-export", label: "Import and export", icon: ArrowLeftRightIcon, cap: ["import.run", "import.stage", "import.tracker", "export.run", "export.report", "export.tracker", "export.audit"] },
          { href: "/audit", label: "Audit log", icon: ShieldCheckIcon, cap: ["users.manage", "items.plan"] },
        ],
      },
      {
        label: "Production",
        items: [
          {
            href: "/overview",
            label: "Production",
            icon: ListTreeIcon,
            cap: "nav.overview",
            gather: true,
            sub: [
              { label: "Overview", href: "/overview" },
              ...views.map((v) => ({ label: v.href === "/content" ? "List" : v.href === "/sheet" ? "Sheet" : v.href === "/pipeline" ? "Board" : "Calendar", href: v.href })),
              { label: "Handovers", href: "/handovers" },
              { label: "Rejected", href: "/handovers/rejected" },
              { label: "Handover report", href: "/handovers/report" },
              ...(studioBooking !== "off" ? [{ label: "Studio sessions", href: "/sessions" }] : []),
              { label: "Presenters", href: "/presenters" },
              ...(legacy ? [{ label: "Legacy catalog", href: "/legacy" }] : []),
              { label: "Curriculum", href: "/curriculum" },
              { label: "Coverage", href: "/coverage" },
              { label: "Reports", href: "/reports" },
              { label: "Team", href: "/team" },
              { label: "Checklists", href: "/checklists" },
              { label: "Assign work", href: "/assign" },
            ],
          },
        ],
      },
      { ...dept, items: dept.items.filter((i) => !["/people", "/requests"].includes(i.href)) },
    );
  }
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
  const [openGroups, setOpenGroups] = React.useState<string[]>([]);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <TooltipProvider delayDuration={600}>
        <SidebarHeader className="h-14 justify-center border-b border-sidebar-border py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={workspaceName} className="h-10">
                <Link href="/dashboard" onClick={close}>
                  <span className="flex size-8 items-center justify-center rounded-md bg-white shadow-xs ring-1 ring-sidebar-border dark:bg-[#0f2a1a]">
                    <BrandMark logo={identity.logo} version={identity.version} className="size-6" />
                  </span>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-semibold" data-site-name>{identity.name}</span>
                    {identity.tagline && <span className="truncate text-[11px] text-muted-foreground">{identity.tagline}</span>}
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
            // On phones, fewer choices at once: the first group and the one you are in are open; the others fold.
            const here = items.some((i) => isActive(i));
            const folded = (isMobile && !here && g !== groups[0] && !openGroups.includes(g.label)) || openGroups.includes(`fold:${g.label}`);
            return (
              <SidebarGroup key={g.label} className="py-1" data-nav-group={g.label} data-folded={folded ? "1" : undefined}>
                {isMobile ? (
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between px-2 text-[11px] font-semibold tracking-wide text-sidebar-foreground/70 uppercase"
                    aria-expanded={!folded}
                    onClick={() => setOpenGroups((o) => (o.includes(g.label) ? o.filter((x) => x !== g.label) : [...o, g.label]))}
                  >
                    {g.label}
                    <span className="text-xs normal-case">{folded ? `${items.length} ›` : "⌄"}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="group/lbl flex h-7 w-full items-center justify-between px-2 text-[11px] font-semibold tracking-wide text-sidebar-foreground/70 uppercase hover:text-sidebar-foreground transition-colors cursor-pointer"
                    aria-expanded={!folded}
                    onClick={() => setOpenGroups((o) => (o.includes(`fold:${g.label}`) ? o.filter((x) => x !== `fold:${g.label}`) : [...o, `fold:${g.label}`]))}
                  >
                    <span>{g.label}</span>
                    <span className="text-[10px] normal-case opacity-60 group-hover/lbl:opacity-100">{folded ? `${items.length} ›` : "⌄"}</span>
                  </button>
                )}
                <SidebarGroupContent className={folded ? "hidden" : undefined}>
                  <SidebarMenu className="gap-0.5">
                    {items.map((item) => {
                      const active = isActive(item);
                      const inSection =
                        pathname === item.href.split("?")[0] || pathname.startsWith(item.href.split("?")[0] + "/") || (!!item.gather && !!item.sub?.some((s) => pathname === s.href.split("?")[0]));
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
                              <AppIcon icon={item.icon} name={brand[keyOf(item)]?.icon} tone={(brand[keyOf(item)]?.tone as Tone | null | undefined) ?? null} />
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
                  <AppIcon icon={CircleUserIcon} />
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
