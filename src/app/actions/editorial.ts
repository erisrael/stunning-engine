"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import {
  bulkAssign,
  cancelHandover,
  canManageTemplates,
  createHandover,
  decideHandover,
  deleteTemplates,
  duplicateTemplate,
  importTemplates,
  listTemplates,
  saveTemplate,
  setTemplatesActive,
  setWorkChecklist,
  standardLines,
  updateHandoverNote,
  verifyChecklistItem,
  canAssign,
  handoverCandidates,
  type AssignmentInput,
  type TemplateFilter,
  type TemplateInput,
} from "@/server/editorial";
import { currentAttempt, WorkflowError } from "@/server/workflow";
import { STAGES, type Stage } from "@/lib/domain";
import { userDirectory } from "@/server/users";

// Every action checks the person's rights for the stage involved (see editorial.ts).

export async function saveTemplateAction(input: TemplateInput) {
  return wrap(async () => saveTemplate(await requireViewer(), input));
}

export async function deleteTemplatesAction(ids: string[]) {
  return wrap(async () => deleteTemplates(await requireViewer(), ids));
}

export async function duplicateTemplateAction(id: string) {
  return wrap(async () => duplicateTemplate(await requireViewer(), id));
}

export async function setTemplatesActiveAction(ids: string[], active: boolean) {
  return wrap(async () => setTemplatesActive(await requireViewer(), ids, active));
}

export async function importTemplatesAction(json: string) {
  return wrap(async () => {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      throw new WorkflowError("VALIDATION", "The file is not valid JSON.");
    }
    return importTemplates(await requireViewer(), data);
  });
}

export async function exportTemplatesAction(filter: TemplateFilter) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const list = (await listTemplates(filter)).filter((t) => canManageTemplates(viewer, t.stage));
    return { format: "myseed-checklists", version: 1, exportedAt: new Date().toISOString(), templates: list.map((t) => ({ stage: t.stage, name: t.name, description: t.description, active: t.active, items: t.items })) };
  }, { revalidate: false });
}

export async function standardLinesAction(stage: Stage) {
  return wrap(async () => {
    await requireViewer();
    return standardLines(stage);
  }, { revalidate: false });
}

export async function bulkAssignAction(input: AssignmentInput) {
  return wrap(async () => bulkAssign(await requireViewer(), input));
}

// Change the checklist on one item's current stage (item page).
export async function setItemChecklistAction(itemId: string, templateId: string | null) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const a = await currentAttempt(itemId);
    if (!a) throw new WorkflowError("INVALID_STATE", "This item is not in production.");
    if (!canAssign(viewer, a.stage)) throw new WorkflowError("FORBIDDEN", `Only the ${a.stage} lead or a planner can change this checklist.`);
    await setWorkChecklist({ actor: viewer }, itemId, a.stage, { templateId, assignedTo: a.owner_id });
  });
}

export async function verifyChecklistAction(itemId: string, key: string, verified: boolean) {
  return wrap(async () => verifyChecklistItem(await requireViewer(), itemId, key, verified));
}

export async function createHandoverAction(input: { itemIds: string[]; toUserId?: string | null; note?: string | null }) {
  return wrap(async () => createHandover(await requireViewer(), input));
}

export async function decideHandoverAction(handoverId: string, input: { itemIds: string[]; decision: "accepted" | "missing"; note?: string | null }) {
  return wrap(async () => decideHandover(await requireViewer(), handoverId, input));
}

export async function cancelHandoverAction(id: string) {
  return wrap(async () => cancelHandover(await requireViewer(), id));
}

export async function updateHandoverNoteAction(id: string, note: string) {
  return wrap(async () => updateHandoverNote(await requireViewer(), id, note));
}

// What the New handover dialog needs: the person's items that can be handed over and the possible receivers.
export async function handoverSetupAction() {
  return wrap(async () => {
    const viewer = await requireViewer();
    const [candidates, directory] = await Promise.all([handoverCandidates(viewer), userDirectory()]);
    const receivers = Object.fromEntries(STAGES.map((s) => [s, directory.filter((u) => u.roles.includes(s)).map((u) => ({ id: u.id, name: u.name }))]));
    return { candidates, receivers };
  }, { revalidate: false });
}
