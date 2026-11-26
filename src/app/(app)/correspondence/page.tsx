import { corrPage } from "@/server/corr/page";
import { listDocs, STATUS_LABEL, type ListFilter } from "@/server/corr/documents";
import { listCategories } from "@/server/corr/setup";
import { PageHeader } from "@/components/app/primitives";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { RegistryClient } from "./registry-client";

export const metadata = { title: "Correspondence" };

// The registry: every official letter out and in that this person may see, with search and filters.
export default async function CorrespondencePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { viewer, rights } = await corrPage();
  const sp = await searchParams;
  const f: ListFilter = { q: sp.q, status: sp.status ? sp.status.split(",") : undefined, direction: sp.dir === "incoming" || sp.dir === "outgoing" ? sp.dir : undefined, category: sp.cat, classification: sp.cls, from: sp.from, until: sp.until, mine: sp.mine === "1", page: Number(sp.page) || 0 };
  const [list, categories] = await Promise.all([listDocs(viewer, f), listCategories()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Correspondence" description="Official company letters: written from the letterhead, numbered when issued, tracked until delivered, and kept with their full history." />
      <CorrNav active="registry" rights={rights} />
      <RegistryClient list={list} categories={categories.map((c) => ({ id: c.id, code: c.code, name: c.name }))} rights={rights} filter={f} statusLabels={STATUS_LABEL} />
    </div>
  );
}
