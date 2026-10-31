"use server";

import { requireCapability } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { resolveErrors, saveOpsConfig, testAlert, type OpsConfig } from "@/server/ops";
import { runBackup, saveBackupConfig, testRestore, type BackupConfig } from "@/server/backups";
import { runScheduledChecks } from "@/server/jobs";

export async function saveOpsConfigAction(input: OpsConfig & { telegramToken?: string | null }) {
  return wrap(async () => saveOpsConfig(await requireCapability("users.manage"), input));
}

export async function testAlertAction() {
  return wrap(async () => testAlert(await requireCapability("users.manage")));
}

export async function resolveErrorsAction(ids: string[]) {
  return wrap(async () => resolveErrors(await requireCapability("users.manage"), ids));
}

export async function saveBackupConfigAction(input: BackupConfig & { passphrase?: string | null; s3Secret?: string | null }) {
  return wrap(async () => saveBackupConfig(await requireCapability("users.manage"), input));
}

export async function backupNowAction() {
  return wrap(async () => runBackup(await requireCapability("users.manage")));
}

export async function testRestoreAction() {
  return wrap(async () => testRestore(await requireCapability("users.manage")));
}

export async function runJobsNowAction() {
  return wrap(async () => {
    await requireCapability("users.manage");
    return runScheduledChecks(undefined, { trigger: "admin", force: true });
  });
}
