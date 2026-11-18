import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireViewer } from "@/server/auth";
import { WorkflowError } from "@/server/workflow";
import { PageHeader } from "@/components/app/page-kit";
import { Button } from "@/components/ui/button";
import { NoorAdminList, NoorFormView, NoorOpenLink } from "@/components/app/legacy-cms/noor-admin";

export const metadata = { title: "Noor admin" };

// One of Noor's admin pages (Update 1.2, System improvements 4): a list read live from Noor, or a Noor form page.
export default async function NoorAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const viewer = await requireViewer();
  const { slug } = await params;
  if (!/^[a-z0-9_-]{1,80}$/i.test(slug)) notFound();
  const X = await import("@/server/cms-admin");
  const { getLegacyCmsConfigForUser } = await import("@/server/legacy-cms");
  const catalog = await X.noorAdminCatalog(viewer).catch(() => null);
  const entry = catalog?.groups.flatMap((g) => g.pages).find((p) => p.slug === slug);
  if (!catalog || !entry) notFound();
  const base = (await getLegacyCmsConfigForUser(viewer)).baseUrl.replace(/\/+$/, "");

  let body: React.ReactNode;
  try {
    const list = await X.noorAdminList(viewer, slug);
    if (list.kind === "list") body = <NoorAdminList slug={slug} initial={list} />;
    else {
      const f = await X.noorAdminForm(viewer, slug, { mode: "page" });
      body = (
        <div className="max-w-2xl rounded-xl border bg-card p-4">
          <NoorFormView slug={slug} target={{ mode: "page" }} form={f.form} canSubmit={f.canSubmit} />
        </div>
      );
    }
  } catch (e) {
    if (!(e instanceof WorkflowError)) throw e;
    body = (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm" data-noor-error>
        <p className="font-medium">Noor could not open {entry.label}.</p>
        <p className="text-muted-foreground">{e.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-noor-admin-page={slug}>
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/legacy-cms?view=admin">
          <ArrowLeftIcon /> Noor admin
        </Link>
      </Button>
      <PageHeader title={entry.label} description={`${entry.about} Read from Noor as it is now; changes go straight to Noor.`} actions={base ? <NoorOpenLink href={`${base}${entry.path}`} /> : undefined} />
      {body}
    </div>
  );
}
