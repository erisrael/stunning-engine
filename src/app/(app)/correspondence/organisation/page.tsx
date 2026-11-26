import { redirect } from "next/navigation";
import { corrPage } from "@/server/corr/page";
import { ACTION_LABELS, ACTIONS, DEFAULT_POSITIONS, governanceSummary, LEVEL_LABELS, LEVELS, UNIT_KINDS } from "@/server/corr/org";
import { listCategories } from "@/server/corr/setup";
import { userDirectory } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { OrgClient } from "./org-client";

export const metadata = { title: "Organisation and authority" };

export default async function OrganisationPage() {
  const { rights } = await corrPage();
  if (!rights.admin && !rights.audit) redirect("/correspondence");
  const [g, cats, people] = await Promise.all([governanceSummary(), listCategories(), userDirectory()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Organisation and authority" description="The company's structure, who holds each position (and who acts in it), what each may approve or sign, and the delegations in force." />
      <CorrNav active="organisation" rights={rights} />
      <OrgClient
        g={g}
        categories={cats.map((c) => ({ id: c.id, name: c.name }))}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        canEdit={rights.admin}
        actions={ACTIONS.map((a) => ({ key: a, label: ACTION_LABELS[a] }))}
        levels={LEVELS.map((l) => ({ key: l, label: LEVEL_LABELS[l] }))}
        unitKinds={[...UNIT_KINDS]}
        defaults={DEFAULT_POSITIONS}
      />
    </div>
  );
}
