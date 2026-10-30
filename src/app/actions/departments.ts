"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { setDepartmentArchived, setPosition } from "@/server/departments";
import * as extras from "@/server/work-extras";
import * as studioX from "@/server/studio-extras";
import * as work from "@/server/work";
import * as cfg from "@/server/dept-config";
import * as dash from "@/server/dashboards";
import * as studio from "@/server/studio";
import { deleteReport, reportFacts, saveReport, type ReportInput } from "@/server/owners";
import type { Position } from "@/lib/domain";
import type { ResourceType } from "@/lib/studio";

// Every action checks department access and position on the server (see departments.ts).

export async function setPositionAction(dept: string, userId: string, position: Position | "remove") {
  return wrap(async () => setPosition(await requireViewer(), dept, userId, position));
}

// --- Dev and Marketing ---

export async function saveDeptConfigAction(dept: string, config: unknown, baseVersion: number) {
  return wrap(async () => cfg.saveDeptConfig(await requireViewer(), dept, config, baseVersion));
}
export async function deptConfigVersionsAction(dept: string) {
  return wrap(async () => cfg.configVersions(await requireViewer(), dept), { revalidate: false });
}
export async function restoreDeptConfigAction(dept: string, version: number) {
  return wrap(async () => cfg.restoreDeptConfig(await requireViewer(), dept, version));
}
export async function deptConfigUsageAction(dept: string) {
  return wrap(async () => cfg.configUsage(await requireViewer(), dept), { revalidate: false });
}

export async function saveDashboardLayoutAction(dept: dash.DashDept, target: "mine" | Position, layout: unknown) {
  return wrap(async () => dash.saveDashboardLayout(await requireViewer(), dept, target, layout));
}
export async function resetDashboardLayoutAction(dept: dash.DashDept, target: "mine" | Position) {
  return wrap(async () => dash.resetDashboardLayout(await requireViewer(), dept, target));
}

export async function deptViewsAction(dept: string) {
  return wrap(async () => work.deptViews(await requireViewer(), dept), { revalidate: false });
}
export async function saveDeptViewAction(dept: string, input: { name: string; query: string; shared: boolean }) {
  return wrap(async () => work.saveDeptView(await requireViewer(), dept, input), { revalidate: false });
}
export async function deleteDeptViewAction(dept: string, id: string) {
  return wrap(async () => work.deleteDeptView(await requireViewer(), dept, id), { revalidate: false });
}

export async function saveProjectAction(dept: string, input: work.ProjectInput) {
  return wrap(async () => work.saveProject(await requireViewer(), dept, input));
}
export async function deleteProjectAction(dept: string, id: string) {
  return wrap(async () => work.deleteProject(await requireViewer(), dept, id));
}
export async function saveMilestoneAction(dept: string, input: Parameters<typeof work.saveMilestone>[2]) {
  return wrap(async () => work.saveMilestone(await requireViewer(), dept, input));
}
export async function deleteMilestoneAction(dept: string, id: string) {
  return wrap(async () => work.deleteMilestone(await requireViewer(), dept, id));
}
export async function saveTaskAction(dept: string, input: work.TaskInput) {
  return wrap(async () => work.saveTask(await requireViewer(), dept, input));
}
export async function moveTaskAction(dept: string, id: string, status: string, beforeId: string | null) {
  return wrap(async () => work.moveTask(await requireViewer(), dept, id, status, beforeId));
}
export async function bulkTasksAction(dept: string, ids: string[], patch: Parameters<typeof work.bulkTasks>[3]) {
  return wrap(async () => work.bulkTasks(await requireViewer(), dept, ids, patch));
}
export async function importTasksAction(dept: string, rows: Record<string, string>[]) {
  return wrap(async () => work.importTasks(await requireViewer(), dept, rows));
}
export async function taskCommentsAction(dept: string, taskId: string) {
  return wrap(async () => work.taskComments(await requireViewer(), dept, taskId), { revalidate: false });
}
export async function addTaskCommentAction(dept: string, taskId: string, body: string) {
  return wrap(async () => work.addTaskComment(await requireViewer(), dept, taskId, body));
}
export async function listMetricsAction(dept: string, projectId: string) {
  return wrap(async () => work.listMetrics(await requireViewer(), dept, projectId), { revalidate: false });
}
export async function addMetricAction(dept: string, input: Parameters<typeof work.addMetric>[2]) {
  return wrap(async () => work.addMetric(await requireViewer(), dept, input));
}
export async function deleteMetricAction(dept: string, id: string) {
  return wrap(async () => work.deleteMetric(await requireViewer(), dept, id));
}

// --- Studio ---

export async function getResourceAction(id: string) {
  return wrap(async () => studio.getResource(await requireViewer(), id), { revalidate: false });
}
export async function saveResourceAction(input: studio.ResourceInput) {
  return wrap(async () => studio.saveResource(await requireViewer(), input));
}
export async function resourceStatusAction(id: string, action: Parameters<typeof studio.setResourceStatus>[2], note?: string | null) {
  return wrap(async () => studio.setResourceStatus(await requireViewer(), id, action, note));
}
export async function deleteResourcesAction(ids: string[]) {
  return wrap(async () => studio.deleteResources(await requireViewer(), ids));
}
export async function setCardsAction(resourceId: string, cards: { front: string; back: string }[]) {
  return wrap(async () => studio.setCards(await requireViewer(), resourceId, cards));
}
export async function setExamQuestionsAction(resourceId: string, list: { questionId: string; points: number }[]) {
  return wrap(async () => studio.setExamQuestions(await requireViewer(), resourceId, list));
}
export async function listQuestionsAction(f: studio.QuestionFilter) {
  return wrap(async () => (await studio.listQuestions(await requireViewer(), f)).rows, { revalidate: false });
}
export async function saveQuestionAction(input: studio.QuestionInput) {
  return wrap(async () => studio.saveQuestion(await requireViewer(), input));
}
export async function deleteQuestionsAction(ids: string[]) {
  return wrap(async () => studio.deleteQuestions(await requireViewer(), ids));
}
export async function questionsStatusAction(ids: string[], status: "approved" | "draft" | "archived") {
  return wrap(async () => studio.setQuestionsStatus(await requireViewer(), ids, status));
}
export async function importQuestionsAction(rows: Record<string, string>[]) {
  return wrap(async () => studio.importQuestions(await requireViewer(), rows));
}
export async function listResourcesAction(type: ResourceType) {
  return wrap(async () => (await studio.listResources(await requireViewer(), { type })).rows, { revalidate: false });
}

// --- Department reports ---

export async function saveReportAction(input: ReportInput) {
  return wrap(async () => saveReport(await requireViewer(), input));
}
export async function deleteReportAction(id: string) {
  return wrap(async () => deleteReport(await requireViewer(), id));
}
export async function reportFactsAction(department: string, from: string, to: string) {
  return wrap(async () => reportFacts(await requireViewer(), department, from, to), { revalidate: false });
}

// Parts of a unit, for placing Studio work on the curriculum.
export async function studioLessonsAction(unitId: string) {
  return wrap(async () => {
    const { requireDept } = await import("@/server/departments");
    await requireDept(await requireViewer(), "studio");
    const { all } = await import("@/server/db");
    return all<{ id: string; number: number; title: string }>("SELECT id, number, title FROM lessons WHERE unit_id = ? ORDER BY number", unitId);
  }, { revalidate: false });
}

// --- Created departments ---

export async function createDepartmentAction(input: { key: string; title: string; template: string }) {
  return wrap(async () => cfg.createDepartment(await requireViewer(), input));
}
export async function archiveDepartmentAction(key: string, archived: boolean) {
  return wrap(async () => setDepartmentArchived(await requireViewer(), key, archived));
}

// --- Task depth: review, details, watchers, files, time ---

export async function getTaskAction(dept: string, id: string) {
  return wrap(async () => work.getTask(await requireViewer(), dept, id), { revalidate: false });
}
export async function reviewTaskAction(dept: string, id: string, decision: "approve" | "send_back", note?: string | null) {
  return wrap(async () => work.reviewTask(await requireViewer(), dept, id, decision, note));
}
export async function taskDetailsAction(dept: string, id: string) {
  return wrap(async () => extras.taskDetails(await requireViewer(), dept, id), { revalidate: false });
}
export async function setWatchingAction(dept: string, id: string, on: boolean) {
  return wrap(async () => extras.setWatching(await requireViewer(), dept, id, on), { revalidate: false });
}
export async function addTaskFileAction(dept: string, id: string, file: { name: string; mime: string; base64: string }) {
  return wrap(async () => extras.addTaskFile(await requireViewer(), dept, id, file));
}
export async function deleteTaskFileAction(dept: string, fileId: string) {
  return wrap(async () => extras.deleteTaskFile(await requireViewer(), dept, fileId));
}
export async function startTimerAction(dept: string, taskId: string) {
  return wrap(async () => extras.startTimer(await requireViewer(), dept, taskId));
}
export async function stopTimerAction() {
  return wrap(async () => extras.stopTimer(await requireViewer()));
}
export async function addTimeEntryAction(dept: string, taskId: string, input: { date: string; hours: number; note?: string | null }) {
  return wrap(async () => extras.addTimeEntry(await requireViewer(), dept, taskId, input));
}
export async function deleteTimeEntryAction(dept: string, entryId: string) {
  return wrap(async () => extras.deleteTimeEntry(await requireViewer(), dept, entryId));
}

// --- Sprints, capacity, requests ---

export async function saveSprintAction(dept: string, input: Parameters<typeof extras.saveSprint>[2]) {
  return wrap(async () => extras.saveSprint(await requireViewer(), dept, input));
}
export async function deleteSprintAction(dept: string, id: string) {
  return wrap(async () => extras.deleteSprint(await requireViewer(), dept, id));
}
export async function setCapacityAction(dept: string, userId: string, hours: number) {
  return wrap(async () => extras.setCapacity(await requireViewer(), dept, userId, hours));
}
export async function createRequestAction(dept: string, input: Parameters<typeof extras.createRequest>[2]) {
  return wrap(async () => extras.createRequest(await requireViewer(), dept, input));
}
export async function decideRequestAction(dept: string, id: string, decision: "accept" | "decline", input: { assigneeId?: string | null; note?: string | null }) {
  return wrap(async () => extras.decideRequest(await requireViewer(), dept, id, decision, input));
}

// --- Studio on the same footing ---

export async function saveStudioConfigAction(input: Parameters<typeof studioX.saveStudioConfig>[1]) {
  return wrap(async () => studioX.saveStudioConfig(await requireViewer(), input));
}
export async function setResourceChecklistAction(id: string, checklist: Parameters<typeof studioX.setResourceChecklist>[2]) {
  return wrap(async () => studioX.setResourceChecklist(await requireViewer(), id, checklist));
}
