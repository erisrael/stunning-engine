import { notFound, redirect } from "next/navigation";
import { corrPage } from "@/server/corr/page";
import { getTemplate } from "@/server/corr/templates";
import { getEntity } from "@/server/corr/setup";
import { toolsConfig } from "@/server/tools";
import { PageHeader } from "@/components/app/primitives";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { DesignerClient } from "./designer-client";

export const metadata = { title: "Template designer" };

export default async function TemplateDesignerPage({ params }: { params: Promise<{ id: string }> }) {
  const { viewer, rights } = await corrPage();
  if (!rights.template && !rights.admin && !rights.audit) redirect("/correspondence");
  const t = await getTemplate(viewer, (await params).id).catch(() => null);
  if (!t) notFound();
  const [lh, entity] = await Promise.all([toolsConfig().then((c) => c.letterhead), getEntity(t.entityId)]);
  return (
    <div className="space-y-4">
      <PageHeader title={t.name} description={t.description ?? "Template designer"} eyebrow={t.currentVersion ? `Published version ${t.currentVersion}` : "Not published"} />
      <CorrNav active="templates" rights={rights} />
      <DesignerClient t={t} letterhead={lh} entity={entity ? { legalName: entity.legalName, address: entity.address, phone: entity.phone, email: entity.email, website: entity.website, registrationNo: entity.registrationNo, taxId: entity.taxId } : { legalName: lh.company }} />
    </div>
  );
}
