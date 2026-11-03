"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as sp from "@/server/strategy";

// Strategy and M&E (Phase 25). Rights are checked in the server module.
export async function savePlanAction(input: Parameters<typeof sp.savePlan>[1]) {
  return wrap(async () => sp.savePlan(await requireViewer(), input));
}
export async function deletePlanAction(id: string) {
  return wrap(async () => sp.deletePlan(await requireViewer(), id));
}
export async function examplePlanAction() {
  return wrap(async () => sp.examplePlan(await requireViewer()));
}
export async function saveNodeAction(input: Parameters<typeof sp.saveNode>[1]) {
  return wrap(async () => sp.saveNode(await requireViewer(), input));
}
export async function deleteNodeAction(id: string) {
  return wrap(async () => sp.deleteNode(await requireViewer(), id));
}
export async function saveIndicatorAction(input: Parameters<typeof sp.saveIndicator>[1]) {
  return wrap(async () => sp.saveIndicator(await requireViewer(), input));
}
export async function deleteIndicatorAction(id: string) {
  return wrap(async () => sp.deleteIndicator(await requireViewer(), id));
}
export async function enterActualAction(input: Parameters<typeof sp.enterActual>[1]) {
  return wrap(async () => sp.enterActual(await requireViewer(), input));
}
export async function verifyActualAction(indicatorId: string, period: string) {
  return wrap(async () => sp.verifyActual(await requireViewer(), indicatorId, period));
}
export async function refreshAutoAction(planId: string) {
  return wrap(async () => {
    const v = await requireViewer();
    if (!sp.managesStrategy(v)) throw new Error("Only planners refresh results.");
    return sp.refreshAuto(planId);
  });
}
export async function saveRiskAction(input: Parameters<typeof sp.saveRisk>[1]) {
  return wrap(async () => sp.saveRisk(await requireViewer(), input));
}
export async function deleteRiskAction(id: string) {
  return wrap(async () => sp.deleteRisk(await requireViewer(), id));
}
export async function saveEvaluationAction(input: Parameters<typeof sp.saveEvaluation>[1]) {
  return wrap(async () => sp.saveEvaluation(await requireViewer(), input));
}
export async function deleteEvaluationAction(id: string) {
  return wrap(async () => sp.deleteEvaluation(await requireViewer(), id));
}
