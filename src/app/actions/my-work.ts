"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { decideTakes, saveTakeRules, setTakeLimit, takeParts, type TakeRules } from "@/server/my-work";
import type { Stage } from "@/lib/domain";

export async function takePartsAction(parts: { id: string; stage: Stage }[]) {
  return wrap(async () => takeParts(await requireViewer(), parts));
}
export async function setTakeLimitAction(n: number) {
  return wrap(async () => setTakeLimit(await requireViewer(), n));
}
export async function saveTakeRulesAction(rules: Partial<TakeRules>) {
  return wrap(async () => saveTakeRules(await requireViewer(), rules));
}
export async function decideTakesAction(ids: string[], approve: boolean, note?: string) {
  return wrap(async () => decideTakes(await requireViewer(), ids, approve, note));
}
