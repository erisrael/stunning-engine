"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as leave from "@/server/leave";
import type { LeaveType } from "@/lib/leave";

// Every action checks the person, their line manager or HR on the server (see server/leave.ts).

export async function requestLeaveAction(input: leave.LeaveInput) {
  return wrap(async () => leave.requestLeave(await requireViewer(), input));
}
export async function decideLeaveAction(id: string, input: { decision: "approve" | "reject"; note?: string | null }) {
  return wrap(async () => leave.decideLeave(await requireViewer(), id, input));
}
export async function cancelLeaveAction(id: string) {
  return wrap(async () => leave.cancelLeave(await requireViewer(), id));
}
export async function leaveDaysAction(start: string, end: string, halfDay: boolean) {
  return wrap(async () => (await requireViewer(), leave.leaveDays(start, end, halfDay)), { revalidate: false });
}
export async function leaveBalancesAction(employeeId: string, year?: number) {
  return wrap(async () => leave.balancesFor(await requireViewer(), employeeId, year), { revalidate: false });
}
export async function adjustLeaveAction(input: { employeeId: string; typeKey: string; year: number; days: number; note: string }) {
  return wrap(async () => leave.adjustBalance(await requireViewer(), input));
}
export async function saveLeaveTypeAction(input: Partial<LeaveType> & { label: string; key?: string }) {
  return wrap(async () => leave.saveLeaveType(await requireViewer(), input));
}
export async function addHolidayAction(date: string, name: string) {
  return wrap(async () => leave.addHolidays(await requireViewer(), [{ date, name }]));
}
export async function addEthiopianHolidaysAction(year: number) {
  return wrap(async () => leave.addEthiopianHolidays(await requireViewer(), year));
}
export async function removeHolidayAction(date: string) {
  return wrap(async () => leave.removeHoliday(await requireViewer(), date));
}
