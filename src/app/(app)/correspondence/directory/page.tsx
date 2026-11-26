import { corrPage } from "@/server/corr/page";
import { searchOrgs } from "@/server/corr/directory";
import { PageHeader } from "@/components/app/primitives";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { DirectoryClient } from "./directory-client";

export const metadata = { title: "Company directory" };

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { viewer, rights } = await corrPage();
  const q = (await searchParams).q ?? "";
  return (
    <div className="space-y-4">
      <PageHeader title="Company directory" description="The organisations and people letters go to. A letter keeps the details it was sent with, so editing a record here never changes a sent letter." />
      <CorrNav active="directory" rights={rights} />
      <DirectoryClient initial={await searchOrgs(viewer, q, 100)} q={q} canEdit={rights.directory} />
    </div>
  );
}
