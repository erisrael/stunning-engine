// How handovers work in this workspace (Handovers, Settings): whether a rejection is cross-checked and by whom, what
// priority rejected work comes back with, and whether booking a studio is off, optional or required.

import { get, nowIso, parseJson, run } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

export type HandoverConfig = {
  crossCheck: boolean;
  checker: "sender_lead" | "receiver_lead" | "manager";
  // The person who rejected may also check it (for very small teams).
  allowSelfCheck: boolean;
  rejectedPriority: "keep" | "high" | "urgent";
  studioBooking: "off" | "optional" | "required";
};

export const DEFAULT_HANDOVER_CONFIG: HandoverConfig = { crossCheck: true, checker: "sender_lead", allowSelfCheck: false, rejectedPriority: "high", studioBooking: "optional" };

export async function handoverConfig(): Promise<HandoverConfig> {
  const v = parseJson<Partial<HandoverConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.handover'"))?.value, {});
  return { ...DEFAULT_HANDOVER_CONFIG, ...v };
}

export async function saveHandoverConfig(user: AppUser, input: Partial<HandoverConfig>) {
  if (!can(user, "settings.manage") && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin changes how handovers work.");
  const cur = await handoverConfig();
  const next: HandoverConfig = {
    crossCheck: input.crossCheck ?? cur.crossCheck,
    checker: input.checker && ["sender_lead", "receiver_lead", "manager"].includes(input.checker) ? input.checker : cur.checker,
    allowSelfCheck: input.allowSelfCheck ?? cur.allowSelfCheck,
    rejectedPriority: input.rejectedPriority && ["keep", "high", "urgent"].includes(input.rejectedPriority) ? input.rejectedPriority : cur.rejectedPriority,
    studioBooking: input.studioBooking && ["off", "optional", "required"].includes(input.studioBooking) ? input.studioBooking : cur.studioBooking,
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.handover', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.handover", summary: `${user.name} changed how handovers work`, oldValue: cur, newValue: next });
  return next;
}
