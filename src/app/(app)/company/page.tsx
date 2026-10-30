import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { canSeeCompany } from "@/server/company";
import { PageHeader } from "@/components/app/primitives";
import { CompanyOverview } from "@/components/app/company-overview";

export const metadata = { title: "Company overview" };

export default async function CompanyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  if (!canSeeCompany(viewer)) redirect("/dashboard?denied=permission");
  return (
    <div className="space-y-4">
      <PageHeader help="owner" title="Company overview" description="Overall progress and money across the company, and each department's own dashboard. Switch departments below. Read only." />
      <CompanyOverview viewer={viewer} sp={await searchParams} />
    </div>
  );
}
