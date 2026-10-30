import Link from "next/link";
import {
  ArrowLeftRightIcon,
  Building2Icon,
  CalendarDaysIcon,
  FilePlus2Icon,
  FileTextIcon,
  KanbanIcon,
  ListTreeIcon,
  MessageCircleIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";
import type { Viewer } from "@/server/auth";
import { all } from "@/server/db";
import { structureRows } from "@/server/structure";
import { can } from "@/server/users";
import { StructureDashboard } from "@/components/app/structure-dashboard";
import { PageHeader } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

// Manager and admin home: the Overview insights and quick actions, nothing else.
export async function ManagerHome({ viewer, timezone, greeting }: { viewer: Viewer; timezone: string; greeting: string }) {
  const rows = await structureRows(viewer);
  const waiting = (await all<{ c: number }>("SELECT COUNT(*) AS c FROM items WHERE lifecycle = 'in_production' AND stage_status = 'awaiting_handoff'"))[0]?.c ?? 0;
  const unassigned = (await all<{ c: number }>("SELECT COUNT(*) AS c FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id WHERE i.lifecycle = 'in_production' AND a.owner_id IS NULL"))[0]?.c ?? 0;
  const actions = [
    { href: "/items/new", label: "New item", hint: "Plan a part", icon: FilePlus2Icon, show: can(viewer, "items.create") },
    { href: "/import-export", label: "Import data", hint: "CSV, Excel or JSON", icon: ArrowLeftRightIcon, show: can(viewer, "import.run") || can(viewer, "import.stage") },
    { href: "/export/report", label: "PDF report", hint: "Printable status report", icon: FileTextIcon, show: can(viewer, "export.run") },
    { href: "/company", label: "Company", hint: "Every department, progress and money", icon: Building2Icon, show: can(viewer, "company.view") },
    { href: "/overview", label: "Overview", hint: "Every unit and part", icon: ListTreeIcon, show: true },
    { href: "/pipeline", label: "Board", hint: `${waiting} waiting for the next team`, icon: KanbanIcon, show: true },
    { href: "/sheet?preset=manager", label: "Assign work", hint: `${unassigned} without an owner`, icon: UsersIcon, show: can(viewer, "items.plan") },
    { href: "/calendar", label: "Calendar", hint: "Sessions and releases", icon: CalendarDaysIcon, show: true },
    { href: "/chat", label: "Chat", hint: "Teams and direct messages", icon: MessageCircleIcon, show: true },
    { href: "/admin", label: "Admin", hint: "People, teams and data", icon: UserCogIcon, show: can(viewer, "users.manage") || can(viewer, "data.manage") },
  ].filter((a) => a.show);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Home" title={`${greeting}, ${viewer.name.split(" ")[0]}`} description="How much has been done in each stage, and the shortcuts you use most." />
      <section aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={cn("group flex flex-col gap-2 rounded-xl border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-accent/40")}
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground">
              <a.icon className="size-4.5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{a.label}</span>
              <span className="block text-xs text-muted-foreground">{a.hint}</span>
            </span>
          </Link>
        ))}
      </section>
      <StructureDashboard rows={rows} mode="grade" timezone={timezone} />
    </div>
  );
}
