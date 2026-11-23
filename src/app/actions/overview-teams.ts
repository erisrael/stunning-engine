"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { saveOverviewTeams, type OverviewTeams } from "@/server/overview-teams";

export async function saveOverviewTeamsAction(input: OverviewTeams) {
  return wrap(async () => saveOverviewTeams(await requireViewer(), input));
}
