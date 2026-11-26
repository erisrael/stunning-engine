"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as ops from "@/server/people-ops";
import type { Position, Stage } from "@/lib/domain";

// Every action checks on the server that the person is the Operations head (or Admin) and that the change stays
// inside what Admin let Operations manage (see people-ops.ts).

export async function setOpsRolesAction(userId: string, roles: string[]) {
  return wrap(async () => ops.setManagedRoles(await requireViewer(), userId, roles));
}
export async function setOpsPositionAction(dept: string, userId: string, position: Position | "remove") {
  return wrap(async () => ops.setManagedPosition(await requireViewer(), dept, userId, position));
}
export async function setOpsStageLeadAction(stage: Stage, userId: string, lead: boolean) {
  return wrap(async () => ops.setManagedStageLead(await requireViewer(), stage, userId, lead));
}
export async function savePeopleOpsConfigAction(config: ops.PeopleOpsConfig) {
  return wrap(async () => ops.savePeopleOpsConfig(await requireViewer(), config));
}
