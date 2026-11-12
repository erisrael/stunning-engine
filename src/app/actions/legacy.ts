"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as lg from "@/server/legacy";
import { renameUnit } from "@/server/curriculum-fix";
import { WorkflowError } from "@/server/workflow";

// Every action checks the person's rights (see legacy.ts).
export async function addSubjectAction(gradeId: string, name: string) {
  return wrap(async () => lg.addSubject(await requireViewer(), gradeId, name));
}
export async function addUnitAction(gradeId: string, subjectId: string, title: string) {
  return wrap(async () => lg.addUnit(await requireViewer(), gradeId, subjectId, title));
}
export async function addPartAction(unitId: string, number: number, opts?: lg.AddPartOptions) {
  return wrap(async () => lg.addPart(await requireViewer(), unitId, Number(number), opts));
}
// Names and numbers already saved are read-only for media contributors (legacy.ts, canManageLegacy).
export async function editPartAction(id: string, input: { number: number; kind?: "standard" | "review" }) {
  return wrap(async () => lg.editPart(await requireViewer(), id, input));
}
export async function editUnitAction(id: string, title: string) {
  return wrap(async () => {
    const u = await requireViewer();
    if (!lg.canManageLegacy(u)) throw new WorkflowError("FORBIDDEN", "Only the Recording lead or a planner renames units.");
    return renameUnit(u, id, title);
  });
}
// The form always says Draft or Submitted for Review, so its rules always apply.
const formStatus = (input: lg.VideoInput): lg.VideoInput => ({ ...input, status: input.status === "submitted" ? "submitted" : "draft" });
export async function addVideoAction(lessonId: string, input: lg.VideoInput) {
  return wrap(async () => lg.addVideo(await requireViewer(), lessonId, formStatus(input)));
}
export async function editVideoAction(id: string, input: lg.VideoInput) {
  return wrap(async () => lg.editVideo(await requireViewer(), id, formStatus(input)));
}
export async function migratePartNamesAction(commit: boolean) {
  return wrap(async () => lg.migratePartNames(await requireViewer(), commit), { revalidate: commit });
}
export async function deleteVideoAction(id: string) {
  return wrap(async () => lg.deleteVideo(await requireViewer(), id));
}
export async function markRecordedAction(lessonId: string, checks?: Record<string, boolean>) {
  return wrap(async () => lg.markDone(await requireViewer(), lessonId, checks));
}
export async function reopenPartAction(lessonId: string) {
  return wrap(async () => lg.reopenPart(await requireViewer(), lessonId));
}
export async function saveDetailsAction(lessonId: string, input: Parameters<typeof lg.saveDetails>[2]) {
  return wrap(async () => lg.saveDetails(await requireViewer(), lessonId, input));
}
export async function handOffAction(itemIds: string[], note?: string | null) {
  return wrap(async () => lg.handOff(await requireViewer(), itemIds, note));
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
