import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireCapability } from "@/server/auth";
import { taxonomy } from "@/server/queries";
import { FILL_FIELDS, healthReport, listImportBatches, listRecords, RECORD_ENTITIES, type RecordEntity } from "@/server/data-admin";
import { listTrash, TRASH_RETENTION_DAYS } from "@/server/trash";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/primitives";
import { DataManager } from "./data-manager";

export const metadata = { title: "Data manager" };

const TABS = ["records", "health", "batches", "trash"] as const;
type Tab = (typeof TABS)[number];

export default async function DataManagerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireCapability("data.manage");
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "records";
  const entity: RecordEntity = (RECORD_ENTITIES as readonly string[]).includes(sp.entity ?? "") ? (sp.entity as RecordEntity) : "items";
  const filter = { entity, gradeId: sp.g || null, subjectId: sp.s || null, unitId: sp.u || null, q: sp.q || null, unplaced: sp.unplaced === "1" };

  const tax = await taxonomy();
  const [records, health, batches, trash] = await Promise.all([
    tab === "records" ? listRecords(filter) : null,
    tab === "health" ? healthReport() : null,
    tab === "batches" ? listImportBatches() : null,
    tab === "trash" ? listTrash() : null,
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        help="admin" title="Data manager"
        description="Every grade, subject, unit, part and item in one place. Rename, move, merge and fill in bulk, repair broken imports, and restore anything deleted. Every change is kept in the audit log."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin?tab=data">
              <ArrowLeftIcon /> Admin
            </Link>
          </Button>
        }
      />
      <DataManager
        tab={tab}
        filter={filter}
        records={records}
        health={health}
        batches={batches}
        trash={trash}
        retentionDays={TRASH_RETENTION_DAYS}
        fillFields={FILL_FIELDS}
        taxonomy={{
          grades: tax.grades.map((g) => ({ id: g.id, code: g.code, name: g.name })),
          subjects: tax.subjects.map((s) => ({ id: s.id, code: s.code, name: s.name })),
          units: tax.units.map((u) => ({ id: u.id, gradeId: u.grade_id, subjectId: u.subject_id, number: u.number, title: u.title })),
          offered: tax.gradeSubjects.map((x) => `${x.grade_id}|${x.subject_id}`),
        }}
      />
    </div>
  );
}
