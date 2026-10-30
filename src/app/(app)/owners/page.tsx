import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { canSeeReports, listReports, ownerStats, reportDepartments } from "@/server/owners";
import { can } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { DEPARTMENT_LABELS, DEPARTMENTS } from "@/lib/domain";
import { customDepartments } from "@/server/departments";
import { OwnersClient } from "./owners-client";
import { canSeeCompany } from "@/server/company";
import { CompanyOverview } from "@/components/app/company-overview";

export const metadata = { title: "Owners" };

export default async function OwnersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const owner = can(viewer, "owners.view");
  if (!owner && !(await canSeeReports(viewer))) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  // Heads and leads who are not owners see only the reports.
  const tab = !owner || sp.tab === "reports" ? "reports" : "overview";
  const custom = await customDepartments({ includeArchived: true });
  const labels: Record<string, string> = { ...Object.fromEntries(DEPARTMENTS.map((d) => [d, DEPARTMENT_LABELS[d]])), ...Object.fromEntries(custom.map((c) => [c.key, c.title])) };
  const department = sp.dept && labels[sp.dept] ? sp.dept : null;
  const [stats, reports, writeFor] = await Promise.all([
    tab === "overview" && !canSeeCompany(viewer) ? ownerStats() : Promise.resolve(null),
    tab === "reports" ? listReports(viewer, { department, status: sp.status ?? null, q: sp.q ?? null }) : Promise.resolve([]),
    reportDepartments(viewer),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title={owner ? "Owners" : "Department reports"}
        description={
          owner
            ? "How the company is doing: production, products, every department's progress, and the reports their heads and leads write. Read only."
            : "Write your department's periodic report for the owners. Start from the facts the app gathers for the period, then add highlights, risks and next steps."
        }
      />
      <OwnersClient tab={tab} isOwner={owner} stats={stats} reports={reports} writeFor={writeFor} viewerId={viewer.id} filter={{ department, status: sp.status ?? null, q: sp.q ?? null }} openId={sp.open ?? null} labels={labels} overview={tab === "overview" && canSeeCompany(viewer) ? <CompanyOverview viewer={viewer} sp={sp} /> : undefined} />
    </div>
  );
}
