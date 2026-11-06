import { requireViewer } from "@/server/auth";
import { getLegacyCmsConfig, listLegacyCmsRecords, getLegacyCmsStats, type LegacyCmsCategory } from "@/server/legacy-cms";
import { PageHeader } from "@/components/app/primitives";
import { LegacyCmsClient } from "./legacy-cms-client";

export const metadata = { title: "Noor Ethiopia CMS (Legacy)" };

export default async function LegacyCmsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const initialCategory: LegacyCmsCategory = (sp.category as LegacyCmsCategory) || "students";

  const config = await getLegacyCmsConfig();
  const initialRecords = await listLegacyCmsRecords(initialCategory, { limit: 100 });
  const stats = await getLegacyCmsStats();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Legacy CMS Integration"
        description="Synchronized database mirror of cms.noorethiopia.com. Search students, parents, invoices, and subscriptions."
      />
      <LegacyCmsClient
        config={config}
        initialCategory={initialCategory}
        initialRecords={initialRecords}
        stats={stats}
      />
    </div>
  );
}

