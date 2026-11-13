"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { can } from "@/server/users";
import { WorkflowError } from "@/server/workflow";

// The integrations hub (Update 1.0, phase 7). Every action checks Admin on the server.

export async function setIntegrationOwnerAction(key: string, userId: string | null) {
  return wrap(async () => (await import("@/server/integrations-hub")).setIntegrationOwner(await requireViewer(), key, userId));
}
export async function saveAlertRulesAction(input: { on?: boolean; failurePct?: number; minCalls?: number; windowMin?: number }) {
  return wrap(async () => (await import("@/server/call-monitor")).saveAlertRules(await requireViewer(), input));
}
export async function setConnectorOrderAction(capability: string, ids: string[]) {
  return wrap(async () => (await import("@/server/connectors")).setConnectorOrder(await requireViewer(), capability as Parameters<typeof import("@/server/connectors").setConnectorOrder>[1], ids));
}
export async function saveSmsConfigAction(input: Parameters<typeof import("@/server/sms").saveSmsConfig>[1]) {
  return wrap(async () => {
    const r = await (await import("@/server/sms")).saveSmsConfig(await requireViewer(), input);
    return { retries: r.retries, templates: r.templates.length };
  });
}
export async function smsBalanceAction(connectorId: string) {
  return wrap(async () => (await import("@/server/sms")).smsBalance(await requireViewer(), connectorId), { revalidate: false });
}
export async function testSmsAction(input: { to: string; purpose: "otp" | "alerts" | "marketing"; template?: string | null }) {
  return wrap(async () => {
    const user = await requireViewer();
    if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sends test messages.");
    const sms = await import("@/server/sms");
    const r = await sms.sendSmsMessage({ to: input.to, purpose: input.purpose, ...(input.template ? { template: input.template, vars: { name: user.name, code: "123456" } } : { message: `Test from MySeed (${input.purpose}).` }) });
    return r;
  });
}
export async function checkEmailDnsAction(domain: string) {
  return wrap(async () => {
    const user = await requireViewer();
    if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin checks the domain.");
    return (await import("@/server/email-health")).checkEmailDns(domain);
  }, { revalidate: false });
}
export async function testEmailAction(to: string) {
  return wrap(async () => {
    const user = await requireViewer();
    if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sends test emails.");
    const { recordCall } = await import("@/server/call-monitor");
    const t0 = Date.now();
    try {
      await (await import("@/server/email")).testSmtp(user, null, to);
      await recordCall({ source: "email", ok: true, status: 200, ms: Date.now() - t0, summary: "Test email", test: true });
    } catch (e) {
      await recordCall({ source: "email", ok: false, status: 0, ms: Date.now() - t0, summary: "Test email", error: e instanceof Error ? e.message : String(e), test: true });
      throw e;
    }
  });
}
export async function newEmailEventsTokenAction() {
  return wrap(async () => (await import("@/server/email-health")).newEmailEventsToken(await requireViewer()));
}
