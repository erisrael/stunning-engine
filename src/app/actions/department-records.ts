"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { bulkDepartmentRecords, saveDataPolicy, saveDepartmentRecord } from "@/server/department-records";
import type { DataPolicy, RecordValue } from "@/lib/department-records";

export async function saveDepartmentRecordAction(scope: string, dataset: string, id: string | null, patch: Record<string, RecordValue>) {
  return wrap(async () => saveDepartmentRecord(await requireViewer(), scope, dataset, id, patch));
}
export async function bulkDepartmentRecordsAction(scope: string, dataset: string, ids: string[], action: "remove" | "edit", patch?: Record<string, RecordValue>) {
  return wrap(async () => bulkDepartmentRecords(await requireViewer(), scope, dataset, ids, action, patch));
}
export async function saveDataPolicyAction(scope: string, policy: DataPolicy) {
  return wrap(async () => saveDataPolicy(await requireViewer(), scope, policy));
}
