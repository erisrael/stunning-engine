"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as C from "@/server/support-center";

// Customer support's configuration center (Update 1.2, spec 14.2).
export const saveCenterConfigAction = async (input: Partial<C.CenterConfig>) => wrap(async () => C.saveCenterConfig(await requireViewer(), input));
