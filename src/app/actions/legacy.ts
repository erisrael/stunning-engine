"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as lg from "@/server/legacy";
import { renamePart, renameUnit } from "@/server/curriculum-fix";
import { WorkflowError } from "@/server/workflow";

// Every action checks the person's rights (see legacy.ts).
export async function addSubjectAction(gradeId: string, name: string) {
  return wrap(async () => lg.addSubject(await requireViewer(), gradeId, name));
}
export async function addUnitAction(gradeId: string, subjectId: string, title: string) {
  return wrap(async () => lg.addUnit(await requireViewer(), gradeId, subjectId, title));
}
export async function addPartAction(unitId: string, title: string) {
  return wrap(async () => lg.addPart(await requireViewer(), unitId, title));
}
export async function editPartAction(id: string, title: string) {
  return wrap(async () => renamePart(await requireViewer(), id, title));
}
export async function editUnitAction(id: string, title: string) {
  return wrap(async () => renameUnit(await requireViewer(), id, title));
}
export async function addVideoAction(lessonId: string, input: { cameraCode: string; title?: string | null; description?: string | null }) {
  return wrap(async () => lg.addVideo(await requireViewer(), lessonId, input));
}
export async function editVideoAction(id: string, input: { cameraCode: string; title?: string | null; description?: string | null }) {
  return wrap(async () => lg.editVideo(await requireViewer(), id, input));
}
export async function deleteVideoAction(id: string) {
  return wrap(async () => lg.deleteVideo(await requireViewer(), id));
}
export async function markRecordedAction(lessonId: string) {
  return wrap(async () => lg.markRecorded(await requireViewer(), lessonId));
}
export async function deletePartAction(id: string) {
  return wrap(async () => lg.deletePart(await requireViewer(), id));
}
export async function deleteUnitAction(id: string) {
  return wrap(async () => lg.deleteUnit(await requireViewer(), id));
}
export async function deleteSubjectAction(gradeId: string, subjectId: string) {
  return wrap(async () => lg.deleteSubject(await requireViewer(), gradeId, subjectId));
}
export async function importLegacyAction(form: FormData, dryRun: boolean) {
  return wrap(
    async () => {
      const f = form.get("file");
      if (!(f instanceof File) || !f.size) throw new WorkflowError("VALIDATION", "Choose the catalog's JSON backup.");
      return lg.importLegacy(await requireViewer(), await f.text(), f.name, dryRun);
    },
    { revalidate: !dryRun },
  );
}
export async function saveLegacyConfigAction(input: Partial<lg.LegacyConfig>) {
  return wrap(async () => lg.saveLegacyConfig(await requireViewer(), input));
}
