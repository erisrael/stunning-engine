import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { openLink } from "@/server/corr/delivery";
import { clientIpFrom } from "@/server/client-ip";
import { appOrigin } from "@/server/password-reset";
import { qrDataUrl } from "@/server/corr/qr";
import { forOutput, letterCss, letterHtml, type LetterModel } from "@/components/app/corr/letter-render";
import { signPolicy } from "@/server/corr/signing";
import { cleanLayout } from "@/lib/corr-template";
import { PrintLetterButton } from "./print-button";

export const metadata = { title: "Letter", robots: { index: false } };

// The recipient's secure link: the issued letter exactly as issued, read only, with its attachments' names.
export default async function SecureLetterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const l = await openLink(token, { ip: clientIpFrom(h) });
  if (!l) notFound();
  const s = l.snapshot as Record<string, never>;
  const origin = await appOrigin();
  const model: LetterModel = {
    documentId: l.documentId,
    ref: l.ref,
    status: l.status,
    classification: s.classification,
    subject: s.subject,
    category: (s.category as { name?: string } | undefined)?.name ?? null,
    entity: s.entity,
    letterhead: s.letterhead,
    recipients: ((s.recipients as LetterModel["recipients"] | undefined) ?? []).filter((r) => r.kind !== "bcc"),
    data: s.data,
    externalRef: s.externalRef,
    layout: s.layout ? cleanLayout(s.layout) : null,
    signatures: s.signatures,
    attachments: (s.attachments as { n: number; name: string }[] | undefined) ?? [],
    qr: l.verifyCode ? await qrDataUrl(origin, l.verifyCode) : null,
    signLook: await signPolicy(),
  };
  return (
    <div className="min-h-dvh bg-slate-100 py-6">
      <div className="mx-auto mb-3 flex max-w-[230mm] flex-wrap items-center justify-between gap-2 px-4 text-sm text-slate-600 print:hidden">
        <span>
          {l.status === "void" ? <b className="text-red-700">This letter has been voided.</b> : "Official letter"} · <a className="underline" href={`/verify/${l.verifyCode}`}>Check it is genuine</a>
        </span>
        <PrintLetterButton />
      </div>
      <div className="mx-auto w-fit max-w-full overflow-x-auto bg-white shadow print:shadow-none">
        <style>{letterCss(model)}</style>
        {/* All text is escaped in letterHtml. */}
        <div dangerouslySetInnerHTML={{ __html: letterHtml(forOutput(model, "link")) }} />
      </div>
    </div>
  );
}
