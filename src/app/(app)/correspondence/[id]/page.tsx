import { notFound } from "next/navigation";
import { corrPage } from "@/server/corr/page";
import { getDoc, STATUS_LABEL } from "@/server/corr/documents";
import { getEntity, letterheadFor, listCategories } from "@/server/corr/setup";
import { listTemplates } from "@/server/corr/templates";
import { myQueue } from "@/server/corr/workflow";
import { listStamps, signPolicy } from "@/server/corr/signing";
import { designFor } from "@/server/tools";
import { faxProvider } from "@/server/corr/delivery";
import { qrDataUrl } from "@/server/corr/qr";
import { appOrigin } from "@/server/password-reset";
import { get } from "@/server/db";
import { PageHeader } from "@/components/app/primitives";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { LetterClient } from "./letter-client";

export const metadata = { title: "Letter" };

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { viewer, rights } = await corrPage();
  const { id } = await params;
  const doc = await getDoc(viewer, id).catch(() => null);
  if (!doc) notFound();
  const origin = await appOrigin();
  const [categories, entity, lh, reply, templates, queue, stamps, qr] = await Promise.all([
    listCategories(),
    getEntity(doc.entityId),
    letterheadFor(doc.entityId),
    doc.inReplyTo ? get<{ ref_number: string | null; subject: string }>("SELECT ref_number, subject FROM corr_documents WHERE id = ?", doc.inReplyTo) : Promise.resolve(undefined),
    listTemplates(viewer, { publishedOnly: true }),
    myQueue(viewer).then((q) => q.filter((x) => x.documentId === id)),
    listStamps().then((s) => s.filter((x) => x.active && (!x.entityId || x.entityId === doc.entityId)).map((x) => ({ id: x.id, name: x.name, image: x.image }))),
    doc.verifyCode ? qrDataUrl(origin, doc.verifyCode) : Promise.resolve(null),
  ]);
  const title = doc.ref ?? (doc.direction === "incoming" ? "Incoming letter" : "Draft letter");
  return (
    <div className="space-y-4">
      <PageHeader title={title} description={doc.subject || "No subject yet"} eyebrow={`${STATUS_LABEL[doc.status]} · ${doc.categoryName ?? "Letter"}`} />
      <CorrNav active="registry" rights={rights} />
      <LetterClient
        doc={doc as never}
        categories={categories.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        entity={entity ? { legalName: entity.legalName, address: entity.address, phone: entity.phone, email: entity.email, website: entity.website, registrationNo: entity.registrationNo, taxId: entity.taxId } : { legalName: lh.company }}
        letterhead={lh}
        replyRef={reply?.ref_number ?? null}
        statusLabels={STATUS_LABEL}
        canDirectory={rights.directory}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        myTurn={queue.map((q) => ({ stepId: q.stepId, stage: q.stage, action: q.action, capacity: q.capacity }))}
        stamps={stamps}
        fax={!!faxProvider()}
        qr={qr}
        origin={origin}
        viewer={{ name: viewer.name, title: viewer.title }}
        design={await designFor(viewer, "correspondence")}
        signLook={await signPolicy()}
      />
    </div>
  );
}
