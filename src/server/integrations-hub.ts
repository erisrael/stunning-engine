import { all, get } from "./db";
import { getMeta, setMeta } from "./settings";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { sourceStats, type SourceStat } from "./call-monitor";

// The integrations hub (Update 1.0, phase 7): one card per integration with its status, keys, last test, calls and
// failures in the last day, last callback, and who owns it.

export const INTEGRATIONS = [
  { key: "payments", label: "Payments", sources: ["chapa", "payment"], href: "/finance/chapa?tab=settings" },
  { key: "sms", label: "Messaging (SMS)", sources: ["sms"], href: "/admin/integrations?tab=sms" },
  { key: "email", label: "Email", sources: ["email"], href: "/admin/integrations?tab=email" },
  { key: "ai", label: "AI", sources: ["ai"], href: "/admin/assistant?tab=usage" },
  { key: "telegram", label: "Telegram", sources: ["telegram"], href: "/admin?tab=customer-support" },
  { key: "attendance", label: "Attendance devices", sources: [], href: "/attendance?tab=capture" },
  { key: "noor", label: "Noor CMS", sources: ["noor"], href: "/admin?tab=legacy-cms" },
] as const;
export type IntegrationKey = (typeof INTEGRATIONS)[number]["key"];

export type Health = "healthy" | "degraded" | "failing" | "not_set_up";
export type IntegrationCard = {
  key: IntegrationKey;
  label: string;
  href: string;
  health: Health;
  setup: string;
  keys: number;
  lastTest: { ok: boolean; at: string } | null;
  calls: number;
  failures: number;
  failurePct: number;
  lastIn: string | null;
  lastError: string | null;
  owner: { id: string; name: string } | null;
};

async function owners(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await getMeta("integrations.owners")) ?? "{}");
  } catch {
    return {};
  }
}

export async function setIntegrationOwner(user: AppUser, key: string, userId: string | null) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets owners.");
  const item = INTEGRATIONS.find((i) => i.key === key);
  if (!item) throw new WorkflowError("VALIDATION", "Unknown integration.");
  const u = userId ? await get<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ? AND active = 1", userId) : null;
  if (userId && !u) throw new WorkflowError("VALIDATION", "Choose an active person.");
  const o = await owners();
  if (u) o[key] = u.id;
  else delete o[key];
  await setMeta("integrations.owners", JSON.stringify(o));
  await audit({ actor: user }, { action: "settings.integrations", summary: `${user.name} set the owner of ${item.label} to ${u?.name ?? "nobody"}` });
}

const lastTestOf = async (capability: string) => get<{ ok: number; at: string }>("SELECT ok, at FROM int_calls WHERE COALESCE(source, capability) = ? AND test = 1 ORDER BY at DESC LIMIT 1", capability);

export async function integrationsOverview(user: AppUser): Promise<IntegrationCard[]> {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees integrations.");
  const stats = await sourceStats(24);
  const stat = (sources: readonly string[]) =>
    sources.map((s) => stats.find((x) => x.source === s)).filter((x): x is SourceStat => !!x).reduce(
      (t, s) => ({ calls: t.calls + s.calls, failures: t.failures + s.failures, lastIn: [t.lastIn, s.lastIn].filter(Boolean).sort().pop() ?? null, lastError: t.lastError ?? s.lastError }),
      { calls: 0, failures: 0, lastIn: null as string | null, lastError: null as string | null },
    );
  const own = await owners();
  const people = await all<{ id: string; name: string }>("SELECT id, name FROM users WHERE id IN (" + (Object.values(own).map(() => "?").join(",") || "''") + ")", ...Object.values(own));

  const { listConnectors } = await import("./connectors");
  const connectors = await listConnectors(user);
  const active = (cap: string) => connectors.filter((c) => c.capability === cap && c.status === "active");
  const connTest = (cap: string) => active(cap).map((c) => c.lastTest).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.at.localeCompare(a.at)).map((x) => ({ ok: x.ok, at: x.at }))[0] ?? null;

  const { smtpSettings } = await import("./email");
  const { aiConfig, listAiModels } = await import("./assistant-ai");
  const { telegramInfo } = await import("./support-channels");
  const { getLegacyCmsConfig } = await import("./legacy-cms");
  const [smtp, ai, aiModels, tg, noor] = await Promise.all([smtpSettings(), aiConfig(), listAiModels(user).catch(() => []), telegramInfo(), getLegacyCmsConfig()]);
  const chapa = await get<{ n: number }>("SELECT COUNT(*) AS n FROM chapa_accounts WHERE active = 1");
  const kiosks = await get<{ n: number; paired: number; silent: number }>(
    "SELECT COUNT(*) AS n, SUM(CASE WHEN token_hash IS NOT NULL THEN 1 ELSE 0 END) AS paired, SUM(CASE WHEN token_hash IS NOT NULL AND (last_seen_at IS NULL OR last_seen_at < ?) THEN 1 ELSE 0 END) AS silent FROM att_kiosks WHERE active = 1",
    new Date(Date.now() - 30 * 60e3).toISOString(),
  );
  const t = (x: { ok: number; at: string } | undefined | null) => (x ? { ok: !!x.ok, at: x.at } : null);

  const setupOf: Record<IntegrationKey, { keys: number; setup: string; lastTest: { ok: boolean; at: string } | null; extraFail?: boolean }> = {
    payments: { keys: Number(chapa?.n ?? 0) + active("payment").length, setup: `${Number(chapa?.n ?? 0)} Chapa business${Number(chapa?.n ?? 0) === 1 ? "" : "es"}, ${active("payment").length} other payment connector${active("payment").length === 1 ? "" : "s"}`, lastTest: t(await lastTestOf("chapa")) ?? connTest("payment") },
    sms: { keys: active("sms").length, setup: active("sms").length ? `${active("sms").length} provider${active("sms").length === 1 ? "" : "s"} in order` : "No SMS provider", lastTest: connTest("sms") },
    email: { keys: (smtp.source === "none" ? 0 : 1) + active("email").length, setup: smtp.source === "none" ? (active("email").length ? `${active("email").length} email connector${active("email").length === 1 ? "" : "s"}` : "No mail server") : smtp.relay ? `Relay ${smtp.relay}${active("email").length ? ` + ${active("email").length} connector${active("email").length === 1 ? "" : "s"}` : ""}` : `Mail server ${smtp.host}`, lastTest: t(await lastTestOf("email")) ?? connTest("email") },
    ai: { keys: aiModels.length + (ai.hasKey ? 1 : 0), setup: ai.on ? `On: ${ai.provider} ${ai.model}` : "Off", lastTest: t(await lastTestOf("ai")) },
    telegram: { keys: tg.connected ? 1 : 0, setup: tg.connected ? (tg.bot ? `Bot @${tg.bot}` : "Bot connected") : "No bot", lastTest: null },
    attendance: { keys: Number(kiosks?.paired ?? 0), setup: `${Number(kiosks?.paired ?? 0)} of ${Number(kiosks?.n ?? 0)} kiosks paired${Number(kiosks?.silent ?? 0) ? `, ${kiosks?.silent} not reporting` : ""}`, lastTest: null, extraFail: Number(kiosks?.silent ?? 0) > 0 },
    noor: { keys: noor.hasPassword || noor.hasSessionCookie ? 1 : 0, setup: noor.lastSyncedAt ? `Last sync ${noor.lastSyncedAt.slice(0, 16).replace("T", " ")} (${noor.lastSyncStatus})` : "Never synced", lastTest: null, extraFail: noor.lastSyncStatus === "error" },
  };

  return INTEGRATIONS.map((i) => {
    const s = stat(i.sources);
    const su = setupOf[i.key];
    const failurePct = s.calls ? Math.round((s.failures / s.calls) * 1000) / 10 : 0;
    const health: Health = !su.keys && !s.calls ? "not_set_up" : (s.calls >= 3 && failurePct >= 50) || su.lastTest?.ok === false ? "failing" : failurePct >= 10 || su.extraFail ? "degraded" : "healthy";
    const ownerId = own[i.key];
    return { key: i.key, label: i.label, href: i.href, health, setup: su.setup, keys: su.keys, lastTest: su.lastTest, calls: s.calls, failures: s.failures, failurePct, lastIn: s.lastIn, lastError: s.lastError, owner: ownerId ? (people.find((p) => p.id === ownerId) ?? null) : null };
  });
}
