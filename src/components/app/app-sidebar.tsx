"use client";

import * as React from "react";
import { NavLink } from "@/components/app/nav-link";
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
  PhoneCallIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ClapperboardIcon,
  CalendarDaysIcon,
  LaptopIcon,
  AlertTriangleIcon,
  GraduationCapIcon,
  LifeBuoyIcon,
  PackageIcon,
  LayoutDashboardIcon,
  ShieldAlertIcon,
  GamepadIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { sidebarVisibilityAction } from "@/app/actions/integrations";
import { ADMIN_SIDEBAR_GROUPS } from "@/lib/nav";
import { pruneSidebar, sidebarHidden } from "@/lib/sidebar-visibility";
import { savePrefsAction } from "@/app/actions/admin";
import { NAV_TIPS } from "@/lib/help";
import { ROLE_LABELS, type Capability, type Role } from "@/lib/domain";
import { scopeQueryString } from "@/lib/filters";
import { AppIcon, type Tone } from "@/components/app/app-icon";

const ADMIN_CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "People & roles": UsersRoundIcon,
  "Security": ShieldCheckIcon,
  "Communication & support": HeadsetIcon,
  "Integrations": ZapIcon,
  "System & workspace": Settings2Icon,
};

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
  sub?: { label: string; href: string; keepFilters?: boolean }[];
  // The sub links open while you are on any of their pages (entries that gather pages from several paths).
  gather?: boolean;
  locked?: boolean;
  // Given to this person by Admin (a Chapa grant): the role's sidebar choices do not hide it, only their own.
  granted?: boolean;
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
  { label: "Team overview", href: `${base}/insights` },
  { label: "Analyze", href: `${base}/analyze` },
  { label: "Requests", href: `${base}/requests` },
  { label: "Data Manager", href: `${base}/data` },
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
          { href: `${b}/data`, label: "Data Manager", icon: SheetIcon, exact: true },
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
      { label: "Tools", items: [{ href: "/requests", label: "Requests", icon: InboxIcon }, { href: "/support-requests", label: "Support requests", icon: LifeBuoyIcon }] },
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
        { href: `${b}/insights`, label: "Team overview", icon: LayoutDashboardIcon, exact: true },
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
        ...(h.dataManager ? [{ href: `${b}/data`, label: "Data Manager", icon: SheetIcon, exact: true }] : []),
        { href: `${b}/tools`, label: "Releases and quality", icon: WrenchIcon, exact: true },
        ...(h.studio ? [{ href: `${b}/dojo`, label: "Dev dojo", icon: GamepadIcon, exact: true }] : []),
        ...(h.accounting ? [{ href: `${b}/accounting`, label: "Accounting", icon: CalculatorIcon, exact: true }] : []),
        { href: `${b}/requests`, label: "Requests", icon: InboxIcon, exact: true },
      ],
    },
    ...(h.configure || h.seeAll
      ? [{ label: "Department", items: [...(h.seeAll ? [{ href: `${b}/access`, label: "Access", icon: ShieldAlertIcon, exact: true }] : []), ...(h.configure ? [{ href: `${b}/configure`, label: "Configure", icon: Settings2Icon, exact: true }] : [])] }]
      : []),
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
  roleHidden: initialRoleHidden = [],
  cmsAccess: initialCmsAccess = false,
  chapaAccess = false,
  home = null,
  viewerId = "",
  approver = false,
  brand = {},
  recognition = false,
  support = false,
  overviewTeam = false,
  callRecords = false,
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
  // Production, Overview for a team's members (Admin sets which teams each role sees).
  overviewTeam?: boolean;
  // Customer support: the agent desk for agents and leads (Admin, Support).
  support?: boolean;
  // Call Records (Update 1.2, Phase 9): agents, support leads and the managers Admin allows.
  callRecords?: boolean;
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
  cmsAccess?: boolean;
  // Given Chapa by Admin (Admin, Chapa access) without a Finance role.
  chapaAccess?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { setOpenMobile, isMobile, state, toggleSidebar } = useSidebar();
  // Collapsed to icons on a desktop or tablet: group labels and sub-pages hide; the sub-pages show as tabs on top of the page.
  const iconOnly = state === "collapsed" && !isMobile;
  const [customizing, setCustomizing] = React.useState(false);
  const [roleHidden,setRoleHidden]=React.useState(initialRoleHidden);
  const [cmsAccess,setCmsAccess]=React.useState(initialCmsAccess);
  React.useEffect(()=>{setRoleHidden(initialRoleHidden);setCmsAccess(initialCmsAccess);},[initialRoleHidden,initialCmsAccess]);
  React.useEffect(()=>{
    // At most once a minute, also when the window is focused or shown again (every tab switch used to ask the server).
    let cancelled=false, pending=false, last=Date.now();
    const refresh=async()=>{if(pending||document.visibilityState!=="visible"||Date.now()-last<55000)return;pending=true;last=Date.now();try{const r=await sidebarVisibilityAction();if(!cancelled&&r.ok&&r.data){setRoleHidden(current=>JSON.stringify(current)===JSON.stringify(r.data!.hidden)?current:r.data!.hidden);setCmsAccess(r.data.cmsAccess);}}catch{}finally{pending=false;}};
    const timer=window.setInterval(refresh,60000);window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[activeRole]);

  const has = (c: Capability) => perms.includes(c);
  const allowed = (cap?: NavItem["cap"]) => !cap || (Array.isArray(cap) ? cap.some(has) : has(cap));
  const lead = has("team.view");
  const staff = !has("nav.overview") && !has("company.view");
  const views = VIEW_PATHS.filter((v) => has(v.cap));

  // Every Admin tab, grouped cleanly into core operational categories so the sidebar remains compact.
  const adminSub = [
    ...(has("users.manage")
      ? [
          { label: "Configure whole system", href: "/admin/configure" },
          { label: "People & Teams", href: "/admin?tab=people" },
          { label: "Departments", href: "/admin?tab=departments" },
          { label: "Roles & permissions", href: "/admin?tab=permissions" },
          { label: "Sign-in & security", href: "/admin?tab=signin" },
          { label: "Sessions & devices", href: "/admin?tab=sessions" },
          { label: "External APIs & Chapa", href: "/admin?tab=external-apis" },
          { label: "Customer support", href: "/admin?tab=customer-support" },
          { label: "Clean data", href: "/admin?tab=clean-data" },
          { label: "System & workspace", href: "/admin?tab=system" },
          { label: "Platform & health", href: "/admin/platform?tab=status" },
          { label: "View as", href: "/admin/preview" },
        ]
      : []),
    ...(has("data.manage") && has("users.manage") ? [{ label: "Data manager", href: "/admin/data" }] : []),
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
          // Kiosks are set up by Admin and HR only; leads and members never see the link.
          ...(has("attendance.manage") || has("attendance.capture") ? [{ label: "Kiosk station", href: "/kiosk" }] : []),
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
  // Settings' pages, one list for every role (it was written out twice).
  const settingsSub = [{ label: "Curriculum", href: "/settings" }, { label: "Workflow", href: "/settings?tab=workflow" }, { label: "Teams", href: "/settings?tab=teams" }, { label: "Destinations", href: "/settings?tab=destinations" }, { label: "Calendar and alerts", href: "/settings?tab=calendar" }, { label: "Lists", href: "/settings?tab=lists" }, { label: "Workspace", href: "/settings?tab=workspace" }, { label: "Calls", href: "/settings?tab=calls" }];
  // Production as one department: its pages (each only for those allowed to open it) are the tab bar on the page.
  const viewLabel = (h: string) => (h === "/content" ? "List" : h === "/sheet" ? "Sheet" : h === "/pipeline" ? "Board" : "Calendar");
  const productionSub: { label: string; href: string; keepFilters?: boolean }[] = [
    ...(has("nav.overview") || overviewTeam ? [{ label: overviewTeam && !has("nav.overview") ? "Team overview" : "Overview", href: "/overview", keepFilters: true }] : []),
    ...views.map((v) => ({ label: viewLabel(v.href), href: v.href, keepFilters: true })),
    ...(has("nav.handovers") ? [{ label: "Handovers", href: "/handovers" }] : []),
    ...(studioBooking !== "off" && (sessionsManager || has("items.plan") || has("team.view") || has("sessions.view") || has("sessions.book") || activeRole === "recording") ? [{ label: "Studio sessions", href: "/sessions" }] : []),
    ...(has("items.plan") || has("hr.access") || has("finance.access") || has("presenters.view") || has("presenters.register") || has("presenters.assign") || ((["recording", "editing", "uploading"] as Role[]).includes(activeRole) && lead) ? [{ label: "Presenters", href: "/presenters" }] : []),
    ...(legacy && (has("items.plan") || has("import.run") || has("data.manage") || activeRole === "recording") ? [{ label: "Legacy catalog", href: "/legacy" }] : []),
    ...(lead || has("curriculum.manage") ? [{ label: "Curriculum", href: "/curriculum" }] : []),
    ...(has("nav.coverage") ? [{ label: "Coverage", href: "/coverage", keepFilters: true }] : []),
    ...(has("reports.view") ? [{ label: "Reports", href: "/reports", keepFilters: true }] : []),
    ...(lead && has("team.view") ? [{ label: "Team", href: "/team" }] : []),
    ...(has("checklists.manage") ? [{ label: "Checklists", href: "/checklists" }] : []),
    ...(has("assign.bulk") ? [{ label: "Assign work", href: "/assign" }] : []),
  ];
  const productionItem: NavItem | null = productionSub.length
    ? {
        id: "production",
        href: productionSub[0]!.href,
        label: "Production",
        icon: ClapperboardIcon,
        gather: true,
        keepFilters: productionSub[0]!.keepFilters,
        badge: counts.incoming + (lead && has("corrections.approve") ? counts.corrections : 0),
        // Pages under these count as being in Production too (the handover pages, an item's pages under a view).
        also: [...productionSub.map((x) => x.href.split("?")[0]!), "/handovers/rejected", "/handovers/report"],
        sub: productionSub,
      }
    : null;
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
        ...(callRecords ? [{ href: "/call-records", label: "Call records", icon: PhoneCallIcon }] : []),
        ...(approver || counts.approvals > 0 ? [{ href: "/approvals", label: "Approvals", icon: CheckCheckIcon, badge: counts.approvals }] : []),
        ...(!lead && !home ? [{ href: "/team", label: "My effort", icon: UsersIcon, cap: "nav.team" as Capability }] : []),
        { href: "/questions", label: "Questions", icon: MessageCircleQuestionIcon, badge: counts.questions, cap: "nav.questions" },
        ...(counts.mailbox ? [{ href: "/email", label: "Email", icon: MailIcon, badge: counts.mail ?? 0, sub: emailSub }] : [{ href: "/email", label: "Email", icon: MailIcon, cap: ["email.send", "email.manage"] as Capability[], sub: emailSub }]),
        ...(home ? [{ href: "/people", label: "People", icon: UsersRoundIcon }] : []),
      ],
    },
    ...(home ? homeGroups(home, viewerId) : []),
    // A person with their own department sidebar keeps Production as one entry (its heading is left out).
    ...(home && productionItem ? [{ label: "Production", items: [productionItem] }] : []),
    {
      label: "Departments",
      items: [
        ...(productionItem ? [productionItem] : []),
        { href: "/company", label: "Company overview", icon: Building2Icon, cap: "company.view" },
        { href: "/present", label: "Company presentation", icon: PresentationIcon, cap: "company.view" },
        { href: "/dev", label: "Dev team", icon: CodeIcon, cap: ["dev.access", "owners.view"], sub: deptViews("/dev", [{ label: "Sprint", view: "sprint" }, { label: "Repositories", view: "repos" }, { label: "Roadmap", view: "roadmap" }, { label: "Specs and docs", view: "docs" }, { label: "Releases and quality", view: "tools" }], has("users.manage")) },
        { href: "/studio", label: "Studio", icon: BookOpenIcon, cap: ["studio.access", "owners.view"], sub: [{ label: "Home", href: "/studio" }, { label: "Data Manager", href: "/studio/data" }] },
        { href: "/marketing", label: "Marketing", icon: MegaphoneIcon, cap: ["marketing.access", "owners.view"], sub: deptViews("/marketing", [], has("users.manage")) },
        ...customDepts.map((d) => ({ href: `/d/${d.key}`, label: d.title, icon: BriefcaseIcon, sub: deptViews(`/d/${d.key}`, [], has("users.manage")) })),
        {
          href: "/hr",
          label: "HR",
          icon: ContactIcon,
          cap: "hr.access",
          sub: [
            { label: "People", href: "/hr" },
            { label: "Data Manager", href: "/hr/data" },
            { label: "Leave", href: "/hr?tab=leave" },
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
                  { label: "Data Manager", href: "/finance/data" },
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
        { href: "/support-requests", label: "Support requests", icon: LifeBuoyIcon },
        { href: "/owners", label: "Owners", icon: CrownIcon, cap: "owners.view", sub: [{ label: "Overview", href: "/owners" }, { label: "Department reports", href: "/owners?tab=reports" }] },
        ...(reportsLink ? [{ href: "/owners?tab=reports", label: "Department reports", icon: FileTextIcon }] : []),
      ],
    },
    {
      label: "Manage",
      items: [
        { href: "/items/new", label: "New item", icon: FilePlus2Icon, cap: "items.create" },
        { href: "/import-export", label: "Import and export", icon: ArrowLeftRightIcon, cap: ["import.run", "import.stage", "import.tracker", "export.run", "export.report", "export.tracker", "export.audit"] },
        { href: "/settings", label: "Settings", icon: SettingsIcon, cap: "settings.manage", sub: settingsSub },
        // View as is one of Admin's pages (adminSub), not a second entry.
        { href: "/admin", label: "Admin", icon: UserCogIcon, cap: "users.manage", sub: adminSub },
        // Data manager and Sessions are under Admin for Admin; a data manager without Admin keeps their own entry.
        ...(!has("users.manage") ? [{ href: "/admin/data", label: "Data manager", icon: DatabaseIcon, cap: "data.manage" as Capability }] : []),
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
          { href: "/my-work?tab=admin", label: "My work", icon: BriefcaseIcon, badge: counts.approvals > 0 ? counts.approvals : undefined },
          { href: "/attendance", label: "Attendance", icon: ClockIcon, sub: attSub },
          { href: "/announcements", label: "Announcements", icon: MegaphoneIcon },
          ...(recognition ? [{ href: "/recognition", label: "Recognition", icon: TrophyIcon }] : []),
          { href: "/performance", label: "Performance", icon: TargetIcon },
          { href: "/strategy", label: "Strategy and M&E", icon: CompassIcon, cap: ["perf.library", "perf.view_company", "users.manage", "owners.view"] as Capability[] },
          ...(support ? [{ href: "/support", label: "Customer support", icon: HeadsetIcon }] : []),
        ...(callRecords ? [{ href: "/call-records", label: "Call records", icon: PhoneCallIcon }] : []),
          ...(counts.approvals > 0 ? [{ href: "/approvals", label: "Approvals", icon: CheckCheckIcon, badge: counts.approvals }] : []),
          ...(counts.routines ? [{ href: "/routines", label: "Routines", icon: ZapIcon, badge: counts.routines }] : []),
          ...((counts.mailbox || has("email.manage") || has("email.send")) ? [{ href: "/email", label: "Email", icon: MailIcon, badge: counts.mail ?? 0, sub: emailSub }] : []),
        ],
      },
      {
        label: "Administration",
        items: [
          ...ADMIN_SIDEBAR_GROUPS.map((category) => ({
            href: category.links[0].href,
            label: category.label,
            icon: ADMIN_CATEGORY_ICONS[category.label] ?? UserCogIcon,
            cap: "users.manage" as Capability,
            exact: true,
            gather: true,
            sub: category.links,
          })),
          {
            href: "/settings",
            label: "Settings",
            icon: SettingsIcon,
            cap: "settings.manage",
            sub: settingsSub,
          },
        ],
      },
      {
        label: "Data & records",
        items: [
          { href: "/admin/data", label: "Data manager", icon: DatabaseIcon, cap: "data.manage" },
          { href: "/import-export", label: "Import and export", icon: ArrowLeftRightIcon, cap: ["import.run", "import.stage", "import.tracker", "export.run", "export.report", "export.tracker", "export.audit"] },
          { href: "/audit", label: "Audit log", icon: ShieldCheckIcon, cap: ["users.manage", "items.plan"] },
        ],
      },
      { ...dept, items: dept.items.filter((i) => !["/people", "/requests"].includes(i.href)) },
    );
  }
  if ((activeRole === "hr_manager" || activeRole === "hr_officer") && !home) {
    const dept = groups.find((g) => g.label === "Departments");
    groups.splice(
      0,
      groups.length,
      {
        label: "My space",
        items: [
          { href: "/hr", label: "HR Home", icon: HomeIcon, locked: true },
          { href: "/my-work", label: "My work", icon: BriefcaseIcon, badge: counts.myWork },
          { href: "/approvals", label: "Approvals", icon: CheckCheckIcon, badge: counts.approvals > 0 ? counts.approvals : undefined },
          { href: "/attendance", label: "My attendance", icon: ClockIcon, sub: attSub },
          { href: "/announcements", label: "Announcements", icon: MegaphoneIcon },
          { href: "/performance", label: "Performance", icon: TargetIcon },
          ...((counts.mailbox || has("email.manage") || has("email.send")) ? [{ href: "/email", label: "Email", icon: MailIcon, badge: counts.mail ?? 0, sub: emailSub }] : []),
        ],
      },
      {
        label: "People & Records",
        items: [
          { href: "/hr", label: "Employees", icon: UsersRoundIcon, exact: true },
          { href: "/hr?tab=org", label: "Org chart", icon: UsersIcon, exact: true },
          { href: "/hr?tab=due", label: "Due milestones", icon: CalendarIcon, exact: true },
          { href: "/people", label: "Company directory", icon: ContactIcon },
        ],
      },
      {
        label: "Time & Leave",
        items: [
          { href: "/hr?tab=leave", label: "Leave management", icon: CalendarDaysIcon, exact: true },
          { href: "/attendance?tab=team", label: "Staff attendance", icon: ClockIcon, exact: true },
        ],
      },
      {
        label: "Talent & Growth",
        items: [
          { href: "/hr?tab=hiring", label: "Hiring & jobs", icon: UserPlusIcon, exact: true },
          { href: "/hr?tab=lifecycle", label: "Checklists & lifecycle", icon: ListChecksIcon, exact: true },
          { href: "/hr?tab=performance", label: "Appraisals & reviews", icon: TargetIcon, exact: true },
          { href: "/hr?tab=training", label: "Training courses", icon: BookOpenIcon, exact: true },
          ...(has("hr.cases") ? [{ href: "/hr?tab=cases", label: "HR cases", icon: AlertTriangleIcon, exact: true }] : []),
        ],
      },
      {
        label: "Assets & Compliance",
        items: [
          { href: "/hr/data", label: "Data Manager", icon: SheetIcon, exact: true },
          { href: "/hr?tab=equipment", label: "Staff equipment", icon: LaptopIcon, exact: true },
          { href: "/resources", label: "Finance & equipment", icon: InboxIcon },
          { href: "/presenters", label: "Presenters & fees", icon: MicIcon },
          { href: "/hr?tab=reports", label: "HR reports", icon: ChartColumnIcon, exact: true },
        ],
      },
      ...(dept ? [{ ...dept, items: dept.items.filter((i) => !["/people", "/requests"].includes(i.href)) }] : []),
    );
  }
  // Finance requests and equipment sit with Requests (Departments), or in the department's Tools; HR has it already.
  if (!groups.some((g) => g.items.some((i) => i.href === "/resources"))) {
    const resourceGroup = groups.find((g) => g.label === "Departments") ?? groups.find((g) => g.label === "Tools");
    const resourceItem: NavItem = { href: "/resources", label: "Finance requests & equipment", icon: PackageIcon };
    if (resourceGroup) resourceGroup.items.push(resourceItem);
    else groups.push({ label: "Resources", items: [resourceItem] });
  }
  // Payments and Noor data get a group of their own, after the departments (before Manage and Data & records).
  const payments: NavItem[] = [];
  // Payments and Noor data (Update 1.0): every page listed, so they are found without opening Finance.
  if (has("finance.access") || has("finance.view") || has("users.manage") || chapaAccess) {
    const chapaItem: NavItem = {
      href: "/finance/chapa",
      label: "Chapa payments",
      icon: WalletIcon,
      granted: chapaAccess,
      sub: [
        { label: "Overview", href: "/finance/chapa" },
        { label: "Transactions", href: "/finance/chapa?tab=transactions" },
        { label: "Daily board", href: "/finance/chapa?tab=daily" },
        { label: "Customers", href: "/finance/chapa?tab=customers" },
        { label: "Follow-up", href: "/finance/chapa?tab=followup" },
        { label: "Balance & swap", href: "/finance/chapa?tab=balance" },
        { label: "Withdrawals", href: "/finance/chapa?tab=withdrawals" },
        { label: "Refunds", href: "/finance/chapa?tab=refunds" },
        { label: "Account funds", href: "/finance/chapa?tab=funds" },
        { label: "Match to Noor", href: "/finance/chapa?tab=match" },
        ...(has("users.manage") || has("settings.manage") ? [{ label: "Chapa settings", href: "/finance/chapa?tab=settings" }] : []),
        ...(has("users.manage") ? [{ label: "User access", href: "/admin?tab=chapa-access" }] : []),
      ],
    };
    payments.push(chapaItem);
  }
  if(cmsAccess){const cmsItem:NavItem={href:"/legacy-cms",label:"Legacy CMS (Noor)",icon:GraduationCapIcon,sub:[{label:"Live",href:"/legacy-cms?view=live"},{label:"Invoices",href:"/legacy-cms?view=invoices"},{label:"Revenue",href:"/legacy-cms?view=revenue"},{label:"Growth",href:"/legacy-cms?view=growth"},{label:"Records",href:"/legacy-cms?view=records"},{label:"Noor admin",href:"/legacy-cms?view=admin"},{label:"Reports & dashboard",href:"/legacy-cms?view=reports"},{label:"Contacts",href:"/legacy-cms?view=contacts"},{label:"Families",href:"/legacy-cms?view=families"},{label:"Storage & snapshots",href:"/legacy-cms?view=storage"},...(has("users.manage")?[{label:"User access & credentials",href:"/admin?tab=legacy-cms"}]:[])]};payments.push(cmsItem);}
  if (payments.length) {
    const before = groups.findIndex((g) => ["Manage", "Data & records"].includes(g.label));
    groups.splice(before < 0 ? groups.length : before, 0, { label: "Payments & Noor", items: payments });
  }

  const keyOf = (i: NavItem) => i.id ?? i.href;
  const hidden = [...roleHidden, ...userHidden];
  // A page opened without a tab shows its first one (Admin opens on People), so the sidebar marks that one.
  const tabParam = searchParams.get("tab") ?? (pathname === "/admin" && has("users.manage") ? "people" : null);
  // Department entries match on the whole address; of several matching ones (Board, My board), the one with the
  // most matching query parts wins.
  const exactScore = (href: string) => {
    const [path, query] = href.split("?");
    if (pathname !== path) return 0;
    const want = new URLSearchParams(query ?? "");
    for (const [k, v] of want) if ((k === "tab" ? tabParam : searchParams.get(k)) !== v) return 0;
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
  const subActive = (href: string) => {
    const [p, q] = href.split("?");
    const t = q ? new URLSearchParams(q).get("tab") : null;
    return pathname === p && (t ? tabParam === t || (!tabParam && t === "dashboard") : !tabParam);
  };
  const [openGroups, setOpenGroups] = React.useState<string[]>([]);
  // The entry you are in, for the tab bar shown on top of the page while the sidebar is collapsed to icons.
  const inSectionOf = (item: NavItem) =>
    item.exact && item.sub
      ? item.sub.some((s) => { const [p, q] = s.href.split("?"); return pathname === p && new URLSearchParams(q).get("tab") === tabParam; })
      : pathname === item.href.split("?")[0] || pathname.startsWith(item.href.split("?")[0] + "/") || (!!item.gather && !!item.sub?.some((s) => pathname === s.href.split("?")[0]));
  // Hiding Finance for a role also hides /finance/chapa; a person's own grant still shows it.
  const prune = (items: NavItem[]) => items.flatMap((i) => pruneSidebar([i], i.granted ? userHidden : hidden));
  const visibleItems = groups.flatMap((g) => prune(g.items.filter((i) => allowed(i.cap))));
  const sectionItem = visibleItems.find((i) => i.sub && i.sub.some((s) => subActive(s.href))) ?? visibleItems.find((i) => i.sub && inSectionOf(i));
  const sectionKey = sectionItem ? JSON.stringify([sectionItem.label, sectionItem.sub, search]) : "";
  // Does the page you are on draw these pages as its own tabs (Admin, Attendance, Email)? Then the sidebar keeps the
  // section folded, so they never show twice; otherwise it opens the section you are in. No tab bar is added to pages.
  const [pageTabs, setPageTabs] = React.useState(false);
  React.useEffect(() => {
    const subs = sectionItem?.sub;
    const main = document.querySelector("main");
    if (!subs || subs.length < 2 || !main) return setPageTabs(false);
    const check = () => {
      if (main.querySelector("[data-page-tabs]")) return setPageTabs(true);
      const hrefs = new Set([...main.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => (a.getAttribute("href") ?? "").split("&")[0]));
      const names = new Set([...main.querySelectorAll<HTMLElement>('[role="tab"], [data-slot="tabs-trigger"]')].map((el) => (el.textContent ?? "").replace(/\s*\d+$/, "").trim().toLowerCase()));
      const half = Math.ceil(subs.length / 2);
      setPageTabs(subs.filter((x) => hrefs.has(x.href)).length >= half || subs.filter((x) => names.has(x.label.toLowerCase())).length >= half);
    };
    check();
    let frame = 0;
    const mo = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => ((frame = 0), check()));
    });
    mo.observe(main, { childList: true, subtree: true });
    const stop = window.setTimeout(() => mo.disconnect(), 4000);
    return () => {
      mo.disconnect();
      window.clearTimeout(stop);
      if (frame) window.cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, pathname, tabParam]);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <TooltipProvider delayDuration={600}>
        <SidebarHeader className="h-14 justify-center border-b border-sidebar-border py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={workspaceName} className="h-10">
                <NavLink href="/dashboard" onClick={close}>
                  <span className="flex size-8 items-center justify-center rounded-md bg-white shadow-xs ring-1 ring-sidebar-border dark:bg-[#0f2a1a]">
                    <BrandMark logo={identity.logo} version={identity.version} className="size-6" />
                  </span>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-semibold" data-site-name>{identity.name}</span>
                    {identity.tagline && <span className="truncate text-[11px] text-muted-foreground">{identity.tagline}</span>}
                  </span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="gap-0 py-1">
          {groups.map((g) => {
            const items = prune(g.items.filter(i=>allowed(i.cap)));
            if (!items.length) return null;
            // On phones, fewer choices at once: the first group and the one you are in are open; the others fold.
            const here = items.some((i) => isActive(i));
            const folded = !iconOnly && (openGroups.includes(`fold:${g.label}`) || (isMobile && !here && g !== groups[0] && !openGroups.includes(`open:${g.label}`)));
            const toggleGroup=()=>setOpenGroups(o=>[...o.filter(k=>k!==`fold:${g.label}`&&k!==`open:${g.label}`),`${folded?"open":"fold"}:${g.label}`]);
            // A heading that only repeats its one entry (Production, Production) is left out.
            const bare = items.length === 1 && items[0]!.label.toLowerCase() === g.label.toLowerCase();
            return (
              <SidebarGroup key={g.label} className="py-1" data-nav-group={g.label} data-folded={folded ? "1" : undefined}>
                {iconOnly && g !== groups.find((x) => prune(x.items.filter((i) => allowed(i.cap))).length) && <div role="separator" aria-hidden className="mx-2 mb-1 h-px bg-sidebar-border" />}
                {bare ? null : isMobile ? (
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between px-2 text-[11px] font-semibold tracking-wide text-sidebar-foreground/85 uppercase"
                    aria-expanded={!folded}
                    onClick={toggleGroup}
                  >
                    {g.label}
                    <ChevronDownIcon className={cn("size-4 transition-transform",folded && "-rotate-90")} />
                  </button>
                ) : (
                  <button data-sidebar="group-label"
                    type="button"
                    className="group/lbl group-data-[collapsible=icon]:hidden flex h-7 w-full items-center justify-between px-2 text-[11px] font-semibold tracking-wide text-sidebar-foreground/85 uppercase hover:text-sidebar-foreground transition-colors cursor-pointer"
                    aria-expanded={!folded}
                    onClick={toggleGroup}
                  >
                    <span>{g.label}</span>
                    <ChevronDownIcon className={cn("size-4 opacity-70 transition-transform",folded && "-rotate-90")} />
                  </button>
                )}
                <SidebarGroupContent className={folded ? "hidden" : undefined}>
                  <SidebarMenu className="gap-0.5">
                    {items.map((item) => {
                      const active = isActive(item);
                      const inSection = inSectionOf(item);
                      // The section you are in opens by itself, unless the page shows the same pages as its own tabs; the arrow
                      // opens or folds any section.
                      const expanded = openGroups.includes(`item:${item.href}`) || (inSection && !pageTabs && !!sectionItem && keyOf(item) === keyOf(sectionItem) && !openGroups.includes(`closed:${item.href}`));
                      const href = item.keepFilters ? item.href + scopeQueryString(search) : item.href;
                      const tip = NAV_TIPS[keyOf(item)] ?? NAV_TIPS[item.href.split("?")[0]!];
                      return (
                        <SidebarMenuItem key={keyOf(item)}>
                          {(
                          <div className="flex min-w-0 items-center gap-1" data-nav-row>
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
                            className="h-8 min-w-0 flex-1 font-medium text-sidebar-foreground/85 data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
                          >
                            <NavLink href={href} onClick={close} className="flex w-full items-center">
                              <AppIcon icon={item.icon} name={brand[keyOf(item)]?.icon} tone={(brand[keyOf(item)]?.tone as Tone | null | undefined) ?? null} />
                              <span className="min-w-0 flex-1 truncate">{item.label}</span>

                            </NavLink>
                          </SidebarMenuButton>
                          <div className="flex shrink-0 items-center gap-1 pr-1 group-data-[collapsible=icon]:hidden" data-nav-controls>
                          {!!item.badge && item.badge>0 && <span data-sidebar="menu-badge" data-nav-count={item.badge} title={String(item.badge)} aria-label={`${item.label}: ${item.badge}`} className="pointer-events-none flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 text-primary border border-primary/25 px-1.5 text-[10px] font-semibold tabular-nums shadow-xs">{item.badge>99?"99+":item.badge}</span>}
                          {item.sub && <button type="button" aria-label={`${expanded?"Collapse":"Expand"} ${item.label}`} aria-expanded={expanded} className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-sidebar-ring" onClick={()=>setOpenGroups(o=>[...o.filter(k=>k!==`item:${item.href}`&&k!==`closed:${item.href}`),`${expanded?"closed":"item"}:${item.href}`])}><ChevronDownIcon className={cn("size-4 transition-transform",!expanded&&"-rotate-90")}/></button>}
                          </div>
                          </div>
                          )}
                          {item.sub && expanded && !iconOnly && (
                            <SidebarMenuSub>
                              {item.sub.map((s) => {
                                const on = subActive(s.href);
                                return (
                                  <SidebarMenuSubItem key={s.href}>
                                    <SidebarMenuSubButton asChild isActive={on}>
                                      <NavLink href={s.keepFilters?s.href+scopeQueryString(search):s.href} onClick={close}>
                                        {s.label}
                                      </NavLink>
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
                <NavLink href="/profile" onClick={close}>
                  <AppIcon icon={CircleUserIcon} />
                  <span>Profile</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex items-center gap-1 px-2 group-data-[collapsible=icon]:hidden">
            <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              Viewing as <span className="font-semibold text-foreground">{ROLE_LABELS[activeRole] || activeRole}</span>
            </p>
            <Button size="icon-xs" variant="ghost" aria-label="Customize the sidebar" title="Choose what your sidebar shows" onClick={() => setCustomizing(true)}>
              <Settings2Icon />
            </Button>
          </div>
        </SidebarFooter>
      </TooltipProvider>
      <SidebarRail />
      {/* The open/close handle in the middle of the sidebar's edge (also Ctrl+B). Phones use the More tab. */}
      {!isMobile && (
        <button
          type="button"
          onClick={toggleSidebar}
          data-sidebar="trigger"
          aria-label={iconOnly ? "Open the sidebar" : "Close the sidebar"}
          title={iconOnly ? "Open the sidebar (Ctrl+B)" : "Close the sidebar (Ctrl+B)"}
          className="absolute top-1/2 -right-3 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/70 shadow-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <ChevronLeftIcon className={cn("size-3.5 transition-transform", iconOnly && "rotate-180")} />
        </button>
      )}
      {customizing && (
        <CustomizeSidebar
          groups={groups.map((g) => ({ label: g.label, items: g.items.filter((i) => allowed(i.cap)).map((i) => ({ key: keyOf(i), label: i.label, locked: !!i.locked, byAdmin: !i.granted && sidebarHidden(i.href,roleHidden,i.id) })) }))}
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
