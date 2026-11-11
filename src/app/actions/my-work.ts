"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { setTakeLimit, takeParts } from "@/server/my-work";
import type { Stage } from "@/lib/domain";

export async function takePartsAction(parts: { id: string; stage: Stage }[]) {
  return wrap(async () => takeParts(await requireViewer(), parts));
}
export async function setTakeLimitAction(n: number) {
  return wrap(async () => setTakeLimit(await requireViewer(), n));
}
