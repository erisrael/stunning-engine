import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import * as P from "@/server/platform";
import { ApiUsageView, DatabaseView, DeveloperView, HealthView, StatusView } from "./platform-client";
import { cn } from "@/lib/utils";

export const metadata = { title: "Platform" };

const TABS = [
  ["database", "Database"],
  ["api", "API usage"],
  ["status", "Status and deploys"],
  ["developer", "Developer integration"],
  ["health", "System health"],
] as const;

// Admin, Platform (Phase 28): running the app.
export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string }> }) {
  const viewer = await requireViewer();
  if (!can(viewer, "users.manage")) redirect("/dashboard?denied=permission");
  const { tab = "health", days } = await searchParams;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost"}`;
  return (
    <div className="space-y-4" data-platform={tab}>
      <PageHeader title="Platform" description="The database, the app's APIs and how they are used, what is running and when it was deployed, how other systems connect, and the system's health." />
      <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="Platform sections">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/admin/platform?tab=${k}`} className={cn("rounded-full px-3 py-1 text-sm", tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")} aria-current={tab === k ? "page" : undefined}>
            {l}
          </Link>
        ))}
      </nav>
      {tab === "database" ? (
        <DatabaseView info={await P.databaseInfo(viewer)} />
      ) : tab === "api" ? (
        <ApiUsageView data={await P.apiUsage(viewer, Math.max(7, Math.min(90, Number(days) || 30)))} />
      ) : tab === "status" ? (
        <StatusView data={await P.statusInfo(viewer)} />
      ) : tab === "developer" ? (
        <DeveloperView data={await P.developerInfo(viewer, origin)} />
      ) : (
        <HealthView data={await P.systemHealth(viewer)} />
      )}
    </div>
  );
}
