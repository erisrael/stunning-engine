import Link from "next/link";
import { requireCapability } from "@/server/auth";
import { PageHeader } from "@/components/app/primitives";
import { all } from "@/server/db";
import { appOrigin } from "@/server/password-reset";
import { SOURCES, monitorData } from "@/server/call-monitor";
import { integrationsOverview } from "@/server/integrations-hub";
import { ConnectorOrder, EmailSetup, HubOverview, Monitor, SmsSetup } from "@/components/app/integrations/hub-ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Integrations hub" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "monitor", label: "Call monitor" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
  { key: "connections", label: "Connections" },
] as const;

// Admin, Integrations hub (Update 1.0, phase 7): every integration's health in one place, the monitor of every call
// and callback, and the setup of SMS, email and the order connections fall back in.
export default async function IntegrationsHubPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireCapability("users.manage");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const origin = await appOrigin();

  let panel: React.ReactNode = null;
  if (tab === "overview") {
    const people = await all<{ id: string; name: string }>("SELECT DISTINCT u.id, u.name FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE u.active = 1 ORDER BY u.name");
    panel = <HubOverview cards={await integrationsOverview(viewer)} people={people} />;
  } else if (tab === "monitor") {
    const data = await monitorData(viewer, { source: sp.source ?? null, direction: sp.dir ?? null, failed: sp.failed === "1", q: sp.q ?? null, hours: Number(sp.hours) || 24 });
    panel = <Monitor data={data} sources={SOURCES.map((s) => ({ key: s.key, label: s.label }))} />;
  } else if (tab === "sms") {
    const sms = await import("@/server/sms");
    const data = await sms.smsOverview(viewer);
    panel = <SmsSetup data={{ ...data, lastReport: await sms.lastDeliveryReport() }} dlrUrl={`${origin}/api/integrations/sms/dlr?t=${data.config.dlrToken}`} />;
  } else if (tab === "email") {
    const eh = await import("@/server/email-health");
    const s = await eh.emailSetupSteps(viewer);
    panel = <EmailSetup steps={s.steps} eventsUrl={`${origin}${s.eventsPath}`} domain={s.domain} bounces={await eh.listBounces(viewer)} />;
  } else {
    const C = await import("@/server/connectors");
    const { notionStatus } = await import("@/server/notion");
    const { IntegrationsHub } = await import("@/components/app/integrations-hub");
    const { IntegrationsAdmin } = await import("@/components/app/integrations");
    const { DATASETS, listTokens } = await import("@/server/feeds");
    const order = async (cap: "email" | "payment") => (await C.connectorsFor(cap)).map((c) => ({ id: c.id, name: c.name, lastTest: c.lastTest ? { ok: c.lastTest.ok, at: c.lastTest.at } : null }));
    panel = (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <ConnectorOrder capability="email" title="Email connections, in order" list={await order("email")} />
          <ConnectorOrder capability="payment" title="Payment connections, in order" list={await order("payment")} />
        </div>
        <IntegrationsHub
          datasets={Object.entries(DATASETS).map(([k, v]) => ({ key: k, label: v.label }))}
          notion={await notionStatus()}
          connectors={await C.listConnectors(viewer)}
          presets={C.PRESETS.map((x) => ({ key: x.key, name: x.name, capability: x.capability, region: x.region, docsUrl: x.docsUrl ?? null, secrets: x.secrets }))}
          calls={await C.callLog(viewer, 40)}
        />
        <IntegrationsAdmin tokens={await listTokens(viewer)} datasets={Object.fromEntries(Object.entries(DATASETS).map(([k, v]) => [k, v.label])) as Parameters<typeof IntegrationsAdmin>[0]["datasets"]} origin={origin} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Integrations hub" description="Payments, messaging, email, AI, Telegram, attendance devices and Noor CMS: their health, every call and callback, and their setup." />
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Integrations hub">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/integrations?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {panel}
    </div>
  );
}
