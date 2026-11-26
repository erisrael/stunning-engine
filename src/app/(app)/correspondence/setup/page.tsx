import { corrPage } from "@/server/corr/page";
import { getEntity, listCategories, listEntities, PATTERN_TOKENS } from "@/server/corr/setup";
import { numberRegister } from "@/server/corr/documents";
import { previewRef } from "@/server/corr/numbering";
import { auditTrail } from "@/server/corr/core";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/primitives";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { SetupClient } from "./setup-client";

export const metadata = { title: "Correspondence setup" };

export default async function SetupPage() {
  const { viewer, rights } = await corrPage();
  if (!rights.admin && !rights.audit) redirect("/correspondence");
  const [entities, categories, register, trail] = await Promise.all([listEntities(), listCategories({ includeInactive: true }), numberRegister(viewer).catch(() => []), rights.audit || rights.admin ? auditTrail(null) : Promise.resolve(null)]);
  const [notifyCfg, attach, ocr, key] = await Promise.all([
    (await import("@/server/corr/notify")).corrNotifyConfig(),
    (await import("@/server/corr/delivery")).attachmentPolicy(),
    (await import("@/server/corr/ocr")).ocrStatus(),
    (await import("@/server/corr/signing")).publicKey(),
  ]);
  const services = { ocr, fax: !!(await import("@/server/corr/delivery")).faxProvider(), clamav: !!process.env.CLAMAV_HOST, key: { fingerprint: key.fingerprint, algorithm: key.algorithm }, pades: !!process.env.CORR_PADES_SERVICE };
  const next = await Promise.all(
    categories.map(async (c) => {
      const e = (await getEntity(c.entityId)) ?? entities[0]!;
      const parent = e.parentId ? await getEntity(e.parentId) : null;
      return [c.id, await previewRef(c, e, parent, "DEPT")] as const;
    }),
  );
  return (
    <div className="space-y-4">
      <PageHeader title={rights.admin ? "Setup and numbering" : "Number register"} description="Who sends letters, the kinds of letters, and how their official numbers are made. Numbers are given only when a letter is issued, never twice, and never reused." />
      <CorrNav active="setup" rights={rights} />
      <SetupClient entities={entities} categories={categories} next={Object.fromEntries(next)} tokens={[...PATTERN_TOKENS]} register={register} trail={trail} canEdit={rights.admin} notifyCfg={notifyCfg} attach={{ allowZip: !!attach.allowZip, requireScan: !!attach.requireScan }} services={services} />
    </div>
  );
}
