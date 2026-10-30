"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as hr from "@/server/hr";
import type { EmergencyContact } from "@/lib/hr";

// Every action checks HR rights, self or line-manager access on the server (see server/hr.ts).

export async function saveEmployeeAction(input: hr.EmployeeInput) {
  return wrap(async () => hr.saveEmployee(await requireViewer(), input));
}
export async function updateOwnContactAction(input: { preferredName?: string | null; phone?: string | null; address?: string | null; emergencyContacts?: EmergencyContact[] }) {
  return wrap(async () => hr.updateOwnContact(await requireViewer(), input));
}
export async function syncEmployeesAction() {
  return wrap(async () => hr.syncFromUsers(await requireViewer()));
}
export async function addEmployeeDocumentAction(employeeId: string, input: { kind: string; title?: string; expiresAt?: string | null; file: { name: string; mime: string; base64: string } }) {
  return wrap(async () => hr.addDocument(await requireViewer(), employeeId, input));
}
export async function deleteEmployeeDocumentAction(docId: string) {
  return wrap(async () => hr.deleteDocument(await requireViewer(), docId));
}
export async function saveEquipmentAction(input: Parameters<typeof hr.saveEquipment>[1]) {
  return wrap(async () => hr.saveEquipment(await requireViewer(), input));
}
export async function issueEquipmentAction(id: string, input: { employeeId: string; dueBack?: string | null; note?: string | null }) {
  return wrap(async () => hr.issueEquipment(await requireViewer(), id, input));
}
export async function returnEquipmentAction(id: string, input: { condition?: string; note?: string | null }) {
  return wrap(async () => hr.returnEquipment(await requireViewer(), id, input));
}
export async function equipmentHistoryAction(id: string) {
  return wrap(async () => hr.equipmentHistory(await requireViewer(), id), { revalidate: false });
}
