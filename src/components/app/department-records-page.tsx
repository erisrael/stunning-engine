import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { departmentRecords } from "@/server/department-records";
import { WorkflowError } from "@/server/workflow";
import { PageHeader } from "./primitives";
import { DepartmentRecordsClient } from "./department-records-client";
import type { RecordScope } from "@/lib/department-records";

export async function DepartmentRecordsPage({ scope, searchParams }: { scope: RecordScope; searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  try {
    const data = await departmentRecords(viewer, scope, sp.dataset, sp.year ? Number(sp.year) : undefined);
    return <div className="space-y-4"><PageHeader title={`${scope === "hr" ? "HR" : scope[0].toUpperCase() + scope.slice(1)}: Data Manager`} description="Browse records, edit supported fields, and manage selected rows with department permissions." /><DepartmentRecordsClient data={data} /></div>;
  } catch (error) {
    if (!(error instanceof WorkflowError)) throw error;
    return <div className="space-y-3"><PageHeader title="Data Manager" description={error.message} /><Link className="underline" href={`/${scope}`}>Back to department</Link></div>;
  }
}
