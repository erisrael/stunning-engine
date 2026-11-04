"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as cf from "@/server/curriculum-fix";
import * as aa from "@/server/auto-assign";
import type { Stage } from "@/lib/domain";

// Every action checks the person's rights (see curriculum-fix.ts and auto-assign.ts).
export async function renameItemAction(itemId: string, title: string) {
  return wrap(async () => cf.renameItem(await requireViewer(), itemId, title));
}
export async function renamePartAction(id: string, title: string) {
  return wrap(async () => cf.renamePart(await requireViewer(), id, title));
}
export async function renameUnitAction(id: string, title: string) {
  return wrap(async () => cf.renameUnit(await requireViewer(), id, title));
}
export async function renameSubjectAction(id: string, name: string) {
  return wrap(async () => cf.renameSubject(await requireViewer(), id, name));
}
export async function renumberAction(kind: "unit" | "part", id: string, number: number) {
  return wrap(async () => cf.renumber(await requireViewer(), kind, id, number));
}
export async function moveSubjectAction(input: Parameters<typeof cf.moveSubject>[1]) {
  return wrap(async () => cf.moveSubject(await requireViewer(), input));
}
export async function mergeSubjectAction(input: Parameters<typeof cf.mergeSubject>[1]) {
  return wrap(async () => cf.mergeSubject(await requireViewer(), input));
}
export async function moveUnitAction(input: Parameters<typeof cf.moveUnit>[1]) {
  return wrap(async () => cf.moveUnit(await requireViewer(), input));
}
export async function movePartAction(input: Parameters<typeof cf.movePart>[1]) {
  return wrap(async () => cf.movePart(await requireViewer(), input));
}
export async function applyIssueAction(id: string, typed?: string | null) {
  return wrap(async () => cf.applyIssue(await requireViewer(), id, typed));
}
export async function applyAllSuggestionsAction(kinds: cf.IssueKind[]) {
  return wrap(async () => cf.applyAllSuggestions(await requireViewer(), kinds));
}
export async function saveCurriculumConfigAction(input: Partial<cf.CurriculumConfig>) {
  return wrap(async () => cf.saveCurriculumConfig(await requireViewer(), input));
}
export async function saveAutoAssignAction(stage: Stage, input: aa.StageAutoAssign) {
  return wrap(async () => aa.saveAutoAssign(await requireViewer(), stage, input));
}
export async function runAutoAssignAction(stage: Stage) {
  return wrap(async () => aa.runAutoAssign(await requireViewer(), stage));
}
