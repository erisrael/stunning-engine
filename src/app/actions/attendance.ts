"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as att from "@/server/attendance";
import type { AttendanceConfig, MarkStatus } from "@/lib/attendance";

// Every action checks the person, their line manager or team lead, or HR on the server (see server/attendance.ts).

export async function punchAction(input: { lat?: number | null; lng?: number | null; accuracy?: number | null }) {
  return wrap(async () => att.punchSelf(await requireViewer(), input));
}
export async function setOwnPinAction(pin: string) {
  return wrap(async () => att.setOwnPin(await requireViewer(), pin));
}
export async function markDayAction(input: { employeeId: string; day: string; status: MarkStatus; inTime?: string | null; outTime?: string | null; note?: string | null }) {
  return wrap(async () => att.markDay(await requireViewer(), input));
}
export async function clearMarkAction(employeeId: string, day: string) {
  return wrap(async () => att.clearMark(await requireViewer(), employeeId, day));
}
export async function reviewMarksAction(keys: { employeeId: string; day: string }[]) {
  return wrap(async () => att.reviewMarks(await requireViewer(), keys));
}
export async function requestCorrectionAction(input: { day: string; inTime?: string | null; outTime?: string | null; reason: string }) {
  return wrap(async () => att.requestCorrection(await requireViewer(), input));
}
export async function decideCorrectionAction(id: string, input: { decision: "approve" | "reject"; note?: string | null }) {
  return wrap(async () => att.decideCorrection(await requireViewer(), id, input));
}
export async function cancelCorrectionAction(id: string) {
  return wrap(async () => att.cancelCorrection(await requireViewer(), id));
}
export async function saveAttendanceConfigAction(input: Partial<AttendanceConfig>) {
  return wrap(async () => att.saveAttendanceConfig(await requireViewer(), input));
}
export async function assignShiftAction(employeeIds: string[], shiftKey: string) {
  return wrap(async () => att.assignShift(await requireViewer(), employeeIds, shiftKey));
}
export async function resetPinAction(employeeId: string) {
  return wrap(async () => att.resetPin(await requireViewer(), employeeId));
}
export async function newBadgesAction(employeeIds: string[]) {
  return wrap(async () => att.newBadges(await requireViewer(), employeeIds));
}
export async function createKioskAction(name: string) {
  return wrap(async () => att.createKiosk(await requireViewer(), name));
}
export async function pairKioskAgainAction(id: string) {
  return wrap(async () => att.pairAgain(await requireViewer(), id));
}
export async function setKioskActiveAction(id: string, active: boolean) {
  return wrap(async () => att.setKioskActive(await requireViewer(), id, active));
}
export async function assignRotaAction(employeeIds: string[], keys: string[], startDate: string) {
  return wrap(async () => att.assignRota(await requireViewer(), employeeIds, keys, startDate));
}

// Face check-in (docs/FACE-CHECKIN.md): HR enrols with written consent; the person or HR deletes.
export async function enrollFaceAction(employeeId: string, input: { codes: number[][]; consent: boolean; consentNote?: string | null }) {
  return wrap(async () => (await import("@/server/attendance-face")).enrollFace(await requireViewer(), employeeId, input));
}
export async function deleteFaceAction(employeeId: string, reason: "withdrawn" | "hr") {
  return wrap(async () => (await import("@/server/attendance-face")).deleteFace(await requireViewer(), employeeId, reason));
}
