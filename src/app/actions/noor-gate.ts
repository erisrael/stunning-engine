"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as G from "@/server/noor-gate";

// Noor's protection (Admin, Legacy CMS, Noor protection).
export const noorGateStatusAction = async () => wrap(async () => G.noorGateStatus(await requireViewer()), { revalidate: false });
export const saveNoorGateAction = async (input: Partial<G.NoorGateConfig>) => wrap(async () => G.saveNoorGate(await requireViewer(), input));
export const pauseNoorAction = async (minutes: number) => wrap(async () => G.pauseNoor(await requireViewer(), minutes));
