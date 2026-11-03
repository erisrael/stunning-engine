"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as pf from "@/server/performance";

// Performance management (Phase 17). Rights are checked on the server.
export async function savePerfConfigAction(input: Partial<pf.PerfConfig>) {
  return wrap(async () => pf.savePerfConfig(await requireViewer(), input));
}
export async function saveKpiAction(input: Parameters<typeof pf.saveKpi>[1]) {
  return wrap(async () => pf.saveKpi(await requireViewer(), input));
}
export async function saveTemplateAction(input: Parameters<typeof pf.saveTemplate>[1]) {
  return wrap(async () => pf.saveTemplate(await requireViewer(), input));
}
export async function setTargetAction(input: Parameters<typeof pf.setTarget>[1]) {
  return wrap(async () => pf.setTarget(await requireViewer(), input));
}
export async function enterValueAction(input: Parameters<typeof pf.enterValue>[1]) {
  return wrap(async () => pf.enterValue(await requireViewer(), input));
}
export async function decideChangeAction(kind: "target" | "value", id: string, approve: boolean) {
  return wrap(async () => pf.decideChange(await requireViewer(), kind, id, approve));
}
export async function closePeriodAction(period: string) {
  return wrap(async () => pf.closePeriod(await requireViewer(), period));
}
export async function reopenPeriodAction(period: string) {
  return wrap(async () => pf.reopenPeriod(await requireViewer(), period));
}
export async function saveCycleAction(input: Parameters<typeof pf.saveCycle>[1]) {
  return wrap(async () => pf.saveCycle(await requireViewer(), input));
}
export async function saveObjectiveAction(input: Parameters<typeof pf.saveObjective>[1]) {
  return wrap(async () => pf.saveObjective(await requireViewer(), input));
}
export async function saveKeyResultAction(input: Parameters<typeof pf.saveKeyResult>[1]) {
  return wrap(async () => pf.saveKeyResult(await requireViewer(), input));
}
export async function checkInAction(krId: string, input: Parameters<typeof pf.checkIn>[2]) {
  return wrap(async () => pf.checkIn(await requireViewer(), krId, input));
}
export async function closeObjectiveAction(id: string, reflection: string) {
  return wrap(async () => pf.closeObjective(await requireViewer(), id, reflection));
}
export async function linkTaskAction(krId: string, code: string) {
  return wrap(async () => pf.linkTask(await requireViewer(), krId, code));
}
