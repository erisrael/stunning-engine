import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireViewer } from "@/server/auth";
import { PageHeader, PageTabs } from "@/components/app/page-kit";
import { Button } from "@/components/ui/button";
import { SnapshotTabs } from "@/components/app/legacy-cms/snapshot-view";

export const metadata = { title: "Noor snapshot" };
const TABS = ["records", "entities", "schemas", "quality", "storage", "logs", "compare"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { records: "Records", entities: "Entities", schemas: "Schemas", quality: "Data quality", storage: "Storage", logs: "Logs", compare: "Compare" };

// A Noor snapshot as a full page (Update 1.2, System improvements 2): its records, entities, schemas, data quality,
// storage and logs, and a comparison with another snapshot or the data stored now.
export default async function SnapshotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; with?: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;
  const X = await import("@/server/cms-archives");
  const detail = await X.snapshotDetail(viewer, id).catch(() => null);
  if (!detail) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "records";
  const others = (await X.listSnapshots(viewer)).filter((s) => s.id !== id).map((s) => ({ id: s.id, name: s.name }));
  const withId = sp.with && (sp.with === "current" || others.some((o) => o.id === sp.with)) ? sp.with : "current";
  const comparison = tab === "compare" ? await X.compareSnapshot(viewer, id, withId) : null;
  const q = (t: string) => `/legacy-cms/snapshots/${id}?tab=${t}${t === "compare" ? `&with=${withId}` : ""}`;
  return (
    <div className="space-y-4" data-snapshot-page={detail.name}>
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/legacy-cms?view=storage">
          <ArrowLeftIcon /> Storage & snapshots
        </Link>
      </Button>
      <PageHeader
        title={detail.name}
        description={`${detail.scopeLabel} · ${detail.records.toLocaleString()} records · taken ${new Date(detail.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" })}${detail.createdBy ? ` by ${detail.createdBy}` : ""}${detail.description ? ` · ${detail.description}` : ""}`}
      />
      <PageTabs tabs={TABS.map((t) => ({ key: t, label: LABELS[t], count: t === "quality" ? detail.quality.reduce((a, x) => a + x.issues, 0) || null : t === "entities" ? detail.entities.length : null }))} active={tab} href={q} label="Snapshot sections" />
      <SnapshotTabs tab={tab} detail={detail} comparison={comparison} others={others} withId={withId} />
    </div>
  );
}
