"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeftRightIcon,
  CalendarDaysIcon,
  DatabaseIcon,
  ChartColumnIcon,
  FilePlus2Icon,
  FileSpreadsheetIcon,
  GridIcon,
  HomeIcon,
  KanbanIcon,
  ListChecksIcon,
  MailIcon,
  PackageCheckIcon,
  UserPlusIcon,
  ListTreeIcon,
  MessageCircleQuestionIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TableIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";
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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { MyseedLogo } from "@/components/app/logo";
import { ROLE_LABELS, type Capability, type Role } from "@/lib/domain";
import { scopeQueryString } from "@/lib/filters";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  cap?: Capability | Capability[];
  keepFilters?: boolean;
};

export function AppSidebar({
  perms,
  activeRole,
  counts,
  workspaceName,
}: {
  perms: Capability[];
  activeRole: Role;
  counts: { myWork: number; notifications: number; questions: number; handoffs: number; corrections: number };
  workspaceName: string;
}) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const allowed = (cap?: NavItem["cap"]) => !cap || (Array.isArray(cap) ? cap.some((c) => perms.includes(c)) : perms.includes(cap));
  const groups: { label?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: "/dashboard", label: "Home", icon: HomeIcon, badge: counts.myWork },
        { href: "/overview", label: "Overview", icon: ListTreeIcon, keepFilters: true, cap: "nav.overview" },
        { href: "/questions", label: "Questions", icon: MessageCircleQuestionIcon, badge: counts.questions, cap: "nav.questions" },
        { href: "/handovers", label: "Handovers", icon: PackageCheckIcon, cap: "nav.handovers" },
        { href: "/email", label: "Email", icon: MailIcon, cap: ["email.send", "email.manage"] },
      ],
    },
    {
      label: "Views",
      items: [
        { href: "/content", label: "List", icon: TableIcon, keepFilters: true, cap: "nav.list" },
        { href: "/sheet", label: "Sheet", icon: FileSpreadsheetIcon, keepFilters: true, cap: "nav.sheet" },
        { href: "/pipeline", label: "Board", icon: KanbanIcon, badge: counts.handoffs, keepFilters: true, cap: "nav.board" },
        { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon, keepFilters: true, cap: "nav.calendar" },
      ],
    },
    {
      label: "Insights",
      items: [
        { href: "/coverage", label: "Coverage", icon: GridIcon, keepFilters: true, cap: "nav.coverage" },
        { href: "/reports", label: "Reports", icon: ChartColumnIcon, keepFilters: true, cap: "reports.view" },
        { href: "/team", label: perms.includes("team.view") ? "Team" : "My effort", icon: UsersIcon, badge: perms.includes("corrections.approve") ? counts.corrections : 0, cap: "nav.team" },
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
        { href: "/admin/data", label: "Data manager", icon: DatabaseIcon, cap: "data.manage" },
        { href: "/audit", label: "Audit log", icon: ShieldCheckIcon, cap: ["users.manage", "items.plan"] },
      ],
    },
  ];

  const searchParams = useSearchParams();
  const search = searchParams.toString();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={workspaceName} className="h-10">
              <Link href="/dashboard" onClick={() => isMobile && setOpenMobile(false)}>
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
        {groups.map((g, gi) => {
          const items = g.items.filter((i) => allowed(i.cap));
          if (!items.length) return null;
          return (
            <SidebarGroup key={g.label ?? gi} className="py-1">
              {g.label && <SidebarGroupLabel className="h-7 text-[11px] font-semibold tracking-wide uppercase">{g.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) => {
                    const active = pathname === item.href || (item.href !== "/dashboard" && item.href !== "/items/new" && item.href !== "/admin" && pathname.startsWith(item.href + "/"));
                    const href = item.keepFilters ? item.href + scopeQueryString(search) : item.href;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className="h-8 font-medium text-sidebar-foreground/85 data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
                        >
                          <Link href={href} onClick={() => isMobile && setOpenMobile(false)}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {!!item.badge && item.badge > 0 && (
                          <SidebarMenuBadge className="rounded-full bg-sidebar-border/80 px-1.5 text-[10px] tabular">{item.badge > 99 ? "99+" : item.badge}</SidebarMenuBadge>
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
      <SidebarFooter className="border-t border-sidebar-border group-data-[collapsible=icon]:hidden">
        <p className="px-2 text-[11px] text-muted-foreground">
          Viewing as <span className="font-semibold text-foreground">{ROLE_LABELS[activeRole]}</span>
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
