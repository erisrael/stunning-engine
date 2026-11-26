// Text messages for Correspondence (optional): approvals and signatures waiting, overdue steps, failed deliveries.
// Admin switches each on (Correspondence, Setup); they go through the SMS providers set for "alerts", to the phone in
// the person's profile, and not to people who muted approval notifications.

import { all, get, nowIso, parseJson, run } from "../db";
import { WorkflowError } from "../workflow";
import type { AppUser } from "../users";
import { audit, corrCan } from "./core";

export type CorrNotifyConfig = { smsApprovals: boolean; smsOverdue: boolean; smsDelivery: boolean };
const DEFAULTS: CorrNotifyConfig = { smsApprovals: false, smsOverdue: false, smsDelivery: false };

export async function corrNotifyConfig(): Promise<CorrNotifyConfig> {
  return { ...DEFAULTS, ...parseJson<Partial<CorrNotifyConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.corr_notify'"))?.value, {}) };
}

export async function saveCorrNotifyConfig(user: AppUser, input: CorrNotifyConfig) {
  if (!corrCan(user, "admin")) throw new WorkflowError("FORBIDDEN", "Only correspondence administrators set text messages.");
  const v: CorrNotifyConfig = { smsApprovals: !!input.smsApprovals, smsOverdue: !!input.smsOverdue, smsDelivery: !!input.smsDelivery };
  await run("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.corr_notify', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by", JSON.stringify(v), nowIso(), user.id);
  await audit(user, null, "notify.config", v);
}

export async function corrSms(userIds: string[], text: string, kind: keyof CorrNotifyConfig) {
  if (!userIds.length) return 0;
  const cfg = await corrNotifyConfig();
  if (!cfg[kind]) return 0;
  const people = await all<{ id: string; phone: string | null; prefs: string }>(`SELECT id, phone, prefs FROM users WHERE active = 1 AND id IN (${userIds.map(() => "?").join(",")})`, ...userIds);
  const { sendSmsMessage } = await import("../sms");
  let n = 0;
  for (const p of people) {
    if (!p.phone || parseJson<{ mutedNotificationTypes?: string[] }>(p.prefs, {}).mutedNotificationTypes?.includes("approval")) continue;
    try {
      await sendSmsMessage({ to: p.phone, message: text.slice(0, 300), purpose: "alerts" });
      n++;
    } catch {
      /* an SMS is a courtesy: the in-app notification is already there */
    }
  }
  return n;
}
