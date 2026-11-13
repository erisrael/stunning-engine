import { requireCapability } from "@/server/auth";
import { assistantConfig, assistantStats } from "@/server/assistant";
import { PageHeader } from "@/components/app/primitives";
import { roleCatalog } from "@/server/role-catalog";
import { FLOWS } from "@/lib/assistant";
import { allRoleOptions } from "@/server/assistant";
import { routinesConfig } from "@/server/routines";
import { OPS } from "@/server/assistant-ops";
import { AI_MODELS, aiConfig, aiCosts, aiUsage, listAiModels } from "@/server/assistant-ai";
import { getHrAiConfig } from "@/server/hr-ai";
import { AssistantTabsClient } from "./assistant-tabs-client";

export const metadata = { title: "Assistant" };

// Admin, Assistant (Phase 13): which flows are on for which roles, extra keywords, short answers; and how the
// assistant is used: flows started and finished, where people give up, what matched nothing.
export default async function AssistantAdminPage() {
  const viewer = await requireCapability("users.manage");
  const [cfg, stats, ai, usage, roleOpts, rc, savedModels, roles, hrAi, costs] = await Promise.all([
    assistantConfig(),
    assistantStats(viewer),
    aiConfig(),
    aiUsage(viewer),
    allRoleOptions(),
    routinesConfig(),
    listAiModels(viewer),
    roleCatalog(),
    getHrAiConfig(),
    aiCosts(viewer, 30),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Assistant"
        description="The guide in the corner of every page, by typing or by voice. It follows written flows; with AI answers on, the assistant answers questions from each person's own data, manages HR workflows, and prepares actions they confirm."
      />
      <AssistantTabsClient
        aiConfig={ai}
        usage={usage}
        models={AI_MODELS.map((m) => ({ id: m.id, label: m.label, provider: m.provider }))}
        savedModels={savedModels}
        roles={roles}
        roleOpts={roleOpts}
        rc={rc}
        ops={OPS.map((o) => ({ key: o.key, label: o.label, group: o.group }))}
        cfg={cfg}
        stats={stats}
        flows={FLOWS.map((f) => ({ key: f.key, title: f.title, keywords: f.keywords }))}
        hrAiConfig={hrAi}
        costs={costs}
      />
    </div>
  );
}
