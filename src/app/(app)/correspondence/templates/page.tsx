import Link from "next/link";
import { redirect } from "next/navigation";
import { corrPage } from "@/server/corr/page";
import { listTemplates } from "@/server/corr/templates";
import { PageHeader } from "@/components/app/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { NewTemplateButton } from "./new-template";

export const metadata = { title: "Letter templates" };

const STATUS: Record<string, string> = { draft: "Draft", pending: "Waiting for approval", published: "Published", rejected: "Changes asked", superseded: "Superseded" };

export default async function TemplatesPage() {
  const { viewer, rights } = await corrPage();
  if (!rights.template && !rights.admin) redirect("/correspondence");
  const list = await listTemplates(viewer);
  return (
    <div className="space-y-4">
      <PageHeader title="Letter templates" description="Letterheads and layouts for official letters. A template is used only once it is approved and published; issued letters keep the version they were made with." />
      <CorrNav active="templates" rights={rights} />
      <div className="flex justify-end">
        <NewTemplateButton templates={list.map((t) => ({ id: t.id, name: t.name }))} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => (
          <Link key={t.id} href={`/correspondence/templates/${t.id}`}>
            <Card className="h-full hover:border-primary">
              <CardContent className="space-y-1 p-4 text-sm">
                <p className="font-medium">{t.name}{!t.active && <span className="ml-1 text-xs text-muted-foreground">(retired)</span>}</p>
                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                <p className="text-xs">
                  {t.currentVersion ? `Published v${t.currentVersion}` : "Not published yet"} · latest v{t.latestVersion}: {STATUS[t.latestStatus] ?? t.latestStatus}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {!list.length && <p className="col-span-full py-10 text-center text-sm text-muted-foreground">No templates yet. Letters use the company letterhead until one is published.</p>}
      </div>
    </div>
  );
}
