"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as gh from "@/server/github";
import * as feeds from "@/server/feeds";
import * as acc from "@/server/accounting";
import { saveSidebarDefaults } from "@/server/ui-prefs";
import type { Role } from "@/lib/domain";

// Every action checks department rights or Admin on the server (github.ts, feeds.ts, accounting.ts, ui-prefs.ts).

export async function saveGithubAction(dept: string, input: { token?: string | null; clearToken?: boolean; repos: { fullName: string; projectId?: string | null }[] }) {
  return wrap(async () => gh.saveGithubSettings(await requireViewer(), dept, input));
}
export async function refreshGithubAction(dept: string) {
  return wrap(async () => void (await gh.githubOverview(await requireViewer(), dept, { force: true })));
}
export async function createTokenAction(input: { name: string; datasets: string[] }) {
  return wrap(async () => feeds.createToken(await requireViewer(), input));
}
export async function revokeTokenAction(id: string) {
  return wrap(async () => feeds.revokeToken(await requireViewer(), id));
}
export async function saveAccountingMapAction(dept: string, input: acc.AccountingMap) {
  return wrap(async () => acc.saveAccountingMap(await requireViewer(), dept, input));
}
export async function accountingExportAction(dept: string, input: { format: acc.AccountingFormat; from: string; to: string }) {
  return wrap(async () => acc.accountingExport(await requireViewer(), dept, input), { revalidate: false });
}
export async function saveSidebarDefaultsAction(role: Role, hidden: string[]) {
  return wrap(async () => saveSidebarDefaults(await requireViewer(), role, hidden));
}
