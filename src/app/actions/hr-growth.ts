"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as hire from "@/server/hr-hiring";
import * as grow from "@/server/hr-growth";
import type { Role } from "@/lib/domain";
import type { ChecklistKind, ChecklistTemplateItem } from "@/lib/hr-growth";

// Every action checks HR, the person, their line manager or interviewers on the server (hr-hiring.ts, hr-growth.ts).

type File = { name: string; mime: string; base64: string };

export async function saveOpeningAction(input: Parameters<typeof hire.saveOpening>[1]) {
  return wrap(async () => hire.saveOpening(await requireViewer(), input));
}
export async function applicantsAction(openingId: string) {
  return wrap(async () => hire.listApplicants(await requireViewer(), openingId), { revalidate: false });
}
export async function saveApplicantAction(input: { id?: string | null; openingId: string; fullName: string; email?: string | null; phone?: string | null; source?: string | null; notes?: string | null; file?: File | null }) {
  return wrap(async () => hire.saveApplicant(await requireViewer(), input));
}
export async function addApplicantFileAction(applicantId: string, file: File) {
  return wrap(async () => hire.addApplicantFile(await requireViewer(), applicantId, file));
}
export async function moveApplicantAction(id: string, input: { stage: string; reason?: string | null; offerStartDate?: string | null; offerNote?: string | null }) {
  return wrap(async () => hire.moveApplicant(await requireViewer(), id, input));
}
export async function scheduleInterviewAction(applicantId: string, input: { scheduledAt: string; durationMin?: number; location?: string | null; interviewerIds: string[] }) {
  return wrap(async () => hire.scheduleInterview(await requireViewer(), applicantId, input));
}
export async function cancelInterviewAction(id: string) {
  return wrap(async () => hire.cancelInterview(await requireViewer(), id));
}
export async function submitScorecardAction(interviewId: string, input: { rating: number; recommendation: string; notes?: string | null }) {
  return wrap(async () => hire.submitScorecard(await requireViewer(), interviewId, input));
}
export async function hireApplicantAction(id: string, input: { startDate: string; jobTitle?: string | null; probationEnd?: string | null; createAccount?: boolean; roles?: Role[] }) {
  return wrap(async () => hire.hireApplicant(await requireViewer(), id, input));
}
export async function saveChecklistTemplateAction(kind: ChecklistKind, items: ChecklistTemplateItem[]) {
  return wrap(async () => hire.saveChecklistTemplate(await requireViewer(), kind, items));
}
export async function startChecklistAction(employeeId: string, kind: ChecklistKind) {
  return wrap(async () => hire.startChecklist(await requireViewer(), employeeId, kind));
}
export async function startOffboardingAction(employeeId: string, input: { lastDay: string; reason?: string | null }) {
  return wrap(async () => hire.startOffboarding(await requireViewer(), employeeId, input));
}
export async function tickChecklistAction(checklistId: string, key: string, done: boolean, note?: string | null) {
  return wrap(async () => hire.tickChecklist(await requireViewer(), checklistId, key, done, note));
}
export async function deactivateAccountAction(employeeId: string) {
  return wrap(async () => hire.deactivateAccount(await requireViewer(), employeeId));
}

export async function saveGoalAction(input: Parameters<typeof grow.saveGoal>[1]) {
  return wrap(async () => grow.saveGoal(await requireViewer(), input));
}
export async function addOneOnOneAction(input: { employeeId: string; heldOn: string; notes?: string | null; actions?: string | null }) {
  return wrap(async () => grow.addOneOnOne(await requireViewer(), input));
}
export async function startCycleAction(input: Parameters<typeof grow.startCycle>[1]) {
  return wrap(async () => grow.startCycle(await requireViewer(), input));
}
export async function submitReviewAction(reviewId: string, input: { part: "self" | "lead"; rating: number; notes: string }) {
  return wrap(async () => grow.submitReview(await requireViewer(), reviewId, input));
}
export async function saveCourseAction(input: Parameters<typeof grow.saveCourse>[1]) {
  return wrap(async () => grow.saveCourse(await requireViewer(), input));
}
export async function assignCourseAction(courseId: string, input: { employeeIds: string[]; dueDate?: string | null }) {
  return wrap(async () => grow.assignCourse(await requireViewer(), courseId, input));
}
export async function completeTrainingAction(id: string, input: { completedOn: string; note?: string | null }) {
  return wrap(async () => grow.completeTraining(await requireViewer(), id, input));
}
export async function courseTrainingsAction(courseId: string) {
  return wrap(async () => grow.courseTrainings(await requireViewer(), courseId), { revalidate: false });
}
export async function openCaseAction(input: { employeeId: string; kind: string; title: string; note?: string | null }) {
  return wrap(async () => grow.openCase(await requireViewer(), input));
}
export async function updateCaseAction(id: string, input: { status?: string; note?: string | null; outcome?: string | null }) {
  return wrap(async () => grow.updateCase(await requireViewer(), id, input));
}
